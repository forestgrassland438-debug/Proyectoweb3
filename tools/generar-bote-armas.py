#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL BOTE, EL ARCO Y EL BASTÓN DE MAGO                             (2026-10-21)
=============================================================================

"Quiero en la tienda poder comprar o vender un bote 2.5D (su tabla de
creación automática) que pueda poner en cualquier agua, subirme, pescar desde
él y recogerlo con la pala; y mete un arco y un bastón de mago también."

Pixel art como el resto de objetos del juego (Game/Objetos/armas/espada_*.png):
contorno oscuro de 1 px, dos o tres tonos y nada de puntos ni motas.

Sale:
  Game/Objetos/armas/arco.png, baston_mago.png       20x20, en diagonal (como
                                                     las espadas: el tajo las gira)
  Game/Objetos/bote/bote.png                         24x24, el icono de la bolsa
  Game/Objetos/bote/bote_mundo.png + .json           el bote en el agua, en dos
       vistas (h: de lado, proa a la derecha; v: de frente, proa arriba) y dos
       capas cada una (atras: el fondo y la borda lejana, debajo del remero;
       delante: el costado cercano, encima: así el remero va SENTADO dentro)

USO:  python tools/generar-bote-armas.py
=============================================================================
"""
import json
import math
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ARMAS = os.path.join(RAIZ, 'Game', 'Objetos', 'armas')
BOTE = os.path.join(RAIZ, 'Game', 'Objetos', 'bote')

CONTORNO = (34, 22, 14, 255)


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Lienzo(object):
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = {}

    def set(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = c

    def get(self, x, y):
        return self.px.get((x, y))

    def contornear(self, color=CONTORNO, diagonales=False):
        """Un píxel de contorno alrededor de todo lo pintado."""
        vec = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diagonales:
            vec += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        borde = set()
        for (x, y) in list(self.px):
            for dx, dy in vec:
                q = (x + dx, y + dy)
                if q not in self.px and 0 <= q[0] < self.w and 0 <= q[1] < self.h:
                    borde.add(q)
        for q in borde:
            self.px[q] = color

    def imagen(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        p = im.load()
        for (x, y), c in self.px.items():
            p[x, y] = c
        return im


def linea_gruesa(li, x0, y0, x1, y1, color_fn, grosor=2):
    """Una línea de `grosor` px; color_fn(t, lado) -> color (t a lo largo)."""
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L                     # la normal (hacia arriba-izquierda)
    for i in range(n + 1):
        t = i / float(n)
        cx, cy = x0 + dx * t, y0 + dy * t
        for k in range(grosor):
            off = k - (grosor - 1) / 2.0
            li.set(cx + nx * off, cy + ny * off, color_fn(t, off))


# ===========================================================================
# EL ARCO (20x20, en diagonal: las puntas abajo-izquierda y arriba-derecha)
# ===========================================================================
def arco():
    li = Lienzo(20, 20)
    madera = [hx('#e0a868'), hx('#b0763c'), hx('#7a4a22')]
    # La pala del arco: un arco de círculo que se abomba hacia arriba-izquierda.
    cx, cy, r = 16.0, 16.0, 13.5
    for i in range(0, 91):
        a = math.radians(180 + i)               # de 180° a 270°: izquierda -> arriba
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        # El grosor: más en el centro (la empuñadura), fino en las puntas.
        g = 2 if 10 < i < 80 else 1
        for k in range(g):
            rr = r - k
            li.set(cx + math.cos(a) * rr, cy + math.sin(a) * rr, madera[0] if k == 0 else madera[1])
    # La empuñadura envuelta (en medio de la pala).
    for i in range(38, 53):
        a = math.radians(180 + i)
        for k in range(2):
            rr = r - k
            li.set(cx + math.cos(a) * rr, cy + math.sin(a) * rr, hx('#8a2f2a') if k == 0 else hx('#5e1e1c'))
    # La cuerda: recta de punta a punta.
    p0 = (cx + math.cos(math.radians(180)) * r, cy)
    p1 = (cx, cy + math.sin(math.radians(270)) * r)
    linea_gruesa(li, p0[0] + 1, p0[1], p1[0], p1[1] + 1, lambda t, o: hx('#efe9da'), 1)
    li.contornear()
    return li.imagen()


# ===========================================================================
# EL BASTÓN DE MAGO (20x20, en diagonal, el cristal arriba a la derecha)
# ===========================================================================
def baston():
    li = Lienzo(20, 20)
    madera = [hx('#c48a50'), hx('#8a5a2a'), hx('#5c3a1c')]
    linea_gruesa(li, 2.5, 17.5, 13, 7, lambda t, o: madera[0] if o < 0 else madera[1], 2)
    # El anillo de metal bajo el cristal.
    for (x, y) in ((12, 9), (13, 8), (11, 8), (12, 7)):
        li.set(x, y, hx('#d9b44a'))
    # El cristal: un rombo con su luz (sin puntos sueltos).
    cristal = {(15, 3): 0, (14, 4): 0, (15, 4): 1, (16, 4): 1, (13, 5): 0, (14, 5): 1, (15, 5): 1,
               (16, 5): 2, (17, 5): 2, (14, 6): 1, (15, 6): 2, (16, 6): 2, (15, 7): 2}
    tonos = [hx('#e8d4ff'), hx('#a874f0'), hx('#6a34b8')]
    for (x, y), k in cristal.items():
        li.set(x, y, tonos[k])
    li.contornear()
    return li.imagen()


# ===========================================================================
# EL BOTE
# ===========================================================================
MADERA = {'borda': hx('#d8a468'), 'borda2': hx('#b67e44'), 'fondo': hx('#6e4628'), 'fondo2': hx('#5a381e'),
          'costado': hx('#a2703c'), 'costado2': hx('#86582c'), 'junta': hx('#6a4220'), 'banco': hx('#c08a52'),
          'banco2': hx('#93622f'), 'remo': hx('#cfa266'), 'remo2': hx('#8a5a2c')}


def medio_alto(x, cx, rx, ry, proa_x):
    """La mitad del alto del casco en x (popa redonda, proa en punta)."""
    u = (x - cx) / rx
    if abs(u) >= 1:
        return 0.0
    h = ry * math.sqrt(1 - u * u)
    if x > proa_x:                               # la proa se afila
        k = (x - proa_x) / (cx + rx - proa_x)
        h *= max(0.12, 1 - k * 0.85)
    return h


def bote_lado():
    """De lado (proa a la derecha). Devuelve (atras, delante) de 80x40."""
    W, H = 80, 40
    cx, cy, rx, ry = 38.5, 15.0, 36.0, 9.0
    proa = 56.0
    COST = 9                                     # el alto del costado que se ve
    atras, delante = Lienzo(W, H), Lienzo(W, H)
    for x in range(W):
        h = medio_alto(x + 0.5, cx, rx, ry, proa)
        if h <= 0.6:
            continue
        top, bot = cy - h, cy + h
        hi = medio_alto(x + 0.5, cx, rx - 3, ry - 2.6, proa)
        for y in range(int(math.floor(top)), int(math.ceil(bot)) + 1):
            dentro = hi > 0.6 and (cy - hi) <= y <= (cy + hi)
            if dentro:
                # El fondo, con las tablas (rayas a lo largo, sin puntos).
                c = MADERA['fondo2'] if (y - int(cy)) % 3 == 0 else MADERA['fondo']
                atras.set(x, y, c)
            else:
                # La borda: clara arriba, más oscura en la mitad de cerca.
                if y < cy:
                    atras.set(x, y, MADERA['borda'])
                else:
                    delante.set(x, y, MADERA['borda2'])
        # El costado de cerca: de la borda baja hacia el agua, con sus juntas.
        alto_c = COST * (0.55 + 0.45 * min(1.0, h / ry))
        for k in range(1, int(round(alto_c)) + 1):
            y = int(round(bot)) + k
            c = MADERA['junta'] if k in (3, 6) else (MADERA['costado'] if k < alto_c * 0.6 else MADERA['costado2'])
            delante.set(x, y, c)
    # Los dos bancos (tablas de través).
    for bx in (26, 45):
        for y in range(int(cy - ry + 3), int(cy + ry - 1)):
            if atras.get(bx, y) in (MADERA['fondo'], MADERA['fondo2']):
                atras.set(bx, y, MADERA['banco'])
                atras.set(bx + 1, y, MADERA['banco'])
                atras.set(bx + 2, y, MADERA['banco2'])
    # Un remo apoyado (de borda a borda, en diagonal suave): una línea seguida.
    for i in range(30):
        x, y = 30 + i, 9 + i * 0.18
        if atras.get(int(x), int(round(y))) is not None:
            atras.set(x, y, MADERA['remo'])
            atras.set(x, y + 1, MADERA['remo2'])
    # El contorno, de la silueta entera (las dos capas juntas) y repartido.
    todo = Lienzo(W, H)
    todo.px = dict(atras.px)
    todo.px.update(delante.px)
    borde = set()
    for (x, y) in list(todo.px):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in todo.px and 0 <= q[0] < W and 0 <= q[1] < H:
                borde.add(q)
    for (x, y) in borde:
        (delante if y >= cy else atras).set(x, y, CONTORNO)
    # Entre el fondo y la borda de cerca, una línea oscura (el canto interior).
    for x in range(W):
        for y in range(H):
            if atras.get(x, y) in (MADERA['fondo'], MADERA['fondo2'], MADERA['banco'], MADERA['banco2']) and \
               delante.get(x, y + 1) == MADERA['borda2']:
                delante.set(x, y + 1, MADERA['junta'])
                break
    return atras, delante


def bote_frente():
    """De frente (proa arriba, se ve la popa). Devuelve (atras, delante) de 44x60."""
    W, H = 44, 60
    cx, cy, rx, ry = 21.5, 24.0, 15.0, 22.0
    COST = 8
    atras, delante = Lienzo(W, H), Lienzo(W, H)
    for y in range(H):
        u = (y + 0.5 - cy) / ry
        if abs(u) >= 1:
            continue
        w = rx * math.sqrt(1 - u * u)
        if y + 0.5 < cy - ry * 0.35:             # la proa (arriba) se afila
            k = (cy - ry * 0.35 - y) / (ry * 0.65)
            w *= max(0.15, 1 - k * 0.8)
        wi = w - 3
        for x in range(int(math.floor(cx - w)), int(math.ceil(cx + w)) + 1):
            dentro = wi > 0.6 and abs(x + 0.5 - cx) <= wi and (cy - ry + 3) <= y <= (cy + ry - 3)
            if dentro:
                c = MADERA['fondo2'] if (x - int(cx)) % 3 == 0 else MADERA['fondo']
                atras.set(x, y, c)
            else:
                (delante if y >= cy + ry - 4 else atras).set(x, y, MADERA['borda'] if x < cx else MADERA['borda2'])
    # La popa de cerca: el costado que se ve por debajo de la borda.
    for x in range(W):
        ys = [y for (xx, y) in list(atras.px) + list(delante.px) if xx == x]
        if not ys:
            continue
        yb = max(ys)
        for k in range(1, COST + 1):
            c = MADERA['junta'] if k in (3, 6) else (MADERA['costado'] if k < COST * 0.6 else MADERA['costado2'])
            delante.set(x, yb + k, c)
    for by in (16, 30):
        for x in range(W):
            if atras.get(x, by) in (MADERA['fondo'], MADERA['fondo2']):
                atras.set(x, by, MADERA['banco'])
                atras.set(x, by + 1, MADERA['banco'])
                atras.set(x, by + 2, MADERA['banco2'])
    todo = Lienzo(W, H)
    todo.px = dict(atras.px)
    todo.px.update(delante.px)
    for (x, y) in list(todo.px):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in todo.px and 0 <= q[0] < W and 0 <= q[1] < H:
                (delante if y >= cy + ry - 4 else atras).set(q[0], q[1], CONTORNO)
    return atras, delante


def icono_bote():
    """El icono de la bolsa (24x24): el bote de lado, reducido a mano."""
    li = Lienzo(24, 24)
    # El remo, detrás (en diagonal, de una pieza).
    for i in range(15):
        li.set(5 + i * 0.85, 4 + i * 0.6, MADERA['remo'])
        li.set(5 + i * 0.85, 5 + i * 0.6, MADERA['remo2'])
    # El casco de lado: la borda arriba (que sube un poco en los extremos) y la
    # quilla curvada (las puntas suben: es un bote, no una caja).
    for x in range(1, 23):
        u = (x + 0.5 - 11.5) / 10.5
        if abs(u) >= 1:
            continue
        borda = 11 - 2.2 * u * u
        quilla = 19 - 6.5 * u * u
        if x > 17:                               # la proa, en punta
            quilla -= (x - 17) * 0.6
        for y in range(int(round(borda)), int(round(quilla)) + 1):
            k = y - borda
            if k < 1.2:
                c = MADERA['borda']
            elif int(round(k)) in (3, 6):
                c = MADERA['junta']
            else:
                c = MADERA['costado'] if k < 4 else MADERA['costado2']
            li.set(x, y, c)
    li.contornear()
    return li.imagen()


def recortar_juntos(a, b):
    """Las dos capas al mismo recorte (para que coincidan al pegarlas)."""
    ia, ib = a.imagen(), b.imagen()
    caja = None
    for im in (ia, ib):
        bb = im.getbbox()
        if bb:
            caja = bb if caja is None else (min(caja[0], bb[0]), min(caja[1], bb[1]), max(caja[2], bb[2]), max(caja[3], bb[3]))
    return ia.crop(caja), ib.crop(caja)


def main():
    os.makedirs(ARMAS, exist_ok=True)
    os.makedirs(BOTE, exist_ok=True)
    arco().save(os.path.join(ARMAS, 'arco.png'))
    baston().save(os.path.join(ARMAS, 'baston_mago.png'))
    icono_bote().save(os.path.join(BOTE, 'bote.png'))
    h_atras, h_delante = recortar_juntos(*bote_lado())
    v_atras, v_delante = recortar_juntos(*bote_frente())
    piezas = [('h_atras', h_atras), ('h_delante', h_delante), ('v_atras', v_atras), ('v_delante', v_delante)]
    W = sum(p.size[0] + 2 for _, p in piezas)
    H = max(p.size[1] for _, p in piezas)
    hoja = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-bote-armas.py', 'image': 'bote_mundo.png', 'format': 'RGBA8888', 'scale': '1'}}
    x = 0
    for nombre, p in piezas:
        hoja.paste(p, (x, 0))
        datos['frames'][nombre] = {'frame': {'x': x, 'y': 0, 'w': p.size[0], 'h': p.size[1]}, 'rotated': False, 'trimmed': False,
                                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': p.size[0], 'h': p.size[1]},
                                   'sourceSize': {'w': p.size[0], 'h': p.size[1]}}
        x += p.size[0] + 2
    hoja.save(os.path.join(BOTE, 'bote_mundo.png'), optimize=True)
    with open(os.path.join(BOTE, 'bote_mundo.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, indent=1)
    print('listo: arco, baston_mago, bote (icono y mundo)')


if __name__ == '__main__':
    main()
