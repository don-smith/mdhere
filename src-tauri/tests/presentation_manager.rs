use std::{fs, path::Path};

use mdhere_lib::{
    presentation::PresentationManager,
    themes::{DEFAULT_ZOOM, PREFERENCES_SCHEMA_VERSION, ThemePreferences},
};
use tempfile::TempDir;

const SHELL: &str = r##"{"background":"#ffffff","panel":"#ffffff","surface":"#ffffff","raisedSurface":"#ffffff","foreground":"#172033","foregroundStrong":"#101827","muted":"#5a6475","faint":"#7b8494","border":"#d9dfea","borderStrong":"#b8c3d6","accent":"#195bbd","accentForeground":"#ffffff","accentSoft":"#e5efff","hover":"#f0f4fa","selected":"#dbeafe","focus":"#195bbd","danger":"#a63838","warning":"#966614","overlay":"#17203366"}"##;

fn write_theme(root: &Path, id: &str, appearance: &str) {
    let package = root.join(id);
    fs::create_dir_all(&package).unwrap();
    fs::write(
        package.join("theme.json"),
        format!(
            r##"{{"schemaVersion":2,"id":"{id}","name":"{id}","appearance":"{appearance}","shell":{SHELL}}}"##
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
fn defaults_new_preferences_and_reads_legacy_preferences() {
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
    assert_eq!(snapshot.sidebar_width, 304.0);
    assert_eq!(snapshot.zoom, DEFAULT_ZOOM);
}

#[test]
fn persists_valid_zoom_levels_rejects_other_values_and_reloads_the_saved_level() {
    let (root, builtins, users, manager) = manager();
    let preferences = root.path().join("preferences.json");

    for zoom in [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0] {
        let snapshot = manager.set_zoom(zoom).unwrap();
        assert_eq!(snapshot.zoom, zoom);
        assert_eq!(ThemePreferences::read(&preferences).unwrap().zoom, zoom);
    }
    for invalid in [0.0, 0.81, 2.01, f64::NAN, f64::INFINITY] {
        assert!(manager.set_zoom(invalid).is_err());
    }
    assert_eq!(manager.snapshot().zoom, 2.0);

    let restarted =
        PresentationManager::load(builtins.path(), users.path(), preferences.clone()).unwrap();
    assert_eq!(restarted.snapshot().zoom, 2.0);

    fs::write(
        &preferences,
        r#"{"schemaVersion":1,"themeId":"mdhere-dark","zoom":1.2}"#,
    )
    .unwrap();
    let reloaded = restarted.reload().unwrap();
    assert_eq!(reloaded.selected.manifest.id, "mdhere-dark");
    assert_eq!(reloaded.zoom, DEFAULT_ZOOM);
}

#[test]
fn persists_a_valid_sidebar_width_and_rejects_values_outside_the_shell_bounds() {
    let (root, _, _, manager) = manager();
    let preferences = root.path().join("preferences.json");

    let snapshot = manager.set_sidebar_width(420.0).unwrap();
    assert_eq!(snapshot.sidebar_width, 420.0);
    assert_eq!(
        ThemePreferences::read(&preferences).unwrap().sidebar_width,
        420.0
    );

    for invalid in [0.0, 247.0, 561.0, f64::NAN] {
        assert!(manager.set_sidebar_width(invalid).is_err());
    }
    assert_eq!(manager.snapshot().sidebar_width, 420.0);
}

#[test]
fn writes_complete_preferences_for_both_mutation_directions() {
    let (root, _, _, manager) = manager();
    let preferences = root.path().join("preferences.json");

    manager.set_front_matter_expanded(true).unwrap();
    manager.set_sidebar_width(420.0).unwrap();
    manager.select_theme("mdhere-dark").unwrap();
    assert_eq!(
        ThemePreferences::read(&preferences).unwrap(),
        ThemePreferences {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            theme_id: "mdhere-dark".into(),
            front_matter_expanded: true,
            sidebar_width: 420.0,
            zoom: DEFAULT_ZOOM,
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
            sidebar_width: 420.0,
            zoom: DEFAULT_ZOOM,
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
    assert_eq!(snapshot.sidebar_width, 304.0);
    assert_eq!(snapshot.zoom, DEFAULT_ZOOM);
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
    assert!(manager.set_sidebar_width(420.0).is_err());
    assert!(manager.set_zoom(1.25).is_err());
    let after = manager.snapshot();
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.selected.manifest.id, before.selected.manifest.id);
    assert_eq!(after.front_matter_expanded, before.front_matter_expanded);
    assert_eq!(after.zoom, before.zoom);
    assert!(!blocked.join("preferences.tmp").exists());
}

#[test]
fn reconstructs_preferences_and_reselects_a_repaired_saved_package() {
    let (root, builtins, users, manager) = manager();
    write_theme(users.path(), "sea", "dark");
    manager.reload().unwrap();
    manager.select_theme("sea").unwrap();
    manager.set_front_matter_expanded(true).unwrap();
    manager.set_sidebar_width(420.0).unwrap();
    manager.set_zoom(1.5).unwrap();

    let restarted = PresentationManager::load(
        builtins.path(),
        users.path(),
        root.path().join("preferences.json"),
    )
    .unwrap();
    let snapshot = restarted.snapshot();
    assert_eq!(snapshot.selected.manifest.id, "sea");
    assert!(snapshot.front_matter_expanded);
    assert_eq!(snapshot.sidebar_width, 420.0);
    assert_eq!(snapshot.zoom, 1.5);

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
    assert_eq!(manager.set_sidebar_width(420.0).unwrap().revision, 2);
    assert_eq!(manager.select_theme("mdhere-dark").unwrap().revision, 3);
    assert_eq!(manager.reload().unwrap().revision, 4);
}
