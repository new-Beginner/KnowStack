"use strict";

const METHODS = ["nextMemoryTest", "reportMemoryTest"];
const OPERATIONS = ["read", "create_and_read_back", "update_and_read_back", "delete_test_entry_and_read_back"];

function createMemoryJobs(getWorkspace, now = Date.now) {
  let pending = null;
  let last = null;
  function expire() {
    if (pending && pending.expiresAt <= now()) {
      last = { status: "inconclusive", testId: pending.id, cleanup: pending.claimed ? "unverified" : "not_needed", reason: "Test request expired; do not rerun until any test card is checked." };
      pending = null;
    }
  }
  return {
    async queue(args, keepEntry = false) {
      expire();
      if (pending) throw new Error("A memory test is already pending");
      if (last?.cleanup === "unverified") throw new Error("Previous test cleanup is unverified; inspect its test card before rerunning");
      if (args?.confirm !== true || typeof args.expectedProjectPath !== "string" || !args.expectedProjectPath) {
        throw new Error("Explicit confirmation and current project path are required");
      }
      const workspace = await getWorkspace();
      const normalize = (value) => value.replaceAll("\\", "/").replace(/\/+$/, "");
      // Exact comparison is deliberate: a caller must name the current workspace.
      if (!workspace?.path || normalize(workspace.path) !== normalize(args.expectedProjectPath)) {
        throw new Error("Expected project does not match the current workspace");
      }
      if (pending) throw new Error("A memory test is already pending");
      if (last?.cleanup === "unverified") throw new Error("Previous test cleanup is unverified; no rerun allowed");
      const id = `pi-memory-probe-${now()}-${Math.random().toString(36).slice(2)}`;
      pending = { id, projectPath: workspace.path, expiresAt: now() + 60000, claimed: false, keepEntry: keepEntry === true };
      last = { status: "queued", testId: id, cleanup: "not_needed" };
      return { ...last };
    },
    call(method, args) {
      expire();
      if (method === "nextMemoryTest") {
        if (args && Object.keys(args).length) throw new Error("No polling arguments allowed");
        if (!pending || pending.claimed) return null;
        pending.claimed = true;
        last = { status: "running", testId: pending.id, cleanup: "unverified" };
        const { id, projectPath, expiresAt, keepEntry } = pending;
        return { id, projectPath, expiresAt, keepEntry };
      }
      if (method !== "reportMemoryTest" || !pending?.claimed || args?.testId !== pending.id) {
        throw new Error("Unexpected memory test report");
      }
      const allowed = ["status", "testId", "steps", "cleanup", "existingMemoryPreserved", "targetKind", "initialEntryCount", "finalEntryCount", "errorCode", "failedAfter"];
      if (Object.keys(args).some((key) => !allowed.includes(key)) ||
          !["passed", "failed"].includes(args.status) ||
          !["not_needed", "verified", "unverified", ...(pending.keepEntry ? ["retained_by_request"] : [])].includes(args.cleanup) ||
          ![true, false, null].includes(args.existingMemoryPreserved) ||
          !Array.isArray(args.steps) || args.steps.length > 4 || args.steps.some((step, index) =>
            !step || Object.keys(step).some((key) => !["operation", "passed"].includes(key)) ||
            !OPERATIONS.includes(step.operation) || args.steps.findIndex((item) => item?.operation === step.operation) !== index || step.passed !== true) ||
          ["initialEntryCount", "finalEntryCount"].some((key) => args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key] < 0)) ||
          (args.targetKind !== undefined && !["group", "legacy"].includes(args.targetKind)) ||
          (args.errorCode !== undefined && !/^[A-Z_]{1,64}$/.test(args.errorCode)) ||
          (args.failedAfter !== undefined && !["before_read", ...OPERATIONS].includes(args.failedAfter)) ||
          (args.status === "passed" && (args.cleanup !== (pending.keepEntry ? "retained_by_request" : "verified") || args.existingMemoryPreserved !== true || args.steps.length !== (pending.keepEntry ? 2 : 4))) ||
          (args.cleanup === "retained_by_request" && args.status !== "passed")) {
        throw new Error("Invalid memory test summary; raw memory is not accepted");
      }
      last = JSON.parse(JSON.stringify(args));
      pending = null;
      return { accepted: true };
    },
    status() { expire(); return last ? JSON.parse(JSON.stringify(last)) : { status: "not_run" }; },
    reset() { pending = null; last = null; },
  };
}

module.exports = { createMemoryJobs, METHODS };
