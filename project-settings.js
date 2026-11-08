'use strict';

const pathKey = value => {
  if (typeof value !== 'string') return '';
  const p = value.replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(p) ? p.toLowerCase() : p;
};
const LIMIT = 200;

function parseModes(raw) {
  const parsed = JSON.parse(raw || '{}');
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).length > LIMIT ||
      Object.values(parsed).some(value => typeof value !== 'boolean')) throw new Error('Invalid project modes');
  const modes = Object.create(null);
  for (const [path, value] of Object.entries(parsed)) {
    const key = pathKey(path);
    if (!key || (Object.hasOwn(modes, key) && modes[key] !== value)) throw new Error('Invalid project modes');
    modes[key] = value;
  }
  return modes;
}

function validateProjects(projects) {
  if (!Array.isArray(projects) || projects.length > LIMIT) throw new Error('Invalid project list');
  const seen = new Set();
  return projects.map(project => {
    const path = pathKey(project?.path);
    const paths = project.paths === undefined ? [path] : project.paths?.map?.(pathKey);
    if (!path || typeof project.name !== 'string' || !project.name.trim() || !Array.isArray(paths) || !paths.length || !paths.includes(path) || paths.some(key => !key || seen.has(key)) || new Set(paths).size !== paths.length) throw new Error('Invalid project list');
    for (const key of paths) seen.add(key);
    if (seen.size > LIMIT) throw new Error('Project mode limit reached');
    return { path, paths, name: project.name.trim() };
  });
}

