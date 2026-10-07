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
pub use types::{Diagnostic, Document, DocumentKind, LibrarySnapshot, TreeNode};

pub(crate) use path_guard::PathGuard;

const MAX_DOCUMENT_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct PreparedLibrary {
    root: PathBuf,
    pub snapshot: LibrarySnapshot,
    pub document: Option<Document>,
}

#[derive(Debug, Default)]
pub struct LibraryRegistry {
    roots: Mutex<RegisteredRoots>,
}

#[derive(Debug, Default)]
struct RegisteredRoots {
    next_revision: u64,
    entries: HashMap<String, (PathBuf, u64)>,
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

    pub fn root_revision(&self, window_label: &str) -> Result<u64, LibraryError> {
        self.roots
            .lock()
            .map_err(|_| LibraryError::Io("library registry lock was poisoned".into()))?
            .entries
            .get(window_label)
            .map(|(_, revision)| *revision)
            .ok_or_else(|| LibraryError::NotRegistered(window_label.to_owned()))
    }

    // Keep the root lock through the bounded read, so a replaced root cannot serve
    // bytes under a revision that was valid before the replacement.
    pub fn with_root_revision<T>(
        &self,
        window_label: &str,
        revision: u64,
        read: impl FnOnce(&Path) -> T,
    ) -> Option<T> {
        let roots = self.roots.lock().ok()?;
        let (root, current) = roots.entries.get(window_label)?;
        (*current == revision).then(|| read(root))
    }

    pub fn unregister(&self, window_label: &str) {
        if let Ok(mut roots) = self.roots.lock() {
            roots.entries.remove(window_label);
        }
    }

    fn replace_root(&self, window_label: &str, root: PathBuf) -> Result<(), LibraryError> {
        let mut roots = self
            .roots
            .lock()
            .map_err(|_| LibraryError::Io("library registry lock was poisoned".into()))?;
        roots.next_revision = roots
            .next_revision
            .checked_add(1)
            .ok_or_else(|| LibraryError::Io("library root revision exhausted".into()))?;
        let revision = roots.next_revision;
        roots
            .entries
            .insert(window_label.to_owned(), (root, revision));
        Ok(())
    }

    fn root_for(&self, window_label: &str) -> Result<PathBuf, LibraryError> {
        self.roots
            .lock()
            .map_err(|_| LibraryError::Io("library registry lock was poisoned".into()))?
            .entries
            .get(window_label)
            .map(|(root, _)| root.clone())
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
    let kind = scanner::document_kind(relative_path).ok_or(LibraryError::NotDocument)?;
    let metadata = fs::metadata(&path).map_err(|error| LibraryError::Io(error.to_string()))?;
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(LibraryError::DocumentTooLarge);
    }
    let bytes = fs::read(&path).map_err(|error| LibraryError::Io(error.to_string()))?;
    let content = String::from_utf8(bytes).map_err(|_| LibraryError::InvalidUtf8)?;
    // The canonical path confines the read; the requested alias is the tree/navigation identity.
    let title = relative_path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("Document")
        .to_owned();
    let path = relative_path
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    Ok(match kind {
        DocumentKind::Markdown => Document::Markdown {
            path,
            title,
            content,
        },
        DocumentKind::Html => Document::Html { path, title },
    })
}
