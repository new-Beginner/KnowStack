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
    return { autoSave: current?.autoSave !== false, modes: parseModes(current?.projectModes) };
  };
  const view = current => ({
    autoSave: current.autoSave,
    projects: (projects ?? []).map(project => ({ ...project, autoSave: Object.hasOwn(current.modes, project.path) ? current.modes[project.path] : current.autoSave })),
  });
  async function writeModes(current, modes) {
    if (JSON.stringify(current.modes) !== JSON.stringify(modes)) await setSettings({ projectModes: JSON.stringify(modes) });
    return { ...current, modes };
  }
  return {
    get: () => serialize(async () => view(await config())),
    mode: path => serialize(async () => {
      const current = await config(); const key = pathKey(path);
      return { autoSave: Object.hasOwn(current.modes, key) ? current.modes[key] : current.autoSave };
    }),
    sync: input => serialize(async () => {
      const scanned = validateProjects(input);
      const current = await config();
      const modes = Object.create(null);
      for (const project of scanned) {
        const existing = [project.path, ...project.paths].find(path => Object.hasOwn(current.modes, path));
        const value = existing === undefined ? current.autoSave : current.modes[existing];
        for (const path of project.paths) modes[path] = value;
      }
      const next = await writeModes(current, modes);
      projects = scanned;
      return view(next);
    }),
    setMode: (path, autoSave, requireKnown = false) => serialize(async () => {
      const key = pathKey(path);
      const project = projects?.find(project => project.paths.includes(key));
      if (!key || typeof autoSave !== 'boolean' || (requireKnown && !project)) throw new Error('Project is unavailable');
      const current = await config();
      const modes = Object.assign(Object.create(null), current.modes);
      for (const path of project?.paths ?? [key]) modes[path] = autoSave;
      if (Object.keys(modes).length > LIMIT) throw new Error('Project mode limit reached');
      await writeModes(current, modes);
      return { autoSave };
    }),
    setDefault: autoSave => serialize(async () => {
      if (typeof autoSave !== 'boolean') throw new Error('Invalid default mode');
      const current = await config();
      if (current.autoSave !== autoSave) await setSettings({ autoSave });
      return view({ ...current, autoSave });
    }),
  };
}

module.exports = { createProjectSettings, parseModes, validateProjects, pathKey };
