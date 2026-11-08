import { normalizePath } from './native-memory.mjs';
const fail = code => Object.assign(new Error(code), { code });
export function createViewClient(bridge, { schedule = setInterval, unschedule = clearInterval } = {}) {
  let stopped = false, selection = null, version = 0, pending = null, contextPending = null, changing = false, cached = null, contextError = 'PANEL_CONTEXT_CHANGING';
  let generation = 0, requestedKey = '', unsubscribeActivation;
  const identity = value => JSON.stringify([value?.sessionId ?? '', normalizePath(value?.projectPath) ?? '']);
  let mode = { autoSave: false, autoDelete: false, loaded: false, busy: false, error: '' };
  const contexts = new Set(), modes = new Set();
  const invoke = (channel, args) => { if (stopped) throw fail('UNLOADED'); return bridge.invoke(channel, args); };
  const publishMode = patch => { if (!stopped) { mode = {...mode,...patch}; for (const fn of modes) fn(mode); } };
  const same = s => !!selection && s?.sessionId === selection.sessionId && s?.contextVersion === selection.contextVersion;
  const refresh = () => {
    if (pending) return pending;
    const epoch = generation;
    // Only project identity is a prerequisite for the editor. Modes finish in
    // the background; refresh() still waits for both for explicit callers.
    contextPending = (async () => {
        const next = await invoke('memory.context');
        if (stopped || epoch !== generation) return;
        if (!next?.sessionId || !normalizePath(next.projectPath)) throw fail('NO_PANEL_PROJECT');
        requestedKey = identity(next);
        if (next.sessionId !== selection?.sessionId || normalizePath(next.projectPath) !== selection?.projectPath) {
          selection = Object.freeze({ sessionId: next.sessionId, projectPath: normalizePath(next.projectPath), contextVersion: ++version });
          contextError = ''; cached = null; publishMode({loaded:false,error:''}); for (const fn of contexts) fn();
        }
        return selection;
    })();
    pending = (async () => {
      try {
        const selected = await contextPending;
        if (stopped || epoch !== generation) return;
        if (!changing) {
          const value = await invoke('memory.mode',{action:'get',sessionId:selected.sessionId});
          if (epoch === generation && same(selected)) publishMode({...value,loaded:true,error:''});
        }
      } catch (error) {
        if (stopped || epoch !== generation) return;
        const code = ['NO_PANEL_PROJECT','PANEL_CONTEXT_CHANGED'].includes(error?.code || error?.message) ? (error.code || error.message) : 'PANEL_CONTEXT_UNAVAILABLE';
        if (selection || contextError !== code) { selection=null; cached=null; version++; contextError=code; for (const fn of contexts) fn(); }
        publishMode({loaded:false,error:'无法核对当前项目或开关，请重新读取。'});
      } finally { if (epoch === generation) pending=null; }
    })();
    return pending;
  };
  const get = () => { if (stopped) throw fail('UNLOADED'); if (!selection) throw fail(contextError); return selection; };
  const read = async selected => {
    const result = await invoke('memory.editor',{action:'read',sessionId:selected.sessionId});
    if (!same(selected)) throw fail('PANEL_CONTEXT_CHANGED');
    if (result.status !== 'read') throw Object.assign(fail(result.errorCode || 'HOST_CALL_FAILED'), { step: result.errorStep });
    return { ...result, stamp: result.readToken, sessionId: selected.sessionId };
  };
  const context = { get, async ready(){void refresh();await contextPending.catch(()=>{});return get();}, subscribe(fn){contexts.add(fn);return()=>contexts.delete(fn);} };
  const access = {
    async current(selected) { if (!same(selected)) throw fail('PANEL_CONTEXT_CHANGED'); cached = await read(selected); return {projects:[cached.project],project:cached.project}; },
    async projects(){const selected=get();cached=await read(selected);return[cached.project];},
    async read(project){if(!cached||cached.project.key!==project.key)throw fail('PANEL_CONTEXT_CHANGED');return cached;},
    async save(basis, entries, options = {}) {
      if (!same(options.selection) || !options.isCurrent?.()) return {status:'failed',errorCode:'PANEL_CONTEXT_CHANGED'};
      let attempted=false;
      try {
        attempted=true;
        const result=await invoke('memory.editor',{action:'save',sessionId:basis.sessionId,readToken:basis.readToken,entries});
        if(result.status!=='replaced')return result;
        const after=await read(options.selection);
        return {status:'saved',basis:after};
      } catch { return {status:attempted?'unverified':'failed',errorCode:'HOST_CALL_FAILED'}; }
    },
  };
  const modeController = {
    getState:()=>mode,
    subscribe(fn){modes.add(fn);fn(mode);return()=>modes.delete(fn);},
    async set(key,value) {
      if(stopped||changing||!mode.loaded||!['autoSave','autoDelete'].includes(key)||typeof value!=='boolean')return;
      const selected=get();changing=true;publishMode({busy:true,error:''});
      try {
        const result=await invoke('memory.mode',{action:'set',sessionId:selected.sessionId,[key]:value});
        if(same(selected))publishMode({...result,loaded:true});
      } catch { if(same(selected))publishMode({loaded:false,error:'开关未确认保存，请刷新核对。'}); }
      finally{changing=false;publishMode({busy:false});}
    },
  };
  // A retained docked view is not cold-booted when the selected chat changes.
  // Use the documented event as a hint, then keep the existing host recheck.
  const activated = value => {
    const key = identity(value);
    if (stopped || key === requestedKey) return; // Ignore turn-only updates.
    requestedKey = key; generation++; pending = null;
    void refresh(); // A new selection must not join the old project's refresh.
  };
  try { unsubscribeActivation = bridge.on?.('session:activated', activated); } catch {}
  const timer=schedule(()=>{void refresh();},1500);timer?.unref?.();
  return {context,access,modes:modeController,refresh,stop(){stopped=true;unschedule(timer);unsubscribeActivation?.();contexts.clear();modes.clear();}};
}
