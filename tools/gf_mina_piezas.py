#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF MINA PIEZAS — las piezas grandes de la mina, con volumen     (2026-10-04)
=============================================================================

Las piezas de `generar-mina.py` (pedruscos, racimos de cristal, estalagmitas,
vagoneta, arco de apuntalar, antorcha y montones de mineral) estaban dibujadas
con tres tonos planos y lobulos circulares: de lejos pasaban, de cerca se
veian como recortes de cartulina. Aqui se dibujan con LUZ:

  · cada forma es un CAMPO DE ALTURAS (cuanto sale hacia la camara cada
    pixel), y de el sale la normal de cada pixel;
  · la luz es la del juego: ARRIBA A LA IZQUIERDA y algo de frente (la misma
    que da por hecha gf-sombras.js, que proyecta las sombras hacia abajo y a la
    derecha);
  · el resultado se CUANTIZA a la rampa del material con tramado ordenado solo
    en la franja de cambio de tono, que es lo que hace que se lea como pixel
    art y no como un render reducido;
  · contorno SELECTIVO: oscuro por abajo y por la derecha (el lado en sombra),
    y apenas un tono mas oscuro por arriba y por la izquierda.

NINGUNA PIEZA LLEVA SOMBRA PINTADA NI HALO SEMITRANSPARENTE. La sombra se la
pone gf-sombras.js en el juego horneandola desde el alfa de la textura: un
halo de alfa parcial alrededor de un cristal saldria proyectado como una mancha
rara. El brillo de los cristales y las antorchas lo pone la escena con luces
en modo ADD (ver MinaScene._montarLuces).

