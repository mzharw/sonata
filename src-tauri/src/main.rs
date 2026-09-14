// Sonata is a desktop application.  In particular, an executable launched by
// Windows at sign-in must not create a second command-prompt window.  `tauri
// dev` still writes its diagnostics to the terminal that started it.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(feature = "desktop")]
fn main() {
    sonata_lib::run();
}
#[cfg(not(feature = "desktop"))]
fn main() {
    eprintln!("Build Sonata with --features desktop to launch the desktop app.");
}
