export default class LoadingScenegame extends PIXI.Container {
  constructor(app) {
    super();
    this.app = app;

    // bind explícito para evitar pérdida de `this` por SceneAdapter/Pixi
    this.preload = this.preload.bind(this);
    this.create  = this.create.bind(this);
    this.update  = this.update.bind(this);
    this.loadx   = this.loadx.bind(this);
    this.initialize = this.initialize.bind(this);
    this.loadPlayerData = this.loadPlayerData.bind(this);
    this.checkTransition = this.checkTransition.bind(this);
    this.renderSlot = this.renderSlot.bind(this);

    // estado / refs
    this.playerName = null;
    this.currentAccount = null;
    this.elipeticiones = 0;
    this._intervalId = null;

    this.serverclient = (this.elipeticiones === 0)
      ? 'http://localhost:3000/api'
      : 'https://grasslandforest.xyz/api';

    this.token = null;

    // Game state
    this.STATE = {
      slots: new Array(40).fill(null),
      quickSlots: new Array(7).fill(null),
      selectedItem: null
    };

    // Player properties defaults
    this.posicionplayerx  = 100;
    this.posicionplayery  = 100;
    this.vidaPorcentaje   = 100;
    this.aguaPorcentaje   = 100;
    this.comidaPorcentaje = 100;
    this.speed            = 2.7;
    this.mundo            = 1;
    this.moneda           = 0;
    this.nivel            = 0;
    this.nivel_exp        = 0;
    this.sabiduria        = 0;
    this.sabiduria_exp    = 0;
    this.fuerza           = 0;
    this.fuerza_exp       = 0;
    this.agricultura      = 0;
    this.agricultura_exp  = 0;
    this.misiones         = 0;
    this.Username         = '---';

    // Item definitions (sin audio)
    this.ItemDefinitions = {
      item_1: { src: './Game/Source/recurso.png', maxStack: 10 },
      item_2: { src: './Game/Source/recurso2.png', maxStack: 5 },
      item_3: { src: './Game/Source/tijeras.png', maxStack: 20 }
    };
  }

