'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjectSettings } = require('../project-settings.js');
const { createService } = require('../memory-service.js');
const manifest = require('../manifest.json');
const alpha = { name: 'Alpha', path: 'D:/Alpha/' };
const beta = { name: 'Beta', path: 'D:/Beta' };

function rig(initial = {}) {
  const config = { autoSave: true, autoDelete: false, projectModes: '{}', projectDeleteModes: '{}', ...initial }; const writes = [];
  const io = { getSettings: async () => ({ ...config }), setSettings: async partial => { writes.push(partial); Object.assign(config, partial); } };
  return { store: createProjectSettings(io), config, writes, io };
}

test('startup initializes every project from the default without writing memory', async () => {
  for (const autoSave of [true, false]) {
    const r = rig({ autoSave }); const view = await r.store.sync([alpha, beta]);
    assert.deepEqual(view.projects.map(p => p.autoSave), [autoSave, autoSave]);
    assert.deepEqual(view.projects.map(p => p.autoDelete), [false, false]);
    assert.deepEqual(JSON.parse(r.config.projectModes), { 'd:/alpha': autoSave, 'd:/beta': autoSave });
    assert.deepEqual(JSON.parse(r.config.projectDeleteModes), { 'd:/alpha': false, 'd:/beta': false });
    assert.ok(r.writes.every(patch => Object.keys(patch).every(key => ['projectModes', 'projectDeleteModes'].includes(key))));
    await r.store.sync([alpha, beta]); assert.equal(r.writes.length, 1);
  }
});

test('new projects inherit the current default; existing choices survive scans and restarts', async () => {
  const r = rig({ projectModes: JSON.stringify({ 'D:\\Alpha/': false }), projectDeleteModes: '{"d:/alpha":true}' });
  await r.store.sync([alpha]);
  assert.deepEqual(await r.store.mode(alpha.path), { autoSave: false, autoDelete: true });
  await r.store.setDefault(false); await r.store.setDeleteDefault(true);
  await r.store.sync([alpha, beta]);
  await r.store.patchMode(beta.path, { autoSave: true, autoDelete: false }, true);
  await r.store.setDefault(true); await r.store.setDeleteDefault(false);
  await r.store.sync([alpha, beta]);
  const restarted = createProjectSettings(r.io); const view = await restarted.sync([alpha, beta]);
  assert.deepEqual(view.projects.map(p => p.autoSave), [false, true]);
  assert.deepEqual(view.projects.map(p => p.autoDelete), [true, false]);
});

test('deleted projects are pruned; re-added project receives the current default', async () => {
  const r = rig(); await r.store.sync([alpha, beta]); await r.store.patchMode(alpha.path, { autoSave: false, autoDelete: true });
  await r.store.sync([beta]);
  assert.deepEqual(JSON.parse(r.config.projectModes), { 'd:/beta': true });
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes), { 'd:/beta': false });
  await assert.rejects(r.store.patchMode(alpha.path, { autoSave: false }, true), /unavailable/);
  await r.store.sync([alpha, beta]);
  assert.deepEqual(await r.store.mode(alpha.path), { autoSave: true, autoDelete: false });
  await r.store.sync([]);
  assert.equal(r.config.projectModes, '{}');
  assert.equal(r.config.projectDeleteModes, '{}');
});

test('malformed or incomplete project input does not clear settings', async () => {
  const r = rig(); await r.store.sync([alpha]);
  const beforeModes = r.config.projectModes; const beforeDelete = r.config.projectDeleteModes;
  for (const input of [null, {}, [{ name: 'Missing path' }], [alpha, alpha], [{path: 1, name: 'Bad'}]]) await assert.rejects(r.store.sync(input));
  assert.equal(r.config.projectModes, beforeModes);
  assert.equal(r.config.projectDeleteModes, beforeDelete);
  await assert.rejects(r.store.setDefault('false'));
  await assert.rejects(r.store.setDeleteDefault('false'));
  await assert.rejects(r.store.setMode(alpha.path, 'false'));
  await assert.rejects(r.store.patchMode(alpha.path, { autoSave: 'false' }));
});

