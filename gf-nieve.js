/* ===========================================================================
 * LA NIEVE QUE SE QUEDA
 *
 * QUÉ HACE
 *   Mientras nieva, el mundo se va poniendo blanco: se acumula nieve en el
 *   SUELO —las calles, los caminos, la hierba— y se posa ENCIMA de las casas,
 *   los árboles y los arbustos. Cuando escampa, se derrite poco a poco.
 *
 * POR QUÉ VA APARTE DE gf-clima.js
 *   gf-clima pinta lo que CAE: los copos, que viven pegados a la cámara y son
 *   los mismos ciento diez reciclándose. Esto es lo contrario: lo que QUEDA, que
 *   vive en el MUNDO, tiene sitio propio y no se recicla. Son dos cosas
 *   distintas con dos ciclos de vida distintos, y mezclarlas en un archivo que
 *   ya tiene mil cuatrocientas líneas no habría ayudado a nadie.
 *
 * EL MANTO
 *   No aparece de golpe: hay un número, `manto`, que sube despacio mientras
 *   nieva (cuarenta segundos hasta cuajar del todo) y baja aún más despacio al
 *   parar (un minuto y medio en derretirse). Es lo que hace que se lea como que
 *   se está acumulando y no como un interruptor.
 *
 * NINGUNA IMAGEN NUEVA
 *   Ni un PNG. Las manchas del suelo y la nieve de los tejados se DIBUJAN con
 *   canvas la primera vez que hacen falta y se guardan como textura. Es
 *   deliberado: en este proyecto ya pasó que faltaran catorce PNG por subir al
 *   servidor y eso dejó el clima entero sin funcionar. Lo que se dibuja solo no
 *   se puede olvidar de subir.
 *
 * LA NIEVE DEL TEJADO SIGUE EL CONTORNO
 *   No es una mancha encima: se busca, columna a columna, el primer píxel
 *   pintado del sprite —o sea, su silueta por arriba— y se pinta una banda
 *   blanca justo ahí, más fina donde la superficie está inclinada, porque en
 *   una pared vertical la nieve no agarra. Por eso la nieve de un tejado a dos
 *   aguas sale con la forma del tejado y la de un pino con la de la copa.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFNieve && GFNieve.montar(this);
 *
 * API
 *   GFNieve.montar(scene) / desmontar(scene)
 *   GFNieve.estado(scene)
 *   GFNieve.forzar(0..1)   fija el manto a mano, para verlo sin esperar
 * ======================================================================== */
