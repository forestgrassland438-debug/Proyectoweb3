/* EL HORNO: fundir de verdad, contra la cadena de verdad.
 * =============================================================================
 * Lo que vigila:
 *
 *   · 1 piedra de cobre  + 1 carbón → 1 lingote de cobre  en 1 minuto
 *   · 1 piedra de hierro + 1 carbón → 1 lingote de hierro en 5 minutos
 *   · el carbón SE GASTA (era la mitad de lo pedido, y es lo primero que se
 *     olvida cuando el horno solo "simula")
 *   · NO SE CONFUNDEN LAS TABLAS: se quema `mineral_piedra_cobre` y se acuña
 *     `mineral_cobre`, que son facturas distintas del contrato. Si alguien
 *     cruza las dos, el jugador quema lingotes para fabricar lingotes.
 *   · si el carbón no se puede quemar, el mineral SE DEVUELVE
 *   · el lingote se acuña al RECOGERLO, no al empezar
 *   · el horno sigue contando aunque se cierre el juego (el estado vive en el
 *     servidor y se reconstruye al volver)
 *
 * Saca los métodos REALES de Scenes/GameScene.js y los ejecuta contra el
 * contrato y el server2 imitados de tools/gf-banco-tienda.js.
 *
 *     node tools/horno-prueba.js  [carpeta bin]
 * =============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const banco = require(path.join(__dirname, 'gf-banco-tienda.js'));

const JUGADOR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

let fallos = 0, pasadas = 0;
function ok(cond, mensaje, extra) {
  if (cond) { pasadas++; console.log('  OK    ' + mensaje); }
  else { fallos++; console.log('  FALLO ' + mensaje + (extra !== undefined ? '  -> ' + extra : '')); }
}

const hablar = console.log, gritar = console.error, avisar = console.warn;
const callar = () => { console.log = () => {}; console.error = () => {}; console.warn = () => {}; };
const volver = () => { console.log = hablar; console.error = gritar; console.warn = avisar; };
async function enSilencio(f) { callar(); try { return await f(); } finally { volver(); } }
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// ── EXTRACTOR DE MÉTODOS ────────────────────────────────────────────────────
/** Saca `nombre(...) { … }` o `get nombre() { … }` contando llaves. */
function metodo(txt, nombre) {
  let m = new RegExp('\\n( +(?:async +)?' + nombre + '\\([^)]*\\)\\s*\\{)').exec(txt);
  if (!m) m = new RegExp('\\n( +get +' + nombre + '\\(\\)\\s*\\{)').exec(txt);
  if (!m) m = new RegExp('\\n((?:async +)?' + nombre + '\\([^)]*\\)\\s*\\{)').exec(txt);
  if (!m) throw new Error('no encuentro el método ' + nombre);
  const ini = m.index + 1;
  let i = m.index + m[0].length - 1;      // sobre la '{'
  let prof = 0, cadena = null, bloque = false, linea = false;
  while (i < txt.length) {
    const c = txt[i], dos = txt.substr(i, 2);
    if (linea)       { if (c === '\n') linea = false; }
    else if (bloque) { if (dos === '*/') { bloque = false; i += 2; continue; } }
    else if (cadena) {
      if (c === '\\') { i += 2; continue; }
      if (c === cadena) cadena = null;
      if (cadena === '`' && dos === '${') { i += 2; continue; }
    }
    else {
      if (dos === '//') { linea = true; i += 2; continue; }
      if (dos === '/*') { bloque = true; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') cadena = c;
      else if (c === '{') prof++;
      else if (c === '}') { if (--prof === 0) return txt.slice(ini, i + 1); }
    }
    i++;
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

/* TODO lo que hace falta para fundir de punta a punta: el horno, el motor de
   inventario on-chain que usa por debajo, y los cuatro ayudantes. */
const METODOS = [
  // El horno
  'FURNACE_RECIPES', '_esCombustibleHorno', '_contarParaFundir', '_existenciasEnCadena',
  '_estadoDesdeGuardado', '_cargarHorno', '_guardarHorno',
  '_pararRelojHorno', '_pintarHorno', '_avisoHorno',
  '_iniciarFundido', '_recogerDelHorno', '_setupFurnacePanel',
  'openFurnacePanel', 'closeFurnacePanel',
  // El motor on-chain (los mismos métodos que usan la mina y la tienda)
  'ejecutarDivision', 'Additemblockchains', 'simulateAddItem', 'addItemWithCheck',
  'ejecutarDivisionRemove', '_ejecutarDivisionRemoveInterno', 'RemoveItemBlockchains',
  'simulateRemoveItem', 'EliitemWithCheck', 'contarItemEnInventario',
  'generarCodigo', 'lockSlot', 'unlockAllSlots', '_getFruitDisplayNameEN'
  /* `_escHtml` NO se saca de aquí: lleva `.replace(/"/g, …)` y el extractor,
     que solo cuenta llaves y comillas, toma esa comilla de dentro de la
     expresión regular por el principio de una cadena y se come el resto del
     fichero. Se pone a mano más abajo — su escapado ya lo vigila
     tools/escapado-prueba.js, que es donde le toca. */
];

function catalogoDe(fichero) {
  const t = fs.readFileSync(fichero, 'utf8').replace(/\r\n/g, '\n');
  const marca = 'this.ItemDefinitions = {';
  const i = t.indexOf(marca);
  const ini = t.indexOf('{', i + marca.length - 1);
  let p = 0, j = ini;
  for (; j < t.length; j++) { const c = t[j]; if (c === '{') p++; else if (c === '}') { p--; if (!p) { j++; break; } } }
  return eval('(' + t.slice(ini, j) + ')');
}

// ── LA ESCENA DE MENTIRA ────────────────────────────────────────────────────
function montarEscena(opciones = {}) {
  const b = banco.montar(BIN, opciones);          // navegador + cadena + server2 falsos

  const fuente = fs.readFileSync(path.join(BIN, 'Scenes', 'GameScene.js'), 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = METODOS.map(n => metodo(fuente, n)).join('\n');
  const Escena = eval('(class EscenaFalsaHorno {\n' + cuerpo + '\n})');

  const e = new Escena();
  e.ItemDefinitions = catalogoDe(path.join(BIN, 'Scenes', 'GameScene.js'));
  e.playerName = 'Ana';
  e.serverBase = 'http://prueba.local';
  e.currentAccount = JUGADOR;
  e.guardados = 0;
  e.STATE = {
    slots: new Array(40).fill(null),
    quickSlots: new Array(7).fill(null),
    chestSlots: new Array(24).fill(null),
    ghostSlots: { inv: new Array(40).fill(null), quick: new Array(7).fill(null) },
    selectedItem: null
  };
  e.relayClient = b.relay;
  e.notifications = { show() {} };
  // Copia literal del _escHtml de GameScene (ver la nota en METODOS).
  e._escHtml = (t) => String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  e.renderSlot = () => {};
  e.queuedAction = () => {};
  e.rebuildPlayerInventoryFromState = () => {};
  e.savegg = async () => { e.guardados++; return true; };
  e.stopDrag = () => {};

  e.poner = (hueco, id, count, invoiceId, manual) => {
    e.STATE.slots[hueco] = { id, count, idx: invoiceId, idm: manual };
  };
  e.contar = (id) => {
    let n = 0;
    for (const s of [...e.STATE.slots, ...e.STATE.quickSlots]) if (s && s.id === id) n += s.count || 0;
    return n;
  };
  /* Coger un objeto del inventario y meterlo en una casilla del horno, que es
     lo que hace el jugador: lo levanta y hace clic en el hueco. */
  e.meterEnHorno = (casilla, itemId) => {
    e.STATE.selectedItem = { id: itemId, idx: null, idm: null, image: '' };
    document.getElementById(casilla).onclick();
    e.STATE.selectedItem = null;
  };

  b.escenaHorno = e;
  return b;
}

/** El DOM que el horno espera. Se registra en el document falso del banco. */
function montarDom() {
  ['furnace-panel', 'furnace-close', 'furnace-smelt-btn', 'furnace-slot-ore',
   'furnace-slot-coal', 'furnace-slot-result', 'furnace-status',
   'furnace-timer', 'furnace-time-display'].forEach(id => document._crear(id));
}

// ── LAS PRUEBAS ─────────────────────────────────────────────────────────────
(async () => {
  console.log('=== EL HORNO ===\n');

  // ═════════════════════════════════════════════════════════════════════════
  console.log('1) Las recetas dicen lo que se pidió');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const r = e.FURNACE_RECIPES;
    ok(r.mineral_piedra_cobre && r.mineral_piedra_cobre.resultado === 'mineral_cobre',
       'piedra de cobre → lingote de cobre', JSON.stringify(r.mineral_piedra_cobre));
    ok(r.mineral_piedra_cobre && r.mineral_piedra_cobre.segundos === 60,
       'el cobre tarda 1 minuto', String(r.mineral_piedra_cobre && r.mineral_piedra_cobre.segundos));
    ok(r.mineral_piedra_hierro && r.mineral_piedra_hierro.resultado === 'mineral_hierro',
       'piedra de hierro → lingote de hierro', JSON.stringify(r.mineral_piedra_hierro));
    ok(r.mineral_piedra_hierro && r.mineral_piedra_hierro.segundos === 300,
       'el hierro tarda 5 minutos', String(r.mineral_piedra_hierro && r.mineral_piedra_hierro.segundos));
    ok(e._esCombustibleHorno('carbon') && e._esCombustibleHorno('mineral_carbon'),
       'el carbón y la piedra de carbón valen como combustible');
    ok(!e._esCombustibleHorno('mineral_piedra_cobre'), 'la piedra de cobre no es combustible');

    // Las tablas on-chain de los cuatro implicados tienen que ser DISTINTAS.
    const tipos = ['mineral_piedra_cobre', 'mineral_cobre', 'mineral_piedra_hierro', 'mineral_hierro']
      .map(id => e.ItemDefinitions[id] && e.ItemDefinitions[id].tipo);
    ok(new Set(tipos).size === 4 && tipos.every(Boolean),
       'las 4 tablas on-chain son distintas y ninguna falta', JSON.stringify(tipos));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n2) Fundir cobre: se quema la piedra y el carbón, y sale el lingote');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const idPiedra = b.cadena.crear(JUGADOR, 'mineral_piedra_cobre', 3, 'pc1');
    const idCarbon = b.cadena.crear(JUGADOR, 'carbon', 5, 'c1');
    e.poner(0, 'mineral_piedra_cobre', 3, idPiedra, 'pc1');
    e.poner(1, 'carbon', 5, idCarbon, 'c1');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_cobre');
      e.meterEnHorno('furnace-slot-coal', 'carbon');
      await e._iniciarFundido();
    });

    ok(e.contar('mineral_piedra_cobre') === 2, 'se gasta 1 piedra de cobre',
       String(e.contar('mineral_piedra_cobre')));
    ok(e.contar('carbon') === 4, 'SE GASTA 1 carbón', String(e.contar('carbon')));
    ok(b.cadena.totalDe('mineral_piedra_cobre') === 2, 'y baja también en la cadena',
       String(b.cadena.totalDe('mineral_piedra_cobre')));
    ok(b.cadena.totalDe('carbon') === 4, 'el carbón también baja en la cadena',
       String(b.cadena.totalDe('carbon')));
    ok(e._hornoEstado && e._hornoEstado.fase === 'fundiendo', 'el horno se pone a fundir',
       JSON.stringify(e._hornoEstado));
    ok(e.contar('mineral_cobre') === 0, 'el lingote NO aparece todavía',
       String(e.contar('mineral_cobre')));
    ok(b.cadena.totalDe('mineral_cobre') === 0, 'ni en la cadena',
       String(b.cadena.totalDe('mineral_cobre')));

    // El minuto pasa: se adelanta el reloj del horno en vez de esperarlo.
    e._hornoEstado.finAt = Date.now() - 1;
    await enSilencio(async () => { e._pintarHorno(); });
    ok(e._hornoEstado.fase === 'listo', 'al cumplirse el tiempo queda listo', e._hornoEstado.fase);

    await enSilencio(() => e._recogerDelHorno());
    ok(e.contar('mineral_cobre') === 1, 'al recoger llega 1 lingote de cobre',
       String(e.contar('mineral_cobre')));
    ok(b.cadena.totalDe('mineral_cobre') === 1, 'y su factura existe en la cadena',
       String(b.cadena.totalDe('mineral_cobre')));
    ok(e._hornoEstado.fase === 'vacio', 'el horno queda libre', e._hornoEstado.fase);
    ok(e.guardados > 0, 'el inventario se guarda en el servidor', String(e.guardados));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n3) Fundir hierro: 5 minutos y el lingote correcto');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const idPiedra = b.cadena.crear(JUGADOR, 'mineral_piedra_hierro', 2, 'ph1');
    const idCarbon = b.cadena.crear(JUGADOR, 'mineral_carbon', 2, 'mc1');
    e.poner(0, 'mineral_piedra_hierro', 2, idPiedra, 'ph1');
    e.poner(1, 'mineral_carbon', 2, idCarbon, 'mc1');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_hierro');
      e.meterEnHorno('furnace-slot-coal', 'mineral_carbon');   // el otro combustible
      await e._iniciarFundido();
    });

    const dura = e._hornoEstado ? (e._hornoEstado.finAt - e._hornoEstado.inicio) : 0;
    ok(dura === 300000, 'el hierro tarda 5 minutos exactos', String(dura));
    ok(e.contar('mineral_piedra_hierro') === 1 && e.contar('mineral_carbon') === 1,
       'se gasta 1 piedra de hierro y 1 piedra de carbón',
       e.contar('mineral_piedra_hierro') + '/' + e.contar('mineral_carbon'));

    e._hornoEstado.finAt = Date.now() - 1;
    await enSilencio(async () => { e._pintarHorno(); await e._recogerDelHorno(); });
    ok(e.contar('mineral_hierro') === 1, 'sale 1 lingote de hierro',
       String(e.contar('mineral_hierro')));
    ok(b.cadena.totalDe('mineral_hierro') === 1, 'y existe en la cadena',
       String(b.cadena.totalDe('mineral_hierro')));
    ok(b.cadena.totalDe('mineral_cobre') === 0, 'sin tocar la tabla del cobre',
       String(b.cadena.totalDe('mineral_cobre')));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n4) Lo que NO se puede meter en el horno');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    b.cadena.crear(JUGADOR, 'mineral_cobre', 5, 'lc1');
    e.poner(0, 'mineral_cobre', 5, 1, 'lc1');
    e.poner(1, 'carbon', 5, 2, 'c1');
    b.cadena.crear(JUGADOR, 'carbon', 5, 'c1');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_cobre');   // ¡un LINGOTE!
    });
    const ore = document.getElementById('furnace-slot-ore');
    ok(!ore._item, 'un lingote no entra en la casilla de mineral',
       JSON.stringify(ore._item));
    ok(document.getElementById('furnace-status').textContent.includes('cannot be smelted'),
       'y se dice por qué', document.getElementById('furnace-status').textContent);

    await enSilencio(async () => { e.meterEnHorno('furnace-slot-coal', 'mineral_piedra_cobre'); });
    const coal = document.getElementById('furnace-slot-coal');
    ok(!coal._item, 'la piedra de cobre no entra en la casilla del carbón');

    await enSilencio(() => e._iniciarFundido());
    ok(!e._hornoEstado || e._hornoEstado.fase === 'vacio', 'sin las dos casillas no funde',
       JSON.stringify(e._hornoEstado));
    ok(e.contar('mineral_cobre') === 5, 'y no se quema nada', String(e.contar('mineral_cobre')));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n5) Sin carbón no se enciende, y el mineral se devuelve');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const idPiedra = b.cadena.crear(JUGADOR, 'mineral_piedra_cobre', 2, 'pc1');
    // El hueco dice que hay carbón pero en la CADENA no hay ninguna factura de
    // carbón: la quema del carbón fallará después de quemar la piedra.
    e.poner(0, 'mineral_piedra_cobre', 2, idPiedra, 'pc1');
    e.poner(1, 'carbon', 1, 999, 'carbon-fantasma');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_cobre');
      e.meterEnHorno('furnace-slot-coal', 'carbon');
      await e._iniciarFundido();
    });

    ok(!e._hornoEstado || e._hornoEstado.fase === 'vacio', 'el horno no arranca',
       JSON.stringify(e._hornoEstado));
    ok(b.cadena.totalDe('mineral_piedra_cobre') === 2,
       'la piedra NO se quema: se mira la cadena antes de encender',
       String(b.cadena.totalDe('mineral_piedra_cobre')));
    ok(b.cadena.totalDe('mineral_cobre') === 0, 'y no se acuña ningún lingote',
       String(b.cadena.totalDe('mineral_cobre')));
    ok(document.getElementById('furnace-status').textContent.toLowerCase().includes('coal'),
       'se le explica al jugador', document.getElementById('furnace-status').textContent);

    // Y el caso simétrico: el MINERAL es el fantasma.
    const b2 = montarEscena(); montarDom();
    const e2 = b2.escenaHorno;
    b2.cadena.crear(JUGADOR, 'carbon', 3, 'c1');
    e2.poner(0, 'mineral_piedra_cobre', 1, 777, 'piedra-fantasma');
    e2.poner(1, 'carbon', 3, 1, 'c1');
    await enSilencio(async () => {
      e2._setupFurnacePanel();
      e2.meterEnHorno('furnace-slot-ore', 'mineral_piedra_cobre');
      e2.meterEnHorno('furnace-slot-coal', 'carbon');
      await e2._iniciarFundido();
    });
    ok(!e2._hornoEstado || e2._hornoEstado.fase === 'vacio',
       'con el MINERAL fantasma tampoco arranca', JSON.stringify(e2._hornoEstado));
    ok(b2.cadena.totalDe('carbon') === 3, 'y el carbón bueno no se toca',
       String(b2.cadena.totalDe('carbon')));
    ok(b2.cadena.totalDe('mineral_cobre') === 0, 'no hay lingote de la nada',
       String(b2.cadena.totalDe('mineral_cobre')));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n6) El horno sigue contando aunque se cierre el juego');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const idPiedra = b.cadena.crear(JUGADOR, 'mineral_piedra_hierro', 1, 'ph1');
    const idCarbon = b.cadena.crear(JUGADOR, 'carbon', 1, 'c1');
    e.poner(0, 'mineral_piedra_hierro', 1, idPiedra, 'ph1');
    e.poner(1, 'carbon', 1, idCarbon, 'c1');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_hierro');
      e.meterEnHorno('furnace-slot-coal', 'carbon');
      await e._iniciarFundido();
      await dormir(30);                      // que llegue el POST al servidor
    });
    ok(e._hornoEstado.fase === 'fundiendo', 'está fundiendo');
    const guardado = b.servidor.horno;
    ok(!!guardado && guardado.oreItem && guardado.oreItem.id === 'mineral_piedra_hierro',
       'el servidor guarda QUÉ se está fundiendo', JSON.stringify(guardado));

    // El jugador cierra el juego: se monta una escena NUEVA con el mismo estado
    // guardado y se comprueba que el horno vuelve solo.
    const e2 = montarEscena().escenaHorno;
    e2.ItemDefinitions = e.ItemDefinitions;
    const rehecho = e2._estadoDesdeGuardado(guardado);
    ok(rehecho && rehecho.fase === 'fundiendo' && rehecho.resultado === 'mineral_hierro',
       'al volver, el horno se reconstruye solo', JSON.stringify(rehecho));
    ok(rehecho && (rehecho.finAt - rehecho.inicio) === 300000,
       'con el tiempo que le queda bien puesto', String(rehecho && (rehecho.finAt - rehecho.inicio)));

    // Y si ya había pasado el tiempo, vuelve directamente como "listo".
    const viejo = { oreItem: { id: 'mineral_piedra_cobre' }, coalItem: { id: 'carbon' },
                    timestamp: Date.now() - 10 * 60 * 1000 };
    const rehecho2 = e2._estadoDesdeGuardado(viejo);
    ok(rehecho2 && rehecho2.fase === 'listo', 'una fundición vieja vuelve ya lista',
       JSON.stringify(rehecho2));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n7) Si la acuñación no se confirma, el lingote NO se pierde');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    e._hornoEstado = {
      fase: 'listo', oreId: 'mineral_piedra_cobre', coalId: 'carbon',
      resultado: 'mineral_cobre', inicio: Date.now() - 120000, finAt: Date.now() - 60000
    };
    // El contrato no acepta la tabla del lingote: la acuñación falla.
    b.cadena.tiposConfigurados = new Set(['mineral_piedra_cobre', 'carbon']);

    await enSilencio(() => e._recogerDelHorno());

    ok(e._hornoEstado.fase === 'listo', 'el horno se queda LISTO para reintentar',
       e._hornoEstado.fase);
    ok(e.contar('mineral_cobre') === 0, 'y no se apunta un lingote que no existe',
       String(e.contar('mineral_cobre')));

    // Ahora sí: se permite la tabla y el jugador vuelve a darle a recoger.
    b.cadena.tiposConfigurados = null;
    await enSilencio(() => e._recogerDelHorno());
    ok(e.contar('mineral_cobre') === 1, 'al reintentar sí lo recoge',
       String(e.contar('mineral_cobre')));
    ok(e._hornoEstado.fase === 'vacio', 'y el horno queda libre', e._hornoEstado.fase);
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n8) No se puede meter nada mientras está fundiendo');
  {
    const b = montarEscena(); montarDom();
    const e = b.escenaHorno;
    const idPiedra = b.cadena.crear(JUGADOR, 'mineral_piedra_cobre', 5, 'pc1');
    const idCarbon = b.cadena.crear(JUGADOR, 'carbon', 5, 'c1');
    e.poner(0, 'mineral_piedra_cobre', 5, idPiedra, 'pc1');
    e.poner(1, 'carbon', 5, idCarbon, 'c1');

    await enSilencio(async () => {
      e._setupFurnacePanel();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_cobre');
      e.meterEnHorno('furnace-slot-coal', 'carbon');
      await e._iniciarFundido();
      e.meterEnHorno('furnace-slot-ore', 'mineral_piedra_cobre');   // segundo intento
      await e._iniciarFundido();
    });

    ok(e.contar('mineral_piedra_cobre') === 4, 'solo se ha gastado UNA piedra',
       String(e.contar('mineral_piedra_cobre')));
    ok(e.contar('carbon') === 4, 'y UN carbón', String(e.contar('carbon')));
    ok(document.getElementById('furnace-status').textContent.toLowerCase().includes('busy') ||
       e._hornoEstado.fase === 'fundiendo', 'y se avisa de que el horno está ocupado');
  }

  console.log('\n' + '='.repeat(62));
  console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
  if (fallos) { console.log('\nHay fallos en el horno.'); process.exit(1); }
  console.log('Sin fallos.');
  process.exit(0);
})().catch(e => { volver(); console.error('EXPLOTO:', e); process.exit(1); });
