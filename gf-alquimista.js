/* ===========================================================================
 * EL ALQUIMISTA
 *
 * QUÉ HACE
 *   Un hub tipo tienda en la casa de pociones: compras frascos para curar a la
 *   mascota y el elixir para revivirla, y los usas ahí mismo.
 *
 * SE ABRE haciendo clic (o tocando) la casa del alquimista, o llamando a
 *   GFAlquimista.abrir().
 *
 * LA COMPRA LA HACE EL SERVIDOR
 *   El precio, el cobro de la plata y el acuñado del ítem on-chain ocurren en
 *   /api/alchemist/buy. Este archivo solo pinta el catálogo que le den y manda
 *   qué quiere comprar el jugador. Si el precio saliera de aquí, se podría
 *   comprar por 0.
 *
 * POR QUÉ NO USA LA TIENDA NORMAL
 *   tienda_sistema.js hace la compra desde el cliente con su propia cola de
 *   transacciones. Engancharse a ella desde fuera obligaba a manosear su estado
 *   interno; aquí toda la compra se resuelve en el servidor con los mismos
 *   helpers que ya usan las misiones.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFAlquimista && window.GFAlquimista.montar(this);
 *   Necesita gf-mascota.js (es quien tiene el helper de HTTP con CSRF).
 * ======================================================================== */
