/* ===========================================================================
 * CICLO DÍA / NOCHE
 *
 * QUIÉN MANDA
 *   La hora la da el backend (GET /api/world/time). El cliente NO la inventa
 *   ni la cuenta desde cero: pide la hora, la ancla a un cronómetro monótono
 *   (performance.now) y entre sincronizaciones la extrapola.
 *
 *   Se usa performance.now y no Date.now a propósito: performance.now cuenta
 *   milisegundos desde que se abrió la página y no lo mueve cambiar la hora
 *   del sistema operativo. Adelantar el reloj del PC no adelanta la noche.
 *
 * CUÁNDO SE SINCRONIZA
 *   - al cargar la página
 *   - cada 30 minutos
 *   - al entrar en GameScene y en tiendajuego
 *   - al volver a la pestaña, si la última sincronización ya tiene 30 minutos
 *     (dormir el portátil puede congelar el cronómetro monótono)
 *   Nada más. No hay sondeo por frame ni por segundo.
 *
 * QUÉ PINTA
 *   - el reloj del HUD, a la izquierda de la moneda de oro
 *   - la oscuridad de la noche sobre GameScene
 *   - la luz de los postes y la del propio personaje, como huecos recortados
 *     en esa oscuridad
 *
 * API PÚBLICA
 *   GFCiclo.sincronizar()            fuerza una sincronización (devuelve Promise)
 *   GFCiclo.estado()                 { esDia, fase, hora, minuto, horaTexto, ... }
 *   GFCiclo.montarEscena(scene, op)  activa la noche en una escena de Phaser
 *   GFCiclo.desmontarEscena(scene)   la quita (se llama sola en shutdown)
 *   GFCiclo.alCambiarFase(fn)        avisa cuando amanece o anochece
 * ======================================================================== */
