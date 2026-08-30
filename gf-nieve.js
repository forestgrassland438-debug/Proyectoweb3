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
  var FAMILIAS = [
    { prefijo: 'sprite_arbolx',    hasta: 18 },
    { prefijo: 'sprite_pinos',     hasta: 45 },
    { prefijo: 'post_',            hasta: 24 },
    { prefijo: 'sprite_arbustos_', hasta: 28 },
    { prefijo: 'sprite_piedras_',  hasta: 34 }
  ];
  var EDIFICIOS = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                   'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                   'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];

  var ALFA_MIN = 8;                  // a partir de aquí un píxel cuenta

  /* Texturas ya dibujadas. En el módulo y no en la escena: las texturas viven
     en game.textures y sobreviven al cambio de escena, así que al volver al
     mapa no hay que dibujar nada otra vez. */
  var hechas = {};

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
      return Math.max(0, Math.min(1, Number(e.nieveFuerza) || 1));
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
    if (scene.textures.exists(clave)) return clave;
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
      scene.textures.addCanvas(clave, cv);
      var t = scene.textures.get(clave);
      if (t && t.setFilter && window.Phaser && Phaser.Textures) {
        t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      return clave;
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
    if (hechas[clave] && scene.textures.exists(clave)) return clave;

    var tex = scene.textures.get(claveOrigen);
    var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    if (!img || !img.width || !img.height) return null;
    var w = img.width, h = img.height;

    try {
      var lec = document.createElement('canvas');
      lec.width = w; lec.height = h;
      var lc = lec.getContext('2d', { willReadFrequently: true });
      lc.drawImage(img, 0, 0);
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

        var g = c.createLinearGradient(0, cima[x] - 1, 0, cima[x] + alto);
        g.addColorStop(0,   'rgba(255,255,255,0.98)');
        g.addColorStop(0.6, 'rgba(244,250,255,0.92)');
        g.addColorStop(1,   'rgba(214,232,248,0.10)');
        c.fillStyle = g;
        // Un pelín por encima del contorno: la nieve sobresale del canto.
        c.fillRect(x, cima[x] - 1, 1, alto + 1);
      }

      scene.textures.addCanvas(clave, cv);
      var t2 = scene.textures.get(clave);
      if (t2 && t2.setFilter && window.Phaser && Phaser.Textures) {
        t2.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      hechas[clave] = true;
      return clave;
    } catch (e) {
      log('no se pudo dibujar la capa de', claveOrigen, e && e.message);
      return null;
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
    if (!clave) { spr.__gfNieve = 'no'; return null; }
    var s;
    try { s = scene.add.image(spr.x, spr.y, clave); } catch (e) { return null; }
    s.setOrigin(spr.originX, spr.originY);
    s.setDisplaySize(spr.displayWidth, spr.displayHeight);
    s.setScrollFactor(spr.scrollFactorX, spr.scrollFactorY);
    s.setDepth(profundidadDe(spr));
    s.setAlpha(0);
    s.setVisible(false);
    if (s.disableInteractive) s.disableInteractive();
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
    var clave = texturaMancha(st.scene, n % 4);
    if (!clave) return null;
    var s = st.scene.add.image(0, 0, clave);
    s.setOrigin(0.5, 0.5);
    s.setDepth(PROF_MANCHA);
    s.setAlpha(0);
    s.setVisible(false);
    if (s.disableInteractive) s.disableInteractive();
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

  // ═══════════════════════════════════════════════════════════ MONTAJE
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfNieveSt) { recalcular(scene); return scene.__gfNieveSt; }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      capas: [], manchas: [],
      manto: 0, proximaMancha: 0, cursor: 0, hechas: 0,
      porFrame: opciones.porFrame || POR_FRAME
    };
    scene.__gfNieveSt = st;

    st.onUpdate = function (ahora, delta) {
      var i, d;
      var quiere = nieveMandada();
      var nevando = quiere > 0.05;

      /* EL MANTO. Sube mientras nieva y baja al parar, siempre despacio: es lo
         que hace que se lea como acumulación y no como un interruptor. */
      var paso = delta / (nevando ? CUAJA_MS : -DERRITE_MS);
      st.manto = Math.max(0, Math.min(1, st.manto + paso * (nevando ? quiere : 1)));

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
          if (d.spr) d.spr.destroy();
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
        d.spr.setDepth(profundidadDe(dueno));
        d.spr.setAlpha(alfaCapa);
        d.spr.setVisible(st.manto > 0.01 && dueno.visible !== false);
        st.cursor++;
      }
    };
    scene.events.on('update', st.onUpdate);

    for (var j = 0; j < N_MANCHAS; j++) {
      var m = nuevaMancha(st, j);
      if (m) st.manchas.push(m);
    }

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montado con', st.pendientes.length, 'objetos');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfNieveSt;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var i;
    for (i = 0; i < st.capas.length; i++) {
      var d = st.capas[i];
      if (d.spr) d.spr.destroy();
      if (d.dueno && d.dueno.__gfNieve === d) d.dueno.__gfNieve = null;
    }
    for (i = 0; i < st.pendientes.length; i++) {
      if (st.pendientes[i]) st.pendientes[i].__gfNieve = null;
    }
    for (i = 0; i < st.manchas.length; i++) {
      if (st.manchas[i].spr) st.manchas[i].spr.destroy();
    }
    st.capas.length = 0; st.manchas.length = 0; st.pendientes.length = 0;
    scene.__gfNieveSt = null;
    /* Las texturas dibujadas NO se borran: son pocas y pequeñas, viven en
       game.textures y así al volver al mapa la nieve aparece sin redibujar. */
  }

  function recalcular(scene) {
    var st = scene && scene.__gfNieveSt;
    if (!st) return 0;
    var nuevos = candidatos(scene);
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
                CUAJA_MS: CUAJA_MS, DERRITE_MS: DERRITE_MS }
  };
})();
