use std::path::PathBuf;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum LibraryError {
    #[error("The selected root does not exist: {0}")]
    RootMissing(PathBuf),
    #[error("The selected root is not a directory: {0}")]
    InvalidRoot(PathBuf),
    #[error("No library is registered for window {0}")]
    NotRegistered(String),
    #[error("The requested path is outside the selected folder")]
    OutsideRoot,
    #[error("The requested file is not a Markdown document")]
    NotMarkdown,
    #[error("The document is not valid UTF-8")]
    InvalidUtf8,
    #[error("The document exceeds the 10 MiB limit")]
    DocumentTooLarge,
    #[error("The library contains more than 25,000 Markdown documents")]
    SnapshotLimit,
    #[error("Filesystem operation failed: {0}")]
    Io(String),
}
