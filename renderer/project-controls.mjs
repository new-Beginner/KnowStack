import { normalizePath } from './native-memory.mjs';

// One fixed read-only channel. A failed/malformed scan must never become an empty list.
export async function scanProjects(bridge) {
  const channel = bridge?.channels?.invoke?.projectGroupList;
  if (typeof channel !== 'string' || typeof bridge?.invoke !== 'function') throw new Error('PROJECT_LIST_UNAVAILABLE');
  const response = await bridge.invoke(channel);
  if (response?.ok !== true || !Array.isArray(response.data?.groups)) throw new Error('PROJECT_LIST_UNAVAILABLE');
  const projects = []; const seen = new Set();
  for (const group of response.data.groups) {
    if (!group || typeof group !== 'object') throw new Error('INVALID_PROJECT_LIST');
    if (group.remote || (typeof group.primaryPath === 'string' && group.primaryPath.startsWith('remote-project:'))) continue;
    if (!Array.isArray(group.roots) || !group.roots.length) throw new Error('INVALID_PROJECT_LIST');
    const paths = group.roots.map(root => normalizePath(root?.path));
    for (const path of paths) {
      if (!path || path.startsWith('remote-project:')) throw new Error('INVALID_PROJECT_LIST');
      if (seen.has(path)) throw new Error('AMBIGUOUS_PROJECT_LIST');
      seen.add(path);
    }
    const primary = normalizePath(group.primaryPath);
    const path = paths.includes(primary) ? primary : paths[0];
    const name = typeof group.name === 'string' && group.name.trim() ? group.name.trim() : path.split('/').filter(Boolean).at(-1) || path;
    projects.push({ name, path, paths });
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.path.localeCompare(b.path));
}

export function createProjectController({ bridge, call, schedule = setInterval, unschedule = clearInterval }) {
  let stopped = false; let pending = null; let changing = false;
  let state = { autoSave: true, projects: [], loaded: false, busy: false, error: '', message: '' };
  const listeners = new Set();
  const publish = patch => {
    if (stopped) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const refresh = () => {
    if (stopped) return Promise.reject(new Error('Plugin unloaded'));
    if (pending) return pending;
    pending = (async () => {
      try {
        const projects = await scanProjects(bridge);
        if (stopped) return;
        const value = await call('projects', { action: 'sync', projects });
        publish({ ...value, loaded: true, error: '' });
        return value;
      } catch {
        publish({ error: '无法读取或同步项目列表。请检查宿主连接后点击“刷新”；现有设置未被清空。' });
        throw new Error('PROJECT_SYNC_FAILED');
      } finally { pending = null; }
    })();
    return pending;
  };
  const change = async args => {
    if (stopped || changing) return;
    changing = true; publish({ busy: true, error: '', message: '' });
    try {
      // Also validates that a project still exists before accepting a UI toggle.
      await refresh();
      if (stopped) return;
      const value = await call('projects', args);
      publish({ ...value, loaded: true, message: '已保存' });
    } catch {
      publish({ error: '设置未能确认保存。请刷新核对后再操作。', message: '' });
    } finally { changing = false; publish({ busy: false }); }
  };
  const timer = schedule(() => { if (!changing) void refresh().catch(() => {}); }, 2000);
  timer?.unref?.();
  let unsubscribe;
  const changed = bridge?.channels?.event?.sessionsChanged;
  if (changed && typeof bridge.on === 'function') unsubscribe = bridge.on(changed, () => { if (!changing) void refresh().catch(() => {}); });
  void refresh().catch(() => {});
  return {
    refresh,
    getState: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    setDefault: autoSave => change({ action: 'default', autoSave }),
    setProject: (path, autoSave) => change({ action: 'set', path, autoSave }),
    stop() { stopped = true; unschedule(timer); unsubscribe?.(); listeners.clear(); },
  };
}
