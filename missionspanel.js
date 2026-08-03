/**
 * PANEL DE MISIONES DIARIAS
 * =============================================================================
 * Reescritura del renderizado (2026-08-03). Lo que cambia y por qué:
 *
 *  1. NOMBRES BONITOS. El panel mostraba el identificador interno tal cual, así
 *     que al hablar con el granjero salían cosas como "buscar madera_tronco".
 *     Ahora se usa el nombre que el administrador escribió en misiones.html
 *     (`texts[idioma].itemName` / `.rewardName`) y, si no lo escribió, se
 *     genera uno legible a partir del id ("madera_tronco" → "Madera Tronco").
 *     Además el título y la descripción se repasan para sustituir cualquier id
 *     suelto que se haya colado dentro del texto.
 *
 *  2. IMÁGENES EXACTAS. Antes se apuntaba siempre a
 *     ./Game/Objetos/Itemmision/<id>.png y, si ese archivo no existía, salía un
 *     icono roto. Ahora se pide a la escena la ruta REAL del ítem (la misma que
 *     usa el inventario, vía ItemDefinitions) y se prueban rutas alternativas
 *     en cadena hasta que una cargue.
 *
 *  3. PANEL INTELIGENTE. Cada misión muestra cuánto lleva el jugador
 *     (barra de progreso "3/5"), el botón se pone en "Ready to hand in" solo
 *     cuando de verdad tiene los materiales, y las misiones se ordenan:
 *     primero las que ya se pueden entregar, luego las que están a medias y al
 *     final las completadas.
 *
 *  4. PC Y TELÉFONO. El maquetado es una rejilla que se reordena sola en
 *     pantallas estrechas (ver la sección "PANEL DE MISIONES" de styless.css).
 * =============================================================================
 */
class missionspanel {
  constructor(gameScene) {
    this.gameScene = gameScene;
    this.panel = document.getElementById('missions-panel');
    this.overlay = document.getElementById('missions-overlay');
    this.npcTitle = document.getElementById('missions-npc-title');
    this.resetTime = document.getElementById('missions-reset-time');
    this.progress = document.getElementById('missions-progress');
    this.missionsList = document.getElementById('missions-list');
    this.closeButton = document.getElementById('close-missions');
    this.refreshButton = document.getElementById('refresh-missions');

    // FIX: si el HTML de la página no incluye el panel de misiones, no
    // adjuntar listeners (antes lanzaba TypeError sobre null y rompía la
    // inicialización de la escena que construía este panel).
    if (!this.panel || !this.overlay || !this.closeButton || !this.refreshButton) {
      console.warn('missionspanel: elementos del panel de misiones no encontrados en el DOM — panel desactivado');
      this.disabled = true;
      return;
    }
    this.disabled = false;

    this.initEvents();
  }

  // FIX SEGURIDAD: los textos de misión llegan del backend y se insertaban
  // sin escapar dentro de innerHTML. Escapamos todo dato dinámico.
  _esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  initEvents() {
    this.closeButton.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());
    this.refreshButton.addEventListener('click', () => this.refreshMissions());

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  async show(npcId) {
    if (this.disabled) return;

    // El panel se abre SIEMPRE. Antes solo se abría si loadDailyMissions
    // devolvía algo, así que cuando el NPC no tenía misiones para hoy (o la
    // carga fallaba) al jugador no le pasaba absolutamente nada al hablarle:
    // ni panel, ni aviso. Ahora abre y, si no hay nada, lo dice.
    let loaded = null;
    try {
      loaded = await this.gameScene.loadDailyMissions(npcId);
    } catch (e) {
      console.warn('missionspanel: fallo cargando misiones:', e && e.message);
    }

    this.render(!loaded);
    this.panel.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
  }

  close() {
    if (this.disabled) return;
    this.panel.classList.add('hidden');
    this.overlay.classList.add('hidden');

    // Reanudar el juego
    if (this.gameScene.scene.isPaused()) {
      this.gameScene.scene.resume();
    }

    this.gameScene.currentNpcMission = null;
  }

