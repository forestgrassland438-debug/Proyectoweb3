/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * LOS MAPAS NUEVOS — Scenes/ZonasScenes.js                        (2026-10-18)
 *
 * "Quiero 3 mapas nuevos del mismo tamaño que el mapa salvaje: un
 * cementerio (todo 2.5D, enemigos 2.5D y TODO zona PvP), un desierto (clima
 * de arena a veces sí y a veces no, remolinos que arrastran y quitan vida, y
 * cactus 2.5D) y otro que inventes; con buenos gráficos en el piso y el agua
 * como en el mapa salvaje, su recortada integrada y ajustado al tamaño de
 * los demás mapas y objetos."
 *
 *   · CementerioScene (mundo 7, sala 'cementerio'): el CEMENTERIO DE LAS
 *     ALMAS, al OESTE del mapa salvaje. Todo él es zona PvP.
 *   · DesiertoScene   (mundo 8, sala 'desierto'):   el DESIERTO ABRASADOR,
 *     al SUR. PvP al sur de y = 2600; tormentas de arena y remolinos.
 *   · TundraScene     (mundo 9, sala 'tundra'):     la TUNDRA HELADA, al
 *     NORTE (el inventado). PvP al norte de y = 2400; nieve y lago helado.
 *
 * LOS MAPAS (tools/generar-zonas.py): 314 x 314 casillas de 16 = 5024 px,
 * como el salvaje. El suelo son TROZOS pintados (recortadas_<zona>, gf-suelo)
 * hechos con el tileset del pueblo recoloreado en cada bioma; el agua es la
 * del pueblo que se mueve (gf-agua) leyendo la capa `suelo`. Los objetos son
 * 2.5D (un atlas por mapa, Game/MAPAS/<zona>/objetos, cada fotograma con su
 * punto de apoyo) y los árboles, los del paquete, a 1.3 como en el salvaje.
 * Todo se ordena por su base (depth = y) y solo se muestra lo que cae cerca
 * de la cámara.
 *
 * HEREDA DE GameScene, como el mapa salvaje (de quien copia el arranque):
 * HUD, inventario, chat, amigos, mascota… Los monstruos, la espada entre
 * jugadores y lo que se suelta en el suelo son gf-salvaje.js (el mismo del
 * salvaje, con las especies de cada mapa); el clima propio, los remolinos,
 * la niebla, la nevada, las luces de noche y los viajes, gf-zonas.js.
 * ============================================================================
 */

/* global GameScene, Phaser */

const ZONAS_V = '20261019b';   // (2026-10-19) más esqueletos y la cripta con su tejado bien

// eslint-disable-next-line no-unused-vars
class ZonaScene extends GameScene {

  /** La configuración de cada mapa (la ponen las subclases). */
  static get CFG() { return null; }

  constructor(clave) {
    super({ key: clave });
    this.esZona = true;
    this._nivelesDeZoom = [0.5, 1.0, 2.0];
    this._arboles = [];
    this._objetosZona = [];
  }

  get cfg() { return this.constructor.CFG; }

  init(datos) {
    this.__sesionRecibida = (datos && datos.sesion) || null;
  }

