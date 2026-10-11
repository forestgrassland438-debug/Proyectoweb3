/* ===========================================================================
 * LA PESCA EN EL RÍO DEL PUEBLO                                    (2026-10-05)
 *
 * QUÉ HACE
 *   Con la caña (`cana_pescar`) en la bolsa y los pies en la orilla del río,
 *   aparece el botón "Fish" (y la tecla F). Al pulsarlo el personaje lanza
 *   con su animación de pescar, el corcho cae al agua y flota; cuando pica se
 *   hunde, salpica y sale un "!" sobre la cabeza: hay que recoger a tiempo
 *   (botón o F). Si se recoge bien, el pez salta del agua al jugador y entra
 *   en la bolsa.
 *
 * QUIÉN DECIDE
 *   El SERVIDOR (/api/pesca/lanzar y /api/pesca/recoger): comprueba la caña
 *   en la cadena, que se está en la orilla, cuándo pica y si se recogió a
 *   tiempo, y acuña el pez (las tablas pes1..3 solo las acuña él). Aquí solo
 *   se pinta y se avisa.
 *
 * LA ORILLA
 *   Se lee la capa de casillas del mapa (que no se dibuja: el suelo son los
 *   trozos de bin/recortadas, pero los datos están) y, del tileset, qué
 *   casillas son agua: las que tienen el píxel azul dominante. Lo mismo que
 *   hace el servidor con su máscara del río.
 *
 * ANIMACIÓN
 *   Los fotogramas `pescar_1..6` de cada personaje Soulbound (los generó
 *   tools del pack newpro, ver Game/newpro/LEEME.md): 1-4 el lance, 5-6 la
 *   espera en bucle. Se cargan la primera vez que se pesca. Mientras se pesca
 *   `scene._accionPersonaje = 'pesca'` aparta la animación de andar del
 *   update de GameScene.
 *
 * LA LUCHA (2026-10-05)
 *   Al picar, "Reel!" ya no recoge sin más: ENGANCHA (/api/pesca/enganchar,
 *   que dice qué pez es y cómo pelea) y sale el panel de la lucha. Una pista
 *   vertical con el CUADRO DEL PEZ, que se mueve solo, y el ANZUELO, que es
 *   tuyo: manteniendo pulsado (ESPACIO, F, el ratón o el dedo en el panel)
 *   sube; soltando, baja. Mientras el anzuelo esté DENTRO del cuadro del pez
 *   la barra se llena; fuera, se vacía. Llena: lo sacas. Vacía: se suelta.
 *   La dificultad es el pez: su cuadro es más pequeño, va más rápido, cambia
 *   de idea más a menudo, encoge al final y da tirones (PESCA_DIFICULTAD en
 *   server2.js). El servidor solo acuña si la pelea duró lo que se tarda de
 *   verdad en llenar la barra.
 *
 * EL LANCE CON FUERZA (2026-10-05)
 *   "Si presiono más tiempo la F se determine la fuerza de lanzamiento." Al
 *   pulsar F (o el botón) sale una barra sobre la cabeza que se va llenando;
 *   al SOLTAR se lanza, y el corcho llega tanto más lejos cuanto más llena
 *   estaba (de LANCE_MIN a LANCE_MAX px). Mientras se carga, una marca en el
 *   agua enseña dónde va a caer. Si el agua queda más lejos de lo que da la
 *   fuerza, el anzuelo cae en la orilla y hay que cargar más.
 *
 * MOVERSE PESCANDO
 *   Antes, dar un paso cortaba la pesca. Ahora se puede andar dentro de un
 *   círculo alrededor de donde se lanzó (RADIO_MOVERSE, se ve en el suelo y se
 *   pone naranja al acercarse al borde); salir de él recoge el sedal.
 *
 * EL BOTÓN DURANTE LA LUCHA
 *   El botón de pescar se convierte en el de MANTENER: pulsado sube el
 *   anzuelo, suelto baja. Es lo cómodo en el teléfono (además del panel).
 *
 * EL SEDAL
 *   Sale de la PUNTA DE LA CAÑA del fotograma que se ve: la posición de la
 *   punta en cada fotograma la apunta tools/generar-pesca-anim.py (PUNTAS).
 *   Los fotogramas ya no traen sedal ni corcho pintados: salían dos.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFPesca && window.GFPesca.montar(this);
 * ======================================================================== */
