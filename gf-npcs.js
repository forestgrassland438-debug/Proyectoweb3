/* ===========================================================================
 * LOS NPC DE LOS MAPAS Y DE LAS CASAS                             (2026-10-19)
 *
 * "Haz NPC en los otros mapas: en el desierto NPC con espadas, en el
 * cementerio cavando, en el de hielo y en el salvaje; y en las casas no hay
 * nadie: pon NPC y ponle nombres en inglés."
 *
 * QUÉ HACE
 *   Pone en cada escena sus NPC (la tabla de abajo): con su nombre encima,
 *   su sombra, y lo suyo:
 *     · 'accion'  repite su oficio (el sepulturero cava, los guardias del
 *                 desierto entrenan con la cimitarra) y descansa a ratos;
 *     · 'pasear'  da vueltas alrededor de su sitio, sin meterse en paredes
 *                 ni en el agua, y se para a mirarte si te acercas;
 *     · 'quieto'  se queda en su sitio y se gira hacia ti si te acercas.
 *   Al hacerle clic dice una frase (un bocadillo encima de la cabeza).
 *
 * EL ARTE: tools/generar-npcs.py (Game/Sprites/npcs/<arte>.png + .json):
 *   los cuerpos de los personajes del juego, recoloreados y con el relieve
 *   2.5D horneado, a escala 2 como el jugador.
 *
 * SON DE CADA NAVEGADOR: no van por la red (son decorado con vida). No
 *   chocan con el jugador: así nunca te dejan encerrado en una casa.
 *
 * CÓMO SE ENGANCHA
 *   SalvajeScene / ZonasScenes / InteriorScene .create():
 *     window.GFNpcs && window.GFNpcs.montar(this);
 *   La escena dice quién va por su clave (y en las casas, por la casa).
 * ======================================================================== */
