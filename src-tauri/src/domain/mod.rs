use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DocumentType {
    #[default]
    Inbox,
    Note,
    Task,
    Idea,
    Bookmark,
}

/// One optional piece of metadata a type may carry. Anything a type does not list is
/// cleared by [`SonataDocument::retain_supported_fields`], which is what makes the five
/// types genuinely different rather than five labels on one universal record.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Field {
    Status,
    Stage,
    Priority,
    Due,
    Reminder,
    /// Participates in the task hierarchy, as a parent or as a child.
    Parent,
    Url,
    Tags,
    Cover,
}

/// Metadata a freshly created document of this type starts with.
#[derive(Debug, Clone, Copy)]
pub struct TypeDefaults {
    pub status: Option<TaskStatus>,
    pub priority: Option<Priority>,
    pub stage: Option<IdeaStage>,
}

/// Everything that varies per document type, in one place: the folder, the frontmatter
/// `type:` parser, the quick-capture keywords, the creation defaults and the natural list
/// order all read from here, so a new type is a single table entry plus one match arm.
#[derive(Debug, Clone, Copy)]
pub struct TypeSpec {
    pub folder: &'static str,
    /// Accepted spellings in frontmatter and quick capture. `keywords[0]` is canonical and
    /// must equal the serde representation — asserted in `spec_tests`.
    pub keywords: &'static [&'static str],
    pub fields: &'static [Field],
    pub defaults: TypeDefaults,
    /// What [`SortOrder::Default`] resolves to for a list restricted to this type.
    pub sort: SortOrder,
}

const NO_DEFAULTS: TypeDefaults = TypeDefaults {
    status: None,
    priority: None,
    stage: None,
};

const INBOX_SPEC: TypeSpec = TypeSpec {
    folder: "inbox",
    keywords: &["inbox"],
    // Capture can carry a priority or a due date straight into the inbox; status is what
    // you gain by triaging the item into a task.
    fields: &[Field::Priority, Field::Due, Field::Tags, Field::Cover],
    defaults: TypeDefaults {
        priority: Some(Priority::None),
        ..NO_DEFAULTS
    },
    sort: SortOrder::Created,
};
const NOTE_SPEC: TypeSpec = TypeSpec {
    folder: "notes",
    keywords: &["note"],
    fields: &[Field::Tags, Field::Cover],
    defaults: NO_DEFAULTS,
    sort: SortOrder::Updated,
};
const TASK_SPEC: TypeSpec = TypeSpec {
    folder: "tasks",
    keywords: &["task", "todo"],
    fields: &[
        Field::Status,
        Field::Priority,
        Field::Due,
        Field::Reminder,
        Field::Parent,
        Field::Tags,
        Field::Cover,
    ],
    defaults: TypeDefaults {
        status: Some(TaskStatus::Todo),
        priority: Some(Priority::None),
        stage: None,
    },
    sort: SortOrder::Due,
};
const IDEA_SPEC: TypeSpec = TypeSpec {
    folder: "ideas",
    keywords: &["idea"],
    fields: &[Field::Stage, Field::Tags, Field::Cover],
    defaults: TypeDefaults {
        stage: Some(IdeaStage::Spark),
        ..NO_DEFAULTS
    },
    sort: SortOrder::Created,
};
const BOOKMARK_SPEC: TypeSpec = TypeSpec {
    folder: "bookmarks",
    keywords: &["bookmark"],
    fields: &[Field::Url, Field::Tags],
    defaults: NO_DEFAULTS,
    sort: SortOrder::Created,
};

impl DocumentType {
    pub const ALL: [Self; 5] = [
        Self::Inbox,
        Self::Note,
        Self::Task,
        Self::Idea,
        Self::Bookmark,
    ];

