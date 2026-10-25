/* ===========================================================================
 * LOS NOMBRES NO SE PISAN                                         (2026-10-24)
 *
 * "En GameScene no funciona bien el index con el personaje y los NPC; no
 * quiero que en otros mapas pase igual." En la captura: el jugador delante de
 * Crafter Jack (que queda tapado entero), la mascota detrás, y encima un lío
 * de letras — "Cra[min]Jack" — con el nombre del NPC cruzando a la mascota.
 *
 * POR QUÉ PASABA
 *   Cada nombre va con la profundidad de su dueño (sus pies + 1). Eso está
 *   bien y se queda así (ya hubo quejas en las dos direcciones: el nombre de
 *   "Lord Digby" cruzando al jugador cuando estaba a 90000, y los de los
 *   remotos tapando los carteles cuando estaban a 99999). Lo que faltaba es
 *   que nadie mira si dos nombres caen en el mismo sitio, ni si el nombre se
 *   queda flotando sobre un dueño que no se ve.
 *
 * QUÉ HACE
 *   Después del update de cada escena (evento 'prerender' del juego, así que
 *   todas las escenas lo tienen sin tocar ninguna), para cada nombre visible:
 *     1. si su dueño está tapado casi entero por cuerpos que van DELANTE, el
 *        nombre se apaga (no se sabe de quién es);
 *     2. si lo cruza un cuerpo que va delante de su dueño (el nombre se
 *        dibujaría cortado por ese cuerpo), se apaga;
 *     3. si se solapa con un nombre más importante, se apaga: primero el tuyo,
 *        luego tu mascota, luego los NPC y al final los demás jugadores y sus
 *        mascotas; a igual importancia gana el que va delante.
 *   TU nombre no se apaga nunca: si te pones detrás de alguien, sube justo por
 *   encima de su cuerpo. Lo demás solo toca el ALFA, con un fundido corto: ni
 *   la profundidad ni la posición (eso lo siguen poniendo las escenas como
 *   siempre). Al dejar de solaparse, el nombre vuelve.
 *
 * QUIÉN ENTRA: el jugador (usuariox) y su mascota (dogNameText); los NPC del
 *   pueblo y de la tienda (npcx…, con su dibujo nuevo de gf-npcs-pueblo.js),
 *   los de gf-npcs.js (mapas y casas), los remotos (otherPlayers) con sus
 *   mascotas y, los últimos, los carteles de los mapas salvajes (2026-10-25).
 *   Una escena sin nada de eso no cuesta nada.
 * ======================================================================== */
