/* =============================================================================
 * GF CHAT SOCIAL — reacciones, editar una vez y comandos del chat general
 * =============================================================================
 *
 * QUÉ AÑADE AL CHAT QUE YA HABÍA
 * ---------------------------------------------------------------------------
 *   · REACCIONES. Seis emojis fijos debajo de cada mensaje. Se pulsa uno y se
 *     pone; se vuelve a pulsar y se quita. Se ve quién ha reaccionado al pasar
 *     el ratón por encima.
 *   · EDITAR: NO, aquí no. Un mensaje público que cambia después de que lo
 *     hayan leído no es de fiar, y así lo pidió el jugador. La edición vive
 *     solo en los mensajes privados (gf-amigos.js), donde hablas con UNA
 *     persona y arreglar una errata no engaña a nadie.
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

  /* Registro de mensajes pintados: mid -> { linea, textoEl, msg }.
     Hace falta porque una reacción llega DESPUÉS, por el socket, y hay que
     saber qué línea repintar. Se poda para que una sesión larga no acumule
     referencias a nodos que ya nadie mira. */
  var pintados = new Map();
  var TOPE_REGISTRO = 300;

  /* TOPE DE RENGLONES EN PANTALLA.

     `chatMessages.appendChild(line)` no quitaba nunca nada: una partida de tres
     horas deja miles de renglones en el DOM. Ya pasaba antes, pero ahora cada
     renglón lleva además botones con sus manejadores y su entrada en el
     registro, así que pesa el triple — y un DOM de miles de nodos es justo lo
     que produce los tirones al pintar y al desplazar.

     200 es de sobra: el servidor solo guarda 50 de historial, así que nadie va
     a echar de menos el renglón 201. Se poda de 20 en 20 y no de uno en uno
     para no tocar el DOM en cada mensaje. */
  var TOPE_RENGLONES = 200;
  var PODA_RENGLONES = 20;

  function podarChat(caja) {
    if (!caja || !caja.children) return;
    var sobran = caja.children.length - TOPE_RENGLONES;
    if (sobran < PODA_RENGLONES) return;
    for (var i = 0; i < sobran; i++) {
      var viejo = caja.firstElementChild;
      if (!viejo) break;
      var mid = viejo.getAttribute && viejo.getAttribute('data-mid');
      if (mid) pintados.delete(mid);
      caja.removeChild(viejo);
    }
  }

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

  /**
   * Deshace el escapado del servidor, sin innerHTML.
   *
   * El backend pasa cada mensaje por escapeHtml() antes de repartirlo, así que
   * llega con `&amp;`, `&#039;`… Aquí todo se pinta con textContent —que ya es
   * seguro por sí mismo— y sin deshacer ese escapado el jugador vería
   * literalmente "&#039;" en vez de un apóstrofo. Se hace con reemplazos
   * explícitos y NUNCA con innerHTML: interpretar HTML aquí reabriría justo el
   * agujero que el escapado del servidor cierra.
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


  /* ══════════════════════════════════════════════════════════════════════
     EL CATÁLOGO DE EMOJIS, Y POR QUÉ SE FILTRA EN CALIENTE
     ──────────────────────────────────────────────────────────────────────
     EL FALLO: varios emojis salían como un cuadrado vacío. No era el chat: era
     que la lista tenía emojis de Unicode 13 y 14 (🪵 🪨 🪙 🪓 🫶 …) y la fuente
     Segoe UI Emoji de Windows 10 se quedó en Unicode 12. Un emoji que la fuente
     no tiene se pinta como "tofu" — el rectángulo vacío — y no hay forma de
     saberlo desde CSS.

     LA SOLUCIÓN NO ES RECORTAR LA LISTA. Recortarla al mínimo común dejaría a
     quien tiene un móvil moderno sin la mitad de los emojis que sí puede ver.
     Lo que se hace es DIBUJAR CADA UNO en un lienzo y comparar su huella con la
     del carácter que ninguna fuente tiene (U+FFFF): si coinciden, este
     dispositivo no lo sabe pintar y no se enseña.

     Así la lista puede ser todo lo larga que se quiera —hay más de doscientos—
     y cada jugador ve exactamente los que su equipo dibuja bien. Se hace UNA
     vez, la primera que se abre un selector, y se guarda.
     ══════════════════════════════════════════════════════════════════════ */

  /* La pila de fuentes de emoji. Va delante de todo en los botones del selector
     y en las chapas de reacción, que son elementos de solo-emoji: así el
     navegador no intenta primero una fuente de texto que no los tiene. */
  var FUENTE_EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",' +
                     '"Twemoji Mozilla","Segoe UI Symbol","Android Emoji",sans-serif';

  var CATEGORIAS_EMOJI = [
    { nombre: 'Smileys', lista: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍',
      '🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
      '🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴',
      '😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓',
      '🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢',
      '😭','😱','😖','😣','😞','😓','😩','😫','😤','😡','😠','🤬','😈','👿','💀',
      '💩','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'
    ] },
    { nombre: 'Gestures', lista: [
      '👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪',
      '🦵','🦶','👂','👃','👀','👁️','👅','👄','💋','🧠','🦷','🦴'
    ] },
    { nombre: 'People', lista: [
      '👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁',
      '🙋','🙇','🤦','🤷','👮','🕵️','💂','👷','🤴','👸','🧙','🧚','🧛','🧜','🧝',
      '🎅','🤶','🦸','🦹','💃','🕺','👯','🧘','🛌','🏃','🚶'
    ] },
    { nombre: 'Game', lista: [
      '⚔️','🛡️','🏹','🔨','⛏️','⚒️','🗡️','🔪','🪓','🎣','🧪','⚗️','💎','💰','🪙',
      '💵','🧭','🗺️','🗝️','🔑','🔒','🔓','⏳','⌛','⏰','🔔','🔕','📦','🎁','🎈',
      '🎊','🎉','🏆','🥇','🥈','🥉','🎖️','🏅','⭐','🌟','✨','💫','🔥','💥','⚡',
      '💧','🌊','❄️','🪵','🪨','🧱','🛢️','⚙️','🧰','🔧','🪚','🧲','🎯','🎲','🕹️'
    ] },
    { nombre: 'Farm', lista: [
      '🌱','🌿','☘️','🍀','🎋','🌾','🌵','🌴','🌳','🌲','🍁','🍂','🍃','🌺','🌸',
      '🌼','🌻','🌷','🌹','🥀','💐','🍄','🌰','🥕','🥔','🍠','🌽','🍅','🥒','🥬',
      '🥦','🧄','🧅','🍆','🥑','🫐','🍓','🍇','🍉','🍎','🍏','🍐','🍑','🍒','🍍',
      '🥝','🍌','🍋','🥥','🌶️','🍯','🥚','🧀','🍞','🥖','🥐','🍪','🍰','🧁','🍫'
    ] },
    { nombre: 'Animals', lista: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
      '🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄',
      '🐝','🐛','🦋','🐌','🐞','🐜','🕷️','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦀',
      '🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🦓','🦍','🐘','🦏','🐪','🦙',
      '🐑','🐐','🦌','🐕','🐈','🐓','🦃','🕊️','🐇','🐁','🐀','🐿️','🦔'
    ] },
    { nombre: 'Weather', lista: [
      '☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨',
      '🌪️','🌫️','🌈','☂️','☔','🌙','🌛','🌜','🌚','🌝','🌞','⭐','🌠','🌌','🌍'
    ] },
    { nombre: 'Chat', lista: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗',
      '💖','💘','💝','💯','✅','❌','❗','❓','💬','💭','🗯️','👀','🎵','🎶','🚀',
      '🛒','🏠','🏡','🏰','⛺','🚪','🛏️','🪑','🚽','🚿','🧹','🧺','🧼','📜','📖',
      '📝','✏️','📌','📍','🔎','🔍','⚠️','🚧','🆗','🆕','🔝','♻️','⚓','🧭'
    ] }
  ];

  /* ¿QUÉ EMOJIS SABE DIBUJAR ESTE EQUIPO?

     Se dibujan TODOS en una sola rejilla y se lee el lienzo UNA vez. La versión
     anterior hacía un `getImageData` por emoji y tardaba 754 ms —medido— porque
     el coste está en la llamada, que sincroniza con la GPU, no en los píxeles.
     Con una sola lectura son unos pocos milisegundos, y además pasa una sola
     vez: la primera que se abre un selector.

     La celda es más ancha que la letra a propósito: un emoji puede sobresalir
     un poco de su caja y, si se solaparan, la huella de uno contaminaría la del
     vecino y se descartaría un emoji perfectamente bueno. */
  var soporteEmoji = null;

  function calcularSoporte(lista) {
    var CELDA = 28, LETRA = 18, COLS = 24;
    var acepta = {};
    try {
      // La celda 0 la ocupa U+FFFF, que no existe en ninguna fuente: es el
      // "tofu" con el que se compara todo lo demás.
      var todos = ['\uFFFF'].concat(lista);
      var filas = Math.ceil(todos.length / COLS);
      var lienzo = doc.createElement('canvas');
      lienzo.width  = COLS * CELDA;
      lienzo.height = filas * CELDA;
      var ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.textBaseline = 'top';
      ctx.font = LETRA + 'px ' + FUENTE_EMOJI;

      for (var i = 0; i < todos.length; i++) {
        ctx.fillText(todos[i], (i % COLS) * CELDA + 4, Math.floor(i / COLS) * CELDA + 4);
      }

      var datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
      var ancho = lienzo.width;

      /* Huella de una celda: solo el canal alfa, o sea la FORMA. El color no
         importa —lo que se quiere saber es si hay dibujo y si es el del tofu—,
         y mirar un canal en vez de cuatro es cuatro veces menos trabajo. */
      var huella = function (celda) {
        var cx = (celda % COLS) * CELDA, cy = Math.floor(celda / COLS) * CELDA;
        var h = 0, vacia = true;
        for (var y = 0; y < CELDA; y++) {
          var fila = ((cy + y) * ancho + cx) * 4 + 3;
          for (var x = 0; x < CELDA; x++) {
            var a = datos[fila + x * 4];
            if (a) vacia = false;
            h = ((h * 31) + a) | 0;
          }
        }
        return vacia ? null : h;
      };

      var tofu = huella(0);
      for (var k = 0; k < lista.length; k++) {
        var hk = huella(k + 1);
        acepta[lista[k]] = (hk !== null && hk !== tofu);
      }
    } catch (e) {
      /* Sin lienzo (navegador raro, modo privado estricto) se aceptan todos:
         ver alguno mal es mejor que quedarse sin selector. */
      for (var j = 0; j < lista.length; j++) acepta[lista[j]] = true;
    }
    return acepta;
  }

  function prepararSoporteEmoji() {
    if (soporteEmoji) return soporteEmoji;
    var todos = [];
    CATEGORIAS_EMOJI.forEach(function (c) {
      c.lista.forEach(function (e) { if (todos.indexOf(e) < 0) todos.push(e); });
    });
    var tabla = calcularSoporte(todos);
    soporteEmoji = function (ch) { return tabla[ch] !== false; };
    return soporteEmoji;
  }

  /** Las categorías, ya sin los emojis que este equipo no sabe dibujar. */
  var categoriasFiltradas = null;

  function categoriasEmojiUsables() {
    if (categoriasFiltradas) return categoriasFiltradas;
    var acepta = prepararSoporteEmoji();
    categoriasFiltradas = CATEGORIAS_EMOJI.map(function (cat) {
      return { nombre: cat.nombre, lista: cat.lista.filter(acepta) };
    }).filter(function (cat) { return cat.lista.length > 0; });

    try {
      var total = CATEGORIAS_EMOJI.reduce(function (n, c) { return n + c.lista.length; }, 0);
      var quedan = categoriasFiltradas.reduce(function (n, c) { return n + c.lista.length; }, 0);
      if (quedan < total) {
        log('este equipo no dibuja ' + (total - quedan) + ' de ' + total +
            ' emojis: se ocultan para que no salgan como un cuadrado vacío');
      }
    } catch (e) {}
    return categoriasFiltradas;
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  function estilos() {
    if (doc.getElementById('gfcs-estilos')) return;
    var s = doc.createElement('style');
    s.id = 'gfcs-estilos';
    s.textContent = [
      '.chat-line{position:relative;}',
      /* FLOTANDO SOBRE LA LÍNEA, NO DENTRO DE ELLA.
         Era `inline-flex`, o sea que al pasar el ratón aparecían dos botones de
         20 px, el renglón crecía y el chat entero pegaba un salto. En absoluta
         aparece y desaparece sin mover nada. `.chat-line` ya es `relative`. */
      '.gfcs-barra{position:absolute;top:2px;right:4px;display:flex;gap:3px;',
      '  opacity:0;transition:opacity .15s;pointer-events:none;',
      '  background:rgba(6,14,30,0.82);border-radius:7px;padding:1px 2px;}',
      '.chat-line:hover .gfcs-barra,.gfcs-barra.fijo{opacity:1;pointer-events:auto;}',
      '.gfcs-bot{background:rgba(64,160,255,0.14);border:1px solid rgba(64,160,255,0.28);',
      '  color:#a8d8ff;border-radius:6px;width:20px;height:20px;font-size:11px;line-height:1;',
      '  cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;}',
      '.gfcs-bot:hover{background:rgba(64,160,255,0.30);}',

      '.gfcs-paleta{position:absolute;z-index:10040;display:flex;gap:2px;padding:5px 6px;',
      '  background:rgba(8,18,40,0.97);border:1px solid rgba(64,160,255,0.38);',
      '  border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.55);}',
      '.gfcs-paleta button{background:none;border:none;font-size:18px;line-height:1;',
      '  cursor:pointer;padding:3px 4px;border-radius:6px;',
      /* La fuente de emoji DELANTE: son botones de solo-emoji, y si el
         navegador prueba antes una fuente de texto puede acabar pintando la
         versión en blanco y negro. */
      '  font-family:' + FUENTE_EMOJI + ';}',
      '.gfcs-paleta button:hover{background:rgba(64,160,255,0.22);}',

      '.gfcs-reacs{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 0 2px;}',
      '.gfcs-reac{display:inline-flex;align-items:center;gap:3px;font-size:11px;',
      '  font-family:' + FUENTE_EMOJI + ';',
      '  background:rgba(20,50,100,0.5);border:1px solid rgba(64,160,255,0.22);',
      '  color:#cfe6ff;border-radius:11px;padding:1px 7px;cursor:pointer;line-height:1.5;}',
      '.gfcs-reac:hover{background:rgba(40,90,160,0.6);}',
      '.gfcs-reac.mia{border-color:rgba(90,200,255,0.75);background:rgba(30,90,170,0.7);}',

      /* En el móvil el sitio de la barra lo ocupa la hora: se aparta un poco
         para que no se solapen. */
      '@media (hover:none){ .gfcs-barra{position:static;opacity:.55;',
      '  display:inline-flex;margin-left:6px;vertical-align:middle;',
      '  background:none;padding:0;pointer-events:auto;} }',

      /* En el móvil no hay `hover`: los botones se quedan puestos, pero muy
         discretos, o el chat se llena de iconos. */
      '@media (hover:none){',
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
  /* Lo que este módulo engancha en cada socket, para poder soltarlo. Sin esto,
     al sustituirse `window.globalSocket` (reconexión) los manejadores del
     anterior se quedaban puestos: el socket muerto no se puede recoger mientras
     alguien cierre sobre él, y se van sumando uno por reconexión. */
  var oyentesPuestos = [];

  function soltarOyentes() {
    if (!socketEnlazado) return;
    oyentesPuestos.forEach(function (par) {
      try { socketEnlazado.off(par[0], par[1]); } catch (e) {}
    });
    oyentesPuestos.length = 0;
  }

  function enlazar(scene) {
    var s = socketVivo(scene);
    if (!s || socketEnlazado === s) return s;
    soltarOyentes();          // los del socket anterior, que ya no sirve
    socketEnlazado = s;

    /* Se apunta lo que se engancha, PERO `s` sigue siendo el socket de verdad.

       El primer intento fue envolverlo en un objeto con `on`, `id` y
       `connected` copiados. Mala idea: los manejadores cierran sobre `s`, y uno
       de ellos compara `m.id === s.id` para saber si el mensaje es propio. Con
       el id COPIADO, en cuanto el socket reconectara (id nuevo) los mensajes
       propios dejarían de reconocerse y el botón del chat titilaría con lo que
       escribe uno mismo. Un envoltorio que congela estado es una fuente de
       fallos peor que la fuga que arreglaba. */
    var poner = function (evento, fn) {
      s.on(evento, fn);
      oyentesPuestos.push([evento, fn]);
    };

    /* El aviso del botón. Va aquí, junto a los demás oyentes del socket, y no
       en las escenas: el botón y el panel son DOM de la página, así que con uno
       solo funciona en el mapa y en la tienda. Se engancha a `chatMessage` —el
       mensaje que llega en vivo— y NO a `chatHistory`, para que entrar en una
       escena y recibir las últimas 50 líneas de golpe no deje el botón
       titilando por conversaciones de hace media hora. */
    poner('chatMessage', function (m) {
      avisarDeMensaje(s, m);
      // La poda va aquí, DESPUÉS de que la escena haya insertado el renglón:
      // dentro de `decorar` la línea todavía no está colgada del DOM.
      try { podarChat(doc.getElementById('chat-messages')); } catch (e) {}
    });

    poner('chatReaction', function (d) {
      if (!d || !d.mid) return;
      var reg = pintados.get(d.mid);
      if (!reg) return;
      reg.msg.reacciones = d.reacciones || [];
      pintarReacciones(escenaViva || scene, reg);
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
      /* CON `important`, O NO SE VE.

         `styless.css` fija `.chat-line strong { color: … !important }` en tres
         sitios distintos. Un `style.color` normal pierde contra eso, así que el
         color que el jugador elegía en el dashboard salía en su cartel del mapa
         pero NO en el chat. Con la tercera forma de setProperty se pone al
         mismo nivel y gana por ser en línea. */
      if (c) nombreEl.style.setProperty('color', c, 'important');
    }

    if (!msg.mid || !textoEl) return;   // mensaje de un servidor antiguo

    var reg = { linea: linea, textoEl: textoEl, msg: msg };
    pintados.set(msg.mid, reg);
    // Se apunta en el propio nodo para poder soltar su entrada del registro
    // cuando la poda lo quite del DOM.
    linea.setAttribute('data-mid', msg.mid);
    podarChat(linea.parentNode || (scene && scene.chatMessages) || null);

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

    /* AQUÍ NO HAY LÁPIZ. El chat general no se edita: un mensaje público que
       cambia después de leído no es de fiar. Editar existe en los privados,
       que es donde arreglar una errata no engaña a nadie. */

    // La barra va al final de la línea; el CSS la coloca flotando a la derecha
    // para que aparecer y desaparecer no mueva el renglón.
    linea.appendChild(barra);
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

  /**
   * Deja hecho el repaso de emojis ANTES de que nadie abra el selector.
   *
   * Mirar cuáles sabe dibujar el equipo cuesta unos 80 ms (una sola lectura del
   * lienzo, ver `calcularSoporte`). No es mucho, pero caería justo en el clic
   * que abre el selector, que es cuando peor sienta. Hecho en un rato muerto,
   * el jugador no lo pisa nunca.
   *
   * `requestIdleCallback` no está en todos los navegadores; el respaldo es un
   * temporizador largo, que para esto vale igual.
   */
  function precalentarEmojis() {
    if (global.__gfcsEmojisListos) return;
    global.__gfcsEmojisListos = true;
    var hazlo = function () { try { categoriasEmojiUsables(); } catch (e) {} };
    if (typeof global.requestIdleCallback === 'function') {
      global.requestIdleCallback(hazlo, { timeout: 4000 });
    } else {
      setTimeout(hazlo, 2500);
    }
  }

  function montar(scene) {
    // La escena viva se apunta ANTES de enlazar: si el socket ya estaba
    // enganchado, `enlazar` se va sin hacer nada y esta es la única línea que
    // corre — y es justo la que hace falta.
    if (scene) escenaViva = scene;
    estilos();
    enlazar(scene);
    precalentarEmojis();
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
    /* La lista de emojis del chat general, para que el selector de los
       privados sea EL MISMO y no dos catálogos que se separen con el tiempo. */
    CATEGORIAS_EMOJI: CATEGORIAS_EMOJI,
    /* Las que ESTE equipo sabe dibujar. Es lo que deben usar los selectores:
       las crudas llevan emojis que en un Windows 10 salen como un cuadrado. */
    categoriasEmojiUsables: categoriasEmojiUsables,
    soportaEmoji: function (ch) { return prepararSoporteEmoji()(ch); },
    FUENTE_EMOJI: FUENTE_EMOJI,
    _interno: {
      desescapar: desescapar, colorSeguro: colorSeguro,
      pintados: pintados
    }
  };

})(window);
