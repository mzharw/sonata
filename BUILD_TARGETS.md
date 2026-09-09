# Sonata build instructions

This document describes how to build Sonata for development, validation, and release. Release builds should be made on the target operating system with that platform's native toolchain. Tauri's Windows MSVC build is the supported Windows release path.

For an interactive menu covering every command below, run `scripts/build.sh` (or `npm run build:menu`). It also accepts a target directly, e.g. `scripts/build.sh windows-xwin`, and `scripts/build.sh doctor` checks what's installed for building on the current machine. Run `scripts/build.sh help` for the full list.

## Prerequisites

- Node.js 20+ or Bun
- Rust stable and Cargo
- Tauri platform prerequisites: <https://v2.tauri.app/start/prerequisites/>
- WebView2 Runtime on Windows when running the packaged app
- Visual Studio 2022 Build Tools with the Desktop C++ workload for Windows MSVC builds

Install JavaScript dependencies once:

```sh
npm ci
# or: bun install --frozen-lockfile
```

## Development

Run the complete desktop app, including the Vite server and native Tauri commands:

```sh
npm run dev
# or: bun dev
```

`npm run dev:ui` / `bun run dev:ui` starts only Vite at `http://localhost:1420`. A normal browser cannot use Sonata's native workspace and document commands.

## Validation

Run the checks before creating a release:

```sh
npm run typecheck
npm run lint
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --features desktop -- -D warnings
```

Build the frontend separately when checking only web assets:

```sh
npm run build
```

## Target builds

### Windows x64 (supported release target)

Build this on Windows from PowerShell with the MSVC Rust target selected:

```powershell
rustup target add x86_64-pc-windows-msvc
npm ci
npm run build:windows
```

The command is equivalent to:

```powershell
npm run build
npm run tauri build -- --target x86_64-pc-windows-msvc --features desktop,custom-protocol
```

Artifacts are written under `src-tauri/target/x86_64-pc-windows-msvc/release/`. The packaged installers are under `bundle/msi/` and `bundle/nsis/`. Use the installer for distribution; a loose executable must be shipped with all files produced beside it by the Tauri bundle. The release executable embeds the frontend through the `custom-protocol` feature.

To cross-build from Linux or macOS, install `cargo-xwin` and LLVM, then run:

```sh
cargo install --locked cargo-xwin
npm run build
cargo xwin build --manifest-path src-tauri/Cargo.toml \
  --release --target x86_64-pc-windows-msvc \
  --features desktop,custom-protocol --bin sonata
```

Cross-built binaries are not a substitute for testing the installer on Windows. If the target machine reports “This app can't run on your PC”, verify that the executable is x64 and use the MSVC build or installer, rather than the older `x86_64-pc-windows-gnu` artifact.

### Linux x64

Build and package on a Linux host:

```sh
npm run build
npm run tauri build -- --features desktop,custom-protocol
```

The output is under `src-tauri/target/release/bundle/` (AppImage, Debian, or other configured formats). The exact formats depend on the installed Tauri system packages.

### macOS

Build on macOS with Xcode Command Line Tools installed:

```sh
npm run build
npm run tauri build -- --features desktop,custom-protocol
```

For Apple Silicon or Intel, use the native Rust target for that machine. To make a universal app, build both `aarch64-apple-darwin` and `x86_64-apple-darwin` and combine the resulting app binaries with `lipo`; signing and notarization must be performed on macOS.

### Frontend-only artifact

```sh
npm run build
```

This produces `dist/`, but it is not a functional Sonata desktop release because native commands and the workspace filesystem are provided by Tauri.

## Release checklist

1. Run the validation commands above.
2. Build on the target OS with `desktop,custom-protocol`.
3. Test the packaged installer or bundle on a clean machine.
4. Confirm workspace selection, note creation, saving, search, and panel resizing.
5. Distribute the installer/bundle from `src-tauri/target/<target>/release/bundle/`, not an arbitrary stale executable from another target directory.

## Hosted release builds

Pushing a version tag such as `v0.1.0` runs the GitHub Actions release workflow. It
builds the Windows NSIS installer, Apple Silicon macOS DMG, and Linux AppImage and
Deb package on their matching hosted operating systems, then attaches them to a
GitHub Release. The workflow may also be run manually to verify all three package
builds without publishing a release.

The macOS package is unsigned and unnotarized. Configure Apple signing and
notarization credentials before distributing it to users outside your development
team.
