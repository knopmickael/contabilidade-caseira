"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "contabilidade.db");

const db = new DatabaseSync(DB_PATH);
db.exec("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

const SEED_FILE = path.join(ROOT, "seed-data.js");

function loadSeed() {
  if (!fs.existsSync(SEED_FILE)) return null;
  const src = fs.readFileSync(SEED_FILE, "utf8");
  const match = src.match(/window\.SEED_DATA\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function getInitialState() {
  const row = db.prepare("SELECT value FROM state WHERE key = 'app'").get();
  if (row) {
    try {
      return JSON.parse(row.value);
    } catch { /* corrompido: reseed */ }
  }
  const seed = loadSeed();
  const state = seed || { categories: [], months: {} };
  db.prepare("INSERT OR REPLACE INTO state (key, value) VALUES ('app', ?)").run(JSON.stringify(state));
  return state;
}

function saveState(state) {
  db.prepare("INSERT OR REPLACE INTO state (key, value) VALUES ('app', ?)").run(JSON.stringify(state));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(getInitialState()));
    return;
  }

  if (req.method === "POST" && req.url === "/api/state") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const state = JSON.parse(body);
        saveState(state);
        res.writeHead(204);
        res.end();
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "JSON inválido" }));
      }
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  const state = getInitialState();
  const months = Object.keys(state.months || {}).length;
  console.log(`Contabilidade rodando em http://localhost:${PORT}`);
  console.log(`Banco: ${DB_PATH} | meses: ${months} | categorias: ${(state.categories || []).length}`);
});
