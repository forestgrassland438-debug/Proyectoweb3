// lib/tileManager.js


/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * GRASSLAND FOREST v13
 * Desarrollado y Publicado por: Jean Larreal
 * CONTACTO PARA PERMISOS:
 * Jean Larreal
 * Email: [killerhackcodeup@gmail.com]
 * Sitio Web: [grasslandforest.com]
 *
 * VERSIÓN: v13.2.0-seamfix
 * GENERADO: 22/03/2026
 * ============================================================================
 */


// FIX #14: Namespace seguro para evitar colisión con otras librerías en window
const _GF = (typeof window !== 'undefined')
  ? (window.GrasslandForest = window.GrasslandForest || {})
  : {};


class TileManager {
  constructor(scene, meta, opts = {}) {
    this.scene       = scene;
    this.meta        = meta;
    this.basePath    = opts.basePath || 'recortadas';
    this.margin      = typeof opts.marginTiles === 'number' ? opts.marginTiles : 3;
    // FIX TITILEO: tiles extra de colchón antes de destruir un tile que ya
    // salió del margen de carga. Absorbe el jitter sub-pixel de cámara sin
    // destruir/recrear sprites en el borde. Ver updateVisible().
    this.unloadHysteresis = Math.max(0, typeof opts.unloadHysteresis === 'number' ? opts.unloadHysteresis : 1);
    this.maxLoads    = opts.maxConcurrentLoads || 6;
    this.maxQueue    = opts.maxQueueSize || 50;          // FIX #15: límite de cola
    this.supportsWebP = !!opts.supportsWebP;
    this.preferredLOD = opts.preferredLOD || 'hd';
    this.tileSize    = meta.tileSize || 1024;
    this.mapWidth    = meta.width  || 0;
    this.mapHeight   = meta.height || 0;
    this.depth       = opts.depth !== undefined ? opts.depth : 0;
    this.debugMode   = opts.debug || false;

    // SEAM FIX: overlap de 1px entre tiles para eliminar líneas de sub-pixel.
    // Aumentar a 2 si siguen apareciendo a zoom muy bajo.
    this.seamOverlap = opts.seamOverlap !== undefined ? opts.seamOverlap : 1;

    // FIX #10: flag de destrucción para abortar callbacks huérfanos
    this._destroyed  = false;

    // Verificar estructura de metadata
    console.log('📋 Metadata recibida:', {
      tilesCount : meta.tiles ? meta.tiles.length : 0,
      width      : meta.width,
      height     : meta.height,
      tileSize   : meta.tileSize,
      totalTiles : meta.totalTiles,
      lods       : meta.lods ? meta.lods.map(l => l.name) : []
    });

    if (meta.tiles && Array.isArray(meta.tiles)) {
      this._mode    = 'advanced';
      this.tilesRaw = meta.tiles;

      // Calcular dimensiones REALES del mapa desde los tiles
      let maxX = 0, maxY = 0;
      this.tilesRaw.forEach(tile => {
        const tileRight  = tile.x + (tile.width  || this.tileSize);
        const tileBottom = tile.y + (tile.height || this.tileSize);
        if (tileRight  > maxX) maxX = tileRight;
        if (tileBottom > maxY) maxY = tileBottom;
      });

      this.mapWidth  = Math.max(this.mapWidth,  maxX);
      this.mapHeight = Math.max(this.mapHeight, maxY);

      console.log(`📍 Dimensiones calculadas: ${maxX}x${maxY}, Usando: ${this.mapWidth}x${this.mapHeight}`);

    } else {
      throw new Error('Formato metadata no reconocido. Se esperaba array "tiles"');
    }

    // Configuración de LODs
    this.availableLODs = (meta.lods && Array.isArray(meta.lods))
      ? meta.lods.map(l => l.name)
      : ['hd'];
    this.chosenLOD = this.resolveLOD();

    // Estado interno
    this.tilesByRC  = {};
    this.tilesByXY  = {};  // API pública: usar getTileAt(x, y)
    this.loaded     = new Map();
    this.loading    = new Set();
    this.loadQueue  = [];
    this.currentLoads = 0;

    // FIX #8: usar tilesRaw.length como fuente de verdad
    this.totalTiles = this.tilesRaw.length;

    console.log(`🎯 TileManager: Mapa ${this.mapWidth}x${this.mapHeight}, LOD: ${this.chosenLOD}, Tiles: ${this.totalTiles}`);
  }

