'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function rig(t){
  const {createViewClient}=await import('../renderer/view-client.mjs');
  const {createMemoryEditor}=await import('../renderer/memory-editor.mjs');
  let active={sessionId:'a',projectPath:'D:/A'},poll,holdContext,holdMode;
  const listeners=new Map(),calls=[];
  const bridge={on(name,fn){listeners.set(name,fn);return()=>listeners.delete(name);},async invoke(channel,args){
    calls.push({channel,args});
    if(channel==='memory.context'){const value={...active};if(holdContext){const hold=holdContext;holdContext=null;return hold.promise;}return value;}
    if(channel==='memory.mode'){if(holdMode){const hold=holdMode;holdMode=null;return hold.promise;}return{autoSave:true,autoDelete:false};}
    if(channel==='memory.editor')return{status:'read',readToken:'token',project:{key:args.sessionId,path:'d:/'+args.sessionId,name:args.sessionId},entries:[{id:'one',title:args.sessionId,content:'memory '+args.sessionId}]};
    throw Error('unexpected channel');
  }};
  const client=createViewClient(bridge,{schedule(fn){poll=fn;return 1;},unschedule(){poll=null;}});
  const editor=createMemoryEditor(client.access,{context:client.context});
  t.after(()=>{editor.stop();client.stop();});await editor.load();await client.refresh();
  return{client,editor,calls,listeners,poll:()=>poll?.(),setActive(id){active={sessionId:id,projectPath:'D:/'+id.toUpperCase()};},activate(id){this.setActive(id);listeners.get('session:activated')?.({...active,activeTurn:null});},holdContext(value){holdContext=value;},holdMode(value){holdMode=value;}};
}
test('retained view starts reading target on activation without waiting for polling',async t=>{
  const r=await rig(t);r.calls.length=0;r.activate('b');await tick();
  assert.equal(r.editor.getState().projectKey,'b','activation must not wait for the 1500ms poll');
  assert.ok(r.calls.some(c=>c.channel==='memory.editor'&&c.args.sessionId==='b'));
  assert.ok(!r.calls.some(c=>c.args?.action==='save'));
});
test('switch overtakes pending old mode; late rejection cannot invalidate new context',async t=>{
  const r=await rig(t),old=deferred();r.holdMode(old);const pending=r.client.refresh();await tick();
  r.activate('b');await tick();assert.equal(r.editor.getState().projectKey,'b','old mode must not block B');
  old.reject(Error('old project disconnected'));await pending;await tick();
  assert.equal(r.client.context.get().sessionId,'b');assert.equal(r.editor.getState().needsRefresh,false);
});
test('switch overtakes pending old identity and ignores its late snapshot',async t=>{
  const r=await rig(t),old=deferred();r.holdContext(old);const pending=r.client.refresh();
  r.activate('b');await tick();assert.equal(r.editor.getState().projectKey,'b');
  old.resolve({sessionId:'a',projectPath:'D:/A'});await pending;await tick();
  assert.equal(r.client.context.get().sessionId,'b');assert.equal(r.editor.getState().projectKey,'b');
});
test('rapid B then A activation follows latest even before B identity returns',async t=>{
  const r=await rig(t),old=deferred();r.calls.length=0;r.holdContext(old);r.activate('b');assert.equal(r.calls.filter(c=>c.channel==='memory.context').length,1);r.activate('a');await tick();
  old.resolve({sessionId:'b',projectPath:'D:/B'});await tick();
  assert.equal(r.client.context.get().sessionId,'a');assert.equal(r.editor.getState().projectKey,'a');
});
test('turn-only activation does not reload or disturb draft; project change locks it',async t=>{
  const r=await rig(t);r.editor.update('one','content','keep draft');r.calls.length=0;
  r.activate('a');await tick();assert.equal(r.calls.length,0);
  r.activate('b');await tick();assert.equal(r.editor.getState().entries[0].content,'keep draft');
  assert.equal(r.editor.getState().needsRefresh,true);await r.editor.save();assert.ok(!r.calls.some(c=>c.args?.action==='save'));
});
test('poll repairs missed activation and stop removes the event listener',async t=>{
  const r=await rig(t);assert.ok(r.listeners.has('session:activated'));r.setActive('b');r.poll();await tick();assert.equal(r.editor.getState().projectKey,'b');
  r.client.stop();assert.ok(!r.listeners.has('session:activated'));const count=r.calls.length;r.activate('a');await tick();assert.equal(r.calls.length,count);
});
