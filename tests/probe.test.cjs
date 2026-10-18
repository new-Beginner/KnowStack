"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "main.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tests/probe-manifest.json'), 'utf8'));
const plain = (value) => JSON.parse(JSON.stringify(value));

async function load(desktop) {
  let tool;
  const tools = [];
  const removals = [];
  let removed;
  let invoked = 0;
  const sandbox = {
    module: { exports: {} },
    require: name => name === './manifest.json' ? manifest : createRequire(path.join(root, 'main.js'))(name),
    pi: {
      app: { getVersion: async () => "0.0.0-test" },
      workspace: { get: async () => ({ path: "D:/project" }) },
      desktop: desktop === null ? undefined : {
        ...desktop,
        invoke() { invoked++; throw new Error("Must not invoke operations"); },
      },
      agent: {
        registerTool: async (definition) => { tools.push(definition); if (definition.name === "inspect_project_memory_api") tool = definition; },
        unregisterTool: async (name) => { removals.push(name); removed = name; },
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: "main.js" });
  await sandbox.module.exports.onLoad();
  return { tool, tools, removals, unload: sandbox.module.exports.onUnload,
    reload: sandbox.module.exports.onLoad,
    report: sandbox.module.exports.onRendererCall,
    removed: () => removed, invoked: () => invoked };
}

test("manifest declares only diagnostic permissions and complete locales", () => {
  assert.equal(manifest.main, "main.js");
  assert.equal(manifest.version, "0.1.4");
  assert.deepEqual(manifest.permissions, ["agent.tool.register", "desktop.control", "renderer.extension"]);
  assert.equal(manifest.renderer, "renderer/probe.mjs");
  assert.deepEqual(manifest.rendererActions, ["plugin.call"]);
  assert.deepEqual(manifest.rendererCallMethods, ["reportRendererCapabilities", "nextMemoryTest", "reportMemoryTest"]);
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
  assert.deepEqual(probe.removals, manifest.contributes.agentTools.map((tool) => tool.name));
});

const capabilityReport = {
  probeVersion: manifest.version, rendererLoaded: true,
  hostBridgeVisible: true, hostInvokeVisible: true,
  nativeMemoryReadChannelVisible: true, nativeMemorySaveChannelVisible: true,
  groupMemoryReadChannelVisible: false, groupMemorySaveChannelVisible: false,
};

test("reports missing renderer observation without claiming an absent API", async () => {
  const probe = await load({ listOperations: async () => [] });
  const result = await probe.tool.execute();
  assert.equal(result.probeVersion, manifest.version);
  assert.equal(result.rendererProbe.status, "not_reported");
});

test("accepts only versioned boolean capability reports and returns no memory", async () => {
  const probe = await load({ listOperations: async () => [] });
  assert.deepEqual(plain(probe.report("reportRendererCapabilities", capabilityReport)), { accepted: true });
  const result = plain(await probe.tool.execute());
  assert.equal(result.rendererProbe.status, "reported");
  assert.equal(result.rendererProbe.hostInvokeVisible, true);
  assert.equal(result.rendererProbe.availabilityProbeInvokesBridge, false);
  assert.equal(result.memoryModified, false);
  assert.equal(probe.invoked(), 0);
});

test("rejects unknown methods, extra data, stale versions and malformed reports", async () => {
  const probe = await load({ listOperations: async () => [] });
  assert.throws(() => probe.report("readMemory", capabilityReport), /Unknown diagnostic method/);
  for (const report of [null, [], {}, { ...capabilityReport, secret: "not accepted" },
    { ...capabilityReport, probeVersion: "0.1.0" }, { ...capabilityReport, rendererLoaded: false },
    { ...capabilityReport, hostBridgeVisible: "yes" }]) {
    assert.throws(() => probe.report("reportRendererCapabilities", report), /Invalid renderer capability report/);
  }
  assert.equal((await probe.tool.execute()).rendererProbe.status, "not_reported");
});

test("clears renderer observations across unload and reload", async () => {
  const probe = await load({ listOperations: async () => [] });
  probe.report("reportRendererCapabilities", capabilityReport);
  await probe.unload();
  await probe.reload();
  assert.equal((await probe.tool.execute()).rendererProbe.status, "not_reported");
});

test("renderer-to-plugin path reports capability flags but never invokes the host bridge", async () => {
  const renderer = await import(pathToFileURL(path.join(root, manifest.renderer)).href);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "piDesktop");
  let hostCalls = 0;
  try {
    for (const bridge of [undefined, {}, {
      invoke() { hostCalls++; throw new Error("Host bridge must never be called"); },
      channels: { invoke: { projectMemoryGet: "read-channel", projectMemorySave: "write-channel" } },
    }]) {
      Object.defineProperty(globalThis, "piDesktop", { configurable: true, value: bridge });
      const probe = await load({ listOperations: async () => [] });
      await renderer.onLoad({ dispatch: async (action, payload) => {
        assert.equal(action, "plugin.call");
        assert.ok(manifest.rendererCallMethods.includes(payload.method));
        return probe.report(payload.method, payload.args);
      } });
      const result = plain(await probe.tool.execute());
      assert.equal(result.rendererProbe.status, "reported");
      assert.equal(result.rendererProbe.probeVersion, manifest.version);
      assert.equal(result.rendererProbe.hostBridgeVisible, bridge !== undefined);
      assert.equal(result.rendererProbe.hostInvokeVisible, typeof bridge?.invoke === "function");
      assert.equal(result.rendererProbe.nativeMemoryReadChannelVisible, !!bridge?.channels);
      assert.equal(hostCalls, 0);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      assert.equal(hostCalls, 0);
    }
  } finally {
    renderer.onUnload();
    if (descriptor) Object.defineProperty(globalThis, "piDesktop", descriptor);
    else delete globalThis.piDesktop;
  }
});

