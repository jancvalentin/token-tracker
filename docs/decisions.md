# Architectural Decisions Log

## [2026-11-04] Deduplicate User Profiles & Prevent Incremental Stop-Hook Subagent Double-Counting
Stabilized `getUserIdentity` in `scripts/sync-tokens.mjs` and added `loadUniqueUserProfiles` + `seenConvIds` deduplication across `scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`, `scripts/analyze-prompt.mjs`, and `ui/index.html` so sandboxed vs. unsandboxed syncs never create duplicate user JSON profiles (`jan-valentin.json` vs. `jancvalentin.json`) that double the reported spend in the UI.
Hardened incremental `Stop` hook syncing (`runSync` with `backfill: false`) via `parseConversationByIdFromDisk` to always re-parse the full ancestor and child subagent tree fresh from `transcript.jsonl` before calling `mergeSubagentsIntoParents`, preventing subagent turns and costs from being merged multiple times into cached root conversations.

## [2026-11-04] Hybrid Prompt Effectiveness Analyzer & Sidecar Sandbox (`prompt-effectiveness` Skill)
Added a 3-dimension quantitative prompt scoring engine (`scripts/analyze-prompt.mjs`) and bundled the `prompt-effectiveness` skill (`skills/prompt-effectiveness/SKILL.md`) to evaluate prompts (0–100, `A+` to `D`) across Execution Efficiency (40 pts), Clarity & Grounding (35 pts), and Context & Scope Fit (25 pts).
Integrated an interactive **Prompt Effectiveness Lab** and per-prompt `★ Analyze` buttons directly into `ui/index.html` and `scripts/ui-server.mjs` (`/api/analyze-prompt`), combining zero-latency sidecar diagnostics and template rewrites with 1-click `/prompt-effectiveness` chat skill handoff.

## [2026-11-04] Granular Per-Prompt & Per-Turn Token Telemetry with Chronological Subagent Merging
Upgraded the token ledger schema (`2.1.0`) in `scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`, and `ui/index.html` to record individual `PLANNER_RESPONSE` model turns nested under their originating `USER_INPUT` prompts (`prompts[].turns[]`), enabling exact per-prompt and per-turn token/cost attribution.
Resolved subagent parent-child lineage across both modern (`step 0 SYSTEM_MESSAGE`) and legacy (`INVOKE_SUBAGENT` + `send_message`) transcripts without circular parent overwrites, folding all child subagent conversations into their root conversation and interleaving their turns chronologically inside the spawning prompt.
