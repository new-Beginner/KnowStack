'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService, validateItems, novel } = require('../memory-service.js');
const manifest = require('../manifest.json');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const nativeModule = import(pathToFileURL(path.join(__dirname, '../renderer/native-memory.mjs')).href);
const clone = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setImmediate(resolve));
const lesson = { title: '缓存结构升级', content: '缓存结构升级后，必须清理旧缓存再运行。' };
const old = { id: 'manual-old', title: '保留原有约定', content: '原有手写记忆必须完整保留。' };

async function rig(t, options = {}) {
  const native = await nativeModule;
  const sessions = { a: 'D:/alpha', b: 'D:/beta', c: 'D:/alpha' };
  const groups = [{ id: 'ga', legacy: false, roots: [{path:'D:/alpha'}] }, { id:'gb', legacy:false, roots:[{path:'D:/beta'}] }];
  const stores = new Map([['ga', clone(options.entries ?? [old])], ['gb', []]]);
  const revisions = new Map(); const calls = [];
  const config = { autoSave: options.autoSave ?? true, projectModes: '{}' };
  let clock = Date.now();
  const service = createService({
    getSession: options.nativeSession ? undefined : async ({sessionId}) => ({sessionId,projectPath:sessions[sessionId],source:'created'}),
    getSettings: async () => clone(config), setSettings: async partial => Object.assign(config, partial),
    now: () => clock, rpcTimeout: options.rpcTimeout ?? 1000,
  });
  t.after(() => service.stop());
  const keys=['sessionGet','projectGroupList','projectGroupMemoryGet','projectGroupMemorySave','projectMemoryGet','projectMemorySave'];
  const bridge = { channels:{invoke:Object.fromEntries(keys.map(k=>[k,k]))}, invoke:async (key,input) => {
    calls.push({key,input:clone(input ?? {})});
    await options.hook?.({key,input,calls,sessions,stores,groups});
    if (key==='sessionGet') return {ok:true,data:{session:{id:input.id,projectPath:sessions[input.id],source:'desktop'}}};
    if (key==='projectGroupList') return {ok:true,data:{groups:clone(groups)}};
    const id = input.groupId ?? (input.projectPath.toLowerCase().includes('alpha') ? 'ga':'gb');
    if (key.endsWith('Save')) {
      stores.set(id,clone(input.entries)); revisions.set(id,(revisions.get(id)??0)+1);
      if (options.loseSaveResponse) throw new Error('private host error SECRET');
    }
    const entries=clone(stores.get(id)??[]);
    const memory={entries,content:entries.map(e=>`# ${e.title}\n${e.content}`).join('\n\n'),updatedAt:String(revisions.get(id)??0)};
    if (options.memory) Object.assign(memory, options.memory);
    if (options.badReadBack && calls.some(c=>c.key.endsWith('Save'))) { memory.entries=[]; memory.content=''; }
    return {ok:true,data:{memory}};
  }};
  const {lease}=await service.renderer('connect',{version:manifest.version});
  const ctx = (sid='a',turn='turn1') => ({sessionId:sid,turnId:turn,mode:'agent'});
  async function pump(promise) {
    let done=false,value,error;
    Promise.resolve(promise).then(x=>{done=true;value=x;},e=>{done=true;error=e;});
    for (let i=0;i<500&&!done;i++) {
      await tick();
      const job=await service.renderer('next',{lease});
      if (job) await service.renderer('report',{lease,id:job.id,result:await native.runNativeJob(bridge,job)});
    }
    if (!done) throw new Error('Test pump did not settle');
    if (error) throw error; return value;
  }
  const read = (sid='a',turn='turn1') => pump(service.read({},ctx(sid,turn)));
  const remember = (basis,items=[lesson],sid='a',turn='turn1') => pump(service.remember({readToken:basis.readToken,items},ctx(sid,turn)));
  return {service,bridge,native,sessions,groups,stores,calls,config,lease,ctx,pump,read,remember,
    review:(batch,action='approve',sid='a')=>pump(service.renderer('review',{lease,batchId:batch.batchId,sessionId:sid,action})),
    advance:ms=>{clock+=ms;}, writes:()=>calls.filter(c=>c.key.endsWith('Save'))};
}