Determinista: todo el azar sale de `h01` (hash de coordenadas y semilla).
"""

import math

from gf_arte import Lienzo, hex_rgb, mezcla
import gf_mina_pro as P

T = 32


def rampa(*hexes):
    return [hex_rgb(h) for h in hexes]


def _unit(x, y, z):
    l = math.sqrt(x * x + y * y + z * z) or 1.0
    return x / l, y / l, z / l


# La luz: arriba a la izquierda y de frente. x crece a la derecha, y hacia
# abajo, z hacia la camara.
LUZ = _unit(-0.55, -0.68, 0.50)
# El vector a medio camino entre la luz y la camara, para el brillo.
MEDIO = _unit(LUZ[0], LUZ[1], LUZ[2] + 1.0)

# ── RAMPAS (de oscuro a claro) ────────────────────────────────────────────
PENA = rampa('#171413', '#221e1c', '#2e2926', '#3b3531', '#49423c',
             '#58504a', '#685f57', '#7a7067', '#8d8379', '#a2978c', '#b8ada1')
CALIZA = rampa('#221d19', '#2e2822', '#3b332c', '#4a4138', '#5a4f44', '#6b5f52',
               '#7e7163', '#928474', '#a79887', '#bdae9c', '#d4c6b4')
MADERA = rampa('#1e120a', '#2c1a0f', '#3d2416', '#4f2f1d', '#623b24', '#754830',
               '#89573a', '#9d6746', '#b07955', '#c28d68', '#d3a37e')
HIERRO = rampa('#121417', '#1c1f23', '#282c31', '#363b41', '#464c53', '#585f67',
               '#6c747c', '#838b93', '#9ba3ab', '#b6bdc4', '#d6dce1')
TELA = rampa('#3a2a1c', '#55402c', '#71583e', '#8c7254', '#a68c6c', '#bea688')
LLAMA = rampa('#5c1206', '#9a2208', '#d0400c', '#f06a12', '#fb9a22', '#ffc443',
              '#ffe58c', '#fff8d8')

CRISTALES = {
    'azul': rampa('#0b1e33', '#12355a', '#1b5185', '#2672ad', '#3a95cf', '#63b8e6',
                  '#98d6f3', '#d2f0fb', '#ffffff'),
    'morado': rampa('#1d0b33', '#33125a', '#4d1d85', '#6b2bad', '#8b45cf', '#ab6be6',
                    '#c99af3', '#e6cffb', '#ffffff'),
    'verde': rampa('#08261a', '#0f4129', '#17603b', '#20834f', '#2ea866', '#4ec985',
                   '#83e2ab', '#c3f5d6', '#ffffff'),
}

MINERAL = {
    'piedra': rampa('#2b2825', '#45403b', '#5f5a54', '#8d857b', '#b8b0a6', '#e0dad2'),
    'cobre':  rampa('#2e1206', '#4a1f0c', '#8a4420', '#c1682f', '#e09a5a', '#f6c89a'),
    'hierro': rampa('#1b1e22', '#2e3238', '#646c76', '#9aa2ac', '#cdd2d8', '#f2f5f8'),
    'carbon': rampa('#060607', '#0c0c0e', '#1e1e22', '#3a3a3f', '#5a5a60', '#8a8a94'),
    'oro':    rampa('#2a1c04', '#4a3208', '#9c7520', '#e0b13a', '#f6dc7a', '#fff6c8'),
}


# ===========================================================================
# EL CAMPO DE ALTURAS Y LA LUZ
# ===========================================================================

class Campo(object):
    """Alturas por pixel. None = vacio (fuera de la pieza)."""

    __slots__ = ('w', 'h', 'alt', 'mat')

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.alt = [None] * (w * h)
        self.mat = [None] * (w * h)       # etiqueta libre por pixel

    def dentro(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def get(self, x, y):
        if not self.dentro(x, y):
            return None
        return self.alt[y * self.w + x]

    def subir(self, x, y, v, mat=None):
        """Pone la altura si es MAYOR que la que habia (union de volumenes)."""
        if not self.dentro(x, y) or v is None:
            return False
        i = y * self.w + x
        if self.alt[i] is None or v > self.alt[i]:
            self.alt[i] = v
            if mat is not None:
                self.mat[i] = mat
            return True
        return False

    def poner(self, x, y, v, mat=None):
        if not self.dentro(x, y):
            return
        i = y * self.w + x
        self.alt[i] = v
        if mat is not None:
            self.mat[i] = mat

    def normal(self, x, y, escala=1.0):
        h = self.get(x, y)
        if h is None:
            return 0.0, 0.0, 1.0

        def alt(xx, yy):
            v = self.get(xx, yy)
            return -1.5 if v is None else v        # el borde cae hacia el suelo

        dx = (alt(x + 1, y) - alt(x - 1, y)) * 0.5 * escala
        dy = (alt(x, y + 1) - alt(x, y - 1)) * 0.5 * escala
        return _unit(-dx, -dy, 1.0)


def luz_de(n, amb=0.28, dif=0.80):
    lam = max(0.0, n[0] * LUZ[0] + n[1] * LUZ[1] + n[2] * LUZ[2])
    return amb + dif * lam


def brillo_de(n, potencia=24):
    e = max(0.0, n[0] * MEDIO[0] + n[1] * MEDIO[1] + n[2] * MEDIO[2])
    return e ** potencia


def contorno(li, campo, oscuro, medio_f=0.62):
    """
    Contorno SELECTIVO: los pixeles de la pieza que tocan el vacio por abajo
    o por la derecha se pintan con `oscuro`; los que lo tocan solo por arriba
    o por la izquierda se oscurecen un poco (`medio_f`). Asi el canto con luz
    no lleva una raya negra, que es lo que delata un recorte.
    """
    marcas = []
    for y in range(campo.h):
        for x in range(campo.w):
            if campo.get(x, y) is None:
                continue
            ab = campo.get(x, y + 1) is None
            de = campo.get(x + 1, y) is None
            ar = campo.get(x, y - 1) is None
            iz = campo.get(x - 1, y) is None
            if ab or de:
                marcas.append((x, y, True))
            elif ar or iz:
                marcas.append((x, y, False))
    for x, y, fuerte in marcas:
        if fuerte:
            li.set(x, y, oscuro)
        else:
            li.set(x, y, P.oscurecer(li.get(x, y), medio_f))


def pintar_campo(li, campo, rampa_, lo=1, hi=None, amb=0.26, dif=0.82, esp=0.0,
                 potencia=24, ruido=None, escala=1.0, filtro=None):
    """Pinta todos los pixeles del campo con la luz cuantizada a la rampa."""
    hi = (len(rampa_) - 1) if hi is None else hi
    for y in range(campo.h):
        for x in range(campo.w):
            if campo.get(x, y) is None:
                continue
            if filtro is not None and not filtro(x, y):
                continue
            n = campo.normal(x, y, escala)
            v = luz_de(n, amb, dif)
            if esp:
                v += esp * brillo_de(n, potencia)
            if ruido is not None:
                v += ruido(x, y)
            li.set(x, y, P.tono(rampa_, max(0.0, min(0.999, v)), x, y, lo, hi))


# ===========================================================================
# PEDRUSCOS
# ===========================================================================

def pena(ancho, alto, s, vetas=None, musgo=None):
    """
    Un pedrusco de `ancho` x `alto` casillas: varios lobulos elipsoidales
    unidos (la altura es el MAXIMO de los lobulos), con aspereza, grietas que
    siguen las juntas entre lobulos y, a veces, vetas de mineral o musgo.
    """
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    campo = Campo(W, H)
    base_y = H - 3
    cx, cy = W * 0.5, H * 0.60
    n = 5 + int(P.h01(1, 1, s) * 3)
    lobulos = []
    for i in range(n):
        ang = P.h01(i, 2, s) * 6.283
        dist = P.h01(i, 3, s) * 0.34
        rx = W * (0.20 + P.h01(i, 4, s) * 0.13)
        ry = rx * (0.78 + P.h01(i, 5, s) * 0.18)
        lx = cx + math.cos(ang) * W * dist
        ly = cy + math.sin(ang) * H * dist * 0.7
        # Que ningun lobulo se salga del lienzo ni baje del suelo.
        lx = min(max(lx, rx + 2), W - rx - 3)
        ly = min(max(ly, ry + 2), base_y - ry * 0.55)
        lobulos.append((lx, ly, rx, ry, rx * (0.9 + P.h01(i, 6, s) * 0.3)))
    segunda = {}
    for y in range(H):
        for x in range(W):
            if y > base_y:
                continue
            mejor = None
            seg = None
            for (lx, ly, rx, ry, rz) in lobulos:
                dx, dy = (x + 0.5 - lx) / rx, (y + 0.5 - ly) / ry
                d = dx * dx + dy * dy
                if d >= 1.0:
                    continue
                hz = rz * math.sqrt(1.0 - d)
                if mejor is None or hz > mejor:
                    seg = mejor
                    mejor = hz
                elif seg is None or hz > seg:
                    seg = hz
            if mejor is None:
                continue
            aspero = (P.fbm(x, y, 64, s + 11, ((8, 0.6), (4, 0.4))) - 0.5) * 2.4
            campo.poner(x, y, mejor + aspero)
            if seg is not None:
                segunda[(x, y)] = mejor - seg
    # FACETAS. Con la normal suave, pixel a pixel, la roca sale como una
    # hogaza de pan: redonda y blanda. Una piedra partida tiene CARAS planas.
    # Cada pixel toma la normal de la semilla de su celda de Voronoi (mezclada
    # con la suya), asi que la superficie se rompe en planos.
    normales = {}
    for y in range(H):
        for x in range(W):
            if campo.get(x, y) is None:
                continue
            d1, d2, ide, vx, vy = P.voronoi(x, y, 14, 70, s + 17)
            n0 = campo.normal(x, y)
            if ide not in normales:
                normales[ide] = n0
            nc = normales[ide]
            n = _unit(nc[0] * 0.62 + n0[0] * 0.38, nc[1] * 0.62 + n0[1] * 0.38,
                      nc[2] * 0.62 + n0[2] * 0.38)
            v = luz_de(n, 0.20, 0.80) + (P.h01(x, y, s + 5) - 0.5) * 0.05
            li.set(x, y, P.tono(PENA, max(0.0, min(0.999, v)), x, y, 1, 9))
    # Juntas entre lobulos: donde dos lobulos GRANDES casi empatan hay una
    # hendidura de un pixel (no una mancha: solo la linea del empate).
    for (x, y), dif in segunda.items():
        if dif < 0.35 and campo.get(x, y) is not None and campo.get(x, y) > 6:
            li.set(x, y, P.oscurecer(li.get(x, y), 0.72))
    # Una grieta o dos.
    for i in range(1 + int(P.h01(9, 9, s) * 2)):
        x, y = W * (0.3 + P.h01(i, 21, s) * 0.4), H * (0.35 + P.h01(i, 22, s) * 0.3)
        ang = 1.2 + (P.h01(i, 23, s) - 0.5) * 1.4
        for k in range(int(6 + P.h01(i, 24, s) * 10)):
            ang += (P.h01(k, i, s + 3) - 0.5) * 0.8
            x += math.cos(ang)
            y += math.sin(ang)
            if campo.get(int(x), int(y)) is not None and campo.get(int(x) + 1, int(y) + 1) is not None:
                li.set(int(x), int(y), PENA[1])
                li.set(int(x) + 1, int(y) + 1, PENA[6])
    # Musgo en lo que mira hacia arriba.
    if musgo:
        for y in range(H):
            for x in range(W):
                if campo.get(x, y) is None:
                    continue
                n = campo.normal(x, y)
                m = P.fbm(x, y, 64, s + 31, ((16, 0.6), (8, 0.4)))
                if n[1] < -0.35 and m > 0.55:
                    k = 1 + int(min(3, (m - 0.55) * 14))
                    if P.tramar(min(1.0, (m - 0.55) * 6), x, y):
                        li.set(x, y, P.MUSGO[min(3, k)])
    # Vetas de mineral: pepitas con su brillo.
    if vetas:
        rm = MINERAL[vetas]
        for i in range(7):
            vx = W * (0.25 + P.h01(i, 41, s) * 0.5)
            vy = H * (0.3 + P.h01(i, 42, s) * 0.45)
            r = 1.6 + P.h01(i, 43, s) * 1.6
            pepita(li, campo, vx, vy, r, r * 0.8, rm)
    contorno(li, campo, PENA[0])
    return li


def pepita(li, campo, cx, cy, rx, ry, rm):
    """Una pepita de mineral incrustada: cuerpo, luz, sombra y destello."""
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if campo is not None and campo.get(x, y) is None:
                continue
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d > 1.0:
                continue
            nz = math.sqrt(max(0.0, 1.0 - d))
            v = luz_de(_unit(dx, dy, nz + 0.4), 0.2, 0.9)
            li.set(x, y, P.tono(rm, min(0.999, v), x, y, 1, len(rm) - 1))
    li.set(int(cx - rx * 0.3), int(cy - ry * 0.4), rm[-1])


# ===========================================================================
# CRISTALES
# ===========================================================================

def racimo(color, s, ancho=2, alto=3):
    """
    Un racimo de cristales: prismas de seis caras vistos de frente, con tres
    facetas (la de la izquierda con luz, la del centro y la de la derecha en
    sombra), la punta partida en dos caras, una arista clara y destellos.
    Salen de un pedrusco pequeno, que es de donde crecen.
    """
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    rc = CRISTALES[color]
    base_y = H - 6

    # La roca madre, abajo.
    roca = pena(ancho, 1, s + 900)
    for y in range(roca.h):
        for x in range(roca.w):
            c = roca.get(x, y)
            if c[3] and y >= 10:
                li.set(x, H - roca.h + y, c)

    prismas = []
    n = 5 + int(P.h01(0, 1, s) * 2)
    for i in range(n):
        bx = W * (0.22 + (i + P.h01(i, 2, s) * 0.8) / float(n) * 0.56)
        largo = H * (0.36 + P.h01(i, 3, s) * 0.50)
        grueso = 7.0 + P.h01(i, 4, s) * 5.0
        inclina = (P.h01(i, 5, s) - 0.5) * 0.5 + (bx - W * 0.5) / W * 0.9
        prismas.append((largo, bx, grueso, inclina))
    # Los largos detras: se dibujan primero.
    prismas.sort(key=lambda p: -p[0])
    for (largo, bx, grueso, inclina) in prismas:
        by = base_y - P.h01(int(bx), 7, s) * 6
        ax, ay = math.sin(inclina), -math.cos(inclina)       # eje hacia la punta
        px, py = -ay, ax                                       # perpendicular
        punta = grueso * 1.05
        r = grueso * 0.5
        x0 = int(min(bx, bx + ax * largo) - grueso - 2)
        x1 = int(max(bx, bx + ax * largo) + grueso + 2)
        y0 = int(by + ay * largo - 2)
        y1 = int(by + 2)
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in range(max(0, x0), min(W, x1 + 1)):
                rx, ry = x + 0.5 - bx, y + 0.5 - by
                v = rx * ax + ry * ay              # a lo largo
                u = rx * px + ry * py              # a lo ancho
                if v < 0 or v > largo:
                    continue
                if v > largo - punta:
                    lim = r * (largo - v) / punta
                else:
                    lim = r
                if abs(u) > lim:
                    continue
                # La faceta.
                rel = u / max(0.5, r)
                en_punta = v > largo - punta
                if en_punta:
                    k = 6 if rel < 0 else 3
                elif rel < -0.36:
                    k = 6
                elif rel > 0.36:
                    k = 2
                else:
                    k = 4
                # Mas oscuro al pie: el cristal sale de la roca.
                pie = 1.0 - min(1.0, v / (largo * 0.35))
                k = max(1, k - int(round(pie * 2)))
                # Vetas internas: lineas en diagonal que cruzan el cristal.
                veta = math.sin((v * 0.9 + u * 2.3) + bx)
                if veta > 0.94 and k >= 3:
                    k += 1
                c = rc[min(8, k)]
                if abs(abs(u) - lim) < 0.9:
                    c = rc[1] if u > 0 else rc[5]                 # borde
                if -0.5 < u + r * 0.36 < 0.6 and not en_punta:
                    c = rc[7]                                     # la arista
                li.set(x, y, c)
        # Destello en la punta.
        tx, ty = bx + ax * (largo - punta * 0.8), by + ay * (largo - punta * 0.8)
        li.set(int(tx - px * r * 0.3), int(ty - py * r * 0.3), rc[8])
        li.set(int(tx - px * r * 0.3), int(ty - py * r * 0.3) + 1, rc[7])
    # Un par de cristales pequenitos sueltos, delante.
    for i in range(3):
        cx = W * (0.15 + P.h01(i, 31, s) * 0.7)
        cy = H - 4 - P.h01(i, 32, s) * 3
        for k in range(5):
            for dx in range(-1, 2):
                if abs(dx) <= (4 - k) // 2:
                    li.set(int(cx + dx), int(cy - k), rc[6] if dx < 0 else rc[3] if dx > 0 else rc[5])
        li.set(int(cx), int(cy - 5), rc[8])
    return li


# ===========================================================================
# ESTALAGMITAS
# ===========================================================================

def estalagmita(s, ancho=2, alto=3):
    """
    Conos de caliza redondeados, con la luz arriba a la izquierda, anillos de
    crecimiento, brillo de humedad y la gota en la punta.
    """
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    campo = Campo(W, H)
    base_y = H - 2
    conos = []
    for j in range(3):
        px = W * (0.28 + 0.22 * j) + (P.h01(j, 1, s) - 0.5) * 8
        altura = H * (0.42 + P.h01(j, 2, s) * 0.5)
        r0 = 7.5 + P.h01(j, 3, s) * 4.5
        conos.append((altura, px, r0, j))
    conos.sort(key=lambda c: -c[0])
    for (altura, px, r0, j) in conos:
        cima = base_y - altura
        for y in range(max(0, int(cima)), base_y + 1):
            f = min(1.0, max(0.0, (base_y - y) / float(altura)))   # 0 abajo, 1 punta
            r = r0 * (1.0 - f) ** 0.9 + 0.6
            for x in range(int(px - r - 1), int(px + r + 2)):
                u = (x + 0.5 - px)
                if abs(u) > r:
                    continue
                hz = math.sqrt(max(0.0, r * r - u * u)) + (1.0 - f) * 3.0
                campo.subir(x, y, hz, j)
    pintar_campo(li, campo, CALIZA, lo=1, hi=9, amb=0.20, dif=0.80, esp=0.30, potencia=18)
    # Anillos de crecimiento, suaves, y los regueros por donde baja el agua.
    for y in range(H):
        for x in range(W):
            if campo.get(x, y) is None:
                continue
            if (y + int(x * 0.2)) % 9 == 0 and P.tramar(0.6, x, y):
                li.set(x, y, P.oscurecer(li.get(x, y), 0.9))
            reguero = P.ruido_valor(x * 3, y * 0.25, 8, 64, s + 3)
            if reguero > 0.8:
                li.set(x, y, P.oscurecer(li.get(x, y), 0.86))
    contorno(li, campo, CALIZA[0])
    # La gota en cada punta.
    for (altura, px, r0, j) in conos:
        cima = int(base_y - altura)
        li.set(int(px), cima + 1, (210, 230, 240, 255))
    return li


# ===========================================================================
# VAGONETA
# ===========================================================================

def vagoneta(s, mineral='carbon'):
    """
    Una vagoneta vista de frente desde arriba: caja de tablones con flejes de
    hierro y remaches, el monton de mineral asomando y dos ruedas de radios.
    2x2 casillas.
    """
    W, H = 2 * T, 2 * T
    li = Lienzo(W, H)
    top, bot = 20, 46
    # ── Las ruedas (detras de la caja) ───────────────────────────────────
    for wx in (17, 46):
        cy = 52
        for y in range(cy - 9, cy + 10):
            for x in range(wx - 9, wx + 10):
                dx, dy = x + 0.5 - wx, y + 0.5 - cy
                d = math.hypot(dx, dy)
                if d > 8.6:
                    continue
                if d > 6.4:
                    k = 2 if (dx + dy) > 0 else 5        # la llanta
                    if d > 7.8:
                        k = 1
                elif d < 2.2:
                    k = 7 if (dx + dy) < 0 else 4        # el cubo
                else:
                    ang = math.atan2(dy, dx)
                    k = 4 if abs(math.sin(ang * 3)) < 0.22 else 1   # radios
                li.set(x, y, HIERRO[k])
    # ── La caja ──────────────────────────────────────────────────────────
    for y in range(top, bot):
        f = (y - top) / float(bot - top)
        x0 = int(round(5 + f * 4))
        x1 = int(round(W - 6 - f * 4))
        tablon = (y - top) // 9
        dy = (y - top) % 9
        base = 6 - tablon
        for x in range(x0, x1 + 1):
            if dy == 0:
                k = base + 2
            elif dy == 8:
                k = base - 3
            else:
                veta = math.sin(x * 0.35 + tablon * 2.1 + math.sin(x * 0.08) * 2)
                k = base + (1 if veta > 0.85 else -1 if veta < -0.85 else 0)
            if x == x0:
                k = base + 2
            elif x == x1:
                k = base - 3
            li.set(x, y, MADERA[max(1, min(10, k))])
    # Flejes verticales y el aro de arriba.
    for fx in (15, 48):
        for y in range(top - 1, bot + 1):
            f = (y - top) / float(bot - top)
            off = int(round(f * 2)) * (1 if fx < W / 2 else -1)
            for k, dx in enumerate((-1, 0, 1)):
                li.set(fx + off + dx, y, HIERRO[(7, 5, 2)[k]])
    for x in range(4, W - 4):
        li.set(x, top - 2, HIERRO[8])
        li.set(x, top - 1, HIERRO[5])
        li.set(x, top, HIERRO[3])
    for x in range(8, W - 8):
        li.set(x, bot, HIERRO[2])
        li.set(x, bot + 1, HIERRO[1])
    # Remaches.
    for fx in (15, 48):
        for ry in (top + 4, top + 13, top + 22):
            f = (ry - top) / float(bot - top)
            off = int(round(f * 2)) * (1 if fx < W / 2 else -1)
            li.set(fx + off, ry, HIERRO[10])
            li.set(fx + off + 1, ry + 1, HIERRO[1])
    # ── El monton de mineral ─────────────────────────────────────────────
    rm = MINERAL[mineral]
    piedras = []
    for i in range(26):
        gx = 9 + P.h01(i, 1, s) * (W - 18)
        alto_m = 9.0 * math.sqrt(max(0.0, 1.0 - ((gx - W / 2) / (W / 2 - 8)) ** 2))
        gy = top - 1 - P.h01(i, 2, s) * alto_m
        piedras.append((gy, gx))
    piedras.sort()
    for (gy, gx) in piedras:
        r = 2.4 + P.h01(int(gx * 7), int(gy * 3), s) * 1.6
        pepita(li, None, gx, gy, r, r * 0.8, rm)
    # Alguna pepita de otro mineral, que brilla.
    for i in range(3):
        gx = 14 + P.h01(i, 9, s) * (W - 28)
        pepita(li, None, gx, top - 3 - P.h01(i, 8, s) * 4, 1.8, 1.5, MINERAL['oro'])
    return li


# ===========================================================================
# EL ARCO DE APUNTALAR
# ===========================================================================

def _viga(li, x0, y0, x1, y1, horizontal, s):
    """Un madero con biselado, veta y testa."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if horizontal:
                rel = (y - y0) / float(max(1, y1 - y0))
                a, b = x, y
            else:
                rel = (x - x0) / float(max(1, x1 - x0))
                a, b = y, x
            if rel < 0.12:
                k = 9
            elif rel < 0.25:
                k = 7
            elif rel > 0.88:
                k = 2
            elif rel > 0.76:
                k = 4
            else:
                k = 6
            veta = math.sin(a * 0.21 + b * 1.7 + math.sin(a * 0.05 + s) * 2.4)
            if veta > 0.9 and 0.2 < rel < 0.8:
                k -= 2
            elif veta < -0.93 and 0.2 < rel < 0.8:
                k += 1
            li.set(x, y, MADERA[max(1, min(10, k))])
    # Contorno.
    for x in range(x0, x1 + 1):
        li.set(x, y1, MADERA[1])
    for y in range(y0, y1 + 1):
        li.set(x1, y, MADERA[1])


