use crate::{
    db::Index,
    domain::{DocumentInput, DocumentSummary, SearchQuery, SonataDocument},
    errors::{Result, SonataError},
    indexer, markdown, relations,
    workspace::Workspace,
};
use serde::Serialize;
#[cfg(windows)]
use std::process::Command;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, State};
pub struct Session {
    pub workspace: Workspace,
    pub index: Index,
}
pub struct AppState(pub Mutex<Option<Session>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    path: String,
    name: String,
    media_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data_url: Option<String>,
}

fn attachment_path(workspace: &Workspace, relative: &str) -> Result<PathBuf> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() || !relative_path.starts_with("attachments") {
        return Err(SonataError::PermissionDenied(
            "attachment is outside the workspace attachments folder".into(),
        ));
    }
    let target = workspace.root.join(relative_path).canonicalize()?;
    let root = workspace.root.join("attachments").canonicalize()?;
    if !target.starts_with(&root) {
        return Err(SonataError::PermissionDenied(
            "attachment is outside the workspace attachments folder".into(),
        ));
    }
    Ok(target)
}

fn media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn attachment_details(relative: String, target: &Path) -> Result<Attachment> {
    let media_type = media_type(target).to_string();
    let data_url = media_type
        .starts_with("image/")
        .then(|| {
            let data = fs::read(target)?;
            Ok::<_, SonataError>(format!(
                "data:{media_type};base64,{}",
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
            ))
        })
        .transpose()?;
    Ok(Attachment {
        name: target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("attachment")
            .to_string(),
        path: relative,
        media_type,
        data_url,
    })
}
#[tauri::command]
pub fn show_sidebar(app: AppHandle) -> Result<()> {
    crate::windows::sidebar::reveal(&app)
        .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))
}
#[tauri::command]
pub fn hide_sidebar(app: AppHandle) -> Result<()> {
    crate::windows::sidebar::conceal(&app)
        .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))
}
#[tauri::command]
pub fn resize_sidebar(width: u32, app: AppHandle) -> Result<()> {
    crate::windows::sidebar::resize_from_left(&app, width)
        .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))
}
#[tauri::command]
pub fn set_sidebar_resizing(resizing: bool, app: AppHandle) -> Result<()> {
    crate::windows::sidebar::set_resizing(&app, resizing);
    Ok(())
}
#[tauri::command]
pub fn set_sidebar_picker_open(picker_open: bool, app: AppHandle) -> Result<()> {
    crate::windows::sidebar::set_picker_open(&app, picker_open);
    Ok(())
}
fn session<'a>(state: &'a AppState) -> Result<std::sync::MutexGuard<'a, Option<Session>>> {
    let guard = state
        .0
        .lock()
        .map_err(|_| SonataError::WorkspaceUnavailable("state lock failed".into()))?;
    if guard.is_none() {
        return Err(SonataError::WorkspaceUnavailable(
            "Choose or create a workspace first".into(),
        ));
    }
    Ok(guard)
}
#[tauri::command]
pub fn create_workspace(path: String, state: State<AppState>) -> Result<()> {
    let workspace = Workspace::create(PathBuf::from(path))?;
    let index = Index::open(&workspace.db_path())?;
    indexer::rebuild(&workspace, &index)?;
    *state
        .0
        .lock()
        .map_err(|_| SonataError::WorkspaceUnavailable("state lock failed".into()))? =
        Some(Session { workspace, index });
    Ok(())
}
#[tauri::command]
pub fn open_workspace(path: String, state: State<AppState>) -> Result<()> {
    let workspace = Workspace::open(PathBuf::from(path))?;
    let index = Index::open(&workspace.db_path())?;
    indexer::rebuild(&workspace, &index)?;
    *state
        .0
        .lock()
        .map_err(|_| SonataError::WorkspaceUnavailable("state lock failed".into()))? =
        Some(Session { workspace, index });
    Ok(())
}
#[tauri::command]
pub fn list_documents(query: SearchQuery, state: State<AppState>) -> Result<Vec<DocumentSummary>> {
    let guard = session(&state)?;
    guard
        .as_ref()
        .ok_or_else(|| SonataError::WorkspaceUnavailable("no workspace".into()))?
        .index
        .list(&query)
}
#[tauri::command]
pub fn read_document(id: String, state: State<AppState>) -> Result<SonataDocument> {
    let guard = session(&state)?;
    let current = guard.as_ref().unwrap().index.get(&id)?;
    let path = guard.as_ref().unwrap().workspace.root.join(&current.path);
    let mut doc = markdown::parse(&current.path, &fs::read_to_string(path)?)?;
    if doc.id.is_empty() {
        doc.id = id.to_string();
    }
    Ok(doc)
}
#[tauri::command]
pub fn create_document(
    input: DocumentInput,
    state: State<AppState>,
    app: AppHandle,
) -> Result<SonataDocument> {
    let mut guard = session(&state)?;
    let s = guard.as_mut().unwrap();
    let kind = input.document_type.unwrap_or_default();
    let title = input.title.unwrap_or_else(|| "Untitled".into());
    let path = s.workspace.document_path(&kind, &title);
    let relative = path
        .strip_prefix(&s.workspace.root)
        .map_err(|_| SonataError::PermissionDenied("outside workspace".into()))?
        .to_string_lossy()
        .replace('\\', "/");
    let mut doc = markdown::new_document(relative, kind, title, input.body.unwrap_or_default());
    doc.tags = input.tags.unwrap_or_default();
    doc.pinned = input.pinned.unwrap_or(doc.pinned);
    doc.status = input.status.or(doc.status);
    doc.priority = input.priority.or(doc.priority);
    doc.due = input.due;
    doc.reminder = input.reminder;
    doc.parent = input.parent;
    doc.links = input.links;
    doc.stage = input.stage.or(doc.stage);
    doc.bookmark = input.bookmark;
    doc.cover = input.cover;
    // The spec is the authority on what a type carries, not the caller: "note Buy milk
    // @due:tomorrow" stores a note with no due date rather than a note pretending to be a
    // task. Rust enforcing it means the UI showing a stray control is a cosmetic bug, not
    // a data one.
    doc.retain_supported_fields();
    let raw = markdown::serialize(&doc)?;
    markdown::atomic_write(&path, &raw)?;
    doc.content_hash = Some(markdown::hash(&raw));
    s.index.upsert(&doc)?;
    app.emit("workspace:index-updated", &doc.id).ok();
    Ok(doc)
}
#[tauri::command]
pub fn update_document(
    mut document: SonataDocument,
    expected_hash: Option<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<SonataDocument> {
    let mut guard = session(&state)?;
    let s = guard.as_mut().unwrap();
    let path = s.workspace.root.join(&document.path);
    if let Some(expected) = expected_hash {
        if path.exists() && markdown::hash(&fs::read_to_string(&path)?) != expected {
            return Err(SonataError::WriteConflict);
        }
    }
    if document.id.starts_with("external:") {
        document.id = ulid::Ulid::new().to_string();
    }
    document.updated = markdown::now();
    relations::validate_parent(&s.index, &document.id, document.parent.as_deref())?;
    let raw = markdown::serialize(&document)?;
    markdown::atomic_write(&path, &raw)?;
    document.content_hash = Some(markdown::hash(&raw));
    s.index.upsert(&document)?;
    app.emit("document:changed", &document.id).ok();
    Ok(document)
}
#[tauri::command]
pub fn set_parent(
    child_id: String,
    parent_id: Option<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<()> {
    let mut guard = session(&state)?;
    let s = guard.as_mut().unwrap();
    relations::validate_parent(&s.index, &child_id, parent_id.as_deref())?;
    let mut doc = read_raw(s, &child_id)?;
    doc.parent = parent_id;
    doc.updated = markdown::now();
    write_raw(s, &mut doc)?;
    app.emit("document:changed", child_id).ok();
    Ok(())
}
/// Moves `doc`'s file into `dest_folder` (a folder name directly under the workspace root,
/// e.g. "archive" or a `DocumentType::folder()`) and returns the new workspace-relative path.
/// Archiving/trashing can merge documents from several origin folders into one shared
/// destination, so two same-named files (e.g. two never-renamed "New task" captures) can
/// collide there even though each was unique in its own origin folder — pick a free name the
/// same way `Workspace::document_path` does, rather than silently overwriting whatever is
/// already at that path. Kept side-effect-free w.r.t. the index/doc so callers can finish
/// updating `doc` before persisting via `write_raw`.
fn relocate_file(s: &Session, doc: &SonataDocument, dest_folder: &str) -> Result<String> {
    let old = s.workspace.root.join(&doc.path);
    let dest_dir = s.workspace.root.join(dest_folder);
    fs::create_dir_all(&dest_dir)?;
    let file_name = old
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| SonataError::InvalidMetadata("invalid document path".into()))?;
    let (stem, ext) = file_name.split_once('.').unwrap_or((file_name, "md"));
    let mut candidate = dest_dir.join(file_name);
    let mut index = 2;
    while candidate.exists() {
        candidate = dest_dir.join(format!("{stem}-{index}.{ext}"));
        index += 1;
    }
    fs::rename(&old, &candidate)?;
    s.workspace.relative(&candidate)
}

fn archive_doc(s: &mut Session, id: &str) -> Result<()> {
    let mut doc = read_raw(s, id)?;
    doc.archived = true;
    doc.updated = markdown::now();
    doc.path = relocate_file(s, &doc, "archive")?;
    write_raw(s, &mut doc)
}

fn unarchive_doc(s: &mut Session, id: &str) -> Result<()> {
    let mut doc = read_raw(s, id)?;
    doc.archived = false;
    doc.updated = markdown::now();
    let folder = doc.document_type.folder();
    doc.path = relocate_file(s, &doc, folder)?;
    write_raw(s, &mut doc)
}

fn trash_doc(s: &mut Session, id: &str) -> Result<()> {
    let doc = read_raw(s, id)?;
    relocate_file(s, &doc, ".trash")?;
    s.index.remove_path(&doc.path)
}

#[tauri::command]
pub fn archive_document(id: String, state: State<AppState>) -> Result<()> {
    let mut guard = session(&state)?;
    archive_doc(guard.as_mut().unwrap(), &id)
}
#[tauri::command]
pub fn unarchive_document(id: String, state: State<AppState>) -> Result<()> {
    let mut guard = session(&state)?;
    unarchive_doc(guard.as_mut().unwrap(), &id)
}
#[tauri::command]
pub fn move_document_to_trash(id: String, state: State<AppState>) -> Result<()> {
    let mut guard = session(&state)?;
    trash_doc(guard.as_mut().unwrap(), &id)
}
#[derive(Serialize)]
pub struct TagCount {
    tag: String,
    count: i64,
}
#[tauri::command]
pub fn list_tags(state: State<AppState>) -> Result<Vec<TagCount>> {
    let guard = session(&state)?;
    Ok(guard
        .as_ref()
        .unwrap()
        .index
        .tags()?
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect())
}
#[tauri::command]
pub fn list_children(id: String, state: State<AppState>) -> Result<Vec<DocumentSummary>> {
    let guard = session(&state)?;
    guard.as_ref().unwrap().index.children(&id)
}
#[tauri::command]
pub fn list_backlinks(id: String, state: State<AppState>) -> Result<Vec<DocumentSummary>> {
    let guard = session(&state)?;
    guard.as_ref().unwrap().index.backlinks(&id)
}
#[tauri::command]
pub fn rebuild_index(state: State<AppState>) -> Result<()> {
    let guard = session(&state)?;
    let s = guard.as_ref().unwrap();
    indexer::rebuild(&s.workspace, &s.index)
}
#[tauri::command]
pub fn quick_capture(
    text: String,
    state: State<AppState>,
    app: AppHandle,
) -> Result<SonataDocument> {
    create_document(capture_input(&text), state, app)
}
#[tauri::command]
pub fn import_attachment(
    document_id: String,
    source_path: String,
    state: State<AppState>,
) -> Result<Attachment> {
    let guard = session(&state)?;
    let s = guard.as_ref().unwrap();
    s.index.get(&document_id)?;
    if document_id.is_empty()
        || !document_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(SonataError::InvalidMetadata(
            "document ID cannot be used for an attachment path".into(),
        ));
    }
    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(SonataError::InvalidMetadata(
            "selected attachment is not a file".into(),
        ));
    }
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| SonataError::InvalidMetadata("attachment has an invalid filename".into()))?;
    let safe_name: String = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let directory = s.workspace.root.join("attachments").join(&document_id);
    fs::create_dir_all(&directory)?;
    let mut target = directory.join(&safe_name);
    let stem = Path::new(&safe_name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("attachment");
    let extension = Path::new(&safe_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let mut suffix = 2;
    while target.exists() {
        target = directory.join(format!("{stem}-{suffix}{extension}"));
        suffix += 1;
    }
    fs::copy(source, &target)?;
    let relative = s.workspace.relative(&target)?;
    attachment_details(relative, &target)
}
#[tauri::command]
pub fn import_clipboard_image(
    document_id: String,
    media_type: String,
    data_base64: String,
    state: State<AppState>,
) -> Result<Attachment> {
    let extension = match media_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => {
            return Err(SonataError::InvalidMetadata(
                "clipboard image format is not supported".into(),
            ))
        }
    };
    let data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data_base64)
        .map_err(|_| SonataError::InvalidMetadata("clipboard image data is invalid".into()))?;
    if data.is_empty() {
        return Err(SonataError::InvalidMetadata(
            "clipboard image is empty".into(),
        ));
    }

    let guard = session(&state)?;
    let s = guard.as_ref().unwrap();
    s.index.get(&document_id)?;
    if document_id.is_empty()
        || !document_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(SonataError::InvalidMetadata(
            "document ID cannot be used for an attachment path".into(),
        ));
    }
    let directory = s.workspace.root.join("attachments").join(&document_id);
    fs::create_dir_all(&directory)?;
    let mut target = directory.join(format!("clipboard-image.{extension}"));
    let mut suffix = 2;
    while target.exists() {
        target = directory.join(format!("clipboard-image-{suffix}.{extension}"));
        suffix += 1;
    }
    fs::write(&target, data)?;
    let relative = s.workspace.relative(&target)?;
    attachment_details(relative, &target)
}
#[tauri::command]
pub fn read_attachment(path: String, state: State<AppState>) -> Result<Attachment> {
    let guard = session(&state)?;
    let s = guard.as_ref().unwrap();
    let target = attachment_path(&s.workspace, &path)?;
    attachment_details(path, &target)
}
#[tauri::command]
pub fn reveal_attachment_in_explorer(path: String, state: State<AppState>) -> Result<()> {
    let guard = session(&state)?;
    let s = guard.as_ref().unwrap();
    let target = attachment_path(&s.workspace, &path)?;
    #[cfg(windows)]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", target.display()))
            .spawn()
            .map_err(SonataError::Io)?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err(SonataError::WorkspaceUnavailable(
            "Revealing attachments in the system file explorer is only available on Windows".into(),
        ))
    }
}
/// Splits shorthand capture text ("task Buy milk #errand @due:tomorrow") into a
/// `DocumentInput`. The parsed tags belong on the *input* rather than on the document
/// `create_document` hands back: setting them afterwards only decorated the value returned
/// to the caller, so they never reached the Markdown frontmatter or the index and vanished
/// on the next read.
fn capture_input(text: &str) -> DocumentInput {
    let mut words = text.split_whitespace();
    let prefix = words.next().unwrap_or("");
    // One alias table (`TypeSpec::keywords`) serves both this and the frontmatter parser,
    // so capture can never accept a word the type list does not know about.
    let kind = crate::domain::DocumentType::from_keyword(prefix);
    let rest = if kind.is_some() {
        words.collect::<Vec<_>>().join(" ")
    } else {
        text.into()
    };
    // Normalized the same way tags entered through the tag chip input are, so
    // "#Errand" and "#errand" stay one tag rather than two near-duplicates.
    let mut tags: Vec<String> = Vec::new();
    for word in rest.split_whitespace() {
        let Some(raw) = word.strip_prefix('#') else {
            continue;
        };
        let tag = markdown::normalize_tag(raw);
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    let title = rest
        .split_whitespace()
        .filter(|w| !w.starts_with('#') && !w.starts_with("@due:"))
        .collect::<Vec<_>>()
        .join(" ");
    let due = rest
        .split_whitespace()
        .find_map(|w| w.strip_prefix("@due:").map(markdown::resolve_due_keyword));
    DocumentInput {
        document_type: kind,
        title: Some(if title.is_empty() {
            "Untitled".into()
        } else {
            title
        }),
        body: Some(String::new()),
        tags: Some(tags),
        due,
        ..Default::default()
    }
}
fn read_raw(s: &Session, id: &str) -> Result<SonataDocument> {
    let meta = s.index.get(id)?;
    let mut doc = markdown::parse(
        &meta.path,
        &fs::read_to_string(s.workspace.root.join(&meta.path))?,
    )?;
    if doc.id.is_empty() {
        doc.id = id.to_string();
    }
    Ok(doc)
}
fn write_raw(s: &Session, doc: &mut SonataDocument) -> Result<()> {
    let raw = markdown::serialize(doc)?;
    markdown::atomic_write(&s.workspace.root.join(&doc.path), &raw)?;
    doc.content_hash = Some(markdown::hash(&raw));
    s.index.upsert(doc)
}

#[cfg(test)]
mod archive_tests {
    use super::*;
    use crate::domain::DocumentType;

    fn make_session() -> (tempfile::TempDir, Session) {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::create(dir.path().to_path_buf()).unwrap();
        let index = Index::open(&workspace.db_path()).unwrap();
        (dir, Session { workspace, index })
    }

    fn seed_doc(s: &mut Session, kind: DocumentType, title: &str) -> SonataDocument {
        let path = s.workspace.document_path(&kind, title);
        let relative = path
            .strip_prefix(&s.workspace.root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let mut doc = markdown::new_document(relative, kind, title.to_string(), String::new());
        let raw = markdown::serialize(&doc).unwrap();
        markdown::atomic_write(&path, &raw).unwrap();
        doc.content_hash = Some(markdown::hash(&raw));
        s.index.upsert(&doc).unwrap();
        doc
    }

    #[test]
    fn archive_then_read_back_round_trips() {
        let (_dir, mut s) = make_session();
        let doc = seed_doc(&mut s, DocumentType::Note, "Meeting notes");

        archive_doc(&mut s, &doc.id).unwrap();

        let reloaded = read_raw(&s, &doc.id).unwrap();
        assert_eq!(reloaded.id, doc.id);
        assert_eq!(reloaded.title, "Meeting notes");
        assert!(reloaded.archived);
        assert!(reloaded.path.starts_with("archive/"));
    }

    #[test]
    fn archiving_same_named_docs_from_different_folders_does_not_clobber_each_other() {
        let (_dir, mut s) = make_session();
        // Same title => same generated filename, but different origin folders (tasks/ vs notes/)
        // so neither collides at creation time — the collision only shows up once both land
        // in the shared archive/ folder.
        let task = seed_doc(&mut s, DocumentType::Task, "New task");
        let note = seed_doc(&mut s, DocumentType::Note, "New task");
        assert_ne!(task.id, note.id);

        archive_doc(&mut s, &task.id).unwrap();
        archive_doc(&mut s, &note.id).unwrap();

        let task_reloaded = read_raw(&s, &task.id).unwrap();
        let note_reloaded = read_raw(&s, &note.id).unwrap();
        // Neither file's content was overwritten by the other's.
        assert_eq!(task_reloaded.id, task.id);
        assert_eq!(note_reloaded.id, note.id);
        assert_ne!(task_reloaded.path, note_reloaded.path);
    }

    #[test]
    fn unarchive_moves_the_file_back_to_its_type_folder() {
        let (_dir, mut s) = make_session();
        let doc = seed_doc(&mut s, DocumentType::Idea, "Product idea");

        archive_doc(&mut s, &doc.id).unwrap();
        unarchive_doc(&mut s, &doc.id).unwrap();

        let reloaded = read_raw(&s, &doc.id).unwrap();
        assert!(!reloaded.archived);
        assert!(reloaded.path.starts_with("ideas/"));
    }

    #[test]
    fn trash_removes_the_document_from_the_index() {
        let (_dir, mut s) = make_session();
        let doc = seed_doc(&mut s, DocumentType::Bookmark, "Some link");

        trash_doc(&mut s, &doc.id).unwrap();

        assert!(read_raw(&s, &doc.id).is_err());
        assert!(s
            .workspace
            .root
            .join(".trash")
            .join("some-link.md")
            .exists());
    }
}

#[cfg(test)]
mod capture_tests {
    use super::*;
    use crate::domain::DocumentType;

    fn today() -> String {
        chrono::Local::now()
            .date_naive()
            .format("%Y-%m-%d")
            .to_string()
    }

    #[test]
    fn tags_land_on_the_input_so_they_get_written_to_the_document() {
        let input = capture_input("Buy milk #errand #home");
        assert_eq!(input.tags, Some(vec!["errand".into(), "home".into()]));
        assert_eq!(input.title.as_deref(), Some("Buy milk"));
    }

    #[test]
    fn tags_are_normalized_and_deduplicated() {
        let input = capture_input("Ping #Errand #errand # #ERRAND");
        assert_eq!(input.tags, Some(vec!["errand".into()]));
        assert_eq!(input.title.as_deref(), Some("Ping"));
    }

    #[test]
    fn type_prefix_due_and_tags_parse_together() {
        let input = capture_input("task Renew passport #admin @due:today");
        assert_eq!(input.document_type, Some(DocumentType::Task));
        assert_eq!(input.title.as_deref(), Some("Renew passport"));
        assert_eq!(input.tags, Some(vec!["admin".into()]));
        assert_eq!(input.due, Some(today()));
    }

    #[test]
    fn a_tag_only_capture_still_gets_a_title() {
        let input = capture_input("#errand");
        assert_eq!(input.title.as_deref(), Some("Untitled"));
        assert_eq!(input.tags, Some(vec!["errand".into()]));
    }

    /// The prefix aliases come from `TypeSpec::keywords`, so `todo` and any casing work
    /// without a second hand-maintained match arm here.
    #[test]
    fn capture_prefixes_come_from_the_type_spec() {
        for word in ["task", "todo", "TASK", "ToDo"] {
            let input = capture_input(&format!("{word} Renew passport"));
            assert_eq!(input.document_type, Some(DocumentType::Task), "for {word}");
            assert_eq!(input.title.as_deref(), Some("Renew passport"));
        }
        assert_eq!(
            capture_input("bookmark Read later").document_type,
            Some(DocumentType::Bookmark)
        );
        // `inbox` is now a real keyword rather than falling through as body text.
        let inbox = capture_input("inbox Sort me out");
        assert_eq!(inbox.document_type, Some(DocumentType::Inbox));
        assert_eq!(inbox.title.as_deref(), Some("Sort me out"));
        // A word that is not a type stays part of the title.
        assert_eq!(capture_input("journal Dear diary").document_type, None);
    }
}
