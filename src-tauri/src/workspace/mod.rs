use crate::{
    errors::{Result, SonataError},
    markdown,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub version: u8,
    pub folders: Folders,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock: Option<LockConfig>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockConfig {
    pub salt: String,
    pub verifier: String,
    pub timeout_minutes: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folders {
    pub inbox: String,
    pub tasks: String,
    pub notes: String,
    pub ideas: String,
    pub bookmarks: String,
    pub archive: String,
}
impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            version: 1,
            folders: Folders {
                inbox: "inbox".into(),
                tasks: "tasks".into(),
                notes: "notes".into(),
                ideas: "ideas".into(),
                bookmarks: "bookmarks".into(),
                archive: "archive".into(),
            },
            lock: None,
        }
    }
}
#[derive(Debug, Clone)]
pub struct Workspace {
    pub root: PathBuf,
    pub config: WorkspaceConfig,
}
impl Workspace {
    pub fn create(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let ws = Self {
            root,
            config: WorkspaceConfig::default(),
        };
        for name in [
            ".sonata",
            ".sonata/cache",
            ".sonata/logs",
            "inbox",
            "tasks",
            "notes",
            "ideas",
            "bookmarks",
            "archive",
            "attachments",
            ".trash",
        ] {
            fs::create_dir_all(ws.root.join(name))?;
        }
        fs::write(
            ws.root.join(".sonata/config.json"),
            serde_json::to_vec_pretty(&ws.config)
                .map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        )?;
        Ok(ws)
    }
    pub fn open(root: PathBuf) -> Result<Self> {
        if !root.is_dir() {
            return Err(SonataError::WorkspaceUnavailable(
                root.display().to_string(),
            ));
        }
        let config_path = root.join(".sonata/config.json");
        if !config_path.exists() {
            return Self::create(root);
        }
        let config = serde_json::from_slice(&fs::read(config_path)?)
            .map_err(|e| SonataError::InvalidMetadata(e.to_string()))?;
        Ok(Self { root, config })
    }
    pub fn db_path(&self) -> PathBuf {
        self.root.join(".sonata/index.db")
    }
    pub fn save_config(&self) -> Result<()> {
        fs::write(
            self.root.join(".sonata/config.json"),
            serde_json::to_vec_pretty(&self.config)
                .map_err(|e| SonataError::InvalidMetadata(e.to_string()))?,
        )?;
        Ok(())
    }
    /// Erases every item inside an existing workspace, then recreates an empty Sonata
    /// workspace in that same folder. Callers must obtain explicit user confirmation.
    pub fn reset(root: PathBuf) -> Result<Self> {
        if !root.is_dir() {
            return Err(SonataError::WorkspaceUnavailable(root.display().to_string()));
        }
        for entry in fs::read_dir(&root)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                fs::remove_dir_all(path)?;
            } else {
                fs::remove_file(path)?;
            }
        }
        Self::create(root)
    }
    pub fn relative(&self, path: &Path) -> Result<String> {
        let canonical_root = self.root.canonicalize()?;
        let canonical_path = path.canonicalize()?;
        canonical_path
            .strip_prefix(canonical_root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .map_err(|_| SonataError::PermissionDenied("path is outside the workspace".into()))
    }
    pub fn document_path(&self, kind: &crate::domain::DocumentType, title: &str) -> PathBuf {
        let dir = self.root.join(kind.folder());
        let base = markdown::slug(title);
        let mut candidate = dir.join(format!("{base}.md"));
        let mut index = 2;
        while candidate.exists() {
            candidate = dir.join(format!("{base}-{index}.md"));
            index += 1;
        }
        candidate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_configuration_round_trips_without_changing_folder_defaults() {
        let directory = tempfile::tempdir().unwrap();
        let mut workspace = Workspace::create(directory.path().to_path_buf()).unwrap();
        workspace.config.lock = Some(LockConfig {
            salt: "salt".into(),
            verifier: "verifier".into(),
            timeout_minutes: 20,
        });
        workspace.save_config().unwrap();

        let reopened = Workspace::open(directory.path().to_path_buf()).unwrap();
        assert_eq!(reopened.config.folders.notes, "notes");
        assert_eq!(reopened.config.lock.unwrap().timeout_minutes, 20);
    }

    #[test]
    fn reset_removes_all_content_and_recreates_the_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace::create(directory.path().to_path_buf()).unwrap();
        fs::write(workspace.root.join("notes/keep.md"), "# Keep").unwrap();
        fs::write(workspace.root.join("attachments/keep.txt"), "keep").unwrap();
        fs::create_dir_all(workspace.root.join("personal/nested")).unwrap();
        fs::write(workspace.root.join("personal/nested/file.txt"), "keep").unwrap();
        let reset = Workspace::reset(workspace.root).unwrap();

        assert!(!reset.root.join("notes/keep.md").exists());
        assert!(!reset.root.join("attachments/keep.txt").exists());
        assert!(!reset.root.join("personal").exists());
        assert!(reset.root.join(".sonata/config.json").exists());
        assert!(reset.root.join("inbox").exists());
    }
}
