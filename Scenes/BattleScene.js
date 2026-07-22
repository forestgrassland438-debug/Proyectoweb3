/*!
 * BattleScene — Batallas P2P de mascotas (Grassland Forest)
 * ---------------------------------------------------------------------------
 * Combate por TURNOS contra otro jugador real. El servidor es la autoridad:
 * esta escena solo dibuja lo que llega por socket y manda la acción elegida.
 * Eventos usados (ver server2.js, sección "SISTEMA DE BATALLAS P2P"):
 *
 *   → battle:queue / battle:leaveQueue / battle:action / battle:forfeit
 *   ← battle:queued, battle:matched, battle:turnStart, battle:rivalReady,
 *     battle:turn, battle:end, battle:error
 *
 * El fondo del campo de batalla se carga de ./Game/Objetos/fondo_batalla.png.
 * Si ese archivo no existe todavía, se dibuja un degradado de respaldo para
 * que la escena siga siendo jugable (ver crearFondo()).
 */
class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data) {
    this.datosJugador = {
      playerName: (data && data.playerName) || '---',
      petName: (data && data.petName) || '---',
      address: (data && data.address) || '',
      nivel: (data && data.nivel) || 1
    };
    this.serverBase = (data && data.serverBase) || '';
    this.volverA = (data && data.volverA) || 'LoadingScenegame';
    this.modo = (data && data.modo) === 'bot' ? 'bot' : 'pvp';

