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
    // FIX PARPADEO: margen amplio de culling (antes 64px). Con un margen corto,
    // los objetos se ocultaban/mostraban justo en el borde de la cámara y, con
    // el seguimiento suavizado (lerp), parpadeaban al moverse.
    cullPadding:      512,
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
    const debounced = function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...args); }, wait);
    };
    debounced.cancel = () => { clearTimeout(timer); timer = null; };
    return debounced;
  }

  function throttle(fn, limit) {
    let timer = null;
    const throttled = function (...args) {
      if (timer !== null) return;
      timer = setTimeout(() => { timer = null; }, limit);
      return fn.apply(this, args);
    };
    throttled.cancel = () => { clearTimeout(timer); timer = null; };
    return throttled;
  }
  function finiteNumber(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }
  function safeOptions(base, extra) {
    const result = { ...base };
    if (extra && typeof extra === 'object') {
      for (const key of Object.keys(extra)) {
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = extra[key];
      }
    }
    return result;
  }
  function cancelled() { const error = new Error('Operation cancelled'); error.name = 'AbortError'; return error; }
  function validSceneKey(key) {
    return typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key);
  }

  // ── PERFORMANCE MONITOR ───────────────────────────────────────────────────
  class PerformanceMonitor {
    constructor() {
      this.metrics    = new global.Map();
      this.sampleRate = DEFAULTS.performanceSampleRate;
      this.lastSample = 0;
    }

    start(key) {
      if (typeof key !== 'string' || key.length > 160 || this._destroyed) return;
      const previous = this.metrics.get(key);
      if (!previous && this.metrics.size >= 256) this.metrics.delete(this.metrics.keys().next().value);
      this.metrics.set(key, {
        total: previous?.total || 0,
        completed: previous?.completed || 0,
        running: true,
        start:    performance.now(),
        end:      0,
        duration: 0,
        calls:    (this.metrics.get(key)?.calls || 0) + 1
      });
    }

    end(key) {
      const m = this.metrics.get(key);
      if (!m || !m.running) return;
      m.running = false;
      m.end      = performance.now();
      m.duration = Math.max(0, m.end - m.start);
      m.total += m.duration;
      m.completed++;

      if (DEFAULTS.logPerformance && performance.now() - this.lastSample > this.sampleRate) {
        safeLog(`Performance — ${key}: ${m.duration.toFixed(2)}ms (calls: ${m.calls})`);
        this.lastSample = performance.now();
      }
    }

    getMetric(key)  { return this.metrics.get(key); }
    clear()         { this.metrics.clear(); }

    getStats() {
      const stats = Object.create(null);
      for (const [key, m] of this.metrics) {
        stats[key] = { duration: m.duration, calls: m.calls, average: m.completed > 0 ? m.total / m.completed : 0 };
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
      if (!global.PerformanceObserver || !DEBUG_MODE) return;
      try {
        this.performanceObserver = new PerformanceObserver(list => {
          list.getEntries().forEach(e => {
            if (e.entryType === 'measure') this._recordMetric('perf_entries', e);
          });
        });
        this.performanceObserver.observe({ entryTypes: ['measure'] });
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

    startFrame() {
      const now = performance.now();
      this._frameInterval = this._lastFrameStart === undefined ? 0 : Math.max(0, now - this._lastFrameStart);
      this._lastFrameStart = now;
      this.start('frame');
    }

    endFrame() {
      this.end('frame');
      const m = this.getMetric('frame');
      if (!m) return;
      this.frameTimes.push(this._frameInterval || m.duration);
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
      if (this._destroyed) return;
      if (!this.metricsHistory.has(key) && this.metricsHistory.size >= 256) this.metricsHistory.delete(this.metricsHistory.keys().next().value);
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
        fps:          avg > 0 ? 1000 / avg : 0,
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
      this._destroyed = true;
      if (this.performanceObserver)  this.performanceObserver.disconnect();
      if (this.longTaskObserver)     this.longTaskObserver.disconnect();
      this.performanceObserver = this.longTaskObserver = null;
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

    setScene(scene) {
      if (scene !== this.scene) this.removeAllListeners();
      this.scene = scene;
    }

    addListener(event, callback, context = this) {
      if (!this.scene || !this.scene.events) {
        if (DEBUG_MODE) console.warn('EnhancedEventManager: sin escena para evento:', event);
        return () => {};
      }
      if (!this._listeners.has(event)) this._listeners.set(event, new global.Map());
      const key = this._listenerKey(callback, context);
      if (this._listeners.get(event).has(key)) return () => this.removeListener(event, callback, context);
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
      const contextId = ctx !== null && (typeof ctx === 'object' || typeof ctx === 'function')
        ? __getListenerId(ctx) : `${typeof ctx}:${String(ctx)}`;
      return `${__getListenerId(cb)}_${contextId}`;
    }

    destroy() { this.removeAllListeners(); this._pending.clear(); this.scene = null; }

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
      this.store = new Map(); this.sessionKey = null; this.PREFIX = '__perf_vault_';
      this.initialized = false; this.encryptionEnabled = false; this._destroyed = false;
      this._epoch = 0; this._writes = new Map();
      this._initPromise = this._initialize();
    }
    async _initialize() {
      try {
        if (_crypto?.subtle) {
          const key = await _crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          if (!this._destroyed) { this.sessionKey = key; this.encryptionEnabled = true; }
        }
      } catch (e) { /* Encrypted persistence fails closed; explicit preferences may use v1. */ }
      if (!this._destroyed) this.initialized = true;
    }
    _init() { return this._initPromise; }
    _remember(key, value) {
      if (!this.store.has(key) && this.store.size >= 256) this.store.delete(this.store.keys().next().value);
      this.store.set(key, value);
    }
    async set(name, value, opts = {}) {
      if (this._destroyed || typeof name !== 'string' || name.length > 160) return false;
      const key = name, epoch = this._epoch, ticket = {};
      if (!this._writes.has(key) && this._writes.size >= 256) return false;
      this._writes.set(key, ticket);
      this._remember(key, value);
      const current = () => !this._destroyed && this._epoch === epoch && this._writes.get(key) === ticket;
      try {
        if (!opts.persist) return true;
        const json = JSON.stringify(value);
        if (typeof json !== 'string' || json.length > 1048576) return false;
        // Preferences are intentionally not secrets, and must survive a new session.
        if (opts.allowPlaintext === true) {
          if (!current()) return false;
          localStorage.setItem(this.PREFIX + key, JSON.stringify({ v: 1, data: JSON.parse(json), timestamp: Date.now() }));
          return true;
        }
        await this._initPromise;
        if (!current() || !this.encryptionEnabled || !this.sessionKey) return false;
        const iv = _crypto.getRandomValues(new Uint8Array(12));
        const ct = await _crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.sessionKey, _strToU8(json));
        if (!current()) return false;
        localStorage.setItem(this.PREFIX + key, JSON.stringify({ v: 2, iv: _bufToB64(iv.buffer), ct: _bufToB64(ct), timestamp: Date.now() }));
        return true;
      } catch (e) { return false; }
      finally { if (this._writes.get(key) === ticket) this._writes.delete(key); }
    }
    async get(name, opts = {}) {
      if (this._destroyed || typeof name !== 'string' || name.length > 160) return undefined;
      if (this.store.has(name)) return this.store.get(name);
      if (!opts.persist) return undefined;
      const epoch = this._epoch;
      try {
        const raw = localStorage.getItem(this.PREFIX + name);
        if (!raw || raw.length > 1500000) return undefined;
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object') return undefined;
        let value;
        if (payload.v === 1 && opts.allowPlaintext === true) value = payload.data;
        else if (payload.v === 2) {
          await this._initPromise;
          if (this._destroyed || epoch !== this._epoch || !this.sessionKey) return undefined;
          if (typeof payload.iv !== 'string' || typeof payload.ct !== 'string') return undefined;
          const iv = new Uint8Array(_b64ToBuf(payload.iv));
          if (iv.length !== 12) return undefined;
          const plain = await _crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.sessionKey, _b64ToBuf(payload.ct));
          value = JSON.parse(_u8ToStr(new Uint8Array(plain)));
        } else return undefined;
        if (this._destroyed || epoch !== this._epoch) return undefined;
        if (this.store.has(name)) return this.store.get(name);
        this._remember(name, value);
        return value;
      } catch (e) { return undefined; }
    }
    clearMemory() { this._epoch++; this.store.clear(); this._writes.clear(); }
    removePersisted(name) {
      this._writes.delete(name); this.store.delete(name); this._epoch++;
      try { localStorage.removeItem(this.PREFIX + String(name)); } catch (e) {}
    }
    clearAllPersisted() {
      this.clearMemory();
      try { Object.keys(localStorage).forEach(key => { if (key.startsWith(this.PREFIX)) localStorage.removeItem(key); }); } catch (e) {}
    }
    destroy() { this._destroyed = true; this.clearMemory(); this.sessionKey = null; this.encryptionEnabled = false; }
    getStats() { return { memItems: this.store.size, initialized: this.initialized, encryptionEnabled: this.encryptionEnabled }; }
  }

  // ── SMART TEXTURE CACHE ───────────────────────────────────────────────────
  class SmartTextureCache {
    constructor(scene, maxSizeMB = 50) {
      this.scene = scene; this.cache = new Map(); this.accessCount = new Map(); this.creationTime = new Map();
      this.sizes = new Map(); this.owned = new Set(); this.maxSize = finiteNumber(maxSizeMB, 50, 0, 512) * 1048576;
      this.currentSize = 0; this.hits = 0; this.misses = 0; this.enabled = true; this._destroyed = false;
    }
    _calcSize(texture) {
      if (!texture?.source) return 0;
      const sources = Array.isArray(texture.source) ? texture.source : [texture.source];
      return sources.reduce((sum, src) => sum + (src ? finiteNumber(src.width, 0, 0, 32768) * finiteNumber(src.height, 0, 0, 32768) * 4 : 0), 0);
    }
    _evict(targetSize = 0) {
      const entries = [...this.cache.keys()].sort((a,b) => this.accessCount.get(a) - this.accessCount.get(b));
      for (const key of entries) { if (this.currentSize <= targetSize) break; this.removeTexture(key); }
    }
    addTexture(key, texture, options = {}) {
      if (!this.enabled || this._destroyed || typeof key !== 'string' || key.length > 200) return false;
      const size = this._calcSize(texture);
      if (!size || size > this.maxSize) return false;
      if (this.cache.get(key) === texture) { this.accessCount.set(key, Date.now()); return true; }
      this.removeTexture(key);
      if (this.currentSize + size > this.maxSize) this._evict(this.maxSize - size);
      if (this.cache.size >= 1024) this.removeTexture(this.cache.keys().next().value);
      this.cache.set(key, texture); this.sizes.set(key, size); this.accessCount.set(key, Date.now()); this.creationTime.set(key, Date.now());
      if (options.owned === true) this.owned.add(key);
      this.currentSize += size;
      return true;
    }
    getTexture(key) {
      if (!this.enabled || !this.cache.has(key)) { this.misses++; return null; }
      const texture = this.cache.get(key);
      if (!texture.source) { this.removeTexture(key); this.misses++; return null; }
      this.accessCount.set(key, Date.now()); this.hits++; return texture;
    }
    removeTexture(key) {
      if (!this.cache.has(key)) return false;
      const texture = this.cache.get(key), owned = this.owned.delete(key);
      this.currentSize = Math.max(0, this.currentSize - this.sizes.get(key));
      this.cache.delete(key); this.sizes.delete(key); this.accessCount.delete(key); this.creationTime.delete(key);
      // A cache reference does not confer ownership of a shared game texture.
      if (owned) {
        try {
          if (this.scene?.textures?.get(key) === texture) this.scene.textures.remove(key);
          else if (texture.source && typeof texture.destroy === 'function') texture.destroy();
        } catch (e) {}
      }
      return true;
    }
    clear() { for (const key of [...this.cache.keys()]) this.removeTexture(key); }
    setEnabled(state) { this.enabled = !!state && !this._destroyed; if (!this.enabled) this.clear(); }
    resizeCache(mb) { this.maxSize = finiteNumber(mb, this.maxSize / 1048576, 0, 512) * 1048576; this._evict(this.maxSize); }
    getStats() {
      const total = this.hits + this.misses;
      return { enabled: this.enabled, totalTextures: this.cache.size, memoryUsage: this.currentSize, memoryLimit: this.maxSize,
        memoryUsageMB: (this.currentSize / 1048576).toFixed(2), hitRate: (total ? this.hits / total * 100 : 0).toFixed(2) + '%', hits: this.hits, misses: this.misses };
    }
    destroy() { this.clear(); this._destroyed = true; this.enabled = false; this.scene = null; }
  }

  // ── ERROR RECOVERY SYSTEM ─────────────────────────────────────────────────
  class ErrorRecoverySystem {
    constructor() {
      this.errorCounts       = new global.Map();
      this.maxRetries        = 3;
      this.recoveryCallbacks = new global.Map();
      this.circuitBreakers   = new global.Map();
      this._destroyed = false; this._waits = new Set();
    }

    registerRecoveryStrategy(type, fn) { if (this._destroyed || typeof type !== 'string' || type.length > 160 || typeof fn !== 'function') return; if (!this.recoveryCallbacks.has(type) && this.recoveryCallbacks.size >= 256) this.recoveryCallbacks.delete(this.recoveryCallbacks.keys().next().value); this.recoveryCallbacks.set(type, fn); }

    async executeWithRetry(operation, context = 'unknown', opType = 'generic', options = {}) {
      if (typeof operation !== 'function') throw new TypeError('Operation must be a function');
      const signal = options.signal;
      const check = () => { if (this._destroyed || signal?.aborted) throw cancelled(); };
      check();
      if (this.isCircuitBreakerOpen(context)) throw new Error('Operation temporarily unavailable');
      const attempts = Math.floor(finiteNumber(this.maxRetries, 3, 1, 5));
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          check();
          const result = await operation();
          check();
          this._recordSuccess(context);
          return result;
        } catch (error) {
          check();
          if (error?.name === 'AbortError') throw error;
          this._handleError(error, context, attempt, opType);
          if (attempt === attempts) {
            this._triggerCircuitBreaker(context);
            throw this._enhanceError(error, context, attempt);
          }
          await this._backoff(attempt, signal);
          check();
          if (this.recoveryCallbacks.has(opType)) {
            try { await this.recoveryCallbacks.get(opType)(context, attempt, error); } catch (e) {}
          }
        }
      }
    }

    _backoff(attempt, signal) {
      if (this._destroyed || signal?.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timer); this._waits.delete(abort); signal?.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        const abort = () => finish(cancelled());
        const timer = setTimeout(() => finish(), Math.min(100 * Math.pow(2, attempt - 1), 5000));
        this._waits.add(abort); signal?.addEventListener('abort', abort, { once: true });
      });
    }

    _handleError(error, context, attempt, opType) {
      const k = `${context}\0${opType}`;
      if (!this.errorCounts.has(k) && this.errorCounts.size >= 256) this.errorCounts.delete(this.errorCounts.keys().next().value);
      this.errorCounts.set(k, (this.errorCounts.get(k) || 0) + 1);
      safeLog(`Error recovery ${attempt}/${this.maxRetries} for ${context}:`, error?.message);
      if (DEBUG_MODE && DEFAULTS.debug) {
        console.groupCollapsed(`Error Details: ${context}`);
        console.error('Error:', error);
        console.log('Attempt:', attempt);
        console.groupEnd();
      }
    }

    _recordSuccess(context) {
      for (const k of this.errorCounts.keys()) {
        if (k.startsWith(`${context}\0`)) this.errorCounts.delete(k);
      }
      this.circuitBreakers.delete(context);
    }

    _triggerCircuitBreaker(context) {
      if (!this.circuitBreakers.has(context) && this.circuitBreakers.size >= 256) this.circuitBreakers.delete(this.circuitBreakers.keys().next().value);
      this.circuitBreakers.set(context, { triggeredAt: Date.now(), errorCount: this.errorCounts.get(context) || 1 });
      if (DEBUG_MODE) console.error(`Circuit breaker triggered: ${context}`);
    }

    _enhanceError(orig, context, attempt) {
      const e = new Error(`Operation failed after ${attempt} attempts: ${orig?.message || 'Unknown failure'}`);
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
    destroy() { this._destroyed = true; for (const cancel of [...this._waits]) cancel(); this.reset(); this.recoveryCallbacks.clear(); }
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

    // Frame por encima del cual la medida NO se considera una señal de calidad
    // del dispositivo, sino un parón: rAF estrangulado por el navegador
    // (pestaña de fondo, teléfono quieto con la CPU bajada de frecuencia), una
    // pausa del recolector de basura o un tirón puntual. 200 ms = 5 fps.
    static get STALL_FRAME_MS() { return 200; }

    recordFrameMetrics(frameTime, memoryUsage = 0) {
      if (!this.enabled) return;

      // Los parones no entran en el historial, y además lo VACÍAN: las medidas
      // anteriores describen un estado que ya no es el actual.
      //
      // Sin esto, dejar el personaje quieto un buen rato en el móvil bastaba
      // para hundir la calidad: el navegador baja el ritmo de refresco, se
      // acumulan 30 frames "lentísimos" que no tienen nada que ver con lo que
      // el móvil puede dar, la calidad adaptativa lo lee como "este aparato no
      // da más" y baja de tier. Al volver a moverte, el juego ya arrancaba
      // degradado.
      if (!(frameTime > 0) || frameTime > AdaptivePerformanceManager.STALL_FRAME_MS) {
        this.performanceHistory.length = 0;
        this.lastAdjustmentTime = Date.now();  // margen antes de volver a decidir
        return;
      }

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
      const downThreshold = DEFAULTS.maxFrameTime + HYST;   // 36 ms (~28 fps)

      // Umbral para SUBIR de calidad.
      //
      // Antes era `minFrameTime - HYST` = 16 - 3 = 13 ms, o sea que para
      // recuperar calidad el juego tenía que sostener MÁS de 76 fps. Con la
      // sincronía vertical a 60 fps el frame-time nunca baja de ~16.7 ms, así
      // que ese umbral era IMPOSIBLE de alcanzar: la calidad podía bajar pero
      // no volvía a subir jamás. Una vez degradado, seguía degradado el resto
      // de la sesión aunque el móvil fuera perfectamente capaz.
      //
      // Ahora se pide ir claramente holgado (por debajo de 20 ms ≈ 50 fps
      // sostenidos), que sí es alcanzable a 60 fps, y sigue quedando una zona
      // muerta amplia (20–36 ms) donde no se toca nada.
      const upThreshold   = DEFAULTS.maxFrameTime - 13;     // 20 ms (~50 fps)

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
      if (this.game?.events) {
        this.game.events.emit('qualitychanged', { from, to: tier, settings: this.currentSettings });
      }
    }

    forceQualityTier(tier)           { if (Object.prototype.hasOwnProperty.call(this.qualitySettings, tier)) { this._applyTier(tier); this.enabled = false; } }
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
      this._destroyed = false;
      this.stats = { totalSpawns: 0, totalDespawns: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };
      this.errorRecovery = new ErrorRecoverySystem();
    }

    createPool(key, factoryFn, size = 20, resetFn = null) {
      if (this._destroyed || typeof factoryFn !== 'function' || !Number.isInteger(size) || size < 0 || size > 10000) return Promise.resolve(null);
      return this.errorRecovery.executeWithRetry(async () => {
        if (this.pools.has(key)) { safeLog('Pool ya existe:', key); return this.pools.get(key); }
        const arr = [];
        let created = 0, errors = 0;
        for (let i = 0; i < size; i++) {
          let obj;
          try {
            obj = factoryFn();
            if (!obj || typeof obj !== 'object' || typeof obj.then === 'function' || arr.includes(obj)) throw new TypeError('Pool factory must create a unique object');
            if (obj && obj.setActive)  obj.setActive(false);
            if (obj && obj.setVisible) obj.setVisible(false);
            if (obj.body) obj.body.enable = false;
            arr.push(obj); created++;
          } catch (e) { if (obj && !arr.includes(obj) && typeof obj.destroy === 'function') { try { obj.destroy(); } catch (ignored) {} } errors++; if (DEBUG_MODE) console.warn('Pool factory error:', key, e); }
        }
        const pool = { arr, factoryFn, resetFn, size, created, errors };
        this.pools.set(key, pool);
        safeLog('Pool creado:', key, 'size:', size, 'created:', created);
        return pool;
      }, `createPool_${key}`, 'pool_creation')
      .catch(e => { if (DEBUG_MODE) console.error('Error creando pool:', key, e); return null; });
    }

    spawn(key, x, y, ...args) {
      if (this._destroyed) return null;
      const entry = this.pools.get(key);
      if (!entry) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool no encontrado:', key); return null; }

      let obj = null;
      for (const o of entry.arr) {
        if (o && !o.active && (!o.visible || o.visible === false)) { obj = o; this.stats.cacheHits++; break; }
      }

      if (!obj) {
        if (entry.arr.length >= 10000) return null;
        try {
          obj = entry.factoryFn(...args);
          if (!obj || typeof obj !== 'object' || typeof obj.then === 'function' || entry.arr.includes(obj)) throw new TypeError('Invalid pool object');
          entry.arr.push(obj); this.stats.cacheMisses++;
        }
        catch (e) { this.stats.errors++; if (DEBUG_MODE) console.warn('Pool factory error en spawn:', key, e); return null; }
      }

      try {
        if (obj.setPosition && typeof x === 'number' && typeof y === 'number') obj.setPosition(x, y);
        if (obj.setActive)   obj.setActive(true);
        if (obj.setVisible)  obj.setVisible(true);
        if (obj.body && obj.body.enable !== undefined) obj.body.enable = true;
        if (typeof obj.onSpawn === 'function') obj.onSpawn(x, y, ...args);
      } catch (e) { this.stats.errors++; this.despawn(obj); return null; }

      this.stats.totalSpawns++;
      return obj;
    }

    despawn(obj) {
      if (!obj || this._destroyed) return;
      const owner = [...this.pools.values()].find(entry => entry.arr.includes(obj));
      if (!owner) return;
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
      if (this._destroyed || !Number.isInteger(newSize) || newSize < 0 || newSize > 10000) return false;
      const entry = this.pools.get(key);
      if (!entry) return false;
      const curr = entry.arr.length;
      if (newSize > curr) {
        for (let i = curr; i < newSize; i++) {
          try {
            const o = entry.factoryFn();
            if (!o || typeof o !== 'object' || typeof o.then === 'function' || entry.arr.includes(o)) continue;
            if (o.body) o.body.enable = false;
            if (o && o.setActive)  o.setActive(false);
            if (o && o.setVisible) o.setVisible(false);
            entry.arr.push(o);
          } catch (e) { this.stats.errors++; }
        }
      } else if (newSize < curr) {
        for (let i = entry.arr.length - 1; i >= 0 && entry.arr.length > newSize; i--) {
          const obj = entry.arr[i];
          if (obj?.active) continue;
          try { obj?.destroy?.(); entry.arr.splice(i, 1); } catch (e) { this.stats.errors++; }
        }
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

    destroy() { if (this._destroyed) return; this._destroyed = true; this.errorRecovery.destroy(); for (const k of [...this.pools.keys()]) this.destroyPool(k); this.pools.clear(); this.scene = null; }

    getStats() {
      const poolStats = Object.create(null);
      for (const [k, v] of this.pools) {
        const active   = v.arr.filter(o => o && o.active).length;
        poolStats[k]   = { total: v.arr.length, active, inactive: v.arr.length - active, configuredSize: v.size, created: v.created, errors: v.errors };
      }
      return { pools: poolStats, performance: { ...this.stats }, errorStats: this.errorRecovery.getErrorStats() };
    }
  }

  // ── ADVANCED CULL MANAGER ─────────────────────────────────────────────────
  /**
   * Ocultación por FRUSTUM: tapa lo que se sale del rectángulo de la cámara.
   *
   * ── QUIÉN HACE QUÉ (2026-08-11) ──────────────────────────────────────────
   * Este gestor estaba desconectado: se instanciaba en init() y registraba sus
   * manejadores por frame, pero NADIE llamaba a cull.add(), así que trabajaba
   * en vacío 60 veces por segundo. Ya no: _onUpdate sale de inmediato si no
   * hay objetos registrados, y _updateVisibility dejó de resucitar objetos.
   *
   * En este proyecto el trabajo está repartido así, y conviene no mezclarlo:
   *
   *   • MAPA (terreno)          → lib/tileManager.js. Carga y descarga trozos
   *                               de 2048 px alrededor de la cámara. Es el
   *                               sistema de chunks de verdad, y está vivo.
   *   • OBJETOS (árboles,       → gf-graphics-settings.js. Oculta por DISTANCIA
   *     casas, imágenes)          al jugador, con la barra del panel de
   *                               ajustes. Respeta la visibilidad propia de
   *                               cada objeto (un árbol talado no reaparece).
   *   • ESTE GESTOR             → disponible para quien quiera ocultación por
   *                               frustum de sus propios objetos, vía
   *                               cull.add(objeto). Duerme sin coste hasta
   *                               entonces.
   *
   * IMPORTANTE si algún día se conecta a los objetos del mapa: NO lo enchufes
   * a los mismos sprites que ya gestiona gf-graphics-settings.js. Dos sistemas
   * escribiendo la misma propiedad `visible` se pisan entre ellos, que es
   * justo la clase de fallo que provocaba los saltos de zoom de este proyecto.
   */
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
      if (!target || this._destroyed) return;
      this.remove(target);
      this.targets.set(target, {
        target, persistent: options.persistent || false,
        lastState: null, bounds: options.bounds || null,
        updateFrequency: Math.floor(finiteNumber(options.updateFrequency, 1, 1, 1000))
      });
      if (typeof target.once === 'function') {
        const gone = () => { this.targets.delete(target); };
        this.targets.get(target).gone = gone;
        target.once('destroy', gone);
      }
    }

    remove(target) {
      const data = this.targets.get(target);
      if (!data) return;
      this._restore(data);
      if (data.gone && typeof target.off === 'function') target.off('destroy', data.gone);
      this.targets.delete(target);
    }
    _restore(data) {
      if (!data.ocultadoPorCull) return;
      const target = data.target;
      data.ocultadoPorCull = false; data.lastState = null;
      if (target.setVisible) target.setVisible(data.visiblePrevio);
      if (target.setActive) target.setActive(data.activoPrevio);
      if (target.body && target.body === data.bodyPrevio) target.body.enable = data.bodyEnabledPrevio;
      data.bodyPrevio = null;
    }
    setEnabled(state) {
      this.enabled = !!state && !this._destroyed;
      if (!this.enabled) for (const data of this.targets.values()) this._restore(data);
    }
    setOptimizedUpdate(state)  { this.optimizedUpdate = state; }

    _onPreUpdate() {
      if (!this.enabled) return;
      this.stats.lastUpdateTime = performance.now();
    }

    _onUpdate() {
      if (!this.enabled || !this.scene?.cameras?.main) return;

      // SIN OBJETOS REGISTRADOS NO HAY NADA QUE HACER.
      // Este manejador corre en CADA frame desde que se crea el gestor. Como
      // en este proyecto nunca se llama a cull.add(), se estaba calculando el
      // rectángulo de la cámara y construyendo un array vacío 60 veces por
      // segundo, para nada. La comprobación va la PRIMERA, antes de tocar la
      // cámara o reservar memoria.
      if (this.targets.size === 0) return;

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

    /**
     * BUG LATENTE ARREGLADO: antes, al volver a entrar en cuadro, esto hacía
     * `setVisible(true)` sin más. O sea que RESUCITABA cualquier objeto que el
     * juego hubiera escondido a propósito: un árbol ya talado, una puerta
     * cerrada, un objeto recogido. El fallo no se veía porque nadie llegó a
     * llamar a cull.add(), pero habría aparecido en cuanto alguien conectara
     * este gestor.
     *
     * Ahora se recuerda si la ocultación la hizo ESTE gestor (`ocultadoPorCull`)
     * y qué visibilidad tenía el objeto justo antes. Al volver a entrar solo se
     * restaura ese valor, nunca un `true` inventado. Lo que ya estaba invisible
     * por decisión del juego, invisible se queda.
     */
    _updateVisibility(data, visible) {
      if (data.lastState === visible) return;
      const t = data.target;

      if (visible) {
        // Solo se restaura lo que escondimos nosotros.
        this._restore(data);
      } else {
        // Se guarda el estado propio del objeto antes de taparlo.
        if (!data.ocultadoPorCull) {
          data.visiblePrevio = t.visible;
          data.activoPrevio  = t.active;
          data.bodyPrevio = t.body;
          data.bodyEnabledPrevio = t.body?.enable;
          data.ocultadoPorCull = true;
          if (t.setVisible) t.setVisible(false);
          if (t.setActive)  t.setActive(false);
          if (t.body && t.body.enable !== undefined) t.body.enable = false;
        }
      }

      data.lastState = visible;
      this.stats.visibilityChanges++;
    }

    destroy() { if (this._destroyed) return; this._destroyed = true; this.enabled = false; this.eventManager.destroy(); for (const target of [...this.targets.keys()]) this.remove(target); this.scene = null; }

    getStats() {
      return { ...this.stats, totalTargets: this.targets.size, enabled: this.enabled, optimizedUpdate: this.optimizedUpdate };
    }
  }

  // ── SMART LAYER CACHE ─────────────────────────────────────────────────────
  class SmartLayerCache {
    constructor(scene) {
      this.scene = scene; this.cache = new Map();
      this.textureCache = new SmartTextureCache(scene, DEFAULTS.textureCacheSizeMB);
      this.enabled = DEFAULTS.enableSmartCaching; this._destroyed = false;
    }
    _create(layer, previous = null) {
      if (!this.enabled || this._destroyed || !layer?.tilemap || !layer.layer) return null;
      const w = layer.layer.width * layer.tilemap.tileWidth, h = layer.layer.height * layer.tilemap.tileHeight;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > DEFAULTS.maxRenderTextureSize || h > DEFAULTS.maxRenderTextureSize) return null;
      const used = this.getStats().memoryUsage - (previous?.memoryUsage || 0);
      if (used + w * h * 4 > this.textureCache.maxSize) return null;
      let rt = null, img = null, texKey = null, saved = false;
      const visible = previous ? previous.visible : layer.visible;
      try {
        rt = this.scene.make.renderTexture({ width: w, height: h, add: false });
        const wasVisible = layer.visible;
        try { layer.setVisible(true); rt.draw(layer); } finally { layer.setVisible(wasVisible); }
        texKey = `layercache-${Date.now()}-${randHex(12)}`;
        rt.saveTexture(texKey); saved = true;
        img = this.scene.add.image(layer.x || 0, layer.y || 0, texKey).setOrigin(0);
        if (layer.depth !== undefined) img.setDepth(layer.depth);
        img.setVisible(visible !== false);
        if (img.setAlpha && layer.alpha !== undefined) img.setAlpha(layer.alpha);
        if (img.setScale) img.setScale(layer.scaleX ?? 1, layer.scaleY ?? 1);
        if (img.setScrollFactor) img.setScrollFactor(layer.scrollFactorX ?? 1, layer.scrollFactorY ?? 1);
        if (img.setRotation) img.setRotation(layer.rotation || 0);
        layer.setVisible(false);
        return { rt, img, texKey, original: layer, visible, size: { w, h }, timestamp: Date.now(), memoryUsage: w * h * 4 };
      } catch (e) {
        try { img?.destroy(); } catch (ignored) {}
        try { rt?.destroy(); } catch (ignored) {}
        if (saved) { try { this.scene.textures.remove(texKey); } catch (ignored) {} }
        return null;
      }
    }
    _release(rec) {
      if (rec.gone && typeof rec.original.off === 'function') rec.original.off('destroy', rec.gone);
      try { rec.img?.destroy(); } catch (e) {}
      try { rec.rt?.destroy(); } catch (e) {}
      // saveTexture transfers the DynamicTexture to TextureManager (RenderTexture will not free it).
      try { this.scene?.textures.remove(rec.texKey); } catch (e) {}
    }
    _track(layer, rec) {
      if (typeof layer.once === 'function') { rec.gone = () => this.uncache(layer, false); layer.once('destroy', rec.gone); }
      this.cache.set(layer, rec);
      return rec;
    }
    cacheTilemapLayer(layer) {
      if (this.cache.has(layer)) return this.cache.get(layer);
      const rec = this._create(layer);
      return rec ? this._track(layer, rec) : null;
    }
    refresh(layer) {
      const previous = this.cache.get(layer);
      if (!previous) return this.cacheTilemapLayer(layer);
      const rec = this._create(layer, previous);
      if (!rec) return null; // Keep the last complete rendered image on failure.
      this._release(previous);
      return this._track(layer, rec);
    }
    uncache(layer, restore = true) {
      const rec = this.cache.get(layer); if (!rec) return;
      this.cache.delete(layer); this._release(rec);
      if (restore && layer.setVisible) layer.setVisible(rec.visible);
    }
    setEnabled(state) { this.enabled = !!state && !this._destroyed; if (!this.enabled) this.clear(); }
    clear() { for (const layer of [...this.cache.keys()]) this.uncache(layer); }
    destroy() { if (this._destroyed) return; this.clear(); this.textureCache.destroy(); this._destroyed = true; this.enabled = false; this.scene = null; }
    getStats() {
      const memoryUsage = [...this.cache.values()].reduce((total, rec) => total + rec.memoryUsage, 0);
      return { cachedLayers: this.cache.size, memoryUsage, memoryUsageMB: (memoryUsage / 1048576).toFixed(2), enabled: this.enabled, textureCache: this.textureCache.getStats() };
    }
  }

  // ── DYNAMIC CHUNK MANAGER ─────────────────────────────────────────────────
  /**
   * Carga y descarga de chunks alrededor del jugador.
   *
   * NO SE USA EN ESTE PROYECTO, y es a propósito: necesita un `provider` que
   * dibuje el contenido de cada chunk (setProvider), y aquí ese trabajo ya lo
   * hace lib/tileManager.js, que además sirve los trozos del mapa como
   * imágenes con varios niveles de detalle (hd/md/low) y con histéresis de
   * descarga. La barra de "Distancia de visión" del panel de ajustes actúa
   * sobre ÉL (tileManager.setMargin), no sobre esta clase.
   *
   * Se conserva exportada porque la API pública la ofrece, pero no se
   * instancia en ningún momento: no consume nada mientras nadie la cree.
   * Si algún día se usa, recuerda darle setProvider() y setPlayer(), porque
   * sin las dos cosas _update() sale sin hacer nada.
   */
  class DynamicChunkManager {
    constructor(scene, map, options = {}) {
      this.scene    = scene;
      this.map      = map || null;
      this.opt      = safeOptions(DEFAULTS, options);
      this.loaded   = new global.Map();
      this.opt.chunkSizeTiles = Math.floor(finiteNumber(this.opt.chunkSizeTiles, 16, 1, 256));
      this.opt.chunkRadius = Math.floor(finiteNumber(this.opt.chunkRadius, 2, 0, 8));
      this.chunkW = this.opt.chunkSizeTiles * finiteNumber(map?.tileWidth, 32, 1, 4096);
      this.chunkH = this.opt.chunkSizeTiles * finiteNumber(map?.tileHeight, 32, 1, 4096);
      this._destroyed = false;
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
    setEnabled(state) { this.enabled = !!state && !this._destroyed; }

    _chunkKey(cx, cy) { return `${cx},${cy}`; }
    worldToChunk(x, y) { return [Math.floor(x / this.chunkW), Math.floor(y / this.chunkH)]; }

    /**
     * DOS FALLOS QUE ESTO ARREGLA — "las cosas titilean, aparecen y se quitan
     * otra vez" y los tirones que no venían de ninguna escena:
     *
     * 1) NO HABÍA HISTÉRESIS. Se cargaba y se descargaba con el MISMO radio,
     *    así que el chunk del borde estaba justo en la frontera entre "hace
     *    falta" y "fuera". Al caminar por esa línea —o simplemente al oscilar
     *    el jugador fracciones de píxel— Math.floor(x / chunkW) saltaba entre
     *    N y N+1 en fotogramas consecutivos, y con él la lista de chunks
     *    necesarios. Resultado: el mismo chunk se destruía y se volvía a
     *    construir una y otra vez. Eso es exactamente el parpadeo de casas y
     *    árboles, y como descargar hace `container.destroy(true)` sobre TODOS
     *    los objetos del chunk, cada rebote costaba un fotograma entero: los
     *    tirones aleatorios al caminar.
     *
     *    Ahora se CARGA con el radio normal pero se DESCARGA solo a partir de
     *    radio + 1. Entre los dos queda un anillo de un chunk de ancho que
     *    absorbe el vaivén: para que algo se descargue hay que alejarse de
     *    verdad, no rozar la frontera.
     *
     * 2) SE RECALCULABA EN CADA FOTOGRAMA. Este método está enganchado al
     *    'update', o sea 60 veces por segundo: reservaba un Set nuevo, recorría
     *    25 posiciones (radio 2) y además barría el Map entero de chunks
     *    cargados… para llegar casi siempre a la misma conclusión, porque el
     *    chunk del jugador solo cambia cada muchos segundos. Ahora solo se
     *    rehace cuando el jugador CAMBIA de chunk, con un repaso de seguridad
     *    cada 2 s por si algo se cargó por otra vía.
     */
    _update() {
      if (!this.enabled || this._destroyed || !this.playerRef || !this.provider || !Number.isFinite(this.playerRef.x) || !Number.isFinite(this.playerRef.y)) return;

      const [cx, cy] = this.worldToChunk(this.playerRef.x, this.playerRef.y);
      const ahora = Date.now();

      if (this._ultCx === cx && this._ultCy === cy &&
          this._ultRevision && (ahora - this._ultRevision) < 2000) {
        return;
      }
      this._ultCx = cx;
      this._ultCy = cy;
      this._ultRevision = ahora;

      const radioCarga   = Math.floor(finiteNumber(this.opt.chunkRadius, 2, 0, 8));
      const radioDescarga = radioCarga + 1;   // el anillo de histéresis

      for (let dx = -radioCarga; dx <= radioCarga; dx++) {
        for (let dy = -radioCarga; dy <= radioCarga; dy++) {
          const key = this._chunkKey(cx + dx, cy + dy);
          if (!this.loaded.has(key)) this.loadChunk(cx + dx, cy + dy);
        }
      }

      // Descargar por DISTANCIA, no por pertenencia a la lista de este
      // fotograma: así el anillo intermedio sobrevive a los vaivenes.
      for (const [, rec] of this.loaded) {
        if (Math.abs(rec.cx - cx) > radioDescarga ||
            Math.abs(rec.cy - cy) > radioDescarga) {
          this.unloadChunk(rec.cx, rec.cy);
        }
      }
    }

    loadChunk(cx, cy) {
      if (this._destroyed || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cy)) return Promise.resolve(null);
      const key = this._chunkKey(cx, cy), existing = this.loaded.get(key);
      if (existing) return existing.promise || Promise.resolve(existing.container);
      if (this.loaded.size >= 512) return Promise.resolve(null);
      const rec = { cx, cy, container: null, status: 'loading', key, controller: new AbortController() };
      this.loaded.set(key, rec);
      const current = () => !this._destroyed && !rec.controller.signal.aborted && this.loaded.get(key) === rec;
      const release = () => {
        const container = rec.container; rec.container = null;
        try { container?.destroy(); } catch (e) { this.stats.unloadErrors++; }
      };
      rec.release = release;
      const provider = this.provider;
      rec.promise = this.errorRecovery.executeWithRetry(async () => {
        if (!current()) throw cancelled();
        const began = Date.now();
        rec.container = this.scene.add.container(cx * this.chunkW, cy * this.chunkH);
        rec.container.name = `chunk-${key}`;
        this.stats.lastLoadTime = began;
        try {
          if (provider) await provider(cx, cy, rec.container, this.map, rec.controller.signal);
          if (!current()) throw cancelled();
          rec.status = 'ready'; rec.loadTime = Date.now() - began; this.stats.totalLoaded++;
          return rec.container;
        } catch (error) {
          release();
          if (error?.name !== 'AbortError') this.stats.loadErrors++;
          throw error;
        }
      }, `loadChunk_${key}`, 'chunk_loading', { signal: rec.controller.signal }).catch(() => {
        release();
        if (this.loaded.get(key) === rec) this.loaded.delete(key);
        return null;
      });
      return rec.promise;
    }
    unloadChunk(cx, cy) {
      const key = this._chunkKey(cx, cy), rec = this.loaded.get(key);
      if (!rec) return;
      this.loaded.delete(key); rec.controller.abort(); rec.release(); this.stats.totalUnloaded++;
    }
    preloadChunks(x, y, radius = 1) {
      if (this._destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const [cx, cy] = this.worldToChunk(x, y);
      radius = Math.floor(finiteNumber(radius, 1, 0, 8));
      for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) this.loadChunk(cx + dx, cy + dy);
    }
    cleanup() { for (const rec of [...this.loaded.values()]) if (rec.status === 'error') this.unloadChunk(rec.cx, rec.cy); }
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true; this.enabled = false;
      this.eventManager.destroy(); this._updateBound.cancel(); this.errorRecovery.destroy();
      for (const rec of [...this.loaded.values()]) this.unloadChunk(rec.cx, rec.cy);
      this.playerRef = this.provider = this.map = this.scene = null;
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
      this._destroyed = false;
    }

    // Solo relevante en la API antigua (≤3.55): devuelve un manager reutilizable.
    // En 3.60+ no existen managers, así que este método no se usa.
    getManager(key, textureKey) {
      if (this._destroyed || !_particleApiIsLegacy) return null;
      if (this.managers.has(key)) return this.managers.get(key);
      const mgr = this.scene.add.particles(textureKey || key);
      this.managers.set(key, mgr);
      return mgr;
    }

    createEmitter(key, cfg) {
      if (this._destroyed) return null;
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
      if (em.emitting !== false && em.on !== false) this.activeEmitters.add(em);
      if (typeof em.once === 'function') {
        const gone = () => this._forgetEmitter(em);
        this.configs.get(em).gone = gone;
        em.once('destroy', gone);
      }
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

    _forgetEmitter(em) {
      if (!em) return;
      const cfg = this.configs.get(em);
      if (cfg) {
        const es = this.emitters.get(cfg.key) || [];
        const i  = es.indexOf(em);
        if (i > -1) es.splice(i, 1);
        if (es.length === 0) this.emitters.delete(cfg.key);
        if (cfg.gone && typeof em.off === 'function') em.off('destroy', cfg.gone);
        this.configs.delete(em);
      }
      this.activeEmitters.delete(em);
    }
    destroyEmitter(em) {
      if (!this.configs.has(em)) return;
      this._forgetEmitter(em);
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
          const isEmitting = typeof em.emitting === 'boolean' ? em.emitting : typeof em.on === 'boolean' ? em.on : this.activeEmitters.has(em);
          if (isEmitting || (typeof em.getAliveParticleCount === 'function' && em.getAliveParticleCount() > 0)) return true;
          this.destroyEmitter(em); cleaned++;
          return false;
        });
        if (active.length) this.emitters.set(key, active); else this.emitters.delete(key);
      }
      return cleaned;
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      // FIX: misma razón que en cleanupInactiveEmitters — iterar sobre copia
      // porque destroyEmitter() muta el array original con splice (antes se
      // saltaba uno de cada dos emitters y quedaban vivos tras destroy()).
      for (const ems of this.emitters.values()) Array.from(ems).forEach(em => this.destroyEmitter(em));
      for (const m of this.managers.values()) { try { m.destroy(); } catch (e) {} }
      this.managers.clear(); this.emitters.clear(); this.configs.clear(); this.activeEmitters.clear(); this.scene = null;
    }

    getStats() {
      const stats = { totalManagers: this.managers.size, totalEmitters: 0, activeEmitters: this.activeEmitters.size, byKey: Object.create(null) };
      for (const [k, ems] of this.emitters) {
        stats.byKey[k] = { total: ems.length, active: ems.filter(e => this.activeEmitters.has(e)).length };
        stats.totalEmitters += ems.length;
      }
      return stats;
    }
  }

  // ── ADVANCED PIXEL SCALER ─────────────────────────────────────────────────
  class AdvancedPixelScaler {
    /**
     * Ajusta la CALIDAD de render (pixel art, filtrado, suavizado). NO toca el
     * TAMAÑO del juego.
     *
     * =====================================================================
     * FIX ZOOM EN MÓVIL (causa raíz)
     * ---------------------------------------------------------------------
     * Antes esta función llamaba a `game.scale.resize(cssW * dpr, cssH * dpr)`,
     * es decir, redimensionaba el juego a píxeles FÍSICOS del dispositivo.
     * Al mismo tiempo, app.js (su gestor de resize) llamaba a
     * `game.scale.resize(innerWidth, innerHeight)`, o sea a píxeles CSS.
     *
     * En un PC normal (devicePixelRatio = 1) ambos valores son idénticos y no
     * se notaba nada. En un teléfono (dpr 2 ó 3) son 2x/3x distintos, así que
     * en CADA evento `resize` los dos sistemas se peleaban: uno dejaba el
     * mundo con el doble/triple de ancho visible y el otro lo devolvía. Eso es
     * el "se da zoom" al abrir un panel, al abrir el chat (teclado = resize) o
     * al hacer clic (la barra del navegador se esconde = resize).
     *
     * El tamaño del juego ahora tiene UN SOLO dueño: el gestor de resize de
     * app.js. Aquí solo se aplican los ajustes de nitidez.
     *
     * `resizeGame: true` mantiene el comportamiento antiguo por si algún
     * código externo dependía de él; nadie del juego lo usa.
     * =====================================================================
     */
    static applyPixelPerfect(game, opts = {}) {
      const options = Object.assign({
        pixelArt: true, roundPixels: true, antialias: false,
        crispScaling: true, integerScaling: true,
        preserveDrawingBuffer: false, preserveTextRendering: true,
        resizeGame: false
      }, opts);

      try {
        if (!game) return false;

        if (game.config) {
          game.config.pixelArt              = Boolean(options.pixelArt);
          game.config.roundPixels           = Boolean(options.roundPixels);
          game.config.antialias             = Boolean(options.antialias);
          game.config.preserveDrawingBuffer = Boolean(options.preserveDrawingBuffer);
        }

        // Renderer Canvas 2D (el respaldo cuando no hay WebGL): su propiedad
        // `antialias` es la que decide `imageSmoothingEnabled` al redibujar.
        // Sin esto el pixel art sale borroso en los equipos sin GPU, que son
        // justo los que menos margen tienen.
        if (game.renderer) {
          try {
            if (!game.renderer.gl) {
              game.renderer.antialias = !options.pixelArt;
              if (game.context) game.context.imageSmoothingEnabled = !options.pixelArt;
            }
          } catch (e) { /* renderer aún no listo: se reintenta en el próximo pase */ }
        }

        // TAMAÑO: deliberadamente NO se toca (ver comentario de arriba).
        if (options.resizeGame && game.scale && typeof game.scale.resize === 'function') {
          const dpr  = Math.max(1, global.devicePixelRatio || 1);
          const cssW = Math.floor(global.innerWidth);
          const cssH = Math.floor(global.innerHeight);
          const scale = (options.integerScaling && options.pixelArt)
            ? Math.max(1, Math.floor(dpr))
            : dpr;
          game.scale.resize(Math.floor(cssW * scale), Math.floor(cssH * scale));
        }

        const canvas = game.canvas;
        if (canvas) {
          // '100%' en lugar de px fijos: así el lienzo siempre llena su
          // contenedor sin importar en qué momento se ejecute el handler
          // (DevTools abriéndose, barra del navegador escondiéndose…).
          canvas.style.width  = '100%';
          canvas.style.height = '100%';
          // FIX NITIDEZ: antes `preserveTextRendering` (true por defecto) ponía
          // 'auto', o sea suavizado activo en un juego de pixel art — se veía
          // borroso en el móvil, y encima entraba en conflicto con app.js y
          // viewport-fix.js, que ponen 'pixelated'. Ahora manda `pixelArt`.
          canvas.style.imageRendering = options.pixelArt
            ? 'pixelated'
            : (options.preserveTextRendering ? 'auto' : 'crisp-edges');
          canvas.style.transformOrigin = '0 0';

          // FIX FUGA: esto se ejecutaba en CADA resize y añadía un listener
          // nuevo cada vez (cientos tras unos minutos de juego en el móvil).
          if (!canvas.__gfNoContextMenu) {
            canvas.__gfNoContextMenu = true;
            canvas.addEventListener('contextmenu', e => e.preventDefault());
          }
        }

        safeLog('Pixel perfect aplicado — pixelArt:', options.pixelArt);
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

      this._destroyed = false;
      this._controller = new AbortController();
    }

    clearPublicRegistrations() {
      // Scene classes are shared input. Deleting them breaks other registrars/restarts
      // and does not form a security boundary inside the same browser context.
    }

    async registerFromGlobals(game) {
      if (this._destroyed || !game?.scene || game.pendingDestroy) return false;
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
      }, 'registerFromGlobals', 'scene_registration', { signal: this._controller.signal })
      .catch(e => { if (DEBUG_MODE) console.error('Error registrando escenas:', e); return false; });
    }

    // ── Registro en Phaser con nombre amigable ────────────────────────────
    _registerScene(game, friendlyName, cls, options = {}) {
      if (this._destroyed || !game?.scene || game.pendingDestroy || !validSceneKey(friendlyName) || typeof cls !== 'function') return false;
      const sp = game.scene;

      // La clave en Phaser ES el nombre amigable — no hay codificación Base64.
      // Esto garantiza que game.scene.start(friendlyName) funcione siempre.
      const phaserKey = friendlyName;

      const entry = { key: phaserKey, cls, options: safeOptions({}, options) };

      try {
        if (sp.keys && Object.prototype.hasOwnProperty.call(sp.keys, phaserKey)) {
          this.mapping.set(friendlyName, entry);
          safeLog('Escena ya registrada:', friendlyName);
          return true;
        }
        sp.add(phaserKey, cls, false);
        this.mapping.set(friendlyName, entry);
        safeLog('Escena registrada:', friendlyName);
        return true;
      } catch (e) {
        if (DEBUG_MODE) console.warn('Error registrando escena:', friendlyName, e);
        return false;
      }
    }

    startFriendlyScene(game, friendlyName, data) {
      if (this._destroyed || !game?.scene || game.pendingDestroy || !validSceneKey(friendlyName)) return false;
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
      if (!sp.keys || !Object.prototype.hasOwnProperty.call(sp.keys, key)) {
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
      if (this._destroyed || !validSceneKey(firstFriendlyName)) return false;
      this._controller.abort(); this._controller = new AbortController();
      const signal = this._controller.signal;
      try {
        for (let i = 0; i <= DEFAULTS.registrarRetryCount; i++) {
          if (this._destroyed || signal.aborted || !game?.scene || game.pendingDestroy) return false;
          await this.registerFromGlobals(game);
          if (signal.aborted || this._destroyed) return false;
          if (this.startFriendlyScene(game, firstFriendlyName, data)) return true;
          if (i < DEFAULTS.registrarRetryCount) await this.errorRecovery._backoff(1, signal);
        }
      } catch (e) { safeLog('Scene registration cancelled or unavailable'); }
      return false;
    }
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true; this._controller.abort(); this.errorRecovery.destroy(); this.mapping.clear(); this.registered = false;
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
      this.opt  = safeOptions(DEFAULTS, opts);

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
      this._cameraClamps = new Set();
      this._cameraClampByScene = new WeakMap();
      this._initialized       = false;
      this._destroyed         = false;
      this._lastFrameTime     = 0;
      this._frameTimeHistory  = [];
      this._onPreStep         = null;
      this._onPostStep        = null;
      this._memoryInterval    = null;
      this._onGameDestroy = () => this.destroy();
      if (game && game.events && game.events.once) game.events.once('destroy', this._onGameDestroy);

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
      // Este handler ya NO cambia el tamaño del juego (lo hace app.js). Solo
      // reaplica los ajustes de nitidez, que es lo que se pierde cuando el
      // navegador recrea el back-buffer del lienzo al redimensionar.
      //
      // FIX: antes había un segundo disparo a 350 ms "para DevTools" que, al
      // redimensionar el juego, provocaba un segundo salto de tamaño visible.
      // Sin redimensionado ese disparo extra no aporta nada, así que se
      // sustituye por un simple debounce: un solo pase cuando el navegador ya
      // terminó de mover las medidas.
      const doResize = () => {
        if (this._destroyed) return;
        try {
          AdvancedPixelScaler.applyPixelPerfect(this.game, {
            pixelArt: this.opt.pixelArt, roundPixels: this.opt.roundPixels,
            preserveTextRendering: this.opt.preserveTextRendering
          });
          if (this.game && this.game.events) this.game.events.emit('perfResize');
        } catch (e) { if (DEBUG_MODE) console.warn('Resize handler error:', e); }
      };

      const handler = debounce(doResize, 160);

      if (typeof global !== 'undefined') {
        global.addEventListener('resize',            handler, { passive: true });
        global.addEventListener('orientationchange', handler, { passive: true });
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

    /**
     * Suelta los subsistemas atados a la escena anterior. Se usa al reinicializar
     * en una escena nueva y desde destroy().
     */
    _releaseSceneSubsystems() {
      ['chunkManager', 'pool', 'layerCache', 'cull', 'particles', 'textureCache'].forEach(k => {
        const sub = this[k];
        if (!sub) return;
        try { if (typeof sub.destroy === 'function') sub.destroy(); } catch (e) {}
        this[k] = null;
      });
    }

    _startPerformanceMonitoring() {
      if (!this.game || !this.game.events) {
        if (DEBUG_MODE) console.warn('Performance monitoring: game events no disponibles');
        return;
      }

      // FIX: sin esto, cada init() añadía OTRO par de callbacks 'prestep' /
      // 'poststep' que se ejecutan en cada frame. Tras varias entradas a la
      // tienda había N mediciones por frame haciendo el mismo trabajo.
      if (this._onPreStep)  { try { this.game.events.off('prestep',  this._onPreStep);  } catch (e) {} }
      if (this._onPostStep) { try { this.game.events.off('poststep', this._onPostStep); } catch (e) {} }
      if (this._memoryInterval) { clearInterval(this._memoryInterval); this._memoryInterval = null; }

      this._onPreStep = () => {
        this.performanceMonitor.startFrame();
        this._lastFrameTime = performance.now();
      };

      this._onPostStep = () => {
        this.performanceMonitor.endFrame();
        const ft = performance.now() - this._lastFrameTime;
        this._frameTimeHistory.push(ft);
        if (this._frameTimeHistory.length > 120) this._frameTimeHistory.shift();
        this.adaptivePerformance.recordFrameMetrics(this.game?.loop?.delta || this.performanceMonitor._frameInterval || ft);
        this.statsData.frameCount++;
      };

      this.game.events.on('prestep',  this._onPreStep);
      this.game.events.on('poststep', this._onPostStep);

      // MEDICIÓN DE MEMORIA: solo en depuración, y cada 5 s.
      //
      // Antes esto corría SIEMPRE y una vez por segundo, también en producción y
      // también en el móvil. Es un temporizador que no se apaga nunca: despierta
      // el procesador 3.600 veces por hora para apuntar un dato que en
      // producción no lee nadie (los informes solo se piden desde el panel de
      // depuración). En un teléfono, impedir que el procesador entre en reposo
      // es de las cosas que más batería gastan en un juego que, además, ya está
      // dibujando. Con DEBUG_MODE apagado ahora no se crea el temporizador.
      if (DEBUG_MODE && performance && performance.memory) {
        this._memoryInterval = setInterval(() => this.performanceMonitor.recordMemoryUsage(), 5000);
      }
    }

    // ── API PÚBLICA ───────────────────────────────────────────────────────

    init(scene, options = {}) {
      if (this._destroyed) throw new Error('PhaserRPGPerf ha sido destruido y no puede ser reinicializado');
      this.performanceMonitor.start('init');
      this.scene = scene || this.scene;
      if (!this.scene) throw new Error('PhaserRPGPerf.init requiere una Phaser.Scene');

      this.opt = safeOptions(this.opt, options);
      this.eventManager.setScene(this.scene);
      this._detachSceneLifecycle();
      const managedScene = this.scene;
      const sceneEvents = managedScene.events;
      this._onSceneShutdown = () => {
        if (this.scene !== managedScene) return;
        this._detachSceneLifecycle();
        this._releaseSceneSubsystems();
        this.eventManager.setScene(null);
        this.scene = null;
        this._chunkProvider = null;
        this._initialized = false;
      };
      if (sceneEvents && sceneEvents.once) {
        this._sceneLifecycleEmitter = sceneEvents;
        sceneEvents.once('shutdown', this._onSceneShutdown);
        sceneEvents.once('destroy', this._onSceneShutdown);
      }

      // FIX: init() se llama una vez por escena (GameScene, tiendajuego, y otra
      // vez cada vez que se vuelve a entrar). Antes se creaban subsistemas
      // nuevos encima de los viejos sin destruirlos: los antiguos seguían
      // apuntando a la escena ya muerta (pools, cachés de textura y emitters
      // huérfanos = fuga de memoria). Ahora se sueltan los de la escena
      // anterior antes de montar los de la nueva.
      this._releaseSceneSubsystems();

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

    _detachSceneLifecycle() {
      if (this._sceneLifecycleEmitter) {
        this._sceneLifecycleEmitter.off('shutdown', this._onSceneShutdown);
        this._sceneLifecycleEmitter.off('destroy', this._onSceneShutdown);
      }
      this._sceneLifecycleEmitter = null;
      this._onSceneShutdown = null;
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
      if (this.chunkManager) this.chunkManager.destroy();
      this.chunkManager = new DynamicChunkManager(this.scene, map, safeOptions(this.opt, options));
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
    cacheTexture(key, texture, options = {})   { if (!this._initialized || !this.textureCache) return false; return this.textureCache.addTexture(key, texture, options); }
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
      const cam = scene?.cameras?.main, events = scene?.sys?.events || scene?.events;
      if (this._destroyed || !cam || !events || !bounds || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) || bounds.width <= 0 || bounds.height <= 0) return () => {};
      this._cameraClampByScene.get(scene)?.();
      cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
      scene.physics?.world?.setBounds(bounds.x, bounds.y, bounds.width, bounds.height, true, true, true, true);
      const minZoom = finiteNumber(opts.minZoom, 0.5, 0.05, 16), maxZoom = finiteNumber(opts.maxZoom, 2, minZoom, 16);
      const update = () => {
        if (this._destroyed) return;
        const zoom = finiteNumber(cam.zoom, 1, minZoom, maxZoom);
        if (zoom !== cam.zoom) cam.setZoom(zoom);
        // Native camera clamps account for zoom and origin offsets correctly.
        const x = cam.clampX(cam.scrollX), y = cam.clampY(cam.scrollY);
        if (opts.smooth !== false) { cam.scrollX += (x - cam.scrollX) * 0.1; cam.scrollY += (y - cam.scrollY) * 0.1; }
        else cam.setScroll(x, y);
      };
      let detached = false;
      const detach = () => {
        if (detached) return; detached = true;
        events.off('update', update); events.off('shutdown', detach); events.off('destroy', detach);
        this._cameraClamps.delete(detach); this._cameraClampByScene.delete(scene);
      };
      events.on('update', update); events.once('shutdown', detach); events.once('destroy', detach);
      this._cameraClamps.add(detach); this._cameraClampByScene.set(scene, detach);
      return detach;
    }

    // Settings (vault)
    async saveSettings(settings)      { return await this.vault.set('game_settings', settings, { persist: true, allowPlaintext: true }); }
    async loadSettings() { const settings = await this.vault.get('game_settings', { persist: true, allowPlaintext: true }); return settings && typeof settings === 'object' && !Array.isArray(settings) ? safeOptions({}, settings) : {}; }
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
      this._destroyed = true;
      safeLog('PhaserRPGPerf destroy iniciado');

      if (this._autoScanInterval) clearInterval(this._autoScanInterval);
      if (this._resizeHandler && typeof global !== 'undefined') {
        if (this._resizeHandler.cancel) this._resizeHandler.cancel();
        global.removeEventListener('resize',            this._resizeHandler);
        global.removeEventListener('orientationchange', this._resizeHandler);
      }
      if (this.game && this.game.events) {
        this.game.events.off('destroy', this._onGameDestroy);
        if (this._onPreStep)  this.game.events.off('prestep',  this._onPreStep);
        if (this._onPostStep) this.game.events.off('poststep', this._onPostStep);
      }
      if (this._memoryInterval) clearInterval(this._memoryInterval);

      try { if (this.eventManager)   this.eventManager.destroy();   } catch (e) {}
      try { if (this.performanceMonitor) this.performanceMonitor.destroy(); } catch (e) {}

      for (const detach of [...this._cameraClamps]) detach();
      this._registrar.destroy(); this.vault.destroy(); this.errorRecovery.destroy(); this.problemDetector.clear();
      this._releaseSceneSubsystems();
      this._detachSceneLifecycle();
      this._initialized = false;
      this._autoScanInterval = this._memoryInterval = null;
      this._chunkProvider = this.scene = this.game = null;
      if (this.adaptivePerformance) this.adaptivePerformance.game = null;
      this._frameTimeHistory.length = 0;
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
  // ── UNA SOLA INSTANCIA POR JUEGO ──────────────────────────────────────────
  //
  // FIX FUGA + THRASHING DE RESIZE:
  //   `PhaserRPGPerf.create()` se llama desde app.js Y desde GameScene.create()
  //   Y desde tiendajuego.create(). Como las escenas se recrean cada vez que se
  //   entra/sale de la tienda, cada visita creaba una instancia NUEVA, y cada
  //   instancia registra sus propios listeners globales de 'resize' y
  //   'orientationchange' (ninguna escena llama a perf.destroy()).
  //   Resultado: tras unas cuantas idas y venidas había N sistemas de
  //   rendimiento vivos a la vez, N handlers de resize, N intervalos de
  //   memoria y N monitores de frame — con la CPU y la RAM que eso cuesta en
  //   un teléfono.
  //
  //   Ahora `create()` devuelve la instancia que ya existe para ese juego (y le
  //   aplica las opciones nuevas). `init(scene)` sigue funcionando igual, así
  //   que cada escena la reengancha a sí misma como siempre. Si la instancia
  //   fue destruida, se crea una limpia.
  const _perfByGame = new global.WeakMap();

  function createPerf(game, opts) {
    if (!game) return new PhaserRPGPerf(game, opts);

    const existing = _perfByGame.get(game);
    if (existing && !existing._destroyed) {
      if (opts) existing.opt = safeOptions(existing.opt, opts);
      safeLog('PhaserRPGPerf: reutilizando instancia existente para este juego');
      return existing;
    }

    const inst = new PhaserRPGPerf(game, opts);
    _perfByGame.set(game, inst);
    return inst;
  }

  try {
    Object.defineProperty(global, 'PhaserRPGPerf', {
      value: {
        create:  (game, opts) => createPerf(game, opts),
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
