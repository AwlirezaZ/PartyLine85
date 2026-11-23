// Builds the GitHub Pages site: wraps party-line-85.html in the page shell and writes _site/index.html.
// Run `node assemble.mjs` first so party-line-85.html is fresh.
// Usage: node build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrap } from './skeleton.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '_site');
const page = fs.readFileSync(path.join(dir, 'party-line-85.html'), 'utf8');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), wrap(page));
console.log(`wrote _site/index.html (${(Buffer.byteLength(wrap(page)) / 1024).toFixed(1)} KB)`);
