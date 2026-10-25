/* ===========================================================================
 * LO QUE CAMBIA EL ADMINISTRADOR, AL MOMENTO                     (2026-10-25)
 *
 * El panel de administración (admin.html, también dentro del centro de
 * control) cambia el nivel, la experiencia, las monedas o las vitales de un
 * jugador en la base de datos Y en la cadena. Si ese jugador estaba jugando,
 * su navegador seguía con los valores viejos y los DEVOLVÍA:
 *   · _syncExp (GameScene) manda la experiencia ABSOLUTA a su factura en
 *     cuanto el jugador gana un punto: 1.000 de exp puestos por el admin se
 *     convertían en la exp vieja + 5;
 *   · lo pendiente de StatsSync (oro, plata, bronce…) salía igual;
 *   · y /api/save se queda con la experiencia MAYOR de las dos.
 *
 * El servidor avisa con 'admin:ajuste' { stats, nivel, pet } y aquí se adopta:
 * window.playerStats, lo pendiente de cada StatsSync (se tira lo que el admin
 * ya fijó), y los campos de las escenas (GameScene y sus mapas, la tienda).
 * Solo vienen los stats que el administrador cambió.
 *
 * El socket no es de este módulo: `window.globalSocket` lo crea la escena y una
 * reconexión lo sustituye, así que se comprueba CUÁL es cada segundo (lo mismo
 * que gf-amigos.js y gf-canales.js).
 * ======================================================================== */
(function (global) {
  'use strict';
  if (global.GFAdminAjuste) return;

  var STATS = ['vida', 'agua', 'comida', 'oro', 'plata', 'bronce', 'exp'];
  // El campo de la escena que lleva cada stat (los mismos que usa GameScene).
  var CAMPO = { vida: 'vidaPorcentaje', agua: 'aguaPorcentaje', comida: 'comidaPorcentaje',
                oro: 'moneda', plata: 'moneda_plata' };

  var socket = null, oyente = null;

  function escenas() {
    var g = global.game;
    if (!g || !g.scene || !Array.isArray(g.scene.scenes)) return [];
    return g.scene.scenes;
  }

  function aplicar(d) {
    if (!d || typeof d !== 'object') return;
    var st = {};
    var origen = d.stats && typeof d.stats === 'object' ? d.stats : {};
    STATS.forEach(function (k) {
      var v = Number(origen[k]);
      if (origen[k] !== undefined && origen[k] !== null && Number.isFinite(v) && v >= 0) st[k] = Math.round(v);
    });
    var claves = Object.keys(st);

    if (claves.length) {
      if (!global.playerStats) global.playerStats = { invoiceIds: {} };
      claves.forEach(function (k) { global.playerStats[k] = st[k]; });
    }

    escenas().forEach(function (s) {
      if (!s || !s.sys) return;
      // Lo pendiente de enviar ya no vale: el administrador fijó otro valor.
      var sync = s.statsSync;
      if (sync && sync._pending) claves.forEach(function (k) { delete sync._pending[k]; });

      claves.forEach(function (k) {
        var campo = CAMPO[k];
        if (campo && Object.prototype.hasOwnProperty.call(s, campo)) s[campo] = st[k];
      });
      if (st.exp !== undefined && Object.prototype.hasOwnProperty.call(s, 'nivel_exp')) {
        s.nivel_exp = st.exp;
        // Así _syncExp no cree que hay algo nuevo que mandar.
        s._lastExpSynced = st.exp;
        try { if (typeof s._nivelDesdeExp === 'function') s._nivelDesdeExp(); } catch (e) {}
      }
      if (d.pet && typeof s._aplicarNivelMascota === 'function') {
        try { s._aplicarNivelMascota(d.pet); } catch (e) {}
      }
      if (claves.some(function (k) { return k === 'vida' || k === 'agua' || k === 'comida'; })) {
        try { if (typeof s._refreshBarrasUI === 'function') s._refreshBarrasUI(); } catch (e) {}
      }
    });

    // El bronce (y con él oro y plata del HUD) lo pinta gf-bronce.js.
    try {
      if (global.GFBronce && typeof global.GFBronce.adoptarStats === 'function' &&
          (st.bronce !== undefined || st.oro !== undefined || st.plata !== undefined)) {
        global.GFBronce.adoptarStats(st);
      }
    } catch (e) {}

    if (claves.length || d.pet) {
      console.log('🛠️  [admin] valores actualizados por un administrador:', st, d.pet ? { petLevel: d.pet.petLevel } : '');
      var activa = escenas().filter(function (s) { return s && s.sys && s.sys.isActive && s.sys.isActive() && s.notifications; })[0];
      try { if (activa) activa.notifications.show('An administrator updated your character.', 'info'); } catch (e) {}
    }
  }

  function enlazar() {
    var s = global.globalSocket || null;
    if (!s || s === socket) return;
    if (socket && oyente) { try { socket.off('admin:ajuste', oyente); } catch (e) {} }
    socket = s;
    oyente = function (d) {
      try { aplicar(d); } catch (e) { console.warn('[admin-ajuste]', e); }
    };
    s.on('admin:ajuste', oyente);
  }

  setInterval(enlazar, 1000);
  enlazar();

  global.GFAdminAjuste = { aplicar: aplicar };
})(window);
