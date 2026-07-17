/* eslint-disable no-unused-vars */
/* eslint eqeqeq: ["error", "smart"] */

class ShopScene extends Phaser.Scene {
    constructor() {
        super({ key: "ShopScene" });
    }

    preload() { }

    create() {
        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        const margin = 10;

        // Definir estadísticas dummy al inicio
        this.stats = {
            compras: 0,
            ventas: 0,
            capitalizacion: 0,
            volumenCompra: 0,
            volumenVenta: 0,
            volumenGeneral: 0
        };

        // ----------------- Panel Top GUI -----------------
        this.createTopGUIPanel(margin, margin, screenWidth - 2 * margin, 100);

        // ----------------- Paneles de Colecciones, Items y Categorías -----------------
        const panelY = 120;
        const panelHeight = screenHeight - panelY - margin;
        const collectionsPanelWidth = 150;
        const categoriesPanelWidth = 150;
        const itemsPanelWidth = screenWidth - collectionsPanelWidth - categoriesPanelWidth - 3 * margin;
        const itemsPanelX = margin + collectionsPanelWidth + margin;
        const categoriesPanelX = margin + collectionsPanelWidth + margin + itemsPanelWidth + margin;

        // Dibujar fondo de cada panel: fondo negro y borde verde claro
        this.createPanelBackground(margin, panelY, collectionsPanelWidth, panelHeight);
        this.createPanelBackground(itemsPanelX, panelY, itemsPanelWidth, panelHeight);
        this.createPanelBackground(categoriesPanelX, panelY, categoriesPanelWidth, panelHeight);

        // Áreas para detectar el scroll con la rueda del ratón
        this.collectionsArea = new Phaser.Geom.Rectangle(margin, panelY, collectionsPanelWidth, panelHeight);
        this.itemsArea = new Phaser.Geom.Rectangle(itemsPanelX, panelY, itemsPanelWidth, panelHeight);
        this.categoriesArea = new Phaser.Geom.Rectangle(categoriesPanelX, panelY, categoriesPanelWidth, panelHeight);

        // Crear contenedores con máscara para cada panel
        this.createCollectionsPanel(margin, panelY, collectionsPanelWidth, panelHeight);
        this.createItemsPanel(itemsPanelX, panelY, itemsPanelWidth, panelHeight);
        this.createCategoriesPanel(categoriesPanelX, panelY, categoriesPanelWidth, panelHeight);

        // Datos dummy: generar colecciones, cada una con 15 ítems y categorías
        this.collections = this.generateDummyCollections();
        this.currentCollection = this.collections[0];
        this.currentCategory = "All";
        this.selectedItem = null;

        // Renderizar contenidos iniciales
        this.renderCollections();
        this.renderCategories();
        this.renderItems();

        // Configurar scroll con la rueda del ratón en cada panel
        this.input.on('wheel', (pointer, currentlyOver, dx, dy, dz, event) => {
            if (Phaser.Geom.Rectangle.ContainsPoint(this.collectionsArea, pointer)) {
                this.scrollContainer(this.collectionContainer, this.collectionsArea, dy);
            }
            if (Phaser.Geom.Rectangle.ContainsPoint(this.itemsArea, pointer)) {
                this.scrollContainer(this.itemsContainer, this.itemsArea, dy);
            }
            if (Phaser.Geom.Rectangle.ContainsPoint(this.categoriesArea, pointer)) {
                this.scrollContainer(this.categoriesContainer, this.categoriesArea, dy);
            }
        });

        this.updateStatsPanel();
    }

    update() { }

