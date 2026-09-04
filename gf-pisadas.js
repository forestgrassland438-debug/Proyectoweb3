/* ===========================================================================
 * PISADAS: LA HUELLA QUE DEJA QUIEN ANDA
 *
 * QUÉ HACE
 *   Cada dos zancadas suelta bajo los pies una nubecilla de polvo y una marca
 *   en el suelo, que se quedan donde se dieron y se van solas. Vale para el
 *   jugador, para su mascota y para los demás jugadores del mapa.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 *   Un personaje que se desliza por un césped intacto no parece que ande:
 *   parece que patina. Es el problema clásico de los juegos cenitales — el
 *   pie no toca nada. La huella es la prueba de que has pasado por ahí, y con
 *   dos círculos por zancada el andar se lee entero.
 *
 * VA EN EL MUNDO, NO EN LA PANTALLA
 *   Una huella es una marca EN EL SUELO. Si fuera del lienzo de cámara se
 *   arrastraría contigo, que es exactamente el fallo que ya se corrigió en las
 *   salpicaduras de lluvia. Aquí nace en el mundo y ahí se queda.
 *
 * SE ADAPTA AL TIEMPO
 *   Lo que levanta un pie depende de lo que pise: polvo en seco, una corona de
 *   agua si el suelo está mojado, y nieve pisada —que dura mucho más— si está
 *   nevando. Se lo pregunta a gf-clima; sin ese módulo, siempre polvo.
 *
 * NO CUESTA TEXTURAS
 *   Las tres imágenes se dibujan con canvas al arrancar (una mota de polvo,
 *   una huella y un anillo de agua). No hay PNG nuevos que subir.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFPisadas && window.GFPisadas.montar(this);
 *
 * API
 *   GFPisadas.montar(scene) / desmontar(scene)
 *   GFPisadas.pisar(scene, x, y, opciones)   suelta una a mano
 *   GFPisadas.estado()
 * ======================================================================== */
