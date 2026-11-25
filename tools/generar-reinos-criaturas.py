# -*- coding: utf-8 -*-
"""
=============================================================================
LAS CRIATURAS DE LOS SIETE MAPAS DEL ESTE                       (2026-11-21)
=============================================================================

"Nuevos animales y enemigos 2.5D, un monstruo por mapa, nuevos poderes los
enemigos, animales buenos y malos con sus 4 direcciones... NPC con sus
nombres... no uses cosas que existen en las imágenes del juego, haz nuevas."

Todo sale de aquí, en PNG; el juego solo lo carga:

  FAUNA (Game/Sprites/fauna3d/)      14 animales 3D: tools/gf_reinos_bestias.FAUNA
      '<pose>[_abajo|_arriba]_<n>'   camina 4, quieto 2, come 2 (como
                                     tools/generar-fauna-zonas.py)
  BESTIAS (Game/Sprites/monstruos/)  10 monstruos 3D: gf_reinos_bestias.BESTIAS
  JEFES   (Game/Sprites/monstruos/)  7 jefes 3D:      gf_reinos_bestias.JEFES
      '<accion>[_abajo|_arriba]_<n>' camina 4, ataque 3, quieto 2, con su pivot
                                     (como tools/generar-monstruos.py)
  HUMANOIDES (Game/Sprites/monstruos/)  4 enemigos 2D con relieve, sobre el
      cuerpo de los personajes (tools/gf_humanoides2d.py): '<dir>_<n>'
  PROYECTILES (Game/Sprites/monstruos/efectos/)  los de los 13 poderes nuevos
  NPC (Game/Sprites/npcs/)           19 NPC (tools/generar-npcs.py: cuerpo y
      cabeza del arte original, colores y añadidos propios): '<dir>_<n>'

Los humanoides son 2D con relieve y los animales y bestias 3D: lo que el
usuario aceptó (memoria estilo-2-5d-mixto). SIN MOTAS (tripofobia): bandas,
rayas y degradados lisos; nada de puntos, agujeros, racimos ni ocelos.

Determinista: volver a ejecutarlo escribe los mismos bytes.

USO:  python tools/generar-reinos-criaturas.py [fauna] [bestias] [jefes]
                                               [humanoides] [efectos] [npcs]
      (sin nada, todo)
=============================================================================
"""
import importlib.util
import json
import math
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from gf_arte import Mascara, Lienzo, rampa, contorno_de, hex_rgb, hoja_contacto  # noqa: E402
from gf_bestias3d import fotografiar, elip, cono, roca, giro_z, SUELO  # noqa: E402
import gf_humanoides2d as H2  # noqa: E402
from gf_relieve import relieve_lienzo  # noqa: E402
import gf_reinos_bestias as RB  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SALIDA_FAUNA = os.path.join(RAIZ, 'Game', 'Sprites', 'fauna3d')
SALIDA_MONSTRUOS = os.path.join(RAIZ, 'Game', 'Sprites', 'monstruos')
SALIDA_NPCS = os.path.join(RAIZ, 'Game', 'Sprites', 'npcs')
APP = 'tools/generar-reinos-criaturas.py'


def _modulo(archivo, alias):
    """Un script de tools/ con guion en el nombre, como módulo (no ejecuta su main)."""
    spec = importlib.util.spec_from_file_location(alias, os.path.join(AQUI, archivo))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


GM = _modulo('generar-monstruos.py', 'gf_gen_monstruos')
GN = _modulo('generar-npcs.py', 'gf_gen_npcs')
tonos = H2.tonos


