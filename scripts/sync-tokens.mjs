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

/**
 * Extracts a short subagent role label from an initial subagent prompt or system message if present.
 *
 * @param {string} rawText - Prompt or system message text
 * @returns {string|null} Role title if detected
 */
function extractSubagentRoleFromPrompt(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const roleMatch = rawText.match(
    /You are (?:the |a |an )?\*\*?([A-Za-z0-9 &/_-]{3,45}?)\*\*?(?:\.|,|for|specializing|responsible)/i
  );
  if (roleMatch && roleMatch[1]) {
    return roleMatch[1].trim();
  }
  if (/firestore\.rules/i.test(rawText)) return "Firestore Rules Author";
  if (/generate_image|outpaint|widescreen|logo/i.test(rawText)) return "Image Generator";
  return null;
}

/**
 * Parses a single Antigravity transcript.jsonl file into conversation, prompt-level,
 * and chronological turn-level token & cost metrics, while tracking parent/child subagent links.
 *
 * @param {string} transcriptPath - Absolute path to transcript.jsonl
 * @param {string} conversationId - UUID of the conversation
 * @param {object} [hookMeta={}] - Optional metadata from Stop hook or surface scanner
 * @returns {object|null} Parsed conversation record or null if empty
 */
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
  let longContextTurns = 0;
  let toolCallCount = 0;
  let subagentCount = 0;
  let title = null;
  let detectedModel =
    hookMeta.modelName && hookMeta.modelName !== "auto"
      ? normalizeModelName(hookMeta.modelName)
      : null;
  const projectVoteCounts = new Map();

  let dbParentId =
    dbRow?.parent_conversation_id && dbRow.parent_conversation_id !== conversationId
      ? dbRow.parent_conversation_id
      : null;
  let stepZeroSenderId = null;
  let sendMessageRecipientId = null;
  let startedWithSystemMessage = false;
  const childSubagentIds = new Set();
  const childSubagentMeta = {};

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
  const fallbackIso = stat.mtime.toISOString();
  const byDate = {};
  const byModelInConv = {};
  const prompts = [];
  let activePrompt = null;
  let lastInvokeSubagentRole = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    let step;
    try {
      step = JSON.parse(lines[lineIdx]);
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
      const promptPreview =
        typeof step.content === "string"
          ? cleanUserPromptTitle(step.content)
          : `Prompt #${promptCount}`;
      if (!title && typeof step.content === "string") {
        title = promptPreview;
      }
      const modelChange = extractModelFromInput(step.content);
      if (modelChange) {
        currentModel = modelChange;
        detectedModel = modelChange;
      }

      activePrompt = {
        promptIndex: promptCount,
        stepIndex: step.step_index ?? lineIdx,
        timestamp: stepTime || startedAt || fallbackIso,
        preview: promptPreview,
        model: currentModel,
        turnCount: 0,
        subagentTurnCount: 0,
        subagentRunCount: 0,
        toolCallCount: 0,
        longContextTurns: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        savedByCacheUsd: 0,
        turns: [],
      };
      prompts.push(activePrompt);
    } else if (step.type === "SYSTEM_MESSAGE" && typeof step.content === "string") {
      if (!title) {
        title = cleanUserPromptTitle(step.content);
      }
      const senderMatch = step.content.match(
        /sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?!\/task-)/i
      );
      const senderUuid =
        senderMatch && senderMatch[1] && senderMatch[1] !== conversationId
          ? senderMatch[1]
          : null;

      if ((step.step_index === 0 || lineIdx === 0) && promptCount === 0) {
        startedWithSystemMessage = true;
        if (senderUuid) {
          stepZeroSenderId = senderUuid;
        }
      } else if (senderUuid) {
        // A mid-conversation SYSTEM_MESSAGE from another agent UUID is a child subagent reporting back
        childSubagentIds.add(senderUuid);
      }
    } else if (step.type === "INVOKE_SUBAGENT" && typeof step.content === "string") {
      const idMatches = step.content.matchAll(
        /"conversationId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi
      );
      for (const m of idMatches) {
        if (m[1] && m[1] !== conversationId) {
          childSubagentIds.add(m[1]);
          if (lastInvokeSubagentRole && !childSubagentMeta[m[1]]?.role) {
            childSubagentMeta[m[1]] = {
              ...(childSubagentMeta[m[1]] || {}),
              role: lastInvokeSubagentRole,
              spawnedAtPromptIndex: activePrompt?.promptIndex || 1,
            };
          }
        }
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
      // If a subagent or system session starts with PLANNER_RESPONSE before any USER_INPUT, create an initial prompt group
      if (!activePrompt) {
        promptCount = Math.max(promptCount, 1);
        activePrompt = {
          promptIndex: 1,
          stepIndex: 0,
          timestamp: startedAt || stepTime || fallbackIso,
          preview: title || `Task Session ${conversationId.slice(0, 8)}`,
          model: currentModel,
          turnCount: 0,
          subagentTurnCount: 0,
          subagentRunCount: 0,
          toolCallCount: 0,
          longContextTurns: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
          turns: [],
        };
        prompts.push(activePrompt);
      }

      turnCount++;
      const stepIn = Number(step.input_tokens || 0);
      const stepCache = Number(step.cache_read_tokens || 0);
      const stepOut = Number(step.output_tokens || 0);
      const stepTot = stepIn + stepCache + stepOut;
      const isLongCtx = stepIn + stepCache > 200_000;
      if (isLongCtx) {
        longContextTurns++;
        activePrompt.longContextTurns++;
      }

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

      const dateKey = (stepTime || fallbackIso).slice(0, 10);
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

      const turnToolNames = [];
      if (Array.isArray(step.tool_calls)) {
        toolCallCount += step.tool_calls.length;
        byDate[dateKey].toolCalls += step.tool_calls.length;
        for (const tc of step.tool_calls) {
          if (tc.name) turnToolNames.push(tc.name);
          if (tc.name === "invoke_subagent") {
            subagentCount++;
            const rawRole = tc.args?.Role || tc.args?.TypeName || null;
            if (rawRole) {
              lastInvokeSubagentRole = String(rawRole).replace(/^["']|["']$/g, "").trim();
            }
          }
          if (tc.name === "send_message" && tc.args && tc.args.Recipient) {
            const cleanedRecip = String(tc.args.Recipient).replace(/["']/g, "").trim();
            if (
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedRecip) &&
              cleanedRecip !== conversationId
            ) {
              sendMessageRecipientId = cleanedRecip;
            }
          }
          const argsStr = JSON.stringify(tc.args || {});
          const matches = extractConfiguredProjectsFromText(argsStr);
          for (const m of matches) {
            projectVoteCounts.set(m.project, (projectVoteCounts.get(m.project) || 0) + m.weight * 2);
          }
        }
      }

      activePrompt.turnCount += 1;
      activePrompt.toolCallCount += turnToolNames.length;
      activePrompt.inputTokens += stepIn;
      activePrompt.cacheReadTokens += stepCache;
      activePrompt.outputTokens += stepOut;
      activePrompt.totalTokens += stepTot;
      activePrompt.estimatedCostUsd = Number(
        (activePrompt.estimatedCostUsd + costUsd).toFixed(6)
      );
      activePrompt.savedByCacheUsd = Number(
        (activePrompt.savedByCacheUsd + stepSaved).toFixed(6)
      );

      activePrompt.turns.push({
        turnIndex: turnCount,
        promptTurnIndex: activePrompt.turnCount,
        stepIndex: step.step_index ?? lineIdx,
        timestamp: stepTime || updatedAt || fallbackIso,
        model: currentModel,
        inputTokens: stepIn,
        cacheReadTokens: stepCache,
        outputTokens: stepOut,
        totalTokens: stepTot,
        isLongContext: isLongCtx,
        estimatedCostUsd: costUsd,
        savedByCacheUsd: stepSaved,
        toolCalls: turnToolNames.length,
        tools: turnToolNames.slice(0, 8),
        isSubagent: false,
      });
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

  // Determine if this session is a child subagent and resolve its true parent conversation ID:
  // 1. Authoritative DB parent_conversation_id
  // 2. Started with a step 0 SYSTEM_MESSAGE containing sender=<PARENT_UUID> (modern subagent protocol)
  // 3. Single-prompt agent session that reports back via send_message(Recipient=<PARENT_UUID>)
  let parentConversationId = null;
  let isSubagentSession = false;
  if (dbParentId) {
    parentConversationId = dbParentId;
    isSubagentSession = true;
  } else if (startedWithSystemMessage && stepZeroSenderId) {
    parentConversationId = stepZeroSenderId;
    isSubagentSession = true;
  } else if (promptCount <= 1 && sendMessageRecipientId && subagentCount === 0) {
    parentConversationId = sendMessageRecipientId;
    isSubagentSession = true;
  }

  const resolvedTitle = title || dbRow?.title || `Session ${conversationId.slice(0, 8)}`;
  const inferredRole = isSubagentSession
    ? extractSubagentRoleFromPrompt(resolvedTitle) || "Subagent"
    : null;

  return {
    conversationId,
    parentConversationId,
    isSubagentSession,
    subagentRole: inferredRole,
    childSubagentIds: Array.from(childSubagentIds),
    childSubagentMeta,
    mergedSubagentCount: 0,
    mergedSubagents: [],
    surface,
    title: resolvedTitle,
    project,
    model: detectedModel || "Gemini 2.5 Pro (Default)",
    hasTokenTelemetry: totalTokens > 0,
    startedAt: startedAt || fallbackIso,
    updatedAt: updatedAt || fallbackIso,
    promptCount,
    turnCount,
    longContextTurns,
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
    prompts,
  };
}

/**
 * Resolves and merges all child subagent conversations into their root parent conversation,
 * interleaving subagent turns chronologically inside the parent prompt that spawned them.
 *
 * @param {Record<string, object>} rawConversationsMap - Map of all parsed conversations by ID
 * @returns {Record<string, object>} Map containing only root conversations with subagents merged in
 */
function mergeSubagentsIntoParents(rawConversationsMap) {
  const allConvs = Object.values(rawConversationsMap);

  // 1. Cross-link any child discovered via parent's INVOKE_SUBAGENT / mid-session SYSTEM_MESSAGE
  for (const parent of allConvs) {
    if (!Array.isArray(parent.childSubagentIds)) continue;
    for (const childId of parent.childSubagentIds) {
      const child = rawConversationsMap[childId];
      if (!child || child.conversationId === parent.conversationId) continue;
      // Only link as subagent if child was flagged or started after parent with <= 1 prompt
      if (child.isSubagentSession || child.promptCount <= 1) {
        child.isSubagentSession = true;
        if (!child.parentConversationId) {
          child.parentConversationId = parent.conversationId;
        }
        const metaRole = parent.childSubagentMeta?.[childId]?.role;
        if (metaRole && (!child.subagentRole || child.subagentRole === "Subagent")) {
          child.subagentRole = metaRole;
        }
      }
    }
  }

  // 2. Helper to walk parentConversationId chain up to the root conversation (with cycle guard)
  function findRootConversation(conv) {
    const visited = new Set([conv.conversationId]);
    let curr = conv;
    while (curr.isSubagentSession && curr.parentConversationId) {
      const nextParent = rawConversationsMap[curr.parentConversationId];
      if (!nextParent || visited.has(nextParent.conversationId)) {
        break;
      }
      visited.add(nextParent.conversationId);
      curr = nextParent;
    }
    return curr;
  }

  const rootConversationsMap = {};
  const subagentsToMerge = [];

  for (const conv of allConvs) {
    const root = findRootConversation(conv);
    if (root && root.conversationId !== conv.conversationId) {
      subagentsToMerge.push({ child: conv, root });
    } else {
      rootConversationsMap[conv.conversationId] = conv;
    }
  }

  // Sort subagents chronologically by startedAt so multi-subagent runs merge in exact execution order
  subagentsToMerge.sort(
    (a, b) => new Date(a.child.startedAt).getTime() - new Date(b.child.startedAt).getTime()
  );

  for (const { child, root } of subagentsToMerge) {
    if (child.project === "general" && root.project && root.project !== "general") {
      child.project = root.project;
    } else if (root.project === "general" && child.project && child.project !== "general") {
      root.project = child.project;
    }

    // Roll up token, cost, turn, and tool call totals into the root conversation
    root.inputTokens += child.inputTokens || 0;
    root.cacheReadTokens += child.cacheReadTokens || 0;
    root.outputTokens += child.outputTokens || 0;
    root.totalTokens = root.inputTokens + root.cacheReadTokens + root.outputTokens;
    root.hasTokenTelemetry = root.totalTokens > 0;
    root.turnCount += child.turnCount || 0;
    root.longContextTurns = (root.longContextTurns || 0) + (child.longContextTurns || 0);
    root.toolCallCount += child.toolCallCount || 0;
    root.estimatedCostUsd = Number(
      ((root.estimatedCostUsd || 0) + (child.estimatedCostUsd || 0)).toFixed(6)
    );
    root.savedByCacheUsd = Number(
      ((root.savedByCacheUsd || 0) + (child.savedByCacheUsd || 0)).toFixed(6)
    );

    if (child.startedAt && (!root.startedAt || child.startedAt < root.startedAt)) {
      root.startedAt = child.startedAt;
    }
    if (child.updatedAt && (!root.updatedAt || child.updatedAt > root.updatedAt)) {
      root.updatedAt = child.updatedAt;
    }

    // Merge byDate into root
    for (const [dateKey, d] of Object.entries(child.byDate || {})) {
      if (!root.byDate[dateKey]) {
        root.byDate[dateKey] = {
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          turns: 0,
          toolCalls: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
        };
      }
      root.byDate[dateKey].inputTokens += d.inputTokens || 0;
      root.byDate[dateKey].cacheReadTokens += d.cacheReadTokens || 0;
      root.byDate[dateKey].outputTokens += d.outputTokens || 0;
      root.byDate[dateKey].turns += d.turns || 0;
      root.byDate[dateKey].toolCalls += d.toolCalls || 0;
      root.byDate[dateKey].estimatedCostUsd = Number(
        (root.byDate[dateKey].estimatedCostUsd + (d.estimatedCostUsd || 0)).toFixed(6)
      );
      root.byDate[dateKey].savedByCacheUsd = Number(
        (root.byDate[dateKey].savedByCacheUsd + (d.savedByCacheUsd || 0)).toFixed(6)
      );
    }

    // Merge byModelInConv into root
    for (const [mod, mData] of Object.entries(child.byModelInConv || {})) {
      if (!root.byModelInConv[mod]) {
        root.byModelInConv[mod] = {
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          turns: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
        };
      }
      root.byModelInConv[mod].inputTokens += mData.inputTokens || 0;
      root.byModelInConv[mod].cacheReadTokens += mData.cacheReadTokens || 0;
      root.byModelInConv[mod].outputTokens += mData.outputTokens || 0;
      root.byModelInConv[mod].turns += mData.turns || 0;
      root.byModelInConv[mod].estimatedCostUsd = Number(
        (root.byModelInConv[mod].estimatedCostUsd + (mData.estimatedCostUsd || 0)).toFixed(6)
      );
      root.byModelInConv[mod].savedByCacheUsd = Number(
        (root.byModelInConv[mod].savedByCacheUsd + (mData.savedByCacheUsd || 0)).toFixed(6)
      );
    }

    const roleLabel =
      root.childSubagentMeta?.[child.conversationId]?.role ||
      child.subagentRole ||
      "Subagent";

    root.mergedSubagentCount = (root.mergedSubagentCount || 0) + 1;
    root.subagentCount = Math.max(root.subagentCount || 0, root.mergedSubagentCount);
    root.mergedSubagents.push({
      conversationId: child.conversationId,
      role: roleLabel,
      title: child.title,
      model: child.model,
      startedAt: child.startedAt,
      updatedAt: child.updatedAt,
      turnCount: child.turnCount,
      toolCallCount: child.toolCallCount,
      inputTokens: child.inputTokens,
      cacheReadTokens: child.cacheReadTokens,
      outputTokens: child.outputTokens,
      totalTokens: child.totalTokens,
      estimatedCostUsd: child.estimatedCostUsd,
      savedByCacheUsd: child.savedByCacheUsd,
    });

    // Find the prompt in root that was active when this subagent started
    if (!Array.isArray(root.prompts) || root.prompts.length === 0) {
      root.prompts = [
        {
          promptIndex: 1,
          stepIndex: 0,
          timestamp: root.startedAt,
          preview: root.title,
          model: root.model,
          turnCount: 0,
          subagentTurnCount: 0,
          subagentRunCount: 0,
          toolCallCount: 0,
          longContextTurns: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          savedByCacheUsd: 0,
          turns: [],
        },
      ];
      root.promptCount = Math.max(root.promptCount || 0, 1);
    }

    const childStartMs = new Date(child.startedAt).getTime();
    let targetPrompt = root.prompts[0];
    const hintedPromptIdx = root.childSubagentMeta?.[child.conversationId]?.spawnedAtPromptIndex;
    if (hintedPromptIdx && root.prompts[hintedPromptIdx - 1]) {
      targetPrompt = root.prompts[hintedPromptIdx - 1];
    } else {
      for (const p of root.prompts) {
        const pTimeMs = new Date(p.timestamp).getTime();
        if (pTimeMs <= childStartMs + 5000) {
          targetPrompt = p;
        }
      }
    }

    // Collect all turns from the child subagent and tag them with subagent metadata
    const childTurns = [];
    for (const cp of child.prompts || []) {
      for (let i = 0; i < (cp.turns || []).length; i++) {
        const t = cp.turns[i];
        childTurns.push({
          ...t,
          isSubagent: true,
          subagentId: child.conversationId.slice(0, 8),
          subagentRole: roleLabel,
          subagentTurnIndex: i + 1,
          subagentTitle: child.title,
        });
      }
    }

    targetPrompt.subagentRunCount = (targetPrompt.subagentRunCount || 0) + 1;
    targetPrompt.subagentTurnCount = (targetPrompt.subagentTurnCount || 0) + child.turnCount;
    targetPrompt.turnCount += child.turnCount || 0;
    targetPrompt.longContextTurns =
      (targetPrompt.longContextTurns || 0) + (child.longContextTurns || 0);
    targetPrompt.toolCallCount += child.toolCallCount || 0;
    targetPrompt.inputTokens += child.inputTokens || 0;
    targetPrompt.cacheReadTokens += child.cacheReadTokens || 0;
    targetPrompt.outputTokens += child.outputTokens || 0;
    targetPrompt.totalTokens += child.totalTokens || 0;
    targetPrompt.estimatedCostUsd = Number(
      ((targetPrompt.estimatedCostUsd || 0) + (child.estimatedCostUsd || 0)).toFixed(6)
    );
    targetPrompt.savedByCacheUsd = Number(
      ((targetPrompt.savedByCacheUsd || 0) + (child.savedByCacheUsd || 0)).toFixed(6)
    );

    targetPrompt.turns.push(...childTurns);
  }

  // 3. Re-sort turns chronologically inside every prompt and re-index turnIndex (1..N) across each root conversation
  for (const conv of Object.values(rootConversationsMap)) {
    delete conv.childSubagentIds;
    delete conv.childSubagentMeta;

    let globalTurnIdx = 0;
    for (let pIdx = 0; pIdx < (conv.prompts || []).length; pIdx++) {
      const p = conv.prompts[pIdx];
      p.promptIndex = pIdx + 1;
      if (Array.isArray(p.turns) && p.turns.length > 0) {
        p.turns.sort((a, b) => {
          const tDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          if (tDiff !== 0) return tDiff;
          if (Boolean(a.isSubagent) !== Boolean(b.isSubagent)) {
            return a.isSubagent ? 1 : -1;
          }
          return (a.stepIndex || 0) - (b.stepIndex || 0);
        });

        for (let tIdx = 0; tIdx < p.turns.length; tIdx++) {
          globalTurnIdx++;
          p.turns[tIdx].turnIndex = globalTurnIdx;
          p.turns[tIdx].promptTurnIndex = tIdx + 1;
        }
      }
    }
  }

  return rootConversationsMap;
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
  let trackedPrompts = 0;
  let legacyPromptsPreTelemetry = 0;
  let totalTurns = 0;
  let trackedTurns = 0;
  let legacyTurnsPreTelemetry = 0;
  let longContextTurns = 0;
  let trackedConversations = 0;
  let legacyConversationsPreTelemetry = 0;
  let totalToolCalls = 0;
  let totalSubagents = 0;
  let mergedSubagentRuns = 0;

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
    longContextTurns += conv.longContextTurns || 0;
    if (conv.totalTokens > 0) {
      trackedConversations += 1;
      trackedPrompts += conv.promptCount;
      trackedTurns += conv.turnCount;
    } else {
      legacyConversationsPreTelemetry += 1;
      legacyPromptsPreTelemetry += conv.promptCount;
      legacyTurnsPreTelemetry += conv.turnCount;
    }
    totalToolCalls += conv.toolCallCount;
    totalSubagents += conv.subagentCount || 0;
    mergedSubagentRuns += conv.mergedSubagentCount || 0;

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
        prompts: 0,
        trackedPrompts: 0,
        turns: 0,
        trackedTurns: 0,
        subagentRuns: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        savedByCacheUsd: 0,
      };
    }
    byProject[proj].conversations += 1;
    byProject[proj].prompts += conv.promptCount || 0;
    byProject[proj].subagentRuns += conv.mergedSubagentCount || 0;
    if (conv.totalTokens > 0) {
      byProject[proj].trackedConversations += 1;
      byProject[proj].trackedPrompts += conv.promptCount || 0;
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

  const avgCostPerPromptUsd =
    trackedPrompts > 0 ? Number((totalCostUsd / trackedPrompts).toFixed(4)) : 0;
  const avgCostPerTurnUsd =
    trackedTurns > 0 ? Number((totalCostUsd / trackedTurns).toFixed(4)) : 0;
  const avgTokensPerPrompt =
    trackedPrompts > 0 ? Math.round(totalTokens / trackedPrompts) : 0;
  const avgTokensPerTurn =
    trackedTurns > 0 ? Math.round(totalTokens / trackedTurns) : 0;
  const avgTurnsPerPrompt =
    totalPrompts > 0 ? Number((totalTurns / totalPrompts).toFixed(2)) : 0;

  return {
    schemaVersion: "2.1.0",
    lastSyncedAt: new Date().toISOString(),
    telemetryStartDate: "2026-10-09",
    user: userMeta,
    pricingTable: MODEL_PRICING_TABLE,
    totals: {
      conversations: conversations.length,
      trackedConversations,
      legacyConversationsPreTelemetry,
      prompts: totalPrompts,
      trackedPrompts,
      legacyPromptsPreTelemetry,
      turns: totalTurns,
      trackedTurns,
      legacyTurnsPreTelemetry,
      longContextTurns,
      toolCalls: totalToolCalls,
      subagents: totalSubagents,
      mergedSubagentRuns,
      inputTokens: totalInputTokens,
      cacheReadTokens: totalCacheReadTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      cacheHitRatePct: cacheHitRate,
      estimatedCostUsd: Number(totalCostUsd.toFixed(2)),
      savedByCacheUsd: Number(totalSavedByCacheUsd.toFixed(2)),
      avgCostPerPromptUsd,
      avgCostPerTurnUsd,
      avgTokensPerPrompt,
      avgTokensPerTurn,
      avgTurnsPerPrompt,
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

export function runSync({
  backfill = false,
  hookPayload = null,
  printSummary = false,
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
          // If this Stop hook came from a child subagent, also re-parse its root parent transcript
          // from disk before merging so the parent's turns are never double-counted.
          if (parsed.isSubagentSession && parsed.parentConversationId) {
            let parentId = parsed.parentConversationId;
            const visited = new Set([convId]);
            while (parentId && !visited.has(parentId)) {
              visited.add(parentId);
              for (const b of BRAIN_DIRS) {
                const pPath = path.join(
                  b.path,
                  parentId,
                  ".system_generated",
                  "logs",
                  "transcript.jsonl"
                );
                if (fs.existsSync(pPath)) {
                  const reParsedParent = parseTranscriptFile(pPath, parentId, {
                    surface: b.surface,
                  });
                  if (reParsedParent) {
                    existingConversationsMap[parentId] = reParsedParent;
                    parentId = reParsedParent.isSubagentSession
                      ? reParsedParent.parentConversationId
                      : null;
                  } else {
                    parentId = null;
                  }
                  break;
                }
              }
              if (!existingConversationsMap[parentId]) break;
            }
          } else if (Array.isArray(parsed.childSubagentIds) && parsed.childSubagentIds.length > 0) {
            // If this Stop hook came from a parent that has child subagents, ensure child transcripts are loaded
            for (const childId of parsed.childSubagentIds) {
              if (!existingConversationsMap[childId]) {
                for (const b of BRAIN_DIRS) {
                  const cPath = path.join(
                    b.path,
                    childId,
                    ".system_generated",
                    "logs",
                    "transcript.jsonl"
                  );
                  if (fs.existsSync(cPath)) {
                    const parsedChild = parseTranscriptFile(cPath, childId, {
                      surface: b.surface,
                    });
                    if (parsedChild) {
                      existingConversationsMap[childId] = parsedChild;
                    }
                    break;
                  }
                }
              }
            }
          }
        }
        break;
      }
    }
  }

  // Merge all child subagent conversations into their parent conversations in chronological order
  const mergedConversationsMap = mergeSubagentsIntoParents(existingConversationsMap);

  const summary = buildUserSummary(userMeta, mergedConversationsMap);
  fs.writeFileSync(userFilePath, JSON.stringify(summary, null, 2), "utf8");
  const bundle = writeUiBundle();

  if (printSummary) {
    console.log(
      JSON.stringify(
        {
          user: summary.user,
          totals: summary.totals,
          topProjects: summary.byProject,
          models: summary.byModel,
        },
        null,
        2
      )
    );
  }

  return { summary, bundle };
}

const isMain =
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
if (isMain) {
  const args = process.argv.slice(2);
  const isBackfill = args.includes("--backfill");
  const isSummary = args.includes("--summary");

  if (!process.stdin.isTTY && !isBackfill && !isSummary) {
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
    });
  }
}
