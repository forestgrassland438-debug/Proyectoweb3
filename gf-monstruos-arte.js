/* ===========================================================================
 * EL ARTE DE LOS MONSTRUOS                                         (2026-10-11)
 *
 * "Quiero que todos los enemigos sean imágenes, no código, en pixel art y
 * respetando los gráficos del juego."  Los dibujos están en
 * Game/Sprites/monstruos/ y los escribe tools/generar-monstruos.py (los
 * humanoides salen de los fotogramas reales de los personajes Soulbound, con
 * sus brazos; el lobo, del zorro del juego). Aquí solo se CARGAN y se crean sus
 * animaciones. Lo usan gf-mina-zombis, gf-mina-espectros, gf-mina-serpiente y
 * gf-salvaje.
 *
 * UNA VEZ POR PARTIDA: los atlas son pequeños (unos 3 MB de vídeo entre todos)
 * y las animaciones de Phaser son del JUEGO, no de la escena. Si se borrara la
 * textura al salir de la mina, la animación global se quedaría apuntando a
 * nada y tumbaría el bucle la próxima vez (ver la memoria "animaciones
 * globales"). Así que se cargan la primera vez que hacen falta y se quedan;
 * la memoria no crece por entrar y salir.
 *
 *   GFMonstruosArte.cargar(scene, ['zombi_a', 'lobo', 'serpiente'], ['gfsp_bola'])
 *       -> Promise<boolean>  (true si está todo lo pedido)
 *   GFMonstruosArte.anim('lobo', 'camina')       -> 'gfm_lobo_camina'
 *   GFMonstruosArte.anim('mago', 'down')         -> 'gfm_mago_down'
 *   GFMonstruosArte.fotograma('mago', 'down')    -> 'abajo_1'
 *   GFMonstruosArte.origenHumanoide(sprite)      pies en la base del cuerpo
 *   Las bestias (lobo, araña, gólem) llevan su punto de apoyo en cada
 *   fotograma del atlas (`pivot`): Phaser lo usa de origen solo.
 * ======================================================================== */
