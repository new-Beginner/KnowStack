const PLUGIN_ID = 'local.project-memory-api-probe';

export const SETTINGS_CSS = `
.knowstack-settings-backdrop{position:fixed;inset:0;display:grid;place-items:center;box-sizing:border-box;padding:24px;background:rgba(20,46,65,.32);pointer-events:auto}
.knowstack-settings{width:min(600px,100%);max-height:calc(100dvh - 64px);display:flex;flex-direction:column;box-sizing:border-box;background:var(--bg-elevated,#f7fbff);color:var(--text-primary,#193a51);border:1px solid var(--border-color,#d7e6ef);border-radius:22px;box-shadow:0 24px 80px #102c4c33;font-family:inherit;font-size:14px;line-height:1.5;overflow:hidden}
.knowstack-settings header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:24px 24px 16px}.knowstack-settings h2{font-size:19px;margin:0 0 4px;font-weight:650}.knowstack-settings p{margin:0;color:var(--text-secondary,#527089);font-size:13px;line-height:1.6}
.knowstack-settings button{font:inherit;cursor:pointer}.knowstack-settings button:disabled{cursor:wait;opacity:.55}.knowstack-settings button:focus-visible{outline:3px solid #1689bf;outline-offset:4px}.knowstack-settings .ks-close{border:0;background:transparent;color:inherit;padding:0 6px;font-size:24px;line-height:1.2}
.knowstack-settings .ks-body{overflow-y:auto;padding:0 24px;overscroll-behavior:contain}.knowstack-settings .ks-default{background:var(--bg-secondary,#eaf3fb);border-radius:12px;padding:16px;margin-bottom:20px}.knowstack-settings .ks-default-item+.ks-default-item{margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color,#dfeaf2)}
.knowstack-settings .ks-row{display:flex;align-items:center;justify-content:space-between;gap:16px}.knowstack-settings .ks-copy{min-width:0;flex:1 1 auto}.knowstack-settings .ks-copy strong{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}.knowstack-settings .ks-path{font-size:12px;overflow-wrap:anywhere;display:block;color:var(--text-secondary,#527089);margin-top:3px}
.knowstack-settings .ks-list-heading{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px}.knowstack-settings h3{font-size:14px;margin:0;font-weight:650}.knowstack-settings .ks-hint{font-size:12px;color:var(--text-secondary,#527089);margin:2px 0 10px;line-height:1.4}
.knowstack-settings .ks-list{list-style:none;padding:0;margin:0}.knowstack-settings .ks-project{padding:14px 0;border-bottom:1px solid var(--border-color,#dfeaf2)}.knowstack-settings .ks-project:last-child{border-bottom:0}
.knowstack-settings .ks-switches{display:flex;align-items:center;gap:14px;flex:none}
.knowstack-settings .ks-switch-col{display:flex;flex-direction:column;align-items:center;gap:3px;flex:none}
.knowstack-settings .ks-switch-tag{font-size:11px;color:var(--text-secondary,#527089);font-weight:600;line-height:1}
.knowstack-settings .ks-switch{flex:none;position:relative;width:40px;height:24px;border:0;border-radius:20px;background:#afc2d1;padding:3px;transition:background .15s}.knowstack-settings .ks-switch[aria-checked=true]{background:#117bb4}.knowstack-settings .ks-switch span{display:block;width:18px;height:18px;border-radius:50%;background:white;box-shadow:0 1px 3px #173d5226;transition:transform .15s}.knowstack-settings .ks-switch[aria-checked=true] span{transform:translateX(16px)}
.knowstack-settings .ks-empty{padding:22px 0}.knowstack-settings footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 24px 22px;border-top:1px solid var(--border-color,#dfeaf2)}.knowstack-settings .ks-status{font-size:12px;color:var(--text-secondary,#527089)}.knowstack-settings .ks-error{margin:12px 0;color:#b23c32;font-size:13px}.knowstack-settings .ks-refresh{background:transparent;border:0;color:var(--text-primary,#17618d);padding:4px 0;font-size:12px}.knowstack-settings .ks-done{background:#117bb4;color:white;border:0;border-radius:9px;padding:8px 20px}
@media(max-width:480px){.knowstack-settings-backdrop{padding:12px}.knowstack-settings header{padding:20px 18px 14px}.knowstack-settings .ks-body{padding:0 18px}.knowstack-settings footer{padding:14px 18px 18px}}
@media(prefers-reduced-motion:reduce){.knowstack-settings .ks-switch,.knowstack-settings .ks-switch span{transition:none}}
`;

