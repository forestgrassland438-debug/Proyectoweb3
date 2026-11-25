/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * LOS SONIDOS DE LOS ATAQUES — gf-sonidos-ataque.js               (2026-11-24)
 *
 * "Los sonidos de algunos enemigos o monstruos al atacar suenan muy básicos o
 * falsos: haz nuevos para cada ataque, profesionales."
 *
 * Los WAV los escribe tools/generar-sonidos-ataque.js en Game/MUSIC/ataques
 * (16 bits, 32 kHz, mono; cada uno igualado en sonoridad). Aquí se decide
 * cuál suena en cada momento de cada ataque (`de`), se cargan los que usa el
 * mapa (`precargar`, `precargarEspecies`) y se tocan (`sonar`): con el volumen
 * de efectos del jugador, por el volumen general de Phaser, más bajo cuanto
 * más lejos y hacia el lado de donde viene.
 *
 * Quién llama:
 *   · gf-salvaje.js         sonarAtaque(st, m, evento, x, y, respaldo, radio)
 *   · gf-jefes.js           el rugido con que se presenta, la nova, los
 *                           pinchos, la lluvia y los orbes
 *   · gf-mina-serpiente.js  su grito, el aliento, el géiser y el mordisco
 *
 * Si un WAV aún no ha llegado (o no hay WebAudio), `sonar` devuelve false y el
 * que llama toca el sintetizado de siempre: ningún ataque se queda mudo.
 *
 * LOS MOMENTOS (`evento`). El sonido sale cuando se ANUNCIA el ataque y lleva
 * dentro el reloj del dibujo (las espinas salen a los 280 ms del WAV, la roca
 * del derrumbe cae a los 950...), salvo los que van en el instante:
 *   golpe      el golpe cuerpo a cuerpo, cuando da
 *   grito      al empezar a cazar (y el rugido con que se presenta un jefe)
 *   roca, cae  el gólem arranca y lanza la roca (a los 350 ms) / la roca cae
 *   pisoton    el pisotón, cuando da
 *   embestida  el lobo sale disparado
 *   espinas    espinas, flechas, esquirlas u orbes: salen a los 280 ms
 *   savia      la gota vuela 800 ms y revienta
 *   rayos      el brujo los carga 900 ms;  rayo: caen
 *   salto      el brujo se desvanece (240 ms) y aparece
 *   px:<poder> los poderes de cada especie; px:bola_nieve:fin,
 *              px:emerger:sale y px:emboscada:sale son su segundo momento
 * ========================================================================= */
