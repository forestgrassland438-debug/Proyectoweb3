/**
 * SISTEMA DE TIENDA RPG MEJORADO - v6.3 CORREGIDO PARA PC
 * Sistema completo de tienda para Grassland Forest
 * Autor: Jean Larreal
 * Características:
 * - Diseño responsive PC/móvil
 * - En PC: Detalles solo muestra imagen, nombre y botón "Interactuar"
 * - En PC: Modal separado para transacciones con todos los detalles
 * - En móvil: Funciona igual que antes
 * - Historial funcional en ambos dispositivos
 * - Sin interferencia con controles WASD
 * - Precios separados de compra (buyPrice) y venta (sellPrice)
 * - Modal de confirmación personalizado para limpiar historial
 */

class TiendaSistema {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.selectedItem = null;
        this.currentCategory = 'todas';
        this.searchQuery = '';
        this.transactionType = 'compra';
        this.historial = [];
        this.dailyLimits = {};
        this.playerMoneda = 0;
        this.playerMonedaPlata = 0;
        this.isMobile = false;
        this.lastTapTime = 0;
        this.tapTimeout = null;
        
        // Compatibilidad: si el método no está disponible en algún build,
        // se usa un render mínimo para evitar que la tienda se rompa al abrir.
        const protoFilterItems = TiendaSistema.prototype.filterItems;
        if (typeof protoFilterItems === 'function') {
            this.filterItems = (...args) => protoFilterItems.apply(this, args);
        } else {
            this.filterItems = () => {};
        }
        
        // Helpers de moneda
        this.getItemCurrency = (item) => (item?.currency === 'silver' ? 'silver' : 'gold');
        this.getCurrencyLabel = (currency) => (currency === 'silver' ? 'SL' : 'GL');
        this.getCurrencyIconPath = (currency) => (currency === 'silver'
            ? './Game/Source/moneda de plata.png'
            : './Game/Source/moneda de oro.png');
        this.getBalanceByCurrency = (currency) => (currency === 'silver' ? this.playerMonedaPlata : this.playerMoneda);
        this.setBalanceByCurrency = (currency, value) => {
            const normalized = Math.max(0, Math.floor(Number(value) || 0));
            if (currency === 'silver') {
                this.playerMonedaPlata = normalized;
                if (this.scene) this.scene.moneda_plata = normalized;
                if (this.scene) this.scene.monedaPlata = normalized;
                if (this.scene) this.scene.playerMonedaPlata = normalized;
            } else {
                this.playerMoneda = normalized;
                if (this.scene) this.scene.moneda = normalized;
                if (this.scene) this.scene.monto_moneda = normalized;
                if (this.scene) this.scene.playerMoneda = normalized;
            }
        };
        this.formatCurrencyAmount = (amount, currency) => {
            const label = this.getCurrencyLabel(currency);
            const icon = this.getCurrencyIconPath(currency);
            return `<img src="${icon}" alt="${label}" class="moneda-icon"> ${amount} ${label}`;
        };

        // Detectar si es móvil
        this.checkMobile();



                // Carácter global de las definiciones de ítems
        this.ItemDefinitions = {
          Semillax: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_saco.png", maxStack: 50 },
          Semillax1: { src: "./Game/Objetos/Plantas/planta_tomates/semillas_tomate.png", maxStack: 50 },
          
          Semillax2: { src: "./Game/Objetos/Plantas/planta_trigo/item_semilla_trigo.png", maxStack: 50 },
          Semillax3: { src: "./Game/Objetos/Plantas/planta_calabaza/item_semilla_calabaza.png", maxStack: 50 },

          Regaderax: { src: "./Game/Source/recurso2.png", maxStack: 1 },
          Tijerasx: { src: "./Game/Source/tijeras.png", maxStack: 1 },
          mineral_piedra: { src: "./Game/Source/piedra.png", maxStack: 20 },
          mineral_cobre: { src: "./Game/Source/cobre.png", maxStack: 20 },
          mineral_hierro: { src: "./Game/Source/hierro.png", maxStack: 20 },
          palo: { src: "./Game/Source/palo.png", maxStack: 20 },
          tablon_de_madera: { src: "./Game/Source/madera.png", maxStack: 20 },
          madera_pinos: { src: "./Game/Source/madera_oscura.png", maxStack: 50 },
          madera_con_hojas: { src: "./Game/Source/madera de hoja.png", maxStack: 50 },
          madera_seca: { src: "./Game/Source/madera seca.png", maxStack: 50 },
          balde_vacio: { src: "./Game/Source/item_pozo1.png", maxStack: 5 },
          balde_con_agua: { src: "./Game/Source/item_pozo2.png", maxStack: 5 },

          
          hacha_de_madera: { src: "./Game/Source/pico_y_hacha/hacha_de_madera.png", maxStack: 5, tipo: "hacha de madera", usos: 5  },
          hacha_de_piedra: { src: "./Game/Source/pico_y_hacha/hacha_de_piedra.png", maxStack: 5, usos: 10 },
          hacha_de_cobre:  { src: "./Game/Source/pico_y_hacha/hacha_de_cobre.png",  maxStack: 5, usos: 20 },
          hacha_de_hierro: { src: "./Game/Source/pico_y_hacha/hacha_de_hierro.png", maxStack: 5, usos: 40 },

          pico_de_madera: { src: "./Game/Source/pico_y_hacha/pico_de_madera.png", maxStack: 5, tipo: "madera", usos: 5  },
          pico_de_piedra: { src: "./Game/Source/pico_y_hacha/pico_de_piedra.png", maxStack: 5, tipo: "piedra", usos: 10 },
          pico_de_cobre:  { src: "./Game/Source/pico_y_hacha/pico_de_cobre.png",  maxStack: 5, tipo: "madera", usos: 20 },
          pico_de_hierro: { src: "./Game/Source/pico_y_hacha/pico_de_hierro.png", maxStack: 5, tipo: "madera", usos: 40 },
          
          zanahoria_buena: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_buena.png", maxStack: 20 },
          zanahoria_corta: { src: "./Game/Objetos/Plantas/planta_zanahorias/planta_crecimiento_zanahoria.png", maxStack: 20 },
          zanahoria_mala: { src: "./Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_podrida.png", maxStack: 20 },

          tomate_buena: { src: "./Game/Objetos/Plantas/planta_tomates/item_tomate_bueno.png", maxStack: 20 },
          tomate_corta: { src: "./Game/Objetos/Plantas/planta_tomates/item_planta.png", maxStack: 20 },
          tomate_mala: { src: "./Game/Objetos/Plantas/planta_tomates/item_tomate_malo.png", maxStack: 20 },

          

          trigo_buena: { src: "./Game/Objetos/Plantas/planta_trigo/item_trigo_bueno.png", maxStack: 20 },
          trigo_corta: { src: "./Game/Objetos/Plantas/planta_trigo/item_planta_trigo.png", maxStack: 20 },
          trigo_mala: { src: "./Game/Objetos/Plantas/planta_trigo/item_trigo_podrido.png", maxStack: 20 },

          calabaza_buena: { src: "./Game/Objetos/Plantas/planta_calabaza/item_calabaza_buena.png", maxStack: 20 },
          calabaza_corta: { src: "./Game/Objetos/Plantas/planta_calabaza/item_planta_calabaza.png", maxStack: 20 },
          calabaza_mala: { src: "./Game/Objetos/Plantas/planta_calabaza/item_calabaza_podrida.png", maxStack: 20 },


        
          // Agrega más definiciones según sea necesario
        };
        
        // Configuración de objetos de la tienda (con precios separados)
        this.itemsTienda = {
            semillas: [
                {
                    id: 'Semillax',
                    name: 'Carrot Seed',
                    image: './Game/Objetos/Plantas/planta_zanahorias/item_saco.png',
                    buyPrice: 10,
                    sellPrice: 5,
                    currency: 'silver',
                    categoria: 'semillas',
                    comision: 5,
                    limiteDiario: 0,
                    descripcion: 'Seed used to grow carrots. Growth time: 5 minutes.'
                },
                {
                    id: 'Semillax1',
                    name: 'Tomato Seed',
                    image: './Game/Objetos/Plantas/planta_tomates/semillas_tomate.png',
                    buyPrice: 15,
                    sellPrice: 7,
                    currency: 'silver',
                    categoria: 'semillas',
                    comision: 5,
                    limiteDiario: 0,
                    descripcion: 'Seed used to grow tomatoes. Growth time: 8 minutes.'
                },
                {
                    id: 'Semillax2',
                    name: 'Wheat Seed',
                    image: './Game/Objetos/Plantas/planta_trigo/item_semilla_trigo.png',
                    buyPrice: 8,
                    sellPrice: 3,
                    currency: 'silver',
                    categoria: 'semillas',
                    comision: 5,
                    limiteDiario: 0,
                    descripcion: 'Seed used to grow wheat. Growth time: 3 minutes.'
                },
                {
                    id: 'Semillax3',
                    name: 'Pumpkin Seed',
                    image: './Game/Objetos/Plantas/planta_calabaza/item_semilla_calabaza.png',
                    buyPrice: 25,
                    sellPrice: 12,
                    currency: 'silver',
                    categoria: 'semillas',
                    comision: 5,
                    limiteDiario: 0,
                    descripcion: 'Seed used to grow pumpkins. Growth time: 10 minutes.'
                }
            ],
            
            herramientas: [
                {
                    id: 'Regaderax',
                    name: 'Watering Can',
                    image: './Game/Source/recurso2.png',
                    buyPrice: 50,
                    sellPrice: 25,
                    currency: 'gold',
                    categoria: 'herramientas',
                    comision: 10,
                    limiteDiario: 3,
                    descripcion: 'Essential tool for watering plants. Durability: 100 uses.'
                },
                {
                    id: 'Tijerasx',
                    name: 'Shears',
                    image: './Game/Source/tijeras.png',
                    buyPrice: 75,
                    sellPrice: 35,
                    currency: 'gold',
                    categoria: 'herramientas',
                    comision: 10,
                    limiteDiario: 3,
                    descripcion: 'Shears for harvesting mature crops. Durability: 150 uses.'
                },
                {
                    id: 'hacha_de_madera',
                    name: 'Wood Axe',
                    image: './Game/Source/pico_y_hacha/hacha_de_madera.png',
                    buyPrice: 100,
                    sellPrice: 45,
                    currency: 'gold',
                    categoria: 'herramientas',
                    comision: 10,
                    limiteDiario: 2,
                    descripcion: 'Basic axe for cutting small trees. Efficiency: 1x.'
                },
                {
                    id: 'pico_de_madera',
                    name: 'Wood Pickaxe',
                    image: './Game/Source/pico_y_hacha/pico_de_madera.png',
                    buyPrice: 120,
                    sellPrice: 55,
                    currency: 'gold',
                    categoria: 'herramientas',
                    comision: 10,
                    limiteDiario: 2,
                    descripcion: 'Basic pickaxe for mining stone. Efficiency: 1x.'
                }
            ],

            /*
            minerales: [
                {
                    id: 'mineral_piedra',
                    name: 'Mineral de Piedra',
                    image: './Game/Source/piedra.png',
                    buyPrice: 5,
                    sellPrice: 2,
                    categoria: 'minerales',
                    comision: 3,
                    limiteDiario: 0,
                    descripcion: 'Piedra común utilizada en construcción y herramientas básicas.'
                },
                {
                    id: 'mineral_cobre',
                    name: 'Mineral de Cobre',
                    image: './Game/Source/cobre.png',
                    buyPrice: 25,
                    sellPrice: 12,
                    categoria: 'minerales',
                    comision: 5,
                    limiteDiario: 0,
                    descripcion: 'Cobre de buena calidad para herramientas y decoración.'
                },
                {
                    id: 'mineral_hierro',
                    name: 'Mineral de Hierro',
                    image: './Game/Source/hierro.png',
                    buyPrice: 50,
                    sellPrice: 24,
                    categoria: 'minerales',
                    comision: 7,
                    limiteDiario: 0,
                    descripcion: 'Hierro resistente para equipo avanzado y construcción.'
                }
            ],

            */
            
            alimentos: [
                {
                    id: 'zanahoria_buena',
                    name: 'Fresh Carrot',
                    image: './Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_buena.png',
                    buyPrice: 7,
                    sellPrice: 3,
                    currency: 'silver',
                    categoria: 'alimentos',
                    comision: 2,
                    limiteDiario: 0,
                    descripcion: 'Freshly harvested carrot. Restores 2% food.'
                },
                {
                    id: 'tomate_buena',
                    name: 'Fresh Tomato',
                    image: './Game/Objetos/Plantas/planta_tomates/item_tomate_bueno.png',
                    buyPrice: 12,
                    sellPrice: 5,
                    currency: 'silver',
                    categoria: 'alimentos',
                    comision: 2,
                    limiteDiario: 0,
                    descripcion: 'Juicy tomato, perfect for salads. Restores 5% food.'
                },
                {
                    id: 'balde_con_agua',
                    name: 'Bucket of Water',
                    image: './Game/Source/item_pozo2.png',
                    buyPrice: 8,
                    sellPrice: 3,
                    currency: 'silver',
                    categoria: 'alimentos',
                    comision: 2,
                    limiteDiario: 0,
                    descripcion: 'Fresh water for hydration. Restores 20% water.'
                }
            ],
            /*
            equipo: [
                {
                    id: 'pico_de_hierro',
                    name: 'Pico de Hierro',
                    image: './Game/Source/pico_y_hacha/pico_de_hierro.png',
                    buyPrice: 200,
                    sellPrice: 90,
                    categoria: 'equipo',
                    comision: 15,
                    limiteDiario: 1,
                    descripcion: 'Pico resistente para minería avanzada. Eficiencia: 3x.'
                },
                {
                    id: 'hacha_de_hierro',
                    name: 'Hacha de Hierro',
                    image: './Game/Source/pico_y_hacha/hacha_de_hierro.png',
                    buyPrice: 180,
                    sellPrice: 80,
                    categoria: 'equipo',
                    comision: 15,
                    limiteDiario: 1,
                    descripcion: 'Hacha fuerte para árboles grandes. Eficiencia: 3x.'
                },
                {
                    id: 'instrumento-pesca',
                    name: 'Caña de Pescar',
                    image: './Game/Source/pesca-instrumento.png',
                    buyPrice: 150,
                    sellPrice: 70,
                    categoria: 'equipo',
                    comision: 12,
                    limiteDiario: 2,
                    descripcion: 'Caña profesional para pesca en río. Durabilidad: 200 usos.'
                }
            ],

            
            especial: [
                {
                    id: 'cofre_especial',
                    name: 'Cofre Misterioso',
                    image: './Game/Objetos/cofre.png',
                    buyPrice: 500,
                    sellPrice: 220,
                    categoria: 'especial',
                    comision: 20,
                    limiteDiario: 3,
                    descripcion: 'Cofre misterioso que puede contener objetos raros o valiosos.'
                },
                {
                    id: 'pocion_vida',
                    name: 'Poción de Vida',
                    image: './Game/Source/pocion_vida.png',
                    buyPrice: 100,
                    sellPrice: 45,
                    categoria: 'especial',
                    comision: 8,
                    limiteDiario: 3,
                    descripcion: 'Poción que restaura 50% de vida instantáneamente.'
                },
                {
                    id: 'pocion_energia',
                    name: 'Poción de Energía',
                    image: './Game/Source/pocion_energia.png',
                    buyPrice: 80,
                    sellPrice: 36,
                    categoria: 'especial',
                    comision: 8,
                    limiteDiario: 3,
                    descripcion: 'Poción que restaura 50% de energía y resistencia.'
                }
            ]
                */
        };

