// Assembles parts/ into the single artifact file.
//   parts/ui.html   -> <title>, <style>, markup (no doctype/html/head/body)
//   parts/*.js      -> concatenated in filename order inside one strict IIFE, each part minified (minify.mjs:
//                      comments stripped, whitespace collapsed, ASI-safe line joins; strings/templates verbatim)
// Usage: node assemble.mjs [--debug]   (run from any cwd; --debug skips minification)
// Outputs: party-line-85.html  and  _check.js (the bare script, for `node --check`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from './minify.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const parts = path.join(dir, 'parts');
const debug = process.argv.includes('--debug');
const html = fs.readFileSync(path.join(parts, 'ui.html'), 'utf8').trim();
const jsFiles = fs.readdirSync(parts).filter(f => f.endsWith('.js')).sort();
const js = jsFiles.map(f => {
  const src = fs.readFileSync(path.join(parts, f), 'utf8').trim();
  return debug ? `// ===== ${f} =====\n` + src : minify(src);
}).join('\n');
const script = `(()=>{\n'use strict';\n${js}\n})();`;

if (/<\/script/i.test(js)) throw new Error('A JS part contains "</script" — escape it.');
fs.writeFileSync(path.join(dir, '_check.js'), script);
const out = `${html}\n<script>\n${script}\n</script>\n`;
fs.writeFileSync(path.join(dir, 'party-line-85.html'), out);
const bytes = Buffer.byteLength(out, 'utf8');
console.log(`assembled ${jsFiles.length} parts${debug ? ' (debug, unminified)' : ''} -> party-line-85.html (${(bytes / 1024).toFixed(1)} KB, ${bytes} bytes)`);
