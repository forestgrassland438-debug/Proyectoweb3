/* ===========================================================================
 * SOMBRAS DEL ESCENARIO
 *
 * QUÉ HACE
 *   Le pone a los árboles, las casas, los postes y demás una sombra tumbada
 *   por el suelo hacia ABAJO Y A LA DERECHA, con SU MISMA SILUETA. El sol está
 *   arriba a la izquierda —que es de donde vienen las luces del arte del
 *   juego—, así que la sombra cae al lado contrario.
 *
 * CÓMO SE DIBUJA UNA SOMBRA DE VERDAD
 *   La sombra es el MISMO sprite, con TRES cosas que la convierten en sombra y
 *   no en un gemelo negro:
 *
 *     1. ESPEJO VERTICAL (escala Y negativa). Es lo que la tumba: el sprite
 *        deja de subir desde el pie y pasa a bajar desde el pie. Sin esto, por
 *        mucho que se gire, la silueta sigue de pie — que es lo que se veía
 *        antes y por lo que las sombras "estaban al revés": salían hacia
 *        ARRIBA a la derecha, como si el sol estuviera bajo el suelo.
 *
 *     2. GIRO NEGATIVO. Con el sprite ya volcado hacia abajo, girar en
 *        negativo lo lleva hacia la derecha. Positivo lo llevaría a la
 *        izquierda, que sería un sol de poniente.
 *
 *     3. APLASTADO. Una sombra a la misma longitud que el objeto no parece
 *        sombra. Cada familia trae el suyo: un poste es un palo fino y su
 *        sombra es larga y estrecha; una casa es un bloque bajo y ancho.
 *
 * EL PIVOTE ES EL PIE DE VERDAD, NO EL BORDE DEL PNG
 *   Casi todos los PNG del juego traen transparencia de sobra por abajo y por
 *   los lados. Si se gira sobre la esquina del ARCHIVO, el pivote cae en el
 *   aire y la sombra se va de paseo: aparece despegada del tronco, torcida o
 *   estirada de más. Por eso el origen se calcula sobre la CAJA OPACA de la
 *   textura (la misma medida que usa gf-profundidad.js, y de su misma caché).
 *
 * LA SOMBRA TAPA AL QUE PASA POR ELLA
 *   Va en MULTIPLY y por encima de todo el mundo ordenado por Y, así que
 *   cuando el personaje entra en la sombra de un árbol se le oscurece de
 *   verdad, en vez de pisarla. Multiplicar y no superponer es lo que hace que
 *   siga viéndose la hierba y la ropa por debajo: una mancha opaca encima sería
 *   un agujero negro. Como TODAS comparten profundidad, el renderizador las
 *   dibuja en una sola tanda y el cambio de mezcla cuesta una vez, no ciento.
 *
 * SE MECEN CON EL VIENTO
 *   gf-viento.js inclina los árboles; aquí se lee cuánto se ha inclinado CADA
 *   objeto respecto a su reposo y la sombra se alarga en esa misma dirección,
 *   exagerada — la punta de una sombra larga recorre mucho más que la copa.
 *   Lo que no se inclina (casas, piedras) recibe un vaivén suave y propio para
 *   que el mundo entero no se quede quieto cuando sopla.
 *
 * DE NOCHE NO HAY SOL
 *   Se apagan al caer la noche. Y el nivel de luz se aplica también a las que
 *   se crean DESPUÉS del cambio: antes nacían a pleno día aunque fuera de
 *   noche, y por eso a veces aparecían sombras a oscuras.
 *
 * SIGUEN A SU DUEÑO
 *   Si el objeto se mueve, cambia de textura (un árbol talado pasa a tocón),
 *   se apaga por recorte de cámara o lo destruyen, su sombra hace lo mismo. Sin
 *   esto quedaban sombras de árboles que ya no están.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFSombras && GFSombras.montar(this);
 *
 * API
 *   GFSombras.montar(scene, op) / desmontar(scene)
 *   GFSombras.recalcular(scene)     busca objetos nuevos
 *   GFSombras.estado(scene)
 *   GFSombras.ajustar({giro, aplasta, alfa})   para probar en caliente
 * ======================================================================== */