        // Inicializar desde localStorage
        this.loadDailyLimits();
        this.loadHistorial();
        
        // Inicializar eventos
        this.initEvents();
        
        console.log('🏪 Sistema de tienda inicializado v6.3');
    }
    
    // Detectar si es dispositivo móvil
    checkMobile() {
        this.isMobile = window.innerWidth <= 768;
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            if (this.isOpen) {
                this.filterItems?.();
            }
        });
    }
    
    // Inicializar eventos del DOM
    initEvents() {
        // Cerrar tienda
        document.getElementById('cerrar-tienda')?.addEventListener('click', () => this.close());
        
        // Overlay para cerrar
        document.getElementById('tienda-overlay')?.addEventListener('click', () => this.close());
        
        // Búsqueda
        const searchInput = document.getElementById('tienda-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.filterItems?.();
            });
            
            // Prevenir propagación de teclas WASD
            searchInput.addEventListener('keydown', (e) => {
                const wasdKeys = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
                if (wasdKeys.includes(e.key)) {
                    e.stopPropagation();
                }
                
                if (e.key === 'Escape') {
                    this.close();
                }
                
                if (e.key === 'Enter' && this.selectedItem && !this.isMobile) {
                    this.openPcModal();
                }
            });
        }
        
        // Filtros
        document.getElementById('tienda-categoria')?.addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.filterItems?.();
        });
        
        document.getElementById('tienda-tipo')?.addEventListener('change', (e) => {
            this.handleTransactionTypeChange(e.target.value);
        });
        
        // Botón de interactuar (PC)
        document.getElementById('interact-button-pc')?.addEventListener('click', () => {
            this.openPcModal();
        });
        
        // Controles de cantidad (PC Modal)
        document.getElementById('pc-quantity-up')?.addEventListener('click', () => this.changePcModalQuantity(1));
        document.getElementById('pc-quantity-down')?.addEventListener('click', () => this.changePcModalQuantity(-1));
        
        const pcQuantityInput = document.getElementById('pc-quantity-input');
        if (pcQuantityInput) {
            pcQuantityInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value) || 1;
                if (value < 1) value = 1;
                if (value > 99) value = 99;
                e.target.value = value;
                this.updatePcModalTotalPrice();
            });
            
            // Permitir Enter para confirmar transacción
            pcQuantityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.executePcModalTransaction();
                }
            });
        }
        
        // Botón de acción (PC Modal)
        document.getElementById('pc-action-button')?.addEventListener('click', () => this.executePcModalTransaction());
        
        // Cerrar modal PC
        document.getElementById('close-pc-modal')?.addEventListener('click', () => this.closePcModal());
        
        // Controles de cantidad (Móvil)
        document.getElementById('mobile-quantity-up')?.addEventListener('click', () => this.changeMobileQuantity(1));
        document.getElementById('mobile-quantity-down')?.addEventListener('click', () => this.changeMobileQuantity(-1));
        
        const mobileQuantityInput = document.getElementById('mobile-quantity-input');
        if (mobileQuantityInput) {
            mobileQuantityInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value) || 1;
                if (value < 1) value = 1;
                if (value > 99) value = 99;
                e.target.value = value;
                this.updateMobileTotalPrice();
            });
        }
        
        // Botón de acción (Móvil)
        document.getElementById('mobile-action-button')?.addEventListener('click', () => {
            this.executeMobileTransaction();
            this.closeMobileModal();
        });
        
        // Botón de historial en móvil
        document.getElementById('mobile-historial-btn')?.addEventListener('click', () => {
            this.openMobileHistorialModal();
        });
        
        // Cerrar modal móvil de detalles
        document.getElementById('close-mobile-modal')?.addEventListener('click', () => this.closeMobileModal());
        
        // Cerrar modal móvil de historial
        document.getElementById('close-mobile-historial')?.addEventListener('click', () => this.closeMobileHistorialModal());
        
        // Limpiar historial móvil
        document.getElementById('clear-mobile-historial')?.addEventListener('click', () => this.clearHistorial());
        
        // Pestañas (PC)
        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });
        
        // Limpiar historial (PC)
        document.getElementById('clear-historial-pc')?.addEventListener('click', () => this.clearHistorial());
        
        // Ayuda
        document.getElementById('tienda-help-btn')?.addEventListener('click', () => this.showHelp());
        document.getElementById('close-help')?.addEventListener('click', () => this.hideHelp());
        
        // Eventos táctiles para móvil
        this.initMobileTouchEvents();
    }
    
    // Manejar cambio de tipo de transacción
    handleTransactionTypeChange(newType) {
        console.log(`🔄 Cambiando tipo de transacción de ${this.transactionType} a ${newType}`);
        
        const oldType = this.transactionType;
        this.transactionType = newType;
        
        // Limpiar item seleccionado al cambiar modos
        if (oldType !== newType) {
            this.selectedItem = null;
            
            // Limpiar selección de todas las tarjetas
            document.querySelectorAll('.item-card.selected').forEach(card => {
                card.classList.remove('selected');
            });
            
            // Cerrar cualquier modal abierto
            if (this.isMobile) {
                this.closeMobileModal();
            } else {
                this.closePcModal();
            }
        }
        
        // Actualizar UI
        this.filterItems?.();
        
        if (!this.isMobile) {
            this.updatePcSimpleDetail();
        }
        
        console.log(`✅ Tipo de transacción cambiado a ${this.transactionType}`);
    }
    
    // Inicializar eventos táctiles para móvil
    initMobileTouchEvents() {
        const itemsContainer = document.getElementById('tienda-items');
        if (!itemsContainer) return;
        
        let tapCount = 0;
        let tapTimer = null;
        
        itemsContainer.addEventListener('click', (e) => {
            const itemCard = e.target.closest('.item-card');
            if (!itemCard || itemCard.classList.contains('sold-out')) return;
            
            tapCount++;
            
            if (tapCount === 1) {
                tapTimer = setTimeout(() => {
                    const itemId = itemCard.dataset.itemId;
                    if (itemId) {
                        this.selectItem(itemId);
                    }
                    tapCount = 0;
                }, 300);
            } else if (tapCount === 2) {
                clearTimeout(tapTimer);
                const itemId = itemCard.dataset.itemId;
                if (itemId) {
                    this.selectItem(itemId);
                    this.openMobileModal();
                }
                tapCount = 0;
            }
        });
        
        itemsContainer.addEventListener('touchstart', (e) => {
            if (!this.isMobile) return;
            const itemCard = e.target.closest('.item-card');
            if (itemCard && !itemCard.classList.contains('sold-out')) {
                e.preventDefault();
            }
        }, { passive: false });
        
        document.addEventListener('DOMContentLoaded', () => {
            this.setupItemTouchEvents();
        });
    }
    
    // Configurar eventos táctiles para items individuales
    setupItemTouchEvents() {
        const setupEvents = () => {
            const itemCards = document.querySelectorAll('.item-card');
            itemCards.forEach(card => {
                const newCard = card.cloneNode(true);
                card.parentNode.replaceChild(newCard, card);
            });
            
            const freshCards = document.querySelectorAll('.item-card');
            freshCards.forEach(card => {
                card.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
                card.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            });
        };
        
        setTimeout(setupEvents, 100);
    }
    
    // Manejar doble click
    handleDoubleClick(e) {
        const itemCard = e.currentTarget;
        if (!itemCard || itemCard.classList.contains('sold-out')) return;
        
        const itemId = itemCard.dataset.itemId;
        if (itemId) {
            this.selectItem(itemId);
            if (this.isMobile) {
                this.openMobileModal();
            }
        }
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Manejar toque táctil para doble toque
    handleTouchStart(e) {
        if (!this.isMobile) return;
        
        const itemCard = e.currentTarget;
        if (!itemCard || itemCard.classList.contains('sold-out')) return;
        
        const currentTime = new Date().getTime();
        const timeSinceLastTap = currentTime - this.lastTapTime;
        
        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
            const itemId = itemCard.dataset.itemId;
            if (itemId) {
                this.selectItem(itemId);
                this.openMobileModal();
            }
            
            e.preventDefault();
            e.stopPropagation();
            this.lastTapTime = 0;
        } else {
            this.lastTapTime = currentTime;
            
            if (this.tapTimeout) {
                clearTimeout(this.tapTimeout);
            }
            
            this.tapTimeout = setTimeout(() => {
                const itemId = itemCard.dataset.itemId;
                if (itemId) {
                    this.selectItem(itemId);
                }
                this.lastTapTime = 0;
            }, 300);
        }
    }
    
    // Abrir modal de historial en móvil
    openMobileHistorialModal() {
        if (!this.isMobile) return;
        document.getElementById('mobile-historial-modal')?.classList.remove('hidden');
        this.updateMobileHistorialDisplay();
        console.log('📱 Modal de historial móvil abierto');
    }
    
    // Cerrar modal de historial en móvil
    closeMobileHistorialModal() {
        document.getElementById('mobile-historial-modal')?.classList.add('hidden');
        console.log('📱 Modal de historial móvil cerrado');
    }
    
    // Actualizar display de historial en móvil
    updateMobileHistorialDisplay() {
        const container = document.getElementById('historial-list-mobile');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.historial.length === 0) {
            container.innerHTML = '<div class="historial-empty-mobile">No recent transactions</div>';
            return;
        }
        
        this.historial.forEach(transaction => {
            const item = document.createElement('div');
            item.className = `historial-item-mobile ${transaction.type}`;
            
            item.innerHTML = `
                <div class="historial-header-mobile">
                    <span class="historial-type-mobile">${transaction.type === 'compra' ? 'BUY' : 'SELL'}</span>
                    <span class="historial-time-mobile">${transaction.timestamp}</span>
                </div>
                <div class="historial-content-mobile">
                    <img src="${transaction.itemImage}" alt="${transaction.itemName}" class="historial-img-mobile">
                    <div class="historial-details-mobile">
                        <div class="historial-name-mobile">${transaction.itemName}</div>
                        <div class="historial-qty-mobile">Qty: ${transaction.quantity}</div>
                    </div>
                    <div class="historial-price-mobile">
                        <img src="${this.getCurrencyIconPath(transaction.currency || 'gold')}" alt="${this.getCurrencyLabel(transaction.currency || 'gold')}" class="moneda-icon">
                        ${transaction.price} ${this.getCurrencyLabel(transaction.currency || 'gold')}
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    // Abrir modal de PC
    openPcModal() {
        if (this.isMobile || !this.selectedItem) return;
        
        document.getElementById('pc-item-modal').classList.remove('hidden');
        this.updatePcModal();
        
        console.log('💻 Modal de PC abierto');
    }
    
    // Cerrar modal de PC
    closePcModal() {
        document.getElementById('pc-item-modal').classList.add('hidden');
        console.log('💻 Modal de PC cerrado');
    }
    
    // Actualizar modal de PC (muestra precio según tipo de transacción)
    updatePcModal() {
        if (!this.selectedItem) return;
        
        const item = this.selectedItem;
        const purchasedToday = this.dailyLimits[item.id] || 0;
        const disponible = this.transactionType === 'compra' 
            ? (item.limiteDiario ? item.limiteDiario - purchasedToday : 99)
            : this.getItemCountInInventory(item.id);
        
        const categorias = {
            'semillas': 'Seeds',
            'herramientas': 'Tools',
            'minerales': 'Minerals',
            'alimentos': 'Food',
            'equipo': 'Equipment',
            'especial': 'Special'
        };
        
        document.getElementById('pc-item-name').textContent = item.name;
        document.getElementById('pc-item-img').src = item.image;
        document.getElementById('pc-item-img').alt = item.name;
        
        // Mostrar precio según tipo de transacción
        const priceLabel = document.getElementById('pc-modal-price');
        if (priceLabel) {
            const priceAmount = this.transactionType === 'compra' ? item.buyPrice : item.sellPrice;
            priceLabel.innerHTML = this.formatCurrencyAmount(priceAmount, this.getItemCurrency(item));
        }
        
        document.getElementById('pc-item-desc').textContent = item.descripcion;
        document.getElementById('pc-category-value').textContent = categorias[item.categoria] || item.categoria;
        document.getElementById('pc-item-stock').textContent = 
            item.limiteDiario ? `${item.limiteDiario - purchasedToday} remaining` : '∞';
        document.getElementById('pc-item-disponible').textContent = 
            this.transactionType === 'compra' ? `${disponible} available` : `${disponible} in inventory`;
        document.getElementById('pc-item-comision').textContent = 
            this.transactionType === 'venta' ? `${item.comision}%` : '0%';
        
        const maxQuantity = this.getMaxQuantity();
        document.getElementById('pc-max-value').textContent = maxQuantity;
        
        const qtyInput = document.getElementById('pc-quantity-input');
        if (qtyInput) {
            qtyInput.value = Math.max(1, Math.min(1, maxQuantity));
            qtyInput.max = maxQuantity;
        }
        
        this.updatePcModalTotalPrice();
        this.updatePcModalActionButton();
    }
    
    // Cambiar cantidad en modal de PC
    changePcModalQuantity(delta) {
        const input = document.getElementById('pc-quantity-input');
        if (!input) return;
        let current = parseInt(input.value) || 1;
        let newValue = current + delta;
        
        const max = this.getMaxQuantity();
        if (newValue > max) newValue = max;
        if (newValue < 1) newValue = 1;
        
        input.value = newValue;
        this.updatePcModalTotalPrice();
        this.updatePcModalActionButton();
    }
    
    // Actualizar precio total en modal de PC (usa buyPrice para compras, sellPrice para ventas)
    updatePcModalTotalPrice() {
        if (!this.selectedItem) return;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('pc-quantity-input')?.value) || 1;
        
        const currency = this.getItemCurrency(item);
        let total;
        if (this.transactionType === 'compra') {
            total = item.buyPrice * quantity;
        } else {
            total = item.sellPrice * quantity;
        }
        
        const totalEl = document.getElementById('pc-action-total');
        if (totalEl) {
            totalEl.innerHTML = `Total: ${this.formatCurrencyAmount(total, currency)}`;
        }
    }
    
    // Actualizar botón de acción en modal de PC
    updatePcModalActionButton() {
        const button = document.getElementById('pc-action-button');
        const actionText = document.getElementById('pc-action-text');
        if (!button || !this.selectedItem || !actionText) return;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('pc-quantity-input')?.value) || 1;
        const purchasedToday = this.dailyLimits[item.id] || 0;
        
        let enabled = true;
        let text = '';
        let icon = '💰';
        
        if (this.transactionType === 'compra') {
            text = 'Buy';
            const totalCost = item.buyPrice * quantity;
            if (totalCost > this.getBalanceByCurrency(this.getItemCurrency(item))) {
                enabled = false;
                text = 'Insufficient funds';
            }
            
            if (item.limiteDiario > 0 && (purchasedToday + quantity) > item.limiteDiario) {
                enabled = false;
                text = 'Limit exceeded';
            }
            
            if (item.limiteDiario > 0 && purchasedToday >= item.limiteDiario) {
                enabled = false;
                text = 'Sold out today';
            }
        } else {
            text = 'Sell';
            icon = '💵';
            
            const playerCount = this.getItemCountInInventory(item.id);
            if (quantity > playerCount) {
                enabled = false;
                text = 'Not enough items';
            }
        }
        
        button.disabled = !enabled;
        actionText.textContent = text;
        const iconEl = document.querySelector('.pc-action-icon');
        if (iconEl) iconEl.textContent = icon;
    }
    
    // Ejecutar transacción desde modal de PC
    async executePcModalTransaction() {
        if (!this.selectedItem) return;

        // Anti-bot: prevent rapid double-clicks / bot spam
        if (this._transactionLock) {
            console.warn('⚠️ Transaction blocked: cooldown active');
            return;
        }
        this._transactionLock = true;
        const btn = document.getElementById('pc-action-button');
        if (btn) btn.disabled = true;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('pc-quantity-input').value) || 1;
        
        try {
            if (this.transactionType === 'compra') {
                await this.processPurchase(item, quantity);
            } else {
                await this.processSale(item, quantity);
            }
            
            // Do NOT call loadPlayerMoneda() here — it would re-read stale scene values
            // and overwrite the local deduction. The balance is already updated.
            this.updateMonedaDisplay();
            this.filterItems?.();
            
            this.updatePcSimpleDetail();
            
            this.closePcModal();
            
            this.updateHistorialDisplay();
            this.updateMobileHistorialDisplay();
            
        } catch (error) {
            console.error('Error in transaction:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setTimeout(() => {
                this._transactionLock = false;
                this.updatePcModalActionButton();
            }, 600);
        }
    }
    
    // Cargar límites diarios desde localStorage
    loadDailyLimits() {
        const today = new Date().toDateString();
        try {
            const savedLimits = localStorage.getItem(`tienda_limits_${this.scene?.playerName || 'guest'}_${today}`);
            if (savedLimits) {
                this.dailyLimits = JSON.parse(savedLimits);
            } else {
                this.dailyLimits = {};
                localStorage.setItem(`tienda_limits_${this.scene?.playerName || 'guest'}_${today}`, JSON.stringify(this.dailyLimits));
            }
        } catch (err) {
            this.dailyLimits = {};
        }
    }
    
    // Guardar límites diarios
    saveDailyLimits() {
        const today = new Date().toDateString();
        try {
            localStorage.setItem(`tienda_limits_${this.scene?.playerName || 'guest'}_${today}`, JSON.stringify(this.dailyLimits));
        } catch (err) {
            console.warn('No se pudo guardar límites diarios:', err);
        }
    }
    
    // Cargar historial
    loadHistorial() {
        try {
            const savedHistorial = localStorage.getItem(`tienda_historial_${this.scene?.playerName || 'guest'}`);
            if (savedHistorial) {
                this.historial = JSON.parse(savedHistorial);
            }
        } catch (err) {
            this.historial = [];
        }
        this.updateHistorialDisplay();
    }
    
    // Guardar historial
    saveHistorial() {
        try {
            if (this.historial.length > 100) {
                this.historial = this.historial.slice(-100);
            }
            localStorage.setItem(`tienda_historial_${this.scene?.playerName || 'guest'}`, JSON.stringify(this.historial));
        } catch (err) {
            console.warn('No se pudo guardar historial:', err);
        }
    }
    
    // Agregar al historial
    addToHistorial(type, item, quantity, totalPrice) {
        const transaction = {
            type: type,
            itemId: item.id,
            itemName: item.name,
            itemImage: item.image,
            quantity: quantity,
            price: totalPrice,
            currency: this.getItemCurrency(item),
            timestamp: new Date().toLocaleString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            date: new Date().toLocaleDateString('en-US')
        };
        
        this.historial.unshift(transaction);
        this.saveHistorial();
        this.updateHistorialDisplay();
        this.updateMobileHistorialDisplay();
    }
    
    // Limpiar historial con modal de confirmación personalizado
    async clearHistorial() {
        const confirmed = await this.createConfirmationModal('Are you sure you want to clear your transaction history? This action cannot be undone.');
        if (!confirmed) return;
        
        this.historial = [];
        try {
            localStorage.removeItem(`tienda_historial_${this.scene?.playerName || 'guest'}`);
        } catch (err) { /* ignore */ }
        
        this.updateHistorialDisplay();
        this.updateMobileHistorialDisplay();
        this.showNotification('History cleared successfully', 'success');
    }
    
    // Crear modal de confirmación personalizado que devuelve una Promise<boolean>
    createConfirmationModal(message) {
        return new Promise((resolve) => {
            // Crear overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirmation-overlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10010;
            `;
            
            // Crear caja del modal
            const box = document.createElement('div');
            box.className = 'confirmation-box';
            box.style.cssText = `
                background: #0f1724;
                color: #fff;
                padding: 20px;
                border-radius: 8px;
                width: 90%;
                max-width: 420px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                font-family: Arial, sans-serif;
                text-align: center;
            `;
            
            const text = document.createElement('div');
            text.style.marginBottom = '16px';
            text.textContent = message;
            
            const buttons = document.createElement('div');
            buttons.style.display = 'flex';
            buttons.style.justifyContent = 'center';
            buttons.style.gap = '12px';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                padding: 8px 14px;
                border-radius: 6px;
                border: none;
                background: #374151;
                color: white;
                cursor: pointer;
            `;
            
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'Confirm';
            confirmBtn.style.cssText = `
                padding: 8px 14px;
                border-radius: 6px;
                border: none;
                background: #06b6d4;
                color: #042029;
                cursor: pointer;
                font-weight: bold;
            `;
            
            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            
            box.appendChild(text);
            box.appendChild(buttons);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            
            const cleanup = () => {
                try { overlay.remove(); } catch (err) { /* ignorar */ }
            };
            
            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            
            // También cerrar al hacer clic en overlay (tratar como cancelar)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }
    
    // Abrir la tienda
    async open() {
        if (this.isOpen) return;
        
        // Pausar escena de Phaser de forma segura
        if (this.scene && this.scene.scene && typeof this.scene.scene.pause === 'function') {
            try {
                let sceneKey = null;
                if (this.scene.sys && this.scene.sys.settings && this.scene.sys.settings.key) {
                    sceneKey = this.scene.sys.settings.key;
                }
                if (!sceneKey && this.scene.scene && this.scene.scene.key) {
                    sceneKey = this.scene.scene.key;
                }
                if (!sceneKey && this.scene.sys && this.scene.sys.config && this.scene.sys.config.key) {
                    sceneKey = this.scene.sys.config.key;
                }
                
                if (sceneKey && typeof this.scene.scene.isActive === 'function' && this.scene.scene.isActive(sceneKey)) {
                    this.scene.scene.pause(sceneKey);
                }
            } catch (err) {
                console.warn('No se pudo pausar la escena de forma segura:', err);
            }
            
            try {
                if (this.scene.input && this.scene.input.keyboard) {
                    this.scene.input.keyboard.enabled = false;
                }
            } catch (err) { /* ignorar */ }
        }
        
        await this.loadPlayerMoneda();
        
        document.getElementById('tienda-hub')?.classList.remove('tienda-hub-hidden');
        document.getElementById('tienda-overlay')?.classList.remove('tienda-overlay-hidden');
        
        this.isOpen = true;
        
        this.filterItems?.();
        this.updateMonedaDisplay();
        this.selectedItem = null;
        
        if (!this.isMobile) {
            setTimeout(() => {
                document.getElementById('tienda-search')?.focus();
            }, 300);
        }
        
        console.log('🏪 Tienda abierta - Modo:', this.isMobile ? 'Móvil' : 'PC');
    }
    
    // Cerrar la tienda
    close() {
        if (!this.isOpen) return;
        
        if (this.scene && this.scene.scene && typeof this.scene.scene.resume === 'function') {
            try {
                let sceneKey = null;
                if (this.scene.sys && this.scene.sys.settings && this.scene.sys.settings.key) {
                    sceneKey = this.scene.sys.settings.key;
                }
                if (!sceneKey && this.scene.scene && this.scene.scene.key) {
                    sceneKey = this.scene.scene.key;
                }
                if (!sceneKey && this.scene.sys && this.scene.sys.config && this.scene.sys.config.key) {
                    sceneKey = this.scene.sys.config.key;
                }
                
                if (sceneKey && typeof this.scene.scene.isPaused === 'function' && this.scene.scene.isPaused(sceneKey)) {
                    this.scene.scene.resume(sceneKey);
                }
            } catch (err) {
                console.warn('No se pudo reanudar la escena de forma segura:', err);
            }
            
            try {
                if (this.scene.input && this.scene.input.keyboard) {
                    this.scene.input.keyboard.enabled = true;
                }
            } catch (err) { /* ignorar */ }
        }
        
        this.closeMobileModal();
        this.closeMobileHistorialModal();
        this.closePcModal();
        
        document.getElementById('tienda-hub')?.classList.add('tienda-hub-hidden');
        document.getElementById('tienda-overlay')?.classList.add('tienda-overlay-hidden');
        
        document.getElementById('tienda-search')?.blur();
        
        this.isOpen = false;
        this.selectedItem = null;
        
        console.log('🏪 Tienda cerrada');
    }
    
    // Abrir modal móvil
    openMobileModal() {
        if (!this.isMobile || !this.selectedItem) return;
        
        document.getElementById('mobile-item-modal')?.classList.remove('hidden');
        this.updateMobileModal();
        
        console.log('📱 Modal móvil abierto');
    }
    
    // Cerrar modal móvil
    closeMobileModal() {
        document.getElementById('mobile-item-modal')?.classList.add('hidden');
        console.log('📱 Modal móvil cerrado');
    }
    
    // Actualizar modal móvil (muestra precio según tipo de transacción)
    updateMobileModal() {
        if (!this.selectedItem) return;
        
        const item = this.selectedItem;
        const purchasedToday = this.dailyLimits[item.id] || 0;
        const disponible = this.transactionType === 'compra' 
            ? (item.limiteDiario ? item.limiteDiario - purchasedToday : 99)
            : this.getItemCountInInventory(item.id);
        
        document.getElementById('mobile-item-name').textContent = item.name;
        document.getElementById('mobile-item-img').src = item.image;
        document.getElementById('mobile-item-img').alt = item.name;
        
        // Mostrar precio según tipo de transacción
        const mobilePriceEl = document.getElementById('mobile-item-price');
        if (mobilePriceEl) {
            const priceAmount = this.transactionType === 'compra' ? item.buyPrice : item.sellPrice;
            mobilePriceEl.innerHTML = this.formatCurrencyAmount(priceAmount, this.getItemCurrency(item));
        }
        
        document.getElementById('mobile-item-desc').textContent = item.descripcion;
        document.getElementById('mobile-item-stock').textContent = 
            item.limiteDiario ? `${item.limiteDiario - purchasedToday} remaining` : '∞';
        document.getElementById('mobile-item-disponible').textContent = 
            this.transactionType === 'compra' ? `${disponible} available` : `${disponible} in inventory`;
        document.getElementById('mobile-item-comision').textContent = 
            this.transactionType === 'venta' ? `${item.comision}%` : '0%';
        
        const actionText = document.getElementById('mobile-action-text');
        actionText && (actionText.textContent = this.transactionType === 'compra' ? 'Buy' : 'Sell');
        
        const mobileQtyInput = document.getElementById('mobile-quantity-input');
        if (mobileQtyInput) mobileQtyInput.value = 1;
        
        this.updateMobileTotalPrice();
        this.updateMobileActionButton();
    }
    
    // Cargar moneda del jugador
    async loadPlayerMoneda() {
        const scene = this.scene || {};

        const goldFromScene = scene.moneda ?? scene.monto_moneda ?? scene.playerMoneda ?? null;
        const silverFromScene = scene.moneda_plata ?? scene.monedaPlata ?? scene.playerMonedaPlata ?? null;

        if (goldFromScene !== null && goldFromScene !== undefined) {
            this.playerMoneda = Math.floor(Number(goldFromScene) || 0);
        }
        if (silverFromScene !== null && silverFromScene !== undefined) {
            this.playerMonedaPlata = Math.floor(Number(silverFromScene) || 0);
        }

        if ((goldFromScene === null || goldFromScene === undefined) && scene.serverBase && scene.playerName) {
            try {
                const response = await fetch(`${scene.serverBase}/load/${encodeURIComponent(scene.playerName)}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': scene.csrfToken || ''
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.playerMoneda = Number(data.moneda ?? data.monto_moneda ?? 0) || 0;
                    this.playerMonedaPlata = Number(data.moneda_plata ?? data.monedaPlata ?? 0) || 0;
                } else {
                    this.playerMoneda = 0;
                    this.playerMonedaPlata = 0;
                }
            } catch (error) {
                console.error('Error cargando moneda:', error);
                this.playerMoneda = 0;
                this.playerMonedaPlata = 0;
            }
        }
    }
    
    // Filtrar items
    filterItems() {
        const itemsContainer = document.getElementById('tienda-items');
        const loadingElement = document.getElementById('tienda-loading');
        const emptyElement = document.getElementById('tienda-empty');
        const totalItemsElement = document.getElementById('tienda-total-items');
        const filtroElement = document.getElementById('tienda-filtro');
        
        if (!itemsContainer) return;
        
        if (loadingElement) loadingElement.style.display = 'flex';
        if (emptyElement) emptyElement.style.display = 'none';
        itemsContainer.innerHTML = '';
        
        let allItems = [];
        if (this.currentCategory === 'todas') {
            Object.values(this.itemsTienda).forEach(category => {
                allItems = allItems.concat(category);
            });
        } else if (this.itemsTienda[this.currentCategory]) {
            allItems = this.itemsTienda[this.currentCategory];
        }
        
        if (this.searchQuery) {
            allItems = allItems.filter(item => 
                item.name.toLowerCase().includes(this.searchQuery) ||
                item.id.toLowerCase().includes(this.searchQuery) ||
                item.descripcion.toLowerCase().includes(this.searchQuery)
            );
        }
        
        if (this.transactionType === 'venta') {
            allItems = allItems.filter(item => {
                const count = this.getItemCountInInventory(item.id);
                return count > 0;
            });
        }
        
        const totalItems = allItems.length;
        if (totalItemsElement) totalItemsElement.textContent = totalItems;
        
        let filtroTexto = '';
        if (this.currentCategory === 'todas') {
            filtroTexto = 'All items';
        } else {
            const categorias = {
                'semillas': 'Seeds',
                'herramientas': 'Tools',
                'minerales': 'Minerals',
                'alimentos': 'Food',
                'equipo': 'Equipment',
                'especial': 'Special'
            };
            filtroTexto = categorias[this.currentCategory] || this.currentCategory;
        }
        
        if (this.searchQuery) {
            filtroTexto += ` - Search: "${this.searchQuery}"`;
        }
        
        if (filtroElement) filtroElement.textContent = filtroTexto;
        
        setTimeout(() => {
            if (loadingElement) loadingElement.style.display = 'none';
            
            if (totalItems === 0) {
                if (emptyElement) emptyElement.style.display = 'flex';
                return;
            }
            
            allItems.forEach(item => {
                const itemCard = this.createItemCard(item);
                itemsContainer.appendChild(itemCard);
            });
            
            this.setupItemTouchEvents();
        }, 300);
    }
    
    // Crear tarjeta de item (muestra precio según tipo de transacción)
    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;
        
        const purchasedToday = this.dailyLimits[item.id] || 0;
        const isLimited = item.limiteDiario > 0 && this.transactionType === 'compra';
        const isSoldOut = isLimited && purchasedToday >= item.limiteDiario;
        
        if (isLimited) card.classList.add('limited');
        if (isSoldOut) card.classList.add('sold-out');
        
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        img.className = 'item-image';
        img.loading = 'lazy';
        
        const name = document.createElement('div');
        name.className = 'item-name';
        name.textContent = item.name;
        
        const price = document.createElement('div');
        price.className = 'item-price';
        
        const currency = this.getItemCurrency(item);
        const monedaIcon = document.createElement('img');
        monedaIcon.src = this.getCurrencyIconPath(currency);
        monedaIcon.alt = this.getCurrencyLabel(currency);
        monedaIcon.className = 'moneda-icon';
        
        const priceValue = document.createElement('span');
        const priceAmount = this.transactionType === 'compra' ? item.buyPrice : item.sellPrice;
        priceValue.textContent = `${priceAmount} ${this.getCurrencyLabel(currency)}`;
        priceValue.title = this.transactionType === 'compra' ? 'Purchase price' : 'Sale price';
        
        price.appendChild(monedaIcon);
        price.appendChild(priceValue);
        
        if (isLimited) {
            const limit = document.createElement('div');
            limit.className = 'item-limit';
            limit.textContent = `${purchasedToday}/${item.limiteDiario} per day`;
            card.appendChild(limit);
        }
        
        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(price);
        
        if (this.isMobile) {
            // móvil: toque manejado globalmente
        } else {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectItem(item.id);
            });
        }
        
        return card;
    }
    
    // Seleccionar un item
    selectItem(itemId) {
        document.querySelectorAll('.item-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        
        let selectedItemData = null;
        for (const category of Object.values(this.itemsTienda)) {
            const found = category.find(item => item.id === itemId);
            if (found) {
                selectedItemData = found;
                break;
            }
        }
        
        if (!selectedItemData) return;
        
        const card = document.querySelector(`.item-card[data-item-id="${itemId}"]`);
        if (card) card.classList.add('selected');
        
        this.selectedItem = selectedItemData;
        
        if (this.isMobile) {
            this.updateMobileModal();
        } else {
            this.updatePcSimpleDetail();
        }
        
        console.log('✅ Item seleccionado:', selectedItemData.name);
    }
    
    // Actualizar detalles simples en PC (solo imagen, nombre y precio - según tipo de transacción)
    updatePcSimpleDetail() {
        const detailImg = document.getElementById('detail-img-simple');
        const detailName = document.getElementById('detail-name-simple');
        const priceContainer = document.getElementById('detail-price-simple');
        const interactBtn = document.getElementById('interact-button-pc');
        
        if (!this.selectedItem) {
            if (detailImg) detailImg.src = './Game/Source/moneda de oro.png';
            if (detailName) detailName.textContent = 'Select an item';
            if (priceContainer) priceContainer.innerHTML = `<img src="./Game/Source/moneda de oro.png" alt="GL" class="moneda-icon"> 0 GL`;
            if (interactBtn) interactBtn.disabled = true;
            return;
        }
        
        const item = this.selectedItem;
        const currency = this.getItemCurrency(item);
        const priceAmount = this.transactionType === 'compra' ? item.buyPrice : item.sellPrice;

        if (detailImg) { detailImg.src = item.image; detailImg.alt = item.name; }
        if (detailName) detailName.textContent = item.name;

        // Fix: use innerHTML so the coin icon + label are always correct — no more double GL
        if (priceContainer) {
            priceContainer.innerHTML = this.formatCurrencyAmount(priceAmount, currency);
        }
        
        if (interactBtn) interactBtn.disabled = false;
        
        const tabDetalles = document.getElementById('tab-detalles');
        if (tabDetalles && !tabDetalles.classList.contains('active')) {
            this.switchTab('detalles');
        }
    }
    
    // Obtener cantidad de un item en el inventario
    getItemCountInInventory(itemId) {
        if (!this.scene || !this.scene.STATE) return 0;
        
        let count = 0;
        
        try {
            (this.scene.STATE.slots || []).forEach(slot => {
                if (slot && slot.id === itemId) {
                    count += slot.count || 1;
                }
            });
            
            (this.scene.STATE.quickSlots || []).forEach(slot => {
                if (slot && slot.id === itemId) {
                    count += slot.count || 1;
                }
            });
        } catch (err) {
            return 0;
        }
        
        return count;
    }
    
    // Cambiar cantidad (Móvil)
    changeMobileQuantity(delta) {
        const input = document.getElementById('mobile-quantity-input');
        if (!input) return;
        let current = parseInt(input.value) || 1;
        let newValue = current + delta;
        
        const max = this.getMaxQuantity();
        if (newValue > max) newValue = max;
        if (newValue < 1) newValue = 1;
        
        input.value = newValue;
        this.updateMobileTotalPrice();
        this.updateMobileActionButton();
    }
    
    // Obtener cantidad máxima permitida
    getMaxQuantity() {
        if (!this.selectedItem) return 99;
        
        const item = this.selectedItem;
        
        if (this.transactionType === 'compra') {
            const balance = this.getBalanceByCurrency(this.getItemCurrency(item));
            const price = this.transactionType === 'compra' ? item.buyPrice : item.sellPrice;
            const maxByMoney = price > 0 ? Math.floor(balance / price) : 99;
            const purchasedToday = this.dailyLimits[item.id] || 0;
            const maxByLimit = item.limiteDiario > 0 ? (item.limiteDiario - purchasedToday) : 99;
            
            return Math.max(0, Math.min(maxByMoney, maxByLimit, 99));
        } else {
            return Math.max(0, this.getItemCountInInventory(item.id));
        }
    }
    
    // Actualizar precio total (Móvil)
    updateMobileTotalPrice() {
        if (!this.selectedItem) return;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('mobile-quantity-input')?.value) || 1;
        
        const currency = this.getItemCurrency(item);
        let total;
        if (this.transactionType === 'compra') {
            total = item.buyPrice * quantity;
        } else {
            total = item.sellPrice * quantity;
        }
        
        const totalEl = document.getElementById('mobile-action-total');
        if (totalEl) {
            totalEl.innerHTML = `Total: ${this.formatCurrencyAmount(total, currency)}`;
        }
    }
    
    // Actualizar botón de acción (Móvil)
    updateMobileActionButton() {
        const button = document.getElementById('mobile-action-button');
        const actionText = document.getElementById('mobile-action-text');
        if (!button || !this.selectedItem || !actionText) return;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('mobile-quantity-input')?.value) || 1;
        const purchasedToday = this.dailyLimits[item.id] || 0;
        
        let enabled = true;
        let text = '';
        
        if (this.transactionType === 'compra') {
            text = 'Buy';
            const totalCost = item.buyPrice * quantity;
            if (totalCost > this.getBalanceByCurrency(this.getItemCurrency(item))) {
                enabled = false;
                text = 'Insufficient funds';
            }
            
            if (item.limiteDiario > 0 && (purchasedToday + quantity) > item.limiteDiario) {
                enabled = false;
                text = 'Limit exceeded';
            }
            
            if (item.limiteDiario > 0 && purchasedToday >= item.limiteDiario) {
                enabled = false;
                text = 'Sold out today';
            }
        } else {
            text = 'Sell';
            const playerCount = this.getItemCountInInventory(item.id);
            if (quantity > playerCount) {
                enabled = false;
                text = 'Not enough items';
            }
        }
        
        button.disabled = !enabled;
        actionText.textContent = text;
        const iconEl = document.querySelector('.mobile-action-icon');
        if (iconEl) iconEl.textContent = this.transactionType === 'compra' ? '💰' : '💵';
    }
    
    // Ejecutar transacción (Móvil)
    async executeMobileTransaction() {
        if (!this.selectedItem) return;

        // Anti-bot: prevent rapid double-taps / bot spam
        if (this._transactionLock) {
            console.warn('⚠️ Transaction blocked: cooldown active');
            return;
        }
        this._transactionLock = true;
        const btn = document.getElementById('mobile-action-button');
        if (btn) btn.disabled = true;
        
        const item = this.selectedItem;
        const quantity = parseInt(document.getElementById('mobile-quantity-input').value) || 1;
        
        try {
            if (this.transactionType === 'compra') {
                await this.processPurchase(item, quantity);
            } else {
                await this.processSale(item, quantity);
            }
            
            // Do NOT call loadPlayerMoneda() here — it would overwrite the local deduction.
            this.updateMonedaDisplay();
            this.filterItems?.();
            
            if (this.isMobile) {
                this.updateMobileModal();
                this.updateMobileActionButton();
            } else {
                this.updatePcSimpleDetail();
            }
            
            this.updateHistorialDisplay();
            this.updateMobileHistorialDisplay();
            
        } catch (error) {
            console.error('Error in transaction:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setTimeout(() => {
                this._transactionLock = false;
                if (this.isMobile) this.updateMobileActionButton();
            }, 600);
        }
    }
    
    // Procesar compra usando buyPrice
    async processPurchase(item, quantity) {
        const currency = this.getItemCurrency(item);
        const totalCost = item.buyPrice * quantity;
        const balance = this.getBalanceByCurrency(currency);
        
        if (totalCost > balance) {
            throw new Error('Insufficient funds for this purchase');
        }
        
        const purchasedToday = this.dailyLimits[item.id] || 0;
        if (item.limiteDiario > 0 && (purchasedToday + quantity) > item.limiteDiario) {
            throw new Error('Daily purchase limit exceeded');
        }
        
        this.setBalanceByCurrency(currency, balance - totalCost);
        
        if (item.limiteDiario > 0) {
            this.dailyLimits[item.id] = (this.dailyLimits[item.id] || 0) + quantity;
            this.saveDailyLimits();
        }
        
        const transactionInfo = {
            type: 'compra',
            itemId: item.id,
            itemName: item.name,
            quantity,
            unitPrice: item.buyPrice,
            totalCost,
            currency,
            fee: 0,
            remainingGold: this.playerMoneda,
            remainingSilver: this.playerMonedaPlata
        };

        if (transactionInfo.itemId === "hacha_de_madera") {
            await this.ejecutarDivision("hacha de madera","hacha_de_madera",5,transactionInfo.quantity);
        }


        console.log('🛒 SHOP TRANSACTION (PURCHASE)', transactionInfo);
        
        this.addToHistorial('compra', item, quantity, totalCost);
        this.showTransactionAnimation('compra', item, quantity, totalCost);
        
        try { this.scene?.queuedAction && this.scene.queuedAction({ type: 'forSpam2' }); } catch (err) { /* ignorar */ }
        console.log(`✅ Purchase recorded: ${quantity}x ${item.name} for ${totalCost} ${this.getCurrencyLabel(currency)}`);
    }





