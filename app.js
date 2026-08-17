/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * GRASSLAND FOREST v13
 * Desarrollado y Publicado por: Jean Larreal
 * Para permisos y contacto, ver documentación interna del proyecto.
 *
 * VERSIÓN: v13.0.0-release
 * ============================================================================
 *
 * ARQUITECTURA DE SEGURIDAD — PRINCIPIOS BASE:
 *
 *  1. No romper el motor. Phaser necesita Object.keys, Function, eval,
 *     EventTarget y window.sys intactos. Ninguna de esas cosas se toca.
 *
 *  2. No seguridad falsa. btoa() no es cifrado. Ocultar nombres con Base64
 *     da una falsa sensación de protección y rompe el registro de escenas.
 *     Las escenas se registran en Phaser con su nombre original.
 *
 *  3. Configuración coherente. ENV_MODE, SECURITY_ENABLED y DEBUG_MODE
 *     tienen un único valor fuente de verdad; no se repiten con valores
 *     contradictorios en distintos archivos.
 *
 *  4. Superficie mínima. Solo se expone en window lo estrictamente necesario,
 *     y siempre como no-enumerable para que no aparezca en exploraciones.
 *
 *  5. Limpieza real. Los rastros de desarrollo se limpian en producción
 *     sin tocar propiedades que Phaser o sus plugins necesiten.
 * ============================================================================
 */

