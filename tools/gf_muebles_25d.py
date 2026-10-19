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


# ===========================================================================
# LOS QUE FALTABAN: CASAS MENOS VACÍAS                            (2026-10-19)
# ===========================================================================
# "Hay cosas en las casas que no son 2.5D o no tienen gráficos altamente
# detallados; ordena más todo y agrega más cosas a las casas, se ven muy
# vacías." Muebles nuevos en la misma vista 3/4 (tapa, frente y lado en
# sombra, luz arriba a la izquierda, contorno oscuro), con detalle de oficio:
# aparador con su vajilla, mesa redonda con el juego de té, banco, sacos de
# harina, repisa con tarros, jarrón con flores, perchero con capa, tonel en
# su soporte, mesa de alquimia, banco de carpintero, trofeo de astas, piel en
# el suelo y candelero de pie. SIN AGUJEROS EN RACIMO: vetas, tablas y aros
# son RAYAS; los tarros y platos, pocos y grandes.

TELA_BLANCA = [(150, 140, 126), (196, 188, 172), (226, 220, 206), (244, 240, 230), (252, 250, 244)]
LOZA = [(74, 92, 138), (120, 142, 190), (188, 202, 228), (232, 238, 248)]
ARPILLERA = [(96, 76, 48), (142, 116, 76), (178, 150, 104), (206, 182, 136), (228, 210, 168)]
CRISTAL = {'rojo': [(110, 24, 30), (188, 52, 58), (238, 120, 120)],
           'verde': [(30, 92, 50), (60, 168, 92), (150, 228, 170)],
           'azul': [(32, 58, 120), (70, 118, 210), (160, 196, 246)],
           'morado': [(70, 34, 100), (134, 72, 186), (204, 160, 236)]}


def _patas(p, x0, x1, y, alto, ramp, grosor=3):
    o, m1, m2, m3, m4 = ramp
    p.rect(x0, y, grosor, alto, m2); p.lin(x0, y, x0, y + alto - 1, m3)
    p.rect(x1 - grosor, y, grosor, alto, m1)


