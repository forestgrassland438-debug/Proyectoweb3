# Pack de arte `newpro`

**1842 PNG** dibujados para encajar con el arte que ya tiene Grassland Forest.
El lote 1 eran 214 (12 cultivos completos, 65 iconos de items y 1 personaje
jugable); hoy el pack lleva ademas peces, pociones, aparejo, comidas, la
animacion de pescar, 12 tilesets, arboles, casas y **un mapa completo de cada
tema**. El indice de todo esta en `newpro.json`.

**No se ha modificado ni un solo archivo existente del juego.** Todo vive dentro de
esta carpeta y nada se carga todavía: es material listo para engancharlo cuando quieras.

---

## 1. Cultivos — 12 cultivos, 120 imágenes

Cada cultivo trae el juego completo de 10 archivos, con la misma convención que
`Game/Objetos/Plantas/planta_trigo` y `planta_calabaza`, más una etapa extra:

| Archivo | Qué es | Tamaño |
|---|---|---|
| `1.png` … `5.png` | 5 etapas de crecimiento; la 5 es la madura y cosechable | 51×53 |
| `6.png` | **la misma planta madura, pero muerta** | 51×53 |
| `item_<x>_bueno/a.png` | cosecha en buen estado | ~13-27 px |
| `item_<x>_podrido/a.png` | cosecha podrida | igual que el bueno |
| `item_planta_<x>.png` | brote (estado "corta") | ~15-23 px |
| `item_semilla_<x>.png` | bolsa de semillas | 16×20 |

### La tierra cambia con la etapa, igual que en el juego

Las claves que carga `GameScene.js` (`tierra_seca`, `tierra_mojada ×3`,
`tierra_muerta`) describen **el suelo**, no la planta. Mirando los píxeles de los
cultivos del propio juego, la baldosa cambia de color:

| Etapa | Suelo | Base |
|---|---|---|
| `1.png` | seca | `#915c3e` |
| `2.png`–`5.png` | mojada | `#6d462e` |
| `6.png` | reseca y agrietada | `#8a6248` |

Los dos primeros valores están copiados del juego, así que una parcela de `newpro`
puesta al lado de un tomate del juego en la misma etapa tiene exactamente el mismo
suelo. El tercero es nuevo, porque la etapa muerta no existía.

### La etapa 6: planta madura muerta

No es un filtro sepia encima de la etapa 5. La planta se vuelve a dibujar entera,
porque una planta muerta no es una planta verde repintada: está caída y deshecha.

**Forma** — cinco cambios sobre la geometría, no sobre el color:

| | Qué pasa |
|---|---|
| vencida | las hojas cuelgan hacia abajo; los nudos altos caen más que los de la base, que ya están tocando la tierra |
| encogida | la hoja se estrecha y se acorta |
| doblada | el nervio se curva, la hoja deja de estar plana y tiesa |
| roída | el borde queda mordido y con algún agujero, como una hoja degradada |
| torcida | el tallo se dobla en vez de quedarse recto |

Se ve claro en la caña de azúcar y el maíz, que pasan de cañas verticales a cañas
dobladas, y en el girasol, al que se le vence el capítulo.

El fruto también se arruga (se le muerde el borde igual que a las hojas), así que
encoge lo justo para dejar ver el follaje que tiene detrás.

La mordida es proporcional al tamaño de cada hoja: en una hoja pequeña, la misma
erosión que en una grande la borraría del todo.

**Color** — la planta muerta **conserva su color**, no se vuelve marrón.

La regla no está inventada: sale de medir píxel a píxel las parejas bueno/podrido
que ya trae el juego. `item_tomate_bueno.png` y `item_tomate_malo.png` miden lo
mismo (16×17), igual que las dos zanahorias (19×25), así que se pueden comparar
posición a posición. Lo que hace el artista del juego:

| | Verde | Naranja / rojo |
|---|---|---|
| Tono | 0.25 → 0.14 | 0.01 → 0.10 |
| Saturación | 0.70 → 0.66 | 0.84 → 0.73 |
| Brillo | 0.45 → 0.25 | 0.89 → 0.45 **y** 0.94 → 0.86 |

Tres cosas: el **tono se acerca a oliva pero solo a medio camino** (no se
sustituye), la **saturación casi no se toca**, y el **brillo baja de forma
desigual** — ese desigual es el moteado de la podredumbre.

Por eso una zanahoria podrida del juego sigue siendo naranja y un tomate malo sigue
tirando a rojo. Aquí pasa lo mismo: la lechuga muerta sigue verde, el girasol sigue
amarillo, las berenjenas siguen moradas y el algodón sigue blanco. Encima se añaden
manchas de moho, que no son pintura pegada sino el color local muy oscurecido.

El color se aplica al final y **solo sobre la planta**, nunca sobre la tierra.

### Cómo está construida cada mata

Las plantas no son manchas de hojas colocadas a ojo. Cada hoja:

1. **nace en un nudo del tallo** y va unida a él por su **pecíolo**, así que nunca
   flota suelta ni deja el tallo desnudo entre medias;
2. **crece siguiendo un ángulo** propio, siempre hacia arriba y hacia fuera
   (90° ± 25-65°), como crece una planta de verdad;
3. lleva el **nervio central y los laterales en el eje de la hoja**, no cruzados: una
   hoja inclinada tiene el nervio inclinado;
4. se estampa **con su propio contorno**, y las hojas contiguas alternan dos verdes,
   para que al superponerse se distingan en vez de fundirse en un bloque.

Los nudos bajos llevan hojas más grandes y más abiertas, y los altos más pequeñas y
más verticales, que es la proporción natural.

### Cada planta tiene su propia hoja

Ninguna mata se parece a otra: no comparten forma, ni ángulo, ni densidad, ni verde.

| Carpeta | Planta | Tipo de hoja | Silueta |
|---|---|---|---|
| `planta_fresa/` | Fresa | trifoliada dentada | roseta baja y ancha, verde amarillento |
| `planta_patata/` | Patata | pinnada (raquis con pares de folíolos) | tallo erguido, follaje compuesto |
| `planta_pimiento/` | Pimiento | lanceolada puntiaguda | vertical y estrecha, verde oscuro |
| `planta_berenjena/` | Berenjena | ancha con nervios marcados | 5 hojas grandes, verde grisáceo, tallo morado |
| `planta_sandia/` | Sandía | palmada de 5 lóbulos + zarcillos | guía rastrera que cruza la baldosa |
| `planta_lechuga/` | Lechuga | rizada en cogollo | roseta apretada de hojas onduladas |
| `planta_remolacha/` | Remolacha | ancha con nervio rojo | roseta basal, pecíolos rojos, raíz asomando |
| `planta_algodon/` | Algodón | lobulada | arbusto con cápsulas de borra |
| `planta_cana_azucar/` | Caña de azúcar | cinta de gramínea | 4 cañas segmentadas verticales |
| `planta_maiz/` | Maíz | cinta de gramínea | 3 cañas con penacho y mazorcas al costado |
| `planta_cebolla/` | Cebolla | tubular | hojas huecas erguidas, bulbos medio enterrados |
| `planta_girasol/` | Girasol | acorazonada | tallo alto único con capítulo |

### La bolsa de semillas

Calcada de la del juego: misma silueta 16×20, mismo nudo y misma paleta de arpillera
(`#824a24` / `#8f572f` / `#62391f` / `#522d19`, contorno `#2c1a10`) que
`item_semilla_trigo.png` y `item_semilla_calabaza.png`. Solo cambia el icono del
frente. El de la fresa tiene forma de punta con pepitas, para que no parezca un tomate.

### El estado podrido

Misma silueta que el bueno, virada a oliva y con manchas de moho, que es exactamente
cómo están hechos `item_tomate_malo.png` y `item_zanahoria_podrida.png`.

---

## 2. Items — 65 iconos

| Carpeta | Contenido |
|---|---|
| `recursos/` (22) | lingotes de plata, bronce y acero · amatista · zafiro · cristal puro · arcilla · arena · cuerda · cuero · tela · hilo · fibra vegetal · resina · papel · tabla de madera · ladrillo · vidrio · clavos · carbón vegetal · mineral de plata · mineral de estaño |
| `naturaleza/` (14) | hongo rojo, azul y marrón · baya silvestre · flor azul, roja y amarilla · hierba medicinal · panal de miel · bellota · piña de pino · rama seca · pluma · hueso |
| `granja/` (5) | huevo · jarra de leche · lana · tarro de miel · saco de abono |
| `cocina/` (13) | pan · queso · pastel · sopa · pescado ahumado · mermelada · zumo · harina · azúcar · mantequilla · ensalada · brocheta · galleta |
| `utiles/` (11) | poción de vida, energía y maná · cubo de agua · llave · cebo de pesca · red de pesca · antorcha · martillo · hoz · pala |

### Dos sprites que el juego ya pedía y no existían

`tienda_sistema.js` (líneas 426-440) vende dos objetos apuntando a rutas que **no
existen en el disco**:

```
./Game/Source/pocion_vida.png
./Game/Source/pocion_energia.png
```

Los tienes en `utiles/pocion_vida.png` y `utiles/pocion_energia.png` (14×21, más
`pocion_mana.png`). Si los copias a `Game/Source/` con ese nombre exacto, la tienda
deja de mostrar imagen rota. Lo dejo en tu mano porque implica escribir dentro de una
carpeta existente.

---

## 3. Personaje — `personaje3/` (29 archivos)

