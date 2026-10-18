export function sameProject(left, right) {
  const normalize = (path) => {
    if (typeof path !== "string") return "";
    const value = path.replaceAll("\\", "/").replace(/\/+$/, "");
    return /^[a-z]:\//i.test(value) ? value.toLowerCase() : value;
  };
  return !!normalize(left) && normalize(left) === normalize(right);
}

function diagnosticError(code) {
  return Object.assign(new Error(code), { code });
}

function snapshot(response) {
  const memory = response?.memory;
  if (!memory || typeof memory.content !== "string") throw diagnosticError("INVALID_MEMORY_RESPONSE");
  if (memory.entries == null && memory.content.trim()) {
    throw diagnosticError("UNSTRUCTURED_LEGACY_MEMORY");
  }
  const entries = memory.entries ?? [];
  if (!Array.isArray(entries) || entries.some((entry) => !entry ||
      Object.keys(entry).some((key) => !["id", "title", "content"].includes(key)) ||
      ["id", "title", "content"].some((key) => typeof entry[key] !== "string" || entry[key] !== entry[key].trim()) ||
      !entry.id || !entry.content) || new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw diagnosticError("NONCANONICAL_MEMORY_ENTRIES");
  }
  return { entries: entries.map(({ id, title, content }) => ({ id, title, content })), stamp: JSON.stringify(memory) };
}