(function () {
  'use strict';

  var V = '20261018a';   // (2026-10-18) los monstruos del cementerio, el desierto y la tundra
  var RUTA = './Game/Sprites/monstruos/';
  // Humanoides: tipo -> fotogramas por segundo al andar.
  var HUMANOIDES = { zombi_a: 6, zombi_b: 6, zombi_c: 6, zombi_d: 6, zombi_jefe: 5, espectro: 6, mago: 6, brujo: 7,
                     // (2026-10-18) Los de los mapas nuevos.
                     esqueleto: 7, nigromante: 6, momia: 5 };
  // Bestias: tipo -> acción -> [fotogramas, por segundo, repetir].
  var BESTIAS = {
    lobo:  { camina: [4, 10, -1], ataque: [3, 12, 0], quieto: [2, 2, -1] },
    arana: { camina: [4, 12, -1], ataque: [3, 10, 0], quieto: [2, 2, -1] },
    golem: { camina: [4, 6, -1],  ataque: [3, 7, 0],  quieto: [2, 1.5, -1] },
    // (2026-10-18) Los de los mapas nuevos (los gólems y el lobo, el mismo
    // modelo con otros materiales).
    escorpion:     { camina: [4, 12, -1], ataque: [3, 10, 0], quieto: [2, 2, -1] },
    golem_cripta:  { camina: [4, 6, -1],  ataque: [3, 7, 0],  quieto: [2, 1.5, -1] },
    golem_arena:   { camina: [4, 6, -1],  ataque: [3, 7, 0],  quieto: [2, 1.5, -1] },
    golem_hielo:   { camina: [4, 6, -1],  ataque: [3, 7, 0],  quieto: [2, 1.5, -1] },
    lobo_escarcha: { camina: [4, 10, -1], ataque: [3, 12, 0], quieto: [2, 2, -1] }
  };
  // Atlas sin animaciones (fotogramas que el juego elige): la serpiente de la
  // mina, su cabeza y sus anillos en 16 direcciones ('cabeza_<i>',
  // 'abierta_<i>', 'anillo_<i>'; tools/gf_serpiente3d.py).
  var PIEZAS = { serpiente: true };
  // Piezas sueltas: clave de textura -> archivo.
  var SUELTAS = {
    gfsp_monticulo: 'serpiente/monticulo.png',
    gfsp_agujero: 'serpiente/agujero.png',
    gfsp_grieta: 'serpiente/grieta.png',
    gfsp_bola: 'efectos/bola_fuego.png',
    gfm_orbe_mago: 'efectos/orbe_mago.png',
    gfm_roca: 'efectos/roca.png',
    gfm_espina: 'efectos/espina.png',
    gfm_savia: 'efectos/savia.png',
    gfm_rayo: 'efectos/rayo.png',
    gfm_cartel: 'efectos/cartel.png',
    // (2026-10-18) Los proyectiles de los mapas nuevos.
    gfm_roca_arena: 'efectos/roca_arena.png',
    gfm_roca_hielo: 'efectos/roca_hielo.png',
    gfm_hueso: 'efectos/hueso.png',
    gfm_veneno: 'efectos/veneno.png',
    gfm_rayo_alma: 'efectos/rayo_alma.png'
  };
  var DIR_ES = { down: 'abajo', up: 'arriba', right: 'derecha', left: 'izquierda' };
  var FOTOS = 7;
  // Alto del cuerpo del personaje en sus PNG (los pies, en la base del cuadro).
  var ALTO_CUERPO = 51;

  function clave(tipo) { return 'gfm_' + tipo; }
  function anim(tipo, que) { return 'gfm_' + tipo + '_' + que; }
  function fotograma(tipo, que) {
    if (HUMANOIDES[tipo]) return (DIR_ES[que] || 'abajo') + '_1';
    return (que || 'quieto') + '_1';
  }

  /** Crea las animaciones de un atlas ya cargado (solo las que tengan fotogramas). */
  function crearAnims(scene, tipo) {
    var k = clave(tipo);
    if (!scene.textures.exists(k)) return false;
    var tex = scene.textures.get(k);
    if (PIEZAS[tipo]) {
      try { tex.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
      return tex.has('cabeza_0');
    }
    var hechas = 0;
    var crear = function (nombre, nombres, fps, repetir) {
      if (scene.anims.exists(nombre)) { hechas++; return; }
      var frames = nombres.filter(function (f) { return tex.has(f); }).map(function (f) { return { key: k, frame: f }; });
      if (!frames.length) return;                  // una animación vacía tumba el bucle
      scene.anims.create({ key: nombre, frames: frames, frameRate: fps, repeat: repetir });
      hechas++;
    };
    if (HUMANOIDES[tipo]) {
      Object.keys(DIR_ES).forEach(function (en) {
        var lista = [];
        for (var n = 1; n <= FOTOS; n++) lista.push(DIR_ES[en] + '_' + n);
        crear(anim(tipo, en), lista, HUMANOIDES[tipo], -1);
      });
    } else if (BESTIAS[tipo]) {
      // De perfil ('camina'), y (2026-10-11) de frente y de espaldas
      // ('camina_abajo', 'camina_arriba'), si el atlas las trae.
      Object.keys(BESTIAS[tipo]).forEach(function (acc) {
        var d = BESTIAS[tipo][acc];
        ['', '_abajo', '_arriba'].forEach(function (suf) {
          var lista = [];
          for (var n = 1; n <= d[0]; n++) lista.push(acc + suf + '_' + n);
          crear(anim(tipo, acc + suf), lista, d[1], d[2]);
        });
      });
    }
    return hechas > 0;
  }

  /**
   * Carga lo que falte de `tipos` (atlas) y `sueltas` (claves de SUELTAS).
   * Nunca se queda colgada: resuelve al terminar la carga, al apagarse la
   * escena o a los 15 s, lo que llegue antes.
   */
  function cargar(scene, tipos, sueltas) {
    tipos = tipos || [];
    sueltas = sueltas || [];
    var faltan = 0;
    tipos.forEach(function (t) {
      if (!HUMANOIDES[t] && !BESTIAS[t] && !PIEZAS[t]) return;
      if (scene.textures.exists(clave(t))) return;
      scene.load.atlas(clave(t), RUTA + t + '.png?v=' + V, RUTA + t + '.json?v=' + V);
      faltan++;
    });
    sueltas.forEach(function (k) {
      if (!SUELTAS[k] || scene.textures.exists(k)) return;
      scene.load.image(k, RUTA + SUELTAS[k] + '?v=' + V);
      faltan++;
    });
    var terminar = function () {
      var ok = true;
      tipos.forEach(function (t) { if (!crearAnims(scene, t)) ok = false; });
      sueltas.forEach(function (k) {
        if (!scene.textures.exists(k)) { ok = false; return; }
        try { scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
      });
      return ok;
    };
    if (!faltan) return Promise.resolve(terminar());
    return new Promise(function (resolver) {
      var listo = false, reloj = null;
      var fin = function (vivo) {
        if (listo) return;
        listo = true;
        clearTimeout(reloj);
        scene.load.off('complete', alCompletar);
        scene.events.off('shutdown', alApagar);
        scene.events.off('destroy', alApagar);
        resolver(vivo ? terminar() : false);
      };
      var alCompletar = function () { fin(true); };
      var alApagar = function () { fin(false); };      // la escena se fue: nada que montar
      scene.load.once('complete', alCompletar);
      scene.events.once('shutdown', alApagar);
      scene.events.once('destroy', alApagar);
      reloj = setTimeout(function () { fin(true); }, 15000);
      scene.load.start();
    });
  }

  /**
   * Origen de un humanoide: (0.5, el centro del CUERPO). El cuadro del atlas
   * es más alto que el personaje (sitio para el báculo y la cola), así que con
   * el origen por defecto los pies quedarían más abajo que los de un jugador.
   * Con esto, `y` es el centro del cuerpo y los pies caen en y + 51·escala/2,
   * igual que el del jugador.
   */
  function origenHumanoide(spr) {
    var h = spr.frame && spr.frame.height ? spr.frame.height : ALTO_CUERPO;
    spr.setOrigin(0.5, 1 - (ALTO_CUERPO / 2) / h);
    return spr;
  }

  window.GFMonstruosArte = {
    cargar: cargar,
    anim: anim,
    clave: clave,
    fotograma: fotograma,
    origenHumanoide: origenHumanoide,
    ALTO_CUERPO: ALTO_CUERPO,
    _interno: { HUMANOIDES: HUMANOIDES, BESTIAS: BESTIAS, PIEZAS: PIEZAS, SUELTAS: SUELTAS, crearAnims: crearAnims }
  };
})();