```
personaje3/
  abajo/     run_1.png … run_7.png     24×50
  arriba/    run_1.png … run_7.png     24×50
  derecha/   run_1.png … run_7.png     24×50
  izquierda/ run_1.png … run_7.png     24×50
  Perfil/    Perfil.png                51×55
```

Misma rejilla que `personaje1` y `personaje2`. `gf-soulbound.js` sondea
`Soulbound/personajeN/Perfil/Perfil.png` con N = 1, 2, 3…, así que basta copiar la
carpeta a `Game/Sprites/Soulbound/personaje3` y aparece solo en el selector.

---

## 4. Cómo engancharlo

### Cultivos

En `Scenes/GameScene.js` cada cultivo se carga con 5 claves, una por etapa:

```js
this.load.image('tierra_seca_plant_lechuga',    './Game/newpro/plantas/planta_lechuga/1.png');
this.load.image('tierra_mojada_plant_lechuga',  './Game/newpro/plantas/planta_lechuga/2.png');
this.load.image('tierra_mojada_plant2_lechuga', './Game/newpro/plantas/planta_lechuga/3.png');
this.load.image('tierra_mojada_plant3_lechuga', './Game/newpro/plantas/planta_lechuga/4.png');
this.load.image('tierra_muerta_plant4_lechuga', './Game/newpro/plantas/planta_lechuga/5.png');
this.load.image('planta_seca_lechuga',          './Game/newpro/plantas/planta_lechuga/6.png');
```

La sexta clave es nueva: el juego hoy no tiene estado de planta muerta, así que
`6.png` es material listo para cuando lo añadas (por ejemplo, si el cultivo pasa
demasiados días sin regar).

Y en el catálogo de `marketplace-routes.js`, junto a `tomate_buena` / `trigo_buena`:

```js
lechuga_buena: { name: 'Lechuga Buena',   category: 'cultivos',
                 icon: '/Game/newpro/plantas/planta_lechuga/item_lechuga_buena.png',   maxStack: 20 },
lechuga_corta: { name: 'Lechuga (brote)', category: 'cultivos',
                 icon: '/Game/newpro/plantas/planta_lechuga/item_planta_lechuga.png',  maxStack: 20 },
lechuga_mala:  { name: 'Lechuga Podrida', category: 'cultivos',
                 icon: '/Game/newpro/plantas/planta_lechuga/item_lechuga_podrida.png', maxStack: 20 },
```

`server2.js` maneja los cultivos por nombre con los sufijos `_buena` / `_corta` /
`_mala`, igual que hace hoy con tomate, trigo, calabaza y zanahoria.

### Cadenas de crafteo que ahora se pueden cerrar

El pack trae las piezas para encadenar recetas completas en `CraftingHub.js`:

```
algodón  -> fibra   -> hilo   -> tela
caña     -> azúcar  + harina + mantequilla -> pastel / galleta
arcilla  -> ladrillo        arena -> vidrio
lechuga  + tomate           -> ensalada
```

### Items

Son iconos de inventario normales: ruta `/Game/newpro/<categoria>/<id>.png` en el
catálogo del mercado y en las recetas.

---

## 5. Detalles técnicos

- **PNG RGBA con fondo transparente** en los 214 archivos. Dos excepciones a
  propósito, ambas copiando lo que ya hace el juego:
  - las 72 baldosas de cultivo son opacas 51×53, como `planta_tomates/1.png`,
    porque se dibujan como suelo;
  - los sprites rectangulares (`ladrillo`, `tabla_madera`, `vidrio`, `papel`) solo
    tienen transparentes las esquinas, exactamente como `Source/hierro.png` y
    `Source/cobre.png`.
- Paleta tomada de los sprites existentes: tierra `#915c3e`/`#6d462e`/`#5e3826`,
  contorno vegetal `#1e3d10`, arpillera de bolsa `#824a24`.
- Todo dibujado a resolución nativa, sin escalar ni interpolar, para que se vea
  nítido con `pixelArt: true` en Phaser.
- `newpro.json` tiene el inventario completo en JSON (id, ruta, tamaño real,
  categoría, tipo de hoja de cada cultivo, sus 4 estados y claves de Phaser sugeridas).


---

# Lote 2 — personajes, armas, agua e iconos

**187 PNG más.** Igual que el primer lote: nada de esto se carga todavía, es
material listo para engancharlo.

## 5 personajes jugables — `personajes/`

`personaje_ascua`, `personaje_escarcha`, `personaje_montaraz`,
`personaje_noctua`, `personaje_solano`. Cada uno con la estructura que espera
`gf-soulbound.js`:

```
personajes/<nombre>/{abajo,arriba,derecha,izquierda}/run_1..7.png
personajes/<nombre>/Perfil/Perfil.png
```

**Están hechos sobre los cuerpos y las animaciones del juego**, que es lo que se
pidió: cada fotograma sale de `Soulbound/personaje1` o `personaje2`, así que el
paso y el balanceo de brazos son exactamente los del juego y no hay forma de que
uno ande raro. Lo que cambia es la paleta, y cambia **por rampas** (pelo, piel,
camisa, pantalón, ojos), no color a color: así las sombras y los brillos se
quedan donde estaban y el sprite no se aplana.

Tres llevan cinta en la frente. La cinta se dibuja mirando los píxeles —se busca
el nacimiento del pelo en cada columna y se pinta la mediana— para que salga
recta y no escalonada.

Para usarlos basta con copiar la carpeta a `Game/Sprites/Soulbound/personajeN`:
gf-soulbound los descubre solo.

## 8 espadas — `armas/`

`espada_de_{madera,piedra,cobre,hierro,oro,esmeralda,diamante,rubi}.png`

20×20 y con **los mismos materiales que las hachas y los picos** que ya tiene el
juego, para que entren en la progresión que existe en vez de inventar otra.

## Espantapájaros — `granja/`

`espantapajaros.png` y `espantapajaros_viento.png` (ladeado, para cuando sopla).
34×54, con origen abajo como el resto de objetos del mapa.

## Agua — `agua/`

`sauce_de_agua`, `nenufar`, `nenufar_flor`, `juncos`, `piedra_agua_1..3`,
`tronco_flotando`, `embarcadero`. Todos con la línea de flotación insinuada, que
es lo que hace que se lean como metidos en el agua y no puestos encima.

## 15 iconos de interfaz — `iconos/`

`lands`, `gremio`, `mapa`, `mercado`, `amigos`, `clasificacion`, `misiones`,
`mascotas`, `banco`, `taller`, `eventos`, `ajustes`, `correo`, `estadisticas`,
`terreno_venta`.

**No son pixel art a propósito.** Los iconos de la barra lateral del juego
(`Game/Source/1..5.png`, `Mochila2`, `chat`) son iconos planos de 512×512 con
contorno negro grueso; uno de 16 bits al lado cantaría. Estos usan ese mismo
tamaño, ese grosor de línea y la paleta sacada de los que ya hay.

---

# Tilesets

## `Game/MAPAS/tiles_nieve.png` — el mapa nevado

El **mismo** tileset, tile por tile: 1440×512, 90 columnas, 2880 tiles en el
mismo orden. Un mapa hecho con `tiles.png` se dibuja igual con este sin tocar un
solo dato — se cambia la imagen y está nevando.

## `Game/MAPAS/tiles_extra.png` — tiles nuevos

28 tiles de 16×16: suelo nevado, bordes de nieve a hierba (4 lados), hielo,
grava, tabla, vallas, orillas de agua a arena, arena, pisadas y tierra helada.

**Por qué es un fichero aparte y no `tiles.png` ensanchado:** en Tiled el id de
un tile sale de su posición (`id = fila × columnas + columna`). `tiles.png` tiene
90 columnas y el tileset siguiente del mapa arranca en `firstgid` 2881, justo
detrás. Añadirle columnas cambia `columns` y **recalcula los 2880 ids**: los
siete mapas del juego quedarían revueltos. Un tileset aparte se añade con su
propio `firstgid` al final y no toca nada.


---

# Minerales en PIEDRA, no en lingote

`recursos/piedra_hierro.png` · `recursos/piedra_cobre.png` ·
`recursos/piedra_carbon.png`   (13×13, como `Game/Source/piedra.png`)

## Por qué existen

El pack ya traía lingotes (`lingote_acero`, `lingote_bronce`, `lingote_plata`)
y dos menas sueltas. Faltaba lo primero de la cadena: **la piedra que sacas de
la roca y todavía no has fundido**. Un lingote es el producto del horno; esto es
lo que entra en el horno.

## Cómo están hechas

La silueta **no está dibujada a mano: está copiada** de `Game/Source/piedra.png`
píxel a píxel. Se lee su canal alfa y su luminancia y se vuelve a pintar con
otra rampa de color, así que las tres menas tienen exactamente el mismo
contorno, el mismo redondeo y la misma luz que la piedra que el juego ya usa —
que era el encargo: *"casi igual que la imagen de la piedra"*.

Copiar la **luminancia** y no el color es lo que hace que funcione. En la piedra
original el brillo va de `#d1` arriba a la izquierda —de donde viene la luz en
todo el arte del juego— a `#57` abajo a la derecha. Esa escalera se conserva
entera; lo único que cambia es a qué color se traduce cada peldaño.

## Las vetas

Una mena no es una piedra teñida: es piedra gris **con trozos de metal dentro**.
Por eso el cuerpo se queda gris y encima se estampan tres o cuatro vetas del
color del mineral, con su brillo arriba y su sombra abajo. Los tres tonos de
cada veta salen del lingote que ya tiene el juego, para que se reconozca el
mineral por el color antes de leer el nombre:

