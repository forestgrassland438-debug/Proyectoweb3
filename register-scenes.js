/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * REGISTRO DE ESCENAS — v13.0.0-release
 * Para permisos y contacto, ver documentación interna del proyecto.
 *
 * ============================================================================
 *
 * RESPONSABILIDAD DE ESTE ARCHIVO:
 *
 *   Este script debe cargarse ANTES de app.js y phaser-rpg-perf.js.
 *   Su única tarea es detectar las clases de escena disponibles en el
 *   scope global y publicarlas en window.__secureSceneRegistry, que es
 *   el punto de integración que app.js y phaser-rpg-perf.js consumen.
 *
 *   Después de correr, app.js lee __secureSceneRegistry y registra cada
 *   escena en Phaser con su nombre amigable original.
 *
 * PRINCIPIOS APLICADOS:
 *
 *  1. NO sobreescribir Object.keys/values/entries.
 *     Phaser los usa internamente. Este era el error más grave del original
 *     y se repetía en app.js y phaser-rpg-perf.js — el primero en ejecutar
 *     ganaba con configurable:false y los demás fallaban en silencio.
 *
 *  2. NO bloquear window.sys.
 *     El original bloqueaba 'sys' en _cleanPublicRegistrations(). Phaser
 *     Scene Systems usa this.sys en cada escena — bloquearlo lo rompe todo.
 *
 *  3. NO exponer SecureSceneRegistry en window.
 *     El original hacía window.SecureSceneRegistry = { ... } con un getter
 *     que devolvía el objeto completo, incluyendo _scenes con todas las
 *     clases, setDebugMode(), getAllScenes(), etc. Cualquier usuario podía
 *     acceder a ello desde la consola.
 *
 *  4. NO usar btoa() como "cifrado" de secureKey.
 *     Era Base64 puro, reversible con atob() en 1 línea. Además, esas
 *     claves cifradas nunca se usaban para registrar en Phaser — había un
 *     campo `secureKey` en _scenes que no se usaba en ningún sitio.
 *
 *  5. DEBUG_MODE coherente con el resto del ecosistema.
 *     El original tenía DEBUG_MODE = true hardcodeado mientras app.js
 *     tenía false. Las condiciones de seguridad se evaluaban distinto
 *     en cada archivo.
 *
 *  6. Superficie mínima. Solo se expone __secureSceneRegistry en window
 *     (no enumerable) y se lanza el CustomEvent de finalización.
 *     Las APIs de debug (showSceneRegistry, etc.) solo existen en dev.
 * ============================================================================
 */

