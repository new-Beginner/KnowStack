'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('../manifest.json');
const extension=require('../knowstack-extension.js');
const {GUIDANCE,beforeStart}=extension._internals;
test('every user turn including follow-ups receives ordered read, curate, maintain, receipt guidance',()=>{
  const handlers={};extension({on:(event,fn)=>{handlers[event]=fn;}});assert.equal(handlers.before_agent_start,beforeStart);
  for(const systemPrompt of ['first','follow-up']){
    const text=beforeStart({systemPrompt}).systemPrompt;assert.ok(text.startsWith(systemPrompt));assert.ok(text.endsWith(GUIDANCE));
    const positions=['START of EVERY user turn','END of EVERY user turn','Maintain existing facts','FINAL answer'].map(s=>text.indexOf(s));assert.ok(positions.every((p,i)=>p>0&&(!i||p>positions[i-1])));
  }assert.equal(beforeStart({}),undefined);
});
test('read failure is not empty memory, scope and evidence constrain curation',()=>{
  for(const pattern of [/For EVERY user message, including follow-ups/,/before substantive task work or your final answer/,/Do this even when there is no new knowledge/,/Read failure is not empty memory/,/Uncertain entries remain unchanged/,/Age, non-use/,/original scope and necessary conditions/])assert.match(GUIDANCE,pattern);
  assert.match(manifest.contributes.agentTools.find(t=>t.name==='read_memory').description,/START of EVERY user turn/);
});
test('long-term project repository, constraints and locatable conversation indexes replace stage logs',()=>{
  for(const pattern of [/verified repository URL/,/non-negotiable limits/,/Conversation indexes/,/exactly where to find it/,/verified session ID\/title/,/never invent a location/,/Do not save stage summaries/,/routine release\/test counts/,/temporary paths/,/credentials/,/No new knowledge means no remember call/,/compare meanings and applicability/,/Tokens expire after 5 minutes/,/read current native memory AGAIN near the end/,/never switch the mode back or simulate approval/])assert.match(GUIDANCE,pattern);
  assert.equal(manifest.contributes.settings.find(s=>s.key==='autoSave').default,true);
});
test('modification always enabled; autonomous deletion needs independent opt-in and evidence',()=>{
  assert.match(GUIDANCE,/update_memory/);assert.match(GUIDANCE,/always available with no switch, independent of autoSave/);assert.match(GUIDANCE,/Preserve its ID/);
  assert.match(GUIDANCE,/autoDelete returned by read_memory is ON/);assert.match(GUIDANCE,/Never infer permission from autoSave/);assert.match(GUIDANCE,/When autoDelete is OFF/);assert.match(GUIDANCE,/Never stage draft deletions or click Save/);assert.match(GUIDANCE,/Do not retry an unverified write/);
  assert.equal(manifest.contributes.settings.find(s=>s.key==='autoDelete').default,false);assert.ok(!manifest.contributes.settings.some(s=>/update|modify/i.test(s.key)));
});
test('final answer includes only actual saved/mutated receipts and exact reminder marker',()=>{
  for(const pattern of [/each EXACT saved title and content/,/updated\/deleted report only IDs\/titles actually verified/,/finalReminder VERBATIM/,/standalone HTML comment marker/,/Do not invent report IDs/,/both exist, include both/,/no report, no deletion reminder and no empty reminder card/])assert.match(GUIDANCE,pattern);
});
