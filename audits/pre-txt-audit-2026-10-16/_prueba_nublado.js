/* =============================================================================
 * BANCO DE PRUEBAS DEL NUBLADO   (_prueba_nublado.html)
 * =============================================================================
 * Un mundo de cuadros, la cámara que se puede pasear y el clima nublado puesto
 * a mano. Sirve para ver —y medir— que las sombras de las nubes van en el
 * mundo y no pegadas a la cámara.
 * ========================================================================== */
(function () {
  'use strict';

  var ANCHO = 760, ALTO = 420;
  var MUNDO_W = 4000, MUNDO_H = 3000;

  /* gf-clima pregunta el tiempo al servidor nada más montarse. Aquí no hay
     backend, así que se le pone el estado a mano con `probar()` y se deja que
     su consulta falle sin ruido. Lo que se prueba son los dibujos. */
  window.GFCiclo = {
    hayHora: function () { return true; },
    estado:  function () { return { hora: 12, minuto: 0, esDia: true }; },
    oscuridad: function () { return 0; }
  };

  var escena = null;
  var tiempoParado = false;
  var paseando = false;
  var fuerzas = [0.3, 1, 2];
  var iFuerza = 1;

  var Prueba = {
    key: 'Prueba',

    /* HACE FALTA PRECARGAR AUNQUE LAS NUBES NO USEN NINGÚN PNG.

       Las sombras se dibujan enteras con canvas, pero `GFClima.montar()` se
       niega a montarse si le faltan las texturas de la LLUVIA (`hayTexturas`),
       y sin montarse no hay nubes. Así que la prueba tiene que cargar lo mismo
       que carga el juego. Sin esto la pantalla sale limpia y no hay ni un
       error: solo un aviso en la consola.

       Es la misma trampa que ya mordió una vez —"14 PNG sin subir tumbaban
       TODO el clima"—, y por eso se deja escrito aquí. */
    preload: function () {
      window.GFClima.precargar(this);
    },

    create: function () {
      escena = this;

      /* SUELO DE CUADROS. No es decoración: sin una rejilla no hay forma de ver
         si lo que se mueve es la cámara o la sombra. Se dibuja una vez en una
         textura y se estampa como mosaico. */
      var T = 64;
      var g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x4a7c3f, 1); g.fillRect(0, 0, T, T);
      g.fillStyle(0x568c48, 1); g.fillRect(0, 0, T / 2, T / 2);
      g.fillStyle(0x568c48, 1); g.fillRect(T / 2, T / 2, T / 2, T / 2);
      g.lineStyle(1, 0x3d6635, 1); g.strokeRect(0, 0, T, T);
      g.generateTexture('cuadros', T, T);
      g.destroy();

      this.add.tileSprite(0, 0, MUNDO_W, MUNDO_H, 'cuadros').setOrigin(0, 0).setDepth(0);

      /* Unos cuantos bultos altos: así se ve que la sombra pasa POR ENCIMA de
         los objetos del mundo, que es lo que hace una nube de verdad. */
      for (var i = 0; i < 40; i++) {
        var x = 120 + (i % 8) * 460 + ((i % 3) * 40);
        var y = 140 + Math.floor(i / 8) * 380;
        var casa = this.add.rectangle(x, y, 90, 120, 0x8a5a3c).setOrigin(0.5, 1);
        casa.setDepth(y);
        this.add.rectangle(x, y - 120, 110, 26, 0xa8442f).setOrigin(0.5, 1).setDepth(y + 0.1);
      }

      this.cameras.main.setBounds(0, 0, MUNDO_W, MUNDO_H);
      this.cameras.main.setScroll(200, 200);

      window.GFClima.montar(this);
      window.GFClima.probar('nublado');
      window.GFClima.estado().nubladoFuerza = fuerzas[iFuerza];

      // Flechas y arrastre, para poder pasear a mano.
      this.teclas = this.input.keyboard.createCursorKeys();
      var arrastrando = false, ax = 0, ay = 0;
      this.input.on('pointerdown', function (p) { arrastrando = true; ax = p.x; ay = p.y; });
      this.input.on('pointerup',   function () { arrastrando = false; });
      this.input.on('pointermove', function (p) {
        if (!arrastrando) return;
        escena.cameras.main.scrollX -= (p.x - ax);
        escena.cameras.main.scrollY -= (p.y - ay);
        ax = p.x; ay = p.y;
      });
    },

    update: function (_, delta) {
      var cam = this.cameras.main;
      var v = 6;
      if (this.teclas.left.isDown)  cam.scrollX -= v;
      if (this.teclas.right.isDown) cam.scrollX += v;
      if (this.teclas.up.isDown)    cam.scrollY -= v;
      if (this.teclas.down.isDown)  cam.scrollY += v;

      if (paseando) cam.scrollX += 2.4;

      informar();
    }
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    width: ANCHO, height: ALTO,
    parent: 'juego',
    backgroundColor: '#3f6d36',
    scene: [Prueba]
  });

  // ── El informe ────────────────────────────────────────────────────────────
  var informe = document.getElementById('informe');
  var ultimo = 0;

  function informar() {
    var ahora = Date.now();
    if (ahora - ultimo < 200) return;      // cuatro veces por segundo basta
    ultimo = ahora;

    var st = escena.__gfClima;
    if (!st) { informe.textContent = 'el clima no está montado'; return; }

    var cam = escena.cameras.main;
    var lineas = [];
    lineas.push('cámara   scroll: ' + Math.round(cam.scrollX) + ', ' + Math.round(cam.scrollY));
    lineas.push('nublado  fuerza pedida: ' + (window.GFClima.estado().nubladoFuerza) +
                '   ·   fuerza que se ve: ' + (st.fuerzaNublado || 0).toFixed(2));
    lineas.push('tiempo:  ' + (tiempoParado ? 'PARADO' : 'corriendo') +
                '   ·   cámara: ' + (paseando ? 'paseando sola' : 'quieta (flechas o arrastrar)'));
    lineas.push('');
    lineas.push('  #   x mundo    y mundo   visible  alfa   scrollFactorX');
    (st.nubes || []).forEach(function (n, i) {
      lineas.push('  ' + i +
        '   ' + String(Math.round(n.x)).padStart(8) +
        '   ' + String(Math.round(n.y)).padStart(8) +
        '   ' + String(n.spr.visible).padStart(7) +
        '   ' + n.spr.alpha.toFixed(2) +
        '   ' + n.spr.scrollFactorX);
    });
    lineas.push('');
    lineas.push('scrollFactorX = 1 significa que la nube vive en el MUNDO.');
    lineas.push('Si fuera 0, estaría pegada a la cámara: eso es lo que NO puede pasar.');
    informe.textContent = lineas.join('\n');
  }

  // ── Botones ───────────────────────────────────────────────────────────────
  document.getElementById('b-parar').onclick = function () {
    tiempoParado = !tiempoParado;
    /* Se para el RELOJ del juego, no el clima: así las nubes se quedan donde
       están y la cámara se puede seguir moviendo. Es la única forma de separar
       "se mueve la nube" de "se mueve la cámara". */
    if (tiempoParado) escena.scene.scene.game.loop.sleep();
    else escena.scene.scene.game.loop.wake();
    if (tiempoParado) {
      // El bucle dormido no repinta el informe: se hace una vez a mano.
      setTimeout(informar, 50);
    }
  };

  document.getElementById('b-camara').onclick = function () { paseando = !paseando; };

  document.getElementById('b-fuerza').onclick = function () {
    iFuerza = (iFuerza + 1) % fuerzas.length;
    window.GFClima.probar('nublado');
    window.GFClima.estado().nubladoFuerza = fuerzas[iFuerza];
  };

  document.getElementById('b-despejar').onclick = function () {
    window.GFClima.probar('despejado');
  };

  // Para poder mirarlo desde la consola del navegador.
  window._pruebaNublado = {
    escena: function () { return escena; },
    nubes:  function () { return (escena.__gfClima || {}).nubes || []; }
  };
})();
