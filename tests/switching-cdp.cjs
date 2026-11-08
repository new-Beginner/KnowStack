'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{spawn}=require('node:child_process');
if(!process.env.PI_SCRATCH_DIR)throw Error('PI_SCRATCH_DIR required');
const profile=fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR,'knowstack-switching-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--allow-file-access-from-files','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let launchError,ws;chrome.on('error',e=>{launchError=e;});const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let port;for(let i=0;i<100;i++){if(launchError)throw launchError;try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await pause(100);}assert.ok(port);
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');const cases=[];
 for(const [width,theme] of [[1100,'light'],[390,'dark']]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'switching-browser.html')).href+'?theme='+theme+(process.env.KNOWSTACK_SWITCH_BASELINE?'&baseline=1':'')});
  let ready=false;for(let i=0;i<200;i++){if(await evaluate('typeof window.runBrowserTests === "function"')){ready=true;break;}await pause(30);}assert.ok(ready,'fixture not ready');
  const result=await evaluate('window.runBrowserTests()');assert.equal(result.failed,0,JSON.stringify(result));cases.push({width,theme,...result});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:cases.reduce((n,c)=>n+c.passed,0),failed:0,cases},null,2));await call('Browser.close');ws.close();
})().catch(e=>{console.error(e);ws?.close();chrome.kill();process.exitCode=1;});