def puntal(s):
    """El arco de madera de 3x2 casillas: dintel, dos postes, tornapuntas y herrajes."""
    W, H = 3 * T, 2 * T
    li = Lienzo(W, H)
    # Postes.
    for px in (9, W - 22):
        _viga(li, px, 15, px + 12, H - 2, False, s + px)
    # Tornapuntas en diagonal.
    for k in range(13):
        for g in range(4):
            x = 21 + k
            y = 17 + k + g
            li.set(x, y, MADERA[(7, 6, 5, 2)[g]])
            x2 = W - 23 - k
            li.set(x2, y, MADERA[(7, 6, 5, 2)[g]])
    # Dintel.
    _viga(li, 2, 3, W - 3, 16, True, s + 7)
    # Testas del dintel (los anillos del tronco).
    for ex in (2, W - 3):
        for y in range(4, 16):
            li.set(ex, y, MADERA[8] if (y % 3) else MADERA[5])
    # Herrajes: pletina con dos pernos donde poste y dintel se juntan.
    for px in (9, W - 22):
        for y in range(12, 21):
            for x in range(px - 1, px + 14):
                k = 6 if y == 12 else 2 if y == 20 else 4
                li.set(x, y, HIERRO[k])
        for bx in (px + 2, px + 10):
            li.set(bx, 15, HIERRO[10])
            li.set(bx + 1, 16, HIERRO[1])
            li.set(bx, 16, HIERRO[7])
    return li


