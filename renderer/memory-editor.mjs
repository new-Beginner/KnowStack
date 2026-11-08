import { normalizePath, snapshot, entryStamp } from './native-memory.mjs';
import { callHost, HOST_CODES } from './host-call.mjs';

const fail = code => Object.assign(new Error(code), { code });
const copy = entries => entries.map(({ id, title, content }) => ({ id, title, content }));
export const MEMORY_ERRORS = {
  BRIDGE_UNAVAILABLE: '宿主记忆接口不可用，请检查插件连接。',
  PANEL_CONTEXT_UNAVAILABLE: '无法识别此面板的当前项目，请检查宿主兼容性后重新读取。未选择其他项目。',
  PANEL_CONTEXT_CHANGING: '面板正在切换会话或项目，请稍后重新读取。',
  NO_PANEL_PROJECT: '此面板当前没有本地项目，请先打开一个项目。',
  REMOTE_PROJECT: '此面板属于远程项目，本版不读写远程项目记忆。',
  PANEL_CONTEXT_CHANGED: '面板项目已变化。旧项目草稿已保留；请重新读取当前项目后再编辑。',
  HOST_CALL_FAILED: '无法完成宿主操作，请检查连接后重新读取。',
  INVALID_PROJECT_LIST: '项目列表异常，未读取或修改记忆。',
  PROJECT_CHANGED: '项目已移除或文件夹归属已变化，请重新选择项目。',
  STALE_BASIS: '记忆已被其他窗口或 Agent 修改。草稿已保留，请重新读取后再编辑。',
  READ_BACK_MISMATCH: '保存后回读与提交内容不一致，请重新读取并核对，不要重复提交。',
  UNSTRUCTURED_MEMORY: '该项目含旧式正文，无法安全编辑，请使用宿主原生记忆界面处理。',
  NONCANONICAL_MEMORY: '记忆结构无法安全保留，请使用宿主原生记忆界面处理。',
  INVALID_MEMORY: '宿主返回了无效记忆，未修改内容。',
  INVALID_ENTRIES: '每条记忆须有正文，标题不能换行；条目 ID 不能重复。',
  REMINDER_CHANGED: '提醒对应的记忆或项目已变化，请关闭此窗口并重新检查。未定位或修改其他条目。',
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
  const call = (key, input) => callHost(bridge, key, input, { guard: () => { if (stopped) throw fail('UNLOADED'); } });
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
      result.push({ key, name: group.name?.trim() || path.split('/').at(-1) || path, path, paths,
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
  const verifySelection = async selection => {
    if (!normalizePath(selection?.projectPath)) throw fail('NO_PANEL_PROJECT');
    if (selection.sessionId) {
      const value = await call('sessionGet', { id: selection.sessionId, messageLimit: 1, contentLimit: 1 });
      const session = value?.session;
      if (!session || session.id !== selection.sessionId || session.source === 'remote' || session.remoteHostKey || session.remoteWorkspace ||
          normalizePath(session.projectPath) !== normalizePath(selection.projectPath)) throw fail('PANEL_CONTEXT_CHANGED');
    }
  };
  return {
    run, projects: () => run(projects),
    resolveSession: sessionId => run(async () => {
      if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(sessionId) || sessionId.includes('..')) throw fail('PANEL_CONTEXT_UNAVAILABLE');
      const value = await call('sessionGet', { id: sessionId, messageLimit: 1, contentLimit: 1 });
      const session = value?.session;
      if (!session || session.id !== sessionId) throw fail('PANEL_CONTEXT_UNAVAILABLE');
      if (session.source === 'remote' || session.remoteHostKey || session.remoteWorkspace || session.projectPath?.startsWith('remote-project:')) throw fail('REMOTE_PROJECT');
      if (!session.projectPath) throw fail('NO_PANEL_PROJECT');
      return { sessionId, projectPath: normalizePath(session.projectPath) };
    }),
    current: selection => run(async () => {
      await verifySelection(selection);
      const all = await projects();
      const matches = all.filter(project => project.paths.includes(normalizePath(selection.projectPath)));
      if (matches.length !== 1) throw fail('PROJECT_CHANGED');
      return { projects: all, project: matches[0] };
    }),
    read: project => run(async () => {
      const target = await resolve(project);
      const value = snapshot(await call(target.get, target.input));
      await resolve(target);
      return { project: target, ...value };
    }),
    save: (basis, draft, options = {}) => {
      // Freeze the submitted payload before waiting on any other work.
      const entries = Array.isArray(draft) ? copy(draft) : null;
      return run(async () => {
        let attempted = false;
        try {
          const guard = () => { if (options.isCurrent && !options.isCurrent()) throw fail('PANEL_CONTEXT_CHANGED'); };
          guard();
          if (options.selection) await verifySelection(options.selection);
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
          if (options.selection) await verifySelection(options.selection);
          guard();
          attempted = true;
          await call(target.save, { ...target.input, entries: clean });
          const after = snapshot(await call(target.get, target.input));
          await resolve(target);
          if (entryStamp(after.entries) !== entryStamp(clean)) throw fail('READ_BACK_MISMATCH');
          return { status: 'saved', basis: { project: target, ...after } };
        } catch (error) {
          return { status: attempted ? 'unverified' : 'failed', errorCode: MEMORY_ERRORS[error?.code] || HOST_CODES.has(error?.code) ? error.code : 'HOST_CALL_FAILED', errorStep: error?.step };
        }
      });
    },
    stop() { stopped = true; },
  };
}

function memoryMessage(error) {
  const code = error?.code;
  const step = ['sessionGet','projectGroupList','projectGroupMemoryGet','projectMemoryGet','projectGroupMemorySave','projectMemorySave'].includes(error?.step) ? error.step : '';
  return (MEMORY_ERRORS[code] ?? MEMORY_ERRORS.HOST_CALL_FAILED) + ((HOST_CODES.has(code) || step) ? ` [${HOST_CODES.has(code) ? code : 'HOST_CALL_FAILED'}${step ? ` · ${step}` : ''}]` : '');
}
export function createMemoryEditor(access, { context, reminder } = {}) {
  let state = { projects: [], projectKey: '', entries: [], loaded: false, busy: false, dirty: false, needsRefresh: false, error: '', message: '', following: !!context, pinned: !!reminder, highlightId: reminder?.memory?.id };
  let basis = null; let selection = null; let stopped = false; let pendingFollow = false; let checkedReminder = false;
  const listeners = new Set();
  const publish = patch => { if (stopped) return; state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  const isCurrent = selected => {
    if (!context) return true;
    try {
      const current = context.get();
      return !!selected && current.projectPath === selected.projectPath &&
        (selected.contextVersion === undefined || current.contextVersion === selected.contextVersion);
    } catch { return false; }
  };
  const load = async key => {
    if (stopped || state.busy) return;
    publish({ busy: true, error: '', message: '' });
    try {
      const selected = context ? await (context.ready ? context.ready() : context.get()) : undefined;
      const current = context ? await access.current(selected) : null;
      const projects = current?.projects ?? await access.projects();
      const target = current?.project ?? projects.find(p => p.key === key) ?? (!context && !key ? projects[0] : null);
      if ((context || key) && !target) throw fail('PROJECT_CHANGED');
      if (reminder && target?.key !== reminder.projectKey) throw fail('REMINDER_CHANGED');
      const next = target ? await access.read(target) : null;
      if (stopped) return;
      if (reminder && (await access.current(selected)).project.key !== reminder.projectKey) throw fail('REMINDER_CHANGED');
      if (!isCurrent(selected)) throw fail('PANEL_CONTEXT_CHANGED');
      if (reminder && !checkedReminder) {
        const entry = next?.entries.find(e => e.id === reminder.memory.id);
        if (target?.key !== reminder.projectKey || !entry || entry.title !== reminder.memory.title || entry.content !== reminder.memory.content) throw fail('REMINDER_CHANGED');
        checkedReminder = true;
      }
      basis = next; selection = selected;
      publish({ projects, projectKey: target?.key ?? '', entries: copy(next?.entries ?? []), loaded: true, dirty: false, needsRefresh: false });
    } catch (error) {
      const cleared = context && !state.dirty && !isCurrent(selection) ? { loaded: false, entries: [], projectKey: '' } : {};
      publish({ ...cleared, error: memoryMessage(error), needsRefresh: true });
    } finally {
      publish({ busy: false });
      if (pendingFollow) { pendingFollow = false; follow(); }
    }
  };
  function follow() {
    if (stopped || !context) return;
    if (state.busy) { pendingFollow = true; return; }
    if (isCurrent(selection) && state.loaded) return;
    if (state.dirty) publish({ needsRefresh: true, error: MEMORY_ERRORS.PANEL_CONTEXT_CHANGED, message: '' });
    else void load();
  }
  const unsubscribeContext = context?.subscribe(follow);
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
      if (!isCurrent(selection)) { follow(); return; }
      publish({ busy: true, error: '', message: '' });
      try {
        const result = await access.save(basis, state.entries, context ? { selection, isCurrent: () => !stopped && isCurrent(selection) } : {});
        if (result.status === 'saved') {
          basis = result.basis;
          publish({ entries: copy(basis.entries), dirty: false, message: '已保存记忆 · 回读验证成功' });
        } else publish({ error: `${memoryMessage({code:result.errorCode,step:result.errorStep})}${result.status === 'unverified' ? ' 保存可能已发生，结果待确认。' : ''}`, needsRefresh: result.errorCode !== 'INVALID_ENTRIES' });
      } catch { publish({ error: '保存结果待确认，请重新读取并核对，不要重复提交。', needsRefresh: true }); }
      finally {
        publish({ busy: false });
        if (pendingFollow) { pendingFollow = false; follow(); }
      }
    },
    stop() { stopped = true; unsubscribeContext?.(); listeners.clear(); },
  };
}
