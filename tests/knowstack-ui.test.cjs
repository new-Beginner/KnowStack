'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');
const manifest = require('../manifest.json');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function rendererHarness(handler = async method => method === 'mode' ? {autoSave:false} : null) {
  const {unwrapResult,STATUS_LABELS}=await import('../renderer/receipt-state.mjs');
  const {SETTINGS_CSS}=await import('../renderer/settings-ui.mjs');
  const {createMemoryAccess}=await import('../renderer/memory-editor.mjs');
  const {MEMORY_CSS}=await import('../renderer/memory-ui.mjs');
  const {THEME_CSS}=await import('../renderer/theme.mjs');
  const {makeOutdatedCard,makeOutdatedEntry,createReminderEditor,OUTDATED_CSS}=await import('../renderer/outdated-ui.mjs');
  const source=fs.readFileSync(path.join(root,'renderer/knowstack.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const values=[]; const deps=new Map(); const cleanups=new Map(); const effects=[];
  let cursor=0; const intervals=new Set(); const registrations=[]; let disposed=0; const calls=[];
  const React={
    createElement:(type,props,...children)=>({type,props:props??{},children:children.flat()}),
    useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
    useEffect(fn,next){const i=cursor++;const previous=deps.get(i);if(!previous||next.some((v,n)=>v!==previous[n])){deps.set(i,next);effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,fn());});}},
  };
  const sandbox={module:{exports:{}},React,unwrapResult,STATUS_LABELS,SETTINGS_CSS,MEMORY_CSS,THEME_CSS,createMemoryAccess,makeOutdatedCard,makeOutdatedEntry,createReminderEditor,OUTDATED_CSS,
    runNativeJob:async()=>{throw new Error('No native job expected in UI-only tests');},
    console,
    setInterval(fn,ms){const timer={fn,ms,unref(){}};intervals.add(timer);return timer;},
    clearInterval(timer){intervals.delete(timer);},
  };
  vm.runInNewContext(source+'\nmodule.exports={onLoad,onUnload,makeCard};',sandbox);
  const pi={
    dispatch:async(action,payload)=>{
      assert.equal(action,'plugin.call');calls.push(payload);
      if(payload.method==='connect'){assert.equal(payload.args.version,manifest.version);return{lease:'lease'};}
      return handler(payload.method,payload.args);
    },
    ui:{injectStyle(css){assert.match(css,/focus-visible/);return()=>{disposed++;};}},
    slots:{register(definition){registrations.push(definition);return()=>{disposed++;};}},
  };
  await sandbox.module.exports.onLoad(pi);
  const component=registrations[0].component;
  return {calls,intervals,registrations,
    render(props, tool='read_memory'){cursor=0;const registration=registrations.find(r=>tool==='entryExtra'?r.slot===tool:r.toolName===tool);let tree=registration.component(props);const expand=node=>{if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return expand(node.type(node.props));return{...node,children:node.children.map(expand)};};tree=expand(tree);while(effects.length)effects.shift()();return tree;},
    cleanup(){for(const fn of cleanups.values())if(typeof fn==='function')fn();sandbox.module.exports.onUnload();},
    disposed:()=>disposed,
  };
}
function nodes(tree,type) {
  if(!tree||typeof tree!=='object')return[];
  return [...(tree.type===type?[tree]:[]),...(tree.children??[]).flatMap(child=>nodes(child,type))];
}
function text(tree) {
  if(typeof tree==='string')return tree;
  if(!tree||typeof tree!=='object')return'';
  return(tree.children??[]).map(text).join(' ');
}
const lesson={title:'缓存结构升级',content:'缓存结构升级后，必须清理旧缓存再运行。'};
const manual={batchId:'batch',sessionId:'a',status:'awaiting_review',items:[lesson],saved:[],skipped:[]};
const props=result=>({sessionId:'a',toolStatus:'success',toolResult:result});

