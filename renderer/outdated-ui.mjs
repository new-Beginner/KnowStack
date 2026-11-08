import { createMemoryEditor } from './memory-editor.mjs';
import { mountMemoryEditor } from './memory-ui.mjs';
import { unwrapResult } from './receipt-state.mjs';

export const OUTDATED_CSS = `
.knowstack-outdated{border-left-color:#b78320}.knowstack-outdated .knowstack-head strong{color:var(--text-primary,#735012)}
.knowstack-outdated .ko-context{font-size:12px;opacity:.8}.knowstack-outdated .ko-original{padding-left:12px;border-left:2px solid var(--border-color,#d7e6ef)}
.knowstack-outdated .knowstack-actions{flex-wrap:wrap}.knowstack-outdated button:disabled{cursor:default;opacity:.5}
.knowstack-outdated-final{box-sizing:border-box;width:100%;border:1px solid var(--border-color,#d7e6ef);border-left:4px solid #b78320;background:var(--bg-secondary,#f4f8fc);border-radius:8px;padding:14px 16px;margin:14px 0}
.knowstack-outdated-final .knowstack-head strong{font-size:1.05em}.knowstack-outdated-final .ko-badge{color:var(--text-primary,#735012);font-weight:600;opacity:1}.knowstack-outdated-final .ko-icon{color:#b78320;font-size:20px;line-height:1}
.knowstack-outdated-final .knowstack-actions button{border:1px solid var(--border-color,#c6d8e6);border-radius:6px;background:var(--bg-primary,#f7fbff);color:inherit;padding:7px 12px}
.knowstack-outdated-final .knowstack-actions button:first-child{border-color:#b78320}.knowstack-outdated-final details summary{cursor:pointer;margin:6px 0}.knowstack-outdated-final .ko-safety{font-size:12px;margin:8px 0;opacity:.85}
@media(max-width:480px){.knowstack-outdated-final{padding:12px}.knowstack-outdated-final .knowstack-head{gap:8px}}
`;
const ITEM_LABELS = { dismissed: '本次已忽略 · 未删除记忆', changed: '原文已变化 · 请重新检查', missing: '条目已不存在 · 此提醒已失效', unavailable: '提醒已失效 · 未执行删除' };

export function makeOutdatedCard(React, call, openEditor) {
  const h = React.createElement;
  return function OutdatedCard(props) {
    const initial = unwrapResult(props.toolResult);
    const [data, setData] = React.useState(initial);
    const [busy, setBusy] = React.useState(false);
    const [verified, setVerified] = React.useState(false);
    const [error, setError] = React.useState('');
    const reportId = initial?.reportId;
    React.useEffect(() => {
      let cancelled = false;
      setData(initial); setVerified(false); setError('');
      if (reportId && initial.sessionId === props.sessionId) {
        call('outdated', { reportId, sessionId: props.sessionId, action: 'get' }).then(value => {
          if (!cancelled) { setData(value); setVerified(!value.errorCode); }
        }).catch(() => { if (!cancelled) setError('提醒已失效或连接不可用。请重新检查；未执行删除。'); });
      }
      return () => { cancelled = true; };
    }, [reportId, props.sessionId, props.toolStatus]);
    if (initial?.sessionId && initial.sessionId !== props.sessionId) return h('p', { role: 'alert' }, '提醒与当前会话不匹配，未读取或修改记忆。');
    if (props.toolStatus === 'running') return h('p', { role: 'status' }, '知栈：正在核对疑似过时记忆，不会执行删除…');
    if (props.toolStatus === 'error') return h('p', { role: 'alert' }, '提醒未能生成；未执行删除。');
    if (!data || data.status === 'skipped') return null;
    const act = async (action, memoryId) => {
      if (busy || !verified) return;
      setBusy(true); setError('');
      try {
        const value = await call('outdated', { reportId, sessionId: props.sessionId, action, memoryId });
        setData(value); setVerified(!value.errorCode);
        if (action === 'open' && value.target) await openEditor(value.target, async () => {
          try { const latest = await call('outdated', { reportId, sessionId: props.sessionId, action: 'get' }); setData(latest); setVerified(!latest.errorCode); }
          catch { setError('提醒状态无法刷新；请核对原生记忆，未自动删除。'); }
        });
      } catch { setError('无法打开或更新提醒。请先关闭已打开的记忆编辑器，再重试；未执行删除。'); }
      finally { setBusy(false); }
    };
    const final = props.placement === 'final';
    const controls = item => item.state === 'pending' && data.status === 'reported' ? h('div', { className: 'knowstack-actions' },
      h('button', { type: 'button', disabled: busy || !verified, onClick: () => act('open', item.memoryId) }, '打开记忆并定位'),
      h('button', { type: 'button', disabled: busy || !verified, onClick: () => act('dismiss', item.memoryId) }, '本次忽略')) : null;
    return h('section', { className: `knowstack-memory knowstack-outdated${final ? ' knowstack-outdated-final' : ''}`, 'aria-label': '疑似过时记忆提醒', 'aria-live': final ? 'polite' : undefined },
      h('div', { className: 'knowstack-head' }, final ? h('span', { className: 'ko-icon', 'aria-hidden': true }, '⚠') : null,
        h('strong', null, final ? '知栈 · 过时记忆待检查' : '知栈 · 疑似过时'),
        h('span', { className: 'ko-badge', role: 'status' }, data.status === 'expired' ? '提醒已失效' : final && !verified ? '正在核对提醒' : '请用户核对')),
      h('p', { className: 'ko-safety' }, '未修改原生记忆。请核对后自行决定是否删除；自动保存不授权删除。'),
      ...(data.items ?? []).map(item => h('article', { className: 'knowstack-item', key: item.memoryId },
        h('strong', null, item.title || '未命名记忆'),
        final ? controls(item) : null,
        final ? h('details', null, h('summary', null, '查看原记忆'), h('p', { className: 'ko-original' }, item.content)) : h('p', { className: 'ko-original' }, item.content),
        h('p', null, '原因：', item.reason),
        final ? h('details', null, h('summary', null, '依据（模型提供，请核对）'), h('p', null, item.evidence)) : h('p', null, '依据（模型提供，请核对）：', item.evidence),
        h('small', null, ITEM_LABELS[item.state] ?? '仅提醒 · 尚未删除'),
        final ? null : controls(item))),
      h('small', { className: 'ko-context' }, '提醒操作有效期 15 分钟，重载插件后失效；不建立第二套记忆库。'),
      data.errorCode ? h('p', { role: 'alert' }, `提醒不可用：${data.errorCode}。请重新读取检查，未执行删除。`) : null,
      error ? h('p', { role: 'alert' }, error) : null);
  };
}

