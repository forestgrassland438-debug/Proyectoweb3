// hub.js - manages the transaction log UI and persistence
class hub {
  constructor(options = {}) {
    this.container = document.getElementById('tx-hub');
    this.closeBtn = document.getElementById('tx-hub-close');
    this.tabs = document.querySelectorAll('.tx-tab');
    this.tabContents = document.querySelectorAll('.tx-tab-content');
    this.refreshBtn = document.getElementById('tx-refresh');
    this.statusSpan = document.getElementById('tx-status-text');
    
    // List containers
    this.interactionList = document.getElementById('tx-list-interaction');
    this.itemsList = document.getElementById('tx-list-items');
    
    // Callback for retry button (override from Phaser)
    this.onRetry = options.onRetry || ((txData) => {
      console.log('Retry transaction:', txData);
    });
    
    // Current user (set after login)
    this.playerName = null;
    this.playerAddress = null;
    
    // Local cache of transactions
    this.transactions = {
      interaction: [],
      items: []
    };
    
    // 🔧 NUEVO: URL base del backend (vacío = relativo al mismo origen)
    this.baseUrl = options.baseUrl || '';
    this._destroyed = false;
    this._userRevision = 0;
    this._loadRevision = 0;
    this._listeners = [];
    this._requests = new Set();
    this._copyTimers = new Map();
    this._retryStates = new Map();

    // FIX: si el HTML de esta página no incluye el panel #tx-hub, no podemos
    // adjuntar listeners (this.closeBtn.addEventListener lanzaría TypeError y
    // rompería el resto del script). Se desactiva el hub con un aviso claro.
    if (!this.container || !this.closeBtn || !this.refreshBtn ||
        !this.statusSpan || !this.interactionList || !this.itemsList) {
      console.warn('hub.js: elementos #tx-hub no encontrados en el DOM — hub de transacciones desactivado en esta página');
      this.disabled = true;
      return;
    }
    this.disabled = false;

    this.initEvents();
    this.loadFromBackend(); // load when hub opens
  }

  initEvents() {
    // Close button
    this._listen(this.closeBtn, 'click', () => this.hide());

    // Tabs
    this.tabs.forEach(tab => {
      this._listen(tab, 'click', () => {
        const target = tab.dataset.tab;
        this.switchTab(target);
      });
    });

    // Refresh button
    this._listen(this.refreshBtn, 'click', () => this.loadFromBackend());

    // Make draggable (simple)
    this.makeDraggable(this.container);
  }

  _listen(target, event, handler) {
    target.addEventListener(event, handler);
    this._listeners.push(() => target.removeEventListener(event, handler));
  }

  _isCurrentUser(revision) {
    return !this._destroyed && revision === this._userRevision;
  }

  _abortRequests() {
    for (const controller of this._requests) controller.abort();
    this._requests.clear();
  }

