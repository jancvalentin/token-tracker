#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runSync, MODEL_PRICING_TABLE } from "./sync-tokens.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const UI_DIR = path.join(PLUGIN_ROOT, "ui");
const DATA_DIR = path.join(PLUGIN_ROOT, "data", "users");

// Antigravity injects ANTIGRAVITY_SIDECAR_WEB_PORT for sidecars with has_web_ui: true
const SIDECAR_PORT = process.env.ANTIGRAVITY_SIDECAR_WEB_PORT
  ? Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT)
  : null;
const FALLBACK_PORT = Number(process.env.PORT || 4321);
const PRIMARY_PORT = SIDECAR_PORT || FALLBACK_PORT;

function loadAllUsers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const users = [];
  for (const f of files) {
    try {
      users.push(JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")));
    } catch {}
  }
  return {
    generatedAt: new Date().toISOString(),
    pricingTable: MODEL_PRICING_TABLE,
    users,
  };
}

/**
 * Builds a clean numbers-only JSON payload with zero chat prompts, titles, or local paths,
 * including conversation, prompt-level, and turn-level numeric telemetry.
 *
 * @param {object} userProfile - Aggregated user profile from data/users/<userId>.json
 * @returns {object} Sanitized numbers-only metrics payload
 */
function buildMetricsOnlyPayload(userProfile) {
  if (!userProfile) return {};
  return {
    schemaVersion: "2.1.0",
    exportedAt: new Date().toISOString(),
    telemetryStartDate: userProfile.telemetryStartDate || "2026-10-09",
    developer: {
      userId: userProfile.user?.userId || "local",
      displayName: userProfile.user?.displayName || "Developer",
    },
    totals: userProfile.totals || {},
    byRepository: (userProfile.byProject || []).map((p) => ({
      repository: p.project,
      gitRemote: p.gitRemote || null,
      isGitRepo: Boolean(p.isGitRepo),
      conversations: p.conversations || 0,
      trackedConversations: p.trackedConversations || 0,
      legacyConversationsPreTelemetry: p.legacyConversationsPreTelemetry || 0,
      prompts: p.prompts || 0,
      trackedPrompts: p.trackedPrompts || 0,
      turns: p.turns || 0,
      trackedTurns: p.trackedTurns || 0,
      subagentRuns: p.subagentRuns || 0,
      inputTokens: p.inputTokens || 0,
      cacheReadTokens: p.cacheReadTokens || 0,
      outputTokens: p.outputTokens || 0,
      totalTokens: p.totalTokens || 0,
      estimatedCostUsd: p.estimatedCostUsd || 0,
      savedByCacheUsd: p.savedByCacheUsd || 0,
    })),
    byModel: (userProfile.byModel || []).map((m) => ({
      model: m.model,
      tier: m.rates?.tier || "Pro",
      ratesPerMillionUsd: {
        input: m.rates?.inputPerMillion,
        cacheRead: m.rates?.cacheReadPerMillion,
        output: m.rates?.outputPerMillion,
      },
      conversations: m.conversations || 0,
      trackedConversations: m.trackedConversations || 0,
      turns: m.turns || 0,
      inputTokens: m.inputTokens || 0,
      cacheReadTokens: m.cacheReadTokens || 0,
      outputTokens: m.outputTokens || 0,
      totalTokens: m.totalTokens || 0,
      estimatedCostUsd: m.estimatedCostUsd || 0,
      savedByCacheUsd: m.savedByCacheUsd || 0,
    })),
    daily: userProfile.daily || [],
    conversationsNumeric: (userProfile.conversations || [])
      .filter((c) => (c.totalTokens || 0) > 0)
      .map((c) => ({
        conversationIdShort: String(c.conversationId || "").slice(0, 8),
        repository: c.project || "general",
        model: c.model,
        startedAt: c.startedAt,
        updatedAt: c.updatedAt,
        promptCount: c.promptCount || 0,
        turnCount: c.turnCount || 0,
        mergedSubagentCount: c.mergedSubagentCount || 0,
        toolCallCount: c.toolCallCount || 0,
        inputTokens: c.inputTokens || 0,
        cacheReadTokens: c.cacheReadTokens || 0,
        outputTokens: c.outputTokens || 0,
        totalTokens: c.totalTokens || 0,
        estimatedCostUsd: c.estimatedCostUsd || 0,
        savedByCacheUsd: c.savedByCacheUsd || 0,
        prompts: (c.prompts || []).map((pr) => ({
          promptIndex: pr.promptIndex,
          timestamp: pr.timestamp,
          model: pr.model,
          turnCount: pr.turnCount || 0,
          subagentRunCount: pr.subagentRunCount || 0,
          subagentTurnCount: pr.subagentTurnCount || 0,
          toolCallCount: pr.toolCallCount || 0,
          inputTokens: pr.inputTokens || 0,
          cacheReadTokens: pr.cacheReadTokens || 0,
          outputTokens: pr.outputTokens || 0,
          totalTokens: pr.totalTokens || 0,
          estimatedCostUsd: pr.estimatedCostUsd || 0,
          savedByCacheUsd: pr.savedByCacheUsd || 0,
          turns: (pr.turns || []).map((t) => ({
            turnIndex: t.turnIndex,
            promptTurnIndex: t.promptTurnIndex,
            timestamp: t.timestamp,
            model: t.model,
            isSubagent: Boolean(t.isSubagent),
            subagentRole: t.subagentRole || null,
            toolCalls: t.toolCalls || 0,
            isLongContext: Boolean(t.isLongContext),
            inputTokens: t.inputTokens || 0,
            cacheReadTokens: t.cacheReadTokens || 0,
            outputTokens: t.outputTokens || 0,
            totalTokens: t.totalTokens || 0,
            estimatedCostUsd: t.estimatedCostUsd || 0,
            savedByCacheUsd: t.savedByCacheUsd || 0,
          })),
        })),
      })),
  };
}