(function () {
  'use strict';

  var V = '20261024a';   // (2026-10-24) el delantal también de lado y de espaldas (antes 20261021a: ojos por papel)
  var RUTA = './Game/Sprites/npcs/';
  var ESCALA = 2;
  var CERCA = 110;            // a esta distancia se gira a mirarte
  var VEL = 46;               // px/s paseando
  var LEJOS_TIENDA = 320;     // (2026-10-21) más lejos que esto, su tienda abierta se cierra

  // ── QUIÉN VA EN CADA MAPA (x, y: los pies; se busca el hueco libre más cercano) ──
  var MAPAS = {
    SalvajeScene: [
      { id: 'elowen', arte: 'guardabosques', nombre: 'Ranger Elowen', x: 2560, y: 2290, accion: 'pasear', radio: 170,
        frases: ['West of the river, swords are drawn. Walk there only if you are ready.',
                 'The old hunter keeps a lodge up north, past the meadow.',
                 'Torches keep the night beasts away. Mostly.',
                 'I have seen wolves the size of ponies near the ancient trees.'] }
    ],
    CementerioScene: [
      { id: 'mortimer', arte: 'sepulturero', nombre: 'Mortimer the Gravedigger', x: 4296, y: 1374, accion: 'accion', mira: 'derecha',
        frases: ['Another one for the ground... Mind your step, traveller.',
                 'The skeletons? They never stay buried. I keep digging anyway.',
                 'The Necromancer hides by the old crypt. Do not wake him.',
                 'Six feet deep, no more, no less. That is the rule.'] }
    ],
    DesiertoScene: [
      { id: 'rashid', arte: 'guardia_desierto', nombre: 'Captain Rashid', x: 3524, y: 1196, accion: 'accion', mira: 'derecha',
        frases: ['Keep your guard up! The sand hides scorpions.',
                 'South of the dunes the law ends. Only the blade speaks there.',
                 'When the sandstorm comes, stay away from the whirlwinds.'] },
      { id: 'amira', arte: 'centinela_desierto', nombre: 'Sentinel Amira', x: 3612, y: 1196, accion: 'accion', mira: 'izquierda',
        nombreDy: -12,   // dos nombres tan juntos se pisaban: uno, más arriba
        frases: ['Faster, Captain! My grandmother swings harder than that.',
                 'The mummies guard the old ruins. Their curse slows you down.',
                 'Water is worth more than gold out here.'] }
    ],
    // (2026-10-25) Los de nivel 8, 9 y 10.
    GlaciarScene: [
      { id: 'astrid', arte: 'guia_glaciar', nombre: 'Astrid the Glacier Guide', x: 3780, y: 4300, accion: 'pasear', radio: 150,
        frases: ['The crevasses never forgive a careless step.',
                 'When the blizzard comes, find the fire and wait it out.',
                 'They say a king of ice sleeps in the northern ruins.'] }
    ],
    CavernaScene: [
      { id: 'dorin', arte: 'minero', nombre: 'Dorin the Old Miner', x: 1000, y: 1520, accion: 'pasear', radio: 130,
        frases: ['These tunnels were dug by my grandfather\'s grandfather.',
                 'Keep to the braziers. The dark has teeth down here.',
                 'The crystals hum at night. I swear they do.'] },
      { id: 'mira', arte: 'exploradora', nombre: 'Mira the Cave Explorer', x: 3900, y: 2380, accion: 'quieto', mira: 'abajo',
        frases: ['The stairs behind me lead back to the cemetery.',
                 'Bats the size of wagons live in the western hollows.',
                 'Fish in the Sunless Lake are pale but tasty.'] }
    ],
    PraderaScene: [
      { id: 'lily', arte: 'florista', nombre: 'Lily the Florist', x: 3340, y: 2700, accion: 'pasear', radio: 160,
        frases: ['Tulips, hydrangeas, lavender... the meadow is my shop!',
                 'Mind the boars. They hate when you step on the flowers.',
                 'The Elder Stones glow when the moon is up.'] },
      { id: 'tom', arte: 'pastor', nombre: 'Tom the Shepherd', x: 3920, y: 3700, accion: 'pasear', radio: 180,
        frases: ['The windmill grinds wheat all summer long.',
                 'Something old walks among the stones to the north.',
                 'Rest on the bench, friend. The meadow is kind.'] }
    ],
    TundraScene: [
      { id: 'bjorn', arte: 'trampero', nombre: 'Bjorn the Trapper', x: 3488, y: 3902, accion: 'quieto', mira: 'derecha',
        frases: ['Come, warm your hands by the fire.',
                 'North of here the wolves hunt in packs. Bring a good sword.',
                 'The Blizzard Witch freezes the air itself. Keep moving.'] },
      { id: 'sigrid', arte: 'pescadora_hielo', nombre: 'Sigrid the Ice Fisher', x: 3320, y: 3990, accion: 'pasear', radio: 140,
        frases: ['The fish under the ice are fat and slow this season.',
                 'Never walk on the blue ice. It cracks.',
                 'Bjorn tells the same stories every night. I love them anyway.'] }
    ]
  };

  // ── QUIÉN VIVE EN CADA CASA (gf-casas.js; el punto, relativo a la aparición) ──
  var CASAS = {
    casa_npc1:     { arte: 'panadera', nombre: 'Martha the Baker', dx: 190, dy: -190,
                     frases: ['Fresh bread every morning! Well... almost every morning.', 'Wipe your boots, dear, I just swept.'] },
    casa_npc2:     { arte: 'tallista', nombre: 'Elias the Woodcarver', dx: -200, dy: -180,
                     frases: ['Pine is soft, oak is honest. I carve both.', 'Bring me good logs and I will make you something fine.'] },
    // (2026-10-20) Rosalind vende los tickets del VIP (gf-vip.js): al hablarle, su tienda.
    casa_L:        { arte: 'tejedora', nombre: 'Rosalind the Weaver', dx: 180, dy: -200, tienda: 'vip',
                     frases: ['Every thread tells a story.', 'Looking for VIP, dear? I weave the finest tickets in town.',
                              'Wool from the farm, dye from the herbalist. That is my secret.'] },
    casa_comida:   { arte: 'posadero', nombre: 'Tobias the Innkeeper', dx: 220, dy: -200,
                     frases: ['Welcome to the Inn! Rooms are warm and the stew is hot.', 'Travellers from the desert pay in strange coins.'] },
    casa_comida2:  { arte: 'tabernero', nombre: 'Bram the Barkeep', dx: -220, dy: -200,
                     frases: ['What will it be? Cider or more cider?', 'Heard the cemetery is crawling with skeletons again.'] },
    casa_posiones: { arte: 'herbolaria', nombre: 'Greta the Herbalist', dx: 200, dy: -180,
                     frases: ['Herbs heal what swords break.', 'The alchemist outside sells the strong stuff. I grow the leaves.'] },
    casa_herreria: { arte: 'herrero', nombre: 'Gareth the Blacksmith', dx: -230, dy: -170,
                     frases: ['Iron, coal and patience. That is all a blade needs.', 'Smelt your ore in the furnace and bring me the ingots.'] },
    cabana:        { arte: 'granjero', nombre: 'Old Farmer Wendell', dx: 170, dy: -170,
                     frases: ['Water your crops and keep the crows away.', 'Back in my day carrots grew as long as my arm.'] },
    cabana_monte:  { arte: 'cazador', nombre: 'Old Hunter Brannoc', dx: 170, dy: -170,
                     frases: ['Welcome to my lodge. Mind the fire.', 'I have hunted these woods for forty winters.',
                              'The wolves have grown bold lately. Something drives them.'] }
  };

  function lista(scene) {
    var clave = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    if (clave === 'InteriorScene') {
      var c = Object.prototype.hasOwnProperty.call(CASAS, scene._casaId) ? CASAS[scene._casaId] : null;
      if (!c) return [];
      var ap = scene._puntoAparicion || { x: (scene.map ? scene.map.widthInPixels / 2 : 600), y: (scene.map ? scene.map.heightInPixels * 0.78 : 640) };
      return [{ id: scene._casaId, arte: c.arte, nombre: c.nombre, x: ap.x + c.dx, y: ap.y + c.dy,
                accion: 'pasear', radio: 90, frases: c.frases, tienda: c.tienda || null }];
    }
    return Object.prototype.hasOwnProperty.call(MAPAS, clave) ? MAPAS[clave] : [];
  }

  // ─────────────────────────────────────────────────────── UTILIDADES
  function libre(scene, x, y) {
    if (!scene.map) return true;
    if (x < 30 || y < 60 || x > scene.map.widthInPixels - 30 || y > scene.map.heightInPixels - 10) return false;
    if (typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(x - 15, y - 26, 30, 26)) return false;
    try { if (window.GFAgua && window.GFAgua.claseEn && window.GFAgua.claseEn(scene, x, y) > 0) return false; } catch (e) {}
    if (scene._salida && x > scene._salida.x - 60 && x < scene._salida.right + 60 && y > scene._salida.y - 90) return false;
    return true;
  }
  /** El hueco libre más cercano a (x, y), en espiral (hasta 260 px). */
  function hueco(scene, x, y) {
    if (libre(scene, x, y)) return { x: x, y: y };
    for (var r = 12; r <= 260; r += 12) {
      for (var k = 0; k < 20; k++) {
        var a = (k / 20) * Math.PI * 2;
        var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8;
        if (libre(scene, px, py)) return { x: px, y: py };
      }
    }
    return { x: x, y: y };
  }
  function texturaSombra(scene) {
    if (scene.textures.exists('gfn_sombra')) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(24, 9, 46, 16);
    g.generateTexture('gfn_sombra', 48, 18);
    g.destroy();
  }
  function animaciones(scene, arte) {
    var tex = 'gfn_' + arte, a = scene.anims;
    if (!scene.textures.exists(tex)) return false;
    var t = scene.textures.get(tex);
    ['abajo', 'arriba', 'derecha', 'izquierda'].forEach(function (d) {
      var k = tex + '_' + d;
      if (a.exists(k)) return;
      var fr = [];
      for (var i = 1; i <= 7; i++) if (t.has(d + '_' + i)) fr.push({ key: tex, frame: d + '_' + i });
      if (fr.length) a.create({ key: k, frames: fr, frameRate: 8, repeat: -1 });
    });
    if (t.has('accion_1') && !a.exists(tex + '_accion')) {
      var fa = [];
      for (var j = 1; j <= 4; j++) if (t.has('accion_' + j)) fa.push({ key: tex, frame: 'accion_' + j });
      if (fa.length) a.create({ key: tex + '_accion', frames: fa, frameRate: 6, repeat: -1 });
    }
    return true;
  }

  // ─────────────────────────────────────────────────────── UN NPC
  function propio(st, o) { st.objetos.push(o); if (o.once) o.once('destroy', function () { var i = st.objetos.indexOf(o); if (i >= 0) st.objetos.splice(i, 1); }); return o; }
  function crear(st, d) {
    var scene = st.scene, tex = 'gfn_' + d.arte;
    if (!scene.textures.exists(tex)) return null;
    var p = hueco(scene, d.x, d.y);
    var spr = propio(st, scene.add.sprite(p.x, p.y, tex, (d.mira || 'abajo') + '_1')).setOrigin(0.5, 1).setScale(ESCALA);
    var sombra = propio(st, scene.add.image(p.x, p.y - 2, 'gfn_sombra')).setDepth(2.5);
    var nombre = propio(st, scene.add.text(p.x, p.y - 112, d.nombre, {
      fontFamily: '"PressStart2P", monospace', fontSize: '7px', color: '#ffe08a', resolution: 4,
      stroke: '#1a1208', strokeThickness: 3
    })).setOrigin(0.5, 1);
    var n = { d: d, spr: spr, sombra: sombra, nombre: nombre, casa: { x: p.x, y: p.y }, x: p.x, y: p.y,
              mira: d.mira || 'abajo', destino: null, esperaHasta: scene.time.now + 800 + Math.random() * 2000,
              descansoEn: scene.time.now + 5000 + Math.random() * 4000, descansando: false, bocadillo: null };
    spr.setInteractive({ useHandCursor: true });
    spr.on('pointerdown', function (ptr, lx, ly, ev) {
      /* (2026-10-21) "Le doy a la X del panel VIP y lo que hace es
         actualizarse." Phaser también procesa los clics hechos FUERA del
         lienzo (onMouseDownWindow) y se los da al objeto que haya debajo: la X
         cae encima de Rosalind, así que cerrar el panel lo volvía a abrir.
         Solo cuenta el clic que empieza en el propio juego. */
      if (ptr && ptr.downElement && scene.sys && scene.sys.canvas && ptr.downElement !== scene.sys.canvas) return;
      if (ev && ev.stopPropagation) ev.stopPropagation();
      hablar(st, n);
      // (2026-10-20) Los que venden algo abren su tienda.
      if (d.tienda === 'vip' && window.GFVip) {
        var pj = scene.player;
        n.tiendaDist = pj ? Math.hypot(pj.x - n.x, pj.y + 45 - n.y) : 0;
        window.GFVip.abrirTienda(scene);
      }
    });
    if (d.accion === 'accion' && scene.anims.exists(tex + '_accion')) {
      spr.play(tex + '_accion');
      spr.setFlipX(n.mira === 'izquierda');
    }
    colocar(n);
    return n;
  }

  function colocar(n) {
    n.spr.setPosition(n.x, n.y).setDepth(n.y);
    n.sombra.setPosition(n.x, n.y - 2);
    n.nombre.setPosition(n.x, n.y - 112 + (n.d.nombreDy || 0)).setDepth(n.y + 1);
    if (n.bocadillo) n.bocadillo.setPosition(n.x, n.y - 124);
  }

  function hablar(st, n) {
    var scene = st.scene, fr = n.d.frases || [];
    if (!fr.length) return;
    if (n.reloj) { n.reloj.remove(false); n.reloj = null; }
    n.frase = ((n.frase === undefined ? Math.floor(Math.random() * fr.length) : n.frase + 1)) % fr.length;
    if (n.bocadillo) { try { n.bocadillo.destroy(); } catch (e) {} }
    var texto = propio(st, scene.add.text(0, 0, fr[n.frase], {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#2a2016', resolution: 3,
      wordWrap: { width: 210 }, align: 'center'
    })).setOrigin(0.5, 1);
    var w = texto.width + 18, h = texto.height + 12;
    var fondo = propio(st, scene.add.graphics());
    fondo.fillStyle(0xfffaf0, 0.96);
    fondo.lineStyle(2, 0x5a4630, 1);
    fondo.fillRoundedRect(-w / 2, -h - 6, w, h, 8);
    fondo.strokeRoundedRect(-w / 2, -h - 6, w, h, 8);
    fondo.fillTriangle(-6, -7, 6, -7, 0, 2);
    texto.setPosition(0, -12);
    n.bocadillo = propio(st, scene.add.container(n.x, n.y - 124, [fondo, texto])).setDepth(9400);
    // Se gira a mirarte y deja lo que hacía un momento.
    var p = scene.player;
    if (p) mirarA(n, p.x, p.y + 45);
    n.esperaHasta = scene.time.now + 3500;
    n.destino = null;
    var b = n.bocadillo;
    n.reloj = scene.time.delayedCall(4500, function () { n.reloj = null; if (st.vivo && n.bocadillo === b) { try { b.destroy(); } catch (e) {} n.bocadillo = null; } });
  }

  function mirarA(n, x, y) {
    var dx = x - n.x, dy = y - n.y;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'izquierda' : 'derecha') : (dy < 0 ? 'arriba' : 'abajo');
    if (n.d.accion === 'accion') {
      // El que tiene oficio no se gira entero: solo deja de trabajar un poco.
      n.descansando = true;
      n.descansoHasta = n.spr.scene.time.now + 3500;
      return;
    }
    n.mira = dir;
    n.spr.anims.stop();
    n.spr.setFrame(dir + '_1');
  }

  function tic(st, t, dt) {
    var scene = st.scene, p = scene.player;
    var pie = p ? { x: p.x, y: p.y + 45 } : null;
    st.npcs.forEach(function (n) {
      if (!n.spr.scene) return;
      var tex = 'gfn_' + n.d.arte;
      var cerca = pie && Math.hypot(pie.x - n.x, pie.y - n.y) < CERCA;
      if (n.d.accion === 'accion') {
        // Trabaja; cada pocos segundos descansa un momento (o si le hablas).
        if (!n.descansando && t > n.descansoEn) { n.descansando = true; n.descansoHasta = t + 1600 + Math.random() * 1400; }
        if (n.descansando) {
          if (n.spr.anims.isPlaying) { n.spr.anims.stop(); n.spr.setFrame('accion_1'); }
          if (t > n.descansoHasta) {
            n.descansando = false;
            n.descansoEn = t + 5000 + Math.random() * 5000;
            if (scene.anims.exists(tex + '_accion')) n.spr.play(tex + '_accion');
          }
        }
        return;
      }
      // (2026-10-21) "Si Rosalind sabe que ando comprando VIP no se debería
      // mover: si se va lejos el panel no se cierra." Con su tienda abierta se
      // queda quieta mirándote; y si TÚ te alejas mucho, la tienda se cierra.
      if (n.d.tienda === 'vip' && window.GFVip && window.GFVip.tiendaAbierta && window.GFVip.tiendaAbierta()) {
        var lejos = pie ? Math.hypot(pie.x - n.x, pie.y - n.y) : 0;
        if (lejos > Math.max(LEJOS_TIENDA, (n.tiendaDist || 0) + 160)) {
          if (window.GFVip.cerrarTienda) window.GFVip.cerrarTienda();
        } else {
          if (n.destino) { n.destino = null; n.spr.anims.stop(); n.spr.setFrame(n.mira + '_1'); }
          if (pie) mirarA(n, pie.x, pie.y);
          n.esperaHasta = t + 1500;
          return;
        }
      }
      if (cerca) {
        if (n.destino) { n.destino = null; n.spr.anims.stop(); }
        mirarA(n, pie.x, pie.y);
        n.esperaHasta = t + 1200;
        return;
      }
      if (n.d.accion !== 'pasear') return;
      if (!n.destino) {
        if (t < n.esperaHasta) return;
        // Un sitio libre cerca de su casa.
        for (var i = 0; i < 8; i++) {
          var a = Math.random() * Math.PI * 2, r = (n.d.radio || 120) * (0.3 + Math.random() * 0.7);
          var x = n.casa.x + Math.cos(a) * r, y = n.casa.y + Math.sin(a) * r * 0.7;
          if (libre(scene, x, y)) { n.destino = { x: x, y: y }; break; }
        }
        if (!n.destino) { n.esperaHasta = t + 1500; return; }
      }
      var dx = n.destino.x - n.x, dy = n.destino.y - n.y, L = Math.hypot(dx, dy);
      if (L < 4) {
        n.destino = null;
        n.spr.anims.stop();
        n.spr.setFrame(n.mira + '_1');
        n.esperaHasta = t + 1500 + Math.random() * 3500;
        return;
      }
      var paso = Math.min(L, VEL * dt);
      var nx = n.x + dx / L * paso, ny = n.y + dy / L * paso;
      if (!libre(scene, nx, ny)) { n.destino = null; n.esperaHasta = t + 800; n.spr.anims.stop(); return; }
      n.x = nx; n.y = ny;
      var dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'izquierda' : 'derecha') : (dy < 0 ? 'arriba' : 'abajo');
      if (dir !== n.mira || !n.spr.anims.isPlaying) {
        n.mira = dir;
        if (scene.anims.exists(tex + '_' + dir)) n.spr.play(tex + '_' + dir, true);
      }
      colocar(n);
    });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfNpcs) return null;
    var datos = lista(scene);
    if (!datos.length) return null;
    var st = { scene: scene, npcs: [], objetos: [], vivo: true };
    scene.__gfNpcs = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar); scene.events.once('destroy', st.onApagar);
    try { texturaSombra(scene); } catch (e) { desmontar(scene); console.warn('[npcs]', e); return null; }
    var faltan = [];
    datos.forEach(function (d) {
      var tex = 'gfn_' + d.arte;
      if (!scene.textures.exists(tex) && faltan.indexOf(d.arte) < 0) faltan.push(d.arte);
    });
    var nacer = function () {
      scene.load.off('complete', nacer); clearTimeout(st.limite);
      if (!st.vivo) return;
      try { datos.forEach(function (d) {
        if (!animaciones(scene, d.arte)) return;
        var n = crear(st, d);
        if (n) st.npcs.push(n);
      }); } catch (e) { desmontar(scene); console.warn('[npcs]', e); return; }
      console.log('🧑 NPC:', st.npcs.map(function (n) { return n.d.nombre; }).join(', '));
    };
    try { if (faltan.length) {
      faltan.forEach(function (a) { scene.load.atlas('gfn_' + a, RUTA + a + '.png?v=' + V, RUTA + a + '.json?v=' + V); });
      scene.load.once('complete', nacer);
      st.alCargar = nacer; st.limite = setTimeout(nacer, 15000);
      scene.load.start();
    } else nacer(); } catch (e) { desmontar(scene); console.warn('[npcs]', e); return null; }
    if (!st.vivo) return null;
    st.onUpdate = function (t, delta) { if (st.vivo) tic(st, t, Math.min(0.1, (delta || 16) / 1000)); };
    scene.events.on('update', st.onUpdate);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfNpcs;
    if (!st) return;
    st.vivo = false;
    scene.__gfNpcs = null;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (st.alCargar) scene.load.off('complete', st.alCargar);
    clearTimeout(st.limite);
    st.npcs.forEach(function (n) {
      if (n.reloj) n.reloj.remove(false);
      [n.spr, n.sombra, n.nombre, n.bocadillo].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.objetos.slice().forEach(function (o) { try { if (o && o.scene) { scene.tweens.killTweensOf(o); o.destroy(); } } catch (e) {} });
    st.objetos.length = 0;
    st.npcs.length = 0;
  }

  window.GFNpcs = { montar: montar, desmontar: desmontar, MAPAS: MAPAS, CASAS: CASAS,
                    _interno: { libre: libre, hueco: hueco, estado: function (s) { return s && s.__gfNpcs; } } };
})();
