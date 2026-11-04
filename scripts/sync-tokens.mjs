#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PLUGIN_ROOT, "data", "users");
const UI_DIR = path.join(PLUGIN_ROOT, "ui");
const BRAIN_DIR = path.join(os.homedir(), ".gemini", "antigravity", "brain");

/**
 * Official per-model pricing table (USD per 1M tokens)
 * - Separates Pro models from Gemini 3.x Flash models (3.0, 3.5, 3.6, 3.7, 3.8 Flash)
 * - Includes official Anthropic Claude Opus 5.5 ($4.00 / $0.20 / $20.00) & Claude Sonnet 5.5 ($2.00 / $0.10 / $10.00)
 */
export const MODEL_PRICING_TABLE = {
  "Gemini 3.1 Pro": {
    tier: "Pro",
    inputPerMillion: 2.0,
    cacheReadPerMillion: 0.20,
    outputPerMillion: 12.0,
    longInputPerMillion: 4.0,
    longCacheReadPerMillion: 0.40,
    longOutputPerMillion: 18.0,
  },
  "Gemini 3 Flash": {
    tier: "Flash",
    inputPerMillion: 0.50,
    cacheReadPerMillion: 0.05,
    outputPerMillion: 3.00,
    longInputPerMillion: 0.50,
    longCacheReadPerMillion: 0.05,
    longOutputPerMillion: 3.00,
  },
  "Gemini 3.5 Flash": {
    tier: "Flash",
    inputPerMillion: 1.50,
    cacheReadPerMillion: 0.15,
    outputPerMillion: 9.00,
    longInputPerMillion: 1.50,
    longCacheReadPerMillion: 0.15,
    longOutputPerMillion: 9.00,
  },
  "Gemini 3.6 Flash": {
    tier: "Flash",
    inputPerMillion: 1.50,
    cacheReadPerMillion: 0.15,
    outputPerMillion: 7.50,
    longInputPerMillion: 1.50,
    longCacheReadPerMillion: 0.15,
    longOutputPerMillion: 7.50,
  },
  "Gemini 3.7 Flash": {
    tier: "Flash",
    inputPerMillion: 0.75,
    cacheReadPerMillion: 0.075,
    outputPerMillion: 3.75,
    longInputPerMillion: 0.75,
    longCacheReadPerMillion: 0.075,
    longOutputPerMillion: 3.75,
  },
  "Gemini 3.8 Flash": {
    tier: "Flash",
    inputPerMillion: 0.75,
    cacheReadPerMillion: 0.075,
    outputPerMillion: 3.75,
    longInputPerMillion: 0.75,
    longCacheReadPerMillion: 0.075,
    longOutputPerMillion: 3.75,
  },
  "Gemini 4 Argon": {
    tier: "Pro",
    inputPerMillion: 2.0,
    cacheReadPerMillion: 0.20,
    outputPerMillion: 12.0,
    longInputPerMillion: 4.0,
    longCacheReadPerMillion: 0.40,
    longOutputPerMillion: 18.0,
  },
  "Gemini 2.5 Pro (Default)": {
    tier: "Pro",
    inputPerMillion: 1.25,
    cacheReadPerMillion: 0.125,
    outputPerMillion: 10.0,
    longInputPerMillion: 2.50,
    longCacheReadPerMillion: 0.25,
    longOutputPerMillion: 15.0,
  },
  "Claude Opus 5.5": {
    tier: "Opus",
    inputPerMillion: 4.0,
    cacheReadPerMillion: 0.20,
    outputPerMillion: 20.0,
    longInputPerMillion: 4.0,
    longCacheReadPerMillion: 0.20,
    longOutputPerMillion: 20.0,
  },
  "Claude Sonnet 5.5": {
    tier: "Sonnet",
    inputPerMillion: 2.0,
    cacheReadPerMillion: 0.10,
    outputPerMillion: 10.0,
    longInputPerMillion: 2.0,
    longCacheReadPerMillion: 0.10,
    longOutputPerMillion: 10.0,
  },
};

