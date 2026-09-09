#[cfg(feature = "desktop")]
pub mod commands;
pub mod db;
pub mod domain;
pub mod errors;
pub mod indexer;
pub mod markdown;
#[cfg(feature = "desktop")]
pub mod preferences;
pub mod relations;
pub mod reminders;
#[cfg(feature = "desktop")]
pub mod windows;
pub mod workspace;
#[cfg(feature = "desktop")]
use commands::AppState;
#[cfg(feature = "desktop")]
use tauri::Manager;
#[cfg(feature = "desktop")]
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};
#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState(std::sync::Mutex::new(None)))
        .manage(windows::sidebar::SidebarState::default())
        .manage(preferences::PreferencesState::default())
        .manage(preferences::GlobalShortcutState::default())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = app.get_webview_window("main").map(|w| {
                let _ = w.show();
                let _ = w.set_focus();
            });
        }))
        .setup(|app| {
            let preferences = preferences::load(app.handle());
            preferences::apply_panel_shortcut(app.handle(), preferences.panel_shortcut.as_deref())?;
            windows::sidebar::install(app.handle())?;
            windows::sidebar::apply_preferences(app.handle(), &preferences);
            reminders::spawn_watcher(app.handle().clone());
            let open_item = MenuItem::with_id(app, "open", "Open Sonata", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Sonata", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .tooltip("Sonata")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        let _ = windows::sidebar::reveal(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        }
                    ) {
                        let _ = windows::sidebar::reveal(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_workspace,
            commands::open_workspace,
            commands::workspace_lock_status,
            commands::configure_workspace_lock,
            commands::verify_workspace_lock,
            commands::show_sidebar,
            commands::hide_sidebar,
            commands::resize_sidebar,
            commands::set_sidebar_resizing,
            commands::set_sidebar_picker_open,
            commands::preferences,
            commands::save_preferences,
            commands::reset_preferences,
            commands::autostart_enabled,
            commands::set_autostart,
            commands::list_documents,
            commands::read_document,
            commands::create_document,
            commands::update_document,
            commands::acknowledge_document_attention,
            commands::set_parent,
            commands::archive_document,
            commands::unarchive_document,
            commands::move_document_to_trash,
            commands::set_document_type,
            commands::list_tags,
            commands::list_children,
            commands::list_backlinks,
            commands::rebuild_index,
            commands::quick_capture,
            commands::import_attachment,
            commands::import_clipboard_image,
            commands::read_attachment,
            commands::reveal_attachment_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("Sonata failed to run");
}
