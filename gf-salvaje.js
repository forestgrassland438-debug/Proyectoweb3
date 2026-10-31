/* ===========================================================================
 * EL MAPA SALVAJE: MONSTRUOS, ESPADA ENTRE JUGADORES Y EL SUELO    (2026-10-11)
 *
 * Lo que pidió el jugador: "en el mapa PvP y neutral quiero también
 * monstruos con sus poderes", "una zona PvP donde los usuarios se puedan dar
 * espadazos o, si arrastran un recurso hacia afuera, puedan soltarlo
 * libremente", y que todo sea imagen (pixel art) y 2.5D.
 *
 * LOS MONSTRUOS (capa `monstruos` de Maps/salvaje.json, a los dos lados del
 * río). Los dibujos son PNG (gf-monstruos-arte.js); aquí está su cabeza:
 *   · GÓLEM DE PIEDRA — lento y duro. Puñetazo de cerca; de lejos ARRANCA UNA
 *     ROCA y te la tira (su sombra avisa dónde cae); si estás pegado, da un
 *     PISOTÓN que levanta una onda.
 *   · LOBO SOMBRÍO — rápido. Muerde; se agacha y SE LANZA en línea recta; al
 *     verte AÚLLA y los lobos cercanos se suman a la caza, más deprisa.
 *   · ARAÑA DE ESPINAS — guarda la distancia. Dispara una ráfaga de ESPINAS o
 *     escupe SAVIA: un charco que frena a quien lo pisa.
 *   · ESPECTRO DE TORMENTA — flota. Marca tres puntos en el suelo y caen
 *     RAYOS; o se DESVANECE y aparece a tu lado.
 *   Todos se ordenan por los pies (2.5D) con su sombra, rodean las paredes
 *   (gf-rutas.js), vuelven a su sitio si te alejas y al morir el SERVIDOR da
 *   la experiencia y los montones del suelo (/api/monstruos/derrotado, con el
 *   número de cada uno). El daño lo pone el servidor (`monstruo_golpe`,
 *   `monstruo_poder`). Un golpe te EMPUJA, pero por pasos: nunca te mete en
 *   una pared (ni a ellos).
 *   DIFICULTAD GRADUADA: con nivel bajo atacan más despacio; nunca más rápido
 *   que su ritmo base.
 *
 * LA ESPADA ENTRE JUGADORES (solo al oeste del río, la zona PvP): el tajo
 * (gf-espada.js) que alcanza a otro jugador manda 'pvp:golpe' al servidor,
 * que comprueba zona, distancia, espada y fantasmas y quita la vida. Los
 * demás ven tu espada moverse ('combate:tajo', gf-mobs-red.js; los clientes
 * viejos aún mandan 'pvp:tajo' y se sigue dibujando).
 *
 * LOS MONSTRUOS SON LOS MISMOS PARA TODOS (2026-10-11, gf-mobs-red.js): uno
 * de la sala piensa por ellos y los demás los ven donde él dice; cada ataque
 * se dibuja en todos y cada uno mira si le alcanza a él.
 *
 * EL SUELO: con un objeto de la bolsa en la mano, un clic en el mapa lo
 * suelta ahí (después de confirmar). Cualquiera lo recoge pasando por
 * encima; el servidor quema y acuña (/api/salvaje/soltar y /recoger).
 *
 * LOS MAPAS NUEVOS (2026-10-18): el cementerio, el desierto y la tundra
 * (Scenes/ZonasScenes.js) usan esto mismo: sus monstruos salen de la capa
 * `monstruos` de su mapa y cada especie lleva su MOLDE de comportamiento
 * ('golem', 'lobo', 'arana' o 'brujo': los cuatro de siempre), sus
 * proyectiles (`tex`) y si flota o anda. El arte se pide según los que haya.
 *
 * CÓMO SE ENGANCHA:  SalvajeScene.create():  GFSalvaje.montar(this)
 * ======================================================================== */