export function getModelRates(modelName) {
  if (!modelName) return MODEL_PRICING_TABLE["Gemini 2.5 Pro (Default)"];
  if (MODEL_PRICING_TABLE[modelName]) return MODEL_PRICING_TABLE[modelName];
  const lower = modelName.toLowerCase();

  // Check exact Flash generation first so each 3.x Flash uses its official rate
  if (lower.includes("3.8") && lower.includes("flash")) return MODEL_PRICING_TABLE["Gemini 3.8 Flash"];
  if (lower.includes("3.7") && lower.includes("flash")) return MODEL_PRICING_TABLE["Gemini 3.7 Flash"];
  if (lower.includes("3.6") && lower.includes("flash")) return MODEL_PRICING_TABLE["Gemini 3.6 Flash"];
  if (lower.includes("3.5") && lower.includes("flash")) return MODEL_PRICING_TABLE["Gemini 3.5 Flash"];
  if (lower.includes("flash")) return MODEL_PRICING_TABLE["Gemini 3 Flash"];

  if (lower.includes("3.1") || (lower.includes("gemini 3") && lower.includes("pro"))) {
    return MODEL_PRICING_TABLE["Gemini 3.1 Pro"];
  }
  if (lower.includes("gemini 4") || lower.includes("argon")) {
    return MODEL_PRICING_TABLE["Gemini 4 Argon"];
  }
  if (lower.includes("opus")) return MODEL_PRICING_TABLE["Claude Opus 5.5"];
  if (lower.includes("sonnet")) return MODEL_PRICING_TABLE["Claude Sonnet 5.5"];

  return MODEL_PRICING_TABLE["Gemini 2.5 Pro (Default)"];
}

export function computeStepCostUsd(inputTokens, cacheReadTokens, outputTokens, modelName) {
  const rates = getModelRates(modelName);
  const totalPromptContext = inputTokens + cacheReadTokens;
  const isLongContext = totalPromptContext > 200_000;

  const inRate = isLongContext ? rates.longInputPerMillion : rates.inputPerMillion;
  const cacheRate = isLongContext ? rates.longCacheReadPerMillion : rates.cacheReadPerMillion;
  const outRate = isLongContext ? rates.longOutputPerMillion : rates.outputPerMillion;

  const cost =
    (inputTokens / 1_000_000) * inRate +
    (cacheReadTokens / 1_000_000) * cacheRate +
    (outputTokens / 1_000_000) * outRate;

  const uncachedEquiv =
    ((inputTokens + cacheReadTokens) / 1_000_000) * inRate +
    (outputTokens / 1_000_000) * outRate;

  return {
    costUsd: Number(cost.toFixed(6)),
    savedByCacheUsd: Number(Math.max(0, uncachedEquiv - cost).toFixed(6)),
  };
}

function getUserIdentity() {
  const cfgPath = path.join(PLUGIN_ROOT, "user.config.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (cfg.userId) {
        return {
          userId: cfg.userId,
          displayName: cfg.displayName || cfg.userId,
          email: cfg.email || `${cfg.userId}@local`,
          hostname: os.hostname(),
        };
      }
    } catch {}
  }

  let name = process.env.TOKEN_TRACKER_USER_NAME || "";
  let email = process.env.TOKEN_TRACKER_USER_EMAIL || "";
  try {
    if (!name) {
      name = execSync("git config user.name", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
  } catch {}
  try {
    if (!email) {
      email = execSync("git config user.email", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
  } catch {}

  const username = os.userInfo().username || "developer";
  const displayName = name || username;
  const slug = (email ? email.split("@")[0] : username)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");

  return {
    userId: slug || username.toLowerCase(),
    displayName,
    email: email || `${username}@local`,
    hostname: os.hostname(),
  };
}

const REPO_METADATA_CACHE = new Map();

function isInvalidProjectCandidate(name) {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith(".")) return true;
  if (
    [
      "Carrion",
      "Projects",
      "Git",
      "Desktop",
      "Users",
      "general",
      "README.md",
      "TASK.md",
      "CHANGELOG.md",
      "install.sh",
      "package.json",
      "node_modules",
      "src",
      "app",
      "apps",
      "docs",
    ].includes(trimmed)
  ) {
    return true;
  }
  if (/\.(md|sh|json|ts|js|mjs|cjs|html|css|png|jpg|jpeg|svg|pdf|txt|jsonl|yaml|yml|lock)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Resolves a project slug to its actual local Git repository path and remote URL if present on disk.
 */
function resolveRepoMetadata(projectSlug) {
  if (!projectSlug || projectSlug === "general") {
    return { project: "general", repoPath: null, gitRemote: null, isGitRepo: false };
  }
  if (REPO_METADATA_CACHE.has(projectSlug)) {
    return REPO_METADATA_CACHE.get(projectSlug);
  }

  const home = os.homedir();
  const candidateDirs = [
    path.join(home, "Git", "Carrion", projectSlug),
    path.join(home, "Git", "Projects", projectSlug),
    path.join(home, "Git", projectSlug),
    path.join(home, "Desktop", "Git", "Carrion", projectSlug),
    path.join(home, "Desktop", "Git", "Projects", projectSlug),
    path.join(home, "Desktop", "Git", projectSlug),
  ];

  let foundPath = null;
  let isGitRepo = false;
  let gitRemote = null;

  // Pass 1: Prefer a candidate directory that is an actual Git repository (.git exists)
  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, ".git"))) {
        foundPath = dir;
        isGitRepo = true;
        try {
          gitRemote =
            execSync(`git -C "${dir}" config --get remote.origin.url`, {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }).trim() || null;
        } catch {}
        break;
      }
    } catch {}
  }

  // Pass 2: Fallback to an existing directory that has more than just .gemini
  if (!foundPath) {
    for (const dir of candidateDirs) {
      try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          const entries = fs.readdirSync(dir).filter((e) => e !== ".gemini" && e !== ".DS_Store");
          if (entries.length > 0) {
            foundPath = dir;
            break;
          }
        }
      } catch {}
    }
  }

  const meta = {
    project: projectSlug,
    repoPath: foundPath,
    gitRemote,
    isGitRepo,
  };
  REPO_METADATA_CACHE.set(projectSlug, meta);
  return meta;
}

