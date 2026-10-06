#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF MINA PRO — el arte de la mina, con relieve                    (2026-10-03)
=============================================================================

POR QUE ESTE ARCHIVO
---------------------------------------------------------------------------
"Mejora la mina graficamente: no tiene graficos altos y profesionales
detallados." Tenia razon, y el motivo estaba escrito en las primitivas de
`gf_mina_arte.py`: "plano, tres tonos por material, nunca un degradado". Con
tres tonos un suelo de roca es un gris con rayas, la lava un mosaico de celdas
y el agua un azul liso. Es el estilo del mapa de FUERA (hierba plana con
flores dibujadas), que alli funciona porque hay arboles, casas y caminos
encima; bajo tierra no hay nada encima y el suelo ES el decorado.

Aqui cada material tiene una RAMPA de 9-11 tonos y se dibuja con lo que hace
que el pixel art se lea como volumen:

  · luz de ARRIBA A LA IZQUIERDA (la del juego, la que da por hecha
    gf-sombras.js): canto claro arriba-izquierda, sombra abajo-derecha;
  · ruido de baja frecuencia + TRAMADO ORDENADO (Bayer 4x4) solo en el paso
    entre dos tonos, nunca ruido pixel a pixel (eso es nieve de television);
  · todo PERIODICO: cada textura teje consigo misma y los parches (suelo 8x8,
    grava, tablas y lava 4x4, roca 4x4) se parten en casillas que el mapa pone
    segun su posicion, asi que no se ve la reja de 32 px;
  · los detalles que cruzan el borde del parche se dibujan tres veces (a
    -periodo, 0 y +periodo) para que no queden cortados.

Determinista: todo el azar sale de un hash de la coordenada y la semilla.