// The final-answer slot supplies the originating session, unlike fenced block renderers.
// Only an exact standalone receipt marker is accepted; text never becomes report data.
export function finalReminderIds(message) {
  if (message?.role !== 'assistant') return [];
  const text = typeof message.content === 'string' ? message.content : Array.isArray(message.content)
    ? message.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
    : typeof message.text === 'string' ? message.text : '';
  const ids = []; let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^<!-- knowstack-outdated:([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}) -->$/.exec(line);
    if (match && !ids.includes(match[1])) ids.push(match[1]);
    if (ids.length === 3) break;
  }
  return ids;
}

export function makeOutdatedEntry(React, call, openEditor) {
  const Card = makeOutdatedCard(React, call, openEditor);
  return function OutdatedEntry(props) {
    if (!props.sessionId || !props.messageId || props.message?.id !== props.messageId) return null;
    const ids = finalReminderIds(props.message);
    if (!ids.length) return null;
    return React.createElement('div', { className: 'knowstack-final-reminders' }, ...ids.map(reportId => React.createElement(Card, {
      key: `${props.sessionId}:${reportId}`, sessionId: props.sessionId, toolStatus: 'success', placement: 'final',
      toolResult: { status: 'reported', reportId, sessionId: props.sessionId, items: [] },
    })));
  };
}

// This entry can only be reached by the card's user click. It opens an unmodified draft.
export function createReminderEditor(pi, access, doc = document) {
  let opened = null; let stopped = false;
  return {
    async open(target, onClose) {
      if (stopped || opened || doc.querySelector('.knowstack-editor')) throw new Error('Close the existing editor first');
      const selection = Object.freeze({ sessionId: target.sessionId, projectPath: target.projectPath });
      const context = { get: () => selection, subscribe: () => () => {} };
      const controller = createMemoryEditor(access, { context, reminder: target });
      const layer = pi.ui.openLayer(); let dispose;
      const cleanup = () => {
        if (opened !== cleanup) return;
        opened = null; dispose?.(); controller.stop(); layer.close();
        if (!stopped) void onClose?.();
      };
      opened = cleanup;
      try { dispose = mountMemoryEditor(layer.element, controller, cleanup, doc); await controller.load(); }
      catch (error) { cleanup(); throw error; }
    },
    stop() { stopped = true; opened?.(); },
  };
}
