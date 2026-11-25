'use strict';
/* El recorte de lo lejano fuera del pueblo (gf-recorte.js, 2026-11-24).

   El fallo, medido en la selva con la barra "chunks" en 3 y la cámara alejada:
   dos recortes peleaban por `visible` (106 árboles encendidos más allá del
   radio con la cámara quieta, 36 parpadeando al andar) y la barra apagaba el
   árbol sin su sombra (~100 sombras sueltas). Aquí:
     · el módulo solo, con cuentas a mano y contra la fuerza bruta;
     · gf-graphics-settings.js de verdad: no toca lo que es de otro;
     · ZonaScene y SalvajeScene de verdad (sus métodos) montando sus árboles;
     · el cableado de lo que se apaga solo (monstruos) y de los fuegos.
   Se corre con: node --test tools/recorte.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8');

// ─── Piezas falsas: eventos, cámara, imágenes ────────────────────────────────
function emisor() {
  const ev = {};
  return {
    _ev: ev,
    on(n, f) { (ev[n] = ev[n] || []).push({ f, una: false }); return this; },
    once(n, f) { (ev[n] = ev[n] || []).push({ f, una: true }); return this; },
    off(n, f) { if (ev[n]) ev[n] = ev[n].filter((o) => o.f !== f); return this; },
    emit(n, ...a) { (ev[n] || []).slice().forEach((o) => { if (o.una) this.off(n, o.f); o.f(...a); }); },
    cuantos(n) { return (ev[n] || []).length; },
  };
}

const TAM = { arbol: [128, 160], sombra: [96, 32], obj: [64, 64], cartel: [40, 48] };

/** Una imagen con lo que usan las escenas y el recorte. `getBounds` como el
    de Phaser: origen y escala (sin giro). */
function imagen(escena, x, y, clave, frame) {
  const [w, h] = TAM[String(clave).replace(/^.*_(arbol|sombra|obj).*$/, '$1')] || TAM[clave] || [64, 64];
  const datos = {};
  const o = {
    x, y, scene: escena, visible: true, originX: 0.5, originY: 0.5, scaleX: 1, scaleY: 1, depth: 0, alpha: 1,
    texture: { key: clave }, frame: { name: frame || '' }, cambios: 0, active: true, _una: {},
    setOrigin(ox, oy) { this.originX = ox; this.originY = oy === undefined ? ox : oy; return this; },
    setOriginFromFrame() { this.originX = 0.5; this.originY = 0.9; return this; },
    setScale(sx, sy) { this.scaleX = sx; this.scaleY = sy === undefined ? sx : sy; return this; },
    setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; },
    setVisible(v) { if (this.visible !== v) this.cambios++; this.visible = v; return this; },
    setData(k, v) { datos[k] = v; return this; },
    getData(k) { return datos[k]; },
    getBounds() {
      const ww = w * Math.abs(this.scaleX), hh = h * Math.abs(this.scaleY);
      return { x: this.x - this.originX * ww, y: this.y - this.originY * hh, width: ww, height: hh };
    },
    once(n, f) { (this._una[n] = this._una[n] || []).push(f); return this; },
    destroy() { const l = this._una.destroy || []; this._una.destroy = []; l.forEach((f) => f()); this.scene = undefined; this.active = false; },
  };
  if (escena && escena.children) escena.children.list.push(o);
  return o;
}

function escenaFalsa(vista) {
  const s = {
    events: emisor(),
    children: { list: [] },
    cameras: { main: { worldView: Object.assign({ x: 0, y: 0, width: 800, height: 600 }, vista || {}) } },
    t: 0,
  };
  s.add = { image: (x, y, clave, frame) => imagen(s, x, y, clave, frame) };
  s.tic = (ms) => { s.t += (ms === undefined ? 120 : ms); s.events.emit('update', s.t, ms === undefined ? 120 : ms); };
  s.mirar = (x, y, w, h) => { const v = s.cameras.main.worldView; v.x = x; v.y = y; if (w) v.width = w; if (h) v.height = h; };
  return s;
}

