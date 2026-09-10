import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const commandName = (command) => isWindows && ["npm", "npx", "cargo", "rustc", "rustup"].includes(command) ? `${command}.cmd` : command;

function run(command, args = [], options = {}) {
  const result = spawnSync(commandName(command), args, { stdio: "inherit", shell: isWindows, ...options });
  if (result.error) {
    console.error(`Unable to run ${command}: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function has(command) {
  const result = spawnSync(isWindows ? "where.exe" : "which", [commandName(command)], { stdio: "ignore" });
  return result.status === 0;
}

function requireCommand(command, hint) {
  if (!has(command)) throw new Error(`missing '${command}'. ${hint}`);
}

function doctor() {
  console.log(`==> Detected OS: ${isWindows ? "windows" : process.platform}`);
  for (const [name, optional] of [["npm", false], ["bun", true], ["rustc", false], ["cargo", false], ["cargo-xwin", true], ["clang", true], ["llvm-rc", true], ["lld-link", true]]) {
    if (has(name)) console.log(`✓ ${name}`);
    else console.log(`${optional ? "!" : "✗"} ${name} not found${name === "rustc" || name === "cargo" ? " — install Rust from https://rustup.rs" : ""}`);
  }
  if (has("rustup")) run("rustup", ["target", "list", "--installed"]);
}

function build(command) {
  // Unix keeps the original, feature-complete Bash helper. Windows uses this
  // Node entry point so Git Bash is not required for the native build path.
  if (!isWindows && command) return run("bash", ["scripts/build.sh", command]);
  switch (command) {
    case "frontend": return run("npm", ["run", "build"]);
    case "windows-native":
      requireCommand("cargo", "install Rust from https://rustup.rs");
      return run("npm", ["ci"]) && run("npm", ["run", "build:windows"]);
    case "linux": return run("npm", ["run", "build"]) && run("npm", ["run", "tauri", "build", "--", "--features", "desktop,custom-protocol"]);
    case "macos": return run("npm", ["run", "build"]) && run("npm", ["run", "tauri", "build", "--", "--features", "desktop,custom-protocol"]);
    case "validate":
      return run("npm", ["run", "typecheck"]) && run("npm", ["run", "lint"]) && run("npm", ["test"]) && run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--check"]) && run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
    case "dev": return run("npm", ["run", "dev"]);
    case "dev:ui": return run("npm", ["run", "dev:ui"]);
    case "doctor": doctor(); return true;
    case "help":
    case undefined:
      console.log("Usage: npm run build:menu -- <dev|dev:ui|validate|frontend|linux|windows-native|macos|doctor>");
      if (isWindows) console.log("Windows uses the native MSVC build; Unix-only cross-build commands remain available via scripts/build.sh.");
      return true;
    default: throw new Error(`unknown command: ${command}`);
  }
}

const requested = process.argv[2];
let command = requested;
if (!command && process.stdin.isTTY) {
  const rl = createInterface({ input, output });
  console.log("Sonata build helper");
  console.log("1) dev  2) dev:ui  3) validate  4) frontend  5) linux  6) windows-native  7) macos  8) doctor  9) quit");
  const choice = await rl.question("Select an option: ");
  rl.close();
  command = ["dev", "dev:ui", "validate", "frontend", "linux", "windows-native", "macos", "doctor", "quit"][Number(choice) - 1];
}

if (command === "quit") process.exit(0);
try {
  if (!build(command)) process.exit(1);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