| | Roca | Veta (claro / medio / oscuro) | De dónde sale la paleta |
|---|---|---|---|
| **hierro** | oscura | `#e2e2e1` `#cbcbca` `#878787` | `Source/hierro.png` |
| **cobre** | clara | `#bc8763` `#ab7149` `#754b33` | `Source/cobre.png` |
| **carbón** | *es la mena entera* | — | `newpro/recursos/carbon_vegetal.png` |

Dos decisiones que no son de gusto sino de que se lea a 13×13:

- **El hierro va sobre roca OSCURA.** Su veta es gris, y sobre la roca clara del
  cobre desaparecía: se veía una piedra normal. La solución no es aclarar la
  veta (se saldría de la paleta del lingote) sino bajar la roca un tercio.
- **El carbón no lleva veta.** A este tamaño una veta negra sobre gris se lee
  como una mancha, no como carbón. Es la piedra entera en negro azulado, con un
  reborde gris de roca abajo —para que no parezca una silueta recortada— y dos
  caras brillantes arriba, que es como se lee el carbón de verdad: negro **con
  brillo mineral**, no negro mate.

## Volver a generarlas

    python tools/generar-minerales.py

Es idempotente: escribe siempre los mismos bytes y no toca ningún archivo
existente. Si algún día cambia `Game/Source/piedra.png`, se vuelve a ejecutar y
las tres menas se actualizan solas con la silueta nueva.

---

# Lote 3 — Pesca

**737 PNG más.** Igual que los dos lotes anteriores: **no se ha tocado ni un solo
archivo del juego**, todo vive dentro de `Game/newpro/` y nada se carga todavía.

| Carpeta | Qué hay | PNG |
|---|---|---|
| `peces/` | 409 especies repartidas en 10 biomas + los malos | 409 |
| `pociones/` | 56 frascos | 56 |
| `pesca/` | cañas, aparejo, cebos, despiece, marinos, tesoros y basura | 98 |
| `personajes/personaje8..13/` | 6 pescadores jugables | 174 |

Cada carpeta trae su catálogo en JSON (`peces.json`, `pociones.json`,
`pesca.json`, `pescadores.json`) con id, nombre, ruta, tamaño real, categoría,
precio sugerido y clave de Phaser.

---

## 1. Los peces — 409 especies, una imagen cada uno

Sin animación, que era el encargo: son iconos de inventario y de lo que pica en
el anzuelo, no sprites que anden por el mapa.

| Bioma | Especies | | Bioma | Especies |
|---|---|---|---|---|
| `rio/` | 45 | | `arrecife/` | 40 |
| `lago/` | 32 | | `abismo/` | 30 |
| `pantano/` | 34 | | `hielo/` | 25 |
| `costa/` | 30 | | `caverna/` | 20 |
| `mar/` | 59 | | `magico/` | 32 |
| | | | `malos/` | **62** |

**347 buenos y 62 malos.** Cinco rarezas (común, poco común, rara, épica,
legendaria) y, dentro del rango de su grupo, **un pez raro es más grande que uno
común**: es la única pista de valor que se ve en el inventario antes de leer el
nombre.

### Por qué no se parecen entre sí

400 peces sacados de una plantilla recoloreada se notan: es el mismo pez de otro
color. Aquí lo que distingue a un pez de otro está partido en dos capas.

- **La silueta — 26 arquetipos.** Cada uno con su perfil de lomo y de vientre, su
  cola y su juego de aletas: fusiforme, fusiforme rápido, alto, disco, plano,
  anguila, serpiente, aguja, pez vela, globo, cofre, tiburón, martillo, raya,
  bagre, cabezón, rape de linterna, pez luna, caballito, medusa, pulpo, calamar,
  cangrejo, gamba, langosta, concha, caracola, estrella, erizo, pepino, tortuga,
  rana, renacuajo y gusano. **Una anguila y un pez globo no comparten un solo
  píxel de contorno.**
- **La librea — 119 paletas × 16 patrones.** Rayas, bandas, puntos, manchas,
  moteado, red, mosaico de escamas, chevrones, vetas, ocelo, bioluminiscencia,
  franja dorsal, vientre claro, diamantes, banda lateral y liso.

La paleta y el patrón **se reparten por el puesto de la especie dentro de su
grupo**, no se sortean: sorteándolos, en un grupo de diez truchas con doce
libreas posibles dos caían en la misma casi seguro (el problema del cumpleaños).
Y hay un último cerrojo que compara **los píxeles** de cada pez con los de todos
los anteriores: si dos salen idénticos, al segundo se le mueve el tamaño hasta
que se separen. `tools/newpro-prueba.py` lo comprueba: **ninguna de las 563
imágenes de peces, pociones y aparejo se repite**.

### Cómo se dibuja un pez

Columna a columna, a resolución nativa. Cada arquetipo define cuánto sube el lomo
y cuánto baja el vientre en cada punto del cuerpo, y esos puntos de control se
interpolan con PCHIP —monótono, no se pasa de largo como Catmull-Rom, que en un
lomo de 10 px de alto deja un bulto de un píxel bien visible.

De saber el techo y el suelo de cada columna sale gratis lo demás:

- **el contrasombreado**, que es lo que hace que parezca un pez y no una mancha:
  lomo oscuro y vientre claro, con el cambio concentrado en el tercio de arriba;
- **los patrones**, estampados en coordenadas del cuerpo y no de la imagen, así
  que las bandas de un pez alto y las de uno plano caen donde deben;
- **las aletas**, ancladas al perfil columna a columna. Ese detalle importa: una
  dorsal larga sobre un pez alto tiene debajo un lomo que sube y baja 6 px, y
  clavarla a una recta la dejaba flotando por un lado y enterrada por el otro.

Las aletas llevan **radios** (en la cola salen en abanico desde el pedúnculo; en
la dorsal y la anal van rectos), porque una aleta sin varillas se lee como un
trozo de plástico. Y el contorno se calcula **una sola vez sobre cuerpo + aletas
+ cola**: por piezas, cada aleta traía su propia línea negra y el pez se veía
despiezado.

### Los peces malos

Tres formas distintas de ser malo, y ninguna es "el mismo pez en marrón":

| | Qué se le ve | Cuántos |
|---|---|---|
| **podrido** | la regla de podredumbre del propio juego, mordidas en las aletas, manchas de moho y **ojo lechoso** | 28 |
| **enfermo** | pálido y lavado, con llagas, costillas marcadas y aletas rotas | 18 |
| **venenoso** | sano y vistoso, pero con espinas y colores de aviso | 16 |

La podredumbre no es un filtro sepia: es la regla medida en las parejas
bueno/podrido que el juego ya tiene (`item_tomate_bueno` frente a
`item_tomate_malo`, y las dos zanahorias). El tono se acerca a oliva **solo a
medio camino**, la saturación casi no se toca y el brillo baja **de forma
desigual** — ese desigual es el moteado. Por eso una trucha podrida sigue
teniendo algo de trucha, igual que la zanahoria podrida del juego sigue siendo
naranja.

El **ojo lechoso** no es adorno: es lo primero que se le mira a un pescado para
saber si está pasado, antes que el color y antes que las aletas.

---

## 2. Pociones — 56 frascos

Todos hijos del que el pack ya tenía, `utiles/pocion_vida.png` (14×21), del que
salen medidos píxel a píxel el cristal (`#dfe9ee` / `#ecf6fc` / `#c8d1d6`), el
contorno (`#20303a`) y el corcho (`#b37a42` … `#8a5a30`).

- **10 siluetas de frasco** — redonda, matraz, vial, calabaza, ampolla, garrafa,
  tarro, botella, cuadrado y faceta tallada. La forma es lo primero que distingue
  una poción de otra a 20 px, antes que el color: dos frascos iguales de colores
  parecidos se confunden, dos formas distintas no. Y la proporción la manda la
  forma (un vial es estrecho y alto; un tarro, ancho y bajo).
- **El líquido no llena el frasco**: hay aire arriba y una línea de menisco más
  clara. Es lo que lo convierte en líquido y no en cristal pintado.
- **11 efectos** — burbujas, posos, brillo, remolino, capas, escarcha, chispas,
  grumos, un ojo flotando, un pez dentro (las de pesca) y vapor saliendo del
  tapón.
- **4 tapones** — corcho, metal, lacre y trapo.

Por familias: 11 de vida, energía y maná; 8 de pesca (suerte del pescador,
llamada de banco, cebo líquido, señuelo brillante, red invisible, anzuelo
afilado, calma del agua y ojo de pez); 10 de mejoras; 9 de utilidad; 6 de veneno
y brebajes; 5 elementales y 6 legendarias.

---

## 3. Aparejo, despiece, marinos, tesoros y basura — 98 objetos

| Carpeta | Contenido |
|---|---|
| `canas/` (8) | madera · bambú · reforzada · hierro · plata · dorada · abisal · espectral |
| `aparejo/` (22) | 7 anzuelos · 4 sedales · 3 boyas · 2 redes · 2 nasas · trampa de cangrejos · arpón · 2 tridentes |
| `cebos/` (12) | gusano · lombriz · larva · mosca artificial · saltamontes · camarón · pan · masa · huevas · brillante · mágico · astilla de hueso |
| `despiece/` (17) | 4 escamas · 2 aletas · 3 filetes · pescado seco y salado · harina · aceite · esencia · espina · huevas de esturión · vejiga |
| `marinos/` (18) | 4 perlas · nácar · ámbar · cristal de sal · 3 corales · 3 algas · sal · arena · esponja · 2 conchas |
| `tesoros/` (13) | 2 cofres · 3 monedas · ánfora · botella con mensaje · brújula · mapa náutico · 2 llaves · anillo · reliquia |
| `basura/` (8) | bota vieja · lata oxidada · rama empapada · alga enredada · red rota · trapo · cristal roto · esqueleto |

