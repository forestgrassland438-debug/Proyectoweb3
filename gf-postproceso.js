/* ===========================================================================
 * POST-PROCESADO: LO QUE LE PASA A LA IMAGEN DESPUÉS DE PINTARLA
 *
 * QUÉ HACE
 *   Coge el fotograma ya terminado y lo trata como si fuera una foto: le pone
 *   viñeta, desenfoca los bordes, corrige el color según el tiempo que hace y
 *   la hora del día, y le añade destello en las luces. Todo en la tarjeta
 *   gráfica, en una sola pasada, sin tocar un solo objeto del juego.
 *
 * POR QUÉ EN UN SHADER Y NO CON SPRITES
 *   Un degradado oscuro por encima se puede hacer con una imagen estirada, y
 *   eso es lo que hacía el juego. Pero DESENFOCAR no: para desenfocar hay que
 *   leer los píxeles de alrededor, y eso solo se puede hacer en el shader. Y
 *   ya puestos, el color y la viñeta salen gratis en la misma pasada — en vez
 *   de tres sprites a pantalla completa, cero.
 *
 * LO QUE SE VE (y por qué está)
 *   · VIÑETA        Las esquinas se apagan. Centra la mirada donde está el
 *                   personaje. Es lo que hace que una captura parezca un
 *                   fotograma y no un pantallazo.
 *   · ENFOQUE       El centro queda nítido y los bordes se van a desenfoque,
 *                   como una lente de verdad. Y NO ES FIJO: se abre cuando
 *                   corres y se cierra cuando te paras, se cierra con la
 *                   lluvia (el aire lleva agua) y se abre a pleno sol.
 *   · COLOR         Temperatura, saturación, contraste y brillo. Es lo que
 *                   separa de verdad un día de otoño de uno de invierno, mucho
 *                   más que teñir la pantalla de naranja.
 *   · DESTELLO      Las cosas claras derraman luz sobre lo que tienen al lado.
 *                   El sol, el fuego, un relámpago.
 *   · ABERRACIÓN    Los bordes separan un pelo el rojo del azul, como una
 *                   lente barata. Muy poco: si se nota, está mal puesto.
 *   · GRANO         Un rumor de ruido en la tormenta y de noche. Tapa el
 *                   bandeado de los degradados y da textura de película.
 *
 * NO ROMPE NADA SI NO SE PUEDE
 *   Si el juego arranca en canvas (sin WebGL), si el shader no compila o si la
 *   calidad está en baja, el módulo se queda quieto y el juego se ve
 *   exactamente como antes. Nunca lanza.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFPost && window.GFPost.montar(this);
 *
 * API
 *   GFPost.montar(scene) / desmontar(scene)
 *   GFPost.pulso(fuerza)          un fogonazo de luz (lo llama el relámpago)
 *   GFPost.probar('lluvia')       para mirar un look sin esperar al clima
 *   GFPost.ajustar({...})         retoque manual encima del clima
 *   GFPost.estado()
 * ======================================================================== */
