/* =============================================================================
 * GF SOULBOUND — personajes intercambiables del jugador
 * =============================================================================
 *
 * QUÉ RESUELVE
 * ------------
 * Los sprites del jugador vivían sueltos en Game/Sprites/{abajo,arriba,derecha,
 * izquierda,Perfil}. Ahora viven agrupados por personaje:
 *
 *     Game/Sprites/Soulbound/
 *         personaje1/{Perfil,abajo,arriba,derecha,izquierda}/
 *         personaje2/{Perfil,abajo,arriba,derecha,izquierda}/
 *         personaje3/...        <- basta con crear la carpeta
 *
 * Este módulo:
 *   1. DESCUBRE solo qué personajes existen (sin listas que mantener a mano).
 *   2. Da las RUTAS que usan los preload() de GameScene y tiendajuego, de modo
 *      que las claves de textura ('player_right_1', 'down', 'imagen_Perfil'…)
 *      NO cambian: todo el código que ya existía sigue funcionando igual.
 *   3. CAMBIA de personaje en caliente, sin reiniciar la escena.
 *   4. GUARDA la elección en el backend (/api/soulbound/:playerName) y en el
 *      navegador, para que la carga inicial ya use el personaje correcto.
 *
 * CÓMO SE DESCUBRE SIN BACKEND
 * ----------------------------
 * El juego se sirve como estático (GitHub Pages): no hay listado de directorios.
 * Se prueba a cargar Soulbound/personajeN/Perfil/Perfil.png con N = 1, 2, 3…
 * y se para tras 3 fallos seguidos (así un hueco —borrar personaje2 y dejar el
 * 3— no corta la búsqueda). Cuesta unos 55 ms y se hace una vez por carga de
 * página: a propósito NO se guarda en el navegador, para que añadir una carpeta
 * y recargar la muestre siempre (ver descubrir()).
 *
 * Si prefieres saltarte el sondeo, crea Game/Sprites/Soulbound/index.json:
 *     ["personaje1", "personaje2", "mi_personaje_raro"]
 * Con ese archivo los nombres pueden ser cualquiera, no solo "personajeN".
 * ========================================================================== */
