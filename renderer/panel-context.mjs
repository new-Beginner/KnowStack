import { normalizePath } from './native-memory.mjs';

const fail = code => Object.assign(new Error(code), { code });
const localPath = path => typeof path === 'string' && (/^[a-z]:[\\/]/i.test(path) || path.startsWith('/')) && !path.startsWith('//');

// Read only the same window-local store used by the host WorkPanel. Never use workspace.get:
// that sidecar workspace is shared and may belong to a different window.
export function panelSelection(state) {
  if (!state || !Array.isArray(state.sessions)) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  if (state.selectingSessionId) throw fail('PANEL_CONTEXT_CHANGING');
  const sessionId = state.activeSessionId;
  if (sessionId != null && sessionId !== '' && typeof sessionId !== 'string') throw fail('PANEL_CONTEXT_UNAVAILABLE');
  const session = sessionId ? state.sessions.find(item => item?.id === sessionId) : null;
  if (sessionId && !session) throw fail('PANEL_CONTEXT_CHANGING');
  const path = session ? session.projectPath : state.activeProjectPath;
  if (session?.source === 'remote' || session?.remoteHostKey || session?.remoteWorkspace ||
      (typeof path === 'string' && path.startsWith('remote-project:'))) throw fail('REMOTE_PROJECT');
  if (!path) throw fail('NO_PANEL_PROJECT');
  if (!localPath(path)) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  if (session && state.activeProjectPath && normalizePath(state.activeProjectPath) !== normalizePath(path)) throw fail('PANEL_CONTEXT_CHANGING');
  return { projectPath: normalizePath(path), sessionId: sessionId || null };
}

export function contextFromStore(store) {
  if (typeof store?.getState !== 'function' || typeof store?.subscribe !== 'function') throw fail('PANEL_CONTEXT_UNAVAILABLE');
  const get = () => panelSelection(store.getState());
  const stamp = () => { try { return JSON.stringify(get()); } catch (error) { return error.code || 'PANEL_CONTEXT_UNAVAILABLE'; } };
  return {
    get,
    subscribe(listener) {
      let previous = stamp();
      return store.subscribe(() => {
        const next = stamp();
        if (next !== previous) { previous = next; listener(); }
      });
    },
  };
}

// Internal host adapter, deliberately restricted to the current document's already-loaded
// local entry module. No guessed bundle hash/export name, store mutation or global IPC patching.
export async function connectPanelContext(doc = document, importModule = url => import(url)) {
  const page = new URL(doc.defaultView.location.href);
  if (page.protocol !== 'file:') throw fail('PANEL_CONTEXT_UNAVAILABLE');
  const scripts = [...doc.querySelectorAll('script[type="module"][src]')];
  const entries = [...new Set(scripts.map(script => new URL(script.src, page).href))].filter(href => {
    const url = new URL(href);
    return url.protocol === page.protocol && url.host === page.host &&
      url.pathname.startsWith(new URL('.', page).pathname) && /\/assets\/index-[\w-]+\.js$/.test(url.pathname) && !url.search && !url.hash;
  });
  if (entries.length !== 1) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  let module;
  try { module = await importModule(entries[0]); } catch { throw fail('PANEL_CONTEXT_UNAVAILABLE'); }
  const candidates = [...new Set(Object.values(module))].filter(value => {
    if (typeof value?.getState !== 'function' || typeof value?.subscribe !== 'function') return false;
    try {
      const state = value.getState();
      return state && Object.hasOwn(state, 'activeSessionId') && Object.hasOwn(state, 'activeProjectPath') &&
        Array.isArray(state.sessions) && Array.isArray(state.workPanelTabs);
    } catch { return false; }
  });
  if (candidates.length !== 1) throw fail('PANEL_CONTEXT_UNAVAILABLE');
  return contextFromStore(candidates[0]);
}