(function (root) {
  'use strict';

  // ── GUARD: solo ejecutar una vez ──────────────────────────────────────────
  if (root.__GF_BOOT_DONE__) return;

  // ── GUARD: Phaser debe estar cargado ──────────────────────────────────────
  //
  //  ADVANCED_CONFIG (más abajo) referencia Phaser.AUTO, Phaser.Scale.*, etc.
  //  en tiempo de evaluación del módulo. Si el CDN de Phaser no cargó (bloqueo
  //  de red, CSP, offline), esas referencias lanzarían un ReferenceError
  //  críptico y el IIFE abortaría antes de exponer startGame, dejando la
  //  pantalla en negro sin ninguna pista del motivo. Verificamos primero y
  //  fallamos con un mensaje claro sin marcar __GF_BOOT_DONE__ (así un
  //  reintento posterior, si Phaser llega tarde, aún es posible).
  if (typeof root.Phaser === 'undefined' || !root.Phaser) {
    try {
      (console.error || console.log).call(
        console,
        '[GF] Phaser no está disponible. El juego no puede arrancar. ' +
        'Verifica que el <script> de Phaser cargó antes que app.js ' +
        '(revisa la consola de red por bloqueos de CDN/CSP).'
      );
    } catch (e) {}
    return;
  }
  var Phaser = root.Phaser;

  // ── POLYFILLS DE COLECCIONES ──────────────────────────────────────────────
  // Se instalan únicamente si el navegador carece de ellos.
  // No se tocan Map/Set/WeakMap nativos si ya existen.
  (function ensureCollections() {
    if (typeof root.Map !== 'undefined') return; // Nativo — no tocar

    root.Map = function GFMap() {
      this._k = [];
      this._v = [];
      this.size = 0;
    };
    var Mp = root.Map.prototype;
    Mp.set = function (k, v) {
      var i = this._k.indexOf(k);
      if (i === -1) { this._k.push(k); this._v.push(v); this.size++; }
      else this._v[i] = v;
      return this;
    };
    Mp.get  = function (k) { var i = this._k.indexOf(k); return i < 0 ? undefined : this._v[i]; };
    Mp.has  = function (k) { return this._k.indexOf(k) !== -1; };
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
    Mp[Symbol && Symbol.iterator ? Symbol.iterator : '@@iterator'] = function () {
      var entries = this._k.map(function (k, i) { return [k, this._v[i]]; }, this);
      var idx = 0;
      return { next: function () {
        return idx < entries.length
          ? { value: entries[idx++], done: false }
          : { value: undefined,     done: true  };
      }};
    };
  })();

  (function ensureSet() {
    if (typeof root.Set !== 'undefined') return;
    root.Set = function GFSet() { this._v = []; this.size = 0; };
    var Sp = root.Set.prototype;
    Sp.add    = function (v) { if (this._v.indexOf(v) < 0) { this._v.push(v); this.size++; } return this; };
    Sp.has    = function (v) { return this._v.indexOf(v) !== -1; };
    Sp.delete = function (v) {
      var i = this._v.indexOf(v);
      if (i < 0) return false;
      this._v.splice(i, 1); this.size--;
      return true;
    };
    Sp.clear   = function () { this._v = []; this.size = 0; };
    Sp.forEach = function (cb, ctx) {
      for (var i = 0; i < this._v.length; i++) cb.call(ctx, this._v[i], this._v[i], this);
    };
  })();

  (function ensureWeakMap() {
    if (typeof root.WeakMap !== 'undefined') return;
    root.WeakMap = function GFWeakMap() {
      this._id = '__gf_wm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    };
    var Wp = root.WeakMap.prototype;
    Wp.set = function (k, v) {
      if (k === null || (typeof k !== 'object' && typeof k !== 'function'))
        throw new TypeError('WeakMap key must be an object');
      Object.defineProperty(k, this._id, { value: v, writable: true, configurable: true });
      return this;
    };
    Wp.get    = function (k) { return k && k[this._id]; };
    Wp.has    = function (k) { return k != null && this._id in Object(k); };
    Wp.delete = function (k) {
      if (!this.has(k)) return false;
      delete k[this._id];
      return true;
    };
  })();

  // ── CONFIGURACIÓN CENTRAL ─────────────────────────────────────────────────
  //
  //   ENV_MODE      → 0 = desarrollo | 1 = producción
  //   SECURITY_ENABLED → activa capas de protección de datos internos
  //   DEBUG_MODE    → habilita logs y overlay de depuración
  //
  //   Para producción: ENV_MODE = 1, SECURITY_ENABLED = true, DEBUG_MODE = false
  //   Para desarrollo: ENV_MODE = 0, SECURITY_ENABLED = true, DEBUG_MODE = true/false
  //
  var ENV_MODE         = 1;     // ← cambiar a 1 antes del deploy en producción
  var SECURITY_ENABLED = true;  // siempre true
  var DEBUG_MODE       = false; // false en producción, true en desarrollo activo

  // FIX: se expone ENV_MODE de forma no-enumerable para que otros módulos
  // del ecosistema (phaser-rpg-perf.js) lean el MISMO valor en vez de tener
  // su propia copia hardcodeada. Antes phaser-rpg-perf.js tenía ENV_MODE=0
  // (desarrollo) mientras este archivo tenía 1 (producción) — eso rompía,
  // entre otras cosas, la redacción de detalles internos en producción de
  // ProblemDetector.getReport(). Con esto ya no se pueden desincronizar.
  try {
    Object.defineProperty(root, '__GF_ENV_MODE__', {
      value: ENV_MODE, writable: false, configurable: false, enumerable: false
    });
  } catch (e) {}

  // ── DEFINICIÓN DE ERROR PROPIO ────────────────────────────────────────────
  function SecurityError(msg) {
    var e = new Error(msg);
    e.name = 'SecurityError';
    if (Error.captureStackTrace) Error.captureStackTrace(e, SecurityError);
    return e;
  }
  SecurityError.prototype = Object.create(Error.prototype);

  // ── LOGGER SEGURO ─────────────────────────────────────────────────────────
  //
  //  Solo escribe en consola cuando ENV_MODE = 0 o DEBUG_MODE = true.
  //  En producción (ENV_MODE=1, DEBUG_MODE=false) los logs se silencian
  //  sin tocar console globalmente — Phaser y plugins siguen logeando normal.
  //  Los errores críticos siempre se muestran para no ocultar fallas reales.
  //
  var _nativeConsole = {
    log:      (console && typeof console.log   === 'function') ? console.log.bind(console)   : function () {},
    warn:     (console && typeof console.warn  === 'function') ? console.warn.bind(console)  : function () {},
    error:    (console && typeof console.error === 'function') ? console.error.bind(console) : function () {},
    info:     (console && typeof console.info  === 'function') ? console.info.bind(console)  : function () {}
  };

  var Logger = {
    _enabled: ENV_MODE === 0 || DEBUG_MODE,
    _prefix:  '[GF]',

    log: function () {
      if (!this._enabled) return;
      var args = Array.prototype.slice.call(arguments);
      try { _nativeConsole.log.apply(null, [this._prefix].concat(args)); } catch (e) {}
    },
    warn: function () {
      if (!this._enabled) return;
      var args = Array.prototype.slice.call(arguments);
      try { _nativeConsole.warn.apply(null, [this._prefix].concat(args)); } catch (e) {}
    },
    error: function () {
      // Los errores siempre se muestran para no silenciar fallos reales.
      var args = Array.prototype.slice.call(arguments);
      try { _nativeConsole.error.apply(null, [this._prefix].concat(args)); } catch (e) {}
    },
    perf: function () {
      if (!this._enabled || !PERF_OPTIONS.debug) return;
      var args = Array.prototype.slice.call(arguments);
      try { _nativeConsole.log.apply(null, ['[PERF]'].concat(args)); } catch (e) {}
    }
  };

  // ── SISTEMA DE AISLAMIENTO ────────────────────────────────────────────────
  //
  //  Responsabilidades:
  //   · Guardar la instancia de Phaser.Game fuera del scope global.
  //   · Proveer una referencia segura para uso interno (resize, overlay, etc.).
  //   · NO bloquear ninguna propiedad que Phaser o WebGL necesiten.
  //
  //  Lo que NO hace este sistema (a propósito):
  //   · NO sobreescribe Object.keys/values/entries — Phaser los usa internamente.
  //   · NO bloquea window.Function ni window.eval — WebGL los necesita.
  //   · NO congela EventTarget.prototype — Phaser registra sus propios listeners.
  //   · NO usa btoa() como "cifrado" — es solo Base64, reversible en 1 línea.
  //
  var IsolationSystem = (function () {
    var _gameRef   = null;  // referencia a Phaser.Game, privada al closure
    var _locked    = false;
    var _sceneMap  = new root.Map(); // nombre amigable → clase de escena (solo para tracking)

    return {
      init: function () {
        if (_locked) return;

        // Bloquear solo nombres de eventos que son 100% internos de nuestro sistema.
        // Nunca tocar EventTarget.prototype globalmente.
        this._guardInternalEvents();

        // Asegurar window.sys disponible (Phaser Scene Systems lo usa).
        this._ensureSys();

        _locked = true;
        Logger.log('Aislamiento inicializado');
      },

      _guardInternalEvents: function () {
        // Solo interceptamos eventos con prefijos internos propios.
        // window.addEventListener sigue funcionando normal para todo lo demás.
        var _orig = root.addEventListener;
        var _blocked = ['_gf_internal_', '_gf_vault_'];
        try {
          root.addEventListener = function (type, listener, opts) {
            if (typeof type === 'string') {
              var t = type.toLowerCase();
              for (var i = 0; i < _blocked.length; i++) {
                if (t.indexOf(_blocked[i]) === 0) return; // silenciosamente ignorado
              }
            }
            return _orig.call(this, type, listener, opts);
          };
        } catch (e) { /* si el navegador no permite la redefinición, continuar */ }
      },

      _ensureSys: function () {
        // window.sys es requerido por Phaser internamente.
        // Si no existe, lo creamos vacío y configurable para que Phaser lo use.
        try {
          if (!root.sys) root.sys = {};
        } catch (e) {}
      },

      registerGame: function (gameInstance) {
        _gameRef = gameInstance;
        Logger.log('Instancia de juego registrada');
      },

      getGame: function () {
        // Retorna la instancia directamente — es para uso interno del propio sistema.
        return _gameRef;
      },

      registerSceneClass: function (friendlyName, cls) {
        _sceneMap.set(friendlyName, cls);
      },

      getSceneClass: function (friendlyName) {
        return _sceneMap.get(friendlyName);
      },

      destroy: function () {
        _gameRef = null;
        _sceneMap.clear();
        _locked = false;
        Logger.log('Sistema de aislamiento destruido');
      }
    };
  })();

  // ── SISTEMA DE SEGURIDAD ──────────────────────────────────────────────────
  //
  //  Protecciones aplicadas:
  //   · Bloquear propiedades de namespace interno (_gf_*) en window.
  //   · Limpiar variables de desarrollo del scope global en producción.
  //   · Control de acceso al modo debug con expiración automática.
  //
  //  Protecciones deliberadamente NO aplicadas (romperían Phaser):
  //   · Object.keys/values/entries → Phaser itera game.scene.keys con ellos.
  //   · window.Function → compilación de shaders WebGL.
  //   · window.eval → algunos renderers Phaser lo usan en fallback.
  //   · EventTarget.prototype → Phaser registra listeners de input/resize.
  //   · game.scene.keys (Proxy) → Phaser necesita acceso directo a este objeto.
  //   · console.log global → Phaser y plugins logean internamente.
  //
  var Security = (function () {
    var _debugMode   = DEBUG_MODE;
    var _initialized = false;
    var _debugTimer  = null;

    return {
      init: function () {
        if (_initialized) return;

        IsolationSystem.init();
        this._blockInternalWindowProps();
        if (ENV_MODE === 1) this._cleanDevTraces();

        _initialized = true;
        Logger.log('Seguridad inicializada — ENV:', ENV_MODE === 0 ? 'desarrollo' : 'producción');
      },

      // Bloquea propiedades que son exclusivamente internas del sistema GF.
      // Lista mínima: solo lo que nosotros creamos y no queremos que sea accesible.
      _blockInternalWindowProps: function () {
        var ours = ['_gf_internal', '_gf_vault', '_gf_crypto'];
        ours.forEach(function (prop) {
          try {
            if (Object.getOwnPropertyDescriptor(root, prop)) return; // ya existe, no tocar
            Object.defineProperty(root, prop, {
              value:        undefined,
              writable:     false,
              configurable: false,
              enumerable:   false
            });
          } catch (e) {}
        });
      },

      // En producción, elimina variables de debug que nosotros creamos.
      // Lista conservadora: NO incluir 'scene', 'game', 'sys', 'phaser',
      // porque Phaser y plugins pueden exponer globales con esos nombres legítimamente.
      _cleanDevTraces: function () {
        var devOnly = [
          'enableDebug', 'disableDebug',
          'getSecureSceneInfo', 'findSecureScene',
          'isSceneSecurelyRegistered', 'showSceneRegistry',
          'SecureSceneRegistry', '_DEBUG_MODE'
        ];
        devOnly.forEach(function (prop) {
          try {
            if (root[prop] !== undefined) {
              Object.defineProperty(root, prop, {
                get: function () { return undefined; },
                configurable: false,
                enumerable:   false
              });
            }
          } catch (e) {}
        });
        Logger.log('Trazas de desarrollo limpiadas');
      },

      // ── Registro seguro de escenas en Phaser ─────────────────────────────
      //
      //  Phaser necesita que la clave usada en game.scene.add() sea la MISMA
      //  que se usa en game.scene.start(). Por eso registramos con el nombre
      //  amigable directamente — no hay "cifrado" de claves.
      //
      //  El tracking interno (IsolationSystem._sceneMap) existe solo para
      //  poder hacer get/has de clases sin tocar el scope global.
      //
      registerScene: function (game, friendlyName, SceneClass) {
        if (!game || !game.scene) return false;
        if (typeof SceneClass !== 'function') {
          Logger.warn('registerScene: clase inválida para', friendlyName);
          return false;
        }

        // Evitar registro duplicado en Phaser
        if (game.scene.keys && game.scene.keys[friendlyName]) {
          Logger.log('Escena ya registrada en Phaser:', friendlyName);
          IsolationSystem.registerSceneClass(friendlyName, SceneClass);
          return true;
        }

        try {
          game.scene.add(friendlyName, SceneClass, false);
          IsolationSystem.registerSceneClass(friendlyName, SceneClass);
          Logger.log('Escena registrada:', friendlyName);
          return true;
        } catch (e) {
          Logger.error('Error registrando escena:', friendlyName, e.message);
          return false;
        }
      },

      // ── Control de debug ──────────────────────────────────────────────────
      //
      //  Solo disponible en entorno de desarrollo (ENV_MODE = 0).
      //  Se desactiva automáticamente a los 30 segundos.
      //
      enableDebug: function () {
        if (ENV_MODE !== 0) {
          Logger.warn('Debug mode no disponible en producción');
          return false;
        }
        _debugMode = true;
        Logger.log('Debug mode activado — expira en 30 s');
        if (_debugTimer) clearTimeout(_debugTimer);
        _debugTimer = setTimeout(function () {
          Security.disableDebug();
        }, 30000);
        return true;
      },

      disableDebug: function () {
        _debugMode = false;
        if (_debugTimer) { clearTimeout(_debugTimer); _debugTimer = null; }
        Logger.log('Debug mode desactivado');
        return true;
      },

      isDebug: function () { return _debugMode; }
    };
  })();

  // ── CONFIGURACIÓN AVANZADA DE PHASER ─────────────────────────────────────
  // Resolución interna con la que ARRANCA el juego.
  // FIX PARPADEO DE ZOOM AL ARRANCAR: antes se creaba con el tamaño en píxeles
  // CSS y, milisegundos después, el sistema de rendimiento lo reescalaba a
  // píxeles físicos (×2 o ×3 en un teléfono). Ese salto se veía como un tirón
  // de zoom durante la carga. Naciendo ya con la resolución definitiva no hay
  // salto. El factor es el mismo que usa el gestor de resize (ver _gameSize).
  var BOOT_DPR = Math.max(1, Math.min(
    Math.floor(Math.max(1, root.devicePixelRatio || 1)),
    Math.max(1, root.GF_MAX_DPR || Infinity)
  ));

  var ADVANCED_CONFIG = {
    parent:          'container',
    width:           Math.max(320, root.innerWidth)  * BOOT_DPR,
    height:          Math.max(240, root.innerHeight) * BOOT_DPR,
    // FIX CRÍTICO: Phaser.WEBGL forzaba WebGL SIN fallback. Si el navegador
    // no podía crear el contexto (GPU en lista negra, límite de contextos
    // WebGL de la pestaña alcanzado, aceleración por hardware desactivada,
    // perfil de Chrome dañado, etc.) Phaser.Game lanzaba
    // "Cannot create WebGL context, aborting" y el juego jamás arrancaba.
    // Phaser.AUTO intenta WebGL primero y cae a Canvas 2D automáticamente
    // si no está disponible (createGame() además agrega un reintento
    // explícito a Canvas como red de seguridad adicional).
    type:            Phaser.AUTO,
    pixelArt:        true,
    roundPixels:     true,
    backgroundColor: '#000000',
    powerPreference: 'high-performance',
    antialias:       false,
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer:        false,
    antialiasGL:     false,
    autoFocus:       true,

    physics: {
      default: 'arcade',
      arcade:  {
        gravity:    { y: 0 },
        debug:      DEBUG_MODE,
        fps:        60,
        timeScale:  1,
        fixedStep:  true
      }
    },

    // NOTA: los plugins NO se declaran aquí de forma estática. Antes se pasaba
    // `plugin: root.rexvirtualjoystickplugin` en tiempo de carga; si el CDN del
    // plugin no había cargado, Phaser recibía `plugin: undefined` y registraba
    // warnings "Invalid Plugin" en cada arranque. Ahora se inyectan en
    // createGame() solo cuando el plugin existe de verdad (ver más abajo).

    fps: { target: 60, forceSetTimeOut: false },

    scale: {
      mode:       Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },

    render: {
      pixelArt:             true,
      antialias:            false,
      roundPixels:          true,
      powerPreference:      'high-performance',
      antialiasGL:          false,
      preserveDrawingBuffer:false,
      mipmapFilter:         'NEAREST',
      minFilter:            'NEAREST',
      magFilter:            'NEAREST',
      clearBeforeRender:    true
    },

    input: {
      activePointers: 3,
      touch:          { capture: true }
    }
  };

  // ── OPCIONES DE PERFORMANCE ───────────────────────────────────────────────
  var PERF_OPTIONS = {
    debug:               DEBUG_MODE,
    logPerformance:      false,
    performanceSampleRate: 2000,

    chunkSizeTiles:      16,
    chunkRadius:         2,
    // FIX PARPADEO: 48px era MUY justo. El culling ocultaba/mostraba objetos
    // (casas, árboles, imágenes) justo en el borde de la pantalla y, como la
    // cámara sigue al jugador con lerp (oscila fracciones de píxel), un mismo
    // objeto se apagaba y encendía en frames consecutivos → parpadeo visible.
    // Con un margen amplio el objeto ya está dibujado mucho antes de entrar en
    // cuadro y solo se oculta bien lejos, sin pop-in.
    cullPadding:         512,
    defaultPoolSize:     100,
    maxRenderTextureSize:4096,

    pixelArt:            true,
    roundPixels:         true,
    antialias:           false,
    preserveResolution:  true,
    highPerformance:     true,
    antiFlicker:         true,

    adaptiveEnabled:     true,
    maxFrameTime:        33,
    minFrameTime:        16,

    textureCacheSizeMB:  100,
    enableSmartCaching:  true,

    registrarRetryMs:    100,
    registrarRetryCount: 20,

    joystickConfig: {
      x:        100,
      y:        300,
      radius:   50,
      base:     null,
      thumb:    null,
      forceMin: 16,
      enable:   true,
      dir:      '8dir',
      fixed:    true
    }
  };

  // Nombre de la primera escena que debe arrancar
  var BOOT_FIRST_SCENE = 'LoadingScenegame';

  // ── UTILIDADES ────────────────────────────────────────────────────────────
  var Utils = {
    isFunction: function (v) { return typeof v === 'function'; },
    isObject:   function (v) { return v && typeof v === 'object' && !Array.isArray(v); },

    throttle: function (fn, limit) {
      var inThrottle;
      return function () {
        var args = arguments;
        var ctx  = this;
        if (!inThrottle) {
          fn.apply(ctx, args);
          inThrottle = true;
          setTimeout(function () { inThrottle = false; }, limit);
        }
      };
    },

    debounce: function (fn, wait) {
      var timer;
      return function () {
        var args = arguments;
        var ctx  = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    },

    isMobile: function () {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);
    },

    isLowEnd: function () {
      return (navigator.hardwareConcurrency || 4) <= 4 ||
             (navigator.deviceMemory       || 4) <= 4;
    },

    createMobileJoystick: function (scene) {
      if (!scene.joystick || !Utils.isFunction(scene.joystick.add)) {
        Logger.warn('Joystick plugin no disponible en la escena');
        return null;
      }
      try {
        var cfg  = PERF_OPTIONS.joystickConfig;
        var base  = scene.add.circle(0, 0, cfg.radius,       0x888888, 0.5);
        var thumb = scene.add.circle(0, 0, cfg.radius * 0.5, 0xCCCCCC, 0.8);

        var joystick = scene.joystick.add(scene, {
          x: cfg.x, y: cfg.y, radius: cfg.radius,
          base: base, thumb: thumb,
          forceMin: cfg.forceMin, enable: cfg.enable,
          dir: cfg.dir, fixed: cfg.fixed
        });

        base.setDepth(1000).setScrollFactor(0);
        thumb.setDepth(1001).setScrollFactor(0);
        Logger.log('Joystick móvil creado');
        return joystick;
      } catch (e) {
        Logger.error('Error creando joystick:', e);
        return null;
      }
    }
  };

  // ── CONTROL DE REGISTRO DE ESCENAS ───────────────────────────────────────
  var _scenesRegistered  = false;
  var _registrationTries = 0;
  var MAX_REG_TRIES      = 2;

  function registerSceneClasses(game) {
    if (!game || !game.scene) {
      Logger.warn('registerSceneClasses: juego o plugin de escena no disponible');
      return false;
    }

    if (_scenesRegistered) {
      Logger.log('Escenas ya registradas, saltando');
      return true;
    }

    _registrationTries++;
    if (_registrationTries > MAX_REG_TRIES) {
      Logger.warn('Máximo de intentos de registro alcanzado');
      return false;
    }

    // ── Detección de escenas ──────────────────────────────────────────────
    //
    //  Prioridad 1: window.__secureSceneRegistry (llenado por register-scenes.js)
    //  Prioridad 2: búsqueda directa en window por nombre conocido (solo dev)
    //
    var scenes = [];
    var knownNames = ['LoadingScenegame', 'GameScene', 'tiendajuego', 'LoadingSceneshop', 'BattleScene'];

    // Fuente 1: registro seguro de register-scenes.js
    if (root.__secureSceneRegistry instanceof root.Map) {
      root.__secureSceneRegistry.forEach(function (cls, key) {
        if (Utils.isFunction(cls)) scenes.push({ key: key, cls: cls });
      });
    }

    // Fuente 2: fallback directo en window (útil si register-scenes.js no cargó)
    knownNames.forEach(function (name) {
      var alreadyFound = scenes.some(function (s) { return s.key === name; });
      if (!alreadyFound && Utils.isFunction(root[name])) {
        scenes.push({ key: name, cls: root[name] });
      }
    });

    if (scenes.length === 0) {
      Logger.warn('No se encontraron clases de escena para registrar');
      return false;
    }

    var registered = 0;
    var seen = {};

    scenes.forEach(function (scene) {
      if (seen[scene.key]) return;
      seen[scene.key] = true;

      var ok = Security.registerScene(game, scene.key, scene.cls);
      if (ok) registered++;
    });

    _scenesRegistered = true;
    Logger.log('Escenas registradas en esta pasada:', registered);
    return registered > 0;
  }

  // ── INICIO SEGURO DE ESCENA ───────────────────────────────────────────────
  //
  //  Busca la escena directamente por su nombre amigable (que ES la clave
  //  en Phaser). No hay traducción de claves cifradas → no hay bug de escena
  //  no encontrada.
  //
  function safeStartScene(game, sceneKey, data) {
    data = data || {};
    try {
      if (!game || !game.scene) {
        Logger.warn('safeStartScene: sin plugin de escena');
        return false;
      }

      if (!game.scene.keys || !game.scene.keys[sceneKey]) {
        Logger.warn('safeStartScene: escena no registrada en Phaser:', sceneKey);
        return false;
      }

      // Evitar arrancar una escena que ya está activa
      var active = game.scene.getScenes(true) || [];
      for (var i = 0; i < active.length; i++) {
        var s = active[i];
        if (s && s.sys && s.sys.settings && s.sys.settings.key === sceneKey) {
          Logger.log('Escena ya activa:', sceneKey);
          return true;
        }
      }

      game.scene.start(sceneKey, data);
      Logger.log('Escena iniciada:', sceneKey);
      return true;
    } catch (e) {
      Logger.error('safeStartScene error:', e);
      return false;
    }
  }

  // ── ESTILOS DE RENDIMIENTO ────────────────────────────────────────────────
  function injectPerformanceCSS() {
    if (document.getElementById('gf-perf-styles')) return; // idempotente

    var css = [
      // --app-height / --app-width los publica viewport-fix.js con la medida
      // REAL de la pantalla. En móvil `100vh` incluye la barra del navegador,
      // así que usarlo dejaba el lienzo más alto que lo visible. Las unidades
      // vh/vw quedan solo como respaldo para navegadores sin custom properties.
      'html,body,#container{',
        'width:100vw;width:var(--app-width,100vw);',
        'height:100vh;height:var(--app-height,100vh);',
        'margin:0;padding:0;overflow:hidden;',
        'background:#000;',
        'image-rendering:pixelated;image-rendering:crisp-edges;',
        '-webkit-font-smoothing:none;',
        'transform:translateZ(0);backface-visibility:hidden;',
        'touch-action:none;',
        '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;',
      '}',
      'body{',
        '-webkit-tap-highlight-color:transparent;',
        'overscroll-behavior:none;',
      '}',
      // El lienzo llena su CONTENEDOR, no el viewport: con 100vw/100vh el
      // lienzo se desbordaba del contenedor en móvil (barra del navegador).
      'canvas{',
        'display:block;width:100%!important;height:100%!important;',
        'image-rendering:pixelated;outline:none;touch-action:none;',
      '}',
      // `text-size-adjust:100%` en vez de `none`: `none` desactiva el ajuste
      // pero algunos WebKit lo interpretan como "puedes escalar el texto",
      // que es justo lo que se quiere evitar. 100% lo bloquea de verdad.
      '*{-webkit-text-size-adjust:100%;text-size-adjust:100%;box-sizing:border-box;}',
      '@media(max-width:768px){',
        'canvas{cursor:none;}',
        '.gf-joystick-area{',
          'position:fixed;left:0;bottom:0;width:50vw;height:40vh;',
          'z-index:1000;touch-action:none;',
        '}',
      '}',
      '.gf-debug-overlay{',
        'position:fixed;top:10px;right:10px;',
        'background:rgba(0,0,0,0.75);color:#00ff00;',
        'padding:10px;font-family:monospace;font-size:12px;',
        'z-index:9999;border:1px solid #00ff00;border-radius:5px;',
        'display:none;pointer-events:none;',
      '}',
      '.gf-debug-overlay.visible{display:block;}'
    ].join('');

    try {
      var style = document.createElement('style');
      style.id = 'gf-perf-styles';
      style.appendChild(document.createTextNode(css));
      document.head.insertBefore(style, document.head.firstChild);
      Logger.log('CSS de rendimiento inyectado');
    } catch (e) {
      Logger.error('Error inyectando CSS:', e);
    }
  }

  // ── SETUP DEL CONTENEDOR ──────────────────────────────────────────────────
  function setupContainer() {
    var container = document.getElementById('container');

    if (!container) {
      container = document.createElement('div');
      container.id = 'container';
      Object.assign(container.style, {
        width:       '100vw',
        height:      '100vh',
        overflow:    'hidden',
        position:    'relative',
        touchAction: 'none'
      });
      document.body.appendChild(container);
    }

    // Limpiar hijos previos (canvas obsoleto de hot-reload, etc.)
    while (container.firstChild) container.removeChild(container.firstChild);

    // Bloquear gestos de pinch/zoom sobre el contenedor del juego
    container.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    container.addEventListener('dragstart',   function (e) { e.preventDefault(); });
    container.addEventListener('touchstart',
      function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); },
      { passive: false }
    );
    container.addEventListener('touchmove',
      function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); },
      { passive: false }
    );

    return container;
  }

  // ── CREACIÓN DEL JUEGO ────────────────────────────────────────────────────
  function createGame() {
    var isMobile = Utils.isMobile();
    var isLowEnd = Utils.isLowEnd();

    if (isMobile || isLowEnd) {
      ADVANCED_CONFIG.render.powerPreference = 'low-power';
      PERF_OPTIONS.chunkRadius    = 1;
      PERF_OPTIONS.defaultPoolSize= 50;
      PERF_OPTIONS.textureCacheSizeMB = 50;
      PERF_OPTIONS.joystickConfig.x      = 80;
      PERF_OPTIONS.joystickConfig.y      = root.innerHeight - 100;
      PERF_OPTIONS.joystickConfig.radius = 40;
      Logger.log('Optimizando para dispositivo móvil / bajo rendimiento');
    }

    // Reutilizar instancia existente de phaserScaler si ya existe
    if (root.phaserScaler && root.phaserScaler.game) {
      Logger.log('Reutilizando phaserScaler.game existente');
      try {
        if (root.phaserScaler.container) {
          root.phaserScaler.container = setupContainer();
        }
      } catch (e) {}
      return root.phaserScaler.game;
    }

    if (!root.rexvirtualjoystickplugin) {
      Logger.warn('rexvirtualjoystickplugin no encontrado — joystick no funcionará');
    }

    var config = Object.assign({}, ADVANCED_CONFIG);

    // ── AHORRO DE BATERÍA: LÍMITE DE FOTOGRAMAS ───────────────────────────────
    // CAUSA RAÍZ DEL "EN EL TELÉFONO SE GASTA LA BATERÍA MUY RÁPIDO":
    //
    // El juego corría SIEMPRE a 60 fps, también en el móvil. Cada fotograma
    // significa: recorrer el bucle de update, recalcular colisiones, reordenar
    // profundidades, y —lo más caro— que la GPU vuelva a componer y pintar la
    // pantalla entera. En un teléfono, pasar de 60 a 30 fps recorta casi a la
    // mitad el trabajo de CPU y GPU, y con él el calor y el consumo. En un juego
    // de vista cenital con movimiento suave por interpolación, 30 fps se ven
    // perfectamente bien: no es un shooter.
    //
    // `fps.limit` es la forma correcta de hacerlo en Phaser 3.60+: sigue usando
    // requestAnimationFrame (que es lo que respeta el ritmo real de la pantalla
    // y se duerme solo en segundo plano) y simplemente SALTA los fotogramas
    // sobrantes. Nada que ver con forceSetTimeOut, que da un ritmo irregular.
    //
    // Se puede apagar en cualquier momento desde el juego (window.GFBateria) o
    // desde el panel de gráficos; la elección se recuerda en el navegador. Por
    // defecto se activa SOLO en móvil/equipos flojos: en un PC no hay motivo.
    var ahorroGuardado = null;
    try {
      var v = root.localStorage && root.localStorage.getItem('gf_ahorro_bateria');
      if (v === '1') ahorroGuardado = true;
      else if (v === '0') ahorroGuardado = false;
    } catch (e) { /* almacenamiento bloqueado: se usa el valor por defecto */ }

    var ahorroActivo = (ahorroGuardado !== null) ? ahorroGuardado : (isMobile || isLowEnd);

    config.fps = {
      target:          60,
      limit:           ahorroActivo ? 30 : 0,   // 0 = sin límite
      forceSetTimeOut: false,
      smoothStep:      true
    };
    root.GF_AHORRO_BATERIA = ahorroActivo;
    Logger.log('Ahorro de batería (límite de 30 fps): ' + (ahorroActivo ? 'ACTIVADO' : 'desactivado'));
    // FIX: copia propia (no superficial) de render. Object.assign es shallow,
    // así que sin esto config.render sería la MISMA referencia que
    // ADVANCED_CONFIG.render — cualquier ajuste posterior (p. ej. el
    // reintento a Canvas de abajo) mutaría el objeto compartido para
    // siempre y se filtraría a la próxima llamada a createGame().
    config.render = Object.assign({}, ADVANCED_CONFIG.render);
    if (isMobile) {
      config.input = { activePointers: 5, touch: { capture: true } };
    }

    // Registrar el plugin de joystick SOLO si cargó realmente. Así evitamos
    // pasar `plugin: undefined` a Phaser (que genera warnings "Invalid Plugin")
    // y damos un aviso claro si el juego corre sin control táctil en móvil.
    if (root.rexvirtualjoystickplugin) {
      config.plugins = {
        global: [{ key: 'rexVirtualJoystick', plugin: root.rexvirtualjoystickplugin, start: true }],
        scene:  [{ key: 'rexVirtualJoystick', plugin: root.rexvirtualjoystickplugin, mapping: 'joystick' }]
      };
    }

    // Primer intento: config.type ya es Phaser.AUTO (ver ADVANCED_CONFIG),
    // así que Phaser mismo cae a Canvas 2D si WebGL no está disponible.
    var game;
    try {
      game = new Phaser.Game(config);
    } catch (e) {
      Logger.error('Error crítico creando Phaser.Game:', e);

      var msg = (e && e.message) ? String(e.message).toLowerCase() : '';
      var esFalloWebGL = msg.indexOf('webgl') !== -1 && config.type !== Phaser.CANVAS;

      if (!esFalloWebGL) throw e;

      // FIX: red de seguridad adicional — con Phaser.AUTO esto casi nunca
      // debería ejecutarse, pero si el navegador aún así falla, forzamos
      // Canvas 2D explícitamente en vez de dejar morir el juego completo.
      try {
        Logger.warn('Reintentando creación del juego forzando Canvas 2D (sin aceleración WebGL)');
        var canvasConfig = Object.assign({}, config, { type: Phaser.CANVAS });
        game = new Phaser.Game(canvasConfig);
        Logger.warn('Phaser.Game creado en modo Canvas 2D (fallback)');
      } catch (e2) {
        Logger.error('Error crítico también con Canvas 2D — sin renderer disponible:', e2);
        throw e2;
      }
    }

    try {
      IsolationSystem.registerGame(game);

      // Referencia global al juego.
      // FIX: varios módulos ya la daban por hecha (CraftingHub.js usa
      // `window.game?.scene?.keys?.GameScene` en debugCraftingSystem,
      // updateCraftingLevel y getCraftingLevel) pero NADIE la publicaba, así
      // que esas funciones siempre fallaban en silencio. Ahora existe, y de
      // paso la usa el panel de gráficos para encontrar las escenas vivas.
      try { root.game = game; } catch (e) {}

      // DIAGNÓSTICO: qué renderer quedó activo de verdad. Usa _nativeConsole
      // directo (no Logger) para que se vea SIEMPRE, incluso en producción:
      // un fallback silencioso a Canvas 2D (mucho más lento, sin GPU) es
      // exactamente el tipo de cosa que hace falta poder ver sin tener que
      // activar debug primero.
      try {
        var _rendererName = 'desconocido';
        if (game.renderer) {
          if (game.renderer.type === Phaser.WEBGL) _rendererName = 'WebGL (acelerado por GPU)';
          else if (game.renderer.type === Phaser.CANVAS) _rendererName = 'Canvas 2D — SIN aceleración GPU, mucho más lento';
        }
        _nativeConsole.log('[GF] Renderer activo:', _rendererName);
      } catch (e) {}

      // Guardar config de joystick en el registry de Phaser
      if (root.rexvirtualjoystickplugin) {
        try { game.registry.set('joystickConfig', PERF_OPTIONS.joystickConfig); } catch (e) {}
      }

      // ── INTERRUPTOR DE AHORRO DE BATERÍA (en caliente) ─────────────────────
      // Permite pasar de 30 a 60 fps y viceversa SIN recargar la página, y
      // recuerda la elección para las siguientes sesiones. Se puede llamar
      // desde la consola del juego o engancharlo a un botón del panel de
      // gráficos:
      //     GFBateria.activar()      → 30 fps (menos consumo)
      //     GFBateria.desactivar()   → 60 fps
      //     GFBateria.estado()       → true / false
      //     GFBateria.fps()          → fotogramas por segundo reales
      root.GFBateria = {
        activar:    function () { return this.set(true); },
        desactivar: function () { return this.set(false); },
        estado:     function () { return !!root.GF_AHORRO_BATERIA; },
        fps:        function () {
          try { return Math.round(game.loop.actualFps); } catch (e) { return null; }
        },
        set: function (activar) {
          activar = !!activar;
          try {
            var bucle = game.loop;
            if (!bucle) return false;
            // Propiedades internas de TimeStep (estables desde Phaser 3.60).
            // Se tocan con cuidado: si esta versión no las tuviera, se avisa y
            // no se rompe nada — el juego sigue al ritmo que llevaba.
            if (typeof bucle._limitRate === 'undefined' &&
                typeof bucle.hasFpsLimit === 'undefined') {
              Logger.warn('Esta versión de Phaser no admite límite de fps en caliente');
              return false;
            }
            bucle.hasFpsLimit = activar;
            bucle._limitRate  = activar ? (1000 / 30) : 0;
            bucle._limitCount = 0;
            root.GF_AHORRO_BATERIA = activar;
            try { root.localStorage.setItem('gf_ahorro_bateria', activar ? '1' : '0'); } catch (e) {}
            Logger.log('Ahorro de batería: ' + (activar ? 'ACTIVADO (30 fps)' : 'desactivado (60 fps)'));
            return true;
          } catch (e) {
            Logger.warn('No se pudo cambiar el ahorro de batería:', e);
            return false;
          }
        }
      };

      // Eventos de ciclo de vida del juego
      game.events.on('ready', function () {
        Logger.log('Phaser.Game listo');
        setTimeout(function () {
          if (root.perf) {
            try {
              root.perf.applyPixelPerfect({
                pixelArt: true, roundPixels: true,
                crispScaling: true, integerScaling: true
              });
            } catch (e) {}
          }
        }, 100);
      });

      game.events.on('blur', function () {
        Logger.perf('Juego en segundo plano — reduciendo carga');
        if (root.perf) {
          try { root.perf.setQualityTier('low'); } catch (e) {}
          try { root.perf.stopAllEmitters(); }     catch (e) {}
        }
      });

      game.events.on('focus', function () {
        Logger.perf('Juego en primer plano — restaurando rendimiento');
        if (root.perf) {
          try { root.perf.enableAdaptivePerformance(true); } catch (e) {}
        }
      });

      Logger.log('Phaser.Game creado correctamente');
      return game;
    } catch (e) {
      Logger.error('Error crítico configurando Phaser.Game:', e);
      throw e;
    }
  }

  // ── INTEGRACIÓN CON PhaserRPGPerf ─────────────────────────────────────────
  function waitForPerf(timeoutMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function check() {
        if (root.PhaserRPGPerf) { resolve(true); return; }
        if (Date.now() - start > timeoutMs) { resolve(false); return; }
        setTimeout(check, 50);
      })();
    });
  }

  function integratePerfAndStart(game, firstScene) {
    return waitForPerf(5000).then(function (perfAvailable) {
      registerSceneClasses(game);

      if (!perfAvailable) {
        Logger.warn('PhaserRPGPerf no disponible — iniciando escena directamente');
        safeStartScene(game, firstScene);
        return null;
      }

      var perf;
      try {
        perf = root.PhaserRPGPerf.create(game, PERF_OPTIONS);
      } catch (e) {
        Logger.error('Error creando PhaserRPGPerf:', e);
        safeStartScene(game, firstScene);
        return null;
      }

      // Iniciar escena con un pequeño delay para que el registrar de perf termine
      setTimeout(function () {
        if (!safeStartScene(game, firstScene)) {
          Logger.warn('Primera escena no arrancó — reintentando en 500 ms');
          setTimeout(function () { safeStartScene(game, firstScene); }, 500);
        }
      }, 100);

      // Optimizaciones gráficas
      setTimeout(function () {
        try {
          if (perf.applyPixelPerfect) {
            perf.applyPixelPerfect({
              pixelArt: true, roundPixels: true,
              crispScaling: true, integerScaling: true
            });
          }
          if (perf.enableHighPerformance) perf.enableHighPerformance();
          Logger.log('Optimizaciones gráficas aplicadas');
        } catch (e) {
          Logger.warn('Error en optimizaciones gráficas:', e);
        }
      }, 200);

      return perf;
    });
  }

  // ── GESTOR DE RESIZE ──────────────────────────────────────────────────────
  //
  // ESTE ES EL ÚNICO SITIO DEL PROYECTO QUE CAMBIA EL TAMAÑO DEL JUEGO.
  //
  // FIX ZOOM EN MÓVIL: antes phaser-rpg-perf.js también llamaba a
  // `game.scale.resize()`, pero con el tamaño en píxeles FÍSICOS
  // (ancho × devicePixelRatio). En un teléfono con dpr 2 ó 3 los dos sistemas
  // pedían tamaños 2x/3x distintos en cada evento 'resize' y el mundo saltaba
  // hacia dentro y hacia fuera: eso era el "se da zoom" al abrir un panel, al
  // abrir el chat (el teclado dispara un resize) o al hacer clic (la barra del
  // navegador se esconde y dispara otro). Ese redimensionado se quitó de
  // phaser-rpg-perf.js; aquí manda uno solo.
  var resizeManager = {
    _last:    0,
    _throttle:100,
    _pending: false,
    _lastW:   0,
    _lastH:   0,

    /**
     * Tamaño REAL visible en píxeles CSS. En móvil `innerHeight` miente
     * mientras la barra de direcciones aparece/desaparece; visualViewport sí
     * dice la verdad. Si viewport-fix.js está cargado se usa su medida, que
     * además congela la altura mientras el teclado está abierto (escribir en
     * el chat NO debe redimensionar el juego).
     */
    _cssSize: function () {
      var vf = root.gfViewportFix;
      if (vf && Utils.isFunction(vf.width) && Utils.isFunction(vf.height)) {
        return { w: Math.round(vf.width()), h: Math.round(vf.height()) };
      }
      var vv = root.visualViewport;
      return {
        w: Math.round((vv && vv.width)  || root.innerWidth),
        h: Math.round((vv && vv.height) || root.innerHeight)
      };
    },

    /**
     * Tamaño INTERNO del juego (resolución de render).
     *
     * Es el tamaño CSS multiplicado por el devicePixelRatio redondeado hacia
     * abajo, que es exactamente lo que el proyecto ha venido usando siempre
     * (lo calculaba AdvancedPixelScaler dentro de phaser-rpg-perf.js). Se
     * mantiene idéntico a propósito: es lo que define cuánto mundo se ve en
     * pantalla, así que cambiarlo cambiaría el aspecto del juego en el móvil.
     * Lo que se ha arreglado es que ahora lo calcula UN SOLO sitio.
     *
     * El factor entero (no el dpr con decimales) es lo correcto para pixel
     * art: cada píxel de textura cae en un número entero de píxeles de
     * pantalla y no aparecen costuras entre tiles.
     *
     * GF_MAX_DPR permite bajar el techo si hace falta rendimiento en móviles
     * de gama baja (un dpr de 3 son 9 veces más píxeles que rellenar que uno
     * de 1). Por defecto no limita nada para no cambiar cómo se ve hoy.
     */
    _gameSize: function (css) {
      var dpr   = Math.max(1, root.devicePixelRatio || 1);
      var techo = Math.max(1, root.GF_MAX_DPR || Infinity);
      var factor= Math.max(1, Math.min(Math.floor(dpr), techo));
      return { w: Math.floor(css.w * factor), h: Math.floor(css.h * factor) };
    },

    handle: function () {
      var now = Date.now();
      if (now - this._last < this._throttle) {
        this._pending = true;
        return;
      }
      this._last = now;
      this._perform();
    },

    /** Fuerza el próximo _perform aunque el tamaño no haya cambiado. */
    invalidate: function () { this._lastW = 0; this._lastH = 0; },

    _perform: function () {
      var self = this;
      try {
        var game      = IsolationSystem.getGame();
        var container = document.getElementById('container');
        var canvas    = container ? container.querySelector('canvas') : null;

        var css  = this._cssSize();
        var size = this._gameSize(css);

        // FIX TORMENTA DE RESIZE: viewport-fix.js dispara un 'resize'
        // sintético cada 300 ms durante los primeros 12 s (y otros más al
        // cargar). Antes cada uno de ellos rehacía todo el redimensionado del
        // juego aunque la pantalla midiera exactamente lo mismo — justo al
        // entrar al mapa principal, que es cuando el jugador nota el tirón.
        // Si el tamaño no cambió, no hay nada que hacer.
        var cambiado = Math.abs(size.w - this._lastW) > 1 ||
                       Math.abs(size.h - this._lastH) > 1;

        if (cambiado && game && game.scale && Utils.isFunction(game.scale.resize)) {
          this._lastW = size.w;
          this._lastH = size.h;
          game.scale.resize(size.w, size.h);
          Logger.log('Juego redimensionado a', size.w + '×' + size.h,
                     '(pantalla ' + css.w + '×' + css.h + ')');
        }

        // Los estilos del lienzo van DESPUÉS de game.scale.resize() a
        // propósito: con `autoCenter: CENTER_BOTH` Phaser escribe él mismo
        // `canvas.style.width/height` en px (el tamaño INTERNO, que en móvil
        // es 2–3 veces el de la pantalla) y un margen de centrado. styless.css
        // ya fuerza `#container > canvas { width:100% !important }`, así que
        // esos px no llegan a verse, pero dejarlos escritos es pedir problemas
        // el día que esa regla cambie. Se normaliza aquí y queda cerrado.
        if (canvas) {
          canvas.style.width  = '100%';
          canvas.style.height = '100%';
          canvas.style.marginLeft = '0px';
          canvas.style.marginTop  = '0px';
          canvas.style.imageRendering = 'pixelated';
        }

        if (this._pending) {
          this._pending = false;
          setTimeout(function () { self.handle(); }, self._throttle);
        }
      } catch (e) {
        Logger.error('Error en resize:', e);
      }
    }
  };

  // Fuerza un recálculo del tamaño del juego aunque la pantalla no haya
  // cambiado. Lo usa el panel de gráficos: al cambiar la calidad cambia el tope
  // de resolución (GF_MAX_DPR) y hay que rehacer el tamaño interno aunque la
  // ventana siga midiendo lo mismo.
  root.gfResizeGame = function () {
    try {
      resizeManager.invalidate();
      resizeManager.handle();
    } catch (e) { Logger.warn('gfResizeGame falló:', e); }
  };

  // ── OVERLAY DE DEBUG ──────────────────────────────────────────────────────
  var DebugOverlay = {
    _el:      null,
    _visible: false,
    _raf:     null,

    _create: function () {
      if (this._el) return;
      this._el = document.createElement('div');
      this._el.className = 'gf-debug-overlay';
      this._el.innerHTML =
        '<div><strong>GF DEBUG</strong></div>' +
        '<div>Estado: <span id="gf-dbg-status">-</span></div>' +
        '<div>Escenas activas: <span id="gf-dbg-scenes">-</span></div>' +
        '<div>FPS: <span id="gf-dbg-fps">-</span></div>';
      document.body.appendChild(this._el);
    },

    show: function () {
      this._create();
      this._el.classList.add('visible');
      this._visible = true;
      this._loop();
    },

    hide: function () {
      if (this._el) this._el.classList.remove('visible');
      this._visible = false;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    },

    _update: function () {
      if (!this._el || !this._visible) return;
      var game = IsolationSystem.getGame();

      var status = game ? 'cargado' : 'no cargado';
      var scenes = 0;
      var fps    = 'N/A';

      if (game && game.scene) {
        scenes = (game.scene.getScenes(true) || []).length;
        if (game.loop && game.loop.actualFps) fps = Math.round(game.loop.actualFps);
      }

      try {
        document.getElementById('gf-dbg-status').textContent = status;
        document.getElementById('gf-dbg-scenes').textContent = scenes;
        document.getElementById('gf-dbg-fps').textContent    = fps;
      } catch (e) {}
    },

    _loop: function () {
      var self = this;
      if (!this._visible) return;
      this._update();
      this._raf = requestAnimationFrame(function () { self._loop(); });
    }
  };

  // ── BOOTSTRAP ─────────────────────────────────────────────────────────────
  function bootstrap() {
    return Promise.resolve()
      .then(function () {
        Security.init();
        injectPerformanceCSS();
        setupContainer();

        var game = createGame();

        // Esperar a que el juego esté completamente inicializado
        return new Promise(function (resolve) {
          if (game.isBooted) { resolve(game); }
          else { game.events.once('ready', function () { resolve(game); }); }
        });
      })
      .then(function (game) {
        return integratePerfAndStart(game, BOOT_FIRST_SCENE).then(function (perf) {
          Logger.log('Bootstrap completo — perf integrado:', !!perf);

          if (Security.isDebug()) {
            DebugOverlay.show();
          }

          // Verificación post-inicialización (única)
          setTimeout(function () {
            var g = IsolationSystem.getGame();
            if (!g) return;

            var active = g.scene.getScenes(true) || [];
            var found  = active.some(function (s) {
              return s && s.sys && s.sys.settings &&
                     s.sys.settings.key === BOOT_FIRST_SCENE;
            });

            if (!found) {
              Logger.warn('Escena principal no activa — reintento final');
              setTimeout(function () { safeStartScene(g, BOOT_FIRST_SCENE); }, 1000);
            } else {
              Logger.log('Escena principal confirmada activa:', BOOT_FIRST_SCENE);
            }
          }, 2000);

          setTimeout(function () { resizeManager.handle(); }, 200);
          setTimeout(function () { resizeManager.handle(); }, 1000);

          return { game: game, perf: perf };
        });
      })
      .catch(function (e) {
        Logger.error('Bootstrap — error fatal:', e);
        throw e;
      });
  }

  // ── EVENTOS GLOBALES ──────────────────────────────────────────────────────
  root.addEventListener('resize', function () { resizeManager.handle(); });
  root.addEventListener('orientationchange', Utils.debounce(function () {
    setTimeout(function () { resizeManager.handle(); }, 100);
  }, 250));

  document.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart',  function (e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); });

  // ── LIMPIEZA AL CERRAR ────────────────────────────────────────────────────
  root.addEventListener('beforeunload', function () {
    var game = IsolationSystem.getGame();
    if (game) {
      try { game.events.off(); }  catch (e) {}
      try { game.sound && game.sound.destroy(); } catch (e) {}
      try {
        var gl = game.renderer && game.renderer.gl;
        if (gl) {
          var ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
      } catch (e) {}
      try { game.destroy(true); } catch (e) {}
    }

    try { IsolationSystem.destroy(); } catch (e) {}
    try { DebugOverlay.hide(); }      catch (e) {}
  });

  // ── API PÚBLICA (SUPERFICIE MÍNIMA) ───────────────────────────────────────
  //
  //  Solo se expone lo estrictamente necesario.
  //  Todo es no-enumerable para no aparecer en Object.keys(window).
  //  En producción (ENV_MODE=1), enableDebug y disableDebug no se crean.
  //

  // startGame: arranca el juego (llamada desde el HTML o una escena de boot)
  Object.defineProperty(root, 'startGame', {
    value: function () {
      return bootstrap().catch(function (e) {
        Logger.error('startGame falló:', e);
        return null;
      });
    },
    writable:     false,
    enumerable:   false,  // no aparece en Object.keys(window)
    configurable: false
  });

  if (ENV_MODE === 0) {
    // enableDebug / disableDebug: solo en entorno de desarrollo
    Object.defineProperty(root, 'enableDebug', {
      value: function () {
        var ok = Security.enableDebug();
        if (ok) DebugOverlay.show();
        return ok;
      },
      writable:     false,
      enumerable:   false,
      configurable: false
    });

    Object.defineProperty(root, 'disableDebug', {
      value: function () {
        var ok = Security.disableDebug();
        if (ok) DebugOverlay.hide();
        return ok;
      },
      writable:     false,
      enumerable:   false,
      configurable: false
    });
  }

  // ── PRESERVAR GLOBALS CRÍTICOS PARA PHASER / WEBGL ───────────────────────
  //
  //  Garantizamos que las funciones que Phaser y WebGL necesitan permanezcan
  //  intactas y sin bloquear. Esto previene que algún plugin cargado antes
  //  que este archivo haya dejado estas funciones en un estado inválido.
  //
  var _criticalGlobals = [
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame',
    'fetch', 'WebSocket', 'XMLHttpRequest',
    'eval', 'Function'   // requeridos por WebGL shader compiler
  ];

  _criticalGlobals.forEach(function (name) {
    try {
      var orig = root[name];
      if (!orig) return;
      var desc = Object.getOwnPropertyDescriptor(root, name);
      // Solo redefinir si el descriptor no es ya writable+configurable
      if (desc && desc.writable && desc.configurable) return;
      Object.defineProperty(root, name, {
        value:        orig,
        writable:     true,   // Phaser puede necesitar parcharlo internamente
        configurable: true,
        enumerable:   true
      });
    } catch (e) {}
  });

  // window.sys: requerido por Phaser Scene Systems
  try {
    if (!root.sys) root.sys = {};
    var _sysDesc = Object.getOwnPropertyDescriptor(root, 'sys');
    if (!_sysDesc) {
      Object.defineProperty(root, 'sys', {
        value:        root.sys,
        writable:     true,
        configurable: true,
        enumerable:   false
      });
    }
  } catch (e) {}

  // ── MARCAR COMO CARGADO ───────────────────────────────────────────────────
  // Previene doble ejecución si el script se carga dos veces por error.
  Object.defineProperty(root, '__GF_BOOT_DONE__', {
    value:        true,
    writable:     false,
    configurable: false,
    enumerable:   false
  });

  // ── ARRANQUE AUTOMÁTICO ───────────────────────────────────────────────────
  //
  //  FIX: antes se pasaba bootstrap directamente a setTimeout. bootstrap()
  //  relanza el error (throw e) dentro de su propio .catch tras loguearlo,
  //  y como nada consumía esa promesa aquí, cualquier fallo terminaba
  //  además como "Uncaught (in promise)" en consola (visible en los logs
  //  del navegador reportados). autoBoot() encadena su propio .catch para
  //  que el fallo quede contenido y solo registrado, sin promesa sin manejar.
  //
  function autoBoot() {
    bootstrap().catch(function (e) {
      Logger.error('Arranque automático falló:', e);
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(autoBoot, 10);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(autoBoot, 10);
    });
  }

  if (ENV_MODE === 0) {
    Logger.log('Sistema listo — modo desarrollo');
  }

})(typeof window !== 'undefined' ? window : this);
