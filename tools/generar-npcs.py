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
def receta(piel, pelo, camisa, pantalon, pies='#3b2c22', ojo='#3a2a20', contorno=(22, 18, 16), peinado=None,
           **extra):
    r = {
        'contorno': contorno,
        'paletas': {
            'piel': tonos(piel, 3, arriba=0.16, abajo=0.34), 'mano': tonos(piel, 3, arriba=0.16, abajo=0.34),
            'pies': tonos(pies, 3, arriba=0.18, abajo=0.5),
            'ojo': H2.ojos_brillantes(hex_rgb('#f4f0e6'), hex_rgb(ojo)),
            'pelo': tonos(pelo, 4, arriba=0.24, abajo=0.5),
            'camisa': tonos(camisa, 4, arriba=0.2, abajo=0.5),
            'pantalon': tonos(pantalon, 4, arriba=0.14, abajo=0.55),
        },
    }
    # (2026-10-19) "Los NPC deben tener diferentes cabellos y ojos": cada uno
    # su peinado (gf_humanoides2d.peinado, a la medida de la cabeza del juego)
    # y su color de ojos. Los del turbante no: el turbante ES su pelo.
    if peinado:
        r['pelo_estilo'] = peinado
        r['pelo_tonos'] = tonos(pelo, 4, arriba=0.3, abajo=0.5)
    r.update(extra)
    return r


PIEL_CLARA, PIEL_MEDIA, PIEL_MORENA = '#e8c3a0', '#d2a07a', '#a8714e'

# nombre: (personaje base, receta, acción)
NPCS = {
    # ── los mapas ──
    'sepulturero': ('personaje8', receta(PIEL_CLARA, '#2e2a2c', '#3c3633', '#2b2724', pies='#241c18',
                                         barba='#6d6660', ojo='#56606c', peinado='corto'), 'cavar'),
    'guardia_desierto': ('personaje10', receta(PIEL_MORENA, '#efe6d0', '#d8c49a', '#8a6a44', pies='#5a3e28',
                                              turbante=True, faja='#a8343a', barba='#2b2018', ojo='#8a5a1e'), 'tajo'),
    'centinela_desierto': ('personaje11', receta(PIEL_MEDIA, '#f2ead8', '#c7b18a', '#6f5235', pies='#4a3322',
                                                 turbante=True, faja='#2f6f8f', ojo='#3e7a4c'), 'tajo'),
    'trampero': ('personaje10', receta(PIEL_CLARA, '#cfc6b8', '#8a6440', '#5a4632', pies='#3a2a1e',
                                       barba='#b9a58a', cuello_piel='#e9e2d6', ojo='#3d6fa8', peinado='cola',
                                       cinta='#6a4a2a'), None),
    'pescadora_hielo': ('personaje11', receta(PIEL_CLARA, '#eadfb4', '#e6edf3', '#5a6f86', pies='#40506a',
                                              cuello_piel='#ffffff', ojo='#4f93c4', peinado='trenzas',
                                              cinta='#3f6fa0'), None),
    'guardabosques': ('personaje11', receta(PIEL_MEDIA, '#5a3a22', '#4d6b3a', '#5a4632', pies='#3a2a1e',
                                            ojo='#3e7a4c', peinado='flequillo'), None),
    'cazador': ('personaje8', receta(PIEL_MEDIA, '#5a3e28', '#556b3a', '#4a3a2a', pies='#3a2a1e',
                                     barba='#8a8078', ojo='#7a5a2a', peinado='pincho'), None),
    # ── las casas del pueblo ──
    'panadera': ('personaje10', receta(PIEL_CLARA, '#d9a441', '#c98a6a', '#6a4a3a', delantal='#f2eee6',
                                       ojo='#3d6fa8', peinado='mono'), None),
    'tallista': ('personaje3', receta(PIEL_CLARA, '#a85a2a', '#7a5a3a', '#4a3a2a', delantal='#a07a50',
                                      ojo='#4a7a3a', peinado='corto'), None),
    'tejedora': ('personaje2', receta(PIEL_CLARA, '#6a4a3a', '#8a4a7a', '#4a3a5a', ojo='#6a5a8a',
                                      peinado='trenzas', cinta='#8a4a7a'), None),
    'posadero': ('personaje3', receta(PIEL_MEDIA, '#7a4a2a', '#e6dccb', '#4a3a2a', delantal='#f2eee6',
                                      barba='#7a4a2a', ojo='#5a3a1e', peinado='flequillo'), None),
    'tabernero': ('personaje1', receta(PIEL_MEDIA, '#3a2a22', '#7a2f2a', '#3a3030', delantal='#d9cdb8',
                                       barba='#3a2a22', ojo='#2f5a3a', peinado='cola', cinta='#2a2220'), None),
    'herbolaria': ('personaje6', receta(PIEL_CLARA, '#8a3f22', '#4f7a4a', '#5a4a3a', delantal='#cfe0b8',
                                        ojo='#4f8a3a', peinado='cola', cinta='#4f7a4a'), None),
    'herrero': ('personaje4', receta(PIEL_MORENA, '#2a2220', '#6a3a2a', '#3a3030', delantal='#4a3a30',
                                    barba='#2a2220', ojo='#8a5a1e', peinado='pincho'), None),
    'granjero': ('personaje9', receta(PIEL_MEDIA, '#e3c46a', '#5a7aa8', '#4a3a2a', barba='#c8c0b0',
                                      ojo='#3d6fa8', peinado='corto'), None),
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


def figura(per, r, dir_, n):
    li = H2.humanoide(per, dir_, n, r)
    _, partes, cuello, cintura = H2.etiquetar(per, dir_, n)
    desp = {(x + MX, y + MY): v for (x, y), v in partes.items()}
    li = anadidos(li, desp, cuello + MY, cintura + MY, dir_, r)
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
