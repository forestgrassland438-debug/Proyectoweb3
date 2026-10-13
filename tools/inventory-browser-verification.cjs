'use strict';
// Juego y DOM reales. Mongo/RPC aislados: las rutas de inventario se ejecutan
// desde el server2.js del escritorio, sin enviar transacciones reales.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bank = require('./gf-banco-tienda.js');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'GrasslandBuild/dist');
const source = fs.readFileSync(path.join(require('node:os').homedir(), 'Desktop', 'server2.js'), 'utf8');
const start = source.indexOf('const ITEM_TIPO_MAP = {'), end = source.indexOf('function itemTipoOnChain', start);
const types = vm.runInNewContext(source.slice(start, end) + '\nITEM_TIPO_MAP');
const address = '0x1111111111111111111111111111111111111111', playerName = 'Tester';
const mapsSmoke = process.argv.includes('--maps-smoke');
const worldQA = process.argv.includes('--world') || mapsSmoke, qaAlloc = {strength:0,defense:0,wisdom:0,patience:0,farming:0,woodcutting:0,fishing:0,combat:0};
const gp = {}, routes = new Map(), queues = new Map(), calls = [], chain = new bank.CadenaFalsa();
const relayServer = new bank.ServidorFalso(chain, address, { snapshotComoObjeto: true });
const query = get => ({ select() { return this; }, lean() { return this; }, exec: async () => structuredClone(get()),
  then(ok, bad) { return this.exec().then(ok, bad); } });
const context = { console, Date, Map, Set, Number, String, Math, ITEM_TIPO_MAP: types, INV_SLOTS: 40, CHEST_SLOTS: 7,
  itemTipoOnChain: id => types[id] || null,
  app: { post: (url, ...args) => routes.set(url, args.at(-1)), get: (url, ...args) => routes.set(url, args.at(-1)) },
  apiLimiter() {}, authMiddleware() {}, csrfProtection() {}, validationResult: () => ({ isEmpty: () => true }),
  param: () => ({ isString() { return this; }, notEmpty() { return () => {}; } }),
  PlayerAuth: { findOne: () => query(() => ({ address, playerName })) },
  GamePlayer: { findOne: () => query(() => gp), updateOne: async (_filter, update) => Object.assign(gp, update.$set),
    findOneAndUpdate: async (filter, update) => {
      for (const k of ['inventory', 'chest', 'marketWriteAt']) if (JSON.stringify(filter[k] ?? null) !== JSON.stringify(gp[k] ?? null)) return null;
      Object.assign(gp, structuredClone(update.$set)); return structuredClone(gp);
    } },
  Admin: { findById: () => query(() => ({ hora: 12, dia_noche: 1 })) },
  MissionsPlayer: { findOne: () => query(() => ({})) },
  progresoMascota: () => ({ petLevel: 6 }), sembrarExpMascota: async () => {},
  programarIdentidadEnCadena() {}, programarCasillasEnCadena() {},
  facturasLibresDeCadena: async () => chain.vivasDe(null, address).map(f => ({ ...f })),
  enColaDelJugador(key, job) {
    const work = (queues.get(key) || Promise.resolve()).then(job);
    const done = work.catch(() => {}).finally(() => { if (queues.get(key) === done) queues.delete(key); });
    queues.set(key, done); return work;
  },
  saveGamePlayerWithTutorial: async (_name, fields) => Object.assign(gp, structuredClone(fields))
};
const fn = source.indexOf('function ponerFacturaEnSlots(inventory, chest, itemId, factura) {');
const helper = source.slice(source.indexOf('// <<SHOP-PVP-SYNC>>'), source.indexOf('// <<SHOP-PVP-SYNC-FIN>>'));
const load = source.slice(source.indexOf("app.get('/api/load/:playerName'"), source.indexOf('// --- RUTAS DE RECOLECCIÓN DE AGUA ---'));
vm.createContext(context);
vm.runInContext(source.slice(fn, source.indexOf('/* Resta una unidad', fn)) + helper + load, context);

