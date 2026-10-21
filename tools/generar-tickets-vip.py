#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LOS TICKETS DEL VIP — escribe Game/Source/vip/                    (2026-10-20)
=============================================================================

"Hazle la imagen del ticket": tres tickets (1, 3 y 6 meses) para el panel de
Rosalind the Weaver y la marca del HUD. Pixel art a la medida del juego: un
billete con muescas a los lados, la corona, "VIP" con la fuente del juego
(PressStart2P) y los meses; cada uno con su color (bronce claro, plata y
oro) y una franja lisa (nada de puntos ni tramas).

También la CORONA suelta (vip_corona.png) para la marca del HUD.

USO:  python tools/generar-tickets-vip.py
=============================================================================
"""
import os

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'Game', 'Source', 'vip')
FUENTE = os.path.join(RAIZ, 'fonts', 'PressStart2P-Regular.ttf')

W, H = 120, 64
ESCALA = 2   # se dibuja a 1x y se guarda al doble, con los píxeles nítidos

TICKETS = {
    'ticket_1m': {'meses': '1', 'texto': 'MONTH', 'fondo': ((214, 150, 96), (168, 104, 60)), 'franja': (120, 70, 38)},
    'ticket_3m': {'meses': '3', 'texto': 'MONTHS', 'fondo': ((206, 216, 228), (150, 164, 184)), 'franja': (92, 104, 124)},
    'ticket_6m': {'meses': '6', 'texto': 'MONTHS', 'fondo': ((255, 214, 92), (214, 154, 34)), 'franja': (146, 92, 18)},
}
CONTORNO = (34, 24, 18)


def corona(d, x, y, color=(255, 206, 64), sombra=(176, 116, 22)):
    """Una corona de cinco puntas (polígonos lisos), con su banda."""
    d.polygon([(x, y + 10), (x + 2, y + 2), (x + 6, y + 7), (x + 9, y), (x + 12, y + 7), (x + 16, y + 2), (x + 18, y + 10)],
              fill=color, outline=CONTORNO)
    d.rectangle([x, y + 10, x + 18, y + 13], fill=sombra, outline=CONTORNO)
    d.rectangle([x + 8, y + 10, x + 10, y + 12], fill=(220, 60, 60))      # la piedra de la banda


def ticket(nombre, cfg, fuente_g, fuente_p):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    claro, oscuro = cfg['fondo']
    # El billete: degradado vertical en tres bandas lisas.
    for y in range(4, H - 4):
        t = (y - 4) / float(H - 9)
        c = tuple(int(claro[k] * (1 - t) + oscuro[k] * t) for k in range(3))
        d.line([(4, y), (W - 5, y)], fill=c + (255,))
    # Las muescas de los lados (medio círculo vacío).
    for cx in (4, W - 5):
        d.ellipse([cx - 6, H // 2 - 6, cx + 6, H // 2 + 6], fill=(0, 0, 0, 0))
    # La franja del talón y la línea de corte (rayas, no puntos).
    d.rectangle([W - 30, 4, W - 22, H - 5], fill=cfg['franja'] + (255,))
    for y in range(8, H - 8, 6):
        d.line([(W - 34, y), (W - 34, y + 3)], fill=CONTORNO + (255,))
    # El contorno, siguiendo las muescas.
    d.rectangle([4, 4, W - 5, H - 5], outline=CONTORNO)
    for cx in (4, W - 5):
        d.ellipse([cx - 6, H // 2 - 6, cx + 6, H // 2 + 6], outline=CONTORNO)
        d.rectangle([cx - 6 if cx < W / 2 else cx, H // 2 - 7, cx if cx < W / 2 else cx + 6, H // 2 + 7], fill=(0, 0, 0, 0))
    # Un brillo arriba.
    d.line([(8, 6), (W - 38, 6)], fill=(255, 255, 255, 110))
    corona(d, 12, 10)
    d.text((34, 10), 'VIP', font=fuente_g, fill=(255, 250, 230), stroke_width=1, stroke_fill=CONTORNO)
    d.text((12, 34), cfg['meses'] + ' ' + cfg['texto'], font=fuente_p, fill=(255, 250, 230), stroke_width=1, stroke_fill=CONTORNO)
    d.text((W - 28, 22), 'GF', font=fuente_p, fill=(255, 240, 200), stroke_width=1, stroke_fill=CONTORNO)
    return im.resize((W * ESCALA, H * ESCALA), Image.NEAREST)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    fuente_g = ImageFont.truetype(FUENTE, 16)
    fuente_p = ImageFont.truetype(FUENTE, 8)
    for nombre, cfg in TICKETS.items():
        ticket(nombre, cfg, fuente_g, fuente_p).save(os.path.join(SALIDA, nombre + '.png'), optimize=True)
    c = Image.new('RGBA', (22, 18), (0, 0, 0, 0))
    corona(ImageDraw.Draw(c), 2, 2)
    c.resize((44, 36), Image.NEAREST).save(os.path.join(SALIDA, 'vip_corona.png'), optimize=True)
    print('listo ->', SALIDA)


if __name__ == '__main__':
    main()