# ===========================================================================
# ANTORCHA
# ===========================================================================

def antorcha(s):
    """Antorcha de pared, 1x2 casillas: soporte de hierro, mango, trapo y llama."""
    W, H = T, 2 * T
    li = Lienzo(W, H)
    # La pletina clavada al muro.
    for y in range(H - 24, H - 8):
        for x in range(11, 21):
            k = 7 if x == 11 or y == H - 24 else 2 if x == 20 or y == H - 9 else 4
            li.set(x, y, HIERRO[k])
    for py in (H - 21, H - 12):
        li.set(15, py, HIERRO[10])
        li.set(16, py + 1, HIERRO[1])
    # El aro que abraza el mango.
    for x in range(10, 22):
        li.set(x, H - 30, HIERRO[8] if x < 14 else HIERRO[5])
        li.set(x, H - 29, HIERRO[3])
    # El mango.
    for y in range(H - 40, H - 22):
        for x in range(14, 19):
            k = (9, 7, 6, 4, 2)[x - 14]
            li.set(x, y, MADERA[k])
    # El trapo empapado, atado.
    for y in range(H - 46, H - 38):
        for x in range(13, 20):
            k = 4 if x < 15 else 2 if x > 17 else 3
            if (y - (H - 46)) in (2, 5):
                k = 0
            li.set(x, y, TELA[k])
    # La llama: gota de varias capas.
    cx, base = 16.0, H - 45
    capas = ((17.0, 6.2, 1), (14.0, 4.8, 3), (10.0, 3.4, 5), (5.5, 1.8, 7))
    for (alto_l, ancho_l, k) in capas:
        for y in range(int(base - alto_l - 6), base + 1):
            f = (base - y) / alto_l
            if f < 0 or f > 1.35:
                continue
            w = ancho_l * math.sqrt(max(0.0, 1.0 - (f - 0.25) ** 2 / 1.25)) * (1.0 - f * 0.55)
            onda = math.sin(y * 0.9 + s) * 0.6 * f
            for x in range(int(cx - w - 2), int(cx + w + 3)):
                if abs(x + 0.5 - cx - onda) <= w:
                    li.set(x, y, LLAMA[k])
    # Pavesas.
    for i in range(3):
        li.set(int(cx + (P.h01(i, 1, s) - 0.5) * 8), int(base - 16 - P.h01(i, 2, s) * 6), LLAMA[6])
    return li


