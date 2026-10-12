/* ===========================================================================
 * LOS FANTASMAS Y LOS MAGOS DE LA MINA                             (2026-10-11)
 *
 * Dos de cada, repartidos lejos de la entrada. El FANTASMA flota, avisa con
 * una franja en el suelo y embiste por ella; el MAGO guarda la distancia,
 * marca dónde vas a estar y lanza tres orbes. El daño lo pone el servidor
 * (`fantasma_mina`, `mago_mina` en /api/stats/:p/consume) y el botín también
 * (/api/monstruos/derrotado; los montones del suelo los lleva la serpiente,
 * GFMinaSerpiente._botin).
 *
 * EL DIBUJO (2026-10-11): "los fantasmas no tienen brazos pero el personaje
 * principal sí, y eso no es respetar los gráficos del juego". Ya no son
 * rectángulos pintados aquí: son PNG hechos sobre los fotogramas reales de
 * los personajes (tools/generar-monstruos.py, atlas `espectro` y `mago`), con
 * sus brazos, sus cuatro direcciones y sus siete pasos. El fantasma lleva una
 * cola que ondea en vez de piernas; el mago, capucha, túnica y báculo.
 *
 * ARREGLOS (2026-10-11): "los fantasmas en la mina, al pegarse a mí, se
 * bugean, y las brujas también; me golpean estando en fantasma; la sombra de
 * la bruja está mal ubicada".
 *   · Pegados al jugador temblaban: seguían empujando hacia su centro y el
 *     ángulo daba la vuelta en cada fotograma, así que cambiaban de dirección
 *     (y de animación) sesenta veces por segundo. Ahora el fantasma se PARA a
 *     unos pasos y la mirada tiene histéresis: solo gira si el cambio es claro
 *     y no antes de un cuarto de segundo. El mago tiene una franja en la que
 *     ni se acerca ni se aleja.
 *   · La bruja (el mago) flotaba como el fantasma: los pies quedaban 10-16 px
 *     por encima de su sombra. Ahora pisa el suelo y la sombra va bajo sus
 *     pies; el fantasma sí flota, y su sombra se encoge al subir.
 *   · Muerto (fantasma o con la vida a 0) ni te persiguen ni te hacen daño.
 *
 * LOS MISMOS PARA TODOS (2026-10-11, gf-mobs-red.js): uno de la sala piensa
 * por ellos (persiguen al jugador más cercano, sea quien sea); la embestida y
 * los orbes se anuncian y cada uno mira si le alcanzan a él.
 *
 * CÓMO SE ENGANCHA:  MinaScene, al construir:  GFMinaEspectros.montar(this)
 * ======================================================================== */
