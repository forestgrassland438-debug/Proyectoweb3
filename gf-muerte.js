/* ===========================================================================
 * MUERTE DEL JUGADOR Y RESURRECCIÓN
 *
 * QUÉ HACE
 *   Cuando la vida llega a 0 el personaje se vuelve FANTASMA — pase lo que
 *   pase, sea de día o de noche — y aparece un panel con un botón «Revive».
 *
 * EL PRECIO LO PONE EL SERVIDOR
 *   30 de plata la primera muerte y el doble en cada una siguiente; pasadas
 *   24 h desde la primera, el contador vuelve a cero y el precio a 30. Todo
 *   eso se calcula en el backend (precioRevivir / normalizarVentanaMuertes).
 *   Aquí solo se PINTA lo que diga. Si el precio saliera de este archivo,
 *   cualquiera reviviría siempre por 30.
 *
 * SIENDO FANTASMA
 *   El personaje se ve translúcido y azulado, y los animales dejan de atacarle
 *   (lo comprueba gf-animales.js con `jugadorFantasma`). No se le bloquea el
 *   movimiento a propósito: puede volver andando adonde quiera antes de pagar.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFMuerte && window.GFMuerte.montar(this);
 *   Necesita gf-mascota.js cargado (es quien habla con /api/pet y /api/player).
 * ======================================================================== */
