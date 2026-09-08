#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MINERALES EN PIEDRA (hierro, cobre, carbon) — generador
=============================================================================

QUE HACE
---------------------------------------------------------------------------
Dibuja tres menas en `Game/newpro/recursos/`:

    piedra_hierro.png
    piedra_cobre.png
    piedra_carbon.png

No son lingotes: son PIEDRAS con la veta dentro, que es como se ve un mineral
antes de fundirlo. El lingote ya existe en el juego (`Game/Source/hierro.png`,
`cobre.png`, 16x9) y es OTRA cosa — el producto del horno.

POR QUE SE GENERAN Y NO SE DIBUJAN A MANO
---------------------------------------------------------------------------
La silueta NO se inventa: se COPIA pixel a pixel de `Game/Source/piedra.png`,
la piedra que el juego ya tiene (13x13). Se lee su canal alfa y su luminancia
y se vuelve a pintar con otra rampa de color. Asi las tres menas tienen
exactamente el mismo contorno, el mismo redondeo y la misma luz que la piedra
del juego — que era el encargo: "casi igual que la imagen de la piedra".

Copiar la luminancia y no el color es lo que hace que funcione: en la piedra
original el brillo va de #d1 arriba a la izquierda (de donde viene la luz en
todo el arte del juego) a #57 abajo a la derecha. Esa escalera se conserva
entera; lo unico que cambia es a que color se traduce cada peldano.

LAS VETAS
---------------------------------------------------------------------------
La mena no es una piedra teñida: es piedra gris CON trozos de metal dentro.
Por eso el cuerpo se queda con el gris de la piedra original (un punto mas
oscuro, para que el metal destaque) y encima se estampan tres o cuatro vetas
del color del mineral, cada una con su brillo arriba y su sombra abajo — los
mismos tres tonos del lingote correspondiente, para que un jugador reconozca
el mineral por el color antes de leer el nombre.

Las posiciones de las vetas estan escritas a mano, no sorteadas: en 13x13 un
pixel de mas o de menos se ve, y una veta que caiga sobre el contorno rompe la
silueta. Cada punto esta elegido para quedar dentro del cuerpo y separado de
los demas.

PALETAS (sacadas de los sprites que ya tiene el juego)
---------------------------------------------------------------------------
    hierro  #cbcbca #b2b2b2 #878787 #7d7c7c #6b6c6c   (Source/hierro.png)
    cobre   #bc8763 #ab7149 #a06945 #915f3e #754b33   (Source/cobre.png)
    carbon  #6b6b76 #4a4a52 #3a3a40 #28282c #0d0d0f   (newpro/recursos/
                                                       carbon_vegetal.png)

El carbon es el caso raro: no lleva veta metalica sino la piedra MISMA en
negro azulado, porque una veta de carbon sobre piedra gris a este tamaño se
leeria como una mancha. Se le deja un reborde gris de roca abajo para que no
parezca una silueta recortada, y unas caras brillantes arriba, que es como se
lee el carbon de verdad: negro con brillo mineral, no negro mate.

USO
---------------------------------------------------------------------------
    python tools/generar-minerales.py  [carpeta bin]

Es idempotente: escribe siempre los mismos bytes. No toca ningun archivo
existente — solo crea los tres PNG nuevos.
=============================================================================
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta Pillow:  pip install pillow")


BIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..')
BIN = os.path.abspath(BIN)

ORIGEN  = os.path.join(BIN, 'Game', 'Source', 'piedra.png')
DESTINO = os.path.join(BIN, 'Game', 'newpro', 'recursos')


def hx(s):
    """'#rrggbb' -> (r, g, b)"""
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# ── Rampas ───────────────────────────────────────────────────────────────────
#
# Cada rampa es una lista de (luminancia_de_la_piedra, color). El pixel se
# traduce interpolando entre los dos peldanos que lo rodean, asi que el
# degradado sigue siendo suave y no se aplana en cuatro bandas.

RAMPA_ROCA = [
    (0x00, hx('#000000')),   # contorno
    (0x30, hx('#3c3c3e')),
    (0x58, hx('#5a5a5d')),
    (0x72, hx('#6f6f73')),
    (0x99, hx('#8e8e93')),
    (0xb5, hx('#a6a6ab')),
    (0xd1, hx('#c0c0c5')),
    (0xff, hx('#d6d6da')),
]

# ROCA OSCURA — la que lleva el hierro.
#
# EL PROBLEMA QUE RESUELVE: la veta de hierro es gris (#cbcbca / #b2b2b2), y
# sobre la roca clara de arriba desaparecia — se veia una piedra normal. El
# cobre no tiene ese problema porque es naranja y contrasta solo.
#
# La solucion no es aclarar la veta (se saldria de la paleta del lingote) sino
# OSCURECER la roca: la misma escalera de luz, bajada un tercio. Asi el metal
# queda claramente por encima del fondo y se lee lo que es — piedra con hierro
# dentro — sin inventarse un color que el juego no tenga.
RAMPA_ROCA_OSCURA = [
    (0x00, hx('#000000')),
    (0x30, hx('#2b2b2d')),
    (0x58, hx('#3d3d41')),
    (0x72, hx('#4c4c51')),
    (0x99, hx('#61616a')),
    (0xb5, hx('#72727c')),
    (0xd1, hx('#85858f')),
    (0xff, hx('#94949e')),
]

# CARBON. El tramo alto sube hasta #8a8a99 a proposito: el carbon de verdad no
# es negro mate, es negro CON BRILLO mineral, y sin ese brillo a 13x13 el
# sprite se lee como una silueta recortada en vez de como una piedra.
RAMPA_CARBON = [
    (0x00, hx('#000000')),
    (0x30, hx('#101014')),
    (0x58, hx('#1e1e24')),
    (0x72, hx('#2c2c34')),
    (0x99, hx('#454550')),
    (0xb5, hx('#5c5c69')),
    (0xd1, hx('#76768a')),
    (0xff, hx('#8a8a99')),
]


