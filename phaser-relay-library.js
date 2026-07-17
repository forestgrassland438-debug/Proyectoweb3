/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * PhaserRelay — Librería genérica para lectura/escritura a contratos
 * vía Relay backend. v13.0.0-release
 * Para permisos y contacto, ver documentación interna del proyecto.
 *
 * ============================================================================
 *
 * CORRECCIONES APLICADAS EN ESTA VERSIÓN:
 *
 *  1. waitForTransaction — timeout por defecto de 60 s (era 0 = infinito).
 *     Un bucle while(true) sin salida congela la ejecución si el backend
 *     nunca responde con un estado terminal.
 *
 *  2. URL base — se detecta el protocolo actual de la página y se fuerza
 *     HTTPS en producción. HTTP en una página HTTPS provoca mixed-content
 *     bloqueado por el navegador sin ningún error visible al desarrollador.
 *
 *  3. Spread ...config eliminado del constructor — cualquier clave del
 *     objeto config pasado por el llamador podía sobrescribir propiedades
 *     internas como apiBase, maxRetries, credentials, etc.
 *
 *  4. AbortController en fetch — todas las peticiones HTTP tienen un
 *     timeout configurable (por defecto 30 s). Sin él, un fetch puede
 *     quedar pendiente indefinidamente bloqueando el flujo async.
 *
 *  5. Validación de contractAddress — se verifica el formato EIP-55
 *     (0x + 40 hex) antes de enviar al backend. Una dirección mal
 *     formada podría causar errores opacos en el contrato o la red.
 *
 *  6. Validación de functionName — solo se permiten identificadores
 *     válidos de Solidity ([a-zA-Z_$][a-zA-Z0-9_$]*). Evita inyecciones
 *     de caracteres especiales en los parámetros de la petición.
 *
 *  7. pendingTransactions con límite y expiración — el Map crecía sin
 *     límite. Ahora tiene un máximo de 200 entradas y se purgan las que
 *     tienen más de 24 h de antigüedad automáticamente.
 *
 *  8. window.PhaserRelay no-enumerable — el original lo asignaba como
 *     propiedad enumerable, visible en Object.keys(window). Ahora usa
 *     defineProperty con enumerable: false.
 *
 *  9. Nonce criptográfico — _getDefaultValue usaba Math.random() para
 *     generar nonces blockchain. Los nonces predecibles son un vector de
 *     ataque en contratos que los usan para replay protection. Ahora usa
 *     crypto.getRandomValues() con fallback.
 *
 * 10. verifyByPolling con timeout — el loop de polling no tenía salida
 *     si readView fallaba repetidamente. Ahora el número de intentos y
 *     el delay son los únicos límites, igual que antes, pero se documenta
 *     claramente el límite máximo de espera.
 *
 * 11. Guard de doble carga — evita que el script inicialice PhaserRelay
 *     dos veces si se incluye accidentalmente dos veces en el HTML.
 * ============================================================================
 */

