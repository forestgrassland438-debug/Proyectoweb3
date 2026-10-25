# -*- coding: utf-8 -*-
"""
=============================================================================
LOS NPC DE LOS MAPAS Y DE LAS CASAS                              (2026-10-19)
=============================================================================

"Haz NPC en los otros mapas: en el desierto NPC con espadas, en el cementerio
cavando, en el de hielo y en el salvaje; y en las casas no hay nadie: pon NPC
con nombres en inglés."

Como los monstruos humanoides (tools/gf_humanoides2d.py): sobre el cuerpo de
los personajes Soulbound (los 7 fotogramas de andar en las 4 direcciones),
con la ropa recoloreada por partes y el relieve 2.5D horneado
(tools/gf_relieve.py). A escala 2 en el juego, como el jugador. NADA de 3D:
los humanoides 3D se rechazaron (memoria estilo-2-5d-mixto).

Encima, lo de cada oficio:
  · el SEPULTURERO cava: cuatro fotogramas de pala (clavar, hundir, sacar la
    tierra, echarla) y su montón de tierra delante;
  · los GUARDIAS DEL DESIERTO entrenan: cuatro tajos de cimitarra;
  · turbantes y fajas (rayas), delantales (de frente) y barbas (una mancha
    lisa en la barbilla).

SIN MOTAS (tripofobia): la tierra que vuela es UN terrón; las vendas del
turbante, rayas; nada de puntos.

Salida: Game/Sprites/npcs/<nombre>.png + .json (JSON Hash para
scene.load.atlas, fotogramas `abajo_1..7`, `arriba_…`, `derecha_…`,
`izquierda_…` y, si hace algo, `accion_1..4`). Lo usa gf-npcs.js.

    python tools/generar-npcs.py [nombre ...]
=============================================================================
"""
import json
import math
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gf_humanoides2d as H2  # noqa: E402
import gf_cabezas as CB  # noqa: E402
from gf_arte import Mascara, Lienzo, hex_rgb, mezcla  # noqa: E402
from gf_relieve import relieve_lienzo  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'Game', 'Sprites', 'npcs')
tonos = H2.tonos
MX, MY = 5, 9                     # el margen que pone H2.humanoide
PAD_X, PAD_Y = 14, 16             # más sitio para la pala y la espada


# ===========================================================================
# LAS RECETAS: colores por parte (como los zombis) y los añadidos
# ===========================================================================
def receta(piel, pelo, camisa, pantalon, pies='#3b2c22', ojo='#3a2a20', contorno=(22, 18, 16),
           cabeza=None, gorro=None, **extra):
    """(2026-10-21) Sin peinados dibujados ni barbas: el NPC es un CUERPO del
    arte original con una de sus 8 CABEZAS (tools/gf_cabezas.py), y cada parte
    con su color. `cabeza`: el personaje del que sale la cabeza (por defecto,
    la del propio cuerpo). `gorro`: el color de su sombrero/gorro/capucha (si
    no, el del original)."""
    r = {
        'contorno': contorno,
        'paletas': {
            # (2026-10-20) La piel con poco contraste: con 0.34 la nariz y la
            # mandíbula salían como manchas pardas en la cara.
            'piel': tonos(piel, 3, arriba=0.12, abajo=0.2), 'mano': tonos(piel, 3, arriba=0.12, abajo=0.2),
            'pies': tonos(pies, 3, arriba=0.18, abajo=0.5),
            'pelo': tonos(pelo, 4, arriba=0.24, abajo=0.5),
            'camisa': tonos(camisa, 4, arriba=0.2, abajo=0.5),
            'pantalon': tonos(pantalon, 4, arriba=0.14, abajo=0.55),
        },
        'cabeza': cabeza, 'gorro': tonos(gorro, 4, arriba=0.2, abajo=0.5) if gorro else None,
    }
    r['_ojo'], r['_piel'] = ojo, piel
    r.update(extra)
    return r


PIEL_CLARA, PIEL_MEDIA, PIEL_MORENA = '#e8c3a0', '#d2a07a', '#a8714e'

