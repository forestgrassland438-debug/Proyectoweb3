/* ===========================================================================
 * EL AGUA VIVA                                                     (2026-10-05)
 *
 * QUÉ HACE
 *   El río del pueblo y el mar de la isla eran un azul plano pintado en el
 *   suelo. Esto les pone encima AGUA QUE SE MUEVE, con la misma técnica que la
 *   mina (MinaScene._animarLiquidos): una capa de casillas con su propio
 *   tileset, y se anima cambiando la IMAGEN de ese tileset unas veces por
 *   segundo (`tileset.setImage`). Cero objetos por casilla, cero píxeles
 *   redibujados por fotograma, y la orilla va con el agua.
 *
 *   Y la VIDA del agua (opción `vida`): sombras de peces que nadan y a veces
 *   saltan, hojas que baja la corriente, destellos de sol, los anillos de la
 *   lluvia cuando llueve y, en el río, sus adornos fijos: piedras con su
 *   espuma, nenúfares, juncos, troncos flotando y sauces (Game/Objetos/rio).
 *
 * DE DÓNDE SALE DÓNDE HAY AGUA
 *   De la capa de casillas del mapa y los PÍXELES de su tileset, igual que la
 *   pesca y las colisiones de la isla: un píxel es agua si el azul domina con
 *   claridad. Cada casilla del tileset se mide una vez. Sin listas de gid que
 *   mantener: si el mapa cambia, esto le sigue.
 *
 *   La capa de la escena NO hace falta que se dibuje (el pueblo pinta su
 *   suelo con los trozos de `recortadas` y la capa no existe como imagen):
 *   solo se leen sus datos.
 *
 * EL DIBUJO
 *   Un patrón de PERIODO x PERIODO px (128) que se repite sin costura, con el
 *   fondo casi liso y REFLEJOS horizontales, finos, que tiemblan (dos capas de
 *   ruido alargado que dan una vueltecita en sentidos contrarios a lo largo
 *   del bucle). Es la receta del agua de la mina (tools/gf_mina_pro.py,
 *   `agua_fotogramas`) pero al aire libre: los colores salen del azul que el
 *   mapa ya tenía, así que casa con lo que hay alrededor.
 *
 *   Para que el patrón siga de una casilla a la siguiente, cada casilla usa el
 *   trozo de patrón que le toca por su posición (fase). Solo se fabrican las
 *   parejas (casilla del tileset, fase) que de verdad usa el mapa: 292 en el
 *   pueblo.
 *
 *   La orilla: espuma en el píxel de agua que toca tierra, que late a lo largo
 *   del bucle, y agua más clara (fondo de arena) en los dos siguientes. Lo
 *   hondo, más oscuro: un tinte por casilla según lo lejos que esté de tierra.
 *
 * PROFUNDIDAD
 *   0.5: encima del suelo (0) y debajo de TODO lo demás — charcos (1), nieve
 *   (2), huellas, la boya de la pesca, el jugador. Los adornos altos (juncos,
 *   sauces, piedras) van por su y como cualquier objeto del mundo.
 *
 * CÓMO SE ENGANCHA
 *   GameScene (update, una vez):   GFAgua.montar(this, { capa: 'mapa_principal', textura: 'tiles', vida: 'rio' })
 *   LandsScene.create:             GFAgua.montar(this, { capa: 'Terrain', textura: 'tiles_isla', vida: 'mar' })
 *   Se desmonta solo al apagarse la escena.
 * ======================================================================== */
