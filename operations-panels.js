(function (root) {
  'use strict';
  const session = root.GFAdminSession, $ = id => document.getElementById(id);
  let closed = false, verified = false, busy = false;
  const resets = new Set();
  const el = (tag, value, cls) => { const n = document.createElement(tag); if (value != null) n.textContent = String(value); if (cls) n.className = cls; return n; };
  function notice(value, error = false) { $('op-notice').hidden = !value; $('op-notice').textContent = value || ''; $('op-notice').dataset.error = String(error); }
  function gate() { verified = false; $('op-gate').hidden = false; $('op-app').hidden = true; resets.forEach(fn=>fn()); $('op-copy-text').value=''; if($('op-copy-dialog').open)$('op-copy-dialog').close(); }
  async function run(work, button) {
    if (closed || !verified || busy) return;
    busy = true; if (button) button.disabled = true;
    try { return await work(); }
    catch (e) { if ([401,403].includes(e.status)) gate(); if (!closed) notice(e.message || 'No se pudo completar la operación.', true); }
    finally { busy = false; if (button && !closed) button.disabled = false; }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); notice('Copiado al portapapeles.'); }
    catch (_) { const d = $('op-copy-dialog'), a = $('op-copy-text'); a.value = value; d.showModal(); a.focus(); a.select(); }
  }
  const unsubscribe = session.subscribe(() => { if (!closed) gate(); });
  const api = { $, el, notice, run, copy, request: (path, options) => session.request(path, options), onReset(fn){resets.add(fn);return()=>resets.delete(fn);},
    get active() { return !closed && verified; } };
  root.GFOperations = Object.freeze(api);
  root.addEventListener('pagehide', e => { if (!e.persisted) { gate();closed = true; verified = false; unsubscribe();resets.clear(); } });
  $('op-copy-close').addEventListener('click', () => $('op-copy-dialog').close());
  root.startOperations = function (load) {
    async function verify(interactive) {
      $('op-connect').disabled = true;
      try {
        if (interactive) await session.signIn(value => { $('op-login-message').textContent = value; });
        else await session.request('/api/admin/whoami');
        if (closed) return;
        await session.getCsrf(); verified = true; $('op-gate').hidden = true; $('op-app').hidden = false;
        await run(load, $('op-refresh'));
      } catch (e) { gate(); $('op-login-message').textContent = [401,403].includes(e.status) ? 'Conecta una cartera administradora para continuar.' : e.message; }
      finally { $('op-connect').disabled = false; }
    }
    $('op-connect').addEventListener('click', () => verify(true));
    $('op-refresh').addEventListener('click', () => run(load, $('op-refresh')));
    root.addEventListener('pageshow', e => { if (e.persisted) verify(false); });
    verify(false);
  };
})(window);
