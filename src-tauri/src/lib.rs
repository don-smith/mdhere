pub mod library;

use std::path::PathBuf;

use library::{Document, LibraryError, LibraryRegistry, LibrarySnapshot};
use tauri::Manager;

#[tauri::command]
fn library_snapshot(
    window: tauri::Window,
    registry: tauri::State<'_, LibraryRegistry>,
) -> Result<LibrarySnapshot, LibraryError> {
    registry.snapshot(window.label())
}

#[tauri::command]
fn read_document(
    window: tauri::Window,
    registry: tauri::State<'_, LibraryRegistry>,
    path: String,
) -> Result<Document, LibraryError> {
    registry.read_document(window.label(), &path)
}

#[tauri::command]
fn refresh_library(
    window: tauri::Window,
    registry: tauri::State<'_, LibraryRegistry>,
) -> Result<LibrarySnapshot, LibraryError> {
    registry.snapshot(window.label())
}

pub fn run() {
    let startup_root = startup_root();
    tauri::Builder::default()
        .manage(LibraryRegistry::new())
        .setup(move |app| {
            if let Some(root) = startup_root.as_ref() {
                app.state::<LibraryRegistry>()
                    .register_root("main", root.clone())
                    .map_err(|error| std::io::Error::other(error.to_string()))?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_snapshot,
            read_document,
            refresh_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running MD Here");
}

fn startup_root() -> Option<PathBuf> {
    let mut arguments = std::env::args_os().skip(1);
    while let Some(argument) = arguments.next() {
        if argument == "--root" {
            return arguments.next().map(PathBuf::from);
        }
    }
    None
}