// ------------------------------------------------------------------
// FUNCIÓN EJECUTAR DIVISIÓN CORREGIDA
// ------------------------------------------------------------------
async ejecutarDivision(ruta_tabla, producto, limitacion, cantidad) {
  // Validaciones rápidas
  if (limitacion <= 0 || cantidad <= 0) return;

  // Evita llamadas concurrentes si ya hay una en progreso
  if (this._transactionInProgress) {
    console.warn('Ya hay una transacción en progreso — cancelar nueva petición.');
    return;
  }

  // Llamada única a Additemblockchains con la cantidad total.
  // El simulador (simulateAddItem) se encargará de distribuir la cantidad
  // respetando el límite por stack (que se asume conocido por el producto o ruta_tabla).
  await this.Additemblockchains(ruta_tabla, producto, cantidad);
}

// ------------------------------------------------------------------
// GENERADOR DE manualId (se mantiene igual)
// ------------------------------------------------------------------
generarCodigo(longitud = 19) {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let resultado = '';
  for (let i = 0; i < longitud; i++) {
    resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return resultado;
}

// ------------------------------------------------------------------
// BLOQUEO VISUAL DE SLOTS (se mantiene igual)
// ------------------------------------------------------------------
lockSlot(type, index) {
  const selector = type === 'inv'
    ? `.inv-slot[data-slot-index="${index}"]`
    : `.quick-slot[data-slot-index="${index}"]`;
  const slot = document.querySelector(selector);
  if (slot) slot.classList.add('slot-locked');
}

unlockAllSlots() {
  document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
    slot.classList.remove('slot-locked');
  });
}

