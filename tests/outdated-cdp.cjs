'use strict';
// Node 22+, local Chrome. The fixture uses simulated host data, not the real project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const scratch = process.env.PI_SCRATCH_DIR || os.tmpdir();
const profile = fs.mkdtempSync(path.join(scratch, 'knowstack-outdated-'));
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
  assert.ok(port, 'Chrome did not start; set CHROME_PATH');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(); const pageErrors = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails.text);
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
    await call('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'outdated-browser.html')).href });
    let ready = false;
    for (let i = 0; i < 150; i++) { if (await evaluate('typeof window.runBrowserTests === "function"')) { ready = true; break; } await delay(40); }
    assert.ok(ready, 'Fixture did not load');
    const result = await evaluate('window.runBrowserTests()'); assert.equal(result.failed, 0, JSON.stringify(result));
    cases.push({ width, ...result });
    await evaluate('window.testApp.screenshot()');
    const directory = process.env.KNOWSTACK_SCREENSHOT_DIR || path.join(__dirname, '../docs');
    for (const name of ['outdated-card', 'outdated-editor']) {
      if (name === 'outdated-editor') await evaluate('window.testApp.screenshotEditor()');
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, `${name}-0.5.1${width < 500 ? '-narrow' : ''}.png`), Buffer.from(shot.data, 'base64'));
    }
    await evaluate('document.querySelector(".km-cancel").click(); document.getElementById("chat").focus();');
    await call('Input.insertText', { text: '提醒关闭后可以输入' });
    assert.equal(await evaluate('document.getElementById("chat").value'), '提醒关闭后可以输入');
  }
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ passed: cases.reduce((n, c) => n + c.passed, 0), failed: 0, cases }, null, 2));
  await call('Browser.close'); ws.close();
})().catch(error => { console.error(error); ws?.close(); chrome.kill(); process.exitCode = 1; });
