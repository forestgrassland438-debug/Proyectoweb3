/* ===========================================================================
 * EL MONTE DEL PUEBLO                                              (2026-10-10)
 *
 * Lo que pidió el jugador: "quiero monte en GameScene que, si le paso por
 * arriba, se abra mientras paso por él o que se mueva. Pero con buenos
 * gráficos."
 *
 * QUÉ ES
 *   Matorrales de hierba alta repartidos por el césped del pueblo. Cada mata
 *   son TRES manojos (izquierda, centro, derecha) que se doblan desde la base:
 *     · con el viento se mecen (más si GFClima dice que sopla);
 *     · al pasar cerca, la mata se aparta de quien pasa;
 *     · al pasar POR ENCIMA, se abre: los manojos de los lados se van hacia
 *       fuera y el del centro se aplasta, y al salir vuelven con un rebote.
 *   Vale con el jugador y con los demás jugadores que se ven.
 *
 * LOS GRÁFICOS
 *   Se dibujan aquí con canvas, píxel a píxel (sin PNG nuevos, sin suavizado:
 *   el juego es pixel art). Las hojas son trazos curvos con la paleta del
 *   césped del mapa, oscuras en la base y claras en la punta, con la luz de
 *   arriba a la izquierda como el resto. Sin flores ni semillas ni motas:
 *   nada de puntitos.
 *
 * DÓNDE
 *   Maps/monte.json, que escribe tools/generar-monte.py: solo sobre césped,
 *   lejos de casas, árboles, caminos y del agua, y en matorrales, no sueltas.
 *
 * RENDIMIENTO Y FUGAS
 *   Solo se animan las matas que se ven (se mira cada 300 ms). Las texturas
 *   son del juego y se hacen UNA vez. Al apagarse la escena se quita el
 *   oyente del update; las imágenes son de la escena y se van con ella.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFMonte && window.GFMonte.montar(this);
 *   (solo en el pueblo: la mina, la isla y las casas heredan de GameScene y
 *   aquí se descartan por su clave)
 * ======================================================================== */