(function () {
  'use strict';

  /* Cuánto hay que andar para dejar la siguiente huella. Es la ZANCADA, y por
     eso va en píxeles de mundo y no en tiempo: si fuera por tiempo, andar
     despacio dejaría las huellas más juntas, que es justo al revés de como
     funciona un pie. */
  var ZANCADA      = 26;
  /* Por debajo de esto se considera que está quieto. Un personaje parado se
     mueve un pelo por el redondeo de la física, y sin este mínimo soltaba
     polvo estando de pie. */
  var MOV_MINIMO   = 0.35;

  var N_POLVO      = 26;      // nubecillas a la vez
  var N_HUELLAS    = 22;      // marcas en el suelo a la vez

  var POLVO_MS     = [520, 900];
  var HUELLA_MS    = 2600;    // lo que tarda en borrarse una marca en seco
  var HUELLA_NIEVE = 9000;    // en la nieve se queda MUCHO más

  /* A ras de suelo. Los charcos de gf-clima van en 1 y las salpicaduras en 2;
     las huellas van justo debajo de todo eso, que es donde tienen que estar:
     el agua se posa ENCIMA de la tierra pisada. */
  var PROF_HUELLA  = 1;
  var PROF_POLVO   = 3;       // el polvo está en el aire, sobre la marca

  function log() {
    if (!window.GF_PISADAS_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[pisadas]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }

  // ── LAS TRES TEXTURAS, DIBUJADAS AL VUELO ───────────────────────────────

  /** Mota de polvo: un disco blando que se puede teñir de cualquier color. */
  function texturaPolvo(scene) {
    var clave = 'gfp_polvo';
    if (scene.textures.exists(clave)) return clave;
    var T = 32;
    try {
      var c = scene.textures.createCanvas(clave, T, T);
      var ctx = c.getContext();
      var g = ctx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
      g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.80, 'rgba(255,255,255,0.10)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, T, T);
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  /**
   * La marca del pie.
   *
   * No es una huella de bota dibujada: es una MANCHA alargada y difuminada. A
   * la escala a la que se ve el juego —una huella mide ocho píxeles— el dibujo
   * de una suela no se distingue, solo hace ruido. Lo que sí se lee es que el
   * suelo está más oscuro justo donde has pisado.
   */
  function texturaHuella(scene) {
    var clave = 'gfp_huella';
    if (scene.textures.exists(clave)) return clave;
    var W = 24, H = 32;
    try {
      var c = scene.textures.createCanvas(clave, W, H);
      var ctx = c.getContext();
      var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0.00, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1, 1.25);                 // un pie es más largo que ancho
      ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  /** Anillo de agua: lo que salta al pisar un charco. */
  function texturaAnillo(scene) {
    var clave = 'gfp_anillo';
    if (scene.textures.exists(clave)) return clave;
    var T = 40;
    try {
      var c = scene.textures.createCanvas(clave, T, T);
      var ctx = c.getContext();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(T / 2, T / 2, T / 2 - 3, (T / 2 - 3) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(T / 2, T / 2, T / 2 - 8, (T / 2 - 8) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  // ── QUÉ SE LEVANTA AL PISAR ─────────────────────────────────────────────

  /**
   * El tiempo manda en lo que salta del suelo.
   *   'agua'  llueve o acaba de llover → corona de agua, poco polvo
   *   'nieve' nieva → polvo blanco y huellas que aguantan
   *   'seco'  lo demás → polvo de tierra
   */
  function terreno() {
    var e = null;
    try { if (window.GFClima && window.GFClima.estado) e = window.GFClima.estado(); } catch (x) {}
    if (!e || !e.activo) return 'seco';
    if (e.nieve) return 'nieve';
    if (e.lluvia) return 'agua';
    return 'seco';
  }

  /* Los tonos, y cuánto se ve cada cosa.

     LA NUBE DE POLVO ES LA QUE CUENTA, no la marca. Una huella pintada sobre
     hierba, de siete píxeles y al 26 % de opacidad, no la ve nadie: se probó y
     en pantalla no había nada. Lo que de verdad se lee como "acabo de dar un
     paso" es el polvillo que salta, así que ése va con fuerza y la marca queda
     de acompañamiento.

     En la NIEVE es al revés: ahí la huella es lo importante —se queda hundida
     y dura diez veces más— y el polvo es solo el copo que levantas al pisar. */
  var TONOS = {
    seco:  { polvo: 0xe8dcbc, huella: 0x3f3220, alfaPolvo: 0.62, alfaHuella: 0.34 },
    nieve: { polvo: 0xffffff, huella: 0x8fa9c6, alfaPolvo: 0.85, alfaHuella: 0.58 },
    agua:  { polvo: 0xdcecf7, huella: 0x27384b, alfaPolvo: 0.70, alfaHuella: 0.40 }
  };

  // ── LOS DOS ALMACENES ───────────────────────────────────────────────────

  function nuevaMota(st, clave) {
    var s = st.scene.add.image(0, 0, clave);
    s.setDepth(PROF_POLVO).setAlpha(0).setVisible(false);
    return { spr: s, hasta: 0, nace: 0, x: 0, y: 0, vx: 0, vy: 0, tam: 1, anillo: false };
  }

  function nuevaHuella(st, clave) {
    var s = st.scene.add.image(0, 0, clave);
    s.setDepth(PROF_HUELLA).setAlpha(0).setVisible(false);
    return { spr: s, hasta: 0, nace: 0, dura: HUELLA_MS };
  }

  function libre(lista, ahora) {
    var masVieja = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].hasta <= ahora) return lista[i];
      if (!masVieja || lista[i].hasta < masVieja.hasta) masVieja = lista[i];
    }
    return masVieja;   // todas ocupadas: se recicla la que antes acabe
  }

  /**
   * Suelta una pisada en (x, y) del MUNDO.
   *
   * `op.rumbo`  hacia dónde mira quien pisa, en radianes (para inclinar la
   *             marca y echar el polvo hacia atrás).
   * `op.fuerza` 0..1, cuánto pesa la zancada: un perro levanta menos que una
   *             persona, y correr levanta más que andar.
   */
  function pisar(scene, x, y, op) {
    var st = scene && scene.__gfPisadas;
    if (!st) return false;
    op = op || {};
    var ahora = scene.time.now;
    var T = TONOS[st.terreno] || TONOS.seco;
    var fuerza = Math.max(0.25, Math.min(1.6, op.fuerza == null ? 1 : op.fuerza));

    // ── la marca en el suelo ──
    if (st.huellas.length) {
      var h = libre(st.huellas, ahora);
      h.spr.setTexture(st.claveHuella);
      h.spr.setPosition(x + az(-1.5, 1.5), y + az(-1, 1));
      h.spr.setScale(az(0.34, 0.46) * fuerza, az(0.28, 0.38) * fuerza);
      h.spr.setRotation((op.rumbo || 0) + az(-0.18, 0.18));
      h.spr.setTint(T.huella);
      h.spr.setVisible(true);
      h.nace = ahora;
      h.dura = (st.terreno === 'nieve' ? HUELLA_NIEVE : HUELLA_MS) * az(0.8, 1.2);
      h.hasta = ahora + h.dura;
      h.alfa = T.alfaHuella * fuerza;
    }

    // ── el polvo (o el agua) ──
    var cuantas = st.terreno === 'agua' ? 1 : (Math.random() < 0.45 ? 2 : 1);
    for (var k = 0; k < cuantas && st.motas.length; k++) {
      var m = libre(st.motas, ahora);
      var esAnillo = (st.terreno === 'agua' && k === 0);
      m.anillo = esAnillo;
      m.spr.setTexture(esAnillo ? st.claveAnillo : st.clavePolvo);
      m.x = x + az(-3, 3);
      m.y = y + az(-2, 2);
      /* El polvo sale hacia ATRÁS del que anda, no hacia los lados al azar: es
         lo que hace que se lea como impulso y no como humo. */
      var atras = (op.rumbo || 0) + Math.PI + az(-0.5, 0.5);
      m.vx = esAnillo ? 0 : Math.cos(atras) * az(6, 20) * fuerza;
      m.vy = esAnillo ? 0 : Math.sin(atras) * az(3, 10) * fuerza - az(2, 8);
      m.tam = esAnillo ? az(0.26, 0.38) : az(0.40, 0.78) * fuerza;
      m.spr.setScale(m.tam);
      m.spr.setTint(T.polvo);
      m.spr.setVisible(true);
      m.nace = ahora;
      m.hasta = ahora + az(POLVO_MS[0], POLVO_MS[1]) * (esAnillo ? 0.7 : 1);
      m.alfa = T.alfaPolvo * fuerza;
    }
    return true;
  }

  // ── SEGUIR A LOS QUE ANDAN ──────────────────────────────────────────────

  /**
   * Los pies de un sprite: el borde de abajo del DIBUJO, no de la caja.
   * gf-profundidad ya sabe medirlo (los PNG traen transparencia de sobra
   * abajo); si no está, se cae al borde de la caja, que es lo que hacía el
   * juego antes.
   */
  function piesDe(scene, spr) {
    try {
      if (window.GFProfundidad && window.GFProfundidad.piesDe) {
        return window.GFProfundidad.piesDe(scene, spr);
      }
    } catch (e) {}
    var oy = (spr.originY === undefined) ? 0.5 : spr.originY;
    return spr.y + (spr.displayHeight || 0) * (1 - oy);
  }

  /** Da de alta a alguien a quien seguir. */
  function seguir(st, id, spr, fuerza) {
    var v = st.vigilados[id];
    if (!v) {
      v = st.vigilados[id] = { spr: spr, x: spr.x, y: spr.y, recorrido: 0,
                               fuerza: fuerza, rumbo: 0 };
    }
    v.spr = spr;
    return v;
  }

  function revisar(st, ahora, delta) {
    var scene = st.scene;

    // ── quién anda por aquí ──
    if (scene.player) seguir(st, '@yo', scene.player, 1);
    if (scene.dog && scene.dog.sprite && scene.dog.sprite.visible) {
      // El perro pesa menos: levanta menos polvo y deja marca más pequeña.
      seguir(st, '@perro', scene.dog.sprite, 0.55);
    } else {
      delete st.vigilados['@perro'];
    }
    if (scene.otherPlayers) {
      for (var id in scene.otherPlayers) {
        if (!Object.prototype.hasOwnProperty.call(scene.otherPlayers, id)) continue;
        var o = scene.otherPlayers[id];
        if (o && o.sprite && o.sprite.visible) seguir(st, 'r' + id, o.sprite, 0.9);
      }
    }

    // ── ¿han andado lo bastante? ──
    var vista = scene.cameras && scene.cameras.main && scene.cameras.main.worldView;
    for (var k in st.vigilados) {
      if (!Object.prototype.hasOwnProperty.call(st.vigilados, k)) continue;
      var v = st.vigilados[k];
      var spr = v.spr;

      /* Un sprite que ya no está (jugador que se fue, mascota retirada) se
         suelta: si no, el mapa se llenaría de fantasmas a los que seguir. */
      if (!spr || spr.active === false || !spr.scene) { delete st.vigilados[k]; continue; }

      var dx = spr.x - v.x, dy = spr.y - v.y;
      v.x = spr.x; v.y = spr.y;
      var d = Math.sqrt(dx * dx + dy * dy);

      /* UN SALTO NO ES UNA ZANCADA. Al entrar al mapa, al volver de la tienda
         o al teletransportarse, el sprite aparece de golpe a cien píxeles. Sin
         este tope se dibujaba una pisada en el sitio nuevo como si hubiera
         llegado andando. */
      if (d > 90) { v.recorrido = 0; continue; }
      if (d < MOV_MINIMO) continue;

      v.rumbo = Math.atan2(dy, dx);
      v.recorrido += d;
      if (v.recorrido < ZANCADA) continue;
      v.recorrido = 0;

      // Fuera de pantalla no se pinta nada: nadie lo va a ver.
      if (vista && (spr.x < vista.x - 60 || spr.x > vista.right + 60 ||
                    spr.y < vista.y - 60 || spr.y > vista.bottom + 60)) continue;

      /* Correr levanta más polvo que andar. La velocidad sale de lo que se ha
         movido en este frame, que es el dato honesto: no depende de qué tecla
         se pulse ni de si el que anda es un jugador remoto. */
      var vel = d / Math.max(0.001, delta / 1000);      // px/s
      var brio = Math.max(0.6, Math.min(1.5, vel / 130));
      pisar(scene, spr.x, piesDe(scene, spr) - 1,
            { rumbo: v.rumbo, fuerza: v.fuerza * brio });
    }
  }

  function mover(st, ahora, delta) {
    var dt = Math.min(delta, 100) / 1000;
    var i;

    for (i = 0; i < st.motas.length; i++) {
      var m = st.motas[i];
      if (m.hasta <= ahora) { if (m.spr.visible) m.spr.setVisible(false); continue; }
      var t = (ahora - m.nace) / Math.max(1, m.hasta - m.nace);   // 0..1
      if (m.anillo) {
        // El anillo de agua solo se abre y se apaga.
        m.spr.setScale(m.tam * (1 + t * 2.2));
        m.spr.setAlpha(m.alfa * (1 - t) * (1 - t));
      } else {
        // El polvo sube, se frena y se hincha mientras se deshace.
        m.vx *= (1 - 2.2 * dt);
        m.vy = m.vy * (1 - 2.0 * dt) - 6 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.spr.setPosition(m.x, m.y);
        m.spr.setScale(m.tam * (1 + t * 1.1));
        m.spr.setAlpha(m.alfa * (1 - t) * (1 - t * 0.4));
      }
    }

    for (i = 0; i < st.huellas.length; i++) {
      var h = st.huellas[i];
      if (h.hasta <= ahora) { if (h.spr.visible) h.spr.setVisible(false); continue; }
      var q = (ahora - h.nace) / h.dura;
      /* Se queda nítida un buen rato y solo se borra al final: una huella no
         se desvanece desde el primer segundo, se BORRA cuando el suelo la
         recupera. Por eso la curva es plana hasta el 55 %. */
      var f = q < 0.55 ? 1 : (1 - (q - 0.55) / 0.45);
      h.spr.setAlpha(h.alfa * Math.max(0, f));
    }
  }

  // ── MONTAJE ─────────────────────────────────────────────────────────────

  function calidad() {
    try {
      if (window.GFGraphics && window.GFGraphics.get) {
        return window.GFGraphics.get().calidad || 'alta';
      }
    } catch (e) {}
    return 'alta';
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add || !scene.add.image) return null;
    if (scene.__gfPisadas) return scene.__gfPisadas;

    /* En calidad baja no hay huellas. Son cincuenta sprites más en el mapa y
       lo primero que sobra cuando el teléfono va justo. */
    if (calidad() === 'baja' && !opciones.forzar) {
      log('calidad baja: sin pisadas');
      return null;
    }

    var clavePolvo  = texturaPolvo(scene);
    var claveHuella = texturaHuella(scene);
    var claveAnillo = texturaAnillo(scene);
    if (!clavePolvo || !claveHuella) {
      console.warn('[pisadas] no se pudieron crear las texturas; no se monta');
      return null;
    }

    var st = {
      scene: scene, motas: [], huellas: [], vigilados: {},
      clavePolvo: clavePolvo, claveHuella: claveHuella,
      claveAnillo: claveAnillo || clavePolvo,
      terreno: 'seco', proximoTerreno: 0
    };
    scene.__gfPisadas = st;
    montado = st;

    var n = (calidad() === 'media') ? 0.6 : 1;
    var i;
    for (i = 0; i < Math.round(N_POLVO * n); i++)   st.motas.push(nuevaMota(st, clavePolvo));
    for (i = 0; i < Math.round(N_HUELLAS * n); i++) st.huellas.push(nuevaHuella(st, claveHuella));

    st.onUpdate = function (ahora, delta) {
      // El tiempo se pregunta dos veces por segundo, no en cada frame: cambia
      // de minuto en minuto y consultarlo 60 veces por segundo es tontería.
      if (ahora >= st.proximoTerreno) {
        st.terreno = terreno();
        st.proximoTerreno = ahora + 500;
      }
      revisar(st, ahora, delta);
      mover(st, ahora, delta);
    };
    scene.events.on('update', st.onUpdate);

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    log('montado —', st.motas.length, 'motas y', st.huellas.length, 'huellas');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfPisadas;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var i;
    for (i = 0; i < st.motas.length; i++)   st.motas[i].spr.destroy();
    for (i = 0; i < st.huellas.length; i++) st.huellas[i].spr.destroy();
    st.motas.length = 0; st.huellas.length = 0;
    st.vigilados = {};
    scene.__gfPisadas = null;
    if (montado === st) montado = null;
  }

  var montado = null;

  window.GFPisadas = {
    montar: montar,
    desmontar: desmontar,
    pisar: pisar,
    estado: function () {
      return {
        montado: !!montado,
        terreno: montado ? montado.terreno : null,
        motas: montado ? montado.motas.length : 0,
        huellas: montado ? montado.huellas.length : 0,
        siguiendo: montado ? Object.keys(montado.vigilados) : []
      };
    },
    _interno: {
      ZANCADA: ZANCADA, TONOS: TONOS, terreno: terreno, piesDe: piesDe,
      texturaPolvo: texturaPolvo, texturaHuella: texturaHuella,
      texturaAnillo: texturaAnillo, revisar: revisar, mover: mover
    }
  };
})();
