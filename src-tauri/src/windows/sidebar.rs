use std::{sync::Mutex, thread, time::Duration};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

// Panel widths are written in logical (CSS) pixels and converted with the
// monitor's scale factor. A fixed physical count cannot suit both machines: 760
// physical pixels is 40% of a 1080p desktop, a fifth of a 4K one, and on a
// HiDPI laptop at 200% it leaves the UI only 380 CSS pixels to lay out in.
const MIN_PANEL_LOGICAL: f64 = 420.0;
// `.shell` caps its content at 720 CSS pixels, so a little past that is as
// wide as the panel is worth dragging: the rest is empty margin.
const MAX_PANEL_LOGICAL: f64 = 900.0;
// Share of the monitor the panel takes before anyone has dragged it, so a
// bigger screen gets a proportionally bigger panel instead of the same slab.
const DEFAULT_PANEL_FRACTION: f64 = 0.26;
// Ceiling on that share: on a small screen the panel stays a panel.
const MAX_PANEL_FRACTION: f64 = 0.45;
// Desktop left uncovered beside the panel, in logical pixels.
const DESKTOP_MARGIN_LOGICAL: f64 = 48.0;
// Only reached when the monitor cannot be queried at all.
#[cfg(windows)]
const FALLBACK_PANEL_WIDTH: u32 = 520;
// Only the Windows edge monitor reads these; gating them to match keeps a
// non-Windows build from tripping the dead-code lint over geometry it never
// compiles.
#[cfg(windows)]
const EDGE_ZONE_WIDTH: i32 = 32;
#[cfg(windows)]
const EDGE_ZONE_MIN_HEIGHT: i32 = 240;
#[cfg(windows)]
const RESIZE_TOLERANCE: i32 = 48;
#[cfg(windows)]
const LEAVE_DELAY: Duration = Duration::from_millis(250);
const FRAMES: i32 = 12;
const FRAME_DELAY: Duration = Duration::from_millis(12);

#[derive(Default)]
pub struct SidebarState(pub Mutex<SidebarTransition>);

#[derive(Default)]
pub struct SidebarTransition {
    pub is_open: bool,
    pub is_resizing: bool,
    /// A native file/folder dialog has focus. Auto-hide must pause until the
    /// pointer has returned to the panel after the dialog closes.
    pub is_picker_open: bool,
    /// Set once the user drags the edge. `None` means "follow the monitor",
    /// so a display or scaling change is picked up instead of carried over.
    pub width: Option<u32>,
    pub generation: u64,
    pub hover_enabled: bool,
    pub auto_hide: bool,
    pub hover_delay: Duration,
    pub pause_hover_fullscreen: bool,
}

/// Physical-pixel panel geometry for one monitor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PanelBounds {
    default: u32,
    min: u32,
    max: u32,
}

fn panel_bounds_for(monitor_width: u32, scale_factor: f64) -> PanelBounds {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let physical = |logical: f64| (logical * scale).round().max(1.0) as u32;
    let share = |fraction: f64| (monitor_width as f64 * fraction).round() as u32;
    let ceiling = monitor_width
        .saturating_sub(physical(DESKTOP_MARGIN_LOGICAL))
        .max(1);
    let min = physical(MIN_PANEL_LOGICAL).min(ceiling);
    let max = physical(MAX_PANEL_LOGICAL)
        .min(share(MAX_PANEL_FRACTION))
        .min(ceiling)
        .max(min);
    PanelBounds {
        default: share(DEFAULT_PANEL_FRACTION).clamp(min, max),
        min,
        max,
    }
}

fn panel_bounds(app: &AppHandle) -> tauri::Result<PanelBounds> {
    let monitor = app
        .primary_monitor()?
        .ok_or_else(|| tauri::Error::AssetNotFound("primary monitor unavailable".into()))?;
    Ok(panel_bounds_for(
        monitor.size().width,
        monitor.scale_factor(),
    ))
}

/// The width to show the panel at: the width the user dragged it to, else this
/// monitor's default share. Re-clamped on every use so a width chosen on one
/// display cannot outlive a move to a smaller one.
fn panel_width(app: &AppHandle) -> tauri::Result<u32> {
    let bounds = panel_bounds(app)?;
    let chosen = {
        let sidebar = app.state::<SidebarState>();
        let state = sidebar.0.lock().expect("sidebar state lock");
        state.width
    };
    Ok(chosen.map_or(bounds.default, |width| width.clamp(bounds.min, bounds.max)))
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let main = main_window(app)?;
    let (right, top, height) = primary_monitor_area(app)?;
    main.set_always_on_top(true)?;
    main.set_skip_taskbar(true)?;
    main.set_resizable(false)?;
    main.set_size(PhysicalSize::new(panel_width(app)?, height))?;
    main.set_position(PhysicalPosition::new(right, top))?;
    main.hide()?;
    start_windows_edge_monitor(app.clone());

    let app_handle = app.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = conceal(&app_handle);
        }
    });
    Ok(())
}