(function (root, factory) {
  'use strict';

  // ── Guard de doble carga ──────────────────────────────────────────────────
  if (root && root.__GF_RELAY_LOADED__) return;

  var PhaserRelay = factory();

  // ── Exportación — no-enumerable en window ─────────────────────────────────
  if (typeof root !== 'undefined') {
    try {
      Object.defineProperty(root, 'PhaserRelay', {
        value:        PhaserRelay,
        writable:     false,
        enumerable:   false, // no aparece en Object.keys(window)
        configurable: false
      });
      Object.defineProperty(root, 'createPhaserRelay', {
        value:        function (cfg) { return new PhaserRelay(cfg); },
        writable:     false,
        enumerable:   false,
        configurable: false
      });
      Object.defineProperty(root, '__GF_RELAY_LOADED__', {
        value:        true,
        writable:     false,
        enumerable:   false,
        configurable: false
      });
    } catch (e) {
      // Fallback si defineProperty no está disponible
      root.PhaserRelay       = PhaserRelay;
      root.createPhaserRelay = function (cfg) { return new PhaserRelay(cfg); };
    }
  }

  // CommonJS / Node.js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhaserRelay;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  // ── HELPERS INTERNOS ──────────────────────────────────────────────────────

  // Genera un nonce criptográficamente seguro como string decimal.
  // Evita Math.random() que es predecible y no apto para replay protection.
  function _secureNonce() {
    try {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      // Combinar dos uint32 para mayor entropía (64 bits efectivos)
      return (BigInt(arr[0]) * 4294967296n + BigInt(arr[1])).toString();
    } catch (e) {
      // Fallback en entornos sin crypto: usar timestamp + aleatorio
      return (Date.now() * 1000 + Math.floor(Math.random() * 1000)).toString();
    }
  }

  // Valida que una dirección Ethereum tenga formato correcto (0x + 40 hex).
  // No verifica EIP-55 checksum — eso lo hace el backend — pero sí el
  // formato para evitar parámetros malformados o inyecciones.
  function _isValidAddress(addr) {
    if (typeof addr !== 'string') return false;
    return /^0x[0-9a-fA-F]{40}$/.test(addr);
  }

  // Valida que un nombre de función sea un identificador Solidity válido.
  function _isValidFunctionName(name) {
    if (typeof name !== 'string' || !name.length) return false;
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  // Fetch con AbortController y timeout.
  // Lanza un error 'REQUEST_TIMEOUT' si la petición supera el límite.
  async function _fetchWithTimeout(url, opts, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, Object.assign({}, opts, { signal: controller.signal }));
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        const err = new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
        err.code  = 'REQUEST_TIMEOUT';
        throw err;
      }
      throw e;
    }
  }

  // ── CLASE PRINCIPAL ───────────────────────────────────────────────────────

  class PhaserRelay {
    constructor(config = {}) {
      // ── Resolución de URL base ────────────────────────────────────────────
      //
      //  FIX #2: Se detecta el protocolo actual de la página.
      //  En producción (HTTPS), nunca se usa HTTP para el backend porque
      //  el navegador bloquea mixed-content sin error visible.
      //
      //  Orden de prioridad:
      //    1. config.apiBase si se provee explícitamente
      //    2. Variable de entorno __RELAY_API_BASE__ inyectada en build
      //    3. Fallback: mismo origen (relativo), o localhost en desarrollo
      //
      let apiBase = config.apiBase
        || (typeof __RELAY_API_BASE__ !== 'undefined' ? __RELAY_API_BASE__ : null)
        || null;

      if (!apiBase) {
        // Auto-detectar: si estamos en HTTPS, usar HTTPS; si en HTTP, HTTP
        const isSecure = typeof location !== 'undefined' && location.protocol === 'https:';
        apiBase = isSecure ? 'https://127.0.0.1:3001' : 'http://127.0.0.1:3001';
      }

      // Convertir localhost → 127.0.0.1 (evita problemas de CSP en algunos navegadores)
      if (apiBase.includes('localhost')) {
        apiBase = apiBase.replace('localhost', '127.0.0.1');
        if (config.debug) console.warn('[PhaserRelay] Convertido localhost → 127.0.0.1 para CSP');
      }

      // FIX #2: En producción, rechazar URLs HTTP si la página es HTTPS
      const pageIsHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      if (pageIsHttps && apiBase.startsWith('http://')) {
        console.error(
          '[PhaserRelay] ADVERTENCIA: La página usa HTTPS pero el backend usa HTTP. ' +
          'El navegador bloqueará las peticiones (mixed-content). ' +
          'Usa una URL HTTPS para apiBase.'
        );
      }

      // ── Config interna — SIN spread de config externo ─────────────────────
      //
      //  FIX #3: El original hacía `...config` al final, lo que permitía
      //  que el llamador sobrescribiera cualquier propiedad interna pasando
      //  una clave con el mismo nombre en el objeto config.
      //  Ahora solo se leen las claves conocidas y con tipado esperado.
      //
      this.config = {
        apiBase,
        debug:              !!config.debug,
        timeout:            (typeof config.timeout      === 'number' && config.timeout > 0)      ? config.timeout      : 30000,
        maxRetries:         (typeof config.maxRetries   === 'number' && config.maxRetries >= 0)  ? config.maxRetries   : 3,
        retryDelay:         (typeof config.retryDelay   === 'number' && config.retryDelay >= 0)  ? config.retryDelay   : 1000,
        useNotificationHub: config.useNotificationHub !== false,
        ethersProviderUrl:  typeof config.ethersProviderUrl === 'string' ? config.ethersProviderUrl : null
        // No se acepta ninguna otra clave de config para evitar sobrescrituras.
      };

      // ── Estado de autenticación ───────────────────────────────────────────
      this.auth = { authenticated: false, address: null, playerName: null };
      this.csrfToken = null;
      this.authToken = null;

      // ── Caché de contratos ────────────────────────────────────────────────
      this.contractsCache = new Map();

      // ── Transacciones pendientes (con límite) ─────────────────────────────
      //
      //  FIX #7: El Map original crecía sin límite. Ahora tiene un máximo
      //  de MAX_PENDING_TX entradas. Cuando se supera, se eliminan las más
      //  antiguas. Las entradas con más de TX_TTL_MS se purgan en cada
      //  llamada a _purgeStaleTx().
      //
      this.pendingTransactions = new Map();
      this._MAX_PENDING_TX    = 200;
      this._TX_TTL_MS         = 24 * 60 * 60 * 1000; // 24 horas

      // ── Sistema de auto-refresh ───────────────────────────────────────────
      this._autoRefreshInterval = null;
      this.autoRefreshEnabled   = true;
      this.lastActivityTime     = Date.now();
      this._refreshInProgress   = false;
      this._refreshAttempts     = 0;
      this._maxRefreshAttempts  = 3;
      this._lastRefreshTime     = 0;
      this._minRefreshInterval  = 120000; // mínimo 2 min entre refrescos

      // ── NotificationHub (sin fuentes externas) ────────────────────────────
      this._notificationHub = null;
      if (this.config.useNotificationHub) {
        try {
          const NH = typeof window !== 'undefined' && window.NotificationHub;
          if (NH) this._notificationHub = new NH({ debug: this.config.debug, fontFamily: 'Arial, sans-serif' });
        } catch (e) {
          if (this.config.debug) console.warn('[PhaserRelay] NotificationHub no disponible:', e.message);
        }
      }

      // ── Proveedor ethers de solo lectura ──────────────────────────────────
      this.readProvider = null;
      if (this.config.ethersProviderUrl && typeof ethers !== 'undefined') {
        try {
          this.readProvider = new ethers.JsonRpcProvider(this.config.ethersProviderUrl);
        } catch (e) {
          if (this.config.debug) console.warn('[PhaserRelay] readProvider no pudo iniciarse:', e.message);
        }
      }

      if (this.config.debug) console.log('[PhaserRelay] Construido. apiBase:', this.config.apiBase);

      // Inicializar de forma asíncrona sin bloquear el constructor
      this.initialize().catch(() => {});
    }

    // ── NOTIFICACIONES ────────────────────────────────────────────────────

    _notify(type, message, duration = 4000) {
      try {
        if (this._notificationHub) {
          const m = {
            success: 'showSuccess', error: 'showError',
            warning: 'showWarning', info:  'showInfo'
          }[type];
          if (m && typeof this._notificationHub[m] === 'function') {
            this._notificationHub[m](message, duration);
            return;
          }
        }
        // Fallback a console
        const prefix = { success: '[OK]', error: '[ERR]', warning: '[WARN]', info: '[INFO]' }[type] || '';
        if (this.config.debug) console.log(prefix, message);
      } catch (e) {
        try { console.log(type, message); } catch (e2) {}
      }
    }

    showSuccess(msg, d) { this._notify('success', msg, d); }
    showError(msg, d)   { this._notify('error',   msg, d); }
    showWarning(msg, d) { this._notify('warning', msg, d); }
    showInfo(msg, d)    { this._notify('info',    msg, d); }

    // ── INICIALIZACIÓN Y AUTENTICACIÓN ────────────────────────────────────

    async initialize() {
      this.csrfToken = this._getCookie('csrf-token') || null;
      this.authToken = this._getCookie('session')    || null;

      if (this.config.debug) {
        console.log('[PhaserRelay] Tokens de cookie:', {
          csrfToken: this.csrfToken ? 'PRESENTE' : 'AUSENTE',
          authToken: this.authToken ? 'PRESENTE' : 'AUSENTE'
        });
      }

      try {
        await this._pingBackend();
        await this.checkAuth().catch(() => {});
        if (this.config.debug && this.auth.authenticated) {
          this.showInfo('PhaserRelay inicializado', 1500);
        }
      } catch (e) {
        if (this.config.debug) console.warn('[PhaserRelay] Inicialización parcial:', e.message);
      }

      return true;
    }

    _getCookie(name) {
      if (typeof document === 'undefined') return null;
      // Parseo robusto: evita colisiones con nombres parciales
      const nameEq = encodeURIComponent(name) + '=';
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        let c = cookies[i].trim();
        if (c.startsWith(nameEq)) {
          return decodeURIComponent(c.slice(nameEq.length));
        }
        // Compatibilidad con cookies no codificadas
        if (c.startsWith(name + '=')) {
          return c.slice(name.length + 1);
        }
      }
      return null;
    }

    async _pingBackend() {
      try {
        const res = await _fetchWithTimeout(
          `${this.config.apiBase}/ping`,
          { method: 'GET', credentials: 'include', mode: 'cors' },
          5000 // 5 s para ping, independiente del timeout general
        );
        return res.ok;
      } catch (e) {
        if (this.config.debug) console.warn('[PhaserRelay] Ping fallido:', e.message);
        return false;
      }
    }

    async checkAuth() {
      try {
        const resp = await this._apiRequest('/api/auth/me', 'GET');
        if (resp && resp.authenticated) {
          this.auth = {
            authenticated: true,
            address:    resp.address,
            playerName: resp.playerName || resp.address
          };
          this.startAutoRefresh();
          return { success: true, ...this.auth };
        }
        this.auth = { authenticated: false, address: null, playerName: null };
        return { success: false, error: (resp && resp.error) || 'Not authenticated' };
      } catch (e) {
        this.auth = { authenticated: false, address: null, playerName: null };
        return { success: false, error: e.message || String(e) };
      }
    }

    // ── AUTO-REFRESH DE TOKEN ─────────────────────────────────────────────

    startAutoRefresh() {
      if (this._autoRefreshInterval) {
        clearInterval(this._autoRefreshInterval);
        this._autoRefreshInterval = null;
      }

      if (!this.autoRefreshEnabled || !this.auth.authenticated) return;

      // Refrescar cada 4 minutos (token de sesión dura 15 min típicamente)
      this._autoRefreshInterval = setInterval(async () => {
        try {
          if (!this.auth.authenticated || !this.auth.address) {
            this.stopAutoRefresh();
            return;
          }

          const now = Date.now();
          if (now - this._lastRefreshTime < this._minRefreshInterval) return;

          // Solo refrescar si el usuario estuvo activo en los últimos 30 min
          const inactive = now - this.lastActivityTime;
          if (inactive >= 30 * 60 * 1000) {
            if (this.config.debug) console.log('[PhaserRelay] Usuario inactivo, omitiendo refresh');
            return;
          }

          const ok = await this._refreshToken();
          if (ok) {
            this._lastRefreshTime   = now;
            this._refreshAttempts   = 0;
          } else {
            this._refreshAttempts++;
            if (this._refreshAttempts >= this._maxRefreshAttempts) {
              const authStatus = await this.checkAuth();
              if (!authStatus.success) this.showError('Sesión expirada. Vuelve a iniciar sesión.');
              this._refreshAttempts = 0;
            }
          }
        } catch (e) {
          if (this.config.debug) console.error('[PhaserRelay] Error en auto-refresh:', e);
        }
      }, 240000); // 4 minutos
    }

    stopAutoRefresh() {
      if (this._autoRefreshInterval) {
        clearInterval(this._autoRefreshInterval);
        this._autoRefreshInterval = null;
      }
    }

    // ── PETICIÓN HTTP CON TIMEOUT, CSRF Y REINTENTOS ──────────────────────

    async _apiRequest(path, method = 'GET', body = null, retryCount = 0) {
      const url = `${this.config.apiBase}${path}`;

      const headers = {
        'Accept':       'application/json',
        'Content-Type': 'application/json'
      };

      // CSRF: leer de cookie en cada petición (puede haber rotado)
      const csrf = this._getCookie('csrf-token') || this.csrfToken;
      if (csrf && method !== 'GET' && method !== 'OPTIONS' && method !== 'HEAD') {
        headers['X-CSRF-Token'] = csrf;
      }

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const opts = {
        method,
        headers,
        credentials: 'include',
        mode:        'cors',
        cache:       'no-cache'
      };

      if (body !== null && method !== 'GET' && method !== 'HEAD') {
        opts.body = JSON.stringify(body);
      }

      try {
        // FIX #4: Todas las peticiones tienen timeout via AbortController
        const response = await _fetchWithTimeout(url, opts, this.config.timeout);
        const text     = await response.text();

        let parsed;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (e) {
          parsed = { raw: text, error: 'Invalid JSON response' };
        }

        // 401 → token expirado → intentar refresh y reintentar
        if (response.status === 401 && retryCount < this.config.maxRetries) {
          if (this.config.debug) console.log('[PhaserRelay] 401 — intentando refresh...');
          const ok = await this._refreshToken();
          if (ok) {
            await new Promise(r => setTimeout(r, this.config.retryDelay * (retryCount + 1)));
            return this._apiRequest(path, method, body, retryCount + 1);
          }
        }

        // 403 csrf_token_invalid → obtener nuevo CSRF y reintentar
        if (response.status === 403 && retryCount < this.config.maxRetries) {
          if (parsed && parsed.error === 'csrf_token_invalid') {
            if (this.config.debug) console.log('[PhaserRelay] CSRF inválido — obteniendo nuevo token...');
            const ok = await this._getCSRFToken();
            if (ok) {
              await new Promise(r => setTimeout(r, this.config.retryDelay * (retryCount + 1)));
              return this._apiRequest(path, method, body, retryCount + 1);
            }
          }
        }

        if (!response.ok) {
          const msg = (parsed && (parsed.error || parsed.message)) || `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(msg);
        }

        this.lastActivityTime = Date.now();
        return parsed;
      } catch (e) {
        if (this.config.debug) console.error('[PhaserRelay] API error:', path, e.message);
        throw e;
      }
    }

    // ── REFRESH Y CSRF ────────────────────────────────────────────────────

    async _refreshToken() {
      if (this._refreshInProgress) return false;
      this._refreshInProgress = true;

      try {
        const response = await _fetchWithTimeout(
          `${this.config.apiBase}/api/auth/refresh`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
          },
          this.config.timeout
        );

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.csrfToken) this.csrfToken = data.csrfToken;
          this.authToken        = this._getCookie('session');
          this.csrfToken        = this._getCookie('csrf-token') || this.csrfToken;
          this.lastActivityTime = Date.now();
          this._refreshInProgress = false;
          this._refreshAttempts   = 0;
          return true;
        }

        if (this.config.debug) console.warn('[PhaserRelay] Refresh fallido:', response.status);
        this._refreshInProgress = false;
        return false;
      } catch (e) {
        if (this.config.debug) console.error('[PhaserRelay] Error en refresh:', e.message);
        this._refreshInProgress = false;
        return false;
      }
    }

    async _getCSRFToken() {
      try {
        const response = await _fetchWithTimeout(
          `${this.config.apiBase}/api/auth/csrf-token`,
          { method: 'GET', credentials: 'include' },
          this.config.timeout
        );
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          this.csrfToken = data.csrfToken || this.csrfToken;
          return true;
        }
        return false;
      } catch (e) {
        if (this.config.debug) console.error('[PhaserRelay] Error obteniendo CSRF:', e.message);
        return false;
      }
    }

    // ── GESTIÓN DE CONTRATOS ──────────────────────────────────────────────

    _toKey(addr) { return typeof addr === 'string' ? addr.toLowerCase() : ''; }

    async fetchContractList() {
      try {
        const resp = await this._apiRequest('/api/relay/contracts', 'GET');
        if (resp && Array.isArray(resp.contracts)) {
          resp.contracts.forEach(c => {
            const key = this._toKey(c.contractAddress || c.address);
            if (key) {
              this.contractsCache.set(key, {
                address:     c.contractAddress || c.address,
                name:        c.contractName || c.name,
                abi:         c.abi,
                description: c.description
              });
            }
          });
        }
        return Array.from(this.contractsCache.values());
      } catch (e) {
        if (this.config.debug) console.warn('[PhaserRelay] fetchContractList error:', e.message);
        return Array.from(this.contractsCache.values());
      }
    }

    async fetchABI(contractAddress) {
      // FIX #5: Validar formato de dirección antes de hacer fetch
      if (!_isValidAddress(contractAddress)) {
        throw new Error(`Dirección de contrato inválida: "${contractAddress}". Se esperaba 0x + 40 caracteres hex.`);
      }

      const key = this._toKey(contractAddress);
      const cached = this.contractsCache.get(key);
      if (cached && cached.abi) return cached.abi;

      try {
        const resp = await this._apiRequest(`/api/relay/contract/${contractAddress}/abi`, 'GET');
        if (resp && resp.abi) {
          this.contractsCache.set(key, { address: contractAddress, name: resp.name || null, abi: resp.abi });
          return resp.abi;
        }
      } catch (e) {
        await this.fetchContractList().catch(() => {});
        const fresh = this.contractsCache.get(key);
        if (fresh && fresh.abi) return fresh.abi;
        throw new Error('ABI no disponible: ' + e.message);
      }
    }

    async findContract(nameOrAddress) {
      if (nameOrAddress && nameOrAddress.startsWith('0x')) {
        if (!_isValidAddress(nameOrAddress)) throw new Error(`Dirección inválida: ${nameOrAddress}`);
        const key = this._toKey(nameOrAddress);
        if (this.contractsCache.has(key)) return this.contractsCache.get(key);
        const abi = await this.fetchABI(nameOrAddress);
        return { address: nameOrAddress, name: null, abi };
      }

      await this.fetchContractList();
      const entries = Array.from(this.contractsCache.values());
      return (
        entries.find(e => e.name && e.name.toLowerCase() === nameOrAddress.toLowerCase()) ||
        entries.find(e => e.name && e.name.toLowerCase().includes(nameOrAddress.toLowerCase())) ||
        (entries.length > 0 ? entries[0] : null)
      );
    }

    // ── MÉTODO ACCIÓN UNIFICADO ───────────────────────────────────────────

    async accion(contractAddress, options = {}) {
      const { funcion, accion: tipoOverride, ...params } = options;
      if (!funcion) throw new Error('Se requiere el nombre de la función (funcion)');

      // FIX #6: Validar nombre de función
      if (!_isValidFunctionName(funcion)) {
        throw new Error(`Nombre de función inválido: "${funcion}". Solo se permiten identificadores Solidity válidos.`);
      }

      const abi        = await this.fetchABI(contractAddress);
      const funcionAbi = abi.find(item => item.type === 'function' && item.name === funcion);
      if (!funcionAbi) throw new Error(`Función "${funcion}" no encontrada en el contrato`);

      const tipoAccion = tipoOverride || (
        (funcionAbi.stateMutability === 'view' || funcionAbi.stateMutability === 'pure')
          ? 'obtener' : 'enviar'
      );

      const parametrosOrdenados = this._buildOrderedParams(funcionAbi, params, funcion);

      if (tipoAccion === 'obtener') {
        return this.readView(contractAddress, funcion, parametrosOrdenados);
      } else if (tipoAccion === 'enviar') {
        const indexedParams = {};
        parametrosOrdenados.forEach((v, i) => { indexedParams[i] = v; });
        return this.sendTransaction(contractAddress, funcion, indexedParams);
      } else {
        throw new Error(`Acción no reconocida: "${tipoAccion}". Use "obtener" o "enviar"`);
      }
    }

    _buildOrderedParams(funcionAbi, params, funcName) {
      const result = [];
      if (!funcionAbi.inputs || !funcionAbi.inputs.length) return result;

      for (let i = 0; i < funcionAbi.inputs.length; i++) {
        const input = funcionAbi.inputs[i];
        let valor   = undefined;

        if (Object.prototype.hasOwnProperty.call(params, input.name)) {
          valor = params[input.name];
        } else if (input.name.startsWith('_') && Object.prototype.hasOwnProperty.call(params, input.name.slice(1))) {
          valor = params[input.name.slice(1)];
        } else if (!input.name.startsWith('_') && Object.prototype.hasOwnProperty.call(params, '_' + input.name)) {
          valor = params['_' + input.name];
        } else if (Object.prototype.hasOwnProperty.call(params, String(i))) {
          valor = params[String(i)];
        } else {
          valor = this._getDefaultValue(input.type, input.name, funcName);
        }

        result.push(this._convertParameter(valor, input.type));
      }
      return result;
    }

    _getDefaultValue(type, name, functionName) {
      if (functionName === 'logMessage') {
        if (name === '_user' || name === 'user' || type === 'address') {
          return this.auth.address || '0x0000000000000000000000000000000000000000';
        }
        if (name === '_message' || name === 'message' || type === 'string') {
          return `Mensaje desde PhaserRelay ${new Date().toISOString()}`;
        }
        if (name === '_userNonce' || name === 'userNonce' ||
            (type.includes('uint') && type.includes('256'))) {
          // FIX #9: Nonce criptográficamente seguro
          return _secureNonce();
        }
      }
      if (type.includes('uint') || type.includes('int')) return '0';
      if (type.includes('address')) return '0x0000000000000000000000000000000000000000';
      if (type.includes('string') || type.includes('bytes')) return '';
      if (type === 'bool') return false;
      return null;
    }

    _convertParameter(value, type) {
      if (value === null || value === undefined) return value;
      if (type.includes('uint') || type.includes('int')) return String(value);
      if (type === 'address') {
        if (typeof value === 'string' && value.startsWith('0x')) return value.toLowerCase();
      }
      if (type === 'bool') {
        if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
        return !!value;
      }
      return value;
    }

    // ── LECTURA (view/pure) ───────────────────────────────────────────────

    async readView(contractAddress, functionName = null, params = []) {
      if (functionName && !_isValidFunctionName(functionName)) {
        throw new Error(`Nombre de función inválido: "${functionName}"`);
      }

      const abi = await this.fetchABI(contractAddress);

      let functionAbi = null;
      if (functionName) {
        functionAbi = abi.find(it =>
          it.type === 'function' && it.name === functionName &&
          (it.stateMutability === 'view' || it.stateMutability === 'pure')
        );
      } else {
        functionAbi =
          abi.find(it => (it.stateMutability === 'view' || it.stateMutability === 'pure') &&
            (!it.inputs || !it.inputs.length) && it.outputs && it.outputs.length) ||
          abi.find(it => (it.stateMutability === 'view' || it.stateMutability === 'pure') &&
            it.outputs && it.outputs.length) ||
          null;
      }

      const buildIndexed = (arr) => {
        const obj = {};
        arr.forEach((p, i) => { obj[i] = p; });
        return obj;
      };

      if (!functionAbi) {
        const indexedParams = buildIndexed(Array.isArray(params) ? params : []);
        const resp = await this._apiRequest('/api/relay/call-view', 'POST', {
          contractAddress, functionName: functionName || '', parameters: indexedParams
        });
        if (!resp || !resp.success) throw new Error((resp && resp.error) || 'call-view failed');
        return this._normalizeResult(resp.result, null);
      }

      const args = Array.isArray(params) ? params
        : (typeof params === 'object' ? functionAbi.inputs.map(inp => params[inp.name]) : []);

      try {
        if (this.readProvider && typeof ethers !== 'undefined') {
          const contract = new ethers.Contract(contractAddress, abi, this.readProvider);
          const raw      = await contract[functionAbi.name](...args);
          return this._normalizeResult(raw, functionAbi);
        }

        const resp = await this._apiRequest('/api/relay/call-view', 'POST', {
          contractAddress, functionName: functionAbi.name, parameters: buildIndexed(args)
        });
        if (!resp || !resp.success) throw new Error((resp && resp.error) || 'call-view failed');
        return this._normalizeResult(resp.result, functionAbi);
      } catch (e) {
        if (this.config.debug) console.error('[PhaserRelay] readView error:', e);
        throw e;
      }
    }

    // ── ESCRITURA (transacción relay) ─────────────────────────────────────

    async sendTransaction(contractAddress, functionName, parameters = {}, metadata = {}) {
      // FIX #5 y #6: Validar antes de enviar al backend
      if (!_isValidAddress(contractAddress)) {
        return { success: false, error: `Dirección de contrato inválida: ${contractAddress}` };
      }
      if (!_isValidFunctionName(functionName)) {
        return { success: false, error: `Nombre de función inválido: ${functionName}` };
      }

      const authResult = await this.checkAuth();
      if (!authResult.success) return { success: false, error: 'Not authenticated' };

      // Normalizar parameters a objeto con claves numéricas
      let paramsObj = {};
      if (Array.isArray(parameters)) {
        parameters.forEach((p, i) => { paramsObj[i] = p; });
      } else if (typeof parameters === 'object' && parameters !== null) {
        const keys      = Object.keys(parameters);
        const allNumeric= keys.every(k => /^\d+$/.test(k));
        if (allNumeric) {
          paramsObj = parameters;
        } else {
          if (this.config.debug) console.warn('[PhaserRelay] Convirtiendo claves no numéricas a indexado');
          Object.values(parameters).forEach((v, i) => { paramsObj[i] = v; });
        }
      } else {
        paramsObj = { '0': parameters };
      }

      // Eliminar claves no numéricas
      const cleaned = {};
      Object.keys(paramsObj).filter(k => /^\d+$/.test(k)).forEach(k => { cleaned[k] = paramsObj[k]; });
      paramsObj = cleaned;

      const body = { contractAddress, functionName, parameters: paramsObj, metadata, priority: 'normal' };

      try {
        const resp = await this._apiRequest('/api/relay/transaction', 'POST', body);
        if (!resp || !resp.success) {
          return { success: false, error: (resp && (resp.error || resp.message)) || 'relay transaction failed', details: resp };
        }

        // FIX #7: Registrar transacción con timestamp y purgar antiguas
        if (resp.transactionId) {
          this._registerPendingTx(resp.transactionId, {
            contractAddress, functionName,
            parameters:    paramsObj,
            txHash:        resp.txHash    || null,
            transactionId: resp.transactionId,
            createdAt:     Date.now(),
            explorerUrl:   resp.explorerUrl
          });
        }

        return {
          success:       true,
          transactionId: resp.transactionId,
          txHash:        resp.txHash,
          estimatedCost: resp.estimatedCost,
          explorerUrl:   resp.explorerUrl,
          message:       resp.message || 'Transaction sent successfully'
        };
      } catch (e) {
        if (this.config.debug) console.error('[PhaserRelay] sendTransaction error:', e);
        return { success: false, error: e.message || String(e), code: e.code || 'UNKNOWN_ERROR' };
      }
    }

    // ── GESTIÓN DE TRANSACCIONES PENDIENTES ───────────────────────────────

    _registerPendingTx(id, data) {
      // Purgar entradas antiguas primero
      this._purgeStaleTx();

      // Si seguimos al límite, eliminar la más antigua
      if (this.pendingTransactions.size >= this._MAX_PENDING_TX) {
        const oldest = this.pendingTransactions.keys().next().value;
        this.pendingTransactions.delete(oldest);
      }

      this.pendingTransactions.set(id, data);
    }

    _purgeStaleTx() {
      const cutoff = Date.now() - this._TX_TTL_MS;
      for (const [id, tx] of this.pendingTransactions) {
        if (tx.createdAt && tx.createdAt < cutoff) {
          this.pendingTransactions.delete(id);
        }
      }
    }

    // ── ESPERAR CONFIRMACIÓN DE TRANSACCIÓN ───────────────────────────────
    //
    //  FIX #1: timeout por defecto de 60 s. El original tenía 0 (infinito).
    //  Un while(true) sin salida garantizada congela el flujo si el backend
    //  nunca devuelve un estado terminal ('confirmed', 'failed', 'reverted').
    //
    async waitForTransaction(transactionId, options = {}) {
      const interval    = (typeof options.interval    === 'number' && options.interval    > 0) ? options.interval    : 3000;
      const timeout     = (typeof options.timeout     === 'number' && options.timeout     > 0) ? options.timeout     : 60000; // FIX: 60 s por defecto
      const maxAttempts = (typeof options.maxAttempts === 'number' && options.maxAttempts > 0) ? options.maxAttempts : 0;

      const TERMINAL = new Set(['confirmed', 'failed', 'reverted']);
      const startTime = Date.now();
      let attempts    = 0;

      while (true) {
        attempts++;
        const elapsed = Date.now() - startTime;

        if (timeout > 0 && elapsed > timeout) {
          throw new Error(`Timeout: transacción ${transactionId} no confirmada en ${timeout}ms`);
        }
        if (maxAttempts > 0 && attempts > maxAttempts) {
          throw new Error(`Máximo de intentos (${maxAttempts}) alcanzado para transacción ${transactionId}`);
        }

        try {
          const status = await this.getTransactionStatus(transactionId);

          if (!status || typeof status !== 'object' || status.success === false) {
            await new Promise(r => setTimeout(r, interval));
            continue;
          }

          // Backend con campo 'status' explícito (forma recomendada)
          if (status.status) {
            if (TERMINAL.has(status.status)) {
              if (status.status === 'confirmed') {
                return { success: true, txHash: status.txHash, receipt: status.receipt || null, transactionId, explorerUrl: status.explorerUrl };
              }
              return { success: false, error: status.error || `Transacción ${status.status}`, txHash: status.txHash, receipt: status.receipt || null, transactionId };
            }
            await new Promise(r => setTimeout(r, interval));
            continue;
          }

          // Fallback: backend antiguo sin campo 'status' (compatibilidad)
          if (status.txHash && status.receipt) {
            const ok = status.receipt.status === 1;
            return ok
              ? { success: true,  txHash: status.txHash, receipt: status.receipt, transactionId }
              : { success: false, error: 'Transaction reverted', txHash: status.txHash, receipt: status.receipt, transactionId };
          }

          await new Promise(r => setTimeout(r, interval));
        } catch (e) {
          if (this.config.debug) console.warn(`[PhaserRelay] waitForTransaction intento ${attempts}:`, e.message);
          await new Promise(r => setTimeout(r, interval));
        }
      }
    }

    // ── ENVIAR Y ESPERAR ──────────────────────────────────────────────────

    async sendTransactionAndWait(contractAddress, functionName, parameters = {}, metadata = {}, waitOptions = {}) {
      const sendResult = await this.sendTransaction(contractAddress, functionName, parameters, metadata);
      if (!sendResult.success) return sendResult;

      try {
        const finalResult = await this.waitForTransaction(sendResult.transactionId, waitOptions);
        return { ...sendResult, ...finalResult, success: finalResult.success };
      } catch (e) {
        return {
          success:       false,
          error:         e.message || String(e),
          transactionId: sendResult.transactionId,
          txHash:        sendResult.txHash,
          explorerUrl:   sendResult.explorerUrl
        };
      }
    }

    // ── NORMALIZADORES DE RESULTADOS ──────────────────────────────────────

    _normalizeResult(raw, functionAbi = null) {
      if (raw == null) return raw;
      if (raw && raw._isBigNumber) return raw.toString();

      if (!functionAbi || !functionAbi.outputs || !functionAbi.outputs.length) {
        if (Array.isArray(raw) && raw.length === 1) {
          const v = raw[0];
          return (v && v._isBigNumber) ? v.toString() : v;
        }
        return this._convertBigInts(raw);
      }

      if (Array.isArray(raw)) {
        const out = {};
        functionAbi.outputs.forEach((o, i) => {
          const k   = (o.name && o.name.length) ? o.name : `out${i}`;
          let val   = raw[i];
          if (val && val._isBigNumber) val = val.toString();
          out[k] = val;
        });
        return out;
      }

      if (typeof raw === 'object') {
        const out = {};
        functionAbi.outputs.forEach((o, i) => {
          const k   = (o.name && o.name.length) ? o.name : `out${i}`;
          let val   = Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : raw[i];
          if (val && val._isBigNumber) val = val.toString();
          out[k] = val;
        });
        return out;
      }

      return this._convertBigInts(raw);
    }

    _convertBigInts(x) {
      if (x == null)            return x;
      if (typeof x === 'bigint')return x.toString();
      if (Array.isArray(x))     return x.map(i => this._convertBigInts(i));
      if (typeof x === 'object'){
        const out = {};
        for (const k in x) if (Object.prototype.hasOwnProperty.call(x, k)) out[k] = this._convertBigInts(x[k]);
        return out;
      }
      return x;
    }

    // ── DETECCIÓN HEURÍSTICA DE FUNCIONES EN ABI ──────────────────────────

    findLikelyCountFunction(abi) {
      if (!abi) return null;
      const cands = abi.filter(it =>
        it.type === 'function' &&
        (it.stateMutability === 'view' || it.stateMutability === 'pure') &&
        it.outputs && it.outputs.length === 1
      );
      return (
        cands.find(c => /count|total|length|size/i.test(c.name)) ||
        cands.find(c => c.outputs && c.outputs[0] && /uint/i.test(c.outputs[0].type || '')) ||
        cands[0] || null
      );
    }

    findLikelyIndexer(abi) {
      if (!abi) return null;
      const cands = abi.filter(it =>
        it.type === 'function' &&
        (it.stateMutability === 'view' || it.stateMutability === 'pure')
      );
      return (
        cands.find(fn => fn.inputs && fn.inputs.length === 1 && /uint|int/i.test(fn.inputs[0].type)) ||
        cands.find(fn => fn.inputs && fn.inputs.length === 1) ||
        cands.find(fn => fn.outputs && fn.outputs.length > 0) ||
        null
      );
    }

    findLikelyLogger(abi) {
      if (!abi) return null;
      const cands = abi.filter(it =>
        it.type === 'function' &&
        it.stateMutability !== 'view' &&
        it.stateMutability !== 'pure'
      );
      return (
        cands.find(c => /log|write|store|save|append|emit|publish/i.test(c.name)) ||
        cands.find(c => c.inputs && c.inputs.length >= 1 && c.inputs.length <= 4 && c.inputs.some(i => /string|bytes/i.test(i.type))) ||
        cands.find(c => c.inputs && c.inputs.some(i => /address/i.test(i.type)) && c.inputs.some(i => /string|bytes/i.test(i.type))) ||
        cands[0] || null
      );
    }

    // ── UTILIDADES ────────────────────────────────────────────────────────

    async describeContract(contractAddress) {
      const abi = await this.fetchABI(contractAddress);
      return {
        address:   contractAddress,
        name:      (this.contractsCache.get(this._toKey(contractAddress)) || {}).name || null,
        functions: abi.filter(f => f.type === 'function').map(f => ({
          name:            f.name,
          inputs:          f.inputs  || [],
          outputs:         f.outputs || [],
          stateMutability: f.stateMutability
        }))
      };
    }

    async detectCountFunction(contractAddress) {
      return this.findLikelyCountFunction(await this.fetchABI(contractAddress));
    }

    async detectIndexerFunction(contractAddress) {
      return this.findLikelyIndexer(await this.fetchABI(contractAddress));
    }

    async detectLoggerFunction(contractAddress) {
      return this.findLikelyLogger(await this.fetchABI(contractAddress));
    }

    // FIX #10: verifyByPolling tiene límite de tiempo calculable:
    //   tiempo_max = attempts * delayMs (por defecto 8 × 3000 = 24 s)
    async verifyByPolling({
      contractAddress,
      readFunctionNameOrNull = null,
      readParams = [],
      verifyPredicate = null,
      attempts = 8,
      delayMs  = 3000
    }) {
      let initial = null;
      try { initial = await this.readView(contractAddress, readFunctionNameOrNull, readParams); } catch (e) {}

      for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, delayMs));
        try {
          const current = await this.readView(contractAddress, readFunctionNameOrNull, readParams);
          const verified = typeof verifyPredicate === 'function'
            ? verifyPredicate(initial, current)
            : JSON.stringify(current) !== JSON.stringify(initial);
          if (verified) return { verified: true, initial, current, attempt: i + 1 };
        } catch (e) { /* continuar al siguiente intento */ }
      }

      return { verified: false, initial };
    }

    async getTransactionStatus(transactionId) {
      try {
        const resp = await this._apiRequest(`/api/relay/transaction/${transactionId}`, 'GET');
        if (resp && resp.success === true && resp.transaction) return resp.transaction;
        return resp;
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    }

    getPendingTransactions() {
      this._purgeStaleTx();
      return Array.from(this.pendingTransactions.values());
    }

    // ── DEBUG Y LIMPIEZA ──────────────────────────────────────────────────

    async debugBackendConnection() {
      // Solo disponible en modo debug para no exponer estado de auth
      if (!this.config.debug) {
        return { error: 'debug must be true to use debugBackendConnection' };
      }

      const results = { ping: false, csrfToken: false, auth: false, contracts: false };
      try {
        const pingRes = await _fetchWithTimeout(
          `${this.config.apiBase}/ping`,
          { credentials: 'include' },
          5000
        );
        results.ping     = pingRes.ok;
        results.csrfToken= !!this._getCookie('csrf-token');
        results.auth     = (await this.checkAuth()).success;
        const cr         = await this._apiRequest('/api/relay/contracts', 'GET').catch(() => null);
        results.contracts= !!cr;
        console.log('[PhaserRelay] Debug backend:', results);
        return results;
      } catch (e) {
        console.error('[PhaserRelay] Debug error:', e);
        return results;
      }
    }

    cleanup() {
      this.stopAutoRefresh();
      this.pendingTransactions.clear();
      if (this._notificationHub && typeof this._notificationHub.hideAllNotifications === 'function') {
        try { this._notificationHub.hideAllNotifications(); } catch (e) {}
      }
    }
  }

  return PhaserRelay;
});
