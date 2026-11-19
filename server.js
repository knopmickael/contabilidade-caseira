"use strict";

// Servidor estático de desenvolvimento. A persistência é feita pelo navegador.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const PORT = process.env.PORT || 3000;
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

http.createServer((req, res) => {
  const file = files[new URL(req.url, "http://localhost").pathname];
  if (!file || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(path.join(__dirname, file[0]), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Falha ao carregar arquivo");
      return;
    }
    res.writeHead(200, { "Content-Type": file[1] });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}).listen(PORT, () => console.log(`Contabilidade em http://localhost:${PORT}`));