Cada familia es **un pintor con parámetros**, no un dibujo por objeto: las ocho
cañas salen del mismo cambiando material y adornos, y los siete anzuelos del
mismo cambiando metal y número de púas. Así ocho cañas se parecen entre sí lo que
se tienen que parecer —son todas cañas— y se diferencian en lo que las diferencia
de verdad.

Los materiales están copiados de los sprites que el juego ya tiene, para que una
caña de hierro y un pico de hierro sean del mismo hierro: `#cbcbca` `#b2b2b2`
`#878787` `#6b6c6c` (de `Source/hierro.png`), el cobre de `Source/cobre.png` y la
arpillera de las bolsas de semilla.

Detalles que costaron un segundo intento, y por qué:

- **la caña va en diagonal**, no vertical: en vertical ocupa 30 px de alto y 3 de
  ancho, y en la casilla del inventario se ve como un palo;
- **el anzuelo es media circunferencia**, no una espiral calculada a ojo — con la
  espiral la curva se cerraba antes de tiempo y salía una S con la punta mirando
  al suelo;
- **el anzuelo triple comparte una sola caña**, porque dibujar dos anzuelos
  enteros da dos cañas paralelas, que es otro aparejo distinto;
- **las escamas van montadas como tejas**, con las filas a tresbolillo y el filo
  de abajo oscuro: doce óvalos pegados sin ese filo se leen como una rejilla;
- **la nasa se reconoce por el agujero**, no por el trenzado.

---

## 4. Los seis pescadores — `personajes/personaje8..13/`

```
personajeN/
  abajo/     run_1.png … run_7.png     24×50
  arriba/    run_1.png … run_7.png
  derecha/   run_1.png … run_7.png
  izquierda/ run_1.png … run_7.png
  Perfil/    Perfil.png
```

| Carpeta | Nombre | Cuerpo base | Sombrero |
|---|---|---|---|
| `personaje8` | Marea | personaje1 | sombrero de paja |
| `personaje9` | Sueste | personaje2 | sueste amarillo |
| `personaje10` | Ancla | personaje1 | gorro de lana |
| `personaje11` | Caña | personaje2 | gorra |
| `personaje12` | Bruma | personaje1 | pañuelo |
| `personaje13` | Abisal | personaje2 | capucha |

**Están hechos sobre los cuerpos y las animaciones del juego**, igual que los del
lote 2: cada fotograma sale de `Soulbound/personaje1` o `personaje2`, así que el
paso y el balanceo de brazos son exactamente los del juego. Lo que cambia:

- **la paleta, por rampas** (pelo de 5 tonos, piel de 2, ropa de 4-5, pantalón de
  4, iris de 3), no color a color: así las sombras y los brillos se quedan donde
  estaban y el sprite no se aplana;
- **el sombrero**, que sí cambia la silueta — es lo que convierte a un chaval con
  camisa en un pescador y no se puede pintar dentro del pelo;
- **la correa y el cinturón**, que se pintan solo sobre píxeles de ropa, así que
  no tocan la silueta ni pueden estropear una pose.

### El sombrero no se pone a ojo

La cabeza se localiza en cada fotograma **por el color**: los píxeles de la rampa
del pelo son la cabeza y los de la piel son la cara. De ahí salen las tres
medidas que necesita el sombrero —dónde empieza el pelo, cuánto mide de ancho y
dónde empieza la cara— sin escribir una sola coordenada fija.

Hace falta porque los 28 fotogramas no tienen la cabeza en el mismo sitio: al
andar cabecea, y de espaldas el pelo es una cúpula maciza sin cara debajo. De ahí
salieron dos reglas:

- **el ala va siempre por encima de la cara**, que es lo que impide el único
  fallo grave posible: taparle los ojos al personaje en la mitad de los
  fotogramas;
- **la copa se asienta un píxel dentro del pelo y lo que asome por encima se
  borra**. El pelo de estos sprites llega a la fila 0, y una copa que arrancara
  ahí se quedaba sin sitio para redondear: salían cuatro filas de 14 píxeles
  macizos, un sombrero cortado a cuchillo. Un sombrero tapa el pelo, no flota
  sobre él.

### El retrato

No se dibuja: **se recolorea el del cuerpo base**. `personaje1/Perfil/Perfil.png`
es una ilustración de 204×220 con el marco azul del juego y las letras G y F;
inventar un retrato con otro fondo lo delataría como pegote en cuanto se pusiera
al lado en el panel. Y usa exactamente las mismas rampas que el sprite (medido:
pelo 9,6 %, piel 3,0 %, ropa 8,3 % de los píxeles opacos), así que el mismo
diccionario de colores que viste al sprite viste al retrato.

Se trabaja a 51×55 y se vuelve a subir ×4 con vecino más próximo, que es como
está hecho el original —comprobado: sus 204×220 son bloques macizos de 4×4—, y el
sombrero se pinta ahí abajo, a tamaño real: dibujarlo a 204 de ancho habría dado
un ala de un píxel de grosor.

Los que salen de `personaje2` heredan su retrato de 51×55 sin marco, igual que
`personaje4` y `personaje6` del lote anterior.

### Cómo engancharlos

Copiar la carpeta a `Game/Sprites/Soulbound/personajeN` y ya aparece en el
selector: `gf-soulbound.js` sondea `personaje1, personaje2, …` hasta 3 fallos
seguidos. **Ojo con el hueco**: si se copian del 8 al 13 sin haber copiado antes
del 3 al 7, el sondeo se para en el 3 y no los ve. O se copian en orden, o se crea
`Game/Sprites/Soulbound/index.json` con la lista de nombres, que es la otra vía
que admite el módulo.

---

## 5. Herramientas

```
tools/gf_arte.py               librería de dibujo (color, máscaras, perfiles, contorno)
tools/gf_peces_arte.py         el pincel que dibuja un pez
tools/gf_peces_catalogo.py     qué peces hay (grupos + 409 fichas)
tools/generar-peces.py         escribe peces/
tools/generar-pociones.py      escribe pociones/
tools/generar-pesca.py         escribe pesca/
tools/generar-pescadores.py    escribe personajes/personaje8..13/
tools/newpro-prueba.py         comprueba todo el pack
```

Los cuatro generadores son **idempotentes**: el azar se siembra con el SHA-256
del identificador de cada pieza, no con el reloj, así que volver a lanzarlos
escribe exactamente los mismos bytes y no ensucia el repositorio.

`newpro-prueba.py` caza los fallos que **no dan error** pero salen mal:
imagen vacía, dos imágenes idénticas, catálogo que promete una ruta que no existe
(o al revés), icono más grande de lo que cabe en la casilla, fotograma de
personaje que no mide lo que el cuerpo base (la animación pegaría un salto),
sombrero recortado por el borde de arriba y PNG que no es RGBA.

```
python tools/newpro-prueba.py
```

---

## 6. Enganchar el lote al juego

Nada de esto se carga todavía. Los peces y los objetos son iconos de inventario
normales: la ruta está en el JSON de cada carpeta, en `ruta`, y la clave de
Phaser sugerida en `clave_phaser`.

Antes de dar de alta en la cadena **uno solo** de estos ítems conviene releer la
nota de los minerales: **un ítem nuevo se da de alta en cinco sitios**
(`GameScene.js`, `tiendajuego.js` y `LoadingScenegame.js` → `ItemDefinitions`;
`server2.js` → `ITEM_TIPO_MAP` + `ITEM_MAX_STACK`; y `marketplace-routes.js`), y
olvidarse de uno no da error: da un fallo mudo distinto en cada caso. Con 563
ítems eso no se hace a mano, se hace con un script que lea los JSON de este
paquete.

---

# Lote 4 — Pescar, cocinar, sembrar y construir

**510 PNG más.** Como siempre: **no se ha tocado ni un archivo del juego**.

| Carpeta | Qué hay | PNG |
|---|---|---|
| `pesca_anim/` | los **13 personajes lanzando la caña**, 4 direcciones × 6 fotogramas | 312 |
| `tilesets/` | **8 tilesets** de 16×16 + **8 hojas de referencia** de cada uno | 72 |
| `comidas/` | 40 platos nuevos | 40 |
| `objetos/` | 36 props de campamento (fogatas, hogueras, calderos…) | 36 |
| `plantas/` | **5 cultivos nuevos** con sus 10 archivos cada uno | 50 |

---

## 1. La animación de pescar — `pesca_anim/`

```
pesca_anim/personajeN/{abajo,arriba,derecha,izquierda}/pescar_1..6.png
```

Para **N = 1…13**: los dos personajes del juego y los once del pack. 13 × 4 × 6 =
312 fotogramas.

| # | Qué hace | Ángulo de la caña |
|---|---|---|
| 1 | preparado, las dos manos en el puño | −62° |
| 2 | armar, la caña echada atrás | −152° |
| 3 | lanzar, el latigazo hacia delante | −22° |
| 4 | soltar, casi horizontal y el sedal saliendo | +8° |
| 5 | esperar, el sedal colgando con el corcho | −42° |
| 6 | esperar, el corcho un píxel más abajo | −39° |

