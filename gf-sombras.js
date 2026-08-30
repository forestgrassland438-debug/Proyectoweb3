/* ===========================================================================
 * SOMBRAS DEL ESCENARIO
 *
 * QUÉ HACE
 *   Le pone a los árboles, las casas, los postes y demás su sombra tumbada por
 *   el suelo hacia ABAJO Y A LA DERECHA, con SU MISMA SILUETA. El sol está
 *   arriba a la izquierda —de donde vienen las luces del arte del juego—, así
 *   que la sombra cae al lado contrario.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO NO SE HACE GIRANDO EL SPRITE
 * ══════════════════════════════════════════════════════════════════════════
 *   El camino fácil —coger el sprite, voltearlo y GIRARLO sobre el pie— está
 *   mal, y se nota justo en lo que se ve en el juego: "las puntas de las
 *   sombras nunca deben estar separadas del objeto" y "la de las casas no es
 *   nada profesional".
 *
 *   Al girar, TODA la silueta gira, incluida su base. En una casa de 375 px de
 *   ancho, girar 35° sobre el centro del pie manda la esquina de abajo a la
 *   izquierda 109 px HACIA ABAJO y la de la derecha 109 px HACIA ARRIBA: la
 *   línea del suelo de la casa se inclina, media sombra se despega del edificio
 *   y la otra media se le mete dentro. Queda un rectángulo negro torcido y,
 *   encima, da la sensación de que el sol está abajo a la izquierda.
 *
 *   Una sombra proyectada de verdad no es un giro, es una CIZALLA: cada punto
 *   se desplaza en horizontal en proporción a su ALTURA sobre el suelo, y lo
 *   que está a ras de suelo NO SE MUEVE. Así la base entera queda clavada al
 *   objeto, por ancho que sea.
 *
 *       punto a altura H  →  ( +H·k , +H·f )      k = a la derecha
 *       punto en el suelo →  ( 0 , 0 )            f = hacia el espectador
 *
 * CÓMO SE CONSIGUE LA CIZALLA
 *   Phaser no sabe sesgar una imagen: un Game Object solo tiene posición, giro
 *   y escala. Pero el canvas 2D acepta una matriz cualquiera, así que la sombra
 *   se DIBUJA UNA VEZ por textura con `ctx.setTransform(1,0,-k,-f,…)` y se
 *   guarda como una textura nueva. A partir de ahí cada sombra es una imagen
 *   normal y corriente, sin giro: barata de pintar y con la base perfecta por
 *   construcción.
 *
 *   De paso se difumina un poco al dibujarla —una sombra de borde cortado canta
 *   a recorte— y se tiñe rellenando en `source-in`, que respeta ese alfa.
 *
 * EL PIE ES EL PIE DE VERDAD, NO EL BORDE DEL PNG
 *   Casi todos los PNG del juego traen transparencia de sobra. La caja OPACA la
 *   mide gf-profundidad.js (y de su caché sale, que leer píxeles cuesta).
 *
 * LA SOMBRA TAPA AL QUE PASA POR ELLA
 *   MULTIPLY y por encima de todo el mundo ordenado por Y: cuando el personaje
 *   entra en la sombra de un árbol se le oscurece de verdad. Multiplicar y no
 *   superponer es lo que deja ver la hierba y la ropa por debajo. Todas
 *   comparten profundidad, así que el cambio de mezcla cuesta una vez.
 *
 * SE MECEN CON EL VIENTO
 *   Solo lo que se mece de verdad (árboles y arbustos, que es a quien inclina
 *   gf-viento). Un giro MINÚSCULO sobre el pie: en un tronco de 20 px de ancho
 *   la base se mueve menos de un píxel, así que sigue pegada. Las casas y las
 *   piedras NO se mecen — moverlas era otra forma de despegarlas.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFSombras && GFSombras.montar(this);
 *
 * API
 *   GFSombras.montar(scene, op) / desmontar(scene)
 *   GFSombras.recalcular(scene)                 busca objetos nuevos
 *   GFSombras.estado(scene)
 *   GFSombras.ajustar({giro, largo, alfa}, scene)   para probar en caliente
 * ======================================================================== */