(function (root) {
  'use strict';

  // ── GUARD: solo ejecutar una vez ──────────────────────────────────────────
  if (root.__GF_SCENES_LOADED__) return;

  // ── POLYFILLS MÍNIMOS ─────────────────────────────────────────────────────
  // Solo se instalan si el navegador carece de Map/Set nativos.
  (function ensureCollections() {
    if (typeof root.Map !== 'undefined') return;

    root.Map = function GFMap() { this._k = []; this._v = []; this.size = 0; };
    var Mp = root.Map.prototype;
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
    // Iterator para for...of
    if (typeof Symbol !== 'undefined' && Symbol.iterator) {
      Mp[Symbol.iterator] = function () {
        var i = 0; var self = this;
        return { next: function () {
          return i < self._k.length
            ? { value: [self._k[i], self._v[i++]], done: false }
            : { done: true };
        }};
      };
    }
  })();

  (function ensureSet() {
    if (typeof root.Set !== 'undefined') return;
    root.Set = function GFSet() { this._v = []; this.size = 0; };
    var Sp = root.Set.prototype;
    Sp.add    = function (v) { if (this._v.indexOf(v) < 0) { this._v.push(v); this.size++; } return this; };
    Sp.has    = function (v) { return this._v.indexOf(v) >= 0; };
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

  // ── CONFIGURACIÓN ─────────────────────────────────────────────────────────
  //
  //  Debe ser idéntica a app.js y phaser-rpg-perf.js.
  //  ENV_MODE=0 / DEBUG_MODE=false es el estado por defecto correcto:
  //  · ENV_MODE=0   → entorno desarrollo (permite APIs de debug en window)
  //  · DEBUG_MODE=false → logs silenciados. Cambiar a true durante dev activo.
  //
  var ENV_MODE         = 1;     // 0 = desarrollo | 1 = producción
  var SECURITY_ENABLED = true;
  var DEBUG_MODE       = false; // false en producción. true solo en desarrollo activo.

  // ── LOGGER INTERNO ────────────────────────────────────────────────────────
  //
  //  Solo escribe si ENV_MODE=0 o DEBUG_MODE=true.
  //  No toca console globalmente — Phaser y otros scripts siguen logeando.
  //
  var _log  = (ENV_MODE === 0 || DEBUG_MODE)
    ? function () { try { console.log.apply(console, ['[SCENE-REG]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {} }
    : function () {};

  var _warn = (ENV_MODE === 0 || DEBUG_MODE)
    ? function () { try { console.warn.apply(console, ['[SCENE-REG]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {} }
    : function () {};

  // ── REGISTRO SEGURO DE ESCENAS (closure privado) ──────────────────────────
  //
  //  _scenes es privado al closure. No es accesible desde fuera.
  //  La única salida pública es window.__secureSceneRegistry, que se
  //  actualiza después de la detección.
  //
  var _scenes     = new root.Map(); // nombre amigable → { cls, required, source }
  var _debugMode  = DEBUG_MODE;

  // ── DETECCIÓN DE ESCENAS ──────────────────────────────────────────────────
  //
  //  Escenas principales conocidas. Se buscan directamente en el scope
  //  global (window). Si la clase existe, se agrega al registro.
  //
  //  Para agregar escenas nuevas: añadir a MAIN_SCENES o usar la
  //  auto-detección (DEBUG_MODE=true) que busca nombres convencionales.
  //
  var MAIN_SCENES = [
    { name: 'LoadingScenegame', required: true  },
    { name: 'GameScene',        required: true  },
    { name: 'tiendajuego',      required: true  },
    { name: 'LoadingSceneshop', required: true  }
  ];

  // Nombres adicionales que se auto-detectan en modo debug
  var EXTRA_SCENE_NAMES = [
    'MenuScene', 'SettingsScene', 'CreditsScene', 'PauseScene',
    'InventoryScene', 'BattleScene', 'DialogScene', 'MapScene',
    'CharacterScene', 'QuestScene', 'SaveScene', 'LoadScene',
    'ShopScene', 'SkillScene', 'EquipmentScene', 'LevelScene'
  ];

  function _detectScenes() {
    var missing = [];

    // ── Escenas principales ───────────────────────────────────────────────
    MAIN_SCENES.forEach(function (def) {
      var cls = root[def.name];
      if (typeof cls === 'function') {
        _scenes.set(def.name, { cls: cls, required: def.required, source: 'main' });
        _log('Detectada:', def.name, '(main)');
      } else if (def.required) {
        missing.push(def.name);
        _warn('Escena requerida no encontrada:', def.name);
      }
    });

    // ── Escenas adicionales (solo en debug) ───────────────────────────────
    if (_debugMode) {
      EXTRA_SCENE_NAMES.forEach(function (name) {
        if (!_scenes.has(name) && typeof root[name] === 'function') {
          _scenes.set(name, { cls: root[name], required: false, source: 'auto-detected' });
          _log('Auto-detectada:', name);
        }
      });
    }

    // ── Advertencia de escenas faltantes ──────────────────────────────────
    if (missing.length > 0) {
      _warn('ADVERTENCIA — escenas requeridas faltantes:', missing.join(', '));
      _warn('Verifica que los archivos de escenas se carguen antes que register-scenes.js');
      _warn('y que los nombres de clase sean exactamente:', missing.join(', '));
    }
  }

  // ── LIMPIEZA DE REFERENCIAS GLOBALES EN PRODUCCIÓN ────────────────────────
  //
  //  En producción (ENV_MODE=1 y DEBUG_MODE=false), eliminamos las
  //  referencias directas a las clases de escena del scope global para
  //  que no sean accesibles desde la consola del navegador.
  //
  //  Lo que NO se toca nunca:
  //   · window.sys     → Phaser Scene Systems lo necesita
  //   · window.Phaser  → el motor del juego
  //   · window.Map / Set / WeakMap → polyfills o nativos
  //   · window.__secureSceneRegistry → el punto de integración del ecosistema
  //
  function _removePublicSceneRefs() {
    if (ENV_MODE === 0 || _debugMode) return; // en dev, dejamos las referencias

    _scenes.forEach(function (data, name) {
      try {
        // Intentar eliminar primero (más limpio que redefinir)
        if (Object.getOwnPropertyDescriptor(root, name) &&
            Object.getOwnPropertyDescriptor(root, name).configurable) {
          delete root[name];
        } else {
          root[name] = undefined;
        }
      } catch (e) {
        // Si no se puede eliminar, intentar hacer undefined
        try { root[name] = undefined; } catch (e2) {}
      }
    });

    // Limpiar también GameScenes/sceneClasses si existían como globals
    ['GameScenes', 'sceneClasses', 'gameScenes', 'phaserScenes'].forEach(function (key) {
      try {
        var desc = Object.getOwnPropertyDescriptor(root, key);
        if (desc && desc.configurable) delete root[key];
        else if (root[key]) root[key] = undefined;
      } catch (e) {}
    });

    _log('Referencias públicas de escenas removidas (producción)');
  }

  // ── PUBLICAR EN window.__secureSceneRegistry ──────────────────────────────
  //
  //  Este es el único punto de salida público de este archivo.
  //  app.js y phaser-rpg-perf.js leen este Map para registrar las escenas
  //  en Phaser con su nombre amigable original.
  //
  function _publishRegistry() {
    // Si ya existe (doble carga del script), actualizar el Map existente
    if (root.__secureSceneRegistry instanceof root.Map) {
      _scenes.forEach(function (data, name) {
        root.__secureSceneRegistry.set(name, data.cls);
      });
      _log('__secureSceneRegistry actualizado (ya existía)');
      return;
    }

    // Primera vez: crear el Map y definirlo como no-enumerable
    var registry = new root.Map();
    _scenes.forEach(function (data, name) {
      registry.set(name, data.cls);
    });

    try {
      Object.defineProperty(root, '__secureSceneRegistry', {
        value:        registry,
        writable:     false,    // no se puede reemplazar el Map completo
        enumerable:   false,    // no aparece en Object.keys(window)
        configurable: false     // no se puede eliminar ni reconfigurar
      });
      _log('__secureSceneRegistry creado —', registry.size, 'escenas');
    } catch (e) {
      // Fallback: si defineProperty no funciona, asignar directamente
      root.__secureSceneRegistry = registry;
      _log('__secureSceneRegistry asignado (fallback)');
    }
  }

  // ── API DE DEBUG (solo ENV_MODE=0) ────────────────────────────────────────
  //
  //  Herramientas de diagnóstico disponibles desde la consola del navegador
  //  en entorno de desarrollo. No se crean en producción.
  //
  //  Todas son no-enumerables para no aparecer en Object.keys(window).
  //
  function _createDebugAPI() {
    if (ENV_MODE !== 0) return;

    // showSceneRegistry() — imprime el registro completo en consola
    _defineWindowProp('showSceneRegistry', function () {
      if (!_debugMode) { console.warn('[SCENE-REG] Activa debug mode primero'); return; }
      console.group('[SCENE-REG] Registro de escenas');
      console.log('Total:', _scenes.size);
      console.log('ENV_MODE:', ENV_MODE === 0 ? 'desarrollo' : 'producción');
      console.log('DEBUG_MODE:', _debugMode);
      var i = 1;
      _scenes.forEach(function (data, name) {
        console.log('  ' + i++ + '. [' + (data.required ? 'REQ' : 'OPT') + '] ' + name + ' (' + data.source + ')');
      });
      console.groupEnd();
    });

    // getSecureSceneInfo() — retorna objeto con info del registro
    _defineWindowProp('getSecureSceneInfo', function () {
      if (!_debugMode) { console.warn('[SCENE-REG] Activa debug mode primero'); return { total: 0, scenes: [] }; }
      var scenes = [];
      _scenes.forEach(function (data, name) {
        scenes.push({ key: name, required: data.required, source: data.source });
      });
      return {
        total: _scenes.size,
        scenes: scenes,
        stats: {
          required: scenes.filter(function (s) { return s.required; }).length,
          optional: scenes.filter(function (s) { return !s.required; }).length
        }
      };
    });

    // findSecureScene(name) — devuelve la clase de una escena por nombre
    _defineWindowProp('findSecureScene', function (name) {
      if (!_debugMode) { console.warn('[SCENE-REG] Activa debug mode primero'); return null; }
      var data = _scenes.get(name);
      return data ? data.cls : null;
    });

    // isSceneSecurelyRegistered(name) — comprueba si una escena está registrada
    _defineWindowProp('isSceneSecurelyRegistered', function (name) {
      return _scenes.has(name);
    });

    // _sceneReg_setDebugMode(bool) — activa/desactiva debug en este módulo
    // Nombre con prefijo para que sea obvio que es una función interna.
    _defineWindowProp('_sceneReg_setDebugMode', function (enabled) {
      _debugMode = !!enabled && ENV_MODE === 0;
      _log('Debug mode:', _debugMode ? 'ON' : 'OFF');
      return _debugMode;
    });

    _log('APIs de debug creadas (ENV_MODE=0)');
    _log('Comandos: showSceneRegistry() | getSecureSceneInfo() | findSecureScene(name) | isSceneSecurelyRegistered(name)');
  }

  // ── HELPER: defineProperty no-enumerable ──────────────────────────────────
  function _defineWindowProp(name, value) {
    try {
      // Si ya existe y no es configurable, omitir silenciosamente
      var desc = Object.getOwnPropertyDescriptor(root, name);
      if (desc && !desc.configurable) return;
      Object.defineProperty(root, name, {
        value:        value,
        writable:     false,
        enumerable:   false,  // no aparece en Object.keys(window)
        configurable: false
      });
    } catch (e) {
      // Fallback si defineProperty no funciona
      try { root[name] = value; } catch (e2) {}
    }
  }

  // ── EVENTO DE FINALIZACIÓN ────────────────────────────────────────────────
  //
  //  Dispara 'secureSceneRegistrationComplete' en window para que app.js
  //  pueda saber que el registro está listo si lo necesita como señal.
  //  app.js actualmente no depende de este evento pero es útil para
  //  integraciones futuras.
  //
  function _dispatchCompletionEvent() {
    setTimeout(function () {
      try {
        root.dispatchEvent(new CustomEvent('secureSceneRegistrationComplete', {
          detail: {
            totalScenes:     _scenes.size,
            securityEnabled: SECURITY_ENABLED,
            debugMode:       _debugMode,
            timestamp:       Date.now()
          }
        }));
        _log('Evento secureSceneRegistrationComplete disparado');
      } catch (e) {
        // CustomEvent no soportado (entorno muy antiguo) — continuar sin él
      }
    }, 0);
  }

  // ── RESUMEN EN CONSOLA ────────────────────────────────────────────────────
  function _printSummary() {
    if (ENV_MODE !== 0 && !DEBUG_MODE) return;
    _log('=== RESUMEN ===');
    _log('Escenas registradas:', _scenes.size);
    _log('Seguridad:', SECURITY_ENABLED ? 'ACTIVADA' : 'DESACTIVADA');
    _log('Debug mode:', _debugMode ? 'ON' : 'OFF');
    _log('Entorno:', ENV_MODE === 0 ? 'desarrollo' : 'producción');
  }

  // ── EJECUCIÓN PRINCIPAL ───────────────────────────────────────────────────
  _log('Inicializando sistema de registro de escenas...');

  _detectScenes();
  _publishRegistry();
  _removePublicSceneRefs();
  _createDebugAPI();
  _printSummary();
  _dispatchCompletionEvent();

  // ── MARCAR COMO CARGADO ───────────────────────────────────────────────────
  _defineWindowProp('__GF_SCENES_LOADED__', true);

})(typeof window !== 'undefined' ? window : this);
