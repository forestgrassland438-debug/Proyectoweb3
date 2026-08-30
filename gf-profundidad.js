/* ===========================================================================
 * PROFUNDIDAD: QUÉ VA DELANTE Y QUÉ VA DETRÁS
 *
 * EL PROBLEMA
 *   El juego ordena por Y: cuanto más abajo está algo, más delante se dibuja.
 *   Eso funciona con un árbol, porque el punto por el que toca el suelo es el
 *   pie del sprite. Con una casa no: el sprite trae tejado, alero y a veces un
 *   trozo de camino dibujado debajo, así que su "pie" cae MUCHO más abajo que
 *   la pared por la que de verdad pasas por delante. Resultado: te plantas
 *   delante de la puerta y sigues viéndote por detrás de la casa.
 *
 *   Hasta ahora eso se compensaba a mano, capa por capa, con números sueltos
 *   (-40, -48, -148...). Un número por capa entera, con lo que dentro de la
 *   misma capa unas casas quedaban bien y otras no; y cualquier objeto sin
 *   número —la fuente, el pozo, el molino— se quedaba sin arreglar.
 *
 * QUÉ HACE ESTE MÓDULO
 *   Calcula la LÍNEA DE SUELO de cada objeto: la Y por la que, si la pasas,
 *   estás delante. Y la calcula midiendo, no adivinando, en este orden:
 *
 *     1. Su rectángulo de COLISIÓN. Es la mejor fuente que hay: marca por dónde
 *        se puede andar, o sea exactamente dónde acaba la pared. Se busca el
 *        que se solapa con el objeto y cuyo borde de abajo cae dentro de él; si
 *        hay varios (una casa suele tener varios), gana el más bajo, que es la
 *        pared de delante.
 *
 *     2. Sus PÍXELES. Sin colisión, se mide dónde acaba de verdad el dibujo:
 *        casi todos los PNG traen transparencia de sobra por abajo, y esa
 *        transparencia es la que descolocaba el orden.
 *
 *     3. El pie del sprite, como último recurso.
 *
 * POR QUÉ SE MIDE A TROZOS
 *   Leer los píxeles de una textura grande cuesta unos milisegundos. Hacerlo
 *   con doscientos objetos de golpe es un tirón de medio segundo justo al
 *   entrar. Se hace de unos pocos por frame hasta acabar; nadie lo nota y a los
 *   dos segundos está todo colocado.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFProfundidad && GFProfundidad.montar(this);
 *   Y se puede volver a llamar cuando aparezcan objetos nuevos: lo ya medido no
 *   se vuelve a medir.
 *
 * API
 *   GFProfundidad.montar(scene, op) / desmontar(scene)
 *   GFProfundidad.lineaDeSuelo(scene, sprite)   la Y de referencia de un objeto
 *   GFProfundidad.piesDe(scene, sprite)         la Y de los pies de un personaje
 *   GFProfundidad.medir(scene, clave)           la caja opaca de una textura
 *   GFProfundidad.recalcular(scene)             fuerza otra pasada
 *   GFProfundidad.estado(scene)
 * ======================================================================== */