export function mountSettings(container, controller, onClose, doc = document) {
  const previousFocus = doc.activeElement;
  let disposed = false; let lastFocusKey;
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const backdrop = el('div', 'knowstack-settings-backdrop');
  const dialog = el('section', 'knowstack-settings');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', '知栈 · KnowStack 设置'); dialog.tabIndex = -1;
  backdrop.append(dialog); container.append(backdrop);
  const close = () => { if (!disposed) { cleanup(); onClose(); } };
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  const render = state => {
    const focusKey = doc.activeElement?.dataset?.ksKey ?? lastFocusKey;
    lastFocusKey = focusKey;
    const scroll = dialog.querySelector('.ks-body')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const switchFor = (label, checked, key, change) => {
      const button = el('button', 'ks-switch'); button.type = 'button';
      button.dataset.ksKey = key; button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', label); button.setAttribute('aria-checked', String(checked));
      button.disabled = state.busy || !state.loaded;
      button.append(el('span')); button.addEventListener('click', () => { void change(!checked); });
      return button;
    };
    const header = el('header'); const heading = el('div');
    heading.append(el('h2', '', '知栈 · KnowStack 设置'), el('p', '', '管理项目记忆保存与清理。删除开关仅限模型自主删除，手动删除不受限，修改功能始终开启无开关。'));
    const dismiss = el('button', 'ks-close', '×'); dismiss.type = 'button'; dismiss.dataset.ksKey = 'close'; dismiss.setAttribute('aria-label', '关闭设置'); dismiss.addEventListener('click', close);
    header.append(heading, dismiss);
    const body = el('div', 'ks-body');

    const defaultBox = el('div', 'ks-default');
    const defaultSaveRow = el('div', 'ks-row ks-default-item');
    const defaultSaveCopy = el('div', 'ks-copy');
    defaultSaveCopy.append(el('strong', '', '默认自动保存项目记忆'), el('p', '', '新项目按此开关初始化自动保存，已有项目的选择保持不变。'));
    defaultSaveRow.append(defaultSaveCopy, switchFor('默认自动保存项目记忆', state.autoSave, 'default', value => controller.setDefault(value, 'autoSave')));

    const defaultDeleteRow = el('div', 'ks-row ks-default-item');
    const defaultDeleteCopy = el('div', 'ks-copy');
    defaultDeleteCopy.append(el('strong', '', '默认允许模型自主删除'), el('p', '', '新项目按此开关初始化自主删除（仅限模型自主清理，手动删除不受限）。'));
    defaultDeleteRow.append(defaultDeleteCopy, switchFor('默认允许模型自主删除', state.autoDelete, 'default-delete', value => controller.setDefault(value, 'autoDelete')));

    defaultBox.append(defaultSaveRow, defaultDeleteRow);

    const listHeading = el('div', 'ks-list-heading'); listHeading.append(el('h3', '', `项目记忆控制${state.loaded ? ` · ${state.projects.length}` : ''}`));
    const refresh = el('button', 'ks-refresh', '刷新'); refresh.type = 'button'; refresh.dataset.ksKey = 'refresh'; refresh.disabled = state.busy;
    refresh.addEventListener('click', () => { void controller.refresh().catch(() => {}); }); listHeading.append(refresh);
    const hint = el('p', 'ks-hint', '说明：删除开关仅控制模型自主清理，手动删除随时可用；修改功能始终可用且不设开关。');

    const list = el('ul', 'ks-list');
    for (const project of state.projects) {
      const row = el('li', 'ks-row ks-project'); const copy = el('div', 'ks-copy');
      copy.append(el('strong', '', project.name), el('span', 'ks-path', project.path));

      const switches = el('div', 'ks-switches');
      const saveCol = el('div', 'ks-switch-col');
      saveCol.append(
        el('span', 'ks-switch-tag', '保存'),
        switchFor(`${project.name} 自动保存（${project.path}）`, project.autoSave, project.path, value => controller.setProject(project.path, value, 'autoSave'))
      );
      const deleteCol = el('div', 'ks-switch-col');
      deleteCol.append(
        el('span', 'ks-switch-tag', '删除'),
        switchFor(`${project.name} 模型自主删除（${project.path}）`, project.autoDelete, `${project.path}:delete`, value => controller.setProject(project.path, value, 'autoDelete'))
      );
      switches.append(saveCol, deleteCol);

      row.append(copy, switches);
      list.append(row);
    }
    body.append(defaultBox, listHeading, hint, list);
    if (!state.loaded) body.append(el('p', 'ks-empty', state.error ? '项目列表尚未加载。' : '正在扫描项目…'));
    else if (!state.projects.length) body.append(el('p', 'ks-empty', '暂无本地项目。新建项目后会自动出现在这里。'));
    if (state.error) { const error = el('p', 'ks-error', state.error); error.setAttribute('role', 'alert'); body.append(error); }
    const footer = el('footer'); const status = el('span', 'ks-status', state.busy ? '正在保存…' : state.message || '开关即时保存 · 项目列表自动同步');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const done = el('button', 'ks-done', '完成'); done.type = 'button'; done.dataset.ksKey = 'done'; done.addEventListener('click', close);
    footer.append(status, done); dialog.append(header, body, footer); body.scrollTop = scroll;
    if (focusKey) [...dialog.querySelectorAll('[data-ks-key]')].find(node => node.dataset.ksKey === focusKey)?.focus({ preventScroll: true });
  };
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0]; const last = buttons.at(-1);
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog)) { event.preventDefault(); first?.focus(); }
  };
  dialog.addEventListener('keydown', keydown);
  const unsubscribe = controller.subscribe(render);
  function cleanup() {
    if (disposed) return;
    disposed = true; unsubscribe(); backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  dialog.focus();
  return cleanup;
}

