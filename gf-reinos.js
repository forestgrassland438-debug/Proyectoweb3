/* ===========================================================================
 * LOS SIETE MAPAS DEL ESTE: LO PROPIO DE CADA UNO                  (2026-11-21)
 *
 * "Que los sonidos de climas funcionen bien, que no tenga errores de colisión
 * y debes respetar efectos... no quiero problemas si vas a agregar vientos o
 * más cosas. Buenas animaciones y efectos detallados, sin bugs ni fugas de
 * memoria." Las escenas están en Scenes/ReinosScenes.js (heredan de ZonaScene:
 * monstruos, NPC, bote, fauna, luces de noche y viajes son los de siempre).
 * Aquí, lo que hace distinto a cada mapa:
 *
 *   · PUERTO   el haz del FARO que barre el mar de noche y la brisa marina.
 *   · PANTANO  la BRUMA verdosa a ras de suelo (más espesa de noche), las
 *              bocanadas de gas que suben de las charcas y, de noche, los
 *              fuegos fatuos que vagan sobre el agua.
 *   · ALDOR    los RAYOS de sol entre las columnas (de día y sin lluvia) y los
 *              hilos de arena que corren a ras de suelo.
 *   · COLINAS  las HOJAS de otoño que caen meciéndose y las RACHAS de viento
 *              (cada 75 s, iguales para todos: van con la hora del servidor)
 *              que doblan los árboles y aceleran las hojas.
 *   · SELVA    la luz verde que se cuela entre las copas y la humedad en bandas.
 *   · VOLCÁN   la CENIZA que cae, las BRASAS que suben de la lava, el VAPOR de
 *              las termas y las fumarolas, y los TEMBLORES (cada 3,5 min, a la
 *              vez para todos): la cámara tiembla, retumba y se avisa.
 *   · HONGOS   los VELOS de luz turquesa y violeta en el aire y las luces que
 *              suben despacio de las setas.
 *
 * SIN MOTAS (el dueño tiene tripofobia): todo son bandas, rayas, hojas y
 * resplandores grandes y blandos; nunca puntitos ni racimos. Lo que sale en
 * pantalla es poco (de 6 a 34 piezas), se recicla y se esconde fuera de la
 * cámara. Las texturas se pintan con canvas (sin PNG nuevos).
 *
 * CÓMO SE ENGANCHA:  ZonaScene.create():   GFReinos.montar(this, 'puerto')
 *                    ZonaScene._alApagar:  GFReinos.desmontar(this)
 * Se desmonta solo también con el `shutdown` o el `destroy` de la escena.
 * ======================================================================== */
