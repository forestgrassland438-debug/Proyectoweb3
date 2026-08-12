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
 * Los ajustes se guardan EN EL SERVIDOR (/api/graphics/:playerName), no en el
 * navegador, y se reaplican al entrar en cada escena — así sobreviven a cambiar
 * de mapa, ir a la tienda, recargar la página y hasta cambiar de dispositivo.
 *
 * NO toca el zoom de la cámara ni ningún mecanismo de juego.
 * =============================================================================
 */
(function (global) {
  'use strict';

  var doc = global.document;

  // ── Constantes ─────────────────────────────────────────────────────────────

  // (Ya no hay clave de localStorage: la persistencia es del servidor.)

  // ── CALIBRACIÓN DE LA DISTANCIA ────────────────────────────────────────────
  // FIX: antes un chunk eran 512 px, así que la distancia por defecto (12) daba
  // un radio de 6144 px sobre un mapa que mide 5008 px: el radio cubría el mapa
  // ENTERO y no se ocultaba nada nunca. Toda la escala útil quedaba aplastada
  // en las dos o tres primeras muescas, y por eso "no quitaba bien" ni los
  // árboles ni las casas.
  //
  // Con 320 px por chunk la escala queda repartida de verdad sobre el mapa:
  //     2 chunks →   640 px (muy agresivo, se nota el pop-in)
  //     6 chunks →  1920 px
  //    10 chunks →  3200 px
  //    16 chunks →  5120 px (más que el mapa entero = sin límite)
  // Una pantalla a zoom 1 ve ~1280×720 px de mundo, o sea unos 735 px desde el
  // centro a la esquina: por debajo de 3 chunks se empieza a ver el recorte, que
  // es justo lo que se espera de una distancia de visión baja.
  var CHUNK_PX  = 320;
  var CHUNK_MIN = 2;
  var CHUNK_MAX = 16;

  // NOTA: las claves ('alta'/'media'/'baja') son internas y NO se traducen —
  // viajan al servidor y son las que valida /api/graphics. Lo que se ve en
  // pantalla es `etiqueta`, en inglés como el resto de la interfaz del juego.
  var CALIDADES = {
    alta:  { lod: 'hd',  dpr: 0, particulas: true,  chunksSugeridos: 12, etiqueta: 'High' },
    media: { lod: 'md',  dpr: 2, particulas: true,  chunksSugeridos: 8,  etiqueta: 'Medium' },
    baja:  { lod: 'low', dpr: 1, particulas: false, chunksSugeridos: 5,  etiqueta: 'Low' }
  };

  // dpr: 0 = sin tope. Ver _gameSize() en app.js, que lee global.GF_MAX_DPR.

  // ── Estado ─────────────────────────────────────────────────────────────────

  var ajustes = { calidad: 'alta', chunks: 12 };

  // ── PERSISTENCIA EN EL SERVIDOR ────────────────────────────────────────────
  //
  // Antes esto vivía en localStorage. Ahora NO se guarda nada en el navegador:
  // los ajustes van y vienen de /api/graphics/:playerName, autenticado con la
  // cookie de sesión. Aparte de cumplir el requisito, el jugador conserva su
  // configuración al cambiar de navegador o de ordenador.
  //
  // Los datos de sesión (nombre y URL del backend) los publica la escena viva:
  // no se duplica aquí la lógica de a qué servidor hablar.
  function escenaConSesion() {
    var escenas = escenasActivas();
    for (var i = 0; i < escenas.length; i++) {
      var e = escenas[i];
      if (e && e.playerName && e.serverBase && e.isAuthenticated) return e;
    }
    return null;
  }

  function leerCookie(nombre) {
    var m = doc.cookie.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /** Trae los ajustes guardados. Si no hay sesión aún, no hace nada. */
  function cargar() {
    var esc = escenaConSesion();
    if (!esc) return Promise.resolve(false);

    return fetch(esc.serverBase + '/api/graphics/' + encodeURIComponent(esc.playerName),
                 { credentials: 'include', mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return false;
        if (CALIDADES[d.calidad]) ajustes.calidad = d.calidad;
        if (typeof d.chunks === 'number') {
          ajustes.chunks = Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, Math.round(d.chunks)));
        }
        return true;
      })
      .catch(function () { return false; });   // sin red: valores por defecto
  }

  /**
   * Guarda en el SERVIDOR. No se escribe nada en el navegador.
   *
   * Si todavía no hay sesión (el jugador está en la pantalla de carga) no se
   * pierde el ajuste: sigue vivo en memoria y se reintenta el guardado cuando
   * la sesión aparezca — de eso se encarga `pendienteDeGuardar` en el bucle.
   */
  var pendienteDeGuardar = false;

  function guardar() {
    var esc = escenaConSesion();
    if (!esc) { pendienteDeGuardar = true; return Promise.resolve(false); }

    var csrf = leerCookie('csrf-token');
    var cabeceras = { 'Content-Type': 'application/json' };
    if (csrf) cabeceras['X-CSRF-Token'] = csrf;

    return fetch(esc.serverBase + '/api/graphics/' + encodeURIComponent(esc.playerName), {
      method: 'POST', credentials: 'include', mode: 'cors', headers: cabeceras,
      body: JSON.stringify({ calidad: ajustes.calidad, chunks: ajustes.chunks })
    })
      .then(function (r) { pendienteDeGuardar = !r.ok; return r.ok; })
      .catch(function () { pendienteDeGuardar = true; return false; });
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
   * El terreno viaja en tiles de 2048 px; la barra está en chunks de 320 px.
   *
   * FIX: antes esto tenía un `Math.max(1, ...)`, o sea que el margen nunca
   * bajaba de 1 tile. Como el mapa es una rejilla de 3×3 tiles, un margen de 1
   * ya carga TODO el mapa: el suelo no se descargaba jamás, hicieras lo que
   * hicieras con la barra. Ahora el margen puede llegar a 0, que es cuando de
   * verdad solo se cargan los tiles que toca la cámara.
   */
  function margenDeTiles(chunks, tileSize) {
    var px = chunks * CHUNK_PX;
    return Math.max(0, Math.round(px / (tileSize || 2048)));
  }

  function aplicarATerreno(escena) {
    var tms = escena._tileManagers;
    if (!tms || !tms.length) return false;

    var lod    = CALIDADES[ajustes.calidad].lod;
    var tocado = false;

    tms.forEach(function (tm) {
      if (!tm) return;
      try {
        if (typeof tm.setLOD === 'function' && tm.chosenLOD !== lod) {
          if (tm.setLOD(lod)) tocado = true;
        }
        if (typeof tm.setMargin === 'function') {
          var m = margenDeTiles(ajustes.chunks, tm.tileSize);
          if (tm.margin !== m && tm.setMargin(m)) tocado = true;
        }
      } catch (e) { console.warn('⚠️ Gráficos: no se pudo ajustar un TileManager:', e); }
    });
    return tocado;
  }

  /**
   * ¿La escena tiene el terreno con los ajustes actuales?
   *
   * FIX DEL FALLO "SE PIERDE AL CAMBIAR DE ESCENA": cada vez que se pasa de
   * tiendajuego a GameScene (o al revés) la escena nueva construye sus
   * TileManagers desde cero, con los valores que trae escritos en el código
   * (`marginTiles: 3`, `preferredLOD: 'hd'`). Los ajustes del jugador seguían
   * guardados, pero nadie volvía a aplicarlos, así que el mapa nuevo salía
   * siempre en calidad alta y a distancia máxima. Parecía que la configuración
   * "no se guardaba"; en realidad no se REAPLICABA.
   *
   * Esta comprobación corre en el bucle y vuelve a poner los ajustes en cuanto
   * detecta un TileManager que no los cumple, venga de donde venga.
   */
  function terrenoDesincronizado(escena) {
    var tms = escena._tileManagers;
    if (!tms || !tms.length) return false;
    var lod = CALIDADES[ajustes.calidad].lod;
    for (var i = 0; i < tms.length; i++) {
      var tm = tms[i];
      if (!tm) continue;
      if (tm.chosenLOD !== lod) return true;
      if (tm.margin !== margenDeTiles(ajustes.chunks, tm.tileSize)) return true;
    }
    return false;
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

  // Bucle de mantenimiento. Va aparte del bucle del juego a propósito: si esta
  // librería fallara, el juego sigue corriendo igual.
  //
  // Hace DOS cosas en cada vuelta:
  //   1. Ocultar/mostrar objetos por distancia.
  //   2. Vigilar que el terreno de la escena activa siga con los ajustes del
  //      jugador. Esto es lo que arregla el "se pierde al cambiar de escena":
  //      cuando GameScene o tiendajuego arrancan, crean TileManagers nuevos con
  //      los valores del código y este vigilante los corrige en la siguiente
  //      vuelta (220 ms), sin que el jugador tenga que abrir el panel.
  var bucle = null;
  function arrancarBucle() {
    if (bucle) return;
    bucle = global.setInterval(function () {
      // Si un guardado no pudo salir (aún sin sesión, o falló la red), se
      // reintenta aquí en vez de perder el ajuste del jugador.
      if (pendienteDeGuardar && escenaConSesion()) { pendienteDeGuardar = false; guardar(); }

      escenasActivas().forEach(function (esc) {
        try {
          // 1) Terreno: reaplicar si la escena lo trae con otros valores.
          if (terrenoDesincronizado(esc)) {
            aplicarATerreno(esc);
            // La calidad también se reaplica: las partículas y el nivel de
            // rendimiento son por escena, así que una escena recién creada los
            // trae en sus valores por defecto.
            aplicarCalidadGlobal();
            // La escena es nueva: la lista de objetos cacheada ya no sirve.
            esc._gfObjetosMapa   = null;
            esc._gfObjetosCaducan = 0;
            console.log('🎚️ Ajustes de gráficos reaplicados a la escena nueva');
          }

          // 2) Objetos: ocultar por distancia (o mostrarlo todo si está al máximo).
          if (ajustes.chunks >= CHUNK_MAX) mostrarTodo(esc);
          else aplicarAObjetos(esc);
        } catch (e) { /* una escena a medio arrancar: se reintenta en la próxima vuelta */ }
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
    lblCal.textContent = '🎨 Graphics quality';

    var selCal = doc.createElement('select');
    selCal.id = 'gf-gfx-quality';
    selCal.setAttribute('aria-label', 'Select graphics quality');
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
    lblDist.textContent = '🌍 Render distance';

    var barraFila = doc.createElement('div');
    barraFila.className = 'gf-gfx-slider-row';

    var barra = doc.createElement('input');
    barra.type = 'range';
    barra.id   = 'gf-gfx-chunks';
    barra.min  = String(CHUNK_MIN);
    barra.max  = String(CHUNK_MAX);
    barra.step = '1';
    barra.value= String(ajustes.chunks);
    barra.setAttribute('aria-label', 'Render distance in chunks');

    var valor = doc.createElement('span');
    valor.className = 'gf-gfx-value';
    valor.id = 'gf-gfx-chunks-value';

    barraFila.appendChild(barra);
    barraFila.appendChild(valor);

    var ayudaDist = doc.createElement('div');
    ayudaDist.className = 'gf-gfx-help';
    ayudaDist.textContent = 'Lower distance = smoother game. Far away things stop being drawn.';

    filaDist.appendChild(lblDist);
    filaDist.appendChild(barraFila);
    filaDist.appendChild(ayudaDist);

    cont.appendChild(filaCal);
    cont.appendChild(filaDist);
    filaIdioma.parentNode.insertBefore(cont, filaIdioma);

    // — Eventos —
    function pintarValores() {
      valor.textContent = ajustes.chunks >= CHUNK_MAX
        ? 'Max'
        : String(ajustes.chunks);
      var cfg = CALIDADES[ajustes.calidad];
      ayudaCal.textContent = cfg.lod === 'hd'
        ? 'Full detail textures. For devices with a good graphics card.'
        : cfg.lod === 'md'
          ? 'Half resolution textures. Good balance on most phones.'
          : 'Light textures, particles off. For low-end phones.';
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

    // Se expone para que la carga desde el servidor pueda repintar el panel
    // con los valores reales cuando lleguen (la UI se monta antes que ellos).
    global.__gfGfxPintar = pintarValores;

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

  // Los ajustes ya NO están en el navegador, así que al arrancar no se saben:
  // hay que pedírselos al servidor, y para eso hace falta que el jugador ya
  // tenga sesión. Como esta librería carga antes que la escena, se espera a que
  // aparezca en vez de dar por perdida la carga.
  var yaCargadoDelServidor = false;

  function cargarCuandoHayaSesion() {
    if (yaCargadoDelServidor) return;
    cargar().then(function (ok) {
      if (!ok) return;
      yaCargadoDelServidor = true;
      // Con los valores reales en la mano se repinta el panel y se aplica todo.
      if (typeof global.__gfGfxPintar === 'function') global.__gfGfxPintar();
      aplicarTodo();
      console.log('🎚️ Ajustes de gráficos cargados del servidor:', JSON.stringify(ajustes));
    });
  }

  function iniciar() {
    intentarConstruirUI();
    arrancarBucle();

    // Reintento de carga hasta que el jugador esté autenticado (o ~60 s).
    var intentosCarga = 0;
    var tCarga = global.setInterval(function () {
      intentosCarga++;
      cargarCuandoHayaSesion();
      if (yaCargadoDelServidor || intentosCarga > 60) global.clearInterval(tCarga);
    }, 1000);

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
