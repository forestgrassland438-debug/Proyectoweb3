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
    const loaded = await this.gameScene.loadDailyMissions(npcId);

    if (loaded) {
      this.render();
      this.panel.classList.remove('hidden');
      this.overlay.classList.remove('hidden');
      
    }
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
      await this.gameScene.loadDailyMissions(this.gameScene.currentNpcMission);
      this.render();
    }
  }
  
  render() {
    if (this.disabled || !this.gameScene.dailyMissionsData) return;

    const lang = this.gameScene.languageMap[this.gameScene.lenguaje] || 'en-US';
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
      (this.gameScene.lenguaje === 3 ? 'Granjero Joe' : 'Farmer Joe') :
      (this.gameScene.lenguaje === 3 ? 'Guardián Rurik' : 'Guardian Rurik');
    
    this.npcTitle.textContent = `${npcName} - ${this.gameScene.lenguaje === 3 ? 'Misiones Diarias' : 'Daily Missions'}`;
    
    // Actualizar tiempo y progreso (resetInfo puede faltar en la respuesta)
    const hoursLeft = (this.gameScene.dailyMissionsData.resetInfo || {}).hoursUntilReset ?? '?';
    this.resetTime.textContent = this.gameScene.lenguaje === 3 ?
      `Reinicio en: ${hoursLeft} horas` : `Reset in: ${hoursLeft} hours`;

    const completedCount = userProgress.completedCount ?? completedIds.size;
    this.progress.textContent = this.gameScene.lenguaje === 3 ?
      `Completadas: ${completedCount}/${missions.length}` :
      `Completed: ${completedCount}/${missions.length}`;
    
    // Limpiar lista
    this.missionsList.innerHTML = '';
    
    // Renderizar cada misión
    missions.forEach(mission => {
      const missionElement = this.createMissionElement(mission, lang, completedIds.has(mission.missionId));
      this.missionsList.appendChild(missionElement);
    });
  }
  
  createMissionElement(mission, lang, isCompleted) {
    // FIX: mission.texts puede faltar — antes lanzaba TypeError y no se
    // renderizaba ninguna misión.
    const texts = mission.texts || {};
    const missionTexts = texts[lang] || texts['en-US'] || { title: mission.missionId || '', description: '' };
    const isSpanish = this.gameScene.lenguaje === 3;

    const card = document.createElement('div');
    card.className = `mission-card ${isCompleted ? 'completed' : ''}`;

    // FIX SEGURIDAD: todos los datos dinámicos pasan por _esc() antes de
    // insertarse en innerHTML (venían del backend sin escapar).
    const esc = (v) => this._esc(v);

    card.innerHTML = `
      <div class="mission-info">
        <h3 class="mission-title">${esc(missionTexts.title)}</h3>
        <p class="mission-description">${esc(missionTexts.description)}</p>

        <div class="mission-requirements">
          <div class="requirement-item">
            <img src="./Game/Objetos/Itemmision/${esc(mission.itemId)}.png" alt="${esc(mission.itemId)}" class="item-icon">
            <span class="item-amount">${esc(mission.requiredAmount)}x</span>
          </div>
        </div>
      </div>

      <div class="mission-actions">
        <div class="mission-rewards-container">
          <div class="mission-rewards">
            <div class="reward-item exp-reward-item">
              <img src="./Game/Source/exp_w.png" alt="EXP" class="item-icon">
              <span class="exp-reward">+${esc(mission.expReward)} exp</span>
            </div>
            ${mission.rewardItemId ? `
              <div class="reward-item item-reward-item">
                <img src="./Game/Source/${esc(mission.rewardItemId)}.png" alt="${esc(mission.rewardItemId)}" class="item-icon"
                     onerror="this.src='./Game/Source/moneda.png'">
                <span class="item-reward">${esc(mission.rewardAmount || 1)}+</span>
              </div>
            ` : ''}
          </div>
        </div>

        <button class="complete-button ${isCompleted ? 'completed' : ''} ${isCompleted ? 'disabled' : ''}"
                data-mission-id="${esc(mission.missionId)}">
          ${isCompleted ?
            (isSpanish ? 'COMPLETADA' : 'COMPLETED') :
            (isSpanish ? 'COMPLETAR' : 'COMPLETE')
          }
        </button>
      </div>
    `;
    
    // Agregar evento al botón si no está completado
    if (!isCompleted) {
      const button = card.querySelector('.complete-button');
      button.addEventListener('click', async () => {
        const hasItems = await this.gameScene.checkMissionRequirements(mission.missionId);
        
        if (hasItems) {
          await this.gameScene.completeMission(mission.missionId);
          this.render(); // Actualizar panel después de completar
        } else {
          this.gameScene.showNotification(
            isSpanish ? 
              'No tienes los items requeridos' :
              'You don\'t have the required items',
            'error'
          );
        }
      });
    }
    
    return card;
  }
}