def aparador():
    """Aparador: mueble bajo de dos puertas y dos cajones, y encima su
    repisa de atrás con la vajilla (tres platos de pie, una jarra y dos
    tazones)."""
    W, H = 50, 56
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    # La repisa de atrás: tablero con dos baldas.
    p.rect(3, 0, W - 6, 26, m2); p.rect(3, 0, W - 6, 3, m3); p.lin(4, 1, W - 5, 1, m4)
    p.rect(W - 7, 3, 4, 23, _osc(m2, 0.72))
    for yb in (12, 24):
        p.rect(3, yb, W - 6, 2, m4); p.lin(3, yb + 2, W - 4, yb + 2, m1)
    # Tres platos de pie en la balda de arriba (de loza azul y blanca).
    for cx in (12, 25, 38):
        p.elipse(cx - 5, 3, cx + 5, 12, LOZA[3], LOZA[0])
        p.elipse(cx - 3, 5, cx + 3, 10, LOZA[2])
        p.lin(cx - 2, 6, cx + 1, 6, LOZA[1])
    # La jarra y dos tazones abajo.
    p.rect(9, 16, 7, 8, LOZA[2]); p.rect(10, 16, 2, 7, LOZA[3]); p.lin(16, 18, 17, 21, LOZA[1])
    p.rect(9, 15, 7, 2, LOZA[1])
    for cx in (28, 38):
        p.rect(cx - 4, 19, 9, 5, LOZA[2]); p.lin(cx - 4, 19, cx + 4, 19, LOZA[3]); p.lin(cx - 3, 23, cx + 3, 23, LOZA[1])
    # El mueble bajo: tapa, dos cajones y dos puertas.
    _tablones_tapa(p, 0, 26, W, 7, MADERA, horizontales=True, sep=7)
    p.rect(0, 33, W, 19, m2)
    for x0 in (3, W // 2 + 1):
        p.rect(x0, 34, W // 2 - 4, 5, m1); p.rect(x0 + 1, 35, W // 2 - 6, 3, m2)
        p.rect(x0 + W // 4 - 3, 36, 4, 1, (214, 176, 80))           # tirador
        p.rect(x0, 40, W // 2 - 4, 11, m1); p.rect(x0 + 2, 42, W // 2 - 8, 7, m2)
        p.lin(x0 + 2, 42, x0 + W // 2 - 7, 42, m3)
    p.rect(W // 2 - 2, 44, 1, 3, (214, 176, 80)); p.rect(W // 2 + 2, 44, 1, 3, (214, 176, 80))
    p.rect(W - 4, 33, 4, 19, _osc(m2, 0.72))
    p.rect(0, 52, W, 2, m1)
    p.rect(2, 54, 3, 2, o); p.rect(W - 5, 54, 3, 2, o)
    _contorno(p)
    return p.im


def mesa_redonda():
    """Mesa redonda con mantel de encaje (ribete en raya), tetera y dos tazas."""
    W, H = 44, 40
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    t0, t1, t2, t3, t4 = TELA_BLANCA
    # El faldón del mantel cae por delante, con pliegues (rayas verticales).
    p.poli([(2, 14), (W - 3, 14), (W - 1, 30), (0, 30)], t2)
    for xx in range(6, W - 3, 6):
        p.lin(xx, 16, xx - 1, 29, t1)
    p.lin(0, 30, W - 1, 30, t1)
    p.lin(1, 28, W - 2, 28, (176, 150, 112))                      # el ribete de encaje
    # La tapa: el óvalo del mantel.
    p.elipse(1, 2, W - 2, 22, t3, t1)
    p.elipse(4, 4, W - 6, 18, t4)
    p.elipse(6, 6, W - 8, 16, t3)
    # La tetera (cuerpo, tapa, pico y asa) y dos tazas con su plato.
    p.elipse(15, 4, 27, 13, LOZA[2], LOZA[0]); p.elipse(17, 5, 22, 9, LOZA[3])
    p.rect(19, 2, 4, 3, LOZA[1]); p.px(21, 1, LOZA[0])
    p.lin(27, 8, 31, 5, LOZA[1]); p.lin(13, 7, 15, 10, LOZA[0])
    for cx, cy in ((9, 14), (34, 14)):
        p.elipse(cx - 4, cy - 1, cx + 4, cy + 3, LOZA[3], LOZA[1])
        p.rect(cx - 2, cy - 3, 5, 4, LOZA[2]); p.lin(cx - 2, cy - 3, cx + 2, cy - 3, LOZA[3])
    # El pie de la mesa asoma bajo el mantel.
    p.rect(W // 2 - 3, 31, 6, 6, m2); p.lin(W // 2 - 3, 31, W // 2 - 3, 36, m3)
    p.elipse(W // 2 - 9, 35, W // 2 + 9, 39, m1)
    _contorno(p)
    return p.im


def banco():
    """Banco de madera largo: asiento de dos tablas, frente y cuatro patas."""
    W, H = 46, 20
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    _tablones_tapa(p, 0, 0, W, 7, MADERA, horizontales=True, sep=4)
    p.rect(0, 7, W, 4, m2); p.lin(0, 7, W - 1, 7, m3)
    p.rect(W - 3, 7, 3, 4, _osc(m2, 0.7))
    _patas(p, 2, 9, 11, 9, MADERA); _patas(p, W - 9, W - 2, 11, 9, MADERA)
    p.lin(5, 15, W - 6, 15, m1)                                  # el travesaño
    _contorno(p)
    return p.im


def sacos():
    """Tres sacos de arpillera atados (uno abierto con harina), trama en rayas."""
    W, H = 38, 30
    p = P(W, H)
    a0, a1, a2, a3, a4 = ARPILLERA

    def saco(x, y, w, h, abierto=False):
        p.elipse(x, y + 4, x + w, y + h, a2, a0)
        p.rect(x + 2, y + 8, w - 4, h - 12, a2)
        p.elipse(x + 2, y + 6, x + w // 2, y + h - 4, a3)        # la luz de la izquierda
        p.elipse(x + w - 6, y + 8, x + w - 1, y + h - 3, a1)      # la sombra de la derecha
        for yy in range(y + 9, y + h - 2, 3):
            p.lin(x + 3, yy, x + w - 4, yy, a1)                   # la trama: rayas
        if abierto:
            p.elipse(x + 2, y + 2, x + w - 2, y + 9, a1, a0)
            p.elipse(x + 4, y + 3, x + w - 4, y + 7, (246, 242, 232))
        else:
            p.rect(x + w // 2 - 3, y, 6, 6, a2); p.lin(x + w // 2 - 3, y + 4, x + w // 2 + 2, y + 4, a0)
            p.lin(x + w // 2 - 2, y + 1, x + w // 2 + 1, y + 1, a4)

    saco(1, 6, 16, 22)
    saco(20, 4, 16, 24, abierto=True)
    saco(10, 12, 15, 17)
    _contorno(p)
    return p.im


def estante_pared():
    """Repisa de pared: tabla con sus escuadras, tres tarros y un plato."""
    W, H = 40, 22
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.rect(0, 14, W, 3, m3); p.lin(0, 14, W - 1, 14, m4); p.lin(0, 16, W - 1, 16, m1)
    p.poli([(4, 17), (8, 17), (5, 21)], m2); p.poli([(W - 8, 17), (W - 4, 17), (W - 5, 21)], m2)
    colores = [((150, 92, 52), (190, 130, 80)), ((90, 120, 70), (130, 170, 100)), ((168, 140, 90), (210, 186, 130))]
    for i, x in enumerate((3, 12, 21)):
        c0, c1 = colores[i]
        p.rect(x, 5, 7, 9, c0); p.rect(x + 1, 6, 2, 7, c1)
        p.rect(x, 3, 7, 2, (226, 214, 186)); p.lin(x, 5, x + 6, 5, (120, 100, 70))
    p.elipse(29, 3, 38, 13, LOZA[3], LOZA[0]); p.elipse(31, 5, 36, 11, LOZA[2])
    _contorno(p)
    return p.im


def jarron():
    """Jarrón de barro con un ramo de flores (tallos en raya, cuatro flores)."""
    W, H = 16, 28
    p = P(W, H)
    b0, b1, b2, b3 = (110, 52, 30), (164, 84, 48), (198, 116, 70), (226, 156, 102)
    for x, y0 in ((7, 2), (4, 4), (11, 4), (8, 6)):
        p.lin(x, y0 + 3, 8, 14, (62, 120, 52))
    for (x, y), c in zip(((7, 1), (3, 3), (11, 3), (8, 6)), ((232, 80, 90), (246, 210, 80), (240, 140, 180), (250, 246, 236))):
        p.elipse(x - 2, y - 2, x + 2, y + 2, c)
    p.elipse(2, 13, W - 3, 27, b2, b0)
    p.elipse(4, 15, 8, 24, b3)
    p.rect(5, 11, 6, 4, b1); p.lin(5, 11, 10, 11, b3)
    p.elipse(W - 7, 16, W - 4, 25, b1)
    _contorno(p)
    return p.im


def perchero():
    """Perchero de pie: poste, ganchos, una capa verde colgada y un sombrero."""
    W, H = 20, 46
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.rect(9, 4, 3, 38, m2); p.lin(9, 4, 9, 41, m3)
    p.elipse(4, 40, 16, 45, m1); p.lin(5, 41, 15, 41, m3)
    p.lin(4, 8, 9, 10, m2); p.lin(12, 10, 17, 8, m2)
    p.px(10, 3, m4)
    # La capa: cae del gancho izquierdo con pliegues en raya.
    capa = [(30, 70, 46), (52, 106, 70), (78, 140, 96)]
    p.poli([(2, 9), (9, 10), (10, 34), (1, 32)], capa[1])
    for xx in (3, 6):
        p.lin(xx, 12, xx - 1, 31, capa[0])
    p.lin(4, 11, 8, 11, capa[2])
    # El sombrero, en el gancho derecho.
    p.elipse(11, 5, 20, 10, (92, 64, 40)); p.rect(13, 2, 6, 5, (112, 80, 50)); p.lin(13, 5, 18, 5, (150, 40, 40))
    _contorno(p)
    return p.im


def tonel():
    """Tonel grande tumbado en su soporte, con su grifo (los aros, en raya)."""
    W, H = 40, 34
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    # El soporte (dos caballetes).
    for x in (6, W - 10):
        p.poli([(x, 33), (x + 4, 33), (x + 6, 20), (x - 2, 20)], m1)
    p.rect(1, 20, W - 2, 3, m2)
    # El tonel visto de lado: cuerpo con duelas y aros, tapa delante.
    p.elipse(2, 2, W - 10, 26, m3, o)
    p.rect(8, 2, W - 22, 24, m3)
    for yy in (6, 11, 16, 21):
        p.lin(8, yy, W - 15, yy, m2)                                 # duelas
    for xx in (11, W - 18):
        p.rect(xx, 2, 2, 24, HIERRO[2]); p.lin(xx, 2, xx, 25, HIERRO[3])   # aros
    p.elipse(W - 19, 2, W - 3, 26, m2, o)                            # la tapa
    p.elipse(W - 16, 5, W - 6, 23, m3)
    p.lin(W - 11, 5, W - 11, 22, m2)
    p.rect(W - 13, 15, 4, 3, HIERRO[2]); p.rect(W - 12, 18, 2, 3, HIERRO[1])    # el grifo
    p.lin(4, 6, 8, 3, m4)
    _contorno(p)
    return p.im


def mesa_alquimia():
    """Mesa de alquimia: tablero con tres frascos de colores, el mortero y su
    mano, y un libro de recetas abierto; frente con cajón."""
    W, H = 48, 38
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    _tablones_tapa(p, 0, 12, W, 9, MADERA, horizontales=True, sep=4)
    p.rect(0, 21, W, 9, m2); p.rect(4, 22, W - 8, 6, m1); p.rect(6, 23, W - 12, 4, m2)
    p.rect(W // 2 - 2, 24, 4, 2, (214, 176, 80))
    p.rect(W - 4, 21, 4, 9, _osc(m2, 0.72))
    _patas(p, 1, 6, 30, 8, MADERA); _patas(p, W - 6, W - 1, 30, 8, MADERA)
    # Los frascos.
    for x, col, alto in ((4, 'rojo', 12), (11, 'verde', 9), (17, 'azul', 14)):
        c0, c1, c2 = CRISTAL[col]
        p.elipse(x, 16 - 4, x + 6, 17, c1, c0)
        p.rect(x + 2, 16 - alto, 2, alto - 4, (210, 226, 236)); p.rect(x + 1, 16 - alto - 1, 4, 2, (150, 110, 70))
        p.lin(x + 1, 14, x + 2, 13, c2)
    # El mortero con su mano.
    p.elipse(25, 9, 34, 17, (150, 150, 158), (70, 70, 80)); p.elipse(27, 10, 32, 13, (90, 90, 100))
    p.lin(31, 11, 35, 4, (196, 196, 204)); p.lin(32, 11, 36, 4, (120, 120, 130))
    # El libro abierto.
    p.rect(36, 12, 11, 6, (236, 226, 200)); p.lin(41, 12, 41, 17, (150, 120, 90))
    p.lin(37, 14, 40, 14, (150, 140, 120)); p.lin(42, 14, 45, 14, (150, 140, 120))
    _contorno(p)
    return p.im


def banco_trabajo():
    """Banco de carpintero: tablero grueso de tablas, tornillo de banco a la
    izquierda, sierra y martillo encima, tablones apoyados y su balda."""
    W, H = 54, 36
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA_CLARA
    _tablones_tapa(p, 0, 8, W, 10, MADERA_CLARA, horizontales=True, sep=3)
    p.rect(0, 18, W, 5, m2); p.lin(0, 18, W - 1, 18, m3)
    p.rect(W - 4, 18, 4, 5, _osc(m2, 0.72))
    _patas(p, 2, 8, 23, 13, MADERA_CLARA, 4); _patas(p, W - 8, W - 2, 23, 13, MADERA_CLARA, 4)
    p.rect(4, 29, W - 8, 3, m1); p.lin(4, 29, W - 5, 29, m3)                  # la balda
    p.rect(12, 26, 14, 3, m3); p.rect(28, 26, 10, 3, m4)                       # tablones guardados
    # El tornillo de banco.
    p.rect(0, 5, 8, 6, HIERRO[2]); p.rect(1, 5, 6, 2, HIERRO[3]); p.lin(-1, 9, 9, 9, HIERRO[1])
    # La sierra (hoja con dientes en RAYA, no en puntos) y el martillo.
    p.poli([(14, 6), (34, 4), (34, 9), (14, 9)], HIERRO[3]); p.lin(14, 9, 34, 9, HIERRO[1])
    p.rect(34, 3, 6, 6, (140, 86, 50)); p.rect(35, 4, 4, 4, (176, 112, 66))
    p.rect(42, 10, 10, 2, m1); p.rect(48, 7, 4, 7, HIERRO[2]); p.lin(48, 7, 51, 7, HIERRO[3])
    _contorno(p)
    return p.im


def astas():
    """Trofeo de pared: escudo de madera con unas astas (ramas en línea)."""
    W, H = 34, 24
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    p.poli([(11, 12), (23, 12), (21, 23), (13, 23)], m2); p.lin(12, 13, 22, 13, m3)
    p.rect(15, 14, 4, 6, m1)
    hueso = [(150, 130, 100), (206, 188, 150), (232, 218, 186)]
    for sg in (-1, 1):
        cx = 17 + sg * 2
        tronco = [(cx, 13), (cx + sg * 6, 8), (cx + sg * 11, 4), (cx + sg * 15, 1)]
        for (x0, y0), (x1, y1) in zip(tronco, tronco[1:]):
            p.lin(x0, y0, x1, y1, hueso[1], 2)
        for (x0, y0), (x1, y1) in (((cx + sg * 6, 8), (cx + sg * 6, 2)), ((cx + sg * 11, 4), (cx + sg * 13, 0)), ((cx + sg * 9, 6), (cx + sg * 15, 6))):
            p.lin(x0, y0, x1, y1, hueso[2])
    _contorno(p)
    return p.im


def piel_suelo():
    """Piel de animal tendida en el suelo: la silueta con sus cuatro patas y
    el pelo en bandas lisas (sin motas)."""
    W, H = 50, 30
    p = P(W, H)
    pelo = [(92, 60, 36), (128, 88, 54), (162, 118, 74), (190, 150, 100)]
    p.poli([(8, 6), (16, 9), (34, 9), (42, 6), (48, 2), (46, 10), (40, 13), (42, 18), (48, 27), (40, 24),
            (34, 21), (16, 21), (10, 24), (2, 27), (8, 18), (10, 13), (4, 10), (2, 2)], pelo[1])
    p.elipse(12, 10, W - 12, 21, pelo[2])
    p.elipse(17, 12, W - 17, 19, pelo[3])
    for xx in range(15, W - 14, 5):
        p.lin(xx, 11, xx + 1, 19, pelo[2])
    _contorno(p)
    return p.im


def lampara_pie():
    """Candelero de pie de hierro: base de tres patas, vara y la vela arriba
    (la llama la pone el juego, 'vela' con fx 6 fy 3)."""
    W, H = 12, 40
    p = P(W, H)
    o, f1, f2, f3, f4 = HIERRO
    p.poli([(1, 39), (6, 33), (11, 39)], f2); p.lin(6, 33, 6, 39, f1)
    p.rect(5, 10, 2, 24, f2); p.lin(5, 10, 5, 33, f3)
    p.rect(2, 9, 8, 2, f3); p.lin(2, 9, 9, 9, f4)
    p.rect(4, 3, 4, 6, (238, 226, 194)); p.lin(5, 4, 5, 8, (255, 248, 226))
    p.px(6, 2, (60, 40, 30))
    _contorno(p)
    return p.im


def cama(manta):
    """CAMA en 3/4 de verdad (2026-10-19; antes era casi plana: la colcha a
    cuadros vista desde arriba). Cabecero tallado con sus dos postes y su
    pomo, colchón con su CANTO delante, almohada con volumen, la manta con el
    embozo, dos pliegues en sombra y el dobladillo, la caída del lado en
    sombra y el piecero. Mismo tamaño que la de antes: las salas no se mueven."""
    W, H = 52, 78
    p = P(W, H)
    o, m1, m2, m3, m4 = MADERA
    t0, t1, t2, t3, t4 = TELA_BLANCA
    def esc(c, k):
        return _osc(c, k)
    mc, ml, mo, mh = manta, esc(manta, 1.2), esc(manta, 0.72), esc(manta, 0.55)
    # El cabecero: panel con el arco arriba, tallado, y dos postes con pomo.
    p.rect(3, 4, W - 6, 15, m2)
    p.elipse(6, 0, W - 7, 10, m3); p.rect(6, 5, W - 13, 5, m3)
    p.lin(9, 2, W - 10, 2, m4)
    for x0 in (8, 20, 32):
        p.rect(x0, 8, 10, 8, m1); p.rect(x0 + 1, 9, 8, 6, m2); p.lin(x0 + 1, 9, x0 + 8, 9, m3)
    for x in (0, W - 5):
        p.rect(x, 3, 5, 22, m2); p.lin(x, 3, x, 24, m3)
        p.elipse(x - 1, 0, x + 5, 5, m3); p.px(x + 1, 1, m4)
    # El colchón, con su canto delante.
    p.rect(4, 18, W - 8, 52, t2)
    p.rect(4, 66, W - 8, 5, t1); p.lin(4, 66, W - 5, 66, t2)
    # La almohada, con volumen.
    p.elipse(8, 19, W - 9, 33, t3, t1)
    p.elipse(10, 20, W - 18, 28, t4)
    p.lin(14, 30, W - 14, 30, t1)
    # La manta: el embozo blanco, la manta, dos pliegues y el dobladillo.
    p.rect(4, 35, W - 8, 32, mc)
    p.rect(4, 35, W - 8, 4, t3); p.lin(4, 38, W - 5, 38, t1)
    p.lin(4, 39, W - 5, 39, ml)
    for yy, xx in ((47, 6), (56, 10)):
        p.lin(xx, yy, W - 12, yy + 1, mo); p.lin(xx, yy - 1, W - 13, yy, ml)
    p.rect(4, 62, W - 8, 3, mo); p.lin(4, 62, W - 5, 62, ml)            # el dobladillo
    p.rect(W - 10, 39, 6, 28, mo); p.lin(W - 10, 39, W - 10, 66, mh)    # la caída del lado
    # El piecero.
    p.rect(0, 68, W, 8, m2); p.rect(2, 69, W - 4, 2, m4); p.rect(2, 72, W - 4, 3, m3)
    for x in (0, W - 5):
        p.rect(x, 62, 5, 16, m1); p.lin(x, 62, x, 77, m2)
    _contorno(p)
    return p.im