(function () {
  'use strict';

  var VERSION = '20261010a';
  var RUTA = './Maps/monte.json?v=' + VERSION;
  var W = 28, H = 42;                       // cada manojo, en px del mundo
  var VARIANTES = 4;
  var PARTES = ['izq', 'cen', 'der'];
  // La paleta del césped del mapa (muestreada de la captura) más dos puntas.
  var PAL = ['#183420', '#22492a', '#2d6136', '#37733e', '#418546',
             '#4b974e', '#55a956', '#62b368', '#7cc46a', '#9bd47a'];
  var CERCA_X = 40, CERCA_Y = 20;           // dónde empieza a apartarse
  var DENTRO_X = 24, DENTRO_Y = 14;         // dónde se abre
  var MARGEN_VISTA = 80;

  var datos = null;                         // la lista de matas (una vez)
  var pidiendo = null;

  function log() {
    if (!window.GF_MONTE_DEBUG) return;
    var a = Array.prototype.slice.call(arguments); a.unshift('[monte]');
    console.log.apply(console, a);
  }

  function azar(s) {
    s = s >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ─────────────────────────────────────────────────────────── DIBUJO
  /** Un manojo: hojas de la base a la punta, de atrás (oscuras) a delante. */
  function dibujarManojo(ctx, variante, parte) {
    var r = azar(9100 + variante * 131 + PARTES.indexOf(parte) * 17);
    var lado = parte === 'izq' ? -1 : parte === 'der' ? 1 : 0;
    var hojas = parte === 'cen' ? 15 : 11;   // tupida: un monte, no cuatro hierbas
    ctx.clearRect(0, 0, W, H);
    var lista = [];
    for (var i = 0; i < hojas; i++) {
      var alto = H * (parte === 'cen' ? 0.62 + r() * 0.38 : 0.50 + r() * 0.36);
      var bx = W / 2 + (r() - 0.5) * (parte === 'cen' ? 9 : 7) - lado * 2;
      var abre = (lado !== 0 ? lado * (3 + r() * 8) : (r() - 0.5) * 10);
      lista.push({
        bx: bx, alto: alto, tipx: bx + abre, curva: (r() - 0.5) * 7 + lado * 2,
        // las de atrás, más oscuras; las de delante, más claras
        fondo: i < hojas * 0.45, ancha: r() > 0.35
      });
    }
    // Las más altas detrás.
    lista.sort(function (a, b) { return b.alto - a.alto; });
    lista.forEach(function (h) {
      var by = H - 1, ty = H - 1 - h.alto;
      var cx = (h.bx + h.tipx) / 2 + h.curva, cy = by - h.alto * 0.55;
      var pasos = Math.ceil(h.alto * 1.6);
      for (var k = 0; k <= pasos; k++) {
        var t = k / pasos, u = 1 - t;
        var x = u * u * h.bx + 2 * u * t * cx + t * t * h.tipx;
        var y = u * u * by + 2 * u * t * cy + t * t * ty;
        var ancho = t < 0.5 && h.ancha ? 2 : 1;
        var tono;
        if (t < 0.22) tono = h.fondo ? 0 : 2;
        else if (t < 0.55) tono = h.fondo ? 2 : 4;
        else if (t < 0.86) tono = h.fondo ? 3 : 5;
        else tono = h.fondo ? 4 : 7;
        var px = Math.round(x), py = Math.round(y);
        ctx.fillStyle = PAL[tono];
        ctx.fillRect(px, py, 1, 1);
        if (ancho === 2) {
          // El canto de la derecha, en sombra (la luz viene de arriba a la izquierda).
          ctx.fillStyle = PAL[Math.max(0, tono - 2)];
          ctx.fillRect(px + 1, py, 1, 1);
        }
        // Un brillo en la cara de la luz, cerca de la punta, en las de delante.
        if (!h.fondo && t > 0.6 && t < 0.92 && (h.tipx - h.bx) < 0) {
          ctx.fillStyle = PAL[9];
          ctx.fillRect(px - 1 >= 0 ? px - 1 : px, py, 1, 1);
        }
      }
    });
    // La base, apretada y en sombra: así nace del suelo y no "flota".
    for (var x = 4; x < W - 4; x++) {
      var d = Math.abs(x - W / 2) / (W / 2 - 4);
      var alto2 = Math.round(5 * (1 - d * d));
      for (var y = 0; y < alto2; y++) {
        ctx.fillStyle = PAL[y >= alto2 - 1 ? 2 : y >= alto2 - 2 ? 1 : 0];
        ctx.fillRect(x, H - 1 - y, 1, 1);
      }
    }
  }

  /** La sombra en el suelo: una elipse lisa, de canto suave. */
  function dibujarSombra(ctx, w, h) {
    // Se pinta un CÍRCULO en un lienzo aplastado: sale la elipse. El
    // degradado se crea ya con la escala puesta, o no caería en su sitio.
    var cy = (h / 2) * (w / h);
    ctx.save();
    ctx.scale(1, h / w);
    var g = ctx.createRadialGradient(w / 2, cy, 1, w / 2, cy, w / 2);
    g.addColorStop(0, 'rgba(10,30,14,0.42)');
    g.addColorStop(0.7, 'rgba(10,30,14,0.22)');
    g.addColorStop(1, 'rgba(10,30,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, cy, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function texturas(scene) {
    var ok = true;
    for (var v = 0; v < VARIANTES; v++) {
      PARTES.forEach(function (p) {
        var k = 'gfm_' + p + '_' + v;
        if (scene.textures.exists(k)) return;
        try {
          var c = scene.textures.createCanvas(k, W, H);
          dibujarManojo(c.getContext(), v, p);
          c.refresh();
          c.setFilter(Phaser.Textures.FilterMode.NEAREST);
        } catch (e) { ok = false; }
      });
    }
    if (!scene.textures.exists('gfm_sombra')) {
      try {
        var s = scene.textures.createCanvas('gfm_sombra', 40, 12);
        dibujarSombra(s.getContext(), 40, 12);
        s.refresh();
      } catch (e) { ok = false; }
    }
    return ok;
  }

  // ─────────────────────────────────────────────────────────── DATOS
  function cargarDatos() {
    if (datos) return Promise.resolve(datos);
    if (pidiendo) return pidiendo;
    pidiendo = fetch(RUTA, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) {
      datos = (d && Array.isArray(d.matas)) ? d.matas : [];
      return datos;
    }).catch(function (e) {
      log('sin monte:', e && e.message);
      pidiendo = null;
      return [];
    });
    return pidiendo;
  }

  // ─────────────────────────────────────────────────────────── ESCENA
  function crearMatas(st, lista) {
    var scene = st.scene;
    lista.forEach(function (m, i) {
      var x = m[0], y = m[1], v = (m[2] | 0) % VARIANTES, esc = Number(m[3]) || 1;
      var flip = (i % 2) === 1;
      var sombra = scene.add.image(x, y - 1, 'gfm_sombra').setDepth(2.5).setScale(esc).setAlpha(0.9);
      var partes = PARTES.map(function (p) {
        return scene.add.image(x + (p === 'izq' ? -7 : p === 'der' ? 7 : 0) * esc, y, 'gfm_' + p + '_' + v)
          .setOrigin(0.5, 1).setScale(esc).setFlipX(flip)
          // Ordenadas por la base, como todo lo que pisa el suelo: si el
          // jugador está DETRÁS (más arriba), la hierba le tapa las piernas.
          .setDepth(y + (p === 'cen' ? 0.2 : 0));
      });
      st.matas.push({
        x: x, y: y, esc: esc, fase: (i * 2.399) % 6.283, sombra: sombra,
        izq: partes[0], cen: partes[1], der: partes[2],
        abre: 0, vAbre: 0, emp: 0, vEmp: 0, visible: true
      });
    });
    log('matas:', st.matas.length);
  }

  /** Quien pisa: el jugador y los demás jugadores visibles (sus pies). */
  function caminantes(scene, out) {
    out.length = 0;
    var p = scene.player;
    if (p && p.active) {
      var pies = (window.GFProfundidad && window.GFProfundidad.piesDe)
        ? window.GFProfundidad.piesDe(scene, p) : p.y + (p.displayHeight || 64) * 0.45;
      out.push(p.x, pies);
    }
    var otros = scene.otherPlayers;
    if (otros) {
      for (var id in otros) {
        var o = otros[id];
        var s = o && o.sprite;
        if (s && s.active && s.visible) out.push(s.x, s.y + (s.displayHeight || 64) * 0.45);
      }
    }
    return out;
  }

  function vientoAhora() {
    try {
      var c = window.GFClima && window.GFClima.ahora && window.GFClima.ahora();
      if (c) return Math.max(Number(c.viento) || 0, (Number(c.tormenta) || 0) * 1.2);
    } catch (e) {}
    return 0;
  }

  function actualizar(st, ahora) {
    var scene = st.scene;
    var cam = scene.cameras && scene.cameras.main;
    if (!cam) return;

    // Lo visible, cada 300 ms (no cada fotograma).
    if (ahora - st.ultimaVista > 300) {
      st.ultimaVista = ahora;
      var v = cam.worldView;
      var x0 = v.x - MARGEN_VISTA, x1 = v.right + MARGEN_VISTA;
      var y0 = v.y - MARGEN_VISTA, y1 = v.bottom + MARGEN_VISTA + H;
      st.vivas.length = 0;
      for (var i = 0; i < st.matas.length; i++) {
        var m = st.matas[i];
        var ve = m.x > x0 && m.x < x1 && m.y > y0 && m.y < y1;
        if (ve !== m.visible) {
          m.visible = ve;
          m.izq.setVisible(ve); m.cen.setVisible(ve); m.der.setVisible(ve); m.sombra.setVisible(ve);
        }
        if (ve) st.vivas.push(m);
      }
      st.viento = vientoAhora();
    }
    if (!st.vivas.length) return;

    var t = ahora / 1000;
    var amp = 0.035 + 0.11 * st.viento;
    var quien = caminantes(scene, st.pies);
    for (var j = 0; j < st.vivas.length; j++) {
      var mt = st.vivas[j];
      var objAbre = 0, objEmp = 0;
      for (var q = 0; q < quien.length; q += 2) {
        var dx = mt.x - quien[q], dy = mt.y - quien[q + 1];
        var cx = CERCA_X * mt.esc, cy = CERCA_Y * mt.esc;
        if (dx > -cx && dx < cx && dy > -cy && dy < cy) {
          var k = 1 - Math.abs(dx) / cx;
          var lado = dx >= 0 ? 1 : -1;
          if (Math.abs(dx) < 2) lado = Math.sin(mt.fase) >= 0 ? 1 : -1;
          if (Math.abs(objEmp) < k * 0.62) objEmp = lado * k * 0.62;
          if (Math.abs(dx) < DENTRO_X * mt.esc && Math.abs(dy) < DENTRO_Y * mt.esc) {
            objAbre = Math.max(objAbre, 1 - Math.abs(dx) / (DENTRO_X * mt.esc));
          }
        }
      }
      // Muelles: se abre deprisa y vuelve despacio, con un rebote.
      mt.vAbre += (objAbre - mt.abre) * (objAbre > mt.abre ? 0.30 : 0.10);
      mt.vAbre *= 0.72;
      mt.abre += mt.vAbre;
      mt.vEmp += (objEmp - mt.emp) * 0.16;
      mt.vEmp *= 0.80;
      mt.emp += mt.vEmp;

      var mece = Math.sin(t * 1.7 + mt.fase) * amp + Math.sin(t * 3.1 + mt.fase * 1.7) * amp * 0.35;
      mt.izq.rotation = mece + mt.emp * 0.55 - mt.abre * 0.62;
      mt.der.rotation = mece + mt.emp * 0.55 + mt.abre * 0.62;
      mt.cen.rotation = mece * 1.15 + mt.emp * 0.75;
      mt.cen.scaleY = mt.esc * (1 - Math.max(0, mt.abre) * 0.42);
    }
  }

  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfMonte) return;
    var clave = scene.sys && scene.sys.settings && scene.sys.settings.key;
    if (clave !== 'GameScene') return;          // solo el pueblo
    var st = { scene: scene, matas: [], vivas: [], pies: [], ultimaVista: 0, viento: 0, vivo: true };
    scene.__gfMonte = st;
    st.onUpdate = function (time) { if (st.vivo) actualizar(st, time); };
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    cargarDatos().then(function (lista) {
      // La escena pudo apagarse mientras llegaba el JSON.
      if (!st.vivo || scene.__gfMonte !== st || !lista.length) return;
      if (!texturas(scene)) { log('sin texturas'); return; }
      crearMatas(st, lista);
      scene.events.on('update', st.onUpdate);
    });
  }

  function desmontar(scene) {
    var st = scene && scene.__gfMonte;
    if (!st) return;
    st.vivo = false;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    // Las imágenes son de la escena; se destruyen por si la escena sigue viva
    // (un desmontar a mano).
    st.matas.forEach(function (m) {
      [m.izq, m.cen, m.der, m.sombra].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.matas.length = 0;
    st.vivas.length = 0;
    scene.__gfMonte = null;
  }

  window.GFMonte = {
    montar: montar,
    desmontar: desmontar,
    _interno: { dibujarManojo: dibujarManojo, estado: function (s) { return s && s.__gfMonte; } }
  };
})();