    /* =================== Top GUI Panel =================== */
    createTopGUIPanel(x, y, width, height) {
        let graphics = this.add.graphics();
        graphics.lineStyle(2, 0x32cd32, 1);
        graphics.fillStyle(0x000000, 1);
        graphics.fillRect(x, y, width, height);
        graphics.strokeRect(x, y, width, height);

        this.titleText = this.add.text(x + 10, y + 10, 'Marketplace Web3', { fontFamily: 'Arial', fontSize: '18px', fill: '#32cd32' });
        this.walletText = this.add.text(x + 10, y + 35, 'Wallet: No conectada', { fontFamily: 'Arial', fontSize: '14px', fill: '#32cd32' });

        const btnStyle = { fontFamily: 'Arial', fontSize: '14px', fill: '#32cd32' };
        this.connectBtn = this.add.text(x + width / 2 - 100, y + 10, 'Conectar Wallet', btnStyle)
            .setInteractive()
            .on('pointerdown', () => this.connectWallet());
        this.listItemBtn = this.add.text(x + width / 2 - 100, y + 35, 'Listar Ítem', btnStyle)
            .setInteractive()
            .on('pointerdown', () => this.listItem());
        this.buyItemBtn = this.add.text(x + width / 2 - 100, y + 60, 'Comprar Ítem', btnStyle)
            .setInteractive()
            .on('pointerdown', () => this.buySelectedItem());

        this.statsText = this.add.text(x + width - 180, y + 10, '', { fontFamily: 'Arial', fontSize: '10px', fill: '#32cd32' });
        this.updateStatsPanel();
    }

    updateStatsPanel() {
        let s = this.stats;
        let text = `Compras: ${s.compras}\nVentas: ${s.ventas}\nCapitalización: ${s.capitalizacion.toFixed(2)} ETH\nVol. Compra: ${s.volumenCompra.toFixed(2)} ETH\nVol. Venta: ${s.volumenVenta.toFixed(2)} ETH\nVol. General: ${s.volumenGeneral.toFixed(2)} ETH`;
        if (this.statsText) {
            this.statsText.setText(text);
        }
    }

    /* =================== Paneles de Fondo =================== */
    createPanelBackground(x, y, width, height) {
        let g = this.add.graphics();
        g.lineStyle(2, 0x32cd32, 1);
        g.fillStyle(0x000000, 1);
        g.fillRect(x, y, width, height);
        g.strokeRect(x, y, width, height);
    }

    /* =================== Panel de Colecciones =================== */
    createCollectionsPanel(x, y, width, height) {
        this.collectionContainer = this.add.container(x, y);
        // Crear una máscara para que el contenido no se salga del rectángulo
        let maskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        maskGraphics.fillRect(x, y, width, height);
        let mask = maskGraphics.createGeometryMask();
        this.collectionContainer.setMask(mask);
    }

    renderCollections() {
        this.collectionContainer.removeAll(true);
        const spacing = 25;
        for (let i = 0; i < this.collections.length; i++) {
            let coll = this.collections[i];
            let color = (coll === this.currentCollection) ? '#32cd32' : '#ffffff';
            let txt = this.add.text(5, i * spacing, coll.name, { fontFamily: 'Arial', fontSize: '14px', fill: color })
                .setInteractive()
                .on('pointerdown', () => {
                    this.currentCollection = coll;
                    this.currentCategory = "All";
                    this.selectedItem = null;
                    this.renderCollections();
                    this.renderCategories();
                    this.renderItems();
                });
            this.collectionContainer.add(txt);
        }
    }

    /* =================== Panel de Categorías =================== */
    createCategoriesPanel(x, y, width, height) {
        this.categoriesContainer = this.add.container(x, y);
        let maskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        maskGraphics.fillRect(x, y, width, height);
        let mask = maskGraphics.createGeometryMask();
        this.categoriesContainer.setMask(mask);
    }

    renderCategories() {
        this.categoriesContainer.removeAll(true);
        const spacing = 25;
        let cats = this.currentCollection.categories;
        for (let i = 0; i < cats.length; i++) {
            let cat = cats[i];
            let color = (cat === this.currentCategory) ? '#32cd32' : '#ffffff';
            let txt = this.add.text(5, i * spacing, cat, { fontFamily: 'Arial', fontSize: '14px', fill: color })
                .setInteractive()
                .on('pointerdown', () => {
                    this.currentCategory = cat;
                    this.selectedItem = null;
                    this.renderCategories();
                    this.renderItems();
                });
            this.categoriesContainer.add(txt);
        }
    }

