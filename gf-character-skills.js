/* Character allocations are confirmed by the server/chain. No pet attributes are modified. */
(function () {
  'use strict';
  var KEYS = { strength: 'Strength', defense: 'Defense', wisdom: 'Wisdom', patience: 'Patience', farming: 'Farming', woodcutting: 'Woodcutting', fishing: 'Fishing', combat: 'Combat' };
  var EFFECTS = { strength: '+4% sword damage', defense: '-2% damage taken', wisdom: '-2% ability cooldown', patience: 'Steadier fishing', farming: '-2% farming cost', woodcutting: '-2% chopping cost', fishing: 'Larger fishing target', combat: '+1.5% sword reach' };
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
  function load(st) {
    if (st.loading) return st.loading;
    st.loading = api('/api/player/skills').then(function (r) {
      if (valid(st) && r.ok && r.datos && r.datos.ok) { st.data = r.datos; st.scene.skillAllocations = r.datos.allocations; draw(st); }
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
    title.appendChild(free); panel.appendChild(title);
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
      var hint = document.createElement('small'); hint.textContent = EFFECTS[key]; label.appendChild(hint);
      var value = document.createElement('span'); value.className = 'skill-stat-val'; value.textContent = String(st.data && st.data.allocations[key] || 0);
      var b = document.createElement('button'); b.className = 'gf-cp-plus'; b.textContent = '+1'; b.type = 'button'; b.setAttribute('aria-label', 'Improve ' + KEYS[key]);
      b.disabled = !st.data || !st.data.available || !!st.spending;
      b.onclick = function () {
        if (st.spending || !valid(st)) return;
        st.spending = true; st.message = 'Confirming in the chain…'; draw(st);
        api('/api/player/skills/allocate', { skill: key }).then(function (r) {
          if (!valid(st)) return;
          if (r.ok && r.datos && r.datos.ok) { st.data = r.datos; st.scene.skillAllocations = r.datos.allocations; st.message = 'Upgrade saved.'; }
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
    draw(st); load(st);
  }
  function montar(scene) {
    if (!scene || !scene.events) return null;
    if (scene.__gfCharacter) return scene.__gfCharacter;
    var st = { scene: scene, name: scene.playerName }; scene.__gfCharacter = st;
    st.poll = function () {
      if (!st.name && scene.playerName) { st.name = scene.playerName; load(st); }
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
