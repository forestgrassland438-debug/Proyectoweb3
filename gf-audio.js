/* ===========================================================================
 * AMBIENTE SONORO DE 8 BITS
 *
 * QUÉ HACE
 *   Le pone oído al mundo. Hasta ahora el juego tenía una música de fondo y
 *   cuatro efectos sueltos; con esto suena lo que se ve:
 *
 *     - la lluvia arrecia y amaina con la lluvia que se pinta
 *     - los rayos suenan DESPUÉS del fogonazo, y el trueno de una centella
 *       lejana no es el mismo que el de un rayo que cae al lado
 *     - el viento y las hojas suben cuando sopla
 *     - de día zumba el campo; de noche cantan los grillos
 *     - los bichos hablan cuando te acercas, cada especie con su voz
 *     - la música cambia sola al anochecer, con fundido
 *
 *   Lo que NO hace: sonar los pasos. Se probó y se quitó a petición del
 *   jugador, en el campo y en la tienda (ver la nota junto a SUELOS).
 *
 * DE DÓNDE SALEN LOS SONIDOS
 *   De `Game/MUSIC/`, y los escribe `tools/generar-sonidos.js`: son WAV de 8
 *   bits sintetizados con las cuatro voces de una consola antigua. Si hay que
 *   retocar alguno se cambia un número en ese script y se vuelve a ejecutar.
 *
 * LO QUE CUESTA, DICHO CLARO
 *   En disco son 3,2 MB de WAV. En memoria es otra cosa: el navegador los
 *   descodifica a coma flotante y los remuestrea a los 48 kHz de su reloj, así
 *   que lo que manda no es el peso del archivo sino la DURACIÓN. Los ~150
 *   segundos que se cargan en el campo salen a unos 29 MB de RAM (no de
 *   memoria de vídeo: no compite con las texturas del suelo, que es donde este
 *   juego va justo). En la tienda son 5 archivos y ~30 s.
 *
 *   Si algún día hay que bajarlo, lo que se recorta es duración: los temas y
 *   los seis bucles de ambiente son el 90 % del gasto; las cincuenta voces y
 *   pisadas juntas no llegan a 5 MB.
 *
 * QUE FALTE UN ARCHIVO NO PUEDE TUMBAR NADA
 *   Ya pasó con el clima: catorce PNG sin subir dejaron el sistema entero
 *   muerto. Aquí cada sonido se comprueba en la caché antes de tocarlo y, si
 *   no está, ESE sonido no suena y el resto sigue. Un archivo que falta se
 *   nota como un silencio, no como un juego roto. `GFAudio.diagnostico()`
 *   dice cuáles faltan.
 *
 * DE QUÉ SE ENTERA Y CÓMO
 *   No inventa nada: le pregunta a los módulos que ya saben.
 *     gf-clima      → si llueve, nieva, hace sol o sopla, y con cuánta fuerza
 *     gf-viento     → la fuerza de la racha, para las hojas
 *     gf-ciclo-dia  → cuánta noche hay (0..1), para grillos y para la música
 *     gf-animales   → qué bichos hay cerca y qué están haciendo
 *     gf-cuervo     → los cuervos
 *   Los truenos NO se adivinan: gf-clima los avisa (ver `trueno()`).
 *
 * EL VOLUMEN LO SIGUE MANDANDO EL PANEL DE SONIDO
 *   Todo lo de este módulo cuelga del control de EFECTOS que ya existe
 *   (`scene.audioState.sfxVolumeApplied`) y se lee en cada vuelta, así que
 *   mover la barra o silenciar se nota al instante. La música cuelga del
 *   control de música, como siempre.
 *
 * CÓMO SE ENGANCHA
 *   preload():  window.GFAudio && window.GFAudio.precargar(this, { tipo:'campo' });
 *   create():   window.GFAudio && window.GFAudio.montar(this,    { tipo:'campo' });
 *   En la tienda, `{ tipo:'tienda' }` (carga menos y pisa siempre madera).
 *
 * API
 *   GFAudio.precargar(scene, op) / montar(scene, op) / desmontar(scene)
 *   GFAudio.trueno(cerca, fuerza)      lo llama gf-clima
 *   GFAudio.chispa(fuerza)             lo llama gf-clima, en el fogonazo
 *   GFAudio.bicho(scene, especie, x, y, op)
 *   GFAudio.musica(cual)               'pradera' | 'noche' | 'tienda' | 'nada'
 *   GFAudio.material(scene, x, y)      qué se pisa ahí
 *   GFAudio.estado() / diagnostico()
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA    = './Game/MUSIC/';
  var PREFIJO = 'gfa_';               // para no chocar con las claves del juego

  // ── EL CATÁLOGO ─────────────────────────────────────────────────────────

  var TEMAS = { pradera: 'gf_pradera', noche: 'gf_noche', tienda: 'gf_tienda' };

  var AMBIENTES = {
    lluvia:  'amb_lluvia',
    viento:  'amb_viento',
    arboles: 'amb_arboles',
    soleado: 'amb_soleado',
    noche:   'amb_noche',
    nieve:   'amb_nieve'
  };

  /* LAS PISADAS YA NO SUENAN.

     Se quitaron a petición del jugador: molestaban tanto en el campo como en
     la tienda. Lo que se fue es el SONIDO. `material()` se queda, porque dice
     qué se pisa en cada sitio y de eso viven el diagnóstico y `mirarSuelo()`;
     y porque volver a encenderlas es reponer `pisar()` y esta tabla. Los WAV
     `paso_*` los sigue sabiendo escribir tools/generar-sonidos.js: están
     comentados en su catálogo, no borrados. */
  var SUELOS = {};

  var VOCES = {
    pajaro: 3, paloma: 2, cuervo: 2, buho: 2, vaca: 2, cerdo: 2,
    zorro: 2, cocodrilo: 1, serpiente: 2, conejo: 2, topo: 1
  };

  /* Qué voz usa cada especie del mapa. Las mariposas no están: una mariposa
     no hace ruido, y ponerle uno sería el tipo de detalle que delata que
     alguien ha metido sonido "porque sí". */
  var VOZ_DE = {
    zorro: 'zorro', zorra: 'zorro',
    vaca: 'vaca', cerdo: 'cerdo', cocodrilo: 'cocodrilo',
    serpiente_verde: 'serpiente', serpiente_coral: 'serpiente', serpiente_vibora: 'serpiente',
    topo: 'topo', conejo: 'conejo',
    paloma: 'paloma', pajaro: 'pajaro'
  };

  var RAYOS = { rayo: 3, centella: 2, chispa: 2 };

  // ── CUÁNTO SE OYE CADA COSA ─────────────────────────────────────────────

  /* Estos números son la MEZCLA. Son lo primero que hay que tocar si algo
     suena fuerte o flojo, y por eso están juntos y arriba.

     El criterio: el ambiente tiene que estar por DEBAJO del umbral de
     atención —se nota cuando falta, no cuando está— y los sucesos (un trueno,
     un bicho al lado) tienen que asomar por encima. */
  var MEZCLA = {
    lluvia:   0.42,
    viento:   0.34,
    arboles:  0.30,
    soleado:  0.26,
    noche:    0.30,
    nieve:    0.28,
    bicho:    0.42,
    trueno:   0.85,
    chispa:   0.30,
    musica:   1.00      // se multiplica por el control de música del panel
  };

  var ALCANCE_BICHO = 430;      // px: más lejos, no se oye
  var FUNDIDO_MS    = 1400;     // lo que tarda un ambiente en subir o bajar
  var FUNDIDO_TEMA  = 2600;     // lo que tarda la música en cambiar
  var MAX_VOCES     = 10;       // efectos sonando a la vez como mucho

  /* ── CADENCIAS ──────────────────────────────────────────────────────────
     Con un bicho hablando cada segundo y pico, un prado con cinco animales
     alrededor sonaba a granja de dibujos animados: se midió en la prueba y
     salían más de veinte voces en medio minuto. Un campo de verdad tiene
     ratos largos de nada, y el bicho que habla vale JUSTAMENTE porque hasta
     entonces no había hablado nadie. */
  var BICHO_CADA      = [7000, 18000];   // cada cuánto habla UN bicho concreto
  var BICHO_GLOBAL_MS = 2400;            // y cuánto se espera entre dos bichos

  function log() {
    if (!window.GF_AUDIO_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[audio]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function azEnt(a, b) { return Math.floor(az(a, b + 1)); }
  function tope(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ========================================================================
  // 1. CARGA
  // ========================================================================

  /** Nombres de archivo que hacen falta según dónde estemos. */
  function listaDe(tipo) {
    var l = [], k, i;

    if (tipo === 'tienda') {
      /* Bajo techo no hay pájaros ni grillos ni sol. Solo el tema y la lluvia
         —que se oye de fuera, apagada—. Cargar aquí los tres megas del campo
         sería alargar la entrada a la tienda para nada. */
      l.push(TEMAS.tienda, AMBIENTES.lluvia);
      return l;
    }

    l.push(TEMAS.pradera, TEMAS.noche);
    for (k in AMBIENTES) if (AMBIENTES.hasOwnProperty(k)) l.push(AMBIENTES[k]);
    for (k in VOCES) {
      if (!VOCES.hasOwnProperty(k)) continue;
      for (i = 1; i <= VOCES[k]; i++) l.push('an_' + k + '_' + i);
    }
    for (k in RAYOS) {
      if (!RAYOS.hasOwnProperty(k)) continue;
      for (i = 1; i <= RAYOS[k]; i++) l.push(k + '_' + i);
    }
    return l;
  }

  /**
   * Lo único que pasa por el cargador de Phaser: los temas.
   *
   * Van aquí porque la escena pregunta en `create()` si este módulo puede
   * hacerse cargo de la música (ver `llevaLaMusica`), y para contestar que sí
   * el archivo tiene que estar ya. Todo lo demás llega después, jugando, sin
   * que nadie espere por ello: los grillos pueden tardar dos segundos en
   * aparecer, la música no.
   */
  function esenciales(tipo) {
    return tipo === 'tienda' ? [TEMAS.tienda] : [TEMAS.pradera, TEMAS.noche];
  }

  function precargar(scene, op) {
    op = op || {};
    if (!scene || !scene.load || !scene.load.audio) return 0;
    var lista = esenciales(op.tipo || 'campo');
    var n = 0;
    for (var i = 0; i < lista.length; i++) {
      var clave = PREFIJO + lista[i];
      try {
        if (scene.cache.audio.exists(clave)) continue;
        scene.load.audio(clave, RUTA + lista[i] + '.wav');
        n++;
      } catch (e) { /* un archivo que no entra no puede parar la carga */ }
    }
    log('en cola', n, 'temas (' + (op.tipo || 'campo') + ')');
    return n;
  }

  /* Cuántos WAV se descargan a la vez por detrás. Cuatro es de sobra: son
     archivos de entre 4 y 130 KB y el juego ya está andando mientras llegan. */
  var TANDA = 4;

  /**
   * LOS OTROS CINCUENTA SONIDOS SE CARGAN A MANO, SIN EL CARGADOR DE PHASER.
   *
   * Y hay dos razones, las dos medidas en este proyecto:
   *
   * 1. EL CARGADOR SE ATASCA. Metiendo los 52 WAV de golpe en `preload`, el
   *    cargador de Phaser se queda clavado EXACTAMENTE en 32 archivos —su
   *    `maxParallelDownloads`— con los otros 22 en la lista, cero en vuelo,
   *    cero en proceso y cero errores. Reproducido dos veces seguidas; una
   *    llamada a mano a `checkLoadQueue()` lo despierta y termina bien. Con la
   *    pantalla de carga del juego delante, eso no es un sonido que falta: es
   *    una partida que no arranca nunca.
   *
   * 2. GAMESCENE YA USA EL CARGADOR EN CALIENTE. En `cargarTileManager` hace
   *    `scene.load.json(...)` y engancha un `load.once('complete')` para leer
   *    la metadata del mapa. Si este módulo arrancara cargas por su cuenta en
   *    el mismo cargador, ese `once` saltaría con NUESTRA carga y el
   *    TileManager leería una metadata que todavía no está. El suelo del mapa
   *    dejaría de aparecer por culpa del sonido, que es el tipo de fallo que
   *    nadie relaciona jamás.
   *
   * `fetch` + `decodeAudioData` + meter el AudioBuffer en la caché de Phaser
   * hace exactamente lo que haría el cargador, sin tocar ninguna de las dos
   * cosas. `sound.add(clave)` a partir de ahí funciona igual.
   */
  function cargarDeFondo(st) {
    var ctx = st.scene.sound && st.scene.sound.context;
    if (!ctx || !ctx.decodeAudioData) {
      /* Sin WebAudio (respaldo de <audio> o sin sonido) no hay dónde meter un
         AudioBuffer. Se queda con los temas y ya: en ese modo tampoco habría
         paneo ni mezcla fina, así que no se pierde gran cosa. */
      log('sin WebAudio: no se cargan los ambientes');
      st.cargaTerminada = true;
      return;
    }
    var enCurso = 0;

    function siguiente() {
      while (enCurso < TANDA && st.porCargar.length) {
        var nombre = st.porCargar.shift();
        var clave = PREFIJO + nombre;
        if (st.scene.cache.audio.exists(clave)) { st.cargados++; continue; }
        enCurso++;
        pedir(nombre, clave);
      }
      if (!enCurso && !st.porCargar.length) {
        st.cargaTerminada = true;
        log('carga de fondo terminada:', st.cargados, 'sonidos,',
            Object.keys(st.faltan).length, 'que faltan');
      }
    }

    function pedir(nombre, clave) {
      fetch(RUTA + nombre + '.wav')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(function (bytes) {
          return new Promise(function (bien, mal) {
            /* Con retrollamadas y no con promesa: la forma de promesa de
               `decodeAudioData` no la tienen los Safari viejos, y la de
               retrollamadas la tienen todos. */
            ctx.decodeAudioData(bytes, bien, mal);
          });
        })
        .then(function (buffer) {
          try {
            if (st.scene.cache && st.scene.cache.audio) {
              st.scene.cache.audio.add(clave, buffer);
              st.cargados++;
            }
          } catch (e) {}
        })
        .catch(function (e) {
          st.faltan[clave] = true;
          if (!st.avisoCarga) {
            st.avisoCarga = true;
            console.warn('[audio] no se pudo cargar ' + nombre + '.wav (' + e.message +
                         '). ¿Se ejecutó tools/generar-sonidos.js? Mira GFAudio.diagnostico().');
          }
        })
        .then(function () { enCurso--; siguiente(); });
    }

    siguiente();
  }

  // ========================================================================
  // 2. EL SURTIDOR DE SONIDOS
  // ========================================================================

  /**
   * Toma un `Sound` libre de la reserva, o hace uno nuevo.
   *
   * POR QUÉ HAY RESERVA: el juego llamaba a `sound.add()` en cada efecto y
   * dejaba el objeto ahí colgado; hay hasta un temporizador en GameScene que
   * pasa cada tanto a barrer los que ya terminaron. Con pisadas cada 300 ms
   * eso son doscientos objetos por minuto. Aquí se reaprovechan: un `Sound`
   * que ya no suena vuelve a la reserva y se usa para el siguiente paso.
   */
  function tomar(st, clave) {
    var reserva = st.reserva[clave];
    if (!reserva) reserva = st.reserva[clave] = [];
    for (var i = 0; i < reserva.length; i++) {
      if (!reserva[i].isPlaying) return reserva[i];
    }
    if (reserva.length >= 4) return null;         // ese sonido ya está saturado
    try {
      var s = st.scene.sound.add(clave);
      reserva.push(s);
      return s;
    } catch (e) { return null; }
  }

  /** Cuántas voces suenan ahora mismo entre todas las reservas. */
  function vocesVivas(st) {
    var n = 0;
    for (var k in st.reserva) {
      if (!st.reserva.hasOwnProperty(k)) continue;
      for (var i = 0; i < st.reserva[k].length; i++) if (st.reserva[k][i].isPlaying) n++;
    }
    return n;
  }

  /**
   * Suelta un efecto en el mundo.
   *
   * op: { x, y, vol, tono, sinSitio }
   *   x,y        dónde pasa. Se traduce a volumen (lejos = flojo) y a canal
   *              (a la izquierda = suena a la izquierda).
   *   tono       multiplicador de velocidad. Es lo que hace que dos pisadas
   *              seguidas no sean idénticas.
   *   sinSitio   para lo que no está en ningún sitio (el trueno, la lluvia):
   *              suena centrado y a pleno volumen.
   */
  function sonar(st, clave, op) {
    op = op || {};
    if (!st.scene || !st.scene.sys || !st.scene.sys.isActive()) return null;
    if (!st.scene.cache.audio.exists(clave)) {
      if (!st.faltan[clave]) { st.faltan[clave] = true; log('falta el archivo', clave); }
      return null;
    }
    var maestro = volumenEfectos(st);
    if (maestro <= 0.001) return null;

    var vol = (op.vol === undefined ? 1 : op.vol) * maestro;
    var pan = 0;

    if (!op.sinSitio) {
      var oyente = donde(st);
      var dx = op.x - oyente.x, dy = op.y - oyente.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var alcance = op.alcance || ALCANCE_BICHO;
      if (d > alcance) return null;
      /* Al cuadrado y no lineal: el sonido de verdad cae con el cuadrado de
         la distancia, y lineal daba la sensación de que todo estaba encima. */
      var cerca = 1 - d / alcance;
      vol *= cerca * cerca;
      pan = tope(dx / (alcance * 0.7), -1, 1) * 0.75;
    }
    if (vol <= 0.004) return null;

    // Con más de diez voces a la vez ya no se distingue nada y el móvil suda.
    if (vocesVivas(st) >= MAX_VOCES) return null;

    var s = tomar(st, clave);
    if (!s) return null;
    try {
      s.setVolume(vol);
      if (s.setRate) s.setRate(op.tono || 1);
      /* El paneo solo existe en WebAudio. Con el respaldo de <audio> del
         navegador no está, y llamarlo reventaría: por eso se comprueba. */
      if (s.setPan) s.setPan(pan);
      s.play();
    } catch (e) { return null; }
    return s;
  }

  /** Dónde están las orejas: el jugador si lo hay, y si no el centro de cámara. */
  function donde(st) {
    var scene = st.scene;
    if (scene.player && scene.player.x !== undefined) return scene.player;
    var cam = scene.cameras && scene.cameras.main;
    if (cam) return { x: cam.midPoint.x, y: cam.midPoint.y };
    return { x: 0, y: 0 };
  }

  /* El volumen de efectos y el de música salen del panel de sonido que ya
     existe. Se leen en cada vuelta —no se copian al montar— para que mover la
     barra se note en el acto, incluso en los bucles que llevan minutos
     sonando. */
  function volumenEfectos(st) {
    var a = st.scene.audioState;
    if (!a) return 0.7;
    if (a.sfxMuted) return 0;
    var v = a.sfxVolumeApplied;
    return (typeof v === 'number') ? v : 0.7;
  }
  function volumenMusica(st) {
    var a = st.scene.audioState;
    if (!a) return 0.6;
    if (a.musicMuted) return 0;
    var v = a.musicVolumeApplied;
    return (typeof v === 'number') ? v : 0.6;
  }

  // ========================================================================
  // 3. LO QUE SE PISA
  // ========================================================================

  /**
   * EL PROBLEMA
   *   El mapa se dibuja con trozos de PNG ya recortados (`recortadas/`), no
   *   con la capa de tiles: por eso `createLayer` está comentado en
   *   GameScene. Pero el TILEMAP sí está cargado —`this.map` existe— y ahí
   *   dentro sigue estando, casilla por casilla, qué tile hay en cada sitio.
   *   Eso es lo que se lee aquí.
   *
   * DE TILE A MATERIAL, SIN TABLA A MANO
   *   El mapa usa 744 tiles distintos. Escribir a mano cuál es tierra y cuál
   *   ladrillo es media tarde de trabajo y queda roto en cuanto alguien toque
   *   el tileset. En vez de eso se MIRA el dibujo: se saca el color medio del
   *   tile y su contraste interno, y con eso se decide.
   *
   *   Funciona porque los suelos de este mapa son inconfundibles en color:
   *     verde                    → hierba
   *     marrón claro             → tierra
   *     azul                     → agua
   *     gris con dibujo dentro   → ladrillo  (las juntas dan mucho contraste)
   *     gris liso                → cemento
   *
   *   El contraste es el que separa ladrillo de cemento, y es el dato bueno:
   *   un adoquinado tiene juntas y una losa de cemento no, aunque los dos
   *   sean del mismo gris. Medido sobre los tiles que más sale en el mapa:
   *   los lisos andan por 8-21 de desviación y los de junta por 26-38.
   *
   * SE MIRA UNA VEZ POR TILE
   *   El resultado se guarda por número de tile. Un mapa entero acaba
   *   costando unas pocas decenas de lecturas de 256 píxeles, repartidas por
   *   toda la partida. Y el lienzo que hace falta para leerlas se tira solo a
   *   los diez segundos de no usarlo (ver `soltarLienzo`).
   */
  var CONTRASTE_JUNTA = 24;      // desviación media a partir de la cual hay junta

  function lienzoTileset(st) {
    if (st.lienzo) { st.lienzoUsado = Date.now(); return st.lienzo; }
    try {
      var tex = st.scene.textures.get('tiles');
      if (!tex || !tex.getSourceImage) return null;
      var img = tex.getSourceImage();
      if (!img || !img.width) return null;
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      st.lienzo = { ctx: ctx, w: img.width, h: img.height };
      st.lienzoUsado = Date.now();
      log('tileset leído', img.width + 'x' + img.height);
      return st.lienzo;
    } catch (e) {
      log('no se pudo leer el tileset:', e.message);
      st.sinLienzo = true;
      return null;
    }
  }

  /** Diez segundos sin pisar suelo nuevo y el lienzo sobra. */
  function soltarLienzo(st) {
    if (!st.lienzo) return;
    if (Date.now() - st.lienzoUsado < 10000) return;
    st.lienzo = null;
    log('lienzo del tileset soltado');
  }

  /** El tileset al que pertenece un tile, y su geometría dentro de la imagen. */
  function tilesetDe(st, gid) {
    var map = st.scene.map;
    if (!map || !map.tilesets) return null;
    var mejor = null;
    for (var i = 0; i < map.tilesets.length; i++) {
      var ts = map.tilesets[i];
      if (ts.firstgid <= gid && (!mejor || ts.firstgid > mejor.firstgid)) mejor = ts;
    }
    return mejor;
  }

  /** Color medio y contraste interno de un tile del tileset. */
  function mirarTile(st, gid) {
    var L = lienzoTileset(st);
    if (!L) return null;
    var ts = tilesetDe(st, gid);
    if (!ts) return null;

    var tw = ts.tileWidth || 16, th = ts.tileHeight || 16;
    var m = ts.tileMargin || 0, sp = ts.tileSpacing || 0;
    var cols = Math.max(1, Math.floor((L.w - 2 * m + sp) / (tw + sp)));
    var idx = gid - ts.firstgid;
    var tx = m + (idx % cols) * (tw + sp);
    var ty = m + Math.floor(idx / cols) * (th + sp);
    if (tx < 0 || ty < 0 || tx + tw > L.w || ty + th > L.h) return null;

    var d;
    try { d = L.ctx.getImageData(tx, ty, tw, th).data; } catch (e) { return null; }

    var r = 0, g = 0, b = 0, n = 0, i;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 30) continue;          // transparente: no cuenta
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (n < tw * th * 0.4) return null;     // tile casi vacío
    r /= n; g /= n; b /= n;

    /* Desviación media SUMANDO LOS TRES CANALES, no promediándolos. Es la
       misma cuenta con la que se midió el tileset fuera del navegador para
       sacar el umbral, y tiene que seguir siéndolo: al dividir además entre
       tres, los números salían a un tercio y NINGÚN tile llegaba al umbral —
       el mapa entero se clasificaba como cemento y el ladrillo no sonaba
       nunca. Lo cazó la prueba de _prueba_sonido.html contando materiales. */
    var desv = 0;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 30) continue;
      desv += Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
    }
    return { r: r, g: g, b: b, desv: desv / n };
  }

  /** Del color al nombre del material. */
  function clasificar(c) {
    var M = Math.max(c.r, c.g, c.b), m = Math.min(c.r, c.g, c.b);
    var sat = M === 0 ? 0 : (M - m) / M;
    var luz = M / 255;
    var h = 0, d = M - m;
    if (d > 0) {
      if (M === c.r) h = ((c.g - c.b) / d + 6) % 6;
      else if (M === c.g) h = (c.b - c.r) / d + 2;
      else h = (c.r - c.g) / d + 4;
      h *= 60;
    }

    if (sat < 0.20) {
      // gris: piedra. Lo que decide es si tiene juntas dibujadas.
      if (luz < 0.12) return 'tierra';                   // casi negro: sombra, mejor tierra
      return c.desv >= CONTRASTE_JUNTA ? 'ladrillo' : 'cemento';
    }
    if (h >= 75 && h <= 175) return 'hierba';
    if (h >= 176 && h <= 260) return 'agua';
    if (h < 60 || h > 330) return 'tierra';
    return 'tierra';
  }

  /** La capa de tiles del suelo. La primera que sea de tiles: es el suelo. */
  function capaSuelo(st) {
    if (st.capa !== undefined) return st.capa;
    st.capa = null;
    try {
      var map = st.scene.map;
      if (map && map.layers) {
        for (var i = 0; i < map.layers.length; i++) {
          if (map.layers[i].data && map.layers[i].data.length) { st.capa = map.layers[i]; break; }
        }
      }
    } catch (e) {}
    return st.capa;
  }

  /**
   * Qué se pisa en (x, y).
   *
   * El tiempo manda por encima del suelo: si está nevando se pisa nieve
   * aunque debajo haya ladrillo, y si llueve, los caminos de tierra chapotean.
   * Sobre hierba mojada no: la hierba mojada sigue sonando a hierba.
   */
  function material(scene, x, y) {
    var st = scene && scene.__gfAudio;
    if (!st) return 'tierra';

    if (st.suelo) return st.suelo;             // la tienda es toda de madera

    var base = st.ultimoMaterial || 'hierba';
    var capa = capaSuelo(st);
    if (capa) {
      var tw = capa.baseTileWidth || capa.tileWidth || 16;
      var thh = capa.baseTileHeight || capa.tileHeight || 16;
      var tx = Math.floor(x / tw), ty = Math.floor(y / thh);
      if (ty >= 0 && ty < capa.data.length && tx >= 0 && tx < capa.data[ty].length) {
        var t = capa.data[ty][tx];
        var gid = t ? t.index : -1;
        if (gid > 0) {
          if (st.porTile[gid]) base = st.porTile[gid];
          else if (!st.sinLienzo) {
            var c = mirarTile(st, gid);
            base = st.porTile[gid] = c ? clasificar(c) : 'tierra';
          }
        }
      }
    }
    st.ultimoMaterial = base;

    // Y ahora lo que hay ENCIMA del suelo.
    var cl = leerClima(st);
    if (cl.nieve > 0.35) return 'nieve';
    if (cl.lluvia > 0.45 && (base === 'tierra' || base === 'cemento' || base === 'ladrillo')) return 'agua';
    return base;
  }

  // ========================================================================
  // 4. LO QUE DICEN LOS DEMÁS MÓDULOS
  // ========================================================================

  /**
   * El tiempo, en números de 0 a 1.
   *
   * Se prefiere el estado MONTADO (`scene.__gfClima`) al declarado, porque el
   * montado lleva las fuerzas ya suavizadas: la lluvia entra y sale poco a
   * poco en la pantalla, y el sonido tiene que entrar y salir con ella. Con el
   * booleano pelado, el chaparrón arrancaría de golpe a todo volumen mientras
   * en pantalla todavía no cae una gota.
   */
  function leerClima(st) {
    var c = st.clima;
    var ahora = Date.now();
    if (c && ahora - st.climaLeido < 240) return c;

    c = st.clima = st.clima || { lluvia: 0, nieve: 0, sol: 0, viento: 0, hayClima: false };
    st.climaLeido = ahora;
    c.lluvia = c.nieve = c.sol = 0;
    c.hayClima = false;

    try {
      var e = window.GFClima && window.GFClima.estado ? window.GFClima.estado() : null;
      if (e && e.activo) {
        c.hayClima = true;
        var m = st.scene.__gfClima;
        c.lluvia = e.lluvia ? (m && typeof m.fuerzaLluvia === 'number' ? m.fuerzaLluvia : 1) : 0;
        c.nieve  = e.nieve  ? (m && typeof m.fuerzaNieve  === 'number' ? m.fuerzaNieve  : 1) : 0;
        c.sol    = e.soleado ? (m && typeof m.fuerzaSol   === 'number' ? m.fuerzaSol    : 1) : 0;
      }
    } catch (x) {}

    /* El viento se pregunta aparte y SIN crear objetos: `vector()` existe
       justo para eso, porque la lluvia ya se lo pide en cada frame. */
    try {
      if (window.GFViento && window.GFViento.vector) {
        window.GFViento.vector(st.vectorViento);
        c.viento = tope(st.vectorViento.fuerza || 0, 0, 2) / 1.4;
      }
    } catch (x) { c.viento = 0; }

    return c;
  }

  /** Cuánta noche hay: 0 pleno día, 1 noche cerrada. */
  function oscuridad(st) {
    try {
      if (window.GFCiclo && window.GFCiclo.oscuridad && window.GFCiclo.hayHora &&
          window.GFCiclo.hayHora()) {
        return tope(window.GFCiclo.oscuridad(), 0, 1);
      }
    } catch (e) {}
    return st.tipo === 'tienda' ? 0 : 0;   // sin reloj, de día
  }

  // ========================================================================
  // 5. LOS BUCLES DE AMBIENTE
  // ========================================================================

  /**
   * Los bucles se crean CUANDO HACEN FALTA, no al montar. Un día despejado no
   * llega a crear nunca el objeto de la lluvia, y el sonido de la nieve solo
   * existe si nieva. En un móvil eso son varios megas de audio descodificado
   * que no se reservan.
   */
  function bucle(st, nombre) {
    var b = st.bucles[nombre];
    if (b) return b;
    var clave = PREFIJO + AMBIENTES[nombre];
    if (!st.scene.cache.audio.exists(clave)) {
      if (!st.faltan[clave]) { st.faltan[clave] = true; log('falta el ambiente', clave); }
      return null;
    }
    try {
      b = st.bucles[nombre] = { son: st.scene.sound.add(clave, { loop: true, volume: 0 }),
                                actual: 0, destino: 0 };
      return b;
    } catch (e) { return null; }
  }

  /** Qué volumen le toca ahora a cada ambiente. */
  function mezclarAmbiente(st) {
    var c = leerClima(st);
    var noche = oscuridad(st);
    var o = st.objetivo;

    if (st.tipo === 'tienda') {
      /* Dentro solo entra la lluvia, y apagada: es el agua que se oye en el
         tejado. El resto del campo se queda fuera, que para eso hay paredes. */
      o.lluvia  = c.lluvia > 0 ? MEZCLA.lluvia * 0.28 * c.lluvia : 0;
      o.viento = o.arboles = o.soleado = o.noche = o.nieve = 0;
      return o;
    }

    o.lluvia = MEZCLA.lluvia * tope(c.lluvia, 0, 1);
    o.nieve  = MEZCLA.nieve  * tope(c.nieve, 0, 1);

    /* El viento suena aunque el clima diga que no sopla: gf-viento sortea
       rachas por su cuenta cuando el servidor no manda. Lo que se oye es la
       racha de verdad, no la orden. */
    var v = tope(c.viento, 0, 1);
    o.viento = MEZCLA.viento * v;

    /* Las hojas siempre susurran un poco —un bosque nunca está callado— y se
       levantan con la racha. Con lluvia fuerte se las come el agua. */
    o.arboles = MEZCLA.arboles * (0.28 + 0.72 * v) * (1 - 0.6 * tope(c.lluvia, 0, 1));

    /* De día zumba el campo. Solo con buen tiempo: bajo la lluvia no hay
       insectos, y de noche tampoco. */
    var dia = 1 - noche;
    var despejado = tope(1 - c.lluvia - c.nieve, 0, 1);
    o.soleado = MEZCLA.soleado * dia * despejado * (c.hayClima ? (0.45 + 0.55 * tope(c.sol, 0, 1)) : 0.7);

    /* Los grillos entran con la oscuridad, no con un interruptor: se les oye
       aparecer al atardecer. Con lluvia se callan. */
    o.noche = MEZCLA.noche * Math.pow(noche, 1.4) * despejado;

    return o;
  }

  /** Lleva cada bucle hacia su objetivo, y para los que llegan a cero. */
  function moverAmbiente(st, delta) {
    var o = mezclarAmbiente(st);
    var paso = tope(delta / FUNDIDO_MS, 0, 1);
    var maestro = volumenEfectos(st);

    for (var nombre in o) {
      if (!o.hasOwnProperty(nombre)) continue;
      var destino = o[nombre];
      var b = st.bucles[nombre];

      // Nada que sonar y nada sonando: ni se crea el objeto.
      if (!b && destino <= 0.001) continue;
      if (!b) { b = bucle(st, nombre); if (!b) continue; }

      b.destino = destino;
      b.actual += (destino - b.actual) * paso;

      var vol = b.actual * maestro;
      if (vol > 0.002) {
        try {
          if (!b.son.isPlaying) b.son.play();
          b.son.setVolume(vol);
        } catch (e) {}
      } else if (b.son.isPlaying) {
        try { b.son.stop(); } catch (e) {}
      }
    }
  }

  // ========================================================================
  // 6. LA MÚSICA
  // ========================================================================

  /**
   * Cambia el tema con fundido cruzado.
   *
   * SE HACE CARGO DEL `audioState` DE LA ESCENA. El panel de sonido del juego
   * lee `audioState.currentMusic` para aplicar el volumen y `currentMusicKey`
   * para el selector; si este módulo pusiera la música por su cuenta sin
   * apuntarla ahí, la barra de música dejaría de funcionar. Así que se apunta.
   */
  function musica(scene, cual) {
    var st = scene && scene.__gfAudio;
    if (!st) return false;
    if (st.temaActual === cual) return true;

    var clave = TEMAS[cual] ? PREFIJO + TEMAS[cual] : null;
    if (cual !== 'nada' && (!clave || !scene.cache.audio.exists(clave))) {
      if (clave && !st.faltan[clave]) { st.faltan[clave] = true; log('falta el tema', clave); }
      return false;
    }

    // Lo que estaba sonando se va bajando; se apaga solo en `moverMusica`.
    if (st.tema) st.saliendo.push({ son: st.tema, vol: st.temaVol });
    st.tema = null;
    st.temaVol = 0;
    st.temaActual = cual;

    if (cual === 'nada') {
      if (scene.audioState) { scene.audioState.currentMusic = null; scene.audioState.currentMusicKey = null; }
      return true;
    }

    try {
      st.tema = scene.sound.add(clave, { loop: true, volume: 0 });
      st.tema.play();
      if (scene.audioState) {
        /* Se para la música vieja del juego (Principal.ogg) si seguía puesta,
           o sonarían las dos a la vez.

           PERO NO SI ES NUESTRA. Al pasar de día a noche, la que estaba
           apuntada en `currentMusic` es justo el tema que acabamos de meter
           en `saliendo` para bajarlo poco a poco. Sin esta comprobación se
           mataba de golpe: el fundido cruzado de dos segundos y medio se
           quedaba en un corte seco al anochecer, todas las noches. */
        var vieja = scene.audioState.currentMusic;
        var nuestra = false;
        for (var i = 0; i < st.saliendo.length; i++) {
          if (st.saliendo[i].son === vieja) nuestra = true;
        }
        if (vieja && vieja !== st.tema && !nuestra) {
          try { vieja.stop(); vieja.destroy(); } catch (e) {}
        }
        scene.audioState.currentMusic = st.tema;
        scene.audioState.currentMusicKey = clave;
      }
      log('tema →', cual);
      return true;
    } catch (e) {
      console.warn('[audio] no se pudo poner el tema', cual, e);
      st.tema = null;
      return false;
    }
  }

  /** Qué tema toca ahora, con histéresis para no oscilar al anochecer. */
  function temaQueToca(st) {
    if (st.tipo === 'tienda') return 'tienda';
    var n = oscuridad(st);
    if (st.temaActual === 'noche') return n < 0.40 ? 'pradera' : 'noche';
    return n > 0.62 ? 'noche' : 'pradera';
  }

  function moverMusica(st, delta) {
    var quiere = temaQueToca(st);
    if (quiere !== st.temaActual) musica(st.scene, quiere);

    var maestro = volumenMusica(st) * MEZCLA.musica;
    var paso = tope(delta / FUNDIDO_TEMA, 0, 1);

    if (st.tema) {
      st.temaVol += (1 - st.temaVol) * paso;
      try { st.tema.setVolume(st.temaVol * maestro); } catch (e) {}
    }
    for (var i = st.saliendo.length - 1; i >= 0; i--) {
      var s = st.saliendo[i];
      s.vol -= paso;
      if (s.vol <= 0.01) {
        try { s.son.stop(); s.son.destroy(); } catch (e) {}
        st.saliendo.splice(i, 1);
      } else {
        try { s.son.setVolume(s.vol * maestro); } catch (e) {}
      }
    }
  }

  // ========================================================================
  // 7. RAYOS Y TRUENOS   (los llama gf-clima)
  // ========================================================================

  /** La escena viva que tiene audio montado. */
  function escenaViva() {
    if (montado && montado.scene && montado.scene.sys && montado.scene.sys.isActive()) return montado;
    return null;
  }

  /**
   * Un trueno. Lo avisa gf-clima cuando le toca retumbar, con el mismo retardo
   * que ya usaba para sacudir la cámara — que es el retardo bueno, porque la
   * luz llega antes que el sonido y ese hueco es lo que hace creíble una
   * tormenta.
   *
   * `cerca` distingue el rayo con trazo (crujido + retumbo) de la centella
   * lejana (solo retumbo). `fuerza` la manda gf-clima entre 0,25 y 1,3.
   */
  function trueno(cerca, fuerza) {
    var st = escenaViva();
    if (!st) return false;
    fuerza = tope(fuerza === undefined ? 1 : fuerza, 0.15, 1.4);

    var familia = cerca ? 'rayo' : 'centella';
    var clave = PREFIJO + familia + '_' + azEnt(1, RAYOS[familia]);

    /* Dentro de la tienda el trueno se oye, pero apagado y sin el crujido:
       es el mismo trueno oído desde debajo de un tejado. */
    var techo = st.tipo === 'tienda' ? 0.45 : 1;

    sonar(st, clave, {
      sinSitio: true,
      vol: MEZCLA.trueno * fuerza * techo,
      // Un trueno más grave se lee como más lejos. El tono lo da la fuerza.
      tono: az(0.88, 1.06) * (cerca ? 1 : 0.92)
    });
    return true;
  }

  /** El zumbido eléctrico del fogonazo, en el instante del relámpago. */
  function chispa(fuerza) {
    var st = escenaViva();
    if (!st || st.tipo === 'tienda') return false;
    sonar(st, PREFIJO + 'chispa_' + azEnt(1, RAYOS.chispa), {
      sinSitio: true,
      vol: MEZCLA.chispa * tope(fuerza === undefined ? 1 : fuerza, 0.2, 1.2),
      tono: az(0.9, 1.15)
    });
    return true;
  }

  // ========================================================================
  // 8. LOS BICHOS
  // ========================================================================

  /** Un bicho concreto habla. También lo usa gf-buho para el ulular. */
  function bicho(scene, especie, x, y, op) {
    var st = (scene && scene.__gfAudio) || escenaViva();
    if (!st) return false;
    op = op || {};
    var voz = VOCES[especie] ? especie : VOZ_DE[especie];
    if (!voz || !VOCES[voz]) return false;

    var ahora = st.scene.time.now;
    if (!op.aLaFuerza && ahora < st.proximoBicho) return false;
    st.proximoBicho = ahora + BICHO_GLOBAL_MS;

    var s = sonar(st, PREFIJO + 'an_' + voz + '_' + azEnt(1, VOCES[voz]), {
      x: x, y: y,
      vol: (op.vol || 1) * MEZCLA.bicho,
      /* Cada individuo tiene su tono: dos palomas seguidas con el mismo
         archivo y el mismo tono suenan a lo que son, un archivo repetido. */
      tono: op.tono || az(0.88, 1.14),
      alcance: op.alcance || ALCANCE_BICHO
    });
    return !!s;
  }

  /**
   * Barre la fauna de alrededor y deja hablar a alguno.
   *
   * No suenan todos: se sortea. Un prado donde los quince bichos hablan cada
   * pocos segundos suena a granja de dibujos animados. La regla es que cuanto
   * más cerca está uno, más probable es oírlo — y los que duermen, los que
   * están muertos y los topos bajo tierra no dicen nada.
   */
  function revisarBichos(st, ahora) {
    if (ahora < st.proximoBarrido) return;
    st.proximoBarrido = ahora + 850;
    if (st.tipo === 'tienda') return;

    var oyente = donde(st);
    var fauna = st.scene.__gfFauna;
    var i, a, dx, dy, d;

    if (fauna && fauna.animales) {
      for (i = 0; i < fauna.animales.length; i++) {
        a = fauna.animales[i];
        if (!a || !a.spr || a.muerto || a.congelado) continue;
        if (a.fase === 'duerme' || a.fase === 'bajo' || a.fase === 'muerto') continue;
        if (!VOZ_DE[a.especie]) continue;                 // mariposas y demás: mudas
        if (a.proximaVoz && ahora < a.proximaVoz) continue;

        dx = a.spr.x - oyente.x; dy = a.spr.y - oyente.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d > ALCANCE_BICHO) continue;

        /* La serpiente solo sisea si la tienes encima: un siseo que se oye a
           cuatro pantallas de distancia no asusta, desconcierta. */
        var alcance = (a.grupo === 'serpiente') ? 210 : ALCANCE_BICHO;
        if (d > alcance) continue;

        var cerca = 1 - d / alcance;
        /* Si huye o ataca, habla casi seguro: ahí el sonido está contando algo
           que pasa, y ése es el sonido que vale la pena. */
        var alterado = (a.fase === 'huye' || a.fase === 'ataca' || a.fase === 'persigue');
        if (!alterado && Math.random() > cerca * 0.5) continue;

        a.proximaVoz = ahora + az(BICHO_CADA[0], BICHO_CADA[1]) * (alterado ? 0.35 : 1);
        if (bicho(st.scene, a.especie, a.spr.x, a.spr.y,
                  { vol: alterado ? 1.15 : 1, alcance: alcance })) return;
      }
    }

    // Los cuervos van por su cuenta: son de otro módulo.
    var cv = st.scene.__gfCuervo;
    if (cv && cv.cuervos) {
      for (i = 0; i < cv.cuervos.length; i++) {
        var c = cv.cuervos[i];
        if (!c || !c.spr || !c.spr.visible) continue;
        if (c.proximaVoz && ahora < c.proximaVoz) continue;
        dx = c.spr.x - oyente.x; dy = c.spr.y - oyente.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d > ALCANCE_BICHO) continue;
        if (!c.asustado && Math.random() > (1 - d / ALCANCE_BICHO) * 0.4) continue;
        c.proximaVoz = ahora + az(7000, 20000) * (c.asustado ? 0.3 : 1);
        if (bicho(st.scene, 'cuervo', c.spr.x, c.spr.y, { vol: c.asustado ? 1.2 : 0.9 })) return;
      }
    }
  }

  // ========================================================================
  // 10. MONTAJE
  // ========================================================================

  var montado = null;

  function montar(scene, op) {
    op = op || {};
    if (!scene || !scene.sound || typeof scene.sound.add !== 'function') {
      console.warn('[audio] la escena no tiene sonido; no se monta');
      return null;
    }
    if (scene.__gfAudio) return scene.__gfAudio;

    var st = {
      scene: scene,
      tipo: op.tipo || 'campo',
      suelo: op.suelo || (op.tipo === 'tienda' ? 'madera' : null),
      bucles: {}, reserva: {}, faltan: {},
      objetivo: { lluvia: 0, viento: 0, arboles: 0, soleado: 0, noche: 0, nieve: 0 },
      clima: null, climaLeido: 0, vectorViento: { dir: 1, fuerza: 0 },
      porTile: {}, lienzo: null, lienzoUsado: 0, sinLienzo: false,
      ultimoMaterial: 'hierba', capa: undefined,
      proximoBicho: 0, proximoBarrido: 0,
      tema: null, temaVol: 0, temaActual: null, saliendo: [],
      porCargar: [], cargados: 0, cargaTerminada: false
    };
    scene.__gfAudio = st;
    montado = st;

    /* Y ahora, por detrás, los otros cincuenta: ambientes, bichos, truenos y
       pisadas. El juego ya está en marcha; van llegando. */
    var todo = listaDe(st.tipo), fuera = esenciales(st.tipo);
    for (var i = 0; i < todo.length; i++) {
      if (fuera.indexOf(todo[i]) < 0) st.porCargar.push(todo[i]);
    }
    st.porCargarTotal = st.porCargar.length;
    cargarDeFondo(st);

    st.onUpdate = function (ahora, delta) {
      /* Nunca romper el frame. Un fallo en el sonido no puede dejar el juego
         congelado, así que el bucle entero va envuelto. */
      try {
        delta = Math.min(delta, 250);          // volver de una pestaña dormida
        moverAmbiente(st, delta);
        moverMusica(st, delta);
        revisarBichos(st, ahora);
        soltarLienzo(st);
      } catch (e) {
        if (!st.avisado) { st.avisado = true; console.warn('[audio] fallo en el bucle:', e); }
      }
    };
    scene.events.on('update', st.onUpdate);

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    /* HASTA QUE NO TOQUE LA PANTALLA, EL NAVEGADOR NO DEJA SONAR NADA.
       Si el juego arranca con el audio bloqueado, los bucles se crean pero no
       suenan y se quedan mudos para siempre. Phaser avisa cuando se
       desbloquea; ahí se le da un empujón para que arranquen. */
    if (scene.sound.locked) {
      st.onDesbloqueo = function () { log('audio desbloqueado'); st.temaActual = null; };
      scene.sound.once('unlocked', st.onDesbloqueo);
    }

    log('montado (' + st.tipo + ')');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfAudio;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var k, i;
    for (k in st.bucles) {
      if (!st.bucles.hasOwnProperty(k)) continue;
      try { st.bucles[k].son.stop(); st.bucles[k].son.destroy(); } catch (e) {}
    }
    for (k in st.reserva) {
      if (!st.reserva.hasOwnProperty(k)) continue;
      for (i = 0; i < st.reserva[k].length; i++) {
        try { st.reserva[k][i].stop(); st.reserva[k][i].destroy(); } catch (e) {}
      }
    }
    for (i = 0; i < st.saliendo.length; i++) {
      try { st.saliendo[i].son.stop(); st.saliendo[i].son.destroy(); } catch (e) {}
    }
    /* El tema NO se destruye aquí si la escena lo tiene apuntado como música
       actual: de eso se encarga el sistema de audio del juego al apagarse, y
       destruirlo dos veces truena en la consola. Solo se suelta la referencia. */
    if (st.tema && scene.audioState && scene.audioState.currentMusic !== st.tema) {
      try { st.tema.stop(); st.tema.destroy(); } catch (e) {}
    }
    st.bucles = {}; st.reserva = {}; st.saliendo = [];
    st.lienzo = null;
    scene.__gfAudio = null;
    if (montado === st) montado = null;
    log('desmontado');
  }

  // ========================================================================
  // 11. API
  // ========================================================================

  window.GFAudio = {
    precargar: precargar,
    montar: montar,
    desmontar: desmontar,
    trueno: trueno,
    chispa: chispa,
    bicho: bicho,
    musica: function (cual) {
      var st = escenaViva();
      return st ? musica(st.scene, cual) : false;
    },
    material: material,

    /**
     * ¿Puede este módulo hacerse cargo de la música de esta escena?
     *
     * Lo pregunta GameScene antes de poner la suya: si los WAV de los temas
     * no están (nadie ejecutó el generador, o no se subieron), la respuesta
     * es NO y la escena se queda con la música de siempre. Sin esto, un
     * archivo que falta se traduciría en partida sin música, y eso se nota
     * mucho más que un tema antiguo.
     */
    llevaLaMusica: function (scene) {
      var st = (scene && scene.__gfAudio) || escenaViva();
      if (!st) return false;
      var quiere = st.tipo === 'tienda' ? ['tienda'] : ['pradera', 'noche'];
      for (var i = 0; i < quiere.length; i++) {
        try {
          if (!st.scene.cache.audio.exists(PREFIJO + TEMAS[quiere[i]])) return false;
        } catch (e) { return false; }
      }
      return true;
    },

    /** Sube o baja TODO lo de este módulo sin tocar el panel. 0..2 */
    ganancia: function (v) {
      if (v === undefined) return MEZCLA;
      var k, f = tope(v, 0, 2) / (MEZCLA._base || 1);
      MEZCLA._base = tope(v, 0, 2);
      for (k in MEZCLA) {
        if (MEZCLA.hasOwnProperty(k) && k !== '_base' && typeof MEZCLA[k] === 'number') MEZCLA[k] *= f;
      }
      return MEZCLA;
    },

    estado: function () {
      var st = escenaViva();
      if (!st) return { montado: false };
      var b = {}, k;
      for (k in st.bucles) {
        if (st.bucles.hasOwnProperty(k)) b[k] = Math.round(st.bucles[k].actual * 100) / 100;
      }
      return {
        montado: true, tipo: st.tipo, tema: st.temaActual,
        ambiente: b, voces: vocesVivas(st),
        suelo: st.suelo || st.ultimoMaterial,
        tilesVistos: Object.keys(st.porTile).length
      };
    },

    /** Para mirar desde la consola por qué no se oye algo. */
    diagnostico: function () {
      var st = escenaViva();
      var faltan = [], lista = listaDe(st ? st.tipo : 'campo'), i;
      for (i = 0; i < lista.length; i++) {
        try {
          if (!st || !st.scene.cache.audio.exists(PREFIJO + lista[i])) faltan.push(lista[i] + '.wav');
        } catch (e) {}
      }
      return {
        montado: !!st,
        escena: st ? st.scene.scene.key : null,
        bloqueado: st ? !!st.scene.sound.locked : null,
        volumenEfectos: st ? volumenEfectos(st) : null,
        volumenMusica: st ? volumenMusica(st) : null,
        tema: st ? st.temaActual : null,
        clima: st ? leerClima(st) : null,
        oscuridad: st ? Math.round(oscuridad(st) * 100) / 100 : null,
        materialAqui: st ? material(st.scene, donde(st).x, donde(st).y) : null,
        tilesetLegible: st ? !st.sinLienzo : null,
        carga: st ? (st.cargaTerminada ? 'terminada'
                     : st.cargados + '/' + st.porCargarTotal) : null,
        archivosQueFaltan: faltan,
        ruta: RUTA
      };
    },

    /** Qué material ve en cada casilla de alrededor. Para afinar la mezcla. */
    mirarSuelo: function (radio) {
      var st = escenaViva();
      if (!st) return null;
      radio = radio || 2;
      var p = donde(st), out = [], tx, ty;
      for (ty = -radio; ty <= radio; ty++) {
        var fila = [];
        for (tx = -radio; tx <= radio; tx++) fila.push(material(st.scene, p.x + tx * 16, p.y + ty * 16));
        out.push(fila.join(' '));
      }
      return out;
    },

    /** Fuerza un material para todo el mapa. `null` para volver a mirarlo. */
    forzarSuelo: function (m) {
      var st = escenaViva();
      if (!st) return false;
      st.suelo = m || null;
      return true;
    },

    /** Suelta un sonido a mano, para probarlo. GFAudio.probar('rayo_1') */
    probar: function (nombre, op) {
      var st = escenaViva();
      if (!st) return false;
      return !!sonar(st, PREFIJO + nombre, Object.assign({ sinSitio: true, vol: 1 }, op || {}));
    },

    _interno: {
      TEMAS: TEMAS, AMBIENTES: AMBIENTES, SUELOS: SUELOS, VOCES: VOCES,
      VOZ_DE: VOZ_DE, MEZCLA: MEZCLA, PREFIJO: PREFIJO,
      clasificar: clasificar, mirarTile: mirarTile, listaDe: listaDe,
      mezclarAmbiente: mezclarAmbiente, leerClima: leerClima,
      oscuridad: oscuridad, temaQueToca: temaQueToca, sonar: sonar,
      CONTRASTE_JUNTA: CONTRASTE_JUNTA
    }
  };
})();