Los cuatro primeros se pasan una vez y los dos últimos van en bucle mientras se
espera a que pique.

### El lienzo es más grande y aun así el personaje no salta

Los fotogramas de pesca miden **32 px más de ancho y 8 más de alto**, con el
cuerpo puesto en el desplazamiento (16, 4). Hace falta sitio: una caña que barre
de −152° a +8° no cabe en los 24 px del fotograma de andar, y recortarla deja un
palo de 6 px que no se lee.

Y **no hay que tocar nada en el juego** para que encaje. Con el origen por
defecto de Phaser (0.5, 0.5) lo que se alinea es el centro del fotograma:

```
andar    cuerpo en 0..23 de 24    centro del cuerpo 11.5, del lienzo 12.0
pescar   cuerpo en 16..39 de 56   centro del cuerpo 27.5, del lienzo 28.0
```

Los dos tienen el cuerpo medio píxel a la izquierda del centro, así que el
personaje se queda exactamente donde estaba al cambiar de animación. Lo mismo en
vertical. Por eso el margen es 16 y 4 y el mismo por los dos lados.

### Los brazos se quitan y se vuelven a poner

> **Esto ya no es así.** Lo que sigue describe la segunda versión (cizalla), que
> se sustituyó en el lote 5 por una cadena de dos segmentos con el hombro
> clavado y el codo resuelto — ver *Lote 5 · 1. El brazo de la pesca, tercera
> versión*. Se deja escrito porque explica de dónde salen las medidas del
> hombro, del cuello y de la piel, que siguen siendo las mismas.

El cuerpo, la cabeza y las piernas salen del fotograma de andar `run_1`. Los
brazos no valen, porque cuelgan a los lados y hay que subirlos al puño.

Se localizan solos, sin coordenadas escritas a mano: en estos sprites el brazo
está separado del torso por una línea negra de contorno, así que basta con
inundar desde el píxel opaco más a la izquierda —y más a la derecha— de la
primera fila del torso que tenga esa línea. De frente y de espaldas salen dos
brazos; de perfil, uno (el otro está detrás del cuerpo).

Y se hace **una vez** sobre `personaje1` y `personaje2`, no sobre cada
personaje: los once del pack son recoloreados de esos dos y tienen el alfa
idéntico, así que la misma máscara vale para todos. Los colores de la manga y de
la mano se muestrean del sprite concreto, de modo que cada personaje conserva
los suyos sin que el generador tenga que conocer su paleta.

Tres cosas que costaron un segundo intento:

- **El hombro se encuentra por el cuello.** Estos sprites son cabezones: la
  cabeza mide veinte de los veinticuatro píxeles de ancho, así que "la primera
  fila ancha" cae dentro del pelo, y "la primera fila con color de camisa"
  también (personaje2 lleva un mechón verde del mismo verde de la camisa). Lo
  único que no engaña es la silueta: entre la cabeza y los hombros hay un
  estrechamiento, y ese mínimo del perfil de anchura es el cuello.
- **La mano se reconoce porque está también en la cara.** En unos personajes la
  manga es corta y en otros llega hasta los dedos, así que "los píxeles de abajo
  del brazo" acierta en unos y en otros devuelve verde de camisa. Cruzando los
  colores del brazo con los de la franja de la cara, lo que aparece en las dos
  es la piel.
- **El armado va bajo, no por encima del hombro.** Lo natural sería echar la
  caña atrás y arriba, pero con esa cabeza cualquier ángulo alto le cruza la
  cara. Se probaron las dos salidas: pintar la caña debajo del cuerpo la esconde
  entera detrás de la cabeza —parece que ha desaparecido—, y alargarla hasta que
  asome se sale del lienzo. Así que la caña se echa atrás a la altura del pecho:
  se lee igual de bien y no tapa nada.

El contorno del brazo se pinta **también por encima del cuerpo**. Es lo que hace
que se lea como algo que está delante: sin esa línea negra, un brazo del color
de la camisa cruzando el torso desaparece dentro de él y solo se ve la mano
flotando.

### Cómo engancharla

Copiar `pesca_anim/personajeN/` sobre `Game/Sprites/Soulbound/personajeN/`
mezcla las carpetas: los `pescar_*.png` quedan al lado de los `run_*.png` de
cada dirección, sin pisar nada.

```js
this.anims.create({ key: 'pescar_lanzar_abajo',
  frames: [1,2,3,4].map(i => ({ key: 'pescar_abajo_' + i })), frameRate: 8, repeat: 0 });
this.anims.create({ key: 'pescar_espera_abajo',
  frames: [5,6].map(i => ({ key: 'pescar_abajo_' + i })), frameRate: 3, repeat: -1 });
```

---

## 2. Tilesets — `tilesets/`

Ocho temas: **isla, cueva, volcán, pantano, ruinas, bosque oscuro, desierto y
fondo marino**. Cada uno es un PNG de 96 tiles de 16×16 (256×96), su JSON y
**ocho hojas de referencia**.

El tile mide 16 px porque es lo que usa el juego: `Game/MAPAS/tiles.png` son
2880 tiles de 16×16 en 90 columnas y los mapas de `Maps/*.json` van con
`tilewidth: 16`. Y el arte es igual de plano —color liso con unos pocos píxeles
de acento, sin degradados— porque un tile con degradado al lado de uno del juego
canta.

### Los ocho comparten plantilla

**El mismo índice significa lo mismo en los ocho**, así que un mapa hecho con el
tileset de isla se repinta de cueva cambiando solo la imagen, igual que hace el
juego con `tiles.png` y `tiles_nieve.png`.

| Fila | Índices | Qué es |
|---|---|---|
| 0 | 0-3 / 4-7 | suelo base (4 variantes) / base con decoración |
| 0 | 8-11 / 12-15 | suelo secundario / secundario con decoración |
| 1 | 16-28 | transición secundario → base (13 piezas) |
| 1 | 29-31 | camino: horizontal, vertical, cruce |
| 2 | 32-44 | transición líquido → base (13 piezas) |
| 2 | 45-47 | líquido hondo, líquido claro, brillo |
| 3 | 48-56 | acantilado 3×3: filo, pared, pie |
| 3 | 57-63 | esquinas interiores, escalera y pared con detalle |
| 4-5 | 64-95 | 32 objetos sueltos, con fondo transparente |

### Las 13 piezas de una transición

```
NO  N  NE      y además cuatro esquinas INTERIORES, para cuando el terreno
O   C  E       de fuera entra por una esquina en lugar de por un lado.
SO  S  SE      Con esas 13 se dibuja cualquier mancha.
```

El borde **no se dibuja pieza a pieza**: sale de una onda de periodo 16 sobre la
coordenada local del tile. Como vale lo mismo en x=0 que en x=16, dos piezas
pegadas continúan la línea sin escalón, y las esquinas —que son la intersección
de dos bordes— caen justo donde acaban los lados.

Dos cosas que hubo que corregir mirando el resultado:

- **Dos armónicos, no uno.** Con una sola onda de periodo 16 sale exactamente un
  festoncito por tile y, repetido a lo largo de una orilla, se lee como una
  reja: el ojo pilla el ritmo enseguida. Sumando un segundo armónico el borde
  sigue siendo periódico —y por tanto sigue encajando— pero ya no se ve el
  patrón.
- **El borde del lienzo no es borde de la figura.** La máscara de un tile de
  transición llega hasta el borde porque sigue en el tile de al lado. Contarlo
  como contorno dibujaba una línea oscura en los cuatro lados de cada tile: una
  cuadrícula perfecta sobre todo el mapa. Se ve en `Mascara.borde_interno`, que
  ahora acepta `contar_fuera=False`.

### El acantilado

> **Las columnas ya no están.** Eran una franja vertical cada cuatro píxeles, y
> como cuatro divide a dieciséis salía una valla de estacas perfectamente
> regular. En el lote 5 se cambiaron por sillares de tamaño desigual — ver
> *Lote 5 · 2. Los tilesets*.

Lo que da la altura no es el color, son tres cosas de dibujo: el **labio** (una
línea clara bajo el borde de la meseta y una oscura justo debajo, la sombra que
proyecta), las **columnas** verticales de 3-4 px con la junta oscura y el lado
izquierdo claro —la luz del juego viene de arriba a la izquierda—, y el **pie**,
cuatro filas oscureciéndose. La primera versión rellenaba la pared con ruido y
salía una banda gris plana.

### Las ocho referencias

No son adornos: son el manual de construcción del tileset.

| Archivo | Qué enseña |
|---|---|
| `ref_1_indice` | el tileset con la rejilla y el número de cada tile |
| `ref_2_terrenos` | los dos suelos y sus variantes, uno al lado del otro |
| `ref_3_transicion` | una mancha de secundario con las 13 piezas en uso |
| `ref_4_agua` | una laguna con su orilla y su parte honda |
| `ref_5_acantilado` | una meseta con el filo, la pared, el pie y la escalera |
| `ref_6_camino` | un camino con cruce atravesando los dos terrenos |
| `ref_7_objetos` | los 32 objetos colocados sobre el suelo |
| `ref_8_escena` | una escena completa con todo junto a la vez |

Y desde el lote 5, además, **`mapas/<tema>.png`**: el mapa entero de 60×40 tiles,
que es lo que hay que mirar para juzgar un tileset. Las ocho hojas son recortes.

