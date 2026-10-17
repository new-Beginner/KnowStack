"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const plain = (value) => JSON.parse(JSON.stringify(value));

async function load(desktop) {
  let tool;
  let removed;
  let invoked = 0;
  const sandbox = {
    module: { exports: {} },
    pi: {
      app: { getVersion: async () => "0.0.0-test" },
      desktop: desktop === null ? undefined : {
        ...desktop,
        invoke() { invoked++; throw new Error("Must not invoke operations"); },
      },
      agent: {
        registerTool: async (definition) => { tool = definition; },
        unregisterTool: async (name) => { removed = name; },
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: "main.js" });
  await sandbox.module.exports.onLoad();
  return { tool, unload: sandbox.module.exports.onUnload,
    removed: () => removed, invoked: () => invoked };
}

test("manifest declares only diagnostic permissions and complete locales", () => {
  assert.equal(manifest.main, "main.js");
  assert.equal(manifest.version, "0.1.0");
  assert.deepEqual(manifest.permissions, ["agent.tool.register", "desktop.control"]);
  for (const locale of ["en", "zh-CN"]) {
    for (const field of ["name", "description", "safetyNotes"]) {
      assert.ok(manifest.i18n[locale][field].trim());
    }
  }
});

test("lists candidate metadata without invoking even advertised write operations", async () => {
  const catalog = [
    { id: "project/memory/get", description: "Read project memory", risk: "read" },
    { id: "project/memory/set", description: "Update project memory", risk: "write" },
    { id: "session/delete", description: "Delete a session", risk: "dangerous" },
    { id: "example/read", description: "读取项目记忆", risk: "read" },
  ];
  const probe = await load({ listOperations: async () => catalog });
  const result = plain(await probe.tool.execute());
  assert.equal(result.hostVersion, "0.0.0-test");
  assert.equal(result.operationCount, 4);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.operations, catalog);
  assert.equal(result.memoryModified, false);
  assert.equal(probe.invoked(), 0);
  assert.deepEqual(plain(probe.tool.schema), manifest.contributes.agentTools[0].schema);
  assert.equal(probe.tool.name, manifest.contributes.agentTools[0].name);
});

test("handles an empty catalog without inventing memory support", async () => {
  const probe = await load({ listOperations: async () => [] });
  const result = plain(await probe.tool.execute());
  assert.equal(result.operationCount, 0);
  assert.deepEqual(result.candidates, []);
  assert.equal(probe.invoked(), 0);
});

test("reports missing desktop API without private-storage fallback", async () => {
  const probe = await load(null);
  const result = await probe.tool.execute();
  assert.equal(result.supported, false);
  assert.equal(result.memoryModified, false);
});

test("preserves permission denial without fallback", async () => {
  const denial = Object.assign(new Error("Permission denied"), { code: "PERMISSION_DENIED" });
  const probe = await load({ listOperations: async () => { throw denial; } });
  await assert.rejects(probe.tool.execute(), (error) => error === denial);
  assert.equal(probe.invoked(), 0);
});

test("rejects malformed catalogs without invoking operations", async () => {
  for (const catalog of [null, {}, [null], [{ id: "x", description: "X", risk: "invalid" }]]) {
    const probe = await load({ listOperations: async () => catalog });
    await assert.rejects(probe.tool.execute(), /Unexpected desktop operation catalog/);
    assert.equal(probe.invoked(), 0);
  }
});

test("unregisters its tool on unload", async () => {
  const probe = await load({ listOperations: async () => [] });
  await probe.unload();
  assert.equal(probe.removed(), "inspect_project_memory_api");
});