/** Contexto con gf-recorte.js cargado y una barra falsa (o la de verdad). */
function cargarRecorte(op) {
  op = op || {};
  const ajustes = { chunks: op.chunks === undefined ? 12 : op.chunks };
  const ctx = { console, Math, Number, Map, Set, Array, Object, JSON, Promise, Date, String, RegExp, Infinity };
  ctx.window = ctx;
  if (!op.sinBarra) ctx.GFGraphics = { get: () => ({ calidad: 'alta', chunks: ajustes.chunks }), CHUNK_PX: 320, CHUNK_MIN: 2, CHUNK_MAX: 16 };
  vm.createContext(ctx);
  // (Sin el módulo se prueba NO cargándolo: borrarlo del contexto desde fuera no
  // lo quita de dentro, el global de vm guarda su copia.)
  if (!op.sinModulo) vm.runInContext(leer('gf-recorte.js'), ctx, { filename: 'gf-recorte.js' });
  return { ctx, R: ctx.GFRecorte, ajustes };
}

// Lo que se espera, dicho de otra forma (por la vista y el radio, sin rejilla).
function deberiaVerse(c, v, R, seVe) {
  const m = seVe ? 320 : 128;
  let ve = c.x1 > v.x - m && c.x0 < v.x + v.width + m && c.y1 > v.y - m && c.y0 < v.y + v.height + m;
  if (ve && R !== Infinity) {
    const cx = v.x + v.width / 2, cy = v.y + v.height / 2, r = seVe ? R * 1.12 : R;
    ve = (c.ax - cx) ** 2 + (c.ay - cy) ** 2 <= r * r;
  }
  return ve;
}

// Generador con semilla (resultados repetibles).
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ─── El módulo solo ──────────────────────────────────────────────────────────
test('lo que no toca la vista se apaga, y su sombra con él; al volver la cámara se enciende todo junto', () => {
  const { R } = cargarRecorte();
  const s = escenaFalsa({ x: 0, y: 0, width: 800, height: 600 });
  // Árbol de 128x160 con origen abajo al centro: ocupa [x-64, x+64] x [y-160, y].
  const cerca = s.add.image(400, 400, 'zn_arbol').setOrigin(0.5, 1);
  const sombraCerca = s.add.image(406, 396, 'zn_sombra');
  const lejos = s.add.image(2000, 400, 'zn_arbol').setOrigin(0.5, 1);   // de 1936 a 2064: lejos de 800 + 320
  const sombraLejos = s.add.image(2006, 396, 'zn_sombra');
  R.anadir(s, cerca, [sombraCerca]);
  R.anadir(s, lejos, [sombraLejos]);
  s.tic();
  assert.equal(cerca.visible, true);
  assert.equal(sombraCerca.visible, true);
  assert.equal(lejos.visible, false, 'el árbol de x=2000 no toca 0..800 (+320)');
  assert.equal(sombraLejos.visible, false, 'y su sombra se apaga con él');
  // La cámara se va a x=1600: el de 2000 entra (con su sombra) y el de 400 sale.
  s.mirar(1600, 0); s.tic();
  assert.equal(lejos.visible, true);
  assert.equal(sombraLejos.visible, true);
  assert.equal(cerca.visible, false, 'el de x=400 (hasta 464+8) queda a más de 320 de 1600');
  assert.equal(sombraCerca.visible, false);
  assert.deepEqual(R.estado(s).cosas, 2);
});