    /* =================== Panel de Items =================== */
    createItemsPanel(x, y, width, height) {
        this.itemsContainer = this.add.container(x, y);
        let maskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        maskGraphics.fillRect(x, y, width, height);
        let mask = maskGraphics.createGeometryMask();
        this.itemsContainer.setMask(mask);
    }

    renderItems() {
        this.itemsContainer.removeAll(true);
        const spacing = 30;
        let items = this.currentCollection.items;
        if (this.currentCategory !== "All") {
            items = items.filter(item => item.category === this.currentCategory);
        }
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let color = (this.selectedItem && this.selectedItem.id === item.id && this.selectedItem.category === item.category) ? '#32cd32' : '#ffffff';
            let txt = this.add.text(5, i * spacing, `${item.name} - ${item.price} ETH`, { fontFamily: 'Arial', fontSize: '14px', fill: color })
                .setInteractive()
                .on('pointerdown', () => {
                    this.selectedItem = item;
                    this.renderItems();
                });
            this.itemsContainer.add(txt);
        }
    }

    /* =================== Datos Dummy =================== */
    generateDummyCollections() {
        let collections = [];
        for (let i = 1; i <= 3; i++) {
            let collection = {
                id: i,
                name: `Colección ${i}`,
                items: [],
                categories: ["All", "Tipo A", "Tipo B", "Tipo C"]
            };
            for (let j = 1; j <= 15; j++) {
                let cat = collection.categories[Phaser.Math.Between(1, 3)];
                let item = {
                    id: j,
                    name: `Item ${j} - Col ${i}`,
                    price: (0.05 * j).toFixed(2),
                    category: cat
                };
                collection.items.push(item);
            }
            collections.push(collection);
        }
        return collections;
    }

    /* =================== Acciones de Botones =================== */
    listItem() {
        let newItem = {
            id: this.currentCollection.items.length + 1,
            name: `Item ${this.currentCollection.items.length + 1} - ${this.currentCollection.name}`,
            price: (0.05 * (this.currentCollection.items.length + 1)).toFixed(2),
            category: "Tipo A"
        };
        this.currentCollection.items.push(newItem);
        this.renderItems();
        this.stats.capitalizacion += parseFloat(newItem.price);
        this.updateStatsPanel();
    }

    buySelectedItem() {
        if (!this.selectedItem) {
            console.warn("No se ha seleccionado ningún ítem");
            return;
        }
        console.log("Comprando ítem:", this.selectedItem);
        let purchaseText = this.add.text(this.itemsArea.x + 10, this.itemsArea.y + this.itemsArea.height - 20, `Comprando ${this.selectedItem.name}...`, { fontFamily: 'Arial', fontSize: '14px', fill: '#32cd32' });
        this.time.delayedCall(1500, () => {
            purchaseText.setText(`${this.selectedItem.name} comprado exitosamente!`);
            let price = parseFloat(this.selectedItem.price);
            this.stats.compras += 1;
            this.stats.ventas += 1;
            this.stats.volumenCompra += price;
            this.stats.volumenVenta += price;
            this.stats.volumenGeneral = this.stats.volumenCompra + this.stats.volumenVenta;
            this.updateStatsPanel();
        });
    }

    async connectWallet() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const account = accounts[0];
                this.walletText.setText(`Wallet: ${account.substring(0, 6)}...${account.substring(account.length - 4)}`);
                console.log("Wallet conectada:", account);
            } catch (err) {
                console.error("Error al conectar wallet:", err);
            }
        } else {
            console.error("No se detectó un proveedor Web3");
        }
    }

    /* =================== Helper: Scroll con Rueda del Ratón =================== */
    scrollContainer(container, area, deltaY) {
        let currentY = container.y;
        let contentHeight = container.getBounds().height;
        let minY = area.y - Math.max(0, contentHeight - area.height);
        let maxY = area.y;
        let newY = Phaser.Math.Clamp(currentY - deltaY, minY, maxY);
        container.y = newY;
    }
}
