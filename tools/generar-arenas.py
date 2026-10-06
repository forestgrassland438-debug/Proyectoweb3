#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GENERAR ARENAS — el tileset de las batallas y sus mapas para Tiled
=============================================================================

Uso (desde bin/):

    python tools/generar-arenas.py              # todo: tileset + mapas + motor
    python tools/generar-arenas.py --retocar Maps/arena_pradera.json
                                                # rehace muros, tapas y matas de
                                                # un mapa EDITADO en Tiled

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/MAPAS/arena_32.png    la hoja A: 16x16 casillas de 32 px (512x512)
    Game/MAPAS/arena_32.tsx    el tileset para Tiled, con sus pinceles de
                               terreno (Wang) y las propiedades de cada pieza
    Game/MAPAS/arena_32_b.png  la hoja B (nieve y cañon), mismo formato, y
    Game/MAPAS/arena_32_b.tsx  su tileset. Cada arena usa UNA sola hoja.
    Maps/arena_<id>.json       un mapa de Tiled por arena (tileset incrustado,
                               que es lo unico que entiende Phaser)
    gf-brawl-motor.js          el bloque ARENAS (entre <<ARENAS>> y <</ARENAS>>):
                               la rejilla de choques que usa el servidor

LA HOJA (indice = fila * 16 + columna)
---------------------------------------------------------------------------
    fila 0   hierba x4, hierba con flores x2, con piedras x2, tierra x4, arena x4
    fila 1   transicion hierba / tierra   (16, Wang de esquinas)
    fila 2   transicion hierba / agua
    fila 3   transicion hierba / losa
    fila 4   muro de piedra     (16, segun vecinos N E S O)
    fila 5   seto
    fila 6   empalizada
    fila 7   arbusto (hierba alta: esconde, no choca)
    fila 8   tapas: piedra x4, seto x4, empalizada x4, arbusto x4 (segun E/O)
    fila 9   transicion arena / agua
    fila 10  transicion hierba / arena
    fila 11  decoracion: flores x4, piedras x2, matas x2, setas x2, hojas x2,
             grietas x2, nenufares x2
    fila 12  caja x3 (entera, astillada, rota), caja dorada x2, hueso,
             base de aparicion, roca en el agua, tocon, charco, barril x3
             (entero, tocado, quemado), comedero, carne
    fila 13  transicion losa / agua
    fila 14  losa x3 y agua x3 (variantes)
    fila 15  puentes de dos de ancho: N-S (mitad izq. x3, dcha. x3) y
             O-E (mitad de arriba x3, de abajo x3), cada uno arranque/tramo/final

LA HOJA B (nieve y cañon, 2026-10-02)
---------------------------------------------------------------------------
    fila 0   nieve x4, arena roja x4, tierra roja x4, nieve con brillos x2,
             dunas x2
    fila 1   transicion nieve / agua fria       fila 2   nieve / hielo
    fila 3   transicion arena roja / agua       fila 10  arena roja / tierra roja
    fila 4   muro de hielo   fila 5  roca nevada   fila 6  roca roja (meseta)
    fila 7   pino nevado (esconde)               fila 9  matorral seco (esconde)
    fila 8   tapas: hielo x4, roca nevada x4, roca roja x4, pino nevado x4
    fila 11  decoracion de nieve y desierto
    fila 12  lo MISMO que en la A en las columnas 0-6 y 10-14 (cajas, hueso,
             base, barriles, comedero, carne): el cliente los busca ahi
    fila 13  tapas del matorral x4, agua fria x3, hielo x3, agua x3
    fila 15  puentes (los de la A)

LA ORDEN DE LAS 16 PIEZAS DE UNA TRANSICION
---------------------------------------------------------------------------
    i = NO*8 + NE*4 + SO*2 + SE*1     (1 = terreno B en esa esquina)

La de los muros y matas:   i = N*8 + E*4 + S*2 + O*1   (1 = hay vecino igual)
La de las tapas:           i = E*2 + O*1

