'use strict';
/* =============================================================================
 * cuenta-en-cadena.js — LA CUENTA DEL JUGADOR, RESPALDADA EN LA CADENA (2026-11-19)
 * =============================================================================
 * "Las misiones del tutorial no se guardan en el contrato en una tabla automática
 *  así como el exp, para que no se reinicie si hay un borrado del backend […] tus
 *  puntos de skill y cómo están integrados, tus amigos, el inicio de sesión con
 *  Google y todos los datos de esa cuenta, tus invitados, tu puntaje de ranking,
 *  lo que construí en las Lands, tus misiones cumplidas y tu historial de mensajes,
 *  con microtransacciones, respetando el contrato actual y ahorrando comisiones."
 *
 * EL CONTRATO NO SE TOCA (InvoiceSystem, Desktop/rr.txt.txt). Todo cabe en facturas:
 *
 *  1. TABLAS EMPAQUETADAS — una factura por jugador y tabla. La CANTIDAD (uint256)
 *     lleva varios números a la vez: cambie el que cambie, es UNA transacción.
 *       cta_tutorial     tu:<dir>  paso del tutorial · 256 + segundos de cuando lo terminó
 *       cta_habilidades  hb:<dir>  exp de agricultura, minería, tala, pesca, cocina y fuerza
 *       cta_misiones     mi:<dir>  misiones cumplidas (total, granjero, guardián…)
 *       cta_ranking      rk:<dir>  temporada, puntos, victorias… y lo de por vida de la mascota
 *     (Los puntos de personaje repartidos ya iban en player_<habilidad>; el nivel, la exp,
 *     el nombre y las monedas, en nivel / nombre / exp / oro… Aquí no se repiten.)
 *  2. TABLAS DE RELACIÓN — una factura de cantidad 1 por relación; se quema al deshacerla.
 *       cta_amigos     am:<yo><otro>  una por cada lado (cada jugador es dueño de la suya)
 *       cta_invitados  iv:<invitado>  dueño = quien invitó · ic:<CÓDIGO> = su código
 *       cta_lands      ld:<t>:<x>.<y>:<dir>  lo construido en la isla que solo vivía en
 *                      Mongo (cofres, bote de basura…); las parcelas ya van en cons_parcelas
 *  3. EL ANCLA CIFRADA — lo grande (privados, la cartera del inicio con Google y la
 *     ficha de la cuenta) va comprimido y CIFRADO (AES-256-GCM) en los datos de UNA
 *     transacción por lote, pegado detrás de increaseInvoiceQuantity(cabeza, Δ): el
 *     contrato ignora los bytes de más y la cadena los guarda para siempre.
 *       cta_respaldo   rs:cabeza  cantidad = bloque del lote ANTERIOR; cada lote lleva
 *                                  el hash del anterior, así se recorren hacia atrás.
 *  4. LOS CONTADORES DEL CENTRO DE CONTROL (2026-11-25) — UNA factura del relayer:
 *       cta_contadores ct:contrato cuentas creadas en total, tx del contrato minadas con
 *                                  éxito y revertidas, y hasta dónde están contadas.
 *                                  Por lotes cada 10 minutos (ver CONTADORES).
 *
 * AHORRO DE COMISIONES: nada se escribe si no cambió (firma por tabla y jugador); lo
 * que cambia mucho (habilidades, misiones, ranking) espera un intervalo mínimo; las
 * relaciones son una transacción por alta o baja; lo grande va en lotes.
 *
 * LA CADENA NUNCA PISA UN DATO MÁS NUEVO DE MONGO al recuperar:
 *   · contadores y experiencia: gana el mayor;
 *   · estados: gana Mongo si existe;
 *   · relaciones: solo se reponen si Mongo no tiene NADA de ese jugador.
 *
 * Se monta en server2.js con require('./cuenta-en-cadena')({...}); si el archivo
 * falta, el servidor sigue sin esta función (lo avisa al arrancar).
 * ========================================================================== */

const PREFIJO = 'cta_';

const TABLAS = Object.freeze({
  tutorial:    { tipo: 'cta_tutorial',    limit: 1n << 60n,  porFactura: 1n << 48n,  minimoMs: 0 },
  habilidades: { tipo: 'cta_habilidades', limit: 1n << 255n, porFactura: 1n << 220n, minimoMs: 20 * 60000 },
  misiones:    { tipo: 'cta_misiones',    limit: 1n << 255n, porFactura: 1n << 220n, minimoMs: 10 * 60000 },
  ranking:     { tipo: 'cta_ranking',     limit: 1n << 255n, porFactura: 1n << 220n, minimoMs: 10 * 60000 },
  amigos:      { tipo: 'cta_amigos',      limit: 1n << 60n,  porFactura: 1n,         minimoMs: 0 },
  invitados:   { tipo: 'cta_invitados',   limit: 1n << 60n,  porFactura: 1n,         minimoMs: 0 },
  lands:       { tipo: 'cta_lands',       limit: 1n << 60n,  porFactura: 1n << 32n,  minimoMs: 0 },
  respaldo:    { tipo: 'cta_respaldo',    limit: 1n << 255n, porFactura: 1n << 220n, minimoMs: 0 },
  // (2026-11-25) Los contadores del centro de control: una sola factura, la del relayer.
  contadores:  { tipo: 'cta_contadores',  limit: 1n << 255n, porFactura: 1n << 250n, minimoMs: 0 }
});
const EMPAQUETADAS = ['tutorial', 'habilidades', 'misiones', 'ranking'];
const RELACIONES = ['amigos', 'invitados', 'lands'];
const PREFIJO_MANUAL = { tutorial: 'tu:', habilidades: 'hb:', misiones: 'mi:', ranking: 'rk:' };

const HABILIDADES = ['agricultura', 'mineria', 'deforestacion', 'pesca', 'cocina', 'fuerza'];
const FORMATOS = Object.freeze({
  habilidades: HABILIDADES.map((k) => [k, 32]),
  misiones: [['completadas', 32], ['granjero', 32], ['guardian', 32], ['total', 32],
             ['enProgreso', 16], ['fallidas', 16], ['estado', 16], ['estado1', 16]],
  ranking: [['temporada', 16], ['puntos', 32], ['victorias', 24], ['derrotas', 24], ['batallas', 24],
            ['mejorRacha', 16], ['racha', 16], ['petWins', 32], ['petBattles', 32]],
  // (2026-11-25) Todo solo sube (ver CONTADORES): 236 bits y la marca.
  contadores: [['cuentas', 40], ['txExito', 48], ['txRevertidas', 40], ['lotes', 24], ['bloque', 40], ['cuentasHasta', 44]]
});
const CERO_CONTADORES = Object.freeze({ cuentas: 0, txExito: 0, txRevertidas: 0, lotes: 0, bloque: 0, cuentasHasta: 0 });
const CONSTRUCCION_CORTA = Object.freeze({ basura: 'ba', cofre1: 'c1', cofre2: 'c2', cofre3: 'c3', cofre4: 'c4', espantapajaros: 'ep' });
const CONSTRUCCION_LARGA = Object.freeze(Object.fromEntries(Object.entries(CONSTRUCCION_CORTA).map(([a, b]) => [b, a])));

const MAGIA = Buffer.from('GFR1');               // los bytes del ancla empiezan así
const ANCLA_MAX = 32 * 1024;                      // bytes por lote (muy por debajo de lo que admite un nodo)

// ── PIEZAS PURAS (sin cadena ni Mongo): las prueba tools/cuenta-cadena.test.cjs ──

function dirValida(a) { return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a); }
function dirMin(a) { return String(a).toLowerCase(); }
/** Una dirección en 27 caracteres (base64url de sus 20 bytes): cabe en un manualId de 64. */
function dirCorta(a) {
  if (!dirValida(a)) throw new Error('direccion_invalida');
  return Buffer.from(dirMin(a).slice(2), 'hex').toString('base64url');
}
function dirDeCorta(s) {
  const b = Buffer.from(String(s || ''), 'base64url');
  if (b.length !== 20) return null;
  return '0x' + b.toString('hex');
}

const MANUAL = {
  tutorial: (dir) => 'tu:' + dirMin(dir),
  habilidades: (dir) => 'hb:' + dirMin(dir),
  misiones: (dir) => 'mi:' + dirMin(dir),
  ranking: (dir) => 'rk:' + dirMin(dir),
  amigo: (yo, otro) => 'am:' + dirCorta(yo) + dirCorta(otro),
  invitado: (invitado) => 'iv:' + dirCorta(invitado),
  codigo: (codigo) => 'ic:' + String(codigo || '').toUpperCase(),
  land: (c, dir) => {
    const t = CONSTRUCCION_CORTA[c.tipo] || String(c.tipo || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 10);
    return 'ld:' + t + ':' + Math.floor(Number(c.gx) || 0) + '.' + Math.floor(Number(c.gy) || 0) + ':' + dirCorta(dir);
  },
  cabeza: () => 'rs:cabeza',
  contadores: () => 'ct:contrato'
};

/** Lee un manualId de las tablas de relación. null si no es de aquí. */
function leerManual(mid) {
  const s = String(mid || '');
  if (s.startsWith('am:') && s.length === 3 + 27 + 27) {
    const yo = dirDeCorta(s.slice(3, 30)), otro = dirDeCorta(s.slice(30));
    return yo && otro ? { tabla: 'amigos', yo, otro } : null;
  }
  if (s.startsWith('iv:')) { const inv = dirDeCorta(s.slice(3)); return inv ? { tabla: 'invitados', invitado: inv } : null; }
  if (s.startsWith('ic:')) return { tabla: 'invitados', codigo: s.slice(3) };
  if (s.startsWith('ld:')) {
    const m = /^ld:([A-Za-z0-9_]{1,10}):(\d{1,6})\.(\d{1,6}):([A-Za-z0-9_-]{27})$/.exec(s);
    if (!m) return null;
    const dir = dirDeCorta(m[4]);
    return dir ? { tabla: 'lands', tipo: CONSTRUCCION_LARGA[m[1]] || m[1], gx: Number(m[2]), gy: Number(m[3]), dir } : null;
  }
  return null;
}

function bitsDe(formato) { return formato.reduce((n, [, b]) => n + b, 0); }
/** Varios números en uno: cada campo satura a su máximo y un bit de marca evita el 0. */
function empaquetar(formato, valores) {
  let v = 0n, pos = 0n;
  for (const [k, b] of formato) {
    const max = (1n << BigInt(b)) - 1n;
    let x = BigInt(Math.max(0, Math.floor(Number(valores && valores[k]) || 0)));
    if (x > max) x = max;
    v |= x << pos;
    pos += BigInt(b);
  }
  return v | (1n << pos);
}
function desempaquetar(formato, valor) {
  let v = BigInt(valor || 0), out = {};
  for (const [k, b] of formato) {
    const max = (1n << BigInt(b)) - 1n;
    out[k] = Number(v & max);
    v >>= BigInt(b);
  }
  out._marca = v === 1n;
  return out;
}
/** (2026-11-25) Los contadores después de un lote: lo de antes + lo nuevo, y los cursores
    hasta donde se contó. Nada baja, así que la cantidad empaquetada siempre SUBE. */
