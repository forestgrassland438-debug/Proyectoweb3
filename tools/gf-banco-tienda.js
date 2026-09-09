/* BANCO DE PRUEBAS DE LA TIENDA, DE PUNTA A PUNTA.
 * =============================================================================
 * Monta, sin navegador y sin cadena, la MISMA pila que corre de verdad:
 *
 *     tienda_sistema.js  (el fichero real)
 *          ↓  relayClient
 *     phaser-relay-library.js  (el fichero real)
 *          ↓  fetch
 *     server2.js  (aquí imitado: whitelist, ownership, call-view…)
 *          ↓
 *     contrato.txt  (aquí imitado: facturas, revert cuando no existe…)
 *
 * POR QUÉ HACE FALTA ESTO Y NO BASTA CON `tienda-prueba-venta.js`:
 * esa prueba le pone a la tienda un `quitarDeFactura` DE MENTIRA, así que nunca
 * ejerce el camino real (leer la factura → buscarla por manualId → buscarla en
 * el inventario del jugador) ni lo que hace `RemoveItemBlockchains` ANTES de
 * llegar a él. Justo ahí estaba el fallo de "puedo comprar pero no vender".
 *
 * Este fichero solo EXPONE el banco; las pruebas van en tienda-prueba-*.js.
 * =============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ── ENTORNO DE NAVEGADOR MÍNIMO ─────────────────────────────────────────────
function nodoFalso() {
  const n = {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '',
    value: '', disabled: false, alt: '', src: '', hidden: false,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, v) { if (v === undefined) v = !this._s.has(c); v ? this._s.add(c) : this._s.delete(c); }
    },
    appendChild(x) { this.children.push(x); return x; },
    removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    insertAdjacentHTML() {}, focus() {}, blur() {}, closest() { return null; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  return n;
}

function montarNavegador() {
  global.window = global;
  global.self = global;
  global.addEventListener = function () {};
  global.removeEventListener = function () {};
  global.innerWidth = 1280;
  global.innerHeight = 720;
  global.devicePixelRatio = 1;
  global.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {}, removeListener() {} });
  global.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

  const registro = new Map();
  global.document = {
    body: nodoFalso(), head: nodoFalso(), cookie: '',
    getElementById(id) {
      if (!registro.has(id)) return null;
      return registro.get(id);
    },
    _crear(id) { const n = nodoFalso(); n.id = id; registro.set(id, n); return n; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return nodoFalso(); },
    addEventListener() {}, removeEventListener() {}
  };
  global.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; }
  };
  try {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'node', maxTouchPoints: 0 }, configurable: true
    });
  } catch (e) { /* el userAgent de Node ya sirve */ }
  global.AbortController = global.AbortController || class {
    constructor() { this.signal = { aborted: false, addEventListener() {} }; }
    abort() { this.signal.aborted = true; }
  };
  global.getCsrfToken = () => 'csrf-de-prueba';
}

// ── EL CONTRATO (imitación fiel de contrato.txt) ─────────────────────────────
/**
 * Reglas que SÍ se imitan, porque son las que deciden si una venta sale:
 *   · getInvoice REVIERTE si la factura no existe (id == 0).
 *   · getInvoiceByManualId REVIERTE si el manualId no está registrado.
 *   · decreaseInvoiceQuantity recorta a lo que haya y cierra la factura al
 *     llegar a 0 (libera el manualId, la saca de la lista del usuario).
 *   · getUserInventorySnapshot devuelve SOLO las facturas de la lista activa.
 */
class CadenaFalsa {
  constructor() {
    this.facturas = new Map();     // id → factura
    this.porManual = new Map();    // manualId → id
    this.activasPorUsuario = new Map(); // owner → Set(id)
    this.contador = 0;
    this.llamadas = [];            // traza de todo lo que se pidió
    this.tiposConfigurados = null; // null = todo permitido
  }

  _reg(fn, args) { this.llamadas.push({ fn, args }); }

  _revert(nombre) {
    // El mismo texto que produce ethers v6 con un custom error del ABI.
    const e = new Error(
      `execution reverted (unknown custom error) (action="call", data="0x", ` +
      `reason=null, code=CALL_EXCEPTION, error=${nombre}, version=6.13.2)`
    );
    e.code = 'CALL_EXCEPTION';
    e.revert = { name: nombre, args: [] };
    return e;
  }

