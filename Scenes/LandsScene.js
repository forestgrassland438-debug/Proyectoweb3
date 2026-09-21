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

    /* SIN 0.5x. El mundo de esta escena es una capa de TILEMAP, y a medio
       zoom el borde de cada casilla cae a medio pixel: el rasterizador
       redondea distinto en casillas contiguas y salen rayas por todo el mapa,
       como si estuviera partido en cuadros. Con 1x y 2x cada pixel de textura
       cae en un numero entero de pixeles de pantalla y no hay costuras.
       tiendajuego usa estos dos niveles desde hace tiempo, por lo mismo. */
    this._nivelesDeZoom = [1.0, 2.0];
  }


  /**
   * Recoge la sesion que nos pasa la escena anterior.
   *
   * `init` corre ANTES que preload y create, que es justo lo que hace falta:
   * asi `create` ya la tiene y no necesita ir a la red.
   */
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
    /* `tipo: 'tienda'`, aunque la isla sea al aire libre: es el modo que NO
       carga los veintiun animales, los siete truenos ni el viento. Se pidio
       expresamente que en la isla no se oyera el ambiente. */
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
    this._landsCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    console.log('🏝️ LandsScene.create()');

    /* ── LA SESION, LO PRIMERO DE TODO ───────────────────────────────────
     *
     * Phaser crea una instancia NUEVA al cambiar de escena: el `playerName`,
     * el `address` y el token CSRF que tenia la escena anterior no viajan
     * solos. Sin ellos `loadPlayerData()` se planta en su primera linea y se
     * va sin cargar nada — ni monedas, ni inventario, ni cofre— sin dar un
     * error rojo, solo un HUD en blanco.
     *
     * PERO NO SE VUELVE A AUTENTICAR. La version anterior llamaba aqui a
     * `loadx()`, que pide el CSRF y llama a /api/auth/me. Eso dio el cartel de
     * SESSION EXPIRED al entrar, y por un motivo tonto: `serverBase` se
     * rellenaba en el preload() de GameScene, por el que esta escena no pasa,
     * asi que la peticion salia a `undefined/api/auth/me` y fallaba con la
     * sesion perfectamente viva.
     *
     * Ahora la escena que nos lanza nos PASA su sesion, que ya esta
     * comprobada. `loadx()` se queda solo de red de seguridad para cuando se
     * entra sin venir de ningun sitio. */
    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) {
      console.log('🏝️ sin sesion heredada: se pide al servidor');
      sesion = await this.loadx();
    }
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) {
      console.error('🏝️ no se pudo autenticar: la isla no arranca');
      this.showTokenErrorHub();
      return;
    }
    this.currentAccount = this.currentAccount || this.playerName;
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

    /* LA PUERTA, en `collisionRectangles1`.
       Se usa el MISMO nombre de propiedad que la mina y que el mapa de fuera
       porque el indice espacial heredado (`_reconstruirIndiceColisiones`) lee
       justo esas tres listas. Pero OJO: aqui la puerta NO frena. Es geometria
       para `_comprobarSalida()`, igual que la boca de la galeria en la mina:
       lo que hace el update es mirar si el jugador la toca, no rebotarlo. */
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    console.log('🏝️ agua:', this.collisionRectangles.length, 'rectangulos');

    this._puerta = this._rectDePuerta();
    this._salidaArmada = false;
    this._cambiandoEscena = false;

    // ── El jugador ─────────────────────────────────────────────────────────
    const inicio = this._puntoDeAparicion();
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;

    /* EL ANCLA. `loadPlayerData()` (heredado) llega despues y recoloca al
       jugador en la posicion guardada, que es una coordenada del mapa de
       fuera. Con esto puesto, respeta la de aqui. Ver el comentario en
       GameScene, junto a `this._anclaPropia`. */
    this._anclaPropia = { x: inicio.x, y: inicio.y };
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

    /* EL ZOOM. Vivia suelto dentro del create() de GameScene, por el que esta
       escena no pasa: sin esto la camara se quedaba clavada en 1.0x y no habia
       ni rueda, ni pellizco, ni botones de mas y menos. Ver `_montarZoom()`. */
    this._montarZoom();

    // ── Sistemas y HUD ─────────────────────────────────────────────────────
    await this._arrancarSistemas();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    this._mostrarHUD();

    // Al aire libre si van el viento y el ciclo de dia: es una isla, no una
    // cueva. Lo que NO va es el clima del mapa de fuera, que pregunta al
    // servidor por el tiempo de la partida y pintaria lluvia sobre el mar.
    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: 'hierba' });
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'tienda', suelo: 'hierba', interior: true });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);

    try { this._setupChatDom(); } catch (e) { console.warn('🏝️ chat:', e); }
    if (window.tiendaSistema) window.tiendaSistema.scene = this;

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

    /* SUB = 4 -> la rejilla de colision va a 8 px, no a 32.
       Es lo que permite que media casilla frene y la otra media no. */
    const SUB = 4;
    const paso = T / SUB;
    const SW = W * SUB;
    const SH = H * SUB;

    const mascaras = this._mascarasDeAgua(SUB);
    if (!mascaras) return this._rectangulosDeAguaPorCasilla();

    const marca = new Uint8Array(SW * SH);
    let subAgua = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = capa.data[y][x];
        if (!t || t.index <= 0) continue;
        const m = mascaras[t.index];
        if (!m) continue;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            if (!m[sy * SUB + sx]) continue;
            marca[(y * SUB + sy) * SW + (x * SUB + sx)] = 1;
            subAgua++;
          }
        }
      }
    }

    // Fusion en rectangulos maximos, igual que antes pero sobre la rejilla fina.
    const usado = new Uint8Array(SW * SH);
    const rects = [];
    for (let y = 0; y < SH; y++) {
      let x = 0;
      while (x < SW) {
        const i = y * SW + x;
        if (!marca[i] || usado[i]) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < SW && marca[y * SW + x2 + 1] && !usado[y * SW + x2 + 1]) x2++;
        let y2 = y;
        for (;;) {
          if (y2 + 1 >= SH) break;
          let cabe = true;
          for (let k = x; k <= x2; k++) {
            const j = (y2 + 1) * SW + k;
            if (!marca[j] || usado[j]) { cabe = false; break; }
          }
          if (!cabe) break;
          y2++;
        }
        for (let yy = y; yy <= y2; yy++) {
          for (let xx = x; xx <= x2; xx++) usado[yy * SW + xx] = 1;
        }
        rects.push(new Phaser.Geom.Rectangle(
          x * paso, y * paso, (x2 - x + 1) * paso, (y2 - y + 1) * paso));
        x = x2 + 1;
      }
    }
    console.log('🏝️ agua: ' + rects.length + ' rectangulos de ' +
                subAgua + ' trozos de ' + paso + ' px');
    return rects;
  }

  /**
   * Que parte de cada tile del tileset es AGUA, mirando sus pixeles.
   *
   * Devuelve, por indice de tile, un array de SUB*SUB booleanos: uno por cada
   * trozo de 8x8 de la casilla. null si la textura no se puede leer.
   *
   * POR QUE SE MIRAN LOS PIXELES Y NO UNA LISTA DE GID
   * -------------------------------------------------------------------------
   * La version anterior tenia `gidsAgua = [43]` escrito a mano. El 43 es el
   * unico tile que es agua ENTERA; las orillas (76..86) son mitad arena y
   * mitad agua. Al no estar en la lista, no frenaban nada y se podia caminar
   * sobre el mar por el borde. Meterlas en la lista habria sido peor: habria
   * bloqueado tambien la mitad de arena, o sea la playa entera.
   *
   * Mirando los pixeles no hay lista que mantener: si el mapa cambia de
   * tileset, o se dibujan orillas nuevas, esto sigue funcionando solo. Y se
   * hace UNA vez al entrar, sobre 128 casillas, no por fotograma.
   *
   * Que cuenta como agua: azul claramente dominante sobre rojo y verde. Es el
   * mismo criterio con el que se comprobo el tileset a mano, y deja fuera el
   * verde de la hierba y el beige de la arena sin margen de duda.
   */
  _mascarasDeAgua(SUB) {
    if (this._cacheMascarasAgua) return this._cacheMascarasAgua;

    let datos, ancho, alto;
    try {
      const tex = this.textures.get('tiles_isla');
      const img = tex.getSourceImage();
      ancho = img.width;
      alto = img.height;
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      datos = ctx.getImageData(0, 0, ancho, alto).data;
    } catch (e) {
      console.warn('🏝️ no se pudo leer el tileset: el agua frena por casillas enteras', e);
      return null;
    }

    const T = this.map.tileWidth;
    const cols = Math.floor(ancho / T);
    const filas = Math.floor(alto / T);
    const paso = T / SUB;
    const minAgua = paso * paso * 0.5;   // medio trozo mojado ya frena

    const mascaras = {};
    for (let i = 0; i < cols * filas; i++) {
      const tx = (i % cols) * T;
      const ty = Math.floor(i / cols) * T;
      const m = new Uint8Array(SUB * SUB);
      let alguno = false;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          let azules = 0;
          for (let py = 0; py < paso; py++) {
            for (let px = 0; px < paso; px++) {
              const o = ((ty + sy * paso + py) * ancho + (tx + sx * paso + px)) * 4;
              const r = datos[o], g = datos[o + 1], b = datos[o + 2], a = datos[o + 3];
              if (a > 40 && b > 110 && b > r + 35 && b > g + 18) azules++;
            }
          }
          if (azules >= minAgua) { m[sy * SUB + sx] = 1; alguno = true; }
        }
      }
      // El indice del tile en Phaser es firstgid + i; con un solo tileset
      // desde 1, eso es i + 1.
      if (alguno) mascaras[i + 1] = m;
    }
    this._cacheMascarasAgua = mascaras;
    console.log('🏝️ tiles con agua: ' + Object.keys(mascaras).length +
                ' de ' + (cols * filas));
    return mascaras;
  }

  /** Vuelta atras: casillas enteras segun `gidsAgua`, si no se pueden leer los pixeles. */
  _rectangulosDeAguaPorCasilla() {
    const capa = this.map.getLayer('Terrain');
    const W = this.map.width, H = this.map.height, T = this.map.tileWidth;
    const agua = new Set(this.gidsAgua);
    const rects = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = capa.data[y][x];
        if (t && agua.has(t.index)) {
          rects.push(new Phaser.Geom.Rectangle(x * T, y * T, T, T));
        }
      }
    }
    return rects;
  }

  /**
   * El rectangulo de la capa de objetos `puerta`, si el mapa la trae.
   *
   * Es la capa que se dibuja en Tiled sobre `mapa_lands.json`: marca a la vez
   * DONDE SE LLEGA y POR DONDE SE VUELVE. Se lee de la capa y no se escribe a
   * mano en el codigo a proposito: mover la puerta en Tiled tiene que bastar,
   * sin volver a tocar este archivo.
   *
   * Los objetos SIN gid (un rectangulo dibujado a mano, que es lo que hay
   * aqui) tienen su origen ARRIBA a la izquierda. Los que si tienen gid -los
   * que se colocan arrastrando un tile- lo tienen ABAJO a la izquierda, y por
   * eso se resta la altura en ese caso. Confundirlos deja la puerta un alto
   * por debajo de donde se ve en Tiled.
   */
  _rectDePuerta() {
    const capa = this.map.getObjectLayer('puerta');
    if (!capa || !capa.objects || !capa.objects.length) {
      console.warn('🏝️ mapa_lands.json no trae la capa de objetos "puerta"');
      return null;
    }
    const o = capa.objects[0];
    const arriba = o.gid ? (o.y - o.height) : o.y;
    const r = new Phaser.Geom.Rectangle(o.x, arriba, o.width, o.height);
    console.log('🏝️ puerta:', Math.round(r.x), Math.round(r.y),
                Math.round(r.width) + 'x' + Math.round(r.height));
    return r;
  }

  /**
   * Donde aparece el jugador: DELANTE de la puerta, no encima.
   *
   * "Delante" son 60 px hacia fuera del borde de la puerta. Aparecer DENTRO
   * de su rectangulo es justo lo que impedia volver: el primer fotograma ya
   * estaba tocando la salida, y aunque el candado `_salidaArmada` evita el
   * viaje inmediato, el jugador tenia que salirse del rectangulo y volver a
   * entrar sin verlo. Puesto delante, la puerta se ve, se pisa y se vuelve.
   *
   * Se prueban los cuatro lados y se coge el primero que sea TIERRA. La isla
   * tiene la puerta cerca de la orilla sur, asi que el norte suele ganar, pero
   * si un dia se mueve la puerta a otra costa esto sigue funcionando.
   *
   * Y si no hay capa `puerta` -un mapa antiguo-, se cae al centro de la isla,
   * que es lo que se hacia antes. Nunca se devuelve una posicion en el agua:
   * ahi el jugador se queda atrapado contra las colisiones sin un solo error.
   */
  _puntoDeAparicion() {
    const puerta = this._puerta || this._rectDePuerta();
    if (puerta) {
      const M = 60;
      const candidatos = [
        { x: puerta.centerX,   y: puerta.y - M,        lado: 'norte' },
        { x: puerta.centerX,   y: puerta.bottom + M,   lado: 'sur'   },
        { x: puerta.x - M,     y: puerta.centerY,      lado: 'oeste' },
        { x: puerta.right + M, y: puerta.centerY,      lado: 'este'  }
      ];
      for (const c of candidatos) {
        if (this._esTierraEnPixeles(c.x, c.y + 32)) {
          console.log('🏝️ apareces al', c.lado, 'de la puerta');
          return { x: c.x, y: c.y };
        }
      }
      console.warn('🏝️ la puerta no tiene tierra alrededor: se usa el centro');
    }
    return this._centroDeLaIsla();
  }

  /**
   * Si ese punto (en pixeles) pisa tierra. `y` se pasa ya a la altura de los
   * PIES del jugador: la casilla que importa es la que pisa, no la que le
   * queda a la altura de la cabeza.
   */
  _esTierraEnPixeles(px, py) {
    const capa = this.map.getLayer('Terrain');
    const T = this.map.tileWidth;
    const x = Math.floor(px / T);
    const y = Math.floor(py / T);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const t = capa && capa.data[y][x];
    return !!(t && t.index > 0 && this.gidsAgua.indexOf(t.index) === -1);
  }

  _centroDeLaIsla() {
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
    /* Ya nos vamos: ni un fotograma mas. Sin esto, el update seguiria
       escribiendo `posicionplayerx` con las coordenadas de la isla encima de
       las que `_dejarPartidaEnElMapa()` acaba de guardar. */
    if (this._cambiandoEscena) return;

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
    /* 26 de alto, no 15. El sprite es de 23x51 a escala 2, o sea 102 px con el
       origen en el centro: los pies caen en `y + 51`. Con 15 de alto la caja
       acababa en `y + 40` y los ultimos once pixeles del personaje se metian
       DENTRO de la pared. Se alarga por abajo y no se mueve: el borde de
       arriba sigue igual, asi que no se empieza a chocar antes de costado. */
    if (this._chocaConEscenario(this.player.x - 15, prevY + 25, 30, 26)) {
      this.player.x = prevX;
    }
    if (this._chocaConEscenario(this.player.x - 15, this.player.y + 25, 30, 26)) {
      this.player.y = prevY;
    }

    this._animarJugador(prevX, prevY);

    if (!this.playerRect) this.playerRect = new Phaser.Geom.Rectangle(0, 0, 30, 26);
    this.playerRect.setTo(this.player.x - 15, this.player.y + 25, 30, 26);

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

    this._comprobarSalida();
  }

  // =========================================================================
  // SALIR DE LA ISLA
  // =========================================================================

  /**
   * Pisar la puerta devuelve al mapa.
   *
   * Los mismos dos candados que la mina y que la puerta de la tienda:
   *
   *   . `_salidaArmada`: no dispara hasta que el jugador haya estado FUERA del
   *     rectangulo al menos un fotograma. Sin esto, aparecer cerca de la
   *     puerta te devolveria al mapa antes de ver la isla.
   *   . `_cambiandoEscena`: `scene.start()` no surte efecto hasta el final del
   *     paso actual, asi que sin el, el mismo fotograma podria lanzar la
   *     transicion dos veces.
   *
   * El viaje lo hace `GFLands.volver()`, el mismo que el boton redondo: asi
   * hay UN solo camino de vuelta, y el icono del boton y el apagado del HUD no
   * se pueden quedar a medias segun por donde se haya salido.
   */
  _comprobarSalida() {
    if (!this._puerta || !this.playerRect) return;

    const tocando = Phaser.Geom.Intersects.RectangleToRectangle(
      this.playerRect, this._puerta);

    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;

    this._salidaArmada = false;
    console.log('🏝️ has pisado la puerta: de vuelta al mapa');

    /* El guardado NO se hace aqui: lo hace `GFLands.volver()`, que es tambien
       el camino del boton redondo. Un solo sitio que corrige el mundo y la
       posicion antes de guardar, y no dos que se pueden desincronizar. */
    if (window.GFLands) {
      window.GFLands.volver(this);
    } else {
      // Sin gf-lands.js cargado: la vuelta a mano, a la plaza.
      this._dejarPartidaEnElMapa(2097, 2359);
      this.scene.start('LoadingScenegame', {
        targetScene: 'GameScene',
        playerData: { x: 2097, y: 2359, mundo: 1 }
      });
    }
  }

  // =========================================================================
  // APAGADO
  // =========================================================================

  _alApagar() {
    if (this._landsCleanupDone) return;
    this._landsCleanupDone = true;
    this._sceneStopped = true;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza de isla:', e); }
    console.log('🏝️ apagando la isla');
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.backgroundLayer = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    // La textura de la isla se suelta: mientras se juega fuera no pinta nada
    // ocupando memoria de video.
    try {
      if (this.textures.exists('tiles_isla')) this.textures.remove('tiles_isla');
    } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

window.LandsScene = LandsScene;