(function () {
  'use strict';

  var SYNC_MS       = 30 * 60 * 1000;  // cada media hora, como pide el encargo
  var REINTENTO_MS  = 60 * 1000;       // si falla la petición
  var PROFUNDIDAD   = 9000;            // por encima del mundo, debajo del HUD DOM
  var COLOR_NOCHE   = 0x24365f;        // azul de noche con el que se multiplica
  var ALFA_NOCHE    = 0.76;            // oscuridad máxima
  /* LA FAROLA ALUMBRA MÁS; EL PERSONAJE, NO.

     Van por separado a propósito. La luz del personaje es una ayuda para no
     andar a ciegas, y si crece demasiado el mundo deja de tener noche: te
     llevas el día puesto encima. La de las farolas es lo que da forma al
     pueblo de noche, y esa sí se pidió más grande tres veces.

     560 -> 700 en la farola (+25 % de radio, +56 % de charco) y 180 -> 150 en
     el personaje, que es donde estaba antes de la subida anterior. */
  var RADIO_POSTE   = 700;             // en píxeles de mundo
  var RADIO_JUGADOR = 150;             // lo justo para cubrir al personaje

  /* SOBRANTE DE LA CAPA DE NOCHE.

     EL FALLO QUE ARREGLA: la capa medía EXACTAMENTE la pantalla. En cuanto la
     cámara se movía sin que se moviera la capa —la sacudida del trueno, que es
     una traslación de la propia cámara— asomaba el borde: una franja clara en
     el lado hacia el que temblaba, y se veía perfectamente el recuadro.

     Ahora la capa se hace más grande por los cuatro lados. Dentro de ella el
     (0,0) ya no es la esquina de la pantalla sino la del sobrante, así que las
     luces se pintan desplazadas ese mismo margen (ver recortarLuz).

     96 px cubre de sobra: la sacudida más fuerte es 0.006 · ancho · zoom, unos
     18 px con zoom 3 en una pantalla de 1024. */
  var MARGEN_CAPA   = 96;

  // ---------------------------------------------------------------- utilidades
  function log() {
    if (!window.GF_CICLO_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[ciclo]');
    console.log.apply(console, a);
  }

  function apiBase() {
    // Mismo criterio que gf-wallet-boot.js. Ojo con la cadena vacía: '' es
    // "mismo origen", que es válido, así que se comprueba el tipo y no si es
    // un valor verdadero.
    if (typeof window.serverBase === 'string')  return window.serverBase;
    if (typeof window.GF_API_BASE === 'string') return window.GF_API_BASE;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:3001';
    return 'https://api.grasslandforest.com';
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Cómo se coloca la capa de noche para que tape la pantalla con cualquier zoom.

     Va aparte para poder comprobarla sin navegador (ver test_zoom_noche.js).

     La capa se crea del tamaño de la pantalla y NO se redimensiona nunca: se
     adapta con escala. Es a propósito — rt.setSize() en Phaser 3.60+ cambia el
     tamaño de dibujo pero no la textura interna, así que al alejar el zoom la
     capa se quedaba corta y solo tapaba parte de la pantalla.

     Con scrollFactor 0 la cámara dibuja un punto en:
         pantalla = (p - centro) * zoom + centro
     Poniendo escala = 1/zoom y esquina = centro - mitad/zoom, el borde
     izquierdo cae en 0 y el derecho en el ancho de la pantalla, siempre. */
  function geometriaCapa(camAncho, camAlto, zoom, margen) {
    var z = zoom > 0 ? zoom : 1;
    var m = (margen === undefined) ? MARGEN_CAPA : margen;
    /* Con el sobrante, la esquina de la capa no cae en (0,0) de la pantalla
       sino en (-m,-m), sea cual sea el zoom:
           pantalla = (p - centro) * zoom + centro
           p = centro - (centro + m) / zoom   =>   pantalla = -m           */
    return {
      escala: 1 / z,
      x: camAncho / 2 - (camAncho / 2 + m) / z,
      y: camAlto / 2 - (camAlto / 2 + m) / z,
      margen: m,
      ancho: camAncho + m * 2,
      alto: camAlto + m * 2
    };
  }

  // ------------------------------------------------------------------- estado
  var ancla = null;   // { servidorMs, monotonicoMs, epocaMs, cicloMs, diaMs, nocheMs }
  var pidiendo = null;
  var oyentes = [];
  var faseAnterior = null;
  var timerSync = null;
  var timerHud = null;

  function hayHora() { return ancla !== null; }

  function ahoraMundo() {
    if (!ancla) return null;
    // El delta lo da el cronómetro monótono, no el reloj del sistema.
    return ancla.servidorMs + (performance.now() - ancla.monotonicoMs);
  }

  /* Misma cuenta que estadoDelMundo() en server2.js. Se repite aquí para poder
     extrapolar sin preguntar, pero los números (época, duraciones) siempre
     vienen del servidor: si allí se cambia la duración del día, aquí cambia
     sola en la siguiente sincronización. */
  function estado() {
    if (!ancla) return null;
    var ahora = ahoraMundo();
    var T = ancla.cicloMs, D = ancla.diaMs, N = ancla.nocheMs;
    var t = (ahora - ancla.epocaMs) % T;
    if (t < 0) t += T;

    var esDia = t < D;
    var minutos;
    if (esDia) {
      minutos = 360 + (t / D) * 720;
    } else {
      minutos = (1080 + ((t - D) / N) * 720) % 1440;
    }
    minutos = Math.floor(minutos) % 1440;
    var hora = Math.floor(minutos / 60);
    var minuto = minutos % 60;

    return {
      ahora: ahora,
      esDia: esDia,
      fase: esDia ? 'dia' : 'noche',
      hora: hora,
      minuto: minuto,
      horaTexto: ('0' + hora).slice(-2) + ':' + ('0' + minuto).slice(-2),
      minutosDelDia: minutos,
      progresoCiclo: t / T,
      msParaCambio: esDia ? (D - t) : (T - t)
    };
  }

  /* Oscuridad de 0 a 1 según la hora del juego.

     No salta de golpe en el instante del cambio de fase: hay dos horas de
     juego de transición a cada lado (una hora real, porque 1 h de juego son
     30 min reales), así que se ve anochecer y amanecer poco a poco.

       05:00 → 07:00   amanece   1 → 0
       07:00 → 17:00   día       0
       17:00 → 19:00   anochece  0 → 1
       19:00 → 05:00   noche     1                                           */
  function oscuridad(est) {
    if (!est) return 0;
    var t = est.hora + est.minuto / 60;
    if (t >= 7 && t < 17) return 0;
    if (t >= 5 && t < 7)  return 1 - (t - 5) / 2;
    if (t >= 17 && t < 19) return (t - 17) / 2;
    return 1;
  }

  // ------------------------------------------------------------ sincronizar
  function sincronizar(motivo) {
    if (pidiendo) return pidiendo;
    var url = apiBase().replace(/\/$/, '') + '/api/world/time';
    var t0 = performance.now();

    pidiendo = fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || d.ok !== true || typeof d.ahora !== 'number') {
          throw new Error('respuesta inesperada');
        }
        var t1 = performance.now();
        // La respuesta tardó (t1-t0). Se supone que la hora del servidor es de
        // la mitad del viaje, que es la estimación estándar y deja el error en
        // la mitad de la latencia.
        ancla = {
          servidorMs: d.ahora + (t1 - t0) / 2,
          monotonicoMs: t1,
          epocaMs: d.epocaMs,
          cicloMs: d.cicloMs,
          diaMs: d.diaMs,
          nocheMs: d.nocheMs,
          sincronizadoEn: t1
        };
        log('sincronizado (' + (motivo || 'periódico') + ')', d.horaTexto, d.fase,
            'latencia', Math.round(t1 - t0) + 'ms');
        pintarHud();
        avisarFase();
        pidiendo = null;
        return estado();
      })
      .catch(function (e) {
        pidiendo = null;
        log('no se pudo sincronizar:', e && e.message);
        // Si nunca hubo hora, se reintenta pronto; si ya había, se sigue
        // extrapolando con la que hay y se espera al siguiente ciclo normal.
        if (!ancla) setTimeout(function () { sincronizar('reintento'); }, REINTENTO_MS);
        return null;
      });

    return pidiendo;
  }

  /* Sincroniza solo si la última ya está vieja. Es lo que llaman las escenas:
     entrar y salir de la tienda diez veces seguidas no dispara diez peticiones. */
  function sincronizarSiHaceFalta(motivo, maxEdadMs) {
    var max = typeof maxEdadMs === 'number' ? maxEdadMs : SYNC_MS;
    if (!ancla) return sincronizar(motivo);
    if (performance.now() - ancla.sincronizadoEn >= max) return sincronizar(motivo);
    log('sincronización omitida (' + motivo + '), la hora aún es fresca');
    return Promise.resolve(estado());
  }

  function alCambiarFase(fn) {
    if (typeof fn === 'function') oyentes.push(fn);
  }

  function avisarFase() {
    var est = estado();
    if (!est) return;
    if (faseAnterior === est.fase) return;
    faseAnterior = est.fase;
    for (var i = 0; i < oyentes.length; i++) {
      try { oyentes[i](est); } catch (e) { console.warn('[ciclo] oyente falló', e); }
    }
  }

  // ------------------------------------------------------------- reloj del HUD
  var elHora = null, elIcono = null, elCaja = null;

  /* El reloj se crea aquí si el HTML no lo trae.

     El marcado está en index.html, que es donde le corresponde estar, pero el
     módulo no se apoya en ello: si una versión del index se queda atrás en un
     despliegue, el reloj aparece igual. Si el marcado sí está, se reutiliza y
     no se duplica nada. */
  function asegurarHud() {
    var caja = document.getElementById('hud-reloj');
    if (caja && caja.isConnected) return caja;

    var contenedor = document.querySelector('.corner-box');
    if (!contenedor) return null;          // el HUD aún no existe

    caja = document.createElement('div');
    caja.className = 'clock-stack';
    caja.id = 'hud-reloj';
    caja.title = 'Hora del mundo';

    var icono = document.createElement('span');
    icono.className = 'clock-icon';
    icono.id = 'hud-reloj-icono';
    icono.textContent = '☀';

    var hora = document.createElement('span');
    hora.className = 'clock-time';
    hora.id = 'hud-reloj-hora';
    hora.textContent = '--:--';

    caja.appendChild(icono);
    caja.appendChild(hora);
    // primero del contenedor = a la izquierda de la moneda de oro
    contenedor.insertBefore(caja, contenedor.firstChild);
    asegurarEstilo();
    log('reloj creado por el módulo (el HTML no lo traía)');
    return caja;
  }

  /* Estilo de respaldo, por si styless.css tampoco trae el del reloj. Va con
     la misma especificidad, así que si la hoja del juego sí lo tiene, gana la
     suya por ser posterior; y si no, al menos el reloj se ve bien. */
  function asegurarEstilo() {
    if (document.getElementById('gf-ciclo-estilo')) return;
    var st = document.createElement('style');
    st.id = 'gf-ciclo-estilo';
    st.textContent =
      '.clock-stack{display:flex;flex-direction:column;align-items:center;gap:2px;' +
      'min-width:42px;padding:2px 6px 2px 2px;' +
      'border-right:1px solid rgba(255,255,255,.12);user-select:none}' +
      '.clock-stack .clock-icon{font-size:15px;line-height:1;color:#ffd97a;' +
      'text-shadow:0 0 6px rgba(255,200,90,.55);transition:color .6s ease}' +
      '.clock-stack .clock-time{color:#ffe9a8;font-size:12px;font-weight:700;' +
      "font-family:'Segoe UI',sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);" +
      'white-space:nowrap;font-variant-numeric:tabular-nums;transition:color .6s ease}' +
      '.clock-stack.es-noche .clock-icon{color:#cfe0ff;' +
      'text-shadow:0 0 6px rgba(150,190,255,.55)}' +
      '.clock-stack.es-noche .clock-time{color:#cfe0ff}';
    document.head.appendChild(st);
  }

  function pintarHud() {
    if (!elCaja || !elCaja.isConnected) {
      elCaja  = asegurarHud();
      elHora  = document.getElementById('hud-reloj-hora');
      elIcono = document.getElementById('hud-reloj-icono');
    }
    if (!elCaja || !elHora) return;
    var est = estado();
    if (!est) {
      elHora.textContent = '--:--';
      return;
    }
    elHora.textContent = est.horaTexto;
    if (elIcono) elIcono.textContent = est.esDia ? '☀' : '☾';
    elCaja.classList.toggle('es-noche', !est.esDia);
    elCaja.setAttribute('title',
      est.esDia ? 'Anochece en ' + Math.round(est.msParaCambio / 60000) + ' min'
                : 'Amanece en '  + Math.round(est.msParaCambio / 60000) + ' min');
  }

  // ============================================================================
  // LA NOCHE EN LA ESCENA
  //
  // Se pinta una capa de oscuridad del tamaño de la cámara y se le RECORTAN
  // los huecos de luz. No son manchas claras encima: es la propia oscuridad la
  // que se borra donde hay una lámpara, que es lo que hace que se vea como luz
  // y no como una pegatina.
  // ============================================================================
  function texturaLuz(scene, clave, radio) {
    if (scene.textures.exists(clave)) return;
    var d = radio * 2;
    var canvas = scene.textures.createCanvas(clave, d, d);
    var ctx = canvas.getContext();
    var g = ctx.createRadialGradient(radio, radio, 0, radio, radio, radio);
    // El centro borra del todo y el borde no borra nada: así la luz se difumina
    // en vez de acabar en un círculo recortado.
    // Núcleo iluminado más ancho y caída más tardía: la luz no solo llega más
    // lejos, sino que ALUMBRA más dentro de su radio. Antes empezaba a apagarse
    // al 55% y el borde del charco quedaba casi tan oscuro como la noche.
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.74, 'rgba(255,255,255,1)');
    g.addColorStop(0.90, 'rgba(255,255,255,0.82)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d, d);
    canvas.refresh();
  }

  function montarEscena(scene, opciones) {
    if (!scene || !scene.add || !scene.cameras) return null;
    if (scene.__gfCiclo) return scene.__gfCiclo;
    opciones = opciones || {};

    var cam = scene.cameras.main;
    var st = {
      scene: scene,
      rt: null,
      pincel: null,
      postes: [],
      resplandores: [],
      jugador: null,
      encendidos: false
    };

    try {
      texturaLuz(scene, 'gf_luz_poste', RADIO_POSTE);
      texturaLuz(scene, 'gf_luz_jugador', RADIO_JUGADOR);

      // Del tamaño de la PANTALLA y para siempre: el zoom se resuelve con
      // escala, no redimensionando (ver geometriaCapa).
      st.anchoCam = cam.width;
      st.altoCam = cam.height;
      // Más grande que la pantalla: ver MARGEN_CAPA.
      st.rt = scene.add.renderTexture(0, 0,
                                      cam.width + MARGEN_CAPA * 2,
                                      cam.height + MARGEN_CAPA * 2)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(PROFUNDIDAD)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      st.rt.setVisible(false);

      // Pincel reutilizable: un solo objeto que se recoloca y se reescala para
      // cada luz, en vez de crear uno por lámpara y por frame.
      st.pincel = scene.make.image({ key: 'gf_luz_poste', add: false })
        .setOrigin(0.5, 0.5);
    } catch (e) {
      console.warn('[ciclo] no se pudo crear la capa de noche:', e);
      return null;
    }

    st.postes = recogerPostes(scene, opciones.postes);
    st.jugador = opciones.jugador || scene.player || null;
    crearResplandores(st);

    scene.__gfCiclo = st;

    st.onUpdate = function () { dibujarNoche(st); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', function () { desmontarEscena(scene); });
    scene.events.once('destroy', function () { desmontarEscena(scene); });

    log('noche montada en', scene.scene && scene.scene.key,
        '·', st.postes.length, 'postes');
    return st;
  }

  function recogerPostes(scene, lista) {
    if (Array.isArray(lista) && lista.length) return lista.filter(Boolean);
    // Los postes los crea createImagesFromObjectLayer con targetProp post_1..N,
    // así que se recogen por nombre. Se mira bastante más allá de los que hay
    // hoy para que añadir postes al mapa no obligue a tocar esto.
    var out = [];
    for (var i = 1; i <= 64; i++) {
      var p = scene['post_' + i];
      if (p && p.setTexture) out.push(p);
    }
    return out;
  }

  /* Los faroles NO se encienden cambiándoles la textura.
     En Game/Objetos hay un 'poste encendido.png', pero no es la versión
     encendida de 'poste.png': es otro objeto distinto (un poste de madera de
     dos brazos, 63x96 frente a 20x96). Cambiarle la textura al farol lo
     convertiría en otro mueble y además lo descolocaría.
     Lo que se hace es encender EL farol que ya está: un resplandor cálido
     sobre el cristal, más el hueco de luz que se recorta en la oscuridad. */
  /* Donde esta el cristal del farol, en coordenadas de mundo.

     OJO: los postes se crean con setOrigin(0, 1) — esquina inferior
     izquierda —, asi que p.x NO es el centro y p.y NO es el medio: son el
     borde izquierdo y la base. Usar getTopCenter() evita depender de eso.
     Esta funcion la usan el resplandor del cristal Y el charco de luz, para
     que no puedan descuadrarse otra vez. */
  function puntoLampara(p) {
    var alto = p.displayHeight || p.height || 96;
    var tc = p.getTopCenter ? p.getTopCenter() : null;
    var cx = tc ? tc.x : p.x + (p.displayWidth || p.width || 20) / 2;
    var arriba = tc ? tc.y : p.y - alto;
    return { x: cx, y: arriba + alto * 0.19 };
  }

  function crearResplandores(st) {
    var scene = st.scene;
    if (!scene.textures.exists('gf_resplandor')) {
      var r = 26, d = r * 2;
      var canvas = scene.textures.createCanvas('gf_resplandor', d, d);
      var ctx = canvas.getContext();
      var g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0.00, 'rgba(255,236,170,1)');
      g.addColorStop(0.35, 'rgba(255,214,120,0.55)');
      g.addColorStop(1.00, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, d, d);
      canvas.refresh();
    }
    for (var i = 0; i < st.postes.length; i++) {
      var p = st.postes[i];
      if (!p) continue;
      var pt = puntoLampara(p);
      var res = scene.add.image(pt.x, pt.y, 'gf_resplandor')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth((p.depth || 0) + 1)
        .setAlpha(0)
        .setScale(3.3);          // crece con RADIO_POSTE, si no queda suelto
      st.resplandores.push(res);
    }
  }

  function encenderPostes(st, intensidad) {
    // intensidad 0..1; el parpadeo es leve y lento, lo justo para que no
    // parezca una calcomanía pegada.
    var parp = 1;
    if (intensidad > 0) {
      parp = 0.93 + 0.07 * Math.sin(st.scene.time.now / 320);
    }
    for (var i = 0; i < st.resplandores.length; i++) {
      var res = st.resplandores[i];
      if (res && res.active) res.setAlpha(clamp(intensidad * parp, 0, 1) * 0.85);
    }
    st.encendidos = intensidad > 0.05;
  }

  function dibujarNoche(st) {
    var est = estado();
    var o = oscuridad(est);
    var scene = st.scene;
    var cam = scene.cameras.main;
    if (!cam || !st.rt) return;

    // Los faroles se encienden con la oscuridad, no de golpe: al atardecer van
    // subiendo igual que baja la luz. Se enciende un poco antes de que la
    // oscuridad llegue al máximo, que es como se encienden de verdad.
    encenderPostes(st, clamp(o * 1.35, 0, 1));

    if (o <= 0.01) {
      if (st.rt.visible) st.rt.setVisible(false);
      return;
    }

    /* OJO CON EL ZOOM.
       setScrollFactor(0) hace que la capa no se desplace con la cámara, pero
       NO la libra del zoom: con el zoom 2 que usa el juego, una capa del
       tamaño de la pantalla se dibujaría al doble y solo taparía un cuarto.
       Por eso la capa se hace del tamaño del área de mundo que se ve
       (worldView, que ya es pantalla/zoom) y se centra: al aplicarle el zoom
       vuelve a medir exactamente la pantalla, sea cual sea el zoom.
       De paso, dentro de la capa las coordenadas son las del mundo menos la
       esquina de la vista, así que las luces se colocan sin más cuentas. */
    var vista = cam.worldView;
    if (!vista || vista.width <= 0) return;

    // Si cambia el tamaño de la ventana hay que rehacer la capa: eso sí es un
    // cambio de textura de verdad, pero pasa una vez al redimensionar, no por
    // frame como pasaba con el zoom.
    if (st.anchoCam !== cam.width || st.altoCam !== cam.height) {
      if (!rehacerCapa(st, cam)) return;
    }

    var z = cam.zoom > 0 ? cam.zoom : 1;
    var geo = geometriaCapa(cam.width, cam.height, z);
    st.rt.setScale(geo.escala);
    st.rt.setPosition(geo.x, geo.y);
    st.margen = geo.margen;

    if (!st.rt.visible) st.rt.setVisible(true);

    st.rt.clear();
    st.rt.fill(COLOR_NOCHE, ALFA_NOCHE * o);

    // Cuanto más oscuro, más se nota la luz. Al atardecer las lámparas casi no
    // recortan nada, que es como se ve de verdad.
    var fuerza = clamp(o, 0, 1);

    if (st.jugador && st.jugador.active) {
      // Centrada en el sprite (getCenter no depende del origen) y subida un
      // poco: el personaje se lee mejor con la luz a la altura del pecho.
      var c = st.jugador.getCenter ? st.jugador.getCenter()
                                   : { x: st.jugador.x, y: st.jugador.y };
      recortarLuz(st, c.x, c.y - 6, RADIO_JUGADOR,
                  vista, z, 0.96 * fuerza, 'gf_luz_jugador');
    }

    if (!st.encendidos) return;

    var margen = RADIO_POSTE * 1.2;
    for (var i = 0; i < st.postes.length; i++) {
      var p = st.postes[i];
      if (!p || !p.active) continue;
      // Solo las lámparas que se ven. En un mapa grande esto evita recortar
      // sesenta luces de las que cincuenta caen fuera de la pantalla.
      if (p.x < vista.x - margen || p.x > vista.right + margen ||
          p.y < vista.y - margen || p.y > vista.bottom + margen) continue;
      var pt = puntoLampara(p);
      recortarLuz(st, pt.x, pt.y, RADIO_POSTE, vista, z, fuerza, 'gf_luz_poste');
    }
  }

  function recortarLuz(st, wx, wy, radio, vista, zoom, alfa, clave) {
    /* La capa mide lo que la pantalla, así que dentro de ella se trabaja en
       coordenadas de PANTALLA: el punto del mundo menos la esquina de la vista,
       por el zoom. El radio va por el zoom por lo mismo — al alejarse se ve más
       terreno, así que la farola ocupa menos pantalla pero sigue alumbrando los
       mismos metros de suelo. */
    var pincel = st.pincel;
    var m = st.margen || 0;
    if (pincel.texture.key !== clave) pincel.setTexture(clave);
    // + margen: dentro de la capa el origen es la esquina del SOBRANTE, no la
    // de la pantalla.
    pincel.setPosition((wx - vista.x) * zoom + m, (wy - vista.y) * zoom + m);
    pincel.setScale((radio * 2 * zoom) / pincel.width);
    pincel.setAlpha(alfa);
    st.rt.erase(pincel);
  }

  /* Rehace la capa cuando cambia el tamaño de la ventana. */
  function rehacerCapa(st, cam) {
    try {
      if (st.rt && st.rt.destroy) st.rt.destroy();
      st.rt = st.scene.add.renderTexture(0, 0,
                                         cam.width + MARGEN_CAPA * 2,
                                         cam.height + MARGEN_CAPA * 2)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(PROFUNDIDAD)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      st.anchoCam = cam.width;
      st.altoCam = cam.height;
      return true;
    } catch (e) {
      console.warn('[ciclo] no se pudo rehacer la capa de noche:', e);
      st.rt = null;
      return false;
    }
  }

  function desmontarEscena(scene) {
    var st = scene && scene.__gfCiclo;
    if (!st) return;
    try {
      if (st.onUpdate) scene.events.off('update', st.onUpdate);
      if (st.rt && st.rt.destroy) st.rt.destroy();
      if (st.pincel && st.pincel.destroy) st.pincel.destroy();
      for (var i = 0; i < st.resplandores.length; i++) {
        if (st.resplandores[i] && st.resplandores[i].destroy) st.resplandores[i].destroy();
      }
    } catch (e) { /* la escena ya se estaba destruyendo */ }
    st.rt = null; st.pincel = null; st.postes = []; st.resplandores = [];
    scene.__gfCiclo = null;
    log('noche desmontada de', scene.scene && scene.scene.key);
  }

  // --------------------------------------------------------------- arranque
  function arrancar() {
    sincronizar('arranque');

    if (timerSync) clearInterval(timerSync);
    timerSync = setInterval(function () { sincronizar('periódico'); }, SYNC_MS);

    // El reloj del HUD se repinta cada segundo: es solo escribir un texto, y
    // un minuto de juego dura 30 segundos reales, así que no hace falta más.
    if (timerHud) clearInterval(timerHud);
    timerHud = setInterval(function () { pintarHud(); avisarFase(); }, 1000);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      // Dormir el equipo puede congelar el cronómetro monótono; al volver se
      // comprueba, pero solo se pide hora si la que hay ya está vieja.
      sincronizarSiHaceFalta('vuelta a la pestaña');
    });
  }

  window.GFCiclo = {
    sincronizar: sincronizar,
    sincronizarSiHaceFalta: sincronizarSiHaceFalta,
    estado: estado,
    hayHora: hayHora,
    oscuridad: function () { return oscuridad(estado()); },
    montarEscena: montarEscena,
    desmontarEscena: desmontarEscena,
    alCambiarFase: alCambiarFase,
    pintarHud: pintarHud,
    SYNC_MS: SYNC_MS,
    _geometriaCapa: geometriaCapa   // expuesta solo para las pruebas
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
