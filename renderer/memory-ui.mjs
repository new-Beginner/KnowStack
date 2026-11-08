import { createMemoryEditor } from './memory-editor.mjs';
import { connectPanelContext } from './panel-context.mjs';

export const MEMORY_CSS = `
.knowstack-memory-entry .work-panel-launcher-icon svg{display:block;width:15px;height:15px;flex:none}
.knowstack-editor-backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:rgba(20,46,65,.32);pointer-events:auto}
.knowstack-editor{width:min(790px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--border-color,#d7e6ef);border-radius:20px;background:var(--bg-elevated,#f7fbff);color:var(--text-primary,#193a51);box-shadow:0 24px 80px #102c4c33;font-family:inherit;font-size:14px;line-height:1.5;overflow:hidden}
.knowstack-editor header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 14px}.knowstack-editor h2{font-size:20px;margin:0 0 8px;font-weight:650}.knowstack-editor p{margin:0;line-height:1.6;color:var(--text-secondary,#527089);font-size:13px}.knowstack-editor button,.knowstack-editor input,.knowstack-editor textarea,.knowstack-editor select{font:inherit;color:inherit;box-sizing:border-box}.knowstack-editor button{cursor:pointer}.knowstack-editor button:disabled{cursor:default;opacity:.5}.knowstack-editor :is(button,input,textarea,select):focus-visible{outline:2px solid #1689bf;outline-offset:3px}.knowstack-editor .km-close{background:transparent;border:0;padding:0 5px;font-size:24px;line-height:1.2}
.knowstack-editor .km-body{padding:0 24px;overflow-y:auto;overscroll-behavior:contain;min-height:0}.knowstack-editor .km-project{display:flex;flex-direction:column;gap:5px;margin-bottom:16px}.knowstack-editor select{width:100%;padding:8px 10px;background:var(--bg-secondary,#eaf3fb);border:1px solid var(--border-color,#d7e6ef);border-radius:8px}.knowstack-editor .km-path{font-size:12px;color:var(--text-secondary,#527089);overflow-wrap:anywhere}.knowstack-editor .km-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0}.knowstack-editor .km-tools{display:flex;gap:16px}.knowstack-editor .km-link{border:0;background:transparent;padding:4px 0;color:var(--text-secondary,#376586)}.knowstack-editor .km-list{display:flex;flex-direction:column;gap:12px;margin:0 0 18px;padding:0;list-style:none}.knowstack-editor .km-item{padding:10px 12px;background:var(--bg-secondary,#edf5fb);border:1px solid var(--border-color,#d7e6ef);border-radius:13px}.knowstack-editor .km-item-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}.knowstack-editor .km-number{flex:none;color:var(--text-secondary,#376586);font-size:12px;min-width:23px;text-align:center}.knowstack-editor :is(input,textarea){width:100%;min-width:0;border:1px solid transparent;border-radius:10px;padding:10px 12px;background:var(--bg-tertiary,#dceef8);line-height:1.5}.knowstack-editor textarea{display:block;resize:vertical;min-height:100px;max-height:320px}.knowstack-editor .km-delete{flex:none;border:0;background:transparent;color:var(--text-secondary,#527089);padding:6px;font-size:18px}.knowstack-editor .km-empty{padding:22px 0}.knowstack-editor .km-error{color:var(--text-primary,#9e382d);background:var(--bg-secondary,#fff1ec);padding:10px 12px;border-left:3px solid #b75748;margin-bottom:16px;white-space:pre-wrap}.knowstack-editor footer{padding:16px 24px 22px;display:flex;flex-direction:column;gap:12px}.knowstack-editor .km-footer-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.knowstack-editor .km-status{font-size:12px;color:var(--text-secondary,#527089)}.knowstack-editor .km-buttons{display:flex;gap:10px;flex:none}.knowstack-editor .km-cancel{border:0;background:transparent;padding:8px 10px}.knowstack-editor .km-save{border:0;background:#117bb4;color:white;border-radius:10px;padding:8px 16px}
.knowstack-confirm-backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:rgba(20,46,65,.3)}.knowstack-memory-confirm{width:min(410px,100%);max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:22px;border:1px solid var(--border-color,#d7e6ef);border-radius:16px;background:var(--bg-elevated,#f7fbff);color:var(--text-primary,#193a51);box-shadow:0 18px 60px #102c4c33;font:inherit}.knowstack-memory-confirm h3{margin:0 0 12px;font-size:17px}.knowstack-memory-confirm p{margin:0 0 20px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.knowstack-memory-confirm .km-confirm-actions{display:flex;justify-content:flex-end;gap:10px}.knowstack-memory-confirm button{font:inherit;cursor:pointer;padding:8px 14px;border:1px solid var(--border-color,#d7e6ef);border-radius:9px;color:inherit;background:var(--bg-secondary,#eaf3fb)}.knowstack-memory-confirm .km-confirm-accept{border-color:transparent;background:#117bb4;color:white}.knowstack-memory-confirm button:focus-visible{outline:2px solid #1689bf;outline-offset:3px}
.knowstack-editor .km-highlight{border-color:#b78320;box-shadow:inset 3px 0 #b78320}.knowstack-editor .km-highlight::before{content:'疑似过时 · 请核对后自行决定是否删除';display:block;color:var(--text-primary,#735012);font-size:12px;margin-bottom:8px}.knowstack-editor .km-body{overflow-wrap:anywhere}
@media(max-width:480px){.knowstack-editor-backdrop{padding:10px}.knowstack-editor{max-height:calc(100dvh - 20px);border-radius:15px}.knowstack-editor header{padding:18px 16px 12px}.knowstack-editor .km-body{padding:0 16px}.knowstack-editor footer{padding:14px 16px 18px}.knowstack-editor .km-footer-row{align-items:flex-start;flex-direction:column}.knowstack-editor .km-buttons{align-self:flex-end}.knowstack-editor .km-item{padding:8px}.knowstack-editor .km-item-head{gap:5px}}
.knowstack-editor-backdrop.km-docked{position:relative;inset:auto;display:flex;align-items:flex-start;padding:0;background:none;height:100%;min-height:0;pointer-events:auto}.km-docked .knowstack-editor{width:100%;height:auto;max-height:100%;border:0;border-radius:0;box-shadow:none;background:var(--bg-primary,var(--bg-elevated,#f7fbff));font-size:13px}.km-docked .knowstack-editor header{padding:16px 16px 12px;flex:none}.km-docked .knowstack-editor h2{font-size:16px;margin-bottom:4px}.km-docked .km-body{padding:0 16px;flex:initial}.km-docked .km-close,.km-docked .km-cancel{display:none}.km-docked .knowstack-editor footer{padding:12px 16px;gap:8px;flex:none;border-top:1px solid var(--border-color,#d7e6ef)}.km-docked .km-footer-row{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px}.km-docked .km-buttons{margin-left:auto;align-self:center}.km-docked .km-item{border-radius:8px;padding:8px}.km-docked .km-item-head{gap:6px}.km-docked .km-number{display:none}.km-docked .km-item input{padding:6px 8px;font-weight:600;border-radius:6px}.km-docked .km-item textarea{font-size:13px;min-height:112px;border-radius:6px;padding:8px}.km-docked .km-toolbar{flex-wrap:wrap;gap:6px}.km-docked .km-tools{gap:12px}.knowstack-editor .km-delete{width:28px;height:28px;padding:6px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center}.knowstack-editor .km-delete:hover{background:var(--bg-tertiary,#e0eaf2);color:var(--danger-color,#c44545)}.knowstack-editor .km-delete svg{width:16px;height:16px}.km-docked .knowstack-confirm-backdrop{position:absolute;z-index:2;padding:12px}.km-docked .knowstack-memory-confirm{max-height:100%;padding:16px}.km-mode-panel{display:grid;gap:9px;padding:12px 0;border-block:1px solid var(--border-color,#d7e6ef);margin-bottom:12px}.km-mode-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.km-mode-switch{flex:none;width:36px;height:21px;padding:3px!important;border:0;border-radius:12px;background:var(--text-muted,#9baebe)}.km-mode-switch[aria-checked=true]{background:var(--accent-color,#117bb4)}.km-mode-switch span{display:block;width:15px;height:15px;background:white;border-radius:50%}.km-mode-switch[aria-checked=true] span{transform:translateX(15px)}.km-mode-hint{font-size:11px!important}.km-docked .km-project select{font-size:12px}.km-docked .km-status{overflow-wrap:anywhere;flex:1 1 160px}.km-docked .km-save{border-radius:6px}
.km-docked .km-icon-action{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:4px;border-radius:5px}.km-docked .km-icon-action svg{width:16px;height:16px}.km-docked .km-icon-action:hover{background:var(--bg-tertiary,#e0eaf2)}
`;

