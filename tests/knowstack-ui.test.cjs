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
  const source=fs.readFileSync(path.join(root,'renderer/knowstack.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const values=[]; const deps=new Map(); const cleanups=new Map(); const effects=[];
  let cursor=0; const intervals=new Set(); const registrations=[]; let disposed=0; const calls=[];
  const React={
    createElement:(type,props,...children)=>({type,props:props??{},children:children.flat()}),
    useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
    useEffect(fn,next){const i=cursor++;const previous=deps.get(i);if(!previous||next.some((v,n)=>v!==previous[n])){deps.set(i,next);effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,fn());});}},
  };
  const sandbox={module:{exports:{}},React,unwrapResult,STATUS_LABELS,SETTINGS_CSS,
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
    render(props){cursor=0;const tree=component(props);while(effects.length)effects.shift()();return tree;},
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
  assert.deepEqual(r.registrations.map(x=>x.toolName),['read_memory','remember']);
  assert.equal(r.calls.some(x=>['review','report'].includes(x.method)),false);
  assert.equal(r.intervals.size,1);await [...r.intervals][0].fn();await tick();
  assert.equal(r.calls.at(-1).method,'next');r.cleanup();assert.equal(r.intervals.size,0);assert.equal(r.disposed(),3);
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
  const source=fs.readFileSync(path.join(root,'knowstack-main.js'),'utf8');
  const realRequire=createRequire(path.join(root,'knowstack-main.js'));
  const fakeService={stop(){stopped++;},read(args,ctx){events.push({kind:'read',args,ctx});return{status:'read'};},remember(args,ctx){events.push({kind:'remember',args,ctx});return{status:'skipped'};},renderer(method,args){return{method,args};}};
  const sandbox={module:{exports:{}},require:name=>name==='./memory-service.js'?{createService:()=>fakeService}:realRequire(name),pi:{agent:{registerTool:async x=>registered.push(x),unregisterTool:async name=>removed.push(name)}}};
  vm.runInNewContext(source,sandbox);await sandbox.module.exports.onLoad();
  assert.deepEqual(registered.map(t=>t.name),['read_memory','remember']);assert.equal(events.length,0);
  const ctx={sessionId:'real-session',turnId:'real-turn'};
  await registered[0].execute({},ctx);await registered[1].execute({items:[]},ctx);
  assert.equal(events[0].ctx,ctx);assert.equal(events[1].ctx,ctx);
  await sandbox.module.exports.onUnload();assert.equal(stopped,1);assert.deepEqual(removed,['read_memory','remember']);
  await assert.rejects(sandbox.module.exports.onRendererCall('next',{}),/not loaded/);
});