  // =========================================================================
  // PRELOAD
  // =========================================================================
  preload() {
    const c = this.cfg;
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
    const v = '?v=' + ZONAS_V;
    const ruta = './Game/MAPAS/' + c.zona + '/';
    // Claves PROPIAS de cada mapa (la caché de Phaser es de todo el juego):
    // al salir se liberan sin tocar las de las demás escenas.
    this.load.image(c.tileset, ruta + 'tiles_' + c.zona + '.png' + v);
    this.load.tilemapTiledJSON(c.mapa, './Maps/' + c.zona + '.json' + v);
    this.load.atlas(c.objetos, ruta + 'objetos.png' + v, ruta + 'objetos.json' + v);
    c.arboles.forEach((n) => {
      if (!this.textures.exists(c.prefijo + n)) this.load.image(c.prefijo + n, ruta + 'arboles/' + n + '.png' + v);
    });
    if (c.zona === 'desierto' && !this.textures.exists('zn_remolino')) {
      this.load.spritesheet('zn_remolino', ruta + 'remolino.png' + v, { frameWidth: 64, frameHeight: 114 });
    }
    // (2026-10-19) Los camellos del desierto (gf-camellos.js).
    if (c.zona === 'desierto' && window.GFCamellos) window.GFCamellos.precargar(this);
    this.load.audio('level_up_sound', './Game/MUSIC/levelup.wav');
    if (window.GFViento) window.GFViento.precargar(this);
    if (c.clima && window.GFClima) window.GFClima.precargar(this);
    // (2026-10-19) Con SU tema y SU ambiente (gf-audio.js, `zona`).
    if (window.GFAudio) window.GFAudio.precargar(this, { tipo: 'campo', zona: c.zona });
  }

  // =========================================================================
  // CREATE (el del mapa salvaje, con lo de cada mapa)
  // =========================================================================
  async create() {
    const c = this.cfg;
    // (2026-10-19) La pantalla de carga sigue hasta que el mapa tenga TODO
    // (monstruos, NPC, efectos, suelo): gf-carga-mapa.js. Mientras, quieto.
    if (window.GFCargaMapa) window.GFCargaMapa.montar(this);
    this._accionPersonaje = null;   // (2026-10-19) la escena se reutiliza: ni pesca ni espadazo a medias
    const sceneRunId = this._sceneRunId = (this._sceneRunId || 0) + 1;
    this._sceneStopped = false;
    this._cleanupSceneDone = false;
    this._shutdownDone = false;
    this._zonaCleanupDone = false;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    this.events.once('shutdown', this._alApagar, this);
    this.events.once('destroy', this._alApagar, this);
    console.log('🧭 ' + c.escena + '.create()');

    let sesion = this._aplicarSesion(this.__sesionRecibida);
    if (!sesion) sesion = await this.loadx();
    if (this._sceneStopped || this._sceneRunId !== sceneRunId) return;
    if (!sesion || !this.playerName) {
      console.error('🧭 no se pudo autenticar: ' + c.escena + ' no arranca');
      this.showTokenErrorHub();
      return;
    }
    this.currentAccount = this.currentAccount || this.playerName;
    this.phaser_ancho = this.scale.width;
    this.phaser_largo = this.scale.height;

    this.mundo = c.mundo;
    this._cambiandoEscena = false;
    this._viajeZona = false;
    this._salaDestino = null;
    this._graphicsOcultado = false;
    this.speed = 240;
    // La brisa (gf-viento.js): los árboles se mecen siempre un poco; en el
    // desierto, la tormenta de arena la sube (gf-zonas.js).
    this._vientoExtra = 0.35;
    // Sin hojas al viento en la nieve ni en la arena (allí no hay árboles de hoja).
    this._sinHojas = c.zona === 'desierto' || c.zona === 'tundra';
    this.socket = window.globalSocket || null;
    this._avisoSalidaEn = 0;

    // Reciclar el mapa de fuera, con la misma red de seguridad que el salvaje.
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
      console.warn('🧭 no se pudo reciclar GameScene:', e);
      try { if (ClaseMapa && !this.scene.get('GameScene')) this.scene.add('GameScene', ClaseMapa, false); }
      catch (e2) { console.error('🧭 GameScene se quedó fuera:', e2); }
    }

