/* Salir de la batalla: que NUNCA se quede uno encerrado.
 *
 * EL FALLO QUE VIGILA — "pierdo, pero no puedo volver al mapa aunque le he
 * hecho clic": `volverAlMapa()` era un cerrojo de una sola direccion. Ponia
 * `_volviendo = true`, ocultaba la interfaz y pedia el cambio de escena; si
 * ese cambio NO entraba, cualquier intento posterior hacia `return` y el
 * jugador se quedaba mirando el combate terminado sin un solo boton que
 * respondiera.
 *
 * Aqui se carga el BattleScene DE VERDAD contra un Phaser de mentira y se le
 * ponen zancadillas: que el cambio de escena no haga nada, que `limpiar()`
 * reviente, que la escena de destino no exista. En los tres casos tiene que
 * acabar en el mapa.
 *
 *   node tools/batalla-prueba-salida.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BIN = process.argv[2] || path.join(__dirname, '..');

// ── Un Phaser de mentira, solo con lo que toca esta parte ────────────────────
function cargarBattleScene() {
  // El navegador de verdad tiene los relojes colgando de `window`, y el codigo
  // los usa asi a proposito (ver volverAlMapa): sobreviven al apagado de la escena.
  const ventana = { setTimeout: setTimeout, clearTimeout: clearTimeout };
  const caja = {
    window: ventana,
    document: { body: { classList: { add() {}, remove() {} } },
                getElementById: () => null },
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    console: { log() {}, warn() {}, error() {} },
    Phaser: { Scene: class { constructor(cfg) { this.sys = { settings: cfg }; } } },
    Math, Date, Promise, Object, Array, String, Number, JSON, Set, Map,
    setTimeout, clearTimeout, isNaN, parseInt, parseFloat
  };
  caja.globalThis = caja;
  vm.createContext(caja);
  vm.runInContext(fs.readFileSync(path.join(BIN, 'Scenes', 'BattleScene.js'), 'utf8'),
                  caja, { filename: 'BattleScene.js' });
  if (typeof ventana.BattleScene !== 'function') throw new Error('BattleScene no se registro en window');
  return ventana.BattleScene;
}

const BattleScene = cargarBattleScene();

/**
 * Una escena montada a mano, con un gestor de escenas de mentira.
 *
 * `opciones.escenas`  → que claves conoce el gestor.
 * `opciones.startFalla` → `scene.start` no hace nada (el fallo del jugador).
 * `opciones.limpiarRevienta` → `limpiar()` lanza una excepcion.
 */