(function () {
  'use strict';

  /* A QUÉ SE ENGANCHA.

     El ALQUIMISTA del pueblo es sprite_npc3 — el que lleva el cartel
     "Alchemist Colin" y está plantado junto a la casa de pociones.

     Estuvo colgado de sprite_npc5 por error: ese es Lord Digby, el mago del
     tutorial, que ya tiene su papel entregando semillas. Abrir la botica al
     hacerle clic era abrirla en el personaje equivocado y además pisaba lo
     suyo.

     sprite_p queda de respaldo por si en algún mapa faltara el NPC. */
  var CASAS = ['sprite_npc3', 'sprite_p', 'sprite_casa_posiones'];

  var montado = null;
  var catalogo = null;

  function log() {
    if (!window.GF_ALQUIMISTA_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[alquimista]');
    console.log.apply(console, a);
  }

  function api(ruta, cuerpo) {
    if (!window.GFMascota || !window.GFMascota.api) {
      return Promise.resolve({ ok: false, datos: null });
    }
    return window.GFMascota.api(ruta, cuerpo);
  }

  // ------------------------------------------------------------------ estilos
  function estilos() {
    if (document.getElementById('gf-alq-css')) return;
    var css = document.createElement('style');
    css.id = 'gf-alq-css';
    css.textContent = [
      '#gf-alq{position:fixed;inset:0;display:none;align-items:center;',
      'justify-content:center;background:rgba(8,10,16,.66);z-index:99998;',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '#gf-alq.abierto{display:flex}',
      '#gf-alq-card{background:#1d1f2a;border:2px solid #3d4356;border-radius:14px;',
      'padding:20px 22px;width:340px;max-width:92vw;max-height:88vh;overflow:auto;',
      'color:#e8e8f0;box-shadow:0 14px 44px rgba(0,0,0,.6)}',
      '#gf-alq-card h3{margin:0 0 2px;font-size:19px}',
      '#gf-alq-sub{margin:0 0 14px;font-size:12px;color:#9aa0b4}',
      '#gf-alq-plata{font-size:13px;color:#d8d2a8;margin:0 0 12px}',
      '.gf-alq-item{display:flex;gap:11px;align-items:center;padding:10px;',
      'border:2px solid #343a4c;border-radius:10px;margin-bottom:9px;background:#252836}',
      '.gf-alq-item img{width:34px;height:42px;image-rendering:pixelated}',
      '.gf-alq-info{flex:1;min-width:0}',
      '.gf-alq-info b{display:block;font-size:14px}',
      '.gf-alq-info span{font-size:11px;color:#9aa0b4}',
      '.gf-alq-acc{display:flex;flex-direction:column;gap:5px}',
      '.gf-alq-acc button{padding:6px 11px;border-radius:8px;border:2px solid #3d4356;',
      'background:#2e3346;color:#e8e8f0;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.gf-alq-acc button:hover{background:#3a4055}',
      '.gf-alq-acc button:disabled{opacity:.45;cursor:not-allowed}',
      '.gf-alq-acc .usar{border-color:#5ec26a}',
      '#gf-alq-pet{font-size:12px;color:#9aa0b4;margin:2px 0 14px}',
      '#gf-alq-aviso{min-height:18px;font-size:12px;color:#e0b64a;margin:6px 0 0}',
      '#gf-alq-cerrar{margin-top:12px;text-align:center;font-size:13px;color:#9aa0b4;',
      'cursor:pointer}'
    ].join('');
    document.head.appendChild(css);
  }

  function panel() {
    var p = document.getElementById('gf-alq');
    if (p) return p;
    estilos();
    p = document.createElement('div');
    p.id = 'gf-alq';
    // Todo en INGLÉS, como el resto de lo que ve el jugador.
    p.innerHTML =
      '<div id="gf-alq-card">' +
        '<h3>Alchemist</h3>' +
        '<p id="gf-alq-sub">Potions for your pet</p>' +
        '<p id="gf-alq-plata">Silver: —</p>' +
        '<p id="gf-alq-pet">Pet: —</p>' +
        '<div id="gf-alq-lista"></div>' +
        '<p id="gf-alq-aviso"></p>' +
        '<div id="gf-alq-cerrar">Close</div>' +
      '</div>';
    document.body.appendChild(p);
    p.addEventListener('click', function (ev) { if (ev.target === p) cerrar(); });
    p.querySelector('#gf-alq-cerrar').addEventListener('click', cerrar);
    return p;
  }

  function aviso(t) {
    var e = document.getElementById('gf-alq-aviso');
    if (e) e.textContent = t || '';
  }

  var IMG = {
    pocion_mascota: './Game/Objetos/pociones/pocion_mascota.png',
    pocion_mascota_grande: './Game/Objetos/pociones/pocion_mascota_grande.png',
    elixir_revivir: './Game/Objetos/pociones/elixir_revivir.png'
  };

  function pintar() {
    if (!catalogo) return;
    var p = panel();
    p.querySelector('#gf-alq-plata').textContent = 'Silver: ' + catalogo.silver;

    var pet = catalogo.pet || {};
    p.querySelector('#gf-alq-pet').textContent =
      'Pet: ' + (pet.alive === false ? 'down — needs a Revival Elixir'
                                     : (pet.health + ' / ' + pet.maxHealth));

    var lista = p.querySelector('#gf-alq-lista');
    lista.innerHTML = '';
    (catalogo.items || []).forEach(function (it) {
      var fila = document.createElement('div');
      fila.className = 'gf-alq-item';
      var puede = catalogo.silver >= it.price;
      // Curar solo sirve con la mascota viva y herida; revivir, solo muerta.
      var usable = it.revives
        ? (it.owned > 0 && pet.alive === false)
        : (it.owned > 0 && pet.alive !== false && pet.health < pet.maxHealth);
      fila.innerHTML =
        '<img src="' + (IMG[it.id] || '') + '" alt="">' +
        '<div class="gf-alq-info"><b>' + it.name + '</b>' +
          '<span>' + (it.revives ? 'Brings your pet back' : 'Heals ' + it.heals + ' HP') +
          '  ·  you have ' + it.owned + '</span></div>' +
        '<div class="gf-alq-acc">' +
          '<button class="comprar"' + (puede ? '' : ' disabled') + '>' +
            it.price + ' silver</button>' +
          '<button class="usar"' + (usable ? '' : ' disabled') + '>' +
            (it.revives ? 'Revive' : 'Use') + '</button>' +
        '</div>';
      fila.querySelector('.comprar').addEventListener('click', function () {
        comprar(it.id);
      });
      fila.querySelector('.usar').addEventListener('click', function () {
        usar(it);
      });
      lista.appendChild(fila);
    });
  }

  function refrescar() {
    return api('/api/alchemist/catalog').then(function (r) {
      if (r.ok && r.datos && r.datos.ok) { catalogo = r.datos; pintar(); }
      return catalogo;
    });
  }

  function comprar(itemId) {
    aviso('');
    return api('/api/alchemist/buy', { itemId: itemId, qty: 1 }).then(function (r) {
      if (r.ok && r.datos && r.datos.ok) {
        log('comprado', itemId, 'por', r.datos.paid);
        // El HUD tiene que enterarse del cobro; statsSync es quien pinta las
        // monedas en el resto del juego.
        if (montado && r.datos.stats) refrescarHud(montado.scene, r.datos.stats);
        if (r.datos.partial) aviso('Your bag was almost full — only part of it fit.');
        return refrescar();
      }
      var e = r.datos && r.datos.error;
      aviso(e === 'plata_insuficiente'
              ? 'Not enough silver. It costs ' + r.datos.precio + '.'
          : e === 'inventario_lleno' ? 'Your bag is full.'
          : e === 'acunado_fallido'  ? 'The purchase could not be minted. Try again.'
          : 'Could not buy that right now.');
      return null;
    });
  }

  function usar(it) {
    aviso('');
    var m = window.GFMascota;
    if (!m) return;
    var accion = it.revives ? m.revivirMascota() : m.curar(it.id);
    return accion.then(function (r) {
      if (!r.ok) {
        aviso(r.error === 'inventario_desfasado'
                ? 'Save your game and try again.'
            : r.error === 'mascota_llena' ? 'Your pet is already at full health.'
            : r.error === 'falta_elixir'  ? 'You need a Revival Elixir.'
            : 'Could not use that.');
      }
      return refrescar();
    });
  }

  function refrescarHud(scene, st) {
    try {
      if (typeof st.plata === 'number') {
        scene.moneda_plata = st.plata;
        if (window.playerStats) window.playerStats.plata = st.plata;
        if (scene.statsSync && scene.statsSync.set) {
          scene.statsSync.set('plata', st.plata, true);
        }
      }
    } catch (e) { log('HUD:', e && e.message); }
  }

  // ------------------------------------------------------------------ abrir
  function abrir() {
    panel().classList.add('abierto');
    aviso('');
    refrescar();
  }

  function cerrar() {
    var p = document.getElementById('gf-alq');
    if (p) p.classList.remove('abierto');
  }

  // ---------------------------------------------------------------- montaje
  function engancharCasa(st) {
    var scene = st.scene;
    for (var i = 0; i < CASAS.length; i++) {
      var casa = scene[CASAS[i]];
      if (!casa || !casa.setInteractive) continue;
      /* PIXEL PERFECT, como los árboles y las minas del juego.

         POR QUÉ: Phaser entrega el clic SOLO al objeto interactivo que esté
         más arriba. Con un área rectangular, cualquier árbol que se solape con
         la esquina de la casa se comía el clic aunque ahí no se viera nada.
         Con pixel perfect, un píxel transparente ya no captura, y el clic llega
         a lo que de verdad se ve bajo el cursor. Es la misma razón por la que
         el juego lo usa en enablePixelPerfectInput(). */
      try {
        if (scene.input && scene.input.makePixelPerfect) {
          casa.setInteractive(scene.input.makePixelPerfect(1));
        } else {
          casa.setInteractive({ useHandCursor: true });
        }
      } catch (e) {
        casa.setInteractive({ useHandCursor: true });
      }
      st.casa = casa;
      st.onClic = function () { abrir(); };
      casa.on('pointerdown', st.onClic);

      /* Borde amarillo al pasar por encima, igual que el granjero y el
         herrero: así se ve que el personaje es pulsable. */
      st.borde = scene.add.graphics();
      st.borde.setDepth(1000);
      st.onSobre = function () {
        try {
          var b = casa.getBounds();
          st.borde.clear();
          st.borde.lineStyle(3, 0xFFFF00, 1);
          st.borde.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
        } catch (e) {}
      };
      st.onFuera = function () { if (st.borde) st.borde.clear(); };
      casa.on('pointerover', st.onSobre);
      casa.on('pointerout', st.onFuera);

      log('enganchado a', CASAS[i]);
      return true;
    }
    return false;
  }

  /* EL BOTÓN DE PROXIMIDAD SE HA QUITADO.

     Se puso como red de seguridad cuando el clic sobre la casa no funcionaba,
     pero al jugador le resultaba molesto que apareciera solo con pasar cerca.
     Enganchado al NPC mago, el clic va como el de cualquier otro NPC y el
     botón sobra. */

  function montar(scene) {
    if (!scene || !scene.add) return null;
    if (scene.__gfAlquimista) return scene.__gfAlquimista;
    var st = { scene: scene, enganchado: false };
    scene.__gfAlquimista = st;
    montado = st;

    st.onUpdate = function () {
      // La casa no existe en el primer frame; se reintenta hasta que aparezca.
      // El NPC no existe en el primer frame; se reintenta hasta que aparezca.
      if (!st.enganchado) st.enganchado = engancharCasa(st);
    };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfAlquimista;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    if (st.casa && st.casa.off) {
      if (st.onClic)  st.casa.off('pointerdown', st.onClic);
      if (st.onSobre) st.casa.off('pointerover', st.onSobre);
      if (st.onFuera) st.casa.off('pointerout', st.onFuera);
    }
    if (st.borde) st.borde.destroy();
    cerrar();
    scene.__gfAlquimista = null;
    if (montado === st) montado = null;
  }

  window.GFAlquimista = {
    montar: montar, desmontar: desmontar,
    abrir: abrir, cerrar: cerrar, refrescar: refrescar,
    comprar: comprar,
    _interno: { pintar: pintar, catalogo: function () { return catalogo; } }
  };
})();
