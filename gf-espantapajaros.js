/* ===========================================================================
 * EL ESPANTAPÁJAROS                                                (2026-10-05)
 *
 * QUÉ HACE
 *   Con el espantapájaros en la mano, un clic en una parcela SEMBRADA (del
 *   huerto del pueblo o de la isla) lo planta en su esquina. Dura dos horas:
 *   mientras dure, el cuervo hambriento que baje a esa parcela se posa en su
 *   cabeza en vez de comer (gf-cuervo.js), y el servidor tampoco acepta el
 *   picotazo (/api/crops/crow mira si hay espantapájaros). Al caducar se
 *   desvanece solo.
 *
 * QUIÉN DECIDE
 *   El servidor (POST /api/espantapajaros/colocar): comprueba la parcela, que
 *   esté sembrada, quema uno en la cadena y apunta la hora de caducidad. Aquí
 *   solo se pinta.
 *
 * EL CUERVO
 *   Cada espantapájaros se cuelga de la escena como `scene['espanta_<plot>']`,
 *   igual que los árboles (`scene.sprite_pinosN`). Así el cuervo lo trata como
 *   un posadero más sin que su lógica cambie: se posa en lo alto (posadero),
 *   su sombra va al pie y, si caduca y desaparece, se va como cuando talan su
 *   árbol.
 *
 * CÓMO SE ENGANCHA
 *   GameScene (update, una vez) y LandsScene.create:  GFEspantapajaros.montar(this)
 *   handlePlotClick con el espantapájaros en la mano: GFEspantapajaros.colocar
 * ======================================================================== */