/**
 * Extracts all repository candidates and weights from a block of text (file paths, worktrees, or workspace headers).
 */
function extractProjectsFromText(text) {
  if (!text) return [];
  const results = [];

  // 1. Antigravity worktree paths: ~/.gemini/antigravity/worktrees/<repo>/<branch>
  const worktreeRegex = /\/\.gemini\/antigravity\/worktrees\/([a-zA-Z0-9._-]+)\//g;
  let match;
  while ((match = worktreeRegex.exec(text)) !== null) {
    if (!isInvalidProjectCandidate(match[1])) {
      results.push({ project: match[1], weight: 4 });
    }
  }

  // 2. Explicit Command Working Directory / Active Workspaces headers
  const cwdRegex = /Command Working Directory:\s*(\/[^\n<\r]+)/g;
  while ((match = cwdRegex.exec(text)) !== null) {
    const p = extractSingleRepoFromPath(match[1].trim());
    if (p) results.push({ project: p, weight: 6 });
  }

  // 3. Nested org folders: /Git/Carrion/<repo> or /Git/Projects/<repo>
  const nestedRegex = /\/(?:Desktop\/)?Git\/(?:Carrion|Projects)\/([a-zA-Z0-9._-]+)/g;
  while ((match = nestedRegex.exec(text)) !== null) {
    if (!isInvalidProjectCandidate(match[1])) {
      results.push({ project: match[1], weight: 4 });
    }
  }

  // 4. Direct /Git/<repo> paths
  const directGitRegex = /\/(?:Desktop\/)?Git\/([a-zA-Z0-9._-]+)(?:\/([a-zA-Z0-9._-]+))?/g;
  while ((match = directGitRegex.exec(text)) !== null) {
    const first = match[1];
    const second = match[2];
    if (first === "Carrion" || first === "Projects") {
      if (second && !isInvalidProjectCandidate(second)) {
        results.push({ project: second, weight: 4 });
      }
      continue;
    }
    if (first === "plugins") {
      // Attribute to actual sub-plugin repo if inside a plugin folder, otherwise "plugins"
      if (second && (second === "token-tracker-plugin" || second === "fullstack-cloud-plugin")) {
        results.push({ project: "plugins", weight: 4 });
      } else {
        results.push({ project: "plugins", weight: 4 });
      }
      continue;
    }
    if (!isInvalidProjectCandidate(first)) {
      results.push({ project: first, weight: 3 });
    }
  }

  return results;
}

function extractSingleRepoFromPath(rawPath) {
  if (!rawPath) return null;
  const wt = rawPath.match(/\/\.gemini\/antigravity\/worktrees\/([a-zA-Z0-9._-]+)/);
  if (wt && !isInvalidProjectCandidate(wt[1])) return wt[1];

  const nested = rawPath.match(/\/(?:Desktop\/)?Git\/(?:Carrion|Projects)\/([a-zA-Z0-9._-]+)/);
  if (nested && !isInvalidProjectCandidate(nested[1])) return nested[1];

  const direct = rawPath.match(/\/(?:Desktop\/)?Git\/([a-zA-Z0-9._-]+)/);
  if (direct && !isInvalidProjectCandidate(direct[1])) return direct[1];

  const base = path.basename(rawPath);
  if (!isInvalidProjectCandidate(base)) return base;
  return null;
}