  async refreshMissions() {
    if (this.gameScene.currentNpcMission) {
      if (this.refreshButton) {
        this.refreshButton.disabled = true;
        this.refreshButton.classList.add('loading');
      }
      try {
        await this.gameScene.loadDailyMissions(this.gameScene.currentNpcMission);
        this.render();
      } finally {
        if (this.refreshButton) {
          this.refreshButton.disabled = false;
          this.refreshButton.classList.remove('loading');
        }
      }
    }
  }

  // ===========================================================================
  // NOMBRES LEGIBLES
  // ===========================================================================

  /** "madera_tronco" → "Madera Tronco"; "mineral_hierro" → "Mineral Hierro". */
  _bonito(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    return s
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\p{L}/gu, c => c.toUpperCase());
  }

  /**
   * Nombre a mostrar del ítem pedido: manda lo que el administrador escribió
   * en misiones.html para ese idioma; si lo dejó vacío, se genera desde el id.
   */
  _nombreItem(mission, textos) {
    const puesto = textos && typeof textos.itemName === 'string' ? textos.itemName.trim() : '';
    return puesto || this._bonito(mission.itemId);
  }

  /** Igual que _nombreItem pero para la recompensa. */
  _nombreRecompensa(mission, textos) {
    const puesto = textos && typeof textos.rewardName === 'string' ? textos.rewardName.trim() : '';
    return puesto || this._bonito(mission.rewardItemId);
  }

  /**
   * Sustituye dentro de un texto cualquier identificador crudo por su nombre
   * legible. Es lo que hace que "buscar madera_tronco" se lea como
   * "Buscar Madera Tronco" aunque el administrador escribiera el id en el
   * título o en la descripción.
   */
  _limpiarTexto(texto, mission, nombreItem, nombreRecompensa) {
    let salida = String(texto || '');
    if (!salida) return salida;

    const reemplazar = (id, nombre) => {
      if (!id || !nombre) return;
      const escapado = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      salida = salida.replace(new RegExp(escapado, 'gi'), nombre);
    };

    reemplazar(mission.itemId, nombreItem);
    reemplazar(mission.rewardItemId, nombreRecompensa);
    return salida;
  }

  /** Título de reserva cuando el administrador no escribió ninguno. */
  _tituloPorDefecto(mission, nombreItem, esEspanol) {
    const n = mission.requiredAmount || 1;
    return esEspanol ? `Entrega ${n}x ${nombreItem}` : `Deliver ${n}x ${nombreItem}`;
  }

  // ===========================================================================
  // IMÁGENES
  // ===========================================================================

  /**
   * Crea un <img> que va probando rutas hasta que una carga. Así el icono es
   * siempre el del recurso real y nunca queda una imagen rota.
   */
  _imagenItem(itemId, alt, clase) {
    const img = document.createElement('img');
    img.className = clase || 'item-icon';
    img.alt = alt || String(itemId || '');
    img.loading = 'lazy';

    let rutas = [];
    try {
      if (typeof this.gameScene.getMissionItemImageCandidates === 'function') {
        rutas = this.gameScene.getMissionItemImageCandidates(itemId) || [];
      }
    } catch (e) { /* la escena puede no estar lista todavía */ }

    if (!rutas.length) {
      rutas = [
        `./Game/Objetos/Itemmision/${itemId}.png`,
        `./Game/Source/${itemId}.png`,
        './Game/Source/moneda.png'
      ];
    }

    let i = 0;
    const siguiente = () => {
      if (i >= rutas.length) { img.onerror = null; return; }
      img.src = rutas[i++];
    };
    img.onerror = siguiente;
    siguiente();
    return img;
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  /**
   * @param {boolean} fallóLaCarga  true si loadDailyMissions no devolvió nada.
   *        Se sigue pintando el panel, con el mensaje de "sin misiones".
   */
  render(fallóLaCarga = false) {
    if (this.disabled) return;

    // Sin datos (no hay misiones hoy, o la carga falló): se pinta el panel
    // vacío con su mensaje en vez de dejarlo en blanco o no abrirlo.
    if (!this.gameScene.dailyMissionsData) {
      this._renderVacio(fallóLaCarga);
      return;
    }

    const lang = this.gameScene.languageMap[this.gameScene.lenguaje] || 'en-US';
    const esEspanol = this.gameScene.lenguaje === 3;

    // FIX: tolerar respuestas incompletas del backend — antes cualquier campo
    // faltante (missions, userProgress, completedMissions) lanzaba TypeError.
    const missions = Array.isArray(this.gameScene.dailyMissionsData.missions)
      ? this.gameScene.dailyMissionsData.missions : [];
    const userProgress = this.gameScene.dailyMissionsData.userProgress || {};
    const completedIds = new Set(
      (userProgress.completedMissions || []).map(m => m.missionId)
    );

    // Actualizar título
    const npcName = this.gameScene.currentNpcMission === 'granjero' ?
      (esEspanol ? 'Granjero Joe' : 'Farmer Joe') :
      (esEspanol ? 'Guardián Rurik' : 'Guardian Rurik');

    this.npcTitle.textContent = `${npcName} — ${esEspanol ? 'Misiones Diarias' : 'Daily Missions'}`;

    // Actualizar tiempo y progreso (resetInfo puede faltar en la respuesta)
    const hoursLeft = (this.gameScene.dailyMissionsData.resetInfo || {}).hoursUntilReset ?? '?';
    this.resetTime.textContent = esEspanol ?
      `⏳ Reinicio en ${hoursLeft} h` : `⏳ Resets in ${hoursLeft} h`;

    const completedCount = userProgress.completedCount ?? completedIds.size;
    this.progress.textContent = esEspanol ?
      `✅ Completadas ${completedCount}/${missions.length}` :
      `✅ Completed ${completedCount}/${missions.length}`;

    // Barra de progreso global del panel (se crea una sola vez).
    this._pintarBarraCabecera(completedCount, missions.length);

    // Limpiar lista
    this.missionsList.innerHTML = '';

    // La respuesta puede venir bien pero con la lista vacía (el NPC no tiene
    // misiones para hoy, o ya se completaron todas): también hay que decirlo.
    if (!missions.length) {
      this.missionsList.appendChild(this._mensajeVacio(
        completedCount > 0
          ? 'All done for today! Come back tomorrow for new missions.'
          : 'No missions available right now. Check back later.'
      ));
      return;
    }

    // ORDEN INTELIGENTE: primero lo que ya se puede entregar, luego lo que
    // está a medias, y al final lo ya completado.
    const conEstado = missions.map(m => {
      const completada = completedIds.has(m.missionId);
      const tiene = this._cuantoTiene(m);
      const pedido = Math.max(1, Number(m.requiredAmount) || 1);
      const lista = !completada && tiene >= pedido;
      return { mission: m, completada, tiene, pedido, lista };
    });
    conEstado.sort((a, b) => {
      const peso = (x) => (x.completada ? 2 : (x.lista ? 0 : 1));
      const d = peso(a) - peso(b);
      if (d !== 0) return d;
      // A igualdad, primero la que esté más cerca de terminarse.
      return (b.tiene / b.pedido) - (a.tiene / a.pedido);
    });

    conEstado.forEach(info => {
      this.missionsList.appendChild(this.createMissionElement(info, lang, esEspanol));
    });
  }

  /** Cuántas unidades del ítem pedido lleva ya el jugador. */
  _cuantoTiene(mission) {
    try {
      if (typeof this.gameScene.getMissionItemCount === 'function') {
        return Math.max(0, Number(this.gameScene.getMissionItemCount(mission.itemId)) || 0);
      }
    } catch (e) { /* la escena puede no tener inventario cargado aún */ }
    return 0;
  }

  _pintarBarraCabecera(hechas, total) {
    if (!this.progress || !this.progress.parentElement) return;
    let barra = document.getElementById('missions-header-bar');
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'missions-header-bar';
      barra.className = 'missions-header-bar';
      barra.innerHTML = '<span></span>';
      this.progress.parentElement.appendChild(barra);
    }
    const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
    barra.firstChild.style.width = pct + '%';
    barra.setAttribute('data-pct', pct + '%');
  }

  /** Tarjeta de aviso para cuando no hay nada que listar. Siempre en inglés. */
  _mensajeVacio(texto) {
    const box = document.createElement('div');
    box.className = 'mission-card mission-empty';
    box.innerHTML =
      '<div class="mission-empty-ico">📜</div>' +
      '<div class="mission-empty-title">No missions</div>' +
      '<div class="mission-empty-text">' + this._esc(texto) + '</div>';
    return box;
  }

  /** Panel abierto pero sin datos ningunos. */
  _renderVacio(fallóLaCarga) {
    const esNpcGranjero = this.gameScene.currentNpcMission === 'granjero';
    const npcName = esNpcGranjero ? 'Farmer Joe' : 'Guardian Rurik';
    if (this.npcTitle)  this.npcTitle.textContent  = `${npcName} — Daily Missions`;
    if (this.resetTime) this.resetTime.textContent = '';
    if (this.progress)  this.progress.textContent  = 'Completed 0/0';
    this._pintarBarraCabecera(0, 0);
    if (this.missionsList) {
      this.missionsList.innerHTML = '';
      this.missionsList.appendChild(this._mensajeVacio(
        fallóLaCarga
          ? "Couldn't load the missions right now. Try the refresh button."
          : 'No missions available right now. Check back later.'
      ));
    }
  }

  /**
   * @param {{mission:object, completada:boolean, tiene:number, pedido:number, lista:boolean}} info
   */
  createMissionElement(info, lang, esEspanol) {
    const { mission, completada, tiene, pedido, lista } = info;

    // FIX: mission.texts puede faltar — antes lanzaba TypeError y no se
    // renderizaba ninguna misión.
    const texts = mission.texts || {};
    const missionTexts = texts[lang] || texts['en-US'] || {};

    const nombreItem = this._nombreItem(mission, missionTexts);
    const nombrePremio = this._nombreRecompensa(mission, missionTexts);

    const titulo = this._limpiarTexto(missionTexts.title, mission, nombreItem, nombrePremio).trim()
      || this._tituloPorDefecto(mission, nombreItem, esEspanol);
    const descripcion = this._limpiarTexto(missionTexts.description, mission, nombreItem, nombrePremio).trim();

    const card = document.createElement('div');
    card.className = 'mission-card' +
      (completada ? ' completed' : '') +
      (lista ? ' ready' : '');

    // ── Columna de información ────────────────────────────────────────────
    const info_ = document.createElement('div');
    info_.className = 'mission-info';

    const h3 = document.createElement('h3');
    h3.className = 'mission-title';
    h3.textContent = titulo;
    info_.appendChild(h3);

    if (descripcion) {
      const p = document.createElement('p');
      p.className = 'mission-description';
      p.textContent = descripcion;
      info_.appendChild(p);
    }

    // Requisito con imagen exacta + progreso real
    const req = document.createElement('div');
    req.className = 'mission-requirements';

    const reqItem = document.createElement('div');
    reqItem.className = 'requirement-item';
    reqItem.appendChild(this._imagenItem(mission.itemId, nombreItem, 'item-icon'));

    const reqTexto = document.createElement('div');
    reqTexto.className = 'requirement-text';

    const reqNombre = document.createElement('span');
    reqNombre.className = 'requirement-name';
    reqNombre.textContent = nombreItem;

    const reqCant = document.createElement('span');
    reqCant.className = 'item-amount' + (tiene >= pedido ? ' ok' : '');
    reqCant.textContent = `${Math.min(tiene, pedido)} / ${pedido}`;

    reqTexto.appendChild(reqNombre);
    reqTexto.appendChild(reqCant);

    const barra = document.createElement('div');
    barra.className = 'requirement-bar';
    const relleno = document.createElement('span');
    relleno.style.width = Math.min(100, Math.round((tiene / pedido) * 100)) + '%';
    barra.appendChild(relleno);
    reqTexto.appendChild(barra);

    reqItem.appendChild(reqTexto);
    req.appendChild(reqItem);
    info_.appendChild(req);

    // ── Columna de acciones ───────────────────────────────────────────────
    const acciones = document.createElement('div');
    acciones.className = 'mission-actions';

    const premios = document.createElement('div');
    premios.className = 'mission-rewards';

    const premioExp = document.createElement('div');
    premioExp.className = 'reward-item exp-reward-item';
    const imgExp = document.createElement('img');
    imgExp.className = 'item-icon';
    imgExp.src = './Game/Source/exp_w.png';
    imgExp.alt = 'EXP';
    const spanExp = document.createElement('span');
    spanExp.className = 'exp-reward';
    spanExp.textContent = `+${mission.expReward || 0} exp`;
    premioExp.appendChild(imgExp);
    premioExp.appendChild(spanExp);
    premios.appendChild(premioExp);

    if (mission.rewardItemId) {
      const premioItem = document.createElement('div');
      premioItem.className = 'reward-item item-reward-item';
      premioItem.appendChild(this._imagenItem(mission.rewardItemId, nombrePremio, 'item-icon'));
      const spanItem = document.createElement('span');
      spanItem.className = 'item-reward';
      spanItem.textContent = `+${mission.rewardAmount || 1} ${nombrePremio}`;
      premioItem.appendChild(spanItem);
      premios.appendChild(premioItem);
    }

    acciones.appendChild(premios);

    const boton = document.createElement('button');
    boton.className = 'complete-button' +
      (completada ? ' completed disabled' : (lista ? ' ready' : ''));
    boton.type = 'button';
    boton.dataset.missionId = mission.missionId;
    boton.textContent = completada
      ? (esEspanol ? 'COMPLETADA' : 'COMPLETED')
      : (lista
        ? (esEspanol ? 'ENTREGAR' : 'HAND IN')
        : (esEspanol ? 'COMPLETAR' : 'COMPLETE'));
    boton.disabled = completada;
    acciones.appendChild(boton);

    if (!completada && !lista) {
      const falta = document.createElement('div');
      falta.className = 'mission-hint';
      const restan = Math.max(0, pedido - tiene);
      falta.textContent = esEspanol
        ? `Te faltan ${restan}x ${nombreItem}`
        : `${restan}x ${nombreItem} still needed`;
      acciones.appendChild(falta);
    }

    card.appendChild(info_);
    card.appendChild(acciones);

    // Agregar evento al botón si no está completado
    if (!completada) {
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        const textoOriginal = boton.textContent;
        boton.textContent = esEspanol ? 'ENVIANDO…' : 'SENDING…';
        try {
          const hasItems = await this.gameScene.checkMissionRequirements(mission.missionId);

          if (hasItems) {
            await this.gameScene.completeMission(mission.missionId);
            this.render(); // Actualizar panel después de completar
          } else {
            this.gameScene.showNotification(
              esEspanol
                ? `No tienes los items requeridos (${nombreItem})`
                : `You don't have the required items (${nombreItem})`,
              'error'
            );
            boton.disabled = false;
            boton.textContent = textoOriginal;
          }
        } catch (e) {
          console.warn('missionspanel: error completando misión:', e && e.message);
          boton.disabled = false;
          boton.textContent = textoOriginal;
        }
      });
    }

    return card;
  }
}
