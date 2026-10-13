# -*- coding: utf-8 -*-
"""
LOS MUEBLES QUE ERAN PLANOS, EN 2.5D                               (2026-10-11)

"En las casas los objetos no son 2D sino 2.5D (dibuja bien)." Varios muebles
de las casas eran piezas de la TIENDA, dibujadas para su mapa de casillas en
vista CENITAL (desde arriba, sin frente): el mostrador en U, la mesa larga
con su mantel, los expositores de fruta y pociones, el cajón (un cuadrado
plano), la escalera. Dentro de una casa, junto a la cama o el armario (que sí
tienen tapa y frente), se veían pegados al suelo, como recortes.

Aquí se dibujan en la vista del juego (3/4): se ve la TAPA, el FRENTE y la
sombra del lado; la luz viene de arriba a la izquierda; contorno oscuro y las
rampas de madera y hierro de los demás muebles (generar-interiores.py).

Y de paso, cuatro que eran RACIMOS DE AGUJEROS (tripofobia): el carbón (una
bola con agujeros), la pila de leña (una pirámide de círculos), las nasas
(sacos con agujeros y moteado) y la red (una malla entera de huecos). Ahora:
trozos de carbón angulosos, troncos tumbados vistos de lado, jaulas de
listones y la red recogida y colgada, todo con líneas y planos, sin huecos.

Cada función devuelve una Image RGBA al tamaño de DIBUJO (el que luego
escala ESCALA_MUEBLE), con el mismo tamaño aproximado que la pieza a la que
sustituye, para que las salas no se descoloquen.
"""
import os
from PIL import Image, ImageDraw

MADERA = [(58, 36, 24), (96, 60, 38), (128, 82, 50), (160, 106, 64), (190, 134, 84)]
MADERA_CLARA = [(74, 48, 30), (122, 82, 50), (158, 112, 70), (192, 146, 96), (220, 178, 122)]
HIERRO = [(30, 32, 38), (58, 62, 70), (86, 92, 102), (124, 130, 140), (176, 182, 190)]


class P:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def rect(self, x, y, w, h, c, borde=None):
        if w <= 0 or h <= 0:
            return
        self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=tuple(c) + (255,))
        if borde is not None:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], outline=tuple(borde) + (255,))

    def lin(self, x0, y0, x1, y1, c, ancho=1):
        self.d.line([x0, y0, x1, y1], fill=tuple(c) + (255,), width=ancho)

    def poli(self, pts, c, borde=None):
        self.d.polygon(pts, fill=tuple(c) + (255,), outline=(tuple(borde) + (255,)) if borde else None)

    def elipse(self, x0, y0, x1, y1, c, borde=None):
        self.d.ellipse([x0, y0, x1, y1], fill=tuple(c) + (255,), outline=(tuple(borde) + (255,)) if borde else None)

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), tuple(c) + (255,))

    def pega(self, im, x, y):
        self.im.alpha_composite(im, (int(x), int(y)))


def _osc(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c)


def _icono(ruta, alto):
    """Un icono del juego recortado y a `alto` px (vecino más cercano)."""
    if not os.path.exists(ruta):
        return None
    im = Image.open(ruta).convert('RGBA')
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    k = alto / float(im.height)
    return im.resize((max(1, int(round(im.width * k))), alto), Image.NEAREST)


def _tablones_tapa(p, x, y, w, h, ramp, horizontales=True, sep=6):
    """La tapa de madera: tablones con su junta, y el canto delantero claro."""
    o, m1, m2, m3, m4 = ramp
    p.rect(x, y, w, h, m3)
    if horizontales:
        for yy in range(y + sep, y + h - 1, sep):
            p.lin(x + 1, yy, x + w - 2, yy, m2)
    else:
        for xx in range(x + sep, x + w - 1, sep):
            p.lin(xx, y + 1, xx, y + h - 2, m2)
    p.lin(x + 1, y + 1, x + w - 2, y + 1, m4)                 # luz de arriba
    p.lin(x, y + h - 1, x + w - 1, y + h - 1, m4)             # canto delantero


def _frente_panelado(p, x, y, w, h, ramp, paneles=3):
    o, m1, m2, m3, m4 = ramp
    p.rect(x, y, w, h, m2)
    pw = (w - 4 - (paneles - 1) * 3) // paneles
    for i in range(paneles):
        px0 = x + 2 + i * (pw + 3)
        p.rect(px0, y + 3, pw, h - 6, m1)
        p.rect(px0 + 1, y + 4, pw - 2, h - 8, m2)
        p.lin(px0 + 1, y + 4, px0 + pw - 2, y + 4, m3)          # luz del panel
    p.lin(x, y, x + w - 1, y, m1)


