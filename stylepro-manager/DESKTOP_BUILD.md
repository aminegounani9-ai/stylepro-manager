# StylePro Manager — Desktop Windows

StylePro is being packaged as a Windows desktop application with Tauri 2. The desktop shell displays the existing React application in a native desktop window; it is not a browser tab and it can be distributed as Windows installers.

## Local prerequisites

- Node.js 22+
- Rust stable toolchain
- Microsoft C++ Build Tools (Visual Studio Build Tools) with the Desktop development with C++ workload
- WebView2 Runtime (normally present on supported Windows 10/11 systems)

## Run in desktop development mode

From this directory:

```bash
npm ci
cargo install tauri-cli --version "^2" --locked
cd src-tauri
cargo tauri dev
```

## Build Windows installers

From `stylepro-manager/src-tauri`:

```bash
cargo tauri build
```

Installers are generated under:

- `src-tauri/target/release/bundle/nsis/` — setup EXE
- `src-tauri/target/release/bundle/msi/` — MSI installer

A GitHub Actions workflow builds and uploads these installers as an artifact after a successful run on `main`.

## Important

The desktop app currently packages the existing StylePro React modules. It does not yet make the desktop app fully offline: authentication and business data continue to use the configured Supabase project. Do not put a Supabase service-role key in the desktop or mobile app.
