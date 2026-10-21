'use strict';
// Isolated browser QA. Every API/RPC request is intercepted; no live wallet, chain or DB is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium}=require('playwright')); }
catch (_) { ({chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
process.env.GF_ADMIN_PREVIEW_PORT='0';
const server = require('./admin-suite-preview.cjs');
const evidence = path.resolve(__dirname,'../audits/admin-suite-20261020-225316/verification');
const address = '0x'+'1'.repeat(40), second = '0x'+'2'.repeat(40);
const mission = {missionId:'daily_coal',tipo:'entregar',itemId:'carbon',monstruo:'',requiredAmount:3,expReward:0,goldReward:0,silverReward:10,texts:{'en-US':{title:'Bring coal',description:'A test adventure.',itemName:'Coal',rewardName:''},'es-419':{title:'Trae carbón',description:'Una aventura de prueba.',itemName:'Carbón',rewardName:''}}};
const rules = {activo:true,cuantas:3,pesoEntregar:60,pesoCazar:40,horaReinicio:0,semilla:7,pedidos:[{itemId:'carbon',nombre:'Coal',min:2,max:5}],presas:[{tipo:'*',nombre:'Monsters',min:2,max:4}],premios:[{itemId:'Semillax',nombre:'Seeds',min:1,max:3,peso:1}],probPremio:75,expMin:40,expMax:140,oroMin:0,oroMax:0,plataMin:10,plataMax:60};
async function main() {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  fs.mkdirSync(evidence,{recursive:true});
  const errors=[],writes=[],checks=[]; let authorized=false,role=true,roleUnavailable=false,refreshes=0,csrf='test-csrf',signatures=0,expired=false;
  try {
    const context = await browser.newContext({viewport:{width:1512,height:1050},acceptDownloads:true});
    await context.addInitScript(({address})=>{
      if(window.parent!==window&&window.parent.ethereum){window.ethereum=window.parent.ethereum;return;}
      const events = new Map();
      window.__walletEvents = events; window.__signatures = 0;
      window.ethereum={isMetaMask:true,request:async({method})=>{if(method==='eth_accounts'||method==='eth_requestAccounts')return[address];if(method==='personal_sign'){window.__signatures++;return '0x'+'f'.repeat(130);}if(method==='eth_chainId')return '0x1159';throw Error('Unexpected wallet method '+method);},on(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeListener(name,fn){events.get(name)?.delete(fn);}};
    },{address});
    await context.route('**/*',async route=>{
      const req = route.request(),url = new URL(req.url()),p=url.pathname;
      const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      if (!p.startsWith('/api/')) {
        if(url.origin!==origin)return route.abort();
        return route.continue();
      }
      if(p==='/api/auth/refresh'){refreshes++;if(!authorized)return json({error:'unauthorized'},401);expired=false;csrf='refreshed-csrf';return json({csrfToken:csrf});}
      if(p==='/api/auth/csrf-token')return json({csrfToken:csrf});
      if(p==='/api/auth/nonce')return json({nonce:'fixture-nonce'});
      if(p==='/api/auth/login'){authorized=true;signatures++;return json({csrfToken:csrf});}
      if(p==='/api/auth/logout'){authorized=false;return json({ok:true});}
      if(!authorized||expired)return json({error:'admin_auth_required'},401);
      if(!role)return json({error:'not_admin'},403);
      if(p==='/api/admin/whoami'&&roleUnavailable)return json({error:'admin_verification_unavailable',retryAfterSeconds:1},503);
      if(!['GET','HEAD'].includes(req.method()))writes.push({path:p,method:req.method(),body:req.postDataJSON(),csrf:req.headers()['x-csrf-token']});
      if(p==='/api/admin/whoami')return json({ok:true,address});
      if(p==='/api/admin/overview')return json({totalCuentas:128,nuevas24h:4,nuevas7d:19,activos24h:37,conectados:8,tiempoTotal:'2 h',tiempoTotalSegundos:7200});
      if(p.startsWith('/api/admin/missions/days/'))return json({days:[{day:'2026-10-21',count:3},{day:'2026-10-22',count:4}]});
      if(p==='/api/admin/missions/catalogo')return json({monstruos:[{tipo:'*',nombre:'Any monster'},{tipo:'lobo_salvaje',nombre:'Shadow Wolf'}],items:['carbon','Semillax']});
      if(p.startsWith('/api/admin/missions/daily/')){
        const day=p.split('/').at(-1);
        if(day==='2026-11-01')await new Promise(resolve=>setTimeout(resolve,350));
        return json({found:true,mission:{auto:true,dailyResetHour:0,missions:[{...mission,missionId:'coal_'+day,texts:{...mission.texts,'en-US':{...mission.texts['en-US'],title:day==='2026-11-02'?'Newer day':'Bring coal'}}}]}});
      }
      if(p==='/api/admin/missions/daily')return json({count:req.postDataJSON().missions.length,npcId:req.postDataJSON().npcId,day:req.postDataJSON().day});
      if(p.endsWith('/preview'))return json({day:req.postDataJSON().day,missions:[mission]});
      if(p.startsWith('/api/admin/missions/auto/'))return json({npcId:p.split('/').at(-1),reglas:req.method()==='PUT'?{...rules,...req.postDataJSON()}:rules});
      if(p==='/api/admin/missions/entregas')return json({day:url.searchParams.get('day'),npcId:'granjero',auto:false,misiones:[{...mission,titulo:'Bring coal'}],total:1,rows:[{playerName:'=1+1',username:'<img src=x onerror=alert(1)>',address,nivel:4,completadas:[{missionId:mission.missionId,exp:0,oro:0,plata:10}],recibido:{exp:0,oro:0,plata:10},ultima:'2026-10-21T00:00:00Z'}]});
      if(p==='/api/admin/missions/history')return json({total:0,rows:[]});
      if(p==='/api/access')return json({mode:'all',whitelist:[],banned:[]});
      if(p==='/api/admin/weather')return json({config:{activo:true,modo:'auto',estacion:'auto',viento:true,lluvia:false,nieve:false,soleado:false,nublado:false,truenos:false,vientoFuerza:1,lluviaFuerza:1,nieveFuerza:1,soleadoFuerza:1,nubladoFuerza:1,probViento:.25,probLluvia:.15,probNieve:.05,minutosSorteo:30,duracionMin:10,duracionMax:60,cola:[]},publico:{activo:true,viento:true}});
      if(p==='/api/admin/world-time')return json({reloj:{modo:'auto'},estado:{esDia:true,horaTexto:'08:00'}});
      if(p==='/api/admin/reports')return json({reports:[],total:0,page:1,pages:1,resumen:{}});
      if(p==='/api/admin/suspensions')return json({suspensions:[],rules:{}});
      if(p==='/api/admin/client-errors')return json({items:[],total:0,ocurrencias:0,tipos:[]});
      if(p==='/api/admin/relay-failures')return json({items:[],total:0});
      if(p==='/api/admin/collections/bootstrap')return json({address,isSystemOwner:true,chainId:4441,contractAddress:second,collections:[],tokens:[],history:[],operations:[],royaltyPayments:[],scan:{},capabilities:{},abi:[]});
      if(p==='/api/admin/players')return json({players:[],total:0,totalGlobal:0,page:1,pages:1});
      if(p==='/api/admin/tablas')return json({tablas:[]});
      if(p==='/api/admin/nft-coleccion')return json({config:{},chainIdJuego:4441});
      if(p==='/api/admin/farming-config')return json({config:{},seeds:[]});
      if(p==='/api/admin/leaderboard-config')return json({config:{}});
      if(p==='/api/admin/impact/summary')return json({users:{registered:128},playtime:{},contract:{},relayer:{},quality:{notes:[]},scan:{status:'idle'}});
      if(p==='/api/admin/impact/users')return json({rows:[],total:0,page:1});
      if(p==='/api/admin/impact/scan')return json({scan:{status:'idle'}});
      return json({error:'mock_endpoint_unavailable',path:p},404);
    });
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.stack)); page.on('dialog',d=>d.accept());
    await page.goto(origin+'/control-center.html?lang=en&theme=dark');
    await page.locator('#cc-connect').waitFor({state:'visible'});
    assert.equal(await page.locator('#cc-app').isVisible(),false);
    await page.screenshot({path:path.join(evidence,'login-dark-en.png'),fullPage:true});
    await page.locator('#cc-connect').click();
    await page.locator('#cc-metrics').getByText('128',{exact:true}).waitFor();
    assert.equal(signatures,1); checks.push('Wallet sign-in, backend role verification, private gate and real snapshot');
    await page.screenshot({path:path.join(evidence,'overview-dark-en.png'),fullPage:true});
    await page.locator('#cc-lang').selectOption('es');
    assert.equal(await page.locator('html').getAttribute('lang'),'es');
    await page.locator('#cc-topbar').count();
    await page.locator('[data-cc-theme]').last().click();
    await page.screenshot({path:path.join(evidence,'overview-light-es.png'),fullPage:true});
    await page.locator('#cc-lang').selectOption('en');
    await page.locator('[data-tool="misiones"]').click();
    let frame = page.frameLocator('#cc-frame-host iframe');
    await frame.locator('#misiones .mission').waitFor();
    await frame.getByLabel('EXP',{exact:true}).first().waitFor();
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.GFMissionEditor?.context().loaded);
    assert.equal(await frame.getByLabel('EXP',{exact:true}).inputValue(),'0');
    assert.equal(await page.locator('iframe').count(),1);
    assert.equal(await frame.locator('.suite-bar').isVisible(),false);
    await frame.getByLabel('EXP',{exact:true}).fill('25');
    await page.locator('#cc-tool-dirty').waitFor({state:'visible'});
    const acceptDialog=page.listeners('dialog')[0];page.removeListener('dialog',acceptDialog);page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('[data-tool="climas"]').click();
    assert.ok((await page.locator('#cc-frame-host iframe').getAttribute('src')).includes('misiones.html'));
    assert.equal(await frame.getByLabel('EXP',{exact:true}).inputValue(),'25');page.on('dialog',acceptDialog);
    await page.locator('#cc-lang').selectOption('es');await page.locator('#cc-lang').selectOption('en');
    assert.equal(await frame.getByLabel('EXP',{exact:true}).inputValue(),'25');
    checks.push('Discard cancellation and language switching preserve manual input');
    await frame.locator('#btnGuardar').click();
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.GFAdminUI.dirty===false);
    const saved = writes.find(w=>w.path==='/api/admin/missions/daily'); assert.equal(saved.body.missions[0].expReward,25); assert.equal(saved.csrf,csrf);
    checks.push('Zero-EXP preservation, scoped dirty tracking, reviewed save and fresh CSRF');
    await frame.getByRole('button',{name:'Duplicate',exact:true}).click();
    assert.equal(await frame.locator('#misiones .mission').count(),2);
    await frame.locator('#btnGuardar').click();
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.GFAdminUI.dirty===false);
    await frame.locator('#dia').fill('2026-11-01'); await frame.locator('#btnCargar').click();
    await frame.locator('#dia').fill('2026-11-02'); await frame.locator('#btnCargar').click();
    await frame.locator('#ms-player-preview h4').filter({hasText:'Newer day'}).waitFor();
    await new Promise(resolve=>setTimeout(resolve,450));
    assert.equal(await frame.locator('#ms-player-preview h4').textContent(),'Newer day');
    checks.push('Stale daily responses cannot overwrite the selected day');
    await page.screenshot({path:path.join(evidence,'missions-light-en.png'),fullPage:true});
    await page.locator('[data-cc-theme]').last().click();await frame.locator('#ms-player-preview').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidence,'missions-preview-dark-en.png'),fullPage:true});await page.locator('[data-cc-theme]').last().click();
    await frame.locator('#ms-tab-automatic').click(); await frame.locator('#btnAutoPrevia').click();
    await frame.locator('#autoPrevia .prev-m').waitFor();
    const previewWrite = writes.find(w=>w.path.endsWith('/preview')); assert.equal(previewWrite.body.reglas.semilla,7);
    checks.push('Automatic preview keeps the saved reroll seed');
    const beforePreview=await frame.locator('#misiones').textContent();
    await frame.locator('#autoPesoE').fill('61');await frame.locator('#btnAutoAlEditor').click();
    assert.equal(await frame.locator('#misiones').textContent(),beforePreview);
    await frame.locator('#autoPesoE').fill('60');
    checks.push('A preview with different rules cannot replace the manual editor');
    await frame.locator('#ms-tab-deliveries').click(); await frame.locator('#btnEntregas').click();
    await frame.locator('.ms-result-bar').waitFor();
    assert.equal(await frame.locator('#entregas img').count(),0);
    await page.screenshot({path:path.join(evidence,'missions-deliveries-light-en.png'),fullPage:true});
    const downloadPromise = page.waitForEvent('download'); await frame.locator('#btnEntregasCsv').click();
    const download = await downloadPromise, csv = fs.readFileSync(await download.path(),'utf8'); assert.match(csv,/'=1\+1/);
    checks.push('Delivery graphs, safe user text, CSV spreadsheet formula protection');
    expired=true;
    await frame.locator('#btnEntregas').click();
    await page.waitForFunction(()=>window.GFAdminSession.diagnostics().pending===0);
    assert.ok(refreshes>=2); checks.push('Session expiry recovers without another signature');
    const navTools=['climas','consola-reportes','reporter','puerta-login','colecciones','admin','contrato-stats'];
    for(const tool of navTools){await page.locator('[data-tool="'+tool+'"]').click();await page.locator('#cc-frame-status').waitFor({state:'hidden'});assert.equal(await page.locator('iframe').count(),1);assert.ok((await page.locator('iframe').getAttribute('src')).includes((tool==='puerta-login'?'puerta_login':tool)+'.html'));}
    const walletCount=await page.evaluate(()=>[...window.__walletEvents.values()].reduce((a,set)=>a+set.size,0));
    assert.ok(walletCount<=3,'Provider listeners were retained after leaving tools: '+walletCount);
    checks.push('All eight tools open independently; one iframe; provider listener cleanup');
    await page.locator('#cc-tool-close').click(); await page.setViewportSize({width:390,height:844});await page.locator('#cc-lang').selectOption('es');
    await page.screenshot({path:path.join(evidence,'overview-mobile-light-es.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#cc-menu').click(); await page.locator('[data-tool="misiones"]').click();
    await page.locator('#cc-frame-status').waitFor({state:'hidden'});
    await page.locator('#cc-lang').selectOption('en');
    await page.screenshot({path:path.join(evidence,'missions-mobile-light-en.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>{const d=document.querySelector('iframe').contentDocument;return d.documentElement.scrollWidth>d.defaultView.innerWidth;}),false);
    checks.push('Responsive 390 px layout without horizontal page overflow');
    await page.evaluate(({second})=>{window.__walletEvents.get('accountsChanged').forEach(fn=>fn([second]));},{second});
    await page.locator('#cc-gate').waitFor({state:'visible'}); assert.equal(await page.locator('iframe').count(),0);
    checks.push('Changing wallet locks the workspace and removes the active tool');
    role=false;const denied=await context.newPage();denied.on('pageerror',e=>errors.push(e.stack));await denied.goto(origin+'/control-center.html?lang=en');
    await denied.locator('#cc-gate-message').filter({hasText:'Your wallet is not an administrator.'}).waitFor();assert.equal(await denied.locator('#cc-app').isVisible(),false);await denied.close();
    role=true;roleUnavailable=true;const unavailable=await context.newPage();await unavailable.goto(origin+'/control-center.html?lang=en');await unavailable.locator('#cc-retry').waitFor({state:'visible'});
    assert.equal(await unavailable.locator('#cc-app').isVisible(),false);assert.equal(signatures,1);await unavailable.close();roleUnavailable=false;
    checks.push('Non-admin and unavailable role verification remain gated without extra signatures');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({checks,errors,writes:writes.map(w=>({path:w.path,method:w.method})),signatures,refreshes,walletCount},null,2));
    console.log(JSON.stringify({checks,errors,evidence},null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
