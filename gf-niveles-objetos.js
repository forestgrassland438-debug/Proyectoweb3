/* ===========================================================================
 * gf-niveles-objetos.js — EL NIVEL DE CADA OBJETO                  (2026-10-27)
 * ===========================================================================
 *
 * "Todos los objetos de la tienda que se pueden comprar tienen un nivel
 * específico, justo. Si uno de nivel 12 compra algo de nivel 11 y se lo suelta
 * a uno de nivel 2, ese no lo puede recoger. Si siembro una semilla de nivel 4,
 * su cosecha también es de nivel 4. Lo mismo con lo crafteado, lo de
 * construcción y lo que sueltan los monstruos."
 *
 * La MISMA tabla que GF_NIVEL_OBJETO de server2.js (un test lo vigila:
 * tools/niveles-objetos.test.cjs). Quien manda es el servidor: al recoger del
 * suelo (/api/salvaje/recoger) y en el mercado P2P. Aquí:
 *   · la tienda bloquea la compra por debajo del nivel (nivelRequerido);
 *   · el suelo enseña el candado y no insiste en recoger lo que no se puede.
 * Va acompasada con los mapas (gf-niveles-mapas.js): lo de la mina desde el 2,
 * lo del salvaje desde el 4… Lo que no está en la tabla es de nivel 1.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFNivelesObjetos) return;

  var TABLA = Object.freeze({
    ...(window.GFPlantCatalog?.levels || {}),
    // Semillas y su cosecha (la cosecha, el nivel de su semilla)
    Semillax: 1, zanahoria_buena: 1, zanahoria_corta: 1, zanahoria_mala: 1,
    Semillax4: 3, fresa_buena: 3, fresa_corta: 3, fresa_mala: 3,
    Semillax1: 3, tomate_buena: 3, tomate_corta: 3, tomate_mala: 3,
    Semillax2: 5, trigo_buena: 5, trigo_corta: 5, trigo_mala: 5,
    Semillax3: 6, calabaza_buena: 6, calabaza_corta: 6, calabaza_mala: 6,
    // Herramientas
    Regaderax: 1, Tijerasx: 1, balde_vacio: 1, balde_con_agua: 1,
    hacha_de_madera: 1, pico_de_madera: 2, hacha_de_piedra: 3, pico_de_piedra: 3,
    hacha_de_cobre: 5, pico_de_cobre: 5, hacha_de_hierro: 7, pico_de_hierro: 7,
    // Materiales (madera del pueblo; piedra y carbón de la mina; lingotes del horno)
    palo: 1, madera_pinos: 1, madera_con_hojas: 1, madera_seca: 1, tablon_de_madera: 2,
    mineral_piedra: 2, mineral_carbon: 2, carbon: 2, mineral_piedra_cobre: 3, mineral_cobre: 4,
    mineral_piedra_hierro: 5, mineral_hierro: 6,
    // Pociones
    pocion_vida: 2, pocion_mascota: 2, pocion_antidoto: 3, elixir_revivir: 4, pocion_mascota_grande: 5,
    // Peces: los comunes, nivel 1; los raros y los venenosos, más
    pes3: 3, pes7: 3, pes8: 3, pes13: 3, pes14: 3, pes6: 4, pes12: 5,
    // Construcción
    antorcha: 2, parcela: 3, pala_construccion: 3, espantapajaros: 3, basura: 3,
    cofre1: 4, cofre2: 5, cofre3: 7, cofre4: 9,
    // Equipo
    cana_pescar: 1, espada_madera: 2, espada_cobre: 4, arco: 4, bote: 5, baston_mago: 6, espada_hierro: 7
  });

  function nivel(itemId) {
    var k = String(itemId || '');
    return Object.prototype.hasOwnProperty.call(TABLA, k) ? TABLA[k] : 1;
  }

  /** El nivel del personaje: el de gf-niveles-mapas.js (la experiencia manda); si no está, el de la escena. */
  function nivelDeEscena(scene) {
    if (window.GFNivelMapa && typeof window.GFNivelMapa.nivelDe === 'function') return window.GFNivelMapa.nivelDe(scene);
    var n = Number(scene && scene.nivel);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  window.GFNivelesObjetos = { nivel: nivel, nivelDeEscena: nivelDeEscena, tabla: TABLA };
})();
