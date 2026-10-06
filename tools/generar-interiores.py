# -*- coding: utf-8 -*-
"""
LOS INTERIORES DE LAS CASAS                                       (2026-10-05)

    python tools/generar-interiores.py            (todo)
    python tools/generar-interiores.py --ver      (y además las vistas previas)

"Quiero poder entrar a las demás casas: varios tilesets y sus Tiled de
casillas de 16x16 pero dibujado 32x32, mayor o menor dependiendo la estatura
del objeto."

QUÉ ESCRIBE
  Game/MAPAS/Interiores/interiores_32.png   el tileset de suelos y paredes:
                                            tiles de 32 px (sin repetir)
  Game/MAPAS/Interiores/muebles/*.png       un PNG por mueble, a su tamaño
                                            (de 16x26 a 149x151)
  Maps/interiores/<sala>.json  + .tmx       el mapa de cada sala para Tiled:
                                            rejilla de 16 px, tiles de 32
                                            ancladas abajo a la izquierda (lo
                                            mismo que la mina), y los muebles
                                            como objetos-tile con su imagen
  recortadas_int_<sala>/                    el suelo y las paredes ya pintados
                                            con su luz (tools/trocear-escena.py),
                                            que es lo que el juego dibuja

LAS CINCO SALAS
  hogar     las casas de NPC y la casa en L: dormitorio y salón
  posada    las dos casas de dos pisos de la plaza: comedor y barra
  pociones  la casa de pociones: estantes de frascos, el caldero
  herreria  la herrería: fragua, yunque, armero
  cabana    la cabaña de la granja: troncos, chimenea, aparejos

DE DÓNDE SALE EL ARTE
  · Suelos y paredes: se pintan aquí, píxel a píxel, con la misma receta que
    el resto del juego (rampas de 4-5 tonos, contorno oscuro, tramado de
    Bayer, nada de degradados suaves). Se pinta la sala ENTERA y luego se
    trocea en tiles de 32: el tileset son las tiles distintas que salen.
  · Muebles: los del propio juego (Game/Objetos: estantes, mesas, sillas,
    horno, chimenea, cofre, cuadros, plantas, alfombras...) y los de newpro
    (caldero, faroles, braseros, barriles, leña), recortados a su contenido.
    Lo que el juego no tenía —cama, armario, yunque, armero— se dibuja aquí
    con las mismas rampas de madera y hierro de esos muebles.

AL DOBLE (2026-10-05)
  "Los Tiled de las casas y sus muebles son x1 y los quiero x2: las casas son
  pequeñas y el personaje tiene el tamaño de siempre." Las salas se siguen
  DISEÑANDO aquí a x1 (las coordenadas de SALAS, los tamaños de las paredes,
  los muebles...), y al ESCRIBIR todo se multiplica por ESC = 2: los muebles
  se pintan al doble (vecino más cercano: es pixel art), el tileset pasa a
  tiles de 64 sobre una rejilla de 32, y las colisiones, la salida, el punto
  de aparición, las luces y el suelo pintado van al doble. El jugador y la
  mascota no cambian: es la casa la que crece a su alrededor.

LO QUE LEE EL JUEGO (Scenes/InteriorScene.js)
  capa 'suelo'        tiles (solo para Tiled y de respaldo: se pinta la imagen)
  objetos 'muebles'   cada mueble: nombre = PNG, propiedades plano/anim/...
  objetos 'colisiones', 'salida', 'aparicion', 'luces'
"""
import json
import os
import sys
import math
import random
import hashlib
import tempfile
import numpy as np
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
OBJ = os.path.join(BIN, 'Game', 'Objetos')
NEWPRO = os.path.join(BIN, 'Game', 'newpro', 'objetos')
DIR_INT = os.path.join(BIN, 'Game', 'MAPAS', 'Interiores')
DIR_MUEBLES = os.path.join(DIR_INT, 'muebles')
DIR_MAPAS = os.path.join(BIN, 'Maps', 'interiores')
T = 32            # lado de una tile del ARTE, al diseñar
R = 16            # lado de una casilla del MAPA, al diseñar
ESC = 2           # todo se escribe al doble (ver AL DOBLE)
TE = T * ESC      # lado de una tile del tileset que se escribe
RE = R * ESC      # lado de una casilla del mapa que se escribe
VERSION = '20261007'
# Lo intermedio (la sala con su luz, que luego trocea trocear-escena.py, y las
# vistas previas) va fuera del proyecto: `--tmp <carpeta>` o la temporal.
TMP = sys.argv[sys.argv.index('--tmp') + 1] if '--tmp' in sys.argv else os.path.join(tempfile.gettempdir(), 'gf-interiores')
os.makedirs(TMP, exist_ok=True)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def h(*a):
    """Azar determinista en [0, 1) a partir de enteros."""
    d = hashlib.md5(('|'.join(str(int(v)) for v in a)).encode()).digest()
    return int.from_bytes(d[:4], 'little') / 4294967296.0


def mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def escala(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c)


