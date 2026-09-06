use serde_json::Value;

#[test]
fn production_windows_are_created_by_the_coordinator_not_static_config() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert_eq!(config["app"]["windows"].as_array().unwrap().len(), 0);
    assert!(
        config["app"]["security"]["csp"]
            .as_str()
            .unwrap()
            .contains("mdhere-asset:")
    );

    assert_eq!(config["productName"], "mdhere");
    assert_eq!(config["version"], "../package.json");
    assert_eq!(config["bundle"]["targets"], serde_json::json!(["app"]));
    assert_eq!(
        config["bundle"]["icon"],
        serde_json::json!([
            "icons/32x32.png",
            "icons/128x128.png",
            "icons/128x128@2x.png",
            "icons/icon.icns",
            "icons/icon.ico"
        ])
    );
    assert_eq!(
        config["bundle"]["resources"],
        serde_json::json!({
            "themes": "themes",
            "../THIRD_PARTY_LICENSES.md": "licenses/THIRD_PARTY_LICENSES.md",
            "../src/assets/fonts/inventory.json": "licenses/fonts/inventory.json",
            "../src/assets/fonts/LICENSE-Source-Sans-3.md": "licenses/fonts/LICENSE-Source-Sans-3.md",
            "../src/assets/fonts/LICENSE-Source-Serif-4.md": "licenses/fonts/LICENSE-Source-Serif-4.md"
        })
    );
    assert_eq!(config["bundle"]["macOS"]["minimumSystemVersion"], "13.0");
    assert_eq!(config["app"]["macOSPrivateApi"], true);

    let capabilities: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capabilities["windows"], serde_json::json!(["mdhere"]));
    assert_eq!(
        capabilities["permissions"],
        serde_json::json!(["core:default"])
    );

    let app_source = include_str!("../src/lib.rs");
    assert!(!app_source.contains("blocking_pick_folder"));
    assert!(app_source.contains(".pick_folder("));
    assert!(app_source.contains(".visible(true)"));
    assert!(app_source.contains("#[cfg(target_os = \"macos\")]"));
    assert!(app_source.contains("TitleBarStyle::Transparent"));
    assert!(app_source.contains("NSColor::windowBackgroundColor"));
    assert!(app_source.contains("setBackgroundColor"));
    assert!(!app_source.contains(".transparent(true)"));
    assert!(!app_source.contains(".effects("));
    assert!(!app_source.contains("zoom_hotkeys_enabled"));
    assert!(app_source.contains("window.set_zoom(snapshot.zoom)"));
    assert!(app_source.contains("app.webview_windows()"));
    assert_eq!(
        app_source.matches("create_window(").count(),
        2,
        "only setup may create the fixed reader window"
    );
    assert!(app_source.contains("focus_main_window(app)"));
    assert!(app_source.contains(".emit(LAUNCH_UPDATE_EVENT, update)"));
    let manifest = include_str!("../Cargo.toml");
    assert!(manifest.contains("objc2-app-kit"));

    let package: Value = serde_json::from_str(include_str!("../../package.json")).unwrap();
    let version = package["version"].as_str().unwrap();
    assert!(!version.is_empty());
    assert!(manifest.contains(&format!("name = \"mdhere\"\nversion = \"{version}\"")));
    let lock = include_str!("../Cargo.lock");
    assert!(lock.contains(&format!("name = \"mdhere\"\nversion = \"{version}\"")));
    assert_eq!(
        package["scripts"]["bundle:macos"],
        "tauri build --target universal-apple-darwin --bundles dmg"
    );
    assert_eq!(
        package["scripts"]["bundle:linux"],
        "tauri build --target x86_64-unknown-linux-gnu --bundles appimage"
    );
    assert_eq!(
        package["scripts"]["bundle:windows"],
        "tauri build --target x86_64-pc-windows-msvc --bundles nsis"
    );

    let windows_icon = include_bytes!("../icons/icon.ico");
    assert!(windows_icon.len() > 4);
    assert_eq!(&windows_icon[..4], &[0, 0, 1, 0]);
    assert_eq!(
        app_source.matches("request_folder(").count(),
        2,
        "folder selection must be triggered only by the open_folder command"
    );
}
