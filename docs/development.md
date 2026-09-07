# Development

Use stable Tauri 2, Rust stable, React 19, Vite 8, and Tailwind-compatible CSS tooling. The desktop app has no frontend filesystem capability: workspace changes pass through narrow Rust commands. Test pure Rust modules with temporary workspaces before testing UI behavior.

Build Windows releases on Windows with `npm run build:windows` (or `bun run build:windows`) using the MSVC Rust target and Visual Studio C++ Build Tools. The executable is in `src-tauri/target/x86_64-pc-windows-msvc/release/sonata.exe`; installers are under its `bundle` directory.

For a Linux cross-build, install cargo-xwin and LLVM, then run `npm run build:windows -- --runner cargo-xwin`. See [Tauri's Windows build instructions](https://tauri.app/distribute/windows-installer/). For a direct Cargo build, build the frontend first and pass `--features desktop,custom-protocol`; `custom-protocol` embeds the frontend so the release runs without a development server.
