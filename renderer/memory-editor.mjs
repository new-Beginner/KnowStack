import { normalizePath, snapshot, entryStamp } from './native-memory.mjs';

const fail = code => Object.assign(new Error(code), { code });
const copy = entries => entries.map(({ id, title, content }) => ({ id, title, content }));
export const MEMORY_ERRORS = {
  BRIDGE_UNAVAILABLE: '宿主记忆接口不可用，请检查插件连接。',
  HOST_CALL_FAILED: '无法完成宿主操作，请检查连接后重新读取。',
  INVALID_PROJECT_LIST: '项目列表异常，未读取或修改记忆。',
  PROJECT_CHANGED: '项目已移除或文件夹归属已变化，请重新选择项目。',
  STALE_BASIS: '记忆已被其他窗口或 Agent 修改。草稿已保留，请重新读取后再编辑。',
  READ_BACK_MISMATCH: '保存后回读与提交内容不一致，请重新读取并核对，不要重复提交。',
  UNSTRUCTURED_MEMORY: '该项目含旧式正文，无法安全编辑，请使用宿主原生记忆界面处理。',
  NONCANONICAL_MEMORY: '记忆结构无法安全保留，请使用宿主原生记忆界面处理。',
  INVALID_MEMORY: '宿主返回了无效记忆，未修改内容。',
  INVALID_ENTRIES: '每条记忆须有正文，标题不能换行；条目 ID 不能重复。',
  UNLOADED: '插件已卸载，请重新打开。',
};

// Shared with the Agent bridge in this renderer, so manual and automatic writes do not overlap locally.
export function createMemoryAccess(bridge) {
  let tail = Promise.resolve(); let stopped = false;
  const run = task => {
    const pending = tail.then(() => { if (stopped) throw fail('UNLOADED'); return task(); });
    tail = pending.catch(() => {});
    return pending;
  };
  const call = async (key, input) => {
    if (stopped) throw fail('UNLOADED');
    const channel = bridge?.channels?.invoke?.[key];
    if (typeof channel !== 'string' || typeof bridge?.invoke !== 'function') throw fail('BRIDGE_UNAVAILABLE');
    let result;
    try { result = await bridge.invoke(channel, input); } catch { throw fail('HOST_CALL_FAILED'); }
    if (stopped) throw fail('UNLOADED');
    if (result?.ok !== true || !Object.hasOwn(result, 'data')) throw fail('HOST_CALL_FAILED');
    return result.data;
  };
  const projects = async () => {
    const value = await call('projectGroupList');
    if (!Array.isArray(value?.groups)) throw fail('INVALID_PROJECT_LIST');
    const seen = new Set();
    const result = [];
    for (const group of value.groups) {
      if (group?.remote || group?.primaryPath?.startsWith('remote-project:')) continue;
      if (!group || !Array.isArray(group.roots) || !group.roots.length) throw fail('INVALID_PROJECT_LIST');
      const paths = group.roots.map(root => normalizePath(root?.path)).sort();
      if (paths.some(path => !path || path.startsWith('remote-project:') || seen.has(path))) throw fail('INVALID_PROJECT_LIST');
      paths.forEach(path => seen.add(path));
      if (new Set(paths).size !== paths.length || (group.legacy !== true && (typeof group.id !== 'string' || !group.id))) throw fail('INVALID_PROJECT_LIST');
      const path = paths.includes(normalizePath(group.primaryPath)) ? normalizePath(group.primaryPath) : paths[0];
      const key = group.legacy === true ? `legacy:${path}` : `group:${group.id}`;
      if (result.some(project => project.key === key)) throw fail('INVALID_PROJECT_LIST');
      result.push({ key, name: group.name?.trim() || path.split('/').at(-1) || path, path,
        binding: JSON.stringify([key, paths]), input: group.legacy === true ? { projectPath: path } : { groupId: group.id },
        get: group.legacy === true ? 'projectMemoryGet' : 'projectGroupMemoryGet',
        save: group.legacy === true ? 'projectMemorySave' : 'projectGroupMemorySave' });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.path.localeCompare(b.path));
  };
  const resolve = async project => {
    const current = (await projects()).find(item => item.key === project.key);
    if (!current || current.binding !== project.binding) throw fail('PROJECT_CHANGED');
    return current;
  };
  return {
    run, projects: () => run(projects),
    read: project => run(async () => {
      const target = await resolve(project);
      const value = snapshot(await call(target.get, target.input));
      await resolve(target);
      return { project: target, ...value };
    }),
    save: (basis, draft) => {
      // Freeze the submitted payload before waiting on any other work.
      const entries = Array.isArray(draft) ? copy(draft) : null;
      return run(async () => {
        let attempted = false;
        try {
          if (!entries || entries.length > 2000 || entries.some(e =>
            ['id', 'title', 'content'].some(key => typeof e[key] !== 'string') || !e.id.trim() || !e.content.trim() || /[\r\n]/.test(e.title)) ||
            new Set(entries.map(e => e.id)).size !== entries.length) throw fail('INVALID_ENTRIES');
          const clean = entries.map(e => ({ id: e.id.trim(), title: e.title.trim(), content: e.content.trim() }));
          if (new Set(clean.map(e => e.id)).size !== clean.length) throw fail('INVALID_ENTRIES');
          const target = await resolve(basis.project);
          const current = snapshot(await call(target.get, target.input));
          if (current.stamp !== basis.stamp) throw fail('STALE_BASIS');
          await resolve(target);
          // Narrow the non-atomic whole-list save window with a second preflight read.
          if (snapshot(await call(target.get, target.input)).stamp !== basis.stamp) throw fail('STALE_BASIS');
          attempted = true;
          await call(target.save, { ...target.input, entries: clean });
          const after = snapshot(await call(target.get, target.input));
          await resolve(target);
          if (entryStamp(after.entries) !== entryStamp(clean)) throw fail('READ_BACK_MISMATCH');
          return { status: 'saved', basis: { project: target, ...after } };
        } catch (error) {
          return { status: attempted ? 'unverified' : 'failed', errorCode: MEMORY_ERRORS[error?.code] ? error.code : 'HOST_CALL_FAILED' };
        }
      });
    },
    stop() { stopped = true; },
  };
}

