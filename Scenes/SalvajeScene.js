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
 * EL MAPA: Maps/salvaje.json (tools/generar-salvaje.py), 157 x 157 casillas
 * de 32 px con el atlas lands_pradera_32 de tileset_nuevos. El ESTE es zona
 * neutral (se llega del pueblo por su borde este); un río con un puente lo
 * separa del OESTE, la zona PvP (ver gf-salvaje.js). Salidas cerradas al
 * norte, sur y oeste ("Coming soon") para los mapas que vengan.
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

const SALVAJE_V = '20261011a';
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
    // Sin 0.5x: es una capa de casillas y a medio zoom salen costuras (ver
    // LandsScene, por lo mismo).
    this._nivelesDeZoom = [1.0, 2.0];
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
    // Claves PROPIAS: la caché de Phaser es compartida entre escenas.
    this.load.image('tiles_salvaje', './Game/MAPAS/salvaje/terreno_32.png' + v);
    this.load.tilemapTiledJSON('tilemap_salvaje', './Maps/salvaje.json' + v);
    SALVAJE_ARBOLES.forEach((n) => {
      if (!this.textures.exists('sv_arbol_' + n)) this.load.image('sv_arbol_' + n, './Game/MAPAS/salvaje/arboles/' + n + '.png' + v);
    });
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
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
    const tileset = this.map.addTilesetImage('terreno_32', 'tiles_salvaje', 32, 32);
    this.textures.get('tiles_salvaje').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('suelo', tileset, 0, 0);
    if (this.backgroundLayer) this.backgroundLayer.setDepth(0);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── Colisiones (agua, troncos, vallas) y salidas ─────────────────────────
    this.collisionRectangles = this._rectsDeCapa('colisiones');
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    this._salidas = (this.map.getObjectLayer('salidas') || { objects: [] }).objects.map((o) =>
      ({ nombre: o.name, rect: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height) }));
    this._salidaArmada = false;

    // ── Los árboles (2.5D) ────────────────────────────────────────────────
    this._montarArboles();

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
    try {
      if (window.GFCiclo) {
        window.GFCiclo.sincronizarSiHaceFalta('entrar en el mapa salvaje');
        window.GFCiclo.montarEscena(this, { jugador: this.player });
      }
    } catch (e) { console.warn('🌲 ciclo día/noche:', e); }
    // Los monstruos, la espada contra jugadores en la zona PvP, los objetos
    // en el suelo y los carteles (gf-salvaje.js).
    try { if (window.GFSalvaje) window.GFSalvaje.montar(this); } catch (e) { console.warn('🌲 salvaje:', e); }

    if (window.tiendaSistema) window.tiendaSistema.scene = this;
    console.log('🌲 mapa salvaje listo');
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
      // Lo que frena a quien pisa la savia de una araña (gf-salvaje.js).
      const freno = this._frenoHasta && time < this._frenoHasta ? 0.55 : 1;
      this.player.x += dx * this.speed * seg * freno;
      this.player.y += dy * this.speed * seg * freno;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }
    const prevX = this.previousPosition.x, prevY = this.previousPosition.y;
    this._resolverChoqueJugador(prevX, prevY, 26);
    this._animarJugador(prevX, prevY);

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
  // LA SALA Y LAS SALIDAS
  // =========================================================================
  _salaDeEscena() { return 'salvaje'; }

  _comprobarSalidas() {
    if (!this.playerRect || !this._salidas) return;
    let tocando = null;
    for (const s of this._salidas) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, s.rect)) { tocando = s; break; }
    }
    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;
    if (tocando.nombre === 'pueblo') {
      this._salidaArmada = false;
      this._volverAlPueblo();
      return;
    }
    // Las tres salidas a futuros mapas: todavía cerradas.
    const ahora = Date.now();
    if (ahora - this._avisoSalidaEn > 3500) {
      this._avisoSalidaEn = ahora;
      try { this.notifications && this.notifications.show('🚧 This road is not open yet — new lands are coming soon!', 'info'); } catch (e) {}
    }
  }

  _volverAlPueblo() {
    console.log('🌲 de vuelta al pueblo');
    try { this._cancelarArrastre(); } catch (e) {}
    try { this.player.anims.stop(); } catch (e) {}
    const destino = { x: SALVAJE_VUELTA.x, y: SALVAJE_VUELTA.y, mundo: 1 };
    // La nota de viaje: el pueblo aparece en su camino del borde oeste aunque
    // el guardado llegue tarde (ver tiendajuego/GameScene).
    window.__gfViaje = { mundo: 1, x: destino.x, y: destino.y, islaDe: null, islaDeNombre: null, t: Date.now() };
    this._dejarPartidaEnElMapa(destino.x, destino.y);
    this._ocultarHUD();
    try { this.removeListener(); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
    try { this.stopMusicSafely(); } catch (e) {}
    this._salaDestino = 'game';
    if (this.socket && this.socket.connected) {
      this.socket.emit('joinRoom', { room: 'game', username: this.Username || '---', lastScene: 'SalvajeScene', x: destino.x, y: destino.y });
    }
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }
    this.scene.start('LoadingScenegame', { targetScene: 'GameScene', playerData: destino });
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
    ['tiles_salvaje', 'sv_sombra_arbol'].concat(SALVAJE_ARBOLES.map((n) => 'sv_arbol_' + n)).forEach((k) => {
      try { if (this.textures.exists(k)) this.textures.remove(k); } catch (e) {}
    });
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.SalvajeScene = SalvajeScene;
