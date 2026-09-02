pub mod assets;
pub mod external_links;
pub mod library;

use std::path::PathBuf;

use assets::AssetProtocol;
use external_links::validate_external_url;
use library::{Document, LibraryError, LibraryRegistry, LibrarySnapshot};
use tauri::{Manager, http::Response};

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

#[tauri::command]
fn open_external_link(url: String) -> Result<(), String> {
    let url = validate_external_url(&url)
        .ok_or_else(|| "Only valid HTTPS URLs can be opened.".to_owned())?;
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())
}

pub fn run() {
    let startup_root = startup_root();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(LibraryRegistry::new())
        .register_uri_scheme_protocol("mdhere-asset", |context, request| {
            let response = AssetProtocol::serve(
                &context.app_handle().state::<LibraryRegistry>(),
                context.webview_label(),
                request.uri().path(),
            );
            let mut builder = Response::builder().status(response.status);
            for (name, value) in response.headers {
                builder = builder.header(name, value);
            }
            builder
                .body(response.body)
                .expect("asset response is valid")
        })
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
            refresh_library,
            open_external_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdhere");
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