(function () {
  'use strict';

  var TEX = 'gfe_espanta', TEX_VIENTO = 'gfe_espanta_viento';
  var ESCALA = 1.4;
  var CERCA = 110;                 // a esta distancia se ve cuánto le queda

  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) { scene.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
    console.log('[espantapájaros]', texto);
  }

  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }

  function cargarTexturas(scene) {
    var faltan = [];
    if (!scene.textures.exists(TEX)) faltan.push([TEX, './Game/Objetos/granja/espantapajaros.png']);
    if (!scene.textures.exists(TEX_VIENTO)) faltan.push([TEX_VIENTO, './Game/Objetos/granja/espantapajaros_viento.png']);
    if (!faltan.length) return Promise.resolve();
    return new Promise(function (ok) {
      var hecho = false, fin = function () { if (!hecho) { hecho = true; ok(); } };
      faltan.forEach(function (f) { scene.load.image(f[0], f[1]); });
      scene.load.once('complete', fin);
      setTimeout(fin, 5000);
      scene.load.start();
    });
  }

  function viento() {
    try {
      var t = window.GFClima && window.GFClima.ahora && window.GFClima.ahora();
      return t && t.activo ? Number(t.viento) || 0 : 0;
    } catch (e) { return 0; }
  }

  function textoQueda(ms) {
    var m = Math.max(0, Math.ceil(ms / 60000));
    return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
  }

  // ─────────────────────────────────────────────────────────── PINTAR
  function poner(st, plotId, hasta) {
    var scene = st.scene;
    var img = scene.plotImages && scene.plotImages.get ? scene.plotImages.get(plotId) : null;
    if (!img || !img.active || !scene.textures.exists(TEX)) { st.pendientes.set(plotId, hasta); return null; }
    st.pendientes.delete(plotId);
    var prev = st.mapa.get(plotId);
    if (prev) { prev.hasta = hasta; return prev; }
    var b = img.getBounds();
    var x = b.right - Math.min(14, b.width * 0.22), y = b.top + b.height * 0.62;
    var spr = scene.add.image(x, y, TEX).setOrigin(0.5, 1).setScale(ESCALA).setDepth(y);
    var etiqueta = scene.add.text(x, y - 86, '', { fontFamily: '"PressStart2P", monospace', fontSize: '8px',
      color: '#fff4d6', backgroundColor: '#3a2412cc', padding: { x: 5, y: 3 }, resolution: 3 })
      .setOrigin(0.5, 1).setDepth(9000).setVisible(false);
    var e = { plotId: plotId, spr: spr, etiqueta: etiqueta, hasta: hasta, fase: Math.random() * 6.28 };
    st.mapa.set(plotId, e);
    scene['espanta_' + plotId] = spr;
    // Aparece clavándose en la tierra.
    spr.setScale(ESCALA, 0.2);
    scene.tweens.add({ targets: spr, scaleY: ESCALA, duration: 260, ease: 'Back.Out' });
    return e;
  }

  function quitar(st, plotId, conFundido) {
    var e = st.mapa.get(plotId);
    if (!e) return;
    st.mapa.delete(plotId);
    var scene = st.scene;
    if (scene && scene['espanta_' + plotId] === e.spr) delete scene['espanta_' + plotId];
    try { e.etiqueta.destroy(); } catch (x) {}
    if (conFundido && scene) {
      scene.tweens.add({ targets: e.spr, alpha: 0, scaleY: 0.3, duration: 700, onComplete: function () { try { e.spr.destroy(); } catch (x) {} } });
    } else {
      try { e.spr.destroy(); } catch (x) {}
    }
  }

  // ─────────────────────────────────────────────────────── COLOCAR
  function ajustarFacturaLocal(scene, invoiceId, quedan) {
    var S = scene.STATE;
    if (!S) return;
    var listas = [S.slots || [], S.quickSlots || []];
    for (var a = 0; a < listas.length; a++) {
      var lista = listas[a];
      for (var i = 0; i < lista.length; i++) {
        if (lista[i] && Number(lista[i].idx) === Number(invoiceId)) {
          if (quedan > 0) lista[i].count = quedan; else lista[i] = null;
          var sel = S.selectedItem;
          if (sel && Number(sel.idx) === Number(invoiceId)) {
            if (quedan > 0) sel.count = quedan;
            else { try { scene.clearSelectedItem && scene.clearSelectedItem(); } catch (x) {} }
          }
          try { scene.renderAllSlots(); } catch (x) {}
          try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (x) {}
          return;
        }
      }
    }
  }

  function colocar(scene, plotId) {
    var st = scene && scene.__gfEspanta;
    if (!st) return;
    if (st.colocando) return;
    if (st.mapa.has(plotId)) { aviso(scene, 'There is already a scarecrow on this plot.', 'warning'); return; }
    if (!(scene.cropData && scene.cropData.get && scene.cropData.get(plotId))) {
      aviso(scene, 'Plant something first: a scarecrow guards a crop.', 'warning');
      return;
    }
    st.colocando = true;
    Promise.all([api('/api/espantapajaros/colocar', { plotId: plotId }), cargarTexturas(scene)]).then(function (res) {
      var r = res[0], d = (r && r.datos) || {};
      if (!st.scene) return;
      if (!r.ok || !d.ok) {
        var textos = { sin_siembra: 'Plant something first: a scarecrow guards a crop.',
          ya_hay: 'There is already a scarecrow on this plot.', no_tienes: 'You have no scarecrow.',
          no_es_tuya: 'That plot is not yours.', fantasma: 'You are a ghost — revive first.' };
        aviso(scene, textos[d.error] || d.message || 'The scarecrow could not be placed.', 'warning');
        return;
      }
      poner(st, plotId, Number(d.hasta) || Date.now() + 7200000);
      if (d.gastado) ajustarFacturaLocal(scene, d.gastado.invoiceId, Number(d.gastado.cantidadRestante));
      aviso(scene, '🧑‍🌾 Scarecrow placed: crows will leave this crop alone for 2 hours.', 'success');
    }).catch(function () {
      aviso(scene, 'Connection problem. Try again.', 'error');
    }).then(function () { st.colocando = false; });
  }

  // ─────────────────────────────────────────────────────── CADA FOTOGRAMA
  function actualizar(st, ahora) {
    var scene = st.scene, p = scene.player;
    var v = viento();
    var conViento = v > 0.45;
    if (ahora - st.ultimoRepaso > 1000) {
      st.ultimoRepaso = ahora;
      // Lo que no se pudo pintar aún (el huerto de la isla llega tarde).
      if (st.pendientes.size) st.pendientes.forEach(function (hasta, plotId) { poner(st, plotId, hasta); });
      // Caducados, fuera.
      var reloj = Date.now();
      st.mapa.forEach(function (e, plotId) { if (e.hasta <= reloj) quitar(st, plotId, true); });
    }
    st.mapa.forEach(function (e) {
      if (!e.spr.active) return;
      e.fase += 0.016 * (1 + v * 3);
      var tex = conViento ? TEX_VIENTO : TEX;
      if (e.spr.texture.key !== tex && scene.textures.exists(tex)) e.spr.setTexture(tex);
      e.spr.rotation = Math.sin(e.fase * 1.7) * (0.012 + v * 0.05);
      if (p) {
        var cerca = Math.hypot(p.x - e.spr.x, p.y - e.spr.y) < CERCA;
        e.etiqueta.setVisible(cerca);
        if (cerca) e.etiqueta.setText('🕒 ' + textoQueda(e.hasta - Date.now()));
      }
    });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events) return null;
    if (scene.__gfEspanta) return scene.__gfEspanta;
    var st = { scene: scene, mapa: new Map(), pendientes: new Map(), ultimoRepaso: 0, colocando: false };
    scene.__gfEspanta = st;
    st.onUpdate = function (t) { try { actualizar(st, t); } catch (e) {} };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    Promise.all([api('/api/espantapajaros'), cargarTexturas(scene)]).then(function (res) {
      var d = res[0] && res[0].datos;
      if (!st.scene || !d || !d.ok || !Array.isArray(d.lista)) return;
      d.lista.forEach(function (e) {
        if (e && typeof e.plotId === 'string' && Number(e.hasta) > Date.now()) poner(st, e.plotId, Number(e.hasta));
      });
    }).catch(function () {});
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfEspanta;
    if (!st) return;
    scene.__gfEspanta = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    Array.from(st.mapa.keys()).forEach(function (k) { quitar(st, k, false); });
    st.pendientes.clear();
    st.scene = null;
  }

  window.GFEspantapajaros = {
    montar: montar,
    desmontar: desmontar,
    colocar: colocar,
    /** ¿Hay uno vivo en esa parcela? (lo pregunta el cuervo) */
    activoEn: function (scene, plotId) {
      var st = scene && scene.__gfEspanta;
      var e = st && st.mapa.get(plotId);
      return !!(e && e.hasta > Date.now() && e.spr && e.spr.active);
    },
    /** Los espantapájaros como posaderos: [{ clave, spr }] (los usa el cuervo). */
    perchas: function (scene) {
      var st = scene && scene.__gfEspanta, out = [];
      if (!st) return out;
      st.mapa.forEach(function (e, plotId) { if (e.spr && e.spr.active) out.push({ clave: 'espanta_' + plotId, spr: e.spr }); });
      return out;
    },
    estado: function (scene) {
      var st = scene && scene.__gfEspanta;
      if (!st) return null;
      var out = [];
      st.mapa.forEach(function (e, k) { out.push({ plotId: k, quedaMin: Math.round((e.hasta - Date.now()) / 60000) }); });
      return { activos: out, pendientes: st.pendientes.size };
    }
  };
})();
