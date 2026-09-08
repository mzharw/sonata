use crate::{
    domain::{string_value, Bookmark, DocumentType, IdeaStage, SonataDocument},
    errors::{Result, SonataError},
};
use chrono::{Duration, Local};
use regex::Regex;
use serde_yaml::{Mapping, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
use ulid::Ulid;

const KNOWN: &[&str] = &[
    "id",
    "type",
    "title",
    "tags",
    "created",
    "updated",
    "archived",
    "pinned",
    "status",
    "stage",
    "priority",
    "due",
    "reminder",
    "acknowledged_due",
    "acknowledged_reminder",
    "parent",
    "links",
    "bookmark",
    "cover",
];
// `completed` is deliberately absent. KNOWN means "this key is represented by a struct
// field"; nothing parses or re-serializes `completed`, so listing it here excluded it from
// `unknown` and destroyed the key on the next write.
pub fn now() -> String {
    Local::now().to_rfc3339()
}
/// Resolves shorthand-capture date keywords ("today"/"tomorrow"/"yesterday") to an actual
/// `YYYY-MM-DD` date; anything else (already a real date, or unrecognized) passes through
/// unchanged rather than being silently stored as a literal, invalid "due" string.
pub fn resolve_due_keyword(raw: &str) -> String {
    let offset_days: i64 = match raw.to_lowercase().as_str() {
        "today" => 0,
        "tomorrow" => 1,
        "yesterday" => -1,
        _ => return raw.to_string(),
    };
    (Local::now().date_naive() + Duration::days(offset_days))
        .format("%Y-%m-%d")
        .to_string()
}
pub fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub fn normalize_tag(tag: &str) -> String {
    tag.trim().trim_start_matches('#').to_lowercase()
}
pub fn slug(title: &str) -> String {
    let value = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let clean = value
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if clean.is_empty() {
        "untitled".into()
    } else {
        clean.chars().take(80).collect()
    }
}
pub fn wiki_targets(body: &str) -> Vec<String> {
    Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
        .expect("valid regex")
        .captures_iter(body)
        .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}

pub fn parse(path: &str, raw: &str) -> Result<SonataDocument> {
    let (frontmatter, body) = split_frontmatter(raw)?;
    // `serialize` places one blank separator line between frontmatter and the body.
    // The closing frontmatter marker already consumes its own newline, so remove just
    // that separator here instead of treating it as part of the document body.
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))
        .unwrap_or(body);
    let map: Mapping = if let Some(yaml) = frontmatter {
        serde_yaml::from_str(yaml).map_err(|e| SonataError::MalformedFrontmatter(e.to_string()))?
    } else {
        Mapping::new()
    };
    let get = |key: &str| {
        map.get(Value::String(key.to_string()))
            .and_then(string_value)
    };
    // An unrecognized or missing `type:` falls back to the default (inbox) rather than
    // failing the parse, so a hand-written file is always readable.
    let document_type = get("type")
        .as_deref()
        .and_then(DocumentType::from_keyword)
        .unwrap_or_default();
    let id = get("id").unwrap_or_default();
    let title = get("title").unwrap_or_else(|| {
        Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string()
    });
    let tags = map
        .get(Value::String("tags".into()))
        .and_then(Value::as_sequence)
        .map(|s| s.iter().filter_map(string_value).collect())
        .unwrap_or_default();
    let created = get("created").unwrap_or_default();
    let updated = get("updated").unwrap_or_default();
    let archived = map
        .get(Value::String("archived".into()))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let pinned = map
        .get(Value::String("pinned".into()))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let status = get("status").and_then(|v| serde_yaml::from_str(&v).ok());
    let priority = get("priority").and_then(|v| serde_yaml::from_str(&v).ok());
    let stage = get("stage").and_then(|v| serde_yaml::from_str::<IdeaStage>(&v).ok());
    let parent = get("parent").filter(|s| s != "null");
    let links = map
        .get(Value::String("links".into()))
        .and_then(Value::as_sequence)
        .map(|s| s.iter().filter_map(string_value).collect());
    let bookmark = map
        .get(Value::String("bookmark".into()))
        .and_then(|v| serde_yaml::from_value::<Bookmark>(v.clone()).ok());
    let due = get("due");
    let reminder = get("reminder");
    let acknowledged_due = get("acknowledged_due");
    let acknowledged_reminder = get("acknowledged_reminder");
    let cover = get("cover");
    let unknown = map
        .into_iter()
        .filter(|(key, _)| key.as_str().is_none_or(|k| !KNOWN.contains(&k)))
        .collect();
    Ok(SonataDocument {
        id,
        path: path.to_string(),
        document_type,
        title,
        body: body.to_string(),
        tags,
        created,
        updated,
        archived,
        pinned,
        status,
        priority,
        stage,
        due,
        reminder,
        acknowledged_due,
        acknowledged_reminder,
        parent,
        links,
        bookmark,
        cover,
        content_hash: Some(hash(raw)),
        unknown,
    })
}

