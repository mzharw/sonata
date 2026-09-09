use crate::errors::{Result, SonataError};
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutPreferences {
    pub search: String,
    pub palette: String,
    pub capture: String,
    pub new_note: String,
}

impl Default for ShortcutPreferences {
    fn default() -> Self {
        Self {
            search: "Alt+S".into(),
            palette: "Alt+K".into(),
            capture: "CmdOrCtrl+N".into(),
            new_note: "CmdOrCtrl+Shift+N".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub version: u8,
    pub theme: String,
    pub accent: String,
    pub density: String,
    pub motion: String,
    pub hover_enabled: bool,
    pub auto_hide: bool,
    pub hover_delay_ms: u64,
    pub pause_hover_fullscreen: bool,
    pub show_tags: bool,
    pub show_quick_add: bool,
    pub panel_shortcut: Option<String>,
    pub shortcuts: ShortcutPreferences,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel_width: Option<u32>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            theme: "system".into(),
            accent: "green".into(),
            density: "comfortable".into(),
            motion: "system".into(),
            hover_enabled: true,
            auto_hide: true,
            hover_delay_ms: 250,
            pause_hover_fullscreen: false,
            show_tags: true,
            show_quick_add: true,
            panel_shortcut: None,
            shortcuts: ShortcutPreferences::default(),
            panel_width: None,
        }
    }
}

#[derive(Default)]
pub struct PreferencesState(pub Mutex<Preferences>);
#[derive(Default)]
pub struct GlobalShortcutState(pub Mutex<Option<String>>);

fn path(app: &AppHandle) -> Result<std::path::PathBuf> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| SonataError::WorkspaceUnavailable(error.to_string()))?;
    Ok(directory.join("preferences.json"))
}

fn valid_choice(value: &str, choices: &[&str]) -> bool {
    choices.contains(&value)
}

pub fn validate(preferences: &Preferences) -> Result<()> {
    if !valid_choice(&preferences.theme, &["system", "light", "dark"])
        || !valid_choice(&preferences.accent, &["green", "blue", "violet", "amber"])
        || !valid_choice(&preferences.density, &["comfortable", "compact"])
        || !valid_choice(&preferences.motion, &["system", "reduced"])
        || ![150, 250, 500].contains(&preferences.hover_delay_ms)
    {
        return Err(SonataError::InvalidMetadata(
            "invalid personal preference".into(),
        ));
    }
    let bindings = [
        &preferences.shortcuts.search,
        &preferences.shortcuts.palette,
        &preferences.shortcuts.capture,
        &preferences.shortcuts.new_note,
    ];
    if bindings.iter().any(|binding| binding.trim().is_empty())
        || bindings.iter().enumerate().any(|(index, binding)| {
            bindings
                .iter()
                .skip(index + 1)
                .any(|other| binding.eq_ignore_ascii_case(other))
        })
    {
        return Err(SonataError::InvalidMetadata(
            "shortcuts must be non-empty and unique".into(),
        ));
    }
    if preferences.panel_shortcut.as_ref().is_some_and(|shortcut| {
        bindings
            .iter()
            .any(|binding| binding.eq_ignore_ascii_case(shortcut))
    }) {
        return Err(SonataError::InvalidMetadata(
            "panel shortcut conflicts with an app shortcut".into(),
        ));
    }
    Ok(())
}

pub fn load(app: &AppHandle) -> Preferences {
    let loaded = path(app)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<Preferences>(&bytes).ok());
    let preferences = loaded
        .filter(|preferences| validate(preferences).is_ok())
        .unwrap_or_default();
    if let Ok(mut state) = app.state::<PreferencesState>().0.lock() {
        *state = preferences.clone();
    }
    preferences
}

pub fn current(app: &AppHandle) -> Preferences {
    app.state::<PreferencesState>()
        .0
        .lock()
        .map(|state| state.clone())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, preferences: Preferences) -> Result<Preferences> {
    validate(&preferences)?;
    apply_panel_shortcut(app, preferences.panel_shortcut.as_deref())?;
    let destination = path(app)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = destination.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&preferences)
            .map_err(|error| SonataError::InvalidMetadata(error.to_string()))?,
    )?;
    fs::rename(temporary, destination)?;
    if let Ok(mut state) = app.state::<PreferencesState>().0.lock() {
        *state = preferences.clone();
    }
    crate::windows::sidebar::apply_preferences(app, &preferences);
    Ok(preferences)
}

pub fn reset(app: &AppHandle) -> Result<Preferences> {
    save(app, Preferences::default())
}

/// Register the new key before releasing the old one, so an unavailable key
/// never leaves the user without their working panel shortcut.
pub fn apply_panel_shortcut(app: &AppHandle, next: Option<&str>) -> Result<()> {
    let state = app.state::<GlobalShortcutState>();
    let mut current = state
        .0
        .lock()
        .map_err(|_| SonataError::WorkspaceUnavailable("shortcut state lock failed".into()))?;
    if current.as_deref() == next {
        return Ok(());
    }
    if let Some(shortcut) = next {
        app.global_shortcut()
            .on_shortcut(shortcut, |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    let open = app
                        .state::<crate::windows::sidebar::SidebarState>()
                        .0
                        .lock()
                        .map(|state| state.is_open)
                        .unwrap_or(false);
                    let _ = if open {
                        crate::windows::sidebar::conceal(app)
                    } else {
                        crate::windows::sidebar::reveal(app)
                    };
                }
            })
            .map_err(|error| {
                SonataError::InvalidMetadata(format!("Shortcut is unavailable: {error}"))
            })?;
    }
    if let Some(previous) = current.as_deref() {
        let _ = app.global_shortcut().unregister(previous);
    }
    *current = next.map(str::to_owned);
    Ok(())
}

pub fn record_panel_width(app: &AppHandle, width: u32) {
    let mut preferences = current(app);
    preferences.panel_width = Some(width);
    let _ = save(app, preferences);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_preserve_the_existing_sidebar_experience() {
        let preferences = Preferences::default();
        assert!(preferences.hover_enabled && preferences.auto_hide);
        assert_eq!(preferences.hover_delay_ms, 250);
        assert!(preferences.panel_shortcut.is_none());
        assert!(validate(&preferences).is_ok());
    }
    #[test]
    fn duplicate_shortcuts_are_rejected() {
        let mut preferences = Preferences::default();
        preferences.shortcuts.palette = preferences.shortcuts.search.clone();
        assert!(validate(&preferences).is_err());
    }
}
