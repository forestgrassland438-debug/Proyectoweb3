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
 *
 * LOS PODERES CÓMODOS (2026-10-11): "los botones V, B, N están muy incómodos
 * para PC y móviles, haz que sean cómodos". Eran tres círculos con una letra,
 * sueltos en medio de la pantalla y lejos del botón de golpe. Ahora:
 *   · EN EL MÓVIL van en abanico alrededor del botón de golpe, en la esquina
 *     del pulgar: golpe y poderes sin mover la mano.
 *   · EN EL PC son una barra de habilidades pegada a la derecha de la barra
 *     rápida, a su altura, como en cualquier juego de rol: se miran sin
 *     apartar la vista de los objetos y se pulsan con V, B y N.
 *   · Cada uno con su dibujo (remolino, estocada, escudo), su tecla en una
 *     esquina y la espera como un reloj que se vacía, con los segundos.
 *   · Su sitio se calcula midiendo la barra y la columna de botones redondos
 *     (colocarPanel), y gf-hud-ajuste.js comprueba que no pisan nada.
 *
 * SIENDO FANTASMA NO SE PELEA (2026-10-11): ni tajo ni poderes; se avisa con
 * GFMuerte.bloquear(scene, 'attack') y los botones se ven apagados.
 * ======================================================================== */
