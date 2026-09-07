# Agent instructions for Sonata

## Project overview

Sonata is a Tauri 2 desktop app. React and TypeScript provide the interface; Rust provides the native window, workspace, Markdown, and SQLite index commands. Markdown files are canonical and `.sonata/index.db` is disposable.

## Working rules

- Read the relevant source and existing docs before changing behavior.
- Keep native filesystem access in Rust commands; do not add frontend filesystem shortcuts.
- Preserve the workspace format and document metadata compatibility.
- Use `apply_patch` for source and documentation edits.
- Do not delete or reset user files, workspaces, generated artifacts, or unrelated changes.
- Keep browser-only development graceful: native commands are unavailable outside a Tauri window.
- Treat `src-tauri/target/` and `dist/` as generated output; do not edit them by hand.

## Common commands

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --features desktop -- -D warnings
```

The full target matrix and release instructions are in [BUILD_TARGETS.md](BUILD_TARGETS.md).

## Native changes

When changing Tauri commands, update all of the following together:

1. The Rust command implementation and `tauri::generate_handler!` registration.
2. The TypeScript wrapper in `src/lib/native.ts`.
3. UI error/loading handling for unavailable workspaces or browser execution.
4. Tests for success, cancellation, and failure where applicable.

Window positioning and resizing code must preserve the panel's physical right-edge anchor. Avoid asynchronous sequences that can apply stale position or size updates after a newer resize.

## Release requirements

Use the native target toolchain for release builds. Windows releases must use the x64 MSVC target and `desktop,custom-protocol`; do not distribute the Linux-cross-built GNU executable as the Windows release. Verify the produced artifact path and test the packaged installer.