const injection = String.raw`
(function(){
 const offline = window.fetch, native = window.__inventoryNativeFetch;
 let boot;
 window.fetch = async function(url, options){
   const pathname = new URL(String(url), location.origin).pathname;
   if (/^\/api\/load\//.test(pathname) && !boot) boot = (async()=>{
     const data = await (await offline(url, options)).json();
     await native('/__inventory_init', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   })();
   if (boot && (/^\/api\/(load|save)\//.test(pathname) || pathname.startsWith('/api/inventory/') || pathname.startsWith('/api/relay/'))) await boot;
   if (/^\/api\/(load|save)\//.test(pathname) || pathname.startsWith('/api/inventory/') || pathname.startsWith('/api/relay/') || pathname.startsWith('/api/player/'))
     return native(pathname, options);
   return offline(url, options);
 };
})();`;
async function readBody(req) { let s = ''; for await (const chunk of req) s += chunk; return s ? JSON.parse(s) : {}; }
async function main() {
  fs.mkdirSync(dist, { recursive: true });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), pathname = url.pathname;
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (pathname === '/__inventory_init') {
        Object.assign(gp, await readBody(req), { playerName, address, marketWriteAt: new Date(0) });
        for (const list of [gp.inventory, gp.chest]) for (const slot of list) {
          if (slot.objeto && types[slot.objeto]) slot.IDX = chain.crear(address, types[slot.objeto], slot.cantidad, slot.Manualid);
        }
        // Compras anteriores presentes en la cadena pero borradas del guardado.
        for (const id of ['Semillax1', 'Semillax2', 'Semillax3', 'Semillax4']) chain.crear(address, types[id], 3, 'antigua-' + id);
        return json({ ok: true });
      }
      if (pathname.startsWith('/api/')) {
        const body = await readBody(req); calls.push({ pathname, method: req.method });
        if (pathname.startsWith('/api/relay/')) {
          const result = await relayServer.fetch('https://prueba.local' + pathname, { method: req.method, body: JSON.stringify(body) });
          return json(await result.json(), result.status);
        }
        if (worldQA && pathname === '/api/player/skills') return json({ok:true,level:4,available:4-Object.values(qaAlloc).reduce((a,b)=>a+b,0),allocations:qaAlloc});
        if (worldQA && pathname === '/api/player/skills/allocate') { qaAlloc[body.skill]++; return json({ok:true,available:4-Object.values(qaAlloc).reduce((a,b)=>a+b,0),allocations:qaAlloc}); }
        if (worldQA && pathname === '/api/player/vitals') return json({ok:true,stats:{vida:80,agua:100,comida:100}});
        if (worldQA && pathname === '/api/player/sword-power') return json({ok:true,duration:3000});
        if (pathname === '/api/inventory/casillas') return json({ soportado: false, casillas: {}, enCofres: [] });
        if (pathname.startsWith('/api/save/')) {
          delete body.playerName; delete body.address; delete body.marketWriteAt;
          const stale = await context.guardarInventarioProtegido(playerName, address, body, body.inventoryLoadedAt);
          return json({ success: true, inventoryObsoleto: stale });
        }
        const route = routes.get(pathname.startsWith('/api/load/') ? '/api/load/:playerName' : pathname);
        if (!route) return json({ error: 'fixture_route_missing' }, 404);
        let status = 200;
        await route({ user: { address }, params: { playerName }, body },
          { status(n) { status = n; return this; }, json(data) { json(data, status); } });
        return;
      }
      if (pathname === '/__inventory_browser') {
        let html = fs.readFileSync(path.join(root, '_prueba_offline.html'), 'utf8').replace('<head>',
          '<head><script>window.__inventoryNativeFetch=window.fetch.bind(window);</script>');
        if(worldQA) html = html.replace('</head>','<script src="./gf-character-skills.js" defer></script><script src="./gf-session-api.js" defer></script><script src="./gf-mina-espectros.js" defer></script><link rel="stylesheet" href="./gf-character-skills.css"><link rel="stylesheet" href="./gf-espada-poderes.css"></head>');
        if(mapsSmoke) html = html.replace('<script src="./register-scenes.js', '<script src="./Scenes/SalvajeScene.js" defer></script><script src="./register-scenes.js');
        res.setHeader('Content-Type', 'text/html'); return res.end(html);
      }
      const file = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      const mime = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
        '.html': 'text/html', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      if (pathname === '/_prueba_offline_mock.js') return res.end(fs.readFileSync(file, 'utf8') + injection);
      fs.createReadStream(file).pipe(res);
    } catch (e) { json({ error: e.message }, 500); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], samples = [], messages = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') messages.push(msg.text().slice(0, 700)); });
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() :
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(origin + '/__inventory_browser?tut=22', { waitUntil: 'domcontentloaded' });
    const ready = async key => page.waitForFunction(key => {
      const scene = window.game?.scene.getScene(key);
      return scene?.sys.isActive() && scene.player && scene._inventarioCargado === true;
    }, key, { timeout: 60000 });
    const sample = async key => {
      await ready(key);
      const result = await page.evaluate(key => {
        const s = game.scene.getScene(key), counts = {};
        for (const slot of [...s.STATE.slots, ...s.STATE.quickSlots]) if (slot) counts[slot.id] = (counts[slot.id] || 0) + slot.count;
        return { key, counts, revision: s._inventoryLoadedAt,
          seedsInDom: [...document.querySelectorAll('.inv-slot img,.quick-slot img')].filter(img => /^Semillax/.test(img.alt)).length };
      }, key);
      samples.push(result); console.log(key, JSON.stringify(result.counts)); return result;
    };
    const initial = await sample('GameScene');
    if (mapsSmoke) {
      await page.evaluate(()=>game.scene.getScene('GameScene').entrarEnSalvaje());
      const wilderness = await sample('SalvajeScene');assert.deepEqual(wilderness.counts,initial.counts);
      await page.waitForFunction(()=>!!game.scene.getScene('SalvajeScene').__gfEspada);
      await page.keyboard.down('ArrowLeft');await page.waitForTimeout(1200);await page.keyboard.up('ArrowLeft');
      await page.screenshot({path:path.join(dist,'salvaje-preserved-22.4.png')});
      await page.evaluate(()=>game.scene.getScene('SalvajeScene')._volverAlPueblo());
      assert.deepEqual((await sample('GameScene')).counts,initial.counts);
      await page.evaluate(()=>game.scene.getScene('GameScene').entrarEnLaMina());await sample('MinaScene');
      await page.waitForTimeout(2500);await page.screenshot({path:path.join(dist,'mine-stairs-22.4.png')});
      assert.deepEqual(errors,[]);assert.equal(messages.filter(m=>m.includes('Error en el bucle del juego')).length,0);
      fs.writeFileSync(path.join(dist,'maps-smoke-22.4.json'),JSON.stringify({samples,errors,messages},null,2));
      console.log('Manual SalvajeScene preserved; inventory survives entry and return. Mine stairs rendered.');
      return;
    }
    if(worldQA){
      await page.evaluate(()=>game.scene.getScene('GameScene').openSkillsPanel());
      await page.waitForFunction(()=>document.querySelectorAll('#gf-character-upgrades button:not(:disabled)').length===8);
      await page.locator('#gf-character-upgrades button').first().click();
      await page.waitForFunction(()=>game.scene.getScene('GameScene').skillAllocations.strength===1);
      await page.evaluate(()=>game.scene.getScene('GameScene').closeSkillsPanel());
      const performanceSamples=[];
      for(const weather of process.argv.includes('--skipweather') ? [] : ['claro','nieve','tormenta']){
        await page.keyboard.down('ArrowRight');
        const perf=await page.evaluate(async weather=>{
          GFClima.probar(weather);await new Promise(r=>setTimeout(r,2500));
          const deltas=[],t0=performance.now();let before=t0;
          await new Promise(resolve=>{function frame(t){deltas.push(t-before);before=t;if(deltas.length>=80)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
          deltas.sort((a,b)=>a-b);const s=game.scene.getScene('GameScene');
          return {weather,walking:true,p50:deltas[40],p95:deltas[76],max:deltas[79],visibleLeaves:(s.__gfViento&&s.__gfViento.hojas||[]).filter(h=>h.spr.alpha>0).length,climate:GFClima.diagnostico()};
        },weather);await page.keyboard.up('ArrowRight');performanceSamples.push(perf);if(weather==='nieve')assert.equal(perf.visibleLeaves,0);
      }
      if(performanceSamples.length)fs.writeFileSync(path.join(dist,'world-performance-22.4.json'),JSON.stringify(performanceSamples,null,2));
      await page.screenshot({path:path.join(dist,'weather-22.4.png')});await page.evaluate(()=>GFClima.probar('claro'));
    }
    assert.equal(initial.counts.Semillax1, 3, 'Recuperación de compras anteriores al arrancar');
    await page.evaluate(() => {
      const s = game.scene.getScene('GameScene'), r = s.collisionRectangles1[0]; s._puertaArmada = true;
      s.player.setPosition(r.centerX, r.y + 5); s.player.body?.reset(r.centerX, r.y + 5);
    });
    await sample('tiendajuego');
    await page.evaluate(async () => {
      const shop = initTienda(game.scene.getScene('tiendajuego'));
      shop.open();
      for (const id of ['Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4']) {
        const item = Object.values(shop.itemsTienda).flat().find(it => it.id === id);
        await shop.processPurchase(item, 1); await shop._colaTienda;
      }
      shop.close();
    });
    const purchased = await sample('tiendajuego');
    for (const id of ['Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4']) assert.equal(purchased.counts[id], initial.counts[id] + 1);
    const check = async key => {
      const current = await sample(key);
      assert.deepEqual(current.counts, purchased.counts, key + ': inventario completo conserva cantidades');
      assert.ok(current.seedsInDom >= 5, key + ': semillas visibles en DOM');
    };
    await page.evaluate(() => {
      const s = game.scene.getScene('tiendajuego'), r = s.collisionRectangles1[0]; s._puertaArmada = true;
      s.player.setPosition(r.centerX, r.y - 5); s.player.body?.reset(r.centerX, r.y - 5);
    });
    await check('GameScene');
    await page.evaluate(() => game.scene.getScene('GameScene').entrarEnLaMina()); await check('MinaScene');
    if(worldQA){
      await page.waitForFunction(()=>game.scene.getScene('MinaScene').__gfEspectros?.mobs.length===4);
      await page.waitForFunction(()=>!!game.scene.getScene('MinaScene').__gfEspada);
      await page.evaluate(()=>{const s=game.scene.getScene('MinaScene'),m=s.__gfEspectros.mobs[2];s.player.setPosition(m.x-55,m.y-45);s.player.body.reset(m.x-55,m.y-45);s.lastDirection='right';GFEspada.equipar('espada_madera');});
      await page.waitForTimeout(500);await page.screenshot({path:path.join(dist,'mine-mage-22.4.png')});
      const powers=await page.evaluate(()=>{const s=game.scene.getScene('MinaScene'),m=s.__gfEspectros.mobs[2],before=m.health;s.player.setPosition(m.x-55,m.y-45);s.lastDirection='right';GFEspada.equipar('espada_madera');const accepted=GFEspada.usarPoder(s,'b');return {before,after:m.health,accepted,equipped:GFEspada.equipada(),has:s.contarItemEnInventario('espada_madera'),changing:s._cambiandoEscena,now:s.time.now,ready:s.__gfEspada.listoEn,powerButtons:document.querySelectorAll('#gf-espada-poderes button').length};});
      console.log('Sword ability', JSON.stringify(powers));
      assert.ok(powers.after<powers.before);assert.equal(powers.powerButtons,3);
      await page.waitForTimeout(100);await page.screenshot({path:path.join(dist,'mine-sword-22.4.png')});
      await page.setViewportSize({width:844,height:390});const mobileSession=await page.context().newCDPSession(page);await mobileSession.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await page.waitForTimeout(500);
      const layout=await page.evaluate(()=>[...document.querySelectorAll('#gf-espada-poderes button')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
      console.log('Mobile ability layout',JSON.stringify(layout));
      await page.screenshot({path:path.join(dist,'mine-mobile-powers-22.4.png')});
      assert.ok(layout.every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=844&&r.y+r.height<=390));
      const overlapsAttack = () => page.evaluate(() => {const a=document.getElementById('gf-tajo-btn').getBoundingClientRect();return [...document.querySelectorAll('#gf-espada-poderes button')].some(b=>{const r=b.getBoundingClientRect();return r.left<a.right&&r.right>a.left&&r.top<a.bottom&&r.bottom>a.top;});});
      assert.equal(await overlapsAttack(),false,'abilities must not cover the normal attack button');
      for(const width of [390,320]) {
        await page.setViewportSize({width,height:844});await page.waitForTimeout(300);
        assert.equal(await overlapsAttack(),false);
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#gf-espada-poderes button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})),true);
      }
      await mobileSession.send('Emulation.setTouchEmulationEnabled',{enabled:false});await mobileSession.detach();await page.setViewportSize({width:1280,height:800});
      await page.evaluate(()=>{const s=game.scene.getScene('MinaScene');s.openSkillsPanel();});
      await page.waitForFunction(()=>game.scene.getScene('MinaScene').skillAllocations?.strength===1);await page.evaluate(()=>game.scene.getScene('MinaScene').closeSkillsPanel());
      await page.evaluate(()=>{const s=game.scene.getScene('MinaScene'),boss=s.__gfSerpiente;if(boss&&boss.s){s.player.setPosition(boss.s.x+160,boss.s.y-45);s.player.body.reset(s.player.x,s.player.y);}});
      await page.waitForTimeout(4000);await page.screenshot({path:path.join(dist,'mine-serpent-22.4.png')});
    }
    await page.evaluate(() => game.scene.getScene('MinaScene')._volverAlMapa()); await check('GameScene');
    await page.evaluate(() => GFLands.ir(game.scene.getScene('GameScene'))); await check('LandsScene');
    if(worldQA){
      await page.waitForFunction(()=>!!game.scene.getScene('LandsScene').__gfEspada);
      const shore=await page.evaluate(()=>{const s=game.scene.getScene('LandsScene'),terrain=s.map.getLayer('Terrain');let shore;
        for(let y=1;y<terrain.height-1&&!shore;y++)for(let x=1;x<terrain.width-1;x++)if(terrain.data[y][x].index!==43&&terrain.data[y][x-1].index===43){shore={x:x*64+18,y:y*64+32};break;}
        const a=s.__gfPescaAgua;return{shore,water:a&&a.m[Math.floor(shore.y/64)*a.w+Math.floor((shore.x-40)/64)],tile:a&&a.tileSize};});
      assert.equal(shore.tile,64);assert.equal(shore.water,2);
    }
    await page.evaluate(() => GFLands.volver(game.scene.getScene('LandsScene'))); await check('GameScene');
    await page.evaluate(() => {
      const s = game.scene.getScene('GameScene'), r = s.collisionRectangles1[0]; s._puertaArmada = true;
      s.player.setPosition(r.centerX, r.y + 5); s.player.body?.reset(r.centerX, r.y + 5);
    });
    await check('tiendajuego');
    assert.deepEqual(errors, [], 'Errores de ejecución durante el recorrido');
    if(worldQA)assert.equal(messages.filter(m=>m.includes('Error en el bucle del juego')).length,0);
    fs.writeFileSync(path.join(dist, 'inventory-browser-verification.json'), JSON.stringify({ samples, errors, messages, calls }, null, 2));
    console.log('Cinco compras, recuperación de compras anteriores y recorrido real tienda/mapa/mina/Lands/tienda correctos.');
  } catch (e) {
    fs.writeFileSync(path.join(dist, 'inventory-browser-verification.json'), JSON.stringify({ samples, errors, messages, calls, failure: e.stack }, null, 2));
    throw e;
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
