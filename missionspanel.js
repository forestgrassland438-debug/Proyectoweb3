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
    
    this.initEvents();
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
    const loaded = await this.gameScene.loadDailyMissions(npcId);
    
    if (loaded) {
      this.render();
      this.panel.classList.remove('hidden');
      this.overlay.classList.remove('hidden');
      
    }
  }
  
  close() {
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
    if (!this.gameScene.dailyMissionsData) return;
    
    const lang = this.gameScene.languageMap[this.gameScene.lenguaje] || 'en-US';
    const missions = this.gameScene.dailyMissionsData.missions;
    const userProgress = this.gameScene.dailyMissionsData.userProgress;
    const completedIds = new Set(userProgress.completedMissions.map(m => m.missionId));
    
    // Actualizar título
    const npcName = this.gameScene.currentNpcMission === 'granjero' ? 
      (this.gameScene.lenguaje === 3 ? 'Granjero Joe' : 'Farmer Joe') :
      (this.gameScene.lenguaje === 3 ? 'Guardián Rurik' : 'Guardian Rurik');
    
    this.npcTitle.textContent = `${npcName} - ${this.gameScene.lenguaje === 3 ? 'Misiones Diarias' : 'Daily Missions'}`;
    
    // Actualizar tiempo y progreso
    const hoursLeft = this.gameScene.dailyMissionsData.resetInfo.hoursUntilReset;
    this.resetTime.textContent = this.gameScene.lenguaje === 3 ? 
      `Reinicio en: ${hoursLeft} horas` : `Reset in: ${hoursLeft} hours`;
    
    this.progress.textContent = this.gameScene.lenguaje === 3 ?
      `Completadas: ${userProgress.completedCount}/${missions.length}` :
      `Completed: ${userProgress.completedCount}/${missions.length}`;
    
    // Limpiar lista
    this.missionsList.innerHTML = '';
    
    // Renderizar cada misión
    missions.forEach(mission => {
      const missionElement = this.createMissionElement(mission, lang, completedIds.has(mission.missionId));
      this.missionsList.appendChild(missionElement);
    });
  }
  
  createMissionElement(mission, lang, isCompleted) {
    const missionTexts = mission.texts[lang] || mission.texts['en-US'];
    const isSpanish = this.gameScene.lenguaje === 3;
    
    const card = document.createElement('div');
    card.className = `mission-card ${isCompleted ? 'completed' : ''}`;
    
    card.innerHTML = `
      <div class="mission-info">
        <h3 class="mission-title">${missionTexts.title}</h3>
        <p class="mission-description">${missionTexts.description}</p>
        
        <div class="mission-requirements">
          <div class="requirement-item">
            <img src="./Game/Objetos/Itemmision/${mission.itemId}.png" alt="${mission.itemId}" class="item-icon">
            <span class="item-amount">${mission.requiredAmount}x</span>
          </div>
        </div>
      </div>
      
      <div class="mission-actions">
        <div class="mission-rewards-container">
          <div class="mission-rewards">
            <div class="reward-item exp-reward-item">
              <img src="./Game/Source/exp_w.png" alt="EXP" class="item-icon">
              <span class="exp-reward">+${mission.expReward} exp</span>
            </div>
            ${mission.rewardItemId ? `
              <div class="reward-item item-reward-item">
                <img src="./Game/Source/${mission.rewardItemId}.png" alt="${mission.rewardItemId}" class="item-icon"
                     onerror="this.src='./Game/Source/moneda.png'">
                <span class="item-reward">${mission.rewardAmount || 1}+</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <button class="complete-button ${isCompleted ? 'completed' : ''} ${isCompleted ? 'disabled' : ''}"
                data-mission-id="${mission.missionId}">
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