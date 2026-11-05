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

// Both Antigravity 2.0 + CLI (~/.gemini/antigravity/brain) and Antigravity IDE (~/.gemini/antigravity-ide/brain)
const BRAIN_DIRS = [
  { surface: "2.0 / CLI", path: path.join(os.homedir(), ".gemini", "antigravity", "brain") },
  { surface: "IDE", path: path.join(os.homedir(), ".gemini", "antigravity-ide", "brain") },
];
const PROJECTS_CONFIG_DIR = path.join(os.homedir(), ".gemini", "config", "projects");
const CONV_SUMMARIES_DB_PATH = path.join(
  os.homedir(),
  ".gemini",
  "antigravity",
  "conversation_summaries.db"
);

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

function fileUriToPath(uri) {
  if (!uri || typeof uri !== "string") return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith("file://")) {
    try {
      return fileURLToPath(trimmed).replace(/\/+$/, "");
    } catch {
      return trimmed.replace(/^file:\/\//, "").replace(/\/+$/, "");
    }
  }
  if (trimmed.startsWith("/")) {
    return trimmed.replace(/\/+$/, "");
  }
  return null;
}

let cachedProjectRegistry = null;

/**
 * Loads Antigravity's configured projects strictly from `~/.gemini/config/projects/*.json`
 * and filters to actual projects (entries that define workspace/repository `projectResources.resources`).
 * Also reads `~/.gemini/antigravity/conversation_summaries.db` if available to map `conversationId -> projectId`.
 */
