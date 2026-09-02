pub mod assets;
pub mod external_links;
pub mod library;
pub mod themes;

use std::path::PathBuf;

use assets::AssetProtocol;
use external_links::validate_external_url;
use library::{Document, LibraryError, LibraryRegistry, LibrarySnapshot};
use tauri::{Emitter, Manager, http::Response};
use themes::{Theme, ThemeCatalog, ThemeSnapshot};

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

#[tauri::command]
fn theme_catalog(catalog: tauri::State<'_, ThemeCatalog>) -> ThemeSnapshot {
    catalog.snapshot()
}

#[tauri::command]
fn select_theme(
    app: tauri::AppHandle,
    catalog: tauri::State<'_, ThemeCatalog>,
    theme_id: String,
) -> Result<Theme, String> {
    let theme = catalog
        .select(&theme_id)
        .map_err(|error| error.to_string())?;
    app.emit("theme-changed", &theme)
        .map_err(|error| error.to_string())?;
    Ok(theme)
}

#[tauri::command]
fn reload_themes(
    app: tauri::AppHandle,
    catalog: tauri::State<'_, ThemeCatalog>,
) -> Result<ThemeSnapshot, String> {
    catalog.reload().map_err(|error| error.to_string())?;
    let snapshot = catalog.snapshot();
    app.emit("theme-changed", &snapshot.selected)
        .map_err(|error| error.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
fn open_themes_folder(catalog: tauri::State<'_, ThemeCatalog>) -> Result<(), String> {
    std::fs::create_dir_all(catalog.user_dir()).map_err(|error| error.to_string())?;
    tauri_plugin_opener::open_path(catalog.user_dir(), None::<&str>)
        .map_err(|error| error.to_string())
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
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(
                ThemeCatalog::bundled(app_data.join("themes"), app_data.join("preferences.json"))
                    .map_err(|error| std::io::Error::other(error.to_string()))?,
            );
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
            open_external_link,
            theme_catalog,
            select_theme,
            reload_themes,
            open_themes_folder
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
