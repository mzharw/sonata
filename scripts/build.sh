#!/usr/bin/env bash
# All-in-one build/dev helper for Sonata. See BUILD_TARGETS.md for the full
# background on each target; this script exists so nobody has to remember
# the exact CLI incantations.
#
# Usage:
#   scripts/build.sh              interactive menu
#   scripts/build.sh <command>    run one target directly (see `help`)

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi

info()  { printf '%s\n' "${CYAN}==>${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}!${RESET} $*"; }
fail()  { printf '%s\n' "${RED}✗${RESET} $*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

os_name() {
  case "$(uname -s)" in
    Linux*) echo "linux" ;;
    Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

require() {
  local bin="$1" hint="$2"
  if ! have "$bin"; then
    fail "missing '$bin'. $hint"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------

cmd_dev() {
  info "Starting full desktop app (Vite + Tauri)"
  npm run dev
}

cmd_dev_ui() {
  info "Starting Vite only (no native commands available)"
  npm run dev:ui
}

cmd_validate() {
  info "Running full validation suite"
  npm run typecheck
  npm run lint
  npm test
  cargo fmt --manifest-path src-tauri/Cargo.toml --check
  cargo test --manifest-path src-tauri/Cargo.toml
  cargo clippy --manifest-path src-tauri/Cargo.toml --features desktop -- -D warnings
  ok "Validation passed"
}

cmd_frontend() {
  info "Building frontend only (dist/)"
  npm run build
  ok "Frontend built to dist/"
}

cmd_linux() {
  info "Building Linux bundle"
  npm run build
  npm run tauri build -- --features desktop,custom-protocol
  ok "Output under src-tauri/target/release/bundle/"
}

cmd_windows_native() {
  local os; os=$(os_name)
  if [[ "$os" != "windows" ]]; then
    warn "This target is meant to run natively on Windows (PowerShell), not $os."
    warn "From Linux/macOS use: scripts/build.sh windows-xwin"
    read -r -p "Continue anyway? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || return 1
  fi
  require rustc "install Rust: https://rustup.rs"
  info "Building Windows MSVC bundle (native)"
  npm ci
  npm run build:windows
  ok "Artifacts under src-tauri/target/x86_64-pc-windows-msvc/release/, installers under bundle/msi and bundle/nsis"
}

cmd_windows_xwin() {
  local os; os=$(os_name)
  if [[ "$os" == "windows" ]]; then
    warn "You're on native Windows; prefer: scripts/build.sh windows-native"
  fi
  require cargo "install Rust: https://rustup.rs"
  if ! rustup target list --installed 2>/dev/null | grep -q '^x86_64-pc-windows-msvc$'; then
    info "Adding rustup target x86_64-pc-windows-msvc"
    rustup target add x86_64-pc-windows-msvc
  fi
  if ! have cargo-xwin; then
    info "Installing cargo-xwin"
    cargo install --locked cargo-xwin
  fi
  if ! have clang || ! have llvm-rc || ! have lld-link; then
    fail "clang/llvm-rc/lld-link not found."
    if [[ "$os" == "linux" ]]; then
      fail "Install with: sudo apt-get install -y clang llvm lld"
    elif [[ "$os" == "macos" ]]; then
      fail "Install with: brew install llvm"
    fi
    exit 1
  fi
  info "Building frontend"
  npm run build
  info "Cross-compiling Windows MSVC binary via cargo-xwin (first run downloads the Windows SDK/CRT, ~hundreds of MB)"
  cargo xwin build --manifest-path src-tauri/Cargo.toml \
    --release --target x86_64-pc-windows-msvc \
    --features desktop,custom-protocol --bin sonata
  ok "Binary at src-tauri/target/x86_64-pc-windows-msvc/release/sonata.exe"
  warn "This is a raw cross-compiled binary — cargo-xwin does not run Tauri's NSIS bundler."
  warn "For an installer, or before shipping, build+test on real Windows (scripts/build.sh windows-native)."
  warn "If the app icon looks stale, that is Explorer's per-path icon cache, not the build:"
  warn "  run 'ie4uinit.exe -show', or just copy the exe to a new filename to see the real icon."
}

cmd_macos() {
  local os; os=$(os_name)
  if [[ "$os" != "macos" ]]; then
    fail "This target must be built on macOS with Xcode Command Line Tools."
    exit 1
  fi
  info "Building macOS bundle"
  npm run build
  npm run tauri build -- --features desktop,custom-protocol
  ok "Output under src-tauri/target/release/bundle/"
}

cmd_macos_universal() {
  local os; os=$(os_name)
  if [[ "$os" != "macos" ]]; then
    fail "Universal macOS builds must be made on macOS."
    exit 1
  fi
  require lipo "install Xcode Command Line Tools: xcode-select --install"
  for t in aarch64-apple-darwin x86_64-apple-darwin; do
    if ! rustup target list --installed 2>/dev/null | grep -q "^$t\$"; then
      info "Adding rustup target $t"
      rustup target add "$t"
    fi
  done
  info "Building frontend"
  npm run build
  for t in aarch64-apple-darwin x86_64-apple-darwin; do
    info "Building $t"
    npm run tauri build -- --target "$t" --features desktop,custom-protocol
  done
  local out="src-tauri/target/universal/release"
  mkdir -p "$out"
  local bin_name="sonata"
  lipo -create \
    "src-tauri/target/aarch64-apple-darwin/release/$bin_name" \
    "src-tauri/target/x86_64-apple-darwin/release/$bin_name" \
    -output "$out/$bin_name"
  ok "Universal binary at $out/$bin_name (app bundle .app files still need combining per-arch resources manually if bundling)"
}

cmd_doctor() {
  local os; os=$(os_name)
  info "Detected OS: $os"
  echo
  printf '%-14s ' "node/npm"
  if have npm; then ok "$(npm --version)"; else warn "not found"; fi
  printf '%-14s ' "bun"
  if have bun; then ok "$(bun --version)"; else warn "not found (optional, npm is fine)"; fi
  printf '%-14s ' "rustc"
  if have rustc; then ok "$(rustc --version)"; else warn "not found — https://rustup.rs"; fi
  printf '%-14s ' "cargo"
  if have cargo; then ok "$(cargo --version)"; else warn "not found"; fi
  printf '%-14s ' "cargo-xwin"
  if have cargo-xwin; then ok "installed"; else warn "not installed (needed for windows-xwin)"; fi
  printf '%-14s ' "clang"
  if have clang; then ok "$(clang --version | head -1)"; else warn "not found (needed for windows-xwin)"; fi
  printf '%-14s ' "llvm-rc"
  if have llvm-rc; then ok "found"; else warn "not found (needed for windows-xwin)"; fi
  printf '%-14s ' "lld-link"
  if have lld-link; then ok "found"; else warn "not found (needed for windows-xwin)"; fi
  echo
  if have rustup; then
    info "Installed rustup targets:"
    rustup target list --installed 2>/dev/null | sed 's/^/  - /'
  fi
}

# ---------------------------------------------------------------------------
# Menu / dispatch
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
${BOLD}Sonata build helper${RESET}

Usage: scripts/build.sh [command]

Commands:
  dev              Run full desktop app (Vite + Tauri)
  dev:ui           Run Vite only
  validate         typecheck + lint + test + cargo fmt/test/clippy
  frontend         Build frontend only (dist/)
  linux            Build Linux bundle (AppImage/deb) on this machine
  windows-native   Build Windows MSVC bundle (run this ON Windows)
  windows-xwin     Cross-compile Windows MSVC binary from Linux/macOS (cargo-xwin)
  macos            Build macOS bundle (run this ON macOS)
  macos-universal  Build universal (arm64+x86_64) macOS binary (run this ON macOS)
  doctor           Check what's installed for building on this machine
  help             Show this message

With no arguments, an interactive menu is shown.
EOF
}

run_command() {
  case "$1" in
    dev) cmd_dev ;;
    dev:ui) cmd_dev_ui ;;
    validate) cmd_validate ;;
    frontend) cmd_frontend ;;
    linux) cmd_linux ;;
    windows-native) cmd_windows_native ;;
    windows-xwin) cmd_windows_xwin ;;
    macos) cmd_macos ;;
    macos-universal) cmd_macos_universal ;;
    doctor) cmd_doctor ;;
    help|-h|--help) usage ;;
    *) fail "Unknown command: $1"; echo; usage; exit 1 ;;
  esac
}

