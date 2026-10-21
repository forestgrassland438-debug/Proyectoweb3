/* ===========================================================================
 * gf-soulbound-custom.js — PERSONALIZAR EL SOULBOUND             (2026-10-20)
 * ===========================================================================
 *
 * "En el botón redondo de NFT, para los Soulbound: elegir un personaje y
 * cambiarle el cabello según sea mujer u hombre, la ropa, el color, la cara,
 * los ojos y más; con ropa sencilla, como son los Soulbound."
 *
 * EL ASPECTO VIAJA EN EL ID DEL PERSONAJE
 *   'personaje3--m2a4c1b7f' = el personaje 3 con este aspecto. El id es un
 *   nombre corto ([A-Za-z0-9_-], ≤ 40) que el servidor ya guarda y la sala ya
 *   reparte (soulbound): sin tocar el servidor, los demás jugadores te ven
 *   igual que tú. El código: género, peinado, pelo, piel, ojos, camisa,
 *   pantalón, zapatos y barba (un carácter cada uno, en base 36).
 *
 * CÓMO SE PINTA
 *   tools/generar-soulbound-partes.py deja, por personaje y peinado, un mapa
 *   de partes de sus 28 fotogramas (cada píxel: qué parte es y su tono). Aquí
 *   se colorea con las paletas elegidas y salen 28 imágenes y el retrato;
 *   gf-soulbound.js las usa como si fueran las de la carpeta del personaje
 *   (ruta()/rutaPerfil() devuelven estas). Mismo tamaño y mismo centro que
 *   los PNG originales: los pies y las colisiones no se mueven.
 *
 *   Limitación conocida: las poses de pescar y de la espada son las del
 *   personaje base (salen de otros PNG).
 *
 * SEGUNDA VUELTA (2026-10-21): "errores en el ojo o la cara, el perfil no se
 * ajusta ni se ve como los de antes, más cabellos, y no se diferencia el
 * masculino del femenino".
 *   · Los ojos llegan por PAPEL (códigos 30-35: blanco, iris, iris claro,
 *     pupila, brillo, párpado) y la piel con poco contraste.
 *   · Mujer: banderas en el azul del mapa (201 pestaña, 202 labios) y FALDA
 *     (un segundo atlas, <personaje>_falda, encima del de su peinado). El id
 *     lleva un décimo carácter opcional: '1' = falda.
 *   · El RETRATO es el de siempre: la tarjeta (marco "G…F" y fondo azul,
 *     aquí en datos: sin otra descarga) con derecha_1 en su sitio (14, 10).
 *
 * TERCERA VUELTA (2026-10-21): los peinados dibujados se quitaron (boliche en
 *   la frente, contorno desigual, "cabellos de los 80"). Cada peinado es una
 *   CABEZA del arte original y el cuerpo, el original del género elegido
 *   (atlasDe). Sin barba. El id no cambia de forma.
 * ======================================================================== */