test('los márgenes con histéresis: se enciende al entrar en vista + 128 y se apaga al pasar de + 320', () => {
  const { R } = cargarRecorte();
  const s = escenaFalsa({ x: 0, y: 0, width: 800, height: 600 });
  // Un objeto de 64 de ancho centrado en x: su rectángulo (con 8 de holgura) va de x-40 a x+40.
  const a = s.add.image(1180, 300, 'obj');            // x0 = 1140: más allá de 800+320 → se apaga
  R.anadir(s, a, []);
  s.tic();
  assert.equal(a.visible, false);
  s.mirar(200, 0); s.tic();                            // vista hasta 1000: 1140 < 1000+128? no (1128)
  assert.equal(a.visible, false, 'a 1140 no entra con la vista hasta 1000 (+128 = 1128)');
  s.mirar(220, 0); s.tic();                            // hasta 1020: 1140 < 1148 → entra
  assert.equal(a.visible, true, 'entra a 128 px del borde');
  s.mirar(0, 0); s.tic();                              // hasta 800: apagar en 1120; 1140 > 1120 → sale
  assert.equal(a.visible, false, 'sale al pasar de 320');
  s.mirar(220, 0); s.tic();
  assert.equal(a.visible, true);
  s.mirar(30, 0); s.tic();                             // hasta 830: 1140 < 830+320=1150 → sigue
  assert.equal(a.visible, true, 'entre 128 y 320 lo encendido sigue encendido (no parpadea)');
});

test('el radio de la barra: se enciende dentro de R, se apaga más allá de R·1,12 y al máximo no hay tope', () => {
  const { R, ajustes } = cargarRecorte({ chunks: 3 });  // R = 960, apagar a 1075,2
  const s = escenaFalsa({ x: 0, y: 0, width: 6000, height: 4000 });   // muy alejada: todo en vista
  const centro = { x: 3000, y: 2000 };
  const mk = (d) => { const o = s.add.image(centro.x + d, centro.y, 'obj'); R.anadir(s, o, []); return o; };
  const d900 = mk(900), d1050 = mk(1050), d1100 = mk(1100), d2500 = mk(-2500);
  s.tic();
  assert.equal(d900.visible, true);
  assert.equal(d1050.visible, true, 'nace encendido y 1050 < 1075,2: sigue');
  assert.equal(d1100.visible, false);
  assert.equal(d2500.visible, false);
  // La cámara se acerca 100 px al de 1100: queda a 1000 > 960, aún no entra.
  s.mirar(100, 0); s.tic();
  assert.equal(d1100.visible, false, 'a 1000 no entra (se entra a 960)');
  s.mirar(150, 0); s.tic();                              // a 950
  assert.equal(d1100.visible, true, 'a 950 entra');
  // Con la barra al máximo (16) no hay tope: se enciende hasta el de 2500.
  ajustes.chunks = 16; s.tic();
  assert.equal(d2500.visible, true, 'chunks 16 = sin tope, como mostrarTodo de gf-graphics');
  assert.equal(R.radio(), Infinity);
  // Y bajarla a 2 (R = 640) con la cámara quieta apaga en el próximo repaso.
  ajustes.chunks = 2; s.tic();
  assert.equal(R.radio(), 640);
  assert.equal(d900.visible, false, 'el de 900 - 150 = 750 > 640·1,12 = 716,8');
});

test('no resucita: lo que el juego tenía apagado sigue apagado al volver la cámara', () => {
  const { R } = cargarRecorte();
  const s = escenaFalsa();
  const arbol = s.add.image(400, 300, 'zn_arbol').setOrigin(0.5, 1);
  const sombra = s.add.image(400, 300, 'zn_sombra');
  R.anadir(s, arbol, [sombra]);
  s.tic();
  sombra.setVisible(false);                // el juego apaga la sombra (de noche, nieve...)
  s.mirar(5000, 0); s.tic();
  assert.equal(arbol.visible, false);
  s.mirar(0, 0); s.tic();
  assert.equal(arbol.visible, true);
  assert.equal(sombra.visible, false, 'la sombra la apagó el juego: no se toca');
  assert.ok(!sombra.__gfRecOculto);
});

