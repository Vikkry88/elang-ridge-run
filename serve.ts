// serve.ts — tiny static server for local play-testing (Node 22, stdlib only).
// Serves this directory at http://localhost:8080 so game/index.html opens at
// http://localhost:8080/game/ — the same layout the screenshots are taken from.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = path === '/' ? 'game/index.html' : path.endsWith('/') ? path + 'index.html' : path.slice(1);
    const file = join(here, rel);
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(8080, () => console.log('Elang Ridge Run at http://localhost:8080/game/'));
