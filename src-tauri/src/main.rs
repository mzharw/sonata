#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop")]
fn main() {
    sonata_lib::run();
}
#[cfg(not(feature = "desktop"))]
fn main() {
    eprintln!("Build Sonata with --features desktop to launch the desktop app.");
}