    /// The one exhaustive match over the type list: adding a variant fails to compile here.
    pub const fn spec(self) -> &'static TypeSpec {
        match self {
            Self::Inbox => &INBOX_SPEC,
            Self::Note => &NOTE_SPEC,
            Self::Task => &TASK_SPEC,
            Self::Idea => &IDEA_SPEC,
            Self::Bookmark => &BOOKMARK_SPEC,
        }
    }

    pub const fn folder(self) -> &'static str {
        self.spec().folder
    }

    pub fn supports(self, field: Field) -> bool {
        self.spec().fields.contains(&field)
    }

    /// Case-insensitive lookup of a frontmatter `type:` value or a quick-capture prefix.
    /// One table serves both, so the parser can never accept a word the suggestions omit.
    pub fn from_keyword(word: &str) -> Option<Self> {
        let lowered = word.to_lowercase();
        Self::ALL
            .into_iter()
            .find(|kind| kind.spec().keywords.contains(&lowered.as_str()))
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    Completed,
    Cancelled,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
    Urgent,
}

/// How far an idea has been taken. The idea-type analogue of [`TaskStatus`]; no document
/// ever carries both, which is why `stage` sits beside `status` in the frontmatter.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IdeaStage {
    #[default]
    Spark,
    Developing,
    Parked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub stage: Option<IdeaStage>,
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
    pub cover: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(skip)]
    pub unknown: Mapping,
}

impl SonataDocument {
    /// Clears the optional metadata this document's type does not support.
    ///
    /// Only ever called on a deliberate user action — creating a document, or converting
    /// one to another type. `markdown::parse` must never call it: a hand-written
    /// frontmatter key has to survive a read/write cycle untouched (ADR-001).
    ///
    /// `tags` and `links` are never cleared; every type accepts them, and a tag list lost
    /// to a type change is not recoverable from the file. Dropping `cover` removes the
    /// frontmatter key but *not* the file under `attachments/<id>/`, so the image itself
    /// can still be recovered.
    pub fn retain_supported_fields(&mut self) {
        let kind = self.document_type;
        if !kind.supports(Field::Status) {
            self.status = None;
        }
        if !kind.supports(Field::Stage) {
            self.stage = None;
        }
        if !kind.supports(Field::Priority) {
            self.priority = None;
        }
        if !kind.supports(Field::Due) {
            self.due = None;
        }
        if !kind.supports(Field::Reminder) {
            self.reminder = None;
        }
        if !kind.supports(Field::Parent) {
            self.parent = None;
        }
        if !kind.supports(Field::Url) {
            self.bookmark = None;
        }
        if !kind.supports(Field::Cover) {
            self.cover = None;
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    #[serde(flatten)]
    pub document: SonataDocument,
    pub child_count: i64,
    pub completed_child_count: i64,
}

/// A reminder the index believes has not been delivered yet. Never crosses the bridge —
/// delivery is entirely a backend concern.
#[derive(Debug, Clone)]
pub struct PendingReminder {
    pub id: String,
    pub title: String,
    /// The raw frontmatter value, so `reminders::fire_at` owns interpreting it.
    pub reminder_at: String,
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

/// How the caller wants the list ordered. Pinned-first is applied ahead of every variant,
/// and completed-last only for types that carry a status, so sorting reorders within those
/// bands rather than burying a pinned row.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    /// Whatever is natural for the type being listed, via [`TypeSpec::sort`]. A mixed list
    /// has no type to inherit from and falls back to [`SortOrder::Due`].
    #[default]
    Default,
    /// Soonest due first, then most recently touched.
    Due,
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
    pub stage: Option<IdeaStage>,
    pub due: Option<String>,
    pub reminder: Option<String>,
    pub parent: Option<String>,
    pub links: Option<Vec<String>>,
    pub bookmark: Option<Bookmark>,
    pub cover: Option<String>,
}

pub fn string_value(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| value.as_i64().map(|v| v.to_string()))
}

#[cfg(test)]
mod spec_tests {
    use super::*;

    fn populated(document_type: DocumentType) -> SonataDocument {
        SonataDocument {
            id: "01ABC".into(),
            path: "inbox/x.md".into(),
            document_type,
            title: "X".into(),
            body: String::new(),
            tags: vec!["work".into()],
            created: "2026-01-01T00:00:00+00:00".into(),
            updated: "2026-01-01T00:00:00+00:00".into(),
            archived: false,
            pinned: false,
            status: Some(TaskStatus::InProgress),
            priority: Some(Priority::High),
            stage: Some(IdeaStage::Developing),
            due: Some("2026-02-01".into()),
            reminder: Some("2026-01-30".into()),
            parent: Some("01PARENT".into()),
            links: Some(vec!["01OTHER".into()]),
            bookmark: Some(Bookmark {
                url: "https://example.com".into(),
            }),
            cover: Some("attachments/01ABC/c.png".into()),
            content_hash: None,
            unknown: Mapping::new(),
        }
    }