(function (global) {
  'use strict';
  if (global.GFSoulboundCustom) return;

  var RUTA = './Game/Sprites/Soulbound/partes/';
  var V = '20261021b';
  /* (2026-10-21, tercera vuelta) "Con el botón male/female se cambia por uno
     feo, con menos gráficos que el soulbound: boliche en la frente, contorno
     ancho y no ancho, cabellos de los 80." Ya no hay peinados dibujados: cada
     peinado es una de las 8 CABEZAS del arte original (tools/gf_cabezas.py),
     y el cuerpo es el del personaje o, con el otro género, el original de ese
     cuerpo (el 1, hombre; el 2, mujer). ESTILOS[i] = el personaje de la cabeza. */
  var ESTILOS = ['orig', 'personaje1', 'personaje2', 'personaje8', 'personaje9', 'personaje10', 'personaje11',
                 'personaje12', 'personaje13'];
  var NOMBRE_ESTILO = { orig: 'Original', personaje1: 'Spiky', personaje2: 'Curly', personaje8: 'Straw hat',
                        personaje9: 'Sun hat', personaje10: 'Blue beanie', personaje11: 'Green beanie',
                        personaje12: 'Bandana', personaje13: 'Hood' };
  var POR_GENERO = { m: ['orig', 'personaje1', 'personaje8', 'personaje10', 'personaje12', 'personaje2', 'personaje9', 'personaje11', 'personaje13'],
                     f: ['orig', 'personaje2', 'personaje9', 'personaje11', 'personaje13', 'personaje1', 'personaje8', 'personaje10', 'personaje12'] };
  // Los dos cuerpos del arte original y la forma de cabeza de cada personaje
  // (dentro de un cuerpo, las cabezas son la misma con otros colores).
  var MUJERES = { personaje2: 1, personaje4: 1, personaje6: 1, personaje9: 1, personaje11: 1, personaje13: 1 };
  var FORMA = { personaje3: 'personaje1', personaje5: 'personaje1', personaje7: 'personaje1',
                personaje4: 'personaje2', personaje6: 'personaje2' };
  function generoDe(per) {
    if (Object.prototype.hasOwnProperty.call(MUJERES, per)) return 'f';
    try { var f = global.GFSoulbound && global.GFSoulbound.ficha(per); if (f && f.genero === 'female') return 'f'; } catch (e) {}
    return 'm';
  }
  function formaDe(per) { return Object.prototype.hasOwnProperty.call(FORMA, per) ? FORMA[per] : per; }
  /** El atlas de partes de un aspecto: <cuerpo>_orig o <cuerpo>_<cabeza>. */
  function atlasDe(o) {
    var cuerpo = generoDe(o.base) === o.genero ? o.base : (o.genero === 'f' ? 'personaje2' : 'personaje1');
    var cabeza = o.estilo ? ESTILOS[o.estilo] : null;
    if (!cabeza) return cuerpo === o.base ? cuerpo + '_orig' : cuerpo + '_' + formaDe(o.base);
    return cuerpo + '_' + cabeza;
  }
  function cuerpoDe(o) { return atlasDe(o).split('_')[0]; }
  var PELO = ['#2a2220', '#4a3020', '#6a4a30', '#8a5a32', '#c0662a', '#d9a441', '#e8d68a', '#bfbfc4', '#f2eee6', '#3a5aa8', '#7a3a8a', '#c94a6a'];
  var PIEL = ['#f2d3b8', '#e8c3a0', '#d2a07a', '#b8865e', '#a8714e', '#7a4a30'];
  var OJOS = ['#3a2a20', '#5a3a1e', '#7a5a2a', '#3d6fa8', '#4f93c4', '#3e7a4c', '#4f8a3a', '#56606c', '#6a5a8a', '#8a5a1e'];
  var ROPA = ['#2a2a30', '#f2eee6', '#b8423a', '#d9822b', '#e3c46a', '#4f7a4a', '#2f6f8f', '#3c5a8a',
              '#6a4a8a', '#8a4a7a', '#7a5a3a', '#5f6670', '#a8a8b0', '#1f3a5a', '#4a3a2a', '#c98a6a'];
  var CAMPOS = ['genero', 'estilo', 'pelo', 'piel', 'ojos', 'camisa', 'pantalon', 'zapatos', 'barba'];
  var DIRS = { derecha: 'derecha', izquierda: 'izquierda', arriba: 'arriba', abajo: 'abajo' };
  var CONTORNO = [22, 18, 16];

  var cache = Object.create(null);     // id -> { urls: {carpeta_n: dataURL}, perfil: dataURL }
  var enCurso = Object.create(null);
  var fallidos = Object.create(null);
  var orden = new Map(), atlas = new Map(), cola = [], activos = 0, destruido = false, panelActual = null, canceladores = new Set();
  var MAX_CACHE = 24, MAX_ATLAS = 12, MAX_COLA = 32;
  function tocar(id) { orden.delete(id); orden.set(id, true); }
  function podar() {
    var actual = global.GFSoulbound && global.GFSoulbound.actual();
    while (orden.size > MAX_CACHE) {
      var id = Array.from(orden.keys()).find(function (k) { return k !== actual; });
      if (!id) break; orden.delete(id); delete cache[id];
    }
    var keys = Object.keys(fallidos);
    while (keys.length > 64) delete fallidos[keys.shift()];
  }
  function programar(fn) {
    if (destruido || cola.length >= MAX_COLA) return Promise.resolve(false);
    return new Promise(function (resolve, reject) { cola.push({ fn: fn, resolve: resolve, reject: reject }); bombear(); });
  }
  function bombear() {
    while (!destruido && activos < 2 && cola.length) {
      (function (trabajo) { activos++; Promise.resolve().then(trabajo.fn).then(trabajo.resolve, trabajo.reject).finally(function () { activos--; bombear(); }); })(cola.shift());
    }
  }

  function esCustom(id) { return typeof id === 'string' && id.indexOf('--') > 0; }
  function base(id) { var i = String(id || '').indexOf('--'); return i > 0 ? id.slice(0, i) : id; }

  /** 'personaje3--m2a4c1b7f0' -> { base, genero, estilo, ... } (índices). */
  function decodificar(id) {
    if (!esCustom(id) || id.length > 64 || !/^[A-Za-z0-9_-]{1,40}$/.test(base(id))) return null;
    var c = id.slice(id.indexOf('--') + 2);
    if (c.length < CAMPOS.length || !/^[mf][0-9a-z]+$/.test(c)) return null;
    var o = { base: base(id) };
    o.genero = c.charAt(0) === 'f' ? 'f' : 'm';
    var num = function (k) { var v = parseInt(c.charAt(k), 36); return Number.isFinite(v) ? v : 0; };
    o.estilo = Math.min(ESTILOS.length - 1, num(1));
    o.pelo = Math.min(PELO.length - 1, num(2));
    o.piel = Math.min(PIEL.length - 1, num(3));
    o.ojos = Math.min(OJOS.length - 1, num(4));
    o.camisa = Math.min(ROPA.length - 1, num(5));
    o.pantalon = Math.min(ROPA.length - 1, num(6));
    o.zapatos = Math.min(ROPA.length - 1, num(7));
    o.barba = num(8) ? 1 : 0;
    // (2026-10-21) El décimo carácter (opcional): la falda. Los ids de antes
    // (nueve) siguen valiendo tal cual.
    o.falda = c.length > CAMPOS.length && num(CAMPOS.length) ? 1 : 0;
    return o;
  }
  function codificar(o) {
    var b = function (v) { return Math.max(0, v | 0).toString(36); };
    return o.base + '--' + (o.genero === 'f' ? 'f' : 'm') + b(o.estilo) + b(o.pelo) + b(o.piel) + b(o.ojos) +
           b(o.camisa) + b(o.pantalon) + b(o.zapatos) + (o.barba ? '1' : '0') + (o.falda ? '1' : '');
  }

  // ── Las paletas (como gf_arte.rampa: de claro a oscuro) ─────────────────
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rampa(hex, n, arriba, abajo) {
    var c = rgb(hex), out = [];
    for (var k = 0; k < n; k++) {
      var t = n === 1 ? 0 : k / (n - 1);              // 0 claro … 1 oscuro
      var luz = arriba * (1 - t) - abajo * t;
      out.push(c.map(function (v) { return Math.round(luz >= 0 ? v + (255 - v) * luz : v * (1 + luz)); }));
    }
    return out;
  }
  function mezclar(a, b, t) { return [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * t); }); }
  function paletas(o) {
    // (2026-10-21) La piel con poco contraste (con 0.34 la nariz y la mandíbula
    // salían como manchas) y el ojo por papel (tools/generar-soulbound-partes.py).
    var pelo = rampa(PELO[o.pelo], 4, 0.3, 0.5), piel = rampa(PIEL[o.piel], 3, 0.12, 0.2);
    var ojo = rgb(OJOS[o.ojos]), blanco = [255, 255, 255];
    return {
      // (2026-10-21) Sin barba: una fila de barba en la barbilla parecía la
      // cara quemada. La barbilla (15) va siempre con la piel.
      10: piel, 11: piel, 15: piel,
      20: rampa(ROPA[o.zapatos], 3, 0.18, 0.5),
      30: [[244, 240, 232]], 31: [ojo], 32: [mezclar(ojo, blanco, 0.3)], 33: [mezclar(ojo, [14, 10, 18], 0.6)],
      34: [mezclar(ojo, blanco, 0.62)], 35: [mezclar(piel[2], [52, 30, 26], 0.6)],
      40: pelo, 50: rampa(ROPA[o.camisa], 4, 0.2, 0.5), 60: rampa(ROPA[o.pantalon], 4, 0.14, 0.55),
      70: [[184, 64, 58]], 250: [CONTORNO],
      labio: [mezclar(piel[1], [196, 84, 96], 0.55), mezclar(piel[1], [150, 54, 70], 0.6)]
    };
  }

  // ── (2026-10-21) LA TARJETA DEL RETRATO ─────────────────────────────────
  // El Perfil.png de siempre (51 x 55) SIN el personaje: el marco "G…F" y el
  // fondo azul (tools/generar-soulbound-partes.py: tarjeta). En datos, para no
  // descargar nada más. Cada color: [r, g, b, a, 1 = fondo: ahí va el personaje].
  var TARJETA = {
    pal: [[0, 0, 0, 0, 0], [1, 1, 1, 255, 0], [9, 9, 9, 255, 0], [0, 0, 0, 255, 0], [79, 240, 248, 255, 0], [52, 205, 221, 255, 0],
          [4, 4, 4, 255, 0], [0, 56, 73, 255, 0], [50, 161, 189, 255, 0], [102, 111, 217, 255, 1], [36, 45, 147, 255, 0],
          [78, 87, 211, 255, 1], [47, 57, 187, 255, 1], [23, 88, 110, 255, 0], [50, 167, 187, 255, 0], [0, 34, 64, 255, 0],
          [9, 40, 68, 255, 0], [45, 131, 156, 255, 0], [53, 172, 199, 255, 0], [56, 68, 210, 255, 1], [0, 0, 11, 255, 0],
          [51, 63, 199, 255, 1], [125, 133, 223, 255, 0], [45, 54, 172, 255, 1], [30, 30, 30, 255, 0]],
    rle: 'a2b2cda46be4da44def5da43df2bgf2da15d3a14d3a8defd5a12d3hfid3a10dj2kda7df2bd16lmdneodmld11jd2pda6df2bf3dml2j5l2mdmjdqrpdjmdml3j2l2mdkdespda5dnfd2nfd15jd3jd15nespda4dfnd2fndt14dl3dt14dpnespda3dnfnfnfdt15d3t16dpnedkda3dnpnpd2t35d2udjda4b2d3t37dkj2da5dmdt39d3a6dldt39dmda6djdt39dlda6djdt39djda6djdt39djda6djdt39djda6djdt39djda6dldv39dlda6dmdv39dmda6d3v39d3a5dlmldv37dlmlda4dmlwdv37dwlmda4dljwdv37dwjlda5d3v39d3a5dneodv37doenda4deoedv37deoeda4doesdv37dseoda4dqondm37dnoqda5d3m39d3a5dljwdm37dwjlda4dmlwdm37dwlmda4dlmldm37dlmlda5d3m39d3a6dmdm39dmda6dldm39dlda6djdm39djda6djdm39djda6djdx38mdjda6djdx39djda6djdx39dlda6dldx39dmda6dmdx38d6a4d3x37de6da2dj2kdx36def5da2djdud2x10yd5x2d5x12df2d4a3dkdenpdx10e5d2e5dx11defd4a4dpsenpdx9efnfdm2dfnfedx11df2nfnda5dpsend6j3pnd2ndjldnd2npjd11fnfnfda6dpsedkdmljlmdnpdndmljmdndpnm3l2j3l2mdnfd3a8dpd2jd8jd4jld5jd12fnda11dkj2da11dm2da16dnpda12d3a13dja17dpnda48d2a5'
  };
  var PERFIL_X = 14 - 5, PERFIL_Y = 10 - 9;   // derecha_1 en su sitio de siempre (el cuadro lleva 5 y 9 de margen)
  var tarjetaPx = null;
  function tarjeta() {
    if (tarjetaPx) return tarjetaPx;
    var out = new Uint8Array(51 * 55), k = 0, re = /([a-z])(\d*)/g, m;
    while ((m = re.exec(TARJETA.rle)) && k < out.length) {
      var idx = m[1].charCodeAt(0) - 97, n = m[2] ? parseInt(m[2], 10) : 1;
      for (var j = 0; j < n && k < out.length; j++) out[k++] = idx;
    }
    tarjetaPx = out;
    return out;
  }

  function cargarImagen(url) {
    var cancelar;
    var trabajo = new Promise(function (ok, mal) {
      var im = new Image(), hecho = false;
      var timer = setTimeout(function () { fin(false); }, 15000);
      function fin(bien) { if (hecho) return; hecho = true; clearTimeout(timer); canceladores.delete(cancelar); im.onload = im.onerror = null; if (bien) ok(im); else { im.src = ''; mal(new Error('no carga ' + url)); } }
      cancelar = function () { fin(false); }; canceladores.add(cancelar);
      im.onload = function () { fin(true); };
      im.onerror = function () { fin(false); };
      im.src = url;
    });
    trabajo.cancelar = function () { cancelar(); };
    return trabajo;
  }
  function cargarAtlas(nombre) {
    if (atlas.has(nombre)) { var guardado = atlas.get(nombre); atlas.delete(nombre); atlas.set(nombre, guardado); return guardado; }
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 15000);
    var cancelar = function () { controller.abort(); }; canceladores.add(cancelar);
    var imagen = cargarImagen(RUTA + nombre + '.png?v=' + V);
    var trabajo = Promise.all([imagen,
      fetch(RUTA + nombre + '.json?v=' + V, { signal: controller.signal }).then(function (r) {
        if (!r.ok) throw new Error('atlas HTTP ' + r.status);
        return r.json();
      })]).finally(function () { clearTimeout(timer); canceladores.delete(cancelar); controller.abort(); imagen.cancelar(); }).catch(function (e) { if (atlas.get(nombre) === trabajo) atlas.delete(nombre); throw e; });
    atlas.set(nombre, trabajo);
    while (atlas.size > MAX_ATLAS) atlas.delete(atlas.keys().next().value);
    return trabajo;
  }

  /** Compone las 28 imágenes y el retrato de un id. Promise<boolean>. */
  function preparar(id) {
    var o = decodificar(id);
    if (!o || destruido) return Promise.resolve(false);
    id = codificar(o);
    if (cache[id]) { tocar(id); return Promise.resolve(true); }
    if (fallidos[id] && Date.now() - fallidos[id] < 30000) return Promise.resolve(false);
    if (enCurso[id]) return enCurso[id];
    var nombre = atlasDe(o);
    // (2026-10-21) Con falda, también su atlas (<cuerpo>_falda), encima.
    enCurso[id] = programar(function () { return Promise.all([cargarAtlas(nombre), o.falda ? cargarAtlas(cuerpoDe(o) + '_falda') : null]).then(function (todo) {
      if (destruido) return false;
      var res = todo[0], falda = todo[1];
      var im = res[0], meta = res[1].frames;
      var valido = function (im2, meta2) {
        if (!im2.width || !im2.height || im2.width * im2.height > 4194304 || !meta2 || !meta2.abajo_1 || Object.keys(meta2).length > 64) throw new Error('invalid custom atlas');
        Object.keys(meta2).forEach(function (k) { var f = meta2[k]; if (!f || ![f.x, f.y, f.w, f.h].every(Number.isSafeInteger) || f.x < 0 || f.y < 0 || f.w < 1 || f.h < 1 || f.x + f.w > im2.width || f.y + f.h > im2.height) throw new Error('invalid custom frame'); });
      };
      valido(im, meta);
      if (falda) valido(falda[0], falda[1].frames);
      var cv = document.createElement('canvas');
      var rp = null, rg = null;
      try {
      cv.width = im.width; cv.height = im.height;
      var cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0);
      if (falda) {
        var fm = falda[1].frames;
        Object.keys(meta).forEach(function (k) {
          var f = meta[k], g = fm[k];
          if (g) cx.drawImage(falda[0], g.x, g.y, Math.min(g.w, f.w), Math.min(g.h, f.h), f.x, f.y, Math.min(g.w, f.w), Math.min(g.h, f.h));
        });
      }
      var datos = cx.getImageData(0, 0, cv.width, cv.height), d = datos.data, pal = paletas(o), fem = o.genero === 'f';
      for (var i = 0; i < d.length; i += 4) {
        // B 200: píxel con parte; 201: pestaña (mujer: contorno); 202: labios (mujer).
        var bb = d[i + 2], c;
        if (!d[i + 3] || bb < 200 || bb > 202) continue;
        if (bb === 201 && fem) c = CONTORNO;
        else if (bb === 202 && fem) c = d[i + 1] >= 80 ? pal.labio[1] : pal.labio[0];
        else {
          var tonos = pal[d[i]];
          if (!tonos) continue;
          c = tonos[Math.min(tonos.length - 1, Math.round(d[i + 1] / 40))];
        }
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
      cx.putImageData(datos, 0, 0);
      var urls = {};
      Object.keys(meta).forEach(function (k) {
        var f = meta[k], c2 = document.createElement('canvas');
        try {
        c2.width = f.w; c2.height = f.h;
        c2.getContext('2d').drawImage(cv, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        urls[k] = c2.toDataURL('image/png');
        } finally { c2.width = c2.height = 0; }
      });
      // (2026-10-21) El retrato, COMO LOS DE SIEMPRE: la tarjeta del Perfil.png
      // (51 x 55, marco y fondo azul) con derecha_1 en su sitio, a 4x (204 x 220).
      // Solo se pinta sobre el fondo: el marco queda por encima del personaje.
      var f1 = meta.derecha_1 || meta.abajo_1;
      rp = document.createElement('canvas');
      rp.width = 51; rp.height = 55;
      var rx = rp.getContext('2d');
      var rd = rx.getImageData(0, 0, 51, 55), r8 = rd.data, tp = tarjeta(), ancho = cv.width;
      for (var q = 0; q < tp.length && q * 4 + 3 < r8.length; q++) {
        var c3 = TARJETA.pal[tp[q]] || TARJETA.pal[0], o4 = q * 4;
        var sx = (q % 51) - PERFIL_X, sy = ((q / 51) | 0) - PERFIL_Y;
        if (c3[4] && sx >= 0 && sy >= 0 && sx < f1.w && sy < f1.h) {
          var a4 = ((f1.y + sy) * ancho + f1.x + sx) * 4;
          if (a4 + 3 < d.length && d[a4 + 3]) { r8[o4] = d[a4]; r8[o4 + 1] = d[a4 + 1]; r8[o4 + 2] = d[a4 + 2]; r8[o4 + 3] = d[a4 + 3]; continue; }
        }
        r8[o4] = c3[0]; r8[o4 + 1] = c3[1]; r8[o4 + 2] = c3[2]; r8[o4 + 3] = c3[3];
      }
      rx.putImageData(rd, 0, 0);
      rg = document.createElement('canvas');
      rg.width = 204; rg.height = 220;
      var gx = rg.getContext('2d');
      gx.imageSmoothingEnabled = false;
      gx.drawImage(rp, 0, 0, 204, 220);
      cache[id] = { urls: urls, perfil: rg.toDataURL('image/png') };
      tocar(id); delete fallidos[id]; podar();
      return true;
      } finally { cv.width = cv.height = 0; if (rp) rp.width = rp.height = 0; if (rg) rg.width = rg.height = 0; }
    }); }).catch(function (e) {
      console.warn('[Soulbound custom] no se pudo componer ' + id, e);
      if (!destruido) { fallidos[id] = Date.now(); podar(); }
      return false;
    }).finally(function () { delete enCurso[id]; });
    return enCurso[id];
  }
  function claveCache(id) { var o = decodificar(id); return o ? codificar(o) : ''; }
  function listo(id) { return !!cache[claveCache(id)]; }
  function url(id, carpeta, n) { id = claveCache(id); var c = cache[id]; if (c) tocar(id); return c ? c.urls[(Object.prototype.hasOwnProperty.call(DIRS, carpeta) ? DIRS[carpeta] : 'abajo') + '_' + n] || null : null; }
  function perfil(id) { id = claveCache(id); var c = cache[id]; if (c) tocar(id); return c ? c.perfil : null; }

  // ── EL PANEL ────────────────────────────────────────────────────────────
  function escena() {
    try {
      var g = global.game, l = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName) return l[i];
    } catch (e) {}
    return null;
  }
  function filaColores(titulo, lista, valor, alElegir) {
    var fila = document.createElement('div');
    fila.style.cssText = 'margin:8px 0;';
    var t = document.createElement('div');
    t.textContent = titulo;
    t.style.cssText = 'font-size:12px;color:#cfe0ff;margin-bottom:5px;font-weight:700;';
    var cont = document.createElement('div');
    cont.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    lista.forEach(function (hex, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = titulo + ' ' + (i + 1);
      b.setAttribute('aria-label', titulo + ' ' + (i + 1));
      b.style.cssText = 'width:30px;height:30px;border-radius:50%;cursor:pointer;background:' + hex + ';' +
        'border:' + (i === valor ? '3px solid #ffd23f' : '2px solid rgba(255,255,255,.35)') + ';';
      b.onclick = function () { alElegir(i); };
      cont.appendChild(b);
    });
    fila.append(t, cont);
    return fila;
  }
  function filaChips(titulo, opciones, valor, alElegir) {
    var fila = document.createElement('div');
    fila.style.cssText = 'margin:8px 0;';
    var t = document.createElement('div');
    t.textContent = titulo;
    t.style.cssText = 'font-size:12px;color:#cfe0ff;margin-bottom:5px;font-weight:700;';
    var cont = document.createElement('div');
    cont.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    opciones.forEach(function (op) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = op.txt;
      b.style.cssText = 'min-height:34px;padding:4px 12px;border-radius:999px;cursor:pointer;font-weight:700;font-size:12px;' +
        (op.v === valor ? 'background:#ffd23f;color:#20160a;border:2px solid #ffd23f;' : 'background:#1b2a44;color:#fff;border:2px solid #34507a;');
      b.onclick = function () { alElegir(op.v); };
      cont.appendChild(b);
    });
    fila.append(t, cont);
    return fila;
  }

  function abrir(sceneArg) {
    var SB = global.GFSoulbound;
    if (!SB) return;
    if (panelActual) panelActual();
    var actualId = SB.actual();
    var o = decodificar(actualId) || {
      base: base(actualId), genero: generoDe(base(actualId)),
      estilo: 0, pelo: 2, piel: 1, ojos: 3, camisa: 0, pantalon: 13, zapatos: 14, barba: 0, falda: 0
    };
    o.barba = 0;                                   // (2026-10-21) sin barba
    var viejo = document.getElementById('gf-sb-custom');
    if (viejo) viejo.remove();
    var ov = document.createElement('div');
    ov.id = 'gf-sb-custom';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:10px;';
    var card = document.createElement('div');
    card.style.cssText = 'width:min(96vw,560px);max-height:92vh;overflow:auto;box-sizing:border-box;background:linear-gradient(160deg,#16223a,#0e1626);' +
      'border:3px solid #ffd23f;border-radius:16px;color:#fff;font-family:Arial,sans-serif;padding:14px;';
    ov.appendChild(card);
    document.body.appendChild(ov);
    var cerrado = false, vistaRevision = 0, origen = sceneArg || escena(), dueno = origen && origen.playerName;
    function actual() { var sc = escena(); return !destruido && !cerrado && ov.isConnected && (!dueno || (sc && sc.playerName === dueno)); }
    var cerrar = function () { if (cerrado) return; cerrado = true; vistaRevision++; ov.remove(); clearInterval(anim); anim = null; document.removeEventListener('keydown', alTecla); if (origen && origen.events) { origen.events.off('shutdown', cerrar); origen.events.off('destroy', cerrar); } if (panelActual === cerrar) panelActual = null; };
    function alTecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', alTecla);
    if (origen && origen.events) { origen.events.once('shutdown', cerrar); origen.events.once('destroy', cerrar); }
    panelActual = cerrar;
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    var anim = null, paso = 1, dirs = ['abajo', 'derecha', 'arriba', 'izquierda'], dirI = 0, vistaId = null;

    var pintar = function () {
      if (!actual()) return;
      var run = ++vistaRevision;
      card.innerHTML = '';
      var cab = document.createElement('div');
      cab.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      cab.innerHTML = '<b style="font-size:clamp(15px,4vw,19px);">✂️ Customize ' + SB.ficha(o.base).nombre + '</b>';
      var x = document.createElement('button');
      x.type = 'button'; x.textContent = '✕';
      x.style.cssText = 'background:transparent;border:none;color:#ffd23f;font-size:24px;cursor:pointer;min-width:40px;min-height:40px;';
      x.onclick = cerrar;
      cab.appendChild(x);
      card.appendChild(cab);
      var cuerpo = document.createElement('div');
      cuerpo.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;';
      var izq = document.createElement('div');
      izq.style.cssText = 'flex:0 0 140px;display:flex;flex-direction:column;align-items:center;gap:6px;margin:auto;';
      var lienzo = document.createElement('canvas');
      lienzo.width = 140; lienzo.height = 170;
      lienzo.style.cssText = 'background:radial-gradient(circle at 50% 70%,#2f4a72,#121b2e);border-radius:14px;image-rendering:pixelated;';
      var nota = document.createElement('div');
      nota.style.cssText = 'font-size:11px;color:#9fb6d8;text-align:center;';
      nota.textContent = 'Preview';
      izq.append(lienzo, nota);
      var der = document.createElement('div');
      der.style.cssText = 'flex:1;min-width:240px;';
      der.appendChild(filaChips('Body', [{ v: 'm', txt: '♂ Male' }, { v: 'f', txt: '♀ Female' }], o.genero, function (v) {
        // (2026-10-21) "No se diferencia el masculino del femenino": al pasar
        // de cuerpo, un peinado de ese cuerpo y (mujer) la falda; además la
        // mujer lleva pestañas y labios (banderas del mapa de partes).
        // (2026-10-21) El peinado NO cambia al cambiar de cuerpo: todos son
        // cabezas del arte original y valen para los dos cuerpos.
        var cambia = o.genero !== v;
        o.genero = v;
        if (v === 'f') { if (cambia) o.falda = 1; } else o.falda = 0;
        pintar();
      }));
      der.appendChild(filaChips('Hairstyle', POR_GENERO[o.genero].map(function (e) { return { v: ESTILOS.indexOf(e), txt: NOMBRE_ESTILO[e] }; }),
        o.estilo, function (v) { o.estilo = v; pintar(); }));
      der.appendChild(filaColores('Hair color', PELO, o.pelo, function (i) { o.pelo = i; pintar(); }));
      der.appendChild(filaColores('Skin', PIEL, o.piel, function (i) { o.piel = i; pintar(); }));
      der.appendChild(filaColores('Eyes', OJOS, o.ojos, function (i) { o.ojos = i; pintar(); }));
      der.appendChild(filaColores('Shirt', ROPA, o.camisa, function (i) { o.camisa = i; pintar(); }));
      if (o.genero === 'f') der.appendChild(filaChips('Bottom', [{ v: 0, txt: '👖 Pants' }, { v: 1, txt: '👗 Skirt' }], o.falda, function (v) { o.falda = v; pintar(); }));
      der.appendChild(filaColores(o.falda ? 'Skirt' : 'Pants', ROPA, o.pantalon, function (i) { o.pantalon = i; pintar(); }));
      der.appendChild(filaColores('Shoes', ROPA, o.zapatos, function (i) { o.zapatos = i; pintar(); }));
      cuerpo.append(izq, der);
      card.appendChild(cuerpo);
      var pie = document.createElement('div');
      pie.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';
      var orig = document.createElement('button');
      orig.type = 'button'; orig.textContent = '↺ Original look';
      orig.style.cssText = 'flex:1;min-height:44px;border-radius:12px;border:2px solid #34507a;background:#1b2a44;color:#fff;font-weight:700;cursor:pointer;';
      var ok = document.createElement('button');
      ok.type = 'button'; ok.textContent = '✓ Save look';
      ok.style.cssText = 'flex:2;min-height:44px;border-radius:12px;border:none;background:#2e7d32;color:#fff;font-weight:800;font-size:15px;cursor:pointer;';
      var msg = document.createElement('div');
      msg.style.cssText = 'width:100%;font-size:12px;text-align:center;color:#ffd23f;min-height:16px;';
      pie.append(orig, ok, msg);
      card.appendChild(pie);
      orig.onclick = function () {
        if (!actual()) return;
        msg.textContent = 'Restoring…';
        SB.elegir(o.base, escena() || sceneArg).then(function (ok) { if (!actual() || run !== vistaRevision) return; msg.textContent = ok ? 'Back to the original look.' : 'Could not apply that look.'; if (ok && SB.refrescarPanel) SB.refrescarPanel(); }).catch(function () { if (actual()) msg.textContent = 'Could not apply that look.'; });
      };
      ok.onclick = function () {
        if (ok.disabled || !actual()) return;
        var id = codificar(o);
        msg.textContent = 'Saving your look…';
        ok.disabled = true;
        preparar(id).then(function (bien) {
          if (!actual() || run !== vistaRevision) return;
          if (!bien) { msg.textContent = 'Could not build that look. Try again.'; ok.disabled = false; return; }
          return SB.elegir(id, escena() || sceneArg).then(function (aplicado) {
            if (!actual() || run !== vistaRevision) return;
            if (!aplicado) { msg.textContent = 'Could not apply that look.'; ok.disabled = false; return; }
            msg.style.color = '#6fcf97';
            msg.textContent = 'Saved! Everyone sees your new look.';
            ok.disabled = false;
            if (SB.refrescarPanel) SB.refrescarPanel();
          });
        }).catch(function () { if (actual() && run === vistaRevision) { msg.textContent = 'Could not save that look. Try again.'; ok.disabled = false; } });
      };
      // La vista previa: se compone y anda (las cuatro direcciones).
      var id = codificar(o);
      vistaId = id;
      clearInterval(anim);
      var cx = lienzo.getContext('2d');
      cx.imageSmoothingEnabled = false;
      var imgs = {};
      preparar(id).then(function (bien) {
        if (!bien || !actual() || run !== vistaRevision || vistaId !== id) return;
        dirs.forEach(function (d) {
          for (var n = 1; n <= 7; n++) { var im = new Image(); im.src = url(id, d, n); imgs[d + n] = im; }
        });
        var propio = setInterval(function () {
          if (!actual() || run !== vistaRevision || !document.body.contains(lienzo)) { clearInterval(propio); if (anim === propio) anim = null; return; }
          paso = paso % 7 + 1;
          if (paso === 1 && Math.random() < 0.5) dirI = (dirI + 1) % 4;
          var im = imgs[dirs[dirI] + paso];
          if (!im || !im.complete) return;
          cx.clearRect(0, 0, 140, 170);
          var k = 2.4, w = im.width * k, h = im.height * k;
          cx.drawImage(im, (140 - w) / 2, 170 - h - 8, w, h);
        }, 120);
        anim = propio;
      });
    };
    pintar();
  }

  /** El botón "Customize" en el panel de los Soulbound (sb-current). */
  function montarBoton() {
    var info = document.querySelector('.sb-current-info');
    if (!info || document.getElementById('sb-customize-btn')) return;
    var b = document.createElement('button');
    b.id = 'sb-customize-btn';
    b.type = 'button';
    b.textContent = '✂️ Customize look';
    b.style.cssText = 'margin-top:8px;min-height:38px;padding:6px 14px;border-radius:10px;border:2px solid #ffd23f;' +
      'background:#2a3a5a;color:#fff;font-weight:800;cursor:pointer;';
    b.onclick = function (e) { e.stopPropagation(); abrir(escena()); };
    info.appendChild(b);
  }
  function vigilar() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', vigilar); return; }
    montarBoton();
    observador = new MutationObserver(function () { montarBoton(); }); observador.observe(document.body, { childList: true, subtree: false });
    relojBoton = setInterval(montarBoton, 3000);
    // Si el personaje guardado es uno personalizado, se compone YA (antes de
    // que la primera escena cargue sus imágenes).
    try { var SB = global.GFSoulbound; if (SB && esCustom(SB.actual())) preparar(SB.actual()); } catch (e) {}
  }
  var observador = null, relojBoton = null;
  function destruir(e) {
    if (destruido || (e && e.persisted)) return;
    destruido = true; if (panelActual) panelActual();
    clearInterval(relojBoton); if (observador) observador.disconnect();
    document.removeEventListener('DOMContentLoaded', vigilar); global.removeEventListener('pagehide', destruir);
    cola.splice(0).forEach(function (t) { t.resolve(false); });
    Array.from(canceladores).forEach(function (fn) { fn(); }); canceladores.clear();
    Object.keys(cache).forEach(function (id) { delete cache[id]; }); orden.clear(); atlas.clear();
  }
  global.addEventListener('pagehide', destruir);
  vigilar();

  global.GFSoulboundCustom = { esCustom: esCustom, base: base, decodificar: decodificar, codificar: codificar,
                               preparar: preparar, listo: listo, url: url, perfil: perfil, abrir: abrir, destruir: destruir,
    diagnostico: function () { return { apariencias: orden.size, atlas: atlas.size, activos: activos, pendientes: cola.length, fallidos: Object.keys(fallidos).length }; } };
})(window);
