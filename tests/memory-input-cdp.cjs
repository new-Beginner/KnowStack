'use strict';
// Node 22+, Chrome. All memory data is mocked; this never opens the real host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = process.env.PI_SCRATCH_DIR || os.tmpdir();
const profile = fs.mkdtempSync(path.join(scratch, 'knowstack-input-'));
const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let launchError; chrome.on('error', error => { launchError = error; });
let ws;
(async () => {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await delay(100);
  }
  assert.ok(port, 'Chrome did not start; set CHROME_PATH to its executable');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; let nativeDialogs = 0; const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') nativeDialogs++;
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw Error('Missing click target'); node.scrollIntoView({block:'nearest'}); const r = node.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; if (!node.contains(document.elementFromPoint(x,y))) throw Error('Click target covered'); return {x,y}; })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const key = async (name, code) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
  };
  await call('Page.enable');
  const results = [];
  for (const width of [1100, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'memory-browser.html')).href });
    let ready = false;
    for (let i = 0; i < 200; i++) { if (await evaluate('typeof window.runBrowserTests === "function"')) { ready = true; break; } await delay(30); }
    assert.ok(ready, 'Fixture did not load');
    const regression = await evaluate('window.runBrowserTests()'); assert.equal(regression.failed, 0, regression.error);
    await click('.km-cancel');
    await evaluate(`document.getElementById('chat-input').addEventListener('input', event => { if (event.isTrusted) window.trustedInputs = (window.trustedInputs || 0) + 1; });`);
    for (const scenario of ['cancel-delete', 'escape-delete', 'save-delete', 'discard-delete']) {
      await evaluate(`(() => { window.testApp.stores.ga = [{id:'input-a',title:'删除测试',content:'模拟记忆，不是真实数据'},{id:'input-b',title:'保留测试',content:'保留内容'}]; document.getElementById('chat-input').value=''; window.trustedInputs=0; })()`);
      await evaluate('window.testApp.open()'); await click('.km-delete');
      assert.equal(await evaluate('!!document.querySelector("[role=alertdialog]")'), true);
      assert.equal(await evaluate('document.querySelector(".knowstack-editor").inert'), true);
      assert.equal(await evaluate('(() => { const r=document.querySelector("[role=alertdialog]").getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight; })()'), true);
      if (scenario === 'cancel-delete') {
        const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(root, 'docs', `confirmation-0.4.3${width < 500 ? '-narrow' : ''}.png`), Buffer.from(screenshot.data, 'base64'));
        await click('.km-confirm-cancel');
      } else if (scenario === 'escape-delete') {
        await key('Tab', 9); assert.equal(await evaluate('document.activeElement.className'), 'km-confirm-accept');
        await key('Escape', 27);
      } else {
        await click('.km-confirm-accept');
        assert.equal(await evaluate('document.querySelectorAll(".km-item").length'), 1);
        if (scenario === 'save-delete') { await click('.km-save'); await evaluate('window.testApp.wait()'); }
      }
      await click('.km-cancel');
      if (scenario === 'discard-delete') await click('.km-confirm-accept');
      assert.equal(await evaluate('!!document.querySelector("[role=dialog],[role=alertdialog]")'), false);
      await click('#chat-input');
      const text = `删除后可输入-${scenario}`;
      await call('Input.insertText', { text });
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'x', code: 'KeyX', text: 'x', windowsVirtualKeyCode: 88 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 });
      await key('Backspace', 8);
      const after = await evaluate('({text:document.getElementById("chat-input").value,focused:document.activeElement.id,trustedInputs:window.trustedInputs,native:window.testApp.nativeConfirmCalls})');
      assert.equal(after.text, text); assert.equal(after.focused, 'chat-input'); assert.ok(after.trustedInputs >= 3); assert.equal(after.native, 0); assert.equal(nativeDialogs, 0);
      results.push({ width, scenario, passed: true, trustedInputs: after.trustedInputs });
    }
  }
  console.log(JSON.stringify({ passed: results.length, failed: 0, cases: results }, null, 2));
  await call('Browser.close'); ws.close();
})().catch(error => { console.error(error); ws?.close(); chrome.kill(); process.exitCode = 1; });
