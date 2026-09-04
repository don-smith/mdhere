use std::{fs, path::Path};

use mdhere_lib::{
    presentation::PresentationManager,
    themes::{PREFERENCES_SCHEMA_VERSION, ThemePreferences},
};
use tempfile::TempDir;

fn write_theme(root: &Path, id: &str, appearance: &str) {
    let package = root.join(id);
    fs::create_dir_all(&package).unwrap();
    fs::write(
        package.join("theme.json"),
        format!(
            r##"{{"schemaVersion":1,"id":"{id}","name":"{id}","appearance":"{appearance}","shell":{{"background":"#ffffff","foreground":"#172033","muted":"#5a6475","border":"#d9dfea","accent":"#195bbd"}}}}"##
        ),
    )
    .unwrap();
    fs::write(package.join("reader.css"), "body {}").unwrap();
}

fn manager() -> (TempDir, TempDir, TempDir, PresentationManager) {
    let root = TempDir::new().unwrap();
    let builtins = TempDir::new().unwrap();
    let users = TempDir::new().unwrap();
    write_theme(builtins.path(), "mdhere-light", "light");
    write_theme(builtins.path(), "mdhere-dark", "dark");
    let manager = PresentationManager::load(
        builtins.path(),
        users.path(),
        root.path().join("preferences.json"),
    )
    .unwrap();
    (root, builtins, users, manager)
}

#[test]
fn defaults_the_disclosure_to_collapsed_and_reads_legacy_preferences() {
    let (root, builtins, users, _) = manager();
    let preferences = root.path().join("preferences.json");
    fs::write(
        &preferences,
        r#"{"schemaVersion":1,"themeId":"mdhere-dark"}"#,
    )
    .unwrap();

    let manager = PresentationManager::load(builtins.path(), users.path(), preferences).unwrap();
    let snapshot = manager.snapshot();
    assert_eq!(snapshot.selected.manifest.id, "mdhere-dark");
    assert!(!snapshot.front_matter_expanded);
}

#[test]
fn writes_complete_preferences_for_both_mutation_directions() {
    let (root, _, _, manager) = manager();
    let preferences = root.path().join("preferences.json");

    manager.set_front_matter_expanded(true).unwrap();
    manager.select_theme("mdhere-dark").unwrap();
    assert_eq!(
        ThemePreferences::read(&preferences).unwrap(),
        ThemePreferences {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            theme_id: "mdhere-dark".into(),
            front_matter_expanded: true,
        }
    );

    manager.select_theme("mdhere-light").unwrap();
    manager.set_front_matter_expanded(false).unwrap();
    assert_eq!(
        ThemePreferences::read(&preferences).unwrap(),
        ThemePreferences {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            theme_id: "mdhere-light".into(),
            front_matter_expanded: false,
        }
    );
    assert!(!root.path().join("preferences.tmp").exists());
}

#[test]
fn malformed_preferences_fall_back_with_a_diagnostic() {
    let (root, builtins, users, _) = manager();
    let preferences = root.path().join("preferences.json");
    fs::write(&preferences, "{").unwrap();

    let manager = PresentationManager::load(builtins.path(), users.path(), preferences).unwrap();
    let snapshot = manager.snapshot();
    assert_eq!(snapshot.selected.manifest.id, "mdhere-light");
    assert!(!snapshot.front_matter_expanded);
    assert!(
        snapshot
            .diagnostics
            .iter()
            .any(|item| item.contains("preferences"))
    );
}

#[test]
fn failed_writes_do_not_change_memory_or_publish_a_temporary_file() {
    let root = TempDir::new().unwrap();
    let builtins = TempDir::new().unwrap();
    let users = TempDir::new().unwrap();
    write_theme(builtins.path(), "mdhere-light", "light");
    write_theme(builtins.path(), "mdhere-dark", "dark");
    let blocked = root.path().join("blocked");
    fs::write(&blocked, "not a directory").unwrap();
    let manager = PresentationManager::load(
        builtins.path(),
        users.path(),
        blocked.join("preferences.json"),
    )
    .unwrap();

    let before = manager.snapshot();
    assert!(manager.select_theme("mdhere-dark").is_err());
    assert!(manager.set_front_matter_expanded(true).is_err());
    let after = manager.snapshot();
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.selected.manifest.id, before.selected.manifest.id);
    assert_eq!(after.front_matter_expanded, before.front_matter_expanded);
    assert!(!blocked.join("preferences.tmp").exists());
}

#[test]
fn reconstructs_preferences_and_reselects_a_repaired_saved_package() {
    let (root, builtins, users, manager) = manager();
    write_theme(users.path(), "sea", "dark");
    manager.reload().unwrap();
    manager.select_theme("sea").unwrap();
    manager.set_front_matter_expanded(true).unwrap();

    let restarted = PresentationManager::load(
        builtins.path(),
        users.path(),
        root.path().join("preferences.json"),
    )
    .unwrap();
    let snapshot = restarted.snapshot();
    assert_eq!(snapshot.selected.manifest.id, "sea");
    assert!(snapshot.front_matter_expanded);

    fs::write(users.path().join("sea/theme.json"), "{").unwrap();
    let snapshot = restarted.reload().unwrap();
    assert_eq!(snapshot.selected.manifest.id, "mdhere-light");
    assert_eq!(
        ThemePreferences::read(&root.path().join("preferences.json"))
            .unwrap()
            .theme_id,
        "sea"
    );

    write_theme(users.path(), "sea", "dark");
    let snapshot = restarted.reload().unwrap();
    assert_eq!(snapshot.selected.manifest.id, "sea");
}

#[test]
fn snapshots_use_monotonic_revisions() {
    let (_root, _builtins, _users, manager) = manager();
    assert_eq!(manager.snapshot().revision, 0);
    assert_eq!(manager.set_front_matter_expanded(true).unwrap().revision, 1);
    assert_eq!(manager.select_theme("mdhere-dark").unwrap().revision, 2);
    assert_eq!(manager.reload().unwrap().revision, 3);
}