(function () {
  'use strict';

  var ESPADAS = {
    espada_madera: { nombre: 'Wooden Sword', dano: 12, alcance: 46, enfria: 480, color: 0xd9b27a },
    espada_cobre:  { nombre: 'Copper Sword', dano: 20, alcance: 50, enfria: 420, color: 0xf0a56b },
    espada_hierro: { nombre: 'Iron Sword',   dano: 32, alcance: 54, enfria: 380, color: 0xdfe8f0 },
    /* (2026-10-21) "Mete un arco y un bastón de mago en la tienda." Se equipan
       igual (mismo botón y mismo ESPACIO) pero no barren: DISPARAN hacia donde
       mira el personaje (una flecha o un rayo violeta) y, al llegar, dan a lo
       que haya en un cono estrecho y largo (`distancia`). */
    arco:          { nombre: 'Bow',          dano: 14, alcance: 300, enfria: 650, color: 0xf2e6c8, distancia: 'flecha' },
    baston_mago:   { nombre: 'Wizard Staff', dano: 18, alcance: 260, enfria: 800, color: 0xb88cff, distancia: 'orbe' }
  };
  var ORDEN = ['espada_hierro', 'espada_cobre', 'espada_madera', 'baston_mago', 'arco'];
  var CONO_DISTANCIA = 0.2;        // medio ángulo del disparo (rad): estrecho
  var VEL_DISPARO = 950;           // px/s de la flecha y del rayo
  var PODERES = {
    v: { nombre: 'Whirlwind', espera: 6500, alcance: 1.35, dano: 0.9, arco: Math.PI },
    b: { nombre: 'Piercing thrust', espera: 4500, alcance: 2.1, dano: 1.5, arco: 0.55 },
    n: { nombre: 'Guard', espera: 12000, guardia: true }
  };
  Object.values(ESPADAS).forEach(Object.freeze);Object.freeze(ESPADAS);Object.values(PODERES).forEach(Object.freeze);Object.freeze(PODERES);
  var CLAVE_LS = 'gf_espada';
  var menuReloj = null;
  function efectos(scene) {
    if (scene.__gfEspadaFx) return scene.__gfEspadaFx;
    var fx = { objetos: new Set(), counters: new Set() };
    scene.__gfEspadaFx = fx;
    fx.cerrar = function () {
      if (scene.__gfEspadaFx !== fx) return;
      scene.__gfEspadaFx = null;
      scene.events.off('shutdown', fx.cerrar); scene.events.off('destroy', fx.cerrar);
      fx.counters.forEach(function (tw) { try { tw.stop(); tw.remove(); } catch (e) {} }); fx.counters.clear();
      Array.from(fx.objetos).forEach(function (o) { try { scene.tweens.killTweensOf(o); if (o.scene) o.destroy(); } catch (e) {} }); fx.objetos.clear();
    };
    scene.events.once('shutdown', fx.cerrar); scene.events.once('destroy', fx.cerrar);
    return fx;
  }
  function efecto(scene, o) { var fx = efectos(scene); fx.objetos.add(o); if (o.once) o.once('destroy', function () { fx.objetos.delete(o); }); return o; }
  // Los dibujos de los botones: trazos, sin puntos.
  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONOS = {
    v: SVG + '<path d="M20 12a8 8 0 0 1-13.6 5.7"/><path d="M4 12a8 8 0 0 1 13.6-5.7"/><path d="M17.6 2.8v3.5h-3.5"/><path d="M6.4 21.2v-3.5h3.5"/><path d="M9.5 12h5M12 9.5v5"/></svg>',
    b: SVG + '<path d="M20.5 3.5L10 14"/><path d="M15.8 3.5h4.7v4.7"/><path d="M7.5 11.5l5 5"/><path d="M10 14l-5.5 5.5"/><path d="M3 8.5h4M4.5 5h4"/></svg>',
    n: SVG + '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M12 7.5v9.5M8.5 11h7"/></svg>',
    tajo: SVG + '<path d="M3.5 13.5a9 9 0 0 1 10-10"/><path d="M20.5 3.5L9 15"/><path d="M15.8 3.5h4.7v4.7"/><path d="M6.5 12.5l5 5"/><path d="M9 15l-5 5"/></svg>'
  };

  var equipada = null;
  var objetivos = [];               // otros a los que da el tajo (ver golpe)
  try { var g = localStorage.getItem(CLAVE_LS); if (Object.prototype.hasOwnProperty.call(ESPADAS, g)) equipada = g; } catch (e) {}

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
    // (2026-10-21) La flecha (apunta a la derecha: se gira) y el rayo del bastón.
    if (!scene.textures.exists('gfs_flecha')) {
      var c3 = scene.textures.createCanvas('gfs_flecha', 30, 8);
      var f = c3.getContext();
      f.fillStyle = '#3a2614'; f.fillRect(4, 3, 20, 3);                  // el contorno del astil
      f.fillStyle = '#d9b27a'; f.fillRect(5, 4, 18, 1);                  // el astil
      f.fillStyle = '#e8e4da'; f.beginPath(); f.moveTo(0, 1); f.lineTo(6, 4); f.lineTo(0, 7); f.closePath(); f.fill();   // las plumas
      f.fillStyle = '#2a2a30'; f.beginPath(); f.moveTo(23, 0); f.lineTo(30, 4); f.lineTo(23, 8); f.closePath(); f.fill(); // la punta
      f.fillStyle = '#c9ced6'; f.beginPath(); f.moveTo(24, 2); f.lineTo(28, 4); f.lineTo(24, 6); f.closePath(); f.fill();
      c3.refresh();
    }
    if (!scene.textures.exists('gfs_orbe')) {
      var c4 = scene.textures.createCanvas('gfs_orbe', 28, 28);
      var o = c4.getContext();
      var go = o.createRadialGradient(14, 14, 0, 14, 14, 14);
      go.addColorStop(0, 'rgba(255,250,255,1)'); go.addColorStop(0.3, 'rgba(206,168,255,0.95)');
      go.addColorStop(0.65, 'rgba(140,80,230,0.45)'); go.addColorStop(1, 'rgba(110,50,200,0)');
      o.fillStyle = go; o.fillRect(0, 0, 28, 28);
      c4.refresh();
    }
  }

  function esDistancia(arma) { return !!(Object.prototype.hasOwnProperty.call(ESPADAS, arma) && ESPADAS[arma].distancia); }

  /**
   * (2026-10-21) El disparo del arco o del bastón, VISTO: el arma en la mano
   * apuntando y la flecha (o el rayo) volando `largo` px hacia `dir`. Lo usan
   * el disparo propio y el de los demás (gf-mobs-red / gf-salvaje). Devuelve
   * lo que tarda en llegar (ms).
   */
  function dibujarDisparo(scene, x, y, dir, arma, largo, prof, desvio) {
    if (!scene || !scene.add || !esDistancia(arma) || ![x, y].every(Number.isFinite)) return 0;
    var def = ESPADAS[arma];
    largo = Number.isFinite(largo) && largo > 0 ? largo : def.alcance;
    texturas(scene);
    var ang = ({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0) + (Number(desvio) || 0);
    var vx = Math.cos(ang), vy = Math.sin(ang);
    var capa = Number.isFinite(prof) ? prof : y + 1;
    var dur = Math.max(120, Math.round(largo / VEL_DISPARO * 1000));
    var k = 'gfs_' + arma;
    // En la ráfaga (varias flechas a la vez) el arco se dibuja una sola vez.
    if (!desvio && scene.textures.exists(k)) {
      /* El arma en la mano. El bastón, cogido por abajo y con el cristal
         hacia el disparo (el dibujo apunta a 45°: se compensa). El arco, cogido
         por el CENTRO, con las puntas de través y la panza hacia el disparo
         (en el dibujo la panza mira arriba a la izquierda: 135°). */
      var esArco = def.distancia === 'flecha';
      var mano = efecto(scene, scene.add.image(x + (esArco ? vx * 6 : 0), y + (esArco ? vy * 6 : 0), k))
        .setOrigin(esArco ? 0.5 : 0.15, esArco ? 0.5 : 0.85).setScale(2.2).setDepth(capa)
        .setRotation(ang + (esArco ? Math.PI * 3 / 4 : Math.PI / 4));
      scene.tweens.add({ targets: mano, alpha: 0, delay: 160, duration: 160, onComplete: function () { if (mano.scene) mano.destroy(); } });
    }
    var bala;
    if (def.distancia === 'flecha') {
      bala = efecto(scene, scene.add.image(x + vx * 14, y + vy * 14, 'gfs_flecha')).setRotation(ang).setScale(1.6).setDepth(capa + 0.5);
    } else {
      bala = efecto(scene, scene.add.image(x + vx * 16, y + vy * 16, 'gfs_orbe')).setScale(1.25).setDepth(capa + 0.5);
      if (bala.setBlendMode && window.Phaser && Phaser.BlendModes) bala.setBlendMode(Phaser.BlendModes.ADD);
    }
    scene.tweens.add({ targets: bala, x: x + vx * largo, y: y + vy * largo, duration: dur, ease: 'Linear',
      onComplete: function () {
        if (!bala.scene) return;
        // Al llegar: la flecha se queda un instante y se apaga; el rayo estalla en un destello.
        scene.tweens.add({ targets: bala, alpha: 0, scale: def.distancia === 'orbe' ? 2.4 : bala.scale, duration: def.distancia === 'orbe' ? 220 : 140,
          onComplete: function () { if (bala.scene) bala.destroy(); } });
      } });
    return dur;
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
      tajo.innerHTML = ICONOS.tajo;
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
    st.boton = b; st.botonTajo = tajo; st.onEquipo = b._gfe; st.onTajo = tajo._gfe;
    var poderes = document.getElementById('gf-espada-poderes');
    if (!poderes) { poderes = document.createElement('div'); poderes.id = 'gf-espada-poderes'; document.body.appendChild(poderes); }
    poderes.innerHTML = '';
    poderes.setAttribute('role', 'toolbar');
    poderes.setAttribute('aria-label', 'Sword powers');
    st.botonesPoder = [];
    Object.keys(PODERES).forEach(function (tecla) {
      var boton = document.createElement('button'); boton.type = 'button'; boton.tabIndex = -1;
      boton.className = 'gf-poder';
      boton.setAttribute('data-tecla', tecla);
      boton.setAttribute('aria-label', PODERES[tecla].nombre + ' (' + tecla.toUpperCase() + ')');
      boton.title = PODERES[tecla].nombre + ' — ' + tecla.toUpperCase();
      // El dibujo, la tecla en una esquina, el reloj de la espera y sus segundos.
      boton.innerHTML = ICONOS[tecla] + '<span class="gf-poder-tecla">' + tecla.toUpperCase() + '</span>' +
        '<span class="gf-poder-reloj"></span><span class="gf-poder-seg"></span>';
      var activar = function (e) { e.preventDefault(); e.stopPropagation(); usarPoder(st, tecla); };
      boton.addEventListener('pointerdown', activar); poderes.appendChild(boton);
      st.botonesPoder.push({ boton: boton, activar: activar, tecla: tecla, reloj: boton.querySelector('.gf-poder-reloj'), seg: boton.querySelector('.gf-poder-seg') });
    });
    /* El botón de golpe va DENTRO del panel: en el móvil el abanico de poderes
       se dibuja a su alrededor y los dos se mueven juntos (gf-hud-ajuste). */
    poderes.appendChild(tajo);
    st.panelPoderes = poderes;
  }

  function esTactil() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }

  function caja(id) {
    var e = document.getElementById(id);
    if (!e || e.hidden) return null;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  /**
   * Dónde va el panel. PC: a la derecha de la barra rápida y a su altura (si
   * no cabe antes de la columna de botones redondos, encima de su extremo
   * derecho). Móvil: en la esquina del pulgar, a la izquierda de la columna
   * redonda y encima de la barra (o a ras de suelo si la barra no llega).
   * Se escribe en dos variables de CSS; si aun así pisara algo, gf-hud-ajuste
   * lo aparta.
   */
  function colocarPanel(st) {
    var panel = st.panelPoderes;
    if (!panel || !panel.isConnected || panel.hidden) return;
    var W = window.innerWidth, H = window.innerHeight;
    var tactil = esTactil();
    panel.classList.toggle('gf-tactil', tactil);
    var barra = caja('quick-slots-bar'), col = caja('round-buttons-container'), espada = caja('gf-espada-btn');
    var ancho = panel.offsetWidth || 180, alto = panel.offsetHeight || 64;
    var right = null, bottom = null;
    if (!tactil) {
      if (barra && (!col || barra.right + 12 + ancho <= col.left - 10)) {
        right = W - (barra.right + 12 + ancho);
        bottom = H - barra.bottom + Math.max(0, (barra.height - alto) / 2);
      } else if (barra) {
        // Encima de su extremo derecho (y del botón de la espada, si flota
        // encima de la bolsa como en las ventanas estrechas).
        var tope = barra.top;
        if (espada && espada.bottom <= barra.top + 4 && espada.right > barra.right - ancho) tope = Math.min(tope, espada.top);
        right = W - barra.right;
        bottom = H - tope + 10;
      }
    } else {
      right = col ? W - col.left + 8 : 14;
      var x0 = W - right - ancho;
      var techo = H;
      // La barra (y el botón de la espada, que en el teléfono flota encima de
      // la bolsa) solo cuentan si quedan debajo del panel.
      [barra, espada].forEach(function (r) { if (r && r.right > x0 && r.left < W - right) techo = Math.min(techo, r.top); });
      bottom = H - techo + 8;
    }
    if (right === null) return;
    var r = Math.max(4, Math.round(right)) + 'px', b = Math.max(4, Math.round(bottom)) + 'px';
    if (panel.style.getPropertyValue('--gfe-right') !== r) panel.style.setProperty('--gfe-right', r);
    if (panel.style.getPropertyValue('--gfe-bottom') !== b) panel.style.setProperty('--gfe-bottom', b);
    if (window.GFHudAjuste && window.GFHudAjuste.ajustar) { try { window.GFHudAjuste.ajustar(); } catch (e) {} }
  }

  function fantasma(scene) {
    return !!(window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene));
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
    b.title = lista ? ESPADAS[equipada].nombre + ' equipped (SPACE to ' + (esDistancia(equipada) ? 'shoot' : 'swing') + ') — click to change'
                       : 'Equip a weapon';
    var tactil = esTactil();
    if (st.botonTajo) st.botonTajo.hidden = !(lista && tactil);
    var muerto = fantasma(st.scene);
    if (st.panelPoderes) {
      var antes = st.panelPoderes.hidden;
      st.panelPoderes.hidden = !lista;
      st.panelPoderes.classList.toggle('gf-fantasma', muerto);
      // Al aparecer (o al cambiar de PC a táctil) se vuelve a medir su sitio.
      if (lista && (antes || st.panelTactil !== tactil)) { st.panelTactil = tactil; colocarPanel(st); }
    }
    st.enfriando = false;
    (st.botonesPoder || []).forEach(function (p) {
      var espera = Math.max(0, ((st.poderEn || {})[p.tecla] || 0) - st.scene.time.now);
      var total = (st.poderTotal || {})[p.tecla] || PODERES[p.tecla].espera || 1;
      var listo = espera <= 0;
      if (!listo) st.enfriando = true;
      p.boton.disabled = !listo || muerto;
      p.boton.classList.toggle('esperando', !listo);
      // El reloj: la parte oscura es lo que falta.
      var frac = listo ? 0 : Math.min(1, espera / total);
      var f = frac.toFixed(3);
      if (p.reloj && p.reloj.style.getPropertyValue('--p') !== f) p.reloj.style.setProperty('--p', f);
      var txt = listo ? '' : String(Math.ceil(espera / 1000));
      if (p.seg && p.seg.textContent !== txt) p.seg.textContent = txt;
      // Al quedar listo, un destello (una vez).
      if (listo && p.esperaba) {
        p.boton.classList.remove('listo'); void p.boton.offsetWidth; p.boton.classList.add('listo');
      }
      p.esperaba = !listo;
    });
  }

  function cerrarMenu() {
    clearTimeout(menuReloj); menuReloj = null;
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
          aviso(st.scene, '⚔ ' + ESPADAS[id].nombre + ' equipped — press SPACE to ' + (esDistancia(id) ? 'shoot' : 'swing'), 'info');
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
    menuReloj = setTimeout(function () { menuReloj = null; if (m.isConnected && document.getElementById('gf-espada-menu') === m) document.addEventListener('pointerdown', cerrarMenuFuera, true); }, 0);
  }

  // ───────────────────────────────────────────────────────── EL GOLPE
  function mostrarDano(scene, x, y, valor) {
    if (!scene || !scene.add || !scene.add.text || !(valor > 0) || ![x, y, valor].every(Number.isFinite)) return;
    var texto = efecto(scene, scene.add.text(x, y - 14, String(Math.round(valor * 10) / 10), {
      fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#fff3bd', stroke: '#231723', strokeThickness: 3
    })).setOrigin(0.5).setDepth(9600);
    scene.tweens.add({ targets: texto, y: y - 62, alpha: 0, duration: 720, onComplete: function () { if (texto.scene) texto.destroy(); } });
  }

  function usarPoder(st, tecla) {
    var poder = Object.prototype.hasOwnProperty.call(PODERES, tecla) ? PODERES[tecla] : null, scene = st.scene;
    if (!poder || !scene || !equipada || cuantas(scene, equipada) <= 0 || scene._cambiandoEscena || scene._accionPersonaje === 'pesca') return false;
    if (fantasma(scene)) { window.GFMuerte.bloquear(scene, 'attack'); return false; }
    st.poderEn = st.poderEn || {};
    st.poderTotal = st.poderTotal || {};
    if (scene.time.now < (st.poderEn[tecla] || 0) || scene.time.now < st.listoEn) return false;
    var espera = poder.guardia ? poder.espera : poder.espera * (1 - Math.min(0.3, (Number((scene.skillAllocations || {}).wisdom) || 0) * 0.02));
    st.poderEn[tecla] = scene.time.now + espera;
    st.poderTotal[tecla] = espera;
    if (poder.guardia) {
      st.listoEn = scene.time.now + 300;
      var api = window.GFMascota && window.GFMascota.api;
      if (!api) return false;
      api('/api/player/sword-power', { ability: 'guard' }).then(function (r) {
        if (scene.__gfEspada !== st || !r.ok) { if (scene.__gfEspada === st) st.poderEn.n = 0; return; }
        var p = scene.player;
        if (!p || !p.scene || !p.active) return;
        if (st.escudo) st.escudo.destroy();
        var escudo = scene.add.ellipse(p.x, p.y - 14, 58, 66, 0x7fb8e8, 0.12).setStrokeStyle(2, 0xc8eeff, 0.85).setDepth((p.depth || p.y) + 1);
        st.escudo = escudo; st.guardiaHasta = scene.time.now + 3000;
      }).catch(function () { if (scene.__gfEspada === st) st.poderEn.n = 0; });
    } else golpe(st, poder, tecla);
    pintar(st); return true;
  }

  function golpe(st, poder, tecla) {
    var scene = st.scene, p = scene && scene.player;
    if (!p || !p.scene || !equipada || scene._cambiandoEscena) return;
    if (cuantas(scene, equipada) <= 0) return;          // vendida o aún sin cargar
    if (scene._accionPersonaje === 'pesca') return;
    // Siendo fantasma no se pelea (y se dice por qué).
    if (fantasma(scene)) { window.GFMuerte.bloquear(scene, 'attack'); return; }
    var def = Object.assign({}, ESPADAS[equipada]);
    var lejos = !!def.distancia;
    var mejoras = scene.skillAllocations || {};
    def.dano *= 1 + Math.min(1, (Number(mejoras.strength) || 0) * 0.04);
    def.alcance *= 1 + Math.min(0.35, (Number(mejoras.combat) || 0) * 0.015);
    // A distancia los poderes casi no alargan (300 px ya es mucho): pegan más.
    if (poder) { def.alcance *= lejos ? Math.min(1.3, poder.alcance) : poder.alcance; def.dano *= poder.dano; }
    var ahora = scene.time.now;
    if (ahora < st.listoEn) return;
    st.listoEn = ahora + def.enfria;
    texturas(scene);
    var dir = ['left', 'right', 'up', 'down'].indexOf(scene.lastDirection) >= 0 ? scene.lastDirection : 'right';
    // Que los demás de la sala lo vean (la mina y el mapa salvaje).
    if (window.GFMobsRed && window.GFMobsRed.anunciarTajo) {
      try { window.GFMobsRed.anunciarTajo(scene, dir, equipada, tecla || null); } catch (e) {}
    }
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    var mano = { right: [14, 7], left: [-14, 7], up: [-8, 0], down: [10, 12] }[dir];
    var cx = p.x + mano[0], cy = p.y + mano[1];
    var prof = dir === 'up' ? (p.depth || p.y) - 1 : (p.depth || p.y) + 1;
    if (lejos) { disparo(st, def, dir, cx, cy, prof, poder); return; }

    // La espada barre el arco desde la mano.
    var k = 'gfs_' + equipada;
    var arma = scene.textures.exists(k) ? efecto(scene, scene.add.image(cx, cy, k)).setOrigin(0.15, 0.85).setScale(2.2) : null;
    if (arma) arma.setDepth(prof);
    var barrido = poder ? poder.arco : 1.3;
    var desde = ang - barrido, hasta = ang + barrido;
    if (dir === 'left') { desde = ang + barrido; hasta = ang - barrido; }
    // El dibujo de la espada apunta arriba a la derecha (45°): se compensa.
    var BASE = -Math.PI / 4;
    if (arma) arma.rotation = desde - BASE;
    var fx = efectos(scene), counter;
    counter = scene.tweens.addCounter({ from: 0, to: 1, duration: 170, ease: 'Cubic.easeOut', onUpdate: function (tw) {
      if (!arma || !arma.scene) return;
      var t = tw.getValue();
      var estocada = poder && poder.arco < 1 ? Math.sin(t * Math.PI) * 30 : 0;
      arma.setPosition(p.x + mano[0] + Math.cos(ang) * estocada, p.y + mano[1] + Math.sin(ang) * estocada);
      arma.rotation = estocada ? ang - BASE : desde + (hasta - desde) * t - BASE;
    }, onComplete: function () {
      fx.counters.delete(counter);
      if (arma && arma.scene) scene.tweens.add({ targets: arma, alpha: 0, duration: 90, onComplete: function () { arma.destroy(); } });
    } });
    fx.counters.add(counter);

    // La estela.
    var tajo = efecto(scene, scene.add.image(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18, 'gfs_tajo'))
      .setRotation(ang).setDepth(prof + 0.5).setScale(def.alcance / 44).setAlpha(0.95).setTint(def.color);
    if (tajo.setBlendMode && window.Phaser && Phaser.BlendModes) tajo.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: tajo, alpha: 0, scale: tajo.scale * 1.15, duration: 230, ease: 'Quad.easeOut', onComplete: function () { tajo.destroy(); } });
    if (poder && poder.arco >= Math.PI) {
      var rueda = efecto(scene, scene.add.circle(cx, cy, def.alcance, def.color, 0.08)).setStrokeStyle(2, def.color, 0.8).setDepth(prof + 0.5);
      scene.tweens.add({ targets: rueda, alpha: 0, scale: 1.15, duration: 260, onComplete: function () { rueda.destroy(); } });
    }

    danar(st, cx, cy, dir, def.alcance + 18, def.dano, poder, 0);
  }

  /**
   * El daño (2026-10-21: sacado de `golpe` para que lo compartan el tajo y el
   * disparo). Da a los animales y a todo lo apuntado con agregarObjetivo y
   * devuelve los puntos tocados. `vuela` > 0: los destellos y los números
   * salen cuando el proyectil LLEGA a cada uno (px/s del disparo).
   */
  function danar(st, cx, cy, dir, alcance, dano, poder, vuela) {
    var scene = st.scene;
    var res = window.GFAnimales && window.GFAnimales.golpear
      ? window.GFAnimales.golpear(scene, cx, cy, dir, alcance, dano, poder)
      : { tocados: 0, muertos: 0, puntos: [] };
    /* Y los demás que se hayan apuntado (2026-10-10): los zombis de la mina
       (gf-mina-zombis.js), los monstruos y los jugadores de la zona PVP. Cada
       uno devuelve lo mismo que GFAnimales.golpear y se suma. */
    objetivos.slice().forEach(function (fn) {
      try {
        var r2 = fn(scene, cx, cy, dir, alcance, dano, poder);
        if (!r2) return;
        res.tocados += r2.tocados || 0;
        res.muertos += r2.muertos || 0;
        if (Array.isArray(r2.puntos)) res.puntos = res.puntos.concat(r2.puntos);
      } catch (e) {}
    });
    res.puntos.forEach(function (pt) {
      var verlo = function () {
        if (!scene.sys || !scene.sys.isActive()) return;
        if (pt.dano > 0) mostrarDano(scene, pt.x, pt.y, pt.dano);
        var ch = efecto(scene, scene.add.image(pt.x, pt.y, 'gfs_chispa')).setDepth(9000).setScale(1.6);
        if (ch.setBlendMode && window.Phaser && Phaser.BlendModes) ch.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: ch, scale: 0.2, alpha: 0, rotation: 1, duration: 260, onComplete: function () { ch.destroy(); } });
      };
      var tarda = vuela > 0 ? Math.round(Math.hypot(pt.x - cx, pt.y - cy) / vuela * 1000) : 0;
      if (tarda > 16) scene.time.delayedCall(tarda, verlo); else verlo();
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
    return res;
  }

  /**
   * (2026-10-21) El arco y el bastón. El daño va por un cono ESTRECHO y largo
   * (CONO_DISTANCIA) y se ve volar la flecha o el rayo, que atraviesan. Con el
   * remolino (V) es una ráfaga de tres en abanico; con la estocada (B), un
   * tiro más fuerte y algo más largo.
   */
  function disparo(st, def, dir, cx, cy, prof, poder) {
    var scene = st.scene;
    var rafaga = !!(poder && poder.arco >= Math.PI);
    danar(st, cx, cy, dir, def.alcance, def.dano, { arco: rafaga ? 0.5 : CONO_DISTANCIA }, VEL_DISPARO);
    dibujarDisparo(scene, cx, cy, dir, equipada, def.alcance, prof);
    if (rafaga) [-0.4, 0.4].forEach(function (a) { dibujarDisparo(scene, cx, cy, dir, equipada, def.alcance, prof, a); });
  }

  // ───────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events) return null;
    if (scene.__gfEspada) return scene.__gfEspada;
    var st = { scene: scene, listoEn: 0, ultimo: 0 };
    scene.__gfEspada = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar); scene.events.once('destroy', st.onApagar);
    try {
    botones(st);
    pintar(st);
    if (window.GFCharacterSkills) window.GFCharacterSkills.montar(scene);
    } catch (e) { desmontar(scene); console.warn('[espada]', e); return null; }
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
    st.teclasPoder = {};
    if (scene.input && scene.input.keyboard) Object.keys(PODERES).forEach(function (tecla) {
      var fn = function (ev) { var el = document.activeElement; if (ev && ev.repeat || el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return; usarPoder(st, tecla); };
      st.teclasPoder[tecla] = fn; scene.input.keyboard.on('keydown-' + tecla.toUpperCase(), fn);
    });
    st.onUpdate = function (t) {
      if (st.escudo) {
        if (t >= st.guardiaHasta) { st.escudo.destroy(); st.escudo = null; }
        else if (scene.player) st.escudo.setPosition(scene.player.x, scene.player.y - 14);
      }
      // Con un poder esperando, el reloj se repinta más a menudo (suave).
      if (t - st.ultimo > (st.enfriando ? 100 : 250)) { st.ultimo = t; pintar(st); }
      // El sitio del panel, cada segundo (el HUD cambia al abrir paneles).
      if (t - (st.ultimoSitio || 0) > 1000) { st.ultimoSitio = t; colocarPanel(st); }
    };
    scene.events.on('update', st.onUpdate);
    st.onVentana = function () { colocarPanel(st); };
    window.addEventListener('resize', st.onVentana);
    window.addEventListener('orientationchange', st.onVentana);
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfEspada;
    if (!st) return;
    scene.__gfEspada = null;
    if (scene.__gfEspadaFx) scene.__gfEspadaFx.cerrar();
    if (st.onVentana) {
      window.removeEventListener('resize', st.onVentana);
      window.removeEventListener('orientationchange', st.onVentana);
    }
    if (scene.input && scene.input.keyboard && st.onTecla) scene.input.keyboard.off('keydown-SPACE', st.onTecla);
    if (scene.input && scene.input.keyboard) Object.keys(st.teclasPoder || {}).forEach(function (tecla) { scene.input.keyboard.off('keydown-' + tecla.toUpperCase(), st.teclasPoder[tecla]); });
    (st.botonesPoder || []).forEach(function (p) { p.boton.removeEventListener('pointerdown', p.activar); });
    if (st.botonTajo && st.panelPoderes && st.botonTajo.parentNode === st.panelPoderes) document.body.appendChild(st.botonTajo);
    if (st.panelPoderes) st.panelPoderes.remove();
    if (st.escudo) st.escudo.destroy();
    if (st.boton && st.boton._gfe === st.onEquipo) { st.boton.removeEventListener('click', st.onEquipo); st.boton._gfe = null; }
    if (st.botonTajo && st.botonTajo._gfe === st.onTajo) { st.botonTajo.removeEventListener('pointerdown', st.onTajo); st.botonTajo._gfe = null; }
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
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
    equipar: function (id) { if (id === null || Object.prototype.hasOwnProperty.call(ESPADAS, id)) { equipada = id; guardar(); } return equipada; },
    golpear: function (scene) { var st = scene && scene.__gfEspada; if (st) golpe(st); },
    /** fn(scene, cx, cy, dir, alcance, dano) -> { tocados, muertos, puntos } */
    agregarObjetivo: function (fn) { if (typeof fn === 'function' && objetivos.indexOf(fn) < 0) objetivos.push(fn); },
    quitarObjetivo: function (fn) { var i = objetivos.indexOf(fn); if (i >= 0) objetivos.splice(i, 1); },
    ESPADAS: ESPADAS,
    /** (2026-10-21) ¿Es el arco o el bastón? Y su disparo visto (para los demás jugadores). */
    esDistancia: esDistancia,
    dibujarDisparo: dibujarDisparo
    , mostrarDano: mostrarDano, usarPoder: function (scene, tecla) { var st = scene && scene.__gfEspada; return st ? usarPoder(st, tecla) : false; }, PODERES: PODERES
  };
})();
