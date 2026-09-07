use crate::{db::Index, errors::Result, markdown, workspace::Workspace};
use std::{fs, path::Path};
pub fn rebuild(workspace: &Workspace, index: &Index) -> Result<()> {
    index.clear()?;
    visit(&workspace.root, workspace, index)?;
    Ok(())
}
fn visit(directory: &Path, workspace: &Workspace, index: &Index) -> Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        if name == ".sonata" || name == ".trash" {
            continue;
        }
        if path.is_dir() {
            visit(&path, workspace, index)?;
        } else if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
        {
            let relative = workspace.relative(&path)?;
            match markdown::parse(&relative, &fs::read_to_string(&path)?) {
                Ok(mut doc) => {
                    if doc.id.is_empty() {
                        doc.id = format!("external:{}", &markdown::hash(&relative)[..24]);
                    }
                    let _ = index.upsert(&doc);
                }
                Err(error) => {
                    let _ = index_error(index, &relative, &error.to_string());
                }
            }
        }
    }
    Ok(())
}
fn index_error(_index: &Index, _path: &str, _message: &str) -> Result<()> {
    Ok(())
}
pub fn index_file(workspace: &Workspace, index: &Index, path: &Path) -> Result<()> {
    if !path.exists() {
        return index.remove_path(&path.to_string_lossy());
    }
    if !path
        .extension()
        .is_some_and(|v| v.eq_ignore_ascii_case("md"))
    {
        return Ok(());
    }
    let rel = workspace.relative(path)?;
    let raw = fs::read_to_string(path)?;
    let mut doc = markdown::parse(&rel, &raw)?;
    if doc.id.is_empty() {
        doc.id = format!("external:{}", &markdown::hash(&rel)[..24]);
    }
    index.upsert(&doc)
}