try {
  runSync({ backfill: true, printSummary: false });
} catch (err) {
  console.error("Initial sync warning:", err.message);
}

function handleRequest(req, res) {
  // Set permissive CORS headers for local sidecar webview / iframe
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sidecar-Token");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PRIMARY_PORT}`);

  // Serve preload.js cleanly if requested by the Antigravity sidecar webview
  if (req.method === "GET" && url.pathname.endsWith("/preload.js")) {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end("// Sidecar preload\n");
    return;
  }

  // Match /api/data (even if proxied under a subpath)
  if (req.method === "GET" && (url.pathname === "/api/data" || url.pathname.endsWith("/api/data"))) {
    const payload = loadAllUsers();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
    return;
  }

  // Match /api/export-metrics (numbers-only JSON download, no chat content)
  if (req.method === "GET" && (url.pathname === "/api/export-metrics" || url.pathname.endsWith("/api/export-metrics"))) {
    const payload = loadAllUsers();
    const metricsOnly = buildMetricsOnlyPayload(payload.users[0]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="token-tracker-metrics-${dateStamp}.json"`,
    });
    res.end(JSON.stringify(metricsOnly, null, 2));
    return;
  }

  // Match /api/sync
  if (req.method === "POST" && (url.pathname === "/api/sync" || url.pathname.endsWith("/api/sync"))) {
    try {
      const { bundle } = runSync({ backfill: true, printSummary: false });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(bundle));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve data-bundle.js directly with live data
  if (req.method === "GET" && url.pathname.endsWith("data-bundle.js")) {
    const payload = loadAllUsers();
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(`window.__TOKEN_TRACKER_DATA__ = ${JSON.stringify(payload)};\n`);
    return;
  }

  // Serve index.html with inline window.__TOKEN_TRACKER_DATA__ injected directly into the HTML
  // so the sidecar webview always renders data on initial paint without needing a second fetch.
  const indexHtmlPath = path.join(UI_DIR, "index.html");
  if (fs.existsSync(indexHtmlPath)) {
    let html = fs.readFileSync(indexHtmlPath, "utf8");
    const livePayload = loadAllUsers();
    const inlineScript = `<script>window.__TOKEN_TRACKER_DATA__ = ${JSON.stringify(livePayload)};</script>`;
    if (html.includes('<script src="./data-bundle.js"></script>')) {
      html = html.replace('<script src="./data-bundle.js"></script>', `${inlineScript}\n  <script src="./data-bundle.js"></script>`);
    } else {
      html = html.replace("</head>", `  ${inlineScript}\n</head>`);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

const primaryServer = http.createServer(handleRequest);
primaryServer.listen(PRIMARY_PORT, "127.0.0.1", () => {
  console.log(`[sidecar] listening on 127.0.0.1:${PRIMARY_PORT}`);
  console.log(`[Token Tracker] Reading local profile from: ${DATA_DIR}`);

  if (!process.argv.includes("--no-open") && !SIDECAR_PORT && process.platform === "darwin") {
    exec(`open "http://localhost:${PRIMARY_PORT}"`);
  }
});

// If running inside Antigravity Sidecar (where ANTIGRAVITY_SIDECAR_WEB_PORT != 4321),
// also listen on 4321 if available so http://localhost:4321 works in a browser too.
if (SIDECAR_PORT && SIDECAR_PORT !== FALLBACK_PORT) {
  const secondaryServer = http.createServer(handleRequest);
  secondaryServer.on("error", () => {
    // Ignore if 4321 is already in use
  });
  secondaryServer.listen(FALLBACK_PORT, "127.0.0.1", () => {
    console.log(`[Token Tracker] Secondary browser port active on http://localhost:${FALLBACK_PORT}`);
  });
}
