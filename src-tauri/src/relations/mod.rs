use crate::{
    db::Index,
    errors::{Result, SonataError},
};
pub fn validate_parent(index: &Index, child: &str, parent: Option<&str>) -> Result<()> {
    let Some(mut cursor) = parent.map(str::to_owned) else {
        return Ok(());
    };
    if cursor == child {
        return Err(SonataError::InvalidMetadata(
            "a task cannot be its own parent".into(),
        ));
    }
    for _ in 0..100 {
        let current = index.get(&cursor)?;
        match current.parent {
            Some(next) if next == child => {
                return Err(SonataError::InvalidMetadata(
                    "parent relationship would create a cycle".into(),
                ))
            }
            Some(next) => cursor = next,
            None => return Ok(()),
        }
    }
    Err(SonataError::InvalidMetadata(
        "task hierarchy is too deep".into(),
    ))
}