  crear(owner, tipo, cantidad, manualId) {
    this._reg('createInvoice', [owner, tipo, cantidad, manualId]);
    if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(String(owner))) throw this._revert('ZeroAddress');
    const m = String(manualId || '');
    if (!m.length || m.length > 64) throw this._revert('InvalidManualIdLength');
    if (this.porManual.has(m)) throw this._revert('ManualIdAlreadyExists');
    if (this.tiposConfigurados && !this.tiposConfigurados.has(tipo)) throw this._revert('TipoNotConfigured');

    const id = ++this.contador;
    const f = {
      id, manualId: m, owner: String(owner).toLowerCase(), tipo: String(tipo),
      cantidad: Number(cantidad) || 0, active: true, createdAt: 1
    };
    this.facturas.set(id, f);
    this.porManual.set(m, id);
    if (!this.activasPorUsuario.has(f.owner)) this.activasPorUsuario.set(f.owner, new Set());
    this.activasPorUsuario.get(f.owner).add(id);
    return id;
  }

  aumentar(id, cantidad) {
    this._reg('increaseInvoiceQuantity', [id, cantidad]);
    const f = this.facturas.get(Number(id));
    if (!f || f.id === 0) throw this._revert('InvoiceNotFound');
    if (!f.active) throw this._revert('InvoiceNotActive');
    if (Number(cantidad) <= 0) throw this._revert('ZeroAmount');
    f.cantidad += Number(cantidad);
    return f.cantidad;
  }

  disminuir(id, cantidad) {
    this._reg('decreaseInvoiceQuantity', [id, cantidad]);
    const f = this.facturas.get(Number(id));
    if (!f || f.id === 0) throw this._revert('InvoiceNotFound');
    if (!f.active) throw this._revert('InvoiceNotActive');
    const real = Math.min(Number(cantidad), f.cantidad);
    f.cantidad -= real;
    if (f.cantidad === 0) this._cerrar(f);
    return real;
  }

  borrar(id) {
    this._reg('deleteInvoice', [id]);
    const f = this.facturas.get(Number(id));
    if (!f || f.id === 0) throw this._revert('InvoiceNotFound');
    if (!f.active) throw this._revert('InvoiceNotActive');
    f.cantidad = 0;
    this._cerrar(f);
  }

  _cerrar(f) {
    f.active = false;
    this.porManual.delete(f.manualId);
    const s = this.activasPorUsuario.get(f.owner);
    if (s) s.delete(f.id);
  }

  getInvoice(id) {
    this._reg('getInvoice', [id]);
    const f = this.facturas.get(Number(id));
    if (!f || f.id === 0) throw this._revert('InvoiceNotFound');
    return f;
  }

  getInvoiceByManualId(manualId) {
    this._reg('getInvoiceByManualId', [manualId]);
    const id = this.porManual.get(String(manualId));
    if (!id) throw this._revert('ManualIdNotFound');
    return this.getInvoice(id);
  }

  getUserInventorySnapshot(user) {
    this._reg('getUserInventorySnapshot', [user]);
    const s = this.activasPorUsuario.get(String(user).toLowerCase()) || new Set();
    return Array.from(s).map(id => this.facturas.get(id));
  }

  /** Las facturas vivas de un tipo, para comprobar desde la prueba. */
  vivasDe(tipo, owner) {
    const out = [];
    for (const f of this.facturas.values()) {
      if (!f.active || f.cantidad <= 0) continue;
      if (tipo && f.tipo !== tipo) continue;
      if (owner && f.owner !== String(owner).toLowerCase()) continue;
      out.push(f);
    }
    return out;
  }

  totalDe(tipo, owner) {
    return this.vivasDe(tipo, owner).reduce((n, f) => n + f.cantidad, 0);
  }
}

// ── EL ABI (solo lo que usa el juego) ───────────────────────────────────────
const TUPLA_INVOICE = {
  type: 'tuple',
  components: [
    { name: 'id', type: 'uint256' }, { name: 'manualId', type: 'string' },
    { name: 'owner', type: 'address' }, { name: 'tipo', type: 'string' },
    { name: 'cantidad', type: 'uint256' }, { name: 'active', type: 'bool' },
    { name: 'createdAt', type: 'uint256' }
  ]
};

