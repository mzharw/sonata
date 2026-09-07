use std::io;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SonataError {
    #[error("The workspace is unavailable: {0}")]
    WorkspaceUnavailable(String),
    #[error("The workspace is read-only or permission was denied: {0}")]
    PermissionDenied(String),
    #[error("Malformed frontmatter: {0}")]
    MalformedFrontmatter(String),
    #[error("Invalid metadata: {0}")]
    InvalidMetadata(String),
    #[error("Duplicate Sonata ID: {0}")]
    DuplicateId(String),
    #[error("This file changed outside Sonata")]
    WriteConflict,
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Filesystem error: {0}")]
    Io(#[from] io::Error),
}

impl serde::Serialize for SonataError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, SonataError>;