// ------------------------------------------------------------------
// FUNCIÓN PRINCIPAL ADDITEMBLOCKCHAINS (sin cambios, pero se incluye completa)
// ------------------------------------------------------------------
async Additemblockchains(ruta_tabla, producto, cantidad) {
  // Evitar llamadas concurrentes
  if (this._transactionInProgress) {
    console.warn('Transacción ya en progreso. Ignorando nueva petición.');
    return;
  }
  this._transactionInProgress = true;

  // Helpers locales (autocontenidos para no depender de funciones externas)
  const self = this;

  function generarCodigoLocal(longitud = 19) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
      resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
  }

  function lockSlotLocal(type, index) {
    try {
      const selector = type === 'inv'
        ? `.inv-slot[data-slot-index="${index}"]`
        : `.quick-slot[data-slot-index="${index}"]`;
      const slot = document.querySelector(selector);
      if (slot) slot.classList.add('slot-locked');
    } catch (e) {
      console.warn('lockSlotLocal fallo:', e);
    }
  }

  function unlockAllSlotsLocal() {
    try {
      document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
        slot.classList.remove('slot-locked');
      });
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo:', e);
    }
  }

  async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Reintentos: enviar acción y esperar confirmación
  async function _sendAndWaitWithRetries(relayClient, contractAddress, accionObj, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const sendResult = await relayClient.accion(contractAddress, accionObj);
        if (!sendResult || !sendResult.success) {
          console.warn(`Attempt ${attempt}: sendResult no exitoso`, sendResult);
          if (attempt === maxAttempts) return { success: false, error: sendResult?.error || 'sendFailed' };
          await sleep(800 * attempt);
          continue;
        }

        // esperar confirmación
        const final = await relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
        if (final && final.success) {
          return { success: true, txHash: final.txHash, transactionId: sendResult.transactionId };
        } else {
          console.warn(`Attempt ${attempt}: confirmación fallida`, final);
          if (attempt === maxAttempts) return { success: false, error: final?.error || 'confirmFailed' };
          await sleep(800 * attempt);
          continue;
        }
      } catch (err) {
        console.error(`Attempt ${attempt} error:`, err);
        if (attempt === maxAttempts) return { success: false, error: err.message || String(err) };
        await sleep(800 * attempt);
      }
    }
    return { success: false, error: 'unknown' };
  }

  // Parser robusto para getInvoiceByManualId
  function _getInvoiceFieldsFromResponse(lastMessage) {
    try {
      // Si es array -> mapeo por posiciones esperadas del struct de tu contrato
      if (Array.isArray(lastMessage)) {
        const invoiceId = Number(lastMessage[0]) || 0;
        const manualId = lastMessage[1] || '';
        const cantidadx = Number(lastMessage[4] ?? lastMessage[3] ?? 0) || 0;
        return { invoiceId, manualId, cantidadx, raw: lastMessage };
      }

      // Si es objeto: intentar formar un array a partir de keys '0','1' o 'out0','out1'
      if (lastMessage && typeof lastMessage === 'object') {
        const indexed = [];
        for (const k of Object.keys(lastMessage)) {
          let m = null;
          if (/^\d+$/.test(k)) {
            m = Number(k);
          } else {
            const mo = k.match(/^out(\d+)$/i);
            if (mo) m = Number(mo[1]);
          }
          if (m !== null) indexed[m] = lastMessage[k];
        }
        if (indexed.length > 0) {
          const invoiceId = Number(indexed[0]) || 0;
          const manualId = indexed[1] || '';
          const cantidadx = Number(indexed[4] ?? indexed[3] ?? 0) || 0;
          return { invoiceId, manualId, cantidadx, raw: indexed };
        }

        // Fallback: buscar por nombres de campo conocidos
        const pick = (names) => {
          for (const n of names) {
            if (lastMessage[n] !== undefined) return lastMessage[n];
            const lower = n.toLowerCase();
            if (lastMessage[lower] !== undefined) return lastMessage[lower];
          }
          return undefined;
        };

        const invoiceIdRaw = pick(['invoiceId', 'id', 'InvoiceId', '_id']);
        const manualIdRaw = pick(['manualId', '_manualId', 'manualID']);
        const cantidadRaw = pick(['cantidad', 'quantity', '_cantidad', 'amount']);

        const invoiceId = invoiceIdRaw !== undefined ? Number(invoiceIdRaw) : 0;
        const manualId = manualIdRaw !== undefined ? String(manualIdRaw) : '';
        const cantidadx = cantidadRaw !== undefined ? Number(cantidadRaw) : 0;

        return { invoiceId: invoiceId || 0, manualId, cantidadx, raw: lastMessage };
      }
    } catch (err) {
      console.error('_getInvoiceFieldsFromResponse error:', err, 'lastMessage:', lastMessage);
    }
    return { invoiceId: 0, manualId: '', cantidadx: 0, raw: lastMessage };
  }

  try {
    // Inicializar relayClient si hace falta
    if (!this.relayClient) {
      this.relayClient = new PhaserRelay({
        apiBase: 'http://127.0.0.1:3001',
        debug: true,
        forceLocalhostTo127: true
      });
      await this.relayClient.initialize();
    }

    // debugBackendConnection puede intentar /ping; capturamos errores pero seguimos
    try {
      const debugInfo = await this.relayClient.debugBackendConnection();
      console.log('🔍 Debug info:', debugInfo);
    } catch (dbgErr) {
      // ignora 404 /ping u otros inconvenientes de debug, solo registra
      console.warn('debugBackendConnection fallo (ignorable):', dbgErr && dbgErr.message ? dbgErr.message : dbgErr);
    }

    // Auth
    const auth = await this.relayClient.checkAuth();
    if (!auth || !auth.success) {
      this.relayClient.showError('❌ Debes estar autenticado. Visita http://127.0.0.1:3001/login', 5000);
      return;
    }
    console.log('🔑 Usuario autenticado:', auth.address);

    // Establecer usuario en el hub (si no se ha hecho antes)
    if (window.hub && this.playerName) {
      window.hub.setUser(this.playerName, auth.address);
    }

    // Encontrar contrato
    let contract;
    try {
      contract = await this.relayClient.findContract('ItemContract');
    } catch (error) {
      this.relayClient.showError('❌ Error conectando al backend: ' + (error.message || error), 5000);
      return;
    }
    if (!contract) {
      this.relayClient.showError('❌ Contrato ItemContract no encontrado', 3000);
      return;
    }
    console.log('📄 Contrato encontrado:', contract.address);

    // ===== SIMULADOR =====
    const reporte = this.simulateAddItem(producto, cantidad);
    console.error('Reporte completo:', reporte);

    // Bloquear slots implicados (si vienen)
    if (Array.isArray(reporte.operations)) {
      reporte.operations.forEach(op => {
        try {
          if (op && op.location && op.location.type && op.location.index !== undefined && op.location.index !== null) {
            lockSlotLocal(op.location.type, op.location.index);
          }
        } catch (e) {
          console.warn('Error lockSlotLocal por operación:', op, e);
        }
      });
    }

    // ===== MERGES: aumentar cantidad en facturas existentes =====
    const merges = (reporte.operations || []).filter(op => op.type === 'merge');
    for (const op of merges) {
      const cantidadOp = Number(op.amountAdded) || 0;
      const idx = Number(op.idx) || 0;
      const manual = op.manualid || '';

      // Seguridad: idx === 0 no es válido (contrato usa 0 como 'no existe')
      if (idx === 0) {
        console.error('Se detectó idx = 0 en merge; se ignora para evitar borrado/colisión:', op);
        continue;
      }

      console.error(`Procesando MERGE para idx ${idx} con cantidad a añadir ${cantidadOp}`);

      // Datos para posible reintento (categoría 'items', nombre = ruta_tabla)
      const hiddenData = {
        type: 'merge',
        producto: producto,
        cantidad: cantidadOp,
        idx: idx,
        manualid: manual,
        ruta_tabla: ruta_tabla
      };

      // Hash temporal para la transacción pendiente
      const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Añadir transacción pendiente al hub (categoría 'items')
      if (window.hub) {
        window.hub.addTransaction('items', {
          name: ruta_tabla,               // nombre = ruta_tabla
          quantity: cantidadOp,
          hash: tempHash,
          status: 'pending',
          hiddenData: hiddenData
        });
      }

      const accionObj = {
        funcion: 'increaseInvoiceQuantity',
        _id: idx,
        _increaseAmount: cantidadOp,
        accion: 'enviar'
      };

      const res = await _sendAndWaitWithRetries(this.relayClient, contract.address, accionObj, 3);

      if (!res.success) {
        // Eliminar pendiente y añadir revertida
        if (window.hub) {
          window.hub.removeTransaction(tempHash);
          window.hub.addTransaction('items', {
            name: ruta_tabla,
            quantity: cantidadOp,
            hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            status: 'reverted',
            hiddenData: hiddenData
          });
        }
        console.error('No se pudo confirmar increaseInvoiceQuantity para idx', idx, 'error:', res.error);
        this.relayClient.showError && this.relayClient.showError(`❌ increaseInvoiceQuantity falló para id ${idx}`, 4000);
        continue;
      }

      // Éxito: eliminar pendiente y añadir confirmada con el hash real
      if (window.hub) {
        window.hub.removeTransaction(tempHash);
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: cantidadOp,
          hash: res.txHash,
          status: 'confirmed',
          hiddenData: hiddenData
        });
      }

      // Actualizar frontend: addItemWithCheck(producto, cantidad, invoiceId, manualId)
      try {
        if (typeof this.addItemWithCheck === 'function') {
          await this.addItemWithCheck(producto, cantidadOp, idx, manual);
          console.error(`addItemWithCheck OK (merge) para invoice ${idx} cantidad ${cantidadOp}`);
        } else {
          console.error('addItemWithCheck no encontrada; omitiendo actualización local para merge idx', idx);
        }
      } catch (err) {
        console.error('Error ejecutando addItemWithCheck tras increaseInvoiceQuantity:', err, 'idx:', idx);
      }
    }

    // ===== NUEVOS STACKS: crear facturas y añadir items localmente =====
    const nuevosStacks = (reporte.operations || []).filter(op => op.type === 'new');
    for (const op of nuevosStacks) {
      const amountAdded = Number(op.amountAdded) || 0;
      const manualGenerado = generarCodigoLocal();

      // Datos para posible reintento
      const hiddenData = {
        type: 'new',
        producto: producto,
        cantidad: amountAdded,
        ruta_tabla: ruta_tabla
        // idx y manualid se conocerán después de crear
      };

      const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Añadir transacción pendiente (categoría 'items')
      if (window.hub) {
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: amountAdded,
          hash: tempHash,
          status: 'pending',
          hiddenData: hiddenData
        });
      }

      const accionCrear = {
        funcion: 'createInvoice',
        _owner: this.playerName,
        _tipo: ruta_tabla,
        _cantidad: amountAdded,
        _manualId: manualGenerado,
        accion: 'enviar'
      };

      const resCrear = await _sendAndWaitWithRetries(this.relayClient, contract.address, accionCrear, 3);

      if (!resCrear.success) {
        if (window.hub) {
          window.hub.removeTransaction(tempHash);
          window.hub.addTransaction('items', {
            name: ruta_tabla,
            quantity: amountAdded,
            hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            status: 'reverted',
            hiddenData: hiddenData
          });
        }
        console.error('createInvoice falló para nuevo stack (cantidad):', amountAdded, 'error:', resCrear.error);
        this.relayClient.showError && this.relayClient.showError(`❌ createInvoice falló para ${amountAdded}`, 4000);
        continue;
      }

      // Éxito en createInvoice: actualizamos la transacción pendiente a confirmada con el hash real
      if (window.hub) {
        window.hub.removeTransaction(tempHash);
        // Aún no tenemos idx/manualid, los añadiremos después de obtenerlos
        // Por ahora guardamos la confirmada sin esos datos, pero luego la actualizaremos o añadiremos otra
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: amountAdded,
          hash: resCrear.txHash,
          status: 'confirmed',
          hiddenData: hiddenData   // se completará más abajo con idx/manualid
        });
      }

      // Obtener la factura por manualId (view)
      let lastMessage;
      try {
        lastMessage = await this.relayClient.accion(contract.address, {
          funcion: 'getInvoiceByManualId',
          _manualId: manualGenerado,
          accion: 'obtener'
        });
      } catch (err) {
        console.error('Error llamando getInvoiceByManualId:', err);
        continue;
      }

      if (!lastMessage) {
        console.warn('getInvoiceByManualId devolvió vacío para manualId:', manualGenerado);
        continue;
      }

      // Parsear robustamente
      const parsed = _getInvoiceFieldsFromResponse(lastMessage);
      console.log('Parsed invoice response:', parsed);

      let { invoiceId, manualId, cantidadx } = parsed;

      // Si invoiceId sigue 0, intentar extraer keys directas como out0 o '0'
      if ((!invoiceId || Number(invoiceId) === 0) && lastMessage && typeof lastMessage === 'object') {
        for (const k of Object.keys(lastMessage)) {
          if (/^out?0$/i.test(k) || /^0$/.test(k)) {
            invoiceId = Number(lastMessage[k]) || invoiceId;
            break;
          }
        }
      }

      // Validar invoiceId
      if (!invoiceId || Number(invoiceId) === 0) {
        console.error('InvoiceId inválido o 0 tras todos los intentos — ignorando. lastMessage:', lastMessage, 'parsed:', parsed);
        continue;
      }

      // Normalizar cantidad y manualId
      invoiceId = Number(invoiceId);
      cantidadx = Number(cantidadx) || amountAdded || 0;
      manualId = manualId || manualGenerado;

      // Ahora que tenemos idx y manualid, actualizamos hiddenData de la transacción confirmada
      // Como no podemos modificar la transacción ya añadida, podríamos eliminarla y volver a añadir con los datos completos,
      // o simplemente dejar la que ya está (la información principal ya está). Para mantener consistencia, la reemplazamos.
      if (window.hub) {
        // Buscar la transacción con ese hash y actualizar hiddenData (si el hub lo permitiera)
        // Pero como no tenemos método de actualización, eliminamos y volvemos a añadir.
        window.hub.removeTransaction(resCrear.txHash);
        hiddenData.idx = invoiceId;
        hiddenData.manualid = manualId;
        window.hub.addTransaction('items', {
          name: ruta_tabla,
          quantity: cantidadx,
          hash: resCrear.txHash,
          status: 'confirmed',
          hiddenData: hiddenData
        });
      }

      // Finalmente actualizar frontend
      try {
        if (typeof this.addItemWithCheck === 'function') {
          await this.addItemWithCheck(producto, cantidadx, invoiceId, manualId);
          console.error(`addItemWithCheck OK (new) para invoice ${invoiceId} cantidad ${cantidadx}`);
        } else {
          console.error('addItemWithCheck no encontrada; omitiendo actualización local para invoiceId', invoiceId);
        }
      } catch (err) {
        console.error('Error ejecutando addItemWithCheck tras createInvoice:', err, 'invoiceId:', invoiceId, 'manualId:', manualId);
      }
    }

    console.log('Additemblockchains: procesamiento finalizado.');
  } catch (error) {
    console.error('❌ Error crítico en Additemblockchains:', error);
    if (this.relayClient && typeof this.relayClient.showError === 'function') {
      this.relayClient.showError(`❌ Error crítico: ${error.message}`, 5000);
    }
  } finally {
    // Liberar bloqueo visual y bandera de transacción
    try {
      unlockAllSlotsLocal();
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo en finally:', e);
    }
    this._transactionInProgress = false;
  }
}