(function () {
  'use strict';

  var REVISION_MS = 1500;      // cada cuánto se mira si la vida llegó a 0
  var TINTE_FANTASMA = 0x9fd8ff;
  var ALFA_FANTASMA  = 0.45;

  var montado = null;

  function log() {
    if (!window.GF_MUERTE_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[muerte]');
    console.log.apply(console, a);
  }

  function mascota() { return window.GFMascota || null; }

  function esFantasma() {
    var m = mascota();
    return !!(m && m.estado && m.estado().ghost);
  }

  /** Vida del jugador según lo que tenga la escena o el estado global. */
  function vidaActual(scene) {
    if (scene && typeof scene.vidaPorcentaje === 'number') return scene.vidaPorcentaje;
    if (window.playerStats && typeof window.playerStats.vida === 'number') {
      return window.playerStats.vida;
    }
    return null;
  }

  // ------------------------------------------------------------------ panel
  function estilos() {
    if (document.getElementById('gf-muerte-css')) return;
    var css = document.createElement('style');
    css.id = 'gf-muerte-css';
    css.textContent = [
      '#gf-death{position:fixed;inset:0;display:none;align-items:center;',
      'justify-content:center;background:rgba(4,6,12,.78);z-index:100000;',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '#gf-death.abierto{display:flex}',
      '#gf-death-card{background:#181a24;border:2px solid #40465c;border-radius:16px;',
      'padding:26px 28px;min-width:280px;max-width:90vw;color:#e8e8f0;text-align:center;',
      'box-shadow:0 16px 50px rgba(0,0,0,.6)}',
      '#gf-death-card h2{margin:0 0 6px;font-size:26px;letter-spacing:1px;color:#dfe4f5}',
      '#gf-death-card p{margin:0 0 18px;font-size:13px;color:#98a0b8;line-height:1.5}',
      '#gf-death-btn{display:block;width:100%;padding:14px;border-radius:12px;',
      'border:2px solid #5ec26a;background:#26402d;color:#eafbe9;font-size:17px;',
      'font-weight:600;cursor:pointer}',
      '#gf-death-btn:hover{background:#2f5039}',
      '#gf-death-btn:disabled{opacity:.5;cursor:not-allowed}',
      '#gf-death-precio{display:block;font-size:12px;font-weight:400;color:#b7d8bb;',
      'margin-top:3px}',
      '#gf-death-aviso{min-height:18px;margin:12px 0 0;font-size:12px;color:#e0b64a}',
      '#gf-death-nota{margin-top:14px;font-size:11px;color:#6e768f}'
    ].join('');
    document.head.appendChild(css);
  }

  function panel() {
    var p = document.getElementById('gf-death');
    if (p) return p;
    estilos();
    p = document.createElement('div');
    p.id = 'gf-death';
    // Todo el texto que ve el jugador va en INGLÉS.
    p.innerHTML =
      '<div id="gf-death-card">' +
        '<h2>You died</h2>' +
        '<p>Your body is a ghost until you pay to come back.<br>' +
           'Wild animals will leave you alone in the meantime.</p>' +
        '<button id="gf-death-btn">Revive' +
          '<span id="gf-death-precio">30 silver</span>' +
        '</button>' +
        '<p id="gf-death-aviso"></p>' +
        '<p id="gf-death-nota">The price doubles with every death and resets 24 hours ' +
           'after the first one.</p>' +
      '</div>';
    document.body.appendChild(p);
    p.querySelector('#gf-death-btn').addEventListener('click', pagarRevivir);
    return p;
  }

  function aviso(t) {
    var e = document.getElementById('gf-death-aviso');
    if (e) e.textContent = t || '';
  }

  function pintar() {
    var m = mascota();
    if (!m) return;
    var e = m.estado();
    var p = panel();
    p.classList.toggle('abierto', !!e.ghost);
    var precio = document.getElementById('gf-death-precio');
    if (precio) {
      precio.textContent = e.reviveCost + ' silver' +
        (e.deaths > 1 ? '  ·  death #' + e.deaths + ' today' : '');
    }
  }

  function pagarRevivir() {
    var m = mascota();
    if (!m || !m.revivirJugador) return;
    var btn = document.getElementById('gf-death-btn');
    if (btn) btn.disabled = true;
    aviso('');
    m.revivirJugador().then(function (r) {
      if (btn) btn.disabled = false;
      if (r.ok) {
        log('revivido por', r.pagado, 'de plata');
        // El HUD PRIMERO: si se repinta antes de actualizar la vida, el
        // vigilante la ve todavia en 0 y vuelve a declarar la muerte.
        if (r.stats && montado) refrescarHud(montado.scene, r.stats);
        aplicarVisual(false);
        pintar();
        return;
      }
      if (r.error === 'plata_insuficiente') {
        aviso('Not enough silver. You need ' + r.precio + ' and you have ' + r.plata + '.');
      } else if (r.error === 'no_estas_muerto') {
        aplicarVisual(false); pintar();
      } else {
        aviso('Could not revive. Try again in a moment.');
      }
    });
  }

  /** Copia a la escena y al HUD los valores que devolvió el servidor. */
  function refrescarHud(scene, st) {
    try {
      // Mismo motivo que en el mordisco: asignar el número no repinta nada.
      if (typeof scene._adoptarVitalesDelServidor === 'function') {
        scene._adoptarVitalesDelServidor(st);
      } else if (typeof st.vida === 'number') {
        scene.vidaPorcentaje = st.vida;
        if (window.playerStats) window.playerStats.vida = st.vida;
      }
      if (typeof st.plata === 'number') {
        scene.moneda_plata = st.plata;
        if (window.playerStats) window.playerStats.plata = st.plata;
        // statsSync es quien pinta las monedas del HUD en el resto del juego.
        if (scene.statsSync && scene.statsSync.set) {
          scene.statsSync.set('plata', st.plata, true);
        }
      }
      if (typeof scene.actualizarBarras === 'function') scene.actualizarBarras();
    } catch (e) { log('no se pudo refrescar el HUD:', e && e.message); }
  }

  // --------------------------------------------------------- aspecto fantasma
  function aplicarVisual(fantasma) {
    if (!montado) return;
    var scene = montado.scene;
    var partes = [scene.player, scene.usuariox,
                  scene.dog && scene.dog.sprite].filter(Boolean);
    for (var i = 0; i < partes.length; i++) {
      var s = partes[i];
      if (fantasma) {
        if (s.setAlpha) s.setAlpha(ALFA_FANTASMA);
        if (s.setTint) s.setTint(TINTE_FANTASMA);
      } else {
        if (s.setAlpha) s.setAlpha(1);
        // OJO: al perro no se le quita el tinte aquí. Si está muerto, lo tiñe
        // de gris gf-mascota.js, y limpiarlo desde aquí lo devolvería a color
        // aunque siguiera tumbado.
        if (s.clearTint && s !== (scene.dog && scene.dog.sprite)) s.clearTint();
      }
    }
    montado.pintadoComoFantasma = !!fantasma;
  }

  // --------------------------------------------------------------- vigilancia
  function revisar() {
    if (!montado) return;
    var m = mascota();
    if (!m) return;
    var e = m.estado();

    // La vida puede llegar a 0 por un mordisco, pero también talando o minando.
    // Si el servidor todavía no lo sabe, se le avisa.
    var vida = vidaActual(montado.scene);
    if (!e.ghost && vida !== null && vida <= 0 && m.declararMuerte) {
      log('vida a 0 → declarando muerte');
      m.declararMuerte();
    }

    if (!!e.ghost !== !!montado.pintadoComoFantasma) {
      aplicarVisual(!!e.ghost);
      pintar();
    }
  }

  // ------------------------------------------------------------------ montaje
  function montar(scene) {
    if (!scene || !scene.add) return null;
    if (scene.__gfMuerte) return scene.__gfMuerte;
    if (!mascota()) {
      console.warn('[muerte] falta gf-mascota.js: no se monta.');
      return null;
    }

    var st = { scene: scene, pintadoComoFantasma: false };
    scene.__gfMuerte = st;
    montado = st;

    st.timer = setInterval(revisar, REVISION_MS);
    st.quitarOyente = mascota().alCambiar(function () { revisar(); pintar(); });

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    // Al entrar a la escena se pregunta el estado: si te fuiste muerto, sigues
    // muerto al volver.
    mascota().sincronizar('entrar en ' + (scene.scene && scene.scene.key))
      .then(function () { revisar(); pintar(); });

    log('montado');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfMuerte;
    if (!st) return;
    if (st.timer) clearInterval(st.timer);
    if (st.quitarOyente) st.quitarOyente();      // si no, el oyente sobrevive
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var p = document.getElementById('gf-death');
    if (p) p.classList.remove('abierto');
    scene.__gfMuerte = null;
    if (montado === st) montado = null;
  }

  window.GFMuerte = {
    montar: montar,
    desmontar: desmontar,
    esFantasma: esFantasma,
    pintar: pintar,
    _interno: { revisar: revisar, aplicarVisual: aplicarVisual, vidaActual: vidaActual }
  };
})();