Las seis del medio están armadas con **el mismo código para los ocho temas**,
así que sirven para comparar: la misma laguna, el mismo acantilado y el mismo
camino en isla, en cueva y en volcán.

### Cómo engancharlos

Un tileset nuevo se añade en Tiled con su propio `firstgid` al final, **nunca
ensanchando `tiles.png`**: en Tiled el id de un tile sale de su posición
(`id = fila × columnas + columna`), y añadirle columnas a `tiles.png` recalcula
los 2880 ids y revuelve los siete mapas del juego. Es la misma razón por la que
`tiles_extra.png` del lote 2 es un fichero aparte.

---

## 3. Comidas — 40 platos

Siguen el tamaño y el estilo de los que el pack ya tenía en `cocina/` (pan
20×11, sopa 19×11, brocheta 22×11).

Un plato no es una mancha de color con nombre: es un **recipiente** con algo
dentro. Hay nueve —plato, cuenco, tabla, sartén, taza, vaso, hoja, cesta y sin
recipiente— y sobre cada uno se sirven los ingredientes. Eso es lo que hace que
cuarenta comidas se distingan a 20 px: la sopa de pescado y el caldo de marisco
comparten cuenco y se diferencian en lo que asoma dentro, pero la sopa y el
sushi no se parecen en nada porque ni siquiera comparten silueta.

Pescado a la plancha, frito, al horno y asado · filetes de salmón y blanco ·
seis sopas y guisos · arroz con pescado, paella, risotto y gachas · sushi,
sashimi y nigiri · tres brochetas · empanada, croquetas, buñuelos, pan de
pescador, galleta marinera, hamburguesa y taco · ceviche y escabeche · gambas,
mejillones, ostras, cangrejo y calamares · ensalada de algas · té de hierbas.

El **vapor** de los platos calientes no es adorno: es lo único que separa de un
vistazo un guiso caliente de una ensalada fría. Y va pegado al plato: cinco
píxeles seguidos que se enroscan y se apagan se leen como vapor, cinco puntos
sueltos a nueve píxeles se leen como suciedad en la imagen.

---

## 4. Objetos de campamento — 36 props

Fogatas, hogueras, braseros, calderos, parrilla, secadero de pescado, tienda,
saco de dormir, banco, mesa, taburete, silla de pescador, barriles, cajón, pila
de leña, faroles, tendedero de red, poste con cartel, cubo, sombrilla, ancla,
boya, nasas apiladas, hielera y caja de pescado.

Todos van **apoyados en la última fila del lienzo**, como el espantapájaros del
lote 2: se colocan con `setOrigin(0.5, 1)` y se asientan en el suelo solos.

**El fuego va en dos fotogramas**, no en uno con dos brillos: cambia la
*silueta* —una llama alta y estrecha y otra más baja y ancha—, que es lo único
que se lee como fuego a este tamaño. Alternando cada 150 ms sale el parpadeo.
Lo llevan `fogata`, `hoguera`, `brasero`, `caldero_fuego` y `farol`, y el JSON
trae la lista en `animaciones`.

Detalle que costó un segundo intento: en el caldero al fuego las llamas tienen
que **salir por los lados**. Centradas quedaban enteras detrás del caldero y los
dos fotogramas salían idénticos — el parpadeo no se veía porque no había nada
que parpadeara. Lo cazó la prueba, no el ojo.

---

## 5. Cinco cultivos nuevos

`planta_arroz` · `planta_ajo` · `planta_guisante` · `planta_col` ·
`planta_calabacin`

Cada uno con los diez archivos de la convención del pack: cinco etapas de
crecimiento en baldosas de 51×53 opacas, la sexta con la planta madura muerta, y
los cuatro iconos (cosecha buena, cosecha podrida, brote y bolsa de semillas).

La baldosa está **copiada, no inventada**: medida píxel a píxel en
`planta_lechuga/1.png` —51×53 opaca, marco de 1 px `#4e2c16`— y la tierra cambia
con la etapa igual que las claves que carga `GameScene.js`: seca `#915c3e` en la
1, mojada `#6d462e` de la 2 a la 5, y reseca y agrietada `#8a6248` en la 6.

Las hojas siguen las mismas reglas que los doce cultivos del lote 1: cada una
nace en un nudo del tallo, va unida por su pecíolo, crece con su propio ángulo y
lleva el nervio en el eje de la hoja, no cruzado. Y la etapa muerta **conserva
el color**: se le aplica la regla de podredumbre medida en las parejas
bueno/podrido del juego, no un marrón.

Los cinco brotes tienen forma propia (número de hojas, apertura, largo, ancho y
si el borde va dentado). Con la misma plantilla para los cinco salían idénticos
y en el inventario no había forma de saber cuál era cuál.

---

## 6. Herramientas nuevas

```
tools/gf_tiles.py              motor de tilesets (textura, bordes, acantilados)
tools/gf_tiles_deco.py         los 38 objetos sueltos de 16x16
tools/generar-tilesets.py      escribe tilesets/
tools/generar-pesca-anim.py    escribe pesca_anim/
tools/generar-comidas.py       escribe comidas/
tools/generar-objetos.py       escribe objetos/
tools/generar-siembras.py      escribe los 5 cultivos nuevos
tools/newpro-prueba.py         comprueba TODO el pack
```

`newpro-prueba.py` sustituye a `pesca-prueba.py` y cubre además los tilesets
(medida, las ocho referencias, tiles vacíos o repetidos), la animación de pesca
(que los seis fotogramas de una dirección midan lo mismo y que el margen
declarado cuadre con el cuerpo base) y las baldosas de cultivo (51×53 y
**opacas**: una baldosa con transparencias deja ver el suelo por debajo).

En esta tanda encontró tres fallos que no se veían mirando: el nigiri y el sushi
salían idénticos byte a byte (el contorno del alga se comía el ingrediente,
porque se pintaba antes), los dos fotogramas del caldero al fuego también, y
varios tilesets tenían dos objetos repetidos en la misma hoja.

```
python tools/newpro-prueba.py
```

Los nueve generadores son **idempotentes**: volver a lanzarlos deja los 1519
archivos byte a byte iguales.

---

# Correcciones del lote 4

Tres cosas salieron mal y se han rehecho. Las tres tenían el mismo aire —"se ve
con puntos", "no son los gráficos del juego"— y dos de ellas la misma causa de
fondo.

## 1. El redondeo, que era la causa de casi todo

`round()` de Python redondea **al par**: `round(10.5)` da 10 y `round(11.5)` da
12. Dibujando eso es un desastre. Una figura centrada en x = 25.5 recorre
columnas 25.5, 26.5, 27.5, 28.5… y al redondear salen 26, 26, 28, 28: **una
columna de cada dos se queda vacía**.

El resultado eran hojas con rayas verticales, con el contorno metido por dentro
—porque el contorno rodea los huecos— y bordes rotos por todas partes. No era
el dibujo: era el redondeo.

`gf_arte.py` ahora redondea **mitad arriba** (`floor(v + 0.5)`) en los cuatro
sitios donde un float se convierte en píxel: `Mascara.get/set` y
`Lienzo.get/set`. Todo el pack está regenerado con eso.

## 2. Los tilesets se veían con nieve de televisión

El suelo del juego es **liso**. Medido en `Game/MAPAS/tiles.png`: el tile de
hierba son 5824 píxeles de `#418546` sobre 6400 — el **91 % de un solo color**—
y lo que no es ese color son flores dibujadas, no ruido.

La primera versión salpicaba un 10 % de tono claro y un 10 % de oscuro píxel a
píxel, en la arena, en la hierba, en el agua y en la roca. `relleno()` ahora
rellena plano y admite `motas`: unas pocas marcas deliberadas de uno o dos
píxeles en posiciones fijas. Las cuatro variantes de cada suelo se diferencian
por esas marcas (la primera va completamente lisa), no por el ruido.

También se ha quitado el ruido de la pared del acantilado y el agua ha pasado a
tener **destellos** —dos rayas cortas claras— en lugar de textura.

## 3. Los cultivos no eran los gráficos del juego

Dos fallos, los dos por no haber medido antes:

- **La tierra.** El pack usa dos marcos (`#452d14` fuera, `#4e2c16` dentro),
  tierra lisa y unas pocas motas de uno a tres píxeles. La primera versión
  metía ruido en el 18 % de los píxeles **y** dibujaba surcos en filas: se veía
  como pana, no como tierra. Ahora está copiado píxel a píxel de
  `planta_lechuga/1.png`.
- **Las hojas.** En los cultivos del pack **cada hoja lleva su propio contorno
  `#1e3d10`** y las hojas se pisan unas a otras: eso es lo único que las hace
  distinguirse. La primera versión juntaba todas las hojas en una máscara y
  contorneaba el conjunto, así que salía una mancha verde con una línea
  alrededor. Y eran tiras largas saliendo de un punto, cuando las del pack son
  **lóbulos anchos repartidos por la base**.

Ahora se dibujan de atrás adelante, cada una con su contorno, con los seis
verdes del pack (`#a2e355` … `#45781c`) trasladados al tono de cada cultivo, y
con el nervio **en abanico** desde el arranque —un nervio por columna pintaba
un peine y la hoja parecía una persiana.

## 4. Los brazos de la animación de pesca

El brazo ya no se dibuja: **se mueve el del propio sprite**.