test('renderer loads only new cards, polls no write on load, disposes registrations',async()=>{
  const r=await rendererHarness();
  assert.deepEqual(r.registrations.filter(x=>x.slot==='toolCard').map(x=>x.toolName),['read_memory','remember','update_memory','delete_memory','report_outdated_memory']);
  assert.equal(r.registrations.filter(x=>x.slot==='entryExtra').length,1);
  assert.equal(r.calls.some(x=>['review','report'].includes(x.method)),false);
  assert.equal(r.intervals.size,1);await [...r.intervals][0].fn();await tick();
  assert.equal(r.calls.at(-1).method,'next');r.cleanup();assert.equal(r.intervals.size,0);assert.equal(r.disposed(),7);
});
test('manual card shows exact content, not success; approve changes only after reply',async()=>{
  const r=await rendererHarness(async(method,args)=>{
    if(method==='mode')return{autoSave:false};
    if(method==='review'&&args.action==='approve')return{...manual,status:'saved',items:[],saved:[lesson]};
    return manual;
  });
  try {
    let tree=r.render(props(manual));await tick();tree=r.render(props(manual));
    assert.match(text(tree),/待确认/);assert.ok(!text(tree).includes('回读验证成功'));assert.match(text(tree),/缓存结构升级/);
    const approve=nodes(tree,'button').find(n=>text(n)==='保存这些记忆');assert.ok(approve);
    await approve.props.onClick();tree=r.render(props(manual));
    assert.match(text(tree),/回读验证成功/);assert.equal(nodes(tree,'button').length,0);
    assert.equal(r.calls.filter(x=>x.method==='review'&&x.args.action==='approve').length,1);
  }finally{r.cleanup();}
});
test('reject uses the original session and removes approval controls',async()=>{
  const r=await rendererHarness(async(method,args)=>method==='mode'?{autoSave:false}:{...manual,status:args.action==='reject'?'rejected':'awaiting_review',items:[]});
  try{
    let tree=r.render(props(manual));await tick();tree=r.render(props(manual));
    await nodes(tree,'button').find(n=>text(n)==='不保存').props.onClick();tree=r.render(props(manual));
    assert.match(text(tree),/已拒绝/);assert.equal(r.calls.find(x=>x.args.action==='reject').args.sessionId,'a');
  }finally{r.cleanup();}
});
test('per-project checkbox dispatches an explicit persisted mode change',async()=>{
  const r=await rendererHarness(async(method,args)=>method==='mode'?{autoSave:args.action==='set'?args.autoSave:false}:null);
  const result={status:'read',entries:[]};const p=props(result);
  try{
    let tree=r.render(p);await tick();tree=r.render(p);
    const checkbox=nodes(tree,'input')[0];assert.equal(checkbox.props.checked,false);assert.equal(checkbox.props.disabled,false);
    await checkbox.props.onChange();tree=r.render(p);assert.equal(nodes(tree,'input')[0].props.checked,true);
    assert.equal(r.calls.find(x=>x.args.action==='set').args.sessionId,'a');
  }finally{r.cleanup();}
});

test('unknown or failed auto-save lookup is not presented as disabled',async()=>{
  const r=await rendererHarness(async()=>{throw Error('offline');});const p=props({status:'read',entries:[],autoSave:true});
  try{
    let tree=r.render(p);assert.ok(!text(tree).includes('已关闭'),'pending state is not false');
    await tick();tree=r.render(p);assert.ok(!text(tree).includes('已关闭'),'failed lookup is not false');
    assert.equal(nodes(tree,'input')[0].props.disabled,true);assert.match(text(tree),/未确认|无法读取/);
  }finally{r.cleanup();}
});

