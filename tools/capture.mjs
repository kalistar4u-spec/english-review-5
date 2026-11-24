// 화면 캡처·점검 도구 (headless Edge를 DevTools 프로토콜로 조종)
// 사용: node tools/capture.mjs tools/shots-<이름>.json
// 시나리오 파일 형식:
// { "base": "http://127.0.0.1:5173/", "out": "screenshots",
//   "shots": [ { "name": "02-x-after", "width": 1280, "height": 800, "hash": "#/units",
//                "setup": ["자바스크립트 한 줄", ...], "steps": ["자바스크립트", ...], "fullPage": false } ] }
// init 은 페이지 스크립트보다 먼저 실행할 코드(문자열)
// setup 은 페이지를 열기 전에(같은 출처에서) 실행되고, steps 는 연 뒤 차례로 실행됨(각 단계 뒤 400ms 기다림)
// 콘솔 오류·예외가 있으면 끝에 출력하고 종료 코드 1
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scenario = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'er5-edge-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Edge DevTools에 연결하지 못함');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const problems = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: ok, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    problems.push(`예외: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    problems.push(`로그 오류: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  }
});
const send = (method, params = {}) => new Promise((ok, reject) => {
  const id = ++seq;
  pending.set(id, { resolve: ok, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const outDir = resolve(scenario.out || 'screenshots');
for (const shot of scenario.shots) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: shot.width < 700,
  });
  if (shot.setup?.length) {
    await send('Page.navigate', { url: scenario.base + 'index.html#/blank' });
    await sleep(500);
    for (const js of shot.setup) await evaluate(js);
  }
  // init: 페이지 코드보다 먼저 실행할 스크립트(예: 음성 기능을 지워 오류 화면 확인)
  const added = shot.init ? await send('Page.addScriptToEvaluateOnNewDocument', { source: shot.init }) : null;
  await send('Page.navigate', { url: scenario.base + 'index.html' + (shot.hash || '') });
  await sleep(1200);
  await evaluate('location.reload()').catch(() => {});
  await sleep(1200);
  for (const js of shot.steps || []) {
    const v = await evaluate(js);
    if (v !== undefined && v !== null) console.log(`  [${shot.name}] ${JSON.stringify(v)}`);
    await sleep(400);
  }
  let clip;
  if (shot.fullPage) {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    clip = { x: 0, y: 0, width: shot.width, height: Math.max(shot.height, Math.ceil(cssContentSize.height)), scale: 1 };
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
  writeFileSync(join(outDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
  if (added) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.identifier });
  console.log(`저장: ${shot.name}.png`);
}

ws.close();
edge.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
if (problems.length) {
  console.log('콘솔 문제:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
  process.exit(1);
}
console.log('콘솔 오류 없음');
