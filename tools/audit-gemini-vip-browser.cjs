'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='C:/Users/pc/.codex/reports/grassland-auditoria-20261029',report={ok:false,checks:[],errors:[]};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/pc/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});const workspace=process.cwd();const server=http.createServer((req,res)=>{
  const name=path.resolve(workspace,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(name.startsWith(workspace+path.sep) && fs.existsSync(name) && fs.statSync(name).isFile()){res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':'application/octet-stream'});res.end(fs.readFileSync(name));return;}
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><body></body>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port);
 // No server or real wallet is contacted. A local document and an in-memory
 // API model deliberately reproduce responses arriving late or getting lost.
 await page.setContent('<!doctype html><body><div id="hud"><div id="hud-reloj"></div></div></body>');
 await page.evaluate(()=>{
  window.fixture={scenario:'lost',refs:[],charges:0,complete:false,job:null,adopted:0,reconciles:[]};
  const scene={playerName:'Ana',moneda:30,moneda_plata:20000,notifications:{show(){}}};window.game={scene:{getScenes:()=>[scene]}};
  const plans={'1m':{dias:30,nombre:'VIP 1 month',precio:{oro:5,plata:5000,bronce:5000000}},'3m':{dias:90,nombre:'VIP 3 months',precio:{oro:12,plata:12000,bronce:12000000}},'6m':{dias:180,nombre:'VIP 6 months',precio:{oro:20,plata:20000,bronce:20000000}}};
  const state=()=>({ok:true,activo:true,inicio:Date.now(),fin:Date.now()+30*86400000,ahora:Date.now(),planes:plans,stats:{oro:25}});
  window.GFBronce={valor:()=>30000000,corto:String,adoptarStats:()=>fixture.adopted++};
  window.GFMascota={api:async(path,body)=>{
   const f=fixture;if(path==='/api/vip/estado')return {ok:true,datos:{...state(),activo:false}};
   if(path==='/api/craft/pending')return {ok:true,datos:{ok:true,rows:f.job && !f.complete?[{_id:f.job,recipe:'vip_1m_oro'}]:[]}};
   if(path==='/api/vip/comprar'){
    f.refs.push(body.ref);if(f.refs.length===1){f.charges++;f.job='craft_'+'a'.repeat(64);f.complete=true;throw Error('fixture: response lost');}
    return {ok:true,datos:state()};
   }
   if(path==='/api/craft/reconcile'){
    f.reconciles.push(body.operationId);return {ok:true,datos:f.complete?state():{ok:false,operationId:f.job,status:'review',recipeId:'vip_1m_oro',stats:{oro:25}}};
   }
   throw Error('unexpected route '+path);
  }};
 });
 await page.addScriptTag({content:fs.readFileSync('gf-vip.js','utf8')});
 await page.evaluate(async()=>{await GFVip.refrescar();GFVip.abrirTienda();});
 await page.locator('.gfv-comprar[data-plan="1m"][data-moneda="oro"]').click();
 await page.waitForFunction(()=>fixture.refs.length===1 && document.querySelector('.gfv-msg')?.textContent.includes('response lost'));
 await page.evaluate(()=>{GFVip.cerrarTienda();GFVip.abrirTienda();});
 await page.getByRole('button',{name:'Check pending purchase'}).click();
 await page.waitForFunction(()=>fixture.refs.length===2 && document.querySelector('.gfv-msg')?.textContent.includes('confirmed'));
 assert.deepEqual(await page.evaluate(()=>[fixture.charges,new Set(fixture.refs).size,fixture.adopted]),[1,1,1]);report.checks.push('lost response, completed server job and reopened shop reuse one reference and charge once');
 await page.evaluate(()=>{fixture.complete=false;fixture.job='craft_'+'b'.repeat(64);fixture.refs=[];GFVip.cerrarTienda();GFVip.abrirTienda();});
 await page.locator('.gfv-comprar[data-plan="1m"][data-moneda="oro"]').click();
 await page.waitForFunction(()=>fixture.reconciles.length===1 && document.querySelector('.gfv-msg')?.textContent.includes('awaiting'));
 await page.evaluate(()=>fixture.complete=true);await page.getByRole('button',{name:'Check pending purchase'}).click();
 await page.waitForFunction(()=>fixture.reconciles.length===2 && document.querySelector('.gfv-msg')?.textContent.includes('confirmed'));
 assert.deepEqual(await page.evaluate(()=>[fixture.refs.length,new Set(fixture.reconciles).size]),[0,1]);report.checks.push('a recovered VIP job remains bound to its operation id even after it leaves the pending list');
 await page.evaluate(()=>document.querySelector('#gf-vip-tienda').firstElementChild.scrollTop=0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:root+'/vip-mobile.png',fullPage:true});
 await page.evaluate(()=>GFVip.destruir());assert.equal(await page.locator('#gf-vip-tienda').count(),0);assert.deepEqual(report.errors,[]);report.checks.push('phone layout renders, native scene guards remain and disposal closes the owned modal');
 report.ok=true;report.completedAt=new Date().toISOString();
 }finally{await browser.close();server.close();fs.writeFileSync(root+'/vip-browser.json',JSON.stringify(report,null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});
