mod error;
mod path_guard;
mod scanner;
mod types;

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub use error::LibraryError;
pub use types::{Diagnostic, Document, LibrarySnapshot, TreeNode};

use path_guard::PathGuard;

const MAX_DOCUMENT_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct PreparedLibrary {
    root: PathBuf,
    pub snapshot: LibrarySnapshot,
    pub document: Option<Document>,
}

#[derive(Debug, Default)]
pub struct LibraryRegistry {
    roots: Mutex<HashMap<String, PathBuf>>,
}

impl LibraryRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_root(&self, window_label: &str, root: PathBuf) -> Result<(), LibraryError> {
        let root = canonical_root(root)?;
        self.replace_root(window_label, root)
    }

    pub fn prepare(
        &self,
        root: PathBuf,
        document: Option<&Path>,
    ) -> Result<PreparedLibrary, LibraryError> {
        let root = canonical_root(root)?;
        let snapshot = scanner::scan(&root)?;
        let document = document
            .map(|path| read_document_from_root(&root, path))
            .transpose()?;
        Ok(PreparedLibrary {
            root,
            snapshot,
            document,
        })
    }

    pub fn commit(
        &self,
        window_label: &str,
        prepared: &PreparedLibrary,
    ) -> Result<(), LibraryError> {
        self.replace_root(window_label, prepared.root.clone())
    }

    pub fn snapshot(&self, window_label: &str) -> Result<LibrarySnapshot, LibraryError> {
        let root = self.root_for(window_label)?;
        scanner::scan(&root)
    }

    pub fn read_document(
        &self,
        window_label: &str,
        relative_path: &str,
    ) -> Result<Document, LibraryError> {
        let root = self.root_for(window_label)?;
        read_document_from_root(&root, Path::new(relative_path))
    }

    pub fn resolve_path(
        &self,
        window_label: &str,
        relative_path: &str,
    ) -> Result<PathBuf, LibraryError> {
        PathGuard::new(self.root_for(window_label)?).resolve(relative_path)
    }

    pub fn unregister(&self, window_label: &str) {
        if let Ok(mut roots) = self.roots.lock() {
            roots.remove(window_label);
        }
    }

    fn replace_root(&self, window_label: &str, root: PathBuf) -> Result<(), LibraryError> {
        self.roots
            .lock()
            .map_err(|_| LibraryError::Io("library registry lock was poisoned".into()))?
            .insert(window_label.to_owned(), root);
        Ok(())
    }

    fn root_for(&self, window_label: &str) -> Result<PathBuf, LibraryError> {
        self.roots
            .lock()
            .map_err(|_| LibraryError::Io("library registry lock was poisoned".into()))?
            .get(window_label)
            .cloned()
            .ok_or_else(|| LibraryError::NotRegistered(window_label.to_owned()))
    }
}

fn canonical_root(root: PathBuf) -> Result<PathBuf, LibraryError> {
    if !root.exists() {
        return Err(LibraryError::RootMissing(root));
    }
    if !root.is_dir() {
        return Err(LibraryError::InvalidRoot(root));
    }
    fs::canonicalize(&root).map_err(|error| LibraryError::Io(error.to_string()))
}

fn read_document_from_root(root: &Path, relative_path: &Path) -> Result<Document, LibraryError> {
    let guard = PathGuard::new(root.to_path_buf());
    let path = guard.resolve(relative_path)?;
    if !scanner::is_markdown(&path) {
        return Err(LibraryError::NotMarkdown);
    }
    let metadata = fs::metadata(&path).map_err(|error| LibraryError::Io(error.to_string()))?;
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(LibraryError::DocumentTooLarge);
    }
    let bytes = fs::read(&path).map_err(|error| LibraryError::Io(error.to_string()))?;
    let content = String::from_utf8(bytes).map_err(|_| LibraryError::InvalidUtf8)?;
    let relative = path
        .strip_prefix(guard.root())
        .map_err(|_| LibraryError::OutsideRoot)?;
    Ok(Document {
        path: relative
            .components()
            .filter_map(|component| component.as_os_str().to_str())
            .collect::<Vec<_>>()
            .join("/"),
        title: path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Document")
            .to_owned(),
        content,
    })
}
