"use strict";

const TOOL_NAME = "inspect_project_memory_api";
const CANDIDATE_PATTERN = /memory|remember|context|knowledge|project|记忆|上下文|知识|项目/i;

async function inspectOperations() {
  const hostVersion = typeof pi.app?.getVersion === "function"
    ? await pi.app.getVersion()
    : "unknown";

  if (typeof pi.desktop?.listOperations !== "function") {
    return {
      hostVersion,
      supported: false,
      reason: "This host does not expose desktop.listOperations to this plugin.",
      memoryModified: false,
    };
  }

  const catalog = await pi.desktop.listOperations();
  if (!Array.isArray(catalog) || catalog.some((entry) =>
    !entry || typeof entry.id !== "string" || typeof entry.description !== "string" ||
    !["read", "write", "dangerous"].includes(entry.risk))) {
    throw new Error("Unexpected desktop operation catalog shape; no operation was invoked.");
  }

  const operations = catalog.map(({ id, description, risk }) => ({ id, description, risk }));
  return {
    hostVersion,
    supported: true,
    operationCount: operations.length,
    candidates: operations.filter(({ id, description }) =>
      CANDIDATE_PATTERN.test(`${id} ${description}`)),
    operations,
    memoryModified: false,
    interpretation: "Candidates are metadata matches only, not proof of project-memory read/write support. No operation was invoked.",
  };
}

async function onLoad() {
  await pi.agent.registerTool({
    name: TOOL_NAME,
    description: "Read-only: list reviewed PI-Desktop host operations and identify project or memory candidates. Never invoke an operation or modify memory.",
    risk: "low",
    schema: { type: "object", properties: {}, additionalProperties: false },
    execute: inspectOperations,
  });
}

async function onUnload() {
  await pi.agent.unregisterTool(TOOL_NAME);
}

module.exports = { onLoad, onUnload };
