/* ===========================================================================
 * ENTRAR EN LAS CASAS                                              (2026-10-05)
 *
 * QUÉ HACE
 *   Las casas del pueblo (las de los NPC, la casa en L, las dos de dos pisos de
 *   la plaza, la de pociones, la herrería y la cabaña) tienen ahora interior.
 *   Al acercarse a su puerta sale un cartel "▲ Enter"; andando hacia la puerta
 *   (o tocando el cartel en el móvil) se entra. Dentro manda
 *   Scenes/InteriorScene.js.
 *
 * LA TABLA
 *   Cada casa: qué sala usa (Maps/interiores/<sala>.json) y DÓNDE está su
 *   puerta en el mapa de fuera. La puerta se midió sobre el dibujo de cada
 *   casa (Game/Objetos/*.png, que se pinta al doble con su esquina de abajo a
 *   la izquierda en la x, y del objeto de mapa_principal.json): centro del
 *   batiente y su borde de abajo.
 *
 * EL VIAJE
 *   Igual que la mina: se guarda `mundo = 5` y se pasa por la pantalla de
 *   carga (LoadingScenegame tiene el 5 → InteriorScene). Qué casa es se deja
 *   en una nota (`window.__gfCasa`) y también en localStorage: si se recarga
 *   la página dentro, la pantalla de carga vuelve a la misma casa. Sin nota,
 *   InteriorScene saca al jugador al pueblo.
 *
 * CADA CASA ES SU SALA
 *   `casa:<id>`: quien está en la misma casa se ve; tres casas que comparten
 *   decorado (las de NPC usan todas 'hogar') no se mezclan.
 * ======================================================================== */
