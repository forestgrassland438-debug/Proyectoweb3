/**
 * PUERTA DE TRANSACCIONES (TX GATE)
 * =============================================================================
 * PROBLEMA (2026-08-04):
 *   Las transacciones on-chain (comprar en la tienda, talar, minar, craftear,
 *   sembrar…) se lanzan y siguen corriendo en segundo plano para no bloquear al
 *   jugador. Pero al CAMBIAR DE ESCENA la escena vieja se destruye por completo
 *   (`this.scene.stop()`), y con ella se pierden los callbacks que esperaban esa
 *   transacción. Resultado: compras rápidas justo antes de salir de la tienda —
 *   o una tala cuya transacción seguía en vuelo al entrar a la tienda — se
 *   quedaban a medias.
 *
 * SOLUCIÓN:
 *   Un contador VIVO en `window`, fuera de cualquier escena, donde cada trabajo
 *   on-chain se registra al empezar y se da de baja al terminar. Las pantallas
 *   de carga (LoadingScenegame / LoadingSceneshop) esperan a que el contador
 *   llegue a cero antes de continuar. Como vive en `window`, sobrevive a que la
 *   escena que lanzó la transacción ya no exista.
 *
 * USO:
 *   // envolver una promesa
 *   await window.GFTxGate.track('shop-purchase', miPromesa);
 *
 *   // o a mano
 *   const fin = window.GFTxGate.begin('craft');
 *   try { ... } finally { fin(); }
 *
 *   // esperar a que no quede nada pendiente (con tope de tiempo)
 *   await window.GFTxGate.whenIdle({ timeout: 90000, onTick: (n, s) => {...} });
 *
 * SEGURIDAD DE DISEÑO:
 *   - `whenIdle` NUNCA se queda colgado: tiene tope de tiempo y, si se agota,
 *     deja pasar igualmente (más vale entrar a la escena que dejar al jugador
 *     atrapado en una pantalla de carga eterna).
 *   - Cada trabajo tiene su propio tope: si alguien olvida llamar a `fin()`,
 *     el trabajo se da de baja solo a los 3 minutos y no bloquea para siempre.
 * =============================================================================
 */
(function (global) {
  'use strict';

  // Si ya existe (recarga en caliente, doble inclusión) se reutiliza el mismo
  // objeto: si no, los contadores se separarían en dos y nadie esperaría bien.
  if (global.GFTxGate) return;

  var TOPE_POR_TRABAJO_MS = 180000;  // 3 min: red de seguridad por trabajo
  var siguienteId = 1;

  var trabajos = new Map();          // id → { etiqueta, desde, temporizador }
  var oyentes = [];                  // callbacks a avisar cuando llega a 0

  function avisarSiVacio() {
    if (trabajos.size > 0) return;
    var copia = oyentes.slice();
    oyentes.length = 0;
    copia.forEach(function (f) { try { f(); } catch (e) {} });
  }

  /**
   * Registra un trabajo on-chain en curso.
   * @param {string} etiqueta  para poder decir al jugador qué se está esperando
   * @returns {function} llámala al terminar (es idempotente)
   */
  function begin(etiqueta) {
    var id = siguienteId++;
    var temporizador = setTimeout(function () {
      if (trabajos.has(id)) {
        console.warn('[TxGate] El trabajo "' + etiqueta + '" superó el tope de tiempo; se da de baja solo.');
        trabajos.delete(id);
        avisarSiVacio();
      }
    }, TOPE_POR_TRABAJO_MS);

    trabajos.set(id, { etiqueta: String(etiqueta || 'tx'), desde: Date.now(), temporizador: temporizador });

    var terminado = false;
    return function end() {
      if (terminado) return;
      terminado = true;
      var t = trabajos.get(id);
      if (t) clearTimeout(t.temporizador);
      trabajos.delete(id);
      avisarSiVacio();
    };
  }

  /** Envuelve una promesa para que cuente como trabajo pendiente. */
  function track(etiqueta, promesa) {
    var fin = begin(etiqueta);
    return Promise.resolve(promesa)
      .then(function (v) { fin(); return v; })
      .catch(function (e) { fin(); throw e; });
  }

  /** Cuántos trabajos hay en curso. */
  function pending() { return trabajos.size; }

  /** Etiquetas de lo que está en curso (para el mensaje de la pantalla de carga). */
  function labels() {
    var out = [];
    trabajos.forEach(function (t) { out.push(t.etiqueta); });
    return out;
  }

  /**
   * Espera a que no quede ningún trabajo pendiente.
   * @param {{timeout?:number, onTick?:function}} opciones
   * @returns {Promise<{idle:boolean, waitedMs:number, remaining:number}>}
   *          idle=false significa que se agotó el tope y se sigue igualmente.
   */
  function whenIdle(opciones) {
    opciones = opciones || {};
    var tope = typeof opciones.timeout === 'number' ? opciones.timeout : 90000;
    var inicio = Date.now();

    if (trabajos.size === 0) {
      return Promise.resolve({ idle: true, waitedMs: 0, remaining: 0 });
    }

    return new Promise(function (resolve) {
      var terminado = false;
      var latido = null;

      function acabar(idle) {
        if (terminado) return;
        terminado = true;
        if (latido) clearInterval(latido);
        var i = oyentes.indexOf(alVaciarse);
        if (i !== -1) oyentes.splice(i, 1);
        resolve({ idle: idle, waitedMs: Date.now() - inicio, remaining: trabajos.size });
      }

      function alVaciarse() { acabar(true); }
      oyentes.push(alVaciarse);

      var limite = setTimeout(function () {
        console.warn('[TxGate] Se agotó la espera con ' + trabajos.size + ' trabajo(s) pendiente(s):', labels());
        acabar(false);
      }, tope);

      // Avisos periódicos para que la pantalla de carga pueda contarlo.
      if (typeof opciones.onTick === 'function') {
        latido = setInterval(function () {
          if (terminado) return;
          try { opciones.onTick(trabajos.size, labels()); } catch (e) {}
        }, 400);
        try { opciones.onTick(trabajos.size, labels()); } catch (e) {}
      }

      // Si acaba antes, limpiar el tope.
      oyentes.push(function () { clearTimeout(limite); });
    });
  }

  global.GFTxGate = {
    begin: begin,
    track: track,
    pending: pending,
    labels: labels,
    whenIdle: whenIdle
  };

  console.log('✅ TxGate cargado — las pantallas de carga esperan a las transacciones en vuelo');
})(window);
