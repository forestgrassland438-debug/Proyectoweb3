/**
 * AJUSTES DE GRÁFICOS — DISTANCIA DE VISIÓN Y CALIDAD
 * =============================================================================
 * Añade al panel de configuraciones (#hub-panel_101, el mismo que comparten
 * GameScene y tiendajuego) dos controles nuevos, JUSTO ENCIMA del selector de
 * idioma:
 *
 *   1. CALIDAD GRÁFICA (Alta / Media / Baja)
 *   2. DISTANCIA DE VISIÓN (barra, en "chunks")
 *
 * ── CÓMO FUNCIONA LA DISTANCIA DE VISIÓN ─────────────────────────────────────
 * Igual que en Minecraft: lo que queda más lejos del jugador que la distancia
 * elegida NO se dibuja, y en cuanto se acerca vuelve a aparecer. Aquí actúa
 * sobre las dos cosas que forman el mundo:
 *
 *   • EL TERRENO — lo sirve TileManager por trozos (tiles de 2048 px). La barra
 *     ajusta su `margin`, o sea cuántos trozos carga alrededor de la cámara.
 *     Bajarla descarga de memoria los trozos lejanos; subirla los vuelve a
 *     pedir.
 *
 *   • LOS OBJETOS — árboles, casas, molinos, cabañas, portales y demás imágenes
 *     del mapa. Son los sprites que GameScene crea con createOptimizedSprite(),
 *     que los marca con data('optimized'). Aquí se recorren y se ocultan los
 *     que estén más lejos del centro de la cámara que la distancia elegida.
 *
 * ── CÓMO FUNCIONA LA CALIDAD ─────────────────────────────────────────────────
 *   • Alta  → texturas del mapa en 'hd' (5008²), resolución de render sin tope,
 *             partículas activas.
 *   • Media → texturas en 'md' (2504²), resolución hasta 2×, partículas activas.
 *   • Baja  → texturas en 'low' (1252², dieciséis veces menos memoria de vídeo
 *             que 'hd'), resolución 1×, partículas apagadas.
 *
 * Todo se guarda en localStorage y se reaplica al entrar en cada escena, así
 * que sobrevive a cambiar de mapa, ir a la tienda y recargar la página.
 *
 * NO toca el zoom de la cámara ni ningún mecanismo de juego.
 * =============================================================================
 */
