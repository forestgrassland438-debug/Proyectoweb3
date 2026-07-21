/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * PhaserRPGPerf v2.2.2
 * Motor de performance para Phaser 3 con sistemas de pool, culling,
 * caché de capas, chunks dinámicos, partículas y rendimiento adaptativo.
 *
 * Para permisos y contacto, ver documentación interna del proyecto.
 *
 * VERSIÓN: v13.0.0-release / PhaserRPGPerf v2.2.2
 * ============================================================================
 *
 * PRINCIPIOS DE SEGURIDAD DE ESTE ARCHIVO:
 *
 *  1. NO sobreescribir Object.keys/values/entries.
 *     Phaser itera game.scene.keys internamente con ellos.
 *     Los tres archivos del ecosistema ya intentaban hacerlo —
 *     solo el primero en cargar ganaba, los demás fallaban silenciosamente.
 *
 *  2. NO envolver scene.keys en un Proxy que bloquee accesos.
 *     game.scene.start(), getScenes(), etc. dependen de leer .keys libremente.
 *
 *  3. NO interceptar console.log globalmente filtrando palabras como
 *     'game', 'scene', 'sys'. Eso hace imposible debuggear Phaser.
 *
 *  4. NO usar btoa() como "cifrado" de claves de escena.
 *     Es Base64 — reversible con atob() en 1 línea de consola.
 *     Las escenas se registran en Phaser con su nombre amigable.
 *
 *  5. NO exponer SecuritySystem en el objeto público window.PhaserRPGPerf.
 *     Cualquiera podría llamar PhaserRPGPerf.SecuritySystem.setDebugMode(true).
 *
 *  6. NO usar WEBGL_debug_renderer_info para detectar GPU.
 *     Esa extensión retorna el nombre exacto del hardware (fingerprinting).
 *     Se reemplaza por detección de capacidades de extensiones.
 * ============================================================================
 */

