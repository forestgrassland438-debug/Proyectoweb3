#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
POCIONES — generador de `Game/newpro/pociones/`
=============================================================================

56 frascos, todos hijos del que el pack ya tenia: `utiles/pocion_vida.png`
(14x21). De ahi salen, medidos pixel a pixel, los cuatro colores que hacen que
un frasco nuevo parezca del mismo juego:

    cristal claro  #ecf6fc      cristal      #dfe9ee
    cristal sombra #c8d1d6      contorno     #20303a
    corcho         #b37a42 / #a9743f / #925f32 / #8a5a30

QUE CAMBIA DE UNA POCION A OTRA
---------------------------------------------------------------------------
Tres cosas, y las tres se leen de un vistazo en el inventario:

    LA FORMA     10 siluetas de frasco (redonda, matraz, vial, calabaza,
                 ampolla, garrafa, tarro, botella, cuadrado, faceta). Es lo
                 primero que distingue una pocion de otra a 20 px, antes que
                 el color: dos frascos identicos de colores parecidos se
                 confunden, dos formas distintas no.
    EL LIQUIDO   su color, y que NO llena el frasco: hay aire arriba y una
                 linea de menisco mas clara, que es lo que lo convierte en
                 liquido en vez de en cristal pintado.
    EL EFECTO    burbujas, posos, brillo, remolino, capas, escarcha, chispas,
                 vapor... una decoracion por familia de pocion.

EL CRISTAL
---------------------------------------------------------------------------
No es un contorno relleno: lleva la banda de reflejo vertical a la izquierda
(de donde viene la luz en todo el arte del juego) y el borde derecho un punto
mas oscuro. El liquido se pinta DEBAJO de ese reflejo, no encima, que es lo
que hace que se vea a traves del vidrio.

USO
---------------------------------------------------------------------------
    python tools/generar-pociones.py
    python tools/generar-pociones.py --hoja
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, perfil, rng_de

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'pociones')
WEB = '/Game/newpro/pociones'

W, H = 28, 34
CX = W // 2

CRISTAL = A.hex_rgb('#dfe9ee')
CRISTAL_CLARO = A.hex_rgb('#ecf6fc')
CRISTAL_SOMBRA = A.hex_rgb('#c8d1d6')
CONTORNO = A.hex_rgb('#20303a')
CORCHO = [A.hex_rgb(c) for c in ('#b37a42', '#a9743f', '#925f32', '#8a5a30')]
METAL = [A.hex_rgb(c) for c in ('#cbcbca', '#b2b2b2', '#878787', '#6b6c6c')]


# ===========================================================================
# SILUETAS DE FRASCO
#   devuelven (mascara_cuerpo, cuello_x0, cuello_x1, cuello_y, base_y)
# ===========================================================================

FORMAS = {
    # ancho y alto por defecto, ancho del cuello, alto del cuello y el perfil
    # del cuerpo (t = 0 arriba, 1 abajo; el valor es la mitad del ancho en
    # fraccion de `ancho`).
    'redonda':  dict(ancho=12, alto=11, cuello=4, hc=4,
                     perfil=[(0, .38), (.22, .86), (.50, 1.0), (.80, .94), (1, .56)]),
    'matraz':   dict(ancho=13, alto=12, cuello=3, hc=5,
                     perfil=[(0, .14), (.35, .38), (.72, .86), (1, 1.0)]),
    'vial':     dict(ancho=7, alto=15, cuello=5, hc=3,
                     perfil=[(0, .85), (.15, 1.0), (.85, 1.0), (1, .92)]),
    'calabaza': dict(ancho=12, alto=14, cuello=3, hc=3,
                     perfil=[(0, .32), (.20, .72), (.42, .50), (.74, 1.0), (1, .78)]),
    'ampolla':  dict(ancho=9, alto=11, cuello=3, hc=4,
                     perfil=[(0, .70), (.28, 1.0), (.70, .70), (1, .18)]),
    'garrafa':  dict(ancho=14, alto=12, cuello=3, hc=6,
                     perfil=[(0, .28), (.30, .72), (.62, 1.0), (1, .82)]),
    'tarro':    dict(ancho=13, alto=10, cuello=11, hc=2,
                     perfil=[(0, .94), (.10, 1.0), (.90, 1.0), (1, .90)]),
    'botella':  dict(ancho=10, alto=14, cuello=4, hc=5,
                     perfil=[(0, .32), (.22, .80), (.45, .98), (1, .96)]),
    'cuadrado': dict(ancho=12, alto=12, cuello=6, hc=3,
                     perfil=[(0, .96), (.06, 1.0), (.94, 1.0), (1, .96)]),
    'faceta':   dict(ancho=12, alto=12, cuello=4, hc=4, facetas=True,
                     perfil=[(0, .32), (.30, 1.0), (.66, .86), (1, .44)]),
}