/**
 * Simula la adición de 'quantity' unidades del ítem 'itemId' al inventario,
 * completando stacks parciales y creando nuevos stacks hasta agotar la cantidad.
 *
 * @param {string} itemId      - Clave del ítem en ItemDefinitions.
 * @param {number} quantity    - Cantidad a agregar (por defecto 1).
 * @returns {Object}           - Reporte con operaciones y resumen.
 */
simulateAddItem(itemId, quantity = 1) {
  const def = this.ItemDefinitions?.[itemId];
  if (!def) {
    console.error(`Item "${itemId}" no definido en ItemDefinitions`);
    return {
      success: false,
      remaining: quantity,
      operations: [],
      summary: { totalMerged: 0, totalNewStacks: 0, newStacksCount: 0, slotsUsed: { quick: 0, inv: 0 } }
    };
  }

  const maxStack = def.maxStack;
  let remaining = quantity;

  // Clonar los slots para simular sin tocar los reales
  const simQuick = this.STATE.quickSlots.map(s => s ? { ...s } : null);
  const simInv = this.STATE.slots.map(s => s ? { ...s } : null);

  // Evitar tocar el ítem seleccionado (fantasma)
  const occupied = new Set();
  if (this.STATE.selectedItem) {
    const sel = this.STATE.selectedItem;
    if (sel.originType === 'inv') occupied.add(`inv-${sel.originIndex}`);
    else if (sel.originType === 'quick') occupied.add(`quick-${sel.originIndex}`);
  }
  const isOccupied = (type, idx) => occupied.has(`${type}-${idx}`);

  const operations = [];

  // --------------------------------------------------------
  // Función interna: completar stacks parciales existentes
  // --------------------------------------------------------
  const completePartialStacks = (slots, type) => {
    let mergedAny = false;
    for (let i = 0; i < slots.length; i++) {
      if (remaining <= 0) break;
      if (isOccupied(type, i)) continue;

      const slot = slots[i];
      if (slot && slot.id === itemId && slot.count < maxStack) {
        const espacio = maxStack - slot.count;
        const add = Math.min(espacio, remaining);
        const prev = slot.count;
        slot.count += add;
        remaining -= add;
        mergedAny = true;

        const slotReal = type === 'quick' ? this.STATE.quickSlots[i] : this.STATE.slots[i];
        console.error(`[SIMULATE] Merge en ${type} slot ${i}: prev=${prev}, add=${add}, final=${slot.count}, remaining=${remaining}`);

        operations.push({
          type: 'merge',
          location: { type, index: i },
          amountAdded: add,
          previousCount: prev,
          finalCount: slot.count,
          usedStackLimit: slot.count === maxStack,
          idx: slotReal ? slotReal.idx : null,
          manualid: slotReal ? slotReal.idm : null
        });
      }
    }
    return mergedAny;
  };

  // --------------------------------------------------------
  // Función interna: crear nuevos stacks en slots vacíos
  // --------------------------------------------------------
  const createNewStacks = (slots, type) => {
    let createdAny = false;
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (isOccupied(type, i)) continue;
      if (!slots[i]) {
        const add = Math.min(maxStack, remaining);
        slots[i] = { id: itemId, count: add, idx: i, idm: itemId };
        remaining -= add;
        createdAny = true;

        console.error(`[SIMULATE] Nuevo stack en ${type} slot ${i}: add=${add}, remaining=${remaining}`);

        operations.push({
          type: 'new',
          location: { type, index: i },
          amountAdded: add,
          finalCount: add
        });
      }
    }
    return createdAny;
  };

  // --------------------------------------------------------
  // Bucle principal: iterar hasta que no quede remaining
  // --------------------------------------------------------
  let iteration = 0;
  while (remaining > 0) {
    iteration++;
    console.error(`[SIMULATE] Iteración ${iteration}, remaining=${remaining}`);

    // 1️⃣ Completar stacks parciales
    const mergedQuick = completePartialStacks(simQuick, 'quick');
    const mergedInv = completePartialStacks(simInv, 'inv');

    // 2️⃣ Crear stacks nuevos si queda remaining
    const newQuick = createNewStacks(simQuick, 'quick');
    const newInv = createNewStacks(simInv, 'inv');

    // 3️⃣ Si no hubo merge ni nuevos stacks → no hay más espacio
    if (!mergedQuick && !mergedInv && !newQuick && !newInv) {
      console.error(`[SIMULATE] No hay más espacio para agregar los ${remaining} restantes`);
      break;
    }
  }

  const success = remaining === 0;

  // --------------------------------------------------------
  // Resumen
  // --------------------------------------------------------
  let totalMerged = 0, totalNew = 0;
  const newStacksCount = operations.filter(op => op.type === 'new').length;
  operations.forEach(op => {
    if (op.type === 'merge') totalMerged += op.amountAdded;
    else totalNew += op.amountAdded;
  });

  const slotsUsed = { quick: 0, inv: 0 };
  operations.filter(op => op.type === 'new').forEach(op => {
    slotsUsed[op.location.type]++;
  });

  console.error(`[SIMULATE] Resultado final: success=${success}, remaining=${remaining}, totalMerged=${totalMerged}, totalNewStacks=${totalNew}, newStacksCount=${newStacksCount}`);

  return {
    success,
    remaining,
    operations,
    summary: { totalMerged, totalNewStacks: totalNew, newStacksCount, slotsUsed }
  };
}