# nombre: (CUERPO del original, receta, acción). Cuerpos de hombre: 1 3 5 7 8
# 10 12; de mujer: 2 4 6 9 11 13. Cabezas (gf_cabezas.CABEZAS): 1 de punta,
# 2 rizada, 8 sombrero de paja, 9 sombrero de ala, 10 y 11 gorros, 12 pañuelo,
# 13 capucha.
NPCS = {
    # ── los mapas ──
    'sepulturero': ('personaje8', receta(PIEL_CLARA, '#2e2a2c', '#3c3633', '#2b2724', pies='#241c18',
                                         ojo='#56606c', cabeza='personaje10', gorro='#4a4652'), 'cavar'),
    'guardia_desierto': ('personaje10', receta(PIEL_MORENA, '#efe6d0', '#d8c49a', '#8a6a44', pies='#5a3e28',
                                              turbante=True, faja='#a8343a', ojo='#8a5a1e'), 'tajo'),
    'centinela_desierto': ('personaje11', receta(PIEL_MEDIA, '#f2ead8', '#c7b18a', '#6f5235', pies='#4a3322',
                                                 turbante=True, faja='#2f6f8f', ojo='#3e7a4c'), 'tajo'),
    'trampero': ('personaje10', receta(PIEL_CLARA, '#cfc6b8', '#8a6440', '#5a4632', pies='#3a2a1e',
                                       cuello_piel='#e9e2d6', ojo='#3d6fa8', gorro='#7a5a3a'), None),
    'pescadora_hielo': ('personaje11', receta(PIEL_CLARA, '#eadfb4', '#e6edf3', '#5a6f86', pies='#40506a',
                                              cuello_piel='#ffffff', ojo='#4f93c4', gorro='#5f8fbf'), None),
    'guardabosques': ('personaje11', receta(PIEL_MEDIA, '#5a3a22', '#4d6b3a', '#5a4632', pies='#3a2a1e',
                                            ojo='#3e7a4c', cabeza='personaje9', gorro='#6b7a3a'), None),
    'cazador': ('personaje8', receta(PIEL_MEDIA, '#8a8078', '#556b3a', '#4a3a2a', pies='#3a2a1e',
                                     ojo='#7a5a2a', gorro='#6a4a2c'), None),
    # ── (2026-10-25) los mapas de nivel 8, 9 y 10 ──
    'guia_glaciar': ('personaje11', receta(PIEL_CLARA, '#efe6cf', '#3a6a9c', '#3a4048', pies='#2a2a30',
                                           cuello_piel='#f4f0e8', ojo='#4f93c4', cabeza='personaje13', gorro='#3a6a9c'), None),
    'minero': ('personaje8', receta(PIEL_MEDIA, '#4a3a2a', '#7a5a3a', '#3a3a40', pies='#2a1e16',
                                    delantal='#5a4632', ojo='#5a3a1e', cabeza='personaje12', gorro='#d9a441'), None),
    'exploradora': ('personaje9', receta(PIEL_MORENA, '#2a1e18', '#6a7a3a', '#5a4632', pies='#3a2a1e',
                                         faja='#a8343a', ojo='#3e7a4c', cabeza='personaje8', gorro='#8a6a44'), None),
    'florista': ('personaje6', receta(PIEL_CLARA, '#c86a3a', '#e8a8bc', '#5a6a8a', delantal='#f4efe6',
                                      ojo='#4f8a3a', cabeza='personaje9', gorro='#e8d48a'), None),
    'pastor': ('personaje1', receta(PIEL_MEDIA, '#8a6a3a', '#e6dcc8', '#5a4632', pies='#3a2a1e',
                                    faja='#3a6a2c', ojo='#3d6fa8', cabeza='personaje8', gorro='#c8a85a'), None),
    # ── las casas del pueblo ──
    'panadera': ('personaje6', receta(PIEL_CLARA, '#d9a441', '#c98a6a', '#6a4a3a', delantal='#f2eee6',
                                      ojo='#3d6fa8', cabeza='personaje2'), None),
    'tallista': ('personaje3', receta(PIEL_CLARA, '#a85a2a', '#7a5a3a', '#4a3a2a', delantal='#a07a50',
                                      ojo='#4a7a3a', cabeza='personaje1'), None),
    'tejedora': ('personaje2', receta(PIEL_CLARA, '#6a4a3a', '#8a4a7a', '#4a3a5a', ojo='#6a5a8a'), None),
    'posadero': ('personaje3', receta(PIEL_MEDIA, '#7a4a2a', '#e6dccb', '#4a3a2a', delantal='#f2eee6',
                                      ojo='#5a3a1e', cabeza='personaje12', gorro='#e8e2d4'), None),
    'tabernero': ('personaje1', receta(PIEL_MEDIA, '#3a2a22', '#7a2f2a', '#3a3030', delantal='#d9cdb8',
                                       ojo='#2f5a3a'), None),
    'herbolaria': ('personaje6', receta(PIEL_CLARA, '#8a3f22', '#4f7a4a', '#5a4a3a', delantal='#cfe0b8',
                                        ojo='#4f8a3a', cabeza='personaje11', gorro='#7a9a4a'), None),
    'herrero': ('personaje3', receta(PIEL_MORENA, '#2a2220', '#6a3a2a', '#3a3030', delantal='#4a3a30',
                                     ojo='#8a5a1e', cabeza='personaje12', gorro='#4a4048'), None),
    'granjero': ('personaje8', receta(PIEL_MEDIA, '#c8c0b0', '#5a7aa8', '#4a3a2a', ojo='#3d6fa8',
                                      gorro='#b89a52'), None),
    # ── los del pueblo y la tienda: cada uno conserva lo que lo reconoce: el
    #    sombrero de paja de Joe, la capucha de Colin, el yelmo de Rurik, la
    #    capucha y el bastón de llama verde de Digby. ──
    'joe': ('personaje8', receta(PIEL_MEDIA, '#d9b25a', '#b8423a', '#3c5a8a', pies='#4a3424',
                                 ojo='#4f7a3a', delantal='#3c5a8a'), None),
    'jack': ('personaje3', receta(PIEL_CLARA, '#c0662a', '#5f6670', '#3a3a40', pies='#3a2a1e',
                                  delantal='#7a5432', ojo='#8a5a1e', cabeza='personaje1'), None),
    'colin': ('personaje10', receta(PIEL_CLARA, '#4a3020', '#3a5aa8', '#2a3a6a', pies='#2a2a3a',
                                    faja='#d9a441', ojo='#3e8a7a', gorro='#2e4a8a'), None),
    'rurik': ('personaje12', receta(PIEL_MEDIA, '#7a4a2a', '#9aa6b4', '#5a6474', pies='#3a4048',
                                    faja='#a8343a', ojo='#5a7a9a', gorro='#b8c0cc'), None),
    'digby': ('personaje13', receta('#c9b8a8', '#2a2030', '#3a2a48', '#2a2034', pies='#1e1824', ojo='#7dff9a',
                                    gorro='#2a2030',
                                    tunica=tonos('#3a2a48', 3, arriba=0.25, abajo=0.45), ribete=hex_rgb('#7dcf6a'),
                                    baculo=True, baculo_arriba=22,
                                    madera=[hex_rgb('#7a4f2c'), hex_rgb('#5c3a1f')],
                                    cristal=[hex_rgb('#e6ffd0'), hex_rgb('#7dff6a'), hex_rgb('#2f9a3a')]), None),
    'johnny': ('personaje1', receta(PIEL_MEDIA, '#9a9590', '#a87a4a', '#4a3a2a', pies='#3a2a1e',
                                    delantal='#e6dcc8', ojo='#6a5a2a'), None),
    # (2026-10-20) "En tiendajuego los dos NPC son iguales": Franklin Vesh, el
    # otro de la tienda, con su propio aspecto (moreno, pañuelo dorado,
    # camisa verde azulada y faja dorada).
    'franklin': ('personaje3', receta(PIEL_MORENA, '#231c1a', '#2f6f8f', '#3a3030', pies='#2a1e16',
                                      faja='#d9a441', ojo='#5a3a1e', cabeza='personaje12', gorro='#d9a441'), None),
}


