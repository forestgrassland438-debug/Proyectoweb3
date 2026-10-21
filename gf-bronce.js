/* ===========================================================================
 * gf-bronce.js — LA MONEDA DE BRONCE                               (2026-10-20)
 * ===========================================================================
 *
 * "Hazme la moneda de bronce al estilo de la de oro y plata, a la derecha de
 * la de plata, y que se maneje con el mismo mecanismo. En el panel de cambio
 * (al tocar las monedas) quiero cambiar plata por bronce: 1 de plata son 1000
 * de bronce, en los dos sentidos. Y en el regalo de cada 7 días, el botón de
 * bronce también: 1000."
 *
 * El bronce es una estadística del servidor igual que el oro y la plata
 * (PlayerStats.bronce, con su factura en la tabla `bronce` del contrato de
 * estadísticas; server2.js). Aquí:
 *
 *   · la moneda del HUD (.bronze-stack, #info-text-bronce) y su saldo: se
 *     coge de CUALQUIER respuesta del servidor que traiga `stats.bronce`
 *     (sincronizar, cambiar, el regalo, el VIP, el viaje con amigos…);
 *   · tocarla abre el panel de monedas en "Exchange";
 *   · dentro de ese panel (lo pintan GameScene y tiendajuego, #gf-currency-modal)
 *     se añaden el botón semanal de bronce y el cambio plata ⇄ bronce.
 *
 * GFBronce.valor() · GFBronce.pintar(n) · GFBronce.refrescar()
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFBronce) return;

  var POR_PLATA = 1000;
  var valor = null;
  var propietario = '', revision = 0, pidiendo = null, destruido = false;
  var observador = null, relojes = [], demoras = new Set();

  function cuenta() { var sc = escena(); return sc ? String(sc.playerName || sc.address || '') : ''; }
  function asegurarCuenta() {
    var id = cuenta();
    if (id && id !== propietario) {
      propietario = id; revision++; valor = null; pidiendo = null;
      var el = document.getElementById('info-text-bronce');
      if (el) { el.textContent = '…'; el.title = 'Bronze'; }
    }
    return id;
  }
  function vigente(id) { return !destruido && id && cuenta() === id; }
  function demorar(fn, ms) { var id = setTimeout(function () { demoras.delete(id); if (!destruido) fn(); }, ms); demoras.add(id); }

  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, datos: null });
  }
  function escena() {
    try {
      var g = window.game, l = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName && (l[i].moneda !== undefined || l[i].moneda_plata !== undefined)) return l[i];
      for (var j = 0; j < l.length; j++) if (l[j] && l[j].playerName) return l[j];
    } catch (e) {}
    return null;
  }

  /** 1234 -> "1,234"; 12.5 M -> "12.5M" (el HUD es estrecho). */
  function corto(n) {
    n = Math.floor(Number(n) || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return Math.floor(n / 1000) + 'K';
    return String(n);
  }

  // ── EL HUD ─────────────────────────────────────────────────────────────────
  function caja() {
    var el = document.querySelector('#game-hud .corner-box .bronze-stack');
    if (el) return el;
    var plata = document.querySelector('#game-hud .corner-box .right-stack');
    if (!plata) return null;
    el = document.createElement('div');
    el.className = 'coin-stack bronze-stack';
    el.title = 'Bronze';
    el.innerHTML = '<img src="./Game/Source/moneda de bronce.png" alt="Bronze coin" class="main-img" />' +
                   '<span class="info-text" id="info-text-bronce">0</span>';
    plata.parentNode.insertBefore(el, plata.nextSibling);
    return el;
  }
  function enganchar() {
    var el = caja();
    if (!el || el._gfBronce) return;
    el._gfBronce = true;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () {
      var sc = escena();
      if (sc && typeof sc._openCurrencyHub === 'function') sc._openCurrencyHub('exchange');
    });
  }

  function pintar(n) {
    asegurarCuenta();
    if (destruido || n === null || n === undefined || !Number.isFinite(Number(n))) return;
    valor = Math.max(0, Math.floor(Number(n)));
    if (!window.playerStats) window.playerStats = {};
    window.playerStats.bronce = valor;
    var sc = escena();
    if (sc) sc.moneda_bronce = valor;
    enganchar();
    var el = document.getElementById('info-text-bronce');
    if (el) { el.textContent = corto(valor); el.title = valor.toLocaleString('en-US') + ' Bronze'; }
    var m = document.getElementById('gfb-e-bronce');
    if (m) m.textContent = valor.toLocaleString('en-US');
  }

  var AVISO_SERVIDOR = 'Bronze arrives with the next game server update.';
  function sinBronceEnServidor() {
    enganchar();
    var el = document.getElementById('info-text-bronce');
    if (el && valor === null) { el.textContent = '0'; el.title = AVISO_SERVIDOR; }
  }

  /** Lo que diga el servidor de las otras dos monedas (al cambiar). */
  function adoptarStats(st, dueno) {
    asegurarCuenta();
    if (!st || destruido || (dueno && !vigente(dueno))) return;
    revision++;
    if (typeof st.bronce === 'number') pintar(st.bronce);
    var sc = escena();
    if (sc) {
      if (typeof st.oro === 'number') sc.moneda = st.oro;
      if (typeof st.plata === 'number') sc.moneda_plata = st.plata;
    }
    if (window.playerStats) {
      if (typeof st.oro === 'number') window.playerStats.oro = st.oro;
      if (typeof st.plata === 'number') window.playerStats.plata = st.plata;
    }
    var l = document.getElementById('info-text-left'), r = document.getElementById('info-text-right');
    if (l && typeof st.oro === 'number') l.textContent = String(st.oro);
    if (r && typeof st.plata === 'number') r.textContent = String(st.plata);
    var eo = document.getElementById('gfc-e-oro'), ep = document.getElementById('gfc-e-plata'), bp = document.getElementById('gfb-e-plata');
    if (eo && typeof st.oro === 'number') eo.textContent = Math.floor(st.oro);
    if (ep && typeof st.plata === 'number') ep.textContent = Math.floor(st.plata);
    if (bp && typeof st.plata === 'number') bp.textContent = Math.floor(st.plata);
  }

  function refrescar() {
    var id = asegurarCuenta(), version = revision;
    var sc = escena();
    if (destruido || !id || !sc || !sc.playerName) return Promise.resolve(false);
    if (pidiendo) return pidiendo;
    var trabajo = api('/api/stats/' + encodeURIComponent(sc.playerName)).then(function (r) {
      var d = r && r.datos;
      if (!vigente(id) || version !== revision || !r.ok || !d || !d.stats) return false;
      /* (2026-10-21) "El dinero me sale en ---": un servidor sin bronce (aún
         sin actualizar) no lo trae en los stats y el HUD se quedaba en "…"
         para siempre. Sin bronce en el servidor, el saldo es 0 y se dice por qué. */
      if (typeof d.stats.bronce !== 'number') { sinBronceEnServidor(); return false; }
      adoptarStats({ bronce: d.stats.bronce }, id);
      return true;
    }).catch(function () { return false; }).finally(function () { if (pidiendo === trabajo) pidiendo = null; });
    pidiendo = trabajo;
    return trabajo;
  }

  // ── TODA RESPUESTA QUE TRAIGA `stats.bronce` PONE EL SALDO AL DÍA ─────────
  if (typeof window.fetch === 'function' && !window.fetch.__gfBronce) {
    var f0 = window.fetch;
    var envuelto = function (input, init) {
      var id = asegurarCuenta(), url, write = false;
      try {
        url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href);
        var sc = escena(), base = sc && typeof sc.serverBase === 'string' ? sc.serverBase
          : typeof window.serverBase === 'string' ? window.serverBase : typeof window.GF_API_BASE === 'string' ? window.GF_API_BASE
          : /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) ? 'http://127.0.0.1:8080' : 'https://api.grasslandforest.com';
        if (url.origin !== new URL(base || '/', window.location.href).origin || !/^\/api\/(stats|currency|vip|load)\b/.test(url.pathname)) url = null;
        if (url && url.pathname.indexOf('/api/stats/') === 0 && decodeURIComponent(url.pathname.split('/')[3]) !== id) url = null;
        write = !!url && !/^(GET|HEAD|OPTIONS)$/.test(String((init && init.method) || (input && input.method) || 'GET').toUpperCase());
      } catch (e) { url = null; }
      if (write) revision++;
      var version = revision, p = f0.apply(this, arguments);
      if (destruido || !url || !id) return p;
      function fin() { if (write && vigente(id)) revision++; }
      return p.then(function (res) {
        try {
          if (res && res.ok) {
            res.clone().json().then(function (j) {
              var st = j && (j.stats || (j.datos && j.datos.stats));
              if (vigente(id) && version === revision && st && typeof st.bronce === 'number') pintar(st.bronce);
            }).catch(function () {}).finally(fin);
          } else fin();
        } catch (e) { fin(); }
        return res;
      }, function (error) { fin(); throw error; });
    };
    envuelto.__gfBronce = true;
    window.fetch = envuelto;
  }

  // ── EL PANEL DE MONEDAS: el regalo de bronce y el cambio plata ⇄ bronce ───
  function restante(ms) {
    var h = Math.floor(ms / 3600000);
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    if (h >= 1) return h + 'h';
    return Math.max(1, Math.floor(ms / 60000)) + 'm';
  }

  function regaloBronce(card) {
    var plata = card.querySelector('#gfc-gift-silver');
    if (!plata || card.querySelector('#gfc-gift-bronze')) return;
    var b = document.createElement('button');
    b.id = 'gfc-gift-bronze';
    b.disabled = true;
    b.textContent = 'Get Bronze';
    b.style.cssText = 'flex:1;min-height:44px;border:none;border-radius:10px;background:#8a4f2a;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;';
    plata.parentNode.appendChild(b);
    var msg = card.querySelector('#gfc-gift-msg');
    var dueno = asegurarCuenta(), reclamando = false;
    function actual() { return vigente(dueno) && card.isConnected; }
    var pintarBoton = function (g) {
      if (!actual() || reclamando) return;
      if (!g) { b.disabled = true; return; }
      b.disabled = !g.available;
      b.style.opacity = g.available ? '1' : '.55';
      b.textContent = g.available ? 'Get ' + g.amount + ' Bronze' : 'Bronze in ' + restante(g.msLeft);
    };
    api('/api/currency/weekly').then(function (r) {
      var regalos = r && r.ok && r.datos && r.datos.gifts;
      // (2026-10-21) El servidor contesta pero sin el regalo de bronce: aún no
      // está actualizado. Antes el botón se quedaba apagado sin decir nada.
      if (regalos && !regalos.bronze) {
        if (!actual()) return;
        b.disabled = true; b.style.opacity = '.55'; b.textContent = 'Bronze: soon';
        b.title = AVISO_SERVIDOR;
        return;
      }
      pintarBoton(regalos && regalos.bronze);
    }).catch(function () { pintarBoton(null); });
    b.onclick = function () {
      if (reclamando || b.disabled || !actual()) return;
      reclamando = true;
      b.disabled = true;
      var antes = b.textContent;
      b.textContent = 'Claiming…';
      api('/api/currency/weekly/claim', { kind: 'bronze' }).then(function (r) {
        if (!actual()) return;
        reclamando = false;
        var d = (r && r.datos) || {};
        if (r && r.ok && d.ok) {
          adoptarStats(d.stats, dueno);
          if (msg) { msg.style.color = '#6fcf97'; msg.textContent = '+' + d.amount + ' Bronze added.'; }
          var sc = escena();
          if (sc && sc.notifications) sc.notifications.show('+' + d.amount + ' Bronze (weekly gift)', 'success');
          api('/api/currency/weekly').then(function (r2) { pintarBoton(r2 && r2.datos && r2.datos.gifts && r2.datos.gifts.bronze); }).catch(function () { pintarBoton(null); });
        } else {
          if (msg) {
            msg.style.color = '#ff8a8a';
            msg.textContent = d.error === 'already_claimed' ? 'Already claimed — come back in ' + restante(d.msLeft || 0) + '.' : 'Could not claim right now. Try again later.';
          }
          b.textContent = antes; b.disabled = false;
        }
      }).catch(function () { reclamando = false; if (actual()) { b.textContent = antes; b.disabled = false; } });
    };
  }

  function cambioBronce(card) {
    var exc = card.querySelector('#gfc-exc');
    if (!exc || card.querySelector('#gfb-exc')) return;
    var dueno = asegurarCuenta(), ocupado = false;
    function actual() { return vigente(dueno) && card.isConnected; }
    var sc = escena();
    var plataIni = Math.floor(Number(sc && sc.moneda_plata) || 0);
    var caja_ = document.createElement('div');
    caja_.id = 'gfb-exc';
    caja_.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px dashed #2b5c4a;';
    caja_.innerHTML =
      '<div style="text-align:center;margin-bottom:10px;font-size:clamp(13px,3.6vw,16px);"><b>1 Silver = ' + POR_PLATA + ' Bronze</b></div>' +
      '<div style="display:flex;justify-content:space-around;background:#08211a;border:1px solid #24503f;border-radius:10px;padding:10px;margin-bottom:12px;font-size:13px;">' +
      '  <div>🥈 Silver: <b id="gfb-e-plata">' + plataIni + '</b></div>' +
      '  <div><img src="./Game/Source/moneda de bronce.png" alt="" style="width:14px;height:14px;vertical-align:-2px;image-rendering:pixelated"> Bronze: <b id="gfb-e-bronce">' +
           (valor === null ? '…' : valor.toLocaleString('en-US')) + '</b></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
      '  <button id="gfb-dir-s2b" type="button" style="flex:1;min-height:40px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;font-size:12px;">🥈 → 🟤 Silver to Bronze</button>' +
      '  <button id="gfb-dir-b2s" type="button" style="flex:1;min-height:40px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;font-size:12px;">🟤 → 🥈 Bronze to Silver</button>' +
      '</div>' +
      '<label id="gfb-label" style="font-size:12px;color:#bcd6c9;"></label>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:8px 0 12px;">' +
      '  <button id="gfb-minus" type="button" style="width:44px;height:44px;font-size:22px;border:none;border-radius:10px;background:#1b3d31;color:#fff;cursor:pointer;">−</button>' +
      '  <input id="gfb-qty" type="number" inputmode="numeric" min="1" value="1" style="flex:1;height:44px;text-align:center;font-size:18px;font-weight:bold;border-radius:10px;border:2px solid #c98a52;background:#0b2b22;color:#fff;">' +
      '  <button id="gfb-plus" type="button" style="width:44px;height:44px;font-size:22px;border:none;border-radius:10px;background:#1b3d31;color:#fff;cursor:pointer;">+</button>' +
      '</div>' +
      '<div id="gfb-cost" style="text-align:center;color:#ffc48a;margin-bottom:12px;font-size:13px;"></div>' +
      '<button id="gfb-go" type="button" style="width:100%;min-height:48px;border:none;border-radius:12px;background:#9a5a2c;color:#fff;font-weight:bold;font-size:16px;cursor:pointer;">✓ Exchange Bronze</button>' +
      '<div id="gfb-msg" style="margin-top:10px;font-size:12px;text-align:center;"></div>';
    exc.appendChild(caja_);
    var $ = function (id) { return caja_.querySelector('#' + id); };
    var dir = 'silverToBronze';
    var saldo = function () {
      var s = escena();
      return { plata: Math.floor(Number(s && s.moneda_plata) || 0), bronce: Math.floor(Number(valor) || 0) };
    };
    var tope = function () { var s = saldo(); return dir === 'silverToBronze' ? s.plata : Math.floor(s.bronce / POR_PLATA); };
    var pintarDir = function () {
      var on = 'background:#c98a52;color:#20160a;', off = 'background:#1b3d31;color:#fff;';
      var base = 'flex:1;min-height:40px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;font-size:12px;';
      $('gfb-dir-s2b').style.cssText = base + (dir === 'silverToBronze' ? on : off);
      $('gfb-dir-b2s').style.cssText = base + (dir === 'bronzeToSilver' ? on : off);
    };
    var refresh = function () {
      if (!actual()) return;
      var t = tope(), s = saldo();
      $('gfb-e-plata').textContent = s.plata;
      var q = Math.max(1, Math.min(Math.max(1, t), parseInt($('gfb-qty').value, 10) || 1));
      $('gfb-qty').value = q;
      if (dir === 'silverToBronze') {
        $('gfb-label').textContent = 'How much Silver do you want to convert? (max ' + t + ')';
        $('gfb-cost').textContent = 'Cost: ' + q + ' Silver  →  you get ' + (q * POR_PLATA).toLocaleString('en-US') + ' Bronze';
      } else {
        $('gfb-label').textContent = 'How much Silver do you want? (max ' + t + ')';
        $('gfb-cost').textContent = 'Cost: ' + (q * POR_PLATA).toLocaleString('en-US') + ' Bronze  →  you get ' + q + ' Silver';
      }
      $('gfb-go').disabled = ocupado || t < 1;
      $('gfb-go').style.opacity = t < 1 ? '.55' : '1';
      if (t < 1 && $('gfb-msg').dataset.sticky !== '1') {
        $('gfb-msg').style.color = '#ff8a8a';
        $('gfb-msg').textContent = dir === 'silverToBronze' ? 'You need at least 1 Silver.' : 'You need at least ' + POR_PLATA + ' Bronze.';
      } else if ($('gfb-msg').dataset.sticky !== '1') $('gfb-msg').textContent = '';
    };
    $('gfb-dir-s2b').onclick = function () { dir = 'silverToBronze'; $('gfb-qty').value = 1; pintarDir(); refresh(); };
    $('gfb-dir-b2s').onclick = function () { dir = 'bronzeToSilver'; $('gfb-qty').value = 1; pintarDir(); refresh(); };
    $('gfb-minus').onclick = function () { $('gfb-qty').value = (parseInt($('gfb-qty').value, 10) || 1) - 1; refresh(); };
    $('gfb-plus').onclick = function () { $('gfb-qty').value = (parseInt($('gfb-qty').value, 10) || 1) + 1; refresh(); };
    $('gfb-qty').oninput = refresh;
    $('gfb-go').onclick = function () {
      if (ocupado || !actual()) return;
      var t = tope();
      if (t < 1) return;
      var q = Math.max(1, Math.min(t, parseInt($('gfb-qty').value, 10) || 1));
      var go = $('gfb-go'), msg = $('gfb-msg');
      var direccion = dir;
      ocupado = true;
      go.disabled = true; go.textContent = '⏳ Exchanging…';
      msg.dataset.sticky = '1'; msg.style.color = '#ffc48a'; msg.textContent = 'Sending transaction…';
      api('/api/currency/exchange', { direction: direccion, amount: q }).then(function (r) {
        if (!actual()) return;
        var d = (r && r.datos) || {};
        if (r && r.ok && d.ok) {
          adoptarStats(d.stats, dueno);
          msg.style.color = '#6fcf97';
          msg.textContent = direccion === 'silverToBronze' ? 'Done! +' + (q * POR_PLATA).toLocaleString('en-US') + ' Bronze' : 'Done! +' + q + ' Silver';
          var sc2 = escena();
          if (sc2 && sc2.notifications) sc2.notifications.show(direccion === 'silverToBronze'
            ? 'Exchanged ' + q + ' Silver → ' + (q * POR_PLATA).toLocaleString('en-US') + ' Bronze'
            : 'Exchanged ' + (q * POR_PLATA).toLocaleString('en-US') + ' Bronze → ' + q + ' Silver', 'success');
        } else {
          msg.style.color = '#ff8a8a';
          msg.textContent = d.error === 'insufficient_bronze' ? 'Not enough Bronze.' : d.error === 'insufficient_silver' ? 'Not enough Silver.' : 'Exchange failed. Try again.';
        }
      }).catch(function () { if (actual()) { msg.style.color = '#ff8a8a'; msg.textContent = 'Connection error. Try again.'; } })
        .finally(function () {
          ocupado = false;
          if (!actual()) return;
          go.disabled = false; go.textContent = '✓ Exchange Bronze';
          demorar(function () { if (actual()) { msg.dataset.sticky = '0'; refresh(); } }, 1600);
        });
    };
    pintarDir();
    refresh();
    if (valor === null) refrescar().then(refresh);
  }

  function alAbrirPanel(ov) {
    var card = ov && ov.firstElementChild;
    if (!card) return;
    try { regaloBronce(card); } catch (e) { console.warn('[bronce] regalo:', e); }
    try { cambioBronce(card); } catch (e) { console.warn('[bronce] cambio:', e); }
  }

  function vigilar() {
    if (destruido) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', vigilar); return; }
    enganchar();
    observador = new MutationObserver(function (cambios) {
      for (var i = 0; i < cambios.length; i++) {
        var n = cambios[i].addedNodes;
        for (var k = 0; k < n.length; k++) {
          if (n[k].id === 'gf-currency-modal') alAbrirPanel(n[k]);
        }
      }
      enganchar();
    });
    observador.observe(document.body, { childList: true });
    // El saldo al empezar (y cada 2 min, por si algo lo cambió sin avisar).
    var primero = setInterval(function () {
      var sc = escena();
      if (sc && sc.playerName) { clearInterval(primero); refrescar(); }
    }, 1500);
    relojes.push(primero, setInterval(function () { if (document.visibilityState !== 'hidden') refrescar(); }, 120000));
  }
  function destruir(e) {
    if (destruido || (e && e.persisted)) return;
    destruido = true; revision++; pidiendo = null;
    relojes.forEach(clearInterval); relojes = [];
    demoras.forEach(clearTimeout); demoras.clear();
    if (observador) observador.disconnect(); observador = null;
    document.removeEventListener('DOMContentLoaded', vigilar);
    window.removeEventListener('pagehide', destruir);
    if (window.fetch === envuelto) window.fetch = f0;
  }
  window.addEventListener('pagehide', destruir);
  vigilar();

  window.GFBronce = { valor: function () { asegurarCuenta(); return valor; }, pintar: pintar, adoptarStats: adoptarStats, refrescar: refrescar, corto: corto, destruir: destruir };
})();
