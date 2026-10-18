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
  const keys = ['projectGroupList', 'projectGroupMemoryGet', 'projectGroupMemorySave', 'projectMemoryGet', 'projectMemorySave'];
  const bridge = { channels: { invoke: Object.fromEntries(keys.map(key => [key, key])) }, async invoke(key, input) {
    calls.push({ key, input: clone(input) });
    await options.hook?.({ key, input, stores, groups, calls });
    if (key === 'projectGroupList') return { ok: true, data: { groups: clone(groups) } };
    const id = input.groupId ?? (input.projectPath === 'd:/a' ? 'ga' : 'gb');
    if (key.endsWith('Save')) { stores[id] = clone(input.entries); revision++; if (options.lostResponse) throw Error('PRIVATE_SECRET'); }
    const entries = clone(stores[id]);
    const memory = { entries, content: entries.map(e => e.title + '\n' + e.content).join('\n\n'), updatedAt: revision };
    if (options.memory) Object.assign(memory, options.memory);
    if (options.mismatch && revision) memory.entries = [];
    return { ok: true, data: { memory } };
  } };
  const access = createMemoryAccess(bridge); const controller = createMemoryEditor(access);
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