    this.estado = 'buscando';   // buscando | combate | fin
    this.matchId = null;
    this.yo = null;
    this.rival = null;
    this.puedeElegir = false;
    this._listeners = [];
  }

  preload() {
    // El fondo puede no estar todavía: se controla el fallo de carga en vez de
    // dejar que Phaser reviente la escena entera.
    this.load.image('fondo_batalla', './Game/Objetos/fondo_batalla.png');
    this.load.on('loaderror', (file) => {
      if (file && file.key === 'fondo_batalla') {
        console.warn('⚠️ Falta ./Game/Objetos/fondo_batalla.png — se usará un fondo de respaldo');
        this._sinFondo = true;
      }
    });
  }

  create() {
    const { width, height } = this.scale;

    this.crearFondo(width, height);
    this.crearUI(width, height);
    this.avisoHorizontal();

    this.socket = window.globalSocket;
    if (!this.socket || !this.socket.connected) {
      this.mostrarEstado('No connection to the server.', true);
      this.time.delayedCall(2500, () => this.volverAlMapa());
      return;
    }

    this.registrarSocket();

    if (this.modo === 'bot') {
      this.mostrarEstado('Preparing your daily battle…', true);
      this.socket.emit('battle:bot');
    } else {
      this.socket.emit('battle:queue');
      // Contador visible mientras se espera rival, para que nunca parezca
      // que el juego se quedó colgado.
      this._segundosBuscando = 0;
      this._timerBusqueda = this.time.addEvent({
        delay: 1000, loop: true,
        callback: () => {
          if (this.estado !== 'buscando') return;
          this._segundosBuscando++;
          this.mostrarEstado(
            `Searching for an opponent…  ${this._segundosBuscando}s\n\nYou can leave with the button below.`,
            true
          );
        }
      });
    }

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.limpiar());
  }

  // ---------------------------------------------------------------------------
  // FONDO
  // ---------------------------------------------------------------------------
  crearFondo(width, height) {
    if (!this._sinFondo && this.textures.exists('fondo_batalla')) {
      this.fondo = this.add.image(width / 2, height / 2, 'fondo_batalla')
        .setDepth(0);
      this.ajustarFondo(width, height);
    } else {
      // Respaldo: cielo + suelo dibujados, para no depender del asset
      const g = this.add.graphics().setDepth(0);
      g.fillGradientStyle(0x7ec8f2, 0x7ec8f2, 0xcfe9f7, 0xcfe9f7, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0xe4d3a8, 1);
      g.fillRect(0, height * 0.62, width, height * 0.38);
      this.fondoRespaldo = g;
    }
  }

  ajustarFondo(width, height) {
    if (!this.fondo) return;
    // "cover": llena la pantalla sin deformar la imagen
    const escala = Math.max(width / this.fondo.width, height / this.fondo.height);
    this.fondo.setScale(escala).setPosition(width / 2, height / 2);
  }

  // ---------------------------------------------------------------------------
  // INTERFAZ
  // ---------------------------------------------------------------------------
  crearUI(width, height) {
    const estiloNombre = {
      fontFamily: '"PressStart2P"', fontSize: '12px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 5, resolution: 2
    };
    const estiloDir = {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe9a8',
      stroke: '#000000', strokeThickness: 4
    };

    // ----- Tarjeta del jugador (izquierda) -----
    this.uiYo = {
      nombre: this.add.text(20, 20, '', estiloNombre).setDepth(10),
      dir: this.add.text(20, 40, '', estiloDir).setDepth(10),
      barraFondo: this.add.rectangle(20, 62, 220, 16, 0x000000, 0.55).setOrigin(0, 0).setDepth(10),
      barra: this.add.rectangle(22, 64, 216, 12, 0x54d67d).setOrigin(0, 0).setDepth(11),
      hp: this.add.text(20, 82, '', estiloDir).setDepth(11),
      pet: null
    };

    // ----- Tarjeta del rival (derecha) -----
    this.uiRival = {
      nombre: this.add.text(width - 20, 20, '', { ...estiloNombre }).setOrigin(1, 0).setDepth(10),
      dir: this.add.text(width - 20, 40, '', { ...estiloDir }).setOrigin(1, 0).setDepth(10),
      barraFondo: this.add.rectangle(width - 20, 62, 220, 16, 0x000000, 0.55).setOrigin(1, 0).setDepth(10),
      barra: this.add.rectangle(width - 22, 64, 216, 12, 0xe4655f).setOrigin(1, 0).setDepth(11),
      hp: this.add.text(width - 20, 82, '', { ...estiloDir }).setOrigin(1, 0).setDepth(11),
      pet: null
    };

    // ----- Mascotas -----
    // Las texturas del perro las carga GameScene y el TextureManager es
    // compartido por todo el juego, así que aquí ya existen. Aun así se
    // comprueba: si faltaran, se dibuja un cuadro de color en vez de romper
    // la escena con la textura verde de "missing".
    const sueloY = height * 0.72;
    const crearPet = (x, texturaKey, color) => (
      this.textures.exists(texturaKey)
        ? this.add.sprite(x, sueloY, texturaKey).setScale(3).setDepth(5)
        : this.add.rectangle(x, sueloY, 64, 64, color).setDepth(5)
    );
    this.uiYo.pet = crearPet(width * 0.28, 'perro_derecha_1', 0x54d67d);
    this.uiRival.pet = crearPet(width * 0.72, 'perro_izquierda_1', 0xe4655f);

    // ----- Mensaje central de estado -----
    this.txtEstado = this.add.text(width / 2, height * 0.42, 'Searching for an opponent…', {
      fontFamily: '"PressStart2P"', fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 6, align: 'center',
      wordWrap: { width: width * 0.8 }
    }).setOrigin(0.5).setDepth(20);

    // ----- Registro del combate -----
    this.txtLog = this.add.text(width / 2, height * 0.53, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4, align: 'center',
      wordWrap: { width: width * 0.9 }
    }).setOrigin(0.5).setDepth(20);

    // ----- Botones de acción -----
    this.botones = [];
    const acciones = [
      { id: 'attack', txt: 'ATTACK',  color: 0x3f7fd4 },
      { id: 'strong', txt: 'HEAVY',   color: 0xc0563f },
      { id: 'defend', txt: 'DEFEND',  color: 0x4a8c5a }
    ];
    acciones.forEach((a, i) => {
      const btn = this.crearBoton(a, i, acciones.length, width, height);
      this.botones.push(btn);
    });
    this.mostrarBotones(false);

    // ----- Salir / rendirse -----
    this.btnSalir = this.add.text(width / 2, height - 18, 'Leave battle', {
      fontFamily: '"PressStart2P"', fontSize: '10px', color: '#ffdddd',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(20).setInteractive({ useHandCursor: true });
    this.btnSalir.on('pointerdown', () => this.rendirse());
  }

  crearBoton(accion, indice, total, width, height) {
    const ancho = Math.min(180, width / (total + 1));
    const alto = 46;
    const separacion = 12;
    const totalAncho = total * ancho + (total - 1) * separacion;
    const x = width / 2 - totalAncho / 2 + indice * (ancho + separacion) + ancho / 2;
    const y = height - 80;

    const fondo = this.add.rectangle(x, y, ancho, alto, accion.color, 0.92)
      .setStrokeStyle(3, 0x000000).setDepth(25).setInteractive({ useHandCursor: true });
    const texto = this.add.text(x, y, accion.txt, {
      fontFamily: '"PressStart2P"', fontSize: '11px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(26);

    fondo.on('pointerover', () => fondo.setScale(1.05));
    fondo.on('pointerout', () => fondo.setScale(1));
    fondo.on('pointerdown', () => this.elegirAccion(accion.id));

    return { id: accion.id, fondo, texto, ancho, alto };
  }

  mostrarBotones(visible) {
    this.botones.forEach(b => {
      b.fondo.setVisible(visible);
      b.texto.setVisible(visible);
      if (visible) b.fondo.setInteractive({ useHandCursor: true });
      else b.fondo.disableInteractive();
    });
  }

  mostrarEstado(txt, permanente = false) {
    if (!this.txtEstado) return;
    this.txtEstado.setText(txt);
    this.txtEstado.setVisible(true);
    if (!permanente) {
      this.time.delayedCall(1800, () => {
        if (this.estado === 'combate' && this.txtEstado) this.txtEstado.setVisible(false);
      });
    }
  }

  // Aviso para móviles en vertical: se pide girar el teléfono
  avisoHorizontal() {
    const aviso = document.getElementById('battleRotateNotice');
    if (!aviso) return;

    const esMovil = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints || 0) > 1;

    const revisar = () => {
      const vertical = window.innerHeight > window.innerWidth;
      const activo = this.scene.isActive('BattleScene');
      aviso.classList.toggle('hidden', !(esMovil && vertical && activo));
    };

    this._revisarOrientacion = revisar;
    window.addEventListener('resize', revisar);
    window.addEventListener('orientationchange', revisar);
    revisar();
  }

  // ---------------------------------------------------------------------------
  // SOCKET
  // ---------------------------------------------------------------------------
  on(evento, manejador) {
    this.socket.on(evento, manejador);
    this._listeners.push([evento, manejador]);
  }

  registrarSocket() {
    this.on('battle:queued', (d) => {
      this.mostrarEstado(`Searching for an opponent…\n(position ${d.position} in queue)`, true);
    });

    this.on('battle:matched', (d) => {
      this.matchId = d.matchId;
      this.estado = 'combate';
      this.yo = d.you;
      this.rival = d.rival;
      if (this._timerBusqueda) { this._timerBusqueda.remove(); this._timerBusqueda = null; }
      this.pintarJugadores();

      const cabecera = d.mode === 'bot'
        ? `DAILY BATTLE ${d.round}/5\n${d.you.petName}  VS  ${d.rival.petName}`
        : `${d.you.petName}  VS  ${d.rival.petName}`;
      this.mostrarEstado(cabecera, true);
    });

    this.on('battle:turnStart', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.pintarJugadores();
      this.puedeElegir = true;
      this.mostrarBotones(true);
      this.mostrarEstado(`Turn ${d.turn} — choose your move`, true);
    });

    this.on('battle:rivalReady', () => {
      if (this.puedeElegir) this.mostrarEstado('The rival already chose. Your move!', true);
    });

    this.on('battle:turn', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.puedeElegir = false;
      this.mostrarBotones(false);
      this.pintarJugadores();
      if (this.txtLog) this.txtLog.setText(d.log || '');
      this.animarGolpe(d.damageToRival > 0, d.damageToYou > 0);
      if (this.txtEstado) this.txtEstado.setVisible(false);
    });

    this.on('battle:end', (d) => {
      this.estado = 'fin';
      this.puedeElegir = false;
      this.mostrarBotones(false);
      this.yo = d.you;
      this.rival = d.rival;
      this.pintarJugadores();

      const titulo = d.result === 'win' ? '🏆 YOU WIN!'
        : d.result === 'lose' ? '💀 YOU LOSE'
        : '🤝 DRAW';
      const motivo = d.reason === 'forfeit' ? '\n(the rival left the battle)' : '';
      const diarias = d.daily
        ? `\nDaily battles: ${d.daily.done}/${d.daily.max}`
        : '';
      this.mostrarEstado(
        `${titulo}\n+${d.pointsEarned} points${motivo}${diarias}\n\nBack to the map…`,
        true
      );

      this.time.delayedCall(3500, () => this.volverAlMapa());
    });

    this.on('battle:error', (d) => {
      let msg = 'Could not start the battle.';
      if (d && d.error === 'not_authenticated') msg = 'You must be logged in to battle.';
      else if (d && d.error === 'already_in_battle') msg = 'You are already in a battle.';
      else if (d && d.error === 'daily_limit') {
        msg = `You already played your ${d.daily ? d.daily.max : 5} daily battles.\nCome back tomorrow!`;
      }
      this.mostrarEstado(msg, true);
      this.time.delayedCall(3000, () => this.volverAlMapa());
    });
  }

  elegirAccion(accion) {
    if (!this.puedeElegir || this.estado !== 'combate') return;
    this.puedeElegir = false;
    this.mostrarBotones(false);
    this.socket.emit('battle:action', { action: accion });
    this.mostrarEstado('Waiting for the rival…', true);
  }

  rendirse() {
    if (this.estado === 'combate' && this.socket) {
      this.socket.emit('battle:forfeit');
    } else {
      if (this.socket) this.socket.emit('battle:leaveQueue');
      this.volverAlMapa();
    }
  }

  // ---------------------------------------------------------------------------
  // PINTADO
  // ---------------------------------------------------------------------------
  pintarJugadores() {
    if (this.yo) {
      this.uiYo.nombre.setText(`${this.yo.petName}  (Lv.${this.yo.level})`);
      this.uiYo.dir.setText(`${this.yo.playerName} · ${this.yo.addressShort || '—'}`);
      this.uiYo.hp.setText(`${this.yo.hp}/${this.yo.maxHp} HP`);
      const p = Math.max(0, this.yo.hp / this.yo.maxHp);
      this.uiYo.barra.width = 216 * p;
    }
    if (this.rival) {
      this.uiRival.nombre.setText(`${this.rival.petName}  (Lv.${this.rival.level})`);
      this.uiRival.dir.setText(`${this.rival.playerName} · ${this.rival.addressShort || '—'}`);
      this.uiRival.hp.setText(`${this.rival.hp}/${this.rival.maxHp} HP`);
      const p = Math.max(0, this.rival.hp / this.rival.maxHp);
      this.uiRival.barra.width = 216 * p;
    }
  }

  animarGolpe(peguéYo, pegóRival) {
    const sacudir = (sprite) => {
      if (!sprite) return;
      this.tweens.add({
        targets: sprite, x: sprite.x + 14, duration: 70, yoyo: true, repeat: 2,
        onComplete: () => { sprite.setTint(0xffffff); sprite.clearTint(); }
      });
      sprite.setTint(0xff8888);
      this.time.delayedCall(320, () => sprite.clearTint());
    };
    if (peguéYo) sacudir(this.uiRival.pet);
    if (pegóRival) sacudir(this.uiYo.pet);
  }

  onResize(gameSize) {
    const { width, height } = gameSize;
    this.ajustarFondo(width, height);
    if (this._revisarOrientacion) this._revisarOrientacion();
  }

  // ---------------------------------------------------------------------------
  // SALIDA
  // ---------------------------------------------------------------------------
  volverAlMapa() {
    if (this._volviendo) return;
    this._volviendo = true;
    this.limpiar();
    this.scene.start(this.volverA, { desdeBatalla: true });
  }

  limpiar() {
    if (this._timerBusqueda) { this._timerBusqueda.remove(); this._timerBusqueda = null; }
    try {
      if (this.socket) {
        this._listeners.forEach(([ev, fn]) => this.socket.off(ev, fn));
        this._listeners = [];
        if (this.estado === 'buscando') this.socket.emit('battle:leaveQueue');
      }
    } catch (e) { /* sin ruido al salir */ }

    const aviso = document.getElementById('battleRotateNotice');
    if (aviso) aviso.classList.add('hidden');
    if (this._revisarOrientacion) {
      window.removeEventListener('resize', this._revisarOrientacion);
      window.removeEventListener('orientationchange', this._revisarOrientacion);
      this._revisarOrientacion = null;
    }
    this.scale.off('resize', this.onResize, this);
  }
}

// Registro para app.js (mismo mecanismo que el resto de escenas)
if (typeof window !== 'undefined') {
  window.BattleScene = BattleScene;
  try {
    if (window.__secureSceneRegistry instanceof Map) {
      window.__secureSceneRegistry.set('BattleScene', BattleScene);
    }
  } catch (e) { /* registro opcional */ }
}