test('0.4.1 manifest loads native append tools and visual memory editor, with no file or network permissions',()=>{
  assert.equal(manifest.version,'0.4.1'); assert.equal(manifest.main,'knowstack-main.js');
  assert.deepEqual(manifest.contributes.agentTools.map(t=>t.name),['read_memory','remember']);
  assert.ok(!manifest.permissions.some(p=>/^fs\.|net\.|desktop\./.test(p)));
  assert.deepEqual(manifest.contributes.agentExtensions,['knowstack-extension.js']);
  assert.equal(manifest.contributes.settings.find(x=>x.key==='autoSave').default,true);
  assert.equal(manifest.contributes.settings.some(x=>x.key==='projectModes'),false);
  assert.ok(manifest.rendererCallMethods.includes('projects'));
  assert.ok(!manifest.permissions.some(p => /^session\./.test(p)));
});
test('stable IDs, concise validation, no credential or unknown-field acceptance',()=>{
  assert.equal(validateItems([lesson])[0].id,validateItems([{...lesson,title:'新标题'}])[0].id);
  for(const items of [[{...lesson,title:'字'.repeat(25)}],[{...lesson,content:'字'.repeat(301)}],[{...lesson,content:'token=abcdefghijklmnopqrstuvwxyz'}],[{...lesson,extra:true}]]) assert.throws(()=>validateItems(items));
  assert.deepEqual(validateItems([]),[]);
});
test('no candidates means no session read, bridge call or write',async t=>{
  const r=await rig(t); const result=await r.service.remember({items:[]},{});
  assert.equal(result.status,'skipped'); assert.equal(r.calls.length,0);
});
test('read is bound to trusted session, never active UI; loading writes nothing',async t=>{
  const r=await rig(t); assert.equal(r.calls.length,0);
  const result=await r.read('a'); assert.equal(result.status,'read');assert.equal(result.entries[0].id,old.id);
  assert.ok(r.calls.filter(c=>c.key==='sessionGet').every(c=>c.input.id==='a'));
  assert.equal(r.writes().length,0);assert.equal(r.calls.some(c=>c.key==='projectGet'),false);
});
test('automatic mode appends and verifies, preserving old cards without deletion',async t=>{
  const r=await rig(t);const result=await r.remember(await r.read());
  assert.equal(result.status,'saved');assert.equal(r.writes().length,1);
  assert.deepEqual(r.stores.get('ga')[0],old);assert.deepEqual(result.saved[0],r.stores.get('ga')[1]);
});
test('same content under a different title is skipped without a card or write',async t=>{
  const r=await rig(t,{entries:[{id:'existing',...lesson}]});
  const result=await r.remember(await r.read(),[{...lesson,title:'另一标题'}]);
  assert.equal(result.status,'skipped');assert.equal(result.batchId,undefined);assert.equal(r.writes().length,0);
});
test('same-title correction does not rewrite or create another conflicting card',async t=>{
  const r=await rig(t,{entries:[{id:'existing',...lesson}]});
  const result=await r.remember(await r.read(),[{...lesson,content:'不同的结论需要明确更新权限。'}]);
  assert.equal(result.skipped[0].reason,'existing_topic');assert.equal(r.writes().length,0);
});
test('within-batch duplicates collapse to a single appended card',async t=>{
  const r=await rig(t);const result=await r.remember(await r.read(),[lesson,{...lesson,title:'换个标题'}]);
  assert.equal(result.saved.length,1);assert.equal(result.skipped.length,1);
});
test('a current-turn readToken is required and cannot cross sessions or turns',async t=>{
  const r=await rig(t); const basis=await r.read();
  for(const [token,ctx] of [['invented',r.ctx()],[basis.readToken,r.ctx('c')],[basis.readToken,r.ctx('a','turn2')]]) {
    await assert.rejects(r.service.remember({readToken:token,items:[lesson]},ctx),/Read current/);
  }
  assert.equal(r.writes().length,0);
});
test('expired readToken cannot generate a save request',async t=>{
  const r=await rig(t);const b=await r.read();r.advance(300001);
  await assert.rejects(r.service.remember({readToken:b.readToken,items:[lesson]},r.ctx()),/Read current/);
});
test('session moved since reading cannot redirect the saved memory',async t=>{
  const r=await rig(t);const b=await r.read();r.sessions.a='D:/beta';
  await assert.rejects(r.service.remember({readToken:b.readToken,items:[lesson]},r.ctx()),/Read current/);
  assert.equal(r.writes().length,0);
});
test('move between native initial read and final preflight stops saving',async t=>{
  let enabled=false;let sessionsRead=0;
  const r=await rig(t,{hook:({key,sessions})=>{if(enabled&&key==='sessionGet'&&++sessionsRead===2)sessions.a='D:/beta';}});
  const b=await r.read();enabled=true;const result=await r.remember(b);
  assert.equal(result.status,'failed');assert.equal(result.errorCode,'SESSION_MOVED');assert.equal(r.writes().length,0);
});
test('changed project-group membership cannot redirect a stale proposal',async t=>{
  const r=await rig(t);const b=await r.read();r.groups[0].id='new-group';
  const result=await r.remember(b);assert.equal(result.errorCode,'PROJECT_MEMBERSHIP_CHANGED');assert.equal(r.writes().length,0);
});
test('concurrent additions after model read invalidate the basis',async t=>{
  const r=await rig(t);const b=await r.read();r.stores.get('ga').push({id:'external',title:'外部变更',content:'另一会话的新内容。'});
  const result=await r.remember(b);assert.equal(result.errorCode,'STALE_BASIS');assert.equal(r.writes().length,0);
});
test('changes immediately before saving stop the whole-list write',async t=>{
  let enabled=false;let reads=0;
  const r=await rig(t,{hook:({key,stores})=>{if(enabled&&key==='projectGroupMemoryGet'&&++reads===2)stores.get('ga').push({id:'external',title:'并发变更',content:'不能覆盖。'});}});
  const b=await r.read();enabled=true;const result=await r.remember(b);
  assert.equal(result.errorCode,'CONCURRENT_CHANGE');assert.equal(r.writes().length,0);
});
test('manual mode requires genuine renderer approval; no write while pending',async t=>{
  const r=await rig(t,{autoSave:false});const batch=await r.remember(await r.read());
  assert.equal(batch.status,'awaiting_review');assert.equal(r.writes().length,0);
  const result=await r.review(batch);assert.equal(result.status,'saved');assert.equal(r.writes().length,1);
});
test('manual rejection and ignored cards never save',async t=>{
  const r=await rig(t,{autoSave:false});const batch=await r.remember(await r.read());
  const result=await r.review(batch,'reject');assert.equal(result.status,'rejected');
  await r.review(batch,'approve');assert.equal(r.writes().length,0);
});
test('approval is session-isolated, expires, and cannot duplicate on double-click',async t=>{
  const r=await rig(t,{autoSave:false});const b=await r.remember(await r.read());
  await assert.rejects(r.review(b,'approve','b'),/another session/);
  const p1=r.service.renderer('review',{lease:r.lease,batchId:b.batchId,sessionId:'a',action:'approve'});
  const p2=r.service.renderer('review',{lease:r.lease,batchId:b.batchId,sessionId:'a',action:'approve'});
  await r.pump(Promise.all([p1,p2]));assert.equal(r.writes().length,1);
  const r2=await rig(t,{autoSave:false});const b2=await r2.remember(await r2.read());r2.advance(900001);
  assert.equal((await r2.review(b2)).status,'expired');assert.equal(r2.writes().length,0);
});
test('manual proposal cannot save after its native basis changes',async t=>{
  const r=await rig(t,{autoSave:false});const b=await r.remember(await r.read());
  r.stores.get('ga').push({id:'other',title:'新规则',content:'原有记忆更新了。'});
  assert.equal((await r.review(b)).errorCode,'STALE_BASIS');assert.equal(r.writes().length,0);
});
test('project switch persists per project and never contains memory text',async t=>{
  const r=await rig(t);
  await r.service.renderer('mode',{lease:r.lease,sessionId:'a',action:'set',autoSave:false});
  assert.equal((await r.service.renderer('mode',{lease:r.lease,sessionId:'a',action:'get'})).autoSave,false);
  assert.equal((await r.service.renderer('mode',{lease:r.lease,sessionId:'b',action:'get'})).autoSave,true);
  assert.deepEqual(JSON.parse(r.config.projectModes),{'d:/alpha':false});assert.equal(r.calls.length,0);
});
test('turning off auto-save while job is queued prevents its write',async t=>{
  const r=await rig(t);const b=await r.read();
  const promise=r.service.remember({readToken:b.readToken,items:[lesson]},r.ctx());
  for(let i=0;i<5;i++)await tick();
  r.config.autoSave=false;
  const result=await r.pump(promise);assert.equal(r.writes().length,0);assert.ok(['awaiting_review','failed'].includes(result.status));
});
test('same request while saving does not enqueue a second write',async t=>{
  const r=await rig(t);const b=await r.read();const args={readToken:b.readToken,items:[lesson]};
  const first=r.service.remember(args,r.ctx());for(let i=0;i<5;i++)await tick();
  const second=await r.service.remember(args,r.ctx());assert.equal(second.status,'saving');
  await r.pump(first);assert.equal(r.writes().length,1);
});
test('lost save response is unverified, never cleaned up, and blocks further writes',async t=>{
  const r=await rig(t,{loseSaveResponse:true});const result=await r.remember(await r.read());
  assert.equal(result.status,'unverified');assert.equal(r.writes().length,1);assert.equal(r.stores.get('ga').length,2);
  const next=await r.remember(await r.read(),[{title:'另一规则',content:'不能在结果不确定时继续写。'}]);
  assert.equal(next.errorCode,'PREVIOUS_WRITE_UNVERIFIED');assert.equal(r.writes().length,1);
});
test('read-back mismatch does not trigger deletion or overwrite rollback',async t=>{
  const r=await rig(t,{badReadBack:true});const result=await r.remember(await r.read());
  assert.equal(result.status,'unverified');assert.equal(result.errorCode,'READ_BACK_MISMATCH');assert.equal(r.writes().length,1);
});
test('host error details are sanitized and do not trigger fallback',async t=>{
  const r=await rig(t,{hook:({key})=>{if(key==='projectGroupMemoryGet')throw new Error('SECRET_PRIVATE_TEXT');}});
  const result=await r.read();assert.equal(result.status,'failed');assert.ok(!JSON.stringify(result).includes('SECRET'));assert.equal(r.writes().length,0);
});
test('unstructured legacy memory, including an empty entries array, is rejected',async t=>{
  for(const entries of [undefined,[]]) {
    const r=await rig(t,{entries:[],memory:{entries,content:'Legacy content that must never be discarded'}});
    const result=await r.read();assert.equal(result.status,'failed');assert.equal(r.writes().length,0);
  }
});
test('unknown native entry metadata is rejected, never silently dropped',async t=>{
  const r=await rig(t,{entries:[{...old,extra:'preserve me'}]});assert.equal((await r.read()).status,'failed');assert.equal(r.writes().length,0);
});
test('legacy group uses its exact project path and preserves original cards',async t=>{
  const r=await rig(t);r.groups[0].legacy=true;
  const result=await r.remember(await r.read());assert.equal(result.status,'saved');
  assert.equal(r.writes()[0].key,'projectMemorySave');assert.equal(r.writes()[0].input.projectPath,'D:/alpha');
});
test('ambiguous membership is rejected',async t=>{
  const r=await rig(t);r.groups.push({id:'duplicate',roots:[{path:'D:/alpha'}]});
  assert.equal((await r.read()).errorCode,'AMBIGUOUS_PROJECT');assert.equal(r.writes().length,0);
});
test('unload settles queued reads and invalidates renderer leases',async t=>{
  const r=await rig(t);const pending=r.service.read({},r.ctx());await tick();r.service.stop();
  assert.equal((await pending).errorCode,'PLUGIN_UNLOADED');await assert.rejects(r.service.renderer('next',{lease:r.lease}),/lease expired/);
});
test('a claimed append timeout is unverified and cannot be accepted as a successful receipt',async t=>{
  const r=await rig(t,{rpcTimeout:20});const b=await r.read();
  const pending=r.service.remember({readToken:b.readToken,items:[lesson]},r.ctx());await tick();await tick();
  const job=await r.service.renderer('next',{lease:r.lease});assert.equal(job.operation,'append');
  const result=await pending;assert.equal(result.status,'unverified');
  assert.deepEqual(await r.service.renderer('report',{lease:r.lease,id:job.id,result:{status:'saved',saved:job.items,skipped:[]}}),{accepted:false});
});
test('parallel sessions sharing a group cannot overwrite each other locally',async t=>{
  const r=await rig(t);const a=await r.read('a');const c=await r.read('c');
  const values=await r.pump(Promise.all([
    r.service.remember({readToken:a.readToken,items:[lesson]},r.ctx('a')),
    r.service.remember({readToken:c.readToken,items:[{title:'另一结论',content:'并发候选必须重新比较。'}]},r.ctx('c')),
  ]));
  assert.equal(values.filter(x=>x.status==='saved').length,1);assert.equal(r.writes().length,1);assert.deepEqual(r.stores.get('ga')[0],old);
});
test('extension guidance and receipts never add a second memory store or claim unsaved data',()=>{
  const hooks=require('../knowstack-extension.js')._internals;
  assert.match(hooks.beforeStart({systemPrompt:'base'}).systemPrompt,/No new knowledge means no memory tool call/);
  const name='plugin_local_project_memory_api_probe_remember';
  assert.equal(hooks.receipt({toolName:name,details:{status:'awaiting_review',saved:[]}}),undefined);
  assert.equal(hooks.receipt({toolName:name,details:{status:'unverified',saved:[]}}),undefined);
  assert.match(hooks.receipt({toolName:name,details:{status:'saved',saved:[lesson]},content:[]}).content[0].text,/缓存结构升级/);
});
test('receipt unwrap supports SDK details and text envelopes without claiming success',async()=>{
  const {unwrapResult,STATUS_LABELS}=await import('../renderer/receipt-state.mjs');
  assert.equal(unwrapResult({content:[{type:'text',text:JSON.stringify({status:'awaiting_review'})}]}).status,'awaiting_review');
  assert.equal(unwrapResult({details:{status:'saved'}}).status,'saved');
  assert.equal(unwrapResult({content:[{type:'text',text:'not json'}]}),null);
  assert.match(STATUS_LABELS.unverified,/不要重试/);
});

test('ordinary chat ownership resolves over the fixed renderer channel without plugin-owned session SDK', async t => {
  const r = await rig(t, { nativeSession: true });
  const basis = await r.read();
  assert.equal(basis.status, 'read');
  assert.equal(r.writes().length, 0);
  const result = await r.remember(basis);
  assert.equal(result.status, 'saved');
  assert.equal(r.writes().length, 1);
  assert.deepEqual(r.stores.get('ga')[0], old);
});

test('historical cards coalesce concurrent same-session metadata checks without filling the queue', async t => {
  const r = await rig(t, { nativeSession: true });
  const modes = await r.pump(Promise.all(Array.from({ length: 16 }, () =>
    r.service.renderer('mode', { lease: r.lease, sessionId: 'a', action: 'get' }))));
  assert.ok(modes.every(mode => mode.autoSave === true));
  assert.equal(r.calls.filter(c => c.key === 'sessionGet').length, 1);
  assert.equal(r.writes().length, 0);
  r.sessions.a = 'D:/beta';
  const next = await r.pump(r.service.renderer('mode', { lease: r.lease, sessionId: 'a', action: 'get' }));
  assert.equal(next.autoSave, true);
  assert.equal(r.calls.filter(c => c.key === 'sessionGet').length, 2);
});
