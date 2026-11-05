---
name: prompt-effectiveness
description: Evaluates, scores (0–100), and rewrites prompts to maximize execution efficiency, file/symbol grounding, and token cost savings using real Antigravity transcript telemetry. Activate when the user asks to analyze a prompt, measure prompt effectiveness, improve prompt quality, audit high-cost prompts, or runs /prompt-effectiveness.
---

# Prompt Effectiveness Analyzer & Coach Skill

This skill powers the **Prompt Effectiveness Lab** inside the `token-tracker` plugin (`~/.gemini/config/plugins/token-tracker`) and provides deep LLM-backed prompt coaching and rewrites in chat.

## 1. How It Works (3-Dimension Effectiveness Model)

Every prompt (either a historical prompt with recorded execution telemetry or a new draft prompt) is scored from **0 to 100** across three weighted dimensions:

1. **Execution Efficiency (40 pts)**:
   - **Turns-to-Completion (15 pts)**: Measures main agent turns vs. repository baseline (`<= 3` main turns = full score; `> 10` turns flags iterative loop bloat where full context is re-billed every turn).
   - **Discovery vs. Action Tool Ratio (10 pts)**: Measures how many tool calls were spent on blind workspace discovery (`grep_search`, `find_by_name`, `list_dir`, `read_file`) before the first edit or command.
   - **Cache Hit Efficiency (8 pts)**: Evaluates context cache reuse (`cache_read_tokens / (input_tokens + cache_read_tokens)`).
   - **Cost vs. Repository Baseline (7 pts)**: Compares prompt spend against the repository's average cost per prompt.
2. **Clarity & Code Grounding (35 pts)**:
   - **Prompt Density (10 pts)**: Rewards concise, well-scoped prompts (`18–220` words) and penalizes ultra-short ambiguous 1-liners (`< 8` words).
   - **File Path & Symbol Grounding (11 pts)**: Checks for explicit file paths, `@file` mentions, and backticked function/class identifiers that eliminate exploratory search turns.
   - **Action Specificity (7 pts)**: Detects concrete engineering verbs (`implement`, `refactor`, `verify`) vs. vague phrases (`fix it`, `make it better`, `not working`).
   - **Acceptance Criteria & Constraints (7 pts)**: Checks for explicit verification criteria (`node --check`, `npm test`, `zero errors`), boundary constraints, and structured formatting (bullets/code fences).
3. **Context & Scope Fit (25 pts)**:
   - **Long-Context (`>200k`) Avoidance**: Flags prompts that pushed conversation context above `200,000` tokens (where input/cache rates double).
   - **Single-Responsibility Scoping**: Detects multi-goal prompt bundling (`also`, `additionally`, `while you're at it`) that inflates turn counts.
   - **Subagent Context Isolation**: Rewards delegating broad research or verification loops (`>12` turns) to isolated subagents (`research`, `qa-tester`) so raw file reads don't pollute the root conversation context.

---

## 2. CLI & Telemetry Commands

Run these commands via `run_command` to pull quantitative telemetry before coaching the user:

- **Audit all recent prompts across the workspace (or a specific repository) to find the highest- and lowest-scoring prompts**:
  ```bash
  node ~/.gemini/config/plugins/token-tracker/scripts/analyze-prompt.mjs --project all --limit 8
  ```
- **Analyze a specific historical conversation & prompt index**:
  ```bash
  node ~/.gemini/config/plugins/token-tracker/scripts/analyze-prompt.mjs --conversation <convIdPrefix> --prompt 1
  ```
- **Score a draft prompt string from the CLI**:
  ```bash
  node ~/.gemini/config/plugins/token-tracker/scripts/analyze-prompt.mjs --text "Your draft prompt here" --project token-tracker-plugin
  ```

---

## 3. Workflow When Triggered by the User

1. **Run Quantitative Analysis**:
   - If the user provides a conversation ID / prompt index (e.g., copied from the **Token Tracker** sidecar's `★ Analyze` button), run `analyze-prompt.mjs --conversation <id> --prompt <idx>`.
   - If the user provides a draft prompt string, run `analyze-prompt.mjs --text "<prompt>"` and inspect the workspace to identify the actual file paths and symbols their prompt should reference.
   - If the user asks a general question like *"How effective are my prompts?"* or runs `/prompt-effectiveness` with no arguments, run `analyze-prompt.mjs --project all --limit 8` to audit their recent prompt portfolio.
2. **Present the Scorecard & Root-Cause Diagnosis**:
   - Show the **0–100 Effectiveness Score & Grade (`A+` to `D`)** and the breakdown across **Execution Efficiency (40)**, **Clarity & Grounding (35)**, and **Context & Scope Fit (25)**.
   - Highlight the exact token/turn drivers (e.g., *"3 of 6 turns were spent grepping for the target file because no file path was grounded"*).
3. **Provide a Concrete "Before vs. After" Rewrite**:
   - Lookup the real file paths and function/symbol names in the active workspace so your rewritten prompt is 100% grounded in the real repository.
   - Present a copy-ready improved prompt with **Goal**, **Target Files & Symbols**, **Constraints**, and **Verification Criteria**.
   - Optionally surface the sidecar pill `[Token Tracker](sidecar://token-tracker/dashboard/)` (following the `ui-plugin-navigation` skill) so the user can test prompts interactively in the sidecar's **Prompt Effectiveness Lab**.