function montar(opciones) {
  const o = opciones || {};
  const escenas = o.escenas || ['LoadingScenegame', 'GameScene', 'BattleScene'];
  const activa = { clave: 'BattleScene' };
  const registro = { start: [], managerStart: [], managerStop: [] };

  const manager = {
    getScene: (k) => (escenas.indexOf(k) >= 0 ? { key: k } : null),
    isActive: (k) => activa.clave === k,
    isVisible: (k) => activa.clave === k,
    start: (k) => { registro.managerStart.push(k); activa.clave = k; },
    stop: (k) => { registro.managerStop.push(k); }
  };

  const s = new BattleScene();
  s.init({ volverA: o.volverA || 'LoadingScenegame', modo: 'bot' });

  s.scene = {
    manager,
    start: (k) => {
      registro.start.push(k);
      if (!o.startFalla) activa.clave = k;      // el caso bueno: el cambio entra
    }
  };
  s.sys = { isActive: () => activa.clave === 'BattleScene' };
  s.el = { status: { textContent: '' } };
  s.ui = { classList: { add() {}, remove() {} } };
  s.limpiar = () => {
    registro.limpiado = (registro.limpiado || 0) + 1;
    if (o.limpiarRevienta) throw new Error('limpiar() se atraganto a proposito');
  };

  return { s, registro, activa };
}

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => { if (c) { pasadas++; console.log('  OK   ' + m); }
                          else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); } };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  console.log('=== SALIR DE LA BATALLA ===\n');

  // 1) El caso normal.
  {
    const { s, registro, activa } = montar({});
    s.volverAlMapa();
    ok(registro.start[0] === 'LoadingScenegame', 'sale al mapa a la primera');
    ok(activa.clave === 'LoadingScenegame', 'y la escena activa pasa a ser el mapa');
  }

  // 2) EL FALLO DEL JUGADOR: el cambio de escena no entra.
  //    Antes esto dejaba encerrado para siempre. Ahora hay reintento.
  {
    const { s, registro, activa } = montar({ startFalla: true });
    s.volverAlMapa();
    ok(activa.clave === 'BattleScene', 'primer intento: el cambio no entra (zancadilla puesta)');
    await esperar(1800);
    ok(registro.managerStop.indexOf('BattleScene') >= 0,
       'el reintento automatico para la batalla por el gestor');
    ok(activa.clave === 'LoadingScenegame',
       'y a los 1,5 s el jugador ESTA en el mapa aunque el primer intento fallara');
  }

  // 3) Volver a pulsar despues de un intento fallido tiene que servir.
  //    (Con el cerrojo viejo, `_volviendo` seguia en true y no hacia nada.)
  {
    const { s, registro } = montar({ startFalla: true });
    s.volverAlMapa();
    const alPrimero = registro.start.length;
    s.volverAlMapa();                       // inmediato: el cerrojo corto lo frena
    ok(registro.start.length === alPrimero, 'dos pulsaciones seguidas no lanzan dos cambios');
    await esperar(4200);                    // el cerrojo caduca a los 4 s
    s.volverAlMapa();
    ok(registro.start.length > alPrimero,
       'pasados unos segundos, PULSAR OTRA VEZ vuelve a intentarlo (antes no)');
  }

  // 4) Si `limpiar()` revienta, se sale igual.
  {
    const { s, registro, activa } = montar({ limpiarRevienta: true });
    let propago = false;
    try { s.volverAlMapa(); } catch (e) { propago = true; }
    ok(!propago, 'una excepcion en limpiar() no se propaga');
    ok(registro.start[0] === 'LoadingScenegame' && activa.clave === 'LoadingScenegame',
       'y aun asi se vuelve al mapa');
  }

  // 5) Escena de destino inexistente: se cae a una que si exista.
  {
    const { s, registro, activa } = montar({ volverA: 'EscenaQueNoExiste' });
    s.volverAlMapa();
    ok(registro.start[0] === 'LoadingScenegame',
       'un `volverA` inexistente no deja la pantalla muerta: cae a LoadingScenegame',
       'pidio ' + registro.start[0]);
    ok(activa.clave === 'LoadingScenegame', 'y llega');
  }

  // 6) Ni siquiera hay mapa: se avisa al jugador en vez de dejarlo mirando.
  {
    const { s, registro } = montar({ volverA: 'Nada', escenas: ['BattleScene'] });
    s.volverAlMapa();
    ok(registro.start.length === 0, 'sin ninguna escena de destino no se pide un cambio imposible');
    ok(/Could not return to the map/.test(s.el.status.textContent),
       'se le DICE al jugador que recargue, en ingles', JSON.stringify(s.el.status.textContent));
    ok(s._volviendo === false, 'y el boton queda libre para volver a intentarlo');
  }

  // 7) Rendirse fuera de combate sale directo; en combate avisa al servidor
  //    pero NO se queda esperando para siempre.
  {
    const { s, registro, activa } = montar({});
    const enviados = [];
    s.socket = { connected: true, emit: (ev) => enviados.push(ev) };
    s.estado = 'fin';
    s.rendirse();
    ok(activa.clave === 'LoadingScenegame', 'rendirse con la partida acabada sale al momento');
    ok(enviados.indexOf('battle:forfeit') >= 0, 'y avisa al servidor por si el candado seguia puesto');
  }
  {
    const { s, activa } = montar({});
    const enviados = [];
    s.socket = { connected: true, emit: (ev) => enviados.push(ev) };
    s.estado = 'combate';
    s.rendirse();
    ok(enviados.indexOf('battle:forfeit') >= 0, 'rendirse en combate manda battle:forfeit');
    ok(activa.clave === 'BattleScene', 'y espera un momento a que el servidor conteste');
    await esperar(4500);
    ok(activa.clave === 'LoadingScenegame',
       'si el servidor NO contesta, a los 4 s se sale igual (antes: colgado para siempre)');
  }

  // 8) El boton de rendirse pide confirmacion en combate y sale directo fuera.
  {
    const { s, activa } = montar({});
    const boton = { classList: { _c: new Set(), add(c) { this._c.add(c); },
                                 remove(c) { this._c.delete(c); },
                                 has(c) { return this._c.has(c); } },
                    textContent: 'Surrender' };
    s._botonesRendirse = [boton];
    s.socket = { connected: true, emit: () => {} };
    s.estado = 'combate';
    s.pedirRendicion(boton);
    ok(boton.textContent === 'Confirm?' && boton.classList.has('confirmar'),
       'primera pulsacion en combate: pide confirmacion, no se rinde');
    ok(activa.clave === 'BattleScene', 'y sigue en la batalla');
    s.pedirRendicion(boton);
    ok(s._confirmandoRendicion === false, 'segunda pulsacion: confirma');
    await esperar(4500);
    ok(activa.clave === 'LoadingScenegame', 'y acaba en el mapa');
  }
  {
    const { s, activa } = montar({});
    const boton = { classList: { add() {}, remove() {} }, textContent: 'Surrender' };
    s._botonesRendirse = [boton];
    s.estado = 'buscando';
    s.socket = { connected: true, emit: () => {} };
    s.pedirRendicion(boton);
    ok(activa.clave === 'LoadingScenegame',
       'buscando rival no hay nada que confirmar: una sola pulsacion y fuera');
  }

  console.log('\n' + '='.repeat(64));
  console.log('PASADAS: ' + pasadas + '   FALLOS: ' + fallos);
  process.exit(fallos ? 1 : 0);
})();
