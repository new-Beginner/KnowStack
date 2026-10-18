'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../renderer/memory-editor.mjs');
const clone = value => structuredClone(value);
const old = { id: 'old', title: '既有规则', content: '保留这条已有记忆。' };
async function rig(t, options = {}) {
  const { createMemoryAccess, createMemoryEditor } = await mod;
  let groups = [{ id: 'ga', name: 'A 项目', roots: [{ path: 'D:/a' }] }, { id: 'gb', name: 'B 项目', roots: [{ path: 'D:/b' }] }];
  const stores = { ga: [clone(old)], gb: [] }; const calls = []; let revision = 0;
  const keys = ['sessionGet', 'projectGroupList', 'projectGroupMemoryGet', 'projectGroupMemorySave', 'projectMemoryGet', 'projectMemorySave'];
  const bridge = { channels: { invoke: Object.fromEntries(keys.map(key => [key, key])) }, async invoke(key, input) {
    calls.push({ key, input: clone(input) });
    await options.hook?.({ key, input, stores, groups, calls });
    if (key === 'projectGroupList') return { ok: true, data: { groups: clone(groups) } };
    if (key === 'sessionGet') return { ok: true, data: { session: options.session ? options.session(input.id) : { id: input.id, projectPath: options.context?.get().projectPath } } };
    const id = input.groupId ?? (input.projectPath === 'd:/a' ? 'ga' : 'gb');
    if (key.endsWith('Save')) { stores[id] = clone(input.entries); revision++; if (options.lostResponse) throw Error('PRIVATE_SECRET'); }
    const entries = clone(stores[id]);
    const memory = { entries, content: entries.map(e => e.title + '\n' + e.content).join('\n\n'), updatedAt: revision };
    if (options.memory) Object.assign(memory, options.memory);
    if (options.mismatch && revision) memory.entries = [];
    return { ok: true, data: { memory } };
  } };
  const access = createMemoryAccess(bridge); const controller = createMemoryEditor(access, { context: options.context });
  t.after(() => { controller.stop(); access.stop(); });
  return { access, controller, stores, calls, groups, setGroups(value) { groups = value; }, writes: () => calls.filter(c => c.key.endsWith('Save')) };
}
test('loading lists projects and reads native cards without writing', async t => {
  const r = await rig(t); await r.controller.load();
  assert.equal(r.controller.getState().projects.length, 2); assert.deepEqual(r.controller.getState().entries, [old]); assert.equal(r.writes().length, 0);
});
test('add/edit/delete remain drafts until an explicit save; stable IDs and other cards preserved', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.add();
  let state = r.controller.getState(); const id = state.entries[1].id;
  r.controller.update(id, 'title', '新规则'); r.controller.update(id, 'content', '新增内容'); r.controller.update('old', 'title', '手动修改');
  assert.deepEqual(r.stores.ga, [old]); await r.controller.save();
  assert.equal(r.writes().length, 1); assert.equal(r.stores.ga[0].id, old.id); assert.equal(r.stores.ga[0].title, '手动修改'); assert.equal(r.stores.ga[1].id, id);
  assert.match(r.controller.getState().message, /回读验证成功/); assert.equal(r.controller.getState().dirty, false);
  r.controller.remove('old'); assert.equal(r.stores.ga.length, 2); await r.controller.save(); assert.equal(r.stores.ga.length, 1);
});
test('delete all saves an empty native list', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.remove('old'); await r.controller.save(); assert.deepEqual(r.stores.ga, []);
});
test('switching projects and rereading never saves drafts or mixes project contents', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.update('old', 'content', '未保存'); await r.controller.load('group:gb');
  assert.deepEqual(r.controller.getState().entries, []); assert.deepEqual(r.stores.ga, [old]);
  await r.controller.load('group:ga'); assert.deepEqual(r.controller.getState().entries, [old]); assert.equal(r.writes().length, 0);
});
test('blank content is rejected without a write and can be corrected', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.update('old', 'content', '  '); await r.controller.save();
  assert.match(r.controller.getState().error, /须有正文/); assert.equal(r.writes().length, 0);
  r.controller.update('old', 'content', '修正后'); await r.controller.save(); assert.equal(r.writes().length, 1);
});
test('stale basis retains draft, blocks repeated submission, and reread recovers', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.update('old', 'content', '我的草稿');
  r.stores.ga.push({ id: 'external', title: '外部', content: '另一窗口内容' }); await r.controller.save();
  assert.match(r.controller.getState().error, /其他窗口/); assert.equal(r.controller.getState().entries[0].content, '我的草稿');
  await r.controller.save(); assert.equal(r.writes().length, 0); await r.controller.load('group:ga'); assert.equal(r.controller.getState().entries.length, 2);
});
test('second preflight read catches concurrent changes immediately before write', async t => {
  let enabled = false; let reads = 0;
  const r = await rig(t, { hook({ key, stores }) { if (enabled && key === 'projectGroupMemoryGet' && ++reads === 2) stores.ga.push({ id: 'external', title: '', content: '并发内容' }); } });
  await r.controller.load(); enabled = true; r.controller.remove('old'); await r.controller.save(); assert.equal(r.writes().length, 0); assert.match(r.controller.getState().error, /其他窗口/);
});
test('deleted project or changed folder membership never redirects writes', async t => {
  for (const remove of [true, false]) {
    const r = await rig(t); await r.controller.load(); r.controller.remove('old');
    if (remove) r.groups.shift(); else r.groups[0].roots.push({ path: 'D:/new-root' });
    await r.controller.save(); assert.equal(r.writes().length, 0); assert.match(r.controller.getState().error, /归属已变化/);
  }
});
test('lost response does not claim success or automatically retry; private host errors hidden', async t => {
  const r = await rig(t, { lostResponse: true }); await r.controller.load(); r.controller.remove('old'); await r.controller.save();
  assert.equal(r.writes().length, 1); assert.match(r.controller.getState().error, /结果待确认/); assert.ok(!r.controller.getState().error.includes('SECRET'));
  assert.equal(r.controller.getState().message, ''); await r.controller.save(); assert.equal(r.writes().length, 1);
});
test('read-back mismatch is unverified and never rolled back', async t => {
  const r = await rig(t, { mismatch: true }); await r.controller.load(); r.controller.update('old', 'content', '已提交'); await r.controller.save();
  assert.match(r.controller.getState().error, /结果待确认/); assert.equal(r.writes().length, 1); assert.equal(r.stores.ga[0].content, '已提交');
});
test('legacy projects use path channels; remote projects are skipped', async t => {
  const r = await rig(t); r.groups[0].legacy = true; r.groups.push({ id: 'remote', remote: true });
  await r.controller.load(); r.controller.update('old', 'title', '旧路径项目'); await r.controller.save();
  assert.equal(r.controller.getState().projects.length, 2); assert.equal(r.writes()[0].key, 'projectMemorySave'); assert.equal(r.writes()[0].input.projectPath, 'd:/a');
});
test('legacy free text or unknown metadata is not silently converted', async t => {
  for (const memory of [{ entries: [], content: '旧式内容' }, { entries: [{ ...old, extra: 'metadata' }] }]) {
    const r = await rig(t, { memory }); await r.controller.load(); assert.equal(r.controller.getState().loaded, false); assert.ok(r.controller.getState().error); assert.equal(r.writes().length, 0);
  }
});
test('failed reload preserves current draft and does not masquerade as an empty project', async t => {
  let offline = false; const r = await rig(t, { hook() { if (offline) throw Error('offline'); } });
  await r.controller.load(); r.controller.update('old', 'content', '保留草稿'); offline = true; await r.controller.load('group:ga');
  assert.equal(r.controller.getState().entries[0].content, '保留草稿'); assert.equal(r.controller.getState().needsRefresh, true); assert.equal(r.writes().length, 0);
});
test('empty projects list is valid but ambiguous project membership is refused', async t => {
  const r = await rig(t); r.setGroups([]); await r.controller.load(); assert.equal(r.controller.getState().loaded, true); assert.deepEqual(r.controller.getState().entries, []);
  r.setGroups([{ id: 'a', roots: [{ path: 'D:/dup' }] }, { id: 'b', roots: [{ path: 'D:/dup' }] }]); await r.controller.load(); assert.match(r.controller.getState().error, /项目列表异常/);
});
test('local queue serializes manual and Agent work, survives failure, unload prevents queued writes', async t => {
  const r = await rig(t); const events = []; let release;
  const first = r.access.run(async () => { events.push('agent-start'); await new Promise(resolve => { release = resolve; }); events.push('agent-end'); });
  const second = r.access.run(() => { events.push('manual'); }); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, ['agent-start']);
  release(); await Promise.all([first, second]); assert.deepEqual(events, ['agent-start', 'agent-end', 'manual']);
  await assert.rejects(r.access.run(() => { throw Error('failure'); })); await r.access.projects();
  const queued = r.access.run(() => { throw Error('should not run'); }); r.access.stop(); await assert.rejects(queued, /UNLOADED/);
});
test('double save is collapsed by busy state; edits are blocked while saving', async t => {
  const r = await rig(t); await r.controller.load(); r.controller.update('old', 'content', '一次保存');
  const first = r.controller.save(); r.controller.remove('old'); await r.controller.save(); await first;
  assert.equal(r.writes().length, 1); assert.equal(r.stores.ga[0].content, '一次保存');
});

