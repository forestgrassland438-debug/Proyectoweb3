#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LA ANTORCHA DE LA TIENDA                                         (2026-10-11)
=============================================================================

"Quiero que en la tienda se puedan comprar y vender antorchas que podría
poner en la mina, en el mapa nuevo o en GameScene, que tengan duración y que,
cuando se acaben, se desvanezcan poco a poco. Antorchas iguales a la de la
mina."

Sale de la MISMA antorcha de la mina (Game/MAPAS/Mina/piezas.png, pieza
`antorcha`, 32 x 64): su llama, su paleta, la venda y el mango. Lo que cambia:
  · no va colgada del muro: se le quita la chapa de hierro y el mango baja
    hasta una punta clavada en un montoncito de tierra con dos piedras;
  · la llama SE MUEVE: seis fotogramas con la misma paleta (borde rojo,
    naranja, amarillo y el corazón casi blanco), que se mece más en la punta;
  · `apagada`: la venda chamuscada, sin llama (el final del desvanecido);
  · `humo`: una voluta lisa y transparente que sube al apagarse.
Sin chispas sueltas ni puntos: todo son manchas y trazos.

QUÉ ESCRIBE
  Game/Objetos/antorcha/antorcha.png        el icono del inventario
  Game/Objetos/antorcha/antorcha_suelo.png  atlas: fuego_1..6, apagada, humo
  Game/Objetos/antorcha/antorcha_suelo.json (JSON Hash de Phaser)