test('tool completion rechecks enabled mode and clears a previous lookup error',async()=>{
  let available=false;const r=await rendererHarness(async()=>{if(!available)throw Error('not ready');return{autoSave:true};});
  try{
    const first=props({status:'read',entries:[]});r.render(first);await tick();assert.match(text(r.render(first)),/无法读取项目开关/);
    r.render({sessionId:'a',toolStatus:'running'});await tick();available=true;
    const p=props({status:'read',sessionId:'a',entries:[],autoSave:true});r.render(p);await tick();const tree=r.render(p);
    assert.equal(nodes(tree,'input')[0].props.checked,true);assert.match(text(tree),/已开启/);assert.ok(!text(tree).includes('无法读取项目开关'));
  }finally{r.cleanup();}
});
test('unverified, errors, empty duplicates, and cross-session results never appear saved',async()=>{
  for(const result of [{status:'unverified',saved:[],skipped:[],errorCode:'HOST_CALL_FAILED'}, {status:'failed',saved:[],skipped:[]}, {status:'skipped',saved:[],skipped:[]}, {...manual,sessionId:'b'}]) {
    const r=await rendererHarness();try{const tree=r.render(props(result));assert.ok(!text(tree).includes('回读验证成功'));if(result.status==='skipped')assert.equal(tree,null);}finally{r.cleanup();}
  }
});
test('memory HTML remains text; no raw HTML injection API is used',async()=>{
  const r=await rendererHarness();try{
    const tree=r.render(props({...manual,items:[{title:'<script>bad()</script>',content:'<img src=x onerror=bad()>'}]}));
    assert.equal(nodes(tree,'script').length,0);assert.equal(nodes(tree,'img').length,0);
    assert.ok(!fs.readFileSync(path.join(root,'renderer/knowstack.mjs'),'utf8').includes('dangerouslySetInnerHTML'));
  }finally{r.cleanup();}
});
test('new main registers only formal tools and forwards trusted context',async()=>{
  const registered=[];const removed=[];const events=[];let stopped=0;
  const source=fs.readFileSync(path.join(root,manifest.main),'utf8');
  const realRequire=createRequire(path.join(root,manifest.main));
  const fakeService={update(){return{status:'updated'};},delete(){return{status:'deleted'};},stop(){stopped++;},read(args,ctx){events.push({kind:'read',args,ctx});return{status:'read'};},remember(args,ctx){events.push({kind:'remember',args,ctx});return{status:'skipped'};},reportOutdated(args,ctx){events.push({kind:'outdated',args,ctx});return{status:'reported'};},renderer(method,args){return{method,args};}};
  const sandbox={module:{exports:{}},require:name=>name==='./memory-service.js'?{createService:()=>fakeService}:realRequire(name),pi:{agent:{registerTool:async x=>registered.push(x),unregisterTool:async name=>removed.push(name)}}};
  vm.runInNewContext(source,sandbox);await sandbox.module.exports.onLoad();
  assert.deepEqual(registered.map(t=>t.name),manifest.contributes.agentTools.map(t=>t.name));assert.equal(events.length,0);
  const ctx={sessionId:'real-session',turnId:'real-turn'};
  await registered[0].execute({},ctx);await registered[1].execute({items:[]},ctx);await registered[2].execute({items:[]},ctx);
  assert.ok(events.every(e=>e.ctx===ctx));assert.equal(events[2].kind,'outdated');
  await sandbox.module.exports.onUnload();assert.equal(stopped,1);assert.deepEqual(removed,manifest.contributes.agentTools.map(t=>t.name));
  await assert.rejects(sandbox.module.exports.onRendererCall('next',{}),/not loaded/);
});

const warning={status:'reported',reportId:'report',sessionId:'a',items:[{memoryId:'old',title:'旧构建规则',content:'项目使用旧工具。',reason:'配置已迁移',evidence:'package.json 已核对',state:'pending'}],saved:[]};
test('outdated card exposes only inspect and ignore, never delete or save',async()=>{
  const r=await rendererHarness(async(method,args)=>{assert.equal(method,'outdated');return{...warning,items:warning.items.map(i=>({...i,state:args.action==='dismiss'?'dismissed':'pending'}))};});
  try{
    const p=props(warning);let tree=r.render(p,'report_outdated_memory');await tick();tree=r.render(p,'report_outdated_memory');
    assert.match(text(tree),/疑似过时/);assert.match(text(tree),/未修改原生记忆/);assert.match(text(tree),/依据（模型提供/);
    assert.deepEqual(nodes(tree,'button').map(n=>text(n)),['打开记忆并定位','本次忽略']);assert.equal(nodes(tree,'input').length,0);
    await nodes(tree,'button').find(n=>text(n)==='本次忽略').props.onClick();tree=r.render(p,'report_outdated_memory');
    assert.match(text(tree),/本次已忽略/);assert.equal(nodes(tree,'button').length,0);assert.ok(r.calls.every(c=>['connect','outdated'].includes(c.method)));
  }finally{r.cleanup();}
});
test('stale/moved reminder card cannot open and failed refresh keeps controls disabled',async()=>{
  for(const failure of ['expired','offline']) {
    const r=await rendererHarness(async()=>{if(failure==='offline')throw Error('offline');return{...warning,status:'expired',errorCode:'SESSION_MOVED',items:warning.items.map(i=>({...i,state:'unavailable'}))};});
    try{const p=props(warning);r.render(p,'report_outdated_memory');await tick();const tree=r.render(p,'report_outdated_memory');
      assert.ok(nodes(tree,'button').every(n=>n.props.disabled));assert.match(text(tree),/失效|不可用/);
    }finally{r.cleanup();}
  }
});
test('cross-session reminders issue no inspection call and render no actionable controls',async()=>{
  const r=await rendererHarness();try{const tree=r.render(props({...warning,sessionId:'other'}),'report_outdated_memory');await tick();
    assert.match(text(tree),/不匹配/);assert.equal(nodes(tree,'button').length,0);assert.equal(r.calls.some(c=>c.method==='outdated'),false);
  }finally{r.cleanup();}
});
test('outdated reason/evidence are rendered as text, including HTML-like payloads',async()=>{
  const value={...warning,items:[{...warning.items[0],reason:'<img src=x onerror=bad()>',evidence:'<script>bad()</script>'}]};
  const r=await rendererHarness(async()=>value);try{const tree=r.render(props(value),'report_outdated_memory');
    assert.equal(nodes(tree,'img').length,0);assert.equal(nodes(tree,'script').length,0);assert.match(text(tree),/<script>/);
  }finally{r.cleanup();}
});