function cleanUserPromptTitle(rawContent) {
  if (!rawContent) return "Untitled Conversation";
  let text = rawContent;
  const reqMatch = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (reqMatch) {
    text = reqMatch[1];
  } else {
    const sysMsgMatch = text.match(/content=([^\n]+)/);
    if (sysMsgMatch) {
      text = sysMsgMatch[1];
    }
  }
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Untitled Conversation";
  return text.length > 90 ? text.slice(0, 87) + "..." : text;
}

function normalizeModelName(rawModel) {
  if (!rawModel) return null;
  const trimmed = rawModel.trim();
  if (
    trimmed.length > 50 ||
    /comment on this change|human readable name|exact string/i.test(trimmed)
  ) {
    return null;
  }
  // Map legacy Claude 4.6 label in transcripts to Claude Opus 5.5 if needed, or preserve exact string
  if (/claude\s+opus\s+4\.6/i.test(trimmed)) {
    return trimmed.replace(/4\.6/i, "5.5");
  }
  if (/claude\s+sonnet\s+4\.6/i.test(trimmed)) {
    return trimmed.replace(/4\.6/i, "5.5");
  }
  return trimmed;
}

/**
 * Preserves decimal model version numbers like "Gemini 3.1 Pro (High)", "Gemini 3.8 Flash (Medium)", "Claude Opus 5.5 (Thinking)"
 */