# ===========================================================================
# LOS AÑADIDOS SOBRE EL MUÑECO
# ===========================================================================
def _segs(xs):
    xs = sorted(xs)
    out, cur = [], []
    for x in xs:
        if cur and x != cur[-1] + 1:
            out.append(cur)
            cur = []
        cur.append(x)
    if cur:
        out.append(cur)
    return out


def anadidos(li, partes, cuello, cintura, dir_, r):
    """Faja, delantal, turbante, barba y cuello de piel. `partes`, ya desplazadas."""
    vista = H2.vista_de(dir_)
    cont = r['contorno']
    # La FAJA: dos filas de color en la cintura (sobre la camisa).
    if r.get('faja'):
        t = tonos(r['faja'], 3, arriba=0.2, abajo=0.45)
        for (x, y), (p, c) in partes.items():
            if p == 'camisa' and cintura - 3 <= y <= cintura - 2:
                li.set(x, y, t[0] if y == cintura - 3 else t[1])
    # El DELANTAL: de frente, un peto del pecho a las rodillas (sin brazos).
    if r.get('delantal') and vista == 'frente':
        t = tonos(r['delantal'], 3, arriba=0.12, abajo=0.4)
        filas = {}
        for (x, y), (p, c) in partes.items():
            if p in ('camisa', 'pantalon') and y >= cuello + 4:
                filas.setdefault(y, []).append(x)
        alto_falda = cintura + (max(filas) - cintura) * 0.55 if filas else cintura
        for y, xs in filas.items():
            if y > alto_falda:
                continue
            torso = max(_segs(xs), key=len)
            x0, x1 = torso[0] + 2, torso[-1] - 2
            for x in range(x0, x1 + 1):
                li.set(x, y, t[0] if x < (x0 + x1) / 2.0 else t[1])
            if x1 - x0 >= 2:
                li.set(x0 - 1, y, cont)
                li.set(x1 + 1, y, cont)
    # (2026-10-24) "Crafter Jack tiene algo en el pecho y cuando mira de lado
    # no lo tiene": el delantal solo se pintaba de frente. De LADO se ve su
    # canto: una franja delante del torso (y del muslo de delante), del pecho
    # a las rodillas, con su línea por dentro. De ESPALDAS, la cinta que lo ata
    # a la cintura. Así ningún NPC con delantal lo pierde al girarse.
    if r.get('delantal') and vista == 'lado':
        t = tonos(r['delantal'], 3, arriba=0.12, abajo=0.4)
        filas = {}
        for (x, y), (p, c) in partes.items():
            if p in ('camisa', 'pantalon') and y >= cuello + 4:
                filas.setdefault(y, []).append(x)
        alto_falda = cintura + (max(filas) - cintura) * 0.55 if filas else cintura
        delante = dir_ == 'derecha'
        for y, xs in filas.items():
            if y > alto_falda:
                continue
            segs = _segs(xs)
            seg = max(segs, key=lambda s: s[-1]) if delante else min(segs, key=lambda s: s[0])
            if len(seg) < 4:
                continue
            if delante:
                x0, x1, borde, canto = seg[-1] - 2, seg[-1], seg[-1] - 3, seg[-1]
            else:
                x0, x1, borde, canto = seg[0], seg[0] + 2, seg[0] + 3, seg[0]
            for x in range(x0, x1 + 1):
                li.set(x, y, t[1] if x == canto else t[0])
            li.set(borde, y, cont)
    if r.get('delantal') and vista == 'espalda':
        t = tonos(r['delantal'], 3, arriba=0.12, abajo=0.4)
        y = cintura - 2
        xs = [x for (x, yy), (p, c) in partes.items() if p == 'camisa' and yy == y]
        if xs:
            torso = max(_segs(xs), key=len)
            for x in torso[1:-1]:
                li.set(x, y, t[1])
    # El CUELLO DE PIEL (trampero, pescadora): una franja clara bajo la barbilla.
    if r.get('cuello_piel'):
        t = tonos(r['cuello_piel'], 3, arriba=0.1, abajo=0.32)
        for (x, y), (p, c) in partes.items():
            if p == 'camisa' and cuello <= y <= cuello + 2:
                li.set(x, y, t[0] if (x + y) % 3 else t[1])
    # La BARBA: la piel de la barbilla (las dos últimas filas de cara), del color de la barba.
    if r.get('barba') and vista != 'espalda':
        t = tonos(r['barba'], 3, arriba=0.15, abajo=0.4)
        cara = [(x, y) for (x, y), (p, c) in partes.items() if p == 'piel' and y < cuello]
        if cara:
            yb = max(y for x, y in cara)
            for (x, y) in cara:
                if y >= yb:
                    li.set(x, y, t[1])
    # El TURBANTE: el sombrero (lo que es 'pelo' en la cabeza) vuelto tela, con
    # sus vueltas en rayas y un faldón por detrás.
    if r.get('turbante'):
        t = tonos(r['paletas_turbante'] if r.get('paletas_turbante') else '#efe6d0', 4, arriba=0.12, abajo=0.42)
        pelo = [(x, y) for (x, y), (p, c) in partes.items() if p == 'pelo' and y < cuello]
        if pelo:
            y0 = min(y for x, y in pelo)
            for (x, y) in pelo:
                k = 1 if (y - y0) % 3 else 2                     # las vueltas: una raya cada tres filas
                if (y - y0) < 2:
                    k = 0
                li.set(x, y, t[k])
    return li


