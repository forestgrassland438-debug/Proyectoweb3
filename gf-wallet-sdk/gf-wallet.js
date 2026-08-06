/*!
 * GF Wallet SDK — login social + wallet embebida sobre LitVM
 * ============================================================================
 * Grassland Forest · v1.0.0
 *
 * QUÉ HACE
 *   Deja entrar al juego con Google, Facebook o Apple y crea automáticamente
 *   una wallet EVM (LitVM LiteForge, chainId 4441) para esa cuenta. El jugador
 *   nunca ve una clave privada ni tiene que aprobar firmas: el SDK firma el
 *   mensaje de acceso por él ("firmas invisibles").
 *
 * CÓMO GUARDA LA CLAVE  (resumen; el detalle está en docs/SEGURIDAD.md)
 *   La clave privada NUNCA viaja entera ni se guarda entera en ningún sitio.
 *   Se parte en dos mitades con un XOR de un solo uso:
 *
 *       claveDispositivo  →  IndexedDB de ESTE navegador
 *       claveServidor     →  base de datos del backend (cifrada en reposo)
 *       clave = claveDispositivo XOR claveServidor
 *
 *   Ninguna de las dos mitades, por sí sola, dice absolutamente nada de la
 *   clave (es un cifrado de Vernam: con una mitad, cualquier clave de 32 bytes
 *   es igual de probable). Hace falta robar el dispositivo Y el servidor.
 *
 *   Para entrar desde un dispositivo nuevo existe un CÓDIGO DE RECUPERACIÓN
 *   que se enseña una sola vez al crear la cuenta.
 *
 * LO QUE ESTE SDK **NO** PUEDE PROMETER
 *   No existe el software "antihackeable". Esto protege de: filtración de la
 *   base de datos, robo del backend, XSS que solo lea localStorage, y de que
 *   ningún empleado pueda firmar por el jugador. NO protege de: malware con
 *   control total del navegador de la víctima, ni de que alguien se apodere de
 *   la cuenta de Google/Facebook/Apple del jugador. Está todo detallado en
 *   docs/SEGURIDAD.md, sin adornos.
 *
 * DEPENDENCIA
 *   ethers v6 (UMD por CDN o como módulo). Se usa solo para derivar la
 *   dirección y firmar; nada de la criptografía de la bóveda depende de él.
 *
 * USO RÁPIDO
 *   const wallet = GFWallet.create({ apiBase: 'https://api.grasslandforest.com' });
 *   await wallet.init();
 *   const r = await wallet.loginWith('google');   // abre el popup
 *   if (r.needsRecoveryCode) { ... pedir el código y wallet.unlockWithRecoveryCode(code) }
 *   await wallet.signInToGame();                  // firma invisible + sesión del juego
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();                 // CommonJS / bundlers
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);                        // AMD
  } else {
    root.GFWallet = factory();                  // <script> clásico
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================================================
  // 0. CONFIGURACIÓN
  // ==========================================================================

  var VERSION = '1.0.0';

  var DEFAULTS = {
    // Backend del juego (donde están montadas las rutas del SDK y el login).
    apiBase: 'https://api.grasslandforest.com',
    // Nombre que aparece en el mensaje que se firma. DEBE coincidir con el
    // APP_NAME del backend o la firma no valida.
    appName: 'Grassland Forest',

    // Red LitVM LiteForge.
    chainId: 4441,
    chainIdHex: '0x1159',
    chainName: 'LitVM LiteForge',
    rpcUrl: 'https://liteforge.rpc.caldera.xyz/http',
    explorerUrl: 'https://liteforge.explorer.caldera.xyz',
    nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },

    // La clave descifrada se borra de memoria tras este tiempo sin actividad.
    autoLockMs: 30 * 60 * 1000,

    // Página que recoge la respuesta del proveedor OAuth y la devuelve al
    // popup padre. Debe estar servida en ESTE mismo origen.
    oauthCallbackPath: '/gf-oauth-callback.html',

    // Instancia de ethers. Si no se pasa, se busca window.ethers.
    ethers: null,

    debug: false
  };

  // ==========================================================================
  // 1. UTILIDADES BÁSICAS
  // ==========================================================================

  function log() {
    if (!_cfg || !_cfg.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[gf-wallet]');
    console.log.apply(console, args);
  }

  function err(msg, code) {
    var e = new Error(msg);
    e.code = code || 'gf_wallet_error';
    return e;
  }

  function getCrypto() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) {
      throw err(
        'Este navegador no tiene WebCrypto disponible. El SDK necesita HTTPS ' +
        '(o localhost): en http:// simple, crypto.subtle no existe.',
        'no_webcrypto'
      );
    }
    return c;
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    getCrypto().getRandomValues(b);
    return b;
  }

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
  }

  function hexToBytes(hex) {
    var h = String(hex).replace(/^0x/, '');
    if (h.length % 2) h = '0' + h;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64ToBytes(b64) {
    var s = atob(String(b64));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  /** XOR byte a byte. Las dos entradas deben medir lo mismo. */
  function xorBytes(a, b) {
    if (a.length !== b.length) throw err('xor: longitudes distintas', 'bad_xor');
    var out = new Uint8Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
  }

  /**
   * Borra un buffer de memoria. No es una garantía absoluta (el recolector de
   * basura de JS puede haber hecho copias), pero reduce la ventana en la que
   * la clave está legible en un volcado de memoria.
   */
  function wipe(bytes) {
    if (!bytes || !bytes.fill) return;
    try { bytes.fill(0); } catch (e) { /* buffer inmutable */ }
  }

  /** Comparación en tiempo constante (no filtra por dónde difieren). */
  function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  // ── Código de recuperación: base32 de Crockford ─────────────────────────
  // Son EXACTAMENTE 32 símbolos (0-9 y las letras sin I, L, O ni U). Quitar
  // esas cuatro elimina de raíz las confusiones al copiar a mano: sin O no hay
  // duda con el 0, y sin I ni L no la hay con el 1. La U se quita porque, al
  // combinarse al azar, aparecían palabras malsonantes.
  //
  // OJO: tiene que medir 32. Con 31 símbolos, el grupo de 5 bits que vale 31
  // devuelve `undefined` y el código sale corrupto (ese fue justo el fallo que
  // encontró la prueba de gf-wallet).
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function encodeRecoveryCode(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += B32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    // Grupos de 4 para que se pueda copiar a mano sin perderse.
    return out.replace(/(.{4})(?=.)/g, '$1-');
  }

  function decodeRecoveryCode(code) {
    // Se admite lo que el jugador escriba de verdad: minúsculas, espacios,
    // guiones y las confusiones clásicas (una O por un 0, una I o una L por
    // un 1). Es la tolerancia estándar de Crockford, y evita que alguien se
    // quede fuera de su cuenta por transcribir una letra.
    var clean = String(code || '')
      .toUpperCase()
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9A-Z]/g, '');

    // Un código real son 20 bytes → 32 símbolos. Si tras limpiar queda mucho
    // menos, es que se escribió mal o está incompleto: mejor decirlo así que
    // dejar que reviente luego con un críptico "no se pudo descifrar".
    if (clean.length < 32) {
      throw err('El código de recuperación está incompleto o mal escrito', 'bad_recovery_code');
    }

    var bits = 0, value = 0, out = [];
    for (var i = 0; i < clean.length; i++) {
      var idx = B32.indexOf(clean[i]);
      if (idx < 0) throw err('El código de recuperación tiene caracteres inválidos', 'bad_recovery_code');
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  // ==========================================================================
  // 2. CRIPTOGRAFÍA (WebCrypto)
  // ==========================================================================

  /**
   * Deriva una clave AES-256 a partir del código de recuperación.
   * PBKDF2-SHA256 con 310.000 iteraciones (recomendación OWASP 2023) para que
   * probar códigos a lo bruto sea carísimo.
   */
  async function keyFromRecoveryCode(code, saltBytes) {
    var c = getCrypto();
    var base = await c.subtle.importKey('raw', utf8(String(code).toUpperCase().replace(/-/g, '')),
      { name: 'PBKDF2' }, false, ['deriveBits']);
    var bits = await c.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: 310000, hash: 'SHA-256' },
      base, 256
    );
    return new Uint8Array(bits);
  }

  async function aesGcmEncrypt(keyBytes, plaintextBytes, aad) {
    var c = getCrypto();
    var key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    var iv = randomBytes(12);
    var params = { name: 'AES-GCM', iv: iv };
    if (aad) params.additionalData = utf8(aad);
    var ct = new Uint8Array(await c.subtle.encrypt(params, key, plaintextBytes));
    return { iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  async function aesGcmDecrypt(keyBytes, blob, aad) {
    var c = getCrypto();
    var key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    var params = { name: 'AES-GCM', iv: b64ToBytes(blob.iv) };
    if (aad) params.additionalData = utf8(aad);
    try {
      return new Uint8Array(await c.subtle.decrypt(params, key, b64ToBytes(blob.ct)));
    } catch (e) {
      throw err('No se pudo descifrar (código incorrecto o dato manipulado)', 'decrypt_failed');
    }
  }

  async function sha256Hex(bytes) {
    var h = await getCrypto().subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(h));
  }

  // ==========================================================================
  // 3. ALMACÉN DEL DISPOSITIVO (IndexedDB)
  // --------------------------------------------------------------------------
  // Se usa IndexedDB y NO localStorage a propósito:
  //   · localStorage es texto plano y cualquier script del origen lo lee de
  //     una línea; es el primer sitio donde mira un XSS.
  //   · IndexedDB guarda binario, no aparece en las herramientas de "ver
  //     almacenamiento" tan a mano, y sobre todo aquí se guarda SOLO UNA MITAD
  //     de la clave: aunque se la lleven entera, sin la mitad del servidor no
  //     vale para nada.
  // ==========================================================================

  var DB_NAME = 'gf-wallet';
  var DB_STORE = 'vault';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        return reject(err('Este navegador no tiene IndexedDB (¿modo privado muy restrictivo?)', 'no_indexeddb'));
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || err('No se pudo abrir IndexedDB', 'idb_open')); };
    });
  }

  function idbOp(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, mode);
        var store = tx.objectStore(DB_STORE);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  var deviceStore = {
    get: function (walletId) { return idbOp('readonly', function (s) { return s.get('device:' + walletId); }); },
    put: function (walletId, value) { return idbOp('readwrite', function (s) { return s.put(value, 'device:' + walletId); }); },
    del: function (walletId) { return idbOp('readwrite', function (s) { return s.delete('device:' + walletId); }); },
    putLast: function (value) { return idbOp('readwrite', function (s) { return s.put(value, 'last'); }); },
    getLast: function () { return idbOp('readonly', function (s) { return s.get('last'); }); },
    delLast: function () { return idbOp('readwrite', function (s) { return s.delete('last'); }); }
  };

  // ==========================================================================
  // 4. LLAMADAS AL BACKEND
  // ==========================================================================

  var _cfg = null;

  function apiUrl(path) {
    return _cfg.apiBase.replace(/\/$/, '') + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function readCookie(name) {
    if (typeof document === 'undefined' || !document.cookie) return null;
    var esc = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + esc + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function csrfToken() {
    var fromCookie = readCookie('csrf-token');
    if (fromCookie) return fromCookie;
    try {
      var r = await fetch(apiUrl('/api/auth/csrf-token'), { credentials: 'include', mode: 'cors' });
      if (r.ok) { var d = await r.json(); return d.csrfToken || null; }
    } catch (e) { /* sin red */ }
    return null;
  }

  async function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign(
      { 'Accept': 'application/json' },
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.headers || {}
    );
    if ((options.method || 'GET').toUpperCase() !== 'GET') {
      var t = await csrfToken();
      if (t) headers['X-CSRF-Token'] = t;
    }
    var res = await fetch(apiUrl(path), {
      method: options.method || 'GET',
      credentials: 'include',
      mode: 'cors',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
    if (!res.ok) {
      throw err((data && (data.message || data.error)) || ('HTTP ' + res.status), (data && data.error) || 'http_' + res.status);
    }
    return data;
  }

  // ==========================================================================
  // 5. OAUTH — Google · Facebook · Apple
  // --------------------------------------------------------------------------
  // Todo pasa por un POPUP y una página de retorno servida en NUESTRO origen
  // (oauthCallbackPath), que devuelve el resultado con postMessage. Nunca se
  // mete el proveedor en un iframe ni se le pasan datos del jugador.
  //
  // El `state` y el `nonce` los emite el SERVIDOR y los verifica el SERVIDOR:
  // así una respuesta de OAuth capturada no se puede reutilizar (anti-replay),
  // y un id_token pedido para OTRA aplicación no vale aquí (se comprueba el
  // `aud`). El cliente jamás decide si un token es bueno.
  // ==========================================================================

  function popupCentrado(url, nombre, w, h) {
    var y = (window.outerHeight - h) / 2 + window.screenY;
    var x = (window.outerWidth - w) / 2 + window.screenX;
    var p = window.open(url, nombre,
      'width=' + w + ',height=' + h + ',left=' + x + ',top=' + y +
      ',menubar=no,toolbar=no,location=no,status=no,scrollbars=yes');
    if (!p) throw err('El navegador bloqueó la ventana emergente. Permite los popups para iniciar sesión.', 'popup_blocked');
    return p;
  }

  /**
   * Abre el popup y espera el postMessage de la página de retorno.
   * Solo se aceptan mensajes de NUESTRO origen y con el `state` correcto.
   */
  function esperarRespuestaPopup(popup, stateEsperado, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var terminado = false;
      var miOrigen = window.location.origin;

      function limpiar() {
        terminado = true;
        window.removeEventListener('message', onMessage);
        clearInterval(vigilante);
        clearTimeout(reloj);
        try { if (popup && !popup.closed) popup.close(); } catch (e) {}
      }

      function onMessage(ev) {
        if (terminado) return;
        if (ev.origin !== miOrigen) return;            // ← mensaje de otro sitio: se ignora
        var d = ev.data;
        if (!d || d.__gfWallet !== 'oauth-result') return;
        if (d.state !== stateEsperado) return;         // ← respuesta de otro intento
        limpiar();
        if (d.error) reject(err(d.errorDescription || d.error, 'oauth_' + d.error));
        else resolve(d);
      }

      window.addEventListener('message', onMessage);

      var vigilante = setInterval(function () {
        if (popup && popup.closed && !terminado) {
          limpiar();
          reject(err('Cerraste la ventana de inicio de sesión', 'oauth_cancelled'));
        }
      }, 500);

      var reloj = setTimeout(function () {
        if (!terminado) { limpiar(); reject(err('El inicio de sesión tardó demasiado', 'oauth_timeout')); }
      }, timeoutMs || 3 * 60 * 1000);
    });
  }

  function construirUrl(base, params) {
    var u = new URL(base);
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) u.searchParams.set(k, params[k]);
    });
    return u.toString();
  }

  var PROVIDERS = {
    google: {
      label: 'Google',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      build: function (cfgProv, redirectUri, state, nonce) {
        return construirUrl(this.authUrl, {
          client_id: cfgProv.clientId,
          redirect_uri: redirectUri,
          // id_token directo: no hace falta intercambiar código ni guardar un
          // client_secret en el navegador (que nunca debe existir en cliente).
          response_type: 'id_token',
          scope: 'openid email profile',
          state: state,
          nonce: nonce,
          prompt: 'select_account',
          response_mode: 'fragment'
        });
      }
    },

    facebook: {
      label: 'Facebook',
      authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      build: function (cfgProv, redirectUri, state, nonce) {
        // Facebook no emite id_token OIDC salvo con "Limited Login" (iOS), así
        // que se pide un access_token y lo valida el SERVIDOR contra
        // debug_token + /me. El cliente nunca da por buena la identidad.
        return construirUrl(this.authUrl, {
          client_id: cfgProv.appId,
          redirect_uri: redirectUri,
          response_type: 'token',
          scope: 'public_profile,email',
          state: state,
          auth_type: 'rerequest'
        });
      }
    },

    apple: {
      label: 'Apple',
      authUrl: 'https://appleid.apple.com/auth/authorize',
      build: function (cfgProv, redirectUri, state, nonce) {
        // Apple obliga a form_post cuando se piden datos del usuario, así que
        // el retorno va a una ruta del BACKEND, que responde con una página que
        // hace el postMessage al popup padre. Ver /api/wallet/oauth/apple/callback.
        return construirUrl(this.authUrl, {
          client_id: cfgProv.clientId,
          redirect_uri: cfgProv.redirectUri,
          response_type: 'code id_token',
          response_mode: 'form_post',
          scope: 'name email',
          state: state,
          nonce: nonce
        });
      }
    }
  };

  // ==========================================================================
  // 6. WALLET (ethers)
  // ==========================================================================

  function getEthers() {
    var e = (_cfg && _cfg.ethers) || (typeof window !== 'undefined' && window.ethers) || null;
    if (!e || !e.Wallet) {
      throw err(
        'No se encontró ethers v6. Carga <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.10.0/ethers.umd.min.js"></script> ' +
        'antes del SDK, o pásalo con GFWallet.create({ ethers }).',
        'no_ethers'
      );
    }
    return e;
  }

  /**
   * Convierte 32 bytes en una cuenta EVM válida.
   * secp256k1 no admite 0 ni valores >= n; la probabilidad de caer ahí con
   * bytes aleatorios es despreciable, pero se comprueba igual y se vuelve a
   * sortear: una clave inválida sería un fallo silencioso muy feo.
   */
  function claveValida(bytes) {
    var E = getEthers();
    try {
      var w = new E.Wallet('0x' + bytesToHex(bytes));
      return !!w.address;
    } catch (e) { return false; }
  }

  function generarClavePrivada() {
    for (var i = 0; i < 8; i++) {
      var b = randomBytes(32);
      if (claveValida(b)) return b;
      wipe(b);
    }
    throw err('No se pudo generar una clave válida', 'keygen_failed');
  }

  // ==========================================================================
  // 7. PROVEEDOR EIP-1193
  // --------------------------------------------------------------------------
  // Para que el resto del juego (y cualquier código que espere `window.ethereum`)
  // funcione igual con la wallet embebida.
  //
  // eth_sendTransaction se RECHAZA a propósito: en Grassland Forest todas las
  // transacciones las manda el relayer del backend, que además paga el gas. Una
  // wallet embebida que pudiera firmar transacciones arbitrarias desde el
  // navegador sería justo el agujero que este diseño quiere evitar.
  // ==========================================================================

  function crearProveedor(wallet) {
    var oyentes = {};

    function emitir(evento, dato) {
      (oyentes[evento] || []).forEach(function (fn) {
        try { fn(dato); } catch (e) { console.error('[gf-wallet] error en oyente', evento, e); }
      });
    }

    var provider = {
      isGFWallet: true,
      isMetaMask: false,
      _gfWallet: wallet,

      request: async function (args) {
        var method = args && args.method;
        var params = (args && args.params) || [];

        switch (method) {
          case 'eth_accounts':
            return wallet.getAddress() ? [wallet.getAddress()] : [];

          case 'eth_requestAccounts': {
            if (!wallet.isUnlocked()) await wallet.unlock();
            var a = wallet.getAddress();
            emitir('accountsChanged', a ? [a] : []);
            return a ? [a] : [];
          }

          case 'eth_chainId':
            return _cfg.chainIdHex;

          case 'net_version':
            return String(_cfg.chainId);

          case 'personal_sign': {
            // personal_sign(message, address)
            var mensaje = params[0];
            return wallet.signMessage(mensaje);
          }

          case 'eth_sign':
            throw err('eth_sign está desactivado por seguridad (permite firmar cualquier cosa a ciegas). Usa personal_sign.', 'unsupported_method');

          case 'eth_signTypedData_v4': {
            var payload = params[1];
            return wallet.signTypedData(typeof payload === 'string' ? JSON.parse(payload) : payload);
          }

          case 'wallet_switchEthereumChain':
            // La wallet embebida vive solo en LitVM: cambiar de red no aplica.
            if (params[0] && params[0].chainId && params[0].chainId !== _cfg.chainIdHex) {
              throw err('Esta wallet solo opera en ' + _cfg.chainName, 'unsupported_chain');
            }
            return null;

          case 'wallet_addEthereumChain':
            return null; // ya estamos en la red correcta

          case 'wallet_revokePermissions':
            await wallet.lock();
            emitir('accountsChanged', []);
            return null;

          case 'eth_sendTransaction':
          case 'eth_signTransaction':
            throw err(
              'Esta wallet no envía transacciones desde el navegador: en Grassland Forest ' +
              'las manda el relayer del backend (y paga el gas).',
              'unsupported_method'
            );

          default: {
            // Lecturas de la cadena: se reenvían al RPC público. Solo métodos
            // de lectura; nada que pueda mover fondos.
            if (/^(eth_(getBalance|blockNumber|call|estimateGas|getTransactionReceipt|getTransactionByHash|getCode|getLogs|gasPrice|getBlockByNumber))$/.test(method)) {
              var r = await fetch(_cfg.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params })
              });
              var j = await r.json();
              if (j.error) throw err(j.error.message || 'error RPC', 'rpc_error');
              return j.result;
            }
            throw err('Método no soportado por la wallet embebida: ' + method, 'unsupported_method');
          }
        }
      },

      on: function (evento, fn) {
        (oyentes[evento] = oyentes[evento] || []).push(fn);
        return provider;
      },
      removeListener: function (evento, fn) {
        oyentes[evento] = (oyentes[evento] || []).filter(function (f) { return f !== fn; });
        return provider;
      },
      _emit: emitir
    };

    return provider;
  }

  // ==========================================================================
  // 8. CLASE PRINCIPAL
  // ==========================================================================

  function GFWalletInstance(config) {
    _cfg = Object.assign({}, DEFAULTS, config || {});
    this.config = _cfg;

    this._privKey   = null;   // Uint8Array(32) — SOLO en memoria, nunca se guarda
    this._signer    = null;   // ethers.Wallet
    this._address   = null;
    this._walletId  = null;   // identificador opaco de la cuenta social
    this._ticket    = null;   // permiso corto emitido por el backend tras el OAuth
    this._provider  = null;
    this._lockTimer = null;
    this._remoteCfg = null;
  }

  GFWalletInstance.prototype = {

    // ── Ciclo de vida ────────────────────────────────────────────────────

    /** Carga la configuración pública (client ids) desde el backend. */
    init: async function () {
      try {
        this._remoteCfg = await apiFetch('/api/wallet/config');
        log('config remota', this._remoteCfg);
      } catch (e) {
        log('no se pudo leer /api/wallet/config:', e.message);
        this._remoteCfg = { providers: {} };
      }
      this._provider = crearProveedor(this);
      return this;
    },

    getProvider: function () {
      if (!this._provider) this._provider = crearProveedor(this);
      return this._provider;
    },

    getAddress: function () { return this._address; },
    isUnlocked: function () { return !!this._privKey; },
    getVersion: function () { return VERSION; },

    /** Proveedores realmente configurados en el backend. */
    availableProviders: function () {
      var p = (this._remoteCfg && this._remoteCfg.providers) || {};
      return Object.keys(PROVIDERS).filter(function (k) { return p[k] && p[k].enabled; });
    },

    // ── Login social ─────────────────────────────────────────────────────

    /**
     * Abre el popup del proveedor, verifica la identidad EN EL SERVIDOR y deja
     * la wallet lista para firmar.
     *
     * @param {'google'|'facebook'|'apple'} proveedor
     * @returns {Promise<{address:string, isNew:boolean, needsRecoveryCode:boolean, recoveryCode?:string}>}
     *   `recoveryCode` SOLO viene la primera vez: hay que enseñárselo al jugador
     *   y no vuelve a estar disponible nunca más.
     */
    loginWith: async function (proveedor) {
      var spec = PROVIDERS[proveedor];
      if (!spec) throw err('Proveedor desconocido: ' + proveedor, 'bad_provider');

      var cfgProv = (this._remoteCfg && this._remoteCfg.providers && this._remoteCfg.providers[proveedor]) || null;
      if (!cfgProv || !cfgProv.enabled) {
        throw err('El inicio de sesión con ' + spec.label + ' no está configurado en el servidor.', 'provider_disabled');
      }

      // 1. El SERVIDOR emite state y nonce (anti-replay). El cliente solo los transporta.
      var inicio = await apiFetch('/api/wallet/oauth/start', {
        method: 'POST',
        body: { provider: proveedor }
      });

      // 2. Popup del proveedor.
      var redirectUri = cfgProv.redirectUri || (window.location.origin + _cfg.oauthCallbackPath);
      var url = spec.build(cfgProv, redirectUri, inicio.state, inicio.nonce);
      log('abriendo', proveedor, url);

      var popup = popupCentrado(url, 'gf-oauth-' + proveedor, 480, 660);
      var resp = await esperarRespuestaPopup(popup, inicio.state);

      // 3. El SERVIDOR valida el token contra las claves públicas del proveedor.
      var verificado = await apiFetch('/api/wallet/oauth/verify', {
        method: 'POST',
        body: {
          provider: proveedor,
          state: inicio.state,
          idToken: resp.idToken || null,
          accessToken: resp.accessToken || null,
          code: resp.code || null
        }
      });

      this._ticket   = verificado.ticket;
      this._walletId = verificado.walletId;

      // 4. ¿Ya existe bóveda para esta identidad?
      if (!verificado.exists) {
        return await this._crearBoveda(verificado);
      }
      return await this._abrirBoveda(verificado);
    },

    /** Primera vez: se genera la clave, se parte y se guardan las mitades. */
    _crearBoveda: async function (verificado) {
      log('creando bóveda nueva');

      var priv = generarClavePrivada();
      var E = getEthers();
      var signer = new E.Wallet('0x' + bytesToHex(priv));

      // Partición XOR de un solo uso: mitad dispositivo + mitad servidor.
      // El `deviceId` identifica a ESTE navegador dentro de la cuenta: el
      // servidor guarda una mitad por dispositivo, así que vincular otro más
      // adelante no invalida este.
      var deviceId         = bytesToHex(randomBytes(16));
      var mitadDispositivo = randomBytes(32);
      var mitadServidor    = xorBytes(priv, mitadDispositivo);

      // Código de recuperación (20 bytes = 160 bits) para dispositivos nuevos.
      var recoveryBytes = randomBytes(20);
      var recoveryCode  = encodeRecoveryCode(recoveryBytes);
      var recoverySalt  = randomBytes(16);
      var recoveryKey   = await keyFromRecoveryCode(recoveryCode, recoverySalt);
      // Se cifra la CLAVE ENTERA con el código: es el único camino que no
      // depende del dispositivo. El servidor guarda solo el cifrado; sin el
      // código, ese blob es ruido.
      var recoveryBlob  = await aesGcmEncrypt(recoveryKey, priv, 'gf-wallet-recovery:' + this._walletId);
      wipe(recoveryKey);

      await apiFetch('/api/wallet/vault', {
        method: 'POST',
        body: {
          ticket: this._ticket,
          address: signer.address,
          deviceId: deviceId,
          serverShare: bytesToB64(mitadServidor),
          recovery: { salt: bytesToB64(recoverySalt), iv: recoveryBlob.iv, ct: recoveryBlob.ct },
          // Huella de la clave, para detectar mitades corruptas al reconstruir.
          keyFingerprint: await sha256Hex(utf8(signer.address.toLowerCase()))
        }
      });

      await deviceStore.put(this._walletId, {
        deviceId: deviceId,
        share: bytesToB64(mitadDispositivo),
        address: signer.address,
        createdAt: Date.now()
      });
      await deviceStore.putLast({ walletId: this._walletId, address: signer.address });

      wipe(mitadServidor);
      wipe(mitadDispositivo);

      this._aplicarClave(priv, signer);

      return {
        address: signer.address,
        isNew: true,
        needsRecoveryCode: false,
        // ⚠️ ÚNICA vez que este código existe fuera de la cabeza del jugador.
        recoveryCode: recoveryCode
      };
    },

    /**
     * Ya existe: se junta la mitad de ESTE dispositivo con la que el servidor
     * guarda para ESTE dispositivo.
     *
     * Se pide siempre por `deviceId`. Antes se pedía "la" mitad del servidor,
     * que era una sola para toda la cuenta: al vincular un segundo dispositivo
     * se sobrescribía y el primero dejaba de poder reconstruir la clave.
     */
    _abrirBoveda: async function (verificado) {
      var guardado = await deviceStore.get(this._walletId);

      if (!guardado || !guardado.share) {
        // Dispositivo nuevo (o se limpió el navegador): hace falta el código.
        log('sin mitad de dispositivo → se necesita el código de recuperación');
        return {
          address: verificado.address || null,
          isNew: false,
          needsRecoveryCode: true
        };
      }

      var url = '/api/wallet/vault?ticket=' + encodeURIComponent(this._ticket);
      // Las bóvedas creadas antes del arreglo no tienen deviceId guardado: se
      // pide sin él y el servidor devuelve la mitad antigua para migrarla.
      if (guardado.deviceId) url += '&deviceId=' + encodeURIComponent(guardado.deviceId);

      var datos = await apiFetch(url);

      if (!datos.serverShare) {
        // El servidor no reconoce este dispositivo (se vinculó en otro sitio y
        // aquí quedó una mitad huérfana). Se limpia y se pide el código.
        log('el servidor no tiene mitad para este dispositivo → código de recuperación');
        try { await deviceStore.del(this._walletId); } catch (e) {}
        return {
          address: datos.address || verificado.address || null,
          isNew: false,
          needsRecoveryCode: true
        };
      }

      var mitadServidor    = b64ToBytes(datos.serverShare);
      var mitadDispositivo = b64ToBytes(guardado.share);
      var priv = xorBytes(mitadDispositivo, mitadServidor);
      wipe(mitadServidor);

      var E = getEthers();
      var signer;
      try { signer = new E.Wallet('0x' + bytesToHex(priv)); }
      catch (e) { wipe(priv); wipe(mitadDispositivo); throw err('Las mitades de la clave no encajan', 'vault_corrupt'); }

      if (datos.address && signer.address.toLowerCase() !== String(datos.address).toLowerCase()) {
        wipe(priv);
        wipe(mitadDispositivo);
        // No es un error del jugador: es que este dispositivo perdió su pareja.
        // Se limpia lo local y se le ofrece el camino del código, en vez de
        // dejarlo con un mensaje sin salida.
        try { await deviceStore.del(this._walletId); } catch (e) {}
        return {
          address: datos.address,
          isNew: false,
          needsRecoveryCode: true,
          relinked: true
        };
      }

      // MIGRACIÓN: la bóveda venía del formato viejo (una sola mitad). Ahora
      // que la clave está reconstruida, se vincula este dispositivo con su
      // propio deviceId para que los siguientes no se pisen entre ellos.
      if (datos.legacy || !guardado.deviceId) {
        try {
          await this._vincularEsteDispositivo(priv, signer.address);
          log('bóveda migrada al formato por dispositivo');
        } catch (e) {
          log('no se pudo migrar la bóveda (no crítico):', e && e.message);
        }
      }
      wipe(mitadDispositivo);

      this._aplicarClave(priv, signer);
      await deviceStore.putLast({ walletId: this._walletId, address: signer.address });

      return { address: signer.address, isNew: false, needsRecoveryCode: false };
    },

    /**
     * Reparte la clave para ESTE dispositivo y sube su mitad al servidor.
     * No toca la de ningún otro dispositivo de la cuenta.
     */
    _vincularEsteDispositivo: async function (priv, address) {
      var deviceId         = bytesToHex(randomBytes(16));
      var mitadDispositivo = randomBytes(32);
      var mitadServidor    = xorBytes(priv, mitadDispositivo);

      await apiFetch('/api/wallet/vault/link', {
        method: 'POST',
        body: {
          ticket: this._ticket,
          deviceId: deviceId,
          serverShare: bytesToB64(mitadServidor)
        }
      });

      await deviceStore.put(this._walletId, {
        deviceId: deviceId,
        share: bytesToB64(mitadDispositivo),
        address: address,
        createdAt: Date.now()
      });
      await deviceStore.putLast({ walletId: this._walletId, address: address });

      wipe(mitadServidor);
      wipe(mitadDispositivo);
      return deviceId;
    },

    /**
     * Entrar desde un dispositivo nuevo con el código de recuperación.
     *
     * Al terminar, este dispositivo queda vinculado con SU PROPIA pareja de
     * mitades. Los que ya estaban vinculados siguen entrando sin código: el
     * servidor guarda una mitad por dispositivo, no una para toda la cuenta.
     */
    unlockWithRecoveryCode: async function (codigo) {
      if (!this._ticket) throw err('Primero inicia sesión con tu proveedor', 'no_ticket');

      var datos = await apiFetch('/api/wallet/vault?ticket=' + encodeURIComponent(this._ticket) + '&recovery=1');
      if (!datos.recovery) throw err('Esta cuenta no tiene copia de recuperación', 'no_recovery');

      var recoveryKey = await keyFromRecoveryCode(codigo, b64ToBytes(datos.recovery.salt));
      var priv;
      try {
        priv = await aesGcmDecrypt(recoveryKey, datos.recovery, 'gf-wallet-recovery:' + this._walletId);
      } finally {
        wipe(recoveryKey);
      }

      var E = getEthers();
      var signer = new E.Wallet('0x' + bytesToHex(priv));
      if (datos.address && signer.address.toLowerCase() !== String(datos.address).toLowerCase()) {
        wipe(priv);
        throw err('El código no corresponde a esta cuenta', 'recovery_mismatch');
      }

      // Se vincula ESTE dispositivo con su propia pareja de mitades. Los demás
      // dispositivos ya vinculados siguen funcionando: cada uno tiene la suya.
      await this._vincularEsteDispositivo(priv, signer.address);

      this._aplicarClave(priv, signer);
      return { address: signer.address, isNew: false, needsRecoveryCode: false };
    },

    _aplicarClave: function (priv, signer) {
      this._privKey = priv;
      this._signer  = signer;
      this._address = signer.address;
      this._armarAutoLock();
      if (this._provider) this._provider._emit('accountsChanged', [this._address]);
      log('wallet lista:', this._address);
    },

    // ── Bloqueo ──────────────────────────────────────────────────────────

    _armarAutoLock: function () {
      var self = this;
      clearTimeout(this._lockTimer);
      if (!_cfg.autoLockMs) return;
      this._lockTimer = setTimeout(function () {
        log('auto-bloqueo por inactividad');
        self.lock();
      }, _cfg.autoLockMs);
    },

    /** Borra la clave de memoria. La cuenta sigue existiendo. */
    lock: async function () {
      wipe(this._privKey);
      this._privKey = null;
      this._signer  = null;
      clearTimeout(this._lockTimer);
      if (this._provider) this._provider._emit('accountsChanged', []);
    },

    /** Vuelve a abrir la bóveda del último jugador de ESTE dispositivo. */
    unlock: async function () {
      if (this.isUnlocked()) return { address: this._address };
      var ultimo = await deviceStore.getLast();
      if (!ultimo || !ultimo.walletId) {
        throw err('No hay ninguna sesión guardada en este dispositivo. Inicia sesión otra vez.', 'no_session');
      }
      this._walletId = ultimo.walletId;
      // Hace falta un ticket vivo: se pide con la sesión del juego (cookie).
      var t = await apiFetch('/api/wallet/ticket', { method: 'POST', body: { walletId: this._walletId } });
      this._ticket = t.ticket;
      return await this._abrirBoveda({ address: ultimo.address });
    },

    /** Cierra sesión y BORRA la mitad de este dispositivo. */
    logout: async function (opciones) {
      opciones = opciones || {};
      await this.lock();
      if (opciones.forgetDevice !== false && this._walletId) {
        try { await deviceStore.del(this._walletId); } catch (e) {}
      }
      try { await deviceStore.delLast(); } catch (e) {}
      this._walletId = null;
      this._ticket   = null;
      this._address  = null;
    },

    // ── Firma ────────────────────────────────────────────────────────────

    signMessage: async function (mensaje) {
      if (!this.isUnlocked()) throw err('La wallet está bloqueada', 'locked');
      this._armarAutoLock();
      return await this._signer.signMessage(mensaje);
    },

    signTypedData: async function (typed) {
      if (!this.isUnlocked()) throw err('La wallet está bloqueada', 'locked');
      this._armarAutoLock();
      var dominio = typed.domain, tipos = Object.assign({}, typed.types);
      delete tipos.EIP712Domain;   // ethers lo añade solo
      return await this._signer.signTypedData(dominio, tipos, typed.message);
    },

    // ── Entrar al juego (firma invisible) ────────────────────────────────

    /**
     * Hace el login del juego con la MISMA ruta que MetaMask
     * (/api/auth/nonce + /api/auth/login), pero firmando en silencio.
     * El backend no necesita saber que la wallet es embebida: lo único que ve
     * es una dirección y una firma válida.
     */
    signInToGame: async function () {
      if (!this.isUnlocked()) throw err('La wallet está bloqueada', 'locked');
      var address = this._address.toLowerCase();

      var n = await apiFetch('/api/auth/nonce?address=' + encodeURIComponent(address));
      if (!n || !n.nonce) throw err('El servidor no devolvió un nonce', 'no_nonce');

      var timestamp = Math.floor(Date.now() / 1000);
      var token = n.nonce + ':' + timestamp;
      var encoded = btoa(unescape(encodeURIComponent(token)));
      var message = 'Signing in to ' + _cfg.appName + ': ' + encoded;

      var signature = await this.signMessage(message);

      var login = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { address: address, signature: signature, token: token, message: message }
      });

      log('sesión del juego iniciada', login.playerName);
      return login;
    }
  };

  // ==========================================================================
  // 9. API PÚBLICA
  // ==========================================================================

  var _instancia = null;

  return {
    VERSION: VERSION,
    PROVIDERS: Object.keys(PROVIDERS),

    /** Crea (o devuelve) la instancia del SDK. */
    create: function (config) {
      if (!_instancia) _instancia = new GFWalletInstance(config);
      else if (config) Object.assign(_instancia.config, config);
      return _instancia;
    },

    get: function () { return _instancia; },

    /**
     * Instala la wallet como `window.ethereum` SOLO si no hay ninguna wallet
     * inyectada. Nunca pisa MetaMask: si el jugador tiene extensión, manda la
     * extensión.
     */
    installAsWindowEthereum: function (wallet) {
      if (typeof window === 'undefined') return false;
      if (window.ethereum) return false;
      try {
        Object.defineProperty(window, 'ethereum', {
          value: wallet.getProvider(), writable: false, configurable: true
        });
        return true;
      } catch (e) {
        window.ethereum = wallet.getProvider();
        return true;
      }
    },

    // Utilidades expuestas para las pruebas y para la interfaz.
    _internals: {
      encodeRecoveryCode: encodeRecoveryCode,
      decodeRecoveryCode: decodeRecoveryCode,
      xorBytes: xorBytes,
      bytesToHex: bytesToHex,
      hexToBytes: hexToBytes,
      bytesToB64: bytesToB64,
      b64ToBytes: b64ToBytes,
      timingSafeEqual: timingSafeEqual
    }
  };
}));
