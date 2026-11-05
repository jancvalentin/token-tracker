# Antigravity Token Tracker (`token-tracker-plugin`)

An Antigravity plugin and local developer dashboard that tracks **uncached input tokens**, **cache read tokens**, **output tokens**, and **estimated spend (`\$`)** across all your conversations and repositories—both **live via a `Stop` hook** and **retroactively across all historical transcripts**.

---

## Features

1. **100% Historical Backfill (`~/.gemini/antigravity/brain/` + `~/.gemini/config/projects/`)**
   - Automatically scans all existing `.system_generated/logs/transcript.jsonl` files in your local `brain/` folder and resolves project attribution directly from Antigravity's `.gemini/config/projects/*.json` configuration (filtering to actual workspace/repository projects).
   - Idempotent deduplication by `conversationId` — running sync or hooks multiple times never double-counts tokens.
2. **Granular Per-Prompt & Per-Turn Spend Tracking + Chronological Subagent Merging**
   - Every model turn (`PLANNER_RESPONSE`) is recorded with its exact uncached input, cache read, and output tokens, timestamp, model tier, tool calls, and long-context (`> 200k`) indicator, and grouped under its originating user prompt (`USER_INPUT`).
   - Child subagent sessions are automatically resolved to their root parent conversation and interleaved in **chronological order** inside the prompt that spawned them—eliminating duplicate top-level subagent chats while attributing their full token spend and cost to the parent prompt and conversation.
3. **Zero-Latency Automatic Logging (`Stop` Hook)**
   - Bundles `hooks.json` with a `Stop` hook that updates your usage ledger automatically at the end of each agent turn.
4. **Numbers-Only JSON Metrics Exporter**
   - Click **Export Metrics JSON** in the dashboard to download a clean `token-tracker-metrics-YYYY-MM-DD.json` file containing only aggregated numbers (`totals`, `byRepository`, `byModel`, `daily` time-series, and anonymized `conversationsNumeric` with nested prompt/turn metrics) with zero chat titles, prompts, or local filesystem paths—ready to import into any external analytics or billing app.
5. **Lightweight Local & In-App Sidecar UI (`ui/index.html` + `scripts/ui-server.mjs`)**
   - Zero external npm dependencies required; responsive KPI cards and accessible horizontally scrollable tables.
   - View **Daily Token Activity**, **Cache Hit Efficiency & Savings**, **Model Pricing & Spend Breakdown**, **Per-Repository Breakdown**, and a **3-Level Expandable Conversation Ledger** (Conversation → Prompts → Chronological Turns with Subagent badges).

---

## Quick Start (Any Device)

### 1. Install as a Global Antigravity Plugin
Clone directly into `~/.gemini/config/plugins/token-tracker` (or install via `agy plugin install`):
```bash
git clone https://github.com/jancvalentin/token-tracker.git ~/.gemini/config/plugins/token-tracker
```
Restart Antigravity once so the plugin's `hooks.json` (`Stop` hook), sidecar dashboard, and `token-tracker` skill are active across all workspaces.

### 2. Backfill All Historical Data & Launch the UI
```bash
cd ~/.gemini/config/plugins/token-tracker
npm run ui
```
To only run the backfill/sync in the terminal and print a summary:
```bash
npm run stats
```