pub fn apply_preferences(app: &AppHandle, preferences: &crate::preferences::Preferences) {
    let sidebar = app.state::<SidebarState>();
    if let Ok(mut state) = sidebar.0.lock() {
        state.hover_enabled = preferences.hover_enabled;
        state.auto_hide = preferences.auto_hide;
        state.hover_delay = Duration::from_millis(preferences.hover_delay_ms);
        state.pause_hover_fullscreen = preferences.pause_hover_fullscreen;
        state.width = preferences.panel_width;
    };
}

pub fn reveal(app: &AppHandle) -> tauri::Result<()> {
    let main = main_window(app)?;
    let (right, top, height) = primary_monitor_area(app)?;
    let generation = {
        let sidebar = app.state::<SidebarState>();
        let mut state = sidebar.0.lock().expect("sidebar state lock");
        if state.is_open {
            // Duplicate tray events must not invalidate an in-flight reveal
            // animation. Windows reports both mouse-down and mouse-up.
            return Ok(());
        }
        state.is_open = true;
        state.generation += 1;
        state.generation
    };
    let width = panel_width(app)? as i32;
    main.set_size(PhysicalSize::new(width as u32, height))?;
    main.set_position(PhysicalPosition::new(right, top))?;
    main.show()?;
    main.set_focus()?;
    animate(app.clone(), main, generation, right, right - width, top);
    Ok(())
}

pub fn conceal(app: &AppHandle) -> tauri::Result<()> {
    let main = main_window(app)?;
    let (right, top, _) = primary_monitor_area(app)?;
    let generation = {
        let sidebar = app.state::<SidebarState>();
        let mut state = sidebar.0.lock().expect("sidebar state lock");
        if !state.is_open {
            return Ok(());
        }
        state.is_open = false;
        state.generation += 1;
        state.generation
    };
    let width = panel_width(app)? as i32;
    animate(
        app.clone(),
        main.clone(),
        generation,
        right - width,
        right,
        top,
    );
    let app_handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(170));
        let sidebar = app_handle.state::<SidebarState>();
        let state = sidebar.0.lock().expect("sidebar state lock");
        if state.is_open || state.generation != generation {
            return;
        }
        drop(state);
        let _ = main.hide();
    });
    Ok(())
}

