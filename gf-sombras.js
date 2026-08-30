/* ===========================================================================
 * SOMBRAS DEL ESCENARIO
 *
 * QUÉ HACE
 *   Le pone a los árboles, las casas, los postes y demás una sombra tumbada
 *   hacia la derecha, con SU MISMA SILUETA. No una mancha ovalada debajo: la
 *   silueta de verdad del objeto, estirada por el suelo como la de un sol bajo
 *   por la izquierda.
 *
 * CÓMO
 *   La sombra es el MISMO sprite, teñido de negro, con origen en el pie, girado
 *   y aplastado. Usar la propia textura es lo que hace que la sombra de un pino
 *   se vea de pino y la de una casa de casa; una elipse debajo del tronco no
 *   dice nada del objeto.
 *
 *   Al tener el origen en el pie (0.5, 1), girar el sprite lo tumba SIN
 *   despegarlo del suelo: la base se queda clavada donde está el objeto y solo
 *   se va la punta. Es exactamente cómo se comporta una sombra.
 *
 * DE NOCHE NO HAY SOL
 *   La sombra se va apagando conforme cae la noche y desaparece del todo a
 *   oscuras. Dejarla puesta de noche, con el mundo iluminado solo por farolas,
 *   sería la pista más rápida de que es un truco.
 *
 * SE CREAN A TROZOS
 *   Unas ciento cincuenta imágenes nuevas. Creadas de golpe son un tirón al
 *   entrar, así que se van haciendo de unas pocas por frame.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFSombras && GFSombras.montar(this);
 *
 * API
 *   GFSombras.montar(scene, op) / desmontar(scene)
 *   GFSombras.recalcular(scene)     busca objetos nuevos
 *   GFSombras.estado(scene)
 * ======================================================================== */
