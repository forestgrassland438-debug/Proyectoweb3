'use strict';
/* LOS MONSTRUOS COMPARTIDOS Y EL ANFITRIÓN DORMIDO (2026-10-11).
 *
 * "En la mina los zombis y los demás monstruos no hacen daño." Con la pestaña
 * del anfitrión oculta, su juego se para pero su socket sigue vivo: el
 * servidor lo seguía teniendo por anfitrión y los monstruos de los demás se
 * quedaban quietos. Aquí se prueba:
 *   · el bloque REAL de server2.js ("LOS MONSTRUOS COMPARTIDOS") con sockets
 *     de mentira: 'mobs:dormido' pasa el mando a uno despierto;
 *   · el REAL gf-mobs-red.js en una vm: sin foto del anfitrión en
 *     HUERFANO_MS se piensa aquí (sin mandar nada) y con foto se deja.
 * La parte del servidor se salta si no lo encuentra (SERVIDOR=ruta). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const TXT = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';

// ── EL SERVIDOR ──────────────────────────────────────────────────────────
function montarServidor() {
  const i = TXT.indexOf('const MOBS_SALAS = ');
  const j = TXT.indexOf('// EL ESPANTAPÁJAROS', i);
  assert.ok(i > 0 && j > i, 'no encuentro "LOS MONSTRUOS COMPARTIDOS" en ' + SERVIDOR);
  const codigo = TXT.slice(i, TXT.lastIndexOf('\n// ====', j));
  const enviados = [];            // [destino, evento, datos]
  const sockets = new Map();
  let alConectar = null;
  const io = {
    sockets: { sockets },
    to: (dest) => ({ emit: (ev, d) => enviados.push([dest, ev, d]) }),
    on: (ev, f) => { if (ev === 'connection') alConectar = f; }
  };
  const frenos = new Map();
  const ctx = {
    io, console,
    salaBase: (s) => String(s || '').split('#')[0],
    frenado: () => false,
    PVP_DANO: { espada_madera: 1 },
    setInterval: () => ({ unref() {} }),
    Set, Map, Date, Math, Number, String, Array, Object, JSON
  };
  vm.createContext(ctx);
  vm.runInContext(codigo + '\nthis._mobsSalas = _mobsSalas; this._mobsRevisar = _mobsRevisar;', ctx);
  function conectar(id, sala) {
    const h = {};
    const s = {
      id, connected: true, playerData: { room: sala },
      on: (ev, f) => { h[ev] = f; },
      emit: (ev, d) => enviados.push([id, ev, d]),
      to: (dest) => ({ emit: (ev, d) => enviados.push(['a-' + dest + '-menos-' + id, ev, d]) }),
      lanzar: (ev, d) => h[ev] && h[ev](d)
    };
    sockets.set(id, s);
    alConectar(s);
    return s;
  }
  function irse(s) { s.connected = false; sockets.delete(s.id); s.lanzar('disconnect'); }
  return { ctx, enviados, conectar, irse, frenos };
}

test('servidor: el anfitrión que se duerme pasa el mando a uno despierto', { skip: !HAY && 'sin server2.js' }, async () => {
  const S = montarServidor();
  const A = S.conectar('A', 'mina');
  A.lanzar('mobs:hola', {});
  await new Promise(r => setTimeout(r, 5));       // que B llegue después
  const B = S.conectar('B', 'mina');
  B.lanzar('mobs:hola', {});
  const reg = S.ctx._mobsSalas.get('mina');
  assert.equal(reg.host, 'A', 'manda el más antiguo');

  S.enviados.length = 0;
  A.lanzar('mobs:dormido', { si: true });
  assert.equal(reg.host, 'B', 'A se duerme: manda B');
  assert.ok(S.enviados.some(([d, ev, x]) => d === 'mina' && ev === 'mobs:host' && x.host === 'B'), 'se le dice a la sala');

  A.lanzar('mobs:dormido', { si: false });
  assert.equal(reg.host, 'B', 'A despierta: B sigue (no se roba el mando)');

  B.lanzar('mobs:dormido', { si: true });
  assert.equal(reg.host, 'A', 'B se duerme y A está despierto: manda A');

  A.lanzar('mobs:dormido', { si: true });
  assert.equal(reg.host, 'A', 'todos dormidos: se queda el que había');

  // La foto de un dormido que ya no manda no pasa.
  S.enviados.length = 0;
  B.lanzar('mobs:estado', { g: 'zombis', l: [[0, 1, 2]] });
  assert.ok(!S.enviados.some(([, ev]) => ev === 'mobs:estado'), 'solo pasa la foto del anfitrión');
});

test('servidor: el que entra con la pestaña oculta no se queda el mando', { skip: !HAY && 'sin server2.js' }, async () => {
  const S = montarServidor();
  const A = S.conectar('A', 'salvaje');
  A.lanzar('mobs:hola', {});
  await new Promise(r => setTimeout(r, 5));
  const B = S.conectar('B', 'salvaje');
  B.lanzar('mobs:hola', { dormido: true });
  await new Promise(r => setTimeout(r, 5));
  const C = S.conectar('C', 'salvaje');
  C.lanzar('mobs:hola', {});
  const reg = S.ctx._mobsSalas.get('salvaje');
  S.irse(A);
  assert.equal(reg.host, 'C', 'se va A: B (más antiguo) duerme, así que manda C');
  assert.ok(!reg.dormidos.has('A') && !reg.miembros.has('A'), 'A no deja rastro');
  S.irse(C);
  assert.equal(reg.host, 'B', 'solo queda B: manda aunque duerma');
  S.irse(B);
  assert.equal(S.ctx._mobsSalas.has('salvaje'), false, 'sala vacía: fuera');
});

// ── EL CLIENTE ───────────────────────────────────────────────────────────
function montarCliente() {
  let ahora = 1e6;
  const FalsoDate = class extends Date {};
  FalsoDate.now = () => ahora;
  const docOyentes = {};
  const documento = { hidden: false, addEventListener: (ev, f) => { docOyentes[ev] = f; } };
  const ctx = { console, Math, Number, String, Object, Array, JSON, Date: FalsoDate, document: documento };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gf-mobs-red.js'), 'utf8'), ctx);

  const sh = {}, enviados = [];
  const sock = {
    id: 'yo', connected: true,
    on: (ev, f) => { sh[ev] = f; }, off: (ev) => { delete sh[ev]; },
    emit: (ev, d) => enviados.push([ev, d]),
    lanzar: (ev, d) => sh[ev] && sh[ev](d)
  };
  ctx.globalSocket = sock;
  const ev = {};
  const scene = {
    sys: { settings: { key: 'MinaScene' } },
    events: {
      on: (n, f) => { (ev[n] = ev[n] || []).push(f); },
      once: (n, f) => { (ev[n] = ev[n] || []).push(f); },
      off: (n, f) => { ev[n] = (ev[n] || []).filter(x => x !== f); },
      emit: (n, ...a) => (ev[n] || []).slice().forEach(f => f(...a))
    },
    player: { active: true, x: 0, y: 0 },
    otherPlayers: { otro: { sprite: { active: true, visible: true, alpha: 1, x: 50, y: 50 } } }
  };
  const importados = [];
  const red = ctx.GFMobsRed.crear(scene, 'zombis', {
    exportar: () => [[0, 1, 2]],
    importar: (l) => importados.push(l)
  });
  return { ctx, red, sock, enviados, importados, scene, docOyentes, documento,
           pasar: (ms) => { ahora += ms; } };
}

test('cliente: sin foto del anfitrión en 3 s se piensa aquí, y sin mandar nada', () => {
  const C = montarCliente();
  const { red, sock, enviados, importados } = C;
  const HUERFANO = C.ctx.GFMobsRed._interno.HUERFANO_MS;
  assert.ok(enviados.some(([e]) => e === 'mobs:hola'), 'saluda al montar');
  assert.equal(red.esHost(), true, 'sin respuesta del servidor: piensa aquí');

  sock.lanzar('mobs:host', { host: 'otro' });
  assert.equal(red.esHost(), false, 'hay anfitrión: dibuja lo que mande');

  sock.lanzar('mobs:estado', { g: 'zombis', l: [[0, 5, 5]], de: 'otro' });
  assert.equal(importados.length, 1, 'la foto se dibuja');

  C.pasar(HUERFANO + 100);
  assert.equal(red.esHost(), true, 'el anfitrión no manda foto: huérfano, piensa aquí');
  enviados.length = 0;
  red.tick(5000);
  red.evento({ e: 'despierta', id: 0 });
  assert.equal(enviados.filter(([e]) => e === 'mobs:estado' || e === 'mobs:evento').length, 0,
               'el huérfano no manda fotos ni anuncios (el servidor no se los aceptaría)');
  red.golpe({ id: 0, dano: 5 });
  assert.equal(enviados.filter(([e]) => e === 'mobs:golpe').length, 0,
               'el golpe del huérfano se aplica aquí, no se manda al dormido');

  sock.lanzar('mobs:estado', { g: 'zombis', l: [[0, 9, 9]], de: 'otro' });
  assert.equal(red.esHost(), false, 'vuelve la foto: se deja de pensar');
  assert.equal(importados.length, 2, 'y se dibuja');

  // Un anfitrión NUEVO tiene sus 3 s para mandar la primera foto.
  C.pasar(HUERFANO + 100);
  sock.lanzar('mobs:host', { host: 'otro2' });
  assert.equal(red.esHost(), false, 'anfitrión recién elegido: se le espera');
});

test('cliente: la pestaña oculta se avisa al servidor (y al saludar)', () => {
  const C = montarCliente();
  const { enviados, documento, docOyentes } = C;
  // (los objetos vienen de la vm: se comparan por JSON)
  const json = (x) => JSON.stringify(x);
  const hola = enviados.find(([e]) => e === 'mobs:hola');
  assert.equal(json(hola[1]), json({ dormido: false }));
  enviados.length = 0;
  documento.hidden = true;
  docOyentes.visibilitychange();
  assert.equal(json(enviados.find(([e]) => e === 'mobs:dormido')), json(['mobs:dormido', { si: true }]));
  documento.hidden = false;
  docOyentes.visibilitychange();
  assert.equal(json(enviados.filter(([e]) => e === 'mobs:dormido').pop()), json(['mobs:dormido', { si: false }]));

  // Cerrada la escena, ya no avisa (y no se queda atada a ella).
  C.scene.events.emit('shutdown');
  enviados.length = 0;
  documento.hidden = true;
  docOyentes.visibilitychange();
  assert.equal(enviados.length, 0, 'escena cerrada: ni un aviso');
});