(function () {
  'use strict';

  /* Dónde está el sol. 0.62 rad ≈ 35° respecto a la vertical, arriba a la
     izquierda; la sombra cae abajo a la derecha. */
  var GIRO  = 0.62;
  /* Longitud de la sombra respecto a la altura del objeto (multiplicador
     general; cada familia trae además el suyo). */
  var LARGO = 1.0;
  var ALFA  = 0.30;
  /* Gris azulado, no negro: multiplicado por negro puro la hierba se convierte
     en un agujero. Este apaga y enfría, que es lo que hace la luz del cielo
     rebotando dentro de una sombra. */
  var COLOR = '#5b6773';
  /* Píxeles de difuminado del borde. Una sombra de canto recortado se lee como
     un sprite pegado; con un pelín de penumbra se lee como sombra. */
  var DIFUMINA = 1.6;

  /* Por encima de TODO lo que ordena por Y (el mapa mide 5008 px) y por debajo
     de los pájaros (8000), del clima (8030+), de la capa de noche (9000) y de
     los bocadillos del chat (99998). */
  var PROFUNDIDAD = 6000;

  var POR_FRAME    = 4;    // sombras nuevas por fotograma
  var REVISA_FRAME = 12;   // sombras repasadas por fotograma

  /* Cuánto exagera la sombra el balanceo del árbol: la copa se mueve poco, la
     punta de una sombra larga mucho más. Con tope, para que la base no se
     despegue ni con la racha más fuerte. */
  var EXAGERA_VIENTO = 2.2;
  var MENEO_MAX      = 0.07;   // radianes

  /* A quién se le pone sombra.
       largo = longitud de la sombra respecto a la altura del objeto
       alfa  = lo oscura que es
       mece  = si gf-viento la inclina (solo lo que de verdad se mece) */
  var FAMILIAS = [
    { prefijo: 'sprite_arbolx',    hasta: 18, largo: 0.62, alfa: 1.00, mece: true },
    { prefijo: 'sprite_pinos',     hasta: 45, largo: 0.58, alfa: 1.00, mece: true },
    { prefijo: 'post_',            hasta: 24, largo: 0.80, alfa: 0.85, mece: false },
    { prefijo: 'sprite_arbustos_', hasta: 28, largo: 0.48, alfa: 0.75, mece: true },
    { prefijo: 'sprite_piedras_',  hasta: 34, largo: 0.40, alfa: 0.70, mece: false }
  ];
  /* Los edificios van por nombre porque no forman serie numerada. */
  var EDIFICIOS = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                   'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                   'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];
  var LARGO_EDIFICIO = 0.50;
  var ALFA_EDIFICIO  = 0.90;

  /* Las texturas de sombra ya dibujadas: clave nueva → dónde cae el pie dentro
     de ella. Vive en el módulo y no en la escena porque las texturas viven en
     game.textures, que sobrevive a los cambios de escena: al volver al mapa no
     hay que volver a dibujar ninguna. */
  var horneadas = {};

  function log() {
    if (!window.GF_SOMBRAS_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[sombras]');
    console.log.apply(console, a);
  }

  function util(spr) {
    if (!spr || spr.__gfSombra || spr.active === false) return false;
    if (!spr.texture || !spr.texture.key) return false;
    // Un sprite destruido conserva sus campos pero pierde la escena.
    return !!spr.scene;
  }

  /** La lista de objetos a los que hay que ponerles sombra. */
  function candidatos(scene) {
    var out = [], i, f;
    for (f = 0; f < FAMILIAS.length; f++) {
      var fam = FAMILIAS[f];
      for (i = 1; i <= fam.hasta; i++) {
        var spr = scene[fam.prefijo + i];
        if (!util(spr)) continue;
        out.push({ spr: spr, largo: fam.largo, alfa: fam.alfa, mece: fam.mece });
      }
    }
    for (i = 0; i < EDIFICIOS.length; i++) {
      var e = scene[EDIFICIOS[i]];
      if (!util(e)) continue;
      out.push({ spr: e, largo: LARGO_EDIFICIO, alfa: ALFA_EDIFICIO, mece: false });
    }
    return out;
  }

  /**
   * La caja OPACA de una textura, en píxeles del archivo.
   *
   * Se pide a gf-profundidad, que ya la mide y la guarda en caché: leer los
   * píxeles de un PNG cuesta milisegundos y hacerlo dos veces por textura, una
   * por módulo, sería tirarlos. Si ese módulo no está, se cae a la caja entera:
   * la sombra sale algo despegada, pero sale.
   */
  function cajaOpaca(scene, clave) {
    var P = window.GFProfundidad;
    if (P && P.medir) {
      try {
        var c = P.medir(scene, clave);
        if (c && c.ancho && c.alto) {
          return { w: c.ancho, h: c.alto,
                   izq: c.izq, der: c.der + 1,       // `der`/`abajo` son índices
                   arriba: c.arriba, abajo: c.abajo + 1 };
        }
      } catch (e) { /* se cae a la caja entera */ }
    }
    var tex = scene.textures.get(clave);
    var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    var w = (img && img.width) || 1, h = (img && img.height) || 1;
    return { w: w, h: h, izq: 0, der: w, arriba: 0, abajo: h };
  }

  function largoDe(largoFam) { return Math.max(0.05, LARGO * largoFam); }

  /**
   * Dibuja —UNA vez por textura y longitud— la sombra proyectada.
   *
   * LA MATRIZ, QUE ES TODO EL ASUNTO. Para un píxel de origen (px, py), su
   * altura sobre el suelo es (gy − py), donde gy es la fila del pie. Entonces:
   *
   *     X = (px − gx) + (gy − py)·k        se va a la derecha con la altura
   *     Y =            (gy − py)·f         y hacia el espectador
   *
   * Desarrollado en la forma que pide el canvas (x' = a·x + c·y + e):
   *
   *     a = 1      c = −k     e = gy·k − gx + margen
   *     b = 0      d = −f     f = gy·f      + margen
   *
   * Fíjate en que el píxel del pie (px=gx, py=gy) cae exactamente en el margen,
   * o sea en el origen de la imagen: la base NO se mueve. Eso es lo que la
   * mantiene pegada al objeto por ancho que sea.
   *
   * Devuelve la clave de la textura nueva y dónde cae dentro de ella el punto
   * por el que la sombra toca el suelo, ya en forma de origen normalizado.
   */
  function hornear(scene, claveOrigen, largo) {
    var clave = 'gfsom_' + claveOrigen + '_' + Math.round(largo * 1000);
    if (horneadas[clave] && scene.textures.exists(clave)) return horneadas[clave];

    var tex = scene.textures.get(claveOrigen);
    var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    if (!img || !img.width || !img.height) return null;

    var w = img.width, h = img.height;
    var caja = cajaOpaca(scene, claveOrigen);
    var gx = (caja.izq + caja.der) / 2;      // centro del pie, a lo ancho
    var gy = caja.abajo;                     // fila del pie

    /* La dirección del sol se reparte entre las dos componentes para que la
       sombra mida `largo` veces la altura del objeto EN SU DIRECCIÓN: así
       cambiar el ángulo no cambia lo larga que se ve. */
    var k = largo * Math.sin(GIRO);
    var f = largo * Math.cos(GIRO);
    if (f < 0.02) f = 0.02;                  // que nunca quede plana del todo

    // La caja de la imagen ya proyectada. gy ≤ h, así que (gy − h) ≤ 0.
    var minX = -gx + (gy - h) * k;
    var maxX = w - gx + gy * k;
    var minY = (gy - h) * f;
    var maxY = gy * f;

    var margen = Math.ceil(DIFUMINA * 3) + 2;      // sitio para el difuminado
    var W = Math.max(1, Math.ceil(maxX - minX) + margen * 2);
    var H = Math.max(1, Math.ceil(maxY - minY) + margen * 2);
    var offX = -minX + margen;
    var offY = -minY + margen;

    var cv, ctx;
    try {
      cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      ctx = cv.getContext('2d');
      if (!ctx) return null;

      /* 1. La silueta, ya cizallada y difuminada. Se dibuja en color: de esta
            pasada lo que interesa es el ALFA. */
      if (DIFUMINA > 0 && typeof ctx.filter === 'string') {
        ctx.filter = 'blur(' + DIFUMINA + 'px)';
      }
      ctx.setTransform(1, 0, -k, -f, gy * k - gx + offX, gy * f + offY);
      ctx.drawImage(img, 0, 0);

      /* 2. Se tiñe conservando ese alfa: `source-in` pinta solo donde ya hay
            dibujo y respeta su transparencia, difuminado incluido. */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (typeof ctx.filter === 'string') ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = COLOR;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    } catch (e) {
      log('no se pudo dibujar la sombra de', claveOrigen, e && e.message);
      return null;
    }

    try {
      if (scene.textures.exists(clave)) scene.textures.remove(clave);
      var t = scene.textures.addCanvas(clave, cv);
      /* Filtro suave SOLO para las sombras. El juego va en pixel art con
         NEAREST, pero una sombra difuminada escalada con NEAREST recupera el
         borde de escalera que se acaba de quitar. */
      if (t && t.setFilter && window.Phaser && Phaser.Textures &&
          Phaser.Textures.FilterMode) {
        t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    } catch (e) {
      log('no se pudo registrar', clave, e && e.message);
      return null;
    }

    horneadas[clave] = {
      clave: clave,
      // Dónde cae el pie dentro de la textura nueva, normalizado.
      ox: offX / W, oy: offY / H,
      // Y dónde está ese mismo pie en la textura ORIGINAL, para colocarla.
      pieX: gx / w, pieY: gy / h
    };
    return horneadas[clave];
  }

  /** Crea la sombra de un objeto. */
  function crearSombra(scene, item) {
    var spr = item.spr;
    if (!util(spr)) return null;
    var claveOrigen = spr.texture.key;
    var horno = hornear(scene, claveOrigen, largoDe(item.largo));
    if (!horno) return null;

    var s;
    try {
      s = scene.add.image(0, 0, horno.clave);
    } catch (e) { return null; }

    s.setOrigin(horno.ox, horno.oy);
    s.setDepth(PROFUNDIDAD);
    /* MULTIPLY: oscurece lo que hay debajo en vez de taparlo. Es lo que permite
       ponerla por ENCIMA del personaje —que es lo que hace una sombra de
       verdad— sin borrarlo. Las Image respetan el modo de mezcla; las figuras
       (Rectangle/Graphics) no, por eso esto es una imagen. */
    if (s.setBlendMode && window.Phaser && Phaser.BlendModes) {
      s.setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    /* La sombra no se pulsa NUNCA: si fuera interactiva se comería los clics de
       los árboles y las minas que tiene debajo. */
    if (s.disableInteractive) s.disableInteractive();
    if (s.setData) s.setData('gfSombra', true);

    var d = {
      spr: s, dueno: spr, claveOrigen: claveOrigen, horno: horno,
      largoFam: item.largo, alfaFam: item.alfa, mece: !!item.mece,
      // Rotación de reposo del dueño: el meneo se mide contra ella.
      rotReposo: spr.rotation || 0
    };
    spr.__gfSombra = d;
    return d;
  }

  /**
   * El meneo del viento: un giro minúsculo sobre el pie.
   *
   * Solo para lo que de verdad se inclina. El giro es NEGATIVO cuando el árbol
   * se inclina a la derecha, porque la sombra sale hacia abajo-derecha y girar
   * en negativo alarga su punta hacia la derecha, que es a donde se ha ido la
   * copa. Con tope, para que la base siga pegada aunque la racha apriete.
   */
  function meneo(d, viento) {
    if (!d.mece) return 0;
    if (!viento || viento.fuerza < 0.02) {
      // En calma, lo que tenga ahora ES su reposo: así un objeto que nació
      // mientras soplaba no se queda con la sombra torcida para siempre.
      d.rotReposo = d.dueno.rotation || 0;
      return 0;
    }
    var v = ((d.dueno.rotation || 0) - d.rotReposo) * EXAGERA_VIENTO;
    if (v >  MENEO_MAX) v =  MENEO_MAX;
    if (v < -MENEO_MAX) v = -MENEO_MAX;
    return -v;
  }

  /** Coloca y tiñe una sombra según cómo esté ahora su dueño. */
  function colocar(st, d, viento) {
    var spr = d.dueno, s = d.spr, hn = d.horno;

    /* El punto del mundo donde la sombra toca el suelo. Se recalcula cada vez
       porque el objeto puede haberse movido (un árbol talado baja a tocón). */
    s.setPosition(
      spr.x + spr.displayWidth  * (hn.pieX - spr.originX),
      spr.y + spr.displayHeight * (hn.pieY - spr.originY)
    );

    /* La cizalla ya está dibujada dentro de la textura, así que aquí solo se
       copia la escala del dueño. Sin espejo y sin aplastar: ya está hecho. */
    s.setScale(
      spr.displayWidth  / (spr.width  || 1),
      spr.displayHeight / (spr.height || 1)
    );
    s.setRotation(meneo(d, viento));
    s.setAlpha(ALFA * d.alfaFam * st.luz);
    s.setVisible(spr.visible !== false && st.luz > 0.02);
  }

  /** Cuánta luz hay: 1 de día, 0 de noche cerrada. */
  function luzDelDia() {
    var c = window.GFCiclo;
    if (!c || !c.oscuridad) return 1;
    try {
      var o = c.oscuridad();
      if (typeof o !== 'number' || !isFinite(o)) return 1;
      return Math.max(0, Math.min(1, 1 - o));
    } catch (e) { return 1; }
  }

  /** Dirección y fuerza del viento ahora mismo, sin crear basura. */
  function vientoAhora(fuera) {
    var V = window.GFViento;
    fuera.dir = 1; fuera.fuerza = 0;
    if (V && V.vector) { try { V.vector(fuera); } catch (e) {} }
    if (typeof fuera.fuerza !== 'number' || !isFinite(fuera.fuerza)) fuera.fuerza = 0;
    return fuera;
  }

  /** ¿Sigue viva la sombra? Si su dueño se fue, se va con él. */
  function huerfana(d) {
    var spr = d.dueno;
    return !spr || !spr.scene || spr.active === false;
  }

  function tirar(d) {
    if (d.spr && d.spr.destroy) d.spr.destroy();
    if (d.dueno && d.dueno.__gfSombra === d) d.dueno.__gfSombra = null;
    d.spr = null;
  }

  /** El dueño cambió de textura (un árbol talado pasa a tocón). */
  function rehacer(scene, d) {
    var claveOrigen = d.dueno.texture.key;
    var horno = hornear(scene, claveOrigen, largoDe(d.largoFam));
    if (!horno) return;
    d.claveOrigen = claveOrigen;
    d.horno = horno;
    try {
      d.spr.setTexture(horno.clave);
      d.spr.setOrigin(horno.ox, horno.oy);
    } catch (e) { /* textura ya liberada: se queda con la anterior */ }
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfSombras) { recalcular(scene); return scene.__gfSombras; }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      sombras: [],
      hechas: 0,
      // Se arranca con la luz REAL, no con 1: si entras de noche las sombras
      // tienen que nacer apagadas.
      luz: luzDelDia(),
      cursor: 0,
      viento: { dir: 1, fuerza: 0 },
      porFrame: opciones.porFrame || POR_FRAME
    };
    scene.__gfSombras = st;

    st.onUpdate = function () {
      var i, d;

      st.luz = luzDelDia();
      var viento = vientoAhora(st.viento);
      var sopla = viento.fuerza > 0.02;

      /* 1. Ir creando las que faltan, de pocas en pocas. La primera de cada
            textura además la DIBUJA (ver hornear); las demás la reutilizan. */
      var n = Math.min(st.porFrame, st.pendientes.length);
      for (i = 0; i < n; i++) {
        var item = st.pendientes.shift();
        if (!item || !util(item.spr)) continue;
        d = crearSombra(scene, item);
        if (d) { colocar(st, d, viento); st.sombras.push(d); st.hechas++; }
      }
      if (n && !st.pendientes.length) log('creadas', st.hechas, 'sombras');

      /* 2. Mientras sopla, TODAS las que se mecen lo hacen cada fotograma —
            pero se escribe UNA sola propiedad. Recolocarlas enteras serían
            cientos de escrituras por fotograma para mover un ángulo. */
      if (sopla) {
        for (i = 0; i < st.sombras.length; i++) {
          d = st.sombras[i];
          if (d.spr && d.mece) d.spr.setRotation(meneo(d, viento));
        }
      }

      /* 3. Repaso ROTATIVO. Recolocarlas todas cada fotograma sería tirar el
            presupuesto en objetos que casi nunca se mueven; no repasarlas nunca
            deja sombras de árboles que ya no están. Un puñado por fotograma: la
            vuelta completa tarda una docena de fotogramas. */
      var repasos = Math.min(REVISA_FRAME, st.sombras.length);
      for (i = 0; i < repasos; i++) {
        if (!st.sombras.length) break;
        if (st.cursor >= st.sombras.length) st.cursor = 0;
        d = st.sombras[st.cursor];

        if (huerfana(d)) {
          tirar(d);
          st.sombras.splice(st.cursor, 1);
          continue;                       // el cursor ya apunta al siguiente
        }
        if (d.dueno.texture && d.dueno.texture.key !== d.claveOrigen) {
          rehacer(scene, d);
        }
        colocar(st, d, viento);
        st.cursor++;
      }
    };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montado con', st.pendientes.length, 'objetos');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfSombras;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    for (var i = 0; i < st.sombras.length; i++) tirar(st.sombras[i]);
    st.sombras.length = 0;
    /* Y los que estaban en cola: si no, sus dueños se quedan con `__gfSombra`
       puesto y al volver a la escena no se les crearía sombra. */
    for (var j = 0; j < st.pendientes.length; j++) {
      var p = st.pendientes[j];
      if (p && p.spr) p.spr.__gfSombra = null;
    }
    st.pendientes.length = 0;
    scene.__gfSombras = null;
    /* Las texturas dibujadas NO se borran a propósito: son pocas y pequeñas
       (una por textura y longitud), viven en game.textures y así al volver al
       mapa las sombras aparecen sin volver a dibujar nada. */
  }

  function recalcular(scene) {
    var st = scene && scene.__gfSombras;
    if (!st) return 0;
    var nuevos = candidatos(scene);
    if (nuevos.length) st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  /** Vuelve a dibujarlas todas. Hace falta al cambiar el ángulo o la longitud. */
  function rehornear(scene) {
    var st = scene && scene.__gfSombras;
    horneadas = {};
    if (!st) return 0;
    for (var i = 0; i < st.sombras.length; i++) {
      var d = st.sombras[i];
      if (!d.spr) continue;
      var horno = hornear(scene, d.claveOrigen, largoDe(d.largoFam));
      if (!horno) continue;
      d.horno = horno;
      d.spr.setTexture(horno.clave);
      d.spr.setOrigin(horno.ox, horno.oy);
    }
    return st.sombras.length;
  }

  window.GFSombras = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    rehornear: rehornear,
    /** Para afinar en caliente desde la consola, sin recargar. */
    ajustar: function (op, scene) {
      op = op || {};
      var rehacerTodo = false;
      if (typeof op.giro === 'number')     { GIRO = op.giro;         rehacerTodo = true; }
      if (typeof op.largo === 'number')    { LARGO = op.largo;       rehacerTodo = true; }
      if (typeof op.difumina === 'number') { DIFUMINA = op.difumina; rehacerTodo = true; }
      if (typeof op.color === 'string')    { COLOR = op.color;       rehacerTodo = true; }
      if (typeof op.alfa === 'number')     ALFA = op.alfa;   // no hace falta rehornear
      if (rehacerTodo && scene) rehornear(scene);
      return { giro: GIRO, largo: LARGO, alfa: ALFA,
               difumina: DIFUMINA, color: COLOR };
    },
    estado: function (scene) {
      var st = scene && scene.__gfSombras;
      if (!st) return null;
      var n = 0, k;
      for (k in horneadas) if (horneadas.hasOwnProperty(k)) n++;
      return { hechas: st.hechas, vivas: st.sombras.length,
               pendientes: st.pendientes.length,
               texturasDibujadas: n,
               luz: Math.round(st.luz * 100) / 100,
               viento: Math.round(st.viento.fuerza * 100) / 100 };
    },
    _interno: { candidatos: candidatos, crearSombra: crearSombra,
                colocar: colocar, meneo: meneo, hornear: hornear,
                cajaOpaca: cajaOpaca, rehacer: rehacer, largoDe: largoDe,
                luzDelDia: luzDelDia, vientoAhora: vientoAhora,
                horneadas: function () { return horneadas; },
                PROFUNDIDAD: PROFUNDIDAD, FAMILIAS: FAMILIAS,
                EDIFICIOS: EDIFICIOS }
  };
})();