(function () {
  'use strict';

  /* Cuántos objetos se calibran por frame. Cuatro y no doce: desde que la
     línea de suelo se SONDEA (ver sondearSuelo) cada objeto cuesta unas mil
     consultas al índice de colisiones en vez de una comparación. Con cuatro por
     frame, doscientos objetos tardan cincuenta frames — menos de un segundo
     repartido, que no se nota. De golpe sería un parón. */
  var POR_FRAME = 4;

  /* Cuánto tiene que solaparse un rectángulo de colisión con el objeto para
     darlo por suyo. Por debajo de esto puede ser la valla del vecino. */
  var SOLAPE_MIN = 0.55;

  /* Un rectángulo que sobresale mucho por los lados no es la pared de este
     edificio, es una zona de colisión general que pasa por encima. */
  var DESBORDE_MAX = 1.6;

  /* Alfa a partir del cual un píxel cuenta como dibujo. 8 y no 0: los bordes
     antialiaseados dejan restos casi invisibles que, contados como dibujo,
     mueven la medida varios píxeles. */
  var ALFA_MIN = 8;

  /* LA SONDA.

     Se recorre el objeto por columnas y, en cada una, se baja preguntando "¿se
     puede andar aquí?". La última altura BLOQUEADA de cada columna es donde
     acaba lo sólido: la fachada.

     Paso de 8 px a lo ancho y 6 a lo alto sobre una casa de 200×300 son unas
     mil preguntas, y cada pregunta es una consulta al índice espacial de
     colisiones que ya usa el juego para mover al jugador. Con cuatro objetos
     por frame ni se nota. */
  var SONDA_PASO_X = 8;
  var SONDA_PASO_Y = 6;
  var SONDA_TAM    = 4;      // tamaño del cuadradito que se pregunta
  var SONDA_MARGEN = 12;     // cuánto se baja por debajo del sprite
  /* Se ignora el 10 % de arriba: en un edificio eso es tejado, y en un árbol,
     copa. Nunca es la línea por la que pasas por delante. */
  var SONDA_DESDE  = 0.10;
  /* De todas las columnas se coge el percentil 85 y no el máximo: una sola
     columna rara —la valla del vecino que se cuela por un lado— no debe mover
     la línea del edificio entero. */
  var SONDA_PCT    = 0.85;
  var SONDA_MIN_COL = 3;     // con menos columnas sólidas no me lo creo

  /* ══════════════════════════════════════════════════════════════════════
     FRANJAS: CUANDO UN OBJETO NO TIENE UNA SOLA LÍNEA DE SUELO
     ──────────────────────────────────────────────────────────────────────
     Todo el sistema de "qué va delante" se apoya en UN número por objeto: su
     línea de suelo. Para un árbol o una caja eso vale. Para una casa en L, en
     U o en T, NO: la fachada del ala corta está mucho más al norte que la del
     ala larga, y un solo número no puede describir las dos.

     Lo que se veía: te pones delante del ala corta —o sea, al sur de SU
     fachada— pero todavía al norte de la línea que se calculó para la casa
     entera (que la fija el ala larga, o el porche que sobresale). El edificio
     entero se dibuja encima y el personaje aparece cortado por la mitad.

     Subir o bajar el offset a mano no lo arregla: lo que se gana en un ala se
     pierde en la otra. El problema no es el número, es que hay UNO SOLO.

     LA SOLUCIÓN: se parte el objeto en FRANJAS VERTICALES, cada una con SU
     línea de suelo, y cada franja se dibuja con su propia profundidad. En el
     ala corta pasas por delante y en la larga por detrás, a la vez, porque son
     dos objetos de dibujo distintos.

     No cuesta memoria: las franjas son el MISMO sprite con `setCrop`, así que
     no hay texturas nuevas ni copias de píxeles — solo unos pocos objetos de
     dibujo más, y solo en los objetos que de verdad lo necesitan.        */

  /* Por debajo de este ancho no compensa: la diferencia entre dos franjas
     sería de unos píxeles y no se nota. */
  var FRANJA_ANCHO_MIN = 40;
  /* Cuánto tiene que variar la línea de suelo a lo ancho para partir. Por
     debajo de esto el objeto es "plano" y se queda con un solo número, como
     siempre. */
  var FRANJA_UMBRAL    = 16;
  /* ERROR MÁXIMO TOLERADO, en píxeles de mundo. Es el mando de verdad de todo
     el reparto: se parte en tantas franjas como haga falta para que NINGUNA
     columna quede representada por una línea que se aleje más de esto de la
     suya. Diez píxeles son menos de un paso del personaje. */
  var FRANJA_ERROR     = 10;
  /* Tope duro de franjas por objeto. Cada franja es un objeto de dibujo más,
     así que hay un límite; ocho da de sobra para una planta en E o en cruz. */
  var FRANJA_MAX       = 8;
  /* Una franja de una sola columna es ruido de la sonda, no un ala. */
  var FRANJA_COLS_MIN  = 2;
  /* Solape entre franjas vecinas, en píxeles de la TEXTURA. Ver `partir`:
     es lo que hace imposible que se vea una costura. */
  var FRANJA_SOLAPE    = 1;
  /* Qué proporción del ancho del objeto tiene que ser sólida para que valga la
     pena partirlo. Separa las casas (planta ancha) de los árboles y los faroles
     (un tronco fino y mucha copa). Ver franjasDe. */
  var FRANJA_SOLIDO_MIN = 0.55;

  var cacheMedidas = {};        // clave de textura -> caja opaca

  function log() {
    if (!window.GF_PROFUNDIDAD_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[profundidad]');
    console.log.apply(console, a);
  }

  // ------------------------------------------------------------- medir
  /**
   * La caja OPACA de una textura, en píxeles de la propia textura.
   *
   * Devuelve { ancho, alto, arriba, abajo, izq, der } donde `abajo` es la
   * última fila que tiene dibujo. Si la textura no se puede leer —por ejemplo
   * porque viene de otro dominio y el canvas queda manchado— devuelve la caja
   * entera, que es lo mismo que hacía el juego antes.
   */
  function medir(scene, clave) {
    if (cacheMedidas[clave]) return cacheMedidas[clave];
    var caja = null;
    try {
      var tex = scene.textures.get(clave);
      var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
      if (!img || !img.width) throw new Error('sin imagen');
      var w = img.width, h = img.height;

      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      var datos = ctx.getImageData(0, 0, w, h).data;

      /* Se busca de ABAJO hacia arriba y se para en la primera fila con
         dibujo: en la inmensa mayoría de los sprites eso son dos o tres filas,
         no la imagen entera. */
      var abajo = -1, y, x, i;
      for (y = h - 1; y >= 0 && abajo < 0; y--) {
        for (x = 0; x < w; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { abajo = y; break; }
        }
      }
      if (abajo < 0) throw new Error('textura vacía');

      // arriba, y los lados: solo hace falta recorrer una vez más
      var arriba = 0;
      for (y = 0; y < h; y++) {
        var hay = false;
        for (x = 0; x < w; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { hay = true; break; }
        }
        if (hay) { arriba = y; break; }
      }
      var izq = w, der = -1;
      for (y = arriba; y <= abajo; y++) {
        for (x = 0; x < izq; x++) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { izq = x; break; }
        }
        for (x = w - 1; x > der; x--) {
          if (datos[(y * w + x) * 4 + 3] >= ALFA_MIN) { der = x; break; }
        }
      }
      caja = { ancho: w, alto: h, arriba: arriba, abajo: abajo,
               izq: Math.min(izq, w - 1), der: Math.max(der, 0), leida: true };
    } catch (e) {
      // Textura ilegible: se da por buena entera. Es lo que había antes.
      var t2 = null;
      try { t2 = scene.textures.get(clave); } catch (e2) {}
      var iw = (t2 && t2.source && t2.source[0]) ? t2.source[0].width : 0;
      var ih = (t2 && t2.source && t2.source[0]) ? t2.source[0].height : 0;
      caja = { ancho: iw, alto: ih, arriba: 0, abajo: Math.max(0, ih - 1),
               izq: 0, der: Math.max(0, iw - 1), leida: false };
    }
    cacheMedidas[clave] = caja;
    return caja;
  }

  /** Cuánto sobra de transparencia por debajo del sprite, en píxeles de MUNDO. */
  function sobranteAbajo(scene, spr) {
    var clave = spr.texture && spr.texture.key;
    if (!clave) return 0;
    var m = medir(scene, clave);
    if (!m.leida || !m.alto) return 0;
    var escala = Math.abs(spr.scaleY) || 1;
    return (m.alto - 1 - m.abajo) * escala;
  }

  // --------------------------------------------------- caja del sprite
  /** La caja del sprite en el MUNDO, sin depender de getBounds. */
  function cajaMundo(spr) {
    var w = spr.displayWidth || spr.width || 0;
    var h = spr.displayHeight || spr.height || 0;
    var ox = (spr.originX === undefined) ? 0.5 : spr.originX;
    var oy = (spr.originY === undefined) ? 0.5 : spr.originY;
    var x = spr.x - w * ox;
    var y = spr.y - h * oy;
    return { x: x, y: y, ancho: w, alto: h, der: x + w, abajo: y + h };
  }

  // ------------------------------------------------------------- sondear
  /**
   * ¿Hasta dónde llega lo SÓLIDO de este objeto?
   *
   * POR QUÉ ESTO Y NO LOS RECTÁNGULOS DE COLISIÓN A PELO.
   *
   * Buscar "el rectángulo que es la pared de esta casa" obliga a adivinar cómo
   * están organizadas las colisiones del mapa, y cada mapa las organiza a su
   * manera: una casa puede tener un rectángulo, o cinco, o compartir una franja
   * larga con las casas de al lado. Cualquier regla que se invente —que se
   * solape tanto, que no desborde tanto— falla en cuanto aparece un caso que no
   * encaja, y entonces ese objeto se queda con la línea mal puesta. Eso es lo
   * que estaba pasando: unos edificios bien y otros no.
   *
   * Preguntar "¿puedo andar aquí?" no depende de eso. Es EXACTAMENTE la misma
   * pregunta que se le hace al mover al jugador, así que la línea de suelo que
   * sale es, por construcción, la última altura a la que el jugador NO puede
   * estar: la fachada. Da igual si hay un rectángulo o quince.
   *
   * Devuelve null si no hay índice de colisiones o si el objeto no tiene nada
   * sólido debajo (un arbusto decorativo, una flor).
   */
  function sondearSuelo(scene, caja) {
    if (typeof scene._chocaConEscenario !== 'function') return null;
    if (!scene._idxColision) return null;          // todavía sin construir

    var s = SONDA_TAM, m = s / 2;
    var desde = caja.y + caja.alto * SONDA_DESDE;
    var hasta = caja.abajo + SONDA_MARGEN;
    var fondos = [];

    for (var x = caja.x + 3; x <= caja.der - 3; x += SONDA_PASO_X) {
      var ultimo = null;
      for (var y = desde; y <= hasta; y += SONDA_PASO_Y) {
        if (scene._chocaConEscenario(x - m, y - m, s, s)) ultimo = y;
      }
      if (ultimo !== null) fondos.push(ultimo);
    }
    if (fondos.length < SONDA_MIN_COL) return null;

    fondos.sort(function (a, b) { return a - b; });
    var i = Math.min(fondos.length - 1,
                     Math.floor(fondos.length * SONDA_PCT));
    var linea = fondos[i];

    /* No puede salirse del cuerpo del objeto: si la sonda encuentra algo por
       debajo del sprite es de otra cosa, no de éste. */
    if (linea > caja.abajo + SONDA_MARGEN) linea = caja.abajo;
    return linea;
  }

  /**
   * La línea de suelo COLUMNA A COLUMNA, en vez de resumida en un número.
   *
   * Es la misma sonda que sondearSuelo() —bajar preguntando "¿puedo andar
   * aquí?"— pero sin aplastar el resultado: devuelve la última altura bloqueada
   * de CADA columna. Eso es lo que permite ver que una casa tiene el ala
   * izquierda a una altura y la derecha a otra.
   *
   * Las columnas donde no hay nada sólido (el hueco de una L, un alero que
   * vuela sobre suelo transitable) no tienen línea propia: se rellenan con la
   * de la columna sólida más cercana. Es lo más parecido a la verdad sin
   * inventarse nada, y en el peor caso deja esa franja como estaba antes.
   *
   * Devuelve [{ x, y }] en coordenadas de MUNDO, o null si el objeto no tiene
   * nada sólido debajo (una flor, un arbusto decorativo).
   */
  function sondearColumnas(scene, caja, spr) {
    if (typeof scene._chocaConEscenario !== 'function') return null;
    if (!scene._idxColision) return null;

    var s = SONDA_TAM, m = s / 2;
    var desde = caja.y + caja.alto * SONDA_DESDE;
    var hasta = caja.abajo + SONDA_MARGEN;

    /* TOPE POR EL DIBUJO, no por el rectángulo del sprite.

       La sonda pregunta a las colisiones del MAPA, que no saben de quién es
       cada pared. Si al lado hay una valla, un banco o la casa de enfrente, su
       rectángulo puede caer dentro de la caja de este objeto y arrastrar esa
       columna mucho más al sur de donde acaba su dibujo. Con un solo número eso
       se disimulaba en el percentil; repartiendo en franjas, una sola columna
       envenenada abre una franja falsa.

       El dibujo sí es suyo: nada de este objeto puede tocar el suelo por debajo
       de su último píxel pintado. */
    var fondo = caja.abajo;
    if (spr) {
      try { fondo = caja.abajo - sobranteAbajo(scene, spr); } catch (e) {}
      if (!isFinite(fondo) || fondo < caja.y) fondo = caja.abajo;
    }
    var tope = fondo + SONDA_MARGEN * 0.5;

    var cols = [], solidas = 0;
    for (var x = caja.x + 3; x <= caja.der - 3; x += SONDA_PASO_X) {
      var ultimo = null;
      for (var y = desde; y <= hasta; y += SONDA_PASO_Y) {
        if (scene._chocaConEscenario(x - m, y - m, s, s)) ultimo = y;
      }
      if (ultimo !== null && ultimo > tope) ultimo = fondo;
      if (ultimo !== null) solidas++;
      cols.push({ x: x, y: ultimo });
    }
    if (solidas < SONDA_MIN_COL) return null;
    /* Cuánto del ancho del objeto es SÓLIDO de verdad. Lo usa franjasDe() para
       no partir árboles: ver FRANJA_SOLIDO_MIN. */
    cols.solidas = solidas / cols.length;

    // Rellenar huecos con la columna sólida más cercana: primero hacia
    // adelante y luego hacia atrás, que cubre los huecos de los extremos.
    var i, ultimoBueno = null;
    for (i = 0; i < cols.length; i++) {
      if (cols[i].y !== null) ultimoBueno = cols[i].y;
      else if (ultimoBueno !== null) cols[i].y = ultimoBueno;
    }
    ultimoBueno = null;
    for (i = cols.length - 1; i >= 0; i--) {
      if (cols[i].y !== null) ultimoBueno = cols[i].y;
      else if (ultimoBueno !== null) cols[i].y = ultimoBueno;
    }
    return cols;
  }

  /** El percentil `q` de una lista de números. */
  function percentil(v, q) {
    if (!v.length) return 0;
    var c = v.slice().sort(function (a, b) { return a - b; });
    var i = Math.min(c.length - 1, Math.max(0, Math.round((c.length - 1) * q)));
    return c[i];
  }

  /* LA LÍNEA DE UNA FRANJA NO ES LA MEDIA: VA SESGADA AL NORTE.

     Los dos errores posibles no cuestan lo mismo. Si la línea queda demasiado
     al SUR, el edificio se dibuja encima del personaje y lo parte por la mitad:
     se ve muchísimo. Si queda demasiado al NORTE, el personaje pisa unos
     píxeles del arranque de la pared: casi no se nota. Así que ante la duda se
     tira al norte — percentil 35 en vez de la mediana. */
  var FRANJA_PCT = 0.35;

  /**
   * Reparte las columnas en franjas de la MEJOR forma posible.
   *
   * ═══ POR QUÉ NO VALE IR AGRUPANDO DE IZQUIERDA A DERECHA ═══
   *
   * Lo evidente es recorrer las columnas y abrir franja nueva en cuanto una se
   * separe de la anterior. Eso funciona con una L —un escalón, dos alas— y se
   * rompe con cualquier cosa más seria: en una planta en E, en U o en cruz, el
   * primer corte que decides condiciona todos los demás y acabas gastando las
   * franjas disponibles en escalones pequeños mientras dejas juntas dos alas
   * que se llevan cincuenta píxeles. El resultado depende del orden en que
   * miras, no de la forma del edificio.
   *
   * ═══ LO QUE SE HACE EN SU LUGAR ═══
   *
   * Se busca el reparto ÓPTIMO por programación dinámica: de todas las formas
   * posibles de partir las columnas en k tramos seguidos, la que menos error
   * total deja. `mejor[k][j]` = el mejor coste de repartir las columnas 0..j en
   * k tramos, y se va construyendo a partir de `mejor[k-1][i]`. El coste de un
   * tramo es su suma de desviaciones al cuadrado, que se saca en tiempo
   * constante con sumas acumuladas.
   *
   * Y k no se fija a ojo: se prueba 1, 2, 3… y se para en el PRIMERO que
   * consigue que ninguna columna se desvíe más de FRANJA_ERROR de la línea de
   * su tramo. Así una fachada recta se queda en una franja (cero objetos de
   * dibujo extra), una L se parte en dos, y una planta en E se parte en las
   * cinco que de verdad necesita — sin que nadie tenga que decir cuántas.
   *
   * Cuesta unas veinte mil operaciones por edificio, UNA vez al entrar al mapa.
   *
   * Devuelve null si no merece la pena partir.
   */
  function franjasDe(cols) {
    if (!cols || cols.length < 2) return null;

    var n = cols.length, i, j, k;
    var y = [];
    for (i = 0; i < n; i++) {
      if (typeof cols[i].y !== 'number') return null;   // no se pudo rellenar
      y.push(cols[i].y);
    }
    var min = Math.min.apply(null, y);
    var max = Math.max.apply(null, y);
    if (max - min < FRANJA_UMBRAL) return null;        // objeto plano: un número

    /* UN ÁRBOL NO SE PARTE.

       Partir en franjas tiene sentido cuando el objeto tiene ALAS: trozos
       distintos apoyados en el suelo a alturas distintas. Un árbol no las
       tiene — tiene UN tronco y una copa que vuela por encima —, y lo mismo un
       farol, un cartel o una estatua. Si en uno de esos aparece variación es
       porque la sonda ha rozado la colisión de algo que hay al lado, y partirlo
       solo puede salir mal.

       Se distingue por cuánto de su ancho es sólido: la planta de una casa
       ocupa casi todo su ancho, y la de un árbol es el tronco y ya. Por debajo
       de esta proporción, un solo número — que es justo lo que había antes y
       para estos objetos es lo correcto. */
    if (typeof cols.solidas === 'number' && cols.solidas < FRANJA_SOLIDO_MIN) {
      return null;
    }

    /* Sumas acumuladas: con ellas el coste de cualquier tramo sale de dos
       restas, y el bucle de abajo pasa de ser cúbico a cuadrático. */
    var sum = [0], sum2 = [0];
    for (i = 0; i < n; i++) {
      sum[i + 1]  = sum[i]  + y[i];
      sum2[i + 1] = sum2[i] + y[i] * y[i];
    }
    /** Desviación cuadrática del tramo [a, b) respecto a su propia media. */
    function coste(a, b) {
      var m = b - a;
      if (m <= 0) return 0;
      var s1 = sum[b] - sum[a];
      return (sum2[b] - sum2[a]) - (s1 * s1) / m;
    }

    var kMax = Math.min(FRANJA_MAX, Math.floor(n / FRANJA_COLS_MIN));
    if (kMax < 2) return null;

    var INF = Infinity;
    var mejor = [], deQuien = [];
    for (k = 0; k <= kMax; k++) {
      mejor.push(new Array(n + 1));
      deQuien.push(new Array(n + 1));
      for (j = 0; j <= n; j++) { mejor[k][j] = INF; deQuien[k][j] = -1; }
    }
    mejor[0][0] = 0;

    for (k = 1; k <= kMax; k++) {
      for (j = k * FRANJA_COLS_MIN; j <= n; j++) {
        // El último tramo va de i a j, y no puede ser más corto que el mínimo.
        for (i = (k - 1) * FRANJA_COLS_MIN; i <= j - FRANJA_COLS_MIN; i++) {
          var previo = mejor[k - 1][i];
          if (previo === INF) continue;
          var c = previo + coste(i, j);
          if (c < mejor[k][j]) { mejor[k][j] = c; deQuien[k][j] = i; }
        }
      }
    }

    /* Se prueba con 1 tramo, con 2, con 3… y se para en el primero que cumple
       el error máximo. Menos franjas siempre es mejor: son objetos de dibujo. */
    for (k = 1; k <= kMax; k++) {
      if (mejor[k][n] === INF) continue;
      var tramos = reconstruir(deQuien, k, n);
      var fr = armar(cols, y, tramos);
      if (k === 1) continue;                 // una sola franja = no partir
      if (peorError(y, tramos, fr) <= FRANJA_ERROR || k === kMax) {
        return fr.length >= 2 ? fr : null;
      }
    }
    return null;
  }

  /** Deshace el camino de la programación dinámica: los cortes elegidos. */
  function reconstruir(deQuien, k, n) {
    var tramos = [], j = n;
    while (k > 0) {
      var i = deQuien[k][j];
      if (i < 0) return tramos;
      tramos.unshift([i, j]);
      j = i; k--;
    }
    return tramos;
  }

  /** Convierte los tramos (índices de columna) en franjas con su línea. */
  function armar(cols, y, tramos) {
    var out = [];
    for (var t = 0; t < tramos.length; t++) {
      var a = tramos[t][0], b = tramos[t][1];
      if (b <= a) continue;
      out.push({ desde: cols[a].x, hasta: cols[b - 1].x,
                 y: percentil(y.slice(a, b), FRANJA_PCT),
                 cols: b - a });
    }
    return out;
  }

  /** La columna peor representada por la línea de su franja. */
  function peorError(y, tramos, fr) {
    var peor = 0;
    for (var t = 0; t < tramos.length && t < fr.length; t++) {
      for (var i = tramos[t][0]; i < tramos[t][1]; i++) {
        var d = Math.abs(y[i] - fr[t].y);
        if (d > peor) peor = d;
      }
    }
    return peor;
  }

  /**
   * Parte el objeto en franjas de dibujo, cada una con su profundidad.
   *
   * CÓMO, SIN GASTAR MEMORIA: cada franja es una COPIA del sprite —misma
   * posición, mismo origen, mismo tamaño— a la que se le pone `setCrop` para
   * que solo dibuje su tramo. Phaser recorta el cuadrilátero y las UV, así que
   * no se dibuja de más ni hace falta ninguna textura nueva. La primera franja
   * se la queda el sprite ORIGINAL, que así conserva su identidad para todo lo
   * demás del juego (colisiones, clics, `scene.sprite_jj`, sombras…).
   *
   * Los cortes se hacen en píxeles ENTEROS de la textura y pegados unos a
   * otros: un corte a medio píxel dejaría una costura visible entre franjas.
   */
  function partir(scene, spr, franjas, caja) {
    if (!franjas || franjas.length < 2) return 0;
    if (spr.flipX) return 0;                 // el recorte iría al revés
    if (typeof spr.setCrop !== 'function') return 0;

    var texW = spr.width || 0, texH = spr.height || 0;
    if (!texW || !texH) return 0;
    var escalaX = (spr.displayWidth || texW) / texW;
    if (!escalaX) return 0;

    /* Mundo -> píxel de textura, y bordes pegados y enteros.

       El corte va en el PUNTO MEDIO entre la última columna sondeada de una
       franja y la primera de la siguiente: la sonda va de ocho en ocho píxeles,
       así que la pared de verdad está en algún punto de ese hueco y el medio es
       la mejor apuesta. Y enteros y consecutivos: un corte a medio píxel, o dos
       cortes que se solapen, dejarían una costura entre franjas. */
    var cortes = [0], i;
    for (i = 1; i < franjas.length; i++) {
      var medioMundo = (franjas[i - 1].hasta + franjas[i].desde) / 2;
      var px = Math.round((medioMundo - caja.x) / escalaX);
      px = Math.max(cortes[cortes.length - 1] + 1, Math.min(texW - 1, px));
      cortes.push(px);
    }
    cortes.push(texW);

    quitarFranjas(spr);                       // por si se recalibra

    /* ═══ LA COSTURA, Y POR QUÉ SE SOLAPAN LAS FRANJAS ═══
       Dos cuadriláteros pegados que comparten un borde deberían encajar sin
       hueco… en teoría. En la práctica, con `roundPixels` activado el motor
       redondea cada vértice a píxel de pantalla, y en cuanto la escala del
       objeto o el zoom no son enteros el borde compartido cae a medio píxel:
       una de las dos franjas puede quedarse una columna corta y se ve una raya
       fina de fondo justo por la mitad de la casa.

       Se arregla como ya se arregló en los tiles del mapa (`seamOverlap`): la
       franja que se dibuja ANTES —la de profundidad menor— se estira UN píxel
       sobre su vecina. La que va encima la tapa entera, así que en el dibujo no
       cambia nada; lo que desaparece es la posibilidad de que quede hueco.

       Se estira la de abajo y no las dos a propósito: si las dos se solaparan,
       una columna con transparencia se mezclaría dos veces y saldría una raya
       OSCURA en vez de una clara. */
    var solape = [];                          // cuánto se estira cada franja
    for (i = 0; i < franjas.length; i++) solape.push({ izq: 0, der: 0 });
    for (i = 1; i < franjas.length; i++) {
      if (franjas[i - 1].y <= franjas[i].y) solape[i - 1].der = FRANJA_SOLAPE;
      else                                  solape[i].izq     = FRANJA_SOLAPE;
    }

    var trozos = [];
    for (i = 0; i < franjas.length; i++) {
      var x0 = cortes[i] - solape[i].izq;
      var ancho = (cortes[i + 1] + solape[i].der) - x0;
      if (x0 < 0) { ancho += x0; x0 = 0; }
      if (x0 + ancho > texW) ancho = texW - x0;
      if (ancho <= 0) continue;
      var obj;
      if (i === 0) {
        obj = spr;                            // la primera se la queda el original
      } else {
        obj = scene.add.image(spr.x, spr.y, spr.texture.key);
        obj.setOrigin(spr.originX, spr.originY);
        obj.setDisplaySize(spr.displayWidth, spr.displayHeight);
        obj.setScrollFactor(spr.scrollFactorX, spr.scrollFactorY);
        obj.setAlpha(spr.alpha);
        obj.setVisible(spr.visible);
        /* Las franjas NO se pulsan: el clic lo sigue atendiendo el original,
           que es quien conoce el objeto del juego. */
        if (obj.disableInteractive) obj.disableInteractive();
        if (obj.setData) obj.setData('gfFranja', true);
        obj.__gfDueno = spr;
        trozos.push(obj);
      }
      obj.setCrop(x0, 0, ancho, texH);
      obj.setDepth(franjas[i].y);
      obj.__gfFranjaY = franjas[i].y;
    }

    spr.__gfFranjas = trozos;
    spr.__gfFranjasN = franjas.length;
    /* Y se apunta el estado visible del original, para poder ver si cambia sin
       preguntárselo a Phaser cada fotograma. */
    spr.__gfEspejo = { visible: spr.visible, alpha: spr.alpha,
                       x: spr.x, y: spr.y, tinte: spr.isTinted ? spr.tintTopLeft : -1 };
    return franjas.length;
  }

  /** Deshace el partido: se borran las copias y el original recupera su dibujo. */
  function quitarFranjas(spr) {
    if (!spr || !spr.__gfFranjas) return;
    for (var i = 0; i < spr.__gfFranjas.length; i++) {
      var t = spr.__gfFranjas[i];
      if (t && t.destroy) t.destroy();
    }
    spr.__gfFranjas = null;
    spr.__gfFranjasN = 0;
    spr.__gfEspejo = null;
    if (typeof spr.setCrop === 'function') spr.setCrop();   // sin argumentos = quitar
  }

  /**
   * Las franjas siguen al original.
   *
   * Hace falta porque el original lo tocan OTROS: el recorte por cámara le pone
   * `visible` a false cuando se sale de pantalla, el resaltado del ratón le pone
   * un tinte y algún objeto se mueve (un árbol talado baja a tocón). Si las
   * copias no lo siguieran, se vería media casa encendida y media apagada.
   *
   * Solo se escribe cuando algo ha CAMBIADO de verdad: escribir `visible` en
   * todas cada fotograma las marca como sucias para el renderizador sin motivo.
   */
  function refrescarFranjas(spr) {
    var tr = spr && spr.__gfFranjas;
    if (!tr || !tr.length) return;
    var e = spr.__gfEspejo || (spr.__gfEspejo = {});
    var tinte = spr.isTinted ? spr.tintTopLeft : -1;
    var movido  = (e.x !== spr.x || e.y !== spr.y);
    var cambiaV = (e.visible !== spr.visible);
    var cambiaA = (e.alpha !== spr.alpha);
    var cambiaT = (e.tinte !== tinte);
    /* EL GIRO Y LA ESCALA TAMBIÉN.

       FALLO QUE ESTO ARREGLA — "a veces un árbol se parte por la mitad, una
       parte se mueve y la otra no":

       gf-viento mece los árboles cambiándoles la ROTACIÓN. Ese giro se lo
       aplicaba solo al sprite original, que es quien se queda la primera
       franja; las copias de las demás franjas se quedaban clavadas. Resultado:
       media copa balanceándose y la otra media quieta, con el corte a la vista.

       Las franjas comparten posición y origen, así que girarlas TODAS el mismo
       ángulo sobre el mismo punto las mantiene unidas exactamente. Lo mismo con
       la escala y el volteo: cualquier cosa que le pase al original tiene que
       pasarle a sus trozos, o dejan de ser el mismo objeto. */
    var cambiaG = (e.rot !== spr.rotation ||
                   e.sx !== spr.scaleX || e.sy !== spr.scaleY ||
                   e.fx !== spr.flipX);
    if (!movido && !cambiaV && !cambiaA && !cambiaT && !cambiaG) return;

    for (var i = 0; i < tr.length; i++) {
      var t = tr[i];
      if (!t || !t.scene) continue;
      if (movido)  t.setPosition(spr.x, spr.y);
      if (cambiaV) t.setVisible(spr.visible);
      if (cambiaA) t.setAlpha(spr.alpha);
      if (cambiaT) { if (tinte < 0) t.clearTint(); else t.setTint(tinte); }
      if (cambiaG) {
        t.setRotation(spr.rotation);
        t.setScale(spr.scaleX, spr.scaleY);
        if (t.setFlipX) t.setFlipX(!!spr.flipX);
      }
    }
    e.x = spr.x; e.y = spr.y; e.visible = spr.visible;
    e.alpha = spr.alpha; e.tinte = tinte;
    e.rot = spr.rotation; e.sx = spr.scaleX; e.sy = spr.scaleY; e.fx = spr.flipX;
  }

  // ------------------------------------------------- línea de suelo
  /**
   * ¿Hay un rectángulo de colisión que sea la PARED de este objeto?
   *
   * Se pide que se solape de verdad con el objeto por los lados, que no lo
   * desborde (eso sería una zona general que pasa por encima) y que su borde
   * de abajo caiga dentro del cuerpo del sprite. De los que valgan gana el más
   * bajo: en una casa con varios rectángulos, ese es el de la fachada.
   */
  function paredDe(colisiones, caja) {
    var mejor = null;
    for (var a = 0; a < colisiones.length; a++) {
      var arr = colisiones[a];
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) {
        var r = arr[i];
        if (!r || typeof r.width !== 'number' || !r.width) continue;
        var rDer = r.x + r.width, rAbajo = r.y + r.height;

        var solape = Math.min(caja.der, rDer) - Math.max(caja.x, r.x);
        if (solape <= 0) continue;
        if (solape < Math.min(r.width, caja.ancho) * SOLAPE_MIN) continue;
        // que no sea una zona enorme que pasa por encima del objeto
        if (r.width > caja.ancho * DESBORDE_MAX) continue;

        // el borde de abajo tiene que caer DENTRO del cuerpo del sprite
        if (rAbajo < caja.y + caja.alto * 0.12) continue;
        if (rAbajo > caja.abajo + 6) continue;

        if (mejor === null || rAbajo > mejor) mejor = rAbajo;
      }
    }
    return mejor;
  }

  /**
   * La Y por la que este objeto deja de taparte.
   *
   * Devuelve { y, fuente } para poder ver de dónde salió cada número al
   * depurar: 'pared' (colisión), 'pixeles' o 'sprite'.
   */
  function lineaDeSuelo(scene, spr, colisiones) {
    var caja = cajaMundo(spr);

    /* 1. LA SONDA, que es la buena: pregunta por dónde se puede andar. */
    var sondeada = sondearSuelo(scene, caja);
    if (sondeada !== null) return { y: sondeada, fuente: 'sonda' };

    /* 2. Si no hay índice de colisiones todavía, se intenta con los
       rectángulos en crudo. Es peor —hay que adivinar cuál es la pared— pero
       algo es algo mientras el índice se construye. */
    if (!colisiones) {
      colisiones = [scene.collisionRectangles, scene.collisionRectangles1,
                    scene.collisionRectangles2];
    }
    var pared = paredDe(colisiones, caja);
    if (pared !== null) return { y: pared, fuente: 'pared' };

    /* 3. Sin nada sólido debajo (una flor, un arbusto decorativo): manda el
       dibujo. Casi todos los PNG traen transparencia de sobra por abajo. */
    var sobra = sobranteAbajo(scene, spr);
    if (sobra > 1) return { y: caja.abajo - sobra, fuente: 'pixeles' };

    return { y: caja.abajo, fuente: 'sprite' };
  }

  /**
   * La Y de los PIES de un personaje, midiendo el dibujo.
   *
   * GameScene usaba `y + displayHeight/2`, que da el borde de abajo del sprite.
   * Los personajes traen unas cuantas filas transparentes ahí, así que sus pies
   * quedaban más abajo de lo que se ve y el personaje se ponía delante de las
   * cosas antes de tiempo.
   */
  function piesDe(scene, spr) {
    if (!spr) return 0;
    var caja = cajaMundo(spr);
    return caja.abajo - sobranteAbajo(scene, spr);
  }

  // ------------------------------------------------------------ montaje
  /** Los objetos del mapa a los que hay que ponerles la profundidad. */
  function candidatos(scene) {
    var out = [];
    if (!scene.children || !scene.children.each) return out;
    scene.children.each(function (o) {
      if (!o || o.__gfProf) return;                 // ya calibrado
      if (typeof o.getData !== 'function') return;
      if (!o.getData('optimized')) return;          // solo los del mapa
      /* LOS TEXTOS NO.

         EL FALLO QUE ARREGLA: los carteles con el nombre de los NPC tambien
         llevan puesto `optimized` (lo usa el sistema de culling), y un Text de
         Phaser tiene textura, asi que pasaban el filtro y se les recalculaba la
         profundidad como si fueran un edificio. Un cartel no esta apoyado en el
         suelo: flota sobre la cabeza del NPC y su sitio lo decide el NPC, no su
         propia Y. */
      if (o.type === 'Text' || o.type === 'BitmapText') return;
      if (!o.texture || !o.texture.key) return;
      out.push(o);
    });
    return out;
  }

  function calibrar(scene, spr, colisiones) {
    var r = lineaDeSuelo(scene, spr, colisiones);
    spr.setDepth(r.y);
    spr.__gfProf = r.fuente;
    spr.setData && spr.setData('lineaSuelo', r.y);

    /* ¿Y este objeto tiene UNA sola línea de suelo, o varias?

       Solo se intenta partir lo que es ANCHO y lo que tiene colisiones de
       verdad (fuente 'sonda'). Con los píxeles no se puede: en un árbol el
       borde de abajo del dibujo baja y sube con la copa, y partirlo por ahí
       dejaría al jugador pasando por delante de media copa. Lo que se puede
       medir andando —una fachada— sí es de fiar. */
    if (r.fuente === 'sonda' && (spr.displayWidth || 0) >= FRANJA_ANCHO_MIN) {
      try {
        var caja = cajaMundo(spr);
        var franjas = franjasDe(sondearColumnas(scene, caja, spr));
        if (franjas) {
          var n = partir(scene, spr, franjas, caja);
          if (n > 1) {
            r.franjas = n;
            spr.__gfProf = 'franjas';
            log('partido en', n, 'franjas:', spr.texture && spr.texture.key,
                franjas.map(function (f) { return Math.round(f.y); }).join(' / '));
          }
        }
      } catch (e) { /* un objeto raro no puede parar a los demás */ }
    }
    return r;
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.children) return null;
    if (scene.__gfProf) { scene.__gfProf.pendientes = candidatos(scene); return scene.__gfProf; }

    var st = {
      scene: scene,
      pendientes: candidatos(scene),
      hechos: 0,
      porFuente: { sonda: 0, pared: 0, pixeles: 0, sprite: 0, franjas: 0 },
      partidos: [],
      porFrame: opciones.porFrame || POR_FRAME
    };
    scene.__gfProf = st;

    /* EL REPASO DE LAS FRANJAS VA EN `postupdate`, NO EN `update`.

       Las franjas siguen al original: recorte de cámara, tinte del ratón, el
       balanceo del viento, objetos que se mueven. Y tienen que verlo TODO YA,
       en el mismo fotograma.

       `update` de la escena se emite ANTES de Scene.update(), y el orden entre
       oyentes depende de quién se registró primero. Copiando ahí, cualquiera
       que toque el sprite después —el propio Scene.update(), o un módulo que se
       montara más tarde— dejaría las franjas un fotograma por detrás del
       original. Con un giro eso se ve como un corte: media casa girada y la
       otra media no.

       `postupdate` se emite cuando ya ha hablado todo el mundo. Ahí lo que se
       copia es el estado FINAL del fotograma, siempre. */
    st.onPost = function () {
      for (var f = st.partidos.length - 1; f >= 0; f--) {
        var dueno = st.partidos[f];
        if (!dueno || !dueno.scene || dueno.active === false) {
          if (dueno) quitarFranjas(dueno);
          st.partidos.splice(f, 1);
          continue;
        }
        refrescarFranjas(dueno);
      }
    };
    scene.events.on('postupdate', st.onPost);

    st.onUpdate = function () {
      if (!st.pendientes.length) return;
      var colisiones = [scene.collisionRectangles, scene.collisionRectangles1,
                        scene.collisionRectangles2];
      /* Sin colisiones cargadas todavía no se mide nada: se calibraría todo
         por píxeles y luego habría que rehacerlo. Se espera. */
      var hayColisiones = colisiones.some(function (a) { return a && a.length; });
      /* Y el ÍNDICE, no solo la lista: la sonda va contra el índice espacial y
         sin él caeríamos al método viejo justo en los primeros frames, que es
         cuando se calibra todo. Se espera; son unos pocos frames. */
      var hayIndice = !!scene._idxColision;
      if ((!hayColisiones || !hayIndice) && !opciones.sinEsperarColisiones) return;

      var n = Math.min(st.porFrame, st.pendientes.length);
      for (var i = 0; i < n; i++) {
        var spr = st.pendientes.shift();
        if (!spr || !spr.active) continue;
        try {
          var r = calibrar(scene, spr, colisiones);
          if (st.porFuente[r.fuente] === undefined) st.porFuente[r.fuente] = 0;
          st.porFuente[r.fuente]++;
          if (r.franjas > 1) {
            st.porFuente.franjas++;
            st.partidos.push(spr);
          }
          st.hechos++;
        } catch (e) { /* un objeto raro no puede parar a los demás */ }
      }
      if (!st.pendientes.length) {
        log('calibrados', st.hechos, 'objetos:', JSON.stringify(st.porFuente));
      }
    };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montado con', st.pendientes.length, 'objetos por calibrar');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfProf;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onPost) scene.events.off('postupdate', st.onPost);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    /* Las copias de las franjas son objetos de dibujo que creó este módulo:
       se van con él. Si no, al volver a la escena se calibraría otra vez y se
       crearía un segundo juego de copias encima del primero. */
    for (var i = 0; i < st.partidos.length; i++) quitarFranjas(st.partidos[i]);
    st.partidos.length = 0;
    scene.__gfProf = null;
  }

  /** Vuelve a mirar si hay objetos nuevos sin calibrar (chunks, spawns...). */
  function recalcular(scene) {
    var st = scene && scene.__gfProf;
    if (!st) return 0;
    var nuevos = candidatos(scene);
    st.pendientes = st.pendientes.concat(nuevos);
    return nuevos.length;
  }

  window.GFProfundidad = {
    montar: montar,
    desmontar: desmontar,
    recalcular: recalcular,
    medir: medir,
    lineaDeSuelo: lineaDeSuelo,
    /** Las franjas de un objeto, para mirarlo desde la consola. */
    franjasDe: function (scene, spr) {
      return franjasDe(sondearColumnas(scene, cajaMundo(spr), spr));
    },
    quitarFranjas: quitarFranjas,
    piesDe: piesDe,
    sobranteAbajo: sobranteAbajo,
    /**
     * Para mirar desde la consola de dónde ha salido la profundidad de cada
     * objeto y cuál queda mal:
     *   GFProfundidad.diagnostico(game.scene.getScenes(true)[0])
     */
    diagnostico: function (scene) {
      var out = [];
      if (!scene || !scene.children) return out;
      scene.children.each(function (o) {
        if (!o || !o.__gfProf || typeof o.getData !== 'function') return;
        var caja = cajaMundo(o);
        out.push({
          clave: (o.texture && o.texture.key) || '?',
          fuente: o.__gfProf,
          profundidad: Math.round(o.depth),
          pieDelSprite: Math.round(caja.abajo),
          // Cuánto se ha corregido: si es 0 es que la sonda no encontró nada.
          correccion: Math.round(caja.abajo - o.depth)
        });
      });
      out.sort(function (a, b) { return b.correccion - a.correccion; });
      return out;
    },
    estado: function (scene) {
      var st = scene && scene.__gfProf;
      if (!st) return null;
      return { pendientes: st.pendientes.length, hechos: st.hechos,
               porFuente: st.porFuente, partidos: st.partidos.length };
    },
    _interno: { cajaMundo: cajaMundo, paredDe: paredDe, candidatos: candidatos,
                sondearColumnas: sondearColumnas, partir: partir,
                refrescarFranjas: refrescarFranjas, percentil: percentil,
                franjasDe: franjasDe, reconstruir: reconstruir, armar: armar,
                peorError: peorError,
                FRANJA_UMBRAL: FRANJA_UMBRAL, FRANJA_ERROR: FRANJA_ERROR,
                FRANJA_MAX: FRANJA_MAX, FRANJA_ANCHO_MIN: FRANJA_ANCHO_MIN,
                FRANJA_SOLAPE: FRANJA_SOLAPE, FRANJA_PCT: FRANJA_PCT,
                FRANJA_SOLIDO_MIN: FRANJA_SOLIDO_MIN,
                sondearSuelo: sondearSuelo, SONDA_PCT: SONDA_PCT,
                SONDA_PASO_X: SONDA_PASO_X, SONDA_DESDE: SONDA_DESDE,
                calibrar: calibrar, SOLAPE_MIN: SOLAPE_MIN,
                DESBORDE_MAX: DESBORDE_MAX, ALFA_MIN: ALFA_MIN,
                limpiarCache: function () { cacheMedidas = {}; } }
  };
})();
