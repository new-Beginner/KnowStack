'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mod = import('../renderer/panel-context.mjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function documentRig() {
  let panes = [], rows = [], groups = [], shell = true, callback;
  const events = new Map(), windowEvents = new Map();
  const node = (name, value) => ({ getAttribute: key => key === name ? value : null });
  const doc = {
    documentElement: {}, hidden: false,
    querySelectorAll(selector) {
      if (selector.startsWith('[data-session-pane]')) return panes.map(id => node('data-session-pane', id));
      if (selector.startsWith('.thread-item.active')) return rows.map(id => node('data-sidebar-session-row', id));
      if (selector.startsWith('[data-sidebar-project-group]')) return groups.map(path => node('data-sidebar-project-group', path));
      throw Error('unexpected selector: ' + selector);
    },
    querySelector() { return shell ? {} : null; },
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
    defaultView: {
      MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() { callback = null; } },
      addEventListener: (key, fn) => windowEvents.set(key, fn), removeEventListener: key => windowEvents.delete(key),
    },
  };
  return { doc, events, windowEvents,
    set(next, emit = true) {
      if ('panes' in next) panes = next.panes;
      if ('rows' in next) rows = next.rows;
      if ('groups' in next) groups = next.groups;
      if ('shell' in next) shell = next.shell;
      if (emit) callback?.([]);
    },
    observing: () => !!callback,
  };
}
test('visible pane wins over an already switched sidebar row; blank pane uses selected row', async () => {
  const { readPanelIdentity } = await mod; const r = documentRig();
  r.set({ panes: ['a'], rows: ['b'], groups: ['D:/alpha'] });
  assert.deepEqual(readPanelIdentity(r.doc), { sessionId: 'a', projectPath: null });
  r.set({ panes: [] }); assert.equal(readPanelIdentity(r.doc).sessionId, 'b');
});
test('no chat uses the unique current project marker, never a shared workspace', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ groups: ['D:\\Alpha\\'] });
  const context = await connectPanelContext(r.doc); assert.equal(context.get().projectPath, 'd:/alpha');
  assert.equal(context.get().sessionId, null); context.stop();
});
test('missing, ambiguous, malformed and remote identity fail closed', async () => {
  const { readPanelIdentity } = await mod;
  for (const [next, code] of [
    [{}, 'NO_PANEL_PROJECT'], [{ shell: false }, 'PANEL_CONTEXT_UNAVAILABLE'],
    [{ panes: ['a', 'b'] }, 'PANEL_CONTEXT_UNAVAILABLE'], [{ panes: ['../bad'] }, 'PANEL_CONTEXT_UNAVAILABLE'],
    [{ panes: [''] }, 'PANEL_CONTEXT_UNAVAILABLE'], [{ groups: ['D:/a', 'D:/b'] }, 'PANEL_CONTEXT_UNAVAILABLE'],
    [{ groups: ['remote-project:host'] }, 'REMOTE_PROJECT'], [{ groups: ['relative/path'] }, 'PANEL_CONTEXT_UNAVAILABLE'],
    [{ groups: ['//server/share'] }, 'PANEL_CONTEXT_UNAVAILABLE'],
  ]) { const r = documentRig(); r.set(next); assert.throws(() => readPanelIdentity(r.doc), new RegExp(code)); }
});
test('session path is resolved through the restricted callback and each window remains isolated', async () => {
  const { connectPanelContext } = await mod; const a = documentRig(), b = documentRig();
  a.set({ panes: ['a'] }); b.set({ groups: ['D:/beta'] });
  const calls = []; const ca = await connectPanelContext(a.doc, { resolveSession: async id => { calls.push(id); return { sessionId: id, projectPath: 'D:/alpha' }; } });
  const cb = await connectPanelContext(b.doc); await tick();
  assert.equal(ca.get().projectPath, 'd:/alpha'); assert.equal(cb.get().projectPath, 'd:/beta'); assert.deepEqual(calls, ['a']);
  let changes = 0; const unsubscribe = ca.subscribe(() => changes++);
  b.set({ groups: ['D:/gamma'] }); assert.equal(changes, 0); assert.equal(ca.get().projectPath, 'd:/alpha');
  a.set({ panes: [], groups: ['D:/delta'] }); assert.equal(ca.get().projectPath, 'd:/delta'); assert.ok(changes);
  unsubscribe(); ca.stop(); cb.stop(); assert.equal(a.observing(), false); assert.equal(a.events.size + a.windowEvents.size, 0);
});
test('get rechecks live DOM before save even before MutationObserver delivery', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ groups: ['D:/a'] });
  const c = await connectPanelContext(r.doc); const first = c.get(); r.set({ groups: ['D:/b'] }, false);
  assert.equal(c.get().projectPath, 'd:/b'); assert.notEqual(c.get().contextVersion, first.contextVersion); c.stop();
});
test('late async results and rapid A-B-A never restore an old identity generation', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ panes: ['a'] }); const pending = [];
  const c = await connectPanelContext(r.doc, { resolveSession: id => new Promise(resolve => pending.push({ id, resolve })) }); await tick();
  r.set({ panes: ['b'] }); await tick(); r.set({ panes: ['a'] }); await tick();
  assert.deepEqual(pending.map(p => p.id), ['a', 'b', 'a']);
  pending[0].resolve({ sessionId: 'a', projectPath: 'D:/stale' }); pending[1].resolve({ sessionId: 'b', projectPath: 'D:/b' }); await tick();
  assert.throws(() => c.get(), /PANEL_CONTEXT_CHANGING/);
  pending[2].resolve({ sessionId: 'a', projectPath: 'D:/fresh' }); await tick(); assert.equal(c.get().projectPath, 'd:/fresh'); c.stop();
});
test('failed lookup retries on focus; unloaded resolver cannot notify or restore context', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ panes: ['a'] }); let attempts = 0;
  const c = await connectPanelContext(r.doc, { resolveSession: async id => { if (++attempts === 1) throw Error('offline'); return { sessionId: id, projectPath: 'D:/a' }; } }); await tick();
  assert.throws(() => c.get(), /PANEL_CONTEXT_UNAVAILABLE/); r.windowEvents.get('focus')(); await tick(); assert.equal(c.get().projectPath, 'd:/a');
  let changes = 0; c.subscribe(() => changes++); r.set({ panes: ['b'] }); c.stop(); const count = changes; await tick();
  assert.equal(changes, count); assert.throws(() => c.get(), /UNLOADED/);
});
test('adapter contains no dynamic module loading or host-store extraction', () => {
  const source = fs.readFileSync(require.resolve('../renderer/panel-context.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bimport\s*\(|getState|workspace\.get|textContent|innerText/);
});
module.exports = { documentRig };
test('ready waits for the latest identity rather than an obsolete unresolved request', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ panes: ['a'] }); const pending = [];
  const c = await connectPanelContext(r.doc, { resolveSession: id => new Promise(resolve => pending.push({ id, resolve })) });
  const ready = c.ready(); await tick(); r.set({ panes: ['b'] }); await tick();
  pending[1].resolve({ sessionId: 'b', projectPath: 'D:/b' });
  assert.equal((await ready).projectPath, 'd:/b'); c.stop();
});
test('unloading wakes pending reads without waiting for a host response', async () => {
  const { connectPanelContext } = await mod; const r = documentRig(); r.set({ panes: ['a'] });
  const c = await connectPanelContext(r.doc, { resolveSession: () => new Promise(() => {}) });
  const ready = c.ready(); c.stop(); await assert.rejects(ready, /UNLOADED/);
});
