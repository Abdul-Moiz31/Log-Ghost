<div align="center">

<img src="media/log-ghost-logo.png" alt="Log Ghost" width="128" />

# Log Ghost

**Find, classify, and remove debug logging before it ships.**  
Severity labels, **git** blame, workspace overview, and an optional **pre-commit** hook.

<br />

![Version](https://img.shields.io/badge/version-0.4.0-007ACC?style=flat-square)
![Engine](https://img.shields.io/badge/VS%20Code-≥1.85.0-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)

<br />

**Website ·** [abdul-moiz31.github.io/log-ghost](https://abdul-moiz31.github.io/log-ghost/)  
**Made by ·** [Abdul-Moiz31](https://github.com/Abdul-Moiz31)

<br />

[Features](#features) · [Install](#installation) · [Configuration](#configuration) · [Pre-commit](#pre-commit-hook) · [Development](#development)

</div>

---

## Overview

Log Ghost flags **debug-style calls** (`console`, `print`, Go/PHP patterns, custom regexes), assigns **critical / debug / safe** severities, uses **git blame** for “mine” vs teammates, and gives you **CodeLens**, a **Logs** tree, **status bar** counts, and an optional **Git pre-commit** hook that runs the bundled CLI on staged files.

It does **not** replace a security audit or full static analysis. Treat results as a **strong signal**.

---

## Features

| Area | What you get |
|------|----------------|
| **Detection** | JS/TS (`console`, `debugger`), Python `print`, Go `fmt`/`log`, PHP `var_dump` / `dd` / `print_r`, plus **custom** regexes. |
| **Severity** | **Critical**, **debug**, and **safe** (heuristic). |
| **Authorship** | **Git blame** and **yours vs others** when `git` and email are available. |
| **Editor** | Gutter + optional inline highlight; **CodeLens** (remove, session dismiss, ignore to file). |
| **Workspace** | Full scan, **Logs** sidebar, filters (all / mine / teammates / critical), bulk remove with confirmation. |
| **Pre-commit** | Optional hook calling `out/precommitCli.js` to fail commits when **your** debug lines are **staged**. |

---

## Installation

1. Open **Extensions** in VS Code (or Cursor).
2. Search **Log Ghost** and install.

Or install a `.vsix` with **Extensions: Install from VSIX…** if you distribute a build.

**Requirements:** VS Code `^1.85.0`, **Git** on `PATH` for blame and the hook, and a **folder workspace** for full scanning.

---

## Configuration

| Setting | Purpose |
|---------|---------|
| `logGhost.languages` | Language IDs to scan (default includes JS/TS, Python, Go, PHP). |
| `logGhost.customPatterns` | Extra case-insensitive regexes, one line at a time. |
| `logGhost.ignoredPatterns` | Lines matching any pattern are never flagged. |
| `logGhost.currentUserEmail` | Override `git config user.email` for “mine”. |
| `logGhost.preCommitHook` | Install/update `.git/hooks/pre-commit` (default `true`). |
| `logGhost.showCodeLens` | CodeLens on matches. |
| `logGhost.inlineHighlight` | Highlight the matched span. |
| `logGhost.liveDebounceMs` | Debounce for re-scan while typing. |

Open **Settings** and search `logGhost` for the full list.

---

## Pre-commit hook

When **`logGhost.preCommitHook`** is enabled, the extension writes a small `pre-commit` script (only if the file is empty or already managed by Log Ghost) that runs:

`node <extension>/out/precommitCli.js <repo-root>`

You need **Node** on `PATH` and a **Git** repository. If a custom `pre-commit` exists without the Log Ghost marker, it is **not** overwritten.

Opening a **new workspace folder** after startup also triggers hook installation (see `onDidChangeWorkspaceFolders`).

---

## Commands (selection)

| Command | Notes |
|---------|--------|
| `Log Ghost: Strip standalone lines in file` | Default key: `Ctrl+Shift+;` / `Cmd+Shift+;` |
| `Log Ghost: Open sidebar` | Focus the Log Ghost view |
| `Log Ghost: Pre-commit check (staged, modal)` | Manual check before commit |
| Tree + filter commands | Remove lines, filters, bulk remove (with confirmation) |

Use the **Command Palette** and type `Log Ghost` for the full list.

---

## Website & Marketplace

- **Content (single source of truth):** [`data/logghost.json`](./data/logghost.json) — copy, links, theme tokens, and hero mock rows for the landing page. Change URLs and stats there.

- **Next.js site:** [`../Log-Ghost-Website/`](../Log-Ghost-Website/) — `npm run dev` / `npm run build` (see that folder’s README). The app **imports** this JSON at build time.

- **Legacy static HTML (optional):** [`docs/`](./docs/) — old single-file version; the maintained site is the Next app above.

- **`package.json` fields:** `homepage`, `repository`, and `bugs` point at the GitHub repo and site. **Update the GitHub org/username and repo name** if yours differ.

- **After publishing to the Marketplace**, set the site’s **Get from Marketplace** button to your extension page, e.g.  
  `https://marketplace.visualstudio.com/items?itemName=<publisher>.log-ghost`  
  (replace `<publisher>` with your Marketplace publisher id — the site and this README currently use a search link as a fallback).

Publishing reference: [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

---

## Development

```bash
cd Log-Ghost-extension   # or open this folder as the workspace
npm install
npm run compile   # or npm run watch
```

**Run / debug (F5):** Open the **parent** `Extensions` folder in VS Code and use **Run Extension** (it loads this package from `Log-Ghost-extension/`), *or* open **this** folder only; the local `.vscode/launch.json` will open the parent directory in the Extension Host.

---

## Author

[**Abdul-Moiz31**](https://github.com/Abdul-Moiz31)

---

## License

[MIT](LICENSE) — see the file in this directory (and the [repository root](../LICENSE) copy). OK to publish on the Marketplace or open source.