def _cuerpo(forma, alto, ancho):
    """
    El cuerpo del frasco, sin cuello ni tapon.

    La proporcion la manda la FORMA, no la ficha: un vial es estrecho y alto y
    un tarro ancho y bajo POR SER lo que son. Cuando todas las siluetas se
    dibujaban con el mismo 12x10 de partida, las diez formas salian igual —
    una botella con el hombro un poco distinto— y el jugador no podia
    distinguir dos pociones sin leer el nombre.
    """
    m = Mascara(W, H)
    y1 = H - 4                       # la base siempre apoya aqui
    y0 = y1 - alto
    a = ancho / 2.0
    f = perfil(FORMAS[forma]['perfil'])

    topo = {}
    for i in range(alto + 1):
        t = i / float(alto)
        y = int(round(y0 + i))
        h = max(1.0, f(t) * a)
        m.fila(y, CX - h, CX + h - (1 if ancho % 2 == 0 else 0))
        topo[y] = h
    return m, y0, y1, topo


def _cuello(m, forma, y0, alto_cuello, ancho_cuello):
    """El cuello. Devuelve la y de la boca."""
    a = ancho_cuello / 2.0
    for i in range(alto_cuello):
        y = y0 - 1 - i
        ens = 0.5 if (forma in ('tarro', 'cuadrado') or i == alto_cuello - 1) else 0.0
        m.fila(y, CX - a - ens, CX + a - 1 + ens)
    return y0 - alto_cuello


def _chispas(li, mascara, color):
    """
    El destello de las pociones legendarias. Antes era un halo de un pixel
    alrededor de toda la silueta y se leia como el marco de seleccion de un
    editor, no como magia. Cuatro chispas sueltas si.
    """
    caja = mascara.caja()
    if not caja:
        return
    x0, y0, x1, y1 = caja
    c = ajusta(color, dv=2.0, ds=0.35)
    c2 = ajusta(color, dv=1.5, ds=0.55)
    sitios = [(x0 - 2, y0 + 2, 1), (x1 + 2, y0 + 5, 1), (x1 + 2, y1 - 5, 0),
              (x0 - 2, y1 - 8, 0), (x0 + 1, y0 - 3, 0)]
    for sx, sy, grande in sitios:
        li.set(sx, sy, c)
        if grande:
            li.set(sx - 1, sy, c2)
            li.set(sx + 1, sy, c2)
            li.set(sx, sy - 1, c2)
            li.set(sx, sy + 1, c2)


# ===========================================================================
# EFECTOS DEL LIQUIDO
# ===========================================================================