(function () {
  'use strict';

  var V = '20261124a';                 // = VERSION de tools/generar-sonidos-ataque.js
  var RUTA = './Game/MUSIC/ataques/';
  var GANANCIA = 0.62;                 // los WAV van a −12…−17 dB: así quedan a la altura de los demás efectos
  var POR_ID = 4, TOTAL = 14;          // voces a la vez (de un mismo sonido / en total)
  var PRESUPUESTO = 70;                // segundos descodificados que se guardan (≈ 13 MB a 48 kHz)
  var PARALELO = 4, ESPERA_MS = 15000, REINTENTO_MS = 60000;
  var tiene = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };

  // ── QUÉ SUENA ────────────────────────────────────────────────────────────
  /* Lo de cada molde (gf-salvaje.js: golem, lobo, arana, brujo). */
  var MOLDE = {
    golem: { golpe: 'golpe_piedra', grito: 'grito_golem', roca: 'roca_arranca', cae: 'roca_impacto', pisoton: 'pisoton' },
    lobo: { golpe: 'mordisco', grito: 'aullido', embestida: 'embestida' },
    arana: { golpe: 'picadura', grito: 'grito_arana', espinas: 'espinas', savia: 'savia' },
    brujo: { grito: 'grito_espectro', rayos: 'rayos_carga', rayo: 'rayos_golpe', salto: 'salto' }
  };
  /* Lo que se lanza aunque el molde no lo tenga: el jabalí dispara espinas con
     el ataque de la araña (su poder `espinos`) y un meteoro cae como una roca. */
  var COMUN = { espinas: 'espinas', savia: 'savia', cae: 'roca_impacto' };
  /* El grito según `grito` de la especie (el mismo que elige el aviso). */
  var GRITO = {
    gemido: 'gemido', chillido: 'chillido', croar: 'croar', rugido: 'rugido', zumbido: 'zumbido',
    lava: 'siseo_lava', esporas: 'puf_esporas', hueso: 'grito_hueso', jabali: 'grunido_jabali'
  };
  /* Lo propio de cada especie (las claves de ESPECIES de gf-salvaje.js). */
  var ESPECIE = {
    zombi_cementerio: { golpe: 'golpe_muerto' },
    zombi_podrido: { golpe: 'golpe_muerto' },
    momia_desierto: { golpe: 'golpe_muerto' },
    esqueleto_cementerio: { golpe: 'golpe_hueso', grito: 'grito_hueso', espinas: 'flechas' },
    esqueleto_guerrero: { golpe: 'tajo_sable' },
    nigromante_cementerio: { grito: 'grito_bruja' },
    escorpion_desierto: { golpe: 'pinza' },
    golem_arena: { golpe: 'golpe_arena' },
    golem_hielo: { golpe: 'golpe_hielo', cae: 'golpe_hielo' },
    bruja_ventisca: { grito: 'grito_bruja' },
    yeti_glaciar: { golpe: 'golpe_bestia', grito: 'rugido', roca: 'nieve_lanza', cae: 'nieve_impacto' },
    oso_polar: { golpe: 'zarpa' },
    murcielago_gigante: { embestida: 'aleteo' },
    troll_cueva: { golpe: 'golpe_bestia', grito: 'rugido' },
    golem_cristal: { golpe: 'golpe_cristal', grito: 'grito_golem', espinas: 'esquirlas', savia: 'esquirlas' },
    jabali_espinoso: { golpe: 'golpe_bestia' },
    driada_salvaje: { grito: 'grito_driada' },
    golem_musgo: { golpe: 'golpe_madera', grito: 'grito_madera' },
    // Los siete reinos
    cangrejo_coloso: { golpe: 'pinza', grito: 'grito_arana' },
    pirata_ahogado: { golpe: 'tajo_sable' },
    sapo_toxico: { golpe: 'golpe_blando' },
    bruja_pantano: { grito: 'grito_bruja' },
    escarabajo_sol: { golpe: 'pinza' },
    oso_otono: { golpe: 'zarpa' },
    espantapajaros: { grito: 'grito_madera' },
    pantera_selva: { golpe: 'zarpa' },
    chaman_selva: { golpe: 'baston', grito: 'grito_bruja', espinas: 'orbes' },
    salamandra_magma: { golpe: 'golpe_magma' },
    golem_magma: { golpe: 'golpe_magma', cae: 'golpe_magma' },
    hongo_andante: { golpe: 'golpe_blando' },
    polilla_luz: { golpe: 'picadura', embestida: 'aleteo' },
    // Los jefes: su grito es también el rugido con el que se presentan (gf-jefes.js).
    jefe_golem: { grito: 'jefe_rugido' },
    jefe_arana: { grito: 'jefe_rugido' },
    jefe_escorpion: { golpe: 'pinza', grito: 'jefe_rugido' },
    jefe_lobo: { grito: 'aullido' },
    jefe_yeti: { golpe: 'golpe_bestia', grito: 'rugido', roca: 'nieve_lanza', cae: 'nieve_impacto' },
    jefe_murcielago: { embestida: 'aleteo' },
    jefe_ent: { golpe: 'golpe_madera', grito: 'grito_madera' },
    jefe_cangrejo: { golpe: 'pinza', grito: 'jefe_rugido' },
    jefe_sapo: { golpe: 'golpe_blando' },
    jefe_coloso: { grito: 'jefe_rugido' },
    jefe_ciervo: { golpe: 'golpe_bestia' },
    jefe_gorila: { golpe: 'golpe_bestia', grito: 'rugido' },
    jefe_dragon: { golpe: 'golpe_bestia', grito: 'rugido_dragon', embestida: 'aleteo' },
    jefe_micelio: { golpe: 'golpe_blando', grito: 'grito_madera' }
  };
  /* Los rayos del brujo según su textura (`tex.rayo`): de alma, de hielo, de hojas. */
  var RAYO = {
    gfm_rayo_alma: ['alma_carga', 'alma_golpe'],
    gfm_rayo_hielo: ['hielo_carga', 'hielo_golpe'],
    gfm_rayo_hoja: ['hoja_carga', 'hoja_golpe']
  };
  /* Los poderes de las especies (px:<poder>) y sus segundos momentos. */
  var PODER = {
    bola_nieve: 'bola_nieve', 'bola_nieve:fin': 'nieve_impacto', rugido_helado: 'rugido_helado', prision: 'prision',
    chillido: 'chillido', derrumbe: 'derrumbe', emerger: 'emerger', 'emerger:sale': 'emerger_sale', raices: 'raices',
    petalos: 'petalos', marea: 'marea', ancla: 'ancla', nube_toxica: 'nube_toxica', maldicion: 'maldicion',
    rayo_solar: 'rayo_solar', zarpazo: 'zarpazo', vendaval: 'vendaval', emboscada: 'emboscada', 'emboscada:sale': 'tajos',
    dardos: 'flechas', erupcion: 'erupcion', meteoro: 'meteoro', esporas: 'esporas', brote: 'brote'
  };
  /* Lo que usa cada molde, para precargar solo eso. */
  var EVENTOS = {
    golem: ['golpe', 'grito', 'roca', 'cae', 'pisoton'],
    lobo: ['golpe', 'grito', 'embestida'],
    arana: ['golpe', 'grito', 'espinas', 'savia'],
    brujo: ['grito', 'rayos', 'rayo', 'salto']
  };
  var SEGUNDOS = { bola_nieve: ['bola_nieve:fin'], emerger: ['emerger:sale'], emboscada: ['emboscada:sale'] };
  var DE_JEFE = ['jefe_nova', 'jefe_pincho', 'jefe_impacto', 'jefe_orbes'];
  var SERPIENTE = ['serpiente_grito', 'serpiente_aliento', 'serpiente_golpe', 'geiser'];

  /** El sonido de `evento` para la especie `tipo` (su definición `def`), o null. */
  function de(tipo, def, evento) {
    if (!evento) return null;
    def = def || {};
    if (evento.indexOf('px:') === 0) {
      var q = evento.slice(3);
      if (q === 'dardos' && def.orbe) return 'orbes';            // el chamán, con su báculo: magia, no dardos
      return tiene(PODER, q) ? PODER[q] : null;
    }
    var e = ESPECIE[tipo];
    if (tiene(e, evento)) return e[evento];
    if (evento === 'grito' && tiene(GRITO, def.grito)) return GRITO[def.grito];
    if (evento === 'espinas' && def.orbe) return 'orbes';
    if ((evento === 'rayos' || evento === 'rayo') && def.tex && tiene(RAYO, def.tex.rayo)) return RAYO[def.tex.rayo][evento === 'rayos' ? 0 : 1];
    var mo = MOLDE[def.molde];
    if (tiene(mo, evento)) return mo[evento];
    return tiene(COMUN, evento) ? COMUN[evento] : null;
  }

  /** Todos los que puede usar una especie. */
  function idsDe(tipo, def) {
    var ids = {};
    var pon = function (ev) { var id = de(tipo, def, ev); if (id) ids[id] = true; };
    if (!def) return [];
    (EVENTOS[def.molde] || []).forEach(function (ev) { if (ev !== 'golpe' || def.golpe) pon(ev); });
    (def.poderes || []).forEach(function (p) {
      if (p === 'espinos') { pon('espinas'); return; }
      pon('px:' + p);
      (SEGUNDOS[p] || []).forEach(function (s) { pon('px:' + s); });
    });
    if (def.poderes && def.poderes.indexOf('meteoro') >= 0) pon('cae');   // pxMeteoro: si el WAV no sonó al lanzarlo
    if (def.jefe) DE_JEFE.forEach(function (id) { ids[id] = true; });
    return Object.keys(ids);
  }

  // ── CARGAR ───────────────────────────────────────────────────────────────
  var buffers = new Map();     // id → { buf, seg, uso }
  var cargando = new Map();    // id → Promise<bool>
  var fallidos = new Map();    // id → cuándo falló (se reintenta al minuto)
  var cola = [], activos = 0;

  function contexto(scene) {
    var snd = scene && scene.sound, ctx = snd && snd.context;
    return ctx && typeof ctx.decodeAudioData === 'function' && typeof ctx.createBufferSource === 'function' ? ctx : null;
  }
  function siguiente() { while (activos < PARALELO && cola.length) cola.shift()(); }
  function descodificar(ctx, bytes) {
    // La forma con funciones: los Safari viejos no devuelven promesa.
    return new Promise(function (ok, mal) {
      try {
        var pr = ctx.decodeAudioData(bytes, ok, mal);
        if (pr && typeof pr.then === 'function') pr.then(ok, mal);
      } catch (e) { mal(e); }
    });
  }
  function cargar(ctx, id) {
    if (buffers.has(id)) return Promise.resolve(true);
    if (cargando.has(id)) return cargando.get(id);
    var f = fallidos.get(id);
    if (f && Date.now() - f < REINTENTO_MS) return Promise.resolve(false);
    var p = new Promise(function (resolver) {
      var intento = 0;
      var trabajo = function () {
        activos++;
        var ac = typeof AbortController === 'function' ? new AbortController() : null;
        var reloj = setTimeout(function () { if (ac) ac.abort(); }, ESPERA_MS);
        /* Un corte de red (o un 5xx, o el tiempo) se reintenta dos veces más,
           con pausa: al entrar en un mapa se piden muchas cosas a la vez y un
           servidor pequeño cierra alguna conexión. Un 404 o un WAV roto, no. */
        var fin = function (ok, e) {
          clearTimeout(reloj); activos--;
          var otraVez = !ok && e && (e.name === 'TypeError' || e.name === 'AbortError' || e.reintentar);
          if (otraVez && ++intento < 3) {
            setTimeout(function () { cola.push(trabajo); siguiente(); }, 900 * intento);
            siguiente();
            return;
          }
          cargando.delete(id);
          if (ok) fallidos.delete(id);
          else {
            fallidos.set(id, Date.now());
            console.warn('[sonidos de ataque] ' + id + ':', (e && e.message) || e);
          }
          resolver(ok); siguiente();
        };
        fetch(RUTA + id + '.wav?v=' + V, ac ? { signal: ac.signal } : undefined).then(function (r) {
          if (!r.ok) { var mal = new Error('HTTP ' + r.status); mal.reintentar = r.status >= 500; throw mal; }
          return r.arrayBuffer();
        }).then(function (bytes) {
          return descodificar(ctx, bytes);
        }).then(function (buf) {
          buffers.set(id, { buf: buf, seg: buf.duration, uso: Date.now() });
          recortar();
          fin(true);
        }).catch(function (e) { fin(false, e); });
      };
      cola.push(trabajo);
      siguiente();
    });
    cargando.set(id, p);
    return p;
  }

  /* Por escena: sus voces, lo que necesita (no se tira al recortar) y el
     último instante de cada sonido. Phaser REUSA la escena: al apagarse se
     borra todo y el próximo create() vuelve a empezar. */
  var regs = new WeakMap(), vivos = new Set();
  function registro(scene) {
    var r = regs.get(scene);
    if (r) return r;
    r = { voces: [], ids: {}, ultimo: {}, unicos: {} };
    regs.set(scene, r); vivos.add(r);
    var apagar = function () {
      regs.delete(scene); vivos.delete(r);
      r.voces.slice().forEach(function (v) { parar(v, 0); });
      try { scene.events.off('shutdown', apagar); scene.events.off('destroy', apagar); } catch (e) {}
    };
    try { scene.events.once('shutdown', apagar); scene.events.once('destroy', apagar); } catch (e) {}
    return r;
  }
  function necesarios() { var m = {}; vivos.forEach(function (r) { for (var k in r.ids) m[k] = true; }); return m; }
  /** Por encima del presupuesto se tiran los que no usa ningún mapa abierto, los más viejos antes. */
  function recortar() {
    var total = 0;
    buffers.forEach(function (b) { total += b.seg; });
    if (total <= PRESUPUESTO) return;
    var manten = necesarios(), lista = [];
    buffers.forEach(function (b, id) { if (!manten[id]) lista.push([id, b]); });
    lista.sort(function (a, b) { return a[1].uso - b[1].uso; });
    for (var i = 0; i < lista.length && total > PRESUPUESTO; i++) { total -= lista[i][1].seg; buffers.delete(lista[i][0]); }
  }

  /** Carga los sonidos `ids` para esta escena. Promesa: si llegaron todos. */
  function precargar(scene, ids) {
    var ctx = contexto(scene);
    if (!ctx || !ids || !ids.length) return Promise.resolve(false);
    var r = registro(scene);
    ids.forEach(function (id) { r.ids[id] = true; });
    recortar();
    return Promise.all(ids.map(function (id) { return cargar(ctx, id); })).then(function (l) { return l.every(Boolean); });
  }
  /** Los de las especies `tipos` (claves de `especies`, la tabla de gf-salvaje.js). */
  function precargarEspecies(scene, tipos, especies) {
    var ids = {};
    (tipos || []).forEach(function (t) { idsDe(t, especies && especies[t]).forEach(function (id) { ids[id] = true; }); });
    return precargar(scene, Object.keys(ids));
  }

  // ── TOCAR ────────────────────────────────────────────────────────────────
  /** El volumen de efectos del jugador (gf-audio: audioState). */
  function volumenEfectos(scene) {
    var a = scene.audioState;
    if (a && a.sfxMuted) return 0;
    var v = a && a.sfxVolumeApplied;
    return (typeof v === 'number' && isFinite(v)) ? Math.max(0, v) : 0.6;
  }
  function parar(v, fundido) {
    if (v.fin) return;
    v.fin = true;
    try {
      var t = v.src.context.currentTime;
      if (fundido > 0) {
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(v.g.gain.value, t);
        v.g.gain.linearRampToValueAtTime(0, t + fundido);
        v.src.stop(t + fundido + 0.01);
      } else v.src.stop();
    } catch (e) { /* ya parado */ }
  }
  function soltar(r, v) {
    v.fin = true;
    var i = r.voces.indexOf(v);
    if (i >= 0) r.voces.splice(i, 1);
    try { v.src.disconnect(); v.g.disconnect(); if (v.pn) v.pn.disconnect(); } catch (e) { /* ya suelto */ }
  }

  /**
   * Toca `id` en (x, y) (null: sin sitio, sin distancia ni lado).
   * op: radio (a esa distancia suena al 30 %), fuerza (×), unico (una clave:
   * no se repite en `ventana` segundos; el grito de un jefe lo piden dos sitios).
   * Devuelve true si sonó (o si no hacía falta: volumen a cero); false si el WAV
   * aún no ha llegado o no hay audio (entonces lo pide, y el que llama sintetiza).
   */
  function sonar(scene, id, x, y, op) {
    try {
      var ctx = contexto(scene);
      if (!id || !ctx) return false;
      var b = buffers.get(id);
      if (!b) { cargar(ctx, id); return false; }
      var snd = scene.sound;
      if (snd.mute) return true;
      op = op || {};
      var r = registro(scene), ahora = ctx.currentTime;
      if (op.unico) {
        var u = r.unicos[op.unico];
        if (u !== undefined && ahora - u < (op.ventana || 3)) return true;
        r.unicos[op.unico] = ahora;
      }
      if (r.ultimo[id] !== undefined && ahora - r.ultimo[id] < 0.05) return true;   // cinco lobos que muerden a la vez: uno
      var directo = !(snd.destination && typeof snd.destination.connect === 'function');
      var vol = volumenEfectos(scene) * GANANCIA * (typeof op.fuerza === 'number' ? op.fuerza : 1);
      if (directo) vol *= (typeof snd.volume === 'number' && isFinite(snd.volume)) ? snd.volume : 1;
      var lado = 0, p = scene.player;
      if (p && typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
        var dx = x - p.x, dy = y - (p.y + 45), d = Math.sqrt(dx * dx + dy * dy), radio = op.radio || 700;
        if (d > radio * 0.35) vol *= Math.max(0.3, 1 - 0.7 * (d - radio * 0.35) / (radio * 0.65));
        lado = Math.max(-0.6, Math.min(0.6, dx / 700));
      }
      if (vol <= 0.002) return true;
      var mismas = 0, total = 0, viejaMisma = null, vieja = null;
      r.voces.forEach(function (v) {
        if (v.fin) return;
        total++; if (!vieja) vieja = v;
        if (v.id === id) { mismas++; if (!viejaMisma) viejaMisma = v; }
      });
      if (mismas >= POR_ID) parar(viejaMisma, 0.04);
      else if (total >= TOTAL) parar(vieja, 0.04);
      b.uso = Date.now();
      r.ultimo[id] = ahora;
      var src = ctx.createBufferSource();
      src.buffer = b.buf;
      src.playbackRate.value = typeof op.tono === 'number' ? op.tono : 0.96 + Math.random() * 0.08;
      var g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      var salida = g, pn = null;
      if (lado && typeof ctx.createStereoPanner === 'function') { pn = ctx.createStereoPanner(); pn.pan.value = lado; g.connect(pn); salida = pn; }
      salida.connect(directo ? ctx.destination : snd.destination);
      var voz = { id: id, src: src, g: g, pn: pn, fin: false };
      r.voces.push(voz);
      src.onended = function () { soltar(r, voz); };
      src.start(ahora + 0.005);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Lo que ocupan (para el banco de pruebas y la consola). */
  function memoria() {
    var seg = 0, bytes = 0;
    buffers.forEach(function (b) { seg += b.seg; bytes += b.buf.length * b.buf.numberOfChannels * 4; });
    return { sonidos: buffers.size, segundos: Math.round(seg * 10) / 10, bytes: bytes, cargando: cargando.size };
  }

  window.GFSonAtaque = {
    V: V, de: de, idsDe: idsDe, precargar: precargar, precargarEspecies: precargarEspecies, sonar: sonar, memoria: memoria,
    SERPIENTE: SERPIENTE,
    _interno: { MOLDE: MOLDE, COMUN: COMUN, GRITO: GRITO, ESPECIE: ESPECIE, RAYO: RAYO, PODER: PODER, EVENTOS: EVENTOS,
                DE_JEFE: DE_JEFE, buffers: buffers, regs: regs, RUTA: RUTA }
  };
})();