# ===========================================================================
# LAS HERRAMIENTAS: la pala del sepulturero y la cimitarra de los guardias
# ===========================================================================
MADERA = [hex_rgb('#8a6440'), hex_rgb('#6a4a2c'), hex_rgb('#4a3220')]
HIERRO = [hex_rgb('#c9ced6'), hex_rgb('#8f97a3'), hex_rgb('#5f6672')]
ACERO = [hex_rgb('#eef2f6'), hex_rgb('#b9c2cc'), hex_rgb('#7c8692')]
TIERRA = [hex_rgb('#8a6a48'), hex_rgb('#6a4e34'), hex_rgb('#4a3624')]
C_HERR = (24, 20, 18)


def _contornear(capa, color):
    m = capa.mascara_opaca()
    for x, y in m.borde(diagonales=False).puntos():
        capa.set(x, y, color)


def pala(capa, gx, gy, ang, largo=19):
    """Una pala: mango de la empuñadura (gx, gy) hacia `ang`, hoja al final."""
    dx, dy = math.cos(ang), math.sin(ang)
    hx, hy = gx + dx * largo, gy + dy * largo
    mango = Mascara(capa.w, capa.h).linea(gx, gy, hx, hy, 2)
    for x, y in mango.puntos():
        capa.set(x, y, MADERA[0] if (x - gx) * -dy + (y - gy) * dx > 0 else MADERA[1])
    # La empuñadura: un travesaño corto.
    px, py = -dy, dx
    capa.set(gx + px * 1.5, gy + py * 1.5, MADERA[2])
    capa.set(gx - px * 1.5, gy - py * 1.5, MADERA[2])
    # La hoja: un trapecio de hierro, más ancha que el mango.
    a = (hx - px * 2.6, hy - py * 2.6)
    b = (hx + px * 2.6, hy + py * 2.6)
    c = (hx + px * 2.0 + dx * 6, hy + py * 2.0 + dy * 6)
    d = (hx - px * 2.0 + dx * 6, hy - py * 2.0 + dy * 6)
    hoja = Mascara(capa.w, capa.h).poligono([a, b, c, d])
    for x, y in hoja.puntos():
        lado = (x - hx) * px + (y - hy) * py
        capa.set(x, y, HIERRO[0] if lado < -0.5 else (HIERRO[1] if lado < 1.2 else HIERRO[2]))
    return (hx + dx * 6, hy + dy * 6)


