use crate::{
    domain::{string_value, Bookmark, DocumentType, Priority, SonataDocument, TaskStatus},
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
    "priority",
    "due",
    "reminder",
    "parent",
    "links",
    "bookmark",
    "cover",
    "completed",
];
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
    let document_type = match get("type").as_deref() {
        Some("task") => DocumentType::Task,
        Some("note") => DocumentType::Note,
        Some("idea") => DocumentType::Idea,
        Some("bookmark") => DocumentType::Bookmark,
        _ => DocumentType::Inbox,
    };
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
        due,
        reminder,
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
    SonataDocument {
        id: Ulid::new().to_string(),
        path,
        document_type: document_type.clone(),
        title,
        body,
        tags: vec![],
        created: timestamp.clone(),
        updated: timestamp,
        archived: false,
        pinned: false,
        status: (document_type == DocumentType::Task).then_some(TaskStatus::Todo),
        priority: Some(Priority::None),
        due: None,
        reminder: None,
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
        serde_yaml::to_value(&document.document_type)
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
}
