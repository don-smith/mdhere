use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use super::error::LibraryError;

#[derive(Debug, Clone)]
pub struct PathGuard {
    root: PathBuf,
}

impl PathGuard {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn resolve(&self, relative_path: &str) -> Result<PathBuf, LibraryError> {
        let relative = Path::new(relative_path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
        {
            return Err(LibraryError::OutsideRoot);
        }

        let candidate = fs::canonicalize(self.root.join(relative))
            .map_err(|error| LibraryError::Io(error.to_string()))?;
        if candidate.starts_with(&self.root) {
            Ok(candidate)
        } else {
            Err(LibraryError::OutsideRoot)
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}
