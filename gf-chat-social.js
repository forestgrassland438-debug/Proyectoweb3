/* =============================================================================
 * GF CHAT SOCIAL — reacciones, editar una vez y comandos del chat general
 * =============================================================================
 *
 * QUÉ AÑADE AL CHAT QUE YA HABÍA
 * ---------------------------------------------------------------------------
 *   · REACCIONES. Seis emojis fijos debajo de cada mensaje. Se pulsa uno y se
 *     pone; se vuelve a pulsar y se quita. Se ve quién ha reaccionado al pasar
 *     el ratón por encima.
 *   · EDITAR, UNA SOLA VEZ. Solo tus mensajes, solo dentro de los dos primeros
 *     minutos y solo una vez. Queda marcado como "(edited)".
 *   · COMANDOS. `/add_friend "Fulano"` manda la solicitud de amistad y NO se
 *     reparte por el chat: a quién le pides amistad no es asunto del canal.
 *   · EL COLOR DEL NOMBRE. El que cada jugador se elige en el dashboard, que
 *     llega dentro del propio mensaje.
 *
 * POR QUÉ ES UN MÓDULO Y NO CÓDIGO DENTRO DE LAS ESCENAS
 * ---------------------------------------------------------------------------
 * `appendMessage` y `_sendChatFromInput` están DUPLICADOS en GameScene y en
 * tiendajuego —cada escena es autónoma— y son casi idénticos. Meter aquí las
 * reacciones habría significado escribirlas dos veces y arreglar cada fallo dos
 * veces. Con este módulo, cada escena solo llama a dos funciones y el
 * comportamiento es exactamente el mismo en el mapa y en la tienda.
 *
 * LO QUE MANDA ES EL SERVIDOR
 * ---------------------------------------------------------------------------
 * Aquí no se decide nada: si una reacción vale, si se puede editar, si ya se
 * editó o de quién es el mensaje lo dice el servidor, y este módulo solo pinta
 * lo que le llega. Los botones se esconden cuando no toca, pero eso es
 * comodidad, no seguridad — un cliente manipulado que los enseñe igual se
 * choca contra la misma comprobación en el servidor.
 *
 * TODO EL TEXTO QUE VE EL JUGADOR ESTÁ EN INGLÉS.
 *
 * API
 * ---------------------------------------------------------------------------
 *   GFChatSocial.montar(scene)
 *   GFChatSocial.decorar(scene, msg, linea, nombreEl, textoEl)
 *   GFChatSocial.comando(scene, texto)   -> true si era un comando (no enviar)
 *   GFChatSocial.olvidar()               limpia el registro al vaciar el chat
 * ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;

  /* Los seis de siempre. La lista está cerrada y es la MISMA que valida el
     servidor: si aquí hubiera uno de más, el jugador lo pulsaría y no pasaría
     nada, que es la peor clase de fallo — el que no da error. */
  var EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  var EDICION_PLAZO_MS = 2 * 60 * 1000;   // el mismo plazo que el servidor

  /* Registro de mensajes pintados: mid -> { linea, textoEl, msg }.
     Hace falta porque una reacción o una edición llegan DESPUÉS, por el socket,
     y hay que saber qué línea repintar. Se poda para que una sesión larga no
     acumule referencias a nodos que ya nadie mira. */
  var pintados = new Map();
  var TOPE_REGISTRO = 300;

  var socketEnlazado = null;

  /* LA ESCENA VIVA, EN UNA SOLA VARIABLE.

     Los manejadores del socket se enganchan UNA vez —el socket es de la página
     y sobrevive al cambio de escena—, así que si se guardaran la escena que les
     tocó al engancharse, dentro de la tienda estarían preguntándole cosas a la
     escena del mapa, que ya está apagada: la reacción propia dejaría de
     marcarse como tuya y los avisos irían a un sitio que no se ve.

     `montar()` la actualiza en cada entrada y los manejadores la leen cuando la
     necesitan. Mismo patrón que gf-amigos.js. */
  var escenaViva = null;

  function log() {
    try { console.log.apply(console, ['[GFChatSocial]'].concat([].slice.call(arguments))); }
    catch (e) {}
  }

  function el(tag, clase, texto) {
    var n = doc.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /** Igual que en las escenas: deshacer el escapado del servidor, sin innerHTML. */
  function desescapar(t) {
    return String(t == null ? '' : t)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/g, '&');
  }

  function colorSeguro(c) {
    return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : null;
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  function estilos() {
    if (doc.getElementById('gfcs-estilos')) return;
    var s = doc.createElement('style');
    s.id = 'gfcs-estilos';
    s.textContent = [
      '.chat-line{position:relative;}',
      '.gfcs-barra{display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle;',
      '  opacity:0;transition:opacity .15s;}',
      '.chat-line:hover .gfcs-barra,.gfcs-barra.fijo{opacity:1;}',
      '.gfcs-bot{background:rgba(64,160,255,0.14);border:1px solid rgba(64,160,255,0.28);',
      '  color:#a8d8ff;border-radius:6px;width:20px;height:20px;font-size:11px;line-height:1;',
      '  cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;}',
      '.gfcs-bot:hover{background:rgba(64,160,255,0.30);}',

      '.gfcs-paleta{position:absolute;z-index:10040;display:flex;gap:2px;padding:5px 6px;',
      '  background:rgba(8,18,40,0.97);border:1px solid rgba(64,160,255,0.38);',
      '  border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.55);}',
      '.gfcs-paleta button{background:none;border:none;font-size:18px;line-height:1;',
      '  cursor:pointer;padding:3px 4px;border-radius:6px;}',
      '.gfcs-paleta button:hover{background:rgba(64,160,255,0.22);}',

      '.gfcs-reacs{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 1px 4px;}',
      '.gfcs-reac{display:inline-flex;align-items:center;gap:3px;font-size:11px;',
      '  background:rgba(20,50,100,0.5);border:1px solid rgba(64,160,255,0.22);',
      '  color:#cfe6ff;border-radius:11px;padding:1px 7px;cursor:pointer;line-height:1.5;}',
      '.gfcs-reac:hover{background:rgba(40,90,160,0.6);}',
      '.gfcs-reac.mia{border-color:rgba(90,200,255,0.75);background:rgba(30,90,170,0.7);}',

      '.gfcs-editado{font-size:9px;opacity:.55;margin-left:5px;font-style:italic;}',
      '.gfcs-editar{background:rgba(6,16,34,0.9);border:1px solid rgba(64,160,255,0.45);',
      '  border-radius:6px;color:#dff0ff;font-size:12px;padding:3px 6px;outline:none;',
      '  width:min(60vw,240px);}',

      /* En el móvil no hay `hover`: los botones se quedan puestos, pero muy
         discretos, o el chat se llena de iconos. */
      '@media (hover:none){',
      '  .gfcs-barra{opacity:.55;}',
      '  .gfcs-bot{width:24px;height:24px;font-size:13px;}',
      '  .gfcs-reac{padding:2px 9px;font-size:12px;}',
      '}'
    ].join('\n');
    doc.head.appendChild(s);
  }

  // ── Socket ────────────────────────────────────────────────────────────────

  function socketVivo(scene) {
    if (scene && typeof scene._socketVivo === 'function') {
      try { var s = scene._socketVivo(); if (s) return s; } catch (e) {}
    }
    return global.globalSocket || (scene && scene.socket) || null;
  }

  /**
   * Oyentes de reacción y edición.
   *
   * Se comprueba a CUÁL socket estamos enganchados, no una bandera: una
   * reconexión sustituye `window.globalSocket` y sin esto el módulo se quedaría
   * escuchando a un socket muerto — las reacciones de los demás dejarían de
   * verse sin ningún error por medio.
   */
  function enlazar(scene) {
    var s = socketVivo(scene);
    if (!s || socketEnlazado === s) return s;
    socketEnlazado = s;

    /* El aviso del botón. Va aquí, junto a los demás oyentes del socket, y no
       en las escenas: el botón y el panel son DOM de la página, así que con uno
       solo funciona en el mapa y en la tienda. Se engancha a `chatMessage` —el
       mensaje que llega en vivo— y NO a `chatHistory`, para que entrar en una
       escena y recibir las últimas 50 líneas de golpe no deje el botón
       titilando por conversaciones de hace media hora. */
    s.on('chatMessage', function (m) { avisarDeMensaje(s, m); });

    s.on('chatReaction', function (d) {
      if (!d || !d.mid) return;
      var reg = pintados.get(d.mid);
      if (!reg) return;
      reg.msg.reacciones = d.reacciones || [];
      pintarReacciones(escenaViva || scene, reg);
    });

    s.on('chatEdited', function (d) {
      if (!d || !d.mid) return;
      var reg = pintados.get(d.mid);
      if (!reg) return;
      reg.msg.text = d.text;
      reg.msg.editado = true;
      reg.textoEl.textContent = ' ' + desescapar(d.text);
      marcarEditado(reg);
      // Ya no se puede volver a editar: fuera el lápiz.
      var lapiz = reg.linea.querySelector('.gfcs-lapiz');
      if (lapiz && lapiz.parentNode) lapiz.parentNode.removeChild(lapiz);
    });

    s.on('chatEditError', function (d) {
      var motivos = {
        no_existe:      'That message is no longer in the chat.',
        no_es_tuyo:     'You can only edit your own messages.',
        ya_editado:     'You can only edit a message once.',
        fuera_de_plazo: 'Too late — messages can only be edited for 2 minutes.',
        vacio:          'The message cannot be empty.'
      };
      avisar(escenaViva || scene, motivos[d && d.motivo] || 'The message could not be edited.', 'error');
    });

    return s;
  }

  function avisar(scene, texto, tipo) {
    try {
      if (global.GFAmigos && global.GFAmigos.aviso) { global.GFAmigos.aviso(texto, tipo); return; }
      if (scene && scene.notifications && scene.notifications.show) {
        scene.notifications.show(texto, tipo || 'info'); return;
      }
      if (scene && typeof scene.appendSystemMessage === 'function') {
        scene.appendSystemMessage(texto); return;
      }
    } catch (e) {}
    log(texto);
  }

  /* ══════════════════════════════════════════════════════════════════════
     EL BOTÓN DEL CHAT TITILA CUANDO LLEGA UN MENSAJE Y ESTÁ CERRADO
     ──────────────────────────────────────────────────────────────────────
     QUÉ RESUELVE
     Con el chat cerrado, un mensaje nuevo no dejaba ninguna señal. La burbuja
     sobre el personaje solo se ve si quien habla está en pantalla, así que un
     amigo podía estar escribiéndote desde la otra punta del mapa y no
     enterarte hasta que abrieras el panel por casualidad.

     TITILA Y NADA MÁS. Sin número, sin sonido, sin abrirse solo. Es un aviso
     de "mira aquí", y lo que menos molesta mientras estás jugando.

     POR QUÉ VIVE AQUÍ Y NO EN LAS ESCENAS
     El botón (`#open-chat-btn`) y el panel (`#chat-panel`) son DOM de la
     PÁGINA: los comparten el mapa y la tienda. Y el socket también. Así que
     con un solo oyente puesto aquí funciona en las dos escenas sin tocar
     ninguna — y sin riesgo de que a una se le olvide.

     CUÁNDO SE APAGA
     Se vigila la clase `chat-hidden` del panel con un MutationObserver, no el
     clic del botón. Es a propósito: el chat se abre por cuatro caminos (el
     botón, la tecla Enter del propio botón, `_toggleChat(true)` desde código y
     el Escape que lo cierra), y todos pasan por esa clase. Enganchándose al
     clic, cualquiera de los otros dejaría el botón titilando con el chat ya
     abierto.
     ══════════════════════════════════════════════════════════════════════ */

  var CLASE_TITILA = 'gfcs-titila';

  function botonChat() { return doc.getElementById('open-chat-btn'); }
  function panelChat() { return doc.getElementById('chat-panel'); }

  /** ¿Está el chat a la vista ahora mismo? */
  function chatAbierto() {
    var p = panelChat();
    if (!p) return false;
    if (p.classList.contains('chat-hidden')) return false;
    // `hideHudElements()` lo esconde con estilo en línea al salir de la escena;
    // la clase sigue diciendo "abierto" pero no se ve.
    if (p.style && p.style.display === 'none') return false;
    return true;
  }

  function encenderAviso() {
    var b = botonChat();
    if (!b) return;
    // Con el botón escondido (batalla, carga) no hay nada que titilar; cuando
    // vuelva a salir, el aviso sigue puesto y se verá.
    b.classList.add(CLASE_TITILA);
  }

  function apagarAviso() {
    var b = botonChat();
    if (b) b.classList.remove(CLASE_TITILA);
  }

  /**
   * Vigila la apertura del chat para apagar el aviso.
   *
   * Una sola vez por página: el panel es DOM que sobrevive a los cambios de
   * escena, así que un observador por escena se iría acumulando.
   */
  function vigilarChat() {
    if (global.__gfcsVigilaChat) return;
    var p = panelChat();
    if (!p || !global.MutationObserver) return;
    global.__gfcsVigilaChat = true;

    var obs = new global.MutationObserver(function () {
      if (chatAbierto()) apagarAviso();
    });
    obs.observe(p, { attributes: true, attributeFilter: ['class', 'style'] });

    // Y por si el navegador no diera el aviso a tiempo: al pulsar el botón
    // también se apaga. Es idempotente, no estorba.
    var b = botonChat();
    if (b && !b._gfcsApaga) {
      b._gfcsApaga = function () { setTimeout(apagarAviso, 0); };
      b.addEventListener('click', b._gfcsApaga);
    }
  }

  /**
   * Un mensaje del chat general acaba de llegar.
   *
   * Solo titila si el mensaje es de OTRO y el chat está cerrado. El propio
   * mensaje no cuenta —acabas de escribirlo tú— y con el chat abierto ya lo
   * estás viendo.
   */
  function avisarDeMensaje(s, m) {
    if (!m) return;
    if (m.id && s && s.id && m.id === s.id) return;   // es mío
    if (chatAbierto()) return;
    vigilarChat();
    encenderAviso();
  }

  // ── Reacciones ────────────────────────────────────────────────────────────

  function miNombre(scene) {
    // El nombre visible con el que el servidor apunta las reacciones.
    try {
      if (scene && scene.Username && scene.Username !== '---') return scene.Username;
      if (global.GFAmigos && global.GFAmigos.miNombre) {
        var n = global.GFAmigos.miNombre();
        if (n) return n;
      }
    } catch (e) {}
    return null;
  }

  function pintarReacciones(scene, reg) {
    var fila = reg.linea.querySelector('.gfcs-reacs');
    var lista = reg.msg.reacciones || [];

    if (!lista.length) {
      if (fila && fila.parentNode) fila.parentNode.removeChild(fila);
      return;
    }
    if (!fila) {
      fila = el('div', 'gfcs-reacs');
      reg.linea.appendChild(fila);
    }
    fila.textContent = '';

    var yo = miNombre(scene);
    lista.forEach(function (r) {
      var quienes = (r.quienes || []).map(function (q) { return desescapar(q.n || ''); });
      var mia = yo != null && quienes.indexOf(yo) >= 0;
      var chip = el('button', 'gfcs-reac' + (mia ? ' mia' : ''));
      chip.type = 'button';
      chip.appendChild(doc.createTextNode(r.emoji));
      chip.appendChild(el('span', null, String(quienes.length)));
      // Quién reaccionó, sin gastar sitio en pantalla.
      chip.title = quienes.slice(0, 12).join(', ') +
                   (quienes.length > 12 ? ' and ' + (quienes.length - 12) + ' more' : '');
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        reaccionar(scene, reg.msg.mid, r.emoji);
      });
      fila.appendChild(chip);
    });
  }

  function reaccionar(scene, mid, emoji) {
    var s = enlazar(scene);
    if (!s || !s.connected) { avisar(scene, 'No connection right now.', 'error'); return; }
    s.emit('chatReact', { mid: mid, emoji: emoji });
  }

  /** La paleta de seis emojis, junto al botón que la abrió. */
  function abrirPaleta(scene, mid, anclaje) {
    cerrarPaleta();
    var p = el('div', 'gfcs-paleta');
    p.id = 'gfcs-paleta';
    EMOJIS.forEach(function (e) {
      var b = el('button', null, e);
      b.type = 'button';
      b.title = 'React with ' + e;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        reaccionar(scene, mid, e);
        cerrarPaleta();
      });
      p.appendChild(b);
    });
    doc.body.appendChild(p);

    // Junto al botón y SIN salirse de la pantalla: el chat vive abajo del todo
    // y una paleta puesta "debajo" se saldría por el pie en el móvil.
    var r = anclaje.getBoundingClientRect();
    var pr = p.getBoundingClientRect();
    var x = Math.max(6, Math.min(r.left, global.innerWidth - pr.width - 6));
    var y = r.top - pr.height - 6;
    if (y < 6) y = Math.min(r.bottom + 6, global.innerHeight - pr.height - 6);
    p.style.left = x + 'px';
    p.style.top = y + 'px';

    // Un tic después, o el mismo clic que la abre la cierra.
    setTimeout(function () {
      doc.addEventListener('pointerdown', cerrarSiFuera, true);
    }, 0);
  }

  function cerrarSiFuera(e) {
    var p = doc.getElementById('gfcs-paleta');
    if (p && !p.contains(e.target)) cerrarPaleta();
  }

  function cerrarPaleta() {
    var p = doc.getElementById('gfcs-paleta');
    if (p && p.parentNode) p.parentNode.removeChild(p);
    doc.removeEventListener('pointerdown', cerrarSiFuera, true);
  }

  // ── Editar ────────────────────────────────────────────────────────────────

  function marcarEditado(reg) {
    if (reg.linea.querySelector('.gfcs-editado')) return;
    var m = el('span', 'gfcs-editado', '(edited)');
    reg.textoEl.parentNode.insertBefore(m, reg.textoEl.nextSibling);
  }

  function empezarEdicion(scene, reg) {
    if (reg.linea.querySelector('.gfcs-editar')) return;   // ya está en ello

    var campo = doc.createElement('input');
    campo.type = 'text';
    campo.className = 'gfcs-editar';
    campo.maxLength = 300;
    campo.value = desescapar(reg.msg.text);

    var textoVisible = reg.textoEl.style.display;
    reg.textoEl.style.display = 'none';
    reg.textoEl.parentNode.insertBefore(campo, reg.textoEl);

    var cerrar = function () {
      if (campo.parentNode) campo.parentNode.removeChild(campo);
      reg.textoEl.style.display = textoVisible;
    };

    var guardar = function () {
      var t = campo.value.trim();
      cerrar();
      if (!t || t === desescapar(reg.msg.text)) return;
      var s = enlazar(scene);
      if (!s || !s.connected) { avisar(scene, 'No connection right now.', 'error'); return; }
      s.emit('chatEdit', { mid: reg.msg.mid, text: t });
    };

    // stopPropagation en todas: el juego escucha las teclas en el documento y
    // sin esto escribir la edición haría andar al personaje.
    campo.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter')  { e.preventDefault(); guardar(); }
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    });
    campo.addEventListener('keyup', function (e) { e.stopPropagation(); });
    campo.addEventListener('blur', cerrar);

    try { campo.focus(); campo.select(); } catch (e) {}
  }

  /** ¿Este mensaje es mío y todavía se puede editar? */
  function puedoEditar(scene, msg) {
    if (!msg || !msg.mid || msg.editado) return false;
    var s = socketVivo(scene);
    if (!s || msg.id !== s.id) return false;      // no es mío
    var t = Date.parse(msg.ts);
    if (!isFinite(t)) return false;
    return (Date.now() - t) < EDICION_PLAZO_MS;
  }

  // ── Lo que llaman las escenas ─────────────────────────────────────────────

  /**
   * Adorna una línea de chat recién pintada.
   *
   * @param scene    la escena viva (para el socket y los avisos)
   * @param msg      el mensaje tal cual llegó del servidor
   * @param linea    el <div class="chat-line">
   * @param nombreEl el <strong> del nombre
   * @param textoEl  el <span class="chat-text"> con el texto
   */
  function decorar(scene, msg, linea, nombreEl, textoEl) {
    if (!msg || !linea) return;
    // Cada mensaje llega desde la escena que lo pinta: es la señal más fresca
    // de cuál está viva.
    if (scene) escenaViva = scene;
    estilos();
    enlazar(scene);

    // El color que el jugador se eligió. Llega dentro del mensaje y lo pone el
    // servidor, no el cliente que lo escribió.
    if (nombreEl) {
      var c = colorSeguro(msg.nameColor);
      if (c) nombreEl.style.color = c;
    }

    if (!msg.mid || !textoEl) return;   // mensaje de un servidor antiguo

    var reg = { linea: linea, textoEl: textoEl, msg: msg };
    pintados.set(msg.mid, reg);

    // Poda: una partida larga no puede acumular referencias a nodos sin fin.
    if (pintados.size > TOPE_REGISTRO) {
      var sobran = pintados.size - TOPE_REGISTRO;
      var it = pintados.keys();
      for (var i = 0; i < sobran; i++) {
        var k = it.next();
        if (!k.done) pintados.delete(k.value);
      }
    }

    var barra = el('span', 'gfcs-barra');

    var reaccionar1 = el('button', 'gfcs-bot', '☺');
    reaccionar1.type = 'button';
    reaccionar1.title = 'React to this message';
    reaccionar1.setAttribute('aria-label', 'React to this message');
    reaccionar1.addEventListener('click', function (e) {
      e.stopPropagation();
      abrirPaleta(scene, msg.mid, reaccionar1);
    });
    barra.appendChild(reaccionar1);

    if (puedoEditar(scene, msg)) {
      var lapiz = el('button', 'gfcs-bot gfcs-lapiz', '✎');
      lapiz.type = 'button';
      lapiz.title = 'Edit (only once, within 2 minutes)';
      lapiz.setAttribute('aria-label', 'Edit this message');
      lapiz.addEventListener('click', function (e) {
        e.stopPropagation();
        empezarEdicion(scene, reg);
      });
      barra.appendChild(lapiz);

      /* El lápiz se retira solo cuando vence el plazo. Sin esto, el botón se
         quedaría puesto para siempre y al pulsarlo el servidor contestaría
         "fuera de plazo": un botón que solo sirve para dar un error. */
      var quedan = EDICION_PLAZO_MS - (Date.now() - Date.parse(msg.ts));
      if (quedan > 0 && quedan < 0x7fffffff) {
        setTimeout(function () {
          if (lapiz.parentNode) lapiz.parentNode.removeChild(lapiz);
        }, quedan);
      }
    }

    // La barra va detrás de la hora, al final de la línea.
    linea.appendChild(barra);

    if (msg.editado) marcarEditado(reg);
    if (msg.reacciones && msg.reacciones.length) pintarReacciones(scene, reg);
  }

  /**
   * ¿Lo que el jugador ha escrito era un comando?
   *
   * Devuelve true si lo era, y entonces la escena NO debe enviarlo al chat.
   *
   * Se interpreta aquí ADEMÁS de en el servidor. Los dos sitios hacen falta:
   * aquí para que la respuesta sea inmediata y para que el comando no llegue a
   * salir por el chat de nadie; y en el servidor para que una pestaña vieja que
   * no tenga este módulo tampoco lo suelte en el canal.
   */
  function comando(scene, texto) {
    var t = String(texto || '').trim();
    if (t.charAt(0) !== '/') return false;

    var m = /^\/add_?friend\s+(.+)$/i.exec(t);
    if (m) {
      // Las comillas son opcionales: `/add_friend "Ana"` y `/add_friend Ana`
      // hacen lo mismo. Se admiten también las tipográficas, que es lo que
      // pone el teclado del móvil sin avisar.
      var nombre = m[1].trim().replace(/^["'“”]+|["'“”]+$/g, '');
      if (!nombre) {
        avisar(scene, 'Usage: /add_friend "PlayerName"', 'error');
        return true;
      }
      if (global.GFAmigos && global.GFAmigos.pedirAmistad) {
        global.GFAmigos.pedirAmistad(nombre);
      } else {
        var s = socketVivo(scene);
        if (s && s.connected) s.emit('friends:request', { nombre: nombre });
        else avisar(scene, 'No connection right now.', 'error');
      }
      return true;
    }

    if (/^\/(help|comandos|commands)\b/i.test(t)) {
      if (scene && typeof scene.appendSystemMessage === 'function') {
        scene.appendSystemMessage('Commands:  /add_friend "PlayerName"  — send a friend request');
      }
      return true;
    }

    /* Cualquier otra cosa que empiece por "/" se manda tal cual, como toda la
       vida. Tragarse todo lo que empiece por barra impediría escribir una
       fecha o una fracción en el chat. */
    return false;
  }

  function montar(scene) {
    // La escena viva se apunta ANTES de enlazar: si el socket ya estaba
    // enganchado, `enlazar` se va sin hacer nada y esta es la única línea que
    // corre — y es justo la que hace falta.
    if (scene) escenaViva = scene;
    estilos();
    enlazar(scene);
    vigilarChat();
    /* Al entrar en una escena con el chat ya abierto no puede quedar un aviso
       de antes puesto: se ve el chat y el botón titilando a la vez. */
    if (chatAbierto()) apagarAviso();
    return true;
  }

  /** Se llama al vaciar el chat: los nodos apuntados ya no existen. */
  function olvidar() {
    pintados.clear();
    cerrarPaleta();
  }

  global.GFChatSocial = {
    montar: montar,
    decorar: decorar,
    comando: comando,
    olvidar: olvidar,
    /* El aviso del botón del chat, por si alguna escena necesita apagarlo a
       mano (al esconder el HUD, por ejemplo). */
    avisoChat: encenderAviso,
    apagarAvisoChat: apagarAviso,
    hayAvisoChat: function () {
      var b = botonChat();
      return !!(b && b.classList.contains(CLASE_TITILA));
    },
    EMOJIS: EMOJIS,
    _interno: {
      desescapar: desescapar, colorSeguro: colorSeguro,
      puedoEditar: puedoEditar, pintados: pintados,
      EDICION_PLAZO_MS: EDICION_PLAZO_MS
    }
  };

})(window);