    /// The load-bearing invariant: `markdown::serialize` writes the serde representation
    /// and `markdown::parse` reads it back through `from_keyword`, so if these two ever
    /// disagreed every document of that type would silently reparse as an inbox item.
    #[test]
    fn canonical_keyword_matches_the_serialized_type() {
        for kind in DocumentType::ALL {
            let serialized = serde_yaml::to_string(&kind).unwrap();
            assert_eq!(serialized.trim(), kind.spec().keywords[0], "for {kind:?}");
        }
    }

    #[test]
    fn every_keyword_maps_back_to_its_type() {
        for kind in DocumentType::ALL {
            for word in kind.spec().keywords {
                assert_eq!(DocumentType::from_keyword(word), Some(kind));
                assert_eq!(DocumentType::from_keyword(&word.to_uppercase()), Some(kind));
            }
        }
        assert_eq!(DocumentType::from_keyword("todo"), Some(DocumentType::Task));
        assert_eq!(DocumentType::from_keyword("journal"), None);
    }

    #[test]
    fn folders_are_unique() {
        let mut folders: Vec<_> = DocumentType::ALL.iter().map(|k| k.folder()).collect();
        folders.sort_unstable();
        let count = folders.len();
        folders.dedup();
        assert_eq!(folders.len(), count);
    }

    /// `new_document` applies the defaults verbatim without pruning, so a default naming a
    /// field its own type does not support would create an immediately invalid document.
    #[test]
    fn type_defaults_only_set_fields_the_type_supports() {
        for kind in DocumentType::ALL {
            let defaults = kind.spec().defaults;
            assert!(
                defaults.status.is_none() || kind.supports(Field::Status),
                "{kind:?} defaults a status it does not support"
            );
            assert!(
                defaults.priority.is_none() || kind.supports(Field::Priority),
                "{kind:?} defaults a priority it does not support"
            );
            assert!(
                defaults.stage.is_none() || kind.supports(Field::Stage),
                "{kind:?} defaults a stage it does not support"
            );
        }
    }

    #[test]
    fn converting_to_a_note_drops_unsupported_metadata() {
        let mut doc = populated(DocumentType::Note);
        doc.retain_supported_fields();
        assert_eq!(doc.status, None);
        assert_eq!(doc.stage, None);
        assert_eq!(doc.priority, None);
        assert_eq!(doc.due, None);
        assert_eq!(doc.reminder, None);
        assert_eq!(doc.parent, None);
        assert!(doc.bookmark.is_none());
        // Kept: every type accepts tags and links, and notes carry a cover.
        assert_eq!(doc.tags, vec!["work".to_string()]);
        assert!(doc.links.is_some());
        assert!(doc.cover.is_some());
    }

    #[test]
    fn converting_to_a_bookmark_keeps_the_url_and_drops_scheduling() {
        let mut doc = populated(DocumentType::Bookmark);
        doc.retain_supported_fields();
        assert_eq!(
            doc.bookmark.map(|b| b.url),
            Some("https://example.com".to_string())
        );
        assert_eq!(doc.status, None);
        assert_eq!(doc.priority, None);
        assert_eq!(doc.due, None);
        assert_eq!(doc.stage, None);
        assert_eq!(doc.cover, None);
    }

    #[test]
    fn a_task_keeps_everything_it_owns() {
        let mut doc = populated(DocumentType::Task);
        doc.retain_supported_fields();
        assert_eq!(doc.status, Some(TaskStatus::InProgress));
        assert_eq!(doc.priority, Some(Priority::High));
        assert_eq!(doc.due, Some("2026-02-01".to_string()));
        assert_eq!(doc.reminder, Some("2026-01-30".to_string()));
        assert_eq!(doc.parent, Some("01PARENT".to_string()));
        // A task is not an idea; the stage goes even though everything else stays.
        assert_eq!(doc.stage, None);
        assert!(doc.bookmark.is_none());
    }
}