La primera versión borraba los brazos y pintaba dos barras con contorno desde
el hombro hasta el puño. Con la manga del mismo color que la camisa esas barras
se leían como un tirante cruzado, y al lado del fotograma de andar —que tiene
brazos bien dibujados, con su sombreado y su mano— cantaban.

Ahora se recorta el brazo del sprite (con su contorno) y se vuelve a pegar
transformado:

- **cizalla** alrededor del hombro: cada fila se corre en horizontal según lo
  que baja. Es la única forma de mover pixel art sin destrozarlo — una rotación
  de verdad interpola y deja dientes y colores que no están en la paleta del
  personaje;
- **encogido** en vertical: **ese es el codo**. Sin él, el brazo se queda
  colgando por mucho que se gire, porque un brazo estirado de doce filas llega
  igual de abajo se incline como se incline. Con 0.60 mide siete filas y la mano
  sube al pecho;
- **un peldaño más de brillo en la manga**, porque un brazo que está delante
  recibe más luz — y porque sin eso, cruzando el pecho, lo único que lo separa
  del torso es su línea negra de un píxel y a 24 px de ancho eso se lee como una
  costura.

La mano de la caña se queda además en el **borde derecho** del cuerpo y no en el
centro del pecho: desde el centro la caña sale hacia arriba y cruza la cabeza
—que en estos sprites ocupa veinte de los veinticuatro píxeles de ancho— y se
veía el palo por encima del pelo.

La caña se pinta **debajo** de los brazos, así que la mano queda encima y se lee
que la agarra.


---

# Lote 5 — bosque, pueblo y mapas enteros

Cuatro cosas, y tres de ellas son **arreglos de lo que ya había**:

| | Qué |
|---|---|
| 1 | La animación de pescar: el brazo ya respeta la postura del cuerpo |
| 2 | Los tilesets: el acantilado era una valla y las orillas eran una sierra |
| 3 | `vegetacion/` — 55 piezas: árboles, arbustos, matas y flores |
| 4 | `construcciones/` — 31 piezas: casas, molino, torre, pozo, vallas y props |
| 5 | `mapas/` — **un mapa completo de cada tema**, en PNG y en JSON de Tiled |
| 6 | Los tilesets pasan de 8 temas a **12**, y de 96 tiles a **144** |

---

## 1. El brazo de la pesca, tercera versión: hombro, codo y mano

Las dos versiones anteriores movían el brazo **de una pieza** —primero barras
pintadas del hombro al puño, después el brazo recortado y cizallado— y las dos
fallaban por lo mismo: **el brazo no respetaba la postura del cuerpo**.

Una cizalla corre cada fila en proporción a lo que baja, así que el brazo sale
convertido en una banda diagonal uniforme. Eso no es un brazo: no tiene hombro
(la fila de arriba se queda donde estaba y el resto se va), no tiene codo (no
hay ningún sitio donde cambie de dirección) y la mano acaba donde caiga, que
casi nunca es donde está el puño de la caña. En los fotogramas de perfil la
mano del otro brazo se quedaba colgando en la cadera mientras la caña flotaba
delante sin nadie que la agarrase.

Ahora el brazo es una **cadena de dos segmentos** con las tres cosas clavadas:

### El hombro no se mueve

Las **tres primeras filas** del brazo —el hombro y el nacimiento de la manga—
se quedan exactamente donde las dibujó el artista y ni siquiera se borran del
cuerpo.

### El hueco del brazo se TAPA, no se recorta

Es lo que arregla la silueta. En estos sprites **los brazos son los cantos del
tronco**: entre el brazo y el torso solo hay una línea negra de un píxel, y el
borde exterior del brazo *es* el borde del personaje. Al llevar el brazo hacia
delante y dejar el hueco vacío, el torso se quedaba en nueve píxeles de ancho
—una cintura de avispa entre unos hombros anchos y unas caderas anchas— y el
contorno negro que iba por fuera del brazo se quedaba flotando en el aire.

Un brazo que se mueve hacia delante no se lleva el cuerpo con él: por detrás
sigue habiendo torso. Así que el hueco se rellena con el color de la camisa de
esa misma fila, y la línea negra que separaba brazo y tronco —que ya no separa
nada— se rellena también. El contorno de fuera se queda, que ese sí es el borde
del personaje.

### El codo se calcula, no se elige

Conocidos el hombro, la mano y las dos mitades del brazo, la posición del codo
es la intersección de dos circunferencias. Hay **dos** soluciones —codo hacia
dentro y codo hacia fuera— y se coge siempre la de fuera, la más lejos del eje
del cuerpo, que es como dobla un brazo humano sujetando algo por delante.

### La mano cae en el puño porque se parte de ahí

Primero se decide dónde está el puño de la caña, **después** se dobla el brazo
para llegar; no al revés. Si el puño queda más lejos de lo que el brazo da de
sí, se acerca hasta el límite del alcance: nunca se deja la mano en el aire.

Y la **segunda mano agarra el talón**. Una caña se sujeta con las dos manos
separadas, no con las dos en el mismo sitio: la mano de atrás busca un punto del
propio eje de la caña, por detrás del puño, y la separación se ajusta sola hasta
que el brazo de atrás llegue.

### Los píxeles siguen siendo los del juego

El brazo no se repinta: se recorta del sprite fila a fila y cada fila se vuelve
a estampar **perpendicular a la dirección de la cadena** en ese punto. Es doblar
la manga, no dibujar otra. El recorrido se hace a tercios de fila, no a filas
enteras: en diagonal, saltar de fila en fila deja el brazo agujereado como una
escalera y el contorno se cuela por dentro.

El contorno sí se rehace, porque un brazo doblado tiene un contorno distinto que
uno colgando. Y la manga sube de brillo —0.13 el brazo de delante, 0.06 el de
atrás— porque con la camisa casi negra de `personaje1`, sin eso los dos brazos y
el torso son una única mancha oscura.

### De perfil hay un brazo escondido

De frente y de espaldas los dos brazos tienen su línea negra y se encuentran
solos inundando desde los lados. **De perfil solo la tiene uno**: el otro está
pegado al tronco y lo único que lo delata es su mano, una mancha de piel en el
canto del torso. Cuando pasa eso el brazo se recompone quedándose con las
columnas de fuera de cada fila, las que caen sobre la mano, y **solo dentro de
las filas del brazo que sí se encontró** — buscando piel por todo el sprite, lo
que se encuentra son los pies, y el brazo bajaba por el pantalón hasta el
tobillo.

---

## 2. Los tilesets: por qué «no se veían de gráficos»

Tres cosas, y las tres eran de dibujo, no de color.

### El acantilado era una valla de estacas

`acantilado()` pintaba una franja vertical **cada cuatro píxeles** con la junta
oscura y el canto claro. Cuatro divide a dieciséis, así que el patrón se repetía
idéntico en todos los tiles y en todas las filas: una pared de acantilado salía
siendo una empalizada gris, perfectamente regular de punta a punta.

Ahora la roca se parte en **bandas horizontales de 5 a 8 filas** —cada una
arrancando en un sitio distinto— y cada banda en **bloques de 5 a 9 columnas**,
con su cara de arriba iluminada, su sombra debajo y su junta oscura a la
izquierda. Cada sillar lleva además un pelín más o menos de brillo que su
vecino. Nada mide lo mismo que el de al lado, y eso es exactamente lo que
distingue una piedra de una empalizada.

El **filo de la meseta** tampoco es una onda: es una escalera. Una piedra no
tiene el borde sinuoso, tiene planos y aristas, así que el filo se parte en
tramos rectos de 4 a 8 píxeles a alturas distintas (`perfil_roca`), periódico en
16 por construcción para que dos tiles seguidos sigan encajando.

### Las orillas eran una sierra

`curva_h` sumaba los armónicos **2 y 3** —dos y tres bultos por tile— con
amplitud 1.6. Eso es una onda que sube y baja tres veces en dieciséis píxeles: un
diente cada dos o tres columnas. Dibujado no es una orilla, es una sierra, y de
lejos se lee como ruido.

Ahora manda el armónico **1** (un bulto por tile, amplitud 2.2) y el 2 solo lo
despeina. Sale una línea que ondula de verdad, con tramos rectos de cinco o seis
píxeles entre curva y curva, que es como se dibuja a mano el borde de un prado.
Sigue siendo periódica en 16, así que las 13 piezas siguen encajando sin escalón.

### El suelo tenía nieve de televisión

Las variantes del suelo llevaban hasta **5 motas de 2 px** por tile, o sea un 4 %
del tile salpicado. Puestas una al lado de otra por todo un mapa, eso es ruido.
Bajadas a 0/1/2/1, el suelo vuelve a ser el 96 % de un solo color, que es lo que
mide el tile de hierba del juego (`Game/MAPAS/tiles.png`: 91 % de `#418546`, y lo
que no lo es son flores **dibujadas**).

### Y ahora hay doce temas y 144 tiles

Cuatro temas nuevos: **pradera** (con la hierba `#418546` y el camino `#987656`
exactos del juego), **nieve**, **otoño** y **jungla**.

Y tres filas más en la plantilla. Las filas **6, 7 y 8** son **ocho piezas de
2×3 tiles** por tema: árboles, arbustos, tocones y rocas.

> **Por qué 2×3 y no 2×2.** Un árbol en 32×32 es un arbusto: la copa se come el
> tronco y no queda sitio para que se lea que hay un tronco. Con tres filas de
> alto —48 px— hay copa, tronco y sombra de la copa sobre el tronco, que es lo
> mínimo para que se lea como árbol al lado de los de `Game/Objetos`. Y sigue
> cuadrando en la rejilla de 16.

