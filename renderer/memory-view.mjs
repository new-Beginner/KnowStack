import { createMemoryEditor } from './memory-editor.mjs';
import { mountMemoryEditor, MEMORY_CSS } from './memory-ui.mjs';
import { createViewClient } from './view-client.mjs';
import { THEME_CSS } from './theme.mjs';
export async function bootMemoryView(bridge = globalThis.pluginBridge, doc = document) {
  const style=doc.createElement('style');style.textContent=MEMORY_CSS+THEME_CSS;
  const themeStyle=doc.createElement('style');themeStyle.id='knowstack-host-theme';doc.head.append(style,themeStyle);
  let stopped=false,appearanceChanged=false,unsubscribe;
  const apply=appearance=>{
    if(stopped)return;
    const base=appearance?.base==='dark'?'dark':'light';
    doc.documentElement.dataset.base=base;doc.documentElement.dataset.theme=base;
    doc.documentElement.lang=appearance?.locale || 'zh-CN';
    themeStyle.textContent=typeof appearance?.pluginTheme?.css==='string'?appearance.pluginTheme.css:'';
  };
  apply({base:doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'});
  try { unsubscribe=bridge.on?.('appearance:changed',value=>{appearanceChanged=true;apply(value);}); } catch {}
  // Appearance is independent of memory data: do not keep the page blank for it.
  void Promise.resolve().then(()=>bridge.invoke('app.getAppearance')).then(value=>{if(!appearanceChanged)apply(value);}).catch(()=>{});
  const client=createViewClient(bridge);
  const editor=createMemoryEditor(client.access,{context:client.context});
  const unmount=mountMemoryEditor(doc.getElementById('memory-root'),editor,()=>{},doc,{inline:true,modes:client.modes});
  void editor.load();
  return {client,editor,stop(){stopped=true;unmount();editor.stop();client.stop();unsubscribe?.();style.remove();themeStyle.remove();}};
}
if(globalThis.document?.getElementById('memory-root') && globalThis.pluginBridge){
  void bootMemoryView().then(view=>{globalThis.addEventListener('pagehide',()=>view.stop(),{once:true});}).catch(()=>{
    const error=document.createElement('p');error.id='boot-error';error.textContent='项目记忆未能加载。请重载插件并确认侧栏视图权限。';document.getElementById('memory-root').append(error);
  });
}