# ===========================================================================
# ATLAS (el mismo formato que los de siempre: celdas iguales, pies alineados)
# ===========================================================================
def atlas(carpeta, nombre, frames, columnas, pivote=None, sep=2):
    nombres = list(frames)
    cw = max(frames[k].w for k in nombres)
    ch = max(frames[k].h for k in nombres)
    filas = (len(nombres) + columnas - 1) // columnas
    hoja = Image.new('RGBA', (columnas * (cw + sep), filas * (ch + sep)), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': APP, 'image': nombre + '.png', 'format': 'RGBA8888', 'scale': '1'}}
    for idx, k in enumerate(nombres):
        li = frames[k]
        x0, y0 = (idx % columnas) * (cw + sep), (idx // columnas) * (ch + sep)
        hoja.alpha_composite(li.imagen(), (x0 + (cw - li.w) // 2, y0 + ch - li.h))
        datos['frames'][k] = {'frame': {'x': x0, 'y': y0, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                              'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
        if pivote:
            datos['frames'][k]['pivot'] = {'x': pivote[0], 'y': round(pivote[1], 4)}
    datos['meta']['size'] = {'w': hoja.size[0], 'h': hoja.size[1]}
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, nombre + '.png')
    hoja.save(ruta, 'PNG', optimize=True)
    with open(os.path.join(carpeta, nombre + '.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('  %-18s %3d fotogramas  celda %dx%d' % (nombre, len(nombres), cw, ch))
    return ruta


def guardar(li, nombre):
    ruta = os.path.join(SALIDA_MONSTRUOS, 'efectos', nombre + '.png')
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    li.guardar(ruta)
    return ruta


# ===========================================================================
# LA FAUNA (como tools/generar-fauna-zonas.py)
# ===========================================================================
POSES = (('camina', 4), ('quieto', 2), ('come', 2))
VISTAS_FAUNA = (('lado', ''), ('abajo', '_abajo'), ('arriba', '_arriba'))


def fauna_frames(especie):
    fn, mats, W, H, suelo, acorta = RB.FAUNA[especie]
    base = next(iter(mats.values()))
    cont = contorno_de(base['tonos'][2]) if 'tonos' in base else (20, 18, 16)
    out = {}
    for vista, suf in VISTAS_FAUNA:
        for pose, n in POSES:
            for i in range(1, n + 1):
                prims, ret = fn(pose, i)
                if vista == 'lado':
                    li = fotografiar(prims, W, H, 'lado', mats, ret, cont, suelo=suelo, salto=2.0)
                else:
                    li = fotografiar(prims, W, H, 'frente' if vista == 'abajo' else 'espalda', mats, ret, cont,
                                     suelo=suelo, salto=2.0, fx=acorta)
                out['%s%s_%d' % (pose, suf, i)] = li
    return out, (0.5, round((H - suelo) / float(H), 4))


# ===========================================================================
# BESTIAS Y JEFES (como gf_bestias3d.bestia_frames)
# ===========================================================================
VISTAS = (('lado', ''), ('frente', '_abajo'), ('espalda', '_arriba'))
ACCIONES = (('camina', 4), ('ataque', 3), ('quieto', 2))


def bestia_frames(tabla, tipo):
    modelo, mats, W, H, cont, k, angulo = tabla[tipo]
    out = {}
    # (2026-11-23) Y las que el modelo tenga de más (el dragón: 'vuela').
    acciones = ACCIONES + tuple(getattr(modelo, 'ACCIONES_EXTRA', ()))
    for vista, suf in VISTAS:
        for acc, n in acciones:
            for i in range(1, n + 1):
                prims, ret = modelo(acc, i)
                v = (angulo if angulo is not None else 'lado') if vista == 'lado' else vista
                out['%s%s_%d' % (acc, suf, i)] = fotografiar(prims, W, H, v, mats, ret, cont, k)
    # El apoyo, como en gf_bestias3d.pivote: tres filas por debajo del centro de lo que pisa.
    return out, (0.5, (H - SUELO + 3) / float(H))


# ===========================================================================
# LOS HUMANOIDES (2D con relieve, sobre el cuerpo de los personajes)
# ===========================================================================
def _segmento(li, x0, y0, x1, y1, color, grosor=1):
    m = Mascara(li.w, li.h).linea(int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1)), grosor)
    for x, y in m.puntos():
        li.set(x, y, color)


def _filas(partes, que):
    out = {}
    for (x, y), (p, c) in partes.items():
        if p in que:
            out.setdefault(y, []).append(x)
    return out


# ── EL CORSARIO AHOGADO (el puerto): casaca azul de mar rasgada, la tez verde
#    de agua, ojos que brillan como la espuma, la bandolera de alga y un arpón.
def _corsario(li, partes, cuello, cintura, dir_, n):
    vista = H2.vista_de(dir_)
    alga = tonos('#3f7a4a', 3, arriba=0.2, abajo=0.45)
    # La bandolera: una banda ANCHA (tres filas) de un hombro a la cadera.
    filas = _filas(partes, ('camisa',))
    for y, xs in filas.items():
        if not (cuello + 2 <= y <= cintura - 1):
            continue
        t = (y - cuello - 2) / max(1.0, cintura - cuello - 3)
        if vista == 'frente':
            xc = min(xs) + (max(xs) - min(xs)) * (0.18 + 0.64 * t)
        elif vista == 'espalda':
            xc = max(xs) - (max(xs) - min(xs)) * (0.18 + 0.64 * t)
        else:
            continue
        for x in range(int(round(xc)) - 1, int(round(xc)) + 2):
            if x in xs:
                li.set(x, y, alga[0] if x < xc else alga[1])
    # El arpón: un asta de madera larga y su punta de hierro (en la mano de delante).
    mano = H2.mano_delantera(partes, dir_)
    if mano and vista != 'espalda':
        mx, my = mano
        madera = [hex_rgb('#8a6440'), hex_rgb('#5a3e26')]
        hierro = [hex_rgb('#c9d2da'), hex_rgb('#7c8692')]
        s = 1 if dir_ in ('derecha', 'abajo') else -1
        x_top, y_top = mx + 3 * s, my - 30
        _segmento(li, mx - 1 * s, my + 12, x_top, y_top, (30, 22, 16), 3)
        _segmento(li, mx - 1 * s, my + 12, x_top, y_top, madera[0], 1)
        # La punta: un triángulo de hierro con su luz.
        for k in range(6):
            for dx in range(-(5 - k) // 2, (5 - k) // 2 + 1):
                li.set(x_top + dx, y_top - k, hierro[0] if dx <= 0 else hierro[1])
        _segmento(li, x_top - 3, y_top + 1, x_top + 3, y_top + 1, (30, 22, 16), 1)
    return li


def _ropa_corsario(semilla):
    t_piel = tonos('#8fb3a8', 3, arriba=0.18, abajo=0.36)
    t_ropa = tonos('#2a3a5a', 4, arriba=0.25, abajo=0.5)

    def f(li, partes, cuello, cintura, dir_, n):
        return H2.rasgar(li, partes, cuello, cintura, dir_, semilla, t_piel, t_ropa, (14, 20, 26))
    return f


RECETA_CORSARIO = {
    'contorno': (14, 20, 26),
    'paletas': {
        'piel': tonos('#8fb3a8', 3, arriba=0.18, abajo=0.36), 'mano': tonos('#8fb3a8', 3, arriba=0.18, abajo=0.36),
        'pies': tonos('#3a3a44', 3, arriba=0.12, abajo=0.45),
        'ojo': H2.ojos_brillantes(hex_rgb('#7dffe0'), hex_rgb('#0e3a34')),
        'pelo': tonos('#2a3436', 4, arriba=0.25, abajo=0.5),
        'camisa': tonos('#2a3a5a', 4, arriba=0.25, abajo=0.5),
        'pantalon': tonos('#3a3a44', 4, arriba=0.14, abajo=0.55),
    },
    'ropa': _ropa_corsario(41),
    'despues': _corsario,
}


# ── LA BRUJA DEL CIÉNAGO (el pantano): sombrero de pico verde musgo con banda
#    de latón, mata enmarañada, chal rasgado y un báculo con farol de veneno.
def _ropa_bruja(li, partes, cuello, cintura, dir_, n):
    return H2.rasgar(li, partes, cuello, cintura, dir_, 53, tonos('#a8b890', 3, arriba=0.18, abajo=0.36),
                     tonos('#4a5a3a', 4, arriba=0.25, abajo=0.5), (16, 22, 12))


RECETA_BRUJA_PANTANO = {
    'pelo_estilo': 'salvaje',
    'pelo_tonos': tonos('#7a8a6a', 4, arriba=0.3, abajo=0.5),
    'sombrero': H2._sombrero('#3a4a2a', '#c8a040', '#9aff5a'),
    'ropa': _ropa_bruja,
    'contorno': (16, 22, 12),
    'paletas': {
        'piel': tonos('#a8b890', 3, arriba=0.18, abajo=0.36), 'mano': tonos('#a8b890', 3, arriba=0.18, abajo=0.36),
        'pies': tonos('#2e3424', 3),
        'ojo': H2.ojos_brillantes(hex_rgb('#d8ff5a'), hex_rgb('#2a3a08')),
        'pelo': tonos('#5a6a4a', 4, arriba=0.28, abajo=0.5),
        'camisa': tonos('#4a5a3a', 4, arriba=0.25, abajo=0.5),
        'pantalon': tonos('#3a4630', 3, abajo=0.5),
    },
    'tunica': tonos('#3e4a30', 3, arriba=0.25, abajo=0.45),
    'ribete': hex_rgb('#c8a040'),
    'baculo': True, 'baculo_arriba': 24,
    'madera': [hex_rgb('#6a5a3a'), hex_rgb('#4a3e28')],
    'cristal': [hex_rgb('#f2ffd0'), hex_rgb('#b8ff5a'), hex_rgb('#5a9a1a')],
}


# ── EL ESPANTAPÁJAROS DE LA COSECHA (las colinas): saco de arpillera por piel,
#    ojos de brasa naranja, camisa remendada (lisa) y paja que asoma por el
#    cuello y las muñecas (trazos, nunca puntos), con un cinto de cuerda.
def _paja(li, partes, cuello, cintura, dir_, n):
    paja = [hex_rgb('#f0d27a'), hex_rgb('#c8a040')]
    cuerda = tonos('#b0905a', 2, arriba=0.15)
    vista = H2.vista_de(dir_)
    # El cinto de cuerda: dos filas en la cintura.
    for (x, y), (p, c) in partes.items():
        if p == 'camisa' and cintura - 3 <= y <= cintura - 2:
            li.set(x, y, cuerda[0] if y == cintura - 3 else cuerda[1])
    # La paja del cuello: trazos cortos que salen hacia abajo y afuera.
    fila = sorted(x for (x, y), (p, c) in partes.items() if p == 'camisa' and y == cuello + 1)
    if fila and vista != 'espalda':
        for k, x in enumerate(range(fila[0] + 1, fila[-1], 3)):
            _segmento(li, x, cuello, x + (k % 2) - 0.5, cuello + 3, paja[k % 2], 1)
    # La paja de las muñecas: tres trazos en abanico bajo cada mano.
    manos = {}
    for (x, y), (p, c) in partes.items():
        if p == 'mano':
            manos.setdefault(x // 6, []).append((x, y))
    for grupo in manos.values():
        x = sum(q[0] for q in grupo) / len(grupo)
        y = max(q[1] for q in grupo)
        for dx in (-2, 0, 2):
            _segmento(li, x, y, x + dx, y + 3, paja[0 if dx else 1], 1)
    return li


RECETA_ESPANTAPAJAROS = {
    'contorno': (34, 22, 14),
    'paletas': {
        'piel': tonos('#c8a878', 3, arriba=0.15, abajo=0.36), 'mano': tonos('#c8a878', 3, arriba=0.15, abajo=0.36),
        'pies': tonos('#5a4632', 3, arriba=0.12, abajo=0.45),
        'ojo': H2.ojos_brillantes(hex_rgb('#ffb03a'), hex_rgb('#5a2a06')),
        'pelo': tonos('#e6c46a', 4, arriba=0.25, abajo=0.5),
        'camisa': tonos('#9a4a3a', 4, arriba=0.22, abajo=0.5),
        'pantalon': tonos('#4a5a7a', 4, arriba=0.14, abajo=0.55),
    },
    'ropa': (lambda li, partes, cuello, cintura, dir_, n:
             H2.rasgar(li, partes, cuello, cintura, dir_, 67, tonos('#c8a878', 3, arriba=0.15, abajo=0.36),
                       tonos('#9a4a3a', 4, arriba=0.22, abajo=0.5), (34, 22, 14))),
    'despues': _paja,
}


# ── EL CHAMÁN DE LAS LIANAS (la selva): trenzas oscuras, capa de hojas con
#    ribete de oro, túnica, un báculo con una semilla que brilla y una máscara
#    de madera tallada sobre la cara (dos rendijas de luz y una cresta).
def _mascara(li, partes, cuello, cintura, dir_, n):
    g = H2.geometria_cabeza(partes, cuello, dir_)
    if g['vista'] == 'espalda' or not g['cara']:
        return li
    madera = tonos('#a8743a', 3, arriba=0.2, abajo=0.45)
    luz = hex_rgb('#c8ff7a')
    cara = g['cara']
    xs = [x for x, y in cara]
    ys = [y for x, y in cara]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for (x, y) in cara:
        li.set(x, y, madera[0] if (x - x0) < (x1 - x0) * 0.45 else madera[1])
    # Las dos rendijas de los ojos (rayas de luz, horizontales).
    ojos = sorted((x, y) for (x, y), (p, c) in partes.items() if p == 'ojo')
    if ojos:
        yo = int(round(sum(y for x, y in ojos) / len(ojos)))
        for x, y in ojos:
            li.set(x, yo, luz)
            if (x - 1, yo) in cara:
                li.set(x - 1, yo, luz)
    # La cresta tallada: una línea oscura de arriba abajo en medio.
    if g['vista'] == 'frente':
        xm = int(round((x0 + x1) / 2.0))
        for y in range(y0, y1 + 1):
            if (xm, y) in cara and not any(q == (xm, y) for q in ojos):
                li.set(xm, y, madera[2])
    # El borde de la máscara.
    for (x, y) in cara:
        if y in (y0, y1):
            li.set(x, y, madera[2])
    return li


RECETA_CHAMAN = {
    'pelo_estilo': 'trenzas',
    'pelo_tonos': tonos('#2a1e1a', 4, arriba=0.3, abajo=0.5),
    'ropa': H2._capa_de('#3a6a2a', '#e8c040', '#14200c'),
    'contorno': hex_rgb('#14200c'),
    'paletas': {
        'piel': tonos('#9a6a48', 3, arriba=0.15, abajo=0.38), 'mano': tonos('#9a6a48', 3, arriba=0.15, abajo=0.38),
        'pies': tonos('#4a3622', 3),
        'ojo': H2.ojos_brillantes(hex_rgb('#c8ff7a'), hex_rgb('#2a4010')),
        'pelo': tonos('#2a1e1a', 4, arriba=0.28, abajo=0.5),
        'camisa': tonos('#5a7a2a', 4, arriba=0.25, abajo=0.5),
        'pantalon': tonos('#4a3a22', 3, abajo=0.5),
    },
    'tunica': tonos('#4a6a2a', 3, arriba=0.25, abajo=0.45),
    'ribete': hex_rgb('#e8c040'),
    'baculo': True, 'baculo_arriba': 22,
    'madera': [hex_rgb('#8a5a2a'), hex_rgb('#5a3a1a')],
    'cristal': [hex_rgb('#f2ffd8'), hex_rgb('#a8ff5a'), hex_rgb('#3a8a1a')],
    'despues': _mascara,
}

HUMANOIDES = {
    # arte: (cuerpo del personaje, receta)
    'pirata_ahogado': ('personaje12', RECETA_CORSARIO),
    'bruja_pantano': ('personaje6', RECETA_BRUJA_PANTANO),
    'espantapajaros': ('personaje8', RECETA_ESPANTAPAJAROS),
    'chaman_selva': ('personaje10', RECETA_CHAMAN),
}


def humanoide_frames(arte):
    per, receta = HUMANOIDES[arte]
    return {k: relieve_lienzo(li, 0.6) for k, li in H2.frames_humanoide(per, receta).items()}


# ===========================================================================
# LOS PROYECTILES DE LOS PODERES NUEVOS
# ===========================================================================
def _mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def efecto_ola():
    """La MAREA del cangrejo: una ola en media luna que avanza a la derecha,
    con la cresta de espuma (UNA banda clara) y el cuerpo de agua en tres
    tonos lisos."""
    W, H = 62, 66
    li = Lienzo(W, H)
    agua = [hex_rgb('#bff4ff'), hex_rgb('#5fc8e8'), hex_rgb('#2f86b8'), hex_rgb('#1e5a8a')]
    cy = (H - 1) / 2.0
    for y in range(H):
        for x in range(W):
            # La media luna: dentro de la elipse de fuera y fuera de la de
            # dentro (algo más alta, para que las puntas se afilen). Las dos
            # caben en el lienzo: nada sale cortado.
            a = ((x - 18.0) / 42.0) ** 2 + ((y - cy) / 31.0) ** 2
            b = ((x - 4.0) / 42.0) ** 2 + ((y - cy) / 35.0) ** 2
            if a <= 1.0 and b > 1.0 and x >= 2:
                borde = 1.0 - a                       # 0 en la cresta de fuera
                k = 0 if borde < 0.08 else 1 if borde < 0.22 else 2 if y < cy + 6 else 3
                li.set(x, y, agua[k])
    li.contornear(color=hex_rgb('#0e2a44'), diagonales=False)
    return li


def efecto_ancla():
    """El ANCLA del corsario: caña, cepo, cruz y los dos brazos con sus uñas,
    de hierro oscuro con UNA luz; 3D, apuntando abajo."""
    mats = {'hierro': {'tonos': tonos('#5a6470', 5, arriba=0.4, abajo=0.55), 'brillo': True},
            'oxido': {'tonos': tonos('#8a5a3a', 5, arriba=0.3, abajo=0.5)}}
    pr = [cono((0, 4, 0), (0, 22, 0), 1.5, 1.5, 'hierro'),
          elip((0, 24.5, 0), (2.6, 2.6, 1.0), 'hierro'),
          cono((-5.2, 20, 0), (5.2, 20, 0), 1.0, 1.0, 'oxido')]
    for s in (1, -1):
        pr.append(cono((0, 4.2, 0), (6.4 * s, 7.6, 0), 1.4, 1.2, 'hierro'))
        pr.append(cono((6.4 * s, 7.6, 0), (8.6 * s, 11.6, 0), 1.2, 0.3, 'hierro'))
    return fotografiar(pr, 30, 36, 'lado', mats, None, contorno_de(hex_rgb('#3a4048')), k=2, suelo=3, salto=99)


def efecto_nube(base, claro, oscuro_):
    """Una NUBE lisa (la tóxica del sapo, la de esporas de la polilla): cinco
    lóbulos que se funden, sin burbujas ni puntos."""
    mats = {'nube': {'tonos': [hex_rgb(claro), _mezcla(hex_rgb(claro), hex_rgb(base), 0.5), hex_rgb(base),
                               _mezcla(hex_rgb(base), hex_rgb(oscuro_), 0.5), hex_rgb(oscuro_)]}}
    pr = [elip((0, 9, 0), (13, 7.5, 10), 'nube'), elip((-9, 7, 2), (8, 6, 8), 'nube'),
          elip((9, 7, -1), (8.5, 6.2, 8), 'nube'), elip((-3, 14, 0), (8, 6, 7.5), 'nube'),
          elip((5, 13, 1), (7, 5.6, 7), 'nube')]
    return fotografiar(pr, 64, 48, 'frente', mats, None, contorno_de(hex_rgb(oscuro_)), k=1.6, suelo=3, salto=99)


def efecto_sello():
    """El SELLO de la maldición: un anillo en el suelo (visto en escorzo) con
    UNA espiral que se cierra hacia dentro; líneas lisas, verde veneno."""
    W, H = 96, 44
    li = Lienzo(W, H)
    cx, cy = (W - 1) / 2.0, (H - 1) / 2.0
    claro, medio_, oscuro = hex_rgb('#e8ffb0'), hex_rgb('#9aff5a'), hex_rgb('#3a7a1a')
    for x, y in Mascara(W, H).elipse(cx, cy, 46, 20).puntos():
        d = math.hypot((x - cx) / 46.0, (y - cy) / 20.0)
        if d > 0.86:
            li.set(x, y, oscuro if d > 0.95 else medio_)
    # UNA espiral: dos vueltas y media, gruesa (de 2 px), que se cierra.
    pasos = 260
    for k in range(pasos):
        t = k / float(pasos)
        a = t * math.pi * 5.0
        r = 0.8 * (1.0 - t) + 0.08
        x, y = cx + math.cos(a) * 46 * r, cy + math.sin(a) * 20 * r
        li.set(int(round(x)), int(round(y)), claro)
        li.set(int(round(x)) + 1, int(round(y)), medio_)
    return li


def efecto_rayo_sol():
    """El RAYO DE SOL del coloso y del escarabajo: una columna de luz RECTA,
    oro con el centro blanco, en cuatro capas lisas (nada de chispas)."""
    W, H = 40, 200
    li = Lienzo(W, H)
    capas = ((18, hex_rgb('#c8701a')), (13, hex_rgb('#ffb43a')), (8, hex_rgb('#ffe08a')), (3, hex_rgb('#fffbe6')))
    cx = (W - 1) / 2.0
    for semi, color in capas:
        for y in range(H):
            # Se estrecha un poco arriba (de donde cae) y se ensancha abajo.
            s = semi * (0.62 + 0.38 * y / (H - 1.0))
            for x in range(W):
                if abs(x - cx) <= s / 2.0:
                    li.set(x, y, color)
    return li


def efecto_zarpazo():
    """El ZARPAZO del oso y de la pantera: tres tajos curvos paralelos (tres
    rayas anchas, no puntos), blancos con el borde rojo oscuro."""
    W, H = 56, 56
    li = Lienzo(W, H)
    for k in range(3):
        off = (k - 1) * 11
        for grosor, color in ((5, hex_rgb('#7a1a1a')), (3, hex_rgb('#ffd8c8')), (1, hex_rgb('#ffffff'))):
            pts = []
            for i in range(17):
                t = i / 16.0
                a = math.radians(-60 + 120 * t)
                pts.append((W / 2.0 + off + math.sin(a) * 6, 6 + t * (H - 12)))
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                g = max(1, int(round(grosor * math.sin(math.pi * (0.1 + 0.8 * (y0 - 6) / (H - 12))))))
                _segmento(li, x0, y0, x1, y1, color, g)
    return li


def efecto_viento():
    """El VENDAVAL del espantapájaros: UNA espiral de aire que gira, con dos
    estelas largas detrás (rayas anchas y lisas, claras y transparentes)."""
    W, H = 72, 56
    li = Lienzo(W, H)
    cx, cy = 44.0, H / 2.0
    claro, medio_ = (236, 246, 240, 235), (190, 214, 206, 210)
    for k in range(320):
        t = k / 320.0
        a = t * math.pi * 3.6
        r = 22 * (1.0 - t) + 3
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.78
        for dx in (0, 1):
            for dy in (0, 1):
                li.set(int(round(x)) + dx, int(round(y)) + dy, claro if t < 0.6 else medio_)
    for yy, largo in ((cy - 10, 30), (cy + 9, 24)):
        for x in range(6, 6 + largo):
            for dy in (0, 1):
                li.set(x, int(round(yy)) + dy, medio_ if x < 12 else claro)
    return li


def efecto_dardo():
    """El DARDO del chamán: caña fina de madera, punta de hueso y cola de dos
    plumas verdes; 3D, apuntando a la derecha."""
    mats = {'madera': {'tonos': tonos('#a8743a', 5, arriba=0.3, abajo=0.5)},
            'hueso': {'tonos': tonos('#efe6cc', 5, arriba=0.15, abajo=0.45)},
            'pluma': {'tonos': tonos('#6ac84a', 5, arriba=0.3, abajo=0.5)}}
    pr = [cono((-8, 3, 0), (6, 3, 0), 0.55, 0.55, 'madera'), cono((6, 3, 0), (10, 3, 0), 0.9, 0.1, 'hueso')]
    for s in (1, -1):
        pr.append(elip((-8.4, 3 + 1.1 * s, 0), (2.6, 1.0, 0.3), 'pluma'))
    return fotografiar(pr, 44, 16, 'lado', mats, None, contorno_de(hex_rgb('#4a3018')), k=2, suelo=3, salto=99)


def efecto_geiser():
    """La ERUPCIÓN de la salamandra: un chorro de lava que sube y se abre
    arriba en abanico, con la cresta redonda (sin gotas sueltas)."""
    W, H = 48, 96
    li = Lienzo(W, H)
    cx = (W - 1) / 2.0
    lava = [hex_rgb('#fff2b8'), hex_rgb('#ffc24a'), hex_rgb('#ff7a1a'), hex_rgb('#c83a10')]
    for y in range(H):
        u = y / (H - 1.0)                                # 0 arriba, 1 abajo
        # El chorro, algo más ancho abajo, que se abre arriba en abanico.
        semi = 6.0 + 3.0 * u + 15.0 * max(0.0, 1.0 - y / 22.0) ** 1.6
        if y < 7:                                        # la cresta, redonda
            semi *= math.sqrt(max(0.0, 1.0 - ((7 - y) / 7.5) ** 2))
        for x in range(W):
            if abs(x - cx) <= semi:
                d = abs(x - cx) / max(1.0, semi)
                k = 0 if d < 0.25 else 1 if d < 0.55 else 2 if d < 0.85 else 3
                li.set(x, y, lava[k])
    li.contornear(color=hex_rgb('#3a1006'), diagonales=False)
    return li


def efecto_meteoro():
    """El METEORO del gólem de magma: una roca de lava encendida (3D) con su
    estela en tres bandas lisas detrás (arriba a la izquierda)."""
    mats = {'roca': {'tonos': tonos('#3a3036', 5, arriba=0.45, abajo=0.55)},
            'brasa': {'emite': hex_rgb('#ffb43a')}}
    p = roca((0, 8, 0), (8.0, 7.2, 7.4), 'roca', rot=giro_z(0.5), bisel=0.6, arista=0.72)

    def retoque(q, Pm, nm, nw):
        return 'brasa' if nm[0] > 0.45 else None          # la cara que viene ardiendo
    piedra = fotografiar([p], 42, 38, 'frente', mats, retoque, (26, 14, 10), k=2, suelo=3, salto=99)
    W, H = 84, 70
    li = Lienzo(W, H)
    estela = [hex_rgb('#c83a10'), hex_rgb('#ff7a1a'), hex_rgb('#ffd27a')]
    for k, semi in enumerate((11, 7, 3)):
        for t in range(60):
            u = t / 59.0
            x, y = 4 + u * 50, 4 + u * 40
            s = semi * u
            for x2, y2 in Mascara(W, H).disco(x, y, max(0.6, s)).puntos():
                li.set(x2, y2, estela[k])
    li.pegar(piedra, W - piedra.w, H - piedra.h)
    return li


def efecto_brote():
    """El BROTE del hongo andante: un montículo de tierra y un tallo que sale
    con dos hojas y un sombrerito cerrado; 3D."""
    mats = {'tierra': {'tonos': tonos('#6a4e34', 5, arriba=0.3, abajo=0.55)},
            'tallo': {'tonos': tonos('#e6dccb', 5, arriba=0.15, abajo=0.42)},
            'hoja': {'tonos': tonos('#6aa84a', 5, arriba=0.3, abajo=0.5)},
            'seta': {'tonos': tonos('#9a5aca', 5, arriba=0.35, abajo=0.5)}}
    pr = [elip((0, 0.5, 0), (9, 3.2, 7), 'tierra'), cono((0, 1, 0), (0.6, 12, 0), 1.4, 1.1, 'tallo'),
          elip((0.6, 13.5, 0), (3.4, 2.6, 3.4), 'seta'),
          elip((3.2, 6.5, 0), (3.2, 0.7, 1.4), 'hoja', rot=giro_z(0.5)),
          elip((-2.4, 8.5, 0), (3.0, 0.7, 1.3), 'hoja', rot=giro_z(-0.5))]
    return fotografiar(pr, 36, 40, 'frente', mats, None, contorno_de(hex_rgb('#3a2a1a')), k=2, suelo=4, salto=99)


EFECTOS = {
    # nombre del PNG (efectos/<nombre>.png): cómo se dibuja
    'ola': efecto_ola,
    'ancla': efecto_ancla,
    'nube_toxica': lambda: efecto_nube('#7ac83a', '#e2ffb0', '#2a5a10'),
    'sello': efecto_sello,
    'rayo_sol': efecto_rayo_sol,
    'zarpazo': efecto_zarpazo,
    'viento': efecto_viento,
    'dardo': efecto_dardo,
    'geiser': efecto_geiser,
    'meteoro': efecto_meteoro,
    'nube_esporas': lambda: efecto_nube('#8a9af0', '#e8f4ff', '#3a3a8a'),
    'brote': efecto_brote,
    'roca_coral': lambda: GM.efecto_roca('#d8786a', '#f2b8a8'),
    'roca_ruina': lambda: GM.efecto_roca('#c8b08a', '#7a9a4a'),
    'roca_magma': lambda: GM.efecto_roca('#3a3036', '#ff7a1a'),
}


# ===========================================================================
# LOS NPC (como tools/generar-npcs.py: cuerpo y cabeza del arte ORIGINAL)
# ===========================================================================
R = GN.receta
PC, PM, PO = GN.PIEL_CLARA, GN.PIEL_MEDIA, GN.PIEL_MORENA
NPCS = {
    # ── el puerto ──
    'capitana_puerto': ('personaje11', R(PM, '#3a2a22', '#2f4a7a', '#2a2a34', pies='#1e1e26', faja='#d9a441',
                                         ojo='#3d6fa8', cabeza='personaje9', gorro='#2a3a5a'), None),
    'pescadero': ('personaje3', R(PC, '#8a5a3a', '#5a8a9a', '#3a3a40', pies='#2a2a30', delantal='#e6e2d8',
                                  ojo='#4f7a3a', cabeza='personaje12', gorro='#3a8a9a'), None),
    'tendera_puerto': ('personaje9', R(PO, '#2a1e18', '#b8703a', '#4a3a5a', pies='#2e2436', delantal='#efe2c8',
                                       faja='#a8343a', ojo='#5a3a1e', cabeza='personaje2'), None),
    'marinero': ('personaje10', R(PC, '#c8a05a', '#e6ecf2', '#2a3a6a', pies='#1e2436', faja='#a8343a',
                                  ojo='#3d6fa8', gorro='#2a3a6a'), None),
    'carpintero_ribera': ('personaje1', R(PM, '#5a3a22', '#8a6a4a', '#3a3a40', pies='#2a1e16', delantal='#8a6440',
                                          ojo='#5a3a1e', cabeza='personaje1'), None),
    'tabernera_puerto': ('personaje6', R(PC, '#a8542a', '#6a2a3a', '#3a2a2a', delantal='#f2eee6',
                                         ojo='#3e7a4c', cabeza='personaje11', gorro='#7a2f2a'), None),
    'farero': ('personaje12', R(PM, '#cfc6b8', '#4a5a6a', '#2a3038', pies='#22262e', cuello_piel='#efe6cf',
                                ojo='#4f93c4', cabeza='personaje13', gorro='#4a5a6a',
                                baculo=True, baculo_arriba=12,
                                madera=[hex_rgb('#5a5048'), hex_rgb('#3a342e')],
                                cristal=[hex_rgb('#fffbe0'), hex_rgb('#ffd66a'), hex_rgb('#c8901a')]), None),
    # (2026-11-24) El barquero del ferri entre el pueblo y el puerto: sombrero de ala
    # curtido, camisa clara, faja dorada. Va en los dos muelles (gf-ferri.js).
    'barquero': ('personaje7', R(PM, '#b8b0a8', '#d8e2e6', '#34465a', pies='#2a2420', faja='#c8902a',
                                 ojo='#3d6fa8', cabeza='personaje9', gorro='#5a4a32'), None),
    # ── el pantano ──
    'herbolaria_cienaga': ('personaje2', R(PC, '#6a4a2a', '#7a8a5a', '#4a4a32', pies='#2e2e20', delantal='#a8b890',
                                           ojo='#4f8a3a', cabeza='personaje13', gorro='#4a5a3a'), None),
    'guia_cienaga': ('personaje5', R(PM, '#3a3428', '#5a6a3a', '#4a3e2a', pies='#2a241a', faja='#6a7a3a',
                                     ojo='#7a6a2a', cabeza='personaje9', gorro='#5a4a2a'), None),
    # ── las ruinas ──
    'arqueologa': ('personaje4', R(PC, '#b86a3a', '#c8b48a', '#6a5a3a', pies='#4a3622', faja='#8a4a2a',
                                   ojo='#3e7a4c', cabeza='personaje8', gorro='#c8a86a'), None),
    'guardian_ruinas': ('personaje7', R(PO, '#1e1a18', '#7a6a4a', '#4a3a2a', pies='#2a2018', faja='#d9a441',
                                        ojo='#8a5a1e', cabeza='personaje11', gorro='#b8c0cc'), 'tajo'),
    # ── las colinas ──
    'pastora_colinas': ('personaje13', R(PC, '#e6c46a', '#8aa86a', '#5a4a3a', pies='#3a2a1e', delantal='#f2eee6',
                                         ojo='#3d6fa8', cabeza='personaje2',
                                         baculo=True, baculo_arriba=24,
                                         madera=[hex_rgb('#9a7448'), hex_rgb('#6a4e2c')],
                                         cristal=[hex_rgb('#c8a070'), hex_rgb('#9a7448'), hex_rgb('#6a4e2c')]), None),
    'lenador': ('personaje8', R(PM, '#6a3a22', '#a8343a', '#3a3a40', pies='#2a1e16', faja='#3a2a1e',
                                ojo='#4f7a3a', cabeza='personaje10', gorro='#7a2a2a'), None),
    # ── la selva ──
    'exploradora_selva': ('personaje11', R(PO, '#1e1612', '#8a9a5a', '#6a5a3a', pies='#3a2a1e', faja='#c86a2a',
                                           ojo='#5a3a1e', cabeza='personaje9', gorro='#c8b07a'), None),
    'curandero_selva': ('personaje10', R(PO, '#141010', '#4a7a3a', '#3a3a28', pies='#2a2418', ojo='#3e7a4c',
                                         cabeza='personaje1',
                                         tunica=tonos('#4a7a3a', 3, arriba=0.25, abajo=0.45), ribete=hex_rgb('#e8c040'),
                                         baculo=True, baculo_arriba=22,
                                         madera=[hex_rgb('#8a5a2a'), hex_rgb('#5a3a1a')],
                                         cristal=[hex_rgb('#f2ffd8'), hex_rgb('#a8ff5a'), hex_rgb('#3a8a1a')]), None),
    # ── el volcán ──
    'forjadora': ('personaje4', R(PO, '#2a1a14', '#8a3a22', '#3a3030', pies='#221a16', delantal='#4a3a30',
                                  ojo='#8a5a1e', cabeza='personaje12', gorro='#c8501a'), None),
    'geologo': ('personaje3', R(PC, '#8a8078', '#c86a2a', '#4a4048', pies='#2a2630', faja='#3a3a40',
                                ojo='#4f93c4', cabeza='personaje10', gorro='#d9a441'), None),
    # ── la hondonada de las setas ──
    'micologa': ('personaje6', R(PC, '#d8d0e8', '#6a4a8a', '#3a3048', pies='#262030', delantal='#d6caf0',
                                 ojo='#6a5a8a', cabeza='personaje13', gorro='#5a3a7a'), None),
    'farolero': ('personaje5', R(PM, '#4a3a2a', '#2a5a6a', '#2a2a34', pies='#1e2028', faja='#7ff0e0',
                                 ojo='#3e8a7a', cabeza='personaje11', gorro='#2a4a5a',
                                 baculo=True, baculo_arriba=14,
                                 madera=[hex_rgb('#4a5058'), hex_rgb('#30353c')],
                                 cristal=[hex_rgb('#e8fffc'), hex_rgb('#7ff0e0'), hex_rgb('#1a8a80')]), None),
}


def npc_frames(nombre):
    per, r, accion = NPCS[nombre]
    out = {}
    for d in H2.DIRS:
        for n in range(1, H2.FOTOS + 1):
            out['%s_%d' % (d, n)] = GN.con_margen(GN.figura(per, r, d, n))
    if accion == 'cavar':
        for i in range(1, 5):
            out['accion_%d' % i] = GN.accion_cavar(per, r, i)
    elif accion == 'tajo':
        for i in range(1, 5):
            out['accion_%d' % i] = GN.accion_tajo(per, r, i)
    return {k: relieve_lienzo(li, 0.6) for k, li in out.items()}


# ===========================================================================
# MAIN
# ===========================================================================
def main():
    pedidos = set(a for a in sys.argv[1:] if not a.startswith('-'))
    # (2026-11-21) --solo=a,b: rehace solo esos (y no toca la hoja de contacto).
    solo = set()
    for a in sys.argv[1:]:
        if a.startswith('--solo='):
            solo.update(x for x in a[len('--solo='):].split(',') if x)

    def quiero(n):
        return not solo or n in solo
    todo = not pedidos
    hojas = []
    if todo or 'fauna' in pedidos:
        print('Fauna ->', SALIDA_FAUNA)
        for n in RB.FAUNA:
            if not quiero(n):
                continue
            fr, piv = fauna_frames(n)
            hojas.append(atlas(SALIDA_FAUNA, n, fr, 8, piv))
    if todo or 'bestias' in pedidos:
        print('Bestias ->', SALIDA_MONSTRUOS)
        for n in RB.BESTIAS:
            if not quiero(n):
                continue
            fr, piv = bestia_frames(RB.BESTIAS, n)
            hojas.append(atlas(SALIDA_MONSTRUOS, n, fr, 9, piv))
    if todo or 'jefes' in pedidos:
        print('Jefes ->', SALIDA_MONSTRUOS)
        for n in RB.JEFES:
            if not quiero(n):
                continue
            fr, piv = bestia_frames(RB.JEFES, n)
            hojas.append(atlas(SALIDA_MONSTRUOS, n, fr, 9, piv))
    if todo or 'humanoides' in pedidos:
        print('Humanoides ->', SALIDA_MONSTRUOS)
        for n in HUMANOIDES:
            if quiero(n):
                hojas.append(atlas(SALIDA_MONSTRUOS, n, humanoide_frames(n), 7))
    if todo or 'efectos' in pedidos:
        print('Proyectiles ->', os.path.join(SALIDA_MONSTRUOS, 'efectos'))
        for n, fn in EFECTOS.items():
            if quiero(n):
                hojas.append(guardar(fn(), n))
    if todo or 'npcs' in pedidos:
        print('NPC ->', SALIDA_NPCS)
        for n in NPCS:
            if quiero(n):
                hojas.append(atlas(SALIDA_NPCS, n, npc_frames(n), 7))
    hoja = None if solo else hoja_contacto(hojas, columnas=4, escala=2)
    if hoja:
        hoja.save(os.path.join(SALIDA_MONSTRUOS, '_hoja_reinos.png'))
    print('listo')


if __name__ == '__main__':
    main()