// ---------------------------
// VERIFICAR ROMPIMIENTO DE HERRAMIENTA
// ---------------------------
/**
 * Descuenta 1 uso a la herramienta con el invoiceId dado.
 * Si los usos llegan a 0: notifica, console.log, y ejecuta ejecutarDivisionRemove para quitar 1 del stack.
 * No toca el cursor ni bloquea nada.
 *
 * @param {Object} itemRef  — objeto de slot o selectedItem con .id e .idx
 */
async verificarRompimiento(itemRef) {
  try {
    if (!itemRef || !itemRef.idx) return;
    const toolDef = this.ItemDefinitions[itemRef.id];
    if (!toolDef || toolDef.usos == null) return; // sin usos definidos → no es herramienta

    // 1) Consultar usos actuales en backend
    const usosRes = await this.fetchWithTokenRetry(
      `${this.serverBase}/api/tool/uses/${itemRef.idx}`, { method: 'GET' }
    );
    const usosData = await usosRes.json();
    const usosActuales = typeof usosData.usos === 'number' ? usosData.usos : toolDef.usos;
    const usosNuevos = usosActuales - 1;

    // 2) Registrar el descuento en backend
    await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/decrease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken || '' },
      body: JSON.stringify({ invoiceId: itemRef.idx, maxUsos: toolDef.usos })
    });

    if (usosNuevos <= 0) {
      // ── Buscar casilla del item (solo para el log) ──
      let slotRoto = null;
      let slotTipo = null;
      for (let i = 0; i < this.STATE.slots.length; i++) {
        if (this.STATE.slots[i]?.idx === itemRef.idx) { slotRoto = i; slotTipo = 'inventario'; break; }
      }
      if (slotRoto === null) {
        for (let i = 0; i < this.STATE.quickSlots.length; i++) {
          if (this.STATE.quickSlots[i]?.idx === itemRef.idx) { slotRoto = i; slotTipo = 'quickslot'; break; }
        }
      }

      console.log(`💀 Objeto "${itemRef.id}" en casilla ${slotTipo}[${slotRoto}] se rompió (idx=${itemRef.idx})`);
      this.notifications.show(`Tu ${itemRef.id} se rompió!`, 'error');

      // ── Quitar 1 del stack en blockchain + local ──
      await this.ejecutarDivisionRemove.call(this, 'slots', itemRef.id, toolDef.maxStack || 5, 1);

      // ── Borrar el registro de usos para que las unidades restantes del stack empiecen frescos ──
      try {
        await this.fetchWithTokenRetry(`${this.serverBase}/api/tool/uses/${itemRef.idx}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': this.csrfToken || '' }
        });
      } catch (delErr) {
        console.warn('⚠️ No se pudo borrar registro de usos tras rompimiento:', delErr);
      }

    } else {
      // Actualizar usos restantes en el estado local (para la barra visual)
      for (const s of [...this.STATE.slots, ...this.STATE.quickSlots]) {
        if (s?.idx === itemRef.idx) { s.usosRestantes = usosNuevos; break; }
      }
      console.log(`🪓 ${itemRef.id} usó 1 uso. Restantes: ${usosNuevos}/${toolDef.usos}`);
    }

    this.renderAllSlots();
  } catch (err) {
    console.warn('⚠️ Error en verificarRompimiento:', err);
  }
}

// ---------------------------
// EJECUTAR DIVISIÓN (ELIMINAR) - CORREGIDA
// ---------------------------
async ejecutarDivisionRemove(ruta_tabla, producto, limitacion, cantidad) {
    if (limitacion <= 0 || cantidad <= 0) return;

    if (this._transactionInProgress) {
        console.warn('Ya hay una transacción en progreso — cancelar nueva petición.');
        return;
    }

    // ── Si hay un item en el cursor, devolverlo a su casilla de origen antes de proceder ──
    if (this.STATE?.selectedItem?.isGhost) {
        const cursorItem = this.STATE.selectedItem;
        const slotArr  = cursorItem.originType === 'inv' ? this.STATE.slots      : this.STATE.quickSlots;
        const ghostArr = cursorItem.originType === 'inv' ? this.STATE.ghostSlots.inv : this.STATE.ghostSlots.quick;

        slotArr[cursorItem.originIndex] = {
            id:    cursorItem.id,
            count: cursorItem.count,
            idx:   cursorItem.idx  ?? null,
            idm:   cursorItem.idm  ?? null
        };
        ghostArr[cursorItem.originIndex] = null;
        this.STATE.selectedItem = null;
        this.stopDrag && this.stopDrag();
        this.renderSlot(cursorItem.originIndex);
        console.log(`↩️ Item "${cursorItem.id}" devuelto a ${cursorItem.originType}[${cursorItem.originIndex}] antes de eliminar`);
    }

    await this.RemoveItemBlockchains(ruta_tabla, producto, cantidad);
}

// ---------------------------------
// SIMULADOR: eliminar items (mirror) - SIN CAMBIOS
// ---------------------------------
/**
 * Simula la eliminación de 'quantity' unidades del ítem 'itemId' del inventario,
 * sin modificar el estado real. Retorna un reporte con operaciones 'remove'.
 *
 * Cada operación incluye:
 * - type: 'remove'
 * - location: { type: 'inv'|'quick', index }
 * - amountRemoved
 * - previousCount
 * - finalCount
 * - idx (id de la factura / invoice id)  <-- importante para llamadas al contrato
 * - manualid (manualId)                  <-- para mostrar / debug
 */
simulateRemoveItem(itemId, quantity = 1) {
  const def = this.ItemDefinitions?.[itemId];
  if (!def) {
    console.warn(`Item "${itemId}" no definido en ItemDefinitions`);
    return {
      success: false,
      remaining: quantity,
      operations: [],
      summary: { totalRemoved: 0, stacksAffected: 0, slotsFreed: 0 }
    };
  }

  let remaining = quantity;

  // Clonar slots para simular sin modificar el original
  const simQuick = this.STATE.quickSlots.map(s => s ? { ...s } : null);
  const simInv = this.STATE.slots.map(s => s ? { ...s } : null);

  // Slots ocupados por el ítem seleccionado (fantasma)
  const occupied = new Set();
  if (this.STATE.selectedItem) {
    const sel = this.STATE.selectedItem;
    if (sel.originType === 'inv') occupied.add(`inv-${sel.originIndex}`);
    else if (sel.originType === 'quick') occupied.add(`quick-${sel.originIndex}`);
  }
  const isOccupied = (type, idx) => occupied.has(`${type}-${idx}`);

  const operations = [];

  // 1) Quitar de quickSlots (cofre/inmediato) primero - preferencia puede cambiar
  for (let i = 0; i < simQuick.length && remaining > 0; i++) {
    if (isOccupied('quick', i)) continue;
    const slot = simQuick[i];
    if (slot && slot.id === itemId && slot.count > 0) {
      const remove = Math.min(slot.count, remaining);
      const prev = slot.count;
      slot.count -= remove;
      remaining -= remove;

      const slotReal = this.STATE.quickSlots[i];

      operations.push({
        type: 'remove',
        location: { type: 'quick', index: i },
        amountRemoved: remove,
        previousCount: prev,
        finalCount: slot.count,
        idx: slotReal ? slotReal.idx : null,
        manualid: slotReal ? slotReal.idm : null
      });
    }
  }

  // 2) Quitar de inventario normal
  for (let i = 0; i < simInv.length && remaining > 0; i++) {
    if (isOccupied('inv', i)) continue;
    const slot = simInv[i];
    if (slot && slot.id === itemId && slot.count > 0) {
      const remove = Math.min(slot.count, remaining);
      const prev = slot.count;
      slot.count -= remove;
      remaining -= remove;

      const slotReal = this.STATE.slots[i];

      operations.push({
        type: 'remove',
        location: { type: 'inv', index: i },
        amountRemoved: remove,
        previousCount: prev,
        finalCount: slot.count,
        idx: slotReal ? slotReal.idx : null,
        manualid: slotReal ? slotReal.idm : null
      });
    }
  }

  const success = remaining === 0;

  // Resumen
  let totalRemoved = 0;
  let stacksAffected = operations.length;
  let slotsFreed = operations.filter(op => op.finalCount === 0).length;
  operations.forEach(op => totalRemoved += op.amountRemoved);

  return {
    success,
    remaining,
    operations,
    summary: {
      totalRemoved,
      stacksAffected,
      slotsFreed
    }
  };
}

// ---------------------------------
// RemoveItemBlockchains - SIN CAMBIOS (se incluye completo)
// ---------------------------------
async RemoveItemBlockchains(ruta_tabla, producto, cantidad) {
  // small helper sleep to avoid race conditions
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Funciones auxiliares para bloquear slots
  const lockSlotLocal = (type, index) => {
    try {
      const selector = type === 'inv'
        ? `.inv-slot[data-slot-index="${index}"]`
        : `.quick-slot[data-slot-index="${index}"]`;
      const slot = document.querySelector(selector);
      if (slot) slot.classList.add('slot-locked');
    } catch (e) {
      console.warn('lockSlotLocal fallo:', e);
    }
  };

  const unlockAllSlotsLocal = () => {
    try {
      document.querySelectorAll('.inv-slot, .quick-slot').forEach(slot => {
        slot.classList.remove('slot-locked');
      });
    } catch (e) {
      console.warn('unlockAllSlotsLocal fallo:', e);
    }
  };

  // Helper para eliminar transacciones de items asociadas a una factura
  const removeAssociatedAddTransactions = (idx, manualid) => {
    if (!window.hub || !window.hub.transactions) return;
    const items = window.hub.transactions.items || [];
    items.forEach(tx => {
      if (tx.hiddenData && tx.hiddenData.idx === idx && 
          (tx.hiddenData.manualid === manualid || (!manualid && !tx.hiddenData.manualid))) {
        window.hub.removeTransaction(tx.hash);
      }
    });
  };

  try {
    // Inicializar relayClient si hace falta
    if (!this.relayClient) {
      this.relayClient = new PhaserRelay({
        apiBase: 'http://127.0.0.1:3001',
        debug: true,
        forceLocalhostTo127: true
      });
      await this.relayClient.initialize();
    }

    // Debug backend
    const debugInfo = await this.relayClient.debugBackendConnection();
    console.log('🔍 Debug info:', debugInfo);

    // Auth
    const auth = await this.relayClient.checkAuth();
    if (!auth || !auth.success) {
      this.relayClient.showError('❌ Debes estar autenticado. Visita http://127.0.0.1:3001/login', 5000);
      return false;
    }
    console.log('🔑 Usuario autenticado:', auth.address);

    // Establecer usuario en el hub
    if (window.hub && this.playerName) {
      window.hub.setUser(this.playerName, auth.address);
    }

    // Encontrar contrato
    let contract;
    try {
      contract = await this.relayClient.findContract('ItemContract');
    } catch (error) {
      this.relayClient.showError('❌ Error conectando al backend: ' + (error.message || error), 5000);
      return false;
    }
    if (!contract) {
      this.relayClient.showError('❌ Contrato ItemContract no encontrado', 3000);
      return false;
    }
    console.log('📄 Contrato encontrado:', contract.address);

    // --- SIMULACIÓN: qué removemos ---
    const reporte = this.simulateRemoveItem(producto, cantidad);
    console.log('Reporte (simulateRemoveItem):', reporte);

    if (!reporte || !Array.isArray(reporte.operations) || reporte.operations.length === 0) {
      if (reporte && reporte.remaining > 0) {
        this.relayClient.showWarning(`⚠️ No hay suficiente cantidad para eliminar. Falta: ${reporte.remaining}`, 4000);
      } else {
        this.relayClient.showInfo('ℹ️ No hay operaciones a ejecutar (nada que remover).', 3000);
      }
      return false;
    }

    // ===== BLOQUEAR SLOTS IMPLICADOS =====
    reporte.operations.forEach(op => {
      try {
        if (op && op.location && op.location.type && op.location.index !== undefined && op.location.index !== null) {
          lockSlotLocal(op.location.type, op.location.index);
        }
      } catch (e) {
        console.warn('Error lockSlotLocal por operación:', op, e);
      }
    });

    let anyProcessed = false;

    // Procesar cada operación de forma secuencial
    for (const originalOp of reporte.operations) {
      // Clone safe copy of op to avoid accidental mutation
      const op = { ...originalOp };
      // Normalize numeric idx if it's a string
      if (op.idx !== undefined && op.idx !== null && typeof op.idx === 'string' && op.idx.trim() !== '') {
        const n = Number(op.idx);
        if (!Number.isNaN(n)) op.idx = n;
      }

      // If no idx but manualid is present, try to resolve it via contract view
      if ((op.idx === undefined || op.idx === null) && op.manualid) {
        try {
          const lookup = await this.relayClient.accion(contract.address, {
            funcion: 'getInvoiceByManualId',
            _manualId: op.manualid,
            accion: 'obtener'
          });
          if (lookup) {
            if (typeof lookup === 'object' && lookup.id !== undefined) {
              op.idx = Number(lookup.id);
            } else if (Array.isArray(lookup) && lookup.length > 0) {
              op.idx = Number(lookup[0]);
            } else {
              const keys = Object.keys(lookup || {});
              for (const k of keys) {
                if (k.toLowerCase().includes('id')) {
                  const candidate = Number(lookup[k]);
                  if (!Number.isNaN(candidate)) {
                    op.idx = candidate;
                    break;
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn(`⚠️ No se pudo resolver manualId ${op.manualid} a idx:`, err);
        }
      }

      if (!op.idx) {
        console.warn('Operación sin idx (invoice id) y no resolvible por manualid - ignorando operación:', op);
        continue;
      }

      // normalize amountRemoved
      const amount = Number(op.amountRemoved || op.amountRemoved === 0 ? op.amountRemoved : op.remove || 0);
      if (!amount || amount <= 0) {
        console.warn('Operación con amountRemoved inválido - ignorando:', op);
        continue;
      }

      anyProcessed = true;

      // Datos comunes para hiddenData
      const hiddenDataBase = {
        producto: producto,
        cantidad: amount,
        idx: op.idx,
        manualid: op.manualid || '',
        ruta_tabla: ruta_tabla
      };

      // Si finalCount === 0 => eliminar factura (deleteInvoice)
      if (op.finalCount === 0) {
        console.log(`🔻 Eliminando invoice id=${op.idx} manualId=${op.manualid} cantidad=${amount}`);

        const hiddenData = { ...hiddenDataBase, type: 'delete' };
        const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Añadir transacción pendiente en categoría 'interaction' con nombre 'Remove Items'
        if (window.hub) {
          window.hub.addTransaction('interaction', {
            name: 'Remove Items',
            quantity: amount,
            hash: tempHash,
            status: 'pending',
            hiddenData: hiddenData
          });
        }

        let sendResult;
        try {
          sendResult = await this.relayClient.accion(contract.address, {
            funcion: 'deleteInvoice',
            _id: op.idx,
            accion: 'enviar'
          });
        } catch (err) {
          console.error('❌ Excepción en deleteInvoice (accion):', err);
          this.relayClient.showError(`❌ Error borrando invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        if (!sendResult || !sendResult.success) {
          console.error('❌ Error en deleteInvoice:', sendResult);
          this.relayClient.showError(`❌ Error borrando invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        this.relayClient.showSuccess('Transacción deleteInvoice enviada, esperando confirmación...');

        try {
          const final = await this.relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
          if (final && final.success) {
            this.relayClient.showSuccess(`✅ Delete confirmada! TX: ${final.txHash?.substring(0,10) || '...'} `);

            // Actualizar hub: eliminar pendiente y añadir confirmada
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: final.txHash,
                status: 'confirmed',
                hiddenData: hiddenData
              });
            }

            // Eliminar las transacciones de items asociadas a esta factura
            removeAssociatedAddTransactions(op.idx, op.manualid);

            // Actualiza estado local con la eliminación
            if (typeof this.EliitemWithCheck === 'function') {
              try {
                const ok = await this.EliitemWithCheck(producto, amount, op.idx, op.manualid);
                if (!ok) {
                  console.warn('EliitemWithCheck no pudo completar la eliminación local para', op);
                }
              } catch (ex) {
                console.error('Error ejecutando EliitemWithCheck tras delete:', ex);
              }
            } else {
              console.warn('EliitemWithCheck no definida, por favor implementa el handler local de eliminación.');
            }
          } else {
            this.relayClient.showError(`❌ Delete falló: ${final?.error || 'unknown'}`);
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                status: 'reverted',
                hiddenData: hiddenData
              });
            }
          }
        } catch (err) {
          this.relayClient.showError(`⏰ Error esperando confirmación deleteInvoice: ${err.message || err}`);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
        }

      } else {
        // finalCount > 0 => decrease parcial
        console.log(`🔻 Decreasing invoice id=${op.idx} manualId=${op.manualid} by ${amount}`);

        const hiddenData = { ...hiddenDataBase, type: 'decrease' };
        const tempHash = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        if (window.hub) {
          window.hub.addTransaction('interaction', {
            name: 'Remove Items',
            quantity: amount,
            hash: tempHash,
            status: 'pending',
            hiddenData: hiddenData
          });
        }

        let sendResult;
        try {
          sendResult = await this.relayClient.accion(contract.address, {
            funcion: 'decreaseInvoiceQuantity',
            _id: op.idx,
            _decreaseAmount: amount,
            accion: 'enviar'
          });
        } catch (err) {
          console.error('❌ Excepción en decreaseInvoiceQuantity (accion):', err);
          this.relayClient.showError(`❌ Error disminuyendo invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        if (!sendResult || !sendResult.success) {
          console.error('❌ Error en decreaseInvoiceQuantity:', sendResult);
          this.relayClient.showError(`❌ Error disminuyendo invoice ${op.idx}`, 4000);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
          await sleep(500);
          continue;
        }

        this.relayClient.showSuccess('Transacción decreaseInvoiceQuantity enviada, esperando confirmación...');

        try {
          const final = await this.relayClient.waitForTransaction(sendResult.transactionId, { interval: 3000 });
          if (final && final.success) {
            this.relayClient.showSuccess(`✅ Decrease confirmada! TX: ${final.txHash?.substring(0,10) || '...'} `);

            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: final.txHash,
                status: 'confirmed',
                hiddenData: hiddenData
              });
            }

            // Eliminar las transacciones de items asociadas a esta factura
            removeAssociatedAddTransactions(op.idx, op.manualid);

            // Actualiza estado local con la disminución
            if (typeof this.EliitemWithCheck === 'function') {
              try {
                const ok = await this.EliitemWithCheck(producto, amount, op.idx, op.manualid);
                if (!ok) {
                  console.warn('EliitemWithCheck no pudo completar la actualización local para', op);
                }
              } catch (ex) {
                console.error('Error ejecutando EliitemWithCheck tras decrease:', ex);
              }
            } else {
              console.warn('EliitemWithCheck no definida, por favor implementa el handler local de eliminación.');
            }
          } else {
            this.relayClient.showError(`❌ Decrease falló: ${final?.error || 'unknown'}`);
            if (window.hub) {
              window.hub.removeTransaction(tempHash);
              window.hub.addTransaction('interaction', {
                name: 'Remove Items',
                quantity: amount,
                hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                status: 'reverted',
                hiddenData: hiddenData
              });
            }
          }
        } catch (err) {
          this.relayClient.showError(`⏰ Error esperando confirmación decreaseInvoiceQuantity: ${err.message || err}`);
          if (window.hub) {
            window.hub.removeTransaction(tempHash);
            window.hub.addTransaction('interaction', {
              name: 'Remove Items',
              quantity: amount,
              hash: 'reverted-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              status: 'reverted',
              hiddenData: hiddenData
            });
          }
        }
      }

      // short delay to reduce chance of race conditions / nonce issues
      await sleep(400);
    } // end for

    // Si quedó restante en el reporte, notificar
    if (!reporte.success && reporte.remaining > 0) {
      this.relayClient.showWarning(`⚠️ No se pudo remover toda la cantidad. Falta: ${reporte.remaining}`, 5000);
    }

    return anyProcessed;

  } catch (error) {
    console.error('❌ Error crítico en RemoveItemBlockchains:', error);
    if (this.relayClient) {
      this.relayClient.showError(`❌ Error crítico: ${error.message || error}`, 5000);
    }
    return false;
  } finally {
    // Liberar bloqueo visual de todos los slots
    unlockAllSlotsLocal();
  }
}