function sumarContadores(viejo, nuevo, hasta) {
  const v = { ...CERO_CONTADORES, ...(viejo || {}) }, n = nuevo || {}, h = hasta || {};
  const ent = (x) => Math.max(0, Math.floor(Number(x) || 0));
  return { cuentas: ent(v.cuentas) + ent(n.cuentas), txExito: ent(v.txExito) + ent(n.txExito),
           txRevertidas: ent(v.txRevertidas) + ent(n.txRevertidas), lotes: ent(v.lotes) + 1,
           bloque: Math.max(ent(v.bloque), ent(h.bloque)), cuentasHasta: Math.max(ent(v.cuentasHasta), ent(h.cuentasHasta)) };
}
/** La fecha (ms) de la factura más antigua de una lista (0 si no hay ninguna con fecha). */
function masAntigua(facturas) {
  let min = 0;
  for (const f of facturas || []) if (f && f.creada > 0 && (!min || f.creada < min)) min = f.creada;
  return min ? min * 1000 : 0;
}

function empaquetarTutorial(paso, terminadoEn) {
  const p = Math.max(0, Math.min(255, Math.floor(Number(paso) || 0)));
  const t = terminadoEn ? Math.max(0, Math.floor(new Date(terminadoEn).getTime() / 1000)) : 0;
  return BigInt(t) * 256n + BigInt(p);
}
function desempaquetarTutorial(valor) {
  const v = BigInt(valor || 0);
  const t = Number(v / 256n);
  return { paso: Number(v % 256n), terminadoEn: t > 0 ? new Date(t * 1000) : null };
}
/** Cantidad de una construcción de la isla (nunca 0). */
function cantidadLand(c) {
  const an = Math.max(1, Math.min(255, Math.floor(Number(c.ancho) || 1)));
  const al = Math.max(1, Math.min(255, Math.floor(Number(c.alto) || 1)));
  const es = Math.max(1, Math.min(255, Math.floor(Number(c.escala) || 1)));
  return BigInt(an) | (BigInt(al) << 8n) | (BigInt(es) << 16n);
}
function leerCantidadLand(v) {
  const x = BigInt(v || 0);
  return { ancho: Number(x & 255n), alto: Number((x >> 8n) & 255n), escala: Number((x >> 16n) & 255n) };
}

/** Fusión campo a campo. politica: 'max' | 'mongo' (gana Mongo si hay doc) */
function fusionar(formato, deMongo, deCadena, politicas, hayDocMongo) {
  const out = {};
  for (const [k] of formato) {
    const m = Number(deMongo && deMongo[k]) || 0, c = Number(deCadena && deCadena[k]) || 0;
    const p = politicas[k] || 'max';
    out[k] = p === 'mongo' ? (hayDocMongo ? m : c) : Math.max(m, c);
  }
  return out;
}

// ── EL ANCLA: comprimir, cifrar y enmarcar ──────────────────────────────────
function claveDerivada(crypto, ikm) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(ikm), Buffer.from('grassland-forest'), Buffer.from('gf-respaldo-v1'), 32));
}
function cifrarLote(crypto, zlib, clave, objeto) {
  const plano = zlib.deflateRawSync(Buffer.from(JSON.stringify(objeto), 'utf8'), { level: 9 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  c.setAAD(MAGIA);
  const ct = Buffer.concat([c.update(plano), c.final()]);
  return Buffer.concat([MAGIA, iv, c.getAuthTag(), ct]);
}
function descifrarLote(crypto, zlib, clave, bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 4 + 12 + 16 || !b.subarray(0, 4).equals(MAGIA)) throw new Error('ancla_sin_magia');
  const iv = b.subarray(4, 16), tag = b.subarray(16, 32), ct = b.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  d.setAAD(MAGIA);
  d.setAuthTag(tag);
  const plano = Buffer.concat([d.update(ct), d.final()]);
  return JSON.parse(zlib.inflateRawSync(plano).toString('utf8'));
}

function firma(crypto, x) {
  return crypto.createHash('sha256').update(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() : v))).digest('hex').slice(0, 32);
}

/** Los valores de una tabla en forma canónica (números enteros, fechas al segundo):
 *  así la firma de "lo de Mongo" y la de "lo que quedó en la cadena" coinciden. */
function normalizar(tabla, v) {
  if (tabla === 'tutorial') {
    const t = v && v.terminadoEn ? Math.floor(new Date(v.terminadoEn).getTime() / 1000) : 0;
    return { paso: Math.max(0, Math.min(255, Math.floor(Number(v && v.paso) || 0))), terminadoEn: t > 0 ? t : 0 };
  }
  const out = {};
  for (const [k, b] of FORMATOS[tabla]) {
    const max = 2 ** b - 1;
    out[k] = Math.max(0, Math.min(max, Math.floor(Number(v && v[k]) || 0)));
  }
  return out;
}
/** ¿No hay nada que guardar? (una cuenta recién creada no gasta una transacción) */
function vacio(tabla, v) {
  const n = normalizar(tabla, v);
  if (tabla === 'tutorial') return !n.paso && !n.terminadoEn;
  return Object.entries(n).every(([k, x]) => k === 'temporada' || !x);
}

// ── EL MOTOR ────────────────────────────────────────────────────────────────
const ABI = [
  'function createInvoice(address _owner, string _tipo, uint256 _cantidad, string _manualId) returns (uint256)',
  'function increaseInvoiceQuantity(uint256 _id, uint256 _increaseAmount) returns (uint256)',
  'function decreaseInvoiceQuantity(uint256 _id, uint256 _decreaseAmount) returns (uint256)',
  'function setLimit(string _tipo, uint256 _limit, uint256 _perInvoiceLimit)',
  'function getTipoStats(string _tipo) view returns (uint256 totalQuantity, uint256 limit, uint256 perInvoiceLimit, uint256 invoiceCount, uint256 totalBurned, bool exists)',
  'function getInvoiceByManualIdSafe(string _manualId) view returns (tuple(uint256 id, string manualId, address owner, string tipo, uint256 cantidad, bool active, uint256 createdAt) inv, bool found)',
  'function getUserInventorySnapshot(address user) view returns (tuple(uint256 id, string manualId, address owner, string tipo, uint256 cantidad, bool active, uint256 createdAt)[] result)',
  'function getInvoicesSafe(uint256[] ids) view returns (tuple(uint256 id, string manualId, address owner, string tipo, uint256 cantidad, bool active, uint256 createdAt)[] result)',
  'function totalInvoicesEver() view returns (uint256)',
  'event InvoiceQuantityIncreased(uint256 indexed id, uint256 increaseAmount, uint256 newCantidad)'
];