(function () {
  'use strict';

  var CASILLA = 16;
  var RADIO_ORILLA = 40;            // px desde los pies hasta el agua
  var ALCANCE = 150;                // hasta dónde se busca agua si no se mira al río
  var LANCE_MIN = 36;               // lance con la barra vacía (un toque)
  var LANCE_MAX = 210;              // lance con la barra llena
  var CARGA_MS = 1100;              // lo que tarda en llenarse la barra
  var RADIO_MOVERSE = 72;           // cuánto se puede andar pescando
  var DIRV = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  var NOMBRES = { pes1: 'Brown Trout', pes2: 'Common Carp', pes3: 'Golden Trout',
                  // Los de 2026-10-10 (pes7 y pes8, venenosos: ver el veneno, abajo).
                  pes4: 'River Perch', pes5: 'Bream', pes6: 'Sturgeon', pes7: 'Poison Eel', pes8: 'Lionfish' };
  var PECES = ['pes1', 'pes2', 'pes3', 'pes4', 'pes5', 'pes6', 'pes7', 'pes8'];
  var DIRS = { left: 'izquierda', right: 'derecha', up: 'arriba', down: 'abajo' };
  var V_FOTOS = '?v=20261006a';   // fotogramas nuevos de frente y de espaldas
  /* Dónde está la punta de la caña en cada fotograma (px desde el centro del
     dibujo, a escala 1). Lo escribe tools/generar-pesca-anim.py en
     Game/newpro/pesca_anim/pesca_anim.json. */
  var PUNTAS = {
    personaje1: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje2: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] },
    personaje3: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje4: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] },
    personaje5: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje6: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] },
    personaje7: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje8: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje9: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] },
    personaje10: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje11: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] },
    personaje12: { abajo: [[8.5, -11.9], [-13.3, -13.0], [14.9, -1.4], [9.1, 21.4], [9.9, 21.9], [9.3, 22.2]], arriba: [[14.5, -14.6], [-15.3, -16.2], [12.7, -15.6], [17.0, -12.8], [18.4, -10.9], [19.1, -10.4]], derecha: [[13.2, -10.4], [-12.9, -7.6], [22.4, -4.7], [26.1, 7.0], [20.0, -3.4], [20.7, -2.5]], izquierda: [[-14.2, -10.4], [11.9, -7.6], [-23.4, -4.7], [-27.1, 7.0], [-21.0, -3.4], [-21.7, -2.5]] },
    personaje13: { abajo: [[8.0, -11.9], [-13.8, -13.0], [14.4, -1.4], [8.6, 21.4], [9.4, 21.9], [8.8, 22.2]], arriba: [[14.0, -14.6], [-15.8, -16.2], [12.2, -15.6], [16.5, -12.8], [17.9, -10.9], [18.6, -10.4]], derecha: [[13.7, -10.4], [-12.4, -7.6], [22.9, -4.7], [25.6, 7.0], [20.5, -3.4], [21.2, -2.5]], izquierda: [[-14.7, -10.4], [11.4, -7.6], [-23.9, -4.7], [-26.6, 7.0], [-21.5, -3.4], [-22.2, -2.5]] }
  };
  // La física del anzuelo y la barra (afinadas a la vez que PESCA_DIFICULTAD).
  // `amort`: lo que queda de la velocidad al cabo de un segundo.
  var LUCHA = { anzuelo: 0.13, sube: 2.6, baja: 2.0, amort: 0.08, gana: 0.30, pierde: 0.20, inicio: 0.35, minMs: 2250 };

  var _ratioPorGid = null;          // gid -> 0 seco, 1 orilla, 2 agua llena

  function log() {
    if (!window.GF_PESCA_DEBUG) return;
    var a = Array.prototype.slice.call(arguments); a.unshift('[pesca]');
    console.log.apply(console, a);
  }

  function aviso(scene, texto, tipo) {
    try {
      if (scene && scene.notifications && scene.notifications.show) { scene.notifications.show(texto, tipo || 'info'); return; }
    } catch (e) {}
    console.log('[pesca]', texto);
  }

  function api(scene, ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    var csrf = (document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/) || [])[1];
    return fetch(String(scene.serverBase || '').replace(/\/$/, '') + ruta, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf) : '' },
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, datos: d }; })
        .catch(function () { return { ok: r.ok, status: r.status, datos: null }; });
    });
  }

  // ─────────────────────────────────────────────────────────────── EL AGUA
  function clasificarTileset(scene) {
    if (_ratioPorGid) return _ratioPorGid;
    var tex = scene.textures.get('tiles');
    var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    if (!img || !img.width) return null;
    var lec = document.createElement('canvas');
    lec.width = img.width; lec.height = img.height;
    var c = lec.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    var d = c.getImageData(0, 0, img.width, img.height).data;
    var cols = Math.floor(img.width / CASILLA), filas = Math.floor(img.height / CASILLA);
    var out = new Uint8Array(cols * filas + 1);
    for (var t = 0; t < cols * filas; t++) {
      var tx = (t % cols) * CASILLA, ty = Math.floor(t / cols) * CASILLA, n = 0;
      for (var y = 0; y < CASILLA; y++) {
        for (var x = 0; x < CASILLA; x++) {
          var o = ((ty + y) * img.width + tx + x) * 4;
          var r = d[o], g = d[o + 1], b = d[o + 2];
          if (d[o + 3] > 40 && b > r + 40 && b > g + 10 && b > 110) n++;
        }
      }
      var ratio = n / (CASILLA * CASILLA);
      out[t + 1] = ratio >= 0.9 ? 2 : (ratio >= 0.35 ? 1 : 0);
    }
    lec.width = lec.height = 0;
    _ratioPorGid = out;
    return out;
  }

  function mapaDeAgua(scene) {
    if (scene.__gfPescaAgua) return scene.__gfPescaAgua;
    var mapa = scene.map;
    var capa = mapa && mapa.getLayer ? mapa.getLayer('mapa_principal') : null;
    var ratio = clasificarTileset(scene);
    if (!capa || !capa.data || !ratio) return null;
    var w = capa.width, h = capa.height, m = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      var fila = capa.data[y];
      for (var x = 0; x < w; x++) {
        var t = fila[x], i = t ? t.index : -1;
        if (i > 0 && i < ratio.length) m[y * w + x] = ratio[i];
      }
    }
    scene.__gfPescaAgua = { w: w, h: h, m: m };
    return scene.__gfPescaAgua;
  }

  function celda(agua, px, py) {
    var x = Math.floor(px / CASILLA), y = Math.floor(py / CASILLA);
    if (x < 0 || y < 0 || x >= agua.w || y >= agua.h) return 0;
    return agua.m[y * agua.w + x];
  }

  function enLaOrilla(agua, px, py) {
    for (var dy = -RADIO_ORILLA; dy <= RADIO_ORILLA; dy += 8) {
      for (var dx = -RADIO_ORILLA; dx <= RADIO_ORILLA; dx += 8) {
        if (dx * dx + dy * dy > RADIO_ORILLA * RADIO_ORILLA) continue;
        if (celda(agua, px + dx, py + dy) >= 1) return true;
      }
    }
    return false;
  }

  /**
   * Dónde cae el corcho con un lance de `d` px: en el rayo hacia donde mira,
   * el punto de agua llena más lejano que no pase de `d`. Si en ese rayo el
   * agua empieza más lejos de lo que da la fuerza, `{ corto: true }`. Si no
   * se mira al agua, se gira hacia la más cercana y se hace la misma cuenta.
   */
  function destinoDelLance(agua, px, py, dir, d) {
    function enRayo(dd) {
      var v = DIRV[dd] || DIRV.right, mejor = null, masLejos = false;
      for (var k = 24; k <= LANCE_MAX + 24; k += 6) {
        var x = px + v[0] * k, y = py + v[1] * k;
        if (celda(agua, x, y) !== 2) continue;
        if (k <= d + 12) mejor = { x: x, y: y };
        else if (!mejor) masLejos = true;
      }
      return mejor ? { punto: mejor, dir: dd } : (masLejos ? { corto: true, dir: dd } : null);
    }
    var r = enRayo(dir);
    if (r) return r;
    var otro = puntoDelCorcho(agua, px, py, dir);
    if (!otro) return null;
    var vx = otro.x - px, vy = otro.y - py;
    var nueva = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
    return enRayo(nueva) || { punto: otro, dir: nueva };
  }

  /** Dónde cae el corcho: agua llena hacia donde mira, o la más cercana. */
  function puntoDelCorcho(agua, px, py, dir) {
    var v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] || [1, 0];
    for (var d = 24; d <= ALCANCE; d += 6) {
      var x = px + v[0] * d, y = py + v[1] * d;
      if (celda(agua, x, y) === 2 && celda(agua, x + v[0] * 10, y + v[1] * 10) >= 1) return { x: x + v[0] * 8, y: y + v[1] * 8 };
    }
    var mejor = null, mejorD = 1e9;
    for (var yy = -ALCANCE; yy <= ALCANCE; yy += 8) {
      for (var xx = -ALCANCE; xx <= ALCANCE; xx += 8) {
        var dd = xx * xx + yy * yy;
        if (dd < mejorD && dd > 400 && celda(agua, px + xx, py + yy) === 2) { mejorD = dd; mejor = { x: px + xx, y: py + yy }; }
      }
    }
    return mejor;
  }

  // ─────────────────────────────────────────────────────────── TEXTURAS
  function texturas(scene) {
    if (!scene.textures.exists('gfp_corcho')) {
      var c = scene.textures.createCanvas('gfp_corcho', 8, 12);
      var x = c.getContext();
      x.fillStyle = '#3a1f12'; x.fillRect(3, 0, 2, 3);               // varilla
      x.fillStyle = '#1b0f0a'; x.beginPath(); x.ellipse(4, 7, 3.6, 4.4, 0, 0, 6.284); x.fill();
      x.fillStyle = '#e8352c'; x.beginPath(); x.ellipse(4, 6, 2.6, 2.6, 0, 3.14, 6.284); x.fill();
      x.fillRect(1.4, 5.6, 5.2, 1.4);
      x.fillStyle = '#f4efe6'; x.beginPath(); x.ellipse(4, 8.4, 2.6, 2.4, 0, 0, 3.14); x.fill();
      x.fillStyle = '#ffffff'; x.fillRect(2, 4, 1, 1);
      c.refresh();
    }
    if (!scene.textures.exists('gfp_onda')) {
      var c2 = scene.textures.createCanvas('gfp_onda', 40, 16);
      var y = c2.getContext();
      y.strokeStyle = 'rgba(235,248,255,0.95)'; y.lineWidth = 1.5;
      y.beginPath(); y.ellipse(20, 8, 18, 6.5, 0, 0, 6.284); y.stroke();
      c2.refresh();
    }
    if (!scene.textures.exists('gfp_gota')) {
      var c3 = scene.textures.createCanvas('gfp_gota', 4, 4);
      var z = c3.getContext(); z.fillStyle = 'rgba(220,242,255,1)'; z.fillRect(1, 0, 2, 4); z.fillRect(0, 1, 4, 2);
      c3.refresh();
    }
  }

  function personaje() {
    try { return (window.GFSoulbound && window.GFSoulbound.actual && window.GFSoulbound.actual()) || 'personaje1'; }
    catch (e) { return 'personaje1'; }
  }

  function clave(per, dir, n) { return 'gfp_' + per + '_' + dir + '_' + n; }

  /** Carga los fotogramas de pescar del personaje (y los peces). Nunca falla.
      `quien` es otro personaje (el de un jugador remoto); sin él, el mío. */
  function cargarFotogramas(scene, quien, sinPeces) {
    var per = quien || personaje();
    var faltan = [];
    Object.keys(DIRS).forEach(function (d) {
      for (var n = 1; n <= 6; n++) {
        var k = clave(per, d, n);
        if (!scene.textures.exists(k)) faltan.push([k, './Game/Sprites/Soulbound/' + per + '/' + DIRS[d] + '/pescar_' + n + '.png' + V_FOTOS]);
      }
    });
    if (!sinPeces) PECES.forEach(function (p) {
      if (!scene.textures.exists('gfp_' + p)) faltan.push(['gfp_' + p, './Game/Objetos/pesca/' + p + '.png']);
    });
    if (!faltan.length) return Promise.resolve(true);
    return new Promise(function (ok) {
      var listo = false;
      var reloj = null;
      var fin = function (exito) {
        if (listo) return;
        listo = true; clearTimeout(reloj);
        scene.load.off('complete', completo);
        scene.events.off('shutdown', cancelar); scene.events.off('destroy', cancelar);
        ok(exito);
      };
      var completo = function () { fin(faltan.every(function (f) { return scene.textures.exists(f[0]); })); };
      var cancelar = function () { fin(false); };
      faltan.forEach(function (f) { scene.load.image(f[0], f[1], { timeout: 6000 }); });
      scene.load.once('complete', completo);
      scene.events.once('shutdown', cancelar); scene.events.once('destroy', cancelar);
      reloj = setTimeout(cancelar, 6000);
      try { scene.load.start(); } catch (e) { cancelar(); }
    });
  }

  // ───────────────────────────────────────────────────────────── EL BOTÓN
  /* EL BOTÓN: se MANTIENE. Pulsado carga el lance (y al soltar se lanza), al
     picar engancha, y en la lucha sube el anzuelo mientras se tiene pulsado. */
  function boton(st) {
    var b = document.getElementById('gf-pesca-btn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'gf-pesca-btn';
      b.type = 'button';
      b.className = 'gf-pesca-btn';
      b.innerHTML = '<img src="./Game/Objetos/pesca/cana_pescar.png" alt="" draggable="false"><span class="gf-pesca-txt">Fish</span><kbd>F</kbd>';
      document.body.appendChild(b);
    }
    ['_gfp', '_gfpAbajo', '_gfpArriba'].forEach(function (k) {
      if (!b[k]) return;
      b.removeEventListener(k === '_gfp' ? 'click' : (k === '_gfpAbajo' ? 'pointerdown' : 'pointerup'), b[k]);
      if (k === '_gfpArriba') { b.removeEventListener('pointercancel', b[k]); b.removeEventListener('lostpointercapture', b[k]); }
    });
    // El teclado sobre el botón (Intro/Espacio con el foco): un lance a media fuerza.
    b._gfp = function (e) {
      e.stopPropagation(); e.preventDefault();
      if (e.detail !== 0) return;               // el ratón y el dedo van por pointer
      if (st.fase === 'nada') lanzar(st, 0.5); else accion(st);
    };
    b._gfpAbajo = function (e) {
      e.stopPropagation(); e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add('apretado');
      botonAbajo(st);
    };
    b._gfpArriba = function (e) {
      if (e) e.stopPropagation();
      b.classList.remove('apretado');
      botonArriba(st);
    };
    b.addEventListener('click', b._gfp);
    b.addEventListener('pointerdown', b._gfpAbajo);
    b.addEventListener('pointerup', b._gfpArriba);
    b.addEventListener('pointercancel', b._gfpArriba);
    b.addEventListener('lostpointercapture', b._gfpArriba);
    return b;
  }

  function botonAbajo(st) {
    if (st.fase === 'nada') return empezarCarga(st);
    if (st.fase === 'pica' || st.fase === 'esperando') return enganchar(st);
    if (st.fase === 'luchando' && st.lucha) st.lucha.pulsado = true;
  }

  function botonArriba(st) {
    if (st.fase === 'cargando') return soltarCarga(st);
    if (st.fase === 'luchando' && st.lucha) st.lucha.pulsado = false;
  }

  function pintarBoton(st) {
    var b = st.boton;
    if (!b) return;
    var txt = b.querySelector('.gf-pesca-txt');
    var kbd = b.querySelector('kbd');
    var ver = st.fase !== 'nada' || st.puede;
    b.hidden = !ver;
    b.classList.toggle('pica', st.fase === 'pica');
    b.classList.toggle('esperando', st.fase === 'lanzando' || st.fase === 'esperando');
    b.classList.toggle('cargando', st.fase === 'cargando');
    var textos = { nada: 'Fish', cargando: 'Release to cast', pica: 'Reel!', luchando: 'HOLD' };
    if (txt) txt.textContent = textos[st.fase] || 'Wait…';
    if (kbd) kbd.textContent = st.fase === 'luchando' ? 'SPACE' : (st.fase === 'nada' ? 'Hold F' : 'F');
    b.classList.toggle('luchando', st.fase === 'luchando');
    if (st.fase !== 'luchando' && st.fase !== 'cargando') b.classList.remove('apretado');
  }

  // ─────────────────────────────────────────────── LA CARGA DEL LANCE
  function empezarCarga(st) {
    var scene = st.scene;
    if (!st.puede || scene._accionPersonaje || st.fase !== 'nada') return;
    st.fase = 'cargando';
    st.cargaT0 = scene.time.now;
    texturas(scene);
    if (!st.barra) st.barra = scene.add.graphics().setDepth(9600);
    if (!st.marca) st.marca = scene.add.image(0, 0, 'gfp_onda').setDepth(9599).setVisible(false);
    pintarBoton(st);
  }

  function fuerzaDeCarga(st) {
    return Math.max(0, Math.min(1, (st.scene.time.now - (st.cargaT0 || 0)) / CARGA_MS));
  }

  function limpiarCarga(st) {
    if (st.barra) { try { st.barra.destroy(); } catch (e) {} st.barra = null; }
    if (st.marca) { try { st.marca.destroy(); } catch (e) {} st.marca = null; }
  }

  function soltarCarga(st) {
    if (st.fase !== 'cargando') return;
    var f = fuerzaDeCarga(st);
    limpiarCarga(st);
    st.fase = 'nada';
    lanzar(st, f);
  }

  /** La barra sobre la cabeza y la marca en el agua de dónde va a caer. */
  function pintarCarga(st) {
    var scene = st.scene, p = scene.player;
    if (!st.barra || !p) return;
    var f = fuerzaDeCarga(st);
    var g = st.barra, w = 56, h = 8, x = p.x - w / 2, y = p.y - 92;
    g.clear();
    g.fillStyle(0x000000, 0.65); g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);
    var color = f < 0.5 ? 0x5fd36c : (f < 0.85 ? 0xf2c35c : 0xff8a3a);
    g.fillStyle(color, 1); g.fillRoundedRect(x, y, Math.max(2, w * f), h, 3);
    g.lineStyle(1, 0xfff4dd, 0.8); g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);
    var dir = ['left', 'right', 'up', 'down'].indexOf(scene.lastDirection) >= 0 ? scene.lastDirection : 'right';
    var d = LANCE_MIN + f * (LANCE_MAX - LANCE_MIN);
    var r = st.agua ? destinoDelLance(st.agua, Math.round(p.x), Math.round(p.y + 40), dir, d) : null;
    if (st.marca) {
      if (r && r.punto) {
        st.marca.setVisible(true).setPosition(r.punto.x, r.punto.y + 4).setTint(0xffffff)
          .setScale(0.55 + Math.sin(scene.time.now / 120) * 0.08).setAlpha(0.95);
      } else if (r && r.corto) {
        // Corto: la marca sale en la orilla, roja.
        var v = DIRV[r.dir] || DIRV.right;
        st.marca.setVisible(true).setPosition(p.x + v[0] * d, p.y + 44 + v[1] * d).setTint(0xff7a6c).setScale(0.5).setAlpha(0.9);
      } else {
        st.marca.setVisible(false);
      }
    }
  }

  // ─────────────────────────────────────────── EL CÍRCULO PARA MOVERSE
  function pintarRango(st, lejos) {
    var scene = st.scene;
    if (!st.origen) return;
    if (!st.rango) st.rango = scene.add.graphics().setDepth(1.6);
    var g = st.rango, k = lejos / RADIO_MOVERSE;
    g.clear();
    var color = k > 0.7 ? 0xff9a4a : 0xfff4dd;
    var alfa = k > 0.7 ? 0.75 : (lejos > 6 ? 0.45 : 0.22);
    g.lineStyle(2, color, alfa);
    g.strokeEllipse(st.origen.x, st.origen.y + 47, RADIO_MOVERSE * 2, RADIO_MOVERSE);
  }

  // ─────────────────────────────────────────────────────── EL CICLO
  function accion(st) {
    if (st.fase === 'nada') return lanzar(st, 0.5);
    if (st.fase === 'pica') return enganchar(st);
    if (st.fase === 'esperando') return enganchar(st);         // tirar antes: se espanta
  }

  function lanzar(st, fuerza) {
    var scene = st.scene, p = scene.player;
    if (!p || !st.puede || scene._accionPersonaje) return;
    var f = typeof fuerza === 'number' ? Math.max(0, Math.min(1, fuerza)) : 0.5;
    st.fase = 'lanzando';
    pintarBoton(st);
    var dir = ['left', 'right', 'up', 'down'].indexOf(scene.lastDirection) >= 0 ? scene.lastDirection : 'right';
    var pies = { x: Math.round(p.x), y: Math.round(p.y + 40) };
    var lance = destinoDelLance(st.agua, pies.x, pies.y, dir, LANCE_MIN + f * (LANCE_MAX - LANCE_MIN));
    if (!lance) { st.fase = 'nada'; pintarBoton(st); aviso(scene, 'Face the river to fish.', 'warning'); return; }
    if (lance.corto) {
      st.fase = 'nada'; pintarBoton(st);
      var tactil = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      aviso(scene, tactil ? 'Too short! Hold the button longer to cast farther.' : 'Too short! Hold F longer to cast farther.', 'warning');
      return;
    }
    var destino = lance.punto;
    // Mirar hacia el agua.
    var vx = destino.x - pies.x, vy = destino.y - pies.y;
    dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
    st.dir = dir;
    st.runId++;
    var run = st.runId;

    Promise.all([api(scene, '/api/pesca/lanzar', pies), cargarFotogramas(scene)]).then(function (res) {
      var r = res[0];
      if (run !== st.runId || !st.scene) return;
      if (!res[1]) { terminar(st); aviso(scene, 'Fishing images could not load. Try again.', 'warning'); return; }
      if (!r.ok || !r.datos || !r.datos.ok) {
        var e = r.datos && r.datos.error;
        var textos = {
          sin_cana: 'You need a fishing rod (buy one in the shop).',
          lejos_del_agua: 'Get closer to the river.',
          demasiado_pronto: 'Wait a moment before casting again.',
          fantasma: 'You are a ghost — revive first.',
          cadena: 'The chain is not answering. Try again.'
        };
        aviso(scene, textos[e] || (r.datos && r.datos.message) || 'You cannot fish right now.', 'warning');
        terminar(st);
        return;
      }
      st.sesion = r.datos.sesion;
      empezarAnimacion(st, destino, r.datos.picaEnMs, r.datos.ventanaMs);
    }).catch(function () {
      if (run !== st.runId) return;
      aviso(scene, 'Connection problem. Try again.', 'error');
      terminar(st);
    });
  }

  /* LOS DEMÁS ME VEN PESCAR (2026-10-05). "Si otros jugadores están pescando
     no puedo ver su animación: los veo parados." Era literal: la pesca solo
     cambiaba MI sprite, y como pescando no se anda, no salía ni un paquete.
     Ahora el estado viaja en el mismo `playerMove` de siempre (el servidor lo
     reenvía tal cual y lo guarda en la sala, así que el que llega después
     también lo ve): GameScene.sendPlayerMovement lee `scene._pescaRemota` y
     manda un paquete en cuanto cambia su `firma`. Solo cambia en los momentos
     que se ven: lanzar, el corcho en el agua, la picada, la lucha y el final. */
  function difundir(st, fase, destino) {
    var scene = st.scene;
    if (!scene) return;
    if (!fase) { scene._pescaRemota = null; return; }
    var datos = {
      n: st.runId, dir: st.dir, fase: fase,
      cx: destino ? Math.round(destino.x) : null,
      cy: destino ? Math.round(destino.y) : null
    };
    scene._pescaRemota = { firma: [datos.n, datos.dir, fase, datos.cx, datos.cy].join('|'), datos: datos };
  }

  function fotograma(st, n) {
    var scene = st.scene, k = clave(personaje(), st.dir, n);
    st.foto = n;
    if (scene.textures.exists(k)) {
      try { scene.player.anims.stop(); scene.player.setTexture(k); } catch (e) {}
    }
  }

  function empezarAnimacion(st, destino, picaEnMs, ventanaMs) {
    var scene = st.scene, p = scene.player;
    texturas(scene);
    scene._accionPersonaje = 'pesca';
    try { if (scene.stopMouseMovement) scene.stopMouseMovement(); } catch (e) {}
    try { if (p.body && p.body.setVelocity) p.body.setVelocity(0, 0); } catch (e) {}
    st.origen = { x: p.x, y: p.y };
    st.fase = 'esperando';
    pintarBoton(st);
    difundir(st, 'lanza', destino);

    // El lance: fotogramas 1-4 a 8 por segundo y después la espera (5-6).
    var n = 1;
    fotograma(st, n);
    st.reloj = scene.time.addEvent({ delay: 125, repeat: 3, callback: function () {
      n++; fotograma(st, n);
      if (n === 4) soltarCorcho(st, destino);
    } });
    st.relojEspera = scene.time.addEvent({ delay: 330, loop: true, startAt: 0, callback: function () {
      if (n < 4) return;
      st.esperaPaso = (st.esperaPaso || 0) + 1;
      fotograma(st, 5 + (st.esperaPaso % 2));
    } });
    st.linea = scene.add.graphics().setDepth((p.depth || 0) + 2);
    st.picaEn = scene.time.now + picaEnMs;
    st.ventanaMs = ventanaMs;
  }

  function puntaDeLaCana(st) {
    var p = st.scene.player;
    var tabla = PUNTAS[personaje()] || PUNTAS.personaje1;
    var fila = tabla[DIRS[st.dir] || 'derecha'] || tabla.derecha;
    var v = fila[Math.max(0, Math.min(5, (st.foto || 5) - 1))];
    var esc = Math.abs(p.scaleX) || 2;
    return { x: p.x + v[0] * esc, y: p.y + v[1] * esc };
  }

  function soltarCorcho(st, destino) {
    var scene = st.scene;
    var punta = puntaDeLaCana(st);
    var c = scene.add.image(punta.x, punta.y, 'gfp_corcho').setScale(2).setDepth(Math.max(2, destino.y));
    st.corcho = c;
    st.destino = destino;
    var t0 = scene.time.now;
    scene.tweens.addCounter({ from: 0, to: 1, duration: 420, ease: 'Sine.easeOut', onUpdate: function (tw) {
      var k = tw.getValue();
      if (!st.corcho) return;
      c.x = punta.x + (destino.x - punta.x) * k;
      c.y = punta.y + (destino.y - punta.y) * k - Math.sin(k * Math.PI) * 46;
    }, onComplete: function () {
      if (!st.corcho) return;
      st.flotando = true;
      if (st.fase === 'esperando') difundir(st, 'espera', destino);
      onda(st, destino.x, destino.y, 0.9);
      salpicar(st, destino.x, destino.y, 5);
    } });
    void t0;
  }

  function onda(st, x, y, esc) {
    var scene = st.scene;
    var o = scene.add.image(x, y + 4, 'gfp_onda').setScale(0.3 * esc).setAlpha(0.9).setDepth(Math.max(1.5, y - 1));
    st.efectos.push(o);
    scene.tweens.add({ targets: o, scaleX: 1.3 * esc, scaleY: 1.3 * esc, alpha: 0, duration: 900, ease: 'Sine.easeOut',
      onComplete: function () { o.destroy(); var i = st.efectos.indexOf(o); if (i >= 0) st.efectos.splice(i, 1); } });
  }

  function salpicar(st, x, y, n) {
    var scene = st.scene;
    for (var i = 0; i < n; i++) {
      var g = scene.add.image(x, y, 'gfp_gota').setScale(1.5).setDepth(y + 2);
      st.efectos.push(g);
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var v = 30 + Math.random() * 40;
      scene.tweens.add({ targets: g, x: x + Math.cos(ang) * v * 0.6, y: y - 10 - Math.random() * 18, alpha: 0,
        duration: 420 + Math.random() * 200, ease: 'Quad.easeOut',
        onComplete: (function (gg) { return function () { gg.destroy(); var k = st.efectos.indexOf(gg); if (k >= 0) st.efectos.splice(k, 1); }; })(g) });
    }
  }

  function exclamacion(st) {
    var scene = st.scene, p = scene.player;
    var t = scene.add.text(p.x, p.y - 74, '!', { fontFamily: '"PressStart2P", monospace', fontSize: '20px', color: '#ffe066',
      stroke: '#5a2a00', strokeThickness: 6 }).setOrigin(0.5).setDepth(9000);
    st.efectos.push(t);
    scene.tweens.add({ targets: t, y: p.y - 86, duration: 160, yoyo: true, repeat: 2 });
    st.exclamacion = t;
  }

  // ─────────────────────────────────────────────────────── LA LUCHA
  function enganchar(st) {
    var scene = st.scene;
    if (!st.sesion || st.enganchando) return;
    st.enganchando = true;
    var antes = st.fase;
    st.fase = 'enganchando';
    pintarBoton(st);
    api(scene, '/api/pesca/enganchar', { sesion: st.sesion }).then(function (r) {
      st.enganchando = false;
      if (!st.scene) return;
      var d = r.datos || {};
      if (!d.ok) {
        var m = d.motivo;
        aviso(scene, m === 'pronto' ? (antes === 'esperando' ? 'Too soon! The fish got scared.' : 'Too soon!')
          : m === 'tarde' ? 'Too late… it got away.' : (d.message || 'Nothing this time.'), 'warning');
        if (st.corcho) salpicar(st, st.corcho.x, st.corcho.y, 3);
        st.sesion = null;
        scene.time.delayedCall(250, function () { terminar(st); });
        return;
      }
      empezarLucha(st, d.especie, d.dificultad || {}, Number(d.maxMs) || 45000);
    }).catch(function () {
      st.enganchando = false;
      aviso(scene, 'Connection problem. Try again.', 'error');
      terminar(st);
    });
  }

  function panelLucha() {
    var el = document.getElementById('gf-lucha');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'gf-lucha';
    el.className = 'gf-lucha';
    el.hidden = true;
    el.innerHTML =
      '<div class="gf-lucha-cab"><img class="gf-lucha-icono" alt="" draggable="false"><span class="gf-lucha-nombre"></span></div>' +
      '<div class="gf-lucha-cuerpo">' +
      '  <div class="gf-lucha-pista">' +
      '    <i class="gf-lucha-burbuja" style="left:22%;animation-delay:0s"></i>' +
      '    <i class="gf-lucha-burbuja" style="left:62%;animation-delay:.9s"></i>' +
      '    <i class="gf-lucha-burbuja" style="left:42%;animation-delay:1.7s"></i>' +
      '    <div class="gf-lucha-pez"><img alt="" draggable="false"></div>' +
      '    <div class="gf-lucha-anzuelo"></div>' +
      '  </div>' +
      '  <div class="gf-lucha-barra"><div class="gf-lucha-llenado"></div></div>' +
      '</div>' +
      '<div class="gf-lucha-ayuda"><b class="gf-lucha-pc">Hold SPACE</b><b class="gf-lucha-tactil">Hold here</b> — keep the hook inside the fish</div>';
    document.body.appendChild(el);
    return el;
  }

  function empezarLucha(st, especie, dif, maxMs) {
    var scene = st.scene;
    st.fase = 'luchando';
    pintarBoton(st);
    difundir(st, 'lucha', st.destino);
    if (st.exclamacion) { try { st.exclamacion.destroy(); } catch (e) {} st.exclamacion = null; }
    var el = panelLucha();
    var src = './Game/Objetos/pesca/' + especie + '.png';
    el.querySelector('.gf-lucha-icono').src = src;
    el.querySelector('.gf-lucha-pez img').src = src;
    el.querySelector('.gf-lucha-nombre').textContent = NOMBRES[especie] || especie;
    el.dataset.especie = especie;
    el.hidden = false;
    el.classList.remove('fin', 'ganada', 'perdida');
    var tam = Math.max(0.16, Math.min(0.5, Number(dif.tam) || 0.32));
    var L = st.lucha = {
      especie: especie, t0: performance.now(), maxMs: maxMs,
      tam: tam, vel: Number(dif.vel) || 0.7, nervio: Number(dif.nervio) || 1.2,
      mengua: Number(dif.mengua) || 0, rafaga: Number(dif.rafaga) || 0,
      pez: 0.5 - tam / 2, objetivo: 0.5 - tam / 2, proxCambio: 0, rafagaHasta: 0,
      anzuelo: 0.5 - LUCHA.anzuelo / 2, vAnz: 0, progreso: LUCHA.inicio, pulsado: false,
      el: el, pista: el.querySelector('.gf-lucha-pista'), elPez: el.querySelector('.gf-lucha-pez'),
      elAnz: el.querySelector('.gf-lucha-anzuelo'), elLleno: el.querySelector('.gf-lucha-llenado'),
      terminada: false, ultimo: performance.now()
    };
    // Mantener pulsado: el panel entero (el dedo o el ratón) y ESPACIO o F.
    L.abajo = function (e) { if (e && e.cancelable) e.preventDefault(); L.pulsado = true; };
    L.arriba = function () { L.pulsado = false; };
    L.teclaAbajo = function (e) {
      if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); e.stopPropagation(); L.pulsado = true; }
    };
    L.teclaArriba = function (e) { if (e.code === 'Space' || e.code === 'KeyF') L.pulsado = false; };
    el.addEventListener('pointerdown', L.abajo);
    window.addEventListener('pointerup', L.arriba);
    window.addEventListener('pointercancel', L.arriba);
    window.addEventListener('keydown', L.teclaAbajo, true);
    window.addEventListener('keyup', L.teclaArriba, true);
    L.raf = requestAnimationFrame(function paso(t) {
      if (!st.lucha || st.lucha !== L || L.terminada) return;
      pasoLucha(st, L, t);
      L.raf = requestAnimationFrame(paso);
    });
    try { if (navigator.vibrate) navigator.vibrate([40, 40, 40]); } catch (e) {}
  }

  function pasoLucha(st, L, t) {
    var dt = Math.min(0.05, (t - L.ultimo) / 1000);
    L.ultimo = t;
    // El pez: elige un sitio, va hacia él, a veces de un tirón; y encoge.
    var tamAhora = L.tam * (1 - L.mengua * Math.max(0, L.progreso - 0.35) / 0.65);
    if (t > L.proxCambio) {
      L.objetivo = Math.random() * (1 - tamAhora);
      L.proxCambio = t + (400 + Math.random() * 900) / L.nervio;
      if (Math.random() < L.rafaga) L.rafagaHasta = t + 450;
    }
    var vel = L.vel * (t < L.rafagaHasta ? 2.1 : 1);
    var dif = L.objetivo - L.pez;
    var paso = Math.sign(dif) * Math.min(Math.abs(dif), vel * dt * (0.4 + Math.min(1, Math.abs(dif) * 4)));
    L.pez = Math.max(0, Math.min(1 - tamAhora, L.pez + paso));
    // El anzuelo: sube mientras se pulsa, cae si no.
    L.vAnz += (L.pulsado ? -LUCHA.sube : LUCHA.baja) * dt;
    L.vAnz *= Math.pow(LUCHA.amort, dt);
    L.anzuelo += L.vAnz * dt;
    if (L.anzuelo < 0) { L.anzuelo = 0; L.vAnz *= -0.3; }
    if (L.anzuelo > 1 - LUCHA.anzuelo) { L.anzuelo = 1 - LUCHA.anzuelo; L.vAnz *= -0.3; }
    var dentro = L.anzuelo >= L.pez - 0.004 && L.anzuelo + LUCHA.anzuelo <= L.pez + tamAhora + 0.004;
    L.progreso = Math.max(0, Math.min(1, L.progreso + (dentro ? LUCHA.gana : -LUCHA.pierde) * dt));
    // Pintar.
    L.elPez.style.top = (L.pez * 100) + '%';
    L.elPez.style.height = (tamAhora * 100) + '%';
    L.elAnz.style.top = (L.anzuelo * 100) + '%';
    L.elAnz.style.height = (LUCHA.anzuelo * 100) + '%';
    L.elLleno.style.height = (L.progreso * 100) + '%';
    L.el.classList.toggle('dentro', dentro);
    L.el.classList.toggle('tiron', t < L.rafagaHasta);
    // El corcho y el personaje, al ritmo de la pelea.
    if (st.corcho && st.destino) {
      st.corcho.x = st.destino.x + Math.sin(t / 60) * (dentro ? 1.5 : 3.5);
      st.corcho.y = st.destino.y + 5 + Math.abs(Math.sin(t / 90)) * 3;
      if (Math.random() < dt * 3) salpicar(st, st.corcho.x, st.corcho.y, 1);
    }
    if (t - (L.ultimaFoto || 0) > (dentro ? 160 : 110)) { L.ultimaFoto = t; fotograma(st, st.foto === 5 ? 6 : 5); }
    var dura = t - L.t0;
    if (L.progreso >= 1) finLucha(st, L, true, dura);
    else if (L.progreso <= 0 || dura > L.maxMs) finLucha(st, L, false, dura);
  }

  function finLucha(st, L, gana, dura) {
    if (L.terminada) return;
    L.terminada = true;
    cancelAnimationFrame(L.raf);
    window.removeEventListener('pointerup', L.arriba);
    window.removeEventListener('pointercancel', L.arriba);
    window.removeEventListener('keydown', L.teclaAbajo, true);
    window.removeEventListener('keyup', L.teclaArriba, true);
    L.el.removeEventListener('pointerdown', L.abajo);
    L.el.classList.add('fin', gana ? 'ganada' : 'perdida');
    // El servidor pide una pelea creíble: si se ganó rapidísimo, se espera.
    var espera = gana ? Math.max(0, LUCHA.minMs - dura) : 0;
    setTimeout(function () {
      if (st.lucha === L) st.lucha = null;
      setTimeout(function () { L.el.hidden = true; }, 600);
      recoger(st, gana);
    }, espera);
  }

  function cerrarLucha(st) {
    var L = st.lucha;
    if (!L) return;
    st.lucha = null;
    if (!L.terminada) {
      L.terminada = true;
      cancelAnimationFrame(L.raf);
      window.removeEventListener('pointerup', L.arriba);
      window.removeEventListener('pointercancel', L.arriba);
      window.removeEventListener('keydown', L.teclaAbajo, true);
      window.removeEventListener('keyup', L.teclaArriba, true);
      L.el.removeEventListener('pointerdown', L.abajo);
    }
    L.el.hidden = true;
  }

  function recoger(st, exito) {
    var scene = st.scene;
    if (!st.sesion || st.recogiendo) return;
    st.recogiendo = true;
    var sesion = st.sesion;
    st.sesion = null;
    var antes = st.fase;
    st.fase = 'recogiendo';
    pintarBoton(st);
    var cuerpo = { sesion: sesion };
    if (typeof exito === 'boolean') cuerpo.exito = exito;
    api(scene, '/api/pesca/recoger', cuerpo).then(function (r) {
      if (!st.scene) return;
      var d = r.datos || {};
      if (d.ok && d.itemId) {
        saltarPez(st, d.itemId);
        meterFactura(scene, d.itemId, d.factura);
        try { if (scene._sumarExpHabilidad) scene._sumarExpHabilidad('pesca', d.exp || 15); } catch (e) {}
        if (d.veneno) {
          // Venenoso: te pica al desengancharlo. La vida la quita el SERVIDOR
          // poco a poco y la barra baja con cada aviso (ver el veneno, abajo).
          aviso(scene, '☠️ You caught a ' + (NOMBRES[d.itemId] || d.itemId) + '… and it stung you! You are poisoned.', 'warning');
          enVeneno(scene, true);
        } else {
          aviso(scene, '🎣 You caught a ' + (NOMBRES[d.itemId] || d.itemId) + '!', 'success');
        }
        try { scene.playSFX && scene.playSFX('item_pickup'); } catch (e) {}
      } else {
        var m = d.motivo;
        aviso(scene, m === 'pronto' ? (antes === 'esperando' ? 'Too soon! The fish got scared.' : 'Too soon!')
          : m === 'tarde' ? 'Too late… it got away.'
          : m === 'escapo' ? 'It got away! The line went slack.'
          : (d.message || 'Nothing this time.'), m === 'escapo' || m === 'tarde' ? 'warning' : 'info');
        if (st.corcho) salpicar(st, st.corcho.x, st.corcho.y, 3);
      }
      scene.time.delayedCall(d.ok ? 650 : 250, function () { terminar(st); });
    }).catch(function () {
      aviso(scene, 'Connection problem. Try again.', 'error');
      terminar(st);
    });
  }

  /* ─────────────────────────────────────────────────── EL VENENO (2026-10-10)
     Los peces venenosos (pes7, pes8) pican al sacarlos. El servidor quita la
     vida poco a poco y avisa por el socket con `vitales:veneno`; aquí solo se
     PINTA: la barra (con el camino de siempre, _adoptarVitalesDelServidor),
     un destello verde en el personaje y, si la vida llega a 0, la muerte de
     siempre. Vale en cualquier escena: el socket es uno por pestaña, y el
     veneno sigue aunque entres en la tienda. */
  var VERDE_VENENO = 0x8dff6a;

  function escenaVivaDelJuego() {
    var g = window.game;
    if (!g || !g.scene || !g.scene.getScenes) return null;
    var lista = g.scene.getScenes(true) || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].player && lista[i].sys && lista[i].sys.settings.key !== 'LoadingScenegame') return lista[i];
    }
    return null;
  }

  function enVeneno(scene, si) {
    var p = scene && scene.player;
    if (!p || !p.setTint) return;
    try {
      if (si) {
        p.setTint(VERDE_VENENO);
        if (scene._gfVenenoReloj) clearTimeout(scene._gfVenenoReloj);
        scene._gfVenenoReloj = setTimeout(function () {
          scene._gfVenenoReloj = null;
          try { if (p.active) p.clearTint(); } catch (e) {}
        }, 220);
      } else {
        p.clearTint();
      }
    } catch (e) {}
  }

  function alPinchazo(d) {
    if (!d || !d.stats) return;
    var scene = escenaVivaDelJuego();
    if (!scene) return;
    try {
      if (typeof scene._adoptarVitalesDelServidor === 'function') scene._adoptarVitalesDelServidor(d.stats);
      else if (typeof d.stats.vida === 'number') {
        // La tienda no tiene ese método: la barra a mano.
        if (window.playerStats) window.playerStats.vida = d.stats.vida;
        scene.vidaPorcentaje = d.stats.vida;
        if (typeof scene.actualizarBarraVida === 'function') scene.actualizarBarraVida(d.stats.vida);
      }
    } catch (e) {}
    if (d.dano > 0) enVeneno(scene, true);
    if (d.restante <= 0) aviso(scene, 'The poison wore off.', 'info');
    if (typeof d.stats.vida === 'number' && d.stats.vida <= 0 &&
        window.GFMascota && typeof window.GFMascota.declararMuerte === 'function') {
      window.GFMascota.declararMuerte();
    }
  }

  // Se engancha al socket de la página (y al nuevo, si se rehace).
  function engancharVeneno() {
    var s = window.globalSocket;
    if (!s || s.__gfVeneno || typeof s.on !== 'function') return;
    s.__gfVeneno = true;
    s.on('vitales:veneno', alPinchazo);
  }
  setInterval(engancharVeneno, 2000);

  function saltarPez(st, itemId) {
    var scene = st.scene, p = scene.player;
    var desde = st.corcho ? { x: st.corcho.x, y: st.corcho.y } : { x: p.x + 40, y: p.y };
    var k = 'gfp_' + itemId;
    if (!scene.textures.exists(k)) return;
    /* El dibujo del pez mira a la IZQUIERDA: si vuela hacia la derecha (el
       pescador está a la derecha del corcho) se le da la vuelta, o llegaba
       de espaldas, con la cola por delante. */
    var pez = scene.add.image(desde.x, desde.y, k).setScale(2).setDepth(9000).setFlipX(p.x > desde.x);
    st.efectos.push(pez);
    salpicar(st, desde.x, desde.y, 8);
    onda(st, desde.x, desde.y, 1.2);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 620, ease: 'Sine.easeInOut', onUpdate: function (tw) {
      var t = tw.getValue();
      pez.x = desde.x + (p.x - desde.x) * t;
      pez.y = desde.y + (p.y - 40 - desde.y) * t - Math.sin(t * Math.PI) * 70;
      pez.rotation = Math.sin(t * 14) * 0.5;
    }, onComplete: function () {
      scene.tweens.add({ targets: pez, scale: 0.6, alpha: 0, y: pez.y - 16, duration: 260,
        onComplete: function () { pez.destroy(); var i = st.efectos.indexOf(pez); if (i >= 0) st.efectos.splice(i, 1); } });
    } });
  }

  /** El pez ya está acuñado: se pone en la bolsa local (como la parcela devuelta). */
  function meterFactura(scene, itemId, f) {
    var S = scene.STATE;
    if (!S || !f) return;
    var id = Number(f.invoiceId), cantidad = Math.max(1, Number(f.cantidad) || 1);
    var listas = [['slots', S.slots || []], ['quickSlots', S.quickSlots || []]];
    for (var a = 0; a < listas.length; a++) {
      var lista = listas[a][1];
      for (var i = 0; i < lista.length; i++) {
        if (lista[i] && Number(lista[i].idx) === id) {
          lista[i].count = cantidad; lista[i].id = itemId; lista[i].idm = f.manualId;
          try { scene.renderAllSlots(); } catch (e) {}
          try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
          return;
        }
      }
    }
    var nuevo = { id: itemId, idx: id, idm: f.manualId, count: cantidad };
    var g = S.ghostSlots || {};
    var libre = function (lista, fantasmas) {
      for (var j = 0; j < lista.length; j++) if (lista[j] === null && !(fantasmas && fantasmas[j])) return j;
      return -1;
    };
    var k = libre(S.slots, g.inv);
    if (k >= 0) S.slots[k] = nuevo;
    else if ((k = libre(S.quickSlots, g.quick)) >= 0) S.quickSlots[k] = nuevo;
    else aviso(scene, 'Your bag is full: the fish will appear when you come back.', 'warning');
    try { scene.renderAllSlots(); } catch (e) {}
    try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  function terminar(st) {
    var scene = st.scene;
    st.runId++;
    cerrarLucha(st);
    limpiarCarga(st);
    if (st.rango) { try { st.rango.destroy(); } catch (e) {} st.rango = null; }
    st.origen = null;
    st.enganchando = false;
    ['reloj', 'relojEspera'].forEach(function (k) { if (st[k]) { try { st[k].remove(false); } catch (e) {} st[k] = null; } });
    if (st.corcho) { try { st.corcho.destroy(); } catch (e) {} st.corcho = null; }
    if (st.linea) { try { st.linea.destroy(); } catch (e) {} st.linea = null; }
    st.efectos.forEach(function (o) { try { o.destroy(); } catch (e) {} });
    st.efectos.length = 0;
    st.flotando = false; st.recogiendo = false; st.sesion = null; st.exclamacion = null;
    st.fase = 'nada'; st.esperaPaso = 0;
    difundir(st, null);
    if (scene && scene._accionPersonaje === 'pesca') {
      scene._accionPersonaje = null;
      try {
        var idle = { left: 'player_left_1', right: 'player_right_1', up: 'player_up_1', down: 'player_down_1' }[st.dir] || 'player_right_1';
        scene.lastDirection = st.dir || scene.lastDirection;
        if (scene.player && scene.textures.exists(idle)) scene.player.setTexture(idle);
      } catch (e) {}
    }
    pintarBoton(st);
  }

  // ─────────────────────────────────────────────────────── CADA FOTOGRAMA
  function actualizar(st, ahora) {
    var scene = st.scene, p = scene.player;
    if (!p || !p.scene) return;

    // ¿Se puede pescar aquí? (cada 150 ms basta)
    if (ahora - st.ultimaMirada > 150) {
      st.ultimaMirada = ahora;
      var antes = st.puede;
      var tiene = typeof scene.contarItemEnInventario === 'function' && scene.contarItemEnInventario('cana_pescar') > 0;
      st.puede = !!(tiene && st.agua && !scene._cambiandoEscena && enLaOrilla(st.agua, p.x, p.y + 40));
      if (antes !== st.puede) pintarBoton(st);
    }
    if (st.fase === 'cargando') {
      // Se fue de la orilla con la barra a medias: se suelta sin lanzar.
      if (!st.puede) { limpiarCarga(st); st.fase = 'nada'; pintarBoton(st); return; }
      pintarCarga(st);
      return;
    }
    if (st.fase === 'nada' || st.fase === 'lanzando') return;

    // Moverse NO corta la pesca mientras no se salga del círculo.
    if (st.origen) {
      var lejos = Math.hypot(p.x - st.origen.x, p.y - st.origen.y);
      pintarRango(st, lejos);
      if (lejos > RADIO_MOVERSE) {
        aviso(scene, 'You walked too far — the line came loose.', 'warning');
        terminar(st);
        return;
      }
    }

    // El sedal, con un poco de comba.
    if (st.linea && st.corcho) {
      var a = puntaDeLaCana(st), b = { x: st.corcho.x, y: st.corcho.y - 4 };
      var g = st.linea;
      g.clear();
      g.lineStyle(1, 0xf2f2f2, 0.85);
      var cx = (a.x + b.x) / 2, cy = Math.max(a.y, b.y) + 10;
      var curva = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(b.x, b.y));
      curva.draw(g, 16);
    }

    // El corcho flota; al picar se hunde a tirones.
    if (st.flotando && st.corcho) {
      var base = st.destino.y;
      if (st.fase === 'esperando') {
        st.corcho.y = base + Math.sin(ahora / 320) * 1.5;
        if (Math.random() < 0.004) onda(st, st.corcho.x, base, 0.6);
        if (ahora >= st.picaEn) {
          st.fase = 'pica';
          pintarBoton(st);
          difundir(st, 'pica', st.destino);
          exclamacion(st);
          salpicar(st, st.corcho.x, base, 6);
          onda(st, st.corcho.x, base, 1.1);
          try { scene.playSFX && scene.playSFX('splash'); } catch (e) {}
          if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
        }
      } else if (st.fase === 'pica') {
        st.corcho.y = base + 4 + Math.abs(Math.sin(ahora / 70)) * 3;
        if (ahora > st.picaEn + st.ventanaMs + 300) enganchar(st);   // se le pasó: el servidor dirá "tarde"
      }
    }
  }

  // ─────────────────────────────────────── LOS DEMÁS PESCANDO
  /* Lo que se ve de un jugador REMOTO que pesca: sus propios fotogramas de
     pescar (los de SU personaje Soulbound, con la caña), el sedal desde la
     punta de su caña y el corcho donde él lo echó, flotando, hundiéndose al
     picar y dando tirones en la lucha. Todo sale de lo que manda `difundir`;
     la hora la pone cada uno (no viaja), así que el lance se ve entero aunque
     el paquete llegue tarde. Quien llega con la pesca ya empezada lo ve
     directamente con el corcho en el agua. */
  var FASES_REMOTAS = { lanza: 1, espera: 1, pica: 1, lucha: 1 };
  var LEJOS_REMOTO = 420;      // un corcho más lejos que esto del pescador es basura

  function perDe(p) {
    var SB = window.GFSoulbound;
    if (SB && SB.idValido && SB.idValido(p._soulbound)) return p._soulbound;
    // Sin personaje propio se le pinta con las texturas globales, que son las
    // del personaje que llevo yo: se pesca con ese mismo para que no cambie.
    return personaje();
  }

  function puntaRemota(p, r) {
    var tabla = PUNTAS[r.per] || PUNTAS.personaje1;
    var fila = tabla[DIRS[r.dir] || 'derecha'] || tabla.derecha;
    var v = fila[Math.max(0, Math.min(5, (r.foto || 5) - 1))];
    var esc = Math.abs(p.sprite.scaleX) || 2;
    return { x: p.sprite.x + v[0] * esc, y: p.sprite.y + v[1] * esc };
  }

  function soltarRemoto(p) {
    var r = p && p._pesca;
    if (!r) return;
    try { if (r.corcho) r.corcho.destroy(); } catch (e) {}
    try { if (r.linea) r.linea.destroy(); } catch (e) {}
    p._pesca = null;
  }

  function pasoRemoto(scene, p, r, ahora) {
    if (!p.sprite || !p.sprite.scene) { soltarRemoto(p); return; }
    var per = perDe(p);
    if (per !== r.per) { r.per = per; cargarFotogramas(scene, per, true); }
    var dt = ahora - r.t0;
    var n = dt < 500 ? Math.min(4, 1 + Math.floor(dt / 125)) : 5 + (Math.floor((dt - 500) / 330) % 2);
    r.foto = n;
    var k = clave(r.per, r.dir, n);
    if (scene.textures.exists(k) && p.sprite.texture && p.sprite.texture.key !== k) {
      try { if (p.sprite.anims) p.sprite.anims.stop(); p.sprite.setTexture(k); } catch (e) {}
    }
    var ve = p.sprite.visible !== false;
    if (!r.hayCorcho || dt < 375) {
      if (r.corcho) r.corcho.setVisible(false);
      if (r.linea) { r.linea.clear(); r.linea.setVisible(false); }
      return;
    }
    if (!r.corcho) r.corcho = scene.add.image(r.cx, r.cy, 'gfp_corcho').setScale(2);
    if (!r.linea) r.linea = scene.add.graphics();
    var punta = puntaRemota(p, r);
    var vuelo = Math.min(1, (dt - 375) / 420);
    var x = r.cx, y = r.cy;
    if (vuelo < 1) {
      var e = Math.sin(vuelo * Math.PI / 2);                 // Sine.easeOut, como el mío
      x = punta.x + (r.cx - punta.x) * e;
      y = punta.y + (r.cy - punta.y) * e - Math.sin(vuelo * Math.PI) * 46;
    } else if (r.fase === 'pica') {
      y = r.cy + 4 + Math.abs(Math.sin(ahora / 70)) * 3;
    } else if (r.fase === 'lucha') {
      x = r.cx + Math.sin(ahora / 60) * 3;
      y = r.cy + 5 + Math.abs(Math.sin(ahora / 90)) * 3;
    } else {
      y = r.cy + Math.sin(ahora / 320) * 1.5;
    }
    r.corcho.setPosition(x, y).setDepth(Math.max(2, r.cy)).setVisible(ve);
    var g = r.linea;
    g.clear();
    g.setVisible(ve);
    if (!ve) return;
    g.setDepth((p.sprite.depth || 0) + 2);
    var b = { x: x, y: y - 4 };
    g.lineStyle(1, 0xf2f2f2, 0.85);
    var curva = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(punta.x, punta.y),
      new Phaser.Math.Vector2((punta.x + b.x) / 2, Math.max(punta.y, b.y) + 10),
      new Phaser.Math.Vector2(b.x, b.y));
    curva.draw(g, 16);
  }

  /* Un solo `update` por escena para todos los que pescan; se quita al apagar
     la escena (Phaser la reutiliza: si no, se sumaría uno por visita). */
  function bucleRemoto(scene) {
    if (scene.__gfPescaRemotos) return;
    var fn = function (t) {
      var ps = scene.otherPlayers;
      if (!ps) return;
      for (var id in ps) {
        if (!Object.prototype.hasOwnProperty.call(ps, id)) continue;
        var p = ps[id];
        if (p && p._pesca) pasoRemoto(scene, p, p._pesca, t);
      }
    };
    var fuera = function () {
      scene.events.off('update', fn);
      scene.__gfPescaRemotos = null;
    };
    scene.__gfPescaRemotos = fn;
    scene.events.on('update', fn);
    scene.events.once('shutdown', fuera);
    scene.events.once('destroy', fuera);
  }

  /**
   * Lo llama updateOtherPlayer/createOtherPlayer con lo que llegó en el
   * paquete. Devuelve true si el jugador está pescando (y entonces la escena no
   * le pone la animación de andar ni la de quieto encima).
   */
  function remoto(scene, p, info) {
    if (!scene || !p || !p.sprite || !scene.add) return false;
    var vale = info && typeof info === 'object' && DIRV[info.dir] && FASES_REMOTAS[info.fase];
    if (!vale) { if (p._pesca) soltarRemoto(p); return false; }
    var cx = Number(info.cx), cy = Number(info.cy);
    var hayCorcho = info.cx !== null && info.cy !== null && isFinite(cx) && isFinite(cy) &&
                    Math.hypot(cx - p.sprite.x, cy - p.sprite.y) < LEJOS_REMOTO;
    var r = p._pesca;
    if (!r || r.n !== info.n) {
      soltarRemoto(p);
      var per = perDe(p);
      r = p._pesca = {
        n: info.n, per: per, dir: info.dir, fase: info.fase,
        // Si llega con el lance ya hecho, el corcho ya está en el agua.
        t0: (scene.time ? scene.time.now : performance.now()) - (info.fase === 'lanza' ? 0 : 1500),
        cx: cx, cy: cy, hayCorcho: hayCorcho, corcho: null, linea: null, foto: 1
      };
      texturas(scene);
      cargarFotogramas(scene, per, true);
      bucleRemoto(scene);
    } else {
      r.fase = info.fase;
      r.dir = info.dir;
      if (hayCorcho) { r.cx = cx; r.cy = cy; r.hayCorcho = true; }
    }
    pasoRemoto(scene, p, r, scene.time ? scene.time.now : performance.now());
    return true;
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfPesca) return scene && scene.__gfPesca;
    var agua = mapaDeAgua(scene);
    if (!agua) { log('sin capa de casillas: no hay pesca en esta escena'); return null; }
    var st = { scene: scene, agua: agua, fase: 'nada', puede: false, ultimaMirada: 0, efectos: [], runId: 0 };
    scene.__gfPesca = st;
    st.boton = boton(st);
    pintarBoton(st);
    st.onUpdate = function (t) { actualizar(st, t); };
    st.onTecla = function (ev) {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (ev && ev.repeat) return;                    // mantenerla no repite
      if (st.fase === 'luchando' || st.fase === 'enganchando' || st.fase === 'recogiendo' || st.fase === 'cargando') return;
      if (st.fase === 'nada') { if (st.puede) empezarCarga(st); return; }
      accion(st);
    };
    st.onTeclaArriba = function () { if (st.fase === 'cargando') soltarCarga(st); };
    scene.events.on('update', st.onUpdate);
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown-F', st.onTecla);
      scene.input.keyboard.on('keyup-F', st.onTeclaArriba);
    }
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montada:', agua.w + 'x' + agua.h);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfPesca;
    if (!st) return;
    terminar(st);
    scene.__gfPesca = null;
    scene.__gfPescaAgua = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.off('keydown-F', st.onTecla);
      scene.input.keyboard.off('keyup-F', st.onTeclaArriba);
    }
    if (st.boton) {
      var b = st.boton;
      b.hidden = true;
      if (b._gfp) b.removeEventListener('click', b._gfp);
      if (b._gfpAbajo) b.removeEventListener('pointerdown', b._gfpAbajo);
      if (b._gfpArriba) {
        b.removeEventListener('pointerup', b._gfpArriba);
        b.removeEventListener('pointercancel', b._gfpArriba);
        b.removeEventListener('lostpointercapture', b._gfpArriba);
      }
      b._gfp = b._gfpAbajo = b._gfpArriba = null;
    }
    st.scene = null;
  }

  window.GFPesca = {
    montar: montar,
    desmontar: desmontar,
    remoto: remoto,
    soltarRemoto: soltarRemoto,
    estado: function (scene) {
      var st = scene && scene.__gfPesca;
      return st ? { fase: st.fase, puede: st.puede, dir: st.dir || null } : null;
    },
    _interno: { cargarFotogramas: cargarFotogramas, mapaDeAgua: mapaDeAgua, enLaOrilla: enLaOrilla, puntoDelCorcho: puntoDelCorcho,
                destinoDelLance: destinoDelLance, LANCE_MIN: LANCE_MIN, LANCE_MAX: LANCE_MAX, RADIO_MOVERSE: RADIO_MOVERSE,
                clasificarTileset: clasificarTileset, meterFactura: meterFactura, NOMBRES: NOMBRES }
  };
})();