function extractModelFromInput(rawContent) {
  if (!rawContent) return null;
  const match = rawContent.match(
    /Model Selection`?\s+from\s+[^\n]+?\s+to\s+((?:Gemini|Claude|GPT|o1|o3)[A-Za-z0-9 .()-]+?)\.(?:\s+No need|\s*<)/i
  );
  if (match && match[1]) {
    return normalizeModelName(match[1]);
  }
  return null;
}

function parseTranscriptFile(transcriptPath, conversationId, hookMeta = {}) {
  if (!fs.existsSync(transcriptPath)) return null;

  let stat;
  try {
    stat = fs.statSync(transcriptPath);
  } catch {
    return null;
  }

  const content = fs.readFileSync(transcriptPath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let estimatedCostUsd = 0;
  let savedByCacheUsd = 0;
  let promptCount = 0;
  let turnCount = 0;
  let toolCallCount = 0;
  let subagentCount = 0;
  let title = null;
  let detectedModel =
    hookMeta.modelName && hookMeta.modelName !== "auto"
      ? normalizeModelName(hookMeta.modelName)
      : null;
  const projectVoteCounts = new Map();
  let parentConversationId = null;

  if (Array.isArray(hookMeta.workspacePaths)) {
    for (const wp of hookMeta.workspacePaths) {
      const p = extractSingleRepoFromPath(wp);
      if (p) projectVoteCounts.set(p, (projectVoteCounts.get(p) || 0) + 8);
    }
  }

  // First pass: find initial model if set in first user input
  for (const line of lines) {
    try {
      const step = JSON.parse(line);
      if (step.type === "USER_INPUT") {
        const m = extractModelFromInput(step.content);
        if (m) {
          detectedModel = m;
          break;
        }
      }
    } catch {}
  }

  let currentModel = detectedModel || "Gemini 2.5 Pro (Default)";
  let startedAt = null;
  let updatedAt = null;
  const byDate = {};
  const byModelInConv = {};

  for (const line of lines) {
    let step;
    try {
      step = JSON.parse(line);
    } catch {
      continue;
    }

    const stepTime = step.created_at || null;
    if (stepTime) {
      if (!startedAt || stepTime < startedAt) startedAt = stepTime;
      if (!updatedAt || stepTime > updatedAt) updatedAt = stepTime;
    }

    if (step.type === "USER_INPUT") {
      promptCount++;
      if (!title && typeof step.content === "string") {
        title = cleanUserPromptTitle(step.content);
      }
      const modelChange = extractModelFromInput(step.content);
      if (modelChange) {
        currentModel = modelChange;
        detectedModel = modelChange;
      }
    } else if (step.type === "SYSTEM_MESSAGE" && typeof step.content === "string") {
      if (!title) {
        title = cleanUserPromptTitle(step.content);
      }
      const senderMatch = step.content.match(/sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (senderMatch && senderMatch[1] && senderMatch[1] !== conversationId) {
        parentConversationId = senderMatch[1];
      }
    }

    if (typeof step.content === "string") {
      // Do not vote on CONVERSATION_HISTORY summaries which mention other sessions
      if (step.type !== "CONVERSATION_HISTORY") {
        const matches = extractProjectsFromText(step.content);
        const mult = step.type === "SYSTEM_MESSAGE" ? 1 : 2;
        for (const m of matches) {
          projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight * mult);
        }
      }
    }

    if (typeof step.thinking === "string") {
      const matches = extractProjectsFromText(step.thinking);
      for (const m of matches) {
        projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight);
      }
      if (/basket-app/i.test(step.thinking)) {
        projectVoteCounts.set("basket-app", (projectVoteCounts.get("basket-app") || 0) + 2);
      }
      if (/blessed[\s-]aluminum/i.test(step.thinking)) {
        projectVoteCounts.set("blessed-aluminum", (projectVoteCounts.get("blessed-aluminum") || 0) + 2);
      }
    }

    if (step.type === "PLANNER_RESPONSE") {
      turnCount++;
      const stepIn = Number(step.input_tokens || 0);
      const stepCache = Number(step.cache_read_tokens || 0);
      const stepOut = Number(step.output_tokens || 0);

      const { costUsd, savedByCacheUsd: stepSaved } = computeStepCostUsd(
        stepIn,
        stepCache,
        stepOut,
        currentModel
      );

      inputTokens += stepIn;
      cacheReadTokens += stepCache;
      outputTokens += stepOut;
      estimatedCostUsd += costUsd;
      savedByCacheUsd += stepSaved;

      if (!byModelInConv[currentModel]) {
        byModelInConv[currentModel] = {
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          turns: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
        };
      }
      byModelInConv[currentModel].inputTokens += stepIn;
      byModelInConv[currentModel].cacheReadTokens += stepCache;
      byModelInConv[currentModel].outputTokens += stepOut;
      byModelInConv[currentModel].turns += 1;
      byModelInConv[currentModel].estimatedCostUsd = Number(
        (byModelInConv[currentModel].estimatedCostUsd + costUsd).toFixed(6)
      );
      byModelInConv[currentModel].savedByCacheUsd = Number(
        (byModelInConv[currentModel].savedByCacheUsd + stepSaved).toFixed(6)
      );

      const dateKey = (stepTime || stat.mtime.toISOString()).slice(0, 10);
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
        };
      }
      byDate[dateKey].inputTokens += stepIn;
      byDate[dateKey].cacheReadTokens += stepCache;
      byDate[dateKey].outputTokens += stepOut;
      byDate[dateKey].turns += 1;
      byDate[dateKey].estimatedCostUsd = Number((byDate[dateKey].estimatedCostUsd + costUsd).toFixed(6));
      byDate[dateKey].savedByCacheUsd = Number((byDate[dateKey].savedByCacheUsd + stepSaved).toFixed(6));

      if (Array.isArray(step.tool_calls)) {
        toolCallCount += step.tool_calls.length;
        byDate[dateKey].toolCalls += step.tool_calls.length;
        for (const tc of step.tool_calls) {
          if (tc.name === "invoke_subagent") subagentCount++;
          if (tc.name === "send_message" && tc.args && tc.args.Recipient && !parentConversationId) {
            const cleanedRecip = String(tc.args.Recipient).replace(/["']/g, "").trim();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedRecip)) {
              parentConversationId = cleanedRecip;
            }
          }
          const argsStr = JSON.stringify(tc.args || {});
          const matches = extractProjectsFromText(argsStr);
          for (const m of matches) {
            projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight * 3);
          }
        }
      }
    }
  }

  let project = "general";
  let bestScore = 0;
  for (const [proj, score] of projectVoteCounts.entries()) {
    if (score > bestScore) {
      bestScore = score;
      project = proj;
    }
  }

  const totalTokens = inputTokens + cacheReadTokens + outputTokens;
  if (totalTokens === 0 && turnCount === 0) {
    return null;
  }

  const fallbackIso = stat.mtime.toISOString();
  return {
    conversationId,
    parentConversationId,
    title: title || `Session ${conversationId.slice(0, 8)}`,
    project,
    model: detectedModel || "Gemini 2.5 Pro (Default)",
    hasTokenTelemetry: totalTokens > 0,
    startedAt: startedAt || fallbackIso,
    updatedAt: updatedAt || fallbackIso,
    promptCount,
    turnCount,
    toolCallCount,
    subagentCount,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    savedByCacheUsd: Number(savedByCacheUsd.toFixed(6)),
    byDate,
    byModelInConv,
  };
}

function buildUserSummary(userMeta, conversationsMap) {
  const conversations = Object.values(conversationsMap).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let totalSavedByCacheUsd = 0;
  let totalPrompts = 0;
  let totalTurns = 0;
  let trackedTurns = 0;
  let legacyTurnsPreTelemetry = 0;
  let trackedConversations = 0;
  let legacyConversationsPreTelemetry = 0;
  let totalToolCalls = 0;
  let totalSubagents = 0;

  const daily = {};
  const byProject = {};
  const byModel = {};

  for (const conv of conversations) {
    totalInputTokens += conv.inputTokens;
    totalCacheReadTokens += conv.cacheReadTokens;
    totalOutputTokens += conv.outputTokens;
    totalCostUsd += conv.estimatedCostUsd || 0;
    totalSavedByCacheUsd += conv.savedByCacheUsd || 0;
    totalPrompts += conv.promptCount;
    totalTurns += conv.turnCount;
    if (conv.totalTokens > 0) {
      trackedConversations += 1;
      trackedTurns += conv.turnCount;
    } else {
      legacyConversationsPreTelemetry += 1;
      legacyTurnsPreTelemetry += conv.turnCount;
    }
    totalToolCalls += conv.toolCallCount;
    totalSubagents += conv.subagentCount || 0;

    const proj = conv.project || "general";
    if (!byProject[proj]) {
      const repoMeta = resolveRepoMetadata(proj);
      byProject[proj] = {
        project: proj,
        repoPath: repoMeta.repoPath,
        gitRemote: repoMeta.gitRemote,
        isGitRepo: repoMeta.isGitRepo,
        conversations: 0,
        trackedConversations: 0,
        legacyConversationsPreTelemetry: 0,
        turns: 0,
        trackedTurns: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        savedByCacheUsd: 0,
      };
    }
    byProject[proj].conversations += 1;
    if (conv.totalTokens > 0) {
      byProject[proj].trackedConversations += 1;
      byProject[proj].trackedTurns += conv.turnCount;
    } else {
      byProject[proj].legacyConversationsPreTelemetry += 1;
    }
    byProject[proj].turns += conv.turnCount;
    byProject[proj].inputTokens += conv.inputTokens;
    byProject[proj].cacheReadTokens += conv.cacheReadTokens;
    byProject[proj].outputTokens += conv.outputTokens;
    byProject[proj].totalTokens += conv.totalTokens;
    byProject[proj].estimatedCostUsd = Number(
      (byProject[proj].estimatedCostUsd + (conv.estimatedCostUsd || 0)).toFixed(6)
    );
    byProject[proj].savedByCacheUsd = Number(
      (byProject[proj].savedByCacheUsd + (conv.savedByCacheUsd || 0)).toFixed(6)
    );

    const modelBreakdowns = conv.byModelInConv && Object.keys(conv.byModelInConv).length > 0
      ? conv.byModelInConv
      : {
          [conv.model || "Gemini 2.5 Pro (Default)"]: {
            inputTokens: conv.inputTokens,
            cacheReadTokens: conv.cacheReadTokens,
            outputTokens: conv.outputTokens,
            turns: conv.turnCount,
            estimatedCostUsd: conv.estimatedCostUsd || 0,
            savedByCacheUsd: conv.savedByCacheUsd || 0,
          },
        };

    for (const [mod, mData] of Object.entries(modelBreakdowns)) {
      if (!byModel[mod]) {
        const mRates = getModelRates(mod);
        byModel[mod] = {
          model: mod,
          rates: mRates,
          conversations: 0,
          trackedConversations: 0,
          turns: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
        };
      }
      byModel[mod].conversations += 1;
      const mTotalTokens = (mData.inputTokens || 0) + (mData.cacheReadTokens || 0) + (mData.outputTokens || 0);
      if (mTotalTokens > 0) {
        byModel[mod].trackedConversations += 1;
      }
      byModel[mod].turns += mData.turns || 0;
      byModel[mod].inputTokens += mData.inputTokens || 0;
      byModel[mod].cacheReadTokens += mData.cacheReadTokens || 0;
      byModel[mod].outputTokens += mData.outputTokens || 0;
      byModel[mod].totalTokens += mTotalTokens;
      byModel[mod].estimatedCostUsd = Number(
        (byModel[mod].estimatedCostUsd + (mData.estimatedCostUsd || 0)).toFixed(6)
      );
      byModel[mod].savedByCacheUsd = Number(
        (byModel[mod].savedByCacheUsd + (mData.savedByCacheUsd || 0)).toFixed(6)
      );
    }

    if (conv.byDate) {
      for (const [dateKey, d] of Object.entries(conv.byDate)) {
        if (!daily[dateKey]) {
          daily[dateKey] = {
            date: dateKey,
            inputTokens: 0,
            cacheReadTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
            estimatedCostUsd: 0,
            savedByCacheUsd: 0,
          };
        }
        daily[dateKey].inputTokens += d.inputTokens;
        daily[dateKey].cacheReadTokens += d.cacheReadTokens;
        daily[dateKey].outputTokens += d.outputTokens;
        daily[dateKey].totalTokens += d.inputTokens + d.cacheReadTokens + d.outputTokens;
        daily[dateKey].turns += d.turns;
        daily[dateKey].toolCalls += d.toolCalls || 0;
        daily[dateKey].estimatedCostUsd = Number(
          (daily[dateKey].estimatedCostUsd + (d.estimatedCostUsd || 0)).toFixed(6)
        );
        daily[dateKey].savedByCacheUsd = Number(
          (daily[dateKey].savedByCacheUsd + (d.savedByCacheUsd || 0)).toFixed(6)
        );
      }
    }
  }

  // Ensure Claude Sonnet 5.5 is listed in the reference breakdown even if 0 sessions so far
  if (!Object.keys(byModel).some((k) => k.toLowerCase().includes("sonnet 5.5"))) {
    byModel["Claude Sonnet 5.5"] = {
      model: "Claude Sonnet 5.5",
      rates: MODEL_PRICING_TABLE["Claude Sonnet 5.5"],
      conversations: 0,
      trackedConversations: 0,
      turns: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      savedByCacheUsd: 0,
    };
  }

  const totalTokens = totalInputTokens + totalCacheReadTokens + totalOutputTokens;
  const totalContextTokens = totalInputTokens + totalCacheReadTokens;
  const cacheHitRate =
    totalContextTokens > 0 ? Number(((totalCacheReadTokens / totalContextTokens) * 100).toFixed(2)) : 0;

  return {
    schemaVersion: "1.5.0",
    lastSyncedAt: new Date().toISOString(),
    telemetryStartDate: "2026-10-09",
    user: userMeta,
    pricingTable: MODEL_PRICING_TABLE,
    totals: {
      conversations: conversations.length,
      trackedConversations,
      legacyConversationsPreTelemetry,
      prompts: totalPrompts,
      turns: totalTurns,
      trackedTurns,
      legacyTurnsPreTelemetry,
      toolCalls: totalToolCalls,
      subagents: totalSubagents,
      inputTokens: totalInputTokens,
      cacheReadTokens: totalCacheReadTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      cacheHitRatePct: cacheHitRate,
      estimatedCostUsd: Number(totalCostUsd.toFixed(2)),
      savedByCacheUsd: Number(totalSavedByCacheUsd.toFixed(2)),
    },
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    byProject: Object.values(byProject).sort((a, b) => b.totalTokens - a.totalTokens || b.turns - a.turns),
    byModel: Object.values(byModel).sort((a, b) => b.totalTokens - a.totalTokens || b.turns - a.turns),
    conversations,
  };
}

function writeUiBundle() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UI_DIR, { recursive: true });

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const users = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
      users.push(JSON.parse(raw));
    } catch {}
  }

  const bundlePayload = {
    generatedAt: new Date().toISOString(),
    pricingTable: MODEL_PRICING_TABLE,
    users,
  };

  const bundleJsPath = path.join(UI_DIR, "data-bundle.js");
  fs.writeFileSync(
    bundleJsPath,
    `window.__TOKEN_TRACKER_DATA__ = ${JSON.stringify(bundlePayload, null, 2)};\n`,
    "utf8"
  );
  return bundlePayload;
}

/**
 * Optionally writes a per-repository `.gemini/token-usage.json` ledger inside each actual Git repository on disk.
 */
function writePerRepoReports(summary) {
  const written = [];
  for (const proj of summary.byProject) {
    if (!proj.repoPath || !fs.existsSync(proj.repoPath)) continue;
    try {
      const repoGeminiDir = path.join(proj.repoPath, ".gemini");
      fs.mkdirSync(repoGeminiDir, { recursive: true });
      const repoConvs = summary.conversations.filter((c) => c.project === proj.project);
      const reportPath = path.join(repoGeminiDir, "token-usage.json");
      const payload = {
        schemaVersion: "1.5.0",
        generatedAt: new Date().toISOString(),
        project: proj.project,
        repoPath: proj.repoPath,
        gitRemote: proj.gitRemote,
        user: summary.user,
        totals: proj,
        conversations: repoConvs,
      };
      fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");
      written.push({ project: proj.project, reportPath });
    } catch {}
  }
  return written;
}

export function runSync({
  backfill = false,
  hookPayload = null,
  printSummary = false,
  writeRepoReports = false,
} = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const userMeta = getUserIdentity();
  const userFilePath = path.join(DATA_DIR, `${userMeta.userId}.json`);

  let existingConversationsMap = {};
  if (fs.existsSync(userFilePath) && !backfill) {
    try {
      const existingData = JSON.parse(fs.readFileSync(userFilePath, "utf8"));
      if (Array.isArray(existingData.conversations)) {
        for (const c of existingData.conversations) {
          existingConversationsMap[c.conversationId] = c;
        }
      }
    } catch {}
  } else {
    backfill = true;
  }

  if (backfill && fs.existsSync(BRAIN_DIR)) {
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const convId = entry.name;
      const tPath = path.join(BRAIN_DIR, convId, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(tPath)) {
        const parsed = parseTranscriptFile(tPath, convId, {});
        if (parsed) {
          existingConversationsMap[convId] = parsed;
        }
      }
    }
  }

  if (hookPayload && hookPayload.conversationId) {
    const convId = hookPayload.conversationId;
    const candidatePaths = [
      path.join(BRAIN_DIR, convId, ".system_generated", "logs", "transcript.jsonl"),
      hookPayload.transcriptPath,
    ].filter(Boolean);

    for (const tPath of candidatePaths) {
      if (fs.existsSync(tPath)) {
        const parsed = parseTranscriptFile(tPath, convId, hookPayload);
        if (parsed) {
          existingConversationsMap[convId] = parsed;
        }
        break;
      }
    }
  }

  // Second pass: inherit repository from parent conversation for subagent sessions
  for (const conv of Object.values(existingConversationsMap)) {
    if (conv.project === "general" && conv.parentConversationId) {
      const parent = existingConversationsMap[conv.parentConversationId];
      if (parent && parent.project && parent.project !== "general") {
        conv.project = parent.project;
      }
    }
  }

  const summary = buildUserSummary(userMeta, existingConversationsMap);
  fs.writeFileSync(userFilePath, JSON.stringify(summary, null, 2), "utf8");
  const bundle = writeUiBundle();
  const repoReports = writeRepoReports ? writePerRepoReports(summary) : [];

  if (printSummary) {
    console.log(
      JSON.stringify(
        {
          user: summary.user,
          totals: summary.totals,
          topProjects: summary.byProject,
          models: summary.byModel,
          repoReportsWritten: repoReports.length,
        },
        null,
        2
      )
    );
  }

  return { summary, bundle, repoReports };
}

const isMain =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
if (isMain) {
  const args = process.argv.slice(2);
  const isBackfill = args.includes("--backfill");
  const isSummary = args.includes("--summary");
  const isWriteRepoReports = args.includes("--write-repo-reports");

  if (!process.stdin.isTTY && !isBackfill && !isSummary && !isWriteRepoReports) {
    let inputData = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      inputData += chunk;
    });
    process.stdin.on("end", () => {
      let hookPayload = null;
      try {
        if (inputData.trim()) {
          hookPayload = JSON.parse(inputData);
        }
      } catch {}
      try {
        runSync({ backfill: false, hookPayload, printSummary: false });
      } catch {}
      process.stdout.write("{}\n");
    });
  } else {
    runSync({
      backfill: isBackfill || true,
      printSummary: isSummary,
      writeRepoReports: isWriteRepoReports,
    });
  }
}
