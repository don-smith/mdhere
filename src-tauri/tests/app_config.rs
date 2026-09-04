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

    assert_eq!(config["bundle"]["targets"], serde_json::json!(["app"]));
    assert_eq!(
        config["bundle"]["icon"],
        serde_json::json!(["icons/icon.icns"])
    );
    assert_eq!(config["bundle"]["resources"], serde_json::json!(["themes"]));
    assert_eq!(config["bundle"]["macOS"]["minimumSystemVersion"], "13.0");
    assert_eq!(config["app"]["macOSPrivateApi"], true);

    let capabilities: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capabilities["windows"], serde_json::json!(["mdhere-*"]));

    let app_source = include_str!("../src/lib.rs");
    assert!(!app_source.contains("blocking_pick_folder"));
    assert!(app_source.contains(".pick_folder("));
    assert!(app_source.contains(".visible(true)"));
    assert!(app_source.contains("#[cfg(target_os = \"macos\")]"));
    assert!(app_source.contains(".transparent(true)"));
    assert!(app_source.contains("TitleBarStyle::Transparent"));
    assert!(app_source.contains("Effect::HeaderView"));
    assert!(app_source.contains("EffectState::Active"));
    assert_eq!(
        app_source.matches("request_folder(").count(),
        2,
        "folder selection must be triggered only by the open_folder command"
    );
}
