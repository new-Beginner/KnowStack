import { createMemoryEditor } from './memory-editor.mjs';
import { mountMemoryEditor } from './memory-ui.mjs';
import { unwrapResult } from './receipt-state.mjs';

export const OUTDATED_CSS = `
.knowstack-outdated{border-left-color:#b78320}.knowstack-outdated .knowstack-head strong{color:var(--text-primary,#735012)}
.knowstack-outdated .ko-context{font-size:12px;opacity:.8}.knowstack-outdated .ko-original{padding-left:12px;border-left:2px solid var(--border-color,#d7e6ef)}
.knowstack-outdated .knowstack-actions{flex-wrap:wrap}.knowstack-outdated button:disabled{cursor:default;opacity:.5}
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
    }, [props.toolResult, props.sessionId]);
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
    return h('section', { className: 'knowstack-memory knowstack-outdated', 'aria-label': '疑似过时记忆提醒' },
      h('div', { className: 'knowstack-head' }, h('strong', null, '知栈 · 疑似过时'), h('span', { role: 'status' }, data.status === 'expired' ? '提醒已失效' : '请用户核对')),
      h('p', null, '此报告未修改原生记忆。是否删除，由你决定；自动保存开关不适用于删除。'),
      ...(data.items ?? []).map(item => h('article', { className: 'knowstack-item', key: item.memoryId },
        h('strong', null, item.title || '未命名记忆'),
        h('p', { className: 'ko-original' }, item.content),
        h('p', null, '原因：', item.reason), h('p', null, '依据（模型提供，请核对）：', item.evidence),
        h('small', null, ITEM_LABELS[item.state] ?? '仅提醒 · 尚未删除'),
        item.state === 'pending' && data.status === 'reported' ? h('div', { className: 'knowstack-actions' },
          h('button', { type: 'button', disabled: busy || !verified, onClick: () => act('open', item.memoryId) }, '打开记忆并定位'),
          h('button', { type: 'button', disabled: busy || !verified, onClick: () => act('dismiss', item.memoryId) }, '本次忽略')) : null)),
      h('small', { className: 'ko-context' }, '提醒操作有效期 15 分钟，重载插件后失效；不建立第二套记忆库。'),
      data.errorCode ? h('p', { role: 'alert' }, `提醒不可用：${data.errorCode}。请重新读取检查，未执行删除。`) : null,
      error ? h('p', { role: 'alert' }, error) : null);
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
