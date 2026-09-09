use crate::{
    db::Index,
    domain::{DocumentInput, DocumentSummary, DocumentType, SearchQuery, SonataDocument},
    errors::{Result, SonataError},
    indexer, markdown, relations,
    workspace::{LockConfig, Workspace},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::process::Command;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;
use ulid::Ulid;
pub struct Session {
    pub workspace: Workspace,
    pub index: Index,
}
pub struct AppState(pub Mutex<Option<Session>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLockStatus {
    enabled: bool,
    timeout_minutes: u32,
}

fn lock_verifier(salt: &str, password: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{salt}:{password}").as_bytes())
    )
}

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
#[tauri::command]
pub fn preferences(app: AppHandle) -> crate::preferences::Preferences {
    crate::preferences::current(&app)
}
#[tauri::command]
pub fn save_preferences(
    preferences: crate::preferences::Preferences,
    app: AppHandle,
) -> Result<crate::preferences::Preferences> {
    crate::preferences::save(&app, preferences)
}
#[tauri::command]
pub fn reset_preferences(app: AppHandle) -> Result<crate::preferences::Preferences> {
    let preferences = crate::preferences::reset(&app)?;
    let _ = app.autolaunch().disable();
    Ok(preferences)
}
#[tauri::command]
pub fn autostart_enabled(app: AppHandle) -> Result<bool> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))
}
#[tauri::command]
pub fn set_autostart(enabled: bool, app: AppHandle) -> Result<()> {
    let launcher = app.autolaunch();
    if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    }
    .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))
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
pub fn workspace_lock_status(state: State<AppState>) -> Result<WorkspaceLockStatus> {
    let guard = session(&state)?;
    let lock = guard.as_ref().unwrap().workspace.config.lock.as_ref();
    Ok(WorkspaceLockStatus {
        enabled: lock.is_some(),
        timeout_minutes: lock.map(|config| config.timeout_minutes).unwrap_or(15),
    })
}
#[tauri::command]
pub fn configure_workspace_lock(
    password: String,
    timeout_minutes: u32,
    state: State<AppState>,
) -> Result<()> {
    let mut guard = session(&state)?;
    let workspace = &mut guard.as_mut().unwrap().workspace;
    workspace.config.lock = if password.is_empty() {
        None
    } else {
        let salt = Ulid::new().to_string();
        Some(LockConfig {
            verifier: lock_verifier(&salt, &password),
            salt,
            timeout_minutes: timeout_minutes.clamp(1, 240),
        })
    };
    workspace.save_config()
}
#[tauri::command]
pub fn verify_workspace_lock(password: String, state: State<AppState>) -> Result<bool> {
    let guard = session(&state)?;
    Ok(guard
        .as_ref()
        .unwrap()
        .workspace
        .config
        .lock
        .as_ref()
        .is_none_or(|config| lock_verifier(&config.salt, &password) == config.verifier))
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
    // Acknowledgement is tied to the current schedule value. Editing a date must re-arm it,
    // even if the user later chooses a value that was acknowledged in the past.
    if path.exists() {
        let existing = markdown::parse(&document.path, &fs::read_to_string(&path)?)?;
        if existing.due != document.due {
            document.acknowledged_due = None;
        }
        if existing.reminder != document.reminder {
            document.acknowledged_reminder = None;
        }
    }
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
pub fn acknowledge_document_attention(
    id: String,
    due: Option<String>,
    reminder: Option<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<()> {
    let mut guard = session(&state)?;
    let s = guard.as_mut().unwrap();
    let mut doc = read_raw(s, &id)?;
    let mut changed = false;

    // The UI sends the exact value it evaluated. Re-checking it after reading the canonical
    // Markdown prevents a delayed click from acknowledging a newly edited deadline.
    if due.is_some() && due == doc.due && doc.acknowledged_due != due {
        doc.acknowledged_due = due;
        changed = true;
    }
    if reminder.is_some() && reminder == doc.reminder && doc.acknowledged_reminder != reminder {
        doc.acknowledged_reminder = reminder;
        changed = true;
    }
    if changed {
        doc.updated = markdown::now();
        write_raw(s, &mut doc)?;
        app.emit("document:changed", id).ok();
    }
    Ok(())
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
    let relative = s.workspace.relative(&candidate)?;
    // `documents.path` is UNIQUE. A row can still be indexed at the destination path if
    // its file vanished outside Sonata, in which case the caller's upsert would fail the
    // constraint after the file had already moved. Release the path here so every move
    // (archive, unarchive, trash, type change) is safe from that.
    s.index.remove_path(&relative)?;
    Ok(relative)
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

/// Converts `id` to `kind`: rewrites the frontmatter, drops the metadata the target type
/// does not support, and moves the file into that type's folder.
///
/// An archived document keeps living in `archive/` — only its frontmatter changes, because
/// `unarchive_doc` reads `document_type.folder()` at unarchive time and so routes it to the
/// *new* type's folder later.
///
/// Children pointing at a converted parent are deliberately left alone. The parent edge
/// lives on the child (ADR-004) and the ULID never changes (ADR-003), so the references
/// survive verbatim and converting back restores the subtree intact; rewriting N sibling
/// files from one action would be both surprising and non-atomic. Callers therefore have to
/// gate subtask UI on whether the type supports `Field::Parent`, not on the child count.
fn change_type(
    s: &mut Session,
    id: &str,
    kind: DocumentType,
    expected_hash: Option<&str>,
) -> Result<SonataDocument> {
    let mut doc = read_raw(s, id)?;
    // Idempotent, and without bumping `updated`: converting to the type it already is is
    // not an edit.
    if doc.document_type == kind {
        return Ok(doc);
    }
    // `read_raw` just parsed the file and `parse` sets `content_hash` from the raw text, so
    // this is the same check `update_document` makes without a second read.
    if let Some(expected) = expected_hash {
        if doc.content_hash.as_deref() != Some(expected) {
            return Err(SonataError::WriteConflict);
        }
    }
    let old_path = doc.path.clone();
    if doc.id.starts_with("external:") {
        doc.id = ulid::Ulid::new().to_string();
        // The synthetic row still holds `old_path`, which for an archived document is the
        // very path the new id is about to claim. `documents.path` is UNIQUE, so release it.
        s.index.remove_path(&old_path)?;
    }
    doc.document_type = kind;
    doc.retain_supported_fields();
    relations::validate_parent(&s.index, &doc.id, doc.parent.as_deref())?;
    doc.updated = markdown::now();
    if !doc.archived {
        doc.path = relocate_file(s, &doc, kind.folder())?;
    }
    // One upsert moves the index row: it is keyed by id and `ON CONFLICT(id) DO UPDATE SET
    // path=excluded.path` is exactly the "the path changed" case (see db::upsert).
    write_raw(s, &mut doc)?;
    Ok(doc)
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
#[tauri::command]
pub fn set_document_type(
    id: String,
    document_type: DocumentType,
    expected_hash: Option<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<SonataDocument> {
    let mut guard = session(&state)?;
    let doc = change_type(
        guard.as_mut().unwrap(),
        &id,
        document_type,
        expected_hash.as_deref(),
    )?;
    app.emit("document:changed", &doc.id).ok();
    app.emit("workspace:index-updated", &doc.id).ok();
    Ok(doc)
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
mod type_change_tests {
    use super::*;
    use crate::domain::{Bookmark, IdeaStage, Priority, TaskStatus};

    fn make_session() -> (tempfile::TempDir, Session) {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::create(dir.path().to_path_buf()).unwrap();
        let index = Index::open(&workspace.db_path()).unwrap();
        (dir, Session { workspace, index })
    }

    fn seed(
        s: &mut Session,
        kind: DocumentType,
        title: &str,
        edit: impl FnOnce(&mut SonataDocument),
    ) -> SonataDocument {
        let path = s.workspace.document_path(&kind, title);
        // `Workspace::relative` canonicalizes, so it needs the file to exist; strip the
        // prefix by hand instead, the way `archive_tests::seed_doc` does.
        let relative = path
            .strip_prefix(&s.workspace.root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let mut doc = markdown::new_document(relative, kind, title.to_string(), String::new());
        edit(&mut doc);
        let raw = markdown::serialize(&doc).unwrap();
        markdown::atomic_write(&path, &raw).unwrap();
        doc.content_hash = Some(markdown::hash(&raw));
        s.index.upsert(&doc).unwrap();
        doc
    }

    fn raw_on_disk(s: &Session, doc: &SonataDocument) -> String {
        fs::read_to_string(s.workspace.root.join(&doc.path)).unwrap()
    }

    #[test]
    fn changing_type_moves_the_file_into_the_new_folder() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Inbox, "Sort me out", |_| {});
        let old_path = s.workspace.root.join(&doc.path);
        assert!(old_path.exists());

        let converted = change_type(&mut s, &doc.id, DocumentType::Task, None).unwrap();

        assert_eq!(converted.document_type, DocumentType::Task);
        assert!(converted.path.starts_with("tasks/"), "{}", converted.path);
        assert!(!old_path.exists(), "the inbox file should be gone");
        // The ULID is identity (ADR-003), so relationships survive the move.
        assert_eq!(converted.id, doc.id);
        assert_eq!(s.index.get(&doc.id).unwrap().path, converted.path);
        assert_eq!(read_raw(&s, &doc.id).unwrap().title, "Sort me out");
    }

    #[test]
    fn changing_type_drops_metadata_the_new_type_does_not_support() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Task, "Renew passport", |doc| {
            doc.status = Some(TaskStatus::InProgress);
            doc.priority = Some(Priority::High);
            doc.due = Some("2026-02-01".into());
            doc.reminder = Some("2026-01-30".into());
            doc.tags = vec!["admin".into()];
        });

        let converted = change_type(&mut s, &doc.id, DocumentType::Note, None).unwrap();

        assert_eq!(converted.status, None);
        assert_eq!(converted.due, None);
        assert_eq!(converted.reminder, None);
        assert_eq!(converted.priority, None);
        // Tags are never dropped: every type accepts them.
        assert_eq!(converted.tags, vec!["admin".to_string()]);

        let raw = raw_on_disk(&s, &converted);
        assert!(!raw.contains("status:"), "{raw}");
        assert!(!raw.contains("due:"), "{raw}");
        assert!(raw.contains("admin"), "{raw}");
    }

    #[test]
    fn converting_an_idea_to_a_task_swaps_stage_for_a_status() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Idea, "A spark", |doc| {
            doc.stage = Some(IdeaStage::Developing);
        });

        let converted = change_type(&mut s, &doc.id, DocumentType::Task, None).unwrap();

        assert_eq!(converted.stage, None);
        assert!(!raw_on_disk(&s, &converted).contains("stage:"));
        // The task gains no status here — conversion prunes, it does not invent defaults.
        assert_eq!(converted.status, None);
    }

    #[test]
    fn converting_to_a_bookmark_keeps_a_url_that_was_already_there() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Inbox, "Read later", |doc| {
            doc.bookmark = Some(Bookmark {
                url: "https://example.com/a".into(),
            });
        });

        let converted = change_type(&mut s, &doc.id, DocumentType::Bookmark, None).unwrap();
        assert_eq!(
            converted.bookmark.as_ref().map(|b| b.url.as_str()),
            Some("https://example.com/a")
        );
        // And it reaches the list rows, which read `bookmark_url` from the index.
        assert_eq!(
            s.index.get(&doc.id).unwrap().bookmark.map(|b| b.url),
            Some("https://example.com/a".to_string())
        );
    }

    /// A type change must not yank a document out of the archive. `unarchive_doc` reads the
    /// folder at unarchive time, so it lands in the new type's folder later.
    #[test]
    fn an_archived_document_keeps_its_place_in_the_archive() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Idea, "Parked thought", |_| {});
        archive_doc(&mut s, &doc.id).unwrap();

        let converted = change_type(&mut s, &doc.id, DocumentType::Task, None).unwrap();
        assert!(converted.archived);
        assert!(converted.path.starts_with("archive/"), "{}", converted.path);

        unarchive_doc(&mut s, &doc.id).unwrap();
        let restored = read_raw(&s, &doc.id).unwrap();
        assert!(restored.path.starts_with("tasks/"), "{}", restored.path);
        assert!(!restored.archived);
    }

    #[test]
    fn a_stale_hash_is_rejected() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Inbox, "Sort me", |_| {});

        let err = change_type(&mut s, &doc.id, DocumentType::Note, Some("nope")).unwrap_err();
        assert!(matches!(err, SonataError::WriteConflict));
        // Rejected before anything moved.
        assert_eq!(
            read_raw(&s, &doc.id).unwrap().document_type,
            DocumentType::Inbox
        );

        let current = read_raw(&s, &doc.id).unwrap().content_hash.unwrap();
        let converted = change_type(&mut s, &doc.id, DocumentType::Note, Some(&current)).unwrap();
        assert_eq!(converted.document_type, DocumentType::Note);
    }

    #[test]
    fn converting_to_the_same_type_is_a_no_op() {
        let (_dir, mut s) = make_session();
        let doc = seed(&mut s, DocumentType::Note, "Already a note", |_| {});

        let converted = change_type(&mut s, &doc.id, DocumentType::Note, None).unwrap();
        assert_eq!(converted.path, doc.path);
        assert_eq!(converted.updated, doc.updated);
    }

    #[test]
    fn a_same_named_file_in_the_target_folder_is_not_clobbered() {
        let (_dir, mut s) = make_session();
        let existing = seed(&mut s, DocumentType::Note, "Shared title", |_| {});
        let incoming = seed(&mut s, DocumentType::Inbox, "Shared title", |_| {});
        assert_ne!(existing.id, incoming.id);

        let converted = change_type(&mut s, &incoming.id, DocumentType::Note, None).unwrap();

        assert_ne!(converted.path, existing.path);
        assert_eq!(read_raw(&s, &existing.id).unwrap().id, existing.id);
        assert_eq!(read_raw(&s, &incoming.id).unwrap().id, incoming.id);
    }

    /// ADR-004 stores the parent edge on the child and ADR-003 fixes the ULID, so the
    /// references survive and converting back restores the subtree intact.
    #[test]
    fn subtasks_keep_pointing_at_a_converted_parent() {
        let (_dir, mut s) = make_session();
        let parent = seed(&mut s, DocumentType::Task, "Parent", |_| {});
        let child = seed(&mut s, DocumentType::Task, "Child", |doc| {
            doc.parent = Some(parent.id.clone());
        });

        change_type(&mut s, &parent.id, DocumentType::Note, None).unwrap();

        assert_eq!(
            read_raw(&s, &child.id).unwrap().parent,
            Some(parent.id.clone())
        );
        // Converting back makes the parent a task again with its subtree unchanged.
        change_type(&mut s, &parent.id, DocumentType::Task, None).unwrap();
        assert_eq!(s.index.children(&parent.id).unwrap().len(), 1);
    }

    #[test]
    fn an_unknown_id_is_an_error_rather_than_a_silent_no_op() {
        let (_dir, mut s) = make_session();
        assert!(change_type(&mut s, "01NOPE", DocumentType::Note, None).is_err());
    }
}

#[cfg(test)]
mod capture_tests {
    use super::*;

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
