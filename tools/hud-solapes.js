/* ===========================================================================
 * HUD SIN SOLAPES — comprobador para pegar en la consola     (2026-10-11)
 *
 * "No quiero que en el HUD existan botones encima de otros, ni en teléfono ni
 * en PC ni al atacar." Esto mide en la página TODOS los controles visibles
 * del HUD (botones, casillas, paneles fijos) y devuelve:
 *   · solapes: parejas de controles que se pisan (más de 4 px²), sin contar
 *     un control dentro de su propio contenedor;
 *   · fuera:   controles que se salen de la pantalla.
 *
 * Uso (consola del juego o el navegador de pruebas):
 *   await import('./tools/hud-solapes.js')   // o pegar el archivo
 *   window.gfHudSolapes()
 * ======================================================================== */
(function () {
  'use strict';

  var SELECTOR = [
    'button', '[role="button"]', 'input', 'select', 'textarea',
    '.quick-slot', '.inv-slot', '#quick-slots-bar', '#gf-espada-poderes', '.gf-tajo-btn',
    '[id$="-btn"]', '[class*="hud-btn"]', '#gf-jefe-mina', '#gf-serpiente-barra'
  ].join(',');

  function visible(el) {
    if (!el.isConnected || el.closest('[hidden]')) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    // Dentro de algo oculto o transparente, tampoco.
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false;
    }
    var r = el.getBoundingClientRect();
    return r.width >= 6 && r.height >= 6;
  }

  /** ¿Es parte del HUD fijo (no de un panel abierto encima de todo)? */
  function delHud(el) {
    for (var p = el; p && p !== document.body; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
    }
    return false;
  }

  function nombre(el) {
    if (el.id) return '#' + el.id;
    var c = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    var t = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18);
    return el.tagName.toLowerCase() + c + (t ? ' "' + t + '"' : '');
  }

  window.gfHudSolapes = function (opciones) {
    opciones = opciones || {};
    var W = window.innerWidth, H = window.innerHeight;
    var els = Array.prototype.filter.call(document.querySelectorAll(SELECTOR), function (el) {
      return visible(el) && delHud(el);
    });
    // Un control dentro de otro de la lista (la casilla dentro de la barra):
    // se mide la hoja, no el contenedor, salvo que el contenedor sea lo único.
    var hojas = els.filter(function (el) {
      return !els.some(function (o) { return o !== el && el.contains(o); });
    });
    var cajas = hojas.map(function (el) { return { el: el, r: el.getBoundingClientRect() }; });
    var solapes = [], fuera = [];
    for (var i = 0; i < cajas.length; i++) {
      var a = cajas[i].r;
      if (a.left < -1 || a.top < -1 || a.right > W + 1 || a.bottom > H + 1) fuera.push(nombre(cajas[i].el));
      for (var j = i + 1; j < cajas.length; j++) {
        var b = cajas[j].r;
        var ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        var iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 2 && iy > 2 && ix * iy > 4) {
          if (cajas[i].el.contains(cajas[j].el) || cajas[j].el.contains(cajas[i].el)) continue;
          solapes.push(nombre(cajas[i].el) + '  ×  ' + nombre(cajas[j].el) + '  (' + Math.round(ix) + 'x' + Math.round(iy) + ')');
        }
      }
    }
    return { vista: W + 'x' + H, tactil: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
             controles: cajas.length, solapes: solapes, fuera: fuera };
  };
})();