(function () {
  'use strict';

  /* Lo que tarda el manto en cuajar y en derretirse. Derretirse tarda más:
     así es en la realidad y así se lee mejor. */
  var CUAJA_MS   = 40000;
  var DERRITE_MS = 90000;

  /* ── Manchas del suelo ─────────────────────────────────────────────── */
  var N_MANCHAS   = 54;
  /* Alrededor del jugador. No más: a zoom 2 se ven unos 500x300 px de mundo,
     así que sembrar mucho más lejos es gastar manchas donde nadie las ve. */
  var MANCHA_RADIO = 620;
  /* MUCHAS Y PEQUEÑAS, no pocas y grandes. Una mancha grande y opaca se lee
     como una nube posada en el suelo; lo que hace que parezca nieve es que sean
     retales sueltos por los que todavía se ve el suelo entre medias. */
  var MANCHA_TAM  = [48, 104];
  var MANCHA_CADA = [140, 460];      // ms entre mancha y mancha al empezar
  var MANCHA_ALFA = 0.60;
  var PROF_MANCHA = 2;               // sobre el mapa y sobre los charcos (1)
  var SEPARA_MIN  = 54;              // no se amontonan una encima de otra

  /* ── Nieve encima de los objetos ───────────────────────────────────── */
  var CAPA_ALFA   = 0.88;
  var CAPA_GRUESO = 0.09;            // del alto del objeto
  var CAPA_MIN    = 2, CAPA_MAX = 14;
  var POR_FRAME   = 3;               // objetos preparados por fotograma
  var REVISA_FRAME = 10;

  /* A qué se le pone nieve encima. Es a propósito la misma familia que las
     sombras: son los objetos que de verdad tienen volumen. */
  /* QUÉ SE CUBRE DE NIEVE.
   *
   * "Cuando la nieve congela quiero que congele nuevas cosas". Lo que había
   * eran cinco familias —árboles, pinos, postes, arbustos y piedras— y los
   * edificios. Con eso nevaba sobre el bosque pero el pueblo se quedaba a
   * medias: los arbustos de flores seguían floridos bajo la nevada, los
   * troncos caídos limpios y las vetas de mineral relucientes, que es
   * justamente lo que delata que la nieve está puesta a mano.
   *
   * Las nuevas son cosas que el jugador tiene DELANTE todo el rato: las flores
   * (donde más se nota, porque el blanco encima del color canta), la leña
   * caída, las rocas de picar, los barriles, las escaleras y el pozo.
   *
   * Cada línea cuesta lo mismo que las de antes: gf-nieve solo dibuja el
   * casquete de los sprites que están en pantalla, así que ampliar la lista no
   * añade trabajo por frame, solo variedad. */
  var FAMILIAS = [
    { prefijo: 'sprite_arbolx',    hasta: 18 },
    { prefijo: 'sprite_pinos',     hasta: 45 },
    { prefijo: 'post_',            hasta: 24 },
    { prefijo: 'sprite_arbustos_', hasta: 28 },
    { prefijo: 'sprite_piedras_',  hasta: 34 },
    // ── nuevas ──
    { prefijo: 'sprite_arbusto_ect',       hasta: 19 },   // arbustos del pueblo
    { prefijo: 'sprite_flor_formado1_ect', hasta: 19 },   // arbustos con flores
    { prefijo: 'sprite_flor_formado2_ect', hasta: 20 },
    { prefijo: 'sprite_flor_formado3_ect', hasta: 19 },
    { prefijo: 'sprite_flor_formado4_ect', hasta: 18 },
    { prefijo: 'sprite_minar_piedra',      hasta: 5  },   // vetas de mineral
    { prefijo: 'sprite_minar_cobre',       hasta: 4  },
    { prefijo: 'sprite_minar_hierro',      hasta: 3  },
    { prefijo: 'sprite_cbarril_png',       hasta: 2  },   // barriles
    { prefijo: 'sprite_escaleraxd',        hasta: 2  },   // escaleras
    { prefijo: 'sprite_pozoxd',            hasta: 2  }    // el pozo
  ];
  /* Los troncos caídos van aparte porque su nombre acaba en "png" antes del
     número (`sprite_tronco_acostado_1png`), y el patrón general es
     prefijo + número. Se añaden a mano al montar; ver `candidatos`. */
  var TRONCOS = 10;
  var EDIFICIOS = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                   'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                   'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];

  var ALFA_MIN = 8;                  // a partir de aquí un píxel cuenta

  /* ── Los detalles (2026-10-04) ─────────────────────────────────────
     "La nieve con más gráficos y efectos altamente detallados":
       DESTELLOS  la nieve al sol brilla a puntos sueltos que se encienden y
                  se apagan, sobre los tejados, las copas y el suelo nevado.
       HUELLAS    el jugador deja pisadas, que la nevada vuelve a tapar.
       VAHO       con frío se le ve el aliento.
     Y las capas de encima de los objetos llevan ahora bultos (la nieve se
     amontona, no calca el canto) y sombra azulada por debajo. */
  var N_DESTELLOS  = 18;
  var DESTELLO_MS  = [280, 720];
  var N_HUELLAS    = 40;
  var HUELLA_PASO  = 26;             // px andados entre pisada y pisada
  var HUELLA_MS    = 14000;          // lo que tarda la nevada en taparlas
  var N_VAHOS      = 4;
  var VAHO_CADA    = [1800, 3200];
  var VAHO_MS      = 1300;
  var PROF_HUELLA  = PROF_MANCHA + 0.1;
  // Puntos de la cresta de cada capa (u, v de 0 a 1), para los destellos.
  var puntosCapa   = {};

  // Las capas pueden tener el tamaño de una casa completa. Mantenerlas en
  // game.textures tras derretirse retenía tanto el canvas como la copia GPU.
  // Se comparten mientras haya una escena que las use y luego se eliminan.
  var texturasPorManager = new WeakMap();

  function retenerTextura(scene, clave, creada) {
    var st = scene.__gfNieveSt;
    if (!st) return clave;
    var cache = texturasPorManager.get(scene.textures);
    if (!cache) { cache = new Map(); texturasPorManager.set(scene.textures, cache); }
    var duenos = cache.get(clave);
    if (!duenos && creada) { duenos = new Set(); cache.set(clave, duenos); }
    if (duenos) { duenos.add(st); st.texturas.add(clave); }
    return clave;
  }

  function liberarTexturas(st) {
    var manager = st.scene && st.scene.textures;
    var cache = manager && texturasPorManager.get(manager);
    if (cache) st.texturas.forEach(function (clave) {
      var duenos = cache.get(clave);
      if (!duenos) return;
      duenos.delete(st);
      if (!duenos.size) {
        try { if (manager.exists(clave)) manager.remove(clave); } catch (e) { log('no se pudo liberar', clave, e); }
        cache.delete(clave);
      }
    });
    st.texturas.clear();
  }

  function destruirObjeto(obj) {
    try { if (obj && obj.destroy) obj.destroy(); } catch (e) { log('no se pudo liberar un objeto', e); }
  }

  function retirarManto(st) {
    st.capas.forEach(function (d) {
      destruirObjeto(d.spr);
      if (d.dueno && d.dueno.__gfNieve === d) d.dueno.__gfNieve = null;
      d.spr = d.dueno = null;
    });
    st.manchas.forEach(function (m) { destruirObjeto(m.spr); m.spr = null; });
    if (st.detalles) {
      ['destellos', 'huellas', 'vahos'].forEach(function (k) {
        st.detalles[k].forEach(function (o) { destruirObjeto(o.spr); o.spr = null; });
      });
      st.detalles = null;
    }
    st.capas.length = st.manchas.length = 0;
    st.cursor = st.hechas = st.proximaMancha = 0;
    liberarTexturas(st);
  }

  function log() {
    if (!window.GF_NIEVE_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[nieve]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }

  /** Cuánta nieve manda el servidor ahora mismo, de 0 a 1. */
  function nieveMandada() {
    if (typeof forzado === 'number') return forzado;
    var C = window.GFClima;
    if (!C || !C.estado) return 0;
    try {
      var e = C.estado();
      if (!e || !e.activo || !e.nieve) return 0;
      var fuerza = Number(e.nieveFuerza);
      return Number.isFinite(fuerza) ? Math.max(0, Math.min(1, fuerza)) : 1;
    } catch (e) { return 0; }
  }
  var forzado = null;

  /** Cuánta luz hay: la nieve de noche se ve azulada y apagada, no blanca. */
  function luz() {
    var c = window.GFCiclo;
    if (!c || !c.oscuridad) return 1;
    try {
      var o = c.oscuridad();
      return (typeof o === 'number' && isFinite(o))
        ? Math.max(0, Math.min(1, 1 - o)) : 1;
    } catch (e) { return 1; }
  }

  // ═══════════════════════════════════════════════ TEXTURAS DIBUJADAS
  /**
   * Una mancha de nieve en el suelo.
   *
   * Se monta con varios círculos difuminados solapados en vez de con uno solo:
   * un círculo se lee como un círculo, y la nieve en el suelo no tiene forma de
   * nada. Cada variante sale distinta porque los círculos van al azar.
   */
  function texturaMancha(scene, n) {
    var clave = 'gfn_mancha_' + n;
    if (scene.textures.exists(clave)) return retenerTextura(scene, clave);
    var T = 96;
    try {
      var cv = document.createElement('canvas');
      cv.width = T; cv.height = T;
      var c = cv.getContext('2d');
      if (!c) return null;
      /* Bastantes círculos pequeños y BLANDOS. Con pocos y grandes el centro
         queda macizo y la mancha se lee como una nube; con muchos y suaves
         queda un retal irregular con el borde deshilachado, que es lo que hace
         la nieve cuando se posa sobre hierba. */
      var i, k = 9 + Math.floor(Math.random() * 6);
      for (i = 0; i < k; i++) {
        var r  = az(T * 0.10, T * 0.22);
        var cx = az(r, T - r), cy = az(r, T - r);
        var g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    'rgba(255,255,255,0.55)');
        g.addColorStop(0.45, 'rgba(248,252,255,0.30)');
        g.addColorStop(1,    'rgba(240,248,255,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(cx, cy, r, 0, 6.284); c.fill();
      }
      /* Encima de lo ya pintado (source-atop): una sombra azulada hacia el
         canto de abajo —la nieve tiene volumen— y escarcha, puntitos más
         blancos sueltos. Solo caen donde ya hay nieve. */
      c.globalCompositeOperation = 'source-atop';
      var sg = c.createRadialGradient(T * 0.5, T * 0.66, 0, T * 0.5, T * 0.66, T * 0.44);
      sg.addColorStop(0, 'rgba(160,190,228,0.22)');
      sg.addColorStop(1, 'rgba(160,190,228,0)');
      c.fillStyle = sg;
      c.fillRect(0, 0, T, T);
      for (i = 0; i < 28; i++) {
        c.fillStyle = 'rgba(255,255,255,' + az(0.4, 0.9).toFixed(2) + ')';
        c.fillRect(Math.floor(az(8, T - 8)), Math.floor(az(8, T - 8)), 1, 1);
      }
      c.globalCompositeOperation = 'source-over';
      scene.textures.addCanvas(clave, cv);
      var t = scene.textures.get(clave);
      if (t && t.setFilter && window.Phaser && Phaser.Textures) {
        t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      return retenerTextura(scene, clave, true);
    } catch (e) { return null; }
  }

  /**
   * La nieve posada encima de un objeto, siguiendo su silueta.
   *
   * Se recorre la textura columna a columna buscando el PRIMER píxel pintado:
   * eso es el contorno de arriba del objeto —el caballete del tejado, la copa
   * del pino, el lomo de la piedra—. Sobre esa línea se pinta una banda blanca.
   *
   * El grosor no es constante: donde el contorno cae en picado (una pared, el
   * lateral de un tronco) se adelgaza hasta desaparecer, porque en vertical la
   * nieve no se queda. Eso es lo que separa una capa de nieve creíble de una
   * pegatina blanca por encima.
   *
   * La textura resultante mide LO MISMO que la original, así que colocarla es
   * copiar la posición, el origen y el tamaño del objeto. Sin cuentas.
   */
  function texturaCapa(scene, claveOrigen) {
    var clave = 'gfn_capa_' + claveOrigen;
    if (scene.textures.exists(clave)) return retenerTextura(scene, clave);

    var tex = scene.textures.get(claveOrigen);
    var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    if (!img || !img.width || !img.height) return null;
    // El contorno se dibuja a resolución limitada y se escala con el sprite;
    // una textura de origen grande no necesita otra copia RGBA completa.
    var escala = Math.min(1, 1024 / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * escala));
    var h = Math.max(1, Math.round(img.height * escala));
    var lec = null;

    try {
      lec = document.createElement('canvas');
      lec.width = w; lec.height = h;
      var lc = lec.getContext('2d', { willReadFrequently: true });
      lc.drawImage(img, 0, 0, w, h);
      var d = lc.getImageData(0, 0, w, h).data;

      // Primer píxel pintado de cada columna. -1 = columna vacía.
      var cima = new Int32Array(w), x, y, hay = 0;
      for (x = 0; x < w; x++) {
        cima[x] = -1;
        for (y = 0; y < h; y++) {
          if (d[(y * w + x) * 4 + 3] >= ALFA_MIN) { cima[x] = y; hay++; break; }
        }
      }
      if (hay < 3) return null;

      var grueso = Math.max(CAPA_MIN, Math.min(CAPA_MAX, Math.round(h * CAPA_GRUESO)));
      var semilla = (claveOrigen.length * 7.31) % 6.28;
      var puntos = [];

      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var c = cv.getContext('2d');
      if (!c) return null;

      /* La banda se dibuja columna a columna. El grosor se saca de la
         PENDIENTE local: cuanto más vertical es el contorno, menos nieve
         aguanta. Y se le suma una ondulación suave para que el canto de arriba
         no salga calcado al del tejado. */
      for (x = 0; x < w; x++) {
        if (cima[x] < 0) continue;
        var izq = (x > 0 && cima[x - 1] >= 0) ? cima[x - 1] : cima[x];
        var der = (x < w - 1 && cima[x + 1] >= 0) ? cima[x + 1] : cima[x];
        var pendiente = Math.abs(der - izq) / 2;
        // 0 = plano (toda la nieve) · 3 px de caída por píxel = nada
        var agarre = Math.max(0, 1 - pendiente / 3);
        if (agarre <= 0.02) continue;

        var onda = 0.82 + 0.18 * Math.sin(x * 0.19) + 0.08 * Math.sin(x * 0.61);
        var alto = grueso * agarre * onda;
        if (alto < 0.6) continue;

        /* BULTOS: la nieve no calca el canto, se amontona encima a su aire.
           Dos senos de periodos distintos dan montoncitos irregulares, y solo
           donde agarra (en la pendiente no se amontona nada). */
        var bulto = agarre * (0.6 + 0.6 * Math.sin(x * 0.37 + semilla) * Math.sin(x * 0.11 + semilla * 2)) *
                    Math.max(1, grueso * 0.18);
        // Un pelín por encima del contorno: la nieve sobresale del canto.
        var arriba = cima[x] - 1 - Math.max(0, bulto);
        var g = c.createLinearGradient(0, arriba, 0, cima[x] + alto);
        g.addColorStop(0,    'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(250,253,255,0.97)');
        g.addColorStop(0.65, 'rgba(232,242,254,0.90)');
        g.addColorStop(1,    'rgba(196,216,242,0.10)');
        c.fillStyle = g;
        c.fillRect(x, arriba, 1, cima[x] + alto - arriba + 1);
        if (x % 3 === 0 && alto > 2) puntos.push({ u: (x + 0.5) / w, v: (arriba + 1.5) / h });
      }
      puntosCapa[clave] = puntos;

      scene.textures.addCanvas(clave, cv);
      var t2 = scene.textures.get(clave);
      if (t2 && t2.setFilter && window.Phaser && Phaser.Textures) {
        t2.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      return retenerTextura(scene, clave, true);
    } catch (e) {
      log('no se pudo dibujar la capa de', claveOrigen, e && e.message);
      return null;
    } finally {
      // Suelta el buffer de lectura inmediatamente, incluido el caso vacío.
      if (lec) { lec.width = 0; lec.height = 0; }
    }
  }

  // ═══════════════════════════════════════════════════════ CANDIDATOS
  function util(spr) {
    if (!spr || spr.__gfNieve || spr.active === false) return false;
    if (!spr.texture || !spr.texture.key) return false;
    return !!spr.scene;
  }

  function candidatos(scene) {
    var out = [], i, f;
    for (f = 0; f < FAMILIAS.length; f++) {
      for (i = 1; i <= FAMILIAS[f].hasta; i++) {
        var spr = scene[FAMILIAS[f].prefijo + i];
        if (util(spr)) out.push(spr);
      }
    }
    for (i = 0; i < EDIFICIOS.length; i++) {
      var e = scene[EDIFICIOS[i]];
      if (util(e)) out.push(e);
    }
    /* Los troncos caídos, que no siguen el patrón prefijo+número: se llaman
       `sprite_tronco_acostado_1png`, con el "png" metido en medio. */
    for (i = 1; i <= TRONCOS; i++) {
      var t = scene['sprite_tronco_acostado_' + i + 'png'];
      if (util(t)) out.push(t);
    }
    return out;
  }

  /**
   * La profundidad a la que va la nieve de un objeto.
   *
   * Justo por encima del objeto — y si gf-profundidad lo ha partido en franjas,
   * por encima de TODAS: si no, la nieve del tejado se quedaría por debajo de
   * la mitad de la casa.
   */
  function profundidadDe(spr) {
    var d = spr.depth || 0;
    var tr = spr.__gfFranjas;
    if (tr) for (var i = 0; i < tr.length; i++) {
      if (tr[i] && tr[i].depth > d) d = tr[i].depth;
    }
    return d + 0.2;
  }

  function ponerCapa(scene, spr) {
    var clave = texturaCapa(scene, spr.texture.key);
    if (!clave) return null;
    var s;
    try {
      s = scene.add.image(spr.x, spr.y, clave);
      s.setOrigin(spr.originX, spr.originY);
      s.setDisplaySize(spr.displayWidth, spr.displayHeight);
      if (s.setFlip) s.setFlip(!!spr.flipX, !!spr.flipY);
      s.setScrollFactor(spr.scrollFactorX, spr.scrollFactorY);
      s.setDepth(profundidadDe(spr));
      s.setAlpha(0);
      s.setVisible(false);
      if (s.disableInteractive) s.disableInteractive();
    } catch (e) { destruirObjeto(s); return null; }
    var d = { spr: s, dueno: spr, clave: spr.texture.key };
    spr.__gfNieve = d;
    return d;
  }

  // ═══════════════════════════════════════════════════ MANCHAS DEL SUELO
  /** ¿Se puede poner nieve aquí? El mismo criterio que los charcos. */
  function sueloLibre(scene, x, y) {
    if (typeof scene._chocaConEscenario !== 'function') return false;
    try { return !scene._chocaConEscenario(x - 12, y - 8, 24, 16); }
    catch (e) { return false; }
  }

  function nuevaMancha(st, n) {
    var clave = texturaMancha(st.scene, n % 6);
    if (!clave) return null;
    var s;
    try {
      s = st.scene.add.image(0, 0, clave);
      s.setOrigin(0.5, 0.5);
      s.setDepth(PROF_MANCHA);
      s.setAlpha(0);
      s.setVisible(false);
      if (s.disableInteractive) s.disableInteractive();
    } catch (e) { destruirObjeto(s); return null; }
    return { spr: s, viva: false };
  }

  function brotarMancha(st) {
    var scene = st.scene;
    var p = scene.player;
    if (!p) return;
    var libre = null, i;
    for (i = 0; i < st.manchas.length; i++) {
      if (!st.manchas[i].viva) { libre = st.manchas[i]; break; }
    }
    if (!libre) return;

    for (var t = 0; t < 10; t++) {
      var ang = az(0, Math.PI * 2);
      var d = az(90, MANCHA_RADIO);
      var x = p.x + Math.cos(ang) * d;
      var y = p.y + Math.sin(ang) * d;
      if (!sueloLibre(scene, x, y)) continue;
      var pegada = false;
      for (var k = 0; k < st.manchas.length; k++) {
        var m = st.manchas[k];
        if (m.viva && Math.hypot(m.spr.x - x, m.spr.y - y) < SEPARA_MIN) {
          pegada = true; break;
        }
      }
      if (pegada) continue;

      var tam = az(MANCHA_TAM[0], MANCHA_TAM[1]);
      libre.viva = true;
      libre.spr.setPosition(Math.round(x), Math.round(y));
      libre.spr.setDisplaySize(tam, tam * az(0.55, 0.8));
      libre.spr.setRotation(az(0, 6.28));
      libre.spr.setVisible(true);
      return;
    }
  }

  // ═══════════════════════════════════════════════ DESTELLOS, HUELLAS, VAHO
  function texturaDibujada(scene, clave, W, H, pintar) {
    if (scene.textures.exists(clave)) return retenerTextura(scene, clave);
    try {
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      if (!c) return null;
      pintar(c, W, H);
      scene.textures.addCanvas(clave, cv);
      return retenerTextura(scene, clave, true);
    } catch (e) { return null; }
  }

  function texturaDestello(scene) {
    return texturaDibujada(scene, 'gfn_destello', 9, 9, function (c) {
      // Una estrella de cuatro puntas: el brillo de un cristal de hielo.
      c.fillStyle = 'rgba(255,255,255,1)';
      c.fillRect(4, 4, 1, 1);
      for (var k = 1; k <= 4; k++) {
        c.fillStyle = 'rgba(235,246,255,' + (1 - k * 0.22).toFixed(2) + ')';
        c.fillRect(4 - k, 4, 1, 1); c.fillRect(4 + k, 4, 1, 1);
        c.fillRect(4, 4 - k, 1, 1); c.fillRect(4, 4 + k, 1, 1);
      }
      c.fillStyle = 'rgba(220,238,255,0.35)';
      c.fillRect(3, 3, 1, 1); c.fillRect(5, 3, 1, 1); c.fillRect(3, 5, 1, 1); c.fillRect(5, 5, 1, 1);
    });
  }

  function texturaHuella(scene) {
    return texturaDibujada(scene, 'gfn_huella', 8, 13, function (c) {
      // La suela y el tacón, hundidos: azul de sombra con el centro más claro.
      c.fillStyle = 'rgba(118,144,186,0.62)';
      c.beginPath(); c.ellipse(4, 4.2, 3, 3.9, 0, 0, 6.284); c.fill();
      c.beginPath(); c.ellipse(4, 10.4, 2.4, 2.2, 0, 0, 6.284); c.fill();
      c.fillStyle = 'rgba(176,198,232,0.45)';
      c.beginPath(); c.ellipse(4, 4.6, 1.8, 2.4, 0, 0, 6.284); c.fill();
      c.beginPath(); c.ellipse(4, 10.6, 1.3, 1.1, 0, 0, 6.284); c.fill();
    });
  }

  function texturaVaho(scene) {
    return texturaDibujada(scene, 'gfn_vaho', 24, 24, function (c, W) {
      var g = c.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.5, 'rgba(245,250,255,0.35)');
      g.addColorStop(1, 'rgba(240,248,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, W);
    });
  }

  function imagenNieve(scene, clave, prof) {
    var s = scene.add.image(0, 0, clave);
    s.setDepth(prof); s.setAlpha(0); s.setVisible(false);
    if (s.disableInteractive) s.disableInteractive();
    return s;
  }

  function prepararDetalles(st) {
    var scene = st.scene;
    var D = { destellos: [], huellas: [], vahos: [], proxVaho: 0, ultimaHuella: null, pie: 1, iHuella: 0 };
    var cd = texturaDestello(scene), ch = texturaHuella(scene), cv = texturaVaho(scene);
    var i, s;
    if (cd) for (i = 0; i < N_DESTELLOS; i++) {
      s = imagenNieve(scene, cd, PROF_MANCHA + 0.2);
      if (s.setBlendMode && window.Phaser && Phaser.BlendModes) s.setBlendMode(Phaser.BlendModes.ADD);
      D.destellos.push({ spr: s, vida: 1, dura: 1, esc: 1 });
    }
    if (ch) for (i = 0; i < N_HUELLAS; i++) D.huellas.push({ spr: imagenNieve(scene, ch, PROF_HUELLA), nace: 0 });
    if (cv) for (i = 0; i < N_VAHOS; i++) D.vahos.push({ spr: imagenNieve(scene, cv, 3), vida: 1, x: 0, y: 0, dir: 1 });
    return D;
  }

  /** Un sitio nevado A LA VISTA: la cresta de una capa, o dentro de una mancha. */
  function sitioNevado(st, vista) {
    for (var intento = 0; intento < 6; intento++) {
      if (Math.random() < 0.65 && st.capas.length) {
        var d = st.capas[Math.floor(Math.random() * st.capas.length)];
        if (!d.spr || !d.spr.visible) continue;
        var pts = puntosCapa['gfn_capa_' + d.clave];
        if (!pts || !pts.length) continue;
        var p = pts[Math.floor(Math.random() * pts.length)];
        var u = d.spr.flipX ? 1 - p.u : p.u;
        var x = d.spr.x - d.spr.displayWidth * d.spr.originX + u * d.spr.displayWidth;
        var y = d.spr.y - d.spr.displayHeight * d.spr.originY + p.v * d.spr.displayHeight + az(0, 3);
        if (vista && !vista.contains(x, y)) continue;
        return { x: x, y: y, prof: d.spr.depth + 0.05 };
      }
      var vivas = st.manchas.filter(function (m) { return m.viva; });
      if (!vivas.length) continue;
      var m = vivas[Math.floor(Math.random() * vivas.length)];
      var mx = m.spr.x + az(-0.3, 0.3) * m.spr.displayWidth;
      var my = m.spr.y + az(-0.25, 0.25) * m.spr.displayHeight;
      if (vista && !vista.contains(mx, my)) continue;
      return { x: mx, y: my, prof: PROF_MANCHA + 0.2 };
    }
    return null;
  }

  function moverDetalles(st, ahora, delta, l) {
    var scene = st.scene, p = scene.player;
    if (!st.detalles) st.detalles = prepararDetalles(st);
    var D = st.detalles, i, t;
    var vista = scene.cameras && scene.cameras.main ? scene.cameras.main.worldView : null;

    /* DESTELLOS: solo con luz (de noche la nieve no brilla) y con el manto
       ya puesto. Cuantos más, más luz y más nieve. */
    var ritmo = (st.manto > 0.3 && l > 0.35) ? 14 * st.manto * l : 0;
    var nuevos = ritmo * delta / 1000;
    for (i = 0; i < D.destellos.length; i++) {
      var de = D.destellos[i];
      if (de.vida >= 1) {
        if (nuevos > 0 && Math.random() < nuevos) {
          var sitio = sitioNevado(st, vista);
          if (sitio) {
            nuevos -= 1;
            de.vida = 0; de.dura = az(DESTELLO_MS[0], DESTELLO_MS[1]); de.esc = az(0.6, 1.25);
            de.spr.setPosition(sitio.x, sitio.y).setDepth(sitio.prof).setRotation(az(-0.3, 0.3)).setVisible(true);
            continue;
          }
        }
        if (de.spr.visible) de.spr.setVisible(false);
        continue;
      }
      de.vida += delta / de.dura;
      var brillo = Math.sin(Math.PI * Math.min(1, de.vida));
      de.spr.setScale(de.esc * (0.3 + 0.7 * brillo));
      de.spr.setAlpha(brillo * 0.95 * l);
    }

    /* HUELLAS: una pisada cada HUELLA_PASO px andados, alternando pie, a
       los dos lados de la línea de marcha. Un salto grande (teletransporte,
       cambio de mapa) no deja un rastro de pisadas en el aire. */
    if (p && st.manto > 0.25 && !scene._cambiandoEscena && D.huellas.length) {
      var pie = { x: p.x, y: p.y + 45 };
      if (!D.ultimaHuella) D.ultimaHuella = pie;
      var dx = pie.x - D.ultimaHuella.x, dy = pie.y - D.ultimaHuella.y;
      var dist = Math.hypot(dx, dy);
      if (dist > 200) D.ultimaHuella = pie;
      else if (dist >= HUELLA_PASO) {
        var ang = Math.atan2(dy, dx);
        var off = D.pie * 5;
        var hx = pie.x - Math.sin(ang) * off, hy = pie.y + Math.cos(ang) * off;
        if (sueloLibre(scene, hx, hy)) {
          var hu = D.huellas[D.iHuella % D.huellas.length];
          D.iHuella++;
          hu.nace = ahora;
          hu.spr.setPosition(hx, hy).setRotation(ang + Math.PI / 2).setScale(1.4).setVisible(true);
        }
        D.pie = -D.pie;
        D.ultimaHuella = pie;
      }
    }
    for (i = 0; i < D.huellas.length; i++) {
      var h = D.huellas[i];
      if (!h.nace) continue;
      t = (ahora - h.nace) / HUELLA_MS;
      if (t >= 1 || st.manto <= 0.05) { h.nace = 0; h.spr.setVisible(false); continue; }
      h.spr.setAlpha((1 - t) * Math.min(1, st.manto * 1.4) * (0.45 + 0.4 * l));
    }

    /* VAHO: con el frío puesto, cada par de segundos una nubecita delante
       de la cara, hacia donde mira. Se ve también de noche. */
    if (p && st.manto > 0.15 && D.vahos.length && ahora >= D.proxVaho) {
      D.proxVaho = ahora + az(VAHO_CADA[0], VAHO_CADA[1]);
      for (i = 0; i < D.vahos.length; i++) {
        var v = D.vahos[i];
        if (v.vida < 1) continue;
        v.dir = scene.lastDirection === 'left' ? -1 : 1;
        v.x = p.x + v.dir * 12; v.y = p.y - 34; v.vida = 0;
        v.spr.setVisible(true);
        break;
      }
    }
    for (i = 0; i < D.vahos.length; i++) {
      var va = D.vahos[i];
      if (va.vida >= 1) { if (va.spr.visible) va.spr.setVisible(false); continue; }
      va.vida += delta / VAHO_MS;
      var k = Math.min(1, va.vida);
      va.spr.setPosition(va.x + va.dir * 12 * k, va.y - 10 * k);
      va.spr.setScale(0.35 + 0.8 * k);
      va.spr.setDepth((p ? p.depth : 3) + 1);
      va.spr.setAlpha((1 - k) * 0.5 * (0.6 + 0.4 * l) * Math.min(1, st.manto * 2));
    }
  }

  // ═══════════════════════════════════════════════════════════ MONTAJE
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add || !scene.events || !scene.textures) return null;
    if (scene.__gfNieveSt) { recalcular(scene); return scene.__gfNieveSt; }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      capas: [], manchas: [],
      texturas: new Set(),
      manto: 0, proximaMancha: 0, cursor: 0, hechas: 0,
      porFrame: Number.isFinite(opciones.porFrame) ? Math.max(1, Math.min(20, Math.floor(opciones.porFrame))) : POR_FRAME
    };
    scene.__gfNieveSt = st;

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    st.onUpdate = function (ahora, delta) {
      if (!st.scene || !Number.isFinite(ahora) || !Number.isFinite(delta) || delta < 0) return;
      delta = Math.min(delta, 100);
      var i, d;
      var quiere = nieveMandada();
      var nevando = quiere > 0.05;

      /* EL MANTO. Sube mientras nieva y baja al parar, siempre despacio: es lo
         que hace que se lea como acumulación y no como un interruptor. */
      var paso = delta / (nevando ? CUAJA_MS : -DERRITE_MS);
      st.manto = Math.max(0, Math.min(1, st.manto + paso * (nevando ? quiere : 1)));

      if (!nevando && st.manto <= 0.001) {
        if (st.capas.length || st.manchas.length || st.texturas.size) {
          retirarManto(st);
          st.pendientes = candidatos(scene);
        }
        return;
      }

      // Nada que hacer y nada puesto: se sale enseguida.
      if (st.manto <= 0.001 && !st.capas.length && !st.pendientes.length) return;

      var l = luz();
      // De noche la nieve no es blanca: es azul y apagada. Nunca del todo
      // negra, porque la nieve rebota hasta la poca luz que hay.
      var brillo = 0.35 + 0.65 * l;

      /* 1. Ir preparando la nieve de los objetos, de pocos en pocos: dibujar
            ciento cincuenta texturas de golpe es un tirón al entrar. Solo se
            hace cuando ya está nevando; si no nieva nunca, no se paga nada. */
      if (st.manto > 0.01) {
        if (!st.manchas.length) {
          for (var j = 0; j < N_MANCHAS; j++) {
            var mancha = nuevaMancha(st, j);
            if (mancha) st.manchas.push(mancha);
          }
        }
        var n = Math.min(st.porFrame, st.pendientes.length);
        for (i = 0; i < n; i++) {
          var spr = st.pendientes.shift();
          if (!spr || !util(spr)) continue;
          d = ponerCapa(scene, spr);
          if (d) { st.capas.push(d); st.hechas++; }
        }
        if (n && !st.pendientes.length) log('preparadas', st.hechas, 'capas');
      }

      /* 2. Las manchas del suelo van saliendo mientras cuaja. */
      if (nevando && st.manto > 0.04) {
        if (!st.proximaMancha) st.proximaMancha = ahora;
        if (ahora >= st.proximaMancha) {
          brotarMancha(st);
          st.proximaMancha = ahora + az(MANCHA_CADA[0], MANCHA_CADA[1]) / quiere;
        }
      }
      var alfaSuelo = MANCHA_ALFA * st.manto * brillo;
      for (i = 0; i < st.manchas.length; i++) {
        var m = st.manchas[i];
        if (!m.viva) continue;
        m.spr.setAlpha(alfaSuelo);
        if (st.manto <= 0.002) { m.viva = false; m.spr.setVisible(false); }
      }

      /* 3. Repaso ROTATIVO de las capas: unas pocas por fotograma. Casi nunca
            se mueven, así que recorrerlas todas cada fotograma sería tirar el
            presupuesto; no repasarlas nunca dejaría nieve de árboles talados. */
      var alfaCapa = CAPA_ALFA * st.manto * brillo;
      var repasos = Math.min(REVISA_FRAME, st.capas.length);
      for (i = 0; i < repasos; i++) {
        if (!st.capas.length) break;
        if (st.cursor >= st.capas.length) st.cursor = 0;
        d = st.capas[st.cursor];
        var dueno = d.dueno;

        if (!dueno || !dueno.scene || dueno.active === false) {
          destruirObjeto(d.spr);
          if (dueno && dueno.__gfNieve === d) dueno.__gfNieve = null;
          st.capas.splice(st.cursor, 1);
          continue;
        }
        // Un árbol talado cambia de textura: su nieve tiene que cambiar con él.
        if (dueno.texture && dueno.texture.key !== d.clave) {
          var nueva = texturaCapa(scene, dueno.texture.key);
          if (nueva) { d.clave = dueno.texture.key; d.spr.setTexture(nueva); }
        }
        d.spr.setPosition(dueno.x, dueno.y);
        /* Y el GIRO. gf-viento mece los árboles cambiándoles la rotación; si la
           capa de nieve no lo copiara, la copa se movería y su nieve se quedaría
           quieta en el aire. Mismo motivo por el que las franjas de
           gf-profundidad copian el giro. */
        d.spr.setRotation(dueno.rotation || 0);
        d.spr.setDisplaySize(dueno.displayWidth, dueno.displayHeight);
        if (d.spr.setFlip) d.spr.setFlip(!!dueno.flipX, !!dueno.flipY);
        d.spr.setDepth(profundidadDe(dueno));
        d.spr.setAlpha(alfaCapa);
        d.spr.setVisible(st.manto > 0.01 && dueno.visible !== false);
        st.cursor++;
      }

      /* 4. Los detalles: destellos al sol, huellas y vaho. */
      if (st.manto > 0.01) moverDetalles(st, ahora, delta, l);
    };
    scene.events.on('update', st.onUpdate);

    log('montado con', st.pendientes.length, 'objetos');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfNieveSt;
    if (!st) return;
    scene.__gfNieveSt = null;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    retirarManto(st);
    for (var i = 0; i < st.pendientes.length; i++) {
      if (st.pendientes[i]) st.pendientes[i].__gfNieve = null;
    }
    st.capas.length = 0; st.manchas.length = 0; st.pendientes.length = 0;
    st.scene = st.onUpdate = st.onApagar = null;
  }

  function recalcular(scene) {
    var st = scene && scene.__gfNieveSt;
    if (!st) return 0;
    var pendientes = new Set(st.pendientes);
    var nuevos = candidatos(scene).filter(function (spr) { return !pendientes.has(spr); });
    if (nuevos.length) st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  window.GFNieve = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    /** Fija la nieve a mano (0..1) o suéltala con null. Para verlo sin esperar. */
    forzar: function (v) { forzado = (v === null || v === undefined) ? null : Math.max(0, Math.min(1, Number(v) || 0)); return forzado; },
    estado: function (scene) {
      var st = scene && scene.__gfNieveSt;
      if (!st) return null;
      var vivas = 0;
      for (var i = 0; i < st.manchas.length; i++) if (st.manchas[i].viva) vivas++;
      return { manto: Math.round(st.manto * 100) / 100,
               capas: st.capas.length, pendientes: st.pendientes.length,
               manchasVivas: vivas, manchas: st.manchas.length,
               nieveMandada: Math.round(nieveMandada() * 100) / 100 };
    },
    _interno: { texturaMancha: texturaMancha, texturaCapa: texturaCapa,
                candidatos: candidatos, ponerCapa: ponerCapa,
                brotarMancha: brotarMancha, sueloLibre: sueloLibre,
                profundidadDe: profundidadDe, nieveMandada: nieveMandada,
                moverDetalles: moverDetalles, sitioNevado: sitioNevado,
                CUAJA_MS: CUAJA_MS, DERRITE_MS: DERRITE_MS }
  };
})();
