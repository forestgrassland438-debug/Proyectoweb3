'use strict';
/* PAGAR EL REVIVIR PONE LAS MONEDAS AL DÍA (2026-11-25).
 * "Cuando me muero y pago la resucitación me cobra pero mis monedas no se
 * actualizan." /api/player/revive baja la plata en el servidor y devuelve los
 * `stats` nuevos; gf-muerte.js los copiaba a la escena pero nadie repintaba el
 * HUD (#info-text-right seguía con lo de antes) y, además, reenviaba la plata al
 * servidor por /api/stats/<nombre>/update, cuando el saldo ya lo había puesto él.
 *
 * Se cargan gf-muerte.js, gf-bronce.js (quien pinta las monedas del HUD) y la
 * clase StatsSync de Scenes/LoadingScenegame.js DE VERDAD, en un vm, con un DOM
 * mínimo; lo de fuera (GFMascota.revivirJugador, la red) es de mentira.
 *
 *   node --test tools/revivir-monedas.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const BIN = path.resolve(__dirname, '..');

/** La clase StatsSync tal cual está en LoadingScenegame.js (de `class StatsSync {` a su llave final). */
function claseStatsSync() {
  const s = fs.readFileSync(path.join(BIN, 'Scenes', 'LoadingScenegame.js'), 'utf8');
  const i = s.indexOf('class StatsSync {');
  assert.ok(i >= 0 && s.indexOf('class StatsSync {', i + 1) < 0, 'no encuentro class StatsSync');
  let d = 0, j = -1;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d === 0) { j = k; break; }
  }
  assert.ok(j > i, 'class StatsSync sin cerrar');
  return s.slice(i, j + 1);
}

/** Un DOM de juguete: ids, clases, oyentes de clic e innerHTML con hijos por id. */
function crearDom() {
  const porId = new Map();
  function registrar(el) { el.conectado = true; if (el.id) porId.set(el.id, el); el.hijos.forEach(registrar); }
  function buscar(el, id) { for (const h of el.hijos) { if (h.id === id) return h; const x = buscar(h, id); if (x) return x; } return null; }
  function elemento(tag) {
    const el = {
      tagName: String(tag).toUpperCase(), id: '', textContent: '', title: '', style: {}, disabled: false, hijos: [], oyentes: {},
      classList: { s: new Set(), add(...c) { c.forEach((x) => this.s.add(x)); }, remove(...c) { c.forEach((x) => this.s.delete(x)); },
        toggle(c, on) { if (on === undefined ? !this.s.has(c) : on) this.s.add(c); else this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      addEventListener(t, fn) { (this.oyentes[t] = this.oyentes[t] || []).push(fn); },
      removeEventListener(t, fn) { this.oyentes[t] = (this.oyentes[t] || []).filter((f) => f !== fn); },
      click() { (this.oyentes.click || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {} })); },
      appendChild(c) { this.hijos.push(c); if (this.conectado) registrar(c); return c; },
      querySelector(sel) { const m = /^#([\w-]+)$/.exec(sel); return m ? buscar(this, m[1]) : null; },
      set innerHTML(html) {
        this.html = html; this.hijos = [];
        for (const m of String(html).matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) { const h = elemento(m[1]); h.id = m[2]; this.hijos.push(h); }
      },
      get innerHTML() { return this.html || ''; }
    };
    return el;
  }
  const body = elemento('body'), head = elemento('head');
  body.conectado = head.conectado = true;
  const document = {
    body, head, visibilityState: 'visible',
    getElementById: (id) => porId.get(id) || null,
    querySelector: () => null,
    createElement: elemento,
    addEventListener() {}, removeEventListener() {}
  };
  for (const [id, txt] of [['info-text-left', '5'], ['info-text-right', '100'], ['info-text-bronce', '2.5K']]) {
    const el = elemento('span'); el.id = id; el.textContent = txt; body.appendChild(el);
  }
  return document;
}

function montarJuego() {
  const document = crearDom();
  const peticiones = [];
  const timers = { setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; }, clearTimeout,
    setInterval: (f, ms) => { const t = setInterval(f, ms); t.unref(); return t; }, clearInterval };
  const estado = { ghost: true, reviveCost: 30, deaths: 1 };
  const oyentesMascota = new Set();
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, Promise, Number, Object, Array, String, URL, Set, Map,
    document, location: { href: 'http://localhost:8123/index.html', hostname: 'localhost' },
    addEventListener() {}, removeEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} },
    serverBase: 'http://127.0.0.1:8080', currentPlayer: 'Ana', getCsrfToken: () => 'tok',
    playerStats: { vida: 0, agua: 80, comida: 70, oro: 5, plata: 100, bronce: 2500, exp: 0 },
    fetch: (url, init) => {
      peticiones.push({ url: String(url), metodo: (init && init.method) || 'GET', cuerpo: init && init.body ? JSON.parse(init.body) : null });
      return Promise.resolve({ ok: true, status: 200, clone() { return this; }, json: async () => ({ success: true }) });
    },
    GFMascota: {
      estado: () => estado,
      alCambiar(fn) { oyentesMascota.add(fn); return () => oyentesMascota.delete(fn); },
      sincronizar: () => Promise.resolve(estado),
      // Lo que devuelve gf-mascota.js tras un /api/player/revive que cobra 30 de plata.
      revivirJugador() {
        estado.ghost = false;
        ctx.playerStats.vida = 100;
        oyentesMascota.forEach((fn) => fn());
        return Promise.resolve({ ok: true, pagado: 30,
          stats: { vida: 100, agua: 80, comida: 70, oro: 5, plata: 70, bronce: 2500, exp: 0 } });
      }
    }
  }, timers);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(claseStatsSync() + '\nwindow.StatsSync = StatsSync;', ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-bronce.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'gf-muerte.js'), 'utf8'), ctx);
  const scene = { add: {}, events: new EventEmitter(), scene: { key: 'GameScene' }, playerName: 'Ana', serverBase: 'http://127.0.0.1:8080',
    moneda: 5, moneda_plata: 100, moneda_bronce: 2500, vidaPorcentaje: 0,
    _adoptarVitalesDelServidor(st) { if (typeof st.vida === 'number') this.vidaPorcentaje = st.vida; },
    actualizarBarras() {},
    cameras: { main: { postFX: { addColorMatrix: () => ({ grayscale() {} }), remove() {} } } } };
  scene.statsSync = new ctx.StatsSync(scene);
  ctx.game = { scene: { getScenes: () => [scene] } };
  return { ctx, document, scene, peticiones };
}