test('solo repasa si la cámara se movió 16 px, cambió el zoom o la barra (y como mucho cada 100 ms)', () => {
  const { R, ajustes } = cargarRecorte({ chunks: 6 });
  const s = escenaFalsa();
  R.anadir(s, s.add.image(400, 300, 'obj'), []);
  s.tic();
  const v0 = R.estado(s).vuelta;
  s.mirar(10, 10); s.tic();
  assert.equal(R.estado(s).vuelta, v0, '10 px: nada');
  s.mirar(20, 0); s.tic(40);
  assert.equal(R.estado(s).vuelta, v0, '20 px pero a los 40 ms del anterior: aún no');
  s.tic(70);
  assert.equal(R.estado(s).vuelta, v0 + 1, 'pasados 100 ms: sí');
  s.mirar(20, 0, 900, 700); s.tic();
  assert.equal(R.estado(s).vuelta, v0 + 2, 'otro tamaño de vista (zoom): sí');
  ajustes.chunks = 7; s.tic();
  assert.equal(R.estado(s).vuelta, v0 + 3, 'otra barra con la cámara quieta: sí');
  s.tic(); s.tic();
  assert.equal(R.estado(s).vuelta, v0 + 3, 'nada nuevo: nada');
});

test('la rejilla da lo mismo que mirarlo todo: 400 cosas, 300 pasos con saltos, zoom y barra cambiando', () => {
  const { R, ajustes } = cargarRecorte({ chunks: 4 });
  const s = escenaFalsa();
  const rnd = azar(20261124);
  const cosas = [];
  for (let i = 0; i < 400; i++) {
    const x = rnd() * 9000 - 500, y = rnd() * 9000 - 500;
    const grande = rnd() < 0.08;                       // algunas que cruzan varias celdas
    const o = s.add.image(x, y, 'obj').setScale(grande ? 6 + rnd() * 20 : 0.5 + rnd() * 2).setOrigin(0.5, rnd() < 0.5 ? 1 : 0.5);
    const sombra = rnd() < 0.7 ? s.add.image(x, y, 'zn_sombra') : null;
    const c = R.anadir(s, o, sombra ? [sombra] : []);
    cosas.push({ c, o, sombra, visto: true });
  }
  let errores = 0, apagadas = 0, encendidas = 0;
  let x = 3000, y = 3000, w = 800, h = 600;
  for (let paso = 0; paso < 300; paso++) {
    const r = rnd();
    if (r < 0.08) { x = rnd() * 9000 - 500; y = rnd() * 9000 - 500; }          // teletransporte
    else if (r < 0.15) { const z = [0.22, 0.5, 1, 2][Math.floor(rnd() * 4)]; w = 1600 / z; h = 900 / z; }
    else if (r < 0.2) ajustes.chunks = 2 + Math.floor(rnd() * 15);
    else { x += (rnd() - 0.5) * 900; y += (rnd() - 0.5) * 900; }
    s.mirar(x, y, w, h);
    R.repasar(s);
    const v = s.cameras.main.worldView, Rr = R.radio();
    for (const k of cosas) {
      const espera = deberiaVerse(k.c, v, Rr, k.visto);
      k.visto = espera;
      if (k.o.visible !== espera) errores++;
      if (k.sombra && k.sombra.visible !== k.o.visible) errores++;
      if (espera) encendidas++; else apagadas++;
    }
  }
  assert.equal(errores, 0);
  assert.ok(encendidas > 2000 && apagadas > 2000, `se probó de las dos (${encendidas} / ${apagadas})`);
});

