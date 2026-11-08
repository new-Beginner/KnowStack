'use strict';
// Real Chromium against simulated projects; never changes native memory/settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const profile = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'knowstack-settings-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let launchError; chrome.on('error', error => { launchError = error; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
(async () => {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await delay(100);
  }
  assert.ok(port, 'Chrome did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  await call('Page.enable'); await call('Runtime.enable');
  const cases = [];
  for (const width of [1100, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'settings-browser.html')).href });
    let ready = false;
    for (let i = 0; i < 150; i++) { if (await evaluate('typeof window.runBrowserTests === "function"')) { ready = true; break; } await delay(40); }
    assert.ok(ready, 'Fixture did not load');
    const result = await evaluate('window.runBrowserTests()');
    assert.equal(result.failed, 0, JSON.stringify(result)); cases.push({ width, ...result });
    if (process.env.KNOWSTACK_SCREENSHOT_DIR) {
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(process.env.KNOWSTACK_SCREENSHOT_DIR, `settings-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: cases.reduce((n, c) => n + c.passed, 0), failed: 0, cases }, null, 2));
  await call('Browser.close'); ws.close();
})().catch(error => { console.error(error); ws?.close(); chrome.kill(); process.exitCode = 1; });
