/* ===========================================================================
 * gf-vaca.js — ORDEÑAR LA VACA DEL PUEBLO                          (2026-11-02)
 * ===========================================================================
 *
 * "Con el pote de agarrar agua se pueda tener posibilidades de ordeñar la vaca
 * del GameScene, y al beber esa leche me suba un poquito de vida."
 *
 * Con un cubo vacío en la bolsa y la vaca cerca, sale un letrero sobre ella;
 * al pulsarla se pide al servidor (/api/granja/ordenar), que es quien tira el
 * dado, pone la espera y quema el cubo vacío a cambio del de leche. Si la vaca
 * no se deja, el cubo sigue siendo tuyo. La leche se bebe como cualquier
 * consumible (clic en el personaje con ella en la mano) o se gasta en recetas.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFVaca) return;

  var CUBO = 'balde_vacio';
  var ALCANCE = 170;            // de los pies del jugador a la vaca
  var CADA_MS = 350;

  function tieneCubo(scene) {
    try { return typeof scene.contarItemEnInventario === 'function' && scene.contarItemEnInventario(CUBO) > 0; } catch (e) { return false; }
  }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function distancia(scene, a) {
    var p = scene.player;
    return p ? Math.hypot(p.x - a.spr.x, p.y + 45 - a.spr.y) : Infinity;
  }

  async function ordenar(st, a) {
    var scene = st.scene;
    if (st.ocupado) return;
    if (!tieneCubo(scene)) { aviso(scene, 'You need an Empty Bucket to milk the cow.', 'warning'); return; }
    if (distancia(scene, a) > ALCANCE) { aviso(scene, 'Walk up to the cow first.', 'info'); return; }
    var ahora = Date.now();
    if (ahora < st.libreEn) { aviso(scene, 'The cow needs a rest. Try again in ' + Math.ceil((st.libreEn - ahora) / 1000) + ' s.', 'info'); return; }
    st.ocupado = true;
    pintarLetrero(st);
    var run = scene._sceneRunId;
    try {
      if (!st.ref) st.ref = window.crypto.randomUUID();
      var r = await window.GFMascota.api('/api/granja/ordenar', { ref: st.ref });
      var d = (r && r.datos) || {};
      if (!st.vivo) return;
      if (!r || (!r.ok && r.status !== 202)) {
        if (d.esperaMs) st.libreEn = Date.now() + Number(d.esperaMs);
        aviso(scene, d.message || 'The cow could not be milked right now. Your bucket is safe.', 'warning');
        if (!d.reintentar) st.ref = null;
        return;
      }
      if (d.esperaMs) st.libreEn = Date.now() + Number(d.esperaMs);
      if (d.leche === false) {
        st.ref = null;
        aviso(scene, 'The cow walked away from your bucket. Try again in a moment.', 'info');
        return;
      }
      if (window.GFNativeCrops) window.GFNativeCrops.adopt(scene, d, run);
      if (d.ok) { st.ref = null; aviso(scene, '🥛 You filled your bucket with milk! Drink it or use it in recipes.', 'success'); }
      else aviso(scene, 'Your milk is being confirmed on-chain and will arrive in your bag.', 'info');
    } catch (e) {
      if (st.vivo) aviso(scene, 'The server did not answer. Please try again.', 'warning');
    } finally {
      st.ocupado = false;
      if (st.vivo) pintarLetrero(st);
    }
  }

  function alPulsarVaca(st, a, ptr, lx, ly, ev) {
    var scene = st.scene;
    if (ptr && ptr.downElement && scene.sys && scene.sys.canvas && ptr.downElement !== scene.sys.canvas) return;
    if (!tieneCubo(scene)) return;
    if (ev && ev.stopPropagation) ev.stopPropagation();
    ordenar(st, a);
  }

  function preparar(st) {
    var fauna = window.GFAnimales && window.GFAnimales.deEspecie ? window.GFAnimales.deEspecie(st.scene, 'vaca') : [];
    fauna.forEach(function (a) {
      if (a.__gfVaca) return;
      a.__gfVaca = true;
      a.spr.setInteractive({ useHandCursor: true });
      a.spr.on('pointerdown', function (ptr, lx, ly, ev) { alPulsarVaca(st, a, ptr, lx, ly, ev); });
    });
    return fauna;
  }

  function pintarLetrero(st) {
    var t = st.letrero;
    if (!t || !st.cerca) { if (t) t.setVisible(false); return; }
    t.setText(st.ocupado ? 'Milking…' : 'Click to milk');
    t.setPosition(st.cerca.spr.x, st.cerca.spr.y - (st.cerca.spr.displayHeight || 60) * 0.95);
    t.setDepth(st.cerca.spr.depth + 1);
    t.setVisible(true);
  }

  function tic(st, time) {
    if (!st.vivo) return;
    var scene = st.scene;
    if (time - st.ultima >= CADA_MS) {
      st.ultima = time;
      var fauna = preparar(st), mejor = null, d0 = ALCANCE;
      if (tieneCubo(scene)) fauna.forEach(function (a) {
        if (!a.spr.visible) return;
        var d = distancia(scene, a);
        if (d < d0) { d0 = d; mejor = a; }
      });
      st.cerca = mejor;
    }
    pintarLetrero(st);
  }

  function montar(scene) {
    if (!scene || scene.__gfVaca || !window.GFMascota) return;
    var st = { scene: scene, vivo: true, ocupado: false, ultima: 0, libreEn: 0, cerca: null, ref: null, letrero: null };
    scene.__gfVaca = st;
    st.letrero = scene.add.text(0, 0, 'Click to milk', {
      fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#fff8e6', stroke: '#2a1c10', strokeThickness: 3
    }).setOrigin(0.5, 1).setVisible(false);
    st.onUpdate = function (time) { tic(st, time); };
    scene.events.on('update', st.onUpdate);
    st.onFin = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onFin);
    scene.events.once('destroy', st.onFin);
  }

  function desmontar(scene) {
    var st = scene && scene.__gfVaca;
    if (!st) return;
    st.vivo = false;
    scene.__gfVaca = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onFin);
    scene.events.off('destroy', st.onFin);
    try { if (st.letrero && st.letrero.scene) st.letrero.destroy(); } catch (e) {}
  }

  window.GFVaca = { montar: montar, desmontar: desmontar, _interno: { ordenar: ordenar, estado: function (s) { return s && s.__gfVaca; } } };
})();
