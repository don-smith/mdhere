pub mod assets;
pub mod external_links;
pub mod launch;
pub mod library;
pub mod presentation;
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
use presentation::PresentationManager;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, http::Response};
#[cfg(target_os = "macos")]
use tauri::{
    TitleBarStyle,
    window::{Effect, EffectState, EffectsBuilder},
};
use tauri_plugin_dialog::DialogExt;

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
fn presentation_snapshot(
    presentation: tauri::State<'_, PresentationManager>,
) -> presentation::PresentationSnapshot {
    presentation.snapshot()
}

#[tauri::command]
fn select_theme(
    app: tauri::AppHandle,
    presentation: tauri::State<'_, PresentationManager>,
    theme_id: String,
) -> Result<presentation::PresentationSnapshot, String> {
    complete_presentation_mutation(presentation.select_theme(&theme_id), |snapshot| {
        emit_presentation_changed(&app, snapshot)
    })
}

#[tauri::command]
fn reload_themes(
    app: tauri::AppHandle,
    presentation: tauri::State<'_, PresentationManager>,
) -> Result<presentation::PresentationSnapshot, String> {
    complete_presentation_mutation(presentation.reload(), |snapshot| {
        emit_presentation_changed(&app, snapshot)
    })
}

#[tauri::command]
fn set_front_matter_expanded(
    app: tauri::AppHandle,
    presentation: tauri::State<'_, PresentationManager>,
    expanded: bool,
) -> Result<presentation::PresentationSnapshot, String> {
    complete_presentation_mutation(
        presentation.set_front_matter_expanded(expanded),
        |snapshot| emit_presentation_changed(&app, snapshot),
    )
}

#[tauri::command]
fn set_sidebar_width(
    app: tauri::AppHandle,
    presentation: tauri::State<'_, PresentationManager>,
    width: f64,
) -> Result<presentation::PresentationSnapshot, String> {
    complete_presentation_mutation(presentation.set_sidebar_width(width), |snapshot| {
        emit_presentation_changed(&app, snapshot)
    })
}

fn complete_presentation_mutation(
    mutation: Result<presentation::PresentationSnapshot, themes::ThemeError>,
    emit: impl FnOnce(&presentation::PresentationSnapshot) -> Result<(), String>,
) -> Result<presentation::PresentationSnapshot, String> {
    let snapshot = mutation.map_err(|error| error.to_string())?;
    emit(&snapshot)?;
    Ok(snapshot)
}

fn emit_presentation_changed(
    app: &AppHandle,
    snapshot: &presentation::PresentationSnapshot,
) -> Result<(), String> {
    app.emit("presentation-changed", snapshot)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_themes_folder(presentation: tauri::State<'_, PresentationManager>) -> Result<(), String> {
    std::fs::create_dir_all(presentation.user_dir()).map_err(|error| error.to_string())?;
    tauri_plugin_opener::open_path(presentation.user_dir(), None::<&str>)
        .map_err(|error| error.to_string())
}

static NEXT_WINDOW_LABEL: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderPickResult {
    snapshot: Option<LibrarySnapshot>,
    error: Option<String>,
}

fn request_folder(app: AppHandle, window: tauri::WebviewWindow) {
    let label = window.label().to_owned();
    let callback_window = window.clone();
    app.dialog().file().pick_folder(move |folder| {
        let result = folder
            .map(|folder| {
                let path = folder.into_path().map_err(|error| error.to_string())?;
                let registry = app.state::<LibraryRegistry>();
                registry
                    .register_root(&label, path)
                    .map_err(|error| error.to_string())?;
                registry.snapshot(&label).map_err(|error| error.to_string())
            })
            .transpose();

        let payload = match result {
            Ok(snapshot) => FolderPickResult {
                snapshot,
                error: None,
            },
            Err(error) => FolderPickResult {
                snapshot: None,
                error: Some(error),
            },
        };
        let _ = callback_window.emit("folder-picked", payload);
    });
}

fn create_window(app: &AppHandle, root: Option<PathBuf>) -> Result<(), String> {
    let label = format!(
        "mdhere-{}",
        NEXT_WINDOW_LABEL.fetch_add(1, Ordering::Relaxed)
    );
    if let Some(root) = root {
        app.state::<LibraryRegistry>()
            .register_root(&label, root)
            .map_err(|error| error.to_string())?;
    }
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("mdhere")
        .inner_size(1180.0, 760.0)
        .min_inner_size(800.0, 500.0)
        .visible(true);
    #[cfg(target_os = "macos")]
    let window = window
        .transparent(true)
        .title_bar_style(TitleBarStyle::Transparent)
        .effects(
            EffectsBuilder::new()
                .effect(Effect::HeaderView)
                .state(EffectState::Active)
                .build(),
        );
    let _window = window.build().map_err(|error| {
        app.state::<LibraryRegistry>().unregister(&label);
        error.to_string()
    })?;
    Ok(())
}

#[tauri::command]
fn open_folder(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    request_folder(app, window);
    Ok(())
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
                PresentationManager::bundled(
                    app_data.join("themes"),
                    app_data.join("preferences.json"),
                )
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
            presentation_snapshot,
            select_theme,
            reload_themes,
            set_front_matter_expanded,
            set_sidebar_width,
            open_themes_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdhere");
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;
    use tempfile::TempDir;

    fn manager() -> (TempDir, PresentationManager) {
        let root = TempDir::new().unwrap();
        let manager = PresentationManager::bundled(
            root.path().join("themes"),
            root.path().join("preferences.json"),
        )
        .unwrap();
        (root, manager)
    }

    #[test]
    fn presentation_mutations_return_the_exact_full_snapshot_that_is_emitted() {
        let (_root, manager) = manager();
        for mutation in [
            manager.select_theme("mdhere-dark"),
            manager.reload(),
            manager.set_front_matter_expanded(true),
            manager.set_sidebar_width(420.0),
        ] {
            let emitted = RefCell::new(None);
            let returned = complete_presentation_mutation(mutation, |snapshot| {
                *emitted.borrow_mut() = Some(snapshot.clone());
                Ok(())
            })
            .unwrap();
            let published = emitted.into_inner().expect("snapshot was emitted");

            assert_eq!(returned.revision, published.revision);
            assert_eq!(
                returned.selected.manifest.id,
                published.selected.manifest.id
            );
            assert_eq!(
                returned.front_matter_expanded,
                published.front_matter_expanded
            );
            assert_eq!(returned.sidebar_width, published.sidebar_width);
            assert_eq!(returned.diagnostics, published.diagnostics);
            assert_eq!(returned.themes.len(), 3);
            assert_eq!(returned.themes.len(), published.themes.len());
        }
    }

    #[test]
    fn failed_presentation_mutations_are_not_emitted() {
        let (_root, manager) = manager();
        let emitted = RefCell::new(false);
        let result = complete_presentation_mutation(manager.select_theme("missing"), |_| {
            *emitted.borrow_mut() = true;
            Ok(())
        });

        assert!(result.is_err());
        assert!(!emitted.into_inner());
    }
}
