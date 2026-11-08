'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const manifest=require('../manifest.json');
async function rig(t){
 let active={sessionId:'a',projectPath:'D:/A',source:'desktop'};const calls=[],tools=[];
 const service={stop(){},read(){},remember(){},update(args,ctx){calls.push({kind:'update',args,ctx});return{status:'updated'};},delete(args,ctx){calls.push({kind:'delete',args,ctx});return{status:'deleted'};},reportOutdated(){},renderer(){},editor(args,ctx){calls.push({kind:'editor',args,ctx});return{status:'read'};},mode(args){calls.push({kind:'mode',args});return{autoSave:true,autoDelete:false};}};
 const sandbox={module:{exports:{}},require:name=>name==='./manifest.json'?manifest:{createService:()=>service},pi:{session:{getActive:async()=>active},agent:{registerTool:async tool=>tools.push(tool),unregisterTool:async()=>{}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),sandbox);const main=sandbox.module.exports;await main.onLoad();t.after(()=>main.onUnload());return{main,calls,tools,setActive:value=>{active=value;}};
}
test('view context returns only host-selected metadata; unknown and cross-session requests reject',async t=>{
 const r=await rig(t);assert.deepEqual(JSON.parse(JSON.stringify(await r.main.onPanelInvoke('memory.context'))),{sessionId:'a',projectPath:'D:/A'});assert.equal(r.calls.length,0);
 await assert.rejects(r.main.onPanelInvoke('memory.editor',{sessionId:'b',action:'read'}),/PANEL_CONTEXT_CHANGED/);
 await assert.rejects(r.main.onPanelInvoke('arbitrary-ipc',{}),/Unknown view request/);assert.equal(r.calls.length,0);
});
test('remote and missing local session never produce an editor request',async t=>{
 const r=await rig(t);for(const active of [null,{sessionId:'r',projectPath:'remote-project:x',source:'remote'},{sessionId:'x'}]){r.setActive(active);await assert.rejects(r.main.onPanelInvoke('memory.context'),/NO_PANEL_PROJECT/);}assert.equal(r.calls.length,0);
});
test('view editor and modes are bound to host-selected session, not supplied project path',async t=>{
 const r=await rig(t);await r.main.onPanelInvoke('memory.editor',{action:'read',sessionId:'a',projectPath:'D:/B'});
 assert.equal(r.calls[0].ctx.sessionId,'a');assert.equal(r.calls[0].ctx.turnId,'editor:a');assert.equal('projectPath' in r.calls[0].ctx,false);
 await r.main.onPanelInvoke('memory.mode',{action:'set',sessionId:'a',autoDelete:true});assert.equal(r.calls[1].args.sessionId,'a');
 r.setActive({sessionId:'b',projectPath:'D:/B',source:'desktop'});await assert.rejects(r.main.onPanelInvoke('memory.editor',{action:'save',sessionId:'a',entries:[]}),/PANEL_CONTEXT_CHANGED/);
});
test('new model mutation tools receive unmodified trusted execution context',async t=>{
 const r=await rig(t);const ctx={sessionId:'origin',turnId:'trusted-turn'};for(const name of ['update_memory','delete_memory'])await r.tools.find(tool=>tool.name===name).execute({readToken:'read',items:[]},ctx);
 assert.ok(r.calls.every(call=>call.ctx===ctx));assert.deepEqual(r.calls.map(call=>call.kind),['update','delete']);
});