function createProjectSettings({ getSettings, setSettings }) {
  let queue = Promise.resolve();
  let projects = null;
  const serialize = work => {
    const pending = queue.then(work);
    queue = pending.catch(() => {});
    return pending;
  };
  const config = async () => {
    const current = await getSettings();
    return {
      autoSave: current?.autoSave !== false,
      autoDelete: current?.autoDelete === true,
      modes: parseModes(current?.projectModes),
      deleteModes: parseModes(current?.projectDeleteModes),
    };
  };
  const view = current => ({
    autoSave: current.autoSave,
    autoDelete: current.autoDelete,
    projects: (projects ?? []).map(project => ({
      ...project,
      autoSave: Object.hasOwn(current.modes, project.path) ? current.modes[project.path] : current.autoSave,
      autoDelete: Object.hasOwn(current.deleteModes, project.path) ? current.deleteModes[project.path] : current.autoDelete,
    })),
  });
  async function writeModes(current, modes, deleteModes) {
    const patch = {};
    if (JSON.stringify(current.modes) !== JSON.stringify(modes)) patch.projectModes = JSON.stringify(modes);
    if (JSON.stringify(current.deleteModes) !== JSON.stringify(deleteModes)) patch.projectDeleteModes = JSON.stringify(deleteModes);
    if (Object.keys(patch).length) await setSettings(patch);
    return { ...current, modes, deleteModes };
  }
  const patchModeInternal = async (path, patch, requireKnown = false) => {
    const key = pathKey(path);
    const project = projects?.find(p => p.paths.includes(key));
    if (!key || (requireKnown && !project)) throw new Error('Project is unavailable');
    if (!patch || typeof patch !== 'object') throw new Error('Invalid project mode');
    const { autoSave, autoDelete } = patch;
    if (autoSave === undefined && autoDelete === undefined) throw new Error('Invalid project mode');
    if (autoSave !== undefined && typeof autoSave !== 'boolean') throw new Error('Invalid project mode');
    if (autoDelete !== undefined && typeof autoDelete !== 'boolean') throw new Error('Invalid project mode');

    const current = await config();
    const modes = Object.assign(Object.create(null), current.modes);
    const deleteModes = Object.assign(Object.create(null), current.deleteModes);
    const targets = project?.paths ?? [key];
    if (autoSave !== undefined) for (const p of targets) modes[p] = autoSave;
    if (autoDelete !== undefined) for (const p of targets) deleteModes[p] = autoDelete;
    if (Object.keys(modes).length > LIMIT || Object.keys(deleteModes).length > LIMIT) throw new Error('Project mode limit reached');
    await writeModes(current, modes, deleteModes);
    return {
      autoSave: Object.hasOwn(modes, key) ? modes[key] : current.autoSave,
      autoDelete: Object.hasOwn(deleteModes, key) ? deleteModes[key] : current.autoDelete,
    };
  };
  return {
    get: () => serialize(async () => view(await config())),
    mode: path => serialize(async () => {
      const current = await config(); const key = pathKey(path);
      return {
        autoSave: Object.hasOwn(current.modes, key) ? current.modes[key] : current.autoSave,
        autoDelete: Object.hasOwn(current.deleteModes, key) ? current.deleteModes[key] : current.autoDelete,
      };
    }),
    sync: input => serialize(async () => {
      const scanned = validateProjects(input);
      const current = await config();
      const modes = Object.create(null);
      const deleteModes = Object.create(null);
      for (const project of scanned) {
        const existingSave = [project.path, ...project.paths].find(path => Object.hasOwn(current.modes, path));
        const saveValue = existingSave === undefined ? current.autoSave : current.modes[existingSave];
        for (const path of project.paths) modes[path] = saveValue;

        const existingDelete = [project.path, ...project.paths].find(path => Object.hasOwn(current.deleteModes, path));
        const deleteValue = existingDelete === undefined ? current.autoDelete : current.deleteModes[existingDelete];
        for (const path of project.paths) deleteModes[path] = deleteValue;
      }
      const next = await writeModes(current, modes, deleteModes);
      projects = scanned;
      return view(next);
    }),
    setMode: (path, autoSave, requireKnown = false, autoDelete) => serialize(async () => {
      if (typeof autoSave !== 'boolean') throw new Error('Invalid project mode');
      const patch = { autoSave };
      if (autoDelete !== undefined) {
        if (typeof autoDelete !== 'boolean') throw new Error('Invalid project mode');
        patch.autoDelete = autoDelete;
      }
      return patchModeInternal(path, patch, requireKnown);
    }),
    patchMode: (path, patch, requireKnown = false) => serialize(async () => {
      return patchModeInternal(path, patch, requireKnown);
    }),
    setDefault: (value, key = 'autoSave') => serialize(async () => {
      const patch = {};
      if (typeof value === 'object' && value !== null) {
        const { autoSave, autoDelete } = value;
        if (autoSave === undefined && autoDelete === undefined) throw new Error('Invalid default mode');
        if (autoSave !== undefined && typeof autoSave !== 'boolean') throw new Error('Invalid default mode');
        if (autoDelete !== undefined && typeof autoDelete !== 'boolean') throw new Error('Invalid default mode');
        if (autoSave !== undefined) patch.autoSave = autoSave;
        if (autoDelete !== undefined) patch.autoDelete = autoDelete;
      } else if (typeof value === 'boolean') {
        if (key === 'autoSave') patch.autoSave = value;
        else if (key === 'autoDelete') patch.autoDelete = value;
        else throw new Error('Invalid default mode');
      } else {
        throw new Error('Invalid default mode');
      }
      const current = await config();
      const toWrite = {};
      if (patch.autoSave !== undefined && current.autoSave !== patch.autoSave) toWrite.autoSave = patch.autoSave;
      if (patch.autoDelete !== undefined && current.autoDelete !== patch.autoDelete) toWrite.autoDelete = patch.autoDelete;
      if (Object.keys(toWrite).length) await setSettings(toWrite);
      return view({ ...current, ...patch });
    }),
    setDeleteDefault: autoDelete => serialize(async () => {
      if (typeof autoDelete !== 'boolean') throw new Error('Invalid default mode');
      const current = await config();
      if (current.autoDelete !== autoDelete) await setSettings({ autoDelete });
      return view({ ...current, autoDelete });
    }),
  };
}

module.exports = { createProjectSettings, parseModes, validateProjects, pathKey };