# ═══════════════════════════════════════════════════════════════════ SUELOS
def suelo_madera(w, hgt, base):
    """Tablas horizontales de 8 px, juntas al tresbolillo. Periodo 64 x 32."""
    im = np.zeros((hgt, w, 3), np.float32)
    tonos = [0.92, 1.0, 1.06, 0.96, 1.03]
    for y in range(hgt):
        fila, ry = y // 8, y % 8
        desp = (0, 24, 12, 40)[fila % 4]
        for x in range(w):
            u = x + desp
            tramo, pos = (u // 32) % 2, u % 32
            k = tonos[((fila % 4) * 2 + tramo * 3 + 1) % 5]
            c = escala(base, k)
            if ry == 7: c = escala(base, 0.62)                    # junta entre tablas
            elif ry == 0: c = escala(base, k * 1.10)              # canto de arriba, con luz
            if pos == 0 and ry != 7: c = escala(base, 0.66)       # testa
            elif pos == 1 and ry != 7: c = escala(base, k * 1.08)
            # Veta: rayas cortas, un poco más oscuras.
            if ry in (3, 5) and ((u * 7 + fila * 13) % 23) < 6 and pos > 2: c = escala(c, 0.9)
            # Clavos.
            if pos in (3, 28) and ry in (2, 5): c = escala(base, 0.55)
            im[y, x] = c
    return im


def suelo_losas(w, hgt, base):
    """Losas de piedra irregulares sobre mortero. Periodo 64 x 64."""
    im = np.zeros((hgt, w, 3), np.float32)
    mortero = escala(base, 0.48)
    # Las losas de una celda de 64: rectángulos que cubren la celda.
    losas = [(0, 0, 26, 20), (26, 0, 38, 20), (0, 20, 18, 24), (18, 20, 28, 24), (46, 20, 18, 24),
             (0, 44, 34, 20), (34, 44, 30, 20)]
    for y in range(hgt):
        for x in range(w):
            u, v = x % 64, y % 64
            c = mortero
            for i, (lx, ly, lw, lh) in enumerate(losas):
                if lx <= u < lx + lw and ly <= v < ly + lh:
                    if u == lx or v == ly: c = mortero; break
                    k = 0.9 + 0.2 * h(i, 3)
                    c = escala(base, k)
                    if v == ly + 1 or u == lx + 1: c = escala(base, k * 1.12)       # bisel con luz
                    elif v == ly + lh - 1 or u == lx + lw - 1: c = escala(base, k * 0.8)
                    elif h(u, v, 7) > 0.93: c = escala(base, k * 0.9)               # grano
                    elif h(u, v, 9) > 0.97: c = escala(base, k * 1.08)
                    break
            im[y, x] = c
    return im


def suelo_baldosa(w, hgt, a, b):
    """Ajedrez de baldosas de 16 px con su llaga. Periodo 32."""
    im = np.zeros((hgt, w, 3), np.float32)
    llaga = escala(mezcla(a, b, 0.5), 0.55)
    for y in range(hgt):
        for x in range(w):
            u, v = x % 16, y % 16
            base = a if ((x // 16) + (y // 16)) % 2 == 0 else b
            c = base
            if u == 0 or v == 0: c = llaga
            elif u == 1 or v == 1: c = escala(base, 1.1)
            elif u == 15 or v == 15: c = escala(base, 0.84)
            elif h(x % 32, y % 32, 4) > 0.95: c = escala(base, 0.94)
            im[y, x] = c
    return im


# ═══════════════════════════════════════════════════════════════════ PAREDES
def pared_yeso(w, alto):
    """Yeso con entramado de madera (las casas del pueblo son así por fuera)."""
    yeso, viga = (224, 212, 188), (110, 70, 44)
    im = np.zeros((alto, w, 3), np.float32)
    for y in range(alto):
        for x in range(w):
            c = yeso
            if h(x % 64, y, 1) > 0.9: c = escala(yeso, 0.96)
            if h(x % 64, y, 2) > 0.96: c = escala(yeso, 1.03)
            if y < 8: c = escala(viga, 1.12 if y == 1 else (0.75 if y == 7 else 1.0))   # carrera
            elif y < 12: c = escala(c, 0.86)                                           # su sombra
            if x % 96 in range(0, 8) and y >= 8:                                       # pies derechos
                c = escala(viga, 1.12 if x % 96 == 1 else (0.75 if x % 96 == 7 else 1.0))
            if y >= alto - 10:                                                         # zócalo
                c = escala(viga, 1.15 if y == alto - 10 else (0.7 if y == alto - 1 else 0.95))
            im[y, x] = c
    return im


def pared_troncos(w, alto):
    madera = (146, 96, 58)
    im = np.zeros((alto, w, 3), np.float32)
    for y in range(alto):
        ry = y % 12
        for x in range(w):
            k = (1.18, 1.12, 1.06, 1.02, 1.0, 0.98, 0.95, 0.92, 0.88, 0.82, 0.74, 0.5)[ry]
            c = escala(madera, k)
            if ry in (3, 7) and ((x * 5 + (y // 12) * 31) % 29) < 7: c = escala(c, 0.86)    # corteza
            if h(x % 64, y, 3) > 0.94: c = escala(c, 0.92)
            im[y, x] = c
    return im


def pared_ladrillo(w, alto):
    piedra = (132, 124, 116)
    im = np.zeros((alto, w, 3), np.float32)
    for y in range(alto):
        hilada, ry = y // 10, y % 10
        for x in range(w):
            u = x + (0 if hilada % 2 == 0 else 12)
            pieza, pos = u // 24, u % 24
            k = 0.88 + 0.22 * h(pieza % 8, hilada % 6, 5)
            c = escala(piedra, k)
            if ry == 9 or pos == 0: c = escala(piedra, 0.5)
            elif ry == 0 or pos == 1: c = escala(piedra, k * 1.12)
            elif ry == 8 or pos == 23: c = escala(piedra, k * 0.82)
            # Hollín: la herrería tiene el techo negro.
            hollin = max(0.0, 1 - y / (alto * 0.7))
            c = escala(c, 1 - 0.35 * hollin)
            im[y, x] = c
    return im


def pared_morada(w, alto):
    papel, oro, madera = (92, 62, 112), (170, 136, 74), (88, 54, 36)
    corte = int(alto * 0.58)
    im = np.zeros((alto, w, 3), np.float32)
    for y in range(alto):
        for x in range(w):
            if y < corte:
                c = papel
                u, v = x % 16, y % 16
                if abs(u - 8) + abs(v - 8) == 4: c = escala(oro, 0.85)          # rombos
                elif u == 8 and v == 8: c = oro
                elif x % 32 in (0, 1): c = escala(papel, 0.88)                  # rayas
                if y < 5: c = escala(c, 0.8)
            elif y < corte + 4:
                c = escala(madera, (1.3, 1.15, 0.9, 0.7)[y - corte])           # moldura
            else:
                c = madera
                u = x % 48
                v = y - corte - 4
                hh = alto - corte - 4
                if u in (4, 43) or v in (4, hh - 5): c = escala(madera, 0.72)   # panel
                elif u in (5, 42) or v in (5, hh - 6): c = escala(madera, 1.2)
                if y >= alto - 4: c = escala(madera, 0.62)
            im[y, x] = c
    return im


def pared_azulejo(w, alto):
    yeso, azulejo, azul = (226, 204, 168), (214, 220, 212), (86, 120, 168)
    corte = int(alto * 0.45)
    im = np.zeros((alto, w, 3), np.float32)
    for y in range(alto):
        for x in range(w):
            if y < corte:
                c = yeso if h(x % 64, y, 6) < 0.92 else escala(yeso, 0.95)
                if y < 5: c = escala(c, 0.82)
            elif y < corte + 4:
                c = escala((120, 78, 48), (1.25, 1.1, 0.9, 0.7)[y - corte])
            else:
                u, v = x % 16, (y - corte - 4) % 16
                fila = (y - corte - 4) // 16
                base = azul if fila == 1 else azulejo
                c = base
                if u == 0 or v == 0: c = escala(base, 0.7)
                elif u == 1 or v == 1: c = escala(base, 1.08)
                elif fila == 1 and abs(u - 8) + abs(v - 8) <= 2: c = (232, 224, 190)
            im[y, x] = c
    return im


PAREDES = {'yeso': pared_yeso, 'troncos': pared_troncos, 'ladrillo': pared_ladrillo,
           'morada': pared_morada, 'azulejo': pared_azulejo}


# La ventana: 32 x 36 en el diseño, o sea 64 x 72 en el juego, poco más
# ancha que el personaje (46). Antes medía 64 x 64 en el diseño y salía de
# 128 x 128: "hasta las ventanas se ven gigantes". VENTANA_X / VENTANA_Y es
# dónde va dentro de su par de columnas de la pared.
VENTANA_W, VENTANA_H, VENTANA_X, VENTANA_Y = 32, 36, 16, 30


def ventana(im, x0, y0, cortina=None):
    """Ventana de VENTANA_W x VENTANA_H pintada sobre la pared (im es la sala entera, RGB)."""
    marco, oscuro = (112, 74, 46), (58, 36, 24)
    W, H = VENTANA_W, VENTANA_H
    alf = H - 6                                         # donde empieza el alféizar
    mx, my = W // 2, alf // 2                           # la cruz
    for y in range(H):
        for x in range(W):
            X, Y = x0 + x, y0 + y
            borde = x < 3 or x > W - 4 or y < 3 or y > alf - 1
            cruz = mx - 1 <= x <= mx or my - 1 <= y <= my
            if y >= alf:                                # alféizar, más ancho que el marco
                c = escala(marco, 1.25 if y == alf else (0.7 if y > alf + 3 else 1.0))
                if y > alf + 4: continue
            elif borde or cruz:
                c = escala(marco, 1.18 if (x == 1 or y == 1 or x == mx - 1 or y == my - 1) else (0.8 if (x == W - 4 or y == alf - 1 or x == mx or y == my) else 1.0))
                if x == 0 or x == W - 1 or y == 0: c = oscuro
            else:
                t = y / float(alf)
                c = mezcla((176, 214, 238), (120, 172, 214), t)                  # cielo
                if (x - y) % 13 in (0,) and x + y < 34: c = (226, 242, 250)       # reflejo
                if y > alf - 8: c = mezcla(c, (110, 150, 96), (y - (alf - 8)) / 8.0 * 0.5)  # copas lejos
            im[Y, X] = c
    if cortina:
        for lado in (0, 1):
            for y in range(1, alf - 2):
                ancho = 5 - (y // 8)
                for k in range(max(1, ancho)):
                    x = (k - 4) if lado == 0 else (W - 1 - k + 4)
                    X = x0 + x
                    if not (0 <= X < im.shape[1]): continue
                    c = escala(cortina, 1.15 if k % 2 == 0 else 0.85)
                    im[y0 + y, X] = c


# ═══════════════════════════════════════════════════════════════════ MUEBLES
def png(ruta):
    return Image.open(ruta).convert('RGBA')


def recorta(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def doble(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


class Pinta:
    """Lienzo de pixel art con contorno y rampas."""
    def __init__(self, w, hh):
        self.im = Image.new('RGBA', (w, hh), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def caja(self, x, y, w, hh, c, borde=None):
        self.d.rectangle([x, y, x + w - 1, y + hh - 1], fill=c + (255,))
        if borde: self.d.rectangle([x, y, x + w - 1, y + hh - 1], outline=borde + (255,))

    def px(self, x, y, c):
        self.im.putpixel((x, y), c + (255,))

    def linea(self, x0, y0, x1, y1, c):
        self.d.line([x0, y0, x1, y1], fill=c + (255,))


MADERA = [(58, 36, 24), (96, 60, 38), (128, 82, 50), (160, 106, 64), (190, 134, 84)]
HIERRO = [(30, 32, 38), (58, 62, 70), (86, 92, 102), (124, 130, 140), (176, 182, 190)]


def cama(manta):
    """Cama vista desde arriba en 3/4: cabecero, almohada, manta, piecero."""
    W, H = 52, 78
    p = Pinta(W, H)
    o, m1, m2, m3, m4 = MADERA
    # Cabecero
    p.caja(0, 0, W, 16, m2, o)
    p.caja(2, 2, W - 4, 3, m4); p.caja(2, 5, W - 4, 8, m3)
    for x in (5, 17, 29, 41): p.caja(x, 6, 6, 6, m2)
    p.caja(0, 0, 4, 22, m2, o); p.caja(W - 4, 0, 4, 22, m2, o)
    # Colchón y sábana
    p.caja(3, 16, W - 6, 54, (236, 230, 214), o)
    p.caja(8, 18, W - 16, 12, (250, 248, 240), o)                       # almohada
    p.linea(10, 27, W - 11, 27, (214, 206, 190))
    a, b = manta, escala(manta, 0.72)
    p.caja(3, 33, W - 6, 37, a, o)                                     # manta
    p.caja(3, 33, W - 6, 5, escala(manta, 1.18), o)                    # doblez de la sábana
    p.caja(4, 34, W - 8, 2, (246, 240, 226))
    for y in range(42, 68, 8): p.linea(5, y, W - 6, y, b)              # cuadros de la colcha
    for x in range(12, W - 6, 10): p.linea(x, 39, x, 68, b)
    p.caja(W - 9, 38, 5, 31, escala(manta, 0.6))                       # sombra del lado
    # Piecero
    p.caja(0, 68, W, 10, m2, o); p.caja(2, 69, W - 4, 2, m4)
    p.caja(0, 64, 4, 14, m1, o); p.caja(W - 4, 64, 4, 14, m1, o)
    return p.im


def armario():
    W, H = 50, 86
    p = Pinta(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.caja(0, 0, W, 8, m3, o); p.caja(1, 1, W - 2, 2, m4)              # cornisa
    p.caja(2, 8, W - 4, 70, m2, o)
    for x0 in (4, 26):                                                 # dos puertas
        p.caja(x0, 11, 20, 64, m3, o)
        p.caja(x0 + 3, 14, 14, 26, m2, o); p.caja(x0 + 3, 44, 14, 28, m2, o)
        p.linea(x0 + 4, 15, x0 + 15, 15, m4); p.linea(x0 + 4, 45, x0 + 15, 45, m4)
    p.caja(22, 40, 2, 5, (214, 176, 80)); p.caja(26, 40, 2, 5, (214, 176, 80))   # tiradores
    p.caja(0, 78, W, 8, m2, o); p.caja(2, 84, 6, 2, o); p.caja(W - 8, 84, 6, 2, o)
    p.caja(W - 6, 8, 4, 70, escala(m2, 0.7))                           # sombra lateral
    return p.im


def yunque():
    """Yunque de hierro sobre su tocón."""
    W, H = 50, 44
    p = Pinta(W, H)
    o, f1, f2, f3, f4 = HIERRO
    # tocón
    p.d.ellipse([8, 24, 41, 43], fill=MADERA[1] + (255,), outline=MADERA[0] + (255,))
    p.caja(8, 30, 34, 10, MADERA[2]); p.linea(8, 30, 8, 39, MADERA[0]); p.linea(41, 30, 41, 39, MADERA[0])
    p.d.ellipse([8, 22, 41, 34], fill=MADERA[3] + (255,), outline=MADERA[0] + (255,))
    p.d.ellipse([16, 25, 33, 31], outline=MADERA[2] + (255,))
    # yunque
    p.caja(17, 18, 16, 8, f2, o)                                       # cintura
    p.caja(12, 23, 26, 5, f2, o)                                       # pie
    pts = [(2, 9), (12, 6), (44, 6), (47, 9), (47, 16), (40, 18), (10, 18), (5, 14)]
    p.d.polygon(pts, fill=f3 + (255,), outline=o + (255,))             # tabla y cuerno
    p.linea(12, 7, 44, 7, f4); p.linea(13, 8, 43, 8, f4)
    p.linea(6, 10, 12, 8, f4)
    p.caja(41, 9, 2, 2, o)                                             # agujero
    p.linea(10, 17, 40, 17, f1)
    return p.im


def armero(espadas):
    """Armero de pared con tres espadas colgadas y un escudo."""
    W, H = 64, 74
    p = Pinta(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.caja(2, 8, 6, 64, m2, o); p.caja(W - 8, 8, 6, 64, m2, o)          # postes
    p.caja(0, 6, W, 7, m3, o); p.caja(1, 7, W - 2, 2, m4)              # travesaño
    p.caja(0, 60, W, 6, m3, o)
    x = 12
    for e in espadas:
        im = png(e).rotate(45, resample=Image.NEAREST, expand=True)
        im = recorta(im)
        if im.height > 50:
            k = 50 / im.height
            im = im.resize((max(1, int(im.width * k)), 50), Image.NEAREST)
        p.im.alpha_composite(im, (x, 10))
        x += max(12, im.width + 2)
    # escudo redondo
    p.d.ellipse([W - 26, 30, W - 8, 48], fill=(150, 46, 40, 255), outline=o + (255,))
    p.d.ellipse([W - 21, 35, W - 13, 43], fill=HIERRO[3] + (255,), outline=HIERRO[0] + (255,))
    return p.im


def aplique():
    """Aplique de pared: placa de hierro, platillo y vela con su llama.
    El farol de pared del juego (lampara_pared) mide 64x77: colgado dentro de
    una casa era más alto que media persona."""
    W, H = 14, 26
    p = Pinta(W, H)
    o, f1, f2, f3, f4 = HIERRO
    p.caja(4, 11, 6, 14, f2, o); p.caja(5, 12, 1, 12, f3)              # placa
    p.caja(1, 13, 12, 3, f2, o); p.linea(2, 13, 11, 13, f4)            # platillo
    p.caja(5, 5, 4, 8, (238, 226, 194), (150, 128, 96))                # vela
    p.linea(6, 6, 6, 11, (255, 248, 226))
    p.px(7, 4, (60, 40, 30))                                           # pábilo
    p.caja(6, 0, 3, 4, (255, 176, 58)); p.px(7, 1, (255, 244, 180)); p.px(7, 2, (255, 230, 140))
    return p.im


def mesa_con_comida():
    """La mesa de newpro, al doble, con platos de la cocina de newpro encima."""
    base = doble(png(os.path.join(NEWPRO, 'mesa.png')))
    comidas = os.path.join(BIN, 'Game', 'newpro', 'cocina')
    for i, (f, x) in enumerate((('pan.png', 10), ('sopa.png', 34), ('queso.png', 58))):
        ruta = os.path.join(comidas, f)
        if not os.path.exists(ruta): continue
        c = recorta(png(ruta))
        if c.height > 16:
            k = 16 / c.height
            c = c.resize((max(1, int(c.width * k)), 16), Image.NEAREST)
        base.alpha_composite(c, (min(base.width - c.width, x), max(0, 6 - c.height // 3)))
    return base


# EL TAMAÑO DE CADA MUEBLE (2026-10-05). Píxeles del juego por píxel del
# dibujo de partida. Antes TODO iba ×2 (y lo de newpro, que ya entraba al
# doble, ×4): una estantería de 184 px, una escoba de 134 y un caldero de 150
# junto a un personaje de 102. Ahora cada cosa mide lo que mide de verdad al
# lado de una persona de 1,75 m = 102 px (≈ 58 px por metro):
#   · lo del juego (Game/Objetos) y lo dibujado aquí: ×1.25 (una silla de
#     56 px, una estantería de 115, una mesa de 1,7 m);
#   · las camas y la chimenea, ×1.5 (2 m de cama; la chimenea con su tiro);
#   · lo de newpro ya viene al doble de su original, que es la densidad del
#     personaje: ×1 (un barril de 1 m = 60 px). El cubo y el taburete, por
#     debajo: un cubo no es un barril;
#   · los cuadros, ×1: van colgados y ya miden 1,5 m de ancho.
ESCALA_POR_DEFECTO = 1.25
ESCALA_MUEBLE = {
    'cama_roja': 1.5, 'cama_verde': 1.5, 'cama_azul': 1.5, 'chimenea': 1.5, 'fragua': 1.5,
    'cuadro_noche': 1.0, 'cuadro_dia': 1.0, 'cuadro_bosque': 1.0,
    'estante_pociones': 1.0, 'farol_pared': 1.0,
    'barril': 1.0, 'barril_abierto': 1.0, 'cajon': 1.0, 'caldero': 1.0,
    'caldero_fuego_1': 1.0, 'caldero_fuego_2': 1.0, 'brasero_1': 1.0, 'brasero_2': 1.0,
    'pila_lena': 1.0, 'nasas': 1.0, 'red_pesca': 1.0, 'cubo': 0.5, 'taburete': 0.75,
    'farol_1': 2.0, 'farol_2': 2.0,
}


def escala_de(nombre):
    return ESCALA_MUEBLE.get(nombre, ESCALA_POR_DEFECTO)


def construir_muebles():
    """Todos los PNG de muebles. Devuelve {nombre: Image}."""
    os.makedirs(DIR_MUEBLES, exist_ok=True)
    m = {}
    def de_obj(nombre, archivo, x2=False):
        im = recorta(png(os.path.join(OBJ, archivo)))
        m[nombre] = doble(im) if x2 else im
    def de_new(nombre, archivo, x2=True):
        im = recorta(png(os.path.join(NEWPRO, archivo)))
        m[nombre] = doble(im) if x2 else im
    for n, a in [('estante_libros', 'estante1bajo.png'), ('estante_libros2', 'estante2bajo.png'),
                 ('estante_herramientas', 'estante3bajo.png'), ('estante_herramientas2', 'estante4bajo.png'),
                 ('estante_frascos', 'estante1.png'), ('estante_pociones', 'estante2.png'),
                 ('mostrador', 'mostrador.png'), ('barra', 'mesatienda1.png'), ('barra2', 'mesatienda5.png'),
                 ('mesa_larga', 'mesatienda8.png'), ('mesa_vela', 'mesatienda9.png'), ('mesa_espada', 'mesatienda10.png'),
                 ('expositor_pociones', 'mesatienda3.png'), ('expositor_fruta', 'mesatienda7.png'),
                 ('expositor_verdura', 'mesatienda6.png'),
                 ('silla', 'silla2.png'), ('silla_b', 'silla3.png'), ('taburete_bar', 'sillla1.png'),
                 ('chimenea', 'horno apagado.png'), ('fragua', 'horno.png'), ('cofre', 'cofre.png'),
                 ('cuadro_noche', 'cuadro1.png'), ('cuadro_dia', 'cuadro2.png'), ('cuadro_bosque', 'cuadro3.png'),
                 ('farol_pared', 'lampara_pared.png'), ('planta_alta', 'planta1.png'), ('planta_pequena', 'planta_1.png'),
                 ('planta_flores', 'planta3.png'), ('planta_cactus', 'planta2.png'),
                 ('cesta', 'cesta1.png'), ('escoba', 'escoba1.png'), ('carbon', 'carbon.png'),
                 ('alfombra_verde', 'alfombra1.png'), ('alfombra_roja', 'alfombra3.png'),
                 ('alfombra_azul', 'alfombra4.png'), ('alfombra_morada', 'alfombra6.png'),
                 ('escalera', 'escalera original.png')]:
        de_obj(n, a)
    for n, a in [('barril', 'barril.png'), ('barril_abierto', 'barril_abierto.png'), ('cajon', 'cajon.png'),
                 ('caldero', 'caldero.png'), ('caldero_fuego_1', 'caldero_fuego_1.png'),
                 ('caldero_fuego_2', 'caldero_fuego_2.png'), ('brasero_1', 'brasero_1.png'),
                 ('brasero_2', 'brasero_2.png'), ('pila_lena', 'pila_lena.png'), ('cubo', 'cubo.png'),
                 ('nasas', 'nasas_apiladas.png'), ('red_pesca', 'tendedero_red.png'), ('taburete', 'taburete.png')]:
        de_new(n, a)
    for n, a in [('farol_1', 'farol_1.png'), ('farol_2', 'farol_2.png')]:
        de_new(n, a, x2=False)
    m['cama_roja'] = cama((176, 58, 56))
    m['cama_verde'] = cama((74, 128, 82))
    m['cama_azul'] = cama((64, 96, 168))
    m['armario'] = armario()
    m['yunque'] = yunque()
    armas = os.path.join(OBJ, 'armas')
    m['armero'] = armero([os.path.join(armas, 'espada_' + n + '.png') for n in ('hierro', 'cobre', 'madera')])
    m['mesa_comida'] = mesa_con_comida()
    m['aplique'] = aplique()
    m['alfombra_pasillo'] = recorta(png(os.path.join(OBJ, 'alfombra5.png')))
    # A su tamaño en el juego (ver ESCALA_MUEBLE): lo que se guarda y lo que
    # se coloca. Vecino más cercano: es pixel art.
    for n in list(m):
        im, k = m[n], escala_de(n)
        m[n] = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
        m[n].save(os.path.join(DIR_MUEBLES, n + '.png'), optimize=True)
    return m


# ═══════════════════════════════════════════════════════════════════ LAS SALAS
# Cada mueble: (nombre, x, y_pie, props), EN PÍXELES DEL JUEGO (la sala ya al
# doble: una tile de la sala son 64 px). x es el borde IZQUIERDO del dibujo e
# y su BORDE DE ABAJO (así se anclan los objetos-tile en Tiled). Lo que va
# contra la pared del fondo lleva el pie un poco por debajo de la línea de la
# pared (y = 256), que es lo que en esta vista dice "está pegado a la pared".
# props: plano (no choca, va pegado al suelo o a la pared), pie (alto de la
# huella que choca, en píxeles del DIBUJO), anim (fuego/caldero/fragua/
# brasero/farol/vela/yunque) y fx, fy (dónde va el efecto, en píxeles del
# DIBUJO desde su esquina de arriba). Las medidas del dibujo se pasan a las
# del juego con su ESCALA_MUEBLE, así que no hay que tocarlas si un mueble
# cambia de tamaño.
#
# REHECHAS (2026-10-05): "los objetos están grandes y no van con el tamaño del
# personaje; hasta las ventanas se ven gigantes; hay cosas que no deben estar,
# por ejemplo cristales". Cada sala tiene ahora zonas con sentido (dormir,
# cocinar, la barra, el taller...), todo contra las paredes o agrupado, y un
# paso libre de la puerta al fondo.
APLIQUE = {'plano': True, 'anim': 'vela', 'fx': 7, 'fy': 3}
SALAS = {
    'hogar': {
        # El dormitorio a la izquierda (armario, cama, mesilla, estantería y
        # baúl), la chimenea frente a la puerta con su alfombra y dos sillas,
        # la cocina al fondo a la derecha y la mesa de comer delante de ella.
        # Un pasillo de alfombra lleva de la puerta a la chimenea.
        'titulo': 'Home', 'w': 20, 'h': 14, 'suelo': ('madera', (172, 112, 70)), 'pared': 'yeso',
        'ventanas': [(7, (166, 52, 50)), (14, (166, 52, 50))], 'puerta': 9,
        'muebles': [
            # dormitorio
            ('armario', 84, 300, {'pie': 20}),
            ('cama_roja', 160, 382, {'pie': 66}),
            ('mesa_vela', 252, 314, {'anim': 'vela', 'fx': 8, 'fy': 6, 'pie': 18}),
            ('estante_libros2', 326, 302, {'pie': 20}),
            ('cuadro_bosque', 150, 192, {'plano': True}),
            ('cofre', 182, 426, {}),
            ('alfombra_roja', 250, 452, {'plano': True}),
            ('planta_alta', 84, 500, {}),
            # la chimenea
            ('chimenea', 601, 302, {'anim': 'fuego', 'fx': 26, 'fy': 53, 'pie': 22}),
            ('cesta', 548, 300, {}),
            ('pila_lena', 690, 306, {}),
            ('alfombra_azul', 572, 432, {'plano': True}),
            ('silla', 528, 440, {}), ('silla_b', 722, 440, {}),
            ('aplique', 450, 200, APLIQUE), ('aplique', 820, 200, APLIQUE),
            ('alfombra_pasillo', 614, 830, {'plano': True}),
            # la cocina
            ('expositor_verdura', 880, 318, {'pie': 18}),
            ('cajon', 950, 306, {}),
            ('barril', 1020, 310, {}), ('barril_abierto', 1080, 310, {}),
            ('cesta', 1150, 300, {}),
            ('aplique', 1110, 200, APLIQUE),
            # el comedor
            ('alfombra_verde', 892, 616, {'plano': True}),
            ('mesa_comida', 909, 600, {}),
            ('silla', 870, 608, {}), ('silla_b', 1018, 608, {}),
            ('estante_libros', 1130, 560, {'pie': 20}),
            # la entrada
            ('barril', 470, 812, {}), ('cubo', 440, 814, {}),
            ('escoba', 724, 818, {}),
            ('planta_pequena', 84, 820, {}),
            ('planta_flores', 1136, 824, {}),
        ]},
    'posada': {
        # La barra al fondo a la izquierda (frascos y barriles detrás, tres
        # taburetes delante), el hogar al centro con su leña, la despensa a la
        # derecha, la escalera al piso de arriba en la esquina, cuatro mesas
        # largas con sus sillas y dos mesitas junto a la entrada. La alfombra
        # de la puerta lleva al hogar sin tropezar con nada.
        'titulo': 'Inn', 'w': 24, 'h': 16, 'suelo': ('baldosa', (212, 194, 160), (168, 98, 72)), 'pared': 'azulejo',
        'ventanas': [(5, (70, 120, 80)), (17, (70, 120, 80))], 'puerta': 11,
        'muebles': [
            # la barra
            ('estante_frascos', 92, 300, {'pie': 16}), ('estante_frascos', 150, 300, {'pie': 16}),
            ('barril', 214, 308, {}), ('barril_abierto', 272, 308, {}),
            ('cajon', 334, 306, {}),
            ('barra', 104, 440, {'pie': 34}),
            ('taburete_bar', 116, 482, {}), ('taburete_bar', 166, 482, {}), ('taburete_bar', 216, 482, {}),
            ('aplique', 250, 200, APLIQUE),
            ('cuadro_dia', 460, 192, {'plano': True}),
            # el hogar
            ('pila_lena', 622, 306, {}),
            ('chimenea', 728, 302, {'anim': 'fuego', 'fx': 26, 'fy': 53, 'pie': 22}),
            ('alfombra_azul', 700, 420, {'plano': True}),
            ('aplique', 600, 200, APLIQUE), ('aplique', 900, 200, APLIQUE),
            # la despensa
            ('cesta', 830, 300, {}),
            ('expositor_fruta', 880, 316, {'pie': 18}), ('expositor_verdura', 946, 316, {'pie': 18}),
            ('cajon', 1020, 306, {}),
            ('cuadro_bosque', 1000, 170, {'plano': True}),
            # la escalera
            ('barril', 1280, 310, {}),
            ('escalera', 1360, 300, {'pie': 34}),
            ('aplique', 1250, 200, APLIQUE),
            # las mesas
            ('mesa_larga', 300, 724, {'anim': 'vela', 'fx': 26, 'fy': 22}),
            ('silla', 262, 650, {}), ('silla', 262, 716, {}), ('silla_b', 372, 650, {}), ('silla_b', 372, 716, {}),
            ('mesa_larga', 530, 724, {'anim': 'vela', 'fx': 26, 'fy': 22}),
            ('silla', 492, 650, {}), ('silla', 492, 716, {}), ('silla_b', 602, 650, {}), ('silla_b', 602, 716, {}),
            ('mesa_larga', 950, 724, {'anim': 'vela', 'fx': 26, 'fy': 22}),
            ('silla', 912, 650, {}), ('silla', 912, 716, {}), ('silla_b', 1022, 650, {}), ('silla_b', 1022, 716, {}),
            ('mesa_larga', 1180, 724, {'anim': 'vela', 'fx': 26, 'fy': 22}),
            ('silla', 1142, 650, {}), ('silla', 1142, 716, {}), ('silla_b', 1252, 650, {}), ('silla_b', 1252, 716, {}),
            ('mesa_comida', 170, 904, {}),
            ('taburete', 130, 930, {}), ('taburete', 280, 930, {}),
            ('mesa_comida', 1170, 904, {}),
            ('taburete', 1130, 930, {}), ('taburete', 1280, 930, {}),
            ('alfombra_pasillo', 742, 954, {'plano': True}),
            ('planta_flores', 84, 800, {}), ('planta_alta', 1420, 820, {}),
            ('planta_pequena', 1420, 520, {}),
        ]},
    'pociones': {
        # La biblioteca de la alquimista al fondo a la izquierda (frascos y
        # libros), el caldero en el centro sobre su alfombra con los
        # ingredientes al lado, los expositores de pociones a la derecha bajo
        # la ventana y el mostrador de cobrar cerca de la puerta. SIN
        # cristales: no pintaban nada en una casa.
        'titulo': 'Potion Shop', 'w': 20, 'h': 14, 'suelo': ('madera', (112, 74, 52)), 'pared': 'morada',
        'ventanas': [(15, (120, 60, 140))], 'puerta': 9,
        'muebles': [
            ('estante_frascos', 84, 300, {'pie': 16}), ('estante_frascos', 142, 300, {'pie': 16}),
            ('estante_libros2', 204, 302, {'pie': 20}), ('estante_libros', 282, 302, {'pie': 20}),
            ('cuadro_noche', 420, 192, {'plano': True}),
            ('aplique', 380, 200, APLIQUE), ('aplique', 560, 200, APLIQUE), ('aplique', 900, 200, APLIQUE),
            ('mesa_vela', 600, 314, {'anim': 'vela', 'fx': 8, 'fy': 6, 'pie': 18}),
            ('expositor_pociones', 760, 318, {'pie': 18}), ('expositor_pociones', 830, 318, {'pie': 18}),
            ('cesta', 1004, 300, {}),
            ('expositor_pociones', 1120, 318, {'pie': 18}),
            # el caldero y sus ingredientes
            ('alfombra_azul', 572, 566, {'plano': True}),
            ('caldero', 613, 552, {'anim': 'caldero', 'fx': 27, 'fy': 10}),
            ('barril', 500, 548, {}), ('cesta', 730, 540, {}),
            # el rincón de leer recetas
            ('alfombra_roja', 84, 664, {'plano': True}),
            ('mesa_vela', 110, 620, {'anim': 'vela', 'fx': 8, 'fy': 6}),
            ('silla', 180, 628, {}),
            # el mostrador
            ('barra2', 960, 660, {'pie': 34}),
            ('cajon', 900, 820, {}), ('barril', 960, 820, {}),
            ('planta_flores', 84, 820, {}), ('planta_cactus', 1170, 820, {}),
            ('escoba', 724, 818, {}),
        ]},
    'herreria': {
        # La fragua con su carbón en la esquina, el yunque y el brasero
        # delante, el cubo para templar; el armero y los estantes de
        # herramientas en la pared; el banco de las espadas junto a la
        # ventana; un banco de trabajo en medio y el almacén en las esquinas.
        'titulo': 'Smithy', 'w': 22, 'h': 14, 'suelo': ('losas', (134, 128, 120)), 'pared': 'ladrillo',
        'ventanas': [(16, None)], 'puerta': 10,
        'muebles': [
            ('fragua', 96, 310, {'anim': 'fragua', 'fx': 21, 'fy': 78, 'pie': 20}),
            ('carbon', 156, 306, {}),
            ('pila_lena', 84, 660, {}),
            ('brasero_1', 236, 470, {'anim': 'brasero'}),
            ('yunque', 150, 520, {'anim': 'yunque', 'fx': 25, 'fy': 8}),
            ('cubo', 226, 538, {}),
            ('armero', 380, 300, {'pie': 16}),
            ('estante_herramientas', 500, 300, {'pie': 16}), ('estante_herramientas2', 566, 300, {'pie': 16}),
            ('aplique', 700, 200, APLIQUE), ('aplique', 960, 200, APLIQUE),
            ('mesa_espada', 880, 316, {'pie': 18}), ('mesa_espada', 950, 316, {'pie': 18}),
            ('cajon', 1060, 306, {}),
            ('barril', 1180, 310, {}), ('barril_abierto', 1236, 310, {}), ('cajon', 1270, 372, {}),
            # el banco de trabajo
            ('mesa_espada', 560, 560, {}), ('taburete', 524, 584, {}),
            # delante
            ('carbon', 300, 820, {}),
            ('cajon', 1250, 820, {}), ('barril', 1190, 820, {}),
            ('escoba', 790, 818, {}),
        ]},
    'cabana': {
        # La cama, la mesilla y el baúl en un rincón, la chimenea con su leña,
        # una silla y la alfombra al fondo; la mesa con dos taburetes; y, del
        # pescador, la red de secar, las nasas y un barril.
        'titulo': 'Cabin', 'w': 18, 'h': 13, 'suelo': ('madera', (124, 82, 54)), 'pared': 'troncos',
        'ventanas': [(12, (178, 128, 64))], 'puerta': 8,
        'muebles': [
            ('cama_verde', 90, 382, {'pie': 66}),
            ('cofre', 112, 428, {}),
            ('mesa_vela', 180, 314, {'anim': 'vela', 'fx': 8, 'fy': 6, 'pie': 18}),
            ('chimenea', 420, 302, {'anim': 'fuego', 'fx': 26, 'fy': 53, 'pie': 22}),
            ('pila_lena', 514, 306, {}),
            ('cesta', 360, 300, {}),
            ('alfombra_verde', 390, 470, {'plano': True}),
            ('silla', 534, 452, {}),
            ('aplique', 330, 200, APLIQUE), ('aplique', 660, 200, APLIQUE),
            ('cesta', 812, 300, {}),
            ('red_pesca', 890, 300, {'pie': 16}),
            ('barril', 1000, 312, {}),
            ('mesa_comida', 700, 580, {}),
            ('taburete', 662, 610, {}), ('taburete', 808, 610, {}),
            ('nasas', 980, 760, {}), ('cajon', 900, 760, {}),
            ('planta_pequena', 84, 750, {}),
            ('cubo', 470, 760, {}),
            ('escoba', 664, 754, {}),
        ]},
}


def pintar_sala(cfg):
    """La sala entera (sin muebles), RGB uint8, y la máscara de suelo."""
    W, H = cfg['w'] * T, cfg['h'] * T
    im = np.zeros((H, W, 3), np.float32)
    im[:] = (10, 8, 12)                                  # fuera de la casa: negro
    s = cfg['suelo']
    if s[0] == 'madera': piso = suelo_madera(W, H, s[1])
    elif s[0] == 'losas': piso = suelo_losas(W, H, s[1])
    else: piso = suelo_baldosa(W, H, s[1], s[2])
    suelo = np.zeros((H, W), bool)
    suelo[4 * T:(cfg['h'] - 1) * T, T:W - T] = True
    d = cfg['puerta']
    suelo[(cfg['h'] - 1) * T:, d * T:(d + 2) * T] = True
    im[suelo] = piso[suelo]
    # La pared del fondo: 3 tiles de alto.
    alto = 3 * T
    im[T:4 * T, T:W - T] = PAREDES[cfg['pared']](W - 2 * T, alto)
    for col, cortina in cfg.get('ventanas', []):
        ventana(im, col * T + VENTANA_X, T + VENTANA_Y, cortina)
    # Los cantos: arriba, a los lados y abajo (con el hueco de la puerta).
    viga = (96, 60, 38) if cfg['pared'] != 'ladrillo' else (92, 88, 84)
    def canto(x0, y0, x1, y1):
        im[y0:y1, x0:x1] = viga
    canto(T - 10, T - 10, W - T + 10, T)                 # arriba
    canto(T - 10, T - 10, T, (cfg['h'] - 1) * T + 10)    # izquierda
    canto(W - T, T - 10, W - T + 10, (cfg['h'] - 1) * T + 10)
    canto(T - 10, (cfg['h'] - 1) * T, d * T, (cfg['h'] - 1) * T + 10)            # abajo, izq.
    canto((d + 2) * T, (cfg['h'] - 1) * T, W - T + 10, (cfg['h'] - 1) * T + 10)  # abajo, der.
    # Luz del canto (1 px) y su contorno.
    im[T - 10, T - 10:W - T + 10] = escala(viga, 0.55)
    im[T - 9, T - 9:W - T + 9] = escala(viga, 1.3)
    # La puerta: umbral claro y felpudo.
    yb = (cfg['h'] - 1) * T
    im[yb + 6:yb + 10, d * T:(d + 2) * T] = escala(viga, 1.25)
    fx0, fy0 = d * T + 8, yb - 22
    for y in range(fy0, fy0 + 18):
        for x in range(fx0, fx0 + 48):
            c = (150, 112, 62) if ((x + y) // 2) % 2 == 0 else (128, 92, 50)
            if y in (fy0, fy0 + 17) or x in (fx0, fx0 + 47): c = (92, 62, 34)
            im[y, x] = c
    # Fuera, por la puerta, se ve la calle (la luz de fuera).
    for y in range(yb + 10, H):
        im[y, d * T:(d + 2) * T] = mezcla((168, 150, 120), (60, 56, 50), (y - yb - 10) / max(1, H - yb - 10))
    return np.clip(im, 0, 255).astype(np.uint8), suelo


def luz_y_sombra(img, cfg, suelo):
    """El pase de luz de la imagen que pinta el juego: oclusión, la luz de las
    ventanas en el suelo y la de la puerta. Tramado, sin degradados suaves."""
    H, W = img.shape[:2]
    im = img.astype(np.float32)
    u = np.tile(BAYER, (H // 4 + 1, W // 4 + 1))[:H, :W]
    ys, xs = np.mgrid[0:H, 0:W]
    # Oclusión junto a la pared del fondo y a los lados.
    d_fondo = (ys - 4 * T).astype(np.float32)
    d_lado = np.minimum(xs - T, (W - T) - xs).astype(np.float32)
    k = np.clip(1 - d_fondo / 26.0, 0, 1) ** 1.4 * 0.38 + np.clip(1 - d_lado / 18.0, 0, 1) ** 1.6 * 0.26
    k = np.where(k + (u - 0.5) * 0.12 > 0.04, k, 0)
    for c in range(3):
        im[..., c] = np.where(suelo, im[..., c] * (1 - k), im[..., c])
    # La luz de cada ventana: un trapecio que cae hacia abajo a la derecha.
    for col, _ in cfg.get('ventanas', []):
        x0 = col * T + VENTANA_X + 2
        for y in range(4 * T, min(H - T, 4 * T + 120)):
            t = (y - 4 * T) / 120.0
            a = x0 + int(t * 30); b = a + VENTANA_W - 4 + int(t * 12)
            fuerza = 0.30 * (1 - t) ** 1.3
            for x in range(max(T, a), min(W - T, b)):
                borde = min(x - a, b - x) / 10.0
                f = fuerza * min(1, borde)
                if f + (u[y, x] - 0.5) * 0.06 > 0.02 and suelo[y, x]:
                    im[y, x] = im[y, x] * (1 + f * 0.9) + np.array((26, 20, 8)) * f
    # La luz de la calle entrando por la puerta.
    d = cfg['puerta']; yb = (cfg['h'] - 1) * T
    for y in range(yb - 60, yb):
        t = (yb - y) / 60.0
        for x in range(d * T - 10, (d + 2) * T + 10):
            f = 0.22 * (1 - t) ** 1.5
            if suelo[y, x] and f + (u[y, x] - 0.5) * 0.05 > 0.02:
                im[y, x] = im[y, x] * (1 + f)
    return np.clip(im, 0, 255).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════════ SALIDA
def trocear_en_tiles(salas_img):
    """Corta todas las salas en tiles de 32 y quita las repetidas."""
    unicas, indice, rejillas = [], {}, {}
    for nombre, img in salas_img.items():
        H, W = img.shape[:2]
        rej = []
        for j in range(H // T):
            fila = []
            for i in range(W // T):
                t = img[j * T:(j + 1) * T, i * T:(i + 1) * T]
                k = hashlib.md5(t.tobytes()).hexdigest()
                if k not in indice:
                    indice[k] = len(unicas)
                    unicas.append(t)
                fila.append(indice[k])
            rej.append(fila)
        rejillas[nombre] = rej
    cols = 16
    filas = (len(unicas) + cols - 1) // cols
    hoja = np.zeros((filas * T, cols * T, 4), np.uint8)
    for n, t in enumerate(unicas):
        y, x = (n // cols) * T, (n % cols) * T
        hoja[y:y + T, x:x + T, :3] = t
        hoja[y:y + T, x:x + T, 3] = 255
    return hoja, cols, len(unicas), rejillas


def colisiones(cfg, muebles):
    """En las medidas YA AL DOBLE: los muebles llegan escalados."""
    E = ESC
    W, H = cfg['w'] * TE, cfg['h'] * TE
    d = cfg['puerta']
    yb = (cfg['h'] - 1) * TE
    out = [
        (0, 0, W, 4 * TE + 2 * E),                                  # pared del fondo
        (0, 0, TE + 2 * E, H), (W - TE - 2 * E, 0, TE + 2 * E, H),  # lados
        (0, yb + 4 * E, d * TE + 4 * E, H - yb - 4 * E),            # abajo, a los lados de la puerta
        ((d + 2) * TE - 4 * E, yb + 4 * E, W - (d + 2) * TE + 4 * E, H - yb - 4 * E),
    ]
    for nombre, x, y, props, w, hh in muebles:
        if props.get('plano'): continue
        pie = props.get('pie', min(24 * E, max(10 * E, int(hh * 0.32))))
        out.append((x + 3 * E, y - pie, max(6 * E, w - 6 * E), pie))
    return out


def json_mapa(nombre, cfg, rej, ncols, ntiles, hoja_wh, muebles_sala, catalogo):
    """El mapa, ya al doble: casillas de RE, tiles de TE, muebles escalados."""
    E = ESC
    Wm, Hm = cfg['w'] * 2, cfg['h'] * 2
    data = [0] * (Wm * Hm)
    for j, fila in enumerate(rej):
        for i, t in enumerate(fila):
            # Tile de 32 anclada ABAJO A LA IZQUIERDA de la casilla (2i, 2j+1).
            data[(2 * j + 1) * Wm + 2 * i] = t + 1
    first_m = ntiles + 1
    ids = {n: k for k, n in enumerate(catalogo)}
    tiles_m = [{'id': ids[n], 'image': '../../Game/MAPAS/Interiores/muebles/%s.png' % n,
                'imagewidth': catalogo[n][0], 'imageheight': catalogo[n][1]} for n in catalogo]
    sig = [1]
    def oid():
        sig[0] += 1
        return sig[0] - 1
    def prop_list(p):
        out = []
        for k, v in p.items():
            tipo = 'bool' if isinstance(v, bool) else ('int' if isinstance(v, int) else ('float' if isinstance(v, float) else 'string'))
            out.append({'name': k, 'type': tipo, 'value': v})
        return out
    objs = []
    for (n, x, y, props, w, hh) in muebles_sala:
        o = {'id': oid(), 'gid': first_m + ids[n], 'name': n, 'type': '', 'x': x, 'y': y,
             'width': w, 'height': hh, 'rotation': 0, 'visible': True}
        if props: o['properties'] = prop_list(props)
        objs.append(o)
    rect = lambda r, nm='': {'id': oid(), 'name': nm, 'type': '', 'x': r[0], 'y': r[1], 'width': r[2], 'height': r[3], 'rotation': 0, 'visible': True}
    col = [rect(r) for r in colisiones(cfg, muebles_sala)]
    d = cfg['puerta']; yb = (cfg['h'] - 1) * TE
    salida = [rect((d * TE + 6 * E, yb + 2 * E, 2 * TE - 12 * E, 26 * E), 'salida')]
    apar = [{'id': oid(), 'name': 'aparicion', 'type': '', 'x': (d + 1) * TE, 'y': yb - 64 * E, 'width': 0, 'height': 0,
             'point': True, 'rotation': 0, 'visible': True}]
    luces = []
    for c, _ in cfg.get('ventanas', []):
        luces.append(dict(rect(((c * T + VENTANA_X) * E, 4 * TE, (VENTANA_W + 18) * E, 120 * E), 'ventana')))
    for (n, x, y, props, w, hh) in muebles_sala:
        if props.get('anim') in ('fuego', 'fragua', 'brasero', 'caldero', 'vela', 'farol'):
            fx = props.get('fx', w // 2); fy = props.get('fy', hh // 3)
            r = {'fuego': 120, 'fragua': 150, 'brasero': 90, 'caldero': 80, 'vela': 54, 'farol': 70}[props['anim']] * E
            luces.append({'id': oid(), 'name': props['anim'], 'type': '', 'x': x + fx, 'y': y - hh + fy,
                          'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True,
                          'properties': [{'name': 'radio', 'type': 'int', 'value': r}]})
    capa = lambda nm, objetos: {'id': oid(), 'name': nm, 'type': 'objectgroup', 'draworder': 'topdown',
                                'objects': objetos, 'opacity': 1, 'visible': True, 'x': 0, 'y': 0}
    return {
        'compressionlevel': -1, 'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.11.0', 'type': 'map', 'version': '1.10',
        'width': Wm, 'height': Hm, 'tilewidth': RE, 'tileheight': RE,
        'nextlayerid': 10, 'nextobjectid': sig[0],
        'properties': [{'name': 'titulo', 'type': 'string', 'value': cfg['titulo']},
                       {'name': 'version', 'type': 'string', 'value': VERSION},
                       {'name': 'escala', 'type': 'int', 'value': ESC}],
        'layers': [
            {'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'width': Wm, 'height': Hm, 'data': data,
             'opacity': 1, 'visible': True, 'x': 0, 'y': 0},
            capa('muebles', objs), capa('colisiones', col), capa('salida', salida),
            capa('aparicion', apar), capa('luces', luces)
        ],
        'tilesets': [
            {'firstgid': 1, 'name': 'interiores', 'image': '../../Game/MAPAS/Interiores/interiores_%d.png' % TE,
             'imagewidth': hoja_wh[0], 'imageheight': hoja_wh[1], 'tilewidth': TE, 'tileheight': TE,
             'tilecount': ntiles, 'columns': ncols, 'margin': 0, 'spacing': 0},
            {'firstgid': first_m, 'name': 'muebles_interior', 'columns': 0, 'margin': 0, 'spacing': 0,
             'tilecount': len(catalogo), 'tilewidth': max(v[0] for v in catalogo.values()),
             'tileheight': max(v[1] for v in catalogo.values()), 'grid': {'orientation': 'orthogonal', 'width': 1, 'height': 1},
             'tiles': tiles_m}
        ]
    }


def tmx_de(j):
    """El mismo mapa en el formato de Tiled (.tmx), para abrirlo y editarlo."""
    from xml.sax.saxutils import quoteattr as q
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<map version="1.10" tiledversion="1.11.0" orientation="orthogonal" renderorder="right-down" '
         'width="%d" height="%d" tilewidth="%d" tileheight="%d" infinite="0" nextlayerid="%d" nextobjectid="%d">'
         % (j['width'], j['height'], j['tilewidth'], j['tileheight'], j['nextlayerid'], j['nextobjectid'])]
    L.append(' <properties>')
    for p in j['properties']: L.append('  <property name=%s value=%s/>' % (q(p['name']), q(str(p['value']))))
    L.append(' </properties>')
    ts, tm = j['tilesets']
    L.append(' <tileset firstgid="1" name=%s tilewidth="%d" tileheight="%d" tilecount="%d" columns="%d">' % (q(ts['name']), ts['tilewidth'], ts['tileheight'], ts['tilecount'], ts['columns']))
    L.append('  <image source=%s width="%d" height="%d"/>' % (q(ts['image']), ts['imagewidth'], ts['imageheight']))
    L.append(' </tileset>')
    L.append(' <tileset firstgid="%d" name="muebles_interior" tilewidth="%d" tileheight="%d" tilecount="%d" columns="0">'
             % (tm['firstgid'], tm['tilewidth'], tm['tileheight'], tm['tilecount']))
    L.append('  <grid orientation="orthogonal" width="1" height="1"/>')
    for t in tm['tiles']:
        L.append('  <tile id="%d"><image source=%s width="%d" height="%d"/></tile>' % (t['id'], q(t['image']), t['imagewidth'], t['imageheight']))
    L.append(' </tileset>')
    for capa in j['layers']:
        if capa['type'] == 'tilelayer':
            L.append(' <layer id="%d" name="%s" width="%d" height="%d">' % (capa['id'], capa['name'], capa['width'], capa['height']))
            L.append('  <data encoding="csv">')
            w = capa['width']
            filas = [','.join(str(v) for v in capa['data'][i:i + w]) for i in range(0, len(capa['data']), w)]
            L.append(',\n'.join(filas))
            L.append('</data>')
            L.append(' </layer>')
        else:
            L.append(' <objectgroup id="%d" name="%s">' % (capa['id'], capa['name']))
            for o in capa['objects']:
                at = 'id="%d" name=%s x="%g" y="%g"' % (o['id'], q(o['name']), o['x'], o['y'])
                if o.get('gid'): at += ' gid="%d"' % o['gid']
                if o.get('width'): at += ' width="%g" height="%g"' % (o['width'], o['height'])
                cuerpo = []
                if o.get('point'): cuerpo.append('<point/>')
                if o.get('properties'):
                    cuerpo.append('<properties>' + ''.join('<property name=%s type="%s" value=%s/>' % (q(p['name']), p['type'], q(str(p['value']).lower() if p['type'] == 'bool' else str(p['value']))) for p in o['properties']) + '</properties>')
                L.append('  <object %s>%s</object>' % (at, ''.join(cuerpo)) if cuerpo else '  <object %s/>' % at)
            L.append(' </objectgroup>')
    L.append('</map>')
    return '\n'.join(L) + '\n'


def main(ver=False):
    random.seed(20261005)
    os.makedirs(DIR_INT, exist_ok=True)
    os.makedirs(DIR_MAPAS, exist_ok=True)
    muebles = construir_muebles()
    catalogo = {n: muebles[n].size for n in sorted(muebles)}
    salas_img, suelos = {}, {}
    for nombre, cfg in SALAS.items():
        salas_img[nombre], suelos[nombre] = pintar_sala(cfg)
    hoja, ncols, ntiles, rejillas = trocear_en_tiles(salas_img)
    hoja_img = Image.fromarray(hoja, 'RGBA')
    hoja_img = hoja_img.resize((hoja_img.width * ESC, hoja_img.height * ESC), Image.NEAREST)
    hoja_img.save(os.path.join(DIR_INT, 'interiores_%d.png' % TE), optimize=True)
    print('tileset: %d tiles distintas de %d px (%dx%d)' % (ntiles, TE, hoja_img.width, hoja_img.height))
    for nombre, cfg in SALAS.items():
        ms = []
        for (n, x, y, props) in cfg['muebles']:
            w, hh = muebles[n].size                     # ya a su tamaño
            k = escala_de(n)
            p2 = dict(props)
            # pie, fx y fy vienen en píxeles del DIBUJO: al tamaño del mueble.
            for clave in ('pie', 'fx', 'fy'):
                if clave in p2: p2[clave] = int(round(p2[clave] * k))
            # Y el tamaño de su efecto (llamas, burbujas): el del mueble.
            if p2.get('anim'): p2['k'] = float(k)
            ms.append((n, x, y, p2, w, hh))
        j = json_mapa(nombre, cfg, rejillas[nombre], ncols, ntiles, (hoja_img.width, hoja_img.height), ms, catalogo)
        with open(os.path.join(DIR_MAPAS, nombre + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(j, fh, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(DIR_MAPAS, nombre + '.tmx'), 'w', encoding='utf-8') as fh:
            fh.write(tmx_de(j))
        # El suelo que pinta el juego: la sala con su luz (sin muebles).
        con_luz = luz_y_sombra(salas_img[nombre], cfg, suelos[nombre])
        grande = Image.fromarray(con_luz, 'RGB')
        grande = grande.resize((grande.width * ESC, grande.height * ESC), Image.NEAREST)
        ruta = os.path.join(TMP, 'interior_%s.png' % nombre)
        grande.save(ruta)
        if ver:
            vista = grande.convert('RGBA')
            for (n, x, y, props, w, hh) in sorted(ms, key=lambda m: (0 if m[3].get('plano') else 1, m[2])):
                vista.alpha_composite(muebles[n], (int(x), int(y - hh)))
            vista.save(os.path.join(TMP, 'vista_%s.png' % nombre))
        print('%-9s %2dx%2d tiles de %d px -> Maps/interiores/%s.json (+ .tmx), %d muebles, suelo %dx%d en %s' % (
            nombre, cfg['w'], cfg['h'], TE, nombre, len(ms), grande.width, grande.height, ruta))


if __name__ == '__main__':
    main('--ver' in sys.argv)