# ===========================================================================
# MONTONES DE MINERAL
# ===========================================================================

def monton(mineral, s):
    """Un monton de mineral picado, 2x2 casillas. Se pisa: va en la capa de tiles."""
    W, H = 2 * T, 2 * T
    li = Lienzo(W, H)
    rm = MINERAL[mineral]
    piedras = []
    for i in range(70):
        gx = W * 0.5 + (P.h01(i, 1, s) - 0.5) * W * 0.80
        lomo = 1.0 - abs((gx - W * 0.5) / (W * 0.42))
        if lomo <= 0:
            continue
        gy = H - 8 - (P.h01(i, 2, s) ** 0.8) * H * 0.40 * lomo ** 1.2
        piedras.append((gy, gx, i))
    piedras.sort()
    for (gy, gx, i) in piedras:
        r = 2.6 + P.h01(i, 3, s) * 2.2
        # La sombra de la piedra sobre la de detras.
        for y in range(int(gy - r), int(gy + r + 2)):
            for x in range(int(gx - r), int(gx + r + 2)):
                if ((x - gx - 1) / r) ** 2 + ((y - gy - 1) / (r * 0.8)) ** 2 <= 1.0:
                    c = li.get(x, y)
                    if c[3]:
                        li.set(x, y, P.oscurecer(c, 0.7))
        pepita(li, None, gx, gy, r, r * 0.8, rm)
    return li
