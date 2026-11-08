'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
if(!process.env.PI_SCRATCH_DIR)throw Error('PI_SCRATCH_DIR required');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR,'knowstack-theme-'));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.json')?'application/json':'text/javascript; charset=utf-8');res.end(data);});});
let chrome,ws,launchError;const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});chrome.on('error',e=>{launchError=e;});
 let port;for(let i=0;i<100;i++){if(launchError)throw launchError;try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await pause(100);}assert.ok(port);
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},20000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/tests/theme-browser.html`});
 let ready=false;for(let i=0;i<300;i++){if(await evaluate('typeof window.runThemeTests === "function"')){ready=true;break;}await pause(30);}assert.ok(ready,'Theme fixture not ready: '+errors.join());
 const cases=[];const fixtures=await evaluate('window.themeFixtures');
 for(const width of [420,320]){
  cases.push(await evaluate(`window.runThemeTests(${width})`));
  if(process.env.KNOWSTACK_SCREENSHOT_DIR){fs.mkdirSync(process.env.KNOWSTACK_SCREENSHOT_DIR,{recursive:true});for(const theme of fixtures)for(const surface of width===420?['memory','settings']:['memory']){const r=await evaluate(`window.previewTheme(${JSON.stringify(theme.id)},${JSON.stringify(surface)},${width})`);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}});fs.writeFileSync(path.join(process.env.KNOWSTACK_SCREENSHOT_DIR,`${theme.base}-${surface}-${width}.png`),Buffer.from(shot.data,'base64'));}}
 }
 const cleanup=await evaluate('window.finishThemeTests()');const result={passed:cases.reduce((n,c)=>n+c.passed,0)+(cleanup?1:0),failed:cases.reduce((n,c)=>n+c.failed,0),cases,cleanup};console.log(JSON.stringify(result,null,2));assert.equal(result.failed,0);assert.deepEqual(errors,[]);await call('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server.closeAllConnections?.();server.close();});
