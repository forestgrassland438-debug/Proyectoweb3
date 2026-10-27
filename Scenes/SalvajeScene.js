/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * EL MAPA SALVAJE — Scenes/SalvajeScene.js                         (2026-10-11)
 *
 * "Entre el medio, al lado izquierdo, en la esquina del mapa de GameScene hay
 * un camino: quiero otro mapa 5008 allí, una zona PvP donde los usuarios se
 * puedan dar espadazos o soltar recursos para que otro los tome, con
 * monstruos, climas como GameScene, los árboles nuevos y 3 caminos para más
 * mapas a futuro."
 *
 * EL MAPA: Maps/salvaje.json (tools/generar-salvaje.py), 314 x 314 casillas
 * de 16 px con el MISMO tileset que el pueblo (Game/MAPAS/tiles.png) y sus
 * mismas reglas de orillas, caminos y bordillos. El ESTE es zona neutral (se
 * llega del pueblo por su borde este, por el camino de ladrillo que sigue al
 * suyo); un río con un puente lo separa del OESTE, la zona PvP (ver
 * gf-salvaje.js). Sus tres salidas llevan (2026-10-18) al cementerio (oeste),
 * al desierto (sur) y a la tundra (norte): Scenes/ZonasScenes.js.
 *
 * EL SUELO COMO EL DEL PUEBLO (2026-10-11): "el mapa nuevo debe ir también
 * recortado como la mina y los demás mapas; el agua debe ser como la de
 * GameScene y también su piso; no tiene el monte; y el zoom igual que
 * GameScene". Así que:
 *   · el suelo son TROZOS pintados (recortadas_salvaje, gf-suelo.js) con el
 *     detalle del pueblo (tools/detallar-captura-mapa.py);
 *   · el agua es la del pueblo que se mueve (gf-agua.js, 'rio': peces,
 *     hojas, piedras, juncos), leída de la capa de casillas;
 *   · el puente es un dibujo encima del agua, con la baranda de delante por
 *     encima de quien cruza (Game/MAPAS/salvaje/puente*.png);
 *   · el monte (gf-monte.js, Maps/monte_salvaje.json);
 *   · y el zoom de GameScene: 0.5x, 1x y 2x.
 *
 * HEREDA DE GameScene, como la mina y la isla: HUD, inventario, chat,
 * amigos, mascota... sin copiar nada. Lo propio de aquí: el mapa, los
 * árboles (sprites en 2.5D, ordenados por su base y recortados a lo que ve la
 * cámara), el clima del pueblo (lluvia, nieve, viento, día y noche) y la
 * salida al pueblo. Los monstruos, la espada contra jugadores y los objetos
 * en el suelo están en gf-salvaje.js.
 *
 * mundo = 6 · sala del servidor 'salvaje' (los que están aquí se ven).
 * ============================================================================
 */

/* global GameScene, Phaser */

// (2026-10-18) 'b': las tres salidas abiertas a los mapas nuevos (Maps/salvaje.json).
const SALVAJE_V = '20261019a';   // (2026-10-19) el agua ya no deja pisar la orilla
const SALVAJE_ARBOLES = ['abedul', 'abeto', 'arbol_ancestral', 'arbol_seco', 'cerezo', 'pino',
  'roble_ancho', 'roble_curvado', 'roble_otono', 'roble_redondo'];
// Al volver al pueblo: en su camino del borde oeste, un poco hacia dentro.
const SALVAJE_VUELTA = { x: 90, y: 2224 };

// eslint-disable-next-line no-unused-vars
class SalvajeScene extends GameScene {