pub fn new_document(
    path: String,
    document_type: DocumentType,
    title: String,
    body: String,
) -> SonataDocument {
    let timestamp = now();
    let defaults = document_type.spec().defaults;
    SonataDocument {
        id: Ulid::new().to_string(),
        path,
        document_type,
        title,
        body,
        tags: vec![],
        created: timestamp.clone(),
        updated: timestamp,
        archived: false,
        pinned: false,
        status: defaults.status,
        priority: defaults.priority,
        stage: defaults.stage,
        due: None,
        reminder: None,
        acknowledged_due: None,
        acknowledged_reminder: None,
        parent: None,
        links: None,
        bookmark: None,
        cover: None,
        content_hash: None,
        unknown: Mapping::new(),
    }
}

pub fn serialize(document: &SonataDocument) -> Result<String> {
    let mut map = document.unknown.clone();
    let put = |map: &mut Mapping, k: &str, v: Value| {
        map.insert(Value::String(k.into()), v);
    };
    put(&mut map, "id", Value::String(document.id.clone()));
    put(
        &mut map,
        "type",
        serde_yaml::to_value(document.document_type)
            .map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
    );
    put(&mut map, "title", Value::String(document.title.clone()));
    put(
        &mut map,
        "tags",
        serde_yaml::to_value(&document.tags)
            .map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
    );
    put(&mut map, "created", Value::String(document.created.clone()));
    put(&mut map, "updated", Value::String(document.updated.clone()));
    put(&mut map, "archived", Value::Bool(document.archived));
    put(&mut map, "pinned", Value::Bool(document.pinned));
    if let Some(v) = &document.status {
        put(
            &mut map,
            "status",
            serde_yaml::to_value(v).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        );
    }
    if let Some(v) = &document.stage {
        put(
            &mut map,
            "stage",
            serde_yaml::to_value(v).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        );
    }
    if let Some(v) = &document.priority {
        put(
            &mut map,
            "priority",
            serde_yaml::to_value(v).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        );
    }
    for (key, value) in [
        ("due", document.due.clone()),
        ("reminder", document.reminder.clone()),
        ("acknowledged_due", document.acknowledged_due.clone()),
        (
            "acknowledged_reminder",
            document.acknowledged_reminder.clone(),
        ),
        ("parent", document.parent.clone()),
    ] {
        if let Some(v) = value {
            put(&mut map, key, Value::String(v));
        }
    }
    if let Some(v) = &document.links {
        put(
            &mut map,
            "links",
            serde_yaml::to_value(v).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        );
    }
    if let Some(v) = &document.bookmark {
        put(
            &mut map,
            "bookmark",
            serde_yaml::to_value(v).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        );
    }
    if let Some(v) = &document.cover {
        put(&mut map, "cover", Value::String(v.clone()));
    }
    let yaml =
        serde_yaml::to_string(&map).map_err(|e| SonataError::InvalidMetadata(e.to_string()))?;
    Ok(format!("---\n{}---\n\n{}", yaml, document.body))
}
pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let temp = path.with_extension("md.tmp");
    fs::write(&temp, content)?;
    fs::rename(temp, path)?;
    Ok(())
}
fn split_frontmatter(raw: &str) -> Result<(Option<&str>, &str)> {
    if !raw.starts_with("---\n") && !raw.starts_with("---\r\n") {
        return Ok((None, raw));
    }
    let offset = if raw.starts_with("---\r\n") { 5 } else { 4 };
    let rest = &raw[offset..];
    for marker in ["\n---\n", "\n---\r\n"] {
        if let Some(index) = rest.find(marker) {
            return Ok((Some(&rest[..index]), &rest[index + marker.len()..]));
        }
    }
    Err(SonataError::MalformedFrontmatter(
        "opening delimiter has no closing delimiter".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_unknown_and_body() {
        let raw = "---\nid: 01ABC\ntype: task\ntitle: Hello\ncustom: yes\ntags: [Work]\n---\n\n- [ ] body";
        let doc = parse("tasks/hello.md", raw).unwrap();
        assert_eq!(
            doc.unknown
                .get(Value::String("custom".into()))
                .and_then(Value::as_str),
            Some("yes")
        );
        assert!(serialize(&doc).unwrap().contains("custom: yes"));
    }
    #[test]
    fn frontmatter_separator_is_not_part_of_the_body() {
        let raw = "---\nid: 01ABC\ntitle: Hello\n---\n\nFirst line";
        assert_eq!(parse("notes/hello.md", raw).unwrap().body, "First line");
    }
    #[test]
    fn wiki_links_are_found() {
        assert_eq!(
            wiki_targets("See [[Hello]] and [[path/x|X]]"),
            vec!["Hello", "path/x"]
        );
    }
    #[test]
    fn slugs_are_readable() {
        assert_eq!(
            slug("Build authentication flow!"),
            "build-authentication-flow"
        );
    }
    /// `completed` used to sit in KNOWN with no struct field behind it, so it was filtered
    /// out of `unknown` and silently destroyed on the next write.
    #[test]
    fn an_uninterpreted_completed_key_survives_a_write() {
        let raw = "---\nid: 01ABC\ntype: task\ntitle: Hello\ncompleted: true\n---\n\nbody";
        let doc = parse("tasks/hello.md", raw).unwrap();
        assert!(serialize(&doc).unwrap().contains("completed: true"));
    }
    #[test]
    fn stage_round_trips_in_frontmatter() {
        let raw = "---\nid: 01ABC\ntype: idea\ntitle: Hello\nstage: developing\n---\n\nbody";
        let doc = parse("ideas/hello.md", raw).unwrap();
        assert_eq!(doc.stage, Some(IdeaStage::Developing));
        assert!(serialize(&doc).unwrap().contains("stage: developing"));
    }
    /// Guards the fixed key order. `stage` is the idea-type analogue of `status`, so a
    /// reader scanning frontmatter finds the lifecycle field in the same place either way.
    #[test]
    fn stage_is_written_between_status_and_priority() {
        let mut doc = new_document(
            "tasks/x.md".into(),
            DocumentType::Task,
            "X".into(),
            String::new(),
        );
        doc.stage = Some(IdeaStage::Spark);
        let raw = serialize(&doc).unwrap();
        let status = raw.find("status:").expect("status written");
        let stage = raw.find("stage:").expect("stage written");
        let priority = raw.find("priority:").expect("priority written");
        assert!(status < stage && stage < priority, "{raw}");
    }
    #[test]
    fn new_documents_only_get_the_defaults_their_type_supports() {
        let note = new_document(
            "notes/x.md".into(),
            DocumentType::Note,
            "X".into(),
            "".into(),
        );
        assert_eq!(note.status, None);
        assert_eq!(note.priority, None);
        assert_eq!(note.stage, None);

        let task = new_document(
            "tasks/x.md".into(),
            DocumentType::Task,
            "X".into(),
            "".into(),
        );
        assert_eq!(task.status, Some(crate::domain::TaskStatus::Todo));
        assert_eq!(task.priority, Some(crate::domain::Priority::None));
        assert_eq!(task.stage, None);

        let idea = new_document(
            "ideas/x.md".into(),
            DocumentType::Idea,
            "X".into(),
            "".into(),
        );
        assert_eq!(idea.stage, Some(IdeaStage::Spark));
        assert_eq!(idea.status, None);
    }
    #[test]
    fn an_unknown_type_value_falls_back_to_inbox() {
        let raw = "---\nid: 01ABC\ntype: journal\ntitle: Hello\n---\n\nbody";
        let doc = parse("inbox/hello.md", raw).unwrap();
        assert_eq!(doc.document_type, DocumentType::Inbox);
        // `type` is a known key, so the unrecognized spelling is not preserved: the file is
        // rewritten as the type it actually parsed as.
        assert!(serialize(&doc).unwrap().contains("type: inbox"));
    }
    #[test]
    fn a_todo_type_keyword_parses_as_a_task() {
        let raw = "---\nid: 01ABC\ntype: todo\ntitle: Hello\n---\n\nbody";
        assert_eq!(
            parse("tasks/hello.md", raw).unwrap().document_type,
            DocumentType::Task
        );
    }

    #[test]
    fn acknowledgement_values_round_trip_as_known_metadata() {
        let raw = "---\nid: 01ABC\ntype: task\ntitle: Hello\ndue: 2026-09-08\nacknowledged_due: 2026-09-08\nreminder: 2026-09-08T09:30\nacknowledged_reminder: 2026-09-08T09:30\n---\n\nbody";
        let doc = parse("tasks/hello.md", raw).unwrap();
        assert_eq!(doc.acknowledged_due.as_deref(), Some("2026-09-08"));
        assert_eq!(
            doc.acknowledged_reminder.as_deref(),
            Some("2026-09-08T09:30")
        );
        let written = serialize(&doc).unwrap();
        assert!(written.contains("acknowledged_due: 2026-09-08"));
        assert!(written.contains("acknowledged_reminder: 2026-09-08T09:30"));
    }
}