test('quitar o destruir una cosa devuelve lo que apagamos; al apagarse la escena se suelta todo', () => {
  const { R } = cargarRecorte();
  const s = escenaFalsa();
  const a = s.add.image(5000, 300, 'zn_arbol').setOrigin(0.5, 1), sa = s.add.image(5000, 300, 'zn_sombra');
  const b = s.add.image(5200, 300, 'zn_arbol').setOrigin(0.5, 1), sb = s.add.image(5200, 300, 'zn_sombra');
  const ca = R.anadir(s, a, [sa]);
  R.anadir(s, b, [sb]);
  s.tic();
  assert.equal(sa.visible, false);
  R.quitar(ca);
  assert.equal(a.visible, true, 'quitada: vuelve como estaba');
  assert.equal(sa.visible, true);
  b.destroy();
  assert.equal(sb.visible, true, 'destruido el árbol: la sombra vuelve a ser cosa del juego');
  assert.equal(R.estado(s).cosas, 0);
  assert.equal(s.events.cuantos('update'), 1);
  s.events.emit('shutdown');
  assert.equal(s.events.cuantos('update'), 0, 'sin oyente de update al apagar la escena');
  assert.equal(R.activo(s), false);
  assert.equal(s.__gfRecorte, null);
  // La escena se reutiliza (Phaser reusa la instancia): se vuelve a montar.
  R.anadir(s, s.add.image(400, 300, 'obj'), []);
  assert.equal(R.activo(s), true);
  assert.equal(s.events.cuantos('update'), 1);
});

test('cerca(): la distancia con histéresis para lo que se mueve; sin barra no hay tope', () => {
  const { R, ajustes } = cargarRecorte({ chunks: 3 });
  assert.equal(R.cerca(900, false), true);
  assert.equal(R.cerca(1000, false), false);
  assert.equal(R.cerca(1000, true), true, 'lo que se ve aguanta hasta 1075,2');
  assert.equal(R.cerca(1100, true), false);
  ajustes.chunks = 16;
  assert.equal(R.cerca(1e6, false), true);
  const sin = cargarRecorte({ sinBarra: true });
  assert.equal(sin.R.radio(), Infinity);
  assert.equal(sin.R.cerca(1e6, false), true);
  const o = {}; R.propio(o);
  assert.equal(o.__gfRecortePropio, true);
});

// ─── gf-graphics-settings.js de verdad ───────────────────────────────────────
function cargarBarraYRecorte() {
  const timers = [];
  const doc = { readyState: 'complete', hidden: false, cookie: '', getElementById: () => null, addEventListener() {},
                createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }) };
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, Number, Map, Set, Array, Object, JSON, Promise, Date, String, RegExp, Infinity,
                document: doc, setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
                fetch: () => Promise.reject(new Error('sin red')), AbortController: function () { this.signal = {}; this.abort = () => {}; } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('gf-graphics-settings.js'), ctx, { filename: 'gf-graphics-settings.js' });
  vm.runInContext(leer('gf-recorte.js'), ctx, { filename: 'gf-recorte.js' });
  return ctx;
}

test('la barra (gf-graphics) no toca lo que lleva __gfRecortePropio y sigue recortando lo demás (el pueblo)', () => {
  const ctx = cargarBarraYRecorte();
  const s = escenaFalsa({ x: 0, y: 0, width: 6000, height: 4000 });
  ctx.game = { scene: { getScenes: () => [s] } };
  const G = ctx.GFGraphics, R = ctx.GFRecorte;
  const optimizado = (x, y) => { const o = s.add.image(x, y, 'obj'); o.setData('optimized', true); G.registrar(s, o); return o; };
  const delPueblo = optimizado(5800, 2000);              // a 2800 del centro (3000, 2000)
  const delRecorte = optimizado(5700, 2000);             // a 2700: lo lleva gf-recorte
  R.anadir(s, delRecorte, []);
  const monstruo = optimizado(5600, 2000);               // a 2600: se apaga solo
  R.propio(monstruo);
  G.setChunks(3);                                         // R = 960
  assert.equal(delPueblo.visible, false, 'lo que no es de nadie lo sigue apagando la barra');
  assert.equal(monstruo.visible, true, 'al monstruo no lo toca: decide él (seDibuja)');
  assert.equal(monstruo.__gfCulled, undefined);
  s.tic();
  assert.equal(delRecorte.visible, false, 'lo apaga gf-recorte (más allá de 1075,2)');
  assert.ok(delRecorte.__gfRecOculto && !delRecorte.__gfCulled, 'y lo marca él, no la barra');
  // Subir la barra al máximo: la barra no lo enciende (no es suyo); gf-recorte sí.
  G.setChunks(16);
  assert.equal(delRecorte.visible, false, 'la barra no enciende lo que no apagó');
  s.tic();
  assert.equal(delRecorte.visible, true, 'gf-recorte, con la barra al máximo, lo enciende');
  assert.equal(delPueblo.visible, true);
});

