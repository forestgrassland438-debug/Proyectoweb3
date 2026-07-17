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
    
    this.initEvents();
    this.loadFromBackend(); // load when hub opens
  }
  
  initEvents() {
    // Close button
    this.closeBtn.addEventListener('click', () => this.hide());
    
    // Tabs
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        this.switchTab(target);
      });
    });
    
    // Refresh button
    this.refreshBtn.addEventListener('click', () => this.loadFromBackend());
    
    // Make draggable (simple)
    this.makeDraggable(this.container);
  }
  
  makeDraggable(el) {
    let offsetX, offsetY, mouseX, mouseY;
    const header = el.querySelector('.tx-hub-header');
    header.addEventListener('mousedown', (e) => {
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
  }
  
  switchTab(tabId) {
    this.tabs.forEach(t => t.classList.remove('active'));
    this.tabContents.forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tx-${tabId}`).classList.add('active');
  }
  
  // Show/hide panel
  show() {
    this.container.classList.remove('tx-hub-hidden');
    this.container.classList.add('tx-hub-visible');
    this.loadFromBackend(); // refresh on open
  }
  
  hide() {
    this.container.classList.remove('tx-hub-visible');
    this.container.classList.add('tx-hub-hidden');
  }
  
  toggle() {
    if (this.container.classList.contains('tx-hub-visible')) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  // Set current user (call after login)
  setUser(playerName, address) {
    this.playerName = playerName;
    this.playerAddress = address;
  }
  
  // Add a transaction (called from Phaser)
  addTransaction(category, data) {
    // category: 'interaction' or 'items'
    // data: { name, quantity, hash, status, hiddenData }
    if (!this.playerName) {
      console.warn('TransactionHub: No user set, cannot save');
      return;
    }
    const tx = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      playerName: this.playerName,
      address: this.playerAddress,
      category,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    // Optimistic UI update
    this.transactions[category].push(tx);
    this.renderCategory(category);
    
    // Save to backend
    this.saveToBackend(tx).then(() => {
      this.statusSpan.innerText = '✅ Saved';
    }).catch(err => {
      this.statusSpan.innerText = '❌ Save failed';
      console.error(err);
    });
  }
  
  // Remove transaction by hash (called from Phaser)
  removeTransaction(hash) {
    // Find in both categories
    let found = false;
    ['interaction', 'items'].forEach(cat => {
      const index = this.transactions[cat].findIndex(tx => tx.hash === hash);
      if (index !== -1) {
        const tx = this.transactions[cat][index];
        this.transactions[cat].splice(index, 1);
        this.renderCategory(cat);
        this.deleteFromBackend(tx.id || hash).catch(err => {
          this.statusSpan.innerText = '❌ Delete failed';
        });
        found = true;
      }
    });
    return found;
  }
  
  // Render a specific category
  renderCategory(category) {
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
      
      const copyToClipboard = (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          return Promise.resolve();
        }
      };
      
      copyToClipboard(tx.hash)
        .then(() => {
          hashSpan.textContent = '✓ Copied!';
          setTimeout(() => {
            hashSpan.textContent = this.shortenHash(tx.hash);
          }, 1000);
        })
        .catch(err => {
          console.error('Failed to copy hash:', err);
          hashSpan.textContent = '❌ Error';
          setTimeout(() => {
            hashSpan.textContent = this.shortenHash(tx.hash);
          }, 1000);
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
      retryBtn.innerText = '↻ Retry';
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Remove from UI
        div.remove();
        // Remove from internal array
        const cat = tx.category;
        const index = this.transactions[cat].findIndex(t => t.hash === tx.hash);
        if (index !== -1) this.transactions[cat].splice(index, 1);
        
        // Delete from backend
        this.deleteFromBackend(tx.id || tx.hash);
        
        // Call Phaser callback with hidden data
        this.onRetry(tx.hiddenData || { hash: tx.hash, name: tx.name, quantity: tx.quantity });
      });
      div.appendChild(retryBtn);
    }
    
    return div;
  }
  
  shortenHash(hash) {
    if (!hash) return '';
    return hash.slice(0, 6) + '…' + hash.slice(-4);
  }
  
  // --- Backend integration (adapt to your API) ---
  async loadFromBackend() {
    if (!this.playerName) {
      console.log('TransactionHub: No user, skipping load');
      return;
    }
    
    this.statusSpan.innerText = '⏳ Loading...';
    
    try {
      // 🔧 USAR baseUrl si está definida
      const url = this.baseUrl
        ? `${this.baseUrl}/api/transactions?playerName=${encodeURIComponent(this.playerName)}`
        : `/api/transactions?playerName=${encodeURIComponent(this.playerName)}`;
      
      const response = await fetch(url, {
        credentials: 'include'   // <-- AÑADIDO
      });
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      
      // Assuming data is { interaction: [...], items: [...] }
      this.transactions = data;
      
      this.renderCategory('interaction');
      this.renderCategory('items');
      this.statusSpan.innerText = '✅ Synced';
    } catch (err) {
      console.error('Error loading transactions:', err);
      this.statusSpan.innerText = '❌ Load error';
    }
  }
  
  async saveToBackend(tx) {
    if (!this.playerName) return;
    
    try {
      const url = this.baseUrl ? `${this.baseUrl}/api/transactions` : '/api/transactions';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',   // <-- AÑADIDO
        body: JSON.stringify(tx)
      });
      if (!response.ok) throw new Error('Save failed');
    } catch (err) {
      throw err;
    }
  }
  
  async deleteFromBackend(idOrHash) {
    if (!this.playerName) return;
    
    try {
      const url = this.baseUrl ? `${this.baseUrl}/api/transactions/${idOrHash}` : `/api/transactions/${idOrHash}`;
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'   // <-- AÑADIDO
      });
      if (!response.ok) throw new Error('Delete failed');
    } catch (err) {
      console.error('Delete error:', err);
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
  // 🔧 Especifica la URL base si el frontend está en un puerto diferente
  baseUrl: 'http://127.0.0.1:3001'   // <-- AJUSTA ESTO SEGÚN TU CONFIGURACIÓN
});