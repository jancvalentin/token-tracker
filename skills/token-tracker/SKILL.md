---
name: token-tracker
description: Syncs, backfills, analyzes, and visualizes token spending (input, cache read, and output tokens) across historical and live Antigravity transcripts, exports numbers-only JSON telemetry, and launches the local Token Tracker UI. Activate when the user asks about token usage, model spend, cache efficiency, or repository token breakdowns.
---

# Token Tracker & Spend Analytics Skill

This skill powers the `token-tracker` plugin (`~/.gemini/config/plugins/token-tracker`).

## 1. Capabilities

1. **Automatic Live Logging (`Stop` Hook)**:
   - Configured in `hooks.json` at the plugin root.
   - Fires automatically at the end of every agent loop (`Stop`), reading the conversation's `transcript.jsonl` and updating `data/users/<userId>.json` + `ui/data-bundle.js`.
2. **Full Historical Backfill (`--backfill`)**:
   - Scans every existing conversation directory under `~/.gemini/antigravity/brain/<conversationId>/.system_generated/logs/transcript.jsonl`.
   - Resolves actual project attribution directly from Antigravity's `.gemini/config/projects/*.json` configuration and `conversation_summaries.db` (filtering out non-project entries like `outside-of-project` or virtual sidecars).
   - Extracts `input_tokens`, `cache_read_tokens`, `output_tokens`, prompt count, model turns, tool call counts, model name, and repository name.
   - Records granular **per-prompt (`prompts[]`)** and **per-turn (`turns[]`)** token telemetry, and automatically merges child **subagent sessions** into their root parent conversation, interleaving subagent turns chronologically inside the parent prompt that spawned them.
3. **Numbers-Only JSON Metrics Export**:
   - The dashboard includes an **Export Metrics JSON** button that downloads `token-tracker-metrics-YYYY-MM-DD.json` containing strictly aggregated numeric metrics (`totals`, `byRepository`, `byModel`, `daily`, and anonymized `conversationsNumeric` with nested per-prompt and per-turn token numbers) with zero chat titles, prompts, or local file paths so it can be safely imported into external apps.
4. **Prompt Effectiveness Scoring & Sandbox (`prompt-effectiveness` skill)**:
   - Scores historical and draft prompts (`0–100`, `A+` to `D`) across Execution Efficiency, Clarity & Grounding, and Context Fit via `scripts/analyze-prompt.mjs` and the interactive **Prompt Effectiveness Lab** inside the sidecar UI.

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
