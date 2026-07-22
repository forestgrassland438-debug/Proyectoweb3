// CraftingHub.js — VERSIÓN COMPLETAMENTE REPARADA v2
// Bugs corregidos:
//   1. +/- no funcionaban: listeners adjuntados en show() via delegación, no en constructor
//   2. Race condition overlay: setupOverlayEvents() sincrónico, sin requestAnimationFrame
//   3. Loop circular setQuantity → calculateMaxCraftable → setQuantity eliminado
//   4. adjustQuantity con max=0 confundía la cantidad
//   5. XSS: toda inserción de datos en innerHTML usa _esc()
//   6. canAddItemToInventory: lógica de espacio corregida
//   7. Double-craft: flag _crafting previene clicks rápidos
//   8. Cantidad se resetea a 1 al cerrar el hub
//   9. getRelevantInventoryItems: guard contra resources undefined
//  10. _releaseAllKeys: guard contra Phaser global no disponible

class CraftingSystem {
  constructor(phaserScene) {
    this.scene = phaserScene;
    this.playerLevel = this.getPlayerLevelFromScene();
    this.selectedRecipe = null;
    this.selectedOptional = null;
    this.craftingQuantity = 1;
    this.recipes = [];
    this.filteredRecipes = [];
    this.categories = [
      { id: 'all',         name: 'all',       icon: '📁' },
      { id: 'tools',       name: 'Axes',      icon: '🛠️' },
      { id: 'consumables', name: 'Pickaxes',  icon: '🛠️' },
      { id: 'resources',   name: 'Extras',    icon: '📦' },
    ];
    this.currentCategory = 'all';
    this.searchTerm = '';
    this._lastClickTime = 0;
    this._lastClickedRecipe = null;
    this._phaserInputPreviouslyEnabled = null;
    this._documentKeyCaptureHandler = null;
    this._keysPressed = new Set();
    this._wasPlayerMoving = false;
    this._playerVelocity = { x: 0, y: 0 };
    this._crafting = false;           // FIX 7: anti-double-craft
    this._listenersAttached = false;  // FIX 1
    this._nonStackableItems = [
      'hacha_de_madera','hacha_de_piedra','hacha_de_cobre','hacha_de_hierro',
      'pico_de_madera','pico_de_piedra','pico_de_cobre','pico_de_hierro',
      'espada_madera','balde_vacio','balde_con_agua'
    ];
    this._maxStackSize = 99;
    this.initialize();
  }

  // FIX 5: Escapar HTML
  _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  isItemStackable(itemId) { return !this._nonStackableItems.includes(itemId); }

  // FIX 6: lógica de espacio corregida
  canAddItemToInventory(itemId, quantity) {
    const isStackable = this.isItemStackable(itemId);
    let availableSpace = 0;
    if (this.scene && this.scene.STATE) {
      const allSlots = [
        ...(this.scene.STATE.slots||[]),
        ...(this.scene.STATE.quickSlots||[]),
        ...(this.scene.STATE.chestSlots||[])
      ];
      allSlots.forEach(slot => {
        if (!slot) {
          availableSpace += isStackable ? this._maxStackSize : 1;
        } else if (slot.id === itemId && isStackable) {
          const cur = parseInt(slot.quantity||slot.count)||1;
          availableSpace += Math.max(0, this._maxStackSize - cur);
        }
      });
    }
    return availableSpace >= quantity;
  }

  getPlayerLevelFromScene() {
    const tryInt = v => (v!==undefined&&v!==null&&!isNaN(parseInt(v)))?parseInt(v):null;
    let n;
    if ((n=tryInt(this.scene?.nivel))!==null) return n;
    if ((n=tryInt(this.scene?.game?.nivel))!==null) return n;
    if ((n=tryInt(this.scene?.playerLevel))!==null) return n;
    if ((n=tryInt(this.scene?.STATE?.nivel))!==null) return n;
    if ((n=tryInt(window.game?.nivel))!==null) return n;
    if ((n=tryInt(window.playerData?.nivel))!==null) return n;
    if (typeof this.scene?.getSceneLevel==='function') {
      try { if ((n=tryInt(this.scene.getSceneLevel()))!==null) return n; } catch(e){}
    }
    if (this.scene) {
      for (const key in this.scene) {
        if (key.toLowerCase().includes('nivel')||key.toLowerCase().includes('level')) {
          if ((n=tryInt(this.scene[key]))!==null) return n;
        }
      }
    }
    console.warn('⚠️ No se pudo detectar nivel del jugador, usando 1');
    return 1;
  }

  updatePlayerLevelFromScene() {
    const newLevel = this.getPlayerLevelFromScene();
    if (newLevel !== this.playerLevel) {
      this.playerLevel = newLevel;
      this.updatePlayerLevelDisplay();
      this.updateRecipesList();
      if (this.selectedRecipe) this.updateCraftButton();
      return true;
    }
    return false;
  }

  initialize() {
    this.loadDefaultRecipes();
    // FIX 1: NO adjuntar listeners aquí — el DOM puede no existir aún
    this.updateRecipesList();
    this.updatePlayerLevelDisplay();
    console.log(`🔨 CraftingSystem inicializado — Nivel: ${this.playerLevel}`);
  }