DIBUJAR CON TIRADA REPRODUCIBLE
---------------------------------------------------------------------------
Todo el azar sale de `rng_de(nombre)` (SHA-256), igual que en el resto de
generadores: volver a ejecutar esto escribe exactamente los mismos bytes.
"""

import json
import os
import re
import sys
import xml.sax.saxutils as sx

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import gf_arte as A                      # noqa: E402
import gf_arena_arte as R                # noqa: E402
import gf_arena_arte_b as B              # noqa: E402

BIN = os.path.dirname(AQUI)
T = R.T
COLS = 16
FILAS = 16
RUTA_PNG = os.path.join(BIN, 'Game', 'MAPAS', 'arena_32.png')
RUTA_TSX = os.path.join(BIN, 'Game', 'MAPAS', 'arena_32.tsx')
RUTA_MOTOR = os.path.join(BIN, 'gf-brawl-motor.js')
NOMBRE_TILESET = 'arena_32'

# Las dos hojas. Cada arena dice cual usa (clave 'hoja' de su diseño).
HOJAS = {
    'a': {'nombre': 'arena_32', 'png': RUTA_PNG, 'tsx': RUTA_TSX},
    'b': {'nombre': 'arena_32_b',
          'png': os.path.join(BIN, 'Game', 'MAPAS', 'arena_32_b.png'),
          'tsx': os.path.join(BIN, 'Game', 'MAPAS', 'arena_32_b.tsx')},
}
HOJA = 'a'
_HECHAS = {}

# ===========================================================================
# CATALOGO
# ===========================================================================

CAT = {}            # nombre -> indice
PROPS = {}          # indice -> {prop: valor}
IMAGENES = {}       # indice -> Image


def poner(fila, col, nombre, im, **props):
    i = fila * COLS + col
    assert i not in IMAGENES, 'casilla repetida: %s (%d)' % (nombre, i)
    CAT[nombre] = i
    IMAGENES[i] = im
    p = {'nombre': nombre}
    p.update(props)
    PROPS[i] = p


def bits_esquinas(i):
    """(NO, NE, SO, SE) de la pieza i de una transicion."""
    return (i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1


def bits_vecinos(i):
    """(N, E, S, O) de la pieza i de un muro o mata."""
    return (i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1


# Juegos de transicion: id -> (fila, terreno A, terreno B, estilo)
TRANSICIONES_A = {
    'hierba_tierra': (1, 'hierba', 'tierra', 'tierra'),
    'hierba_agua':   (2, 'hierba', 'agua', 'agua'),
    'hierba_losa':   (3, 'hierba', 'losa', 'losa'),
    'arena_agua':    (9, 'arena', 'agua', 'agua_arena'),
    'hierba_arena':  (10, 'hierba', 'arena', 'arena'),
    'losa_agua':     (13, 'losa', 'agua', 'agua_losa'),
}
TRANSICIONES_B = {
    'nieve_aguafria':       (1, 'nieve', 'agua_fria', 'agua_nieve'),
    'nieve_hielo':          (2, 'nieve', 'hielo', 'hielo'),
    'arenaroja_agua':       (3, 'arena_roja', 'agua', 'agua_arenaroja'),
    'arenaroja_tierraroja': (10, 'arena_roja', 'tierra_roja', 'tierraroja'),
}
TRANSICIONES = TRANSICIONES_A          # la de la hoja en uso (ver usar_hoja)

# El agua: estricta en los vertices y bloquea el paso (no las balas).
AGUAS_T = ('agua', 'agua_fria')

COLOR_TERRENO = {
    'hierba': '#418546', 'tierra': '#987656', 'agua': '#4aa8cf',
    'losa': '#8b8376', 'arena': '#dcc188',
    'nieve': '#e9f2f8', 'hielo': '#a8dbef', 'agua_fria': '#3f86ad',
    'arena_roja': '#d9a066', 'tierra_roja': '#b06a40',
}

# Relleno base de cada terreno (la variante 1, la que se usa en las transiciones)
def relleno(terreno):
    return {
        'hierba': lambda: R.hierba(0),
        'tierra': lambda: R.tierra(0),
        'agua': lambda: R.agua(0),
        'losa': lambda: R.losa(0),
        'arena': lambda: R.arena(0),
        'nieve': lambda: B.nieve(0),
        'hielo': lambda: B.hielo(0),
        'agua_fria': lambda: B.agua_fria(0),
        'arena_roja': lambda: B.arena_roja(0),
        'tierra_roja': lambda: B.tierra_roja(0),
    }[terreno]()


MUROS = {'piedra': 4, 'seto': 5, 'empalizada': 6}
MUROS_B = {'hielo': 4, 'roca_nevada': 5, 'roca_roja': 6}

# Matas de la hoja B: familia -> (fila del cuerpo, columna de las tapas en la
# fila de tapas, fila de tapas, paleta, contorno)
MATAS_B = {
    'arbusto_nevado': (7, 12, 8, B.PAL_NEVADO, B.CONTORNO_NEVADO),
    'arbusto_seco':   (9, 0, 13, B.PAL_SECO, B.CONTORNO_SECO),
}


def usar_hoja(h):
    """Cambia CAT/PROPS/IMAGENES/TRANSICIONES a los de la hoja `h` (la crea
    la primera vez)."""
    global CAT, PROPS, IMAGENES, TRANSICIONES, HOJA
    if h not in _HECHAS:
        CAT, PROPS, IMAGENES = {}, {}, {}
        TRANSICIONES = TRANSICIONES_A if h == 'a' else TRANSICIONES_B
        HOJA = h
        (construir_catalogo if h == 'a' else construir_catalogo_b)()
        _HECHAS[h] = (CAT, PROPS, IMAGENES)
    CAT, PROPS, IMAGENES = _HECHAS[h]
    TRANSICIONES = TRANSICIONES_A if h == 'a' else TRANSICIONES_B
    HOJA = h


def _objetos_comunes(objetos):
    """Las piezas que estan en las DOS hojas en la misma casilla (fila 12)."""
    objetos += [
        ('barril_1', B.barril(0), {'caja': 'barril', 'bloquea': 'todo'}),
        ('barril_2', B.barril(1), {'caja': 'barril', 'estado': 1}),
        ('barril_3', B.barril(2), {'deco': True, 'quemado': True}),
        ('cuenco', B.cuenco(), {'deco': True, 'cura': True}),
        ('carne', B.carne(), {'objeto': 'carne'}),
    ]
    return objetos


def construir_catalogo():
    # fila 0: suelos sueltos
    for v in range(4):
        poner(0, v, 'hierba_%d' % (v + 1), R.hierba(v), terreno='hierba')
    for v in range(2):
        poner(0, 4 + v, 'hierba_flores_%d' % (v + 1), R.hierba_flores(v), terreno='hierba')
        poner(0, 6 + v, 'hierba_piedras_%d' % (v + 1), R.hierba_piedras(v), terreno='hierba')
    for v in range(4):
        poner(0, 8 + v, 'tierra_%d' % (v + 1), R.tierra(v), terreno='tierra')
        poner(0, 12 + v, 'arena_%d' % (v + 1), R.arena(v), terreno='arena')

    # transiciones
    for id_, (fila, ta, tb, estilo) in TRANSICIONES.items():
        ra, rb = relleno(ta), relleno(tb)
        for i in range(16):
            no, ne, so, se = bits_esquinas(i)
            if i == 0:
                im = ra.copy()
            elif i == 15:
                im = rb.copy()
            else:
                est = 'agua' if estilo == 'agua_losa' else estilo
                im = R.transicion(no, ne, so, se, ra, rb, est, '%s-%d' % (id_, i))
                if estilo == 'agua_losa':
                    # La orilla de la fuente: la llaga de la plaza, no hierba.
                    p = R.Pincel(im)
                    px = im.load()
                    for y in range(T):
                        for x in range(T):
                            if px[x, y][:3] == R.HIERBA_BORDE:
                                p.set(x, y, R.PIEDRA_OSC2)
            props = {'transicion': id_}
            if tb == 'agua' and i != 0:
                props['bloquea'] = 'paso'
            if ta == 'agua':
                props['bloquea'] = 'paso'
            poner(fila, i, '%s_%02d' % (id_, i), im, **props)

    # muros (cuerpo)
    for tipo, fila in MUROS.items():
        for i in range(16):
            n, e, s, o = bits_vecinos(i)
            poner(fila, i, 'muro_%s_%02d' % (tipo, i), R.muro(tipo, n, e, s, o),
                  bloquea='todo', muro=tipo)
    # arbustos
    for i in range(16):
        n, e, s, o = bits_vecinos(i)
        poner(7, i, 'arbusto_%02d' % i, R.arbusto(n, e, s, o), arbusto=True)
    # tapas
    for k, tipo in enumerate(['piedra', 'seto', 'empalizada']):
        for i in range(4):
            e, o = (i >> 1) & 1, i & 1
            poner(8, k * 4 + i, 'tapa_%s_%d' % (tipo, i), R.tapa_muro(tipo, e, o), tapa=tipo)
    for i in range(4):
        e, o = (i >> 1) & 1, i & 1
        poner(8, 12 + i, 'tapa_arbusto_%d' % i, R.tapa_arbusto(e, o), tapa='arbusto')

    # decoracion
    deco = []
    for v in range(4):
        deco.append(('deco_flores_%d' % (v + 1), R.deco_flores(v)))
    for v in range(2):
        deco.append(('deco_piedras_%d' % (v + 1), R.deco_piedras(v)))
    for v in range(2):
        deco.append(('deco_matas_%d' % (v + 1), R.deco_matas(v)))
    for v in range(2):
        deco.append(('deco_setas_%d' % (v + 1), R.deco_setas(v)))
    for v in range(2):
        deco.append(('deco_hojas_%d' % (v + 1), R.deco_hojas(v)))
    for v in range(2):
        deco.append(('deco_grieta_%d' % (v + 1), R.deco_grieta(v)))
    for v in range(2):
        deco.append(('nenufar_%d' % (v + 1), R.nenufar(v)))
    for k, (nombre, im) in enumerate(deco):
        poner(11, k, nombre, im, deco=True)

    # objetos
    objetos = [
        ('caja_1', R.caja(0), {'caja': 'normal', 'bloquea': 'todo'}),
        ('caja_2', R.caja(1), {'caja': 'normal', 'estado': 1}),
        ('caja_3', R.caja(2), {'caja': 'normal', 'estado': 2}),
        ('caja_oro_1', R.caja_oro(0), {'caja': 'oro', 'bloquea': 'todo'}),
        ('caja_oro_2', R.caja_oro(1), {'caja': 'oro', 'estado': 1}),
        ('hueso', R.hueso_potenciador(), {'objeto': 'hueso'}),
        ('base_aparicion', R.base_aparicion(), {'deco': True}),
        ('roca_agua', R.roca_agua(), {'deco': True}),
    ]
    objetos.append(('tocon', R.tocon(), {'deco': True}))
    objetos.append(('charco', R.charco(), {'deco': True}))
    _objetos_comunes(objetos)
    for k, (nombre, im, props) in enumerate(objetos):
        poner(12, k, nombre, im, **props)

    # fila 15: puentes de dos de ancho (mitad izquierda/derecha o arriba/abajo)
    k = 0
    for eje in ('v', 'h'):
        for lado in range(2):
            for parte in range(3):
                poner(15, k, 'puente_%s_%d_%d' % (eje, lado + 1, parte + 1),
                      R.puente(eje, parte, lado), puente=True)
                k += 1

    # fila 14: variantes de losa y agua
    for v in range(1, 4):
        poner(14, v - 1, 'losa_%d' % (v + 1), R.losa(v), terreno='losa')
        poner(14, 3 + v - 1, 'agua_%d' % (v + 1), R.agua(v), terreno='agua', bloquea='paso')


def construir_catalogo_b():
    """La hoja B: nieve y cañon (ver la cabecera)."""
    # fila 0: suelos sueltos
    for v in range(4):
        poner(0, v, 'nieve_%d' % (v + 1), B.nieve(v), terreno='nieve')
        poner(0, 4 + v, 'arena_roja_%d' % (v + 1), B.arena_roja(v), terreno='arena_roja')
        poner(0, 8 + v, 'tierra_roja_%d' % (v + 1), B.tierra_roja(v), terreno='tierra_roja')
    for v in range(2):
        poner(0, 12 + v, 'nieve_brillos_%d' % (v + 1), B.nieve_brillos(v), terreno='nieve')
        poner(0, 14 + v, 'arena_roja_ondas_%d' % (v + 1), B.arena_roja_ondas(v), terreno='arena_roja')

    # transiciones
    for id_, (fila, ta, tb, estilo) in TRANSICIONES_B.items():
        ra, rb = relleno(ta), relleno(tb)
        for i in range(16):
            no, ne, so, se = bits_esquinas(i)
            if i == 0:
                im = ra.copy()
            elif i == 15:
                im = rb.copy()
            else:
                im = B.transicion_b(no, ne, so, se, ra, rb, estilo, '%s-%d' % (id_, i))
            props = {'transicion': id_}
            if (tb in AGUAS_T and i != 0) or ta in AGUAS_T:
                props['bloquea'] = 'paso'
            poner(fila, i, '%s_%02d' % (id_, i), im, **props)

    # muros (cuerpo) y sus tapas
    for k, (tipo, fila) in enumerate(MUROS_B.items()):
        for i in range(16):
            n, e, s, o = bits_vecinos(i)
            poner(fila, i, 'muro_%s_%02d' % (tipo, i), R.muro(tipo, n, e, s, o),
                  bloquea='todo', muro=tipo)
        for i in range(4):
            e, o = (i >> 1) & 1, i & 1
            poner(8, k * 4 + i, 'tapa_%s_%d' % (tipo, i), R.tapa_muro(tipo, e, o), tapa=tipo)

    # matas (esconden, no chocan) y sus tapas
    for familia, (fila, col_tapa, fila_tapa, pal, cont) in MATAS_B.items():
        for i in range(16):
            n, e, s, o = bits_vecinos(i)
            poner(fila, i, '%s_%02d' % (familia, i), R.arbusto(n, e, s, o, pal=pal, contorno=cont),
                  arbusto=True, familia=familia)
        for i in range(4):
            e, o = (i >> 1) & 1, i & 1
            poner(fila_tapa, col_tapa + i, 'tapa_%s_%d' % (familia, i),
                  R.tapa_arbusto(e, o, pal=pal, contorno=cont), tapa=familia)

    # decoracion
    deco = []
    for v in range(2):
        deco.append(('deco_huellas_%d' % (v + 1), B.deco_huellas(v)))
    for v in range(2):
        deco.append(('deco_ramitas_%d' % (v + 1), B.deco_ramitas(v)))
    for v in range(2):
        deco.append(('deco_piedra_nevada_%d' % (v + 1), B.deco_piedra_nevada(v)))
    for v in range(2):
        deco.append(('deco_cactus_%d' % (v + 1), B.deco_cactus(v)))
    deco.append(('deco_calavera', B.deco_calavera()))
    for v in range(2):
        deco.append(('deco_piedras_rojas_%d' % (v + 1), B.deco_piedras_rojas(v)))
    for v in range(2):
        deco.append(('deco_grieta_seca_%d' % (v + 1), B.deco_grieta_seca(v)))
    for v in range(2):
        deco.append(('deco_grieta_hielo_%d' % (v + 1), B.deco_grieta_hielo(v)))
    deco.append(('deco_cardo', B.deco_cardo()))
    for k, (nombre, im) in enumerate(deco):
        poner(11, k, nombre, im, deco=True)

    # objetos: en las MISMAS casillas que en la hoja A
    objetos = [
        ('caja_1', R.caja(0), {'caja': 'normal', 'bloquea': 'todo'}),
        ('caja_2', R.caja(1), {'caja': 'normal', 'estado': 1}),
        ('caja_3', R.caja(2), {'caja': 'normal', 'estado': 2}),
        ('caja_oro_1', R.caja_oro(0), {'caja': 'oro', 'bloquea': 'todo'}),
        ('caja_oro_2', R.caja_oro(1), {'caja': 'oro', 'estado': 1}),
        ('hueso', R.hueso_potenciador(), {'objeto': 'hueso'}),
        ('base_aparicion', R.base_aparicion(), {'deco': True}),
        ('tempano', B.tempano(), {'deco': True}),
        ('tocon_nevado', B.tocon_nevado(), {'deco': True}),
        ('charco_helado', B.charco_helado(), {'deco': True}),
    ]
    _objetos_comunes(objetos)
    objetos.append(('roca_roja_agua', B.roca_roja_agua(), {'deco': True}))
    for k, (nombre, im, props) in enumerate(objetos):
        poner(12, k, nombre, im, **props)

    # fila 13: variantes de agua fria, hielo y agua (las tapas del matorral ya
    # ocupan las columnas 0-3)
    for v in range(1, 4):
        poner(13, 4 + v - 1, 'agua_fria_%d' % (v + 1), B.agua_fria(v), terreno='agua_fria', bloquea='paso')
        poner(13, 7 + v - 1, 'hielo_%d' % (v + 1), B.hielo(v), terreno='hielo')
        poner(13, 10 + v - 1, 'agua_%d' % (v + 1), R.agua(v), terreno='agua', bloquea='paso')

    # fila 15: puentes, los mismos de la hoja A
    k = 0
    for eje in ('v', 'h'):
        for lado in range(2):
            for parte in range(3):
                poner(15, k, 'puente_%s_%d_%d' % (eje, lado + 1, parte + 1),
                      R.puente(eje, parte, lado), puente=True)
                k += 1


def hoja():
    im = Image.new('RGBA', (COLS * T, FILAS * T), (0, 0, 0, 0))
    for i, pieza in IMAGENES.items():
        im.alpha_composite(pieza, ((i % COLS) * T, (i // COLS) * T))
    return im


# ===========================================================================
# TILED: TILESET (.tsx y la version incrustada en JSON)
# ===========================================================================

def _valor_tiled(v):
    if isinstance(v, bool):
        return 'bool', 'true' if v else 'false', v
    if isinstance(v, int):
        return 'int', str(v), v
    return 'string', str(v), str(v)


def _wangsets():
    """Pinceles de terreno: 6 de esquinas (suelos) + 4 de bordes (muros y matas)."""
    out = []
    for id_, (fila, ta, tb, _) in TRANSICIONES.items():
        tiles = []
        for i in range(16):
            no, ne, so, se = bits_esquinas(i)
            c = lambda b: 2 if b else 1
            # orden de Tiled: arriba, arriba-dcha, dcha, abajo-dcha, abajo, abajo-izq, izq, arriba-izq
            tiles.append((fila * COLS + i, [0, c(ne), 0, c(se), 0, c(so), 0, c(no)]))
        out.append({
            'name': '%s / %s' % (ta.capitalize(), tb.capitalize()),
            'type': 'corner',
            'tile': fila * COLS + 15,
            'colors': [
                {'name': ta.capitalize(), 'color': COLOR_TERRENO[ta], 'tile': fila * COLS, 'probability': 1},
                {'name': tb.capitalize(), 'color': COLOR_TERRENO[tb], 'tile': fila * COLS + 15, 'probability': 1},
            ],
            'wangtiles': tiles,
        })
    if HOJA == 'a':
        edge_sets = [('Muro de piedra', 4, '#a59d8e'), ('Seto', 5, '#366d3a'),
                     ('Empalizada', 6, '#8a5f30'), ('Arbusto', 7, '#4c9a46')]
    else:
        edge_sets = [('Bloque de hielo', 4, '#c3e8f6'), ('Roca nevada', 5, '#7d8794'),
                     ('Roca roja', 6, '#b8693d'), ('Pino nevado', 7, '#2f5d3a'),
                     ('Matorral seco', 9, '#b99a4a')]
    for nombre, fila, color in edge_sets:
        tiles = []
        for i in range(16):
            n, e, s, o = bits_vecinos(i)
            tiles.append((fila * COLS + i, [n, 0, e, 0, s, 0, o, 0]))
        out.append({
            'name': nombre, 'type': 'edge', 'tile': fila * COLS + 15,
            'colors': [{'name': nombre, 'color': color, 'tile': fila * COLS + 15, 'probability': 1}],
            'wangtiles': tiles,
        })
    return out


def tileset_json(firstgid=1):
    tiles = []
    for i in sorted(PROPS):
        props = []
        tipo = ''
        for k, v in sorted(PROPS[i].items()):
            t, _, val = _valor_tiled(v)
            props.append({'name': k, 'type': t, 'value': val})
            if k in ('muro', 'tapa', 'caja', 'transicion', 'terreno'):
                tipo = k
        d = {'id': i, 'properties': props}
        if tipo:
            d['type'] = tipo
        tiles.append(d)
    nombre = HOJAS[HOJA]['nombre']
    return {
        'columns': COLS, 'firstgid': firstgid,
        'image': '../Game/MAPAS/%s.png' % nombre, 'imagewidth': COLS * T, 'imageheight': FILAS * T,
        'margin': 0, 'spacing': 0, 'name': nombre,
        'tilecount': COLS * FILAS, 'tilewidth': T, 'tileheight': T,
        'tiles': tiles,
        'wangsets': [{
            'name': w['name'], 'type': w['type'], 'tile': w['tile'],
            'colors': w['colors'],
            'wangtiles': [{'tileid': t, 'wangid': wid} for t, wid in w['wangtiles']],
        } for w in _wangsets()],
    }


def tileset_tsx():
    e = sx.escape
    q = sx.quoteattr
    nombre = HOJAS[HOJA]['nombre']
    lin = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<tileset version="1.10" tiledversion="1.10.2" name="%s" tilewidth="%d" tileheight="%d" '
           'tilecount="%d" columns="%d">' % (nombre, T, T, COLS * FILAS, COLS),
           ' <image source="%s.png" width="%d" height="%d"/>' % (nombre, COLS * T, FILAS * T)]
    for i in sorted(PROPS):
        lin.append(' <tile id="%d">' % i)
        lin.append('  <properties>')
        for k, v in sorted(PROPS[i].items()):
            t, s, _ = _valor_tiled(v)
            tipo = '' if t == 'string' else ' type="%s"' % t
            lin.append('   <property name=%s%s value=%s/>' % (q(k), tipo, q(s)))
        lin.append('  </properties>')
        lin.append(' </tile>')
    lin.append(' <wangsets>')
    for w in _wangsets():
        lin.append('  <wangset name=%s type="%s" tile="%d">' % (q(w['name']), w['type'], w['tile']))
        for c in w['colors']:
            lin.append('   <wangcolor name=%s color="%s" tile="%d" probability="1"/>' % (
                q(c['name']), c['color'], c['tile']))
        for t, wid in w['wangtiles']:
            lin.append('   <wangtile tileid="%d" wangid="%s"/>' % (t, ','.join(str(x) for x in wid)))
        lin.append('  </wangset>')
    lin.append(' </wangsets>')
    lin.append('</tileset>')
    return '\n'.join(lin) + '\n'


# ===========================================================================
# LAS ARENAS
# ===========================================================================
#
# Cada arena se diseña por su MITAD DE ARRIBA y la de abajo sale girando 180
# grados: asi el mapa es justo para todos (cada aparicion tiene su gemela al
# otro lado, a la misma distancia de todo).
#
# Dos rejillas por arena:
#   suelo:   '.' hierba  ',' tierra  's' arena  ':' losa  '~' agua
#            'n' nieve  'i' hielo  'f' agua fria  'r' arena roja  't' tierra roja
#   objetos: 'H' seto  '#' muro de piedra  'P' empalizada  '*' arbusto
#            'I' bloque de hielo  'N' roca nevada  'R' roca roja (meseta)
#            'c' caja  'o' caja dorada  'x' barril  '+' comedero
#            '=' puente  '1'..'3' aparicion
#
# Las apariciones 1-3 son las de la mitad de arriba; sus gemelas giradas son
# la 4-6, en el mismo orden (la 4 es la gemela de la 1).

ANCHO, ALTO = 30, 22


def _vacia(ch):
    return [[ch] * ANCHO for _ in range(ALTO)]


def _pon(g, x, y, filas, ch_vacio=' '):
    for dy, fila in enumerate(filas):
        for dx, ch in enumerate(fila):
            if ch != ch_vacio:
                assert 0 <= x + dx < ANCHO and 0 <= y + dy < ALTO // 2, \
                    'fuera de la mitad de arriba: (%d, %d)' % (x + dx, y + dy)
                g[y + dy][x + dx] = ch


def _girar(g, base):
    """Copia la mitad de arriba en la de abajo, girada 180 grados."""
    gemela = {'1': '4', '2': '5', '3': '6'}
    for y in range(ALTO // 2):
        for x in range(ANCHO):
            ch = g[y][x]
            g[ALTO - 1 - y][ANCHO - 1 - x] = gemela.get(ch, ch)
    return g


def arena_pradera():
    s = _vacia('.')
    o = _vacia('.')
    # caminos de tierra (solo se ven)
    _pon(s, 2, 4, [',,,,,,,,,'])
    _pon(s, 10, 4, [',', ',', ',', ','])
    _pon(s, 10, 8, [',,'])
    _pon(s, 18, 2, [',,,,,,,'])
    _pon(s, 18, 3, [',', ',', ',', ',', ','])
    _pon(s, 18, 7, [',,,,'])
    # el estanque del centro (se completa al girar: 4x4)
    _pon(s, 13, 9, ['~~~~', '~~~~'])
    _pon(s, 12, 10, ['~', ], ' ')
    _pon(s, 17, 10, ['~'])

    _pon(o, 2, 2, ['1'])
    _pon(o, 27, 2, ['2'])
    _pon(o, 3, 9, ['3'])
    # setos en L cerca de cada aparicion
    _pon(o, 5, 1, ['H', 'H', 'HHH'])
    _pon(o, 23, 4, ['HHH', '  H', '  H'])
    # bloques de seto en el medio
    _pon(o, 7, 7, ['HH', 'HH'])
    _pon(o, 21, 9, ['HH'])
    # matas
    _pon(o, 10, 1, ['***', '****', ' ***'])
    _pon(o, 1, 6, ['**', '***'])
    _pon(o, 19, 5, ['****', '****'])
    _pon(o, 25, 9, ['***'])
    # cajas
    _pon(o, 8, 5, ['c'])
    _pon(o, 22, 1, ['c'])
    _pon(o, 4, 7, ['c'])
    _pon(o, 15, 6, ['o'])
    # barriles junto al estanque y un comedero en cada lado
    _pon(o, 11, 7, ['xx'])
    _pon(o, 14, 3, ['+'])
    return {
        'id': 'pradera', 'nombre': 'Meadow', 'nombre_es': 'Pradera',
        'hoja': 'a', 'marco': 'muro_seto_15',
        'prioridad': ['tierra', 'hierba'],
        'suelo': _girar(s, '.'), 'objetos': _girar(o, '.'),
    }


def arena_ruinas():
    s = _vacia(':')
    o = _vacia('.')
    # el borde y los rincones son de hierba: la plaza esta en ruinas
    _pon(s, 0, 0, ['.' * ANCHO, '.' * ANCHO])
    _pon(s, 0, 2, ['..', '..', '..', '..', '..', '..', '..', '..', '..'])
    _pon(s, 6, 4, ['....', '...'])
    _pon(s, 20, 7, ['.....', '....'])
    _pon(s, 12, 2, ['......'])
    # la fuente del centro
    _pon(s, 13, 9, ['~~~~', '~~~~'])

    _pon(o, 3, 3, ['1'])
    _pon(o, 26, 3, ['2'])
    _pon(o, 3, 10, ['3'])
    # muros rotos
    _pon(o, 6, 2, ['####', '#'])
    _pon(o, 21, 3, ['#', '###'])
    _pon(o, 9, 7, ['#'])
    _pon(o, 13, 5, ['##'])
    _pon(o, 18, 8, ['#', '#'])
    _pon(o, 26, 8, ['##'])
    # matas en los parterres
    _pon(o, 0, 5, ['**', '**', '**'])
    _pon(o, 6, 4, ['***', '**'])
    _pon(o, 21, 7, ['***', '***'])
    _pon(o, 13, 1, ['****'])
    # cajas
    _pon(o, 11, 4, ['c'])
    _pon(o, 25, 1, ['c'])
    _pon(o, 4, 7, ['c'])
    _pon(o, 16, 7, ['o'])
    _pon(o, 16, 4, ['xx'])
    _pon(o, 24, 6, ['+'])
    return {
        'id': 'ruinas', 'nombre': 'Ruins', 'nombre_es': 'Ruinas',
        'hoja': 'a', 'marco': 'muro_seto_15',
        'prioridad': ['hierba', 'losa'],
        'suelo': _girar(s, ':'), 'objetos': _girar(o, '.'),
    }


def arena_rio():
    s = _vacia('.')
    o = _vacia('.')
    # el rio cruza por el medio: 2 filas de agua en esta mitad + 2 al girar
    _pon(s, 0, 9, ['~' * ANCHO, '~' * ANCHO])
    # remansos para que no sea una regla
    _pon(s, 11, 8, ['~~~~~'])
    _pon(s, 24, 8, ['~~~'])
    # orillas de arena
    _pon(s, 0, 8, ['sssssssssss'])
    _pon(s, 16, 8, ['ssssssss'])
    _pon(s, 27, 8, ['sss'])
    _pon(s, 0, 7, ['ssss'])
    _pon(s, 10, 7, ['sssssss'])
    _pon(s, 23, 7, ['sssss'])
    # caminos de arena hacia los puentes
    _pon(s, 6, 1, ['ss', 'ss', 'ss', 'ss', 'ss', 'ss', 'ss'])
    _pon(s, 2, 3, ['ssss'])

    _pon(o, 2, 2, ['1'])
    _pon(o, 27, 2, ['2'])
    _pon(o, 14, 3, ['3'])
    # puentes de 2 de ancho (al girar salen los otros dos)
    _pon(o, 6, 9, ['==', '=='])
    _pon(o, 22, 9, ['==', '=='])
    # empalizadas
    _pon(o, 9, 2, ['PPP', 'P'])
    _pon(o, 20, 2, ['  P', 'PPP'])
    _pon(o, 4, 6, ['PP'])
    _pon(o, 16, 5, ['P', 'P'])
    # matas
    _pon(o, 11, 4, ['***', '****'])
    _pon(o, 23, 5, ['***', '***'])
    _pon(o, 0, 4, ['***'])
    # cajas
    _pon(o, 26, 6, ['c'])
    _pon(o, 3, 5, ['c'])
    _pon(o, 18, 1, ['c'])
    _pon(o, 13, 7, ['o'])
    _pon(o, 20, 7, ['xx'])
    _pon(o, 17, 4, ['+'])
    return {
        'id': 'rio', 'nombre': 'River', 'nombre_es': 'Río',
        'hoja': 'a', 'marco': 'muro_seto_15',
        'prioridad': ['arena', 'tierra', 'hierba'],
        'suelo': _girar(s, '.'), 'objetos': _girar(o, '.'),
    }


def arena_nieve():
    """
    NEVADA: un lago helado en medio (se patina por encima: es suelo), dos
    agujeros de agua fria que no se cruzan, bloques de hielo para cubrirse y
    rocas nevadas cerca de cada salida. El hielo y el agua nunca se tocan (no
    hay transicion entre ellos): siempre hay nieve en medio.
    """
    s = _vacia('n')
    o = _vacia('.')
    _pon(s, 9, 8, ['i' * 12, 'i' * 12, 'i' * 12])       # el lago (12x6 al girar)
    _pon(s, 4, 6, ['ff', 'ff'])                         # agujero de agua fria
    _pon(s, 14, 4, ['ii', 'ii'])                        # un charco helado grande
    _pon(o, 2, 2, ['1'])
    _pon(o, 27, 2, ['2'])
    _pon(o, 14, 3, ['3'])
    # rocas nevadas en L junto a las salidas
    _pon(o, 5, 1, ['NN', 'N'])
    _pon(o, 22, 3, ['NNN', '  N'])
    # bloques de hielo en el lago, para cubrirse
    _pon(o, 12, 8, ['II'])
    _pon(o, 18, 9, ['I'])
    # pinos nevados
    _pon(o, 8, 2, ['***', '****'])
    _pon(o, 0, 5, ['**', '**'])
    _pon(o, 24, 6, ['***', '***'])
    # cajas, barriles y el comedero
    _pon(o, 10, 5, ['c'])
    _pon(o, 20, 1, ['c'])
    _pon(o, 15, 7, ['o'])
    _pon(o, 19, 6, ['x'])
    _pon(o, 7, 8, ['x'])
    _pon(o, 12, 1, ['+'])
    return {
        'id': 'nieve', 'nombre': 'Frostfield', 'nombre_es': 'Nevada',
        'hoja': 'b', 'arbusto': 'arbusto_nevado', 'marco': 'muro_roca_nevada_15',
        'prioridad': ['hielo', 'nieve'],
        'suelo': _girar(s, 'n'), 'objetos': _girar(o, '.'),
    }


def arena_canon():
    """
    CAÑON: mesetas de roca roja que parten la arena en pasillos, un oasis en
    el centro, matorral seco para esconderse y BARRILES de polvora (es una
    mina abandonada): mas barriles que en ningun otro sitio.
    """
    s = _vacia('r')
    o = _vacia('.')
    _pon(s, 13, 9, ['~~~~', '~~~~'])                    # el oasis (4x4 al girar)
    # caminos de tierra roja (lejos del agua: no hay transicion entre ellas)
    _pon(s, 1, 4, ['tttttttt'])
    _pon(s, 18, 2, ['tttttt'])
    _pon(s, 20, 3, ['t', 't', 't'])
    _pon(s, 8, 6, ['tt', 'tt'])
    _pon(o, 2, 2, ['1'])
    _pon(o, 27, 3, ['2'])
    _pon(o, 13, 4, ['3'])
    # las mesetas
    _pon(o, 5, 1, ['RRR', 'RRR'])
    _pon(o, 23, 0, ['RR', 'RR', 'RR'])
    _pon(o, 10, 7, ['RR'])
    _pon(o, 17, 4, ['R', 'R'])
    # matorral seco
    _pon(o, 0, 6, ['**', '***'])
    _pon(o, 8, 9, ['***'])
    _pon(o, 24, 8, ['**', '**'])
    # cajas, barriles (muchos) y el comedero
    _pon(o, 13, 1, ['c'])
    _pon(o, 3, 8, ['c'])
    _pon(o, 16, 6, ['o'])
    _pon(o, 8, 3, ['xx'])
    _pon(o, 19, 8, ['x'])
    _pon(o, 26, 5, ['x'])
    _pon(o, 11, 1, ['+'])
    return {
        'id': 'canon', 'nombre': 'Canyon', 'nombre_es': 'Cañón',
        'hoja': 'b', 'arbusto': 'arbusto_seco', 'marco': 'muro_roca_roja_15',
        'prioridad': ['tierra_roja', 'arena_roja'],
        'suelo': _girar(s, 'r'), 'objetos': _girar(o, '.'),
    }


ARENAS = [arena_pradera, arena_ruinas, arena_rio, arena_nieve, arena_canon]

TERRENO_DE = {'.': 'hierba', ',': 'tierra', 's': 'arena', ':': 'losa', '~': 'agua',
              'n': 'nieve', 'i': 'hielo', 'f': 'agua_fria', 'r': 'arena_roja', 't': 'tierra_roja'}
MURO_DE = {'H': 'seto', '#': 'piedra', 'P': 'empalizada',
           'I': 'hielo', 'N': 'roca_nevada', 'R': 'roca_roja'}


# ===========================================================================
# DE LA REJILLA A LAS CAPAS
# ===========================================================================

def vertices(a):
    """
    Terreno de cada VERTICE (ALTO+1 x ANCHO+1).

    El agua es "estricta": un vertice es agua solo si las CUATRO casillas que
    lo tocan son agua. Asi la orilla se dibuja DENTRO de la casilla de agua y
    el perro se para justo donde empieza a verse el agua, no medio cuerpo
    dentro. Los demas terrenos ganan por prioridad (un camino de 1 casilla se
    ve entero).
    """
    suelo = a['suelo']
    pri = a['prioridad']
    v = [[None] * (ANCHO + 1) for _ in range(ALTO + 1)]
    for vy in range(ALTO + 1):
        for vx in range(ANCHO + 1):
            cel = []
            for cy in (vy - 1, vy):
                for cx in (vx - 1, vx):
                    if 0 <= cx < ANCHO and 0 <= cy < ALTO:
                        cel.append(TERRENO_DE[suelo[cy][cx]])
            if cel and all(t in AGUAS_T for t in cel):
                v[vy][vx] = cel[0]
                continue
            secos = [t for t in cel if t not in AGUAS_T]
            elegido = None
            for t in pri:
                if t in secos:
                    elegido = t
                    break
            if elegido is None:
                elegido = secos[0] if secos else pri[-1]
            v[vy][vx] = elegido
    return v


def _pieza_suelo(no, ne, so, se, rng, x, y):
    """Indice de suelo para una casilla con esas cuatro esquinas."""
    terrenos = {no, ne, so, se}
    if len(terrenos) == 1:
        t = no
        if t == 'hierba':
            r = rng.random()
            if r < 0.06:
                return CAT['hierba_flores_%d' % rng.randint(1, 2)]
            if r < 0.10:
                return CAT['hierba_piedras_%d' % rng.randint(1, 2)]
            return CAT['hierba_%d' % (1 + min(3, int(rng.random() ** 1.6 * 4)))]
        if t == 'tierra':
            return CAT['tierra_%d' % rng.randint(1, 4)]
        if t == 'arena':
            return CAT['arena_%d' % rng.randint(1, 4)]
        if t == 'losa':
            v = rng.randint(1, 4)
            return CAT['losa_%d' % v] if v > 1 else CAT['losa_agua_00']
        if t == 'agua':
            v = rng.randint(1, 4)
            return CAT['agua_%d' % v] if v > 1 else CAT.get('hierba_agua_15', CAT.get('arenaroja_agua_15'))
        if t == 'nieve':
            if rng.random() < 0.12:
                return CAT['nieve_brillos_%d' % rng.randint(1, 2)]
            return CAT['nieve_%d' % (1 + min(3, int(rng.random() ** 1.5 * 4)))]
        if t == 'hielo':
            v = rng.randint(1, 4)
            return CAT['hielo_%d' % v] if v > 1 else CAT['nieve_hielo_15']
        if t == 'agua_fria':
            v = rng.randint(1, 4)
            return CAT['agua_fria_%d' % v] if v > 1 else CAT['nieve_aguafria_15']
        if t == 'arena_roja':
            if rng.random() < 0.10:
                return CAT['arena_roja_ondas_%d' % rng.randint(1, 2)]
            return CAT['arena_roja_%d' % rng.randint(1, 4)]
        if t == 'tierra_roja':
            return CAT['tierra_roja_%d' % rng.randint(1, 4)]
    if len(terrenos) == 2:
        for id_, (fila, ta, tb, _) in TRANSICIONES.items():
            if terrenos == {ta, tb}:
                i = ((no == tb) << 3) | ((ne == tb) << 2) | ((so == tb) << 1) | (se == tb)
                return CAT['%s_%02d' % (id_, i)]
    raise ValueError('la casilla (%d, %d) mezcla %s: no hay transicion para eso; '
                     'cambia el diseño' % (x, y, sorted(terrenos)))


def _pieza_puente(obj, suelo, x, y):
    """
    Los puentes son de DOS casillas de ancho: se busca la mancha de '=' a la
    que pertenece la casilla y por su forma se sabe hacia donde se cruza.
    """
    from collections import deque
    vistos = {(x, y)}
    cola = deque([(x, y)])
    while cola:
        cx, cy = cola.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if (nx, ny) not in vistos and 0 <= nx < ANCHO and 0 <= ny < ALTO and obj[ny][nx] == '=':
                vistos.add((nx, ny))
                cola.append((nx, ny))
    xs = [p[0] for p in vistos]
    ys = [p[1] for p in vistos]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ancho, alto = x1 - x0 + 1, y1 - y0 + 1
    if ancho != 2 and alto != 2:
        raise SystemExit('el puente de (%d, %d) mide %dx%d: tiene que tener 2 de ancho' % (x, y, ancho, alto))
    if ancho == 2 and alto == 2:
        eje = 'v' if (x0 > 0 and suelo[y0][x0 - 1] == '~') else 'h'
    else:
        eje = 'v' if ancho == 2 else 'h'
    if eje == 'v':
        lado = x - x0
        parte = 0 if y == y0 else (2 if y == y1 else 1)
    else:
        lado = y - y0
        parte = 0 if x == x0 else (2 if x == x1 else 1)
    return CAT['puente_%s_%d_%d' % (eje, lado + 1, parte + 1)]


def capas(a):
    """Las capas de Tiled de una arena (indices de la hoja, -1 = vacio)."""
    rng = A.rng_de('arena-mapa', a['id'])
    v = vertices(a)
    suelo = a['suelo']
    obj = a['objetos']
    vacia = lambda: [[-1] * ANCHO for _ in range(ALTO)]
    L = {k: vacia() for k in ('suelo', 'deco', 'puente', 'muros', 'muros_tapa',
                              'arbustos', 'arbustos_tapa', 'cajas')}

    def es(x, y, chars):
        return 0 <= x < ANCHO and 0 <= y < ALTO and obj[y][x] in chars

    errores = []
    for y in range(ALTO):
        for x in range(ANCHO):
            no, ne, so, se = v[y][x], v[y][x + 1], v[y + 1][x], v[y + 1][x + 1]
            try:
                L['suelo'][y][x] = _pieza_suelo(no, ne, so, se, rng, x, y)
            except ValueError as e:
                errores.append(str(e))
            if TERRENO_DE[suelo[y][x]] in AGUAS_T and not any(t in AGUAS_T for t in (no, ne, so, se)) \
                    and obj[y][x] != '=':
                errores.append('el agua de (%d, %d) no se veria: el agua necesita '
                               'manchas de al menos 2x2' % (x, y))
    if errores:
        raise SystemExit('\n'.join(['ERRORES EN %s:' % a['id']] + errores))

    mata = a.get('arbusto', 'arbusto')
    for y in range(ALTO):
        for x in range(ANCHO):
            ch = obj[y][x]
            if ch in MURO_DE:
                tipo = MURO_DE[ch]
                mismo = [k for k, t in MURO_DE.items() if t == tipo]
                n, e, s_, o_ = es(x, y - 1, mismo), es(x + 1, y, mismo), es(x, y + 1, mismo), es(x - 1, y, mismo)
                L['muros'][y][x] = CAT['muro_%s_%02d' % (tipo, (n << 3) | (e << 2) | (s_ << 1) | o_)]
                if not n and y > 0:
                    # La tapa continua hacia los lados solo si el vecino TAMBIEN tiene tapa.
                    te = es(x + 1, y, mismo) and not es(x + 1, y - 1, mismo)
                    to = es(x - 1, y, mismo) and not es(x - 1, y - 1, mismo)
                    L['muros_tapa'][y - 1][x] = CAT['tapa_%s_%d' % (tipo, (te << 1) | to)]
            elif ch == '*':
                n, e, s_, o_ = es(x, y - 1, '*'), es(x + 1, y, '*'), es(x, y + 1, '*'), es(x - 1, y, '*')
                L['arbustos'][y][x] = CAT['%s_%02d' % (mata, (n << 3) | (e << 2) | (s_ << 1) | o_)]
                if not n and y > 0:
                    te = es(x + 1, y, '*') and not es(x + 1, y - 1, '*')
                    to = es(x - 1, y, '*') and not es(x - 1, y - 1, '*')
                    L['arbustos_tapa'][y - 1][x] = CAT['tapa_%s_%d' % (mata, (te << 1) | to)]
            elif ch == 'c':
                L['cajas'][y][x] = CAT['caja_1']
            elif ch == 'o':
                L['cajas'][y][x] = CAT['caja_oro_1']
            elif ch == 'x':
                L['cajas'][y][x] = CAT['barril_1']
            elif ch == '+':
                L['deco'][y][x] = CAT['cuenco']
            elif ch == '=':
                L['puente'][y][x] = _pieza_puente(obj, suelo, x, y)
            elif ch in '123456':
                L['deco'][y][x] = CAT['base_aparicion']

    # decoracion suelta, solo sobre suelo entero y libre
    for y in range(ALTO):
        for x in range(ANCHO):
            if obj[y][x] != '.' or L['deco'][y][x] >= 0:
                continue
            esquinas = {v[y][x], v[y][x + 1], v[y + 1][x], v[y + 1][x + 1]}
            if len(esquinas) != 1:
                continue
            t = esquinas.pop()
            r = rng.random()
            if t == 'hierba' and r < 0.11:
                q = rng.random()
                if q < 0.55:
                    L['deco'][y][x] = CAT['deco_flores_%d' % rng.randint(1, 4)]
                elif q < 0.75:
                    L['deco'][y][x] = CAT['deco_matas_%d' % rng.randint(1, 2)]
                elif q < 0.87:
                    L['deco'][y][x] = CAT['deco_piedras_%d' % rng.randint(1, 2)]
                elif q < 0.94:
                    L['deco'][y][x] = CAT['deco_setas_%d' % rng.randint(1, 2)]
                else:
                    L['deco'][y][x] = CAT['deco_hojas_%d' % rng.randint(1, 2)]
            elif t == 'losa' and r < 0.12:
                L['deco'][y][x] = CAT['deco_grieta_%d' % rng.randint(1, 2)]
            elif t == 'agua' and r < 0.16:
                if HOJA == 'a':
                    L['deco'][y][x] = CAT['nenufar_%d' % rng.randint(1, 2)] if rng.random() < 0.8 else CAT['roca_agua']
                else:
                    L['deco'][y][x] = CAT['roca_roja_agua']
            elif t == 'tierra' and r < 0.05:
                L['deco'][y][x] = CAT['charco']
            elif t == 'nieve' and r < 0.10:
                q = rng.random()
                if q < 0.35:
                    L['deco'][y][x] = CAT['deco_huellas_%d' % rng.randint(1, 2)]
                elif q < 0.60:
                    L['deco'][y][x] = CAT['deco_ramitas_%d' % rng.randint(1, 2)]
                elif q < 0.88:
                    L['deco'][y][x] = CAT['deco_piedra_nevada_%d' % rng.randint(1, 2)]
                else:
                    L['deco'][y][x] = CAT['tocon_nevado']
            elif t == 'hielo' and r < 0.10:
                L['deco'][y][x] = CAT['deco_grieta_hielo_%d' % rng.randint(1, 2)] if rng.random() < 0.8 else CAT['charco_helado']
            elif t == 'agua_fria' and r < 0.20:
                L['deco'][y][x] = CAT['tempano']
            elif t == 'arena_roja' and r < 0.10:
                q = rng.random()
                # Pocos cactus: son decorado y no chocan, y en una arena lo que
                # parece un obstaculo y no lo es confunde.
                if q < 0.10:
                    L['deco'][y][x] = CAT['deco_cactus_%d' % rng.randint(1, 2)]
                elif q < 0.25:
                    L['deco'][y][x] = CAT['deco_calavera']
                elif q < 0.75:
                    L['deco'][y][x] = CAT['deco_piedras_rojas_%d' % rng.randint(1, 2)]
                else:
                    L['deco'][y][x] = CAT['deco_cardo']
            elif t == 'tierra_roja' and r < 0.12:
                L['deco'][y][x] = (CAT['deco_grieta_seca_%d' % rng.randint(1, 2)] if rng.random() < 0.6
                                   else CAT['deco_piedras_rojas_%d' % rng.randint(1, 2)])
    return L


def rejilla_servidor(a):
    """
    La rejilla de choques, una fila de texto por fila de casillas:
        '#' muro (para el paso y los disparos)   '~' agua (solo el paso)
        '*' arbusto   'c' caja   'o' caja dorada   'x' barril   '+' comedero
        '=' puente   '.' libre
    """
    filas = []
    for y in range(ALTO):
        f = ''
        for x in range(ANCHO):
            ch = a['objetos'][y][x]
            if ch in MURO_DE:
                f += '#'
            elif ch in '*cox=+':
                f += ch
            elif TERRENO_DE[a['suelo'][y][x]] in AGUAS_T:
                f += '~'
            else:
                f += '.'
        filas.append(f)
    apar = {}
    for y in range(ALTO):
        for x in range(ANCHO):
            ch = a['objetos'][y][x]
            if ch in '123456':
                apar[int(ch)] = (x, y)
    return filas, [list(apar[k]) for k in sorted(apar)]


def comprobar(a, filas, apariciones):
    """Que se pueda llegar de cualquier aparicion a cualquier otra andando."""
    from collections import deque
    paso = lambda x, y: 0 <= x < ANCHO and 0 <= y < ALTO and filas[y][x] in '.*=+'
    x0, y0 = apariciones[0]
    vistos = {(x0, y0)}
    cola = deque([(x0, y0)])
    while cola:
        x, y = cola.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) not in vistos and paso(nx, ny):
                vistos.add((nx, ny))
                cola.append((nx, ny))
    libres = sum(1 for y in range(ALTO) for x in range(ANCHO) if paso(x, y))
    if len(vistos) != libres:
        raise SystemExit('%s: hay %d casillas libres a las que no se llega' % (a['id'], libres - len(vistos)))
    for (x, y) in apariciones:
        if (x, y) not in vistos:
            raise SystemExit('%s: la aparicion (%d, %d) esta encerrada' % (a['id'], x, y))
    assert len(apariciones) == 6, '%s: hacen falta 6 apariciones' % a['id']


def mapa_tiled(a, L, apariciones):
    capas_tiled = []
    nid = [1]

    def capa(nombre, datos, visible=True, opacidad=1):
        d = {'id': nid[0], 'name': nombre, 'type': 'tilelayer', 'x': 0, 'y': 0,
             'width': ANCHO, 'height': ALTO, 'opacity': opacidad, 'visible': visible,
             'data': [(c + 1 if c >= 0 else 0) for fila in datos for c in fila]}
        nid[0] += 1
        return d

    for k in ('suelo', 'deco', 'puente', 'muros', 'muros_tapa', 'arbustos', 'arbustos_tapa', 'cajas'):
        capas_tiled.append(capa(k, L[k]))
    objetos = []
    for i, (x, y) in enumerate(apariciones):
        objetos.append({
            'id': i + 1, 'name': 'aparicion_%d' % (i + 1), 'type': 'aparicion',
            'x': x * T + T / 2, 'y': y * T + T / 2, 'width': 0, 'height': 0,
            'point': True, 'rotation': 0, 'visible': True,
            'properties': [{'name': 'orden', 'type': 'int', 'value': i + 1}],
        })
    capas_tiled.append({
        'id': nid[0], 'name': 'puntos', 'type': 'objectgroup', 'draworder': 'topdown',
        'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'objects': objetos,
    })
    nid[0] += 1
    return {
        'compressionlevel': -1, 'width': ANCHO, 'height': ALTO, 'infinite': False,
        'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'version': '1.10', 'type': 'map',
        'tilewidth': T, 'tileheight': T,
        'nextlayerid': nid[0], 'nextobjectid': len(objetos) + 1,
        'properties': [
            {'name': 'id', 'type': 'string', 'value': a['id']},
            {'name': 'nombre', 'type': 'string', 'value': a['nombre']},
            {'name': 'hoja', 'type': 'string', 'value': HOJAS[a.get('hoja', 'a')]['nombre']},
            {'name': 'marco', 'type': 'string', 'value': a.get('marco', 'muro_seto_15')},
        ],
        'layers': capas_tiled,
        'tilesets': [tileset_json(1)],
    }


def vista_previa(L, hoja_im, ruta):
    im = Image.new('RGBA', (ANCHO * T, ALTO * T), (0, 0, 0, 255))
    def pieza(i):
        return hoja_im.crop(((i % COLS) * T, (i // COLS) * T, (i % COLS) * T + T, (i // COLS) * T + T))
    for k in ('suelo', 'deco', 'puente', 'muros_tapa', 'muros', 'arbustos_tapa', 'arbustos', 'cajas'):
        for y in range(ALTO):
            for x in range(ANCHO):
                i = L[k][y][x]
                if i >= 0:
                    im.alpha_composite(pieza(i), (x * T, y * T))
    im.save(ruta)


# ===========================================================================
# EL BLOQUE ARENAS DEL MOTOR
# ===========================================================================

def bloque_motor(datos):
    lin = ['/* <<ARENAS>> — lo escribe tools/generar-arenas.py a partir de los mapas.',
           '   No se edita a mano: se cambia el mapa (o el diseño del generador) y se',
           '   vuelve a lanzar. Leyenda: "#" muro, "~" agua, "*" arbusto, "c" caja,',
           '   "o" caja dorada, "x" barril, "+" comedero, "=" puente, "." libre.',
           '   Apariciones en casillas. */',
           'var ARENAS = {']
    for k, (a, filas, apar) in enumerate(datos):
        lin.append('  %s: {' % a['id'])
        lin.append("    nombre: '%s', ancho: %d, alto: %d, celda: %d," % (a['nombre'], ANCHO, ALTO, T))
        lin.append('    filas: [')
        for i, f in enumerate(filas):
            lin.append("      '%s'%s" % (f, ',' if i < len(filas) - 1 else ''))
        lin.append('    ],')
        lin.append('    apariciones: %s' % json.dumps(apar).replace(' ', ''))
        lin.append('  }%s' % (',' if k < len(datos) - 1 else ''))
    lin.append('};')
    lin.append('/* <</ARENAS>> */')
    # Va dentro de la funcion del motor: sangrado de 2 (la primera linea ya
    # hereda el sangrado de la marca a la que sustituye).
    return '\n'.join([lin[0]] + ['  ' + l for l in lin[1:]])


def escribir_motor(bloque):
    if not os.path.exists(RUTA_MOTOR):
        print('  (aun no existe gf-brawl-motor.js; el bloque ARENAS se guarda aparte)')
        with open(os.path.join(AQUI, '_arenas-bloque.js'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(bloque + '\n')
        return
    with open(RUTA_MOTOR, 'r', encoding='utf-8', newline='') as f:
        txt = f.read()
    eol = '\r\n' if '\r\n' in txt else '\n'
    patron = re.compile(r'/\* <<ARENAS>>.*?/\* <</ARENAS>> \*/', re.S)
    if not patron.search(txt):
        raise SystemExit('gf-brawl-motor.js no tiene el bloque <<ARENAS>> ... <</ARENAS>>')
    nuevo = patron.sub(lambda m: bloque.replace('\n', eol), txt)
    if nuevo != txt:
        with open(RUTA_MOTOR + '.tmp', 'w', encoding='utf-8', newline='') as f:
            f.write(nuevo)
        os.replace(RUTA_MOTOR + '.tmp', RUTA_MOTOR)
        print('  gf-brawl-motor.js: bloque ARENAS actualizado')
    else:
        print('  gf-brawl-motor.js: el bloque ARENAS ya estaba al dia')


# ===========================================================================
# RETOCAR UN MAPA EDITADO EN TILED
# ===========================================================================

def retocar(ruta):
    """
    Tiled no sabe poner las TAPAS de los muros ni elegir la pieza de cada muro
    segun sus vecinos (el pincel de bordes ayuda, pero no las tapas). Esto lee
    un mapa editado, mira QUE celdas tienen muro, mata o caja —sea cual sea la
    pieza que se puso— y rehace esas capas como lo haria el generador.
    """
    with open(ruta, 'r', encoding='utf-8') as f:
        m = json.load(f)
    usar_hoja('b' if m['tilesets'][0].get('name') == HOJAS['b']['nombre'] else 'a')
    w, h = m['width'], m['height']
    global ANCHO, ALTO
    ANCHO, ALTO = w, h
    capa = {l['name']: l for l in m['layers']}
    def leer(nombre):
        d = capa[nombre]['data'] if nombre in capa else [0] * (w * h)
        return [[(d[y * w + x] - 1) for x in range(w)] for y in range(h)]
    muros, arb, cajas = leer('muros'), leer('arbustos'), leer('cajas')
    obj = [['.'] * w for _ in range(h)]
    letra = {v: k for k, v in MURO_DE.items()}
    for y in range(h):
        for x in range(w):
            if muros[y][x] >= 0:
                obj[y][x] = letra[PROPS[muros[y][x]]['muro']]
            elif arb[y][x] >= 0:
                obj[y][x] = '*'
            elif cajas[y][x] >= 0:
                obj[y][x] = {'oro': 'o', 'barril': 'x'}.get(PROPS[cajas[y][x]].get('caja'), 'c')
    nuevas = {k: [[-1] * w for _ in range(h)] for k in ('muros', 'muros_tapa', 'arbustos', 'arbustos_tapa')}
    def es(x, y, chars):
        return 0 <= x < w and 0 <= y < h and obj[y][x] in chars
    for y in range(h):
        for x in range(w):
            ch = obj[y][x]
            if ch in MURO_DE:
                tipo = MURO_DE[ch]
                n, e, s_, o_ = es(x, y - 1, ch), es(x + 1, y, ch), es(x, y + 1, ch), es(x - 1, y, ch)
                nuevas['muros'][y][x] = CAT['muro_%s_%02d' % (tipo, (n << 3) | (e << 2) | (s_ << 1) | o_)]
                if not n and y > 0:
                    te = es(x + 1, y, ch) and not es(x + 1, y - 1, ch)
                    to = es(x - 1, y, ch) and not es(x - 1, y - 1, ch)
                    nuevas['muros_tapa'][y - 1][x] = CAT['tapa_%s_%d' % (tipo, (te << 1) | to)]
            elif ch == '*':
                fam = PROPS[arb[y][x]].get('familia', 'arbusto')
                n, e, s_, o_ = es(x, y - 1, '*'), es(x + 1, y, '*'), es(x, y + 1, '*'), es(x - 1, y, '*')
                nuevas['arbustos'][y][x] = CAT['%s_%02d' % (fam, (n << 3) | (e << 2) | (s_ << 1) | o_)]
                if not n and y > 0:
                    te = es(x + 1, y, '*') and not es(x + 1, y - 1, '*')
                    to = es(x - 1, y, '*') and not es(x - 1, y - 1, '*')
                    nuevas['arbustos_tapa'][y - 1][x] = CAT['tapa_%s_%d' % (fam, (te << 1) | to)]
    for k, datos in nuevas.items():
        plano = [(c + 1 if c >= 0 else 0) for fila in datos for c in fila]
        if k in capa:
            capa[k]['data'] = plano
    with open(ruta + '.tmp', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(ruta + '.tmp', ruta)
    print('retocado:', ruta, '(%d muros, %d matas)' % (
        sum(1 for f in nuevas['muros'] for c in f if c >= 0),
        sum(1 for f in nuevas['arbustos'] for c in f if c >= 0)))
    print('Despues: node tools/brawl-prueba-arenas.js  (dice si la rejilla de choques '
          'del motor sigue casando con el mapa)')


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == '--retocar':
        retocar(sys.argv[2])
        return
    imagenes = {}
    for h, cfg in HOJAS.items():
        usar_hoja(h)
        im = hoja()
        imagenes[h] = im
        os.makedirs(os.path.dirname(cfg['png']), exist_ok=True)
        im.save(cfg['png'], 'PNG', optimize=True)
        print('hoja:', os.path.relpath(cfg['png'], BIN), '(%d piezas)' % len(IMAGENES))
        with open(cfg['tsx'], 'w', encoding='utf-8', newline='\n') as f:
            f.write(tileset_tsx())
        print('tsx: ', os.path.relpath(cfg['tsx'], BIN))

    previa = os.environ.get('GF_PREVIA')
    datos = []
    for fn in ARENAS:
        a = fn()
        usar_hoja(a.get('hoja', 'a'))
        im = imagenes[HOJA]
        L = capas(a)
        filas, apar = rejilla_servidor(a)
        comprobar(a, filas, apar)
        m = mapa_tiled(a, L, apar)
        ruta = os.path.join(BIN, 'Maps', 'arena_%s.json' % a['id'])
        with open(ruta, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(m, f, ensure_ascii=False, separators=(',', ':'))
        print('mapa:', os.path.relpath(ruta, BIN))
        if previa:
            vista_previa(L, im, os.path.join(previa, 'arena_%s.png' % a['id']))
        datos.append((a, filas, apar))
    escribir_motor(bloque_motor(datos))


if __name__ == '__main__':
    main()
