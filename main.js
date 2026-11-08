'use strict';
const manifest = require('./manifest.json');
const { createService } = require('./memory-service.js');
let service;

async function onLoad() {
  service?.stop();
  service = createService({
    getSettings: () => pi.plugin.getSettings(),
    setSettings: partial => pi.plugin.setSettings(partial),
  });
  const handlers = { read_memory: service.read, remember: service.remember, report_outdated_memory: service.reportOutdated, update_memory: service.update, delete_memory: service.delete };
  for (const definition of manifest.contributes.agentTools) {
    const execute = handlers[definition.name];
    if (typeof execute !== 'function') throw new Error('Unknown KnowStack tool');
    await pi.agent.registerTool({ ...definition, execute });
  }
}
async function onUnload() {
  service?.stop(); service = null;
  for (const { name } of manifest.contributes.agentTools) await pi.agent.unregisterTool(name);
}
async function onRendererCall(method, args) {
  if (!service) throw new Error('KnowStack is not loaded');
  return service.renderer(method, args);
}
async function onPanelInvoke(channel, args = {}) {
  if (!service || !['memory.context','memory.editor','memory.mode'].includes(channel)) throw new Error('Unknown view request');
  const active = await pi.session.getActive();
  if (!active?.sessionId || !active.projectPath || active.source === 'remote') throw new Error('NO_PANEL_PROJECT');
  if (channel === 'memory.context') return { sessionId: active.sessionId, projectPath: active.projectPath };
  if (args.sessionId !== active.sessionId) throw new Error('PANEL_CONTEXT_CHANGED');
  if (channel === 'memory.mode') return service.mode({ ...args, sessionId: active.sessionId });
  return service.editor(args, { sessionId: active.sessionId, turnId: `editor:${active.sessionId}` });
}
module.exports = { onLoad, onUnload, onRendererCall, onPanelInvoke };
