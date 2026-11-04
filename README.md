# Antigravity Token Tracker (`token-tracker-plugin`)

An Antigravity plugin and local team dashboard that tracks **uncached input tokens**, **cache read tokens**, **output tokens**, and **estimated spend (`$`)** across all your conversations and repositories—both **live via a `Stop` hook** and **retroactively across all historical transcripts**.

---

## Features

1. **100% Historical Backfill (`~/.gemini/antigravity/brain/`)**
   - Automatically scans all existing `.system_generated/logs/transcript.jsonl` files in your local `brain/` folder so every past session is accounted for immediately.
   - Idempotent deduplication by `conversationId` — running sync or hooks multiple times never double-counts tokens.
2. **Zero-Latency Automatic Logging (`Stop` Hook)**
   - Bundles `hooks.json` with a `Stop` hook that updates your usage ledger automatically at the end of each agent turn.
3. **Conflict-Free Team Comparison (`data/users/<username>.json`)**
   - Each developer writes to their own file (`data/users/<userId>.json`).
   - Teammates can either `git commit && git push` their JSON file to this repository, or use the **Export My JSON** / **Import Teammate JSON** buttons in the UI to compare usage side-by-side.
4. **Lightweight Local & In-App UI (`ui/index.html` + `scripts/ui-server.mjs`)**
   - Zero external npm dependencies required; uses clean SVG icons throughout.
   - View **Team Member Comparison Leaderboard**, **Daily Token Consumption Chart**, **Cache Hit Efficiency & Savings**, **Per-Repository Breakdown**, and a **Searchable Conversation Ledger**.

---

## Quick Start (Any Device)

### 1. Install as a Global Antigravity Plugin
From the parent `plugins` directory, run `./install.sh`, or symlink this directory directly into `~/.gemini/config/plugins/token-tracker`:
```bash
mkdir -p ~/.gemini/config/plugins
ln -s "$(pwd)" ~/.gemini/config/plugins/token-tracker
```
Restart Antigravity once so the plugin's `hooks.json` (`Stop` hook), sidecar dashboard, and `token-tracker` skill are active across all workspaces.

### 2. Backfill All Historical Data & Launch the UI
```bash
cd ~/.gemini/config/plugins/token-tracker
npm start
```
This will:
1. Scan all historical transcripts in `~/.gemini/antigravity/brain/`.
2. Save your profile to `data/users/<your-user-id>.json` (auto-detected from `git config user.name` / `user.email`, or overridden via `user.config.json` — see `user.config.example.json`).
3. Open the dashboard at **`http://localhost:4321`**.

To only run the backfill/sync in the terminal and print a summary:
```bash
npm run stats
```