test('lo que la barra escondió antes de que lo reclamaran vuelve como estaba', () => {
  const ctx = cargarBarraYRecorte();
  const s = escenaFalsa({ x: 0, y: 0, width: 6000, height: 4000 });
  ctx.game = { scene: { getScenes: () => [s] } };
  const G = ctx.GFGraphics, R = ctx.GFRecorte;
  const o = s.add.image(5800, 2000, 'obj'); o.setData('optimized', true); G.registrar(s, o);
  G.setChunks(3);
  assert.equal(o.visible, false);
  assert.equal(o.__gfCulled, true);
  R.propio(o);                                            // un monstruo que se reclama tarde
  s.mirar(100, 0); G.aplicar();
  assert.equal(o.__gfCulled, false);
  assert.equal(o.visible, true, 'devuelto: ahora lo decide él');
});

// ─── Las escenas de verdad ───────────────────────────────────────────────────
function cargarEscenas(op) {
  op = op || {};
  const ctx = cargarRecorte({ chunks: op.chunks === undefined ? 3 : op.chunks, sinBarra: op.sinBarra, sinModulo: op.sinRecorte });
  const c = ctx.ctx;
  c.GameScene = class { constructor() {} };
  c.Phaser = { Textures: { FilterMode: { NEAREST: 0 } }, Geom: { Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } } } };
  vm.runInContext(leer('Scenes/ZonasScenes.js'), c, { filename: 'ZonasScenes.js' });
  vm.runInContext(leer('Scenes/SalvajeScene.js'), c, { filename: 'SalvajeScene.js' });
  return Object.assign(ctx, { c });
}

/** Una escena de mapa falsa con un bosque en rejilla y unos objetos sueltos. */
function bosque(escena, capaArboles, capaObjetos) {
  const s = escenaFalsa({ x: 2600, y: 2600, width: 1600 / 0.22, height: 900 / 0.22 });   // cámara alejada (0,22)
  s.textures = { exists: () => true, get: () => ({ setFilter() {}, has: () => true }) };
  s.map = { getObjectLayer: (n) => (n === 'arboles' ? { objects: capaArboles } : n === 'objetos' ? { objects: capaObjetos } : null) };
  // Como las zonas de verdad: la configuración es estática de la subclase (get cfg).
  const cfg = { prefijo: 'zn_', objetos: 'zn_obj_atlas', zona: 'selva', despejar: [] };
  const Clase = class extends escena { static get CFG() { return cfg; } };
  return Object.assign(Object.create(Clase.prototype), s);
}

function rejilla(paso, desde, hasta, f) {
  const out = [];
  for (let x = desde; x <= hasta; x += paso) for (let y = desde; y <= hasta; y += paso) out.push(f(x, y));
  return out;
}

function lejosVisibles(lista, s, R) {
  const v = s.cameras.main.worldView, cx = v.x + v.width / 2, cy = v.y + v.height / 2;
  let lejos = 0, sueltas = 0;
  lista.forEach((a) => {
    if (a.spr.visible && Math.hypot(a.x - cx, a.y - cy) > R * 1.12) lejos++;
    if (a.sombra && a.sombra.visible !== a.spr.visible) sueltas++;
  });
  return { lejos, sueltas };
}

