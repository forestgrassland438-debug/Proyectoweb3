/* AYUDAS PARA PROBAR EN EL SIMULADOR SIN SERVIDOR (_prueba_offline.html). NO subir.
   Se carga a mano desde la consola:
     var s = document.createElement('script'); s.src = './_prueba_ayuda.js?' + Date.now(); document.head.appendChild(s);
   El panel del navegador no da requestAnimationFrame cuando no está a la vista: __arranca()
   mueve el bucle del juego a mano. */
(function () {
  'use strict';
  var espera = function (ms) { return new Promise(function (f) { setTimeout(f, ms); }); };
  window.__espera = espera;
  window.__escena = function () {
    var g = window.game;
    return g && g.scene ? g.scene.getScenes(true).find(function (x) { return x.player; }) || null : null;
  };
  window.__arranca = async function (maxMs) {
    if (!window.__paso) window.__paso = setInterval(function () { try { window.game.loop.step(performance.now()); } catch (e) {} }, 33);
    var t0 = Date.now();
    for (;;) {
      var s = window.__escena();
      if (s && !s._gfCargando && s._inventarioCargado !== false && s.__gfMonturas) { window.__s = s; return s.sys.settings.key; }
      if (Date.now() - t0 > (maxMs || 40000)) return 'sin escena';
      await espera(300);
    }
  };
  var TECLAS = { d: ['d', 'KeyD', 68], a: ['a', 'KeyA', 65], w: ['w', 'KeyW', 87], s: ['s', 'KeyS', 83], c: ['c', 'KeyC', 67],
    x: ['x', 'KeyX', 88], h: ['h', 'KeyH', 72], f: ['f', 'KeyF', 70], ' ': [' ', 'Space', 32] };
  window.__tecla = function (tipo, k) {
    var t = TECLAS[k];
    window.dispatchEvent(new KeyboardEvent(tipo, { key: t[0], code: t[1], keyCode: t[2], which: t[2], bubbles: true }));
  };
  window.__pulsa = async function (k, ms) { window.__tecla('keydown', k); await espera(ms || 60); window.__tecla('keyup', k); };
  /** Anda un poco hacia k (d a w s) y se para mirando allí. */
  window.__mira = async function (k, ms) {
    window.__tecla('keydown', k); await espera(ms || 240); window.__tecla('keyup', k); await espera(450);
    return window.__escena().player.texture.key;
  };
  window.__dar = function (id, n) {
    var s = window.__escena(), S = s.STATE, ya = S.slots.find(function (o) { return o && o.id === id; });
    if (ya) { ya.count += n || 1; return true; }
    var libre = S.slots.indexOf(null);
    if (libre < 0) return false;
    S.slots[libre] = { id: id, count: n || 1, idx: 99000 + libre, idm: 'p' + libre };
    try { s.renderAllSlots(); } catch (e) {}
    return true;
  };
  window.__montar = async function (id) {
    var s = window.__escena(), st = s.__gfMonturas;
    window.__dar(id, 1);
    window.GFMonturas._interno.subir(st, id);
    for (var i = 0; i < 40 && !(st.yo && st.yo.listo); i++) await espera(100);
    return !!(st.yo && st.yo.listo);
  };
  window.__ir = function (x, y) {
    var s = window.__escena(), p = s.player;
    p.x = x; p.y = y; s.previousPosition = { x: x, y: y }; s.posicionplayerx = x; s.posicionplayery = y;
  };
  window.__subir = function (nombre, dataUrl) {
    return new Promise(function (ok) {
      var x = new XMLHttpRequest();
      x.open('POST', 'http://127.0.0.1:8080/guardar?n=' + nombre);
      x.onload = function () { ok(x.status + ' ' + x.responseText); };
      x.onerror = function () { ok('error'); };
      x.send(dataUrl);
    });
  };
  /** Una tira de capturas del lienzo del juego alrededor del jugador (o de it.en), ampliadas, a un PNG. */
  window.__tira = async function (lista, nombre, ancho, alto, zoom) {
    var s = window.__escena();
    ancho = ancho || 150; alto = alto || 170; zoom = zoom || 4;
    var o = document.createElement('canvas');
    o.width = lista.length * ancho * zoom; o.height = alto * zoom + 18;
    var c = o.getContext('2d');
    c.fillStyle = '#223'; c.fillRect(0, 0, o.width, o.height);
    c.imageSmoothingEnabled = false;
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i];
      if (it.antes) await it.antes();
      await espera(it.espera == null ? 350 : it.espera);
      await new Promise(function (listo) {
        var cam = s.cameras.main, p = it.en || s.player, z = cam.zoom;
        var sx = (p.x - cam.worldView.x) * z, sy = (p.y - cam.worldView.y) * z, w = Math.round(ancho * z), h = Math.round(alto * z);
        window.game.renderer.snapshotArea(Math.max(0, Math.round(sx - w / 2)), Math.max(0, Math.round(sy - h * (it.arriba || 0.7))), w, h, function (img) {
          c.drawImage(img, 0, 0, w, h, i * ancho * zoom, 0, ancho * zoom, alto * zoom);
          c.fillStyle = '#fff'; c.font = '13px monospace';
          c.fillText(it.etq || '', i * ancho * zoom + 4, alto * zoom + 13);
          listo();
        });
      });
    }
    return window.__subir(nombre, o.toDataURL('image/png'));
  };
})();