// ---------------------------------
// EliitemWithCheck - SIN CAMBIOS
// ---------------------------------
/**
 * EliitemWithCheck
 * Elimina una cantidad del item identificado por invoiceId/manualId (si están),
 * actualiza slots (quick/inv/chest), limpia idx/idm y persiste estado.
 *
 * @param {string} itemId
 * @param {number} amountToRemove
 * @param {number|null} invoiceIdx
 * @param {string|null} manualId
 * @returns {Promise<boolean>}
 */
async EliitemWithCheck(itemId, amountToRemove = 1, invoiceIdx = null, manualId = null) {
  if (!itemId || !amountToRemove || amountToRemove <= 0) return false;

  let remaining = Number(amountToRemove);

  // Helper: procesar array de slots (mutación IN-PLACE)
  const processSlotsArray = (slotsArray, slotType) => {
    for (let i = 0; i < slotsArray.length && remaining > 0; i++) {
      const slot = slotsArray[i];
      if (!slot) continue;

      // Priorizar coincidencia por invoiceIdx/manualId si fueron provistos
      const matchesIdx = invoiceIdx !== null && (slot.idx === invoiceIdx || slot.idx === Number(invoiceIdx));
      const matchesManual = manualId !== null && (slot.idm === manualId || slot.idm === String(manualId));

      // Si tenemos idx/manual y NO coincide, saltamos
      if ((invoiceIdx !== null || manualId !== null) && !(matchesIdx || matchesManual)) {
        continue;
      }

      // Si no hay idx/manual dado, aceptamos por itemId
      if ((invoiceIdx === null && manualId === null) && slot.id !== itemId) {
        continue;
      }

      // Encontrado un slot válido para reducir
      const slotCount = Number(slot.count || slot.quantity || 0);
      if (slotCount <= 0) {
        // slot vacío por seguridad
        slotsArray[i] = null;
        this.renderSlot(i);
        continue;
      }

      if (slotCount > remaining) {
        // Reducir parcialmente
        const newCount = slotCount - remaining;
        // Mantener formato consistente (algunos slots usan 'count' o 'quantity')
        if ('count' in slot) slot.count = newCount;
        else slot.quantity = newCount;

        // Si el slot tenía idx/idm y ahora sigue >0, mantenemos idx/idm
        remaining = 0;
        this.renderSlot(i);
      } else {
        // Consumir todo el slot
        remaining -= slotCount;
        // limpiar completamente el slot y sus metadatos
        slotsArray[i] = null;
        this.renderSlot(i);
      }
    }
  };

  // 1) Prioridad: quickSlots (hotbar / cofre rápido)
  if (this.STATE && Array.isArray(this.STATE.quickSlots)) {
    processSlotsArray(this.STATE.quickSlots, 'quick');
  }

  // 2) Inventario principal
  if (remaining > 0 && this.STATE && Array.isArray(this.STATE.slots)) {
    processSlotsArray(this.STATE.slots, 'inv');
  }

  // 3) Chest / cofre extra (si existe)
  if (remaining > 0 && this.STATE && Array.isArray(this.STATE.chestSlots)) {
    processSlotsArray(this.STATE.chestSlots, 'chest');
  }

  // 4) Como respaldo, si aún queda y existen otros arrays (casillas, casillasExtra)
  if (remaining > 0 && Array.isArray(this.casillas)) {
    processSlotsArray(this.casillas, 'casillas');
  }
  if (remaining > 0 && Array.isArray(this.casillasExtra)) {
    processSlotsArray(this.casillasExtra, 'casillasExtra');
  }

  // Persistir / UI
  try {
    this.queuedAction && this.queuedAction({ type: 'forSpam2' });
    this.rebuildPlayerInventoryFromState && this.rebuildPlayerInventoryFromState();

    // Guardar en backend si tienes función savegg (opcional pero recomendado)
    if (typeof this.savegg === 'function') {
      try {
        await this.savegg();
      } catch (e) {
        console.warn('⚠️ savegg falló (no crítico):', e);
      }
    }
  } catch (e) {
    console.error('⚠️ Error actualizando UI/state tras EliitemWithCheck:', e);
  }

  if (remaining > 0) {
    console.warn(`⚠️ No se pudo remover toda la cantidad. Falta: ${remaining}`);
    return false;
  }

  return true;
}