    // ── El mapa ────────────────────────────────────────────────────────────
    this.map = this.make.tilemap({ key: c.mapa });
    const tileset = this.map.addTilesetImage('Tileset_mapa', c.tileset, 16, 16);
    this.textures.get(c.tileset).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.backgroundLayer = this.map.createLayer('suelo', tileset, 0, 0);
    if (this.backgroundLayer) this.backgroundLayer.setDepth(0);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    // El agua que se mueve (gf-agua) y el suelo pintado (gf-suelo).
    if (window.GFAgua) window.GFAgua.montar(this, { capa: 'suelo', textura: c.tileset, vida: c.vidaAgua || null });
    this._montarSueloPintado('recortadas_' + c.zona, c.zona, [this.backgroundLayer]);

    // ── Colisiones y salidas ───────────────────────────────────────────────
    this.collisionRectangles = this._rectsDeCapa('colisiones');
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    this._reconstruirIndiceColisiones();
    this._salidas = (this.map.getObjectLayer('salidas') || { objects: [] }).objects.map((o) =>
      ({ nombre: o.name, rect: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height) }));
    this._salidaArmada = false;

    // ── Los árboles y los objetos (2.5D) ──────────────────────────────────
    this._montarArboles();
    this._montarObjetos();

    // ── El jugador ─────────────────────────────────────────────────────────
    let inicio = this._puntoDeAparicion();
    const viaje = window.GFViaje ? window.GFViaje.tomar(c.mundo) : null;
    if (viaje && Number.isFinite(viaje.x) && Number.isFinite(viaje.y)) inicio = { x: viaje.x, y: viaje.y };
    this.posicionplayerx = inicio.x;
    this.posicionplayery = inicio.y;
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

    if (window.GFMascota)     window.GFMascota.montar(this);
    if (window.GFMuerte)      window.GFMuerte.montar(this);
    if (window.GFViento)      window.GFViento.montar(this);
    // El cementerio, con el clima de todos (lluvia, tormenta, nieve); el
    // desierto y la tundra llevan el suyo (gf-zonas: arena y nevada).
    if (c.clima) {
      if (window.GFClima) window.GFClima.montar(this);
      if (window.GFNieve) window.GFNieve.montar(this);
    }
    if (window.GFPisadas)     window.GFPisadas.montar(this, { suelo: c.pisadas || null });
    if (window.GFAudio)       window.GFAudio.montar(this, { tipo: 'campo', zona: c.zona, texturaSuelo: c.tileset });
    if (window.GFAmigos)      window.GFAmigos.montar(this);
    if (window.GFChatSocial)  window.GFChatSocial.montar(this);
    if (window.GFNombreColor) window.GFNombreColor.montar(this);
    if (window.GFSoulbound)   window.GFSoulbound.sincronizar(this);
    if (window.GFEspada)      window.GFEspada.montar(this);
    try {
      if (window.GFCiclo) {
        window.GFCiclo.sincronizarSiHaceFalta('entrar en ' + c.zona);
        window.GFCiclo.montarEscena(this, { jugador: this.player });
      }
    } catch (e) { console.warn('🧭 ciclo día/noche:', e); }
    // Monstruos, espada entre jugadores, lo que se suelta y los carteles.
    try { if (window.GFSalvaje) window.GFSalvaje.montar(this); } catch (e) { console.warn('🧭 monstruos:', e); }
    try { if (window.GFAntorchas) window.GFAntorchas.montar(this); } catch (e) { console.warn('🧭 antorchas:', e); }
    // (2026-10-19) Los NPC de cada mapa (gf-npcs.js): el sepulturero, los
    // guardias del desierto, el trampero y la pescadora.
    try { if (window.GFNpcs) window.GFNpcs.montar(this); } catch (e) { console.warn('🧭 NPC:', e); }
    // Lo propio de cada mapa: niebla, tormenta y remolinos, nevada, luces.
    try { if (window.GFZonas) window.GFZonas.montar(this, c.zona); } catch (e) { console.warn('🧭 zona:', e); }
    try { if (c.zona === 'desierto' && window.GFCamellos) window.GFCamellos.montar(this); } catch (e) { console.warn('🧭 camellos:', e); }

    if (window.tiendaSistema) window.tiendaSistema.scene = this;
    try { this.notifications && this.notifications.show('🧭 ' + c.titulo, 'info'); } catch (e) {}
    // (2026-10-19) Se pesca en el agua de este mapa (gf-pesca.js). El agua
    // animada (gf-agua) puede tardar un momento en clasificarse: si aún no
    // está, se vuelve a probar.
    const montarPesca = (intento) => {
      if (!this.sys || !this.sys.isActive() || !window.GFPesca) return;
      if (!window.GFPesca.montar(this) && intento < 6) this.time.delayedCall(800, () => montarPesca(intento + 1));
    };
    montarPesca(0);
    console.log('🧭 ' + c.zona + ' listo');
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

  _puntoDeAparicion() {
    const capa = this.map.getObjectLayer('aparicion');
    const p = capa && capa.objects && capa.objects[0];
    if (p) return { x: p.x, y: p.y };
    return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
  }

  /** La sombra lisa de lo que está de pie (una elipse, sin tramas). */
  _texturaSombra() {
    if (this.textures.exists('zn_sombra_pie')) return;
    const c = this.textures.createCanvas('zn_sombra_pie', 96, 32);
    const x = c.getContext();
    x.save(); x.scale(1, 32 / 96);
    const g = x.createRadialGradient(48, 48, 2, 48, 48, 48);
    g.addColorStop(0, 'rgba(12,16,20,0.5)'); g.addColorStop(0.7, 'rgba(12,16,20,0.24)'); g.addColorStop(1, 'rgba(12,16,20,0)');
    x.fillStyle = g; x.beginPath(); x.arc(48, 48, 48, 0, Math.PI * 2); x.fill(); x.restore();
    c.refresh();
  }

  /** Los árboles del paquete: anclados en su base, a 1.3, con su sombra. */
  _montarArboles() {
    const c = this.cfg;
    this._arboles = [];
    this._texturaSombra();
    const capa = this.map.getObjectLayer('arboles');
    if (!capa) return;
    capa.objects.forEach((o) => {
      const clave = c.prefijo + o.name;
      if (!this.textures.exists(clave)) return;
      const spr = this.add.image(o.x, o.y, clave).setOrigin(0.5, 1).setScale(1.3).setDepth(o.y);
      spr.setData('optimized', true);
      const sombra = this.add.image(o.x + 6, o.y - 4, 'zn_sombra_pie').setScale(1.25).setDepth(2).setAlpha(0.9);
      this._arboles.push({ spr, sombra, x: o.x, y: o.y, visible: true });
    });
    this._recorteEn = 0;
  }

  /** Los objetos 2.5D: cada uno con el apoyo de su fotograma (pivot del
      atlas), a escala 2 y su sombra si la lleva. */
  _montarObjetos() {
    const c = this.cfg;
    this._objetosZona = [];
    const capa = this.map.getObjectLayer('objetos');
    if (!capa || !this.textures.exists(c.objetos)) return;
    const tex = this.textures.get(c.objetos);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    capa.objects.forEach((o) => {
      if (!tex.has(o.name)) return;
      const spr = this.add.image(o.x, o.y, c.objetos, o.name).setOriginFromFrame().setScale(2).setDepth(o.y);
      spr.setData('optimized', true);
      const prop = (o.properties || []).find((p) => p.name === 'sombra');
      const ancho = prop ? Number(prop.value) : 0;
      const sombra = ancho > 0 ? this.add.image(o.x + 4, o.y - 3, 'zn_sombra_pie').setScale(ancho / 96 * 1.15, ancho / 96).setDepth(2).setAlpha(0.85) : null;
      this._objetosZona.push({ spr, sombra, x: o.x, y: o.y, visible: true });
    });
    console.log('🧭 ' + c.zona + ': ' + this._arboles.length + ' árboles, ' + this._objetosZona.length + ' objetos');
  }

  /** Solo se muestra lo que cae cerca de la cámara (son cientos). */
  _recortarVisibles(ahora) {
    if (ahora < this._recorteEn) return;
    this._recorteEn = ahora + 250;
    const v = this.cameras.main.worldView;
    const x0 = v.x - 300, x1 = v.right + 300, y0 = v.y - 40, y1 = v.bottom + 420;
    const repasar = (lista) => {
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i];
        const ve = a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1;
        if (ve !== a.visible) {
          a.visible = ve;
          a.spr.setVisible(ve);
          if (a.sombra) a.sombra.setVisible(ve);
        }
      }
    };
    repasar(this._arboles);
    repasar(this._objetosZona);
  }

  /** ¿En la zona PvP? (la capa `zonas` del mapa) */
  enZonaPvp(x, y) {
    if (!this._zonaPvp) {
      const capa = this.map && this.map.getObjectLayer('zonas');
      const z = capa && capa.objects.find((o) => o.name === 'pvp');
      this._zonaPvp = z ? new Phaser.Geom.Rectangle(z.x, z.y, z.width, z.height) : new Phaser.Geom.Rectangle(0, 0, 0, 0);
    }
    return this._zonaPvp.contains(x, y);
  }

  // =========================================================================
  // CADA FOTOGRAMA (el del mapa salvaje)
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
      /* LA VELOCIDAD SE PONE EN CADA FOTOGRAMA (2026-10-18), como en el
         pueblo (GameScene.update). Bug: "en la tormenta de arena el personaje
         no puede escapar, y camina lento y sin animación". `loadPlayerData()`
         llega DESPUÉS de create() y copia el `speed` guardado en la partida,
         que en muchas cuentas es el de antes (2,7 píxeles por fotograma; es
         también el que pone LoadingScenegame si /api/load no trae ninguno).
         Aquí la velocidad es en píxeles por SEGUNDO: con 2,7 se andaban 3 px/s,
         el remolino (hasta 122 px/s) ganaba siempre, y el paso por fotograma
         (0,045 px) quedaba por debajo del umbral de _animarJugador (0,05):
         la animación de andar se paraba. */
      this.speed = 240;
      const seg = delta / 1000;
      // Lo que frena (la savia, el veneno: gf-salvaje.js).
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

    this._recortarVisibles(time);
    this._comprobarSalidas();
  }

  // =========================================================================
  // LA SALA Y LA SALIDA (al mapa salvaje)
  // =========================================================================
  _salaDeEscena() { return this.cfg.sala; }

  _comprobarSalidas() {
    if (!this.playerRect || !this._salidas) return;
    // Los pies O el cuerpo de física (2026-10-19): el cuerpo se para en el
    // borde del mapa antes que los pies, y la salida del desierto (arriba)
    // no se tocaba nunca. Ver SalvajeScene._comprobarSalidas.
    const b = this.player && this.player.body;
    const cuerpo = b ? (this._rectCuerpo || (this._rectCuerpo = new Phaser.Geom.Rectangle())).setTo(b.x, b.y, b.width, b.height) : null;
    let tocando = null;
    for (const s of this._salidas) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect, s.rect) ||
          (cuerpo && Phaser.Geom.Intersects.RectangleToRectangle(cuerpo, s.rect))) { tocando = s; break; }
    }
    if (!tocando) { this._salidaArmada = true; return; }
    if (!this._salidaArmada || this._cambiandoEscena) return;
    if (tocando.nombre === 'salvaje' && window.GFZonas) {
      this._salidaArmada = false;
      window.GFZonas.viajar(this, 'salvaje_desde_' + this.cfg.zona);
    }
  }

  // =========================================================================
  // APAGADO
  // =========================================================================
  _alApagar() {
    if (this._zonaCleanupDone) return;
    this._zonaCleanupDone = true;
    this._sceneStopped = true;
    const c = this.cfg;
    this.events.off('shutdown', this._alApagar, this);
    this.events.off('destroy', this._alApagar, this);
    try { if (window.GFZonas) window.GFZonas.desmontar(this); } catch (e) {}
    try { if (window.GFSalvaje) window.GFSalvaje.desmontar(this); } catch (e) {}
    try { this.cleanupScene(); } catch (e) { console.warn('limpieza de ' + c.zona + ':', e); }
    console.log('🧭 apagando ' + c.zona);
    [].concat(this._arboles || [], this._objetosZona || []).forEach((a) => {
      try { a.spr.destroy(); if (a.sombra) a.sombra.destroy(); } catch (e) {}
    });
    this._arboles = [];
    this._objetosZona = [];
    try { if (this.backgroundLayer) this.backgroundLayer.destroy(); } catch (e) {}
    try { if (this.map) this.map.destroy(); } catch (e) {}
    this.map = null;
    this.backgroundLayer = null;
    this._zonaPvp = null;
    this.collisionRectangles = [];
    this.collisionRectangles1 = [];
    this.collisionRectangles2 = [];
    // Las texturas de este mapa: fuera de aquí no pintan nada en la memoria de
    // vídeo (y los fotogramas del agua animada que gf-agua dejó hechos).
    const delAgua = this.textures.getTextureKeys().filter((k) => k.indexOf('gfa_' + c.tileset + '_') === 0);
    [c.tileset, c.objetos].concat(c.arboles.map((n) => c.prefijo + n), delAgua).forEach((k) => {
      try { if (this.textures.exists(k)) this.textures.remove(k); } catch (e) {}
    });
    try { if (this.cache.tilemap.exists(c.mapa)) this.cache.tilemap.remove(c.mapa); } catch (e) {}
    try { this._unbindAllDomClicks(); } catch (e) {}
  }
}