// The host has no custom settings slot. Scope the capture adapter to our exact plugin row.
export function installSettingsEntry(pi, controller, doc = document) {
  let opened = null;
  const open = () => {
    if (opened) return;
    const layer = pi.ui.openLayer();
    let dispose;
    const close = () => { dispose?.(); layer.close(); opened = null; };
    try { dispose = mountSettings(layer.element, controller, close, doc); }
    catch (error) { layer.close(); throw error; }
    opened = close;
    void controller.refresh().catch(() => {});
  };
  const capture = event => {
    const button = event.target?.closest?.('button');
    const row = button?.closest('.plugins-row');
    if (!row || row.querySelector('.plugins-row-id')?.textContent?.trim() !== PLUGIN_ID) return;
    // Current hosts use controls; retain actions for older plugin-list layouts.
    const candidates = row.querySelectorAll('.plugins-row-controls > button.plugins-icon-btn:not([aria-haspopup]), .plugins-row-actions > button.plugins-icon-btn:not([aria-haspopup])');
    // KnowStack has no panel, so the sole direct icon action is its settings button.
    if (candidates.length !== 1 || candidates[0] !== button) return;
    event.preventDefault(); event.stopImmediatePropagation(); open();
  };
  doc.addEventListener('click', capture, true);
  return () => { doc.removeEventListener('click', capture, true); opened?.(); };
}