test("renderer dispatch rejection stays observable without retries", async () => {
  const renderer = await import(pathToFileURL(path.join(root, manifest.renderer)).href);
  const refusal = Object.assign(new Error("Grant missing"), { code: "PLUGIN_ACTION_UNDECLARED" });
  let calls = 0;
  await assert.rejects(renderer.onLoad({ dispatch: async () => { calls++; throw refusal; } }),
    (error) => error === refusal);
  renderer.onUnload();
  assert.equal(calls, 1);
});

test("confirmed tool queues exactly one renderer test and exposes verified cleanup", async () => {
  const renderer = await import(pathToFileURL(path.join(root, manifest.renderer)).href);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "piDesktop");
  const initial = [{ id: "existing", title: "Original", content: "Private memory" }];
  let entries = structuredClone(initial), saves = 0;
  const names = ["projectGet", "projectGroupList", "projectGroupMemoryGet", "projectGroupMemorySave"];
  Object.defineProperty(globalThis, "piDesktop", { configurable: true, value: {
    channels: { invoke: Object.fromEntries(names.map((name) => [name, name])) },
    async invoke(channel, input) {
      if (channel === "projectGet") return { ok: true, data: { workspace: { path: "D:/project" } } };
      if (channel === "projectGroupList") return { ok: true, data: { groups: [{ id: "g", roots: [{ path: "D:/project" }] }] } };
      if (channel === "projectGroupMemoryGet") return { ok: true, data: { memory: { content: "Rendered", entries: structuredClone(entries), updatedAt: saves } } };
      if (channel === "projectGroupMemorySave") { saves++; entries = structuredClone(input.entries); return { ok: true, data: {} }; }
      throw new Error("Unexpected host channel");
    },
  } });
  try {
    const probe = await load({ listOperations: async () => [] });
    const tool = probe.tools.find((tool) => tool.name === "test_project_memory_crud");
    await assert.rejects(tool.execute({ confirm: true, expectedProjectPath: "D:/project" }), /not ready/);
    await renderer.onLoad({ dispatch: async (action, payload) => probe.report(payload.method, payload.args) });
    await assert.rejects(tool.execute({ confirm: false, expectedProjectPath: "D:/project" }), /confirmation/);
    assert.equal(saves, 0);
    await tool.execute({ confirm: true, expectedProjectPath: "D:/project" });
    const deadline = Date.now() + 4000;
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 50));
      result = (await probe.tool.execute()).lastMemoryTest;
    } while (["queued", "running"].includes(result.status) && Date.now() < deadline);
    assert.equal(result.status, "passed");
    assert.equal(result.cleanup, "verified");
    assert.equal(saves, 3);
    assert.deepEqual(entries, initial);
    renderer.onUnload();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(saves, 3);
  } finally {
    renderer.onUnload();
    if (descriptor) Object.defineProperty(globalThis, "piDesktop", descriptor);
    else delete globalThis.piDesktop;
  }
});

test("dedicated retained-write tool queues an explicit keepEntry job", async () => {
  const probe = await load({ listOperations: async () => [] });
  probe.report("reportRendererCapabilities", capabilityReport);
  const tool = probe.tools.find((tool) => tool.name === "write_test_project_memory");
  await assert.rejects(tool.execute({ confirm: false, expectedProjectPath: "D:/project" }), /confirmation/);
  await tool.execute({ confirm: true, expectedProjectPath: "D:/project" });
  assert.equal(probe.report("nextMemoryTest", {}).keepEntry, true);
});
