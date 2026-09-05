use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use thiserror::Error;

const THEME_SCHEMA_VERSION: u8 = 2;
pub const PREFERENCES_SCHEMA_VERSION: u8 = 1;
pub const DEFAULT_SIDEBAR_WIDTH: f64 = 304.0;
pub const DEFAULT_ZOOM: f64 = 1.0;
const BUILTIN_LIGHT_MANIFEST: &str = include_str!("../../themes/mdhere-light/theme.json");
const BUILTIN_LIGHT_CSS: &str = include_str!("../../themes/mdhere-light/reader.css");
const BUILTIN_DARK_MANIFEST: &str = include_str!("../../themes/mdhere-dark/theme.json");
const BUILTIN_DARK_CSS: &str = include_str!("../../themes/mdhere-dark/reader.css");
const BUILTIN_FIELD_NOTES_MANIFEST: &str = include_str!("../../themes/field-notes/theme.json");
const BUILTIN_FIELD_NOTES_CSS: &str = include_str!("../../themes/field-notes/reader.css");

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Light,
    Dark,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellColorsFile {
    background: String,
    panel: String,
    surface: String,
    raised_surface: String,
    foreground: String,
    foreground_strong: String,
    muted: String,
    faint: String,
    border: String,
    border_strong: String,
    accent: String,
    accent_foreground: String,
    accent_soft: String,
    hover: String,
    selected: String,
    focus: String,
    danger: String,
    warning: String,
    overlay: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellColors {
    pub background: String,
    pub panel: String,
    pub surface: String,
    pub raised_surface: String,
    pub foreground: String,
    pub foreground_strong: String,
    pub muted: String,
    pub faint: String,
    pub border: String,
    pub border_strong: String,
    pub accent: String,
    pub accent_foreground: String,
    pub accent_soft: String,
    pub hover: String,
    pub selected: String,
    pub focus: String,
    pub danger: String,
    pub warning: String,
    pub overlay: String,
}

impl ShellColors {
    fn from_file(value: ShellColorsFile) -> Result<Self, ThemeError> {
        let shell = Self {
            background: value.background,
            panel: value.panel,
            surface: value.surface,
            raised_surface: value.raised_surface,
            foreground: value.foreground,
            foreground_strong: value.foreground_strong,
            muted: value.muted,
            faint: value.faint,
            border: value.border,
            border_strong: value.border_strong,
            accent: value.accent,
            accent_foreground: value.accent_foreground,
            accent_soft: value.accent_soft,
            hover: value.hover,
            selected: value.selected,
            focus: value.focus,
            danger: value.danger,
            warning: value.warning,
            overlay: value.overlay,
        };
        shell.validate()?;
        Ok(shell)
    }

    fn validate(&self) -> Result<(), ThemeError> {
        for (name, value, has_alpha) in [
            ("background", &self.background, false),
            ("panel", &self.panel, false),
            ("surface", &self.surface, false),
            ("raisedSurface", &self.raised_surface, false),
            ("foreground", &self.foreground, false),
            ("foregroundStrong", &self.foreground_strong, false),
            ("muted", &self.muted, false),
            ("faint", &self.faint, false),
            ("border", &self.border, false),
            ("borderStrong", &self.border_strong, false),
            ("accent", &self.accent, false),
            ("accentForeground", &self.accent_foreground, false),
            ("accentSoft", &self.accent_soft, false),
            ("hover", &self.hover, false),
            ("selected", &self.selected, false),
            ("focus", &self.focus, false),
            ("danger", &self.danger, false),
            ("warning", &self.warning, false),
            ("overlay", &self.overlay, true),
        ] {
            let expected_length = if has_alpha { 9 } else { 7 };
            if value.len() != expected_length
                || !value.starts_with('#')
                || !value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                let format = if has_alpha { "#RRGGBBAA" } else { "#RRGGBB" };
                return Err(ThemeError::Manifest(format!(
                    "shell.{name} must be a {format} color"
                )));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    schema_version: u8,
    id: String,
    name: String,
    appearance: Appearance,
    shell: ShellColorsFile,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeManifest {
    pub schema_version: u8,
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
    pub shell: ShellColors,
}

impl ThemeManifest {
    pub fn from_json(value: &str) -> Result<Self, ThemeError> {
        let raw: serde_json::Value =
            serde_json::from_str(value).map_err(|error| ThemeError::Manifest(error.to_string()))?;
        if raw.get("schemaVersion").and_then(serde_json::Value::as_u64) == Some(1) {
            return Err(ThemeError::Manifest(
                "schemaVersion 1 is unsupported; migrate this package as described in docs/themes.md#v1-to-v2-migration".into(),
            ));
        }
        let parsed: ManifestFile =
            serde_json::from_value(raw).map_err(|error| ThemeError::Manifest(error.to_string()))?;
        let manifest = Self {
            schema_version: parsed.schema_version,
            id: parsed.id,
            name: parsed.name,
            appearance: parsed.appearance,
            shell: ShellColors::from_file(parsed.shell)?,
        };
        manifest.validate()?;
        Ok(manifest)
    }

    fn validate(&self) -> Result<(), ThemeError> {
        if self.schema_version == 1 {
            return Err(ThemeError::Manifest(
                "schemaVersion 1 is unsupported; migrate this package as described in docs/themes.md#v1-to-v2-migration".into(),
            ));
        }
        if self.schema_version != THEME_SCHEMA_VERSION {
            return Err(ThemeError::Manifest("schemaVersion must be 2".into()));
        }
        if self.name.trim().is_empty() {
            return Err(ThemeError::Manifest("name is required".into()));
        }
        let valid_id = !self.id.is_empty()
            && !self.id.starts_with('-')
            && !self.id.ends_with('-')
            && !self.id.contains("--")
            && self
                .id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !valid_id {
            return Err(ThemeError::Manifest(
                "id must use lower-case ASCII letters, digits, and single hyphens".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    #[serde(flatten)]
    pub manifest: ThemeManifest,
    pub css: String,
    pub builtin: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreferences {
    pub schema_version: u8,
    pub theme_id: String,
    #[serde(default)]
    pub front_matter_expanded: bool,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: f64,
    #[serde(default = "default_zoom")]
    pub zoom: f64,
}

fn default_sidebar_width() -> f64 {
    DEFAULT_SIDEBAR_WIDTH
}

fn default_zoom() -> f64 {
    DEFAULT_ZOOM
}

impl Default for ThemePreferences {
    fn default() -> Self {
        Self {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            theme_id: String::new(),
            front_matter_expanded: false,
            sidebar_width: DEFAULT_SIDEBAR_WIDTH,
            zoom: DEFAULT_ZOOM,
        }
    }
}

impl ThemePreferences {
    pub fn read(path: &Path) -> Result<Self, ThemeError> {
        let source = fs::read_to_string(path).map_err(|error| ThemeError::Io(error.to_string()))?;
        let preferences: Self = serde_json::from_str(&source)
            .map_err(|error| ThemeError::Preferences(error.to_string()))?;
        if preferences.schema_version != PREFERENCES_SCHEMA_VERSION {
            return Err(ThemeError::Preferences("schemaVersion must be 1".into()));
        }
        Ok(preferences)
    }

    pub fn read_or_default(path: &Path) -> Self {
        Self::read(path).unwrap_or_default()
    }

    pub fn replace(&self, path: &Path) -> Result<(), ThemeError> {
        let directory = path
            .parent()
            .ok_or_else(|| ThemeError::Io("preferences path has no parent directory".into()))?;
        fs::create_dir_all(directory).map_err(|error| ThemeError::Io(error.to_string()))?;
        let temporary = directory.join("preferences.tmp");
        let serialized = serde_json::to_vec_pretty(self)
            .map_err(|error| ThemeError::Preferences(error.to_string()))?;

        let result = (|| -> Result<(), ThemeError> {
            let mut file =
                fs::File::create(&temporary).map_err(|error| ThemeError::Io(error.to_string()))?;
            file.write_all(&serialized)
                .and_then(|_| file.write_all(b"\n"))
                .and_then(|_| file.sync_all())
                .map_err(|error| ThemeError::Io(error.to_string()))?;
            fs::rename(&temporary, path).map_err(|error| ThemeError::Io(error.to_string()))?;
            let _ = fs::File::open(directory).and_then(|file| file.sync_all());
            Ok(())
        })();

        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}

#[derive(Default)]
struct CatalogData {
    themes: Vec<Theme>,
    diagnostics: Vec<String>,
    selected: usize,
}

pub struct ThemeCatalog {
    builtin_dir: Option<PathBuf>,
    user_dir: PathBuf,
    preferences: PathBuf,
    data: Mutex<CatalogData>,
}

impl ThemeCatalog {
    pub fn load(
        builtin_dir: &Path,
        user_dir: &Path,
        preferences: PathBuf,
    ) -> Result<Self, ThemeError> {
        let catalog = Self {
            builtin_dir: Some(builtin_dir.into()),
            user_dir: user_dir.into(),
            preferences,
            data: Mutex::new(CatalogData::default()),
        };
        catalog.reload()?;
        Ok(catalog)
    }

    pub fn bundled(user_dir: PathBuf, preferences: PathBuf) -> Result<Self, ThemeError> {
        let catalog = Self {
            builtin_dir: None,
            user_dir,
            preferences,
            data: Mutex::new(CatalogData::default()),
        };
        catalog.reload()?;
        Ok(catalog)
    }

    pub fn themes(&self) -> Vec<Theme> {
        self.data.lock().expect("theme catalog lock").themes.clone()
    }

    pub fn diagnostics(&self) -> Vec<String> {
        self.data
            .lock()
            .expect("theme catalog lock")
            .diagnostics
            .clone()
    }

    pub fn selected(&self) -> Theme {
        let data = self.data.lock().expect("theme catalog lock");
        data.themes[data.selected].clone()
    }

    pub fn user_dir(&self) -> &Path {
        &self.user_dir
    }

    pub fn preference_path(&self) -> &Path {
        &self.preferences
    }

    pub fn select(&self, id: &str) -> Result<Theme, ThemeError> {
        let mut preferences = ThemePreferences::read_or_default(&self.preferences);
        preferences.theme_id = id.into();
        self.select_with_preferences(id, &preferences)
    }

    pub fn select_with_preferences(
        &self,
        id: &str,
        preferences: &ThemePreferences,
    ) -> Result<Theme, ThemeError> {
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("theme catalog lock was poisoned".into()))?;
        let index = data
            .themes
            .iter()
            .position(|theme| theme.manifest.id == id)
            .ok_or_else(|| ThemeError::Missing(id.into()))?;
        preferences.replace(&self.preferences)?;
        data.selected = index;
        Ok(data.themes[index].clone())
    }

    pub fn reload(&self) -> Result<(), ThemeError> {
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("theme catalog lock was poisoned".into()))?;
        let (mut themes, mut diagnostics) = self.load_builtins()?;
        if self.user_dir.exists() {
            let mut entries = Vec::new();
            for entry in
                fs::read_dir(&self.user_dir).map_err(|error| ThemeError::Io(error.to_string()))?
            {
                match entry {
                    Ok(value) => entries.push(value),
                    Err(error) => diagnostics.push(error.to_string()),
                }
            }
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                if !entry.path().is_dir() {
                    continue;
                }
                match read_package(&entry.path(), false) {
                    Ok(theme)
                        if themes
                            .iter()
                            .any(|existing| existing.manifest.id == theme.manifest.id) =>
                    {
                        diagnostics.push(format!(
                            "{}: theme id '{}' is already provided by a built-in or earlier package",
                            entry.path().display(),
                            theme.manifest.id
                        ));
                    }
                    Ok(theme) => themes.push(theme),
                    Err(error) => diagnostics.push(format!("{}: {error}", entry.path().display())),
                }
            }
        }
        let saved = match ThemePreferences::read(&self.preferences) {
            Ok(preferences) => Some(preferences.theme_id),
            Err(ThemeError::Io(_)) if !self.preferences.exists() => None,
            Err(error) => {
                diagnostics.push(format!("Theme preferences were ignored: {error}"));
                None
            }
        };
        let selected = saved
            .as_deref()
            .and_then(|id| themes.iter().position(|theme| theme.manifest.id == id))
            .unwrap_or_else(|| {
                themes
                    .iter()
                    .position(|theme| theme.manifest.appearance == Appearance::Light)
                    .unwrap_or(0)
            });
        if let Some(id) = saved.filter(|id| !themes.iter().any(|theme| &theme.manifest.id == id)) {
            diagnostics.push(format!(
                "Selected theme '{id}' is unavailable; using {}",
                themes[selected].manifest.id
            ));
        }
        *data = CatalogData {
            themes,
            diagnostics,
            selected,
        };
        Ok(())
    }

    fn load_builtins(&self) -> Result<(Vec<Theme>, Vec<String>), ThemeError> {
        if let Some(directory) = &self.builtin_dir {
            let mut entries = fs::read_dir(directory)
                .map_err(|error| ThemeError::Io(error.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| ThemeError::Io(error.to_string()))?;
            entries.sort_by_key(|entry| match entry.file_name().to_str() {
                Some("mdhere-light") => 0,
                Some("mdhere-dark") => 1,
                Some("field-notes") => 2,
                _ => 3,
            });
            let mut themes = Vec::new();
            for entry in entries {
                if entry.path().is_dir() {
                    themes.push(read_package(&entry.path(), true)?);
                }
            }
            return Ok((themes, Vec::new()));
        }
        Ok((
            vec![
                Theme {
                    manifest: ThemeManifest::from_json(BUILTIN_LIGHT_MANIFEST)?,
                    css: BUILTIN_LIGHT_CSS.into(),
                    builtin: true,
                },
                Theme {
                    manifest: ThemeManifest::from_json(BUILTIN_DARK_MANIFEST)?,
                    css: BUILTIN_DARK_CSS.into(),
                    builtin: true,
                },
                Theme {
                    manifest: ThemeManifest::from_json(BUILTIN_FIELD_NOTES_MANIFEST)?,
                    css: BUILTIN_FIELD_NOTES_CSS.into(),
                    builtin: true,
                },
            ],
            Vec::new(),
        ))
    }
}

fn read_package(directory: &Path, builtin: bool) -> Result<Theme, ThemeError> {
    let manifest = ThemeManifest::from_json(
        &fs::read_to_string(directory.join("theme.json"))
            .map_err(|error| ThemeError::Io(error.to_string()))?,
    )?;
    let css = fs::read_to_string(directory.join("reader.css"))
        .map_err(|error| ThemeError::Io(error.to_string()))?;
    if css.trim().is_empty() {
        return Err(ThemeError::Manifest("reader.css must not be empty".into()));
    }
    Ok(Theme {
        manifest,
        css,
        builtin,
    })
}

#[derive(Debug, Error)]
pub enum ThemeError {
    #[error("Invalid theme manifest: {0}")]
    Manifest(String),
    #[error("Invalid theme preferences: {0}")]
    Preferences(String),
    #[error("Theme not found: {0}")]
    Missing(String),
    #[error("Theme filesystem operation failed: {0}")]
    Io(String),
}