  async _request(url, options = {}, readJson = false, replaceLoad = false) {
    if (this._destroyed) throw new Error('Transaction hub is closed');
    const controller = new AbortController();
    if (replaceLoad) {
      if (this._loadController) this._loadController.abort();
      this._loadController = controller;
    }
    const timeout = setTimeout(() => controller.abort(), 10000);
    this._requests.add(controller);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error('Transaction history request failed');
      // Keep the deadline active while reading the response body as well.
      return readJson ? await response.json() : response;
    } finally {
      clearTimeout(timeout);
      this._requests.delete(controller);
      if (this._loadController === controller) this._loadController = null;
    }
  }

  makeDraggable(el) {
    let offsetX, offsetY;
    const header = el.querySelector('.tx-hub-header');
    if (!header) return; // FIX: sin cabecera no hay arrastre, pero tampoco crash
    this._listen(header, 'mousedown', (e) => {
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    const onMouseMove = (e) => {
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    this._endDrag = onMouseUp;
  }
  
  switchTab(tabId) {
    if (this.disabled || this._destroyed) return;
    const tab = Array.from(this.tabs).find(item => item.dataset.tab === tabId);
    const content = Array.from(this.tabContents).find(item => item.id === `tx-${tabId}`);
    if (!tab || !content) return;
    this.tabs.forEach(t => t.classList.remove('active'));
    this.tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    content.classList.add('active');
  }
  
  // Show/hide panel
  show() {
    if (this.disabled || this._destroyed) return;
    this.container.classList.remove('tx-hub-hidden');
    this.container.classList.add('tx-hub-visible');
    this.loadFromBackend(); // refresh on open
  }
  
  hide() {
    if (this.disabled || this._destroyed) return;
    if (this._endDrag) this._endDrag();
    this.container.classList.remove('tx-hub-visible');
    this.container.classList.add('tx-hub-hidden');
  }
  
  toggle() {
    if (this.disabled || this._destroyed) return;
    if (this.container.classList.contains('tx-hub-visible')) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  // Set current user (call after login)
  setUser(playerName, address) {
    if (this._destroyed) return;
    if (this.playerName !== playerName || this.playerAddress !== address) {
      this._userRevision = (this._userRevision || 0) + 1;
      this.transactions = { interaction: [], items: [] };
      this._loadRevision++;
      this._abortRequests();
      this._retryStates.clear();
      if (!this.disabled) { this.renderCategory('interaction'); this.renderCategory('items'); }
    }
    this.playerName = playerName;
    this.playerAddress = address;
  }
  
  // Add a transaction (called from Phaser)
  addTransaction(category, data) {
    // category: 'interaction' or 'items'
    // data: { name, quantity, hash, status, hiddenData }
    if (this.disabled) return;
    // FIX: una categoría desconocida hacía crash en this.transactions[category].push
    if (!['interaction', 'items'].includes(category)) {
      console.warn(`TransactionHub: categoría desconocida "${category}" (se esperaba 'interaction' o 'items')`);
      return;
    }
    if (!this.playerName) {
      console.warn('TransactionHub: No user set, cannot save');
      return;
    }
    const revision = this._userRevision;
    this._loadRevision++;
    const tx = {
      ...data,
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      playerName: this.playerName,
      address: this.playerAddress,
      category,
      timestamp: new Date().toISOString()
    };
    
    // Optimistic UI update
    this.transactions[category].push(tx);
    if (this.transactions[category].length > 200) this.transactions[category].splice(0, this.transactions[category].length - 200);
    this.renderCategory(category);
    
    // Save to backend
    this.saveToBackend(tx).then(() => {
      if (!this._isCurrentUser(revision)) return;
      this.statusSpan.innerText = '✅ Saved';
    }).catch(err => {
      if (!this._isCurrentUser(revision)) return;
      this.statusSpan.innerText = '❌ Save failed';
      console.error(err);
    });
  }
  
  // Remove transaction by hash (called from Phaser)
  removeTransaction(hash) {
    if (this.disabled || this._destroyed) return false;
    const revision = this._userRevision;
    this._loadRevision++;
    // Find in both categories
    let found = false;
    ['interaction', 'items'].forEach(cat => {
      const index = this.transactions[cat].findIndex(tx => tx.hash === hash);
      if (index !== -1) {
        const tx = this.transactions[cat][index];
        this.transactions[cat].splice(index, 1);
        this.renderCategory(cat);
        this.deleteFromBackend(tx.id || hash).catch(err => {
          if (!this._isCurrentUser(revision)) return;
          this.statusSpan.innerText = '❌ Delete failed';
        });
        found = true;
      }
    });
    return found;
  }
  
  // Render a specific category
  renderCategory(category) {
    if (this.disabled || this._destroyed || !['interaction', 'items'].includes(category)) return;
    const listEl = category === 'interaction' ? this.interactionList : this.itemsList;
    listEl.innerHTML = '';
    
    this.transactions[category].forEach(tx => {
      const item = this.createTransactionElement(tx);
      listEl.appendChild(item);
    });
  }
  
  // Create a single transaction DOM element
  createTransactionElement(tx) {
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.dataset.hash = tx.hash;
    div.dataset.hidden = JSON.stringify(tx.hiddenData || {});
    
    // Status indicator
    const status = document.createElement('div');
    status.className = `tx-status ${tx.status}`;
    div.appendChild(status);
    
    // Content
    const content = document.createElement('div');
    content.className = 'tx-content';
    
    // Name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'tx-name';
    nameDiv.textContent = tx.name;
    content.appendChild(nameDiv);
    
    // Meta (hash and quantity)
    const metaDiv = document.createElement('div');
    metaDiv.className = 'tx-meta';
    
    // Hash span - clickeable to copy full hash
    const hashSpan = document.createElement('span');
    hashSpan.className = 'tx-hash clickable';
    hashSpan.textContent = this.shortenHash(tx.hash);
    hashSpan.title = 'Click to copy full hash';
    
    // Copy to clipboard on click
    hashSpan.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering any parent click
      
      const copyToClipboard = async (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          try {
            textarea.select();
            if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected');
          } finally { textarea.remove(); }
        }
      };
      
      copyToClipboard(tx.hash)
        .then(() => {
          if (this._destroyed) return;
          hashSpan.textContent = '✓ Copied!';
          this._restoreHashLater(hashSpan, tx.hash);
        })
        .catch(err => {
          if (this._destroyed) return;
          console.error('Failed to copy hash:', err);
          hashSpan.textContent = '❌ Error';
          this._restoreHashLater(hashSpan, tx.hash);
        });
    });
    
    metaDiv.appendChild(hashSpan);
    
    // Quantity
    const quantitySpan = document.createElement('span');
    quantitySpan.className = 'tx-quantity';
    quantitySpan.textContent = `x${tx.quantity}`;
    metaDiv.appendChild(quantitySpan);
    
    content.appendChild(metaDiv);
    div.appendChild(content);
    
    // Retry button if status is reverted
    if (tx.status === 'reverted') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tx-retry-btn';
      const retryState = this._retryStates.get(tx.id || tx.hash);
      retryBtn.disabled = !!retryState;
      retryBtn.innerText = retryState === 'completed' ? 'Retry requested' : retryState ? 'Retrying…' : '↻ Retry';
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // _retryTransaction handles both callback and persistence failures.
        void this._retryTransaction(tx, retryBtn);
      });
      div.appendChild(retryBtn);
    }
    
    return div;
  }
  
  shortenHash(hash) {
    if (typeof hash !== 'string' || !hash) return '';
    return hash.slice(0, 6) + '…' + hash.slice(-4);
  }

  _restoreHashLater(element, hash) {
    clearTimeout(this._copyTimers.get(element));
    const timer = setTimeout(() => {
      this._copyTimers.delete(element);
      if (!this._destroyed) element.textContent = this.shortenHash(hash);
    }, 1000);
    this._copyTimers.set(element, timer);
  }

  async _retryTransaction(tx, button) {
    const category = tx.category;
    const key = tx.id || tx.hash;
    if (this.disabled || this._destroyed || !this.playerName ||
        !['interaction', 'items'].includes(category) || this._retryStates.has(key)) return false;
    const revision = this._userRevision;
    this._loadRevision++;
    this._retryStates.set(key, 'pending');
    button.disabled = true;
    button.innerText = 'Retrying…';

    try {
      // Do not discard the failed record before the game's retry callback
      // accepts the request. This also catches a synchronous callback error.
      const accepted = await this.onRetry(tx.hiddenData || {
        hash: tx.hash, name: tx.name, quantity: tx.quantity
      });
      if (!this._isCurrentUser(revision)) return false;
      if (accepted === false) throw new Error('Retry was cancelled');
      this._retryStates.set(key, 'completed');
      button.innerText = 'Retry requested';

      try {
        await this.deleteFromBackend(key);
      } catch (error) {
        if (!this._isCurrentUser(revision)) return false;
        // The retry may already have submitted a transaction. A log deletion
        // failure must never make another click submit it again.
        this.statusSpan.innerText = '⚠️ Retry requested; history cleanup failed';
        console.error('Unable to remove retried transaction history:', error);
        this.renderCategory(category);
        return false;
      }
      if (!this._isCurrentUser(revision)) return false;
      this._loadRevision++;
      this.transactions[category] = this.transactions[category].filter(item => (item.id || item.hash) !== key);
      this._retryStates.delete(key);
      this.renderCategory(category);
      this.statusSpan.innerText = '✅ Retry requested';
      return true;
    } catch (error) {
      if (!this._isCurrentUser(revision)) return false;
      this._retryStates.delete(key);
      button.disabled = false;
      button.innerText = '↻ Retry';
      this.statusSpan.innerText = '❌ Retry failed';
      console.error('Transaction retry failed:', error);
      // A refresh may have replaced the original button while awaiting the
      // callback; rebuild the current row to release its pending state too.
      this.renderCategory(category);
      return false;
    }
  }

  destroy() {
    if (this._destroyed) return;
    if (!this.disabled) this.hide();
    this._destroyed = true;
    this.disabled = true;
    this._userRevision++;
    this._loadRevision++;
    this._abortRequests();
    if (this._endDrag) this._endDrag();
    for (const remove of this._listeners) remove();
    this._listeners.length = 0;
    for (const timer of this._copyTimers.values()) clearTimeout(timer);
    this._copyTimers.clear();
    this._retryStates.clear();
    this.transactions = { interaction: [], items: [] };
    if (this.interactionList) this.interactionList.textContent = '';
    if (this.itemsList) this.itemsList.textContent = '';
    this.onRetry = () => {};
    this._endDrag = null;
  }
  
  // --- Backend integration (adapt to your API) ---
  async csrfHeaders() {
    const data = await this._request(`${this.baseUrl}/api/auth/csrf-token`, {
      credentials: 'include', cache: 'no-store'
    }, true);
    if (typeof data.csrfToken !== 'string' || !/^[a-f0-9]{64}$/i.test(data.csrfToken)) throw new Error('Invalid CSRF token');
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken };
  }

  async loadFromBackend() {
    if (this.disabled) return;
    if (!this.playerName) {
      console.log('TransactionHub: No user, skipping load');
      return;
    }
    
    this.statusSpan.innerText = '⏳ Loading...';
    const revision = this._userRevision;
    const loadRevision = ++this._loadRevision;
    
    try {
      // 🔧 USAR baseUrl si está definida
      const url = this.baseUrl
        ? `${this.baseUrl}/api/transactions?playerName=${encodeURIComponent(this.playerName)}`
        : `/api/transactions?playerName=${encodeURIComponent(this.playerName)}`;
      
      const data = await this._request(url, { credentials: 'include' }, true, true);
      if (!this._isCurrentUser(revision) || loadRevision !== this._loadRevision) return;

      // FIX: validar la forma de la respuesta. Antes se asignaba tal cual y
      // si el backend devolvía otra estructura (array, error envuelto, campos
      // faltantes), renderCategory() lanzaba en .forEach de undefined.
      this.transactions = {
        interaction: Array.isArray(data && data.interaction) ? data.interaction.filter(tx => tx && typeof tx === 'object').slice(0, 200) : [],
        items:       Array.isArray(data && data.items)       ? data.items.filter(tx => tx && typeof tx === 'object').slice(0, 200) : []
      };
      const retainedKeys = new Set([...this.transactions.interaction, ...this.transactions.items].map(tx => tx.id || tx.hash));
      for (const [key, state] of this._retryStates) {
        if (state === 'completed' && !retainedKeys.has(key)) this._retryStates.delete(key);
      }

      this.renderCategory('interaction');
      this.renderCategory('items');
      this.statusSpan.innerText = '✅ Synced';
    } catch (err) {
      if (!this._isCurrentUser(revision) || loadRevision !== this._loadRevision) return;
      console.error('Error loading transactions:', err);
      this.statusSpan.innerText = '❌ Load error';
    }
  }
  
  async saveToBackend(tx) {
    if (!this.playerName) return;
    const revision = this._userRevision;
    
    try {
      const url = this.baseUrl ? `${this.baseUrl}/api/transactions` : '/api/transactions';
      const headers = await this.csrfHeaders();
      if (!this._isCurrentUser(revision)) throw new Error('Transaction history session changed');
      await this._request(url, {
        method: 'POST',
        headers,
        credentials: 'include',   // <-- AÑADIDO
        body: JSON.stringify(tx)
      });
    } catch (err) {
      throw err;
    }
  }
  
  async deleteFromBackend(idOrHash) {
    if (!this.playerName) return;
    const revision = this._userRevision;
    
    try {
      const id = encodeURIComponent(String(idOrHash));
      const url = this.baseUrl ? `${this.baseUrl}/api/transactions/${id}` : `/api/transactions/${id}`;
      const headers = await this.csrfHeaders();
      if (!this._isCurrentUser(revision)) throw new Error('Transaction history session changed');
      await this._request(url, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
    } catch (err) {
      console.error('Delete error:', err);
      throw err;
    }
  }
}

// Global instance (optional) – ahora se puede inicializar con baseUrl
window.hub = new hub({
  onRetry: (hiddenData) => {
    console.log('Retry clicked, hidden data:', hiddenData);
    // Aquí puedes llamar al método de la escena Phaser
    // if (window.game && window.game.scene.keys['GameScene']) {
    //   window.game.scene.keys['GameScene'].retryTransaction(hiddenData);
    // }
  },
  // 🔧 URL base del backend:
  // FIX: antes estaba fija en http://127.0.0.1:3001, lo que rompía las
  // peticiones en producción (apuntaban al localhost del visitante).
  // Ahora solo se usa el backend local cuando la página se sirve desde
  // localhost (desarrollo).
  // FIX 2026-09-22: el backend local escucha en el 8080 (PORT por defecto de
  // server2.js, el mismo que usan las escenas), no en el 3001. Y en producción
  // el "mismo origen" ('') es game.grasslandforest.com — GitHub Pages, donde
  // no hay API —, así que se apunta a la API pública como el resto del juego.
  baseUrl: (typeof window.GF_API_BASE === 'string') ? window.GF_API_BASE
    : (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8080'
      : 'https://api.grasslandforest.com'
});
