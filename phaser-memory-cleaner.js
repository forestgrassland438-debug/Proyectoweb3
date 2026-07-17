
/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * 
 * GRASSLAND FOREST v13
 * Desarrollado y Publicado por: Jean Larreal
 * CONTACTO PARA PERMISOS:
 * Jean Larreal
 * Email: [killerhackcodeup@gmail.com]
 * Sitio Web: [grasslandforest.xyz]
 * 
 * VERSIÓN: v13.0.0-release
 * GENERADO: 19/20/2025
 * ============================================================================
 */


/* Phaser Memory Sleuth v1.0
   - Uso recomendado (solo inspección primero):
       window.PhaserSleuth.run({ dryRun:true, sizeThresholdMB: 10 });
   - Para limpieza agresiva (destructiva):
       window.PhaserSleuth.run({ dryRun:false, aggressive:true, sizeThresholdMB: 5 });
   - El script devuelve y descarga (si exportReport=true) un JSON con:
       - lista de objetos grandes (paths, estimación en MB)
       - resumen de caches/textures encontradas
       - sugerencias de limpieza por path
*/
(function(){
  if (window.PhaserSleuthLoaded) return;
  window.PhaserSleuthLoaded = true;

  const nowISO = () => (new Date()).toISOString();
  const toMB = b => (b/1024/1024).toFixed(2) + ' MB';
  function safe(fn, fallback){ try { return fn(); } catch(e) { return fallback; } }

  // heurístico de estimación (más cuidadoso que antes)
  function estimateSize(value, opts, seen = new WeakSet(), depth = 0){
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'string') {
      const len = Math.min(value.length, opts.maxStringLength||1e6);
      return len * 2;
    }
    if (typeof value === 'function') return 0;
    if (typeof value === 'object'){
      if (seen.has(value)) return 0;
      seen.add(value);

      // Typed arrays / buffers
      if (ArrayBuffer.isView(value) && value.byteLength !== undefined) return value.byteLength;
      if (value instanceof ArrayBuffer) return value.byteLength || 0;
      if (typeof WebAssembly !== 'undefined' && value instanceof WebAssembly.Memory && value.buffer) return value.buffer.byteLength || 0;

      // DOM
      if (value instanceof Element) return 1024;

      // Array
      if (Array.isArray(value)){
        let sum = 0;
        const limit = Math.min(value.length, opts.maxArrayElements || 1000);
        for (let i=0;i<limit;i++) sum += estimateSize(value[i], opts, seen, depth+1);
        if (value.length > limit) sum += (value.length - limit) * 8;
        return sum;
      }

      // Map/Set
      if (value instanceof Map){
        let sum = 0; let i=0;
        for (let [k,v] of value){
          if (i++ > (opts.maxMapEntries||500)) break;
          sum += estimateSize(k, opts, seen, depth+1) + estimateSize(v, opts, seen, depth+1);
        }
        return sum;
      }
      if (value instanceof Set){
        let sum = 0; let i=0;
        for (let v of value){
          if (i++ > (opts.maxMapEntries||500)) break;
          sum += estimateSize(v, opts, seen, depth+1);
        }
        return sum;
      }

      // Generic object (limit depth to avoid explosion)
      if (depth > (opts.maxDepth || 3)) return 0;
      let s = 0;
      const keys = Object.keys(value);
      const K = Math.min(keys.length, opts.maxProps || 200);
      for (let i=0;i<K;i++){
        const k = keys[i];
        try{ s += estimateSize(value[k], opts, seen, depth+1); s += k.length * 2; }catch(e){}
      }
      if (keys.length > K) s += (keys.length - K) * 16;
      return s;
    }
    return 0;
  }

  // traverse object graph from a root, collect large nodes with paths
  function traverse(root, rootName, opts){
    const results = [];
    const seen = new WeakSet();
    const stack = [{ obj: root, path: rootName, depth: 0 }];
    let nodesVisited = 0;
    const maxNodes = opts.maxNodes || 20000;

    while (stack.length && nodesVisited < maxNodes){
      const cur = stack.pop();
      nodesVisited++;
      const o = cur.obj;
      const p = cur.path;
      try{
        if (o && typeof o === 'object'){
          if (seen.has(o)) continue;
          seen.add(o);

          const size = estimateSize(o, opts, seen, cur.depth);
          if (size >= (opts.sizeThresholdMB||1) * 1024*1024){
            results.push({ path: p, bytes: size, MB: parseFloat((size/1024/1024).toFixed(2)), type: Object.prototype.toString.call(o) });
          }

          // push children: arrays, object props (shallow)
          if (Array.isArray(o)){
            const len = Math.min(o.length, opts.maxArrayElements || 200);
            for (let i = 0; i < len; i++){
              try{ stack.push({ obj: o[i], path: p + '[' + i + ']', depth: cur.depth+1 }); }catch(e){}
            }
          } else if (o instanceof Map){
            let idx = 0;
            for (let [k,v] of o){
              if (idx++ > (opts.maxMapEntries||200)) break;
              try{ stack.push({ obj: v, path: p + '.<Map>[' + String(k).slice(0,40) + ']', depth: cur.depth+1 }); }catch(e){}
            }
          } else if (o instanceof Set){
            let idx=0;
            for (let v of o){
              if (idx++ > (opts.maxMapEntries||200)) break;
              try{ stack.push({ obj: v, path: p + '.<Set>['+idx+']', depth: cur.depth+1 }); }catch(e){}
            }
          } else {
            const props = Object.keys(o).slice(0, opts.maxProps || 200);
            for (const k of props){
              try{ stack.push({ obj: o[k], path: p + '.' + k, depth: cur.depth+1 }); }catch(e){}
            }
          }
        } else {
          // primitive - ignore
        }
      }catch(e){}
    }

    results.sort((a,b)=>b.bytes - a.bytes);
    return { results, nodesVisited };
  }

  // specialized scanners for Phaser: textures, cache, scenes, tileManager candidates
  function scanPhaser(game, opts){
    const report = { textures: [], cache: [], scenes: [], gameObjectsCount: 0 };
    if (!game) return report;
    try{
      // textures summary
      const texMgr = safe(()=> game.textures);
      if (texMgr){
        const keys = Object.keys(texMgr.list || texMgr._textures || {});
        for (const k of keys){
          try{
            const t = safe(()=> texMgr.get(k));
            let w=0,h=0,bytes=0;
            if (t && t.source && t.source[0]) { w = t.source[0].width || t.source[0].naturalWidth || 0; h = t.source[0].height || t.source[0].naturalHeight || 0; }
            if ((!w||!h) && t && t.width && t.height){ w = t.width; h = t.height; }
            bytes = (w && h) ? (w*h*4) : 0;
            report.textures.push({ key: k, w, h, bytes, MB: toMB(bytes) });
          }catch(e){}
        }
        report.textures.sort((a,b)=>b.bytes-a.bytes);
      }
      // cache summary
      try{
        const cache = safe(()=> game.cache || game.cacheManager || {});
        const stores = Object.keys(cache || {});
        for (const s of stores){
          try{
            const storeObj = cache[s];
            let count = 0;
            if (!storeObj) continue;
            if (storeObj.entries) count = Object.keys(storeObj.entries).length;
            else if (storeObj.list) count = Object.keys(storeObj.list).length;
            else if (storeObj.size !== undefined) count = storeObj.size;
            report.cache.push({ store: s, count });
          }catch(e){}
        }
      }catch(e){}
      // scenes summary
      const scenes = safe(()=> game.scene && game.scene.scenes ? game.scene.scenes : []);
      for (const s of scenes){
        try{
          const gos = (s && s.children && Array.isArray(s.children.list)) ? s.children.list.length : (s && s.children && s.children.length || 0);
          report.scenes.push({ key: s.scene ? s.scene.key : (s.sys && s.sys.settings && s.sys.settings.key) || 'unknown', gameObjects: gos });
          report.gameObjectsCount += gos;
        }catch(e){}
      }
    }catch(e){}
    return report;
  }

  // helper: try to find likely named objects on window (tileManager, TileManager, tilemanager, socket, socketio)
  function findLikelyNames(opts){
    const names = ['tileManager','TileManager','tilemanager','TileManagerInstance','socket','io','socketIo','tilemgr','TileMgr','TileMap','Tilemap'];
    const found = [];
    for (const n of names){
      try{
        if (window[n]) found.push({ name: n, value: window[n], bytes: estimateSize(window[n], opts) });
      }catch(e){}
    }
    return found;
  }

  // cleanup helpers (conservative): clear arrays length=0, clear maps/sets, stop sounds, remove textures by key list
  function safeCleanupByPath(path, opts){
    // path is like "window.SomeObj.cache.largeArray" — we try to evaluate and clean common types
    try{
      const fn = new Function('return ' + path); // may throw
      const obj = fn();
      if (!obj) return { ok:false, reason:'undefined' };
      // arrays
      if (Array.isArray(obj)){
        obj.length = 0;
        return { ok:true, action:'cleared array length' };
      }
      if (obj instanceof Map){ obj.clear(); return { ok:true, action:'map.clear()' }; }
      if (obj instanceof Set){ obj.clear(); return { ok:true, action:'set.clear()' }; }
      if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer){ try{ /* cannot free buffer directly, try to null parent */ }catch(e){} return { ok:false, reason:'buffer' }; }
      // if object has dispose/destroy/clear methods, call them
      if (typeof obj.clear === 'function'){ try{ obj.clear(); return { ok:true, action:'obj.clear()' }; }catch(e){} }
      if (typeof obj.destroy === 'function'){ try{ obj.destroy(); return { ok:true, action:'obj.destroy()' }; }catch(e){} }
      if (typeof obj.dispose === 'function'){ try{ obj.dispose(); return { ok:true, action:'obj.dispose()' }; }catch(e){} }
      // fallback: set to null if top-level on window
      const top = path.split('.')[0];
      if (top === 'window' || top in window){
        try{ window[top] = null; return { ok:true, action:'window.'+top+' = null' }; }catch(e){}
      }
      return { ok:false, reason:'no known cleanup' };
    }catch(e){ return { ok:false, reason:'eval failed' }; }
  }

  // main run
  function run(userOpts){
    const opts = Object.assign({
      dryRun: true,
      aggressive: false,
      exportReport: true,
      sizeThresholdMB: 5,
      maxNodes: 30000,
      maxDepth: 4,
      maxProps: 300,
      maxArrayElements: 1000,
      maxMapEntries: 500,
      maxStringLength: 1e6
    }, userOpts || {});

    const report = { timestamp: nowISO(), opts, scannedRoots: [], found: [], phaserSummary: null, likelyNames: [], attemptedCleanup: [], log: [] };
    function lg(m){ report.log.push('['+nowISO()+'] '+m); console.log(m); }

    lg('Starting Phaser Memory Sleuth. options: ' + JSON.stringify(opts));

    // 0) pre snapshot if reporter available
    const reporter = safe(()=> window.PhaserMemoryReporterV3);
    const pre = safe(()=> reporter && typeof reporter.snapshot === 'function' ? reporter.snapshot() : null);
    report.preSnapshot = pre ? { timestamp: pre.timestamp, heapUsed: pre.heap ? pre.heap.used : null, estimableWithGPU_MB: pre.estimableWithGPU_MB } : null;
    if (report.preSnapshot) lg('preSnapshot heap.used ≈ ' + (report.preSnapshot.heapUsed ? toMB(report.preSnapshot.heapUsed) : 'n/a'));

    // roots to scan: window, game, game.textures, game.cache, tileManager candidates
    lg('Preparing scan roots...');
    const roots = [];
    roots.push({ name: 'window', obj: window });
    const game = safe(()=> opts.game || window.game || null);
    if (game) { roots.push({ name: 'game', obj: game }); roots.push({ name: 'game.textures', obj: safe(()=> game.textures) }); roots.push({ name: 'game.cache', obj: safe(()=> game.cache || game.cacheManager) }); roots.push({ name: 'game.registry', obj: safe(()=> game.registry) }); }
    // look for common tile manager variables anywhere on window
    const likely = findLikelyNames(opts);
    for (const l of likely) roots.push({ name: 'window.' + l.name, obj: l.value });

    // run traverse for each root
    for (const r of roots){
      try{
        if (!r.obj) continue;
        lg('Scanning root: ' + r.name);
        const t = traverse(r.obj, r.name, Object.assign({}, opts, { maxNodes: opts.maxNodes, sizeThresholdMB: opts.sizeThresholdMB }));
        report.scannedRoots.push({ name: r.name, nodesVisited: t.nodesVisited, resultsCount: t.results.length });
        // keep top N results with path and MB
        const top = t.results.slice(0, 200).map(x => ({ path: x.path, MB: parseFloat((x.bytes/1024/1024).toFixed(2)), type: x.type }));
        report.found.push({ root: r.name, top });
        lg('Found ' + top.length + ' big nodes under ' + r.name + ' (top shown).');
      }catch(e){ lg('scan root error ' + r.name + ' : ' + e); }
    }

    // phaser specific summary
    try{ report.phaserSummary = scanPhaser(game, opts); lg('Collected Phaser summary (textures/caches/scenes).'); }catch(e){}

    // likely named objects
    try{ report.likelyNames = findLikelyNames(opts).map(x => ({ name: x.name, MB: parseFloat((estimateSize(x.value, opts)/1024/1024).toFixed(2)) })); }catch(e){}

    // If aggressive and not dryRun, attempt targeted cleanup:
    if (opts.aggressive && !opts.dryRun){
      lg('Aggressive cleanup requested: attempting safe cleanups.');
      // 1) try to remove large textures by key > sizeThresholdMB from phaserSummary
      try{
        const texs = report.phaserSummary && report.phaserSummary.textures ? report.phaserSummary.textures : [];
        const threshBytes = opts.sizeThresholdMB * 1024 * 1024;
        const toRemove = texs.filter(t => t.bytes >= threshBytes || (opts.texturePrefixBlacklist && opts.texturePrefixBlacklist.some(pref => t.key && t.key.indexOf(pref)===0)));
        if (toRemove.length && game && game.textures){
          for (const t of toRemove){
            try{
              if (typeof game.textures.remove === 'function'){ game.textures.remove(t.key); report.attemptedCleanup.push({ action:'texture.remove', key:t.key, MB: toMB(t.bytes) }); }
              else if (game.textures.list && game.textures.list[t.key] && typeof game.textures.list[t.key].destroy === 'function'){ game.textures.list[t.key].destroy(); report.attemptedCleanup.push({ action:'texture.destroy', key:t.key, MB: toMB(t.bytes) }); }
            }catch(e){}
          }
          lg('Attempted removal of ' + toRemove.length + ' big textures.');
        }
      }catch(e){ lg('error removing textures: ' + e); }

      // 2) try to clear caches that appear large (best-effort)
      try{
        if (game && game.cache){
          const stores = Object.keys(game.cache || {});
          for (const s of stores){
            try{
              const store = game.cache[s];
              if (store && typeof store.destroy === 'function'){ store.destroy(); report.attemptedCleanup.push({ action:'cache.destroy', store:s }); }
              else if (store && store.entries && typeof store.entries === 'object'){ for (const k of Object.keys(store.entries)){ delete store.entries[k]; } report.attemptedCleanup.push({ action:'cache.entries.clear', store:s }); }
            }catch(e){}
          }
          lg('Attempted Phaser caches cleanup.');
        }
      }catch(e){}

      // 3) try to zero arrays or clear properties found in report.found (top results) - conservative: only top paths of roots
      try{
        for (const r of report.found){
          const top = r.top || [];
          for (const item of top.slice(0,20)){
            try{
              const p = item.path;
              const res = safeCleanupByPath(p, opts);
              report.attemptedCleanup.push({ path:p, result:res });
            }catch(e){}
          }
        }
      }catch(e){}
    } else {
      lg('No aggressive cleanup performed (dryRun or aggressive=false).');
    }

    // final snapshot
    const post = safe(()=> reporter && typeof reporter.snapshot === 'function' ? reporter.snapshot() : null);
    report.postSnapshot = post ? { timestamp: post.timestamp, heapUsed: post.heap ? post.heap.used : null, estimableWithGPU_MB: post.estimableWithGPU_MB } : null;
    lg('Finished. preHeap=' + (report.preSnapshot && report.preSnapshot.heapUsed ? toMB(report.preSnapshot.heapUsed) : 'n/a') + ', postHeap=' + (report.postSnapshot && report.postSnapshot.heapUsed ? toMB(report.postSnapshot.heapUsed) : 'n/a'));

    // export report
    try{
      if (opts.exportReport){
        const filename = 'phaser-sleuth-report-' + (new Date()).toISOString().replace(/[:.]/g,'-') + '.json';
        const txt = JSON.stringify(report, null, 2);
        const blob = new Blob([txt], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        lg('Report exported: ' + filename);
      }
    }catch(e){ lg('Report export failed: ' + e); }

    window.PhaserSleuthLastReport = report;
    return report;
  }

  window.PhaserSleuth = { run };
  console.info('PhaserSleuth ready. Example: window.PhaserSleuth.run({ dryRun:true, sizeThresholdMB:5 });');
})();
