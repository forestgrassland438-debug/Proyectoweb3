/* ===========================================================================
 * gf-red.js — LA RED DE LA CADENA PARA LAS PÁGINAS                 (2026-11-10)
 * ===========================================================================
 *
 * "Actualiza el RPC y toda la información de la blockchain porque fue cambiado."
 * LitVM pasó de Caldera a Zeeve, y cada página tenía la red escrita a mano
 * (el RPC para las tarifas, el explorador para los enlaces, la cadena para la
 * cartera). Ahora la red la dice el SERVIDOR (GET /api/red, la que el
 * administrador elige en el centro de control) y aquí se guarda para todos:
 *
 *   GFRed.actual()        la red: { nombre, entorno, chainId, chainIdHex, rpcUrls,
 *                         explorerUrl, moneda{simbolo,nombre,decimales},
 *                         contratos{items,mensajes}, revision }
 *   GFRed.listo()         promesa: la red ya preguntada al servidor (o la de
 *                         siempre si no contesta). Nunca falla.
 *   GFRed.paraWallet()    lo que pide wallet_addEthereumChain.
 *   GFRed.tx(hash)        el enlace del explorador a una transacción ('' si el
 *                         hash no lo es).
 *   GFRed.direccion(a)    el enlace del explorador a una dirección.
 *   GFRed.rpc()           el primer RPC público (para leer la cadena desde aquí).
 *
 * Se arranca con la última red que se vio (localStorage) o con la de por
 * defecto, y se pregunta al servidor en segundo plano; cuando cambia, avisa con
 * el evento 'gf-red' en window. Todo lo que llega se valida: un explorador o un
 * RPC que no sea https no se usa nunca (acabaría en un enlace o en un fetch).
 * ======================================================================== */