interactive_menu() {
  echo "${BOLD}Sonata build helper${RESET}  ${DIM}($(os_name))${RESET}"
  echo
  local options=(
    "dev|Run full desktop app (Vite + Tauri)"
    "dev:ui|Run Vite only"
    "validate|typecheck + lint + test + cargo fmt/test/clippy"
    "frontend|Build frontend only (dist/)"
    "linux|Build Linux bundle (AppImage/deb)"
    "windows-native|Build Windows MSVC bundle (run ON Windows)"
    "windows-xwin|Cross-compile Windows MSVC from Linux/macOS (cargo-xwin)"
    "macos|Build macOS bundle (run ON macOS)"
    "macos-universal|Build universal macOS binary (run ON macOS)"
    "doctor|Check build prerequisites on this machine"
    "quit|Exit"
  )
  local i=1
  for entry in "${options[@]}"; do
    printf '  %2d) %-16s %s\n' "$i" "${entry%%|*}" "${entry#*|}"
    i=$((i + 1))
  done
  echo
  read -r -p "Select an option [1-${#options[@]}]: " choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#options[@]} )); then
    fail "Invalid selection"
    exit 1
  fi
  local selected="${options[$((choice - 1))]%%|*}"
  [[ "$selected" == "quit" ]] && exit 0
  echo
  run_command "$selected"
}

if [[ $# -eq 0 ]]; then
  if [[ -t 0 ]]; then
    interactive_menu
  else
    usage
    exit 1
  fi
else
  run_command "$1"
fi
