/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * DENTRO DE LAS CASAS — Scenes/InteriorScene.js                    (2026-10-05)
 *
 * QUE ES ESTO
 * ---------------------------------------------------------------------------
 * La escena de dentro de las casas del pueblo. A cuál se entra lo decide
 * gf-casas.js (la tabla de casas y sus puertas) y se llega por la pantalla de
 * carga con `mundo = 5`, igual que a la mina (`mundo = 3`).
 *
 * HEREDA DE GameScene, IGUAL QUE LA MINA Y LA ISLA: asi tiene el HUD entero
 * (inventario, casillas, barras, monedas, chat, amigos, mascota...) sin
 * copiar ni una linea. Lo propio de aqui es el mapa, los muebles y sus luces.
 *
 * LAS SALAS (tools/generar-interiores.py)
 * ---------------------------------------------------------------------------
 *   Maps/interiores/<sala>.json   rejilla de 32 px con tiles de 64 (AL DOBLE,
 *                                 2026-10-05: las casas eran pequenas para el
 *                                 jugador; la propiedad `escala` del mapa lo
 *                                 dice) + capas de objetos:
 *       muebles      objetos-tile: cada uno es Game/MAPAS/Interiores/muebles/<nombre>.png
 *                    con sus propiedades (plano, pie, anim, fx, fy)
 *       colisiones   rectangulos que frenan (paredes y la huella de cada mueble)
 *       salida       la puerta: pisarla saca al pueblo
 *       aparicion    donde se aparece al entrar
 *       luces        ventanas (rectangulo) y fuegos/velas (punto + radio)
 *   recortadas_int_<sala>/        el suelo y las paredes YA PINTADOS con su luz:
 *                                 eso es lo que se ve (gf-suelo.js). La capa de
 *                                 casillas queda debajo de respaldo.
 *
 * EL 2.5D: cada mueble que se levanta del suelo es un sprite con `depth` = la
 * Y de su pie, como el jugador; asi se pasa por detras de la estanteria y por
 * delante de la mesa. Lo plano (alfombras, cuadros) va pegado al suelo.
 *
 * LAS ANIMACIONES, todas dibujadas por lienzo (sin PNG nuevos):
 *   fuego     llamas en la boca de la chimenea, con su luz que tiembla
 *   fragua    el carbon al rojo que respira, y chispas que suben
 *   caldero   el fuego de debajo (dos fotogramas de newpro) y burbujas y vaho
 *   brasero   dos fotogramas de newpro, y su luz
 *   farol     dos fotogramas de newpro, y su luz
 *   vela      una luz pequena que parpadea
 *   yunque    de vez en cuando, un chispazo
 *   ventana   el haz de luz respira, y flotan motas de polvo dentro
 * ============================================================================
 */

/* global GameScene, Phaser */

const INTERIOR_V = '20261006a';

/* Los PNG de muebles que puede pedir cualquier sala. Se cargan todos (son
   pequenos: el mayor, la estanteria de pociones, mide 126x141) para no tener
   que leer el mapa antes de cargar. */
const MUEBLES_INTERIOR = [
  'alfombra_azul', 'alfombra_morada', 'alfombra_pasillo', 'alfombra_roja', 'alfombra_verde', 'aplique', 'armario', 'armero', 'barra', 'barra2',
  'barril', 'barril_abierto', 'brasero_1', 'brasero_2', 'cajon', 'caldero', 'caldero_fuego_1', 'caldero_fuego_2',
  'cama_azul', 'cama_roja', 'cama_verde', 'carbon', 'cesta', 'chimenea', 'cofre', 'cristales', 'cuadro_bosque',
  'cuadro_dia', 'cuadro_noche', 'cubo', 'escalera', 'escoba', 'estante_frascos', 'estante_herramientas',
  'estante_herramientas2', 'estante_libros', 'estante_libros2', 'estante_pociones', 'expositor_fruta',
  'expositor_pociones', 'expositor_verdura', 'farol_1', 'farol_2', 'farol_pared', 'fragua', 'mesa_comida',
  'mesa_espada', 'mesa_larga', 'mesa_vela', 'mostrador', 'nasas', 'pila_lena', 'planta_alta', 'planta_cactus',
  'planta_flores', 'planta_pequena', 'red_pesca', 'silla', 'silla_b', 'taburete', 'taburete_bar', 'yunque'
];

// eslint-disable-next-line no-unused-vars
class InteriorScene extends GameScene {