(function (global) {
  'use strict';

  var doc = global.document;

  // ── Constantes ─────────────────────────────────────────────────────────────

  var CLAVE_GUARDADO = 'gf.graficos.v1';

  // Un "chunk" son 512 px de mundo. El mapa mide 5008 px, así que la escala
  // útil va de 2 chunks (≈1 pantalla alrededor) a 16 (el mapa entero).
  var CHUNK_PX  = 512;
  var CHUNK_MIN = 2;
  var CHUNK_MAX = 16;

  var CALIDADES = {
    alta:  { lod: 'hd',  dpr: 0, particulas: true,  chunksSugeridos: 12, etiqueta: 'Alta' },
    media: { lod: 'md',  dpr: 2, particulas: true,  chunksSugeridos: 8,  etiqueta: 'Media' },
    baja:  { lod: 'low', dpr: 1, particulas: false, chunksSugeridos: 5,  etiqueta: 'Baja' }
  };

  // dpr: 0 = sin tope. Ver _gameSize() en app.js, que lee global.GF_MAX_DPR.

  // ── Estado ─────────────────────────────────────────────────────────────────

  var ajustes = { calidad: 'alta', chunks: 12 };

  function cargar() {
    try {
      var crudo = global.localStorage.getItem(CLAVE_GUARDADO);
      if (!crudo) return;
      var d = JSON.parse(crudo);
      if (d && CALIDADES[d.calidad]) ajustes.calidad = d.calidad;
      if (d && typeof d.chunks === 'number') {
        ajustes.chunks = Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, Math.round(d.chunks)));
      }
    } catch (e) { /* localStorage bloqueado: se usan los valores por defecto */ }
  }

  function guardar() {
    try { global.localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(ajustes)); }
    catch (e) { /* modo privado: no se puede guardar, no es crítico */ }
  }

  // ── Acceso al juego ────────────────────────────────────────────────────────

  function juego() {
    return global.game || (global.phaserScaler && global.phaserScaler.game) || null;
  }

  /** Escenas vivas (GameScene, tiendajuego…). */
  function escenasActivas() {
    var g = juego();
    if (!g || !g.scene || typeof g.scene.getScenes !== 'function') return [];
    try { return g.scene.getScenes(true) || []; } catch (e) { return []; }
  }

  // ── Aplicación: TERRENO ────────────────────────────────────────────────────

  /**
   * El terreno viaja en tiles de 2048 px; la barra está en chunks de 512 px.
   * Se convierte y se deja un mínimo de 1 para no dejar nunca el suelo vacío
   * alrededor del jugador.
   */
  function margenDeTiles(chunks, tileSize) {
    var px = chunks * CHUNK_PX;
    return Math.max(1, Math.round(px / (tileSize || 2048)));
  }

  function aplicarATerreno(escena) {
    var tms = escena._tileManagers;
    if (!tms || !tms.length) return;

    var lod = CALIDADES[ajustes.calidad].lod;

    tms.forEach(function (tm) {
      if (!tm) return;
      try {
        if (typeof tm.setLOD === 'function') tm.setLOD(lod);
        if (typeof tm.setMargin === 'function') tm.setMargin(margenDeTiles(ajustes.chunks, tm.tileSize));
      } catch (e) { console.warn('⚠️ Gráficos: no se pudo ajustar un TileManager:', e); }
    });
  }

  // ── Aplicación: OBJETOS DEL MAPA ───────────────────────────────────────────
  //
  // Se ocultan/muestran los sprites marcados con data('optimized') según su
  // distancia al centro de la cámara.
  //
  // CUIDADO CON NO "RESUCITAR" COSAS: un árbol talado o una puerta cerrada
  // están invisibles porque el JUEGO lo decidió, no porque estén lejos. Por eso
  // solo se vuelve a mostrar lo que ESTE módulo escondió (marca __gfCulled), y
  // se restaura el valor que tenía justo antes de esconderlo. Lo que ya estaba
  // invisible al salir del rango se queda como estaba.

  function objetosDelMapa(escena) {
    if (!escena.children || !escena.children.list) return [];
    var salida = [];
    var lista = escena.children.list;
    for (var i = 0; i < lista.length; i++) {
      var o = lista[i];
      if (o && o.getData && o.active !== undefined) {
        try { if (o.getData('optimized')) salida.push(o); } catch (e) {}
      }
    }
    return salida;
  }

  function aplicarAObjetos(escena) {
    var cam = escena.cameras && escena.cameras.main;
    if (!cam) return;

    var radio  = ajustes.chunks * CHUNK_PX;
    var radio2 = radio * radio;

    // Histéresis: se vuelve a mostrar un poco antes de lo que se esconde, para
    // que un objeto justo en el límite no parpadee al andar de un lado a otro.
    var radioMostrar2 = radio2;
    var radioOcultar2 = (radio * 1.12) * (radio * 1.12);

    var cx = cam.worldView.x + cam.worldView.width  / 2;
    var cy = cam.worldView.y + cam.worldView.height / 2;

    var objs = escena._gfObjetosMapa;
    // La lista se recalcula de vez en cuando: los objetos se crean durante los
    // primeros segundos de la escena y algunos se destruyen al talarlos.
    if (!objs || escena._gfObjetosCaducan < Date.now()) {
      objs = escena._gfObjetosMapa = objetosDelMapa(escena);
      escena._gfObjetosCaducan = Date.now() + 4000;
    }

    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o || !o.scene) continue;           // destruido (árbol talado, etc.)

      var dx = o.x - cx;
      var dy = o.y - cy;
      var d2 = dx * dx + dy * dy;

      if (o.__gfCulled) {
        // Lo escondimos nosotros: ¿ya vuelve a estar cerca?
        if (d2 <= radioMostrar2) {
          o.__gfCulled = false;
          try { o.setVisible(o.__gfVisiblePrevio !== false); } catch (e) {}
        }
      } else {
        // Visible por su cuenta: se recuerda su estado por si hay que esconderlo.
        o.__gfVisiblePrevio = o.visible;
        if (d2 > radioOcultar2 && o.visible) {
          o.__gfCulled = true;
          try { o.setVisible(false); } catch (e) {}
        }
      }
    }
  }

  /** Devuelve TODO a la vista (al subir la barra al máximo o al salir). */
  function mostrarTodo(escena) {
    var objs = escena._gfObjetosMapa || objetosDelMapa(escena);
    objs.forEach(function (o) {
      if (o && o.scene && o.__gfCulled) {
        o.__gfCulled = false;
        try { o.setVisible(o.__gfVisiblePrevio !== false); } catch (e) {}
      }
    });
  }

  // ── Aplicación: CALIDAD GLOBAL ─────────────────────────────────────────────

  function aplicarCalidadGlobal() {
    var cfg = CALIDADES[ajustes.calidad];

    // Resolución de render. app.js lee GF_MAX_DPR al calcular el tamaño interno
    // del juego; 0 significa "sin tope".
    var topeAnterior = global.GF_MAX_DPR;
    global.GF_MAX_DPR = cfg.dpr > 0 ? cfg.dpr : Infinity;

    if (topeAnterior !== global.GF_MAX_DPR && typeof global.gfResizeGame === 'function') {
      try { global.gfResizeGame(); } catch (e) {}
    }

    // Partículas: en calidad baja se apagan (son lo más caro por píxel dibujado).
    escenasActivas().forEach(function (esc) {
      var perf = esc.perf;
      if (!perf) return;
      try {
        if (!cfg.particulas && typeof perf.stopAllEmitters === 'function') {
          perf.stopAllEmitters();
        }
        if (typeof perf.setQualityTier === 'function') {
          perf.setQualityTier(ajustes.calidad === 'alta' ? 'high'
                            : ajustes.calidad === 'media' ? 'medium' : 'low');
        }
      } catch (e) { /* perf sin esa API: no es crítico */ }
    });
  }

  // ── Aplicar todo ───────────────────────────────────────────────────────────

  function aplicarTodo() {
    aplicarCalidadGlobal();
    escenasActivas().forEach(function (esc) {
      try {
        aplicarATerreno(esc);
        if (ajustes.chunks >= CHUNK_MAX) mostrarTodo(esc);
        else aplicarAObjetos(esc);
      } catch (e) { console.warn('⚠️ Gráficos: fallo aplicando a la escena:', e); }
    });
  }

  // Bucle de culling. Va aparte del bucle del juego a propósito: si esta
  // librería fallara, el juego sigue corriendo igual.
  var bucle = null;
  function arrancarBucle() {
    if (bucle) return;
    bucle = global.setInterval(function () {
      if (ajustes.chunks >= CHUNK_MAX) return;   // sin límite: nada que ocultar
      escenasActivas().forEach(function (esc) {
        try { aplicarAObjetos(esc); } catch (e) {}
      });
    }, 220);
  }

  // ── Interfaz en el panel de configuraciones ────────────────────────────────

  function construirUI() {
    var panel = doc.getElementById('hub-panel_101');
    if (!panel || doc.getElementById('gf-gfx-row')) return false;

    // Se inserta ANTES de la fila del idioma, como se pidió.
    var selIdioma = doc.getElementById('language-select');
    var filaIdioma = selIdioma ? selIdioma.closest('.hub-row_101') : null;
    if (!filaIdioma) return false;

    var cont = doc.createElement('div');
    cont.id = 'gf-gfx-row';

    // — Calidad —
    var filaCal = doc.createElement('div');
    filaCal.className = 'hub-row_101';

    var lblCal = doc.createElement('label');
    lblCal.className = 'hub-label_101';
    lblCal.setAttribute('for', 'gf-gfx-quality');
    lblCal.textContent = 'Calidad gráfica';

    var selCal = doc.createElement('select');
    selCal.id = 'gf-gfx-quality';
    selCal.setAttribute('aria-label', 'Seleccionar calidad gráfica');
    Object.keys(CALIDADES).forEach(function (k) {
      var op = doc.createElement('option');
      op.value = k;
      op.textContent = CALIDADES[k].etiqueta;
      selCal.appendChild(op);
    });
    selCal.value = ajustes.calidad;

    var ayudaCal = doc.createElement('div');
    ayudaCal.className = 'gf-gfx-help';
    ayudaCal.id = 'gf-gfx-quality-help';

    filaCal.appendChild(lblCal);
    filaCal.appendChild(selCal);
    filaCal.appendChild(ayudaCal);

    // — Distancia de visión —
    var filaDist = doc.createElement('div');
    filaDist.className = 'hub-row_101';

    var lblDist = doc.createElement('label');
    lblDist.className = 'hub-label_101';
    lblDist.setAttribute('for', 'gf-gfx-chunks');
    lblDist.textContent = 'Distancia de visión';

    var barraFila = doc.createElement('div');
    barraFila.className = 'gf-gfx-slider-row';

    var barra = doc.createElement('input');
    barra.type = 'range';
    barra.id   = 'gf-gfx-chunks';
    barra.min  = String(CHUNK_MIN);
    barra.max  = String(CHUNK_MAX);
    barra.step = '1';
    barra.value= String(ajustes.chunks);
    barra.setAttribute('aria-label', 'Distancia de visión en chunks');

    var valor = doc.createElement('span');
    valor.className = 'gf-gfx-value';
    valor.id = 'gf-gfx-chunks-value';

    barraFila.appendChild(barra);
    barraFila.appendChild(valor);

    var ayudaDist = doc.createElement('div');
    ayudaDist.className = 'gf-gfx-help';
    ayudaDist.textContent = 'Menos distancia = más fluidez. Lo lejano deja de dibujarse.';

    filaDist.appendChild(lblDist);
    filaDist.appendChild(barraFila);
    filaDist.appendChild(ayudaDist);

    cont.appendChild(filaCal);
    cont.appendChild(filaDist);
    filaIdioma.parentNode.insertBefore(cont, filaIdioma);

    // — Eventos —
    function pintarValores() {
      valor.textContent = ajustes.chunks >= CHUNK_MAX
        ? 'Máx'
        : String(ajustes.chunks);
      var cfg = CALIDADES[ajustes.calidad];
      ayudaCal.textContent = cfg.lod === 'hd'
        ? 'Texturas al máximo detalle. Para equipos con buena tarjeta gráfica.'
        : cfg.lod === 'md'
          ? 'Texturas a media resolución. Buen equilibrio en la mayoría de móviles.'
          : 'Texturas ligeras y sin partículas. Para móviles de gama baja.';
    }

    selCal.addEventListener('change', function () {
      if (!CALIDADES[selCal.value]) return;
      ajustes.calidad = selCal.value;
      // La calidad propone una distancia, pero no la impone: si el jugador ya
      // movió la barra a mano, se respeta su elección.
      guardar();
      pintarValores();
      aplicarTodo();
    });

    // 'input' para que se vea el número al arrastrar; 'change' para aplicar de
    // verdad solo al soltar (recargar tiles en cada píxel del arrastre sería
    // una tortura para el móvil).
    barra.addEventListener('input', function () {
      ajustes.chunks = parseInt(barra.value, 10) || CHUNK_MIN;
      pintarValores();
    });
    barra.addEventListener('change', function () {
      ajustes.chunks = parseInt(barra.value, 10) || CHUNK_MIN;
      guardar();
      pintarValores();
      aplicarTodo();
    });

    pintarValores();
    return true;
  }

  // El panel es DOM de la página y ya existe al cargar, pero por si acaso
  // (paneles que se montan tarde) se reintenta unas cuantas veces.
  function intentarConstruirUI() {
    if (construirUI()) return;
    var intentos = 0;
    var t = global.setInterval(function () {
      intentos++;
      if (construirUI() || intentos > 40) global.clearInterval(t);
    }, 250);
  }

  // ── Arranque ───────────────────────────────────────────────────────────────

  cargar();

  function iniciar() {
    intentarConstruirUI();
    arrancarBucle();
    // Los TileManagers se crean unos segundos después de entrar en la escena;
    // se reaplica varias veces durante ese arranque.
    [500, 1500, 3000, 6000].forEach(function (ms) {
      global.setTimeout(function () { try { aplicarTodo(); } catch (e) {} }, ms);
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // ── API pública ────────────────────────────────────────────────────────────
  global.GFGraphics = {
    get:      function () { return { calidad: ajustes.calidad, chunks: ajustes.chunks }; },
    setCalidad: function (c) { if (CALIDADES[c]) { ajustes.calidad = c; guardar(); aplicarTodo(); } },
    setChunks:  function (n) {
      ajustes.chunks = Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, Math.round(n) || CHUNK_MIN));
      guardar(); aplicarTodo();
    },
    aplicar:  aplicarTodo,
    CHUNK_PX: CHUNK_PX,
    CHUNK_MIN: CHUNK_MIN,
    CHUNK_MAX: CHUNK_MAX
  };
})(window);