Lo usa tools/generar-mina.py.
"""

import math

from gf_arte import Lienzo, Mascara, hex_rgb, mezcla

T = 32


def rampa(*hexes):
    return [hex_rgb(h) for h in hexes]


# ===========================================================================
# RAMPAS (de oscuro a claro)
# ===========================================================================

SUELO = rampa('#1d1a19', '#272322', '#322d2b', '#3d3835', '#48423e',
              '#524b47', '#5c5550', '#686059', '#756c64', '#837970')
POLVO = rampa('#4b4139', '#574a40', '#625448', '#6e5e50')        # tierra suelta
GRAVA = rampa('#221d19', '#2e2722', '#3a322b', '#473d35', '#54493f',
              '#615449', '#6f6153', '#7d6e5f', '#8c7d6d')
MADERA = rampa('#22150d', '#311f13', '#43291a', '#553521', '#664129',
               '#764c31', '#88593a', '#9b6845', '#ae7a54', '#c18d66')
MURO = rampa('#181615', '#232120', '#2e2b29', '#3b3735', '#494441',
             '#57514d', '#655e59', '#736b65', '#827972', '#928880', '#a3998f')
ROCA = rampa('#0f0e0e', '#161514', '#1e1c1b', '#272422', '#302d2a',
             '#3a3633', '#45403c', '#514b46')
LAVA = rampa('#170704', '#2a0c06', '#431209', '#651a0a', '#8e240c',
             '#b8340f', '#db5414', '#ef7b1c', '#f8a42e', '#fccf5a', '#fff0b8')
AGUA = rampa('#0a1d29', '#0f2836', '#153444', '#1b4153', '#225066',
             '#2b6079', '#38738c', '#4f8ba2', '#73a9bb', '#a6cfd9', '#e1f3f6')
MUSGO = rampa('#25301f', '#2f3d27', '#3b4c30', '#4a5e3a')
BRILLO_MINERAL = hex_rgb('#c9d6e0')

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


# ===========================================================================
# AZAR DETERMINISTA, RUIDO PERIODICO Y VORONOI
# ===========================================================================

def h01(i, j, s):
    """0..1 a partir de dos enteros y la semilla (mismo mezclador del proyecto)."""
    h = (int(i) * 374761393 + int(j) * 668265263 + int(s) * 2654435761) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _suave(t):
    return t * t * (3.0 - 2.0 * t)


def ruido_valor(x, y, escala, periodo, s):
    """Ruido de valor PERIODICO: vale lo mismo en x que en x + periodo."""
    n = max(1, int(round(periodo / float(escala))))
    fx, fy = x / float(escala), y / float(escala)
    i0, j0 = int(math.floor(fx)), int(math.floor(fy))
    tx, ty = _suave(fx - i0), _suave(fy - j0)
    a = h01(i0 % n, j0 % n, s)
    b = h01((i0 + 1) % n, j0 % n, s)
    c = h01(i0 % n, (j0 + 1) % n, s)
    d = h01((i0 + 1) % n, (j0 + 1) % n, s)
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty


def fbm(x, y, periodo, s, octavas=((64, 0.5), (32, 0.3), (16, 0.2))):
    v = 0.0
    tot = 0.0
    for k, (esc, peso) in enumerate(octavas):
        if periodo % esc and periodo > esc:
            esc = periodo / float(max(1, int(round(periodo / float(esc)))))
        v += ruido_valor(x, y, esc, periodo, s + k * 31) * peso
        tot += peso
    return v / tot


def voronoi(x, y, celda, periodo, s, aplastar=1.0):
    """
    Voronoi periodico. Devuelve (f1, f2, id, vx, vy): distancia a la semilla
    mas cercana, a la segunda, el id de la celda, y la direccion (unitaria) de
    la primera a la segunda semilla — que dice hacia que lado queda el borde
    mas cercano: eso es lo que permite sombrear cada piedra con su bisel.
    """
    n = max(1, int(round(periodo / float(celda))))
    celda = periodo / float(n)
    ci, cj = int(math.floor(x / celda)), int(math.floor(y / celda))
    mejores = []
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            i, j = ci + di, cj + dj
            hx = h01(i % n, j % n, s)
            hy = h01(i % n, j % n, s + 101)
            sx = (i + 0.1 + 0.8 * hx) * celda
            sy = (j + 0.1 + 0.8 * hy) * celda
            dx, dy = x - sx, (y - sy) * aplastar
            mejores.append((math.hypot(dx, dy), sx, sy, (i % n) * 7919 + (j % n)))
    mejores.sort(key=lambda m: m[0])
    (d1, s1x, s1y, ide), (d2, s2x, s2y, _) = mejores[0], mejores[1]
    vx, vy = s2x - s1x, s2y - s1y
    largo = math.hypot(vx, vy) or 1.0
    return d1, d2, ide, vx / largo, vy / largo


def tramar(v, x, y):
    """Cuantiza 0..1 a dos tonos con el tramado ordenado: True = el claro."""
    return v > (BAYER[y & 3][x & 3] + 0.5) / 16.0


def tono(r, v, x, y, lo, hi):
    """
    Un tono de la rampa `r` entre los indices `lo` y `hi` para el valor v
    (0..1), con tramado SOLO entre dos tonos vecinos.
    """
    pos = lo + max(0.0, min(0.999, v)) * (hi - lo)
    k = int(math.floor(pos))
    frac = pos - k
    # El tramado solo en la franja del cambio de tono: fuera de ella, tono
    # liso. Tramando todo el rango se veia una rejilla fina por todo el suelo.
    if frac > 0.72:
        k += 1
    elif frac > 0.28 and tramar((frac - 0.28) / 0.44, x, y):
        k += 1
    return r[max(0, min(len(r) - 1, min(k, hi)))]


def oscurecer(c, f):
    return (max(0, min(255, int(c[0] * f))), max(0, min(255, int(c[1] * f))),
            max(0, min(255, int(c[2] * f))), c[3] if len(c) > 3 else 255)


def _tres_veces(periodo, fn):
    for dy in (-periodo, 0, periodo):
        for dx in (-periodo, 0, periodo):
            fn(dx, dy)


def _set_envuelto(li, x, y, c):
    li.set(int(x) % li.w, int(y) % li.h, c)


# ===========================================================================
# PIEZAS DE DETALLE
# ===========================================================================

def _guijarro(li, cx, cy, rx, ry, r, base, envolver=True, sombra=True):
    """
    Un guijarro con volumen sobre el suelo: cuerpo, luz arriba-izquierda,
    sombra abajo-derecha y su sombra propia en el suelo.
    """
    pon = _set_envuelto if envolver else (lambda l, x, y, c: l.set(int(x), int(y), c))
    x0, x1 = int(math.floor(cx - rx - 1)), int(math.ceil(cx + rx + 2))
    y0, y1 = int(math.floor(cy - ry - 1)), int(math.ceil(cy + ry + 2))
    if sombra:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx, dy = (x - cx - 1.0) / rx, (y - cy - 1.0) / ry
                if dx * dx + dy * dy <= 1.0:
                    c = li.get(x % li.w, y % li.h) if envolver else li.get(x, y)
                    if c[3]:
                        pon(li, x, y, oscurecer(c, 0.72))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            d = dx * dx + dy * dy
            if d > 1.0:
                continue
            luz = -dx * 0.55 - dy * 0.75          # arriba-izquierda = positivo
            if d > 0.62 and luz < -0.25:
                k = base - 2
            elif d > 0.62 and luz > 0.25:
                k = base + 2
            elif luz > 0.45:
                k = base + 1
            elif luz < -0.35:
                k = base - 1
            else:
                k = base
            pon(li, x, y, r[max(0, min(len(r) - 1, k))])


def _grieta(li, x, y, largo, ang, s, oscuro, claro, envolver=True):
    """Una grieta: polilinea de 1 px que se tuerce, con un canto claro debajo."""
    pon = _set_envuelto if envolver else (lambda l, xx, yy, c: l.set(int(xx), int(yy), c))
    for k in range(int(largo)):
        ang += (h01(k, 3, s) - 0.5) * 0.9
        x += math.cos(ang)
        y += math.sin(ang)
        pon(li, x, y, oscuro)
        if h01(k, 9, s) > 0.55:
            pon(li, x + 1, y + 1, claro)
        if h01(k, 11, s) > 0.93 and k > 3:          # ramita
            _grieta(li, x, y, largo * 0.3, ang + (1.1 if h01(k, 5, s) > 0.5 else -1.1),
                    s + k * 7, oscuro, claro, envolver)
            largo *= 0.9


# ===========================================================================
# SUELO DE ROCA
# ===========================================================================

def suelo_base_tile(s):
    """
    El suelo SIN detalles, que teje a 32 px. Lo usan las piezas de borde (el
    lado de fuera de una charca o de un lago) y las variantes viejas.
    """
    li = Lienzo(T, T)
    for y in range(T):
        for x in range(T):
            v = fbm(x, y, T, s, ((16, 0.6), (8, 0.4)))
            li.set(x, y, tono(SUELO, 0.35 + (v - 0.5) * 0.55, x, y, 4, 6))
    return li


def suelo_parche(lado, s):
    """
    El suelo de la mina: un parche de `lado` x `lado` casillas que teje.

    Roca pisada con manchas de tierra suelta, guijarros con su sombra, losas
    de roca incrustadas (luz por un lado, junta oscura por el otro) y grietas.
    Nada de motas sueltas al azar.
    """
    P = lado * T
    li = Lienzo(P, P)
    for y in range(P):
        for x in range(P):
            v = fbm(x, y, P, s)
            c = tono(SUELO, 0.3 + (v - 0.5) * 0.8, x, y, 4, 7)
            polvo = fbm(x + 400, y + 77, P, s + 9, ((32, 0.6), (16, 0.4)))
            if polvo > 0.64:
                c = tono(POLVO, (polvo - 0.64) * 3.0, x, y, 0, 2)
            elif polvo > 0.615 and tramar((polvo - 0.615) / 0.025, x, y):
                c = POLVO[0]
            li.set(x, y, c)

    # Losas de roca incrustadas, a ras de suelo.
    n_losas = int(P * P / 2900)
    for i in range(n_losas):
        cx, cy = h01(i, 1, s) * P, h01(i, 2, s) * P
        rx = 6 + h01(i, 3, s) * 9
        ry = rx * (0.55 + h01(i, 4, s) * 0.3)
        base = 5 + int(h01(i, 5, s) * 2)

        def losa(dx, dy, cx=cx, cy=cy, rx=rx, ry=ry, base=base, i=i):
            x0, x1 = int(cx + dx - rx - 2), int(cx + dx + rx + 2)
            y0, y1 = int(cy + dy - ry - 2), int(cy + dy + ry + 2)
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if not (0 <= x < P and 0 <= y < P):
                        continue
                    ex = (x - cx - dx) / rx
                    ey = (y - cy - dy) / ry
                    ang = math.atan2(ey, ex)
                    borde = 1.0 + 0.16 * math.sin(ang * 3 + i) + 0.08 * math.sin(ang * 7 + i * 2)
                    d = math.hypot(ex, ey) / borde
                    if d > 1.0:
                        continue
                    luz = -ex * 0.5 - ey * 0.8
                    if d > 0.86:
                        k = base - 3 if luz < 0.1 else base + 1    # junta / canto
                    elif d > 0.74 and luz > 0.35:
                        k = base + 1
                    elif d > 0.74 and luz < -0.35:
                        k = base - 1
                    else:
                        k = base if tramar(0.5 + 0.25 * math.sin(x * 0.9 + y * 0.4), x, y) else base - 1
                    li.set(x, y, SUELO[max(0, min(len(SUELO) - 1, k))])
        _tres_veces(P, losa)

    # Grietas.
    for i in range(int(P * P / 5200)):
        _grieta(li, h01(i, 21, s) * P, h01(i, 22, s) * P, 8 + h01(i, 23, s) * 22,
                h01(i, 24, s) * 6.28, s + i * 13, SUELO[2], SUELO[7])

    # Guijarros sueltos.
    for i in range(int(P * P / 900)):
        rx = 1.4 + h01(i, 31, s) * 2.2
        _guijarro(li, h01(i, 32, s) * P, h01(i, 33, s) * P, rx, rx * (0.7 + h01(i, 34, s) * 0.3),
                  SUELO, 6 + int(h01(i, 35, s) * 2))
    return [[_recortar(li, i * T, j * T) for i in range(lado)] for j in range(lado)]


def _recortar(li, x0, y0, w=T, h=T):
    t = Lienzo(w, h)
    for y in range(h):
        for x in range(w):
            t.set(x, y, li.get(x0 + x, y0 + y))
    return t


def deco_suelo(k, s):
    """
    Lo que se deja caer sobre el suelo, en una casilla TRANSPARENTE (va en la
    capa de objetos, encima del parche de suelo, que asi no se interrumpe).
    """
    t = Lienzo(T, T)
    if k == 1:            # un monton de cascote
        for i in range(6):
            rx = 1.8 + h01(i, 1, s) * 2.6
            _guijarro(t, 9 + h01(i, 2, s) * 14, 10 + h01(i, 3, s) * 12, rx, rx * 0.8,
                      SUELO, 6 + int(h01(i, 4, s) * 2), envolver=False)
    elif k == 2:          # un hueso viejo
        hueso = rampa('#5e584c', '#8f8770', '#c8c0a8', '#e8e2cc')
        for x in range(9, 23):
            y = 16 + int(math.sin(x * 0.25) * 1.2)
            t.set(x, y, hueso[2]); t.set(x, y + 1, hueso[1]); t.set(x, y + 2, hueso[0])
        for ex in (8, 23):
            for dy in (-1, 0, 1, 2):
                t.set(ex, 16 + dy, hueso[3] if dy < 1 else hueso[1])
            t.set(ex, 19, hueso[0])
    elif k == 3:          # setas de cueva que brillan un poco
        setas = rampa('#3b2f4a', '#6d4f8c', '#a77ad0', '#e3c6ff')
        for i, (sx, sy) in enumerate(((11, 20), (16, 17), (20, 21))):
            for y in range(sy, sy + 4):
                t.set(sx, y, (194, 184, 160, 255))
            for dx in range(-2, 3):
                t.set(sx + dx, sy - 1, setas[2])
            for dx in range(-1, 2):
                t.set(sx + dx, sy - 2, setas[3] if dx < 1 else setas[2])
            t.set(sx - 2, sy, setas[1]); t.set(sx + 2, sy, setas[1])
            t.set(sx + 1, sy + 4, (20, 18, 22, 140))
    else:                 # una grieta con charquito oscuro
        _grieta(t, 6, 12, 18, 0.3, s, SUELO[1], SUELO[6], envolver=False)
        for y in range(18, 23):
            for x in range(13, 21):
                if ((x - 17) / 4.2) ** 2 + ((y - 20) / 2.2) ** 2 <= 1:
                    t.set(x, y, AGUA[2] if y > 19 else AGUA[4])
        t.set(15, 19, AGUA[8])
    return t


# ===========================================================================
# GRAVA
# ===========================================================================

def grava_parche(lado, s):
    """Grava suelta: cantos pequenos apretados, cada uno con su bisel."""
    P = lado * T
    li = Lienzo(P, P)
    for y in range(P):
        for x in range(P):
            d1, d2, ide, vx, vy = voronoi(x, y, 7, P, s, aplastar=1.25)
            junta = d2 - d1
            if junta < 1.1:
                li.set(x, y, GRAVA[1] if junta < 0.5 else GRAVA[2])
                continue
            base = 4 + int(h01(ide, 1, s) * 3)
            if junta < 2.2:
                k = base - 1 if (vx + vy) > 0.2 else base + 2 if (vx + vy) < -0.2 else base
            else:
                k = base + (1 if tramar(0.35, x, y) and d1 < 2.0 else 0)
            li.set(x, y, GRAVA[max(0, min(len(GRAVA) - 1, k))])
    return [[_recortar(li, i * T, j * T) for i in range(lado)] for j in range(lado)]


def deco_grava(k, s):
    """Cascote suelto transparente para pegar a las paredes."""
    t = Lienzo(T, T)
    for i in range(3 + k):
        rx = 1.6 + h01(i, 1, s + k) * 2.4
        _guijarro(t, 6 + h01(i, 2, s + k) * 20, 7 + h01(i, 3, s + k) * 18, rx, rx * 0.8,
                  GRAVA, 5 + int(h01(i, 4, s + k) * 3), envolver=False)
    return t


# ===========================================================================
# TABLONES
# ===========================================================================

def normalizador(fn, P, paso=2):
    """
    Devuelve una funcion que lleva los valores de `fn(x, y)` a su RANGO (0..1)
    dentro del parche.

    POR QUE. El ruido periodico con pocas celdas por periodo (64 px en un
    parche de 128 son 2x2 valores de la red) no reparte sus valores en 0..1:
    medido, el de la lava se quedaba entre 0,25 y 0,51 con la mediana en 0,37.
    Con el umbral de costra en 0,40, el 73 %% del lago salia costra negra y la
    lava casi no se veia fundida. Pasando por el rango, "0,42" significa de
    verdad "el 42 %% mas frio", sea cual sea la semilla.
    """
    muestras = sorted(fn(x, y) for y in range(0, P, paso) for x in range(0, P, paso))
    n = len(muestras)
    cortes = [muestras[min(n - 1, int(n * q / 20.0))] for q in range(21)]

    def rango(v):
        if v <= cortes[0]:
            return 0.0
        if v >= cortes[20]:
            return 1.0
        for k in range(20):
            a, b = cortes[k], cortes[k + 1]
            if v <= b:
                return (k + (v - a) / (b - a if b > a else 1.0)) / 20.0
        return 1.0
    return rango


def voronoi_mov(x, y, celda, periodo, s, fase=0.0, amp=0.0, aplastar=1.0):
    """
    Como `voronoi`, pero cada semilla da una vuelta pequena (radio `amp`) a lo
    largo de la animacion, cada una con su propio desfase. Con `fase` de 0 a 1
    el bucle cierra solo: el fotograma 0 y el F son el mismo. Y sigue tejiendo
    cada `periodo` px, porque el desfase sale de la celda ya envuelta.
    """
    n = max(1, int(round(periodo / float(celda))))
    celda = periodo / float(n)
    ci, cj = int(math.floor(x / celda)), int(math.floor(y / celda))
    d1 = d2 = 1e9
    ide = 0
    s1 = s2 = (0.0, 0.0)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            i, j = ci + di, cj + dj
            ii, jj = i % n, j % n
            ph = 2 * math.pi * (fase + h01(ii, jj, s + 202))
            sx = (i + 0.15 + 0.7 * h01(ii, jj, s)) * celda + amp * math.cos(ph)
            sy = (j + 0.15 + 0.7 * h01(ii, jj, s + 101)) * celda + amp * math.sin(ph)
            d = math.hypot(x - sx, (y - sy) * aplastar)
            if d < d1:
                d2, s2 = d1, s1
                d1, s1 = d, (sx, sy)
                ide = ii * 7919 + jj
            elif d < d2:
                d2, s2 = d, (sx, sy)
    vx, vy = s2[0] - s1[0], s2[1] - s1[1]
    largo = math.hypot(vx, vy) or 1.0
    return d1, d2, ide, vx / largo, vy / largo


def tablas_parche(lado, s, alto=16):
    """
    La tarima: tablones horizontales de `alto` px que corren de casilla en
    casilla, con juntas al tresbolillo, veta, nudos y clavos en cada junta.

    16 PX DE TABLON, NO 8. El personaje mide 102 px: un tablon de verdad (25
    cm en un cuerpo de 1,70 m) son 15 px. Con 8 px caben cuatro tablas en una
    casilla, que es el dibujo de un suelo de 16 px: la primera mina ya
    aprendio que eso se lee como una maqueta.
    """
    P = lado * T
    li = Lienzo(P, P)
    for fila in range(P // alto):
        y0 = fila * alto
        juntas = []
        x = int(h01(fila, 1, s) * 70)
        while x < P + 60:
            juntas.append(x % P)
            x += 64 + int(h01(fila, len(juntas) + 2, s) * 72)
        juntas = sorted(set(juntas))
        for x in range(P):
            tramo = sum(1 for j in juntas if j <= x)
            if tramo == len(juntas):
                tramo = 0
            base = 4 + int(h01(fila * 31 + tramo, 7, s) * 3)
            for dy in range(alto):
                y = y0 + dy
                if dy == alto - 1:
                    c = MADERA[1]                         # la rendija
                elif dy == 0:
                    c = MADERA[base + 2]                  # el canto con luz
                elif dy == 1:
                    c = MADERA[base + 1]
                elif dy == alto - 2:
                    c = MADERA[base - 2]
                elif dy == alto - 3:
                    c = MADERA[base - 1]
                else:
                    # Veta: lineas que corren a lo largo y se ondulan; el
                    # periodo es el del parche para que la tarima teja.
                    onda = math.sin(2 * math.pi * (x * 2.0 / P) + fila * 1.3) * 1.6
                    veta = math.sin((dy + onda) * 1.15 + fila * 2.3 + tramo)
                    if veta > 0.86:
                        c = MADERA[base - 1]
                    elif veta < -0.92:
                        c = MADERA[base + 1]
                    else:
                        c = MADERA[base]
                li.set(x, y, c)
        for j in juntas:
            for dy in range(alto - 1):
                li.set(j % P, y0 + dy, MADERA[1])
                li.set((j + 1) % P, y0 + dy, MADERA[7] if dy < alto - 3 else MADERA[3])
            # Dos clavos a cada lado de la junta.
            for cx in ((j - 4) % P, (j + 5) % P):
                for cy in (y0 + 4, y0 + alto - 6):
                    li.set(cx, cy, (176, 168, 156, 255))
                    li.set(cx + 1, cy + 1, MADERA[1])
        # Nudos.
        for k in range(2):
            if h01(fila, 40 + k, s) > 0.6:
                nx = int(h01(fila, 50 + k, s) * P)
                ny = y0 + 5 + int(h01(fila, 60 + k, s) * (alto - 10))
                for dy in (-1, 0, 1):
                    for dx in range(-3, 4):
                        if abs(dx) + abs(dy) * 2 <= 3:
                            li.set((nx + dx) % P, ny + dy, MADERA[2] if abs(dx) < 2 else MADERA[3])
                li.set(nx % P, ny, MADERA[1])
    return [[_recortar(li, i * T, j * T) for i in range(lado)] for j in range(lado)]


def puente_parche(s, lado=4):
    """
    Las pasarelas que cruzan la lava: tablas ATRAVESADAS (en vertical, que es
    como se clava un puente, perpendicular a por donde se anda), apoyadas en
    dos largueros —arriba y abajo— que son los que corren a lo largo.

    Devuelve {('n'|'c'|'s', i): tile}: la fila de arriba (con el larguero
    norte), la del centro y la de abajo (larguero sur), con i = x mod `lado`.
    """
    P = lado * T
    H = 3 * T
    li = Lienzo(P, H)
    x = 0
    k = 0
    tablas = []
    while x < P:
        w = 9 + int(h01(k, 1, s) * 4)
        if x + w > P - 6:
            w = P - x
        tablas.append((x, w, k))
        x += w
        k += 1
    for (x0, w, k) in tablas:
        base = 4 + int(h01(k, 2, s) * 3)
        desn = int(h01(k, 3, s) * 3) - 1          # cada tabla un poco movida
        for y in range(H):
            for dx in range(w):
                xx = x0 + dx
                if dx == w - 1:
                    c = MADERA[1]
                elif dx == 0:
                    c = MADERA[base + 2]
                elif dx == w - 2:
                    c = MADERA[base - 2]
                else:
                    veta = math.sin((dx + math.sin(2 * math.pi * y * 2.0 / H) * 1.4) * 1.3 + k * 1.7)
                    c = MADERA[base - 1] if veta > 0.88 else MADERA[base]
                yy = (y + desn) % H
                li.set(xx, yy, c)
    # Los largueros: un madero redondeado arriba y otro abajo.
    for (y0, y1) in ((2, 11), (H - 12, H - 3)):
        for y in range(y0, y1 + 1):
            rel = (y - y0) / float(y1 - y0)
            k = 8 if rel < 0.15 else 6 if rel < 0.4 else 5 if rel < 0.7 else 3 if rel < 0.9 else 1
            for x in range(P):
                veta = math.sin(2 * math.pi * x * 3.0 / P + y * 0.9)
                li.set(x, y, MADERA[k - 1] if veta > 0.93 else MADERA[k])
        # Los clavos que sujetan cada tabla al larguero.
        for (x0, w, k) in tablas:
            cx = x0 + w // 2
            cy = (y0 + y1) // 2
            li.set(cx, cy, (190, 182, 170, 255))
            li.set(cx + 1, cy + 1, MADERA[1])
    out = {}
    for i in range(lado):
        out[('n', i)] = _recortar(li, i * T, 0)
        out[('c', i)] = _recortar(li, i * T, T)
        out[('s', i)] = _recortar(li, i * T, 2 * T)
    return out


def via(orient, s):
    """
    La via de la vagoneta: dos casillas de galibo (64 px). Balasto de grava
    con su bisel, traviesas de madera con veta y canto, y carriles de acero
    con la cabeza brillante, el alma en sombra y un clavo en cada traviesa.
    `orient` 'h' = carriles de este a oeste (pieza de 1x2 casillas); 'v' = de
    norte a sur (2x1). Devuelve las dos mitades en orden.
    """
    W, H = (T, 2 * T) if orient == 'h' else (2 * T, T)
    li = Lienzo(W, H)
    largo = W if orient == 'h' else H
    # El balasto.
    for y in range(H):
        for x in range(W):
            d1, d2, ide, vx, vy = voronoi(x, y, 5, largo if orient == 'h' else largo, s + 3)
            junta = d2 - d1
            if junta < 0.8:
                c = GRAVA[1]
            else:
                base = 3 + int(h01(ide, 1, s) * 3)
                c = GRAVA[base + 1] if (vx + vy) < -0.3 and junta < 2 else GRAVA[base]
            li.set(x, y, c)

    def pon(a, b, c):
        if orient == 'h':
            li.set(a, b, c)
        else:
            li.set(b, a, c)

    ancho = H if orient == 'h' else W        # lo ancho de la via (64)
    # Traviesas: 10 px cada 16, dividen la casilla (no dan salto al repetirse).
    for t0 in range(3, largo, 16):
        for a in range(t0, t0 + 10):
            rel = (a - t0) / 9.0
            k = 8 if rel < 0.12 else 6 if rel < 0.5 else 5 if rel < 0.85 else 2
            for b in range(5, ancho - 5):
                veta = math.sin(b * 0.45 + t0)
                kk = k - 1 if (veta > 0.92 and 0.15 < rel < 0.85) else k
                if b in (5, ancho - 6):
                    kk = 2
                pon(a % largo, b, MADERA[kk])
    # Los dos carriles.
    for cb in (14, ancho - 15):
        for a in range(largo):
            pon(a, cb - 3, METAL_VIA[1])
            pon(a, cb - 2, METAL_VIA[6])
            pon(a, cb - 1, METAL_VIA[8])
            pon(a, cb, METAL_VIA[5])
            pon(a, cb + 1, METAL_VIA[3])
            pon(a, cb + 2, METAL_VIA[2])
            pon(a, cb + 3, METAL_VIA[0])
        for t0 in range(3, largo, 16):
            for off in (-5, 5):
                pon((t0 + 4) % largo, cb + off, METAL_VIA[7])
                pon((t0 + 5) % largo, cb + off, METAL_VIA[2])
    if orient == 'h':
        return [_recortar(li, 0, 0), _recortar(li, 0, T)]
    return [_recortar(li, 0, 0), _recortar(li, T, 0)]


METAL_VIA = rampa('#16181b', '#23262a', '#33373c', '#454a50', '#5a6067', '#737a82',
                  '#8f979f', '#b2b9c0', '#dde2e6')


# ===========================================================================
# LAVA, POR FOTOGRAMAS
# ===========================================================================
#
# La lava ya no corre por un tileSprite encima del lago: se ANIMA cambiando la
# imagen de su tileset (`tileset.setImage`) cada pocos fotogramas. Asi las
# piezas del borde del lago van animadas con el mismo dibujo que el interior y
# no queda la costura entre una textura que se mueve y un borde quieto que se
# veia en todo el perimetro.
#
# Cada fotograma es el mismo campo con la "fase" movida un poco en circulo: el
# ultimo enlaza con el primero, y la lava BULLE en vez de deslizarse.

def _campo_lava_f(x, y, P, s, fase):
    a = 2 * math.pi * fase
    r = 2.6
    wx = fbm(x + r * math.cos(a), y + r * math.sin(a), P, s + 5, ((32, 0.6), (16, 0.4))) - 0.5
    wy = fbm(x + 50 - r * math.sin(a), y + 90 + r * math.cos(a), P, s + 7,
             ((32, 0.6), (16, 0.4))) - 0.5
    # El detalle manda y la octava grande pesa poco. Con la de 64 (y despues
    # con la de 32 al 50 %%) salian unas pocas manchas grandes por parche, y en
    # un lago de diez casillas se veian repetidas cada 128 px como una reja.
    # Con el peso en 16 y 8 el parche es TEXTURA, no dibujo: no se le ve el
    # periodo.
    return fbm(x + wx * 20 + 1.6 * math.cos(a + 1.0), y + wy * 16 + 1.6 * math.sin(a + 1.0),
               P, s, ((8, 0.42), (16, 0.38), (32, 0.20)))


def lava_fotogramas(lado, s, F):
    """
    `F` fotogramas del parche de lava de `lado` x `lado` casillas.
    Devuelve [fotograma][fila][columna] -> tile.
    """
    P = lado * T
    rango = normalizador(lambda x, y: _campo_lava_f(x, y, P, s, 0.0), P)
    CORTEZA = 0.40
    fotos = []
    for f in range(F):
        fase = f / float(F)
        li = Lienzo(P, P)
        for y in range(P):
            for x in range(P):
                v = rango(_campo_lava_f(x, y, P, s, fase))
                d1, d2, ide, vx, vy = voronoi_mov(x, y, 15, P, s + 3, fase, 1.4, 1.15)
                junta = d2 - d1
                if v < CORTEZA:
                    # COSTRA: placas de basalto con la junta al rojo. Cada
                    # placa "respira": su grieta se enciende y se apaga con
                    # su propio desfase.
                    pulso = math.sin(2 * math.pi * (fase + h01(ide, 9, s)))
                    if junta < 1.2:
                        c = LAVA[8] if (junta < 0.55 and pulso > 0.2) else LAVA[6] if junta < 0.55 else LAVA[5]
                    elif junta < 2.1:
                        c = LAVA[3] if pulso > 0.5 else LAVA[2]
                    else:
                        k = 1 + int(h01(ide, 2, s) * 2)
                        if (vx + vy) < -0.25 and junta < 3.4:
                            k += 1                       # el canto con luz
                        elif (vx + vy) > 0.25 and junta < 3.0:
                            k = max(0, k - 1)
                        c = LAVA[k]
                    if v > CORTEZA - 0.035:
                        c = LAVA[4]                      # el filo, casi fundido
                else:
                    calor = (v - CORTEZA) / (1.0 - CORTEZA)
                    corriente = math.sin(2 * math.pi * (3 * x + 1 * y) / float(P) +
                                         (fbm(x, y, P, s + 13, ((32, 1.0),)) - 0.37) * 9.0 +
                                         2 * math.pi * fase)
                    if corriente > 0.84:
                        calor += 0.20
                    elif corriente < -0.88:
                        calor -= 0.14
                    c = tono(LAVA, 0.08 + calor * 0.92, x, y, 5, 9)
                    if calor > 0.93 and h01(x, y, s + 3 + f) > 0.7:
                        c = LAVA[10]
                    if v < CORTEZA + 0.03:
                        c = LAVA[5]
                li.set(x, y, c)
        fotos.append([[_recortar(li, i * T, j * T) for i in range(lado)] for j in range(lado)])
    return fotos


def burbujas_lava():
    """Seis fotogramas de 32x32: sube, se hincha y revienta en salpicaduras."""
    out = []
    for f in range(6):
        t = Lienzo(T, T)
        if f < 4:
            r = 2.6 + f * 2.0
            cy = 21 - f * 2.0
            for y in range(T):
                for x in range(T):
                    dx, dy = (x - 16) / r, (y - cy) / (r * 0.85)
                    d = dx * dx + dy * dy
                    if d > 1:
                        continue
                    luz = -dx * 0.5 - dy * 0.8
                    if d > 0.7:
                        c = LAVA[4] if luz < 0 else LAVA[7]
                    else:
                        c = LAVA[8] if luz > 0.3 else LAVA[6]
                    t.set(x, y, c)
            t.set(int(16 - r * 0.35), int(cy - r * 0.45), LAVA[10])
        else:
            r = 8.0 + (f - 4) * 4.5
            for i in range(10):
                a = i / 10.0 * 6.283 + f
                px = 16 + math.cos(a) * r
                py = 15 + math.sin(a) * r * 0.7 - (f - 4) * 2
                t.set(int(px), int(py), LAVA[9] if f == 4 else LAVA[6])
                t.set(int(px) + 1, int(py), LAVA[7] if f == 4 else LAVA[5])
        out.append(t)
    return out


# ===========================================================================
# AGUA, POR FOTOGRAMAS
# ===========================================================================

def ruido_aniso(x, y, ex, ey, periodo, s):
    """
    Ruido de valor PERIODICO y ANISOTROPO: celdas de `ex` px de ancho por `ey`
    de alto. Con ex >> ey sale en vetas horizontales, que es como se ven los
    reflejos en una superficie de agua.
    """
    nx = max(1, int(round(periodo / float(ex))))
    ny = max(1, int(round(periodo / float(ey))))
    fx, fy = x * nx / float(periodo), y * ny / float(periodo)
    i0, j0 = int(math.floor(fx)), int(math.floor(fy))
    tx, ty = _suave(fx - i0), _suave(fy - j0)
    a = h01(i0 % nx, j0 % ny, s)
    b = h01((i0 + 1) % nx, j0 % ny, s)
    c = h01(i0 % nx, (j0 + 1) % ny, s)
    d = h01((i0 + 1) % nx, (j0 + 1) % ny, s)
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty


def agua_fotogramas(lado, s, F):
    """
    Agua de cueva: honda, oscura y QUIETA, con reflejos.

    LA PRIMERA VERSION LLEVABA CAUSTICAS (una red de Voronoi) y en el mapa se
    leia como piel de tortuga o empedrado mojado, no como agua: una red de
    celdas cerradas es el dibujo de algo SOLIDO. Lo que dice "agua" en pixel
    art es otra cosa: un fondo oscuro con poca variacion y REFLEJOS
    horizontales, alargados y finos, que tiemblan.

    Aqui los reflejos son ruido anisotropo (celdas de 26x3 px) en dos capas
    que dan una vuelta pequena en sentidos contrarios a lo largo del bucle: la
    luz se deshace y se rehace sin desplazarse, como en una charca sin
    corriente. Mas algun destello suelto que cambia en cada fotograma.

    Devuelve [fotograma][fila][columna] -> tile.
    """
    P = lado * T
    fondo = lambda x, y: fbm(x, y, P, s, ((64, 0.6), (32, 0.4)))
    rango = normalizador(fondo, P)
    fotos = []
    for f in range(F):
        a = 2 * math.pi * f / float(F)
        li = Lienzo(P, P)
        for y in range(P):
            for x in range(P):
                v = rango(fondo(x, y))
                base = 0.10 + v * 0.32
                r1 = ruido_aniso(x + 2.5 * math.cos(a), y + 0.8 * math.sin(a), 26, 3, P, s + 41)
                r2 = ruido_aniso(x - 2.5 * math.cos(a + 1.3), y - 0.8 * math.sin(a + 1.3), 18, 2, P, s + 43)
                brillo = r1 * 0.6 + r2 * 0.4
                # Los reflejos se ven mas donde el fondo es mas claro (mas luz
                # llega a esa parte de la charca).
                umbral = 0.70 - v * 0.08
                if brillo > umbral:
                    base += min(0.32, (brillo - umbral) * 2.2)
                c = tono(AGUA, base, x, y, 1, 7)
                if brillo > umbral + 0.13 and h01(x, y, s + 77 + f * 13) > 0.82:
                    c = AGUA[8]
                if h01(x, y, s + 91 + f * 7) > 0.9991:
                    c = AGUA[9]
                li.set(x, y, c)
        fotos.append([[_recortar(li, i * T, j * T) for i in range(lado)] for j in range(lado)])
    return fotos


# ===========================================================================
# BORDES (el juego de 13 piezas, como CAPA: transparente por fuera)
# ===========================================================================
#
# Los bordes ya no llevan el suelo pintado por fuera. Van en una capa ENCIMA
# del suelo (`mina_bordes`) y por fuera son TRANSPARENTES —o semitransparentes
# donde el material afecta al suelo: la orilla mojada, el suelo tostado por la
# lava—. Debajo esta el parche de suelo de 8x8 casillas, entero y sin cortar.
#
# Antes cada pieza de borde traia su propio trozo de suelo, que no era el del
# parche en esa posicion: se veia el cambio de dibujo en cada orilla. Y el
# interior del borde sale del parche del material EN SU POSICION (i, j), asi
# que la lava, el agua y la grava cruzan del interior a la orilla sin costura.

LADOS_BORDE = ['NO', 'N', 'NE', 'O', 'E', 'SO', 'S', 'SE', 'iNO', 'iNE', 'iSO', 'iSE']


def _perfil(s, amp):
    return [int(round(math.sin(2 * math.pi * i / T + s * 0.7) * amp +
                      math.sin(2 * math.pi * 2 * i / T + s * 1.9) * amp * 0.42 +
                      math.sin(2 * math.pi * 3 * i / T + s * 3.1) * amp * 0.18))
            for i in range(T)]


def mascara_lado(lado, s, dentro=10.0, amp=3.0):
    """La mascara del material de DENTRO para una pieza del juego de 13."""
    m = Mascara(T, T)
    pn, ps, po, pe = _perfil(s, amp), _perfil(s + 3, amp), _perfil(s + 5, amp), _perfil(s + 7, amp)
    def n(x, y): return y >= dentro + pn[x % T]
    def su(x, y): return y <= (T - 1 - dentro) + ps[x % T]
    def o(x, y): return x >= dentro + po[y % T]
    def e(x, y): return x <= (T - 1 - dentro) + pe[y % T]
    reglas = {
        'C': lambda x, y: True, 'N': n, 'S': su, 'O': o, 'E': e,
        'NO': lambda x, y: n(x, y) and o(x, y), 'NE': lambda x, y: n(x, y) and e(x, y),
        'SO': lambda x, y: su(x, y) and o(x, y), 'SE': lambda x, y: su(x, y) and e(x, y),
        'iNO': lambda x, y: n(x, y) or o(x, y), 'iNE': lambda x, y: n(x, y) or e(x, y),
        'iSO': lambda x, y: su(x, y) or o(x, y), 'iSE': lambda x, y: su(x, y) or e(x, y),
    }
    f = reglas[lado]
    for y in range(T):
        for x in range(T):
            if f(x, y):
                m.set(x, y)
    return m


def _distancias(m, buscar_dentro):
    """
    Para cada pixel del lado pedido, a cuantos pixeles (max 6, en anillos
    cuadrados) esta el pixel mas cercano del OTRO lado, sin salir del tile.
    `buscar_dentro=True`: pixeles de fuera, distancia a la mascara.
    """
    d = {}
    for y in range(T):
        for x in range(T):
            if bool(m.get(x, y)) == buscar_dentro:
                continue
            mejor = 9
            for r in range(1, 7):
                hallado = False
                for dy in range(-r, r + 1):
                    for dx in range(-r, r + 1):
                        if max(abs(dx), abs(dy)) != r:
                            continue
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < T and 0 <= yy < T and bool(m.get(xx, yy)) == buscar_dentro:
                            hallado = True
                            break
                    if hallado:
                        break
                if hallado:
                    mejor = r
                    break
            d[(x, y)] = mejor
    return d


_MASCARAS = {}


def _mascara_y_distancias(lado, s):
    clave = (lado, s)
    if clave not in _MASCARAS:
        m = mascara_lado(lado, s)
        _MASCARAS[clave] = (m, _distancias(m, True), _distancias(m, False))
    return _MASCARAS[clave]


def borde_capa(lado, piel, material, s, f=0):
    """
    Una pieza de borde TRANSPARENTE POR FUERA: `piel` (el tile del material en
    esta posicion del parche) dentro de la mascara, el remate propio de cada
    material, y por fuera solo lo que el material le hace al suelo.

      lava   labio de basalto, el suelo tostado y teñido de rojo, alguna brasa;
      agua   espuma en la linea del agua, somero mas claro, la orilla mojada;
      grava  el canto de los guijarros y los que ruedan por fuera, con sombra.
    """
    m, df, dd = _mascara_y_distancias(lado, s)
    t = Lienzo(T, T)
    for x, y in m.puntos():
        t.set(x, y, piel.get(x, y))
    for (x, y), d in df.items():
        if material == 'lava':
            if d == 1:
                t.set(x, y, LAVA[1] if h01(x, y, s) > 0.35 else LAVA[0])
            elif d == 2:
                if h01(x, y, s + 5 + f) > 0.93:
                    t.set(x, y, LAVA[7])                  # una brasa
                else:
                    t.set(x, y, (14, 6, 4, 165))
            elif d == 3:
                t.set(x, y, (60, 14, 6, 95))
            elif d == 4:
                t.set(x, y, (120, 34, 10, 52))
            elif d == 5 and tramar(0.5, x, y):
                t.set(x, y, (150, 48, 14, 30))
        elif material == 'agua':
            if d == 1:
                t.set(x, y, (6, 16, 22, 175))
            elif d == 2:
                t.set(x, y, (6, 16, 22, 110))
            elif d == 3 and tramar(0.6, x, y):
                t.set(x, y, (6, 16, 22, 60))
        else:   # grava
            if d == 1:
                t.set(x, y, (0, 0, 0, 80))
            elif d == 2 and tramar(0.4, x, y):
                t.set(x, y, (0, 0, 0, 38))
            if d <= 3 and h01(x, y, s + 21) > 0.86:
                t.set(x, y, GRAVA[5] if h01(x, y, s + 22) > 0.5 else GRAVA[3])
                if 0 <= x + 1 < T and 0 <= y + 1 < T and not m.get(x + 1, y + 1):
                    t.set(x + 1, y + 1, (0, 0, 0, 90))
    for (x, y), d in dd.items():
        c = t.get(x, y)
        if material == 'lava':
            if d == 1:
                t.set(x, y, LAVA[2] if h01(x, y, s) > 0.4 else LAVA[1])
            elif d == 2:
                t.set(x, y, LAVA[3] if c[0] < 150 else LAVA[6])
            elif d == 3 and c[0] > 200:
                t.set(x, y, LAVA[7])                      # la lava contra la orilla, al rojo
        elif material == 'agua':
            if d == 1:
                t.set(x, y, AGUA[8] if h01(x, y, s + 9 + f * 7) > 0.45 else AGUA[7])
            elif d == 2:
                t.set(x, y, AGUA[7] if h01(x, y, s + 19 + f * 5) > 0.7 else AGUA[6])
            elif d == 3:
                t.set(x, y, AGUA[6] if tramar(0.45, x, y) else AGUA[5])
            elif d == 4 and tramar(0.3, x, y):
                t.set(x, y, AGUA[5])
        else:
            if d == 1:
                t.set(x, y, oscurecer(c, 0.72))
    return t


# ===========================================================================
# EL MURO
# ===========================================================================

def pinta_muro(li, s, alto_muro):
    """
    Una pared de mamposteria vista de frente: hiladas de sillares de distinto
    alto y largo, cada sillar con su bisel (luz arriba-izquierda, sombra
    abajo-derecha), junta honda, alguna grieta, musgo en las hiladas de abajo,
    algun brillo de mineral, el remate de roca con su visera y el pie oscuro.
    Teje en horizontal: todo lo que cruza el borde se pinta tres veces.
    """
    W = li.w
    H = alto_muro * T
    techo = 24                 # alto del remate (la roca de encima)
    pie = 16                   # la franja de contacto con el suelo
    # ── Las hiladas ──────────────────────────────────────────────────────
    y = techo
    hilada = 0
    while y < H - pie:
        alto = 13 + int(h01(hilada, 1, s) * 7)
        alto = min(alto, H - pie - y)
        x = int(h01(hilada, 2, s) * 30)
        sillar = 0
        cortes = []
        while x < W + 40:
            cortes.append(x)
            x += 20 + int(h01(hilada * 17 + sillar, 3, s) * 18)
            sillar += 1
        cortes = [c % W for c in cortes]
        cortes = sorted(set(cortes))
        for yy in range(y, y + alto):
            for xx in range(W):
                # que sillar y donde dentro de el
                previos = [c for c in cortes if c <= xx]
                c0 = previos[-1] if previos else (cortes[-1] - W)
                siguientes = [c for c in cortes if c > xx]
                c1 = siguientes[0] if siguientes else cortes[0] + W
                ide = hilada * 101 + (c0 % W)
                base = 5 + int(h01(ide, 4, s) * 3)
                dx_iz, dx_de = xx - c0, c1 - xx
                dy_ar, dy_ab = yy - y, y + alto - 1 - yy
                if dx_iz <= 1 or dy_ab <= 1:
                    col = MURO[1] if (dx_iz == 0 or dy_ab == 0) else MURO[2]        # junta
                elif dy_ar == 0 or dx_iz == 2:
                    col = MURO[min(10, base + 2)]                                  # canto con luz
                elif dy_ab == 2 or dx_de == 1:
                    col = MURO[base - 2]                                           # sombra del canto
                elif dy_ar == 1 and tramar(0.5, xx, yy):
                    col = MURO[min(10, base + 1)]
                else:
                    v = ruido_valor(xx, yy, 8, W, s + ide)
                    col = MURO[base] if v > 0.42 else MURO[base - 1] if v < 0.2 else MURO[base]
                    if v > 0.86 and tramar(0.5, xx, yy):
                        col = MURO[min(10, base + 1)]
                li.set(xx, yy, col)
        # musgo en las hiladas bajas, sobre el canto de arriba
        if y > H * 0.55:
            for xx in range(W):
                mv = ruido_valor(xx, hilada * 9, 8, W, s + 900)
                if mv > 0.68:
                    li.set(xx, y, MUSGO[3])
                    if mv > 0.76:
                        li.set(xx, y + 1, MUSGO[2])
                        if mv > 0.84:
                            li.set(xx, y + 2, MUSGO[1])
        y += alto
        hilada += 1

    def tres(fn):
        for d in (-W, 0, W):
            fn(d)

    # ── Grietas ──────────────────────────────────────────────────────────
    for i in range(max(1, W // 60)):
        gx = h01(i, 11, s) * W
        gy = techo + 8 + h01(i, 12, s) * (H - techo - pie - 30)
        tres(lambda d, gx=gx, gy=gy, i=i: _grieta(li, gx + d, gy, 14 + h01(i, 13, s) * 26,
                                                  1.3 + (h01(i, 14, s) - 0.5) * 0.8, s + i * 7,
                                                  MURO[0], MURO[7], envolver=False))
    # ── Brillos de mineral ───────────────────────────────────────────────
    for i in range(W // 18):
        bx = int(h01(i, 21, s) * W)
        by = int(techo + 4 + h01(i, 22, s) * (H - techo - pie - 8))
        if li.get(bx, by)[0] > MURO[4][0]:
            li.set(bx, by, BRILLO_MINERAL)
            li.set(bx + 1, by + 1, MURO[3])
    # ── Oclusion: la luz entra por arriba ────────────────────────────────
    for yy in range(techo, H):
        f = 1.06 - 0.32 * ((yy - techo) / float(H - techo)) ** 1.4
        for xx in range(W):
            c = li.get(xx, yy)
            if c[3]:
                li.set(xx, yy, oscurecer(c, f))
    # ── El remate: roca con visera ───────────────────────────────────────
    pf = [int(round(math.sin(2 * math.pi * i / T + s) * 1.6 +
                    math.sin(2 * math.pi * 2 * i / T + s * 2.3) * 0.7)) for i in range(T)]
    for xx in range(W):
        corte = techo - 4 + pf[xx % T]
        for yy in range(0, max(0, corte)):
            v = ruido_valor(xx, yy, 8, W, s + 300)
            li.set(xx, yy, ROCA[3] if v > 0.6 else ROCA[2] if v > 0.25 else ROCA[1])
        if 0 <= corte < H:
            li.set(xx, corte, MURO[7] if h01(xx, 1, s) > 0.2 else MURO[8])
        if 0 <= corte + 1 < H:
            li.set(xx, corte + 1, MURO[5])
        for k in range(2, 5):
            if 0 <= corte + k < H:
                li.set(xx, corte + k, oscurecer(li.get(xx, corte + k), 0.55 + 0.1 * k))
    # ── El pie: tierra y piedras contra la pared ─────────────────────────
    for k, yy in enumerate(range(H - pie, H)):
        for xx in range(W):
            c = li.get(xx, yy)
            if not c[3]:
                c = MURO[3]
            li.set(xx, yy, oscurecer(c, 0.72 - k * 0.018))
    for i in range(max(3, W // 10)):
        cx = h01(i, 31, s) * W
        rx = 2.5 + h01(i, 32, s) * 4
        tres(lambda d, cx=cx, rx=rx, i=i: _guijarro(li, cx + d, H - 6 - h01(i, 33, s) * 4, rx, rx * 0.7,
                                                    MURO, 4, envolver=False, sombra=False))
    return li


def roca_parche(lado, s):
    """
    La roca sin excavar vista desde arriba: bolos grandes, oscuros y con
    poco contraste, para que se lea como "por ahi no se pasa" sin competir
    con el suelo.
    """
    P = lado * T
    li = Lienzo(P, P)

    def altura(x, y):
        # "Ridged": crestas donde el ruido pasa por la mitad.
        v = fbm(x, y, P, s, ((32, 0.5), (16, 0.3), (8, 0.2)))
        return 1.0 - abs(v - 0.5) * 2.0

    for y in range(P):
        for x in range(P):
            h = altura(x, y)
            pendiente = h - altura((x - 1) % P, (y - 1) % P)     # luz arriba-izquierda
            v = 0.45 + pendiente * 3.2 + (h - 0.5) * 0.35
            c = tono(ROCA, v, x, y, 2, 6)
            if h < 0.16:
                c = ROCA[1]                                     # grieta honda
            li.set(x, y, c)
    return [_recortar(li, (k % lado) * T, (k // lado) * T) for k in range(lado * lado)]


def roca_canto(lado, base_tile, s):
    """El filo del lomo donde toca el hueco por el norte o por los lados."""
    t = Lienzo(T, T)
    t.pegar(base_tile)
    pf = _perfil(s, 1.6)
    for i in range(T):
        anchura = max(1, 3 + pf[i])
        for k in range(anchura + 3):
            if lado == 'N':
                x, y = i, k
            elif lado == 'O':
                x, y = k, i
            else:
                x, y = T - 1 - k, i
            if k < anchura:
                c = MURO[8] if k == 0 else MURO[6] if k == 1 else ROCA[6]
            else:
                c = oscurecer(t.get(x, y), 0.7)
            t.set(x, y, c)
    return t
