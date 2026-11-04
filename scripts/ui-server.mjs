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

  // Match /api/import
  if (req.method === "POST" && (url.pathname === "/api/import" || url.pathname.endsWith("/api/import"))) {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const items = Array.isArray(parsed.users) ? parsed.users : [parsed];
        fs.mkdirSync(DATA_DIR, { recursive: true });
        for (const item of items) {
          if (!item || !item.user || !item.user.userId) {
            throw new Error("Invalid user token profile JSON.");
          }
          const safeId = String(item.user.userId).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
          fs.writeFileSync(path.join(DATA_DIR, `${safeId}.json`), JSON.stringify(item, null, 2), "utf8");
        }
        const { bundle } = runSync({ backfill: false, printSummary: false });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(bundle));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
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
  console.log(`[Token Tracker] Reading team profiles from: ${DATA_DIR}`);

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
