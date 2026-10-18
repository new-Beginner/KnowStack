import { normalizePath } from './native-memory.mjs';

const fail = code => Object.assign(new Error(code), { code });
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const localPath = path => typeof path === 'string' && (/^[a-z]:[\\/]/i.test(path) || path.startsWith('/')) &&
  !/^[\\/]{2}/.test(path) && !/[\x00-\x1f]/.test(path);
const checkedPath = path => {
  if (typeof path === 'string' && path.startsWith('remote-project:')) throw fail('REMOTE_PROJECT');
  if (!path) throw fail('NO_PANEL_PROJECT');
  if (!localPath(path)) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  return normalizePath(path);
};
function unique(nodes, attribute) {
  const values = new Set([...nodes].map(node => node.getAttribute(attribute)));
  if (values.size !== 1) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  return [...values][0];
}

// Window-local identity attributes only. No transcript, draft, host module or state extraction.
// These DOM markers are an internal compatibility boundary, not a stable public SDK.
export function readPanelIdentity(doc = document) {
  const panes = doc.querySelectorAll('[data-session-pane][data-visible="true"]');
  const rows = panes.length ? panes : doc.querySelectorAll('.thread-item.active[data-sidebar-session-row]');
  if (rows.length) {
    const sessionId = unique(rows, panes.length ? 'data-session-pane' : 'data-sidebar-session-row');
    if (!ID.test(sessionId || '') || sessionId.includes('..')) throw fail('PANEL_CONTEXT_UNAVAILABLE');
    return { sessionId, projectPath: null };
  }
  const projects = doc.querySelectorAll('[data-sidebar-project-group][data-current-workspace="true"]');
  if (projects.length) return { sessionId: null, projectPath: checkedPath(unique(projects, 'data-sidebar-project-group')) };
  if (!doc.querySelector('.session-panes, [data-testid="home-empty"], .sidebar')) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  throw fail('NO_PANEL_PROJECT');
}

export async function connectPanelContext(doc = document, { resolveSession } = {}) {
  if (!doc?.documentElement || typeof doc.defaultView?.MutationObserver !== 'function') throw fail('PANEL_CONTEXT_UNAVAILABLE');
  const listeners = new Set(), waiters = new Set();
  let stopped = false, version = 0, desiredKey = null, selection = null, errorCode = 'PANEL_CONTEXT_CHANGING';
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  const notify = () => { if (!stopped) { wake(); for (const listener of listeners) listener(); } };
  const sync = (retry = false) => {
    if (stopped) return;
    let identity, code = '';
    try { identity = readPanelIdentity(doc); } catch (error) { code = error.code || 'PANEL_CONTEXT_UNAVAILABLE'; }
    const key = code || JSON.stringify(identity);
    if (key === desiredKey && !(retry && identity?.sessionId && errorCode !== 'PANEL_CONTEXT_CHANGING' && !selection)) return;
    desiredKey = key; const generation = ++version; selection = null;
    errorCode = code || 'PANEL_CONTEXT_CHANGING';
    if (identity && !identity.sessionId) {
      selection = Object.freeze({ ...identity, contextVersion: generation }); errorCode = '';
    } else if (identity) {
      // The injected resolver uses the same fixed sessionGet channel as save-time ownership checks.
      void Promise.resolve().then(async () => {
        if (stopped || generation !== version) return;
        if (typeof resolveSession !== 'function') throw fail('PANEL_CONTEXT_UNAVAILABLE');
        const resolved = await resolveSession(identity.sessionId);
        if (stopped) return;
        sync(); // Re-read before accepting an asynchronous response, even if observer delivery is delayed.
        if (generation !== version) return;
        if (resolved?.sessionId !== identity.sessionId) throw fail('PANEL_CONTEXT_UNAVAILABLE');
        const projectPath = checkedPath(resolved.projectPath);
        selection = Object.freeze({ sessionId: identity.sessionId, projectPath, contextVersion: generation });
        errorCode = ''; notify();
      }).catch(error => {
        if (stopped) return;
        sync();
        if (generation !== version) return;
        errorCode = ['REMOTE_PROJECT', 'NO_PANEL_PROJECT'].includes(error.code) ? error.code : 'PANEL_CONTEXT_UNAVAILABLE';
        notify();
      });
    }
    notify();
  };
  const observer = new doc.defaultView.MutationObserver(() => sync());
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-session-pane', 'data-visible', 'data-sidebar-session-row', 'class', 'data-sidebar-project-group', 'data-current-workspace'] });
  const focus = () => sync(true);
  const visible = () => { if (!doc.hidden) sync(true); };
  doc.defaultView.addEventListener('focus', focus); doc.addEventListener('visibilitychange', visible);
  sync();
  return {
    async ready() {
      while (!stopped) {
        sync();
        if (selection) return selection;
        if (errorCode !== 'PANEL_CONTEXT_CHANGING') throw fail(errorCode);
        await new Promise(resolve => waiters.add(resolve));
      }
      throw fail('UNLOADED');
    },
    get() {
      if (stopped) throw fail('UNLOADED');
      sync();
      if (!selection) throw fail(errorCode);
      return selection;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    stop() {
      stopped = true; version++; wake(); listeners.clear(); observer.disconnect();
      doc.defaultView.removeEventListener('focus', focus); doc.removeEventListener('visibilitychange', visible);
    },
  };
}