(function (global) {
  'use strict';
  if (global.GFRed) return;

  var POR_DEFECTO = {
    nombre: 'LitVM LiteForge', entorno: 'testnet', chainId: 4441, chainIdHex: '0x1159',
    rpcUrls: ['https://rpc.testnet.liteforge.zeeve.net/'],
    explorerUrl: 'https://explorer.testnet.liteforge.zeeve.net',
    moneda: { simbolo: 'zkLTC', nombre: 'zkLTC', decimales: 18 },
    contratos: { items: '0x686E17D89Bf97247fadC04C3A3f0dfD02F914115', mensajes: '0x786E17D89Bf97247fadC04C3A3f0dfD02F914115' },
    revision: 0
  };
  var CLAVE = 'gf_red_v1';
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

  function apiBase() {
    if (typeof global.GF_API_BASE === 'string' && global.GF_API_BASE) return global.GF_API_BASE.replace(/\/+$/, '');
    if (typeof global.serverBase === 'string' && global.serverBase) return global.serverBase.replace(/\/+$/, '');
    try { if (LOCAL.test(global.location.hostname)) return 'http://127.0.0.1:8080'; } catch (e) {}
    return 'https://api.grasslandforest.com';
  }

  function url(u) {
    try {
      var x = new URL(String(u || ''));
      if (x.username || x.password) return '';
      if (x.protocol === 'https:' || (x.protocol === 'http:' && LOCAL.test(x.hostname))) return x.toString();
    } catch (e) {}
    return '';
  }
  function texto(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>"`]/g, '').trim().slice(0, max); }

  /** Lo que llega (del servidor o de la caché), validado. null si no sirve. */
  function validar(d) {
    if (!d || typeof d !== 'object') return null;
    var chainId = Number(d.chainId);
    if (!(chainId >= 1 && chainId <= 4294967295 && Math.floor(chainId) === chainId)) return null;
    var rpcs = (Array.isArray(d.rpcUrls) ? d.rpcUrls : []).map(url).filter(Boolean).slice(0, 6);
    var explorador = url(d.explorerUrl).replace(/\/+$/, '');
    if (!rpcs.length || !explorador) return null;
    var m = d.moneda && typeof d.moneda === 'object' ? d.moneda : {};
    var dec = Number(m.decimales);
    var c = d.contratos && typeof d.contratos === 'object' ? d.contratos : {};
    var dir = function (a, def) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? String(a) : def; };
    return {
      nombre: texto(d.nombre, 60) || POR_DEFECTO.nombre,
      entorno: ['testnet', 'mainnet', 'devnet'].indexOf(d.entorno) >= 0 ? d.entorno : 'testnet',
      chainId: chainId, chainIdHex: '0x' + chainId.toString(16),
      rpcUrls: rpcs, explorerUrl: explorador,
      moneda: {
        simbolo: /^[A-Za-z0-9.$_-]{1,12}$/.test(String(m.simbolo || '')) ? String(m.simbolo) : POR_DEFECTO.moneda.simbolo,
        nombre: texto(m.nombre, 40) || POR_DEFECTO.moneda.nombre,
        decimales: dec >= 0 && dec <= 36 && Math.floor(dec) === dec ? dec : 18
      },
      contratos: { items: dir(c.items, POR_DEFECTO.contratos.items), mensajes: dir(c.mensajes, POR_DEFECTO.contratos.mensajes) },
      revision: Number(d.revision) || 0
    };
  }

  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function leerCache() {
    try {
      var g = JSON.parse(global.localStorage.getItem(CLAVE) || 'null');
      // La caché de antes del cambio de RPC (Caldera) no se usa: está muerta.
      if (g && Array.isArray(g.rpcUrls) && g.rpcUrls.some(function (u) { return /caldera\.xyz/i.test(String(u)); })) return null;
      return validar(g);
    } catch (e) { return null; }
  }
  function guardar(r) { try { global.localStorage.setItem(CLAVE, JSON.stringify(r)); } catch (e) {} }

  var actual = leerCache() || validar(POR_DEFECTO);
  var promesa = null, ultimaCarga = 0;

  function cargar(forzar) {
    if (promesa && !forzar) return promesa;
    if (!forzar && Date.now() - ultimaCarga < 60000 && ultimaCarga) return Promise.resolve(copia(actual));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    promesa = fetch(apiBase() + '/api/red', { credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var nueva = validar(d);
        ultimaCarga = Date.now();
        if (nueva) {
          var cambia = JSON.stringify(nueva) !== JSON.stringify(actual);
          actual = nueva;
          guardar(nueva);
          if (cambia) { try { global.dispatchEvent(new CustomEvent('gf-red', { detail: copia(nueva) })); } catch (e) {} }
        }
        return copia(actual);
      })
      .catch(function () { return copia(actual); })
      .then(function (r) { if (reloj) clearTimeout(reloj); promesa = null; return r; });
    return promesa;
  }

  /* (2026-11-12) LA CARTERA CON EL RPC DE ANTES. Una MetaMask que ya tenía la cadena 4441
     la guarda con el RPC de Caldera, que ahora contesta 404: cambiar de red no lo toca y la
     firma acaba en "Internal JSON-RPC error". Antes de firmar se le pregunta a la cartera
     por el bloque; si no contesta, se le ofrece el RPC de ahora con wallet_addEthereumChain
     (MetaMask pregunta si lo añade a esa red) y, si aun así no contesta, se dice qué cambiar. */
  function rpcVivo(eth) {
    return Promise.race([
      Promise.resolve().then(function () { return eth.request({ method: 'eth_blockNumber' }); })
        .then(function (b) { return /^0x[0-9a-f]+$/i.test(String(b)); }, function () { return false; }),
      new Promise(function (ok) { setTimeout(function () { ok(false); }, 8000); })
    ]);
  }
  function errorDeRpc(w, rechazado, es) {
    var e = new Error(es
      ? (rechazado ? 'Rechazaste el RPC nuevo de la red. ' : 'Tu cartera no llega a ' + w.chainName + '. ') +
        'En tu cartera abre Redes → ' + w.chainName + ' y pon como RPC ' + w.rpcUrls[0]
      : (rechazado ? 'You declined the new network RPC. ' : 'Your wallet cannot reach ' + w.chainName + '. ') +
        'In your wallet open Networks → ' + w.chainName + ' and set the RPC URL to ' + w.rpcUrls[0]);
    e.code = 'GF_WALLET_RPC';
    return e;
  }
  /** Promesa: true si la cartera (ya en esta red) habla con un RPC vivo; si no, lanza un error que dice qué hacer. */
  function asegurarRpcCartera(eth, opciones) {
    if (!eth || typeof eth.request !== 'function') return Promise.resolve(false);
    var es = !!(opciones && opciones.idioma === 'es');
    return rpcVivo(eth).then(function (vivo) {
      if (vivo) return true;
      var w = global.GFRed.paraWallet();
      return Promise.resolve()
        .then(function () { return eth.request({ method: 'wallet_addEthereumChain', params: [w] }); })
        .then(function () { return rpcVivo(eth); }, function (e) { if (e && e.code === 4001) throw errorDeRpc(w, true, es); return false; })
        .then(function (ok) { if (!ok) throw errorDeRpc(w, false, es); return true; });
    });
  }

  global.GFRed = {
    actual: function () { return copia(actual); },
    asegurarRpcCartera: asegurarRpcCartera,
    listo: function () { return cargar(false); },
    recargar: function () { return cargar(true); },
    chainId: function () { return actual.chainId; },
    rpc: function () { return actual.rpcUrls[0]; },
    explorador: function () { return actual.explorerUrl; },
    tx: function (hash) { return /^0x[0-9a-fA-F]{64}$/.test(String(hash || '')) ? actual.explorerUrl + '/tx/' + hash : ''; },
    direccion: function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? actual.explorerUrl + '/address/' + a : ''; },
    /** Lo que pide wallet_addEthereumChain (EIP-3085). */
    paraWallet: function () {
      return { chainId: actual.chainIdHex, chainName: actual.nombre, rpcUrls: actual.rpcUrls.slice(),
        nativeCurrency: { name: actual.moneda.nombre, symbol: actual.moneda.simbolo, decimals: actual.moneda.decimales },
        blockExplorerUrls: [actual.explorerUrl] };
    },
    POR_DEFECTO: copia(POR_DEFECTO),
    _interno: { validar: validar, apiBase: apiBase }
  };
  // Sin esperar a nadie: la primera página que la necesite ya la tiene (o casi).
  try { cargar(false); } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
