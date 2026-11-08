'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../renderer/host-call.mjs');
const native = import('../renderer/native-memory.mjs');
test('native job preserves safe host error and failing step (no private text)', async () => {
  const { runNativeJob } = await native;
  const bridge = { channels: { invoke: { sessionGet: 'session' } }, invoke: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'SECRET path' } }) };
  const result = await runNativeJob(bridge, { operation: 'read', sessionId: 'a', projectPath: 'D:/a', expiresAt: Date.now() + 1000 });
  assert.equal(result.errorCode, 'HOST_NOT_FOUND'); assert.equal(result.errorStep, 'sessionGet');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
test('transient reads retry exactly once with identical target', async () => {
  const { callHost } = await mod; const calls = []; let delay = 0;
  const bridge = { channels: { invoke: { sessionGet: 'session' } }, async invoke(key, input) { calls.push([key,input]); return calls.length === 1 ? {ok:false,error:{code:'UNAVAILABLE'}} : {ok:true,data:{session:{id:'a'}}}; } };
  assert.deepEqual(await callHost(bridge,'sessionGet',{id:'a'},{delay:async()=>{delay++;}}),{session:{id:'a'}});
  assert.equal(calls.length,2); assert.equal(delay,1); assert.deepEqual(calls[0],calls[1]);
});
test('permanent read failures and unknown errors do not retry', async () => {
  const { callHost } = await mod;
  for(const code of ['PERMISSION_DENIED','NOT_FOUND','SECRET-CODE']) {
    let n=0; const bridge={channels:{invoke:{projectGroupMemoryGet:'get'}},invoke:async()=>{n++;return{ok:false,error:{code,message:'SECRET'}};}};
    await assert.rejects(callHost(bridge,'projectGroupMemoryGet',{}),e=>e.step==='projectGroupMemoryGet'&&!e.message.includes('SECRET'));
    assert.equal(n,1);
  }
});
test('save failure is never retried even for transient host code', async () => {
  const { callHost } = await mod; let n=0;
  const bridge={channels:{invoke:{projectGroupMemorySave:'save'}},invoke:async()=>{n++;throw{code:'TIMEOUT',message:'SECRET'};}};
  await assert.rejects(callHost(bridge,'projectGroupMemorySave',{}),e=>e.code==='HOST_TIMEOUT');assert.equal(n,1);
});
test('retry stops after unload and never spins indefinitely', async () => {
  const {callHost}=await mod;let n=0,stopped=false;
  const bridge={channels:{invoke:{sessionGet:'session'}},invoke:async()=>{n++;return{ok:false,error:{code:'BUSY'}};}};
  await assert.rejects(callHost(bridge,'sessionGet',{}, {guard(){if(stopped)throw Object.assign(Error(),{code:'UNLOADED'});},delay:async()=>{stopped=true;}}),e=>e.code==='UNLOADED');assert.equal(n,1);
  await assert.rejects(callHost(bridge,'sessionGet',{}, {delay:async()=>{}}),e=>e.code==='HOST_BUSY');assert.equal(n,3);
});
test('host default INTERNAL remains distinguishable without copying its message',async()=>{
  const {callHost}=await mod;
  await assert.rejects(callHost({channels:{invoke:{projectGroupMemoryGet:'get'}},invoke:async()=>({ok:false,error:{code:'INTERNAL',message:'PRIVATE HOST MESSAGE'}})},'projectGroupMemoryGet',{}),error=>error.code==='HOST_INTERNAL'&&error.step==='projectGroupMemoryGet'&&!error.message.includes('PRIVATE'));
});
