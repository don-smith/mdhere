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

    let capabilities: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capabilities["windows"], serde_json::json!(["mdhere-*"]));

    let app_source = include_str!("../src/lib.rs");
    assert!(!app_source.contains("blocking_pick_folder"));
    assert!(app_source.contains(".pick_folder("));
}
