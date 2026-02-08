# simplestclaw

The simplest way to set up and use OpenClaw. One click. No Telegram required.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml)

## What is this?

simplestclaw makes it dead simple to get OpenClaw running - either on your own machine or in the cloud. No complex setup, no Telegram bots, just click and go.

**Two ways to use it:**

1. **Local (Free)** - Download our desktop app, it bundles OpenClaw and runs on your machine
2. **Hosted (~$5/mo)** - Click "Deploy on Railway" and get a cloud instance in 60 seconds

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/simplestclaw)

## Features

- One-click setup for both local and hosted deployments
- Built-in chat UI with streaming responses
- Tool call visualization (see what OpenClaw is doing)
- Dashboard for managing your instance
- 100% open source (MIT license)

## Quick Start

### Option 1: Local (Desktop App)

Download for your platform:

- [macOS (Apple Silicon)](https://github.com/mbron64/simplestclaw/releases/latest)
- [macOS (Intel)](https://github.com/mbron64/simplestclaw/releases/latest)
- [Windows](https://github.com/mbron64/simplestclaw/releases/latest)
- [Linux](https://github.com/mbron64/simplestclaw/releases/latest)

### Option 2: Hosted (Railway)

Click the button below, sign in to Railway, and you're done:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/simplestclaw)

You pay Railway directly (~$5/month). We never touch your money.

## Development

```bash
# Clone the repo
git clone https://github.com/mbron64/simplestclaw.git
cd simplestclaw

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Project Structure

```
simplestclaw/
├── apps/
│   ├── web/           # Next.js web app (chat UI, dashboard)
│   └── desktop/       # Tauri desktop app
├── packages/
│   ├── ui/            # Shared UI components
│   └── openclaw-client/  # OpenClaw Gateway WebSocket client
└── package.json
```

## How is this different from simpleclaw?

| Feature | simpleclaw | simplestclaw |
|---------|------------|--------------|
| Setup | Telegram bot required | One-click button |
| Deployment | Cloud only | Local + Cloud |
| Chat | External (Telegram) | Built-in web UI |
| Payment | Through simpleclaw | Direct to Railway |
| Open source | No | Yes (MIT) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)
