'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'audits/economia-20261028');
const now = Date.parse('2026-10-28T15:00:00Z');
const eco = { ok: true, ahora: now, dia: '2026-10-28', salud: 'estable', inflacion7: 0.02, inflacionNeta7: 0.02,
  tope: 300, precioOro: { zkltc: 0.001, base: 0.001, gwei: 1000000 }, compra: { activa: false },
  comisiones: { cambioBps: { oro: 100, plata: 200, bronce: 300 } },
  serie: [{ dia: '2026-10-28', precio: 0.001, oro: 10, plata: 100, bronce: 1000, inflacion1: null, inflacionNeta7: null }] };
const indexBody = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styless.css"></head><body style="overflow:auto;background:#0b211e"><div id="panels" style="max-width:560px;margin:auto;padding:12px"></div><script>
window.__activeRO=0;window.__activeMO=0;
for (const [name,key] of [['ResizeObserver','__activeRO'],['MutationObserver','__activeMO']]) { const Native=window[name];window[name]=class extends Native { constructor(...a){super(...a);this.tracked=false;} observe(...a){if(!this.tracked){window[key]++;this.tracked=true;}return super.observe(...a);} disconnect(){if(this.tracked){window[key]--;this.tracked=false;}return super.disconnect();}}; }
window.GFMascota={api:async ruta=>({ok:true,status:200,datos:ruta.includes('/oro/estado')?{ok:true,quedan:300,pendientes:[],historial:[]}:${JSON.stringify(eco)}})};
</script><script src="/gf-graficos.js"></script><script src="/gf-economia.js"></script></body></html>`;
const listing = { id: 'listing1', itemId: 'Semillax', name: 'Semilla de zanahoria', icon: '/favicon.png', category: 'semillas', owner: '0x' + 'b'.repeat(40), ownerName: 'Guardabosques', qty: 10, pricePerUnit: 12, currency: 'plata', mine: false };
const config = { indiceActivo: true, sensibilidad: 0.6, pasoMax: 0.03, demanda: 0.1, pesoObjetos: 0, muerteBase: 30, muerteMultiplicador: 2, muerteTope: 480, fundirTasa: 0.05, fundirMin: 50, craftearTasa: 0.04, craftearMin: 50 };
const admin = { ok: true, ahora: now, config, indice: 1, indiceAyer: 1, hoy: { masaActiva: 2000000, masaTotal: 12000000, precioGwei: 1000000, inflacionActiva7: 0.02, inflacionNeta7: 0.02, inflacionTotal7: 0.01 },
  tesoros: { circular: { saldo: 1000000, reservado: 0, quemado: 0, disponible: 900000 }, juego: { saldo: 10000000, quemado: 0, retenido: 0, disponible: 5000000 } },
  proyeccion: { cfgOro: { precioBase: 0.001, sensibilidad: 0.8, pasoMax: 0.05 } }, muerte: { cobros30: 0, cobrado30: 0 },
  servicios: { fundir: { n: 0, bronce: 0 }, craftear: { n: 0, bronce: 0 } }, ejemplosServicio: [], serie: [], quemas: { ultimas: [], porOrigen: [] } };
const policy = { ok: true, politica: { activo: true, quemaAutomatica: true, pisoJuego: 5000000, pisoCircular: 100000 }, estado: { ultima: '2026-10-28T15:00:00Z' }, disponibleJuego: 5000000, disponibleCircular: 900000, reservadoServicios: 0, reservadoBotin: 0 };
const adminBody = fs.readFileSync(path.join(root, 'economia.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__economy') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
  if (u.pathname === '/__shop') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styless.css"></head><body>' + indexBody + '</body></html>'); }
  if (u.pathname === '/__admin') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html data-admin-suite data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/admin-suite.css"><link rel="stylesheet" href="/tesoro.css"><link rel="stylesheet" href="/economia.css"></head><body>' + adminBody + `<script>document.getElementById('ec-gate').hidden=true;document.getElementById('ec-app').hidden=false;window.GFAdminUI={language:'es',t:x=>x};window.GFAdminSession={request:async p=>p.endsWith('/supervisor')?${JSON.stringify(policy)}:p.endsWith('/servicios/revisar')?{ok:true,filas:[]}:${JSON.stringify(admin)}};</script><script src="/gf-graficos.js"></script><script src="/economia2.js"></script><script src="/economia-supervisor.js"></script><script>document.dispatchEvent(new Event('gf-economia:cargada'));</script></body></html>`); }
  if (u.pathname.startsWith('/api/')) {
    let d = { ok: true };
    if (u.pathname === '/api/auth/me') d = { authenticated: true, address: '0x' + 'a'.repeat(40), playerName: 'Test' };
    if (u.pathname.endsWith('/csrf-token')) d = { csrfToken: 'local-fixture' };
    if (u.pathname.endsWith('/catalog')) d = { catalog: { Semillax: { name: 'Semilla de zanahoria' } }, categories: [{ id: 'semillas', label: 'Semillas' }] };
    if (u.pathname.endsWith('/account')) d = { address: '0x' + 'a'.repeat(40), oro: 100, plata: 500, inventory: [] };
    if (u.pathname.endsWith('/listings')) d = { listings: [listing] };
    if (u.pathname.endsWith('/my-listings')) d = { listings: [] };
    if (u.pathname.endsWith('/history')) d = { history: [] };
    if (u.pathname.includes('/economia/precio/')) d = { ok: true, ahora: now, indice: 1, actual: { compra: 10, venta: 5, moneda: 'plata', tienda: true },
      historial: [{ t: '2026-10-28T00:00:00Z', compra: 10, venta: 5, moneda: 'plata' }], p2p: { ventas: [] }, tienda: [] };
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(d));
  }
  const file = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const origin = 'http://127.0.0.1:' + server.address().port, errors = [], samples = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(viewport); await page.goto(origin + '/__economy');
      const result = await page.evaluate(async () => {
        const wait = () => new Promise(r => setTimeout(r, 5));
        for (let n = 0; n < 40; n++) {
          const c = document.createElement('div'); document.getElementById('panels').append(c);
          GFEconomia.montarCompra(c, {}, { address: '0x' + 'a'.repeat(40) }); await wait();
          if (!c.querySelector('.gfg svg')) throw Error('No graph was rendered');
          if (n < 39) { c.remove(); await wait(); }
        }
        const c = document.querySelector('#panels > div');
        if (!c.querySelector('circle')) throw Error('The single observation is invisible');
        c.querySelector('[data-g="inflacion"]').click();
        if (!c.textContent.includes('second day')) throw Error('Missing data must be shown, not fabricated');
        c.querySelector('[data-g="precio"]').click();
        return { resizeObservers: __activeRO, mutationObservers: __activeMO, overflow: document.documentElement.scrollWidth > innerWidth, graphs: c.querySelectorAll('.gfg').length };
      });
      assert.equal(result.resizeObservers, 1); assert.equal(result.mutationObservers, 1); assert.equal(result.overflow, false); assert.equal(result.graphs, 1);
      await page.screenshot({ path: path.join(out, 'recarga-' + viewport.width + '.png'), fullPage: true }); samples.push({ viewport, result });
      await page.evaluate(() => document.getElementById('panels').replaceChildren()); await page.waitForTimeout(10);
      assert.deepEqual(await page.evaluate(() => [__activeRO, __activeMO]), [0, 0]);
    }
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await page.goto(origin + '/market.html', { waitUntil: 'networkidle' });
      await page.waitForSelector('.ticket');
      await page.locator('#lang-switch [data-lang="en"]').click();
      assert.equal(await page.locator('#market-intro-title').textContent(), 'The forest trades, too.');
      assert.equal(await page.locator('.buy-btn').isVisible(), true); assert.equal(await page.locator('.stats-btn').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('.stats-btn').click(); await page.waitForSelector('#gfpp .gfg svg');
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#gfpp').count(), 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, 'market-' + viewport.width + '.png'), fullPage: true });
    }
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 600 }]) {
      await page.setViewportSize(viewport); await page.goto(origin + '/__shop');
      await page.evaluate(() => {
        const shop = document.getElementById('tienda-hub'); document.body.replaceChildren(shop); shop.classList.remove('tienda-hub-hidden');
        document.getElementById('interact-button-pc').disabled = false; document.getElementById('price-history-button-pc').disabled = false;
        document.getElementById('detail-name-simple').textContent = 'Wooden Pickaxe';
      });
      for (const id of ['interact-button-pc', 'price-history-button-pc']) {
        await page.locator('#' + id).scrollIntoViewIfNeeded();
        const visible = await page.locator('#' + id).evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
        assert.equal(visible, true, id + ' is clipped');
      }
      await page.screenshot({ path: path.join(out, 'shop-' + viewport.width + '.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(origin + '/__admin');
    await page.waitForSelector('#e3-state .ec-kpi');
    assert.equal(await page.locator('.ec-heroes > section').count(), 2);
    assert.equal(await page.locator('#e2-q-tesoro option').count(), 2);
    await page.locator('#e2-q-cantidad').fill('100');
    await page.screenshot({ path: path.join(out, 'control-economia-1280.png'), fullPage: true });
    const nullable = await page.evaluate(() => {
      const c = document.createElement('div'); document.body.append(c);
      const g = GFGraficos.crear(c, { series: [{ id: 'x' }], datos: { x: [['2026-10-28', null]] }, vacio: 'missing observation' });
      const missing = c.textContent.includes('missing observation'); g.destruir(); c.remove(); return missing;
    });
    assert.equal(nullable, true, 'null data must not become zero');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ panelCycles: 120, errors, samples }, null, 2));
    console.log('120 mount/unmount cycles; observers return to zero; desktop/mobile charts, market and shop buttons verified.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
