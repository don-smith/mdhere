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
}
