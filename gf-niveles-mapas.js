/* ===========================================================================
 * LOS MAPAS POR NIVEL                                              (2026-10-22)
 *
 * "Quiero que al mapa salvaje los usuarios puedan entrar en nivel 4, al mapa
 * de la mina en nivel 2 del personaje, al de hielo en nivel 7, al desierto en
 * nivel 5 y al cementerio en nivel 6."
 *
 * QUÉ HACE
 *   Una tabla (mundo → nivel mínimo) y GFNivelMapa.exigir(scene, mundo), que
 *   dice que no —con un aviso claro y sin repetirlo en cada fotograma— si el
 *   personaje no llega. La miran TODAS las entradas:
 *     · la puerta de la mina y el camino del oeste (GameScene),
 *     · las salidas del mapa salvaje a las tres zonas (gf-zonas.js),
 *     · el viaje a un amigo y cualquier otro de GFViaje (gf-lands.js),
 *     · la pantalla de carga: si la partida estaba guardada DENTRO de un mapa
 *       al que ya no se llega (la regla es nueva), se aparece en el pueblo.
 *   El servidor tiene la MISMA tabla (GF_NIVEL_MAPA en server2.js): por
 *   debajo del nivel no da nada al vencer monstruos y el botón de amigos no
 *   lleva (ni cobra el viaje).
 *
 * EL NIVEL
 *   El del HUD ("Lv. N"): sale de la experiencia con la misma curva que
 *   server2.js (expTotalParaNivel) y GameScene (_expTotalParaNivel). Se toma
 *   la mayor de las experiencias que se conozcan (la escena y window.playerStats)
 *   y, si la escena ya trae su `nivel`, el mayor de los dos: nunca se le cierra
 *   la puerta a alguien que ve en pantalla el nivel que pide.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFNivelMapa) return;

  // mundo → nivel mínimo (3 mina, 6 salvaje, 7 cementerio, 8 desierto, 9 tundra;
  // (2026-10-25) 10 glaciar, 11 caverna, 12 pradera: niveles 8, 9 y 10).
  var MINIMO = Object.freeze({ 3: 2, 6: 4, 8: 5, 7: 6, 9: 7, 10: 8, 11: 9, 12: 10 });
  var NOMBRE = Object.freeze({ 3: 'The Mine', 6: 'The Wild Lands', 7: 'The Cemetery', 8: 'The Desert', 9: 'The Frost Tundra',
                               10: 'The Shattered Glacier', 11: 'The Crystal Caverns', 12: 'Blossom Meadow' });
  var TOPE = 150;
  var AVISO_CADA = 2500;
  var avisadoEn = 0, avisoPendiente = null, relojAviso = null;

  /** Copia de expTotalParaNivel (server2.js) y _expTotalParaNivel (GameScene). */
  function expPara(n) {
    var L = Math.max(1, Math.round(Number(n) || 1));
    var vieja = 200 * Math.pow(2, Math.min(L - 1, 40));
    var nueva = 100 * L * L + 100 * L;
    return Math.min(vieja, nueva);
  }
  function nivelDeExp(exp) {
    var e = Math.max(0, Math.round(Number(exp) || 0)), n = 0;
    while (n < TOPE && e >= expPara(n + 1)) n++;
    return n;
  }
  function nivelDe(scene) {
    var exp = Math.max(Number(scene && scene.nivel_exp) || 0, Number(window.playerStats && window.playerStats.exp) || 0);
    var n = nivelDeExp(exp);
    var visto = Number(scene && scene.nivel);
    return Number.isFinite(visto) ? Math.max(n, Math.floor(visto)) : n;
  }
  function minimo(mundo) { var m = MINIMO[Number(mundo)]; return m || 0; }
  function puede(scene, mundo) { var m = minimo(mundo); return !m || nivelDe(scene) >= m; }
  function texto(scene, mundo) {
    return '🔒 ' + (NOMBRE[Number(mundo)] || 'This place') + ' opens at level ' + minimo(mundo) +
           ' — you are level ' + nivelDe(scene) + '. Defeat monsters and finish missions to level up.';
  }
  function avisar(scene, txt) {
    try { if (scene && scene.notifications && scene.notifications.show) { scene.notifications.show(txt, 'warning'); return true; } } catch (e) {}
    return false;
  }

  /** ¿Puede ir? Si no, avisa (una vez cada poco: las salidas se tocan en cada fotograma). */
  function exigir(scene, mundo) {
    if (puede(scene, mundo)) return true;
    var ahora = Date.now();
    if (ahora - avisadoEn > AVISO_CADA) { avisadoEn = ahora; avisar(scene, texto(scene, mundo)); }
    return false;
  }

  /* El aviso de la pantalla de carga (allí no hay notificaciones): se enseña
     en la primera escena que las tenga, y se olvida a los 20 s. */
  function avisarAlLlegar(txt) {
    avisoPendiente = { txt: txt, hasta: Date.now() + 20000 };
    if (relojAviso) return;
    relojAviso = setInterval(function () {
      if (!avisoPendiente || Date.now() > avisoPendiente.hasta) { clearInterval(relojAviso); relojAviso = null; avisoPendiente = null; return; }
      var escenas = [];
      try { escenas = window.game && window.game.scene ? window.game.scene.getScenes(true) : []; } catch (e) {}
      for (var i = 0; i < escenas.length; i++) {
        if (escenas[i] && escenas[i].player && avisar(escenas[i], avisoPendiente.txt)) {
          clearInterval(relojAviso); relojAviso = null; avisoPendiente = null; return;
        }
      }
    }, 1000);
  }
  /** La pantalla de carga: ¿a ese mundo guardado se puede seguir yendo? Si no, aviso al llegar. */
  function revisarAlCargar(scene, mundo) {
    if (puede(scene, mundo)) return true;
    avisarAlLlegar(texto(scene, mundo));
    return false;
  }
  window.addEventListener('pagehide', function (e) {
    if (e && e.persisted) return;
    if (relojAviso) { clearInterval(relojAviso); relojAviso = null; }
    avisoPendiente = null;
  });

  window.GFNivelMapa = Object.freeze({
    MINIMO: MINIMO, minimo: minimo, nivelDe: nivelDe, nivelDeExp: nivelDeExp,
    puede: puede, exigir: exigir, revisarAlCargar: revisarAlCargar, texto: texto
  });
})();
