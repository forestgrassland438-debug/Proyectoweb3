/* ¿EN QUÉ SE VA LA MEMORIA?  — para pegar en la consola del navegador.
 *
 * Esto NO se carga con el juego. Se abre la consola (F12), se pega el fichero
 * entero y se llama a `gfMemoria()`. Sin instrumentación, sin envolver nada:
 * solo mira lo que Phaser ya tiene en la mano y lo suma.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * El número que enseña el Administrador de tareas del navegador incluye tres
 * cosas que NO están en el montón de JavaScript, y por eso `performance.memory`
 * miente por defecto:
 *
 *   · Las TEXTURAS. Un PNG de 2 MB en disco ocupa ancho×alto×4 bytes en la
 *     tarjeta gráfica, comprimido o no. Un tileset de 4096×4096 son 64 MB.
 *   · El AUDIO descodificado. Web Audio guarda Float32 por canal y remuestrea
 *     a la frecuencia del AudioContext (48 kHz). Da igual que el fichero sea de
 *     8 bits a 11 kHz: lo que cuenta es duración × canales × 48000 × 4.
 *   · Los lienzos (canvas) sueltos, que también son ancho×alto×4.
 *
 * Uso:
 *     gfMemoria()          → el resumen y los veinte mayores
 *     gfMemoria(60)        → los sesenta mayores
 *     gfMemoria.antes()    → guarda una foto
 *     gfMemoria.desde()    → qué ha cambiado desde la foto  (para cazar fugas:
 *                            foto en el mapa, ir a la tienda, volver, comparar)
 */
