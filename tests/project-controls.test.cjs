'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjectSettings } = require('../project-settings.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const modules = import('../renderer/project-controls.mjs');
const alpha = { name: '甲项目', primaryPath: 'D:/Alpha', roots: [{path:'D:/Alpha'}, {path:'D:/Library'}] };
const beta = { name: '乙项目', roots: [{path:'D:/Beta'}] };

async function rig(t) {
  const { createProjectController } = await modules;
  const config = { autoSave: true, autoDelete: false, projectModes: '{}', projectDeleteModes: '{}' }; const calls = [];
  const store = createProjectSettings({ getSettings: async () => ({...config}), setSettings: async patch => Object.assign(config,patch) });
  let groups = [alpha]; let fail = false; let failSave = false; let interval; let changed; let removed = 0;
  const bridge = { channels:{invoke:{projectGroupList:'groups'},event:{sessionsChanged:'changed'}},
    async invoke(channel) { assert.equal(channel,'groups'); if (fail) throw new Error('offline'); return {ok:true,data:{groups:structuredClone(groups)}}; },
    on(channel,fn) { assert.equal(channel,'changed'); changed=fn; return () => {removed++;}; },
  };
  const controller = createProjectController({bridge,
    schedule(fn,ms){assert.equal(ms,2000);interval=fn;return 1;},unschedule(id){assert.equal(id,1);removed++;},
    async call(method,args){
      assert.equal(method,'projects');calls.push(args);
      if(args.action==='sync')return store.sync(args.projects);
      if(failSave)throw new Error('refused');
      if(args.action==='default')return Object.hasOwn(args,'autoDelete') ? store.setDeleteDefault(args.autoDelete) : store.setDefault(args.autoSave);
      if(args.action==='set'){
        const patch = Object.fromEntries(['autoSave','autoDelete'].filter(k => Object.hasOwn(args,k)).map(k => [k,args[k]]));
        await store.patchMode(args.path,patch,true);
        return store.get();
      }
      throw new Error('unexpected action');
    },
  });
  t.after(()=>controller.stop()); await controller.refresh();
  return { controller,config,calls,store,interval:()=>interval(),changed:()=>changed(),removed:()=>removed,
    setGroups:value=>{groups=value;},fail:value=>{fail=value;},failSave:value=>{failSave=value;} };
}

test('project scan groups folders into one named row and excludes remote projects',async()=>{
  const {scanProjects}=await modules;
  const projects=await scanProjects({channels:{invoke:{projectGroupList:'groups'}},invoke:async()=>({ok:true,data:{groups:[alpha,{remote:{hostKey:'h'},primaryPath:'remote-project:x',roots:[]}]}})});
  assert.deepEqual(projects,[{name:'甲项目',path:'d:/alpha',paths:['d:/alpha','d:/library']}]);
});

test('malformed scans reject instead of returning a destructive empty catalog',async()=>{
  const {scanProjects}=await modules;
  for(const response of [{ok:false},{ok:true,data:{}},{ok:true,data:{groups:[{}]}},{ok:true,data:{groups:[alpha,alpha]}}]) {
    await assert.rejects(scanProjects({channels:{invoke:{projectGroupList:'groups'}},invoke:async()=>response}));
  }
});

test('startup, creation, removal and default inheritance synchronize without memory APIs',async t=>{
  const r=await rig(t);assert.equal(r.controller.getState().projects.length,1);
  assert.equal(r.controller.getState().autoSave, true);
  assert.equal(r.controller.getState().autoDelete, false);
  await r.controller.setProject('d:/alpha',false);
  await r.controller.setProject('d:/alpha',true,'autoDelete');
  assert.deepEqual(JSON.parse(r.config.projectModes),{'d:/alpha':false,'d:/library':false});
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes),{'d:/alpha':true,'d:/library':true});
  await r.controller.setDefault(false);
  await r.controller.setDefault(true,'autoDelete');
  r.setGroups([alpha,beta]);r.interval();await tick();
  assert.equal(r.controller.getState().projects.find(p=>p.path==='d:/beta').autoSave,false);
  assert.equal(r.controller.getState().projects.find(p=>p.path==='d:/beta').autoDelete,true);
  r.setGroups([beta]);r.changed();await tick();
  assert.deepEqual(JSON.parse(r.config.projectModes),{'d:/beta':false});
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes),{'d:/beta':true});
  assert.ok(r.calls.every(call=>['sync','set','default'].includes(call.action)));
});

test('queue serializes autoSave and autoDelete toggles without mutual overwrite',async t=>{
  const r=await rig(t);
  await Promise.all([
    r.controller.setProject('d:/alpha',false,'autoSave'),
    r.controller.setProject('d:/alpha',true,'autoDelete')
  ]);
  const alphaProj=r.controller.getState().projects.find(p=>p.path==='d:/alpha');
  assert.equal(alphaProj.autoSave,false);
  assert.equal(alphaProj.autoDelete,true);
  assert.deepEqual(JSON.parse(r.config.projectModes),{'d:/alpha':false,'d:/library':false});
  assert.deepEqual(JSON.parse(r.config.projectDeleteModes),{'d:/alpha':true,'d:/library':true});
});

test('scan errors keep prior list and persisted choices; failed saves do not claim success',async t=>{
  const r=await rig(t);const before=r.config.projectModes;const count=r.calls.length;
  r.fail(true);await assert.rejects(r.controller.refresh());assert.equal(r.calls.length,count);
  assert.equal(r.config.projectModes,before);assert.equal(r.controller.getState().projects.length,1);
  r.fail(false);r.failSave(true);await r.controller.setProject('d:/alpha',false);
  assert.equal(r.controller.getState().message,'');assert.match(r.controller.getState().error,/未能确认保存/);
  assert.equal(r.controller.getState().projects[0].autoSave,true);
});

test('coalesced refresh, duplicate click suppression and unload release resources',async t=>{
  const r=await rig(t);const n=r.calls.length;
  await Promise.all([r.controller.refresh(),r.controller.refresh()]);assert.equal(r.calls.length,n+1);
  const start=r.calls.filter(c=>c.action==='set').length;
  await Promise.all([r.controller.setProject('d:/alpha',false),r.controller.setProject('d:/alpha',false)]);
  assert.equal(r.calls.filter(c=>c.action==='set').length,start+1);
  r.controller.stop();assert.equal(r.removed(),2);await assert.rejects(r.controller.refresh(),/unloaded/);
});
