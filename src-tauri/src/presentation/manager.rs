use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;

use crate::themes::{Theme, ThemeCatalog, ThemeError, ThemePreferences};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationSnapshot {
    pub revision: u64,
    pub themes: Vec<Theme>,
    pub selected: Theme,
    pub diagnostics: Vec<String>,
    pub front_matter_expanded: bool,
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
        let preferences = ThemePreferences::read_or_default(catalog.preference_path());
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
        }
    }
}
