pub mod assets;
pub mod external_links;
pub mod launch;
pub mod library;
pub mod themes;

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use assets::AssetProtocol;
use external_links::validate_external_url;
use launch::LaunchRequest;
use library::{Document, LibraryError, LibraryRegistry, LibrarySnapshot};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, http::Response};
use tauri_plugin_dialog::DialogExt;
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

static NEXT_WINDOW_LABEL: AtomicU64 = AtomicU64::new(1);

fn create_window(app: &AppHandle, root: Option<PathBuf>) -> Result<(), String> {
    let label = format!(
        "mdhere-{}",
        NEXT_WINDOW_LABEL.fetch_add(1, Ordering::Relaxed)
    );
    let needs_folder = root.is_none();
    if let Some(root) = root {
        app.state::<LibraryRegistry>()
            .register_root(&label, root)
            .map_err(|error| error.to_string())?;
    }
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("mdhere")
        .inner_size(1180.0, 760.0)
        .min_inner_size(800.0, 500.0)
        .visible(!needs_folder)
        .build()
        .map_err(|error| {
            app.state::<LibraryRegistry>().unregister(&label);
            error.to_string()
        })?;
    if needs_folder {
        if let Some(folder) = app.dialog().file().blocking_pick_folder() {
            let path = folder.into_path().map_err(|error| error.to_string())?;
            app.state::<LibraryRegistry>()
                .register_root(&label, path)
                .map_err(|error| error.to_string())?;
        }
        window.show().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_folder(
    window: tauri::Window,
    app: tauri::AppHandle,
    registry: tauri::State<'_, LibraryRegistry>,
) -> Result<Option<LibrarySnapshot>, String> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|error| error.to_string())?;
    registry
        .register_root(window.label(), path)
        .map_err(|error| error.to_string())?;
    registry
        .snapshot(window.label())
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    create_window(&app, None)
}

pub fn run() {
    let startup = LaunchRequest::parse(
        std::env::args_os().skip(1),
        &std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    );
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, cwd| {
            if let Ok(request) = LaunchRequest::parse(
                arguments.into_iter().skip(1).map(OsString::from),
                Path::new(&cwd),
            ) {
                let _ = create_window(app, request.root);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
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
            let request = startup
                .as_ref()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            create_window(app.handle(), request.root.clone()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_snapshot,
            read_document,
            refresh_library,
            open_folder,
            new_window,
            open_external_link,
            theme_catalog,
            select_theme,
            reload_themes,
            open_themes_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdhere");
}
