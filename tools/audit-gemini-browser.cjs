'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),audit='C:/Users/pc/.codex/reports/grassland-auditoria-20261029',before=path.join(audit,'before');
const sources={};for(const variant of ['before','after'])for(const file of ['phaser-rpg-perf.js','gf-graficos.js'])sources['/'+variant+'/'+file]=fs.readFileSync(path.join(variant==='before'?before:root,file),'utf8');
const fixture='<!doctype html><html><head><meta charset="utf-8"></head><body><main id="chart" style="width:1050px"></main></body></html>';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url.endsWith('.js')?'application/javascript':'text/html');res.end(sources[req.url]||fixture);});
const report={ok:false,checks:[],samples:[],method:'Local Chromium fixture; registered culling targets and synthetic chart data. These are NOT measurements of gameplay FPS, a production server, or millions of connected players.'};
const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'C:/Users/pc/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true,args:['--js-flags=--expose-gc']});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.addScriptTag({url:origin+'/after/phaser-rpg-perf.js'});
 assert.equal(await page.evaluate(async()=>{const vault=new PhaserRPGPerf.SecureVault();await vault._init();const written=await vault.set('audit-persistence',{quality:'verified'},{persist:true});const key=await crypto.subtle.exportKey('raw',vault.sessionKey).then(()=>false,()=>true);vault.destroy();return written&&key;}),true);
 await page.reload();await page.addScriptTag({url:origin+'/after/phaser-rpg-perf.js'});
 assert.equal(await page.evaluate(async()=>{const v=new PhaserRPGPerf.SecureVault();const x=await v.get('audit-persistence',{persist:true});v.removePersisted('audit-persistence');v.destroy();return x?.quality==='verified';}),true);report.checks.push('Non-extractable IndexedDB CryptoKey survives reload and decrypts saved data.');
 for(const variant of ['before','after']){
  await page.goto(origin);await page.addScriptTag({url:origin+'/'+variant+'/phaser-rpg-perf.js'});await page.addScriptTag({url:origin+'/'+variant+'/gf-graficos.js'});
  const sample=await page.evaluate(async variant=>{
   const events={on(){},off(){},once(){}},scene={events,cameras:{main:{worldView:{x:0,y:0,width:800,height:600}}}},cull=new PhaserRPGPerf.AdvancedCullManager(scene);
   const N=30000;for(let i=0;i<N;i++)cull.add({x:i%2000,y:i%1000,visible:true,active:true,setVisible(v){this.visible=v;},setActive(v){this.active=v;}});
   for(let i=0;i<90;i++)cull._onUpdate();
   const cpu=[];for(let trial=0;trial<35;trial++){const start=performance.now();for(let n=0;n<60;n++)cull._onUpdate();cpu.push((performance.now()-start)/60);}
   const frames=[];let last;await new Promise(resolve=>{function frame(now){cull._onUpdate();if(last!==undefined)frames.push(now-last);last=now;if(frames.length>=150)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   cull.destroy();
   const series=Array.from({length:8},(_,i)=>({id:'s'+i,nombre:'Serie '+i})),datos={};for(let s=0;s<8;s++)datos['s'+s]=Array.from({length:365},(_,i)=>[Date.UTC(2025,0,i+1),((i*13+s*7)%100)+1]);
   const chart=GFGraficos.crear(document.querySelector('#chart'),{series,datos,tipo:'barras',tabla:true,rangos:[],rango:'todo',idioma:'es'});document.querySelector('.gfg-aux button:last-child').click();
   const charts=[];for(let i=0;i<18;i++){const start=performance.now();chart.pintar();charts.push(performance.now()-start);}chart.destruir();
   return {variant,targets:N,cpuMs:cpu,frameDeltasMs:frames,chartMs:charts,remainingTargets:cull.targets.size,remainingChartNodes:document.querySelectorAll('.gfg').length};
  },variant);
  assert.equal(sample.remainingTargets,0);assert.equal(sample.remainingChartNodes,0);
  sample.cpuMedianMs=quantile(sample.cpuMs,.5);sample.cpuP95Ms=quantile(sample.cpuMs,.95);sample.chartMedianMs=quantile(sample.chartMs,.5);sample.chartP95Ms=quantile(sample.chartMs,.95);sample.fps=1000/(sample.frameDeltasMs.reduce((n,x)=>n+x,0)/sample.frameDeltasMs.length);sample.frameP95Ms=quantile(sample.frameDeltasMs,.95);report.samples.push(sample);
 }
 await page.goto(origin);await page.addScriptTag({url:origin+'/after/gf-graficos.js'});
 assert.equal(await page.evaluate(()=>{const host=document.querySelector('#chart');for(let i=0;i<40;i++){const chart=GFGraficos.crear(host,{series:[{id:'s'}],datos:{s:[[1,2],[2,3]]}});chart.destruir();}return host.childElementCount===0;}),true);report.checks.push('40 chart mount/disposal cycles leave no chart nodes.');
 assert.deepEqual(errors,[]);report.errors=errors;report.ok=true;report.completedAt=new Date().toISOString();console.log(JSON.stringify(report.samples.map(({variant,cpuMedianMs,cpuP95Ms,chartMedianMs,chartP95Ms,fps})=>({variant,cpuMedianMs,cpuP95Ms,chartMedianMs,chartP95Ms,fps})),null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(audit,'browser-metrics.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
