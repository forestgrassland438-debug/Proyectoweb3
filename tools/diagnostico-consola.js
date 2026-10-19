/* Pegar completo en la consola del juego. No requiere instalar bibliotecas. */
(() => {
  'use strict';
  const SEGUNDOS = 180, INTERVALO = 5000, VERSION = '1.0';
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const own = (obj, key, fallback = null) => safe(() => {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    return d && 'value' in d ? d.value : fallback;
  }, fallback);
  const descriptor = safe(() => Object.getOwnPropertyDescriptor(window, 'GFDiag'));
  if (descriptor) {
    const anterior = own(window, 'GFDiag');
    if (descriptor.configurable && own(anterior, 'version') === VERSION && typeof own(anterior, 'detener') === 'function') anterior.detener();
    else { console.warn('GFDiag ya existe. No se ha reemplazado.'); return; }
  }
  const inicio = performance.now(), fecha = new Date().toISOString();
  const mib = b => Number.isFinite(b) ? +(b / 1048576).toFixed(2) : null;
  const round = n => Number.isFinite(n) ? +n.toFixed(2) : null;
  const redactar = s => (typeof s === 'string' ? s.slice(0, 4000) : '[valor no textual]')
    .replace(/(?:Bearer\s+)[^\s,;]+/gi, 'Bearer [oculto]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT]')
    .replace(/0x[a-f0-9]{20,}/gi, '[hex]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '[secreto oculto]')
    .replace(/[a-z0-9_-]{36,}/gi, '[identificador]')
    .slice(0, 300);
  const ruta = value => safe(() => {
    if (typeof value !== 'string') return '[URL no textual]';
    if (/^(?:data|blob):/i.test(value)) return value.slice(0, value.indexOf(':') + 1) + '[contenido omitido]';
    const u = new URL(value, location.href);
    if (!['http:', 'https:', 'file:'].includes(u.protocol)) return u.protocol + '[contenido omitido]';
    if (u.protocol === 'file:') return 'file:/[ruta local omitida]/' + redactar(u.pathname.split('/').pop());
    return redactar(u.origin + u.pathname);
  }, '[URL no disponible]');
  const mensaje = value => redactar((typeof value === 'string' ? value.slice(0, 4000) : '[sin mensaje textual]')
    .replace(/(?:https?|file|blob|data):[^\s<>"']+/gi, u => ruta(u)));
  const lista = value => Array.isArray(value) ? value : [];
  const claves = obj => obj && typeof obj === 'object' ? safe(() => Object.keys(obj), []) : [];
  const muestras = [], marcas = [], observadores = [], retiradas = [];
  const errores = new Map(), recursos = new Map(), tipos = Object.create(null);
  let activo = true, final = null, intervalo, finAutomatico, anteriorTick = inicio;
  let erroresTotal = 0, recursosTotal = 0, recursosOmitidos = 0, bytesTransferidos = 0;
  let tareas = 0, bloqueoMs = 0, tareaMaxMs = 0, recursosSinTamano = 0;
  const capacidades = { recursos: false, tareasLargas: false, heapJS: !!performance.memory };

  function escuchar(target, tipo, fn, opciones) {
    target.addEventListener(tipo, fn, opciones);
    retiradas.push(() => target.removeEventListener(tipo, fn, opciones));
  }
  function error(tipo, texto, archivo = '', linea = 0) {
    erroresTotal++;
    const registro = { tipo, mensaje: mensaje(texto), archivo: archivo ? ruta(archivo) : '', linea, veces: 1 };
    const id = JSON.stringify(registro);
    if (errores.has(id)) errores.get(id).veces++;
    else if (errores.size < 50) errores.set(id, registro);
  }
  escuchar(window, 'error', e => {
    if (e.target && e.target !== window) {
      const t = e.target;
      error('recurso', 'Fallo al cargar ' + (t.tagName || 'recurso'), t.currentSrc || t.src || t.href || '');
    } else error('JavaScript', e.message, e.filename, e.lineno || 0);
  }, true);
  escuchar(window, 'unhandledrejection', e => {
    const reason = e.reason;
    error('promesa', typeof reason === 'string' ? reason : own(reason, 'message', '[rechazo sin mensaje propio]'));
  });
  escuchar(document, 'securitypolicyviolation', e => {
    error('CSP', e.violatedDirective, e.blockedURI);
  });
  function recurso(e) {
    recursosTotal++;
    const tipo = e.initiatorType || 'otro', url = ruta(e.name);
    tipos[tipo] = (tipos[tipo] || 0) + 1;
    bytesTransferidos += e.transferSize || 0;
    if (!(e.encodedBodySize > 0 || e.transferSize > 0)) recursosSinTamano++;
    if (!recursos.has(url)) {
      if (recursos.size >= 1500) { recursosOmitidos++; return; }
      recursos.set(url, { url, tipo, solicitudes: 0, transferenciaMiB: 0, cuerpoDescomprimidoMiB: 0,
        maxDuracionMs: 0, estadosHTTP: [], _transfer: 0, _body: 0 });
    }
    const r = recursos.get(url);
    r.solicitudes++; r._transfer += e.transferSize || 0; r._body += e.decodedBodySize || 0;
    r.maxDuracionMs = Math.max(r.maxDuracionMs, round(e.duration) || 0);
    if (e.responseStatus > 0 && !r.estadosHTTP.includes(e.responseStatus)) r.estadosHTTP.push(e.responseStatus);
  }
  function observar(tipo, callback, historico) {
    if (typeof PerformanceObserver === 'undefined') return false;
    if (PerformanceObserver.supportedEntryTypes && !PerformanceObserver.supportedEntryTypes.includes(tipo)) return false;
    let o;
    try {
      o = new PerformanceObserver(l => { if (activo) for (const e of l.getEntries()) callback(e); });
      o.observe({ type: tipo, buffered: historico }); observadores.push({ o, callback }); return true;
    } catch { if (o) o.disconnect(); return false; }
  }
  capacidades.recursos = observar('resource', recurso, true);
  if (!capacidades.recursos) safe(() => { for (const e of performance.getEntriesByType('resource')) recurso(e); });
  capacidades.tareasLargas = observar('longtask', e => {
    if (e.startTime < inicio) return;
    tareas++; bloqueoMs += Math.max(0, e.duration - 50); tareaMaxMs = Math.max(tareaMaxMs, e.duration);
  }, false);

  function juego() {
    for (const k of ['game', 'phaserGame', '__game']) {
      const g = own(window, k);
      if (own(g, 'scene') && own(g, 'textures')) return g;
    }
    return null;
  }
  function listeners(emisor) {
    const eventos = own(emisor, '_events');
    return claves(eventos).slice(0, 1000).reduce((n, k) => {
      const v = own(eventos, k); return n + (Array.isArray(v) ? v.length : v ? 1 : 0);
    }, 0);
  }
  function phaser(detalle) {
    const g = juego(); if (!g) return { detectado: false };
    const textures = own(own(g, 'textures'), 'list', {}), keys = claves(textures);
    const escenas = lista(own(own(g, 'scene'), 'scenes')).slice(0, 100).map(s => {
      const sys = own(s, 'sys'), clock = own(s, 'time'), tweens = own(s, 'tweens');
      const children = lista(own(own(s, 'children'), 'list'));
      let capas = 0, celdas = 0;
      for (const ch of children.slice(0, 20000)) {
        const data = own(own(ch, 'layer'), 'data');
        if (Array.isArray(data)) { capas++; for (const row of data.slice(0, 5000)) celdas += Array.isArray(row) ? row.length : 0; }
      }
      return { escena: redactar(own(own(sys, 'settings'), 'key', '?')),
        estado: own(own(sys, 'settings'), 'status'), objetosPrimerNivel: children.length,
        timersPhaser: lista(own(clock, '_active')).length, tweens: lista(own(tweens, 'tweens')).length,
        listenersEscena: listeners(own(sys, 'events')), capasTilemap: capas, celdasTilemap: celdas };
    });
    const cache = own(g, 'cache'), audio = own(own(own(cache, 'audio'), 'entries'), 'entries', {});
    const sonidos = lista(own(own(g, 'sound'), 'sounds'));
    const out = { detectado: true, version: own(own(window, 'Phaser'), 'VERSION'),
      renderer: own(own(g, 'renderer'), 'type') === 2 ? 'WebGL' : own(own(g, 'renderer'), 'type') === 1 ? 'Canvas2D' : '?',
      fps: round(own(own(g, 'loop'), 'actualFps')), texturas: keys.length,
      sonidos: sonidos.length, sonidosReproduciendo: sonidos.filter(s => own(s, 'isPlaying')).length,
      escenas, listenersJuego: listeners(own(g, 'events')), caches: {} };
    for (const k of ['audio', 'json', 'tilemap', 'binary', 'text', 'video']) {
      out.caches[k] = own(own(own(cache, k), 'entries'), 'size');
    }
    if (!detalle) return out;
    let texBytes = 0, pcmBytes = 0;
    const fuentes = new WeakSet(), buffers = new WeakSet(), topTex = [], topAudio = [];
    for (const k of keys.slice(0, 10000)) {
      const tex = own(textures, k); let bytes = 0, ancho = 0, alto = 0;
      for (const src of [...lista(own(tex, 'source')), ...lista(own(tex, 'dataSource'))].slice(0, 32)) {
        if (!src || typeof src !== 'object' || fuentes.has(src)) continue;
        fuentes.add(src);
        const w = own(src, 'width', 0), h = own(src, 'height', 0);
        bytes += w * h * 4; ancho = Math.max(ancho, w); alto = Math.max(alto, h);
      }
      texBytes += bytes; topTex.push({ clave: redactar(k), ancho, alto, RGBA8BaseMiB: mib(bytes) });
    }
    for (const k of claves(audio).slice(0, 10000)) {
      const b = own(audio, k);
      if (typeof AudioBuffer === 'undefined' || !(b instanceof AudioBuffer) || buffers.has(b)) continue;
      buffers.add(b);
      const bytes = safe(() => b.length * b.numberOfChannels * 4, 0); pcmBytes += bytes;
      topAudio.push({ clave: redactar(k), duracionSeg: round(b.duration), canales: b.numberOfChannels, PCMMiB: mib(bytes) });
    }
    out.texturasRGBA8BaseMiB = mib(texBytes); out.audioPCMMiB = mib(pcmBytes);
    out.topTexturas = topTex.sort((a, b) => b.RGBA8BaseMiB - a.RGBA8BaseMiB).slice(0, 25);
    out.topAudio = topAudio.sort((a, b) => b.PCMMiB - a.PCMMiB).slice(0, 20);
    out.limites = 'Hasta 100 escenas, 10000 texturas/audio y 32 fuentes/textura. RGBA8 es una estimacion base, no VRAM medida; PCM solo cache Phaser AudioBuffer.';
    return out;
  }
  function foto(etiqueta = '', detalle = false) {
    const t = performance.now(), mem = safe(() => performance.memory);
    const r = { segundo: round((t - inicio) / 1000), etiqueta: mensaje(etiqueta), visible: !document.hidden,
      heapUsadoMiB: mib(mem?.usedJSHeapSize), heapReservadoMiB: mib(mem?.totalJSHeapSize),
      heapLimiteMiB: mib(mem?.jsHeapSizeLimit), elementosDOM: document.getElementsByTagName('*').length,
      imagenesDOM: document.images.length, canvasesDOM: document.getElementsByTagName('canvas').length,
      phaser: safe(() => phaser(detalle), { detectado: false, inspeccionFallida: true }) };
    r.costoMuestreoMs = round(performance.now() - t); return r;
  }
  const inicial = foto('inicio', true);
  muestras.push(inicial);

  function pagina() {
    const canvases = [], imagenes = [], fuentes = new Set(), scripts = [], mixtos = new Set();
    let imagenBytes = 0, nodos = 0, limite = false, sinSandbox = 0, scriptsInline = 0, sinSRI = 0;
    let medios = 0, iframes = 0, passwordsHTTP = 0, metaCSP = false;
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      if (++nodos > 30000) { limite = true; break; }
      const el = walker.currentNode, tag = el.tagName;
      if (tag === 'CANVAS' && canvases.length < 50) canvases.push({ ancho: el.width, alto: el.height,
        RGBA8UnaSuperficieMiB: mib(el.width * el.height * 4) });
      if (tag === 'IMG') {
        const src = el.currentSrc || el.src;
        if (src && !fuentes.has(src)) {
          fuentes.add(src); const bytes = el.naturalWidth * el.naturalHeight * 4; imagenBytes += bytes;
          imagenes.push({ url: ruta(src), ancho: el.naturalWidth, alto: el.naturalHeight, RGBA8BaseMiB: mib(bytes) });
        }
      }
      if (tag === 'IFRAME') { iframes++; if (!el.hasAttribute('sandbox')) sinSandbox++; }
      if (tag === 'AUDIO' || tag === 'VIDEO') medios++;
      if (tag === 'META' && (el.httpEquiv || '').toLowerCase() === 'content-security-policy') metaCSP = true;
      if (tag === 'SCRIPT') {
        if (!el.src) scriptsInline++;
        else if (safe(() => new URL(el.src).origin !== location.origin, false)) {
          if (!el.integrity) sinSRI++;
          if (scripts.length < 30) scripts.push({ url: ruta(el.src), tieneSRI: !!el.integrity });
        }
      }
      if (tag === 'INPUT' && el.type === 'password' && el.form && safe(() => new URL(el.form.action).protocol === 'http:', false)) passwordsHTTP++;
      if (location.protocol === 'https:') {
        for (const a of ['src', 'href', 'action']) {
          const raw = el.getAttribute(a);
          if (raw && /^http:/i.test(raw) && mixtos.size < 30) mixtos.add(ruta(raw));
        }
      }
    }
    return { elementosInspeccionados: Math.min(nodos, 30000), limiteAlcanzado: limite, canvases,
      imagenesDOM_RGBA8BaseMiB: mib(imagenBytes), topImagenesDOM: imagenes.sort((a,b) => b.RGBA8BaseMiB - a.RGBA8BaseMiB).slice(0, 20),
      etiquetasAudioVideo: medios, seguridad: { contextoSeguro: window.isSecureContext,
        aislamientoEntreOrigenes: window.crossOriginIsolated, metaCSPPresente: metaCSP,
        scriptsInline, scriptsExternosSinSRI: sinSRI, scriptsExternos: scripts,
        iframes, iframesSinSandbox: sinSandbox, formulariosPasswordHTTP: passwordsHTTP,
        referenciasHTTPenHTTPS: [...mixtos],
        interpretacion: 'Son indicadores para revisar, no vulnerabilidades confirmadas. CSP tambien puede estar en cabeceras; SRI/sandbox dependen del uso. Las referencias HTTP incluyen enlaces normales.' } };
  }
  function drenar() {
    for (const { o, callback } of observadores) safe(() => { for (const e of o.takeRecords()) callback(e); });
  }
  function construir() {
    drenar(); const actual = foto('informe', true), paginaActual = safe(pagina, { inspeccionFallida: true });
    const heaps = [...muestras, actual].map(s => s.heapUsadoMiB).filter(Number.isFinite);
    const rows = [...recursos.values()].map(({ _transfer, _body, ...r }) => ({ ...r,
      transferenciaMiB: mib(_transfer), cuerpoDescomprimidoMiB: mib(_body) }));
    const avisos = [];
    if (heaps.length && actual.heapUsadoMiB - inicial.heapUsadoMiB > 30) avisos.push('El heap crecio mas de 30 MiB: repetir las mismas acciones y comparar tras reposo/GC. Esto no confirma una fuga.');
    if ((actual.phaser.texturasRGBA8BaseMiB || 0) > 100) avisos.push('Las texturas suman mas de 100 MiB nominales RGBA8: revisar topTexturas.');
    if ((actual.phaser.audioPCMMiB || 0) > 50) avisos.push('El audio PCM en cache supera 50 MiB: revisar topAudio.');
    if (erroresTotal) avisos.push('Se capturaron errores nuevos; revisar errores.');
    return { herramienta: 'GFDiag', version: VERSION, fechaUTC: fecha, pagina: ruta(location.href),
      duracionSeg: actual.segundo, estado: activo ? 'midiendo' : 'detenido', capacidades,
      memoria: { heapInicialMiB: inicial.heapUsadoMiB, heapFinalMiB: actual.heapUsadoMiB,
        cambioHeapMiB: heaps.length ? round(actual.heapUsadoMiB - inicial.heapUsadoMiB) : null,
        minimoHeapMiB: heaps.length ? Math.min(...heaps) : null, maximoHeapMiB: heaps.length ? Math.max(...heaps) : null },
      inicial, actual, muestras: muestras.slice(), marcas: marcas.slice(), paginaActual,
      rendimiento: { tareasLargas: tareas, bloqueoSobre50ms: round(bloqueoMs), tareaMaxMs: round(tareaMaxMs),
        nota: 'Retrasos de muestreo con pestana oculta y el propio diagnostico pueden afectar los datos. FPS procede de Phaser.' },
      recursos: { entradasObservadas: recursosTotal, porTipo: { ...tipos }, transferenciaObservableMiB: mib(bytesTransferidos),
        entradasSinTamanoObservable: recursosSinTamano, omitidasPorLimite: recursosOmitidos,
        masGrandes: rows.slice().sort((a,b) => b.cuerpoDescomprimidoMiB - a.cuerpoDescomprimidoMiB).slice(0, 30),
        rutasRepetidas: rows.filter(r => r.solicitudes > 1).sort((a,b) => b.solicitudes - a.solicitudes).slice(0, 25),
        lentos: rows.slice().sort((a,b) => b.maxDuracionMs - a.maxDuracionMs).slice(0, 20),
        nota: (capacidades.recursos ? 'Historial disponible + nuevas entradas. ' : 'Solo historial disponible al instalar. ') + 'Cero puede ser cache o restriccion entre origenes. Cuerpo descomprimido es HTTP, no imagen decodificada ni RAM. Rutas sin query se agrupan; repetir puede ser normal.' },
      errores: { total: erroresTotal, grupos: [...errores.values()].map(r => ({ ...r })), limiteGrupos: 50 }, avisos,
      limites: [
        'No mide RAM total del navegador/pestana, VRAM real ni basura pendiente de GC. Heap JS es orientativo y no estandar.',
        'No sumar heap + texturas + canvas + imagenes: puede haber solapamiento y faltan buffers, mipmaps y overhead.',
        'No enumera DOM desconectado, workers, sockets, timers/listeners globales preexistentes ni todos los recursos internos. Los contadores Phaser son parciales.',
        'Errores solo desde la instalacion: no recupera historial de consola ni console.error capturados por el juego.',
        'No audita servidor, contratos, permisos, CVE, cabeceras HTTP o todo el codigo. No hay pruebas de explotacion.',
        'Muestras cada 5 s durante 180 s; hasta 8 marcas. No fuerza GC, no libera caches, no hace peticiones ni cambia APIs del juego.',
        'No lee cookies, valores de storage, formularios ni cuerpos de red. Quita query/fragmentos y redacta algunos patrones; revisar el JSON antes de compartir.'
      ] };
  }
  function detener() {
    if (!activo) return;
    clearInterval(intervalo); clearTimeout(finAutomatico);
    try { final = construir(); } finally {
      activo = false;
      if (final) final.estado = 'detenido';
      for (const { o } of observadores) safe(() => o.disconnect());
      for (const quitar of retiradas) safe(quitar);
      observadores.length = 0; retiradas.length = 0;
    }
    console.info('GFDiag finalizado. Copia: copy(GFDiag.json()) | Descargar: GFDiag.guardar()');
    if (final) console.info(JSON.stringify({ memoria: final.memoria, avisos: final.avisos }));
  }
  const api = { version: VERSION,
    marcar(etiqueta = 'marca') {
      if (!activo) { console.info('GFDiag detenido; pega otra vez el script para reiniciar.'); return; }
      if (marcas.length >= 8) { console.info('Limite: 8 marcas.'); return; }
      marcas.push(foto(etiqueta, true)); console.info('GFDiag: marca guardada.');
    },
    informe: () => final || construir(), json: () => JSON.stringify(final || construir(), null, 2), detener,
    guardar() {
      const blob = new Blob([api.json()], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'diagnostico-juego.json';
      try { a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
  };
  try { Object.defineProperty(window, 'GFDiag', { value: Object.freeze(api), configurable: true }); }
  catch {
    activo = false;
    for (const { o } of observadores) safe(() => o.disconnect());
    for (const quitar of retiradas) safe(quitar);
    console.warn('No se pudo publicar GFDiag; se retiraron sus monitores.'); return;
  }
  intervalo = setInterval(() => {
    if (!activo) return;
    const t = performance.now(), s = foto(); s.retrasoMuestreoMs = round(Math.max(0, t - anteriorTick - INTERVALO));
    anteriorTick = t;
    if (muestras.length < 100) muestras.push(s);
    if (t - inicio >= SEGUNDOS * 1000) detener();
  }, INTERVALO);
  finAutomatico = setTimeout(detener, SEGUNDOS * 1000);
  console.info('GFDiag activo durante 180 s. Juega y repite entradas/salidas. Marcar: GFDiag.marcar("menu"). Finalizar: GFDiag.detener().');
})();
