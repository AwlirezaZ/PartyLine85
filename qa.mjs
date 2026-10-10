// Headless-Chrome QA harness over the DevTools protocol (no dependencies; Node 22+ global WebSocket).
// Usage: node qa.mjs <url> <steps.json | inline JSON array> [outDir]
// Prints every console message / exception / log entry, eval results and screenshot paths.
//
// Steps (JSON array, run in order):
//   {"viewport":[w,h,dpr,mobile]}     set viewport (mobile=true also enables touch emulation)
//   {"wait":ms}
//   {"move":[x,y]}                    mouse move (hover)
//   {"click":[x,y]}                   mouse down+up (left)
//   {"dblclick":[x,y]}
//   {"rclickHold":[x,y,ms]}           right button hold
//   {"hold":[x,y,ms]}                 left press, wait, release
//   {"drag":[[x1,y1],[x2,y2],ms,holdFirstMs?]}  left drag in ~16ms steps (optional hold before moving)
//   {"wheel":[x,y,deltaY]}
//   {"tap":[x,y]}                     touch tap
//   {"touchDrag":[[x1,y1],[x2,y2],ms,holdFirstMs?]}
//   {"touch2Hold":[[x1,y1],[x2,y2],ms]}  two fingers held still
//   {"pinch":[[cx,cy],startDist,endDist,ms]}
//   {"key":"Enter"} | {"key":"d"} | {"keyHold":["Space",ms]}
//   {"type":"5550001"}                types characters as key presses
//   {"eval":"js expression"}          prints JSON result (awaits promises)
//   {"shot":"name"}                   screenshot -> outDir/name.png
//   {"frames":ms}                     measure rAF frame times for ms; prints stats
//   {"media":[[name,value],...]}       emulate media features (e.g. prefers-reduced-motion). Leading viewport/media
//                                     steps run BEFORE navigation so boot-time probes see them.
//   {"profStart":1} / {"profStop":N}  CPU-profile the page; prints the top N self-time functions
//   {"reload":1}                      reload the page and wait for load
//   {"init":"js"}                      run js in every new document before page scripts (leading step = before navigation)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, stepsArg, outDirArg] = process.argv.slice(2);
if (!url || !stepsArg) { console.error('usage: node qa.mjs <url> <steps.json|json> [outDir]'); process.exit(2); }
const steps = JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg);
const outDir = path.resolve(outDirArg || 'qa-out');
fs.mkdirSync(outDir, { recursive: true });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(2)}s]`;
let killed = false;
function finish(code) {
  if (killed) return; killed = true;
  try { chrome.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
}
setTimeout(() => { console.log(stamp(), 'GLOBAL TIMEOUT'); finish(3); }, 240000);

async function getJSON(p, method = 'GET') {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { method });
  return r.json();
}

let ws, nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej, method }));
}

let errors = 0;
function onEvent(msg) {
  const { method, params } = msg;
  if (method === 'Runtime.consoleAPICalled') {
    const text = params.args.map(a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.type)).join(' ');
    if (params.type === 'error') errors++;
    console.log(stamp(), `console.${params.type}:`, text);
  } else if (method === 'Runtime.exceptionThrown') {
    errors++;
    const d = params.exceptionDetails;
    console.log(stamp(), 'EXCEPTION:', d.exception?.description || d.text, `@${d.lineNumber}:${d.columnNumber}`);
  } else if (method === 'Log.entryAdded') {
    const e = params.entry;
    if (e.level === 'error') errors++;
    console.log(stamp(), `log.${e.level}:`, e.text, e.url ? `(${e.url})` : '');
  }
}

let mobile = false;
async function mouse(type, x, y, button = 'left', clickCount = 1, buttons) {
  await send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, buttons: buttons ?? (type === 'mouseReleased' ? 0 : (button === 'right' ? 2 : 1)) });
}
async function touch(type, pts) {
  await send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i, radiusX: 4, radiusY: 4, force: 0.5 })) });
}
const lerp = (a, b, t) => a + (b - a) * t;
const KEYS = { Enter: [13, 'Enter', '\r'], Space: [32, 'Space', ' '], Escape: [27, 'Escape'], ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], Tab: [9, 'Tab'], Minus: [189, 'Minus', '-'], Equal: [187, 'Equal', '+'] };
function keyInfo(k) {
  if (KEYS[k]) { const [code, c, text] = KEYS[k]; return { key: k === 'Space' ? ' ' : k === 'Minus' ? '-' : k === 'Equal' ? '+' : k, code: c, windowsVirtualKeyCode: code, text }; }
  const ch = k; const up = ch.toUpperCase();
  const code = /[0-9]/.test(ch) ? `Digit${ch}` : /[a-z]/i.test(ch) ? `Key${up}` : ch === '?' ? 'Slash' : ch === '-' ? 'Minus' : ch === '+' ? 'Equal' : ch === '#' ? 'Digit3' : ch === '*' ? 'Digit8' : '';
  return { key: ch, code, windowsVirtualKeyCode: up.charCodeAt(0), text: ch };
}
async function keyDown(k) { const i = keyInfo(k); await send('Input.dispatchKeyEvent', { type: i.text ? 'keyDown' : 'rawKeyDown', ...i }); }
async function keyUp(k) { const i = keyInfo(k); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...i, text: undefined }); }

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result.value;
}

async function run() {
  for (let i = 0; i < 100; i++) { try { await getJSON('/json/version'); break; } catch { await sleep(100); } }
  const target = await getJSON(`/json/new?about:blank`, 'PUT');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(`${p.method}: ${msg.error.message}`)) : p.res(msg.result);
    } else if (msg.method) onEvent(msg);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  let si = 0;
  while (si < steps.length && ['viewport', 'media', 'init'].includes(Object.keys(steps[si])[0])) await doStep(steps[si++]);
  const loaded = new Promise(res => { const prev = ws.onmessage; ws.onmessage = ev => { prev(ev); const m = JSON.parse(ev.data); if (m.method === 'Page.loadEventFired') res(); }; });
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(15000)]);
  console.log(stamp(), 'loaded', url);

  for (; si < steps.length; si++) await doStep(steps[si]);
  console.log(stamp(), `done. console errors/exceptions: ${errors}`);
  finish(0);
}
async function doStep(s) {
  {
    const [op] = Object.keys(s); const v = s[op];
    try {
      switch (op) {
        case 'viewport': {
          const [w, h, dpr = 1, mob = false] = v; mobile = mob;
          await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: mob });
          await send('Emulation.setTouchEmulationEnabled', { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
          console.log(stamp(), 'viewport', v); break;
        }
        case 'wait': await sleep(v); break;
        case 'profStart': await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); console.log(stamp(), 'profiler started'); break;
        case 'profStop': {
          const { profile } = await send('Profiler.stop'); const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
          const dt = profile.timeDeltas, smp = profile.samples; for (let k = 0; k < smp.length; k++) { const n = byId.get(smp[k]); const cf = n.callFrame; const key = (cf.functionName || '(anon)') + ' @' + cf.lineNumber + ':' + cf.columnNumber + ' ' + (cf.url || '').slice(-20); self.set(key, (self.get(key) || 0) + (dt[k] || 0) / 1000); }
          const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, v || 25); console.log(stamp(), 'profile (self ms):'); for (const [k, ms] of top) console.log('   ', ms.toFixed(1).padStart(9), k); break;
        }
        case 'init': await send('Page.addScriptToEvaluateOnNewDocument', { source: v }); console.log(stamp(), 'init script added'); break;
        case 'media': await send('Emulation.setEmulatedMedia', { features: v.map(([name, value]) => ({ name, value })) }); console.log(stamp(), 'media', JSON.stringify(v)); break;
        case 'reload': { const ld = new Promise(res => { const prev = ws.onmessage; ws.onmessage = ev => { prev(ev); const m = JSON.parse(ev.data); if (m.method === 'Page.loadEventFired') { ws.onmessage = prev; res(); } }; }); await send('Page.reload', {}); await Promise.race([ld, sleep(15000)]); console.log(stamp(), 'reloaded'); break; }
        case 'move': await mouse('mouseMoved', v[0], v[1], 'none', 0, 0); break;
        case 'click': await mouse('mouseMoved', v[0], v[1], 'none', 0, 0); await mouse('mousePressed', v[0], v[1]); await sleep(40); await mouse('mouseReleased', v[0], v[1]); break;
        case 'dblclick': await mouse('mousePressed', v[0], v[1], 'left', 1); await mouse('mouseReleased', v[0], v[1], 'left', 1); await sleep(80); await mouse('mousePressed', v[0], v[1], 'left', 2); await mouse('mouseReleased', v[0], v[1], 'left', 2); break;
        case 'rclickHold': await mouse('mousePressed', v[0], v[1], 'right'); await sleep(v[2]); await mouse('mouseReleased', v[0], v[1], 'right'); break;
        case 'hold': await mouse('mousePressed', v[0], v[1]); await sleep(v[2]); await mouse('mouseReleased', v[0], v[1]); break;
        case 'drag': {
          const [[x1, y1], [x2, y2], ms, hold = 0] = v; const n = Math.max(2, Math.round(ms / 16));
          await mouse('mouseMoved', x1, y1, 'none', 0, 0); await mouse('mousePressed', x1, y1); if (hold) await sleep(hold);
          for (let k = 1; k <= n; k++) { await mouse('mouseMoved', lerp(x1, x2, k / n), lerp(y1, y2, k / n), 'left', 0, 1); await sleep(16); }
          await mouse('mouseReleased', x2, y2); break;
        }
        case 'wheel': await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: v[0], y: v[1], deltaX: 0, deltaY: v[2] }); break;
        case 'tap': await touch('touchStart', [v]); await sleep(50); await touch('touchEnd', []); break;
        case 'touchDrag': {
          const [[x1, y1], [x2, y2], ms, hold = 0] = v; const n = Math.max(2, Math.round(ms / 16));
          await touch('touchStart', [[x1, y1]]); if (hold) await sleep(hold);
          for (let k = 1; k <= n; k++) { await touch('touchMove', [[lerp(x1, x2, k / n), lerp(y1, y2, k / n)]]); await sleep(16); }
          await touch('touchEnd', []); break;
        }
        case 'touch2Hold': await touch('touchStart', [v[0], v[1]]); await sleep(v[2]); await touch('touchEnd', []); break;
        case 'pinch': {
          const [[cx, cy], d0, d1, ms] = v; const n = Math.max(2, Math.round(ms / 16));
          const pts = d => [[cx - d / 2, cy], [cx + d / 2, cy]];
          await touch('touchStart', pts(d0));
          for (let k = 1; k <= n; k++) { await touch('touchMove', pts(lerp(d0, d1, k / n))); await sleep(16); }
          await touch('touchEnd', []); break;
        }
        case 'key': await keyDown(v); await sleep(30); await keyUp(v); break;
        case 'keyHold': await keyDown(v[0]); await sleep(v[1]); await keyUp(v[0]); break;
        case 'type': for (const ch of v) { await keyDown(ch); await sleep(25); await keyUp(ch); await sleep(60); } break;
        case 'eval': console.log(stamp(), 'eval', JSON.stringify(v).slice(0, 120), '=>', JSON.stringify(await evaluate(v))); break;
        case 'shot': {
          const r = await send('Page.captureScreenshot', { format: 'png' });
          const f = path.join(outDir, `${v}.png`); fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
          console.log(stamp(), 'screenshot', f); break;
        }
        case 'frames': {
          const stats = await evaluate(`new Promise(res=>{const d=[];let last=performance.now();const end=last+${v};function f(t){d.push(t-last);last=t;if(t<end)requestAnimationFrame(f);else{d.sort((a,b)=>a-b);res({n:d.length,mean:+(d.reduce((a,b)=>a+b,0)/d.length).toFixed(2),p50:+d[d.length>>1].toFixed(2),p95:+d[Math.floor(d.length*.95)].toFixed(2),max:+d[d.length-1].toFixed(2)})}}requestAnimationFrame(f)})`);
          console.log(stamp(), 'frames', JSON.stringify(stats), '(software GL: absolute numbers are pessimistic)'); break;
        }
        default: console.log(stamp(), 'unknown step', op);
      }
    } catch (e) { console.log(stamp(), `STEP FAILED ${op}:`, e.message); }
  }
}
run().catch(e => { console.error('QA harness failure:', e); finish(1); });