def _efecto(li, dentro, color, efecto, nivel, rnd, topo):
    """Decora el liquido ya pintado. `nivel` = la y del menisco."""
    pts = [(x, y) for x, y in dentro.puntos() if y > nivel]
    if not pts:
        return
    claro = ajusta(color, dv=1.6, ds=0.7)
    oscuro = ajusta(color, dv=0.62, ds=1.15)

    if efecto == 'burbujas':
        rnd.shuffle(pts)
        for x, y in pts[:max(2, len(pts) // 12)]:
            li.set(x, y, claro)
    elif efecto == 'posos':
        base = max(y for x, y in pts)
        for x, y in pts:
            if y >= base - 1 and (x + y) % 2 == 0:
                li.set(x, y, oscuro)
    elif efecto == 'brillo':
        for x, y in pts:
            if y == nivel + 1 or (x + y) % 7 == 0:
                li.set(x, y, claro)
    elif efecto == 'remolino':
        for x, y in pts:
            if int((math.sin((y - nivel) * 0.9) * 3 + x)) % 5 == 0:
                li.set(x, y, claro)
            elif int((math.sin((y - nivel) * 0.9) * 3 + x)) % 5 == 2:
                li.set(x, y, oscuro)
    elif efecto == 'capas':
        base = max(y for x, y in pts)
        corte = (nivel + base) // 2
        for x, y in pts:
            if y > corte:
                li.set(x, y, oscuro)
    elif efecto == 'escarcha':
        for x, y in pts:
            if (x * 3 + y * 5) % 11 == 0:
                li.set(x, y, (236, 248, 252))
    elif efecto == 'chispas':
        rnd.shuffle(pts)
        for x, y in pts[:max(2, len(pts) // 14)]:
            li.set(x, y, (255, 252, 226))
    elif efecto == 'grumos':
        rnd.shuffle(pts)
        for x, y in pts[:max(2, len(pts) // 9)]:
            li.set(x, y, oscuro)
            li.encima(x + 1, y, ajusta(oscuro, dv=1.2))
    elif efecto == 'ojo':
        # una pupila flotando dentro: para las pociones de vision
        cx = CX
        cy = (nivel + max(y for x, y in pts)) // 2
        for dx in (-1, 0, 1):
            li.encima(cx + dx, cy, claro)
        li.encima(cx, cy, (24, 22, 28))
    elif efecto == 'pez':
        # una silueta de pez dentro del frasco: pociones de pesca
        cy = (nivel + max(y for x, y in pts)) // 2 + 1
        for dx in (-2, -1, 0, 1):
            li.encima(CX + dx, cy, claro)
        li.encima(CX + 2, cy - 1, claro)
        li.encima(CX + 2, cy + 1, claro)
        li.encima(CX - 2, cy - 1, claro)


def _vapor(li, boca_y, color):
    """Volutas por encima del tapon (pociones que humean)."""
    c = ajusta(color, dv=1.5, ds=0.45)
    for i, (dx, dy) in enumerate([(0, -2), (1, -3), (-1, -4), (0, -5), (2, -5)]):
        li.set(CX + dx, boca_y + dy, c if i % 2 else ajusta(c, dv=0.9))


# ===========================================================================
# EL FRASCO
# ===========================================================================

def dibujar(p):
    rnd = rng_de('pocion', p['id'])
    forma = p['forma']
    F = FORMAS[forma]
    alto = p.get('alto', F['alto'])
    ancho = p.get('ancho', F['ancho'])
    color = A.hex_rgb(p['color'])
    tapon = p.get('tapon', 'corcho')

    cuerpo, y0, y1, topo = _cuerpo(forma, alto, ancho)
    ac = p.get('cuello', F['cuello'])
    hc = p.get('alto_cuello', F['hc'])
    boca_y = _cuello(cuerpo, forma, y0, hc, ac)

    li = Lienzo(W, H)

    # --- cristal ---------------------------------------------------------
    for x, y in cuerpo.puntos():
        li.set(x, y, CRISTAL)
    # reflejo a la izquierda y sombra a la derecha
    for y in range(boca_y, y1 + 1):
        fila = [x for x in range(W) if cuerpo.get(x, y)]
        if not fila:
            continue
        li.set(min(fila), y, CRISTAL_CLARO)
        li.set(min(fila) + 1, y, CRISTAL_CLARO if y % 3 else CRISTAL)
        li.set(max(fila), y, CRISTAL_SOMBRA)

    # --- liquido -----------------------------------------------------------
    dentro = Mascara(W, H)
    for x, y in cuerpo.puntos():
        if y > y0 - 1:
            dentro.set(x, y)
    dentro = dentro.copia()
    for x, y in dentro.borde_interno(False).puntos():   # el liquido no toca el vidrio
        if x == CX - ancho // 2:
            dentro.set(x, y, 0)
    nivel = int(y0 + max(1, round(alto * p.get('vacio', 0.22))))
    liquido = Mascara(W, H)
    for x, y in dentro.puntos():
        if y > nivel and 0 < y < H:
            liquido.set(x, y)
    # que no se pegue al borde: un pixel de vidrio a cada lado
    quitar = []
    for y in range(nivel + 1, y1 + 1):
        fila = sorted(x for x in range(W) if liquido.get(x, y))
        if len(fila) >= 3:
            quitar.append((fila[0], y))
            quitar.append((fila[-1], y))
        elif fila:
            quitar.append((fila[-1], y))
    for x, y in quitar:
        liquido.set(x, y, 0)

    ramp = A.rampa(color, 5)
    for x, y in liquido.puntos():
        f = (y - nivel) / float(max(1, y1 - nivel))
        i = 1 + int(f * 2.6)
        c = ramp[min(4, i)]
        fila = sorted(xx for xx in range(W) if liquido.get(xx, y))
        if fila and x == fila[0]:
            c = ajusta(c, dv=1.22, ds=0.85)
        li.set(x, y, c)
    # menisco
    for x in range(W):
        if liquido.get(x, nivel + 1):
            li.set(x, nivel + 1, ajusta(color, dv=1.45, ds=0.75))

    _efecto(li, liquido, color, p.get('efecto', 'burbujas'), nivel, rnd, topo)

    # --- tapon --------------------------------------------------------------
    m_tapon = Mascara(W, H)
    a = ac / 2.0
    if tapon == 'corcho':
        for i in range(3):
            e = 1 if i == 0 else 0
            m_tapon.fila(boca_y - 1 - i, CX - a - e, CX + a - 1 + e)
    elif tapon == 'metal':
        for i in range(3):
            m_tapon.fila(boca_y - 1 - i, CX - a - 1, CX + a)
    elif tapon == 'lacre':
        for i in range(4):
            e = 1 if i < 2 else 0
            m_tapon.fila(boca_y - 1 - i, CX - a - e, CX + a - 1 + e)
    elif tapon == 'trapo':
        m_tapon.fila(boca_y - 1, CX - a, CX + a - 1)
        m_tapon.fila(boca_y - 2, CX - a + 1, CX + a - 2)
        m_tapon.set(CX + int(a), boca_y - 3)

    if tapon == 'metal':
        cols = METAL
    elif tapon == 'lacre':
        rojo = A.hex_rgb('#a8322c')
        cols = A.rampa(rojo, 4)
    elif tapon == 'trapo':
        tela = A.hex_rgb('#c9b89a')
        cols = A.rampa(tela, 4)
    else:
        cols = CORCHO
    caja = m_tapon.caja()
    if caja:
        for x, y in m_tapon.puntos():
            f = (y - caja[1]) / float(max(1, caja[3] - caja[1]))
            i = int(f * 3)
            c = cols[min(3, i)]
            if x == caja[0]:
                c = cols[0]
            li.set(x, y, c)

    # --- etiqueta -----------------------------------------------------------
    if p.get('etiqueta'):
        et = A.hex_rgb(p['etiqueta'])
        ancho_et = 0
        yy = y0 + int(alto * 0.62)
        fila = [x for x in range(W) if cuerpo.get(x, yy)]
        if len(fila) >= 4:
            x0, x1 = min(fila) + 1, max(fila) - 1
            for x in range(x0, x1 + 1):
                li.set(x, yy, et)
                li.set(x, yy - 1, ajusta(et, dv=1.12))
            li.set(x0, yy, ajusta(et, dv=1.2))
            li.set(x1, yy - 1, ajusta(et, dv=0.8))

    # --- facetas ------------------------------------------------------------
    if FORMAS[forma].get('facetas'):
        # Vidrio TALLADO: dos aristas en diagonal desde el hombro. Sin ellas la
        # forma "faceta" salia igual que la redonda, y es la que llevan casi
        # todas las legendarias.
        for i in range(alto):
            y = y0 + i
            fila = [x for x in range(W) if cuerpo.get(x, y)]
            if len(fila) < 5:
                continue
            iz = min(fila) + 1 + i // 3
            de = max(fila) - 1 - i // 4
            if iz < de:
                li.encima(iz, y, CRISTAL_CLARO if i % 2 == 0 else mezcla(li.get(iz, y), CRISTAL_CLARO, .6))
                li.encima(de, y, CRISTAL_SOMBRA)

    total = li.mascara_opaca()
    li.contornear(total, color=CONTORNO, diagonales=True)

    if p.get('vapor'):
        _vapor(li, boca_y, color)

    if p.get('aura'):
        _chispas(li, total, color)

    return li.recortado()


# ===========================================================================
# CATALOGO
#   id | Nombre | forma | color | efecto | tapon | extras
# ===========================================================================

POCIONES = """
pocion_vida_menor       | Pocion de vida menor      | ampolla  | #c8303c | brillo    | corcho | vacio=.30,alto=10,ancho=8
pocion_vida             | Pocion de vida            | redonda  | #c8303c | brillo    | corcho |
pocion_vida_mayor       | Pocion de vida mayor      | garrafa  | #b41f2e | brillo    | lacre  | alto=15,ancho=12
pocion_vida_suprema     | Pocion de vida suprema    | faceta   | #e4364a | chispas   | metal  | alto=15,ancho=12,aura=1
pocion_energia_menor    | Pocion de energia menor   | ampolla  | #e0a52c | burbujas  | corcho | vacio=.30,alto=10,ancho=8
pocion_energia          | Pocion de energia         | redonda  | #e0a52c | burbujas  | corcho |
pocion_energia_mayor    | Pocion de energia mayor   | garrafa  | #f0bd3a | chispas   | lacre  | alto=15,ancho=12
pocion_mana_menor       | Pocion de mana menor      | ampolla  | #3f62be | remolino  | corcho | vacio=.30,alto=10,ancho=8
pocion_mana             | Pocion de mana            | matraz   | #3f62be | remolino  | corcho |
pocion_mana_mayor       | Pocion de mana mayor      | garrafa  | #2e48c8 | chispas   | metal  | alto=15,ancho=12
pocion_aliento          | Pocion de aliento         | vial     | #7fd8c8 | burbujas  | corcho | alto=14,ancho=8
antidoto                | Antidoto                  | vial     | #6fbf4a | posos     | corcho | alto=13,ancho=8
cura_enfermedad         | Cura de enfermedad        | vial     | #d8e0a8 | grumos    | trapo  | alto=13,ancho=8
pocion_fuerza           | Pocion de fuerza          | tarro    | #c05a2c | grumos    | metal  | alto=11,ancho=12
pocion_velocidad        | Pocion de velocidad       | vial     | #e8d84a | remolino  | corcho | alto=15,ancho=7
pocion_salto            | Pocion de salto           | calabaza | #8fd84a | burbujas  | corcho |
pocion_defensa          | Pocion de defensa         | cuadrado | #8f96c8 | capas     | metal  | alto=12,ancho=12
pocion_sigilo           | Pocion de sigilo          | ampolla  | #3d3050 | remolino  | trapo  | alto=12,ancho=9
pocion_vision_nocturna  | Vision nocturna           | redonda  | #2f8f6a | ojo       | corcho |
pocion_ojo_de_pez       | Ojo de pez                | redonda  | #5fa8c8 | ojo       | corcho |
pocion_frio             | Resistencia al frio       | botella  | #7fb2c8 | escarcha  | corcho | alto=14,ancho=10
pocion_fuego            | Resistencia al fuego      | botella  | #d8622a | brillo    | lacre  | alto=14,ancho=10,vapor=1
pocion_invisibilidad    | Pocion de invisibilidad   | garrafa  | #cfe0e8 | brillo    | metal  | alto=14,ancho=11,vacio=.35
pocion_suerte           | Pocion de suerte          | faceta   | #58c86f | chispas   | lacre  |
pocion_pescador         | Suerte del pescador       | calabaza | #4a9fd8 | pez       | corcho | etiqueta=#c9b89a
pocion_cebo_liquido     | Cebo liquido              | tarro    | #a8874a | grumos    | trapo  | alto=11,ancho=12
pocion_llamada_banco    | Llamada de banco          | matraz   | #2f8fa8 | pez       | corcho | etiqueta=#c9b89a
pocion_calma_del_agua   | Calma del agua            | garrafa  | #a8d8e0 | remolino  | corcho | alto=14,ancho=11
pocion_senuelo          | Senuelo brillante         | vial     | #f0e07a | chispas   | metal  | alto=14,ancho=8
pocion_red_invisible    | Red invisible             | cuadrado | #c8d8d0 | capas     | metal  | alto=12,ancho=12
pocion_anzuelo_afilado  | Anzuelo afilado           | ampolla  | #b2b2b2 | posos     | metal  | alto=11,ancho=9
pocion_agua_dulce       | Esencia de agua dulce     | botella  | #7fc8a8 | burbujas  | corcho | alto=13,ancho=10
pocion_agua_salada      | Esencia de agua salada    | botella  | #6f9fc8 | posos     | corcho | alto=13,ancho=10
pocion_crecimiento      | Pocion de crecimiento     | calabaza | #6fbf3a | burbujas  | trapo  | etiqueta=#c9b89a
fertilizante_liquido    | Fertilizante liquido      | tarro    | #7a5f30 | grumos    | trapo  | alto=11,ancho=12
agua_bendita            | Agua bendita              | matraz   | #eef4f8 | chispas   | metal  | aura=1
aceite_de_linterna      | Aceite de linterna        | botella  | #d8a83a | capas     | corcho | alto=14,ancho=9
tinta_de_calamar        | Tinta de calamar          | vial     | #22242c | remolino  | corcho | alto=13,ancho=8
salmuera                | Salmuera                  | tarro    | #cfd8c0 | posos     | trapo  | alto=11,ancho=13
esencia_de_algas        | Esencia de algas          | vial     | #3f7a4a | grumos    | corcho | alto=14,ancho=8
tonico_de_cienaga       | Tonico de cienaga         | calabaza | #5f6b2c | grumos    | trapo  |
veneno_debil            | Veneno debil              | ampolla  | #6fa82c | posos     | lacre  | alto=11,ancho=8
veneno_fuerte           | Veneno fuerte             | ampolla  | #4a8f1c | burbujas  | lacre  | alto=13,ancho=9,vapor=1
acido                   | Acido                     | matraz   | #b8d82c | burbujas  | metal  | vapor=1
brebaje_podrido         | Brebaje podrido           | tarro    | #6b5a2c | grumos    | trapo  | alto=11,ancho=12
elixir_maldito          | Elixir maldito            | faceta   | #5a2f6b | remolino  | lacre  | vapor=1
fuego_liquido           | Fuego liquido             | garrafa  | #e0621c | brillo    | metal  | alto=14,ancho=11,vapor=1
hielo_eterno            | Hielo eterno              | faceta   | #a8d8e8 | escarcha  | metal  |
rayo_embotellado        | Rayo embotellado          | botella  | #e8d84a | chispas   | metal  | alto=15,ancho=10,aura=1
niebla_embotellada      | Niebla embotellada        | garrafa  | #c0c8cf | remolino  | corcho | alto=13,ancho=11,vacio=.38
esencia_de_vacio        | Esencia del vacio         | faceta   | #2a2038 | remolino  | lacre  | aura=1
elixir_de_la_marea      | Elixir de la marea        | calabaza | #2f9fc8 | capas     | metal  | aura=1
lagrima_de_sirena       | Lagrima de sirena         | ampolla  | #a8e8e0 | chispas   | metal  | alto=12,ancho=9,aura=1
sangre_de_leviatan      | Sangre de leviatan        | garrafa  | #8a1f3a | remolino  | lacre  | alto=15,ancho=12,aura=1
elixir_estelar          | Elixir estelar            | faceta   | #d8bd4a | chispas   | metal  | aura=1
ambrosia                | Ambrosia                  | garrafa  | #f0e8a8 | brillo    | lacre  | alto=15,ancho=12,aura=1
"""


def fichas():
    fuera = []
    for linea in POCIONES.strip().split('\n'):
        partes = [c.strip() for c in linea.split('|')]
        p = dict(id=partes[0], nombre=partes[1], forma=partes[2],
                 color=partes[3], efecto=partes[4], tapon=partes[5])
        if len(partes) > 6 and partes[6]:
            for par in partes[6].split(','):
                k, _, v = par.partition('=')
                k = k.strip(); v = v.strip()
                p[k] = float(v) if v.startswith('.') else (int(v) if v.isdigit() else v)
        fuera.append(p)
    return fuera


def main():
    hoja = '--hoja' in sys.argv
    cat = []
    rutas = []
    for p in fichas():
        li = dibujar(p)
        ruta = os.path.join(DESTINO, '%s.png' % p['id'])
        li.guardar(ruta)
        rutas.append(ruta)
        cat.append({'id': p['id'], 'nombre': p['nombre'], 'forma': p['forma'],
                    'color': p['color'], 'efecto': p['efecto'], 'tapon': p['tapon'],
                    'ancho': li.w, 'alto': li.h, 'maxStack': 10,
                    'ruta': '%s/%s.png' % (WEB, p['id']),
                    'clave_phaser': p['id']})
    with io.open(os.path.join(DESTINO, 'pociones.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/pociones', 'version': 1,
                             'base_web': WEB, 'total': len(cat), 'pociones': cat},
                            ensure_ascii=False, indent=1))
    print('%d pociones escritas en %s' % (len(cat), DESTINO))
    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        A.hoja_contacto(rutas, columnas=10, escala=6).save(os.path.join(d, 'pociones.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
