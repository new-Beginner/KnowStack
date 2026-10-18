'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../renderer/panel-context.mjs');
function store(initial) {
  let state = initial; const listeners = new Set();
  return { getState: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { state = { ...state, ...next }; for (const fn of listeners) fn(); }, listeners };
}
const base = () => ({ activeSessionId: 'a', activeProjectPath: 'D:/alpha', sessions: [{ id: 'a', projectPath: 'D:/alpha' }], workPanelTabs: [], workspace: { path: 'D:/OTHER-WINDOW' } });
const doc = (urls = ['file:///app/out/renderer/assets/index-HASH.js'], href = 'file:///app/out/renderer/index.html') => ({ defaultView: { location: { href } }, querySelectorAll() { return urls.map(src => ({ src })); } });

test('selection uses window session, not the shared workspace', async () => {
  const { panelSelection } = await mod;
  assert.deepEqual(panelSelection(base()), { sessionId: 'a', projectPath: 'd:/alpha' });
});
test('project without a chat uses this window activeProjectPath; temporary chat never borrows workspace', async () => {
  const { panelSelection } = await mod;
  assert.deepEqual(panelSelection({ ...base(), activeSessionId: null }), { sessionId: null, projectPath: 'd:/alpha' });
  assert.throws(() => panelSelection({ ...base(), sessions: [{ id: 'a' }] }), /NO_PANEL_PROJECT/);
  assert.throws(() => panelSelection({ ...base(), activeSessionId: null, activeProjectPath: null }), /NO_PANEL_PROJECT/);
});
test('remote, missing session and in-flight project changes are refused', async () => {
  const { panelSelection } = await mod;
  for (const state of [
    { ...base(), selectingSessionId: 'b' },
    { ...base(), sessions: [] },
    { ...base(), activeProjectPath: 'D:/beta' },
  ]) assert.throws(() => panelSelection(state), /PANEL_CONTEXT_CHANGING/);
  assert.throws(() => panelSelection({ ...base(), sessions: [{ id: 'a', projectPath: 'D:/alpha', remoteHostKey: 'remote' }] }), /REMOTE_PROJECT/);
  assert.throws(() => panelSelection({ ...base(), activeSessionId: null, activeProjectPath: 'remote-project:test' }), /REMOTE_PROJECT/);
});
test('each window source is isolated, subscriptions notify only context changes and dispose', async () => {
  const { contextFromStore } = await mod;
  const a = store(base()); const b = store({ ...base(), activeSessionId: null, activeProjectPath: 'D:/beta' });
  const ca = contextFromStore(a), cb = contextFromStore(b); let changes = 0; const stop = ca.subscribe(() => changes++);
  b.set({ activeProjectPath: 'D:/gamma' }); assert.equal(changes, 0); assert.equal(ca.get().projectPath, 'd:/alpha'); assert.equal(cb.get().projectPath, 'd:/gamma');
  a.set({ workspace: { path: 'D:/beta' } }); assert.equal(changes, 0);
  a.set({ activeSessionId: null, activeProjectPath: 'D:/new' }); assert.equal(changes, 1);
  stop(); a.set({ activeProjectPath: 'D:/again' }); assert.equal(changes, 1); assert.equal(a.listeners.size, 0);
});
test('adapter imports only this document local host entry, finds store without a hardcoded export name', async () => {
  const { connectPanelContext } = await mod; const s = store(base()); let imported;
  const context = await connectPanelContext(doc(), async url => { imported = url; return { renamedExport: s, alias: s, junk: {} }; });
  assert.equal(imported, 'file:///app/out/renderer/assets/index-HASH.js'); assert.equal(context.get().projectPath, 'd:/alpha');
});
test('unavailable or ambiguous module/store fails closed with no alternate project lookup', async () => {
  const { connectPanelContext } = await mod; let imports = 0;
  const importer = async () => { imports++; return { store: store(base()) }; };
  for (const page of [doc([]), doc(['https://example.com/assets/index-x.js']), doc(['file:///elsewhere/assets/index-x.js']), doc(['file:///app/out/renderer/assets/index-a.js','file:///app/out/renderer/assets/index-b.js']), doc([], 'https://example.com')]) {
    await assert.rejects(connectPanelContext(page, importer), /PANEL_CONTEXT_UNAVAILABLE/);
  }
  assert.equal(imports, 0);
  await assert.rejects(connectPanelContext(doc(), async () => ({ first: store(base()), second: store(base()) })), /PANEL_CONTEXT_UNAVAILABLE/);
  await assert.rejects(connectPanelContext(doc(), async () => ({})), /PANEL_CONTEXT_UNAVAILABLE/);
  await assert.rejects(connectPanelContext(doc(), async () => { throw Error('private'); }), /PANEL_CONTEXT_UNAVAILABLE/);
});
module.exports = { store, base };
