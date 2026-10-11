/* ===========================================================================
 * EL TRADUCTOR DEL CHAT                                            (2026-10-05)
 *
 * Lo que pidió el jugador: "en el chat general y en el chat privado quiero
 * que se puedan traducir los mensajes, de inglés a español y de español a
 * inglés; pon un botón en el chat".
 *
 * CÓMO SE USA
 *   El botón 🌐 (junto a los emojis en el chat general, y en la cabecera de
 *   cada conversación privada) va pasando por tres estados:
 *       apagado  →  traducir a español  →  traducir a inglés  →  apagado
 *   Es UN solo ajuste para los dos chats (se recuerda en este navegador). Con
 *   él encendido, debajo de cada mensaje sale su traducción (también de los
 *   propios: así el jugador ve qué leen los demás); el original no se toca.
 *   Si el mensaje ya está en ese idioma no sale nada. Encenderlo traduce
 *   también lo que ya estaba en pantalla.
 *
 * QUIÉN TRADUCE                                                  (2026-10-10)
 *   "El traductor del chat general no sirve." Antes TODO pasaba por el
 *   servidor (POST /api/chat/traducir): si el servidor desplegado aún no
 *   tenía esa ruta (404), o Google bloqueaba la IP del centro de datos donde
 *   corre, no salía ni una traducción, solo el aviso de "no disponible".
 *   Ahora el NAVEGADOR pide la traducción directamente (Google gtx y, si
 *   falla, clients5; los dos admiten CORS y la CSP ya deja `https:`), desde
 *   la IP del propio jugador, que no está bloqueada. El servidor queda de
 *   respaldo solo para los textos que no salieron. Lo traducido se recuerda.
 *
 * CÓMO SE ENGANCHA
 *   GFTraductor.traducirEn(textoEl, texto, { mio, dentro })
 *     - el chat general, desde GFChatSocial.decorar (sirve al pueblo y a la
 *       tienda a la vez: esa función es la única que tocan las dos escenas);
 *     - los privados, desde gf-amigos.js al pintar o editar una burbuja.
 *   `dentro`: el nodo al que se cuelga la traducción (si no, va justo
 *   después del texto).
 * ======================================================================== */
