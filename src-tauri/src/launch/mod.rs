use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct LaunchRequest {
    pub root: Option<PathBuf>,
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
            [] => (None, None),
            [root] if !root.to_string_lossy().starts_with('-') => (Some(root.into()), None),
            [root, document]
                if !root.to_string_lossy().starts_with('-')
                    && !document.to_string_lossy().starts_with('-') =>
            {
                (Some(root.into()), Some(document.into()))
            }
            _ => return Err(LaunchError::Usage),
        };
        let root = root
            .map(|root: PathBuf| {
                if root.is_absolute() {
                    root
                } else {
                    cwd.join(root)
                }
            })
            .map(|root| {
                if root.is_dir() {
                    Ok(root)
                } else {
                    Err(LaunchError::InvalidRoot(root))
                }
            })
            .transpose()?;
        Ok(Self { root, document })
    }
}