(function (global) {
  'use strict';

  // ── GUARD: solo ejecutar una vez ──────────────────────────────────────────
  if (global.__GF_PERF_LOADED__) return;

  // ── POLYFILLS DE COLECCIONES ──────────────────────────────────────────────
  (function ensureCollections() {
    if (typeof global.Map !== 'undefined') return;

    global.Map = function GFMap() { this._k = []; this._v = []; this.size = 0; };
    var Mp = global.Map.prototype;
    Mp.set = function (k, v) {
      var i = this._k.indexOf(k);
      if (i < 0) { this._k.push(k); this._v.push(v); this.size++; }
      else this._v[i] = v;
      return this;
    };
    Mp.get    = function (k) { var i = this._k.indexOf(k); return i < 0 ? undefined : this._v[i]; };
    Mp.has    = function (k) { return this._k.indexOf(k) >= 0; };
    Mp.delete = function (k) {
      var i = this._k.indexOf(k);
      if (i < 0) return false;
      this._k.splice(i, 1); this._v.splice(i, 1); this.size--;
      return true;
    };
    Mp.clear   = function () { this._k = []; this._v = []; this.size = 0; };
    Mp.forEach = function (cb, ctx) {
      for (var i = 0; i < this._k.length; i++) cb.call(ctx, this._v[i], this._k[i], this);
    };
    Mp.keys   = function () { var i = 0; var k = this._k; return { next: function () { return i < k.length ? { value: k[i++], done: false } : { done: true }; } }; };
    Mp.values = function () { var i = 0; var v = this._v; return { next: function () { return i < v.length ? { value: v[i++], done: false } : { done: true }; } }; };
    Mp.entries= function () { var i = 0; var s = this; return { next: function () { return i < s._k.length ? { value: [s._k[i], s._v[i++]], done: false } : { done: true }; } }; };
    if (typeof Symbol !== 'undefined' && Symbol.iterator) Mp[Symbol.iterator] = Mp.entries;
  })();

  (function ensureWeakMap() {
    if (typeof global.WeakMap !== 'undefined') return;
    global.WeakMap = function GFWeakMap() {
      this._id = '__gfwm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    };
    var Wp = global.WeakMap.prototype;
    Wp.set = function (k, v) {
      if (k === null || (typeof k !== 'object' && typeof k !== 'function'))
        throw new TypeError('WeakMap key must be an object');
      Object.defineProperty(k, this._id, { value: v, writable: true, configurable: true });
      return this;
    };
    Wp.get    = function (k) { return k && k[this._id]; };
    Wp.has    = function (k) { return k != null && this._id in Object(k); };
    Wp.delete = function (k) { if (!this.has(k)) return false; delete k[this._id]; return true; };
  })();

  (function ensureWeakSet() {
    if (typeof global.WeakSet !== 'undefined') return;
    global.WeakSet = function GFWeakSet() {
      this._wm = new global.WeakMap();
    };
    var Ws = global.WeakSet.prototype;
    Ws.add    = function (v) { this._wm.set(v, true); return this; };
    Ws.has    = function (v) { return this._wm.has(v); };
    Ws.delete = function (v) { return this._wm.delete(v); };
  })();

  // ── CONFIGURACIÓN CENTRAL ─────────────────────────────────────────────────
  //
  //  Debe coincidir con app.js. Fuente de verdad: una sola variable por flag.
  //  Para producción: ENV_MODE=1, SECURITY_ENABLED=true, DEBUG_MODE=false.
  //
  // FIX: este valor estaba hardcodeado en 0 (desarrollo) mientras que
  // app.js declara ENV_MODE = 1 (producción) — el comentario original de
  // esta misma sección exige que coincidan ("fuente de verdad: una sola
  // variable por flag"). La desincronización hacía, entre otras cosas, que
  // la redacción de detalles internos en producción de
  // ProblemDetector.getReport() nunca se activara. Ahora se lee en vivo de
  // window.__GF_ENV_MODE__ (fijado por app.js); si ese valor todavía no
  // existe por orden de carga de los <script>, se asume producción (1),
  // la opción más restrictiva/segura.
  const ENV_MODE = (typeof global.__GF_ENV_MODE__ === 'number') ? global.__GF_ENV_MODE__ : 1;
  const SECURITY_ENABLED = true;
  const DEBUG_MODE       = false; // false en producción. Actívalo en dev cuando lo necesites.

  // ── ERROR PROPIO ──────────────────────────────────────────────────────────
  class SecurityError extends Error {
    constructor(message) {
      super(message);
      this.name = 'SecurityError';
      if (Error.captureStackTrace) Error.captureStackTrace(this, SecurityError);
    }
  }

  // ── SISTEMA DE AISLAMIENTO DE INSTANCIAS ──────────────────────────────────
  //
  //  Registro privado de instancias PhaserRPGPerf mediante WeakMap.
  //  NO modifica Object.keys, NO toca la consola globalmente,
  //  NO envuelve la instancia en un Proxy que bloquee propiedades.
  //
  const PerfIsolation = {
    _instances:   new global.WeakMap(),
    _secureKey:   'perf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 15),
    _initialized: false,

    init() {
      if (this._initialized) return;
      this._initialized = true;
      safeLog('PerfIsolation inicializado');
    },

    // Registra la instancia en el WeakMap privado para tracking interno.
    // No devuelve un Proxy ni bloquea ninguna propiedad — Phaser necesita
    // acceso completo a las propiedades de la instancia.
    registerInstance(instance) {
      const id = this._secureKey + '_' + Date.now();
      this._instances.set(instance, id);
      return id;
    },

    destroy() {
      this._instances = new global.WeakMap();
    }
  };

  // Inicializar aislamiento
  PerfIsolation.init();

  // ── DETECTOR DE PROBLEMAS ─────────────────────────────────────────────────
  class ProblemDetector {
    constructor() {
      this.problems = new global.Map();
      this.warnings = new global.Map();
      this.checks   = new global.Map();
      this._setupDefaultChecks();
    }

    _setupDefaultChecks() {
      this.checks.set('phaser_global',   () => typeof Phaser !== 'undefined');
      this.checks.set('game_instance',   (inst) => !!(inst && inst.game));
      this.checks.set('scene_reference', (inst) => !inst || inst.scene !== null);
      this.checks.set('pool_manager',    (inst) => !inst.pool    || typeof inst.pool.spawn     === 'function');
      this.checks.set('cull_manager',    (inst) => !inst.cull    || typeof inst.cull.add       === 'function');
      this.checks.set('texture_cache',   (inst) => !inst.textureCache || typeof inst.textureCache.addTexture === 'function');
      this.checks.set('initialization_state', (inst) => inst._initialized !== undefined);
      this.checks.set('destruction_state',    (inst) => !inst._destroyed);
      this.checks.set('public_api', (inst) =>
        typeof inst.init    === 'function' &&
        typeof inst.destroy === 'function' &&
        typeof inst.getStats === 'function'
      );
    }

    scanInstance(instance) {
      this.problems.clear();
      this.warnings.clear();

      if (!instance) {
        this.problems.set('null_instance', 'La instancia es null o undefined');
        return this.getReport();
      }

      for (const [name, fn] of this.checks) {
        try {
          if (!fn(instance)) this.problems.set(name, `Check failed: ${name}`);
        } catch (e) {
          this.problems.set(name, `Check error: ${name} — ${e.message}`);
        }
      }

      this._performDeepScan(instance);
      return this.getReport();
    }

    _performDeepScan(instance) {
      const expectedMethods = [
        'init', 'destroy', 'getStats', 'createPool', 'spawnFromPool',
        'despawnToPool', 'addToCull', 'removeFromCull', 'cacheLayer',
        'createEmitter', 'applyPixelPerfect', 'enableHighPerformance'
      ];

      for (const method of expectedMethods) {
        if (typeof instance[method] !== 'function') {
          this.warnings.set(`missing_method_${method}`, `Método público faltante: ${method}`);
        }
      }

      this._checkCircularRefs(instance);

      if (instance.eventManager && instance.eventManager._listeners) {
        const count = Array.from(instance.eventManager._listeners.values())
          .reduce((s, ls) => s + ls.size, 0);
        if (count > 1000) this.warnings.set('high_listener_count', `Alto número de listeners: ${count}`);
      }
    }

    _checkCircularRefs(instance) {
      const visited = new global.WeakSet();
      const check = (obj, path) => {
        if (!obj || typeof obj !== 'object') return;
        if (visited.has(obj)) { this.warnings.set(`circular_${path}`, `Posible referencia circular: ${path}`); return; }
        visited.add(obj);
        try {
          ['game', 'scene', 'eventManager', 'pool', 'cull', 'layerCache'].forEach(prop => {
            if (obj[prop] && typeof obj[prop] === 'object' && obj[prop] !== instance) {
              check(obj[prop], `${path}.${prop}`);
            }
          });
        } catch (e) {}
        visited.delete(obj);
      };
      try { check(instance, 'root'); } catch (e) {}
    }

    getReport() {
      const severity = this.problems.size > 0 ? 'ERROR'
                     : this.warnings.size  > 0 ? 'WARNING'
                     : 'HEALTHY';

      // En producción no exponer detalles internos
      if (ENV_MODE === 1 && !DEBUG_MODE) {
        return { problems: [], warnings: [], severity: 'PROTECTED', timestamp: Date.now(), problemCount: 0, warningCount: 0 };
      }

      return {
        problems:      DEBUG_MODE ? Array.from(this.problems.entries()) : [],
        warnings:      DEBUG_MODE ? Array.from(this.warnings.entries()) : [],
        severity,
        timestamp:     Date.now(),
        problemCount:  this.problems.size,
        warningCount:  this.warnings.size
      };
    }

    clear() { this.problems.clear(); this.warnings.clear(); }
  }

  // ── HELPER: ID de listeners ───────────────────────────────────────────────
  const __ListenerIdMap = new global.WeakMap();
  let __ListenerIdCounter = 1;
  function __getListenerId(fn) {
    if (!fn) return 'null';
    if (!__ListenerIdMap.has(fn)) __ListenerIdMap.set(fn, __ListenerIdCounter++);
    return __ListenerIdMap.get(fn);
  }

  // ── DEFAULTS ──────────────────────────────────────────────────────────────
  const DEFAULTS = {
    chunkSizeTiles:   32,
    chunkRadius:       2,
    cullPadding:      64,
    defaultPoolSize:  50,
    maxRenderTextureSize: 8192,

    pixelArt:         true,
    roundPixels:      true,
    antialias:        false,
    preserveResolution: true,
    highPerformance:  true,
    antiFlicker:      true,
    preserveTextRendering: true,

    registrarRetryMs:    150,
    registrarRetryCount:  40,

    adaptiveEnabled:  true,
    maxFrameTime:     33,
    minFrameTime:     16,
    qualityLevels:    ['low', 'medium', 'high'],

    textureCacheSizeMB:  50,
    enableSmartCaching:  true,

    debug:           DEBUG_MODE && ENV_MODE === 0,
    logPerformance:  false,
    performanceSampleRate: 1000,

    enableProblemDetection: true,
    autoScanInterval:    30000,

    enableSpikeDetection:      true,
    spikeDetectionThreshold:   16,
    minFramesForSpikeAnalysis: 120,
    spikeCooldown:             5000
  };

  // ── SISTEMA DE SEGURIDAD (SIMPLIFICADO Y SIN EFECTOS COLATERALES) ─────────
  //
  //  Este objeto controla el modo debug del módulo.
  //  NO modifica Object.keys, console, scene.keys ni EventTarget.
  //  NO se expone en window.PhaserRPGPerf.
  //
  const SecuritySystem = {
    _debugMode: DEBUG_MODE,

    setDebugMode(enabled) {
      // Solo permitido en entorno de desarrollo
      this._debugMode = enabled && ENV_MODE === 0;
      safeLog(`[PERF-SECURITY] Debug mode: ${this._debugMode ? 'ON' : 'OFF'}`);
      return this._debugMode;
    },

    isDebugMode() { return this._debugMode; }
  };

  // ── UTILIDADES ────────────────────────────────────────────────────────────
  function randHex(len = 12) {
    try {
      const arr = new Uint8Array(Math.ceil(len / 2));
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
    } catch (e) {
      let s = '';
      const alpha = '0123456789abcdef';
      for (let i = 0; i < len; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
      return s;
    }
  }

  function safeLog(...args) {
    if (DEBUG_MODE && DEFAULTS.debug) {
      try { console.log('[PhaserRPGPerf]', ...args); } catch (e) {}
    }
  }

  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  }

  // ── PERFORMANCE MONITOR ───────────────────────────────────────────────────
  class PerformanceMonitor {
    constructor() {
      this.metrics    = new global.Map();
      this.sampleRate = DEFAULTS.performanceSampleRate;
      this.lastSample = 0;
    }

    start(key) {
      this.metrics.set(key, {
        start:    performance.now(),
        end:      0,
        duration: 0,
        calls:    (this.metrics.get(key)?.calls || 0) + 1
      });
    }

    end(key) {
      const m = this.metrics.get(key);
      if (!m) return;
      m.end      = performance.now();
      m.duration = m.end - m.start;

      if (DEFAULTS.logPerformance && performance.now() - this.lastSample > this.sampleRate) {
        safeLog(`Performance — ${key}: ${m.duration.toFixed(2)}ms (calls: ${m.calls})`);
        this.lastSample = performance.now();
      }
    }

    getMetric(key)  { return this.metrics.get(key); }
    clear()         { this.metrics.clear(); }

    getStats() {
      const stats = {};
      for (const [key, m] of this.metrics) {
        stats[key] = { duration: m.duration, calls: m.calls, average: m.calls > 0 ? m.duration / m.calls : 0 };
      }
      return stats;
    }
  }

  // ── ADVANCED PERFORMANCE MONITOR ──────────────────────────────────────────
  class AdvancedPerformanceMonitor extends PerformanceMonitor {
    constructor() {
      super();
      this.frameTimes         = [];
      this.memorySnapshots    = [];
      this.performanceObserver= null;
      this.longTaskObserver   = null;
      this.metricsHistory     = new global.Map();
      this.maxHistorySize     = 300;

      this._lastSpikeWarning      = 0;
      this._spikeDetectionEnabled = DEFAULTS.enableSpikeDetection;
      this._spikeThreshold        = DEFAULTS.spikeDetectionThreshold;
      this._lastWarning           = 0;

      this._initObservers();
    }

    _initObservers() {
      if (!global.PerformanceObserver) return;
      try {
        this.performanceObserver = new PerformanceObserver(list => {
          list.getEntries().forEach(e => {
            if (e.entryType === 'measure') this._recordMetric('perf_entries', e);
          });
        });
        this.performanceObserver.observe({ entryTypes: ['measure', 'mark', 'navigation', 'resource'] });
      } catch (e) {
        if (DEBUG_MODE) console.warn('PerformanceObserver no disponible:', e);
      }
      try {
        this.longTaskObserver = new PerformanceObserver(list => {
          list.getEntries().forEach(e => safeLog(`Long task: ${e.duration.toFixed(1)}ms`));
        });
        this.longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (e) { /* silencioso en producción */ }
    }

    startFrame() { this.start('frame'); this._lastFrameStart = performance.now(); }

    endFrame() {
      this.end('frame');
      const m = this.getMetric('frame');
      if (!m) return;
      this.frameTimes.push(m.duration);
      if (this.frameTimes.length > this.maxHistorySize) this.frameTimes.shift();
      this._analyzePerformanceTrends();
    }

    _analyzePerformanceTrends() {
      if (this.frameTimes.length < DEFAULTS.minFramesForSpikeAnalysis || !this._spikeDetectionEnabled) return;
      const recent    = this.frameTimes.slice(-60);
      const avgFrame  = recent.reduce((a, b) => a + b, 0) / 60;
      const frameRate = 1000 / avgFrame;
      if (frameRate < 30 && avgFrame > 5) this._triggerPerfWarning('low_fps', { frameRate, avgFrame });
      this._checkSpikes(recent, avgFrame);
    }

    _checkSpikes(recent, avgFrame) {
      const now = Date.now();
      if (now - this._lastSpikeWarning < DEFAULTS.spikeCooldown) return;
      if (avgFrame < 5) return;
      const threshold = Math.max(this._spikeThreshold, avgFrame * 2);
      const spikes    = recent.filter(t => t > threshold && t > 16).length;
      if (spikes > 5) {
        this._lastSpikeWarning = now;
        this._triggerPerfWarning('frame_spikes', { spikes, threshold, avgFrame: avgFrame.toFixed(2) });
      }
    }

    _triggerPerfWarning(type, data) {
      const now = Date.now();
      if (this._lastWarning && now - this._lastWarning < 1000) return;
      this._lastWarning = now;
      const warning = { type, data, timestamp: now, frameHistory: this.frameTimes.slice(-10) };
      safeLog('Performance warning:', warning);
      try {
        if (global.dispatchEvent) {
          global.dispatchEvent(new CustomEvent('phaserPerformanceWarning', { detail: warning }));
        }
      } catch (e) {}
    }

    setSpikeDetectionEnabled(enabled) {
      this._spikeDetectionEnabled = enabled;
      if (!enabled) this._lastSpikeWarning = 0;
    }

    setSpikeThreshold(threshold) { this._spikeThreshold = Math.max(1, threshold); }

    recordMemoryUsage() {
      const mem = performance && performance.memory;
      if (!mem) return;
      this.memorySnapshots.push({
        usedJSHeapSize:  mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        timestamp:       Date.now()
      });
      if (this.memorySnapshots.length > 100) this.memorySnapshots.shift();
    }

    _recordMetric(key, value) {
      if (!this.metricsHistory.has(key)) this.metricsHistory.set(key, []);
      const h = this.metricsHistory.get(key);
      h.push({ value, timestamp: Date.now() });
      if (h.length > this.maxHistorySize) h.shift();
    }

    getPerformanceReport() {
      return {
        ...super.getStats(),
        frames:          this._getFrameStats(),
        memory:          this._getMemoryStats(),
        metricsTracked:  this.metricsHistory.size,
        spikeDetection:  { enabled: this._spikeDetectionEnabled, threshold: this._spikeThreshold, lastWarning: this._lastSpikeWarning }
      };
    }

    _getFrameStats() {
      if (!this.frameTimes.length) return { avgFrameTime: 0, fps: 0, min: 0, max: 0, count: 0 };
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      return {
        avgFrameTime: avg,
        fps:          1000 / avg,
        min:          Math.min(...this.frameTimes),
        max:          Math.max(...this.frameTimes),
        count:        this.frameTimes.length,
        latest:       this.frameTimes[this.frameTimes.length - 1] || 0
      };
    }

    _getMemoryStats() {
      if (!this.memorySnapshots.length) return { snapshots: 0 };
      const l = this.memorySnapshots[this.memorySnapshots.length - 1];
      return {
        snapshots:     this.memorySnapshots.length,
        usedMB:        (l.usedJSHeapSize  / 1024 / 1024).toFixed(2),
        totalMB:       (l.totalJSHeapSize / 1024 / 1024).toFixed(2),
        limitMB:       (l.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
        usagePercent:  ((l.usedJSHeapSize / l.jsHeapSizeLimit) * 100).toFixed(1)
      };
    }

    destroy() {
      if (this.performanceObserver)  this.performanceObserver.disconnect();
      if (this.longTaskObserver)     this.longTaskObserver.disconnect();
      super.clear();
      this.frameTimes      = [];
      this.memorySnapshots = [];
      this.metricsHistory.clear();
    }
  }

  // ── ENHANCED EVENT MANAGER ────────────────────────────────────────────────
  class EnhancedEventManager {
    constructor(scene = null) {
      this.scene     = scene;
      this._listeners = new global.Map();
      this._pending   = new global.Set();
    }

    setScene(scene) { this.scene = scene; }

    addListener(event, callback, context = this) {
      if (!this.scene || !this.scene.events) {
        if (DEBUG_MODE) console.warn('EnhancedEventManager: sin escena para evento:', event);
        return () => {};
      }
      if (!this._listeners.has(event)) this._listeners.set(event, new global.Map());
      const key = this._listenerKey(callback, context);
      this._listeners.get(event).set(key, { callback, context });
      try { this.scene.events.on(event, callback, context); } catch (e) {
        if (DEBUG_MODE) console.warn('Error añadiendo listener:', e);
      }
      return () => this.removeListener(event, callback, context);
    }

    removeListener(event, callback, context = this) {
      const map = this._listeners.get(event);
      if (!map) return false;
      const key = this._listenerKey(callback, context);
      if (!map.has(key)) return false;
      try { this.scene.events.off(event, callback, context); } catch (e) {}
      map.delete(key);
      if (map.size === 0) this._listeners.delete(event);
      return true;
    }

    removeAllListeners(event = null) {
      if (event) {
        const map = this._listeners.get(event);
        if (!map) return;
        for (const { callback, context } of map.values()) {
          try { this.scene.events.off(event, callback, context); } catch (e) {}
        }
        this._listeners.delete(event);
      } else {
        for (const [ev, map] of this._listeners) {
          for (const { callback, context } of map.values()) {
            try { this.scene.events.off(ev, callback, context); } catch (e) {}
          }
        }
        this._listeners.clear();
      }
    }

    _listenerKey(cb, ctx) {
      return `${__getListenerId(cb)}_${ctx ? ctx.toString() : 'global'}`;
    }

    destroy() { this.removeAllListeners(); this._pending.clear(); }

    getStats() {
      let total = 0;
      for (const map of this._listeners.values()) total += map.size;
      return { totalEvents: this._listeners.size, totalListeners: total };
    }
  }

  // ── SECURE VAULT ─────────────────────────────────────────────────────────
  //
  //  Almacenamiento cifrado en memoria + localStorage.
  //
  //  LIMITACIÓN CONOCIDA Y DOCUMENTADA: La clave AES-GCM se genera en
  //  memoria en cada sesión. Los datos cifrados (v2) en localStorage
  //  solo son recuperables mientras la pestaña esté abierta. Al cerrar
  //  y reabrir, la clave se pierde y los datos v2 no son descifrables,
  //  por lo que caen al fallback v1 (JSON plano).
  //
  //  Si necesitas persistencia real entre sesiones, implementa un sistema
  //  de custodia de clave (key wrapping) o usa solo v1 consciente de ello.
  //
  const _crypto = (typeof crypto !== 'undefined') ? crypto : null;

  function _strToU8(str) {
    try { return new TextEncoder().encode(str); }
    catch (e) {
      const a = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i);
      return a;
    }
  }

  function _u8ToStr(u8) {
    try { return new TextDecoder().decode(u8); }
    catch (e) { return String.fromCharCode.apply(null, u8); }
  }

  function _bufToB64(buf) {
    try {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < u8.length; i += chunk) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
      }
      return btoa(bin);
    } catch (e) {
      if (DEBUG_MODE) console.warn('_bufToB64 failed:', e);
      return '';
    }
  }

  function _b64ToBuf(b64) {
    try {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return buf.buffer;
    } catch (e) {
      if (DEBUG_MODE) console.warn('_b64ToBuf failed:', e);
      return new ArrayBuffer(0);
    }
  }

  class SecureVault {
    constructor() {
      this.store      = new global.Map();
      this.sessionKey = null;
      this.PREFIX     = '__perf_vault_';
      this.initialized        = false;
      this.encryptionEnabled  = false;
      this._init();
    }

    async _init() {
      try {
        if (_crypto && _crypto.subtle) {
          this.sessionKey = await _crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
          );
          this.encryptionEnabled = true;
        }
        this.initialized = true;
        safeLog('SecureVault inicializado — cifrado:', this.encryptionEnabled);
      } catch (e) {
        if (DEBUG_MODE) console.warn('SecureVault: Web Crypto no disponible, usando fallback v1');
        this.initialized = true;
      }
    }

    async set(name, value, opts = {}) {
      if (!this.initialized) await this._init();
      const key = String(name);
      this.store.set(key, value);
      if (!opts.persist) return true;

      if (!this.encryptionEnabled || !this.sessionKey) {
        return this._fallbackSet(key, value);
      }
      try {
        const iv  = _crypto.getRandomValues(new Uint8Array(12));
        const ct  = await _crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          this.sessionKey,
          _strToU8(JSON.stringify(value))
        );
        localStorage.setItem(this.PREFIX + key, JSON.stringify({
          v: 2, iv: _bufToB64(iv.buffer), ct: _bufToB64(ct), timestamp: Date.now()
        }));
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('SecureVault: cifrado fallido, usando fallback:', e);
        return this._fallbackSet(key, value);
      }
    }

    _fallbackSet(key, value) {
      try {
        localStorage.setItem(this.PREFIX + key, JSON.stringify({ v: 1, data: value, timestamp: Date.now() }));
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('SecureVault: localStorage fallido:', e);
        return false;
      }
    }

    async get(name, opts = {}) {
      if (!this.initialized) await this._init();
      const key = String(name);
      if (this.store.has(key)) return this.store.get(key);
      if (!opts.persist) return undefined;

      try {
        const raw = localStorage.getItem(this.PREFIX + key);
        if (!raw) return undefined;
        const payload = JSON.parse(raw);

        if (payload.v === 2 && this.encryptionEnabled && this.sessionKey) {
          try {
            const plain = await _crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: new Uint8Array(_b64ToBuf(payload.iv)) },
              this.sessionKey,
              _b64ToBuf(payload.ct)
            );
            const val = JSON.parse(_u8ToStr(new Uint8Array(plain)));
            this.store.set(key, val);
            return val;
          } catch (e) {
            // Clave de sesión expiró — dato v2 no recuperable
            if (DEBUG_MODE) console.warn('SecureVault: dato v2 no descifrable (clave de sesión perdida):', key);
            return undefined;
          }
        }

        if (payload.v === 1) {
          this.store.set(key, payload.data);
          return payload.data;
        }

        return undefined;
      } catch (e) {
        if (DEBUG_MODE) console.warn('SecureVault.get error:', e);
        return undefined;
      }
    }

    clearMemory()         { this.store.clear(); }
    removePersisted(name) { try { localStorage.removeItem(this.PREFIX + String(name)); } catch (e) {} }

    clearAllPersisted() {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith(this.PREFIX)) localStorage.removeItem(k);
        });
      } catch (e) {}
    }

    getStats() {
      return { memItems: this.store.size, initialized: this.initialized, encryptionEnabled: this.encryptionEnabled };
    }
  }

  // ── SMART TEXTURE CACHE ───────────────────────────────────────────────────
  class SmartTextureCache {
    constructor(scene, maxSizeMB = 50) {
      this.scene       = scene;
      this.cache       = new global.Map();
      this.accessCount = new global.Map();
      this.creationTime= new global.Map();
      this.maxSize     = maxSizeMB * 1024 * 1024;
      this.currentSize = 0;
      this.hits        = 0;
      this.misses      = 0;
      this.enabled     = true;
    }

    _calcSize(texture) {
      if (!texture || !texture.source) return 0;
      try {
        const src = Array.isArray(texture.source) ? texture.source[0] : texture.source;
        if (!src) return 0;
        return (src.width || texture.width || 0) * (src.height || texture.height || 0) * 4;
      } catch (e) { return 0; }
    }

    _evict(targetSize = 0) {
      if (this.currentSize <= targetSize) return;
      const sorted = Array.from(this.cache.entries())
        .map(([k, t]) => ({ k, t, lastAccess: this.accessCount.get(k) || 0, size: this._calcSize(t) }))
        .sort((a, b) => a.lastAccess - b.lastAccess);

      let freed = 0;
      const need = this.currentSize - targetSize;
      for (const { k, size } of sorted) {
        if (freed >= need) break;
        try { this.scene.textures.remove(k); } catch (e) {}
        this.cache.delete(k);
        this.accessCount.delete(k);
        this.creationTime.delete(k);
        freed += size;
        this.currentSize -= size;
      }
    }

    addTexture(key, texture) {
      if (!this.enabled) return false;
      const size = this._calcSize(texture);
      if (!size) return false;
      if (this.currentSize + size > this.maxSize) this._evict(Math.max(0, this.maxSize - size));
      if (this.cache.has(key)) this.removeTexture(key);
      this.cache.set(key, texture);
      this.accessCount.set(key, Date.now());
      this.creationTime.set(key, Date.now());
      this.currentSize += size;
      return true;
    }

    getTexture(key) {
      if (!this.enabled || !this.cache.has(key)) { this.misses++; return null; }
      this.accessCount.set(key, Date.now());
      this.hits++;
      return this.cache.get(key);
    }

    removeTexture(key) {
      if (!this.cache.has(key)) return false;
      const size = this._calcSize(this.cache.get(key));
      try { this.scene.textures.remove(key); } catch (e) {}
      this.cache.delete(key);
      this.accessCount.delete(key);
      this.creationTime.delete(key);
      this.currentSize = Math.max(0, this.currentSize - size);
      return true;
    }

    clear() {
      Array.from(this.cache.keys()).forEach(k => this.removeTexture(k));
      this.cache.clear();
      this.accessCount.clear();
      this.creationTime.clear();
      this.currentSize = 0;
    }

    setEnabled(state) { this.enabled = state; if (!state) this.clear(); }
    resizeCache(mb)   { this.maxSize = mb * 1024 * 1024; if (this.currentSize > this.maxSize) this._evict(this.maxSize); }

    getStats() {
      const total   = this.hits + this.misses;
      const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
      return {
        enabled: this.enabled, totalTextures: this.cache.size,
        memoryUsage: this.currentSize, memoryLimit: this.maxSize,
        memoryUsageMB: (this.currentSize / 1048576).toFixed(2),
        hitRate: hitRate.toFixed(2) + '%', hits: this.hits, misses: this.misses
      };
    }

    destroy() { this.clear(); }
  }

  // ── ERROR RECOVERY SYSTEM ─────────────────────────────────────────────────
  class ErrorRecoverySystem {
    constructor() {
      this.errorCounts       = new global.Map();
      this.maxRetries        = 3;
      this.recoveryCallbacks = new global.Map();
      this.circuitBreakers   = new global.Map();
    }

    registerRecoveryStrategy(type, fn) { this.recoveryCallbacks.set(type, fn); }

    async executeWithRetry(operation, context = 'unknown', opType = 'generic') {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const result = await operation();
          this._recordSuccess(context);
          return result;
        } catch (error) {
          this._handleError(error, context, attempt, opType);
          if (attempt === this.maxRetries) {
            this._triggerCircuitBreaker(context);
            throw this._enhanceError(error, context, attempt);
          }
          await this._backoff(attempt);
          if (this.recoveryCallbacks.has(opType)) {
            try { await this.recoveryCallbacks.get(opType)(context, attempt, error); } catch (e) {}
          }
        }
      }
    }

    _backoff(attempt) {
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
      return new Promise(r => setTimeout(r, delay + Math.random() * 100));
    }

    _handleError(error, context, attempt, opType) {
      const k = `${context}_${opType}`;
      this.errorCounts.set(k, (this.errorCounts.get(k) || 0) + 1);
      safeLog(`Error recovery ${attempt}/${this.maxRetries} for ${context}:`, error.message);
      if (DEBUG_MODE && DEFAULTS.debug) {
        console.groupCollapsed(`Error Details: ${context}`);
        console.error('Error:', error);
        console.log('Attempt:', attempt);
        console.groupEnd();
      }
    }

    _recordSuccess(context) {
      for (const k of this.errorCounts.keys()) {
        if (k.startsWith(context)) this.errorCounts.delete(k);
      }
      this.circuitBreakers.delete(context);
    }

    _triggerCircuitBreaker(context) {
      this.circuitBreakers.set(context, { triggeredAt: Date.now(), errorCount: this.errorCounts.get(context) || 1 });
      if (DEBUG_MODE) console.error(`Circuit breaker triggered: ${context}`);
    }

    _enhanceError(orig, context, attempt) {
      const e = new Error(`Operation failed after ${attempt} attempts: ${orig.message}`);
      e.originalError = orig;
      e.context = context;
      e.attempts = attempt;
      e.timestamp = Date.now();
      return e;
    }

    isCircuitBreakerOpen(context) {
      const b = this.circuitBreakers.get(context);
      if (!b) return false;
      if (Date.now() - b.triggeredAt > 30000) { this.circuitBreakers.delete(context); return false; }
      return true;
    }

    getErrorStats() {
      return {
        totalErrorContexts:   this.errorCounts.size,
        activeCircuitBreakers:this.circuitBreakers.size,
        errorCounts:    Object.fromEntries(this.errorCounts),
        circuitBreakers:Object.fromEntries(
          Array.from(this.circuitBreakers.entries())
            .map(([k, v]) => [k, { ...v, age: Date.now() - v.triggeredAt }])
        )
      };
    }

    reset() { this.errorCounts.clear(); this.circuitBreakers.clear(); }
  }

  // ── ADAPTIVE PERFORMANCE MANAGER ─────────────────────────────────────────
  class AdaptivePerformanceManager {
    constructor(game) {
      this.game            = game;
      this.deviceTier      = this._detectDeviceTier();
      this.currentTier     = this.deviceTier;
      this.qualitySettings = this._getQualitySettings();
      this.currentSettings = this.qualitySettings[this.currentTier];
      this.performanceHistory   = [];
      this.lastAdjustmentTime   = 0;
      // FIX TITILEO: cooldown más largo (10 s) entre cambios de tier. Con 5 s
      // el sistema podía subir y bajar de calidad repetidamente cuando el
      // frame-time rondaba el umbral ("thrashing"), encendiendo y apagando
      // partículas/sombras y cambiando el radio de chunks una y otra vez —
      // visible como parpadeo. Ver también la banda de histéresis en
      // _adjustSettings().
      this.adjustmentCooldown   = 10000;
      this.enabled         = DEFAULTS.adaptiveEnabled;
      safeLog(`AdaptivePerformance: tier detectado: ${this.deviceTier}`);
    }

    _detectDeviceTier() {
      const memory   = navigator.deviceMemory        || 4;
      const cores    = navigator.hardwareConcurrency || 4;
      const gpuTier  = this._detectGPUCapabilities();
      const conn     = navigator.connection;
      const netType  = conn ? conn.effectiveType : '4g';

      if (memory >= 8 && cores >= 8 && gpuTier === 'high' && netType !== 'slow-2g') return 'high';
      if (memory >= 4 && cores >= 4 && gpuTier !== 'low'  && netType !== '2g')      return 'medium';
      return 'low';
    }

    // ── GPU Tier sin fingerprinting ────────────────────────────────────────
    //
    //  Se eliminó WEBGL_debug_renderer_info porque retorna el nombre exacto
    //  del hardware del usuario (fingerprinting de dispositivo).
    //  Se reemplaza por detección de capacidades de extensiones WebGL,
    //  que da información funcional sin identificar el hardware.
    //
    _detectGPUCapabilities() {
      let gl = null;
      try {
        const canvas = document.createElement('canvas');
        gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'low';

        const features = {
          floatTextures:      !!gl.getExtension('OES_texture_float'),
          halfFloatTextures:  !!gl.getExtension('OES_texture_half_float'),
          instancing:         !!gl.getExtension('ANGLE_instanced_arrays'),
          standardDerivatives:!!gl.getExtension('OES_standard_derivatives'),
          depthTexture:       !!gl.getExtension('WEBGL_depth_texture'),
          colorBufferFloat:   !!gl.getExtension('EXT_color_buffer_float'),
          vao:                !!gl.getExtension('OES_vertex_array_object')
        };

        const score = Object.values(features).filter(Boolean).length;

        // Límites de precisión — indicativos de tier sin revelar el modelo
        const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const maxTexUnit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

        if (score >= 5 && maxTexSize >= 8192 && maxTexUnit >= 16) return 'high';
        if (score >= 3 && maxTexSize >= 4096 && maxTexUnit >= 8)  return 'medium';
        return 'low';
      } catch (e) {
        return 'low';
      } finally {
        // FIX: liberar el contexto WebGL temporal de detección. Sin esto,
        // cada AdaptivePerformanceManager (uno por cada PhaserRPGPerf.create())
        // deja un contexto WebGL huérfano abierto. Los navegadores limitan
        // cuántos contextos WebGL puede haber simultáneamente por pestaña;
        // acumular huérfanos agota ese límite y puede provocar
        // "Cannot create WebGL context, aborting" incluso para el canvas
        // real del juego, creado después de este contexto de prueba.
        try {
          if (gl) {
            const loseCtx = gl.getExtension('WEBGL_lose_context');
            if (loseCtx) loseCtx.loseContext();
          }
        } catch (e) {}
      }
    }

    _getQualitySettings() {
      // FIX TITILEO: el MODO DE RENDER (pixelArt/roundPixels/antialias) es
      // IDÉNTICO en los tres tiers. Este es un juego pixel-art: cambiar
      // pixelArt/antialias al vuelo cuando la calidad adaptativa sube o baja
      // de tier reconfigura el filtrado de texturas del canvas y se ve como un
      // parpadeo (arte nítido ↔ arte borroso, costuras de tiles brillando).
      // Antes el tier 'high' usaba pixelArt:false + antialias:true, justo lo
      // que produce shimmer en los bordes de los tiles al moverse. Ahora la
      // calidad adaptativa SOLO ajusta parámetros que no tocan el render mode:
      // radio de chunks, tamaño de pools, partículas, sombras y luces.
      const RENDER_MODE = { pixelArt: true, roundPixels: true, antialias: false, preserveTextRendering: true };
      return {
        low: Object.assign({}, RENDER_MODE, {
          chunkRadius: 1, defaultPoolSize: 25,
          enableParticles: false, enableShadows: false,
          textureQuality: 'low', maxLights: 0
        }),
        medium: Object.assign({}, RENDER_MODE, {
          chunkRadius: 2, defaultPoolSize: 50,
          enableParticles: true, enableShadows: false,
          textureQuality: 'medium', maxLights: 2
        }),
        high: Object.assign({}, RENDER_MODE, {
          chunkRadius: 3, defaultPoolSize: 100,
          enableParticles: true, enableShadows: true,
          textureQuality: 'high', maxLights: 8
        })
      };
    }

    recordFrameMetrics(frameTime, memoryUsage = 0) {
      if (!this.enabled) return;
      this.performanceHistory.push({ frameTime, memoryUsage, timestamp: Date.now() });
      if (this.performanceHistory.length > 60) this.performanceHistory.shift();
      if (Date.now() - this.lastAdjustmentTime > this.adjustmentCooldown) {
        this._adjustSettings();
      }
    }

    _adjustSettings() {
      if (this.performanceHistory.length < 30) return;
      const recent  = this.performanceHistory.slice(-30);
      const avgFrame= recent.reduce((s, f) => s + f.frameTime, 0) / recent.length;
      let newTier   = this.currentTier;

      // FIX TITILEO: banda de histéresis. Para BAJAR de calidad el frame-time
      // debe superar claramente maxFrameTime (con un margen), y para SUBIR
      // debe estar claramente por debajo de minFrameTime. Sin esta banda, un
      // avgFrame que oscila justo alrededor del umbral hacía subir y bajar de
      // tier en cada evaluación (thrashing) — partículas/sombras
      // encendiéndose y apagándose = parpadeo. La banda crea una zona muerta
      // donde no se cambia nada.
      const HYST = 3; // ms de margen a cada lado de la zona muerta
      const downThreshold = DEFAULTS.maxFrameTime + HYST;
      const upThreshold   = DEFAULTS.minFrameTime - HYST;

      if (avgFrame > downThreshold) {
        if (this.currentTier === 'high')   newTier = 'medium';
        else if (this.currentTier === 'medium') newTier = 'low';
      } else if (avgFrame < upThreshold && this.currentTier !== this.deviceTier) {
        if (this.currentTier === 'low'    && this.deviceTier !== 'low')  newTier = 'medium';
        else if (this.currentTier === 'medium' && this.deviceTier === 'high') newTier = 'high';
      }

      if (newTier !== this.currentTier) this._applyTier(newTier);
      this.lastAdjustmentTime = Date.now();
    }

    _applyTier(tier) {
      const from = this.currentTier;
      this.currentTier    = tier;
      this.currentSettings= this.qualitySettings[tier];
      safeLog(`AdaptivePerformance: ${from} → ${tier}`);
      // DIAGNÓSTICO: visible siempre (no solo con DEBUG_MODE). Si esto se
      // repite cada pocos segundos alternando entre dos tiers, es un
      // thrashing que puede verse como "titileo" (partículas y AA
      // encendiéndose/apagándose una y otra vez).
      try { console.log('[GF] Calidad adaptativa:', from, '→', tier); } catch (e) {}
      if (this.game.events) {
        this.game.events.emit('qualitychanged', { from, to: tier, settings: this.currentSettings });
      }
    }

    forceQualityTier(tier)           { if (this.qualitySettings[tier]) { this._applyTier(tier); this.enabled = false; } }
    enableAdaptivePerformance(state) { this.enabled = state; if (state) this._applyTier(this.deviceTier); }
    getCurrentSettings()             { return { ...this.currentSettings, tier: this.currentTier }; }

    getPerformanceMetrics() {
      if (!this.performanceHistory.length) return { avgFrameTime: 0, minFrameTime: 0, maxFrameTime: 0, frameCount: 0 };
      const times = this.performanceHistory.map(f => f.frameTime);
      return {
        avgFrameTime: times.reduce((a, b) => a + b, 0) / times.length,
        minFrameTime: Math.min(...times),
        maxFrameTime: Math.max(...times),
        frameCount:   this.performanceHistory.length,
        currentTier:  this.currentTier
      };
    }
  }

  // ── POOL MANAGER ──────────────────────────────────────────────────────────
  class PoolManager {
    constructor(scene) {
      this.scene = scene;
      this.pools = new global.Map();
      this.stats = { totalSpawns: 0, totalDespawns: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };
      this.errorRecovery = new ErrorRecoverySystem();
    }

    createPool(key, factoryFn, size = 20, resetFn = null) {
      return this.errorRecovery.executeWithRetry(async () => {
        if (this.pools.has(key)) { safeLog('Pool ya existe:', key); return this.pools.get(key); }
        const arr = [];
        let created = 0, errors = 0;
        for (let i = 0; i < size; i++) {
          try {
            const obj = factoryFn();
            if (obj && obj.setActive)  obj.setActive(false);
            if (obj && obj.setVisible) obj.setVisible(false);
            arr.push(obj); created++;
          } catch (e) { errors++; if (DEBUG_MODE) console.warn('Pool factory error:', key, e); }
        }
        const pool = { arr, factoryFn, resetFn, size, created, errors };
        this.pools.set(key, pool);
        safeLog('Pool creado:', key, 'size:', size, 'created:', created);
        return pool;
      }, `createPool_${key}`, 'pool_creation')
      .catch(e => { if (DEBUG_MODE) console.error('Error creando pool:', key, e); return null; });
    }

    spawn(key, x, y, ...args) {
      const entry = this.pools.get(key);
      if (!entry) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool no encontrado:', key); return null; }

      let obj = null;
      for (const o of entry.arr) {
        if (o && !o.active && (!o.visible || o.visible === false)) { obj = o; this.stats.cacheHits++; break; }
      }

      if (!obj) {
        try { obj = entry.factoryFn(...args); entry.arr.push(obj); this.stats.cacheMisses++; }
        catch (e) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool factory error en spawn:', key, e); return null; }
      }

      try {
        if (obj.setPosition && typeof x === 'number' && typeof y === 'number') obj.setPosition(x, y);
        if (obj.setActive)   obj.setActive(true);
        if (obj.setVisible)  obj.setVisible(true);
        if (obj.body && obj.body.enable !== undefined) obj.body.enable = true;
        if (typeof obj.onSpawn === 'function') obj.onSpawn(x, y, ...args);
      } catch (e) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool spawn setup error:', e); }

      this.stats.totalSpawns++;
      return obj;
    }

    despawn(obj) {
      if (!obj) return;
      try {
        for (const entry of this.pools.values()) {
          if (entry.arr.indexOf(obj) >= 0 && typeof entry.resetFn === 'function') {
            try { entry.resetFn(obj); } catch (e) { this.stats.errors++; }
            break;
          }
        }
        if (obj.setActive)   obj.setActive(false);
        if (obj.setVisible)  obj.setVisible(false);
        if (obj.body && obj.body.enable !== undefined) obj.body.enable = false;
        if (typeof obj.onDespawn === 'function') { try { obj.onDespawn(); } catch (e) { this.stats.errors++; } }
      } catch (e) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool despawn error:', e); }
      this.stats.totalDespawns++;
    }

    resizePool(key, newSize) {
      const entry = this.pools.get(key);
      if (!entry) return false;
      const curr = entry.arr.length;
      if (newSize > curr) {
        for (let i = curr; i < newSize; i++) {
          try {
            const o = entry.factoryFn();
            if (o && o.setActive)  o.setActive(false);
            if (o && o.setVisible) o.setVisible(false);
            entry.arr.push(o);
          } catch (e) { this.stats.errors++; }
        }
      } else if (newSize < curr) {
        let removed = 0;
        entry.arr.slice(newSize).forEach(o => {
          if (o && !o.active && o.destroy) {
            try { o.destroy(); removed++; } catch (e) { this.stats.errors++; }
          }
        });
        entry.arr = entry.arr.slice(0, newSize);
        safeLog('Pool reducido:', key, curr, '→', newSize, 'eliminados:', removed);
      }
      entry.size = newSize;
      return true;
    }

    cleanupPool(key) {
      const entry = this.pools.get(key);
      if (!entry) return 0;
      let cleaned = 0;
      const valid = [];
      for (const o of entry.arr) {
        if (o && typeof o.destroy === 'function' && !o.active) {
          try { o.destroy(); cleaned++; } catch (e) { this.stats.errors++; valid.push(o); }
        } else { valid.push(o); }
      }
      entry.arr = valid;
      return cleaned;
    }

    destroyPool(key) {
      const entry = this.pools.get(key);
      if (!entry) return;
      entry.arr.forEach(o => { if (o && o.destroy) { try { o.destroy(); } catch (e) { this.stats.errors++; } } });
      this.pools.delete(key);
      safeLog('Pool destruido:', key);
    }

    destroy() { for (const k of this.pools.keys()) this.destroyPool(k); this.pools.clear(); }

    getStats() {
      const poolStats = {};
      for (const [k, v] of this.pools) {
        const active   = v.arr.filter(o => o && o.active).length;
        poolStats[k]   = { total: v.arr.length, active, inactive: v.arr.length - active, configuredSize: v.size, created: v.created, errors: v.errors };
      }
      return { pools: poolStats, performance: { ...this.stats }, errorStats: this.errorRecovery.getErrorStats() };
    }
  }

  // ── ADVANCED CULL MANAGER ─────────────────────────────────────────────────
  class AdvancedCullManager {
    constructor(scene, padding = 64) {
      this.scene         = scene;
      this.padding       = padding;
      this.targets       = new global.Map();
      this.eventManager  = new EnhancedEventManager(scene);
      this.enabled       = true;
      this.optimizedUpdate= true;
      this.updateCounter = 0;
      this.stats         = { totalChecked: 0, visibilityChanges: 0, lastUpdateTime: 0, framesProcessed: 0 };

      this._onUpdate    = this._onUpdate.bind(this);
      this._onPreUpdate = this._onPreUpdate.bind(this);
      this.eventManager.addListener('update',     this._onUpdate);
      this.eventManager.addListener('preupdate',  this._onPreUpdate);
    }

    add(target, options = {}) {
      if (!target) return;
      this.targets.set(target, {
        target, persistent: options.persistent || false,
        lastState: null, bounds: options.bounds || null,
        updateFrequency: options.updateFrequency || 1
      });
    }

    remove(target)             { this.targets.delete(target); }
    setEnabled(state)          { this.enabled = state; }
    setOptimizedUpdate(state)  { this.optimizedUpdate = state; }

    _onPreUpdate() {
      if (!this.enabled) return;
      this.stats.lastUpdateTime = performance.now();
    }

    _onUpdate() {
      if (!this.enabled || !this.scene.cameras || !this.scene.cameras.main) return;
      const cam  = this.scene.cameras.main;
      const left = cam.worldView.x - this.padding;
      const right= cam.worldView.x + cam.worldView.width  + this.padding;
      const top  = cam.worldView.y - this.padding;
      const bot  = cam.worldView.y + cam.worldView.height + this.padding;

      this.stats.framesProcessed++;
      this.updateCounter++;

      const arr   = Array.from(this.targets.entries());
      const total = arr.length;
      if (!total) return;

      if (this.optimizedUpdate && total > 100) {
        const chunk = Math.ceil(total / 3);
        const start = (this.updateCounter % 3) * chunk;
        const end   = Math.min(start + chunk, total);
        for (let i = start; i < end; i++) {
          this._processTarget(arr[i][1], left, right, top, bot);
          this.stats.totalChecked++;
        }
      } else {
        for (const [, data] of arr) {
          this._processTarget(data, left, right, top, bot);
          this.stats.totalChecked++;
        }
      }
    }

    _processTarget(data, left, right, top, bot) {
      try {
        if (!data.target) return;
        if (data.updateFrequency > 1 && this.stats.framesProcessed % data.updateFrequency !== 0) return;

        let bounds = data.bounds;
        if (!bounds && data.target.getBounds) bounds = data.target.getBounds();

        const visible = bounds
          ? !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bot)
          : !((data.target.x || 0) > right || (data.target.x || 0) < left || (data.target.y || 0) > bot || (data.target.y || 0) < top);

        this._updateVisibility(data, visible);
      } catch (e) {
        if (DEBUG_MODE) console.warn('Cull manager error:', e);
      }
    }

    _updateVisibility(data, visible) {
      if (data.lastState === visible) return;
      if (data.target.setVisible) data.target.setVisible(visible);
      if (data.target.body && data.target.body.enable !== undefined) data.target.body.enable = visible;
      if (!visible && data.target.setActive) data.target.setActive(false);
      data.lastState = visible;
      this.stats.visibilityChanges++;
    }

    destroy() { this.eventManager.destroy(); this.targets.clear(); }

    getStats() {
      return { ...this.stats, totalTargets: this.targets.size, enabled: this.enabled, optimizedUpdate: this.optimizedUpdate };
    }
  }

  // ── SMART LAYER CACHE ─────────────────────────────────────────────────────
  class SmartLayerCache {
    constructor(scene) {
      this.scene        = scene;
      this.cache        = new global.Map();
      this.textureCache = new SmartTextureCache(scene, DEFAULTS.textureCacheSizeMB);
      this.enabled      = DEFAULTS.enableSmartCaching;
    }

    cacheTilemapLayer(layer, options = {}) {
      if (!this.enabled || !layer || !layer.tilemap) return null;
      if (this.cache.has(layer)) return this.cache.get(layer);

      const map  = layer.tilemap;
      const tileW= map.tileWidth;
      const tileH= map.tileHeight;
      const w    = Math.max(1, layer.layer.width  * tileW);
      const h    = Math.max(1, layer.layer.height * tileH);

      if (w > DEFAULTS.maxRenderTextureSize || h > DEFAULTS.maxRenderTextureSize) {
        if (DEBUG_MODE) console.warn('Capa demasiado grande para caché:', w, h);
        return null;
      }

      try {
        const rt     = this.scene.make.renderTexture({ width: w, height: h, add: false });
        rt.draw(layer);
        const texKey = `layercache-${Date.now()}-${randHex(6)}`;
        rt.saveTexture(texKey);
        const tex    = this.scene.textures.get(texKey);
        if (tex) this.textureCache.addTexture(texKey, tex);

        const img = this.scene.add.image(0, 0, texKey).setOrigin(0);
        if (layer.depth !== undefined) img.setDepth(layer.depth);
        img.x = layer.x || 0;
        img.y = layer.y || 0;
        layer.setVisible(false);

        const rec = { rt, img, texKey, original: layer, size: { w, h }, timestamp: Date.now(), memoryUsage: w * h * 4 };
        this.cache.set(layer, rec);
        return rec;
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error cacheando capa:', e);
        return null;
      }
    }

    refresh(layer) {
      const rec = this.cache.get(layer);
      if (!rec) return this.cacheTilemapLayer(layer);
      try { this.textureCache.removeTexture(rec.texKey); } catch (e) {}

      const map    = layer.tilemap;
      const w      = Math.max(1, layer.layer.width  * map.tileWidth);
      const h      = Math.max(1, layer.layer.height * map.tileHeight);

      try {
        const rt     = this.scene.make.renderTexture({ width: w, height: h, add: false });
        rt.draw(layer);
        const texKey = `layercache-${Date.now()}-${randHex(6)}`;
        rt.saveTexture(texKey);
        const tex    = this.scene.textures.get(texKey);
        if (tex) this.textureCache.addTexture(texKey, tex);
        rec.rt       = rt;
        rec.texKey   = texKey;
        rec.img.setTexture(texKey);
        rec.timestamp    = Date.now();
        rec.memoryUsage  = w * h * 4;
        rec.original.setVisible(false);
        return rec;
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error refrescando capa:', e);
        return null;
      }
    }

    uncache(layer) {
      const rec = this.cache.get(layer);
      if (!rec) return;
      try { this.textureCache.removeTexture(rec.texKey); } catch (e) {}
      try { if (rec.img) rec.img.destroy(); }          catch (e) {}
      try { if (rec.rt)  rec.rt.destroy();  }          catch (e) {}
      rec.original.setVisible(true);
      this.cache.delete(layer);
    }

    setEnabled(state) { this.enabled = state; if (!state) this.clear(); }
    clear()           { for (const rec of this.cache.values()) this.uncache(rec.original); this.cache.clear(); }
    destroy()         { this.clear(); this.textureCache.destroy(); }

    getStats() {
      const totals = Array.from(this.cache.values())
        .reduce((a, r) => { a.mem += r.memoryUsage; a.n++; return a; }, { mem: 0, n: 0 });
      return {
        cachedLayers:   totals.n,
        memoryUsage:    totals.mem,
        memoryUsageMB:  (totals.mem / 1048576).toFixed(2),
        enabled:        this.enabled,
        textureCache:   this.textureCache.getStats()
      };
    }
  }

  // ── DYNAMIC CHUNK MANAGER ─────────────────────────────────────────────────
  class DynamicChunkManager {
    constructor(scene, map, options = {}) {
      this.scene    = scene;
      this.map      = map || null;
      this.opt      = Object.assign({}, DEFAULTS, options);
      this.loaded   = new global.Map();
      this.chunkW   = this.opt.chunkSizeTiles * (map ? map.tileWidth  : 32);
      this.chunkH   = this.opt.chunkSizeTiles * (map ? map.tileHeight : 32);
      this.playerRef= null;
      this.provider = null;
      this.enabled  = true;
      this.stats    = { totalLoaded: 0, totalUnloaded: 0, lastLoadTime: 0, loadErrors: 0, unloadErrors: 0 };

      this.eventManager  = new EnhancedEventManager(scene);
      this.errorRecovery = new ErrorRecoverySystem();

      this._updateBound = throttle(this._update.bind(this), 100);
      this.eventManager.addListener('update', this._updateBound);
    }

    setProvider(fn) {
      if (typeof fn !== 'function') throw new Error('Provider must be a function');
      this.provider = fn;
    }
    setPlayer(player) { this.playerRef = player; }
    setEnabled(state) { this.enabled   = state;  }

    _chunkKey(cx, cy) { return `${cx},${cy}`; }
    worldToChunk(x, y) { return [Math.floor(x / this.chunkW), Math.floor(y / this.chunkH)]; }

    _update() {
      if (!this.enabled || !this.playerRef) return;
      const [cx, cy] = this.worldToChunk(this.playerRef.x, this.playerRef.y);
      const needed   = new global.Set();

      for (let dx = -this.opt.chunkRadius; dx <= this.opt.chunkRadius; dx++) {
        for (let dy = -this.opt.chunkRadius; dy <= this.opt.chunkRadius; dy++) {
          const key = this._chunkKey(cx + dx, cy + dy);
          needed.add(key);
          if (!this.loaded.has(key)) this.loadChunk(cx + dx, cy + dy);
        }
      }
      for (const [key, rec] of this.loaded) {
        if (!needed.has(key)) this.unloadChunk(rec.cx, rec.cy);
      }
    }

    async loadChunk(cx, cy) {
      const key = this._chunkKey(cx, cy);
      if (this.loaded.has(key)) return this.loaded.get(key).container;

      return this.errorRecovery.executeWithRetry(async () => {
        const container = this.scene.add.container(cx * this.chunkW, cy * this.chunkH);
        container.name  = `chunk-${key}`;
        const rec       = { cx, cy, container, status: 'loading', key, loadTime: Date.now() };
        this.loaded.set(key, rec);
        this.stats.lastLoadTime = Date.now();

        try {
          if (this.provider) {
            const res = this.provider(cx, cy, container, this.map);
            if (res && typeof res.then === 'function') await res;
          }
          rec.status   = 'ready';
          rec.loadTime = Date.now() - rec.loadTime;
          this.stats.totalLoaded++;
        } catch (e) {
          rec.status = 'error';
          this.stats.loadErrors++;
          try { container.destroy(true); } catch (ce) {}
          this.loaded.delete(key);
          throw e;
        }
        return container;
      }, `loadChunk_${key}`, 'chunk_loading')
      .catch(e => { if (DEBUG_MODE) console.error('Error cargando chunk:', key, e); return null; });
    }

    unloadChunk(cx, cy) {
      const key = this._chunkKey(cx, cy);
      const rec = this.loaded.get(key);
      if (!rec) return;
      try {
        if (rec.container) { rec.container.removeAll(true); rec.container.destroy(true); }
        this.loaded.delete(key);
        this.stats.totalUnloaded++;
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error descargando chunk:', key, e);
        this.stats.unloadErrors++;
      }
    }

    preloadChunks(cx, cy, radius = 1) {
      const [ccx, ccy] = this.worldToChunk(cx, cy);
      for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
          this.loadChunk(ccx + dx, ccy + dy);
    }

    cleanup() {
      for (const [, rec] of this.loaded) {
        if (rec.status === 'error') this.unloadChunk(rec.cx, rec.cy);
      }
    }

    destroy() {
      this.eventManager.destroy();
      for (const rec of this.loaded.values()) this.unloadChunk(rec.cx, rec.cy);
      this.loaded.clear();
    }

    getStats() {
      const statusCounts = {};
      for (const rec of this.loaded.values()) statusCounts[rec.status] = (statusCounts[rec.status] || 0) + 1;
      return { ...this.stats, currentlyLoaded: this.loaded.size, statusCounts, enabled: this.enabled, errorStats: this.errorRecovery.getErrorStats() };
    }
  }

  // ── DETECCIÓN DE API DE PARTÍCULAS ────────────────────────────────────────
  //
  //  Phaser 3.60 eliminó ParticleEmitterManager y su método createEmitter().
  //  A partir de 3.60, scene.add.particles(x, y, texture, config) devuelve
  //  directamente un ParticleEmitter (que ES un GameObject).
  //
  //  index.html fija Phaser 3.90 → API nueva. Pero mantenemos soporte para la
  //  API antigua (≤3.55) por si el motor se sirve desde otra versión, sin
  //  asumir nada: se decide en runtime a partir de Phaser.VERSION.
  //
  const _particleApiIsLegacy = (function () {
    try {
      if (typeof Phaser === 'undefined' || !Phaser.VERSION) return false; // asumir moderno
      var v = String(Phaser.VERSION).split('.').map(function (n) { return parseInt(n, 10) || 0; });
      return v[0] < 3 || (v[0] === 3 && v[1] < 60);
    } catch (e) { return false; }
  })();

  // ── ENHANCED PARTICLE POOL ────────────────────────────────────────────────
  class EnhancedParticlePool {
    constructor(scene) {
      this.scene         = scene;
      this.managers      = new global.Map();
      this.emitters      = new global.Map();
      this.configs       = new global.Map();
      this.activeEmitters= new global.Set();
    }

    // Solo relevante en la API antigua (≤3.55): devuelve un manager reutilizable.
    // En 3.60+ no existen managers, así que este método no se usa.
    getManager(key, textureKey) {
      if (this.managers.has(key)) return this.managers.get(key);
      const mgr = this.scene.add.particles(textureKey || key);
      this.managers.set(key, mgr);
      return mgr;
    }

    createEmitter(key, cfg) {
      cfg = cfg || {};
      const textureKey = cfg.textureKey || key;
      let em = null;

      try {
        if (_particleApiIsLegacy) {
          // API antigua: manager + createEmitter(config)
          const mgr = this.getManager(key, textureKey);
          if (!mgr || typeof mgr.createEmitter !== 'function') {
            if (DEBUG_MODE) console.warn('EnhancedParticlePool: manager sin createEmitter para', key);
            return null;
          }
          em = mgr.createEmitter(cfg);
        } else {
          // Phaser 3.60+: add.particles(x, y, texture, config) devuelve el emitter
          em = this.scene.add.particles(cfg.x || 0, cfg.y || 0, textureKey, cfg);
        }
      } catch (e) {
        if (DEBUG_MODE) console.warn('EnhancedParticlePool.createEmitter error:', key, e);
        return null;
      }

      if (!em) return null;
      if (!this.emitters.has(key)) this.emitters.set(key, []);
      this.emitters.get(key).push(em);
      this.configs.set(em, { ...cfg, key });
      this.activeEmitters.add(em);
      return em;
    }

    stopEmitter(em)  { if (em && em.stop)  { em.stop();  this.activeEmitters.delete(em); } }
    startEmitter(em) { if (em && em.start) { em.start(); this.activeEmitters.add(em); } }
    pauseEmitter(em) { if (em && em.pause) em.pause(); }
    resumeEmitter(em){ if (em && em.resume)em.resume(); }
    setEmitterRate(em, rate) { if (em && em.setFrequency) em.setFrequency(rate); }

    stopAllEmitters(key = null) {
      if (key) { (this.emitters.get(key) || []).forEach(e => this.stopEmitter(e)); }
      else      { for (const es of this.emitters.values()) es.forEach(e => this.stopEmitter(e)); }
    }

    startAllEmitters(key = null) {
      if (key) { (this.emitters.get(key) || []).forEach(e => this.startEmitter(e)); }
      else      { for (const es of this.emitters.values()) es.forEach(e => this.startEmitter(e)); }
    }

    destroyEmitter(em) {
      if (!em) return;
      const cfg = this.configs.get(em);
      if (cfg) {
        const es = this.emitters.get(cfg.key) || [];
        const i  = es.indexOf(em);
        if (i > -1) es.splice(i, 1);
        this.configs.delete(em);
      }
      this.activeEmitters.delete(em);
      try { if (em.destroy) em.destroy(); } catch (e) {}
    }

    cleanupInactiveEmitters() {
      let cleaned = 0;
      for (const [key, ems] of this.emitters) {
        // FIX: filtrar sobre una COPIA. destroyEmitter() hace splice sobre el
        // array vivo; si se filtra ese mismo array, cada splice desplaza los
        // índices y filter se salta el emitter siguiente — que quedaba fuera
        // del array reconstruido sin ser destruido (huérfano en la escena =
        // fuga de memoria y partículas fantasma).
        const active = Array.from(ems).filter(em => {
          // 'emitting' es la propiedad en Phaser 3.60+; 'on' en la API antigua.
          const isEmitting = (typeof em.emitting === 'boolean') ? em.emitting : em.on;
          if (isEmitting || this.activeEmitters.has(em)) return true;
          this.destroyEmitter(em); cleaned++;
          return false;
        });
        this.emitters.set(key, active);
      }
      return cleaned;
    }

    destroy() {
      // FIX: misma razón que en cleanupInactiveEmitters — iterar sobre copia
      // porque destroyEmitter() muta el array original con splice (antes se
      // saltaba uno de cada dos emitters y quedaban vivos tras destroy()).
      for (const ems of this.emitters.values()) Array.from(ems).forEach(em => this.destroyEmitter(em));
      for (const m of this.managers.values()) { try { m.destroy(); } catch (e) {} }
      this.managers.clear(); this.emitters.clear(); this.configs.clear(); this.activeEmitters.clear();
    }

    getStats() {
      const stats = { totalManagers: this.managers.size, totalEmitters: 0, activeEmitters: this.activeEmitters.size, byKey: {} };
      for (const [k, ems] of this.emitters) {
        stats.byKey[k] = { total: ems.length, active: ems.filter(e => this.activeEmitters.has(e)).length };
        stats.totalEmitters += ems.length;
      }
      return stats;
    }
  }

  // ── ADVANCED PIXEL SCALER ─────────────────────────────────────────────────
  class AdvancedPixelScaler {
    static applyPixelPerfect(game, opts = {}) {
      const options = Object.assign({
        pixelArt: true, roundPixels: true, antialias: false,
        crispScaling: true, integerScaling: true,
        preserveDrawingBuffer: false, preserveTextRendering: true
      }, opts);

      try {
        if (game.config) {
          game.config.pixelArt              = Boolean(options.pixelArt);
          game.config.roundPixels           = Boolean(options.roundPixels);
          game.config.antialias             = Boolean(options.antialias);
          game.config.preserveDrawingBuffer = Boolean(options.preserveDrawingBuffer);
        }

        if (game.scale) {
          const dpr  = Math.max(1, global.devicePixelRatio || 1);
          const cssW = Math.floor(global.innerWidth);
          const cssH = Math.floor(global.innerHeight);

          let physW = Math.floor(cssW * dpr);
          let physH = Math.floor(cssH * dpr);

          if (options.integerScaling && options.pixelArt) {
            const scale = Math.max(1, Math.floor(dpr));
            physW = cssW * scale;
            physH = cssH * scale;
          }

          if (typeof game.scale.resize === 'function') game.scale.resize(physW, physH);

          const canvas = game.canvas;
          if (canvas) {
            // FIX: usar '100%' en lugar de cssW+'px' / cssH+'px'.
            // Con valores fijos en px el canvas queda aplastado cuando
            // DevTools se abre/cierra porque el handler captura innerWidth
            // en el momento del evento (viewport reducido) y luego ese
            // valor en px nunca se actualiza. Con '100%' el canvas siempre
            // llena su contenedor sin importar cuándo se ejecute el handler.
            canvas.style.width  = '100%';
            canvas.style.height = '100%';
            canvas.style.imageRendering = options.preserveTextRendering ? 'auto'
              : (options.pixelArt ? 'pixelated' : 'crisp-edges');
            canvas.style.transformOrigin = '0 0';
            canvas.addEventListener('contextmenu', e => e.preventDefault());
          }
        }

        safeLog('Pixel perfect aplicado — preserveTextRendering:', options.preserveTextRendering);
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('AdvancedPixelScaler error:', e);
        return false;
      }
    }

    static enableHighPerformance(game) {
      try {
        if (game.renderer && game.renderer.gl) {
          const gl = game.renderer.gl;
          gl.enable(gl.SCISSOR_TEST);
          gl.disable(gl.DITHER);
          if (game.config && game.config.pixelArt) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          }
          [
            'EXT_texture_filter_anisotropic', 'OES_texture_float',
            'OES_texture_half_float', 'WEBGL_compressed_texture_s3tc',
            'WEBGL_compressed_texture_etc'
          ].forEach(ext => {
            try { const e = gl.getExtension(ext); if (e) safeLog('WebGL extension:', ext); } catch (e) {}
          });
        }
        if (game.config) {
          game.config.autoFocus                = true;
          game.config.powerPreference          = 'high-performance';
          game.config.failIfMajorPerformanceCaveat = false;
          game.config.antialiasGL              = false;
        }
        safeLog('High performance mode habilitado');
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('High performance setup error:', e);
        return false;
      }
    }

    static enableMSAA(game, samples = 4) {
      try {
        if (game.renderer && game.renderer.gl) {
          const gl  = game.renderer.gl;
          const ext = gl.getExtension('WEBGL_multisampled_renderbuffer');
          if (ext) { safeLog('MSAA habilitado:', samples, 'samples'); return true; }
        }
        return false;
      } catch (e) { return false; }
    }
  }

  // ── SECURE SCENE REGISTRAR ────────────────────────────────────────────────
  //
  //  Registra escenas en Phaser y lleva un tracking interno de ellas.
  //
  //  CAMBIO CRÍTICO: Las escenas se registran en Phaser con su nombre
  //  AMIGABLE (friendlyName) — no con una clave Base64 "cifrada".
  //  Esto es requerido para que game.scene.start(friendlyName) funcione.
  //
  //  El mapping interno sigue existiendo para startFriendlyScene y
  //  switchToScene, pero la clave usada en Phaser ES el nombre amigable.
  //
  class SecureSceneRegistrar {
    constructor() {
      this.mapping       = new global.Map(); // friendlyName → { key, cls, options }
      this.registered    = false;
      this.errorRecovery = new ErrorRecoverySystem();

      if (ENV_MODE === 1) this.clearPublicRegistrations();
    }

    clearPublicRegistrations() {
      if (DEBUG_MODE) return; // en dev, dejamos las referencias por comodidad
      try {
        if (global.GameScenes) {
          Object.keys(global.GameScenes).forEach(k => delete global.GameScenes[k]);
          delete global.GameScenes;
        }
        if (global.sceneClasses) {
          global.sceneClasses.length = 0;
          delete global.sceneClasses;
        }
        ['scenes', 'gameScenes', 'phaserScenes'].forEach(key => {
          if (global[key]) { try { delete global[key]; } catch (e) {} }
        });
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error limpiando registros públicos:', e);
      }
    }

    async registerFromGlobals(game) {
      return this.errorRecovery.executeWithRetry(async () => {
        const sp = game.scene;
        if (!sp || !sp.add) throw new Error('Scene plugin no disponible');

        let count = 0;

        if (global.GameScenes && typeof global.GameScenes === 'object') {
          for (const friendly of Object.keys(global.GameScenes)) {
            const cls = global.GameScenes[friendly];
            if (typeof cls === 'function' && this._registerScene(game, friendly, cls)) count++;
          }
        }

        if (Array.isArray(global.sceneClasses)) {
          for (const entry of global.sceneClasses) {
            if (entry && entry.key && typeof entry.cls === 'function') {
              if (this._registerScene(game, entry.key, entry.cls, entry.options)) count++;
            }
          }
        }

        // También registrar desde window.__secureSceneRegistry (register-scenes.js)
        if (global.__secureSceneRegistry instanceof global.Map) {
          for (const [name, cls] of global.__secureSceneRegistry) {
            if (typeof cls === 'function' && !this.mapping.has(name)) {
              if (this._registerScene(game, name, cls)) count++;
            }
          }
        }

        this.clearPublicRegistrations();
        this.registered = true;
        safeLog(`SecureSceneRegistrar: ${count} escenas registradas`);
        return count > 0;
      }, 'registerFromGlobals', 'scene_registration')
      .catch(e => { if (DEBUG_MODE) console.error('Error registrando escenas:', e); return false; });
    }

    // ── Registro en Phaser con nombre amigable ────────────────────────────
    _registerScene(game, friendlyName, cls, options = {}) {
      const sp = game.scene;

      // La clave en Phaser ES el nombre amigable — no hay codificación Base64.
      // Esto garantiza que game.scene.start(friendlyName) funcione siempre.
      const phaserKey = friendlyName;

      this.mapping.set(friendlyName, { key: phaserKey, cls, options });

      try {
        if (sp.keys && sp.keys[phaserKey]) {
          safeLog('Escena ya registrada:', friendlyName);
          return true;
        }
        sp.add(phaserKey, cls, false);
        safeLog('Escena registrada:', friendlyName);
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error registrando escena:', friendlyName, e);
        return false;
      }
    }

    startFriendlyScene(game, friendlyName, data) {
      const sp = game.scene;
      if (!sp || !sp.start) return false;

      const entry  = this.mapping.get(friendlyName);
      const key    = entry ? entry.key : friendlyName;

      // Verificar si ya está activa
      const running = sp.getScenes(true) || [];
      if (running.some(s => s && s.sys && s.sys.settings && s.sys.settings.key === key)) {
        safeLog('Escena ya activa:', friendlyName);
        return true;
      }

      // Asegurar que esté registrada en Phaser
      if (!sp.keys || !sp.keys[key]) {
        if (entry) {
          try { sp.add(key, entry.cls, false); }
          catch (e) { safeLog('Re-registro fallido:', friendlyName, e); return false; }
        } else {
          safeLog('Escena no mapeada ni registrada:', friendlyName);
          return false;
        }
      }

      try {
        sp.start(key, data);
        safeLog('Escena iniciada:', friendlyName);
        return true;
      } catch (e) {
        safeLog('Error iniciando escena:', friendlyName, e);
        return false;
      }
    }

    async initRegistrarWithRetry(game, firstFriendlyName, data) {
      return this.errorRecovery.executeWithRetry(async () => {
        await this.registerFromGlobals(game);

        if (!firstFriendlyName) return false;

        if (this.startFriendlyScene(game, firstFriendlyName, data)) return true;

        for (let i = 0; i < DEFAULTS.registrarRetryCount; i++) {
          await new Promise(r => setTimeout(r, DEFAULTS.registrarRetryMs));
          if (this.startFriendlyScene(game, firstFriendlyName, data)) return true;
          if (game.scene.keys && game.scene.keys[firstFriendlyName]) {
            try { game.scene.start(firstFriendlyName, data); return true; } catch (e) {}
          }
        }

        // Fallback: iniciar cualquier escena disponible
        const first = this.mapping.keys().next();
        if (!first.done) return this.startFriendlyScene(game, first.value, data);
        return false;
      }, `initRegistrar_${firstFriendlyName || 'no_scene'}`, 'scene_initialization')
      .catch(e => { safeLog('initRegistrarWithRetry failed:', e); return false; });
    }

    registerSceneLater(game, friendlyName, cls, startNow = false, data) {
      if (!friendlyName || typeof cls !== 'function') return false;
      const ok = this._registerScene(game, friendlyName, cls);
      return startNow ? this.startFriendlyScene(game, friendlyName, data) : ok;
    }

    forceStartFriendly(game, friendlyName, data) {
      return this.startFriendlyScene(game, friendlyName, data);
    }

    switchToScene(game, fromScene, toFriendlyName, data) {
      if (!fromScene || !toFriendlyName) return false;
      try {
        fromScene.scene.pause();
        const ok = this.startFriendlyScene(game, toFriendlyName, data);
        if (!ok) fromScene.scene.resume();
        return ok;
      } catch (e) {
        safeLog('Error cambiando escena:', e);
        try { fromScene.scene.resume(); } catch (re) {}
        return false;
      }
    }

    getRegisteredScenes()    { return Array.from(this.mapping.keys()); }
    getSceneInfo(name)       { return this.mapping.get(name); }

    _debug_getMapping() {
      return DEBUG_MODE ? new global.Map(this.mapping) : new global.Map();
    }

    getStats() {
      return { registeredScenes: this.mapping.size, registered: this.registered, errorStats: this.errorRecovery.getErrorStats() };
    }
  }

  // ── CLASE PRINCIPAL ───────────────────────────────────────────────────────
  class PhaserRPGPerf {
    constructor(game, opts = {}) {
      this.game = game;
      this.scene= null;
      this.opt  = Object.assign({}, DEFAULTS, opts);

      this.eventManager   = new EnhancedEventManager();
      this.pool           = null;
      this.cull           = null;
      this.layerCache     = null;
      this.chunkManager   = null;
      this.particles      = null;

      this._registrar         = new SecureSceneRegistrar();
      this.vault              = new SecureVault();
      this.performanceMonitor = new AdvancedPerformanceMonitor();
      this.adaptivePerformance= new AdaptivePerformanceManager(game);
      this.errorRecovery      = new ErrorRecoverySystem();
      this.textureCache       = null;
      this.problemDetector    = new ProblemDetector();

      this._autoScanInterval  = null;
      this.statsData          = { chunksLoaded: 0, pools: {}, emitters: 0, startupTime: Date.now(), frameCount: 0 };
      this.version            = '2.2.2';
      this._chunkProvider     = null;
      this._initialized       = false;
      this._destroyed         = false;
      this._lastFrameTime     = 0;
      this._frameTimeHistory  = [];
      this._onPreStep         = null;
      this._onPostStep        = null;
      this._memoryInterval    = null;

      // Registrar en sistema de aislamiento (solo tracking, sin Proxy que bloquee)
      PerfIsolation.registerInstance(this);

      this._applyInitialOptimizations();
      if (this.opt.enableProblemDetection) this._startProblemDetection();
    }

    _applyInitialOptimizations() {
      AdvancedPixelScaler.applyPixelPerfect(this.game, {
        pixelArt: this.opt.pixelArt, roundPixels: this.opt.roundPixels,
        antialias: this.opt.antialias, preserveTextRendering: this.opt.preserveTextRendering
      });
      if (this.opt.highPerformance) AdvancedPixelScaler.enableHighPerformance(this.game);
      this._setupResizeHandler();
      safeLog('PhaserRPGPerf v' + this.version + ' inicializado');
    }

    _setupResizeHandler() {
      // FIX: Se separa la lógica de resize en una función interna
      // para poder llamarla tanto en el handler inmediato como en el
      // segundo disparo retrasado.
      const doResize = () => {
        try {
          AdvancedPixelScaler.applyPixelPerfect(this.game, {
            pixelArt: this.opt.pixelArt, roundPixels: this.opt.roundPixels,
            preserveTextRendering: this.opt.preserveTextRendering
          });
          if (this.game.events) this.game.events.emit('perfResize');
        } catch (e) { if (DEBUG_MODE) console.warn('Resize handler error:', e); }
      };

      // FIX: segundo disparo a 350ms para capturar el tamaño estable
      // tras el cierre de DevTools. Cuando DevTools se cierra Chrome
      // dispara 'resize' mientras el panel aún se está moviendo; el
      // primer disparo captura el viewport reducido. El segundo disparo
      // garantiza que se usa el innerWidth/innerHeight definitivo.
      let _devtoolsTimer = null;
      const handler = throttle(() => {
        doResize();
        if (_devtoolsTimer) clearTimeout(_devtoolsTimer);
        _devtoolsTimer = setTimeout(() => {
          _devtoolsTimer = null;
          doResize();
        }, 350);
      }, 100);

      if (typeof global !== 'undefined') {
        global.addEventListener('resize',            handler);
        global.addEventListener('orientationchange', handler);
        this._resizeHandler = handler;
      }
    }

    _startProblemDetection() {
      if (this.opt.autoScanInterval > 0 && DEBUG_MODE) {
        this._autoScanInterval = setInterval(() => {
          const report = this.problemDetector.scanInstance(this);
          if (report.severity === 'ERROR')   { if (DEBUG_MODE) console.warn('PhaserRPGPerf Problem Report:', report); }
          else if (report.severity === 'WARNING') safeLog('PhaserRPGPerf Warning Report:', report);
        }, this.opt.autoScanInterval);
      }
    }

    _startPerformanceMonitoring() {
      if (!this.game || !this.game.events) {
        if (DEBUG_MODE) console.warn('Performance monitoring: game events no disponibles');
        return;
      }

      this._onPreStep = () => {
        this.performanceMonitor.startFrame();
        this._lastFrameTime = performance.now();
      };

      this._onPostStep = () => {
        this.performanceMonitor.endFrame();
        const ft = performance.now() - this._lastFrameTime;
        this._frameTimeHistory.push(ft);
        if (this._frameTimeHistory.length > 120) this._frameTimeHistory.shift();
        this.adaptivePerformance.recordFrameMetrics(ft);
        this.statsData.frameCount++;
      };

      this.game.events.on('prestep',  this._onPreStep);
      this.game.events.on('poststep', this._onPostStep);

      if (performance && performance.memory) {
        this._memoryInterval = setInterval(() => this.performanceMonitor.recordMemoryUsage(), 1000);
      }
    }

    // ── API PÚBLICA ───────────────────────────────────────────────────────

    init(scene, options = {}) {
      if (this._destroyed) throw new Error('PhaserRPGPerf ha sido destruido y no puede ser reinicializado');
      this.performanceMonitor.start('init');
      this.scene = scene || this.scene;
      if (!this.scene) throw new Error('PhaserRPGPerf.init requiere una Phaser.Scene');

      this.opt = Object.assign({}, this.opt, options);
      this.eventManager.setScene(this.scene);

      this.textureCache= new SmartTextureCache(this.scene, this.opt.textureCacheSizeMB);
      this.pool        = new PoolManager(this.scene);
      this.cull        = new AdvancedCullManager(this.scene, this.opt.cullPadding);
      this.layerCache  = new SmartLayerCache(this.scene);
      this.particles   = new EnhancedParticlePool(this.scene);

      const adaptive = this.adaptivePerformance.getCurrentSettings();
      this._applyAdaptiveSettings(adaptive);
      this._startPerformanceMonitoring();

      this._initialized = true;
      this.performanceMonitor.end('init');
      safeLog('PhaserRPGPerf completamente inicializado en escena',
        this.scene.sys ? this.scene.sys.settings.key : this.scene);
      return this;
    }

    _applyAdaptiveSettings(settings) {
      if (this.chunkManager && settings.chunkRadius !== undefined) {
        this.chunkManager.opt.chunkRadius = settings.chunkRadius;
      }
      if (this.particles && settings.enableParticles === false) {
        this.particles.stopAllEmitters();
      }
      if (settings.preserveTextRendering !== undefined) {
        this.opt.preserveTextRendering = settings.preserveTextRendering;
        AdvancedPixelScaler.applyPixelPerfect(this.game, { preserveTextRendering: settings.preserveTextRendering });
      }
      safeLog('Adaptive performance settings aplicados:', settings);
    }

    // Spike detection
    setSpikeDetectionEnabled(enabled) { this.performanceMonitor.setSpikeDetectionEnabled(enabled); }
    setSpikeThreshold(threshold)      { this.performanceMonitor.setSpikeThreshold(threshold); }

    // Scene Management
    initSecureScenes(game, firstFriendlyName, data) {
      this.performanceMonitor.start('initSecureScenes');
      try {
        const r = this._registrar.initRegistrarWithRetry(game, firstFriendlyName, data);
        this.performanceMonitor.end('initSecureScenes');
        return r;
      } catch (e) {
        this.performanceMonitor.end('initSecureScenes');
        safeLog('initSecureScenes error:', e);
        return false;
      }
    }

    registerSceneLater(game, friendlyName, cls, startNow = false, data) {
      return this._registrar.registerSceneLater(game, friendlyName, cls, startNow, data);
    }
    forceStartFriendly(game, friendlyName, data) { return this._registrar.forceStartFriendly(game, friendlyName, data); }
    switchToScene(fromScene, toFriendlyName, data){ return this._registrar.switchToScene(this.game, fromScene, toFriendlyName, data); }
    getRegisteredScenes() { return DEBUG_MODE ? this._registrar.getRegisteredScenes() : []; }

    // Chunk Management
    registerChunkProvider(fn) {
      if (typeof fn !== 'function') throw new Error('registerChunkProvider expects a function');
      this._chunkProvider = fn;
      if (this.chunkManager) this.chunkManager.setProvider(fn);
    }
    createChunkManager(map, options) {
      if (!this.scene) throw new Error('Scene requerida para crear ChunkManager');
      this.chunkManager = new DynamicChunkManager(this.scene, map, Object.assign({}, this.opt, options));
      if (this._chunkProvider) this.chunkManager.setProvider(this._chunkProvider);
      return this.chunkManager;
    }
    setPlayerForChunks(player) { if (!this.chunkManager) throw new Error('ChunkManager no creado'); this.chunkManager.setPlayer(player); }
    preloadChunks(cx, cy, r)   { if (!this.chunkManager) throw new Error('ChunkManager no creado'); this.chunkManager.preloadChunks(cx, cy, r); }

    // Object Pooling
    createPool(key, factoryFn, size, resetFn) {
      if (!this._initialized || !this.pool) { if (DEBUG_MODE) console.warn('PhaserRPGPerf no inicializado'); return; }
      this.pool.createPool(key, factoryFn, size || this.opt.defaultPoolSize, resetFn);
      this.statsData.pools = this.pool.getStats().pools;
    }
    spawnFromPool(key, ...args) { if (!this._initialized || !this.pool) return null; return this.pool.spawn(key, ...args); }
    despawnToPool(obj)          { if (this._initialized && this.pool) this.pool.despawn(obj); }
    resizePool(key, newSize)    { if (!this._initialized || !this.pool) return false; return this.pool.resizePool(key, newSize); }
    cleanupPool(key)            { if (!this._initialized || !this.pool) return 0; return this.pool.cleanupPool(key); }
    destroyPool(key)            { if (this._initialized && this.pool) this.pool.destroyPool(key); }

    // Culling
    addToCull(obj, options = {})  { if (this._initialized && this.cull) this.cull.add(obj, options); }
    removeFromCull(obj)           { if (this._initialized && this.cull) this.cull.remove(obj); }
    setCullingEnabled(state)      { if (this._initialized && this.cull) this.cull.setEnabled(state); }
    setOptimizedCulling(state)    { if (this._initialized && this.cull) this.cull.setOptimizedUpdate(state); }

    // Layer Caching
    cacheLayer(layer)            { if (!this._initialized || !this.layerCache) return null; return this.layerCache.cacheTilemapLayer(layer); }
    refreshLayer(layer)          { if (!this._initialized || !this.layerCache) return null; return this.layerCache.refresh(layer); }
    uncacheLayer(layer)          { if (this._initialized && this.layerCache) this.layerCache.uncache(layer); }
    setLayerCachingEnabled(state){ if (this._initialized && this.layerCache) this.layerCache.setEnabled(state); }

    // Texture Cache
    cacheTexture(key, texture)   { if (!this._initialized || !this.textureCache) return false; return this.textureCache.addTexture(key, texture); }
    getCachedTexture(key)        { if (!this._initialized || !this.textureCache) return null;  return this.textureCache.getTexture(key); }
    removeCachedTexture(key)     { if (!this._initialized || !this.textureCache) return false; return this.textureCache.removeTexture(key); }
    setTextureCacheSize(mb)      { if (this._initialized && this.textureCache) this.textureCache.resizeCache(mb); }

    // Particles
    createEmitter(key, cfg) {
      if (!this._initialized || !this.particles) return null;
      const em = this.particles.createEmitter(key, cfg);
      if (em) this.statsData.emitters++;
      return em;
    }
    stopEmitter(em)            { if (this._initialized && this.particles) this.particles.stopEmitter(em); }
    startEmitter(em)           { if (this._initialized && this.particles) this.particles.startEmitter(em); }
    pauseEmitter(em)           { if (this._initialized && this.particles) this.particles.pauseEmitter(em); }
    resumeEmitter(em)          { if (this._initialized && this.particles) this.particles.resumeEmitter(em); }
    setEmitterRate(em, rate)   { if (this._initialized && this.particles) this.particles.setEmitterRate(em, rate); }
    stopAllEmitters(key)       { if (this._initialized && this.particles) this.particles.stopAllEmitters(key); }
    startAllEmitters(key)      { if (this._initialized && this.particles) this.particles.startAllEmitters(key); }
    destroyEmitter(em)         { if (this._initialized && this.particles) { this.particles.destroyEmitter(em); this.statsData.emitters = Math.max(0, this.statsData.emitters - 1); } }
    cleanupParticles()         { if (!this._initialized || !this.particles) return 0; return this.particles.cleanupInactiveEmitters(); }

    // Graphics
    applyPixelPerfect(opts = {}) {
      return AdvancedPixelScaler.applyPixelPerfect(this.game, Object.assign({
        pixelArt: this.opt.pixelArt, roundPixels: this.opt.roundPixels,
        antialias: this.opt.antialias, preserveTextRendering: this.opt.preserveTextRendering
      }, opts));
    }
    enableHighPerformance()          { return AdvancedPixelScaler.enableHighPerformance(this.game); }
    enableMSAA(samples = 4)          { return AdvancedPixelScaler.enableMSAA(this.game, samples); }
    setTextRenderingPreservation(on) {
      this.opt.preserveTextRendering = on;
      return AdvancedPixelScaler.applyPixelPerfect(this.game, { preserveTextRendering: on });
    }

    // Adaptive Performance
    setQualityTier(tier)              { this.adaptivePerformance.forceQualityTier(tier); }
    enableAdaptivePerformance(state)  { this.adaptivePerformance.enableAdaptivePerformance(state); }
    getQualitySettings()              { return this.adaptivePerformance.getCurrentSettings(); }

    // Camera
    attachCameraClamp(scene, bounds, opts = {}) {
      try {
        const cam = scene.cameras.main;
        if (!cam) return () => {};
        cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
        if (scene.physics && scene.physics.world) {
          scene.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height, true, true, true, true);
        }
        const minZoom= opts.minZoom || 0.5;
        const maxZoom= opts.maxZoom || 2;
        const smooth = opts.smooth !== false;
        const updateFn = () => {
          try {
            const maxX = bounds.x + Math.max(0, bounds.width  - cam.width);
            const maxY = bounds.y + Math.max(0, bounds.height - cam.height);
            let sx = cam.scrollX, sy = cam.scrollY, changed = false;
            if (sx < bounds.x) { sx = bounds.x; changed = true; }
            if (sy < bounds.y) { sy = bounds.y; changed = true; }
            if (sx > maxX)     { sx = maxX;     changed = true; }
            if (sy > maxY)     { sy = maxY;     changed = true; }
            if (changed) {
              if (smooth) {
                cam.scrollX = Phaser.Math.Linear(cam.scrollX, sx, 0.1);
                cam.scrollY = Phaser.Math.Linear(cam.scrollY, sy, 0.1);
              } else { cam.setScroll(Math.round(sx), Math.round(sy)); }
              if (cam.zoom < minZoom) cam.setZoom(minZoom);
              if (cam.zoom > maxZoom) cam.setZoom(maxZoom);
            }
          } catch (e) {}
        };
        if (scene.sys && scene.sys.events) scene.sys.events.on('update', updateFn);
        return () => { try { if (scene.sys && scene.sys.events) scene.sys.events.off('update', updateFn); } catch (e) {} };
      } catch (e) { if (DEBUG_MODE) console.warn('Camera clamp error:', e); return () => {}; }
    }

    // Settings (vault)
    async saveSettings(settings)      { return await this.vault.set('game_settings', settings, { persist: true }); }
    async loadSettings()              { return await this.vault.get('game_settings', { persist: true }) || {}; }
    async saveGraphicsConfig(config)  { const s = await this.loadSettings(); s.graphics = config; return await this.saveSettings(s); }
    async loadGraphicsConfig()        { const s = await this.loadSettings(); return s.graphics || {}; }

    // Performance Monitoring
    startMeasurement(key)  { this.performanceMonitor.start(key); }
    endMeasurement(key)    { this.performanceMonitor.end(key); }
    getMeasurement(key)    { return this.performanceMonitor.getMetric(key); }
    getPerformanceReport() { return this.performanceMonitor.getPerformanceReport(); }

    // Error Recovery
    registerRecoveryStrategy(type, fn) { this.errorRecovery.registerRecoveryStrategy(type, fn); }

    // Problem Detection
    scanForProblems() { return DEBUG_MODE ? this.problemDetector.scanInstance(this) : { severity: 'PROTECTED', problems: [], warnings: [] }; }
    enableProblemDetection(state) {
      this.opt.enableProblemDetection = state;
      if (state && !this._autoScanInterval && DEBUG_MODE)  this._startProblemDetection();
      else if (!state && this._autoScanInterval) { clearInterval(this._autoScanInterval); this._autoScanInterval = null; }
    }

    // Debug Control (solo afecta a este módulo, no expone SecuritySystem)
    enableDebugMode()  { return SecuritySystem.setDebugMode(true); }
    disableDebugMode() { return SecuritySystem.setDebugMode(false); }
    toggleDebugMode()  { return SecuritySystem.isDebugMode() ? this.disableDebugMode() : this.enableDebugMode(); }

    // Maintenance
    cleanup() {
      let cleaned = 0;
      if (this._initialized && this.pool) {
        for (const k of this.pool.pools.keys()) cleaned += this.pool.cleanupPool(k);
      }
      if (this._initialized && this.particles) cleaned += this.particles.cleanupInactiveEmitters();
      if (this._initialized && this.chunkManager) this.chunkManager.cleanup();
      safeLog('Cleanup completado, removidos:', cleaned);
      return cleaned;
    }

    // Stats
    getStats() {
      return Object.assign({
        version:            this.version,
        initialized:        this._initialized,
        uptime:             Date.now() - this.statsData.startupTime,
        frameCount:         this.statsData.frameCount,
        adaptivePerformance:this.adaptivePerformance.getPerformanceMetrics(),
        problemDetection:   DEBUG_MODE ? this.problemDetector.getReport() : { severity: 'PROTECTED' },
        security: { enabled: SECURITY_ENABLED, debugMode: SecuritySystem.isDebugMode(), environment: ENV_MODE === 0 ? 'development' : 'production' }
      }, {
        pool:          this._initialized && this.pool         ? this.pool.getStats()         : null,
        cull:          this._initialized && this.cull         ? this.cull.getStats()         : null,
        layerCache:    this._initialized && this.layerCache   ? this.layerCache.getStats()   : null,
        chunkManager:  this._initialized && this.chunkManager ? this.chunkManager.getStats() : null,
        particles:     this._initialized && this.particles    ? this.particles.getStats()    : null,
        vault:         this.vault.getStats(),
        textureCache:  this._initialized && this.textureCache ? this.textureCache.getStats() : null,
        sceneRegistrar:DEBUG_MODE ? this._registrar.getStats() : { registeredScenes: 'PROTECTED' },
        errorRecovery: this.errorRecovery.getErrorStats(),
        eventManager:  this.eventManager.getStats(),
        performance:   this.performanceMonitor.getPerformanceReport()
      });
    }

    // Destrucción
    destroy() {
      if (this._destroyed) { safeLog('PhaserRPGPerf ya destruido'); return; }
      safeLog('PhaserRPGPerf destroy iniciado');

      if (this._autoScanInterval) clearInterval(this._autoScanInterval);
      if (this._resizeHandler && typeof global !== 'undefined') {
        global.removeEventListener('resize',            this._resizeHandler);
        global.removeEventListener('orientationchange', this._resizeHandler);
      }
      if (this.game && this.game.events) {
        if (this._onPreStep)  this.game.events.off('prestep',  this._onPreStep);
        if (this._onPostStep) this.game.events.off('poststep', this._onPostStep);
      }
      if (this._memoryInterval) clearInterval(this._memoryInterval);

      try { if (this.chunkManager)   this.chunkManager.destroy();   } catch (e) {}
      try { if (this.pool)           this.pool.destroy();           } catch (e) {}
      try { if (this.layerCache)     this.layerCache.destroy();     } catch (e) {}
      try { if (this.cull)           this.cull.destroy();           } catch (e) {}
      try { if (this.particles)      this.particles.destroy();      } catch (e) {}
      try { if (this.eventManager)   this.eventManager.destroy();   } catch (e) {}
      try { if (this.performanceMonitor) this.performanceMonitor.destroy(); } catch (e) {}
      try { if (this.textureCache)   this.textureCache.destroy();   } catch (e) {}

      this._destroyed = true;
      safeLog('PhaserRPGPerf destruido completamente');
    }
  }

  // ── EXPORTACIÓN PÚBLICA ───────────────────────────────────────────────────
  //
  //  SecuritySystem NO se exporta — era el vector de ataque principal.
  //  Cualquier usuario podía llamar PhaserRPGPerf.SecuritySystem.setDebugMode(true)
  //  para desactivar todas las protecciones en 1 línea desde la consola.
  //
  //  Solo se exporta lo que el código del juego necesita legítimamente.
  //
  try {
    Object.defineProperty(global, 'PhaserRPGPerf', {
      value: {
        create:  (game, opts) => new PhaserRPGPerf(game, opts),
        version: '2.2.2',

        // Clases principales (para instanciación avanzada)
        SecureVault,
        AdvancedPixelScaler,
        PerformanceMonitor,
        AdvancedPerformanceMonitor,
        EnhancedEventManager,
        SmartTextureCache,
        ErrorRecoverySystem,
        AdaptivePerformanceManager,
        PoolManager,
        AdvancedCullManager,
        SmartLayerCache,
        DynamicChunkManager,
        EnhancedParticlePool,
        SecureSceneRegistrar,
        ProblemDetector,

        // Utilidades internas (solo para código del juego que las necesite)
        utils: { randHex, safeLog, debounce, throttle }

        // SecuritySystem: DELIBERADAMENTE NO EXPORTADO.
      },
      writable:     false,
      enumerable:   false, // no aparece en Object.keys(window)
      configurable: false
    });

    safeLog('PhaserRPGPerf v2.2.2 cargado');
  } catch (e) {
    if (DEBUG_MODE) console.error('PhaserRPGPerf export fallido:', e);
  }

  // Marcar como cargado
  Object.defineProperty(global, '__GF_PERF_LOADED__', {
    value: true, writable: false, configurable: false, enumerable: false
  });

})(typeof window !== 'undefined' ? window : this);
