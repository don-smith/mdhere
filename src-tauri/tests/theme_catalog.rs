use std::{fs, path::Path};

use mdhere_lib::themes::{Appearance, ThemeCatalog, ThemeManifest, ThemePreferences};
use tempfile::TempDir;

fn write_theme(root: &Path, id: &str, manifest: &str, css: &str) {
    let package = root.join(id);
    fs::create_dir_all(&package).unwrap();
    fs::write(package.join("theme.json"), manifest).unwrap();
    fs::write(package.join("reader.css"), css).unwrap();
}

fn manifest(id: &str, appearance: &str) -> String {
    format!(
        r##"{{"schemaVersion":1,"id":"{id}","name":"{id}","appearance":"{appearance}","shell":{{"background":"#ffffff","foreground":"#172033","muted":"#5a6475","border":"#d9dfea","accent":"#195bbd"}}}}"##
    )
}

#[test]
fn retains_valid_packages_and_reports_invalid_or_duplicate_user_packages() {
    let builtins = TempDir::new().unwrap();
    let users = TempDir::new().unwrap();
    write_theme(
        builtins.path(),
        "mdhere-light",
        &manifest("mdhere-light", "light"),
        "body {}",
    );
    write_theme(users.path(), "sea", &manifest("sea", "dark"), "article {}");
    write_theme(users.path(), "broken", "{", "body {}");
    write_theme(
        users.path(),
        "mdhere-light-copy",
        &manifest("mdhere-light", "light"),
        "body {}",
    );

    let catalog = ThemeCatalog::load(
        builtins.path(),
        users.path(),
        users.path().join("preferences.json"),
    )
    .unwrap();
    assert_eq!(catalog.themes().len(), 2);
    assert_eq!(catalog.selected().manifest.id, "mdhere-light");
    assert_eq!(catalog.diagnostics().len(), 2);
}

#[test]
fn validates_manifest_shape_and_replaces_preferences_atomically() {
    assert!(ThemeManifest::from_json(&manifest("night-paper", "dark")).is_ok());
    for invalid in [
        manifest("Night", "dark"),
        manifest("two--hyphens", "dark"),
        manifest("good", "purple"),
        r#"{"schemaVersion":2,"id":"good","name":"Good","appearance":"light","shell":{}}"#.into(),
    ] {
        assert!(ThemeManifest::from_json(&invalid).is_err(), "{invalid}");
    }

    let directory = TempDir::new().unwrap();
    let path = directory.path().join("preferences.json");
    ThemePreferences {
        theme_id: "mdhere-dark".into(),
        ..ThemePreferences::default()
    }
    .replace(&path)
    .unwrap();
    assert_eq!(
        ThemePreferences::read(&path).unwrap().theme_id,
        "mdhere-dark"
    );
    assert!(!directory.path().join("preferences.tmp").exists());
}

#[test]
fn reports_malformed_preferences_without_discarding_builtin_themes() {
    let builtins = TempDir::new().unwrap();
    let users = TempDir::new().unwrap();
    write_theme(
        builtins.path(),
        "mdhere-light",
        &manifest("mdhere-light", "light"),
        "body {}",
    );
    let preferences = users.path().join("preferences.json");
    fs::write(&preferences, "{").unwrap();

    let catalog = ThemeCatalog::load(builtins.path(), users.path(), preferences).unwrap();
    assert_eq!(catalog.themes().len(), 1);
    assert!(catalog.diagnostics()[0].contains("preferences"));
}

#[test]
fn falls_back_to_matching_builtin_when_saved_theme_is_missing() {
    let builtins = TempDir::new().unwrap();
    let users = TempDir::new().unwrap();
    write_theme(
        builtins.path(),
        "mdhere-light",
        &manifest("mdhere-light", "light"),
        "body {}",
    );
    write_theme(
        builtins.path(),
        "mdhere-dark",
        &manifest("mdhere-dark", "dark"),
        "body {}",
    );
    let preferences = users.path().join("preferences.json");
    ThemePreferences {
        theme_id: "gone".into(),
        ..ThemePreferences::default()
    }
    .replace(&preferences)
    .unwrap();
    let catalog = ThemeCatalog::load(builtins.path(), users.path(), preferences).unwrap();
    assert_eq!(catalog.selected().manifest.id, "mdhere-light");
    assert_eq!(catalog.selected().manifest.appearance, Appearance::Light);
}