function panel(projectPath = 'd:/b', sessionId = null) {
  let selected = { projectPath, sessionId }; let error = ''; const listeners = new Set();
  return {
    get() { if (error) throw Object.assign(Error(error), { code: error }); return selected; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(path, id = null) { selected = { projectPath: path, sessionId: id }; error = ''; for (const fn of listeners) fn(); },
    fail(code) { error = code; for (const fn of listeners) fn(); },
    count: () => listeners.size,
  };
}
async function settled(controller) {
  for (let i = 0; i < 200; i++) { await new Promise(resolve => setImmediate(resolve)); if (!controller.getState().busy) return; }
  throw Error('controller did not settle');
}
test('panel opens its non-first project, validates session and ignores manual project choice', async t => {
  const context = panel('d:/b', 'sb'); const r = await rig(t, { context }); await r.controller.load('group:ga');
  assert.equal(r.controller.getState().projectKey, 'group:gb'); assert.deepEqual(r.controller.getState().entries, []);
  assert.equal(r.controller.getState().following, true);
  assert.deepEqual(r.calls.find(c => c.key === 'sessionGet').input, { id: 'sb', messageLimit: 1, contentLimit: 1 });
  assert.equal(r.writes().length, 0);
});
test('panel root resolves the owning multi-root group, without needing an active session', async t => {
  const context = panel('d:/second'); const r = await rig(t, { context }); r.groups[1].roots.push({ path: 'D:/second' });
  await r.controller.load(); assert.equal(r.controller.getState().projectKey, 'group:gb');
  assert.equal(r.calls.some(c => c.key === 'sessionGet'), false);
});
test('clean editor follows only its own window and releases its subscription on close', async t => {
  const left = panel('d:/a'), right = panel('d:/b');
  const a = await rig(t, { context: left }), b = await rig(t, { context: right });
  await Promise.all([a.controller.load(), b.controller.load()]); left.set('d:/b'); await settled(a.controller);
  assert.equal(a.controller.getState().projectKey, 'group:gb'); assert.equal(b.controller.getState().projectKey, 'group:gb');
  right.set('d:/a'); await settled(b.controller);
  assert.equal(a.controller.getState().projectKey, 'group:gb'); assert.equal(b.controller.getState().projectKey, 'group:ga');
  assert.equal(left.count(), 1); a.controller.stop(); assert.equal(left.count(), 0);
  left.set('d:/a'); assert.equal(a.controller.getState().projectKey, 'group:gb');
});
test('project change preserves dirty draft and blocks saving until explicit reread', async t => {
  const context = panel('d:/a'); const r = await rig(t, { context }); await r.controller.load();
  r.controller.update('old', 'content', '旧项目草稿'); context.set('d:/b'); await settled(r.controller);
  assert.equal(r.controller.getState().entries[0].content, '旧项目草稿'); assert.equal(r.controller.getState().projectKey, 'group:ga');
  assert.equal(r.controller.getState().needsRefresh, true); await r.controller.save(); assert.equal(r.writes().length, 0);
  await r.controller.load(); assert.equal(r.controller.getState().projectKey, 'group:gb'); assert.deepEqual(r.controller.getState().entries, []);
});
test('unavailable, remote or unknown panel never falls back to first project', async t => {
  for (const code of ['NO_PANEL_PROJECT', 'REMOTE_PROJECT', 'PANEL_CONTEXT_UNAVAILABLE', 'PANEL_CONTEXT_CHANGING']) {
    const context = panel(); context.fail(code); const r = await rig(t, { context }); await r.controller.load();
    assert.equal(r.controller.getState().loaded, false); assert.equal(r.calls.length, 0); assert.equal(r.controller.getState().projectKey, '');
  }
  const r = await rig(t, { context: panel('d:/unknown') }); await r.controller.load();
  assert.equal(r.controller.getState().loaded, false); assert.equal(r.calls.some(c => c.key.endsWith('MemoryGet')), false);
});
test('moved or remote native session rejects a stale panel selection before memory access', async t => {
  for (const session of [() => ({ id: 's', projectPath: 'd:/b' }), () => ({ id: 's', projectPath: 'd:/a', source: 'remote' }), () => null]) {
    const r = await rig(t, { context: panel('d:/a', 's'), session }); await r.controller.load();
    assert.equal(r.controller.getState().loaded, false); assert.equal(r.calls.length, 1); assert.equal(r.calls[0].key, 'sessionGet');
  }
});
test('rapid changes during read discard stale result and follow the latest panel', async t => {
  const context = panel('d:/a'); let switched = false;
  const r = await rig(t, { context, hook({ key }) { if (!switched && key === 'projectGroupMemoryGet') { switched = true; context.set('d:/b'); } } });
  await r.controller.load(); await settled(r.controller);
  assert.equal(r.controller.getState().projectKey, 'group:gb'); assert.deepEqual(r.controller.getState().entries, []); assert.equal(r.writes().length, 0);
});
test('project switch in save preflight blocks the write and retains the original draft', async t => {
  const context = panel('d:/a'); let saving = false;
  const r = await rig(t, { context, hook({ key }) { if (saving && key === 'projectGroupMemoryGet') context.set('d:/b'); } });
  await r.controller.load(); r.controller.update('old', 'content', '不准写错项目'); saving = true; await r.controller.save();
  assert.equal(r.writes().length, 0); assert.equal(r.controller.getState().entries[0].content, '不准写错项目'); assert.equal(r.controller.getState().needsRefresh, true);
});
test('native session is revalidated immediately before saving', async t => {
  const context = panel('d:/a', 's'); let checks = 0;
  const r = await rig(t, { context, session: id => ({ id, projectPath: ++checks >= 3 ? 'd:/b' : 'd:/a' }) });
  await r.controller.load(); r.controller.remove('old'); await r.controller.save(); assert.equal(checks, 3); assert.equal(r.writes().length, 0);
});
test('switch during dispatched save never redirects payload; clean editor then follows new project', async t => {
  const context = panel('d:/a');
  const r = await rig(t, { context, hook({ key }) { if (key === 'projectGroupMemorySave') context.set('d:/b'); } });
  await r.controller.load(); r.controller.update('old', 'content', '只存旧项目'); await r.controller.save(); await settled(r.controller);
  assert.equal(r.writes().length, 1); assert.equal(r.writes()[0].input.groupId, 'ga'); assert.deepEqual(r.stores.gb, []);
  assert.equal(r.stores.ga[0].content, '只存旧项目'); assert.equal(r.controller.getState().projectKey, 'group:gb');
});
