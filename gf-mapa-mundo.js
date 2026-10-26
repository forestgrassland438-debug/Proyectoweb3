/* ===========================================================================
 * gf-mapa-mundo.js — EL MAPA DEL MUNDO (tecla M)                 (2026-10-26)
 * ===========================================================================
 *
 * "Quiero que al presionar la letra M se abra un panel que muestre un mapa 2D
 * pixel art de los mundos o entradas a minas, como Drakensang o WoW, para
 * viajar entre mundos; que salgan todos los mapas dibujados; que al dar clic
 * o toque me pregunte en inglés si deseo viajar por tantas monedas; cobrar
 * según lo lejos que esté el personaje; que reconozca si no cumple los niveles
 * y si está bloqueado. Incluye minas, tienda y más para explorar cómodamente."
 *
 * EL DIBUJO
 *   Game/MAPAS/mundo/mapa_mundo.{webp,png,json}: lo escribe
 *   tools/generar-mapa-mundo.py con el suelo REAL de cada mapa (no se edita a
 *   mano). El JSON dice dónde cae cada mapa en el dibujo (`regiones[].rect`) y
 *   cada destino (`destinos[].px`, en px del dibujo).
 *
 * QUIEN MANDA: el servidor (server2.js, "EL MAPA DEL MUNDO")
 *   GET  /api/viaje/mapa            dónde estás, tu nivel, tu VIP, y el precio
 *                                   y el bloqueo de cada destino;
 *   POST /api/viaje/mapa            cobra en bronce y da un billete;
 *   POST /api/viaje/mapa/devolver   si el viaje pagado no pudo ni empezar.
 *   Aquí solo se enseña y, ya pagado, se viaja con GFViaje.viajar (gf-lands.js).
 *   Con un servidor sin estas rutas (404) el mapa se ve, pero no se viaja.
 *
 * EL PANEL
 *   Arrastrar mueve; rueda, pellizco o + − acercan. Tocar un sitio (o un mapa)
 *   abre la pregunta "Travel to X for N Bronze?". Los mapas a los que no
 *   llega tu nivel salen apagados con su candado; la isla, con su corona si no
 *   hay VIP. "Places" es la lista de todo, con buscador. Mientras está
 *   abierto, Phaser no recibe el teclado (se devuelve con _tecladoLibre).
 *   Los sitios pequeños (casas, rincones) aparecen al acercar: con todo a la
 *   vez, en un teléfono las chinchetas se pisaban.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFMapaMundo) return;

  var RUTA = './Game/MAPAS/mundo/';
  var K_MAX = 2.4;
  // Desde qué zoom se ven los rincones y las casas (y los nombres de todo).
  var Z_MINI = 0.24, Z_LUGARES = 0.42, Z_CASAS = 0.85;

  var TIPO = {
    mapa:   { txt: 'Region',        ico: '🗺️' },
    tienda: { txt: 'Shop',          ico: '🛒' },
    mina:   { txt: 'Mine entrance', ico: '⛏️' },
    casa:   { txt: 'House',         ico: '🏠' },
    arena:  { txt: 'Arena',         ico: '⚔️' },
    lugar:  { txt: 'Landmark',      ico: '📜' },
    isla:   { txt: 'Island',        ico: '🏝️' }
  };
  // Emojis de Unicode 11 o antes: Windows 10 no pinta los más nuevos (ver la
  // nota de emojis y fuentes).
  var ICONO = {
    pueblo: '🏡', salvaje: '🌲', cementerio: '⚰️', desierto: '🌵',
    tundra: '❄️', glaciar: '🏔️', caverna: '💎', pradera: '🌸',
    pueblo_tienda: '🛒', pueblo_mina: '⛏️', isla: '🏝️',
    pueblo_casa_L: '🏠', pueblo_casa_comida: '🍲', pueblo_casa_comida2: '🍺',
    pueblo_casa_posiones: '🧪', pueblo_casa_herreria: '⚒️', pueblo_casa_npc1: '🍞',
    pueblo_casa_npc2: '🔨', pueblo_cabana: '🏡', pueblo_arena: '⚔️',
    salvaje_cabana: '🏕️', cementerio_bruja: '🧙', cementerio_cripta: '⚰️',
    desierto_ruinas: '🏛️', tundra_santuario: '⛩️', tundra_lago: '🌊',
    glaciar_ruinas: '🏰', glaciar_lago: '🌊', caverna_mina: '⛏️',
    caverna_lago: '🌊', pradera_circulo: '🗿', pradera_granja: '🌾'
  };
  // Lo que se toca en un mapa (y no en una chincheta): su destino principal.
  var PRINCIPAL = { mina: 'pueblo_mina', isla: 'isla' };

  var datos = null, pidiendoDatos = null;
  var est = { cargado: false, cargando: false, sinServicio: false, fallo: false, aqui: null, nivel: null, vip: null,
              destinos: null, bronce: null };
  var pidiendoEstado = null, propietario = '';
  var ui = null, abierto = false, ocupado = false, elegido = null, mensajeTarjeta = null, destruido = false;
  var vista = { k: 0, tx: 0, ty: 0, puesta: false };
  var teclados = [];
  var punteros = new Map(), gesto = null, animando = 0;

  // ── LO BÁSICO ──────────────────────────────────────────────────────────────
  function escena() {
    try {
      var g = window.game, l = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName && l[i].player) return l[i];
    } catch (e) {}
    return null;
  }
  function escenasActivas() {
    try { return window.game && window.game.scene ? window.game.scene.getScenes(true) : []; } catch (e) { return []; }
  }
  function cuenta() { var sc = escena(); return sc ? String(sc.playerName || sc.address || '') : ''; }
  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function avisar(scene, texto, tipo) {
    var sc = scene && scene.notifications ? scene : escena();
    try { if (sc && sc.notifications) { sc.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
    console.log('[mapa]', texto);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(n) { return Math.floor(Number(n) || 0).toLocaleString('en-US'); }
  function escribiendo(e) {
    var a = (e && e.target && e.target.nodeType === 1) ? e.target : document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
  }
  function bronceAhora() {
    var v = window.GFBronce && typeof window.GFBronce.valor === 'function' ? window.GFBronce.valor() : null;
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) return Math.floor(Number(v));
    return est.bronce !== null ? est.bronce : null;
  }

  // ── LOS DATOS (el JSON del dibujo) ─────────────────────────────────────────
  function cargarDatos() {
    if (datos) return Promise.resolve(datos);
    if (pidiendoDatos) return pidiendoDatos;
    pidiendoDatos = fetch(RUTA + 'mapa_mundo.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      d.porId = {};
      d.destinos.forEach(function (x) { d.porId[x.id] = x; });
      d.regionPorId = {};
      d.regiones.forEach(function (r) { d.regionPorId[r.id] = r; });
      datos = d;
      return d;
    }).finally(function () { pidiendoDatos = null; });
    return pidiendoDatos;
  }

  // ── EL ESTADO (lo que dice el servidor) ────────────────────────────────────
  function pedirEstado() {
    var dueno = cuenta();
    if (!dueno) return Promise.resolve(est);
    if (dueno !== propietario) {
      propietario = dueno;
      est = { cargado: false, cargando: false, sinServicio: false, fallo: false, aqui: null, nivel: null, vip: null, destinos: null, bronce: null };
    }
    if (pidiendoEstado) return pidiendoEstado;
    est.cargando = true;
    var t = api('/api/viaje/mapa').then(function (r) {
      if (cuenta() !== dueno) return est;
      var d = r && r.datos;
      if (r && r.ok && d && d.ok) {
        est.cargado = true; est.sinServicio = false; est.fallo = false;
        est.aqui = Array.isArray(d.aqui) ? d.aqui : null;
        est.nivel = Number.isFinite(Number(d.nivel)) ? Number(d.nivel) : null;
        est.vip = !!d.vip;
        est.destinos = d.destinos || {};
        est.bronce = Number.isFinite(Number(d.bronce)) ? Math.floor(Number(d.bronce)) : null;
      } else if (r && r.status === 404) {
        est.sinServicio = true; est.cargado = true;
      } else {
        est.fallo = true;
      }
      return est;
    }).catch(function () { est.fallo = true; return est; }).finally(function () {
      est.cargando = false;
      if (pidiendoEstado === t) pidiendoEstado = null;
      if (abierto) pintarTodo();
    });
    pidiendoEstado = t;
    return t;
  }

  /* Sin servidor (o mientras contesta): dónde estás según la escena, con la
     MISMA cuenta que gfMapaPxDeSala en server2.js. */
  function salaLocal(sc) {
    try { if (typeof sc._salaDeEscena === 'function') return String(sc._salaDeEscena() || ''); } catch (e) {}
    var k = sc && sc.sys && sc.sys.settings ? sc.sys.settings.key : '';
    return k === 'tiendajuego' ? 'tienda' : 'game';
  }
  function aquiLocal() {
    var sc = escena();
    if (!sc || !datos) return null;
    var sala = salaLocal(sc).split('#')[0];
    var punto = function (id) { var d = datos.porId[id] || datos.porId.pueblo; return d.px; };
    if (sala === 'tienda') return punto('pueblo_tienda');
    if (sala.indexOf('casa:') === 0) return punto(sala === 'casa:cabana_monte' ? 'salvaje_cabana' : 'pueblo_' + sala.slice(5));
    if (sala === 'isla' || sala.indexOf('isla@') === 0) return punto('isla');
    var r = null;
    datos.regiones.forEach(function (x) { if (x.sala === sala) r = x; });
    if (!r) return punto('pueblo');
    var p = sc.player, fx = 0.5, fy = 0.5;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      fx = Math.max(0, Math.min(1, p.x / r.mapa[0]));
      fy = Math.max(0, Math.min(1, p.y / r.mapa[1]));
    }
    return [Math.round(r.rect[0] + fx * r.rect[2]), Math.round(r.rect[1] + fy * r.rect[3])];
  }
  function aqui() { return est.cargado && est.aqui ? est.aqui : aquiLocal(); }

  function nivelMinimo(d) {
    var s = est.destinos && est.destinos[d.id];
    if (s && Number.isFinite(Number(s.nivelMin))) return Number(s.nivelMin);
    return window.GFNivelMapa ? window.GFNivelMapa.minimo(d.mundo) : 0;
  }
  function miNivel() {
    if (est.cargado && est.nivel !== null) return est.nivel;
    var sc = escena();
    return window.GFNivelMapa && sc ? window.GFNivelMapa.nivelDe(sc) : 0;
  }
  function tengoVip() {
    if (est.cargado && est.vip !== null) return est.vip;
    return !!(window.GFVip && window.GFVip.tiene());
  }
  /** Lo que se sabe de un destino: precio, nivel, bloqueo y si ya estás ahí. */
  function infoDe(d) {
    var s = est.destinos && est.destinos[d.id];
    var nivelMin = nivelMinimo(d);
    var bloqueo = s ? s.bloqueo : (miNivel() < nivelMin ? 'nivel' : (d.vip && !tengoVip() ? 'vip' : null));
    var yo = aqui(), sc = escena();
    var estoy = s ? !!s.aqui : !!(yo && Math.hypot(d.px[0] - yo[0], d.px[1] - yo[1]) < 14);
    // De visita en la isla de otro, la tuya sigue estando "lejos" (como en el servidor).
    if (!s && d.id === 'isla' && sc && sc._islaDe && sc._islaDe !== sc.playerName) estoy = false;
    return { precio: s && Number.isFinite(Number(s.precio)) ? Number(s.precio) : null, nivelMin: nivelMin, bloqueo: bloqueo, aqui: estoy };
  }
  function regionDe(id) { return datos && datos.regionPorId[id]; }
  function iconoDe(d) { return ICONO[d.id] || (TIPO[d.tipo] || TIPO.lugar).ico; }
  function principalDe(regionId) {
    if (PRINCIPAL[regionId]) return datos.porId[PRINCIPAL[regionId]];
    var hallado = null;
    datos.destinos.forEach(function (d) { if (!hallado && d.region === regionId && d.tipo === 'mapa') hallado = d; });
    return hallado;
  }

  // ── EL ESTILO ──────────────────────────────────────────────────────────────
  function estilo() {
    if (document.getElementById('gfmm-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gfmm-estilo';
    s.textContent = [
      '#game-hud .round-buttons #map-btn{order:0}',
      '.gfmm{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;background:rgba(6,8,18,.72);font-family:"Segoe UI",Arial,sans-serif;color:#2c1d10}',
      '.gfmm.gfmm-abierto{display:flex}',
      '.gfmm *{box-sizing:border-box}',
      // `hidden` tiene que ganar a los display de cada clase (el "cargando" seguía encima).
      '.gfmm [hidden]{display:none!important}',
      '.gfmm-marco{position:relative;display:flex;flex-direction:column;width:min(1280px,100%);height:min(860px,100%);border-radius:18px;padding:10px;',
      ' background:linear-gradient(160deg,#5a3a22,#3a2414 55%,#2a1a0e);border:3px solid #1d1209;box-shadow:0 0 0 2px #c9963e inset,0 0 0 5px #1d1209 inset,0 18px 60px rgba(0,0,0,.7)}',
      '.gfmm-marco::before,.gfmm-marco::after{content:"";position:absolute;width:26px;height:26px;border:3px solid #e2b55a;pointer-events:none}',
      '.gfmm-marco::before{top:6px;left:6px;border-right:0;border-bottom:0;border-radius:10px 0 0 0}',
      '.gfmm-marco::after{bottom:6px;right:6px;border-left:0;border-top:0;border-radius:0 0 10px 0}',
      '.gfmm-cab{display:flex;align-items:center;gap:10px;padding:2px 6px 8px}',
      '.gfmm-titulo{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:10px;color:#ffe7b0;text-shadow:0 2px 0 #1d1209}',
      '.gfmm-titulo b{font:800 clamp(17px,2.6vw,26px)/1 Georgia,"Times New Roman",serif;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}',
      '.gfmm-titulo small{font-size:12px;color:#e2c58a;opacity:.85;white-space:nowrap}',
      '.gfmm-titulo-ico{font-size:24px}',
      '.gfmm-btn{border:2px solid #1d1209;border-radius:10px;background:linear-gradient(#f3dc9e,#d6aa55);color:#3a2310;font:800 13px/1 "Segoe UI",Arial,sans-serif;',
      ' min-height:38px;padding:0 12px;cursor:pointer;box-shadow:0 2px 0 #1d1209;display:inline-flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent}',
      '.gfmm-btn:hover{filter:brightness(1.08)}.gfmm-btn:active{transform:translateY(1px);box-shadow:0 1px 0 #1d1209}',
      '.gfmm-btn[disabled]{opacity:.5;cursor:default}',
      '.gfmm-x{width:40px;height:40px;border-radius:50%;border:2px solid #1d1209;background:linear-gradient(#e2685a,#a8322b);color:#fff3e0;font:900 18px/1 Arial;cursor:pointer;box-shadow:0 2px 0 #1d1209}',
      '.gfmm-saldo{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.35);border:1px solid #c9963e;border-radius:20px;padding:4px 12px 4px 6px;color:#ffe7b0;font-weight:800;font-size:14px;white-space:nowrap}',
      '.gfmm-saldo img{width:22px;height:22px;image-rendering:pixelated}',
      '.gfmm-cuerpo{position:relative;flex:1;min-height:0;display:flex;gap:8px}',
      '.gfmm-vista{position:relative;flex:1;min-width:0;overflow:hidden;border-radius:12px;border:3px solid #1d1209;background:#1d4f86;cursor:grab;touch-action:none;outline:none;',
      ' box-shadow:0 0 0 2px #c9963e}',
      '.gfmm-vista.gfmm-arrastra{cursor:grabbing}',
      '.gfmm-vista::after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 60px rgba(10,6,2,.55);border-radius:9px}',
      '.gfmm-capa{position:absolute;left:0;top:0;width:2240px;height:1888px;transform-origin:0 0;will-change:transform}',
      '.gfmm-img{position:absolute;left:0;top:0;width:100%;height:100%;image-rendering:pixelated;user-select:none;-webkit-user-drag:none;pointer-events:none}',
      '.gfmm-reg{position:absolute;pointer-events:none}',
      '.gfmm-reg-velo,.gfmm-reg-gris{position:absolute;inset:0;display:none;border-radius:inherit}',
      '.gfmm-reg-gris{background:#808080;mix-blend-mode:saturation}',
      '.gfmm-reg-velo{background:rgba(14,10,30,.5)}',
      '.gfmm-reg.gfmm-bloq .gfmm-reg-velo,.gfmm-reg.gfmm-bloq .gfmm-reg-gris{display:block}',
      '.gfmm-reg.gfmm-recuadro{border-radius:22px}',
      '.gfmm-banda{position:absolute;left:50%;top:10px;transform-origin:0 0;transform:scale(var(--ik,1)) translateX(-50%);pointer-events:auto;cursor:pointer;',
      ' display:flex;align-items:center;gap:6px;white-space:nowrap;padding:4px 12px;border:2px solid #3b2615;border-radius:5px;',
      ' background:linear-gradient(#fbefcc,#e5c88c);color:#3b2615;font:800 13px/1.15 Georgia,"Times New Roman",serif;box-shadow:0 3px 0 rgba(29,18,9,.55),0 0 0 1px #f9e7b8 inset}',
      '.gfmm-banda::before,.gfmm-banda::after{content:"";position:absolute;top:5px;width:12px;height:100%;background:#c9a061;border:2px solid #3b2615;z-index:-1}',
      '.gfmm-banda::before{left:-10px;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,45% 50%)}',
      '.gfmm-banda::after{right:-10px;clip-path:polygon(0 0,100% 0,55% 50%,100% 100%,0 100%)}',
      // La banda no pasa del ancho de su mapa en pantalla (si no, pisaba la del vecino al alejar).
      // Si no cabe, el nombre parte en dos líneas (cortado con "…" no se leía) y el nivel baja.
      // La letra encoge con el zoom (de 13 a 9,5 px): en un teléfono la banda no tapa medio mapa.
      '.gfmm-banda{max-width:calc(var(--rw,448) * var(--k,1) * 1px - 18px);white-space:normal;flex-wrap:wrap;justify-content:center;text-align:center;row-gap:2px;',
      ' font-size:clamp(9.5px,calc(var(--k,1) * 34px),13px);padding:3px 9px;gap:4px;z-index:1}',
      '.gfmm-banda::before,.gfmm-banda::after{height:calc(100% - 2px);max-height:22px}',
      '.gfmm-banda-nom{min-width:0;overflow-wrap:anywhere}',
      '.gfmm-nv{flex:0 0 auto;font:800 10px/1 "Segoe UI",Arial,sans-serif;border-radius:9px;padding:3px 6px;background:#2f6b2f;color:#eaffd9}',
      '.gfmm-nv.gfmm-nv-bloq{background:#7a1f1f;color:#ffe3c4}',
      '.gfmm-nv.gfmm-nv-vip{background:#7a5c12;color:#fff1c2}',
      '.gfmm-capa.gfmm-z0 .gfmm-banda-nom{display:none}',
      '.gfmm-pin{position:absolute;width:40px;height:40px;margin:0;padding:0;border:0;background:none;cursor:pointer;transform-origin:0 0;',
      ' transform:scale(var(--ik,1)) translate(-50%,-100%);-webkit-tap-highlight-color:transparent;z-index:2}',
      '.gfmm-pin-gota{position:absolute;left:5px;top:3px;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #1d1428;',
      ' background:radial-gradient(circle at 35% 30%,#fff6d8,var(--c,#f6c050) 60%);box-shadow:-2px 3px 5px rgba(0,0,0,.45);transition:transform .12s}',
      '.gfmm-pin-ico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);font-size:15px;line-height:1}',
      '.gfmm-pin:hover .gfmm-pin-gota,.gfmm-pin:focus-visible .gfmm-pin-gota{transform:rotate(-45deg) scale(1.15)}',
      '.gfmm-capa.gfmm-z0 .gfmm-pin{transform:scale(calc(var(--ik,1) * .72)) translate(-50%,-100%)}',
      '.gfmm-pin.gfmm-sel{z-index:6}',
      '.gfmm-pin.gfmm-sel .gfmm-pin-gota{transform:rotate(-45deg) scale(1.25);box-shadow:0 0 0 3px #fff3c4,0 0 14px 4px rgba(255,215,106,.9)}',
      '.gfmm-pin-txt{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:3px;display:none;white-space:nowrap;pointer-events:none;',
      ' font:800 12px/1.2 "Segoe UI",Arial,sans-serif;color:#fff8e6;background:rgba(29,20,40,.82);border:1px solid #c9963e;border-radius:7px;padding:2px 7px}',
      '.gfmm-pin:hover .gfmm-pin-txt,.gfmm-pin.gfmm-sel .gfmm-pin-txt,.gfmm-capa.gfmm-z2 .gfmm-pin .gfmm-pin-txt{display:block}',
      '.gfmm-capa.gfmm-z2 .gfmm-pin.gfmm-t-mapa .gfmm-pin-txt{display:none}',
      '.gfmm-pin-candado{position:absolute;right:-6px;top:-8px;display:none;font-size:13px;line-height:1;filter:drop-shadow(0 1px 0 #1d1428)}',
      '.gfmm-pin.gfmm-bloq .gfmm-pin-gota{filter:grayscale(.85) brightness(.78)}',
      '.gfmm-pin.gfmm-bloq .gfmm-pin-candado{display:block}',
      '.gfmm-pin.gfmm-aqui .gfmm-pin-gota{box-shadow:0 0 0 3px #7ee08a,-2px 3px 5px rgba(0,0,0,.45)}',
      '.gfmm-pin.gfmm-oculto{display:none}',
      '.gfmm-t-mapa{--c:#f6c050}.gfmm-t-tienda{--c:#ef8a5a}.gfmm-t-mina{--c:#c8b494}.gfmm-t-casa{--c:#efdcae}',
      '.gfmm-t-arena{--c:#e86a5a}.gfmm-t-lugar{--c:#a8dc84}.gfmm-t-isla{--c:#6fd0e0}',
      '.gfmm-pin.gfmm-t-mapa{width:48px;height:48px}',
      '.gfmm-pin.gfmm-t-mapa .gfmm-pin-gota{left:6px;top:4px;width:36px;height:36px}',
      '.gfmm-pin.gfmm-t-mapa .gfmm-pin-ico{font-size:19px}',
      '.gfmm-yo{position:absolute;width:0;height:0;pointer-events:none;z-index:3;transform-origin:0 0;transform:scale(var(--ik,1))}',
      '.gfmm-yo-aro{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:4px solid #ffd76a;box-shadow:0 0 0 2px #1d1428,0 0 0 2px #1d1428 inset;animation:gfmm-pulso 1.6s ease-out infinite}',
      '.gfmm-yo-centro{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8d8,#f2b632);border:3px solid #1d1428}',
      '.gfmm-yo-txt{position:absolute;left:0;top:26px;transform:translateX(-50%);white-space:nowrap;font:900 12px/1 "Segoe UI",Arial,sans-serif;color:#1d1428;',
      ' background:linear-gradient(#fff3c4,#f2c25a);border:2px solid #1d1428;border-radius:8px;padding:3px 7px}',
      '@keyframes gfmm-pulso{0%{transform:scale(.7);opacity:1}100%{transform:scale(1.6);opacity:0}}',
      '.gfmm-rosa{position:absolute;right:12px;top:12px;width:clamp(46px,7vw,84px);height:auto;pointer-events:none;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5));opacity:.88;z-index:4}',
      '.gfmm-zoom{position:absolute;right:10px;bottom:10px;display:flex;flex-direction:column;gap:6px;z-index:5}',
      '.gfmm-zoom .gfmm-btn{width:42px;height:42px;padding:0;justify-content:center;font-size:20px}',
      '.gfmm-leyenda{position:absolute;left:10px;bottom:10px;z-index:5;max-width:min(260px,60%);background:rgba(251,239,204,.95);border:2px solid #3b2615;border-radius:10px;',
      ' box-shadow:0 3px 0 rgba(29,18,9,.5);font-size:12px;color:#3b2615}',
      '.gfmm-leyenda summary{cursor:pointer;font-weight:800;padding:7px 10px;list-style:none}',
      '.gfmm-leyenda summary::-webkit-details-marker{display:none}',
      '.gfmm-leyenda ul{margin:0;padding:0 10px 8px;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}',
      '.gfmm-leyenda li{white-space:nowrap}',
      '.gfmm-tarjeta{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:min(430px,calc(100% - 24px));z-index:6;',
      ' background:linear-gradient(#fbefcc,#ecd29a);border:3px solid #3b2615;border-radius:14px;box-shadow:0 6px 0 rgba(29,18,9,.55),0 10px 30px rgba(0,0,0,.5);padding:12px 14px;cursor:default}',
      '.gfmm-t-cab{display:flex;align-items:center;gap:10px}',
      '.gfmm-t-ico{flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:3px solid #1d1428;display:flex;align-items:center;justify-content:center;font-size:22px;',
      ' background:radial-gradient(circle at 35% 30%,#fff6d8,var(--c,#f6c050) 65%)}',
      '.gfmm-t-cab b{display:block;font:800 17px/1.15 Georgia,"Times New Roman",serif}',
      '.gfmm-t-cab small{display:block;font-size:12px;color:#6b4a26;margin-top:2px}',
      '.gfmm-t-cab .gfmm-t-x{margin-left:auto;flex:0 0 auto;border:0;background:none;font:900 20px/1 Arial;color:#6b4a26;cursor:pointer;min-width:36px;min-height:36px}',
      '.gfmm-t-texto{margin:10px 0 0;font-size:14px;line-height:1.45}',
      '.gfmm-t-texto img{width:18px;height:18px;vertical-align:-4px;image-rendering:pixelated}',
      '.gfmm-t-nota{margin:6px 0 0;font-size:12px;color:#6b4a26}',
      '.gfmm-t-mal{color:#9b2020;font-weight:700}',
      '.gfmm-t-botones{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}',
      '.gfmm-t-botones .gfmm-btn{min-height:42px;padding:0 16px}',
      '.gfmm-si{background:linear-gradient(#8fdc7a,#3f9a3a)!important;color:#0f2a0c!important}',
      '.gfmm-lista{flex:0 0 280px;display:flex;flex-direction:column;min-height:0;background:linear-gradient(#fbefcc,#ecd29a);border:3px solid #1d1209;border-radius:12px;box-shadow:0 0 0 2px #c9963e}',
      '.gfmm-lista[hidden]{display:none}',
      '.gfmm-lista input{margin:10px 10px 6px;min-height:36px;border:2px solid #3b2615;border-radius:9px;padding:0 10px;font-size:14px;background:#fffaf0;color:#2c1d10}',
      '.gfmm-lista-cuerpo{flex:1;min-height:0;overflow:auto;padding:0 8px 10px}',
      '.gfmm-lista h4{margin:10px 4px 4px;font:800 13px/1.2 Georgia,serif;color:#5a3a1a;display:flex;justify-content:space-between;gap:6px}',
      '.gfmm-fila{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid transparent;border-radius:9px;background:none;padding:6px;cursor:pointer;color:#2c1d10;font-size:13px}',
      '.gfmm-fila:hover,.gfmm-fila.gfmm-sel{background:rgba(201,150,62,.25);border-color:#c9963e}',
      '.gfmm-fila span:first-child{width:22px;text-align:center}',
      '.gfmm-fila .gfmm-fila-nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gfmm-fila .gfmm-fila-der{font-size:12px;font-weight:700;color:#6b4a26;white-space:nowrap}',
      '.gfmm-fila .gfmm-fila-der img{width:14px;height:14px;vertical-align:-2px;image-rendering:pixelated}',
      '.gfmm-fila.gfmm-bloq{opacity:.6}',
      '.gfmm-cargando{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffe7b0;font-weight:800;font-size:15px;background:#1d4f86;z-index:7}',
      '.gfmm-pie{padding:7px 6px 0;text-align:center;font-size:12px;color:#e2c58a;opacity:.85}',
      '@media (max-width:760px){.gfmm{padding:0}.gfmm-marco{border-radius:0;width:100%;height:100%;padding:6px}',
      ' .gfmm-titulo small,.gfmm-pie{display:none}.gfmm-lista{position:absolute;left:0;top:0;bottom:0;z-index:8;width:min(300px,86%)}',
      ' .gfmm-btn-txt{display:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── EL PANEL ───────────────────────────────────────────────────────────────
  function montar() {
    if (ui) return ui;
    estilo();
    var raiz = document.createElement('div');
    raiz.id = 'gf-mapa-mundo';
    raiz.className = 'gfmm';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    raiz.setAttribute('aria-label', 'World map');
    raiz.innerHTML =
      '<div class="gfmm-marco">' +
        '<header class="gfmm-cab">' +
          '<button type="button" class="gfmm-btn gfmm-lista-btn" aria-expanded="false">☰ <span class="gfmm-btn-txt">Places</span></button>' +
          '<div class="gfmm-titulo"><span class="gfmm-titulo-ico">🧭</span><div><b>World Map</b><small>Travel between the lands</small></div></div>' +
          '<div class="gfmm-saldo" title="Your Bronze"><img src="./Game/Source/moneda de bronce.png" alt=""><span class="gfmm-saldo-n">—</span></div>' +
          '<button type="button" class="gfmm-x" aria-label="Close the map">✕</button>' +
        '</header>' +
        '<div class="gfmm-cuerpo">' +
          '<aside class="gfmm-lista" hidden><input type="search" placeholder="Search a place…" aria-label="Search a place"><div class="gfmm-lista-cuerpo"></div></aside>' +
          '<div class="gfmm-vista" tabindex="0" aria-label="Map. Drag to move, scroll to zoom.">' +
            '<div class="gfmm-capa"><img class="gfmm-img" alt="" draggable="false"><div class="gfmm-regiones"></div><div class="gfmm-pines"></div>' +
              '<div class="gfmm-yo" hidden><div class="gfmm-yo-aro"></div><div class="gfmm-yo-centro"></div><div class="gfmm-yo-txt">You are here</div></div></div>' +
            rosa() +
            '<div class="gfmm-zoom">' +
              '<button type="button" class="gfmm-btn" data-z="mas" aria-label="Zoom in">+</button>' +
              '<button type="button" class="gfmm-btn" data-z="menos" aria-label="Zoom out">−</button>' +
              '<button type="button" class="gfmm-btn" data-z="yo" aria-label="Show where I am">◎</button>' +
              '<button type="button" class="gfmm-btn" data-z="todo" aria-label="Show the whole world">⤢</button>' +
            '</div>' +
            '<details class="gfmm-leyenda"><summary>📖 Legend</summary><ul>' +
              ['mapa', 'tienda', 'mina', 'casa', 'arena', 'lugar', 'isla'].map(function (t) { return '<li>' + TIPO[t].ico + ' ' + TIPO[t].txt + '</li>'; }).join('') +
              '<li>🔒 Level too low</li><li>👑 Needs VIP</li><li>◎ You are here</li>' +
            '</ul></details>' +
            '<div class="gfmm-tarjeta" hidden role="group" aria-live="polite"></div>' +
            '<div class="gfmm-cargando">Unrolling the map…</div>' +
          '</div>' +
        '</div>' +
        '<footer class="gfmm-pie">Drag to move · Scroll or pinch to zoom · Tap a place to travel · M or Esc to close</footer>' +
      '</div>';
    document.body.appendChild(raiz);
    ui = {
      raiz: raiz, vista: raiz.querySelector('.gfmm-vista'), capa: raiz.querySelector('.gfmm-capa'), img: raiz.querySelector('.gfmm-img'),
      regiones: raiz.querySelector('.gfmm-regiones'), pines: raiz.querySelector('.gfmm-pines'), yo: raiz.querySelector('.gfmm-yo'),
      tarjeta: raiz.querySelector('.gfmm-tarjeta'), cargando: raiz.querySelector('.gfmm-cargando'), saldo: raiz.querySelector('.gfmm-saldo-n'),
      lista: raiz.querySelector('.gfmm-lista'), listaCuerpo: raiz.querySelector('.gfmm-lista-cuerpo'), buscar: raiz.querySelector('.gfmm-lista input'),
      listaBtn: raiz.querySelector('.gfmm-lista-btn'), pinPorId: {}, regPorId: {}
    };
    raiz.querySelector('.gfmm-x').addEventListener('click', cerrar);
    raiz.addEventListener('click', function (e) { if (e.target === raiz) cerrar(); });
    ui.listaBtn.addEventListener('click', function () { alternarLista(); });
    ui.buscar.addEventListener('input', pintarLista);
    raiz.querySelector('.gfmm-zoom').addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]');
      if (!b) return;
      var z = b.getAttribute('data-z'), m = medir();
      if (z === 'mas') zoomEn(1.35, m.w / 2, m.h / 2, true);
      else if (z === 'menos') zoomEn(1 / 1.35, m.w / 2, m.h / 2, true);
      else if (z === 'yo') { var p = aqui(); if (p) volarA(p[0], p[1], Math.max(vista.k, 0.7)); }
      else if (z === 'todo') volarA(datos ? datos.tam[0] / 2 : 1120, datos ? datos.tam[1] / 2 : 944, 0);
    });
    ui.listaCuerpo.addEventListener('click', function (e) {
      var f = e.target.closest('[data-id]');
      if (!f || !datos) return;
      var d = datos.porId[f.getAttribute('data-id')];
      if (!d) return;
      if (window.matchMedia && window.matchMedia('(max-width:760px)').matches) alternarLista(false);
      volarA(d.px[0], d.px[1], Math.max(vista.k, d.tipo === 'casa' || d.tipo === 'arena' ? Z_CASAS + 0.05 : 0.6));
      seleccionar(d);
    });
    ui.pines.addEventListener('click', function (e) {
      // Solo el clic de TECLADO (Enter/Espacio): los toques los resuelve el gesto.
      if (e.detail !== 0) return;
      var b = e.target.closest('.gfmm-pin');
      if (b && datos) seleccionar(datos.porId[b.getAttribute('data-id')]);
    });
    ui.tarjeta.addEventListener('click', alTocarTarjeta);
    ui.vista.addEventListener('pointerdown', alBajar);
    ui.vista.addEventListener('pointermove', alMover);
    ui.vista.addEventListener('pointerup', alSubir);
    ui.vista.addEventListener('pointercancel', alCancelar);
    ui.vista.addEventListener('lostpointercapture', alCancelar);
    ui.vista.addEventListener('wheel', alRueda, { passive: false });
    ui.vista.addEventListener('dblclick', function (e) {
      if (e.target.closest('.gfmm-zoom,.gfmm-tarjeta,.gfmm-leyenda,.gfmm-pin,.gfmm-banda')) return;
      var r = ui.vista.getBoundingClientRect();
      zoomEn(1.6, e.clientX - r.left, e.clientY - r.top, true);
    });
    ui.img.addEventListener('load', function () { ui.cargando.hidden = true; });
    ui.img.addEventListener('error', function () {
      // Sin WebP (o sin el archivo): el PNG.
      if (ui.img.src.indexOf('.webp') >= 0) ui.img.src = RUTA + 'mapa_mundo.png?v=' + encodeURIComponent(datos ? datos.version : '1');
      else ui.cargando.textContent = 'The map could not be loaded.';
    });
    return ui;
  }

  function rosa() {
    // La rosa de los vientos: cuatro puntas largas y cuatro cortas, sin puntos.
    return '<svg class="gfmm-rosa" viewBox="0 0 100 108" aria-hidden="true">' +
      '<g stroke="#2a1a0e" stroke-width="2" stroke-linejoin="round">' +
      '<circle cx="50" cy="58" r="27" fill="none" stroke="#e9d39a" stroke-width="4"/>' +
      '<circle cx="50" cy="58" r="27" fill="none" stroke="#2a1a0e" stroke-width="1.5"/>' +
      '<polygon points="50,58 66,42 58,58 66,74 50,58 34,74 42,58 34,42" fill="#c9a061"/>' +
      '<polygon points="50,14 57,58 50,102 43,58" fill="#f3e3b5"/>' +
      '<polygon points="6,58 50,51 94,58 50,65" fill="#e2c58a"/>' +
      '<polygon points="50,14 57,58 50,58" fill="#c0392b"/>' +
      '<polygon points="50,14 43,58 50,58" fill="#e05a4a"/>' +
      '</g><text x="50" y="11" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="13" fill="#ffe7b0" stroke="#2a1a0e" stroke-width="3" paint-order="stroke">N</text></svg>';
  }

  /** Las capas que salen del JSON: velos y bandas de cada mapa, y las chinchetas. */
  function construir() {
    if (!datos || ui.construido) return;
    ui.construido = true;
    ui.img.src = RUTA + 'mapa_mundo.webp?v=' + encodeURIComponent(datos.version);
    var frag = document.createDocumentFragment();
    datos.regiones.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'gfmm-reg' + (r.recuadro ? ' gfmm-recuadro' : '');
      el.style.left = r.rect[0] + 'px'; el.style.top = r.rect[1] + 'px';
      el.style.width = r.rect[2] + 'px'; el.style.height = r.rect[3] + 'px';
      el.style.setProperty('--rw', r.rect[2]);
      el.innerHTML = '<div class="gfmm-reg-gris"></div><div class="gfmm-reg-velo"></div>' +
        '<div class="gfmm-banda" data-region="' + esc(r.id) + '" role="button" tabindex="-1"><span class="gfmm-banda-nom">' + esc(r.nombre) + '</span><span class="gfmm-nv" hidden></span></div>';
      frag.appendChild(el);
      ui.regPorId[r.id] = el;
    });
    ui.regiones.appendChild(frag);
    frag = document.createDocumentFragment();
    datos.destinos.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gfmm-pin gfmm-t-' + d.tipo;
      b.setAttribute('data-id', d.id);
      b.setAttribute('aria-label', d.nombre);
      b.style.left = d.px[0] + 'px'; b.style.top = d.px[1] + 'px';
      b.innerHTML = '<span class="gfmm-pin-gota"><span class="gfmm-pin-ico">' + iconoDe(d) + '</span></span>' +
        '<span class="gfmm-pin-candado"></span><span class="gfmm-pin-txt">' + esc(d.nombre) + '</span>';
      frag.appendChild(b);
      ui.pinPorId[d.id] = b;
    });
    ui.pines.appendChild(frag);
  }

  // ── PINTAR ─────────────────────────────────────────────────────────────────
  function pintarTodo() {
    if (!ui || !datos) return;
    var b = bronceAhora();
    ui.saldo.textContent = b === null ? '—' : num(b);
    var nivel = miNivel(), vip = tengoVip();
    datos.regiones.forEach(function (r) {
      var el = ui.regPorId[r.id];
      if (!el) return;
      var principal = principalDe(r.id);
      var info = principal ? infoDe(principal) : { bloqueo: null, nivelMin: 0 };
      el.classList.toggle('gfmm-bloq', !!info.bloqueo);
      var nv = el.querySelector('.gfmm-nv');
      if (principal && principal.vip) {
        nv.hidden = false; nv.className = 'gfmm-nv ' + (vip ? 'gfmm-nv-vip' : 'gfmm-nv-bloq');
        nv.textContent = '👑 VIP';
      } else if (info.nivelMin > 0) {
        nv.hidden = false; nv.className = 'gfmm-nv' + (nivel < info.nivelMin ? ' gfmm-nv-bloq' : '');
        nv.textContent = (nivel < info.nivelMin ? '🔒 ' : '') + 'Lv ' + info.nivelMin;
      } else nv.hidden = true;
    });
    datos.destinos.forEach(function (d) {
      var p = ui.pinPorId[d.id];
      if (!p) return;
      var info = infoDe(d);
      p.classList.toggle('gfmm-bloq', !!info.bloqueo);
      p.classList.toggle('gfmm-aqui', info.aqui);
      p.classList.toggle('gfmm-sel', !!(elegido && elegido.id === d.id));
      p.querySelector('.gfmm-pin-candado').textContent = info.bloqueo === 'vip' ? '👑' : (info.bloqueo ? '🔒' : '');
      p.title = d.nombre + (info.aqui ? ' — you are here' : info.bloqueo === 'nivel' ? ' — level ' + info.nivelMin
              : info.bloqueo === 'vip' ? ' — VIP' : info.precio !== null ? ' — ' + num(info.precio) + ' Bronze' : '');
    });
    var yo = aqui();
    ui.yo.hidden = !yo;
    if (yo) { ui.yo.style.left = yo[0] + 'px'; ui.yo.style.top = yo[1] + 'px'; }
    if (!ui.lista.hidden) pintarLista();
    pintarTarjeta();
  }

  function etiquetaPrecio(info) {
    if (info.aqui) return 'Here';
    if (info.bloqueo === 'nivel') return '🔒 Lv ' + info.nivelMin;
    if (info.bloqueo === 'vip') return '👑 VIP';
    return info.precio !== null ? '<img src="./Game/Source/moneda de bronce.png" alt="Bronze"> ' + num(info.precio) : '—';
  }

  function pintarLista() {
    if (!ui || !datos) return;
    var q = String(ui.buscar.value || '').trim().toLowerCase();
    var orden = datos.regiones.slice().sort(function (a, b) {
      var pa = principalDe(a.id), pb = principalDe(b.id);
      var na = a.id === 'pueblo' ? -1 : (pa ? nivelMinimo(pa) : 0), nb = b.id === 'pueblo' ? -1 : (pb ? nivelMinimo(pb) : 0);
      return na - nb;
    });
    var html = '';
    orden.forEach(function (r) {
      var filas = datos.destinos.filter(function (d) { return d.region === r.id && (!q || d.nombre.toLowerCase().indexOf(q) >= 0 || r.nombre.toLowerCase().indexOf(q) >= 0); });
      if (!filas.length) return;
      var pr = principalDe(r.id), nv = pr ? nivelMinimo(pr) : 0;
      html += '<h4><span>' + esc(r.nombre) + '</span><span>' + (pr && pr.vip ? 'VIP' : nv ? 'Lv ' + nv : '') + '</span></h4>';
      filas.forEach(function (d) {
        var info = infoDe(d);
        html += '<button type="button" class="gfmm-fila' + (info.bloqueo ? ' gfmm-bloq' : '') + (elegido && elegido.id === d.id ? ' gfmm-sel' : '') + '" data-id="' + esc(d.id) + '">' +
          '<span>' + iconoDe(d) + '</span><span class="gfmm-fila-nom">' + esc(d.nombre) + '</span><span class="gfmm-fila-der">' + etiquetaPrecio(info) + '</span></button>';
      });
    });
    ui.listaCuerpo.innerHTML = html || '<p style="margin:10px 6px;font-size:13px;color:#6b4a26">No places match.</p>';
  }

  function alternarLista(forzar) {
    var ver = typeof forzar === 'boolean' ? forzar : ui.lista.hidden;
    ui.lista.hidden = !ver;
    ui.listaBtn.setAttribute('aria-expanded', ver ? 'true' : 'false');
    if (ver) pintarLista();
    // El ancho del mapa cambia: que siga dentro.
    setTimeout(aplicar, 0);
  }

  // ── LA TARJETA (la pregunta) ───────────────────────────────────────────────
  function seleccionar(d) {
    if (!d) return;
    elegido = d;
    mensajeTarjeta = null;
    pintarTodo();
  }
  function cerrarTarjeta() { elegido = null; mensajeTarjeta = null; pintarTodo(); }

  function pintarTarjeta() {
    if (!ui) return;
    var t = ui.tarjeta;
    if (!elegido) { t.hidden = true; t.innerHTML = ''; return; }
    var d = elegido, info = infoDe(d), r = regionDe(d.region), tipo = TIPO[d.tipo] || TIPO.lugar;
    var bronce = bronceAhora();
    var moneda = '<img src="./Game/Source/moneda de bronce.png" alt="">';
    var cuerpo = '', botones = '';
    var sub = tipo.txt + (r && r.id !== d.id && r.nombre !== d.nombre ? ' · ' + esc(r.nombre) : '') + (info.nivelMin ? ' · Level ' + info.nivelMin + '+' : '');
    if (mensajeTarjeta) {
      cuerpo = '<p class="gfmm-t-texto' + (mensajeTarjeta.mal ? ' gfmm-t-mal' : '') + '">' + mensajeTarjeta.html + '</p>';
      botones = mensajeTarjeta.botones || '<button type="button" class="gfmm-btn" data-a="no">OK</button>';
    } else if (est.sinServicio) {
      cuerpo = '<p class="gfmm-t-texto">Map travel is not available yet: the game server is being updated. You can still explore the map.</p>';
      botones = '<button type="button" class="gfmm-btn" data-a="no">OK</button>';
    } else if (info.aqui) {
      cuerpo = '<p class="gfmm-t-texto">◎ You are here.</p>';
      botones = '<button type="button" class="gfmm-btn" data-a="no">OK</button>';
    } else if (info.bloqueo === 'nivel') {
      cuerpo = '<p class="gfmm-t-texto gfmm-t-mal">🔒 This place opens at <b>level ' + info.nivelMin + '</b>. You are level ' + miNivel() + '.</p>' +
               '<p class="gfmm-t-nota">Defeat monsters and finish missions to level up.</p>';
      botones = '<button type="button" class="gfmm-btn" data-a="no">OK</button>';
    } else if (info.bloqueo === 'vip') {
      cuerpo = '<p class="gfmm-t-texto gfmm-t-mal">👑 You need <b>VIP</b> to enter your island.</p>' +
               '<p class="gfmm-t-nota">Get it from Rosalind the Weaver, inside Farmer Joe’s house.</p>';
      botones = '<button type="button" class="gfmm-btn" data-a="no">OK</button>';
    } else if (info.precio === null) {
      cuerpo = est.cargando || !est.cargado
        ? '<p class="gfmm-t-texto">⏳ Checking the price of the journey…</p>'
        : '<p class="gfmm-t-texto">The price could not be checked right now.' + (est.cargado && !est.aqui ? ' Walk a few steps and try again.' : '') + '</p>';
      botones = (est.cargando ? '' : '<button type="button" class="gfmm-btn" data-a="otra">↻ Try again</button>') +
                '<button type="button" class="gfmm-btn" data-a="no">Close</button>';
    } else {
      var falta = bronce !== null && bronce < info.precio;
      cuerpo = '<p class="gfmm-t-texto">Travel to <b>' + esc(d.nombre) + '</b> for <b>' + moneda + ' ' + num(info.precio) + ' Bronze</b>?</p>' +
               '<p class="gfmm-t-nota">' + (bronce !== null ? 'You have ' + num(bronce) + ' Bronze. ' : '') + 'The farther you are, the more it costs.</p>' +
               (falta ? '<p class="gfmm-t-nota gfmm-t-mal">You need ' + num(info.precio - bronce) + ' more Bronze.</p>' : '');
      botones = falta
        ? '<button type="button" class="gfmm-btn" data-a="cambio">🔄 Exchange Silver → Bronze</button><button type="button" class="gfmm-btn" data-a="no">No</button>'
        : '<button type="button" class="gfmm-btn" data-a="no">No</button><button type="button" class="gfmm-btn gfmm-si" data-a="si"' + (ocupado ? ' disabled' : '') + '>Yes, travel</button>';
    }
    t.className = 'gfmm-tarjeta gfmm-t-' + d.tipo;
    t.innerHTML = '<div class="gfmm-t-cab"><span class="gfmm-t-ico">' + iconoDe(d) + '</span><div><b>' + esc(d.nombre) + '</b><small>' + sub + '</small></div>' +
                  '<button type="button" class="gfmm-t-x" data-a="no" aria-label="Close">✕</button></div>' + cuerpo +
                  '<div class="gfmm-t-botones">' + botones + '</div>';
    t.hidden = false;
  }

  function alTocarTarjeta(e) {
    var b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'no') cerrarTarjeta();
    else if (a === 'si' && elegido) viajarA(elegido, infoDe(elegido).precio);
    else if (a === 'otra') { mensajeTarjeta = null; pedirEstado(); pintarTarjeta(); }
    else if (a === 'cambio') {
      var sc = escena();
      cerrar();
      if (sc && typeof sc._openCurrencyHub === 'function') sc._openCurrencyHub('exchange');
    }
  }
  function decir(html, mal, botones) { mensajeTarjeta = { html: html, mal: !!mal, botones: botones }; pintarTarjeta(); }

  // ── EL VIAJE ───────────────────────────────────────────────────────────────
  function viajarA(d, precio) {
    if (ocupado || !d || precio === null) return;
    var sc = escena();
    if (!sc) return;
    if (!window.GFViaje || typeof window.GFViaje.viajar !== 'function') { decir('Travel is not ready yet. Try again in a moment.', true); return; }
    if (sc._cambiandoEscena) { decir('You are already on your way.', true); return; }
    if (document.body.classList.contains('in-battle')) { decir('You cannot travel during a battle.', true); return; }
    // El nivel también lo mira GFViaje.viajar; se mira ANTES de pagar.
    if (window.GFNivelMapa && !window.GFNivelMapa.puede(sc, d.mundo)) {
      decir('🔒 This place opens at <b>level ' + window.GFNivelMapa.minimo(d.mundo) + '</b>.', true);
      return;
    }
    ocupado = true;
    decir('⏳ Paying for the journey…', false, ' ');
    var dueno = cuenta();
    api('/api/viaje/mapa', { destino: d.id, precio: precio }).then(function (r) {
      if (cuenta() !== dueno) return;
      var x = (r && r.datos) || {};
      if (r && r.ok && x.ok && x.destino) {
        if (window.GFBronce && x.stats) window.GFBronce.adoptarStats(x.stats);
        cerrar();
        var ahora = escena(), fue = false;
        try { fue = window.GFViaje.viajar({ mundo: x.destino.mundo, x: x.destino.x, y: x.destino.y }); } catch (e) { fue = false; }
        if (fue) avisar(ahora, '🧭 Traveling to ' + d.nombre + ' (−' + num(x.precio) + ' Bronze)', 'success');
        else devolver(x.billete, d);
        return;
      }
      var e = x.error;
      if (r && r.status === 404 && !e) { est.sinServicio = true; mensajeTarjeta = null; pintarTodo(); return; }
      if (e === 'insufficient_funds') {
        if (Number.isFinite(Number(x.have))) est.bronce = Math.floor(Number(x.have));
        decir('You need <b>' + num(x.need) + ' Bronze</b> and you have ' + num(x.have) + '.', true,
              '<button type="button" class="gfmm-btn" data-a="cambio">🔄 Exchange Silver → Bronze</button><button type="button" class="gfmm-btn" data-a="no">OK</button>');
      } else if (e === 'precio_cambio') {
        if (est.destinos && est.destinos[d.id]) est.destinos[d.id].precio = Number(x.precio);
        mensajeTarjeta = null;
        pintarTarjeta();
        avisar(sc, 'The price of the journey changed: ' + num(x.precio) + ' Bronze.', 'info');
      } else if (e === 'nivel_bajo') {
        decir('🔒 This place opens at <b>level ' + num(x.nivelMinimo) + '</b>. You are level ' + num(x.nivel) + '.', true);
      } else if (e === 'vip_required') {
        decir('👑 You need <b>VIP</b> to enter your island. Get it from Rosalind the Weaver, inside Farmer Joe’s house.', true);
      } else if (e === 'ya_estas_aqui') {
        decir('◎ You are already here.');
      } else if (e === 'sin_posicion') {
        decir('The map cannot find you yet. Walk a few steps and try again.', true);
      } else if (r && r.status === 429) {
        decir('Too many journeys at once. Wait a moment.', true);
      } else {
        decir(esc(x.message || 'The journey could not be paid. Try again.'), true);
      }
      pedirEstado();
    }).catch(function () {
      decir('Connection error. Try again.', true);
    }).finally(function () {
      ocupado = false;
      if (abierto && !mensajeTarjeta) pintarTarjeta();
    });
  }

  /** Pagado, pero el viaje no pudo ni empezar: se devuelve el billete. */
  function devolver(billete, d) {
    var sc = escena();
    if (!billete) { avisar(sc, 'The journey could not start.', 'warning'); return; }
    api('/api/viaje/mapa/devolver', { billete: billete }).then(function (r) {
      var x = (r && r.datos) || {};
      if (r && r.ok && x.ok) {
        if (window.GFBronce && x.stats) window.GFBronce.adoptarStats(x.stats);
        avisar(sc, 'The journey to ' + d.nombre + ' could not start. Your ' + num(x.devuelto) + ' Bronze were refunded.', 'warning');
      } else {
        avisar(sc, 'The journey could not start and the refund failed. Contact support.', 'error');
      }
    }).catch(function () { avisar(sc, 'The journey could not start and the refund failed. Contact support.', 'error'); });
  }

  // ── MOVER Y ACERCAR ────────────────────────────────────────────────────────
  function medir() {
    var r = ui.vista.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height), x: r.left, y: r.top };
  }
  function tam() { return datos ? datos.tam : [2240, 1888]; }
  function kMin() { var m = medir(), t = tam(); return Math.min(m.w / t[0], m.h / t[1], 1); }
  function limitar() {
    var m = medir(), t = tam();
    vista.k = Math.max(kMin(), Math.min(K_MAX, vista.k || kMin()));
    var w = t[0] * vista.k, h = t[1] * vista.k;
    vista.tx = w <= m.w ? (m.w - w) / 2 : Math.min(0, Math.max(m.w - w, vista.tx));
    vista.ty = h <= m.h ? (m.h - h) / 2 : Math.min(0, Math.max(m.h - h, vista.ty));
  }
  function aplicar() {
    if (!ui) return;
    limitar();
    ui.capa.style.transform = 'translate(' + vista.tx.toFixed(1) + 'px,' + vista.ty.toFixed(1) + 'px) scale(' + vista.k.toFixed(4) + ')';
    ui.capa.style.setProperty('--ik', (1 / vista.k).toFixed(4));
    ui.capa.style.setProperty('--k', vista.k.toFixed(4));
    ui.capa.classList.toggle('gfmm-z0', vista.k < Z_MINI);
    ui.capa.classList.toggle('gfmm-z2', vista.k >= Z_CASAS);
    if (!datos) return;
    datos.destinos.forEach(function (d) {
      var p = ui.pinPorId[d.id];
      if (!p) return;
      var umbral = (d.tipo === 'casa' || d.tipo === 'arena') ? Z_CASAS : (d.tipo === 'lugar' || d.tipo === 'tienda') ? Z_LUGARES : 0;
      p.classList.toggle('gfmm-oculto', vista.k < umbral && !(elegido && elegido.id === d.id));
    });
  }
  function zoomEn(factor, cx, cy, animar) {
    var k0 = vista.k, k1 = Math.max(kMin(), Math.min(K_MAX, k0 * factor));
    var px = (cx - vista.tx) / k0, py = (cy - vista.ty) / k0;
    if (animar) { animarA(k1, cx - px * k1, cy - py * k1); return; }
    vista.k = k1; vista.tx = cx - px * k1; vista.ty = cy - py * k1;
    aplicar();
  }
  /** Lleva el punto (px, py) del dibujo al centro, con el zoom k (0 = el que haya). */
  function volarA(px, py, k) {
    var m = medir(), k1 = k > 0 ? Math.max(kMin(), Math.min(K_MAX, k)) : (k === 0 ? kMin() : vista.k);
    animarA(k1, m.w / 2 - px * k1, m.h / 2 - py * k1);
  }
  function animarA(k1, tx1, ty1) {
    var k0 = vista.k, tx0 = vista.tx, ty0 = vista.ty, t0 = performance.now(), id = ++animando;
    // Con la pestaña oculta no hay requestAnimationFrame: se pone de golpe.
    if (document.hidden || typeof requestAnimationFrame !== 'function') { vista.k = k1; vista.tx = tx1; vista.ty = ty1; aplicar(); return; }
    var paso = function (t) {
      if (id !== animando) return;
      var f = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - f, 3);
      vista.k = k0 + (k1 - k0) * e; vista.tx = tx0 + (tx1 - tx0) * e; vista.ty = ty0 + (ty1 - ty0) * e;
      aplicar();
      if (f < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
    // Por si el navegador no da fotogramas (panel oculto): al final, de golpe.
    setTimeout(function () { if (id === animando && Math.abs(vista.k - k1) > 1e-4) { animando++; vista.k = k1; vista.tx = tx1; vista.ty = ty1; aplicar(); } }, 450);
  }

  function puntoMapa(cx, cy) { return [(cx - vista.tx) / vista.k, (cy - vista.ty) / vista.k]; }
  function enVista(e) { var m = medir(); return [e.clientX - m.x, e.clientY - m.y]; }

  function alBajar(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.gfmm-zoom,.gfmm-tarjeta,.gfmm-leyenda')) return;
    animando++;
    var p = enVista(e);
    punteros.set(e.pointerId, { x: p[0], y: p[1] });
    try { ui.vista.setPointerCapture(e.pointerId); } catch (err) {}
    if (punteros.size === 1) {
      gesto = { tipo: 'mover', x0: p[0], y0: p[1], tx0: vista.tx, ty0: vista.ty, t0: Date.now(), movido: false,
                objetivo: e.target.closest('.gfmm-pin,.gfmm-banda') };
    } else if (punteros.size === 2) {
      var l = Array.from(punteros.values());
      var mx = (l[0].x + l[1].x) / 2, my = (l[0].y + l[1].y) / 2;
      gesto = { tipo: 'pellizco', d0: Math.max(10, Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y)), k0: vista.k,
                punto: puntoMapa(mx, my), movido: true };
    }
  }
  function alMover(e) {
    if (!gesto || !punteros.has(e.pointerId)) return;
    var p = enVista(e);
    punteros.set(e.pointerId, { x: p[0], y: p[1] });
    if (gesto.tipo === 'mover' && punteros.size === 1) {
      var dx = p[0] - gesto.x0, dy = p[1] - gesto.y0;
      if (!gesto.movido && Math.hypot(dx, dy) > 7) { gesto.movido = true; ui.vista.classList.add('gfmm-arrastra'); }
      if (gesto.movido) { vista.tx = gesto.tx0 + dx; vista.ty = gesto.ty0 + dy; aplicar(); }
    } else if (gesto.tipo === 'pellizco' && punteros.size >= 2) {
      var l = Array.from(punteros.values());
      var mx = (l[0].x + l[1].x) / 2, my = (l[0].y + l[1].y) / 2;
      var d = Math.max(10, Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y));
      vista.k = Math.max(kMin(), Math.min(K_MAX, gesto.k0 * d / gesto.d0));
      vista.tx = mx - gesto.punto[0] * vista.k; vista.ty = my - gesto.punto[1] * vista.k;
      aplicar();
    }
  }
  function alSubir(e) {
    if (!punteros.has(e.pointerId)) return;
    var p = enVista(e);
    punteros.delete(e.pointerId);
    var g = gesto;
    if (punteros.size === 0) { gesto = null; ui.vista.classList.remove('gfmm-arrastra'); }
    else if (g && g.tipo === 'pellizco') {
      // Queda un dedo: sigue moviendo desde donde está, sin "tocar" nada.
      var q = Array.from(punteros.values())[0];
      gesto = { tipo: 'mover', x0: q.x, y0: q.y, tx0: vista.tx, ty0: vista.ty, t0: Date.now(), movido: true, objetivo: null };
    }
    if (!g || g.tipo !== 'mover' || g.movido || punteros.size) return;
    tocar(g.objetivo, p[0], p[1]);
  }
  function alCancelar(e) {
    if (!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    if (!punteros.size) { gesto = null; ui.vista.classList.remove('gfmm-arrastra'); }
  }
  /** Un toque sin arrastrar: la chincheta, la banda o el mapa que haya debajo. */
  function tocar(objetivo, cx, cy) {
    if (!datos) return;
    if (objetivo && objetivo.classList.contains('gfmm-pin')) { seleccionar(datos.porId[objetivo.getAttribute('data-id')]); return; }
    if (objetivo && objetivo.hasAttribute('data-region')) { seleccionar(principalDe(objetivo.getAttribute('data-region'))); return; }
    var q = puntoMapa(cx, cy), hallada = null;
    // Primero los recuadros (mina, caverna, isla): van por encima del resto.
    datos.regiones.slice().sort(function (a, b) { return (b.recuadro ? 1 : 0) - (a.recuadro ? 1 : 0); }).forEach(function (r) {
      if (!hallada && q[0] >= r.rect[0] && q[0] <= r.rect[0] + r.rect[2] && q[1] >= r.rect[1] && q[1] <= r.rect[1] + r.rect[3]) hallada = r;
    });
    if (hallada) seleccionar(principalDe(hallada.id));
    else if (elegido) cerrarTarjeta();
  }
  function alRueda(e) {
    e.preventDefault();
    if (e.target.closest('.gfmm-tarjeta,.gfmm-leyenda')) return;
    animando++;
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    var p = enVista(e);
    zoomEn(Math.exp(-dy * 0.0015), p[0], p[1], false);
  }

  // ── EL TECLADO DEL JUEGO ───────────────────────────────────────────────────
  function apagarTeclado() {
    teclados = [];
    escenasActivas().forEach(function (s) {
      var kb = s && s.input && s.input.keyboard;
      if (!kb) return;
      try { kb.enabled = false; if (typeof kb.resetKeys === 'function') kb.resetKeys(); teclados.push(s); } catch (e) {}
      try { if (typeof s.stopMouseMovement === 'function' && s.mouseMovement && s.player) s.stopMouseMovement(); } catch (e) {}
    });
  }
  function devolverTeclado() {
    var l = teclados; teclados = [];
    l.forEach(function (s) {
      try {
        if (!s.sys || !s.sys.isActive() || !s.input || !s.input.keyboard) return;
        s.input.keyboard.enabled = typeof s._tecladoLibre === 'function' ? s._tecladoLibre() : true;
      } catch (e) {}
    });
  }

  // ── ABRIR Y CERRAR ─────────────────────────────────────────────────────────
  function abrir() {
    if (destruido || abierto) return;
    var sc = escena();
    if (!sc) return;
    if (document.body.classList.contains('in-battle')) { avisar(sc, 'The world map is not available during a battle.', 'info'); return; }
    if (sc._cambiandoEscena) return;
    montar();
    abierto = true;
    elegido = null; mensajeTarjeta = null;
    ui.raiz.classList.add('gfmm-abierto');
    apagarTeclado();
    try { ui.vista.focus({ preventScroll: true }); } catch (e) {}
    cargarDatos().then(function () {
      if (!abierto) return;
      construir();
      if (!vista.puesta) {
        // La primera vez: centrado en ti, con el mundo entero si cabe.
        vista.puesta = true;
        var yo = aquiLocal() || datos.porId.pueblo.px;
        var m = medir();
        vista.k = Math.max(kMin(), Math.min(1, 0.32));
        vista.tx = m.w / 2 - yo[0] * vista.k; vista.ty = m.h / 2 - yo[1] * vista.k;
      }
      aplicar();
      pintarTodo();
      pedirEstado();
      if (window.GFBronce && typeof window.GFBronce.refrescar === 'function') {
        try { var p = window.GFBronce.refrescar(); if (p && p.then) p.then(function () { if (abierto) pintarTodo(); }); } catch (e) {}
      }
    }).catch(function () {
      if (ui) ui.cargando.textContent = 'The map could not be loaded. Close it and try again.';
    });
  }
  function cerrar() {
    if (!abierto) return;
    abierto = false;
    animando++;
    punteros.clear(); gesto = null;
    if (ui) { ui.raiz.classList.remove('gfmm-abierto'); ui.vista.classList.remove('gfmm-arrastra'); }
    elegido = null; mensajeTarjeta = null;
    try { if (document.activeElement && ui && ui.raiz.contains(document.activeElement)) document.activeElement.blur(); } catch (e) {}
    devolverTeclado();
  }
  function alternar() { if (abierto) cerrar(); else abrir(); }

  function alTecla(e) {
    if (destruido) return;
    var k = e.key;
    if (abierto) {
      if (k === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (ui.lista && !ui.lista.hidden && ui.raiz.contains(document.activeElement) && document.activeElement === ui.buscar) { alternarLista(false); return; }
        if (elegido) cerrarTarjeta(); else cerrar();
        return;
      }
      if (escribiendo(e)) return;
      var m = medir(), mov = 90;
      if (k === 'm' || k === 'M') { e.preventDefault(); e.stopImmediatePropagation(); cerrar(); return; }
      if (k === '+' || k === '=') zoomEn(1.25, m.w / 2, m.h / 2, true);
      else if (k === '-' || k === '_') zoomEn(0.8, m.w / 2, m.h / 2, true);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { vista.tx += mov; aplicar(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { vista.tx -= mov; aplicar(); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { vista.ty += mov; aplicar(); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { vista.ty -= mov; aplicar(); }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if ((k === 'm' || k === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !escribiendo(e)) {
      if (!escena()) return;
      e.preventDefault();
      abrir();
    }
  }

  // ── EL BOTÓN DEL HUD ───────────────────────────────────────────────────────
  function boton() {
    var b = document.getElementById('map-btn');
    if (b && !b._gfMapa) {
      b._gfMapa = true;
      estilo();
      b.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
    }
    return b;
  }

  function alResize() { if (abierto) aplicar(); }
  function destruir(e) {
    if (destruido || (e && e.persisted)) return;
    cerrar();
    destruido = true;
    document.removeEventListener('keydown', alTecla, true);
    window.removeEventListener('resize', alResize);
    window.removeEventListener('pagehide', destruir);
  }

  document.addEventListener('keydown', alTecla, true);
  window.addEventListener('resize', alResize);
  window.addEventListener('pagehide', destruir);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boton);
  else boton();

  window.GFMapaMundo = { abrir: abrir, cerrar: cerrar, alternar: alternar, abierto: function () { return abierto; },
                         refrescar: pedirEstado, destruir: destruir };
})();
