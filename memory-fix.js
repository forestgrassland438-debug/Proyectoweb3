/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * GRASSLAND FOREST v13
 * VERSIÓN: v13.2.0-fixed
 * GENERADO: 12/19/2025
 * ============================================================================
 */

/*
  memory-fix.js
  Propósito: detectar y limpiar fugas de memoria en Phaser + PhaserRPGPerf + CanvasScaler
  Instrucciones: incluir DESPUÉS de app.js, phaser-canvas-scaler.js, phaser-rpg-perf.js
  API: window.installMemoryProtector() al inicio, window.forceFullCleanup() para forzar limpieza.
*/

(function () {
  'use strict';

  // ─── Utilidades ──────────────────────────────────────────────────────────

  function safe(fn) {
    try { return fn(); } catch (e) { console.warn('[MEMFIX] safe():', e); return undefined; }
  }
  function isFunction(v) { return typeof v === 'function'; }

  // ─── Trackers globales ────────────────────────────────────────────────────
  // FIX #1: NO parchear EventTarget.prototype — era la mayor fuga de memoria.
  // Usamos WeakSet para workers y Set acotado para audio contexts solamente.
  // FIX #2: NO parchear setTimeout/setInterval globales — mata el game loop de Phaser.

  // FIX SEC#1: Solo exponer lo mínimo necesario en window
  window.__MEMFIX_CREATED_WORKERS    = window.__MEMFIX_CREATED_WORKERS    || new Set();
  window.__MEMFIX_AUDIO_CONTEXTS     = window.__MEMFIX_AUDIO_CONTEXTS     || new Set();

  // FIX #3: Worker shim correcto con class extension
  if (!window.__MEMFIX_PATCHED_WORKER) {
    const _OrigWorker = window.Worker;
    if (_OrigWorker) {
      class TrackedWorker extends _OrigWorker {
        constructor(...args) {
          super(...args);
          try { window.__MEMFIX_CREATED_WORKERS.add(this); } catch (e) {}
        }
        terminate() {
          try { window.__MEMFIX_CREATED_WORKERS.delete(this); } catch (e) {}
          return super.terminate();
        }
      }
      window.Worker = TrackedWorker;
    }
    window.__MEMFIX_PATCHED_WORKER = true;
  }

  // FIX #4: AudioContext wrap correcto usando class extension
  if (!window.__MEMFIX_PATCHED_AUDIO) {
    const _OrigAudio = window.AudioContext || window.webkitAudioContext || null;
    if (_OrigAudio) {
      class TrackedAudioContext extends _OrigAudio {
        constructor(...args) {
          super(...args);
          try { window.__MEMFIX_AUDIO_CONTEXTS.add(this); } catch (e) {}
        }
        close() {
          try { window.__MEMFIX_AUDIO_CONTEXTS.delete(this); } catch (e) {}
          return super.close();
        }
      }
      window.AudioContext = TrackedAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = TrackedAudioContext;
    }
    window.__MEMFIX_PATCHED_AUDIO = true;
  }

  // ─── Helpers de destrucción ───────────────────────────────────────────────

  function tryDestroy(obj) {
    if (!obj) return;
    try {
      if      (isFunction(obj.destroy))    obj.destroy(true);
      else if (isFunction(obj.close))      obj.close();
      else if (isFunction(obj.disconnect)) obj.disconnect();
      else if (isFunction(obj.stop))       obj.stop();
    } catch (e) {
      try { if (isFunction(obj.destroy)) obj.destroy(); } catch (e2) {}
    }
  }

  // ─── Cleanup de escena Phaser ─────────────────────────────────────────────

  function cleanupScene(scene) {
    if (!scene) return;
    try {
      // 1) Detener tweens
      safe(() => {
        if (scene.tweens && scene.tweens._tweens) {
          scene.tweens._tweens.forEach(t => tryDestroy(t));
        }
      });

      // 2) Desregistrar eventos de escena
      safe(() => {
        if (scene.events && scene.events.removeAllListeners) {
          scene.events.removeAllListeners();
        }
      });

      // 3) Destruir cámaras
      safe(() => {
        if (scene.cameras) {
          try { scene.cameras.removeAll(); } catch (e) {}
        }
      });

      // 4) Shutdown physics
      safe(() => {
        if (scene.physics && scene.physics.world) {
          try { scene.physics.world.shutdown(); } catch (e) {}
        }
      });

      // 5) Destruir display list
      safe(() => {
        if (scene.sys && scene.sys.displayList && scene.sys.displayList.list) {
          for (const obj of Array.from(scene.sys.displayList.list || [])) {
            tryDestroy(obj);
          }
        }
      });

      // 6) Limpiar texturas no core
      safe(() => {
        const tex = scene.textures;
        if (tex && tex.list) {
          for (const key of Object.keys(tex.list || {})) {
            if (!key.startsWith('__BASE') && !key.startsWith('phaser-')) {
              safe(() => tex.remove(key));
            }
          }
        }
      });

      // 7) Destruir plugins
      safe(() => {
        if (scene.sys && scene.sys.plugins && isFunction(scene.sys.plugins.destroy)) {
          try { scene.sys.plugins.destroy(); } catch (e) {}
        }
      });

      // FIX WARN#3: anular refs SIEMPRE al final, después de todo el cleanup
      safe(() => {
        const keys = ['tweens', 'events', 'children', 'textures', 'cameras',
                      'anims', 'physics', 'input', 'cache', 'sys'];
        for (const k of keys) {
          try { scene[k] = null; } catch (e) {}
        }
      });

    } catch (e) {
      console.warn('[MEMFIX] cleanupScene error:', e);
    }
  }

  // ─── Cleanup de Phaser.Game ───────────────────────────────────────────────

  function cleanupPhaserGame(game) {
    if (!game) return;
    try {
      // 1) Pausar game loop
      safe(() => {
        if (game.loop && game.loop.sleep) game.loop.sleep();
      });

      // 2) Quitar listeners globales del juego
      safe(() => {
        if (game.events && game.events.removeAllListeners) {
          game.events.removeAllListeners();
        }
      });

      // 3) Destruir escenas
      safe(() => {
        if (game.scene && game.scene.keys) {
          for (const key of Object.keys(game.scene.keys)) {
            const sc = game.scene.keys[key];
            try {
              if (sc && sc.sys) {
                try { sc.sys.shutdown(); }      catch (e) {}
                try { sc.sys.events && sc.sys.events.removeAllListeners && sc.sys.events.removeAllListeners(); } catch (e) {}
                cleanupScene(sc);
              }
            } catch (e) {}
          }
        }
      });

      // 4) Destruir audio
      safe(() => {
        if (game.sound) {
          if (isFunction(game.sound.destroy)) game.sound.destroy();
          else if (game.sound.context && isFunction(game.sound.context.close)) {
            game.sound.context.close();
          }
        }
      });

      // 5) Limpiar texturas
      safe(() => {
        const tex = game.textures;
        if (tex && tex.list) {
          for (const k of Object.keys(tex.list)) {
            if (!k.startsWith('__BASE') && !k.startsWith('phaser-')) {
              try { tex.remove(k); } catch (e) {}
            }
          }
        }
      });

      // 6) Liberar contexto GPU
      safe(() => {
        const gl = game.renderer && (game.renderer.gl || game.renderer.context);
        if (gl && gl.getExtension) {
          const ext = gl.getExtension('WEBGL_lose_context') ||
                      gl.getExtension('MOZ_WEBGL_lose_context') ||
                      gl.getExtension('WEBKIT_WEBGL_lose_context');
          if (ext && isFunction(ext.loseContext)) {
            try { ext.loseContext(); } catch (e) {}
          }
        }
      });

      // 7) Destruir el juego formalmente
      safe(() => {
        if (isFunction(game.destroy)) {
          game.destroy(true);
        } else if (game.canvas && game.canvas.parentNode) {
          game.canvas.parentNode.removeChild(game.canvas);
        }
      });

    } catch (e) {
      console.warn('[MEMFIX] cleanupPhaserGame error:', e);
    }
  }

  // ─── Cleanup de PhaserRPGPerf ─────────────────────────────────────────────

  function cleanupPhaserRPGPerf(perf) {
    if (!perf) return;
    try {
      if (isFunction(perf.destroy)) {
        try { perf.destroy(); } catch (e) {}
      }
      // Limpiar handles que el perf pueda haber dejado
      try {
        if (perf._autoScanInterval) { clearInterval(perf._autoScanInterval); perf._autoScanInterval = null; }
        if (perf._memoryInterval)   { clearInterval(perf._memoryInterval);   perf._memoryInterval   = null; }
        if (perf._resizeHandler) {
          window.removeEventListener('resize',            perf._resizeHandler);
          window.removeEventListener('orientationchange', perf._resizeHandler);
        }
      } catch (e) {}
    } catch (e) {
      console.warn('[MEMFIX] cleanupPhaserRPGPerf error:', e);
    }
  }

  // ─── Cleanup de PhaserCanvasScaler ────────────────────────────────────────

  function cleanupCanvasScaler(scaler) {
    if (!scaler) return;
    try {
      // FIX WARN#1: en la versión corregida del scaler, destroy() gestiona todo
      if (isFunction(scaler.destroy)) {
        try { scaler.destroy(); } catch (e) {}
      } else {
        // Fallback manual para versiones antiguas del scaler
        safe(() => {
          if (scaler._onWindowResize)      window.removeEventListener('resize',            scaler._onWindowResize);
          if (scaler._onOrientationChange) window.removeEventListener('orientationchange', scaler._onOrientationChange);
          if (scaler._onVisibilityChange)  document.removeEventListener('visibilitychange', scaler._onVisibilityChange);
        });

        safe(() => {
          if (scaler.game) cleanupPhaserGame(scaler.game);
        });

        safe(() => {
          if (scaler.canvas && scaler.canvas.parentNode) {
            scaler.canvas.parentNode.removeChild(scaler.canvas);
          }
        });

        // Anular referencias
        ['canvas', 'game', 'glContext', 'events', 'container'].forEach(k => {
          try { scaler[k] = null; } catch (e) {}
        });
      }
    } catch (e) {
      console.warn('[MEMFIX] cleanupCanvasScaler error:', e);
    }
  }

  // ─── Cleanup de recursos del sistema ─────────────────────────────────────

  function cleanupTrackedSystemResources() {
    // Workers
    try {
      for (const w of Array.from(window.__MEMFIX_CREATED_WORKERS || [])) {
        try { w.terminate(); } catch (e) {}
      }
      window.__MEMFIX_CREATED_WORKERS.clear();
    } catch (e) {}

    // AudioContexts
    try {
      for (const ac of Array.from(window.__MEMFIX_AUDIO_CONTEXTS || [])) {
        try { if (isFunction(ac.close)) ac.close(); } catch (e) {}
      }
      window.__MEMFIX_AUDIO_CONTEXTS.clear();
    } catch (e) {}
  }

  // ─── Función pública principal ────────────────────────────────────────────

  function forceFullCleanup() {
    console.log('[MEMFIX] Running forceFullCleanup...');

    // 1) Cleanup PhaserRPGPerf (solo una vez — FIX #5)
    try {
      if (window.perf) cleanupPhaserRPGPerf(window.perf);
    } catch (e) {}

    // 2) Cleanup CanvasScaler
    try {
      if (window.phaserScaler) {
        cleanupCanvasScaler(window.phaserScaler);
        try { window.phaserScaler = null; } catch (e) {}
      }
    } catch (e) {}

    // 3) Cleanup juego global
    try {
      if (window.game) {
        if (window.game instanceof Phaser.Game) {
          cleanupPhaserGame(window.game);
        }
        try { window.game = null; } catch (e) {}
      }
    } catch (e) {}

    // 4) Cleanup Workers y AudioContexts trackeados
    cleanupTrackedSystemResources();

    // 5) FIX #3: verificar que el canvas siga conectado antes de perder contexto GPU
    try {
      const canvases = document.getElementsByTagName('canvas');
      for (const c of Array.from(canvases)) {
        if (!c.isConnected) continue; // FIX: no acceder a canvas ya eliminado del DOM
        try {
          const gl = c.getContext && (
            c.getContext('webgl2') ||
            c.getContext('webgl') ||
            c.getContext('experimental-webgl')
          );
          if (gl && gl.getExtension) {
            const ext = gl.getExtension('WEBGL_lose_context') ||
                        gl.getExtension('MOZ_WEBGL_lose_context') ||
                        gl.getExtension('WEBKIT_WEBGL_lose_context');
            if (ext && isFunction(ext.loseContext)) {
              try { ext.loseContext(); } catch (e) {}
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // 6) Limpiar referencias globales conocidas
    try { window.__PHASER_SCENE_CACHE   = null; } catch (e) {}
    try { window.__PHASER_SCENE_MANAGER = null; } catch (e) {}

    console.log('[MEMFIX] forceFullCleanup finished.');
  }

  // ─── MEJ#2: status() legible para diagnóstico ────────────────────────────

  function getStatus() {
    return {
      workers:      (window.__MEMFIX_CREATED_WORKERS  || new Set()).size,
      audioContexts:(window.__MEMFIX_AUDIO_CONTEXTS   || new Set()).size,
      gameAlive:    !!(window.game),
      scalerAlive:  !!(window.phaserScaler),
      perfAlive:    !!(window.perf)
    };
  }

  // ─── Instalación ──────────────────────────────────────────────────────────

  function installMemoryProtector() {
    console.log('[MEMFIX] installMemoryProtector activo.');

    // FIX SEC#1: solo exponer API mínima públicamente
    window.forceFullCleanup     = forceFullCleanup;
    window.installMemoryProtector = installMemoryProtector;

    // FIX WARN#2: beforeunload NO necesita { passive: true } — no tiene efecto
    if (!window.__MEMFIX_INSTALLED_ON_BEFOREUNLOAD) {
      try {
        window.addEventListener('beforeunload', function memfix_beforeunload() {
          try {
            if (window.perf)         cleanupPhaserRPGPerf(window.perf);
            if (window.phaserScaler) cleanupCanvasScaler(window.phaserScaler);
            if (window.game)         cleanupPhaserGame(window.game);
            forceFullCleanup();
          } catch (e) {
            console.warn('[MEMFIX] beforeunload error:', e);
          }
        });
      } catch (e) {}
      window.__MEMFIX_INSTALLED_ON_BEFOREUNLOAD = true;
    }

    if (!window.__MEMFIX_ADDED_CONSOLE_HELPER) {
      window.__MEMFIX_ADDED_CONSOLE_HELPER = true;
      // FIX SEC#1: NO exponer funciones internas en window.__memfix
      window.memfix = {
        cleanupNow: forceFullCleanup,
        status:     getStatus   // MEJ#2: status legible
      };
      console.log('[MEMFIX] API disponible: window.memfix.cleanupNow() · window.memfix.status()');
    }
  }

  // Auto-instalar
  try { installMemoryProtector(); } catch (e) { console.warn('[MEMFIX] installMemoryProtector failed:', e); }

  // FIX SEC#1: solo exponer funciones públicas, NO las internas
  window.__memfix = {
    forceFullCleanup,
    installMemoryProtector,
    status: getStatus
  };

})();