test('zonas: árboles, objetos y extras entran al recorte con su sombra, y _recortarVisibles ya no pelea', () => {
  const { c, ajustes } = cargarEscenas({ chunks: 3 });
  const s = bosque(c.ZonaScene, rejilla(220, 100, 6000, (x, y) => ({ name: 'arbol', x, y })),
                                rejilla(700, 300, 6000, (x, y) => ({ name: 'barril', x, y, properties: [{ name: 'sombra', value: 40 }] })));
  s._montarArboles();
  s._montarObjetos();
  assert.ok(s._arboles.length > 600 && s._objetosZona.length > 60);
  assert.equal(c.GFRecorte.estado(s).cosas, s._arboles.length + s._objetosZona.length);
  for (let i = 0; i < 6; i++) { s.tic(); s._recortarVisibles(s.t); }    // los dos, como en update()
  const todos = s._arboles.concat(s._objetosZona);
  const r1 = lejosVisibles(todos, s, 960);
  assert.equal(r1.lejos, 0, 'nada encendido más allá del radio con la cámara quieta');
  assert.equal(r1.sueltas, 0, 'ninguna sombra sin su árbol');
  const cerca = todos.filter((a) => a.spr.visible).length;
  assert.ok(cerca > 20, `y lo de cerca sí se ve (${cerca})`);
  // Andar: ni parpadeos ni sombras sueltas en ningún repaso.
  const cambiosAntes = todos.reduce((n, a) => n + a.spr.cambios, 0);
  let parpadeos = 0;
  for (let p = 0; p < 40; p++) {
    const v = s.cameras.main.worldView; s.mirar(v.x + 30, v.y + 12);
    const antes = todos.map((a) => a.spr.visible);
    s.tic(); s._recortarVisibles(s.t);
    const r = lejosVisibles(todos, s, 960);
    assert.equal(r.sueltas, 0);
    assert.equal(r.lejos, 0);
    todos.forEach((a, i) => { if (a.spr.cambios > 0 && antes[i] !== a.spr.visible && a.__vio !== undefined && a.__vio !== antes[i]) parpadeos++; a.__vio = antes[i]; });
  }
  const cambios = todos.reduce((n, a) => n + a.spr.cambios, 0) - cambiosAntes;
  assert.ok(cambios < 400, `andando 1200 px solo cambia lo que cruza el borde (${cambios})`);
  assert.equal(parpadeos, 0);
  // Barra al máximo (de vuelta al centro del bosque): todo lo que cae en la vista se enciende.
  s.mirar(2600, 2600); ajustes.chunks = 16; s.tic();
  const v = s.cameras.main.worldView;
  const enVista = s._arboles.filter((a) => a.x > v.x + 200 && a.x < v.x + v.width - 200 && a.y > v.y + 200 && a.y < v.y + v.height - 200);
  assert.ok(enVista.length > 150, `árboles bien dentro de la vista: ${enVista.length}`);
  assert.equal(enVista.filter((a) => !a.spr.visible || !a.sombra.visible).length, 0, 'todos encendidos, con su sombra');
});

test('zonas sin gf-recorte (no cargó): el recorte de siempre sigue funcionando', () => {
  const { c } = cargarEscenas({ sinRecorte: true });
  assert.equal(c.GFRecorte, undefined);
  const s = bosque(c.ZonaScene, rejilla(300, 100, 6000, (x, y) => ({ name: 'arbol', x, y })), []);
  s._montarArboles();
  s._montarObjetos();
  s.mirar(0, 0, 800, 600);
  // El de siempre lee right/bottom del Rectangle de Phaser.
  Object.assign(s.cameras.main.worldView, { right: 800, bottom: 600 });
  s._recortarVisibles(1000);
  const lejos = s._arboles.filter((a) => a.x > 2000 && a.spr.visible).length;
  const cerca = s._arboles.filter((a) => a.x < 700 && a.y < 600 && a.spr.visible).length;
  assert.equal(lejos, 0);
  assert.ok(cerca > 0);
});

