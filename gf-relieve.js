/* ===========================================================================
 * EL RELIEVE 2.5D DE PERSONAJES, ÁRBOLES Y CASAS                  (2026-10-12)
 *
 * "La mascota, los soulbound y los NPC también en 2.5D." El usuario eligió
 * conservar SU dibujo (sus PNG no se tocan) y darle volumen. Esto lo hace al
 * cargar cada textura, sobre la imagen ya descargada:
 *
 *   · ALTURA POR PARTES. Las líneas oscuras del dibujo separan cabeza, brazo,
 *     torso, pierna… Cada parte se abomba por su cuenta (la distancia de cada
 *     píxel a su borde) y la silueta entera un poco: así el brazo queda
 *     delante del torso y no todo como un cojín.
 *   · LUZ ARRIBA A LA IZQUIERDA (la de todo el juego) en TRES bandas: un poco
 *     más claro de cara a la luz, un poco más oscuro y frío en la sombra, y el
 *     color del dibujo en medio. Sin degradados ni tramado.
 *   · SIN MOTAS: un píxel cuya banda no comparte ningún vecino toma la de
 *     ellos (el dueño del juego tiene tripofobia).
 *   · SOMBRA DE CONTACTO: las filas de abajo (los pies), algo más oscuras.
 *   · Las líneas del dibujo (contorno) no se tocan.
 *
 * A QUÉ TEXTURAS: el jugador (`player…`), los jugadores remotos
 * (`sb_<personaje>_player_…`), las poses de pescar (`gfp_…`), la mascota
 * (`perro_…`, y en la arena `bz_esp_perro_…`) y los NPC (`NPC…`). Las claves temporales de gf-soulbound
 * (`__sb_tmp_…`) no: se procesa la textura definitiva, una vez.
 *
 * ÁRBOLES Y CASAS (2026-10-12): el usuario prefirió su dibujo con relieve a
 * remodelarlos en 3D. Los árboles, arbustos, tocones y troncos llevan el
 * mismo relieve con el radio acotado (una copa grande no se vuelve un
 * cojín). Las casas y el molino llevan el suyo (relieveCasa: planos del
 * tejado, sombra bajo los aleros, cristal hundido y bisel por pieza). El pozo
 * NO: gf-animales mide el azul de su agua leyendo los píxeles. Las rocas
 * tampoco.
 *
 * CÓMO: escucha 'addtexture' del gestor de texturas del juego y cambia la
 * imagen de la fuente por un lienzo procesado (TextureSource.update() lo sube
 * a la GPU). Los fotogramas, las animaciones y la silueta (alfa) quedan igual,
 * así que las sombras proyectadas y las colisiones no cambian.
 *
 *   GFRelieve.procesarImagen(img) -> lienzo   (también para pruebas)
 *   GFRelieve.claveValida('player_down_1') -> true
 *   GFRelieve.activo = false                   (lo apaga para lo que venga)
 * ======================================================================== */
