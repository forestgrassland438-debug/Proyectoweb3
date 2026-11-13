/* ===========================================================================
 * gf-monturas.js — MONTAR ANIMALES                                 (2026-11-02)
 * ===========================================================================
 *
 * "Animales para montar en 2.5D, nada de 3D." Los 100 de gf-items-v2.js (dibujo
 * en Game/newpro/objetosv2/monturas, tools/generar-objetosv2.py). Se compran en
 * la tienda → Mounts con su nivel, y con una en la bolsa se monta con la H o
 * con el botón redondo. Con varias, el botón deja elegir.
 *
 * CÓMO SE PINTA. El jugador sigue siendo el mismo objeto, en el mismo sitio y con
 * la misma caja de choque: nada de lo que mira su posición o sus pies cambia. Lo
 * único es que se vuelve invisible y, cada frame, se dibuja el JINETE encima de
 * la silla. Si en lugar de eso se le moviera el origen al sprite, se descuadraría
 * todo lo que calcula sus pies (profundidad, sombra, colisiones de las escenas).
 *
 * EL JINETE (2026-11-10). "Cuando me monto se ve así, las piernas no se ven, el
 * personaje camina cuando el caballo trota y no le veo los pies: deberían
 * adaptarse a las monturas." Antes se copiaba el fotograma del personaje tal
 * cual (también los de andar) recortado por la cadera y hundido en el lomo:
 * medio cuerpo pegado al animal y moviendo los brazos como si caminara. Ahora
 * el jinete son DOS piezas:
 *
 *   · EL TORSO: el dibujo QUIETO del personaje hacia donde mira (nunca los de
 *     andar), de la cabeza a la cadera, apoyado justo en la silla. Pescando,
 *     su fotograma de pescar (con la caña).
 *   · LAS PIERNAS: se hornean una vez por personaje y vista a partir de sus
 *     propias piernas. De lado, la pierna de este lado doblada por la rodilla
 *     sobre la manta; de frente y de espaldas, una a cada costado del animal,
 *     separadas lo que mide ESA montura (se mide en su dibujo: un oso es más
 *     ancho que un avestruz), con el pie colgando.
 *
 *   Vale para cualquier personaje (los 13, los personalizados y los de los
 *   demás jugadores) porque no usa dibujos nuevos: sale de los suyos.
 *
 * LA VELOCIDAD. Se añade un tanto por ciento a lo que YA se ha movido este frame,
 * pasando por piesLibres de gf-poderes.js: funciona igual con teclas, ratón o
 * táctil, y contra una pared no empuja, porque no se ha movido nada.
 *
 * En interiores y en la tienda no se ve (y se vuelve a ver al salir). Quien muere
 * o sube al bote se baja. Los demás lo ven por 'montura:cambio'.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFMonturas) return;

  var CLAVE_LS = 'gf_montura';
  var W = 84, H = 68, ESCALA = 2;
  var FILAS = { lado: 0, abajo: 1, arriba: 2 };
  var SIN_MONTAR = /interior|tienda|battle|arena|loading|login/i;
  /* La sombra lleva clave PROPIA. Se llamaba 'gfm_sombra', la misma que la de la hierba alta
     (gf-monte.js): quien llegaba primero pintaba la del otro, y las matas del pueblo salían con
     unas elipses negras enormes ("las sombras de los mapas fallan"). */
  var SOMBRA = 'gfmt_sombra';
  var CADERA = 0.765;            // de la altura del dibujo: donde acaba el jersey y empiezan las piernas
  var ASIENTO = 2;               // px de pantalla que el jinete se hunde en la silla
  var RODILLA = 0.42;            // de la pierna: dónde dobla
  /* Del centro del cuadro al asiento, de lado y mirando a la derecha (px del dibujo). Sale de
     tools/gf_objetosv2.py: el cuadrúpedo se dibuja en 0,46 del ancho; el ave y el raptor, algo más atrás. */
  var SILLA_X = { ostrich: -4.4, raptor: -5.2 }, SILLA_X_BASE = -3.4;
  var DIR_DE_CLAVE = /(?:^|_)(right|left|up|down)_\d+$/;
  var ANDANDO = /^(.*player_)(?:right|left|up|down)_\d+$/;
  var MAX_HORNEADAS = 64;

  var elegida = null, montado = false;
  try {
    var g = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null');
    if (g && defDe(g.id)) { elegida = g.id; montado = !!g.montado; }
  } catch (e) {}

  function v2() { return window.GFItemsV2; }
  function defDe(id) { var v = window.GFItemsV2; return (v && id && v.monturas && v.monturas[id]) || null; }
  function guardar() { try { localStorage.setItem(CLAVE_LS, JSON.stringify({ id: elegida, montado: montado })); } catch (e) {} }
  function aviso(scene, t, tipo) { try { if (scene.notifications && scene.notifications.show) scene.notifications.show(t, tipo || 'info'); } catch (e) {} }
  function escribiendo() {
    var el = document.activeElement;
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }
  function claveEscena(scene) { return String((scene.scene && scene.scene.key) || (scene.sys && scene.sys.settings && scene.sys.settings.key) || ''); }
  function sePuede(scene) { return !SIN_MONTAR.test(claveEscena(scene)); }

  /** Las monturas que hay en la bolsa, de la más rápida a la más lenta. */
  function propias(scene) {
    var S = scene.STATE, vistas = {};
    [S && S.slots, S && S.quickSlots].forEach(function (lista) {
      (lista || []).forEach(function (o) { if (o && defDe(o.id) && (o.count || 0) > 0) vistas[o.id] = true; });
    });
    return Object.keys(vistas).sort(function (a, b) { return defDe(b).velocidad - defDe(a).velocidad; });
  }

  // ── Las medidas ───────────────────────────────────────────────────────
  var lienzo = null;
  function lienzoDe(w, h) {
    if (!lienzo) lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    var x = lienzo.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, w, h);
    return x;
  }
  function cuadroDe(scene, clave) {
    try {
      if (!clave || !scene.textures.exists(clave)) return null;
      var fr = scene.textures.getFrame(clave);
      return fr && fr.source && fr.source.image && fr.cutWidth > 0 && fr.cutHeight > 0 ? fr : null;
    } catch (e) { return null; }
  }
  /**
   * La anatomía de un dibujo de personaje: dónde empieza y acaba, la fila de la cadera y las
   * columnas que ocupan las piernas. Se mide en los píxeles (los personalizados traen filas
   * vacías: 33x69 en vez de 23x51) y se guarda por IMAGEN: si el personaje cambia, la textura
   * es otra imagen y se vuelve a medir sola.
   */
  var cuerpos = typeof WeakMap === 'function' ? new WeakMap() : null;
  function cuerpoDe(scene, clave) {
    var fr = cuadroDe(scene, clave);
    if (!fr || !cuerpos) return null;
    var img = fr.source.image, porImagen = cuerpos.get(img), firma = fr.cutX + ',' + fr.cutY + ',' + fr.cutWidth + ',' + fr.cutHeight;
    if (porImagen && Object.prototype.hasOwnProperty.call(porImagen, firma)) return porImagen[firma];
    if (!porImagen) { porImagen = {}; cuerpos.set(img, porImagen); }
    var c = null;
    try {
      var w = fr.cutWidth, h = fr.cutHeight, x = lienzoDe(w, h);
      x.drawImage(img, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
      var d = x.getImageData(0, 0, w, h).data, i, j, arriba = -1, abajo = -1;
      for (j = 0; j < h && arriba < 0; j++) for (i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 40) { arriba = j; break; }
      for (j = h - 1; j >= 0 && abajo < 0; j--) for (i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 40) { abajo = j + 1; break; }
      if (arriba >= 0 && abajo - arriba >= 12) {
        var cadera = arriba + Math.round((abajo - arriba) * CADERA), px0 = w, px1 = -1, oscuro = [0, 0, 0], menor = 1e9;
        for (j = cadera; j < abajo; j++) for (i = 0; i < w; i++) {
          var o = (j * w + i) * 4;
          if (d[o + 3] <= 40) continue;
          if (j > cadera) { if (i < px0) px0 = i; if (i > px1) px1 = i; }
          var luz = d[o] + d[o + 1] + d[o + 2];
          if (d[o + 3] > 200 && luz < menor) { menor = luz; oscuro = [d[o], d[o + 1], d[o + 2]]; }
        }
        if (px1 >= px0) c = { img: img, cx: fr.cutX, cy: fr.cutY, w: w, h: h, arriba: arriba, abajo: abajo, cadera: cadera, px0: px0, px1: px1 + 1, linea: oscuro };
      }
    } catch (e) { c = null; }
    porImagen[firma] = c;
    return c;
  }
  /** Medio ancho del animal a la altura de la manta, de frente y de espaldas (px de su dibujo). */
  var anchos = {};
  function medioAncho(scene, id, vista) {
    var a = anchos[id];
    if (!a) {
      a = anchos[id] = { abajo: 12, arriba: 12 };
      try {
        var def = defDe(id), img = scene.textures.get('gfm_' + id).getSourceImage();
        ['abajo', 'arriba'].forEach(function (v) {
          var x = lienzoDe(W, H);
          x.drawImage(img, 0, FILAS[v] * H, W, H, 0, 0, W, H);
          var fila = Math.max(0, Math.min(H - 1, Math.round(H - (def.silla[FILAS[v]] || 36)) + 4));
          var d = x.getImageData(0, fila, W, 1).data, izq = -1, der = -1;
          for (var i = 0; i < W; i++) if (d[i * 4 + 3] > 40) { if (izq < 0) izq = i; der = i; }
          if (izq >= 0) a[v] = Math.max(6, Math.min(22, Math.max(W / 2 - izq, der + 1 - W / 2)));
        });
      } catch (e) {}
    }
    return a[vista] || 12;
  }

  // ── Las piezas horneadas del jinete ───────────────────────────────────
  var horneadas = {};          // clave -> { img, clave, w, h, ox, oy }
  /** Un filo oscuro donde el dibujo quedó cortado sin él (el canto de un muslo doblado). */
  function perfilar(x, w, h, linea) {
    var im = x.getImageData(0, 0, w, h), d = im.data, poner = [], i, j;
    var claro = function (a, b) {
      if (a < 0 || b < 0 || a >= w || b >= h) return false;
      var o = (b * w + a) * 4;
      return d[o + 3] > 200 && d[o] + d[o + 1] + d[o + 2] > 96;
    };
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      if (d[(j * w + i) * 4 + 3] > 40) continue;
      if (claro(i - 1, j) || claro(i + 1, j) || claro(i, j - 1) || claro(i, j + 1)) poner.push((j * w + i) * 4);
    }
    for (i = 0; i < poner.length; i++) { d[poner[i]] = linea[0]; d[poner[i] + 1] = linea[1]; d[poner[i] + 2] = linea[2]; d[poner[i] + 3] = 255; }
    x.putImageData(im, 0, 0);
  }
  function enUso(scene) {
    var usa = {}, anotar = function (m) {
      if (!m) return;
      [m.jinete, m.piernas].forEach(function (s) { if (s && s.texture) usa[s.texture.key] = true; });
    };
    var st = scene.__gfMonturas;
    if (st) anotar(st.yo);
    var otros = scene.otherPlayers;
    if (otros) for (var k in otros) if (otros[k]) anotar(otros[k]._gfMontura);
    return usa;
  }
  function podar(scene) {
    var claves = Object.keys(horneadas);
    if (claves.length <= MAX_HORNEADAS) return;
    var usa = enUso(scene);
    claves.forEach(function (k) {
      if (usa[k]) return;
      try { if (scene.textures.exists(k)) scene.textures.remove(k); } catch (e) {}
      delete horneadas[k];
    });
  }
  function hornear(scene, clave, origen, w, h, pintar) {
    var ya = horneadas[clave];
    if (ya && ya.img === origen.img && scene.textures.exists(clave)) return ya;
    try {
      if (scene.textures.exists(clave)) scene.textures.remove(clave);
      var t = scene.textures.createCanvas(clave, w, h), x = t.getContext();
      x.imageSmoothingEnabled = false;
      var ancla = pintar(x) || {};
      t.refresh();
      try { t.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
      horneadas[clave] = { img: origen.img, clave: clave, w: w, h: h, ox: ancla.ox == null ? w / 2 : ancla.ox, oy: ancla.oy == null ? 0 : ancla.oy };
      podar(scene);
      return horneadas[clave];
    } catch (e) { return null; }
  }
  /**
   * LAS PIERNAS. `c` es la anatomía del dibujo quieto de esa dirección.
   *   lado:   la pierna de este lado, el muslo hacia delante y la espinilla colgando.
   *   abajo / arriba: una a cada costado, a `sep` px del centro (medio ancho del animal),
   *           con el muslo tumbado hasta ella. De frente, por dentro se corta donde tapa
   *           la cabeza del animal.
   */
  function piernas(scene, claveQuieto, c, vista, izq, sep) {
    var L = c.abajo - c.cadera, lw = c.px1 - c.px0, medio = c.px0 + Math.round(lw / 2);
    var kr = Math.max(2, Math.min(L - 3, Math.round(L * RODILLA)));
    if (L < 6 || lw < 6) return null;
    var img = c.img, sx = c.cx, sy = c.cy + c.cadera;
    if (vista === 'lado') {
      // Mirando a la derecha se ve la pierna de la izquierda del dibujo (la de este lado), y al revés.
      var x0 = izq ? medio : c.px0, pw = izq ? c.px1 - medio : medio - c.px0;
      return hornear(scene, 'gfj_' + claveQuieto + '_l' + (izq ? 'i' : 'd'), c, pw + kr + 2, L + 2, function (x) {
        for (var r = 0; r < L; r++) {
          var s = r < kr ? r : kr - Math.floor((r - kr) / 4);
          x.drawImage(img, sx + x0, sy + r, pw, 1, 1 + (izq ? kr - s : s), 1 + r, pw, 1);
        }
        perfilar(x, pw + kr + 2, L + 2, c.linea);
        return { ox: 1 + (izq ? kr : 0) + pw / 2, oy: 1 };
      });
    }
    var dentro = vista === 'abajo' ? 7 : 0, fuera = Math.max(dentro + 4, sep + 2), ancho = fuera * 2 + 2, cx = ancho / 2;
    return hornear(scene, 'gfj_' + claveQuieto + '_' + (vista === 'abajo' ? 'f' : 'e') + sep, c, ancho, L + 2, function (x) {
      [-1, 1].forEach(function (lado) {
        var p0 = lado < 0 ? c.px0 : medio, pw = lado < 0 ? medio - c.px0 : c.px1 - medio;
        var xFuera = lado < 0 ? cx - fuera : cx + fuera - pw;                 // donde cuelga la espinilla
        var bw = fuera - dentro, bx = lado < 0 ? cx - fuera : cx + dentro;    // el muslo, tumbado
        // La espinilla y el pie, tal cual, en el costado.
        x.drawImage(img, sx + p0, sy + kr, pw, L - kr, xFuera, 1 + kr, pw, L - kr);
        if (bw <= pw) {
          // Montura estrecha: el muslo es la parte de fuera de la pierna, sin estirar.
          x.drawImage(img, sx + (lado < 0 ? p0 : p0 + pw - bw), sy, bw, kr, bx, 1, bw, kr);
        } else {
          /* El filo de fuera tal cual y, hasta la cadera, UNA columna de tela repetida. Estirar la
             pierna entera arrastraba el hueco oscuro de entre las dos y dejaba una muesca en medio. */
          var canto = Math.min(3, pw - 2);
          if (lado < 0) {
            x.drawImage(img, sx + p0, sy, canto, kr, bx, 1, canto, kr);
            x.drawImage(img, sx + p0 + canto, sy, 1, kr, bx + canto, 1, bw - canto, kr);
          } else {
            x.drawImage(img, sx + p0 + pw - canto, sy, canto, kr, bx + bw - canto, 1, canto, kr);
            x.drawImage(img, sx + p0 + pw - canto - 1, sy, 1, kr, bx, 1, bw - canto, kr);
          }
        }
      });
      perfilar(x, ancho, L + 2, c.linea);
      return { ox: cx, oy: 1 };
    });
  }
  /**
   * EL TORSO PESCANDO. El fotograma de pescar entero, quitándole solo el hueco de las piernas:
   * la caña pasa a veces por debajo de la cadera y un recorte recto se la llevaría.
   */
  function torsoPesca(scene, clave, ct, cq) {
    var L = cq.abajo - cq.cadera, cad = Math.max(ct.arriba + 4, ct.abajo - L);
    var medio = ct.w / 2, mitad = (cq.px1 - cq.px0) / 2 + 1;
    var t = hornear(scene, 'gfj_t_' + clave, ct, ct.w, ct.h, function (x) {
      x.drawImage(ct.img, ct.cx, ct.cy, ct.w, ct.h, 0, 0, ct.w, ct.h);
      x.clearRect(Math.floor(medio - mitad), cad, Math.ceil(mitad * 2), ct.h - cad);
      return { ox: ct.w / 2, oy: 0 };
    });
    return t ? { tex: t.clave, cadera: cad } : null;
  }

  // ── El dibujo ─────────────────────────────────────────────────────────
  function sombraTextura(scene) {
    if (scene.textures.exists(SOMBRA)) return;
    var c = scene.textures.createCanvas(SOMBRA, 128, 40), x = c.getContext();
    x.fillStyle = 'rgba(16,26,18,0.34)';
    x.beginPath(); x.ellipse(64, 20, 62, 18, 0, 0, Math.PI * 2); x.fill();
    c.refresh();
  }
  function textura(scene, id, listo) {
    var def = defDe(id), tex = 'gfm_' + id;
    if (!def) return;
    var hecho = function () {
      if (!scene.sys || !scene.textures.exists(tex)) return;
      ['lado', 'abajo', 'arriba'].forEach(function (v) {
        var k = tex + '_' + v;
        // Las animaciones son del juego entero: se crean solo con su textura cargada.
        if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(tex, { start: FILAS[v] * 4, end: FILAS[v] * 4 + 3 }), frameRate: 9, repeat: -1 });
      });
      listo();
    };
    if (scene.textures.exists(tex)) { hecho(); return; }
    scene.load.spritesheet(tex, def.atlas + '?v=20261102a', { frameWidth: W, frameHeight: H });
    scene.load.once('filecomplete-spritesheet-' + tex, hecho);
    scene.load.start();
  }
  /* Pulsar al jinete es pulsar al personaje: el de verdad está invisible y un objeto con alfa 0
     no recibe clics. Sin esto, montado no se podía comer ni abrir el menú de otro jugador. */
  function pasarClics(pieza, fuente) {
    try {
      pieza.setInteractive({ useHandCursor: true });
      ['pointerdown', 'pointerup', 'pointerover', 'pointerout'].forEach(function (ev) {
        pieza.on(ev, function (a, b, c, d) { if (fuente && fuente.scene) fuente.emit(ev, a, b, c, d); });
      });
    } catch (e) {}
  }
  /** m: lo que se ve de una montura (la propia o la de otro jugador). */
  function crearVista(scene, id, fuente) {
    sombraTextura(scene);
    var m = { id: id, vivo: true, listo: false, spr: null, sombra: null, jinete: null, piernas: null, x0: fuente.x, y0: fuente.y,
      dir: null, prefijo: null, quieto: 1, alfaAntes: fuente.alpha, nombreDy: null, subida: 0, corte: -1, tinte: -1,
      info: { dx: 0, dy: 0, vista: 'lado', izq: false, montura: id } };
    textura(scene, id, function () {
      if (!m.vivo || !scene.sys || !fuente.scene) return;
      m.sombra = scene.add.image(fuente.x, fuente.y, SOMBRA).setDepth(2.5);
      m.spr = scene.add.sprite(fuente.x, fuente.y, 'gfm_' + id, 0).setOrigin(0.5, 1).setScale(ESCALA);
      m.piernas = scene.add.image(fuente.x, fuente.y, fuente.texture.key).setVisible(false);
      m.jinete = scene.add.sprite(fuente.x, fuente.y, fuente.texture.key, fuente.frame && fuente.frame.name);
      // Solo el jinete: el cuadro del animal es casi todo aire y se comería los clics del suelo.
      pasarClics(m.jinete, fuente);
      m.listo = true;
    });
    return m;
  }
  function soltarVista(m, fuente, nombre) {
    if (!m) return;
    m.vivo = false;
    [m.spr, m.sombra, m.jinete, m.piernas].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    try { if (fuente && fuente.scene) fuente.setAlpha(m.alfaAntes == null ? 1 : m.alfaAntes); } catch (e) {}
    try { if (fuente) fuente.__gfJinete = null; } catch (e) {}
    try { if (nombre && nombre.scene && m.nombreDy != null) nombre.y = nombre.y + m.subida; } catch (e) {}
  }
  function pintarVista(scene, m, fuente, dt, nombre) {
    if (!m.listo || !fuente || !fuente.scene || !fuente.texture) return;
    var def = defDe(m.id);
    var dx = fuente.x - m.x0, dy = fuente.y - m.y0;
    m.x0 = fuente.x; m.y0 = fuente.y;
    var anda = Math.hypot(dx, dy) > 0.15;
    if (anda) m.quieto = 0; else m.quieto += dt;

    /* HACIA DÓNDE MIRA lo dice el dibujo del personaje (andando, quieto o pescando): así el
       animal gira con él aunque no se mueva. Solo si el dibujo no lo dice manda el paso. */
    var clave = fuente.texture.key, dc = DIR_DE_CLAVE.exec(clave), dir = dc ? dc[1] : null;
    var pre = ANDANDO.exec(clave);
    if (pre) m.prefijo = pre[1];
    if (!dir && anda) dir = Math.abs(dx) >= Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : (dy > 0 ? 'down' : 'up');
    if (dir) m.dir = dir;
    dir = m.dir || 'right';
    var pesca = clave.indexOf('gfp_') === 0;
    /* Pescando hacia la cámara el animal se queda de costado: de frente, su cabeza taparía
       la caña y el jinete quedaría detrás. */
    if (dir === 'left' || dir === 'right') m.izq = dir === 'left';
    var vista = dir === 'up' ? 'arriba' : (dir === 'down' && !pesca ? 'abajo' : 'lado'), izq = !!m.izq;
    var dirPiernas = vista === 'lado' ? (izq ? 'left' : 'right') : dir;

    var visible = fuente.visible !== false;
    var esc = Math.abs(fuente.scaleY) || 2, escX = Math.abs(fuente.scaleX) || 2;
    var claveQuieto = (m.prefijo != null ? m.prefijo : 'player_') + dirPiernas + '_1';
    var cq = cuerpoDe(scene, claveQuieto);
    if (!cq) { claveQuieto = clave; cq = cuerpoDe(scene, clave); }
    var silla = def.silla[FILAS[vista]] || 36;
    var pie = cq ? fuente.y + (cq.abajo - fuente.originY * cq.h) * esc : fuente.y + 51;
    var desvio = vista === 'lado' ? -(SILLA_X[def.especie] != null ? SILLA_X[def.especie] : SILLA_X_BASE) * ESCALA * (izq ? -1 : 1) : 0;

    // El animal: el asiento queda justo debajo del jinete.
    var k = 'gfm_' + m.id + '_' + vista;
    m.spr.setVisible(visible).setPosition(fuente.x + desvio, pie + 6).setDepth(fuente.depth).setFlipX(vista === 'lado' && izq);
    if (m.quieto < 0.14) { if (!m.spr.anims.isPlaying || m.spr.anims.getName() !== k) m.spr.play(k, true); }
    else if (m.spr.anims.isPlaying || Number(m.spr.frame.name) !== FILAS[vista] * 4) { m.spr.anims.stop(); m.spr.setFrame(FILAS[vista] * 4); }
    m.sombra.setVisible(visible).setPosition(fuente.x + desvio, pie + 2);
    // Al trote el jinete bota con el paso (los cuadros impares).
    var bote = m.spr.anims.isPlaying && ((Number(m.spr.frame.name) - FILAS[vista] * 4) & 1) ? 2 : 0;
    var ySilla = pie + 6 - silla * ESCALA + ASIENTO + bote;

    var j = m.jinete, pz = m.piernas, yT;
    if (cq) {
      // El torso: quieto (nunca los fotogramas de andar) o pescando.
      var tex = claveQuieto, cad = cq.cadera, alto = cq.h, recortar = true;
      if (pesca) {
        var ct = cuerpoDe(scene, clave), tp = ct ? torsoPesca(scene, clave, ct, cq) : null;
        if (tp) { tex = tp.tex; cad = tp.cadera; alto = ct.h; recortar = false; }
      }
      if (j.texture.key !== tex || m.corte !== (recortar ? cad : -2)) {
        j.setTexture(tex);
        if (recortar) j.setCrop(0, 0, j.frame.realWidth, cad); else j.setCrop();
        m.corte = recortar ? cad : -2;
      }
      yT = ySilla - (cad - fuente.originY * alto) * esc;
      // Las piernas, a la medida de este animal.
      var sep = Math.max(4, Math.round(medioAncho(scene, m.id, vista) * ESCALA / escX));
      var hp = piernas(scene, claveQuieto, cq, vista, izq, sep);
      if (hp) {
        if (pz.texture.key !== hp.clave) pz.setTexture(hp.clave);
        pz.setOrigin(hp.ox / hp.w, hp.oy / hp.h).setScale(escX, esc).setVisible(visible)
          .setPosition(fuente.x + (vista === 'lado' ? (izq ? escX : -escX) : 0), ySilla).setDepth(fuente.depth + 0.3);
      } else pz.setVisible(false);
    } else {
      // Sin poder medir el dibujo (textura rara): el recorte de siempre, sin piernas.
      if (j.texture.key !== clave || m.corte !== -3) {
        j.setTexture(clave, fuente.frame.name);
        j.setCrop(0, 0, fuente.frame.realWidth, fuente.frame.realHeight * 0.74);
        m.corte = -3;
      }
      yT = ySilla - fuente.frame.realHeight * 0.24 * esc;
      pz.setVisible(false);
    }
    j.setOrigin(fuente.originX, fuente.originY).setVisible(visible).setFlipX(fuente.flipX).setScale(fuente.scaleX, fuente.scaleY).setPosition(fuente.x, yT);
    // De frente la cabeza del animal tapa al jinete; de lado y de espaldas, al revés.
    j.setDepth(fuente.depth + (vista === 'abajo' ? -0.5 : 0.4));
    // Lo que tiñe al personaje (el veneno, un golpe) tiñe a su jinete.
    var tinte = fuente.isTinted ? fuente.tintTopLeft : -1;
    if (tinte !== m.tinte) {
      m.tinte = tinte;
      [j, pz].forEach(function (o) { if (tinte < 0) o.clearTint(); else o.setTint(tinte); });
    }
    fuente.setAlpha(0);
    // Cuánto sube el cuerpo: lo leen el nombre, la caña y quien pinte algo sobre la cabeza.
    var subida = fuente.y - yT;
    m.info.dy = -subida; m.info.vista = vista; m.info.izq = izq;
    fuente.__gfJinete = m.info;
    if (nombre && nombre.scene) {
      if (m.nombreDy == null) m.nombreDy = nombre.y - fuente.y;
      m.subida = subida;
      nombre.y = fuente.y + m.nombreDy - subida;
    }
  }

  // ── Subir y bajar ─────────────────────────────────────────────────────
  function nombrePropio(scene) { return scene.usuariox || null; }
  function avisarSala(scene) {
    try { if (scene.socket && scene.socket.connected) scene.socket.emit('montura:cambio', { id: montado && sePuede(scene) ? elegida : '' }); } catch (e) {}
  }
  function bajar(st, sinGuardar) {
    if (st.yo) { soltarVista(st.yo, st.scene.player, nombrePropio(st.scene)); st.yo = null; }
    if (!sinGuardar) { montado = false; guardar(); avisarSala(st.scene); }
    pintarBoton(st);
  }
  function subir(st, id) {
    var scene = st.scene, def = defDe(id), p = scene.player;
    if (!def || !p || !p.scene) return;
    if (!sePuede(scene)) { aviso(scene, 'You cannot ride here.', 'info'); return; }
    if (window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)) { aviso(scene, 'You cannot ride while you are a ghost.', 'warning'); return; }
    if (p.__gfABordo || (window.GFBotes && window.GFBotes.aBordo && window.GFBotes.aBordo(scene))) { aviso(scene, 'You cannot ride on a boat.', 'info'); return; }
    if (st.yo) soltarVista(st.yo, p, nombrePropio(scene));
    elegida = id; montado = true; guardar();
    st.yo = crearVista(scene, id, p);
    st.resto = 0;
    avisarSala(scene);
    pintarBoton(st);
  }
  function alternar(st) {
    var scene = st.scene;
    if (st.yo) { bajar(st); return; }
    var mias = propias(scene);
    if (!mias.length) { aviso(scene, 'You have no mount. Buy one in the shop → Mounts.', 'info'); return; }
    subir(st, mias.indexOf(elegida) >= 0 ? elegida : mias[0]);
  }

  // La velocidad: un tanto por ciento más de lo ya andado este frame.
  function empujar(st, def) {
    var scene = st.scene, p = scene.player, m = st.yo;
    if (!m || !m.listo || def.velocidad <= 1) return;
    /* (2026-11-12) "Cuando salgo de la mina salgo teletransportado a otro lado que no es la
       puerta": saliendo por una puerta, la escena ya no mueve al jugador y deja guardado el
       sitio de llegada; este empujón seguía andando y escribiendo `posicionplayerx` con las
       coordenadas de la cueva, y el último guardado (la cola, al cerrar) las mandaba. */
    if (scene._cambiandoEscena) return;
    /* El impulso (C) y el empujón del viento (X) son otra cosa: no se multiplican. Se miraba
       por el tamaño del salto (> 40 px), pero el impulso avanza unos 20 por frame y pasaba
       por paso de caballo: montado salía un 40 % más largo y a trompicones. */
    var P = scene.__gfPoderes;
    if (P && (P.impulso || P.soplo)) return;
    var dx = p.x - m.x0, dy = p.y - m.y0, len = Math.hypot(dx, dy);
    // Un salto grande es un teletransporte.
    if (len < 0.2 || len > 40) return;
    var extra = len * (def.velocidad - 1), ux = dx / len, uy = dy / len;
    var libres = window.GFPoderes && window.GFPoderes._interno && window.GFPoderes._interno.piesLibres;
    if (!libres) return;
    var nx = p.x + ux * extra, ny = p.y + uy * extra;
    if (!libres(scene, nx, ny)) {
      if (ux && libres(scene, nx, p.y)) ny = p.y;
      else if (uy && libres(scene, p.x, ny)) nx = p.x;
      else return;
    }
    p.x = nx; p.y = ny;
    scene.previousPosition = { x: p.x, y: p.y };
    scene.posicionplayerx = p.x; scene.posicionplayery = p.y;
  }

  function tic(st, delta) {
    var scene = st.scene, p = scene.player, dt = Math.min(0.1, (delta || 16) / 1000);
    if (!p || !p.scene) return;
    if (st.yo) {
      var fuera = (window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)) || p.__gfABordo ||
        (window.GFBotes && window.GFBotes.aBordo && window.GFBotes.aBordo(scene));
      if (fuera) bajar(st);
    }
    if (st.yo) {
      // Se vendió o se soltó: no se monta lo que ya no se tiene.
      st.miraBolsa = (st.miraBolsa || 0) + dt;
      if (st.miraBolsa > 2) { st.miraBolsa = 0; if (scene._inventarioCargado !== false && propias(scene).indexOf(st.yo.id) < 0) bajar(st); }
    }
    if (st.yo) {
      empujar(st, defDe(st.yo.id));
      pintarVista(scene, st.yo, p, dt, nombrePropio(scene));
    }
    var otros = scene.otherPlayers;
    if (otros) for (var k in otros) {
      var o = otros[k];
      if (o && o._gfMontura && o.sprite) pintarVista(scene, o._gfMontura, o.sprite, dt, o.nameText);
    }
  }

  /** La vista (animal + jinete) de un sprite de personaje, el propio o el de otro; null a pie. */
  function vistaDe(scene, spr) {
    var st = scene && scene.__gfMonturas, m = null;
    if (!spr) return null;
    if (st && st.yo && scene.player === spr) m = st.yo;
    else if (scene && scene.otherPlayers) {
      for (var k in scene.otherPlayers) {
        var o = scene.otherPlayers[k];
        if (o && o.sprite === spr && o._gfMontura) { m = o._gfMontura; break; }
      }
    }
    return m && m.listo ? m : null;
  }

  /** Lo llama la escena al saber qué lleva otro jugador (sala, movimiento o 'montura:estado'). */
  function remoto(scene, p, id) {
    if (!p || !p.sprite) return;
    var quiere = defDe(id) && sePuede(scene) ? id : null;
    var ahora = p._gfMontura ? p._gfMontura.id : null;
    if (quiere === ahora) return;
    if (p._gfMontura) { soltarVista(p._gfMontura, p.sprite, p.nameText); p._gfMontura = null; }
    if (quiere) p._gfMontura = crearVista(scene, quiere, p.sprite);
  }
  function soltarRemoto(p) {
    if (p && p._gfMontura) { soltarVista(p._gfMontura, null, null); p._gfMontura = null; }
  }

  // ── El botón y el menú ────────────────────────────────────────────────
  var ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 20c1-5 3-8 7-10l1-5 3 3 4 1 1 3-3 1-2-1-1 3 1 5"/><path d="M12 5L9 3"/></svg>';
  function pintarBoton(st) {
    var b = st.boton;
    if (!b) return;
    var mias = propias(st.scene);
    var sitio = sePuede(st.scene);
    b.hidden = !mias.length || !sitio;
    b.classList.toggle('montado', !!st.yo);
    b.title = st.yo ? 'Get off ' + defDe(st.yo.id).name + ' (H)' : 'Ride a mount (H)';
    b.setAttribute('aria-label', b.title);
  }
  function cerrarMenu() {
    var m = document.getElementById('gf-montura-menu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', cerrarFuera, true);
  }
  function cerrarFuera(e) {
    var m = document.getElementById('gf-montura-menu');
    if (m && !m.contains(e.target)) cerrarMenu();
  }
  function alPulsarBoton(st) {
    var mias = propias(st.scene);
    if (document.getElementById('gf-montura-menu')) { cerrarMenu(); return; }
    if (mias.length < 2) { alternar(st); return; }
    var m = document.createElement('div');
    m.id = 'gf-montura-menu';
    m.className = 'gf-espada-menu';
    m.setAttribute('role', 'menu');
    var cab = document.createElement('div');
    cab.className = 'gf-espada-cab';
    cab.textContent = 'Mounts';
    m.appendChild(cab);
    mias.forEach(function (id) {
      var d = defDe(id);
      var o = document.createElement('button');
      o.type = 'button';
      o.className = 'gf-espada-opcion' + (st.yo && st.yo.id === id ? ' activa' : '');
      o.setAttribute('role', 'menuitem');
      var im = document.createElement('img'); im.src = d.src; im.alt = '';
      var tx = document.createElement('span'); tx.textContent = d.name;
      var dn = document.createElement('small'); dn.textContent = st.yo && st.yo.id === id ? 'Riding' : '+' + Math.round((d.velocidad - 1) * 100) + '% speed';
      o.appendChild(im); o.appendChild(tx); o.appendChild(dn);
      o.addEventListener('click', function (e) { e.stopPropagation(); cerrarMenu(); subir(st, id); });
      m.appendChild(o);
    });
    if (st.yo) {
      var q = document.createElement('button');
      q.type = 'button'; q.className = 'gf-espada-opcion quitar'; q.textContent = 'Get off';
      q.addEventListener('click', function (e) { e.stopPropagation(); cerrarMenu(); bajar(st); });
      m.appendChild(q);
    }
    document.body.appendChild(m);
    var r = st.boton.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left + r.width / 2 - m.offsetWidth / 2)) + 'px';
    m.style.top = Math.max(8, r.top - m.offsetHeight - 10) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', cerrarFuera, true); }, 0);
  }
  function crearBoton(st) {
    var panel = document.getElementById('gf-poderes-libres');
    if (!panel) return;
    if (!document.getElementById('gf-montura-css')) {
      var css = document.createElement('style');
      css.id = 'gf-montura-css';
      css.textContent = '#gf-poder-montar.montado{border-color:#8fe08f;box-shadow:0 0 0 2px rgba(143,224,143,.35);}#gf-poder-montar[hidden]{display:none;}';
      document.head.appendChild(css);
    }
    var b = document.getElementById('gf-poder-montar');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'gf-poder-montar';
      b.className = 'gf-poder';
      b.tabIndex = -1;
      b.hidden = true;
      b.innerHTML = ICONO + '<span class="gf-poder-tecla">H</span>';
      panel.appendChild(b);
    }
    st.boton = b;
    /* El botón no se queda con el foco: con él puesto, la barra espaciadora (el tajo) o Intro
       lo volvían a pulsar y te bajaban del animal en mitad de una pelea. */
    st.onBoton = function (e) { e.stopPropagation(); try { b.blur(); } catch (x) {} alPulsarBoton(st); };
    b.addEventListener('click', st.onBoton);
  }

  // ── Montar en cada escena ─────────────────────────────────────────────
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfMonturas || !v2()) return null;
    var st = { scene: scene, vivo: true, yo: null, boton: null, resto: 0, ultBoton: 0 };
    scene.__gfMonturas = st;
    crearBoton(st);
    st.onH = function (ev) { if ((ev && ev.repeat) || escribiendo()) return; alternar(st); };
    if (scene.input && scene.input.keyboard) scene.input.keyboard.on('keydown-H', st.onH);
    st.onPost = function (t, delta) {
      if (!st.vivo) return;
      try { tic(st, delta); } catch (e) { console.warn('[monturas]', e); }
      if (t - st.ultBoton > 700) {
        st.ultBoton = t;
        pintarBoton(st);
        // Se volvió a entrar al mapa (o acabó de cargar la bolsa) yendo montado.
        if (montado && !st.yo && !st.intentado && scene.player && scene._inventarioCargado !== false && sePuede(scene)) {
          var mias = propias(scene);
          if (mias.length) {
            st.intentado = true;
            if (mias.indexOf(elegida) >= 0) subir(st, elegida); else { montado = false; guardar(); }
          }
        }
      }
    };
    scene.events.on('postupdate', st.onPost);
    st.onEstado = function (d) {
      var o = d && scene.otherPlayers && scene.otherPlayers[d.id];
      if (o) remoto(scene, o, d.montura);
    };
    if (scene.socket && scene.socket.on) {
      st.sock = scene.socket;
      st.sock.on('montura:estado', st.onEstado);
    }
    st.onFin = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onFin);
    scene.events.once('destroy', st.onFin);
    return st;
  }
  function desmontar(scene) {
    var st = scene && scene.__gfMonturas;
    if (!st) return;
    st.vivo = false;
    scene.__gfMonturas = null;
    cerrarMenu();
    // Bajar del dibujo, no de la montura: en el mapa siguiente sigue montado.
    if (st.yo) { soltarVista(st.yo, scene.player, nombrePropio(scene)); st.yo = null; }
    scene.events.off('postupdate', st.onPost);
    scene.events.off('shutdown', st.onFin);
    scene.events.off('destroy', st.onFin);
    if (scene.input && scene.input.keyboard) scene.input.keyboard.off('keydown-H', st.onH);
    if (st.boton && st.onBoton) st.boton.removeEventListener('click', st.onBoton);
    if (st.sock) { try { st.sock.off('montura:estado', st.onEstado); } catch (e) {} }
    var otros = scene.otherPlayers;
    if (otros) for (var k in otros) soltarRemoto(otros[k]);
    st.scene = st.boton = st.sock = null;
  }

  window.GFMonturas = {
    montar: montar, desmontar: desmontar, remoto: remoto, soltarRemoto: soltarRemoto,
    activa: function () { return montado ? elegida : null; },
    alternar: function (scene) { var st = scene && scene.__gfMonturas; if (st) alternar(st); },
    /** Cuántos px sube el cuerpo de un personaje montado (0 a pie). Para lo que se pinta sobre él. */
    alza: function (spr) { var j = spr && spr.__gfJinete; return j ? -j.dy : 0; },
    /**
     * Copias sueltas de lo que se ve de un personaje montado (el animal, las piernas y el
     * torso), o null si va a pie. Para la estela del impulso: quien las pide las destruye.
     */
    copias: function (scene, spr) {
      var m = vistaDe(scene, spr);
      if (!m) return null;
      var out = [];
      [m.spr, m.piernas, m.jinete].forEach(function (o) {
        if (!o || !o.scene || !o.visible || !o.texture) return;
        var c = scene.add.image(o.x, o.y, o.texture.key, o.frame ? o.frame.name : undefined)
          .setOrigin(o.originX, o.originY).setScale(o.scaleX, o.scaleY).setFlipX(!!o.flipX);
        if (o === m.jinete && m.corte >= 0) c.setCrop(0, 0, c.frame.realWidth, m.corte);
        out.push(c);
      });
      return out.length ? out : null;
    },
    _interno: { estado: function (s) { return s && s.__gfMonturas; }, subir: subir, bajar: bajar, propias: propias,
      cuerpoDe: cuerpoDe, medioAncho: medioAncho, piernas: piernas, horneadas: horneadas }
  };
})();
