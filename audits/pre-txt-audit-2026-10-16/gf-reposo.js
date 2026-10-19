/**
 * gf-reposo.js — EL MODO REPOSO DE LOS DEMÁS JUGADORES (2026-10-05)
 *
 * Lo que pidió el jugador: "el modo reposo de los usuarios que puedo ver en la
 * tienda, en el pueblo, en la mina, en la isla o en las casas quiero que sea de
 * 5 minutos: aunque estén AFK 5 minutos no pueda verlos a menos que se muevan".
 *
 * CÓMO ESTABA:
 *   - En el pueblo (y en todo lo que hereda de GameScene) un jugador quieto no
 *     desaparecía nunca: `cleanInactivePlayers()` estaba vacío a propósito.
 *   - En la tienda se BORRABA a los 30 s sin paquetes. Como un jugador quieto
 *     no manda nada, a los 30 s de pararse desaparecía… y su mensaje de chat,
 *     su sombra y su perro con él, hasta que diera un paso.
 *
 * CÓMO ES AHORA, IGUAL EN TODAS LAS ESCENAS:
 *   - Un jugador que lleva 5 minutos sin moverse se OCULTA (no se borra: sigue
 *     en la sala, así que el contador de jugadores no baila y al volver a
 *     moverse aparece al instante, sin recrear nada).
 *   - "Moverse" es cambiar de sitio, andar contra algo o hacer algo con el
 *     personaje que los demás ven (lanzar la caña, que pique, la lucha). Un
 *     paquete que solo re-sincroniza la posición (al reconectarse) NO cuenta.
 *   - Quien ENTRA en la sala no ve a los que ya llevaban 5 minutos quietos: el
 *     servidor manda `quietoMs` (cuánto llevan sin moverse) en la foto de la
 *     sala. Sin eso, el recién llegado los vería otros 5 minutos.
 *   - Mientras está oculto no se le pintan burbujas de chat encima (sería un
 *     bocadillo flotando sin nadie debajo). Lo que escribe sigue saliendo en
 *     el panel del chat, como siempre.
 *
 * Las escenas solo tienen que llamar a cuatro cosas:
 *   GFReposo.alCrear(p, info)     — al crear al jugador remoto
 *   GFReposo.alRecibir(p, info)   — al principio de cada paquete suyo
 *   GFReposo.trasRecibir(p)       — al final de cada paquete suyo
 *   GFReposo.revisar(scene)       — cada fotograma (se limita a una vez por s)
 */
(function () {
  'use strict';

  var REPOSO_MS = 5 * 60 * 1000;
  var CADA_MS = 1000;
  var UN_DIA = 24 * 60 * 60 * 1000;

  /** Todo lo que se ve de un jugador remoto. Lo destruido (`scene` nulo) fuera. */
  function piezas(p) {
    var l = [p.sprite, p.nameText, p.shadowContainer,
             p._chatContainer, p._typingContainer, p._chatText, p._chatTypingText];
    if (p.dog) l.push(p.dog.sprite, p.dog.shadowContainer, p.dog.nameText);
    if (p._pesca) l.push(p._pesca.corcho, p._pesca.linea);
    var fuera = [];
    for (var i = 0; i < l.length; i++) {
      var o = l[i];
      if (o && o.setVisible && o.scene) fuera.push(o);
    }
    return fuera;
  }

  /**
   * Lo oculta y apunta QUÉ estaba a la vista, para devolver justo eso al
   * despertar (un perro quitado o un fantasma tienen que seguir como estaban).
   * Llamarlo con el jugador ya dormido oculta lo que se haya encendido después.
   */
  function dormir(p) {
    if (!p) return;
    if (!p._afk) { p._afk = true; p._afkVisibles = []; }
    var l = piezas(p);
    for (var i = 0; i < l.length; i++) {
      if (l[i].visible) {
        l[i].setVisible(false);
        if (p._afkVisibles.indexOf(l[i]) < 0) p._afkVisibles.push(l[i]);
      }
    }
  }

  function despertar(p) {
    if (!p || !p._afk) return;
    p._afk = false;
    var l = p._afkVisibles || [];
    for (var i = 0; i < l.length; i++) {
      try { if (l[i] && l[i].scene) l[i].setVisible(true); } catch (e) {}
    }
    p._afkVisibles = null;
  }

  function firmaPesca(pz) {
    if (!pz || typeof pz !== 'object') return '';
    return [pz.n, pz.dir, pz.fase].join('|');
  }

  /** Al crear al jugador: ¿cuánto llevaba quieto según el servidor? */
  function alCrear(p, info) {
    if (!p) return;
    var q = Number(info && info.quietoMs);
    q = (isFinite(q) && q > 0) ? Math.min(q, UN_DIA) : 0;
    p._quietoDesde = Date.now() - q;
    p._ultimaPos = { x: Number(info && info.x) || 0, y: Number(info && info.y) || 0 };
    p._pescaVista = firmaPesca(info && info.pesca);
    if (q >= REPOSO_MS) dormir(p);
  }

  /**
   * Al llegar un paquete suyo, ANTES de pintarlo: si de verdad hizo algo, se
   * despierta (y así el resto del paquete decide perro, fantasma… como
   * siempre). Devuelve si hubo actividad.
   */
  function alRecibir(p, info) {
    if (!p || !info) return false;
    var x = Number(info.x), y = Number(info.y);
    var lp = p._ultimaPos;
    var movio = !lp || !isFinite(x) || !isFinite(y) ||
                Math.abs(x - lp.x) > 1 || Math.abs(y - lp.y) > 1;
    var anda = !!info.isMoving && info.direction !== 'stop';
    var fp = firmaPesca(info.pesca);
    var pesca = fp !== (p._pescaVista || '');
    if (isFinite(x) && isFinite(y)) p._ultimaPos = { x: x, y: y };
    p._pescaVista = fp;
    if (movio || anda || pesca) {
      p._quietoDesde = Date.now();
      despertar(p);
      return true;
    }
    return false;
  }

  /** Al terminar de pintar el paquete: si sigue dormido, nada a la vista. */
  function trasRecibir(p) {
    if (p && p._afk) dormir(p);
  }

  /** Una vez por segundo: duerme a quien lleve 5 minutos sin moverse. */
  function revisar(scene) {
    if (!scene) return;
    var ahora = Date.now();
    if (scene.__gfReposoUlt && ahora - scene.__gfReposoUlt < CADA_MS) return;
    scene.__gfReposoUlt = ahora;
    var ps = scene.otherPlayers;
    if (!ps) return;
    for (var id in ps) {
      if (!Object.prototype.hasOwnProperty.call(ps, id)) continue;
      var p = ps[id];
      if (!p || p._afk) continue;
      if (!p._quietoDesde) { p._quietoDesde = ahora; continue; }
      if (ahora - p._quietoDesde >= REPOSO_MS) dormir(p);
    }
  }

  /** ¿Se le puede pintar una burbuja encima? (no, si está oculto) */
  function visible(p) { return !(p && p._afk); }

  window.GFReposo = {
    REPOSO_MS: REPOSO_MS,
    alCrear: alCrear,
    alRecibir: alRecibir,
    trasRecibir: trasRecibir,
    revisar: revisar,
    visible: visible,
    dormir: dormir,
    despertar: despertar
  };
})();
