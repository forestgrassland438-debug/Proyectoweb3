#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LAS ARENAS DE LAS BATALLAS DE MASCOTAS, CON EL ARTE DEL JUEGO     (2026-11-15)
=============================================================================

"Los pisos no tienen los efectos de los gráficos y los mapas no están
recortados como los demás… se ve muy hecho por IA y no quiero eso."

Las arenas eran un tileset aparte (Game/MAPAS/arena_32.png) dibujado por un
generador: otro césped, otros muros, otras cajas — otro juego. Ahora se hacen
como el resto de mapas (el salvaje, el cementerio, el desierto…):

  EL SUELO
    Se compone con el TILESET DEL PUEBLO (Game/MAPAS/tiles.png) y las mismas
    reglas de siempre (tools/generar-salvaje.py: esquinas de hierba y tierra,
    orillas por ocho vecinos, bloques de piedra con su bordillo), se le pasa
    el detalle a escala de mundo (tools/detallar-captura-mapa.py: manchas de
    tono, sombra de la piedra, matas de briznas, destellos en el agua), se
    recolorea por bioma donde toca (tools/gf_biomas.py: la tundra para la
    nieve, el desierto para el cañón) y se TROCEA (tools/trocear-escena.py)
    en recortadas_arena_<id>/, que es lo que carga gf-suelo.js con
    lib/tileManager.js, igual que en los demás mapas.
    Encima van pintados: los CAMINOS de tierra (siguen rutas que de verdad se
    pueden andar, de una esquina a la contraria), las plazas de piedra de las
    ruinas, los PUENTES de tablas, los cuencos de los comederos, la SOMBRA de
    cada muro y el BOSQUE de fuera del campo (árboles, arbustos y rocas del
    pueblo), oscurecido para que se lea como "fuera".

  LO QUE SE LEVANTA DEL SUELO (muros, hierba alta, cajas, lo que se recoge)
    No va pintado: lo pone BattleScene con la rejilla que manda el SERVIDOR
    (así lo que se ve es siempre lo que choca) usando los fotogramas de
    Game/MAPAS/arena/objetos.png, que este script monta con dibujos que el
    juego ya tenía:
      seto_<vecinos>   el seto del pueblo ("arbusto formado 2") partido en
                       piezas que casan por los cuatro lados
      roca_*           las piedras del pueblo (y en nieve y arenisca)
      hierba_*         la mata de trigo verde (y seca, y nevada) sin su tierra
      caja, cofre, barril, barril_explosivo y sus trozos al romperse
      hueso, carne, escudo, rapidez, municion, super, cuenco
      pluma, bola_fuego, espina, orbe (proyectiles)
    Nada se redibuja: se recorta, se recolorea por bioma o se compone.

  LA REJILLA NO SE INVENTA AQUÍ
    Sale de gf-brawl-motor.js (el bloque <<ARENAS>>), que es quien manda en
    los choques. Aquí solo se pinta. Cada suelo lleva en su mapa.json la
    `huella` de su agua, sus puentes y sus comederos: tools/brawl-prueba-
    motor.js comprueba que es la del motor y BattleScene la compara con la
    rejilla que le llega (si no casan, pinta el agua a mano por encima).

USO
  python tools/generar-arenas.py [pradera ruinas rio nieve canon] [--sin-suelo] [--sin-atlas]