/// Changes only the sidebar width and reanchors it against the physical right
/// side of the selected monitor.
pub fn resize_from_left(app: &AppHandle, requested_width: u32) -> tauri::Result<()> {
    // The first resize IPC call may arrive before the pointer-down state
    // update. Marking this here closes that race for fast drags.
    set_resizing(app, true);
    let main = main_window(app)?;
    let (right, top, height) = primary_monitor_area(app)?;
    let bounds = panel_bounds(app)?;
    let width = requested_width.clamp(bounds.min, bounds.max);
    {
        let sidebar = app.state::<SidebarState>();
        let mut state = sidebar.0.lock().expect("sidebar state lock");
        state.width = Some(width);
    }
    crate::preferences::record_panel_width(app, width);
    #[cfg(windows)]
    {
        // SetWindowPos applies the new rectangle as one native operation.  A
        // sequential set_size + set_position briefly exposed the old right
        // edge between messages, which looked like a detached/glitching panel.
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };
        let hwnd = main.hwnd()?;
        let result = unsafe {
            SetWindowPos(
                hwnd.0,
                std::ptr::null_mut(),
                right - width as i32,
                top,
                width as i32,
                height as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
        };
        if result == 0 {
            return Err(tauri::Error::AssetNotFound(
                "Windows could not resize the sidebar".into(),
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        main.set_size(PhysicalSize::new(width, height))?;
        main.set_position(PhysicalPosition::new(right - width as i32, top))
    }
}

pub fn set_resizing(app: &AppHandle, resizing: bool) {
    let sidebar = app.state::<SidebarState>();
    if let Ok(mut state) = sidebar.0.lock() {
        // A reveal/conceal animation also moves the window. Cancel it before
        // the first resize rectangle is applied, otherwise its remaining
        // frames can briefly pull the panel away from the right edge.
        if resizing && !state.is_resizing {
            state.generation += 1;
        }
        state.is_resizing = resizing;
    };
}

/// Pauses auto-hide while a native file or folder picker is active. Starting
/// the pause also cancels an already-queued conceal animation.
pub fn set_picker_open(app: &AppHandle, picker_open: bool) {
    let sidebar = app.state::<SidebarState>();
    if let Ok(mut state) = sidebar.0.lock() {
        if picker_open && !state.is_picker_open {
            state.generation += 1;
        }
        state.is_picker_open = picker_open;
    };
    // Tauri parents the Windows picker to this window. A topmost parent can
    // keep the cursor in the WebView's hit-test path when the picker was
    // opened from Enter/Space (which has no mouse event to refresh it). Let
    // the native dialog own the normal z-order until it closes.
    #[cfg(windows)]
    if let Ok(main) = main_window(app) {
        let _ = main.set_always_on_top(!picker_open);
    }
}

fn main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    app.get_webview_window("main")
        .ok_or_else(|| tauri::Error::AssetNotFound("main window".into()))
}

/// Uses the monitor's physical right edge for attachment, but the work area's
/// vertical bounds so the panel stops above the taskbar.
fn primary_monitor_area(app: &AppHandle) -> tauri::Result<(i32, i32, u32)> {
    let monitor = app
        .primary_monitor()?
        .ok_or_else(|| tauri::Error::AssetNotFound("primary monitor unavailable".into()))?;
    let position = monitor.position();
    let size = monitor.size();
    let work_area = monitor.work_area();
    Ok((
        position.x + size.width as i32,
        work_area.position.y,
        work_area.size.height,
    ))
}

#[cfg(windows)]
fn start_windows_edge_monitor(app: AppHandle) {
    use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};

    thread::spawn(move || {
        let mut was_in_activation_zone = false;
        let mut left_panel_at: Option<std::time::Instant> = None;
        // Leaving to select a file is intentional. Keep the panel up until
        // the pointer returns to it, then resume the normal leave behavior.
        let mut waiting_for_panel_reentry = false;
        loop {
            let pointer = app.primary_monitor().ok().flatten().and_then(|monitor| {
                let mut point = POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut point) == 0 } {
                    return None;
                }
                let position = monitor.position();
                let size = monitor.size();
                Some((
                    point.x,
                    point.y,
                    position.x,
                    position.y,
                    size.width as i32,
                    size.height as i32,
                ))
            });

            let (hover_enabled, auto_hide, hover_delay, pause_hover_fullscreen) = {
                let sidebar = app.state::<SidebarState>();
                let state = sidebar.0.lock().expect("sidebar state lock");
                (
                    state.hover_enabled,
                    state.auto_hide,
                    state.hover_delay,
                    state.pause_hover_fullscreen,
                )
            };
            let in_activation_zone = hover_enabled
                && !(pause_hover_fullscreen && foreground_window_covers_primary_monitor(&app))
                && pointer
                    .map(
                        |(cursor_x, cursor_y, monitor_x, monitor_y, width, height)| {
                            let zone_height = ((height * 2) / 5).max(EDGE_ZONE_MIN_HEIGHT);
                            let zone_top = monitor_y + (height - zone_height) / 2;
                            cursor_x >= monitor_x + width - EDGE_ZONE_WIDTH
                                && cursor_x < monitor_x + width
                                && cursor_y >= zone_top
                                && cursor_y < zone_top + zone_height
                        },
                    )
                    .unwrap_or(false);
            if in_activation_zone && !was_in_activation_zone {
                let _ = reveal(&app);
            }
            was_in_activation_zone = in_activation_zone;

            // Do not depend on WebView mouse-out events for hiding.  Those
            // events can fire while crossing a Windows shadow/border even when
            // the pointer is still visually at the right edge.  Cursor
            // geometry gives the panel a continuous hit area instead.
            let sidebar = app.state::<SidebarState>();
            let (is_open, is_resizing, is_picker_open) = {
                let state = sidebar.0.lock().expect("sidebar state lock");
                (state.is_open, state.is_resizing, state.is_picker_open)
            };
            if is_open && auto_hide && !is_resizing {
                let panel_width = main_window(&app)
                    .and_then(|window| window.outer_size())
                    .map(|size| size.width as i32)
                    .unwrap_or(FALLBACK_PANEL_WIDTH as i32);
                let within_panel = pointer
                    .map(|(cursor_x, _, monitor_x, _, width, _)| {
                        let right = monitor_x + width;
                        cursor_x >= right - panel_width - RESIZE_TOLERANCE && cursor_x < right
                    })
                    .unwrap_or(false);
                if is_picker_open {
                    // The dialog owns the pointer while it is open. Require a
                    // deliberate return to Sonata before auto-hide can resume.
                    waiting_for_panel_reentry = true;
                    left_panel_at = None;
                } else if within_panel || in_activation_zone {
                    left_panel_at = None;
                    waiting_for_panel_reentry = false;
                } else if waiting_for_panel_reentry {
                    left_panel_at = None;
                } else if let Some(left_at) = left_panel_at {
                    if left_at.elapsed() >= hover_delay {
                        let _ = conceal(&app);
                        left_panel_at = None;
                    }
                } else {
                    left_panel_at = Some(std::time::Instant::now());
                }
            } else {
                left_panel_at = None;
            }
            thread::sleep(Duration::from_millis(40));
        }
    });
}