  constructor() {
    // La clave por el constructor (ver MinaScene): con un super() a secas se
    // registraría como 'GameScene'.
    super({ key: 'SalvajeScene' });
    this.esSalvaje = true;
    // El zoom del pueblo: el suelo son trozos pintados, como allí, así que a
    // 0.5x no salen costuras entre casillas.
    this._nivelesDeZoom = [0.5, 1.0, 2.0];
    this._arboles = [];
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
    const v = '?v=' + SALVAJE_V;
    // Claves PROPIAS: la caché de Phaser es compartida entre escenas. El
    // tileset es el del pueblo, pero con su clave: al salir se libera sin
    // tocar el 'tiles' de GameScene.
    this.load.image('tiles_salvaje', './Game/MAPAS/tiles.png' + v);
    this.load.image('sv_puente', './Game/MAPAS/salvaje/puente.png' + v);
    this.load.image('sv_puente_baranda', './Game/MAPAS/salvaje/puente_baranda.png' + v);
    this.load.tilemapTiledJSON('tilemap_salvaje', './Maps/salvaje.json' + v);
    SALVAJE_ARBOLES.forEach((n) => {
      if (!this.textures.exists('sv_arbol_' + n)) this.load.image('sv_arbol_' + n, './Game/MAPAS/salvaje/arboles/' + n + '.png' + v);
    });
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    // (2026-10-19) La cabaña del cazador: el dibujo de la cabaña del pueblo
    // (casa_* → gf-relieve le pone su relieve de casa).
    if (!this.textures.exists('casa_cabana_monte_png')) this.load.image('casa_cabana_monte_png', './Game/Objetos/casa de granja cabaña.png' + v);
    // El clima del pueblo: viento, lluvia y truenos.
    if (window.GFViento) window.GFViento.precargar(this);
    if (window.GFClima) window.GFClima.precargar(this);
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'campo' });
  }

  // =========================================================================
  // CREATE
  // =========================================================================
  async create() {
    const sceneRunId = this._sceneRunId = (this._sceneRunId || 0) + 1;
    // (2026-10-19) La pantalla de carga sigue hasta que el mapa tenga TODO
    // (monstruos, NPC, efectos, suelo): gf-carga-mapa.js. Mientras, quieto.
    if (window.GFCargaMapa) window.GFCargaMapa.montar(this);
    this._accionPersonaje = null;   // (2026-10-19) la escena se reutiliza: ni pesca ni espadazo a medias
    this._sceneStopped = false;
    this._cleanupSceneDone = false;
    this._shutdownDone = false;
    this._salvajeCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    console.log('🌲 SalvajeScene.create()');

    // La sesión de la escena anterior (ver LandsScene): sin volver a pedirla.
    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) sesion = await this.loadx();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) {
      console.error('🌲 no se pudo autenticar: el mapa salvaje no arranca');
      this.showTokenErrorHub();
      return;
    }
    this.currentAccount = this.currentAccount || this.playerName;
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    this.mundo = 6;
    this._cambiandoEscena = false;
    this._salaDestino = null;
    this._graphicsOcultado = false;
    this.speed = 240;
    // La brisa del monte (gf-viento.js): los árboles se mecen siempre un poco.
    this._vientoExtra = 0.35;
    this.socket = window.globalSocket || null;
    this._avisoSalidaEn = 0;

    // Reciclar el mapa de fuera, con la misma red de seguridad que la isla.
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
      console.warn('🌲 no se pudo reciclar GameScene:', e);
      try { if (ClaseMapa && !this.scene.get('GameScene')) this.scene.add('GameScene', ClaseMapa, false); }
      catch (e2) { console.error('🌲 GameScene se quedó fuera:', e2); }
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this.map = this.make.tilemap({ key: 'tilemap_salvaje' });
    const tileset = this.map.addTilesetImage('Tileset_mapa', 'tiles_salvaje', 16, 16);
    this.textures.get('tiles_salvaje').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('suelo', tileset, 0, 0);
    if (this.backgroundLayer) this.backgroundLayer.setDepth(0);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    /* EL AGUA DEL PUEBLO (gf-agua.js): se mueve, con espuma en la orilla,
       peces, hojas y sus piedras y juncos. Lee la capa `suelo`; debajo del
       puente no pone nada fijo (saldría por encima de las tablas). */
    const puente = this._rectDelPuente();
    if (window.GFAgua) window.GFAgua.montar(this, { capa: 'suelo', textura: 'tiles_salvaje', vida: 'rio', excluir: puente ? [puente] : [] });
    /* EL SUELO PINTADO (gf-suelo.js): los trozos de recortadas_salvaje. Al
       llegar el primero se esconde la capa de casillas. */
    this._montarSueloPintado('recortadas_salvaje', 'salvaje', [this.backgroundLayer]);
    this._montarPuente();

    // ── Colisiones (agua, troncos, vallas) y salidas ─────────────────────────
    this.collisionRectangles = this._rectsDeCapa('colisiones');
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    this._salidas = (this.map.getObjectLayer('salidas') || { objects: [] }).objects.map((o) =>
      ({ nombre: o.name, rect: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height) }));
    this._salidaArmada = false;
    this._montarCabana();

    // ── Los árboles (2.5D) ────────────────────────────────────────────────
    this._montarArboles();
    // (2026-10-26) El tronco dibujado encima de su choque (gf-troncos.js):
    // el roble curvado lo tiene 31 px a un lado y se atravesaba.
    if (window.GFTroncos) window.GFTroncos.ajustar(this, this._arboles);

    // ── El jugador ─────────────────────────────────────────────────────────
    let inicio = this._puntoDeAparicion();
    const viaje = window.GFViaje ? window.GFViaje.tomar(6) : null;
    if (viaje && Number.isFinite(viaje.x) && Number.isFinite(viaje.y)) inicio = { x: viaje.x, y: viaje.y };
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;
    // EL ANCLA: `loadPlayerData()` respeta este punto (ver GameScene).
    this._anclaPropia = { x: inicio.x, y: inicio.y };
    this.player = this.physics.add.sprite(inicio.x, inicio.y, 'player_right_1');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(3);
    this.lastDirection = 'left';

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

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this._montarZoom();
    const entrada = this._entradaDeCamara(sceneRunId);

    // ── Sistemas y HUD ─────────────────────────────────────────────────────
    try { this._setupChatDom(); } catch (e) { console.warn('chat:', e); }
    entrada.then((ok) => { if (ok) this._mostrarHUD(); });
    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    await entrada;
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    this._mostrarHUD();

    // Al aire libre: el clima del pueblo (viento, lluvia, nieve, día y noche).
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFViento)      window.GFViento.montar(this);
    if (window.GFClima)       window.GFClima.montar(this);
    if (window.GFNieve)       window.GFNieve.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: 'hierba' });
    // Con SU tileset: el camino suena a tierra y la hierba a hierba.
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'campo', texturaSuelo: 'tiles_salvaje' });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);
    if (window.GFEspada)      window.GFEspada.montar(this);
    // La hierba alta que se abre al pasar, como en el pueblo (gf-monte.js).
    if (window.GFMonte)       window.GFMonte.montar(this);
    try {
      if (window.GFCiclo) {
        window.GFCiclo.sincronizarSiHaceFalta('entrar en el mapa salvaje');
        window.GFCiclo.montarEscena(this, { jugador: this.player });
      }
    } catch (e) { console.warn('🌲 ciclo día/noche:', e); }
    // (2026-10-21) "Los efectos de la noche no están en el mapa salvaje": el
    // revelado de la cámara del pueblo (gf-postproceso.js: la viñeta azul, el
    // color y el grano de la noche, y el look de la lluvia y el sol).
    try { if (window.GFPost) window.GFPost.montar(this); } catch (e) { console.warn('🌲 post-procesado:', e); }
    // Los monstruos, la espada contra jugadores en la zona PvP, los objetos
    // en el suelo y los carteles (gf-salvaje.js).
    try { if (window.GFSalvaje) window.GFSalvaje.montar(this); } catch (e) { console.warn('🌲 salvaje:', e); }
    // Las antorchas que pone la gente, con su luz de noche (gf-antorchas.js).
    try { if (window.GFAntorchas) window.GFAntorchas.montar(this); } catch (e) { console.warn('🌲 antorchas:', e); }
    // (2026-10-21) El bote en el río y en los lagos (gf-botes.js).
    try { if (window.GFBotes) window.GFBotes.montar(this); } catch (e) { console.warn('🌲 bote:', e); }
    // (2026-10-19) Los NPC del mapa (gf-npcs.js).
    try { if (window.GFNpcs) window.GFNpcs.montar(this); } catch (e) { console.warn('🌲 NPC:', e); }
    // (2026-10-19) La puerta de la cabaña del cazador (gf-casas.js, `cabana_monte`).
    try { if (window.GFCasas) window.GFCasas.montar(this); } catch (e) { console.warn('🌲 cabaña:', e); }

    if (window.tiendaSistema) window.tiendaSistema.scene = this;
    // (2026-10-19) Se pesca en el agua de este mapa (gf-pesca.js). El agua
    // animada (gf-agua) puede tardar un momento en clasificarse: si aún no
    // está, se vuelve a probar.
    const montarPesca = (intento) => {
      if (!this.sys || !this.sys.isActive() || !window.GFPesca) return;
      if (!window.GFPesca.montar(this) && intento < 6) this.time.delayedCall(800, () => montarPesca(intento + 1));
    };
    montarPesca(0);
    console.log('🌲 mapa salvaje listo');
    if (window.GFCargaMapa) window.GFCargaMapa.listo(this);
  }

  // =========================================================================
  // EL MAPA
  // =========================================================================
  _rectsDeCapa(nombre) {
    const capa = this.map && this.map.getObjectLayer(nombre);
    if (!capa) return [];
    return capa.objects
      .filter((o) => o.width > 0 && o.height > 0)
      .map((o) => new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height));
  }

  /** El rectángulo del dibujo del puente (capa `puente` del mapa), o null. */
  _rectDelPuente() {
    const capa = this.map && this.map.getObjectLayer('puente');
    const o = capa && capa.objects.find((p) => p.name === 'puente');
    return o ? { x: o.x, y: o.y, width: o.width, height: o.height } : null;
  }

  /**
   * El puente: el tablero (con la baranda de atrás) va encima del agua que se
   * mueve (0.5) y debajo de todo lo que pisa; la baranda de DELANTE se ordena
   * por su base, así tapa los pies de quien cruza, como en 2.5D.
   */
  _montarPuente() {
    this._puenteImgs = [];
    const capa = this.map && this.map.getObjectLayer('puente');
    if (!capa) return;
    capa.objects.forEach((o) => {
      if (o.name === 'puente' && this.textures.exists('sv_puente')) {
        this._puenteImgs.push(this.add.image(o.x, o.y, 'sv_puente').setOrigin(0, 0).setDepth(0.7));
      } else if (o.name === 'baranda' && this.textures.exists('sv_puente_baranda')) {
        this._puenteImgs.push(this.add.image(o.x, o.y, 'sv_puente_baranda').setOrigin(0, 0).setDepth(o.y + o.height));
      }
    });
  }

  _puntoDeAparicion() {
    const capa = this.map.getObjectLayer('aparicion');
    const p = capa && capa.objects && capa.objects[0];
    if (p) return { x: p.x, y: p.y };
    return { x: this.map.widthInPixels - 140, y: 2224 };
  }

  /**
   * Los árboles: un sprite por árbol, anclado en su BASE (origen abajo al
   * centro) y con `depth` = esa Y, como el jugador: se pasa por detrás de la
   * copa y por delante del tronco. Cada uno con su sombra en el suelo, una
   * elipse lisa. Son ~500: solo se muestran los que caen cerca de la cámara
   * (ver `_recortarArboles`), así no se dibujan los del otro lado del mapa.
   */
  _montarArboles() {
    this._arboles = [];
    if (!this.textures.exists('sv_sombra_arbol')) {
      const c = this.textures.createCanvas('sv_sombra_arbol', 96, 32);
      const x = c.getContext();
      x.save(); x.scale(1, 32 / 96);
      const g = x.createRadialGradient(48, 48, 2, 48, 48, 48);
      g.addColorStop(0, 'rgba(10,30,14,0.5)'); g.addColorStop(0.7, 'rgba(10,30,14,0.25)'); g.addColorStop(1, 'rgba(10,30,14,0)');
      x.fillStyle = g; x.beginPath(); x.arc(48, 48, 48, 0, Math.PI * 2); x.fill(); x.restore();
      c.refresh();
    }
    const capa = this.map.getObjectLayer('arboles');
    if (!capa) return;
    capa.objects.forEach((o) => {
      const clave = 'sv_arbol_' + o.name;
      if (!this.textures.exists(clave)) return;
      const pie = (o.properties || []).find((p) => p.name === 'pie_x');
      const x = pie ? Number(pie.value) : o.x + o.width / 2;
      const y = o.y;
      const k = (o.width || 166) / 128;
      const spr = this.add.image(x, y, clave).setOrigin(0.5, 1).setScale(k).setDepth(y);
      spr.setData('optimized', true);
      const sombra = this.add.image(x + 6, y - 4, 'sv_sombra_arbol').setScale(k * 0.95).setDepth(2).setAlpha(0.9);
      this._arboles.push({ spr, sombra, x, y, visible: true });
    });
    this._recorteEn = 0;
    console.log('🌲 árboles:', this._arboles.length);
  }

  _recortarArboles(ahora) {
    if (ahora < this._recorteEn) return;
    this._recorteEn = ahora + 250;
    const v = this.cameras.main.worldView;
    const x0 = v.x - 160, x1 = v.right + 160, y0 = v.y - 40, y1 = v.bottom + 260;
    for (let i = 0; i < this._arboles.length; i++) {
      const a = this._arboles[i];
      const ve = a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1;
      if (ve !== a.visible) {
        a.visible = ve;
        a.spr.setVisible(ve);
        a.sombra.setVisible(ve);
      }
    }
  }

  /** ¿En la zona PvP? (la capa `zonas` del mapa: todo lo que queda al oeste del río) */
  enZonaPvp(x, y) {
    if (!this._zonaPvp) {
      const capa = this.map && this.map.getObjectLayer('zonas');
      const z = capa && capa.objects.find((o) => o.name === 'pvp');
      this._zonaPvp = z ? new Phaser.Geom.Rectangle(z.x, z.y, z.width, z.height) : new Phaser.Geom.Rectangle(0, 0, 0, 0);
    }
    return this._zonaPvp.contains(x, y);
  }

  // =========================================================================
  // CADA FOTOGRAMA
  // =========================================================================
  update(time, delta) {
    // (2026-10-19) Aún cargando el mapa (gf-carga-mapa.js): no se mueve nada.
    if (this._gfCargando) return;
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
      // La velocidad, en cada fotograma (2026-10-18): `loadPlayerData()` copia
      // el `speed` guardado (2,7 en muchas cuentas, de cuando era por
      // fotograma) y se andaba a 3 px/s sin animación. Ver ZonasScenes.js.
      this.speed = 240;
      const seg = delta / 1000;
      // Lo que frena a quien pisa la savia de una araña (gf-salvaje.js).
      const freno = this._frenoHasta && time < this._frenoHasta ? 0.55 : 1;
      this.player.x += dx * this.speed * seg * freno;
      this.player.y += dy * this.speed * seg * freno;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }
    const prevX = this.previousPosition.x, prevY = this.previousPosition.y;
    this._resolverChoqueJugador(prevX, prevY, 26);
    if (!this._accionPersonaje) this._animarJugador(prevX, prevY);

    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 26);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 26);
    this.player.setDepth(this.player.y + 51);
    if (this.shadowContainer) {
      this.shadowContainer.setPosition(this.player.x, this.player.y + 45);
      this.shadowContainer.setDepth(this.player.y + 50);
    }
    if (this.usuariox) {
      this.usuariox.setText(this.Username || '');
      this.usuariox.setPosition(this.player.x, this.player.y - 60);
      this.usuariox.setDepth(this.player.y + 52);
    }
    try { this._actualizarMascota(); } catch (e) {}
    if (this.dog) { try { this.sendPlayerMovement(); } catch (e) {} }
    try { this.cleanInactivePlayers(); } catch (e) {}

    this._recortarArboles(time);
    this._comprobarSalidas();
  }

  // =========================================================================
  // LA CABAÑA DEL CAZADOR                                          (2026-10-19)
  // =========================================================================
  /* "Pon una cabaña en el mapa salvaje, en la zona neutral; que se pueda
     entrar y con un NPC con su nombre dentro." En el prado al este del río
     (la zona neutral), junto al camino: el dibujo de la cabaña del pueblo al
     doble, con SU choque y SU puerta medidos allí (mapa_principal.json: el
     objeto en (471, 485), la puerta en (715, 463) y el choque
     `area_colision_general` (515, 235, 424, 240)), movidos aquí. Dentro manda
     InteriorScene (sala 'cabana'), y vive Brannoc (gf-npcs.js). */
  _montarCabana() {
    const C = SalvajeScene.CABANA;
    if (!this.textures.exists('casa_cabana_monte_png')) return;
    const casa = this.add.image(C.x, C.y, 'casa_cabana_monte_png').setOrigin(0, 1).setDisplaySize(511, 395);
    // Su línea de suelo: el borde de abajo del choque.
    casa.setDepth(C.choque.y + C.choque.h);
    this._cabana = casa;
    const r = new Phaser.Geom.Rectangle(C.choque.x, C.choque.y, C.choque.w, C.choque.h);
    this.collisionRectangles.push(r);
    this._reconstruirIndiceColisiones();
    // Detrás de la casa, la casa se vuelve tenue (como en el pueblo).
    const tenue = () => {
      const p = this.player;
      if (!p || !casa.scene) return;
      const pies = p.y + 51;
      const detras = p.x > C.x + 10 && p.x < C.x + 500 && pies < C.choque.y + C.choque.h && pies > C.y - 395 + 40;
      const a = detras ? 0.5 : 1;
      if (casa.alpha !== a) casa.setAlpha(a);
    };
    this.events.on('update', tenue);
    this.events.once('shutdown', () => { this.events.off('update', tenue); this._cabana = null; });
  }

  // =========================================================================
  // LA SALA Y LAS SALIDAS
  // =========================================================================
  _salaDeEscena() { return 'salvaje'; }

  _comprobarSalidas() {
    if (!this.playerRect || !this._salidas) return;
    /* LOS PIES O EL CUERPO (2026-10-19). "No puedo entrar ni salir de los
       mapas nuevos." Las salidas son tiras de 20 px pegadas al borde del mapa
       y el cuerpo de física (102 px de alto, con setCollideWorldBounds) se
       para en el borde ANTES de que lleguen los pies: por arriba se quedaban
       a unos 70 px, así que la salida del norte (la tundra) no se tocaba
       nunca, y la del sur se tocaba con 1 px de margen. Con el cuerpo, la
       salida se toca en cuanto se llega al borde. */
    const b = this.player && this.player.body;
    const cuerpo = b ? (this._rectCuerpo || (this._rectCuerpo = new Phaser.Geom.Rectangle())).setTo(b.x, b.y, b.width, b.height) : null;
    let tocando = null;
    for (const s of this._salidas) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, s.rect) ||
          (cuerpo && Phaser.Geom.Intersects.RectangleToRectangle(cuerpo, s.rect))) { tocando = s; break; }
    }
    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;
    if (tocando.nombre === 'pueblo') {
      this._salidaArmada = false;
      this._volverAlPueblo();
      return;
    }
    /* (2026-10-18) LAS TRES SALIDAS YA LLEVAN A ALGÚN SITIO: al oeste el
       cementerio, al sur el desierto y al norte la tundra (gf-zonas.js,
       Scenes/ZonasScenes.js). */
    if ((tocando.nombre === 'cementerio' || tocando.nombre === 'desierto' || tocando.nombre === 'tundra') && window.GFZonas) {
      this._salidaArmada = false;
      window.GFZonas.viajar(this, tocando.nombre);
      return;
    }
    // Una salida que no se conoce: cerrada.
    const ahora = Date.now();
    if (ahora - this._avisoSalidaEn > 3500) {
      this._avisoSalidaEn = ahora;
      try { this.notifications && this.notifications.show('🚧 This road is not open yet — new lands are coming soon!', 'info'); } catch (e) {}
    }
  }

  async _volverAlPueblo() {
    if (this._salidaGuardando) return;
    const salida = this._salidaGuardando = {};
    try {
        console.log('🌲 de vuelta al pueblo');
        try { this._cancelarArrastre(); } catch (e) {}
        try { this.player.anims.stop(); } catch (e) {}
        const destino = { x: SALVAJE_VUELTA.x, y: SALVAJE_VUELTA.y, mundo: 1 };
        // La nota de viaje: el pueblo aparece en su camino del borde oeste aunque
        // el guardado llegue tarde (ver tiendajuego/GameScene).
        if (!await this._confirmarSalidaAlMapa(destino.x, destino.y)) return;
        window.__gfViaje = { mundo: 1, x: destino.x, y: destino.y, islaDe: null, islaDeNombre: null, t: Date.now() };
        this._ocultarHUD();
        try { this.removeListener(); } catch (e) {}
        try { this._unbindAllDomClicks(); } catch (e) {}
        try { this.stopMusicSafely(); } catch (e) {}
        this._salaDestino = 'game';
        if (this.socket && this.socket.connected) {
          this.socket.emit('joinRoom', { room: 'game', username: this.Username || '---', soulbound: window.GFSoulbound ? window.GFSoulbound.actual() : null, lastScene: 'SalvajeScene', x: destino.x, y: destino.y });
        }
        try { this.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }
        this.scene.start('LoadingScenegame', { targetScene: 'GameScene', playerData: destino });
    } finally {
      if (this._salidaGuardando === salida) this._salidaGuardando = null;
    }
  }

  // =========================================================================
  // APAGADO
  // =========================================================================
  _alApagar() {
    if (this._salvajeCleanupDone) return;
    this._salvajeCleanupDone = true;
    this._sceneStopped = true;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    try { if (window.GFSalvaje) window.GFSalvaje.desmontar(this); } catch (e) {}
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza del mapa salvaje:', e); }
    console.log('🌲 apagando el mapa salvaje');
    (this._arboles || []).forEach((a) => { try { a.spr.destroy(); a.sombra.destroy(); } catch (e) {} });
    this._arboles = [];
    (this._puenteImgs || []).forEach((im) => { try { im.destroy(); } catch (e) {} });
    this._puenteImgs = [];
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.backgroundLayer = null;
    this._zonaPvp = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    // Las texturas del mapa y de los árboles: fuera de aquí no pintan nada en
    // memoria de vídeo (el problema que ya costó caro en este proyecto).
    // (Y los fotogramas del agua animada de aquí, que gf-agua deja hechos.)
    const delAgua = this.textures.getTextureKeys().filter((k) => k.indexOf('gfa_tiles_salvaje_') === 0);
    ['tiles_salvaje', 'sv_sombra_arbol', 'sv_puente', 'sv_puente_baranda']
      .concat(SALVAJE_ARBOLES.map((n) => 'sv_arbol_' + n), delAgua).forEach((k) => {
        try { if (this.textures.exists(k)) this.textures.remove(k); } catch (e) {}
      });
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

// La cabaña del cazador (ver _montarCabana): su esquina de abajo a la izquierda,
// su puerta (la de gf-casas.js, `cabana_monte`) y su choque.
SalvajeScene.CABANA = { x: 2560, y: 1690, puerta: { x: 2804, y: 1668 }, choque: { x: 2604, y: 1440, w: 424, h: 240 } };

window.SalvajeScene = SalvajeScene;