test('salvaje: sus árboles entran al recorte con su sombra y _recortarArboles ya no pelea', () => {
  const { c } = cargarEscenas({ chunks: 3 });
  const s = bosque(c.SalvajeScene, rejilla(220, 100, 6000, (x, y) => ({ name: 'pino', x, y, width: 166 })), []);
  s._montarArboles();
  assert.equal(c.GFRecorte.estado(s).cosas, s._arboles.length);
  for (let i = 0; i < 6; i++) { s.tic(); s._recortarArboles(s.t); }
  const r = lejosVisibles(s._arboles, s, 960);
  assert.equal(r.lejos, 0);
  assert.equal(r.sueltas, 0);
  assert.ok(s._arboles.some((a) => a.spr.visible));
});

// ─── Cableado de lo que se apaga solo y de lo que va pegado ─────────────────
test('los monstruos se apagan solos con la barra (seDibuja) y la barra ya no los toca', () => {
  const salvaje = leer('gf-salvaje.js');
  assert.match(salvaje, /function seDibuja\(d, seVe\) \{ var R = window\.GFRecorte; return d < LEJOS && \(!R \|\| R\.cerca\(d, seVe\)\); \}/);
  assert.match(salvaje, /var ver = seDibuja\(miD, m\.spr\.visible\);/, 'el anfitrión');
  assert.match(salvaje, /var cerca = seDibuja\(Math\.hypot\(pj\.x - m\.x, pj\.y - m\.y\), m\.spr\.visible\);/, 'el invitado');
  assert.doesNotMatch(salvaje, /var ver = miD < LEJOS;|var cerca = Math\.hypot\(pj\.x - m\.x, pj\.y - m\.y\) < LEJOS;/);
  assert.match(salvaje, /registrar\?\.\(spr\.scene,spr\);\s*window\.GFRecorte\?\.propio\?\.\(spr\);/, 'crear(): propio tras registrar');
  assert.match(salvaje, /st\.carteles\.push\(img, txt\);[\s\S]{0,140}GFRecorte\.anadir\(scene, img, \[txt\]\)/, 'el cartel con su letrero');
  const zombis = leer('gf-mina-zombis.js');
  assert.equal((zombis.match(/var ver = seDibuja\(/g) || []).length, 2, 'los dos sitios del zombi');
  assert.doesNotMatch(zombis, /var ver = [^;\n]*< LEJOS;/);
  assert.match(zombis, /registrar\?\.\(spr\.scene,spr\);\s*window\.GFRecorte\?\.propio\?\.\(spr\);/);
  assert.match(leer('gf-mina-serpiente.js'), /\[s\.cabeza\]\.concat\(s\.anillos\)\.forEach\(function \(o\) \{ window\.GFRecorte\?\.propio\?\.\(o\); \}\);/);
});

test('el fuego de un brasero apagado no arde en el aire; el viento no mece lo apagado', () => {
  const zonas = leer('gf-zonas.js');
  assert.match(zonas, /lista\.push\(\{ o: o, llama: l, spr: spr \}\);/);
  assert.match(zonas, /chispas: chispas, prox: 0, spr: f\.spr \}\);/);
  assert.match(zonas, /if \(ve && h\.spr && h\.spr\.visible === false\) ve = false;\s*\n\s*h\.brillo\.setVisible\(ve\);/);
  assert.match(leer('gf-viento.js'), /if \(!a\.spr \|\| a\.spr\.active === false\) continue;[\s\S]{0,400}if \(a\.spr\.visible === false\) continue;\s*\n\s*var balanceo =/);
});

test('index.html carga gf-recorte.js antes de las escenas que lo usan', () => {
  const html = leer('index.html');
  const i = html.indexOf('src="./gf-recorte.js?v=');
  assert.ok(i > 0, 'está');
  for (const usa of ['./Scenes/ZonasScenes.js', './Scenes/SalvajeScene.js', './Scenes/ReinosScenes.js', './Scenes/MinaScene.js']) {
    const j = html.indexOf('src="' + usa);
    if (j > 0) assert.ok(i < j, usa + ' va después');
  }
  assert.equal((html.match(/gf-recorte\.js/g) || []).length, 1, 'una sola vez');
});