def cimitarra(capa, mx, my, ang, largo=17):
    """La cimitarra: hoja curva desde la mano, guarda y pomo."""
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    puntos = []
    for i in range(largo + 1):
        u = i / float(largo)
        curva = 3.2 * u * u                              # se curva hacia el filo al final
        puntos.append((mx + dx * (i + 2) + px * curva, my + dy * (i + 2) + py * curva))
    hoja = Mascara(capa.w, capa.h)
    for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
        hoja.linea(x0, y0, x1, y1, 2)
    for x, y in hoja.puntos():
        lado = (x - mx) * px + (y - my) * py
        capa.set(x, y, ACERO[0] if lado < 0.4 else ACERO[1])
    # La guarda (de través) y el puño con su pomo.
    for k in (-2, -1, 0, 1, 2):
        capa.set(mx + dx * 1.5 + px * k, my + dy * 1.5 + py * k, hex_rgb('#c9a24a'))
    capa.set(mx - dx * 1, my - dy * 1, MADERA[2])
    capa.set(mx - dx * 2, my - dy * 2, hex_rgb('#c9a24a'))


def terron(capa, x, y, w=4, h=3):
    """Un terrón (uno solo, liso): la tierra que se echa con la pala."""
    m = Mascara(capa.w, capa.h).elipse(x, y, w / 2.0, h / 2.0)
    for xx, yy in m.puntos():
        capa.set(xx, yy, TIERRA[0] if yy < y else TIERRA[1])


def monton_tierra(capa, x, y):
    """El montón de tierra recién cavada delante del sepulturero."""
    m = Mascara(capa.w, capa.h).elipse(x, y - 2, 6.5, 3.5).intersecar(Mascara(capa.w, capa.h).rect(0, 0, capa.w - 1, y))
    for xx, yy in m.puntos():
        k = 0 if yy < y - 3 else (1 if yy < y - 1 else 2)
        capa.set(xx, yy, TIERRA[k])