export function createMemoryEditor(access) {
  let state = { projects: [], projectKey: '', entries: [], loaded: false, busy: false, dirty: false, needsRefresh: false, error: '', message: '' };
  let basis = null; let stopped = false;
  const listeners = new Set();
  const publish = patch => { if (stopped) return; state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  const load = async key => {
    if (stopped || state.busy) return;
    publish({ busy: true, error: '', message: '' });
    try {
      const projects = await access.projects();
      const target = projects.find(p => p.key === key) ?? (!key ? projects[0] : null);
      if (key && !target) throw fail('PROJECT_CHANGED');
      const next = target ? await access.read(target) : null;
      basis = next;
      publish({ projects, projectKey: target?.key ?? '', entries: copy(next?.entries ?? []), loaded: true, dirty: false, needsRefresh: false });
    } catch (error) { publish({ error: MEMORY_ERRORS[error?.code] ?? MEMORY_ERRORS.HOST_CALL_FAILED, needsRefresh: true }); }
    finally { publish({ busy: false }); }
  };
  const edit = entries => {
    if (stopped || state.busy || !state.loaded || !basis) return;
    publish({ entries, dirty: entryStamp(entries) !== entryStamp(basis.entries), message: '', error: state.needsRefresh ? state.error : '' });
  };
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    load,
    add() { if (state.entries.length < 2000) edit([...state.entries, { id: `knowstack-manual-${globalThis.crypto.randomUUID()}`, title: '', content: '' }]); },
    update(id, field, value) { if (['title', 'content'].includes(field)) edit(state.entries.map(e => e.id === id ? { ...e, [field]: value } : e)); },
    remove(id) { edit(state.entries.filter(e => e.id !== id)); },
    async save() {
      if (stopped || state.busy || !state.dirty || !basis || state.needsRefresh) return;
      publish({ busy: true, error: '', message: '' });
      try {
        const result = await access.save(basis, state.entries);
        if (result.status === 'saved') {
          basis = result.basis;
          publish({ entries: copy(basis.entries), dirty: false, message: '已保存记忆 · 回读验证成功' });
        } else publish({ error: `${MEMORY_ERRORS[result.errorCode] ?? MEMORY_ERRORS.HOST_CALL_FAILED}${result.status === 'unverified' ? ' 保存可能已发生，结果待确认。' : ''}`, needsRefresh: result.errorCode !== 'INVALID_ENTRIES' });
      } catch { publish({ error: '保存结果待确认，请重新读取并核对，不要重复提交。', needsRefresh: true }); }
      finally { publish({ busy: false }); }
    },
    stop() { stopped = true; listeners.clear(); },
  };
}
