/* =============================================================================
 * GF AMIGOS — amistades, quién está conectado y mensajes privados
 * =============================================================================
 *
 * QUÉ HACE
 * ---------------------------------------------------------------------------
 * El botón redondo con las dos siluetas y el "+", justo debajo de Mail. Abre un
 * panel con cuatro apartados:
 *
 *   Friends    tus amigos, con su nivel y si están jugando ahora mismo
 *   Online     quién hay conectado EN TU CANAL, con su nivel, para agregarlo
 *   Requests   las solicitudes que te han mandado: aceptar, borrar o escribir
 *   Messages   los privados; los que llegan estando desconectado te esperan
 *
 * Y un buscador arriba: escribes un nombre y lo agregas, esté en el canal que
 * esté.
 *
 * POR QUÉ LAS AMISTADES NO SON DEL CANAL
 * ---------------------------------------------------------------------------
 * El mundo está partido en 10 canales de 50 jugadores (ver gf-canales.js). Eso
 * está bien para el mapa, pero para los amigos sería una cárcel: si tu amigo
 * está en el canal 4 y tú en el 1, hoy no existe para ti. Aquí la amistad es de
 * la CUENTA: le escribes desde donde estés, y si no está conectado el mensaje
 * le espera hasta que entre.
 *
 * DOS ESCENAS, UN SOLO PANEL
 * ---------------------------------------------------------------------------
 * GameScene y tiendajuego son escenas distintas de Phaser, pero el HUD es DOM
 * de la página y sobrevive al cambio. Así que el panel se construye UNA vez y
 * las dos escenas se limitan a llamar a `montar(this)`, que reengancha el botón
 * a la escena viva. Es el mismo patrón que usa el resto del HUD: los manejadores
 * se REEMPLAZAN, nunca se suman, para que un viaje al mapa y vuelta no acabe
 * abriendo el panel dos veces por clic.
 *
 * EL SOCKET NO ES DE ESTE MÓDULO
 * ---------------------------------------------------------------------------
 * `window.globalSocket` lo crea la escena y se comparte con el chat, el
 * movimiento y las batallas. Aquí solo se escucha, y se comprueba en cada
 * vuelta si el socket ha cambiado (una reconexión lo sustituye): sin esa
 * comprobación este módulo se quedaría hablando con un socket muerto y el panel
 * no volvería a enterarse de nada. Es el mismo cuidado que ya tienen
 * gf-canales.js y gf-clima.js, y por el mismo motivo.
 *
 * TODO EL TEXTO QUE VE EL JUGADOR ESTÁ EN INGLÉS. Los comentarios, no.
 *
 * API
 * ---------------------------------------------------------------------------
 *   GFAmigos.montar(scene) / desmontar(scene)
 *   GFAmigos.abrir(pestaña)          'friends' | 'online' | 'requests' | 'messages'
 *   GFAmigos.cerrar()
 *   GFAmigos.pedirAmistad(nombre)    lo usan /add_friend y el menú de jugador
 *   GFAmigos.abrirChatCon(playerName, nombreVisible)
 *   GFAmigos.esAmigo(playerName)
 *   GFAmigos.miNombre()              el Username visible de quien juega
 *   GFAmigos.aviso(texto, tipo)
 * ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;

  var socket   = null;
  var escena   = null;
  var listo    = false;      // el DOM ya está construido
  var abierto  = false;
  var pestana  = 'friends';
  var chatCon  = null;       // playerName de la conversación abierta
  var chatFicha = null;

  var estado = { yo: null, amigos: [], entrantes: [], salientes: [], noLeidos: 0 };
  var enLinea = { canal: null, jugadores: [] };
  var buscados = null;       // null = no se ha buscado nada
  var bandeja = [];
  var conversacion = [];

  function log() {
    try { console.log.apply(console, ['[GFAmigos]'].concat([].slice.call(arguments))); }
    catch (e) {}
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  /** Un elemento con clase y texto. El texto SIEMPRE por textContent. */
  function el(tag, clase, texto) {
    var n = doc.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /**
   * Deshace el escapado del servidor.
   *
   * El backend pasa los nombres y los mensajes privados por escapeHtml() antes
   * de guardarlos, así que llegan con &amp; y &#039;. Aquí todo se pinta con
   * textContent —que ya es seguro por sí mismo— y sin deshacer el escapado el
   * jugador vería literalmente "&#039;" en vez de un apóstrofo. Se hace con
   * reemplazos explícitos y NUNCA con innerHTML: interpretar HTML aquí volvería
   * a abrir justo el agujero que el escapado del servidor cierra.
   */
  function desescapar(t) {
    return String(t == null ? '' : t)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/g, '&');   // el último, o se re-expandirían los demás
  }

  /** '#rrggbb' válido, o null. El color de otro jugador nunca se pinta a ciegas. */
  function colorSeguro(c) {
    return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : null;
  }

  /** "5 min ago", "2 h ago", "3 d ago". */
  function hace(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function hora(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  /**
   * Un aviso corto. Se apoya en el sistema de notificaciones de la escena si lo
   * hay; si no, en una barra propia. No se usa `alert()` en ninguna parte: en
   * el móvil bloquea el juego entero y en el PC roba el foco al chat.
   */
  function aviso(texto, tipo) {
    try {
      if (escena && escena.notifications && typeof escena.notifications.show === 'function') {
        escena.notifications.show(texto, tipo || 'info');
        return;
      }
    } catch (e) {}
    var caja = doc.getElementById('gfa-aviso');
    if (!caja) {
      caja = el('div', 'gfa-aviso');
      caja.id = 'gfa-aviso';
      doc.body.appendChild(caja);
    }
    caja.textContent = texto;
    caja.className = 'gfa-aviso ' + (tipo === 'error' ? 'err' : (tipo === 'success' ? 'ok' : ''));
    caja.classList.add('ver');
    clearTimeout(caja._gfaTimer);
    caja._gfaTimer = setTimeout(function () { caja.classList.remove('ver'); }, 3200);
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  //
  // Van aquí y no en styless.css a propósito: así el módulo es una sola pieza y
  // no puede quedarse a medias si alguien mueve el CSS. La paleta está copiada
  // del panel de notificaciones para que los dos se vean como el mismo juego.
  function estilos() {
    if (doc.getElementById('gfa-estilos')) return;
    var s = doc.createElement('style');
    s.id = 'gfa-estilos';
    s.textContent = [
      '#gfa-panel{position:fixed;inset:0;background:rgba(0,10,30,0.78);display:none;',
      '  justify-content:center;align-items:center;z-index:10006;',
      '  font-family:"Segoe UI",system-ui,sans-serif;}',
      '#gfa-panel.abierto{display:flex;}',
      '.gfa-caja{background:linear-gradient(160deg,#0a1628 0%,#0d2040 40%,#0a2550 100%);',
      '  border:1.5px solid rgba(64,160,255,0.35);border-radius:16px;',
      '  width:95%;max-width:460px;height:min(78vh,640px);display:flex;flex-direction:column;',
      '  box-shadow:0 0 0 1px rgba(64,160,255,0.18),0 8px 32px rgba(0,80,180,0.40);overflow:hidden;}',

      '.gfa-cab{display:flex;justify-content:space-between;align-items:center;',
      '  padding:13px 16px;border-bottom:1px solid rgba(64,160,255,0.20);flex-shrink:0;gap:8px;}',
      '.gfa-titulo{color:#a8d8ff;font-size:14px;font-weight:700;letter-spacing:1px;',
      '  text-shadow:0 0 10px rgba(64,160,255,0.5);display:flex;align-items:center;gap:8px;}',
      '.gfa-cerrar{background:rgba(64,160,255,0.12);border:1px solid rgba(64,160,255,0.30);',
      '  color:#a8d8ff;font-size:15px;cursor:pointer;width:30px;height:30px;border-radius:50%;',
      '  display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.gfa-cerrar:hover{background:rgba(64,160,255,0.28);}',

      '.gfa-tabs{display:flex;gap:4px;padding:8px 10px 0;flex-shrink:0;}',
      '.gfa-tab{flex:1;background:rgba(20,50,100,0.30);border:1px solid rgba(64,160,255,0.18);',
      '  border-bottom:none;border-radius:9px 9px 0 0;color:#7ec8ff;font-size:11px;font-weight:600;',
      '  padding:8px 4px;cursor:pointer;position:relative;white-space:nowrap;',
      '  display:flex;align-items:center;justify-content:center;gap:4px;}',
      '.gfa-tab.on{background:rgba(30,80,150,0.55);color:#dff0ff;border-color:rgba(64,160,255,0.45);}',
      '.gfa-tab .gfa-pip{background:#ff5470;color:#fff;border-radius:9px;font-size:9px;',
      '  min-width:16px;height:16px;padding:0 4px;display:flex;align-items:center;justify-content:center;}',

      '.gfa-buscar{display:flex;gap:6px;padding:10px 12px 6px;flex-shrink:0;}',
      '.gfa-buscar input{flex:1;min-width:0;background:rgba(6,16,34,0.85);',
      '  border:1px solid rgba(64,160,255,0.25);border-radius:8px;color:#dff0ff;',
      '  font-size:12px;padding:8px 10px;outline:none;}',
      '.gfa-buscar input:focus{border-color:rgba(64,160,255,0.55);}',
      '.gfa-btn{background:rgba(64,160,255,0.15);border:1px solid rgba(64,160,255,0.35);',
      '  color:#a8d8ff;border-radius:8px;padding:7px 11px;font-size:11px;font-weight:600;',
      '  cursor:pointer;white-space:nowrap;transition:background .15s;}',
      '.gfa-btn:hover{background:rgba(64,160,255,0.30);}',
      '.gfa-btn:disabled{opacity:.45;cursor:default;}',
      '.gfa-btn.ok{background:rgba(40,170,110,0.20);border-color:rgba(60,220,150,0.40);color:#9df3c8;}',
      '.gfa-btn.ok:hover{background:rgba(40,170,110,0.38);}',
      '.gfa-btn.mal{background:rgba(190,60,80,0.18);border-color:rgba(255,110,130,0.38);color:#ffc0cc;}',
      '.gfa-btn.mal:hover{background:rgba(190,60,80,0.34);}',

      '.gfa-lista{overflow-y:auto;padding:8px 12px 12px;flex:1;display:flex;',
      '  flex-direction:column;gap:7px;-webkit-overflow-scrolling:touch;}',
      '.gfa-vacio{text-align:center;color:rgba(100,180,255,0.45);font-size:12px;padding:26px 10px;line-height:1.6;}',
      '.gfa-seccion{color:rgba(120,190,255,0.65);font-size:10px;font-weight:700;',
      '  letter-spacing:1px;text-transform:uppercase;margin:6px 2px 0;}',

      '.gfa-fila{background:rgba(20,50,100,0.35);border:1px solid rgba(64,160,255,0.18);',
      '  border-radius:10px;padding:9px 11px;display:flex;gap:9px;align-items:center;}',
      '.gfa-fila.nuevo{border-color:rgba(255,120,150,0.45);background:rgba(70,25,45,0.35);}',
      '.gfa-punto{width:9px;height:9px;border-radius:50%;flex-shrink:0;',
      '  background:#4a5a70;box-shadow:none;}',
      '.gfa-punto.on{background:#3ddc84;box-shadow:0 0 8px rgba(61,220,132,0.8);}',
      '.gfa-datos{flex:1;min-width:0;}',
      '.gfa-nombre{font-size:12px;font-weight:700;color:#dff0ff;white-space:nowrap;',
      '  overflow:hidden;text-overflow:ellipsis;}',
      '.gfa-sub{font-size:10px;color:rgba(140,200,255,0.62);margin-top:2px;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.gfa-acciones{display:flex;gap:5px;flex-shrink:0;}',
      '.gfa-mini{background:rgba(64,160,255,0.14);border:1px solid rgba(64,160,255,0.30);',
      '  color:#a8d8ff;border-radius:7px;width:30px;height:30px;font-size:13px;cursor:pointer;',
      '  display:flex;align-items:center;justify-content:center;padding:0;}',
      '.gfa-mini:hover{background:rgba(64,160,255,0.30);}',
      '.gfa-mini.ok{border-color:rgba(60,220,150,0.40);color:#9df3c8;}',
      '.gfa-mini.mal{border-color:rgba(255,110,130,0.38);color:#ffc0cc;}',

      /* Conversación */
      '.gfa-chat{flex:1;display:flex;flex-direction:column;min-height:0;}',
      '.gfa-chat-cab{display:flex;align-items:center;gap:8px;padding:8px 12px;',
      '  border-bottom:1px solid rgba(64,160,255,0.18);flex-shrink:0;}',
      '.gfa-chat-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;',
      '  flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;}',
      '.gfa-burbuja{max-width:80%;padding:7px 10px;border-radius:12px;font-size:12px;',
      '  line-height:1.45;word-break:break-word;}',
      '.gfa-burbuja.mia{align-self:flex-end;background:rgba(40,110,200,0.42);color:#eaf5ff;',
      '  border:1px solid rgba(90,180,255,0.35);border-bottom-right-radius:4px;}',
      '.gfa-burbuja.suya{align-self:flex-start;background:rgba(20,50,100,0.55);color:#d6ecff;',
      '  border:1px solid rgba(64,160,255,0.22);border-bottom-left-radius:4px;}',
      '.gfa-burbuja .t{display:block;font-size:9px;opacity:.55;margin-top:3px;text-align:right;}',
      '.gfa-chat-fila{display:flex;gap:6px;padding:9px 12px;border-top:1px solid rgba(64,160,255,0.18);',
      '  flex-shrink:0;}',
      '.gfa-chat-fila input{flex:1;min-width:0;background:rgba(6,16,34,0.85);',
      '  border:1px solid rgba(64,160,255,0.25);border-radius:8px;color:#dff0ff;',
      '  font-size:12px;padding:8px 10px;outline:none;}',

      /* Chapa del botón redondo */
      '#friends-btn .gfa-chapa{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;',
      '  padding:0 4px;background:#ff5470;color:#fff;border-radius:9px;font-size:10px;',
      '  font-weight:700;display:none;align-items:center;justify-content:center;',
      '  box-shadow:0 0 8px rgba(255,84,112,0.7);pointer-events:none;z-index:3;}',
      '#friends-btn .gfa-chapa.ver{display:flex;}',

      /* Aviso propio, por si la escena no tiene notificaciones */
      '.gfa-aviso{position:fixed;left:50%;transform:translate(-50%,-14px);top:14px;',
      '  background:rgba(10,25,55,0.96);border:1px solid rgba(64,160,255,0.4);color:#dff0ff;',
      '  padding:9px 16px;border-radius:10px;font-size:12px;z-index:10020;opacity:0;',
      '  pointer-events:none;transition:opacity .2s,transform .2s;max-width:86vw;text-align:center;}',
      '.gfa-aviso.ver{opacity:1;transform:translate(-50%,0);}',
      '.gfa-aviso.err{border-color:rgba(255,110,130,0.6);color:#ffd2da;}',
      '.gfa-aviso.ok{border-color:rgba(60,220,150,0.6);color:#c6f7e0;}',

      /* Móvil: el panel ocupa la pantalla y las pestañas se aprietan */
      '@media (max-width:560px){',
      '  .gfa-caja{width:100%;height:100%;max-width:none;border-radius:0;border:none;}',
      '  .gfa-tab{font-size:10px;padding:9px 2px;}',
      '  .gfa-mini{width:34px;height:34px;font-size:15px;}',
      '  .gfa-fila{padding:11px;}',
      '}',
      /* Con el teclado del móvil abierto el panel se encoge en vez de irse
         debajo. --gf-teclado la mantiene GameScene (ver _seguirTecladoMovil). */
      'html.gf-teclado-abierto .gfa-caja{height:calc(100% - var(--gf-teclado,0px));}'
    ].join('\n');
    doc.head.appendChild(s);
  }

  // ── El DOM del panel ──────────────────────────────────────────────────────

  var nodos = {};

  function construir() {
    if (listo) return;
    estilos();

    var panel = el('div');
    panel.id = 'gfa-panel';

    var caja = el('div', 'gfa-caja');

    // Cabecera
    var cab = el('div', 'gfa-cab');
    var tit = el('div', 'gfa-titulo');
    tit.appendChild(el('span', null, '👥'));
    tit.appendChild(el('span', null, 'Friends'));
    var cerrar = el('button', 'gfa-cerrar', '✕');
    cerrar.type = 'button';
    cerrar.id = 'gfa-cerrar';
    cerrar.setAttribute('aria-label', 'Close friends panel');
    cerrar.addEventListener('click', function () { cerrarPanel(); });
    cab.appendChild(tit);
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    // Pestañas
    var tabs = el('div', 'gfa-tabs');
    tabs.id = 'gfa-tabs';
    [['friends', 'Friends'], ['online', 'Online'],
     ['requests', 'Requests'], ['messages', 'Messages']].forEach(function (p) {
      var b = el('button', 'gfa-tab');
      b.type = 'button';
      b.setAttribute('data-tab', p[0]);
      b.appendChild(el('span', null, p[1]));
      var pip = el('span', 'gfa-pip');
      pip.style.display = 'none';
      b.appendChild(pip);
      b.addEventListener('click', function () { irA(p[0]); });
      tabs.appendChild(b);
    });
    caja.appendChild(tabs);

    // Buscador (solo en Friends y Online)
    var buscar = el('div', 'gfa-buscar');
    buscar.id = 'gfa-buscar';
    var campo = el('input');
    campo.id = 'gfa-buscar-campo';
    campo.type = 'search';
    campo.placeholder = 'Search a player by name...';
    campo.autocomplete = 'off';
    campo.maxLength = 15;
    // stopPropagation: si no, escribir en el campo mueve al personaje —el juego
    // escucha las teclas en el documento.
    campo.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); lanzarBusqueda(); }
      if (e.key === 'Escape') { e.preventDefault(); limpiarBusqueda(); }
    });
    campo.addEventListener('keyup', function (e) { e.stopPropagation(); });
    var botonB = el('button', 'gfa-btn', 'Search');
    botonB.type = 'button';
    botonB.id = 'gfa-buscar-btn';
    botonB.addEventListener('click', lanzarBusqueda);
    buscar.appendChild(campo);
    buscar.appendChild(botonB);
    caja.appendChild(buscar);

    // Lista
    var lista = el('div', 'gfa-lista');
    lista.id = 'gfa-lista';
    caja.appendChild(lista);

    // Conversación (se enseña en lugar de la lista)
    var chat = el('div', 'gfa-chat');
    chat.id = 'gfa-chat';
    chat.style.display = 'none';

    var chatCab = el('div', 'gfa-chat-cab');
    var volver = el('button', 'gfa-mini', '←');
    volver.type = 'button';
    volver.id = 'gfa-chat-volver';
    volver.setAttribute('aria-label', 'Back to messages');
    volver.addEventListener('click', function () { cerrarConversacion(); });
    var chatNom = el('div', 'gfa-nombre');
    chatNom.id = 'gfa-chat-nombre';
    chatNom.style.flex = '1';
    chatCab.appendChild(volver);
    chatCab.appendChild(chatNom);
    chat.appendChild(chatCab);

    var msgs = el('div', 'gfa-chat-msgs');
    msgs.id = 'gfa-chat-msgs';
    chat.appendChild(msgs);

    var fila = el('div', 'gfa-chat-fila');
    var entrada = el('input');
    entrada.id = 'gfa-chat-input';
    entrada.type = 'text';
    entrada.placeholder = 'Write a private message...';
    entrada.autocomplete = 'off';
    entrada.maxLength = 300;
    entrada.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); enviarPrivado(); }
    });
    entrada.addEventListener('keyup', function (e) { e.stopPropagation(); });
    var enviar = el('button', 'gfa-btn', 'Send');
    enviar.type = 'button';
    enviar.id = 'gfa-chat-enviar';
    enviar.addEventListener('click', enviarPrivado);
    fila.appendChild(entrada);
    fila.appendChild(enviar);
    chat.appendChild(fila);

    caja.appendChild(chat);
    panel.appendChild(caja);

    // Tocar el fondo cierra. Dentro de la caja, no.
    panel.addEventListener('pointerdown', function (e) {
      if (e.target === panel) cerrarPanel();
    });

    doc.body.appendChild(panel);

    nodos = {
      panel: panel, caja: caja, tabs: tabs, lista: lista,
      buscar: buscar, campo: campo,
      chat: chat, chatNom: chatNom, msgs: msgs, entrada: entrada
    };

    // ESC cierra, esté donde esté el foco.
    doc.addEventListener('keydown', function (e) {
      if (!abierto) return;
      if (e.key === 'Escape') { e.stopPropagation(); cerrarPanel(); }
    });

    listo = true;
  }

  // ── El botón redondo ──────────────────────────────────────────────────────

  function botonRedondo() {
    return doc.getElementById('friends-btn');
  }

  /**
   * Engancha el botón. Se llama en cada `montar`, o sea en cada entrada a una
   * escena, y por eso REEMPLAZA el manejador en vez de sumar otro: el botón es
   * DOM de la página y sobrevive al cambio de escena, así que un
   * addEventListener suelto se acumularía y un solo clic abriría y cerraría el
   * panel en el mismo golpe.
   */
  function engancharBoton() {
    var b = botonRedondo();
    if (!b) return;
    if (b._gfaClic) b.removeEventListener('click', b._gfaClic);
    b._gfaClic = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      alternar();
    };
    b.addEventListener('click', b._gfaClic);

    if (!b.querySelector('.gfa-chapa')) {
      var chapa = el('span', 'gfa-chapa', '0');
      chapa.id = 'gfa-chapa';
      b.appendChild(chapa);
    }
    pintarChapa();
  }

  /** El número rojo del botón: solicitudes + privados sin leer. */
  function pintarChapa() {
    var chapa = doc.getElementById('gfa-chapa');
    if (!chapa) return;
    var n = (estado.entrantes ? estado.entrantes.length : 0) + (estado.noLeidos || 0);
    chapa.textContent = n > 99 ? '99+' : String(n);
    chapa.classList.toggle('ver', n > 0);
  }

  // ── Socket ────────────────────────────────────────────────────────────────

  /**
   * Se engancha al socket vivo. Se comprueba CUÁL es, no una bandera: una
   * reconexión sustituye `window.globalSocket`, y sin esto el módulo se
   * quedaría escuchando a un socket muerto — el panel no volvería a enterarse
   * de una solicitud ni de un mensaje en toda la partida.
   */
  function enlazar() {
    var s = global.globalSocket || (escena && escena.socket) || null;
    if (!s) return false;
    if (socket === s) return true;

    socket = s;
    log('enganchado al socket', s.id || '(sin id)');

    s.on('friends:state', function (d) {
      if (!d || !d.ok) return;
      estado = {
        yo: d.yo || null,
        amigos: d.amigos || [],
        entrantes: d.entrantes || [],
        salientes: d.salientes || [],
        noLeidos: d.noLeidos || 0
      };
      pintarChapa();
      if (abierto) pintar();
    });

    s.on('friends:online', function (d) {
      if (!d || !d.ok) return;
      enLinea = { canal: d.canal, jugadores: d.jugadores || [] };
      if (abierto && pestana === 'online') pintar();
    });

    s.on('friends:search', function (d) {
      if (!d || !d.ok) return;
      buscados = d.jugadores || [];
      if (abierto) pintar();
    });

    s.on('friends:request:new', function (d) {
      var n = (d && d.de && d.de.username) || 'Someone';
      aviso(desescapar(n) + ' sent you a friend request', 'info');
      pedirEstado();
    });

    s.on('friends:accepted', function (d) {
      var n = (d && d.por && d.por.username) || 'Someone';
      aviso(desescapar(n) + ' is now your friend', 'success');
      pedirEstado();
    });

    s.on('friends:removed', function () { pedirEstado(); });

    s.on('friends:presence', function (d) {
      if (!d || !d.playerName) return;
      for (var i = 0; i < estado.amigos.length; i++) {
        if (estado.amigos[i].playerName === d.playerName) {
          estado.amigos[i].online = !!d.online;
          estado.amigos[i].canal  = d.canal || null;
          break;
        }
      }
      if (abierto && pestana === 'friends') pintar();
    });

    s.on('friends:unread', function (d) {
      estado.noLeidos = (d && d.noLeidos) || 0;
      pintarChapa();
    });

    s.on('friends:inbox', function (d) {
      if (!d || !d.ok) return;
      bandeja = d.conversaciones || [];
      if (abierto && pestana === 'messages' && !chatCon) pintar();
    });

    s.on('friends:dm:history', function (d) {
      if (!d || !d.ok) return;
      if (d.con !== chatCon) return;         // llegó tarde: es de otra conversación
      chatFicha = d.ficha || chatFicha;
      conversacion = d.mensajes || [];
      pintarConversacion();
    });

    /* UN PRIVADO QUE LLEGA. Si la conversación está abierta, se añade; si no,
       se avisa y sube el contador. El aviso sale SIEMPRE, aunque el panel esté
       cerrado: es lo que hace que un mensaje llegue de verdad y no se quede
       esperando a que a alguien se le ocurra abrir la pestaña. */
    s.on('friends:dm', function (m) {
      if (!m) return;
      if (chatCon && m.de === chatCon && abierto) {
        conversacion.push(m);
        pintarConversacion();
        if (socket) socket.emit('friends:dm:history', { con: chatCon });  // marcar leído
        return;
      }
      estado.noLeidos = (estado.noLeidos || 0) + 1;
      pintarChapa();
      aviso('✉ ' + desescapar(m.deNombre || 'A friend') + ': ' + desescapar(m.texto), 'info');
      if (abierto && pestana === 'messages') pedirBandeja();
    });

    s.on('friends:dm:sent', function (m) {
      if (!m) return;
      if (chatCon && m.para === chatCon && abierto) {
        // Ya lo pintamos en optimista al enviarlo; solo se refresca si no está.
        for (var i = conversacion.length - 1; i >= 0; i--) {
          if (conversacion[i].id === m.id) return;
          if (conversacion[i]._pendiente && conversacion[i].texto === m.texto) {
            conversacion[i] = m;
            pintarConversacion();
            return;
          }
        }
        conversacion.push(m);
        pintarConversacion();
      }
    });

    s.on('friends:ok', function (d) {
      var q = d && d.que;
      var n = d && d.nombre ? desescapar(d.nombre) : '';
      if (q === 'enviada')   aviso('Friend request sent' + (n ? ' to ' + n : ''), 'success');
      if (q === 'aceptada')  aviso('Friend added' + (n ? ': ' + n : ''), 'success');
      if (q === 'rechazada') aviso('Request removed', 'info');
      if (q === 'eliminada') aviso('Friend removed', 'info');
      pedirEstado();
    });

    s.on('friends:error', function (d) {
      var m = d && d.motivo;
      var n = d && d.nombre ? desescapar(d.nombre) : 'that player';
      var textos = {
        sin_sesion:            'You need to be signed in to use friends.',
        no_existe:             'No player named "' + n + '" was found.',
        eres_tu:               'You cannot add yourself.',
        ya_amigos:             n + ' is already your friend.',
        ya_pedida:             'You already sent a request to ' + n + '.',
        lista_llena:           'Your friend list is full.',
        su_lista_llena:        n + "'s friend list is full.",
        demasiadas_pendientes: 'You have too many pending requests.',
        su_bandeja_llena:      n + ' has too many pending requests.',
        sin_solicitud:         'That request is no longer there.',
        no_es_amigo:           'You can only message friends, or someone with a pending request.',
        demasiado_rapido:      'Slow down a moment.',
        color_invalido:        'That colour is not valid.'
      };
      aviso(textos[m] || 'Something went wrong. Try again.', 'error');
    });

    /* EL COMANDO DEL CHAT. El servidor contesta `chatCommand` cuando alguien
       escribe /add_friend en el chat general — pasa cuando el cliente no lo
       interceptó (pestaña sin recargar). Se ejecuta igual. */
    s.on('chatCommand', function (d) {
      if (d && d.que === 'add_friend' && d.nombre) pedirAmistad(d.nombre);
    });

    return true;
  }

  function pedirEstado()  { if (enlazar()) socket.emit('friends:state'); }
  function pedirEnLinea() { if (enlazar()) socket.emit('friends:online'); }
  function pedirBandeja() { if (enlazar()) socket.emit('friends:inbox'); }

  // ── Acciones ──────────────────────────────────────────────────────────────

  function pedirAmistad(nombre) {
    var n = String(nombre || '').trim();
    if (!n) return;
    if (!enlazar()) { aviso('No connection right now.', 'error'); return; }
    socket.emit('friends:request', { nombre: n });
  }

  function aceptar(playerName) { if (enlazar()) socket.emit('friends:accept', { playerName: playerName }); }
  function rechazar(playerName) { if (enlazar()) socket.emit('friends:reject', { playerName: playerName }); }

  function quitar(playerName, nombreVisible) {
    if (!enlazar()) return;
    confirmar('Remove ' + (nombreVisible || 'this player') + ' from your friends?', function () {
      socket.emit('friends:remove', { playerName: playerName });
    });
  }

  /**
   * Confirmación propia. No se usa `confirm()`: en el móvil congela el juego
   * (y con él el socket y las animaciones) hasta que se conteste, y en el PC
   * roba el foco. Además así se ve como el resto del juego.
   */
  function confirmar(texto, alSi) {
    var fondo = el('div');
    fondo.id = 'gfa-confirmar';
    fondo.style.cssText = 'position:fixed;inset:0;background:rgba(0,8,24,0.72);z-index:10030;' +
                          'display:flex;align-items:center;justify-content:center;padding:20px;';
    var caja = el('div');
    caja.style.cssText = 'background:linear-gradient(160deg,#0a1628,#0d2040);border:1.5px solid ' +
                         'rgba(64,160,255,0.35);border-radius:14px;padding:18px;max-width:320px;' +
                         'box-shadow:0 8px 32px rgba(0,60,150,.5);';
    var t = el('div', null, texto);
    t.style.cssText = 'color:#dff0ff;font-size:13px;line-height:1.5;margin-bottom:14px;' +
                      'font-family:"Segoe UI",system-ui,sans-serif;';
    var fila = el('div');
    fila.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    var no = el('button', 'gfa-btn', 'Cancel');
    no.type = 'button';
    var si = el('button', 'gfa-btn mal', 'Remove');
    si.type = 'button';
    var quitarCaja = function () { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); };
    no.addEventListener('click', quitarCaja);
    si.addEventListener('click', function () { quitarCaja(); try { alSi(); } catch (e) {} });
    fila.appendChild(no); fila.appendChild(si);
    caja.appendChild(t); caja.appendChild(fila);
    fondo.appendChild(caja);
    fondo.addEventListener('pointerdown', function (e) { if (e.target === fondo) quitarCaja(); });
    doc.body.appendChild(fondo);
  }

  function lanzarBusqueda() {
    if (!nodos.campo) return;
    var q = nodos.campo.value.trim();
    if (q.length < 2) { aviso('Type at least 2 characters.', 'info'); return; }
    if (!enlazar()) { aviso('No connection right now.', 'error'); return; }
    socket.emit('friends:search', { q: q });
  }

  function limpiarBusqueda() {
    buscados = null;
    if (nodos.campo) nodos.campo.value = '';
    pintar();
  }

  // ── Conversaciones privadas ───────────────────────────────────────────────

  function abrirChatCon(playerName, nombreVisible) {
    if (!playerName) return;
    construir();
    chatCon = playerName;
    chatFicha = { playerName: playerName, username: nombreVisible || playerName };
    conversacion = [];
    pestana = 'messages';
    abrirPanel();
    if (enlazar()) socket.emit('friends:dm:history', { con: playerName });
    pintar();
    // El foco en el campo solo en PC: en el móvil abriría el teclado de golpe
    // y taparía la conversación que se acaba de abrir.
    if (!esMovil() && nodos.entrada) { try { nodos.entrada.focus(); } catch (e) {} }
  }

  function cerrarConversacion() {
    chatCon = null;
    chatFicha = null;
    conversacion = [];
    pedirBandeja();
    pintar();
  }

  function enviarPrivado() {
    if (!chatCon || !nodos.entrada) return;
    var texto = nodos.entrada.value.trim();
    if (!texto) return;
    if (!enlazar()) { aviso('No connection right now.', 'error'); return; }

    socket.emit('friends:dm', { para: chatCon, texto: texto });

    /* Se pinta YA, sin esperar al servidor. El eco (`friends:dm:sent`) sustituye
       esta copia cuando llega; si no llegara, la marca `_pendiente` deja claro
       que aún no está confirmado en vez de fingir que sí. */
    conversacion.push({
      id: null, _pendiente: true,
      de: (estado.yo && estado.yo.playerName) || '',
      para: chatCon,
      deNombre: (estado.yo && estado.yo.username) || 'You',
      texto: texto, ts: new Date().toISOString()
    });
    nodos.entrada.value = '';
    pintarConversacion();
  }

  function esMovil() {
    try { return global.matchMedia && global.matchMedia('(max-width:560px)').matches; }
    catch (e) { return false; }
  }

  // ── Pintado ───────────────────────────────────────────────────────────────

  /** Una fila de jugador con sus botones. */
  function filaJugador(j, opciones) {
    opciones = opciones || {};
    var f = el('div', 'gfa-fila' + (opciones.nuevo ? ' nuevo' : ''));

    var punto = el('span', 'gfa-punto' + (j.online ? ' on' : ''));
    punto.title = j.online ? 'Online' : 'Offline';
    f.appendChild(punto);

    var datos = el('div', 'gfa-datos');
    var nom = el('div', 'gfa-nombre', desescapar(j.username || j.playerName));
    var col = colorSeguro(j.nameColor);
    if (col) nom.style.color = col;
    datos.appendChild(nom);

    var partes = ['Lv. ' + (j.nivel || 0)];
    if (j.online && j.canal) partes.push('Channel ' + j.canal);
    else if (j.online) partes.push('Online');
    else partes.push('Offline');
    if (j.zona === 'shop') partes.push('in the shop');
    if (opciones.sub) partes.push(opciones.sub);
    datos.appendChild(el('div', 'gfa-sub', partes.join(' · ')));
    f.appendChild(datos);

    var acc = el('div', 'gfa-acciones');
    (opciones.botones || []).forEach(function (b) {
      var n = el('button', 'gfa-mini' + (b.clase ? ' ' + b.clase : ''), b.icono);
      n.type = 'button';
      n.title = b.titulo || '';
      n.setAttribute('aria-label', b.titulo || b.icono);
      n.addEventListener('click', function (e) { e.stopPropagation(); b.al(); });
      acc.appendChild(n);
    });
    f.appendChild(acc);
    return f;
  }

  function vacio(texto) {
    var v = el('div', 'gfa-vacio');
    String(texto).split('\n').forEach(function (linea, i) {
      if (i) v.appendChild(doc.createElement('br'));
      v.appendChild(doc.createTextNode(linea));
    });
    return v;
  }

  function pintar() {
    if (!listo) return;

    // Pestañas
    var pips = { requests: estado.entrantes.length, messages: estado.noLeidos };
    [].forEach.call(nodos.tabs.children, function (b) {
      var id = b.getAttribute('data-tab');
      b.classList.toggle('on', id === pestana);
      var pip = b.querySelector('.gfa-pip');
      if (!pip) return;
      var n = pips[id] || 0;
      pip.textContent = n > 99 ? '99+' : String(n);
      pip.style.display = n > 0 ? 'flex' : 'none';
    });

    // Conversación abierta: manda sobre todo lo demás.
    if (pestana === 'messages' && chatCon) {
      nodos.lista.style.display = 'none';
      nodos.buscar.style.display = 'none';
      nodos.chat.style.display = 'flex';
      nodos.chatNom.textContent = desescapar((chatFicha && chatFicha.username) || chatCon);
      var c = colorSeguro(chatFicha && chatFicha.nameColor);
      nodos.chatNom.style.color = c || '';
      pintarConversacion();
      return;
    }

    nodos.chat.style.display = 'none';
    nodos.lista.style.display = 'flex';
    nodos.buscar.style.display = (pestana === 'friends' || pestana === 'online') ? 'flex' : 'none';

    var L = nodos.lista;
    L.textContent = '';

    if (pestana === 'friends')  pintarAmigos(L);
    if (pestana === 'online')   pintarEnLinea(L);
    if (pestana === 'requests') pintarSolicitudes(L);
    if (pestana === 'messages') pintarBandeja(L);
  }

  function pintarAmigos(L) {
    // Si hay una búsqueda hecha, va primero: es lo que el jugador acaba de pedir.
    if (buscados) {
      L.appendChild(el('div', 'gfa-seccion', 'Search results'));
      if (!buscados.length) {
        L.appendChild(vacio('No player found with that name.'));
      } else {
        buscados.forEach(function (j) {
          var botones = [];
          if (j.esAmigo) {
            botones.push({ icono: '✉', titulo: 'Send a private message',
                           al: function () { abrirChatCon(j.playerName, j.username); } });
          } else if (j.pendiente) {
            botones.push({ icono: '⏳', titulo: 'Request already sent', al: function () {
              aviso('Request already sent to ' + desescapar(j.username) + '.', 'info');
            } });
          } else if (j.tePidio) {
            botones.push({ icono: '✓', clase: 'ok', titulo: 'Accept their request',
                           al: function () { aceptar(j.playerName); } });
          } else {
            botones.push({ icono: '+', clase: 'ok', titulo: 'Add friend',
                           al: function () { pedirAmistad(j.username || j.playerName); } });
          }
          L.appendChild(filaJugador(j, { botones: botones }));
        });
      }
      var limpiar = el('button', 'gfa-btn', 'Clear search');
      limpiar.type = 'button';
      limpiar.style.margin = '4px 0 8px';
      limpiar.addEventListener('click', limpiarBusqueda);
      L.appendChild(limpiar);
    }

    L.appendChild(el('div', 'gfa-seccion',
      'My friends (' + estado.amigos.length + ')'));

    if (!estado.amigos.length) {
      L.appendChild(vacio('You have no friends yet.\nSearch for a player above, or check who is\nonline in your channel.'));
      return;
    }

    estado.amigos.forEach(function (a) {
      L.appendChild(filaJugador(a, {
        botones: [
          { icono: '✉', titulo: 'Send a private message',
            al: function () { abrirChatCon(a.playerName, a.username); } },
          { icono: '✕', clase: 'mal', titulo: 'Remove friend',
            al: function () { quitar(a.playerName, desescapar(a.username)); } }
        ]
      }));
    });
  }

  function pintarEnLinea(L) {
    var cab = el('div', 'gfa-seccion',
      enLinea.canal ? ('Online in channel ' + enLinea.canal +
                       ' (' + enLinea.jugadores.length + ')')
                    : 'Online players');
    L.appendChild(cab);

    var refrescar = el('button', 'gfa-btn', '↻ Refresh');
    refrescar.type = 'button';
    refrescar.style.margin = '2px 0 6px';
    refrescar.addEventListener('click', pedirEnLinea);
    L.appendChild(refrescar);

    if (!enLinea.jugadores.length) {
      L.appendChild(vacio('Nobody else is connected in your channel\nright now.'));
      return;
    }

    enLinea.jugadores.forEach(function (j) {
      var botones = [];
      if (j.esAmigo) {
        botones.push({ icono: '✉', titulo: 'Send a private message',
                       al: function () { abrirChatCon(j.playerName, j.username); } });
      } else if (j.pendiente) {
        botones.push({ icono: '⏳', titulo: 'Request already sent',
                       al: function () { aviso('Request already sent.', 'info'); } });
      } else if (j.tePidio) {
        botones.push({ icono: '✓', clase: 'ok', titulo: 'Accept their request',
                       al: function () { aceptar(j.playerName); } });
      } else {
        botones.push({ icono: '+', clase: 'ok', titulo: 'Add friend',
                       al: function () { pedirAmistad(j.username || j.playerName); } });
      }
      L.appendChild(filaJugador(j, { botones: botones }));
    });
  }

  function pintarSolicitudes(L) {
    L.appendChild(el('div', 'gfa-seccion',
      'Received (' + estado.entrantes.length + ')'));

    if (!estado.entrantes.length) {
      L.appendChild(vacio('No friend requests right now.'));
    } else {
      estado.entrantes.forEach(function (r) {
        L.appendChild(filaJugador(r, {
          nuevo: true,
          sub: r.desde ? hace(r.desde) : '',
          botones: [
            { icono: '✓', clase: 'ok', titulo: 'Accept',
              al: function () { aceptar(r.playerName); } },
            { icono: '✉', titulo: 'Send a private message',
              /* Se puede escribir SIN aceptar: te llega una solicitud y lo
                 primero que quieres es preguntar quién es. El servidor lo
                 permite porque hay una relación pendiente entre los dos (ver
                 la regla de `friends:dm`). */
              al: function () { abrirChatCon(r.playerName, r.username); } },
            { icono: '✕', clase: 'mal', titulo: 'Delete request',
              al: function () { rechazar(r.playerName); } }
          ]
        }));
      });
    }

    if (estado.salientes.length) {
      L.appendChild(el('div', 'gfa-seccion',
        'Sent (' + estado.salientes.length + ')'));
      estado.salientes.forEach(function (r) {
        L.appendChild(filaJugador(r, {
          sub: r.desde ? hace(r.desde) : '',
          botones: [
            // También se puede escribir a quien le has pedido amistad: sirve
            // para decirle de qué le conoces, que es lo que hace que acepte.
            { icono: '✉', titulo: 'Send a private message',
              al: function () { abrirChatCon(r.playerName, r.username); } },
            { icono: '✕', clase: 'mal', titulo: 'Cancel request',
              al: function () { rechazar(r.playerName); } }
          ]
        }));
      });
    }
  }

  function pintarBandeja(L) {
    L.appendChild(el('div', 'gfa-seccion', 'Conversations'));

    if (!bandeja.length) {
      L.appendChild(vacio('No messages yet.\nOpen a friend and write to them —\nif they are offline it will be waiting\nfor them when they come back.'));
      return;
    }

    bandeja.forEach(function (c) {
      var f = el('div', 'gfa-fila' + (c.noLeidos ? ' nuevo' : ''));
      var punto = el('span', 'gfa-punto' + (c.online ? ' on' : ''));
      f.appendChild(punto);

      var datos = el('div', 'gfa-datos');
      var nom = el('div', 'gfa-nombre', desescapar(c.username || c.playerName));
      var col = colorSeguro(c.nameColor);
      if (col) nom.style.color = col;
      datos.appendChild(nom);
      var texto = (c.mio ? 'You: ' : '') + desescapar(c.ultimo || '');
      datos.appendChild(el('div', 'gfa-sub', texto + ' · ' + hace(c.ts)));
      f.appendChild(datos);

      var acc = el('div', 'gfa-acciones');
      if (c.noLeidos) {
        var pip = el('span', 'gfa-pip', String(c.noLeidos));
        pip.style.cssText = 'background:#ff5470;color:#fff;border-radius:9px;font-size:9px;' +
                            'min-width:18px;height:18px;padding:0 5px;display:flex;' +
                            'align-items:center;justify-content:center;';
        acc.appendChild(pip);
      }
      var abrir = el('button', 'gfa-mini', '✉');
      abrir.type = 'button';
      abrir.title = 'Open conversation';
      abrir.addEventListener('click', function (e) {
        e.stopPropagation();
        abrirChatCon(c.playerName, c.username);
      });
      acc.appendChild(abrir);
      f.appendChild(acc);

      f.addEventListener('click', function () { abrirChatCon(c.playerName, c.username); });
      L.appendChild(f);
    });
  }

  function pintarConversacion() {
    if (!nodos.msgs) return;
    var M = nodos.msgs;
    M.textContent = '';

    if (!conversacion.length) {
      M.appendChild(vacio('No messages yet. Say hello.'));
      return;
    }

    var yo = (estado.yo && estado.yo.playerName) || null;
    conversacion.forEach(function (m) {
      var mio = yo ? (m.de === yo) : (m.para === chatCon);
      var b = el('div', 'gfa-burbuja ' + (mio ? 'mia' : 'suya'));
      b.appendChild(doc.createTextNode(desescapar(m.texto)));
      var t = el('span', 't', hora(m.ts) + (m._pendiente ? ' · sending…' : ''));
      b.appendChild(t);
      M.appendChild(b);
    });

    // Al final del todo: lo último es lo que importa.
    M.scrollTop = M.scrollHeight;
  }

  // ── Abrir y cerrar ────────────────────────────────────────────────────────

  function irA(cual) {
    pestana = cual;
    chatCon = null;
    buscados = null;
    if (cual === 'online')   pedirEnLinea();
    if (cual === 'messages') pedirBandeja();
    if (cual === 'friends' || cual === 'requests') pedirEstado();
    pintar();
  }

  function abrirPanel(cual) {
    construir();
    if (cual) pestana = cual;
    abierto = true;
    nodos.panel.classList.add('abierto');
    pedirEstado();
    if (pestana === 'online')   pedirEnLinea();
    if (pestana === 'messages' && !chatCon) pedirBandeja();
    pintar();
  }

  function cerrarPanel() {
    if (!listo) return;
    abierto = false;
    chatCon = null;
    buscados = null;
    nodos.panel.classList.remove('abierto');
    /* Se le devuelve el foco al lienzo: si se queda en el campo de búsqueda, en
       el PC el personaje no se mueve porque las teclas se las come el input. */
    try {
      var lienzo = doc.querySelector('canvas');
      if (lienzo && lienzo.focus) lienzo.focus();
    } catch (e) {}
  }

  function alternar() {
    if (abierto) cerrarPanel(); else abrirPanel();
  }

  // ── MENÚ SOBRE UN JUGADOR (para escenas que no tienen el suyo) ────────────
  //
  // GameScene ya tiene su submenú completo (perfil, verificador, reporte) y ahí
  // solo se le añade una opción más. La TIENDA no tenía ninguno, y el encargo
  // era que agregar amigos funcionara igual en los dos sitios. Esto es ese menú
  // mínimo: agregar y escribir, que es lo que hace falta allí.
  //
  // Vive aquí y no en tiendajuego.js a propósito: si mañana hace falta en una
  // tercera escena se llama y ya está, en vez de copiar el mismo menú otra vez.

  function cerrarMenuJugador() {
    var m = doc.getElementById('gfa-menu-jugador');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    doc.removeEventListener('pointerdown', cerrarMenuSiFuera, true);
    doc.removeEventListener('keydown', cerrarMenuConEsc);
  }

  function cerrarMenuSiFuera(e) {
    var m = doc.getElementById('gfa-menu-jugador');
    if (m && !m.contains(e.target)) cerrarMenuJugador();
  }

  function cerrarMenuConEsc(e) {
    if (e.key === 'Escape') cerrarMenuJugador();
  }

  /**
   * Abre el menú para un jugador remoto.
   *
   * @param info  { _playerName, _displayName } tal cual lo guarda la escena.
   *              `_playerName` es la CUENTA y la pone el servidor; `_displayName`
   *              es el nombre visible, que es lo que se manda para buscarlo.
   * @param ev    el evento del ratón o del dedo, para colocar el menú.
   */
  function menuJugador(scene, info, ev) {
    if (!info) return;
    construir();
    cerrarMenuJugador();

    var visible = desescapar(info._displayName || 'Player');
    var cuenta  = info._playerName || null;

    var menu = el('div');
    menu.id = 'gfa-menu-jugador';
    menu.style.cssText = 'position:fixed;z-index:10035;min-width:186px;padding:6px;' +
      'background:linear-gradient(160deg,#0a1628,#0d2040);border:1.5px solid ' +
      'rgba(64,160,255,0.38);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.6);' +
      'font-family:"Segoe UI",system-ui,sans-serif;';

    var cab = el('div', null, visible);
    cab.style.cssText = 'color:#a8d8ff;font-size:12px;font-weight:700;padding:6px 9px 8px;' +
      'border-bottom:1px solid rgba(64,160,255,0.18);margin-bottom:4px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    menu.appendChild(cab);

    var opciones = [];
    var esAmigo = !!(cuenta && global.GFAmigos.esAmigo(cuenta));

    if (esAmigo) {
      opciones.push(['✉️', 'Send private message', function () {
        abrirChatCon(cuenta, visible);
      }]);
    } else {
      opciones.push(['➕', 'Add to my friends', function () {
        /* Sin nombre visible no hay a quién agregar: quien no ha fijado su
           nombre sigue siendo "---" para todos. Se le dice, en vez de mandar
           una solicitud que el servidor no puede resolver. */
        if (!visible || visible === '---' || visible === 'Player' || visible === 'Jugador') {
          aviso('That player has not chosen a name yet.', 'info');
          return;
        }
        pedirAmistad(visible);
      }]);
    }
    opciones.push(['\u{1F465}', 'Open friends panel', function () { abrirPanel('friends'); }]);

    opciones.forEach(function (o) {
      var b = el('button');
      b.type = 'button';
      b.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%;background:none;' +
        'border:none;color:#dff0ff;font-size:12px;padding:9px 10px;border-radius:8px;' +
        'cursor:pointer;text-align:left;';
      b.addEventListener('mouseenter', function () { b.style.background = 'rgba(64,160,255,0.18)'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
      b.appendChild(el('span', null, o[0]));
      b.appendChild(el('span', null, o[1]));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        cerrarMenuJugador();
        try { o[2](); } catch (err) { console.warn(err); }
      });
      menu.appendChild(b);
    });

    doc.body.appendChild(menu);

    var px = (ev && typeof ev.clientX === 'number') ? ev.clientX : global.innerWidth / 2;
    var py = (ev && typeof ev.clientY === 'number') ? ev.clientY : global.innerHeight / 2;
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(px, global.innerWidth  - r.width  - 8)) + 'px';
    menu.style.top  = Math.max(8, Math.min(py, global.innerHeight - r.height - 8)) + 'px';

    // Un tic después: si no, el mismo toque que lo abre lo cerraría.
    setTimeout(function () {
      doc.addEventListener('pointerdown', cerrarMenuSiFuera, true);
      doc.addEventListener('keydown', cerrarMenuConEsc);
    }, 0);
  }

  /**
   * Engancha el menú a un sprite de jugador remoto.
   *
   * Los dos gestos, los mismos que en el mapa:
   *   · ratón: botón derecho, que es lo que todo el mundo espera;
   *   · dedo: DOS toques seguidos. La pulsación larga no vale — mantener
   *     pulsado es andar, así que chocaría con el movimiento del personaje.
   *
   * `dameInfo` es una función y no el objeto directamente porque la escena
   * puede RECREAR el registro del jugador (pasa al reconectar): guardándose el
   * objeto, el menú acabaría enseñando los datos de un jugador que ya no está.
   */
  function habilitarEnSprite(scene, sprite, dameInfo) {
    if (!sprite || !sprite.setInteractive) return;
    try { sprite.setInteractive({ useHandCursor: true }); } catch (e) { return; }

    // Área de toque generosa: el personaje es estrecho y con el dedo se falla.
    try {
      var w = sprite.width || 32, h = sprite.height || 48;
      sprite.input.hitArea = new global.Phaser.Geom.Rectangle(-18, -18, w + 36, h + 36);
    } catch (e) { /* si no se puede ampliar, se queda el área normal */ }

    var DOBLE_MS = 600, DOBLE_PX = 70;
    var ultimo = null;

    sprite.on('pointerdown', function (pointer) {
      var info = null;
      try { info = dameInfo(); } catch (e) {}
      if (!info) return;

      var ev = (pointer && pointer.event) ? pointer.event : null;

      if (pointer && typeof pointer.rightButtonDown === 'function' && pointer.rightButtonDown()) {
        menuJugador(scene, info, ev);
        return;
      }

      var ahora = Date.now();
      var x = pointer ? pointer.x : 0, y = pointer ? pointer.y : 0;
      var doble = ultimo && (ahora - ultimo.t) < DOBLE_MS &&
                  (Math.abs(x - ultimo.x) + Math.abs(y - ultimo.y)) < DOBLE_PX;
      if (doble) {
        ultimo = null;
        menuJugador(scene, info, ev || { clientX: x, clientY: y });
        return;
      }
      ultimo = { t: ahora, x: x, y: y };
    });
  }

  // ── Montaje desde las escenas ─────────────────────────────────────────────

  /**
   * La llaman GameScene y tiendajuego en su create().
   *
   * Es idempotente y se puede llamar mil veces: el panel se construye una vez y
   * el botón se REENGANCHA (quitando el manejador anterior). Eso es justo lo
   * que hace falta, porque el HUD sobrevive al cambio de escena pero sus
   * manejadores apuntan a la escena que los puso — y esa puede estar ya muerta.
   */
  function montar(scene) {
    escena = scene || escena;
    construir();
    engancharBoton();
    enlazar();
    pedirEstado();

    /* Vigilante: el socket puede llegar tarde (la escena lo crea después) o
       cambiar tras una reconexión. Barato — un `!==` cada dos segundos. */
    if (!global.__gfaVigilante) {
      global.__gfaVigilante = setInterval(function () {
        if (enlazar()) { /* enganchado */ }
      }, 2000);
    }
    return true;
  }

  function desmontar(scene) {
    /* NO se toca el socket ni se destruye el panel: los dos son de la PÁGINA y
       la siguiente escena los va a querer intactos. Lo único que se suelta es
       la referencia a la escena, para no dejar viva una escena muerta. */
    if (escena === scene) escena = null;
  }

  // ── API ───────────────────────────────────────────────────────────────────

  global.GFAmigos = {
    montar: montar,
    desmontar: desmontar,
    abrir: abrirPanel,
    cerrar: cerrarPanel,
    alternar: alternar,
    pedirAmistad: pedirAmistad,
    abrirChatCon: abrirChatCon,
    menuJugador: menuJugador,
    habilitarEnSprite: habilitarEnSprite,
    cerrarMenuJugador: cerrarMenuJugador,
    aviso: aviso,
    esAmigo: function (playerName) {
      for (var i = 0; i < estado.amigos.length; i++) {
        if (estado.amigos[i].playerName === playerName) return true;
      }
      return false;
    },
    /** Los amigos que hay ahora mismo, copiados. Lo usan las escenas para
        saber a quién pintar como amigo sobre el mapa. */
    amigos: function () { return estado.amigos.slice(); },
    miNombre: function () { return (estado.yo && estado.yo.username) || null; },
    /** Refresca desde el servidor. La llaman las escenas al entrar. */
    refrescar: pedirEstado,
    _interno: {
      estado: function () { return estado; },
      desescapar: desescapar,
      colorSeguro: colorSeguro,
      hace: hace
    }
  };

})(window);