/// This intentionally asks only whether the foreground window covers the
/// monitor, not whether it is a particular game. It avoids application-name
/// heuristics and keeps tray/shortcut activation available.
#[cfg(windows)]
fn foreground_window_covers_primary_monitor(app: &AppHandle) -> bool {
    use windows_sys::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect},
    };
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return false;
    }
    if main_window(app)
        .ok()
        .and_then(|window| window.hwnd().ok())
        .is_some_and(|own| own.0 == foreground)
    {
        return false;
    }
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return false;
    };
    let position = monitor.position();
    let size = monitor.size();
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    (unsafe { GetWindowRect(foreground, &mut rect) != 0 })
        && rect.left <= position.x
        && rect.top <= position.y
        && rect.right >= position.x + size.width as i32
        && rect.bottom >= position.y + size.height as i32
}

#[cfg(not(windows))]
fn start_windows_edge_monitor(_app: AppHandle) {}

fn animate(app: AppHandle, window: WebviewWindow, generation: u64, from: i32, to: i32, y: i32) {
    thread::spawn(move || {
        for frame in 1..=FRAMES {
            let progress = frame as f32 / FRAMES as f32;
            let eased = 1.0 - (1.0 - progress).powi(3);
            let x = from + ((to - from) as f32 * eased).round() as i32;
            let frame_app = app.clone();
            let frame_window = window.clone();
            // Check cancellation when the queued move executes, not on this
            // worker before dispatch. Otherwise an old animation frame can
            // move the window after a resize has already anchored its bounds.
            let _ = window.run_on_main_thread(move || {
                let sidebar = frame_app.state::<SidebarState>();
                let state = sidebar.0.lock().expect("sidebar state lock");
                if state.generation != generation || state.is_resizing {
                    return;
                }
                let _ = frame_window.set_position(PhysicalPosition::new(x, y));
            });
            thread::sleep(FRAME_DELAY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bigger_monitor_gets_a_proportionally_bigger_panel() {
        let laptop = panel_bounds_for(1920, 1.0);
        let desktop = panel_bounds_for(2560, 1.0);
        assert!(desktop.default > laptop.default);
        for (monitor_width, bounds) in [(1920, laptop), (2560, desktop)] {
            let share = f64::from(bounds.default) / f64::from(monitor_width);
            assert!((0.2..=MAX_PANEL_FRACTION).contains(&share), "{share}");
        }
    }

    #[test]
    fn hidpi_screens_get_the_same_panel_measured_in_layout_pixels() {
        let at_100 = panel_bounds_for(1920, 1.0);
        let at_150 = panel_bounds_for(1920, 1.5);
        assert_eq!(at_150.min, (f64::from(at_100.min) * 1.5).round() as u32);
        // The old fixed 760 physical pixels left this monitor 507 CSS pixels
        // of layout at 150%, and 380 at 200%.
        for scale in [1.5, 2.0] {
            let logical = f64::from(panel_bounds_for(1920, scale).default) / scale;
            assert!(logical >= MIN_PANEL_LOGICAL, "{scale}: {logical}");
        }
    }

    #[test]
    fn a_small_screen_keeps_a_readable_panel_without_covering_the_desktop() {
        let bounds = panel_bounds_for(1366, 1.0);
        assert_eq!(bounds.default, bounds.min);
        assert!(bounds.min <= bounds.max);
        assert!(bounds.max < 1366);
    }

    #[test]
    fn bounds_stay_ordered_on_a_screen_narrower_than_the_minimum() {
        let bounds = panel_bounds_for(400, 1.0);
        assert!(bounds.min <= bounds.max);
        assert!(bounds.default <= bounds.max);
        assert!(bounds.max <= 400);
    }

    #[test]
    fn a_dragged_width_is_clamped_into_this_monitors_bounds() {
        let bounds = panel_bounds_for(1920, 1.0);
        assert_eq!(1u32.clamp(bounds.min, bounds.max), bounds.min);
        assert_eq!(99_999u32.clamp(bounds.min, bounds.max), bounds.max);
    }

    #[test]
    fn a_nonsense_scale_factor_falls_back_to_one() {
        assert_eq!(panel_bounds_for(1920, 0.0), panel_bounds_for(1920, 1.0));
        assert_eq!(
            panel_bounds_for(1920, f64::NAN),
            panel_bounds_for(1920, 1.0)
        );
    }
}
