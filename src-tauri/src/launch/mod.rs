use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use crate::library::LibraryRegistry;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct LaunchRequest {
    pub root: Option<PathBuf>,
}

#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum LaunchError {
    #[error("usage: mdhere [--root <folder>] or mdhere [folder]")]
    Usage,
    #[error("--root requires a folder")]
    MissingRoot,
    #[error("root is not a directory: {0}")]
    InvalidRoot(PathBuf),
}

impl LaunchRequest {
    pub fn parse(
        arguments: impl IntoIterator<Item = OsString>,
        cwd: &Path,
    ) -> Result<Self, LaunchError> {
        let arguments = arguments.into_iter().collect::<Vec<_>>();
        let root = match arguments.as_slice() {
            [] => None,
            [flag, value] if flag == "--root" => Some(value.into()),
            [flag] if flag == "--root" => return Err(LaunchError::MissingRoot),
            [value] if !value.to_string_lossy().starts_with('-') => Some(value.into()),
            _ => return Err(LaunchError::Usage),
        };
        let root = root.map(|path: PathBuf| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        });
        if let Some(path) = &root
            && !path.is_dir()
        {
            return Err(LaunchError::InvalidRoot(path.clone()));
        }
        Ok(Self { root })
    }
}

pub trait WindowFactory: Send + Sync {
    fn build(&self, label: &str, hidden: bool) -> Result<(), String>;
}

pub struct WindowCoordinator<F> {
    registry: Arc<LibraryRegistry>,
    factory: F,
    next_label: Mutex<u64>,
}

impl<F: WindowFactory> WindowCoordinator<F> {
    pub fn new(registry: Arc<LibraryRegistry>, factory: F) -> Self {
        Self {
            registry,
            factory,
            next_label: Mutex::new(1),
        }
    }

    pub fn open(&self, request: LaunchRequest) -> Result<String, String> {
        let label = self.allocate_label()?;
        let hidden = request.root.is_none();
        if let Some(root) = request.root {
            self.registry
                .register_root(&label, root)
                .map_err(|error| error.to_string())?;
        }
        if let Err(error) = self.factory.build(&label, hidden) {
            self.registry.unregister(&label);
            return Err(error);
        }
        Ok(label)
    }

    pub fn replace_root(&self, label: &str, root: PathBuf) -> Result<(), String> {
        self.registry
            .register_root(label, root)
            .map_err(|error| error.to_string())
    }

    pub fn close(&self, label: &str) {
        self.registry.unregister(label);
    }

    fn allocate_label(&self) -> Result<String, String> {
        let mut next = self
            .next_label
            .lock()
            .map_err(|_| "window coordinator lock was poisoned".to_owned())?;
        let label = format!("mdhere-{}", *next);
        *next += 1;
        Ok(label)
    }
}