const esperar = () => new Promise((r) => setImmediate(r));

test('pagar el revivir pinta en el HUD la plata que dejó el servidor', async () => {
  const { ctx, document, scene } = montarJuego();
  ctx.GFMuerte.montar(scene);
  await esperar(); await esperar();
  const boton = document.getElementById('gf-death-btn');
  assert.ok(boton, 'no salió el botón de revivir');
  assert.equal(document.getElementById('info-text-right').textContent, '100');
  boton.click();
  for (let k = 0; k < 6; k++) await esperar();
  assert.equal(document.getElementById('info-text-right').textContent, '70', 'el HUD sigue con la plata de antes de pagar');
  assert.equal(scene.moneda_plata, 70);
  assert.equal(ctx.playerStats.plata, 70);
  ctx.GFMuerte.desmontar(scene); ctx.GFBronce.destruir();
});

test('lo que cobró el servidor no se le reenvía como si lo hubiera cambiado el cliente', async () => {
  const { ctx, document, scene, peticiones } = montarJuego();
  ctx.GFMuerte.montar(scene);
  await esperar(); await esperar();
  peticiones.length = 0;
  document.getElementById('gf-death-btn').click();
  for (let k = 0; k < 6; k++) await esperar();
  await new Promise((r) => setTimeout(r, 1700));          // lo que tardaría un envío con espera
  const reenvio = peticiones.find((p) => /\/api\/stats\/[^/]+\/update$/.test(p.url) && p.cuerpo && p.cuerpo.stats &&
    ['oro', 'plata', 'bronce'].some((k) => k in p.cuerpo.stats));
  assert.equal(reenvio, undefined, 'se reenvió el saldo al servidor: ' + JSON.stringify(reenvio));
  ctx.GFMuerte.desmontar(scene); ctx.GFBronce.destruir();
});
