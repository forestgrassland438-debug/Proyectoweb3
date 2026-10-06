# -*- coding: utf-8 -*-
"""
LA ISLA AL DOBLE                                                   (2026-10-05)

    python tools/lands-al-doble.py [suelo_detallado.png]

"Calificando el tamaño, los Tiled de las casas y sus muebles son x1 y los
quiero x2, así mismo la Land; la tienda, el pueblo y la cueva no los toques:
el personaje tiene el tamaño de siempre." La isla se dibujaba con casillas de
32 px y el jugador mide 46 x 102: la isla se veía pequeña a su lado.

QUÉ ESCRIBE (los originales NO se tocan)
  Maps/mapa_lands_x2.json   el mismo mapa (64 x 48 casillas, los mismos gid)
                            con casillas de 64 px; la capa de objetos `puerta`
                            al doble. Es el que carga LandsScene.
  Game/MAPAS/isla_64.png    el tileset al doble, vecino más cercano (es pixel
                            art: así no se emborrona).
  recortadas_lands/         SI se le pasa el suelo detallado a x1 (el que sale
                            de tools/detallar-escena.py lands, 2048 x 1536):
                            ese suelo al doble, troceado con
                            tools/trocear-escena.py. Es lo que se ve.

LA CADENA COMPLETA, si se cambia el mapa de la isla en Tiled
  1. tools/captura-escena.html?escena=lands  -> captura a x1 (Maps/mapa_lands.json)
  2. python tools/detallar-escena.py lands <captura> <detallado.png>
  3. python tools/lands-al-doble.py <detallado.png>
  Y si se regenera isla_32.png (tools/mejorar-tiles-escenas.py), basta con el
  paso 3 sin argumento para rehacer isla_64.png.

LO QUE NO CAMBIA: lo construido en la isla sigue en una rejilla de 32 px
(la parcela mide 64 x 64, como los cuadros del huerto del pueblo), así que la
isla pasa de 64 x 48 a 128 x 96 casillas de construcción. El servidor lleva
a ese tamaño lo que ya estaba construido (ver LA ISLA AL DOBLE en server2.js).
"""
import json
import os
import subprocess
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
ESC = 2
VERSION = '20261006a'


def main(detallado=None):
    ruta_mapa = os.path.join(BIN, 'Maps', 'mapa_lands.json')
    with open(ruta_mapa, encoding='utf-8') as fh:
        m = json.load(fh)
    T = int(m['tilewidth'])
    # El tileset, al doble.
    ts = m['tilesets'][0]
    ruta_ts = os.path.normpath(os.path.join(os.path.dirname(ruta_mapa), ts['image']))
    im = Image.open(ruta_ts).convert('RGBA')
    grande = im.resize((im.width * ESC, im.height * ESC), Image.NEAREST)
    nombre_ts = 'isla_%d' % (T * ESC)
    grande.save(os.path.join(BIN, 'Game', 'MAPAS', nombre_ts + '.png'), optimize=True)
    # El mapa: mismas casillas, de doble tamaño; los objetos, al doble.
    m['tilewidth'] = m['tileheight'] = T * ESC
    ts.update({'name': nombre_ts, 'image': '../Game/MAPAS/%s.png' % nombre_ts,
               'imagewidth': grande.width, 'imageheight': grande.height,
               'tilewidth': T * ESC, 'tileheight': T * ESC})
    for capa in m['layers']:
        if capa.get('type') != 'objectgroup':
            continue
        for o in capa.get('objects', []):
            for k in ('x', 'y', 'width', 'height'):
                if k in o:
                    o[k] = o[k] * ESC
    props = [p for p in m.get('properties', []) if p.get('name') != 'escala']
    props.append({'name': 'escala', 'type': 'int', 'value': ESC})
    m['properties'] = props
    salida = os.path.join(BIN, 'Maps', 'mapa_lands_x2.json')
    with open(salida, 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, separators=(',', ':'))
    print('mapa: %s (%dx%d casillas de %d px = %dx%d px), tileset %s %dx%d' % (
        salida, m['width'], m['height'], T * ESC, m['width'] * T * ESC, m['height'] * T * ESC,
        nombre_ts, grande.width, grande.height))

    if detallado:
        suelo = Image.open(detallado).convert('RGBA')
        esperado = (m['width'] * T, m['height'] * T)
        if suelo.size != esperado:
            raise SystemExit('el suelo detallado mide %dx%d y la isla a x1 %dx%d' % (suelo.size + esperado))
        doble = suelo.resize((suelo.width * ESC, suelo.height * ESC), Image.NEAREST)
        tmp = os.path.join(os.path.dirname(os.path.abspath(detallado)), 'lands_det_x2.png')
        doble.save(tmp)
        destino = os.path.join(BIN, 'recortadas_lands')
        subprocess.check_call([sys.executable, os.path.join(AQUI, 'trocear-escena.py'), tmp, destino, VERSION])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
