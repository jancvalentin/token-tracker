# Task Tracker

## [2026-11-04] Fix Duplicate User Profile & Subagent Re-Merge Cost Doubling
- [x] Diagnose why the UI displayed ~\$591 (`2×` the actual ~\$296–\$301 spend): `~/.gemini/config/plugins/token-tracker/data/users/` contained both `jan-valentin.json` (from `user.config.json`) and `jancvalentin.json` (from `git config user.email` fallback), and `ui/index.html` / `writeUiBundle` summed `conversations` across all JSON files in `data/users/` (`scripts/sync-tokens.mjs`, `ui/index.html`).
- [x] Stabilize `getUserIdentity` and add `loadUniqueUserProfiles` in `scripts/sync-tokens.mjs` (also wired into `scripts/ui-server.mjs`) to deduplicate overlapping user profile files and automatically prune stale duplicate identity files (`scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`).
- [x] Add `seenConvIds` conversation UUID deduplication in `ui/index.html` (`render`) and `scripts/analyze-prompt.mjs` (`runPromptEffectivenessAudit`) as a defense-in-depth guard against duplicate conversation aggregation (`ui/index.html`, `scripts/analyze-prompt.mjs`).
- [x] Fix incremental `Stop` hook (`backfill: false`) subagent merging in `runSync` via `parseConversationByIdFromDisk` so parent and child subagent transcripts are always re-parsed fresh from disk before `mergeSubagentsIntoParents` runs (`scripts/sync-tokens.mjs`).
- [x] Remove stale `jancvalentin.json` from `~/.gemini/config/plugins/token-tracker/data/users/`, re-run backfill sync, sync all updated files to the installed plugin directory, and verify syntax (`scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`, `scripts/analyze-prompt.mjs`, `ui/index.html`, `docs/decisions.md`, `TASK.md`).

## [2026-11-04] Build Hybrid Prompt Effectiveness Skill & Sidecar Analyzer Lab
- [x] Create quantitative prompt effectiveness engine in `scripts/analyze-prompt.mjs` scoring Execution Efficiency (40 pts), Clarity & Grounding (35 pts), and Context & Scope Fit (25 pts) (`scripts/analyze-prompt.mjs`).
- [x] Update `scripts/sync-tokens.mjs` to preserve cleaned user prompt text (`prompts[].text`) up to 2,000 characters for file-path, symbol, and constraint signal extraction while keeping `/api/export-metrics` strictly numbers-only (`scripts/sync-tokens.mjs`).
- [x] Expose `/api/analyze-prompt` (`GET` & `POST`) in `scripts/ui-server.mjs` (`scripts/ui-server.mjs`).
- [x] Upgrade `ui/index.html` with inline per-prompt effectiveness score badges (`0–100`), `★ Analyze` buttons on every prompt row, and the interactive **Prompt Effectiveness Lab** drawer with live draft scoring, rewrite templates, and 1-click `/prompt-effectiveness` chat skill command copy (`ui/index.html`).
- [x] Author `skills/prompt-effectiveness/SKILL.md` and update `plugin.json`, `package.json`, `README.md`, `skills/token-tracker/SKILL.md`, and `docs/decisions.md` (`skills/prompt-effectiveness/SKILL.md`, `plugin.json`, `package.json`, `README.md`, `skills/token-tracker/SKILL.md`, `docs/decisions.md`).
- [x] Sync all updated files to `~/.gemini/config/plugins/token-tracker` and verify syntax, backfill sync, and CLI prompt audit (`data/users/jan-valentin.json`, `ui/data-bundle.js`).

## [2026-11-04] Remove Per-Repository `.gemini/token-usage.json` Export & Cleanup
- [x] Remove `writePerRepoReports` and `--write-repo-reports` flag from `scripts/sync-tokens.mjs` and `export:repos` script from `package.json`.
- [x] Delete generated `.gemini/token-usage.json` files and empty `.gemini/` directories across all 16 local Git repositories.
- [x] Document architectural decision in `docs/decisions.md` and sync updated files to `~/.gemini/config/plugins/token-tracker`.

## [2026-11-04] Granular Per-Prompt & Per-Turn Token Tracking + Chronological Subagent Merging
- [x] Update `scripts/sync-tokens.mjs` to record per-prompt (`prompts[]`) and per-turn (`turns[]`) token & cost breakdowns inside `parseTranscriptFile` (`scripts/sync-tokens.mjs`).
- [x] Fix bidirectional `parentConversationId` bug in `scripts/sync-tokens.mjs` and implement `mergeSubagentsIntoParents` to fold child subagent sessions into their parent conversation's prompts and chronological turn timeline (`scripts/sync-tokens.mjs`).
- [x] Update `buildUserSummary` in `scripts/sync-tokens.mjs` and `buildMetricsOnlyPayload` in `scripts/ui-server.mjs` with prompt-level and turn-level summary metrics (`trackedPrompts`, `avgCostPerPromptUsd`, `avgCostPerTurnUsd`, `avgTurnsPerPrompt`, `mergedSubagentRuns`, `longContextTurns`) (`scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`).
- [x] Upgrade `ui/index.html` with interactive Conversation → Prompt → Chronological Turn (including inline Subagent badges) drill-down accordion and Per-Prompt / Per-Turn KPI cards (`ui/index.html`).
- [x] Update `README.md`, `skills/token-tracker/SKILL.md`, `docs/decisions.md`, and sync to installed plugin directory (`~/.gemini/config/plugins/token-tracker`) (`README.md`, `skills/token-tracker/SKILL.md`, `docs/decisions.md`).
- [x] Run backfill sync (`node scripts/sync-tokens.mjs --backfill --summary`) and syntax checks (`node --check`) to verify zero errors (`data/users/jan-valentin.json`, `ui/data-bundle.js`).

## [2026-11-04] Pull Remote Code & Resolve Merge Conflicts
- [x] Pull remote `origin/main` into local `main` and inspect diverged commit histories (`README.md`, `scripts/sync-tokens.mjs`, `skills/token-tracker/SKILL.md`).
- [x] Resolve merge conflicts in `README.md`, `scripts/sync-tokens.mjs`, and `skills/token-tracker/SKILL.md` to preserve `.gemini/config/projects` attribution and multi-surface (`2.0 / CLI` + `IDE`) transcript syncing.
- [x] Stage resolved files and verify syntax (`node --check scripts/sync-tokens.mjs`, `node --check scripts/ui-server.mjs`).
- [x] Finalize merge commit on `main` (`README.md`, `scripts/sync-tokens.mjs`, `skills/token-tracker/SKILL.md`, `TASK.md`).
