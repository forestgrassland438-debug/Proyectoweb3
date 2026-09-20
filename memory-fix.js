/*!
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * Lifecycle cleanup for the game's owned resources.
 * API: installMemoryProtector(), forceFullCleanup(), memfix.status().
 */
(function () {
  'use strict';

  if (window.__MEMFIX_LIFECYCLE_INSTALLED) return;
  window.__MEMFIX_LIFECYCLE_INSTALLED = true;

  const destroyed = new WeakSet();
  const workers = window.__MEMFIX_CREATED_WORKERS = window.__MEMFIX_CREATED_WORKERS || new Set();
  const audioContexts = window.__MEMFIX_AUDIO_CONTEXTS = window.__MEMFIX_AUDIO_CONTEXTS || new Set();

  function safely(action) {
    try {
      const result = action();
      if (result && typeof result.catch === 'function') result.catch(reportError);
    } catch (error) { reportError(error); }
  }

  function reportError(error) {
    console.warn('[MEMFIX] Resource cleanup failed:', error);
  }

  if (!window.__MEMFIX_PATCHED_WORKER && window.Worker) {
    const NativeWorker = window.Worker;
    window.Worker = class TrackedWorker extends NativeWorker {
      constructor(...args) { super(...args); workers.add(this); }
      terminate() { workers.delete(this); return super.terminate(); }
    };
    window.__MEMFIX_PATCHED_WORKER = true;
  }

  if (!window.__MEMFIX_PATCHED_AUDIO) {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    if (NativeAudioContext) {
      window.AudioContext = class TrackedAudioContext extends NativeAudioContext {
        constructor(...args) { super(...args); audioContexts.add(this); }
        close() {
          const result = super.close();
          // Failed closes remain tracked so a later cleanup may retry them.
          return Promise.resolve(result).then(value => { audioContexts.delete(this); return value; });
        }
      };
      if (window.webkitAudioContext) window.webkitAudioContext = window.AudioContext;
      window.__MEMFIX_PATCHED_AUDIO = true;
    }
  }

  function destroyOnce(resource, action) {
    if (!resource || destroyed.has(resource)) return;
    destroyed.add(resource);
    safely(action);
  }

  function cleanupGame(game) {
    if (!game || typeof game.destroy !== 'function') return;
    destroyOnce(game, () => {
      // Phaser emits its destruction events and disposes scenes, textures,
      // input and audio in order. Removing listeners or nulling scene.sys
      // first prevents these disposers from running. destroy() is deferred
      // until the next frame, so the loop must not be put to sleep here.
      game.destroy(true, false);
      if (game.loop && game.loop.running === false && typeof game.loop.wake === 'function') {
        game.loop.wake();
      }
    });
  }

  function forceFullCleanup() {
    const perf = window.perf;
    const scaler = window.phaserScaler;
    const game = window.game;
    const scalerGame = scaler && scaler.game;

    // Clear aliases first: callbacks may reenter cleanup during destruction.
    window.perf = null;
    window.phaserScaler = null;
    window.game = null;

    if (perf && typeof perf.destroy === 'function') destroyOnce(perf, () => perf.destroy());
    if (scaler && typeof scaler.destroy === 'function') {
      destroyOnce(scaler, () => {
        scaler.destroy();
        // CanvasScaler owns its game and calls game.destroy itself.
        if (scalerGame) destroyed.add(scalerGame);
      });
    } else {
      cleanupGame(scalerGame);
    }
    cleanupGame(game);

    for (const worker of Array.from(workers)) {
      safely(() => worker.terminate());
      workers.delete(worker);
    }
    for (const context of Array.from(audioContexts)) {
      if (context.state === 'closed') { audioContexts.delete(context); continue; }
      safely(() => Promise.resolve(context.close()).then(() => audioContexts.delete(context)));
    }

    // Do not create or lose contexts on unrelated canvases in the document.
    window.__PHASER_SCENE_CACHE = null;
    window.__PHASER_SCENE_MANAGER = null;
  }

  function getStatus() {
    return {
      workers: workers.size,
      audioContexts: audioContexts.size,
      gameAlive: !!window.game,
      scalerAlive: !!window.phaserScaler,
      perfAlive: !!window.perf
    };
  }

  function installMemoryProtector() {
    window.forceFullCleanup = forceFullCleanup;
    window.installMemoryProtector = installMemoryProtector;
    window.memfix = window.__memfix = {
      cleanupNow: forceFullCleanup,
      forceFullCleanup,
      installMemoryProtector,
      status: getStatus
    };
  }

  // beforeunload can be cancelled and would leave a visible page destroyed.
  // A page entering the back/forward cache must remain resumable as well.
  window.addEventListener('pagehide', event => {
    if (!event.persisted) forceFullCleanup();
  });
  installMemoryProtector();
})();
