# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ccopen** is a macOS-only VS Code extension that lets users switch between multiple Claude Code CLI accounts. It stores credentials in `~/.claude/accounts/<name>/` and interacts with the macOS Keychain via the `security` command.

## Commands

```bash
# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Package as .vsix (requires compiled output)
npm run package

# Full build + package (clears out/, compiles, packages)
./cli/build.sh

# Full build + package + install
./cli/build.sh --install
```

No lint or test infrastructure exists in this project.

## Architecture

All extension logic lives in a single file: **`src/extension.ts`** (~436 lines), compiled to `out/extension.js`.

### Core Data Storage

- `~/.claude/accounts/<name>/` — per-account directory containing:
  - `oauth_account.json` — OAuth credentials
  - `keychain_credential.txt` — Keychain token
  - `email.txt` — Display email
- `~/.claude.json` — Claude Code CLI active config (modified on switch)
- macOS Keychain service: `'Claude Code-credentials'`

### Key Functions

- `getAccounts()` / `getCurrentEmail()` — read state from disk
- `saveCurrentAccount(name)` — snapshot current credentials to accounts dir
- `switchAccount(name)` — restore credentials from accounts dir into active config + Keychain
- `removeAccount(name)` — delete an account directory
- `atomicWriteJson()` — atomic file writes with backup
- `execArgs()` — safe command execution wrapper (avoids shell injection)
- `killClaudeProcesses()` / `relaunchClaude()` — process lifecycle via `pkill` and VS Code Terminal

### UI Components

- **`AccountsProvider`** — `TreeDataProvider` powering the sidebar account list; marks current account with a green indicator
- **Status bar item** — shows current email, clickable to open QuickPick switcher

### Commands Registered (7 total)

| Command | Description |
|---|---|
| `ccopen.switch` | QuickPick account switcher |
| `ccopen.save` | Save current session |
| `ccopen.remove` | Remove account (command palette) |
| `ccopen.switchItem` | Switch from tree view item |
| `ccopen.removeItem` | Remove from tree view item |
| `ccopen.addNew` | Add new account (triggers `claude logout` → `claude login`) |
| `ccopen.refresh` | Refresh account list |

### Security

- Account names validated against `[a-zA-Z0-9_\-. ]` to prevent path traversal
- `validateAccountPath()` enforces paths stay within `ACCOUNTS_DIR`
- Credentials stored in Keychain, not plaintext

## Important Notes
- 回答時統一使用繁體中文進行回答。
