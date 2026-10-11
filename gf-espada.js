/* ===========================================================================
 * LA ESPADA                                                        (2026-10-05)
 *
 * QUÉ HACE
 *   Las tres espadas de la tienda (Wooden / Copper / Iron Sword, tablas
 *   `madera`, `cobre`, `hierro`) se EQUIPAN con el botón que sale al lado
 *   del de la bolsa, y con ESPACIO (o tocando el botón de golpe en móvil) se
 *   da un tajo hacia donde mira el personaje. Los animales que estén en el
 *   arco reciben el daño de la espada (GFAnimales.golpear): sale su barra de
 *   vida, parpadean y huyen; si se les acaba la vida, mueren y vuelven a los
 *   cinco minutos como con la mascota.
 *
 *   El tajo se ve: la espada barre un arco de 150° desde la mano y deja una
 *   estela blanca; al dar, salta un destello en cada animal tocado.
 *
 * QUÉ SE GUARDA
 *   Solo cuál está equipada (localStorage `gf_espada`). Si la espada sale de
 *   la bolsa (vendida, en el mercado), se desequipa sola.
 *
 * CÓMO SE ENGANCHA
 *   Cualquier escena con jugador:  GFEspada.montar(this)
 *   (GameScene, la tienda, la mina y la isla; solo hay animales en el mapa).
 * ======================================================================== */