  loadDefaultRecipes() {
    this.recipes = [
      { id:'balde_vacio', name:'Empty Bucket', resultItem:'balde_vacio',
        resultImage:'./Game/Source/item_pozo1.png', level:1, category:'resources',
        description:'An empty bucket to collect water from the well.',
        resources:[{itemId:'madera_pinos',quantity:3,name:'Pine Wood',image:'./Game/Source/madera_oscura.png'}],
        optionalResources:null },
      { id:'tablon_de_madera', name:'Wood Plank', resultItem:'tablon_de_madera',
        resultImage:'./Game/Source/madera.png', level:2, category:'resources',
        description:'Wood plank made from wood', resources:[],
        optionalResources:[[
          {itemId:'madera_pinos',quantity:2,name:'Pine Wood',image:'./Game/Source/madera_oscura.png'},
          {itemId:'madera_seca',quantity:2,name:'Dry Wood',image:'./Game/Source/madera seca.png'},
          {itemId:'madera_con_hojas',quantity:2,name:'Wood with Leaves',image:'./Game/Source/madera de hoja.png'}
        ]] },
      { id:'palo', name:'Wood Stick', resultItem:'palo',
        resultImage:'./Game/Source/palo.png', level:3, category:'resources',
        description:'Three wood sticks made from wood',
        resources:[{itemId:'tablon_de_madera',quantity:2,name:'Wood Plank',image:'./Game/Source/madera.png'}],
        optionalResources:null, resultQuantity:3 },
      { id:'hacha_de_madera', name:'Wooden Axe', resultItem:'hacha_de_madera',
        resultImage:'./Game/Source/pico_y_hacha/hacha_de_madera.png', level:3, category:'tools',
        description:'Wooden axe made from wood',
        resources:[
          {itemId:'tablon_de_madera',quantity:1,name:'Wood Plank',image:'./Game/Source/madera.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'hacha_piedra', name:'Stone Axe', resultItem:'hacha_de_piedra',
        resultImage:'./Game/Source/pico_y_hacha/hacha_de_piedra.png', level:4, category:'tools',
        description:'Stone axe made from wood and stone',
        resources:[
          {itemId:'mineral_piedra',quantity:3,name:'Stone',image:'./Game/Source/piedra.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'hacha_de_cobre', name:'Copper Axe', resultItem:'hacha_de_cobre',
        resultImage:'./Game/Source/pico_y_hacha/hacha_de_cobre.png', level:5, category:'tools',
        description:'Copper axe made from wood and copper',
        resources:[
          {itemId:'mineral_cobre',quantity:3,name:'Copper Ore',image:'./Game/Source/cobre.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'hacha_de_hierro', name:'Iron Axe', resultItem:'hacha_de_hierro',
        resultImage:'./Game/Source/pico_y_hacha/hacha_de_hierro.png', level:6, category:'tools',
        description:'Iron axe made from wood and iron',
        resources:[
          {itemId:'mineral_hierro',quantity:3,name:'Iron Ore',image:'./Game/Source/hierro.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'pico_madera', name:'Wooden Pickaxe', resultItem:'pico_de_madera',
        resultImage:'./Game/Source/pico_y_hacha/pico_de_madera.png', level:3, category:'consumables',
        description:'Wooden pickaxe made from wood',
        resources:[
          {itemId:'tablon_de_madera',quantity:1,name:'Wood Plank',image:'./Game/Source/madera.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'pico_de_piedra', name:'Stone Pickaxe', resultItem:'pico_de_piedra',
        resultImage:'./Game/Source/pico_y_hacha/pico_de_piedra.png', level:4, category:'consumables',
        description:'Stone pickaxe made from wood and stone',
        resources:[
          {itemId:'mineral_piedra',quantity:3,name:'Stone',image:'./Game/Source/piedra.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'pico_de_cobre', name:'Copper Pickaxe', resultItem:'pico_de_cobre',
        resultImage:'./Game/Source/pico_y_hacha/pico_de_cobre.png', level:5, category:'consumables',
        description:'Copper pickaxe made from wood and copper',
        resources:[
          {itemId:'mineral_cobre',quantity:3,name:'Copper Ore',image:'./Game/Source/cobre.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null },
      { id:'pico_de_hierro', name:'Iron Pickaxe', resultItem:'pico_de_hierro',
        resultImage:'./Game/Source/pico_y_hacha/pico_de_hierro.png', level:6, category:'consumables',
        description:'Iron pickaxe made from wood and iron',
        resources:[
          {itemId:'mineral_hierro',quantity:3,name:'Iron Ore',image:'./Game/Source/hierro.png'},
          {itemId:'palo',quantity:1,name:'Wood Stick',image:'./Game/Source/palo.png'}
        ], optionalResources:null }
    ];
    this.filteredRecipes = [...this.recipes];
    console.log('📋 Recetas cargadas:', this.recipes.length);
  }

  // FIX 1: setupEventListeners usa delegación — NO busca elementos directos en init
  setupEventListeners() {
    if (this._listenersAttached) return;
    this._listenersAttached = true;

    document.getElementById('crafting-close')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); this.hide();
    });
    document.getElementById('overlay-back')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); this.closeOverlay();
    });
    document.querySelector('.close-details-btn')?.addEventListener('click', () => {
      this.hideDetailsPanel();
    });
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.setCategory(e.currentTarget.dataset.category));
    });

    const searchInput = document.getElementById('crafting-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase(); this.filterRecipes();
      });
      searchInput.addEventListener('focus', () => { this.disablePhaserInput(); this._attachDocumentKeyCapture(); });
      searchInput.addEventListener('blur', () => { this._detachDocumentKeyCapture(); if (!this.isVisible()) this.enablePhaserInput(); });
      searchInput.addEventListener('keydown', (e) => { if (e.key==='Escape'){this.hide();e.preventDefault();} e.stopPropagation(); }, false);
    }

    // FIX 1: Delegación sobre el hub — funciona aunque los botones se creen después
    const hub = document.getElementById('crafting-hub');
    if (hub) {
      hub.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id==='decrease-qty') { e.preventDefault(); e.stopPropagation(); this.adjustQuantity(-1); }
        else if (btn.id==='increase-qty') { e.preventDefault(); e.stopPropagation(); this.adjustQuantity(1); }
        else if (btn.id==='craft-button') { this.craftItem(); }
      });
      hub.addEventListener('input', (e) => {
        if (e.target.id!=='crafting-qty') return;
        const max = this._getDisplayedMax();
        this._setQuantityNoRecalc(Math.max(1, Math.min(max||1, parseInt(e.target.value)||1)));
      });
      hub.addEventListener('keydown', (e) => { if (e.target.id==='crafting-qty') e.stopPropagation(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key==='Escape' && this.isVisible()) {
        const ov = document.getElementById('recipe-overlay');
        if (ov && !ov.classList.contains('hidden')) this.closeOverlay();
        else this.hide();
        e.preventDefault(); e.stopPropagation();
      }
    });
  }

  _getDisplayedMax() {
    return parseInt(document.getElementById('max-craft')?.textContent||'1',10)||1;
  }

  // FIX 3: sin llamar a calculateMaxCraftable
  _setQuantityNoRecalc(quantity) {
    this.craftingQuantity = quantity;
    const el = document.getElementById('crafting-qty');
    if (el) el.value = quantity;
  }

  // FIX 4: guard si no hay receta o max es 0
  adjustQuantity(change) {
    if (!this.selectedRecipe) return;
    const max = this._getDisplayedMax();
    if (max===0) return;
    this._setQuantityNoRecalc(Math.max(1, Math.min(max, this.craftingQuantity+change)));
  }

  setQuantity(quantity) {
    const max = this._getDisplayedMax();
    this._setQuantityNoRecalc(Math.max(1, max>0?Math.min(max,quantity):quantity));
    if (this.selectedRecipe) this.calculateMaxCraftable();
  }

  setCategory(category) {
    this.currentCategory = category||'all';
    document.querySelectorAll('.filter-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.category===this.currentCategory));
    const catEl=document.getElementById('current-category');
    if (catEl) catEl.textContent=this.categories.find(c=>c.id===this.currentCategory)?.name||'Todas';
    this.filterRecipes();
  }

  filterRecipes() {
    this.filteredRecipes = this.currentCategory==='all'
      ? [...this.recipes]
      : this.recipes.filter(r=>r.category===this.currentCategory);
    if (this.searchTerm) {
      this.filteredRecipes = this.filteredRecipes.filter(r=>
        r.name.toLowerCase().includes(this.searchTerm)||
        (r.description&&r.description.toLowerCase().includes(this.searchTerm)));
    }
    this.filteredRecipes.sort((a,b)=>a.level-b.level);
    this.updateRecipesList();
  }

  updateRecipesList() {
    const lc=document.getElementById('recipes-list');
    if (!lc) return;
    lc.innerHTML='';
    if (!this.filteredRecipes.length) {
      lc.innerHTML=`<div class="empty-state">No se encontraron recetas</div>`;
      const av=document.getElementById('available-recipes');
      if(av) av.textContent='0';
      return;
    }
    this.filteredRecipes.forEach(r=>lc.appendChild(this.createRecipeElement(r)));
    const av=document.getElementById('available-recipes');
    if(av) av.textContent=String(this.filteredRecipes.length);
    this.updateRecipesCount();
  }

  createRecipeElement(recipe) {
    const el=document.createElement('div');
    el.className='recipe-item';
    el.dataset.recipeId=recipe.id;
    const canCraft=this.playerLevel>=recipe.level&&this.hasResources(recipe);
    // FIX 5: _esc()
    el.innerHTML=`
      <img src="${this._esc(recipe.resultImage)}" alt="${this._esc(recipe.name)}" class="recipe-item-img">
      <div class="recipe-item-info">
        <h4 class="recipe-item-name">${this._esc(recipe.name)}</h4>
        <div class="recipe-item-meta">
          <div class="recipe-item-level"><span class="level-badge">⭐</span> Nivel ${this._esc(String(recipe.level))}</div>
          <div class="recipe-item-category">
            ${recipe.category==='tools'?'🛠️':recipe.category==='consumables'?'🛠️':recipe.category==='resources'?'📦':'🎲'}
          </div>
          <div class="recipe-item-status ${canCraft?'can-craft':'cannot-craft'}">${canCraft?'✅':'❌'}</div>
        </div>
      </div>`;
    el.addEventListener('click', (e)=>{e.preventDefault();this.handleRecipeClick(recipe.id);});
    el.addEventListener('dblclick',(e)=>{e.preventDefault();e.stopPropagation();this.openRecipeDetails(recipe.id);});
    return el;
  }

  handleRecipeClick(recipeId) {
    const now=Date.now();
    const isDbl=(now-this._lastClickTime<300)&&(this._lastClickedRecipe===recipeId);
    this._lastClickTime=now; this._lastClickedRecipe=recipeId;
    if(isDbl) this.openRecipeDetails(recipeId); else this.selectRecipe(recipeId);
  }

  selectRecipe(recipeId) {
    this.selectedRecipe=this.recipes.find(r=>r.id===recipeId)||null;
    this.selectedOptional=null;
    document.querySelectorAll('.recipe-item').forEach(el=>
      el.classList.toggle('selected',el.dataset.recipeId===recipeId));
    if(window.innerWidth<=900) return;
    this.showDetailsPanel();
  }

  openRecipeDetails(recipeId) {
    this.selectedRecipe=this.recipes.find(r=>r.id===recipeId)||null;
    this.selectedOptional=null;
    document.querySelectorAll('.recipe-item').forEach(el=>
      el.classList.toggle('selected',el.dataset.recipeId===recipeId));
    if(window.innerWidth<=900) this.openOverlayWithRecipe(this.selectedRecipe);
    else this.showDetailsPanel();
  }

  showDetailsPanel() {
    if(!this.selectedRecipe) return;
    const dp=document.querySelector('.crafting-details');
    if(dp){dp.classList.add('visible');this.updateRecipeDetails();}
  }

  hideDetailsPanel() { document.querySelector('.crafting-details')?.classList.remove('visible'); }

  updateRecipeDetails() {
    const nameEl=document.getElementById('recipe-name');
    const imgEl=document.getElementById('recipe-result-img');
    const descEl=document.getElementById('recipe-description');
    const reqEl=document.getElementById('required-level');
    const catEl=document.getElementById('category-name');
    if(!this.selectedRecipe){
      if(nameEl) nameEl.textContent='Selecciona una receta';
      if(reqEl) reqEl.textContent='0'; if(catEl) catEl.textContent='-'; if(descEl) descEl.textContent='';
      const rl=document.getElementById('resources-list'); if(rl) rl.innerHTML='';
      document.getElementById('optional-resources')?.classList.add('hidden');
      const cb=document.getElementById('craft-button'); if(cb) cb.disabled=true;
      return;
    }
    const r=this.selectedRecipe;
    if(nameEl) nameEl.textContent=r.name;
    if(imgEl){imgEl.src=r.resultImage;imgEl.alt=r.name;}
    if(descEl) descEl.textContent=r.description||'';
    if(reqEl) reqEl.textContent=String(r.level);
    if(catEl) catEl.textContent=this.categories.find(c=>c.id===r.category)?.name||r.category;
    this.updateRequiredResources(); this.updateOptionalResources();
    this.calculateMaxCraftable(); this.updateCraftButton(); this.updateInventoryPreview();
  }

  updateRequiredResources() {
    const container=document.getElementById('resources-list');
    if(!container) return;
    container.innerHTML='';
    if(!this.selectedRecipe?.resources) return;
    this.selectedRecipe.resources.forEach(resource=>{
      const pc=this.countPlayerItem(resource.itemId);
      const el=document.createElement('div');
      el.className='resource-item '+(pc>=resource.quantity?'has-enough':'not-enough');
      el.innerHTML=`<img src="${this._esc(resource.image)}" alt="${this._esc(resource.name)}" class="resource-img">
        <div class="resource-info"><div class="resource-name">${this._esc(resource.name)}</div>
        <div class="resource-amount">${pc}/${resource.quantity}</div></div>`;
      container.appendChild(el);
    });
  }

  updateOptionalResources() {
    const oc=document.getElementById('optional-resources');
    const lc=document.getElementById('optional-list');
    if(!oc||!lc) return;
    if(!this.selectedRecipe?.optionalResources){oc.classList.add('hidden');return;}
    oc.classList.remove('hidden'); lc.innerHTML='';
    (this.selectedRecipe.optionalResources[0]||[]).forEach((opt,idx)=>{
      const pc=this.countPlayerItem(opt.itemId);
      const el=document.createElement('div');
      el.className='optional-item'; if(this.selectedOptional===idx) el.classList.add('selected');
      el.innerHTML=`<img src="${this._esc(opt.image)}" alt="${this._esc(opt.name)}" class="resource-img">
        <div class="resource-info"><div class="resource-name">${this._esc(opt.name)}</div>
        <div class="resource-amount">${pc}/${opt.quantity}</div></div>`;
      el.addEventListener('click',()=>this.selectOptional(idx));
      lc.appendChild(el);
    });
  }

  selectOptional(index) {
    this.selectedOptional=index;
    this.updateOptionalResources(); this.calculateMaxCraftable(); this.updateCraftButton();
  }

  // FIX 3: NO llama setQuantity — solo actualiza DOM
  calculateMaxCraftable() {
    const maxEl=document.getElementById('max-craft');
    if(!this.selectedRecipe){if(maxEl)maxEl.textContent='0';return;}
    let max=Infinity;
    (this.selectedRecipe.resources||[]).forEach(r=>{
      max=Math.min(max,Math.floor(this.countPlayerItem(r.itemId)/r.quantity));
    });
    if(this.selectedRecipe.optionalResources?.length&&this.selectedOptional!==null){
      const opt=this.selectedRecipe.optionalResources[0]?.[this.selectedOptional];
      if(opt) max=Math.min(max,Math.floor(this.countPlayerItem(opt.itemId)/opt.quantity));
      else max=0;
    }
    if(this.playerLevel<this.selectedRecipe.level) max=0;
    max=isFinite(max)?Math.max(0,Math.min(99,max)):0;
    if(maxEl) maxEl.textContent=String(max);
    // Ajustar cantidad SIN recursión
    if(this.craftingQuantity>max) this._setQuantityNoRecalc(max>0?max:1);
  }

  // El botón NO se deshabilita por falta de nivel o de recursos: un botón
  // disabled no emite el evento click, así que al pulsarlo no pasaba
  // absolutamente nada y el jugador no recibía ningún aviso. Ahora se marca
  // como bloqueado (clase craft-blocked) pero sigue siendo clickeable, y
  // craftItem() explica el motivo por feedback + notificación.
  updateCraftButton() {
    const cb=document.getElementById('craft-button');
    const fb=document.getElementById('crafting-feedback');
    if(!cb||!fb) return;
    cb.classList.remove('craft-blocked');
    if(!this.selectedRecipe){cb.disabled=true;fb.textContent='';fb.className='crafting-feedback';return;}
    cb.disabled=false;
    if(this.playerLevel<this.selectedRecipe.level){
      cb.classList.add('craft-blocked');
      fb.textContent=`❌ You need level ${this.selectedRecipe.level} (you have ${this.playerLevel})`;
      fb.className='crafting-feedback feedback-error';return;
    }
    if(!this.hasResources(this.selectedRecipe)){
      cb.classList.add('craft-blocked');
      fb.textContent='❌ Resources missing';fb.className='crafting-feedback feedback-error';return;
    }
    fb.textContent='✅ Ready to craft';fb.className='crafting-feedback feedback-success';
  }

  hasResources(recipe) {
    if(recipe.optionalResources?.length&&(!recipe.resources||!recipe.resources.length)){
      const group=recipe.optionalResources[0]||[];
      if(this.selectedOptional!==null&&this.selectedOptional!==undefined){
        const opt=group[this.selectedOptional];
        return opt?this.countPlayerItem(opt.itemId)>=opt.quantity:false;
      }
      return group.some(opt=>this.countPlayerItem(opt.itemId)>=opt.quantity);
    }
    for(const res of (recipe.resources||[])){
      if(this.countPlayerItem(res.itemId)<res.quantity) return false;
    }
    if(recipe.optionalResources?.length&&this.selectedOptional!==null){
      const opt=recipe.optionalResources[0]?.[this.selectedOptional];
      if(opt&&this.countPlayerItem(opt.itemId)<opt.quantity) return false;
    }
    return true;
  }

  // COLA DE CRAFTEO: antes, si ya había un crafteo en curso (this._crafting),
  // el click se DESCARTABA (return sin hacer nada), así que al craftear varios
  // objetos seguidos solo salía el primero. Ahora cada click se ENCOLA: se
  // guarda una foto de lo pedido (receta, cantidad y opción elegida EN ESE
  // momento, porque el jugador puede cambiar de receta mientras se procesa) y
  // los crafteos se ejecutan uno tras otro, en orden. Mismo criterio que la
  // cola de transacciones de ejecutarDivision() en GameScene.
  async craftItem() {
    if(!this.selectedRecipe){this.showFeedback('No recipe selected','error');return;}

    const peticion={
      recipe:this.selectedRecipe,
      quantity:this.craftingQuantity,
      optional:this.selectedOptional
    };

    this._craftPending=(this._craftPending||0)+1;
    if(this._craftPending>1){
      this.showFeedback(`⏳ Queued (${this._craftPending} pending)`,'info');
    }

    this._craftQueue=(this._craftQueue||Promise.resolve())
      .then(()=>this._craftItemInterno(peticion))
      .catch(err=>console.error('❌ Error procesando crafteo en cola:',err))
      .finally(()=>{this._craftPending=Math.max(0,(this._craftPending||1)-1);});

    return this._craftQueue;
  }

  // FIX 7: anti-double-craft con try/finally
  async _craftItemInterno({recipe,quantity,optional}) {
    if(!recipe) return;
    // El nivel puede haber cambiado mientras esta petición esperaba en la cola
    this.updatePlayerLevelFromScene();
    if(this.playerLevel<recipe.level){
      this.showFeedback(`You need level ${recipe.level} (you have ${this.playerLevel})`,'error');return;
    }
    const resultQty=(recipe.resultQuantity||1)*quantity;
    if(!this.canAddItemToInventory(recipe.resultItem,resultQty)){
      this.showFeedback('❌ Not enough space in inventory','error');return;
    }
    this._crafting=true;
    try {
      const isOR=recipe.optionalResources?.length&&(!recipe.resources?.length);
      if(isOR){
        const group=recipe.optionalResources[0]||[];
        if(optional===null||optional===undefined){
          let found=false;
          for(let i=0;i<group.length;i++){
            if(this.countPlayerItem(group[i].itemId)>=group[i].quantity){optional=i;found=true;break;}
          }
          if(!found){this.showFeedback('Not enough resources for any option','error');return;}
        }
        const opt=group[optional];
        const total=opt.quantity*quantity;
        if(this.countPlayerItem(opt.itemId)<total){
          this.showFeedback(`Not enough ${opt.name} (you need ${total}, you have ${this.countPlayerItem(opt.itemId)})`,'error');return;
        }
        if(!(await this.removePlayerItem(opt.itemId,total))){this.showFeedback('Error consuming resources','error');return;}
      } else {
        // Se comprueba TODO antes de consumir nada: si falta un material no se
        // gasta ninguno de los otros.
        for(const resource of (recipe.resources||[])){
          const total=resource.quantity*quantity;
          if(this.countPlayerItem(resource.itemId)<total){
            this.showFeedback(`Not enough ${resource.name} (you need ${total}, you have ${this.countPlayerItem(resource.itemId)})`,'error');return;
          }
        }
        if(recipe.optionalResources?.length&&optional!==null&&optional!==undefined){
          const opt=recipe.optionalResources[0]?.[optional];
          if(opt&&this.countPlayerItem(opt.itemId)<opt.quantity*quantity){
            this.showFeedback(`Not enough ${opt.name} (you need ${opt.quantity*quantity})`,'error');return;
          }
        }

        for(const resource of (recipe.resources||[])){
          const total=resource.quantity*quantity;
          if(!(await this.removePlayerItem(resource.itemId,total))){this.showFeedback('Error consuming resources','error');return;}
        }
        if(recipe.optionalResources?.length&&optional!==null&&optional!==undefined){
          const opt=recipe.optionalResources[0]?.[optional];
          if(opt){
            const total=opt.quantity*quantity;
            if(!(await this.removePlayerItem(opt.itemId,total))){this.showFeedback('Error consuming optional resource','error');return;}
          }
        }
      }
      if(!(await this.addPlayerItem(recipe.resultItem,resultQty))){
        this.showFeedback('❌ Inventory full','error');return;
      }

      // Otorgar experiencia por craftear (mismo criterio que minería/tala/siembra)
      if(this.scene){
        this.scene.nivel_exp=(this.scene.nivel_exp||0)+30;
      }

      this.showFeedback(`You crafted ${quantity} ${recipe.name}(s)!`,'success');
      this.updateRequiredResources(); this.updateOptionalResources();
      this.calculateMaxCraftable(); this.updateCraftButton();
      this.updateInventoryPreview(); this.updateRecipesList();
      const ov=document.getElementById('recipe-overlay');
      if(ov&&!ov.classList.contains('hidden')&&this.selectedRecipe){
        this.updateOverlayResourcesDisplay(this.selectedRecipe);
        this.updateOverlayMaxCraftable(this.selectedRecipe);
        this.updateOverlayCraftButton(this.selectedRecipe);
      }
      if(this.scene?.updateInventoryDisplay) this.scene.updateInventoryDisplay();
      this.savePlayerData();
      console.log('✅ Crafteo completado');
    } finally { this._crafting=false; }
  }

  // El texto de #crafting-feedback es fácil de no ver (queda dentro del panel y
  // se borra a los 3s), así que los avisos importantes salen TAMBIÉN como
  // notificación del juego. Es lo que faltaba, por ejemplo, al intentar
  // craftear sin recursos suficientes.
  showFeedback(message,type) {
    const fb=document.getElementById('crafting-feedback');
    if(fb){
      fb.textContent=message; fb.className=`crafting-feedback feedback-${type}`;
      setTimeout(()=>{if(fb.textContent===message)fb.textContent='';},3000);
    }
    try{
      this.scene?.notifications?.show(message, type==='info'?'info':type);
    }catch(e){ console.warn('No se pudo mostrar la notificación de crafteo:',e); }
  }

  countPlayerItem(itemId) {
    if(this.scene&&typeof this.scene.countItemInAllStorage==='function')
      return this.scene.countItemInAllStorage(itemId);
    if(this.scene&&typeof this.scene.countItem==='function')
      return this.scene.countItem(itemId)?.total||0;
    if(this.scene?.STATE){
      const ci=(slots)=>(!Array.isArray(slots)?0:slots.reduce((s,slot)=>
        slot&&slot.id===itemId?s+(parseInt(slot.quantity)||parseInt(slot.count)||1):s,0));
      return ci(this.scene.STATE.slots)+ci(this.scene.STATE.quickSlots)+ci(this.scene.STATE.chestSlots);
    }
    if(window.playerInventory&&Array.isArray(window.playerInventory)){
      const it=window.playerInventory.find(i=>i.name===itemId||i.id===itemId);
      return it?it.qty||0:0;
    }
    return 0;
  }

  async removePlayerItem(itemId,quantity) {
    // NUEVO: si el item tiene seguimiento on-chain (ItemDefinitions[...].tipo
    // en GameScene), se manda la transacción real que lo descuenta del
    // contrato, en vez de solo borrarlo del inventario local/servidor. Se
    // verifica el éxito comparando el inventario antes/después porque
    // ejecutarDivisionRemove no siempre propaga un booleano confiable.
    const def=this.scene?.ItemDefinitions?.[itemId];
    if(this.scene&&def&&def.tipo&&typeof this.scene.ejecutarDivisionRemove==='function'){
      try{
        const antes=typeof this.scene.contarItemEnInventario==='function'
          ?this.scene.contarItemEnInventario(itemId):this.countPlayerItem(itemId);
        await this.scene.ejecutarDivisionRemove(def.tipo,itemId,def.maxStack||50,quantity);
        const despues=typeof this.scene.contarItemEnInventario==='function'
          ?this.scene.contarItemEnInventario(itemId):this.countPlayerItem(itemId);
        const removidas=Math.max(0,antes-despues);
        if(removidas>=quantity) return true;
        console.warn(`⚠️ Crafteo: solo se confirmaron ${removidas} de ${quantity} ${itemId} on-chain`);
        return false;
      }catch(err){
        console.error('❌ Error descontando material on-chain en crafteo:',err);
        return false;
      }
    }

    if(this.scene&&typeof this.scene.removeItemSmart==='function'){
      const ok=this.scene.removeItemSmart(itemId,quantity);
      if(ok){
        if(typeof this.scene.renderAllSlots==='function') this.scene.renderAllSlots();
        else if(typeof this.scene.renderSlot==='function') for(let i=0;i<30;i++) this.scene.renderSlot(i);
      }
      return ok;
    }
    if(this.scene&&typeof this.scene.removeItem==='function'){this.scene.removeItem(itemId,quantity);return true;}
    if(this.scene?.events){this.scene.events.emit('removeItem',{itemId,quantity});return true;}
    if(this.scene?.STATE){
      const rmv=(slots)=>{
        if(!Array.isArray(slots)) return quantity;
        let rem=quantity;
        for(let i=0;i<slots.length&&rem>0;i++){
          const slot=slots[i];
          if(slot&&slot.id===itemId){
            const qty=parseInt(slot.count||slot.quantity)||1;
            if(qty<=rem){rem-=qty;slots[i]=null;}
            else{slot.count=slot.quantity=qty-rem;rem=0;}
            if(typeof this.scene.renderSlot==='function') this.scene.renderSlot(i);
          }
        }
        return rem;
      };
      let rem=rmv(this.scene.STATE.slots||[]);
      if(rem>0) rem=rmv(this.scene.STATE.quickSlots||[]);
      if(rem>0) rem=rmv(this.scene.STATE.chestSlots||[]);
      return rem===0;
    }
    return false;
  }

  async addPlayerItem(itemId,quantity) {
    const isStackable=this.isItemStackable(itemId);

    // NUEVO: si lo crafteado tiene seguimiento on-chain, se manda la
    // transacción real que lo agrega al contrato (con respaldo off-chain
    // si la transacción no se puede confirmar, para no perder el item ya
    // que los materiales ya se descontaron).
    const def=this.scene?.ItemDefinitions?.[itemId];
    if(this.scene&&def&&def.tipo&&typeof this.scene.ejecutarDivision==='function'){
      try{
        const antes=typeof this.scene.contarItemEnInventario==='function'
          ?this.scene.contarItemEnInventario(itemId):this.countPlayerItem(itemId);
        await this.scene.ejecutarDivision(def.tipo,itemId,def.maxStack||50,quantity);
        const despues=typeof this.scene.contarItemEnInventario==='function'
          ?this.scene.contarItemEnInventario(itemId):this.countPlayerItem(itemId);
        const agregadas=Math.max(0,despues-antes);
        if(agregadas>=quantity) return true;
        const faltan=quantity-agregadas;
        console.warn(`⚠️ Crafteo: solo se confirmaron ${agregadas} de ${quantity} ${itemId} on-chain, agregando ${faltan} de respaldo`);
        if(faltan>0&&typeof this.scene.addItemWithCheck==='function'){
          return this.scene.addItemWithCheck(itemId,faltan)&&true;
        }
        return agregadas>0;
      }catch(err){
        console.error('❌ Error agregando item crafteado on-chain:',err);
        if(typeof this.scene.addItemWithCheck==='function') return this.scene.addItemWithCheck(itemId,quantity);
        return false;
      }
    }

    if(this.scene&&typeof this.scene.addItemWithCheck==='function'){
      const batch=isStackable?Math.min(quantity,this._maxStackSize):1;
      let added=0;
      for(let i=0;i<quantity;i+=batch){
        const toAdd=Math.min(batch,quantity-i);
        if(this.scene.addItemWithCheck(itemId,toAdd)) added+=toAdd; else break;
      }
      return added===quantity;
    }
    if(this.scene&&typeof this.scene.addItem==='function'){
      const batch=isStackable?Math.min(quantity,this._maxStackSize):1;
      for(let i=0;i<quantity;i+=batch) this.scene.addItem(itemId,Math.min(batch,quantity-i));
      return true;
    }
    if(this.scene?.events){this.scene.events.emit('addItem',{itemId,quantity});return true;}
    if(this.scene?.STATE){
      const max=this._maxStackSize; let remaining=quantity;
      const add=(slots)=>{
        if(!Array.isArray(slots)) return remaining;
        if(isStackable){
          for(let i=0;i<slots.length&&remaining>0;i++){
            const slot=slots[i];
            if(slot&&slot.id===itemId){
              const qty=parseInt(slot.count||slot.quantity)||1;
              const space=Math.max(0,max-qty);
              if(space>0){const ta=Math.min(space,remaining);slot.count=slot.quantity=qty+ta;remaining-=ta;
                if(typeof this.scene.renderSlot==='function') this.scene.renderSlot(i);}
            }
          }
        }
        for(let i=0;i<slots.length&&remaining>0;i++){
          if(!slots[i]){
            const ta=isStackable?Math.min(max,remaining):1;
            slots[i]={id:itemId,count:ta,quantity:ta,name:this.getItemName(itemId)};
            remaining-=ta;
            if(typeof this.scene.renderSlot==='function') this.scene.renderSlot(i);
          }
        }
        return remaining;
      };
      remaining=add(this.scene.STATE.slots||[]);
      if(remaining>0) remaining=add(this.scene.STATE.quickSlots||[]);
      if(remaining>0) remaining=add(this.scene.STATE.chestSlots||[]);
      return remaining===0;
    }
    return false;
  }

  getItemName(itemId) {
    for(const recipe of this.recipes){
      for(const r of (recipe.resources||[])) if(r.itemId===itemId) return r.name;
      if(recipe.optionalResources){
        for(const g of recipe.optionalResources) for(const r of g) if(r.itemId===itemId) return r.name;
      }
      if(recipe.resultItem===itemId) return recipe.name;
    }
    const d={madera_pinos:'Madera de Pino',madera_seca:'Madera Seca',madera_con_hojas:'Madera con Hojas',
      tablon_de_madera:'Tabla de Madera',palo:'Palo de Madera',mineral_piedra:'Piedra',
      mineral_cobre:'Mineral Cobre',mineral_hierro:'Mineral Hierro',zanahoria_buena:'Zanahoria',
      balde_vacio:'Balde Vacío',balde_con_agua:'Balde con Agua',hacha_de_madera:'Hacha de Madera',
      hacha_de_piedra:'Hacha de Piedra',hacha_de_cobre:'Hacha de Cobre',hacha_de_hierro:'Hacha de Hierro',
      pico_de_madera:'Pico de Madera',pico_de_piedra:'Pico de Piedra',pico_de_cobre:'Pico de Cobre',
      pico_de_hierro:'Pico de Hierro',zanahoria_cocida:'Zanahoria Cocida',espada_madera:'Espada de Madera'};
    return d[itemId]||itemId;
  }

  updateInventoryPreview() {
    const container=document.getElementById('inventory-items');
    if(!container) return;
    container.innerHTML='';
    const relevant=this.getRelevantInventoryItems();
    if(!relevant.length){container.innerHTML=`<div class="empty-state">Sin ítems relevantes</div>`;return;}
    relevant.forEach(it=>{
      const el=document.createElement('div');
      el.className='inventory-item';
      el.innerHTML=`<img class="inventory-img" src="${this._esc(it.image||'./assets/default-item.png')}" alt="${this._esc(it.name)}">
        <div class="inventory-count">${it.qty}</div>`;
      container.appendChild(el);
    });
  }

  // FIX 9: guard contra resources undefined
  getRelevantInventoryItems() {
    const result=[];
    if(!this.selectedRecipe) return result;
    const all=[...(this.selectedRecipe.resources||[])];
    if(this.selectedRecipe.optionalResources?.length)
      (this.selectedRecipe.optionalResources[0]||[]).forEach(o=>all.push(o));
    const seen=new Set();
    all.forEach(r=>{
      if(!seen.has(r.itemId)){
        seen.add(r.itemId);
        const qty=this.countPlayerItem(r.itemId);
        if(qty>0) result.push({name:r.name,qty,image:r.image,itemId:r.itemId});
      }
    });
    return result.slice(0,12);
  }

  updatePlayerLevelDisplay() {
    const a=document.getElementById('player-level-display');
    const b=document.getElementById('player-levelx');
    if(a) a.textContent=String(this.playerLevel);
    if(b) b.textContent=String(this.playerLevel);
  }

  updateRecipesCount() {
    const el=document.querySelector('.recipes-count');
    if(el) el.textContent=`${this.filteredRecipes.length} recetas`;
  }

  // FIX 1: adjuntar listeners aquí (DOM existe)
  show() {
    const hub=document.getElementById('crafting-hub');
    if(!hub) return;
    this.setupEventListeners(); // adjunta solo la primera vez
    this.updatePlayerLevelFromScene();
    if(this.scene?.player){
      this._playerVelocity={x:this.scene.player.body?.velocity.x??0,y:this.scene.player.body?.velocity.y??0};
      this._wasPlayerMoving=Math.abs(this._playerVelocity.x)>0||Math.abs(this._playerVelocity.y)>0;
      this.scene.player.setVelocity?.(0,0);
      this.scene.player.anims?.stop();
    }
    hub.classList.remove('crafting-hub-hidden');
    hub.classList.add('crafting-hub-visible');
    this.updateInventoryPreview(); this.updateRecipesList(); this.updatePlayerLevelDisplay();
    this.hideDetailsPanel(); this.disablePhaserInput(); this._releaseAllKeys(); this._attachDocumentKeyCapture();
    this._startLevelWatch();
    setTimeout(()=>{const s=document.getElementById('crafting-search-input');if(s){s.focus();s.select();}},100);
    console.log(`🔨 Panel ABIERTO — Nivel: ${this.playerLevel}`);
  }

  // El nivel solo se leía al abrir el panel, así que si el jugador subía de
  // nivel con el crafting abierto seguía viendo el nivel viejo (y las recetas
  // bloqueadas) hasta cerrarlo y volverlo a abrir. Mientras el panel está
  // abierto se relee cada segundo; updatePlayerLevelFromScene() solo repinta
  // cuando el nivel cambió de verdad, así que no cuesta nada.
  _startLevelWatch() {
    this._stopLevelWatch();
    this._levelWatchTimer=setInterval(()=>{
      if(!this.isVisible()){this._stopLevelWatch();return;}
      if(this.updatePlayerLevelFromScene()){
        // Refrescar también el detalle y el overlay abiertos
        if(this.selectedRecipe){this.calculateMaxCraftable();this.updateCraftButton();}
        const ov=document.getElementById('recipe-overlay');
        if(ov&&!ov.classList.contains('hidden')&&this.selectedRecipe){
          this.updateOverlayMaxCraftable(this.selectedRecipe);
          this.updateOverlayCraftButton(this.selectedRecipe);
        }
        console.log(`🔨 Nivel actualizado en caliente: ${this.playerLevel}`);
      }
    },1000);
  }

  _stopLevelWatch() {
    if(this._levelWatchTimer){clearInterval(this._levelWatchTimer);this._levelWatchTimer=null;}
  }

  // FIX 8: resetear cantidad al cerrar
  hide() {
    const hub=document.getElementById('crafting-hub');
    if(!hub) return;
    hub.classList.add('crafting-hub-hidden');
    hub.classList.remove('crafting-hub-visible');
    this._stopLevelWatch();
    this._detachDocumentKeyCapture(); this.enablePhaserInput(); this._releaseAllKeys();
    const s=document.getElementById('crafting-search-input');
    if(s){s.value='';s.blur();}
    this.searchTerm=''; this.selectedRecipe=null; this.selectedOptional=null;
    this.craftingQuantity=1; this._setQuantityNoRecalc(1); // FIX 8
    this._lastClickTime=0; this._lastClickedRecipe=null; this._crafting=false;
    this.closeOverlay(); this.hideDetailsPanel();
    console.log('🔨 Panel CERRADO');
  }

  isVisible() {
    const hub=document.getElementById('crafting-hub');
    return hub?!hub.classList.contains('crafting-hub-hidden'):false;
  }

  toggle() { if(this.isVisible()) this.hide(); else this.show(); }

  disablePhaserInput() {
    if(!this.scene?.input?.keyboard) return;
    try{this._phaserInputPreviouslyEnabled=this.scene.input.keyboard.enabled;this.scene.input.keyboard.enabled=false;}
    catch(e){console.warn('No se pudo desactivar input de Phaser:',e);}
  }

  enablePhaserInput() {
    if(!this.scene?.input?.keyboard) return;
    try{this.scene.input.keyboard.enabled=this._phaserInputPreviouslyEnabled??true;this._phaserInputPreviouslyEnabled=null;}
    catch(e){console.warn('No se pudo reactivar input de Phaser:',e);}
  }

  _attachDocumentKeyCapture() {
    if(this._documentKeyCaptureHandler) return;
    this._documentKeyCaptureHandler=(e)=>{
      if(!this.isVisible()) return;
      const movKeys=['w','a','s','d','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '];
      const active=document.activeElement;
      const isInput=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable);
      if(movKeys.includes(e.key)&&!isInput){e.preventDefault();e.stopPropagation();return false;}
    };
    document.addEventListener('keydown',this._documentKeyCaptureHandler,true);
  }

  _detachDocumentKeyCapture() {
    if(!this._documentKeyCaptureHandler) return;
    document.removeEventListener('keydown',this._documentKeyCaptureHandler,true);
    this._documentKeyCaptureHandler=null;
  }

  // FIX 10: guard contra Phaser no disponible
  _releaseAllKeys() {
    if(!this.scene?.input?.keyboard) return;
    try{
      const keys=this.scene.input.keyboard.keys||{};
      Object.values(keys).forEach(k=>{if(k){k.isDown=false;k.isUp=true;k.reset?.();}});
      ['W','A','S','D'].forEach(kc=>{
        const k=this.scene.input.keyboard.addKey(kc);
        if(k){k.isDown=false;k.isUp=true;}
      });
      if(typeof Phaser!=='undefined'&&Phaser?.Input?.Keyboard?.KeyCodes){
        const{UP,DOWN,LEFT,RIGHT}=Phaser.Input.Keyboard.KeyCodes;
        [UP,DOWN,LEFT,RIGHT].forEach(kc=>{
          const k=this.scene.input.keyboard.addKey(kc);
          if(k){k.isDown=false;k.isUp=true;}
        });
      }
      console.log('🎮 Todas las teclas liberadas');
    }catch(e){console.warn('Error liberando teclas:',e);}
  }

  savePlayerData() {
    this.scene?.events?.emit('savePlayerData');
    this.scene?.queuedAction?.({type:'craftingCompleted'});
  }

  // FIX 2: Overlay — eventos adjuntados SINCRÓNICAMENTE
  openOverlayWithRecipe(recipe) {
    const overlay=document.getElementById('recipe-overlay');
    const content=document.getElementById('overlay-content');
    if(!overlay||!content||!recipe) return;
    if(recipe.optionalResources?.length&&(!recipe.resources?.length)) this.selectedOptional=null;
    const maxCraftable=this.calculateOverlayMaxCraftable(recipe);
    content.innerHTML=`
      <div class="recipe-header">
        <img src="${this._esc(recipe.resultImage)}" alt="${this._esc(recipe.name)}" class="recipe-result-img">
        <div class="recipe-info">
          <h3 class="recipe-name">${this._esc(recipe.name)}</h3>
          <div class="recipe-description">${this._esc(recipe.description||'')}</div>
          <div class="recipe-meta">
            <div class="recipe-level">⭐ Required level: ${this._esc(String(recipe.level))} (you have ${this.playerLevel})</div>
            <div class="recipe-category">${this._esc(this.categories.find(c=>c.id===recipe.category)?.name||recipe.category)}</div>
          </div>
        </div>
      </div>
      ${recipe.resources?.length?`<div class="required-resources"><h4>📦 Required resources:</h4>
        <div class="resources-list" id="overlay-resources-list"></div></div>`:''}
      ${recipe.optionalResources?.length?`<div class="optional-resources" id="overlay-optional-resources">
        <h4>🎯 ${recipe.resources?.length?'Optional resource (choose one):':'Choose one of these:'}</h4>
        <div class="optional-list" id="overlay-optional-list"></div></div>`:''}
      <div class="crafting-quantity"><h4>Quantity to craft:</h4>
        <div class="quantity-controls">
          <button id="overlay-decrease-qty" class="qty-btn" type="button">-</button>
          <input type="number" id="overlay-crafting-qty" value="${this.craftingQuantity}" min="1" max="${maxCraftable}" step="1" class="qty-input">
          <button id="overlay-increase-qty" class="qty-btn" type="button">+</button>
          <div class="max-possible">Max: <span id="overlay-max-craft">${maxCraftable}</span></div>
        </div>
      </div>
      <div class="crafting-actions">
        <button id="overlay-craft-button" class="craft-btn" ${maxCraftable===0?'disabled':''} type="button">
          <span class="craft-icon">⚒️</span> Craft
        </button>
        <div class="crafting-feedback" id="overlay-crafting-feedback"></div>
      </div>`;

    if(recipe.resources?.length){
      const rl=content.querySelector('#overlay-resources-list');
      recipe.resources.forEach(r=>{
        const qty=this.countPlayerItem(r.itemId);
        const el=document.createElement('div');
        el.className='resource-item '+(qty>=r.quantity?'has-enough':'not-enough');
        el.innerHTML=`<img src="${this._esc(r.image)}" alt="${this._esc(r.name)}" class="resource-img">
          <div class="resource-info"><div class="resource-name">${this._esc(r.name)}</div>
          <div class="resource-amount">${qty}/${r.quantity}</div></div>`;
        rl.appendChild(el);
      });
    }
    if(recipe.optionalResources?.length){
      const ol=content.querySelector('#overlay-optional-list');
      (recipe.optionalResources[0]||[]).forEach((opt,idx)=>{
        const qty=this.countPlayerItem(opt.itemId);
        const el=document.createElement('div');
        el.className='optional-item'+(this.selectedOptional===idx?' selected':'');
        el.dataset.optionalIndex=idx;
        el.innerHTML=`<img src="${this._esc(opt.image)}" alt="${this._esc(opt.name)}" class="resource-img">
          <div class="resource-info"><div class="resource-name">${this._esc(opt.name)}</div>
          <div class="resource-amount">${qty}/${opt.quantity}</div></div>`;
        el.addEventListener('click',()=>{
          ol.querySelectorAll('.optional-item').forEach(i=>i.classList.remove('selected'));
          el.classList.add('selected'); this.selectedOptional=idx;
          const nm=this.calculateOverlayMaxCraftable(recipe);
          this.updateOverlayQuantityControls(nm); this.updateOverlayCraftButton(recipe);
        });
        ol.appendChild(el);
      });
    }

    // FIX 2: sincrónico
    this._setupOverlayEvents(content,recipe);
    overlay.classList.remove('hidden'); overlay.classList.add('visible');
    this.disablePhaserInput();
  }

  _setupOverlayEvents(content,recipe) {
    const getMax=()=>parseInt(content.querySelector('#overlay-max-craft')?.textContent||'1',10)||1;
    const qtyInput=content.querySelector('#overlay-crafting-qty');
    const decBtn=content.querySelector('#overlay-decrease-qty');
    const incBtn=content.querySelector('#overlay-increase-qty');
    const craftBtn=content.querySelector('#overlay-craft-button');
    const feedback=content.querySelector('#overlay-crafting-feedback');

    decBtn?.addEventListener('click',(e)=>{
      e.preventDefault();e.stopPropagation();
      if(!qtyInput) return;
      const nv=Math.max(1,(parseInt(qtyInput.value)||1)-1);
      qtyInput.value=nv; this._setQuantityNoRecalc(nv);
    });
    incBtn?.addEventListener('click',(e)=>{
      e.preventDefault();e.stopPropagation();
      if(!qtyInput) return;
      const nv=Math.min(getMax(),(parseInt(qtyInput.value)||1)+1);
      qtyInput.value=nv; this._setQuantityNoRecalc(nv);
    });
    qtyInput?.addEventListener('input',(e)=>{
      const max=getMax();
      const nv=Math.max(1,Math.min(max,parseInt(e.target.value)||1));
      e.target.value=nv; this._setQuantityNoRecalc(nv);
    });
    qtyInput?.addEventListener('keydown',(e)=>e.stopPropagation());

    craftBtn?.addEventListener('click',()=>{
      if(recipe.optionalResources?.length&&(!recipe.resources?.length)&&this.selectedOptional===null){
        if(feedback){feedback.textContent='Please select a resource.';feedback.className='crafting-feedback feedback-error';}
        return;
      }
      this.selectedRecipe=recipe;
      this.craftItem();
      const mf=document.getElementById('crafting-feedback');
      if(mf&&feedback){feedback.textContent=mf.textContent;feedback.className=mf.className;}
      this.updateOverlayResourcesDisplay(recipe);
      const nm=this.calculateOverlayMaxCraftable(recipe);
      this.updateOverlayQuantityControls(nm); this.updateOverlayCraftButton(recipe);
    });
  }

  calculateOverlayMaxCraftable(recipe) {
    let max=Infinity;
    (recipe.resources||[]).forEach(r=>{
      max=Math.min(max,Math.floor(this.countPlayerItem(r.itemId)/r.quantity));
    });
    if(recipe.optionalResources?.length){
      if(this.selectedOptional!==null){
        const opt=recipe.optionalResources[0]?.[this.selectedOptional];
        if(opt) max=Math.min(max,Math.floor(this.countPlayerItem(opt.itemId)/opt.quantity));
        else max=0;
      } else if(!recipe.resources?.length) max=0;
    }
    if(this.playerLevel<recipe.level) max=0;
    return Math.max(0,Math.min(99,isFinite(max)?max:0));
  }

  updateOverlayQuantityControls(maxCraftable) {
    const content=document.getElementById('overlay-content');
    if(!content) return;
    const ms=content.querySelector('#overlay-max-craft');
    const qi=content.querySelector('#overlay-crafting-qty');
    if(ms) ms.textContent=String(maxCraftable);
    if(qi){
      qi.max=maxCraftable;
      const cur=parseInt(qi.value)||1;
      if(cur>maxCraftable){qi.value=maxCraftable>0?maxCraftable:1;this._setQuantityNoRecalc(parseInt(qi.value));}
    }
  }

  updateOverlayResourcesDisplay(recipe) {
    const content=document.getElementById('overlay-content');
    if(!content||!recipe) return;
    if(recipe.resources?.length){
      const rl=content.querySelector('#overlay-resources-list');
      if(rl){
        rl.innerHTML='';
        recipe.resources.forEach(r=>{
          const qty=this.countPlayerItem(r.itemId);
          const el=document.createElement('div');
          el.className='resource-item '+(qty>=r.quantity?'has-enough':'not-enough');
          el.innerHTML=`<img src="${this._esc(r.image)}" alt="${this._esc(r.name)}" class="resource-img">
            <div class="resource-info"><div class="resource-name">${this._esc(r.name)}</div>
            <div class="resource-amount">${qty}/${r.quantity}</div></div>`;
          rl.appendChild(el);
        });
      }
    }
    if(recipe.optionalResources?.length){
      const ol=content.querySelector('#overlay-optional-list');
      if(ol){
        ol.innerHTML='';
        (recipe.optionalResources[0]||[]).forEach((opt,idx)=>{
          const qty=this.countPlayerItem(opt.itemId);
          const el=document.createElement('div');
          el.className='optional-item'+(this.selectedOptional===idx?' selected':'');
          el.dataset.optionalIndex=idx;
          el.innerHTML=`<img src="${this._esc(opt.image)}" alt="${this._esc(opt.name)}" class="resource-img">
            <div class="resource-info"><div class="resource-name">${this._esc(opt.name)}</div>
            <div class="resource-amount">${qty}/${opt.quantity}</div></div>`;
          el.addEventListener('click',()=>{
            ol.querySelectorAll('.optional-item').forEach(i=>i.classList.remove('selected'));
            el.classList.add('selected');this.selectedOptional=idx;
            const nm=this.calculateOverlayMaxCraftable(recipe);
            this.updateOverlayQuantityControls(nm);this.updateOverlayCraftButton(recipe);
          });
          ol.appendChild(el);
        });
      }
    }
  }

  updateOverlayMaxCraftable(recipe){const nm=this.calculateOverlayMaxCraftable(recipe);this.updateOverlayQuantityControls(nm);return nm;}

  updateOverlayCraftButton(recipe){
    const content=document.getElementById('overlay-content');
    if(!content) return;
    const cb=content.querySelector('#overlay-craft-button');
    const fb=content.querySelector('#overlay-crafting-feedback');
    if(!cb||!fb) return;
    // Mismo criterio que updateCraftButton(): bloqueado pero clickeable, para
    // que el jugador reciba el aviso del motivo al pulsarlo.
    cb.disabled=false; cb.classList.remove('craft-blocked');
    if(this.playerLevel<recipe.level){
      cb.classList.add('craft-blocked');
      fb.textContent=`❌ You need level ${recipe.level} (you have ${this.playerLevel})`;
      fb.className='crafting-feedback feedback-error';return;
    }
    if(recipe.optionalResources?.length&&(!recipe.resources?.length)){
      if(this.selectedOptional===null){cb.classList.add('craft-blocked');fb.textContent='❌ Please select a resource';fb.className='crafting-feedback feedback-error';return;}
      const opt=recipe.optionalResources[0]?.[this.selectedOptional];
      if(!opt||this.countPlayerItem(opt.itemId)<opt.quantity){cb.classList.add('craft-blocked');fb.textContent='❌ Not enough resources';fb.className='crafting-feedback feedback-error';return;}
    } else {
      const allOk=(recipe.resources||[]).every(r=>this.countPlayerItem(r.itemId)>=r.quantity);
      let optOk=true;
      if(recipe.optionalResources?.length&&this.selectedOptional!==null){
        const opt=recipe.optionalResources[0]?.[this.selectedOptional];
        if(opt&&this.countPlayerItem(opt.itemId)<opt.quantity) optOk=false;
      }
      if(!allOk||!optOk){cb.classList.add('craft-blocked');fb.textContent='❌ Not enough resources';fb.className='crafting-feedback feedback-error';return;}
    }
    fb.textContent='✅ Ready to craft';fb.className='crafting-feedback feedback-success';
  }

  closeOverlay(){
    const ov=document.getElementById('recipe-overlay');
    if(!ov) return;
    ov.classList.add('hidden');ov.classList.remove('visible');
    if(this.selectedRecipe?.optionalResources?.length&&(!this.selectedRecipe.resources?.length)) this.selectedOptional=null;
    if(!this.isVisible()) this.enablePhaserInput();
  }

  setPlayerLevel(level){this.playerLevel=level;this.updatePlayerLevelDisplay();this.updateRecipesList();if(this.selectedRecipe)this.updateCraftButton();}
  refreshPlayerLevel(){return this.updatePlayerLevelFromScene();}
  loadRecipes(customRecipes){if(Array.isArray(customRecipes)){this.recipes=customRecipes;this.filterRecipes();}}

  debugSlotsForItem(itemId){
    console.log(`🔍 === DEPURACIÓN DE ${itemId} ===`);
    if(!this.scene?.STATE){console.log('No STATE');return 0;}
    let total=0;
    ['slots','quickSlots','chestSlots'].forEach(name=>{
      const arr=this.scene.STATE[name];
      if(!Array.isArray(arr)){console.log(`   ${name}: no es array`);return;}
      let sub=0;
      arr.forEach((slot,i)=>{
        if(slot?.id===itemId){const q=parseInt(slot.quantity||slot.count)||1;console.log(`   ${name}[${i}]: ${q}`);sub+=q;}
      });
      console.log(`   ${name} TOTAL: ${sub}`);total+=sub;
    });
    console.log(`📊 TOTAL: ${total}`);return total;
  }
}

window.CraftingSystem=window.CraftingSystem||CraftingSystem;

window.debugCraftingSystem=function(itemId='palo'){
  const scene=window.game?.scene?.keys?.GameScene;
  if(scene?.craftingSystem){scene.craftingSystem.debugSlotsForItem(itemId);return true;}
  console.error('No se puede acceder al CraftingSystem');return false;
};
window.updateCraftingLevel=function(){
  const scene=window.game?.scene?.keys?.GameScene;
  if(scene?.craftingSystem){const u=scene.craftingSystem.refreshPlayerLevel();console.log(`🎮 Nivel actualizado: ${scene.craftingSystem.playerLevel}`);return u;}
  console.error('No se puede acceder al CraftingSystem');return false;
};
window.getCraftingLevel=function(){return window.game?.scene?.keys?.GameScene?.craftingSystem?.playerLevel??0;};