const ABI_ITEM = [
  { type: 'function', name: 'createInvoice', stateMutability: 'nonpayable',
    inputs: [{ name: '_owner', type: 'address' }, { name: '_tipo', type: 'string' },
             { name: '_cantidad', type: 'uint256' }, { name: '_manualId', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'increaseInvoiceQuantity', stateMutability: 'nonpayable',
    inputs: [{ name: '_id', type: 'uint256' }, { name: '_increaseAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decreaseInvoiceQuantity', stateMutability: 'nonpayable',
    inputs: [{ name: '_id', type: 'uint256' }, { name: '_decreaseAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'deleteInvoice', stateMutability: 'nonpayable',
    inputs: [{ name: '_id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'getInvoice', stateMutability: 'view',
    inputs: [{ name: '_id', type: 'uint256' }], outputs: [Object.assign({ name: '' }, TUPLA_INVOICE)] },
  { type: 'function', name: 'getInvoiceByManualId', stateMutability: 'view',
    inputs: [{ name: '_manualId', type: 'string' }], outputs: [Object.assign({ name: '' }, TUPLA_INVOICE)] },
  { type: 'function', name: 'getUserInventorySnapshot', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'result', type: 'tuple[]', components: TUPLA_INVOICE.components }] },
  { type: 'function', name: 'getActiveInvoiceIds', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] }
];

// ── EL SERVIDOR (imitación de server2.js) ───────────────────────────────────
/**
 * Reproduce lo que de verdad decide si una transacción sale adelante:
 *   · la whitelist de funciones de ItemContract,
 *   · verifyInvoiceOwnership (la factura tiene que ser TUYA y tener bastante),
 *   · el 500 con `error: mensaje` cuando el contrato revierte en una vista,
 *   · la serialización de tuple[] tal y como la hace convertBigIntToString.
 */
const DIRECCION_CONTRATO = '0x1111111111111111111111111111111111111111';

const FUNCIONES_PERMITIDAS = new Set([
  'createInvoice', 'setLimit', 'increaseInvoiceQuantity', 'decreaseInvoiceQuantity',
  'deleteInvoice', 'deprecateTipo', 'transferInvoice', 'transferQuantityBetweenInvoices',
  'getInvoice', 'getInvoiceByManualId', 'getTipoStats', 'getUserInventorySnapshot',
  'getActiveInvoiceIds'
]);

class ServidorFalso {
  /**
   * @param cadena           CadenaFalsa
   * @param direccionJugador la del jugador autenticado
   * @param opciones         { snapshotComoTupla, sinSnapshot, redCaida, autenticado }
   */
  constructor(cadena, direccionJugador, opciones = {}) {
    this.cadena = cadena;
    this.jugador = String(direccionJugador).toLowerCase();
    this.opciones = opciones;
    this.transacciones = new Map();   // transactionId → {status, txHash}
    this.peticiones = [];             // traza
    this.contadorTx = 0;
  }

  get abi() {
    if (this.opciones.sinSnapshot) {
      return ABI_ITEM.filter(f => f.name !== 'getUserInventorySnapshot');
    }
    return ABI_ITEM;
  }

  /** Como convertBigIntToString del servidor con ethers v6 (Result = array). */
  _serializarFactura(f, comoObjeto) {
    if (comoObjeto) {
      return {
        id: String(f.id), manualId: f.manualId, owner: f.owner, tipo: f.tipo,
        cantidad: String(f.cantidad), active: f.active, createdAt: String(f.createdAt)
      };
    }
    return [String(f.id), f.manualId, f.owner, f.tipo, String(f.cantidad), f.active, String(f.createdAt)];
  }

  async fetch(url, opts) {
    const u = String(url);
    const ruta = u.replace(/^https?:\/\/[^/]+/, '');
    const metodo = (opts && opts.method) || 'GET';
    let cuerpo = null;
    try { cuerpo = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) { cuerpo = null; }
    this.peticiones.push({ ruta, metodo, cuerpo });

    if (this.opciones.redCaida) {
      throw new TypeError('Failed to fetch');
    }

    const json = (status, obj) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      async text() { return JSON.stringify(obj); },
      async json() { return obj; }
    });

    if (ruta === '/ping') return json(200, { ok: true });

    // El horno: mismo contrato que /api/furnace/:playerName en server2.js —
    // guarda oreItem, coalItem y timestamp, y nada mas.
    if (/^\/api\/furnace\//.test(ruta)) {
      if (metodo === 'POST') {
        this.horno = {
          oreItem:   (cuerpo && cuerpo.oreItem)  || null,
          coalItem:  (cuerpo && cuerpo.coalItem) || null,
          timestamp: (cuerpo && cuerpo.timestamp) || 0
        };
        return json(200, { success: true });
      }
      return json(200, this.horno || { oreItem: null, coalItem: null, timestamp: 0 });
    }

    if (ruta === '/api/auth/me') {
      if (this.opciones.autenticado === false) return json(401, { authenticated: false, error: 'Not authenticated' });
      return json(200, { authenticated: true, address: this.jugador, playerName: 'Ana' });
    }

    if (ruta === '/api/relay/contracts') {
      return json(200, {
        success: true,
        contracts: [{ contractAddress: DIRECCION_CONTRATO, contractName: 'ItemContract', abi: this.abi }]
      });
    }

    if (/^\/api\/relay\/contract\/0x[0-9a-fA-F]{40}\/abi$/.test(ruta)) {
      return json(200, { success: true, name: 'ItemContract', abi: this.abi });
    }

    if (ruta === '/api/relay/call-view' && metodo === 'POST') {
      return this._callView(cuerpo, json);
    }

    if (ruta === '/api/relay/transaction' && metodo === 'POST') {
      return this._transaccion(cuerpo, json);
    }

    const mTx = ruta.match(/^\/api\/relay\/transaction\/([^/?]+)$/);
    if (mTx && metodo === 'GET') {
      const t = this.transacciones.get(mTx[1]);
      if (!t) return json(404, { success: false, error: 'not found' });
      /* `retrasoTx` deja la transaccion en 'pending' unos cuantos sondeos.
         Es lo que permite comprobar que la tienda NO se queda esperando: si
         `processSale` volviera solo al confirmar, con esto se notaria. */
      if (this.opciones.retrasoTx && t.status === 'confirmed' && !t._servida) {
        t._sondeos = (t._sondeos || 0) + 1;
        if (t._sondeos <= this.opciones.retrasoTx) {
          return json(200, { success: true, transaction: { status: 'pending', transactionId: mTx[1] } });
        }
        t._servida = true;
      }
      return json(200, { success: true, transaction: t });
    }

    return json(404, { success: false, error: 'ruta no imitada: ' + ruta });
  }

  _callView(cuerpo, json) {
    const fn = cuerpo && cuerpo.functionName;
    const args = Object.values((cuerpo && cuerpo.parameters) || {});
    try {
      if (fn === 'getInvoice') {
        const f = this.cadena.getInvoice(args[0]);
        // struct único → el servidor lo manda como array plano.
        return json(200, { success: true, result: this._serializarFactura(f, false) });
      }
      if (fn === 'getInvoiceByManualId') {
        const f = this.cadena.getInvoiceByManualId(args[0]);
        return json(200, { success: true, result: this._serializarFactura(f, false) });
      }
      if (fn === 'getUserInventorySnapshot') {
        if (this.opciones.sinSnapshot) {
          return json(400, { success: false, error: 'Function getUserInventorySnapshot not found in contract' });
        }
        if (this.opciones.snapshotRoto) {
          return json(500, { success: false, error: 'Failed to fetch' });
        }
        const lista = this.cadena.getUserInventorySnapshot(args[0]);
        const comoObjeto = !!this.opciones.snapshotComoObjeto;
        return json(200, { success: true, result: lista.map(f => this._serializarFactura(f, comoObjeto)) });
      }
      if (fn === 'getActiveInvoiceIds') {
        const lista = this.cadena.getUserInventorySnapshot(args[0]);
        return json(200, { success: true, result: lista.map(f => String(f.id)) });
      }
      return json(400, { success: false, error: `Function ${fn} not found in contract` });
    } catch (e) {
      // server2: res.status(500).json({ success:false, error: error.message })
      return json(500, { success: false, error: e.message, details: { code: e.code } });
    }
  }

  _transaccion(cuerpo, json) {
    const fn = cuerpo && cuerpo.functionName;
    const params = (cuerpo && cuerpo.parameters) || {};
    const args = Object.values(params);

    if (!FUNCIONES_PERMITIDAS.has(fn)) {
      return json(500, { success: false, error: `Function ${fn} not allowed for this contract` });
    }

    // verifyInvoiceOwnership (anti-trampa del relay)
    const CON_DUENO = {
      decreaseInvoiceQuantity: { idArg: 0, amountArg: 1 },
      increaseInvoiceQuantity: { idArg: 0 },
      deleteInvoice: { idArg: 0 }
    };
    const cfg = CON_DUENO[fn];
    if (cfg) {
      const id = Number(args[cfg.idArg]);
      if (!Number.isFinite(id) || id <= 0) {
        return json(500, { success: false, error: 'ownership_check_failed: invalid invoice id' });
      }
      let inv = null;
      try { inv = this.cadena.getInvoice(id); }
      catch (e) { return json(500, { success: false, error: `ownership_check_failed: invoice ${id} not found on-chain` }); }
      if (!inv.active) return json(500, { success: false, error: `ownership_check_failed: invoice ${id} is inactive` });
      if (inv.owner !== this.jugador) {
        return json(500, { success: false, error: `ownership_check_failed: invoice ${id} does not belong to the player` });
      }
      if (cfg.amountArg != null) {
        const amount = Number(args[cfg.amountArg]) || 0;
        if (amount > 0 && inv.cantidad < amount) {
          return json(500, { success: false, error: `ownership_check_failed: insufficient quantity in invoice ${id}` });
        }
      }
    }

    try {
      if (fn === 'createInvoice')             this.cadena.crear(args[0], args[1], args[2], args[3]);
      else if (fn === 'increaseInvoiceQuantity') this.cadena.aumentar(args[0], args[1]);
      else if (fn === 'decreaseInvoiceQuantity') this.cadena.disminuir(args[0], args[1]);
      else if (fn === 'deleteInvoice')           this.cadena.borrar(args[0]);
    } catch (e) {
      return json(500, { success: false, error: e.message, code: 'RELAY_ERROR' });
    }

    const id = 'relay_' + (++this.contadorTx);
    const txHash = '0x' + String(this.contadorTx).padStart(64, '0');
    this.transacciones.set(id, { status: 'confirmed', txHash, transactionId: id });
    return json(200, { success: true, transactionId: id, txHash, message: 'Transaction relayed successfully' });
  }
}

// ── LA ESCENA ───────────────────────────────────────────────────────────────
/** El catálogo real que usa la escena de la tienda. */
function catalogoDeLaEscena(BIN) {
  const t = fs.readFileSync(path.join(BIN, 'Scenes', 'tiendajuego.js'), 'utf8').replace(/\r\n/g, '\n');
  const marca = 'this.ItemDefinitions = {';
  const i = t.indexOf(marca);
  if (i < 0) throw new Error('no encuentro ItemDefinitions en tiendajuego.js');
  const ini = t.indexOf('{', i + marca.length - 1);
  let p = 0, j = ini;
  for (; j < t.length; j++) { const c = t[j]; if (c === '{') p++; else if (c === '}') { p--; if (!p) { j++; break; } } }
  return eval('(' + t.slice(ini, j) + ')');
}

class EscenaFalsa {
  constructor(BIN) {
    this.ItemDefinitions = catalogoDeLaEscena(BIN);
    this.playerName = 'Ana';
    this.serverBase = 'http://prueba.local';
    this.moneda = 1000;
    this.moneda_plata = 1000;
    this.nivel = 50;
    this.guardados = 0;
    this.STATE = {
      slots: new Array(40).fill(null),
      quickSlots: new Array(7).fill(null),
      chestSlots: new Array(24).fill(null),
      ghostSlots: { inv: new Array(40).fill(null), quick: new Array(7).fill(null) },
      selectedItem: null
    };
    this.scene = { key: 'tiendajuego' };
  }
  /** Pone un objeto en un hueco. `invoiceId`/`manual` pueden ser BASURA a propósito. */
  poner(hueco, id, count, invoiceId, manual) {
    this.STATE.slots[hueco] = {
      id, count,
      idx: invoiceId === undefined ? hueco : invoiceId,
      idm: manual === undefined ? id : manual
    };
  }
  ponerRapido(hueco, id, count, invoiceId, manual) {
    this.STATE.quickSlots[hueco] = {
      id, count,
      idx: invoiceId === undefined ? hueco : invoiceId,
      idm: manual === undefined ? id : manual
    };
  }
  contar(id) {
    let n = 0;
    for (const s of [...this.STATE.slots, ...this.STATE.quickSlots]) if (s && s.id === id) n += s.count || 0;
    return n;
  }
  async savegg() { this.guardados++; return true; }
  queuedAction() {}
  rebuildPlayerInventoryFromState() {}
  renderSlot() {}
  showNotification() {}
}

// ── CARGA DE LA TIENDA REAL ─────────────────────────────────────────────────
let _TiendaSistema = null;
let _PhaserRelay = null;

function cargarFuentes(BIN) {
  if (_TiendaSistema && _PhaserRelay) return;
  const hablar = console.log;
  const gritar = console.error;
  const avisar = console.warn;
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try {
    eval(fs.readFileSync(path.join(BIN, 'phaser-relay-library.js'), 'utf8'));
    _PhaserRelay = global.PhaserRelay;
    eval(fs.readFileSync(path.join(BIN, 'tienda_sistema.js'), 'utf8') +
         '\n;global.__TiendaSistema = TiendaSistema;');
    _TiendaSistema = global.__TiendaSistema;
  } finally {
    console.log = hablar; console.error = gritar; console.warn = avisar;
  }
  if (typeof _PhaserRelay !== 'function') throw new Error('no se pudo cargar PhaserRelay');
  if (typeof _TiendaSistema !== 'function') throw new Error('no se pudo cargar TiendaSistema');
}

/**
 * Monta el banco entero y devuelve { tienda, escena, cadena, servidor }.
 *
 * @param BIN      carpeta bin
 * @param opciones { snapshotComoObjeto, sinSnapshot, snapshotRoto, redCaida, autenticado }
 */
function montar(BIN, opciones = {}) {
  montarNavegador();
  // El TxGate real: es lo que hace que las pantallas de carga esperen a las
  // ventas encoladas cuando el jugador sale corriendo de la tienda.
  delete global.GFTxGate;
  eval(fs.readFileSync(path.join(BIN, 'tx-gate.js'), 'utf8'));
  cargarFuentes(BIN);

  const JUGADOR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const cadena = new CadenaFalsa();
  const servidor = new ServidorFalso(cadena, JUGADOR, opciones);
  global.fetch = (url, opts) => servidor.fetch(url, opts);

  const escena = new EscenaFalsa(BIN);
  const tienda = new _TiendaSistema(escena);

  const relay = new _PhaserRelay({ apiBase: 'http://prueba.local', debug: false, useNotificationHub: false });
  relay.showError = () => {}; relay.showWarning = () => {};
  relay.showInfo = () => {}; relay.showSuccess = () => {};
  // Sin espera entre sondeos: la prueba no está para dormir.
  const esperarOriginal = relay.waitForTransaction.bind(relay);
  relay.waitForTransaction = (id, o) => esperarOriginal(id, Object.assign({}, o, { interval: 1 }));
  tienda.relayClient = relay;

  tienda.avisos = [];
  tienda.showNotification = (msg) => { tienda.avisos.push(String(msg)); };
  tienda.updateMonedaDisplay = () => {};
  tienda.showTransactionAnimation = () => {};
  tienda.filterItems = () => {};

  return { tienda, escena, cadena, servidor, relay, JUGADOR, DIRECCION_CONTRATO };
}

/** El item del catálogo de la tienda con ese id. */
function itemTienda(tienda, id) {
  for (const arr of Object.values(tienda.itemsTienda)) {
    const it = arr.find(x => x.id === id);
    if (it) return it;
  }
  return null;
}

module.exports = {
  montar, itemTienda, CadenaFalsa, ServidorFalso, EscenaFalsa,
  DIRECCION_CONTRATO, ABI_ITEM, montarNavegador, nodoFalso
};