export async function runMemoryTest(bridge, job) {
  const result = { status: "failed", testId: job.id, steps: [], cleanup: "not_needed", existingMemoryPreserved: null };
  let read;
  let save;
  let attemptedWrite = false;
  let initial;
  const testEntry = job.keepEntry === true
    ? { id: job.id, title: "插件写入验证", content: `这是一条由项目记忆插件写入的测试记忆，保留供用户检查，由用户手动删除。测试标记：${job.id}` }
    : { id: job.id, title: "Temporary API test", content: `Temporary probe ${job.id}` };
  try {
    if (!bridge || typeof bridge.invoke !== "function" || !job.id.startsWith("pi-memory-probe-") ||
        typeof job.projectPath !== "string" || job.expiresAt <= Date.now()) throw diagnosticError("INVALID_OR_EXPIRED_REQUEST");
    const channels = bridge.channels?.invoke;
    const call = async (key, input) => {
      if (typeof channels?.[key] !== "string") throw diagnosticError("REQUIRED_CHANNEL_UNAVAILABLE");
      try {
        const response = await (input === undefined ? bridge.invoke(channels[key]) : bridge.invoke(channels[key], input));
        if (!response || typeof response.ok !== "boolean") throw diagnosticError("INVALID_IPC_RESPONSE");
        if (response.ok !== true) throw diagnosticError(response.error?.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : "HOST_OPERATION_FAILED");
        if (!Object.hasOwn(response, "data")) throw diagnosticError("INVALID_IPC_RESPONSE");
        return response.data;
      } catch (error) {
        const known = ["PERMISSION_DENIED", "PLUGIN_UNLOADED"];
        throw diagnosticError(known.includes(error?.code) ? error.code : `${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_FAILED`);
      }
    };
    const resolveTarget = async () => {
      const active = await call("projectGet");
      if (!sameProject(active?.workspace?.path, job.projectPath)) throw diagnosticError("ACTIVE_PROJECT_MISMATCH");
      const response = await call("projectGroupList");
      if (!Array.isArray(response?.groups)) throw diagnosticError("INVALID_PROJECT_GROUP_RESPONSE");
      const matches = response.groups.filter((group) => Array.isArray(group.roots) &&
        group.roots.some((root) => sameProject(root.path, job.projectPath)));
      if (matches.length !== 1) throw diagnosticError(matches.length ? "AMBIGUOUS_PROJECT_MEMBERSHIP" : "MISSING_PROJECT_MEMBERSHIP");
      const group = matches[0];
      if (group.legacy === true) return { kind: "legacy", identity: job.projectPath, input: { projectPath: job.projectPath } };
      if (typeof group.id !== "string" || !group.id) throw diagnosticError("INVALID_PROJECT_GROUP_ID");
      return { kind: "group", identity: group.id, input: { groupId: group.id } };
    };
    const target = await resolveTarget();
    result.targetKind = target.kind;
    read = async () => snapshot(await call(target.kind === "group" ? "projectGroupMemoryGet" : "projectMemoryGet", target.input));
    save = async (expected, entries) => {
      if (Date.now() > job.expiresAt) throw new Error("Test expired; no further save allowed");
      const currentTarget = await resolveTarget();
      if (currentTarget.kind !== target.kind || currentTarget.identity !== target.identity) throw new Error("Project membership changed");
      const current = await read();
      if (current.stamp !== expected.stamp) throw new Error("Memory changed concurrently; save stopped");
      attemptedWrite = true;
      await call(target.kind === "group" ? "projectGroupMemorySave" : "projectMemorySave", { ...target.input, entries });
    };
    initial = await read();
    result.initialEntryCount = initial.entries.length;
    result.steps.push({ operation: "read", passed: true });
    if (initial.entries.some((entry) => entry.id === job.id)) throw new Error("Test id already exists; no write allowed");
    await save(initial, [...initial.entries, testEntry]);
    let current = await read();
    if (JSON.stringify(current.entries) !== JSON.stringify([...initial.entries, testEntry])) throw new Error("Create read-back mismatch");
    result.steps.push({ operation: "create_and_read_back", passed: true });
    if (job.keepEntry === true) {
      result.status = "passed";
      result.cleanup = "retained_by_request";
      result.finalEntryCount = current.entries.length;
      result.existingMemoryPreserved = JSON.stringify(current.entries.filter((entry) => entry.id !== job.id)) === JSON.stringify(initial.entries);
      return result;
    }
    const updated = { ...testEntry, title: "Updated temporary API test", content: `${testEntry.content} updated` };
    await save(current, [...initial.entries, updated]);
    current = await read();
    if (JSON.stringify(current.entries) !== JSON.stringify([...initial.entries, updated])) throw new Error("Update read-back mismatch");
    result.steps.push({ operation: "update_and_read_back", passed: true });
    result.status = "passed";
  } catch (error) {
    // Do not expose host errors: they can contain user memory or paths.
    result.errorCode = typeof error?.code === "string" && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : "TEST_FAILED";
    result.failedAfter = result.steps.at(-1)?.operation ?? "before_read";
  } finally {
    if (job.keepEntry === true && attemptedWrite && result.cleanup !== "retained_by_request") result.cleanup = "unverified";
    if (job.keepEntry !== true && attemptedWrite && read && save) {
      result.cleanup = "unverified";
      try {
        let current = await read();
        const own = current.entries.filter((entry) => entry.id === job.id);
        if (own.length) {
          if (own.length !== 1 || ![testEntry.title, "Updated temporary API test"].includes(own[0].title) || ![testEntry.content, `${testEntry.content} updated`].includes(own[0].content)) {
            throw new Error("Test entry changed externally; refusing deletion");
          }
          // Remove only our exact id, retaining all other entries as currently read.
          await save(current, current.entries.filter((entry) => entry.id !== job.id));
          current = await read();
        }
        if (current.entries.some((entry) => entry.id === job.id)) throw new Error("Cleanup read-back mismatch");
        result.cleanup = "verified";
        result.finalEntryCount = current.entries.length;
        result.existingMemoryPreserved = JSON.stringify(current.entries) === JSON.stringify(initial.entries);
        result.steps.push({ operation: "delete_test_entry_and_read_back", passed: true });
        if (!result.existingMemoryPreserved) result.status = "failed";
      } catch {
        result.status = "failed";
        result.cleanup = "unverified";
      }
    }
  }
  return result;
}