(function () {
  'use strict';

  var CLAVE = 'gf_traducir';
  var MODOS = ['', 'es', 'en'];
  var NOMBRE = { '': 'off', es: 'Spanish', en: 'English' };
  var LOTE = 20;                  // textos por petición (el servidor admite 25)
  var ESPERA_LOTE = 80;           // ms que se espera a juntar un lote
  var TOPE_CACHE = 600;
  var PAUSA_FALLO = 60000;        // tras un fallo del servidor, un minuto sin pedir
  var TIEMPO_DIRECTO = 6000;      // ms que se espera a Google antes de rendirse
  var A_LA_VEZ = 3;               // peticiones directas simultáneas como mucho
  var FALLOS_PARA_PAUSA = 4;      // fallos directos seguidos antes de ir solo al servidor

  var modo = '';
  try { modo = localStorage.getItem(CLAVE) || ''; } catch (e) { modo = ''; }
  if (MODOS.indexOf(modo) < 0) modo = '';

  var botones = [];               // todos los 🌐 de la página
  var vigilados = new Set();      // los <span> de texto que se traducen
  var cache = new Map();          // 'a\u0001texto' -> { t, de } | null (no hace falta)
  var cola = new Map();           // 'a\u0001texto' -> [nodos que esperan]
  var enCurso = new Map();
  var lotes = [];
  var loteActivo = false;
  var relojLote = null;
  var pausaHasta = 0;
  var avisadoFallo = 0;
  var directoPausa = 0;           // hasta cuándo no se prueba la vía directa
  var fallosDirectos = 0;

  function avisar(texto, tipo) {
    try {
      var s = window.game && window.game.scene && window.game.scene.getScenes(true)[0];
      if (s && s.notifications && s.notifications.show) { s.notifications.show(texto, tipo || 'info'); return; }
    } catch (e) {}
    try { console.log('[traductor]', texto); } catch (e) {}
  }

  function api(cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api('/api/chat/traducir', cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }

  // ─────────────────────────────────────────────────────────── VÍA DIRECTA
  /** GET con tiempo límite. Sin cookies ni referer: a Google no le va nada. */
  function pedirJson(url) {
    var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
    var reloj = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, TIEMPO_DIRECTO);
    var op = { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (ctl) op.signal = ctl.signal;
    return fetch(url, op).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) { clearTimeout(reloj); return d; },
            function (e) { clearTimeout(reloj); throw e; });
  }

  /** translate.googleapis.com (client=gtx): [[["trozo",..],..], null, "idioma"] */
  function googleGtx(texto, a) {
    return pedirJson('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + a +
                     '&dt=t&q=' + encodeURIComponent(texto)).then(function (d) {
      if (!Array.isArray(d) || !Array.isArray(d[0])) throw new Error('formato');
      var t = d[0].map(function (p) { return (Array.isArray(p) && typeof p[0] === 'string') ? p[0] : ''; }).join('');
      if (!t) throw new Error('vacio');
      return { t: t, de: typeof d[2] === 'string' ? d[2].slice(0, 8) : null };
    });
  }

  /** clients5.google.com (la de la extensión de Chrome): [["texto","idioma"]] */
  function googleClients5(texto, a) {
    return pedirJson('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' + a +
                     '&q=' + encodeURIComponent(texto)).then(function (d) {
      var x = Array.isArray(d) ? d[0] : null;
      var t = Array.isArray(x) ? x[0] : x;
      if (typeof t !== 'string' || !t) throw new Error('formato');
      return { t: t, de: (Array.isArray(x) && typeof x[1] === 'string') ? x[1].slice(0, 8) : null };
    });
  }

  function directo(texto, a) {
    return googleGtx(texto, a).catch(function () { return googleClients5(texto, a); });
  }

  /** ¿El idioma detectado es el de destino? ("es-419" cuenta como "es") */
  function mismoIdioma(de, a) {
    return !!de && String(de).toLowerCase().slice(0, 2) === a;
  }

  /** ¿Tiene letras? Un mensaje de solo emojis, números o signos no se traduce. */
  function merece(texto) {
    try { return /\p{L}{2,}/u.test(texto); } catch (e) { return /[A-Za-zÀ-ÿ]{2,}/.test(texto); }
  }

  function igualesSinMas(a, b) {
    var n = function (s) { return String(s || '').toLowerCase().replace(/[\s.,;:!?¡¿'"()\-]+/g, ''); };
    return n(a) === n(b);
  }

  // ─────────────────────────────────────────────────────────── EL BOTÓN
  function pintarBoton(b) {
    b.classList.toggle('activo', !!modo);
    b.setAttribute('data-modo', modo || 'off');
    b.setAttribute('aria-pressed', modo ? 'true' : 'false');
    var t = modo ? 'Translating messages to ' + NOMBRE[modo] + ' — tap to change'
                 : 'Translate messages (English ⇄ Spanish)';
    b.title = t;
    b.setAttribute('aria-label', t);
    var marca = b.querySelector('.gft-marca');
    if (marca) marca.textContent = modo ? modo.toUpperCase() : '';
  }

  /** Engancha (o crea) un botón 🌐. Con `el` usa ese nodo; si no, crea uno. */
  function boton(el, clase) {
    var b = el || document.createElement('button');
    if (b.__gft) return b;
    b.__gft = true;
    b.type = 'button';
    if (clase) b.className = (b.className ? b.className + ' ' : '') + clase;
    b.classList.add('gft-boton');
    if (!b.querySelector('.gft-globo')) {
      b.textContent = '';
      var g = document.createElement('span'); g.className = 'gft-globo'; g.textContent = '🌐';
      var m = document.createElement('span'); m.className = 'gft-marca';
      b.appendChild(g); b.appendChild(m);
    }
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      ponerModo(MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length], true);
    });
    // Que pulsarlo no le quite el foco al campo de escribir en el teléfono.
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    botones = botones.filter(function (v) { return v.isConnected; });
    botones.push(b);
    if (botones.length > 500) botones.shift();
    pintarBoton(b);
    return b;
  }

  function ponerModo(m, avisando) {
    if (MODOS.indexOf(m) < 0) m = '';
    modo = m;
    try { localStorage.setItem(CLAVE, modo); } catch (e) {}
    botones = botones.filter(function (b) { return b.isConnected || document.body.contains(b); });
    botones.forEach(pintarBoton);
    if (avisando) {
      avisar(modo ? '🌐 Chat translation: messages to ' + NOMBRE[modo] + '.' : '🌐 Chat translation off.', 'info');
    }
    refrescar();
  }

  // ─────────────────────────────────────────────────────────── PINTAR
  function quitarTraduccion(el) {
    var n = el.__gftNodo;
    if (n && n.parentNode) n.parentNode.removeChild(n);
    el.__gftNodo = null;
  }

  function ponerTraduccion(el, texto, estado) {
    quitarTraduccion(el);
    if (!el.isConnected) return;
    var n = document.createElement('span');
    n.className = 'gft-trad' + (estado === 'cargando' ? ' cargando' : '');
    n.setAttribute('lang', modo || 'en');
    n.textContent = estado === 'cargando' ? '🌐 …' : '🌐 ' + texto;
    var dentro = el.__gftDentro;
    if (dentro && dentro.isConnected) dentro.appendChild(n);
    else if (el.parentNode) el.parentNode.insertBefore(n, el.nextSibling);
    el.__gftNodo = n;
  }

  function aplicar(el) {
    if (!el || !el.isConnected) { vigilados.delete(el); return; }
    var texto = el.__gftTexto;
    // Los propios también (antes no): probando a solas no salía NADA y
    // parecía roto; y sirve para ver cómo les llega a los demás.
    if (!modo || !merece(texto)) { quitarTraduccion(el); return; }
    var k = modo + '\u0001' + texto;
    if (cache.has(k)) {
      var r = cache.get(k);
      if (!r || mismoIdioma(r.de, modo) || igualesSinMas(r.t, texto)) quitarTraduccion(el);
      else ponerTraduccion(el, r.t);
      return;
    }
    if (Date.now() < pausaHasta) { quitarTraduccion(el); return; }
    ponerTraduccion(el, '', 'cargando');
    var trabajo = enCurso.get(k);
    if (trabajo) { if (trabajo.nodos.indexOf(el) < 0) trabajo.nodos.push(el); return; }
    var esperan = cola.get(k);
    if (esperan) { if (esperan.indexOf(el) < 0) esperan.push(el); }
    else {
      if (cola.size + enCurso.size >= 500) { quitarTraduccion(el); return; }
      cola.set(k, [el]);
    }
    if (!relojLote) relojLote = setTimeout(vaciarCola, ESPERA_LOTE);
  }

  function guardar(k, valor) {
    cache.set(k, valor);
    if (cache.size > TOPE_CACHE) {
      var sobra = cache.size - TOPE_CACHE, it = cache.keys();
      for (var i = 0; i < sobra; i++) cache.delete(it.next().value);
    }
  }

  function vaciarCola() {
    relojLote = null;
    if (!cola.size) return;
    // Por idioma: si el jugador cambió de modo a medias, cada lote va al suyo.
    var porIdioma = {};
    cola.forEach(function (nodos, k) {
      nodos = nodos.filter(function (el) { return el.isConnected; });
      if (!nodos.length) return;
      var i = k.indexOf('\u0001');
      var a = k.slice(0, i), t = k.slice(i + 1);
      var trabajo = { k: k, t: t, nodos: nodos };
      enCurso.set(k, trabajo);
      (porIdioma[a] = porIdioma[a] || []).push(trabajo);
    });
    cola.clear();
    Object.keys(porIdioma).forEach(function (a) {
      var lista = porIdioma[a];
      for (var j = 0; j < lista.length; j += LOTE) lotes.push({ a: a, trozo: lista.slice(j, j + LOTE) });
    });
    bombearLotes();
  }

  function bombearLotes() {
    if (loteActivo || !lotes.length) return;
    loteActivo = true;
    var lote = lotes.shift();
    pedirLote(lote.a, lote.trozo).catch(function () {
      lote.trozo.forEach(function (x) { x.nodos.forEach(quitarTraduccion); });
    }).finally(function () {
      lote.trozo.forEach(function (x) { enCurso.delete(x.k); });
      loteActivo = false;
      bombearLotes();
    });
  }

  /**
   * Primero la vía directa, texto a texto y de A_LA_VEZ en A_LA_VEZ; lo que
   * no sale, en un solo lote al servidor. Si la vía directa falla varias
   * veces seguidas (red que bloquea Google, por ejemplo) se deja un minuto y
   * todo va al servidor, sin esperar cada vez a que caduque.
   */
  function pedirLote(a, trozo) {
    var fallidos = [];
    var i = 0;
    function siguiente() {
      if (i >= trozo.length) return Promise.resolve();
      var x = trozo[i++];
      x.nodos = x.nodos.filter(function (el) { return el.isConnected; });
      if (!x.nodos.length || !modo) return siguiente();
      if (Date.now() < directoPausa || typeof fetch !== 'function') { fallidos.push(x); return siguiente(); }
      return directo(x.t, a).then(function (r) {
        fallosDirectos = 0;
        guardar(x.k, { t: String(r.t).slice(0, 800), de: r.de || null });
        x.nodos.forEach(aplicar);
      }, function () {
        if (++fallosDirectos >= FALLOS_PARA_PAUSA) { directoPausa = Date.now() + PAUSA_FALLO; fallosDirectos = 0; }
        fallidos.push(x);
      }).then(siguiente);
    }
    var hilos = [];
    for (var h = 0; h < Math.min(A_LA_VEZ, trozo.length); h++) hilos.push(siguiente());
    return Promise.all(hilos).then(function () {
      if (fallidos.length) return pedirAlServidor(a, fallidos);
    });
  }

  /** El respaldo: POST /api/chat/traducir con todo el lote. */
  function pedirAlServidor(a, trozo) {
    return api({ a: a, textos: trozo.map(function (x) { return x.t; }) }).then(function (r) {
      var d = r && r.datos;
      if (!r || !r.ok || !d || !d.ok || !Array.isArray(d.traducciones)) throw new Error((d && d.error) || ('http ' + (r && r.status)));
      trozo.forEach(function (x, i) {
        var tr = d.traducciones[i];
        if (tr && typeof tr.t === 'string') guardar(x.k, { t: tr.t, de: tr.de || null });
        else if (tr === null) guardar(x.k, null);
        else { x.nodos.forEach(quitarTraduccion); return; }   // ese no salió: sin reintentar en bucle
        x.nodos.forEach(aplicar);
      });
    }).catch(function (e) {
      pausaHasta = Date.now() + PAUSA_FALLO;
      trozo.forEach(function (x) { x.nodos.forEach(quitarTraduccion); });
      if (Date.now() - avisadoFallo > PAUSA_FALLO) {
        avisadoFallo = Date.now();
        var limite = /demasiad|limite|429/.test(String(e && e.message));
        avisar(limite ? '🌐 Too many translations at once — try again in a minute.'
                      : '🌐 Translation is not available right now. Try again later.', 'warning');
      }
    });
  }

  /** Vuelve a mirar todo lo que hay en pantalla (al cambiar de modo). */
  function refrescar() {
    pausaHasta = 0;
    directoPausa = 0;
    fallosDirectos = 0;
    vigilados.forEach(function (el) {
      if (!el.isConnected) { vigilados.delete(el); return; }
      aplicar(el);
    });
  }

  /**
   * Traduce (si toca) el texto de un mensaje.
   *   el      el <span> con el texto del mensaje
   *   texto   el texto tal cual (sin el espacio de delante ni el nombre)
   *   op.mio  true si lo escribió el propio jugador (se guarda; desde
   *           2026-10-10 los propios también se traducen)
   *   op.dentro  dónde colgar la traducción (por defecto, tras el texto)
   */
  function traducirEn(el, texto, op) {
    if (!el) return;
    op = op || {};
    el.__gftTexto = String(texto == null ? '' : texto).trim().slice(0, 400);
    el.__gftMio = !!op.mio;
    el.__gftDentro = op.dentro || null;
    vigilados.add(el);
    if (vigilados.size > 500) {
      vigilados.forEach(function (v) { if (!v.isConnected) vigilados.delete(v); });
      while (vigilados.size > 500) vigilados.delete(vigilados.values().next().value);
    }
    // Recién creado, el nodo aún puede no estar en la página: se espera un
    // instante a que la escena lo cuelgue.
    if (el.isConnected) aplicar(el);
    else setTimeout(function () { aplicar(el); }, 0);
  }

  function montar() {
    var b = document.getElementById('chat-trad-btn');
    if (b) boton(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.GFTraductor = {
    traducirEn: traducirEn,
    boton: boton,
    modo: function () { return modo; },
    ponerModo: function (m) { ponerModo(m, false); },
    refrescar: refrescar,
    _interno: { cache: cache, cola: cola, enCurso: enCurso, lotes: lotes, vigilados: vigilados, merece: merece, igualesSinMas: igualesSinMas,
                directo: directo, mismoIdioma: mismoIdioma,
                pausa: function () { return pausaHasta; },
                pausaDirecta: function () { return directoPausa; } }
  };
})();