/**
 * Agrega 'quantity' unidades del ítem 'itemId' al inventario, priorizando el cofre.
 * Primero completa stacks parciales; luego abre nuevos stacks en slots vacíos.
 *
 * @param {string} itemId           - Clave del ítem en ItemDefinitions.
 * @param {number} quantity        - Cantidad a agregar (por defecto 1).
 * @param {number|null} [customIdx] - Índice fijo para TODOS los stacks creados (opcional).
 * @param {string|null} [customIdm] - ID manual para TODOS los stacks creados (opcional).
 * @returns {boolean}              - true si se agregó todo, false si faltó espacio.
 */
addItemWithCheck(itemId, quantity = 1, customIdx = null, customIdm = null) {
  const defs = this.ItemDefinitions[itemId];
  if (!defs) {
    console.warn(`Item "${itemId}" no definido en ItemDefinitions`);
    return false;
  }

  const maxStack = defs.maxStack;
  let remaining = quantity;

  // Slots ocupados por fantasmas
  const occupiedSlots = new Set();
  if (this.STATE.selectedItem) {
    if (this.STATE.selectedItem.originType === 'inv') {
      occupiedSlots.add(`inv-${this.STATE.selectedItem.originIndex}`);
    } else if (this.STATE.selectedItem.originType === 'quick') {
      occupiedSlots.add(`quick-${this.STATE.selectedItem.originIndex}`);
    }
  }
  const isOccupied = (type, index) => occupiedSlots.has(`${type}-${index}`);

  // 1) COFRE – completar stacks parciales (sin modificar idx/idm)
  for (let i = 0; i < this.STATE.quickSlots.length && remaining > 0; i++) {
    if (isOccupied('quick', i)) continue;
    const slot = this.STATE.quickSlots[i];
    if (slot && slot.id === itemId && slot.count < maxStack) {
      const espacio = maxStack - slot.count;
      const suma = Math.min(espacio, remaining);
      slot.count += suma;
      remaining -= suma;
      this.renderSlot(i);
    }
  }

  // 2) INVENTARIO – completar stacks parciales
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
      if (isOccupied('inv', i)) continue;
      const slot = this.STATE.slots[i];
      if (slot && slot.id === itemId && slot.count < maxStack) {
        const espacio = maxStack - slot.count;
        const suma = Math.min(espacio, remaining);
        slot.count += suma;
        remaining -= suma;
        this.renderSlot(i);
      }
    }
  }

  // 3) COFRE VACÍO – crear nuevos stacks
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.quickSlots.length && remaining > 0; i++) {
      if (isOccupied('quick', i)) continue;
      if (this.STATE.quickSlots[i] === null) {
        const paraEste = Math.min(maxStack, remaining);
        
        const idx = (customIdx !== null) ? customIdx : i;
        const idm = (customIdm !== null) ? customIdm : itemId;

        this.STATE.quickSlots[i] = {
          id: itemId,
          count: paraEste,
          invIndex: null,
          idx: idx,
          idm: idm
        };
        remaining -= paraEste;
        this.renderSlot(i);
      }
    }
  }

  // 4) INVENTARIO VACÍO – crear nuevos stacks
  if (remaining > 0) {
    for (let i = 0; i < this.STATE.slots.length && remaining > 0; i++) {
      if (isOccupied('inv', i)) continue;
      if (this.STATE.slots[i] === null) {
        const paraEste = Math.min(maxStack, remaining);
        
        const idx = (customIdx !== null) ? customIdx : i;
        const idm = (customIdm !== null) ? customIdm : itemId;

        this.STATE.slots[i] = {
          id: itemId,
          count: paraEste,
          idx: idx,
          idm: idm
        };
        remaining -= paraEste;
        this.renderSlot(i);
      }
    }
  }

  if (remaining > 0) {
    console.warn(`No hubo espacio para ${remaining} unidades de "${itemId}".`);
    return false;
  }

  this.queuedAction({ type: 'forSpam2' });
  this.rebuildPlayerInventoryFromState();
  return true;
}



/**
 * Obtiene los índices de todos los slots ocupados (con fantasmas)
 * @returns {Set<number>} - Conjunto de índices de slots ocupados
 */
getOccupiedSlots() {
  const occupiedSlots = new Set();
  
  // Slots de inventario con fantasmas
  this.STATE.ghostSlots.inv.forEach((ghost, index) => {
    if (ghost) occupiedSlots.add(index);
  });
  
  // Slots de quick-slot con fantasmas
  this.STATE.ghostSlots.quick.forEach((ghost, index) => {
    if (ghost) occupiedSlots.add(index);
  });
  
  // También considerar slots que tienen items seleccionados actualmente
  if (this.STATE.selectedItem) {
    if (this.STATE.selectedItem.originType === 'inv' && 
        this.STATE.selectedItem.originIndex !== undefined) {
      occupiedSlots.add(this.STATE.selectedItem.originIndex);
    }
    if (this.STATE.selectedItem.originType === 'quick' && 
        this.STATE.selectedItem.originIndex !== undefined) {
      occupiedSlots.add(this.STATE.selectedItem.originIndex);
    }
  }
  
  return occupiedSlots;
}


renderSlot(index) {
  // Helper: añade barra de durabilidad si el item es una herramienta con usos definidos
  const _addUsosIndicator = (container, itemObj) => {
    const def = this.ItemDefinitions[itemObj?.id];
    if (!def || def.usos == null) return;
    const maxU = def.usos;
    const restantes = typeof itemObj.usosRestantes === 'number' ? itemObj.usosRestantes : maxU;
    const rota = restantes <= 0;
    const pct  = rota ? 0 : Math.round((restantes / maxU) * 100);
    // barra de durabilidad
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:2px; left:2px; right:2px; height:3px;
      background:#333; border-radius:2px; overflow:hidden; pointer-events:none;
    `;
    const fill = document.createElement('div');
    fill.style.cssText = `
      height:100%; width:${pct}%;
      background:${pct > 50 ? '#4caf50' : pct > 20 ? '#ff9800' : '#f44336'};
      border-radius:2px; transition:width .2s;
    `;
    bar.appendChild(fill);
    container.style.position = 'relative';
    container.appendChild(bar);
  };

  // Render inventario
  const invDiv = document.querySelector(`.inv-slot[data-slot-index="${index}"]`);
  if (invDiv) {
    invDiv.innerHTML = "";
    if (this.STATE.ghostSlots.inv[index]) {
      invDiv.classList.add("empty");
      invDiv.classList.remove("highlight");
    } else {
      const itemObj = this.STATE.slots[index];
      if (itemObj) {
        const img = document.createElement("img");
        img.src = this.ItemDefinitions[itemObj.id].src;
        img.alt = itemObj.id;
        invDiv.appendChild(img);
        if (itemObj.count > 1) {
          const span = document.createElement("span");
          span.classList.add("item-count");
          span.textContent = "x" + itemObj.count;
          invDiv.appendChild(span);
        }
        _addUsosIndicator(invDiv, itemObj);
        invDiv.classList.remove("empty");
      } else {
        invDiv.classList.add("empty");
      }
      invDiv.classList.remove("highlight");
    }
  }

  // Render quick-slot
  const quickDiv = document.querySelector(`.quick-slot[data-slot-index="${index}"]`);
  if (quickDiv) {
    quickDiv.innerHTML = "";
    if (this.STATE.ghostSlots.quick[index]) {
      quickDiv.classList.add("empty");
      quickDiv.classList.remove("highlight");
    } else {
      const itemObj = this.STATE.quickSlots[index];
      if (itemObj) {
        const img = document.createElement("img");
        img.src = this.ItemDefinitions[itemObj.id].src;
        img.alt = itemObj.id;
        quickDiv.appendChild(img);
        if (itemObj.count > 1) {
          const span = document.createElement("span");
          span.classList.add("item-count");
          span.textContent = "x" + itemObj.count;
          quickDiv.appendChild(span);
        }
        _addUsosIndicator(quickDiv, itemObj);
        quickDiv.classList.remove("empty");
      } else {
        quickDiv.classList.add("empty");
      }
      quickDiv.classList.remove("highlight");
    }
  }
}








    
    // Procesar venta usando sellPrice
    async processSale(item, quantity) {
        // La tienda no altera el inventario: solo registra la interacción y aplica el cálculo económico.
        const currency = this.getItemCurrency(item);
        const grossPrice = item.sellPrice * quantity;
        const commission = Math.max(0, Math.ceil(grossPrice * ((Number(item.comision) || 0) / 100)));
        const finalPrice = Math.max(0, grossPrice - commission);
        const currentBalance = this.getBalanceByCurrency(currency);
        
        this.setBalanceByCurrency(currency, currentBalance + finalPrice);
        
        const transactionInfo = {
            type: 'venta',
            itemId: item.id,
            itemName: item.name,
            quantity,
            unitPrice: item.sellPrice,
            totalGain: finalPrice,
            grossPrice,
            fee: commission,
            currency,
            remainingGold: this.playerMoneda,
            remainingSilver: this.playerMonedaPlata
        };
        console.log('🛒 SHOP TRANSACTION (SALE)', transactionInfo);
        
        this.addToHistorial('venta', item, quantity, finalPrice);
        this.showTransactionAnimation('venta', item, quantity, finalPrice, commission);
        
        try { this.scene?.queuedAction && this.scene.queuedAction({ type: 'forSpam2' }); } catch (err) { /* ignorar */ }
        console.log(`✅ Sale recorded: ${quantity}x ${item.name} for ${finalPrice} ${this.getCurrencyLabel(currency)} (fee: ${commission} ${this.getCurrencyLabel(currency)})`);
    }
    
    // Mostrar animación de transacción
    showTransactionAnimation(type, item, quantity, total, commission = 0) {
        const notification = document.createElement('div');
        notification.className = `transaction-notification ${type}`;
        
        const icon = type === 'compra' ? '💰' : '💵';
        const actionText = type === 'compra' ? 'Purchased' : 'Sold';
        const currency = this.getItemCurrency(item);
        
        notification.innerHTML = `
            <div class="transaction-icon">${icon}</div>
            <div class="transaction-details">
                <strong>${actionText}: ${quantity}x ${item.name}</strong>
                <div class="transaction-price">
                    <img src="${this.getCurrencyIconPath(currency)}" alt="${this.getCurrencyLabel(currency)}" class="moneda-icon">
                    ${total} ${this.getCurrencyLabel(currency)}
                </div>
                ${commission > 0 ? `<div class="transaction-commission">Fee: ${commission} ${this.getCurrencyLabel(currency)}</div>` : ''}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Cambiar pestaña (PC) o abrir historial móvil
    switchTab(tabName) {
        if (this.isMobile) {
            if (tabName === 'historial') this.openMobileHistorialModal();
            return;
        }
        
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
        
        const tabElement = document.getElementById(`tab-${tabName}`);
        if (tabElement) tabElement.classList.add('active');
        
        const tabButton = document.querySelector(`.sidebar-tab[data-tab="${tabName}"]`);
        if (tabButton) tabButton.classList.add('active');
        
        if (tabName === 'historial') this.updateHistorialDisplay();
    }
    
    // Actualizar display de moneda
    updateMonedaDisplay() {
        const gold = document.getElementById('tienda-moneda');
        const silver = document.getElementById('tienda-moneda-plata');
        const goldFallback = document.getElementById('info-text-left');
        const silverFallback = document.getElementById('info-text-right');

        if (gold) gold.textContent = `${this.playerMoneda ?? 0}`;
        if (silver) silver.textContent = `${this.playerMonedaPlata ?? 0}`;
        if (goldFallback) goldFallback.textContent = `${this.playerMoneda ?? 0}`;
        if (silverFallback) silverFallback.textContent = `${this.playerMonedaPlata ?? 0}`;
    }
    
    // Actualizar display de historial (PC)
    updateHistorialDisplay() {
        const container = document.getElementById('historial-list-pc');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.historial.length === 0) {
            container.innerHTML = '<div class="historial-empty-pc">No recent transactions</div>';
            return;
        }
        
        this.historial.forEach(transaction => {
            const item = document.createElement('div');
            item.className = `historial-item-pc ${transaction.type}`;
            
            item.innerHTML = `
                <div class="historial-header-pc">
                    <span class="historial-type-pc">${transaction.type === 'compra' ? 'BUY' : 'SELL'}</span>
                    <span class="historial-time-pc">${transaction.timestamp}</span>
                </div>
                <div class="historial-content-pc">
                    <img src="${transaction.itemImage}" alt="${transaction.itemName}" class="historial-img-pc">
                    <div class="historial-details-pc">
                        <div class="historial-name-pc">${transaction.itemName}</div>
                        <div class="historial-qty-pc">Qty: ${transaction.quantity}</div>
                    </div>
                    <div class="historial-price-pc">
                        <img src="${this.getCurrencyIconPath(transaction.currency || 'gold')}" alt="${this.getCurrencyLabel(transaction.currency || 'gold')}" class="moneda-icon">
                        ${transaction.price} ${this.getCurrencyLabel(transaction.currency || 'gold')}
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
        
        if (!this.isMobile && document.getElementById('tab-historial')?.classList.contains('active')) {
            setTimeout(() => { container.scrollTop = 0; }, 10);
        }
    }
    
    // Mostrar ayuda
    showHelp() {
        document.getElementById('tienda-help-modal')?.classList.remove('hidden');
    }
    
    // Ocultar ayuda
    hideHelp() {
        document.getElementById('tienda-help-modal')?.classList.add('hidden');
    }
    
    // Mostrar notificación
    showNotification(message, type = 'info') {
        if (this.scene && typeof this.scene.showNotification === 'function') {
            this.scene.showNotification(message, type);
        } else {
            console.log(`[Tienda] ${type}: ${message}`);
            
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 15px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'error' ? '#ff4757' : type === 'success' ? '#00b09b' : '#6a11cb'};
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                z-index: 1004;
                font-family: '"PressStart2P"', monospace;
                font-size: 0.8rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: fadeInOut 3s ease;
                text-align: center;
                max-width: 90%;
            `;
            
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 2700);
        }
    }
}

// Inicializar tienda global
window.tiendaSistema = null;

// Función para inicializar la tienda
function initTienda(scene) {
    if (!window.tiendaSistema) {
        window.tiendaSistema = new TiendaSistema(scene);
        console.log('🏪 Sistema de tienda inicializado v6.3');
    }
    return window.tiendaSistema;
}

// Función para abrir la tienda desde NPC
function abrirTiendaDesdeNPC() {
    if (window.tiendaSistema) {
        window.tiendaSistema.open();
        return true;
    } else {
        console.error('❌ Tienda no inicializada. Llama a initTienda() primero.');
        return false;
    }
}

// Función para agregar CSS si no está cargado
function cargarCSSTienda() {
    if (!document.querySelector('#tienda-css')) {
        const link = document.createElement('link');
        link.id = 'tienda-css';
        link.rel = 'stylesheet';
        link.href = './tienda_hub.css';
        document.head.appendChild(link);
        console.log('🎨 CSS de tienda cargado');
    }
}