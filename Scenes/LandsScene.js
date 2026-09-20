/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * LA ISLA DE LAS PARCELAS — Scenes/LandsScene.js
 *
 * ============================================================================
 *
 * QUE ES ESTO
 * ---------------------------------------------------------------------------
 * La isla a la que lleva el boton redondo de Lands. Se entra desde el mapa, la
 * tienda o la mina, y se sale por el MISMO boton, que alli cambia de icono.
 * Quien decide todo eso es `gf-lands.js`; esta escena solo se monta.
 *
 * HEREDA DE GameScene, IGUAL QUE MinaScene
 * ---------------------------------------------------------------------------
 * Por el mismo motivo: asi tiene el HUD entero —inventario, casillas rapidas,
 * barras, monedas, chat, correo, habilidades, NFT, mascota y amistades— sin
 * copiar ni una linea. Lo unico propio de este archivo es el mapa, el agua que
 * frena y el sitio donde aparece el jugador.
 *
 * EL MAPA VIENE DADO, NO SE GENERA
 * ---------------------------------------------------------------------------
 * `Maps/mapa_lands.json` y `Game/MAPAS/isla_32.png` ya existian en el
 * proyecto. Son 64x48 casillas de 32 px = 2048x1536 px, con una sola capa de
 * tiles llamada `Terrain`.
 *
 * OJO: las casillas son de 32 px, no de 16 como en el mapa de fuera y la mina.
 * Eso solo cambia el `addTilesetImage`; el jugador sigue midiendo 46x102 px, o
 * sea kilo y medio de casilla de ancho y tres de alto.
 *
 * EL AGUA SE SACA DE LOS TILES, NO DE UNA CAPA DE COLISIONES
 * ---------------------------------------------------------------------------
 * El mapa no trae capa de objetos: es un tilelayer y nada mas. Asi que las
 * colisiones se calculan al arrancar recorriendo la capa y marcando las
 * casillas de agua, y despues se FUSIONAN en rectangulos maximos — el mismo
 * barrido que usa el generador de la mina. De 1.323 casillas de agua salen
 * unas pocas decenas de rectangulos, que es lo que el indice espacial heredado
 * espera encontrar.
 */

/* global GameScene, Phaser */

// eslint-disable-next-line no-unused-vars
class LandsScene extends GameScene {

