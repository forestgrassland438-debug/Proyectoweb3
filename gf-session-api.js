/* Sesión de juego compartida: renovar antes de caducar y reintentar una
 * petición rechazada por autenticación, conservando la cookie HttpOnly. */
(function () {
  'use strict';
  if (window.GFSessionAPI || typeof window.fetch !== 'function') return;
  var original = window.fetch.bind(window), suspended = false, destroyed = false, timer = null, vitalRevision = 0, epoch = 0;
  var base = typeof window.GF_API_BASE === 'string' ? window.GF_API_BASE
    : typeof window.serverBase === 'string' ? window.serverBase
    : /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? 'http://127.0.0.1:8080' : 'https://api.grasslandforest.com';
  base = new URL(base || '/', location.href).href.replace(/\/$/, '');
  function owned(input) {
    try { var url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); return url.origin === new URL(base).origin && url.pathname.indexOf('/api/') === 0 ? url : null; }
    catch (e) { return null; }
  }
  function playing() {
    var scenes = window.game && window.game.scene && window.game.scene.getScenes ? window.game.scene.getScenes(true) : [];
    return scenes.some(function (s) { return s && !s._sceneStopped && (s.player && (s.isAuthenticated || s.address || s.currentAccount) || s.datosJugador && s.datosJugador.address); });
  }
  function refresh() { return window.PhaserRelay.refreshSession(base, 15000); }
  function optionsWithCSRF(input, init, csrf) {
    var options = Object.assign({}, init || {}), method = String(options.method || (input && input.method) || 'GET').toUpperCase();
    if (csrf && !/^(GET|HEAD|OPTIONS)$/.test(method)) {
      var headers = new Headers(options.headers || (input && input.headers) || {});
      headers.set('X-CSRF-Token', csrf); options.headers = headers;
    }
    return options;
  }
  async function wrapped(input, init) {
    var url = owned(input);
    if (!url || !window.PhaserRelay || /\/auth\/(?:refresh|login|nonce|logout)$/.test(url.pathname)) {
      var login = url && /\/auth\/login$/.test(url.pathname);
      if (url && /\/auth\/(?:login|logout)$/.test(url.pathname)) {
        var authEpoch = ++epoch;
        suspended = true;
        // Esperar la renovación anterior evita recibir una cookie nueva
        // después de haber cerrado sesión explícitamente.
        var pending = window.PhaserRelay && window.PhaserRelay._sessionRefreshes && window.PhaserRelay._sessionRefreshes.get(base);
        if (pending) { try { var completed = await pending; var data = await completed.json(); init = optionsWithCSRF(input, init, data.csrfToken); } catch (e) {} }
      }
      var authResponse = await original(input, init);
      if (login && authResponse.ok && authEpoch === epoch && !destroyed) suspended = false;
      return authResponse;
    }
    var requestEpoch = epoch;
    var mutation = /\/stats\/.*\/(consume|update|refill)$|\/alchemist\/(buy|use)$/.test(url.pathname);
    if (mutation) vitalRevision++;
    var signal = init && init.signal || input && input.signal;
    // Preserve the Request's signal as well as init.signal before renewal.
    var copy = typeof input === 'string' || input instanceof URL ? input : input.clone();
    var response;
    try { response = await original(input, init); } finally { if (mutation) vitalRevision++; }
    if (response.status !== 401 || requestEpoch !== epoch || suspended || destroyed || (signal && signal.aborted)) return response;
    try {
      var result = await refresh();
      if (!result.ok || requestEpoch !== epoch || suspended || destroyed || (signal && signal.aborted)) return response;
      var body = await result.json();
      try { return await original(copy, optionsWithCSRF(copy, init, body.csrfToken)); } finally { if (mutation) vitalRevision++; }
    } catch (e) { return response; }
  }
  async function tick() { if (!suspended && !destroyed && document.visibilityState !== 'hidden' && playing()) { try { await refresh(); } catch (e) {} } }
  function visible() { if (document.visibilityState === 'visible') tick(); }
  function destroy(event) {
    if (event && event.persisted) return;
    destroyed = true;
    clearInterval(timer); timer = null;
    document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', destroy);
    if (window.fetch === wrapped) window.fetch = original;
  }
  window.fetch = wrapped;
  timer = setInterval(tick, 240000);
  document.addEventListener('visibilitychange', visible); window.addEventListener('pagehide', destroy);
  window.GFSessionAPI = { destroy: destroy, tick: tick, vitalRevision: function () { return vitalRevision; } };
})();