  constructor() {
    // La clave por el constructor: ver MinaScene.
    super({ key: 'InteriorScene' });
    this.esInterior = true;
    /* 1x y 2x, y se entra a 1x: el jugador y la mascota con el MISMO tamano
       que en el pueblo y en la tienda. Si la sala es mas pequena que la
       pantalla, se centra (ver `_ajustarCamara`). */
    this._nivelesDeZoom = [1.0, 2.0];
    this._animados = [];
    this._muebles = [];
    this._luzObjs = [];
  }

  init(datos) {
    this.__sesionRecibida = (datos && datos.sesion) || null;
  }

  // =========================================================================
  // PRELOAD
  // =========================================================================
  preload() {
    if (window.GFSoulbound) {
      window.GFSoulbound.precargar(this);
    } else {
      const base = './Game/Sprites/Soulbound/personaje1';
      this.load.image('imagen_Perfil', base + '/Perfil/Perfil.png');
      this.load.image('player', base + '/derecha/run_1.png');
      [['derecha', 'player_right'], ['izquierda', 'player_left'],
       ['arriba', 'player_up'], ['abajo', 'player_down']].forEach(([carpeta, pref]) => {
        for (let i = 1; i <= 7; i++) this.load.image(pref + '_' + i, base + '/' + carpeta + '/run_' + i + '.png');
      });
    }
    for (let i = 1; i <= 4; i++) {
      this.load.image('perro_derecha_' + i, './Game/Sprites/mascota/derecha/run_' + i + '.png');
      this.load.image('perro_izquierda_' + i, './Game/Sprites/mascota/izquierda/run_' + i + '.png');
    }

    const nota = window.GFCasas ? window.GFCasas.nota() : null;
    this._casaId = nota ? nota.id : null;
    this._casa = this._casaId && window.GFCasas ? window.GFCasas.CASAS[this._casaId] : null;
    this._sala = this._casa ? this._casa.sala : 'hogar';
    const v = '?v=' + INTERIOR_V;
    // Clave propia por sala: la cache de tilemaps es compartida entre escenas.
    this._claveMapa = 'tilemap_int_' + this._sala;
    this.load.tilemapTiledJSON(this._claveMapa, './Maps/interiores/' + this._sala + '.json' + v);
    this.load.image('int_tiles', './Game/MAPAS/Interiores/interiores_64.png' + v);
    MUEBLES_INTERIOR.forEach((n) => {
      if (!this.textures.exists('int_' + n)) this.load.image('int_' + n, './Game/MAPAS/Interiores/muebles/' + n + '.png' + v);
    });
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'tienda' });
  }

  // =========================================================================
  // CREATE
  // =========================================================================
  async create() {
    const sceneRunId = this._sceneRunId = (this._sceneRunId || 0) + 1;
    this._sceneStopped = false;
    this._cleanupSceneDone = false;
    this._shutdownDone = false;
    this._interiorCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    this._fase = 'arranque';
    this._rescatando = false;
    try {
      await this._construirInterior(sceneRunId);
    } catch (e) {
      if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
      console.error('🏠 la casa se rompio en la fase "' + this._fase + '":', e);
      this._rescatar('la casa no se pudo montar (' + this._fase + ')');
      return;
    }
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!this.map || !this.player || !this.keys) {
      this._rescatar('la casa quedo a medias (' + this._fase + ')');
    }
  }

  /** Si algo falla, al pueblo delante de la puerta (o a la plaza). */
  _rescatar(motivo) {
    if (this._rescatando || this._cambiandoEscena) return;
    this._rescatando = true;
    this._cambiandoEscena = true;
    console.warn('🏠 saliendo de la casa por las malas:', motivo);
    /* El cortacircuitos, como en la mina: sin el, mundo 5 → casa → revienta
       → carga → casa... La pantalla de carga lo mira antes de mandar aqui. */
    window.__gfCasaRota = motivo || true;
    try { if (window.GFCasas) window.GFCasas.olvidar(); } catch (e) {}
    // Con casa conocida, delante de su puerta. Sin ella no se guarda nada:
    // la posicion guardada YA es la de su puerta (gf-casas la guarda al entrar).
    const p = this._casa ? this._casa.puerta : null;
    if (p) { try { this._dejarPartidaEnElMapa(p.x, p.y + 40); } catch (e) {} }
    try { this._ocultarHUD(); } catch (e) {}
    try { this.removeListener(); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
    try { this.stopMusicSafely(); } catch (e) {}
    try { this.cleanupScene(); } catch (e) {}
    this.scene.start('LoadingScenegame', { targetScene: 'GameScene', playerData: p ? { x: p.x, y: p.y + 40, mundo: 1 } : { mundo: 1 } });
  }

  async _construirInterior(sceneRunId) {
    console.log('🏠 InteriorScene.create()', this._casaId, this._sala);
    this._fase = 'sesion';
    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) sesion = await this.loadx();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) throw new Error('sin sesion: la casa no arranca');
    // Sin nota no se sabe de que casa se sale: al pueblo.
    if (!this._casa) throw new Error('sin casa a la que entrar');
    this.currentAccount = this.currentAccount || this.playerName;
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    this._fase = 'estado';
    this.mundo = 5;
    this._cambiandoEscena = false;
    this._salaDestino = null;
    this._salidaArmada = false;
    this._graphicsOcultado = false;
    this._animados = [];
    this._muebles = [];
    this._luzObjs = [];
    this.speed = 220;
    this.socket = window.globalSocket || null;

    // Reciclar el mapa de fuera (lo mismo que la mina y la isla).
    this._fase = 'reciclar GameScene';
    const ClaseMapa =
      (window.__secureSceneRegistry && window.__secureSceneRegistry.get('GameScene')) ||
      (typeof GameScene === 'function' ? GameScene : null);
    try {
      if (ClaseMapa) {
        this.scene.stop('GameScene');
        this.scene.remove('GameScene');
        this.scene.add('GameScene', ClaseMapa, false);
      } else {
        this.scene.stop('GameScene');
      }
    } catch (e) {
      console.warn('🏠 no se pudo reciclar GameScene:', e);
      try { if (ClaseMapa && !this.scene.get('GameScene')) this.scene.add('GameScene', ClaseMapa, false); } catch (e2) {}
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this._fase = 'mapa';
    this.map = this.make.tilemap({ key: this._claveMapa });
    /* La escala de la sala (2026-10-05): los muebles y el suelo vienen al
       doble; los efectos dibujados aqui (llamas, chispas, burbujas...) se
       multiplican por ella para ir a juego. */
    this._k = Number(this._propDeMapa('escala', 1)) || 1;
    const datosTs = this.map.tilesets && this.map.tilesets[0];
    const ts = datosTs
      ? this.map.addTilesetImage(datosTs.name, 'int_tiles', datosTs.tileWidth, datosTs.tileHeight)
      : null;
    if (!ts) throw new Error('sin el tileset de interiores');
    this.textures.get('int_tiles').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('suelo', ts, 0, 0);
    if (!this.backgroundLayer) throw new Error("el mapa de la sala no trae la capa 'suelo'");
    this.backgroundLayer.setDepth(0);
    // Lo que se ve: el suelo pintado con su luz (los trozos). La capa, debajo.
    if (window.GFSuelo) {
      window.GFSuelo.montar(this, { carpeta: 'recortadas_int_' + this._sala, prefijo: 'i' + this._sala.replace(/[^a-z0-9]/g, '').slice(0, 14),
                                    capas: [this.backgroundLayer] });
    }
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── Colisiones, salida y aparicion ─────────────────────────────────────
    this._fase = 'colisiones';
    this.collisionRectangles = this._rectsDe('colisiones');
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    this._salida = this._rectsDe('salida')[0] || null;
    const ap = (this.map.getObjectLayer('aparicion') || {}).objects || [];
    const inicio = ap[0] ? { x: ap[0].x, y: ap[0].y } : { x: this.map.widthInPixels / 2, y: this.map.heightInPixels - 120 };

    // ── Los muebles y sus animaciones ──────────────────────────────────────
    this._fase = 'muebles';
    this._texturasAnimadas();
    this._montarMuebles();
    this._montarLuces();

    // ── El jugador ─────────────────────────────────────────────────────────
    this._fase = 'jugador';
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;
    this._anclaPropia = { x: inicio.x, y: inicio.y };
    this.player = this.physics.add.sprite(inicio.x, inicio.y, 'player_up_1');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(inicio.y);
    this.lastDirection = 'up';
    this.shadow = this.add.graphics();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, 0, 42, 20);
    this.shadow.setDepth(2);
    this.shadowContainer = this.add.container(this.player.x, this.player.y + 45, [this.shadow]);
    this.player.setInteractive({ useHandCursor: true });
    this.player.on('pointerdown', (pointer) => {
      const canvas = this.sys.canvas;
      if (!(pointer.event.target === canvas || canvas.contains(pointer.event.target))) return;
      if (this.STATE && this.STATE.selectedItem) {
        this._consumeItemOnPlayer(String(this.STATE.selectedItem.id || '').toLowerCase());
      }
    });
    this.usuariox = this.add.text(this.player.x, this.player.y - 60, this.Username || '', {
      fontFamily: '"PressStart2P"', fontSize: '8px', color: '#ffffff',
      resolution: 4, stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(4);
    this.graphics = this.add.graphics();
    this.graphics.setVisible(false);

    this._crearAnimaciones();
    this._crearMascota();
    this._montarControles();

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#0a080c');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    // Se entra a 1x (indice 0 de [1, 2]), como en el pueblo y en la tienda.
    this.currentZoomIndex = 0;
    this._montarZoom();
    this._camaraHecha = null;
    this._ajustarCamara();
    const entrada = this._entradaDeCamara(sceneRunId);
    this._cartelDeSala();

    // ── Sistemas y HUD ─────────────────────────────────────────────────────
    this._fase = 'sistemas';
    try { this._setupChatDom(); } catch (e) { console.warn('chat:', e); }
    entrada.then((ok) => { if (ok) this._mostrarHUD(); });
    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    await entrada;
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    this._mostrarHUD();

    this._fase = 'modulos';
    const suelo = this._sala === 'herreria' ? 'tierra' : 'madera';
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo });
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'tienda', suelo, interior: true });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);
    if (window.GFEspada)      window.GFEspada.montar(this);
    if (window.GFPost)        window.GFPost.montar(this, { interior: true });
    if (window.tiendaSistema) window.tiendaSistema.scene = this;
    this._fase = 'lista';
    console.log('🏠 casa lista:', this._casaId);
  }

  _rectsDe(nombre) {
    const capa = this.map.getObjectLayer(nombre);
    if (!capa || !Array.isArray(capa.objects)) return [];
    return capa.objects.map(o => new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height));
  }

  /** Una propiedad del MAPA (Phaser la deja como lista o como objeto). */
  _propDeMapa(nombre, def) {
    const p = this.map && this.map.properties;
    if (Array.isArray(p)) { const x = p.find(q => q && q.name === nombre); return x ? x.value : def; }
    if (p && typeof p === 'object' && nombre in p) return p[nombre];
    return def;
  }

  _prop(o, nombre, def) {
    const p = (o.properties || []).find(x => x.name === nombre);
    return p ? p.value : def;
  }

  // =========================================================================
  // MUEBLES
  // =========================================================================
  _montarMuebles() {
    const capa = this.map.getObjectLayer('muebles');
    if (!capa) return;
    capa.objects.forEach((o) => {
      const k = 'int_' + o.name;
      if (!this.textures.exists(k)) return;
      const plano = this._prop(o, 'plano', false);
      const s = this.add.image(o.x, o.y, k).setOrigin(0, 1);
      // Lo plano pegado al suelo (o a la pared); lo demas, por la Y de su pie.
      s.setDepth(plano ? 1 : o.y);
      this._muebles.push(s);
      const anim = this._prop(o, 'anim', null);
      if (!anim) return;
      const fx = o.x + this._prop(o, 'fx', o.width / 2);
      const fy = o.y - o.height + this._prop(o, 'fy', o.height / 3);
      this._animar(anim, s, fx, fy, o);
    });
  }

  /** Las texturas de las animaciones: por lienzo, una vez. */
  _texturasAnimadas() {
    const lienzo = (clave, w, h, pintar) => {
      if (this.textures.exists(clave)) return;
      const ct = this.textures.createCanvas(clave, w, h);
      pintar(ct.getContext(), w, h);
      ct.refresh();
    };
    // Tres llamas distintas: se alternan y se deforman para que no se repita.
    for (let f = 0; f < 3; f++) {
      lienzo('int_llama_' + f, 20, 26, (x, w, h) => {
        const capas = [['#ff5a1a', 1.0], ['#ffb02e', 0.72], ['#fff3b0', 0.4]];
        capas.forEach(([color, k]) => {
          x.fillStyle = color;
          x.beginPath();
          const cx = w / 2 + (f - 1) * 1.5, base = h - 1;
          x.moveTo(cx - 8 * k, base);
          x.quadraticCurveTo(cx - 9 * k, base - 12 * k, cx + (f - 1) * 2, base - (h - 3) * k);
          x.quadraticCurveTo(cx + 9 * k, base - 12 * k, cx + 8 * k, base);
          x.closePath();
          x.fill();
        });
      });
    }
    lienzo('int_luz', 128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
    lienzo('int_chispa', 4, 4, (x) => { x.fillStyle = '#ffe9a8'; x.fillRect(1, 0, 2, 4); x.fillRect(0, 1, 4, 2); });
    lienzo('int_mota', 2, 2, (x) => { x.fillStyle = 'rgba(255,248,220,1)'; x.fillRect(0, 0, 2, 2); });
    lienzo('int_burbuja', 6, 6, (x) => {
      x.strokeStyle = 'rgba(190,255,170,0.95)'; x.lineWidth = 1;
      x.beginPath(); x.arc(3, 3, 2.2, 0, Math.PI * 2); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(2, 1, 1, 1);
    });
    lienzo('int_vaho', 24, 24, (x) => {
      const g = x.createRadialGradient(12, 12, 1, 12, 12, 12);
      g.addColorStop(0, 'rgba(220,255,210,0.55)'); g.addColorStop(1, 'rgba(220,255,210,0)');
      x.fillStyle = g; x.fillRect(0, 0, 24, 24);
    });
    lienzo('int_haz', 64, 64, (x) => {
      const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  }

  _animar(tipo, spr, fx, fy, o) {
    const ADD = Phaser.BlendModes.ADD;
    const k = this._k || 1;
    if (tipo === 'fuego' || tipo === 'fragua') {
      const n = tipo === 'fragua' ? 3 : 4;
      const llamas = [];
      for (let i = 0; i < n; i++) {
        const l = this.add.image(fx + (i - (n - 1) / 2) * 5 * k, fy + 4 * k, 'int_llama_' + (i % 3))
          .setOrigin(0.5, 1).setDepth(spr.depth + 0.1).setScale((0.55 + (i % 2) * 0.15) * k);
        if (tipo === 'fragua') l.setTint(0xff7a3a);
        llamas.push(l);
      }
      this._animados.push({ tipo, llamas, fx, fy, base: spr.depth, prox: 0, fase: Math.random() * 6 });
    } else if (tipo === 'caldero') {
      // El fuego de debajo: dos fotogramas de newpro. Cada fotograma es el
      // caldero ENTERO con sus llamas a los lados (10 px mas ancho en el
      // dibujo original), asi que se CENTRA sobre el caldero y va detras: el
      // caldero tapa su copia y solo asoman las llamas. Con un desplazamiento
      // fijo quedaba torcido hacia la derecha.
      const anchoFuego = this.textures.exists('int_caldero_fuego_1')
        ? this.textures.get('int_caldero_fuego_1').getSourceImage().width : spr.width;
      const fuego = this.add.image(spr.x - (anchoFuego - spr.width) / 2, spr.y, 'int_caldero_fuego_1')
        .setOrigin(0, 1).setDepth(spr.depth - 0.1);
      this._animados.push({ tipo, spr, fuego, fx, fy, prox: 0, foto: 0, burbujas: [] });
    } else if (tipo === 'brasero' || tipo === 'farol') {
      const claves = tipo === 'brasero' ? ['int_brasero_1', 'int_brasero_2'] : ['int_farol_1', 'int_farol_2'];
      this._animados.push({ tipo, spr, claves, foto: 0, prox: 0 });
    } else if (tipo === 'yunque') {
      this._animados.push({ tipo, fx, fy, prox: this.time.now + 2000 + Math.random() * 3000, depth: spr.depth + 1 });
    }
    void ADD; void o;
  }

  _montarLuces() {
    const capa = this.map.getObjectLayer('luces');
    if (!capa) return;
    const colores = { fuego: 0xff8a3a, fragua: 0xff6a2a, brasero: 0xff9a40, caldero: 0x8cff6a, vela: 0xffd890, farol: 0xffd070 };
    capa.objects.forEach((o) => {
      if (o.name === 'ventana') {
        // El haz: un trapecio de luz que respira, y motas de polvo dentro.
        const haz = this.add.image(o.x + o.width / 2 + 10, o.y, 'int_haz').setOrigin(0.5, 0)
          .setDisplaySize(o.width, o.height * 0.9).setDepth(2).setAlpha(0.12)
          .setBlendMode(Phaser.BlendModes.ADD);
        haz.skewX = 0;
        const motas = [];
        for (let i = 0; i < 7; i++) {
          motas.push(this.add.image(o.x + Math.random() * o.width, o.y + Math.random() * o.height * 0.8, 'int_mota')
            .setDepth(9000).setAlpha(0).setScale(this._k || 1).setBlendMode(Phaser.BlendModes.ADD));
        }
        this._luzObjs.push({ tipo: 'ventana', haz, motas, o, fase: Math.random() * 6 });
        return;
      }
      const color = colores[o.name] || 0xffd890;
      const r = this._prop(o, 'radio', 80);
      const luz = this.add.image(o.x, o.y, 'int_luz').setDisplaySize(r * 2, r * 1.5).setTint(color)
        .setAlpha(0.32).setDepth(8999).setBlendMode(Phaser.BlendModes.ADD);
      this._luzObjs.push({ tipo: o.name, luz, base: o.name === 'vela' ? 0.26 : 0.34, r, fase: Math.random() * 6 });
    });
    /* La penumbra de interior: un velo suave en MULTIPLY (las luces van
       encima). UNA IMAGEN y no un `rectangle`: las figuras de Phaser ignoran
       MULTIPLY y se pintaban como una capa gris por encima de todo (el
       jugador salia apagado y como transparente). */
    if (!this.textures.exists('int_penumbra')) {
      const ct = this.textures.createCanvas('int_penumbra', 4, 4);
      const x = ct.getContext(); x.fillStyle = '#6a6a86'; x.fillRect(0, 0, 4, 4); ct.refresh();
    }
    this._penumbra = this.add.image(0, 0, 'int_penumbra').setOrigin(0, 0)
      .setDisplaySize(this.map.widthInPixels, this.map.heightInPixels)
      .setDepth(8990).setAlpha(0.18).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  /** El nombre de la casa, que entra y se va arriba en el centro. */
  _cartelDeSala() {
    const titulo = (this._casa && this._casa.titulo) || 'House';
    const cam = this.cameras.main;
    const t = this.add.text(cam.width / 2, 70, titulo, {
      fontFamily: '"PressStart2P", monospace', fontSize: '14px', color: '#fff3d6',
      stroke: '#2a160c', strokeThickness: 6, resolution: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20000).setAlpha(0);
    this._cartel = t;
    this.tweens.add({ targets: t, alpha: 1, y: 84, duration: 700, delay: 600, ease: 'Cubic.easeOut',
      onComplete: () => this.tweens.add({ targets: t, alpha: 0, duration: 900, delay: 1800, onComplete: () => { try { t.destroy(); } catch (e) {} } }) });
  }

  _moverAnimados(time) {
    const t = time / 1000;
    const K = this._k || 1;
    for (let i = 0; i < this._animados.length; i++) {
      const a = this._animados[i];
      if (a.tipo === 'fuego' || a.tipo === 'fragua') {
        a.llamas.forEach((l, k) => {
          const v = Math.sin(t * (7 + k * 1.3) + a.fase + k) * 0.5 + Math.sin(t * (13 + k) + k * 2) * 0.5;
          l.setScale((0.6 + (k % 2) * 0.12) * (1 + v * 0.12) * K, (0.62 + (k % 2) * 0.14) * (1 + v * 0.22) * K);
          if (time > a.prox) l.setTexture('int_llama_' + Math.floor(Math.random() * 3));
        });
        if (time > a.prox) a.prox = time + 90 + Math.random() * 80;
        if (a.tipo === 'fragua' && Math.random() < 0.06) this._chispa(a.fx + (Math.random() - 0.5) * 14 * K, a.fy - 6 * K, a.base + 2, -1);
      } else if (a.tipo === 'caldero') {
        if (time > a.prox) {
          a.prox = time + 260;
          a.foto ^= 1;
          a.fuego.setTexture(a.foto ? 'int_caldero_fuego_2' : 'int_caldero_fuego_1');
          // Los dos fotogramas no miden lo mismo (37 y 38 px): siempre centrado.
          a.fuego.x = a.spr.x - (a.fuego.width - a.spr.width) / 2;
          // Burbujas que suben y revientan, y algo de vaho.
          const b = this.add.image(a.fx + (Math.random() - 0.5) * 22 * K, a.fy + 6 * K, 'int_burbuja').setDepth(a.spr.depth + 0.2).setScale(K);
          this.tweens.add({ targets: b, y: b.y - (10 + Math.random() * 8) * K, alpha: 0, scale: 1.4 * K, duration: 600 + Math.random() * 300, onComplete: () => b.destroy() });
          if (Math.random() < 0.5) {
            const v = this.add.image(a.fx + (Math.random() - 0.5) * 16 * K, a.fy, 'int_vaho').setDepth(9001).setAlpha(0.6).setScale(K).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({ targets: v, y: v.y - 40 * K, x: v.x + (Math.random() - 0.5) * 20 * K, alpha: 0, scale: 2.2 * K, duration: 1600, onComplete: () => v.destroy() });
          }
        }
      } else if (a.tipo === 'brasero' || a.tipo === 'farol') {
        if (time > a.prox) {
          a.prox = time + (a.tipo === 'brasero' ? 180 : 420);
          a.foto ^= 1;
          if (this.textures.exists(a.claves[a.foto])) a.spr.setTexture(a.claves[a.foto]);
        }
      } else if (a.tipo === 'yunque') {
        if (time > a.prox) {
          a.prox = time + 2500 + Math.random() * 4500;
          for (let k = 0; k < 6; k++) this._chispa(a.fx, a.fy, a.depth, (Math.random() - 0.5) * 2);
        }
      }
    }
    // Las luces: tiemblan las de fuego, respiran las de las ventanas.
    let oscuro = 0;
    try { oscuro = window.GFCiclo && window.GFCiclo.oscuridad ? window.GFCiclo.oscuridad() || 0 : 0; } catch (e) {}
    for (let i = 0; i < this._luzObjs.length; i++) {
      const L = this._luzObjs[i];
      if (L.tipo === 'ventana') {
        const dia = Math.max(0, 1 - oscuro * 1.4);
        L.haz.setAlpha((0.10 + 0.04 * Math.sin(t * 0.7 + L.fase)) * dia);
        L.motas.forEach((m, k) => {
          const u = (t * 0.05 + k / L.motas.length + L.fase) % 1;
          m.setPosition(L.o.x + 8 * K + ((k * 37 * K) % (L.o.width - 16 * K)) + Math.sin(t * 0.6 + k) * 6 * K + u * 20 * K, L.o.y + 8 * K + u * L.o.height * 0.75);
          m.setAlpha(Math.sin(u * Math.PI) * 0.7 * dia);
        });
      } else {
        const v = Math.sin(t * 9 + L.fase) * 0.5 + Math.sin(t * 23 + L.fase * 2) * 0.3;
        L.luz.setAlpha(L.base * (1 + 0.25 * v) * (1 + oscuro * 0.6));
      }
    }
    if (this._penumbra) this._penumbra.setAlpha(0.14 + oscuro * 0.4);
  }

  _chispa(x, y, depth, dir) {
    const K = this._k || 1;
    const c = this.add.image(x, y, 'int_chispa').setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc060).setScale(K);
    const vx = (dir * 30 + (Math.random() - 0.5) * 30) * K, alto = (18 + Math.random() * 26) * K;
    this.tweens.addCounter({ from: 0, to: 1, duration: 420 + Math.random() * 260, onUpdate: (tw) => {
      const k = tw.getValue();
      c.setPosition(x + vx * k, y - alto * 4 * k * (1 - k) - k * 10 * K);
      c.setAlpha(1 - k);
    }, onComplete: () => c.destroy() });
  }

  // =========================================================================
  // UPDATE (el de la mina: movimiento, choques, animacion, mascota)
  // =========================================================================
  update(time, delta) {
    if (this._cambiandoEscena) return;
    {
      let b = this._elBurbujaLocal;
      if (!b || !b.isConnected) b = this._elBurbujaLocal = document.getElementById('local-chat-bubble');
      const plazoVivo = this._burbujaHasta && Date.now() < this._burbujaHasta;
      if (b && (plazoVivo || b.style.display !== 'none')) this._positionLocalBubble(b);
    }
    if (!this.keys) return;
    if (!this.player || !this.player.scene) return;
    this._asegurarIndiceColisiones();
    this.previousPosition = { x: this.player.x, y: this.player.y };
    this.posicionplayerx = this.player.x;
    this.posicionplayery = this.player.y;

    if (this.mouseMovement.followCursorActive && !this.input.activePointer.isDown) this.stopMouseMovement();
    this.handleMouseMovement(delta);
    if (!this.mouseMovement.followCursorActive) {
      const bloqueado = this._chatInputFocused === true;
      let dx = 0, dy = 0;
      if (!bloqueado) {
        if (this.keys.leftArrow.isDown || this.keys.left.isDown) dx -= 1;
        if (this.keys.rightArrow.isDown || this.keys.right.isDown) dx += 1;
        if (this.keys.upArrow.isDown || this.keys.up.isDown) dy -= 1;
        if (this.keys.downArrow.isDown || this.keys.down.isDown) dy += 1;
      }
      if (this._joy && this._joy.force > 0) {
        const r = Phaser.Math.DegToRad(this._joy.angle);
        dx += Math.cos(r); dy += Math.sin(r);
      }
      const largo = Math.hypot(dx, dy);
      if (largo > 1) { dx /= largo; dy /= largo; }
      const seg = delta / 1000;
      this.player.x += dx * this.speed * seg;
      this.player.y += dy * this.speed * seg;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }
    const prevX = this.previousPosition.x, prevY = this.previousPosition.y;
    // Eje a eje, y si estaba atrapado, fuera (GameScene._resolverChoqueJugador).
    this._resolverChoqueJugador(prevX, prevY, 26);
    if (!this._accionPersonaje) this._animarJugador(prevX, prevY);

    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 26);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 26);
    // El pie del jugador es y + 51: con esa Y se ordena contra los muebles.
    this.player.setDepth(this.player.y + 51);
    if (this.shadowContainer) {
      this.shadowContainer.setPosition(this.player.x, this.player.y + 45);
      this.shadowContainer.setDepth(this.player.y + 50);
    }
    if (this.usuariox) {
      this.usuariox.setText(this.Username || '');
      this.usuariox.setPosition(this.player.x, this.player.y - 60);
      this.usuariox.setDepth(9100);
    }
    try { this._actualizarMascota(); } catch (e) {}
    if (this.dog) { try { this.sendPlayerMovement(); } catch (e) {} }
    this._moverAnimados(time);
    this._ajustarCamara();
    this._comprobarSalida();
  }

  /**
   * Los limites de la camara: la sala, y si la sala es mas pequena que lo que
   * se ve, un marco mas grande CENTRADO en ella. Con los limites justos de la
   * sala, Phaser la pegaba a la esquina de arriba a la izquierda y dejaba todo
   * el negro a un lado. Solo se recalcula si cambia el zoom o el tamano.
   */
  _ajustarCamara() {
    const cam = this.cameras && this.cameras.main;
    if (!cam || !this.map) return;
    const huella = cam.zoom + ':' + cam.width + ':' + cam.height;
    if (this._camaraHecha === huella) return;
    this._camaraHecha = huella;
    const W = this.map.widthInPixels, H = this.map.heightInPixels;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const bw = Math.max(W, vw), bh = Math.max(H, vh);
    cam.setBounds((W - bw) / 2, (H - bh) / 2, bw, bh);
  }

  /** Cada casa, su sala: los de la misma casa se ven; los de otra, no. */
  _salaDeEscena() {
    return 'casa:' + (this._casaId || 'x');
  }

  // =========================================================================
  // SALIR
  // =========================================================================
  _comprobarSalida() {
    if (!this._salida || !this.playerRect) return;
    const tocando = Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, this._salida);
    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;
    this._salidaArmada = false;
    this._cambiandoEscena = true;
    this._volverAlMapa();
  }

  _volverAlMapa() {
    console.log('🏠 saliendo de', this._casaId);
    try { this._cancelarArrastre(); } catch (e) {}
    try { this.player.anims.stop(); } catch (e) {}
    const p = this._casa.puerta;
    // Delante de la puerta, mirando al pueblo (los pies, 90 px por debajo).
    const destino = { x: p.x, y: p.y + 40, mundo: 1 };
    this._dejarPartidaEnElMapa(destino.x, destino.y);
    this._ocultarHUD();
    try { this.removeListener(); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
    try { this.stopMusicSafely(); } catch (e) {}
    this._salaDestino = 'game';
    if (this.socket && this.socket.connected) {
      this.socket.emit('joinRoom', { room: 'game', username: this.Username || '---', lastScene: 'InteriorScene', x: destino.x, y: destino.y });
    }
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }
    this.scene.start('LoadingScenegame', { targetScene: 'GameScene', playerData: destino });
  }

  // =========================================================================
  // APAGADO
  // =========================================================================
  _alApagar() {
    if (this._interiorCleanupDone) return;
    this._interiorCleanupDone = true;
    this._sceneStopped = true;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza de la casa:', e); }
    const matar = (o) => { try { if (o && o.destroy) o.destroy(); } catch (e) {} };
    this._muebles.forEach(matar);
    this._animados.forEach((a) => { (a.llamas || []).forEach(matar); matar(a.fuego); });
    this._luzObjs.forEach((L) => { matar(L.luz); matar(L.haz); (L.motas || []).forEach(matar); });
    matar(this._penumbra); matar(this._cartel);
    this._muebles = []; this._animados = []; this._luzObjs = []; this._penumbra = null;
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    this.backgroundLayer = null;
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    // Las texturas de la casa no pintan nada fuera: a la memoria de video.
    ['int_tiles'].concat(MUEBLES_INTERIOR.map(n => 'int_' + n)).forEach((k) => {
      try { if (this.textures.exists(k)) this.textures.remove(k); } catch (e) {}
    });
    console.log('🏠 casa apagada');
  }
}

// Lo busca register-scenes.js por su nombre en window (como la mina y la isla).
window.InteriorScene = InteriorScene;
