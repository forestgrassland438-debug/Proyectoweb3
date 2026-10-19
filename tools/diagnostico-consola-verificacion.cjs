'use strict';
// Fixture aislado: Phaser real, sin arrancar el juego ni conectar servicios externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'diagnostico-consola.js'), 'utf8');
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<canvas width="256" height="128" id="extra"></canvas>
<img id="asset" src="/asset.png?token=PRIVATE_QUERY_TOKEN#PRIVATE_FRAGMENT">
<script src="/phaser.min.js"></script>
<script>
window.game = new Phaser.Game({
  type: Phaser.CANVAS, width: 320, height: 200,
  banner: false, audio: { noAudio: true },
  scene: {
    key: 'FixtureScene',
    create() {
      this.textures.createCanvas('fixture-canvas', 128, 64);
      this.add.image(50, 50, 'fixture-canvas');
      const rect = this.add.rectangle(100, 100, 16, 16, 0xff0000);
      this.tweens.add({ targets: rect, x: 150, duration: 10000, yoyo: true, repeat: -1 });
      this.time.addEvent({ delay: 10000, loop: true, callback() {} });
      const pcm = new AudioBuffer({ length: 48000, numberOfChannels: 2, sampleRate: 48000 });
      this.cache.audio.add('fixture-audio', pcm);
      window.__fixtureScene = this;
      window.__fixturePCM = pcm;
      window.__fixtureReady = true;
    }
  }
});
</script></body></html>`;

async function main() {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); }
    else if (pathname === '/phaser.min.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(fs.readFileSync(path.join(root, 'vendor', 'phaser.min.js')));
    } else if (pathname === '/asset.png') {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzTkAAAAASUVORK5CYII=', 'base64'));
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    const outside = [];
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      outside.push(route.request().url());
      return route.abort();
    });
    await page.goto(origin + '/fixture?token=PRIVATE_PAGE_TOKEN#PRIVATE_PAGE_FRAGMENT', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__fixtureReady === true);
    await page.evaluate(() => {
      const tracked = { listeners: [], timers: new Map(), observers: [], fetch: 0, contexts: 0 };
      window.__diagTracked = tracked;
      for (const target of [window, document]) {
        const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
        target.addEventListener = (type, fn, options) => {
          tracked.listeners.push({ target, type, fn, capture: typeof options === 'boolean' ? options : !!options?.capture });
          return add(type, fn, options);
        };
        target.removeEventListener = (type, fn, options) => {
          const capture = typeof options === 'boolean' ? options : !!options?.capture;
          const i = tracked.listeners.findIndex(v => v.target === target && v.type === type && v.fn === fn && v.capture === capture);
          if (i >= 0) tracked.listeners.splice(i, 1);
          return remove(type, fn, options);
        };
      }
      for (const [setName, clearName] of [['setTimeout', 'clearTimeout'], ['setInterval', 'clearInterval']]) {
        const nativeSet = window[setName].bind(window), nativeClear = window[clearName].bind(window);
        window[setName] = (fn, delay, ...args) => {
          let id;
          const invoke = (...received) => {
            if (setName === 'setTimeout') tracked.timers.delete(id);
            return fn(...received);
          };
          id = nativeSet(invoke, delay, ...args);
          tracked.timers.set(id, { kind: setName, delay, fn });
          return id;
        };
        window[clearName] = id => { tracked.timers.delete(id); return nativeClear(id); };
      }
      const NativeObserver = PerformanceObserver;
      window.PerformanceObserver = class extends NativeObserver {
        constructor(fn) { super(fn); this.__active = false; tracked.observers.push(this); }
        observe(options) { super.observe(options); this.__active = true; }
        disconnect() { this.__active = false; return super.disconnect(); }
      };
      const nativeFetch = window.fetch;
      window.fetch = function (...args) { tracked.fetch++; return nativeFetch.apply(this, args); };
      const nativeContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) { tracked.contexts++; return nativeContext.apply(this, args); };
      window.__beforeTextures = Object.keys(game.textures.list);
      window.__beforeCanvas = game.textures.get('fixture-canvas');
      window.__diagState = () => ({
        listeners: tracked.listeners.length, timers: tracked.timers.size,
        activeObservers: tracked.observers.filter(o => o.__active).length,
        createdObservers: tracked.observers.length, fetch: tracked.fetch, contexts: tracked.contexts
      });
    });
    const requestsBefore = requests.length;
    await page.evaluate(source);
    const initial = await page.evaluate(() => ({ state: __diagState(), report: GFDiag.informe(), api: Object.keys(GFDiag) }));
    assert.deepEqual(initial.api.sort(), ['detener', 'guardar', 'informe', 'json', 'marcar', 'version'].sort());
    assert.equal(initial.report.actual.phaser.detectado, true);
    assert.equal(initial.report.actual.phaser.renderer, 'Canvas2D');
    assert.ok(initial.report.actual.phaser.texturas > 0);
    assert.equal(initial.report.actual.phaser.escenas[0].escena, 'FixtureScene');
    assert.ok(initial.report.actual.phaser.topTexturas.some(v => v.clave === 'fixture-canvas' && v.ancho === 128 && v.alto === 64));
    assert.ok(initial.report.actual.phaser.audioPCMMiB >= 0.36);
    assert.equal(initial.report.actual.phaser.topAudio[0].clave, 'fixture-audio');
    assert.equal(initial.state.listeners, 3);
    assert.equal(initial.state.timers, 2);
    assert.ok(initial.state.activeObservers >= 1);
    const security = initial.report.paginaActual.seguridad;
    assert.equal(security.scriptsExternosSinSRI, 0, 'Un script del mismo origen no debe contarse como externo sin SRI');
    assert.equal(security.iframesSinSandbox, 0);
    assert.equal(security.formulariosPasswordHTTP, 0);
    assert.deepEqual(security.referenciasHTTPenHTTPS, []);
    assert.match(security.interpretacion, /no vulnerabilidades confirmadas/);
    assert.deepEqual(initial.report.avisos, [], 'El fixture limpio no debe producir alertas de vulnerabilidad');
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'fixture error https://example.invalid/failure.js?token=PRIVATE_ERROR_TOKEN#PRIVATE_ERROR_FRAGMENT',
        filename: 'https://example.invalid/failure.js?password=PRIVATE_FILENAME_SECRET', lineno: 7
      }));
      Promise.reject(new Error('fixture rejection Bearer PRIVATE_BEARER_TOKEN user@example.invalid token=PRIVATE_REASON_TOKEN'));
      GFDiag.marcar('marca https://example.invalid/menu?token=PRIVATE_MARK_TOKEN#PRIVATE_MARK_FRAGMENT');
      GFDiag.marcar('0xabcdef1234567890abcdef1234567890abcdef1234');
    });
    await page.waitForTimeout(100);
    const during = await page.evaluate(() => {
      const report = GFDiag.informe();
      const forbidden = new Set([game, __fixtureScene, __fixturePCM, __beforeCanvas, document, window]);
      const visit = value => {
        if (forbidden.has(value)) throw new Error('El informe retiene una referencia al juego');
        if (typeof value === 'function') throw new Error('El informe contiene una función');
        if (value && typeof value === 'object') {
          if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Objeto no serializable/plano');
          Object.values(value).forEach(visit);
        }
      };
      visit(report);
      return { report, json: GFDiag.json(), state: __diagState() };
    });
    assert.equal(during.report.marcas.length, 2);
    assert.equal(during.report.errores.total, 2);
    assert.ok(during.report.errores.grupos.some(v => v.tipo === 'JavaScript' && v.linea === 7));
    assert.ok(during.report.errores.grupos.some(v => v.tipo === 'promesa'));
    assert.doesNotMatch(during.json, /PRIVATE_|user@example|abcdef1234567890/);
    assert.doesNotMatch(during.json, /\?token=|#PRIVATE/);
    assert.deepEqual(JSON.parse(during.json).herramienta, 'GFDiag');
    assert.equal(during.state.fetch, 0);
    assert.equal(during.state.contexts, 0);
    const sampled = await page.evaluate(() => {
      const tick = [...__diagTracked.timers.values()].find(v => v.kind === 'setInterval' && v.delay === 5000)?.fn;
      if (!tick) throw new Error('No existe el muestreo de 5 s');
      tick();
      // Conserva una devolución pendiente para comprobar que tampoco actúa tras detener.
      window.__savedDiagTick = tick;
      return GFDiag.informe().muestras.length;
    });
    assert.equal(sampled, 2);
    const afterStop = await page.evaluate(() => {
      GFDiag.detener();
      const json = GFDiag.json();
      GFDiag.detener();
      GFDiag.marcar('no entra');
      return { state: __diagState(), report: GFDiag.informe(), stable: json === GFDiag.json(),
        textureKeys: Object.keys(game.textures.list), sameTexture: game.textures.get('fixture-canvas') === __beforeCanvas,
        sameAudio: game.cache.audio.get('fixture-audio') === __fixturePCM };
    });
    assert.equal(afterStop.report.estado, 'detenido');
    assert.equal(afterStop.report.marcas.length, 2);
    assert.ok(afterStop.stable);
    assert.equal(afterStop.state.listeners, 0);
    assert.equal(afterStop.state.timers, 0);
    assert.equal(afterStop.state.activeObservers, 0);
    assert.equal(afterStop.state.fetch, 0);
    assert.equal(afterStop.state.contexts, 0);
    assert.ok(afterStop.sameTexture && afterStop.sameAudio);
    assert.deepEqual(afterStop.textureKeys, await page.evaluate(() => __beforeTextures));
    const stoppedStable = await page.evaluate(() => {
      const before = GFDiag.json();
      __savedDiagTick();
      window.dispatchEvent(new ErrorEvent('error', { message: 'error después de detener' }));
      return { stable: before === GFDiag.json(), samples: GFDiag.informe().muestras.length };
    });
    assert.ok(stoppedStable.stable, 'Detener no debe crear fotos nuevas ni capturar más errores');
    assert.equal(stoppedStable.samples, sampled);
    await page.evaluate(source);
    await page.evaluate(source);
    const reinjected = await page.evaluate(() => ({ state: __diagState(), report: GFDiag.informe() }));
    assert.equal(reinjected.state.listeners, 3);
    assert.equal(reinjected.state.timers, 2);
    assert.equal(reinjected.state.activeObservers, initial.state.activeObservers);
    assert.equal(reinjected.report.errores.total, 0);
    // Ejecuta la devolución del timeout de 180 s sin esperar tres minutos.
    const autoStop = await page.evaluate(() => {
      const callback = [...__diagTracked.timers.values()].find(v => v.kind === 'setTimeout' && v.delay === 180000)?.fn;
      if (!callback) throw new Error('No existe finalización automática de 180 s');
      callback();
      return { state: __diagState(), report: GFDiag.informe() };
    });
    assert.equal(autoStop.report.estado, 'detenido');
    assert.equal(autoStop.state.listeners, 0);
    assert.equal(autoStop.state.timers, 0);
    assert.equal(autoStop.state.activeObservers, 0);
    assert.equal(autoStop.state.contexts, 0);
    assert.equal(autoStop.state.fetch, 0);
    await page.evaluate(() => {
      delete window.GFDiag;
      window.__blockedGetterCalls = 0;
      Object.defineProperty(window, 'GFDiag', { configurable: true, get() { __blockedGetterCalls++; throw new Error('No ejecutar getter de GFDiag'); } });
    });
    await page.evaluate(source);
    const existingGetter = await page.evaluate(() => ({ calls: __blockedGetterCalls, state: __diagState() }));
    assert.equal(existingGetter.calls, 0);
    assert.equal(existingGetter.state.listeners, 0);
    assert.equal(existingGetter.state.timers, 0);
    await page.evaluate(() => {
      delete window.GFDiag;
      window.__blockedStopCalls = 0;
      Object.defineProperty(window, 'GFDiag', { configurable: false, value: { version: '1.0', detener() { __blockedStopCalls++; } } });
    });
    await page.evaluate(source);
    const nonConfigurable = await page.evaluate(() => ({ calls: __blockedStopCalls, state: __diagState() }));
    assert.equal(nonConfigurable.calls, 0);
    assert.equal(nonConfigurable.state.listeners, 0);
    assert.equal(nonConfigurable.state.timers, 0);
    assert.equal(nonConfigurable.state.activeObservers, 0);
    assert.equal(requests.length, requestsBefore);
    assert.deepEqual(outside, []);
    console.log(JSON.stringify({
      ok: true, phaser: initial.report.actual.phaser.version,
      renderer: initial.report.actual.phaser.renderer,
      texturas: initial.report.actual.phaser.texturas,
      audioPCMMiB: initial.report.actual.phaser.audioPCMMiB,
      erroresCapturados: during.report.errores.total,
      reinyeccionesSinDuplicados: 2,
      estadoFinal: autoStop.state,
      peticionesDiagnostico: requests.length - requestsBefore,
      comprobaciones: ['API', 'Phaser real y texturas', 'AudioBuffer', 'JSON sin referencias', 'errores y rechazo', 'redacción de URLs y secretos', 'seguridad sin falsos positivos', 'sin fetch ni nuevos contextos', 'muestreo', 'detención manual y automática', 'informe estable después de detener', 'limpieza de listeners/observadores/timers', 'reinyección', 'GFDiag previo con getter o no configurable', 'integridad de texturas y audio']
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