(function () {
  'use strict';

  var ESPADAS = {
    espada_madera: { nombre: 'Wooden Sword', dano: 12, alcance: 46, enfria: 480, color: 0xd9b27a },
    espada_cobre:  { nombre: 'Copper Sword', dano: 20, alcance: 50, enfria: 420, color: 0xf0a56b },
    espada_hierro: { nombre: 'Iron Sword',   dano: 32, alcance: 54, enfria: 380, color: 0xdfe8f0 }
  };
  var ORDEN = ['espada_hierro', 'espada_cobre', 'espada_madera'];
  var CLAVE_LS = 'gf_espada';

  var equipada = null;
  var objetivos = [];               // otros a los que da el tajo (ver golpe)
  try { var g = localStorage.getItem(CLAVE_LS); if (ESPADAS[g]) equipada = g; } catch (e) {}

  function guardar() { try { if (equipada) localStorage.setItem(CLAVE_LS, equipada); else localStorage.removeItem(CLAVE_LS); } catch (e) {} }

  function cuantas(scene, id) {
    try {
      if (typeof scene.contarItemEnInventario === 'function') return scene.contarItemEnInventario(id);
      // La tienda no hereda de GameScene: se cuenta a mano en su STATE.
      var S = scene.STATE, n = 0;
      [S && S.slots, S && S.quickSlots].forEach(function (arr) {
        if (Array.isArray(arr)) arr.forEach(function (s) { if (s && s.id === id) n += Number(s.count || s.quantity || 0); });
      });
      return n;
    } catch (e) { return 0; }
  }
  function propias(scene) { return ORDEN.filter(function (id) { return cuantas(scene, id) > 0; }); }
  /* ¿Ha llegado ya el inventario? Al montar la escena las casillas aún están
     vacías: si se desequipara entonces, se perdería la elección guardada. */
  function inventarioCargado(scene) {
    var S = scene && scene.STATE;
    var hay = function (arr) { return Array.isArray(arr) && arr.some(function (s) { return !!(s && s.id); }); };
    return !!S && (hay(S.slots) || hay(S.quickSlots));
  }

  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) { scene.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
  }

  // ───────────────────────────────────────────────────────── TEXTURAS
  function texturas(scene) {
    var pedidas = scene.__gfEspadaPedidas || (scene.__gfEspadaPedidas = {});
    var nuevas = 0;
    ORDEN.forEach(function (id) {
      var k = 'gfs_' + id;
      if (scene.textures.exists(k) || pedidas[k]) return;
      pedidas[k] = true;
      scene.load.image(k, './Game/Objetos/armas/' + id + '.png');
      nuevas++;
    });
    if (nuevas) scene.load.start();
    if (!scene.textures.exists('gfs_tajo')) {
      // La estela: media luna con el filo brillante y la cola que se apaga.
      var W = 96, H = 96;
      var c = scene.textures.createCanvas('gfs_tajo', W, H);
      var x = c.getContext();
      for (var i = 0; i < 26; i++) {
        var t = i / 25;
        x.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - t) * (1 - t)).toFixed(3) + ')';
        x.lineWidth = 7 - t * 5;
        x.beginPath();
        x.arc(W / 2, H / 2, 40 - t * 3, -1.3 + t * 0.05, 1.3 - t * 0.05);
        x.stroke();
      }
      x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 2;
      x.beginPath(); x.arc(W / 2, H / 2, 41, -1.25, 1.25); x.stroke();
      c.refresh();
    }
    if (!scene.textures.exists('gfs_chispa')) {
      var c2 = scene.textures.createCanvas('gfs_chispa', 16, 16);
      var y = c2.getContext();
      var gr = y.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.4, 'rgba(255,220,150,0.8)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
      y.fillStyle = gr; y.fillRect(0, 0, 16, 16);
      y.fillStyle = 'rgba(255,255,255,1)'; y.fillRect(7, 1, 2, 14); y.fillRect(1, 7, 14, 2);
      c2.refresh();
    }
  }

  // ───────────────────────────────────────────────────────── EL BOTÓN
  function botones(st) {
    var barra = document.getElementById('quick-slots-bar');
    var b = document.getElementById('gf-espada-btn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'gf-espada-btn';
      b.type = 'button';
      b.className = 'gf-espada-btn';
      b.setAttribute('aria-label', 'Sword');
      b.innerHTML = '<img alt="" draggable="false"><span class="gf-espada-vacia">⚔</span>';
      var inv = document.getElementById('inv-shortcut-btn');
      if (barra && inv && inv.parentNode === barra) barra.insertBefore(b, inv.nextSibling);
      else if (barra) barra.appendChild(b);
      else document.body.appendChild(b);
    }
    var tajo = document.getElementById('gf-tajo-btn');
    if (!tajo) {
      tajo = document.createElement('button');
      tajo.id = 'gf-tajo-btn';
      tajo.type = 'button';
      tajo.className = 'gf-tajo-btn';
      tajo.setAttribute('aria-label', 'Swing the sword');
      tajo.innerHTML = '<span>⚔</span>';
      document.body.appendChild(tajo);
    }
    /* Que no se quede con el foco: si no, el ESPACIO del tajo "pulsaría" el
       botón y desequiparía la espada en cada golpe. */
    if (!b._sinFoco) { b._sinFoco = true; b.tabIndex = -1; b.addEventListener('mousedown', function (e) { e.preventDefault(); }); }
    if (b._gfe) b.removeEventListener('click', b._gfe);
    b._gfe = function (e) { e.stopPropagation(); e.preventDefault(); alPulsarEspada(st); };
    b.addEventListener('click', b._gfe);
    if (tajo._gfe) tajo.removeEventListener('pointerdown', tajo._gfe);
    tajo._gfe = function (e) { e.stopPropagation(); e.preventDefault(); golpe(st); };
    tajo.addEventListener('pointerdown', tajo._gfe);
    st.boton = b; st.botonTajo = tajo;
  }

  function pintar(st) {
    var b = st.boton;
    if (!b) return;
    var mias = propias(st.scene);
    if (equipada && mias.indexOf(equipada) < 0 && inventarioCargado(st.scene)) { equipada = null; guardar(); }
    b.hidden = !mias.length;
    var lista = !!equipada && mias.indexOf(equipada) >= 0;
    b.classList.toggle('equipada', lista);
    var img = b.querySelector('img');
    var url = './Game/Objetos/armas/' + equipada + '.png';
    if (lista) { if (img.getAttribute('src') !== url) img.src = url; img.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; }
    b.title = lista ? ESPADAS[equipada].nombre + ' equipped (SPACE to swing) — click to change'
                       : 'Equip a sword';
    var tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (st.botonTajo) st.botonTajo.hidden = !(lista && tactil);
  }

  function cerrarMenu() {
    var m = document.getElementById('gf-espada-menu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', cerrarMenuFuera, true);
  }
  function cerrarMenuFuera(e) {
    var m = document.getElementById('gf-espada-menu');
    if (m && !m.contains(e.target) && e.target.id !== 'gf-espada-btn') cerrarMenu();
  }

  /* EL PANEL DE EQUIPO (2026-10-05) — "el botón era por equipación, no por
     intercambio de una sola". Siempre se abre el panel: las tres espadas, las
     que tienes para elegir y las que no, apagadas ("Not owned"), y "Put away".
     Antes, con una sola espada el botón la ponía y la quitaba sin preguntar. */
  function alPulsarEspada(st) {
    var mias = propias(st.scene);
    if (!mias.length) return;
    if (document.getElementById('gf-espada-menu')) { cerrarMenu(); return; }
    var m = document.createElement('div');
    m.id = 'gf-espada-menu';
    m.className = 'gf-espada-menu';
    m.setAttribute('role', 'menu');
    var cab = document.createElement('div');
    cab.className = 'gf-espada-cab';
    cab.textContent = 'Equipment';
    m.appendChild(cab);
    ORDEN.slice().reverse().forEach(function (id) {
      var tiene = mias.indexOf(id) >= 0;
      var o = document.createElement('button');
      o.type = 'button';
      o.className = 'gf-espada-opcion' + (equipada === id ? ' activa' : '') + (tiene ? '' : ' sin');
      o.setAttribute('role', 'menuitem');
      if (!tiene) o.disabled = true;
      var im = document.createElement('img'); im.src = './Game/Objetos/armas/' + id + '.png'; im.alt = '';
      var tx = document.createElement('span'); tx.textContent = ESPADAS[id].nombre;
      var dn = document.createElement('small');
      dn.textContent = !tiene ? 'Not owned' : (equipada === id ? 'Equipped' : 'DMG ' + ESPADAS[id].dano);
      o.appendChild(im); o.appendChild(tx); o.appendChild(dn);
      if (tiene) {
        o.addEventListener('click', function (e) {
          e.stopPropagation();
          equipada = id; guardar(); pintar(st); cerrarMenu();
          aviso(st.scene, '⚔ ' + ESPADAS[id].nombre + ' equipped — press SPACE to swing', 'info');
        });
      }
      m.appendChild(o);
    });
    if (equipada) {
      var q = document.createElement('button');
      q.type = 'button'; q.className = 'gf-espada-opcion quitar'; q.textContent = 'Put away';
      q.addEventListener('click', function (e) { e.stopPropagation(); equipada = null; guardar(); pintar(st); cerrarMenu(); });
      m.appendChild(q);
    }
    document.body.appendChild(m);
    var r = st.boton.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left + r.width / 2 - m.offsetWidth / 2)) + 'px';
    m.style.top = Math.max(8, r.top - m.offsetHeight - 10) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', cerrarMenuFuera, true); }, 0);
  }

  // ───────────────────────────────────────────────────────── EL GOLPE
  function golpe(st) {
    var scene = st.scene, p = scene && scene.player;
    if (!p || !p.scene || !equipada || scene._cambiandoEscena) return;
    if (cuantas(scene, equipada) <= 0) return;          // vendida o aún sin cargar
    if (scene._accionPersonaje === 'pesca') return;
    var def = ESPADAS[equipada];
    var ahora = scene.time.now;
    if (ahora < st.listoEn) return;
    st.listoEn = ahora + def.enfria;
    texturas(scene);
    var dir = ['left', 'right', 'up', 'down'].indexOf(scene.lastDirection) >= 0 ? scene.lastDirection : 'right';
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    var cx = p.x, cy = p.y - 6;

    // La espada barre el arco desde la mano.
    var k = 'gfs_' + equipada;
    var arma = scene.textures.exists(k) ? scene.add.image(cx, cy, k).setOrigin(0.15, 0.85).setScale(2.2) : null;
    var prof = dir === 'up' ? (p.depth || p.y) - 1 : (p.depth || p.y) + 1;
    if (arma) arma.setDepth(prof);
    var desde = ang - 1.3, hasta = ang + 1.3;
    if (dir === 'left') { desde = ang + 1.3; hasta = ang - 1.3; }
    // El dibujo de la espada apunta arriba a la derecha (45°): se compensa.
    var BASE = -Math.PI / 4;
    if (arma) arma.rotation = desde - BASE;
    scene.tweens.addCounter({ from: 0, to: 1, duration: 170, ease: 'Cubic.easeOut', onUpdate: function (tw) {
      if (!arma || !arma.scene) return;
      var t = tw.getValue();
      arma.setPosition(p.x, p.y - 6);
      arma.rotation = desde + (hasta - desde) * t - BASE;
    }, onComplete: function () {
      if (arma && arma.scene) scene.tweens.add({ targets: arma, alpha: 0, duration: 90, onComplete: function () { arma.destroy(); } });
    } });

    // La estela.
    var tajo = scene.add.image(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18, 'gfs_tajo')
      .setRotation(ang).setDepth(prof + 0.5).setScale(def.alcance / 44).setAlpha(0.95).setTint(def.color);
    if (tajo.setBlendMode && window.Phaser && Phaser.BlendModes) tajo.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: tajo, alpha: 0, scale: tajo.scale * 1.15, duration: 230, ease: 'Quad.easeOut', onComplete: function () { tajo.destroy(); } });

    // El daño.
    var res = window.GFAnimales && window.GFAnimales.golpear
      ? window.GFAnimales.golpear(scene, cx, cy, dir, def.alcance + 18, def.dano)
      : { tocados: 0, muertos: 0, puntos: [] };
    /* Y los demás que se hayan apuntado (2026-10-10): los zombis de la mina
       (gf-mina-zombis.js), los monstruos y los jugadores de la zona PVP. Cada
       uno devuelve lo mismo que GFAnimales.golpear y se suma. */
    objetivos.slice().forEach(function (fn) {
      try {
        var r2 = fn(scene, cx, cy, dir, def.alcance + 18, def.dano);
        if (!r2) return;
        res.tocados += r2.tocados || 0;
        res.muertos += r2.muertos || 0;
        if (Array.isArray(r2.puntos)) res.puntos = res.puntos.concat(r2.puntos);
      } catch (e) {}
    });
    res.puntos.forEach(function (pt) {
      var ch = scene.add.image(pt.x, pt.y, 'gfs_chispa').setDepth(9000).setScale(1.6);
      if (ch.setBlendMode && window.Phaser && Phaser.BlendModes) ch.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: ch, scale: 0.2, alpha: 0, rotation: 1, duration: 260, onComplete: function () { ch.destroy(); } });
    });
    if (res.tocados) {
      try { scene.cameras.main.shake(80, 0.0025); } catch (e) {}
      try { if (scene._sumarExpHabilidad) scene._sumarExpHabilidad('fuerza', 4 * res.tocados + 16 * res.muertos); } catch (e) {}
    }
    // Solo suena al dar: el golpe del hacha (el juego no trae sonido de tajo).
    try {
      if (res.tocados && scene.playSFX && scene.cache.audio.exists('cortando_sound')) {
        var vol = scene.audioState ? scene.audioState.sfxVolumeApplied : 0.5;
        scene.playSFX('cortando_sound', { volume: vol * 0.7, rate: 1.35 });
      }
    } catch (e) {}
  }

  // ───────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events) return null;
    if (scene.__gfEspada) return scene.__gfEspada;
    var st = { scene: scene, listoEn: 0, ultimo: 0 };
    scene.__gfEspada = st;
    botones(st);
    pintar(st);
    try { texturas(scene); } catch (e) {}
    st.onTecla = function (ev) {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (ev && ev.repeat) return;
      if (!equipada) return;
      if (el && el.tagName === 'BUTTON') { try { el.blur(); } catch (e) {} }
      golpe(st);
    };
    if (scene.input && scene.input.keyboard) scene.input.keyboard.on('keydown-SPACE', st.onTecla);
    st.onUpdate = function (t) { if (t - st.ultimo > 1000) { st.ultimo = t; pintar(st); } };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfEspada;
    if (!st) return;
    scene.__gfEspada = null;
    if (scene.input && scene.input.keyboard) scene.input.keyboard.off('keydown-SPACE', st.onTecla);
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    cerrarMenu();
    if (st.botonTajo) st.botonTajo.hidden = true;
    st.scene = null;
  }

  window.GFEspada = {
    montar: montar,
    desmontar: desmontar,
    equipada: function () { return equipada; },
    equipar: function (id) { if (id === null || ESPADAS[id]) { equipada = id; guardar(); } return equipada; },
    golpear: function (scene) { var st = scene && scene.__gfEspada; if (st) golpe(st); },
    /** fn(scene, cx, cy, dir, alcance, dano) -> { tocados, muertos, puntos } */
    agregarObjetivo: function (fn) { if (typeof fn === 'function' && objetivos.indexOf(fn) < 0) objetivos.push(fn); },
    quitarObjetivo: function (fn) { var i = objetivos.indexOf(fn); if (i >= 0) objetivos.splice(i, 1); },
    ESPADAS: ESPADAS
  };
})();
