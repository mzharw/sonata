use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DocumentType {
    #[default]
    Inbox,
    Note,
    Task,
    Idea,
    Bookmark,
}
impl DocumentType {
    pub fn folder(&self) -> &'static str {
        match self {
            Self::Inbox => "inbox",
            Self::Note => "notes",
            Self::Task => "tasks",
            Self::Idea => "ideas",
            Self::Bookmark => "bookmarks",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    Completed,
    Cancelled,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonataDocument {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub document_type: DocumentType,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created: String,
    pub updated: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<TaskStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bookmark: Option<Bookmark>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(skip)]
    pub unknown: Mapping,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocumentSummary {
    #[serde(flatten)]
    pub document: SonataDocument,
    pub child_count: i64,
    pub completed_child_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchQuery {
    pub text: Option<String>,
    #[serde(rename = "type")]
    pub document_type: Option<DocumentType>,
    pub tag: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<Priority>,
    pub due: Option<String>,
    pub archived: Option<bool>,
    pub sort: Option<SortOrder>,
}

/// How the caller wants the list ordered. Pinned-first and completed-last are
/// applied ahead of every variant, so sorting reorders within those bands
/// rather than burying a pinned row.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    /// Soonest due first, then most recently touched.
    #[default]
    Default,
    Updated,
    Created,
    Priority,
    Title,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DocumentInput {
    #[serde(rename = "type")]
    pub document_type: Option<DocumentType>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub status: Option<TaskStatus>,
    pub priority: Option<Priority>,
    pub due: Option<String>,
    pub reminder: Option<String>,
    pub parent: Option<String>,
    pub links: Option<Vec<String>>,
    pub bookmark: Option<Bookmark>,
}

pub fn string_value(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| value.as_i64().map(|v| v.to_string()))
}
