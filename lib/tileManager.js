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
    // Default subido de 1 a 2: con la cámara siguiendo al jugador (lerp lento
    // + roundPixels) el scroll oscila hasta ~1 tile en los bordes; 2 tiles de
    // colchón evitan por completo el ciclo destruir→recrear→destruir que se
    // ve como parpadeo en el borde de la pantalla. El coste es unos pocos
    // sprites extra en memoria, despreciable frente a un tile completo.
    this.unloadHysteresis = Math.max(0, typeof opts.unloadHysteresis === 'number' ? opts.unloadHysteresis : 2);

    // Márgenes en PÍXELES (recomendado). Si se dejan sin definir se usa el
    // cálculo antiguo en tiles, que con tiles de 2.048 px hacía que el recorte
    // por distancia no recortara nunca nada. Ver updateVisible().
    this.marginPx     = (typeof opts.marginPx === 'number')     ? Math.max(0, opts.marginPx)     : undefined;
    this.unloadPadPx  = (typeof opts.unloadPadPx === 'number')  ? Math.max(0, opts.unloadPadPx)  : undefined;
    /* CUÁNTAS CARGAS A LA VEZ.

       Baja de 6 a 3. Cada tile mide 2048x2048: descodificar el PNG y subirlo a
       la GPU cuesta lo suyo, y con seis en vuelo era normal que tres o cuatro
       terminaran en el MISMO tick del navegador. Todo ese trabajo caía en un
       solo fotograma y eso es el tirón. Con tres se reparte solo. */
    this.maxLoads    = opts.maxConcurrentLoads || 3;
    this.maxQueue    = opts.maxQueueSize || 50;          // FIX #15: límite de cola

    /* EL TIRÓN AL ANDAR, Y CÓMO SE QUITA.

       Crear el sprite de un tile y destruirlo son las dos operaciones caras
       (subir 16 MB a la GPU / liberarlos). Se hacían TODAS de golpe: al cruzar
       de zona, updateVisible() encolaba varios tiles y, para los que ya estaban
       en caché, _processQueue los creaba uno detrás de otro en el mismo
       fotograma; y justo después destruía de una vez todos los que salían de
       rango. Eso es exactamente el parón que se nota al caminar.

       Ahora nada de eso se hace en el momento: se APUNTA en dos colas y se van
       sacando de a pocos por fotograma desde bombear(). El trabajo total es el
       mismo, pero repartido no se ve. */
    this._listos       = [];     // texturas ya cargadas, esperando su sprite
    this._paraDescarga = [];     // tiles que hay que destruir
    this.creaPorFrame  = opts.creaPorFrame  || 1;
    this.borraPorFrame = opts.borraPorFrame || 2;
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

    // ── CONTROL DE MEMORIA DE TEXTURAS ───────────────────────────────────────
    // Nombres de las texturas que ha creado ESTE gestor. Sin esta lista no se
    // podía saber cuáles se pueden borrar sin riesgo de tocar una del juego, y
    // por eso no se borraba ninguna: cada tile dejaba 16,8 MB para siempre (ver
    // _liberarTextura y destroy).
    this._texturasPropias = new Set();

    // Liberar la textura al descargar un tile. Se puede desactivar
    // (`liberarTexturas: false`) si alguna vez interesa cambiar memoria por
    // velocidad al ir y volver por la misma zona.
    this.liberarTexturas = opts.liberarTexturas !== false;

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

    const finalUrl = `${safeBase}/${safeLOD}/${safeFile}`;

    // ── EL LOD CAMBIA LA RESOLUCIÓN, NO EL TAMAÑO EN EL MUNDO ────────────────
    // BUG QUE ESTO ARREGLA — "en calidad Media y Baja el mapa sale pequeño y
    // casi todo queda en negro":
    //
    // Antes se devolvía `lodInfo.width/height`, que son los PÍXELES DEL ARCHIVO
    // de ese nivel de detalle, no el hueco que el tile ocupa en el mundo. En el
    // metadata conviven las dos cosas y significan cosas distintas:
    //
    //      tile r1c1   →  x,y = 2048,2048   width,height = 2048×2048  ← MUNDO
    //        lods.hd   →  width,height = 2048×2048   (archivo)
    //        lods.md   →  width,height = 1024×1024   (archivo)
    //        lods.low  →  width,height =  512× 512   (archivo)
    //
    // _createTileSprite hace `setDisplaySize(item.w, item.h)`, así que en 'md'
    // cada tile se dibujaba ocupando 1024 px de mundo en vez de 2048 — el mapa
    // entero encogía a la mitad (y a la cuarta parte en 'low'). Y como la
    // rejilla de posiciones sigue siendo la del mundo real, entre tile y tile
    // quedaba el fondo negro: de ahí "el mapa no se está rellenando".
    //
    // Un nivel de detalle NUNCA debe cambiar la geometría del mundo: una imagen
    // de 512 px estirada sobre los mismos 2048 px de mundo es exactamente lo que
    // se busca (menos memoria, misma escena). Por eso el tamaño que se manda es
    // SIEMPRE el del mundo (`meta.width/height`, que ya contempla los tiles del
    // borde: 912 px en la última columna y la última fila).
    const finalWidth  = meta.width  || this.tileSize;
    const finalHeight = meta.height || this.tileSize;

    return {
      url: finalUrl,
      w  : finalWidth,
      h  : finalHeight,
      x  : meta.x,
      y  : meta.y
    };
  }

  // ─── Gestión de tiles ─────────────────────────────────────────────────────

  /**
   * Clave con la que Phaser guarda la textura de cada tile.
   *
   * FIX CRÍTICO (la calidad gráfica no cambiaba nada):
   * antes esta clave era `tile_r0_c0`, SIN el nivel de detalle. Y en
   * _processQueue hay un atajo:
   *
   *     if (this.scene.textures.exists(item.key)) { …usar la que ya está… }
   *
   * Así que al bajar la calidad de 'hd' a 'low', resolveTileURL devolvía
   * correctamente la URL de la imagen pequeña, pero como la clave era la misma
   * que ya estaba cargada en 'hd', Phaser reutilizaba la textura GRANDE y la
   * imagen nueva no se descargaba nunca. El selector de calidad parecía no
   * hacer nada porque, en la práctica, no hacía nada.
   *
   * Con el LOD dentro de la clave, cada nivel tiene su propia textura y el
   * cambio se ve de verdad ('low' son 512 px estirados a 2048: se nota mucho).
   */
  tileKey(row, col) {
    return `tile_${this.chosenLOD}_r${row}_c${col}`;
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
      // Sigue siendo "nuestra" (la creamos en una vuelta anterior y el tile
      // volvió a entrar en rango antes de que se liberara), así que se vuelve a
      // apuntar para poder liberarla cuando toque.
      if (this._texturasPropias) this._texturasPropias.add(item.key);
      this.loading.add(item.key);
      // A la cola: el sprite se crea en bombear(), repartido por fotogramas.
      this._listos.push(item);
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
      // Se apunta que esta textura la creó este gestor: es lo que permite
      // liberarla después sin miedo a borrar una del juego (ver _liberarTextura).
      if (this._texturasPropias) this._texturasPropias.add(item.key);
      /* A la cola, igual que el acierto de caché.

         OJO CON EL CONTADOR: currentLoads lo decrementa _createTileSprite en su
         finally, y ahora eso pasa uno o varios fotogramas después. Si se dejara
         así, el hueco de concurrencia quedaría ocupado por un tile que ya no
         está descargando nada y la cola se atascaría. Se suelta AQUÍ, que es
         cuando de verdad ha terminado la descarga, y se marca el item para que
         el finally no lo vuelva a soltar. */
      if (item._httpLoad && this.currentLoads > 0) this.currentLoads--;
      item._httpLoad = false;
      this._listos.push(item);
      this._processQueue();
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

  /**
   * Saca un poco de trabajo de las colas. Se llama UNA vez por fotograma.
   *
   * Primero se crea lo que ya está listo —es lo que el jugador está a punto de
   * ver— y solo después se destruye lo que sobra, que no corre ninguna prisa.
   * Si en un fotograma hay algo que crear, no se destruye nada: así el trabajo
   * caro nunca se junta.
   */
  bombear() {
    if (this._destroyed) return;

    let creados = 0;
    while (creados < this.creaPorFrame && this._listos.length) {
      const item = this._listos.shift();
      // Puede haberse salido de rango mientras esperaba en la cola.
      if (this.loaded.has(item.key)) { this.loading.delete(item.key); continue; }
      this._createTileSprite(item);
      creados++;
    }

    if (creados === 0) {
      let borrados = 0;
      while (borrados < this.borraPorFrame && this._paraDescarga.length) {
        const t = this._paraDescarga.shift();
        // Puede haber vuelto a entrar en rango: entonces no se toca.
        if (this.loaded.has(this.tileKey(t.row, t.col))) this.unloadTile(t.row, t.col);
        borrados++;
      }
    }

    if (this._listos.length === 0 && this.loadQueue.length) this._processQueue();
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

  /**
   * Borra de verdad la textura de un tile del gestor de texturas de Phaser.
   *
   * FUGA DE MEMORIA QUE ESTO ARREGLA — es la causa principal del "usa mucha RAM"
   * en el teléfono:
   *
   * `loader.image(key, url)` no solo descarga el PNG: lo decodifica y lo guarda
   * en el gestor de texturas del JUEGO (game.textures), que es global y no
   * pertenece a ningún sprite. Destruir el sprite —lo único que se hacía— libera
   * unos cientos de bytes; la textura, que es lo que pesa, se queda.
   *
   * Y estas texturas son enormes: cada tile mide 2048×2048 y en memoria de vídeo
   * ocupa 2048 × 2048 × 4 bytes = 16,8 MB. El mapa tiene 9. O sea que un jugador
   * que recorra el mapa entero acumula ~151 MB que ya no se sueltan NUNCA:
   * ni al alejarse del tile, ni al irse a la tienda, ni al volver. Y como cada
   * escena carga las suyas encima, el consumo solo sube.
   *
   * Solo se borran las texturas que ha creado ESTE gestor (se llevan apuntadas
   * en `_texturasPropias`), para no tocar por error una del juego que comparta
   * nombre.
   */
  _liberarTextura(key) {
    if (!this._texturasPropias || !this._texturasPropias.has(key)) return;
    try {
      const texturas = this.scene && this.scene.textures;
      if (texturas && texturas.exists(key)) {
        texturas.remove(key);
      }
    } catch (e) {
      console.warn(`⚠️ No se pudo liberar la textura ${key}:`, e && e.message);
    }
    this._texturasPropias.delete(key);
  }

  unloadTile(row, col) {
    const key  = this.tileKey(row, col);

    // Y de la cola de sprites pendientes, o se crearía después de destruirlo.
    for (let i = this._listos.length - 1; i >= 0; i--) {
      if (this._listos[i].key === key) {
        this._listos.splice(i, 1);
        this.loading.delete(key);
      }
    }

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

    // Y ahora sí, los 16,8 MB de la textura (ver _liberarTextura). Si el jugador
    // vuelve por aquí, el navegador la sirve de su caché de disco: se vuelve a
    // decodificar, pero no se vuelve a descargar.
    if (this.liberarTexturas) this._liberarTextura(key);
  }

  // ─── Actualización de visibilidad ─────────────────────────────────────────

  updateVisible(camera) {
    if (!camera || this._destroyed) return;

    // ── MARGEN EN PÍXELES, NO EN TILES ───────────────────────────────────────
    // PROBLEMA QUE ESTO ARREGLA (memoria): el margen de carga y el colchón
    // anti-parpadeo se medían en TILES, y aquí un tile son 2.048 px. Con el
    // margen por defecto (3 tiles = 6.144 px) sobre un mapa que mide 5.008 px,
    // el rango de carga cubría SIEMPRE el mapa entero: los 9 tiles quedaban
    // cargados pasara lo que pasara, o sea ~151 MB de memoria de vídeo desde el
    // primer segundo. El recorte por distancia no llegaba a recortar nada nunca.
    //
    // El colchón anti-parpadeo solo tiene que absorber el temblor sub-píxel de
    // la cámara: unos cientos de píxeles bastan y sobran, no 4.096. Midiéndolo
    // en píxeles se conserva íntegro el arreglo del parpadeo y se recupera el
    // recorte de verdad.
    //
    // Si no se pasan las opciones nuevas, se cae al comportamiento de antes
    // (margen × tamaño de tile), así que nada que use este módulo se rompe.
    const pad = (typeof this.marginPx === 'number')
      ? this.marginPx
      : this.margin * this.tileSize;
    const colchon = (typeof this.unloadPadPx === 'number')
      ? this.unloadPadPx
      : this.unloadHysteresis * this.tileSize;

    const view = camera.worldView;

    // SEAM FIX 3: redondear el scroll de la cámara al calcular el rango de tiles.
    // Si la cámara está en x=312.7, Math.floor lo trata como 312 — sin redondear
    // el borde del tile visible puede quedar a 0.3px fuera del rango y no cargarse.
    const viewX = Math.round(view.x);
    const viewY = Math.round(view.y);

    // `pad` y `colchon` ya vienen en PÍXELES (ver arriba).
    //
    // ÍNDICE DEL ÚLTIMO TILE: `Math.floor`, no `Math.ceil`.
    // El tile de columna c cubre el tramo [c·tileSize, (c+1)·tileSize). El
    // último tile que hace falta para cubrir hasta el píxel `derecha` es, por
    // definición, floor(derecha / tileSize). Con `Math.ceil` se pedía SIEMPRE
    // una columna y una fila de más de las necesarias — y con tiles de 2.048 px
    // eso son hasta 5 tiles extra cargados a la vez, unos 84 MB de memoria de
    // vídeo desperdiciados. No es una red de seguridad contra huecos: el margen
    // de precarga (`pad`) ya cumple esa función, y de sobra.
    const derecha = viewX + view.width  + pad;
    const abajo   = viewY + view.height + pad;

    const left   = Math.max(0, Math.floor((viewX - pad) / this.tileSize));
    const top    = Math.max(0, Math.floor((viewY - pad) / this.tileSize));
    const right  = Math.min(
      Math.ceil(this.mapWidth  / this.tileSize) - 1,
      Math.floor(derecha / this.tileSize)
    );
    const bottom = Math.min(
      Math.ceil(this.mapHeight / this.tileSize) - 1,
      Math.floor(abajo / this.tileSize)
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
    const unloadPad = pad + colchon;   // ambos en píxeles
    const uLeft   = Math.max(0, Math.floor((viewX - unloadPad) / this.tileSize));
    const uTop    = Math.max(0, Math.floor((viewY - unloadPad) / this.tileSize));
    const uRight  = Math.min(
      Math.ceil(this.mapWidth  / this.tileSize) - 1,
      Math.floor((viewX + view.width  + unloadPad) / this.tileSize)
    );
    const uBottom = Math.min(
      Math.ceil(this.mapHeight / this.tileSize) - 1,
      Math.floor((viewY + view.height + unloadPad) / this.tileSize)
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
    /* Se APUNTAN, no se destruyen aquí: destruir diez tiles de 16 MB en el
       mismo fotograma es medio segundo de parón. Los saca bombear(). */
    for (let i = 0; i < toUnload.length; i++) this._paraDescarga.push(toUnload[i]);

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

  // ─── Ajustes en caliente (panel de gráficos) ──────────────────────────────

  /**
   * Cambia la DISTANCIA DE VISIÓN del mapa, en tiles alrededor de la cámara.
   * Es el equivalente al "render distance" de Minecraft para el terreno: con un
   * margen bajo solo se descarga y se dibuja lo que está cerca; al subirlo se
   * vuelve a traer lo de más lejos. El siguiente updateVisible() aplica el
   * cambio (carga lo que falte y descarga lo que sobre).
   */
  setMargin(tiles) {
    const n = Math.max(0, Math.floor(Number(tiles) || 0));
    if (n === this.margin) return false;
    this.margin = n;
    if (this.scene && this.scene.cameras && this.scene.cameras.main) {
      this.updateVisible(this.scene.cameras.main);
    }
    return true;
  }

  /**
   * Cambia el NIVEL DE DETALLE de las texturas del mapa ('hd' | 'md' | 'low').
   *
   * Es el ajuste de calidad más efectivo que existe aquí: el mapa en 'hd' son
   * 5008×5008 px de textura y en 'low' 1252×1252 — dieciséis veces menos
   * memoria de vídeo y de descarga. En un teléfono de gama baja esa diferencia
   * es la que decide si el juego va fluido o a tirones.
   *
   * Como los sprites ya cargados apuntan a la textura del LOD anterior, hay que
   * soltarlos: se destruyen y updateVisible() los vuelve a pedir con el nuevo.
   */
  setLOD(name) {
    if (this._destroyed) return false;
    if (!name || !this.availableLODs.includes(name)) {
      console.warn(`⚠️ LOD '${name}' no disponible. Hay: ${this.availableLODs.join(', ')}`);
      return false;
    }
    if (name === this.chosenLOD) return false;

    this.preferredLOD = name;
    this.chosenLOD    = name;

    // Soltar todo lo cargado del LOD anterior: el sprite Y la textura.
    // La textura es lo que de verdad ocupa memoria de vídeo (un tile 'hd' son
    // 2048×2048). Si no se quita, cambiar de calidad iría SUMANDO texturas en
    // la GPU en vez de sustituirlas, que es peor que no cambiar nada.
    for (const [clave, data] of this.loaded.entries()) {
      try { if (data.sprite && data.sprite.destroy) data.sprite.destroy(); }
      catch (e) { /* ya destruido */ }
      try {
        if (this.scene && this.scene.textures && this.scene.textures.exists(clave)) {
          this.scene.textures.remove(clave);
        }
      } catch (e) { /* textura en uso por otro objeto: se deja */ }
      // Ya no es nuestra: se quita de la lista para no intentar borrarla otra vez.
      if (this._texturasPropias) this._texturasPropias.delete(clave);
    }
    this.loaded.clear();
    this.loading.clear();
    this.loadQueue    = [];
    this.currentLoads = 0;

    // Reconstruir el índice: los nombres de fichero cambian con el LOD.
    try { this.init(); } catch (e) { console.warn('⚠️ setLOD: init() falló:', e); }

    if (this.scene && this.scene.cameras && this.scene.cameras.main) {
      this.updateVisible(this.scene.cameras.main);
    }
    console.log(`🎚️ TileManager: nivel de detalle cambiado a '${name}'`);
    return true;
  }

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

    // ── LIBERAR LAS TEXTURAS, NO SOLO LOS SPRITES ────────────────────────────
    // Aquí estaba la peor parte de la fuga: al cambiar de escena (mapa → tienda
    // → mapa, o al entrar en una batalla) se destruían los sprites y se daba el
    // gestor por limpio, pero las texturas seguían en game.textures. Cada tile
    // son 16,8 MB de memoria de vídeo, así que cada viaje dejaba atrás hasta
    // 151 MB que nunca se recuperaban — y la escena nueva cargaba las suyas
    // ENCIMA. Es exactamente lo que hace que el juego vaya bien al principio y
    // cada vez peor (y más caliente) según se juega.
    const pendientes = Array.from(this._texturasPropias || []);
    let liberadas = 0;
    pendientes.forEach((key) => {
      const antes = this._texturasPropias.size;
      this._liberarTextura(key);
      if (this._texturasPropias.size < antes) liberadas++;
    });
    if (liberadas > 0) {
      console.log(`🧹 TileManager: ${liberadas} textura(s) de terreno liberadas (~${Math.round(liberadas * 16.8)} MB)`);
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