(function () {
  'use strict';

  var CASAS = {
    casa_npc1:  { sala: 'hogar',    puerta: { x: 1472, y: 612 },  titulo: 'Cottage' },
    casa_npc2:  { sala: 'hogar',    puerta: { x: 1962, y: 607 },  titulo: 'Cottage' },
    casa_L:     { sala: 'hogar',    puerta: { x: 1488, y: 3253 }, titulo: 'Corner House' },
    casa_comida:  { sala: 'posada', puerta: { x: 2444, y: 3230 }, titulo: 'The Inn' },
    casa_comida2: { sala: 'posada', puerta: { x: 2928, y: 3247 }, titulo: 'The Tavern' },
    casa_posiones: { sala: 'pociones', puerta: { x: 2452, y: 1492 }, titulo: 'Potion Shop' },
    casa_herreria: { sala: 'herreria', puerta: { x: 3137, y: 1975 }, titulo: 'Smithy' },
    cabana:     { sala: 'cabana',   puerta: { x: 715, y: 463 },   titulo: 'Farm Cabin' },
    /* (2026-10-19) La cabaña del cazador, en el MAPA SALVAJE (mundo 6): su
       puerta está en coordenadas de ese mapa (SalvajeScene.CABANA) y al salir
       se vuelve allí (InteriorScene._volverAlMundo). Las casas sin `mundo`
       son del pueblo (1). */
    cabana_monte: { sala: 'cabana', puerta: { x: 2804, y: 1668 }, titulo: "Hunter's Lodge", mundo: 6 }
  };
  /* LA TIENDA: tiene su propia entrada (la zona `area_entrada_tienda` del
     mapa, que GameScene ya vigila), así que aquí SOLO se le pone el cartel,
     para que todas las puertas que se pueden cruzar digan lo mismo. */
  var SOLO_CARTEL = {
    tienda: { puerta: { x: 1553, y: 1483 }, alto: 96 }
    // La cueva (2026-10-05) se añade al montar: su puerta sale del objeto
    // `puerta_mina` del mapa (scene.collisionRectangles3, ver GameScene).
  };
  var CLAVE_LS = 'gf_casa';
  var CERCA = 96;            // a esta distancia sale el cartel
  /* EL UMBRAL (2026-10-05). "Si pego el personaje a la puerta de la tienda
     paso; ¿por qué en las casas no?" Porque aquí se pedía tener los pies a
     menos de 22 px de la puerta, y el muro de cada casa para al jugador con
     los pies a 29-38 px (medido casa por casa: el rectángulo de choque del
     jugador es el de sus pies, y el muro de la casa empieza un poco por
     debajo del batiente). Nunca se llegaba. Ahora la zona llega hasta donde
     el muro te para, igual que la de la tienda: pegarse a la puerta y
     empujar hacia ella basta. */
  var UMBRAL_X = 24;
  var UMBRAL_ARRIBA = -10;
  var UMBRAL_ABAJO = 46;

  function guardarNota(nota) {
    window.__gfCasa = nota;
    try { localStorage.setItem(CLAVE_LS, JSON.stringify(nota)); } catch (e) {}
  }

  /** La nota de la casa a la que se va (o en la que se está). */
  function nota() {
    if (window.__gfCasa && CASAS[window.__gfCasa.id]) return window.__gfCasa;
    try {
      var n = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null');
      if (n && CASAS[n.id]) { window.__gfCasa = n; return n; }
    } catch (e) {}
    return null;
  }

  function olvidar() {
    window.__gfCasa = null;
    try { localStorage.removeItem(CLAVE_LS); } catch (e) {}
  }

  // ───────────────────────────────────────────────────────── ENTRAR
  async function entrar(scene, id) {
    var casa = CASAS[id];
    if (!casa || !scene || scene._cambiandoEscena) return;
    var propietaria = scene.__gfCasas;
    if (!propietaria) return;
    if (!scene.scene.get('InteriorScene')) { console.warn('🏠 InteriorScene no está registrada'); return; }
    scene._cambiandoEscena = true;
    console.log('🏠 entrando en', id);
    guardarNota({ id: id, sala: casa.sala });
    try { scene._cancelarArrastre && scene._cancelarArrastre(); } catch (e) {}
    try { scene.player && scene.player.anims && scene.player.anims.stop(); } catch (e) {}

    scene.mundo = 5;
    // Al salir se aparece delante de la puerta: es lo que se guarda.
    scene.posicionplayerx = casa.puerta.x;
    scene.posicionplayery = casa.puerta.y + 40;
    try { await scene.savegg(); } catch (e) { console.warn('🏠 guardado antes de entrar:', e); }
    // El guardado puede terminar después del cierre o de un nuevo montaje.
    if (scene.__gfCasas !== propietaria || !scene.sys ||
        (typeof scene.sys.isActive === 'function' && !scene.sys.isActive())) return;
    scene.saveTimer = 0;

    try { scene._ocultarHUD && scene._ocultarHUD(); } catch (e) {}
    try { scene.removeListener && scene.removeListener(); } catch (e) {}
    try { scene._unbindAllDomClicks && scene._unbindAllDomClicks(); } catch (e) {}
    try { scene.stopMusicSafely && scene.stopMusicSafely(); } catch (e) {}
    var sala = 'casa:' + id;
    scene._salaDestino = sala;
    if (scene.socket && scene.socket.connected) {
      scene.socket.emit('joinRoom', { room: sala, username: scene.Username || '---',
        soulbound: window.GFSoulbound ? window.GFSoulbound.actual() : null, lastScene: (scene.sys && scene.sys.settings && scene.sys.settings.key) || 'GameScene' });
    }
    try { scene.cleanupScene && scene.cleanupScene(); } catch (e) {}
    scene.scene.start('LoadingScenegame');
  }

  // ─────────────────────────────────────────── LAS PUERTAS EN EL PUEBLO
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfCasas) return;
    // Solo las puertas de ESTE mundo (el pueblo es el 1; la cabaña del
    // cazador, el 6). La tienda y la cueva, solo en el pueblo.
    // El mundo sale de la ESCENA, no de `scene.mundo`: Phaser reutiliza la
    // instancia del pueblo y ese valor puede seguir diciendo 6 al volver.
    var clave = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    var mundo = { GameScene: 1, SalvajeScene: 6 }[clave] || 1;
    var st = { scene: scene, carteles: {}, cerca: null, armada: {}, mundo: mundo,
               casasIds: Object.keys(CASAS).filter(function (id) { return (CASAS[id].mundo || 1) === mundo; }),
               cartelIds: mundo === 1 ? Object.keys(SOLO_CARTEL) : [], proximaCueva: 0 };
    scene.__gfCasas = st;
    st.casasIds.forEach(function (id) {
      var p = CASAS[id].puerta;
      var t = scene.add.text(p.x, p.y - 74, '▲ Enter', {
        fontFamily: '"PressStart2P", monospace', fontSize: '9px', color: '#fff6dc',
        backgroundColor: '#2a1a10dd', padding: { x: 6, y: 4 }, resolution: 3
      }).setOrigin(0.5, 1).setDepth(9500).setVisible(false).setInteractive({ useHandCursor: true });
      t.on('pointerdown', function (ptr, lx, ly, ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); entrar(scene, id); });
      st.carteles[id] = t;
      st.armada[id] = true;
    });
    // Los que solo llevan cartel (la tienda y la cueva), cada uno con el suyo.
    st.soloCartel = {};
    st.cartelIds.forEach(function (id) { st.soloCartel[id] = SOLO_CARTEL[id]; });
    function cartelSolo(id) {
      var c = st.soloCartel[id];
      st.carteles['_' + id] = scene.add.text(c.puerta.x, c.puerta.y - c.alto, '▲ Enter', {
        fontFamily: '"PressStart2P", monospace', fontSize: '9px', color: '#fff6dc',
        backgroundColor: '#2a1a10dd', padding: { x: 6, y: 4 }, resolution: 3
      }).setOrigin(0.5, 1).setDepth(9500).setVisible(false);
    }
    st.cartelIds.forEach(cartelSolo);
    /* La puerta de la cueva: el rectángulo del objeto `puerta_mina`, que
       GameScene saca del mapa en su create(). Se busca en el update por si
       este módulo se monta antes de que exista. */
    function buscarCueva(time) {
      if (st.mundo !== 1 || st.soloCartel.cueva || time < st.proximaCueva) return;
      st.proximaCueva = time + 500;
      var r = Array.isArray(scene.collisionRectangles3) && scene.collisionRectangles3[0];
      if (!r || !(r.width > 0)) return;
      st.soloCartel.cueva = { puerta: { x: r.x + r.width / 2, y: r.y + r.height }, alto: r.height + 14 };
      st.cartelIds.push('cueva');
      cartelSolo('cueva');
    }
    st.onUpdate = function (time) {
      var p = scene.player;
      if (!p || !p.active || scene._cambiandoEscena) return;
      buscarCueva(time);
      var pies = p.y + 51;
      st.cartelIds.forEach(function (id) {
        var c = st.soloCartel[id], t = st.carteles['_' + id];
        if (!t) return;
        var cerca = Math.abs(p.x - c.puerta.x) < CERCA && pies - c.puerta.y > -30 && pies - c.puerta.y < CERCA + 40;
        t.setVisible(cerca);
        if (cerca) t.y = c.puerta.y - c.alto + Math.sin(time / 260) * 2;
      });
      // ¿Quiere ir hacia arriba? Con el teclado, el ratón o el joystick. Se
      // mira la INTENCIÓN y no si se ha movido: pegado al muro no se mueve.
      var mm = scene.mouseMovement, joy = scene._joy;
      var sube = (scene._rawMoveDy || 0) < -0.2 ||
                 (mm && mm.followCursorActive && (mm.directionY || 0) < -0.3) ||
                 (joy && joy.force > 0 && Math.sin((joy.angle || 0) * Math.PI / 180) < -0.3) ||
                 (p.body && p.body.velocity && p.body.velocity.y < -10) ||
                 (scene.previousPosition && p.y < scene.previousPosition.y - 0.3);
      st.casasIds.forEach(function (id) {
        var d = CASAS[id].puerta, t = st.carteles[id];
        var dx = p.x - d.x, dy = pies - d.y;
        var cerca = Math.abs(dx) < CERCA && dy > -30 && dy < CERCA;
        t.setVisible(cerca);
        if (cerca) t.y = d.y - 74 + Math.sin(time / 260) * 2;
        // En el umbral (centrado con la puerta, hasta donde para el muro) y
        // empujando hacia ella.
        var enUmbral = Math.abs(dx) < UMBRAL_X && dy > UMBRAL_ARRIBA && dy < UMBRAL_ABAJO;
        if (!enUmbral) { st.armada[id] = true; return; }
        if (st.armada[id] && sube) { st.armada[id] = false; entrar(scene, id); }
      });
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    // Recién salido de una casa: se aparece EN su puerta; que no vuelva a entrar.
    var n = nota();
    if (n) { Object.keys(st.armada).forEach(function (k) { st.armada[k] = false; }); olvidar(); }
  }

  function desmontar(scene) {
    var st = scene && scene.__gfCasas;
    if (!st) return;
    scene.__gfCasas = null;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    Object.keys(st.carteles).forEach(function (k) { try { st.carteles[k].destroy(); } catch (e) {} });
  }

  window.GFCasas = {
    CASAS: CASAS,
    montar: montar,
    desmontar: desmontar,
    entrar: entrar,
    nota: nota,
    olvidar: olvidar
  };
})();
