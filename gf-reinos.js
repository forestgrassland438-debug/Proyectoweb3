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
  var ALTO_FARO = 200;       // de su apoyo a la linterna (px de mundo, ya a escala 2)

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
      // El rayo de sol: una banda alta, más clara en el centro, que se apaga hacia abajo.
      var tono = zona === 'aldor' ? '255,236,170' : '214,255,170';
      lienzo(scene, 'rn_rayo_' + zona, 96, 512, function (x, w, h) {
        var g = x.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'rgba(' + tono + ',0)'); g.addColorStop(0.5, 'rgba(' + tono + ',0.55)'); g.addColorStop(1, 'rgba(' + tono + ',0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'destination-in';
        var v = x.createLinearGradient(0, 0, 0, h);
        v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.7, 'rgba(0,0,0,0.7)'); v.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = v; x.fillRect(0, 0, w, h);
      });
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
  function montarRayos(st, zona) {
    var scene = st.scene, n = zona === 'aldor' ? 5 : 6;
    st.rayos = [];
    for (var i = 0; i < n; i++) {
      st.rayos.push({ spr: propio(st, scene.add.image(0, 0, 'rn_rayo_' + zona)).setOrigin(0.5, 0).setScrollFactor(0).setDepth(PROF_AIRE - 3)
                        .setBlendMode(aditivo()).setAlpha(0).setRotation(-0.38),
                      x: (i + 0.5) / n + az(-0.06, 0.06), ancho: az(0.7, 1.6), fase: Math.random() * 6.3, ritmo: az(0.08, 0.2) });
    }
    st.fuerzaRayos = zona === 'aldor' ? 0.42 : 0.34;
    if (zona === 'aldor') {
      st.hilos = [];
      for (var k = 0; k < 10; k++) {
        st.hilos.push({ spr: propio(st, scene.add.image(0, 0, 'rn_hilo')).setDepth(PROF_SUELO + 0.02).setAlpha(0),
                        x: Math.random(), y: Math.random(), v: az(0.08, 0.16), k: az(0.7, 1.5), fase: Math.random() * 6.3 });
      }
    } else {
      montarBandas(st, 'rn_humedad', 2, PROF_SUELO, null);
    }
  }
  function rayosTic(st, tSrv, dt) {
    var scene = st.scene, cam = scene.cameras && scene.cameras.main;
    if (!cam) return;
    var dia = 1 - noche(scene), seco = 1 - Math.min(1, lluvia() * 1.6);
    var a = st.fuerzaRayos * Math.max(0, (dia - 0.25) / 0.75) * seco;
    var w = cam.width, h = cam.height;
    for (var i = 0; i < st.rayos.length; i++) {
      var r = st.rayos[i];
      var respira = 0.55 + 0.45 * Math.sin(tSrv * r.ritmo * 6.28 + r.fase);
      r.spr.setVisible(a > 0.01).setAlpha(a * respira)
        .setPosition(w * r.x + Math.sin(tSrv * 0.05 + r.fase) * 30, -h * 0.15).setScale(r.ancho * w / 900 + 0.4, (h * 1.4) / 512);
    }
    if (st.hilos) {
      var v = vista(scene);
      if (!v) return;
      for (var k = 0; k < st.hilos.length; k++) {
        var q = st.hilos[k];
        q.x += q.v * dt;
        if (q.x > 1.15) { q.x = -0.2; q.y = Math.random(); }
        var al = (0.14 + 0.2 * Math.max(0, Math.sin(tSrv * 0.8 + q.fase))) * seco;
        q.spr.setVisible(al > 0.01).setAlpha(al).setScale(q.k, 1)
          .setPosition(v.x + q.x * v.width, v.y + 40 + q.y * Math.max(40, v.height - 60) + Math.sin(tSrv * 1.2 + q.fase) * 3);
      }
    }
    if (st.bandas) bandasTic(st, dt, 0.16 + 0.14 * noche(scene) + 0.1 * lluvia());
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
  }
  function volcanTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
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
    console.log('🧭 reino ' + zona + ': ' + st.objetos.length + ' piezas');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfReinos;
    if (!st) return;
    st.vivo = false;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    st.objetos.forEach(function (o) { try { if (o && o.scene) { scene.tweens.killTweensOf(o); o.destroy(); } } catch (e) {} });
    st.objetos.length = 0;
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
