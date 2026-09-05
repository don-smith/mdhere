use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;

use crate::themes::{
    DEFAULT_SIDEBAR_WIDTH, DEFAULT_ZOOM, Theme, ThemeCatalog, ThemeError, ThemePreferences,
};

const MIN_SIDEBAR_WIDTH: f64 = 248.0;
const MAX_SIDEBAR_WIDTH: f64 = 560.0;
pub const ZOOM_LEVELS: [f64; 8] = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

fn valid_sidebar_width(sidebar_width: f64) -> f64 {
    if sidebar_width.is_finite() && (MIN_SIDEBAR_WIDTH..=MAX_SIDEBAR_WIDTH).contains(&sidebar_width)
    {
        sidebar_width
    } else {
        DEFAULT_SIDEBAR_WIDTH
    }
}

fn valid_zoom(zoom: f64) -> f64 {
    if ZOOM_LEVELS.contains(&zoom) {
        zoom
    } else {
        DEFAULT_ZOOM
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationSnapshot {
    pub revision: u64,
    pub themes: Vec<Theme>,
    pub selected: Theme,
    pub diagnostics: Vec<String>,
    pub front_matter_expanded: bool,
    pub sidebar_width: f64,
    pub zoom: f64,
}

struct PresentationData {
    preferences: ThemePreferences,
    revision: u64,
}

pub struct PresentationManager {
    catalog: ThemeCatalog,
    data: Mutex<PresentationData>,
}

impl PresentationManager {
    pub fn load(
        builtin_dir: &Path,
        user_dir: &Path,
        preferences: PathBuf,
    ) -> Result<Self, ThemeError> {
        let catalog = ThemeCatalog::load(builtin_dir, user_dir, preferences)?;
        Ok(Self::from_catalog(catalog))
    }

    pub fn bundled(user_dir: PathBuf, preferences: PathBuf) -> Result<Self, ThemeError> {
        let catalog = ThemeCatalog::bundled(user_dir, preferences)?;
        Ok(Self::from_catalog(catalog))
    }

    fn from_catalog(catalog: ThemeCatalog) -> Self {
        let mut preferences = ThemePreferences::read_or_default(catalog.preference_path());
        preferences.sidebar_width = valid_sidebar_width(preferences.sidebar_width);
        preferences.zoom = valid_zoom(preferences.zoom);
        Self {
            catalog,
            data: Mutex::new(PresentationData {
                preferences,
                revision: 0,
            }),
        }
    }

    pub fn snapshot(&self) -> PresentationSnapshot {
        let data = self.data.lock().expect("presentation manager lock");
        self.snapshot_locked(&data)
    }

    pub fn select_theme(&self, id: &str) -> Result<PresentationSnapshot, ThemeError> {
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("presentation manager lock was poisoned".into()))?;
        let mut preferences = data.preferences.clone();
        preferences.theme_id = id.into();
        self.catalog.select_with_preferences(id, &preferences)?;
        data.preferences = preferences;
        data.revision += 1;
        Ok(self.snapshot_locked(&data))
    }

    pub fn reload(&self) -> Result<PresentationSnapshot, ThemeError> {
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("presentation manager lock was poisoned".into()))?;
        self.catalog.reload()?;
        data.preferences = ThemePreferences::read_or_default(self.catalog.preference_path());
        data.preferences.sidebar_width = valid_sidebar_width(data.preferences.sidebar_width);
        data.preferences.zoom = valid_zoom(data.preferences.zoom);
        data.revision += 1;
        Ok(self.snapshot_locked(&data))
    }

    pub fn set_front_matter_expanded(
        &self,
        front_matter_expanded: bool,
    ) -> Result<PresentationSnapshot, ThemeError> {
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("presentation manager lock was poisoned".into()))?;
        let mut preferences = data.preferences.clone();
        preferences.front_matter_expanded = front_matter_expanded;
        preferences.replace(self.catalog.preference_path())?;
        data.preferences = preferences;
        data.revision += 1;
        Ok(self.snapshot_locked(&data))
    }

    pub fn set_sidebar_width(
        &self,
        sidebar_width: f64,
    ) -> Result<PresentationSnapshot, ThemeError> {
        if !sidebar_width.is_finite()
            || !(MIN_SIDEBAR_WIDTH..=MAX_SIDEBAR_WIDTH).contains(&sidebar_width)
        {
            return Err(ThemeError::Preferences(format!(
                "sidebarWidth must be between {MIN_SIDEBAR_WIDTH} and {MAX_SIDEBAR_WIDTH}"
            )));
        }
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("presentation manager lock was poisoned".into()))?;
        let mut preferences = data.preferences.clone();
        preferences.sidebar_width = sidebar_width;
        preferences.replace(self.catalog.preference_path())?;
        data.preferences = preferences;
        data.revision += 1;
        Ok(self.snapshot_locked(&data))
    }

    pub fn set_zoom(&self, zoom: f64) -> Result<PresentationSnapshot, ThemeError> {
        if !ZOOM_LEVELS.contains(&zoom) {
            return Err(ThemeError::Preferences(format!(
                "zoom must be one of {}",
                ZOOM_LEVELS
                    .iter()
                    .map(|value| value.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        let mut data = self
            .data
            .lock()
            .map_err(|_| ThemeError::Io("presentation manager lock was poisoned".into()))?;
        let mut preferences = data.preferences.clone();
        preferences.zoom = zoom;
        preferences.replace(self.catalog.preference_path())?;
        data.preferences = preferences;
        data.revision += 1;
        Ok(self.snapshot_locked(&data))
    }

    pub fn user_dir(&self) -> &Path {
        self.catalog.user_dir()
    }

    fn snapshot_locked(&self, data: &PresentationData) -> PresentationSnapshot {
        PresentationSnapshot {
            revision: data.revision,
            themes: self.catalog.themes(),
            selected: self.catalog.selected(),
            diagnostics: self.catalog.diagnostics(),
            front_matter_expanded: data.preferences.front_matter_expanded,
            sidebar_width: valid_sidebar_width(data.preferences.sidebar_width),
            zoom: valid_zoom(data.preferences.zoom),
        }
    }
}