(function () {
  'use strict';

  var ESPECIES = {
    golem_salvaje: {
      // (2026-10-11) Arte en 3 vistas a la densidad del personaje: escala 2.
      arte: 'golem', molde: 'golem', nombre: 'Stone Golem', vida: 200, escala: 2, sombra: 1.9,
      vel: 40, velCaza: 66, vista: 380, olvida: 760, correa: 720,
      golpe: { alcance: 76, cada: 1900 }, poder: [5200, 7800], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 6 * 60 * 1000, color: 0xffb84a
    },
    lobo_salvaje: {
      arte: 'lobo', molde: 'lobo', nombre: 'Shadow Wolf', vida: 90, escala: 2, sombra: 1.4,
      vel: 58, velCaza: 150, vista: 440, olvida: 820, correa: 820,
      golpe: { alcance: 60, cada: 1300 }, poder: [3800, 5800], ancho: 40, alto: 14, cabeza: 76,
      vuelveMs: 4 * 60 * 1000, color: 0xffd23f
    },
    arana_salvaje: {
      arte: 'arana', molde: 'arana', nombre: 'Thorn Spider', vida: 110, escala: 2, sombra: 1.5,
      vel: 52, velCaza: 96, vista: 420, olvida: 780, correa: 720, distancia: 210,
      golpe: { alcance: 56, cada: 1500 }, poder: [3300, 5000], ancho: 44, alto: 14, cabeza: 66,
      vuelveMs: 5 * 60 * 1000, color: 0xff6a3d
    },
    brujo_salvaje: {
      // (2026-10-12) A la escala del jugador (2), como los de la mina.
      arte: 'brujo', molde: 'brujo', flota: true, nombre: 'Storm Wraith', vida: 170, escala: 2, sombra: 1.2, humanoide: true,
      vel: 42, velCaza: 80, vista: 500, olvida: 860, correa: 760, distancia: 240,
      golpe: null, poder: [3600, 5400], ancho: 34, alto: 14, cabeza: 152,
      vuelveMs: 12 * 60 * 1000, color: 0x8ce9ff
    },

    // ── EL CEMENTERIO DE LAS ALMAS (2026-10-18) ──
    zombi_cementerio: {
      arte: 'zombi_a', molde: 'lobo', humanoide: true, nombre: 'Grave Zombie', vida: 120, escala: 2, sombra: 1.2,
      vel: 30, velCaza: 72, vista: 420, olvida: 800, correa: 760, grito: 'gemido',
      golpe: { alcance: 58, cada: 1500 }, poder: [4400, 6600], ancho: 30, alto: 14, cabeza: 108,
      vuelveMs: 5 * 60 * 1000, color: 0xb9d27a
    },
    zombi_podrido: {
      arte: 'zombi_c', molde: 'lobo', humanoide: true, nombre: 'Rotting Ghoul', vida: 140, escala: 2, sombra: 1.2,
      vel: 28, velCaza: 66, vista: 400, olvida: 780, correa: 740, grito: 'gemido',
      golpe: { alcance: 58, cada: 1600 }, poder: [4800, 7000], ancho: 30, alto: 14, cabeza: 108,
      vuelveMs: 6 * 60 * 1000, color: 0xa7c46a
    },
    esqueleto_cementerio: {
      arte: 'esqueleto', molde: 'arana', humanoide: true, nombre: 'Bone Archer', vida: 100, escala: 2, sombra: 1.2,
      vel: 40, velCaza: 86, vista: 460, olvida: 820, correa: 760, distancia: 220,
      tex: { espina: 'gfm_hueso', savia: 'gfm_veneno' }, freno: 'Cursed ichor — you are slowed!',
      golpe: { alcance: 54, cada: 1400 }, poder: [3200, 4800], ancho: 30, alto: 14, cabeza: 108,
      vuelveMs: 5 * 60 * 1000, color: 0xd8ffb0
    },
    // (2026-10-19) "Quiero que en el cementerio existan esqueletos": el de
    // arriba ya es hueso de verdad y este es el que va a por ti con la espada.
    esqueleto_guerrero: {
      arte: 'esqueleto_guerrero', molde: 'lobo', humanoide: true, nombre: 'Skeleton Warrior', vida: 130, escala: 2, sombra: 1.2,
      vel: 34, velCaza: 82, vista: 440, olvida: 800, correa: 760,
      golpe: { alcance: 62, cada: 1300 }, poder: [4200, 6200], ancho: 30, alto: 14, cabeza: 108,
      vuelveMs: 5 * 60 * 1000, color: 0xe6dcc2
    },
    espectro_cementerio: {
      arte: 'espectro', molde: 'brujo', humanoide: true, flota: true, nombre: 'Restless Spirit', vida: 130, escala: 2, sombra: 1.1,
      vel: 44, velCaza: 82, vista: 480, olvida: 840, correa: 760, distancia: 230,
      tex: { rayo: 'gfm_rayo_alma' }, golpe: null, poder: [3600, 5200], ancho: 30, alto: 14, cabeza: 120,
      vuelveMs: 7 * 60 * 1000, color: 0x7dffb8
    },
    golem_cripta: {
      arte: 'golem_cripta', molde: 'golem', nombre: 'Crypt Golem', vida: 240, escala: 2, sombra: 1.9,
      vel: 38, velCaza: 62, vista: 380, olvida: 760, correa: 700,
      golpe: { alcance: 76, cada: 2000 }, poder: [5200, 7600], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 8 * 60 * 1000, color: 0x7dffb8
    },
    nigromante_cementerio: {
      arte: 'nigromante', molde: 'brujo', humanoide: true, flota: true, nombre: 'The Necromancer', vida: 380, escala: 2, sombra: 1.3,
      vel: 40, velCaza: 78, vista: 540, olvida: 900, correa: 820, distancia: 250,
      tex: { rayo: 'gfm_rayo_alma' }, golpe: null, poder: [2800, 4200], ancho: 34, alto: 14, cabeza: 140,
      vuelveMs: 20 * 60 * 1000, color: 0x7dffb8
    },

    // ── EL DESIERTO ABRASADOR ──
    escorpion_desierto: {
      arte: 'escorpion', molde: 'arana', nombre: 'Dune Scorpion', vida: 120, escala: 2, sombra: 1.6,
      vel: 56, velCaza: 104, vista: 420, olvida: 780, correa: 720, distancia: 190,
      tex: { savia: 'gfm_veneno' }, freno: 'Scorpion venom — you are slowed!',
      golpe: { alcance: 58, cada: 1400 }, poder: [3200, 4800], ancho: 46, alto: 14, cabeza: 70,
      vuelveMs: 5 * 60 * 1000, color: 0xb6ff5a
    },
    momia_desierto: {
      arte: 'momia', molde: 'lobo', humanoide: true, nombre: 'Wrapped Mummy', vida: 150, escala: 2, sombra: 1.2,
      vel: 30, velCaza: 70, vista: 420, olvida: 800, correa: 760, grito: 'gemido',
      golpe: { alcance: 58, cada: 1500 }, poder: [4400, 6400], ancho: 30, alto: 14, cabeza: 108,
      vuelveMs: 6 * 60 * 1000, color: 0xffd04a
    },
    golem_arena: {
      arte: 'golem_arena', molde: 'golem', nombre: 'Sandstone Golem', vida: 220, escala: 2, sombra: 1.9,
      vel: 40, velCaza: 64, vista: 380, olvida: 760, correa: 720,
      tex: { roca: 'gfm_roca_arena' },
      golpe: { alcance: 76, cada: 1900 }, poder: [5200, 7800], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 7 * 60 * 1000, color: 0xff9a3a
    },

    // ── LA TUNDRA HELADA ──
    lobo_escarcha: {
      arte: 'lobo_escarcha', molde: 'lobo', nombre: 'Frost Wolf', vida: 100, escala: 2, sombra: 1.4,
      vel: 60, velCaza: 154, vista: 440, olvida: 820, correa: 820,
      golpe: { alcance: 60, cada: 1300 }, poder: [3800, 5800], ancho: 40, alto: 14, cabeza: 76,
      vuelveMs: 4 * 60 * 1000, color: 0x8ce9ff
    },
    golem_hielo: {
      arte: 'golem_hielo', molde: 'golem', nombre: 'Ice Golem', vida: 230, escala: 2, sombra: 1.9,
      vel: 38, velCaza: 62, vista: 380, olvida: 760, correa: 720,
      tex: { roca: 'gfm_roca_hielo' },
      golpe: { alcance: 76, cada: 1900 }, poder: [5200, 7800], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 7 * 60 * 1000, color: 0xc6f6ff
    },
    bruja_ventisca: {
      arte: 'brujo', molde: 'brujo', humanoide: true, flota: true, nombre: 'Blizzard Witch', vida: 190, escala: 2, sombra: 1.2,
      vel: 42, velCaza: 80, vista: 500, olvida: 860, correa: 760, distancia: 240,
      golpe: null, poder: [3400, 5200], ancho: 34, alto: 14, cabeza: 152,
      vuelveMs: 12 * 60 * 1000, color: 0x8ce9ff
    },


    // ── EL GLACIAR ROTO (2026-10-25, nivel 8) ──
    yeti_glaciar: {
      arte: 'yeti', molde: 'golem', nombre: 'Glacier Yeti', vida: 260, escala: 2, sombra: 1.9,
      vel: 40, velCaza: 70, vista: 400, olvida: 780, correa: 740,
      tex: { roca: 'gfm_bola_nieve' }, poderes: ['bola_nieve'],
      golpe: { alcance: 76, cada: 1800 }, poder: [4600, 7000], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 7 * 60 * 1000, color: 0xc6f6ff
    },
    oso_polar: {
      arte: 'oso_polar', molde: 'lobo', nombre: 'Frost Bear', vida: 170, escala: 2, sombra: 1.7,
      vel: 46, velCaza: 120, vista: 400, olvida: 800, correa: 780, poderes: ['rugido_helado'],
      freno: 'Frozen roar — you are slowed!',
      golpe: { alcance: 68, cada: 1500 }, poder: [4200, 6400], ancho: 52, alto: 16, cabeza: 90,
      vuelveMs: 5 * 60 * 1000, color: 0xe6f6ff
    },
    espectro_hielo: {
      arte: 'espectro_hielo', molde: 'brujo', humanoide: true, flota: true, nombre: 'Frost Wraith', vida: 200, escala: 2, sombra: 1.1,
      vel: 44, velCaza: 82, vista: 500, olvida: 860, correa: 780, distancia: 240,
      tex: { rayo: 'gfm_rayo_hielo' }, poderes: ['prision'], freno: 'Frozen in ice — you are slowed!',
      golpe: null, poder: [3400, 5200], ancho: 30, alto: 14, cabeza: 120,
      vuelveMs: 9 * 60 * 1000, color: 0x8ce9ff
    },

    // ── LAS CAVERNAS DE CRISTAL (nivel 9) ──
    murcielago_gigante: {
      arte: 'murcielago', molde: 'lobo', flota: true, nombre: 'Giant Cave Bat', vida: 150, escala: 2, sombra: 1.3,
      vel: 64, velCaza: 150, vista: 460, olvida: 840, correa: 820, grito: 'chillido', poderes: ['chillido'],
      freno: 'Deafening screech — you are slowed!',
      golpe: { alcance: 60, cada: 1200 }, poder: [3600, 5400], ancho: 40, alto: 14, cabeza: 100,
      vuelveMs: 5 * 60 * 1000, color: 0xff6a8a
    },
    troll_cueva: {
      arte: 'troll_cueva', molde: 'golem', humanoide: true, nombre: 'Cave Troll', vida: 280, escala: 2, sombra: 1.3,
      vel: 36, velCaza: 72, vista: 400, olvida: 780, correa: 740,
      tex: { roca: 'gfm_roca_cueva' }, poderes: ['derrumbe'],
      golpe: { alcance: 64, cada: 1700 }, poder: [4600, 7000], ancho: 32, alto: 14, cabeza: 116,
      vuelveMs: 8 * 60 * 1000, color: 0xffb04a
    },
    golem_cristal: {
      arte: 'golem_cristal', molde: 'arana', nombre: 'Crystal Golem', vida: 300, escala: 2, sombra: 1.9,
      vel: 34, velCaza: 60, vista: 420, olvida: 800, correa: 760, distancia: 220,
      tex: { espina: 'gfm_esquirla', savia: 'gfm_charco_cristal' }, poderes: ['emerger'], freno: 'Crystal shards — you are slowed!',
      golpe: { alcance: 76, cada: 2000 }, poder: [4200, 6400], ancho: 56, alto: 20, cabeza: 132,
      vuelveMs: 9 * 60 * 1000, color: 0xc79cff
    },

    // ── LA PRADERA EN FLOR (nivel 10) ──
    jabali_espinoso: {
      arte: 'jabali', molde: 'lobo', nombre: 'Thornback Boar', vida: 190, escala: 2, sombra: 1.5,
      vel: 56, velCaza: 150, vista: 440, olvida: 820, correa: 820, poderes: ['espinos'],
      tex: { espina: 'gfm_espino' },
      golpe: { alcance: 62, cada: 1300 }, poder: [3600, 5600], ancho: 44, alto: 14, cabeza: 80,
      vuelveMs: 5 * 60 * 1000, color: 0x9ad45a
    },
    driada_salvaje: {
      arte: 'driada', molde: 'brujo', humanoide: true, nombre: 'Wild Dryad', vida: 230, escala: 2, sombra: 1.2,
      vel: 44, velCaza: 82, vista: 500, olvida: 860, correa: 780, distancia: 240,
      tex: { rayo: 'gfm_rayo_hoja' }, poderes: ['raices', 'petalos'], freno: 'Tangled in roots — you are slowed!',
      golpe: null, poder: [3200, 5000], ancho: 30, alto: 14, cabeza: 116,
      vuelveMs: 9 * 60 * 1000, color: 0x8fd45a
    },
    golem_musgo: {
      arte: 'golem_musgo', molde: 'golem', nombre: 'Bramble Golem', vida: 320, escala: 2, sombra: 1.9,
      vel: 36, velCaza: 62, vista: 400, olvida: 780, correa: 740,
      tex: { roca: 'gfm_roca_musgo' }, poderes: ['raices'], freno: 'Tangled in brambles — you are slowed!',
      golpe: { alcance: 76, cada: 1900 }, poder: [4600, 7000], ancho: 56, alto: 20, cabeza: 128,
      vuelveMs: 9 * 60 * 1000, color: 0x8fd45a
    },

    // ── LOS JEFES (2026-10-20): uno por mapa (gf-jefes.js pone su guarida,
    //    su aura, su barra y sus poderes; el arte, tools/generar-jefes.py). ──
    jefe_golem: {
      arte: 'jefe_golem', molde: 'golem', jefe: true, nombre: 'The Mossback Titan', vida: 2600, escala: 2, sombra: 3.4,
      vel: 30, velCaza: 56, vista: 520, olvida: 1000, correa: 1100,
      golpe: { alcance: 120, cada: 1800 }, poder: [2600, 4000], ancho: 90, alto: 28, cabeza: 300,
      vuelveMs: 30 * 60 * 1000, color: 0x5fe0a0
    },
    jefe_arana: {
      arte: 'jefe_arana', molde: 'arana', jefe: true, nombre: 'The Bone Widow', vida: 2400, escala: 2, sombra: 3.2,
      vel: 44, velCaza: 86, vista: 520, olvida: 1000, correa: 1100, distancia: 200,
      tex: { espina: 'gfm_hueso', savia: 'gfm_veneno' }, freno: 'Soul venom — you are slowed!',
      golpe: { alcance: 96, cada: 1500 }, poder: [2400, 3800], ancho: 80, alto: 24, cabeza: 200,
      vuelveMs: 30 * 60 * 1000, color: 0x7dffb0
    },
    jefe_escorpion: {
      arte: 'jefe_escorpion', molde: 'arana', jefe: true, nombre: 'The Sand Emperor', vida: 2500, escala: 2, sombra: 3.2,
      vel: 46, velCaza: 90, vista: 520, olvida: 1000, correa: 1100, distancia: 190,
      tex: { savia: 'gfm_veneno' }, freno: 'Imperial venom — you are slowed!',
      golpe: { alcance: 100, cada: 1400 }, poder: [2400, 3800], ancho: 84, alto: 24, cabeza: 190,
      vuelveMs: 30 * 60 * 1000, color: 0xe6b85a
    },
    jefe_lobo: {
      arte: 'jefe_lobo', molde: 'lobo', jefe: true, nombre: 'Frostfang, the Pack King', vida: 2400, escala: 2, sombra: 3.0,
      vel: 60, velCaza: 160, vista: 560, olvida: 1050, correa: 1150,
      golpe: { alcance: 96, cada: 1200 }, poder: [2600, 4000], ancho: 76, alto: 22, cabeza: 190,
      vuelveMs: 30 * 60 * 1000, color: 0x8ce9ff
    },
    // (2026-10-25) Los de nivel 8, 9 y 10 (gf-jefes.js: GlaciarScene,
    // CavernaScene, PraderaScene). Usan sus poderes de jefe y, a ratos, los
    // nuevos de su mapa (`poderes`).
    jefe_yeti: {
      arte: 'jefe_yeti', molde: 'golem', jefe: true, nombre: 'The Glacier King', vida: 3000, escala: 2, sombra: 3.4,
      vel: 34, velCaza: 60, vista: 540, olvida: 1000, correa: 1100, tex: { roca: 'gfm_bola_nieve' }, poderes: ['bola_nieve'],
      golpe: { alcance: 120, cada: 1700 }, poder: [2400, 3800], ancho: 90, alto: 28, cabeza: 300,
      vuelveMs: 30 * 60 * 1000, color: 0xb8e4ff
    },
    jefe_murcielago: {
      arte: 'jefe_murcielago', molde: 'lobo', jefe: true, flota: true, nombre: 'Nightwing, the Cave Matriarch', vida: 2800, escala: 2, sombra: 3.0,
      vel: 60, velCaza: 150, vista: 560, olvida: 1050, correa: 1150, grito: 'chillido', poderes: ['chillido'],
      freno: 'Deafening screech — you are slowed!',
      golpe: { alcance: 96, cada: 1200 }, poder: [2400, 3800], ancho: 80, alto: 24, cabeza: 220,
      vuelveMs: 30 * 60 * 1000, color: 0xb48cff
    },
    jefe_ent: {
      arte: 'jefe_ent', molde: 'golem', jefe: true, nombre: 'Oakheart, the Elder Grove', vida: 3200, escala: 2, sombra: 3.4,
      vel: 28, velCaza: 52, vista: 540, olvida: 1000, correa: 1100, tex: { roca: 'gfm_roca_musgo' }, poderes: ['raices', 'petalos'],
      freno: 'Tangled in roots — you are slowed!',
      golpe: { alcance: 120, cada: 1800 }, poder: [2400, 3800], ancho: 90, alto: 28, cabeza: 320,
      vuelveMs: 30 * 60 * 1000, color: 0x8fd45a
    }
  };
  /* (2026-10-20) Lo que gf-jefes.js necesita de aquí para sus poderes. */
  function apiJefe() {
    return { golpearJugador: golpearJugador, efimero: efimero, soltarEfimero: soltarEfimero, animar: animar,
             orientar: orientar, cercaDeMi: cercaDeMi, libre: libre };
  }
  // Los proyectiles de siempre; cada especie puede cambiar los suyos (`tex`).
  var TEX_BASE = { roca: 'gfm_roca', espina: 'gfm_espina', savia: 'gfm_savia', rayo: 'gfm_rayo' };
  function tex(m, que) { return (m.def.tex && m.def.tex[que]) || TEX_BASE[que]; }
  /** Hacia dónde mira (para el golpe de cerca): las bestias por su volteo; los
      humanoides por su dirección. */
  function frente(m) {
    if (!m.def.humanoide) return { x: m.spr.flipX ? -1 : 1, y: 0 };
    return { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -0.6 }, down: { x: 0, y: 0.6 } }[m.dir] || { x: 1, y: 0 };
  }
  var LEJOS = 1300;                 // más lejos que esto, ni piensa ni se dibuja
  var DIR_ES = { right: 'derecha', left: 'izquierda', up: 'arriba', down: 'abajo' };
  // Lo que se puede soltar en el suelo: la MISMA lista que el servidor
  // (SUELO_SOLTABLES). (2026-10-27) Ya también lo crafteado y lo de construcción
  // (cofres, espadas, parcelas…), con su nivel para recogerlo; las herramientas
  // que se gastan (hachas, picos, regadera, tijeras), no.
  var SOLTABLES = {};
  [...Object.keys(window.GFPlantCatalog?.items || {}), 'Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4',
   'mineral_piedra', 'mineral_cobre', 'mineral_hierro', 'carbon',
   'mineral_piedra_cobre', 'mineral_piedra_hierro', 'mineral_carbon',
   'palo', 'tablon_de_madera', 'madera_pinos', 'madera_con_hojas', 'madera_seca',
   'zanahoria_buena', 'zanahoria_corta', 'zanahoria_mala', 'tomate_buena', 'tomate_corta', 'tomate_mala',
   'trigo_buena', 'trigo_corta', 'trigo_mala', 'calabaza_buena', 'calabaza_corta', 'calabaza_mala',
   'fresa_buena', 'fresa_corta', 'fresa_mala',
   'pes1', 'pes2', 'pes3', 'pes4', 'pes5', 'pes6', 'pes7', 'pes8',
   'pes9', 'pes10', 'pes11', 'pes12', 'pes13', 'pes14',
   'pocion_mascota', 'pocion_mascota_grande', 'elixir_revivir',
   'cofre1', 'cofre2', 'cofre3', 'cofre4', 'basura', 'espantapajaros', 'parcela',
   'espada_madera', 'espada_cobre', 'espada_hierro', 'arco', 'baston_mago', 'cana_pescar',
   'pocion_vida', 'pocion_antidoto', 'balde_vacio'].forEach(function (k) { SOLTABLES[k] = true; });

  // ─────────────────────────────────────────────────────── UTILIDADES
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  /* ¿Mi jugador está muerto (fantasma o con la vida a 0)? Entonces ni le
     pegan ni pega (2026-10-11: "me golpean estando en fantasma"). */
  function fantasma() {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto();
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost);
    } catch (e2) { return false; }
  }
  function pies(scene) { var p = scene.player; return { x: p.x, y: p.y + 45 }; }
  function velJugador(scene) {
    try { return window.GFMinaSerpiente._interno.velocidadJugador(scene); } catch (e) { return { x: 0, y: 0 }; }
  }
  /** ¿Caben los pies de algo de ancho x alto con la base en (x, y)? */
  function libre(scene, x, y, ancho, alto) {
    if (!scene.map) return false;
    if (x < 24 || y < 24 || x > scene.map.widthInPixels - 24 || y > scene.map.heightInPixels - 8) return false;
    if (typeof scene._chocaConEscenario !== 'function') return true;
    return !scene._chocaConEscenario(x - ancho / 2, y - alto, ancho, alto);
  }
  function libreM(scene, m, x, y) { return libre(scene, x, y, m.def.ancho, m.def.alto); }
  /** Lo que tarda en volver a atacar según el nivel: con nivel bajo, más. */
  function ritmo(scene) {
    var nivel = Number(scene.nivel) || 1;
    return Math.max(1, Math.min(1.3, 1.32 - nivel * 0.016));
  }
  function entre(a, b) { return a + Math.random() * (b - a); }

  // ─────────────────────────────────────────────────────── SONIDOS (WebAudio)
  /* Cortos y sintetizados: sin archivos. Respetan el silencio y el volumen. */
  function sonar(scene, tipo) {
    try {
      var snd = scene.sound, ctx = snd && snd.context;
      if (!ctx || snd.mute || typeof ctx.createOscillator !== 'function') return;
      var vol = (scene.audioState && Number.isFinite(scene.audioState.sfxVolumeApplied)) ? scene.audioState.sfxVolumeApplied : 0.5;
      vol *= Number.isFinite(snd.volume) ? snd.volume : 1;
      if (vol <= 0.001) return;
      var t0 = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      var dur = 1;
      if (tipo === 'aullido') {
        dur = 1.6; o.type = 'sine';
        o.frequency.setValueAtTime(320, t0); o.frequency.linearRampToValueAtTime(620, t0 + 0.5); o.frequency.linearRampToValueAtTime(410, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.18 * vol, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else if (tipo === 'siseo') {
        dur = 0.5; o.type = 'sawtooth';
        o.frequency.setValueAtTime(2400, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.05 * vol, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else if (tipo === 'gemido') {
        // (2026-10-18) El gemido de los zombis y las momias: grave y temblón.
        dur = 1.4; o.type = 'sawtooth';
        o.frequency.setValueAtTime(150, t0); o.frequency.linearRampToValueAtTime(118, t0 + 0.7); o.frequency.linearRampToValueAtTime(92, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.09 * vol, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else if (tipo === 'chillido') {
        // (2026-10-25) El chillido del murciélago: agudo, que sube y baja.
        dur = 0.7; o.type = 'sawtooth';
        o.frequency.setValueAtTime(1800, t0); o.frequency.linearRampToValueAtTime(3200, t0 + 0.2); o.frequency.linearRampToValueAtTime(1400, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.06 * vol, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else if (tipo === 'tormenta') {
        dur = 1.1; o.type = 'triangle';
        o.frequency.setValueAtTime(880, t0); o.frequency.exponentialRampToValueAtTime(220, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.12 * vol, t0 + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else {                                             // rugido de piedra
        dur = 1.2; o.type = 'square';
        o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + dur);
        g.gain.exponentialRampToValueAtTime(0.14 * vol, t0 + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      }
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tipo === 'siseo' || tipo === 'chillido' ? 3600 : 1400;
      o.connect(lp); lp.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
      o.onended = function () { try { o.disconnect(); lp.disconnect(); g.disconnect(); } catch (e) {} };
    } catch (e) { /* sin sonido, sin drama */ }
  }

  // ─────────────────────────────────────────────────────── TEXTURAS DE LUZ
  /* Solo sombra, onda y polvo (luz y aire). Los monstruos son PNG. */
  function texturasSueltas(scene) {
    if (!scene.textures.exists('gfsv_sombra')) {
      var s = scene.textures.createCanvas('gfsv_sombra', 48, 16), x = s.getContext();
      x.save(); x.scale(1, 16 / 48);
      var g = x.createRadialGradient(24, 24, 1, 24, 24, 24);
      g.addColorStop(0, 'rgba(10,20,12,0.5)'); g.addColorStop(0.7, 'rgba(10,20,12,0.25)'); g.addColorStop(1, 'rgba(10,20,12,0)');
      x.fillStyle = g; x.beginPath(); x.arc(24, 24, 24, 0, Math.PI * 2); x.fill(); x.restore();
      s.refresh();
    }
    if (!scene.textures.exists('gfsv_onda')) {
      var o = scene.textures.createCanvas('gfsv_onda', 128, 128), y = o.getContext();
      var g2 = y.createRadialGradient(64, 64, 40, 64, 64, 64);
      g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.7, 'rgba(230,220,190,0.55)'); g2.addColorStop(1, 'rgba(230,220,190,0)');
      y.fillStyle = g2; y.fillRect(0, 0, 128, 128);
      o.refresh();
    }
    if (!scene.textures.exists('gfsv_polvo')) {
      var p = scene.textures.createCanvas('gfsv_polvo', 64, 64), z = p.getContext();
      var g3 = z.createRadialGradient(32, 32, 2, 32, 32, 32);
      g3.addColorStop(0, 'rgba(160,145,120,0.55)'); g3.addColorStop(1, 'rgba(160,145,120,0)');
      z.fillStyle = g3; z.fillRect(0, 0, 64, 64);
      p.refresh();
    }
  }

  /** Un objeto de efecto que se borra solo; si la escena se apaga antes, también. */
  function efimero(st, obj) { st.efimeros.push(obj); return obj; }
  function soltarEfimero(st, obj) {
    var i = st.efimeros.indexOf(obj);
    if (i >= 0) st.efimeros.splice(i, 1);
    try { if (obj && obj.scene) obj.destroy(); } catch (e) {}
  }
  function onda(st, x, y, escala) {
    var scene = st.scene;
    var o = efimero(st, scene.add.image(x, y, 'gfsv_onda').setDepth(y + 1).setScale(0.4).setAlpha(0.95));
    scene.tweens.add({ targets: o, scale: 3 * (escala || 1), alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: function () { soltarEfimero(st, o); } });
    var p = efimero(st, scene.add.image(x, y - 6, 'gfsv_polvo').setDepth(y + 2).setScale(1.1 * (escala || 1)).setAlpha(0.9));
    scene.tweens.add({ targets: p, scale: 3 * (escala || 1), alpha: 0, y: y - 28, duration: 850, ease: 'Sine.easeOut', onComplete: function () { soltarEfimero(st, p); } });
  }
  /** Aviso en el suelo: una elipse con borde que se llena hasta el golpe. */
  function marca(st, x, y, rx, ry, color, ms) {
    var scene = st.scene;
    var g = efimero(st, scene.add.ellipse(x, y, rx * 2, ry * 2, color, 0.1).setStrokeStyle(2, color, 0.85).setDepth(3));
    var dentro = efimero(st, scene.add.ellipse(x, y, rx * 2, ry * 2, color, 0.22).setScale(0.05).setDepth(3));
    scene.tweens.add({ targets: dentro, scale: 1, duration: ms, onComplete: function () { soltarEfimero(st, dentro); soltarEfimero(st, g); } });
  }

  // ─────────────────────────────────────────────────────── EL JUGADOR
  /**
   * Empuja al jugador por pasos de 3 px y se para ANTES de una pared: nunca
   * queda dentro de una colisión (ni fuera del mapa). Mismo rectángulo de
   * pies que usa SalvajeScene para chocar.
   */
  function empujarJugador(scene, ux, uy, dist) {
    var p = scene.player;
    if (!p || !p.scene || !(dist > 0)) return;
    var L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    var W = scene.map ? scene.map.widthInPixels : 1e9, H = scene.map ? scene.map.heightInPixels : 1e9;
    for (var k = 0; k < dist; k += 3) {
      var nx = p.x + ux * 3, ny = p.y + uy * 3;
      if (nx < 24 || ny < 24 || nx > W - 24 || ny > H - 56) break;
      if (typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(nx - 15, ny + 25, 30, 26)) break;
      p.x = nx; p.y = ny;
    }
    try { if (p.body && p.body.reset) p.body.reset(p.x, p.y); } catch (e) {}
    scene.previousPosition = { x: p.x, y: p.y };
  }

  function adoptarVitales(scene, s) {
    if (!s || typeof s.vida !== 'number') return;
    try {
      if (window.GFCharacterSkills && window.GFCharacterSkills.applyStats) window.GFCharacterSkills.applyStats(scene, s);
      else if (typeof scene._adoptarVitalesDelServidor === 'function') scene._adoptarVitalesDelServidor(s);
    } catch (e) {}
    try { if (window.GFMascota.parpadearDano) window.GFMascota.parpadearDano(scene); } catch (e) {}
    if (s.vida <= 0 && window.GFMascota && window.GFMascota.declararMuerte) window.GFMascota.declararMuerte();
  }

  /** Un monstruo te da: el servidor decide cuánto (y frena el spam igual). */
  function golpearJugador(st, motivo, desdeX, desdeY, empuje) {
    var scene = st.scene;
    if (!scene.playerName || fantasma()) return;
    var ahora = Date.now();
    if (ahora - st.ultimoGolpe < 700) return;
    st.ultimoGolpe = ahora;
    var pj = pies(scene);
    empujarJugador(scene, pj.x - desdeX, pj.y - desdeY, empuje || 24);
    var p = scene.player;
    if (p && p.scene) {
      p.setTintFill(0xff8a8a);
      scene.time.delayedCall(110, function () { if (p.scene) p.clearTint(); });
    }
    api('/api/stats/' + encodeURIComponent(scene.playerName) + '/consume', { reason: motivo }).then(function (r) {
      if (!st.vivo || !r || !r.ok || !r.datos) return;
      adoptarVitales(scene, r.datos.stats);
      if (window.GFEspada && window.GFEspada.mostrarDano && r.datos.spent && r.datos.spent.vida) {
        window.GFEspada.mostrarDano(scene, p.x, p.y - 64, r.datos.spent.vida);
      }
    }).catch(function () {});
  }

  // ─────────────────────────────────────────────────────── LOS MONSTRUOS
  /*
   * COMPARTIDOS ENTRE JUGADORES (2026-10-11, gf-mobs-red.js). En cada sala
   * piensa por ellos UN navegador, el del anfitrión: elige a quién perseguir
   * (el jugador más cercano, sea él o cualquiera de los demás) y cuándo
   * atacar, y lo anuncia. Los demás los dibujan donde dice su foto. Cada
   * ataque se ejecuta en TODOS los navegadores (el dibujo y el aviso) y cada
   * uno mira si le alcanza a SU jugador. Un espadazo de otro le llega al
   * anfitrión, que resta la vida y dice quién lo mató.
   */
  var DIRS = ['down', 'up', 'left', 'right'];
  var ACCIONES = ['quieto', 'camina', 'ataque'];

  function crear(st, punto, tipo, n, id) {
    var scene = st.scene, def = ESPECIES[tipo], A = window.GFMonstruosArte;
    if (!def || !A || !scene.textures.exists(A.clave(def.arte))) return null;
    var spr = scene.add.sprite(punto.x, punto.y, A.clave(def.arte), A.fotograma(def.arte, def.humanoide ? 'down' : 'quieto'))
      .setOrigin(0.5, 1).setScale(def.escala);
    // Las bestias traen su punto de apoyo en el fotograma (de frente, las
    // patas de delante caen más abajo que el centro).
    if (!def.humanoide) spr.setOriginFromFrame();
    spr.setData('optimized', true); window.GFGraphics?.registrar?.(spr.scene,spr);
    var sombra = scene.add.image(punto.x, punto.y, 'gfsv_sombra').setScale(def.sombra).setAlpha(0.85).setDepth(2.5);
    var m = {
      id: id, tipo: tipo, def: def, n: n, casa: { x: punto.x, y: punto.y }, x: punto.x, y: punto.y,
      vida: def.vida, max: def.vida, vivo: true, estado: 'paseo', destino: null, ideaEn: 0,
      golpeEn: 0, poderEn: scene.time.now + entre(1500, 3500), aturdidoHasta: 0, heridoEn: 0,
      muertoHasta: 0, dir: 'down', anim: null, accionNombre: 'quieto', accion: null, rugio: false, prisaHasta: 0,
      spr: spr, sombra: sombra, barra: null, nombre: null, fase: Math.random() * 6, comprobado: 0,
      ultimoPoder: null, rutaEn: 0, ruta: null, blanco: null,
      // Lo que dice la foto del anfitrión (solo se usa siendo invitado).
      objX: punto.x, objY: punto.y, accionRed: 'quieto'
    };
    // Si su punto cae en algo sólido, se busca el hueco libre más cercano.
    desatascar(st, m);
    m.casa = { x: m.x, y: m.y };
    m.objX = m.x; m.objY = m.y;
    animar(m, 'quieto');
    return m;
  }

  /** Cambia la animación si hace falta. Bestias: acción (y su vista de frente
      o de espaldas al ir hacia abajo o arriba); espectro: dirección. */
  function animar(m, accion) {
    var A = window.GFMonstruosArte, spr = m.spr;
    if (!spr || !spr.scene) return;
    m.accionNombre = accion;
    var key = m.def.humanoide ? A.anim(m.def.arte, m.dir) : A.anim(m.def.arte, accion);
    if (!m.def.humanoide && (m.dir === 'down' || m.dir === 'up')) {
      var vista = A.anim(m.def.arte, accion + (m.dir === 'down' ? '_abajo' : '_arriba'));
      if (spr.scene.anims.exists(vista)) key = vista;
    }
    if (m.anim === key && spr.anims.isPlaying) return;
    if (spr.scene.anims.exists(key)) { spr.play(key, true); m.anim = key; }
  }

  function orientar(m, dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    if (m.def.humanoide) {
      var d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (d !== m.dir) { m.dir = d; m.anim = null; }
    } else {
      if (Math.abs(dx) > 0.5) m.spr.setFlipX(dx < 0);          // los dibujos miran a la derecha
      // La vista: de perfil, o de frente/espaldas si va claramente en vertical.
      var dv = Math.abs(dy) > Math.abs(dx) * 1.3 ? (dy > 0 ? 'down' : 'up') : (dx < 0 ? 'left' : 'right');
      if (dv !== m.dir) { m.dir = dv; m.anim = null; }
    }
  }

  /** Mueve por ejes (si un eje choca, el otro sigue: resbala por la pared). */
  function mover(st, m, vx, vy, seg) {
    var scene = st.scene;
    var nx = m.x + vx * seg, ny = m.y + vy * seg, movido = false;
    if (libreM(scene, m, nx, m.y)) { m.x = nx; movido = true; }
    if (libreM(scene, m, m.x, ny)) { m.y = ny; movido = true; }
    orientar(m, vx, vy);
    return movido;
  }

  /** Empujón por pasos de 4 px: se para antes de la pared, nunca dentro. */
  function empujar(st, m, ux, uy, dist) {
    var L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    for (var k = 0; k < dist; k += 4) {
      var nx = m.x + ux * 4, ny = m.y + uy * 4;
      if (!libreM(st.scene, m, nx, ny)) break;
      m.x = nx; m.y = ny;
    }
  }

  /** Si por lo que sea quedó dentro de algo sólido, al hueco libre más cercano. */
  function desatascar(st, m) {
    var scene = st.scene;
    if (libreM(scene, m, m.x, m.y)) return true;
    for (var r = 8; r <= 160; r += 8) {
      for (var k = 0; k < 16; k++) {
        var a = k / 16 * Math.PI * 2;
        var x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
        if (libreM(scene, m, x, y)) { m.x = x; m.y = y; return true; }
      }
    }
    if (libreM(scene, m, m.casa.x, m.casa.y)) { m.x = m.casa.x; m.y = m.casa.y; return true; }
    return false;
  }

  /* Hacia (tx, ty) rodeando paredes (gf-rutas.js); de cerca, derecho. */
  function hacia(st, m, tx, ty, vel, seg) {
    var ahora = st.scene.time.now;
    var obj = { x: tx, y: ty };
    if (Math.hypot(tx - m.x, ty - m.y) > 60 && window.GFRutas) {
      if (!(ahora <= m.rutaEn)) {
        m.rutaEn = ahora + 700;
        m.ruta = window.GFRutas.siguiente(st.scene, { x: m.x, y: m.y }, { x: tx, y: ty }, {
          clave: 'salvaje_' + m.def.arte,
          libre: function (x, y) { return libreM(st.scene, m, x, y); }
        });
      }
      if (m.ruta) {
        if (Math.hypot(m.ruta.x - m.x, m.ruta.y - m.y) <= 8) m.rutaEn = 0;
        else obj = m.ruta;
      }
    }
    var dx = obj.x - m.x, dy = obj.y - m.y, d = Math.hypot(dx, dy) || 1;
    var x0 = m.x, y0 = m.y;
    var ok = mover(st, m, dx / d * vel, dy / d * vel, seg);
    if (Math.abs(m.x - x0) + Math.abs(m.y - y0) < 0.01 && m.ruta) { m.rutaEn = Math.min(m.rutaEn, ahora + 250); m.ruta = null; }
    return ok;
  }

  function colocar(st, m, t) {
    // Flotan los espectros y las brujas; los zombis, esqueletos y momias andan.
    var alzado = m.def.flota ? 8 + Math.sin(t / 420 + m.fase) * 5 : 0;
    m.spr.setPosition(m.x, m.y - alzado).setDepth(m.y);
    m.sombra.setPosition(m.x, m.y - 2).setDepth(m.y - 1).setScale(m.def.sombra * (m.def.flota ? 0.9 - alzado * 0.01 : 1));
  }

  function pintarBarra(st, m) {
    var scene = st.scene;
    var ver = m.vivo && (m.estado === 'caza' || scene.time.now - m.heridoEn < 3000);
    if (!ver) {
      if (m.barra) m.barra.setVisible(false);
      if (m.nombre) m.nombre.setVisible(false);
      return;
    }
    if (!m.barra) m.barra = scene.add.graphics();
    if (!m.nombre) {
      m.nombre = scene.add.text(0, 0, m.def.nombre, {
        fontFamily: '"PressStart2P"', fontSize: '7px', color: '#ffe9c9', resolution: 4, stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5, 1);
    }
    var w = m.def.jefe ? 120 : 46, x = m.x - w / 2, y = m.y - m.def.cabeza - 8;
    m.barra.clear().setVisible(true).setDepth(m.y + 2);
    m.barra.fillStyle(0x000000, 0.65).fillRect(x - 1, y - 1, w + 2, m.def.jefe ? 8 : 6);
    m.barra.fillStyle(m.def.jefe ? 0xffc84a : 0xe2574c, 1).fillRect(x, y, w * Math.max(0, m.vida / m.max), m.def.jefe ? 6 : 4);
    if (m.def.jefe && m.nombre.style && m.nombre.style.color !== '#ffd76a') m.nombre.setColor('#ffd76a');
    m.nombre.setVisible(true).setPosition(m.x, y - 3).setDepth(m.y + 2);
  }

  /** ¿Está cerca de MI jugador? (los temblores de cámara y los gritos, solo cerca) */
  function cercaDeMi(st, x, y, r) {
    var p = st.scene.player;
    return !!(p && Math.hypot(p.x - x, p.y + 45 - y) < (r || 700));
  }

  /** El blanco de un monstruo (anfitrión): sus pies y hacia dónde va. */
  function velDe(st, b) {
    if (!b) return { x: 0, y: 0 };
    if (b.local) return velJugador(st.scene);
    return { x: 0, y: 0 };
  }

  // ── LOS PODERES ──────────────────────────────────────────────────────────
  /* Cada poder es DOS cosas: lo que decide el anfitrión (a dónde, con qué
     ángulo: necesita al blanco) y lo que se ejecuta en TODOS los navegadores
     (el dibujo y la comprobación de si le da a MI jugador). El anfitrión
     ejecuta y lo anuncia con los mismos números. */

  /** Golpe de cerca (puñetazo, mordisco): la animación avisa y luego da. */
  function cuerpoACuerpo(st, m, retraso) {
    var scene = st.scene, t0 = scene.time.now, dado = false;
    animar(m, 'ataque');
    m.golpeEn = t0 + m.def.golpe.cada * ritmo(scene);
    m.accion = { hasta: t0 + retraso + 260, cada: function (t) {
      if (dado || t < t0 + retraso) return;
      dado = true;
      var pj = pies(scene);
      var fr = frente(m);
      var ix = m.x + fr.x * m.def.golpe.alcance * 0.45, iy = m.y + fr.y * m.def.golpe.alcance * 0.45;
      if (m.def.molde === 'golem') {
        onda(st, ix, iy, 0.6);
        if (cercaDeMi(st, ix, iy, 500)) { try { scene.cameras.main.shake(140, 0.005); } catch (e) {} }
      }
      if (Math.hypot(pj.x - ix, pj.y - iy) < m.def.golpe.alcance * 0.85) golpearJugador(st, m.def.jefe ? 'jefe_golpe' : 'monstruo_golpe', m.x, m.y, m.def.molde === 'golem' ? 34 : 20);
    } };
  }

  function golemRoca(st, m, tx, ty) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    orientar(m, tx - m.x, 0);
    if (cercaDeMi(st, m.x, m.y)) sonar(scene, 'roca');
    marca(st, tx, ty, 34, 13, 0xffa04a, 1050);
    m.accion = { hasta: t0 + 700, cada: function () {} };
    scene.time.delayedCall(350, function () {
      if (!st.vivo || !m.vivo) return;
      var x0 = m.x, y0 = m.y - 110;
      // (2026-10-12) Los proyectiles van al doble de resolución: la mitad de escala.
      var roca = efimero(st, scene.add.image(x0, y0, tex(m, 'roca')).setScale(1.2).setDepth(9000));
      scene.tweens.addCounter({ from: 0, to: 1, duration: 700, ease: 'Linear', onUpdate: function (tw) {
        if (!roca.scene) return;
        var t = tw.getValue();
        roca.setPosition(x0 + (tx - x0) * t, y0 + (ty - 16 - y0) * t - Math.sin(t * Math.PI) * 170).setRotation(t * 5);
      }, onComplete: function () {
        soltarEfimero(st, roca);
        if (!st.vivo) return;
        onda(st, tx, ty, 0.75);
        if (cercaDeMi(st, tx, ty, 500)) { try { scene.cameras.main.shake(170, 0.006); } catch (e) {} }
        var p2 = pies(scene);
        if (Math.hypot(p2.x - tx, p2.y - ty) < 58) golpearJugador(st, 'monstruo_poder', tx, ty, 30);
      } });
    });
  }

  function golemPisoton(st, m) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    marca(st, m.x, m.y, 150, 58, 0xffb84a, 650);
    m.accion = { hasta: t0 + 820, cada: function () {} };
    scene.time.delayedCall(650, function () {
      if (!st.vivo || !m.vivo) return;
      onda(st, m.x, m.y, 1.6);
      if (cercaDeMi(st, m.x, m.y)) {
        sonar(scene, 'roca');
        try { scene.cameras.main.shake(380, 0.011); } catch (e) {}
      }
      var p = pies(scene);
      var dx = (p.x - m.x) / 150, dy = (p.y - m.y) / 58;
      if (dx * dx + dy * dy < 1) golpearJugador(st, 'monstruo_poder', m.x, m.y, 40);
    });
  }

  /** La embestida: el anfitrión mueve al lobo; todos miran si les pilla. */
  function loboEmbestida(st, m, ang) {
    var scene = st.scene, t0 = scene.time.now;
    var anfitrion = !st.red || st.red.esHost();
    animar(m, 'quieto');
    orientar(m, Math.cos(ang), 0);
    m.spr.setScale(m.def.escala * 1.08, m.def.escala * 0.84);      // se agacha: el aviso
    var dado = false;
    m.accion = { hasta: t0 + 380 + 440, cada: function (t, seg) {
      if (t < t0 + 380) return;
      if (m.spr.scaleY !== m.def.escala) { m.spr.setScale(m.def.escala); animar(m, 'ataque'); }
      if (anfitrion && !mover(st, m, Math.cos(ang) * 430, Math.sin(ang) * 430, seg)) m.accion.hasta = t;   // pared: se acabó
      var p = pies(scene);
      if (!dado && Math.hypot(p.x - m.x, p.y - m.y) < 48) { dado = true; golpearJugador(st, 'monstruo_poder', m.x, m.y, 36); }
    }, fin: function () { m.spr.setScale(m.def.escala); } };
  }

  function loboAullido(st, m) {
    var scene = st.scene;
    if (cercaDeMi(st, m.x, m.y, 1100)) {
      if (m.def.grito === 'gemido') {
        sonar(scene, 'gemido');
        aviso(scene, '🧟 A ' + m.def.nombre + ' groans — the dead are waking!', 'warning');
      } else if (m.def.grito === 'chillido') {
        sonar(scene, 'chillido');
        aviso(scene, '🦇 A ' + m.def.nombre + ' shrieks — the colony wakes!', 'warning');
      } else {
        sonar(scene, 'aullido');
        aviso(scene, '🐺 A ' + m.def.nombre + ' howls — the pack is coming!', 'warning');
      }
    }
    if (st.red && !st.red.esHost()) return;
    st.bichos.forEach(function (o) {
      if (o.tipo !== m.tipo || !o.vivo || Math.hypot(o.x - m.x, o.y - m.y) > 900) return;
      o.estado = 'caza';
      o.rugio = true;
      o.prisaHasta = scene.time.now + 8000;
    });
  }

  /** Tres espinas desde (bx, by) hacia `base`: cada uno mira si le dan. */
  function aranaEspinas(st, m, bx, by, base) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    if (cercaDeMi(st, m.x, m.y)) sonar(scene, 'siseo');
    m.accion = { hasta: t0 + 520, cada: function () {} };
    scene.time.delayedCall(300, function () {
      if (!st.vivo || !m.vivo) return;
      for (var i = -1; i <= 1; i++) {
        if (st.proyectiles.length >= 24) break;
        var a = base + i * 0.2;
        var spr = scene.add.image(bx, by, tex(m, 'espina')).setScale(1.1).setRotation(a).setDepth(m.y + 1);
        st.proyectiles.push({ spr: spr, x: bx, y: by, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, hasta: scene.time.now + 1600, alto: 30, motivo: 'monstruo_poder' });
      }
    });
  }

  function aranaSavia(st, m, tx, ty) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    if (cercaDeMi(st, m.x, m.y)) sonar(scene, 'siseo');
    marca(st, tx, ty, 48, 18, 0xc99a3a, 800);
    m.accion = { hasta: t0 + 600, cada: function () {} };
    var x0 = m.x, y0 = m.y - 30;
    var gota = efimero(st, scene.add.image(x0, y0, tex(m, 'savia')).setScale(0.3).setDepth(9000));
    scene.tweens.addCounter({ from: 0, to: 1, duration: 800, onUpdate: function (tw) {
      if (!gota.scene) return;
      var t = tw.getValue();
      gota.setPosition(x0 + (tx - x0) * t, y0 + (ty - y0) * t - Math.sin(t * Math.PI) * 120);
    }, onComplete: function () {
      soltarEfimero(st, gota);
      if (!st.vivo) return;
      if (st.charcos.length >= 6) { var viejo = st.charcos.shift(); soltarEfimero(st, viejo.img); }
      var img = efimero(st, scene.add.image(tx, ty, tex(m, 'savia')).setScale(1.2).setDepth(2.6).setAlpha(0.95));
      st.charcos.push({ x: tx, y: ty, hasta: scene.time.now + 6000, img: img, picado: false, aviso: m.def.freno || null });
    } });
  }

  /** Tres rayos en `puntos` ([[x, y], …]). */
  function brujoRayos(st, m, puntos) {
    var scene = st.scene, t0 = scene.time.now;
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'tormenta');
    puntos.forEach(function (pt) { marca(st, pt[0], pt[1], 32, 12, m.def.color || 0x8ce9ff, 900); });
    m.accion = { hasta: t0 + 700, cada: function () {} };
    scene.time.delayedCall(900, function () {
      if (!st.vivo || !m.vivo) return;
      if (cercaDeMi(st, puntos[0][0], puntos[0][1], 700)) { try { scene.cameras.main.flash(60, 200, 240, 255); } catch (e) {} }
      var dado = false;
      puntos.forEach(function (pt) {
        var rayo = efimero(st, scene.add.image(pt[0], pt[1], tex(m, 'rayo')).setOrigin(0.5, 1).setScale(1).setDepth(9000).setAlpha(1));
        scene.tweens.add({ targets: rayo, alpha: 0, duration: 260, delay: 80, onComplete: function () { soltarEfimero(st, rayo); } });
        onda(st, pt[0], pt[1], 0.5);
        var p = pies(scene);
        if (!dado && Math.hypot(p.x - pt[0], p.y - pt[1]) < 46) { dado = true; golpearJugador(st, 'monstruo_poder', pt[0], pt[1], 22); }
      });
    });
  }

  /** Se desvanece y aparece en (x, y). */
  function brujoSalto(st, m, x, y) {
    var scene = st.scene, t0 = scene.time.now;
    m.accion = { hasta: t0 + 560, cada: function () {} };
    scene.tweens.add({ targets: m.spr, alpha: 0, duration: 240, onComplete: function () {
      if (!st.vivo || !m.vivo) return;
      onda(st, m.x, m.y, 0.5);
      m.x = x; m.y = y; m.objX = x; m.objY = y;
      colocar(st, m, scene.time.now);
      onda(st, m.x, m.y, 0.5);
      scene.tweens.add({ targets: m.spr, alpha: 1, duration: 240 });
    } });
  }


  // ── LOS PODERES NUEVOS (2026-10-25) ──────────────────────────────────────
  /* "Haz monstruos y enemigos según esos mapas, todos en 2.5D, con nuevos
     poderes y efectos." Los de los mapas de nivel 8, 9 y 10. Cada especie
     lleva los suyos en `poderes` (además de los de su molde). Igual que los
     demás: el anfitrión decide y anuncia {e:'px', q:<poder>, ...}; todos lo
     dibujan y cada uno mira si le alcanza a SU jugador. Sin motas: rayas,
     púas, anillos, pétalos alargados.
       bola_nieve     una bola de nieve que rueda y crece (el yeti)
       rugido_helado  una onda de escarcha alrededor que frena (el oso)
       prision        seis púas de hielo cierran un círculo (el espectro)
       chillido       un cono de ondas que aturde (el murciélago)
       derrumbe       caen rocas del techo donde marcó (el trol)
       emerger        se hunde y sale debajo de ti (el gólem de cristal)
       raices         una fila de raíces que brotan y atrapan (dríade, gólem de musgo)
       petalos        un torbellino de pétalos que gira y corta (la dríade)
       espinos        una ráfaga de espinas (el jabalí) */
  var PODER_TEX = { bola_nieve: ['roca'], derrumbe: ['roca'], espinos: ['espina'] };

  function frenar(st, ms, texto) {
    var scene = st.scene;
    scene._frenoHasta = Math.max(scene._frenoHasta || 0, scene.time.now + ms);
    var ahora = Date.now();
    if (texto && ahora - (st.avisoFrenoEn || 0) > 2500) { st.avisoFrenoEn = ahora; aviso(scene, '❄ ' + texto, 'warning'); }
  }

  function texturasPoderes(scene) {
    var lienzo = function (clave, w, h, pinta) {
      if (scene.textures.exists(clave)) return;
      var t = scene.textures.createCanvas(clave, w, h);
      try { pinta(t.getContext(), w, h); t.refresh(); }
      catch (e) { if (scene.textures.exists(clave) && scene.textures.get(clave) === t) scene.textures.remove(clave); }
    };
    // La púa de hielo: tres caras (luz, medio, sombra) y su contorno.
    lienzo('gfsv_pua_hielo', 26, 56, function (x, w, h) {
      var cx = w / 2, b = h - 2;
      x.fillStyle = '#8ce9ff'; x.beginPath(); x.moveTo(cx - 10, b); x.lineTo(cx, 2); x.lineTo(cx + 10, b); x.closePath(); x.fill();
      x.fillStyle = '#eafcff'; x.beginPath(); x.moveTo(cx - 10, b); x.lineTo(cx, 2); x.lineTo(cx - 1.5, b); x.closePath(); x.fill();
      x.fillStyle = '#3a7ab8'; x.beginPath(); x.moveTo(cx + 2, b); x.lineTo(cx, 2); x.lineTo(cx + 10, b); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,30,50,0.9)'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(cx - 10, b); x.lineTo(cx, 2); x.lineTo(cx + 10, b); x.closePath(); x.stroke();
    });
    // La raíz: una cuña de corteza que se curva, con su hoja.
    lienzo('gfsv_raiz', 26, 50, function (x, w, h) {
      var b = h - 2;
      x.fillStyle = '#6e5236'; x.beginPath(); x.moveTo(4, b); x.quadraticCurveTo(6, 18, 15, 3); x.quadraticCurveTo(14, 22, 22, b); x.closePath(); x.fill();
      x.fillStyle = '#9a7650'; x.beginPath(); x.moveTo(4, b); x.quadraticCurveTo(6, 18, 15, 3); x.quadraticCurveTo(9, 22, 11, b); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(30,20,10,0.9)'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(4, b); x.quadraticCurveTo(6, 18, 15, 3); x.quadraticCurveTo(14, 22, 22, b); x.stroke();
      x.fillStyle = '#5f9a3a'; x.beginPath(); x.ellipse(18, 18, 5, 2.6, -0.6, 0, Math.PI * 2); x.fill();
    });
    // El pétalo: una lágrima alargada, rosa (nunca un punto).
    lienzo('gfsv_petalo', 14, 7, function (x, w, h) {
      x.fillStyle = 'rgba(244,160,188,0.98)'; x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.8, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,222,232,0.98)'; x.beginPath(); x.ellipse(w / 2 - 2, h / 2 - 0.6, w / 4, h / 5, 0, 0, Math.PI * 2); x.fill();
    });
    // El arco del chillido: media luna que se abre hacia delante.
    lienzo('gfsv_arco', 40, 80, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,170,210,0)'); g.addColorStop(0.6, 'rgba(255,190,230,0.9)'); g.addColorStop(1, 'rgba(255,240,250,0.95)');
      x.strokeStyle = g; x.lineWidth = 4;
      x.beginPath(); x.ellipse(4, h / 2, w - 8, h / 2 - 4, 0, -Math.PI / 2, Math.PI / 2); x.stroke();
    });
  }

  function pxBolaNieve(st, m, d) {
    var scene = st.scene, ang = d.a, t0 = scene.time.now;
    animar(m, 'ataque');
    orientar(m, Math.cos(ang), Math.sin(ang));
    m.accion = { hasta: t0 + 600, cada: function () {} };
    if (cercaDeMi(st, m.x, m.y)) sonar(scene, 'roca');
    var x0 = m.x + Math.cos(ang) * 40, y0 = m.y + Math.sin(ang) * 30, dado = false, fin = false;
    var bola = efimero(st, scene.add.image(x0, y0 - 12, tex(m, 'roca')).setScale(0.5).setDepth(y0 + 1));
    var sombra = efimero(st, scene.add.image(x0, y0, 'gfsv_sombra').setScale(0.8).setAlpha(0.7).setDepth(2.5));
    var LARGO = 760;
    scene.tweens.addCounter({ from: 0, to: 1, duration: 2500, ease: 'Linear', onUpdate: function (tw) {
      if (fin || !bola.scene) return;
      var u = tw.getValue(), rec = u * LARGO, k = 0.5 + u * 1.1;
      var x = x0 + Math.cos(ang) * rec, y = y0 + Math.sin(ang) * rec * 0.85;
      bola.setPosition(x, y - 10 * k).setScale(k).setRotation(rec / 22).setDepth(y + 1);
      sombra.setPosition(x, y).setScale(0.8 * k);
      var p = pies(scene);
      if (!dado && Math.hypot(p.x - x, p.y - y) < 22 + 16 * k) { dado = true; golpearJugador(st, 'monstruo_poder', x - Math.cos(ang) * 10, y - Math.sin(ang) * 10, 46); }
      if (u > 0.05 && !libre(scene, x, y, 18, 8)) { fin = true; tw.stop(); }
    }, onComplete: function () { acaba(); }, onStop: function () { acaba(); } });
    function acaba() {
      if (!st.vivo || !bola.scene) return;
      onda(st, bola.x, bola.y + 10, 0.8);
      if (cercaDeMi(st, bola.x, bola.y, 500)) { try { scene.cameras.main.shake(140, 0.005); } catch (e) {} }
      soltarEfimero(st, bola); soltarEfimero(st, sombra);
    }
  }

  function pxRugido(st, m, d) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'aullido');
    marca(st, m.x, m.y, 190, 74, 0xbfefff, 500);
    m.accion = { hasta: t0 + 900, cada: function () {} };
    var ox = m.x, oy = m.y;
    scene.time.delayedCall(500, function () {
      if (!st.vivo || !m.vivo) return;
      var o = efimero(st, scene.add.image(ox, oy, 'gfsv_onda').setDepth(oy + 1).setScale(0.3).setTint(0xcff4ff).setAlpha(0.95));
      scene.tweens.add({ targets: o, scale: 3.6, alpha: 0, duration: 620, ease: 'Quad.easeOut', onComplete: function () { soltarEfimero(st, o); } });
      var p = pies(scene), dx = (p.x - ox) / 190, dy = (p.y - oy) / 74;
      if (dx * dx + dy * dy < 1) { golpearJugador(st, 'monstruo_poder', ox, oy, 30); frenar(st, 1400, m.def.freno); }
    });
  }

  function pxPrision(st, m, d) {
    var scene = st.scene, t0 = scene.time.now, cx = d.x, cy = d.y;
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'tormenta');
    m.accion = { hasta: t0 + 800, cada: function () {} };
    var puntos = [];
    for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2; puntos.push([cx + Math.cos(a) * 74, cy + Math.sin(a) * 44]); }
    puntos.forEach(function (pt) { marca(st, pt[0], pt[1], 14, 6, m.def.color || 0x8ce9ff, 900); });
    marca(st, cx, cy, 74, 44, m.def.color || 0x8ce9ff, 900);
    scene.time.delayedCall(900, function () {
      if (!st.vivo || !m.vivo) return;
      puntos.forEach(function (pt, i) {
        var pua = efimero(st, scene.add.image(pt[0], pt[1] + 2, 'gfsv_pua_hielo').setOrigin(0.5, 1).setDepth(pt[1] + 1).setScale(1.2, 0.1));
        scene.tweens.add({ targets: pua, scaleY: 1.3, duration: 120, delay: i * 30, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: pua, alpha: 0, scaleY: 0.2, delay: 1300, duration: 300, onComplete: function () { soltarEfimero(st, pua); } });
      });
      var p = pies(scene), dx = (p.x - cx) / 74, dy = (p.y - cy) / 44;
      if (dx * dx + dy * dy < 1.1) { golpearJugador(st, 'monstruo_poder', cx, cy, 10); frenar(st, 1800, m.def.freno); }
    });
  }

  function pxChillido(st, m, d) {
    var scene = st.scene, t0 = scene.time.now, ang = d.a;
    animar(m, 'ataque');
    orientar(m, Math.cos(ang), Math.sin(ang));
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'chillido');
    m.accion = { hasta: t0 + 700, cada: function () {} };
    var ox = m.x, oy = m.y - (m.def.flota ? 30 : 20);
    [0, 140, 280].forEach(function (retraso) {
      scene.time.delayedCall(retraso, function () {
        if (!st.vivo) return;
        var arco = efimero(st, scene.add.image(ox, oy, 'gfsv_arco').setOrigin(0, 0.5).setRotation(ang).setDepth(9000).setScale(0.5).setAlpha(0.95));
        scene.tweens.add({ targets: arco, x: ox + Math.cos(ang) * 260, y: oy + Math.sin(ang) * 260, scale: 2.2, alpha: 0, duration: 520, onComplete: function () { soltarEfimero(st, arco); } });
      });
    });
    scene.time.delayedCall(260, function () {
      if (!st.vivo) return;
      var p = pies(scene), dx = p.x - ox, dy = (p.y - 30) - oy, dist = Math.hypot(dx, dy);
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (dist < 290 && Math.abs(da) < 0.6) { golpearJugador(st, 'monstruo_poder', ox, oy, 16); frenar(st, 1500, m.def.freno); }
    });
  }

  function pxDerrumbe(st, m, d) {
    var scene = st.scene, t0 = scene.time.now;
    animar(m, 'ataque');
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'roca');
    try { if (cercaDeMi(st, m.x, m.y, 700)) scene.cameras.main.shake(300, 0.004); } catch (e) {}
    m.accion = { hasta: t0 + 700, cada: function () {} };
    d.pts.forEach(function (pt, k) {
      marca(st, pt[0], pt[1], 36, 14, 0xffb04a, 950 + k * 120);
      scene.time.delayedCall(450 + k * 120, function () {
        if (!st.vivo) return;
        var roca = efimero(st, scene.add.image(pt[0], pt[1] - 420, tex(m, 'roca')).setScale(1.1).setDepth(9000));
        scene.tweens.add({ targets: roca, y: pt[1] - 10, rotation: 2.4, duration: 500, ease: 'Quad.easeIn', onComplete: function () {
          soltarEfimero(st, roca);
          if (!st.vivo) return;
          onda(st, pt[0], pt[1], 0.6);
          if (cercaDeMi(st, pt[0], pt[1], 500)) { try { scene.cameras.main.shake(120, 0.005); } catch (e) {} }
          var p = pies(scene);
          if (Math.hypot(p.x - pt[0], p.y - pt[1]) < 46) golpearJugador(st, 'monstruo_poder', pt[0], pt[1], 26);
        } });
      });
    });
  }

  function pxEmerger(st, m, d) {
    var scene = st.scene, t0 = scene.time.now, x = d.x, y = d.y;
    m.accion = { hasta: t0 + 1300, cada: function () {} };
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'roca');
    onda(st, m.x, m.y, 0.7);
    scene.tweens.add({ targets: m.spr, alpha: 0, duration: 300 });
    m.sombra.setAlpha(0.2);
    marca(st, x, y, 50, 20, m.def.color || 0xc79cff, 900);
    scene.time.delayedCall(600, function () {
      if (!st.vivo || !m.vivo) return;
      m.x = x; m.y = y; m.objX = x; m.objY = y;
      colocar(st, m, scene.time.now);
    });
    scene.time.delayedCall(900, function () {
      if (!st.vivo || !m.vivo) return;
      onda(st, x, y, 1.2);
      if (cercaDeMi(st, x, y, 600)) { try { scene.cameras.main.shake(260, 0.008); } catch (e) {} sonar(scene, 'roca'); }
      animar(m, 'ataque');
      scene.tweens.add({ targets: m.spr, alpha: 1, duration: 200 });
      m.sombra.setAlpha(0.85);
      var p = pies(scene);
      if (Math.hypot(p.x - x, p.y - y) < 58) golpearJugador(st, 'monstruo_poder', x, y, 40);
    });
  }

  function pxRaices(st, m, d) {
    var scene = st.scene, ang = d.a;
    animar(m, 'ataque');
    orientar(m, Math.cos(ang), Math.sin(ang));
    m.accion = { hasta: scene.time.now + 900, cada: function () {} };
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'siseo');
    var dado = false;
    for (var k = 0; k < 8; k++) {
      (function (k) {
        var x = m.x + Math.cos(ang) * (54 + k * 40), y = m.y + Math.sin(ang) * (54 + k * 40) * 0.85;
        if (!libre(scene, x, y, 10, 6)) return;
        scene.time.delayedCall(k * 90, function () {
          if (!st.vivo) return;
          marca(st, x, y, 16, 7, m.def.color || 0x8fd45a, 320);
          scene.time.delayedCall(320, function () {
            if (!st.vivo) return;
            var r = efimero(st, scene.add.image(x, y + 2, 'gfsv_raiz').setOrigin(0.5, 1).setDepth(y + 1).setScale(1.2, 0.1).setFlipX(k % 2 === 1));
            scene.tweens.add({ targets: r, scaleY: 1.3, duration: 130, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: r, alpha: 0, scaleY: 0.2, delay: 900, duration: 260, onComplete: function () { soltarEfimero(st, r); } });
            var p = pies(scene);
            if (!dado && Math.hypot(p.x - x, p.y - y) < 34) { dado = true; golpearJugador(st, 'monstruo_poder', x, y, 12); frenar(st, 1700, m.def.freno); }
          });
        });
      })(k);
    }
  }

  function pxPetalos(st, m, d) {
    var scene = st.scene, cx = d.x, cy = d.y;
    animar(m, 'ataque');
    m.accion = { hasta: scene.time.now + 600, cada: function () {} };
    if (cercaDeMi(st, m.x, m.y, 900)) sonar(scene, 'tormenta');
    marca(st, cx, cy, 80, 34, 0xf4a0bc, 900);
    var petalos = [], dado = false;
    for (var i = 0; i < 12; i++) {
      petalos.push({ spr: efimero(st, scene.add.image(cx, cy, 'gfsv_petalo').setDepth(cy + 2).setAlpha(0)), a: i / 12 * Math.PI * 2, r: 90 + (i % 3) * 10 });
    }
    scene.tweens.addCounter({ from: 0, to: 1, duration: 2200, onUpdate: function (tw) {
      var u = tw.getValue();
      petalos.forEach(function (p, k) {
        if (!p.spr.scene) return;
        var a = p.a + u * 9, r = p.r * (1 - u * 0.55);
        p.spr.setPosition(cx + Math.cos(a) * r, cy - 24 + Math.sin(a) * r * 0.45).setRotation(a + Math.PI / 2)
          .setAlpha(Math.min(1, u * 5) * (1 - Math.max(0, (u - 0.8) * 5)));
      });
      if (!dado && u > 0.45) {
        var p = pies(scene), dx = (p.x - cx) / 80, dy = (p.y - cy) / 40;
        if (dx * dx + dy * dy < 1) { dado = true; golpearJugador(st, 'monstruo_poder', cx, cy, 14); frenar(st, 1200, m.def.freno); }
      }
    }, onComplete: function () { petalos.forEach(function (p) { soltarEfimero(st, p.spr); }); } });
  }

  /** El anfitrión: ¿usa ahora uno de los poderes de su especie? */
  function poderExtra(st, m, dist, b, v, anunciar) {
    var lista = m.def.poderes, scene = st.scene;
    if (!lista || !lista.length || Math.random() > 0.55) return false;
    var cual = lista[Math.floor(Math.random() * lista.length)];
    if (cual === m.ultimoExtra && lista.length > 1) cual = lista[(lista.indexOf(cual) + 1) % lista.length];
    var tx = b.x + v.x * 0.5, ty = b.y + v.y * 0.5;
    var ang = Number(Math.atan2(ty - m.y, tx - m.x).toFixed(3)), d = null;
    if (cual === 'bola_nieve' && dist > 80 && dist < 620) d = { a: ang };
    else if (cual === 'rugido_helado' && dist < 200) d = {};
    else if (cual === 'prision' && dist < 520) d = { x: Math.round(tx), y: Math.round(ty) };
    else if (cual === 'chillido' && dist < 290) d = { a: ang };
    else if (cual === 'derrumbe' && dist < 520) {
      d = { pts: [[Math.round(tx), Math.round(ty)],
                  [Math.round(tx + entre(-90, -50)), Math.round(ty + entre(-40, 40))],
                  [Math.round(tx + entre(50, 90)), Math.round(ty + entre(-40, 40))]] };
    } else if (cual === 'emerger' && dist > 120 && dist < 560) {
      for (var k = 0; k < 12 && !d; k++) {
        var x = tx + entre(-30, 30), y = ty + entre(-20, 20);
        if (libreM(scene, m, x, y) && Math.hypot(x - m.casa.x, y - m.casa.y) < m.def.correa) d = { x: Math.round(x), y: Math.round(y) };
      }
    } else if (cual === 'raices' && dist < 380) d = { a: ang };
    else if (cual === 'petalos' && dist < 480) d = { x: Math.round(tx), y: Math.round(ty) };
    else if (cual === 'espinos' && dist < 360) {
      var fr = frente(m);
      var bx = m.x + fr.x * 34, by = m.y - 24 + fr.y * 20;
      d = { bx: Math.round(bx), by: Math.round(by), a: Number(Math.atan2(b.y - 30 + v.y * 0.4 - by, b.x + v.x * 0.4 - bx).toFixed(3)) };
    }
    if (!d) return false;
    d.e = 'px'; d.q = cual;
    m.ultimoExtra = cual;
    ejecutarExtra(st, m, d);
    anunciar(d);
    return true;
  }

  /** En todos los navegadores: el poder anunciado (con sus números comprobados). */
  function ejecutarExtra(st, m, d) {
    var num = function (v) { return Number.isFinite(Number(v)); };
    if (!d || !m || !m.vivo || !m.def.poderes || m.def.poderes.indexOf(d.q) < 0) return;
    if (d.q === 'bola_nieve' && num(d.a)) pxBolaNieve(st, m, { a: Number(d.a) });
    else if (d.q === 'rugido_helado') pxRugido(st, m, d);
    else if (d.q === 'prision' && num(d.x) && num(d.y)) pxPrision(st, m, { x: Number(d.x), y: Number(d.y) });
    else if (d.q === 'chillido' && num(d.a)) pxChillido(st, m, { a: Number(d.a) });
    else if (d.q === 'derrumbe' && Array.isArray(d.pts) && d.pts.length && d.pts.every(function (q) { return Array.isArray(q) && num(q[0]) && num(q[1]); })) {
      pxDerrumbe(st, m, { pts: d.pts.slice(0, 3).map(function (q) { return [Number(q[0]), Number(q[1])]; }) });
    } else if (d.q === 'emerger' && num(d.x) && num(d.y)) pxEmerger(st, m, { x: Number(d.x), y: Number(d.y) });
    else if (d.q === 'raices' && num(d.a)) pxRaices(st, m, { a: Number(d.a) });
    else if (d.q === 'petalos' && num(d.x) && num(d.y)) pxPetalos(st, m, { x: Number(d.x), y: Number(d.y) });
    else if (d.q === 'espinos' && num(d.bx) && num(d.by) && num(d.a)) aranaEspinas(st, m, Number(d.bx), Number(d.by), Number(d.a));
  }

  /* LO QUE DECIDE EL ANFITRIÓN: el poder, sus números, y se anuncia. */
  function elegirPoder(st, m, dist, b) {
    var tipo = m.def.molde, scene = st.scene;
    m.poderEn = scene.time.now + entre(m.def.poder[0], m.def.poder[1]) * ritmo(scene);
    var v = velDe(st, b);
    var anunciar = function (d) { d.id = m.id; if (st.red) st.red.evento(d); };
    // (2026-10-20) Un jefe usa a menudo los SUYOS (gf-jefes.js).
    if (m.def.jefe && window.GFJefes && window.GFJefes.poder(st, m, dist, b, anunciar, apiJefe())) return;
    // (2026-10-25) Los poderes propios de la especie (los de nivel 8-10).
    if (m.def.poderes && poderExtra(st, m, dist, b, v, anunciar)) return;
    if (tipo === 'golem') {
      if (dist < 150) { golemPisoton(st, m); anunciar({ e: 'pisoton', x: Math.round(m.x), y: Math.round(m.y) }); }
      else if (dist < 480) {
        var tx = b.x + v.x * 0.5, ty = b.y + v.y * 0.5, d = Math.hypot(tx - m.x, ty - m.y);
        if (d > 460) { tx = m.x + (tx - m.x) * 460 / d; ty = m.y + (ty - m.y) * 460 / d; }
        golemRoca(st, m, tx, ty);
        anunciar({ e: 'roca', tx: Math.round(tx), ty: Math.round(ty) });
      }
    } else if (tipo === 'lobo') {
      if (dist > 110 && dist < 340) {
        var ang = Math.atan2(b.y + v.y * 0.25 - m.y, b.x + v.x * 0.25 - m.x);
        loboEmbestida(st, m, ang);
        anunciar({ e: 'embestida', a: Number(ang.toFixed(3)) });
      }
    } else if (tipo === 'arana') {
      if (m.ultimoPoder === 'espinas') {
        var sx = b.x + v.x * 0.6, sy = b.y + v.y * 0.6;
        aranaSavia(st, m, sx, sy);
        anunciar({ e: 'savia', tx: Math.round(sx), ty: Math.round(sy) });
        m.ultimoPoder = 'savia';
      } else {
        var fr = frente(m);
        var bx = m.x + fr.x * 34, by = m.y - 30 + fr.y * 20;
        var base = Math.atan2(b.y - 30 + v.y * 0.4 - by, b.x + v.x * 0.4 - bx);
        aranaEspinas(st, m, bx, by, base);
        anunciar({ e: 'espinas', bx: Math.round(bx), by: Math.round(by), a: Number(base.toFixed(3)) });
        m.ultimoPoder = 'espinas';
      }
    } else if (tipo === 'brujo') {
      var sitio = null;
      if (m.ultimoPoder !== 'salto' && dist > 300) {
        for (var k = 0; k < 14 && !sitio; k++) {
          var a = Math.random() * Math.PI * 2, r = entre(170, 240);
          var x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r * 0.75;
          if (libreM(scene, m, x, y) && Math.hypot(x - m.casa.x, y - m.casa.y) < m.def.correa) sitio = { x: x, y: y };
        }
      }
      if (sitio) {
        brujoSalto(st, m, sitio.x, sitio.y);
        anunciar({ e: 'salto', x: Math.round(sitio.x), y: Math.round(sitio.y) });
        m.ultimoPoder = 'salto';
      } else {
        var cx = b.x + v.x * 0.6, cy = b.y + v.y * 0.6;
        var puntos = [[Math.round(cx), Math.round(cy)],
                      [Math.round(cx + entre(-90, -50)), Math.round(cy + entre(-40, 40))],
                      [Math.round(cx + entre(50, 90)), Math.round(cy + entre(-40, 40))]];
        brujoRayos(st, m, puntos);
        anunciar({ e: 'rayos', p: puntos });
        m.ultimoPoder = 'rayos';
      }
    }
  }

  /** El grito al empezar a cazar (sonido y temblor, solo si está cerca de mí). */
  function gritar(st, m) {
    var scene = st.scene;
    if (m.def.molde === 'lobo') { loboAullido(st, m); return; }
    if (!cercaDeMi(st, m.x, m.y, 900)) return;
    if (m.def.molde === 'golem') { sonar(scene, 'roca'); try { scene.cameras.main.shake(300, 0.004); } catch (e) {} }
    else if (m.def.molde === 'arana') sonar(scene, 'siseo');
    else sonar(scene, 'tormenta');
  }

  function empezarCaza(st, m) {
    m.estado = 'caza';
    if (m.rugio) return;
    m.rugio = true;
    gritar(st, m);
    if (st.red) st.red.evento({ e: 'grita', id: m.id });
  }

  // ── EL PASO ──────────────────────────────────────────────────────────────
  function actualizar(st, t, delta) {
    var scene = st.scene, p = scene.player;
    if (!p || !p.active || scene._cambiandoEscena) return;
    var seg = Math.min(0.05, delta / 1000);
    var pj = pies(scene);
    if (st.red) st.red.tick(t);
    if (st.red && !st.red.esHost()) actualizarInvitado(st, t, seg, pj);
    else actualizarAnfitrion(st, t, seg, pj);
    actualizarProyectiles(st, t, seg, pj);
    actualizarCharcos(st, t, pj);
    if (window.GFMinaSerpiente && window.GFMinaSerpiente._botin) window.GFMinaSerpiente._botin.actualizar(st, pj);
  }

  /** ¿Hay algún jugador a menos de `r` px de (x, y)? */
  function alguienCerca(st, x, y, r) {
    var lista = window.GFMobsRed ? window.GFMobsRed.jugadores(st.scene) : [{ x: pies(st.scene).x, y: pies(st.scene).y }];
    for (var i = 0; i < lista.length; i++) if (Math.hypot(lista[i].x - x, lista[i].y - y) < r) return true;
    return false;
  }

  function actualizarAnfitrion(st, t, seg, pj) {
    var scene = st.scene;
    for (var i = 0; i < st.bichos.length; i++) {
      var m = st.bichos[i];
      if (!m.vivo) {
        if (Date.now() > m.muertoHasta && !alguienCerca(st, m.casa.x, m.casa.y, 700)) {
          revivir(st, m);
          if (st.red) st.red.evento({ e: 'revive', id: m.id });
        }
        continue;
      }
      // Lo que se ve, según MI jugador; lo que piensa, según el blanco.
      var miD = Math.hypot(pj.x - m.x, pj.y - m.y);
      var b = window.GFMobsRed ? window.GFMobsRed.masCercano(scene, m.x, m.y, LEJOS)
                               : (fantasma() ? null : { x: pj.x, y: pj.y, d: miD, local: true });
      var ver = miD < LEJOS;
      if (ver !== m.spr.visible) { m.spr.setVisible(ver); m.sombra.setVisible(ver); }
      if (!ver && m.barra) m.barra.setVisible(false);
      if (!ver && m.nombre) m.nombre.setVisible(false);
      if (!ver && !b) continue;                 // nadie cerca: ni piensa
      // Una vez por segundo: ¿quedó dentro de algo sólido? (no debería, pero nunca atascado).
      if (t > m.comprobado) { m.comprobado = t + 1000; desatascar(st, m); }
      m.blanco = b;
      var dist = b ? b.d : Infinity;

      if (m.accion) {
        m.accion.cada(t, seg);
        if (t >= m.accion.hasta) { var a = m.accion; m.accion = null; if (a.fin) a.fin(); }
      } else if (t < m.aturdidoHasta) {
        // aturdido por un tajo: quieto un momento
      } else if (m.estado === 'vuelve') {
        if (Math.hypot(m.casa.x - m.x, m.casa.y - m.y) < 24) { m.estado = 'paseo'; m.vida = m.max; m.rugio = false; animar(m, 'quieto'); }
        else { hacia(st, m, m.casa.x, m.casa.y, m.def.vel * 1.6, seg); animar(m, 'camina'); }
      } else if (m.estado === 'paseo') {
        if (b && dist < m.def.vista) empezarCaza(st, m);
        else pasear(st, m, t, seg);
      } else {
        cazar(st, m, t, seg, b);
      }
      colocar(st, m, t);
      pintarBarra(st, m);
    }
  }

  /** Invitado: no piensa. Sigue la foto del anfitrión, suavizando. */
  function actualizarInvitado(st, t, seg, pj) {
    var A = window.GFMonstruosArte;
    for (var i = 0; i < st.bichos.length; i++) {
      var m = st.bichos[i];
      if (!m.vivo) continue;
      var dx = m.objX - m.x, dy = m.objY - m.y, d = Math.hypot(dx, dy);
      if (d > 240) { m.x = m.objX; m.y = m.objY; }
      else if (d > 0.3) {
        var k = Math.min(1, seg * 9);
        m.x += dx * k; m.y += dy * k;
      }
      var cerca = Math.hypot(pj.x - m.x, pj.y - m.y) < LEJOS;
      if (cerca !== m.spr.visible) { m.spr.setVisible(cerca); m.sombra.setVisible(cerca); }
      if (!cerca) { if (m.barra) m.barra.setVisible(false); if (m.nombre) m.nombre.setVisible(false); continue; }
      if (m.accion) {
        m.accion.cada(t, seg);
        if (t >= m.accion.hasta) { var a = m.accion; m.accion = null; if (a.fin) a.fin(); }
      } else if (A) {
        animar(m, m.accionRed || 'quieto');
      }
      colocar(st, m, t);
      pintarBarra(st, m);
    }
  }

  function pasear(st, m, t, seg) {
    if (!m.destino || t > m.ideaEn || Math.hypot(m.destino.x - m.x, m.destino.y - m.y) < 6) {
      var a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 170;
      m.destino = { x: m.casa.x + Math.cos(a) * r, y: m.casa.y + Math.sin(a) * r * 0.7 };
      m.ideaEn = t + 2500 + Math.random() * 4000;
      if (Math.random() < 0.35) m.destino = { x: m.x, y: m.y };
    }
    var ddx = m.destino.x - m.x, ddy = m.destino.y - m.y, dd = Math.hypot(ddx, ddy);
    if (dd > 4) {
      if (!mover(st, m, ddx / dd * m.def.vel, ddy / dd * m.def.vel, seg)) m.destino = null;
      animar(m, 'camina');
    } else animar(m, 'quieto');
  }

  function cazar(st, m, t, seg, b) {
    var def = m.def;
    if (!b || b.d > def.olvida || Math.hypot(m.x - m.casa.x, m.y - m.casa.y) > def.correa) {
      m.estado = 'vuelve'; m.ruta = null;
      return;
    }
    var dist = b.d || 1, dx = b.x - m.x, dy = b.y - m.y;
    orientar(m, dx, dy);
    if (def.golpe && dist < def.golpe.alcance && t > m.golpeEn) {
      var retraso = m.def.molde === 'golem' ? 420 : 260;
      cuerpoACuerpo(st, m, retraso);
      if (st.red) st.red.evento({ e: 'golpe', id: m.id, r: retraso, f: m.spr.flipX ? 1 : 0 });
      return;
    }
    if (t > m.poderEn) { elegirPoder(st, m, dist, b); if (m.accion) return; }
    var vel = def.velCaza * (t < m.prisaHasta ? 1.25 : 1);
    if (def.distancia) {
      // Los de lejos guardan su distancia: ni pegados ni perdidos.
      if (dist < def.distancia - 70) {
        mover(st, m, -dx / dist * vel * 0.8, -dy / dist * vel * 0.8, seg);
        orientar(m, dx, dy);
        animar(m, 'camina');
      } else if (dist > def.distancia + 60) { hacia(st, m, b.x, b.y, vel, seg); animar(m, 'camina'); }
      else animar(m, 'quieto');
    } else if (dist > (def.golpe ? def.golpe.alcance * 0.8 : 60)) {
      hacia(st, m, b.x, b.y, vel, seg);
      animar(m, 'camina');
    } else animar(m, 'quieto');
  }

  function actualizarProyectiles(st, t, seg, pj) {
    var scene = st.scene;
    for (var i = st.proyectiles.length - 1; i >= 0; i--) {
      var b = st.proyectiles[i];
      b.x += b.vx * seg; b.y += b.vy * seg;
      b.spr.setPosition(b.x, b.y).setDepth(b.y + b.alto);
      var toca = !fantasma() && Math.hypot(pj.x - b.x, (pj.y - 34) - b.y) < 24;
      var pared = !libre(scene, b.x, b.y + b.alto, 6, 4);
      if (toca || pared || t > b.hasta) {
        if (toca) golpearJugador(st, b.motivo, b.x - b.vx * 0.05, b.y - b.vy * 0.05, 18);
        b.spr.destroy();
        st.proyectiles.splice(i, 1);
      }
    }
  }

  function actualizarCharcos(st, t, pj) {
    var scene = st.scene;
    for (var i = st.charcos.length - 1; i >= 0; i--) {
      var c = st.charcos[i];
      if (t > c.hasta) {
        st.charcos.splice(i, 1);
        (function (img) { scene.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: function () { soltarEfimero(st, img); } }); })(c.img);
        continue;
      }
      var dx = (pj.x - c.x) / 48, dy = (pj.y - c.y) / 18;
      if (dx * dx + dy * dy < 1) {
        // SalvajeScene.update frena al jugador mientras dure esto.
        scene._frenoHasta = t + 250;
        if (!c.picado) { c.picado = true; aviso(scene, '🕸 ' + (c.aviso || 'Sticky sap — you are slowed!'), 'warning'); }
      }
    }
  }

  // ── LA RED: LA FOTO, LOS ANUNCIOS Y LOS GOLPES DE LOS DEMÁS ─────────────
  function exportar(st) {
    return st.bichos.map(function (m) {
      return [m.id, Math.round(m.x), Math.round(m.y),
              (m.vivo ? 1 : 0) | (m.estado === 'caza' ? 2 : 0) | (m.spr.flipX ? 4 : 0),
              Math.max(0, Math.round(m.vida)), Math.max(0, DIRS.indexOf(m.dir)), Math.max(0, ACCIONES.indexOf(m.accionNombre))];
    });
  }

  function importar(st, lista) {
    lista.forEach(function (f) {
      var m = st.porId[f[0]];
      if (!m || !Array.isArray(f)) return;
      var vivo = !!(f[3] & 1);
      m.objX = Number(f[1]) || m.x; m.objY = Number(f[2]) || m.y;
      m.vida = Math.min(m.max, Math.max(0, Number(f[4]) || 0));
      m.estado = (f[3] & 2) ? 'caza' : 'paseo';
      if (!m.def.humanoide) m.spr.setFlipX(!!(f[3] & 4));
      var dir = DIRS[f[5]] || 'down';
      if (dir !== m.dir) { m.dir = dir; m.anim = null; }
      m.accionRed = ACCIONES[f[6]] || 'quieto';
      if (vivo && !m.vivo) { revivir(st, m); m.x = m.objX; m.y = m.objY; }
      else if (!vivo && m.vivo) morir(st, m, null);
    });
  }

  function alEvento(st, d) {
    var m = st.porId[d.id];
    if (!m) return;
    if (d.e === 'revive') { if (!m.vivo) revivir(st, m); return; }
    if (d.e === 'muere') { if (m.vivo) morir(st, m, d.por || null); return; }
    if (!m.vivo) return;
    if (d.e === 'herido') { destello(st, m); m.heridoEn = st.scene.time.now; return; }
    if (d.e === 'grita') { m.rugio = true; gritar(st, m); return; }
    if (d.e === 'golpe') { if (m.def.golpe) { if (!m.def.humanoide) m.spr.setFlipX(!!d.f); cuerpoACuerpo(st, m, Number(d.r) || 260); } return; }
    if (d.e === 'pisoton') { m.x = Number(d.x) || m.x; m.y = Number(d.y) || m.y; golemPisoton(st, m); return; }
    if (d.e === 'roca') { golemRoca(st, m, Number(d.tx), Number(d.ty)); return; }
    if (d.e === 'embestida') { loboEmbestida(st, m, Number(d.a) || 0); return; }
    if (d.e === 'espinas') { aranaEspinas(st, m, Number(d.bx), Number(d.by), Number(d.a) || 0); return; }
    if (d.e === 'savia') { aranaSavia(st, m, Number(d.tx), Number(d.ty)); return; }
    if (d.e === 'rayos' && Array.isArray(d.p) && d.p.length) { brujoRayos(st, m, d.p.slice(0, 3)); return; }
    if (d.e === 'salto') { brujoSalto(st, m, Number(d.x), Number(d.y)); return; }
    // (2026-10-20) Los poderes de los jefes.
    if (d.e === 'jefe' && window.GFJefes) window.GFJefes.ejecutar(st, m, d, apiJefe());
    if (d.e === 'px') ejecutarExtra(st, m, d);
  }

  function alCambiarHost(st, soyYo) {
    st.bichos.forEach(function (m) {
      if (m.accion && m.accion.fin) { try { m.accion.fin(); } catch (e) {} }
      m.accion = null;
      if (soyYo) {
        // Sigue desde donde estaba: lo que piensa empieza de cero.
        m.ruta = null; m.destino = null;
        if (m.vivo) { desatascar(st, m); m.estado = m.estado === 'caza' ? 'caza' : 'paseo'; }
        else m.muertoHasta = Math.max(m.muertoHasta, Date.now() + 30000);
      } else {
        m.objX = m.x; m.objY = m.y;
      }
    });
  }

  // ── LA ESPADA CONTRA LOS MONSTRUOS ───────────────────────────────────────
  function destello(st, m) {
    var scene = st.scene;
    m.spr.setTintFill(0xffffff);
    scene.time.delayedCall(70, function () { if (m.spr.active) m.spr.clearTint(); });
  }

  /** El anfitrión resta la vida: suya o de un espadazo de otro (`por`). */
  function aplicarDano(st, m, dano, ux, uy, por) {
    var scene = st.scene;
    if (!m.vivo) return 0;
    var recibido = Math.min(m.vida, dano);
    m.vida -= recibido;
    m.heridoEn = scene.time.now;
    m.aturdidoHasta = scene.time.now + (m.def.molde === 'golem' ? 90 : 240);
    empujar(st, m, ux, uy, m.def.molde === 'golem' ? 4 : 18);
    destello(st, m);
    if (st.red) st.red.evento({ e: 'herido', id: m.id });
    if (m.estado !== 'caza') empezarCaza(st, m);
    if (m.vida <= 0) {
      morir(st, m, por);
      if (st.red) st.red.evento({ e: 'muere', id: m.id, por: por || null });
    }
    return recibido;
  }

  function recibirTajo(st, scene, cx, cy, dir, alcance, dano, poder) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    if (!st.vivo || scene !== st.scene) return out;
    var anfitrion = !st.red || st.red.esHost();
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    st.bichos.forEach(function (m) {
      if (!m.vivo || !m.spr.visible) return;
      var my = m.y - m.def.cabeza * 0.35;
      var dx = m.x - cx, dy = my - cy, d = Math.hypot(dx, dy);
      if (d > alcance + m.def.ancho * 0.5) return;
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > (poder && poder.arco || 1.35) && d > 30) return;
      out.tocados++;
      if (anfitrion) {
        var vivoAntes = m.vivo;
        var recibido = aplicarDano(st, m, dano, dx, dy, st.red ? st.red.miId() : null);
        out.puntos.push({ x: m.x, y: my - 10, dano: recibido });
        if (vivoAntes && !m.vivo) out.muertos++;
      } else {
        // Invitado: lo ve al instante y el anfitrión resta (y dice si murió).
        out.puntos.push({ x: m.x, y: my - 10, dano: Math.min(m.vida, dano) });
        destello(st, m);
        m.heridoEn = scene.time.now;
        st.red.golpe({ id: m.id, dano: Math.round(dano * 10) / 10, ux: Math.round(dx), uy: Math.round(dy) });
      }
    });
    return out;
  }

  /** Muere. Cobra (experiencia y botín) solo quien lo mató: `por`. */
  function morir(st, m, por) {
    var scene = st.scene;
    if (!m.vivo) return;
    m.vivo = false;
    m.accion = null;
    m.vida = 0;
    m.muertoHasta = Date.now() + m.def.vuelveMs;
    if (m.barra) m.barra.setVisible(false);
    if (m.nombre) m.nombre.setVisible(false);
    onda(st, m.x, m.y, 0.9);
    m.spr.anims.stop();
    scene.tweens.add({ targets: [m.spr, m.sombra], alpha: 0, duration: 650, onComplete: function () {
      if (m.spr.scene) { m.spr.setVisible(false); m.sombra.setVisible(false); }
    } });
    var mio = st.red ? (por && st.red.soy(por)) : true;
    if (!mio) {
      if (cercaDeMi(st, m.x, m.y, 900)) aviso(scene, '⚔ The ' + m.def.nombre + ' was defeated!', 'info');
      return;
    }
    var x = m.x, y = m.y;
    api('/api/monstruos/derrotado', { tipo: m.tipo, n: m.n }).then(function (r) {
      if (!st.vivo) return;
      var d = (r && r.datos) || {};
      if (!r || !r.ok || !d.ok) {
        aviso(scene, d.error === 'demasiado_pronto'
          ? 'You defeated the ' + m.def.nombre + '! (Its treasure was already claimed — come back later.)'
          : 'You defeated the ' + m.def.nombre + '!', 'info');
        return;
      }
      aviso(scene, '🏆 You defeated the ' + m.def.nombre + '! +' + d.exp + ' XP', 'success');
      if (d.tesoroEstado === 'sin_fondos') aviso(scene, 'The reward treasury needs funds. No Bronze was created or lost.', 'info');
      if (d.tesoroEstado === 'tope_diario') aviso(scene, 'You reached today’s Bronze reward limit.', 'info');
      var total = Number(d.expTotal);
      if (Number.isFinite(total) && total > (Number(scene.nivel_exp) || 0)) {
        scene.nivel_exp = total;
        try { if (scene._nivelDesdeExp) scene._nivelDesdeExp(); } catch (e) {}
      }
      var botin = window.GFMinaSerpiente && window.GFMinaSerpiente._botin;
      if (!botin) return;
      (d.botin || []).forEach(function (b, i) {
        var a = (i / Math.max(1, d.botin.length)) * Math.PI * 2 + Math.random() * 0.5;
        var tx = x + Math.cos(a) * (40 + Math.random() * 30), ty = y + Math.sin(a) * (24 + Math.random() * 16);
        if (!libre(scene, tx, ty, 20, 10)) { tx = x; ty = y; }
        botin.crear(st, b, x, y - 30, tx, ty, Number(d.caducaMs) || 600000);
      });
    }).catch(function () {});
  }

  function revivir(st, m) {
    m.vida = m.max; m.vivo = true; m.rugio = false; m.estado = 'paseo'; m.destino = null; m.accion = null;
    m.x = m.casa.x; m.y = m.casa.y;
    desatascar(st, m);
    m.objX = m.x; m.objY = m.y;
    m.spr.setAlpha(1).setVisible(true).clearTint().setScale(m.def.escala);
    m.sombra.setAlpha(0.85).setVisible(true);
    animar(m, 'quieto');
  }

  // ─────────────────────────────────────────────────────── ESPADA ENTRE JUGADORES
  function socketDe(scene) { return scene.socket || window.globalSocket || null; }

  /** Objetivo de gf-espada.js: los jugadores de la zona PvP que caen en el tajo. */
  function tajoPvp(st, scene, cx, cy, dir, alcance, dano, poder) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    if (!st.vivo || scene !== st.scene || !scene.player) return out;
    var sock = socketDe(scene);
    var arma = window.GFEspada && window.GFEspada.equipada();
    if (!sock || !sock.connected || !arma) return out;
    // (Que los demás vean la espada moverse lo hace ya gf-espada.js con
    // 'combate:tajo', en cada tajo: ver gf-mobs-red.js.)
    if (fantasma() || typeof scene.enZonaPvp !== 'function' || !scene.enZonaPvp(scene.player.x, scene.player.y)) return out;
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    var otros = scene.otherPlayers || {};
    Object.keys(otros).forEach(function (id) {
      if (out.tocados >= 3) return;
      var o = otros[id], s = o && o.sprite;
      if (!s || !s.active || !s.visible || !scene.enZonaPvp(s.x, s.y)) return;
      var dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy);
      if (d > alcance + 30) return;
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > (poder && poder.arco || 1.35) && d > 34) return;
      sock.emit('pvp:golpe', { victima: id, arma: arma });
      out.tocados++;
      out.puntos.push({ x: s.x, y: s.y - 20 });          // el número de daño lo pone su respuesta
    });
    return out;
  }

  /** La espada de otro jugador, vista desde aquí (mismo barrido que la nuestra). */
  function verTajoRemoto(st, d) {
    var scene = st.scene, o = d && scene.otherPlayers && scene.otherPlayers[d.id];
    var s = o && o.sprite;
    if (!s || !s.active || !s.visible) return;
    var k = 'gfs_' + d.arma;
    var dir = ['left', 'right', 'up', 'down'].indexOf(d.dir) >= 0 ? d.dir : 'right';
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    var mano = { right: [14, 7], left: [-14, 7], up: [-8, 0], down: [10, 12] }[dir];
    var prof = dir === 'up' ? s.depth - 1 : s.depth + 1;
    // (2026-10-21) El arco y el bastón no barren: se ve volar la flecha o el rayo.
    var E = window.GFEspada;
    if (E && E.esDistancia && E.esDistancia(d.arma)) {
      E.dibujarDisparo(scene, s.x + mano[0], s.y + mano[1], dir, d.arma, E.ESPADAS[d.arma].alcance, prof);
      return;
    }
    var desde = ang - 1.3, hasta = ang + 1.3;
    if (dir === 'left') { desde = ang + 1.3; hasta = ang - 1.3; }
    var BASE = -Math.PI / 4;
    if (scene.textures.exists(k)) {
      var arma = efimero(st, scene.add.image(s.x + mano[0], s.y + mano[1], k).setOrigin(0.15, 0.85).setScale(2.2).setDepth(prof));
      arma.rotation = desde - BASE;
      scene.tweens.addCounter({ from: 0, to: 1, duration: 170, ease: 'Cubic.easeOut', onUpdate: function (tw) {
        if (!arma.scene) return;
        arma.setPosition(s.x + mano[0], s.y + mano[1]);
        arma.rotation = desde + (hasta - desde) * tw.getValue() - BASE;
      }, onComplete: function () { soltarEfimero(st, arma); } });
    }
    if (scene.textures.exists('gfs_tajo')) {
      var tajo = efimero(st, scene.add.image(s.x + mano[0] + Math.cos(ang) * 18, s.y + mano[1] + Math.sin(ang) * 18, 'gfs_tajo')
        .setRotation(ang).setDepth(prof + 0.5).setAlpha(0.9));
      if (window.Phaser && Phaser.BlendModes) tajo.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: tajo, alpha: 0, duration: 230, onComplete: function () { soltarEfimero(st, tajo); } });
    }
  }

  function alHerido(st, d) {
    var scene = st.scene, p = scene.player;
    if (!d || !p || !p.scene) return;
    adoptarVitales(scene, d.stats);
    if (window.GFEspada && window.GFEspada.mostrarDano) window.GFEspada.mostrarDano(scene, p.x, p.y - 64, d.dano);
    p.setTintFill(0xff7070);
    scene.time.delayedCall(110, function () { if (p.scene) p.clearTint(); });
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) empujarJugador(scene, p.x - d.x, p.y - d.y, 22);
    try { scene.cameras.main.shake(90, 0.004); } catch (e) {}
    var ahora = Date.now();
    if (ahora - st.avisoPvpEn > 4000) {
      st.avisoPvpEn = ahora;
      aviso(scene, '⚔ ' + String(d.deNombre || 'A player') + ' hit you!', 'warning');
    }
    if (d.muerto) aviso(scene, '💀 ' + String(d.deNombre || 'A player') + ' knocked you out.', 'error');
  }

  function nombreDe(scene, id) {
    if (scene.socket && id === scene.socket.id) return 'You';
    var o = scene.otherPlayers && scene.otherPlayers[id];
    return o ? String(o._displayName || 'Player') : 'Player';
  }

  function alImpacto(st, d) {
    var scene = st.scene, o = d && scene.otherPlayers && scene.otherPlayers[d.id];
    if (d && Number.isFinite(Number(d.vida))) st.vidasPvp[d.id] = { v: Number(d.vida), t: Date.now() };
    if (o && o.sprite && o.sprite.active) {
      var s = o.sprite;
      s.setTintFill(0xffffff);
      scene.time.delayedCall(80, function () { if (s.active) s.clearTint(); });
      // Quien pega ve cuánto quitó (el número lo pone el servidor).
      var sock = socketDe(scene);
      if (sock && d.de === sock.id && d.dano > 0 && window.GFEspada && window.GFEspada.mostrarDano) {
        window.GFEspada.mostrarDano(scene, s.x, s.y - 70, d.dano);
      }
    }
    if (d && d.muerto) aviso(scene, '⚔ ' + nombreDe(scene, d.de) + ' knocked out ' + nombreDe(scene, d.id) + '!', 'info');
  }

  // ── EL SOCKET Y LA VIDA DE LOS DEMÁS ─────────────────────────────────────
  /* El socket puede cambiar (reconexión, o que aún no existiera al montar):
     se mira cada segundo y se vuelve a atar. Sin esto, tras un corte no
     llegaban ni los golpes recibidos ni los montones del suelo. */
  function atarSocket(st) {
    var scene = st.scene, sock = socketDe(scene);
    if (sock === st.socket) return;
    soltarSocket(st);
    if (!sock || !sock.on) return;
    st.socket = sock;
    st.oyentes = {
      'pvp:tajo': function (d) { if (st.vivo) verTajoRemoto(st, d); },
      'pvp:herido': function (d) { if (st.vivo) alHerido(st, d); },
      'pvp:impacto': function (d) { if (st.vivo) alImpacto(st, d); },
      'pvp:vidas': function (d) {
        if (!st.vivo || !d || !d.lista) return;
        var ahora = Date.now();
        Object.keys(d.lista).forEach(function (id) { st.vidasPvp[id] = { v: Number(d.lista[id]) || 0, t: ahora }; });
      },
      'pvp:rechazado': function (d) {
        if (!st.vivo || !d) return;
        if (d.motivo === 'sin_espada') { aviso(scene, 'You need a sword in your bag to fight other players.', 'info'); return; }
        if (d.motivo === 'sin_nombre') { if (window.GFSinNombre) window.GFSinNombre.avisar(scene, 'pvp'); return; }
        var ahora = Date.now();
        if (d.motivo === 'zona' && ahora - st.avisoZonaEn > 4000) {
          st.avisoZonaEn = ahora;
          aviso(scene, '🛡 Only inside the PvP zone (west of the river) can players hit each other.', 'info');
        }
      },
      'suelo:nuevo': function (d) { if (st.vivo) ponerMonton(st, d); },
      'suelo:fuera': function (d) { if (st.vivo && d) quitarMonton(st, d.id, !!d.por); },
      'connect': function () { setTimeout(function () { if (st.vivo) cargarSuelo(st); }, 1500); }
    };
    Object.keys(st.oyentes).forEach(function (ev) { sock.on(ev, st.oyentes[ev]); });
  }
  function soltarSocket(st) {
    if (st.socket && st.oyentes) Object.keys(st.oyentes).forEach(function (ev) { try { st.socket.off(ev, st.oyentes[ev]); } catch (e) {} });
    st.socket = null; st.oyentes = null;
  }

  /**
   * LA VIDA DE LOS DEMÁS EN LA ZONA PVP (2026-10-11): "no dice la vida del
   * otro usuario". Encima de cada jugador que está al oeste del río, una
   * barra con su vida (la que dice el servidor: 'pvp:vidas' cada 2,5 s y la
   * del último impacto). Fuera de la zona, nada.
   */
  function barrasPvp(st, t) {
    var scene = st.scene, otros = scene.otherPlayers || {};
    if (typeof scene.enZonaPvp !== 'function') return;
    var alguien = false, vivos = {};
    Object.keys(otros).forEach(function (id) {
      var o = otros[id], s = o && o.sprite;
      vivos[id] = true;
      var g = st.barrasPvp[id];
      var info = st.vidasPvp[id];
      var ver = !!(s && s.active && s.visible && scene.enZonaPvp(s.x, s.y));
      if (ver) alguien = true;
      if (!ver || !info) { if (g) g.setVisible(false); return; }
      if (!g) g = st.barrasPvp[id] = scene.add.graphics();
      var v = Math.max(0, Math.min(100, info.v));
      var w = 44, x = s.x - w / 2, y = s.y - 82;
      var color = v > 60 ? 0x6fdc6a : v > 30 ? 0xf2c14e : 0xe2574c;
      g.clear().setVisible(true).setDepth((s.depth || s.y) + 3);
      g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 7);
      g.fillStyle(color, 1).fillRect(x, y, w * v / 100, 5);
    });
    // Los que se fueron: su barra fuera.
    Object.keys(st.barrasPvp).forEach(function (id) {
      if (vivos[id]) return;
      try { st.barrasPvp[id].destroy(); } catch (e) {}
      delete st.barrasPvp[id];
      delete st.vidasPvp[id];
    });
    // Pedir las vidas mientras haya alguien en la zona (el servidor frena igual).
    var sock = st.socket;
    if (alguien && sock && sock.connected && t - st.pidioVidasEn > 2500) {
      st.pidioVidasEn = t;
      sock.emit('pvp:vidas');
    }
  }

  // ─────────────────────────────────────────────────────── EL SUELO
  function imagenDeItem(scene, itemId) {
    var def = scene.ItemDefinitions && scene.ItemDefinitions[itemId];
    return def && def.src ? def.src : null;
  }
  function nombreDeItem(scene, itemId) {
    try { return (scene._getFruitDisplayNameEN && scene._getFruitDisplayNameEN(itemId)) || itemId; } catch (e) { return itemId; }
  }

  function ponerMonton(st, d) {
    var scene = st.scene;
    if (!d || !d.id || st.suelo[d.id]) return;
    var clave = 'gfsp_item_' + d.itemId;
    var reg = { id: d.id, itemId: d.itemId, cantidad: d.cantidad, x: d.x, y: d.y, recogiendo: false, objs: [] };
    st.suelo[d.id] = reg;
    /* (2026-10-27) EL NIVEL DEL OBJETO: lo que soltó otro y es de un nivel mayor
       que el tuyo sale con su nivel en rojo; el servidor no deja recogerlo. */
    var requerido = Number(d.nivel) || 1;
    var mio = !!d.de && d.de === scene.playerName;
    var miNivel = window.GFNivelesObjetos ? window.GFNivelesObjetos.nivelDeEscena(scene) : 0;
    var conCandado = !mio && requerido > 1 && miNivel > 0 && miNivel < requerido;
    var dibujar = function () {
      if (!st.vivo || st.suelo[d.id] !== reg || reg.objs.length) return;
      var sombra = scene.add.image(d.x, d.y, 'gfsv_sombra').setScale(0.7).setDepth(2.5);
      var spr = scene.add.image(d.x, d.y - 2, scene.textures.exists(clave) ? clave : 'gfsv_polvo').setOrigin(0.5, 1).setScale(2).setDepth(d.y);
      var txt = scene.add.text(d.x, d.y - spr.displayHeight - 6, '×' + d.cantidad + (conCandado ? '  Lv' + requerido : ''), {
        fontFamily: '"PressStart2P"', fontSize: '7px', color: conCandado ? '#ffb0a0' : '#ffffff', resolution: 4, stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5, 1).setDepth(d.y + 1);
      reg.flota = scene.tweens.add({ targets: spr, y: d.y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      reg.objs = [sombra, spr, txt];
    };
    if (scene.textures.exists(clave)) { dibujar(); return; }
    var src = imagenDeItem(scene, d.itemId);
    if (!src) { dibujar(); return; }
    scene.load.image(clave, src);
    var alCargar = function (k) { if (k === clave) { scene.load.off('filecomplete', alCargar); dibujar(); } };
    // Si no llega (o falla), se dibuja igual con el polvo: el montón no se pierde.
    scene.load.on('filecomplete', alCargar);
    scene.load.once('complete', function () { scene.load.off('filecomplete', alCargar); dibujar(); });
    scene.load.start();
  }

  function quitarMonton(st, id, animar_) {
    var reg = st.suelo[id];
    if (!reg) return;
    delete st.suelo[id];
    try { if (reg.flota) reg.flota.stop(); } catch (e) {}
    reg.objs.forEach(function (o) {
      if (!o || !o.scene) return;
      if (animar_) st.scene.tweens.add({ targets: o, alpha: 0, y: o.y - 30, duration: 280, onComplete: function () { o.destroy(); } });
      else o.destroy();
    });
    reg.objs = [];
  }

  function cargarSuelo(st) {
    api('/api/salvaje/suelo').then(function (r) {
      if (!st.vivo || !r || !r.ok || !r.datos) return;
      var vistos = {};
      (r.datos.lista || []).forEach(function (d) { vistos[d.id] = true; ponerMonton(st, d); });
      Object.keys(st.suelo).forEach(function (id) { if (!vistos[id]) quitarMonton(st, id, false); });
    }).catch(function () {});
  }

  /** Mete en la bolsa la factura que acaba de acuñar el servidor. */
  function meterFactura(scene, itemId, f) {
    var S = scene.STATE;
    if (!S || !f) return;
    var id = Number(f.invoiceId), cantidad = Math.max(1, Number(f.cantidad) || 1);
    var listas = [S.slots || [], S.quickSlots || []];
    for (var a = 0; a < listas.length; a++) {
      for (var i = 0; i < listas[a].length; i++) {
        if (listas[a][i] && Number(listas[a][i].idx) === id) {
          listas[a][i].count = cantidad; listas[a][i].id = itemId; listas[a][i].idm = f.manualId;
          try { scene.renderAllSlots(); } catch (e) {}
          try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
          return;
        }
      }
    }
    var nuevo = { id: itemId, idx: id, idm: f.manualId, count: cantidad };
    var g = S.ghostSlots || {};
    var hueco = function (lista, fantasmas) {
      for (var j = 0; j < lista.length; j++) if (lista[j] === null && !(fantasmas && fantasmas[j])) return j;
      return -1;
    };
    var k = hueco(S.slots || [], g.inv);
    if (k >= 0) S.slots[k] = nuevo;
    else if ((k = hueco(S.quickSlots || [], g.quick)) >= 0) S.quickSlots[k] = nuevo;
    else aviso(scene, 'Your bag is full: it will appear when you come back.', 'warning');
    try { scene.renderAllSlots(); } catch (e) {}
    try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  /** Resta de la bolsa lo que el servidor ya quemó. */
  function sacarFactura(scene, gastado) {
    var S = scene.STATE;
    if (!S || !gastado) return;
    var id = Number(gastado.invoiceId), quedan = Math.max(0, Number(gastado.cantidadRestante) || 0);
    ['slots', 'quickSlots'].forEach(function (lista) {
      var L = S[lista];
      if (!Array.isArray(L)) return;
      for (var i = 0; i < L.length; i++) {
        if (L[i] && Number(L[i].idx) === id) L[i] = quedan > 0 ? Object.assign(L[i], { count: quedan }) : null;
      }
    });
    try { scene.renderAllSlots(); } catch (e) {}
    try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  /** Tenue mientras el servidor contesta (no se vuelve a pisar); normal si no se lo lleva. */
  function atenuarMonton(reg, a) {
    (reg.objs || []).forEach(function (o) { try { if (o && o.scene) o.setAlpha(a); } catch (e) {} });
  }

  // Un montón que la cadena devolvió no se vuelve a coger hasta pasado un rato
  // (si sigues encima, no se reintenta en bucle).
  var ESPERA_RECOGER = {};
  function recogerCercanos(st, pj) {
    var ahora = Date.now();
    Object.keys(st.suelo).forEach(function (id) {
      var reg = st.suelo[id];
      if (reg.recogiendo || Math.hypot(pj.x - reg.x, pj.y - reg.y) > 40 || fantasma()) return;
      if (ESPERA_RECOGER[id] && ahora < ESPERA_RECOGER[id]) return;
      // (2026-10-19) Sin nombre no se recoge nada (gf-sin-nombre.js): se avisa
      // y el montón se queda donde está (sin reintentar a cada paso).
      if (window.GFSinNombre && !window.GFSinNombre.exigir(st.scene, 'loot')) { ESPERA_RECOGER[id] = ahora + 5000; return; }
      reg.recogiendo = true;
      atenuarMonton(reg, 0.45);
      recogerUno(st, id, 0);
    });
  }

  /* SE TOMA AL PISARLO (2026-10-19): "paso por encima y tarda mucho en
     tomarlo; quiero que lo tome y que las transacciones se hagan en cola".
     Con la cola (gf-cola-cadena.js) el servidor contesta en cuanto lo
     reserva: el montón se va y sale el "+N" ya; el objeto entra en la bolsa
     cuando la cadena lo acuña ('suelo:acunado'). Si la cadena falla, el
     servidor devuelve el montón a la sala ('suelo:nuevo'). Si el servidor aún
     te ve lejos (la red va con retraso), se reintenta solo un par de veces. */
  function recogerUno(st, id, intento) {
    var cola = window.GFColaCadena;
    var t = cola ? cola.ticket() : null;
    api('/api/salvaje/recoger', t ? { id: id, ticket: t } : { id: id }).then(function (r) {
        var d = (r && r.datos) || {};
        if (d.ok && d.pendiente && cola) {
          if (st.vivo) {
          aviso(st.scene, '+' + d.cantidad + ' ' + nombreDeItem(st.scene, d.itemId) + (d.deNombre ? ' (dropped by ' + d.deNombre + ')' : ''), 'success');
          try { st.scene.playSFX && st.scene.playSFX('item_pickup'); } catch (e) {}
          quitarMonton(st, id, true);
          }
          cola.esperar(d.ticket || t, {
            alOk: function (dd, sc) { if (sc && dd.factura) meterFactura(sc, dd.itemId, dd.factura); },
            alFallo: function (dd, sc) {
              ESPERA_RECOGER[id] = Date.now() + 4000;
              if (sc) aviso(sc, dd.message || 'Could not pick it up: it is back on the ground.', 'warning');
            }
          }, st.scene);
          return;
        }
        if (!st.vivo) return;
        if (d.motivo === 'lejos' && intento < 3 && st.suelo[id]) {
          setTimeout(function () { if (st.vivo && st.suelo[id]) recogerUno(st, id, intento + 1); }, 450);
          return;
        }
        if (st.suelo[id]) atenuarMonton(st.suelo[id], 1);
        if (d.ok && d.factura) {
          meterFactura(st.scene, d.itemId, d.factura);
          aviso(st.scene, '+' + d.cantidad + ' ' + nombreDeItem(st.scene, d.itemId) + (d.deNombre ? ' (dropped by ' + d.deNombre + ')' : ''), 'success');
          try { st.scene.playSFX && st.scene.playSFX('item_pickup'); } catch (e) {}
          quitarMonton(st, id, true);
        } else if (d.motivo === 'no_existe' || d.motivo === 'otra_sala') {
          quitarMonton(st, id, false);
        } else if (d.motivo === 'nivel') {
          // (2026-10-27) Por debajo del nivel del objeto: se avisa y no se insiste (30 s) aunque sigas encima.
          ESPERA_RECOGER[id] = Date.now() + 30000;
          if (st.suelo[id]) st.suelo[id].recogiendo = false;
          aviso(st.scene, d.message || ('You need level ' + d.nivelRequerido + ' to pick this up.'), 'warning');
        } else {
          // Lejos para el servidor (la red va con retraso) o la cadena ocupada:
          // se vuelve a intentar al volver a pisarlo, sin insistir en bucle.
          setTimeout(function () { if (st.suelo[id]) st.suelo[id].recogiendo = false; }, 1500);
          if (d.message) aviso(st.scene, d.message, 'warning');
        }
      }).catch(function () {
        if (st.suelo[id]) atenuarMonton(st.suelo[id], 1);
        setTimeout(function () { if (st.suelo[id]) st.suelo[id].recogiendo = false; }, 1500);
      });
  }

  function cerrarDialogo(st) {
    if (st.dialogo && st.dialogo.parentNode) st.dialogo.parentNode.removeChild(st.dialogo);
    st.dialogo = null;
    if (st.onEscDialogo) { document.removeEventListener('keydown', st.onEscDialogo, true); st.onEscDialogo = null; }
  }

  /** "¿Soltar esto aquí?" — soltar quema lo soltado: se pregunta antes. */
  /* SOLTAR VARIOS, EN COLA (2026-10-19): "cuando quiero soltar un objeto se
     tarda mucho; quiero soltar varios y que las transacciones se hagan en
     cola". El cuadro se cierra al pulsar Drop: el objeto sale de la bolsa ya,
     en el suelo queda un montón provisional (tenue, con ⏳) y la quema va a la
     cola del jugador en el servidor (gf-cola-cadena.js). Cuando la cadena
     confirma ('suelo:soltado') pasa a ser el montón de verdad; si dice que no
     ('suelo:soltar_fallido'), el objeto vuelve a la bolsa. Y "Don't ask again"
     deja soltar sin cuadro durante la sesión. */
  var SIN_PREGUNTAR = 'gf_soltar_sin_preguntar';
  function sinPreguntar() { try { return sessionStorage.getItem(SIN_PREGUNTAR) === '1'; } catch (e) { return false; } }

  /** Saca de la bolsa la casilla de esa factura; devuelve con qué volver a ponerla. */
  function sacarDeBolsa(scene, idx) {
    var S = scene.STATE;
    if (!S) return null;
    var listas = ['slots', 'quickSlots'];
    for (var a = 0; a < listas.length; a++) {
      var L = S[listas[a]];
      if (!Array.isArray(L)) continue;
      for (var i = 0; i < L.length; i++) {
        if (L[i] && Number(L[i].idx) === Number(idx)) {
          var copia = { lista: listas[a], i: i, obj: Object.assign({}, L[i]) };
          L[i] = null;
          try { scene.renderAllSlots(); } catch (e) {}
          return copia;
        }
      }
    }
    return null;
  }
  /** La vuelve a poner (en su sitio si sigue libre). `cuenta` cambia lo que tenía. */
  function devolverABolsa(scene, copia, cuenta) {
    var S = scene && scene.STATE;
    if (!S || !copia) return;
    var obj = Object.assign({}, copia.obj);
    if (cuenta !== undefined) obj.count = cuenta;
    var listas = [S.slots || [], S.quickSlots || []];
    for (var a = 0; a < listas.length; a++) {
      for (var i = 0; i < listas[a].length; i++) {
        if (listas[a][i] && Number(listas[a][i].idx) === Number(obj.idx)) {      // ya volvió (la cadena)
          listas[a][i].count = obj.count;
          try { scene.renderAllSlots(); } catch (e) {}
          return;
        }
      }
    }
    var L = S[copia.lista];
    if (Array.isArray(L) && L[copia.i] === null) L[copia.i] = obj;
    else {
      var k = (S.slots || []).indexOf(null);
      if (k >= 0) S.slots[k] = obj;
      else if ((k = (S.quickSlots || []).indexOf(null)) >= 0) S.quickSlots[k] = obj;
    }
    try { scene.renderAllSlots(); } catch (e) {}
    try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }
  /** El montón provisional: tenue y con ⏳, hasta que la cadena confirme. */
  function ponerProvisional(st, itemId, cantidad, x, y) {
    var scene = st.scene, clave = 'gfsp_item_' + itemId;
    var prov = { objs: [] };
    var dibujar = function () {
      if (!st.vivo || prov.quitado || prov.objs.length) return;
      var spr = scene.add.image(x, y - 2, scene.textures.exists(clave) ? clave : 'gfsv_polvo').setOrigin(0.5, 1).setScale(2).setDepth(y).setAlpha(0.55);
      var txt = scene.add.text(x, y - spr.displayHeight - 6, '×' + cantidad + ' ⏳', {
        fontFamily: '"PressStart2P"', fontSize: '7px', color: '#ffe9a8', resolution: 4, stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5, 1).setDepth(y + 1);
      prov.objs = [spr, txt];
    };
    if (scene.textures.exists(clave)) { dibujar(); return prov; }
    var src = imagenDeItem(scene, itemId);
    if (!src) { dibujar(); return prov; }
    scene.load.image(clave, src);
    var alCargar = function (k) { if (k === clave) { scene.load.off('filecomplete', alCargar); dibujar(); } };
    scene.load.on('filecomplete', alCargar);
    scene.load.once('complete', function () { scene.load.off('filecomplete', alCargar); dibujar(); });
    scene.load.start();
    return prov;
  }
  function quitarProvisional(prov) {
    if (!prov) return;
    prov.quitado = true;
    prov.objs.forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    prov.objs = [];
  }

  function soltarEnCola(st, sel, x, y) {
    var scene = st.scene, cola = window.GFColaCadena;
    var nombre = nombreDeItem(scene, sel.id);
    var t = cola ? cola.ticket() : null;
    var copia = sacarDeBolsa(scene, sel.idx);
    if (!copia) { aviso(scene, 'That item is not in your bag anymore.', 'info'); return; }
    var prov = ponerProvisional(st, sel.id, sel.count, x, y);
    var bien = function (d, sc) {
      quitarProvisional(prov);
      var g = d.gastado;
      if (sc) {
        if (g && Number(g.invoiceId) === Number(copia.obj.idx)) {
          if (Number(g.cantidadRestante) > 0) devolverABolsa(sc, copia, Number(g.cantidadRestante));
        } else {
          devolverABolsa(sc, copia);                 // se quemó otra factura del mismo objeto: la nuestra sigue
          if (g) sacarFactura(sc, g);
        }
        var stv = sc.__gfSalvaje;
        if (stv && stv.vivo && d.monton) ponerMonton(stv, d.monton);
        aviso(sc, 'You dropped ' + (d.monton ? d.monton.cantidad : sel.count) + ' × ' + nombre + '.', 'success');
      }
    };
    var mal = function (d, sc) {
      quitarProvisional(prov);
      if (sc) {
        devolverABolsa(sc, copia);
        aviso(sc, (d && d.message) || 'Could not drop it: it is back in your bag.', 'warning');
      }
    };
    if (cola) cola.esperar(t, { alOk: bien, alFallo: mal, alCaducar: function () { quitarProvisional(prov); } }, scene);
    api('/api/salvaje/soltar', { itemId: sel.id, invoiceId: sel.idx, cantidad: sel.count, x: Math.round(x), y: Math.round(y), ticket: t || undefined })
      .then(function (r) {
        var d = (r && r.datos) || {};
        if (r && r.ok && d.ok && d.pendiente) return;                 // en la cola: llega por el socket
        // Un servidor de antes (contesta con todo) o un "no" de entrada.
        var resolver = cola && cola._interno && cola._interno.resolver;
        if (r && r.ok && d.ok && d.monton) {
          if (resolver && t) resolver('suelo:soltado', Object.assign({ ticket: t }, d)); else bien(d, scene);
        } else if (resolver && t) {
          resolver('suelo:soltar_fallido', { ticket: t, message: d.message });
        } else mal(d, scene);
      }).catch(function () {
        // Sin respuesta: no se sabe si se quemó. Que lo diga la cadena en unos segundos.
        if (cola && t) cola.caducarEn(t, 8000); else mal({}, scene);
      });
  }

  function confirmarSoltar(st, sel, x, y) {
    var scene = st.scene;
    cerrarDialogo(st);
    if (sinPreguntar()) { soltarEnCola(st, sel, x, y); return; }
    var nombre = nombreDeItem(scene, sel.id);
    var caja = document.createElement('div');
    caja.id = 'gf-soltar';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Drop item');
    caja.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10060;' +
      'width:min(320px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border-radius:12px;' +
      'background:rgba(20,26,22,.96);border:2px solid #8fbf6a;color:#f2f7ea;font:600 14px/1.35 system-ui,sans-serif;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:center';
    var t = document.createElement('div');
    t.textContent = 'Drop ' + sel.count + ' × ' + nombre + ' here?';
    var sub = document.createElement('div');
    sub.style.cssText = 'margin:6px 0 14px;font-weight:400;font-size:12px;opacity:.85';
    sub.textContent = 'Anyone can pick it up. Items left on the ground vanish after 10 minutes.';
    var marca = document.createElement('label');
    marca.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;margin:0 0 12px;font-weight:400;font-size:12px;cursor:pointer';
    var caja2 = document.createElement('input');
    caja2.type = 'checkbox';
    marca.appendChild(caja2);
    marca.appendChild(document.createTextNode("Don't ask again this session"));
    var fila = document.createElement('div');
    fila.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';
    var si = document.createElement('button'), no = document.createElement('button');
    si.type = no.type = 'button';
    si.textContent = 'Drop'; no.textContent = 'Cancel';
    [si, no].forEach(function (b, i) {
      b.style.cssText = 'min-width:110px;min-height:40px;padding:8px 14px;border-radius:8px;cursor:pointer;font:700 14px system-ui,sans-serif;' +
        (i === 0 ? 'background:#6fa84a;color:#fff;border:1px solid #9fd27a' : 'background:transparent;color:#e6efe0;border:1px solid #6c7d63');
    });
    fila.appendChild(si); fila.appendChild(no);
    caja.appendChild(t); caja.appendChild(sub); caja.appendChild(marca); caja.appendChild(fila);
    document.body.appendChild(caja);
    st.dialogo = caja;
    no.addEventListener('click', function () { cerrarDialogo(st); });
    st.onEscDialogo = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrarDialogo(st); }
      else if (e.key === 'Enter' && document.activeElement !== no) { e.stopPropagation(); e.preventDefault(); si.click(); }
    };
    document.addEventListener('keydown', st.onEscDialogo, true);
    si.addEventListener('click', function () {
      try { if (caja2.checked) sessionStorage.setItem(SIN_PREGUNTAR, '1'); } catch (e) {}
      cerrarDialogo(st);
      if (st.vivo) soltarEnCola(st, sel, x, y);
    });
    try { si.focus(); } catch (e) {}
  }

  /** Clic en el mapa con un objeto de la bolsa en la mano: soltarlo ahí. */
  function alClicMundo(st, pointer) {
    var scene = st.scene, S = scene.STATE;
    if (!S || !S.selectedItem || !S.selectedItem.isGhost || pointer.button !== 0) return;
    // La antorcha no se suelta: se CLAVA (gf-antorchas.js se encarga).
    if (S.selectedItem.id === 'antorcha') return;
    // (2026-10-21) El bote se pone en el agua y la pala lo recoge (gf-botes.js).
    if (S.selectedItem.id === 'bote' || S.selectedItem.id === 'pala_construccion') return;
    var canvas = scene.sys.canvas, ev = pointer.event;
    if (!ev || !(ev.target === canvas || canvas.contains(ev.target))) return;
    try { if ((scene.input.hitTestPointer(pointer) || []).length) return; } catch (e) {}   // sobre el personaje o un botón
    var sel = { id: S.selectedItem.id, count: S.selectedItem.count, idx: S.selectedItem.idx };
    var w = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // El objeto vuelve a su casilla (la bolsa no cambia hasta que el servidor confirme).
    try { scene.clearSelectedItem(); } catch (e) {}
    if (!SOLTABLES[sel.id]) { aviso(scene, 'This item can’t be dropped on the ground (tools that wear out stay in your bag).', 'info'); return; }
    // (2026-10-20) Soltar cosas para que otros las cojan pide VIP (gf-vip.js).
    if (window.GFVip && !window.GFVip.exigir(scene, 'drop')) return;
    if (sel.idx === undefined || sel.idx === null) { aviso(scene, 'That item is still being saved. Try again in a moment.', 'info'); return; }
    if (fantasma()) return;
    var p = scene.player;
    // Lejos del personaje: a sus pies.
    if (Math.hypot(w.x - p.x, w.y - (p.y + 45)) > 220) { w = { x: p.x, y: p.y + 45 }; }
    confirmarSoltar(st, sel, w.x, w.y);
  }

  // ─────────────────────────────────────────────────────── ZONA Y CARTELES
  function vigilarZona(st) {
    var scene = st.scene, p = scene.player;
    if (!p || typeof scene.enZonaPvp !== 'function') return;
    var pvp = scene.enZonaPvp(p.x, p.y);
    if (pvp === st.enPvp) return;
    var primera = st.enPvp === null;
    st.enPvp = pvp;
    if (pvp) aviso(scene, '⚔ PvP zone — other players can hit you with their swords here.', 'warning');
    else if (!primera) aviso(scene, '🛡 Neutral zone — no PvP here.', 'success');
  }

  function ponerCarteles(st) {
    var scene = st.scene;
    var capa = scene.map && scene.map.getObjectLayer('carteles');
    if (!capa || !scene.textures.exists('gfm_cartel')) return;
    capa.objects.forEach(function (o) {
      var prop = (o.properties || []).find(function (p) { return p.name === 'texto'; });
      var texto = prop ? String(prop.value) : '';
      var img = scene.add.image(o.x, o.y, 'gfm_cartel').setOrigin(0.5, 1).setScale(2).setDepth(o.y);
      var txt = scene.add.text(o.x, o.y - 64, texto, {
        fontFamily: '"PressStart2P"', fontSize: '7px', color: '#fff3d6', resolution: 4, stroke: '#2a1a0c', strokeThickness: 4,
        align: 'center', wordWrap: { width: 150 }
      }).setOrigin(0.5, 1).setDepth(o.y + 1);
      st.carteles.push(img, txt);
    });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.map || scene.__gfSalvaje) return;
    var st = {
      scene: scene, vivo: true, bichos: [], porId: {}, red: null, proyectiles: [], charcos: [], efimeros: [], botin: [],
      vidasPvp: {}, barrasPvp: {}, pidioVidasEn: 0, socketMiradoEn: 0, avisoZonaEn: 0,
      suelo: {}, carteles: [], ultimoGolpe: 0, avisoPvpEn: 0, enPvp: null, dialogo: null, socket: null
    };
    scene.__gfSalvaje = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    texturasSueltas(scene);
    texturasPoderes(scene);
    // Los montones del botín y su brillo (la serpiente los presta).
    if (window.GFMinaSerpiente && window.GFMinaSerpiente._botin) window.GFMinaSerpiente._botin.texturas(scene);

    // ── La espada contra jugadores y los avisos de la sala ──
    st.objetivoPvp = function (sc, cx, cy, dir, alcance, dano, poder) { return tajoPvp(st, sc, cx, cy, dir, alcance, dano, poder); };
    if (window.GFEspada && window.GFEspada.agregarObjetivo) window.GFEspada.agregarObjetivo(st.objetivoPvp);
    atarSocket(st);
    // Lo que ya había en el suelo (después del joinRoom: la sala tiene que saber que estás).
    st.relojSuelo = setTimeout(function () { if (st.vivo) cargarSuelo(st); }, 1500);
    st.onClic = function (pointer) { if (st.vivo) alClicMundo(st, pointer); };
    if (scene.input) scene.input.on('pointerdown', st.onClic);

    // ── Los monstruos (cuando lleguen sus dibujos) ──
    var A = window.GFMonstruosArte;
    // (2026-10-18) Solo el arte de las especies que tiene ESTE mapa (el
    // salvaje pide lo de siempre) y sus proyectiles.
    var capaM = scene.map.getObjectLayer('monstruos');
    var artes = {}, texs = { gfm_cartel: true };
    // (2026-10-20) El jefe de este mapa (gf-jefes.js): su guarida, igual en todos.
    var jefe = null;
    try { jefe = window.GFJefes ? window.GFJefes.puesto(scene) : null; } catch (e) { jefe = null; }
    ((capaM ? capaM.objects : []).concat(jefe ? [{ name: jefe.tipo }] : [])).forEach(function (o) {
      var d = ESPECIES[o.name];
      if (!d) return;
      artes[d.arte] = true;
      ({ golem: ['roca'], lobo: [], arana: ['espina', 'savia'], brujo: ['rayo'] }[d.molde] || []).forEach(function (q) {
        texs[(d.tex && d.tex[q]) || TEX_BASE[q]] = true;
      });
      // (2026-10-25) Y lo que piden sus poderes propios.
      (d.poderes || []).forEach(function (pd) {
        (PODER_TEX[pd] || []).forEach(function (q) { texs[(d.tex && d.tex[q]) || TEX_BASE[q]] = true; });
      });
    });
    var arte = A ? A.cargar(scene, Object.keys(artes), Object.keys(texs)) : Promise.resolve(false);
    arte.then(function (ok) {
      if (!st.vivo || scene.__gfSalvaje !== st) return;
      if (!ok) console.warn('[salvaje] faltan dibujos de Game/Sprites/monstruos: algunos monstruos no saldrán');
      ponerCarteles(st);
      var capa = scene.map.getObjectLayer('monstruos');
      var cuenta = {};
      // El número de cada uno es su orden en la capa del mapa: el mismo en
      // todos los navegadores (así se entienden por la red).
      (capa ? capa.objects : []).forEach(function (o, id) {
        var tipo = o.name;
        if (!ESPECIES[tipo]) return;
        var n = cuenta[tipo] = (cuenta[tipo] === undefined ? 0 : cuenta[tipo] + 1);
        var m = crear(st, { x: o.x, y: o.y }, tipo, n, id);
        if (m) { st.bichos.push(m); st.porId[id] = m; }
      });
      if (jefe && ESPECIES[jefe.tipo]) {
        var mj = crear(st, { x: jefe.x, y: jefe.y }, jefe.tipo, 0, jefe.id);
        if (mj) {
          st.bichos.push(mj); st.porId[jefe.id] = mj;
          try { window.GFJefes.decorar(st, mj, apiJefe()); } catch (e) { console.warn('[salvaje] jefe:', e); }
        }
      }
      // Compartidos con los demás de la sala (gf-mobs-red.js).
      if (window.GFMobsRed) {
        st.red = window.GFMobsRed.crear(scene, 'salvaje', {
          exportar: function () { return exportar(st); },
          importar: function (l) { if (st.vivo) importar(st, l); },
          alEvento: function (d) { if (st.vivo) alEvento(st, d); },
          alGolpe: function (d) {
            var m = st.porId[d.id];
            if (st.vivo && m && m.vivo) aplicarDano(st, m, Math.min(250, Number(d.dano) || 0), Number(d.ux) || 0, Number(d.uy) || 0, d.de);
          },
          alCambiarHost: function (soyYo) { if (st.vivo) alCambiarHost(st, soyYo); }
        });
      }
      st.objetivo = function (sc, cx, cy, dir, alcance, dano, poder) { return recibirTajo(st, sc, cx, cy, dir, alcance, dano, poder); };
      if (window.GFEspada && window.GFEspada.agregarObjetivo) window.GFEspada.agregarObjetivo(st.objetivo);
    });
    st.onUpdate = function (t, d) {
      if (!st.vivo) return;
      actualizar(st, t, d);
      if (st.jefe && window.GFJefes) { try { window.GFJefes.tic(st, t, Math.min(0.05, (d || 16) / 1000)); } catch (e) {} }
      if (scene.player) recogerCercanos(st, pies(scene));
      vigilarZona(st);
      if (t - st.socketMiradoEn > 1000) { st.socketMiradoEn = t; atarSocket(st); }
      barrasPvp(st, t);
    };
    scene.events.on('update', st.onUpdate);
  }

  function desmontar(scene) {
    var st = scene && scene.__gfSalvaje;
    if (!st) return;
    st.vivo = false;
    try { if (window.GFJefes) window.GFJefes.desmontar(st); } catch (e) {}
    clearTimeout(st.relojSuelo);
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (scene.input && st.onClic) scene.input.off('pointerdown', st.onClic);
    if (window.GFEspada) {
      if (st.objetivo) window.GFEspada.quitarObjetivo(st.objetivo);
      if (st.objetivoPvp) window.GFEspada.quitarObjetivo(st.objetivoPvp);
    }
    soltarSocket(st);
    Object.keys(st.barrasPvp).forEach(function (id) { try { st.barrasPvp[id].destroy(); } catch (e) {} });
    st.barrasPvp = {};
    st.vidasPvp = {};
    if (st.red) { st.red.cerrar(); st.red = null; }
    st.porId = {};
    cerrarDialogo(st);
    st.bichos.forEach(function (m) {
      try { if (m.spr.scene) scene.tweens.killTweensOf(m.spr); } catch (e) {}
      [m.spr, m.sombra, m.barra, m.nombre].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.bichos.length = 0;
    st.proyectiles.forEach(function (b) { try { b.spr.destroy(); } catch (e) {} });
    st.proyectiles.length = 0;
    st.charcos.length = 0;
    st.efimeros.slice().forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    st.efimeros.length = 0;
    Object.keys(st.suelo).forEach(function (id) { quitarMonton(st, id, false); });
    st.carteles.forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    st.carteles.length = 0;
    if (window.GFMinaSerpiente && window.GFMinaSerpiente._botin) window.GFMinaSerpiente._botin.limpiar(st);
    if (scene._frenoHasta) scene._frenoHasta = 0;
    scene.__gfSalvaje = null;
  }

  window.GFSalvaje = {
    montar: montar,
    desmontar: desmontar,
    _interno: {
      ESPECIES: ESPECIES, SOLTABLES: SOLTABLES, estado: function (s) { return s && s.__gfSalvaje; },
      empujarJugador: empujarJugador, recibirTajo: recibirTajo, tajoPvp: tajoPvp, ritmo: ritmo, libre: libre
    }
  };
})();