def interpolar(rampa, l):
    """Color de la rampa para la luminancia `l` (0..255)."""
    if l <= rampa[0][0]:
        return rampa[0][1]
    for i in range(1, len(rampa)):
        l0, c0 = rampa[i - 1]
        l1, c1 = rampa[i]
        if l <= l1:
            t = 0.0 if l1 == l0 else (l - l0) / float(l1 - l0)
            return tuple(int(round(c0[k] + (c1[k] - c0[k]) * t)) for k in range(3))
    return rampa[-1][1]


# ── Vetas ────────────────────────────────────────────────────────────────────
#
# (x, y, papel) — papel: 'alto' brillo, 'medio' cuerpo, 'bajo' sombra.
# Coordenadas en la rejilla 13x13 de la piedra. Todas caen dentro del cuerpo:
# comprobado contra el alfa del original antes de pintar (ver `pintar`).

VETAS = [
    # veta de arriba a la izquierda, la que recibe la luz
    (3, 3, 'alto'), (4, 3, 'medio'), (3, 4, 'medio'), (4, 4, 'bajo'),
    # veta central
    (7, 5, 'alto'), (8, 5, 'medio'), (7, 6, 'medio'), (8, 6, 'bajo'),
    # veta suelta de abajo
    (4, 8, 'alto'), (5, 8, 'bajo'),
    # chispa de la derecha
    (9, 8, 'medio'),
]

MENAS = {
    'piedra_hierro': {
        'rampa': RAMPA_ROCA_OSCURA,
        'veta': {'alto': hx('#e2e2e1'), 'medio': hx('#cbcbca'), 'bajo': hx('#878787')},
    },
    'piedra_cobre': {
        'rampa': RAMPA_ROCA,
        'veta': {'alto': hx('#bc8763'), 'medio': hx('#ab7149'), 'bajo': hx('#754b33')},
    },
    # El carbon no lleva veta: la piedra entera es la mena (ver cabecera).
    'piedra_carbon': {
        'rampa': RAMPA_CARBON,
        'veta': None,
    },
}


def pintar(nombre, receta, origen):
    ancho, alto = origen.size
    px = origen.load()
    salida = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    spx = salida.load()

    # 1) El cuerpo, con la luz de la piedra original.
    for y in range(alto):
        for x in range(ancho):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            # Luminancia perceptual: la piedra es gris, asi que los tres
            # canales van casi juntos, pero se hace bien por si acaso.
            l = int(round(0.299 * r + 0.587 * g + 0.114 * b))
            spx[x, y] = interpolar(receta['rampa'], l) + (a,)

    # 2) Las vetas, solo donde hay cuerpo y NO hay contorno.
    veta = receta['veta']
    if veta:
        for (x, y, papel) in VETAS:
            if not (0 <= x < ancho and 0 <= y < alto):
                continue
            r, g, b, a = px[x, y]
            if a < 250:
                continue                      # borde blando: se respeta
            l = int(round(0.299 * r + 0.587 * g + 0.114 * b))
            if l < 0x30:
                continue                      # es contorno: no se pisa
            spx[x, y] = veta[papel] + (255,)

    # 3) El carbon: reborde de roca abajo y dos caras brillantes arriba.
    #
    #    El reborde evita que parezca un agujero negro con forma de piedra, y
    #    las caras son el brillo mineral que distingue el carbon de una sombra.
    if nombre == 'piedra_carbon':
        for y in range(alto):
            for x in range(ancho):
                r, g, b, a = px[x, y]
                if a < 250:
                    continue
                l = int(round(0.299 * r + 0.587 * g + 0.114 * b))
                if l < 0x30:
                    continue
                # Ultima fila con cuerpo de cada columna: gris de roca.
                if y + 1 < alto and px[x, y + 1][3] < 250:
                    spx[x, y] = hx('#4e4e58') + (255,)

        # Caras del cristal: donde pega la luz (arriba a la izquierda), como en
        # el resto del arte del juego. Se comprueba que haya cuerpo debajo.
        for (x, y, col) in [(4, 2, '#9a9aab'), (5, 2, '#8a8a99'), (4, 3, '#7c7c8b'),
                            (8, 4, '#8a8a99'), (8, 5, '#6d6d7c')]:
            if 0 <= x < ancho and 0 <= y < alto and px[x, y][3] >= 250:
                lo = int(round(0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2]))
                if lo >= 0x30:
                    spx[x, y] = hx(col) + (255,)

    return salida


def main():
    if not os.path.isfile(ORIGEN):
        sys.exit('No encuentro la piedra original: ' + ORIGEN)
    if not os.path.isdir(DESTINO):
        sys.exit('No encuentro la carpeta de destino: ' + DESTINO)

    origen = Image.open(ORIGEN).convert('RGBA')
    print('Piedra original: %s  %dx%d' % (ORIGEN, origen.size[0], origen.size[1]))

    for nombre, receta in MENAS.items():
        img = pintar(nombre, receta, origen)
        ruta = os.path.join(DESTINO, nombre + '.png')
        img.save(ruta, 'PNG', optimize=True)
        print('  escrito  %-22s %dx%d  %d bytes'
              % (nombre + '.png', img.size[0], img.size[1], os.path.getsize(ruta)))

    print('\nListo. Los tres PNG son nuevos: no se ha tocado ningun archivo del juego.')


if __name__ == '__main__':
    main()
