/* =============================================================================
 * GF CANALES — 10 copias del mundo, 50 jugadores cada una
 * =============================================================================
 *
 * QUÉ HACE
 * --------
 * Dos jugadores solo se ven, se hablan por el chat y salen en la clasificación
 * del otro si están en el MISMO canal. Hay 10 canales de 50 plazas.
 *
 * CUÁNDO SE ASIGNA EL CANAL: una sola vez, cuando el socket se conecta — y lo
 * decide el SERVIDOR, que es el único que sabe cuánta gente hay en cada uno.
 * El servidor manda 'canalAsignado' y este módulo se limita a recordarlo.
 *
 * POR QUÉ NO SE HACE AL CARGAR CADA ESCENA: si el canal se pidiera en
 * LoadingScenegame, al pasar del mapa a la tienda se volvería a pedir, y si tu
 * canal se hubiera llenado entretanto acabarías en otro distinto — perdiendo de
 * vista a la gente con la que estabas jugando. Como window.globalSocket se crea
 * UNA vez por pestaña y sobrevive a los cambios de escena, el canal dura toda
 * la sesión sin que haya que hacer nada más.
 *
 * DÓNDE SE GUARDA: en memoria y nada más. NO se escribe en localStorage ni en
 * sessionStorage: el canal es un dato del momento, no una preferencia. Al
 * recargar la página se pide uno nuevo, que es lo correcto.
 *
 * CÓMO LLEGA A LA SALA: el cliente sigue pidiendo 'game' o 'tienda' como toda
 * la vida; el servidor le añade el canal ('game#c3'). Aquí no se compone ningún
 * nombre de sala a propósito: si el número de canal viajara desde el cliente,
 * cualquiera podría colarse en el canal que quisiera.
 * ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;

  // ── Estado (solo en memoria) ──────────────────────────────────────────────
  var canal    = null;   // número de canal actual, 1..10
  var total    = 10;
  var cupo     = 50;
  var canales  = [];     // [{canal, jugadores, cupo, lleno}, …]
  var socket   = null;
  var enlazado = false;

  function log() {
    try { console.log.apply(console, ['[GFCanales]'].concat([].slice.call(arguments))); }
    catch (e) {}
  }

  // ── Enganche con el socket ────────────────────────────────────────────────
  //
  // El socket lo crea la escena (window.globalSocket), así que este módulo no
  // puede suponer que ya existe al cargarse. Se vigila un rato hasta que
  // aparece y entonces se enlaza UNA sola vez.
  function enlazar() {
    var s = global.globalSocket;
    if (!s || enlazado) return enlazado;
    socket = s;
    enlazado = true;

    socket.on('canalAsignado', function (d) {
      if (!d) return;
      canal   = d.canal;
      total   = d.total || total;
      cupo    = d.cupo  || cupo;
      canales = d.canales || canales;
      log('canal asignado:', canal);
      avisar();
      pintar();
    });

    socket.on('canalesEstado', function (d) {
      if (!d) return;
      if (d.canal) canal = d.canal;
      total   = d.total || total;
      cupo    = d.cupo  || cupo;
      canales = d.canales || canales;
      pintar();
    });

    socket.on('canalCambiado', function (d) {
      if (!d) return;
      canal   = d.canal;
      canales = d.canales || canales;
      log('cambiado al canal', canal);
      // El servidor nos sacó de la sala vieja; hay que volver a entrar, ya en
      // el canal nuevo. Se le pide a la escena viva que rehaga su join en vez
      // de componer aquí el nombre de la sala.
      rejoinEscenaViva();
      avisar();
      pintar();
    });

    socket.on('canalError', function (d) {
      var motivo = (d && d.motivo) || 'error';
      if (d && d.canales) canales = d.canales;
      mensaje(motivo === 'lleno'
        ? 'That channel is full. Pick another one.'
        : 'Could not change channel. Try again.');
      pintar();
    });

    // Al reconectar, el servidor asigna canal de nuevo y manda 'canalAsignado'.
    log('enlazado al socket');
    return true;
  }

  /** Avisa a quien quiera enterarse (por ejemplo el HUD). */
  function avisar() {
    try {
      global.dispatchEvent(new CustomEvent('gf-canal-cambiado', { detail: { canal: canal } }));
    } catch (e) {}
  }

  /**
   * Escena de Phaser viva con sesión. Mismo resolutor que usan
   * gf-graphics-settings y gf-soulbound: no se duplica la lógica de a qué
   * juego/escena hablar.
   */
  function escenaViva() {
    try {
      var juego = global.game || (global.phaserScaler && global.phaserScaler.game) || null;
      if (!juego || !juego.scene || typeof juego.scene.getScenes !== 'function') return null;
      var escenas = juego.scene.getScenes(true) || [];
      for (var i = 0; i < escenas.length; i++) {
        var e = escenas[i];
        if (e && typeof e.joinRoom === 'function' && e.socket) return e;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Vuelve a entrar en la sala tras cambiar de canal.
   * `currentRoom` se limpia primero porque joinRoom() ignora la petición si
   * cree que ya estás en esa sala (tiene un cooldown antirrebote), y desde su
   * punto de vista el nombre no ha cambiado: sigue siendo 'game'.
   */
  function rejoinEscenaViva() {
    var esc = escenaViva();
    if (!esc) return;
    try {
      esc.currentRoom  = null;
      esc.lastJoinTime = 0;
      if (typeof esc.clearOtherPlayers === 'function') esc.clearOtherPlayers();
      var sala = (esc.scene && esc.scene.key === 'tiendajuego') ? 'tienda' : 'game';
      esc.joinRoom(sala);
    } catch (e) { log('no se pudo rehacer el join:', e); }
  }

  // ── Panel del dashboard ───────────────────────────────────────────────────
  function pedirEstado() {
    if (socket && socket.connected) socket.emit('canalesEstado');
  }

  function mensaje(txt) {
    var el = doc.getElementById('gfc-msg');
    if (!el) return;
    el.textContent = txt || '';
    el.style.display = txt ? 'block' : 'none';
  }

  /** Pinta la lista de canales. Se puede llamar tantas veces como haga falta. */
  function pintar() {
    var lista = doc.getElementById('gfc-lista');
    var actualEl = doc.getElementById('gfc-actual');
    if (!lista) return;

    if (actualEl) {
      actualEl.textContent = canal ? ('Channel ' + canal) : 'Connecting…';
    }

    if (!canales.length) {
      lista.textContent = '';
      var esperando = doc.createElement('div');
      esperando.className = 'gfc-vacio';
      esperando.textContent = 'Loading channels…';
      lista.appendChild(esperando);
      return;
    }

    lista.textContent = '';
    canales.forEach(function (c) {
      var fila = doc.createElement('button');
      fila.type = 'button';
      fila.className = 'gfc-fila';
      if (c.canal === canal) fila.classList.add('gfc-activo');
      if (c.lleno && c.canal !== canal) fila.classList.add('gfc-lleno');

      var nombre = doc.createElement('span');
      nombre.className = 'gfc-nombre';
      nombre.textContent = 'Channel ' + c.canal;

      var barra = doc.createElement('span');
      barra.className = 'gfc-barra';
      var relleno = doc.createElement('span');
      relleno.className = 'gfc-relleno';
      relleno.style.width = Math.min(100, (c.jugadores / c.cupo) * 100) + '%';
      barra.appendChild(relleno);

      var cuenta = doc.createElement('span');
      cuenta.className = 'gfc-cuenta';
      cuenta.textContent = c.jugadores + '/' + c.cupo;

      fila.appendChild(nombre);
      fila.appendChild(barra);
      fila.appendChild(cuenta);

      if (c.canal === canal) {
        var aqui = doc.createElement('span');
        aqui.className = 'gfc-aqui';
        aqui.textContent = 'You are here';
        fila.appendChild(aqui);
      }

      fila.onclick = function () { cambiar(c.canal); };
      lista.appendChild(fila);
    });
  }

  /** Abre/actualiza el panel. La llama gf-wallet-dashboard al pulsar la pestaña. */
  function montarPanel() {
    enlazar();
    var btn = doc.getElementById('gfc-refrescar');
    if (btn && !btn._gfcEnlazado) {
      btn._gfcEnlazado = true;
      btn.onclick = function () { mensaje(''); pedirEstado(); };
    }
    pintar();
    mensaje('');
    pedirEstado();     // números frescos cada vez que se abre
  }

  function cambiar(destino) {
    if (!socket || !socket.connected) { mensaje('Not connected.'); return; }
    if (destino === canal) return;
    mensaje('');
    socket.emit('canalCambiar', { canal: destino });
  }

  // ── API ───────────────────────────────────────────────────────────────────
  global.GFCanales = {
    actual:      function () { return canal; },
    total:       function () { return total; },
    cupo:        function () { return cupo; },
    lista:       function () { return canales.slice(); },
    montarPanel: montarPanel,
    refrescar:   pedirEstado,
    cambiar:     cambiar
  };

  // El socket lo crea la escena, que arranca después que este script. Se vigila
  // hasta que aparezca y luego se deja de insistir.
  var intentos = 0;
  var reloj = setInterval(function () {
    if (enlazar() || ++intentos > 100) clearInterval(reloj);
  }, 300);

})(window);
