import React from 'react';
import { runNativeJob } from './native-memory.mjs';
import { unwrapResult, STATUS_LABELS } from './receipt-state.mjs';
import { createProjectController } from './project-controls.mjs';
import { installSettingsEntry, SETTINGS_CSS } from './settings-ui.mjs';
import { createMemoryAccess } from './memory-editor.mjs';
import { installMemoryEntry, MEMORY_CSS } from './memory-ui.mjs';
import { makeOutdatedCard, makeOutdatedEntry, createReminderEditor, OUTDATED_CSS } from './outdated-ui.mjs';
import { THEME_CSS } from './theme.mjs';
const VERSION = '0.6.3';
const h = React.createElement;
let runtime;

export function makeCard(pi, call, projectController) {
  return function MemoryCard(props) {
    const initial = unwrapResult(props.toolResult);
    const [state, setState] = React.useState(initial);
    const [mode, setMode] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [modeError, setModeError] = React.useState('');
    const batchId = initial?.batchId;
    React.useEffect(() => { setState(initial); }, [props.toolResult]);
    React.useEffect(() => {
      let cancelled = false;
      setMode(null); setModeError('');
      if (props.toolStatus !== 'success' || !props.sessionId || (initial?.sessionId && initial.sessionId !== props.sessionId)) return () => { cancelled = true; };
      const refresh = () => call('mode', { sessionId: props.sessionId, action: 'get' }).then(v => {
        if (!cancelled) { setMode(typeof v?.autoSave === 'boolean' ? v.autoSave : null); setModeError(typeof v?.autoSave === 'boolean' ? '' : '无法核对项目开关，请重新读取。'); }
      }).catch(() => { if (!cancelled) { setMode(null); setModeError('无法读取项目开关，请检查会话归属和权限。'); } });
      void refresh();
      let signature;
      const unsubscribe = projectController?.subscribe(value => {
        const next = JSON.stringify([value.autoSave, value.projects]);
        if (signature !== undefined && signature !== next) void refresh();
        signature = next;
      });
      return () => { cancelled = true; unsubscribe?.(); };
    }, [props.sessionId, props.toolStatus, initial?.sessionId]);
    React.useEffect(() => {
      if (!batchId || !['awaiting_review', 'saving'].includes(state?.status)) return;
      let cancelled = false;
      const refresh = async () => {
        try { const value = await call('review', { batchId, sessionId: props.sessionId, action: 'get' }); if (!cancelled) setState(value); }
        catch { if (!cancelled) { setState({ status: 'expired', saved: [] }); setError('审核请求已失效；重载不会自动补写。'); } }
      };
      const timer = setInterval(refresh, 1000);
      return () => { cancelled = true; clearInterval(timer); };
    }, [batchId, props.sessionId, state?.status]);
    const act = async action => {
      if (busy) return;
      setBusy(true); setError('');
      try { setState(await call('review', { batchId, sessionId: props.sessionId, action })); }
      catch { setError('操作未确认，请检查原生记忆后再决定；不要重复提交。'); }
      finally { setBusy(false); }
    };
    const toggle = async () => {
      if (busy || mode === null) return;
      setBusy(true); setError('');
      try { setMode((await call('mode', { sessionId: props.sessionId, action: 'set', autoSave: !mode })).autoSave); }
      catch { setError('开关未能保存；当前模式没有确认改变。'); }
      finally { setBusy(false); }
    };
    if (initial?.sessionId && initial.sessionId !== props.sessionId) return h('p', { role: 'alert' }, '记忆结果与当前会话不匹配。');
    if (props.toolStatus === 'running') return h('div', { className: 'knowstack-memory', role: 'status' }, '知栈：正在核对原生项目记忆…');
    if (props.toolStatus === 'error') return h('div', { className: 'knowstack-memory', role: 'alert' }, '知栈：操作未完成；没有成功回执，请勿重复写入。');
    const data = state ?? initial;
    if (!data || (data.status === 'skipped' && !(data.skipped ?? []).some(x => x.reason === 'existing_topic'))) return null;
    const items = data.status === 'awaiting_review' ? data.items : data.saved ?? [];
    return h('section', { className: 'knowstack-memory', 'aria-label': '知栈项目记忆' },
      h('div', { className: 'knowstack-head' },
        h('strong', null, '知栈'),
        h('span', { role: 'status', 'data-state': data.status }, STATUS_LABELS[data.status] ?? '操作状态待确认')),
      data.status === 'read' ? h('p', null, `已读取 ${data.entries?.length ?? 0} 条；只提炼尚未被覆盖的新结论。`) : null,
      ...items.map((item, index) => h('div', { className: 'knowstack-item', key: item.id ?? index }, h('strong', null, item.title), h('p', null, item.content))),
      (data.skipped ?? []).some(x => x.reason === 'existing_topic') ? h('p', null, '已有同主题记忆。事实变化请按原 ID 修改，不要追加冲突条目。') : null,
      data.status === 'updated' ? h('p', null, `已更新 ${data.updated?.length ?? 0} 条原有记忆，ID 保持不变。`) : null,
      data.status === 'deleted' ? h('p', null, `已删除 ${data.deleted?.length ?? 0} 条经证据确认的旧记忆。`) : null,
      data.errorCode ? h('p', { role: 'alert' }, `状态码：${data.errorCode}${data.errorStep ? ` · ${data.errorStep}` : ''}。${data.status === 'read' || initial?.entries ? '读取未确认。' : '操作未完成或结果待确认。'}请核对原生记忆。`) : null,
      data.status === 'awaiting_review' ? h('div', { className: 'knowstack-actions' },
        h('button', { type: 'button', disabled: busy, onClick: () => act('approve') }, busy ? '处理中…' : '保存这些记忆'),
        h('button', { type: 'button', disabled: busy, onClick: () => act('reject') }, '不保存')) : null,
      h('label', { className: 'knowstack-mode' },
        h('input', { type: 'checkbox', checked: mode === true, disabled: busy || mode === null, onChange: toggle }), '本项目自动保存'),
      h('small', null, mode === null ? (modeError ? '自动保存状态未确认，未判定为关闭。' : '正在核对项目自动保存状态…') : mode === true ? '已开启：只自动保存长期有效的新知识；修改始终可用，模型删除由独立开关控制。' : '已关闭：新记忆需确认；修改始终可用，模型删除由独立开关控制。'),
      error || modeError ? h('p', { role: 'alert' }, error || modeError) : null);
  };
}