(function () {
  'use strict';

  var PROF_SUELO = 2.95;     // a ras de suelo: por debajo de todo lo que está de pie (depth = y)
  var PROF_AIRE = 8040;      // en el aire: por encima de todo (la del clima de gf-zonas)
  var REINOS = { puerto: 1, pantano: 1, aldor: 1, colinas: 1, selva: 1, volcan: 1, hongos: 1 };

  // La racha de las colinas y el temblor de la caldera (segundos de la hora del servidor).
  var RACHA = { cada: 75, dura: 7 };
  var TEMBLOR = { cada: 210, dura: 2.6 };
  var ALTO_FARO = 434;       // de su apoyo a la linterna (px de mundo, ya a escala 2; 2026-11-24: el faro 2D, gf_motor_casas.altura_luz)

  /** Vuelve a 0..1 (también lo negativo: en JS, -0.2 % 1 es -0.2). */
  function vuelta(u) { return u - Math.floor(u); }

  function aditivo() { return window.Phaser && Phaser.BlendModes ? Phaser.BlendModes.ADD : 1; }
  function vista(scene) { return scene.cameras && scene.cameras.main ? scene.cameras.main.worldView : null; }
  function cubrir(o, v) {
    o.setPosition(v.x, v.y);
    var w = Math.ceil(v.width), h = Math.ceil(v.height);
    if (o.width !== w || o.height !== h) o.setSize(w, h);
    return o;
  }
  function az(a, b) { return a + Math.random() * (b - a); }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  /** La hora del servidor (la de gf-zonas: la misma para todos). */
  function ahoraServidor() {
    try {
      var z = window.GFZonas && window.GFZonas._interno;
      if (z && z.ahoraServidor) return z.ahoraServidor() / 1000;
    } catch (e) {}
    return Date.now() / 1000;
  }
  /** Cuánta noche hay (0 día, 1 noche), con el mínimo de la escena (la hondonada). */
  function noche(scene) {
    var n = 0;
    try { n = window.GFCiclo && window.GFCiclo.oscuridad ? Number(window.GFCiclo.oscuridad()) || 0 : 0; } catch (e) {}
    return Math.max(0, Math.min(1, Math.max(n, Number(scene && scene._oscuridadMinima) || 0)));
  }
  /** Cuánto llueve de verdad en pantalla (GFClima.ahora: lo pintado, ya suavizado). */
  function lluvia() {
    try { var t = window.GFClima && window.GFClima.ahora ? window.GFClima.ahora() : null; return t && t.activo ? Math.max(0, Math.min(1, t.lluvia || 0)) : 0; }
    catch (e) { return 0; }
  }
  /** Cuánto nublado y cuánto sol de verdad hay en pantalla (0..1, lo pintado por gf-clima). */
  function delTiempo(campo) {
    try { var t = window.GFClima && window.GFClima.ahora ? window.GFClima.ahora() : null; return t && t.activo ? Math.max(0, Math.min(1, Number(t[campo]) || 0)) : 0; }
    catch (e) { return 0; }
  }
  /** Un número de 0 a 1 fijo para cada casilla (ix, iy): el mismo en todas las partidas. */
  function azarFijo(a, b) { var q = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return q - Math.floor(q); }
  /** 0..1: lo que sopla un suceso que se repite cada `cada` s y dura `dura` (entra y sale suave). */
  function campana(t, cada, dura, desfase) {
    var k = (((t + (desfase || 0)) % cada) + cada) % cada;
    if (k > dura) return 0;
    return Math.sin(Math.PI * k / dura);
  }

  // ─────────────────────────────────────────────────────── TEXTURAS (canvas)
  function lienzo(scene, clave, w, h, pinta) {
    if (scene.textures.exists(clave)) return;
    var c = scene.textures.createCanvas(clave, w, h);
    try { pinta(c.getContext(), w, h); c.refresh(); }
    catch (e) { if (scene.textures.exists(clave) && scene.textures.get(clave) === c) scene.textures.remove(clave); throw e; }
  }
  /** Manchas suaves que se repiten sin costura (cada una se pinta 9 veces). */
  function manchasCiclicas(x, w, h, manchas) {
    manchas.forEach(function (m) {
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
        x.save();
        x.translate(m[0] + ox * w, m[1] + oy * h); x.scale(1, m[3]);
        var g = x.createRadialGradient(0, 0, 1, 0, 0, m[2]);
        g.addColorStop(0, m[4]); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, m[2], 0, Math.PI * 2); x.fill();
        x.restore();
      }
    });
  }
  /** Un resplandor redondo y blando (sin borde: nunca se lee como un punto). */
  function resplandor(x, w, h, centro, medio) {
    var g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, Math.min(w, h) / 2);
    g.addColorStop(0, centro); g.addColorStop(0.45, medio); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  function ovalo(x, w, h, color, alfa) {
    x.save(); x.scale(1, h / w);
    var cy = (h / 2) * (w / h);
    var g = x.createRadialGradient(w / 2, cy, 2, w / 2, cy, w / 2);
    g.addColorStop(0, 'rgba(' + color + ',' + alfa + ')'); g.addColorStop(0.6, 'rgba(' + color + ',' + (alfa * 0.4) + ')'); g.addColorStop(1, 'rgba(' + color + ',0)');
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
  }
  function texturas(scene, zona) {
    if (zona === 'puerto') {
      // El haz del faro: un cono que se abre y se apaga hacia la punta; los bordes, blandos.
      lienzo(scene, 'rn_haz', 512, 160, function (x, w, h) {
        for (var k = 0; k < 6; k++) {
          var abre = (h / 2) * (0.35 + k * 0.13);
          var g = x.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, 'rgba(255,246,206,' + (0.16 - k * 0.02) + ')');
          g.addColorStop(0.55, 'rgba(255,240,190,' + (0.08 - k * 0.01) + ')');
          g.addColorStop(1, 'rgba(255,236,180,0)');
          x.fillStyle = g;
          x.beginPath(); x.moveTo(0, h / 2 - 3); x.lineTo(w, h / 2 - abre); x.lineTo(w, h / 2 + abre); x.lineTo(0, h / 2 + 3); x.closePath(); x.fill();
        }
      });
      // La lámpara del faro: un resplandor blanco cálido (el de las antorchas es naranja).
      lienzo(scene, 'rn_foco', 96, 96, function (x, w, h) { resplandor(x, w, h, 'rgba(255,250,224,0.95)', 'rgba(255,232,170,0.35)'); });
    }
    if (zona === 'pantano') {
      lienzo(scene, 'rn_bruma', 512, 128, function (x, w, h) {
        manchasCiclicas(x, w, h, [[90, 64, 160, 0.3, 'rgba(176,196,168,0.75)'], [300, 50, 180, 0.26, 'rgba(160,184,150,0.7)'],
                                  [430, 82, 130, 0.3, 'rgba(188,204,176,0.65)'], [200, 96, 120, 0.24, 'rgba(150,176,140,0.6)']]);
      });
      lienzo(scene, 'rn_fatuo', 64, 64, function (x, w, h) { resplandor(x, w, h, 'rgba(214,255,236,0.95)', 'rgba(120,240,200,0.4)'); });
      lienzo(scene, 'rn_gas', 112, 64, function (x, w, h) { ovalo(x, w, h, '150,190,90', 0.42); });
    }
    if (zona === 'aldor' || zona === 'selva') {
      // El rayo de sol: una banda alta con el perfil de una campana (sin borde
      // que se lea como franja), que nace blanda arriba y llega al suelo.
      var tono = zona === 'aldor' ? '255,236,170' : '214,255,170';
      lienzo(scene, 'rn_rayo_' + zona, 96, 512, function (x, w, h) {
        var g = x.createLinearGradient(0, 0, w, 0);
        [[0, 0], [0.18, 0.05], [0.32, 0.2], [0.5, 0.5], [0.68, 0.2], [0.82, 0.05], [1, 0]].forEach(function (c) {
          g.addColorStop(c[0], 'rgba(' + tono + ',' + c[1] + ')');
        });
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'destination-in';
        var v = x.createLinearGradient(0, 0, 0, h);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.3, 'rgba(0,0,0,0.8)'); v.addColorStop(0.8, 'rgba(0,0,0,1)');
        v.addColorStop(1, 'rgba(0,0,0,0.35)');
        x.fillStyle = v; x.fillRect(0, 0, w, h);
      });
      // Donde toca el suelo: un charco de luz ovalado y blando.
      lienzo(scene, 'rn_charco_' + zona, 160, 64, function (x, w, h) { ovalo(x, w, h, tono, 0.55); });
    }
    if (zona === 'aldor') {
      lienzo(scene, 'rn_hilo', 96, 3, function (x, w, h) {
        var g = x.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.35, 'rgba(255,240,200,0.8)');
        g.addColorStop(0.7, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
    }
    if (zona === 'selva') {
      lienzo(scene, 'rn_humedad', 512, 128, function (x, w, h) {
        manchasCiclicas(x, w, h, [[100, 60, 170, 0.28, 'rgba(206,232,206,0.6)'], [320, 70, 160, 0.26, 'rgba(196,226,200,0.55)'],
                                  [450, 40, 120, 0.3, 'rgba(216,238,214,0.5)']]);
      });
    }
    if (zona === 'colinas') {
      // Las hojas: una lágrima con punta y su nervio (tres colores de otoño).
      [['#d0532a', '#8a3018'], ['#e89a2e', '#a8641a'], ['#e6c446', '#a88a24']].forEach(function (c, i) {
        lienzo(scene, 'rn_hoja_' + i, 16, 9, function (x, w, h) {
          x.fillStyle = c[0];
          x.beginPath(); x.moveTo(1, h / 2);
          x.quadraticCurveTo(w * 0.45, -1, w - 1, h / 2);
          x.quadraticCurveTo(w * 0.45, h + 1, 1, h / 2); x.closePath(); x.fill();
          x.strokeStyle = c[1]; x.lineWidth = 1;
          x.beginPath(); x.moveTo(2, h / 2); x.lineTo(w - 2, h / 2); x.stroke();
        });
      });
    }
    if (zona === 'volcan') {
      lienzo(scene, 'rn_ceniza', 10, 10, function (x, w, h) { resplandor(x, w, h, 'rgba(200,192,186,0.9)', 'rgba(150,144,140,0.5)'); });
      lienzo(scene, 'rn_brasa', 2, 9, function (x, w, h) {
        var g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,236,160,1)'); g.addColorStop(1, 'rgba(255,90,30,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
      lienzo(scene, 'rn_vapor', 112, 64, function (x, w, h) { ovalo(x, w, h, '236,240,244', 0.5); });
    }
    if (zona === 'hongos') {
      lienzo(scene, 'rn_velo_luz', 512, 128, function (x, w, h) {
        manchasCiclicas(x, w, h, [[90, 60, 170, 0.26, 'rgba(90,230,220,0.5)'], [310, 70, 190, 0.24, 'rgba(170,120,240,0.45)'],
                                  [440, 50, 130, 0.28, 'rgba(110,200,255,0.4)']]);
      });
      lienzo(scene, 'rn_luz_seta', 72, 72, function (x, w, h) { resplandor(x, w, h, 'rgba(230,255,250,0.9)', 'rgba(110,236,220,0.35)'); });
    }
  }

  // ─────────────────────────────────────────────────────── AYUDAS DE ESTADO
  function propio(st, o) { st.objetos.push(o); return o; }
  /** Escribe en la escena guardando lo de antes (al desmontar se devuelve). */
  function dato(st, key, value) {
    if (!(key in st.anteriores)) st.anteriores[key] = { propio: Object.prototype.hasOwnProperty.call(st.scene, key), valor: st.scene[key] };
    st.escritos[key] = value; st.scene[key] = value;
  }
  /** Los objetos del mapa con ese nombre (capa `objetos`). */
  function objetosDe(scene, nombres) {
    var capa = scene.map && scene.map.getObjectLayer('objetos');
    return (capa ? capa.objects : []).filter(function (o) { return nombres.indexOf(o.name) >= 0; });
  }
  /** Los rectángulos de choque con ese nombre (el agua, la lava). */
  function rectsDe(scene, nombre) {
    var capa = scene.map && scene.map.getObjectLayer('colisiones');
    return (capa ? capa.objects : []).filter(function (o) { return o.name === nombre && o.width > 0 && o.height > 0; });
  }
  /** Un punto al azar de los rectángulos que se ven ahora (o null). */
  function puntoEnVista(rects, v, margen) {
    var vis = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.x < v.right + margen && r.x + r.width > v.x - margen && r.y < v.bottom + margen && r.y + r.height > v.y - margen) vis.push(r);
    }
    if (!vis.length) return null;
    var q = vis[Math.floor(Math.random() * vis.length)];
    var x0 = Math.max(q.x, v.x - margen), x1 = Math.min(q.x + q.width, v.right + margen);
    var y0 = Math.max(q.y, v.y - margen), y1 = Math.min(q.y + q.height, v.bottom + margen);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: az(x0, x1), y: az(y0, y1) };
  }
  /** Bandas a ras de suelo que se desplazan (bruma, humedad, velos de luz). */
  function montarBandas(st, clave, n, prof, op) {
    var scene = st.scene;
    st.bandas = [];
    for (var i = 0; i < n; i++) {
      var t = propio(st, scene.add.tileSprite(0, 0, 64, 64, clave)).setOrigin(0, 0).setDepth(prof + i * 0.01).setAlpha(0);
      t.setTileScale(2 + i * 0.6, 2 + i * 0.4);
      if (op && op.aditivo) t.setBlendMode(aditivo());
      st.bandas.push({ spr: t, vx: [14, -9, 6][i % 3], vy: [2, -1, 1.5][i % 3], ox: i * 170, oy: i * 90, peso: i === 2 ? 0.7 : 1 });
    }
  }
  function bandasTic(st, dt, alfa) {
    var v = vista(st.scene);
    if (!v) return;
    for (var i = 0; i < st.bandas.length; i++) {
      var n = st.bandas[i];
      n.ox += n.vx * dt; n.oy += n.vy * dt;
      cubrir(n.spr, v);
      n.spr.setTilePosition((v.x + n.ox) / n.spr.tileScaleX, (v.y + n.oy) / n.spr.tileScaleY);
      n.spr.setAlpha(alfa * n.peso).setVisible(alfa > 0.005);
    }
  }

  // ─────────────────────────────────────────────────────── PUERTO: EL FARO
  function montarFaro(st) {
    var scene = st.scene, faros = objetosDe(scene, ['faro']);
    // La linterna está a 200 px sobre el apoyo (la misma altura que su luz de noche en gf-zonas LUCES).
    st.faros = faros.map(function (o) {
      var haz = propio(st, scene.add.image(o.x, o.y - ALTO_FARO, 'rn_haz')).setOrigin(0, 0.5).setDepth(PROF_AIRE - 1)
        .setBlendMode(aditivo()).setAlpha(0).setScale(2.2, 1.6).setVisible(false);
      var foco = propio(st, scene.add.image(o.x, o.y - ALTO_FARO, 'rn_foco')).setDepth(PROF_AIRE - 0.9).setBlendMode(aditivo()).setAlpha(0).setVisible(false);
      return { x: o.x, y: o.y - ALTO_FARO, haz: haz, foco: foco };
    });
    dato(st, '_vientoExtra', 0.55);      // la brisa del mar: los árboles se mecen más que tierra adentro
  }
  function faroTic(st, tSrv) {
    var v = vista(st.scene), n = noche(st.scene);
    var a = Math.max(0, Math.min(1, (n - 0.2) / 0.5));
    for (var i = 0; i < st.faros.length; i++) {
      var f = st.faros[i];
      var cerca = v && f.x > v.x - 1300 && f.x < v.right + 1300 && f.y > v.y - 1300 && f.y < v.bottom + 1300;
      var ve = cerca && a > 0.01;
      // Una vuelta cada 12 s; el haz se estrecha al apuntar hacia la cámara (se lee el giro).
      var ang = (tSrv / 12) * Math.PI * 2;
      f.haz.setVisible(ve).setRotation(ang).setAlpha(0.85 * a).setScale(2.2, 1.6 * (0.55 + 0.45 * Math.abs(Math.cos(ang))));
      f.foco.setVisible(ve).setAlpha((0.6 + 0.25 * Math.sin(tSrv * 3)) * a).setScale(1.4);
    }
  }

  // ─────────────────────────────────────────────────────── PANTANO: GAS Y FUEGOS FATUOS
  function montarPantano(st) {
    var scene = st.scene;
    montarBandas(st, 'rn_bruma', 3, PROF_SUELO, null);
    st.agua = rectsDe(scene, 'agua');
    st.gases = [];
    for (var i = 0; i < 5; i++) st.gases.push({ spr: propio(st, scene.add.image(0, 0, 'rn_gas')).setDepth(PROF_SUELO + 0.05).setVisible(false), vida: 0, max: 1 });
    st.fatuos = [];
    for (var k = 0; k < 6; k++) {
      st.fatuos.push({ spr: propio(st, scene.add.image(0, 0, 'rn_fatuo')).setDepth(PROF_AIRE - 2).setBlendMode(aditivo()).setVisible(false),
                       vida: 0, max: 1, fase: Math.random() * 6.3 });
    }
  }
  function pantanoTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene), n = noche(scene);
    if (!v) return;
    bandasTic(st, dt, 0.24 + 0.22 * n);
    for (var i = 0; i < st.gases.length; i++) {
      var g = st.gases[i];
      if (g.vida <= 0) {
        g.spr.setVisible(false);
        if (Math.random() > dt * 0.25) continue;
        var p = puntoEnVista(st.agua, v, 40);
        if (!p) continue;
        g.x = p.x; g.y = p.y; g.vida = g.max = az(3.5, 5.5); g.k = az(0.8, 1.4);
      }
      g.vida -= dt;
      var t = 1 - g.vida / g.max;
      g.y -= 9 * dt;
      g.spr.setVisible(true).setPosition(g.x + Math.sin(t * 3 + i) * 8, g.y).setScale(g.k * (0.7 + t * 0.9), g.k * (0.6 + t * 0.6))
        .setAlpha(Math.sin(Math.PI * t) * 0.55);
    }
    // Los fuegos fatuos: solo de noche, pocos, grandes y blandos; vagan sobre el agua.
    for (var k = 0; k < st.fatuos.length; k++) {
      var f = st.fatuos[k];
      if (f.vida <= 0) {
        f.spr.setVisible(false);
        if (n < 0.35 || Math.random() > dt * 0.4) continue;
        var q = puntoEnVista(st.agua, v, 120);
        if (!q) continue;
        f.x = q.x; f.y = q.y - 30; f.vida = f.max = az(6, 10); f.vx = az(-14, 14);
      }
      f.vida -= dt;
      var u = 1 - f.vida / f.max;
      f.x += f.vx * dt;
      f.spr.setVisible(true).setPosition(f.x + Math.sin(tSrv * 0.7 + f.fase) * 22, f.y + Math.sin(tSrv * 1.3 + f.fase) * 10)
        .setScale(0.9 + 0.15 * Math.sin(tSrv * 4 + f.fase)).setAlpha(Math.sin(Math.PI * u) * 0.75 * Math.min(1, (n - 0.35) / 0.3));
    }
  }

  // ─────────────────────────────────────────────────────── ALDOR Y SELVA: RAYOS DE LUZ
  /* (2026-11-23) "Las luces del clima no se adaptan bien" (captura de Aldor):
     los rayos iban pegados a la PANTALLA, eran franjas duras y salían igual con
     nubes que con sol. Ahora el mundo se reparte en casillas y en dos de cada
     tres cae un rayo, en un punto fijo de la casilla (el mismo para todos y en
     todas las partidas): al andar, el rayo se queda en su sitio, como un árbol.
     Bajan inclinados desde arriba a la izquierda y donde tocan dejan un charco
     de luz en el suelo. Su fuerza es la del tiempo de verdad: de día y sin
     lluvia; las nubes los apagan casi del todo y el sol los aviva. Se usan unas
     pocas piezas (las casillas que caen cerca de la vista) y se reciclan. */
  var RAYO = { aldor: { paso: [560, 600], fuerza: 0.2, piezas: 12 }, selva: { paso: [470, 540], fuerza: 0.17, piezas: 14 } };
  var RAYO_LARGO = 820, RAYO_GIRO = -0.38;
  function montarRayos(st, zona) {
    var scene = st.scene, c = RAYO[zona];
    st.rayos = []; st.rayoCfg = c;
    for (var i = 0; i < c.piezas; i++) {
      st.rayos.push({
        spr: propio(st, scene.add.image(0, 0, 'rn_rayo_' + zona)).setOrigin(0.5, 1).setDepth(PROF_AIRE - 3)
          .setBlendMode(aditivo()).setRotation(RAYO_GIRO).setAlpha(0).setVisible(false),
        charco: propio(st, scene.add.image(0, 0, 'rn_charco_' + zona)).setDepth(PROF_SUELO + 0.03)
          .setBlendMode(aditivo()).setAlpha(0).setVisible(false)
      });
    }
    if (zona === 'aldor') {
      st.hilos = [];
      for (var k = 0; k < 10; k++) {
        st.hilos.push({ spr: propio(st, scene.add.image(0, 0, 'rn_hilo')).setDepth(PROF_SUELO + 0.02).setAlpha(0).setVisible(false),
                        x: null, y: 0, v: az(70, 140), k: az(0.7, 1.5), fase: Math.random() * 6.3 });
      }
    } else {
      montarBandas(st, 'rn_humedad', 2, PROF_SUELO, null);
    }
  }
  /** La fuerza de los rayos ahora (0: no hay). */
  function fuerzaRayos(st) {
    var dia = 1 - noche(st.scene), seco = 1 - Math.min(1, lluvia() * 1.6);
    return st.rayoCfg.fuerza * Math.max(0, (dia - 0.25) / 0.75) * seco
      * (1 - 0.82 * delTiempo('nublado')) * (1 + 0.45 * delTiempo('sol'));
  }
  function rayosTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
    var a = fuerzaRayos(st), usados = 0;
    if (a > 0.004) {
      var px = st.rayoCfg.paso[0], py = st.rayoCfg.paso[1];
      // La punta se va arriba a la izquierda: un rayo se ve aunque su pie quede
      // a la derecha o por debajo de la vista.
      var alto = RAYO_LARGO * Math.cos(RAYO_GIRO), lado = RAYO_LARGO * Math.sin(-RAYO_GIRO);
      var x0 = Math.floor((v.x - 120) / px), x1 = Math.floor((v.right + lado + 60) / px);
      var y0 = Math.floor((v.y - 60) / py), y1 = Math.floor((v.bottom + alto) / py);
      var cand = [], cx = v.x + v.width / 2, cy = v.y + v.height / 2;
      for (var iy = y0; iy <= y1; iy++) for (var ix = x0; ix <= x1; ix++) {
        if (azarFijo(ix, iy) < 0.34) continue;                        // una de cada tres casillas, sin rayo
        var gx = (ix + 0.15 + 0.7 * azarFijo(ix + 17.3, iy)) * px, gy = (iy + 0.15 + 0.7 * azarFijo(ix, iy + 29.1)) * py;
        var mx = gx - lado / 2, my = gy - alto / 2;                   // el centro del rayo
        cand.push({ ix: ix, iy: iy, x: gx, y: gy, d: (mx - cx) * (mx - cx) + (my - cy) * (my - cy) });
      }
      cand.sort(function (p, q) { return p.d - q.d; });
      for (var n = 0; n < cand.length && usados < st.rayos.length; n++) {
        var q = cand[n], r = st.rayos[usados++];
        var fase = azarFijo(q.ix + 5.7, q.iy + 3.1) * 6.283, ritmo = 0.35 + 0.5 * azarFijo(q.ix + 1.9, q.iy + 7.7);
        var ancho = 0.8 + 0.9 * azarFijo(q.ix + 9.4, q.iy + 11.2);
        var respira = 0.6 + 0.4 * Math.sin(tSrv * ritmo + fase);
        r.spr.setVisible(true).setPosition(q.x, q.y).setScale(ancho, RAYO_LARGO / 512).setAlpha(a * respira);
        r.charco.setVisible(true).setPosition(q.x, q.y).setScale(ancho * 1.05, ancho * 0.9).setAlpha(a * respira * 0.7);
      }
    }
    for (var k = usados; k < st.rayos.length; k++) { st.rayos[k].spr.setVisible(false); st.rayos[k].charco.setVisible(false); }
    if (st.hilos) hilosTic(st, v, tSrv, dt);
    if (st.bandas) bandasTic(st, dt, 0.16 + 0.14 * noche(scene) + 0.1 * lluvia());
  }
  /* Los hilos de arena de Aldor corren a ras de suelo con el viento. Viven en
     el MUNDO, como el polvo del desierto (gf-zonas): al andar se quedan atrás;
     el que sale por sotavento vuelve a nacer por barlovento, dentro de la vista. */
  function hilosTic(st, v, tSrv, dt) {
    var seco = 1 - Math.min(1, lluvia() * 1.6), alto = Math.max(40, v.height - 60);
    for (var k = 0; k < st.hilos.length; k++) {
      var q = st.hilos[k];
      if (q.x === null) { q.x = v.x + Math.random() * v.width; q.y = v.y + 40 + Math.random() * alto; }
      q.x += q.v * dt;
      if (q.x > v.right + 160 || q.x < v.x - 320 || q.y < v.y - 120 || q.y > v.bottom + 120) {
        q.x = v.x - 140 - Math.random() * 120; q.y = v.y + 40 + Math.random() * alto;
      }
      var al = (0.14 + 0.2 * Math.max(0, Math.sin(tSrv * 0.8 + q.fase))) * seco;
      q.spr.setVisible(al > 0.01).setAlpha(al).setScale(q.k, 1).setPosition(q.x, q.y + Math.sin(tSrv * 1.2 + q.fase) * 3);
    }
  }

  // ─────────────────────────────────────────────────────── COLINAS: HOJAS Y RACHAS
  function montarHojas(st) {
    var scene = st.scene;
    st.hojas = [];
    for (var i = 0; i < 24; i++) {
      st.hojas.push({ spr: propio(st, scene.add.image(0, 0, 'rn_hoja_' + (i % 3))).setDepth(PROF_AIRE + 0.2).setAlpha(0.9).setScale(az(0.9, 1.4)),
                      x: Math.random(), y: Math.random(), vx: az(0.02, 0.05), vy: az(0.03, 0.06), fase: Math.random() * 6.3, giro: az(-2.4, 2.4) });
    }
    st.rachaAvisada = -1;
  }
  function hojasTic(st, tSrv, dt) {
    var v = vista(st.scene);
    if (!v) return;
    var racha = campana(tSrv, RACHA.cada, RACHA.dura, 17);
    // Los árboles se doblan con la racha (gf-viento lee `_vientoExtra`) y se oye (gf-audio, el viento).
    dato(st, '_vientoExtra', 0.42 + 0.78 * racha);
    var empuje = 1 + 2.6 * racha;
    for (var i = 0; i < st.hojas.length; i++) {
      var p = st.hojas[i];
      p.x += p.vx * dt * empuje; p.y += p.vy * dt * (1 + 0.6 * racha);
      if (p.x > 1.08 || p.y > 1.08) { p.x = Math.random() * 0.9 - 0.15; p.y = -0.06; }
      var x = p.x + Math.sin(tSrv * 1.3 + p.fase) * 0.014;
      // El aleteo: la hoja se estrecha al girar de canto (se lee que da vueltas).
      p.spr.setPosition(v.x + x * v.width, v.y + p.y * v.height).setRotation(p.fase + tSrv * p.giro * (1 + racha));
      p.spr.scaleY = p.spr.scaleX * (0.35 + 0.65 * Math.abs(Math.sin(tSrv * 2.1 + p.fase)));
    }
  }

  // ─────────────────────────────────────────────────────── VOLCÁN: CENIZA, BRASAS, VAPOR Y TEMBLORES
  function montarVolcan(st) {
    var scene = st.scene;
    st.cenizas = [];
    for (var i = 0; i < 30; i++) {
      st.cenizas.push({ spr: propio(st, scene.add.image(0, 0, 'rn_ceniza')).setDepth(PROF_AIRE + 0.2).setScale(az(0.9, 1.7)).setAlpha(az(0.45, 0.7)),
                        x: Math.random(), y: Math.random(), v: az(0.03, 0.06), fase: Math.random() * 6.3, mece: az(0.01, 0.02) });
    }
    st.lava = rectsDe(scene, 'lava');
    st.agua = rectsDe(scene, 'agua');
    st.brasas = [];
    for (var k = 0; k < 16; k++) st.brasas.push({ spr: propio(st, scene.add.image(0, 0, 'rn_brasa')).setDepth(PROF_AIRE - 4).setBlendMode(aditivo()).setVisible(false), vida: 0, max: 1 });
    // El vapor sale de las termas y de las fumarolas (objetos del mapa).
    st.fumarolas = objetosDe(scene, ['fumarola']).map(function (o) { return { x: o.x, y: o.y - 22 }; });
    st.vapores = [];
    for (var j = 0; j < 8; j++) st.vapores.push({ spr: propio(st, scene.add.image(0, 0, 'rn_vapor')).setVisible(false), vida: 0, max: 1 });
    st.temblorVisto = Math.floor(ahoraServidor() / TEMBLOR.cada);    // al entrar no tiembla de golpe
    dato(st, '_vientoExtra', 0.3);
    // (2026-11-24) La lava de la mina, animada (si falla, queda la pintada, quieta).
    try { montarLavaMina(st); } catch (e) { console.warn('[reinos] lava:', e); quitarLava(st); }
  }
  function volcanTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
    if (st.lavaMina) lavaTic(st, v, dt);
    for (var i = 0; i < st.cenizas.length; i++) {
      var c = st.cenizas[i];
      c.y += c.v * dt;
      if (c.y > 1.05) { c.y = -0.05; c.x = Math.random(); }
      // Cae en diagonal suave (el viento de la caldera) y se mece; al salir por un lado entra por el otro.
      c.spr.setPosition(v.x + vuelta(c.x + Math.sin(tSrv * 0.6 + c.fase) * c.mece + tSrv * 0.004) * v.width, v.y + c.y * v.height);
    }
    // Brasas: rayas que suben de la lava que se ve y se apagan (el doble durante un temblor).
    st.avivar = Math.max(0, (st.avivar || 0) - dt);
    var ritmoBrasas = st.avivar > 0 ? 4.2 : 1.4;
    for (var k = 0; k < st.brasas.length; k++) {
      var b = st.brasas[k];
      if (b.vida <= 0) {
        b.spr.setVisible(false);
        if (Math.random() > dt * ritmoBrasas) continue;
        var p = puntoEnVista(st.lava, v, 20);
        if (!p) continue;
        b.x = p.x; b.y = p.y; b.vida = b.max = az(0.9, 1.6); b.vx = az(-16, 16);
      }
      b.vida -= dt;
      b.y -= 58 * dt; b.x += b.vx * dt;
      b.spr.setVisible(true).setPosition(b.x, b.y).setDepth(b.y + 40).setAlpha(Math.max(0, b.vida / b.max)).setScale(1.5);
    }
    // Vapor: de las termas (agua caliente) y de las fumarolas cercanas.
    for (var j = 0; j < st.vapores.length; j++) {
      var q = st.vapores[j];
      if (q.vida <= 0) {
        q.spr.setVisible(false);
        if (Math.random() > dt * 0.9) continue;
        var desde = null;
        if (st.fumarolas.length && Math.random() < 0.5) {
          var f = st.fumarolas[Math.floor(Math.random() * st.fumarolas.length)];
          if (f.x > v.x - 80 && f.x < v.right + 80 && f.y > v.y - 80 && f.y < v.bottom + 160) desde = { x: f.x + az(-8, 8), y: f.y };
        }
        if (!desde) desde = puntoEnVista(st.agua, v, 20);
        if (!desde) continue;
        q.x = desde.x; q.y = desde.y; q.vida = q.max = az(2.8, 4.2); q.k = az(0.6, 1.1);
      }
      q.vida -= dt;
      var t = 1 - q.vida / q.max;
      q.y -= 22 * dt;
      q.spr.setVisible(true).setPosition(q.x + Math.sin(t * 4 + j) * 6, q.y).setDepth(q.y + 60)
        .setScale(q.k * (0.5 + t), q.k * (0.4 + t * 0.7)).setAlpha(Math.sin(Math.PI * t) * 0.5);
    }
    // El temblor: el mismo para todos (la hora del servidor), una vez por vuelta.
    var id = Math.floor(tSrv / TEMBLOR.cada), dentro = (tSrv % TEMBLOR.cada) < TEMBLOR.dura;
    if (dentro && id !== st.temblorVisto && !scene._cambiandoEscena) {
      st.temblorVisto = id;
      try { scene.cameras.main.shake(TEMBLOR.dura * 1000, 0.0032); } catch (e) {}
      try { if (window.GFAudio && window.GFAudio.trueno) window.GFAudio.trueno(false, 0.55); } catch (e) {}
      aviso(scene, '🌋 The caldera rumbles — the ground shakes beneath your feet!', 'warning');
      st.avivar = TEMBLOR.dura + 2;     // más brasas mientras tiembla y un poco después
    }
  }

  // ─────────────────────────────────────────────────────── VOLCÁN: LA LAVA DE LA MINA
  /* (2026-11-24) "La lava no es igual a la de la mina de nivel 2." La de la mina
     es un tileset ANIMADO (seis fotogramas) con burbujas y luz; la del volcán
     era un degradado pintado quieto en el suelo. tools/gf_lava_mina.py le hace
     la MISMA lava (el mismo campo, semilla, colores y movimiento que la mina):
     la capa de casillas 'lava' del mapa y sus hojas Game/MAPAS/<zona>/lava_<f>.png,
     ya extruidas (margen 1, separación 2). Aquí se monta y se mueve como en la
     mina (MinaScene._animarLiquidos): se cambia la IMAGEN del tileset, no las
     casillas. Las hojas se cargan al entrar, sin parar la escena; mientras
     llegan se ve la misma lava quieta (el suelo pintado lleva debajo su primer
     fotograma, en el mismo sitio). Y como en la mina, burbujas que revientan
     (en la lava de dentro que se ve, nunca en el labio) y, de noche, su luz
     (scene._lucesNoche, gf-ciclo-dia). Lo fija tools/lava-volcan.test.cjs. */
  var PROF_LAVA = 0.5, PROF_BURBUJA = 0.6;        // las del agua (gf-agua) y de lo que flota en ella
  var LAVA_BURBUJAS = 8;                          // como la mina: ocho que se reciclan
  var LAVA_LUZ = { cubre: 96, r: 150, a: 0.6 };   // ninguna casilla de lava a más de 96 px de una luz
  function propiedadMapa(scene, nombre) {
    var ps = scene.map && scene.map.properties;
    if (Array.isArray(ps)) {
      for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].name === nombre) return ps[i].value;
      return undefined;
    }
    return ps && typeof ps === 'object' ? ps[nombre] : undefined;
  }
  function montarLavaMina(st) {
    var scene = st.scene, map = scene.map, zona = st.zona;
    var n = Math.floor(Number(propiedadMapa(scene, 'lava_fotogramas')) || 0);
    if (!map || typeof map.getLayer !== 'function' || !map.getLayer('lava') || n < 1 || !scene.load || !scene.textures) return;
    var lv = st.lavaMina = {
      claves: [], fps: Number(propiedadMapa(scene, 'lava_fps')) || 6, interior: Number(propiedadMapa(scene, 'lava_interior')) || 256,
      i: 0, acc: 0, ts: null, centros: [], burbujas: [], luces: [], alumbrar: null, alCargar: null
    };
    var v = '?v=' + ((scene.cfg && scene.cfg.version) || ''), faltan = 0;
    for (var f = 0; f < n; f++) {
      var k = 'rn_lava_' + zona + '_' + f;
      lv.claves.push(k);
      if (!scene.textures.exists(k)) { scene.load.image(k, './Game/MAPAS/' + zona + '/lava_' + f + '.png' + v); faltan++; }
    }
    if (!scene.textures.exists('rn_lava_burbuja')) {
      // La hoja de burbujas de la mina: seis de 32 px (cortada a 16 salían cuartos).
      scene.load.spritesheet('rn_lava_burbuja', './Game/MAPAS/Mina/lava_burbuja.png' + v, { frameWidth: 32, frameHeight: 32 });
      faltan++;
    }
    lv.alCargar = function () {
      lv.alCargar = null;
      if (!st.vivo || st.lavaMina !== lv) return;
      try { crearLavaMina(st); } catch (e) { console.warn('[reinos] lava:', e); }
    };
    if (!faltan) { lv.alCargar(); return; }
    scene.load.once('complete', lv.alCargar);
    scene.load.start();
  }
  function crearLavaMina(st) {
    var scene = st.scene, lv = st.lavaMina, map = scene.map;
    var claves = lv.claves.filter(function (k) { return scene.textures.exists(k); });
    if (!claves.length) return;                       // no llegaron: queda la pintada, quieta
    claves.forEach(function (k) { try { scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {} });
    var ts = map.addTilesetImage('lava_' + st.zona, claves[0], 32, 32, 1, 2);
    if (!ts) return;
    var capa = map.createLayer('lava', ts, 0, 0);
    if (!capa) return;
    propio(st, capa).setDepth(PROF_LAVA);
    lv.ts = ts; lv.claves = claves;
    /* El centro de cada casilla, donde la dibuja Phaser: en pixelX + ancho/2 -
       tileOffset.x (y lo mismo en vertical), o sea sobre su casilla de 32
       (gf_lava_mina, DÓNDE DIBUJA PHASER). Las del parche (las primeras de la
       hoja) son las de dentro: ahí salen las burbujas. */
    var off = ts.tileOffset || { x: 0, y: 0 };
    var mx = ts.tileWidth / 2 - (off.x || 0), my = ts.tileHeight / 2 - (off.y || 0), bordes = [];
    capa.forEachTile(function (t) {
      if (!t || !(t.index >= ts.firstgid)) return;
      var c = { x: t.pixelX + mx, y: t.pixelY + my };
      if (t.index - ts.firstgid < lv.interior) lv.centros.push(c); else bordes.push(c);
    });
    lv.luces = cubrirDeLuz(lv.centros.concat(bordes), LAVA_LUZ.cubre);
    montarBurbujas(st);
    if (lv.luces.length) {
      lv.alumbrar = function (luz) { for (var i = 0; i < lv.luces.length; i++) luz(lv.luces[i].x, lv.luces[i].y, LAVA_LUZ.r, LAVA_LUZ.a); };
      if (!Array.isArray(scene._lucesNoche)) scene._lucesNoche = [];
      scene._lucesNoche.push(lv.alumbrar);
    }
  }
  /** Las luces de la lava: las que hagan falta para que ninguna casilla quede a
      más de `d` px de una. Primero las de dentro, así caen en medio de la lava. */
  function cubrirDeLuz(casillas, d) {
    var luces = [], rejilla = Object.create(null), d2 = d * d;
    for (var i = 0; i < casillas.length; i++) {
      var c = casillas[i], gx = Math.floor(c.x / d), gy = Math.floor(c.y / d), cerca = false;
      for (var yy = gy - 1; yy <= gy + 1 && !cerca; yy++) {
        for (var xx = gx - 1; xx <= gx + 1 && !cerca; xx++) {
          var cubo = rejilla[xx + ',' + yy];
          if (!cubo) continue;
          for (var k = 0; k < cubo.length; k++) {
            var dx = cubo[k].x - c.x, dy = cubo[k].y - c.y;
            if (dx * dx + dy * dy <= d2) { cerca = true; break; }
          }
        }
      }
      if (cerca) continue;
      var l = { x: c.x, y: c.y };
      luces.push(l);
      (rejilla[gx + ',' + gy] || (rejilla[gx + ',' + gy] = [])).push(l);
    }
    return luces;
  }
  function montarBurbujas(st) {
    var scene = st.scene, lv = st.lavaMina;
    if (!lv.centros.length || !scene.anims || !scene.textures.exists('rn_lava_burbuja')) return;
    // Como en la mina, la animación se rehace en cada entrada: las animaciones
    // son del juego, y una de otra visita apuntaría a una textura ya soltada.
    if (scene.anims.exists('rn_lava_burbuja_anim')) scene.anims.remove('rn_lava_burbuja_anim');
    scene.anims.create({ key: 'rn_lava_burbuja_anim', frames: scene.anims.generateFrameNumbers('rn_lava_burbuja', { start: 0, end: 5 }),
                         frameRate: 9, repeat: 0 });
    for (var i = 0; i < LAVA_BURBUJAS; i++) {
      lv.burbujas.push({ spr: propio(st, scene.add.sprite(0, 0, 'rn_lava_burbuja', 0)).setDepth(PROF_BURBUJA).setVisible(false),
                         espera: 0.2 + i * 0.26 });
    }
  }
  /** Una casilla de dentro que se vea ahora (o null). */
  function centroEnVista(lista, v, margen) {
    var vis = [];
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (c.x > v.x - margen && c.x < v.right + margen && c.y > v.y - margen && c.y < v.bottom + margen) vis.push(c);
    }
    return vis.length ? vis[Math.floor(Math.random() * vis.length)] : null;
  }
  function lavaTic(st, v, dt) {
    var scene = st.scene, lv = st.lavaMina;
    if (!lv.ts) return;
    if (lv.claves.length > 1) {
      lv.acc += dt * 1000;
      var paso = 1000 / lv.fps;
      if (lv.acc >= paso) {
        lv.acc %= paso;
        lv.i = (lv.i + 1) % lv.claves.length;
        var tex = scene.textures.get(lv.claves[lv.i]);
        if (tex && tex.key !== '__MISSING') lv.ts.setImage(tex);
      }
    }
    // Las burbujas: la que reventó se esconde y, al rato, sale en otra casilla de dentro que se vea.
    for (var i = 0; i < lv.burbujas.length; i++) {
      var b = lv.burbujas[i];
      if (b.spr.visible) {
        if (b.spr.anims && b.spr.anims.isPlaying) continue;
        b.spr.setVisible(false);
        b.espera = az(0.4, 2.2);
        continue;
      }
      if ((b.espera -= dt) > 0) continue;
      var c = centroEnVista(lv.centros, v, 16);
      if (!c) { b.espera = 0.5; continue; }
      b.spr.setPosition(c.x + az(-8, 8), c.y + az(-8, 8)).setVisible(true).play('rn_lava_burbuja_anim');
    }
  }
  /** Fuera la lava: su carga a medias, su luz, su animación y sus hojas (son
      de este mapa; la capa y las burbujas se van con los objetos). */
  function quitarLava(st) {
    var lv = st.lavaMina, scene = st.scene;
    if (!lv) return;
    st.lavaMina = null;
    if (lv.alCargar) { try { scene.load.off('complete', lv.alCargar); } catch (e) {} lv.alCargar = null; }
    if (lv.alumbrar && Array.isArray(scene._lucesNoche)) {
      var k = scene._lucesNoche.indexOf(lv.alumbrar);
      if (k >= 0) scene._lucesNoche.splice(k, 1);
    }
    try { if (scene.anims && scene.anims.exists('rn_lava_burbuja_anim')) scene.anims.remove('rn_lava_burbuja_anim'); } catch (e) {}
    lv.claves.concat(['rn_lava_burbuja']).forEach(function (c) {
      try { if (scene.textures && scene.textures.exists(c)) scene.textures.remove(c); } catch (e) {}
    });
  }

  // ─────────────────────────────────────────────────────── HONGOS: VELOS Y LUCES
  function montarHongos(st) {
    var scene = st.scene;
    montarBandas(st, 'rn_velo_luz', 2, PROF_AIRE - 5, { aditivo: true });
    st.luces = [];
    var setas = objetosDe(scene, ['seta_pequena', 'cristal_luz', 'raiz_brillante', 'casa_seta', 'farol_luciernaga']);
    st.origenes = setas.map(function (o) { return { x: o.x, y: o.y - 20 }; });
    for (var i = 0; i < 8; i++) {
      st.luces.push({ spr: propio(st, scene.add.image(0, 0, 'rn_luz_seta')).setDepth(PROF_AIRE - 4).setBlendMode(aditivo()).setVisible(false),
                      vida: 0, max: 1, fase: Math.random() * 6.3 });
    }
  }
  function hongosTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene), n = noche(scene);
    if (!v) return;
    bandasTic(st, dt, 0.1 + 0.16 * n);
    for (var i = 0; i < st.luces.length; i++) {
      var l = st.luces[i];
      if (l.vida <= 0) {
        l.spr.setVisible(false);
        if (Math.random() > dt * 0.5) continue;
        var cerca = st.origenes.filter(function (o) { return o.x > v.x - 60 && o.x < v.right + 60 && o.y > v.y - 60 && o.y < v.bottom + 120; });
        var o = cerca.length ? cerca[Math.floor(Math.random() * cerca.length)]
          : { x: v.x + Math.random() * v.width, y: v.y + v.height * (0.4 + Math.random() * 0.6) };
        l.x = o.x + az(-20, 20); l.y = o.y; l.vida = l.max = az(5, 8); l.k = az(0.6, 1.0);
      }
      l.vida -= dt;
      var t = 1 - l.vida / l.max;
      l.y -= 16 * dt;
      l.spr.setVisible(true).setPosition(l.x + Math.sin(tSrv * 0.9 + l.fase) * 14, l.y)
        .setScale(l.k * (0.8 + 0.12 * Math.sin(tSrv * 3 + l.fase))).setAlpha(Math.sin(Math.PI * t) * (0.4 + 0.4 * n));
    }
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene, zona) {
    if (!scene || !scene.add || !scene.events || scene.__gfReinos || !REINOS[zona]) return null;
    var st = { scene: scene, zona: zona, vivo: true, objetos: [], anteriores: Object.create(null), escritos: Object.create(null) };
    scene.__gfReinos = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar); scene.events.once('destroy', st.onApagar);
    try {
      texturas(scene, zona);
      if (zona === 'puerto') montarFaro(st);
      if (zona === 'pantano') montarPantano(st);
      if (zona === 'aldor' || zona === 'selva') montarRayos(st, zona);
      if (zona === 'colinas') montarHojas(st);
      if (zona === 'volcan') montarVolcan(st);
      if (zona === 'hongos') montarHongos(st);
    } catch (e) { desmontar(scene); console.warn('[reinos]', e); return null; }
    st.onUpdate = function (t, delta) {
      if (!st.vivo || scene._gfCargando) return;
      // Con la pestaña oculta el delta llega enorme: se corta (nada salta de golpe).
      var dt = Math.min(0.1, Math.max(0, (delta || 16) / 1000));
      var tSrv = ahoraServidor();
      try {
        if (st.faros) faroTic(st, tSrv);
        if (zona === 'pantano') pantanoTic(st, tSrv, dt);
        if (st.rayos) rayosTic(st, tSrv, dt);
        if (st.hojas) hojasTic(st, tSrv, dt);
        if (zona === 'volcan') volcanTic(st, tSrv, dt);
        if (zona === 'hongos') hongosTic(st, tSrv, dt);
      } catch (e) {
        // Un fallo aquí no puede congelar el juego (memoria "bucle que muere"): se apaga solo esto.
        console.warn('[reinos] ' + zona + ':', e);
        desmontar(scene);
      }
    };
    scene.events.on('update', st.onUpdate);
    /* (2026-11-23) "Los 7 mapas deben ser solo para VIP." Dentro sin él (caducó, o se
       entró con la partida guardada): el aviso y al muelle del pueblo (GFVip.vigilarReino).
       A los 2,5 s, como la isla (gf-lands): antes la escena aún no tiene cuenta. */
    if (window.GFVip && window.GFVip.vigilarReino && scene.time && scene.time.delayedCall) {
      st.vigilaVip = scene.time.delayedCall(2500, function () { if (st.vivo) window.GFVip.vigilarReino(scene); });
    }
    console.log('🧭 reino ' + zona + ': ' + st.objetos.length + ' piezas');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfReinos;
    if (!st) return;
    st.vivo = false;
    if (st.vigilaVip) { try { st.vigilaVip.remove(false); } catch (e) {} st.vigilaVip = null; }
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    st.objetos.forEach(function (o) { try { if (o && o.scene) { scene.tweens.killTweensOf(o); o.destroy(); } } catch (e) {} });
    st.objetos.length = 0;
    quitarLava(st);
    st.faros = st.gases = st.fatuos = st.rayos = st.hilos = st.bandas = st.hojas = st.cenizas = st.brasas = st.vapores = st.luces = null;
    st.agua = st.lava = st.fumarolas = st.origenes = null;
    // Lo que se escribió en la escena vuelve a como estaba (si nadie lo cambió después).
    Object.keys(st.escritos).forEach(function (key) {
      if (scene[key] !== st.escritos[key]) return;
      var antes = st.anteriores[key];
      if (antes && antes.propio) scene[key] = antes.valor; else delete scene[key];
    });
    scene.__gfReinos = null;
  }

  window.GFReinos = {
    montar: montar,
    desmontar: desmontar,
    _interno: { campana: campana, RACHA: RACHA, TEMBLOR: TEMBLOR, REINOS: REINOS, estado: function (s) { return s && s.__gfReinos; } }
  };
})();