(function () {
  'use strict';

  // [patrón de la clave, fuerza, radio máximo, sin sombra en la piel].
  // (2026-10-12) "Los soulbound tienen una sombra en la barbilla que se ve fea
  // y el perro se ve muy sombreado": en la piel (cara, barbilla, manos) nunca
  // va la banda de sombra, y personajes y perro llevan menos fuerza.
  // En la arena, solo el perro: los demás luchadores son animales, ya en 3D.
  var PATRONES = [
    [/^player(_|$)/, 0.55, 0, true], [/^sb_[^_].*_player_/, 0.55, 0, true], [/^gfp_/, 0.55, 0, true],
    [/^perro_/, 0.4, 0, true], [/^NPC/, 0.55, 0, true], [/^bz_esp_perro_/, 0.4, 0, true],
    // Árboles, arbustos, tocones y troncos del pueblo, del mapa salvaje y los
    // dos pinos del menú (`arbolxd`).
    [/^(pinos_png|arbol_png|arbustos?_png|arbusto_formado\d*_png|arbolxd)$/, 1, 9], [/^tronco_/, 1, 9], [/^sv_arbol_/, 1, 9],
    // La estatua del gato, las farolas y los pilares del portal: lo mismo, más suave.
    [/^(estatua_gato_png|postas(_encendido)?_png|pilar_portal\d_png)$/, 0.8, 6],
    // Las casas y el molino: su propio relieve (ver relieveCasa).
    [/^casa_.*_png$/, 1, 0, false, 'casa'], [/^molino_png$/, 1, 0, false, 'casa']
  ];
  var LUZ = (function () { var v = [-0.55, -0.72, 0.42], n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();
  var CLARO = [255, 246, 220], SOMBRA = [40, 44, 78];
  var hechos = typeof WeakSet === 'function' ? new WeakSet() : null;

  /** { fuerza, radioMax } de la clave, o null si no lleva relieve. */
  function opcionesDe(k) {
    k = String(k || '');
    for (var i = 0; i < PATRONES.length; i++) {
      if (PATRONES[i][0].test(k)) return { fuerza: PATRONES[i][1], radioMax: PATRONES[i][2], piel: !!PATRONES[i][3], modo: PATRONES[i][4] || '' };
    }
    return null;
  }
  function claveValida(k) { return !!opcionesDe(k); }

  /** Distancia (chaflán 3-4, en píxeles) de cada píxel de `dentro` al exterior. */
  function distancia(dentro, w, h) {
    var INF = 1e9, d = new Float64Array(w * h), x, y, i, v;
    for (i = 0; i < w * h; i++) d[i] = dentro[i] ? INF : 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!d[i]) continue;
      v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x;
      if (!d[i]) continue;
      v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
    for (i = 0; i < w * h; i++) d[i] = d[i] >= INF ? 0 : d[i] / 3;
    return d;
  }

  /** ¿Es piel? (tono cálido, ni gris ni saturado, no oscuro): la del juego
      va del rosado claro al moreno. */
  function esPiel(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255;
    if (mx === mn || v < 0.42) return false;
    var s = (mx - mn) / mx, hh;
    if (mx === r) hh = ((g - b) / (mx - mn) + 6) % 6;
    else if (mx === g) hh = (b - r) / (mx - mn) + 2;
    else hh = (r - g) / (mx - mn) + 4;
    hh /= 6;
    return (hh < 0.13 || hh > 0.95) && s > 0.08 && s < 0.65;
  }

  /** Aplica el relieve a los píxeles RGBA (`px`, se modifica) de w x h.
      `op.fuerza` (0-1) lo suaviza; `op.radioMax` acota el abombado. */
  function relieve(px, w, h, op) {
    var fuerza = op && op.fuerza != null ? op.fuerza : 1;
    var radioMax = op && op.radioMax ? op.radioMax : 0;
    var conPiel = !!(op && op.piel);
    var n = w * h, i, x, y;
    var opaco = new Uint8Array(n), parte = new Uint8Array(n), piel = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      var o = i * 4;
      if (px[o + 3] < 128) continue;
      opaco[i] = 1;
      var l = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
      if (l >= 0.13) parte[i] = 1;            // lo de dentro (no el contorno)
      if (conPiel && esPiel(px[o], px[o + 1], px[o + 2])) piel[i] = 1;
    }
    var R = Math.max(2.5, Math.min(w, h) / 7);
    if (radioMax) R = Math.min(R, Math.max(2.5, radioMax));
    var dp = distancia(parte, w, h), dt = distancia(opaco, w, h);
    var alt = new Float64Array(n);
    for (i = 0; i < n; i++) {
      alt[i] = 0.65 * Math.sqrt(Math.min(1, dp[i] / R)) + 0.35 * Math.sqrt(Math.min(1, dt[i] / (R * 2.2)));
    }
    // Suavizado 3x3 (con el borde repetido, como el prototipo).
    var suave = new Float64Array(n);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var s = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
        s += alt[yy * w + xx];
      }
      suave[y * w + x] = s / 9;
    }
    // La banda de cada píxel: +1 de cara a la luz, -1 en sombra, 0 el dibujo.
    var banda = new Int8Array(n);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!parte[i]) continue;
      var gx = x === 0 ? suave[i + 1] - suave[i] : (x === w - 1 ? suave[i] - suave[i - 1] : (suave[i + 1] - suave[i - 1]) / 2);
      var gy = y === 0 ? suave[i + w] - suave[i] : (y === h - 1 ? suave[i] - suave[i - w] : (suave[i + w] - suave[i - w]) / 2);
      var nx = -gx * 2.4, ny = -gy * 2.4, nz = 0.55, L = Math.hypot(nx, ny, nz);
      var d = (nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]) / L;
      banda[i] = d > 0.78 ? 1 : (d < 0.42 ? -1 : 0);
    }
    // Fuera motas: si tres vecinos coinciden y él no comparte ninguno, toma el suyo.
    var final = new Int8Array(banda);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!parte[i]) continue;
      var vec = [];
      if (y > 0 && parte[i - w]) vec.push(banda[i - w]);
      if (y < h - 1 && parte[i + w]) vec.push(banda[i + w]);
      if (x > 0 && parte[i - 1]) vec.push(banda[i - 1]);
      if (x < w - 1 && parte[i + 1]) vec.push(banda[i + 1]);
      if (vec.length >= 3 && vec.indexOf(banda[i]) < 0) {
        var mejor = vec[0], cuenta = 0;
        for (var k = 0; k < vec.length; k++) {
          var c = 0;
          for (var j = 0; j < vec.length; j++) if (vec[j] === vec[k]) c++;
          if (c > cuenta) { cuenta = c; mejor = vec[k]; }
        }
        final[i] = mejor;
      }
    }
    // El fondo de la figura (los pies): las tres últimas filas, algo más oscuras.
    var fondo = -1;
    for (y = h - 1; y >= 0 && fondo < 0; y--) for (x = 0; x < w; x++) if (opaco[y * w + x]) { fondo = y; break; }
    var aL = 0.22 * fuerza, aS = 0.26 * fuerza, aF = 1 - 0.14 * fuerza;
    for (i = 0; i < n; i++) {
      if (!parte[i]) continue;
      var p = i * 4, f = 1;
      if (piel[i] && final[i] === -1) final[i] = 0;     // la cara no se ensombrece
      if (final[i] === 1) {
        px[p] = px[p] * (1 - aL) + CLARO[0] * aL; px[p + 1] = px[p + 1] * (1 - aL) + CLARO[1] * aL; px[p + 2] = px[p + 2] * (1 - aL) + CLARO[2] * aL;
      } else if (final[i] === -1) {
        px[p] = px[p] * (1 - aS) + SOMBRA[0] * aS; px[p + 1] = px[p + 1] * (1 - aS) + SOMBRA[1] * aS; px[p + 2] = px[p + 2] * (1 - aS) + SOMBRA[2] * aS;
      }
      if (fondo >= 0 && ((i / w) | 0) >= fondo - 2 && !piel[i]) f = aF;
      if (f !== 1) { px[p] *= f; px[p + 1] *= f; px[p + 2] *= f; }
    }
    return px;
  }

  /** Tono, saturación y valor (0-1). */
  function hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, hh = 0;
    if (d > 0) {
      if (mx === r) hh = ((g - b) / d + 6) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh /= 6;
    }
    return [hh, mx ? d / mx : 0, mx / 255];
  }

  /* EL RELIEVE DE LAS CASAS (2026-10-12). "Las otras casas no tienen relieve":
   * con el de los personajes casi no se notaba (cada teja y cada ladrillo,
   * separados por las líneas del dibujo, se abombaban solos) y en las paredes
   * dejaba manchas. Una casa no es un cojín: tiene planos y salientes.
   *   · TEJADO POR PLANOS: el tejado es lo azul oscuro; cada trozo suelto es un
   *     plano. Si su borde de arriba sube hacia la derecha (el faldón izquierdo
   *     de un tejado a dos aguas) mira a la luz y se aclara; si baja, se
   *     oscurece. Los de frente se quedan como están.
   *   · SOMBRA BAJO EL TEJADO: lo que queda justo debajo de un borde del tejado
   *     (el hastial, la pared) se oscurece en dos franjas; y bajo el alero (la
   *     fila donde la silueta se estrecha por los dos lados), una franja más.
   *   · BISEL DE CADA PIEZA (teja, ladrillo, viga, marco): su borde de arriba y
   *     de la izquierda con luz, el de abajo y de la derecha en sombra, solo en
   *     piezas de 3 píxeles o más (sin motas).
   *   · CRISTAL HUNDIDO: el cristal (azul claro) lleva la sombra del marco
   *     arriba y a la izquierda, como un hueco.
   *   · BASE: las filas de abajo, más oscuras (el contacto con el suelo).
   * La silueta (alfa) no cambia. Solo en JS: los humanoides que hornea
   * tools/gf_relieve.py usan el otro modo. */
  function relieveCasa(px, w, h, op) {
    var fu = op && op.fuerza != null ? op.fuerza : 1;
    var n = w * h, i, x, y, o, c;
    var opaco = new Uint8Array(n), parte = new Uint8Array(n), tejado = new Uint8Array(n), cristal = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      o = i * 4;
      if (px[o + 3] < 128) continue;
      opaco[i] = 1;
      if ((0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255 < 0.13) continue;
      parte[i] = 1;
      c = hsv(px[o], px[o + 1], px[o + 2]);
      if (c[0] > 0.55 && c[0] < 0.78 && c[1] > 0.18) { if (c[2] < 0.6) tejado[i] = 1; else cristal[i] = 1; }
    }
    function aclara(j, a) {
      a *= fu; var p = j * 4;
      px[p] += (255 - px[p]) * a; px[p + 1] += (248 - px[p + 1]) * a; px[p + 2] += (228 - px[p + 2]) * a;
    }
    function oscurece(j, a) {
      a *= fu; var p = j * 4;
      px[p] = px[p] * (1 - a) + 30 * a; px[p + 1] = px[p + 1] * (1 - a) + 34 * a; px[p + 2] = px[p + 2] * (1 - a) + 66 * a;
    }
    function en(xx, yy) { return xx >= 0 && yy >= 0 && xx < w && yy < h && parte[yy * w + xx] === 1; }

    // 1) Los planos del tejado: cada trozo suelto, por la pendiente de su borde de arriba.
    var lab = new Int32Array(n), pila = new Int32Array(n), arriba = new Int32Array(w).fill(-1), nLab = 0;
    for (i = 0; i < n; i++) {
      if (!tejado[i] || lab[i]) continue;
      nLab++;
      var tope = 0, miembros = [];
      pila[tope++] = i; lab[i] = nLab;
      while (tope) {
        var q = pila[--tope], qx = q % w;
        miembros.push(q);
        if (qx > 0 && tejado[q - 1] && !lab[q - 1]) { lab[q - 1] = nLab; pila[tope++] = q - 1; }
        if (qx < w - 1 && tejado[q + 1] && !lab[q + 1]) { lab[q + 1] = nLab; pila[tope++] = q + 1; }
        if (q >= w && tejado[q - w] && !lab[q - w]) { lab[q - w] = nLab; pila[tope++] = q - w; }
        if (q + w < n && tejado[q + w] && !lab[q + w]) { lab[q + w] = nLab; pila[tope++] = q + w; }
      }
      if (miembros.length < 60) continue;
      var cols = [], k;
      for (k = 0; k < miembros.length; k++) {
        x = miembros[k] % w; y = (miembros[k] / w) | 0;
        if (arriba[x] < 0) { cols.push(x); arriba[x] = y; } else if (y < arriba[x]) arriba[x] = y;
      }
      var sx = 0, sy = 0, sxx = 0, sxy = 0, m = cols.length;
      for (k = 0; k < m; k++) { x = cols[k]; y = arriba[x]; sx += x; sy += y; sxx += x * x; sxy += x * y; arriba[x] = -1; }
      if (m < 8) continue;
      var den = m * sxx - sx * sx, pend = den ? (m * sxy - sx * sy) / den : 0;
      if (pend < -0.3) for (k = 0; k < miembros.length; k++) aclara(miembros[k], 0.12);
      else if (pend > 0.3) for (k = 0; k < miembros.length; k++) oscurece(miembros[k], 0.16);
    }

    // 2) El bisel de cada pieza (el cristal no: va hundido, en el paso 3).
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!parte[i] || cristal[i]) continue;
      var arr = !en(x, y - 1) && en(x, y + 1) && en(x, y + 2);
      var aba = !en(x, y + 1) && en(x, y - 1) && en(x, y - 2);
      if (arr) aclara(i, 0.2);
      else if (aba) oscurece(i, 0.2);
      else if (!en(x - 1, y) && en(x + 1, y) && en(x + 2, y)) aclara(i, 0.12);
      else if (!en(x + 1, y) && en(x - 1, y) && en(x - 2, y)) oscurece(i, 0.12);
    }

    // 3) El cristal hundido: sombra del marco arriba (dos filas) y a la izquierda.
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!cristal[i]) continue;
      var c1 = !en(x, y - 1);
      if (c1) oscurece(i, 0.34);
      else if (!en(x, y - 2)) oscurece(i, 0.18);
      if (!en(x - 1, y) && !c1) oscurece(i, 0.2);
    }

    // 4) La sombra bajo el tejado: a 1-3 píxeles de su borde, más; a 4-6, menos.
    var dist = new Int16Array(n).fill(99);
    for (x = 0; x < w; x++) {
      var ult = -1;
      for (y = 0; y < h; y++) {
        i = y * w + x;
        if (tejado[i]) ult = y;
        else if (ult >= 0) dist[i] = Math.min(99, y - ult);
      }
    }
    for (i = 0; i < n; i++) {
      if (!parte[i] || tejado[i]) continue;
      if (dist[i] <= 3) oscurece(i, 0.34);
      else if (dist[i] <= 6) oscurece(i, 0.16);
    }

    // 5) El alero: donde la silueta se estrecha por los dos lados, franja en la pared.
    var izq = new Int32Array(h).fill(-1), der = new Int32Array(h).fill(-1);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (opaco[y * w + x]) { if (izq[y] < 0) izq[y] = x; der[y] = x; }
    var alero = new Uint8Array(n);
    for (y = 1; y < h - 1; y++) {
      if (izq[y - 1] < 0 || izq[y] < 0) continue;
      if (izq[y] - izq[y - 1] >= 2 && der[y - 1] - der[y] >= 2 && der[y] - izq[y] > w * 0.3) {
        for (var f = 0; f < 4 && y + f < h; f++) for (x = izq[y]; x <= der[y]; x++) alero[(y + f) * w + x] = 1;
      }
    }
    for (i = 0; i < n; i++) if (alero[i] && parte[i] && !tejado[i] && dist[i] > 6) oscurece(i, 0.3);

    // 6) La base: las filas de abajo, más oscuras.
    var fondo = -1;
    for (y = h - 1; y >= 0 && fondo < 0; y--) if (izq[y] >= 0) fondo = y;
    if (fondo >= 0) for (y = Math.max(0, fondo - 6); y <= fondo; y++) {
      var mul = 1 - (y >= fondo - 2 ? 0.16 : 0.07) * fu;
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!parte[i]) continue;
        o = i * 4; px[o] *= mul; px[o + 1] *= mul; px[o + 2] *= mul;
      }
    }
    return px;
  }

  /** Un lienzo con la imagen `img` en relieve (null si no se puede leer). */
  function procesarImagen(img, op) {
    var w = img && (img.naturalWidth || img.width), h = img && (img.naturalHeight || img.height);
    if (!w || !h || w * h > 512 * 512) return null;       // solo sprites, nunca hojas enormes
    if (typeof document === 'undefined') return null;
    var lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    var ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    var datos;
    try { datos = ctx.getImageData(0, 0, w, h); } catch (e) { return null; }   // imagen de otro origen
    if (op && op.modo === 'casa') relieveCasa(datos.data, w, h, op);
    else relieve(datos.data, w, h, op);
    ctx.putImageData(datos, 0, 0);
    if (hechos) hechos.add(lienzo);
    return lienzo;
  }

  /** Pone el relieve a una textura ya creada (si es de las que llevan). */
  function procesarTextura(textura) {
    var op = api.activo && textura ? opcionesDe(textura.key) : null;
    if (!op) return false;
    var fuente = textura.source && textura.source[0];
    if (!fuente || fuente.isRenderTexture || fuente.isVideo) return false;
    var img = fuente.image;
    if (!img || (hechos && hechos.has(img))) return false;
    if (img.complete === false) return false;
    var lienzo = procesarImagen(img, op);
    if (!lienzo) return false;
    try {
      fuente.image = lienzo;
      fuente.isCanvas = true;
      if (fuente.renderer && fuente.renderer.gl && fuente.glTexture) fuente.update();
      return true;
    } catch (e) {
      // Si la GPU no la acepta, se deja la imagen de siempre.
      try { fuente.image = img; fuente.isCanvas = false; } catch (e2) {}
      return false;
    }
  }

  var instalado = null;
  function instalar(game) {
    if (!game || !game.textures || instalado === game) return false;
    if (instalado && instalado.textures) instalado.textures.off('addtexture', alAnadir);
    instalado = game;
    game.textures.on('addtexture', alAnadir);
    // Lo que ya estuviera cargado.
    try {
      Object.keys(game.textures.list).forEach(function (k) { procesarTextura(game.textures.list[k]); });
    } catch (e) {}
    try {
      game.events.once('destroy', function () {
        if (instalado === game) { game.textures.off('addtexture', alAnadir); instalado = null; }
      });
    } catch (e) {}
    return true;
  }
  function alAnadir(clave, textura) {
    try { procesarTextura(textura); } catch (e) { console.warn('[relieve] ' + clave, e); }
  }

  // Se engancha solo en cuanto exista el juego (app.js lo crea después).
  var intentos = 0;
  var reloj = setInterval(function () {
    intentos++;
    var g = window.game;
    if (g && g.textures && g.isBooted !== false) {
      if (instalar(g) || instalado === g) clearInterval(reloj);
    }
    if (intentos > 1200) clearInterval(reloj);       // 60 s: no hay juego en esta página
  }, 50);

  var api = {
    activo: true,
    instalar: instalar,
    claveValida: claveValida,
    procesarImagen: procesarImagen,
    procesarTextura: procesarTextura,
    _interno: { relieve: relieve, relieveCasa: relieveCasa, distancia: distancia }
  };
  window.GFRelieve = api;
})();