export async function onLoad(pi) {
  onUnload();
  const state = { stopped: false, busy: false, disposers: [], timer: null };
  runtime = state;
  const dispatch = (method, args) => pi.dispatch('plugin.call', { method, args });
  const { lease } = await dispatch('connect', { version: VERSION });
  if (state.stopped) return;
  const call = (method, args = {}) => {
    if (state.stopped) return Promise.reject(new Error('Plugin unloaded'));
    return dispatch(method, { ...args, lease });
  };
  let projectController;
  const memoryAccess = createMemoryAccess(globalThis.piDesktop);
  state.disposers.push(() => memoryAccess.stop());
  const reminderEditor = globalThis.document ? createReminderEditor(pi, memoryAccess) : null;
  state.disposers.push(() => reminderEditor?.stop());
  if (globalThis.document) {
    projectController = createProjectController({ bridge: globalThis.piDesktop, call });
    state.disposers.push(() => projectController.stop());
    state.disposers.push(installSettingsEntry(pi, projectController));
  }
  const component = makeCard(pi, call, projectController);
  state.disposers.push(pi.ui.injectStyle(`
.knowstack-memory{border-left:3px solid #315dab;padding:10px 14px;margin:8px 0;font:inherit;color:inherit;max-width:72ch;overflow-wrap:anywhere}
.knowstack-head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.knowstack-head span{font-size:.85em;opacity:.85}
.knowstack-item{margin-top:12px}.knowstack-item p{white-space:pre-wrap;margin:4px 0 10px;line-height:1.6}
.knowstack-actions{display:flex;gap:10px;margin:12px 0}.knowstack-actions button{font:inherit;padding:5px 12px;cursor:pointer}
.knowstack-actions button:focus-visible,.knowstack-mode input:focus-visible{outline:2px solid #315dab;outline-offset:3px}
.knowstack-mode{display:flex;align-items:center;gap:6px;margin-top:12px}.knowstack-memory small{display:block;opacity:.75;margin-top:5px}
.knowstack-head [data-state=saved]{color:#25745a}.knowstack-head [data-state=unverified]{color:#9b6a16}
${SETTINGS_CSS}
${MEMORY_CSS}
${OUTDATED_CSS}
${THEME_CSS}
`));
  for (const toolName of ['read_memory', 'remember', 'update_memory', 'delete_memory']) state.disposers.push(pi.slots.register({ slot: 'toolCard', toolName, component }));
  const openReminder = (target, onClose) => {
    if (!reminderEditor) throw new Error('Renderer document unavailable');
    return reminderEditor.open(target, onClose);
  };
  state.disposers.push(pi.slots.register({ slot: 'toolCard', toolName: 'report_outdated_memory', component: makeOutdatedCard(React, call, openReminder) }));
  state.disposers.push(pi.slots.register({ slot: 'entryExtra', component: makeOutdatedEntry(React, call, openReminder) }));
  const poll = async () => {
    if (state.stopped || state.busy) return;
    state.busy = true;
    try {
      const job = await call('next');
      if (!job || state.stopped) return;
      const result = await memoryAccess.run(() => runNativeJob(globalThis.piDesktop, job, { isStopped: () => state.stopped, authorize: async job => (await call('authorize', { id: job.id })).allowed }));
      if (!state.stopped) await call('report', { id: job.id, result });
    } catch { /* The waiting tool times out safely; do not retry a native write or expose private host errors. */ }
    finally { state.busy = false; }
  };
  state.timer = setInterval(() => { void poll(); }, 300);
  state.timer.unref?.();
}
export function onUnload() {
  if (!runtime) return;
  runtime.stopped = true; clearInterval(runtime.timer);
  for (const dispose of runtime.disposers) if (typeof dispose === 'function') dispose();
  runtime = null;
}
