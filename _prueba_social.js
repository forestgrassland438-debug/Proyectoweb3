/* =============================================================================
 * EL SOCKET DE MENTIRA DEL BANCO DE PRUEBAS  (_prueba_social.html)
 * =============================================================================
 *
 * Contesta a los mismos eventos que el servidor de verdad y con la misma forma
 * de datos, para poder mirar y tocar el panel de amistades, las reacciones del
 * chat y la paleta del nombre sin arrancar nada.
 *
 * NO se toca ninguno de los tres módulos: se cargan tal cual están en el juego.
 * Si algo se ve mal aquí, se ve mal allí.
 *
 * Los nombres de los eventos NO se comprueban aquí (aquí podrían estar mal los
 * dos lados a la vez y nadie se enteraría): eso lo hace
 * `node tools/social-prueba.js`, que los saca del server2.js de verdad.
 * ========================================================================== */
(function () {
  'use strict';

  var log = document.getElementById('pb-log');
  function apuntar(txt) {
    var t = new Date().toLocaleTimeString();
    log.textContent += '[' + t + '] ' + txt + '\n';
    log.scrollTop = log.scrollHeight;
  }

  // ── Datos de mentira ──────────────────────────────────────────────────────
  var YO = { playerName: 'cuenta_yo', username: 'Kuro', nivel: 12, nameColor: null };

  var AMIGOS = [
    { playerName: 'c_ana',  username: 'Ana',     nivel: 18, nameColor: '#ff8fd0', online: true,  canal: 1 },
    { playerName: 'c_beto', username: 'Beto',    nivel: 7,  nameColor: null,      online: false, canal: null },
    { playerName: 'c_niko', username: 'Nikolas', nivel: 25, nameColor: '#4cc9f0', online: true,  canal: 3 }
  ];

  var ENTRANTES = [
    { playerName: 'c_lia', username: 'Lia', nivel: 4, nameColor: null, online: true, canal: 1,
      desde: new Date(Date.now() - 4 * 60000).toISOString() }
  ];

  var SALIENTES = [
    { playerName: 'c_omar', username: 'Omar', nivel: 9, nameColor: null, online: false, canal: null,
      desde: new Date(Date.now() - 3 * 3600000).toISOString() }
  ];

  var EN_CANAL = [
    { playerName: 'c_ana',  username: 'Ana',   nivel: 18, nameColor: '#ff8fd0', zona: 'world', esAmigo: true },
    { playerName: 'c_zoe',  username: 'Zoe',   nivel: 31, nameColor: '#ffd166', zona: 'shop',  esAmigo: false },
    { playerName: 'c_theo', username: 'Theo',  nivel: 2,  nameColor: null,      zona: 'world', esAmigo: false }
  ];

  var CONVERSACION = [
    { id: 'm1', de: 'c_ana', para: 'cuenta_yo', deNombre: 'Ana',
      texto: 'are you farming today?', ts: new Date(Date.now() - 900000).toISOString() },
    { id: 'm2', de: 'cuenta_yo', para: 'c_ana', deNombre: 'Kuro',
      texto: 'yes! meet me at the well', ts: new Date(Date.now() - 840000).toISOString() }
  ];

  var noLeidos = 1;

  function estado() {
    return {
      ok: true, yo: YO,
      amigos: AMIGOS.slice(),
      entrantes: ENTRANTES.slice(),
      salientes: SALIENTES.slice(),
      noLeidos: noLeidos,
      limpiezaDM: 0
    };
  }

  // ── El socket ─────────────────────────────────────────────────────────────
  //
  // Solo `on`, `emit` y `connected`, que es todo lo que usan los módulos.
  function SocketFalso() {
    this.id = 'socket_de_mentira';
    this.connected = true;
    this._oyentes = {};
  }
  SocketFalso.prototype.on = function (evento, fn) {
    (this._oyentes[evento] = this._oyentes[evento] || []).push(fn);
    return this;
  };
  SocketFalso.prototype.off = function (evento, fn) {
    var l = this._oyentes[evento];
    if (!l) return this;
    this._oyentes[evento] = l.filter(function (f) { return f !== fn; });
    return this;
  };
  /** Como si llegara del servidor. */
  SocketFalso.prototype.recibir = function (evento, datos) {
    (this._oyentes[evento] || []).forEach(function (f) {
      try { f(datos); } catch (e) { apuntar('EXPLOTÓ el oyente de ' + evento + ': ' + e.message); }
    });
  };
  /** Lo que el cliente MANDA. Se apunta y se contesta como el servidor. */
  SocketFalso.prototype.emit = function (evento, datos) {
    apuntar('→ ' + evento + '  ' + (datos ? JSON.stringify(datos) : ''));
    var s = this;

    if (evento === 'friends:state') {
      setTimeout(function () { s.recibir('friends:state', estado()); }, 60);
    }

    if (evento === 'friends:online') {
      setTimeout(function () {
        s.recibir('friends:online', {
          ok: true, canal: 1,
          jugadores: EN_CANAL.map(function (j) {
            return Object.assign({ online: true, canal: 1, pendiente: false, tePidio: false }, j);
          })
        });
      }, 60);
    }

    if (evento === 'friends:search') {
      var q = String((datos && datos.q) || '').toLowerCase();
      var todos = AMIGOS.concat(EN_CANAL).concat([
        { playerName: 'c_andy', username: 'Andrea', nivel: 15, nameColor: '#3ddc84', online: false }
      ]);
      var vistos = {};
      var hallados = todos.filter(function (j) {
        if (vistos[j.playerName]) return false;
        vistos[j.playerName] = 1;
        return j.username.toLowerCase().indexOf(q) === 0;
      }).map(function (j) {
        return Object.assign({ online: !!j.online, canal: j.canal || null,
                               pendiente: false, tePidio: false,
                               esAmigo: AMIGOS.some(function (a) { return a.playerName === j.playerName; }) }, j);
      });
      setTimeout(function () {
        s.recibir('friends:search', { ok: true, q: datos.q, jugadores: hallados });
      }, 80);
    }

    if (evento === 'friends:request') {
      setTimeout(function () {
        s.recibir('friends:ok', { que: 'enviada', nombre: datos.nombre });
      }, 80);
    }

    if (evento === 'friends:accept') {
      var i = ENTRANTES.findIndex(function (e) { return e.playerName === datos.playerName; });
      if (i >= 0) AMIGOS.push(ENTRANTES.splice(i, 1)[0]);
      setTimeout(function () { s.recibir('friends:ok', { que: 'aceptada' }); }, 80);
    }

    if (evento === 'friends:reject') {
      var j1 = ENTRANTES.findIndex(function (e) { return e.playerName === datos.playerName; });
      if (j1 >= 0) ENTRANTES.splice(j1, 1);
      var j2 = SALIENTES.findIndex(function (e) { return e.playerName === datos.playerName; });
      if (j2 >= 0) SALIENTES.splice(j2, 1);
      setTimeout(function () { s.recibir('friends:ok', { que: 'rechazada' }); }, 80);
    }

    if (evento === 'friends:remove') {
      var k = AMIGOS.findIndex(function (a) { return a.playerName === datos.playerName; });
      if (k >= 0) AMIGOS.splice(k, 1);
      setTimeout(function () { s.recibir('friends:ok', { que: 'eliminada' }); }, 80);
    }

    if (evento === 'friends:inbox') {
      setTimeout(function () {
        s.recibir('friends:inbox', {
          ok: true,
          conversaciones: [
            { playerName: 'c_ana', username: 'Ana', nivel: 18, nameColor: '#ff8fd0',
              online: true, ultimo: 'yes! meet me at the well', mio: true,
              ts: new Date(Date.now() - 840000).toISOString(), noLeidos: noLeidos },
            { playerName: 'c_beto', username: 'Beto', nivel: 7, nameColor: null,
              online: false, ultimo: 'see you tomorrow', mio: false,
              ts: new Date(Date.now() - 86400000).toISOString(), noLeidos: 0 }
          ]
        });
      }, 60);
    }

    if (evento === 'friends:dm:history') {
      noLeidos = 0;
      setTimeout(function () {
        s.recibir('friends:dm:history', {
          ok: true, con: datos.con,
          ficha: { playerName: datos.con, username: 'Ana', nivel: 18, nameColor: '#ff8fd0' },
          mensajes: CONVERSACION.slice()
        });
        s.recibir('friends:unread', { noLeidos: 0 });
      }, 70);
    }

    if (evento === 'friends:dm') {
      var m = { id: 'm' + Date.now(), de: 'cuenta_yo', para: datos.para,
                deNombre: 'Kuro', texto: datos.texto, ts: new Date().toISOString() };
      CONVERSACION.push(m);
      setTimeout(function () { s.recibir('friends:dm:sent', m); }, 90);
    }

    if (evento === 'friends:dm:react') {
      var m = CONVERSACION.filter(function (x) { return x.id === datos.id; })[0];
      if (!m) return;
      m.reacciones = m.reacciones || [];
      var g = m.reacciones.filter(function (r) { return r.emoji === datos.emoji; })[0];
      if (g && g.quienes.indexOf('cuenta_yo') >= 0) {
        g.quienes = g.quienes.filter(function (q) { return q !== 'cuenta_yo'; });
        if (!g.quienes.length) m.reacciones = m.reacciones.filter(function (r) { return r.emoji !== datos.emoji; });
      } else {
        if (!g) { g = { emoji: datos.emoji, quienes: [] }; m.reacciones.push(g); }
        g.quienes.push('cuenta_yo');
      }
      setTimeout(function () {
        s.recibir('friends:dm:reaccion', { id: m.id, reacciones: m.reacciones });
      }, 60);
    }

    if (evento === 'friends:dm:edit') {
      var me = CONVERSACION.filter(function (x) { return x.id === datos.id; })[0];
      if (!me) return;
      if (me.editado) {
        setTimeout(function () { s.recibir('friends:dm:editError', { motivo: 'ya_editado' }); }, 60);
        return;
      }
      me.texto = datos.texto; me.editado = true;
      setTimeout(function () {
        s.recibir('friends:dm:editado', { id: me.id, texto: me.texto, editado: true });
      }, 60);
    }

    if (evento === 'friends:dm:clear') {
      CONVERSACION.length = 0;
      setTimeout(function () { s.recibir('friends:dm:cleared', { con: datos.con }); }, 60);
    }

    if (evento === 'friends:dm:limpieza') {
      setTimeout(function () {
        s.recibir('friends:dm:limpieza', { ok: true, horas: datos.horas });
      }, 60);
    }

    if (evento === 'player:petNameColor') {
      setTimeout(function () {
        s.recibir('player:petNameColor', { ok: true, color: datos.color || null });
      }, 50);
    }

    if (evento === 'player:nameColor') {
      setTimeout(function () {
        s.recibir('player:nameColor', { ok: true, color: datos.color || null });
      }, 50);
    }

    if (evento === 'chatReact') {
      var linea = mensajes[datos.mid];
      if (!linea) return;
      linea.reacciones = linea.reacciones || [];
      var g = linea.reacciones.filter(function (r) { return r.emoji === datos.emoji; })[0];
      if (g && g.quienes.some(function (q) { return q.k === 'cuenta_yo'; })) {
        g.quienes = g.quienes.filter(function (q) { return q.k !== 'cuenta_yo'; });
        if (!g.quienes.length) {
          linea.reacciones = linea.reacciones.filter(function (r) { return r.emoji !== datos.emoji; });
        }
      } else {
        if (!g) { g = { emoji: datos.emoji, quienes: [] }; linea.reacciones.push(g); }
        g.quienes.push({ k: 'cuenta_yo', n: 'Kuro' });
      }
      setTimeout(function () {
        s.recibir('chatReaction', { mid: datos.mid, reacciones: linea.reacciones });
      }, 40);
    }

    if (evento === 'chatEdit') {
      var l2 = mensajes[datos.mid];
      if (!l2) return;
      if (l2.editado) {
        setTimeout(function () { s.recibir('chatEditError', { motivo: 'ya_editado' }); }, 40);
        return;
      }
      l2.text = datos.text;
      l2.editado = true;
      setTimeout(function () {
        s.recibir('chatEdited', { mid: datos.mid, text: datos.text, editado: true });
      }, 40);
    }
  };

  var socket = new SocketFalso();
  window.globalSocket = socket;

  // ── Escena de mentira ─────────────────────────────────────────────────────
  // Lo mínimo que miran los módulos: el nombre visible, el color y el socket.
  var escena = {
    Username: 'Kuro',
    nameColor: null,
    socket: socket,
    petName: 'Kuro Jr',
    /* El contenedor del chat, como en el juego: es de donde `podarChat` saca
       los renglones viejos cuando pasan del tope. */
    chatMessages: document.getElementById('chat-messages'),
    usuariox: {
      _color: '#ffffff',
      setColor: function (c) {
        this._color = c;
        apuntar('cartel del personaje → ' + c);
      }
    },
    dogNameText: {
      _color: '#ffffff',
      setColor: function (c) {
        this._color = c;
        apuntar('cartel de la mascota → ' + c);
      }
    },
    notifications: {
      show: function (texto, tipo) { apuntar('aviso (' + (tipo || 'info') + '): ' + texto); }
    },
    appendSystemMessage: function (t) { pintarSistema(t); },
    _socketVivo: function () { return socket; }
  };

  // ── El chat de mentira ────────────────────────────────────────────────────
  var mensajes = {};          // mid -> el mensaje, como el anillo del servidor
  var contador = 0;

  function pintarMensaje(msg) {
    mensajes[msg.mid] = msg;
    var caja = document.getElementById('chat-messages');
    var linea = document.createElement('div');
    linea.className = 'chat-line';

    var strong = document.createElement('strong');
    strong.textContent = msg.playerName + (msg.id === socket.id ? ' (you):' : ':');
    strong.style.color = '#b3ffb3';

    var texto = document.createElement('span');
    texto.className = 'chat-text';
    texto.textContent = ' ' + msg.text;

    var hora = document.createElement('span');
    hora.className = 'chat-time';
    hora.textContent = new Date(msg.ts).toLocaleTimeString();

    linea.appendChild(strong);
    linea.appendChild(texto);
    linea.appendChild(hora);

    window.GFChatSocial.decorar(escena, msg, linea, strong, texto);

    caja.appendChild(linea);
    caja.scrollTop = caja.scrollHeight;
  }

  function pintarSistema(t) {
    var caja = document.getElementById('chat-messages');
    var l = document.createElement('div');
    l.className = 'chat-line';
    l.style.color = '#ffb3b3';
    l.textContent = t;
    caja.appendChild(l);
    caja.scrollTop = caja.scrollHeight;
  }

  function nuevoMensaje(mio, texto, color) {
    contador++;
    return {
      id: mio ? socket.id : ('otro_' + contador),
      mid: 'm' + contador,
      playerName: mio ? 'Kuro' : 'Ana',
      nameColor: color || null,
      text: texto,
      ts: new Date().toISOString(),
      editado: false,
      reacciones: []
    };
  }

  // ── Montaje ───────────────────────────────────────────────────────────────
  window.GFAmigos.montar(escena);
  window.GFChatSocial.montar(escena);
  window.GFNombreColor.montar(escena);

  pintarMensaje(nuevoMensaje(false, 'anyone selling iron ore?', '#ff8fd0'));
  pintarMensaje(nuevoMensaje(true, 'i have three stacks', null));

  // ── Botones del banco ─────────────────────────────────────────────────────
  document.getElementById('pb-abrir').onclick = function () {
    window.GFAmigos.abrir('friends');
  };

  document.getElementById('pb-solicitud').onclick = function () {
    ENTRANTES.push({
      playerName: 'c_new' + Date.now(), username: 'Player' + (ENTRANTES.length + 1),
      nivel: 3 + ENTRANTES.length, nameColor: null, online: true, canal: 1,
      desde: new Date().toISOString()
    });
    socket.recibir('friends:request:new', { de: ENTRANTES[ENTRANTES.length - 1] });
  };

  document.getElementById('pb-privado').onclick = function () {
    noLeidos++;
    var m = { id: 'p' + Date.now(), de: 'c_ana', para: 'cuenta_yo', deNombre: 'Ana',
              texto: 'the well is full again', ts: new Date().toISOString() };
    CONVERSACION.push(m);
    socket.recibir('friends:dm', m);
  };

  document.getElementById('pb-menu').onclick = function (ev) {
    window.GFAmigos.menuJugador(escena,
      { _playerName: 'c_zoe', _displayName: 'Zoe' }, ev);
  };

  document.getElementById('pb-msg-mio').onclick = function () {
    pintarMensaje(nuevoMensaje(true, 'my message number ' + (contador + 1), null));
  };

  document.getElementById('pb-msg-otro').onclick = function () {
    pintarMensaje(nuevoMensaje(false, 'hello from another player', '#4cc9f0'));
  };

  document.getElementById('pb-comando').onclick = function () {
    var era = window.GFChatSocial.comando(escena, '/add_friend "Ana"');
    apuntar('comando /add_friend → ' + (era ? 'INTERCEPTADO (no sale por el chat)'
                                            : 'NO reconocido (saldría por el chat)'));
  };

  // ── El aviso del botón del chat ──────────────────────────────────────────
  var panelChat = document.getElementById('chat-panel');
  var botonChat = document.getElementById('open-chat-btn');

  function pintarEstadoChat() {
    var abierto = !panelChat.classList.contains('chat-hidden');
    document.getElementById('pb-estado-chat').textContent = abierto ? 'ABIERTO' : 'cerrado';
    document.getElementById('pb-estado-aviso').textContent =
      botonChat.classList.contains('gfcs-titila') ? 'SÍ' : 'no';
  }
  setInterval(pintarEstadoChat, 250);

  // Se abre y se cierra igual que en el juego: quitando o poniendo la clase.
  botonChat.addEventListener('click', function () {
    panelChat.classList.toggle('chat-hidden');
  });
  document.getElementById('pb-abrir-chat').onclick = function () {
    panelChat.classList.toggle('chat-hidden');
  };

  document.getElementById('pb-llega-cerrado').onclick = function () {
    var m = nuevoMensaje(false, 'hey, are you there?', '#ff8fd0');
    pintarMensaje(m);
    socket.recibir('chatMessage', m);     // como si llegara del servidor
    apuntar('llega un mensaje de otro (chat ' +
            (panelChat.classList.contains('chat-hidden') ? 'cerrado' : 'abierto') + ')');
  };

  document.getElementById('pb-llega-mio').onclick = function () {
    var m = nuevoMensaje(true, 'this one is mine', null);
    pintarMensaje(m);
    socket.recibir('chatMessage', m);
    apuntar('llega un mensaje MÍO: el botón no debe titilar');
  };

  document.getElementById('pb-limpiar').onclick = function () { log.textContent = ''; };

  apuntar('listo — módulos montados con el socket de mentira');
})();