// ── LOS TRES MAPAS ──────────────────────────────────────────────────────────
function cfgZona(zona, extra) {
  return Object.assign({
    zona,
    tileset: 'tiles_' + zona,
    mapa: 'tilemap_' + zona,
    objetos: zona + '_objetos',
    prefijo: zona + '_arbol_'
  }, extra);
}

// eslint-disable-next-line no-unused-vars
class CementerioScene extends ZonaScene {
  static get CFG() {
    return CementerioScene._cfg || (CementerioScene._cfg = cfgZona('cementerio', {
      escena: 'CementerioScene', mundo: 7, sala: 'cementerio', titulo: 'Cemetery of Lost Souls — PvP everywhere!',
      arboles: ['seco', 'seco_ceniza'], vidaAgua: 'rio', pisadas: null, clima: true
    }));
  }
  constructor() { super('CementerioScene'); }
}

// eslint-disable-next-line no-unused-vars
class DesiertoScene extends ZonaScene {
  static get CFG() {
    return DesiertoScene._cfg || (DesiertoScene._cfg = cfgZona('desierto', {
      escena: 'DesiertoScene', mundo: 8, sala: 'desierto', titulo: 'Scorching Desert — beware the sand whirls',
      arboles: ['palmera_abanico', 'palmera_cocotera'], vidaAgua: 'rio', pisadas: 'arena', clima: false
    }));
  }
  constructor() { super('DesiertoScene'); }
}

// eslint-disable-next-line no-unused-vars
class TundraScene extends ZonaScene {
  static get CFG() {
    return TundraScene._cfg || (TundraScene._cfg = cfgZona('tundra', {
      escena: 'TundraScene', mundo: 9, sala: 'tundra', titulo: 'Frostfang Tundra',
      arboles: ['abeto_nevado', 'pino_nevado', 'seco_nevado'], vidaAgua: null, pisadas: 'nieve', clima: false
    }));
  }
  constructor() { super('TundraScene'); }
}

window.ZonaScene = ZonaScene;
window.CementerioScene = CementerioScene;
window.DesiertoScene = DesiertoScene;
window.TundraScene = TundraScene;
