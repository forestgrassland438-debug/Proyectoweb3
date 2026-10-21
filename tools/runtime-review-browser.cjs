'use strict';
// Real browser DOM and Phaser EventEmitter; isolated from API, wallets and DB.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.GF_REVIEW_OUTPUT || path.join(root, 'audits/library-review-20261021T051408Z');
const files = ['vendor/phaser.min.js', 'LoadingSystem.js', 'gf-cola-cadena.js', 'gf-carga-mapa.js'];
async function main() {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!name) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body><div id="quick-slots-bar"></div>' + files.map(f => '<script src="/' + f + '"></script>').join('') + '</body></html>'); return; }
    if (!files.includes(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); fs.createReadStream(path.join(root, name)).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage(), errors = [], origin = 'http://127.0.0.1:' + server.address().port;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.addInitScript(() => {
      const intervals = new Set(), add = window.setInterval, remove = window.clearInterval;
      window.__reviewIntervals = intervals;
      window.setInterval = function (...args) { const id = add.apply(window, args); intervals.add(id); return id; };
      window.clearInterval = function (id) { intervals.delete(id); return remove.call(window, id); };
    });
    await page.goto(origin, { waitUntil: 'load' });
    const result = await page.evaluate(async () => {
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const nativeNow = Date.now; let clock = 100000, active = null, applied = 0;
      Date.now = () => clock;
      window.game = { scene: { getScenes: () => active ? [active] : [] } };
      const sockets = [], scenes = [];
      function scene() { const sc = { events: new Phaser.Events.EventEmitter(), STATE: {}, address: '0x' + '1'.repeat(40), playerName: 'Alice',
        sys: { isActive: () => true, settings: { key: 'GameScene' } }, load: { isLoading: () => false, progress: 1 }, player: {} }; scenes.push(sc); return sc; }
      try {
        for (let i = 0; i < 100; i++) {
          const sc = scene(), loading = new LoadingSystem(); active = sc; window.activeScene = sc;
          loading.show({ message: 'Preparing the map…' }); GFCargaMapa.retener(loading); GFCargaMapa.montar(sc); GFCargaMapa.listo(sc);
          for (const ms of [250, 250, 500]) { clock += ms; sc.events.emit('update'); }
          check(!GFCargaMapa.bloquea(sc) && sc.__gfCarga === null, 'map remained blocked at cycle ' + i);
          check(sc.events.eventNames().length === 0, 'Phaser lifecycle listener leak at cycle ' + i);
          loading.destroy();
          const sock = new Phaser.Events.EventEmitter(); sockets.push(sock); window.globalSocket = sock;
          const ticket = 'browser-ticket-' + i;
          GFColaCadena.esperar(ticket, { alOk(_data, target) { check(target.address === sc.address, 'wrong account'); applied++; } }, sc);
          active = null; window.activeScene = null;
          sock.emit('botin:acunado', { ticket, factura: { invoiceId: i + 1 } });
          if (i) check(sockets[i - 1].eventNames().length === 0, 'old socket retained listeners');
        }
        check(applied === 0 && GFColaCadena.cuantas() === 100, 'transition acknowledgements were lost');
        active = scene(); window.activeScene = active;
        await new Promise(resolve => setTimeout(resolve, 1200));
        check(applied === 100 && GFColaCadena.cuantas() === 0, 'acknowledgements did not reach the next map');
        for (let i = 0; i < 100; i++) window.globalSocket.emit('botin:acunado', { ticket: 'browser-ticket-' + i });
        check(applied === 100, 'duplicate acknowledgement applied');
        check(window.__reviewIntervals.size === 1, 'loading intervals retained');
        GFColaCadena.destruir(); window.loadingSystem.destroy();
        check(window.__reviewIntervals.size === 0, 'queue interval retained after destroy');
        check(sockets.every(s => s.eventNames().length === 0), 'socket listeners retained after destroy');
        check(document.querySelectorAll('#loading-overlay').length === 0, 'loading DOM retained');
        return { mapCycles: 100, acknowledgedDuringTransitions: applied, retainedIntervals: window.__reviewIntervals.size,
          retainedSceneListeners: scenes.reduce((sum, s) => sum + s.events.eventNames().length, 0), retainedSocketListeners: 0 };
      } finally { Date.now = nativeNow; }
    });
    assert.deepEqual(errors, []); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'runtime-browser.json'), JSON.stringify({ ...result, errors, fixtureOnly: true }, null, 2));
    console.log(JSON.stringify({ ...result, errors }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
