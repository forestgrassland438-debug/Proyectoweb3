/* Character allocations are confirmed by the server/chain. No pet attributes are modified. */
(function () {
  'use strict';
  var KEYS = { strength: 'Strength', defense: 'Defense', wisdom: 'Wisdom', patience: 'Patience', farming: 'Farming', woodcutting: 'Woodcutting', fishing: 'Fishing', combat: 'Combat' };
  var EFFECTS = { strength: '+4% sword damage', defense: '-2% damage taken', wisdom: '-2% ability cooldown', patience: 'Steadier fishing', farming: '-2% farming cost', woodcutting: '-2% chopping cost', fishing: 'Larger fishing target', combat: '+1.5% sword reach' };
  /* (2026-10-20) "Me dice cuánto va a subir pero no cuánto tengo ni cuánto se
     sumó." Lo que da CADA punto y su tope (los mismos que el servidor:
     gfCharacterCosts y la espada), para enseñar el total de ahora. */
  var POR_PUNTO = {
    strength: { k: 4, tope: Infinity, txt: function (v) { return '+' + v + '% sword damage'; } },
    defense: { k: 2, tope: 40, txt: function (v) { return '-' + v + '% damage taken'; } },
    wisdom: { k: 2, tope: Infinity, txt: function (v) { return '-' + v + '% ability cooldown'; } },
    patience: { k: 1, tope: Infinity, txt: function (v) { return '+' + v + ' fishing steadiness'; } },
    farming: { k: 2, tope: 35, txt: function (v) { return '-' + v + '% farming cost'; } },
    woodcutting: { k: 2, tope: 35, txt: function (v) { return '-' + v + '% chopping cost'; } },
    fishing: { k: 1, tope: Infinity, txt: function (v) { return '+' + v + ' fishing target size'; } },
    combat: { k: 1.5, tope: Infinity, txt: function (v) { return '+' + v + '% sword reach'; } }
  };
  function totalDe(key, puntos) {
    var e = POR_PUNTO[key], v = Math.min(e.tope, Math.round(puntos * e.k * 10) / 10);
    return puntos > 0 ? e.txt(v) : 'Nothing yet';
  }
  function api(route, body) {
    if (!window.GFMascota || typeof window.GFMascota.api !== 'function') return Promise.resolve({ ok: false, datos: null });
    return window.GFMascota.api(route, body);
  }
  function valid(st) { return st.scene && st.scene.__gfCharacter === st && st.name === st.scene.playerName; }
  function applyStats(scene, stats) {
    if (!stats) return;
    ['vida', 'agua', 'comida'].forEach(function (k) {
      var value = Number(stats[k]); if (!Number.isFinite(value)) return;
      value = Math.max(0, Math.min(100, value));
      if (!window.playerStats) window.playerStats = {};
      window.playerStats[k] = value; scene[k + 'Porcentaje'] = value;
      var fn = scene['actualizarBarra' + ({vida:'Vida',agua:'Agua',comida:'Comida'})[k]];
      if (fn) fn.call(scene, value);
    });
  }
  /* LO ÚLTIMO QUE SE LEYÓ, POR JUGADOR (2026-10-19). Cada escena monta su
     propio estado y antes empezaba sin nada: al abrir el panel se veía
     "Loading character points…" hasta que la cadena contestaba (lee TODAS
     las facturas del jugador, segundos). Ahora el panel pinta al momento lo
     último conocido y lo refresca por detrás. */
  var CACHE = new Map();
  function guardar(st, datos) {
    st.data = datos;
    if (st.name) { CACHE.delete(st.name); CACHE.set(st.name, { data: datos, t: Date.now() }); while (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value); }
  }
  function adoptarCache(st) {
    var c = st.name && CACHE.get(st.name);
    if (c && !st.data) st.data = c.data;
  }
  function load(st) {
    if (st.loading) return st.loading;
    var revision = st.revision || 0;
    st.loading = api('/api/player/skills').then(function (r) {
      if (valid(st) && !st.spending && revision === (st.revision || 0) && r.ok && r.datos && r.datos.ok) { guardar(st, r.datos); st.scene.skillAllocations = r.datos.allocations; draw(st); }
    }).catch(function () {}).finally(function () { st.loading = null; });
    return st.loading;
  }
  function usePotion(scene, itemId) {
    var st = montar(scene);
    if (!st || !valid(st) || !['pocion_vida', 'pocion_antidoto'].includes(itemId)) return Promise.resolve(false);
    if (st.potionPending) return st.potionPending;
    st.potionPending = api('/api/alchemist/use', { itemId: itemId }).then(function (r) {
      if (!valid(st)) return false;
      var data = r.datos || {};
      if (r.ok && data.ok) {
        applyStats(scene, data.stats);
        if (scene._sincronizarInventarioConLaCadena) return scene._sincronizarInventarioConLaCadena().then(function () { return true; });
        return true;
      }
      var message = data.error === 'not_needed' ? 'You do not need that potion right now.' : data.error === 'missing_potion' ? 'You do not have that potion.' : 'Could not confirm the potion. Try again.';
      if (scene.notifications) scene.notifications.show(message, 'warning');
      return false;
    }).catch(function () {
      if (valid(st) && scene.notifications) scene.notifications.show('Connection problem. Check your inventory before trying again.', 'warning');
      return false;
    }).finally(function () { st.potionPending = null; });
    return st.potionPending;
  }
  // (2026-10-12) "El apartado de puntos no se une al diseño del panel": ahora
  // es una sección más del panel (.skills-section) con las mismas filas que
  // las habilidades: icono, nombre con su efecto, valor en píldora y el +1.
  var ICONS = { strength: '💪', defense: '🛡️', wisdom: '📘', patience: '⏳', farming: '🌿', woodcutting: '🌲', fishing: '🌊', combat: '⚔️' };
  function draw(st) {
    if (!valid(st)) return;
    if (st.panel) drawPanel(st, st.panel);
    if (st.modalPanel) drawPanel(st, st.modalPanel);
  }
  function drawPanel(st, panel) {
    panel.replaceChildren();
    var title = document.createElement('div'); title.className = 'skills-section-title gf-cp-title';
    title.textContent = '✨ Character points';
    var free = document.createElement('span'); free.className = 'skill-stat-val gf-cp-free';
    free.textContent = st.data ? String(st.data.available) : '…'; free.title = 'Points to spend';
    title.appendChild(free);
    // (2026-10-20) Reiniciar: todos los puntos vuelven a estar libres.
    var gastados = 0;
    if (st.data) Object.keys(KEYS).forEach(function (k) { gastados += st.data.allocations[k] || 0; });
    var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'gf-cp-reset';
    reset.textContent = '↺ Reset'; reset.title = 'Return all your points so you can spend them again';
    reset.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:11px;border-radius:8px;cursor:pointer';
    reset.disabled = !st.data || !gastados || !!st.spending;
    reset.onclick = function () {
      if (st.spending || !valid(st)) return;
      if (!window.confirm('Reset your character points?' + String.fromCharCode(10, 10) + 'All ' + gastados + ' points come back so you can spend them again.')) return;
      st.revision = (st.revision || 0) + 1;
      st.spending = true; st.message = 'Resetting your points in the chain…'; draw(st);
      api('/api/player/skills/reset', {}).then(function (r) {
        if (!valid(st)) return;
        var d = r.datos || {};
        if (r.ok && d.ok) {
          guardar(st, d); st.scene.skillAllocations = d.allocations; st.sumado = null;
          st.message = d.incompleto ? 'Some points could not be returned yet. Try again in a minute.'
                                    : (d.reset || 0) + ' points returned. Spend them as you like.';
        } else if (d.error === 'demasiado_pronto') st.message = 'Wait a minute before resetting again.';
        else st.message = 'Could not reset the points. Try again.';
      }).catch(function () { if (valid(st)) st.message = 'Connection problem. Try again.'; })
        .finally(function () { st.spending = false; if (valid(st)) draw(st); });
    };
    title.appendChild(reset);
    panel.appendChild(title);
    if (st.message || !st.data) {
      var msg = document.createElement('p'); msg.className = 'gf-cp-msg';
      msg.textContent = st.message || 'Loading character points…'; panel.appendChild(msg);
    }
    var list = document.createElement('div'); list.className = 'skills-stats-grid';
    panel.appendChild(list);
    Object.keys(KEYS).forEach(function (key) {
      var row = document.createElement('div'); row.className = 'skill-stat-row gf-character-row';
      var icon = document.createElement('span'); icon.className = 'skill-stat-icon'; icon.textContent = ICONS[key];
      var label = document.createElement('span'); label.className = 'skill-stat-name'; label.textContent = KEYS[key];
      var puntos = st.data && st.data.allocations[key] || 0;
      // Lo que da cada punto, lo que tienes ahora y (recién subido) lo sumado.
      var hint = document.createElement('small'); hint.textContent = 'Each point: ' + EFFECTS[key]; label.appendChild(hint);
      var ahora = document.createElement('small'); ahora.className = 'gf-cp-now';
      ahora.textContent = 'Now: ' + totalDe(key, puntos);
      ahora.style.cssText = 'display:block;opacity:.95;color:#bfe8a8';
      label.appendChild(ahora);
      if (st.sumado && st.sumado.key === key && Date.now() - st.sumado.t < 8000) {
        var sumado = document.createElement('small'); sumado.className = 'gf-cp-added';
        sumado.textContent = 'Added: ' + EFFECTS[key] + ' (' + st.sumado.antes + ' → ' + puntos + ' points)';
        sumado.style.cssText = 'display:block;color:#ffd77a;font-weight:700';
        label.appendChild(sumado);
      }
      var value = document.createElement('span'); value.className = 'skill-stat-val'; value.textContent = String(puntos);
      value.title = puntos + ' point' + (puntos === 1 ? '' : 's') + ' in ' + KEYS[key];
      var b = document.createElement('button'); b.className = 'gf-cp-plus'; b.textContent = '+1'; b.type = 'button'; b.setAttribute('aria-label', 'Improve ' + KEYS[key]);
      b.disabled = !st.data || !st.data.available || !!st.spending;
      b.onclick = function () {
        if (st.spending || !valid(st)) return;
        st.revision = (st.revision || 0) + 1;
        st.spending = true; st.message = 'Confirming in the chain…'; draw(st);
        var antes = st.data && st.data.allocations[key] || 0;
        api('/api/player/skills/allocate', { skill: key }).then(function (r) {
          if (!valid(st)) return;
          if (r.ok && r.datos && r.datos.ok) {
            guardar(st, r.datos); st.scene.skillAllocations = r.datos.allocations;
            st.sumado = { key: key, antes: antes, t: Date.now() };
            st.message = KEYS[key] + ' upgraded: ' + totalDe(key, r.datos.allocations[key] || 0) + ' now.';
          }
          else st.message = 'Could not confirm the upgrade. Try again.';
        }).catch(function () { if (valid(st)) st.message = 'Connection problem. Try again.'; }).finally(function () { st.spending = false; if (valid(st)) draw(st); });
      };
      row.append(icon, label, value, b); list.appendChild(row);
    });
  }
  function render(scene) {
    var st = montar(scene); if (!st) return;
    var anchor = document.getElementById('sk-strength'); if (!anchor) return;
    var old = document.getElementById('gf-character-upgrades'); if (old) old.remove();
    st.panel = document.createElement('div'); st.panel.id = 'gf-character-upgrades'; st.panel.className = 'skills-section gf-character-section';
    // Dentro del cuerpo del panel, justo después de "Player level" (antes se
    // pegaba al velo de fondo, fuera de la caja).
    var body = anchor.closest('.skills-body');
    if (body) {
      var first = body.querySelector('.skills-section');
      body.insertBefore(st.panel, first ? first.nextSibling : body.firstChild);
    } else {
      (document.getElementById('skills-panel') || anchor.parentNode.parentNode).appendChild(st.panel);
    }
    // Lo conocido, ya; la lectura de la cadena, por detrás.
    if (!st.name && scene.playerName) st.name = scene.playerName;
    adoptarCache(st);
    draw(st); load(st);
  }
  function montar(scene) {
    if (!scene || !scene.events) return null;
    if (scene.__gfCharacter) return scene.__gfCharacter;
    var st = { scene: scene, name: scene.playerName }; scene.__gfCharacter = st;
    adoptarCache(st);
    st.poll = function () {
      if (!st.name && scene.playerName) { st.name = scene.playerName; adoptarCache(st); load(st); }
      if (!valid(st) || document.visibilityState === 'hidden' || st.polling || !st.name) return;
      var rev = window.GFSessionAPI ? window.GFSessionAPI.vitalRevision() : 0;
      st.polling = true;
      api('/api/player/vitals').then(function (r) {
        if (valid(st) && r.ok && r.datos && (!window.GFSessionAPI || rev === window.GFSessionAPI.vitalRevision())) applyStats(scene, r.datos.stats);
      }).catch(function () {}).finally(function () { st.polling = false; });
    };
    st.timer = setInterval(st.poll, 6000);
    st.close = function () { clearInterval(st.timer); scene.events.off('shutdown', st.close); scene.events.off('destroy', st.close); if (st.panel) st.panel.remove(); if (st.modal) st.modal.remove(); if (st.button) st.button.remove(); st.panel = st.modal = st.modalPanel = st.button = null; scene.__gfCharacter = null; st.scene = null; };
    scene.events.once('shutdown', st.close); scene.events.once('destroy', st.close);
    if (window.GFMascota && st.name) load(st);
    return st;
  }
  function battle(scene) {
    scene.playerName = scene.datosJugador.playerName;
    var st = montar(scene); if (!st || st.button) return;
    var button = document.createElement('button'); button.className = 'gf-character-battle-button'; button.textContent = '★'; button.title = 'Character skills'; button.setAttribute('aria-label', 'Character skills'); document.body.appendChild(button); st.button = button;
    button.onclick = function () {
      if (!valid(st)) return; if (st.modal) st.modal.remove();
      var modal = document.createElement('div'); modal.className = 'gf-character-modal';
      var close = document.createElement('button'); close.textContent = 'Close'; close.onclick = function () { modal.remove(); if (st.modal === modal) st.modal = st.modalPanel = null; };
      var title = document.createElement('p'); title.textContent = 'Character skills'; modal.append(title, close);
      st.modalPanel = document.createElement('div'); st.modalPanel.className = 'skills-section gf-character-section'; modal.appendChild(st.modalPanel); document.body.appendChild(modal); st.modal = modal; draw(st); load(st);
    };
  }
  window.GFCharacterSkills = { montar: montar, render: render, applyStats: applyStats, battle: battle, usePotion: usePotion };
})();
