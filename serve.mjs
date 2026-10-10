// Local preview server: wraps the artifact file in the same skeleton the Artifact host adds.
// Usage: node serve.mjs <file.html> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'index.html');
const port = Number(process.argv[3] || 5173);

const head = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>`;

http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/#')) {
    let body;
    try { body = fs.readFileSync(file, 'utf8'); } catch (e) { res.writeHead(500); return res.end(String(e)); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(head + body + '</body></html>');
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end('not found');
}).listen(port, () => console.log(`serving ${file} on http://localhost:${port}`));
