#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PLUGIN_ROOT, "data", "users");

const FILE_PATH_REGEX =
  /(?:^|[\s`"'(])((?:\/|\.\/|\.\.\/|[a-zA-Z0-9_-]+\/)[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]{1,8}|[a-zA-Z0-9_-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sql|json|yaml|yml|md|html|css|scss|sh|toml))(?:$|[\s`"',.:;)\]])/g;

const CODE_SYMBOL_REGEX =
  /`[A-Za-z_$][A-Za-z0-9_$.()[\]-]{1,60}`|\b[a-z]+[A-Z][A-Za-z0-9_]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9_]*\b/g;

const ACTION_VERBS_REGEX =
  /\b(implement|create|build|fix|refactor|update|add|remove|delete|optimize|analyze|audit|debug|migrate|configure|deploy|test|verify|design|extract|merge|resolve|document)\b/gi;

const VAGUE_PHRASES_REGEX =
  /\b(make it better|fix it|doesn't work|not working|do something|somehow|whatever|stuff|things|broken|help me with this|check this|look into)\b/gi;

const ACCEPTANCE_CRITERIA_REGEX =
  /\b(should|must|ensure|verify|expect|test|acceptance|criteria|without breaking|zero errors|return|output|format|schema|validate|confirm|check that)\b/gi;

const CONSTRAINT_MARKERS_REGEX =
  /\b(do not|don't|never|avoid|only|strictly|keep|preserve|limit|within|compatible|sandbox|security|performance|typecheck|lint)\b/gi;

const MULTI_PART_CONJUNCTIONS_REGEX =
  /\b(also|and also|additionally|furthermore|plus|on top of that|while you're at it|by the way|next|after that)\b/gi;

const READ_DISCOVERY_TOOLS = new Set([
  "read_file",
  "grep_search",
  "find_by_name",
  "list_dir",
  "list_resources",
  "read_resource",
]);

/**
 * Extracts structural and linguistic signals from raw user prompt text.
 *
 * @param {string} rawText - User prompt text (full or preview)
 * @returns {object} Structural signals and extracted tokens
 */
export function extractPromptTextSignals(rawText) {
  const text = String(rawText || "").trim();
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const charCount = text.length;

  const fileMatches = new Set();
  let match;
  FILE_PATH_REGEX.lastIndex = 0;
  while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
    const candidate = (match[1] || "").trim();
    if (candidate && !candidate.startsWith("http")) {
      fileMatches.add(candidate);
    }
  }

  const symbolMatches = new Set();
  CODE_SYMBOL_REGEX.lastIndex = 0;
  while ((match = CODE_SYMBOL_REGEX.exec(text)) !== null) {
    symbolMatches.add(match[0].replace(/`/g, ""));
  }

  const actionVerbs = (text.match(ACTION_VERBS_REGEX) || []).map((w) => w.toLowerCase());
  const vaguePhrases = (text.match(VAGUE_PHRASES_REGEX) || []).map((w) => w.toLowerCase());
  const acceptanceMarkers = (text.match(ACCEPTANCE_CRITERIA_REGEX) || []).map((w) =>
    w.toLowerCase()
  );
  const constraintMarkers = (text.match(CONSTRAINT_MARKERS_REGEX) || []).map((w) =>
    w.toLowerCase()
  );
  const multiPartMarkers = (text.match(MULTI_PART_CONJUNCTIONS_REGEX) || []).map((w) =>
    w.toLowerCase()
  );

  const hasBulletList = /(?:^|\n)\s*(?:[-*•]|\d+\.)\s+/m.test(text);
  const hasCodeFence = /```[\s\S]*?```/.test(text);
  const hasSlashCommand = /(?:^|\s)\/[a-z][a-z0-9_-]{1,25}\b/i.test(text);
  const hasAtMention = /(?:^|\s)@[a-zA-Z0-9_./-]+/.test(text);
  const questionCount = (text.match(/\?/g) || []).length;

  return {
    text,
    wordCount,
    charCount,
    filePaths: Array.from(fileMatches),
    codeSymbols: Array.from(symbolMatches).slice(0, 12),
    actionVerbs: Array.from(new Set(actionVerbs)),
    vaguePhrases: Array.from(new Set(vaguePhrases)),
    acceptanceMarkers: Array.from(new Set(acceptanceMarkers)),
    constraintMarkers: Array.from(new Set(constraintMarkers)),
    multiPartMarkers: Array.from(new Set(multiPartMarkers)),
    hasBulletList,
    hasCodeFence,
    hasSlashCommand,
    hasAtMention,
    questionCount,
  };
}

/**
 * Computes baseline averages across a repository or user profile for relative efficiency scoring.
 *
 * @param {object[]} conversations - Array of parsed conversation objects
 * @param {string} [projectFilter="all"] - Optional repository filter
 * @returns {object} Baseline numeric medians and averages
 */
export function computeRepositoryBaselines(conversations = [], projectFilter = "all") {
  const filtered = (conversations || []).filter(
    (c) =>
      (projectFilter === "all" || c.project === projectFilter) &&
      (c.totalTokens || 0) > 0 &&
      Array.isArray(c.prompts) &&
      c.prompts.length > 0
  );

  const sourceConvs = filtered.length > 0 ? filtered : (conversations || []).filter((c) => (c.totalTokens || 0) > 0);

  let promptCount = 0;
  let totalTurns = 0;
  let totalTools = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalCacheRead = 0;
  let totalInput = 0;

  for (const c of sourceConvs) {
    for (const p of c.prompts || []) {
      if ((p.totalTokens || 0) <= 0 && (p.turnCount || 0) <= 0) continue;
      promptCount++;
      totalTurns += p.turnCount || 0;
      totalTools += p.toolCallCount || 0;
      totalTokens += p.totalTokens || 0;
      totalCostUsd += p.estimatedCostUsd || 0;
      totalCacheRead += p.cacheReadTokens || 0;
      totalInput += p.inputTokens || 0;
    }
  }

  if (promptCount === 0) {
    return {
      sampleSize: 0,
      avgTurnsPerPrompt: 4.5,
      avgToolsPerPrompt: 6.0,
      avgTokensPerPrompt: 120_000,
      avgCostPerPromptUsd: 0.12,
      avgCacheHitPct: 88.0,
    };
  }

  const totalCtx = totalInput + totalCacheRead;
  return {
    sampleSize: promptCount,
    avgTurnsPerPrompt: Number((totalTurns / promptCount).toFixed(2)),
    avgToolsPerPrompt: Number((totalTools / promptCount).toFixed(2)),
    avgTokensPerPrompt: Math.round(totalTokens / promptCount),
    avgCostPerPromptUsd: Number((totalCostUsd / promptCount).toFixed(4)),
    avgCacheHitPct: totalCtx > 0 ? Number(((totalCacheRead / totalCtx) * 100).toFixed(2)) : 85.0,
  };
}

/**
 * Generates an improved, structured prompt template based on detected weaknesses.
 *
 * @param {object} signals - Extracted linguistic signals from extractPromptTextSignals
 * @param {object} context - Optional repository/model metadata
 * @returns {string} Suggested high-effectiveness prompt rewrite
 */
export function buildSuggestedPromptRewrite(signals, context = {}) {
  const raw = signals.text || "Describe your task here";
  const repoLabel =
    context.project && context.project !== "general" ? context.project : "<repo-or-module>";
  const fileExample =
    signals.filePaths.length > 0
      ? signals.filePaths.map((f) => `\`${f}\``).join(", ")
      : `\`src/path/to/file.ts\``;
  const symbolExample =
    signals.codeSymbols.length > 0
      ? signals.codeSymbols.slice(0, 3).map((s) => `\`${s}\``).join(", ")
      : `\`targetFunctionOrComponent\``;

  const lines = [];
  lines.push(`**Goal**: ${raw.replace(/\s+/g, " ").trim()}`);
  lines.push("");
  lines.push(
    `**Target Files & Symbols (${repoLabel})**: Inspect ${fileExample} (specifically ${symbolExample}) first to avoid broad workspace scanning.`
  );
  lines.push("");
  lines.push(`**Requirements & Constraints**:`);
  lines.push(`- Implement the change following existing patterns in ${fileExample}.`);
  if (signals.constraintMarkers.length === 0) {
    lines.push(`- Preserve existing public signatures and unrelated comments/types.`);
  }
  lines.push(
    `**Verification Criteria**: Run syntax/typecheck and tests to confirm zero errors before finishing.`
  );

  return lines.join("\n");
}

/**
 * Evaluates a single prompt's effectiveness across 3 weighted dimensions:
 * 1. Execution Efficiency (40 pts) - Turns-to-completion, discovery overhead, cache hit rate, cost vs baseline
 * 2. Prompt Clarity & Structure (35 pts) - File/symbol grounding, action specificity, acceptance criteria, constraints
 * 3. Context & Decomposition Fit (25 pts) - Scope sizing, subagent orchestration, >200k long-context bloat avoidance
 *
 * Works both on historical prompts (with turn/token telemetry) and draft prompts in the Prompt Lab (telemetry-free mode).
 *
 * @param {object} promptInput - Prompt data object ({ text, preview, turnCount, toolCallCount, inputTokens, cacheReadTokens, outputTokens, totalTokens, estimatedCostUsd, longContextTurns, subagentRunCount, subagentTurnCount, turns })
 * @param {object} [options={}] - Optional context ({ project, model, baselines, conversationPromptIndex })
 * @returns {object} Comprehensive prompt effectiveness report
 */
export function analyzePromptEffectiveness(promptInput = {}, options = {}) {
  const rawText = promptInput.text || promptInput.preview || "";
  const signals = extractPromptTextSignals(rawText);
  const hasTelemetry =
    typeof promptInput.turnCount === "number" &&
    (promptInput.turnCount > 0 || (promptInput.totalTokens || 0) > 0);

  const baselines = options.baselines || computeRepositoryBaselines([], options.project);
  const turns = Array.isArray(promptInput.turns) ? promptInput.turns : [];
  const turnCount = Number(promptInput.turnCount || turns.length || 0);
  const toolCallCount = Number(promptInput.toolCallCount || 0);
  const inputTokens = Number(promptInput.inputTokens || 0);
  const cacheReadTokens = Number(promptInput.cacheReadTokens || 0);
  const outputTokens = Number(promptInput.outputTokens || 0);
  const totalTokens = Number(
    promptInput.totalTokens || inputTokens + cacheReadTokens + outputTokens
  );
  const estimatedCostUsd = Number(promptInput.estimatedCostUsd || 0);
  const longContextTurns = Number(promptInput.longContextTurns || 0);
  const subagentRunCount = Number(promptInput.subagentRunCount || 0);
  const subagentTurnCount = Number(promptInput.subagentTurnCount || 0);

  // Inspect tool call sequence across turns to measure "Blind Discovery Overhead"
  let discoveryToolCalls = 0;
  let totalRecordedTools = 0;
  let turnsBeforeFirstEditOrCmd = 0;
  let foundActionTool = false;

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const tTools = Array.isArray(t.tools) ? t.tools : [];
    for (const toolName of tTools) {
      totalRecordedTools++;
      if (READ_DISCOVERY_TOOLS.has(toolName)) {
        discoveryToolCalls++;
      } else if (
        toolName === "edit_file" ||
        toolName === "write_file" ||
        toolName === "run_command"
      ) {
        foundActionTool = true;
      }
    }
    if (!foundActionTool) {
      turnsBeforeFirstEditOrCmd++;
    }
  }

  const discoveryRatio =
    totalRecordedTools > 0
      ? Number((discoveryToolCalls / totalRecordedTools).toFixed(2))
      : 0;

  const cacheHitPct =
    inputTokens + cacheReadTokens > 0
      ? Number(((cacheReadTokens / (inputTokens + cacheReadTokens)) * 100).toFixed(1))
      : 0;

  const findings = [];
  const recommendations = [];

  // =========================================================================
  // Dimension 1: Prompt Clarity & Structure (Max 35 pts)
  // =========================================================================
  let clarityScore = 0;

  // 1a. Length & Specificity (0-10 pts)
  if (signals.wordCount >= 18 && signals.wordCount <= 220) {
    clarityScore += 10;
    findings.push({
      type: "strength",
      dimension: "clarity",
      title: "Optimal prompt density",
      detail: `${signals.wordCount} words provides enough context without diluting instruction priority.`,
    });
  } else if (signals.wordCount >= 8 && signals.wordCount < 18) {
    clarityScore += 6;
    findings.push({
      type: "warning",
      dimension: "clarity",
      title: "Brief / under-specified prompt",
      detail: `At ${signals.wordCount} words, the agent must infer file locations, edge cases, and verification steps.`,
    });
    recommendations.push(
      "Expand brief prompts to 20–80 words specifying the exact target file, expected behavior, and verification command."
    );
  } else if (signals.wordCount > 220) {
    clarityScore += 7;
    findings.push({
      type: "info",
      dimension: "clarity",
      title: "High-density specification prompt",
      detail: `${signals.wordCount} words. Use markdown headings or bullet lists so constraints aren't buried.`,
    });
  } else {
    clarityScore += 2;
    findings.push({
      type: "issue",
      dimension: "clarity",
      title: "Ultra-short / ambiguous prompt",
      detail: `Only ${signals.wordCount} words. Ultra-short prompts force extra discovery turns and increase token spend.`,
    });
    recommendations.push(
      "Avoid 1-line vague prompts. State the exact component/file, desired state change, and acceptance criteria upfront."
    );
  }

  // 1b. File, Path, or Symbol Grounding (0-11 pts)
  const hasFileGrounding = signals.filePaths.length > 0 || signals.hasAtMention;
  const hasSymbolGrounding = signals.codeSymbols.length > 0;
  if (hasFileGrounding && hasSymbolGrounding) {
    clarityScore += 11;
    findings.push({
      type: "strength",
      dimension: "clarity",
      title: "Strong file & symbol grounding",
      detail: `References concrete paths (${signals.filePaths.slice(0, 2).join(", ") || "@mention"}) and symbols (${signals.codeSymbols.slice(0, 2).join(", ")}), eliminating blind repo searches.`,
    });
  } else if (hasFileGrounding || hasSymbolGrounding) {
    clarityScore += 7;
    findings.push({
      type: "strength",
      dimension: "clarity",
      title: "Partial code grounding",
      detail: hasFileGrounding
        ? `Includes file path reference (${signals.filePaths.slice(0, 2).join(", ")}), helping localize the change.`
        : `Mentions code symbols (${signals.codeSymbols.slice(0, 3).join(", ")}), though adding file paths saves grep turns.`,
    });
    if (!hasFileGrounding) {
      recommendations.push(
        "Include the relative file path (or `@file` mention) alongside function/class names to skip initial search turns."
      );
    }
  } else {
    clarityScore += 2;
    findings.push({
      type: "warning",
      dimension: "clarity",
      title: "No file paths or code symbols referenced",
      detail:
        "Prompt contains zero file paths, `@mentions`, or backticked identifiers, forcing the agent to spend initial turns searching the workspace.",
    });
    recommendations.push(
      "Ground your prompt with at least 1 file path (e.g. `scripts/sync-tokens.mjs`) or symbol name (`parseTranscriptFile`) to cut discovery turns by 30–50%."
    );
  }

  // 1c. Action Verbs & Non-Vague Phrasing (0-7 pts)
  if (signals.actionVerbs.length > 0 && signals.vaguePhrases.length === 0) {
    clarityScore += 7;
  } else if (signals.vaguePhrases.length > 0) {
    clarityScore += 2;
    findings.push({
      type: "warning",
      dimension: "clarity",
      title: "Ambiguous phrasing detected",
      detail: `Contains vague phrases (${signals.vaguePhrases.map((v) => `"${v}"`).join(", ")}) that can cause speculative edits.`,
    });
    recommendations.push(
      `Replace vague phrasing (${signals.vaguePhrases.slice(0, 2).join(", ")}) with concrete verbs ("refactor X to return Y", "fix null check in Z").`
    );
  } else {
    clarityScore += 4;
  }

  // 1d. Acceptance Criteria, Constraints & Formatting (0-7 pts)
  let structurePts = 0;
  if (signals.acceptanceMarkers.length > 0) structurePts += 3;
  if (signals.constraintMarkers.length > 0) structurePts += 2;
  if (signals.hasBulletList || signals.hasCodeFence || signals.hasSlashCommand) structurePts += 2;
  clarityScore += Math.min(7, structurePts);

  if (signals.acceptanceMarkers.length === 0) {
    recommendations.push(
      "Add an explicit acceptance/verification condition (e.g., 'Verify with `node --check` and confirm zero errors')."
    );
  }

  clarityScore = Math.max(0, Math.min(35, clarityScore));

  // =========================================================================
  // Dimension 2: Execution Efficiency (Max 40 pts)
  // =========================================================================
  let efficiencyScore = 0;

  if (hasTelemetry) {
    // 2a. Turns-to-Completion Efficiency (0-15 pts)
    const effectiveMainTurns = Math.max(1, turnCount - subagentTurnCount);
    if (effectiveMainTurns <= 3) {
      efficiencyScore += 15;
      findings.push({
        type: "strength",
        dimension: "efficiency",
        title: "Fast turns-to-completion",
        detail: `Completed in ${effectiveMainTurns} main turn${effectiveMainTurns === 1 ? "" : "s"} (repo avg: ${baselines.avgTurnsPerPrompt} turns).`,
      });
    } else if (effectiveMainTurns <= 6) {
      efficiencyScore += 12;
    } else if (effectiveMainTurns <= 10) {
      efficiencyScore += 8;
      findings.push({
        type: "warning",
        dimension: "efficiency",
        title: "Elevated turn count",
        detail: `Took ${effectiveMainTurns} main agent turns (${turnCount} total with subagents). Each additional turn re-reads the entire conversation context.`,
      });
    } else {
      efficiencyScore += 4;
      findings.push({
        type: "issue",
        dimension: "efficiency",
        title: "High multi-turn iteration loop",
        detail: `Required ${effectiveMainTurns} main turns (${turnCount} total) and ${toolCallCount} tool calls, compounding context cost across turns.`,
      });
      recommendations.push(
        `This prompt required ${turnCount} turns. Break large multi-step tasks into smaller sequential prompts or provide exact file paths upfront.`
      );
    }

    // 2b. Discovery vs Execution Tool Ratio (0-10 pts)
    if (totalRecordedTools === 0 || discoveryRatio <= 0.45) {
      efficiencyScore += 10;
    } else if (discoveryRatio <= 0.7) {
      efficiencyScore += 7;
      if (turnsBeforeFirstEditOrCmd >= 3 && !hasFileGrounding) {
        findings.push({
          type: "warning",
          dimension: "efficiency",
          title: "High search/read overhead before action",
          detail: `${Math.round(discoveryRatio * 100)}% of tool calls (${discoveryToolCalls}/${totalRecordedTools}) were file reads/searches before any edit or command.`,
        });
      }
    } else {
      efficiencyScore += 4;
      if (!hasFileGrounding && turnCount >= 4) {
        findings.push({
          type: "issue",
          dimension: "efficiency",
          title: "Heavy workspace exploration overhead",
          detail: `${discoveryToolCalls} of ${totalRecordedTools} tool calls were spent searching/reading files because target paths weren't specified in the prompt.`,
        });
        recommendations.push(
          "Attach `@file` mentions or exact file paths in your prompt to eliminate exploratory search turns."
        );
      }
    }

    // 2c. Cache Reuse Efficiency (0-8 pts)
    if (totalTokens === 0) {
      efficiencyScore += 6;
    } else if (cacheHitPct >= 88) {
      efficiencyScore += 8;
      findings.push({
        type: "strength",
        dimension: "efficiency",
        title: "High prompt cache reuse",
        detail: `${cacheHitPct}% of input context was served from cache (90–95% discount).`,
      });
    } else if (cacheHitPct >= 70) {
      efficiencyScore += 6;
    } else {
      efficiencyScore += 3;
      findings.push({
        type: "warning",
        dimension: "efficiency",
        title: "Low cache hit rate",
        detail: `Cache hit rate was ${cacheHitPct}% (baseline: ${baselines.avgCacheHitPct}%), resulting in higher uncached input token charges.`,
      });
    }

    // 2d. Cost Efficiency vs Repository Baseline (0-7 pts)
    const baselineCost = Math.max(0.02, baselines.avgCostPerPromptUsd || 0.12);
    const costRatio = estimatedCostUsd / baselineCost;
    if (estimatedCostUsd <= baselineCost * 0.85) {
      efficiencyScore += 7;
    } else if (costRatio <= 1.35) {
      efficiencyScore += 5;
    } else if (costRatio <= 2.2) {
      efficiencyScore += 3;
      findings.push({
        type: "warning",
        dimension: "efficiency",
        title: "Above-average prompt spend",
        detail: `Cost $${estimatedCostUsd.toFixed(2)} (${costRatio.toFixed(1)}× the $${baselineCost.toFixed(2)} repository average).`,
      });
    } else {
      efficiencyScore += 1;
      findings.push({
        type: "issue",
        dimension: "efficiency",
        title: "Outlier token & cost spend",
        detail: `Cost $${estimatedCostUsd.toFixed(2)} across ${(totalTokens / 1000).toFixed(1)}k tokens (${costRatio.toFixed(1)}× repository average).`,
      });
    }
  } else {
    // Draft / Sandbox Mode: Estimate predicted execution efficiency from structural predictors
    let predictedEff = 18;
    if (hasFileGrounding) predictedEff += 10;
    if (hasSymbolGrounding) predictedEff += 5;
    if (signals.acceptanceMarkers.length > 0) predictedEff += 4;
    if (signals.vaguePhrases.length === 0 && signals.wordCount >= 12) predictedEff += 3;
    efficiencyScore = Math.min(40, predictedEff);
  }

  efficiencyScore = Math.max(0, Math.min(40, efficiencyScore));

  // =========================================================================
  // Dimension 3: Context & Decomposition Fit (Max 25 pts)
  // =========================================================================
  let contextScore = 25;

  // 3a. >200k Long-Context Tier Penalty (0 to -10 pts)
  if (longContextTurns > 0) {
    const penalty = Math.min(10, longContextTurns * 3);
    contextScore -= penalty;
    findings.push({
      type: "issue",
      dimension: "context",
      title: `Triggered >200k Long-Context pricing (${longContextTurns} turn${longContextTurns > 1 ? "s" : ""})`,
      detail:
        "Context exceeded 200,000 tokens, doubling per-million input/cache rates. Run `/compact` or start a fresh conversation for unrelated features.",
    });
    recommendations.push(
      "Use `/compact` or start a new chat session before context exceeds 200k tokens to avoid 2× long-context pricing."
    );
  } else if (hasTelemetry && totalTokens > 0) {
    findings.push({
      type: "strength",
      dimension: "context",
      title: "Stayed within standard <200k context window",
      detail: "Avoided 2× long-context rate surcharges on all turns.",
    });
  }

  // 3b. Scope Overload / Multi-Task Bundling (0 to -8 pts)
  if (signals.multiPartMarkers.length >= 2 || signals.questionCount >= 4) {
    contextScore -= 5;
    findings.push({
      type: "warning",
      dimension: "context",
      title: "Multi-goal prompt bundling",
      detail:
        "Prompt chains multiple distinct requests together, which increases turn count and risks partial completion.",
    });
    recommendations.push(
      "Split unrelated objectives into separate prompts or delegate parallel tracks via `/teamwork` or subagents."
    );
  }

  // 3c. Subagent Delegation Balance (0 to -7 pts)
  if (hasTelemetry && turnCount > 12 && subagentRunCount === 0) {
    contextScore -= 5;
    findings.push({
      type: "warning",
      dimension: "context",
      title: "Deep monolithic loop without subagent isolation",
      detail: `Executed ${turnCount} turns in the main context window without delegating research or verification to isolated subagents.`,
    });
    recommendations.push(
      "For tasks requiring >10 turns of codebase exploration + implementation, ask the agent to delegate exploration to the `research` subagent so raw file reads don't bloat your main context."
    );
  } else if (subagentRunCount > 0) {
    findings.push({
      type: "strength",
      dimension: "context",
      title: "Clean subagent context isolation",
      detail: `Delegated ${subagentRunCount} subagent run${subagentRunCount > 1 ? "s" : ""} (${subagentTurnCount} turns), keeping subagent tool output out of the main conversation history.`,
    });
  }

  contextScore = Math.max(0, Math.min(25, contextScore));

  // =========================================================================
  // Total Score, Grade, and Actionable Output
  // =========================================================================
  const totalScore = Math.round(clarityScore + efficiencyScore + contextScore);
  let grade = "C";
  let gradeLabel = "Fair";
  if (totalScore >= 90) {
    grade = "A+";
    gradeLabel = "Exceptional";
  } else if (totalScore >= 82) {
    grade = "A";
    gradeLabel = "Highly Effective";
  } else if (totalScore >= 74) {
    grade = "B";
    gradeLabel = "Good";
  } else if (totalScore >= 60) {
    grade = "C";
    gradeLabel = "Needs Refinement";
  } else {
    grade = "D";
    gradeLabel = "Inefficient / High Token Risk";
  }

  // Estimate potential token/cost savings if prompt is improved
  const excessTurns = hasTelemetry ? Math.max(0, turnCount - Math.max(3, subagentTurnCount + 2)) : 0;
  const avgTurnCost = turnCount > 0 ? estimatedCostUsd / turnCount : 0;
  const potentialSavingsUsd =
    hasTelemetry && totalScore < 85 && excessTurns > 0
      ? Number(Math.min(estimatedCostUsd * 0.55, excessTurns * avgTurnCost * 0.65).toFixed(4))
      : 0;

  const suggestedRewrite = buildSuggestedPromptRewrite(signals, {
    project: options.project,
    model: options.model || promptInput.model,
  });

  return {
    score: totalScore,
    grade,
    gradeLabel,
    mode: hasTelemetry ? "historical_telemetry" : "draft_sandbox",
    dimensions: {
      efficiency: {
        score: efficiencyScore,
        maxScore: 40,
        pct: Math.round((efficiencyScore / 40) * 100),
        label: hasTelemetry ? "Execution Efficiency" : "Predicted Efficiency",
      },
      clarity: {
        score: clarityScore,
        maxScore: 35,
        pct: Math.round((clarityScore / 35) * 100),
        label: "Clarity & Grounding",
      },
      contextFit: {
        score: contextScore,
        maxScore: 25,
        pct: Math.round((contextScore / 25) * 100),
        label: "Context & Scope Fit",
      },
    },
    telemetry: hasTelemetry
      ? {
          turnCount,
          toolCallCount,
          discoveryToolCalls,
          discoveryRatioPct: Math.round(discoveryRatio * 100),
          inputTokens,
          cacheReadTokens,
          outputTokens,
          totalTokens,
          cacheHitPct,
          estimatedCostUsd,
          longContextTurns,
          subagentRunCount,
          subagentTurnCount,
          potentialSavingsUsd,
          vsRepoAvgTurnsRatio:
            baselines.avgTurnsPerPrompt > 0
              ? Number((turnCount / baselines.avgTurnsPerPrompt).toFixed(2))
              : 1,
          vsRepoAvgCostRatio:
            baselines.avgCostPerPromptUsd > 0
              ? Number((estimatedCostUsd / baselines.avgCostPerPromptUsd).toFixed(2))
              : 1,
        }
      : null,
    signals: {
      wordCount: signals.wordCount,
      charCount: signals.charCount,
      filePaths: signals.filePaths,
      codeSymbols: signals.codeSymbols,
      actionVerbs: signals.actionVerbs,
      vaguePhrases: signals.vaguePhrases,
      hasAcceptanceCriteria: signals.acceptanceMarkers.length > 0,
      hasConstraints: signals.constraintMarkers.length > 0,
      hasStructuredFormatting:
        signals.hasBulletList || signals.hasCodeFence || signals.hasSlashCommand,
    },
    findings,
    recommendations: Array.from(new Set(recommendations)).slice(0, 5),
    suggestedRewrite,
  };
}

/**
 * Loads local user token profile and computes an aggregate Prompt Effectiveness Audit across recent conversations.
 *
 * @param {object} [opts={}] - Filter options ({ project, conversationId, promptIndex, customText, limit })
 * @returns {object} Audit result payload
 */
export function runPromptEffectivenessAudit(opts = {}) {
  const files = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"))
    : [];

  let conversations = [];
  const seenConvIds = new Set();
  for (const f of files) {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      if (Array.isArray(u.conversations)) {
        for (const c of u.conversations) {
          if (c.conversationId) {
            if (seenConvIds.has(c.conversationId)) continue;
            seenConvIds.add(c.conversationId);
          }
          conversations.push(c);
        }
      }
    } catch {}
  }

  const baselines = computeRepositoryBaselines(conversations, opts.project || "all");

  // Mode 1: Analyze custom draft text
  if (opts.customText) {
    return {
      generatedAt: new Date().toISOString(),
      baselines,
      analysis: analyzePromptEffectiveness(
        { text: opts.customText },
        { project: opts.project || "general", baselines }
      ),
    };
  }

  // Mode 2: Analyze a specific conversation + promptIndex
  if (opts.conversationId) {
    const conv = conversations.find(
      (c) =>
        c.conversationId === opts.conversationId ||
        String(c.conversationId || "").startsWith(opts.conversationId)
    );
    if (!conv) {
      return { error: `Conversation not found: ${opts.conversationId}` };
    }
    const targetIdx = Number(opts.promptIndex || 1);
    const promptObj =
      (conv.prompts || []).find((p) => p.promptIndex === targetIdx) || (conv.prompts || [])[0];
    if (!promptObj) {
      return { error: `No prompts found in conversation ${conv.conversationId}` };
    }
    const convBaselines = computeRepositoryBaselines(conversations, conv.project);
    return {
      generatedAt: new Date().toISOString(),
      conversationId: conv.conversationId,
      project: conv.project,
      title: conv.title,
      promptIndex: promptObj.promptIndex,
      baselines: convBaselines,
      analysis: analyzePromptEffectiveness(promptObj, {
        project: conv.project,
        model: promptObj.model || conv.model,
        baselines: convBaselines,
      }),
    };
  }

  // Mode 3: Portfolio summary across recent tracked prompts
  const scoredPrompts = [];
  for (const c of conversations) {
    if (opts.project && opts.project !== "all" && c.project !== opts.project) continue;
    if ((c.totalTokens || 0) <= 0) continue;
    const projBaselines = computeRepositoryBaselines(conversations, c.project);
    for (const p of c.prompts || []) {
      if ((p.totalTokens || 0) <= 0) continue;
      const report = analyzePromptEffectiveness(p, {
        project: c.project,
        model: p.model || c.model,
        baselines: projBaselines,
      });
      scoredPrompts.push({
        conversationId: c.conversationId,
        project: c.project,
        promptIndex: p.promptIndex,
        timestamp: p.timestamp,
        preview: p.preview || p.text || c.title,
        turnCount: p.turnCount,
        totalTokens: p.totalTokens,
        estimatedCostUsd: p.estimatedCostUsd,
        score: report.score,
        grade: report.grade,
        dimensions: report.dimensions,
        topRecommendation: report.recommendations[0] || null,
      });
    }
  }

  const avgScore =
    scoredPrompts.length > 0
      ? Math.round(scoredPrompts.reduce((acc, item) => acc + item.score, 0) / scoredPrompts.length)
      : 0;

  const limit = Number(opts.limit || 10);
  const lowestScoring = [...scoredPrompts]
    .sort((a, b) => a.score - b.score || b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, limit);
  const highestScoring = [...scoredPrompts]
    .sort((a, b) => b.score - a.score || a.estimatedCostUsd - b.estimatedCostUsd)
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    projectFilter: opts.project || "all",
    totalPromptsAnalyzed: scoredPrompts.length,
    averageEffectivenessScore: avgScore,
    baselines,
    highestScoringPrompts: highestScoring,
    lowestScoringOpportunities: lowestScoring,
  };
}

// CLI entrypoint
const isMain =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const text = getArg("--text");
  const conversationId = getArg("--conversation");
  const promptIndex = getArg("--prompt");
  const project = getArg("--project") || "all";
  const limit = Number(getArg("--limit") || 8);

  const result = runPromptEffectivenessAudit({
    customText: text,
    conversationId,
    promptIndex,
    project,
    limit,
  });

  console.log(JSON.stringify(result, null, 2));
}