(function () {
  'use strict';

  var ESCALA = 2.3;
  var N = 4;                              // dos fantasmas y dos magos
  var DIR_ES = { right: 'derecha', left: 'izquierda', up: 'arriba', down: 'abajo' };
  var DIRS = ['down', 'up', 'left', 'right'];
  var PARADA_FANTASMA = 46;               // a esta distancia del blanco, se para
  var GIRO_MS = 240;                      // no cambia de mirada antes de esto

  /** Carga los dibujos (ver gf-monstruos-arte.js). Devuelve una promesa. */
  function textures(scene) {
    var A = window.GFMonstruosArte;
    if (!A) return Promise.resolve(false);
    return A.cargar(scene, ['espectro', 'mago'], ['gfm_orbe_mago']);
  }

  function free(scene, x, y) {
    return x > 80 && y > 100 && x < scene.map.widthInPixels - 80 && y < scene.map.heightInPixels - 80 &&
      (!scene._chocaConEscenario || !scene._chocaConEscenario(x - 20, y - 12, 40, 24));
  }
  function api(route, body) { return window.GFMascota.api(route, body); }

  /** ¿Mi jugador está muerto (fantasma o con la vida a 0)? */
  function muerto() {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto();
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost);
    } catch (e2) { return false; }
  }

  function cercaDeMi(st, x, y, r) {
    var p = st.scene.player;
    return !!(p && Math.hypot(p.x - x, p.y + 40 - y) < (r || 700));
  }

  /** Un anillo que se abre: el golpe, la muerte. Un solo anillo, liso. */
  function effect(st, x, y, color) {
    var ring = st.scene.add.circle(x, y, 8, color, 0.2).setStrokeStyle(2, color).setDepth(y + 2);
    st.scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 400, onComplete: function () { ring.destroy(); } });
  }

  function hurt(st, reason) {
    if (st.scene.time.now < st.hurtAt || muerto()) return;
    st.hurtAt = st.scene.time.now + 950;
    api('/api/stats/' + encodeURIComponent(st.scene.playerName) + '/consume', { reason: reason }).then(function (r) {
      if (!st.vivo || !r.ok) return;
      if (window.GFCharacterSkills) window.GFCharacterSkills.applyStats(st.scene, r.datos.stats);
      if (r.datos.stats && r.datos.stats.vida <= 0 && window.GFMascota.declararMuerte) window.GFMascota.declararMuerte();
      var p = st.scene.player;
      if (p && p.scene) {
        p.setTintFill(0xff8888);
        st.scene.time.delayedCall(100, function () { if (p.scene) p.clearTint(); });
      }
    }).catch(function () {});
  }

  /** Muere; el botín, solo para quien lo mató (`por`). */
  function die(st, m, por) {
    if (!m.alive) return;
    m.alive = false;
    m.health = 0;
    m.charging = false;
    m.returnAt = st.scene.time.now + (m.mage ? 480000 : 300000);
    m.sprite.setVisible(false); m.shadow.setVisible(false); m.bar.setVisible(false);
    if (m.warning) { m.warning.destroy(); m.warning = null; }
    effect(st, m.x, m.y - 30, m.mage ? 0xff966a : 0x9be6d9);
    var mio = st.red ? (por && st.red.soy(por)) : true;
    if (!mio) return;
    api('/api/monstruos/derrotado', { tipo: m.mage ? 'mago_mina' : 'fantasma_mina', n: m.n }).then(function (r) {
      if (!st.vivo || !r.ok || !r.datos.ok) return;
      var d = r.datos;
      if (Number.isFinite(Number(d.expTotal))) st.scene.nivel_exp = Math.max(Number(st.scene.nivel_exp) || 0, Number(d.expTotal));
      try { st.scene._nivelDesdeExp && st.scene._nivelDesdeExp(); } catch (e) {}
      var loot = window.GFMinaSerpiente._botin;
      (d.botin || []).forEach(function (b, i) {
        var a = i * Math.PI * 1.25, tx = m.x + Math.cos(a) * 35, ty = m.y + Math.sin(a) * 22;
        if (!free(st.scene, tx, ty)) { tx = m.x; ty = m.y; }
        loot.crear(st, b, m.x, m.y, tx, ty, d.caducaMs || 600000);
      });
    }).catch(function () {});
  }

  function revive(st, m) {
    m.alive = true; m.health = m.max; m.x = m.homeX; m.y = m.homeY; m.objX = m.x; m.objY = m.y;
    m.charging = false;
    m.sprite.setVisible(true).setAlpha(m.mage ? 1 : 0.86);
    m.shadow.setVisible(true);
  }

  function destello(st, m) {
    m.sprite.setTintFill(0xffffff);
    st.scene.time.delayedCall(70, function () { if (m.sprite.active) m.sprite.clearTint(); });
  }

  /** El anfitrión resta (un tajo suyo o de otro: `por`). */
  function aplicarDano(st, m, damage, ux, uy, por) {
    var scene = st.scene;
    if (!m.alive) return 0;
    var taken = Math.min(m.health, damage);
    m.health -= taken;
    m.stagger = scene.time.now + 220;
    var L = Math.hypot(ux, uy) || 1;
    // El empujón, por pasos: si hay pared, se para ANTES de ella (nunca dentro).
    empujar(scene, m, ux / L, uy / L, 16);
    effect(st, m.x, m.y - 40, m.mage ? 0xffaa77 : 0xa9ffff);
    destello(st, m);
    if (st.red) st.red.evento({ e: 'herido', id: m.id });
    if (m.health <= 0) {
      die(st, m, por);
      if (st.red) st.red.evento({ e: 'muere', id: m.id, por: por || null });
    }
    return taken;
  }

  /** El tajo de la espada (gf-espada.js). */
  function hit(st, scene, cx, cy, dir, range, damage, power) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    if (!st.vivo || st.scene !== scene) return out;
    var anfitrion = !st.red || st.red.esHost();
    var angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    st.mobs.forEach(function (m) {
      if (!m.alive) return;
      var dx = m.x - cx, dy = m.y - 42 - cy, d = Math.hypot(dx, dy);
      var delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (d > range + 26 || Math.abs(delta) > (power && power.arco || 1.35) && d > 26) return;
      out.tocados++;
      if (anfitrion) {
        var taken = aplicarDano(st, m, damage, dx, dy, st.red ? st.red.miId() : null);
        out.puntos.push({ x: m.x, y: m.y - 60, dano: taken });
        if (!m.alive) out.muertos++;
      } else {
        out.puntos.push({ x: m.x, y: m.y - 60, dano: Math.min(m.health, damage) });
        effect(st, m.x, m.y - 40, m.mage ? 0xffaa77 : 0xa9ffff);
        destello(st, m);
        st.red.golpe({ id: m.id, dano: Math.round(damage * 10) / 10, ux: Math.round(dx), uy: Math.round(dy) });
      }
    });
    return out;
  }

  function empujar(scene, m, ux, uy, dist) {
    for (var k = 0; k < dist; k += 4) {
      var nx = m.x + ux * 4, ny = m.y + uy * 4;
      if (!free(scene, nx, ny)) break;
      m.x = nx; m.y = ny;
    }
  }

  /**
   * La mirada, con histéresis: hacia donde se mueve o, quieto, hacia su
   * blanco; pero solo si el cambio es CLARO (un eje manda un 30 % sobre el
   * otro) y no antes de GIRO_MS desde el último giro. Sin esto, pegado al
   * jugador cambiaba de dirección en cada fotograma ("se bugean").
   */
  function mirar(st, m, vx, vy, px, py) {
    var dx = vx, dy = vy;
    if (Math.abs(dx) + Math.abs(dy) < 1) {
      if (px === null) return;
      dx = px - m.x; dy = py - m.y;
      if (Math.hypot(dx, dy) < 18) return;          // encima: no hay hacia dónde
    }
    var ax = Math.abs(dx), ay = Math.abs(dy);
    var dir;
    if (ax > ay * 1.3) dir = dx > 0 ? 'right' : 'left';
    else if (ay > ax * 1.3) dir = dy > 0 ? 'down' : 'up';
    else return;                                      // en diagonal: se queda como está
    if (dir === m.dir) return;
    var ahora = st.scene.time.now;
    if (m.dir && ahora - m.giroEn < GIRO_MS) return;
    m.giroEn = ahora;
    ponerDir(m, dir);
  }

  function ponerDir(m, dir) {
    m.dir = dir;
    var A = window.GFMonstruosArte, tipo = m.mage ? 'mago' : 'espectro';
    var k = A.anim(tipo, dir);
    if (m.sprite.scene && m.sprite.scene.anims.exists(k)) m.sprite.play(k, true);
    else m.sprite.setFrame(DIR_ES[dir] + '_1');
  }

  /**
   * La embestida del fantasma: aviso en el suelo, y a `chargeAt` sale
   * disparado. El anfitrión lo mueve; TODOS miran si les pilla a ellos.
   */
  function empezarCarga(st, m, angle) {
    var s = st.scene, t = s.time.now;
    m.charging = true; m.chargeAt = t + 650; m.chargeEnd = t + 1250; m.chargeAngle = angle;
    if (m.warning) m.warning.destroy();
    m.warning = s.add.ellipse(m.x + Math.cos(angle) * 85, m.y + Math.sin(angle) * 85, 40, 140, 0x9ee7cf, 0.12)
      .setRotation(angle - Math.PI / 2).setStrokeStyle(2, 0xbfffea, 0.7).setDepth(m.y - 1);
  }

  /** Los orbes del mago: marca (tx, ty) y a los 650 ms tres orbes por `aim`. */
  function lanzarOrbes(st, m, tx, ty, aim) {
    var s = st.scene;
    var warn = s.add.circle(tx, ty, 26, 0xc79cff, 0.16).setStrokeStyle(2, 0xf0bbff, 0.7).setDepth(ty + 2);
    st.warnings.push(warn);
    s.time.delayedCall(650, function () {
      var at = st.warnings.indexOf(warn);
      if (at >= 0) st.warnings.splice(at, 1);
      warn.destroy();
      if (!st.vivo || !m.alive) return;
      for (var j = -1; j <= 1; j++) {
        if (st.shots.length >= 12) break;
        var a2 = aim + j * 0.15;
        var b = s.add.image(m.x, m.y - 55, 'gfm_orbe_mago').setScale(2).setDepth(m.y + 1);
        st.shots.push({ sprite: b, x: m.x, y: m.y - 55, vx: Math.cos(a2) * 210, vy: Math.sin(a2) * 210, until: s.time.now + 2500 });
      }
    });
  }

  /** Coloca el dibujo: el fantasma flota (y su sombra se encoge), el mago pisa. */
  function colocar(st, m, t) {
    if (m.mage) {
      m.sprite.setPosition(m.x, m.y).setDepth(m.y);
      m.shadow.setPosition(m.x, m.y - 2).setDepth(m.y - 1).setScale(1);
    } else {
      var alto = 10 + Math.sin(t / 450 + m.n) * 6;
      m.sprite.setPosition(m.x, m.y - alto).setDepth(m.y);
      m.shadow.setPosition(m.x, m.y - 1).setDepth(m.y - 1).setScale(1 - (alto - 4) * 0.02);
    }
    m.bar.setPosition(m.x, m.y - 162).setDisplaySize(54 * m.health / m.max, 4).setDepth(m.y + 1).setVisible(m.health < m.max && m.alive);
  }

  // ─────────────────────────────────────────────────────── CADA FOTOGRAMA
  function update(st, t, delta) {
    var s = st.scene, p = s.player;
    if (!p) return;
    var dt = Math.min(0.05, delta / 1000), px = p.x, py = p.y + 40;
    if (st.red) st.red.tick(t);
    var anfitrion = !st.red || st.red.esHost();
    st.mobs.forEach(function (m) {
      var d = Math.hypot(px - m.x, py - m.y);
      if (!m.alive) {
        if (anfitrion && t > m.returnAt && !alguienCerca(st, m.homeX, m.homeY, 650)) {
          revive(st, m);
          if (st.red) st.red.evento({ e: 'revive', id: m.id });
        } else return;
      }
      var ver = d < 1250;
      m.sprite.setVisible(ver); m.shadow.setVisible(ver);
      if (anfitrion) pensar(st, m, t, dt);
      else seguir(st, m, t, dt);
      // La embestida: cada uno mira si le pilla a SU jugador.
      if (m.charging && t > m.chargeAt && t < m.chargeEnd && d < 48) hurt(st, 'fantasma_mina');
      if (m.charging && t > m.chargeEnd) { m.charging = false; if (m.warning) { m.warning.destroy(); m.warning = null; } }
      colocar(st, m, t);
    });
    for (var i = st.shots.length - 1; i >= 0; i--) {
      var b = st.shots[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.sprite.setPosition(b.x, b.y).setDepth(b.y + 30).setRotation(b.sprite.rotation + dt * 5);
      var contact = Math.hypot(px - b.x, py - 35 - b.y) < 24;
      if (contact || t > b.until || !free(s, b.x, b.y + 30)) {
        if (contact) hurt(st, 'mago_mina');
        effect(st, b.x, b.y, 0xc8a3ed);
        b.sprite.destroy();
        st.shots.splice(i, 1);
      }
    }
    window.GFMinaSerpiente._botin.actualizar(st, { x: px, y: py - 40 });
  }

  function alguienCerca(st, x, y, r) {
    var lista = window.GFMobsRed ? window.GFMobsRed.jugadores(st.scene) : [];
    if (!window.GFMobsRed && st.scene.player) lista = [{ x: st.scene.player.x, y: st.scene.player.y + 45 }];
    for (var i = 0; i < lista.length; i++) if (Math.hypot(lista[i].x - x, lista[i].y - 5 - y) < r) return true;
    return false;
  }

  /** Anfitrión: persigue al más cercano, para a tiempo y ataca. */
  function pensar(st, m, t, dt) {
    var s = st.scene;
    var b = window.GFMobsRed ? window.GFMobsRed.masCercano(s, m.x, m.y + 5, 620)
                             : (!muerto() ? { x: s.player.x, y: s.player.y + 45, d: Math.hypot(s.player.x - m.x, s.player.y + 40 - m.y) } : null);
    if (b && b.d > 620) b = null;
    var vx = 0, vy = 0;
    var bx = b ? b.x : null, by = b ? b.y - 5 : null;
    if (t >= m.stagger && (b || m.charging)) {
      var d = b ? Math.hypot(bx - m.x, by - m.y) : 999;
      var angle = b ? Math.atan2(by - m.y, bx - m.x) : m.chargeAngle;
      var speed;
      if (m.charging) {
        speed = t < m.chargeAt ? 0 : 240;
        angle = m.chargeAngle;
      } else if (m.mage) {
        // Una franja en la que ni se acerca ni se aleja: sin vaivén.
        speed = d < 150 ? -55 : d > 300 ? 45 : 0;
      } else {
        speed = d > PARADA_FANTASMA ? 62 : 0;            // pegado: se para
      }
      if (speed) {
        var step = speed * dt, nx = m.x + Math.cos(angle) * step, ny = m.y + Math.sin(angle) * step;
        var x0 = m.x, y0 = m.y;
        if (free(s, nx, ny)) { m.x = nx; m.y = ny; }
        else {
          // Bloqueado: prueba a rodear la pared en abanico.
          for (var k = 1; k < 5; k++) {
            var a = angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.65;
            nx = m.x + Math.cos(a) * Math.abs(step); ny = m.y + Math.sin(a) * Math.abs(step);
            if (free(s, nx, ny)) { m.x = nx; m.y = ny; break; }
          }
        }
        vx = m.x - x0; vy = m.y - y0;
      }
      if (b && t > m.attackAt && !m.charging) {
        m.attackAt = t + (m.mage ? 3500 : 4200);
        if (m.mage) {
          var vel = b.local ? window.GFMinaSerpiente._interno.velocidadJugador(s) : { x: 0, y: 0 };
          var tx = bx + vel.x * 0.35, ty = by - 35 + vel.y * 0.35, aim = Math.atan2(ty - (m.y - 55), tx - m.x);
          lanzarOrbes(st, m, tx, ty, aim);
          if (st.red) st.red.evento({ e: 'orbes', id: m.id, tx: Math.round(tx), ty: Math.round(ty), a: Number(aim.toFixed(3)) });
        } else {
          empezarCarga(st, m, angle);
          if (st.red) st.red.evento({ e: 'carga', id: m.id, a: Number(angle.toFixed(3)), x: Math.round(m.x), y: Math.round(m.y) });
        }
      }
    }
    mirar(st, m, vx, vy, bx, by);
  }

  /** Invitado: sigue la foto del anfitrión, suavizando. */
  function seguir(st, m, t, dt) {
    var dx = m.objX - m.x, dy = m.objY - m.y, d = Math.hypot(dx, dy);
    var x0 = m.x, y0 = m.y;
    if (d > 240) { m.x = m.objX; m.y = m.objY; }
    else if (d > 0.3) { var k = Math.min(1, dt * 9); m.x += dx * k; m.y += dy * k; }
    if (m.dirRed && m.dirRed !== m.dir) ponerDir(m, m.dirRed);
    else if (!m.dir) ponerDir(m, 'down');
  }

  // ── LA RED ───────────────────────────────────────────────────────────────
  function exportar(st) {
    return st.mobs.map(function (m) {
      return [m.id, Math.round(m.x), Math.round(m.y), (m.alive ? 1 : 0) | (m.charging ? 2 : 0),
              Math.max(0, Math.round(m.health)), Math.max(0, DIRS.indexOf(m.dir))];
    });
  }

  function importar(st, lista) {
    lista.forEach(function (f) {
      var m = st.porId[f[0]];
      if (!m || !Array.isArray(f)) return;
      var vivo = !!(f[3] & 1);
      m.objX = Number(f[1]) || m.x; m.objY = Number(f[2]) || m.y;
      m.health = Math.min(m.max, Math.max(0, Number(f[4]) || 0));
      m.dirRed = DIRS[f[5]] || m.dir;
      if (vivo && !m.alive) { revive(st, m); m.x = m.objX; m.y = m.objY; }
      else if (!vivo && m.alive) die(st, m, null);
    });
  }

  function alEvento(st, d) {
    var m = st.porId[d.id];
    if (!m) return;
    if (d.e === 'revive') { if (!m.alive) revive(st, m); return; }
    if (d.e === 'muere') { if (m.alive) die(st, m, d.por || null); return; }
    if (!m.alive) return;
    if (d.e === 'herido') { destello(st, m); return; }
    if (d.e === 'carga') {
      // La carga sale de donde la vio el anfitrión.
      if (Number.isFinite(Number(d.x))) { m.x = m.objX = Number(d.x); m.y = m.objY = Number(d.y); }
      empezarCarga(st, m, Number(d.a) || 0);
      return;
    }
    if (d.e === 'orbes') lanzarOrbes(st, m, Number(d.tx), Number(d.ty), Number(d.a) || 0);
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || scene.__gfEspectros) return;
    var st = { scene: scene, vivo: true, mobs: [], porId: {}, red: null, shots: [], warnings: [], botin: [], hurtAt: 0, spawn: null };
    scene.__gfEspectros = st;
    st.close = function () {
      st.vivo = false;
      if (st.spawn) st.spawn.remove(false);
      if (st.tick) scene.events.off('update', st.tick);
      scene.events.off('shutdown', st.close);
      scene.events.off('destroy', st.close);
      if (st.target && window.GFEspada) window.GFEspada.quitarObjetivo(st.target);
      if (st.red) { st.red.cerrar(); st.red = null; }
      var li = scene._lucesExtras && scene._lucesExtras.indexOf(st.light);
      if (li >= 0) scene._lucesExtras.splice(li, 1);
      st.mobs.forEach(function (m) { [m.sprite, m.shadow, m.bar, m.warning].forEach(function (o) { if (o) o.destroy(); }); });
      st.shots.forEach(function (b) { b.sprite.destroy(); });
      st.warnings.forEach(function (o) { o.destroy(); });
      if (window.GFMinaSerpiente) window.GFMinaSerpiente._botin.limpiar(st);
      scene.__gfEspectros = null;
      st.mobs.length = st.shots.length = st.warnings.length = 0;
      st.porId = {};
    };
    scene.events.once('shutdown', st.close);
    scene.events.once('destroy', st.close);
    if (window.GFMinaSerpiente) window.GFMinaSerpiente._botin.texturas(scene);
    textures(scene).then(function (ok) {
      if (!st.vivo || scene.__gfEspectros !== st) return;
      if (!ok) { console.warn('[espectros] faltan dibujos de Game/Sprites/monstruos'); return; }
      var A = window.GFMonstruosArte;
      // Los sitios, lejos de la ENTRADA (no del jugador): los mismos en todos
      // los navegadores. Se buscan en varios fotogramas, con las colisiones listas.
      var W = scene.map.widthInPixels, H = scene.map.heightInPixels;
      var entrada = scene._puntoDeAparicion ? scene._puntoDeAparicion() : { x: W / 2, y: 300 };
      st.spawn = scene.time.addEvent({ delay: 90, repeat: N - 1, callback: function () {
        if (!st.vivo) return;
        var index = st.mobs.length, point = null;
        for (var i = 0; i < 100; i++) {
          var x = 100 + ((i * 977 + index * 1319 + 583) % (W - 200)), y = 150 + ((i * 577 + index * 919 + 787) % (H - 300));
          if (free(scene, x, y) && Math.hypot(x - entrada.x, y - entrada.y) > 650) { point = { x: x, y: y }; break; }
        }
        if (!point) return;
        var mage = index >= 2, max = mage ? 150 : 100;
        var spr = scene.add.sprite(point.x, point.y, A.clave(mage ? 'mago' : 'espectro'), 'abajo_1').setOrigin(0.5, 1).setScale(ESCALA);
        // El fantasma es medio transparente; el mago, de carne y hueso.
        if (!mage) spr.setAlpha(0.86);
        var m = { id: index, mage: mage, n: index % 2, x: point.x, y: point.y, homeX: point.x, homeY: point.y, max: max, health: max,
          alive: true, attackAt: scene.time.now + 3000 + index * 500, stagger: 0, dir: null, giroEn: 0,
          objX: point.x, objY: point.y, dirRed: null,
          sprite: spr,
          // La sombra bajo los pies: la del mago, del ancho de su túnica.
          shadow: scene.add.ellipse(point.x, point.y, mage ? 46 : 52, mage ? 14 : 16, 0x000000, mage ? 0.34 : 0.26),
          bar: scene.add.rectangle(point.x, point.y - 162, 54, 4, 0xeba896).setVisible(false) };
        ponerDir(m, 'down');
        st.mobs.push(m);
        st.porId[index] = m;
      } });
      // Compartidos con los demás de la mina (gf-mobs-red.js).
      if (window.GFMobsRed) {
        st.red = window.GFMobsRed.crear(scene, 'espectros', {
          exportar: function () { return exportar(st); },
          importar: function (l) { if (st.vivo) importar(st, l); },
          alEvento: function (d) { if (st.vivo) alEvento(st, d); },
          alGolpe: function (d) {
            var m = st.porId[d.id];
            if (st.vivo && m && m.alive) aplicarDano(st, m, Math.min(250, Number(d.dano) || 0), Number(d.ux) || 0, Number(d.uy) || 0, d.de);
          },
          alCambiarHost: function (soyYo) {
            st.mobs.forEach(function (m) { if (!soyYo) { m.objX = m.x; m.objY = m.y; } });
          }
        });
      }
      st.tick = function (t, d) { if (st.vivo) update(st, t, d); };
      scene.events.on('update', st.tick);
      st.light = function (luz) {
        st.mobs.forEach(function (m) { if (m.alive && m.sprite.visible) luz(m.x, m.y - 85, 90, m.mage ? 0xc891ff : 0x98dace, 0.55); });
        st.shots.forEach(function (b) { luz(b.x, b.y, 60, 0xcc99ff, 0.7); });
      };
      if (!scene._lucesExtras) scene._lucesExtras = [];
      scene._lucesExtras.push(st.light);
      st.target = function () { return hit.apply(null, [st].concat(Array.prototype.slice.call(arguments))); };
      if (window.GFEspada) window.GFEspada.agregarObjetivo(st.target);
    });
  }

  window.GFMinaEspectros = {
    montar: montar,
    _interno: { textures: textures, hit: hit, update: update, mirar: mirar, colocar: colocar,
                estado: function (s) { return s.__gfEspectros; } }
  };
})();