  // -----------------------
  // Auth helper: obtiene playerName desde backend con bearer token guardado
  // -----------------------
  async loadx() {
    let tokens = {};
    try {
      tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
    } catch (err) {
      try { sessionStorage.removeItem('authTokens'); } catch(e) {}
      tokens = {};
    }

    const accessToken = tokens.accessToken || tokens.token || null;

    // opcional: exponer globalmente (tu código previo lo esperaba)
    globalThis.playerName = undefined;
    globalThis.currentAccount = undefined;

    if (!accessToken) {
      return { ok: false, reason: 'no-token' };
    }

    const url = `${this.serverclient.replace(/\/$/, '')}/auth/me`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
        // credentials: 'include' // activar solo si usas cookies de sesión
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          try { sessionStorage.removeItem('authTokens'); } catch(e) {}
        }
        return { ok: false, reason: 'bad-response', status: resp.status };
      }

      let data;
      try {
        data = await resp.json();
      } catch (err) {
        return { ok: false, reason: 'invalid-json' };
      }

      const address = data.address || data.playerName || data.account || null;
      const isAuth = (data.authenticated === true) || !!address;

      if (isAuth && address) {
        // asigna tanto a this como a globalThis por compatibilidad
        this.playerName = address;
        this.currentAccount = address;
        globalThis.playerName = address;
        globalThis.currentAccount = address;
        return { ok: true, address, raw: data };
      } else {
        try { sessionStorage.removeItem('authTokens'); } catch(e) {}
        return { ok: false, reason: 'not-authenticated', raw: data };
      }
    } catch (err) {
      if (err instanceof TypeError) {
        console.error('Posible CORS o error de red. Verifica cabeceras CORS en backend.');
      }
      try { sessionStorage.removeItem('authTokens'); } catch(e) {}
      return { ok: false, reason: 'network-error', error: err };
    }
  }

  // -----------------------
  // Phaser/Pixi lifecycle handlers
  // -----------------------
  async preload() {
    // Llamada segura a loadx (binding evita "not a function")
    const r = await this.loadx();
    //console.log('xxPlayer name set to:', globalThis.playerName);
    //console.log('xxCurrent account set to:', globalThis.currentAccount);

    // Hide loading bar UI safely
    const yellow = document.getElementById('yellow-bar-container');
    if (yellow) yellow.style.display = 'none';

    const el = document.getElementById('loading-hub');
    if (el) el.style.display = 'flex';

    // No bloqueamos: initialize() comprueba this.playerName antes de hacer su trabajo
    // pero como ya hemos hecho await loadx, this.playerName estará presente si todo fue OK.
    this.initialize().catch(err => console.error('initialize error (preload):', err));
  }

  create(resources, api) {
    // logs para verificar

    // iniciar poll de transición (limpiar antes si había otro)
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = setInterval(this.checkTransition, 2000);
  }

  update(delta) {
    // placeholder si necesitas lógica por frame
  }


    async checkTransition() {
        // Ocultar loader si existe
        const el = document.getElementById('loading-hub');
        if (el) el.style.display = 'none';

        const mundoNum = parseInt(this.mundo, 10);
        let nextKey = null;

        if (mundoNum === 1) nextKey = 'gamescene';
        else if (mundoNum === 2) nextKey = 'tiendajuego';

        if (nextKey) {
            console.log('Cambiando a', nextKey);

            if (this._manager) {
                // Cambia de escena usando SceneManager
                await this._manager.start(nextKey);
            } else {
                console.error('SceneManager no encontrado');
            }

            // Limpiar intervalo para que no se siga llamando
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
        }
    }

    async destroy() {
        console.log('Destroying LoadingScenegame');

        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }

        if (this.container) {
            this.container.removeChildren();
        }

        // Si quieres, también puedes eliminar texturas u otros recursos PIXI
    }

  hideLoading() {
    const el = document.getElementById('loading-hub');
    if (el) el.style.display = 'none';
  }

  // -----------------------
  // Auth & Data Flow (initialize, loadPlayerData, reauth, save)
  // -----------------------
  tokenValido(token) {
    return typeof token === 'string' && token.split('.').length === 3;
  }

  async initialize() {
    // Si playerName no está presente no intentamos
    if (!this.playerName) {
      console.log('initialize: no playerName disponible, abortando.');
      return;
    }
  
    let tokens = {};
    try {
      tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
    } catch (err) {
      try { sessionStorage.removeItem('authTokens'); } catch(e) {}
      tokens = {};
    }

    const accessToken = tokens.accessToken || tokens.token || null;

    // opcional: exponer globalmente (tu código previo lo esperaba)
    globalThis.playerName = undefined;
    globalThis.currentAccount = undefined;

    if (!accessToken) {
      return { ok: false, reason: 'no-token' };
    }

    try {
      const authRes = await fetch(`${this.serverclient}/auth`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playerName: this.playerName })
      });

      if (!authRes.ok) {
        console.error('Auth fallido', authRes.status);
        return;
      }

      const { token } = await authRes.json();
      this.token = token;

      await this.loadPlayerData();
    } catch (err) {
      console.error('Error en initialize:', err);
    }
  }

  async loadPlayerData() {
    
    let tokens = {};
    try {
      tokens = JSON.parse(sessionStorage.getItem('authTokens') || '{}');
    } catch (err) {
      try { sessionStorage.removeItem('authTokens'); } catch(e) {}
      tokens = {};
    }

    const accessToken = tokens.accessToken || tokens.token || null;

    // opcional: exponer globalmente (tu código previo lo esperaba)
    globalThis.playerName = undefined;
    globalThis.currentAccount = undefined;

    if (!accessToken) {
      console.log('No auth token in sessionStorage');
      return { ok: false, reason: 'no-token' };
    }

    try {
      const res = await fetch(`${this.serverclient}/load/${encodeURIComponent(this.playerName)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) {
        console.error('loadPlayerData: respuesta no JSON:', text);
        return;
      }

      if (!res.ok) {
        console.error('Error al cargar datos:', data);
        return;
      }

      // Reset state and fill
      this.STATE = { slots: new Array(40).fill(null), quickSlots: new Array(7).fill(null), selectedItem: null };

      data.inventory?.forEach(s => {
        if (typeof s.id === 'number' && s.objeto && s.id < 40)
          this.STATE.slots[s.id] = { id: s.objeto, count: s.cantidad };
      });

      data.chest?.forEach(s => {
        if (typeof s.id === 'number' && s.objeto && s.id < 7)
          this.STATE.quickSlots[s.id] = { id: s.objeto, count: s.cantidad };
      });

      // Render slots (seguro)
      for (let i = 0; i < 40; i++) this.renderSlot(i);
      for (let i = 0; i < 7; i++) this.renderSlot(i);

      // Assign props safely
      const props = ['posicionplayerx','posicionplayery','vidaPorcentaje','aguaPorcentaje','comidaPorcentaje','speed','mundo','moneda','nivel','nivel_exp','sabiduria','sabiduria_exp','fuerza','fuerza_exp','agricultura','agricultura_exp','misiones','Username'];
      props.forEach(prop => {
        if (data[prop] !== undefined && data[prop] !== null) {
          if (prop === 'mundo') {
            const parsed = parseInt(data[prop], 10);
            this.mundo = Number.isNaN(parsed) ? this.mundo : parsed;
          } else {
            this[prop] = data[prop];
          }
        }
      });

      // Optional: update visible player sprite if exists
      if (this.player && typeof this.player.setVisible === 'function') {
        this.player.setVisible(true);
        this.player.x = this.posicionplayerx;
        this.player.y = this.posicionplayery;
      }

      console.log('Datos cargados exitosamente. mundo =', this.mundo);
    } catch (e) {
      console.error('Error de red en loadPlayerData:', e);
      if (e instanceof TypeError) {
        console.error('Posible problema de CORS o de red con', this.serverclient);
      }
    }
  }

  // Render inventory and quick-slot UI
  renderSlot(index) {
    // Inventory
    const invDiv = document.querySelector(`.inv-slot[data-slot-index="${index}"]`);
    if (invDiv) {
      invDiv.innerHTML = '';
      const item = this.STATE.slots[index];
      if (item && this.ItemDefinitions[item.id]) {
        const img = document.createElement('img');
        img.src = this.ItemDefinitions[item.id].src;
        img.alt = item.id;
        invDiv.appendChild(img);
        if (item.count > 1) {
          const span = document.createElement('span'); span.classList.add('item-count'); span.textContent = 'x' + item.count;
          invDiv.appendChild(span);
        }
      }
      invDiv.classList.remove('highlight');
    }

    // Quick slots
    const quickDiv = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
    if (quickDiv) {
      quickDiv.innerHTML = '';
      const item = this.STATE.quickSlots[index];
      if (item && this.ItemDefinitions[item.id]) {
        const img = document.createElement('img'); img.src = this.ItemDefinitions[item.id].src; img.alt = item.id;
        quickDiv.appendChild(img);
        if (item.count > 1) {
          const span = document.createElement('span'); span.classList.add('item-count'); span.textContent = 'x' + item.count;
          quickDiv.appendChild(span);
        }
      }
      quickDiv.classList.remove('highlight');
    }
  }
}
