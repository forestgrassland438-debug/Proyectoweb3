'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audits/recursos-20261028'),wallet='0x'+'a'.repeat(40);
const rows=['madera pinos','madera seca','madera con hojas','mineral_piedra','mineral_piedra_cobre','mineral_piedra_hierro','carbon','mineral_carbon'].map((tipo,i)=>({tipo,itemId:tipo.replaceAll(' ','_'),available:true,configured:true,totalQuantity:'75000',limit:'100000',remaining:'25000',perInvoiceLimit:'50',invoiceCount:'1500',totalBurned:'30000',occupancy:75,respawnSeconds:930,priceFactor:1.75}));
const resource={ok:true,settings:{enabled:true,startPercent:50,baseRespawn:60,maxRespawn:1800,priceMax:2.5},version:1,rows,migrationSealed:false,observedAt:new Date().toISOString(),cacheSeconds:15};
let clears=0;const requests=[];
function mock(p){
 requests.push(p);
 if(p==='/api/admin/whoami')return{address:wallet};
 if(p.includes('/api/auth/me'))return{authenticated:true,address:wallet,playerName:'Prueba'};
 if(p.includes('csrf-token'))return{csrfToken:'fixture'};
 if(p.includes('/recursos/entregas'))return{ok:true,rows:[],legacy:[],hasMore:false};
 if(p.includes('/recursos/simular'))return{...resource,curve:Array.from({length:101},(_,occupancy)=>({occupancy,respawnSeconds:60+1740*(occupancy/100)**2}))};
 if(p.includes('/recursos'))return resource;
 if(p.includes('/cuentas'))return{ok:true,rows:[{wallet,playerName:'Ana',username:'Guardabosques',email:'test@example.invalid',emailVerified:true,loginProvider:'google',level:5,world:1,loginCount:10,online:true}],hasMore:false,observedAt:new Date().toISOString()};
 if(p.includes('relay-failures/clear')){clears++;return{ok:true};}
 const error={_id:'e1',errorId:'e1',type:'RPC',message:'<img src=x onerror=alert(1)> RPC timeout '+('long text '.repeat(100)),stack:'trace\n'.repeat(25),count:76,lastSeen:new Date().toISOString(),actors:[{wallet,playerName:'Ana',count:76,verified:true}],actorCount:1,error:'RPC timeout',functionName:'transferInvoice'};
 if(p.includes('client-errors')||p.includes('relay-failures'))return{ok:true,grouped:true,items:clears&&p.includes('relay-failures')?[]:[error],total:clears&&p.includes('relay-failures')?0:1,ocurrencias:76,tipos:['RPC']};
 if(p.endsWith('/catalog'))return{catalog:{Semillax:{name:'Semilla de zanahoria'}},categories:[{id:'semillas',label:'Semillas'}]};
 if(p.endsWith('/account'))return{address:wallet,oro:100,plata:500,inventory:[]};
 if(p.includes('/my-listings'))return{listings:[]};
 if(p.includes('/listings'))return{listings:Array.from({length:8},(_,i)=>({id:'listing'+i,itemId:'Semillax',name:'Semilla de zanahoria',icon:'/favicon.png',category:'semillas',owner:'0x'+'b'.repeat(40),ownerName:'El bosque',qty:10,pricePerUnit:12,currency:'plata',chainReady:true,chainStatus:'held'})),hasMore:false};
 if(p.includes('/history'))return{history:[]};
 if(p.includes('/onchain/pending'))return{ok:true,rows:[]};
 if(p.includes('/offers'))return{offers:[]};
 if(p.includes('/limited'))return{listings:[]};
 if(p.includes('/economia/precio/'))return{ok:true,actual:{compra:10,venta:5,moneda:'plata'},historial:[{t:'2026-10-28',compra:10,venta:5,moneda:'plata'}],p2p:{ventas:[]},tienda:[]};
 return{ok:true,types:['RPC']};
}
const stub=`<script>window.__listeners=new Set();window.GFAdminSession={request:async p=>{const r=await fetch(p);return r.json()},getCsrf:async()=>{},subscribe:fn=>{__listeners.add(fn);return()=>__listeners.delete(fn)},provider:()=>null};window.__invalidate=()=>__listeners.forEach(fn=>fn());</script>`;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(mock(u.pathname+u.search)));}
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[ext]||'application/octet-stream');
 if(ext==='.html' && /recursos|cuentas|reporter/.test(u.pathname))return res.end(fs.readFileSync(file,'utf8').replace(/<meta[^>]*Content-Security-Policy[^>]*>/i,'').replace(/<script[^>]*src="(?:\.\/)?admin-session\.js[^>]*><\/script>/i,stub));
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Users/pc/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true}).catch(async e=>{await new Promise(r=>server.close(r));throw e});
 const origin='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage(),errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).pathname.startsWith('/api/')?r.fulfill({json:mock(new URL(r.request().url()).pathname+new URL(r.request().url()).search),headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'}}):r.request().url().startsWith(origin)?r.continue():r.abort());
 try{
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/market.html',{waitUntil:'networkidle'});await page.waitForSelector('.ticket');
   for(const cls of ['.buy-btn','.stats-btn'])assert.ok(await page.locator(cls).first().isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'market overflow '+width);
   await page.locator('.stats-btn').first().click();await page.waitForSelector('#gfpp');await page.keyboard.press('Escape');
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'market-'+width+'.png'),fullPage:true});
   await page.locator('#market-view-list').click();assert.equal(await page.locator('#market-grid.market-list-view').count(),1);
   await page.locator('#market-view-grid').click();assert.equal(await page.locator('#market-grid.market-list-view').count(),0);
   await page.locator('#market-open-sell').click();assert.ok(await page.locator('#tab-sell').isVisible());
   await page.locator((width>760?'.tabs .tab-btn':'.mobile-tabbar button')+'[data-tab="market"]').click();assert.ok(await page.locator('#tab-market').isVisible());
   await page.goto(origin+'/recursos.html');await page.waitForSelector('#resource-rows tr');assert.equal(await page.locator('#resource-rows tr').count(),8);
   await page.locator('#resource-preview').click();await page.waitForSelector('#resource-chart polyline');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'resource overflow '+width);
   await page.screenshot({path:path.join(out,'recursos-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>__invalidate());assert.equal(await page.locator('#resource-rows tr').count(),0);
   await page.goto(origin+'/cuentas.html');await page.waitForSelector('#account-rows tr');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'accounts overflow '+width);
   await page.screenshot({path:path.join(out,'cuentas-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>__invalidate());assert.equal(await page.locator('#account-rows').textContent(),'');
   await page.goto(origin+'/reporter.html');await page.waitForSelector('#rowsErrors tr');
   assert.equal(await page.locator('#rowsErrors img').count(),0,'injected HTML must remain text');
   await page.locator('#rowsErrors details').first().locator('summary').click();assert.ok((await page.locator('#rowsErrors').textContent()).includes(wallet));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'reporter overflow '+width);
   await page.screenshot({path:path.join(out,'errores-'+width+'.png'),fullPage:true});
   await page.locator('[data-tab="relay"]').click();await page.waitForSelector('#rowsRelay tr');await page.locator('#btnRelayClear').click();await page.waitForTimeout(80);assert.ok(clears>0);
   await page.evaluate(()=>__invalidate());assert.equal(await page.locator('#rowsErrors').textContent(),'');clears=0;samples.push({width,overflow:false,privateRowsCleared:true});
  }
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/GUIA-ECONOMIA.html',{waitUntil:'networkidle'});
    assert.equal(await page.locator('img').count(),3);assert.equal(await page.locator('img').evaluateAll(xs=>xs.every(x=>x.complete && x.naturalWidth>0)),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'guide overflow '+width);
    await page.getByRole('heading',{name:'Cómo cambia la reaparición y el precio',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'guia-'+width+'.png')});
  }
  // The host removes each private tool frame on navigation. Repeatedly dispose it.
  await page.goto(origin+'/favicon.png');
  for(let i=0;i<30;i++){await page.evaluate(()=>{const f=document.createElement('iframe');f.src='/cuentas.html';document.body.append(f)});await page.waitForTimeout(30);await page.evaluate(()=>document.querySelector('iframe').remove());}
  assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({ok:true,errors,samples,iframeCycles:30,requests:requests.length},null,2));console.log('Desktop + 390/320 mobile layouts, XSS text safety, session clearing, relay clear and 30 frame disposal cycles passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