(function () {
  'use strict';

  var PERIODO = 128;         // px: el dibujo se repite cada 128 (sin costura)
  var FOTOS = 8;             // fotogramas del bucle
  var FPS = 7;
  var PROF_AGUA = 0.5;
  var PROF_PLANO = 0.6;      // lo que flota pegado al agua (nenúfares, sombras)
  var MIN_AGUA = 0.12;       // una casilla con menos de un 12 % de azul no es agua

  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  // ───────────────────────────────────────────────────────── AZAR Y RUIDO
  function h2(x, y, s) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** Ruido de valor que se repite cada P px (P múltiplo de cx y de cy). */
  function ruido(x, y, cx, cy, P, s) {
    var nx = (P / cx) | 0, ny = (P / cy) | 0;
    var fx = x / cx, fy = y / cy;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    var xa = ((x0 % nx) + nx) % nx, xb = (xa + 1) % nx;
    var ya = ((y0 % ny) + ny) % ny, yb = (ya + 1) % ny;
    var a = h2(xa, ya, s), b = h2(xb, ya, s), c = h2(xa, yb, s), d = h2(xb, yb, s);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  /** Azar con semilla: lo que se coloca sale igual para todos los jugadores. */
  function semillero(s) {
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function az(a, b) { return a + Math.random() * (b - a); }

  // ────────────────────────────────────────────── QUÉ PÍXEL ES AGUA
  var _lecturas = {};      // por textura: { w, h, datos }
  function leerTextura(scene, clave) {
    if (_lecturas[clave]) return _lecturas[clave];
    var tex = scene.textures.get(clave);
    var img = tex && tex.key !== '__MISSING' && tex.getSourceImage ? tex.getSourceImage() : null;
    if (!img || !img.width) return null;
    var lienzo = document.createElement('canvas');
    lienzo.width = img.width; lienzo.height = img.height;
    var c = lienzo.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    var out = { w: img.width, h: img.height, datos: c.getImageData(0, 0, img.width, img.height).data, gids: {} };
    lienzo.width = lienzo.height = 0;
    _lecturas[clave] = out;
    return out;
  }
  function esAzul(r, g, b, a) { return a > 40 && b > 110 && b > r + 35 && b > g + 10; }

  /**
   * Lo que se sabe de una casilla del tileset: su máscara de agua, la
   * distancia de cada píxel de agua a la tierra (1 = la orilla, hasta 4) y el
   * color medio del agua. null si no es agua.
   */
  function infoGid(lec, T, firstgid, gid) {
    if (gid in lec.gids) return lec.gids[gid];
    var t = gid - firstgid, cols = Math.floor(lec.w / T);
    var tx = (t % cols) * T, ty = Math.floor(t / cols) * T;
    if (t < 0 || ty + T > lec.h) { lec.gids[gid] = null; return null; }
    var m = new Uint8Array(T * T), n = 0, sr = 0, sg = 0, sb = 0;
    for (var y = 0; y < T; y++) {
      for (var x = 0; x < T; x++) {
        var o = ((ty + y) * lec.w + tx + x) * 4, d = lec.datos;
        if (esAzul(d[o], d[o + 1], d[o + 2], d[o + 3])) { m[y * T + x] = 1; n++; sr += d[o]; sg += d[o + 1]; sb += d[o + 2]; }
      }
    }
    if (n / (T * T) < MIN_AGUA) { lec.gids[gid] = null; return null; }
    // Distancia a tierra dentro de la casilla. Fuera de ella se supone lo
    // mismo que en su borde: así una casilla de agua entera no tiene orilla.
    var dist = new Uint8Array(T * T);
    for (var i = 0; i < T * T; i++) dist[i] = m[i] ? 9 : 0;
    for (var paso = 1; paso <= 4; paso++) {
      for (y = 0; y < T; y++) {
        for (x = 0; x < T; x++) {
          var k = y * T + x;
          if (dist[k] !== 9) continue;
          var toca = false;
          for (var dy = -1; dy <= 1 && !toca; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var xx = Math.min(T - 1, Math.max(0, x + dx)), yy = Math.min(T - 1, Math.max(0, y + dy));
              if (dist[yy * T + xx] === paso - 1) { toca = true; break; }
            }
          }
          if (toca) dist[k] = paso;
        }
      }
    }
    var info = { mascara: m, dist: dist, ratio: n / (T * T), medio: [sr / n, sg / n, sb / n] };
    lec.gids[gid] = info;
    return info;
  }

  // ─────────────────────────────────────────────────────────── EL DIBUJO
  function mezcla(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /** La escala de colores sale del azul medio que ya tenía el mapa. */
  function paleta(medio, tipo) {
    var f = [0.62, 0.76, 0.9, 1.0, 1.12, 1.3, 1.62];
    var rampa = f.map(function (k) {
      return [Math.min(255, medio[0] * k), Math.min(255, medio[1] * k), Math.min(255, medio[2] * (0.55 + 0.45 * k))];
    });
    return {
      rampa: rampa,
      brillo: [232, 247, 253],
      espuma: tipo === 'mar' ? [246, 252, 250] : [232, 244, 242],
      bajo: tipo === 'mar' ? [126, 206, 214] : [112, 168, 178]     // agua sobre arena, en la orilla
    };
  }

  /** FOTOS patrones de PERIODO² en RGB, que dan una vuelta y vuelven al primero. */
  function patrones(pal, semilla) {
    var P = PERIODO, fondo = new Float32Array(P * P), lo = 1, hi = 0, x, y;
    for (y = 0; y < P; y++) {
      for (x = 0; x < P; x++) {
        var v = ruido(x, y, 64, 64, P, semilla) * 0.6 + ruido(x, y, 32, 32, P, semilla + 1) * 0.4;
        fondo[y * P + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    var out = [];
    for (var f = 0; f < FOTOS; f++) {
      var a = 2 * Math.PI * f / FOTOS;
      var px = new Uint8ClampedArray(P * P * 3);
      for (y = 0; y < P; y++) {
        for (x = 0; x < P; x++) {
          var v0 = (fondo[y * P + x] - lo) / Math.max(1e-6, hi - lo);
          var base = 0.24 + v0 * 0.38;
          var r1 = ruido(x + 3 * Math.cos(a), y + 1.1 * Math.sin(a), 32, 4, P, semilla + 41);
          var r2 = ruido(x - 3 * Math.cos(a + 1.3), y - 1.1 * Math.sin(a + 1.3), 16, 2, P, semilla + 43);
          var brillo = r1 * 0.6 + r2 * 0.4;
          var umbral = 0.67 - v0 * 0.08;
          if (brillo > umbral) base += Math.min(0.36, (brillo - umbral) * 2.4);
          var idx = Math.round(base * 6 + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.85);
          var c = pal.rampa[Math.max(0, Math.min(6, idx))];
          if (brillo > umbral + 0.13 && h2(x, y, semilla + 77 + f * 13) > 0.8) c = pal.brillo;
          if (h2(x, y, semilla + 91 + f * 7) > 0.9993) c = pal.brillo;
          var o = (y * P + x) * 3;
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
      }
      out.push(px);
    }
    return out;
  }

  /** Pinta una casilla (gid + fase) del fotograma f en `img` (ImageData). */
  function pintarCasilla(img, ox, oy, T, info, fx, fy, pat, f, pal) {
    var P = PERIODO, W = img.width, d = img.data;
    var ola = 2 * Math.PI * f / FOTOS;
    for (var y = 0; y < T; y++) {
      for (var x = 0; x < T; x++) {
        var k = y * T + x, o = ((oy + y) * W + ox + x) * 4;
        if (!info.mascara[k]) { d[o + 3] = 0; continue; }
        var gx = (fx * T + x) % P, gy = (fy * T + y) % P, q = (gy * P + gx) * 3;
        var c = [pat[q], pat[q + 1], pat[q + 2]], alfa = 255;
        var di = info.dist[k];
        if (di <= 3) {
          // La espuma late a lo largo de la orilla (seno sobre la posición).
          var w = 0.5 + 0.5 * Math.sin(ola + (gx + gy) * 0.33);
          if (di === 1) {
            var roto = h2(gx, gy, 5 + f) > 0.82 ? 0.25 : 0;        // espuma rota, no una raya
            c = mezcla(c, pal.espuma, Math.max(0, 0.32 + 0.5 * w - roto));
            alfa = 236;
          } else if (di === 2) {
            c = mezcla(mezcla(c, pal.bajo, 0.42), pal.espuma, 0.18 * w);
          } else {
            c = mezcla(c, pal.bajo, 0.2);
          }
        }
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = alfa;
      }
    }
    // Extrusión de 1 px: al hacer zoom sin números enteros, el rasterizador
    // toma a veces el píxel de al lado. Con el borde repetido no salen rayas.
    for (var i = 0; i < T; i++) {
      copiar(d, W, ox + i, oy, ox + i, oy - 1);
      copiar(d, W, ox + i, oy + T - 1, ox + i, oy + T);
      copiar(d, W, ox, oy + i, ox - 1, oy + i);
      copiar(d, W, ox + T - 1, oy + i, ox + T, oy + i);
    }
    copiar(d, W, ox, oy, ox - 1, oy - 1);
    copiar(d, W, ox + T - 1, oy, ox + T, oy - 1);
    copiar(d, W, ox, oy + T - 1, ox - 1, oy + T);
    copiar(d, W, ox + T - 1, oy + T - 1, ox + T, oy + T);
  }
  function copiar(d, W, x0, y0, x1, y1) {
    var a = (y0 * W + x0) * 4, b = (y1 * W + x1) * 4;
    d[b] = d[a]; d[b + 1] = d[a + 1]; d[b + 2] = d[a + 2]; d[b + 3] = d[a + 3];
  }

  // ─────────────────────────────────────────────────── LA CAPA ANIMADA
  function construir(scene, st, opts) {
    var mapa = scene.map;
    var capa = mapa && mapa.getLayer ? mapa.getLayer(opts.capa) : null;
    if (!capa || !capa.data) return false;
    var T = mapa.tileWidth;
    var lec = leerTextura(scene, opts.textura);
    if (!lec) return false;
    var firstgid = 1;
    (mapa.tilesets || []).forEach(function (ts) { if (ts && ts.image && ts.image.key === opts.textura) firstgid = ts.firstgid; });

    var W = capa.width, H = capa.height;
    var clase = new Uint8Array(W * H);       // 0 tierra, 1 orilla, 2 agua entera
    var gidDe = new Int32Array(W * H);
    var x0 = W, y0 = H, x1 = -1, y1 = -1;
    var votos = {};
    for (var y = 0; y < H; y++) {
      var fila = capa.data[y];
      for (var x = 0; x < W; x++) {
        var t = fila[x], gid = t ? t.index : -1;
        if (gid <= 0) continue;
        var info = infoGid(lec, T, firstgid, gid);
        if (!info) continue;
        clase[y * W + x] = info.ratio >= 0.9 ? 2 : 1;
        gidDe[y * W + x] = gid;
        votos[gid] = (votos[gid] || 0) + 1;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return false;

    // El azul de referencia: el de la casilla de agua más usada.
    var mejor = null;
    Object.keys(votos).forEach(function (g) { if (!mejor || votos[g] > votos[mejor]) mejor = g; });
    var pal = paleta(infoGid(lec, T, firstgid, Number(mejor)).medio, opts.vida === 'mar' ? 'mar' : 'rio');

    // Lo lejos que está cada casilla de la tierra (para oscurecer lo hondo).
    var lejos = new Uint8Array(W * H), cola = [];
    for (var i = 0; i < W * H; i++) {
      if (clase[i] !== 2) { lejos[i] = clase[i] ? 1 : 0; if (clase[i] !== 2) cola.push(i); }
      else lejos[i] = 255;
    }
    for (var c = 0; c < cola.length; c++) {
      var j = cola[c], jx = j % W, jy = (j / W) | 0, dd = lejos[j] + 1;
      var vec = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var v = 0; v < 4; v++) {
        var nx = jx + vec[v][0], ny = jy + vec[v][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx;
        if (lejos[n] === 255) { lejos[n] = Math.min(254, dd); cola.push(n); }
      }
    }
    for (i = 0; i < W * H; i++) if (lejos[i] === 255) lejos[i] = 12;

    // Las parejas (gid, fase) que se usan, y la rejilla de la capa.
    var F = PERIODO / T, parejas = {}, lista = [];
    var ancho = x1 - x0 + 1, alto = y1 - y0 + 1, datos = [];
    for (y = y0; y <= y1; y++) {
      var filaD = [];
      for (x = x0; x <= x1; x++) {
        var g = gidDe[y * W + x];
        if (!g) { filaD.push(-1); continue; }
        var clave = g + ':' + (x % F) + ':' + (y % F);
        if (!(clave in parejas)) { parejas[clave] = lista.length; lista.push([g, x % F, y % F]); }
        filaD.push(parejas[clave]);
      }
      datos.push(filaD);
    }

    // Los fotogramas: un lienzo por fotograma con todas las casillas.
    var N = lista.length, cols = Math.ceil(Math.sqrt(N)), filas = Math.ceil(N / cols);
    var TW = cols * (T + 2), TH = filas * (T + 2);
    var id = 'gfa_' + opts.textura + '_' + T + '_' + N;
    var claves = [];
    var faltan = false;
    for (var f = 0; f < FOTOS; f++) { claves.push(id + '_' + f); if (!scene.textures.exists(id + '_' + f)) faltan = true; }
    if (faltan) {
      var pats = patrones(pal, 7);
      for (f = 0; f < FOTOS; f++) {
        if (scene.textures.exists(claves[f])) scene.textures.remove(claves[f]);
        var ct = scene.textures.createCanvas(claves[f], TW, TH);
        var ctx = ct.getContext();
        var img = ctx.createImageData(TW, TH);
        for (var k = 0; k < N; k++) {
          var e = lista[k];
          pintarCasilla(img, (k % cols) * (T + 2) + 1, Math.floor(k / cols) * (T + 2) + 1, T,
                        infoGid(lec, T, firstgid, e[0]), e[1], e[2], pats[f], f, pal);
        }
        ctx.putImageData(img, 0, 0);
        ct.refresh();
      }
    }

    var tm = scene.make.tilemap({ data: datos, tileWidth: T, tileHeight: T, insertNull: true });
    var ts = tm.addTilesetImage('gf_agua', claves[0], T, T, 1, 2, 0);
    var layer = tm.createLayer(0, ts, x0 * T, y0 * T);
    if (!layer) { tm.destroy(); return false; }
    layer.setDepth(PROF_AGUA);
    // Lo hondo, más oscuro y más azul.
    layer.forEachTile(function (tile) {
      if (!tile || tile.index < 0) return;
      var l = lejos[(tile.y + y0) * W + tile.x + x0];
      var k2 = Math.min(1, Math.max(0, (l - 1) / 7));
      var r = Math.round(255 * (1 - 0.2 * k2)), gg = Math.round(255 * (1 - 0.14 * k2)), b = Math.round(255 * (1 - 0.07 * k2));
      tile.tint = (r << 16) | (gg << 8) | b;
    });

    st.T = T; st.W = W; st.H = H;
    st.clase = clase; st.lejos = lejos;
    st.tm = tm; st.ts = ts; st.layer = layer; st.claves = claves;
    st.foto = 0; st.acc = 0;
    st.caja = { x0: x0, y0: y0, x1: x1, y1: y1 };
    return true;
  }

  // ─────────────────────────────────────────────────── CONSULTAS DE AGUA
  function claseEn(st, px, py) {
    var x = Math.floor(px / st.T), y = Math.floor(py / st.T);
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return 0;
    return st.clase[y * st.W + x];
  }
  function lejosEn(st, px, py) {
    var x = Math.floor(px / st.T), y = Math.floor(py / st.T);
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return 0;
    return st.lejos[y * st.W + x];
  }
  /** Un punto de agua al azar dentro del rectángulo, al menos a `hondo` casillas de tierra. */
  function aguaAlAzar(st, rect, hondo) {
    for (var i = 0; i < 24; i++) {
      var x = az(rect.x, rect.x + rect.width), y = az(rect.y, rect.y + rect.height);
      if (claseEn(st, x, y) === 2 && lejosEn(st, x, y) >= (hondo || 1)) return { x: x, y: y };
    }
    return null;
  }

  // ───────────────────────────────────────────────────── TEXTURAS DE VIDA
  function texturasVida(scene) {
    function lienzo(clave, w, h, pintar) {
      if (scene.textures.exists(clave)) return;
      var ct = scene.textures.createCanvas(clave, w, h);
      pintar(ct.getContext(), w, h);
      ct.refresh();
    }
    lienzo('gfa_onda', 32, 14, function (x, w, h) {
      x.strokeStyle = 'rgba(235,248,255,0.95)'; x.lineWidth = 1.4;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1.5, h / 2 - 1.5, 0, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = 'rgba(235,248,255,0.35)'; x.lineWidth = 1;
      x.beginPath(); x.ellipse(w / 2, h / 2 + 0.6, w / 2 - 4, h / 2 - 3.4, 0, 0, Math.PI * 2); x.stroke();
    });
    lienzo('gfa_pez_sombra', 26, 10, function (x) {
      x.fillStyle = 'rgba(14,32,48,1)';
      x.beginPath(); x.ellipse(11, 5, 9, 3.4, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(19, 5); x.lineTo(25, 1.5); x.lineTo(24, 5); x.lineTo(25, 8.5); x.closePath(); x.fill();
    });
    lienzo('gfa_hoja', 10, 6, function (x) {
      x.fillStyle = '#7a8f2e'; x.beginPath(); x.ellipse(5, 3, 4.4, 2.2, 0.3, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#4f5f1c'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(1.5, 2.2); x.lineTo(8.5, 3.8); x.stroke();
    });
    lienzo('gfa_hoja2', 10, 6, function (x) {
      x.fillStyle = '#c08a3a'; x.beginPath(); x.ellipse(5, 3, 4.2, 2.1, -0.2, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#7d5320'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(1.5, 3.6); x.lineTo(8.5, 2.4); x.stroke();
    });
    lienzo('gfa_destello', 9, 9, function (x) {
      x.fillStyle = 'rgba(255,255,255,1)';
      x.fillRect(4, 0, 1, 9); x.fillRect(0, 4, 9, 1);
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(3, 3, 3, 3);
    });
    lienzo('gfa_gota', 3, 3, function (x) { x.fillStyle = 'rgba(230,246,255,1)'; x.fillRect(0, 0, 3, 3); });
  }

  function cargarImagenes(scene, lista) {
    var faltan = lista.filter(function (e) { return !scene.textures.exists(e[0]); });
    if (!faltan.length) return Promise.resolve();
    return new Promise(function (ok) {
      var hecho = false, fin = function () { if (!hecho) { hecho = true; ok(); } };
      faltan.forEach(function (e) { scene.load.image(e[0], e[1]); });
      scene.load.once('complete', fin);
      setTimeout(fin, 6000);
      scene.load.start();
    });
  }

  // ────────────────────────────────────────────────── LOS ADORNOS DEL RÍO
  var RIO = './Game/Objetos/rio/';
  var IMAGENES_RIO = [
    ['gfa_piedra_1', RIO + 'piedra_agua_1.png'], ['gfa_piedra_2', RIO + 'piedra_agua_2.png'],
    ['gfa_piedra_3', RIO + 'piedra_agua_3.png'], ['gfa_nenufar', RIO + 'nenufar.png'],
    ['gfa_nenufar_flor', RIO + 'nenufar_flor.png'], ['gfa_juncos', RIO + 'juncos.png'],
    ['gfa_tronco', RIO + 'tronco_flotando.png'], ['gfa_sauce', RIO + 'sauce_de_agua.png'],
    ['gfa_pez', './Game/Objetos/pesca/pes1.png'], ['gfa_pez2', './Game/Objetos/pesca/pes2.png']
  ];

  /**
   * Los sitios salen de un azar CON SEMILLA sobre las casillas de agua: todos
   * los jugadores ven las piedras en el mismo sitio, y cada vez que se entra.
   */
  /*
   * EN EL AGUA, Y UNO DE CADA (2026-10-05). "Hay maleza duplicada en el río y
   * rocas fuera del agua, también duplicadas." Dos fallos:
   *
   *   · Los juncos iban en MATAS de 1 a 3 copias del mismo dibujo con unos
   *     pocos píxeles de diferencia: se veían como el mismo junco repetido.
   *     Ahora va UNO por sitio y bien separados.
   *   · Cada adorno solo miraba la casilla de su CENTRO. Una piedra mide unos
   *     40 px y la casilla del río 16: en la primera franja de agua el dibujo
   *     se salía a la arena. Ahora se mira TODO su contorno (`enAgua`) y que
   *     esté a una distancia de la orilla que dependa de su tamaño.
   *
   * Las separaciones son por tipo (dos piedras no se ponen a menos de 260 px)
   * y además entre todos (nada encima de nada).
   */
  function colocarAdornos(st) {
    var scene = st.scene, T = st.T, rnd = semillero(20261005), out = st.adornos;
    var mar = st.vida === 'mar';
    var hondas = [], medias = [], someras = [];
    var cj = st.caja;
    for (var y = cj.y0; y <= cj.y1; y++) {
      for (var x = cj.x0; x <= cj.x1; x++) {
        var i = y * st.W + x;
        if (st.clase[i] !== 2) continue;
        var l = st.lejos[i];
        if (l === 2 || l === 3) someras.push([x, y]);    // la segunda y tercera franja de agua
        if (l >= 3 && l <= 6) medias.push([x, y]);
        if (l >= 3) hondas.push([x, y]);
      }
    }
    /* ¿Está TODO ese contorno (un rectángulo de rx × ry alrededor del punto)
       en agua entera, y a `margen` casillas de tierra como poco? */
    function enAgua(px, py, rx, ry, margen) {
      var pts = [[0, 0], [-rx, 0], [rx, 0], [0, -ry], [0, ry], [-rx, -ry], [rx, -ry], [-rx, ry], [rx, ry]];
      for (var k = 0; k < pts.length; k++) {
        var qx = px + pts[k][0], qy = py + pts[k][1];
        if (claseEn(st, qx, qy) !== 2 || lejosEn(st, qx, qy) < margen) return false;
      }
      return true;
    }
    /* LAS ESQUINAS DEL RÍO (2026-10-05): "en las esquinas del río hay
       vegetación, piedras y algas duplicadas o mal puestas". Era verdad: en
       los recodos un junco o unos nenúfares quedaban metidos en el rincón,
       pegados a dos orillas a la vez, y una piedra y un junco podían salir uno
       encima del otro (de distinto tipo bastaban 48 px). Ahora nada se pone
       en un recodo. Mirando a `D` px en las ocho direcciones:
         - tierra en un eje Y en el otro: está entre dos orillas;
         - tierra a un lado pero no en sus dos diagonales: esa orilla DOBLA
           cerca (justo debajo o encima de un escalón);
         - tierra solo en una diagonal: la punta de tierra de un recodo.
       Y entre cosas distintas hay ESPACIO_MIXTO px. */
    var D_ESQ = Math.max(80, T * 5), ESPACIO_MIXTO = 110;
    function seco(qx, qy) { return claseEn(st, qx, qy) !== 2; }
    function enEsquina(px, py) {
      var D = D_ESQ;
      var w = seco(px - D, py), e = seco(px + D, py), n = seco(px, py - D), s = seco(px, py + D);
      if ((w || e) && (n || s)) return true;
      var nw = seco(px - D, py - D), ne = seco(px + D, py - D), sw = seco(px - D, py + D), se = seco(px + D, py + D);
      if (w && !(nw && sw)) return true;
      if (e && !(ne && se)) return true;
      if (n && !(nw && ne)) return true;
      if (s && !(sw && se)) return true;
      return !(w || e || n || s) && (nw || ne || sw || se);
    }
    var puestos = [];
    function libre(px, py, sep, tipo) {
      for (var k = 0; k < puestos.length; k++) {
        var d = Math.hypot(puestos[k][0] - px, puestos[k][1] - py);
        if (d < (puestos[k][2] === tipo ? sep : ESPACIO_MIXTO)) return false;
      }
      return true;
    }
    function elegir(lista) { return lista.length ? lista[Math.floor(rnd() * lista.length)] : null; }
    function poner(lista, n, sep, tipo, cabe, fabricar) {
      for (var k = 0, intentos = 0; k < n && intentos < n * 40; intentos++) {
        var c = elegir(lista); if (!c) return;
        var px = c[0] * T + T / 2 + (rnd() - 0.5) * T * 0.5, py = c[1] * T + T / 2 + (rnd() - 0.5) * T * 0.5;
        if (!cabe(px, py) || !libre(px, py, sep, tipo)) continue;
        puestos.push([px, py, tipo]); fabricar(px, py); k++;
      }
    }
    var escala = T >= 32 ? 2.2 : 2;
    var ex = scene.textures.exists.bind(scene.textures);
    // Piedras asomando, cada una con su anillo de espuma. Lejos de la orilla.
    poner(hondas, mar ? 5 : 10, 260, 'piedra', function (px, py) {
      return enAgua(px, py, 24, 12, 3) && !enEsquina(px, py);
    }, function (px, py) {
      var n = 1 + Math.floor(rnd() * 3), k = 'gfa_piedra_' + n;
      if (!ex(k)) return;
      var anillo = scene.add.image(px, py + 2, 'gfa_onda').setDepth(PROF_PLANO).setAlpha(0.5).setScale(escala * (0.7 + n * 0.18), escala * 0.7);
      var p = scene.add.image(px, py, k).setOrigin(0.5, 0.72).setScale(escala).setDepth(py);
      out.push({ tipo: 'piedra', spr: p, anillo: anillo, fase: rnd() * 6.28, base: anillo.scaleX });
    });
    if (!mar) {
      // Nenúfares en grupitos, en el agua mansa: cada hoja entera en el agua.
      poner(medias, 8, 220, 'nenufar', function (px, py) {
        return enAgua(px, py, 30, 14, 3) && !enEsquina(px, py);
      }, function (px, py) {
        var cuantos = 2 + Math.floor(rnd() * 2);
        for (var q = 0; q < cuantos; q++) {
          var qx = px + (rnd() - 0.5) * 40, qy = py + (rnd() - 0.5) * 18;
          if (!enAgua(qx, qy, 10, 6, 3) || enEsquina(qx, qy)) continue;
          var k = rnd() < 0.28 ? 'gfa_nenufar_flor' : 'gfa_nenufar';
          if (!ex(k)) continue;
          var s = scene.add.image(qx, qy, k).setScale(escala * (0.8 + rnd() * 0.3)).setDepth(PROF_PLANO).setFlipX(rnd() < 0.5);
          out.push({ tipo: 'flota', spr: s, fase: rnd() * 6.28, y0: qy, amp: 0.6 });
        }
      });
      /* Juncos en el agua somera, UNO por sitio (ver arriba), con su anillo
         de agua al pie. El pie entero tiene que estar en el agua: en la
         primera franja (la que toca la arena) salían medio en seco. */
      /* El junco crece HACIA ARRIBA desde su pie: con solo el pie en el agua,
         en la orilla de arriba de un tramo su dibujo se subía encima de la
         tierra. Se mira también la punta (alto del dibujo a escala máxima). */
      var altoJunco = 30;
      try {
        if (ex('gfa_juncos')) altoJunco = scene.textures.get('gfa_juncos').getSourceImage().height || 30;
      } catch (e) {}
      altoJunco = altoJunco * escala * 1.15;
      poner(someras, 8, 220, 'junco', function (px, py) {
        return enAgua(px, py + 3, 10, 5, 2) && enAgua(px, py + 3 - altoJunco, 10, 4, 1) && !enEsquina(px, py);
      }, function (px, py) {
        if (!ex('gfa_juncos')) return;
        var pie = scene.add.image(px, py - 1, 'gfa_onda').setDepth(PROF_PLANO).setAlpha(0.35).setScale(0.9, 0.7);
        var s = scene.add.image(px, py + 3, 'gfa_juncos').setOrigin(0.5, 1).setScale(escala * (0.85 + rnd() * 0.3)).setDepth(py).setFlipX(rnd() < 0.5);
        out.push({ tipo: 'mece', spr: s, anillo: pie, fase: rnd() * 6.28, amp: 0.05 });
      });
      // Troncos flotando, anclados en un remanso.
      poner(medias, 2, 600, 'tronco', function (px, py) {
        return enAgua(px, py, 30, 12, 3) && !enEsquina(px, py);
      }, function (px, py) {
        if (!ex('gfa_tronco')) return;
        var s = scene.add.image(px, py, 'gfa_tronco').setScale(escala).setDepth(PROF_PLANO + 0.01).setRotation((rnd() - 0.5) * 0.5);
        out.push({ tipo: 'flota', spr: s, fase: rnd() * 6.28, y0: py, amp: 1.2 });
      });
    }
  }

  // ───────────────────────────────────────────────────── LA VIDA DEL AGUA
  function montarVida(st) {
    var scene = st.scene;
    texturasVida(scene);
    st.anillos = []; st.gotas = []; st.peces = []; st.hojas = []; st.destellos = [];
    for (var i = 0; i < 26; i++) st.anillos.push({ spr: scene.add.image(0, 0, 'gfa_onda').setVisible(false).setDepth(PROF_PLANO + 0.02), vivo: false });
    for (i = 0; i < 18; i++) st.gotas.push({ spr: scene.add.image(0, 0, 'gfa_gota').setVisible(false).setDepth(9000), vivo: false });
    var npeces = st.vida === 'mar' ? 5 : 9;
    for (i = 0; i < npeces; i++) {
      var s = scene.add.image(0, 0, 'gfa_pez_sombra').setDepth(PROF_PLANO - 0.05).setAlpha(0).setScale(st.T >= 32 ? 1.4 : 1.1);
      st.peces.push({ spr: s, vx: 0, vy: 0, destino: null, pausa: 0, salta: false, colocado: false });
    }
    if (st.vida !== 'mar') {
      for (i = 0; i < 7; i++) {
        st.hojas.push({ spr: scene.add.image(0, 0, i % 3 === 2 ? 'gfa_hoja2' : 'gfa_hoja').setDepth(PROF_PLANO + 0.01).setScale(1.6).setVisible(false), vivo: false, fase: Math.random() * 6 });
      }
    }
    for (i = 0; i < 14; i++) {
      var d = scene.add.image(0, 0, 'gfa_destello').setDepth(PROF_PLANO + 0.03).setVisible(false);
      if (window.Phaser && Phaser.BlendModes) d.setBlendMode(Phaser.BlendModes.ADD);
      st.destellos.push({ spr: d, vivo: false, nace: 0, dura: 0 });
    }
    st.proximoSalto = 0; st.proximaGota = 0;
    st.adornos = [];
    cargarImagenes(scene, IMAGENES_RIO).then(function () {
      if (!st.scene) return;
      try { colocarAdornos(st); } catch (e) { console.warn('[agua] adornos:', e); }
    });
  }

  function anillo(st, x, y, escala, dura, alfa) {
    var a = null;
    for (var i = 0; i < st.anillos.length; i++) if (!st.anillos[i].vivo) { a = st.anillos[i]; break; }
    if (!a) return;
    a.vivo = true;
    var s = a.spr;
    s.setPosition(x, y).setVisible(true).setAlpha(alfa || 0.8).setScale(0.15 * escala, 0.15 * escala);
    st.scene.tweens.add({ targets: s, scaleX: escala, scaleY: escala * 0.92, alpha: 0, duration: dura || 700, ease: 'Quad.easeOut',
      onComplete: function () { s.setVisible(false); a.vivo = false; } });
  }

  function salpicon(st, x, y, n) {
    for (var i = 0, k = 0; i < st.gotas.length && k < n; i++) {
      var g = st.gotas[i];
      if (g.vivo) continue;
      g.vivo = true; k++;
      (function (g) {
        var s = g.spr, vx = az(-26, 26), alto = az(10, 26);
        s.setPosition(x, y).setVisible(true).setAlpha(0.95).setScale(az(0.7, 1.2));
        st.scene.tweens.addCounter({ from: 0, to: 1, duration: az(320, 480), onUpdate: function (tw) {
          var t = tw.getValue();
          s.setPosition(x + vx * t, y - alto * 4 * t * (1 - t));
          s.setAlpha(0.95 * (1 - t * 0.6));
        }, onComplete: function () { s.setVisible(false); g.vivo = false; } });
      })(g);
    }
  }

  function vista(st) {
    var cam = st.scene.cameras && st.scene.cameras.main;
    return cam ? cam.worldView : null;
  }

  function moverPeces(st, dt, v) {
    var T = st.T;
    for (var i = 0; i < st.peces.length; i++) {
      var p = st.peces[i], s = p.spr;
      if (p.salta) continue;
      if (!p.colocado) {
        // Nacen cerca de lo que se ve (si hay agua), si no en cualquier sitio del río.
        var sitio = (v && aguaAlAzar(st, { x: v.x - 200, y: v.y - 200, width: v.width + 400, height: v.height + 400 }, 2)) ||
                    aguaAlAzar(st, { x: st.caja.x0 * T, y: st.caja.y0 * T, width: (st.caja.x1 - st.caja.x0 + 1) * T, height: (st.caja.y1 - st.caja.y0 + 1) * T }, 2);
        if (!sitio) continue;
        s.setPosition(sitio.x, sitio.y); p.colocado = true; p.destino = null;
      }
      // Si se ha quedado muy lejos de la cámara, se recoloca cerca.
      if (v && (s.x < v.x - 700 || s.x > v.right + 700 || s.y < v.y - 700 || s.y > v.bottom + 700)) { p.colocado = false; s.setAlpha(0); continue; }
      if (!p.destino || Math.hypot(p.destino.x - s.x, p.destino.y - s.y) < 6) {
        if (p.pausa > 0) { p.pausa -= dt; p.vx *= 0.9; p.vy *= 0.9; }
        else {
          p.destino = aguaAlAzar(st, { x: s.x - 140, y: s.y - 140, width: 280, height: 280 }, 2);
          p.pausa = Math.random() < 0.4 ? az(0.6, 2.2) : 0;
        }
      }
      if (p.destino) {
        var dx = p.destino.x - s.x, dy = p.destino.y - s.y, d = Math.hypot(dx, dy) || 1;
        var vel = 22 + (i % 3) * 7;
        p.vx += (dx / d * vel - p.vx) * Math.min(1, dt * 1.8);
        p.vy += (dy / d * vel - p.vy) * Math.min(1, dt * 1.8);
      }
      var nx = s.x + p.vx * dt, ny = s.y + p.vy * dt;
      if (claseEn(st, nx, ny) === 2) s.setPosition(nx, ny); else { p.destino = null; p.vx = -p.vx * 0.5; p.vy = -p.vy * 0.5; }
      if (Math.abs(p.vx) + Math.abs(p.vy) > 2) s.rotation = Math.atan2(p.vy, p.vx) + Math.PI;
      var hondo = Math.min(1, lejosEn(st, s.x, s.y) / 6);
      s.setAlpha(Math.min(0.3, s.alpha + dt * 0.3) * (0.7 + 0.3 * hondo));
    }
  }

  function saltarPez(st, v) {
    var cand = st.peces.filter(function (p) { return p.colocado && !p.salta && v && v.contains(p.spr.x, p.spr.y); });
    if (!cand.length) return;
    var p = cand[Math.floor(Math.random() * cand.length)], s = p.spr, scene = st.scene;
    var k = Math.random() < 0.6 ? 'gfa_pez' : 'gfa_pez2';
    if (!scene.textures.exists(k)) return;
    p.salta = true;
    var x0 = s.x, y0 = s.y, dir = p.vx >= 0 ? 1 : -1, largo = az(26, 46), alto = az(22, 40);
    var pez = scene.add.image(x0, y0, k).setScale(st.T >= 32 ? 1.1 : 0.9).setDepth(y0 + 40).setFlipX(dir < 0);
    s.setAlpha(0);
    anillo(st, x0, y0, 1.1, 650, 0.85); salpicon(st, x0, y0, 4);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 620, onUpdate: function (tw) {
      var t = tw.getValue();
      pez.setPosition(x0 + dir * largo * t, y0 - alto * 4 * t * (1 - t));
      pez.rotation = dir * (-0.9 + 1.8 * t);
    }, onComplete: function () {
      var xf = x0 + dir * largo;
      pez.destroy();
      anillo(st, xf, y0, 1.3, 800, 0.9); salpicon(st, xf, y0, 6);
      if (claseEn(st, xf, y0) === 2) s.setPosition(xf, y0);
      p.salta = false;
    } });
  }

  function moverHojas(st, dt, v, t) {
    if (!v) return;
    for (var i = 0; i < st.hojas.length; i++) {
      var h = st.hojas[i], s = h.spr;
      if (!h.vivo) {
        // Nacen arriba de lo que se ve: la corriente las trae hacia abajo.
        var sitio = aguaAlAzar(st, { x: v.x - 60, y: v.y - 120, width: v.width + 120, height: v.height * 0.5 }, 2);
        if (!sitio) continue;
        h.vivo = true; s.setPosition(sitio.x, sitio.y).setVisible(true).setAlpha(0).setRotation(Math.random() * 6.28);
        h.vel = az(10, 20);
        continue;
      }
      var nx = s.x + Math.sin(t * 0.0012 + h.fase) * 4 * dt, ny = s.y + h.vel * dt;
      var cl = claseEn(st, nx, ny);
      if (!cl || ny > v.bottom + 140) { s.setAlpha(Math.max(0, s.alpha - dt * 1.5)); if (s.alpha <= 0) { h.vivo = false; s.setVisible(false); } continue; }
      if (cl === 1) nx = s.x + (claseEn(st, s.x - 20, s.y) === 2 ? -6 : 6) * dt;   // la orilla la empuja al centro
      s.setPosition(nx, ny);
      s.rotation += Math.sin(t * 0.001 + h.fase) * 0.4 * dt;
      s.setAlpha(Math.min(0.95, s.alpha + dt * 1.2));
    }
  }

  function moverDestellos(st, dt, v, t, sol) {
    if (!v) return;
    for (var i = 0; i < st.destellos.length; i++) {
      var d = st.destellos[i];
      if (!d.vivo) {
        if (sol < 0.15 || Math.random() > dt * 1.6 * sol) continue;
        var sitio = aguaAlAzar(st, v, 1);
        if (!sitio) continue;
        d.vivo = true; d.nace = t; d.dura = az(500, 1100);
        d.spr.setPosition(sitio.x, sitio.y).setVisible(true).setScale(az(0.6, 1.2));
        continue;
      }
      var k = (t - d.nace) / d.dura;
      if (k >= 1) { d.vivo = false; d.spr.setVisible(false); continue; }
      d.spr.setAlpha(Math.sin(k * Math.PI) * 0.85 * sol);
      d.spr.rotation = k * 0.6;
    }
  }

  function moverAdornos(st, t, v, viento) {
    if (!st.adornos || !v) return;
    for (var i = 0; i < st.adornos.length; i++) {
      var a = st.adornos[i], s = a.spr;
      if (!s.active || s.x < v.x - 120 || s.x > v.right + 120 || s.y < v.y - 160 || s.y > v.bottom + 160) continue;
      if (a.tipo === 'piedra') {
        var k = 0.5 + 0.5 * Math.sin(t * 0.0021 + a.fase);
        a.anillo.setScale(a.base * (1 + 0.12 * k), a.anillo.scaleY);
        a.anillo.setAlpha(0.25 + 0.3 * (1 - k));
      } else if (a.tipo === 'flota') {
        s.y = a.y0 + Math.sin(t * 0.0016 + a.fase) * a.amp;
        s.rotation = (s.rotation * 0.98) + Math.sin(t * 0.0009 + a.fase) * 0.0008;
      } else if (a.tipo === 'mece') {
        s.rotation = Math.sin(t * (0.0016 + viento * 0.002) + a.fase) * a.amp * (1 + viento * 2);
      }
    }
  }

  function vivir(st, t, delta) {
    var dt = Math.min(0.1, delta / 1000), v = vista(st);
    var tiempo = null;
    try { tiempo = window.GFClima && window.GFClima.ahora ? window.GFClima.ahora() : null; } catch (e) {}
    var lluvia = tiempo && tiempo.activo ? tiempo.lluvia || 0 : 0;
    var viento = tiempo && tiempo.activo ? Math.min(1, tiempo.viento || 0) : 0;
    var oscuro = 0;
    try { oscuro = window.GFCiclo && window.GFCiclo.oscuridad ? window.GFCiclo.oscuridad() || 0 : 0; } catch (e) {}
    var sol = Math.max(0, 1 - oscuro * 1.6) * Math.max(0, 1 - lluvia * 1.4) * (tiempo && tiempo.activo ? 1 - Math.min(0.8, tiempo.nublado || 0) : 1);

    moverPeces(st, dt, v);
    if (t > st.proximoSalto) {
      st.proximoSalto = t + az(5000, 13000);
      saltarPez(st, v);
    }
    moverHojas(st, dt, v, t);
    moverDestellos(st, dt, v, t, sol);
    moverAdornos(st, t, v, viento);
    // La lluvia sobre el agua: anillos donde caen las gotas.
    if (lluvia > 0.05 && v && t > st.proximaGota) {
      st.proximaGota = t + 90 / Math.max(0.2, lluvia);
      var sitio = aguaAlAzar(st, v, 1);
      if (sitio) anillo(st, sitio.x, sitio.y, az(0.45, 0.8), 520, 0.6);
    }
  }

  // ───────────────────────────────────────────────────────────── MONTAJE
  function montar(scene, opts) {
    opts = opts || {};
    if (!scene || !scene.add || !scene.events || !scene.map) return null;
    if (scene.__gfAgua) return scene.__gfAgua;
    var st = { scene: scene, vida: opts.vida || null };
    var ok = false;
    try { ok = construir(scene, st, opts); } catch (e) { console.warn('[agua] no se pudo montar el agua animada:', e); }
    if (!ok) return null;
    scene.__gfAgua = st;
    if (st.vida) { try { montarVida(st); } catch (e) { console.warn('[agua] vida:', e); } }
    st.onUpdate = function (t, delta) {
      try {
        st.acc += delta;
        var paso = 1000 / FPS;
        if (st.acc >= paso) {
          st.acc %= paso;
          st.foto = (st.foto + 1) % FOTOS;
          var tex = scene.textures.get(st.claves[st.foto]);
          if (tex && tex.key !== '__MISSING') st.ts.setImage(tex);
        }
        if (st.vida) vivir(st, t, delta);
      } catch (e) {}
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    console.log('💧 agua animada: ' + st.claves.length + ' fotogramas, capa ' +
                (st.caja.x1 - st.caja.x0 + 1) + 'x' + (st.caja.y1 - st.caja.y0 + 1) + (st.vida ? ' + vida (' + st.vida + ')' : ''));
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfAgua;
    if (!st) return;
    scene.__gfAgua = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    var matar = function (o) { try { if (o && o.destroy) o.destroy(); } catch (e) {} };
    ['anillos', 'gotas', 'peces', 'hojas', 'destellos'].forEach(function (k) { (st[k] || []).forEach(function (o) { matar(o.spr); }); });
    (st.adornos || []).forEach(function (a) { matar(a.spr); matar(a.anillo); });
    try { st.tm.destroy(); } catch (e) {}
    st.scene = null;
  }

  window.GFAgua = {
    montar: montar,
    desmontar: desmontar,
    /** ¿Es agua ese punto del mundo? 0 no, 1 orilla, 2 agua entera. */
    claseEn: function (scene, x, y) { var st = scene && scene.__gfAgua; return st ? claseEn(st, x, y) : 0; },
    /** Un anillo en el agua (lo puede usar la pesca, un objeto que cae...). */
    anillo: function (scene, x, y, escala) { var st = scene && scene.__gfAgua; if (st && st.anillos) anillo(st, x, y, escala || 1, 700, 0.85); },
    estado: function (scene) {
      var st = scene && scene.__gfAgua;
      if (!st) return null;
      return { foto: st.foto, fotos: st.claves.length, casillas: st.tm ? st.tm.width + 'x' + st.tm.height : null,
               peces: st.peces ? st.peces.filter(function (p) { return p.colocado; }).length : 0,
               adornos: st.adornos ? st.adornos.length : 0 };
    },
    _interno: { infoGid: infoGid, patrones: patrones, paleta: paleta, ruido: ruido }
  };
})();
