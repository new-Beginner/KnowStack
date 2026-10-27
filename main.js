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
  const handlers = { read_memory: service.read, remember: service.remember, report_outdated_memory: service.reportOutdated };
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
module.exports = { onLoad, onUnload, onRendererCall };