# ===========================================================================
# LOS FOTOGRAMAS
# ===========================================================================
def con_margen(li):
    n = Lienzo(li.w + PAD_X * 2, li.h + PAD_Y)
    n.pegar(li, PAD_X, PAD_Y)
    return n


def mano_en_lienzo(per, dir_, n):
    _, partes, _, _ = H2.etiquetar(per, dir_, n)
    m = H2.mano_delantera(partes, dir_)
    if not m:
        return None, partes
    return (m[0] + MX + PAD_X, m[1] + MY + PAD_Y), partes


def encima_la_mano(li, base, partes, mx, my):
    """La mano que agarra va por encima del mango."""
    for (x, y), (p, c) in partes.items():
        if p == 'mano' and abs(x + MX + PAD_X - mx) <= 1 and abs(y + MY + PAD_Y - my) <= 2:
            li.set(x + MX + PAD_X, y + MY + PAD_Y, base.get(x + MX + PAD_X, y + MY + PAD_Y))


def colorear(li, partes, per, r):
    """(2026-10-21) Los CÓDIGOS de gf_cabezas.componer a los colores del NPC
    (lo mismo que hace gf-soulbound-custom.js con los del jugador). El
    sombrero, con `gorro` si lo lleva la receta; si no, el del original."""
    pal = {CB.PIEL: r['paletas']['piel'], CB.MANO: r['paletas']['mano'], CB.BARBA: r['paletas']['piel'],
           CB.PIES: r['paletas']['pies'], CB.PELO: r['paletas']['pelo'], CB.CAMISA: r['paletas']['camisa'],
           CB.PANTALON: r['paletas']['pantalon'], CB.CINTA: [hex_rgb(r.get('cinta') or '#b8403a')],
           CB.CONTORNO: [r['contorno']]}
    ojos = H2.colores_ojo(hex_rgb(r['_ojo']), r['paletas']['piel'][1])
    for rol, k in CB.OJO.items():
        pal[k] = [ojos[rol]]
    cabeza = r.get('cabeza') or per
    t_gorro = dict(CB.info(per)['t_gorro'])
    t_gorro.update(CB.info(cabeza)['t_gorro'])
    out = Lienzo(li.w, li.h)
    for (x, y), (q, c) in partes.items():
        px = li.get(x, y)
        if not px[3]:
            continue
        col = px[:3]
        if 200 <= px[2] <= 202 and px[0] in pal:
            t = pal[px[0]]
            col = t[min(len(t) - 1, int(round(px[1] / 40.0)))]
        elif q == 'gorro' and r.get('gorro'):
            col = r['gorro'][min(3, t_gorro.get(c, 1))]
        out.set(x, y, col)
    return out


def figura(per, r, dir_, n):
    """(2026-10-21) El cuerpo `per` con su cabeza (o la de r['cabeza']), del
    ARTE ORIGINAL, sin redibujar nada; y encima lo de su oficio."""
    li, partes, cuello, cintura = CB.componer(per, r.get('cabeza') or per, dir_, n)
    li = colorear(li, partes, per, r)
    if r.get('tunica'):
        li = H2.tunica(li, partes, cintura, r['tunica'], r['ribete'], r['contorno'])
    # Para lo de encima, los nombres de siempre: el turbante envuelve también
    # el gorro y los adornos de la cabeza.
    desp = {k: (('pelo' if q in ('gorro', 'adorno') else q), c) for k, (q, c) in partes.items()}
    li = anadidos(li, desp, cuello, cintura, dir_, r)
    if r.get('baculo'):
        mano = H2.mano_delantera(partes, dir_)
        if mano:
            mx, my = mano[0] + (1 if dir_ in ('derecha', 'abajo') else -1), mano[1]
            capa = Lienzo(li.w, li.h)
            H2.baculo(capa, mx, my, r['baculo_arriba'], 10, r['madera'], r['cristal'], r['contorno'])
            if dir_ in ('derecha', 'izquierda', 'abajo'):
                # Delante del cuerpo, pero la mano que lo agarra va encima.
                base = Lienzo(li.w, li.h)
                base.pegar(li)
                li.pegar(capa)
                for (x, y), (q, c) in partes.items():
                    if q == 'mano' and abs(x - mx) <= 1 and abs(y - my) <= 1:
                        li.set(x, y, base.get(x, y))
            else:
                # De espaldas: el báculo asoma por detrás del cuerpo.
                capa.pegar(li)
                li = capa
    return li