(function () {
  'use strict';

  /* Hacia dónde cae. 0.62 rad son unos 35° respecto a la vertical: el sol
     queda arriba a la izquierda y la sombra se tumba abajo a la derecha. */
  var GIRO    = 0.62;
  /* Aplastado general. Cada familia lo multiplica por el suyo. */
  var APLASTA = 0.58;
  var ALFA    = 0.30;
  /* Gris azulado y no negro puro: multiplicado por negro puro la hierba se
     convierte en un agujero. Este apaga y enfría, que es lo que hace la luz
     rebotada del cielo dentro de una sombra. */
  var COLOR   = 0x54606f;

  /* Por encima de TODO lo que ordena por Y (el mapa mide 5008 px, más algún
     desplazamiento de edificio) y por debajo de los pájaros (8000), del clima
     (8030+), de la capa de noche (9000) y de los bocadillos del chat (99998). */
  var PROFUNDIDAD = 6000;

  var POR_FRAME     = 6;    // sombras nuevas creadas por fotograma
  var REVISA_FRAME  = 12;   // sombras revisadas por fotograma (posición/textura)

  /* Cuánto exagera la sombra el balanceo del árbol. La copa se mueve unos
     centímetros; la punta de una sombra larga, metros. 2.4 es lo que hace que
     se note sin que parezca un limpiaparabrisas. */
  var EXAGERA_VIENTO = 2.4;
  /* Vaivén de lo que NO se inclina solo (casas, piedras, arbustos). */
  var VAIVEN_QUIETO  = 0.045;

  /* A qué se le pone sombra. `aplasta` es el largo de la sombra respecto al
     objeto y `alfa` lo oscura que es. */
  var FAMILIAS = [
    { prefijo: 'sprite_arbolx',    hasta: 18, aplasta: 0.62, alfa: 1.00, mece: true },
    { prefijo: 'sprite_pinos',     hasta: 45, aplasta: 0.58, alfa: 1.00, mece: true },
    { prefijo: 'post_',            hasta: 24, aplasta: 0.85, alfa: 0.85, mece: false },
    { prefijo: 'sprite_arbustos_', hasta: 28, aplasta: 0.45, alfa: 0.75, mece: true },
    { prefijo: 'sprite_piedras_',  hasta: 34, aplasta: 0.38, alfa: 0.70, mece: false }
  ];
  /* Los edificios van por nombre porque no forman serie numerada. */
  var EDIFICIOS = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                   'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                   'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];
  var APLASTA_EDIFICIO = 0.30;      // una casa es ancha y baja: proyecta poco
  var ALFA_EDIFICIO    = 0.90;

  function log() {
    if (!window.GF_SOMBRAS_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[sombras]');
    console.log.apply(console, a);
  }

  /** La lista de objetos a los que hay que ponerles sombra. */
  function candidatos(scene) {
    var out = [], i, f;
    for (f = 0; f < FAMILIAS.length; f++) {
      var fam = FAMILIAS[f];
      for (i = 1; i <= fam.hasta; i++) {
        var spr = scene[fam.prefijo + i];
        if (!util(spr)) continue;
        out.push({ spr: spr, aplasta: fam.aplasta, alfa: fam.alfa, mece: fam.mece });
      }
    }
    for (i = 0; i < EDIFICIOS.length; i++) {
      var e = scene[EDIFICIOS[i]];
      if (!util(e)) continue;
      out.push({ spr: e, aplasta: APLASTA_EDIFICIO, alfa: ALFA_EDIFICIO, mece: false });
    }
    return out;
  }

  function util(spr) {
    if (!spr || spr.__gfSombra || spr.active === false) return false;
    if (!spr.texture || !spr.texture.key) return false;
    // Un sprite ya destruido conserva sus campos pero pierde la escena.
    return !!spr.scene;
  }

  /**
   * La caja OPACA de una textura, en píxeles del archivo.
   *
   * Se pide a gf-profundidad, que ya la mide y la guarda en caché: leer los
   * píxeles de un PNG cuesta milisegundos y hacerlo dos veces por textura, una
   * por módulo, sería tirarlos. Si ese módulo no está, se cae a la caja entera
   * — la sombra sale un poco despegada, pero sale.
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

  /**
   * Crea la sombra de un objeto.
   *
   * El origen se pone en el PIE REAL (centro de lo opaco a lo ancho, borde de
   * abajo de lo opaco a lo alto) expresado como origen normalizado de la
   * textura. Ese punto es por donde la sombra toca el suelo y es el eje del
   * giro: clavado ahí, la sombra se tumba sin despegarse del objeto.
   */
  function crearSombra(scene, item) {
    var spr = item.spr;
    if (!util(spr)) return null;
    var clave = spr.texture.key;
    var caja = cajaOpaca(scene, clave);
    if (!caja.w || !caja.h) return null;

    var ox = ((caja.izq + caja.der) / 2) / caja.w;
    var oy = caja.abajo / caja.h;

    var s;
    try {
      s = scene.add.image(0, 0, clave);
    } catch (e) { return null; }

    s.setOrigin(ox, oy);
    s.setTint(COLOR);
    s.setDepth(PROFUNDIDAD);
    /* MULTIPLY: la sombra oscurece lo que hay debajo en vez de taparlo. Es lo
       que permite ponerla por ENCIMA del personaje —que es lo que pide una
       sombra de verdad— sin borrarlo. Las Image sí respetan el modo de mezcla;
       las figuras (Rectangle/Graphics) no, por eso esto es una imagen. */
    if (s.setBlendMode && window.Phaser && Phaser.BlendModes) {
      s.setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    /* La sombra no se pulsa NUNCA: si fuera interactiva se comería los clics
       de los árboles y las minas que tiene debajo. */
    if (s.disableInteractive) s.disableInteractive();
    if (s.setData) s.setData('gfSombra', true);

    var d = {
      spr: s, dueno: spr, clave: clave,
      ox: ox, oy: oy,
      aplasta: item.aplasta, alfaFam: item.alfa,
      mece: !!item.mece,
      // Rotación de reposo del dueño: el balanceo se mide contra ella.
      rotReposo: spr.rotation || 0,
      fase: Math.random() * 6.283
    };
    spr.__gfSombra = d;
    return d;
  }

  /** Coloca, orienta y tiñe una sombra según cómo esté ahora su dueño. */
  function colocar(st, d, ahora, viento) {
    var spr = d.dueno, s = d.spr;

    // El punto del mundo donde la sombra toca el suelo. Se recalcula cada vez
    // porque el objeto puede haberse movido (un árbol talado baja a tocón).
    s.setPosition(
      spr.x + spr.displayWidth  * (d.ox - spr.originX),
      spr.y + spr.displayHeight * (d.oy - spr.originY)
    );

    /* BALANCEO.
       Si el dueño se inclina (lo hace gf-viento con los árboles) la sombra se
       alarga en esa misma dirección, exagerada. Si el dueño no se inclina pero
       hay viento, se le da un vaivén propio para que no se quede clavado. */
    var mov = balanceo(d, ahora, viento);

    var sx = Math.abs(spr.scaleX) || 1;
    var sy = (Math.abs(spr.scaleY) || 1) * APLASTA * d.aplasta;
    // Escala Y NEGATIVA: es el espejo que tumba la silueta hacia abajo.
    // El volteo horizontal se copia con setFlipX y NO con escala negativa:
    // hacer las dos cosas se anula y la sombra saldría al revés que su dueño.
    s.setScale(sx, -sy);
    if (s.setFlipX) s.setFlipX(!!spr.flipX);
    // Giro NEGATIVO: con la silueta ya volcada, lleva la punta a la derecha.
    s.setRotation(-(GIRO + mov));
    s.setAlpha(ALFA * d.alfaFam * st.luz);
    s.setVisible(spr.visible !== false && st.luz > 0.02);
  }

  /**
   * Cuánto se desvía la sombra de su ángulo de reposo por el viento.
   *
   * Si el dueño se inclina (lo hace gf-viento con los árboles) la sombra se
   * alarga en esa misma dirección, exagerada: la copa se mueve poco y la punta
   * de una sombra larga, mucho. Lo que no se inclina —casas, piedras— recibe un
   * vaivén propio, para que el mundo no se quede clavado cuando sopla.
   */
  function balanceo(d, ahora, viento) {
    if (d.mece) {
      var delta = (d.dueno.rotation || 0) - d.rotReposo;
      if (viento.fuerza < 0.02) {
        // En calma, lo que tenga ahora ES su reposo: así un objeto que nació
        // mientras soplaba no se queda con la sombra torcida para siempre.
        d.rotReposo = d.dueno.rotation || 0;
        return 0;
      }
      return delta * EXAGERA_VIENTO;
    }
    if (viento.fuerza > 0.02) {
      return Math.sin(ahora / 900 + d.fase) * VAIVEN_QUIETO * viento.fuerza;
    }
    return 0;
  }

  /**
   * El meneo del viento y NADA MÁS.
   *
   * Mientras sopla hay que tocar las ciento cincuenta sombras cada fotograma, o
   * el viento se ve a tirones. Pero de todo lo que hace `colocar()` —posición,
   * escala, volteo, opacidad, visibilidad, textura— lo ÚNICO que cambia por el
   * viento es el ángulo. Escribir las otras seis propiedades igual las marca
   * como sucias para el renderizador sin que nada haya cambiado: son novecientas
   * escrituras por fotograma tiradas. Aquí se escribe una.
   */
  function mecer(d, ahora, viento) {
    if (!d.spr) return;
    d.spr.setRotation(-(GIRO + balanceo(d, ahora, viento)));
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

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfSombras) {
      // Ya montado: se aprovecha para buscar objetos nuevos.
      recalcular(scene);
      return scene.__gfSombras;
    }

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

    st.onUpdate = function (ahora) {
      var i, d;

      // 1. Nivel de luz del momento. Barato y hace falta para las nuevas.
      st.luz = luzDelDia();
      var viento = vientoAhora(st.viento);

      // 2. Ir creando las que faltan, de pocas en pocas: crear ciento cincuenta
      //    imágenes de golpe es un tirón justo al entrar al mapa.
      var n = Math.min(st.porFrame, st.pendientes.length);
      for (i = 0; i < n; i++) {
        var item = st.pendientes.shift();
        if (!item || !util(item.spr)) continue;
        d = crearSombra(scene, item);
        if (d) {
          colocar(st, d, ahora, viento);
          st.sombras.push(d);
          st.hechas++;
        }
      }
      if (n && !st.pendientes.length) log('creadas', st.hechas, 'sombras');

      /* 3. Repaso ROTATIVO. Recolocar las ciento cincuenta cada fotograma sería
            tirar el presupuesto de un frame entero en objetos que casi nunca se
            mueven; no repasarlas nunca deja sombras de árboles talados. Se
            repasa un puñado por fotograma, así que la vuelta completa tarda una
            docena de fotogramas: invisible, y nada se queda colgado.

            El balanceo del viento SÍ tiene que ir a cada fotograma, o el
            meneo se ve a tirones; para eso está mecer(), que toca UNA sola
            propiedad y solo mientras sopla. */
      // Mientras sopla, TODAS se mecen cada fotograma — pero solo el ángulo.
      if (viento.fuerza > 0.02) {
        for (i = 0; i < st.sombras.length; i++) mecer(st.sombras[i], ahora, viento);
      }

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
        // Un árbol talado cambia de textura: la sombra tiene que cambiar con él
        // o se queda proyectando el árbol que ya no está.
        if (d.dueno.texture && d.dueno.texture.key !== d.clave) {
          rehacer(scene, st, d);
        }
        colocar(st, d, ahora, viento);
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

  /** El dueño cambió de textura: se recalcula el pie y se cambia la silueta. */
  function rehacer(scene, st, d) {
    var clave = d.dueno.texture.key;
    var caja = cajaOpaca(scene, clave);
    d.clave = clave;
    d.ox = ((caja.izq + caja.der) / 2) / caja.w;
    d.oy = caja.abajo / caja.h;
    try {
      d.spr.setTexture(clave);
      d.spr.setOrigin(d.ox, d.oy);
    } catch (e) { /* textura ya liberada: se queda con la anterior */ }
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
    /* Y también los que estaban en cola: si no, sus dueños se quedan con
       `__gfSombra` puesto y al volver a la escena no se les crearía sombra. */
    for (var j = 0; j < st.pendientes.length; j++) {
      var p = st.pendientes[j];
      if (p && p.spr) p.spr.__gfSombra = null;
    }
    st.pendientes.length = 0;
    scene.__gfSombras = null;
  }

  function recalcular(scene) {
    var st = scene && scene.__gfSombras;
    if (!st) return 0;
    var nuevos = candidatos(scene);
    if (nuevos.length) st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  window.GFSombras = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    /** Para afinar en caliente desde la consola sin recargar. */
    ajustar: function (op) {
      op = op || {};
      if (typeof op.giro === 'number')    GIRO = op.giro;
      if (typeof op.aplasta === 'number') APLASTA = op.aplasta;
      if (typeof op.alfa === 'number')    ALFA = op.alfa;
      return { giro: GIRO, aplasta: APLASTA, alfa: ALFA };
    },
    estado: function (scene) {
      var st = scene && scene.__gfSombras;
      if (!st) return null;
      return { hechas: st.hechas, vivas: st.sombras.length,
               pendientes: st.pendientes.length,
               luz: Math.round(st.luz * 100) / 100,
               viento: Math.round(st.viento.fuerza * 100) / 100 };
    },
    _interno: { candidatos: candidatos, crearSombra: crearSombra,
                colocar: colocar, mecer: mecer, balanceo: balanceo,
                cajaOpaca: cajaOpaca, rehacer: rehacer,
                luzDelDia: luzDelDia, vientoAhora: vientoAhora,
                GIRO: GIRO, APLASTA: APLASTA, ALFA: ALFA,
                PROFUNDIDAD: PROFUNDIDAD, FAMILIAS: FAMILIAS,
                EDIFICIOS: EDIFICIOS }
  };
})();