const finalId='12345678-1234-1234-1234-123456789abc';
const marker=`<!-- knowstack-outdated:${finalId} -->`;
const finalProps=(content=`任务结束。\n${marker}`)=>({sessionId:'a',messageId:'final',message:{id:'final',role:'assistant',content}});
test('final-answer entry independently loads the real report with tool cards never mounted',async()=>{
  const value={...warning,reportId:finalId};
  const r=await rendererHarness(async(method,args)=>{assert.equal(method,'outdated');assert.equal(args.reportId,finalId);assert.equal(args.sessionId,'a');return{...value,items:value.items.map(i=>({...i,state:args.action==='dismiss'?'dismissed':'pending'}))};});
  try{
    let tree=r.render(finalProps(),'entryExtra');assert.match(text(tree),/正在核对提醒/);assert.equal(nodes(tree,'button').length,0);
    await tick();tree=r.render(finalProps(),'entryExtra');assert.match(text(tree),/过时记忆待检查/);assert.match(text(tree),/旧构建规则/);
    assert.equal(nodes(tree,'section')[0].props['aria-live'],'polite');assert.equal(nodes(tree,'details').length,2);
    assert.deepEqual(nodes(tree,'button').map(n=>text(n)),['打开记忆并定位','本次忽略']);
    const calls=r.calls.length;tree=r.render(finalProps(),'entryExtra');await tick();assert.equal(r.calls.length,calls,'new props object must not refetch on every stream update');
    await nodes(tree,'button')[1].props.onClick();tree=r.render(finalProps(),'entryExtra');assert.match(text(tree),/本次已忽略/);assert.equal(nodes(tree,'button').length,0);
  }finally{r.cleanup();}
});
test('unmarked, malformed, mismatched and user messages render no final card and make no lookup',async()=>{
  const r=await rendererHarness();try{
    for(const p of [finalProps('普通结果'),finalProps('<!-- knowstack-outdated:invented -->'),{...finalProps(),messageId:'wrong'},{...finalProps(),sessionId:''},{...finalProps(),message:{...finalProps().message,role:'user'}}])assert.equal(r.render(p,'entryExtra'),null);
    assert.equal(r.calls.some(c=>c.method==='outdated'),false);
  }finally{r.cleanup();}
});
test('copied cross-session marker and unloaded final reminder never reveal original memory or enable controls',async()=>{
  for(const cause of ['another session','expired']){
    const r=await rendererHarness(async()=>{throw Error(cause);});try{
      r.render(finalProps(),'entryExtra');await tick();const tree=r.render(finalProps(),'entryExtra');
      assert.match(text(tree),/提醒已失效或连接不可用/);assert.doesNotMatch(text(tree),/旧构建规则/);assert.equal(nodes(tree,'button').length,0);
    }finally{r.cleanup();}
  }
});
test('final marker extraction accepts host text parts, deduplicates and bounds report cards',async()=>{
  const {finalReminderIds}=await import('../renderer/outdated-ui.mjs');
  assert.deepEqual(finalReminderIds({role:'assistant',content:[{type:'thinking',text:marker},{type:'text',text:`${marker}\n${marker}`}]}),[finalId]);
  assert.deepEqual(finalReminderIds({role:'assistant',text:marker}),[finalId]);
  assert.deepEqual(finalReminderIds({role:'assistant',content:[{type:'toolCall',text:marker}]}),[]);
  assert.deepEqual(finalReminderIds({role:'assistant',content:`prefix ${marker}`}),[]);
  assert.equal(finalReminderIds({role:'assistant',content:[1,2,3,4].map(n=>marker.replace('12345678',`1234567${n}`)).join('\n')}).length,3);
});
test('receipt markers inside fenced examples, indented code and quotes do not attach final cards',async()=>{
  const {finalReminderIds}=await import('../renderer/outdated-ui.mjs');
  for(const content of [`\`\`\`html\n${marker}\n\`\`\``,`~~~text\n${marker}\n~~~`,`    ${marker}`,`> ${marker}`])assert.deepEqual(finalReminderIds({role:'assistant',content}),[]);
  assert.deepEqual(finalReminderIds({role:'assistant',content:`\`\`\`\nexample\n\`\`\`\n${marker}`}),[finalId]);
});