  constructor() {
    // La clave por el constructor, igual que MinaScene: Phaser la guarda en
    // sys.settings y respeta la que ya venga puesta, asi que un `super()` a
    // secas registraria esta escena como 'GameScene'.
    super({ key: 'LandsScene' });

    this.esLands = true;

    /* LOS GID DEL AGUA.
     *
     * Se sacaron mirando el tileset: se cogio el color dominante de cada tile
     * de `isla_32.png` y se marco el que es azul. En este mapa solo se usa uno,
     * el 43 (1.323 casillas); el resto son arena #dcc188 y hierba #418546, que
     * son ademas los MISMOS colores que el mapa de fuera (ver tiles.png).
     *
     * Si algun dia el mapa usa mas tiles de agua —los de transicion de orilla,
     * por ejemplo— basta con anadir sus gid aqui. */
    this.gidsAgua = [43];

    this._piezas = [];
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
        for (let i = 1; i <= 7; i++) {
          this.load.image(pref + '_' + i, base + '/' + carpeta + '/run_' + i + '.png');
        }
      });
    }

    for (let i = 1; i <= 4; i++) {
      this.load.image('perro_derecha_' + i, './Game/Sprites/mascota/derecha/run_' + i + '.png');
      this.load.image('perro_izquierda_' + i, './Game/Sprites/mascota/izquierda/run_' + i + '.png');
    }

    // Claves PROPIAS ('tilemap_lands', 'tiles_isla'). La cache de Phaser es
    // compartida entre escenas: reutilizar 'tilemap' pisaria el del mapa de
    // fuera y al volver arriba se cargaria la isla.
    this.load.image('tiles_isla', './Game/MAPAS/isla_32.png');
    this.load.tilemapTiledJSON('tilemap_lands', './Maps/mapa_lands.json');

    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'campo' });
  }

  // =========================================================================
  // CREATE
  // =========================================================================

  async create() {
    console.log('🏝️ LandsScene.create()');

    // La sesion primero, igual que en la mina: sin playerName, loadPlayerData
    // se va sin cargar monedas ni inventario y el HUD sale vacio.
    const autenticado = await this.loadx();
    if (!autenticado) {
      console.error('🏝️ no se pudo autenticar: la isla no arranca');
      return;
    }
    if (!this.playerName) {
      console.error('🏝️ sin playerName: la isla no arranca');
      this.showTokenErrorHub();
      return;
    }
    this.currentAccount = this.playerName;
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    this.mundo = 4;
    this._cambiandoEscena = false;
    this._graphicsOcultado = false;
    this.speed = 240;
    this.socket = window.globalSocket || null;

    // Reciclar el mapa de fuera, con la misma red de seguridad que la mina:
    // NUNCA quitarlo sin tener la clase para volver a ponerlo.
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
      console.warn('🏝️ no se pudo reciclar GameScene:', e);
      try {
        if (ClaseMapa && !this.scene.get('GameScene')) {
          this.scene.add('GameScene', ClaseMapa, false);
        }
      } catch (e2) { console.error('🏝️ GameScene se quedo fuera:', e2); }
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this.map = this.make.tilemap({ key: 'tilemap_lands' });
    const tileset = this.map.addTilesetImage('isla_32', 'tiles_isla', 32, 32);
    this.textures.get('tiles_isla').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('Terrain', tileset, 0, 0);
    if (this.backgroundLayer) this.backgroundLayer.setDepth(0);

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // ── El agua, que frena ─────────────────────────────────────────────────
    this.collisionRectangles = this._rectangulosDeAgua();
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    console.log('🏝️ agua:', this.collisionRectangles.length, 'rectangulos');

    // ── El jugador ─────────────────────────────────────────────────────────
    const inicio = this._puntoDeAparicion();
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;
    this.player = this.physics.add.sprite(inicio.x, inicio.y, 'player_right_1');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(3);
    this.lastDirection = 'down';

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

    // ── Sistemas y HUD ─────────────────────────────────────────────────────
    await this._arrancarSistemas();
    this._mostrarHUD();

    // Al aire libre si van el viento y el ciclo de dia: es una isla, no una
    // cueva. Lo que NO va es el clima del mapa de fuera, que pregunta al
    // servidor por el tiempo de la partida y pintaria lluvia sobre el mar.
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: 'hierba' });
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'campo' });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);

    try { this._setupChatDom(); } catch (e) { console.warn('🏝️ chat:', e); }
    if (window.tiendaSistema) window.tiendaSistema.scene = this;

    this.events.once('shutdown', () => this._alApagar());
    console.log('🏝️ isla lista');
  }

  // =========================================================================
  // CONSTRUCCION
  // =========================================================================

  /**
   * Los rectangulos de colision del agua.
   *
   * Se recorre la capa de tiles marcando las casillas cuyo gid esta en
   * `this.gidsAgua`, y despues se fusionan en los rectangulos MAXIMOS que las
   * cubren. Es el mismo barrido que usa el generador de la mina, y por el
   * mismo motivo: un rectangulo por casilla serian 1.323 objetos que el indice
   * espacial tendria que recorrer, y salen unas decenas.
   */
  _rectangulosDeAgua() {
    const capa = this.map.getLayer('Terrain');
    if (!capa) {
      console.warn('🏝️ el mapa no tiene capa "Terrain"');
      return [];
    }
    const W = this.map.width;
    const H = this.map.height;
    const T = this.map.tileWidth;
    const agua = new Set(this.gidsAgua);

    const marca = [];
    for (let y = 0; y < H; y++) {
      const fila = [];
      for (let x = 0; x < W; x++) {
        const t = capa.data[y][x];
        fila.push(!!(t && agua.has(t.index)));
      }
      marca.push(fila);
    }

    const usado = marca.map(f => f.map(() => false));
    const rects = [];
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!marca[y][x] || usado[y][x]) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < W && marca[y][x2 + 1] && !usado[y][x2 + 1]) x2++;
        let y2 = y;
        for (;;) {
          if (y2 + 1 >= H) break;
          let cabe = true;
          for (let k = x; k <= x2; k++) {
            if (!marca[y2 + 1][k] || usado[y2 + 1][k]) { cabe = false; break; }
          }
          if (!cabe) break;
          y2++;
        }
        for (let yy = y; yy <= y2; yy++) {
          for (let xx = x; xx <= x2; xx++) usado[yy][xx] = true;
        }
        rects.push(new Phaser.Geom.Rectangle(
          x * T, y * T, (x2 - x + 1) * T, (y2 - y + 1) * T));
        x = x2 + 1;
      }
    }
    return rects;
  }

  /**
   * Donde aparece el jugador: el centro de la isla.
   *
   * No se da por bueno el centro geometrico sin mas — se comprueba que esa
   * casilla NO sea agua, y si lo fuera se busca en espiral la tierra mas
   * cercana. Aparecer dentro del mar deja al jugador atrapado contra las
   * colisiones, y es la clase de fallo que no da ningun error.
   */
  _puntoDeAparicion() {
    const capa = this.map.getLayer('Terrain');
    const T = this.map.tileWidth;
    const cx = Math.floor(this.map.width / 2);
    const cy = Math.floor(this.map.height / 2);
    const agua = new Set(this.gidsAgua);

    const esTierra = (x, y) => {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
      const t = capa && capa.data[y][x];
      return !!(t && t.index > 0 && !agua.has(t.index));
    };

    if (esTierra(cx, cy)) {
      return { x: cx * T + T / 2, y: cy * T + T / 2 };
    }
    for (let r = 1; r < Math.max(this.map.width, this.map.height); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (esTierra(cx + dx, cy + dy)) {
            return { x: (cx + dx) * T + T / 2, y: (cy + dy) * T + T / 2 };
          }
        }
      }
    }
    console.warn('🏝️ no encontre tierra: se usa el centro del mapa');
    return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
  }

  // =========================================================================
  // UPDATE
  // =========================================================================
  //
  // No llama a super.update() por lo mismo que la mina: el update de GameScene
  // recorre arboles, rocas y NPC del mapa de fuera, que aqui no existen.

  update(time, delta) {
    {
      let b = this._elBurbujaLocal;
      if (!b || !b.isConnected) {
        b = this._elBurbujaLocal = document.getElementById('local-chat-bubble');
      }
      const plazoVivo = this._burbujaHasta && Date.now() < this._burbujaHasta;
      if (b && (plazoVivo || b.style.display !== 'none')) this._positionLocalBubble(b);
    }

    if (!this.keys) return;
    if (!this.player || !this.player.scene) return;

    this._asegurarIndiceColisiones();

    this.previousPosition = { x: this.player.x, y: this.player.y };
    this.posicionplayerx = this.player.x;
    this.posicionplayery = this.player.y;

    if (this.mouseMovement.followCursorActive && !this.input.activePointer.isDown) {
      this.stopMouseMovement();
    }
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
        dx += Math.cos(r);
        dy += Math.sin(r);
      }
      const largo = Math.hypot(dx, dy);
      if (largo > 1) { dx /= largo; dy /= largo; }
      const seg = delta / 1000;
      this.player.x += dx * this.speed * seg;
      this.player.y += dy * this.speed * seg;
      this._rawMoveDx = dx;
      this._rawMoveDy = dy;
    }

    // Colisiones eje a eje, con el mismo rectangulo de pies que el resto del
    // juego (30x15): asi el jugador se desliza por la orilla en vez de
    // clavarse al tocarla en diagonal.
    const prevX = this.previousPosition.x;
    const prevY = this.previousPosition.y;
    if (this._chocaConEscenario(this.player.x - 15, prevY + 25, 30, 15)) {
      this.player.x = prevX;
    }
    if (this._chocaConEscenario(this.player.x - 15, this.player.y + 25, 30, 15)) {
      this.player.y = prevY;
    }

    this._animarJugador(prevX, prevY);

    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 15);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 15);

    this.player.setDepth(this.player.y);
    if (this.shadowContainer) {
      this.shadowContainer.setPosition(this.player.x, this.player.y + 45);
      this.shadowContainer.setDepth(this.player.y - 1);
    }
    if (this.usuariox) {
      this.usuariox.setText(this.Username || '');
      this.usuariox.setPosition(this.player.x, this.player.y - 60);
      this.usuariox.setDepth(this.player.y + 1);
    }

    try { this._actualizarMascota(); } catch (e) {}
  }

  // =========================================================================
  // APAGADO
  // =========================================================================

  _alApagar() {
    console.log('🏝️ apagando la isla');
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    // La textura de la isla se suelta: mientras se juega fuera no pinta nada
    // ocupando memoria de video.
    try {
      if (this.textures.exists('tiles_isla')) this.textures.remove('tiles_isla');
    } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.LandsScene = LandsScene;
