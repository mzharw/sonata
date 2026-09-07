use crate::{
    domain::{DocumentSummary, Field, SearchQuery, SonataDocument, SortOrder},
    errors::Result,
    markdown,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
/// Bumped whenever `SCHEMA` changes shape. A mismatch drops and recreates the derived
/// tables rather than patching them, because `indexer::rebuild` refills them anyway.
const SCHEMA_VERSION: i64 = 2;
const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,status TEXT,priority TEXT,due_at TEXT,reminder_at TEXT,parent_id TEXT,archived INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,content_hash TEXT NOT NULL,stage TEXT,bookmark_url TEXT); CREATE TABLE IF NOT EXISTS document_tags(document_id TEXT NOT NULL,tag TEXT NOT NULL,PRIMARY KEY(document_id,tag)); CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag); CREATE TABLE IF NOT EXISTS document_links(source_id TEXT NOT NULL,target_id TEXT,raw_target TEXT NOT NULL,PRIMARY KEY(source_id,raw_target)); CREATE TABLE IF NOT EXISTS index_errors(path TEXT PRIMARY KEY,error_type TEXT NOT NULL,message TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS delivered_reminders(document_id TEXT PRIMARY KEY,delivered_at TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(id UNINDEXED,title,body,path);";

pub struct Index {
    conn: Connection,
}
impl Index {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }
    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        // The index is disposable (ADR-002): `Index::open` is only reached from
        // create/open_workspace, and both call `indexer::rebuild` immediately after, which
        // clears every derived table and re-parses the workspace. So only the *schema* has
        // to match what this code writes — a column change is free, and dropping is a far
        // more honest upgrade path than stacking up `ALTER TABLE`s whose errors we discard.
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != SCHEMA_VERSION {
            // `delivered_reminders` is the one table not derived from a file: it records
            // what has already been notified, which no Markdown document can reproduce.
            // Dropping it would re-fire every past reminder.
            self.conn.execute_batch(
                "DROP TABLE IF EXISTS documents_fts; DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS document_tags; DROP TABLE IF EXISTS document_links; DROP TABLE IF EXISTS index_errors;",
            )?;
        }
        self.conn.execute_batch(SCHEMA)?;
        // `user_version` takes no bound parameter; the value is a private const integer,
        // so there is no caller text anywhere near this string.
        self.conn
            .execute_batch(&format!("PRAGMA user_version={SCHEMA_VERSION};"))?;
        Ok(())
    }
    pub fn clear(&self) -> Result<()> {
        self.conn.execute_batch("DELETE FROM document_tags; DELETE FROM document_links; DELETE FROM documents_fts; DELETE FROM index_errors; DELETE FROM documents;")?;
        Ok(())
    }
    pub fn upsert(&self, doc: &SonataDocument) -> Result<()> {
        if doc.id.is_empty() {
            return Ok(());
        }
        // Note: this intentionally does NOT reject re-upserting an id already indexed at a
        // different path. That's the normal case whenever we move a document's file ourselves
        // (archive/unarchive/trash, or any future rename) — the whole point of the call is to
        // tell the index the path changed. A guard here used to throw "DuplicateId" on every
        // such legitimate move, which — since the file had already been renamed on disk by the
        // time the guard fired — left the index pointing at a path that no longer existed,
        // silently breaking the document until a manual rebuild. `ON CONFLICT(id) DO UPDATE`
        // below is exactly the right behavior for this: update the existing row in place.
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("INSERT INTO documents(id,path,type,title,body,status,priority,due_at,reminder_at,parent_id,archived,pinned,created_at,updated_at,content_hash,stage,bookmark_url) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17) ON CONFLICT(id) DO UPDATE SET path=excluded.path,type=excluded.type,title=excluded.title,body=excluded.body,status=excluded.status,priority=excluded.priority,due_at=excluded.due_at,reminder_at=excluded.reminder_at,parent_id=excluded.parent_id,archived=excluded.archived,pinned=excluded.pinned,updated_at=excluded.updated_at,content_hash=excluded.content_hash,stage=excluded.stage,bookmark_url=excluded.bookmark_url", params![doc.id,doc.path,serde_json::to_string(&doc.document_type).unwrap_or_default().trim_matches('"'),doc.title,doc.body,doc.status.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default().trim_matches('"').to_string()),doc.priority.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default().trim_matches('"').to_string()),doc.due,doc.reminder,doc.parent,doc.archived as i32,doc.pinned as i32,doc.created,doc.updated,doc.content_hash,doc.stage.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default().trim_matches('"').to_string()),doc.bookmark.as_ref().map(|b| b.url.clone())])?;
        tx.execute("DELETE FROM document_tags WHERE document_id=?1", [&doc.id])?;
        for tag in &doc.tags {
            tx.execute(
                "INSERT INTO document_tags(document_id,tag) VALUES(?1,?2)",
                params![doc.id, markdown::normalize_tag(tag)],
            )?;
        }
        tx.execute("DELETE FROM document_links WHERE source_id=?1", [&doc.id])?;
        let mut targets = doc.links.clone().unwrap_or_default();
        targets.extend(markdown::wiki_targets(&doc.body));
        for raw in targets {
            let target: Option<String> = tx
                .query_row(
                    "SELECT id FROM documents WHERE id=?1 OR lower(title)=lower(?1) OR path=?1",
                    [&raw],
                    |r| r.get(0),
                )
                .optional()?;
            tx.execute("INSERT OR REPLACE INTO document_links(source_id,target_id,raw_target) VALUES(?1,?2,?3)", params![doc.id,target,raw])?;
        }
        tx.execute("DELETE FROM documents_fts WHERE id=?1", [&doc.id])?;
        tx.execute(
            "INSERT INTO documents_fts(id,title,body,path) VALUES(?1,?2,?3,?4)",
            params![doc.id, doc.title, doc.body, doc.path],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn remove_path(&self, path: &str) -> Result<()> {
        if let Some(id) = self
            .conn
            .query_row("SELECT id FROM documents WHERE path=?1", [path], |r| {
                r.get::<_, String>(0)
            })
            .optional()?
        {
            self.conn
                .execute("DELETE FROM documents WHERE id=?1", [&id])?;
            self.conn
                .execute("DELETE FROM document_tags WHERE document_id=?1", [&id])?;
            self.conn
                .execute("DELETE FROM document_links WHERE source_id=?1", [&id])?;
            self.conn
                .execute("DELETE FROM documents_fts WHERE id=?1", [&id])?;
        }
        Ok(())
    }
    pub fn get(&self, id: &str) -> Result<SonataDocument> {
        self.conn.query_row("SELECT id,path,type,title,body,status,priority,due_at,reminder_at,parent_id,archived,created_at,updated_at,content_hash,pinned,stage,bookmark_url FROM documents WHERE id=?1", [id], row_doc).map_err(Into::into)
    }
    pub fn list(&self, query: &SearchQuery) -> Result<Vec<DocumentSummary>> {
        let mut sql = String::from("SELECT d.id,d.path,d.type,d.title,d.body,d.status,d.priority,d.due_at,d.reminder_at,d.parent_id,d.archived,d.created_at,d.updated_at,d.content_hash,d.pinned,d.stage,d.bookmark_url,(SELECT count(*) FROM documents c WHERE c.parent_id=d.id),(SELECT count(*) FROM documents c WHERE c.parent_id=d.id AND c.status='completed') FROM documents d WHERE 1=1");
        let mut values: Vec<String> = vec![];
        if let Some(a) = query.archived {
            sql.push_str(" AND d.archived=?");
            values.push((a as i32).to_string());
        } else {
            sql.push_str(" AND d.archived=0");
        }
        if let Some(t) = &query.document_type {
            sql.push_str(" AND d.type=?");
            values.push(
                serde_json::to_string(t)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
            );
        }
        if let Some(status) = &query.status {
            sql.push_str(" AND d.status=?");
            values.push(
                serde_json::to_string(status)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
            );
        }
        if let Some(priority) = &query.priority {
            let value = serde_json::to_string(priority)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string();
            // A document that never had a priority set stores NULL rather than
            // "none", so the "none" filter has to accept both spellings.
            if value == "none" {
                sql.push_str(" AND (d.priority IS NULL OR d.priority='none')");
            } else {
                sql.push_str(" AND d.priority=?");
                values.push(value);
            }
        }
        if let Some(tag) = &query.tag {
            sql.push_str(" AND EXISTS(SELECT 1 FROM document_tags dt WHERE dt.document_id=d.id AND dt.tag=?)");
            values.push(markdown::normalize_tag(tag));
        }
        // "Not completed" only means something for a type that carries a status, and the
        // NULL guard is load-bearing: `NULL != 'completed'` is NULL, not true, so without it
        // SQLite dropped every due document that had no status — a due inbox item was
        // invisible in Today and Upcoming.
        let type_has_status = query
            .document_type
            .is_none_or(|t| t.supports(Field::Status));
        let open_only = if type_has_status {
            " AND (d.status IS NULL OR d.status!='completed')"
        } else {
            ""
        };
        if query.due.as_deref() == Some("today") {
            sql.push_str(" AND d.due_at=date('now','localtime')");
            sql.push_str(open_only);
        } else if query.due.as_deref() == Some("upcoming") {
            sql.push_str(" AND d.due_at>=date('now','localtime')");
            sql.push_str(open_only);
        }
        if let Some(text) = &query.text {
            sql.push_str(" AND (d.id IN (SELECT id FROM documents_fts WHERE documents_fts MATCH ?) OR lower(d.title) LIKE lower(?) OR lower(d.path) LIKE lower(?))");
            values.push(format!("{}*", text.replace('"', "")));
            values.push(format!("%{text}%"));
            values.push(format!("%{text}%"));
        }
        // Built from a matched enum, never from caller text, so this stays
        // parameter-free without opening an injection path.
        // `Default` means "whatever is natural for the type being listed". A mixed list has
        // no type to inherit from, so soonest-due stays the fallback.
        let sort = match query.sort.unwrap_or_default() {
            SortOrder::Default => query
                .document_type
                .map_or(SortOrder::Due, |t| t.spec().sort),
            explicit => explicit,
        };
        let order = match sort {
            SortOrder::Default | SortOrder::Due => "d.due_at IS NULL, d.due_at",
            SortOrder::Updated => "d.updated_at DESC",
            SortOrder::Created => "d.created_at DESC",
            // Stored as text, so the rank has to be spelled out; unset priority
            // sorts alongside "none", at the bottom.
            SortOrder::Priority => "CASE d.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END",
            SortOrder::Title => "lower(d.title)",
        };
        sql.push_str(" ORDER BY d.pinned DESC");
        if type_has_status {
            sql.push_str(", CASE WHEN d.status='completed' THEN 1 ELSE 0 END");
        }
        sql.push_str(", ");
        sql.push_str(order);
        sql.push_str(", d.updated_at DESC");
        let mut statement = self.conn.prepare(&sql)?;
        let rows = statement.query_map(rusqlite::params_from_iter(values), |r| {
            Ok(DocumentSummary {
                document: row_doc(r)?,
                child_count: r.get(17)?,
                completed_child_count: r.get(18)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
    pub fn tags(&self) -> Result<Vec<(String, i64)>> {
        let mut s = self.conn.prepare(
            "SELECT tag,count(*) FROM document_tags GROUP BY tag ORDER BY count(*) DESC,tag",
        )?;
        let result = s
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into);
        result
    }
    pub fn children(&self, id: &str) -> Result<Vec<DocumentSummary>> {
        self.list(&SearchQuery::default()).map(|all| {
            all.into_iter()
                .filter(|d| d.document.parent.as_deref() == Some(id))
                .collect()
        })
    }
    pub fn backlinks(&self, id: &str) -> Result<Vec<DocumentSummary>> {
        let mut s=self.conn.prepare("SELECT d.id FROM documents d JOIN document_links l ON l.source_id=d.id WHERE l.target_id=?1")?;
        let ids = s
            .query_map([id], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        ids.into_iter()
            .map(|id| {
                self.get(&id).map(|document| DocumentSummary {
                    document,
                    child_count: 0,
                    completed_child_count: 0,
                })
            })
            .collect()
    }
}
fn row_doc(r: &rusqlite::Row<'_>) -> rusqlite::Result<SonataDocument> {
    use crate::domain::{Bookmark, DocumentType, IdeaStage, Priority, TaskStatus};
    let kind: String = r.get(2)?;
    let status: Option<String> = r.get(5)?;
    let priority: Option<String> = r.get(6)?;
    let stage: Option<String> = r.get(15)?;
    Ok(SonataDocument {
        id: r.get(0)?,
        path: r.get(1)?,
        document_type: serde_yaml::from_str(&kind).unwrap_or(DocumentType::Inbox),
        title: r.get(3)?,
        body: r.get(4)?,
        tags: vec![],
        created: r.get(11)?,
        updated: r.get(12)?,
        archived: r.get::<_, i32>(10)? != 0,
        pinned: r.get::<_, i32>(14)? != 0,
        status: status.and_then(|v| serde_yaml::from_str::<TaskStatus>(&v).ok()),
        priority: priority.and_then(|v| serde_yaml::from_str::<Priority>(&v).ok()),
        due: r.get(7)?,
        reminder: r.get(8)?,
        parent: r.get(9)?,
        stage: stage.and_then(|v| serde_yaml::from_str::<IdeaStage>(&v).ok()),
        links: None,
        // `cover` stays unindexed: only a full document read needs it. `bookmark_url` *is*
        // indexed, because a list row's domain chip has nothing else to render from.
        bookmark: r.get::<_, Option<String>>(16)?.map(|url| Bookmark { url }),
        cover: None,
        content_hash: r.get(13)?,
        unknown: Default::default(),
    })
}

#[cfg(test)]
mod list_filter_tests {
    use super::*;
    use crate::domain::{Bookmark, DocumentType, IdeaStage, Priority, TaskStatus};

    fn index() -> Index {
        Index::open(Path::new(":memory:")).unwrap()
    }

    fn seed_with(
        index: &Index,
        kind: DocumentType,
        title: &str,
        edit: impl FnOnce(&mut SonataDocument),
    ) {
        let mut doc = markdown::new_document(
            format!("{}/{title}.md", kind.folder()),
            kind,
            title.to_string(),
            String::new(),
        );
        doc.content_hash = Some(String::from("hash"));
        edit(&mut doc);
        index.upsert(&doc).unwrap();
    }

    fn seed(index: &Index, title: &str, priority: Option<Priority>, status: Option<TaskStatus>) {
        seed_with(index, DocumentType::Task, title, |doc| {
            doc.priority = priority;
            doc.status = status;
        });
    }

    fn today() -> String {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    }

    fn titles(index: &Index, query: &SearchQuery) -> Vec<String> {
        index
            .list(query)
            .unwrap()
            .into_iter()
            .map(|d| d.document.title)
            .collect()
    }

    #[test]
    fn filters_by_priority() {
        let index = index();
        seed(&index, "urgent one", Some(Priority::Urgent), None);
        seed(&index, "low one", Some(Priority::Low), None);

        let found = titles(
            &index,
            &SearchQuery {
                priority: Some(Priority::Urgent),
                ..Default::default()
            },
        );
        assert_eq!(found, vec!["urgent one"]);
    }

    #[test]
    fn the_none_priority_filter_also_matches_documents_that_never_had_one_set() {
        let index = index();
        // Explicitly "none" versus never set at all: the first stores the string,
        // the second stores NULL, and both must come back under the same filter.
        seed(&index, "explicit none", Some(Priority::None), None);
        seed(&index, "never set", None, None);
        seed(&index, "has one", Some(Priority::High), None);

        let mut found = titles(
            &index,
            &SearchQuery {
                priority: Some(Priority::None),
                ..Default::default()
            },
        );
        found.sort();
        assert_eq!(found, vec!["explicit none", "never set"]);
    }

    #[test]
    fn sorts_by_priority_rank_not_alphabetically() {
        let index = index();
        seed(&index, "b low", Some(Priority::Low), None);
        seed(&index, "a urgent", Some(Priority::Urgent), None);
        seed(&index, "c medium", Some(Priority::Medium), None);
        seed(&index, "d unset", None, None);

        let found = titles(
            &index,
            &SearchQuery {
                sort: Some(SortOrder::Priority),
                ..Default::default()
            },
        );
        assert_eq!(found, vec!["a urgent", "c medium", "b low", "d unset"]);
    }

    #[test]
    fn sorts_by_title() {
        let index = index();
        seed(&index, "Zebra", None, None);
        seed(&index, "apple", None, None);

        let found = titles(
            &index,
            &SearchQuery {
                sort: Some(SortOrder::Title),
                ..Default::default()
            },
        );
        assert_eq!(found, vec!["apple", "Zebra"]);
    }

    #[test]
    fn completed_documents_stay_below_the_rest_whatever_the_sort() {
        let index = index();
        seed(
            &index,
            "a done urgent",
            Some(Priority::Urgent),
            Some(TaskStatus::Completed),
        );
        seed(
            &index,
            "b open low",
            Some(Priority::Low),
            Some(TaskStatus::Todo),
        );

        let found = titles(
            &index,
            &SearchQuery {
                sort: Some(SortOrder::Priority),
                ..Default::default()
            },
        );
        assert_eq!(found, vec!["b open low", "a done urgent"]);
    }

    /// `d.status != 'completed'` is NULL for a document with no status, and SQLite drops a
    /// row whose WHERE clause is NULL — so a due inbox item used to be invisible here.
    #[test]
    fn a_due_document_without_a_status_is_not_dropped_from_today() {
        let index = index();
        seed_with(&index, DocumentType::Inbox, "triage me", |doc| {
            doc.due = Some(today());
            doc.status = None;
        });

        assert_eq!(
            titles(
                &index,
                &SearchQuery {
                    document_type: Some(DocumentType::Inbox),
                    due: Some("today".into()),
                    ..Default::default()
                }
            ),
            vec!["triage me".to_string()]
        );
    }

    #[test]
    fn completed_tasks_are_still_hidden_from_today() {
        let index = index();
        seed_with(&index, DocumentType::Task, "done", |doc| {
            doc.due = Some(today());
            doc.status = Some(TaskStatus::Completed);
        });
        seed_with(&index, DocumentType::Task, "open", |doc| {
            doc.due = Some(today());
            doc.status = Some(TaskStatus::Todo);
        });

        assert_eq!(
            titles(
                &index,
                &SearchQuery {
                    document_type: Some(DocumentType::Task),
                    due: Some("today".into()),
                    ..Default::default()
                }
            ),
            vec!["open".to_string()]
        );
    }

    /// `SortOrder::Default` resolves through the type's spec, so a note list is
    /// most-recently-updated rather than the task-shaped soonest-due.
    #[test]
    fn notes_default_to_most_recently_updated() {
        let index = index();
        seed_with(&index, DocumentType::Note, "older", |doc| {
            doc.updated = "2026-01-01T00:00:00+00:00".into();
        });
        seed_with(&index, DocumentType::Note, "newer", |doc| {
            doc.updated = "2026-06-01T00:00:00+00:00".into();
        });

        assert_eq!(
            titles(
                &index,
                &SearchQuery {
                    document_type: Some(DocumentType::Note),
                    ..Default::default()
                }
            ),
            vec!["newer".to_string(), "older".to_string()]
        );
    }

    #[test]
    fn an_explicit_sort_still_wins_over_the_type_default() {
        let index = index();
        seed_with(&index, DocumentType::Note, "beta", |_| {});
        seed_with(&index, DocumentType::Note, "alpha", |_| {});

        assert_eq!(
            titles(
                &index,
                &SearchQuery {
                    document_type: Some(DocumentType::Note),
                    sort: Some(SortOrder::Title),
                    ..Default::default()
                }
            ),
            vec!["alpha".to_string(), "beta".to_string()]
        );
    }

    /// Also catches a mis-numbered column index, which is the likely failure mode when
    /// adding a column to both SELECTs by hand.
    #[test]
    fn stage_and_bookmark_url_round_trip_through_the_index() {
        let index = index();
        seed_with(&index, DocumentType::Idea, "spark", |doc| {
            doc.id = "01IDEA".into();
            doc.stage = Some(IdeaStage::Developing);
        });
        seed_with(&index, DocumentType::Bookmark, "link", |doc| {
            doc.id = "01LINK".into();
            doc.bookmark = Some(Bookmark {
                url: "https://example.com/a".into(),
            });
        });

        assert_eq!(
            index.get("01IDEA").unwrap().stage,
            Some(IdeaStage::Developing)
        );
        assert_eq!(
            index.get("01LINK").unwrap().bookmark.map(|b| b.url),
            Some("https://example.com/a".to_string())
        );

        let ideas = index
            .list(&SearchQuery {
                document_type: Some(DocumentType::Idea),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(ideas[0].document.stage, Some(IdeaStage::Developing));

        let links = index
            .list(&SearchQuery {
                document_type: Some(DocumentType::Bookmark),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            links[0].document.bookmark.as_ref().map(|b| b.url.as_str()),
            Some("https://example.com/a")
        );
    }

    /// The `user_version` gate has to recognize a pre-existing database whose `documents`
    /// table predates `pinned`/`stage`, and rebuild it rather than trying to patch it.
    #[test]
    fn an_older_schema_is_dropped_and_recreated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("index.db");
        {
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE documents(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,content_hash TEXT NOT NULL);",
            )
            .unwrap();
        }

        let index = Index::open(&path).unwrap();
        seed_with(&index, DocumentType::Idea, "after upgrade", |doc| {
            doc.id = "01NEW".into();
            doc.stage = Some(IdeaStage::Parked);
        });
        assert_eq!(index.get("01NEW").unwrap().stage, Some(IdeaStage::Parked));
    }
}