  // ─── Resolución de LOD ────────────────────────────────────────────────────

  resolveLOD() {
    if (this.availableLODs.includes(this.preferredLOD)) return this.preferredLOD;
    for (const lod of ['hd', 'md', 'low']) {
      if (this.availableLODs.includes(lod)) return lod;
    }
    return this.availableLODs[0] || 'hd';
  }

  // ─── Inicialización ───────────────────────────────────────────────────────

  init() {
    console.log('🔄 Inicializando TileManager...');

    let tilesIndexed = 0;
    let missingLODs  = 0;

    this.tilesRaw.forEach(tile => {
      const row   = tile.row;
      const col   = tile.col;
      const keyRC = `${row}_${col}`;
      const keyXY = `${tile.x}_${tile.y}`;

      if (!tile.lods || !tile.lods[this.chosenLOD]) {
        console.warn(`❌ Tile ${keyRC} no tiene LOD '${this.chosenLOD}'`,
          tile.lods ? Object.keys(tile.lods) : 'sin LODs');
        missingLODs++;
        return;
      }

      const entry = {
        id    : tile.id,
        row,
        col,
        x     : tile.x,
        y     : tile.y,
        width : tile.width,
        height: tile.height,
        lods  : tile.lods
      };

      this.tilesByRC[keyRC] = entry;
      this.tilesByXY[keyXY] = entry;
      tilesIndexed++;
    });

    const cols = Math.ceil(this.mapWidth  / this.tileSize);
    const rows = Math.ceil(this.mapHeight / this.tileSize);

    console.log(`✅ TileManager inicializado: ${tilesIndexed} tiles indexados, ` +
      `${missingLODs} tiles sin LOD, Grid: ${cols}x${rows}`);

    // FIX #11: diagnóstico solo en modo debug (evita O(n²) en producción)
    if (this.debugMode) {
      this.diagnoseCoverage();
    }
  }

  // ─── Diagnóstico de cobertura (solo debug) ────────────────────────────────

