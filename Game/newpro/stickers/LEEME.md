# 100 stickers animados para Discord

**Los personajes son los sprites del juego, sin tocar ni un píxel.** Son los PNG
de `Game/newpro/personajes/personajeN/<dirección>/run_1..7.png` (24×50) y los 6
fotogramas de `Game/newpro/pesca_anim`. Nada está redibujado, ni escalado, ni
rotado: solo colocado y movido en píxeles enteros.

Lo escribe `tools/generar-stickers.py`. **No edites los PNG a mano**: se
regeneran y se pierde el cambio.

```bash
python tools/generar-stickers.py
```

## De dónde sale la acción

La acción no sale de deformar al personaje —eso rompería el pixel art— sino de
**animar la escena con el propio arte del juego**:

| Qué se mueve | Cómo |
|---|---|
| El personaje | sus 7 fotogramas de caminar, los 6 de pescar, o saltando / temblando / asintiendo en píxeles enteros |
| Los cultivos | **crecen de verdad**: el sticker recorre las 6 etapas de `plantas/planta_*` |
| Los animales | con sus propios fotogramas (gallina, cuervo, perro, vaca, cerdo, conejo, topo, zorro, serpiente, cocodrilo, mariposas, palomas) |
| Las hogueras, faroles y calderos | alternan sus fotogramas `_1` / `_2`, así que arden |
| Las herramientas | a la altura de la mano, oscilando: hoz, pala, cubo, martillo |
| Las partículas | 22 efectos: semillas, chorro de agua, chispas, polvo, corazones, notas, ZZZ, confeti, monedas, humo, vapor, lluvia, nieve, hojas, luciérnagas, plumas, burbujas, líneas de velocidad |

El suelo es una **peana recortada de los mapas reales** (`newpro/mapas`): hierba,
tierra, camino, nieve, otoño, piedra, arena, jungla, pantano, volcán, orilla.

Formato: **APNG de 320×320, 12 fotogramas a 100 ms, bucle infinito, fondo
transparente y contorno blanco**. Pesan de 20 a 67 KB (Discord admite 512 KB).

## Las 5 categorías

| Categoría | Nº | Qué cubre |
|---|---|---|
| `granja` | 30 | sembrar, el maíz/col/girasol/sandía creciendo, regar, segar, cavar, cosechar, abonar, gallinas, huevos, vaca, leche, cerdo, lana, miel, espantar cuervos, espantapájaros al viento, pescar, picada, minar, carbón, lingote, hoguera, caldero, comida, mercado |
| `comunidad` | 26 | hola, adiós, bienvenido, GG, OK, no, pregunta, no entiendo, idea, espera, AFK, dormido, ocupado, música, café, brindis, regalo, ayuda, atención, silencio, trato, monedas, llave, poción, farol, leer |
| `animales` | 14 | conejo, conejo dormido, perro, zorro, topo, pájaro, paloma, mariposas, cuervo, serpiente, cocodrilo, nido, zorra tumbada, vaca paseando |
| `emociones` | 18 | feliz, risa, triste, llorar, enfado, sorpresa, amor, tímido, orgullo, cansado, miedo, celebrar, victoria, derrota, gracias, correr, bailar, saltar |
| `estaciones` | 12 | lluvia, nieve, otoño, primavera, verano, noche, tormenta, setas, bellotas, volcán, jungla, pantano |

## Subirlos a Discord

Ajustes del servidor → **Stickers** → *Subir sticker*. Hacen falta mejoras de
servidor para tener hueco (nivel 1 = 15, nivel 2 = 30, nivel 3 = 60). Discord
pide una palabra clave: vale el nombre del archivo sin el número.

Para **emojis**, sube los de `estaticos/`: Discord los reescala a 128×128.

## Añadir o cambiar uno

Cada sticker es una línea del `CATALOGO`:

```python
A("regar", "granja", pj_x=4, pj=PJ(6, "derecha"), suelo="tierra",
  cultivo=("lechuga", 3, 5), util=("cubo_agua", 22, 27, 1, 2),
  efecto="agua_chorro"),
```

Nombre, categoría, y luego: qué personaje y hacia dónde mira (`PJ(6, "derecha")`),
cómo se mueve (`meneo=`), el terreno de la peana, el cultivo con su etapa inicial
y final (crece entre las dos), la herramienta con su posición y oscilación, hasta
dos efectos, un animal y un bocadillo opcional.