(function (global) {
  'use strict';

  var BASE     = './Game/Sprites/Soulbound';
  var POR_DEFECTO = 'personaje1';

  // Carpeta de dirección -> prefijo de la clave de textura que ya usa el juego.
  var DIRECCIONES = {
    derecha:    'player_right',
    izquierda:  'player_left',
    arriba:     'player_up',
    abajo:      'player_down'
  };
  var FOTOGRAMAS = 7;               // run_1.png … run_7.png

  // Animaciones del jugador, tal y como las crean GameScene y tiendajuego.
  // Se replican aquí para poder RECONSTRUIRLAS al cambiar de personaje: una
  // animación de Phaser guarda referencias a los Frame concretos, así que al
  // sustituir la textura hay que volver a crearla o se queda apuntando a la
  // textura vieja (ya destruida) y el sprite se vuelve invisible.
  var ANIMACIONES = [
    { key: 'right', prefijo: 'player_right' },
    { key: 'left',  prefijo: 'player_left'  },
    { key: 'up',    prefijo: 'player_up'    },
    { key: 'down',  prefijo: 'player_down'  }
  ];
  var FRAME_RATE = 9;

  var LS_ELEGIDO = 'gf_soulbound_elegido';

  // ── Estado ────────────────────────────────────────────────────────────────
  var elegido     = null;    // id del personaje activo
  var lista       = null;    // array de ids descubiertos
  var descubriendo = null;   // promesa de descubrimiento en curso

  // ── Utilidades de almacenamiento (nunca revientan) ────────────────────────
  function leerLS(clave) {
    try { return global.localStorage && global.localStorage.getItem(clave); }
    catch (e) { return null; }
  }
  function escribirLS(clave, valor) {
    try { global.localStorage && global.localStorage.setItem(clave, valor); }
    catch (e) { /* almacenamiento bloqueado: se sigue con el valor en memoria */ }
  }

  /**
   * Un id de personaje solo puede ser un nombre de carpeta sencillo.
   * Esto corta cualquier intento de meter "../" o rutas absolutas por aquí —
   * el id viaja al servidor y vuelve, así que no se confía en él a ciegas.
   */
  function idValido(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
  }

  // ── Rutas ─────────────────────────────────────────────────────────────────
  function baseDe(id) { return BASE + '/' + (idValido(id) ? id : POR_DEFECTO); }

  /** Ruta del retrato (el que se ve en el HUD y en los botones del panel NFT). */
  function rutaPerfil(id) { return baseDe(id || actual()) + '/Perfil/Perfil.png'; }

  /** Ruta de un fotograma de carrera. ruta('derecha', 1) -> …/derecha/run_1.png */
  function ruta(carpeta, n, id) {
    return baseDe(id || actual()) + '/' + carpeta + '/run_' + n + '.png';
  }

  // ── Personaje activo ──────────────────────────────────────────────────────
  /**
   * Personaje activo AHORA MISMO, de forma síncrona.
   *
   * Tiene que ser síncrono porque preload() lo necesita antes de que dé tiempo
   * a preguntarle nada al servidor. Por eso la elección se guarda también en
   * localStorage: la primera carga ya sale con el personaje correcto y no se
   * ve el cambio. Si el servidor dice otra cosa (p. ej. es un ordenador nuevo),
   * sincronizar() lo corrige en caliente unos segundos después.
   */
  function actual() {
    if (elegido) return elegido;
    var guardado = leerLS(LS_ELEGIDO);
    elegido = idValido(guardado) ? guardado : POR_DEFECTO;
    return elegido;
  }

  /** Fija el personaje en memoria + navegador. No toca escenas ni servidor. */
  function fijar(id) {
    if (!idValido(id)) return false;
    if (elegido === id) return false;
    elegido = id;
    escribirLS(LS_ELEGIDO, id);
    return true;
  }

  // ── Descubrimiento ────────────────────────────────────────────────────────
  function existeImagen(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload  = function () { resolve(true);  };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  /**
   * Devuelve la lista de personajes disponibles: ['personaje1', 'personaje2', …]
   * Se cachea solo en memoria, durante esta carga de página.
   */
  function descubrir(forzar) {
    // NO se guarda en sessionStorage a propósito.
    //
    // Se probó y era peor: el sondeo tarda ~55 ms y solo corre una vez por
    // carga de página, pero sessionStorage sobrevive a los refrescos de la
    // pestaña. Con la lista cacheada ahí, añadir "personaje3" y recargar NO lo
    // mostraba —seguía leyendo la lista vieja—, que es justo lo contrario de lo
    // que debe hacer esto. Y al revés: si se borraba una carpeta, el panel
    // seguía pintando un botón roto.
    //
    // La caché en memoria (`lista`) ya evita repetir el sondeo dentro de una
    // misma partida, que es lo único que hacía falta.
    if (!forzar) {
      if (lista) return Promise.resolve(lista);
      if (descubriendo) return descubriendo;
    }

    descubriendo = manifiesto()
      .then(function (desdeArchivo) {
        if (desdeArchivo && desdeArchivo.length) return desdeArchivo;
        return sondear();
      })
      .then(function (encontrados) {
        // Nunca devolver vacío: si todo falla, al menos el personaje por
        // defecto, para que el panel no se quede en blanco.
        lista = (encontrados && encontrados.length) ? encontrados : [POR_DEFECTO];
        descubriendo = null;
        return lista;
      })
      .catch(function () {
        lista = [POR_DEFECTO];
        descubriendo = null;
        return lista;
      });

    return descubriendo;
  }

  /** index.json opcional. Si no existe (404), se ignora en silencio. */
  function manifiesto() {
    return fetch(BASE + '/index.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!Array.isArray(d)) return null;
        return d.filter(idValido);
      })
      .catch(function () { return null; });
  }

  /** Sondeo por convención: personaje1, personaje2, … hasta 3 fallos seguidos. */
  function sondear() {
    var encontrados = [];
    var fallosSeguidos = 0;
    var n = 1;
    var TOPE = 60;

    function siguiente() {
      if (n > TOPE || fallosSeguidos >= 3) return Promise.resolve(encontrados);
      var id = 'personaje' + n;
      n++;
      return existeImagen(rutaPerfil(id)).then(function (existe) {
        if (existe) { encontrados.push(id); fallosSeguidos = 0; }
        else        { fallosSeguidos++; }
        return siguiente();
      });
    }
    return siguiente();
  }

  // ── Precarga (la usan los preload() de las escenas) ───────────────────────
  /**
   * Sustituye al bloque de 29 this.load.image(...) que había escrito a mano en
   * GameScene.preload y tiendajuego.preload. Mismas claves de textura de
   * siempre; solo cambia de qué carpeta salen los PNG.
   */
  function precargar(scene, id) {
    var quien = id || actual();
    try {
      scene.load.image('imagen_Perfil', rutaPerfil(quien));
      // 'player' es la textura suelta que se carga al principio de preload.
      scene.load.image('player', ruta('derecha', 1, quien));
      Object.keys(DIRECCIONES).forEach(function (carpeta) {
        var prefijo = DIRECCIONES[carpeta];
        for (var i = 1; i <= FOTOGRAMAS; i++) {
          scene.load.image(prefijo + '_' + i, ruta(carpeta, i, quien));
        }
      });
    } catch (e) {
      console.warn('[Soulbound] precargar falló:', e);
    }
  }

  // ── Cambio en caliente ────────────────────────────────────────────────────
  /**
   * Cambia el personaje de una escena YA EN MARCHA, sin reiniciarla.
   *
   * Por qué no es un simple setTexture: en Phaser una textura no se puede
   * sobrescribir (addImage avisa y no hace nada si la clave ya existe). Hay que
   * cargar las imágenes nuevas con claves temporales, BORRAR las viejas, volver
   * a registrarlas con la clave real y RECONSTRUIR las animaciones, porque cada
   * animación guarda referencias a los objetos Frame concretos.
   *
   * EL DETALLE QUE ROMPE EL JUEGO SI SE HACE MAL
   * --------------------------------------------
   * textures.remove() DESTRUYE los Frame. Cualquier sprite que estuviera
   * mostrando esa textura se queda con frame = null, y en el siguiente dibujado
   * el renderizador casca con "Cannot read properties of null (reading
   * 'glTexture')" — pantalla negra y juego muerto. Y como el sprite ya no tiene
   * textura, tampoco se puede consultar hacia dónde miraba para restaurarlo.
   *
   * Por eso el orden es: (0) anotar el estado de cada sprite y APARCARLO en la
   * textura '__MISSING' de Phaser, que no se toca nunca; (1) intercambiar las
   * texturas; (2) rehacer las animaciones; (3) devolver cada sprite a su sitio.
   *
   * Además, si alguna imagen del personaje nuevo no se puede cargar, NO se toca
   * nada: el jugador se queda con el personaje que ya tenía en vez de volverse
   * invisible.
   */
  function aplicarEnEscena(scene, id) {
    return new Promise(function (resolve) {
      if (!scene || !scene.load || !scene.textures || !scene.anims) return resolve(false);
      var quien = idValido(id) ? id : actual();

      // Clave real -> URL nueva
      var mapa = { imagen_Perfil: rutaPerfil(quien), player: ruta('derecha', 1, quien) };
      Object.keys(DIRECCIONES).forEach(function (carpeta) {
        var prefijo = DIRECCIONES[carpeta];
        for (var i = 1; i <= FOTOGRAMAS; i++) {
          mapa[prefijo + '_' + i] = ruta(carpeta, i, quien);
        }
      });

      var claves = Object.keys(mapa);
      var PREFIJO_TMP = '__sb_tmp__';

      try {
        claves.forEach(function (clave) {
          scene.load.image(PREFIJO_TMP + clave, mapa[clave]);
        });
      } catch (e) { return resolve(false); }

      scene.load.once('complete', function () {
        var aparcados = [];
        try {
          // Todo o nada: si falta alguna imagen, abortar SIN tocar el juego.
          var faltan = claves.filter(function (c) {
            return !scene.textures.exists(PREFIJO_TMP + c);
          });
          if (faltan.length) {
            console.warn('[Soulbound] "' + quien + '" no se aplicó: faltan ' +
                         faltan.length + ' imágenes. Se mantiene el personaje actual.');
            limpiarTemporales(scene, claves, PREFIJO_TMP);
            return resolve(false);
          }

          // 0. Anotar estado y aparcar los sprites fuera de las texturas que
          //    vamos a destruir.
          aparcados = recolectarSprites(scene);
          aparcados.forEach(function (s) {
            try { if (s.sprite.anims) s.sprite.anims.stop(); } catch (e) {}
            try { s.sprite.setTexture('__MISSING'); } catch (e) {}
          });

          // 1. Sustituir las texturas reales por las recién cargadas.
          claves.forEach(function (clave) {
            var tmp = PREFIJO_TMP + clave;
            var img = scene.textures.get(tmp).getSourceImage();
            if (scene.textures.exists(clave)) scene.textures.remove(clave);
            scene.textures.addImage(clave, img);
            scene.textures.remove(tmp);
          });

          // 2. Reconstruir las animaciones de movimiento.
          ANIMACIONES.forEach(function (a) {
            var frames = [];
            for (var i = 1; i <= FOTOGRAMAS; i++) frames.push({ key: a.prefijo + '_' + i });
            if (scene.anims.exists(a.key)) scene.anims.remove(a.key);
            scene.anims.create({ key: a.key, frames: frames, frameRate: FRAME_RATE, repeat: -1 });
          });

          // 3. Devolver cada sprite a su textura y a su animación.
          restaurarSprites(aparcados);

          // 4. Retrato del HUD.
          if (typeof scene.actualizarImagenJugador === 'function') {
            scene.actualizarImagenJugador(rutaPerfil(quien));
          }
          resolve(true);
        } catch (e) {
          // Pase lo que pase, ningún sprite se queda aparcado en '__MISSING'.
          console.warn('[Soulbound] aplicarEnEscena falló:', e);
          try { restaurarSprites(aparcados); } catch (e2) {}
          limpiarTemporales(scene, claves, PREFIJO_TMP);
          resolve(false);
        }
      });

      try { scene.load.start(); } catch (e) { resolve(false); }
    });
  }

  function limpiarTemporales(scene, claves, prefijoTmp) {
    claves.forEach(function (c) {
      try { if (scene.textures.exists(prefijoTmp + c)) scene.textures.remove(prefijoTmp + c); }
      catch (e) {}
    });
  }

  /**
   * Sprites que usan las texturas del jugador: el propio jugador y los
   * jugadores remotos (todos comparten las mismas claves 'player_*').
   * Se anota hacia dónde miraban y qué animación llevaban ANTES de destruir
   * nada, porque después esa información ya no se puede consultar.
   */
  function recolectarSprites(scene) {
    var fuera = [];
    function anotar(sprite) {
      if (!sprite || !sprite.setTexture || !sprite.scene) return;
      var textura = '';
      try { textura = (sprite.texture && sprite.texture.key) || ''; } catch (e) {}
      if (textura.indexOf('player') !== 0) return;   // no es un sprite del jugador

      var prefijo = 'player_down';
      ['player_right', 'player_left', 'player_up', 'player_down'].forEach(function (p) {
        if (textura.indexOf(p) === 0) prefijo = p;
      });

      var anim = null;
      try {
        if (sprite.anims && sprite.anims.isPlaying && sprite.anims.currentAnim) {
          anim = sprite.anims.currentAnim.key;
        }
      } catch (e) {}

      fuera.push({ sprite: sprite, prefijo: prefijo, anim: anim });
    }

    anotar(scene.player);
    if (scene.otherPlayers) {
      Object.keys(scene.otherPlayers).forEach(function (k) {
        var otro = scene.otherPlayers[k];
        if (otro && otro.sprite) anotar(otro.sprite);
      });
    }
    return fuera;
  }

  function restaurarSprites(aparcados) {
    (aparcados || []).forEach(function (s) {
      try {
        s.sprite.setTexture(s.prefijo + '_1');
        if (s.anim && s.sprite.anims && s.sprite.anims.play) s.sprite.anims.play(s.anim, true);
      } catch (e) {}
    });
  }

  // ── Persistencia en el servidor ───────────────────────────────────────────
  /**
   * Escena viva con sesión iniciada. Mismo criterio que gf-graphics-settings:
   * no se duplica aquí la lógica de a qué backend hablar.
   */
  function escenaConSesion() {
    try {
      // Mismo resolutor que usa gf-graphics-settings: la instancia vive en
      // window.game, y phaserScaler.game solo existe según cómo se arrancara.
      var juego = global.game || (global.phaserScaler && global.phaserScaler.game) || null;
      if (!juego || !juego.scene || typeof juego.scene.getScenes !== 'function') return null;
      var escenas = juego.scene.getScenes(true) || [];
      for (var i = 0; i < escenas.length; i++) {
        var e = escenas[i];
        if (e && e.playerName && e.serverBase) return e;
      }
    } catch (e) {}
    return null;
  }

  /** Trae del servidor el personaje guardado y lo aplica si difiere del actual. */
  function sincronizar(scene) {
    var esc = scene || escenaConSesion();
    if (!esc || !esc.playerName || !esc.serverBase) return Promise.resolve(false);

    return fetch(esc.serverBase + '/api/soulbound/' + encodeURIComponent(esc.playerName),
                 { credentials: 'include', mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !idValido(d.character)) return false;
        if (d.character === actual()) return false;
        fijar(d.character);
        return aplicarEnEscena(esc, d.character);
      })
      .catch(function () { return false; });
  }

  /** Guarda la elección en el servidor. */
  function guardarEnServidor(id, scene) {
    var esc = scene || escenaConSesion();
    if (!esc || !esc.playerName || !esc.serverBase) return Promise.resolve(false);

    var cabeceras = { 'Content-Type': 'application/json' };
    try {
      if (typeof global.getCsrfToken === 'function') {
        cabeceras['X-CSRF-Token'] = global.getCsrfToken();
      }
    } catch (e) {}

    return fetch(esc.serverBase + '/api/soulbound/' + encodeURIComponent(esc.playerName), {
      method: 'POST',
      credentials: 'include',
      mode: 'cors',
      headers: cabeceras,
      body: JSON.stringify({ character: id })
    })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  // ── API principal ─────────────────────────────────────────────────────────
  /**
   * Equipa un personaje: memoria + navegador + escena en caliente + servidor.
   * Devuelve una promesa que resuelve a true si el cambio se vio en pantalla.
   */
  function elegir(id, scene) {
    if (!idValido(id)) return Promise.resolve(false);
    var esc = scene || escenaConSesion();
    var cambio = fijar(id);

    var enPantalla = esc ? aplicarEnEscena(esc, id) : Promise.resolve(false);

    return enPantalla.then(function (ok) {
      // El guardado en servidor va aparte: si la red falla, el jugador ya ve
      // su personaje y la elección sigue viva en el navegador.
      guardarEnServidor(id, esc);
      try {
        global.dispatchEvent(new CustomEvent('gf-soulbound-cambiado', { detail: { id: id } }));
      } catch (e) {}
      return ok || cambio;
    });
  }

  // ── Panel del jugador (sección Soulbound dentro del panel NFT) ───────────
  //
  // Vive aquí y no en las escenas porque el panel NFT es DOM COMPARTIDO de la
  // página: lo abren tanto GameScene como tiendajuego. Cuando el código de
  // pintarlo estaba solo en GameScene, en la tienda el panel se abría vacío y
  // se quedaba en "Loading characters…" para siempre — el mismo fallo que ya
  // había pasado con las habilidades. Con una única implementación, las dos
  // escenas enseñan exactamente lo mismo y no se pueden desincronizar.
  var montando = false;

  /** Pinta los botones redondos y los deja funcionando. Idempotente. */
  function montarPanel(scene) {
    var cont = global.document.getElementById('sb-list');
    if (!cont) return Promise.resolve(false);

    return descubrir().catch(function () { return [POR_DEFECTO]; }).then(function (ids) {
      if (!global.document.body.contains(cont)) return false;   // se cerró mientras tanto

      cont.textContent = '';
      ids.forEach(function (id) {
        // createElement + textContent en vez de innerHTML: el id nunca se
        // interpola como HTML (idValido ya lo limita a [A-Za-z0-9_-], pero no
        // se confía en una sola barrera).
        var btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className = 'sb-char';
        btn.title = id;
        btn.setAttribute('aria-label', id);

        var img = global.document.createElement('img');
        img.src = rutaPerfil(id);
        img.alt = id;
        // Si el retrato no carga, el personaje no está realmente disponible
        // (carpeta a medias, archivo con otro nombre): se retira el botón en vez
        // de dejar un círculo vacío que al pulsarlo dejaría al jugador sin
        // sprites.
        img.onerror = function () {
          if (btn.parentNode) btn.parentNode.removeChild(btn);
        };
        btn.appendChild(img);

        btn.onclick = function () { equiparDesdePanel(id, scene); };
        cont.appendChild(btn);
      });

      refrescarPanel();
      return true;
    });
  }

  /** Marca el equipado y actualiza el retrato grande. */
  function refrescarPanel() {
    var doc = global.document;
    var quien = actual();

    var cont = doc.getElementById('sb-list');
    if (cont) {
      Array.prototype.forEach.call(cont.querySelectorAll('.sb-char'), function (b) {
        if (b.title === quien) b.classList.add('sb-active');
        else                   b.classList.remove('sb-active');
      });
    }
    var img  = doc.getElementById('sb-current-img');
    var name = doc.getElementById('sb-current-name');
    if (img)  img.src = rutaPerfil(quien);
    if (name) name.textContent = quien;
  }

  function equiparDesdePanel(id, scene) {
    // Dos cambios a la vez se pisarían: ambos borran y recrean las mismas
    // claves de textura.
    if (montando || id === actual()) return;
    montando = true;

    var cont = global.document.getElementById('sb-list');
    var botones = cont ? cont.querySelectorAll('.sb-char') : [];
    Array.prototype.forEach.call(botones, function (b) { b.classList.add('sb-busy'); });

    elegir(id, scene)
      .catch(function (e) { console.warn('[Soulbound] no se pudo equipar ' + id, e); })
      .then(function () {
        montando = false;
        Array.prototype.forEach.call(botones, function (b) { b.classList.remove('sb-busy'); });
        refrescarPanel();
      });
  }

  global.GFSoulbound = {
    BASE:          BASE,
    montarPanel:   montarPanel,
    refrescarPanel: refrescarPanel,
    POR_DEFECTO:   POR_DEFECTO,
    actual:        actual,
    fijar:         fijar,
    idValido:      idValido,
    baseDe:        baseDe,
    ruta:          ruta,
    rutaPerfil:    rutaPerfil,
    descubrir:     descubrir,
    precargar:     precargar,
    aplicarEnEscena: aplicarEnEscena,
    elegir:        elegir,
    sincronizar:   sincronizar
  };

  // Arrancar el descubrimiento en cuanto se pueda: cuando el jugador abra el
  // panel NFT la lista ya estará lista y los botones salen al instante.
  if (global.requestIdleCallback) global.requestIdleCallback(function () { descubrir(); });
  else setTimeout(function () { descubrir(); }, 2000);

})(window);
