# simplestclaw Desktop

Native desktop app for simplestclaw, built with Tauri v2.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (1.70+)
- [Node.js](https://nodejs.org/) (20+)
- [pnpm](https://pnpm.io/)

### Platform-specific dependencies

**macOS:**
No additional dependencies needed.

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Windows:**
Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Run in development mode
pnpm tauri dev
```

## Building

```bash
# Build the sidecar binaries first (requires OpenClaw installed globally)
pnpm build:sidecar

# Build the desktop app
pnpm tauri build
```

## Project Structure

```
apps/desktop/
├── src/                    # React frontend
│   ├── components/         # React components
│   ├── lib/               # Utilities (store, tauri API)
│   └── App.tsx            # Main app component
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── config.rs      # Config management
│   │   ├── sidecar.rs     # OpenClaw process management
│   │   └── lib.rs         # Tauri app setup
│   └── binaries/          # Sidecar binaries (built)
└── scripts/
    └── build-sidecar.js   # Sidecar build script
```

## How It Works

1. On first launch, the app prompts for your Anthropic API key
2. The key is stored locally in your config directory
3. When you click "Continue", the app spawns OpenClaw as a sidecar process
4. The React frontend connects to OpenClaw via WebSocket
5. Chat messages are sent through the gateway to Claude
