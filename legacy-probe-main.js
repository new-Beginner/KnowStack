"use strict";

const manifest = require("./manifest.json");
const { createMemoryJobs, METHODS } = require("./memory-jobs.js");
const CANDIDATE_PATTERN = /memory|remember|context|knowledge|project|记忆|上下文|知识|项目/i;
const CAPABILITY_FIELDS = [
  "rendererLoaded", "hostBridgeVisible", "hostInvokeVisible",
  "nativeMemoryReadChannelVisible", "nativeMemorySaveChannelVisible",
  "groupMemoryReadChannelVisible", "groupMemorySaveChannelVisible",
];
const memoryJobs = createMemoryJobs(() => pi.workspace.get());
let rendererReport = null;

function rendererStatus() {
  return rendererReport
    ? { status: "reported", ...rendererReport, availabilityProbeInvokesBridge: false }
    : { status: "not_reported", reason: "Renderer has not reported for this load. Check its grant, loading, and errors; this is not evidence of API absence." };
}

function onRendererCall(method, args) {
  if (METHODS.includes(method)) return memoryJobs.call(method, args);
  if (method !== "reportRendererCapabilities") {
    throw Object.assign(new Error("Unknown diagnostic method"), { code: "INVALID_ARGUMENT" });
  }
  if (!args || typeof args !== "object" || Array.isArray(args) ||
      args.probeVersion !== manifest.version || args.rendererLoaded !== true ||
      Object.keys(args).some((key) => key !== "probeVersion" && !CAPABILITY_FIELDS.includes(key)) ||
      CAPABILITY_FIELDS.some((key) => typeof args[key] !== "boolean")) {
    throw Object.assign(new Error("Invalid renderer capability report"), { code: "INVALID_ARGUMENT" });
  }
  rendererReport = Object.fromEntries([
    ["probeVersion", manifest.version],
    ...CAPABILITY_FIELDS.map((key) => [key, args[key]]),
  ]);
  return { accepted: true };
}

async function inspectOperations() {
  const hostVersion = typeof pi.app?.getVersion === "function" ? await pi.app.getVersion() : "unknown";
  const base = {
    hostVersion, probeVersion: manifest.version, rendererProbe: rendererStatus(),
    lastMemoryTest: memoryJobs.status(), memoryModified: false,
  };
  if (typeof pi.desktop?.listOperations !== "function") {
    return { ...base, supported: false, reason: "This host does not expose desktop.listOperations to this plugin." };
  }
  const catalog = await pi.desktop.listOperations();
  if (!Array.isArray(catalog) || catalog.some((entry) =>
    !entry || typeof entry.id !== "string" || typeof entry.description !== "string" ||
    !["read", "write", "dangerous"].includes(entry.risk))) {
    throw new Error("Unexpected desktop operation catalog shape; no operation was invoked.");
  }
  const operations = catalog.map(({ id, description, risk }) => ({ id, description, risk }));
  return {
    ...base, supported: true, operationCount: operations.length,
    candidates: operations.filter(({ id, description }) => CANDIDATE_PATTERN.test(`${id} ${description}`)),
    operations,
    interpretation: "This inspection is read-only. Candidates are metadata matches, not proof of authorization. Any separately requested native test is reported in lastMemoryTest.",
  };
}

async function onLoad() {
  rendererReport = null;
  memoryJobs.reset();
  for (const definition of manifest.contributes.agentTools) {
    await pi.agent.registerTool({
      ...definition,
      execute: definition.name === "inspect_project_memory_api" ? inspectOperations : async (args) => {
        if (!rendererReport) throw new Error("Renderer is not ready; no test was queued");
        return memoryJobs.queue(args, definition.name === "write_test_project_memory");
      },
    });
  }
}

async function onUnload() {
  rendererReport = null;
  memoryJobs.reset();
  for (const definition of manifest.contributes.agentTools) await pi.agent.unregisterTool(definition.name);
}

module.exports = { onLoad, onUnload, onRendererCall };
