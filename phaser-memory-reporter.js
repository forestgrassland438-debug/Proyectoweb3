
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



/* Phaser Memory Reporter v3.1-improved
   Añadido:
    - Conteo y muestreo de setTimeout / setInterval (stack trace al crear)
    - Conteo de addEventListener/removeEventListener por target (y stack sample)
    - Document.createElement wrap para detectar nodos "creados" y detectar los que no están conectados (posibles detached nodes)
    - Detección de imágenes/data-URIs grandes en atributos src / style
    - snapshotAndExplain() produce diagnóstico en español con causas probables y acciones
    - reportOnce(game) imprime snapshot + explicación una sola vez (comando sugerido al final)
   Incluir ANTES de new Phaser.Game(...) para mejor captura.
*/
(function(){
  if (window.PhaserMemoryReporterV31LoadedImproved) return;
  window.PhaserMemoryReporterV31LoadedImproved = true;

  const BYTES_PER_PIXEL = 4; // RGBA
  const BYTES_PER_NODE = 1024;
  const AUDIO_SAMPLE_RATE = 44100;
  const AUDIO_CHANNELS = 2;
  const DEFAULT_BODY_BYTES = 512;
  const MS = n => (n || 2000);
  const GB = 1024 * 1024 * 1024;

  function prettyBytes(b){ return (b / 1024 / 1024).toFixed(2) + ' MB'; }
  function nowISO(){ return (new Date()).toISOString(); }
  function safe(fn, fallback){ try { return fn(); } catch(e){ return fallback; } }

  // --- Instrumentation state (extendido) ---
  const instr = {
    ctxIdCounter: 1,
    glState: new WeakMap(),
    glContexts: new Set(),
    canvases: new Set(),
    offscreenBytes: 0,
    canvasBytes: 0,
    imagesTracked: new WeakSet(),
    imageList: new Map(),
    imageIdCounter: 1,
    audioBuffers: new WeakMap(),
    audioBufferList: [],
    wsSockets: new Set(),
    wsStats: { sent:0, recv:0 },
    workers: new Set(),
    workerMessageBytes: 0,
    manualNotes: [],
    // new:
    timers: { count:0, list: [] }, // {id,type,createdAt,stack}
    listeners: { total:0, perNode: new WeakMap(), sampleStacks: [] },
    createdNodes: new WeakSet(),
    createdNodesListCount: 0,
    dataUriImages: [],
  };

  // --- small helpers ---
  function genResId(s){ return 'r' + (s.nextResId++ ) + '_' + s.id; }
  function stackSample(){ try{ const e = new Error(); return e.stack ? e.stack.split('\n').slice(2,6).join('\n') : ''; }catch(e){ return ''; } }

  // --- WRAP setTimeout / setInterval / clearTimeout / clearInterval ---
  (function wrapTimers(){
    try{
      const nativeSetTimeout = window.setTimeout;
      const nativeSetInterval = window.setInterval;
      const nativeClearTimeout = window.clearTimeout;
      const nativeClearInterval = window.clearInterval;

      window.setTimeout = function(fn, delay, ...args){
        const id = nativeSetTimeout(fn, delay, ...args);
        try{
          instr.timers.count++;
          instr.timers.list.push({ id, type:'timeout', delay, createdAt: nowISO(), stack: stackSample() });
        }catch(e){}
        return id;
      };
      window.setInterval = function(fn, interval, ...args){
        const id = nativeSetInterval(fn, interval, ...args);
        try{
          instr.timers.count++;
          instr.timers.list.push({ id, type:'interval', delay: interval, createdAt: nowISO(), stack: stackSample() });
        }catch(e){}
        return id;
      };
      window.clearTimeout = function(id){ try{
        nativeClearTimeout(id);
        const i = instr.timers.list.findIndex(x => x.id === id);
        if (i !== -1){ instr.timers.list.splice(i,1); instr.timers.count = Math.max(0, instr.timers.count-1); }
      }catch(e){} };
      window.clearInterval = function(id){ try{
        nativeClearInterval(id);
        const i = instr.timers.list.findIndex(x => x.id === id);
        if (i !== -1){ instr.timers.list.splice(i,1); instr.timers.count = Math.max(0, instr.timers.count-1); }
      }catch(e){} };
      instr.manualNotes.push('Timer wrap installed');
    }catch(e){}
  })();

  // --- WRAP addEventListener/removeEventListener to count listeners ---
  (function wrapEventTarget(){
    try{
      const ETProto = (typeof EventTarget !== 'undefined') ? EventTarget.prototype : null;
      if (!ETProto) return;
      const origAdd = ETProto.addEventListener;
      const origRemove = ETProto.removeEventListener;
      ETProto.addEventListener = function(type, listener, opts){
        try{
          const map = instr.listeners.perNode;
          let rec = map.get(this);
          if (!rec) { rec = { total:0, byType: {} , sampleStacks: [] }; map.set(this, rec); }
          rec.total = (rec.total||0) + 1;
          rec.byType[type] = (rec.byType[type]||0) + 1;
          if (rec.sampleStacks.length < 3) rec.sampleStacks.push({ type, stack: stackSample(), at: nowISO() });
          instr.listeners.total++;
          if (instr.listeners.sampleStacks.length < 20) instr.listeners.sampleStacks.push({ type, stack: stackSample(), target: (this && this.tagName) ? (this.tagName + (this.id ? ('#'+this.id) : '')) : String(this).slice(0,60) });
        }catch(e){}
        return origAdd.call(this, type, listener, opts);
      };
      ETProto.removeEventListener = function(type, listener, opts){
        try{
          const map = instr.listeners.perNode;
          const rec = map.get(this);
          if (rec){
            rec.total = Math.max(0, (rec.total||0)-1);
            rec.byType[type] = Math.max(0, (rec.byType[type]||0)-1);
            instr.listeners.total = Math.max(0, instr.listeners.total-1);
          }
        }catch(e){}
        return origRemove.call(this, type, listener, opts);
      };
      instr.manualNotes.push('EventTarget add/remove wrapped');
    }catch(e){}
  })();

  // --- Track created nodes via document.createElement (helps detect detached nodes creados dinámicamente) ---
  (function wrapCreateElement(){
    try{
      const origCreate = Document.prototype.createElement;
      Document.prototype.createElement = function(tagName, options){
        const el = origCreate.call(this, tagName, options);
        try{
          instr.createdNodes.add(el);
          instr.createdNodesListCount++;
        }catch(e){}
        return el;
      };
      instr.manualNotes.push('Document.createElement wrapped');
    }catch(e){}
  })();

  // --- Canvas / Offscreen wrap (tomado del original, mejorando bookkeeping) ---
  (function installCanvasWrap(){
    try{
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attrs){
        const ctx = orig.call(this, type, attrs);
        try{
          const t = (type||'').toString().toLowerCase();
          if (t.includes('webgl')) wrapGLContext(ctx);
          instr.canvases.add(this);
        }catch(e){}
        return ctx;
      };

      if (typeof OffscreenCanvas !== 'undefined'){
        const origOff = OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext = function(type, attrs){
          const ctx = origOff.call(this, type, attrs);
          try{
            const t = (type||'').toString().toLowerCase();
            if (t.includes('webgl')) wrapGLContext(ctx);
            if (this.width && this.height) instr.offscreenBytes += (this.width * this.height * BYTES_PER_PIXEL);
          }catch(e){}
          return ctx;
        };
      }

      // try existing canvases
      try{
        const list = document.getElementsByTagName('canvas');
        for (let c of list){
          try{ instr.canvases.add(c); const gl = c.getContext('webgl')||c.getContext('webgl2')||c.getContext('experimental-webgl'); if (gl) wrapGLContext(gl); }catch(e){}
        }
      }catch(e){}
    }catch(e){}
  })();

  // --- GL wrapping (mejorado como en original) ---
  function wrapGLContext(gl){
    if (!gl) return;
    try{
      const s = ensureGLState(gl);
      if (s._wrapped) return gl;
      s._wrapped = true;

      // save originals
      const origCreateTexture = gl.createTexture?.bind(gl);
      const origDeleteTexture = gl.deleteTexture?.bind(gl);
      const origBindTexture = gl.bindTexture?.bind(gl);
      const origCreateBuffer = gl.createBuffer?.bind(gl);
      const origDeleteBuffer = gl.deleteBuffer?.bind(gl);
      const origBindBuffer = gl.bindBuffer?.bind(gl);
      const origBufferData = gl.bufferData?.bind(gl);
      const origTexImage2D = gl.texImage2D?.bind(gl);
      const origTexSubImage2D = gl.texSubImage2D?.bind(gl);
      const origCopyTexImage2D = gl.copyTexImage2D?.bind(gl);
      const origCreateFramebuffer = gl.createFramebuffer?.bind(gl);
      const origBindFramebuffer = gl.bindFramebuffer?.bind(gl);
      const origFramebufferTexture2D = gl.framebufferTexture2D?.bind(gl);
      const origCreateRenderbuffer = gl.createRenderbuffer?.bind(gl);
      const origBindRenderbuffer = gl.bindRenderbuffer?.bind(gl);
      const origRenderbufferStorage = gl.renderbufferStorage?.bind(gl);
      const origDeleteFramebuffer = gl.deleteFramebuffer?.bind(gl);
      const origDeleteRenderbuffer = gl.deleteRenderbuffer?.bind(gl);

      function estimateBytesFromTexArgs(args){
        try{
          if (typeof args[3] === 'number' && typeof args[4] === 'number'){
            return args[3] * args[4] * BYTES_PER_PIXEL;
          }
          const maybeImage = args[args.length-1];
          if (maybeImage){
            if (maybeImage.width && maybeImage.height) return maybeImage.width * maybeImage.height * BYTES_PER_PIXEL;
            if (maybeImage.naturalWidth && maybeImage.naturalHeight) return maybeImage.naturalWidth * maybeImage.naturalHeight * BYTES_PER_PIXEL;
            if (maybeImage.byteLength) return maybeImage.byteLength;
          }
        }catch(e){}
        return 0;
      }

      if (origCreateTexture){
        gl.createTexture = function(){
          const tex = origCreateTexture();
          try{
            const id = genResId(s);
            s.textures.set(tex, { id, bytes:0, width:0, height:0, lastUpdate: Date.now() });
          }catch(e){}
          return tex;
        };
      }

      if (origDeleteTexture){
        gl.deleteTexture = function(tex){
          try{ if (s.textures.has(tex)) s.textures.delete(tex); }catch(e){}
          return origDeleteTexture(tex);
        };
      }

      if (origBindTexture){
        gl.bindTexture = function(target, tex){
          try{ s.boundTexture.set(target, tex); }catch(e){}
          return origBindTexture(target, tex);
        };
      }

      if (origCreateBuffer){
        gl.createBuffer = function(){
          const buf = origCreateBuffer();
          try{ const id = genResId(s); s.buffers.set(buf, { id, size:0 }); }catch(e){}
          return buf;
        };
      }

      if (origDeleteBuffer){
        gl.deleteBuffer = function(buf){
          try{ if (s.buffers.has(buf)) s.buffers.delete(buf); }catch(e){}
          return origDeleteBuffer(buf);
        };
      }

      if (origBindBuffer){
        gl.bindBuffer = function(target, buf){
          try{ s.boundBuffer.set(target, buf); }catch(e){}
          return origBindBuffer(target, buf);
        };
      }

      if (origBufferData){
        gl.bufferData = function(target, data, usage){
          try{
            let size = 0;
            if (typeof data === 'number') size = data;
            else if (data && data.byteLength) size = data.byteLength;
            else if (Array.isArray(data)) size = data.length * 4;
            const bound = s.boundBuffer.get(target);
            if (bound && s.buffers.has(bound)){
              const meta = s.buffers.get(bound);
              meta.size = size;
              s.buffers.set(bound, meta);
            }
          }catch(e){}
          return origBufferData(target, data, usage);
        };
      }

      if (origTexImage2D){
        gl.texImage2D = function(){
          try{
            const bytes = estimateBytesFromTexArgs(arguments);
            const target = arguments[0];
            const bound = s.boundTexture.get(target);
            if (bound && s.textures.has(bound)){
              const meta = s.textures.get(bound);
              try{
                const w = (typeof arguments[3] === 'number') ? arguments[3] : (arguments[arguments.length-1] && (arguments[arguments.length-1].width || arguments[arguments.length-1].naturalWidth) || 0);
                const h = (typeof arguments[4] === 'number') ? arguments[4] : (arguments[arguments.length-1] && (arguments[arguments.length-1].height || arguments[arguments.length-1].naturalHeight) || 0);
                if (w && h){ meta.width = w; meta.height = h; }
              }catch(e){}
              meta.bytes = bytes || meta.bytes;
              meta.lastUpdate = Date.now();
              s.textures.set(bound, meta);
            } else {
              const id = genResId(s);
              const meta = { id, bytes, width:0, height:0, lastUpdate: Date.now() };
              s.pseudoTextures.set(id, meta);
            }
          }catch(e){}
          return origTexImage2D(...arguments);
        };
      }

      if (origTexSubImage2D){
        gl.texSubImage2D = function(){
          try{
            const bytes = estimateBytesFromTexArgs(arguments);
            const target = arguments[0];
            const bound = s.boundTexture.get(target);
            if (bound && s.textures.has(bound)){
              const meta = s.textures.get(bound);
              meta.bytes = Math.max(meta.bytes || 0, bytes || meta.bytes);
              meta.lastUpdate = Date.now();
              s.textures.set(bound, meta);
            } else {
              // ignore
            }
          }catch(e){}
          return origTexSubImage2D(...arguments);
        };
      }

      if (origCopyTexImage2D){
        gl.copyTexImage2D = function(){
          try{
            if (arguments.length >= 7 && typeof arguments[5] === 'number' && typeof arguments[6] === 'number'){
              const w = arguments[5], h = arguments[6];
              const bytes = w*h*BYTES_PER_PIXEL;
              const target = arguments[0];
              const bound = s.boundTexture.get(target);
              if (bound && s.textures.has(bound)){
                const meta = s.textures.get(bound);
                meta.bytes = bytes;
                meta.width = w;
                meta.height = h;
                meta.lastUpdate = Date.now();
                s.textures.set(bound, meta);
              } else {
                const id = genResId(s);
                const meta = { id, bytes, width:w, height:h, lastUpdate: Date.now() };
                s.pseudoTextures.set(id, meta);
              }
            }
          }catch(e){}
          return origCopyTexImage2D(...arguments);
        };
      }

      if (origCreateFramebuffer){
        gl.createFramebuffer = function(){
          const fb = origCreateFramebuffer();
          try{ const id = genResId(s); s.framebuffers.set(fb, { id, attachments: [] }); }catch(e){}
          return fb;
        };
      }
      if (origBindFramebuffer){
        gl.bindFramebuffer = function(target, fb){
          try{ s._boundFramebuffer = fb; }catch(e){}
          return origBindFramebuffer(target, fb);
        };
      }
      if (origFramebufferTexture2D){
        gl.framebufferTexture2D = function(target, attachment, textarget, texture, level){
          try{
            const fb = s._boundFramebuffer || null;
            if (fb && s.framebuffers.has(fb)){
              const fbMeta = s.framebuffers.get(fb);
              let texMeta = null;
              if (texture && s.textures.has(texture)) texMeta = s.textures.get(texture);
              const attach = { attachment, texMeta: texMeta || null, bytes: texMeta?texMeta.bytes:0 };
              fbMeta.attachments.push(attach);
              s.framebuffers.set(fb, fbMeta);
            }
          }catch(e){}
          return origFramebufferTexture2D(...arguments);
        };
      }

      if (origCreateRenderbuffer){
        gl.createRenderbuffer = function(){
          const rb = origCreateRenderbuffer();
          try{ const id = genResId(s); s.renderbuffers.set(rb, { id, width:0, height:0, bytes:0 }); }catch(e){}
          return rb;
        };
      }
      if (origBindRenderbuffer){
        gl.bindRenderbuffer = function(target, rb){
          try{ s._boundRenderbuffer = rb; }catch(e){}
          return origBindRenderbuffer(target, rb);
        };
      }
      if (origRenderbufferStorage){
        gl.renderbufferStorage = function(target, internalformat, width, height){
          try{
            const rb = s._boundRenderbuffer;
            if (rb && s.renderbuffers.has(rb)){
              const meta = s.renderbuffers.get(rb);
              meta.width = width; meta.height = height; meta.bytes = width * height * BYTES_PER_PIXEL;
              s.renderbuffers.set(rb, meta);
            }
          }catch(e){}
          return origRenderbufferStorage(...arguments);
        };
      }

      if (origDeleteFramebuffer){
        gl.deleteFramebuffer = function(fb){
          try{ if (s.framebuffers.has(fb)) s.framebuffers.delete(fb); }catch(e){}
          return origDeleteFramebuffer(fb);
        };
      }

      if (origDeleteRenderbuffer){
        gl.deleteRenderbuffer = function(rb){
          try{ if (s.renderbuffers.has(rb)) s.renderbuffers.delete(rb); }catch(e){}
          return origDeleteRenderbuffer(rb);
        };
      }

    }catch(e){
      console.warn('wrapGLContext failed', e);
    }
    return gl;
  }

  function ensureGLState(gl){
    let s = instr.glState.get(gl);
    if (!s){
      s = {
        id: instr.ctxIdCounter++,
        boundTexture: new Map(),
        boundBuffer: new Map(),
        textures: new Map(),
        pseudoTextures: new Map(),
        buffers: new Map(),
        framebuffers: new Map(),
        renderbuffers: new Map(),
        nextResId: 1,
        _wrapped: false
      };
      instr.glState.set(gl, s);
      instr.glContexts.add(gl);
    }
    return s;
  }

  // --- compute canvas bytes now (igual) ---
  function computeCanvasBytesNow(){
    try{
      let total = 0;
      for (let c of instr.canvases){
        try{
          const w = c.width || c.clientWidth || 0;
          const h = c.height || c.clientHeight || 0;
          if (w && h) total += w * h * BYTES_PER_PIXEL;
        }catch(e){}
      }
      instr.canvasBytes = total;
      return total;
    }catch(e){ return 0; }
  }

  // --- Image wrapping (extendiendo original para buscar data-URIs) ---
  (function wrapImageConstructor(){
    try{
      const NativeImage = window.Image;
      function WrappedImage(w,h){
        const img = new NativeImage(w,h);
        try{
          const id = instr.imageIdCounter++;
          instr.imagesTracked.add(img);
          const rec = { id, width: 0, height: 0, bytes: 0, src: '' };
          instr.imageList.set(id, rec);
          img.__mr_id = id;
          img.addEventListener('load', function(){
            try{
              const iw = img.naturalWidth || img.width || 0;
              const ih = img.naturalHeight || img.height || 0;
              rec.width = iw; rec.height = ih; rec.bytes = iw * ih * BYTES_PER_PIXEL; rec.src = img.src || rec.src;
              instr.imageList.set(id, rec);
              // dataURI detection
              if (rec.src && rec.src.startsWith('data:')){
                instr.dataUriImages.push({ src: rec.src.slice(0,200), bytesEstimate: rec.bytes, id });
              }
            }catch(e){}
          });
        }catch(e){}
        return img;
      }
      WrappedImage.prototype = NativeImage.prototype;
      window.Image = WrappedImage;
      try{
        const imgs = document.images || [];
        for (let i=0;i<imgs.length;i++){
          const el = imgs[i];
          if (!el.__mr_id){
            const id = instr.imageIdCounter++;
            instr.imagesTracked.add(el);
            const iw = el.naturalWidth || el.width || 0;
            const ih = el.naturalHeight || el.height || 0;
            const src = el.currentSrc || el.src || '';
            instr.imageList.set(id, { id, width: iw, height: ih, bytes: iw*ih*BYTES_PER_PIXEL, src });
            el.__mr_id = id;
            if (src && src.startsWith && src.startsWith('data:')) instr.dataUriImages.push({ src: src.slice(0,200), bytesEstimate: iw*ih*BYTES_PER_PIXEL, id });
          }
        }
      }catch(e){}
    }catch(e){}
  })();

  // --- Audio decode tracking (igual) ---
  (function wrapAudioDecoding(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const proto = AC.prototype;
      if (proto._mr_wrapped) return;
      proto._mr_wrapped = true;
      const origDecode = proto.decodeAudioData;
      if (origDecode){
        proto.decodeAudioData = function(arrayBuffer, success, error){
          try{
            const p = origDecode.call(this, arrayBuffer, function(buffer){
              try{ registerAudioBuffer(buffer, 'decodeAudioData'); }catch(e){}
              if (typeof success === 'function') success(buffer);
            }, error);
            return p;
          }catch(e){
            return origDecode.call(this, arrayBuffer, success, error);
          }
        };
      }
      const origCreateBuffer = proto.createBuffer;
      if (origCreateBuffer){
        proto.createBuffer = function(numOfChannels, length, sampleRate){
          const buf = origCreateBuffer.call(this, numOfChannels, length, sampleRate);
          try{ registerAudioBuffer(buf, 'createBuffer'); }catch(e){}
          return buf;
        };
      }
    }catch(e){}
  })();

  function registerAudioBuffer(buffer, reason){
    try{
      if (!buffer) return;
      if (instr.audioBuffers.has(buffer)) return;
      const len = buffer.length || (buffer.duration && buffer.duration * (buffer.sampleRate || AUDIO_SAMPLE_RATE)) || 0;
      const channels = buffer.numberOfChannels || AUDIO_CHANNELS;
      const bytes = Math.round(len * channels * 4);
      instr.audioBuffers.set(buffer, bytes);
      instr.audioBufferList.push({ bytes, duration: buffer.duration || (len/(buffer.sampleRate||AUDIO_SAMPLE_RATE)), reason, createdAt: nowISO() });
    }catch(e){}
  }

  // --- WebSocket wrap (igual pero limpio) ---
  (function wrapWebSocket(){
    try{
      const NativeWS = window.WebSocket;
      if (!NativeWS) return;
      function WrappedWS(url, protocols){
        const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
        try{
          instr.wsSockets.add(ws);
          ws.__mr_sent = 0; ws.__mr_recv = 0;
          const origSend = ws.send;
          ws.send = function(data){
            try{
              let size = 0;
              if (typeof data === 'string') size = (new TextEncoder()).encode(data).length;
              else if (data instanceof ArrayBuffer) size = data.byteLength;
              else if (data && data.byteLength) size = data.byteLength;
              else if (data instanceof Blob) size = data.size || 0;
              ws.__mr_sent += size; instr.wsStats.sent += size;
            }catch(e){}
            return origSend.call(this, data);
          };
          ws.addEventListener('message', evt => {
            try{
              const d = evt.data;
              let size = 0;
              if (typeof d === 'string') size = (new TextEncoder()).encode(d).length;
              else if (d instanceof ArrayBuffer) size = d.byteLength;
              else if (d && d.size) size = d.size || 0;
              ws.__mr_recv += size; instr.wsStats.recv += size;
            }catch(e){}
          });
          const origClose = ws.close;
          ws.close = function(){ instr.wsSockets.delete(ws); return origClose.apply(this, arguments); };
        }catch(e){}
        return ws;
      }
      WrappedWS.prototype = NativeWS.prototype;
      window.WebSocket = WrappedWS;
      instr.manualNotes.push('WebSocket wrapped');
    }catch(e){}
  })();

  // --- Worker wrap (igual) ---
  (function wrapWorker(){
    try{
      const NativeWorker = window.Worker;
      if (!NativeWorker) return;
      function WrappedWorker(scriptUrl, options){
        const w = new NativeWorker(scriptUrl, options);
        try{
          instr.workers.add(w);
          const origPost = w.postMessage;
          w.postMessage = function(msg, transfer){
            try{
              let size = 0;
              if (typeof msg === 'string') size = (new TextEncoder()).encode(msg).length;
              else if (msg instanceof ArrayBuffer) size = msg.byteLength;
              else if (msg && msg.byteLength) size = msg.byteLength;
              if (transfer && Array.isArray(transfer)){ for (const t of transfer){ if (t && t.byteLength) size += t.byteLength; } }
              instr.workerMessageBytes += size;
            }catch(e){}
            return origPost.apply(this, arguments);
          };
          const origTerminate = w.terminate;
          w.terminate = function(){ instr.workers.delete(w); return origTerminate.apply(this, arguments); };
        }catch(e){}
        return w;
      }
      WrappedWorker.prototype = NativeWorker.prototype;
      window.Worker = WrappedWorker;
      instr.manualNotes.push('Worker wrapped');
    }catch(e){}
  })();

  // --- Aggregate GL totals safely (igual) ---
  function aggregateGLTotals(){
    let totalTexBytes = 0, totalBufBytes = 0, texCount = 0, bufCount = 0, fbBytes = 0, rbBytes = 0;
    try{
      for (const gl of instr.glContexts){
        try{
          const s = instr.glState.get(gl);
          if (!s) continue;
          for (let meta of s.textures.values()){
            totalTexBytes += meta.bytes || 0; texCount++;
          }
          for (let meta of s.pseudoTextures.values()){
            totalTexBytes += meta.bytes || 0; texCount++;
          }
          for (let meta of s.buffers.values()){
            totalBufBytes += meta.size || 0; bufCount++;
          }
          for (let fbMeta of s.framebuffers.values()){
            for (let att of fbMeta.attachments) fbBytes += att.bytes || 0;
          }
          for (let rbMeta of s.renderbuffers.values()){
            rbBytes += rbMeta.bytes || 0;
          }
        }catch(e){}
      }
    }catch(e){}
    return { texturesBytes: totalTexBytes, bufferBytes: totalBufBytes, textureCount: texCount, bufferCount: bufCount, framebufferBytes: fbBytes, renderbufferBytes: rbBytes };
  }

  // --- PHASER helpers (igual con defensas) ---
  function phaserEstimateTextures(game){
    try{
      const texturesInfo = []; let totalBytes = 0; let totalFrames = 0;
      const texturesObj = safe(()=> game.textures && (game.textures.list || game.textures.entries || game.textures._textures || Object.values(game.textures._textureCache || {})), {});
      const texturesArr = Array.isArray(texturesObj) ? texturesObj : (typeof texturesObj === 'object' ? Object.values(texturesObj) : []);
      for (const t of texturesArr){
        try{
          let w=0,h=0;
          if (t && t.source && t.source[0]) { const s = t.source[0]; w = s.width || s.naturalWidth || (s.image && s.image.width) || 0; h = s.height || s.naturalHeight || (s.image && s.image.height) || 0; }
          if ((!w||!h) && t && t.frames){ for (const k in t.frames){ const f = t.frames[k]; if (f && f.frame){ w = Math.max(w, f.frame.width||0); h = Math.max(h, f.frame.height||0); totalFrames++; } } }
          if ((!w||!h) && t && (t.width || t.height)){ w = t.width || w; h = t.height || h; }
          if ((!w||!h) && t && typeof t.getSourceImage === 'function'){ const img = t.getSourceImage(); if (img) { w = img.width || img.naturalWidth || w; h = img.height || img.naturalHeight || h; } }
          const bytes = (w && h) ? (w*h*BYTES_PER_PIXEL) : 0;
          totalBytes += bytes;
          texturesInfo.push({ key: (t.key||t.texture||t.name||'unknown'), width:w, height:h, bytes });
        }catch(e){}
      }
      return { texturesInfo, totalBytes, totalTextures: texturesInfo.length, totalFrames };
    }catch(e){ return { texturesInfo:[], totalBytes:0, totalTextures:0, totalFrames:0 }; }
  }

  function phaserEstimateAudio(game){
    try{
      let totalBytes = 0; const items = [];
      if (game && game.sound && game.sound.sounds && Array.isArray(game.sound.sounds)){
        for (const s of game.sound.sounds){
          try{
            const buffer = s.buffer || (s.source && s.source.buffer) || (s.audio && s.audio.buffer);
            if (buffer && buffer.length && buffer.sampleRate){
              const bytes = buffer.length * (buffer.numberOfChannels || AUDIO_CHANNELS) * 4;
              totalBytes += bytes;
              items.push({ key: s.key, duration: buffer.duration || (buffer.length / buffer.sampleRate), bytes });
            }
          }catch(e){}
        }
      }
      for (const b of instr.audioBufferList){ totalBytes += b.bytes; items.push({ key: b.reason || 'AudioBuffer', duration: b.duration || 0, bytes: b.bytes }); }
      return { totalBytes, items };
    }catch(e){ return { totalBytes:0, items:[] }; }
  }

  function phaserEstimateCache(game){
    try{
      const cache = game.cache || game.cacheManager || null; const info = {};
      if (!cache) return info;
      const knownStores = ['image','audio','atlas','tilemap','texture','binary','bitmapFont','video','json'];
      for (const store of knownStores){
        try{
          const storeObj = cache[store] || (cache[store + 'Cache']) || (cache.has && cache.has(store) ? cache.get(store) : null);
          if (!storeObj) continue;
          let count = 0;
          if (storeObj.entries) count = Object.keys(storeObj.entries).length;
          else if (storeObj.list) count = Object.keys(storeObj.list).length;
          else if (storeObj.size !== undefined) count = storeObj.size;
          else if (typeof storeObj.length === 'number') count = storeObj.length;
          else count = 0;
          info[store] = { count };
        }catch(e){}
      }
      return info;
    }catch(e){ return {}; }
  }

  function phaserCountGameObjects(game){
    try{
      const scenes = (game.scene && game.scene.scenes) ? game.scene.scenes : [];
      let total = 0;
      for (const s of scenes){
        try{ if (s && s.sys && s.children && Array.isArray(s.children.list)) total += s.children.list.length; else if (s && s.children && s.children.length !== undefined) total += s.children.length; }catch(e){}
      }
      return total;
    }catch(e){ return 0; }
  }

  function phaserEstimatePhysics(game){
    try{
      const res = { arcadeBodies:0, matterBodies:0, otherBodies:0, estimatedBytes:0 };
      try{
        if (game.physics && game.physics.world){
          const world = game.physics.world;
          if (world.bodies && world.bodies.entries) {
            res.arcadeBodies = world.bodies.entries.length || 0;
            res.estimatedBytes += res.arcadeBodies * DEFAULT_BODY_BYTES;
          } else if (world.getBodies && typeof world.getBodies === 'function'){
            const bodies = world.getBodies();
            res.arcadeBodies = bodies ? bodies.length : 0;
            res.estimatedBytes += res.arcadeBodies * DEFAULT_BODY_BYTES;
          }
          if (world.engine && world.engine.world && world.engine.world.bodies){
            const mb = world.engine.world.bodies.length || 0;
            res.matterBodies = mb;
            res.estimatedBytes += mb * (DEFAULT_BODY_BYTES * 2);
          }
        }
      }catch(e){}
      return res;
    }catch(e){ return { arcadeBodies:0, matterBodies:0, estimatedBytes:0 }; }
  }

  function phaserEstimateParticles(game){
    try{
      let totalEmitters = 0, totalParticles = 0, estBytes = 0;
      const scenes = (game.scene && game.scene.scenes) ? game.scene.scenes : [];
      for (const s of scenes){
        try{
          if (s.sys && s.sys.particles && s.sys.particles.emitters){
            const emitters = s.sys.particles.emitters.list || [];
            totalEmitters += emitters.length;
            for (const e of emitters){
              const qty = (e && e.quantity) ? e.quantity : (e && e.maxParticles) ? e.maxParticles : 0;
              totalParticles += qty;
              estBytes += qty * 16;
            }
          }
        }catch(e){}
      }
      return { totalEmitters, totalParticles, estBytes };
    }catch(e){ return { totalEmitters:0, totalParticles:0, estBytes:0 }; }
  }

  // --- Extra DOM/image inspections ---
  function inspectDOMImagesAndStyles(){
    let dataUriCount = 0, largeCssImages = [];
    try{
      // images in DOM
      const imgs = document.images || [];
      for (let i=0;i<imgs.length;i++){
        const el = imgs[i];
        try{
          const src = el.currentSrc || el.src || '';
          if (src && src.startsWith && src.startsWith('data:')){
            dataUriCount++;
            instr.dataUriImages.push({ src: src.slice(0,200), estimatedBytes: ((el.naturalWidth||el.width||0)*(el.naturalHeight||el.height||0)*BYTES_PER_PIXEL) || 0 });
          }
        }catch(e){}
      }
      // css background-image search (expensive => limit nodes)
      const all = document.getElementsByTagName('*');
      const limit = Math.min(4000, all.length);
      for (let i=0;i<limit;i++){
        try{
          const s = window.getComputedStyle(all[i]);
          if (!s) continue;
          const bg = s.getPropertyValue('background-image') || '';
          if (bg && (bg.indexOf('url(') !== -1)){
            const url = bg.match(/url\(["']?(.*?)["']?\)/);
            if (url && url[1] && url[1].startsWith('data:')) {
              largeCssImages.push({ el: all[i].tagName + (all[i].id ? ('#'+all[i].id) : ''), snippet: url[1].slice(0,120) });
            }
          }
        }catch(e){}
      }
    }catch(e){}
    return { dataUriCount, largeCssImages, dataUriSamples: instr.dataUriImages.slice(0,10) };
  }

  // --- Build snapshot (ampliado) ---
  function buildSnapshot(game){
    const heap = (performance && performance.memory) ? { limit: performance.memory.jsHeapSizeLimit, total: performance.memory.totalJSHeapSize, used: performance.memory.usedJSHeapSize } : null;
    const phTextures = game ? phaserEstimateTextures(game) : { totalBytes:0, totalTextures:0, texturesInfo:[] };
    const phAudio = game ? phaserEstimateAudio(game) : { totalBytes:0, items:[] };
    const cache = game ? phaserEstimateCache(game) : {};
    const dom = { nodes: document.getElementsByTagName('*').length, bytes: document.getElementsByTagName('*').length * BYTES_PER_NODE };
    const gos = game ? phaserCountGameObjects(game) : 0;
    const physics = game ? phaserEstimatePhysics(game) : { estimatedBytes:0 };
    const particles = game ? phaserEstimateParticles(game) : { estBytes:0 };

    const canvasNow = computeCanvasBytesNow();
    const offscreen = instr.offscreenBytes || 0;
    const glTotals = aggregateGLTotals();

    // Heuristic clamp for absurd values
    let glAdjusted = { ...glTotals, suspect: false, adjustedTexturesBytes: glTotals.texturesBytes };
    if (glTotals.texturesBytes > (10 * GB)){
      glAdjusted.suspect = true;
      const fallback = phTextures.totalBytes || 0;
      const safeEstimate = Math.max(fallback, Math.min(glTotals.texturesBytes, fallback * 8 || (100 * 1024 * 1024)));
      glAdjusted.adjustedTexturesBytes = safeEstimate || glTotals.texturesBytes;
      instr.manualNotes.push(`GL totals suspicious (${prettyBytes(glTotals.texturesBytes)}). Applied heuristic adjustedTexturesBytes=${prettyBytes(glAdjusted.adjustedTexturesBytes)}`);
    }

    // images outside Phaser
    let imagesCount = 0, imagesBytes = 0;
    try{
      for (let v of instr.imageList.values()){ imagesCount++; imagesBytes += (v.bytes||0); }
      const domImages = document.images || [];
      for (let i=0;i<domImages.length;i++){
        const el = domImages[i];
        if (!el.__mr_id){
          const w = el.naturalWidth||el.width||0; const h = el.naturalHeight||el.height||0;
          imagesCount++; imagesBytes += (w*h*BYTES_PER_PIXEL);
        }
      }
    }catch(e){}

    const audioTracked = phAudio.totalBytes;
    const workerBytes = instr.workerMessageBytes || 0;
    const wsStats = instr.wsStats;

    const jsUsed = heap ? heap.used : 0;
    const texturesEstimated = phTextures.totalBytes || 0;
    const audioEstimated = audioTracked || 0;
    const domEstimated = dom.bytes || 0;
    const imagesEstimated = imagesBytes || 0;
    const physicsEstimated = physics.estimatedBytes || 0;
    const particlesEstimated = particles.estBytes || 0;

    const estimableSum = jsUsed + texturesEstimated + audioEstimated + domEstimated + imagesEstimated + physicsEstimated + particlesEstimated;
    const withGPU = estimableSum + (glAdjusted.adjustedTexturesBytes||0) + (glTotals.bufferBytes||0) + (glTotals.framebufferBytes||0) + (glTotals.renderbufferBytes||0) + canvasNow + offscreen;

    const domImagesAndCss = inspectDOMImagesAndStyles();

    // detached nodes heuristics (nodes created via createElement but not connected)
    let detachedCreated = 0;
    try{
      // iterate a sample of created nodes (WeakSet can't be enumerated) -> use createdNodesListCount as rough metric
      // can't iterate WeakSet, so we expose count; also check document.querySelectorAll for nodes not connected created recently via attribute
      // fallback: count nodes with no isConnected (expensive); limit to 5000
      let disconnected = 0;
      try{
        const all = document.getElementsByTagName('*');
        const limit = Math.min(5000, all.length);
        for (let i=0;i<limit;i++){ if (!all[i].isConnected) disconnected++; }
      }catch(e){}
      detachedCreated = disconnected;
    }catch(e){}

    return {
      timestamp: nowISO(),
      heap,
      phaserTextures: phTextures,
      phaserAudio: phAudio,
      phaserCache: cache,
      dom,
      images: { count: imagesCount, bytes: imagesBytes, detailsCount: instr.imageList.size, dataUriSamples: instr.dataUriImages.slice(0,10) },
      canvases: { pixelBytes: canvasNow, offscreenBytes: offscreen },
      glIntercepted: glTotals,
      glAdjusted,
      websocket: { sockets: instr.wsSockets.size, bytesSent: wsStats.sent, bytesRecv: wsStats.recv },
      workers: { count: instr.workers.size, messageBytes: workerBytes },
      physics: physics,
      particles: particles,
      gameObjects: { total: gos },
      timers: { count: instr.timers.count, listSample: instr.timers.list.slice(0,10) },
      listeners: { total: instr.listeners.total, sample: instr.listeners.sampleStacks.slice(0,10) },
      createdNodes: { estimateCreated: instr.createdNodesListCount, detachedSampleCount: detachedCreated },
      domImagesAndCss: domImagesAndCss,
      estimableTotalBytes: estimableSum,
      estimableTotalMB: prettyBytes(estimableSum),
      estimableWithGPU_Bytes: withGPU,
      estimableWithGPU_MB: prettyBytes(withGPU),
      notes: [
        "FULL-coverage attempt with improved dedup + heuristic clamp for absurd GL totals.",
        "Added timers/listeners/created-node heuristics and data-uri detection.",
        ...instr.manualNotes
      ],
      raw: {
        instrSnapshot: {
          wsStats: instr.wsStats,
          audioBuffers: instr.audioBufferList.length,
          trackedImages: instr.imageList.size,
          timersCount: instr.timers.count,
          listenersTotal: instr.listeners.total,
          workersCount: instr.workers.size
        }
      }
    };
  }

  // --- Console pretty print (extendido) ---
  function consoleReport(snapshot){
    try{
      const h = snapshot.heap;
      console.groupCollapsed(`=== Phaser Memory Report V3.1-improved (${(new Date()).toLocaleTimeString()}) ===`);
      if (h) console.log('JS Heap (limit / total / used):', prettyBytes(h.limit||0), '/', prettyBytes(h.total||0), '/', prettyBytes(h.used||0));
      else console.log('JS Heap: performance.memory not supported');

      console.log(`Phaser textures: ${snapshot.phaserTextures.totalTextures} textures · ≈ ${prettyBytes(snapshot.phaserTextures.totalBytes)}`);
      if (snapshot.phaserTextures.texturesInfo && snapshot.phaserTextures.texturesInfo.length) console.table(snapshot.phaserTextures.texturesInfo.slice(0,200).map(t => ({ key:t.key,w:t.width,h:t.height,bytes:Math.round(t.bytes) })));

      console.log(`Phaser audio (estimated): ≈ ${prettyBytes(snapshot.phaserAudio.totalBytes)} · items ${snapshot.phaserAudio.items.length}`);
      if (snapshot.phaserAudio.items.length) console.table(snapshot.phaserAudio.items.map(i => ({ key:i.key||i.src||i.tag, duration:i.duration||0, bytes: Math.round(i.bytes||0) })));

      console.log('Images outside Phaser:', snapshot.images.count, '≈', prettyBytes(snapshot.images.bytes), ' · data-uri examples:', (snapshot.images.dataUriSamples || []).length);
      console.log('Canvas pixel buffers (DOM):', prettyBytes(snapshot.canvases.pixelBytes), ' · Offscreen:', prettyBytes(snapshot.canvases.offscreenBytes));

      console.log('GL intercepted uploads (raw): Textures:', prettyBytes(snapshot.glIntercepted.texturesBytes), 'Buffers:', prettyBytes(snapshot.glIntercepted.bufferBytes));
      if (snapshot.glAdjusted && snapshot.glAdjusted.suspect){
        console.warn('GL intercepted totals flagged as SUSPECT. adjustedTexturesBytes =', prettyBytes(snapshot.glAdjusted.adjustedTexturesBytes));
      }
      console.log('GL adjusted (used in estimableWithGPU):', prettyBytes(snapshot.glAdjusted.adjustedTexturesBytes || snapshot.glIntercepted.texturesBytes));

      console.log('WebSocket:', snapshot.websocket.sockets, 'sockets · S:', prettyBytes(snapshot.websocket.bytesSent), 'R:', prettyBytes(snapshot.websocket.bytesRecv));
      console.log('Workers:', snapshot.workers.count, ' · worker message bytes:', prettyBytes(snapshot.workers.messageBytes));
      console.log('Physics estimated bytes:', prettyBytes(snapshot.physics.estimatedBytes), 'Particles estimated:', prettyBytes(snapshot.particles.estBytes));
      console.log('DOM nodes:', snapshot.dom.nodes, '≈', prettyBytes(snapshot.dom.bytes), ' · createdElementsEstimate:', snapshot.createdNodes.estimateCreated, ' · detachedSampleCount:', snapshot.createdNodes.detachedSampleCount);
      console.log('Event listeners (approx):', snapshot.listeners.total, ' · sample stacks (to find where added):'); if (snapshot.listeners.sample && snapshot.listeners.sample.length) console.table(snapshot.listeners.sample.map(s=>({type:s.type, target:(s.target||'n/a'), stack:s.stack.split('\n')[0]})));
      console.log('Active timers (approx):', snapshot.timers.count, ' · sample:', snapshot.timers.listSample);

      console.log('Dom inline/data-uri images found:', snapshot.domImagesAndCss.dataUriCount, ' · css data-uri examples:', snapshot.domImagesAndCss.largeCssImages.slice(0,6));
      if (snapshot.domImagesAndCss && snapshot.domImagesAndCss.dataUriSamples && snapshot.domImagesAndCss.dataUriSamples.length) console.table(snapshot.domImagesAndCss.dataUriSamples.map(d=>({ id:d.id, bytesEstimate:d.bytesEstimate, srcSnippet:d.src.substr(0,80) })));

      console.log('GameObjects (all scenes):', snapshot.gameObjects.total);

      console.log('Estimable total (JS+textures+audio+DOM+images+physics+particles):', snapshot.estimableTotalMB);
      console.log('Estimable INCLUDING intercepted GPU/canvas bytes (best-effort):', snapshot.estimableWithGPU_MB);

      if (snapshot.notes && snapshot.notes.length) { console.log('Notas:'); snapshot.notes.forEach(n => console.log(' -', n)); }
      console.groupEnd && console.groupEnd();
    }catch(e){ console.error('consoleReport error', e); }
  }

  // --- Explain snapshot: produce diagnóstico en español ---
  function explainSnapshot(snapshot){
    const lines = [];
    lines.push('--- Diagnóstico rápido (generado automáticamente) ---');
    lines.push('Timestamp: ' + snapshot.timestamp);
    // compare performance.memory vs estimableWithGPU
    const perfUsed = snapshot.heap ? snapshot.heap.used : null;
    if (perfUsed){
      lines.push(`JS Heap usado (performance.memory): ${prettyBytes(perfUsed)}.`);
    } else {
      lines.push('performance.memory no disponible: no puedo leer el JS heap directo en este navegador.');
    }

    lines.push(`Estimación sumada (JS+texturas+audio+DOM+images+physics+particles): ${snapshot.estimableTotalMB}.`);
    lines.push(`Estimación con GPU/canvas (mejor esfuerzo): ${snapshot.estimableWithGPU_MB}.`);

    // if estimableWithGPU << proceso reported (can't read process), but if heap available compare:
    if (perfUsed && snapshot.estimableWithGPU_Bytes){
      const diff = (perfUsed - snapshot.estimableWithGPU_Bytes);
      if (diff > (150 * 1024 * 1024)) {
        lines.push(`Diferencia: la memoria reportada por JS (${prettyBytes(perfUsed)}) es mayor que la estimación con GPU (${snapshot.estimableWithGPU_MB}).`);
        lines.push('Causas probables:');
        lines.push(' - Objetos JS retenidos (grandes arrays, Map/Set con muchos elementos, buffers ArrayBuffer o TypedArray).');
        lines.push(' - Recursos nativos no accesibles desde JS (WASM heap, plugins nativos o contextos WebGL/Audio no contados por la heurística).');
        lines.push(' - Detached DOM nodes (elementos creados pero no referenciados en el DOM visible).');
        lines.push(' - Listeners o timers acumulados manteniendo referencias a closures grandes.');
      } else {
        lines.push('La estimación se aproxima al JS heap reportado; probabilidad de que la mayor parte del uso sea por texturas / buffers GPU o por objetos JS grandes.');
      }
    }

    // GL suspect
    if (snapshot.glAdjusted && snapshot.glAdjusted.suspect){
      lines.push('Warning: totales GL interceptados parecen ABRUMADORES (muy grandes). He aplicado una heurística de clamp.');
      lines.push('Revisa: texturas subidas sin liberar, render targets gigantes, múltiples framebuffers, o conteo duplicado por drivers.');
    }

    // Timers/listeners
    if (snapshot.timers && snapshot.timers.count > 50){
      lines.push(`Timers activos: ${snapshot.timers.count}. Puede haber fugas si cada escena/objeto crea timers y no los limpia. Muestra de stacks (ver console.table snapshot.timers.listSample).`);
    }
    if (snapshot.listeners && snapshot.listeners.total > 500){
      lines.push(`Listeners registrados: ${snapshot.listeners.total}. Revisa llamadas a addEventListener dentro de loops o escenas que no remueven listeners en shutdown.`);
    }

    // data-URIs
    if ((snapshot.domImagesAndCss && snapshot.domImagesAndCss.dataUriCount) || (snapshot.images && snapshot.images.dataUriSamples && snapshot.images.dataUriSamples.length)){
      lines.push(`Se detectaron imágenes embebidas (data: URI) en DOM o CSS (${snapshot.domImagesAndCss.dataUriCount} + muestras). Estas pueden consumir mucha memoria si son grandes.`);
    }

    // detached nodes hint
    if (snapshot.createdNodes && snapshot.createdNodes.detachedSampleCount > 0){
      lines.push(`Se encontró un muestreo de nodos desconectados en el documento (~${snapshot.createdNodes.detachedSampleCount}). Los nodos "detached" son una fuente común de memory leaks.`);
    }

    // Workers/websockets
    if (snapshot.workers && snapshot.workers.count > 0){
      lines.push(`Workers activos: ${snapshot.workers.count}. Verifica que se terminen (worker.terminate()) cuando no sean necesarios.`);
    }
    if (snapshot.websocket && snapshot.websocket.sockets > 0){
      lines.push(`WebSockets: ${snapshot.websocket.sockets} abiertos. Mensajes enviados/recibidos (bytes): S=${prettyBytes(snapshot.websocket.bytesSent)} R=${prettyBytes(snapshot.websocket.bytesRecv)}.`);
    }

    // Actionable checklist
    lines.push('--- Acciones recomendadas (prioritarias) ---');
    lines.push('1) Ejecuta: window.PhaserMemoryReporterV3.snapshotAndExplain(window.game) y revisa las stack-samples de timers/listeners para localizar quién los crea.');
    lines.push('2) Revisa texturas y recursos en cada escena: llamar texture.destroy(true) / clear / textureManager.remove cuando desmontes escenas.');
    lines.push('3) En cada Scene.shutdown()/destroy(): limpiar timers (clearInterval/clearTimeout), listeners (removeEventListener) y audio.stop/destroy, y llamar a game.cache.remove si usas assets dinámicos.');
    lines.push('4) Evita data:URIs grandes en imágenes o CSS; usa archivos o blobs que puedas liberar.');
    lines.push('5) Para WebGL: liberación explícita de texturas/buffers si tu engine deja referencias (gl.deleteTexture, gl.deleteBuffer).');
    lines.push('6) Usa el profiler de Chrome (Memory -> Allocation instrumentation / Heap snapshot) para encontrar las mayores retenciones si la diferencia sigue siendo grande.');

    return lines.join('\n');
  }

  // --- Reporter API (mejorado) ---
  const Reporter = {
    _game: null, _intervalId: null, _opts: { interval:2000, logToConsole:true },
    attach: function(game, opts){
      this._game = game || (window.game || null);
      this._opts = Object.assign({}, this._opts, opts || {});
      if (!this._game) { console.warn('PhaserMemoryReporterV3.1: no game provided and window.game not found.'); return; }
      if (this._intervalId) clearInterval(this._intervalId);
      this._intervalId = setInterval(()=> {
        try{
          const snap = buildSnapshot(this._game);
          window.PhaserMemoryReporterV31LastSnapshot = snap;
          if (this._opts.logToConsole) consoleReport(snap);
        }catch(e){ console.error('PhaserMemoryReporterV3.1 tick error', e); }
      }, MS(this._opts.interval));
      console.info('PhaserMemoryReporterV3.1 attached. Interval:', MS(this._opts.interval));
    },
    autoInit: function(opts){
      const g = window.game || null;
      if (g) this.attach(g, opts); else console.warn('PhaserMemoryReporterV3.1.autoInit(): window.game not found. Call attach(game).');
    },
    detach: function(){ if (this._intervalId) clearInterval(this._intervalId); this._intervalId = null; this._game = null; console.info('PhaserMemoryReporterV3.1 stopped.'); },
    snapshot: function(){ return buildSnapshot(this._game || (window.game || null)); },
    note: function(text){ instr.manualNotes.push(text); },
    registerAudioBuffer: function(buffer, tag){ try{ registerAudioBuffer(buffer, tag || 'manual'); }catch(e){} },
    getInstrumentationState: function(){ return instr; },
    // nuevo: generar snapshot + imprimir explicación en consola (para ejecutar 1 sola vez)
    snapshotAndExplain: function(game){
      const g = game || this._game || window.game || null;
      const snap = buildSnapshot(g);
      window.PhaserMemoryReporterV31LastSnapshot = snap;
      consoleReport(snap);
      const explanation = explainSnapshot(snap);
      console.group('PhaserMemoryReporterV3.1 - Explicación y sugerencias');
      console.log(explanation);
      console.groupEnd();
      return snap;
    },
    // nuevo: reportar solo una vez (sin interval), conveniente para consola
    reportOnce: function(game, opts){
      const g = game || this._game || window.game || null;
      const snap = buildSnapshot(g);
      window.PhaserMemoryReporterV31LastSnapshot = snap;
      if (!opts || opts.logToConsole !== false) consoleReport(snap);
      if (!opts || opts.showExplanation !== false){
        const explanation = explainSnapshot(snap);
        console.group('PhaserMemoryReporterV3.1 - Explicación rápida');
        console.log(explanation);
        console.groupEnd();
      }
      return snap;
    },
    // nuevo: exportar snapshot a archivo JSON para analizar más tarde
    exportSnapshotJSON: function(game, filename){
      try{
        const snap = buildSnapshot(game || this._game || window.game || null);
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || ('phaser-mr-snapshot-' + (new Date()).toISOString() + '.json');
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        console.info('Snapshot exported to file.');
      }catch(e){ console.error('exportSnapshotJSON error', e); }
    }
  };

  window.PhaserMemoryReporterV3 = Reporter; // compat name

  // Auto attach if game exists (no fuerza, solo conveniencia)
  setTimeout(()=> { if (window.game && !Reporter._intervalId) Reporter.attach(window.game, { interval:2000, logToConsole:true }); }, 500);

  instr.manualNotes.push('PhaserMemoryReporterV3.1-improved loaded at ' + nowISO());
})();
