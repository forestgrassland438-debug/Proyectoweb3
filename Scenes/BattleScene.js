/*!
 * BattleScene — Batallas de mascotas por CARTAS y turnos (Grassland Forest)
 * ---------------------------------------------------------------------------
 * Phaser dibuja SOLO el escenario (fondo + las dos mascotas). Toda la interfaz
 * (marcadores, vida, mano de cartas, energía, botones) es HTML/CSS —
 * #battleUI en game.html / index.html, estilos en styless.css— para que se
 * adapte igual a PC y a teléfonos.
 *
 * El servidor es la autoridad: reparte la mano, valida la energía y calcula el
 * daño. El cliente solo manda los índices de las cartas que juega.
 *
 * Eventos (ver server2.js, "SISTEMA DE BATALLAS P2P"):
 *   → battle:queue | battle:bot | battle:action {cards:[índices]} | battle:forfeit
 *   ← battle:queued, battle:matched, battle:turnStart {hand,energy},
 *     battle:rivalReady, battle:turn, battle:end, battle:error
 *
 * El fondo se busca en varias rutas (ver preload): en cuanto exista el archivo
 * se usa; mientras tanto se dibuja un degradado de respaldo.
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
    this.mano = [];
    this.energiaMax = 3;
    this.seleccion = [];        // índices de cartas elegidas
    this.puedeJugar = false;
    this._listeners = [];
    this._buscandoIniciado = false;
  }

  preload() {
    // Se prueban varias rutas: así vale tanto si guardas la imagen en
    // Game/Objetos como en assets o en Game/FONDO.
    this._rutasFondo = [
      './Game/Objetos/fondo_batalla.png',
      './assets/fondo_batalla.png',
      './Game/FONDO/fondo_batalla.png'
    ];
    this.load.image('fondo_batalla', this._rutasFondo[0]);

    this._intentoFondo = 0;
    this.load.on('loaderror', (file) => {
      if (!file || file.key !== 'fondo_batalla') return;
      this._intentoFondo++;
      if (this._intentoFondo < this._rutasFondo.length) {
        // Reintentar con la siguiente ruta ANTES de que termine el preload
        this.load.image('fondo_batalla', this._rutasFondo[this._intentoFondo]);
        this.load.start();
      } else {
        console.warn('⚠️ No se encontró fondo_batalla.png en ninguna ruta; se usa el fondo de respaldo');
        this._sinFondo = true;
      }
    });
  }

  create() {
    const { width, height } = this.scale;

    document.body.classList.add('in-battle');   // oculta el HUD del mapa
    this.crearEscenario(width, height);
    this.montarUI();
    this.avisoHorizontal();

    this.socket = window.globalSocket;
    if (!this.socket) {
      this.estadoTexto('No connection to the server.');
      this.time.delayedCall(2500, () => this.volverAlMapa());
      return;
    }

    // GameScene desconecta este mismo socket global al salir del mapa
    // (cleanupScene → socket.disconnect), así que aquí suele llegar caído.
    if (this.socket.connected) {
      this.arrancarBusqueda();
    } else {
      this.estadoTexto('Connecting to the server…');
      this.socket.connect();

      const alConectar = () => {
        if (this._conexionTimeout) { this._conexionTimeout.remove(); this._conexionTimeout = null; }
        this.arrancarBusqueda();
      };
      this.socket.once('connect', alConectar);

      this._conexionTimeout = this.time.delayedCall(10000, () => {
        if (this.matchId) return;
        this.socket.off('connect', alConectar);
        this.estadoTexto('Could not reach the server.\nBack to the map…');
        this.time.delayedCall(2000, () => this.volverAlMapa());
      });
    }

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.limpiar());
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO (lo único que dibuja Phaser)
  // ---------------------------------------------------------------------------
  crearEscenario(width, height) {
    if (!this._sinFondo && this.textures.exists('fondo_batalla')) {
      this.fondo = this.add.image(width / 2, height / 2, 'fondo_batalla').setDepth(0);
      this.ajustarFondo(width, height);
    } else {
      const g = this.add.graphics().setDepth(0);
      g.fillGradientStyle(0x7ec8f2, 0x7ec8f2, 0xcfe9f7, 0xcfe9f7, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0xe4d3a8, 1);
      g.fillRect(0, height * 0.62, width, height * 0.38);
      this.fondoRespaldo = g;
    }

    const sueloY = height * 0.70;
    const crearPet = (x, texturaKey, color) => (
      this.textures.exists(texturaKey)
        ? this.add.sprite(x, sueloY, texturaKey).setScale(3).setDepth(5)
        : this.add.rectangle(x, sueloY, 64, 64, color).setDepth(5)
    );
    this.petYo = crearPet(width * 0.26, 'perro_derecha_1', 0x54d67d);
    this.petRival = crearPet(width * 0.74, 'perro_izquierda_1', 0xe4655f);
  }

  ajustarFondo(width, height) {
    if (!this.fondo) return;
    const escala = Math.max(width / this.fondo.width, height / this.fondo.height);
    this.fondo.setScale(escala).setPosition(width / 2, height / 2);
  }

  // ---------------------------------------------------------------------------
  // INTERFAZ HTML
  // ---------------------------------------------------------------------------
  montarUI() {
    this.ui = document.getElementById('battleUI');
    if (!this.ui) {
      console.error('❌ Falta #battleUI en el HTML');
      return;
    }
    this.ui.classList.remove('hidden');

    this.el = {
      status: document.getElementById('bfStatus'),
      turno: document.getElementById('bfTurnLabel'),
      timer: document.getElementById('bfTimer'),
      timerFill: document.getElementById('bfTimerFill'),
      timerText: document.getElementById('bfTimerText'),
      hand: document.getElementById('bfHand'),
      energy: document.getElementById('bfEnergy'),
      energyCount: document.getElementById('bfEnergyCount'),
      endTurn: document.getElementById('bfEndTurn'),
      leave: document.getElementById('bfLeave'),
      reveal: document.getElementById('bfReveal'),
      revealYou: document.getElementById('bfRevealYou'),
      revealRival: document.getElementById('bfRevealRival'),
      floaters: document.getElementById('bfFloaters'),
      you: {
        name: document.getElementById('bfYouName'),
        lvl: document.getElementById('bfYouLvl'),
        player: document.getElementById('bfYouPlayer'),
        addr: document.getElementById('bfYouAddr'),
        portrait: document.getElementById('bfYouPortrait'),
        hp: document.getElementById('bfYouHp'),
        hpTxt: document.getElementById('bfYouHpTxt'),
        shield: document.getElementById('bfYouShield'),
        shieldBar: document.getElementById('bfYouShieldBar')
      },
      rival: {
        name: document.getElementById('bfRivalName'),
        lvl: document.getElementById('bfRivalLvl'),
        player: document.getElementById('bfRivalPlayer'),
        addr: document.getElementById('bfRivalAddr'),
        portrait: document.getElementById('bfRivalPortrait'),
        hp: document.getElementById('bfRivalHp'),
        hpTxt: document.getElementById('bfRivalHpTxt'),
        shield: document.getElementById('bfRivalShield'),
        shieldBar: document.getElementById('bfRivalShieldBar')
      }
    };

    // Los botones se recablean en cada entrada a la escena, así que se
    // reemplazan por clones para no acumular listeners de partidas anteriores.
    const recablear = (el, fn) => {
      if (!el) return null;
      const nuevo = el.cloneNode(true);
      el.parentNode.replaceChild(nuevo, el);
      nuevo.addEventListener('click', fn);
      return nuevo;
    };

    this.el.endTurn = recablear(this.el.endTurn, () => this.jugarTurno());
    this.el.leave = recablear(this.el.leave, () => this.rendirse());

    if (this.el.reveal) this.el.reveal.classList.add('hidden');
    this.limpiarMano();
    this.pintarEnergia(0);
  }

  estadoTexto(txt) {
    if (this.el && this.el.status) this.el.status.textContent = txt;
  }

  limpiarMano() {
    if (this.el && this.el.hand) this.el.hand.textContent = '';
    this.seleccion = [];
    if (this.el && this.el.endTurn) this.el.endTurn.disabled = true;
  }

  // ---- Temporizador de turno (barra + segundos, debajo del número de turno) ----
  iniciarTemporizador(ms) {
    this.detenerTemporizador();
    if (!this.el || !this.el.timer) return;
    const total = Math.max(1000, ms || 20000);
    this._turnDeadline = Date.now() + total;

    const tick = () => {
      const restante = Math.max(0, this._turnDeadline - Date.now());
      const frac = restante / total;
      if (this.el.timerFill) this.el.timerFill.style.width = (frac * 100) + '%';
      if (this.el.timerText) this.el.timerText.textContent = Math.ceil(restante / 1000) + 's';
      if (this.el.timer) this.el.timer.classList.toggle('low', frac < 0.25);
      if (restante <= 0) this.detenerTemporizador();
    };
    tick();
    this._timerTurno = this.time.addEvent({ delay: 200, loop: true, callback: tick });
  }

  detenerTemporizador() {
    if (this._timerTurno) { this._timerTurno.remove(); this._timerTurno = null; }
    if (this.el && this.el.timerText) this.el.timerText.textContent = '';
    if (this.el && this.el.timerFill) this.el.timerFill.style.width = '0%';
    if (this.el && this.el.timer) this.el.timer.classList.remove('low');
  }

  pintarEnergia(gastada) {
    if (!this.el || !this.el.energy) return;
    this.el.energy.textContent = '';
    for (let i = 0; i < this.energiaMax; i++) {
      const pip = document.createElement('i');
      if (i < this.energiaMax - gastada) pip.className = 'on';
      this.el.energy.appendChild(pip);
    }
    if (this.el.energyCount) this.el.energyCount.textContent = `${this.energiaMax - gastada} / ${this.energiaMax}`;
  }

  energiaGastada() {
    return this.seleccion.reduce((t, i) => t + (this.mano[i] ? this.mano[i].cost : 0), 0);
  }

  // Construye una carta del DOM a partir de los datos del servidor
  _crearCartaDOM(carta) {
    const btn = document.createElement('button');
    btn.className = 'bf-cardbtn';
    btn.type = 'button';
    btn.dataset.type = carta.type || 'attack';

    const coste = document.createElement('span');
    coste.className = 'c-cost';
    coste.textContent = carta.cost;

    const emoji = document.createElement('span');
    emoji.className = 'c-emoji';
    emoji.textContent = carta.emoji || '⚔';

    const nombre = document.createElement('span');
    nombre.className = 'c-name';
    nombre.textContent = carta.name;

    // Valores reales calculados por el servidor (según el ataque de la mascota)
    const stats = document.createElement('span');
    stats.className = 'c-stats';
    if (carta.dmg) { const s = document.createElement('span'); s.className = 's-dmg'; s.textContent = `⚔ ${carta.dmg}`; stats.appendChild(s); }
    if (carta.shield) { const s = document.createElement('span'); s.className = 's-shield'; s.textContent = `🛡 ${carta.shield}`; stats.appendChild(s); }
    if (carta.heal) { const s = document.createElement('span'); s.className = 's-heal'; s.textContent = `💚 ${carta.heal}`; stats.appendChild(s); }

    const desc = document.createElement('span');
    desc.className = 'c-desc';
    desc.textContent = carta.desc || '';

    btn.append(coste, emoji, nombre, stats, desc);
    return btn;
  }

  pintarMano() {
    if (!this.el || !this.el.hand) return;
    this.el.hand.textContent = '';

    this.mano.forEach((carta, i) => {
      const btn = this._crearCartaDOM(carta);
      btn.style.animationDelay = (i * 60) + 'ms';
      btn.addEventListener('click', () => this.alternarCarta(i, btn));
      this.el.hand.appendChild(btn);
    });

    this.refrescarMano();
  }

  alternarCarta(indice, btn) {
    if (!this.puedeJugar) return;

    const pos = this.seleccion.indexOf(indice);
    if (pos >= 0) {
      this.seleccion.splice(pos, 1);
    } else {
      const coste = this.mano[indice].cost;
      if (this.energiaGastada() + coste > this.energiaMax) return; // no hay energía
      this.seleccion.push(indice);
    }
    this.refrescarMano();
  }

  // Marca las elegidas y desactiva las que ya no caben en la energía restante
  refrescarMano() {
    if (!this.el || !this.el.hand) return;
    const gastada = this.energiaGastada();
    const restante = this.energiaMax - gastada;

    Array.from(this.el.hand.children).forEach((btn, i) => {
      const elegida = this.seleccion.includes(i);
      btn.classList.toggle('sel', elegida);
      btn.disabled = !this.puedeJugar || (!elegida && this.mano[i].cost > restante);
    });

    this.pintarEnergia(gastada);
    if (this.el.endTurn) this.el.endTurn.disabled = !this.puedeJugar;
  }

  pintarLuchadores() {
    if (!this.el) return;

    const pinta = (destino, datos) => {
      if (!datos) return;
      destino.name.textContent = datos.petName || '—';
      destino.lvl.textContent = `(Lv.${datos.level})`;
      destino.player.textContent = datos.playerName || '';
      destino.addr.textContent = datos.addressShort || (datos.isBot ? 'BOT' : '');
      if (destino.portrait) destino.portrait.textContent = datos.isBot ? '🤖' : '🐾';
      const p = Math.max(0, Math.min(1, datos.hp / datos.maxHp));
      destino.hp.style.width = (p * 100) + '%';
      destino.hpTxt.textContent = `${datos.hp}/${datos.maxHp} HP`;
    };

    pinta(this.el.you, this.yo);
    pinta(this.el.rival, this.rival);
  }

  mostrarEscudos(tuyo, rival) {
    if (!this.el) return;
    const pinta = (destino, datos, escudo) => {
      destino.shield.textContent = escudo > 0 ? `🛡️ ${escudo}` : '';
      if (destino.shieldBar && datos) {
        const frac = Math.max(0, Math.min(1, escudo / datos.maxHp));
        destino.shieldBar.style.width = (frac * 100) + '%';
      }
    };
    pinta(this.el.you, this.yo, tuyo);
    pinta(this.el.rival, this.rival, rival);
  }

  // Muestra las cartas jugadas por ambos, en el centro, y se va sola en ~2.2s
  mostrarReveal(tusCartas, cartasRival) {
    if (!this.el || !this.el.reveal) return;
    const llenar = (cont, cartas) => {
      if (!cont) return;
      cont.textContent = '';
      if (!cartas || !cartas.length) {
        const mini = document.createElement('div');
        mini.className = 'bf-mini';
        mini.innerHTML = '<div class="m-emoji">💤</div><div class="m-name">Pass</div>';
        cont.appendChild(mini);
        return;
      }
      cartas.forEach((c, i) => {
        const mini = document.createElement('div');
        mini.className = 'bf-mini';
        mini.style.animationDelay = (i * 90) + 'ms';
        const e = document.createElement('div'); e.className = 'm-emoji'; e.textContent = c.emoji || '⚔';
        const n = document.createElement('div'); n.className = 'm-name'; n.textContent = c.name || '';
        mini.append(e, n);
        cont.appendChild(mini);
      });
    };
    llenar(this.el.revealYou, tusCartas);
    llenar(this.el.revealRival, cartasRival);

    this.el.reveal.classList.remove('hidden', 'out');
    // forzar reinicio de la animación de entrada
    void this.el.reveal.offsetWidth;

    if (this._revealTimer) this._revealTimer.remove();
    this._revealTimer = this.time.delayedCall(2200, () => {
      if (!this.el || !this.el.reveal) return;
      this.el.reveal.classList.add('out');
      this.time.delayedCall(350, () => { if (this.el && this.el.reveal) this.el.reveal.classList.add('hidden'); });
    });
  }

  // Número flotante (daño/cura/escudo) sobre la mascota indicada
  flotarNumero(texto, clase, lado) {
    if (!this.el || !this.el.floaters) return;
    const f = document.createElement('div');
    f.className = 'bf-float ' + (clase || 'dmg');
    f.textContent = texto;
    // 'you' a la izquierda-abajo, 'rival' a la derecha-abajo (donde están las mascotas)
    f.style.left = (lado === 'rival' ? 72 : 24) + '%';
    f.style.top = '58%';
    this.el.floaters.appendChild(f);
    this.time.delayedCall(1150, () => f.remove());
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

  arrancarBusqueda() {
    if (this._buscandoIniciado) return;
    this._buscandoIniciado = true;

    this.registrarSocket();

    if (this.modo === 'bot') {
      this.estadoTexto('Preparing your daily battle…');
      this.socket.emit('battle:bot');
      return;
    }

    this.socket.emit('battle:queue');
    this._segundosBuscando = 0;
    this._timerBusqueda = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.estado !== 'buscando') return;
        this._segundosBuscando++;
        this.estadoTexto(`Searching for an opponent…  ${this._segundosBuscando}s`);
      }
    });
  }

  registrarSocket() {
    this.on('battle:queued', (d) => {
      this.estadoTexto(`Searching for an opponent…\n(position ${d.position} in queue)`);
    });

    this.on('battle:matched', (d) => {
      this.matchId = d.matchId;
      this.estado = 'combate';
      this.yo = d.you;
      this.rival = d.rival;
      if (this._timerBusqueda) { this._timerBusqueda.remove(); this._timerBusqueda = null; }
      this.pintarLuchadores();
      this.estadoTexto(d.mode === 'bot'
        ? `DAILY BATTLE ${d.round}/5\n${d.you.petName} vs ${d.rival.petName}`
        : `${d.you.petName} vs ${d.rival.petName}`);
      if (this.el && this.el.turno) this.el.turno.textContent = 'VS';
    });

    this.on('battle:turnStart', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.mano = d.hand || [];
      this.energiaMax = d.energy || 3;
      this.seleccion = [];
      this.puedeJugar = true;

      this.pintarLuchadores();
      this.mostrarEscudos(0, 0);
      this.pintarMano();
      this.estadoTexto('Choose your cards');
      if (this.el && this.el.turno) this.el.turno.textContent = `TURN ${d.turn}`;
      this.iniciarTemporizador(d.msToChoose);
    });

    this.on('battle:rivalReady', () => {
      if (this.puedeJugar) this.estadoTexto('The rival already played. Your turn!');
    });

    this.on('battle:turn', (d) => {
      this.yo = d.you;
      this.rival = d.rival;
      this.puedeJugar = false;
      this.detenerTemporizador();
      this.limpiarMano();

      // Reveal de lo que jugó cada uno (aparece en el centro y se va solo)
      this.mostrarReveal(d.yourCards, d.rivalCards);

      // Actualizar barras y escudos
      this.pintarLuchadores();
      this.mostrarEscudos(d.shieldYou || 0, d.shieldRival || 0);
      this.estadoTexto(d.log || '');

      // Números flotantes + sacudón de la mascota golpeada
      if (d.damageToRival > 0) this.flotarNumero(`-${d.damageToRival}`, 'dmg', 'rival');
      if (d.damageToYou > 0) this.flotarNumero(`-${d.damageToYou}`, 'dmg', 'you');
      if (d.healYou > 0) this.flotarNumero(`+${d.healYou}`, 'heal', 'you');
      if (d.shieldYou > 0) this.flotarNumero(`🛡 ${d.shieldYou}`, 'shield', 'you');
      this.animarGolpe(d.damageToRival > 0, d.damageToYou > 0);
    });

    this.on('battle:end', (d) => {
      this.estado = 'fin';
      this.puedeJugar = false;
      this.detenerTemporizador();
      this.limpiarMano();
      this.yo = d.you;
      this.rival = d.rival;
      this.pintarLuchadores();

      const titulo = d.result === 'win' ? '🏆 YOU WIN!'
        : d.result === 'lose' ? '💀 YOU LOSE'
        : '🤝 DRAW';
      const motivo = d.reason === 'forfeit' ? '\n(the rival left the battle)' : '';
      const diarias = d.daily ? `\nDaily battles: ${d.daily.done}/${d.daily.max}` : '';
      this.estadoTexto(`${titulo}\n+${d.pointsEarned} points${motivo}${diarias}\n\nBack to the map…`);

      this.time.delayedCall(3500, () => this.volverAlMapa());
    });

    this.on('battle:error', (d) => {
      let msg = 'Could not start the battle.';
      if (d && d.error === 'not_authenticated') msg = 'You must be logged in to battle.';
      else if (d && d.error === 'already_in_battle') msg = 'You are already in a battle.';
      else if (d && d.error === 'daily_limit') {
        msg = `You already played your ${d.daily ? d.daily.max : 5} daily battles.\nCome back tomorrow!`;
      }
      this.estadoTexto(msg);
      this.time.delayedCall(3000, () => this.volverAlMapa());
    });
  }

  jugarTurno() {
    if (!this.puedeJugar || this.estado !== 'combate') return;
    this.puedeJugar = false;
    this.detenerTemporizador();
    this.socket.emit('battle:action', { cards: this.seleccion.slice() });
    this.refrescarMano();
    this.estadoTexto('Waiting for the rival…');
  }

  rendirse() {
    if (this.estado === 'combate' && this.socket && this.socket.connected) {
      this.socket.emit('battle:forfeit');
    } else {
      if (this.socket && this.socket.connected) this.socket.emit('battle:leaveQueue');
      this.volverAlMapa();
    }
  }

  animarGolpe(peguéYo, pegóRival) {
    const sacudir = (sprite) => {
      if (!sprite) return;
      this.tweens.add({ targets: sprite, x: sprite.x + 14, duration: 70, yoyo: true, repeat: 2 });
      if (sprite.setTint) {
        sprite.setTint(0xff8888);
        this.time.delayedCall(320, () => sprite.clearTint && sprite.clearTint());
      }
    };
    if (peguéYo) sacudir(this.petRival);
    if (pegóRival) sacudir(this.petYo);
  }

  onResize(gameSize) {
    const { width, height } = gameSize;
    this.ajustarFondo(width, height);
    if (this.petYo) this.petYo.setPosition(width * 0.26, height * 0.70);
    if (this.petRival) this.petRival.setPosition(width * 0.74, height * 0.70);
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
    if (this._conexionTimeout) { this._conexionTimeout.remove(); this._conexionTimeout = null; }
    if (this._revealTimer) { this._revealTimer.remove(); this._revealTimer = null; }
    this.detenerTemporizador();
    if (this.el && this.el.floaters) this.el.floaters.textContent = '';
    if (this.el && this.el.reveal) this.el.reveal.classList.add('hidden');

    try {
      if (this.socket) {
        this._listeners.forEach(([ev, fn]) => this.socket.off(ev, fn));
        this._listeners = [];
        if (this.estado === 'buscando' && this.socket.connected) this.socket.emit('battle:leaveQueue');

        // Se deja el socket como lo deja la tienda al salir del mapa:
        // desconectado. Así GameScene.initSocket() crea uno nuevo con todos sus
        // manejadores globales (cleanupScene ya le hizo removeAllListeners).
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }
    } catch (e) { /* sin ruido al salir */ }

    document.body.classList.remove('in-battle');
    if (this.ui) this.ui.classList.add('hidden');

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
