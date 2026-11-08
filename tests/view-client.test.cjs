'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const modulePromise=import('../renderer/view-client.mjs');
async function rig(t){
  const {createViewClient}=await modulePromise;let active={sessionId:'a',projectPath:'D:/A'},counter=0;const config={autoSave:true,autoDelete:false},calls=[];
  const entries=[{id:'one',title:'仓库地址',content:'https://example.org/repo'}];let poll;
  const bridge={async invoke(channel,args){calls.push({channel,args});
    if(channel==='memory.context'){if(!active)throw Error('NO_PANEL_PROJECT');return{...active};}
    if(args.sessionId!==active?.sessionId)throw Error('PANEL_CONTEXT_CHANGED');
    if(channel==='memory.mode'){if(args.action==='set')for(const key of ['autoSave','autoDelete'])if(key in args)config[key]=args[key];return{...config};}
    if(channel==='memory.editor'){if(args.action==='save'){entries.splice(0,entries.length,...structuredClone(args.entries));return{status:'replaced'};}return{status:'read',entries:structuredClone(entries),readToken:'token'+counter++,project:{key:'group:'+active.sessionId,path:active.projectPath.toLowerCase(),name:active.sessionId,paths:[active.projectPath.toLowerCase()]}};}
    throw Error('unknown');
  }};
  const client=createViewClient(bridge,{schedule(fn){poll=fn;return 1;},unschedule(){poll=null;}});t.after(()=>client.stop());await client.refresh();
  return{client,calls,config,entries,setActive:value=>{active=value;},poll:()=>poll?.()};
}
test('view settings share backend and refresh both directions without memory writes',async t=>{
  const r=await rig(t);assert.equal(r.client.modes.getState().autoDelete,false);
  await r.client.modes.set('autoDelete',true);assert.equal(r.config.autoDelete,true);assert.equal(r.client.modes.getState().autoSave,true);
  r.config.autoSave=false;await r.client.refresh();assert.equal(r.client.modes.getState().autoSave,false);
  assert.ok(!r.calls.some(c=>c.channel==='memory.editor'));
});
test('view read and successive user saves refresh one-use read tokens',async t=>{
  const r=await rig(t);const selected=r.client.context.get();const current=await r.client.access.current(selected);const basis=await r.client.access.read(current.project);
  const result=await r.client.access.save(basis,[{...r.entries[0],content:'长期规则已更新'}],{selection:selected,isCurrent:()=>true});
  assert.equal(result.status,'saved');assert.notEqual(result.basis.readToken,basis.readToken);assert.equal(result.basis.entries[0].id,'one');
});
test('project switch invalidates old selection and never redirects old draft',async t=>{
  const r=await rig(t);const selected=r.client.context.get();await r.client.access.current(selected);const basis=await r.client.access.read({key:'group:a'});
  r.setActive({sessionId:'b',projectPath:'D:/B'});await r.client.refresh();
  const result=await r.client.access.save(basis,[],{selection:selected,isCurrent:()=>true});assert.equal(result.errorCode,'PANEL_CONTEXT_CHANGED');
  assert.ok(!r.calls.some(c=>c.channel==='memory.editor'&&c.args.action==='save'));
});
test('missing project disables switches and returns no arbitrary fallback',async t=>{
  const r=await rig(t);r.setActive(null);await r.client.refresh();assert.throws(()=>r.client.context.get(),/NO_PANEL_PROJECT/);assert.equal(r.client.modes.getState().loaded,false);
});

test('context and editor become ready while a slow mode request is still pending',async t=>{
  const {createViewClient}=await modulePromise;let release;const slow=new Promise(r=>{release=r;});const calls=[];
  const client=createViewClient({async invoke(channel){calls.push(channel);if(channel==='memory.context')return{sessionId:'a',projectPath:'D:/A'};if(channel==='memory.mode')return slow;if(channel==='memory.editor')return{status:'read',readToken:'t',project:{key:'a'},entries:[]};}},{schedule:()=>0,unschedule(){}});
  t.after(()=>{release({autoSave:true,autoDelete:false});client.stop();});
  const ready=client.context.ready();let selected;void ready.then(v=>{selected=v;});
  await new Promise(r=>setImmediate(r));assert.ok(selected,'mode response must not gate project identity');
  await client.access.current(selected);assert.ok(calls.includes('memory.editor'));assert.equal(client.modes.getState().loaded,false);
  release({autoSave:true,autoDelete:false});await client.refresh();assert.equal(client.modes.getState().loaded,true);
});

test('unload ignores late context and mode responses',async t=>{
  const {createViewClient}=await modulePromise;let release;const slow=new Promise(r=>{release=r;});
  const client=createViewClient({invoke:()=>slow},{schedule:()=>0,unschedule(){}});t.after(()=>client.stop());
  const pending=client.refresh();client.stop();release({sessionId:'a',projectPath:'D:/A'});await pending;
  assert.throws(()=>client.context.get(),/UNLOADED/);assert.equal(client.modes.getState().loaded,false);
});

test('mode failure after early memory load preserves draft and blocks unsafe save',async t=>{
  const {createViewClient}=await modulePromise;const {createMemoryEditor}=await import('../renderer/memory-editor.mjs');
  let rejectMode,writes=0;const slow=new Promise((resolve,reject)=>{rejectMode=reject;});
  const client=createViewClient({async invoke(channel,args){
    if(channel==='memory.context')return{sessionId:'a',projectPath:'D:/A'};
    if(channel==='memory.mode')return slow;
    if(channel==='memory.editor'){if(args.action==='save')writes++;return{status:'read',readToken:'t',project:{key:'a',path:'d:/a'},entries:[{id:'one',title:'规则',content:'原内容'}]};}
  }},{schedule:()=>0,unschedule(){}});
  const editor=createMemoryEditor(client.access,{context:client.context});t.after(()=>{rejectMode(Error('offline'));editor.stop();client.stop();});
  await editor.load();assert.equal(editor.getState().loaded,true);assert.equal(client.modes.getState().loaded,false);
  editor.update('one','content','保留草稿');rejectMode(Error('offline'));await client.refresh();
  assert.equal(editor.getState().entries[0].content,'保留草稿');assert.equal(editor.getState().dirty,true);assert.equal(editor.getState().needsRefresh,true);
  await editor.save();assert.equal(writes,0);assert.equal(client.modes.getState().loaded,false);
});