def accion_cavar(per, r, i):
    """El sepulturero, de lado (mirando a la derecha), con la pala."""
    base = con_margen(figura(per, r, 'derecha', 1 if i % 2 else 2))
    mano, partes = mano_en_lienzo(per, 'derecha', 1)
    li = Lienzo(base.w, base.h)
    li.pegar(base)
    if not mano:
        return li
    mx, my = mano
    suelo = base.h - 2
    capa = Lienzo(base.w, base.h)
    monton_tierra(capa, mx + 14, suelo)
    # 1 clavar (hoja abajo delante) · 2 hundir · 3 sacar con tierra · 4 echarla atrás
    angs = [math.radians(70), math.radians(80), math.radians(35), math.radians(-60)]
    punta = pala(capa, mx - 6 * math.cos(angs[i - 1]), my - 6 * math.sin(angs[i - 1]), angs[i - 1])
    if i == 3:
        terron(capa, punta[0] - 1, punta[1] - 2)
    if i == 4:
        terron(capa, mx - 9, my - 16, 5, 3)
    _contornear(capa, C_HERR)
    li.pegar(capa)
    encima_la_mano(li, base, partes, mx, my)
    return li


def accion_tajo(per, r, i):
    """El guardia entrena: cuatro tajos de cimitarra, de lado."""
    base = con_margen(figura(per, r, 'derecha', [1, 3, 5, 3][i - 1]))
    mano, partes = mano_en_lienzo(per, 'derecha', 1)
    li = Lienzo(base.w, base.h)
    li.pegar(base)
    if not mano:
        return li
    mx, my = mano
    capa = Lienzo(base.w, base.h)
    angs = [math.radians(-110), math.radians(-55), math.radians(-5), math.radians(35)]
    cimitarra(capa, mx, my, angs[i - 1])
    _contornear(capa, C_HERR)
    li.pegar(capa)
    encima_la_mano(li, base, partes, mx, my)
    return li


def frames_npc(nombre):
    per, r, accion = NPCS[nombre]
    # (2026-10-21) Los ojos por papel van en los códigos (gf_cabezas) y se
    # colorean en colorear(): ya no hace falta montar una paleta aquí.
    out = {}
    for d in H2.DIRS:
        for n in range(1, H2.FOTOS + 1):
            out['%s_%d' % (d, n)] = con_margen(figura(per, r, d, n))
    if accion == 'cavar':
        for i in range(1, 5):
            out['accion_%d' % i] = accion_cavar(per, r, i)
    elif accion == 'tajo':
        for i in range(1, 5):
            out['accion_%d' % i] = accion_tajo(per, r, i)
    return {k: relieve_lienzo(li, 0.6) for k, li in out.items()}


def atlas(nombre, frames, columnas=7, sep=2):
    """Todos en celdas iguales, con los pies en la misma fila (como los monstruos)."""
    nombres = list(frames.keys())
    cw = max(frames[k].w for k in nombres)
    ch = max(frames[k].h for k in nombres)
    filas = (len(nombres) + columnas - 1) // columnas
    hoja = Image.new('RGBA', (columnas * (cw + sep), filas * (ch + sep)), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-npcs.py', 'image': nombre + '.png',
                                     'format': 'RGBA8888', 'scale': '1'}}
    for idx, k in enumerate(nombres):
        li = frames[k]
        x0 = (idx % columnas) * (cw + sep)
        y0 = (idx // columnas) * (ch + sep)
        hoja.alpha_composite(li.imagen(), (x0 + (cw - li.w) // 2, y0 + ch - li.h))
        datos['frames'][k] = {'frame': {'x': x0, 'y': y0, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                              'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch}}
    os.makedirs(SALIDA, exist_ok=True)
    hoja.save(os.path.join(SALIDA, nombre + '.png'), optimize=True)
    with open(os.path.join(SALIDA, nombre + '.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, indent=1)
    print('  %-20s %2d fotogramas  celda %dx%d' % (nombre, len(nombres), cw, ch))
    return hoja


def main():
    nombres = sys.argv[1:] or list(NPCS)
    print('NPC ->', SALIDA)
    for n in nombres:
        atlas(n, frames_npc(n))
    print('listo')


if __name__ == '__main__':
    main()
