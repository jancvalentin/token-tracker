# Architectural Decisions Log

## [2026-11-04] Granular Per-Prompt & Per-Turn Token Telemetry with Chronological Subagent Merging
Upgraded the token ledger schema (`2.1.0`) in `scripts/sync-tokens.mjs`, `scripts/ui-server.mjs`, and `ui/index.html` to record individual `PLANNER_RESPONSE` model turns nested under their originating `USER_INPUT` prompts (`prompts[].turns[]`), enabling exact per-prompt and per-turn token/cost attribution.
Resolved subagent parent-child lineage across both modern (`step 0 SYSTEM_MESSAGE`) and legacy (`INVOKE_SUBAGENT` + `send_message`) transcripts without circular parent overwrites, folding all child subagent conversations into their root conversation and interleaving their turns chronologically inside the spawning prompt.
