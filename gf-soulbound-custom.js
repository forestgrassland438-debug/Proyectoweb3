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
 *   Las poses de PESCAR (2026-10-22) salen de las del cuerpo base con este
 *   aspecto encima (prepararPesca, más abajo). La espada no tiene poses
 *   propias: es un dibujo aparte (gf-espada.js).
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
      // (2026-10-22) Los quietos (`<dir>_1`) EN CÓDIGOS, antes de colorear: de
      // ellos salen los fotogramas de pescar con este aspecto (prepararPesca).
      var codigos = recortarCodigos(d, cv.width, meta);
      colorear(d, pal, fem);
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
      cache[id] = { urls: urls, perfil: rg.toDataURL('image/png'), codigos: codigos, pesca: null };
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
  /** Colorea EN EL SITIO los píxeles con código (B 200-202) con las paletas de un aspecto. */
  function colorear(d, pal, fem) {
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
  }
  /** Copia, en códigos, los cuatro fotogramas quietos (`<dir>_1`) del atlas. */
  function recortarCodigos(d, ancho, meta) {
    var out = {};
    Object.keys(DIRS).forEach(function (dir) {
      var f = meta[dir + '_1'];
      if (!f) return;
      var px = new Uint8ClampedArray(f.w * f.h * 4);
      for (var y = 0; y < f.h; y++) {
        var ini = ((f.y + y) * ancho + f.x) * 4;
        px.set(d.subarray(ini, Math.min(d.length, ini + f.w * 4)), y * f.w * 4);
      }
      out[dir] = { w: f.w, h: f.h, px: px };
    });
    return out;
  }

  /* ── (2026-10-22) LA PESCA CON EL ASPECTO ELEGIDO ─────────────────────────
     "El personaje personalizado no puede pescar": su id no es una carpeta y
     gf-pesca.js pedía Soulbound/personaje3--…/abajo/pescar_1.png, que no
     existe. Los fotogramas de pescar del cuerpo base (tools/generar-pesca-anim.py)
     son su run_1 desplazado (16, 4) en un lienzo mayor, con los brazos
     doblados y la caña; el 80-94 % del cuerpo queda igual píxel a píxel. Así
     que aquí: lo que coincide con el run_1 se toma del quieto ELEGIDO (su
     cabeza, su falda, sus colores); lo que cambió (brazos, contorno nuevo) se
     traduce a código por su color, con lo que vale ese color en el run_1; y
     la caña se queda como está. Lo que la cabeza elegida asoma por fuera de
     la silueta de siempre (un sombrero) se pinta si no tapa la caña. Mismo
     centro que los demás fotogramas: las PUNTAS de la caña no cambian. */
  var CANA = new Set(['#c08f52', '#a3763f', '#8a5f30', '#6b4724', '#4e3319', '#d8c496', '#bca170', '#99845b', '#75643f',
                      '#e4ecef', '#c8352f', '#efe9e0'].map(function (h) { return parseInt(h.slice(1), 16); }));
  var enCursoPesca = Object.create(null);
  function rgbNum(px, i) { return (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]; }
  /** Color del run_1 -> código del quieto elegido en el mismo sitio (el más votado). */
  function diccionario(R, K, kox, koy) {
    var votos = new Map();
    for (var y = 0; y < R.h; y++) for (var x = 0; x < R.w; x++) {
      var i = (y * R.w + x) * 4, kx = x + kox, ky = y + koy;
      if (R.px[i + 3] < 128 || kx < 0 || ky < 0 || kx >= K.w || ky >= K.h) continue;
      var j = (ky * K.w + kx) * 4, b = K.px[j + 2];
      if (!K.px[j + 3] || b < 200 || b > 202) continue;
      var col = rgbNum(R.px, i);
      if (CANA.has(col)) continue;
      var cod = rgbNum(K.px, j), m = votos.get(col);
      if (!m) votos.set(col, m = new Map());
      m.set(cod, (m.get(cod) || 0) + 1);
    }
    var dic = new Map();
    votos.forEach(function (m, col) {
      var mejor = 0, n = 0;
      m.forEach(function (v, k) { if (v > n) { n = v; mejor = k; } });
      dic.set(col, mejor);
    });
    return dic;
  }
  /** Un fotograma de pescar (P) con el aspecto del quieto elegido (K), en códigos. */
  function pescaFotograma(K, R, P, kox, koy, dic) {
    var pox = Math.round((P.w - R.w) / 2), poy = Math.round((P.h - R.h) / 2);
    var W = K.w + P.w - R.w, H = K.h + P.h - R.h, out = new Uint8ClampedArray(W * H * 4);
    var copiar = function (j, o) { out[o] = K.px[j]; out[o + 1] = K.px[j + 1]; out[o + 2] = K.px[j + 2]; out[o + 3] = K.px[j + 3]; };
    for (var py = 0; py < P.h; py++) for (var px = 0; px < P.w; px++) {
      var i = (py * P.w + px) * 4;
      if (!P.px[i + 3]) continue;
      var o = ((py + koy) * W + px + kox) * 4, rx = px - pox, ry = py - poy;
      if (rx >= 0 && ry >= 0 && rx < R.w && ry < R.h) {
        var r = (ry * R.w + rx) * 4;
        if (R.px[r + 3] && R.px[r] === P.px[i] && R.px[r + 1] === P.px[i + 1] && R.px[r + 2] === P.px[i + 2]) {
          var j = ((ry + koy) * K.w + rx + kox) * 4;
          if (K.px[j + 3]) copiar(j, o);       // el aspecto elegido (o nada: su cabeza es más pequeña)
          continue;
        }
      }
      var col = rgbNum(P.px, i), cod = CANA.has(col) ? undefined : dic.get(col);
      if (cod !== undefined) {
        out[o] = (cod >> 16) & 255; out[o + 1] = (cod >> 8) & 255; out[o + 2] = cod & 255; out[o + 3] = 255;
      } else {
        // Color de verdad (la caña): que no se confunda con un código (B 200-209).
        var b = P.px[i + 2];
        out[o] = P.px[i]; out[o + 1] = P.px[i + 1]; out[o + 2] = (b >= 200 && b <= 209) ? (b < 205 ? 199 : 210) : b; out[o + 3] = P.px[i + 3];
      }
    }
    for (var ky = 0; ky < K.h; ky++) for (var kx = 0; kx < K.w; kx++) {
      var jj = (ky * K.w + kx) * 4;
      if (!K.px[jj + 3]) continue;
      var rx2 = kx - kox, ry2 = ky - koy;
      if (rx2 >= 0 && ry2 >= 0 && rx2 < R.w && ry2 < R.h && R.px[(ry2 * R.w + rx2) * 4 + 3]) continue;
      var o2 = ((ky + poy) * W + kx + pox) * 4;
      if (!out[o2 + 3]) copiar(jj, o2);
    }
    return { w: W, h: H, px: out };
  }
  function componerPesca(id, o, rutaFoto) {
    var entrada = cache[id];
    if (!entrada || !entrada.codigos || destruido) return Promise.resolve(false);
    var cuerpo = cuerpoDe(o), dirs = Object.keys(DIRS);
    var cargas = dirs.map(function (dir) {
      var lista = [cargarImagen('./Game/Sprites/Soulbound/' + cuerpo + '/' + dir + '/run_1.png')];
      for (var n = 1; n <= 6; n++) lista.push(cargarImagen(rutaFoto(cuerpo, dir, n)));
      return Promise.all(lista);
    });
    return Promise.all(cargas).then(function (porDir) {
      if (destruido || cache[id] !== entrada) return false;          // podado mientras tanto
      var lec = document.createElement('canvas'), sal = document.createElement('canvas');
      try {
        var lx = lec.getContext('2d', { willReadFrequently: true }), sx = sal.getContext('2d');
        var leer = function (im) {
          lec.width = im.width; lec.height = im.height;
          lx.clearRect(0, 0, im.width, im.height); lx.drawImage(im, 0, 0);
          return { w: im.width, h: im.height, px: lx.getImageData(0, 0, im.width, im.height).data };
        };
        var pal = paletas(o), fem = o.genero === 'f', urls = {};
        dirs.forEach(function (dir, k) {
          var K = entrada.codigos[dir], R = leer(porDir[k][0]);
          if (!K || K.px.length !== K.w * K.h * 4) throw new Error('sin quieto ' + dir);
          var kox = Math.round((K.w - R.w) / 2), koy = Math.round((K.h - R.h) / 2), dic = diccionario(R, K, kox, koy);
          for (var n = 1; n <= 6; n++) {
            var F = pescaFotograma(K, R, leer(porDir[k][n]), kox, koy, dic);
            colorear(F.px, pal, fem);
            sal.width = F.w; sal.height = F.h;
            sx.putImageData(new ImageData(F.px, F.w, F.h), 0, 0);
            urls[dir + '_' + n] = sal.toDataURL('image/png');
          }
        });
        entrada.pesca = urls;
        tocar(id);
        return true;
      } finally { lec.width = lec.height = 0; sal.width = sal.height = 0; }
    });
  }
  /** Compone los 24 fotogramas de pescar de un id. `rutaFoto(cuerpo, carpeta, n)` da la URL del pescar_n base. */
  function prepararPesca(id, rutaFoto) {
    var o = decodificar(id);
    if (!o || destruido || typeof rutaFoto !== 'function') return Promise.resolve(false);
    id = codificar(o);
    var c = cache[id];
    if (c && c.pesca) { tocar(id); return Promise.resolve(true); }
    var clave = 'pesca:' + id;
    if (fallidos[clave] && Date.now() - fallidos[clave] < 30000) return Promise.resolve(false);
    if (enCursoPesca[id]) return enCursoPesca[id];
    enCursoPesca[id] = preparar(id).then(function (ok) {
      if (!ok || destruido) return false;
      return programar(function () { return componerPesca(id, o, rutaFoto); });
    }).catch(function (e) {
      console.warn('[Soulbound custom] no se pudo componer la pesca de ' + id, e);
      if (!destruido) { fallidos[clave] = Date.now(); podar(); }
      return false;
    }).finally(function () { delete enCursoPesca[id]; });
    return enCursoPesca[id];
  }
  function urlPesca(id, carpeta, n) {
    id = claveCache(id);
    var c = cache[id];
    if (!c || !c.pesca) return null;
    tocar(id);
    return c.pesca[(Object.prototype.hasOwnProperty.call(DIRS, carpeta) ? DIRS[carpeta] : 'abajo') + '_' + n] || null;
  }
  /** El cuerpo con el que se pinta un id (el de la tabla de puntas de la caña). */
  function cuerpo(id) { var o = decodificar(id); return o ? cuerpoDe(o) : null; }

  function claveCache(id) { var o = decodificar(id); return o ? codificar(o) : ''; }
  function listo(id) { return !!cache[claveCache(id)]; }
  function url(id, carpeta, n) { id = claveCache(id); var c = cache[id]; if (c) tocar(id); return c ? c.urls[(Object.prototype.hasOwnProperty.call(DIRS, carpeta) ? DIRS[carpeta] : 'abajo') + '_' + n] || null : null; }
  function perfil(id) { id = claveCache(id); var c = cache[id]; if (c) tocar(id); return c ? c.perfil : null; }

  // ── EL PANEL ────────────────────────────────────────────────────────────
  /* (2026-10-22) CUARTA VUELTA: "el panel de personalización está todo mal".
     · Empezaba con colores genéricos (camisa negra, pantalón marino) aunque
       llevaras a Ember, pelirrojo de chaqueta roja: no te veías a ti. Ahora
       parte de TU aspecto: el personalizado que llevas o, si llevas el de
       siempre, sus colores en estas paletas (ORIGINALES, medidos de sus PNG
       con el tono base de cada rampa).
     · Cada clic rehacía el panel entero: la vista previa parpadeaba y volvía a
       empezar y se perdía el foco. Ahora solo cambia lo marcado y la vista
       previa se recompone una vez por ráfaga de clics.
     · La vista previa se quedaba fuera de la pantalla al bajar y "Guardar"
       solo aparecía al final: la vista previa va fija (a la izquierda; arriba
       en el móvil) y los botones, abajo y siempre a la vista. "Guardar" solo
       se enciende si hay cambios, y cerrar pinchando fuera con cambios avisa.
     · Se puede girar (las cuatro vistas) y cada color dice su nombre. */
  var NOMBRES_COLOR = {
    pelo: ['Black', 'Dark brown', 'Brown', 'Chestnut', 'Copper', 'Golden', 'Blond', 'Silver', 'White', 'Blue', 'Purple', 'Pink'],
    piel: ['Porcelain', 'Light', 'Tan', 'Medium', 'Brown', 'Deep'],
    ojos: ['Dark brown', 'Brown', 'Hazel', 'Blue', 'Sky blue', 'Green', 'Leaf green', 'Grey', 'Violet', 'Amber'],
    ropa: ['Charcoal', 'White', 'Red', 'Orange', 'Mustard', 'Green', 'Teal', 'Blue', 'Purple', 'Plum', 'Brown', 'Slate',
           'Silver', 'Navy', 'Dark brown', 'Peach']
  };
  // El color de cada Soulbound en estas paletas (índices de PELO, PIEL, OJOS y ROPA).
  var ORIGINALES = {
    personaje1: { pelo: 2, piel: 0, ojos: 3, camisa: 0, pantalon: 8, zapatos: 15 },
    personaje2: { pelo: 2, piel: 0, ojos: 6, camisa: 5, pantalon: 0, zapatos: 15 },
    personaje3: { pelo: 4, piel: 1, ojos: 9, camisa: 2, pantalon: 2, zapatos: 15 },
    personaje4: { pelo: 0, piel: 3, ojos: 6, camisa: 4, pantalon: 10, zapatos: 15 },
    personaje5: { pelo: 8, piel: 0, ojos: 4, camisa: 7, pantalon: 13, zapatos: 15 },
    personaje6: { pelo: 3, piel: 1, ojos: 6, camisa: 5, pantalon: 14, zapatos: 15 },
    personaje7: { pelo: 0, piel: 0, ojos: 8, camisa: 13, pantalon: 0, zapatos: 12 },
    personaje8: { pelo: 1, piel: 1, ojos: 5, camisa: 10, pantalon: 10, zapatos: 15 },
    personaje9: { pelo: 2, piel: 0, ojos: 2, camisa: 4, pantalon: 13, zapatos: 15 },
    personaje10: { pelo: 0, piel: 2, ojos: 2, camisa: 10, pantalon: 14, zapatos: 15 },
    personaje11: { pelo: 3, piel: 0, ojos: 5, camisa: 5, pantalon: 10, zapatos: 15 },
    personaje12: { pelo: 0, piel: 1, ojos: 1, camisa: 11, pantalon: 13, zapatos: 15 },
    personaje13: { pelo: 2, piel: 0, ojos: 5, camisa: 13, pantalon: 0, zapatos: 12 }
  };
  /** El aspecto con el que se abre el panel: el personalizado que se lleva o el del personaje. */
  function aspectoInicial(id) {
    var o = decodificar(id);
    if (o) { o.barba = 0; return o; }
    var b = base(id), c = Object.prototype.hasOwnProperty.call(ORIGINALES, b) ? ORIGINALES[b]
      : { pelo: 2, piel: 1, ojos: 3, camisa: 0, pantalon: 13, zapatos: 14 };
    return { base: b, genero: generoDe(b), estilo: 0, pelo: c.pelo, piel: c.piel, ojos: c.ojos,
             camisa: c.camisa, pantalon: c.pantalon, zapatos: c.zapatos, barba: 0, falda: 0 };
  }

  var CSS_PANEL = [
    '#gf-sb-custom{position:fixed;inset:0;z-index:100001;background:rgba(6,10,20,.66);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}',
    '#gf-sb-custom *{box-sizing:border-box}',
    '#gf-sb-custom .sbc-card{width:min(780px,100%);max-height:min(94vh,740px);display:flex;flex-direction:column;background:linear-gradient(160deg,#17233b,#0e1626);border:2px solid #ffd23f;border-radius:16px;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden}',
    '#gf-sb-custom .sbc-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '#gf-sb-custom .sbc-head h2{margin:0;font-size:clamp(16px,4vw,19px);line-height:1.2}',
    '#gf-sb-custom .sbc-head p{margin:3px 0 0;font-size:12px;color:#9fb6d8}',
    '#gf-sb-custom .sbc-x{margin-left:auto;flex:none;width:40px;height:40px;border-radius:10px;border:none;background:transparent;color:#ffd23f;font-size:22px;cursor:pointer}',
    '#gf-sb-custom .sbc-x:hover{background:rgba(255,255,255,.08)}',
    '#gf-sb-custom .sbc-body{flex:1;min-height:0;display:grid;grid-template-columns:210px minmax(0,1fr)}',
    '#gf-sb-custom .sbc-prev{padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:10px;border-right:1px solid rgba(255,255,255,.08)}',
    '#gf-sb-custom canvas.sbc-lienzo{width:180px!important;height:240px!important;flex:none;border-radius:14px;background:radial-gradient(circle at 50% 78%,#33507a,#121b2e 70%);image-rendering:pixelated;cursor:pointer}',
    '#gf-sb-custom .sbc-giro{display:flex;gap:8px;align-items:center;font-size:12px;color:#9fb6d8}',
    '#gf-sb-custom .sbc-giro button{width:36px;height:36px;border-radius:10px;border:2px solid #34507a;background:#1b2a44;color:#fff;font-size:16px;cursor:pointer}',
    '#gf-sb-custom .sbc-vista{min-width:52px;text-align:center}',
    '#gf-sb-custom .sbc-estado{font-size:11px;color:#9fb6d8;text-align:center;min-height:14px}',
    '#gf-sb-custom .sbc-opts{overflow:auto;padding:4px 16px 14px;overscroll-behavior:contain}',
    '#gf-sb-custom .sbc-sec{margin:12px 0 0}',
    '#gf-sb-custom .sbc-sec h3{margin:0 0 7px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#cfe0ff;font-weight:800}',
    '#gf-sb-custom .sbc-sec h3 span{margin-left:6px;letter-spacing:0;text-transform:none;font-weight:600;color:#ffd23f}',
    '#gf-sb-custom .sbc-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '#gf-sb-custom .sbc-chip{min-height:34px;padding:5px 12px;border-radius:999px;border:2px solid #34507a;background:#1b2a44;color:#fff;font-weight:700;font-size:12px;cursor:pointer}',
    '#gf-sb-custom .sbc-chip[aria-pressed=true]{background:#ffd23f;border-color:#ffd23f;color:#20160a}',
    '#gf-sb-custom .sbc-sw{display:flex;flex-wrap:wrap;gap:7px}',
    '#gf-sb-custom .sbc-color{position:relative;width:30px;height:30px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.35);cursor:pointer}',
    '#gf-sb-custom .sbc-color[aria-pressed=true]{border:3px solid #ffd23f;transform:scale(1.08)}',
    '#gf-sb-custom .sbc-color[aria-pressed=true]::after{content:"\\2713";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000}',
    '#gf-sb-custom button:focus-visible{outline:3px solid #8fd3ff;outline-offset:2px}',
    '#gf-sb-custom .sbc-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2)}',
    '#gf-sb-custom .sbc-btn{min-height:42px;padding:8px 14px;border-radius:12px;border:2px solid #34507a;background:#1b2a44;color:#fff;font-weight:700;font-size:13px;cursor:pointer}',
    '#gf-sb-custom .sbc-ok{margin-left:auto;min-width:150px;background:#2e7d32;border-color:#2e7d32;font-weight:800;font-size:15px}',
    '#gf-sb-custom .sbc-btn:disabled{opacity:.45;cursor:not-allowed}',
    '#gf-sb-custom .sbc-msg{flex-basis:100%;order:9;min-height:16px;font-size:12px;text-align:center;color:#ffd23f}',
    '#gf-sb-custom .sbc-msg[data-tipo=ok]{color:#6fcf97}#gf-sb-custom .sbc-msg[data-tipo=error]{color:#ff8a80}',
    '@media (max-width:640px){#gf-sb-custom{padding:6px}#gf-sb-custom .sbc-body{display:block;overflow:auto}' +
      '#gf-sb-custom .sbc-prev{position:sticky;top:0;z-index:1;flex-direction:row;justify-content:center;gap:14px;padding:8px;border-right:none;border-bottom:1px solid rgba(255,255,255,.08);background:#131d31}' +
      '#gf-sb-custom canvas.sbc-lienzo{width:105px!important;height:140px!important}#gf-sb-custom .sbc-giro{flex-direction:column}#gf-sb-custom .sbc-opts{overflow:visible}' +
      '#gf-sb-custom .sbc-foot .sbc-btn{flex:1 1 0;min-width:0;padding:8px 6px;font-size:12px;white-space:nowrap}#gf-sb-custom .sbc-ok{flex:1.3 1 0;font-size:14px}}',
    '@media (prefers-reduced-motion:reduce){#gf-sb-custom .sbc-color[aria-pressed=true]{transform:none}}'
  ].join('\n');
  function estilosPanel() {
    if (document.getElementById('gf-sbc-css')) return;
    var st = document.createElement('style');
    st.id = 'gf-sbc-css';
    st.textContent = CSS_PANEL;
    (document.head || document.body).appendChild(st);
  }
  function escena() {
    try {
      var g = global.game, l = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName) return l[i];
    } catch (e) {}
    return null;
  }
  function nodo(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  /** Una fila de opciones: chips (texto) o círculos de color. Devuelve { fila, marcar(valor) }. */
  function filaOpciones(titulo, opciones, valor, alElegir, colores) {
    var fila = nodo('div', 'sbc-sec'), h = nodo('h3', null, titulo), nombre = nodo('span');
    if (colores) h.appendChild(nombre);
    var cont = nodo('div', colores ? 'sbc-sw' : 'sbc-chips');
    cont.setAttribute('role', 'group');
    cont.setAttribute('aria-label', titulo);
    var botones = opciones.map(function (op) {
      var b = nodo('button', colores ? 'sbc-color' : 'sbc-chip', colores ? null : op.txt);
      b.type = 'button';
      if (colores) {
        b.style.background = op.color;
        b.title = op.txt;
        b.setAttribute('aria-label', titulo + ': ' + op.txt);
      }
      b.onclick = function () { alElegir(op.v); };
      cont.appendChild(b);
      return b;
    });
    var marcar = function (v) {
      opciones.forEach(function (op, i) {
        var si = op.v === v;
        botones[i].setAttribute('aria-pressed', si ? 'true' : 'false');
        if (si && colores) nombre.textContent = op.txt;
      });
    };
    marcar(valor);
    fila.append(h, cont);
    return { fila: fila, marcar: marcar };
  }
  function opcionesColor(lista, nombres) {
    return lista.map(function (hex, i) { return { v: i, color: hex, txt: nombres[i] || ('#' + (i + 1)) }; });
  }

  function abrir(sceneArg) {
    var SB = global.GFSoulbound;
    if (!SB || destruido) return;
    if (panelActual) panelActual();
    estilosPanel();
    var o = aspectoInicial(SB.actual());
    var puesto = codificar(o);                 // lo que se compara para saber si hay cambios
    var llevaOriginal = !esCustom(SB.actual());
    var volverA = document.activeElement;
    var viejo = document.getElementById('gf-sb-custom');
    if (viejo) viejo.remove();

    var ov = nodo('div');
    ov.id = 'gf-sb-custom';
    var card = nodo('div', 'sbc-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sbc-titulo');
    ov.appendChild(card);
    document.body.appendChild(ov);

    var cerrado = false, origen = sceneArg || escena(), dueno = origen && origen.playerName;
    var anim = null, relojVista = null, vistaRevision = 0, dirI = 0, paso = 1, imgs = {}, guardando = false;
    var DIRS4 = ['abajo', 'derecha', 'arriba', 'izquierda'], NOMBRE_VISTA = ['Front', 'Right', 'Back', 'Left'];
    function vivo() { var sc = escena(); return !destruido && !cerrado && ov.isConnected && (!dueno || (sc && sc.playerName === dueno)); }
    var cerrar = function () {
      if (cerrado) return;
      cerrado = true; vistaRevision++;
      ov.remove();
      clearInterval(anim); anim = null;
      clearTimeout(relojVista); relojVista = null;
      imgs = {};
      document.removeEventListener('keydown', alTecla);
      if (origen && origen.events) { origen.events.off('shutdown', cerrar); origen.events.off('destroy', cerrar); }
      if (panelActual === cerrar) panelActual = null;
      try { if (volverA && volverA.isConnected && volverA.focus) volverA.focus(); } catch (e) {}
    };
    function alTecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', alTecla);
    if (origen && origen.events) { origen.events.once('shutdown', cerrar); origen.events.once('destroy', cerrar); }
    panelActual = cerrar;

    // ── La cabecera ──
    var cab = nodo('div', 'sbc-head'), titulos = nodo('div');
    var h2 = nodo('h2', null, '✂️ Customize ' + SB.ficha(o.base).nombre);
    h2.id = 'sbc-titulo';
    titulos.append(h2, nodo('p', null, 'Your look is saved to your account and everyone sees it.'));
    var x = nodo('button', 'sbc-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.onclick = cerrar;
    cab.append(titulos, x);

    // ── La vista previa ──
    var prev = nodo('div', 'sbc-prev'), lienzo = nodo('canvas', 'sbc-lienzo');
    lienzo.width = 60; lienzo.height = 80;
    lienzo.title = 'Click to turn';
    var giro = nodo('div', 'sbc-giro'), izq = nodo('button', null, '◀'), der = nodo('button', null, '▶'), vista = nodo('span', 'sbc-vista', 'Front');
    izq.type = der.type = 'button';
    izq.setAttribute('aria-label', 'Turn left'); der.setAttribute('aria-label', 'Turn right');
    var girar = function (d) { dirI = (dirI + d + 4) % 4; vista.textContent = NOMBRE_VISTA[dirI]; pintarPaso(true); };
    izq.onclick = function () { girar(-1); };
    der.onclick = function () { girar(1); };
    lienzo.onclick = function () { girar(1); };
    giro.append(izq, vista, der);
    var estado = nodo('div', 'sbc-estado', 'Preview');
    prev.append(lienzo, giro, estado);
    var cx = lienzo.getContext('2d');
    if (cx) cx.imageSmoothingEnabled = false;

    // ── Las opciones ──
    var opts = nodo('div', 'sbc-opts'), filas = {};
    function montarOpciones() {
      var arriba = opts.scrollTop;
      opts.textContent = '';
      var elegir = function (campo) { return function (v) { o[campo] = v; cambiado(); }; };
      filas.genero = filaOpciones('Body', [{ v: 'm', txt: 'Male' }, { v: 'f', txt: 'Female' }], o.genero, function (v) {
        if (v === o.genero) return;
        o.genero = v;
        o.falda = v === 'f' ? 1 : 0;           // la mujer, con falda por defecto (se puede quitar)
        montarOpciones();
        cambiado();
      });
      filas.estilo = filaOpciones('Hairstyle / hat', POR_GENERO[o.genero].map(function (e) { return { v: ESTILOS.indexOf(e), txt: NOMBRE_ESTILO[e] }; }),
        o.estilo, elegir('estilo'));
      filas.pelo = filaOpciones('Hair color', opcionesColor(PELO, NOMBRES_COLOR.pelo), o.pelo, elegir('pelo'), true);
      filas.piel = filaOpciones('Skin', opcionesColor(PIEL, NOMBRES_COLOR.piel), o.piel, elegir('piel'), true);
      filas.ojos = filaOpciones('Eyes', opcionesColor(OJOS, NOMBRES_COLOR.ojos), o.ojos, elegir('ojos'), true);
      filas.camisa = filaOpciones('Shirt', opcionesColor(ROPA, NOMBRES_COLOR.ropa), o.camisa, elegir('camisa'), true);
      filas.falda = o.genero === 'f'
        ? filaOpciones('Bottom', [{ v: 0, txt: '👖 Pants' }, { v: 1, txt: '👗 Skirt' }], o.falda, function (v) {
          o.falda = v;
          filas.pantalon.fila.querySelector('h3').firstChild.nodeValue = v ? 'Skirt color' : 'Pants color';
          cambiado();
        })
        : null;
      filas.pantalon = filaOpciones(o.falda ? 'Skirt color' : 'Pants color', opcionesColor(ROPA, NOMBRES_COLOR.ropa), o.pantalon, elegir('pantalon'), true);
      filas.zapatos = filaOpciones('Shoes', opcionesColor(ROPA, NOMBRES_COLOR.ropa), o.zapatos, elegir('zapatos'), true);
      ['genero', 'estilo', 'pelo', 'piel', 'ojos', 'camisa', 'falda', 'pantalon', 'zapatos'].forEach(function (k) {
        if (filas[k]) opts.appendChild(filas[k].fila);
      });
      opts.scrollTop = arriba;
    }
    function marcarTodo() {
      ['genero', 'estilo', 'pelo', 'piel', 'ojos', 'camisa', 'falda', 'pantalon', 'zapatos'].forEach(function (k) {
        if (filas[k]) filas[k].marcar(o[k]);
      });
    }

    // ── El pie ──
    var pie = nodo('div', 'sbc-foot');
    var orig = nodo('button', 'sbc-btn', '↺ Original look'), azar = nodo('button', 'sbc-btn', '🎲 Random');
    var ok = nodo('button', 'sbc-btn sbc-ok', '✓ Save look'), msg = nodo('div', 'sbc-msg');
    orig.type = azar.type = ok.type = 'button';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    pie.append(orig, azar, ok, msg);

    var cuerpo = nodo('div', 'sbc-body');
    cuerpo.append(prev, opts);
    card.append(cab, cuerpo, pie);

    function aviso(texto, tipo) { msg.textContent = texto || ''; if (tipo) msg.setAttribute('data-tipo', tipo); else msg.removeAttribute('data-tipo'); }
    function sucio() { return codificar(o) !== puesto; }
    function botones() {
      ok.disabled = guardando || !sucio();
      orig.disabled = guardando || (llevaOriginal && !sucio());
      azar.disabled = guardando;
    }
    function cambiado() {
      marcarTodo();
      aviso('');
      botones();
      programarVista();
    }

    azar.onclick = function () {
      var lista = POR_GENERO[o.genero], r = function (n) { return Math.floor(Math.random() * n); };
      o.estilo = ESTILOS.indexOf(lista[r(lista.length)]);
      o.pelo = r(PELO.length); o.piel = r(PIEL.length); o.ojos = r(OJOS.length);
      o.camisa = r(ROPA.length); o.pantalon = r(ROPA.length); o.zapatos = r(ROPA.length);
      if (o.genero === 'f') o.falda = r(2);
      montarOpciones();
      cambiado();
    };
    orig.onclick = function () {
      if (!vivo() || guardando) return;
      if (llevaOriginal) {
        // Aún no se guardó nada: se deshacen los cambios del panel.
        o = aspectoInicial(o.base);
        montarOpciones(); cambiado();
        aviso('Back to the original look.', 'ok');
        return;
      }
      guardando = true; botones();
      aviso('Restoring…');
      SB.elegir(o.base, escena() || sceneArg).then(function (bien) {
        guardando = false;
        if (!vivo()) return;
        if (!bien) { botones(); aviso('Could not apply that look.', 'error'); return; }
        llevaOriginal = true;
        o = aspectoInicial(o.base);
        puesto = codificar(o);
        montarOpciones(); cambiado();
        aviso('Back to the original look.', 'ok');
        if (SB.refrescarPanel) SB.refrescarPanel();
      }).catch(function () { guardando = false; if (vivo()) { botones(); aviso('Could not apply that look.', 'error'); } });
    };
    ok.onclick = function () {
      if (ok.disabled || !vivo()) return;
      var id = codificar(o);
      guardando = true; botones();
      aviso('Saving your look…');
      preparar(id).then(function (bien) {
        if (!vivo()) { guardando = false; return; }
        if (!bien) { guardando = false; botones(); aviso('Could not build that look. Try again.', 'error'); return; }
        return SB.elegir(id, escena() || sceneArg).then(function (aplicado) {
          guardando = false;
          if (!vivo()) return;
          if (!aplicado) { botones(); aviso('Could not apply that look.', 'error'); return; }
          puesto = id; llevaOriginal = false;
          botones();
          aviso('Saved! Everyone sees your new look.', 'ok');
          if (SB.refrescarPanel) SB.refrescarPanel();
        });
      }).catch(function () { guardando = false; if (vivo()) { botones(); aviso('Could not save that look. Try again.', 'error'); } });
    };
    ov.onclick = function (e) {
      if (e.target !== ov) return;
      if (sucio() && !guardando) { aviso('You have unsaved changes: save them, or close with ✕.', 'error'); ok.focus(); return; }
      cerrar();
    };

    // ── La vista previa: se compone una vez por ráfaga de clics ──
    function pintarPaso(quieto) {
      if (!cx) return;
      var im = imgs[DIRS4[dirI] + (quieto ? 1 : paso)];
      if (!im || !im.complete || !im.naturalWidth) return;
      cx.clearRect(0, 0, 60, 80);
      cx.drawImage(im, Math.round((60 - im.naturalWidth) / 2), 80 - im.naturalHeight - 4);
    }
    function programarVista() {
      clearTimeout(relojVista);
      relojVista = setTimeout(componerVista, 90);
    }
    function componerVista() {
      relojVista = null;
      if (!vivo()) return;
      var run = ++vistaRevision, id = codificar(o);
      estado.textContent = 'Updating…';
      preparar(id).then(function (bien) {
        if (!vivo() || run !== vistaRevision) return;
        if (!bien) { estado.textContent = 'Preview unavailable'; return; }
        var nuevas = {}, faltan = 0, listo = function () {
          if (--faltan > 0 || !vivo() || run !== vistaRevision) return;
          imgs = nuevas;
          estado.textContent = 'Preview';
          pintarPaso(false);
        };
        DIRS4.forEach(function (d) {
          for (var n = 1; n <= 7; n++) {
            var u = url(id, d, n);
            if (!u) continue;
            var im = new Image();
            faltan++;
            im.onload = im.onerror = function () { this.onload = this.onerror = null; listo(); };
            im.src = u;
            nuevas[d + n] = im;
          }
        });
        if (!faltan) estado.textContent = 'Preview unavailable';
      });
    }
    anim = setInterval(function () {
      if (!vivo()) { cerrar(); return; }
      paso = paso % 7 + 1;
      pintarPaso(false);
    }, 120);

    montarOpciones();
    botones();
    componerVista();
    try { x.focus(); } catch (e) {}
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
                               prepararPesca: prepararPesca, urlPesca: urlPesca, cuerpo: cuerpo,
    diagnostico: function () { return { apariencias: orden.size, atlas: atlas.size, activos: activos, pendientes: cola.length, fallidos: Object.keys(fallidos).length }; } };
})(window);
