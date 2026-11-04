---
name: token-tracker
description: Syncs, backfills, analyzes, and visualizes token spending (input, cache read, and output tokens) across historical and live Antigravity transcripts, and launches the local Team Token Tracker UI. Activate when the user asks about token usage, model spend, cache efficiency, or comparing token stats across repositories or teammates.
---

# Token Tracker & Team Usage Skill

This skill powers the `token-tracker` plugin (`~/.gemini/config/plugins/token-tracker`).

## 1. Capabilities

1. **Automatic Live Logging (`Stop` Hook)**:
   - Configured in `hooks.json` at the plugin root.
   - Fires automatically at the end of every agent loop (`Stop`), reading the conversation's `transcript.jsonl` and updating `data/users/<userId>.json` + `ui/data-bundle.js`.
2. **Full Historical Backfill (`--backfill`)**:
   - Scans every existing conversation directory under `~/.gemini/antigravity/brain/<conversationId>/.system_generated/logs/transcript.jsonl`.
   - Extracts `input_tokens`, `cache_read_tokens`, `output_tokens`, prompt count, model turns, tool call counts, model name, and repository/project name.
3. **Team Comparison & Small UI Dashboard**:
   - Stores each team member's telemetry in their own conflict-free file: `data/users/<userId>.json`.
   - Teammates can commit and push their `data/users/<userId>.json` file to the repo (or export/import via the UI) to compare usage side-by-side.

## 2. Commands

- **Backfill all historical transcripts & print JSON summary**:
  ```bash
  node ~/.gemini/config/plugins/token-tracker/scripts/sync-tokens.mjs --backfill --summary
  ```
- **Start the local UI Server (`http://localhost:4321`)**:
  ```bash
  node ~/.gemini/config/plugins/token-tracker/scripts/ui-server.mjs
  ```
- **Static UI path (can also be opened directly in any browser without a server)**:
  `~/.gemini/config/plugins/token-tracker/ui/index.html`