(function () {
  'use strict';

  /* Hacia dónde y cuánto se tumba. 0.62 rad son unos 35°, y el sol queda
     arriba a la izquierda — que es de donde vienen las luces del arte del
     juego, así que la sombra cae abajo a la derecha. */
  var GIRO   = 0.62;
  /* Aplastada a poco más de la mitad: una sombra a la misma altura que el
     objeto parece un gemelo negro, no una sombra. */
  var APLASTA = 0.58;
  var ALFA   = 0.26;
  var COLOR  = 0x0a0d10;
  /* Al ras del suelo: por debajo de todo lo que anda y por encima del mapa y de
     los charcos, que van en 1. */
  var PROFUNDIDAD = 2;
  var POR_FRAME = 8;

  /* A qué se le pone sombra. Cada familia trae su propio aplastamiento: un
     poste es un palo fino y su sombra es larga y estrecha; una casa es un
     bloque y la suya es corta y ancha. */
  var FAMILIAS = [
    { prefijo: 'sprite_arbolx',  hasta: 18, aplasta: 0.58, alfa: 1.00 },
    { prefijo: 'sprite_pinos',   hasta: 45, aplasta: 0.55, alfa: 1.00 },
    { prefijo: 'post_',          hasta: 24, aplasta: 0.78, alfa: 0.85 },
    { prefijo: 'sprite_arbustos_', hasta: 28, aplasta: 0.50, alfa: 0.75 },
    { prefijo: 'sprite_piedras_',  hasta: 34, aplasta: 0.42, alfa: 0.70 }
  ];
  /* Los edificios van por nombre porque no forman serie numerada. */
  var EDIFICIOS = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                   'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                   'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];
  var APLASTA_EDIFICIO = 0.34;      // una casa proyecta poco: es ancha y baja
  var ALFA_EDIFICIO    = 0.85;

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
        if (!spr || spr.__gfSombra || spr.active === false) continue;
        if (!spr.texture || !spr.texture.key) continue;
        out.push({ spr: spr, aplasta: fam.aplasta, alfa: fam.alfa });
      }
    }
    for (i = 0; i < EDIFICIOS.length; i++) {
      var e = scene[EDIFICIOS[i]];
      if (!e || e.__gfSombra || e.active === false) continue;
      if (!e.texture || !e.texture.key) continue;
      out.push({ spr: e, aplasta: APLASTA_EDIFICIO, alfa: ALFA_EDIFICIO });
    }
    return out;
  }

  /**
   * Crea la sombra de un objeto.
   *
   * El origen va en el PIE y en el centro a lo ancho: es el punto por el que la
   * sombra toca el suelo. Con el origen en la esquina —que es el que traen los
   * objetos del mapa— al girar la sombra se despegaría del objeto y se iría de
   * paseo, porque estaría girando sobre una esquina y no sobre el pie.
   */
  function crearSombra(scene, item) {
    var spr = item.spr;
    var w = spr.displayWidth || spr.width || 0;
    var h = spr.displayHeight || spr.height || 0;
    if (!w || !h) return null;

    var ox = (spr.originX === undefined) ? 0.5 : spr.originX;
    var oy = (spr.originY === undefined) ? 0.5 : spr.originY;
    var pieX = spr.x + w * (0.5 - ox);
    var pieY = spr.y + h * (1 - oy);

    var s;
    try {
      s = scene.add.image(pieX, pieY, spr.texture.key);
    } catch (e) { return null; }

    s.setOrigin(0.5, 1);
    s.setScale(Math.abs(spr.scaleX) || 1,
               (Math.abs(spr.scaleY) || 1) * item.aplasta);
    s.setRotation(GIRO);
    s.setTint(COLOR);
    s.setAlpha(ALFA * item.alfa);
    s.setDepth(PROFUNDIDAD);
    /* La sombra no se pulsa NUNCA: si fuera interactiva se comería los clics
       de los árboles y las minas que tiene debajo. */
    if (s.disableInteractive) s.disableInteractive();
    s.setData && s.setData('gfSombra', true);

    spr.__gfSombra = s;
    s.__alfaBase = ALFA * item.alfa;
    return s;
  }

  /** Cuánta luz hay: 1 de día, 0 de noche cerrada. */
  function luzDelDia() {
    var c = window.GFCiclo;
    if (!c || !c.oscuridad) return 1;
    try { return Math.max(0, 1 - c.oscuridad()); } catch (e) { return 1; }
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfSombras) {
      scene.__gfSombras.pendientes = candidatos(scene);
      return scene.__gfSombras;
    }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      sombras: [],
      hechas: 0,
      luz: -1,
      porFrame: opciones.porFrame || POR_FRAME
    };
    scene.__gfSombras = st;

    st.onUpdate = function () {
      // 1. ir creando las que faltan, de pocas en pocas
      var n = Math.min(st.porFrame, st.pendientes.length);
      for (var i = 0; i < n; i++) {
        var item = st.pendientes.shift();
        if (!item || !item.spr || item.spr.active === false) continue;
        var s = crearSombra(scene, item);
        if (s) { st.sombras.push(s); st.hechas++; }
      }
      if (n && !st.pendientes.length) log('creadas', st.hechas, 'sombras');

      /* 2. apagarlas de noche. Se toca la opacidad SOLO cuando la luz cambia de
            verdad: escribir alpha en 150 sprites cada frame los marca como
            sucios para el renderizador sin que nada haya cambiado. */
      var luz = luzDelDia();
      if (Math.abs(luz - st.luz) > 0.02) {
        st.luz = luz;
        for (var k = 0; k < st.sombras.length; k++) {
          var sh = st.sombras[k];
          if (sh && sh.active) sh.setAlpha(sh.__alfaBase * luz);
        }
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
    for (var i = 0; i < st.sombras.length; i++) {
      var s = st.sombras[i];
      if (s && s.destroy) s.destroy();
    }
    st.sombras.length = 0;
    scene.__gfSombras = null;
  }

  function recalcular(scene) {
    var st = scene && scene.__gfSombras;
    if (!st) return 0;
    var nuevos = candidatos(scene);
    st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  window.GFSombras = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    estado: function (scene) {
      var st = scene && scene.__gfSombras;
      if (!st) return null;
      return { hechas: st.hechas, pendientes: st.pendientes.length,
               luz: Math.round(st.luz * 100) / 100 };
    },
    _interno: { candidatos: candidatos, crearSombra: crearSombra,
                luzDelDia: luzDelDia, GIRO: GIRO, APLASTA: APLASTA,
                ALFA: ALFA, PROFUNDIDAD: PROFUNDIDAD, FAMILIAS: FAMILIAS,
                EDIFICIOS: EDIFICIOS }
  };
})();