La pieza *k* ocupa las columnas `2k` y `2k+1` de las tres filas, o sea los
índices `96+2k`, `97+2k`, `112+2k`, `113+2k`, `128+2k` y `129+2k`. Se dibujan
enteras y después se parten, nunca al revés: seis trozos dibujados por separado
no casan por las costuras.

---

## 3. `vegetacion/` — 55 piezas

    vegetacion/arboles/*.png      26 árboles, a su tamaño
    vegetacion/arbustos/*.png     29 arbustos, matas, flores, setas y rocas
    vegetacion/tiles/*.png        LOS MISMOS, encajados en la rejilla de 16
    vegetacion/vegetacion.json    el catálogo
    vegetacion/hoja_*.png         dos hojas de contacto para mirarlo

### La paleta está medida, no inventada

Contando píxeles de `Game/Objetos/arbol.png` y `arbol_pinos.png`:

| | Tonos |
|---|---|
| copa de frondosa | `#458134` claro · `#25572f` medio · `#0e391d` oscuro |
| copa de pino | `#498a38` · `#327430` · `#276028` · `#194419` · `#123510` |
| contorno de copa | `#02110a` |
| tronco | `#8a5c37` · `#674529` · `#583921` · `#3a2516` |
| flores del arbusto | `#f98897` · `#bc4360` (`arbusto de flores.png`) |

Un árbol del pack puesto al lado de `arbol.png` es del mismo bosque.

### Una copa es un racimo, no una elipse

Se juntan de ocho a catorce discos de radios distintos dentro de una elipse y la
unión de todos es la silueta; por eso el borde sale abollado. Los centros no se
sortean con un dado suelto: van por el **ángulo de oro** (2.39996 rad por paso),
como las semillas de un girasol, que reparte sin dejar huecos ni apelotonarlos.

### El follaje son brochazos

`arbol.png` no tiene tres masas lisas: tiene **decenas de trazos cortos** de
verde claro y verde oscuro, apretados y tirando en diagonal, sobre un verde
medio. La primera versión pintaba un disco claro arriba a la izquierda y otro
oscuro abajo a la derecha, y al lado del árbol del juego parecía una pelota de
goma.

Ahora se reparten trazos claros por la mitad de arriba-izquierda (de donde viene
la luz del juego), oscuros por la de abajo-derecha, y las dos filas de abajo de
cada columna van en el tono más oscuro: es por donde la copa se apoya en el
tronco.

### La copa baja hasta el 80 % de la altura

Midiendo `arbol.png`: la copa acaba en el píxel 100 de 125 y el tronco solo se ve
desnudo en el último quinto. Dejando el tronco al aire media altura sale un
**chupa-chups**, que es lo que salía antes.

### Y lleva ramas bajas

Con su matita de hojas en la punta, a distinta altura cada una. Sin ellas un
árbol es un palo con una bola encima; con ellas tiene copa, tronco y ramas, que
son tres cosas y no una.

### Sin sombra pegada

Los PNG salen **sin** la elipse de sombra debajo. El juego ya tiene su sistema de
sombras y una sombra pintada dentro del PNG no se puede quitar ni girar cuando
cambia la hora. El mapa de ejemplo sí la pinta, pero la pinta él.

---

## 4. `construcciones/` — 31 piezas

    construcciones/casas/*.png    16 edificios
    construcciones/props/*.png    15 vallas, carteles, barriles, puentes...
    construcciones/tiles/*.png    los mismos, encajados en la rejilla de 16

### El color no se elige

De `Game/Objetos/casa de npc arreglado.png` y `casa de granja cabaña.png`:

| | Tonos |
|---|---|
| tejado | `#263053` · `#364061` · `#3b4569` · `#3e486c` · `#4a537c` |
| madera | `#4d2d44` · `#633946` · `#804949` |
| piedra | `#5a5353` · `#8b8181` |
| cristal | `#507a9a` |
| contorno | `#302c2e` |

Ese azul de pizarra con la viga granate es la firma visual del pueblo del juego:
una casa nueva con tejado marrón se ve de otro juego aunque esté bien dibujada.
Dos excepciones a propósito, para que un pueblo no sea una fila de clones: la
teja roja de la casa de labranza y la paja de la cabaña y del pozo.

### Una casa se monta de abajo a arriba

**zócalo** (tres o cuatro filas de sillares grandes: la casa se apoya en algo) ·
**muro** (piedra aparejada, yeso con entramado o tabla) · **alero** (la tabla
horizontal que vuela dos píxeles por cada lado — sin ese vuelo el tejado parece
pegado con cinta) · **tejado**.

Y el detalle que las hace parecer casas y no cajas: **la sombra del alero**, una
fila oscura justo debajo del tejado sobre el muro. Es lo que dice que el tejado
está *delante* del muro y no pintado encima.

### Las tejas van en hiladas de tres filas

La de abajo oscura (la sombra del solape con la hilada inferior), la de en medio
el cuerpo, la de arriba clara (el lomo, que es lo que ve el sol). La junta
vertical solo se marca en las dos de arriba, corrida dos píxeles por hilada.
Marcándola en las tres, y con hiladas de dos, salía un damero que a distancia se
lee como tela metálica.

### La chimenea se apoya en el faldón

Antes se colocaba a una altura fija y quedaba flotando al lado del tejado, como
un ladrillo suelto. Ahora se calcula dónde está la superficie del tejado a esa
distancia del caballete y el tubo arranca de ahí.

---

## 5. `mapas/` — un mapa COMPLETO de cada tema

    mapas/<tema>.png     960 × 640 (60 × 40 tiles)
    mapas/<tema>.json    el mismo mapa en formato Tiled
    mapas/contacto.png   los doce en miniatura

Las ocho hojas `ref_*.png` de cada tileset son **recortes**: enseñan una pieza
cada una —la orilla, el acantilado, el camino— sobre 16×11 tiles. Sirven para
saber qué hace cada tile, pero no dicen cómo queda el conjunto, y por eso daban
la sensación de que el tileset "no se veía".

Esto es lo contrario: un mapa entero, con su relieve, su río, su lago, su
meseta, sus caminos, su pueblo y su bosque, montado con el tileset del tema y
con las casas y los árboles del pack encima. Es la prueba de verdad: si un
tileset está mal, aquí se ve a la primera.

Se monta en siete pasos: **relieve** (una función de ruido suave decide dónde
hay terreno secundario), **agua** (lago y río, con el borde salido del mismo
juego de 13 piezas), **meseta** con su acantilado de tres tiles, **caminos**,
**puentes** donde el camino cruza el agua, **pueblo** alineado al camino y
**bosque**, más denso lejos del pueblo y nunca encima del agua ni de una casa.

Dos decisiones que se ven:

- **El acantilado arranca en el borde del mapa.** Uno que empieza en medio de un
  prado se lee como un muro tirado ahí, no como un desnivel.
- **Las sombras multiplican, no tapan.** Pintarlas de un gris opaco deja una
  mancha plana que no se entera de si debajo hay hierba, arena o camino.
  Multiplicando, la sombra sobre la hierba es hierba oscura y sobre la arena es
  arena oscura — que es lo que hace el juego con `gf-sombras` en MULTIPLY.
- **Dónde hay pueblo.** En una cueva, en un volcán y en el fondo del mar no vive
  nadie, y plantar una casa de pizarra allí se ve peor que no ponerla.
- **El lago y el río no están siempre en el mismo sitio.** Si lo estuvieran, los
  doce mapas serían el mismo mapa repintado de otro color.

El JSON es un mapa de Tiled de verdad: tres capas de tiles (`suelo`, `terreno`,
`objetos`) y una capa de objetos (`piezas`) con la ruta del PNG de cada árbol y
de cada casa, ya colocados.

---

## 6. Herramientas del lote

| Archivo | Qué hace |
|---|---|
| `tools/gf_vegetacion.py` | copas, troncos, matas y flores (no escribe nada) |
| `tools/gf_construcciones.py` | muros, tejados, ventanas y puertas |
| `tools/generar-vegetacion.py` | escribe `newpro/vegetacion/` |
| `tools/generar-construcciones.py` | escribe `newpro/construcciones/` |
| `tools/generar-mapa.py` | escribe `newpro/mapas/` (`--solo <tema>`) |
| `tools/newpro-catalogo.py` | refresca `newpro/newpro.json` desde el disco |

`tools/newpro-prueba.py` gana dos comprobaciones:

- **pieza sin versión de tile**: cada árbol y cada casa tiene que tener su copia
  encajada en la rejilla de 16, y esa copia tiene que **apoyar en el borde de
  abajo**. Si flota, el árbol sale levitando sobre la casilla.
- **mapa que no cuadra**: el PNG tiene que medir `ancho_tiles × 16`, no puede
  tener un solo píxel transparente (es un mapa, no un sprite) y su JSON de Tiled
  tiene que declarar las mismas medidas y una casilla por rejilla.

Los tiles vacíos de las filas de piezas grandes **no** son un fallo: una pieza de
2×3 que no es rectangular deja las esquinas de su recuadro en blanco a propósito.
Lo que sí sería un fallo es una pieza entera vacía, y eso se comprueba aparte.

Todo sigue siendo **idempotente**: volver a lanzar los cinco generadores escribe
exactamente los mismos bytes (comprobado por huella SHA-256 de las cinco
carpetas).
