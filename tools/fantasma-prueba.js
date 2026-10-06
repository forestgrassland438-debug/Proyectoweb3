/* Un fantasma no produce nada.
 *
 * FALLO QUE VIGILA (2026-10-02): muerto y en modo fantasma se podía seguir
 * sembrando, regando, cortando, cosechando, talando, minando, crafteando,
 * usando el horno, cogiendo agua y completando misiones.
 *
 * Tres partes:
 *   1. El ayudante esFantasma() del server2.js DE VERDAD, con una base de datos
 *      de mentira: vivo/fantasma, por nombre y por dirección, la caché de 3 s,
 *      que morir/revivir la borra y que un fallo de Mongo no bloquea a nadie.
 *   2. Cada punto de entrada del servidor lleva la puerta, DESPUÉS de saber
 *      quién es el jugador y ANTES de lo que produce o cobra. Una puerta
 *      puesta detrás del findOneAndUpdate no sirve de nada y pasaría un grep.
 *   3. gf-muerte.js en una VM: bloquear() dice que no a un fantasma y a una
 *      vida a 0, deja en paz a un vivo y a una vida desconocida, y no ametralla
 *      avisos. Y cada acción de GameScene / CraftingHub lo pregunta lo primero.
 *
 *   node tools/fantasma-prueba.js  [ruta a server2.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SERVIDOR = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'server2.js');
if (!fs.existsSync(SERVIDOR)) {
  console.error('No encuentro el servidor en: ' + SERVIDOR);
  process.exit(2);
}
const TXT = fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n');

let bien = 0, mal = 0;
function ok(cond, txt) {
  if (cond) { bien++; console.log('  OK    ' + txt); }
  else { mal++; console.log('  MAL   ' + txt); }
}
function titulo(t) { console.log('\n=== ' + t + ' ==='); }

// ─────────────────────────────────────────────────────────────── 1. ayudante
async function parteServidor() {
  titulo('1. esFantasma() del servidor');
  const ini = TXT.indexOf('const _cacheFantasma = new Map();');
  const finTxt = 'function responderFantasma(res) {';
  const fin = TXT.indexOf('\n}\n', TXT.indexOf(finTxt));
  if (ini < 0 || fin < 0) { ok(false, 'el ayudante está en server2.js'); return; }
  const codigo = TXT.slice(ini, fin + 2);

  // Base de datos de mentira con la forma que usa el ayudante.
  const jugadores = { ana: { playerName: 'ana', isGhost: false }, bea: { playerName: 'bea', isGhost: true } };
  const cuentas = { '0xaaa': { playerName: 'ana' }, '0xbbb': { playerName: 'bea' } };
  let lecturas = 0, romper = false;
  const consulta = (valor) => ({ select() { return this; }, lean() {
    lecturas++;
    if (romper) return Promise.reject(new Error('mongo caído'));
    return Promise.resolve(valor ? { ...valor } : null);
  } });
  const ctx = {
    Date, Map, String,
    GamePlayer: { findOne: (q) => consulta(jugadores[q.playerName]) },
    PlayerAuth: { findOne: (q) => consulta(cuentas[q.address]) },
  };
  vm.createContext(ctx);
  vm.runInContext(codigo + '\n;this.esFantasma = esFantasma; this.olvidarFantasma = olvidarFantasma;' +
                  ' this.responderFantasma = responderFantasma;', ctx);
  const { esFantasma, olvidarFantasma, responderFantasma } = ctx;

  ok(await esFantasma({ playerName: 'ana' }) === false, 'un vivo no es fantasma');
  ok(await esFantasma({ playerName: 'bea' }) === true, 'un muerto sí');
  ok(await esFantasma({ address: '0xBBB' }) === true, 'también por dirección (y sin importar mayúsculas)');
  ok(await esFantasma({}) === false && await esFantasma() === false, 'sin datos no se bloquea');
  ok(await esFantasma({ playerName: 'nadie' }) === false, 'un jugador que no existe no es fantasma');

  const antes = lecturas;
  await esFantasma({ playerName: 'ana' });
  ok(lecturas === antes, 'la segunda pregunta en menos de 3 s sale de la caché');

  jugadores.ana.isGhost = true;                       // muere…
  ok(await esFantasma({ playerName: 'ana' }) === false, '…la caché todavía dice vivo (es lo esperado)');
  olvidarFantasma('ana', '0xAAA');                    // …y /api/player/death la borra
  ok(await esFantasma({ playerName: 'ana' }) === true, 'tras olvidarFantasma se lee el estado nuevo');

  romper = true;
  olvidarFantasma('bea');
  ok(await esFantasma({ playerName: 'bea' }) === false, 'si Mongo falla no se bloquea a nadie por esto');
  romper = false;

  let estado = 0, cuerpo = null;
  const res = { status(s) { estado = s; return this; }, json(j) { cuerpo = j; return this; } };
  responderFantasma(res);
  ok(estado === 423 && cuerpo && cuerpo.error === 'fantasma', 'la respuesta es 423 { error: "fantasma" }');
}

// ────────────────────────────────────────────── 2. cada puerta, en su sitio
function trozo(firma, largo) {
  const i = TXT.indexOf(firma);
  if (i < 0) return null;
  return TXT.slice(i, i + (largo || 5000));
}

function partePuertas() {
  titulo('2. las puertas del servidor van antes de producir');
  const GUARDA = 'await esFantasma(';
  // [firma, lo que tiene que ir ANTES de la puerta, lo que tiene que ir DESPUÉS]
  const casos = [
    ["app.post('/api/stats/:playerName/consume'", "error: 'Forbidden'", 'const reason', 'consumir vitales (talar, minar, sembrar, regar)'],
    ["app.post('/api/gather/claim'", 'const address', 'gatherNodeTypeFromKey(', 'recompensa de recolección'],
    ["app.post('/api/missions/daily/complete'", 'auth.playerName', 'MISSION_NPCS.includes', 'completar misión'],
    ["app.post('/api/furnace/:playerName'", 'requireOwner(', 'FurnaceState.findOneAndUpdate', 'horno'],
    ["app.post('/api/water/collect',", "'No autorizado'", 'collectWater(', 'agua del pozo'],
    ["app.post('/api/tree/deforestation'", 'req.body;', 'Deforestation.findOneAndUpdate', 'talar (deforestación)'],
    ["socket.on('plantCheck'", 'assertCropOwner(', 'isPlantLocked(', 'comprobar siembra'],
    ["socket.on('plantSeed'", 'assertCropOwner(', 'cropController.plantSeed(', 'sembrar'],
    ["socket.on('waterCrop'", 'assertCropOwner(', 'cropController.waterCrop(', 'regar'],
    ["socket.on('harvestCrop'", 'assertCropOwner(', 'cropController.harvestCrop(', 'cosechar'],
    ["socket.on('cutCrop'", 'assertCropOwner(', 'cropController.cutCrop(', 'cortar cultivo'],
  ];
  for (const [firma, antes, despues, nombre] of casos) {
    const t = trozo(firma);
    if (!t) { ok(false, nombre + ': no encuentro ' + firma); continue; }
    const g = t.indexOf(GUARDA), a = t.indexOf(antes), d = t.indexOf(despues);
    ok(g > 0 && a >= 0 && d > 0 && a < g && g < d,
       nombre + ': quién-es → puerta → acción' + (g < 0 ? ' (SIN PUERTA)' : ''));
  }

  for (const v of ['true', 'false']) {
    const a = '    gp.isGhost = ' + v + ';\n    await gp.save();\n    olvidarFantasma(';
    ok(TXT.split(a).length === 2, (v === 'true' ? 'morir' : 'revivir') + ' borra la caché tras guardar');
  }
  // El relay se deja abierto a propósito (ver el comentario del servidor).
  const relay = trozo("app.post('/api/relay/transaction',", 3000);
  ok(relay && relay.indexOf(GUARDA) < 0, 'el relay NO lleva puerta (los objetos ya ganados no se pierden al morir)');
}

// ──────────────────────────────────────────────────────────── 3. el cliente
function parteCliente() {
  titulo('3. gf-muerte.js: bloquear()');
  const avisos = [];
  const clases = new Set();
  const panel = { classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), toggle() {} }, offsetWidth: 1 };
  const ventana = {
    GFMascota: { _g: false, estado() { return { ghost: this._g }; } },
    playerStats: { vida: 80 },
  };
  let reloj = 1000000;
  const ctx = {
    window: ventana,
    document: { getElementById: (id) => (id === 'gf-death' ? panel : null),
                createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {} }),
                head: { appendChild() {} }, body: { appendChild() {} } },
    Date: { now: () => reloj },
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'gf-muerte.js'), 'utf8'), ctx);
  const M = ventana.GFMuerte;
  if (!M || typeof M.bloquear !== 'function') { ok(false, 'GFMuerte.bloquear existe'); return; }

  const escena = (vida) => ({ vidaPorcentaje: vida, notifications: { show: (t) => avisos.push(t) } });

  ok(M.bloquear(escena(80), 'plant') === false && avisos.length === 0, 'un vivo planta sin avisos');
  ok(M.bloquear({ notifications: { show() {} } }, 'chop') === false, 'vida desconocida (sin escena ni stats) no bloquea');

  ventana.GFMascota._g = true;
  ok(M.bloquear(escena(80), 'chop') === true, 'un fantasma no tala');
  ok(avisos.length === 1 && /ghost/i.test(avisos[0]) && /chop/.test(avisos[0]), 'y se le dice por qué');
  ok(clases.has('llamar'), 'y se señala el botón de revivir');
  ok(M.bloquear(escena(80), 'mine') === true && avisos.length === 1, 'el segundo intento seguido no repite el aviso');
  reloj += 3000;
  ok(M.bloquear(escena(80), 'mine') === true && avisos.length === 2, 'pasado un rato, sí');

  ventana.GFMascota._g = false;
  ok(M.bloquear(escena(0), 'craft') === true, 'vida a 0 (aún sin respuesta del servidor) también bloquea');
  ok(M.bloquear(escena(1), 'craft') === false, 'con 1 de vida se puede');

  titulo('3b. cada acción lo pregunta lo primero');
  const GS = fs.readFileSync(path.join(RAIZ, 'Scenes', 'GameScene.js'), 'utf8');
  const CH = fs.readFileSync(path.join(RAIZ, 'CraftingHub.js'), 'utf8');
  const metodo = (src, firma) => {
    const re = new RegExp('^\\s*' + firma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    const m = re.exec(src);
    if (!m) return null;
    return src.slice(m.index + m[0].length, m.index + m[0].length + 400);
  };
  const acciones = [
    [GS, 'stageSeed'], [GS, 'async confirmSiembraPendiente'], [GS, 'async plantSeed'],
    [GS, 'stageWater'], [GS, 'async confirmRiegoPendiente'], [GS, 'async waterCrop'],
    [GS, 'stageCut'], [GS, 'async confirmCortePendiente'], [GS, 'harvestCrop'],
    [GS, 'async completeMission'], [GS, 'async handleWaterCollectionClick'],
    [GS, '_hayRecursosParaTrabajar'], [GS, 'async _iniciarFundido'], [GS, 'async _recogerDelHorno'],
    [CH, 'async craftItem'], [CH, 'async _craftItemInterno'],
  ];
  for (const [src, firma] of acciones) {
    const cuerpo = metodo(src, firma);
    if (!cuerpo) { ok(false, firma + ': no encuentro el método'); continue; }
    // Lo primero que hace (saltando comentarios y líneas en blanco) es preguntar.
    const primera = cuerpo.split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'))[0] || '';
    ok(/GFMuerte\.bloquear\(/.test(primera), firma.replace('async ', '') + '()');
  }
}

(async () => {
  await parteServidor();
  partePuertas();
  parteCliente();
  console.log('\n' + bien + ' bien, ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