  diagnoseCoverage() {
    console.log('🔍 Diagnóstico de cobertura de tiles:');

    const cols         = Math.ceil(this.mapWidth  / this.tileSize);
    const rows         = Math.ceil(this.mapHeight / this.tileSize);
    let   missingTiles = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}_${c}`;
        if (!this.tilesByRC[key]) {
          console.warn(`   ⚠️ Tile faltante: ${key} ` +
            `(posición esperada: ${c * this.tileSize}, ${r * this.tileSize})`);
          missingTiles++;
        }
      }
    }

    if (missingTiles > 0) {
      console.warn(`❌ Se encontraron ${missingTiles} tiles faltantes`);
    } else {
      console.log('✅ Cobertura completa de tiles');
    }
  }

  // ─── Acceso a metadata ────────────────────────────────────────────────────

  getTileMeta(row, col) {
    const key  = `${row}_${col}`;
    const meta = this.tilesByRC[key];
    if (!meta && this.debugMode) {
      console.warn(`📭 No hay metadata para tile ${key}`);
    }
    return meta || null;
  }

  /** API pública: obtener tile por coordenadas del mundo */
  getTileAt(x, y) {
    const col = Math.floor(x / this.tileSize);
    const row = Math.floor(y / this.tileSize);
    return this.getTileMeta(row, col);
  }

  // ─── Resolución de URL ────────────────────────────────────────────────────

  // FIX #16 / FIX #19 (endurecido): validar que basePath y filenames no
  // contengan secuencias peligrosas. La versión original solo rechazaba
  // ".." — no bloqueaba una ruta absoluta ("/etc/passwd") ni un prefijo de
  // esquema/host ("http://evil.com/...", "data:", "//evil.com/...") que
  // reemplazaría silenciosamente el origen esperado al concatenarse en
  // resolveTileURL(). Estos tres valores vienen del manifest de tiles, pero
  // si ese manifest llegara a estar comprometido o mal generado, antes se
  // hubiese construido igual una URL fuera de basePath sin ningún aviso.
  _sanitizePath(str) {
    if (typeof str !== 'string' || !str) return '';
    if (
      /(\.\.[/\\])|([/\\]\.\.)|(^\.\.)/.test(str) ||  // traversal: ../ /.. ..\
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(str)        ||  // esquema: http:, https:, data:, javascript:...
      /^[/\\]{1,2}/.test(str)                          // ruta absoluta o //host (protocol-relative)
    ) {
      console.error(`🚫 Path peligroso rechazado: ${str}`);
      return '';
    }
    return str;
  }

  resolveTileURL(row, col) {
    const meta = this.getTileMeta(row, col);
    if (!meta) return null;

    const lodInfo = meta.lods[this.chosenLOD];
    if (!lodInfo) {
      console.warn(`❌ No hay LOD '${this.chosenLOD}' para tile ${row}_${col}`);
      return null;
    }

    const filename = lodInfo.filename;
    if (!filename) {
      console.warn(`❌ No hay filename para tile ${row}_${col} LOD ${this.chosenLOD}`);
      return null;
    }

    // FIX #9: lógica de fallback corregida
    // Si soporta WebP y el archivo es WebP → usar directo
    // Si no soporta WebP → usar lodInfo.fallback si existe, si no intentar reemplazar extensión
    let finalFilename;
    if (this.supportsWebP) {
      finalFilename = filename;
    } else if (lodInfo.fallback) {
      finalFilename = lodInfo.fallback;
    } else if (/\.webp$/i.test(filename)) {
      // Sólo reemplazar si realmente es .webp
      finalFilename = filename.replace(/\.webp$/i, '.png');
    } else {
      // El archivo ya no es WebP; usarlo tal cual
      finalFilename = filename;
    }

    const safeBase = this._sanitizePath(this.basePath);
    const safeLOD  = this._sanitizePath(this.chosenLOD);
    const safeFile = this._sanitizePath(finalFilename);

    if (!safeBase || !safeLOD || !safeFile) return null;

    const finalUrl    = `${safeBase}/${safeLOD}/${safeFile}`;
    const finalWidth  = lodInfo.width  || meta.width;
    const finalHeight = lodInfo.height || meta.height;

    return {
      url: finalUrl,
      w  : finalWidth,
      h  : finalHeight,
      x  : meta.x,
      y  : meta.y
    };
  }

  // ─── Gestión de tiles ─────────────────────────────────────────────────────

  tileKey(row, col) {
    return `tile_r${row}_c${col}`;
  }

  loadTile(row, col) {
    const key = this.tileKey(row, col);

    if (this.loaded.has(key) || this.loading.has(key)) return;

    // Evitar duplicados en cola
    if (this.loadQueue.some(item => item.key === key)) return;

    const info = this.resolveTileURL(row, col);
    if (!info) {
      if (this.debugMode) {
        console.warn(`🚫 No se pudo encolar tile ${row}_${col} - sin información de URL`);
      }
      return;
    }

    // FIX #15: límite de cola — descartar el tile más antiguo si se supera el máximo
    if (this.loadQueue.length >= this.maxQueue) {
      if (this.debugMode) {
        console.warn(`⚠️ Cola llena (${this.maxQueue}), descartando tile más antiguo`);
      }
      this.loadQueue.shift();
    }

    this.loadQueue.push({ row, col, key, url: info.url, w: info.w, h: info.h, x: info.x, y: info.y });

    if (this.debugMode) {
      console.log(`📥 Encolado tile ${key} -> ${info.url}`);
    }

    this._processQueue();
  }

  _processQueue() {
    if (this._destroyed) return;
    if (this.currentLoads >= this.maxLoads || this.loadQueue.length === 0) return;

    const item = this.loadQueue.shift();

    // FIX #2: si la textura ya existe, no incrementar currentLoads —
    // ir directo a crear el sprite sin pasar por el loader
    if (this.scene.textures.exists(item.key)) {
      this.loading.add(item.key);
      this._createTileSprite(item);
      return;
    }

    // A partir de aquí sí empieza una carga HTTP real.
    // FIX #20: marcar el item como carga HTTP real. Solo estos items
    // incrementan currentLoads, así que solo estos deben decrementarlo al
    // terminar. Sin este flag, un cache-hit (que NO incrementa currentLoads)
    // decrementaba igual en el finally de _createTileSprite, robándole el slot
    // de concurrencia a una carga real en vuelo y desincronizando el contador.
    item._httpLoad = true;
    this.currentLoads++;
    this.loading.add(item.key);

    const loader = this.scene.load;

    // FIX #1 / FIX #18 (fuga de memoria): el comentario original decía "usar
    // once() para que el listener se auto-elimine" pero en realidad se usaba
    // on() + un filtro manual por key, y SOLO onError se removía a sí mismo.
    // En el camino exitoso (el normal, el que pasa siempre que un tile carga
    // bien) nunca se llamaba loader.off(...) — cada tile con carga HTTP real
    // dejaba 2 listeners ('filecomplete' y 'loaderror') colgados en
    // scene.load para siempre. Con cientos de tiles en una sesión larga eso
    // es memoria que nunca se libera, más trabajo O(n) creciente en cada
    // 'filecomplete' futuro (cada listener muerto sigue comparando su key).
    // Ahora onComplete se remueve a sí mismo (y a onError) ni bien dispara,
    // sea cual sea el resultado.
    const onComplete = (fileKey) => {
      if (fileKey !== item.key) return;
      loader.off('filecomplete', onComplete);
      loader.off('loaderror', onError);
      this._onTileLoaded(item, loader, onError);
    };

    // FIX #3: también escuchar errores de carga asíncrona
    const onError = (file) => {
      if (file.key !== item.key) return;
      console.warn(`❌ Error de carga para tile ${item.key}: ${item.url}`);
      loader.off('filecomplete', onComplete);
      loader.off('loaderror', onError);
      this.loading.delete(item.key);
      this.currentLoads--;
      this._processQueue();
    };

    loader.on('filecomplete', onComplete);
    loader.on('loaderror',    onError);

    try {
      loader.image(item.key, item.url);

      // FIX #13: verificar el estado real del loader antes de llamar start()
      if (loader.state === Phaser.Loader.LOADER_IDLE ||
          loader.state === Phaser.Loader.LOADER_COMPLETE) {
        loader.start();
      }

      if (this.debugMode) {
        console.log(`🔄 Cargando: ${item.key} desde ${item.url}`);
      }
    } catch (e) {
      console.error('❌ Error al registrar imagen en loader:', e);
      loader.off('filecomplete', onComplete);
      loader.off('loaderror',    onError);
      this.loading.delete(item.key);
      this.currentLoads--;
      this._processQueue();
    }
  }

  _onTileLoaded(item, loader, onError) {
    if (this._destroyed) {
      // FIX #10: si el manager fue destruido mientras cargaba, abortar silenciosamente
      loader && loader.off('loaderror', onError);
      this.loading.delete(item.key);
      if (item._httpLoad && this.currentLoads > 0) this.currentLoads--;
      return;
    }

    if (this.scene.textures.exists(item.key)) {
      // _createTileSprite ya limpia loading, decrementa currentLoads y llama
      // a _processQueue en su finally. NO volver a llamarlo aquí (antes se
      // invocaba _processQueue dos veces por cada tile cargado con éxito).
      this._createTileSprite(item);
      return;
    }

    console.warn(`❌ Textura no existe tras carga: ${item.key}`);
    loader && loader.off('loaderror', onError);
    this.loading.delete(item.key);
    if (item._httpLoad && this.currentLoads > 0) this.currentLoads--;
    this._processQueue();
  }

  _createTileSprite(item) {
    if (this._destroyed) {
      // FIX #10: escena destruida — limpiar y salir
      this.loading.delete(item.key);
      // FIX #20: currentLoads solo se incrementó en cargas HTTP reales
      // (item._httpLoad), no en cache-hits. Decrementar SOLO en ese caso.
      if (item._httpLoad && this.currentLoads > 0) this.currentLoads--;
      return;
    }

    try {
      // SEAM FIX 1: forzar posición entera para eliminar offset sub-pixel.
      // Coordenadas flotantes (ej. 312.7) dejan ranuras de <1px entre tiles.
      const worldX = Math.round(item.x !== undefined ? item.x : (item.col * this.tileSize));
      const worldY = Math.round(item.y !== undefined ? item.y : (item.row * this.tileSize));

      const img = this.scene.add.image(worldX, worldY, item.key).setOrigin(0);

      // SEAM FIX 2: añadir seamOverlap (default 1px) al tamaño de display.
      // Esto hace que cada tile se extienda ligeramente sobre el siguiente,
      // cubriendo cualquier gap residual del GPU rasterizer.
      // Math.ceil garantiza entero aunque el metadata tenga decimales.
      const baseW   = item.w || Math.min(this.tileSize, this.mapWidth  - worldX);
      const baseH   = item.h || Math.min(this.tileSize, this.mapHeight - worldY);
      const displayW = Math.ceil(baseW) + this.seamOverlap;
      const displayH = Math.ceil(baseH) + this.seamOverlap;

      img.setDisplaySize(displayW, displayH);
      img.setDepth(this.depth);

      this.loaded.set(item.key, { sprite: img, row: item.row, col: item.col, key: item.key });

      if (this.debugMode) {
        console.log(`✅ Tile creado: ${item.key} en (${worldX}, ${worldY}) ` +
          `tamaño ${displayW}x${displayH}`);
      }
    } catch (e) {
      console.error('❌ Error creando sprite:', e, item);
    } finally {
      this.loading.delete(item.key);
      // FIX #20: solo las cargas HTTP reales incrementaron currentLoads.
      if (item._httpLoad && this.currentLoads > 0) this.currentLoads--;
      this._processQueue();
    }
  }

  // ─── Depth ────────────────────────────────────────────────────────────────

  setDepth(depth) {
    // FIX #17: dirty-flag para evitar iteración innecesaria
    if (depth === this.depth) return;
    this.depth = depth;
    for (const [, data] of this.loaded.entries()) {
      if (data.sprite && typeof data.sprite.setDepth === 'function') {
        data.sprite.setDepth(depth);
      }
    }
  }

  // ─── Descarga de tiles ────────────────────────────────────────────────────

  unloadTile(row, col) {
    const key  = this.tileKey(row, col);

    // FIX #4: también eliminar de la cola si el tile aún no se cargó
    const qIdx = this.loadQueue.findIndex(item => item.key === key);
    if (qIdx !== -1) {
      this.loadQueue.splice(qIdx, 1);
    }

    const data = this.loaded.get(key);
    if (!data) return;

    try {
      if (data.sprite && typeof data.sprite.destroy === 'function') {
        data.sprite.destroy();
      }
    } catch (e) {
      console.warn('⚠️ Error al destruir sprite:', e);
    }

    this.loaded.delete(key);
  }

  // ─── Actualización de visibilidad ─────────────────────────────────────────

  updateVisible(camera) {
    if (!camera || this._destroyed) return;

    const pad  = this.margin;
    const view = camera.worldView;

    // SEAM FIX 3: redondear el scroll de la cámara al calcular el rango de tiles.
    // Si la cámara está en x=312.7, Math.floor lo trata como 312 — sin redondear
    // el borde del tile visible puede quedar a 0.3px fuera del rango y no cargarse.
    const viewX = Math.round(view.x);
    const viewY = Math.round(view.y);

    const left   = Math.max(0, Math.floor((viewX - pad * this.tileSize) / this.tileSize));
    const top    = Math.max(0, Math.floor((viewY - pad * this.tileSize) / this.tileSize));
    const right  = Math.min(
      Math.ceil(this.mapWidth  / this.tileSize) - 1,
      Math.ceil((viewX + view.width  + pad * this.tileSize) / this.tileSize)
    );
    const bottom = Math.min(
      Math.ceil(this.mapHeight / this.tileSize) - 1,
      Math.ceil((viewY + view.height + pad * this.tileSize) / this.tileSize)
    );

    // FIX TITILEO: rango de DESCARGA con margen extra (histéresis) respecto
    // al de carga. Antes se usaba el MISMO pad para decidir qué cargar y qué
    // destruir, así que un tile justo en el borde (cámara oscilando por
    // fracción de pixel, típico siguiendo a un jugador) se cargaba y volvía
    // a destruir en frames consecutivos — sprite destruido → recreado →
    // destruido..., visible como parpadeo. Ahora un tile solo se destruye
    // cuando queda claramente fuera (pad + unloadHysteresis), no apenas sale
    // del rango de carga. Mismo patrón que ya usa DynamicChunkManager en
    // phaser-rpg-perf.js para evitar parpadeo en bordes de chunk.
    const unloadPad = pad + this.unloadHysteresis;
    const uLeft   = Math.max(0, Math.floor((viewX - unloadPad * this.tileSize) / this.tileSize));
    const uTop    = Math.max(0, Math.floor((viewY - unloadPad * this.tileSize) / this.tileSize));
    const uRight  = Math.min(
      Math.ceil(this.mapWidth  / this.tileSize) - 1,
      Math.ceil((viewX + view.width  + unloadPad * this.tileSize) / this.tileSize)
    );
    const uBottom = Math.min(
      Math.ceil(this.mapHeight / this.tileSize) - 1,
      Math.ceil((viewY + view.height + unloadPad * this.tileSize) / this.tileSize)
    );

    // FIX #21: se eliminó el Set `neededKeys` que se construía cada frame y
    // nunca se leía (la descarga se decide contra el rango ampliado uTop/uBottom/
    // uLeft/uRight, no contra este set). Era trabajo y basura de GC por frame.
    let tilesToLoad = 0;

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        const key = this.tileKey(r, c);

        if (!this.loaded.has(key) && !this.loading.has(key)) {
          tilesToLoad++;
          this.loadTile(r, c);
        }
      }
    }

    // FIX #5: recolectar keys a eliminar ANTES de iterar para evitar
    // modificar el Map durante la iteración (comportamiento indefinido en spec)
    // FIX TITILEO: se compara contra el rango AMPLIADO (uTop/uBottom/uLeft/uRight),
    // no contra neededKeys — así la banda entre "se carga" y "se destruye"
    // absorbe el jitter de cámara sin destruir y recrear el sprite.
    const toUnload = [];
    for (const [key, info] of this.loaded.entries()) {
      if (info.row < uTop || info.row > uBottom || info.col < uLeft || info.col > uRight) {
        toUnload.push({ row: info.row, col: info.col });
      }
    }
    toUnload.forEach(({ row, col }) => this.unloadTile(row, col));

    if (this.debugMode) {
      console.log(`👀 Cámara: (${viewX}, ${viewY}) ` +
        `${view.width}x${view.height}`);
      console.log(`📊 Tiles: visibles ${this.loaded.size}, cargando ${this.loading.size}, ` +
        `en cola ${this.loadQueue.length}`);
      console.log(`🔄 Acciones: cargar ${tilesToLoad}, descargar ${toUnload.length}`);
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  /** Carga todos los tiles (usar solo en herramientas de debug/build) */
  loadAllTiles() {
    console.log('🔄 Cargando TODOS los tiles...');
    const cols = Math.ceil(this.mapWidth  / this.tileSize);
    const rows = Math.ceil(this.mapHeight / this.tileSize);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.loadTile(r, c);
      }
    }
  }

  // FIX #6: loadingCount corregido — loading y currentLoads representaban lo mismo
  visibleCount()  { return this.loaded.size; }
  loadingCount()  { return this.currentLoads + this.loadQueue.length; }
  totalCount()    { return this.totalTiles; }

  // ─── Destrucción ──────────────────────────────────────────────────────────

  destroy() {
    // FIX #10: marcar como destruido PRIMERO para que los callbacks en vuelo
    // detecten el estado y no intenten crear sprites en una escena inválida
    this._destroyed = true;

    for (const [, data] of this.loaded.entries()) {
      try {
        if (data.sprite && typeof data.sprite.destroy === 'function') {
          data.sprite.destroy();
        }
      } catch (e) {
        console.warn('⚠️ Error al destruir sprite en cleanup:', e);
      }
    }

    this.loaded.clear();
    this.loading.clear();
    this.loadQueue    = [];
    this.currentLoads = 0;
  }
}


// FIX #14: Exportar bajo namespace seguro en lugar de window.TileManager directo
if (typeof window !== 'undefined') {
  _GF.TileManager = TileManager;

  // Alias de compatibilidad hacia atrás (avisa en consola si se usa)
  Object.defineProperty(window, 'TileManager', {
    get() {
      console.warn(
        '⚠️ window.TileManager está deprecado. ' +
        'Usar window.GrasslandForest.TileManager en su lugar.'
      );
      return TileManager;
    },
    configurable: true
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TileManager;
}
