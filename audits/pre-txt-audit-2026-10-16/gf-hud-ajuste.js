/* ===========================================================================
 * EL HUD SIN BOTONES ENCIMA DE OTROS                               (2026-10-11)
 *
 * "No quiero que en el HUD existan botones encima de otros, ni en teléfono ni
 * en PC ni al atacar."
 *
 * 1. LA COLUMNA DE BOTONES REDONDOS. gf-hud.css calcula su tamaño para que
 *    quepan TODOS entre su arriba y el borde de abajo. Lo calculaba para
 *    nueve; con "Skills" son diez y, en pantallas de 600 px de alto, "Store"
 *    se salía por abajo. Ahora el número lo pone esto (`--gfh-rb-n`), contando
 *    los que se ven: si mañana hay once, siguen cabiendo.
 *
 * 2. LOS BOTONES DE LA ESPADA (V, B, N y el de tajo en móvil). Su sitio lo
 *    pone su CSS; si en alguna pantalla cayeran encima de otro control, se
 *    suben (y si no hay hueco, se apartan a la izquierda) hasta no pisar nada.
 *
 * Se recoloca al cambiar el tamaño de la ventana, al aparecer o desaparecer
 * botones y al equipar la espada. Sin temporizadores sueltos: un solo
 * requestAnimationFrame por tanda de cambios.
 * ======================================================================== */
(function () {
  'use strict';
  // Sin DOM de verdad (las herramientas de tools/ cargan esto en Node), nada.
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;

  // Lo que se aparta (en este orden) y de lo que hay que apartarse.
  var MOVIBLES = ['#gf-espada-poderes', '#gf-tajo-btn'];
  var OBSTACULOS = '#round-buttons-container .round-btn, #quick-slots-bar, #open-chat-btn, #gf-espada-btn, ' +
    '#inv-shortcut-btn, .corner-box, #toggle-hud-btn, #gf-jefe-mina, #gf-serpiente-barra';

  function visible(el) {
    if (!el || !el.isConnected || el.hidden || el.closest('[hidden]')) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
    }
    var r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  }

  function pisa(a, b) {
    var ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ix > 2 && iy > 2;
  }

  /* ── 1. Cuántos botones redondos hay ── */
  function contarRedondos() {
    var c = document.getElementById('round-buttons-container');
    if (!c) return;
    var n = 0;
    for (var i = 0; i < c.children.length; i++) {
      var b = c.children[i];
      if (!b.classList || !b.classList.contains('round-btn') || b.hidden) continue;
      if (getComputedStyle(b).display === 'none') continue;
      n++;
    }
    n = String(Math.max(1, n));
    if (c.style.getPropertyValue('--gfh-rb-n') !== n) {
      c.style.setProperty('--gfh-rb-n', n);
      c.style.setProperty('--gfh-rb-filas', String(Math.ceil(Number(n) / 2)));
    }
  }

  /* ── 2. Apartar lo que pise a otro ── */
  function apartar(sel, yaColocados) {
    var el = document.querySelector(sel);
    if (!el) return;
    // Primero, al sitio que dice su CSS (sin lo que se le movió la última vez).
    el.style.removeProperty('bottom');
    el.style.removeProperty('right');
    // El botón de golpe va DENTRO del panel de poderes (el abanico del
    // móvil, 2026-10-11): se mueve con él, no por su cuenta.
    if (sel !== '#gf-espada-poderes' && el.closest('#gf-espada-poderes')) return;
    if (!visible(el)) return;
    var obst = Array.prototype.filter.call(document.querySelectorAll(OBSTACULOS), function (o) {
      return visible(o) && !el.contains(o) && !o.contains(el);
    }).map(function (o) { return o.getBoundingClientRect(); }).concat(yaColocados);
    var r0 = el.getBoundingClientRect();
    var choca = function (dx, dy) {
      var r = { left: r0.left - dx, right: r0.right - dx, top: r0.top - dy, bottom: r0.bottom - dy };
      if (r.top < 8 || r.left < 8) return true;
      for (var i = 0; i < obst.length; i++) if (pisa(r, obst[i])) return true;
      return false;
    };
    if (!choca(0, 0)) { yaColocados.push(r0); return; }
    var cs = getComputedStyle(el);
    var bottom = parseFloat(cs.bottom) || 0, right = parseFloat(cs.right) || 0;
    // Hacia arriba primero (el pulgar sigue llegando); si no, hacia la izquierda.
    for (var dy = 8; dy <= window.innerHeight * 0.6; dy += 8) {
      if (!choca(0, dy)) {
        el.style.setProperty('bottom', (bottom + dy) + 'px');
        yaColocados.push(el.getBoundingClientRect());
        return;
      }
    }
    for (var dx = 8; dx <= window.innerWidth * 0.6; dx += 8) {
      if (!choca(dx, 0)) {
        el.style.setProperty('right', (right + dx) + 'px');
        yaColocados.push(el.getBoundingClientRect());
        return;
      }
    }
  }

  function ajustar() {
    contarRedondos();
    var colocados = [];
    MOVIBLES.forEach(function (s) { apartar(s, colocados); });
  }

  var pedido = 0;
  function pronto() {
    if (pedido) return;
    pedido = requestAnimationFrame(function () { pedido = 0; ajustar(); });
  }

  var vigilados = new WeakSet();
  var observador = new MutationObserver(function (cambios) {
    // Los cambios de estilo que hacemos NOSOTROS no cuentan (si no, bucle).
    for (var i = 0; i < cambios.length; i++) {
      var c = cambios[i];
      if (c.type === 'attributes' && c.attributeName === 'style' &&
          MOVIBLES.some(function (s) { return c.target.matches && c.target.matches(s); })) continue;
      if (c.type === 'attributes' && c.attributeName === 'style' && c.target.id === 'round-buttons-container') continue;
      // Reescribir un atributo con el MISMO valor (la espada repinta sus
      // botones cada 250 ms) no cambia nada.
      if (c.type === 'attributes' && c.oldValue === c.target.getAttribute(c.attributeName)) continue;
      pronto();
      return;
    }
  });

  function vigilar() {
    // El HUD y los botones de la espada nacen tarde (los crea cada escena):
    // se mira de vez en cuando si hay alguno nuevo que vigilar.
    ['round-buttons-container', 'gf-espada-poderes', 'gf-tajo-btn', 'quick-slots-bar', 'game-hud'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || vigilados.has(el)) return;
      vigilados.add(el);
      observador.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'class', 'style'], childList: true });
      pronto();
    });
  }

  function montar() {
    vigilar();
    window.addEventListener('resize', pronto);
    window.addEventListener('orientationchange', pronto);
    // Los botones redondos ENTRAN con una animación (crecen desde pequeños):
    // medidos a mitad, no pisan nada y luego sí. Se vuelve a mirar cuando
    // termina una animación o transición del HUD (no las del resto del juego).
    var delHud = function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#game-hud, #quick-slots-bar, #gf-espada-poderes, #gf-tajo-btn')) pronto();
    };
    document.addEventListener('animationend', delHud, true);
    document.addEventListener('transitionend', delHud, true);
    // Los botones de la espada se crean al montar cada escena: el cuerpo
    // avisa cuando entra un hijo nuevo (solo hijos directos: barato).
    new MutationObserver(function () { vigilar(); pronto(); }).observe(document.body, { childList: true });
    ajustar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.GFHudAjuste = { ajustar: ajustar };
})();
