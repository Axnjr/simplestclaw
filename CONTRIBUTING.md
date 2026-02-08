# Contributing to simplestclaw

Thanks for your interest in contributing! This document outlines how to get started.

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `pnpm install`
3. Start dev server: `pnpm dev`

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. Run before committing:

```bash
pnpm check    # Check for issues
pnpm format   # Auto-format code
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style (formatting, etc.)
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example: `feat: add streaming response support to chat UI`

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Run `pnpm check` and `pnpm typecheck`
4. Open a PR with a clear description
5. Wait for review

## Reporting Issues

Use GitHub Issues. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, browser, etc.)

## Questions?

Open a GitHub Discussion or reach out on Discord.
