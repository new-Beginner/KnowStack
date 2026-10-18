"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createMemoryJobs } = require("../memory-jobs.js");
const run = async (bridge, job) => (await import("../renderer/memory-test.mjs")).runMemoryTest(bridge, job);
const clone = (v) => structuredClone(v);
const projectPath = "D:/project";
const makeJob = () => ({ id: `pi-memory-probe-test-${Math.random().toString(36).slice(2)}`, projectPath, expiresAt: Date.now() + 60000 });
const original = [{ id: "existing", title: "Existing", content: "Private existing content" }];
function host(options = {}) {
  let entries = clone(original), reads = 0, saves = 0, calls = [];
  const channels = Object.fromEntries(["projectGet", "projectGroupList", "projectMemoryGet", "projectMemorySave", "projectGroupMemoryGet", "projectGroupMemorySave"].map((key) => [key, key]));
  const api = {
    channels: { invoke: channels },
    async invokeData(key, input) {
      calls.push(key);
      if (options.before) await options.before({ key, input, reads, saves, entries, set: (v) => { entries = clone(v); } });
      if (key === "projectGet") return { workspace: { path: options.wrongProject ? "D:/other" : projectPath } };
      if (key === "projectGroupList") return { groups: options.groups ?? [{ id: "group", legacy: !!options.legacy, roots: [{ path: projectPath }] }] };
      if (key.endsWith("Get")) {
        reads++;
        if (options.readFailure?.(reads)) throw new Error("Private data in error");
        return { memory: options.memory ?? { content: "Rendered", entries: clone(entries), updatedAt: saves } };
      }
      if (key.endsWith("Save")) {
        saves++;
        assert.deepEqual(input.groupId ? { groupId: input.groupId } : { projectPath: input.projectPath }, options.legacy ? { projectPath } : { groupId: "group" });
        if (options.deny) throw Object.assign(new Error("Private permission detail"), { code: "PERMISSION_DENIED" });
        if (options.saveFailure?.(saves)) throw new Error("Save failed");
        entries = clone(input.entries);
        if (options.afterSave) await options.afterSave({ saves, entries });
        if (options.ambiguous && saves === 1) throw new Error("Response lost after commit");
        return { memory: { content: "Rendered", entries: clone(entries) } };
      }
      throw new Error("Unexpected channel");
    },
    state: () => ({ entries: clone(entries), reads, saves, calls }),
  };
  api.invoke = async (key, input) => ({ ok: true, data: await api.invokeData(key, input) });
  return api;
}
for (const legacy of [false, true]) test(`CRUD preserves existing entries and verifies cleanup (${legacy ? "legacy" : "group"})`, async () => {
  const api = host({ legacy }), job = makeJob();
  const result = await run(api, job);
  assert.equal(result.status, "passed");
  assert.equal(result.cleanup, "verified");
  assert.equal(result.existingMemoryPreserved, true);
  assert.equal(result.targetKind, legacy ? "legacy" : "group");
  assert.deepEqual(result.steps.map((s) => s.operation), ["read", "create_and_read_back", "update_and_read_back", "delete_test_entry_and_read_back"]);
  assert.deepEqual(api.state().entries, original);
  assert.equal(api.state().saves, 3);
  assert.ok(!JSON.stringify(result).includes("Private"));
});
test("wrong project, missing group and ambiguous membership never save", async () => {
  for (const options of [{ wrongProject: true }, { groups: [] }, { groups: [1, 2].map((n) => ({ id: String(n), roots: [{ path: projectPath }] })) }]) {
    const api = host(options), result = await run(api, makeJob());
    assert.equal(result.status, "failed");
    assert.equal(result.cleanup, "not_needed");
    assert.equal(api.state().saves, 0);
  }
});
test("non-roundtrippable memory is never saved", async () => {
  for (const memory of [{ content: "Legacy text" }, { content: "Legacy text", entries: null }, { content: "", entries: [{ ...original[0], extra: "unknown" }] }, { content: "", entries: [{ ...original[0], content: " padded " }] }, { content: "", entries: [...original, ...original] }]) {
    const api = host({ memory });
    assert.equal((await run(api, makeJob())).status, "failed");
    assert.equal(api.state().saves, 0);
  }
});
test("permission denial is sanitized and does not fall back", async () => {
  const api = host({ deny: true }), result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "PERMISSION_DENIED");
  assert.equal(result.cleanup, "verified");
  assert.equal(api.state().saves, 1);
  assert.deepEqual(api.state().entries, original);
});
test("concurrent change before initial save is retained and stops writing", async () => {
  const external = { id: "external", title: "External", content: "External content" };
  const api = host({ before: ({ key, reads, set }) => { if (key.endsWith("MemoryGet") && reads === 1) set([...original, external]); } });
  const result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(api.state().saves, 0);
  assert.deepEqual(api.state().entries, [...original, external]);
});
test("response lost after creation still cleans only the test card", async () => {
  const api = host({ ambiguous: true }), result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "verified");
  assert.deepEqual(api.state().entries, original);
});
test("read-back failure still attempts cleanup", async () => {
  const api = host({ readFailure: (n) => n === 3 }), result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "verified");
  assert.deepEqual(api.state().entries, original);
});
test("concurrent new card survives cleanup", async () => {
  const external = { id: "external", title: "External", content: "External" };
  const api = host({ afterSave: ({ saves, entries }) => { if (saves === 1) entries.push(external); } });
  const result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "verified");
  assert.deepEqual(api.state().entries, [...original, external]);
});
test("externally edited test card is not deleted", async () => {
  const api = host({ afterSave: ({ saves, entries }) => { if (saves === 1) entries.at(-1).content = "Edited externally"; } });
  const result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "unverified");
  assert.equal(api.state().entries.at(-1).content, "Edited externally");
});
test("cleanup refusal is reported, not hidden", async () => {
  const api = host({ saveFailure: (n) => n === 3 }), result = await run(api, makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "unverified");
  assert.equal(api.state().entries.length, 2);
});
test("expired job never reads or writes", async () => {
  const api = host(), result = await run(api, { ...makeJob(), expiresAt: Date.now() - 1 });
  assert.equal(result.status, "failed");
  assert.equal(api.state().calls.length, 0);
});
const args = { confirm: true, expectedProjectPath: projectPath };
test("queue requires confirmation, correct workspace, and single claim", async () => {
  const jobs = createMemoryJobs(async () => ({ path: projectPath }));
  await assert.rejects(jobs.queue({ ...args, confirm: false }), /confirmation/);
  await assert.rejects(jobs.queue({ ...args, expectedProjectPath: "D:/wrong" }), /match/);
  const queued = await jobs.queue(args);
  await assert.rejects(jobs.queue(args), /pending/);
  assert.equal(jobs.call("nextMemoryTest", {}).id, queued.testId);
  assert.equal(jobs.call("nextMemoryTest", {}), null);
  assert.throws(() => jobs.call("reportMemoryTest", { testId: queued.testId, content: "raw" }), /Invalid memory test summary/);
});
test("claimed timeout blocks unsafe rerun", async () => {
  let clock = 1;
  const jobs = createMemoryJobs(async () => ({ path: projectPath }), () => clock);
  await jobs.queue(args);
  jobs.call("nextMemoryTest", {});
  clock += 60001;
  assert.equal(jobs.status().cleanup, "unverified");
  await assert.rejects(jobs.queue(args), /unverified/);
});
test("unclaimed timeout needs no cleanup", async () => {
  let clock = 1;
  const jobs = createMemoryJobs(async () => ({ path: projectPath }), () => clock);
  await jobs.queue(args);
  clock += 60001;
  assert.equal(jobs.status().cleanup, "not_needed");
  await jobs.queue(args);
});
test("queue accepts sanitized real runner result and blocks unverified cleanup", async () => {
  for (const failCleanup of [false, true]) {
    const jobs = createMemoryJobs(async () => ({ path: projectPath }));
    await jobs.queue(args);
    const job = jobs.call("nextMemoryTest", {});
    const result = await run(host({ saveFailure: (n) => failCleanup && n === 3 }), job);
    assert.deepEqual(jobs.call("reportMemoryTest", result), { accepted: true });
    assert.deepEqual(jobs.status(), result);
    if (failCleanup) await assert.rejects(jobs.queue(args), /unverified/);
  }
});
test("host object field ordering does not change CRUD semantics", async () => {
  const api = host({ afterSave: ({ entries }) => { for (let i = 0; i < entries.length; i++) { const { id, title, content } = entries[i]; entries[i] = { content, id, title }; } } });
  const result = await run(api, makeJob());
  assert.equal(result.status, "passed");
  assert.equal(result.cleanup, "verified");
  assert.deepEqual(api.state().entries, original);
});
test("pre-read errors identify their stage without returning private details", async () => {
  for (const [options, expected] of [
    [{ wrongProject: true }, "ACTIVE_PROJECT_MISMATCH"],
    [{ groups: [] }, "MISSING_PROJECT_MEMBERSHIP"],
    [{ memory: { content: "Private legacy text", entries: null } }, "UNSTRUCTURED_LEGACY_MEMORY"],
    [{ before: ({ key }) => { if (key === "projectGet") throw new Error("Private project path"); } }, "PROJECT_GET_FAILED"],
    [{ before: ({ key }) => { if (key === "projectGroupList") throw new Error("Private groups"); } }, "PROJECT_GROUP_LIST_FAILED"],
  ]) {
    const api = host(options), result = await run(api, makeJob());
    assert.equal(result.errorCode, expected);
    assert.equal(result.cleanup, "not_needed");
    assert.equal(api.state().saves, 0);
    assert.ok(!JSON.stringify(result).includes("Private"));
  }
});
test("IPC failure envelopes are sanitized and never treated as success", async () => {
  const api = host();
  api.invoke = async () => ({ ok: false, error: { code: "PERMISSION_DENIED", message: "Private details" } });
  const result = await run(api, makeJob());
  assert.equal(result.errorCode, "PERMISSION_DENIED");
  assert.equal(result.cleanup, "not_needed");
  assert.equal(api.state().saves, 0);
  assert.ok(!JSON.stringify(result).includes("Private"));
});
test("retained-write mode creates one card, preserves originals and never deletes", async () => {
  const jobs = createMemoryJobs(async () => ({ path: projectPath }));
  await jobs.queue(args, true);
  const job = jobs.call("nextMemoryTest", {}), api = host();
  const result = await run(api, job);
  assert.equal(result.status, "passed");
  assert.equal(result.cleanup, "retained_by_request");
  assert.equal(result.existingMemoryPreserved, true);
  assert.equal(api.state().saves, 1);
  assert.deepEqual(api.state().entries.slice(0, -1), original);
  assert.equal(api.state().entries.at(-1).id, job.id);
  assert.equal(api.state().entries.at(-1).title, "插件写入验证");
  assert.deepEqual(result.steps.map((s) => s.operation), ["read", "create_and_read_back"]);
  assert.deepEqual(jobs.call("reportMemoryTest", result), { accepted: true });
});
test("retained-write ambiguous result never auto-deletes and blocks retries", async () => {
  const jobs = createMemoryJobs(async () => ({ path: projectPath }));
  await jobs.queue(args, true);
  const job = jobs.call("nextMemoryTest", {}), api = host({ ambiguous: true });
  const result = await run(api, job);
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "unverified");
  assert.equal(api.state().saves, 1);
  assert.equal(api.state().entries.at(-1).id, job.id);
  jobs.call("reportMemoryTest", result);
  await assert.rejects(jobs.queue(args, true), /unverified/);
});
test("ordinary CRUD jobs cannot report a retained card as success", async () => {
  const jobs = createMemoryJobs(async () => ({ path: projectPath }));
  await jobs.queue(args);
  const job = jobs.call("nextMemoryTest", {});
  const result = await run(host(), { ...job, keepEntry: true });
  assert.throws(() => jobs.call("reportMemoryTest", result), /Invalid memory test summary/);
});
