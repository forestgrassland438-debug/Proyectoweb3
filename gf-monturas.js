/* ===========================================================================
 * gf-monturas.js — MONTAR ANIMALES                                 (2026-11-02)
 * ===========================================================================
 *
 * "Animales para montar en 2.5D, nada de 3D." Los 100 de gf-items-v2.js (dibujo
 * en Game/newpro/objetosv2/monturas, tools/generar-objetosv2.py). Se compran en
 * la tienda → Mounts con su nivel, y con una en la bolsa se monta con la H o
 * con el botón redondo. Con varias, el botón deja elegir.
 *
 * CÓMO SE PINTA. El jugador sigue siendo el mismo objeto, en el mismo sitio y con
 * la misma caja de choque: nada de lo que mira su posición o sus pies cambia. Lo
 * único es que se vuelve invisible y, cada frame, un "jinete" copia su textura y
 * su fotograma más arriba, sobre la silla, sin las piernas de abajo. Si en lugar de
 * eso se le moviera el origen al sprite, se descuadraría todo lo que calcula sus
 * pies (profundidad, sombra, colisiones de las escenas).
 *
 * LA VELOCIDAD. Se añade un tanto por ciento a lo que YA se ha movido este frame,
 * pasando por piesLibres de gf-poderes.js: funciona igual con teclas, ratón o
 * táctil, y contra una pared no empuja, porque no se ha movido nada.
 *
 * En interiores y en la tienda no se ve (y se vuelve a ver al salir). Quien muere
 * o sube al bote se baja. Los demás lo ven por 'montura:cambio'.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFMonturas) return;

  var CLAVE_LS = 'gf_montura';
  var W = 84, H = 68, ESCALA = 2;
  var FILAS = { lado: 0, abajo: 1, arriba: 2 };
  var SIN_MONTAR = /interior|tienda|battle|arena|loading|login/i;
  var CORTE_PIERNAS = 0.74;      // del dibujo del personaje se ve hasta aquí (las rodillas)
  var CULO = 8;                  // del centro del personaje a donde apoya en la silla (px)

  var elegida = null, montado = false;
  try {
    var g = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null');
    if (g && defDe(g.id)) { elegida = g.id; montado = !!g.montado; }
  } catch (e) {}

  function v2() { return window.GFItemsV2; }
  function defDe(id) { var v = window.GFItemsV2; return (v && id && v.monturas && v.monturas[id]) || null; }
  function guardar() { try { localStorage.setItem(CLAVE_LS, JSON.stringify({ id: elegida, montado: montado })); } catch (e) {} }
  function aviso(scene, t, tipo) { try { if (scene.notifications && scene.notifications.show) scene.notifications.show(t, tipo || 'info'); } catch (e) {} }
  function escribiendo() {
    var el = document.activeElement;
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }
  function claveEscena(scene) { return String((scene.scene && scene.scene.key) || (scene.sys && scene.sys.settings && scene.sys.settings.key) || ''); }
  function sePuede(scene) { return !SIN_MONTAR.test(claveEscena(scene)); }

  /** Las monturas que hay en la bolsa, de la más rápida a la más lenta. */
  function propias(scene) {
    var S = scene.STATE, vistas = {};
    [S && S.slots, S && S.quickSlots].forEach(function (lista) {
      (lista || []).forEach(function (o) { if (o && defDe(o.id) && (o.count || 0) > 0) vistas[o.id] = true; });
    });
    return Object.keys(vistas).sort(function (a, b) { return defDe(b).velocidad - defDe(a).velocidad; });
  }

  // ── El dibujo ─────────────────────────────────────────────────────────
  function sombraTextura(scene) {
    if (scene.textures.exists('gfm_sombra')) return;
    var c = scene.textures.createCanvas('gfm_sombra', 128, 40), x = c.getContext();
    x.fillStyle = 'rgba(16,26,18,0.34)';
    x.beginPath(); x.ellipse(64, 20, 62, 18, 0, 0, Math.PI * 2); x.fill();
    c.refresh();
  }
  function textura(scene, id, listo) {
    var def = defDe(id), tex = 'gfm_' + id;
    if (!def) return;
    var hecho = function () {
      if (!scene.sys || !scene.textures.exists(tex)) return;
      ['lado', 'abajo', 'arriba'].forEach(function (v) {
        var k = tex + '_' + v;
        // Las animaciones son del juego entero: se crean solo con su textura cargada.
        if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(tex, { start: FILAS[v] * 4, end: FILAS[v] * 4 + 3 }), frameRate: 9, repeat: -1 });
      });
      listo();
    };
    if (scene.textures.exists(tex)) { hecho(); return; }
    scene.load.spritesheet(tex, def.atlas + '?v=20261102a', { frameWidth: W, frameHeight: H });
    scene.load.once('filecomplete-spritesheet-' + tex, hecho);
    scene.load.start();
  }
  /** m: lo que se ve de una montura (la propia o la de otro jugador). */
  function crearVista(scene, id, fuente) {
    sombraTextura(scene);
    var m = { id: id, vivo: true, listo: false, spr: null, sombra: null, jinete: null, x0: fuente.x, y0: fuente.y, vista: 'lado', flip: false, quieto: 1, alfaAntes: fuente.alpha, nombreDy: null };
    textura(scene, id, function () {
      if (!m.vivo || !scene.sys) return;
      m.sombra = scene.add.image(fuente.x, fuente.y, 'gfm_sombra').setDepth(2.5);
      m.spr = scene.add.sprite(fuente.x, fuente.y, 'gfm_' + id, 0).setOrigin(0.5, 1).setScale(ESCALA);
      m.jinete = scene.add.sprite(fuente.x, fuente.y, fuente.texture.key, fuente.frame && fuente.frame.name);
      m.listo = true;
    });
    return m;
  }
  function soltarVista(m, fuente, nombre) {
    if (!m) return;
    m.vivo = false;
    [m.spr, m.sombra, m.jinete].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    try { if (fuente && fuente.scene) fuente.setAlpha(m.alfaAntes == null ? 1 : m.alfaAntes); } catch (e) {}
    try { if (nombre && nombre.scene && m.nombreDy != null) nombre.y = nombre.y + m.subida; } catch (e) {}
  }
  function piesDe(scene, spr) {
    try { if (window.GFProfundidad && window.GFProfundidad.piesDe) return window.GFProfundidad.piesDe(scene, spr); } catch (e) {}
    return spr.y + 45;
  }
  function pintarVista(scene, m, fuente, dt, nombre) {
    if (!m.listo || !fuente || !fuente.scene) return;
    var def = defDe(m.id);
    var dx = fuente.x - m.x0, dy = fuente.y - m.y0;
    m.x0 = fuente.x; m.y0 = fuente.y;
    var anda = Math.hypot(dx, dy) > 0.15;
    if (anda) {
      m.quieto = 0;
      if (Math.abs(dx) >= Math.abs(dy) * 0.8) { m.vista = 'lado'; if (Math.abs(dx) > 0.1) m.flip = dx < 0; }
      else m.vista = dy > 0 ? 'abajo' : 'arriba';
    } else m.quieto += dt;
    var visible = fuente.visible !== false;
    var pie = piesDe(scene, fuente), silla = def.silla[FILAS[m.vista]] || 36;
    var subida = silla * ESCALA + CULO - (pie - fuente.y);
    var k = 'gfm_' + m.id + '_' + m.vista;
    m.spr.setVisible(visible).setPosition(fuente.x, pie + 6).setDepth(fuente.depth).setFlipX(m.vista === 'lado' && m.flip);
    if (m.quieto < 0.14) { if (!m.spr.anims.isPlaying || m.spr.anims.getName() !== k) m.spr.play(k, true); }
    else if (m.spr.anims.isPlaying || Number(m.spr.frame.name) !== FILAS[m.vista] * 4) { m.spr.anims.stop(); m.spr.setFrame(FILAS[m.vista] * 4); }
    m.sombra.setVisible(visible).setPosition(fuente.x, pie + 2);
    // El jinete: la misma textura y fotograma que el personaje, sobre la silla.
    var j = m.jinete;
    if (j.texture.key !== fuente.texture.key || !j.frame || j.frame.name !== fuente.frame.name) {
      j.setTexture(fuente.texture.key, fuente.frame.name);
      j.setCrop(0, 0, fuente.frame.realWidth, fuente.frame.realHeight * CORTE_PIERNAS);
    }
    j.setVisible(visible).setFlipX(fuente.flipX).setScale(fuente.scaleX, fuente.scaleY).setPosition(fuente.x, fuente.y - subida);
    // De frente la cabeza del animal tapa al jinete; de lado y de espaldas, al revés.
    j.setDepth(fuente.depth + (m.vista === 'abajo' ? -0.5 : 0.5));
    fuente.setAlpha(0);
    if (nombre && nombre.scene) {
      if (m.nombreDy == null) m.nombreDy = nombre.y - fuente.y;
      m.subida = subida;
      nombre.y = fuente.y + m.nombreDy - subida;
    }
  }

  // ── Subir y bajar ─────────────────────────────────────────────────────
  function nombrePropio(scene) { return scene.usuariox || null; }
  function avisarSala(scene) {
    try { if (scene.socket && scene.socket.connected) scene.socket.emit('montura:cambio', { id: montado && sePuede(scene) ? elegida : '' }); } catch (e) {}
  }
  function bajar(st, sinGuardar) {
    if (st.yo) { soltarVista(st.yo, st.scene.player, nombrePropio(st.scene)); st.yo = null; }
    if (!sinGuardar) { montado = false; guardar(); avisarSala(st.scene); }
    pintarBoton(st);
  }
  function subir(st, id) {
    var scene = st.scene, def = defDe(id), p = scene.player;
    if (!def || !p || !p.scene) return;
    if (!sePuede(scene)) { aviso(scene, 'You cannot ride here.', 'info'); return; }
    if (window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)) { aviso(scene, 'You cannot ride while you are a ghost.', 'warning'); return; }
    if (p.__gfABordo || (window.GFBotes && window.GFBotes.aBordo && window.GFBotes.aBordo(scene))) { aviso(scene, 'You cannot ride on a boat.', 'info'); return; }
    if (st.yo) soltarVista(st.yo, p, nombrePropio(scene));
    elegida = id; montado = true; guardar();
    st.yo = crearVista(scene, id, p);
    st.resto = 0;
    avisarSala(scene);
    pintarBoton(st);
  }
  function alternar(st) {
    var scene = st.scene;
    if (st.yo) { bajar(st); return; }
    var mias = propias(scene);
    if (!mias.length) { aviso(scene, 'You have no mount. Buy one in the shop → Mounts.', 'info'); return; }
    subir(st, mias.indexOf(elegida) >= 0 ? elegida : mias[0]);
  }

  // La velocidad: un tanto por ciento más de lo ya andado este frame.
  function empujar(st, def) {
    var scene = st.scene, p = scene.player, m = st.yo;
    if (!m || !m.listo || def.velocidad <= 1) return;
    var dx = p.x - m.x0, dy = p.y - m.y0, len = Math.hypot(dx, dy);
    // Un salto grande es otra cosa (teletransporte, el impulso de la C): no se multiplica.
    if (len < 0.2 || len > 40) return;
    var extra = len * (def.velocidad - 1), ux = dx / len, uy = dy / len;
    var libres = window.GFPoderes && window.GFPoderes._interno && window.GFPoderes._interno.piesLibres;
    if (!libres) return;
    var nx = p.x + ux * extra, ny = p.y + uy * extra;
    if (!libres(scene, nx, ny)) {
      if (ux && libres(scene, nx, p.y)) ny = p.y;
      else if (uy && libres(scene, p.x, ny)) nx = p.x;
      else return;
    }
    p.x = nx; p.y = ny;
    scene.previousPosition = { x: p.x, y: p.y };
    scene.posicionplayerx = p.x; scene.posicionplayery = p.y;
  }

  function tic(st, delta) {
    var scene = st.scene, p = scene.player, dt = Math.min(0.1, (delta || 16) / 1000);
    if (!p || !p.scene) return;
    if (st.yo) {
      var fuera = (window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)) || p.__gfABordo ||
        (window.GFBotes && window.GFBotes.aBordo && window.GFBotes.aBordo(scene));
      if (fuera) bajar(st);
    }
    if (st.yo) {
      // Se vendió o se soltó: no se monta lo que ya no se tiene.
      st.miraBolsa = (st.miraBolsa || 0) + dt;
      if (st.miraBolsa > 2) { st.miraBolsa = 0; if (scene._inventarioCargado !== false && propias(scene).indexOf(st.yo.id) < 0) bajar(st); }
    }
    if (st.yo) {
      empujar(st, defDe(st.yo.id));
      pintarVista(scene, st.yo, p, dt, nombrePropio(scene));
    }
    var otros = scene.otherPlayers;
    if (otros) for (var k in otros) {
      var o = otros[k];
      if (o && o._gfMontura && o.sprite) pintarVista(scene, o._gfMontura, o.sprite, dt, o.nameText);
    }
  }

  /** Lo llama la escena al saber qué lleva otro jugador (sala, movimiento o 'montura:estado'). */
  function remoto(scene, p, id) {
    if (!p || !p.sprite) return;
    var quiere = defDe(id) && sePuede(scene) ? id : null;
    var ahora = p._gfMontura ? p._gfMontura.id : null;
    if (quiere === ahora) return;
    if (p._gfMontura) { soltarVista(p._gfMontura, p.sprite, p.nameText); p._gfMontura = null; }
    if (quiere) p._gfMontura = crearVista(scene, quiere, p.sprite);
  }
  function soltarRemoto(p) {
    if (p && p._gfMontura) { soltarVista(p._gfMontura, null, null); p._gfMontura = null; }
  }

  // ── El botón y el menú ────────────────────────────────────────────────
  var ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 20c1-5 3-8 7-10l1-5 3 3 4 1 1 3-3 1-2-1-1 3 1 5"/><path d="M12 5L9 3"/></svg>';
  function pintarBoton(st) {
    var b = st.boton;
    if (!b) return;
    var mias = propias(st.scene);
    var sitio = sePuede(st.scene);
    b.hidden = !mias.length || !sitio;
    b.classList.toggle('montado', !!st.yo);
    b.title = st.yo ? 'Get off ' + defDe(st.yo.id).name + ' (H)' : 'Ride a mount (H)';
    b.setAttribute('aria-label', b.title);
  }
  function cerrarMenu() {
    var m = document.getElementById('gf-montura-menu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', cerrarFuera, true);
  }
  function cerrarFuera(e) {
    var m = document.getElementById('gf-montura-menu');
    if (m && !m.contains(e.target)) cerrarMenu();
  }
  function alPulsarBoton(st) {
    var mias = propias(st.scene);
    if (document.getElementById('gf-montura-menu')) { cerrarMenu(); return; }
    if (mias.length < 2) { alternar(st); return; }
    var m = document.createElement('div');
    m.id = 'gf-montura-menu';
    m.className = 'gf-espada-menu';
    m.setAttribute('role', 'menu');
    var cab = document.createElement('div');
    cab.className = 'gf-espada-cab';
    cab.textContent = 'Mounts';
    m.appendChild(cab);
    mias.forEach(function (id) {
      var d = defDe(id);
      var o = document.createElement('button');
      o.type = 'button';
      o.className = 'gf-espada-opcion' + (st.yo && st.yo.id === id ? ' activa' : '');
      o.setAttribute('role', 'menuitem');
      var im = document.createElement('img'); im.src = d.src; im.alt = '';
      var tx = document.createElement('span'); tx.textContent = d.name;
      var dn = document.createElement('small'); dn.textContent = st.yo && st.yo.id === id ? 'Riding' : '+' + Math.round((d.velocidad - 1) * 100) + '% speed';
      o.appendChild(im); o.appendChild(tx); o.appendChild(dn);
      o.addEventListener('click', function (e) { e.stopPropagation(); cerrarMenu(); subir(st, id); });
      m.appendChild(o);
    });
    if (st.yo) {
      var q = document.createElement('button');
      q.type = 'button'; q.className = 'gf-espada-opcion quitar'; q.textContent = 'Get off';
      q.addEventListener('click', function (e) { e.stopPropagation(); cerrarMenu(); bajar(st); });
      m.appendChild(q);
    }
    document.body.appendChild(m);
    var r = st.boton.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left + r.width / 2 - m.offsetWidth / 2)) + 'px';
    m.style.top = Math.max(8, r.top - m.offsetHeight - 10) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', cerrarFuera, true); }, 0);
  }
  function crearBoton(st) {
    var panel = document.getElementById('gf-poderes-libres');
    if (!panel) return;
    if (!document.getElementById('gf-montura-css')) {
      var css = document.createElement('style');
      css.id = 'gf-montura-css';
      css.textContent = '#gf-poder-montar.montado{border-color:#8fe08f;box-shadow:0 0 0 2px rgba(143,224,143,.35);}#gf-poder-montar[hidden]{display:none;}';
      document.head.appendChild(css);
    }
    var b = document.getElementById('gf-poder-montar');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'gf-poder-montar';
      b.className = 'gf-poder';
      b.hidden = true;
      b.innerHTML = ICONO + '<span class="gf-poder-tecla">H</span>';
      panel.appendChild(b);
    }
    st.boton = b;
    st.onBoton = function (e) { e.stopPropagation(); alPulsarBoton(st); };
    b.addEventListener('click', st.onBoton);
  }

  // ── Montar en cada escena ─────────────────────────────────────────────
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || scene.__gfMonturas || !v2()) return null;
    var st = { scene: scene, vivo: true, yo: null, boton: null, resto: 0, ultBoton: 0 };
    scene.__gfMonturas = st;
    crearBoton(st);
    st.onH = function (ev) { if ((ev && ev.repeat) || escribiendo()) return; alternar(st); };
    if (scene.input && scene.input.keyboard) scene.input.keyboard.on('keydown-H', st.onH);
    st.onPost = function (t, delta) {
      if (!st.vivo) return;
      try { tic(st, delta); } catch (e) { console.warn('[monturas]', e); }
      if (t - st.ultBoton > 700) {
        st.ultBoton = t;
        pintarBoton(st);
        // Se volvió a entrar al mapa (o acabó de cargar la bolsa) yendo montado.
        if (montado && !st.yo && !st.intentado && scene.player && scene._inventarioCargado !== false && sePuede(scene)) {
          var mias = propias(scene);
          if (mias.length) {
            st.intentado = true;
            if (mias.indexOf(elegida) >= 0) subir(st, elegida); else { montado = false; guardar(); }
          }
        }
      }
    };
    scene.events.on('postupdate', st.onPost);
    st.onEstado = function (d) {
      var o = d && scene.otherPlayers && scene.otherPlayers[d.id];
      if (o) remoto(scene, o, d.montura);
    };
    if (scene.socket && scene.socket.on) {
      st.sock = scene.socket;
      st.sock.on('montura:estado', st.onEstado);
    }
    st.onFin = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onFin);
    scene.events.once('destroy', st.onFin);
    return st;
  }
  function desmontar(scene) {
    var st = scene && scene.__gfMonturas;
    if (!st) return;
    st.vivo = false;
    scene.__gfMonturas = null;
    cerrarMenu();
    // Bajar del dibujo, no de la montura: en el mapa siguiente sigue montado.
    if (st.yo) { soltarVista(st.yo, scene.player, nombrePropio(scene)); st.yo = null; }
    scene.events.off('postupdate', st.onPost);
    scene.events.off('shutdown', st.onFin);
    scene.events.off('destroy', st.onFin);
    if (scene.input && scene.input.keyboard) scene.input.keyboard.off('keydown-H', st.onH);
    if (st.boton && st.onBoton) st.boton.removeEventListener('click', st.onBoton);
    if (st.sock) { try { st.sock.off('montura:estado', st.onEstado); } catch (e) {} }
    var otros = scene.otherPlayers;
    if (otros) for (var k in otros) soltarRemoto(otros[k]);
  }

  window.GFMonturas = {
    montar: montar, desmontar: desmontar, remoto: remoto, soltarRemoto: soltarRemoto,
    activa: function () { return montado ? elegida : null; },
    alternar: function (scene) { var st = scene && scene.__gfMonturas; if (st) alternar(st); },
    _interno: { estado: function (s) { return s && s.__gfMonturas; }, subir: subir, bajar: bajar, propias: propias }
  };
})();