(function () {
  'use strict';

  var NOMBRE = 'gf-post';

  function log() {
    if (!window.GF_POST_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[post]');
    console.log.apply(console, a);
  }

  /* ══════════════════════════════════════════════════════════════════════
     LOS LOOKS
     ──────────────────────────────────────────────────────────────────────
     Cada tiempo es un revelado distinto. No se trata de "ponerle un filtro
     azul a la lluvia": se trata de que en un día de lluvia el aire lleva agua
     —así que hay menos contraste, menos saturación y menos profundidad de
     campo— y en un día de sol pasa lo contrario.

     Los números son los de una cámara:
       enfoque    [nítido hasta, desenfocado del todo en, píxeles de radio]
                  el 0 es el centro de la pantalla y el 1 la esquina
       vineta     [dónde empieza a apagarse, cuánto]
       tinte      [r, g, b, cuánto]  se multiplica: es luz de color, no un velo
       ajuste     [saturación, contraste, brillo]
       extras     [destello, grano, aberración]
     ══════════════════════════════════════════════════════════════════════ */
  var LOOKS = {
    /* El día normal. Casi nada: el juego está pintado para verse así, y el
       post-procesado tiene que notarse solo cuando pasa algo. */
    normal: {
      enfoque: [0.72, 1.30, 1.5],
      vineta:  [0.62, 0.20],
      tinte:   [1.00, 1.00, 1.00, 0.00],
      ajuste:  [1.04, 1.02, 1.00],
      extras:  [0.10, 0.010, 0.20]
    },

    /* SOL. Aire limpio: se ve lejos, así que casi no hay desenfoque. La luz
       rebota en todo, así que el destello sube y el contraste baja un pelo en
       las sombras. El tinte es cálido pero muy suave — pasarse aquí es lo que
       convierte un día soleado en un filtro de Instagram. */
    soleado: {
      enfoque: [0.80, 1.40, 1.1],
      vineta:  [0.70, 0.14],
      tinte:   [1.06, 1.01, 0.92, 0.55],
      ajuste:  [1.16, 1.05, 1.05],
      extras:  [0.34, 0.006, 0.28]
    },

    /* LLUVIA. El agua en el aire come contraste y color, y acorta la vista:
       el desenfoque empieza mucho antes y llega más lejos. Frío, pero no azul
       de postal: gris azulado, que es de lo que se pone el mundo mojado. */
    lluvia: {
      enfoque: [0.42, 1.05, 4.2],
      vineta:  [0.48, 0.36],
      tinte:   [0.90, 0.95, 1.06, 0.72],
      ajuste:  [0.82, 0.94, 0.94],
      extras:  [0.06, 0.030, 0.45]
    },

    /* TORMENTA. Lo mismo pero apretado: más oscuro, más cerrado, más grano.
       Y el destello alto a propósito, porque es lo que hace que el fogonazo
       del relámpago reviente bien. */
    tormenta: {
      enfoque: [0.34, 1.00, 5.6],
      vineta:  [0.40, 0.50],
      tinte:   [0.84, 0.90, 1.08, 0.85],
      ajuste:  [0.72, 1.06, 0.86],
      extras:  [0.16, 0.055, 0.60]
    },

    /* NIEVE. Todo lo contrario a la tormenta: mucha luz, poco contraste, el
       blanco lo aplana todo. Y frío de verdad. La viñeta se abre porque en un
       día de nieve no hay esquinas oscuras. */
    nieve: {
      enfoque: [0.52, 1.15, 3.0],
      vineta:  [0.72, 0.16],
      tinte:   [0.93, 0.97, 1.09, 0.60],
      ajuste:  [0.80, 0.90, 1.10],
      extras:  [0.26, 0.014, 0.30]
    },

    /* VIENTO sin lluvia: día seco y despejado, algo más de contraste y de
       nitidez de la cuenta, como cuando el aire se lleva el polvo. */
    viento: {
      enfoque: [0.78, 1.35, 1.4],
      vineta:  [0.64, 0.20],
      tinte:   [1.02, 1.01, 0.99, 0.30],
      ajuste:  [1.10, 1.06, 1.01],
      extras:  [0.14, 0.010, 0.24]
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     LAS ESTACIONES, EN CLAVE DE REVELADO
     ──────────────────────────────────────────────────────────────────────
     gf-clima ya tiñe el mundo con un MULTIPLY por estación, y eso está bien
     para el COLOR. Lo que un tinte no puede dar es lo demás: que en otoño la
     luz sea más baja y más contrastada, que en invierno todo esté lavado, que
     en primavera el verde cante. Eso es lo que hay aquí, y por eso son
     RETOQUES (se suman a lo que diga el tiempo) y no looks enteros.
     ══════════════════════════════════════════════════════════════════════ */
  var ESTACIONES = {
    primavera: { tinte: [1.01, 1.04, 0.99], tinteMas: 0.30,
                 sat:  0.10, con:  0.01, bri:  0.02, vin: -0.02, destello: 0.04 },
    verano:    { tinte: [1.04, 1.01, 0.95], tinteMas: 0.25,
                 sat:  0.06, con:  0.03, bri:  0.03, vin: -0.03, destello: 0.08 },
    otono:     { tinte: [1.08, 0.98, 0.86], tinteMas: 0.50,
                 sat: -0.04, con:  0.07, bri: -0.03, vin:  0.06, destello: 0.02 },
    invierno:  { tinte: [0.94, 0.98, 1.08], tinteMas: 0.45,
                 sat: -0.16, con: -0.04, bri:  0.02, vin:  0.02, destello: 0.05 }
  };

  /* LA NOCHE.

     No es "lo mismo pero oscuro". El ojo de noche pierde color y pierde
     nitidez fuera del centro, y por eso una escena nocturna con la misma
     profundidad de campo que una diurna se ve falsa. gf-ciclo-dia ya apaga la
     luz; aquí se le añade lo demás. Se aplica en proporción a la oscuridad,
     así que al atardecer entra sola. */
  var NOCHE = {
    sat: -0.34, con: -0.06, bri: -0.02,
    vineta: 0.24, foco: -0.20, radio: 2.6, grano: 0.030
  };

  /* Cuánto tarda cada cosa en llegar a su valor nuevo. Todo se mueve DESPACIO:
     un cambio de enfoque que se ve "cambiar" está mal hecho. */
  var ENTRA_MS   = 2600;
  var ENFOQUE_MS = 1400;    // el enfoque, algo más ágil: es el que sigue al jugador

  /* EL ENFOQUE SIGUE AL JUGADOR.

     Parado, el ojo se queda mirando una cosa y el resto se va: el foco se
     cierra. Corriendo, la mirada se abre para ver por dónde vas. Es una
     tontería de dos números y es lo que hace que el desenfoque parezca una
     cámara y no un marco pegado a la pantalla. */
  var QUIETO_MS   = 900;    // cuánto hay que estarse quieto para que se cierre
  var FOCO_QUIETO = -0.16;  // se cierra (más desenfoque de borde)
  var FOCO_ANDANDO = 0.10;  // se abre

  // ── El shader ──────────────────────────────────────────────────────────

  /**
   * El código del shader, montado según la calidad.
   *
   * `conTaps` decide si se compila la parte cara —el desenfoque, el destello
   * ancho y la aberración— o si solo se hace color y viñeta. No es un `if` en
   * tiempo de ejecución a propósito: una rama que no se ejecuta en un shader
   * sigue costando registros, y en una GPU de móvil eso se nota. Dos programas
   * distintos y cada uno paga solo lo suyo.
   */
  function fuente(conTaps) {
    return [
      'precision mediump float;',
      'uniform sampler2D uMainSampler;',
      'uniform vec2  uResolucion;',
      'uniform float uTiempo;',
      'uniform vec3  uEnfoque;',      // x nítido hasta, y desenfocado en, z radio px
      'uniform vec2  uVineta;',       // x empieza, y fuerza
      'uniform vec3  uVinetaColor;',
      'uniform vec4  uTinte;',        // rgb + cuánto
      'uniform vec3  uAjuste;',       // saturación, contraste, brillo
      'uniform vec3  uExtras;',       // destello, grano, aberración
      'varying vec2 outTexCoord;',
      '',
      'float ruido(vec2 p) {',
      '  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);',
      '}',
      '',
      'void main() {',
      '  vec2 uv = outTexCoord;',
      /* La distancia al centro, corregida por la forma de la pantalla. Sin
         corregir, en una pantalla ancha la viñeta sale ovalada y el desenfoque
         entra antes por arriba que por los lados. */
      '  float aspecto = uResolucion.x / max(uResolucion.y, 1.0);',
      '  vec2  rad = vec2((uv.x - 0.5) * aspecto, uv.y - 0.5);',
      '  float d = length(rad) / length(vec2(0.5 * aspecto, 0.5));',
      '',
      '  float foco = smoothstep(uEnfoque.x, uEnfoque.y, d);',
      '  vec4 col;',
      conTaps ? [
        /* EL DESENFOQUE.

           Ocho muestras en dos anillos girados 45 grados entre sí. Ocho y no
           cuatro porque con cuatro se ve la cruz; ocho y no dieciséis porque a
           partir de ahí no se nota y el coste sí.

           El radio va en píxeles y se pasa a coordenadas de textura aquí, así
           que el desenfoque se ve igual de ancho en cualquier resolución — que
           es justo lo que fallaba al hacerlo con sprites. */
        '  float r = foco * uEnfoque.z;',
        '  vec2  px = vec2(r / uResolucion.x, r / uResolucion.y);',
        '  if (r > 0.15) {',
        '    col  = texture2D(uMainSampler, uv) * 0.20;',
        '    col += texture2D(uMainSampler, uv + vec2( px.x,  0.0)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2(-px.x,  0.0)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2( 0.0,  px.y)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2( 0.0, -px.y)) * 0.10;',
        '    vec2 q = px * 0.62;',
        '    col += texture2D(uMainSampler, uv + vec2( q.x,  q.y)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2(-q.x,  q.y)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2( q.x, -q.y)) * 0.10;',
        '    col += texture2D(uMainSampler, uv + vec2(-q.x, -q.y)) * 0.10;',
        '  } else {',
        '    col = texture2D(uMainSampler, uv);',
        '  }',
        '',
        /* ABERRACIÓN CROMÁTICA. El rojo y el azul se separan hacia fuera,
           como en una lente barata. Solo en el borde y muy poco: si se ve,
           está mal puesta. */
        '  if (uExtras.z > 0.001) {',
        '    vec2 sep = rad * uExtras.z * d * d * 0.010;',
        '    col.r = texture2D(uMainSampler, uv - sep).r;',
        '    col.b = texture2D(uMainSampler, uv + sep).b;',
        '  }',
        '',
        /* DESTELLO. Se lee el entorno bien ancho, se coge solo lo MUY claro y
           se suma. No es un bloom de verdad —eso pide otra pasada— pero hace
           lo que tiene que hacer: que el sol, el fuego y el relámpago derramen
           luz sobre lo que tienen al lado. */
        '  if (uExtras.x > 0.001) {',
        '    vec2 g = vec2(5.0 / uResolucion.x, 5.0 / uResolucion.y);',
        '    vec3 ancho = texture2D(uMainSampler, uv + vec2( g.x,  g.y)).rgb',
        '               + texture2D(uMainSampler, uv + vec2(-g.x,  g.y)).rgb',
        '               + texture2D(uMainSampler, uv + vec2( g.x, -g.y)).rgb',
        '               + texture2D(uMainSampler, uv + vec2(-g.x, -g.y)).rgb;',
        '    ancho *= 0.25;',
        '    float lum = dot(ancho, vec3(0.2126, 0.7152, 0.0722));',
        '    float alto = max(0.0, lum - 0.62) / 0.38;',
        '    col.rgb += ancho * alto * alto * uExtras.x;',
        '  }'
      ].join('\n') : '  col = texture2D(uMainSampler, uv);',
      '',
      /* ── REVELADO ──
         Saturación primero, contraste después y brillo al final: es el orden
         de un revelado de verdad, y cambiarlo cambia el resultado. */
      '  float luma = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));',
      '  col.rgb = mix(vec3(luma), col.rgb, uAjuste.x);',
      '  col.rgb = (col.rgb - 0.5) * uAjuste.y + 0.5;',
      '  col.rgb *= uAjuste.z;',
      /* El tinte MULTIPLICA. Multiplicar es teñir la luz; superponer es echar
         un cristal de color por delante y aplastar el dibujo. Es la misma
         razón por la que el filtro de estación de gf-clima usa MULTIPLY. */
      '  col.rgb = mix(col.rgb, col.rgb * uTinte.rgb, uTinte.a);',
      '',
      '  float v = smoothstep(uVineta.x, 1.16, d) * uVineta.y;',
      '  col.rgb = mix(col.rgb, uVinetaColor * luma * 0.35, v);',
      '',
      /* GRANO. Barato, temporal (cambia cada fotograma) y sin él los
         degradados grandes —la cortina de tormenta, la capa de noche— salen a
         bandas en cuanto la pantalla es grande. */
      '  if (uExtras.y > 0.0001) {',
      '    float g2 = ruido(uv * uResolucion + fract(uTiempo * 0.001) * 371.0) - 0.5;',
      '    col.rgb += g2 * uExtras.y;',
      '  }',
      '',
      '  gl_FragColor = vec4(clamp(col.rgb, 0.0, 1.0), 1.0);',
      '}'
    ].join('\n');
  }

  /* El estado que lee el shader. Vive fuera de la clase a propósito: la
     tubería se registra UNA vez en el juego y puede sobrevivir a un cambio de
     escena, así que no puede guardar ella el estado de la escena. */
  var V = null;                 // valores que se están pintando ahora
  var destino = null;           // hacia dónde van
  var montado = null;           // { scene, cam, clave }
  var registrado = {};          // qué tuberías ya están dadas de alta

  function nuevoValor() {
    var L = LOOKS.normal;
    return {
      focoDe: L.enfoque[0], focoA: L.enfoque[1], radio: L.enfoque[2],
      vinEn: L.vineta[0], vinF: L.vineta[1],
      vinR: 0.04, vinG: 0.04, vinB: 0.07,
      tinR: 1, tinG: 1, tinB: 1, tinF: 0,
      sat: L.ajuste[0], con: L.ajuste[1], bri: L.ajuste[2],
      destello: L.extras[0], grano: L.extras[1], aberracion: L.extras[2],
      pulso: 0
    };
  }

  // ── La tubería ─────────────────────────────────────────────────────────

  function claseTuberia(conTaps) {
    var P = window.Phaser;
    var Base = P && P.Renderer && P.Renderer.WebGL &&
               P.Renderer.WebGL.Pipelines && P.Renderer.WebGL.Pipelines.PostFXPipeline;
    if (!Base) return null;

    /* Se usa `class` y no una función a la vieja usanza porque las tuberías de
       Phaser SON clases de ES6, y a una clase de ES6 no se le puede llamar al
       constructor con .call(). Es la única parte del módulo que lo necesita. */
    return class extends Base {
      constructor(game) {
        super({ game: game, name: NOMBRE + (conTaps ? '' : '-ligero'),
                fragShader: fuente(conTaps) });
      }
      onPreRender() {
        if (!V) return;
        var w = this.renderer ? this.renderer.width : 1;
        var h = this.renderer ? this.renderer.height : 1;
        var p = V.pulso || 0;
        this.set2f('uResolucion', w || 1, h || 1);
        /* El reloj se da ENVUELTO en diez segundos, no en crudo.

           En mediump —lo que usa cualquier GPU de movil— un numero de siete
           cifras se queda sin decimales, asi que a la media hora de partida
           performance.now() ya no cambia lo suficiente entre fotogramas y el
           grano se QUEDA QUIETO: en vez de ruido de pelicula se ve una capa de
           suciedad pegada a la pantalla. */
        var ms = (window.performance && performance.now()) || Date.now();
        this.set1f('uTiempo', ms % 10000);
        this.set3f('uEnfoque', V.focoDe, V.focoA, V.radio);
        this.set2f('uVineta', V.vinEn, Math.max(0, V.vinF - p * 0.5));
        this.set3f('uVinetaColor', V.vinR, V.vinG, V.vinB);
        this.set4f('uTinte', V.tinR, V.tinG, V.tinB, V.tinF * (1 - p * 0.6));
        // El fogonazo del relámpago sube brillo y baja saturación de golpe.
        this.set3f('uAjuste', V.sat * (1 - p * 0.35), V.con, V.bri * (1 + p * 0.55));
        this.set3f('uExtras', V.destello + p * 0.9, V.grano, V.aberracion);
      }
    };
  }

  /**
   * Registra la tubería en el juego (una vez) y devuelve su clave.
   * Devuelve null si no hay WebGL o si el shader no compila: en los dos casos
   * el juego se queda como estaba y no pasa nada más.
   */
  function preparar(game, conTaps) {
    if (!game || !game.renderer) return null;
    var P = window.Phaser;
    if (!P || game.renderer.type !== P.WEBGL) { log('sin WebGL: no hay post'); return null; }
    if (!game.renderer.pipelines || !game.renderer.pipelines.addPostPipeline) return null;

    var clave = NOMBRE + (conTaps ? '' : '-ligero');
    if (registrado[clave]) return clave;

    var Clase = claseTuberia(conTaps);
    if (!Clase) return null;
    try {
      game.renderer.pipelines.addPostPipeline(clave, Clase);
      registrado[clave] = true;
      log('tubería lista:', clave);
      return clave;
    } catch (e) {
      console.warn('[post] no se pudo registrar la tubería:', e && e.message);
      return null;
    }
  }

  /* ¿ESTO ES UN MÓVIL?

     Importa mucho, porque la parte cara del shader —las ocho muestras del
     desenfoque, las cuatro del destello y las dos de la aberración— son quince
     lecturas de textura POR PÍXEL. En un portátil no se nota; en un teléfono a
     pantalla completa es la diferencia entre ir fino e ir a tirones, y este
     juego ya va capado a 30 fps en móvil justamente por eso.

     Se pregunta a Phaser (game.device.os), que mira el user-agent. No es
     infalible, pero para "¿teléfono o no?" acierta, y equivocarse solo cuesta
     que un móvil raro se quede sin desenfoque de bordes — nunca que se rompa
     nada. Se puede forzar con GFPost.montar(scene, { forzarTaps: true }).

     A propósito NO se mira deviceMemory ni hardwareConcurrency: en este
     proyecto ya se comprobó que mienten. */
  function esMovil(game) {
    try {
      var d = game && game.device && game.device.os;
      if (d && (d.android || d.iOS || d.iPhone || d.iPad || d.windowsPhone)) return true;
    } catch (e) {}
    try {
      return (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
    } catch (e) {}
    return false;
  }

  /** alta / media / baja, según lo que tenga puesto el jugador. */
  function calidad() {
    try {
      if (window.GFGraphics && window.GFGraphics.get) {
        return window.GFGraphics.get().calidad || 'alta';
      }
    } catch (e) {}
    return 'alta';
  }

  // ── El look que toca ───────────────────────────────────────────────────

  function climaAhora() {
    var e = null;
    try { if (window.GFClima && window.GFClima.estado) e = window.GFClima.estado(); } catch (x) {}
    return e || {};
  }

  function oscuridad() {
    try {
      if (window.GFCiclo && window.GFCiclo.oscuridad) {
        var o = window.GFCiclo.oscuridad();
        if (typeof o === 'number' && isFinite(o)) return Math.max(0, Math.min(1, o));
      }
    } catch (e) {}
    return 0;
  }

  function mezclar(a, b, t) { return a + (b - a) * t; }

  /**
   * Calcula hacia dónde tiene que ir la imagen: se parte del look del tiempo
   * que hace, se le suma el retoque de la estación y luego el de la noche.
   *
   * Los tres se mezclan por PESO y no se pisan: cuando la lluvia está a media
   * fuerza, la imagen está a medio camino entre el día normal y la lluvia. Sin
   * eso, empezar a llover cambiaría el revelado de golpe.
   */
  function calcularDestino(st) {
    var e = climaAhora();
    var base = LOOKS.normal;
    var look = base, peso = 0;

    if (e.activo) {
      if (e.lluvia && e.truenos)      { look = LOOKS.tormenta; peso = e.lluviaFuerza; }
      else if (e.lluvia)              { look = LOOKS.lluvia;   peso = e.lluviaFuerza; }
      else if (e.nieve)               { look = LOOKS.nieve;    peso = e.nieveFuerza; }
      else if (e.soleado)             { look = LOOKS.soleado;  peso = e.soleadoFuerza; }
      else if (e.viento)              { look = LOOKS.viento;   peso = 0.8; }
    }
    if (typeof peso !== 'number' || !isFinite(peso)) peso = 1;
    peso = Math.max(0, Math.min(1, peso));
    if (st.forzado && LOOKS[st.forzado]) { look = LOOKS[st.forzado]; peso = 1; }

    var d = {
      focoDe: mezclar(base.enfoque[0], look.enfoque[0], peso),
      focoA:  mezclar(base.enfoque[1], look.enfoque[1], peso),
      radio:  mezclar(base.enfoque[2], look.enfoque[2], peso),
      vinEn:  mezclar(base.vineta[0],  look.vineta[0],  peso),
      vinF:   mezclar(base.vineta[1],  look.vineta[1],  peso),
      tinR:   mezclar(base.tinte[0],   look.tinte[0],   peso),
      tinG:   mezclar(base.tinte[1],   look.tinte[1],   peso),
      tinB:   mezclar(base.tinte[2],   look.tinte[2],   peso),
      tinF:   mezclar(base.tinte[3],   look.tinte[3],   peso),
      sat:    mezclar(base.ajuste[0],  look.ajuste[0],  peso),
      con:    mezclar(base.ajuste[1],  look.ajuste[1],  peso),
      bri:    mezclar(base.ajuste[2],  look.ajuste[2],  peso),
      destello:   mezclar(base.extras[0], look.extras[0], peso),
      grano:      mezclar(base.extras[1], look.extras[1], peso),
      aberracion: mezclar(base.extras[2], look.extras[2], peso),
      vinR: 0.04, vinG: 0.04, vinB: 0.07
    };

    // ── La estación, encima ──
    var E = ESTACIONES[e.estacion] || null;
    if (E) {
      d.sat += E.sat; d.con += E.con; d.bri += E.bri;
      d.vinF += E.vin; d.destello += E.destello;

      /* CUÁNTO TIÑE LA ESTACIÓN DEPENDE DE LA HORA.
       *
       * EL FALLO QUE ARREGLA: el mundo se veía naranja todo el día. El ámbar
       * de otoño entraba a fuerza fija de sol a sol, y a mediodía —con el sol
       * vertical— eso no es otoño, es un filtro puesto encima.
       *
       * `GFClima.calidez()` vale 0 a mediodía y 1 al ras del horizonte, así
       * que el tinte de la estación se queda en un tercio con el sol alto y
       * sube al doble en la hora dorada. El color de otoño no desaparece
       * (sigue habiendo hojas y luz cálida): deja de ser una gelatina.
       */
      var cal = 0.5;
      try {
        if (window.GFClima && window.GFClima.calidez) cal = window.GFClima.calidez();
      } catch (x) {}
      var horaDorada = 0.34 + 1.66 * Math.max(0, Math.min(1, cal));

      /* El tinte de la estación se COMPONE con el del tiempo en vez de
         sustituirlo: un día de lluvia en otoño no es ni el gris de la lluvia
         ni el ámbar del otoño, es los dos. */
      var q = E.tinteMas * (1 - d.tinF * 0.5) * horaDorada;
      q = Math.max(0, Math.min(1, q));
      d.tinR = d.tinR * (1 - q) + E.tinte[0] * q;
      d.tinG = d.tinG * (1 - q) + E.tinte[1] * q;
      d.tinB = d.tinB * (1 - q) + E.tinte[2] * q;
      d.tinF = Math.max(d.tinF, q);
    }

    // ── La noche, encima de todo ──
    var n = oscuridad();
    if (n > 0.001) {
      d.sat += NOCHE.sat * n;
      d.con += NOCHE.con * n;
      d.bri += NOCHE.bri * n;
      d.vinF += NOCHE.vineta * n;
      d.focoDe += NOCHE.foco * n;
      d.radio += NOCHE.radio * n;
      d.grano += NOCHE.grano * n;
      // Y la viñeta de noche es azul, no negra: el ojo ve azul en penumbra.
      d.vinR = 0.02; d.vinG = 0.03; d.vinB = 0.10;
    }

    // ── El enfoque sigue al jugador ──
    d.focoDe += st.quieto ? FOCO_QUIETO : FOCO_ANDANDO;

    // ── Retoque manual (GFPost.ajustar), si lo hay ──
    if (st.manual) {
      for (var k in st.manual) {
        if (Object.prototype.hasOwnProperty.call(st.manual, k) &&
            typeof d[k] === 'number') d[k] = st.manual[k];
      }
    }

    // Topes de cordura: ni el foco al revés ni saturaciones negativas.
    d.focoDe = Math.max(0.05, Math.min(1.2, d.focoDe));
    d.focoA  = Math.max(d.focoDe + 0.12, d.focoA);
    d.radio  = Math.max(0, Math.min(14, d.radio));
    d.vinF   = Math.max(0, Math.min(0.85, d.vinF));
    d.sat    = Math.max(0, Math.min(2, d.sat));
    d.con    = Math.max(0.4, Math.min(2, d.con));
    d.bri    = Math.max(0.3, Math.min(1.8, d.bri));
    d.grano  = Math.max(0, Math.min(0.12, d.grano));
    return d;
  }

  /** Acerca cada número a su destino. Nada salta: todo se desliza. */
  function acercar(st, delta) {
    if (!destino) return;
    var lento  = Math.min(1, delta / ENTRA_MS);
    var agil   = Math.min(1, delta / ENFOQUE_MS);
    for (var k in destino) {
      if (!Object.prototype.hasOwnProperty.call(destino, k)) continue;
      if (typeof V[k] !== 'number') { V[k] = destino[k]; continue; }
      var paso = (k === 'focoDe' || k === 'focoA' || k === 'radio') ? agil : lento;
      V[k] += (destino[k] - V[k]) * paso;
    }
    // El fogonazo se apaga solo, y deprisa: es un relámpago, no un amanecer.
    if (V.pulso > 0) {
      V.pulso -= delta / 240;
      if (V.pulso < 0) V.pulso = 0;
    }
  }

  /** ¿El jugador está quieto? Se mira si se ha movido, no si pulsa teclas. */
  function vigilarJugador(st, ahora) {
    var p = st.scene && (st.scene.player || st.scene.sprite_jj);
    if (!p || typeof p.x !== 'number') { st.quieto = false; return; }
    var movido = Math.abs(p.x - st.px) > 0.5 || Math.abs(p.y - st.py) > 0.5;
    st.px = p.x; st.py = p.y;
    if (movido) st.ultimoMovimiento = ahora;
    st.quieto = (ahora - st.ultimoMovimiento) > QUIETO_MS;
  }

  // ── Montaje ────────────────────────────────────────────────────────────

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.cameras || !scene.cameras.main) return null;
    if (scene.__gfPost) return scene.__gfPost;

    var cal = opciones.calidad || calidad();
    if (cal === 'baja' && !opciones.forzar) {
      log('calidad baja: el post-procesado se queda apagado');
      return null;
    }
    var juego = scene.game || (scene.sys && scene.sys.game);
    var movil = esMovil(juego);
    var conTaps = (!!opciones.forzarTaps) || (cal === 'alta' && !movil);

    var clave = preparar(juego, conTaps);
    if (!clave) return null;

    var cam = scene.cameras.main;
    try {
      cam.setPostPipeline(clave);
    } catch (e) {
      console.warn('[post] la cámara no aceptó la tubería:', e && e.message);
      return null;
    }

    if (!V) V = nuevoValor();
    var st = {
      scene: scene, cam: cam, clave: clave, conTaps: conTaps, movil: movil,
      quieto: false, px: 0, py: 0, ultimoMovimiento: 0,
      forzado: null, manual: null
    };
    scene.__gfPost = st;
    montado = st;

    st.onUpdate = function (ahora, delta) {
      vigilarJugador(st, ahora);
      destino = calcularDestino(st);
      acercar(st, Math.min(delta, 100));
    };
    scene.events.on('update', st.onUpdate);

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    // Primer cálculo ya puesto, para no entrar a la escena con el look de ayer.
    destino = calcularDestino(st);
    for (var k in destino) {
      if (Object.prototype.hasOwnProperty.call(destino, k)) V[k] = destino[k];
    }
    log('montado —', clave, '(calidad', cal + (movil ? ', movil' : '') + ')');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfPost;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    try { if (st.cam && st.cam.resetPostPipeline) st.cam.resetPostPipeline(); } catch (e) {}
    scene.__gfPost = null;
    if (montado === st) montado = null;
  }

  /**
   * Un fogonazo. Lo llama el relámpago de gf-clima; también sirve para el
   * fuego o para cualquier cosa que tenga que dar un golpe de luz.
   * `fuerza` va de 0 a 1.
   */
  function pulso(fuerza) {
    if (!V) return;
    var f = Math.max(0, Math.min(1, typeof fuerza === 'number' ? fuerza : 1));
    if (f > V.pulso) V.pulso = f;
  }

  window.GFPost = {
    montar: montar,
    desmontar: desmontar,
    pulso: pulso,
    /** Fija un look a la fuerza, sin tocar el clima. GFPost.probar(null) lo suelta. */
    probar: function (nombre) {
      if (montado) montado.forzado = (nombre && LOOKS[nombre]) ? nombre : null;
      return montado ? montado.forzado : null;
    },
    /**
     * Retoque manual encima de todo lo demás, para afinar mirando:
     *   GFPost.ajustar({ radio: 8, vinF: 0.5 })
     *   GFPost.ajustar(null)   lo suelta
     */
    ajustar: function (obj) {
      if (montado) montado.manual = obj || null;
      return montado ? montado.manual : null;
    },
    estado: function () {
      return {
        montado: !!montado,
        clave: montado ? montado.clave : null,
        conDesenfoque: montado ? montado.conTaps : false,
        movil: montado ? montado.movil : null,
        calidad: calidad(),
        quieto: montado ? montado.quieto : null,
        forzado: montado ? montado.forzado : null,
        valores: V ? JSON.parse(JSON.stringify(V)) : null
      };
    },
    _interno: {
      LOOKS: LOOKS, ESTACIONES: ESTACIONES, NOCHE: NOCHE,
      fuente: fuente, calcularDestino: calcularDestino, acercar: acercar,
      nuevoValor: nuevoValor, preparar: preparar, esMovil: esMovil,
      get V() { return V; },
      set V(x) { V = x; }
    }
  };
})();
