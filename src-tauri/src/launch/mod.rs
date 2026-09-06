use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct LaunchRequest {
    pub root: PathBuf,
    pub document: Option<PathBuf>,
}

#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum LaunchError {
    #[error("usage: mdhere [folder [relative-file]]")]
    Usage,
    #[error("root is not a directory: {0}")]
    InvalidRoot(PathBuf),
}

impl LaunchRequest {
    pub fn parse(
        arguments: impl IntoIterator<Item = OsString>,
        cwd: &Path,
    ) -> Result<Self, LaunchError> {
        let arguments = arguments.into_iter().collect::<Vec<_>>();
        let (root, document) = match arguments.as_slice() {
            [] => (cwd.to_path_buf(), None),
            [root] if !root.to_string_lossy().starts_with('-') => (root.into(), None),
            [root, document]
                if !root.to_string_lossy().starts_with('-')
                    && !document.to_string_lossy().starts_with('-') =>
            {
                (root.into(), Some(document.into()))
            }
            _ => return Err(LaunchError::Usage),
        };
        let root = if root.is_absolute() {
            root
        } else {
            cwd.join(root)
        };
        if !root.is_dir() {
            return Err(LaunchError::InvalidRoot(root));
        }
        Ok(Self { root, document })
    }
}