test('concurrent scan, card toggles and default changes do not overwrite unrelated modes', async () => {
  const r = rig(); await r.store.sync([alpha, beta]);
  await Promise.all([
    r.store.patchMode(alpha.path, { autoSave: false, autoDelete: true }),
    r.store.sync([alpha, beta]),
    r.store.patchMode(beta.path, { autoSave: false, autoDelete: false }),
    r.store.setDefault(false),
    r.store.setDeleteDefault(true)
  ]);
  assert.deepEqual(JSON.parse(r.config.projectModes), { 'd:/alpha': false, 'd:/beta': false });
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes), { 'd:/alpha': true, 'd:/beta': false });
  const view = await r.store.get();
  assert.equal(view.autoSave, false);
  assert.equal(view.autoDelete, true);
});

test('failed persistence does not publish the new catalog and the queue recovers', async () => {
  const r = rig(); let fail = true;
  const store = createProjectSettings({ ...r.io, setSettings: async patch => { if (fail) throw new Error('refused'); return r.io.setSettings(patch); } });
  await assert.rejects(store.sync([alpha]), /refused/); assert.deepEqual((await store.get()).projects, []);
  fail = false; await store.sync([alpha]); assert.equal((await store.get()).projects.length, 1);
});

test('project settings renderer methods require a current lease and known project', async t => {
  const r = rig(); const service = createService(r.io); t.after(() => service.stop());
  const { lease } = await service.renderer('connect', { version: manifest.version });
  await assert.rejects(service.renderer('projects', { action: 'sync', projects: [alpha] }), /lease/);
  const call = args => service.renderer('projects', { lease, ...args });
  await call({ action: 'sync', projects: [alpha] });
  await call({ action: 'set', path: alpha.path, autoSave: false, autoDelete: true });
  assert.equal((await service.settings(alpha.path)).autoSave, false);
  assert.equal((await service.settings(alpha.path)).autoDelete, true);
  await call({ action: 'default', autoSave: false });
  assert.equal((await call({ action: 'get' })).autoSave, false);
  await call({ action: 'default', autoDelete: true });
  assert.equal((await call({ action: 'get' })).autoDelete, true);
  await assert.rejects(call({ action: 'set', path: beta.path, autoSave: true }), /unavailable/);
});

test('multi-folder migration prefers primary choice and card toggles keep all roots consistent', async () => {
  const r = rig({ projectModes: '{\"d:/alpha\":false,\"d:/library\":true}', projectDeleteModes: '{\"d:/alpha\":true,\"d:/library\":false}' });
  const group = { ...alpha, paths: ['D:/Alpha', 'D:/Library'] };
  await r.store.sync([group]);
  assert.deepEqual(JSON.parse(r.config.projectModes), { 'd:/alpha': false, 'd:/library': false });
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes), { 'd:/alpha': true, 'd:/library': true });
  await r.store.patchMode('D:/Library', { autoSave: true, autoDelete: false });
  const view = await r.store.get();
  assert.equal(view.projects[0].autoSave, true);
  assert.equal(view.projects[0].autoDelete, false);
  assert.deepEqual(await r.store.mode(alpha.path), { autoSave: true, autoDelete: false });
});

test('adding and removing roots preserves the project choice and cleans only removed paths', async () => {
  const r = rig(); await r.store.sync([alpha]); await r.store.patchMode(alpha.path, { autoSave: false, autoDelete: true });
  await r.store.sync([{ ...alpha, paths: ['D:/Alpha', 'D:/Library'] }]);
  assert.deepEqual(await r.store.mode('D:/Library'), { autoSave: false, autoDelete: true });
  await r.store.sync([alpha]);
  assert.deepEqual(JSON.parse(r.config.projectModes), { 'd:/alpha': false });
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes), { 'd:/alpha': true });
});
