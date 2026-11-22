/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * EL CONTINENTE DEL ESTE — Scenes/ReinosScenes.js                 (2026-11-21)
 *
 * "Quiero 7 mapas nuevos; cada mapa con su nivel de desbloqueo, sus NPC con
 * sus nombres, animales y enemigos 2.5D nuevos, un monstruo por mapa, zonas
 * PvP y neutrales, botes y agua como en GameScene... y uno de ellos es un
 * pueblo lejos, con casas, NPC y una tienda."
 *
 *   · PuertoScene  (mundo 13, nivel 11) SALTWIND HARBOR: el pueblo del puerto,
 *                  lejos al este (se llega en ferri desde el pueblo o por el
 *                  mapa del mundo). PvP solo en la cala de los contrabandistas.
 *   · PantanoScene (mundo 14, nivel 12) MIREFEN BOG: charcas y chozas en zancos.
 *   · AldorScene   (mundo 15, nivel 13) SUNKEN RUINS OF ALDOR: la plaza en ruinas.
 *   · ColinasScene (mundo 16, nivel 14) AMBERLEAF HIGHLANDS: otoño, lagos, granja.
 *   · SelvaScene   (mundo 17, nivel 15) EMERALD JUNGLE: el río, la aldea, el templo.
 *   · VolcanScene  (mundo 18, nivel 16) EMBERFALL CALDERA: ríos de lava y termas.
 *   · HongosScene  (mundo 19, nivel 17) GLOWCAP HOLLOW: setas gigantes que brillan.
 *
 * LOS MAPAS (tools/generar-reinos.py): 313 x 313 casillas de 16 = 5008 px, el
 * suelo pintado en 25 trozos (recortadas_<zona>), el agua del pueblo que se
 * mueve (gf-agua) y los objetos 2.5D con su apoyo (Game/MAPAS/<zona>). Todo lo
 * demás es lo de los otros mapas: ZonaScene (Scenes/ZonasScenes.js) monta el
 * HUD, los monstruos (gf-salvaje), los NPC (gf-npcs), el bote (gf-botes), la
 * fauna (gf-fauna-zonas), las luces y los viajes (gf-zonas); lo propio de cada
 * uno de estos siete (el faro, la bruma de la ciénaga, las hojas de otoño, la
 * ceniza y las brasas, las esporas de luz...) va en gf-reinos.js.
 *
 * `sinNieve`: en las ruinas, la selva y la hondonada el tiempo del pueblo
 * llega como LLUVIA cuando allí nieva (gf-clima pinta y gf-audio suena lluvia,
 * y no se monta la nieve que cuaja). La caldera no lleva el tiempo del pueblo
 * (`clima: false`): su ceniza y sus temblores son suyos.
 * ============================================================================
 */

/* global ZonaScene, cfgZona */

const REINOS_V = '20261121a';   // la versión de los mapas, sus atlas y sus árboles (?v=)

function cfgReino(zona, extra) {
  return cfgZona(zona, Object.assign({ version: REINOS_V, reino: true }, extra));
}

// eslint-disable-next-line no-unused-vars
class PuertoScene extends ZonaScene {
  static get CFG() {
    return PuertoScene._cfg || (PuertoScene._cfg = cfgReino('puerto', {
      escena: 'PuertoScene', mundo: 13, sala: 'puerto', titulo: 'Saltwind Harbor — the far eastern port town',
      arboles: ['jacaranda', 'pino_costero', 'tilo_costero'],
      vidaAgua: 'mar', pisadas: null, clima: true
    }));
  }
  constructor() { super('PuertoScene'); }
}

// eslint-disable-next-line no-unused-vars
class PantanoScene extends ZonaScene {
  static get CFG() {
    return PantanoScene._cfg || (PantanoScene._cfg = cfgReino('pantano', {
      escena: 'PantanoScene', mundo: 14, sala: 'pantano', titulo: 'Mirefen Bog — beware the toxic fumes',
      arboles: ['aliso_negro', 'cipres_calvo', 'manglar'],
      vidaAgua: 'rio', pisadas: 'barro', clima: true
    }));
  }
  constructor() { super('PantanoScene'); }
}

// eslint-disable-next-line no-unused-vars
class AldorScene extends ZonaScene {
  static get CFG() {
    return AldorScene._cfg || (AldorScene._cfg = cfgReino('aldor', {
      escena: 'AldorScene', mundo: 15, sala: 'aldor', titulo: 'Sunken Ruins of Aldor',
      arboles: ['higuera_raices', 'laurel', 'olivo_antiguo'],
      vidaAgua: 'rio', pisadas: 'arena', clima: true, sinNieve: true
    }));
  }
  constructor() { super('AldorScene'); }
}

// eslint-disable-next-line no-unused-vars
class ColinasScene extends ZonaScene {
  static get CFG() {
    return ColinasScene._cfg || (ColinasScene._cfg = cfgReino('colinas', {
      escena: 'ColinasScene', mundo: 16, sala: 'colinas', titulo: 'Amberleaf Highlands',
      arboles: ['arce_rojo', 'ginkgo', 'haya_cobre', 'roble_ambar'],
      vidaAgua: 'rio', pisadas: null, clima: true
    }));
  }
  constructor() { super('ColinasScene'); }
}

// eslint-disable-next-line no-unused-vars
class SelvaScene extends ZonaScene {
  static get CFG() {
    return SelvaScene._cfg || (SelvaScene._cfg = cfgReino('selva', {
      escena: 'SelvaScene', mundo: 17, sala: 'selva', titulo: 'Emerald Jungle',
      arboles: ['ceiba', 'helecho_arboreo', 'platanera'],
      vidaAgua: 'rio', pisadas: 'barro', clima: true, sinNieve: true
    }));
  }
  constructor() { super('SelvaScene'); }
}

// eslint-disable-next-line no-unused-vars
class VolcanScene extends ZonaScene {
  static get CFG() {
    return VolcanScene._cfg || (VolcanScene._cfg = cfgReino('volcan', {
      escena: 'VolcanScene', mundo: 18, sala: 'volcan', titulo: 'Emberfall Caldera — the ground runs hot',
      arboles: ['arbol_carbonizado', 'arbusto_brasa', 'pino_ceniza'],
      // Las termas: agua caliente, sin peces que se vean nadar ni hojas flotando.
      vidaAgua: null, sinHojas: true, pisadas: 'ceniza', clima: false
    }));
  }
  constructor() { super('VolcanScene'); }
}

// eslint-disable-next-line no-unused-vars
class HongosScene extends ZonaScene {
  static get CFG() {
    return HongosScene._cfg || (HongosScene._cfg = cfgReino('hongos', {
      escena: 'HongosScene', mundo: 19, sala: 'hongos', titulo: 'Glowcap Hollow',
      arboles: ['seta_campana', 'seta_paraguas', 'seta_torre'],
      // Bajo las setas nunca es pleno día: la luz la ponen ellas (gf-ciclo-dia).
      vidaAgua: 'rio', sinHojas: true, pisadas: 'musgo', clima: true, sinNieve: true,
      oscuridad: 0.3
    }));
  }
  constructor() { super('HongosScene'); }
}

window.PuertoScene = PuertoScene;
window.PantanoScene = PantanoScene;
window.AldorScene = AldorScene;
window.ColinasScene = ColinasScene;
window.SelvaScene = SelvaScene;
window.VolcanScene = VolcanScene;
window.HongosScene = HongosScene;