(function () {
  'use strict';

  var CADA = 3;              // se decide cada 3 fotogramas; el fundido va en todos
  var FUNDIDO = 0.25;        // lo que se acerca el alfa a su objetivo por fotograma
  var TAPADO = 0.6;          // parte del dueño que tiene que quedar tapada
  // El cuerpo de un personaje, en px de mundo: el jugador mide 102 px de
  // cuadro y unos 96 de dibujo (memoria escala-de-objetos).
  var HUMANO = { w: 40, h: 94 };

  function vestido(scene, o) {
    var st = scene.__gfNpcsPueblo;
    if (!st || !st.npcs) return null;
    for (var i = 0; i < st.npcs.length; i++) if (st.npcs[i].original === o) return st.npcs[i].spr;
    return null;
  }
  /** El NPC dibujado más cerca por debajo del cartel (la tienda no guarda quién es quién). */
  function bajoElCartel(scene, t) {
    var st = scene.__gfNpcsPueblo, mejor = null, d0 = 1e9;
    if (!st || !st.npcs) return null;
    st.npcs.forEach(function (n) {
      var dx = Math.abs(n.spr.x - t.x), dy = n.spr.y - t.y;
      if (dx < 90 && dy > 0 && dy < 260 && dx + dy < d0) { d0 = dx + dy; mejor = n.spr; }
    });
    return mejor;
  }

  function recoger(scene) {
    var L = [];
    var vivo = function (o) { return o && o.scene && o.active !== false; };
    if (vivo(scene.usuariox) && vivo(scene.player)) L.push({ t: scene.usuariox, c: scene.player, prio: 0, humano: true });
    if (scene.dog && vivo(scene.dog.sprite) && vivo(scene.dogNameText)) L.push({ t: scene.dogNameText, c: scene.dog.sprite, prio: 1 });
    ['npcx', 'npcx1', 'npcx2', 'npcx3', 'npcx4', 'npcx5'].forEach(function (k, i) {
      var t = scene[k];
      if (!vivo(t)) return;
      var o = i ? scene['sprite_npc' + i] : null;
      var c = vivo(o) ? (vestido(scene, o) || o) : bajoElCartel(scene, t);
      if (vivo(c)) L.push({ t: t, c: c, prio: 2, humano: true });
    });
    var g = scene.__gfNpcs;
    if (g && g.npcs) g.npcs.forEach(function (n) { if (vivo(n.nombre) && vivo(n.spr)) L.push({ t: n.nombre, c: n.spr, prio: 2, humano: true }); });
    var op = scene.otherPlayers;
    if (op) {
      for (var id in op) {
        var q = op[id];
        if (!q) continue;
        if (vivo(q.sprite) && vivo(q.nameText)) L.push({ t: q.nameText, c: q.sprite, prio: 3, humano: true });
        if (q.dog && vivo(q.dog.sprite) && vivo(q.dog.nameText)) L.push({ t: q.dog.nameText, c: q.dog.sprite, prio: 4 });
      }
    }
    // (2026-10-25) Los carteles de los mapas salvajes (gf-salvaje.js los guarda
    // de dos en dos: el poste y su texto). Son lo de menos: se apagan si un
    // nombre cae encima o si alguien pasa por delante del texto, y vuelven.
    var sv = scene.__gfSalvaje;
    if (sv && sv.carteles) {
      for (var k = 0; k + 1 < sv.carteles.length; k += 2) {
        if (vivo(sv.carteles[k]) && vivo(sv.carteles[k + 1])) L.push({ t: sv.carteles[k + 1], c: sv.carteles[k], prio: 5 });
      }
    }
    return L;
  }

  function cajaCuerpo(e) {
    var o = e.c, w = o.displayWidth || 0, h = o.displayHeight || 0;
    var pie = o.y + (1 - (o.originY == null ? 0.5 : o.originY)) * h;
    var cx = o.x + (0.5 - (o.originX == null ? 0.5 : o.originX)) * w;
    var bw = e.humano ? Math.min(HUMANO.w, w * 0.6) : w * 0.6;
    var bh = e.humano ? Math.min(HUMANO.h, h * 0.9) : h * 0.8;
    return { x0: cx - bw / 2, x1: cx + bw / 2, y0: pie - bh, y1: pie };
  }
  function cajaTexto(t) {
    var w = t.displayWidth || 0, h = t.displayHeight || 0;
    var x0 = t.x - (t.originX == null ? 0 : t.originX) * w, y0 = t.y - (t.originY == null ? 0 : t.originY) * h;
    // Un píxel menos por cada lado: dos nombres que solo se rozan no se pisan.
    return { x0: x0 + 1, x1: x0 + w - 1, y0: y0 + 1, y1: y0 + h - 1 };
  }
  function cruza(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
  function area(a) { return Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0); }
  function comun(a, b) {
    return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  }
  function visible(o) { return o.visible && o.alpha > 0.05; }

  function decidir(scene, L) {
    var n = L.length, i, j;
    for (i = 0; i < n; i++) {
      var e = L[i];
      e.cuerpo = cajaCuerpo(e);
      e.texto = cajaTexto(e.t);
      // El dibujo de los NPC del pueblo va encima de un original casi invisible:
      // cuenta el que se ve.
      e.ve = e.t.visible && visible(e.c);
      e.prof = e.c.depth || 0;
    }
    for (i = 0; i < n; i++) {
      var a = L[i], fuera = false;
      if (!a.ve) { a.objetivo = null; continue; }
      /* TU NOMBRE NO SE APAGA NUNCA. Si lo cruza un cuerpo que va delante (te
         pones detrás de un NPC), sube justo por encima de ese cuerpo y se lee
         entero. Se recalcula desde la profundidad de tu personaje cada vez,
         así que no se queda "pegado" arriba al apartarte. */
      if (a.prio === 0) {
        var sube = a.prof + 1;
        for (j = 0; j < n; j++) {
          var d = L[j];
          if (j !== i && d.ve && d.prof > a.prof && cruza(d.cuerpo, a.texto)) sube = Math.max(sube, d.prof + 1);
        }
        a.sobre = sube - a.prof;
        a.objetivo = 1;
        continue;
      }
      // 1 y 2: cuerpos que van DELANTE del dueño.
      var tapa = 0;
      for (j = 0; j < n && !fuera; j++) {
        if (j === i) continue;
        var b = L[j];
        if (!b.ve || b.prof <= a.prof || b.c === a.c) continue;
        if (cruza(b.cuerpo, a.texto)) fuera = true;
        else tapa += comun(b.cuerpo, a.cuerpo);
      }
      if (!fuera && tapa >= TAPADO * area(a.cuerpo)) fuera = true;
      // 3: nombres más importantes en el mismo sitio.
      for (j = 0; j < n && !fuera; j++) {
        if (j === i) continue;
        var c = L[j];
        if (!c.ve) continue;
        var manda = c.prio < a.prio || (c.prio === a.prio && (c.prof > a.prof || (c.prof === a.prof && j < i)));
        if (manda && cruza(c.texto, a.texto)) fuera = true;
      }
      a.objetivo = fuera ? 0 : 1;
    }
  }

  function aplicar(scene, L) {
    var reg = scene.__gfEtiquetas || (scene.__gfEtiquetas = { base: new Map() });
    var vistos = new Set();
    L.forEach(function (e) {
      if (e.objetivo == null || !e.t.scene) return;
      var t = e.t;
      // Solo se SUBE: cada escena le vuelve a poner la suya en su update (las
      // casas, por ejemplo, la tienen siempre arriba del todo).
      if (e.sobre != null) { var quiere = (e.c.depth || 0) + e.sobre; if (t.depth < quiere) t.setDepth(quiere); }
      vistos.add(t);
      var r = reg.base.get(t);
      // Si alguien le cambió el alfa por su cuenta, ese es su alfa de verdad.
      if (!r || Math.abs(t.alpha - r.puesto) > 0.001) { r = { base: t.alpha, k: r ? r.k : 1, puesto: t.alpha }; reg.base.set(t, r); }
      var k = r.k + (e.objetivo - r.k) * FUNDIDO;
      if (Math.abs(k - e.objetivo) < 0.02) k = e.objetivo;
      r.k = k;
      r.puesto = r.base * k;
      if (Math.abs(t.alpha - r.puesto) > 0.001) t.setAlpha(r.puesto);
    });
    // Los que ya no están en la lista (escondidos, sin dueño): su alfa de siempre.
    reg.base.forEach(function (r, t) {
      if (vistos.has(t)) return;
      try { if (t.scene && Math.abs(t.alpha - r.puesto) < 0.001) t.setAlpha(r.base); } catch (e) {}
      reg.base.delete(t);
    });
  }

  function paso(scene) {
    if (!scene || !scene.sys || !scene.sys.isActive() || !scene.player) return;
    var reg = scene.__gfEtiquetas || (scene.__gfEtiquetas = { base: new Map() });
    if (!reg.apagar) {
      reg.apagar = function () { if (scene.__gfEtiquetas === reg) scene.__gfEtiquetas = null; };
      scene.events.once('shutdown', reg.apagar);
    }
    reg.n = (reg.n || 0) + 1;
    if (!reg.L || reg.n % CADA === 0) {
      reg.L = recoger(scene);
      decidir(scene, reg.L);
    }
    aplicar(scene, reg.L);
  }

  var enganchado = null;
  function alPintar() {
    var g = enganchado;
    if (!g || !g.scene) return;
    var activas = g.scene.getScenes(true);
    for (var i = 0; i < activas.length; i++) {
      try { paso(activas[i]); } catch (e) { if (!alPintar.avisado) { alPintar.avisado = true; console.warn('[etiquetas]', e); } }
    }
  }
  /* Se engancha al juego cuando exista (y otra vez si se vuelve a crear). Las
     escenas reutilizan su instancia: lo guardado en scene.__gfEtiquetas se
     limpia al apagarlas (ver paso) para no guardar textos destruidos. */
  function enganchar() {
    var g = window.game;
    if (g && g !== enganchado && g.events) {
      if (enganchado && enganchado.events) enganchado.events.off('prerender', alPintar);
      enganchado = g;
      g.events.on('prerender', alPintar);
    }
  }
  setInterval(enganchar, 1000);
  enganchar();
  function olvidar(scene) { if (scene) scene.__gfEtiquetas = null; }

  window.GFEtiquetas = { olvidar: olvidar, _interno: { recoger: recoger, decidir: decidir, cajaCuerpo: cajaCuerpo, cajaTexto: cajaTexto } };
})();