function crearCuentaEnCadena(d) {
  const { mongoose, ethers, crypto, zlib } = d;
  const log = d.log || console;
  const ahora = d.ahora || (() => Date.now());
  const M = d.modelos || {};
  const Mixed = mongoose.Schema.Types.Mixed;

  const Estado = mongoose.models.CuentaCadena || mongoose.model('CuentaCadena', new mongoose.Schema({
    _id: String,                 // playerName, o '__global'
    address: String,
    firmas: { type: Mixed, default: {} },     // tabla → firma de lo que la cadena ya tiene
    escritos: { type: Mixed, default: {} },   // tabla → [manualId] confirmados en la cadena
    escritoEn: { type: Mixed, default: {} },  // tabla → ms de la última escritura
    vence: { type: Date, default: null, index: true },   // hay algo aplazado hasta entonces
    error: { type: String, default: '' },
    datos: { type: Mixed, default: {} },      // solo en '__global'
    actualizado: { type: Date, default: Date.now }
  }, { collection: 'cuenta_cadena', versionKey: false, minimize: false }));
  const FirmaAncla = mongoose.models.CuentaCadenaFirma || mongoose.model('CuentaCadenaFirma', new mongoose.Schema({
    _id: String, firma: String, en: Date
  }, { collection: 'cuenta_cadena_firmas', versionKey: false }));

  const topicAumento = ethers.id('InvoiceQuantityIncreased(uint256,uint256,uint256)');
  let _c = null, _cDir = null, _cW = null;
  function contrato() {
    const w = d.wallet && d.wallet(), dir = d.direccionContrato && d.direccionContrato();
    if (!w || !dir) return null;
    if (!_c || _cDir !== dir || _cW !== w) { _c = new ethers.Contract(dir, ABI, w); _cDir = dir; _cW = w; }
    return _c;
  }

  const cfgBase = { activo: process.env.GF_CUENTA_CADENA !== '0', anclaActiva: true,
                    minimoMs: Object.fromEntries(Object.entries(TABLAS).map(([k, t]) => [k, t.minimoMs])),
                    cicloMs: 2 * 60000, anclaCadaMs: 10 * 60000, txPorMinuto: 20, jugadoresPorCiclo: 40,
                    // (2026-11-25) Los contadores del centro de control (ver CONTADORES).
                    contadoresActivos: process.env.GF_CONTADORES_CADENA !== '0', contadoresCadaMs: 10 * 60000,
                    contadoresMargen: d.margenBloques ?? 1200 };
  let cfg = { ...cfgBase, minimoMs: { ...cfgBase.minimoMs } };
  const metricas = { tx: 0, gas: 0n, errores: 0, ultimoError: '', ultimoErrorEn: null, porTabla: {}, lotes: 0, bytesAncla: 0,
                     restaurados: 0, ciclos: 0, ultimoCiclo: null };
  const cola = [];                // playerNames pendientes de sincronizar
  const enCola = new Set();
  let trabajando = false, detenido = false, temporizador = null, ultimoAncla = 0, ultimoContadores = 0;
  const txHechas = [];            // marcas de tiempo, para el freno de tx por minuto
  let tarea = null;               // la restauración general en marcha

  async function leerGlobal() {
    const g = await Estado.findById('__global').lean();
    return (g && g.datos) || {};
  }
  async function guardarGlobal(cambios) {
    const set = {};
    for (const [k, v] of Object.entries(cambios)) set['datos.' + k] = v;
    set.actualizado = new Date();
    await Estado.updateOne({ _id: '__global' }, { $set: set }, { upsert: true });
  }

  async function cargarConfig() {
    try {
      const g = await leerGlobal();
      if (g.config && typeof g.config === 'object') {
        cfg = { ...cfg, ...g.config, minimoMs: { ...cfg.minimoMs, ...(g.config.minimoMs || {}) } };
      }
    } catch (_) {}
    return cfg;
  }

  async function frenoTx() {
    const limite = Math.max(1, Number(cfg.txPorMinuto) || 20);
    for (;;) {
      const t = ahora();
      while (txHechas.length && t - txHechas[0] > 60000) txHechas.shift();
      if (txHechas.length < limite) { txHechas.push(t); return; }
      await new Promise((r) => setTimeout(r, Math.min(5000, 60000 - (t - txHechas[0]) + 50)));
    }
  }

  async function enviar(nombre, fn, preflight, tabla) {
    await frenoTx();
    const recibo = await d.txRelayer('cuenta ' + nombre, fn, preflight);
    if (!recibo || !(recibo.status === 1 || recibo.status === 1n)) throw new Error('tx_no_confirmada');
    metricas.tx++;
    try { metricas.gas += BigInt(recibo.gasUsed || 0n) * BigInt(recibo.gasPrice || recibo.effectiveGasPrice || 0n); } catch (_) {}
    if (tabla) metricas.porTabla[tabla] = (metricas.porTabla[tabla] || 0) + 1;
    return recibo;
  }
  function apuntarError(e, donde) {
    metricas.errores++;
    metricas.ultimoError = (donde ? donde + ': ' : '') + String((e && (e.shortMessage || e.message)) || e).slice(0, 200);
    metricas.ultimoErrorEn = new Date();
  }

  const _tablaLista = new Map();
  async function asegurarTabla(nombre) {
    const t = TABLAS[nombre];
    if (_tablaLista.get(nombre)) return true;
    const c = contrato();
    if (!c) return false;
    const st = await c.getTipoStats(t.tipo);
    if (st.exists ?? st[5]) { _tablaLista.set(nombre, true); return true; }
    await enviar('tabla ' + t.tipo, (o) => c.setLimit(t.tipo, t.limit, t.porFactura, o), (o) => c.setLimit.estimateGas(t.tipo, t.limit, t.porFactura, o), nombre);
    log.log('🧾 Tabla de la cuenta creada en la cadena: ' + t.tipo);
    _tablaLista.set(nombre, true);
    _tablasVistas.en = 0;                          // el panel la ve ya, sin esperar su caché
    return true;
  }

  function factura(raw) {
    return { id: BigInt(raw.id), manualId: String(raw.manualId), owner: String(raw.owner).toLowerCase(), tipo: String(raw.tipo),
             cantidad: BigInt(raw.cantidad), active: !!raw.active, creada: Number(raw.createdAt || 0) };
  }
  async function facturasDe(dir) {
    const c = contrato();
    const snap = await c.getUserInventorySnapshot(dir);
    return snap.map(factura).filter((f) => f.active && f.tipo.startsWith(PREFIJO));
  }
  async function porManual(mid) {
    const c = contrato();
    const r = await c.getInvoiceByManualIdSafe(mid);
    const encontrada = r.found ?? r[1];
    return encontrada ? factura(r.inv ?? r[0]) : null;
  }

  // ── LO QUE DICE MONGO DE UN JUGADOR ──────────────────────────────────────
  let _temporada = { v: 0, en: 0 };
  async function temporada() {
    if (ahora() - _temporada.en < 60000) return _temporada.v;
    try { _temporada = { v: d.temporadaActual ? Number(await d.temporadaActual()) || 0 : 0, en: ahora() }; } catch (_) {}
    return _temporada.v;
  }
  async function deMongo(playerName) {
    const gp = await M.GamePlayer.findOne({ playerName })
      .select('playerName address tutorial tutorialCompletedAt misiones petWins petBattles ' +
              HABILIDADES.map((h) => h + ' ' + h + '_exp').join(' ')).lean();
    if (!gp || !dirValida(gp.address)) return null;
    const dir = dirMin(gp.address);
    const [mp, temp, amistad, act, cons] = await Promise.all([
      M.MissionsPlayer ? M.MissionsPlayer.findOne({ playerName }).lean() : null,
      temporada(),
      M.Amistad ? M.Amistad.findOne({ playerName }).lean() : null,
      M.UserActivity ? M.UserActivity.findOne({ playerName }).select('codigoInvitacion invitadoPor').lean() : null,
      M.Construccion ? M.Construccion.find({ address: dir, devolucionPendiente: { $ne: true } }).lean() : []
    ]);
    const score = (M.BattleScore && temp) ? await M.BattleScore.findOne({ seasonNumber: temp, playerName }).lean() : null;
    const nombresAmigos = (amistad && Array.isArray(amistad.amigos) ? amistad.amigos : []).map((a) => a && a.playerName).filter(Boolean);
    const otros = new Set(nombresAmigos);
    if (act && act.invitadoPor) otros.add(act.invitadoPor);
    const fichas = otros.size ? await M.GamePlayer.find({ playerName: { $in: [...otros] } }).select('playerName address').lean() : [];
    const dirDe = new Map(fichas.filter((f) => dirValida(f.address)).map((f) => [f.playerName, dirMin(f.address)]));
    return { gp, dir, mp, temp, score, amistad, act, cons: cons || [], dirDe,
             amigos: nombresAmigos.map((n) => dirDe.get(n)).filter(Boolean),
             invitadoPorDir: act && act.invitadoPor ? dirDe.get(act.invitadoPor) || null : null };
  }

  function valoresMongo(m) {
    const gp = m.gp;
    const hab = {};
    for (const h of HABILIDADES) hab[h] = Math.max(0, Math.floor(Number(gp[h + '_exp']) || 0));
    const mp = m.mp || {};
    const mis = { completadas: mp.misionesCompletadas, granjero: mp.misiones_granjero, guardian: mp.misiones_guardian,
                  total: gp.misiones, enProgreso: mp.misionesEnProgreso, fallidas: mp.misionesFallidas,
                  estado: mp.estadomision, estado1: mp.estadomision1 };
    const s = m.score || {};
    const rk = { temporada: m.temp, puntos: s.points, victorias: s.wins, derrotas: s.losses, batallas: s.battles,
                 mejorRacha: s.bestStreak, racha: s.streak, petWins: gp.petWins, petBattles: gp.petBattles };
    return { tutorial: { paso: Number(gp.tutorial) || 0, terminadoEn: gp.tutorialCompletedAt || null }, habilidades: hab, misiones: mis, ranking: rk };
  }

  const POLITICAS = {
    habilidades: {},
    misiones: { enProgreso: 'mongo', estado: 'mongo', estado1: 'mongo' },
    ranking: { racha: 'mongo' }
  };

  /** Lo de Mongo y lo de la cadena, juntos sin perder nada (ver "LA CADENA NUNCA PISA…"). */
  function fundir(tabla, mongo, cadenaValor, m) {
    if (tabla === 'tutorial') {
      const c = cadenaValor === null ? { paso: 0, terminadoEn: null } : desempaquetarTutorial(cadenaValor);
      const fechas = [mongo.terminadoEn, c.terminadoEn].filter(Boolean).map((x) => new Date(x).getTime());
      return { paso: Math.max(mongo.paso, c.paso), terminadoEn: fechas.length ? new Date(Math.min(...fechas)) : null };
    }
    const f = FORMATOS[tabla];
    const c = cadenaValor === null ? null : desempaquetar(f, cadenaValor);
    if (!c) return { ...mongo };
    if (tabla === 'ranking') {
      const r = {};
      // Otra temporada en la cadena: de ella solo vale lo de por vida.
      const misma = c.temporada === (Number(mongo.temporada) || 0);
      for (const [k] of f) {
        const mv = Number(mongo[k]) || 0, cv = Number(c[k]) || 0;
        if (k === 'petWins' || k === 'petBattles') r[k] = Math.max(mv, cv);
        else if (k === 'temporada') r[k] = Number(mongo.temporada) || cv;
        else if (!misma) r[k] = mv;
        else r[k] = k === 'racha' ? (m.score ? mv : cv) : Math.max(mv, cv);
      }
      return r;
    }
    const hayDoc = tabla === 'misiones' ? !!m.mp : true;
    return fusionar(f, mongo, c, POLITICAS[tabla] || {}, hayDoc);
  }
  function valorCadena(tabla, v) {
    return tabla === 'tutorial' ? empaquetarTutorial(v.paso, v.terminadoEn) : empaquetar(FORMATOS[tabla], v);
  }

  /** Lo que la fusión trae de la cadena y Mongo no tenía: se escribe en Mongo. */
  async function reponerEnMongo(tabla, m, v) {
    const pn = m.gp.playerName;
    if (tabla === 'tutorial') {
      const cambios = { $max: { tutorial: v.paso } };
      if (v.terminadoEn && !m.gp.tutorialCompletedAt) cambios.$set = { tutorialCompletedAt: v.terminadoEn };
      const r = await M.GamePlayer.updateOne({ playerName: pn }, cambios);
      return r.modifiedCount || 0;
    }
    if (tabla === 'habilidades') {
      const max = {};
      for (const h of HABILIDADES) {
        if ((Number(m.gp[h + '_exp']) || 0) < v[h]) {
          max[h + '_exp'] = v[h];
          max[h] = Math.max(1, d.nivelPorExperiencia ? d.nivelPorExperiencia(v[h]) : 0);
        }
      }
      if (!Object.keys(max).length) return 0;
      return (await M.GamePlayer.updateOne({ playerName: pn }, { $max: max })).modifiedCount || 0;
    }
    if (tabla === 'misiones') {
      let n = 0;
      if (M.MissionsPlayer) {
        const r = await M.MissionsPlayer.updateOne({ playerName: pn },
          { $max: { misionesCompletadas: v.completadas, misiones_granjero: v.granjero, misiones_guardian: v.guardian, misionesFallidas: v.fallidas },
            $setOnInsert: { misionesEnProgreso: v.enProgreso, estadomision: v.estado, estadomision1: v.estado1 } }, { upsert: true });
        n += (r.modifiedCount || 0) + (r.upsertedCount || 0);
      }
      if ((Number(m.gp.misiones) || 0) < v.total) n += (await M.GamePlayer.updateOne({ playerName: pn }, { $max: { misiones: v.total } })).modifiedCount || 0;
      return n;
    }
    if (tabla === 'ranking') {
      let n = 0;
      const pv = {};
      if ((Number(m.gp.petWins) || 0) < v.petWins) pv.petWins = v.petWins;
      if ((Number(m.gp.petBattles) || 0) < v.petBattles) pv.petBattles = v.petBattles;
      if (Object.keys(pv).length) n += (await M.GamePlayer.updateOne({ playerName: pn }, { $max: pv })).modifiedCount || 0;
      if (M.BattleScore && v.temporada && v.temporada === m.temp && (v.puntos || v.victorias || v.batallas)) {
        const r = await M.BattleScore.updateOne({ seasonNumber: v.temporada, playerName: pn },
          { $max: { points: v.puntos, wins: v.victorias, losses: v.derrotas, battles: v.batallas, bestStreak: v.mejorRacha },
            $setOnInsert: { address: m.dir, streak: v.racha } }, { upsert: true });
        n += (r.modifiedCount || 0) + (r.upsertedCount || 0);
      }
      return n;
    }
    return 0;
  }

  /** Las relaciones que Mongo dice que este jugador tiene: manualId → { dueño, cantidad }. */
  function relacionesDeseadas(m) {
    const out = { amigos: new Map(), invitados: new Map(), lands: new Map() };
    for (const otro of m.amigos) if (otro !== m.dir) out.amigos.set(MANUAL.amigo(m.dir, otro), { dueno: m.dir, cantidad: 1n });
    if (m.act && m.act.codigoInvitacion) out.invitados.set(MANUAL.codigo(m.act.codigoInvitacion), { dueno: m.dir, cantidad: 1n });
    if (m.invitadoPorDir) out.invitados.set(MANUAL.invitado(m.dir), { dueno: m.invitadoPorDir, cantidad: 1n });
    for (const c of m.cons) {
      if (c.invoiceId) continue;                       // ya tiene su factura (parcelas: cons_parcelas)
      out.lands.set(MANUAL.land(c, m.dir), { dueno: m.dir, cantidad: cantidadLand(c) });
    }
    return out;
  }

  // ── SINCRONIZAR UN JUGADOR ───────────────────────────────────────────────
  /**
   * Lleva a la cadena lo que cambió y trae a Mongo lo que la cadena tenía de más.
   * opciones: { forzar: true } se salta los intervalos mínimos (el panel).
   * Devuelve { ok, escritas: [...], repuestas: {...}, aplazadas: [...] }.
   */
  async function sincronizarJugador(playerName, opciones = {}) {
    const c = contrato();
    if (!c) return { ok: false, motivo: 'sin_contrato' };
    const m = await deMongo(playerName);
    if (!m) return { ok: false, motivo: 'sin_jugador' };
    const est = (await Estado.findById(playerName).lean()) || { firmas: {}, escritos: {}, escritoEn: {} };
    const firmas = { ...(est.firmas || {}) }, escritos = { ...(est.escritos || {}) }, escritoEn = { ...(est.escritoEn || {}) };
    const vm = valoresMongo(m);
    const deseadas = relacionesDeseadas(m);
    const firmaDeseada = {};
    for (const t of EMPAQUETADAS) firmaDeseada[t] = firma(crypto, normalizar(t, vm[t]));
    for (const t of RELACIONES) firmaDeseada[t] = firma(crypto, [...deseadas[t].entries()].sort());
    const cambiadas = [...EMPAQUETADAS, ...RELACIONES].filter((t) => firmas[t] !== firmaDeseada[t] || opciones.forzar);
    const res = { ok: true, escritas: [], repuestas: {}, aplazadas: [], address: m.dir };
    if (!cambiadas.length) return res;

    let mias;
    try { mias = await facturasDe(m.dir); }
    catch (e) { apuntarError(e, 'snapshot ' + playerName); return { ok: false, motivo: 'snapshot' }; }
    const porMid = new Map(mias.map((f) => [f.manualId, f]));
    let vence = null;

    for (const t of EMPAQUETADAS) {
      if (!cambiadas.includes(t)) continue;
      try {
        const mid = MANUAL[t](m.dir);
        const enCadena = porMid.get(mid) || null;
        const fundido = fundir(t, vm[t], enCadena ? enCadena.cantidad : null, m);
        // 1) Lo que la cadena tenía de más vuelve a Mongo.
        const repuesto = enCadena ? await reponerEnMongo(t, m, fundido) : 0;
        if (repuesto) { res.repuestas[t] = repuesto; metricas.restaurados += repuesto; }
        // 2) Lo que Mongo tiene de más va a la cadena (con el freno de la tabla).
        const quiero = valorCadena(t, fundido);
        const tengo = enCadena ? enCadena.cantidad : null;
        const firmaFundida = firma(crypto, normalizar(t, fundido));
        if (tengo === quiero || (tengo === null && vacio(t, fundido))) { firmas[t] = firmaFundida; continue; }
        const minimo = Number(cfg.minimoMs[t]) || 0;
        const ultima = Number(escritoEn[t]) || 0;
        if (!opciones.forzar && tengo !== null && minimo && ahora() - ultima < minimo) {
          const v = new Date(ultima + minimo);
          if (!vence || v < vence) vence = v;
          res.aplazadas.push(t);
          continue;
        }
        if (!await asegurarTabla(t)) throw new Error('tabla_no_disponible');
        const tipo = TABLAS[t].tipo;
        if (tengo === null) {
          await enviar(t + ' crear', (o) => c.createInvoice(m.dir, tipo, quiero, mid, o), (o) => c.createInvoice.estimateGas(m.dir, tipo, quiero, mid, o), t);
        } else if (quiero > tengo) {
          await enviar(t + ' subir', (o) => c.increaseInvoiceQuantity(enCadena.id, quiero - tengo, o), (o) => c.increaseInvoiceQuantity.estimateGas(enCadena.id, quiero - tengo, o), t);
        } else {
          await enviar(t + ' bajar', (o) => c.decreaseInvoiceQuantity(enCadena.id, tengo - quiero, o), (o) => c.decreaseInvoiceQuantity.estimateGas(enCadena.id, tengo - quiero, o), t);
        }
        escritoEn[t] = ahora();
        firmas[t] = firmaFundida;
        res.escritas.push(t);
      } catch (e) { apuntarError(e, t + ' ' + playerName); res.ok = false; }
    }

    // Relaciones: se crean las que faltan y se queman las que ya no están.
    for (const t of RELACIONES) {
      if (!cambiadas.includes(t)) continue;
      try {
        const quiero = deseadas[t];
        const antes = new Set(Array.isArray(escritos[t]) ? escritos[t] : []);
        // Lo que este jugador tiene en la cadena de esa tabla también cuenta (por si el estado se perdió).
        for (const f of mias) if (f.tipo === TABLAS[t].tipo) antes.add(f.manualId);
        const confirmados = new Set();
        let alguna = false;
        for (const [mid, r] of quiero) {
          let f = porMid.get(mid);
          if (!f && r.dueno !== m.dir) f = await porManual(mid);          // la de otro dueño (iv:)
          if (f && f.active) { confirmados.add(mid); continue; }
          if (!dirValida(r.dueno)) continue;
          if (!alguna) { if (!await asegurarTabla(t)) throw new Error('tabla_no_disponible'); alguna = true; }
          await enviar(t + ' alta', (o) => c.createInvoice(r.dueno, TABLAS[t].tipo, r.cantidad, mid, o), (o) => c.createInvoice.estimateGas(r.dueno, TABLAS[t].tipo, r.cantidad, mid, o), t);
          confirmados.add(mid);
          res.escritas.push(t + ':' + mid.slice(0, 3));
        }
        for (const mid of antes) {
          if (quiero.has(mid)) continue;
          const f = porMid.get(mid) || await porManual(mid);
          if (!f || !f.active || f.tipo !== TABLAS[t].tipo) continue;
          // Solo lo que es de este jugador: las suyas, o la marca iv: de SU invitación.
          const leido = leerManual(mid);
          const suya = f.owner === m.dir || (leido && leido.invitado === m.dir);
          if (!suya) continue;
          await enviar(t + ' baja', (o) => c.decreaseInvoiceQuantity(f.id, f.cantidad, o), (o) => c.decreaseInvoiceQuantity.estimateGas(f.id, f.cantidad, o), t);
          res.escritas.push(t + ':-' + mid.slice(0, 3));
        }
        escritos[t] = [...confirmados];
        firmas[t] = firmaDeseada[t];
      } catch (e) { apuntarError(e, t + ' ' + playerName); res.ok = false; }
    }

    await Estado.updateOne({ _id: playerName }, { $set: { address: m.dir, firmas, escritos, escritoEn, vence, error: res.ok ? '' : metricas.ultimoError,
      actualizado: new Date() } }, { upsert: true });
    return res;
  }

  // ── RECUPERAR UN JUGADOR DESDE LA CADENA ─────────────────────────────────
  /**
   * Trae a Mongo lo que la cadena tiene y Mongo no (nunca pisa lo más nuevo).
   * Las relaciones solo se reponen si Mongo no tenía NADA de ese tipo.
   * `facturas` (opcional) = las del escaneo general, para no volver a leer.
   */
  async function restaurarJugador(playerName, opciones = {}) {
    const m = await deMongo(playerName);
    if (!m) return { ok: false, motivo: 'sin_jugador' };
    const mias = opciones.facturas || await facturasDe(m.dir);
    const porMid = new Map(mias.map((f) => [f.manualId, f]));
    const out = { ok: true, repuestas: {} };
    const vm = valoresMongo(m);
    for (const t of EMPAQUETADAS) {
      const f = porMid.get(MANUAL[t](m.dir));
      if (!f) continue;
      const n = await reponerEnMongo(t, m, fundir(t, vm[t], f.cantidad, m));
      if (n) out.repuestas[t] = n;
    }
    // Amigos: solo si su lista está vacía, y solo los que TAMBIÉN tienen su lado en la cadena.
    if (M.Amistad && !(m.amistad && Array.isArray(m.amistad.amigos) && m.amistad.amigos.length)) {
      const nuevos = [];
      for (const f of mias) {
        const l = f.tipo === TABLAS.amigos.tipo ? leerManual(f.manualId) : null;
        if (!l || l.yo !== m.dir) continue;
        const otroLado = opciones.lados ? opciones.lados.has(MANUAL.amigo(l.otro, l.yo)) : !!(await porManual(MANUAL.amigo(l.otro, l.yo)).catch(() => null));
        if (!otroLado) continue;
        const ficha = await M.GamePlayer.findOne({ address: l.otro }).select('playerName').lean();
        nuevos.push({ playerName: ficha ? ficha.playerName : l.otro, desde: new Date() });
      }
      if (nuevos.length) {
        await M.Amistad.updateOne({ playerName }, { $setOnInsert: { playerName }, $addToSet: { amigos: { $each: nuevos } } }, { upsert: true });
        out.repuestas.amigos = nuevos.length;
      }
    }
    // Invitaciones: su código, quién le invitó y a quién invitó.
    if (M.UserActivity) {
      const act = m.act || {};
      const cod = mias.find((f) => f.tipo === TABLAS.invitados.tipo && f.manualId.startsWith('ic:'));
      if (cod && !act.codigoInvitacion) {
        try { await M.UserActivity.updateOne({ playerName, codigoInvitacion: null }, { $set: { codigoInvitacion: cod.manualId.slice(3) } }, { upsert: true }); out.repuestas.codigo = 1; } catch (_) {}
      }
      if (!act.invitadoPor) {
        const marca = opciones.invitadoPor !== undefined ? opciones.invitadoPor : await porManual(MANUAL.invitado(m.dir)).catch(() => null);
        if (marca && marca.owner && marca.owner !== m.dir) {
          const quien = await M.GamePlayer.findOne({ address: marca.owner }).select('playerName').lean();
          await M.UserActivity.updateOne({ playerName, invitadoPor: null }, { $set: { invitadoPor: quien ? quien.playerName : marca.owner } }, { upsert: true });
          out.repuestas.invitadoPor = 1;
        }
      }
    }
    // Lo construido en la isla: si no tiene ninguna construcción de las de solo-Mongo.
    if (M.Construccion && !m.cons.some((c) => !c.invoiceId)) {
      let n = 0;
      for (const f of mias) {
        const l = f.tipo === TABLAS.lands.tipo ? leerManual(f.manualId) : null;
        if (!l || l.dir !== m.dir) continue;
        const dim = leerCantidadLand(f.cantidad);
        try {
          const r = await M.Construccion.updateOne({ address: m.dir, tipo: l.tipo, gx: l.gx, gy: l.gy },
            { $setOnInsert: { playerName, ancho: dim.ancho || 2, alto: dim.alto || 2, escala: dim.escala || 2, invoiceId: null, manualId: null } }, { upsert: true });
          n += r.upsertedCount || 0;
        } catch (_) {}
      }
      if (n) out.repuestas.lands = n;
    }
    // (2026-11-25) Si algo volvió de la cadena, la cuenta ya existía: recupera su fecha.
    if (Object.keys(out.repuestas).length) await fechaOriginal(playerName, masAntigua(mias));
    metricas.restaurados += Object.values(out.repuestas).reduce((a, b) => a + b, 0);
    return out;
  }

  /** (2026-11-25) Una cuenta que vuelve de la cadena CONSERVA SU FECHA. Mongoose pone
      createdAt = ahora en todo upsert (y se come el createdAt de la ficha anclada): los
      contadores la contarían otra vez como cuenta nueva y el panel, como "nueva en 24 h".
      Solo la lleva hacia atrás, nunca hacia delante. */
  async function fechaOriginal(playerName, fecha) {
    const t = fecha instanceof Date ? fecha.getTime() : typeof fecha === 'number' ? fecha : Date.parse(fecha);
    if (!playerName || !Number.isFinite(t) || t <= 0 || t > ahora()) return false;
    try {
      const r = await M.GamePlayer.collection.updateOne({ playerName, createdAt: { $gt: new Date(t) } }, { $set: { createdAt: new Date(t) } });
      return !!(r && r.modifiedCount);
    } catch (_) { return false; }
  }

  /** Para /api/load: una cuenta que parece recién creada mira primero la cadena.
   *  (Una vez cada 10 minutos por jugador: una cuenta nueva no lee la cadena en cada carga.) */
  const _miradoVacio = new Map();
  async function restaurarSiVacio(playerName) {
    if (!contrato()) return { ok: false, motivo: 'sin_contrato' };
    const gp = await M.GamePlayer.findOne({ playerName }).select('tutorial').lean();
    if (!gp) return { ok: false, motivo: 'sin_jugador' };
    /* (2026-11-20) Basta con el tutorial a 0: contra el server2.js de verdad, una cuenta con
       algo de minería y el tutorial perdido no miraba la cadena y lo volvía a empezar. */
    if (Number(gp.tutorial) > 0) return { ok: true, nada: true };
    const visto = _miradoVacio.get(playerName) || 0;
    if (ahora() - visto < 10 * 60000) return { ok: true, nada: true, reciente: true };
    const r = await restaurarJugador(playerName);
    // Solo se recuerda "no había nada"; si algo volvió, la próxima carga ya trae el tutorial.
    if (!r || !r.repuestas || !Object.keys(r.repuestas).length) {
      if (_miradoVacio.size > 5000) _miradoVacio.clear();
      _miradoVacio.set(playerName, ahora());
    }
    return r;
  }

  // ── EL ANCLA CIFRADA ─────────────────────────────────────────────────────
  function claveAncla() {
    try {
      const k = d.claveRespaldo && d.claveRespaldo();
      return k ? claveDerivada(crypto, k) : null;
    } catch (_) { return null; }
  }

  async function cabeza(crear) {
    const c = contrato();
    let f = await porManual(MANUAL.cabeza());
    if (f || !crear) return f;
    if (!await asegurarTabla('respaldo')) return null;
    const w = d.wallet();
    await enviar('cabeza', (o) => c.createInvoice(w.address, TABLAS.respaldo.tipo, 1n, MANUAL.cabeza(), o),
      (o) => c.createInvoice.estimateGas(w.address, TABLAS.respaldo.tipo, 1n, MANUAL.cabeza(), o), 'respaldo');
    return porManual(MANUAL.cabeza());
  }

  const CAMPOS_FICHA = ['playerName', 'address', 'Username', 'petName', 'nameColor', 'petNameColor', 'lenguaje', 'nivel_exp',
    'petExp', 'petLevel', 'petMode', 'arenaSkill', 'arenaGames', 'deathCount', 'isGhost', 'misiones', 'tutorial', 'tutorialCompletedAt',
    ...HABILIDADES, ...HABILIDADES.map((h) => h + '_exp'), 'petWins', 'petBattles', 'createdAt'];

  /** Junta lo que hay que anclar desde el último lote. */
  async function prepararLote(g) {
    const lote = { v: 1, t: new Date().toISOString(), dms: [], carteras: [], cuentas: [] };
    const firmasNuevas = [];
    let bytes = 0;
    const cabe = (x) => { const n = Buffer.byteLength(JSON.stringify(x)); if (bytes + n > ANCLA_MAX * 3) return false; bytes += n; return true; };
    // Los privados, en orden, cuando ya no se pueden editar (5 min + margen).
    if (M.MensajePrivado) {
      const filtro = { ts: { $lt: new Date(ahora() - 6 * 60000) } };
      if (g.dmsDesde) filtro._id = { $gt: new mongoose.Types.ObjectId(g.dmsDesde) };
      const dms = await M.MensajePrivado.find(filtro).sort({ _id: 1 }).limit(400).lean();
      for (const x of dms) {
        const o = { id: String(x._id), de: x.de, para: x.para, n: x.deNombre, x: x.texto, ts: x.ts, l: !!x.leido, e: !!x.editado,
                    re: x.re || null, r: x.reacciones || [], o: x.ocultoPara || [] };
        if (!cabe(o)) break;
        lote.dms.push(o);
      }
    }
    // La cartera del inicio con Google (social_wallets), solo si cambió lo que importa.
    let carterasHasta = g.carterasDesde || null;
    try {
      const col = mongoose.connection.collection('social_wallets');
      const filtroW = g.carterasDesde ? { updatedAt: { $gt: new Date(g.carterasDesde) } } : {};
      const docs = await col.find(filtroW).sort({ updatedAt: 1 }).limit(300).toArray();
      for (const w of docs) {
        if (w.updatedAt) carterasHasta = new Date(w.updatedAt).toISOString();
        const limpio = { ...w, _id: String(w._id) };
        const fijo = { ...limpio, updatedAt: undefined, deviceShares: (limpio.deviceShares || []).map((s) => ({ ...s, lastUsedAt: undefined })) };
        const f = firma(crypto, fijo);
        const ya = await FirmaAncla.findById('cartera:' + limpio._id).lean();
        if (ya && ya.firma === f) continue;
        if (!cabe(limpio)) { carterasHasta = g.carterasDesde || null; break; }
        lote.carteras.push(limpio);
        firmasNuevas.push(['cartera:' + limpio._id, f]);
      }
    } catch (_) { /* sin la colección (servidor sin el SDK): nada que anclar */ }
    lote._carterasHasta = carterasHasta;
    // La ficha de cada cuenta que cambió (sin la posición: cambia a cada paso).
    if (M.GamePlayer) {
      const desde = g.fichasDesde ? new Date(g.fichasDesde) : new Date(0);
      const gps = await M.GamePlayer.find({ updatedAt: { $gt: desde } }).sort({ updatedAt: 1 }).limit(300).select(CAMPOS_FICHA.join(' ') + ' updatedAt').lean();
      let hasta = null;
      for (const gp of gps) {
        const ficha = {};
        for (const k of CAMPOS_FICHA) if (gp[k] !== undefined) ficha[k] = gp[k];
        const [amistad, act] = await Promise.all([
          M.Amistad ? M.Amistad.findOne({ playerName: gp.playerName }).select('limpiezaDM').lean() : null,
          M.UserActivity ? M.UserActivity.findOne({ playerName: gp.playerName }).select('discord codigoInvitacion invitadoPor').lean() : null
        ]);
        if (amistad) ficha.limpiezaDM = amistad.limpiezaDM;
        if (act) { ficha.discord = act.discord; ficha.codigoInvitacion = act.codigoInvitacion; ficha.invitadoPor = act.invitadoPor; }
        if (M.Construccion && gp.address) {
          const cofres = await M.Construccion.find({ address: dirMin(gp.address), 'contenido.0': { $exists: true } }).select('tipo gx gy contenido').lean();
          if (cofres.length) ficha.cofres = cofres.map((c) => ({ tipo: c.tipo, gx: c.gx, gy: c.gy, contenido: c.contenido }));
        }
        const f = firma(crypto, ficha);
        hasta = gp.updatedAt;
        const ya = await FirmaAncla.findById('cuenta:' + gp.playerName).lean();
        if (ya && ya.firma === f) continue;
        if (!cabe(ficha)) { hasta = null; break; }
        lote.cuentas.push(ficha);
        firmasNuevas.push(['cuenta:' + gp.playerName, f]);
      }
      lote._fichasHasta = hasta ? new Date(hasta).toISOString() : (g.fichasDesde || null);
    }
    return { lote, firmasNuevas };
  }

  /** Manda un lote si hay algo. Devuelve { ok, enviado, hash, bytes } */
  async function anclar(opciones = {}) {
    const clave = claveAncla();
    if (!clave) return { ok: false, motivo: 'sin_clave' };
    const c = contrato(), w = d.wallet();
    if (!c || !w) return { ok: false, motivo: 'sin_contrato' };
    const g = await leerGlobal();
    const { lote, firmasNuevas } = await prepararLote(g);
    const fichasHasta = lote._fichasHasta; delete lote._fichasHasta;
    const carterasHasta = lote._carterasHasta; delete lote._carterasHasta;
    if (!lote.dms.length && !lote.carteras.length && !lote.cuentas.length) {
      const avanza = {};
      if (fichasHasta && fichasHasta !== g.fichasDesde) avanza.fichasDesde = fichasHasta;
      if (carterasHasta && carterasHasta !== g.carterasDesde) avanza.carterasDesde = carterasHasta;
      if (Object.keys(avanza).length) await guardarGlobal(avanza);
      return { ok: true, enviado: false };
    }
    const h = await cabeza(true);
    if (!h) return { ok: false, motivo: 'sin_cabeza' };
    lote.prev = g.ultimoLote || null;              // { hash, bloque }
    const carga = cifrarLote(crypto, zlib, clave, lote);
    if (carga.length > ANCLA_MAX) {
      // Lo que se junta tiene tope (prepararLote), así que esto no debería pasar; si pasa, se avisa.
      apuntarError(new Error('lote_grande ' + carga.length), 'ancla');
    }
    /* La cabeza guarda un bloque que está ANTES del último lote (o en él): el del lote
       anterior; en el primero, el bloque de ahora. Así, para encontrar el último basta
       buscar desde ahí hacia adelante. */
    const w0 = d.wallet();
    const prov0 = d.proveedor ? d.proveedor() : w0.provider;
    const objetivo = lote.prev && Number(lote.prev.bloque) ? BigInt(lote.prev.bloque) : BigInt(await prov0.getBlockNumber());
    const delta = objetivo > h.cantidad ? objetivo - h.cantidad : 1n;
    const llamada = c.interface.encodeFunctionData('increaseInvoiceQuantity', [h.id, delta]);
    const data = llamada + carga.toString('hex');
    const to = await c.getAddress();
    const recibo = await enviar('ancla', (o) => w.sendTransaction({ to, data, gasPrice: o.gasPrice, gasLimit: o.gasLimit, nonce: o.nonce }),
      (o) => w.estimateGas({ to, data, gasPrice: o.gasPrice }), 'respaldo');
    const hash = recibo.hash || recibo.transactionHash;
    const ultimoLote = { hash, bloque: Number(recibo.blockNumber) };
    const cambios = { ultimoLote, lotes: (Number(g.lotes) || 0) + 1, bytes: (Number(g.bytes) || 0) + carga.length };
    if (lote.dms.length) cambios.dmsDesde = lote.dms[lote.dms.length - 1].id;
    if (fichasHasta) cambios.fichasDesde = fichasHasta;
    if (carterasHasta) cambios.carterasDesde = carterasHasta;
    await guardarGlobal(cambios);
    for (const [id, f] of firmasNuevas) await FirmaAncla.updateOne({ _id: id }, { $set: { firma: f, en: new Date() } }, { upsert: true });
    metricas.lotes++; metricas.bytesAncla += carga.length;
    ultimoAncla = ahora();
    log.log(`⚓ Ancla de respaldo: ${lote.dms.length} privados, ${lote.carteras.length} carteras, ${lote.cuentas.length} fichas · ${carga.length} bytes · ${hash}`);
    return { ok: true, enviado: true, hash, bytes: carga.length, dms: lote.dms.length, carteras: lote.carteras.length, cuentas: lote.cuentas.length };
  }

  /** Recorre los lotes desde el último hacia atrás. Devuelve la lista (del más viejo al más nuevo). */
  async function leerAnclas(opciones = {}) {
    const clave = claveAncla();
    if (!clave) throw new Error('sin_clave');
    const c = contrato(), w = d.wallet();
    const provider = d.proveedor ? d.proveedor() : w.provider;
    const h = await porManual(MANUAL.cabeza());
    if (!h) return [];
    const dir = await c.getAddress();
    const idTopic = ethers.zeroPadValue(ethers.toBeHex(h.id), 32);
    // El último lote está DESPUÉS del bloque que guarda la cabeza.
    const desde = Number(h.cantidad) > 1 ? Number(h.cantidad) : (Number(opciones.desdeBloque) || 0);
    // El número de bloque que da el proveedor puede venir de su caché (unos cientos de ms):
    // el último tramo se pide hasta 'latest' para no dejarse el lote recién mandado.
    const hasta = await provider.getBlockNumber();
    const PASO = Number(opciones.paso) || 20000;
    let ultimo = null;
    for (let a = desde; ; a += PASO) {
      const final = a + PASO - 1 >= hasta;
      const logs = await provider.getLogs({ address: dir, topics: [topicAumento, idTopic], fromBlock: a, toBlock: final ? 'latest' : a + PASO - 1 });
      if (logs.length) ultimo = logs[logs.length - 1].transactionHash;
      if (final) break;
    }
    const lotes = [];
    let hash = ultimo, vueltas = 0;
    const offset = 2 + (4 + 32 + 32) * 2;
    while (hash && vueltas++ < (Number(opciones.maxLotes) || 100000)) {
      const tx = await provider.getTransaction(hash);
      if (!tx || !tx.data || tx.data.length <= offset) break;
      let lote;
      try { lote = descifrarLote(crypto, zlib, clave, Buffer.from(tx.data.slice(offset), 'hex')); }
      catch (e) { apuntarError(e, 'ancla ' + hash); break; }
      lote._hash = hash;
      lotes.push(lote);
      hash = lote.prev && lote.prev.hash ? lote.prev.hash : null;
    }
    return lotes.reverse();
  }

  /** Aplica los lotes en Mongo SIN pisar nada que ya exista. */
  async function aplicarAnclas(lotes) {
    const out = { dms: 0, carteras: 0, cuentas: 0 };
    const cuentas = new Map(), carteras = new Map(), dms = new Map();
    for (const l of lotes) {
      for (const x of l.cuentas || []) if (x && x.playerName) cuentas.set(x.playerName, x);
      for (const x of l.carteras || []) if (x && x._id) carteras.set(x._id, x);
      for (const x of l.dms || []) if (x && x.id) dms.set(x.id, x);
    }
    for (const f of cuentas.values()) {
      if (!dirValida(f.address)) continue;
      const set = {};
      for (const k of CAMPOS_FICHA) if (f[k] !== undefined && k !== 'playerName') set[k] = f[k];
      const r = await M.GamePlayer.updateOne({ playerName: f.playerName }, { $setOnInsert: { ...set, playerName: f.playerName } }, { upsert: true });
      if (r.upsertedCount) out.cuentas++;
      // (2026-11-25) La ficha anclada trae la fecha de verdad; vale también si la cuenta ya había
      // vuelto por otro camino (al iniciar sesión, con la fecha de su primera factura). Solo atrás.
      if (f.createdAt) await fechaOriginal(f.playerName, f.createdAt);
      // Lo que no tenía (nombre aún '---', habilidades por debajo) se completa sin bajar nada.
      const max = {};
      for (const k of ['nivel_exp', 'petExp', 'misiones', 'petWins', 'petBattles', ...HABILIDADES, ...HABILIDADES.map((h) => h + '_exp')]) if (Number(f[k]) > 0) max[k] = Number(f[k]);
      if (Object.keys(max).length) await M.GamePlayer.updateOne({ playerName: f.playerName }, { $max: max });
      for (const campo of ['Username', 'petName']) {
        if (f[campo] && f[campo] !== '---') await M.GamePlayer.updateOne({ playerName: f.playerName, [campo]: '---' }, { $set: { [campo]: f[campo] } }).catch(() => {});
      }
      if (M.Amistad && f.limpiezaDM) await M.Amistad.updateOne({ playerName: f.playerName }, { $setOnInsert: { playerName: f.playerName, limpiezaDM: f.limpiezaDM } }, { upsert: true }).catch(() => {});
      if (M.UserActivity && (f.discord || f.codigoInvitacion || f.invitadoPor)) {
        const s = {};
        if (f.discord) s.discord = f.discord;
        await M.UserActivity.updateOne({ playerName: f.playerName }, { $setOnInsert: { playerName: f.playerName, ...s } }, { upsert: true }).catch(() => {});
        if (f.codigoInvitacion) await M.UserActivity.updateOne({ playerName: f.playerName, codigoInvitacion: null }, { $set: { codigoInvitacion: f.codigoInvitacion } }).catch(() => {});
        if (f.invitadoPor) await M.UserActivity.updateOne({ playerName: f.playerName, invitadoPor: null }, { $set: { invitadoPor: f.invitadoPor } }).catch(() => {});
      }
      if (M.Construccion && Array.isArray(f.cofres)) {
        for (const cf of f.cofres) {
          await M.Construccion.updateOne({ address: dirMin(f.address), tipo: cf.tipo, gx: cf.gx, gy: cf.gy, 'contenido.0': { $exists: false } },
            { $set: { contenido: cf.contenido } }).catch(() => {});
        }
      }
    }
    try {
      const col = mongoose.connection.collection('social_wallets');
      for (const w of carteras.values()) {
        const ya = await col.findOne({ _id: w._id }).catch(() => null) ||
                   (mongoose.Types.ObjectId.isValid(w._id) ? await col.findOne({ _id: new mongoose.Types.ObjectId(w._id) }) : null);
        if (ya) continue;
        const doc = { ...w };
        if (mongoose.Types.ObjectId.isValid(doc._id)) doc._id = new mongoose.Types.ObjectId(doc._id);
        for (const k of ['createdAt', 'updatedAt']) if (doc[k]) doc[k] = new Date(doc[k]);
        await col.insertOne(doc);
        out.carteras++;
      }
    } catch (e) { apuntarError(e, 'carteras'); }
    if (M.MensajePrivado) {
      for (const x of dms.values()) {
        const _id = mongoose.Types.ObjectId.isValid(x.id) ? new mongoose.Types.ObjectId(x.id) : null;
        if (!_id || await M.MensajePrivado.exists({ _id })) continue;
        await M.MensajePrivado.create({ _id, de: x.de, para: x.para, deNombre: x.n, texto: x.x, ts: new Date(x.ts), leido: x.l, editado: x.e,
          re: x.re || null, reacciones: x.r || [], ocultoPara: x.o || [] }).then(() => { out.dms++; }).catch(() => {});
      }
    }
    return out;
  }

  // ── LA RESTAURACIÓN GENERAL (después de un borrado) ──────────────────────
  async function escanearCadena(progreso) {
    const c = contrato();
    const total = Number(await c.totalInvoicesEver());
    const porDueno = new Map();     // dir → [facturas cta_]
    const lados = new Set();        // manualIds am: activos (para la regla de los dos lados)
    const invitados = new Map();    // dir invitado → factura iv:
    for (let a = 1; a <= total; a += 200) {
      const ids = [];
      for (let i = a; i < Math.min(total + 1, a + 200); i++) ids.push(i);
      const lote = await c.getInvoicesSafe(ids);
      for (const raw of lote) {
        const f = factura(raw);
        // La cabeza del ancla y los contadores son del relayer, no de un jugador.
        if (!f.active || !f.tipo.startsWith(PREFIJO) || f.tipo === TABLAS.respaldo.tipo || f.tipo === TABLAS.contadores.tipo) continue;
        (porDueno.get(f.owner) || porDueno.set(f.owner, []).get(f.owner)).push(f);
        if (f.tipo === TABLAS.amigos.tipo) lados.add(f.manualId);
        if (f.tipo === TABLAS.invitados.tipo && f.manualId.startsWith('iv:')) { const l = leerManual(f.manualId); if (l) invitados.set(l.invitado, f); }
      }
      if (progreso) await progreso(Math.min(total, a + 199), total);
      if (d.pausaEscaneoMs !== 0) await new Promise((r) => setTimeout(r, d.pausaEscaneoMs || 150));
    }
    return { total, porDueno, lados, invitados };
  }

  async function restaurarTodo(opciones = {}) {
    if (tarea && tarea.estado === 'en_curso') return tarea;
    tarea = { estado: 'en_curso', inicio: new Date(), fase: 'anclas', hechos: 0, total: 0, jugadores: 0, resultado: null, error: '' };
    (async () => {
      try {
        let anclas = { dms: 0, carteras: 0, cuentas: 0 };
        if (claveAncla()) {
          const lotes = await leerAnclas(opciones);
          tarea.lotes = lotes.length;
          anclas = await aplicarAnclas(lotes);
        }
        tarea.fase = 'facturas';
        const esc = await escanearCadena(async (h, t) => { tarea.hechos = h; tarea.total = t; });
        tarea.fase = 'jugadores';
        const resumen = { anclas, jugadores: 0, repuestas: 0 };
        for (const [dir, facturas] of esc.porDueno) {
          let gp = await M.GamePlayer.findOne({ address: dir }).select('playerName').lean();
          if (!gp) {
            // Sin ficha anclada: la cuenta nace como al iniciar sesión (playerName = dirección).
            await M.GamePlayer.updateOne({ playerName: dir }, { $setOnInsert: { playerName: dir, address: dir } }, { upsert: true });
            await fechaOriginal(dir, masAntigua(facturas));
            gp = { playerName: dir };
          }
          const r = await restaurarJugador(gp.playerName, { facturas, lados: esc.lados, invitadoPor: esc.invitados.get(dir) || null });
          resumen.jugadores++;
          resumen.repuestas += Object.values(r.repuestas || {}).reduce((a, b) => a + b, 0);
          tarea.jugadores = resumen.jugadores;
        }
        // Los invitados que no son dueños de nada siguen teniendo su marca iv:.
        for (const [dir, marca] of esc.invitados) {
          if (esc.porDueno.has(dir)) continue;
          const gp = await M.GamePlayer.findOne({ address: dir }).select('playerName').lean();
          if (gp) await restaurarJugador(gp.playerName, { facturas: [], lados: esc.lados, invitadoPor: marca });
        }
        tarea.resultado = resumen;
        tarea.estado = 'hecho';
      } catch (e) {
        tarea.estado = 'error';
        tarea.error = String((e && e.message) || e).slice(0, 300);
        apuntarError(e, 'restaurar todo');
      } finally { tarea.fin = new Date(); }
    })();
    return tarea;
  }

  // ── EL BARRIDO: quién cambió desde la última vuelta ──────────────────────
  /* Un cursor por colección (su updatedAt): cada vuelta sigue donde lo dejó la
     anterior, así un montón de cambios a la vez se reparte en varias vueltas y
     nadie se queda sin mirar. Las amistades marcan updatedAt en las DOS fichas. */
  const COLA_MAX = 600;
  async function cambiadosDesde(cursores) {
    const nombres = new Set();
    const nuevos = { ...cursores };
    const lim = Math.max(1, Math.min(Number(cfg.jugadoresPorCiclo) || 40, COLA_MAX - cola.length));
    const mira = async (clave, Modelo) => {
      if (!Modelo) return;
      try {
        const desde = cursores[clave] ? new Date(cursores[clave]) : new Date(0);
        const docs = await Modelo.find({ updatedAt: { $gt: desde } }).sort({ updatedAt: 1 }).limit(lim).select('playerName updatedAt').lean();
        for (const x of docs) if (x.playerName) nombres.add(x.playerName);
        if (docs.length) nuevos[clave] = new Date(docs[docs.length - 1].updatedAt).toISOString();
      } catch (_) {}
    };
    await mira('GamePlayer', M.GamePlayer);
    await mira('MissionsPlayer', M.MissionsPlayer);
    await mira('BattleScore', M.BattleScore);
    await mira('Amistad', M.Amistad);
    await mira('UserActivity', M.UserActivity);
    await mira('Construccion', M.Construccion);
    const aplazados = await Estado.find({ vence: { $ne: null, $lte: new Date(ahora()) }, _id: { $ne: '__global' } }).limit(lim).select('_id').lean();
    for (const a of aplazados) nombres.add(a._id);
    return { nombres: [...nombres], cursores: nuevos };
  }

  function programar(playerName) {
    if (!playerName || playerName === '---' || enCola.has(playerName)) return;
    enCola.add(playerName);
    cola.push(playerName);
    procesar();
  }

  async function procesar() {
    if (trabajando || detenido) return;
    trabajando = true;
    try {
      while (cola.length && !detenido && cfg.activo) {
        const pn = cola.shift();
        enCola.delete(pn);
        try { await sincronizarJugador(pn); }
        catch (e) { apuntarError(e, 'sincronizar ' + pn); }
      }
    } finally { trabajando = false; }
  }

  async function ciclo() {
    if (detenido) return;
    try {
      await cargarConfig();
      // (2026-11-25) Los contadores van aparte del respaldo de las cuentas: se pausan solos.
      if (cfg.contadoresActivos !== false && contrato() && ahora() - ultimoContadores >= cadaMsContadores()) {
        ultimoContadores = ahora();
        await escribirContadores().catch((e) => apuntarError(e, 'contadores'));
      }
      if (!cfg.activo || !contrato()) return;
      const g = await leerGlobal();
      if (cola.length < COLA_MAX) {
        const { nombres, cursores } = await cambiadosDesde(g.cursores || {});
        for (const n of nombres) programar(n);
        await guardarGlobal({ cursores });
      }
      metricas.ciclos++; metricas.ultimoCiclo = new Date();
      if (cfg.anclaActiva && ahora() - ultimoAncla >= (Number(cfg.anclaCadaMs) || 600000)) {
        ultimoAncla = ahora();
        await anclar().catch((e) => apuntarError(e, 'ancla'));
      }
    } catch (e) { apuntarError(e, 'ciclo'); }
  }

  function arrancar(retrasoMs = 30000) {
    detenido = false;
    if (temporizador) return;
    const vuelta = async () => {
      await ciclo();
      if (!detenido) { temporizador = setTimeout(vuelta, Math.max(30000, Number(cfg.cicloMs) || 120000)); if (temporizador.unref) temporizador.unref(); }
    };
    temporizador = setTimeout(vuelta, retrasoMs);
    if (temporizador.unref) temporizador.unref();
  }
  function detener() { detenido = true; if (temporizador) { clearTimeout(temporizador); temporizador = null; } }

  // ── LOS CONTADORES DEL CONTRATO (2026-11-25) ─────────────────────────────
  /* "En control-center.html las tx o las minadas deben guardarse en el contrato
      mismo, no en la base de datos; así mismo las cuentas creadas en total."
      El usuario eligió escribirlas POR LOTES.

     UNA factura del relayer (cta_contadores, manualId ct:contrato) lleva en su
     cantidad, empaquetados (FORMATOS.contadores): las cuentas creadas, las tx del
     contrato minadas con éxito y las revertidas, cuántos lotes se escribieron y
     los dos CURSORES de hasta dónde está contado todo: el bloque (las tx) y el
     instante en ms (las cuentas). Todo solo sube, así que la cantidad también:
     cada lote es UN increaseInvoiceQuantity(id, nuevo − viejo), y si no hay nada
     nuevo no se gasta ninguna comisión.

     Cada lote cuenta lo NUEVO desde los cursores que dice la propia factura:
       · cuentas: GamePlayer con createdAt en (cuentasHasta, ahora − 30 s];
       · tx: el libro de la auditoría (litvm_chain_transactions: un hash único por
         tx, con éxito y revertidas aparte) en los bloques (bloque, cabeza − margen],
         sin las escrituras de esta misma factura (contarlas obligaría a escribir
         para siempre, una vez por lote).
     Así un borrado de Mongo no resta nada ni cuenta dos veces: lo que llega
     después es nuevo y se suma, y lo que se reimporte del pasado cae en bloques
     ya contados. (El precio: si el escaneo histórico de la auditoría rellena
     DESPUÉS huecos de bloques ya contados, eso tampoco se suma.) Las cuentas que vuelven de la cadena recuperan su fecha
     (fechaOriginal) y tampoco cuentan otra vez.
     Si el libro tiene tx enviadas hace más de un minuto (y menos de 30) sin
     recibo, las tx esperan al lote siguiente: podrían estar ya minadas en un
     bloque de la ventana, y el cursor pasaría de largo.
     Un lote a la vez, también entre instancias (un cerrojo en Mongo): dos sumas
     a la vez romperían los campos empaquetados. Después se relee y se comprueba. */
  const Cerrojo = mongoose.models.CuentaCadenaCerrojo || mongoose.model('CuentaCadenaCerrojo', new mongoose.Schema({
    _id: String, dueno: String, hasta: Date
  }, { collection: 'cuenta_cadena_cerrojos', versionKey: false }));
  const yo = crypto.randomUUID();
  const MARGEN_CUENTAS_MS = 30000, ESPERA_RECIBO_MS = 60000, OLVIDO_RECIBO_MS = 30 * 60000, CERROJO_MS = 5 * 60000;
  let _escribiendo = null, _contadoresVistos = { en: 0, v: null };

  function margenBloques() { const n = Math.floor(Number(cfg.contadoresMargen)); return Number.isFinite(n) && n >= 0 ? n : 1200; }
  function cadaMsContadores() { return Math.max(60000, Number(cfg.contadoresCadaMs) || 600000); }
  function libro() { return (mongoose.models && mongoose.models.LitvmChainTransaction) || null; }
  function alcanceLibro() {
    const dir = d.direccionContrato && d.direccionContrato();
    const id = d.chainId ? Number(d.chainId()) : NaN;
    return dirValida(dir) && Number.isSafeInteger(id) ? { chainId: id, contractAddress: dirMin(dir) } : null;
  }

  async function tomarCerrojo() {
    const t = ahora();
    try {
      const r = await Cerrojo.findOneAndUpdate({ _id: 'contadores', $or: [{ hasta: { $lte: new Date(t) } }, { dueno: yo }] },
        { $set: { dueno: yo, hasta: new Date(t + CERROJO_MS) } }, { upsert: true, new: true }).lean();
      return !!(r && r.dueno === yo);
    } catch (e) {
      if (e && e.code === 11000) return false;      // lo tiene otra instancia
      throw e;
    }
  }
  function soltarCerrojo() { return Cerrojo.deleteOne({ _id: 'contadores', dueno: yo }).catch(() => {}); }

  /** La factura de los contadores, decodificada (null si aún no existe). */
  async function facturaContadores() {
    const f = await porManual(MANUAL.contadores());
    if (!f) return null;
    if (f.tipo !== TABLAS.contadores.tipo) throw new Error('contadores_factura_ajena');
    const v = desempaquetar(FORMATOS.contadores, f.cantidad);
    if (!v._marca) throw new Error('contadores_factura_rota');
    delete v._marca;
    return { factura: f, valores: v };
  }

  /** Lo nuevo entre los cursores de la factura (`desde`) y `hasta`. No escribe nada. */
  async function contarNuevos(desde, hasta, idFactura, opciones = {}) {
    const out = { cuentas: 0, txExito: 0, txRevertidas: 0, bloque: desde.bloque, libro: false, esperando: 0 };
    if (hasta.cuentasHasta > desde.cuentasHasta) {
      const ventana = { $gt: new Date(desde.cuentasHasta), $lte: new Date(hasta.cuentasHasta) };
      // La primera vez entran también las cuentas viejas sin fecha.
      out.cuentas = await M.GamePlayer.countDocuments(desde.cuentasHasta > 0 ? { createdAt: ventana }
        : { $or: [{ createdAt: ventana }, { createdAt: null }] });
    }
    const L = libro(), alcance = alcanceLibro();
    if (!L || !alcance) return out;
    out.libro = true;
    const t = ahora();
    out.esperando = await L.countDocuments({ ...alcance, status: { $in: ['signed', 'pending'] },
      submittedAt: { $gte: new Date(t - OLVIDO_RECIBO_MS), $lte: new Date(t - ESPERA_RECIBO_MS) } });
    if ((out.esperando && !opciones.sinEspera) || hasta.bloque <= desde.bloque) return out;
    const q = { ...alcance, canonical: true, status: { $in: ['confirmed', 'reverted'] }, blockNumber: { $gt: desde.bloque, $lte: hasta.bloque } };
    if (idFactura) q.invoiceIds = { $ne: String(idFactura) };
    for (const g of await L.aggregate([{ $match: q }, { $group: { _id: '$status', n: { $sum: 1 } } }])) {
      if (g._id === 'confirmed') out.txExito = g.n;
      else if (g._id === 'reverted') out.txRevertidas = g.n;
    }
    out.bloque = hasta.bloque;
    return out;
  }

  /** Un lote: cuenta lo nuevo y lo suma a la factura con UNA transacción (o ninguna). */
  function escribirContadores() {
    if (_escribiendo) return _escribiendo;
    _escribiendo = (async () => {
      const c = contrato(), w = d.wallet && d.wallet();
      if (!c || !w) return { ok: false, motivo: 'sin_contrato' };
      if (!await tomarCerrojo()) return { ok: false, motivo: 'ocupado' };
      try {
        const hay = await facturaContadores();
        const viejo = hay ? hay.valores : { ...CERO_CONTADORES };
        const cabeza = Number(await d.proveedor().getBlockNumber());
        const hasta = { bloque: Math.max(viejo.bloque, cabeza - margenBloques()),
                        cuentasHasta: Math.max(viejo.cuentasHasta, ahora() - MARGEN_CUENTAS_MS) };
        const idF = hay ? String(hay.factura.id) : null;
        const n = await contarNuevos(viejo, hasta, idF);
        if (hay && !n.cuentas && !n.txExito && !n.txRevertidas) {
          return { ok: true, nada: true, enCadena: viejo, esperando: n.esperando, libro: n.libro };
        }
        const nuevo = sumarContadores(viejo, n, { bloque: n.bloque, cuentasHasta: hasta.cuentasHasta });
        const antes = hay ? hay.factura.cantidad : 0n, despues = empaquetar(FORMATOS.contadores, nuevo);
        if (despues <= antes) throw new Error('contadores_no_suben');
        let recibo;
        if (!hay) {
          if (!await asegurarTabla('contadores')) throw new Error('tabla_no_disponible');
          const tipo = TABLAS.contadores.tipo, mid = MANUAL.contadores();
          recibo = await enviar('contadores (crear)', (o) => c.createInvoice(w.address, tipo, despues, mid, o),
            (o) => c.createInvoice.estimateGas(w.address, tipo, despues, mid, o), 'contadores');
        } else {
          const id = hay.factura.id, delta = despues - antes;
          recibo = await enviar('contadores (lote)', (o) => c.increaseInvoiceQuantity(id, delta, o),
            (o) => c.increaseInvoiceQuantity.estimateGas(id, delta, o), 'contadores');
        }
        const leida = await facturaContadores().catch(() => null);
        const cuadra = !!(leida && leida.factura.cantidad === despues);
        if (!cuadra) apuntarError(new Error('la factura de los contadores no da lo escrito'), 'contadores');
        const suma = { cuentas: n.cuentas, txExito: n.txExito, txRevertidas: n.txRevertidas };
        const lote = { hash: recibo.hash || recibo.transactionHash || null, bloque: Number(recibo.blockNumber) || null,
                       en: new Date(ahora()).toISOString(), suma, cuadra };
        await guardarGlobal({ contadores: { ultimoLote: lote } }).catch(() => {});
        ultimoContadores = ahora();
        _contadoresVistos.en = 0;
        return { ok: true, escrito: true, creada: !hay, enCadena: nuevo, suma, esperando: n.esperando, libro: n.libro, lote };
      } finally { await soltarCerrojo(); }
    })().finally(() => { _escribiendo = null; });
    return _escribiendo;
  }

  /** Para el centro de control: lo que dice la factura y lo que espera al próximo lote. */
  async function leerContadores() {
    const c = contrato();
    const base = { ok: true, activo: cfg.contadoresActivos !== false, cadaMs: cadaMsContadores(), margenBloques: margenBloques(),
                   tipo: TABLAS.contadores.tipo, manualId: MANUAL.contadores(),
                   contrato: d.direccionContrato ? d.direccionContrato() || null : null, explorador: d.explorador ? d.explorador() || null : null };
    if (!c) return { ...base, ok: false, motivo: 'sin_contrato' };
    if (_contadoresVistos.v && ahora() - _contadoresVistos.en < 20000) return _contadoresVistos.v;
    const hay = await facturaContadores();
    const v = hay ? hay.valores : { ...CERO_CONTADORES };
    let pendiente = null;
    try {
      // Lo que aún no está escrito, hasta ahora mismo (sin márgenes): solo para enseñarlo.
      const cabeza = Number(await d.proveedor().getBlockNumber());
      const n = await contarNuevos(v, { bloque: Math.max(v.bloque, cabeza), cuentasHasta: Math.max(v.cuentasHasta, ahora()) },
        hay ? String(hay.factura.id) : null, { sinEspera: true });
      pendiente = { cuentas: n.cuentas, txExito: n.txExito, txRevertidas: n.txRevertidas, esperandoRecibos: n.esperando, libro: n.libro, cabeza };
    } catch (_) { pendiente = null; }
    const g = await leerGlobal().catch(() => ({}));
    const out = { ...base, existe: !!hay, factura: hay ? String(hay.factura.id) : null,
      enCadena: hay ? { ...v, txMinadas: v.txExito + v.txRevertidas,
                        cuentasHasta: v.cuentasHasta ? new Date(v.cuentasHasta).toISOString() : null } : null,
      pendiente, ultimoLote: (g.contadores && g.contadores.ultimoLote) || null,
      proximoEn: ultimoContadores ? new Date(ultimoContadores + cadaMsContadores()).toISOString() : null };
    _contadoresVistos = { en: ahora(), v: out };
    return out;
  }

  // ── LO QUE VE EL CENTRO DE CONTROL ───────────────────────────────────────
  let _tablasVistas = { en: 0, v: null };
  async function estado() {
    const g = await leerGlobal().catch(() => ({}));
    let tablas = _tablasVistas.v;
    const c = contrato();
    if (!tablas || ahora() - _tablasVistas.en > 60000) {
      tablas = {};
      for (const [k, t] of Object.entries(TABLAS)) {
        try {
          const st = c ? await c.getTipoStats(t.tipo) : null;
          tablas[k] = { tipo: t.tipo, existe: !!(st && (st.exists ?? st[5])), facturas: st ? Number(st.invoiceCount ?? st[3]) : null };
        } catch (_) { tablas[k] = { tipo: t.tipo, existe: null, facturas: null }; }
      }
      _tablasVistas = { en: ahora(), v: tablas };
    }
    const pendientes = await Estado.countDocuments({ vence: { $ne: null }, _id: { $ne: '__global' } }).catch(() => null);
    const conError = await Estado.countDocuments({ error: { $nin: ['', null] }, _id: { $ne: '__global' } }).catch(() => null);
    const sincronizados = await Estado.countDocuments({ _id: { $ne: '__global' } }).catch(() => null);
    return {
      ok: true, config: cfg, claveAncla: !!claveAncla(), contrato: !!c, cola: cola.length, trabajando, tablas,
      jugadores: { sincronizados, pendientes, conError },
      metricas: { ...metricas, gas: metricas.gas.toString() },
      ancla: { lotes: Number(g.lotes) || 0, bytes: Number(g.bytes) || 0, ultimo: g.ultimoLote || null, dmsDesde: g.dmsDesde || null },
      tarea
    };
  }

  /** La foto de un jugador: Mongo y cadena, tabla a tabla (decodificado). */
  async function verJugador(playerName) {
    const m = await deMongo(playerName);
    if (!m) return { ok: false, motivo: 'sin_jugador' };
    const mias = await facturasDe(m.dir);
    const porMid = new Map(mias.map((f) => [f.manualId, f]));
    const vm = valoresMongo(m);
    const out = { ok: true, playerName, address: m.dir, tablas: {} };
    for (const t of EMPAQUETADAS) {
      const f = porMid.get(MANUAL[t](m.dir));
      out.tablas[t] = { mongo: vm[t], cadena: f ? (t === 'tutorial' ? desempaquetarTutorial(f.cantidad) : desempaquetar(FORMATOS[t], f.cantidad)) : null,
                        factura: f ? Number(f.id) : null };
    }
    const des = relacionesDeseadas(m);
    for (const t of RELACIONES) {
      const enCadena = mias.filter((f) => f.tipo === TABLAS[t].tipo).map((f) => ({ manualId: f.manualId, factura: Number(f.id), ...leerManual(f.manualId) }));
      out.tablas[t] = { mongo: [...des[t].keys()].map((k) => ({ manualId: k, ...leerManual(k) })), cadena: enCadena };
    }
    const est = await Estado.findById(playerName).lean();
    out.estado = est ? { escritoEn: est.escritoEn, vence: est.vence, error: est.error, actualizado: est.actualizado } : null;
    return JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  }

  async function guardarConfig(cambios) {
    const g = await leerGlobal();
    const actual = { ...(g.config || {}) };
    if (typeof cambios.activo === 'boolean') actual.activo = cambios.activo;
    if (typeof cambios.anclaActiva === 'boolean') actual.anclaActiva = cambios.anclaActiva;
    if (typeof cambios.contadoresActivos === 'boolean') actual.contadoresActivos = cambios.contadoresActivos;
    if (cambios.contadoresMargen !== undefined) {
      const n = Math.floor(Number(cambios.contadoresMargen));
      if (Number.isFinite(n) && n >= 0 && n <= 100000) actual.contadoresMargen = n;
    }
    for (const k of ['cicloMs', 'anclaCadaMs', 'txPorMinuto', 'jugadoresPorCiclo', 'contadoresCadaMs']) {
      if (cambios[k] !== undefined) { const n = Math.floor(Number(cambios[k])); if (Number.isFinite(n) && n > 0) actual[k] = n; }
    }
    if (cambios.minimoMs && typeof cambios.minimoMs === 'object') {
      actual.minimoMs = { ...(actual.minimoMs || {}) };
      for (const [k, v] of Object.entries(cambios.minimoMs)) {
        if (Object.prototype.hasOwnProperty.call(TABLAS, k)) { const n = Math.floor(Number(v)); if (Number.isFinite(n) && n >= 0) actual.minimoMs[k] = n; }
      }
    }
    await guardarGlobal({ config: actual });
    return cargarConfig();
  }

  /** Las rutas del centro de control (todas de administrador). */
  function montarRutas(app, mw) {
    const { adminAuth, apiLimiter, strictLimiter } = mw;
    const pn = (req) => String(req.params.playerName || '').slice(0, 80);
    const resp = (res, p) => p.then((x) => res.json(x)).catch((e) => res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
    app.get('/api/admin/cuenta-cadena/estado', adminAuth, apiLimiter, (req, res) => resp(res, estado()));
    app.post('/api/admin/cuenta-cadena/config', adminAuth, strictLimiter, (req, res) => resp(res, guardarConfig(req.body || {}).then((c) => ({ ok: true, config: c }))));
    app.get('/api/admin/cuenta-cadena/jugador/:playerName', adminAuth, apiLimiter, (req, res) => resp(res, verJugador(pn(req))));
    app.post('/api/admin/cuenta-cadena/jugador/:playerName/sincronizar', adminAuth, strictLimiter, (req, res) => resp(res, sincronizarJugador(pn(req), { forzar: true })));
    app.post('/api/admin/cuenta-cadena/jugador/:playerName/restaurar', adminAuth, strictLimiter, (req, res) => resp(res, restaurarJugador(pn(req))));
    app.post('/api/admin/cuenta-cadena/anclar', adminAuth, strictLimiter, (req, res) => resp(res, anclar()));
    // (2026-11-25) Los contadores del contrato (la portada del centro de control).
    app.get('/api/admin/contadores', adminAuth, apiLimiter, (req, res) => resp(res, leerContadores()));
    app.post('/api/admin/contadores/escribir', adminAuth, strictLimiter, (req, res) => resp(res, escribirContadores()));
    app.post('/api/admin/cuenta-cadena/restaurar-todo', adminAuth, strictLimiter, (req, res) => {
      if (!req.body || req.body.confirmar !== 'RESTAURAR') return res.status(400).json({ ok: false, error: 'confirmar', message: 'Send {"confirmar":"RESTAURAR"}.' });
      return resp(res, restaurarTodo(req.body || {}).then((t) => ({ ok: true, tarea: t })));
    });
  }

  return {
    TABLAS, PREFIJO, HABILIDADES, FORMATOS, MANUAL,
    sincronizarJugador, restaurarJugador, restaurarSiVacio, restaurarTodo, verJugador, anclar, leerAnclas, aplicarAnclas,
    escanearCadena, programar, ciclo, arrancar, detener, estado, guardarConfig, montarRutas,
    escribirContadores, leerContadores,
    _modelos: { Estado, FirmaAncla, Cerrojo }, _metricas: metricas, _cola: cola
  };
}

crearCuentaEnCadena.puras = {
  PREFIJO, TABLAS, FORMATOS, HABILIDADES, MANUAL, dirCorta, dirDeCorta, leerManual, empaquetar, desempaquetar,
  empaquetarTutorial, desempaquetarTutorial, cantidadLand, leerCantidadLand, fusionar, bitsDe, claveDerivada, cifrarLote, descifrarLote, firma,
  normalizar, vacio, sumarContadores, masAntigua, CERO_CONTADORES,
  esTablaDeCuenta: (tipo) => String(tipo || '').startsWith(PREFIJO)
};
module.exports = crearCuentaEnCadena;
