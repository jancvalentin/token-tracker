# Task Tracker

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