export function getAntigravityProjectRegistry(forceReload = false) {
  if (cachedProjectRegistry && !forceReload) {
    return cachedProjectRegistry;
  }

  const projectsById = new Map();
  const projectsByName = new Map();
  const folderMatchers = [];

  if (fs.existsSync(PROJECTS_CONFIG_DIR)) {
    try {
      const files = fs.readdirSync(PROJECTS_CONFIG_DIR).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(PROJECTS_CONFIG_DIR, file), "utf8");
          const data = JSON.parse(raw);

          // Filter out non-project entries (such as "outside-of-project" or virtual sidecar configs with no folder resources)
          if (!data || !data.id || data.id === "outside-of-project" || !data.name || typeof data.name !== "string") {
            continue;
          }

          const resources = Array.isArray(data.projectResources?.resources)
            ? data.projectResources.resources
            : [];
          const folders = [];

          for (let i = 0; i < resources.length; i++) {
            const res = resources[i];
            const rawUri = res?.gitFolder?.folderUri || res?.folderUri;
            const folderPath = fileUriToPath(rawUri);
            if (folderPath) {
              const isPrimary = i === 0 || path.basename(folderPath) === data.name;
              folders.push({
                path: folderPath,
                isPrimary,
                isGitFolder: Boolean(res?.gitFolder),
              });
            }
          }

          const envs = Array.isArray(data.environments?.environments)
            ? data.environments.environments
            : [];
          for (const env of envs) {
            const envResources = Array.isArray(env?.resources?.resources)
              ? env.resources.resources
              : [];
            for (const res of envResources) {
              const rawUri = res?.gitFolder?.folderUri || res?.folderUri;
              const folderPath = fileUriToPath(rawUri);
              if (folderPath) {
                folders.push({
                  path: folderPath,
                  isPrimary: true,
                  isGitFolder: Boolean(res?.gitFolder),
                  isWorktree: true,
                });
              }
            }
          }

          // Only include actual projects that have at least one workspace folder resource
          if (folders.length === 0) continue;

          const primaryFolder = folders.find((f) => f.isPrimary) || folders[0];
          const projectEntry = {
            id: data.id,
            name: data.name,
            primaryPath: primaryFolder.path,
            isGitFolder: folders.some((f) => f.isGitFolder),
            isParentOfConfiguredProject: false,
            folders,
          };

          projectsById.set(data.id, projectEntry);
          projectsByName.set(data.name, projectEntry);

          for (const fl of folders) {
            folderMatchers.push({
              projectId: data.id,
              project: data.name,
              path: fl.path,
              isPrimary: fl.isPrimary,
              length: fl.path.length,
            });
          }
        } catch {}
      }
    } catch {}
  }

  // Mark any configured project whose primary path is a parent folder of another configured project
  // (e.g., `/Git/plugins` containing `/Git/plugins/token-tracker-plugin`)
  const allProjects = Array.from(projectsByName.values());
  for (const pA of allProjects) {
    for (const pB of allProjects) {
      if (pA.name !== pB.name && pB.primaryPath.startsWith(pA.primaryPath + "/")) {
        pA.isParentOfConfiguredProject = true;
      }
    }
  }

  // Primary project folders take precedence over secondary attached folders; longest (most specific) path wins
  folderMatchers.sort(
    (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || b.length - a.length
  );

  // Load conversation -> project_id mapping from Antigravity's conversation_summaries.db if accessible
  const conversationDbMap = new Map();
  if (fs.existsSync(CONV_SUMMARIES_DB_PATH)) {
    try {
      const sql =
        "SELECT conversation_id, project_id, workspace_uris, parent_conversation_id FROM conversation_summaries;";
      const stdout = execSync(`sqlite3 -json "${CONV_SUMMARIES_DB_PATH}" "${sql}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const rows = JSON.parse(stdout);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row && row.conversation_id) {
            conversationDbMap.set(row.conversation_id, row);
          }
        }
      }
    } catch {}
  }

  cachedProjectRegistry = {
    projectsById,
    projectsByName,
    folderMatchers,
    conversationDbMap,
  };
  return cachedProjectRegistry;
}

const REPO_METADATA_CACHE = new Map();

/**
 * Resolves a configured project name to its local repository metadata using `.gemini/config/projects`.
 */
function resolveRepoMetadata(projectSlug) {
  if (!projectSlug || projectSlug === "general") {
    return { project: "general", repoPath: null, gitRemote: null, isGitRepo: false };
  }
  if (REPO_METADATA_CACHE.has(projectSlug)) {
    return REPO_METADATA_CACHE.get(projectSlug);
  }

  const { projectsByName } = getAntigravityProjectRegistry();
  const cfgProj = projectsByName.get(projectSlug);

  let foundPath = null;
  let isGitRepo = false;
  let gitRemote = null;

  if (cfgProj) {
    for (const fl of cfgProj.folders) {
      try {
        if (fs.existsSync(fl.path) && fs.statSync(fl.path).isDirectory()) {
          foundPath = fl.path;
          if (fs.existsSync(path.join(fl.path, ".git"))) {
            isGitRepo = true;
            try {
              gitRemote =
                execSync(`git -C "${fl.path}" config --get remote.origin.url`, {
                  encoding: "utf8",
                  stdio: ["ignore", "pipe", "ignore"],
                }).trim() || null;
            } catch {}
            break;
          }
        }
      } catch {}
    }
    if (!foundPath) {
      foundPath = cfgProj.primaryPath;
      isGitRepo = Boolean(cfgProj.isGitFolder);
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
 * Matches a single filesystem path or file:// URI against Antigravity's configured project folders.
 */
function matchConfiguredProjectFromPath(rawPath) {
  const cleanPath = fileUriToPath(rawPath);
  if (!cleanPath) return null;

  const { folderMatchers, projectsByName } = getAntigravityProjectRegistry();

  // 1. Exact or prefix match against configured project folders (sorted primary & longest path first)
  for (const m of folderMatchers) {
    if (cleanPath === m.path || cleanPath.startsWith(m.path + "/")) {
      return m.project;
    }
  }

  // 2. Match worktree paths ~/.gemini/antigravity/worktrees/<projectName>/... if projectName is in .gemini/config/projects
  const wtMatch = cleanPath.match(/\/\.gemini\/antigravity\/worktrees\/([^/]+)/);
  if (wtMatch && projectsByName.has(wtMatch[1])) {
    return wtMatch[1];
  }

  // 3. Check if any path segment matches an actual non-parent project name from .gemini/config/projects
  if (!cleanPath.includes("/.gemini/")) {
    const segments = cleanPath.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const candidate = projectsByName.get(segments[i]);
      if (candidate && !candidate.isParentOfConfiguredProject) {
        return candidate.name;
      }
    }
  }

  return null;
}

/**
 * Finds configured Antigravity projects referenced inside a block of transcript text (CLI, 2.0, or IDE).
 */
function extractConfiguredProjectsFromText(text) {
  if (!text) return [];
  const { folderMatchers, projectsByName } = getAntigravityProjectRegistry();
  const results = [];

  // 1. Check explicit Command Working Directory header (2.0 / CLI) or Active Document header (IDE)
  const headerRegex = /(?:Command Working Directory|Active Document):\s*(\/[^\n<\r(]+)/g;
  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    const proj = matchConfiguredProjectFromPath(match[1].trim());
    if (proj) {
      results.push({ project: proj, weight: 8 });
    }
  }

  // 2. Check configured primary project folder paths appearing in text
  for (const m of folderMatchers) {
    if (!m.isPrimary) continue;
    if (text.includes(m.path)) {
      results.push({ project: m.project, weight: 5 });
    }
  }

  // 3. Check file paths in text against configured projects (handles IDE sessions or moved project folders)
  const pathRegex = /\/Users\/[^\s"\\<>`')]+/g;
  while ((match = pathRegex.exec(text)) !== null) {
    const p = match[0];
    if (p.includes("/.gemini/")) continue;
    const proj = matchConfiguredProjectFromPath(p);
    if (proj) {
      results.push({ project: proj, weight: 3 });
    }
  }

  // 4. Check worktree paths for configured projects
  const worktreeRegex = /\/\.gemini\/antigravity\/worktrees\/([a-zA-Z0-9._-]+)\//g;
  while ((match = worktreeRegex.exec(text)) !== null) {
    if (projectsByName.has(match[1])) {
      results.push({ project: match[1], weight: 5 });
    }
  }

  return results;
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

  const { projectsById, conversationDbMap } = getAntigravityProjectRegistry();
  const dbRow = conversationDbMap.get(conversationId) || null;
  const surface =
    hookMeta.surface ||
    (transcriptPath.includes("antigravity-ide") ? "IDE" : "2.0 / CLI");

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
  let parentConversationId =
    dbRow?.parent_conversation_id && dbRow.parent_conversation_id !== conversationId
      ? dbRow.parent_conversation_id
      : null;

  // 1. Seed project from Antigravity's official project_id & workspace_uris in conversation_summaries.db
  const dbConfiguredProject =
    dbRow && dbRow.project_id && projectsById.has(dbRow.project_id)
      ? projectsById.get(dbRow.project_id)
      : null;

  if (dbConfiguredProject && !dbConfiguredProject.isParentOfConfiguredProject) {
    projectVoteCounts.set(
      dbConfiguredProject.name,
      (projectVoteCounts.get(dbConfiguredProject.name) || 0) + 50
    );
  }

  if (dbRow && dbRow.workspace_uris) {
    try {
      const uris = JSON.parse(dbRow.workspace_uris);
      if (Array.isArray(uris)) {
        for (const u of uris) {
          const p = matchConfiguredProjectFromPath(u);
          if (p) projectVoteCounts.set(p, (projectVoteCounts.get(p) || 0) + 20);
        }
      }
    } catch {}
  }

  // 2. Seed from Stop hook workspacePaths payload
  if (Array.isArray(hookMeta.workspacePaths)) {
    for (const wp of hookMeta.workspacePaths) {
      const p = matchConfiguredProjectFromPath(wp);
      if (p) projectVoteCounts.set(p, (projectVoteCounts.get(p) || 0) + 25);
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
      const senderMatch = step.content.match(
        /sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      if (senderMatch && senderMatch[1] && senderMatch[1] !== conversationId) {
        parentConversationId = senderMatch[1];
      }
    }

    if (typeof step.content === "string" && step.type !== "CONVERSATION_HISTORY") {
      const matches = extractConfiguredProjectsFromText(step.content);
      const mult = step.type === "SYSTEM_MESSAGE" ? 1 : 2;
      for (const m of matches) {
        projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight * mult);
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
          const matches = extractConfiguredProjectsFromText(argsStr);
          for (const m of matches) {
            projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight * 2);
          }
        }
      }
    }
  }

  let project = "general";
  if (dbConfiguredProject && !dbConfiguredProject.isParentOfConfiguredProject) {
    project = dbConfiguredProject.name;
  } else {
    let bestScore = 0;
    for (const [proj, score] of projectVoteCounts.entries()) {
      if (score > bestScore) {
        bestScore = score;
        project = proj;
      }
    }
    if (project === "general" && dbConfiguredProject) {
      project = dbConfiguredProject.name;
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
    surface,
    title: title || dbRow?.title || `Session ${conversationId.slice(0, 8)}`,
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

    const modelBreakdowns =
      conv.byModelInConv && Object.keys(conv.byModelInConv).length > 0
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
      const mTotalTokens =
        (mData.inputTokens || 0) + (mData.cacheReadTokens || 0) + (mData.outputTokens || 0);
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
    totalContextTokens > 0
      ? Number(((totalCacheReadTokens / totalContextTokens) * 100).toFixed(2))
      : 0;

  return {
    schemaVersion: "1.6.0",
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
        schemaVersion: "1.6.0",
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
  getAntigravityProjectRegistry(true);
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

  // Scan both Antigravity 2.0 / CLI (~/.gemini/antigravity/brain) and Antigravity IDE (~/.gemini/antigravity-ide/brain)
  if (backfill) {
    for (const brainSource of BRAIN_DIRS) {
      if (!fs.existsSync(brainSource.path)) continue;
      const entries = fs.readdirSync(brainSource.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const convId = entry.name;
        const tPath = path.join(
          brainSource.path,
          convId,
          ".system_generated",
          "logs",
          "transcript.jsonl"
        );
        if (fs.existsSync(tPath)) {
          const parsed = parseTranscriptFile(tPath, convId, { surface: brainSource.surface });
          if (parsed) {
            existingConversationsMap[convId] = parsed;
          }
        }
      }
    }
  }

  if (hookPayload && hookPayload.conversationId) {
    const convId = hookPayload.conversationId;
    const candidatePaths = [
      ...BRAIN_DIRS.map((b) =>
        path.join(b.path, convId, ".system_generated", "logs", "transcript.jsonl")
      ),
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
