# Sonata

Compose your thoughts. Sonata is a local-first desktop capture app: Markdown files are canonical, while `.sonata/index.db` is a disposable SQLite search index.

## Development

Prerequisites: current Node.js, Rust stable, and the platform dependencies required by [Tauri](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run dev
```

With Bun, use `bun install` and `bun dev`. This launches the desktop app and its Vite server together. Choose **Open Sonata** from the system tray menu, then choose a workspace folder before adding notes. Existing workspaces are opened; new folders are initialized automatically.

`npm run dev:ui` (or `bun run dev:ui`) starts only the frontend server at localhost:1420. A regular browser cannot access Tauri's native workspace and document commands; use the desktop window for the working app.

Run checks with `npm run typecheck`, `npm run lint`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.

See [BUILD_TARGETS.md](BUILD_TARGETS.md) for complete platform build and release instructions. Repository development guidance for coding agents is in [AGENTS.md](AGENTS.md).