(function () {
  'use strict';

  function juego() {
    return window.game || window.__PHASER_GAME__ ||
           (window.Phaser && window.Phaser.GAMES && window.Phaser.GAMES[0]) || null;
  }

  var MB = function (b) { return b / 1048576; };
  var f1 = function (b) { return MB(b).toFixed(1) + ' MB'; };

  /** Cada textura de Phaser: ancho × alto × 4 por cada fotograma de origen. */
  function texturas(g) {
    var out = [], total = 0;
    try {
      g.textures.list && Object.keys(g.textures.list).forEach(function (clave) {
        var t = g.textures.list[clave];
        if (!t || !t.source) return;
        var b = 0;
        for (var i = 0; i < t.source.length; i++) {
          var s = t.source[i];
          if (s && s.width && s.height) b += s.width * s.height * 4;
        }
        if (!b) return;
        total += b;
        out.push({ que: 'textura', nombre: clave, bytes: b,
                   nota: t.source[0].width + '×' + t.source[0].height });
      });
    } catch (e) {}
    return { lista: out, total: total };
  }

  /** Cada sonido descodificado. */
  function audio(g) {
    var out = [], total = 0;
    try {
      g.cache.audio.entries.each(function (clave, buf) {
        if (!buf || typeof buf.length !== 'number') return true;
        var b = buf.length * (buf.numberOfChannels || 1) * 4;
        total += b;
        out.push({ que: 'audio', nombre: clave, bytes: b,
                   nota: buf.duration.toFixed(1) + 's × ' + buf.numberOfChannels + 'ch' });
        return true;
      });
    } catch (e) {}
    return { lista: out, total: total };
  }

  /** Lienzos sueltos que sigan en el documento o en el gestor de Phaser. */
  function lienzos() {
    var out = [], total = 0, i, c;
    try {
      var vistos = Array.prototype.slice.call(document.querySelectorAll('canvas'));
      if (window.Phaser && Phaser.Display && Phaser.Display.Canvas &&
          Phaser.Display.Canvas.CanvasPool && Phaser.Display.Canvas.CanvasPool.total) {
        // el pool no da la lista, solo el conteo; se anota aparte
      }
      for (i = 0; i < vistos.length; i++) {
        c = vistos[i];
        var b = (c.width || 0) * (c.height || 0) * 4;
        if (!b) continue;
        total += b;
        out.push({ que: 'canvas', nombre: c.id || ('canvas#' + i), bytes: b,
                   nota: c.width + '×' + c.height });
      }
    } catch (e) {}
    return { lista: out, total: total };
  }

  function escenas(g) {
    var out = [];
    try {
      g.scene.scenes.forEach(function (s) {
        var n = 0;
        try { n = s.children && s.children.list ? s.children.list.length : 0; } catch (e) {}
        out.push({
          clave: s.sys.settings.key,
          estado: s.sys.settings.status,
          activa: s.sys.isActive(),
          objetos: n
        });
      });
    } catch (e) {}
    return out;
  }

  function foto() {
    var g = juego();
    if (!g) return null;
    var t = texturas(g), a = audio(g), l = lienzos();
    return { t: t, a: a, l: l, cuando: Date.now() };
  }

  function gfMemoria(cuantos) {
    var g = juego();
    if (!g) { console.warn('No encuentro el juego (window.game). ¿Está cargado Phaser?'); return; }
    cuantos = cuantos || 20;

    var t = texturas(g), a = audio(g), l = lienzos();
    var todo = t.lista.concat(a.lista, l.lista).sort(function (x, y) { return y.bytes - x.bytes; });

    console.log('%c=== EN QUÉ SE VA LA MEMORIA ===', 'font-weight:bold;font-size:13px');
    console.table([
      { parte: 'texturas (GPU)', cuantas: t.lista.length, tamaño: f1(t.total) },
      { parte: 'audio descodificado', cuantas: a.lista.length, tamaño: f1(a.total) },
      { parte: 'lienzos en el DOM', cuantas: l.lista.length, tamaño: f1(l.total) },
      { parte: 'TOTAL contable', cuantas: todo.length, tamaño: f1(t.total + a.total + l.total) }
    ]);

    try {
      if (performance.memory) {
        console.log('Montón de JavaScript (aparte de lo de arriba): ' +
                    f1(performance.memory.usedJSHeapSize));
      }
    } catch (e) {}

    console.log('%cLos ' + cuantos + ' mayores:', 'font-weight:bold');
    console.table(todo.slice(0, cuantos).map(function (x) {
      return { tipo: x.que, nombre: x.nombre, tamaño: f1(x.bytes), detalle: x.nota };
    }));

    console.log('%cEscenas:', 'font-weight:bold');
    console.table(escenas(g));

    var ctx = g.sound && g.sound.context;
    if (ctx) console.log('AudioContext a ' + ctx.sampleRate + ' Hz (todo el audio se remuestrea a eso)');

    return { texturasMB: +MB(t.total).toFixed(1), audioMB: +MB(a.total).toFixed(1),
             lienzosMB: +MB(l.total).toFixed(1),
             totalMB: +MB(t.total + a.total + l.total).toFixed(1) };
  }

  /* ── Para cazar fugas: foto, das una vuelta, comparas ─────────────────────
     Lo típico: `gfMemoria.antes()` en el mapa, entras a la tienda, vuelves, y
     `gfMemoria.desde()`. Lo que aparezca en "nuevos" y no se haya ido es lo que
     el cambio de escena no está soltando. */
  var _foto = null;

  gfMemoria.antes = function () {
    _foto = foto();
    if (!_foto) return;
    console.log('Foto tomada: ' + f1(_foto.t.total + _foto.a.total + _foto.l.total));
    return true;
  };

  gfMemoria.desde = function () {
    if (!_foto) { console.warn('Primero llama a gfMemoria.antes()'); return; }
    var ahora = foto();
    var idx = function (f) {
      var m = {};
      f.t.lista.concat(f.a.lista, f.l.lista).forEach(function (x) { m[x.que + ':' + x.nombre] = x.bytes; });
      return m;
    };
    var A = idx(_foto), B = idx(ahora), k;
    var nuevos = [], idos = [], crecidos = [];
    for (k in B) {
      if (!(k in A)) nuevos.push({ que: k, tamaño: f1(B[k]) });
      else if (B[k] > A[k] * 1.05) crecidos.push({ que: k, antes: f1(A[k]), ahora: f1(B[k]) });
    }
    for (k in A) if (!(k in B)) idos.push({ que: k, tamaño: f1(A[k]) });

    var antesT = _foto.t.total + _foto.a.total + _foto.l.total;
    var ahoraT = ahora.t.total + ahora.a.total + ahora.l.total;
    console.log('%cDesde la foto: ' + f1(antesT) + ' → ' + f1(ahoraT) +
                '   (' + (ahoraT >= antesT ? '+' : '') + f1(ahoraT - antesT) + ')',
                'font-weight:bold;font-size:13px');
    if (nuevos.length) { console.log('%cNUEVOS (candidatos a fuga):', 'color:#e36209'); console.table(nuevos); }
    if (crecidos.length) { console.log('%cHAN CRECIDO:', 'color:#e36209'); console.table(crecidos); }
    if (idos.length) { console.log('%cSe han soltado:', 'color:#2da44e'); console.table(idos); }
    return { antesMB: +MB(antesT).toFixed(1), ahoraMB: +MB(ahoraT).toFixed(1) };
  };

  /* ── VIGILANCIA: ¿es un coste fijo o una fuga? ────────────────────────────
     La diferencia entre "el juego ocupa 600 MB" y "el juego SUBE hasta 600 MB"
     lo cambia todo, y no se ve en una sola foto. `gfMemoria.vigilar()` toma una
     medida cada 20 s y va diciendo si sube, y de qué.

         gfMemoria.vigilar()      → empieza (cada 20 s)
         gfMemoria.vigilar(60)    → cada 60 s
         gfMemoria.parar()        → para y saca el resumen

     Si el total se queda quieto, lo que hay es un presupuesto grande y hay que
     recortar (texturas mas pequeñas, menos tiles a la vez). Si sube y sube, es
     una fuga y la columna "nuevos" dice quien la tiene. */
  var _reloj = null, _serie = [];

  gfMemoria.vigilar = function (segundos) {
    segundos = segundos || 20;
    if (_reloj) clearInterval(_reloj);
    _serie = [];
    var primera = null;

    var tomar = function () {
      var f = foto();
      if (!f) return;
      var total = f.t.total + f.a.total + f.l.total;
      if (primera === null) primera = total;
      _serie.push({ min: +((_serie.length * segundos) / 60).toFixed(1),
                    texturas: +MB(f.t.total).toFixed(1),
                    audio: +MB(f.a.total).toFixed(1),
                    lienzos: +MB(f.l.total).toFixed(1),
                    total: +MB(total).toFixed(1),
                    'desde el inicio': (total >= primera ? '+' : '') + MB(total - primera).toFixed(1) });
      console.log('[memoria] ' + f1(total) + '   (' + (total >= primera ? '+' : '') +
                  MB(total - primera).toFixed(1) + ' MB desde el inicio)');
      _foto = _foto || f;
    };

    tomar();
    _reloj = setInterval(tomar, segundos * 1000);
    console.log('%cVigilando cada ' + segundos + ' s. Juega un rato y llama a gfMemoria.parar()',
                'color:#2da44e;font-weight:bold');
    return true;
  };

  gfMemoria.parar = function () {
    if (_reloj) { clearInterval(_reloj); _reloj = null; }
    if (!_serie.length) { console.warn('No habia nada vigilando.'); return; }
    console.log('%c=== COMO HA IDO LA MEMORIA ===', 'font-weight:bold;font-size:13px');
    console.table(_serie);
    var d = _serie[_serie.length - 1].total - _serie[0].total;
    if (d > 30) {
      console.log('%cSUBE ' + d.toFixed(1) + ' MB: hay una fuga. Mira que ha aparecido:',
                  'color:#cf222e;font-weight:bold');
      gfMemoria.desde();
    } else {
      console.log('%cSe mantiene (' + (d >= 0 ? '+' : '') + d.toFixed(1) +
                  ' MB). No es una fuga: es el presupuesto. Mira los mayores con gfMemoria().',
                  'color:#2da44e;font-weight:bold');
    }
    return _serie;
  };

  window.gfMemoria = gfMemoria;
  console.log('%cListo. Llama a gfMemoria()', 'color:#2da44e;font-weight:bold');
})();