Corre con:  python tools/generar-antorchas.py
"""
import json
import math
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
PIEZAS = os.path.join(BIN, 'Game', 'MAPAS', 'Mina', 'piezas.png')
SALIDA = os.path.join(BIN, 'Game', 'Objetos', 'antorcha')

# La paleta de la antorcha de la mina.
BORDE = (0x9a, 0x22, 0x08)
NARANJA = (0xf0, 0x6a, 0x12)
AMARILLO = (0xff, 0xc4, 0x43)
CORAZON = (0xff, 0xf8, 0xd8)
PUNTA = (0xff, 0xe5, 0x8c)
VENDA_OSC = (0x3a, 0x2a, 0x1c)
MANGO = [(0x3d, 0x24, 0x16), (0x62, 0x3b, 0x24), (0x89, 0x57, 0x3a), (0x9d, 0x67, 0x46), (0xc2, 0x8d, 0x68)]
GRISES = {(0x58, 0x5f, 0x67), (0x9b, 0xa3, 0xab), (0x36, 0x3b, 0x41), (0x83, 0x8b, 0x93), (0x46, 0x4c, 0x53),
          (0x28, 0x2c, 0x31), (0x1c, 0x1f, 0x23), (0xd6, 0xdc, 0xe1)}
TIERRA = [(0x5a, 0x3e, 0x28), (0x7a, 0x56, 0x37), (0x96, 0x6d, 0x47)]
PIEDRA = [(0x4e, 0x52, 0x57), (0x74, 0x79, 0x7f), (0x9c, 0xa1, 0xa6)]

ANCHO, ALTO = 32, 80
LLAMA_ALTO = 24          # filas 0..23 la llama; la venda empieza en 24


def cuerpo_de_la_mina():
    """La venda y el mango de la pieza de la mina, sin la chapa del muro."""
    im = Image.open(PIEZAS).convert('RGBA').crop((390, 0, 422, 64))
    px = im.load()
    out = Image.new('RGBA', (32, 64), (0, 0, 0, 0))
    po = out.load()
    for y in range(20, 42):
        for x in range(32):
            p = px[x, y]
            if p[3] and p[:3] not in GRISES:
                po[x, y] = p
    return out


def columnas_del_mango(cuerpo):
    """Las x que ocupa el mango y su color en una fila sin chapa (la 30)."""
    px = cuerpo.load()
    return [(x, px[x, 30]) for x in range(32) if px[x, 30][3]]


def llama(img, fase, oy=0, escala=1.0):
    """Una llama con la paleta de la mina. `fase` la mece (0..2pi)."""
    px = img.load()
    alto = int(round((LLAMA_ALTO - 2 + 2 * math.sin(fase * 2 + 0.6)) * escala))
    base = oy + LLAMA_ALTO          # fila donde empieza la venda
    cx = 16
    for k in range(alto):
        y = base - 1 - k            # de abajo arriba
        t = k / max(1, alto - 1)    # 0 en la base, 1 en la punta
        # Ancho: lleno abajo, se afila arriba (gota).
        semi = 6.6 * (1 - t) ** 0.85 * (0.9 + 0.1 * math.cos(t * 3))
        if t < 0.18:
            semi = 6.6 * (0.78 + t * 1.2)
        # Se mece más cuanto más arriba.
        sway = math.sin(fase + t * 2.6) * 2.2 * t ** 1.3
        x0 = cx + sway - semi
        x1 = cx + sway + semi
        for x in range(int(math.floor(x0)), int(math.ceil(x1)) + 1):
            if not (0 <= x < ANCHO) or not (0 <= y < ALTO):
                continue
            d = abs(x + 0.5 - (cx + sway)) / max(0.6, semi)
            if d > 1.0:
                continue
            # Bandas de fuera adentro; el corazón solo en la mitad de abajo.
            if d > 0.80 or k == alto - 1:
                c = BORDE
            elif d > 0.52 or t > 0.72:
                c = NARANJA
            elif d > 0.24 or t > 0.42:
                c = AMARILLO
            else:
                c = CORAZON
            px[x, y] = c + (255,)
    # Sin píxeles sueltos: la punta que se queda colgando sin vecinos (por el
    # vaivén) se ve como una chispa, un punto. Fuera.
    for _ in range(2):
        for y in range(max(0, base - alto - 1), base):
            for x in range(ANCHO):
                if not px[x, y][3]:
                    continue
                vecinos = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                              if 0 <= x + dx < ANCHO and 0 <= y + dy < ALTO and px[x + dx, y + dy][3])
                if vecinos <= 1 and y < base - 3:
                    px[x, y] = (0, 0, 0, 0)


def palo(img, cuerpo, chamuscada=False):
    """Venda, mango largo, punta y el montón de tierra con dos piedras."""
    px = img.load()
    cpx = cuerpo.load()
    oy = LLAMA_ALTO - 20             # la venda de la mina empieza en su fila 20
    for y in range(20, 34):
        for x in range(32):
            p = cpx[x, y]
            if p[3]:
                c = p[:3]
                if chamuscada and y < 26:
                    # Venda quemada: de su marrón a casi negro.
                    c = tuple(int(v * 0.42) for v in c)
                px[x, y + oy] = c + (255,)
    cols = columnas_del_mango(cuerpo)
    # El mango sigue hasta la fila 70, con la misma veta de la mina.
    for y in range(34 + oy, 70):
        for (x, c) in cols:
            px[x, y] = c
    # La punta (se estrecha en 4 filas).
    xs = [x for x, _ in cols]
    for k, y in enumerate(range(70, 74)):
        quita = k
        for (x, c) in cols:
            if xs[0] + quita <= x <= xs[-1] - quita:
                px[x, y] = c
    # El montón de tierra donde se clava (una loma lisa) y dos piedras.
    for y in range(69, 78):
        for x in range(4, 28):
            dx = (x - 16) / 11.5
            dy = (y - 77) / 7.5
            if dx * dx + dy * dy <= 1.0 and not (px[x, y][3] and y < 72):
                tono = 2 if dy < -0.6 else (1 if dy < -0.15 else 0)
                if dx > 0.45 and tono > 0:
                    tono -= 1                      # la sombra, a la derecha
                px[x, y] = TIERRA[tono] + (255,)
    for (cx, cy, rx, ry) in ((8, 75, 3.2, 2.2), (23, 76, 2.6, 1.8)):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    tono = 2 if (dx < -0.2 and dy < -0.2) else (0 if dx + dy > 0.6 else 1)
                    px[x, y] = PIEDRA[tono] + (255,)
    # El contorno de la tierra y las piedras (1 px, oscuro), solo hacia fuera.
    fuera = (0x2a, 0x1e, 0x14, 255)
    copia = img.copy().load()
    for y in range(66, ALTO):
        for x in range(ANCHO):
            if copia[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < ANCHO and 69 <= yy < ALTO and copia[xx, yy][3] and copia[xx, yy][:3] in [t for t in TIERRA] + [p for p in PIEDRA]:
                    px[x, y] = fuera
                    break


def humo():
    """Una voluta de humo: un trazo grueso en S, gris y medio transparente."""
    im = Image.new('RGBA', (16, 28), (0, 0, 0, 0))
    px = im.load()
    for k in range(26):
        y = 27 - k
        t = k / 25
        x = 8 + math.sin(t * 5.2) * 3.2
        grueso = 2.4 - t * 1.2
        alfa = int(150 * (1 - t) ** 0.8)
        for xx in range(int(x - grueso), int(x + grueso) + 1):
            if 0 <= xx < 16:
                c = (176, 172, 168) if xx < x else (138, 134, 132)
                px[xx, y] = c + (alfa,)
    return im


def main():
    os.makedirs(SALIDA, exist_ok=True)
    cuerpo = cuerpo_de_la_mina()
    frames = []
    for i in range(6):
        im = Image.new('RGBA', (ANCHO, ALTO), (0, 0, 0, 0))
        palo(im, cuerpo)
        llama(im, i * (math.pi * 2 / 6))
        frames.append(('fuego_%d' % (i + 1), im))
    ap = Image.new('RGBA', (ANCHO, ALTO), (0, 0, 0, 0))
    palo(ap, cuerpo, chamuscada=True)
    frames.append(('apagada', ap))
    frames.append(('humo', humo()))

    # El atlas, en una fila, con 2 px de aire.
    ancho = sum(f.width + 2 for _, f in frames)
    hoja = Image.new('RGBA', (ancho, ALTO), (0, 0, 0, 0))
    meta = {}
    x = 0
    for nombre, f in frames:
        hoja.paste(f, (x, 0))
        meta[nombre] = {'frame': {'x': x, 'y': 0, 'w': f.width, 'h': f.height}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': f.width, 'h': f.height},
                        'sourceSize': {'w': f.width, 'h': f.height}}
        x += f.width + 2
    hoja.save(os.path.join(SALIDA, 'antorcha_suelo.png'))
    with open(os.path.join(SALIDA, 'antorcha_suelo.json'), 'w', encoding='utf-8') as fh:
        json.dump({'frames': meta, 'meta': {'image': 'antorcha_suelo.png', 'size': {'w': ancho, 'h': ALTO},
                                            'scale': '1', 'app': 'tools/generar-antorchas.py'}}, fh, indent=1)
    # El icono: la antorcha sin el montón de tierra, recortada.
    icono = frames[0][1].crop((6, 0, 26, 72))
    icono.save(os.path.join(SALIDA, 'antorcha.png'))
    print('antorcha:', len(frames), 'fotogramas ->', SALIDA)


if __name__ == '__main__':
    main()