def _contorno(p):
    """Contorno oscuro de 1 px alrededor de lo opaco (como los demás muebles)."""
    im = p.im
    w, h = im.size
    px = im.load()
    borde = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if not (0 <= xx < w and 0 <= yy < h) or px[xx, yy][3] == 0:
                    borde.append((x, y))
                    break
    for x, y in borde:
        r, g, b, a = px[x, y]
        px[x, y] = (min(r, 58), min(g, 36), min(b, 26), 255) if (r + g + b) > 90 else (r, g, b, 255)


# ─────────────────────────────────────────────────────────────── MOSTRADOR
def mostrador():
    """Mostrador de tienda: tapa con libro de cuentas y caja, frente panelado."""
    W, H = 76, 38
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    _tablones_tapa(p, 0, 0, W, 12, MADERA, horizontales=True, sep=5)
    _frente_panelado(p, 0, 12, W, 22, MADERA, paneles=3)
    p.rect(0, 34, W, 4, m1)                                   # zócalo
    p.rect(W - 4, 12, 4, 22, _osc(m2, 0.72))                  # el lado en sombra
    # El libro de cuentas abierto.
    p.rect(8, 2, 16, 7, (226, 214, 186)); p.lin(16, 2, 16, 8, (170, 150, 120))
    for yy in (4, 6):
        p.lin(10, yy, 14, yy, (150, 136, 112)); p.lin(18, yy, 22, yy, (150, 136, 112))
    # La caja del dinero, de hierro, con su tapa.
    p.rect(50, 1, 16, 9, HIERRO[2]); p.rect(50, 1, 16, 3, HIERRO[3]); p.lin(51, 1, 64, 1, HIERRO[4])
    p.rect(57, 5, 2, 2, (214, 176, 80))
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── MESA LARGA
def mesa_larga(dir_cocina):
    """La mesa larga de la posada vista en 3/4: mantel rojo con ribete,
    platos con comida a los dos lados, el candelabro en (26, 22) (ahí va su
    llama, 'vela' con fx 26 fy 22), y al pie el faldón y dos patas."""
    W, H = 52, 102
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    rojo, rojo_l, rojo_o, oro = (150, 42, 38), (176, 62, 52), (110, 28, 26), (214, 176, 80)
    p.rect(2, 4, W - 4, 82, rojo)                              # el mantel sobre la tapa
    p.lin(3, 5, W - 4, 5, rojo_l)                              # luz de arriba
    p.rect(W - 6, 5, 3, 80, rojo_o)                            # sombra del lado
    p.lin(6, 8, 6, 82, oro); p.lin(W - 7, 8, W - 7, 82, oro)   # el ribete dorado
    # Platos (cuatro, grandes) con comida de la cocina.
    comidas = ['pan.png', 'queso.png', 'sopa.png', 'pastel.png']
    for i, (cx, cy) in enumerate(((15, 40), (37, 40), (15, 64), (37, 64))):
        p.elipse(cx - 7, cy - 5, cx + 7, cy + 5, (226, 226, 220), (150, 150, 146))
        p.elipse(cx - 5, cy - 3, cx + 5, cy + 3, (244, 244, 238))
        ic = _icono(os.path.join(dir_cocina, comidas[i]), 8)
        if ic is not None:
            p.pega(ic, cx - ic.width // 2, cy - 5)
    # El candelabro: pie de oro (la llama la pone el juego en 26, 22).
    p.rect(23, 26, 7, 3, oro); p.rect(25, 22, 3, 5, oro); p.rect(24, 21, 5, 2, (240, 210, 120))
    # El faldón del mantel por delante, con su fleco (una raya, no bolitas).
    p.rect(2, 86, W - 4, 8, rojo_o); p.lin(2, 86, W - 3, 86, rojo)
    p.lin(2, 93, W - 3, 93, oro)
    # La madera del canto y las patas.
    p.rect(3, 94, W - 6, 3, m2)
    p.rect(6, 97, 4, 5, m1); p.rect(W - 10, 97, 4, 5, m1)
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── EXPOSITOR
def expositor(iconos):
    """Puesto de mercado en 3/4: tablero de atrás, bandeja INCLINADA con el
    género en dos filas, frente de tablones con su letrero y dos patas."""
    W, H = 47, 61
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.rect(2, 0, W - 4, 12, m2); p.lin(3, 1, W - 4, 1, m4)     # el tablero de atrás
    p.rect(2, 0, W - 4, 3, m3)
    p.poli([(1, 12), (W - 2, 12), (W - 1, 38), (0, 38)], m3)   # la bandeja inclinada
    p.lin(1, 13, W - 3, 13, m4)
    p.lin(W // 2, 13, W // 2, 37, m2)                          # el separador
    p.rect(0, 38, W, 3, m4)                                    # el canto de la bandeja
    # El género: dos filas en cada lado.
    huecos = [(5, 15), (W // 2 + 4, 15), (4, 26), (W // 2 + 3, 26)]
    for i, (x, y) in enumerate(huecos):
        ic = iconos[i % len(iconos)] if iconos else None
        if ic is not None:
            p.pega(ic, x + (18 - ic.width) // 2, y + (10 - ic.height) // 2)
    p.rect(0, 41, W, 14, m2)                                   # el frente
    for xx in range(8, W - 2, 8):
        p.lin(xx, 42, xx, 53, m1)
    p.rect(12, 44, W - 24, 7, (226, 210, 168)); p.lin(15, 47, W - 16, 47, (150, 120, 84))   # el letrero
    p.rect(W - 4, 41, 4, 14, _osc(m2, 0.72))
    p.rect(3, 55, 4, 6, m1); p.rect(W - 7, 55, 4, 6, m1)       # patas
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── CAJÓN
def cajon():
    """Cajón de madera en 3/4: tapa de tres tablas y frente con su cruz."""
    W, H = 50, 46
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA_CLARA
    _tablones_tapa(p, 0, 0, W, 14, MADERA_CLARA, horizontales=False, sep=W // 3)
    p.rect(0, 14, W, 28, m2)
    p.rect(0, 14, W, 3, m3); p.rect(0, 39, W, 3, m1)          # marco de arriba y de abajo
    p.rect(0, 14, 4, 28, m3); p.rect(W - 4, 14, 4, 28, m1)    # postes (el derecho, en sombra)
    p.lin(4, 38, W - 5, 17, m3, 3)                             # la cruz
    p.lin(5, 38, W - 4, 18, m4)
    for yy in (24, 31):
        p.lin(4, yy, W - 5, yy, m1)
    p.rect(0, 42, W, 4, _osc(m1, 0.8))                         # el pie
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── ESCALERA
def escalera():
    """Una escalera de madera que sube hacia la pared del fondo: peldaños
    con su huella (clara) y su tabica (oscura), y las zancas a los lados."""
    W, H = 65, 68
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    n = 6
    x0, x1 = 10, W - 10
    for i in range(n):
        # De abajo (delante) arriba (al fondo): cada peldaño más arriba.
        yb = H - 6 - i * 10
        p.rect(x0, yb - 6, x1 - x0, 6, m2)                     # tabica
        p.lin(x0, yb - 6, x1 - 1, yb - 6, m1)
        p.rect(x0, yb - 10, x1 - x0, 4, m4)                    # huella
        p.lin(x0, yb - 10, x1 - 1, yb - 10, m3)
    # Las zancas: dos tablas inclinadas a los lados.
    p.poli([(2, H - 1), (10, H - 1), (14, 2), (6, 2)], m2)
    p.poli([(W - 10, H - 1), (W - 2, H - 1), (W - 6, 2), (W - 14, 2)], m1)
    p.lin(3, H - 2, 7, 3, m3)
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── CARBÓN
def carbon():
    """Un montón de carbón de trozos ANGULOSOS (antes: una bola con agujeros)."""
    W, H = 38, 34
    p = P(W, H)
    os_, md, cl, br = (22, 22, 26), (44, 44, 52), (70, 72, 84), (120, 126, 144)
    trozos = [
        [(2, 30), (8, 20), (16, 22), (18, 32)],
        [(14, 32), (18, 20), (28, 18), (32, 30)],
        [(26, 33), (30, 22), (36, 24), (37, 33)],
        [(8, 22), (12, 11), (22, 10), (24, 20), (16, 23)],
        [(20, 20), (24, 9), (32, 12), (31, 21)],
        [(13, 12), (18, 3), (26, 5), (24, 11)],
    ]
    for t in trozos:
        p.poli(t, md, os_)
        # La cara de arriba, más clara (la luz viene de arriba a la izquierda).
        a, b = t[0], t[1]
        p.lin(a[0] + 1, a[1] - 1, b[0] + 1, b[1] + 1, cl)
        p.lin(b[0] + 1, b[1] + 1, t[2][0] - 1, t[2][1] + 1, br)
    p.rect(0, 33, W, 1, (30, 26, 22))
    return p.im


# ─────────────────────────────────────────────────────────────── LEÑA
def pila_lena():
    """Tres troncos tumbados, vistos DE LADO (largos), apilados; solo se ve un
    extremo de cada uno, a la derecha (antes: una pirámide de círculos)."""
    W, H = 86, 52
    p = P(W, H)
    corteza = [(54, 34, 22), (84, 54, 34), (110, 72, 44), (140, 96, 60)]
    madera = [(150, 108, 66), (196, 152, 100), (222, 184, 130)]

    def tronco(x, y, largo, alto):
        p.rect(x, y, largo, alto, corteza[1])
        p.rect(x, y, largo, 2, corteza[3])                     # luz de arriba
        p.rect(x, y + alto - 3, largo, 3, corteza[0])          # sombra de abajo
        for k in range(4):                                     # las vetas de la corteza (rayas)
            xx = x + 6 + k * (largo // 4)
            p.lin(xx, y + 3, xx + 9, y + 3, corteza[2])
            p.lin(xx + 4, y + alto - 5, xx + 14, y + alto - 5, corteza[0])
        # El extremo: un óvalo de madera con UN anillo (no una diana).
        ex = x + largo - 4
        p.elipse(ex - 4, y, ex + 5, y + alto - 1, madera[1], corteza[0])
        p.elipse(ex - 2, y + 2, ex + 3, y + alto - 3, madera[2])
        p.lin(ex - 1, y + alto // 2, ex + 2, y + alto // 2, madera[0])

    tronco(2, 34, 76, 16)                                      # abajo
    tronco(8, 20, 68, 15)                                      # en medio
    tronco(16, 7, 56, 14)                                      # arriba
    p.rect(0, 50, W, 2, (40, 28, 20))
    return p.im


# ─────────────────────────────────────────────────────────────── NASAS
def nasas():
    """Jaulas de pesca de LISTONES (antes: sacos con agujeros), dos abajo y
    una encima, con su cuerda."""
    W, H = 90, 64
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA_CLARA

    def jaula(x, y, w, h):
        p.rect(x, y, w, 8, m3)                                  # la tapa
        p.lin(x + 1, y + 1, x + w - 2, y + 1, m4)
        for xx in range(x + 5, x + w - 2, 7):
            p.lin(xx, y + 1, xx, y + 6, m2)
        p.rect(x, y + 8, w, h - 8, (60, 44, 30))                # el interior, en sombra
        for xx in range(x + 2, x + w - 1, 6):                   # los listones del frente
            p.rect(xx, y + 8, 3, h - 8, m2)
            p.lin(xx, y + 8, xx, y + h - 1, m3)
        p.rect(x, y + 8, w, 2, m1); p.rect(x, y + h - 3, w, 3, m1)
        p.rect(x + w - 3, y + 8, 3, h - 8, _osc(m2, 0.7))

    jaula(2, 30, 42, 32)
    jaula(46, 30, 42, 32)
    jaula(22, 2, 44, 30)
    # La cuerda: una línea que cuelga, sin bolitas.
    cuerda = (196, 170, 120)
    p.lin(20, 30, 30, 40, cuerda); p.lin(30, 40, 40, 34, cuerda)
    _contorno(p)
    return p.im


# ─────────────────────────────────────────────────────────────── RED
def red_pesca():
    """La red RECOGIDA y colgada del tendedero: tela con sus pliegues (antes:
    una malla entera de agujeros)."""
    W, H = 90, 72
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.rect(4, 6, 6, 66, m2); p.rect(W - 10, 6, 6, 66, m1)     # postes
    p.rect(0, 4, W, 6, m3); p.lin(1, 5, W - 2, 5, m4)         # travesaño
    tela, tela_l, tela_o = (128, 120, 86), (156, 148, 108), (92, 86, 60)
    # Cuelga en un arco (dos puntos de amarre), recogida.
    puntos = [(14, 10), (W - 14, 10), (W - 18, 40), (W // 2, 52), (18, 40)]
    p.poli(puntos, tela)
    for k, xx in enumerate(range(22, W - 20, 9)):               # los pliegues, de arriba abajo
        fondo = 40 + int(12 * (1 - abs((xx - W / 2) / (W / 2 - 18))))
        p.lin(xx, 12, xx + (2 if k % 2 else -2), fondo - 2, tela_o if k % 2 else tela_l)
    p.lin(14, 10, W - 14, 10, (196, 170, 120))                  # la cuerda de amarre
    p.lin(18, 40, W // 2, 52, tela_o); p.lin(W // 2, 52, W - 18, 40, tela_o)
    _contorno(p)
    return p.im