Determinista. Unos 20 s por arena.
=============================================================================
"""
import importlib.util
import json
import math
import os
import random
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
BIN = os.path.dirname(AQUI)

_spec = importlib.util.spec_from_file_location('generar_salvaje', os.path.join(AQUI, 'generar-salvaje.py'))
GS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GS)

import gf_biomas  # noqa: E402

VERSION = '20261115a'
C = 32                    # la casilla de la arena
T = 16                    # la casilla del tileset del pueblo (2 x 2 por casilla de arena)
OBJ = os.path.join(BIN, 'Game', 'Objetos')
NEWPRO = os.path.join(BIN, 'Game', 'newpro')
DESTINO_ATLAS = os.path.join(BIN, 'Game', 'MAPAS', 'arena')

# Qué bioma de gf_biomas lleva cada tema (None = el pueblo tal cual).
BIOMA = {'pradera': None, 'ruinas': None, 'rio': None, 'nieve': 'tundra', 'canon': 'desierto'}
# El tileset con el que se compone cada tema (lo lee también el agua animada,
# gf-agua.js, desde Maps/arena_<id>.json): el del pueblo, o el ya recoloreado
# de la tundra y del desierto (tools/generar-zonas.py), que son el mismo
# tileset pasado por gf_biomas.
TILESET_TEMA = {
    'pradera': 'Game/MAPAS/tiles.png', 'ruinas': 'Game/MAPAS/tiles.png', 'rio': 'Game/MAPAS/tiles.png',
    'nieve': 'Game/MAPAS/tundra/tiles_tundra.png', 'canon': 'Game/MAPAS/desierto/tiles_desierto.png',
}
# Hacia qué color se funde el borde del dibujo. La cámara puede asomarse más
# allá del suelo pintado (para centrar al perro también en las esquinas) y ahí
# se ve el color de fondo de la cámara: es ESTE (BattleScene.TEMAS[..].fondo).
FONDO = {'pradera': (14, 34, 20), 'ruinas': (14, 34, 20), 'rio': (14, 34, 20),
         'nieve': (46, 52, 64), 'canon': (52, 42, 28)}
FUNDIDO = 72              # px del borde que se funden hacia FONDO
# Con qué se levantan los muros en cada tema (lo usa BattleScene; aquí, la sombra).
SEMILLA = {'pradera': 4101, 'ruinas': 4202, 'rio': 4303, 'nieve': 4404, 'canon': 4505}


# ─────────────────────────────────────────────────────────── LA REJILLA
def leer_arenas():
    """Las arenas tal y como las tiene el motor (él manda en los choques)."""
    r = subprocess.run(['node', '-e',
                        "process.stdout.write(JSON.stringify(require(process.argv[1]).ARENAS))",
                        os.path.join(BIN, 'gf-brawl-motor.js')], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def rejilla_entera(A):
    """Las filas con su marco macizo, como crearRejilla() del motor."""
    m = int(A.get('marco', 0))
    W, H = A['ancho'] + 2 * m, A['alto'] + 2 * m
    filas = []
    for y in range(H):
        if y < m or y >= H - m:
            filas.append('#' * W)
        else:
            filas.append('#' * m + A['filas'][y - m].ljust(A['ancho'], '#')[:A['ancho']] + '#' * m)
    return filas, m, W, H


def huella_suelo(filas):
    """FNV-1a de lo que va PINTADO (agua, puentes, comederos). La misma cuenta
    que huellaSuelo() en tools/brawl-prueba-motor.js y en BattleScene.js."""
    h = 0x811c9dc5
    txt = '\n'.join(''.join(ch if ch in '~=+' else '.' for ch in f) for f in filas)
    for ch in txt:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xffffffff
    return '%08x' % h


def camino_celdas(filas, a, b):
    """El camino más corto ANDANDO de la casilla a a la b (4 vecinos; el agua
    y los muros no se pisan, los puentes sí)."""
    W, H = len(filas[0]), len(filas)
    previo = {a: a}
    cola = [a]
    i = 0
    while i < len(cola):
        c = cola[i]
        i += 1
        if c == b:
            break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[0] < W and 0 <= n[1] < H) or n in previo or filas[n[1]][n[0]] in '#~':
                continue
            previo[n] = c
            cola.append(n)
    if b not in previo:
        return []
    ruta = [b]
    while ruta[-1] != a:
        ruta.append(previo[ruta[-1]])
    return ruta[::-1]


def recta_libre(filas, a, b):
    """¿Se anda en línea recta del centro de la casilla a al de la b?"""
    n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) * 5))
    for i in range(n + 1):
        t = i / n
        x, y = a[0] + 0.5 + (b[0] - a[0]) * t, a[1] + 0.5 + (b[1] - a[1]) * t
        for ox, oy in ((0, 0), (0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3)):
            cx, cy = int(x + ox), int(y + oy)
            if not (0 <= cy < len(filas) and 0 <= cx < len(filas[0])) or filas[cy][cx] in '#~':
                return False
    return True


def suavizar(filas, ruta):
    """Quita los escalones de un camino por casillas: de cada punto, al más
    lejano al que se llega en línea recta. Queda una senda con tramos largos
    y en diagonal, como la que abre la gente al pasar."""
    if len(ruta) < 3:
        return ruta
    out = [ruta[0]]
    i = 0
    while i < len(ruta) - 1:
        j = min(len(ruta) - 1, i + 9)
        while j > i + 1 and not recta_libre(filas, ruta[i], ruta[j]):
            j -= 1
        out.append(ruta[j])
        i = j
    return out


def componentes(celdas):
    """Grupos de casillas que se tocan (8 vecinos)."""
    quedan = set(celdas)
    grupos = []
    while quedan:
        ini = quedan.pop()
        grupo = [ini]
        frente = [ini]
        while frente:
            x, y = frente.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in quedan:
                        quedan.remove(n)
                        grupo.append(n)
                        frente.append(n)
        grupos.append(grupo)
    return grupos


# ─────────────────────────────────────────────────────────── EL SUELO
def tubo(puntos, radio, semilla, NT, rugoso=0.28):
    """Las casillas (del tileset) a menos de `radio` de una polilínea, con el
    borde irregular."""
    borde = GS.ruido_valor(semilla, 5)
    out = set()
    for (ax, ay), (bx, by) in zip(puntos, puntos[1:]):
        dx, dy = bx - ax, by - ay
        L2 = float(dx * dx + dy * dy) or 1.0
        for y in range(int(min(ay, by) - radio - 2), int(max(ay, by) + radio + 3)):
            for x in range(int(min(ax, bx) - radio - 2), int(max(ax, bx) + radio + 3)):
                if not (0 <= x < NT and 0 <= y < NT):
                    continue
                u = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
                d = math.hypot(x + 0.5 - (ax + u * dx), y + 0.5 - (ay + u * dy))
                if d <= radio * (1 - rugoso + borde(x, y) * rugoso * 2):
                    out.add((x, y))
    return out


def plaza(piedra, x0, y0, x1, y1):
    """Bloque de piedra con su bordillo: las nueve piezas del pueblo."""
    B, L = GS.BLOQUE, GS.LADRILLO
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y == y0:
                g = B['NO'] if x == x0 else B['NE'] if x == x1 else B['N'][x % 2]
            elif y == y1:
                g = B['SO'] if x == x0 else B['SE'] if x == x1 else B['S'][x % 2]
            elif x == x0:
                g = B['O1'] if y == y0 + 1 else B['O'][y % 2]
            elif x == x1:
                g = B['E1'] if y == y0 + 1 else B['E'][y % 2]
            else:
                g = L[(y - y0 - 1) % 4] + (x - x0 - 1) % 4
            piedra[(x, y)] = g


def disenar_suelo(ident, A, filas, m, W, H, NT):
    """Agua, tierra y piedra en casillas del tileset (2 x 2 por casilla)."""
    tema = A.get('tema', ident)
    sem = SEMILLA.get(tema, 4000)
    agua = set()
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch in '~=':
                agua |= {(2 * x, 2 * y), (2 * x + 1, 2 * y), (2 * x, 2 * y + 1), (2 * x + 1, 2 * y + 1)}

    # ── los caminos: de cada esquina a su contraria, por donde se anda ──
    ap = [(x + m, y + m) for x, y in A['apariciones']]
    tierra = set()
    for i, j in ((0, 3), (1, 4), (2, 5)):
        if j >= len(ap):
            continue
        ruta = suavizar(filas, camino_celdas(filas, ap[i], ap[j]))
        if len(ruta) < 2:
            continue
        # Una senda estrecha (casilla y media) por los centros de las casillas.
        pts = [(2 * cx + 1.0, 2 * cy + 1.0) for cx, cy in ruta]
        tierra |= tubo(pts, 1.3, sem + 11 * i, NT, 0.34)
    # Un claro de tierra en cada salida y bajo cada comedero.
    for (cx, cy) in ap:
        tierra |= tubo([(2 * cx + 1.0, 2 * cy + 1.0), (2 * cx + 1.01, 2 * cy + 1.0)], 2.3, sem + 77, NT, 0.3)
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch == '+':
                tierra |= tubo([(2 * x + 1.0, 2 * y + 1.0), (2 * x + 1.01, 2 * y + 1.0)], 2.2, sem + 99, NT, 0.3)
    # Solo dentro del campo, y nunca en el agua.
    j0, j1 = 2 * m, 2 * (W - m) - 1
    k0, k1 = 2 * m, 2 * (H - m) - 1
    tierra = {(x, y) for (x, y) in tierra if j0 <= x <= j1 and k0 <= y <= k1} - agua

    # ── la piedra: en las ruinas, una losa bajo cada grupo de muros ──
    piedra = {}
    if tema == 'ruinas':
        muros = [(x, y) for y, fila in enumerate(filas) for x, ch in enumerate(fila)
                 if ch == '#' and m <= x < W - m and m <= y < H - m]
        usadas = []
        for grupo in componentes(muros):
            if len(grupo) < 3:
                continue
            x0 = max(m, min(c[0] for c in grupo) - 1); x1 = min(W - m - 1, max(c[0] for c in grupo) + 1)
            y0 = max(m, min(c[1] for c in grupo) - 1); y1 = min(H - m - 1, max(c[1] for c in grupo) + 1)
            if any(filas[y][x] in '~=' for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)):
                continue
            if any(not (x1 < a0 - 1 or x0 > a1 + 1 or y1 < b0 - 1 or y0 > b1 + 1) for (a0, b0, a1, b1) in usadas):
                continue
            usadas.append((x0, y0, x1, y1))
            plaza(piedra, 2 * x0, 2 * y0, 2 * x1 + 1, 2 * y1 + 1)
        tierra -= set(piedra)
    return agua, tierra, piedra


def cargar(ruta):
    return Image.open(ruta).convert('RGBA')


def escala(im, k):
    if k == 1:
        return im
    return im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.NEAREST)


def bosque(lienzo, tema, m, W, H, semilla):
    """Lo de FUERA del campo: árboles, arbustos y rocas del pueblo, ordenados
    de arriba abajo. Nada pisa el campo ni su primer anillo (ahí va el borde
    que pone BattleScene, que tiene que poder tapar a los perros)."""
    rnd = random.Random(semilla)
    piezas = {
        'pradera': [('arbol.png', 5), ('pinos.png', 4), ('arbusto solo.png', 3), ('arbusto.png', 3), ('arbusto de flores.png', 1), ('arbol pequeño.png', 2)],
        'rio':     [('arbol.png', 5), ('pinos.png', 3), ('arbusto solo.png', 3), ('arbusto.png', 3), ('arbusto de flores blancas.png', 1), ('piedra_2.png', 1)],
        'ruinas':  [('arbol.png', 3), ('pinos.png', 4), ('arbusto.png', 2), ('piedra_1.png', 2), ('piedra_3.png', 2), ('piedra_4.png', 2), ('arbol seco terminado.png', 1)],
        'nieve':   [('pinos.png', 7), ('arbol_pinos.png', 3), ('piedra_1.png', 2), ('piedra_3.png', 2), ('arbusto.png', 1)],
        'canon':   [('piedra_1.png', 4), ('piedra_2.png', 4), ('piedra_3.png', 4), ('piedra_4.png', 4), ('arbol seco terminado.png', 3), ('tronco acostado.png', 1)],
    }.get(tema, [])
    if not piezas:
        return
    imgs = {n: escala(cargar(os.path.join(OBJ, n)), 1.25) for n, _ in piezas}
    nombres = [n for n, _ in piezas]
    pesos = [p for _, p in piezas]
    ancho, alto = lienzo.size
    # Lo que no se puede pisar con un árbol: el campo y su primer anillo.
    kx0, ky0, kx1, ky1 = (m - 1) * C - 2, (m - 1) * C - 2, (W - m + 1) * C + 2, (H - m + 1) * C + 2
    puestos = []
    paso = 38
    for gy in range(-1, alto // paso + 3):
        for gx in range(-1, ancho // paso + 3):
            if rnd.random() < 0.18:
                continue
            n = rnd.choices(nombres, weights=pesos)[0]
            im = imgs[n]
            w, h = im.size
            bx = gx * paso + rnd.randint(-14, 14)          # el pie, centrado
            by = gy * paso + rnd.randint(-14, 14)
            x0, y0, x1, y1 = bx - w // 2, by - h, bx - w // 2 + w, by
            if x1 > kx0 and x0 < kx1 and y1 > ky0 and y0 < ky1:
                continue
            if x1 < 4 or x0 > ancho - 4 or y1 < 6 or y0 > alto - 4:
                continue
            puestos.append((by, bx, n, rnd.random() < 0.5))
    puestos.sort()
    sombra = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sombra)
    for by, bx, n, _ in puestos:
        w = imgs[n].size[0]
        ds.ellipse([bx - w * 0.36, by - 7, bx + w * 0.36, by + 5], fill=(6, 20, 10, 70))
    lienzo.alpha_composite(sombra)
    for by, bx, n, espejo in puestos:
        im = imgs[n]
        if espejo:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        pegar_recortado(lienzo, im, bx - im.size[0] // 2, by - im.size[1])


def adornos(lienzo, tema, filas, m, W, H, ocupadas, semilla):
    """Unas pocas flores y piedras del pueblo sobre la hierba del campo: lejos
    de muros, cajas, matas y caminos, y separadas entre sí. Son suelo (se
    pisan): pocas y pequeñas."""
    rnd = random.Random(semilla)
    piezas = {
        'pradera': ['flor azul.png', 'flor blanca.png', 'flor naranja.png', 'flor azul.png', 'piedra.png'],
        'rio':     ['flor azul.png', 'flor blanca.png', 'piedra.png', 'piedra.png'],
        'ruinas':  ['piedra.png', 'piedra_5.png', 'piedra_6.png', 'flor blanca.png'],
        'nieve':   ['piedra.png', 'piedra_5.png'],
        'canon':   ['piedra.png', 'piedra_5.png', 'piedra_6.png'],
    }.get(tema, [])
    if not piezas:
        return
    puestos = []
    for _ in range(600):
        if len(puestos) >= 16:
            break
        cx, cy = rnd.randint(m + 1, W - m - 2), rnd.randint(m + 1, H - m - 2)
        # La casilla y sus ocho vecinas, libres (ni muro, ni caja, ni mata, ni agua…).
        if any(filas[cy + dy][cx + dx] != '.' for dy in (-1, 0, 1) for dx in (-1, 0, 1)):
            continue
        if any((2 * cx + i, 2 * cy + j) in ocupadas for i in (-1, 0, 1, 2) for j in (-1, 0, 1, 2)):
            continue
        if any(abs(cx - px) < 4 and abs(cy - py) < 3 for px, py in puestos):
            continue
        puestos.append((cx, cy))
        im = cargar(os.path.join(OBJ, rnd.choice(piezas)))
        if rnd.random() < 0.5:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        bx, by = cx * C + 16 + rnd.randint(-6, 6), cy * C + 26 + rnd.randint(-4, 4)
        pegar_recortado(lienzo, im, bx - im.size[0] // 2, by - im.size[1])


def pegar_recortado(lienzo, im, x, y):
    """alpha_composite con el destino parcialmente fuera del lienzo."""
    W, H = lienzo.size
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.size[0], W - x), min(im.size[1], H - y)
    if ex <= sx or ey <= sy:
        return
    lienzo.alpha_composite(im.crop((sx, sy, ex, ey)), (max(0, x), max(0, y)))


def oscurecer(arr, mascara, factores):
    """arr *= factor allí donde lo diga la máscara (0..255), en escalones
    lisos: [(umbral, factor), ...] de mayor a menor. Sin tramados."""
    f = np.ones(mascara.shape, np.float32)
    for umbral, factor in sorted(factores):
        f[mascara >= umbral] = factor
    for k in range(3):
        arr[..., k] = np.clip(arr[..., k].astype(np.float32) * f, 0, 255).astype(np.uint8)


def pintar_puentes(im, filas):
    """Los puentes de tablas (los '='), con la madera del puente del salvaje."""
    M = GS.MADERA
    d = ImageDraw.Draw(im)
    celdas = [(x, y) for y, fila in enumerate(filas) for x, ch in enumerate(fila) if ch == '=']
    rnd = random.Random(515)
    for grupo in componentes(celdas):
        x0 = min(c[0] for c in grupo); x1 = max(c[0] for c in grupo)
        y0 = min(c[1] for c in grupo); y1 = max(c[1] for c in grupo)
        agua_lados = (filas[y0][x0 - 1] in '~=' if x0 > 0 else False) or (filas[y0][x1 + 1] in '~=' if x1 + 1 < len(filas[0]) else False)
        px0, py0, px1, py1 = x0 * C, y0 * C, (x1 + 1) * C - 1, (y1 + 1) * C - 1
        if agua_lados:
            # Se cruza de norte a sur: tablas atravesadas, vigas a los lados.
            py0 -= 6; py1 += 6                              # apoya en las dos orillas
            d.rectangle([px0 + 5, py0 + 4, px1 + 5, py1 + 5], fill=(10, 24, 30, 80))      # sombra en el agua
            y = py0
            k = 0
            while y <= py1:
                hh = min(8, py1 - y + 1)
                tono = [M['media'], M['clara'], M['media'], M['luz']][k % 4]
                if rnd.random() < 0.22:
                    tono = M['clara']
                d.rectangle([px0, y, px1, y + hh - 1], fill=tono)
                d.line([px0, y, px1, y], fill=M['brillo'] if tono != M['media'] else M['luz'])
                d.line([px0, y + hh - 1, px1, y + hh - 1], fill=M['perfil'])
                for _ in range(rnd.randint(2, 3)):         # la veta: trazos largos, nunca puntos
                    vy = y + rnd.randint(2, max(2, hh - 3))
                    va = px0 + rnd.randint(4, (px1 - px0) // 2)
                    vb = min(px1 - 4, va + rnd.randint((px1 - px0) // 4, (px1 - px0) // 2))
                    d.line([va, vy, vb, vy], fill=M['oscura'])
                y += hh
                k += 1
            for bx in (px0, px1 - 4):                       # las vigas de los lados
                d.rectangle([bx, py0 - 2, bx + 4, py1 + 2], fill=M['oscura'])
                d.line([bx, py0 - 2, bx, py1 + 2], fill=M['luz'])
                d.line([bx + 4, py0 - 2, bx + 4, py1 + 2], fill=M['perfil'])
            for by in (py0 - 2, py1 - 1):                   # y los travesaños de las orillas
                d.rectangle([px0, by, px1, by + 3], fill=M['oscura'])
                d.line([px0, by, px1, by], fill=M['luz'])
                d.line([px0, by + 3, px1, by + 3], fill=M['perfil'])
        else:
            # Se cruza de oeste a este: tablas de canto, vigas arriba y abajo.
            px0 -= 6; px1 += 6
            d.rectangle([px0 + 4, py0 + 6, px1 + 5, py1 + 6], fill=(10, 24, 30, 80))
            x = px0
            k = 0
            while x <= px1:
                ww = min(8, px1 - x + 1)
                tono = [M['media'], M['clara'], M['media'], M['luz']][k % 4]
                if rnd.random() < 0.22:
                    tono = M['clara']
                d.rectangle([x, py0, x + ww - 1, py1], fill=tono)
                d.line([x, py0, x, py1], fill=M['brillo'] if tono != M['media'] else M['luz'])
                d.line([x + ww - 1, py0, x + ww - 1, py1], fill=M['perfil'])
                for _ in range(rnd.randint(2, 3)):
                    vx = x + rnd.randint(2, max(2, ww - 3))
                    va = py0 + rnd.randint(4, (py1 - py0) // 2)
                    vb = min(py1 - 4, va + rnd.randint((py1 - py0) // 4, (py1 - py0) // 2))
                    d.line([vx, va, vx, vb], fill=M['oscura'])
                x += ww
                k += 1
            for by in (py0, py1 - 4):
                d.rectangle([px0 - 2, by, px1 + 2, by + 4], fill=M['oscura'])
                d.line([px0 - 2, by, px1 + 2, by], fill=M['luz'])
                d.line([px0 - 2, by + 4, px1 + 2, by + 4], fill=M['perfil'])
            for bx in (px0 - 2, px1 - 1):
                d.rectangle([bx, py0, bx + 3, py1], fill=M['oscura'])
                d.line([bx, py0, bx, py1], fill=M['luz'])
                d.line([bx + 3, py0, bx + 3, py1], fill=M['perfil'])


def suelo(ident, A, carpeta_tmp):
    filas, m, W, H = rejilla_entera(A)
    tema = A.get('tema', ident)
    NT = 2 * max(W, H)                       # generar-salvaje trabaja en cuadrado
    GS.N = NT
    agua, tierra, piedra = disenar_suelo(ident, A, filas, m, W, H, NT)
    V = GS.vertices(tierra)
    datos = GS.componer(random.Random(SEMILLA.get(tema, 4000)), agua, set(), tierra, piedra, V)
    cap = os.path.join(carpeta_tmp, ident + '_cap.png')
    rec = os.path.join(carpeta_tmp, ident + '_rec.png')
    det = os.path.join(carpeta_tmp, ident + '_det.png')
    fin = os.path.join(carpeta_tmp, 'arena_' + ident + '.png')
    GS.pintar(datos, cap)
    Image.open(cap).crop((0, 0, W * C, H * C)).save(rec)
    # El detalle del pueblo. En la nieve y la arenisca, sin matas de briznas
    # (recoloreadas parecen huellas).
    extra = ['--sin-matas'] if BIOMA.get(tema) else []
    subprocess.run([sys.executable, os.path.join(AQUI, 'detallar-captura-mapa.py'), rec, det] + extra, check=True)
    im = Image.open(det).convert('RGBA')

    # El bosque de fuera (antes de recolorear: así nieva también en los pinos)
    # y cuatro flores y piedras sueltas por el campo.
    bosque(im, tema, m, W, H, SEMILLA.get(tema, 4000) + 5)
    adornos(im, tema, filas, m, W, H, tierra | agua | set(piedra), SEMILLA.get(tema, 4000) + 9)

    arr = np.array(im)
    if BIOMA.get(tema):
        arr = gf_biomas.recolorear(arr, BIOMA[tema])
    alto, ancho = arr.shape[:2]

    # ── fuera del campo, más oscuro (dos escalones lisos) ──
    fuera = np.zeros((alto, ancho), np.uint8)
    fuera[:] = 200
    fuera[(m - 1) * C:(H - m + 1) * C, (m - 1) * C:(W - m + 1) * C] = 100      # el primer anillo
    fuera[m * C:(H - m) * C, m * C:(W - m) * C] = 0                            # el campo
    oscurecer(arr, fuera, [(100, 0.86), (200, 0.70)])

    # ── la sombra de cada muro (abajo a la derecha: el sol del juego viene de
    #    arriba a la izquierda) y la tierra más oscura bajo la hierba alta ──
    mascara = Image.new('L', (ancho, alto), 0)
    dm = ImageDraw.Draw(mascara)
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            dentro = m <= x < W - m and m <= y < H - m
            anillo = (m - 1 <= x <= W - m and m - 1 <= y <= H - m) and not dentro
            if ch == '#' and (dentro or anillo):
                # Rectángulos lisos: los de muros contiguos se funden en una
                # sola sombra (con esquinas redondeadas salía a festones).
                dm.rectangle([x * C + 5, y * C + 10, (x + 1) * C + 5, (y + 1) * C + 6], fill=255)
    mascara = np.array(mascara.filter(ImageFilter.GaussianBlur(2.2)))
    campo = np.zeros((alto, ancho), bool)
    campo[m * C:(H - m) * C, m * C:(W - m) * C] = True
    oscurecer(arr, np.where(campo, mascara, 0).astype(np.uint8), [(70, 0.90), (150, 0.78)])
    matas = Image.new('L', (ancho, alto), 0)
    dh = ImageDraw.Draw(matas)
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch == '*':
                dh.rounded_rectangle([x * C - 2, y * C - 1, (x + 1) * C + 1, (y + 1) * C + 2], 9, fill=255)
    oscurecer(arr, np.array(matas.filter(ImageFilter.GaussianBlur(1.6))), [(120, 0.84)])

    # ── el borde de fuera se funde hacia el color de fondo de la cámara ──
    fondo = np.array(FONDO.get(tema, (14, 34, 20)), np.float32)
    yy, xx = np.mgrid[0:alto, 0:ancho]
    dist_borde = np.minimum(np.minimum(xx, ancho - 1 - xx), np.minimum(yy, alto - 1 - yy)).astype(np.float32)
    k = np.clip(1.0 - dist_borde / FUNDIDO, 0, 1) ** 1.6       # 1 en el borde, 0 a FUNDIDO px
    for c in range(3):
        arr[..., c] = (arr[..., c].astype(np.float32) * (1 - k) + fondo[c] * k).astype(np.uint8)

    im = Image.fromarray(arr, 'RGBA')
    pintar_puentes(im, filas)
    # ── los comederos: el cuenco, pintado en su casilla ──
    cuenco = escala(cargar(os.path.join(NEWPRO, 'comidas', 'estofado.png')), 1.25)
    d = ImageDraw.Draw(im)
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch == '+':
                cx, cy = x * C + 16, y * C + 22
                sombra = Image.new('RGBA', im.size, (0, 0, 0, 0))
                ImageDraw.Draw(sombra).ellipse([cx - 13, cy - 5, cx + 13, cy + 5], fill=(10, 16, 12, 90))
                im.alpha_composite(sombra)
                im.alpha_composite(cuenco, (cx - cuenco.size[0] // 2, cy - cuenco.size[1] + 3))
    del d
    im.save(fin, optimize=True)

    destino = os.path.join(BIN, 'recortadas_arena_' + ident)
    subprocess.run([sys.executable, os.path.join(AQUI, 'trocear-escena.py'), fin, destino, VERSION], check=True)
    ruta_meta = os.path.join(destino, 'mapa.json')
    with open(ruta_meta, 'r', encoding='utf-8') as fh:
        meta = json.load(fh)
    meta.update({'arena': ident, 'tema': tema, 'marco': m, 'celda': C, 'huella': huella_suelo(filas),
                 'fondo': '#%02x%02x%02x' % FONDO.get(tema, (14, 34, 20)), 'generado_por': 'tools/generar-arenas.py'})
    with open(ruta_meta, 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    mapa_tiled(ident, tema, datos, NT, W, H)
    print('  suelo de %s: %dx%d, huella %s -> %s' % (ident, W * C, H * C, meta['huella'], destino))
    return fin


def mapa_tiled(ident, tema, datos, NT, W, H):
    """Maps/arena_<id>.json: la capa de casillas con la que se pintó el suelo.
    No se dibuja (el suelo son los trozos de recortadas_arena_<id>): la lee
    gf-agua.js para saber dónde hay agua y animarla, igual que en el mapa
    salvaje. Solo lo que cae en la imagen (2W x 2H casillas de 16)."""
    w, h = 2 * W, 2 * H
    capa = [datos[y * NT + x] for y in range(h) for x in range(w)]
    ts_ruta = TILESET_TEMA.get(tema, 'Game/MAPAS/tiles.png')
    mapa = {
        'compressionlevel': -1, 'width': w, 'height': h, 'tilewidth': T, 'tileheight': T,
        'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'type': 'map', 'version': '1.10', 'nextlayerid': 2, 'nextobjectid': 1,
        'properties': [{'name': 'generado_por', 'type': 'string', 'value': 'tools/generar-arenas.py'},
                       {'name': 'version', 'type': 'string', 'value': VERSION},
                       {'name': 'arena', 'type': 'string', 'value': ident}],
        'tilesets': [{'firstgid': 1, 'name': 'Tileset_mapa', 'image': '../' + ts_ruta,
                      'imagewidth': 1440, 'imageheight': 512, 'tilewidth': T, 'tileheight': T, 'columns': GS.TS_COLS,
                      'tilecount': 2880, 'margin': 0, 'spacing': 0}],
        'layers': [{'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'width': w, 'height': h, 'x': 0, 'y': 0,
                    'opacity': 1, 'visible': True, 'data': capa}],
    }
    ruta = os.path.join(BIN, 'Maps', 'arena_' + ident + '.json')
    with open(ruta, 'w', encoding='utf-8') as fh:
        json.dump(mapa, fh, ensure_ascii=False, separators=(',', ':'))


# ─────────────────────────────────────────────────────────── LOS OBJETOS
def recolor(im, bioma):
    return Image.fromarray(gf_biomas.recolorear(np.array(im.convert('RGBA')), bioma), 'RGBA')


def piezas_seto():
    """El seto del pueblo en 16 piezas (una por combinación de vecinos: N=1,
    E=2, S=4, O=8). Cada casilla de muro pone la suya y casan entre sí:
      · sin vecino a un lado, su remate redondeado (las columnas de la punta);
      · con muro DEBAJO, la cara de delante no se ve: toda la pieza es la
        franja clara de arriba (si no, una pared vertical saldría a rayas);
      · con muro ENCIMA, sin el filo de arriba.
    Todo son filas y columnas del dibujo original, recolocadas."""
    arte = np.array(cargar(os.path.join(OBJ, 'arbusto formado 2.png')))
    alto, ancho = arte.shape[:2]                       # 37 x 99
    CAPA = 13                                          # px de cada remate
    centro = arte[:, CAPA:ancho - CAPA]                # lo que se repite
    franja = [5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6]   # filas claras de arriba, ida y vuelta
    piezas = {}
    for mascara in range(16):
        N, E, S, O = mascara & 1, mascara & 2, mascara & 4, mascara & 8
        # 1) las filas
        src = arte.copy()
        cen = centro.copy()
        for destino_arr, origen in ((src, arte), (cen, centro)):
            if S:
                for y in range(14, alto):
                    destino_arr[y] = origen[franja[y % len(franja)]]
            if N:
                for y in range(0, 4):
                    destino_arr[y] = origen[franja[(y + 4) % len(franja)]]
        # 2) las columnas: 32 px del centro, y los remates donde no hay vecino
        pieza = np.zeros((alto, C, 4), np.uint8)
        for x in range(C):
            pieza[:, x] = cen[:, x % cen.shape[1]]
        if not O:
            pieza[:, :CAPA] = src[:, :CAPA]
        if not E:
            pieza[:, C - CAPA:] = src[:, ancho - CAPA:]
        piezas['seto_%d' % mascara] = Image.fromarray(pieza, 'RGBA')
    return piezas


def planta_sin_tierra(ruta):
    """La mata de un cultivo sin su cuadro de tierra: se queda lo que no es
    pardo de tierra (rojo muy por encima del verde y apagado)."""
    a = np.array(cargar(ruta)).astype(np.int32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    planta = (al > 0) & ((r - g < 25) | (r >= 170))
    # Fuera las motas sueltas: se queda el grupo más grande (4 vecinos).
    h, w = planta.shape
    visto = np.zeros((h, w), bool)
    mejor = []
    for y in range(h):
        for x in range(w):
            if not planta[y, x] or visto[y, x]:
                continue
            grupo = [(y, x)]
            visto[y, x] = True
            i = 0
            while i < len(grupo):
                cy, cx = grupo[i]
                i += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and planta[ny, nx] and not visto[ny, nx]:
                        visto[ny, nx] = True
                        grupo.append((ny, nx))
            if len(grupo) > len(mejor):
                mejor = grupo
    sal = np.zeros((h, w, 4), np.uint8)
    for (y, x) in mejor:
        sal[y, x] = a[y, x]
    im = Image.fromarray(sal, 'RGBA')
    return im.crop(im.getbbox())


def trozos(im, nombre):
    """Un objeto en cuatro pedazos (los que saltan al romperse)."""
    w, h = im.size
    cortes = [(0, 0, w // 2 + 1, h // 2 + 1), (w // 2 - 1, 0, w, h // 2 + 1), (0, h // 2 - 1, w // 2 + 1, h), (w // 2 - 1, h // 2 - 1, w, h)]
    return {'%s_trozo_%d' % (nombre, i + 1): im.crop(c) for i, c in enumerate(cortes)}


def barril_explosivo(barril):
    """El barril del juego con los aros en ROJO: se recolorean los grises de
    los flejes (y se entona un poco la madera). Mismo dibujo, otra pintura."""
    a = np.array(barril).astype(np.int32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    gris = (al > 0) & (mx - mn < 26) & (mx > 90)
    v = mx.astype(np.float32) / 255.0
    sal = a.copy()
    sal[..., 0] = np.where(gris, np.clip(255 * (0.35 + 0.75 * v), 0, 255), np.clip(r * 1.10 + 8, 0, 255))
    sal[..., 1] = np.where(gris, np.clip(255 * (0.08 + 0.26 * v), 0, 255), np.clip(g * 0.86, 0, 255))
    sal[..., 2] = np.where(gris, np.clip(255 * (0.06 + 0.20 * v), 0, 255), np.clip(b * 0.80, 0, 255))
    sal[..., 3] = al
    return Image.fromarray(sal.astype(np.uint8), 'RGBA')


def atlas():
    """Game/MAPAS/arena/objetos.png + objetos.json (atlas de Phaser)."""
    F = {}
    F.update(piezas_seto())
    for i in range(1, 5):
        roca = cargar(os.path.join(OBJ, 'piedra_%d.png' % i))
        F['roca_%d' % i] = roca
        F['roca_nieve_%d' % i] = recolor(roca, 'tundra')
        F['roca_arena_%d' % i] = recolor(roca, 'desierto')
    verde = planta_sin_tierra(os.path.join(OBJ, 'Plantas', 'planta_trigo', '3.png'))
    seca = planta_sin_tierra(os.path.join(OBJ, 'Plantas', 'planta_trigo', '4.png'))
    for nombre, im in (('hierba', verde), ('hierba_seca', seca), ('hierba_nieve', recolor(verde, 'tundra'))):
        F[nombre + '_1'] = im
        F[nombre + '_2'] = im.transpose(Image.FLIP_LEFT_RIGHT)
    caja = cargar(os.path.join(NEWPRO, 'objetos', 'cajon.png'))
    cofre = cargar(os.path.join(BIN, 'Game', 'Source', 'cofre.png'))
    barril = cargar(os.path.join(NEWPRO, 'objetos', 'barril.png'))
    explosivo = barril_explosivo(barril)
    F['caja'] = caja; F['cofre'] = cofre; F['barril'] = barril; F['barril_explosivo'] = explosivo
    F.update(trozos(caja, 'caja')); F.update(trozos(cofre, 'cofre')); F.update(trozos(explosivo, 'barril'))
    for nombre, ruta in (
            ('hueso', os.path.join(NEWPRO, 'naturaleza', 'hueso.png')),
            ('carne', os.path.join(NEWPRO, 'pesca', 'despiece', 'filete_crudo.png')),
            ('escudo', os.path.join(NEWPRO, 'pociones', 'pocion_defensa.png')),
            ('rapidez', os.path.join(BIN, 'Game', 'Source', 'bota.png')),
            ('municion', os.path.join(NEWPRO, 'pociones', 'pocion_energia.png')),
            ('super', os.path.join(NEWPRO, 'pociones', 'rayo_embotellado.png')),
            ('cuenco', os.path.join(NEWPRO, 'comidas', 'estofado.png')),
            ('pluma', os.path.join(NEWPRO, 'naturaleza', 'pluma.png')),
            ('bola_fuego', os.path.join(BIN, 'Game', 'Sprites', 'monstruos', 'efectos', 'bola_fuego.png')),
            ('espina', os.path.join(BIN, 'Game', 'Sprites', 'monstruos', 'efectos', 'espina.png')),
            ('orbe', os.path.join(BIN, 'Game', 'Sprites', 'monstruos', 'efectos', 'orbe_mago.png'))):
        F[nombre] = cargar(ruta)

    # ── empaquetar: por estantes, de alto a bajo, con 2 px de aire ──
    orden = sorted(F.items(), key=lambda kv: (-kv[1].size[1], kv[0]))
    ANCHO = 512
    x = y = 2
    estante = 0
    sitio = {}
    for nombre, im in orden:
        w, h = im.size
        if x + w + 2 > ANCHO:
            x = 2
            y += estante + 2
            estante = 0
        sitio[nombre] = (x, y)
        x += w + 2
        estante = max(estante, h)
    alto = y + estante + 2
    hoja = Image.new('RGBA', (ANCHO, alto), (0, 0, 0, 0))
    frames = {}
    for nombre, im in orden:
        px, py = sitio[nombre]
        hoja.paste(im, (px, py))
        w, h = im.size
        frames[nombre] = {'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                          'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
    os.makedirs(DESTINO_ATLAS, exist_ok=True)
    hoja.save(os.path.join(DESTINO_ATLAS, 'objetos.png'), optimize=True)
    with open(os.path.join(DESTINO_ATLAS, 'objetos.json'), 'w', encoding='utf-8') as fh:
        json.dump({'frames': frames, 'meta': {'app': 'tools/generar-arenas.py', 'version': VERSION, 'image': 'objetos.png',
                                              'format': 'RGBA8888', 'size': {'w': ANCHO, 'h': alto}, 'scale': '1'}},
                  fh, ensure_ascii=False, separators=(',', ':'))
    print('atlas: %d fotogramas, %dx%d -> %s' % (len(frames), ANCHO, alto, DESTINO_ATLAS))
    return hoja


# ─────────────────────────────────────────────────────────── LA VISTA PREVIA
# Con qué se levanta cada cosa en cada tema. ES LA MISMA TABLA QUE LLEVA
# BattleScene.js (TEMAS): si se cambia una, se cambia la otra.
TEMAS = {
    'pradera': {'borde': 'seto', 'muro': 'seto', 'hierba': 'hierba'},
    'rio':     {'borde': 'seto', 'muro': 'roca', 'hierba': 'hierba'},
    'ruinas':  {'borde': 'seto', 'muro': 'roca', 'hierba': 'hierba'},
    'nieve':   {'borde': 'roca_nieve', 'muro': 'roca_nieve', 'hierba': 'hierba_nieve'},
    'canon':   {'borde': 'roca_arena', 'muro': 'roca_arena', 'hierba': 'hierba_seca'},
}


def azar_celda(x, y, n):
    """Un número fijo por casilla, en aritmética de 32 bits: el MISMO que
    BattleScene._azarCelda (Math.imul y >>> 0), para que la vista previa
    enseñe las mismas rocas que el juego."""
    M = 0xffffffff
    h = ((x * 73856093) & M) ^ ((y * 19349663) & M)
    h = ((h ^ (h >> 13)) * 1274126177) & M
    return ((h ^ (h >> 16)) & M) % n


def vista(ident, A, ruta_suelo, salida):
    """El suelo con todo lo que BattleScene pone encima (muros, hierba alta,
    cajas) y un perro en cada salida: para mirar cómo queda sin abrir el juego."""
    filas, m, W, H = rejilla_entera(A)
    tema = TEMAS.get(A.get('tema', ident), TEMAS['pradera'])
    hoja = cargar(os.path.join(DESTINO_ATLAS, 'objetos.png'))
    with open(os.path.join(DESTINO_ATLAS, 'objetos.json'), 'r', encoding='utf-8') as fh:
        marcos = json.load(fh)['frames']

    def foto(nombre, k=1.0, espejo=False):
        f = marcos[nombre]['frame']
        im = hoja.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        if espejo:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        return escala(im, k)

    lienzo = cargar(ruta_suelo)
    cosas = []                                  # (profundidad, x, y, imagen) con (x, y) = pie centrado

    def muro(x, y):
        return 0 <= y < H and 0 <= x < W and filas[y][x] == '#'

    for y in range(H):
        for x in range(W):
            ch = filas[y][x]
            dentro = m <= x < W - m and m <= y < H - m
            anillo = (m - 1 <= x <= W - m and m - 1 <= y <= H - m) and not dentro
            if ch == '#' and (dentro or anillo):
                tipo = tema['borde'] if anillo else tema['muro']
                if tipo == 'seto':
                    # En el anillo, lo de más afuera no cuenta como vecino.
                    def vec(dx, dy):
                        nx, ny = x + dx, y + dy
                        if not muro(nx, ny):
                            return False
                        nd = m <= nx < W - m and m <= ny < H - m
                        na = (m - 1 <= nx <= W - m and m - 1 <= ny <= H - m) and not nd
                        return nd or na
                    mascara = (1 if vec(0, -1) else 0) | (2 if vec(1, 0) else 0) | (4 if vec(0, 1) else 0) | (8 if vec(-1, 0) else 0)
                    cosas.append(((y + 1) * C, x * C + 16, (y + 1) * C + 3, foto('seto_%d' % mascara)))
                else:
                    k = 1 + azar_celda(x, y, 4)
                    # A escala 1: la roca (37 px) apenas pasa de su casilla, así
                    # que lo que se ve es lo que choca.
                    cosas.append(((y + 1) * C, x * C + 16, (y + 1) * C + 2, foto('%s_%d' % (tipo, k), 1.0, azar_celda(y, x, 2) == 1)))
            elif ch == '*':
                for i, (px, py) in enumerate(((7, 13), (24, 11), (15, 22), (3, 28), (28, 27))):
                    jx, jy = azar_celda(x * 7 + i, y, 5) - 2, azar_celda(x, y * 7 + i, 5) - 2
                    n = '%s_%d' % (tema['hierba'], 1 + azar_celda(x + i, y + i, 2))
                    k = 0.8 if tema['hierba'] == 'hierba_seca' else 1.0
                    cosas.append((y * C + py + jy, x * C + px + jx, y * C + py + jy + 7, foto(n, k)))
            elif ch == 'c':
                cosas.append(((y + 1) * C - 1, x * C + 16, (y + 1) * C - 2, foto('caja', 1.15)))
            elif ch == 'o':
                cosas.append(((y + 1) * C - 1, x * C + 16, (y + 1) * C - 2, foto('cofre', 1.15)))
            elif ch == 'x':
                cosas.append(((y + 1) * C - 1, x * C + 16, (y + 1) * C - 1, foto('barril_explosivo', 1.1)))
    perro = cargar(os.path.join(BIN, 'Game', 'Sprites', 'mascota', 'derecha', 'run_1.png'))
    for (ax, ay) in A['apariciones']:
        px, py = (ax + m) * C + 16, (ay + m) * C + 16
        cosas.append((py + 9, px, py + 9, perro))
    cosas.sort(key=lambda c: c[0])
    for _, x, y, im in cosas:
        pegar_recortado(lienzo, im, int(x - im.size[0] // 2), int(y - im.size[1]))
    lienzo.save(salida)
    print('  vista previa -> ' + salida)


# ─────────────────────────────────────────────────────────── TODO
def main():
    args = sys.argv[1:]
    arenas = leer_arenas()
    elegidas = [a for a in args if a in arenas] or list(arenas)
    if '--sin-atlas' not in args:
        atlas()
    if '--sin-suelo' in args:
        return
    with tempfile.TemporaryDirectory() as tmp:
        if '--guardar' in args or '--vista' in args:    # deja las imágenes enteras al lado (para mirarlas)
            tmp = os.path.join(AQUI, '_arena-vistas')
            os.makedirs(tmp, exist_ok=True)
        for ident in elegidas:
            print('== ' + ident)
            fin = suelo(ident, arenas[ident], tmp)
            if '--vista' in args:
                vista(ident, arenas[ident], fin, os.path.join(tmp, 'vista_' + ident + '.png'))


if __name__ == '__main__':
    main()