export function mountMemoryEditor(container, controller, onClose, doc = document, { inline = false, modes } = {}) {
  const previousFocus = doc.activeElement;
  let disposed = false; let signature = ''; let unsubscribe; let unsubscribeModes; let pendingConfirmation = null; let focusedReminder = false;
  const el = (tag, className, text) => {
    const node = doc.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  };
  const button = (className, text, action, label) => {
    const node = el('button', className, text); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', action); return node;
  };
  const mayDiscard = action => {
    if (controller.getState().dirty) requestConfirmation('有尚未保存的修改。放弃这些修改吗？', action, '放弃修改');
    else action();
  };
  const close = () => { if (!disposed && !pendingConfirmation && !controller.getState().busy) mayDiscard(() => { cleanup(); onClose(); }); };
  const backdrop = el('div', inline ? 'knowstack-editor-backdrop km-docked' : 'knowstack-editor-backdrop'); const dialog = el('section', 'knowstack-editor');
  dialog.setAttribute('role', inline ? 'region' : 'dialog'); if (!inline) dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '项目记忆'); dialog.tabIndex = -1;
  const header = el('header'); const heading = el('div');
  heading.append(el('h2', '', '项目记忆'), el('p', '', '保存会在项目聊天之间持续使用的上下文。'));
  const dismiss = button('km-close', '×', close, '关闭项目记忆'); header.append(heading, dismiss);
  const body = el('div', 'km-body'); const following = inline && controller.getState().following;
  const projectRow = el(following ? 'div' : 'label', 'km-project', inline ? '' : controller.getState().pinned ? '提醒所属项目 · 固定定位' : controller.getState().following ? '当前面板项目 · 自动跟随' : '项目');
  const select = el('select'); select.setAttribute('aria-label', '选择记忆所属项目');
  const path = el('span', 'km-path'); if (!following) projectRow.append(select); projectRow.append(path);
  select.addEventListener('change', () => {
    if (controller.getState().following) { select.value = controller.getState().projectKey; return; }
    const key = select.value;
    mayDiscard(() => { void controller.load(key); });
    select.value = controller.getState().projectKey;
  });
  const toolbar = el('div', 'km-toolbar'); const count = el('span'); const tools = el('div', 'km-tools');
  const refresh = button('km-link km-refresh', '重新读取', () => mayDiscard(() => { void controller.load(controller.getState().projectKey); }));
  const add = button('km-link km-add', '＋ 添加记忆', () => {
    controller.add(); list.lastElementChild?.querySelector('input')?.focus(); list.lastElementChild?.scrollIntoView({ block: 'nearest' });
  });
  if (inline) {
    for (const [node, label, paths] of [[refresh, '重新读取', ['M20 7v5h-5','M4 17v-5h5','M6 7a7 7 0 0 1 11.5-1.5L20 8','M4 16l2.5 2.5A7 7 0 0 0 18 17']], [add, '添加记忆', ['M12 5v14','M5 12h14']]]) {
      node.textContent = ''; node.classList.add('km-icon-action'); node.title = label; node.setAttribute('aria-label', label);
      const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg');
      for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
      for (const d of paths) { const path = doc.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',d); svg.append(path); } node.append(svg);
    }
  }
  tools.append(refresh, add); toolbar.append(count, tools);
  const list = el('ol', 'km-list'); const empty = el('p', 'km-empty');
  const error = el('p', 'km-error'); error.setAttribute('role', 'alert');
  body.append(projectRow);
  if (modes) {
    const panel = el('div', 'km-mode-panel'); const switches = {};
    for (const [key, label] of [['autoSave','自动保存新记忆'],['autoDelete','允许模型删除记忆']]) {
      const row = el('div','km-mode-row'); const toggle = button('km-mode-switch','',() => { void modes.set(key, toggle.getAttribute('aria-checked') !== 'true'); },label);
      toggle.setAttribute('role','switch'); toggle.append(el('span')); switches[key] = toggle; row.append(el('span','',label),toggle); panel.append(row);
    }
    const hint = el('p','km-mode-hint','修改始终开启；删除开关只控制模型，不限制手动删除。'); panel.append(hint); body.append(panel);
    unsubscribeModes = modes.subscribe(state => {
      for (const [key,toggle] of Object.entries(switches)) { toggle.setAttribute('aria-checked',String(state[key] === true)); toggle.disabled = state.busy || !state.loaded; }
      hint.textContent = state.error || (inline ? '' : '修改始终开启；删除开关只控制模型，不限制手动删除。'); hint.hidden = inline && !state.error;
    });
  }
  body.append(toolbar, list, empty, error);
  const footer = el('footer'); const hint = el('p', '', '会用于此项目的聊天。请保持简洁、客观；删除在保存后生效。');
  const footerRow = el('div', 'km-footer-row'); const status = el('span', 'km-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = el('div', 'km-buttons'); const cancel = button('km-cancel', '取消', close);
  const save = button('km-save', '保存记忆', () => { void controller.save(); });
  actions.append(cancel, save); footerRow.append(status, actions); if (!inline) footer.append(hint); footer.append(footerRow);
  dialog.append(header, body, footer); backdrop.append(dialog); container.append(backdrop);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });

  // Keep confirmations inside the renderer: native window.confirm can leave Electron's
  // parent window without keyboard input after the OS dialog closes.
  function requestConfirmation(message, action, acceptLabel = '确认') {
    if (disposed || pendingConfirmation || controller.getState().busy) return;
    const returnFocus = doc.activeElement; const projectKey = controller.getState().projectKey;
    const shade = el('div', 'knowstack-confirm-backdrop'); const box = el('section', 'knowstack-memory-confirm');
    box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '确认操作');
    const text = el('p', '', message); text.id = `knowstack-confirm-${doc.defaultView.crypto.randomUUID()}`;
    box.setAttribute('aria-describedby', text.id);
    let settled = false;
    const settle = accepted => {
      if (settled) return;
      settled = true; pendingConfirmation = null; shade.remove(); dialog.inert = false; if (!inline) dialog.setAttribute('aria-modal', 'true');
      if (disposed) return;
      if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus(); else dialog.focus();
      if (accepted && !controller.getState().busy && controller.getState().projectKey === projectKey) action();
    };
    const reject = button('km-confirm-cancel', '取消', () => settle(false));
    const accept = button('km-confirm-accept', acceptLabel, () => settle(true));
    const buttons = el('div', 'km-confirm-actions'); buttons.append(reject, accept);
    box.append(el('h3', '', '确认操作'), text, buttons); shade.append(box); backdrop.append(shade);
    pendingConfirmation = { settle }; dialog.inert = true; if (!inline) dialog.setAttribute('aria-modal', 'false'); reject.focus();
    shade.addEventListener('click', event => { if (event.target === shade) settle(false); });
    box.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); settle(false); }
      if (event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation(); (doc.activeElement === reject ? accept : reject).focus();
      }
    });
  }
  const render = state => {
    const optionsKey = JSON.stringify(state.projects.map(p => [p.key, p.name, p.path]));
    if (select.dataset.options !== optionsKey) {
      select.replaceChildren(...state.projects.map(p => { const option = el('option', '', `${p.name} — ${p.path}`); option.value = p.key; return option; }));
      select.dataset.options = optionsKey;
    }
    select.value = state.projectKey; select.disabled = state.following || state.busy || !state.projects.length;
    const project = state.projects.find(p => p.key === state.projectKey); path.textContent = (inline ? project?.name : project?.path) ?? '';
    count.textContent = `${state.entries.length} 条记忆`;
    const next = JSON.stringify([state.projectKey, state.entries.map(e => e.id)]);
    if (signature !== next) {
      const active = doc.activeElement; const hadFocus = list.contains(active);
      const index = [...list.children].findIndex(row => row.contains(active));
      signature = next; list.replaceChildren();
      state.entries.forEach((entry, i) => {
        const row = el('li', entry.id === state.highlightId ? 'km-item km-highlight' : 'km-item'); row.dataset.id = entry.id;
        const head = el('div', 'km-item-head'); const title = el('input'); title.type = 'text'; title.value = entry.title; title.placeholder = '记忆标题（可选）'; title.setAttribute('aria-label', `第 ${i + 1} 条记忆标题`);
        title.addEventListener('input', () => controller.update(entry.id, 'title', title.value));
        const remove = button('km-delete', '', () => {
          requestConfirmation(`从草稿中删除“${title.value || '未命名记忆'}”？点击保存后才会删除原生记忆。`, () => controller.remove(entry.id), '删除记忆');
        }, `删除第 ${i + 1} 条记忆`);
        remove.title = `删除第 ${i + 1} 条记忆`;
        const trash = doc.createElementNS('http://www.w3.org/2000/svg','svg'); trash.setAttribute('viewBox','0 0 24 24'); trash.setAttribute('fill','none'); trash.setAttribute('stroke','currentColor'); trash.setAttribute('stroke-width','1.75'); trash.setAttribute('stroke-linecap','round'); trash.setAttribute('stroke-linejoin','round'); trash.setAttribute('aria-hidden','true');
        for (const d of ['M3 6h18','M19 6l-1 14H6L5 6','M9 6V3h6v3','M10 10v7','M14 10v7']) { const p = doc.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',d); trash.append(p); } remove.append(trash);
        head.append(el('span', 'km-number', String(i + 1)), title, remove);
        const content = el('textarea'); content.value = entry.content; content.placeholder = '需要此项目记住的内容'; content.setAttribute('aria-label', `第 ${i + 1} 条记忆正文`);
        content.addEventListener('input', () => controller.update(entry.id, 'content', content.value));
        row.append(head, content); list.append(row);
      });
      if (hadFocus) (list.children[Math.min(index, list.children.length - 1)]?.querySelector('input') ?? add).focus();
    }
    for (const [i, row] of [...list.children].entries()) {
      const entry = state.entries[i]; const title = row.querySelector('input'); const content = row.querySelector('textarea');
      if (title.value !== entry.title) title.value = entry.title;
      if (content.value !== entry.content) content.value = entry.content;
      title.disabled = content.disabled = row.querySelector('button').disabled = state.busy;
    }
    empty.hidden = state.loaded && state.projects.length > 0 && state.entries.length > 0;
    empty.textContent = state.busy && !state.loaded ? '正在读取项目记忆…' : !state.loaded ? '未能读取记忆。请点击“重新读取”。' : !state.projects.length ? '暂无本地项目。创建项目后点击“重新读取”。' : '还没有记忆。点击“添加记忆”开始。';
    error.hidden = !state.error; error.textContent = state.error;
    add.disabled = state.busy || !state.loaded || !state.projectKey || state.needsRefresh || state.entries.length >= 2000;
    refresh.disabled = dismiss.disabled = cancel.disabled = state.busy;
    save.disabled = state.busy || !state.dirty || state.needsRefresh || state.entries.some(e => !e.content.trim());
    save.textContent = state.busy ? '处理中…' : '保存记忆';
    status.textContent = state.busy ? '正在处理，请勿关闭或重载插件…' : state.message || (state.dirty ? '有未保存的修改' : inline ? '' : state.following ? '自动跟随当前面板项目 · 不会自动保存' : '只读取，不会自动保存');
    if (state.pinned && !state.dirty && !state.busy && !state.message && !state.error) status.textContent = '仅定位提醒所属项目 · 未自动删除或保存';
    if (!focusedReminder && state.loaded && !state.busy && state.highlightId) {
      const row = [...list.children].find(node => node.dataset.id === state.highlightId);
      if (row) { focusedReminder = true; row.scrollIntoView({ block: 'center' }); row.querySelector('input')?.focus(); }
    }
  };
  dialog.addEventListener('keydown', event => {
    if (inline) return; // A docked region must not trap the host's keyboard focus.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog)) { event.preventDefault(); first?.focus(); }
  });
  function cleanup() {
    if (disposed) return;
    disposed = true; pendingConfirmation?.settle(false); unsubscribe?.(); unsubscribeModes?.(); backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  unsubscribe = controller.subscribe(render); if (!inline) dialog.focus();
  return cleanup;
}

// Keep the existing Renderer editor; adapt only our own row in the right work-panel launcher.
export function installMemoryEntry(pi, access, doc = document, { connectContext = connectPanelContext } = {}) {
  let opened = null; let stopped = false; let opening = false;
  const open = async () => {
    if (opened || stopped || opening) return;
    opening = true;
    let context;
    try { context = await connectContext(doc, { resolveSession: id => access.resolveSession(id) }); }
    catch { context = { get() { throw Object.assign(new Error('PANEL_CONTEXT_UNAVAILABLE'), { code: 'PANEL_CONTEXT_UNAVAILABLE' }); }, subscribe: () => () => {} }; }
    opening = false;
    if (stopped) { context.stop?.(); return; }
    const controller = createMemoryEditor(access, { context }); const layer = pi.ui.openLayer(); let dispose;
    const cleanup = () => { dispose?.(); controller.stop(); context.stop?.(); layer.close(); opened = null; };
    try { dispose = mountMemoryEditor(layer.element, controller, cleanup, doc); }
    catch (error) { cleanup(); throw error; }
    opened = cleanup; void controller.load();
  };
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'work-panel-launcher-row knowstack-memory-entry';
  button.title = '项目记忆 · 知栈'; button.setAttribute('aria-label', '项目记忆 · 知栈');
  const icon = doc.createElement('span'); icon.className = 'work-panel-launcher-icon'; icon.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '15'); svg.setAttribute('height', '15'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M12 7v14M3 3h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6v16h-6a3 3 0 0 0-3 2 3 3 0 0 0-3-2H3Z'); svg.append(path); icon.append(svg);
  const label = doc.createElement('span'); label.className = 'work-panel-launcher-label'; label.textContent = '项目记忆'; button.append(icon, label);
  button.addEventListener('click', open);
  const mount = () => {
    if (stopped) return;
    const list = doc.querySelector('.work-panel-launcher-list');
    if (list && button.parentNode !== list) list.append(button);
  };
  const observer = new doc.defaultView.MutationObserver(mount);
  observer.observe(doc.body, { childList: true, subtree: true }); mount();
  return () => { stopped = true; observer.disconnect(); button.remove(); opened?.(); };
}
