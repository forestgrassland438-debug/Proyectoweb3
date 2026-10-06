# -*- coding: utf-8 -*-
"""
LOS PERSONAJES DEL PACK, AL SELECTOR, CON SU PESCA              (2026-10-05)

    python tools/instalar-personajes-soulbound.py

"Si en Sprites/Soulbound van los personajes soulbound para cambiar, ¿por qué
solo están los de pesca? ¿Y los otros?" Los once del pack
(Game/newpro/personajes/personaje3..13) estaban hechos para el selector —su
LEEME dice "basta con copiar la carpeta a Game/Sprites/Soulbound/personajeN"—
pero nunca se copiaron. Esto:

  1. copia cada personaje del pack (Perfil y run_1..7 de las 4 direcciones) a
     Game/Sprites/Soulbound/personajeN. gf-soulbound.js los descubre solo
     (sondea personaje1, 2, 3... hasta 3 huecos seguidos: se copian en orden);
  2. pone encima sus fotogramas de pesca (Game/newpro/pesca_anim/personajeN,
     que escribe tools/generar-pesca-anim.py), también para el 1 y el 2;
  3. escribe en gf-pesca.js la tabla PUNTAS (dónde está la punta de la caña en
     cada fotograma) de los trece, sacada de pesca_anim.json.

Lo natural del personaje (andar y estar quieto) son SIEMPRE los run_*.png: los
pescar_*.png solo los carga gf-pesca.js al pescar, así que cambiar de
personaje no lo deja con la caña en la mano.
"""
import io
import json
import os
import re
import shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
PACK = os.path.join(BIN, 'Game', 'newpro', 'personajes')
PESCA = os.path.join(BIN, 'Game', 'newpro', 'pesca_anim')
SOUL = os.path.join(BIN, 'Game', 'Sprites', 'Soulbound')
DIRS = ['abajo', 'arriba', 'derecha', 'izquierda']


def copiar_personaje(n):
    origen = os.path.join(PACK, 'personaje%d' % n)
    destino = os.path.join(SOUL, 'personaje%d' % n)
    if not os.path.isdir(origen):
        return False
    os.makedirs(os.path.join(destino, 'Perfil'), exist_ok=True)
    shutil.copyfile(os.path.join(origen, 'Perfil', 'Perfil.png'), os.path.join(destino, 'Perfil', 'Perfil.png'))
    for d in DIRS:
        os.makedirs(os.path.join(destino, d), exist_ok=True)
        for i in range(1, 8):
            shutil.copyfile(os.path.join(origen, d, 'run_%d.png' % i), os.path.join(destino, d, 'run_%d.png' % i))
    return True


def copiar_pesca(ident):
    origen = os.path.join(PESCA, ident)
    destino = os.path.join(SOUL, ident)
    if not (os.path.isdir(origen) and os.path.isdir(destino)):
        return 0
    n = 0
    for d in DIRS:
        for i in range(1, 7):
            a = os.path.join(origen, d, 'pescar_%d.png' % i)
            if os.path.exists(a):
                shutil.copyfile(a, os.path.join(destino, d, 'pescar_%d.png' % i))
                n += 1
    return n


def escribir_puntas():
    with io.open(os.path.join(PESCA, 'pesca_anim.json'), encoding='utf-8') as fh:
        cat = json.load(fh)
    filas = []
    for p in cat['personajes']:
        pts = p['puntas']
        partes = ', '.join('%s: %s' % (d, json.dumps(pts[d], separators=(', ', ': '))) for d in DIRS)
        filas.append('    %s: { %s }' % (p['id'], partes))
    bloque = '  var PUNTAS = {\n' + ',\n'.join(filas) + '\n  };'
    ruta = os.path.join(BIN, 'gf-pesca.js')
    with io.open(ruta, encoding='utf-8', newline='') as fh:
        s = fh.read()
    nuevo, n = re.subn(r'  var PUNTAS = \{.*?\n  \};', lambda m: bloque, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit('no encuentro la tabla PUNTAS en gf-pesca.js')
    tmp = ruta + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(nuevo)
    os.replace(tmp, ruta)
    return len(filas)


def main():
    nuevos = [n for n in range(3, 14) if copiar_personaje(n)]
    print('personajes copiados al selector:', ', '.join('personaje%d' % n for n in nuevos))
    total = sum(copiar_pesca('personaje%d' % n) for n in range(1, 14))
    print('fotogramas de pesca copiados:', total)
    print('puntas de caña en gf-pesca.js:', escribir_puntas(), 'personajes')


if __name__ == '__main__':
    main()
