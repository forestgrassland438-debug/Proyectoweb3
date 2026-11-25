# -*- coding: utf-8 -*-
"""
=============================================================================
EL ARTE DE LOS SIETE MAPAS DEL CONTINENTE DEL ESTE               (2026-11-21)
=============================================================================

"Quiero 7 mapas nuevos ... árboles nuevos y nuevas cosas en 2.5D respetando
los gráficos del juego y el tamaño original del jugador y del mapa ... uno de
esos mapas es un pueblo: ponlo lejos, con casas nuevas, NPC, una tienda ... no
uses cosas que existen en las imágenes del juego, haz nuevas, y que no se vean
pegadas al suelo ni mal."

Este módulo NO dibuja a mano ni toca nada de lo que ya existe: AÑADE, al
importarse, lo de los siete mapas nuevos a los catálogos de siempre:

  · gf_biomas.BIOMAS    la paleta del suelo de cada mapa (el tileset del
                        pueblo recoloreado, igual que los demás mapas).
  · gf_props3d.MAT      los materiales nuevos (5 tonos en bandas lisas).
  · gf_props3d.CATALOGO cada objeto: un MODELO 3D pequeño fotografiado con la
                        cámara del juego (32° desde arriba, luz arriba a la
                        izquierda, contorno del juego) y su ficha de siempre:
                        (modelo, ancho, alto, suelo, contorno, huella en px del
                        juego, ancho de la sombra, vista[, k]).

LOS MAPAS Y LO SUYO
  puerto   Saltwind Harbor: OCHO casas del puerto (cada una con su pared, su
           tejado —a dos aguas de lado o con el hastial de frente—, ventanas
           con postigos, jardineras, balcón, entramado o sillares), la tienda
           con su toldo, la taberna, el faro y lo del muelle (barriles, cajas,
           ancla, norays, faroles, un bote varado, cuerda, el puesto de
           pescado, bancos, boyas, la fuente del ancla, maceteros).
  pantano  Mirefen Bog: choza en zancos, tronco caído, juncos, farol de fuego
           fatuo, el caldero, un tótem, una raíz retorcida, rocas y setas.
  aldor    Las ruinas hundidas de Aldor: columnas (caída, con hiedra, rota),
           el pórtico, el obelisco del sol, el altar solar, la escalinata
           rota, braseros de oro, ánforas, un muro roto y la cabeza de piedra.
  colinas  Amberleaf Highlands: calabazas, hojas, leña apilada, tocón con
           hacha, cerca rústica, la cabaña del cazador, el carro de leña,
           rocas con liquen, setas de otoño y gavillas.
  selva    Emerald Jungle: el templo escalonado, la cabeza de piedra, helechos,
           flores, rocas con lianas, bambú, troncos y la cabaña de paja.
  volcan   Emberfall Caldera: rocas con grietas de lava, fumarolas, cristales
           de fuego, el yunque, la forja, el cráneo del dragón, braseros, el
           obelisco de obsidiana y rocas con vetas.
  hongos   Glowcap Hollow: setas de luz, cristales, raíces que brillan,
           tocones con musgo, faroles de luciérnaga, la casa seta, piedras con
           runas y hongos de repisa.

SIN MOTAS NI AGUJEROS (el dueño del juego tiene tripofobia): todo lo que
lleva textura la lleva en BANDAS y RAYAS (tablas, hiladas, tejas, aros,
costillas, estrías); ni puntos, ni poros, ni racimos, ni redes; las setas sin
lunares; los troncos de lado (sin anillos de la cara). Ninguna pieza repetida
lleva reflejo especular.

Determinista: mismos bytes en cada ejecución.
=============================================================================
"""
import colorsys
import math

import numpy as np

import gf_biomas
import gf_props3d as P
from gf_arte import rampa, hex_rgb, contorno_de
from gf_bestias3d import elip, cono, roca, giro_z, _local

caja, cortar, giro_x, giro_y = P.caja, P.cortar, P.giro_x, P.giro_y

# ===========================================================================
# LOS BIOMAS (la paleta del suelo de cada mapa)
# ===========================================================================
# (tono, saturación, valor medio, cuánto se abre el valor). El agua tiene que
# seguir siendo AZUL (gf-agua y la pesca la reconocen por el color) y los
# caminos no pueden acercarse al azul (b - r < 35): se comprueba en
# comprobar_biomas() contra el tileset entero.
BIOMAS = {
    # El puerto: hierba de costa, viva; caminos de arena clara; piedra cálida
    # de muelle; el mar azul limpio.
    'puerto': {
        'hierba': (0.245, 0.46, 0.60, 0.85),
        'tierra': (0.100, 0.30, 0.78, 0.65),
        'piedra': (0.085, 0.10, 0.72, 0.90),
        'agua':   (0.565, 0.64, 0.80, 0.45),
        'otro_sat': 0.95, 'otro_val': 1.0,
    },
    # El pantano: hierba oliva oscura, barro, piedra con verdín y agua turbia
    # (aún azul).
    'pantano': {
        'hierba': (0.225, 0.40, 0.42, 0.85),
        'tierra': (0.075, 0.36, 0.42, 0.85),
        'piedra': (0.250, 0.10, 0.46, 0.95),
        'agua':   (0.548, 0.56, 0.58, 0.55),
        'otro_sat': 0.6, 'otro_val': 0.86,
    },
    # Aldor: hierba dorada, arena prensada, piedra de mármol cálido, agua
    # turquesa de las fuentes hundidas.
    'aldor': {
        'hierba': (0.200, 0.38, 0.62, 0.80),
        'tierra': (0.110, 0.36, 0.80, 0.62),
        'piedra': (0.110, 0.16, 0.76, 0.90),
        'agua':   (0.540, 0.62, 0.80, 0.45),
        'otro_sat': 0.8, 'otro_val': 1.0,
    },
    # Las colinas de otoño: hierba ámbar, tierra parda, piedra pizarra y el
    # azul hondo de los lagos de montaña.
    'colinas': {
        'hierba': (0.135, 0.50, 0.62, 0.85),
        'tierra': (0.070, 0.40, 0.52, 0.80),
        'piedra': (0.600, 0.08, 0.54, 0.95),
        'agua':   (0.585, 0.58, 0.72, 0.50),
        'otro_sat': 0.85, 'otro_val': 1.0,
    },
    # La selva: verde intenso, tierra roja, piedra con musgo y el río verdoso.
    'selva': {
        'hierba': (0.300, 0.62, 0.46, 0.85),
        'tierra': (0.045, 0.50, 0.54, 0.80),
        'piedra': (0.300, 0.14, 0.50, 0.95),
        'agua':   (0.550, 0.62, 0.64, 0.50),
        'otro_sat': 1.0, 'otro_val': 0.95,
    },
    # El volcán: ceniza (gris cálido y oscuro), sendas de escoria rojiza,
    # obsidiana y las pozas de agua termal (turquesa).
    'volcan': {
        'hierba': (0.030, 0.12, 0.32, 0.80),
        'tierra': (0.030, 0.42, 0.42, 0.80),
        'piedra': (0.700, 0.08, 0.36, 0.95),
        'agua':   (0.535, 0.60, 0.66, 0.50),
        'otro_sat': 0.4, 'otro_val': 0.7,
    },
    # La hondonada de las setas: musgo violeta en penumbra, tierra parda
    # violácea, piedra azulada y el agua que brilla.
    'hongos': {
        'hierba': (0.760, 0.26, 0.36, 0.75),
        'tierra': (0.080, 0.22, 0.40, 0.80),
        'piedra': (0.620, 0.12, 0.42, 0.95),
        'agua':   (0.520, 0.70, 0.64, 0.50),
        'otro_sat': 0.45, 'otro_val': 0.7,
    },
}
REINOS = list(BIOMAS)
for _n, _b in BIOMAS.items():
    assert _n not in gf_biomas.BIOMAS or gf_biomas.BIOMAS[_n] == _b, 'el bioma %s ya existe' % _n
    gf_biomas.BIOMAS[_n] = _b


# ===========================================================================
# MATERIALES
# ===========================================================================
def tonos(h, arriba=0.32, abajo=0.58):
    return rampa(hex_rgb(h), 5, arriba=arriba, abajo=abajo)


def _oscuro(h, k=0.62, sat=1.12):
    r, g, b = hex_rgb(h)
    hh, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    rr, gg, bb = colorsys.hsv_to_rgb(hh, min(1.0, s * sat), v * k)
    return '#%02x%02x%02x' % (int(rr * 255), int(gg * 255), int(bb * 255))


NUEVOS = {}


def mat(nombre, h, arriba=0.32, abajo=0.58, linea=True, k=0.62):
    """Un material y (si `linea`) su raya: el mismo color más hundido."""
    NUEVOS[nombre] = {'tonos': tonos(h, arriba, abajo)}
    if linea:
        NUEVOS[nombre + '_l'] = {'tonos': tonos(_oscuro(h, k), arriba * 0.8, abajo * 0.8)}


def luz(nombre, h):
    NUEVOS[nombre] = {'emite': hex_rgb(h)}


# comunes
mat('marco_blanco', '#eee8dc', 0.18, 0.40)
mat('vidrio', '#4f7390', 0.30, 0.45)
mat('puerta_madera', '#7a4a2c')
mat('piedra_puerto', '#b8ab96')
mat('piedra_clara_r', '#d6cfc0', 0.22, 0.45)
mat('madera_r', '#8a5e3a')
mat('madera_osc_r', '#4e3420')
mat('madera_clara_r', '#b08356')
mat('hierro_r', '#3d404a', 0.35, 0.5)
mat('ladrillo_r', '#a0523c')
mat('hoja_r', '#4f8f3a', 0.30, 0.55)
mat('hoja_osc_r', '#356a2c', 0.26, 0.5)
luz('luz_ventana', '#ffd98a')
luz('llama_r', '#ffcf5a')
luz('llama_naranja', '#ff9a3a')
luz('llama_amarilla', '#ffe9a0')
mat('hueco_oscuro', '#2a2024', 0.12, 0.3, linea=False)
# las paredes y los tejados de las casas del puerto
for _nombre, _hex in (('pared_azul', '#9cc0de'), ('pared_coral', '#ec9580'), ('pared_ocre', '#dcae5a'),
                      ('pared_menta', '#a6d8bc'), ('pared_piedra', '#a8a49a'), ('pared_terracota', '#cf7c52'),
                      ('pared_lila', '#c0a8da'), ('pared_marfil', '#efe4cc'), ('pared_tienda', '#e8d2a6'),
                      ('pared_taberna', '#d9c7a4')):
    mat(_nombre, _hex, 0.24, 0.50, k=0.72)
for _nombre, _hex in (('teja_terracota', '#b4553a'), ('teja_pizarra', '#4f5a6a'), ('teja_roja_r', '#a8443a'),
                      ('teja_verde', '#3c6a72'), ('teja_negra', '#3d4450'), ('teja_naranja', '#cf8a3a'),
                      ('teja_azul', '#3e4f86'), ('teja_parda', '#7a4a32')):
    mat(_nombre, _hex, 0.30, 0.55)
for _nombre, _hex in (('postigo_blanco', '#e6e2d6'), ('postigo_verde', '#4f8a5a'), ('postigo_azul', '#3f6f9f'),
                      ('postigo_rojo', '#a8443a'), ('postigo_amarillo', '#e0b84a'), ('postigo_gris', '#6f7682')):
    mat(_nombre, _hex, 0.25, 0.5)
mat('flor_roja_r', '#e05a4a', 0.28, 0.42, linea=False)
mat('flor_rosa_r', '#ee8fb0', 0.25, 0.42, linea=False)
mat('flor_amarilla_r', '#f0c64a', 0.25, 0.40, linea=False)
mat('flor_lila_r', '#b08ae0', 0.30, 0.45, linea=False)
mat('toldo_rojo', '#c44a3e', 0.28, 0.5)
mat('toldo_azul', '#3f74b0', 0.28, 0.5)
mat('toldo_verde', '#3f8f62', 0.28, 0.5)
mat('toldo_blanco', '#f2ece0', 0.18, 0.38)
mat('viga', '#5a3a26')
mat('oro_r', '#e0b84a', 0.4, 0.5)
# el muelle
mat('barril', '#9a6a3e')
mat('aro', '#4a4a52', 0.35, 0.5)
mat('caja_madera', '#b48a58')
mat('ancla', '#3f4650', 0.4, 0.5)
mat('bote_casco', '#2f6f8f')
mat('bote_franja', '#e8e2d2', 0.2, 0.4)
mat('bote_interior', '#8a5e3a')
mat('cuerda', '#c8a66a', 0.28, 0.5)
mat('pez_plata', '#a9c0cc', 0.40, 0.5)
mat('hielo_pesc', '#dceaf0', 0.15, 0.3)
mat('boya_roja', '#d24a3a')
mat('boya_blanca', '#f0ece2', 0.18, 0.38)
mat('agua_fuente', '#4a8ac0', 0.4, 0.4, linea=False)
mat('barro_maceta', '#c0663e')
mat('arbusto', '#4f9a44', 0.3, 0.55)
mat('faro_rojo', '#c8402f', 0.28, 0.5)
mat('faro_blanco', '#f0ebe0', 0.16, 0.38)
luz('luz_faro', '#fff2b0')
luz('luz_farol_p', '#ffd47a')
# el pantano
mat('madera_pantano', '#6a5038')
mat('junco_pared', '#a89060', 0.28, 0.5)
mat('paja_pantano', '#9a8a50', 0.28, 0.5)
mat('corteza_pantano', '#5a4a3a')
mat('musgo_pantano', '#5f7f3a', 0.28, 0.5)
mat('espadana', '#6a4428')
mat('hoja_junco', '#6f8f3e', 0.3, 0.5)
mat('barro', '#4a3c2c', 0.25, 0.5)
luz('luz_fatuo', '#9dfcd8')
mat('caldero_negro', '#2e3036', 0.35, 0.4)
luz('pocima_verde', '#a8ff6a')
mat('madera_totem', '#7a5a3a')
mat('madera_totem_c', '#a07848')
mat('roca_pantano', '#6c7064')
mat('seta_crema', '#e2d6b8', 0.2, 0.45)
mat('seta_ocre', '#c89a52', 0.28, 0.5)
# aldor
mat('marmol_aldor', '#e6dcc6', 0.18, 0.46)
mat('arenisca_aldor', '#d8b47a')
mat('marmol_gris', '#b8b2a6', 0.22, 0.5)
luz('oro_sol', '#ffd45a')
mat('oro_metal', '#d8a83a', 0.38, 0.5)
mat('hiedra', '#5f8f3a', 0.28, 0.5)
mat('barro_aldor', '#c47a48')
mat('pintura_negra', '#3a2a24', 0.2, 0.4, linea=False)
mat('grabado_aldor', '#8a7a5e', 0.2, 0.45, linea=False)
# las colinas
mat('calabaza_c', '#e07a2a', 0.28, 0.45)
mat('calabaza_b', '#e8c45a', 0.25, 0.45)
mat('hojas_naranja', '#e08a3a', 0.28, 0.5)
mat('hojas_rojo', '#c44a32', 0.28, 0.5)
mat('hojas_amarillo', '#ecc04a', 0.25, 0.45)
mat('corteza_otono', '#6e4e36')
mat('madera_anillo', '#c8a070', 0.22, 0.45)
mat('troncos_cabana', '#8a5e3c')
mat('piedra_chimenea', '#8e8a80')
mat('roca_gris_c', '#8a8a86')
mat('liquen_naranja', '#d88a3a', 0.26, 0.45)
mat('liquen_amarillo', '#d8c25a', 0.25, 0.45)
mat('seta_marron', '#8a5432', 0.3, 0.5)
mat('seta_pie', '#e8dcc2', 0.18, 0.42)
mat('trigo', '#dcb45e', 0.28, 0.5)
mat('hueso_r', '#e6dcc2', 0.25, 0.5)
# la selva
mat('piedra_selva', '#8a8e74')
mat('musgo_selva', '#4f8f3a', 0.28, 0.5)
mat('liana', '#3f6f2a', 0.25, 0.5)
luz('luz_jade', '#7dffb0')
mat('helecho', '#3f8f3a', 0.3, 0.5)
mat('flor_tropical', '#e8483a', 0.28, 0.42)
mat('flor_centro', '#f2c84a', 0.25, 0.4, linea=False)
mat('bambu', '#a8b84a', 0.28, 0.5)
mat('hoja_bambu', '#5f9a3a', 0.3, 0.5)
mat('corteza_selva', '#5e4a34')
mat('madera_selva', '#8a6a44')
mat('bambu_pared', '#c2b06a', 0.26, 0.5)
mat('paja_selva', '#b8a058', 0.28, 0.5)
# el volcán
mat('basalto', '#4a4650', 0.32, 0.5)
mat('basalto_o', '#34313a', 0.3, 0.45)
mat('roca_ceniza', '#6a625e')
luz('brasa_lava', '#ff7a2a')
luz('lava_clara', '#ffc04a')
mat('azufre', '#d8c24a', 0.25, 0.45, linea=False)
mat('cristal_rojo', '#e0503a', 0.42, 0.5)
luz('cristal_rojo_luz', '#ffb07a')
mat('madera_quemada', '#4a3a30')
mat('hierro_negro', '#2c2e34', 0.38, 0.4)
mat('ladrillo_forja', '#7a5044')
mat('hueso_dragon', '#d8ccb0', 0.25, 0.5)
mat('obsidiana', '#2e2a3a', 0.4, 0.4)
luz('runa_roja', '#ff6a4a')
# las setas
mat('seta_azul', '#4a9ad8', 0.38, 0.5)
mat('seta_rosa', '#d86aa8', 0.36, 0.5)
mat('seta_verde', '#5ac8a0', 0.36, 0.5)
luz('luz_seta_azul', '#a8f0ff')
luz('luz_seta_rosa', '#ffc0e8')
mat('pie_seta', '#d8d0c6', 0.18, 0.42)
mat('cristal_cian', '#5ad8e0', 0.45, 0.5)
luz('cristal_cian_luz', '#d8ffff')
mat('raiz', '#5a4a46')
luz('luz_raiz', '#7affd8')
mat('musgo_hongos', '#6a7aa8', 0.3, 0.5)
mat('tocon_hongos', '#5e4a44')
luz('luz_luciernaga', '#e6ff8a')
mat('tallo_casa', '#e2d8c6', 0.2, 0.45)
mat('sombrero_casa', '#b84a6a', 0.34, 0.5)
mat('puerta_seta', '#6a4a3a')
mat('piedra_runa', '#6a6a80')
luz('runa_violeta', '#d6a0ff')
mat('repisa_naranja', '#e08a4a', 0.3, 0.5)
mat('repisa_cian', '#4ab8b0', 0.3, 0.5)

for _n, _m in NUEVOS.items():
    assert _n not in P.MAT, 'el material %s ya existe' % _n
P.MAT.update(NUEVOS)


def mats(*nombres):
    """Los materiales que pide un modelo (y sus rayas, si las tienen)."""
    out = {}
    for n in nombres:
        out[n] = P.MAT[n]
        if n + '_l' in P.MAT:
            out[n + '_l'] = P.MAT[n + '_l']
    return out


def todos():
    return dict(P.MAT)


# ===========================================================================
# PIEZAS
# ===========================================================================
def tubo(a, b, ra, rb, m, lados=None):
    """Un cilindro o un tronco de cono DE VERDAD, con las tapas planas.

    El `cono` de gf_bestias3d es una CAPSULA (distancia al segmento menos el
    radio): con mucho radio y poca altura sale una bola. Va bien para palos,
    cuerdas, raices y llamas; para un barril, una pila, una rueda o una torre,
    esto: un prisma de muchas caras (la luz va en 5 bandas, no se nota).
    """
    a = np.array(a, float); b = np.array(b, float)
    eje = b - a
    L = float(np.linalg.norm(eje))
    eje = eje / L
    ref = np.array([0.0, 1.0, 0.0]) if abs(eje[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(eje, ref); u /= np.linalg.norm(u)
    v = np.cross(eje, u)
    if lados is None:
        lados = max(16, min(48, int(10 + 2.2 * max(ra, rb))))
    s = (ra - rb) / L                     # lo que se estrecha por unidad de eje
    N, D = [eje, -eje], [L / 2.0, L / 2.0]
    for i in range(lados):
        t = 2 * math.pi * (i + 0.5) / lados
        n = math.cos(t) * u + math.sin(t) * v + s * eje
        Ln = float(np.linalg.norm(n))
        N.append(n / Ln)
        D.append((ra + rb) / 2.0 / Ln)
    return {'t': 'r', 'c': (a + b) / 2.0, 'N': np.array(N), 'D': np.array(D), 'mat': m, 'rot': None,
            'a': a, 'b': b}


def cil(a, b, r, m):
    return tubo(a, b, r, r, m)


def prisma(c, planos, m, rot=None):
    """Un poliedro convexo: cada plano es (normal, d) con normal·q <= d."""
    N, D = [], []
    for n, d in planos:
        n = np.array(n, float)
        L = float(np.linalg.norm(n))
        N.append(n / L)
        D.append(float(d) / L)
    return {'t': 'r', 'c': np.array(c, float), 'N': np.array(N), 'D': np.array(D), 'mat': m, 'rot': rot}


def tejado_x(y0, hw, hd, h, m):
    """A dos aguas con la cumbrera de lado a lado: se ve el faldón de delante."""
    return prisma((0, y0, 0), [((1, 0, 0), hw), ((-1, 0, 0), hw), ((0, -1, 0), 0),
                               ((0, hd, h), h * hd), ((0, hd, -h), h * hd)], m)


def tejado_z(y0, hw, hd, h, m):
    """A dos aguas con la cumbrera de delante atrás: se ve el hastial."""
    return prisma((0, y0, 0), [((0, 0, 1), hd), ((0, 0, -1), hd), ((0, -1, 0), 0),
                               ((h, hw, 0), h * hw), ((-h, hw, 0), h * hw)], m)


def piramide(c, hw, hd, h, m):
    return prisma(c, [((0, -1, 0), 0), ((h, hw, 0), h * hw), ((-h, hw, 0), h * hw),
                      ((0, hd, h), h * hd), ((0, hd, -h), h * hd)], m)


def tronco_piramide(c, a, b, alto, m):
    """Un pilar cuadrado que se estrecha (de medio ancho `a` abajo a `b` arriba)."""
    s = (a - b) / float(alto)
    return prisma(c, [((0, -1, 0), 0), ((0, 1, 0), alto), ((1, s, 0), a), ((-1, s, 0), a),
                      ((0, s, 1), a), ((0, s, -1), a)], m)


def ejes(dx, arriba=(0.0, 1.0, 0.0)):
    """Una rotación cuyo eje x local apunta a `dx` (columnas = ejes locales)."""
    ex = np.array(dx, float); ex /= np.linalg.norm(ex)
    up = np.array(arriba, float)
    if abs(float(ex @ up)) > 0.95:
        up = np.array([0.0, 0.0, 1.0])
    ez = np.cross(ex, up); ez /= np.linalg.norm(ez)
    ey = np.cross(ez, ex)
    return np.stack([ex, ey, ez], axis=1)


def cadena(puntos, r0, r1, m):
    """Conos encadenados (una raíz, una rama, un palo torcido)."""
    out = []
    n = len(puntos) - 1
    for i in range(n):
        ra = r0 + (r1 - r0) * i / float(n)
        rb = r0 + (r1 - r0) * (i + 1) / float(n)
        out.append(cono(puntos[i], puntos[i + 1], ra, rb, m))
    return out


def angulo(Pm, cx, cz):
    return math.atan2(Pm[2] - cz, Pm[0] - cx)


def raya(v, paso, grueso):
    return (v % paso) < grueso


def de(p, lista):
    return any(p is q for q in lista)


# ===========================================================================
# EL PUERTO: LAS CASAS
# ===========================================================================
def ventana(pr, vidrios, persianas, x, y, z, w, h, marco='marco_blanco', persiana=None, jardinera=None, luz_=False):
    pr.append(caja((x, y, z + 0.3), (w + 0.9, h + 0.9, 0.45), marco, bisel=0.99, arista=0.99))
    v = caja((x, y, z + 0.55), (w, h, 0.45), 'luz_ventana' if luz_ else 'vidrio', bisel=0.99, arista=0.99)
    pr.append(v)
    vidrios.append(v)
    pr.append(caja((x, y - h - 1.1, z + 0.9), (w + 1.4, 0.45, 1.0), 'piedra_clara_r'))
    if persiana:
        for sg in (-1, 1):
            q = caja((x + sg * (w + 0.9 + w * 0.55), y, z + 0.5), (w * 0.55, h + 0.9, 0.4), persiana, bisel=0.99, arista=0.99)
            pr.append(q)
            persianas.append(q)
    if jardinera:
        pr.append(caja((x, y - h - 2.0, z + 1.4), (w + 1.1, 0.9, 1.2), 'madera_r'))
        pr.append(elip((x, y - h - 0.9, z + 1.5), (w + 0.9, 1.3, 1.25), jardinera))


def casa_puerto(pared, tejado, persiana=None, cumbrera='x', alto=30.0, ancho=24.0, pisos=1, balcon=False,
                jardinera=None, chimenea=True, entramado=False, sillares=False, toldo=None, redonda=False, puerta_x=0.0):
    """Una casa del puerto (k=1.6: el doble de alta que el jugador)."""
    D = 15.0
    pr, vidrios, persianas, rayas_v = [], [], [], []
    cuerpo = caja((0, alto / 2.0, 0), (ancho, alto / 2.0, D), pared, bisel=0.995, arista=0.997)
    pr.append(cuerpo)
    pr.append(caja((0, 1.5, 0.4), (ancho + 0.8, 1.5, D + 0.8), 'piedra_puerto'))
    if cumbrera == 'x':
        hd, hw, h = D + 4.5, ancho + 3.0, 15.0
        techo = tejado_x(alto - 1.0, hw, hd, h, tejado)
        pr.append(caja((0, alto - 0.4, hd - 0.6), (hw + 0.2, 0.7, 0.8), 'madera_osc_r'))
    else:
        hd, hw, h = D + 2.6, ancho + 4.0, 17.0
        techo = tejado_z(alto - 1.0, hw, hd, h, tejado)
        L = math.hypot(hw, h)
        a = math.atan2(h, hw)
        for sg in (-1, 1):
            pr.append(caja((sg * hw / 2.0, alto - 1.0 + h / 2.0, hd + 0.35), (L / 2.0 + 0.6, 0.75, 0.5), 'madera_osc_r', rot=giro_z(-sg * a)))
        if redonda:
            pr.append(cortar(elip((0, alto + 5.0, hd + 0.4), (3.4, 3.4, 0.7), 'marco_blanco'), (0, alto + 5.0, hd + 0.1), (0, 0, -1)))
            v = cortar(elip((0, alto + 5.0, hd + 0.7), (2.6, 2.6, 0.7), 'vidrio'), (0, alto + 5.0, hd + 0.4), (0, 0, -1))
            pr.append(v)
    pr.append(techo)
    # la puerta, con sus escalones y (si lo hay) el toldo encima
    pt = puerta_x
    pr.append(caja((pt, 10.4, D + 0.3), (4.5, 10.4, 0.5), 'marco_blanco', bisel=0.99, arista=0.99))
    puerta = caja((pt, 9.8, D + 0.55), (3.7, 9.8, 0.5), 'puerta_madera', bisel=0.99, arista=0.99)
    pr.append(puerta)
    pr.append(caja((pt, 0.7, D + 2.4), (5.2, 0.7, 2.0), 'piedra_puerto'))
    if toldo:
        t = caja((pt, 23.0, D + 3.0), (6.2, 0.45, 3.4), toldo, rot=giro_x(0.45))
        pr.append(t)
        rayas_v.append(t)
    # las ventanas de abajo
    xs = [x for x in (-ancho * 0.62, ancho * 0.62) if abs(x - pt) > 9]
    for x in xs:
        ventana(pr, vidrios, persianas, x, 12.6 if pisos == 1 else 12.0, D, 3.3, 4.2, persiana=persiana, jardinera=jardinera)
    if pisos == 2:
        y2 = alto * 0.74
        for x in (-ancho * 0.62, 0.0, ancho * 0.62):
            ventana(pr, vidrios, persianas, x, y2, D, 2.8, 3.4, persiana=persiana)
        if balcon:
            yb = y2 - 5.2
            pr.append(caja((0, yb, D + 2.6), (ancho * 0.5, 0.6, 2.8), 'piedra_clara_r'))
            for i in range(9):
                bx = -ancho * 0.5 + 0.8 + i * (ancho - 1.6) / 8.0
                pr.append(cil((bx, yb + 0.5, D + 5.0), (bx, yb + 4.0, D + 5.0), 0.28, 'hierro_r'))
            pr.append(cil((-ancho * 0.5, yb + 4.2, D + 5.0), (ancho * 0.5, yb + 4.2, D + 5.0), 0.4, 'hierro_r'))
    if chimenea:
        cx_ = ancho * 0.55 if cumbrera == 'x' else -ancho * 0.45
        cz_ = -4.0 if cumbrera == 'x' else -6.0
        pr.append(caja((cx_, alto + 9.0, cz_), (2.6, 7.0, 2.6), 'ladrillo_r'))
        pr.append(caja((cx_, alto + 16.4, cz_), (3.2, 0.6, 3.2), 'piedra_puerto'))

    def ret(p, Pm, nm, nw):
        if p is techo:
            if cumbrera == 'z' and nm[2] > 0.9:
                if entramado:
                    return 'viga' if abs(Pm[0]) < 0.6 or raya(Pm[1] - alto, 8.0, 0.7) else pared
                return pared                              # el hastial: la misma pared
            if nm[1] > 0.2 and raya(Pm[1] - (alto - 1.0), 3.0, 0.62):
                return tejado + '_l'                      # las hileras de tejas
            return None
        if p is cuerpo and nm[2] > 0.9:
            if entramado:
                x, y = Pm[0], Pm[1]
                if abs(abs(x) - ancho) < 1.0 or abs(x) < 0.5 or abs(abs(x) - ancho * 0.5) < 0.45:
                    return 'viga'
                if abs(y - alto * 0.5) < 0.55 or abs(y - (alto - 1.6)) < 0.55:
                    return 'viga'
            if sillares and raya(Pm[1], 3.4, 0.45):
                return pared + '_l'                       # las hiladas de piedra
            return None
        if p is puerta:
            q = _local(p, Pm[None, :])[0]
            if raya(q[0] + 3.7, 1.85, 0.34):
                return 'puerta_madera_l'                  # las tablas de la puerta
            return None
        if de(p, vidrios):
            q = _local(p, Pm[None, :])[0]
            if abs(q[0]) < 0.32 or abs(q[1]) < 0.32:
                return 'marco_blanco'                     # el parteluz
            return None
        if de(p, persianas):
            q = _local(p, Pm[None, :])[0]
            if raya(q[1] + 10, 1.3, 0.36):
                return p['mat'] + '_l'                    # las lamas
            return None
        if de(p, rayas_v):
            q = _local(p, Pm[None, :])[0]
            if raya(q[0] + 12, 2.6, 1.3):
                return 'toldo_blanco'                     # las franjas del toldo
        return None
    nombres = {pared, tejado, 'piedra_puerto', 'madera_osc_r', 'marco_blanco', 'vidrio', 'puerta_madera', 'piedra_clara_r',
               'ladrillo_r', 'madera_r', 'hierro_r', 'viga', 'luz_ventana', 'toldo_blanco'}
    if persiana: nombres.add(persiana)
    if jardinera: nombres.add(jardinera)
    if toldo: nombres.add(toldo)
    return pr, ret, mats(*sorted(nombres))


CASAS = {
    'casa_azul': dict(pared='pared_azul', tejado='teja_terracota', persiana='postigo_blanco', cumbrera='x', jardinera='flor_roja_r'),
    'casa_coral': dict(pared='pared_coral', tejado='teja_pizarra', persiana='postigo_azul', cumbrera='z', redonda=True, alto=28.0, ancho=22.0, chimenea=False),
    'casa_ocre': dict(pared='pared_ocre', tejado='teja_roja_r', persiana='postigo_verde', cumbrera='x', pisos=2, alto=42.0, balcon=True),
    'casa_menta': dict(pared='pared_menta', tejado='teja_verde', persiana='postigo_blanco', cumbrera='z', jardinera='flor_rosa_r', alto=29.0, ancho=23.0, toldo='toldo_verde'),
    'casa_pizarra': dict(pared='pared_piedra', tejado='teja_negra', persiana='postigo_rojo', cumbrera='x', sillares=True, puerta_x=-8.0),
    'casa_terracota': dict(pared='pared_terracota', tejado='teja_naranja', persiana='postigo_amarillo', cumbrera='z', pisos=2, alto=40.0, ancho=22.0, redonda=True),
    'casa_lila': dict(pared='pared_lila', tejado='teja_azul', persiana='postigo_blanco', cumbrera='x', jardinera='flor_amarilla_r', toldo='toldo_azul'),
    'casa_marfil': dict(pared='pared_marfil', tejado='teja_parda', persiana='postigo_gris', cumbrera='z', pisos=2, alto=42.0, ancho=24.0, entramado=True, jardinera='flor_lila_r'),
}


def casa(nombre):
    return lambda: casa_puerto(**CASAS[nombre])


def tienda_puerto():
    """La tienda de Bartholomew: ancha, con su toldo a rayas, el mostrador con
    la mercancía (cajas, barriles, un saco) y el letrero con la moneda."""
    pr, ret0, m0 = casa_puerto('pared_tienda', 'teja_terracota', persiana='postigo_azul', cumbrera='x', alto=32.0,
                               ancho=30.0, chimenea=True, jardinera='flor_rosa_r', puerta_x=-14.0)
    D = 15.0
    toldo = caja((7.0, 19.0, D + 4.6), (15.5, 0.5, 5.2), 'toldo_rojo', rot=giro_x(0.42))
    pr.append(toldo)
    for x in (-8.0, 22.0):
        pr.append(cil((x, 0, D + 9.0), (x, 16.8, D + 9.0), 0.55, 'madera_osc_r'))
    mostrador = caja((7.0, 4.4, D + 6.0), (13.0, 4.4, 2.6), 'madera_r')
    pr.append(mostrador)
    pr.append(caja((7.0, 9.0, D + 6.0), (13.6, 0.5, 3.0), 'madera_clara_r'))
    for (x, z, s) in ((-1.0, D + 6.0, 2.4), (3.4, D + 6.4, 2.0), (13.0, D + 6.0, 2.2)):
        pr.append(caja((x, 9.5 + s, z), (s, s, s), 'caja_madera'))
    barriles = [cil((17.5, 9.5, D + 6.0), (17.5, 14.5, D + 6.0), 2.2, 'barril')]
    pr += barriles
    pr.append(elip((8.0, 10.8, D + 6.4), (2.2, 1.6, 1.8), 'cuerda'))
    letrero = caja((7.0, 27.4, D + 1.2), (8.0, 2.6, 0.5), 'madera_osc_r')
    pr.append(letrero)
    pr.append(cortar(cil((7.0, 27.4, D + 1.4), (7.0, 27.4, D + 2.2), 1.9, 'oro_r'), (7.0, 27.4, D + 1.5), (0, 0, -1)))

    def ret(p, Pm, nm, nw):
        if p is toldo:
            q = _local(p, Pm[None, :])[0]
            return 'toldo_blanco' if raya(q[0] + 32, 3.2, 1.6) else None
        if p is mostrador and nm[2] > 0.9:
            return 'madera_r_l' if raya(Pm[1], 2.2, 0.4) else None
        if de(p, barriles) and abs(nm[1]) < 0.6:
            return 'aro' if (abs(Pm[1] - 10.6) < 0.5 or abs(Pm[1] - 13.4) < 0.5) else None
        if p['mat'] == 'caja_madera' and nm[2] > 0.9:
            return 'caja_madera_l' if raya(Pm[1], 1.6, 0.36) else None
        return ret0(p, Pm, nm, nw)
    m0.update(mats('toldo_rojo', 'toldo_blanco', 'madera_clara_r', 'caja_madera', 'barril', 'aro', 'cuerda', 'oro_r', 'madera_osc_r'))
    return pr, ret, m0


def taberna_puerto():
    """La taberna del Ancla Salada: dos plantas con entramado, las ventanas
    encendidas, el letrero colgado con su jarra y barriles junto a la puerta."""
    pr, ret0, m0 = casa_puerto('pared_taberna', 'teja_parda', persiana=None, cumbrera='x', alto=44.0, ancho=28.0,
                               pisos=2, entramado=True, chimenea=True, puerta_x=0.0)
    # las ventanas de la taberna, encendidas: se cambian los vidrios por luz
    for p in pr:
        if p['mat'] == 'vidrio':
            p['mat'] = 'luz_ventana'
    D = 15.0
    pr.append(cil((7.0, 21.0, D + 0.6), (7.0, 21.0, D + 6.0), 0.4, 'hierro_r'))
    letrero = caja((7.0, 17.6, D + 5.0), (3.2, 2.6, 0.45), 'madera_osc_r')
    pr.append(letrero)
    pr.append(cil((7.0, 16.8, D + 5.5), (7.0, 18.8, D + 5.5), 1.0, 'oro_r'))
    barriles = []
    for (x, z) in ((-9.0, D + 4.0), (-12.5, D + 2.6), (10.5, D + 4.2)):
        barriles.append(cil((x, 0, z), (x, 6.0, z), 2.6, 'barril'))
    pr += barriles

    def ret(p, Pm, nm, nw):
        if de(p, barriles):
            if abs(nm[1]) < 0.6 and (abs(Pm[1] - 1.2) < 0.5 or abs(Pm[1] - 4.8) < 0.5):
                return 'aro'
            if nm[1] > 0.9:
                return 'barril_l' if math.hypot(Pm[0] - p['a'][0], Pm[2] - p['a'][2]) > 2.0 else None
            return None
        return ret0(p, Pm, nm, nw)
    m0.update(mats('barril', 'aro', 'oro_r', 'madera_osc_r', 'hierro_r', 'luz_ventana'))
    return pr, ret, m0


def faro():
    """El faro del cabo: la base de piedra, la torre a franjas rojas y blancas,
    la galería, la linterna que alumbra y el tejadillo rojo."""
    base = cil((0, 0, 0), (0, 6, 0), 11.0, 'piedra_puerto')
    torre = tubo((0, 6, 0), (0, 70, 0), 8.5, 6.0, 'faro_blanco')
    galeria = cil((0, 70, 0), (0, 71.4, 0), 8.6, 'hierro_r')
    baranda = cil((0, 71.4, 0), (0, 73.4, 0), 8.2, 'hierro_r')
    linterna = cil((0, 71.4, 0), (0, 79.5, 0), 5.0, 'luz_faro')
    pr = [base, torre, galeria, baranda, linterna,
          tubo((0, 79.5, 0), (0, 86.0, 0), 6.4, 0.6, 'faro_rojo'),
          elip((0, 86.6, 0), (1.1, 1.1, 1.1), 'hierro_r'),
          caja((0, 4.4, 10.6), (2.8, 4.4, 0.8), 'puerta_madera'),
          caja((0, 9.2, 10.8), (3.6, 0.6, 1.0), 'piedra_clara_r')]
    for y in (28.0, 50.0):
        pr.append(caja((0, y, 7.9 - (y - 6) * 2.5 / 64.0), (0.9, 2.4, 0.4), 'vidrio'))

    def ret(p, Pm, nm, nw):
        if p is torre:
            return 'faro_rojo' if raya(Pm[1] - 6.0, 16.0, 8.0) else None
        if p is base and abs(nm[1]) < 0.6:
            return 'piedra_puerto_l' if raya(Pm[1], 2.0, 0.4) else None
        if p is baranda and abs(nm[1]) < 0.6:
            ang = angulo(Pm, 0, 0)
            return None if ((ang / (2 * math.pi)) * 28) % 1.0 < 0.3 else 'hueco_oscuro'
        if p is linterna and abs(nm[1]) < 0.6:
            ang = angulo(Pm, 0, 0)
            return 'hierro_r' if ((ang / (2 * math.pi)) * 8) % 1.0 < 0.12 else None
        return None
    return pr, ret, mats('piedra_puerto', 'faro_blanco', 'faro_rojo', 'hierro_r', 'luz_faro', 'puerta_madera', 'piedra_clara_r', 'vidrio', 'hueco_oscuro')


# ── LO DEL MUELLE ────────────────────────────────────────────────────────
def barril():
    cuerpo = cil((0, 0, 0), (0, 13, 0), 5.0, 'barril')
    panza = elip((0, 6.5, 0), (5.6, 5.2, 5.6), 'barril')
    pr = [cuerpo, panza]

    def ret(p, Pm, nm, nw):
        if nm[1] > 0.9:
            return 'aro' if math.hypot(Pm[0], Pm[2]) > 4.2 else 'barril_l' if raya(Pm[0] + 10, 2.4, 0.35) else None
        y = Pm[1]
        if abs(y - 1.6) < 0.6 or abs(y - 11.4) < 0.6 or abs(y - 6.5) < 0.5:
            return 'aro'
        if ((angulo(Pm, 0, 0) / (2 * math.pi)) * 14) % 1.0 < 0.1:
            return 'barril_l'
        return None
    return pr, ret, mats('barril', 'aro')


def cajas():
    a = caja((-1.0, 5.0, 0), (6.0, 5.0, 5.4), 'caja_madera', bisel=0.97, arista=0.985)
    b = caja((2.0, 14.4, -0.6), (5.0, 4.4, 4.8), 'caja_madera', rot=giro_y(0.28), bisel=0.97, arista=0.985)
    ext = {id(a): (6.0, 5.0, 5.4), id(b): (5.0, 4.4, 4.8)}

    def ret(p, Pm, nm, nw):
        e = ext.get(id(p))
        if not e:
            return None
        q = _local(p, Pm[None, :])[0]
        if abs(nm[1]) > 0.9:
            if abs(q[0]) > e[0] - 0.9 or abs(q[2]) > e[2] - 0.9:
                return 'caja_madera_l'
            return 'caja_madera_l' if raya(q[0] + 10, 2.4, 0.32) else None
        if abs(q[0]) > e[0] - 0.9 or abs(q[1]) > e[1] - 0.9:
            return 'madera_osc_r'                       # el marco
        return 'caja_madera_l' if raya(q[1] + 10, 2.2, 0.32) else None
    return [a, b], ret, mats('caja_madera', 'madera_osc_r')


def ancla():
    pr = [caja((0, 2.0, 0), (7.0, 2.0, 5.0), 'piedra_puerto'),
          cil((0, 3.5, 0), (0, 24.0, 0), 1.3, 'ancla'),
          cil((-7.0, 21.0, 0), (7.0, 21.0, 0), 1.0, 'ancla'),
          elip((-7.6, 21.0, 0), (1.2, 1.2, 1.2), 'ancla'), elip((7.6, 21.0, 0), (1.2, 1.2, 1.2), 'ancla'),
          cortar(elip((0, 26.4, 0), (2.4, 2.4, 0.9), 'ancla'), (0, 24.0, 0), (0, -1, 0)),
          elip((0, 4.6, 0), (2.2, 1.6, 1.6), 'ancla')]
    for sg in (-1, 1):
        pr.append(cono((0, 4.6, 0), (sg * 7.6, 8.4, 0), 1.4, 1.0, 'ancla'))
        pr.append(cono((sg * 7.6, 8.4, 0), (sg * 9.0, 12.6, 0), 2.2, 0.3, 'ancla'))
    pr.append(cil((-6.0, 4.2, 5.2), (6.0, 4.2, 5.2), 0.55, 'cuerda'))

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'piedra_puerto' and nm[2] > 0.9:
            return 'piedra_puerto_l' if raya(Pm[1], 1.4, 0.3) else None
        return None
    return pr, ret, mats('piedra_puerto', 'ancla', 'cuerda')


def noray():
    pr = [cil((0, 0, 0), (0, 6.0, 0), 2.4, 'ancla'), elip((0, 6.4, 0), (3.4, 1.6, 3.4), 'ancla'),
          cil((0, 0, 0), (0, 1.0, 0), 3.2, 'piedra_puerto')]
    return pr, None, mats('ancla', 'piedra_puerto')


def farol_puerto():
    linterna = caja((0, 33.0, 0), (3.0, 3.4, 3.0), 'luz_farol_p', bisel=0.99, arista=0.99)
    pr = [caja((0, 1.2, 0), (3.0, 1.2, 3.0), 'piedra_puerto'), cil((0, 2.4, 0), (0, 4.4, 0), 1.6, 'hierro_r'),
          cil((0, 4.4, 0), (0, 29.6, 0), 1.0, 'hierro_r'),
          caja((0, 29.6, 0), (3.4, 0.5, 3.4), 'hierro_r'), linterna,
          piramide((0, 36.4, 0), 4.0, 4.0, 3.6, 'hierro_r'), elip((0, 40.4, 0), (0.9, 0.9, 0.9), 'hierro_r')]

    def ret(p, Pm, nm, nw):
        if p is linterna:
            q = _local(p, Pm[None, :])[0]
            if abs(q[0]) > 2.4 or abs(q[2]) > 2.4 or abs(q[1]) > 2.8 or (abs(q[0]) < 0.35 and nm[2] > 0.5):
                return 'hierro_r'
        return None
    return pr, ret, mats('piedra_puerto', 'hierro_r', 'luz_farol_p')


def bote_varado():
    casco = cortar(elip((0, 4.2, 0), (15.0, 5.6, 6.4), 'bote_casco'), (0, 4.8, 0), (0, 1, 0))
    pr = [casco]
    for x in (-5.0, 4.0):
        pr.append(caja((x, 4.95, 0), (1.3, 0.35, 5.2), 'madera_r'))
    pr.append(cil((-11.0, 5.4, -2.6), (9.0, 5.4, 4.0), 0.45, 'madera_clara_r'))
    pr.append(caja((9.5, 5.6, 3.8), (2.2, 0.35, 0.9), 'madera_clara_r', rot=giro_y(-0.32)))

    def ret(p, Pm, nm, nw):
        if p is casco:
            if nm[1] > 0.95:
                rho = math.hypot(Pm[0] / 14.9, Pm[2] / 6.35)
                if rho > 0.86:
                    return 'madera_clara_r'               # la borda
                return 'bote_interior'                    # liso: girado, una raya fina sale a trozos
            if Pm[1] > 3.7:
                return 'bote_franja'
            return 'bote_casco_l' if raya(Pm[1], 1.9, 0.35) else None
        return None
    return pr, ret, mats('bote_casco', 'bote_franja', 'bote_interior', 'madera_r', 'madera_clara_r')


def rollo_cuerda():
    a = cil((0, 0, 0), (0, 3.2, 0), 5.2, 'cuerda')
    b = cil((0, 3.2, 0), (0, 5.6, 0), 3.6, 'cuerda')

    def ret(p, Pm, nm, nw):
        if nm[1] > 0.9:
            r = math.hypot(Pm[0], Pm[2])
            return 'cuerda_l' if raya(r, 1.3, 0.42) else None
        return 'cuerda_l' if raya(Pm[1], 0.95, 0.3) else None
    return [a, b], ret, mats('cuerda')


def puesto_pescado():
    pr = [caja((0, 7.0, 0), (11.0, 0.8, 5.5), 'madera_r'), caja((0, 8.2, 0.5), (10.0, 0.5, 4.8), 'hielo_pesc')]
    for x in (-10.0, 10.0):
        for z in (-4.6, 4.6):
            pr.append(cil((x, 0, z), (x, 6.4, z), 0.6, 'madera_osc_r'))
            pr.append(cil((x, 6.4, z), (x, 22.0, z), 0.4, 'madera_osc_r'))
    for (x, z, a) in ((-5.6, 1.4, 0.25), (0.4, 0.2, -0.18), (6.0, 1.8, 0.4)):
        pr.append(elip((x, 9.4, z), (3.2, 0.95, 1.35), 'pez_plata', rot=giro_y(a)))
        tx, tz = x - 3.6 * math.cos(a), z + 3.6 * math.sin(a)
        pr.append(cono((x - 2.8 * math.cos(a), 9.4, z + 2.8 * math.sin(a)), (tx, 9.6, tz), 0.7, 0.2, 'pez_plata'))
    toldo = caja((0, 22.4, 0), (12.0, 0.5, 6.6), 'toldo_azul', rot=giro_x(0.12))
    pr.append(toldo)
    cesta = cil((8.4, 0, 8.2), (8.4, 4.0, 8.2), 3.0, 'cuerda')
    pr.append(cesta)
    pr.append(elip((8.4, 4.0, 8.2), (2.4, 0.8, 2.4), 'pez_plata'))

    def ret(p, Pm, nm, nw):
        if p is toldo:
            q = _local(p, Pm[None, :])[0]
            return 'toldo_blanco' if raya(q[0] + 24, 4.0, 2.0) else None
        if p is cesta and abs(nm[1]) < 0.6:
            return 'cuerda_l' if raya(Pm[1], 1.0, 0.35) else None
        if p['mat'] == 'pez_plata' and abs(nm[1]) < 0.8 and Pm[1] < 9.0:
            return 'pez_plata_l'
        return None
    return pr, ret, mats('madera_r', 'madera_osc_r', 'hielo_pesc', 'pez_plata', 'toldo_azul', 'toldo_blanco', 'cuerda')


def banco_puerto():
    respaldo = caja((0, 8.6, -2.6), (9.6, 2.2, 0.5), 'madera_r', rot=giro_x(-0.15))
    asiento = caja((0, 4.9, 0), (10.0, 0.7, 3.2), 'piedra_clara_r')
    pr = [caja((-7.0, 2.2, 0), (1.6, 2.2, 2.8), 'piedra_puerto'), caja((7.0, 2.2, 0), (1.6, 2.2, 2.8), 'piedra_puerto'),
          asiento, respaldo, cil((-8.0, 5.4, -2.6), (-8.0, 10.6, -3.4), 0.5, 'hierro_r'), cil((8.0, 5.4, -2.6), (8.0, 10.6, -3.4), 0.5, 'hierro_r')]

    def ret(p, Pm, nm, nw):
        if p is respaldo:
            q = _local(p, Pm[None, :])[0]
            return 'madera_r_l' if raya(q[1] + 4, 1.5, 0.3) else None
        return None
    return pr, ret, mats('piedra_puerto', 'piedra_clara_r', 'madera_r', 'hierro_r')


def boya():
    cuerpo = elip((0, 7.0, 0), (4.0, 6.0, 4.0), 'boya_roja')
    pr = [caja((0, 1.0, 0), (3.4, 1.0, 3.4), 'madera_osc_r'), cuerpo, cil((0, 12.6, 0), (0, 15.4, 0), 0.5, 'hierro_r'),
          elip((0, 16.0, 0), (1.0, 1.1, 1.0), 'luz_farol_p')]

    def ret(p, Pm, nm, nw):
        if p is cuerpo and 5.6 < Pm[1] < 8.4:
            return 'boya_blanca'
        return None
    return pr, ret, mats('boya_roja', 'boya_blanca', 'madera_osc_r', 'hierro_r', 'luz_farol_p')


def fuente_ancla():
    pila = cil((0, 0, 0), (0, 4.6, 0), 14.0, 'piedra_puerto')
    taza = cortar(elip((0, 12.6, 0), (6.0, 2.2, 6.0), 'piedra_clara_r'), (0, 13.4, 0), (0, 1, 0))
    pr = [pila, cil((0, 0, 0), (0, 1.0, 0), 15.4, 'piedra_clara_r'), cil((0, 4.6, 0), (0, 11.6, 0), 2.6, 'piedra_clara_r'), taza,
          cil((0, 13.4, 0), (0, 22.0, 0), 0.9, 'ancla'), cil((-3.6, 20.4, 0), (3.6, 20.4, 0), 0.6, 'ancla'),
          cortar(elip((0, 23.4, 0), (1.5, 1.5, 0.6), 'ancla'), (0, 22.0, 0), (0, -1, 0))]
    for sg in (-1, 1):
        pr.append(cono((0, 14.6, 0), (sg * 3.8, 16.4, 0), 0.8, 0.6, 'ancla'))
        pr.append(cono((sg * 3.8, 16.4, 0), (sg * 4.4, 18.4, 0), 1.2, 0.2, 'ancla'))

    def ret(p, Pm, nm, nw):
        if p is pila:
            if nm[1] > 0.9:
                r = math.hypot(Pm[0], Pm[2])
                if r < 12.4:
                    return 'agua_fuente_l' if raya(r, 3.6, 0.5) else 'agua_fuente'
                return None
            return 'piedra_puerto_l' if raya(Pm[1], 2.3, 0.4) else None
        if p is taza and nm[1] > 0.9 and math.hypot(Pm[0], Pm[2]) < 5.0:
            return 'agua_fuente'
        return None
    out = mats('piedra_puerto', 'piedra_clara_r', 'ancla')
    out['agua_fuente'] = P.MAT['agua_fuente']
    out['agua_fuente_l'] = {'tonos': tonos('#7ab4e0', 0.3, 0.3)}
    return pr, ret, out


def macetero():
    maceta = tubo((0, 0, 0), (0, 6.0, 0), 3.6, 4.8, 'barro_maceta')
    pr = [maceta, cil((0, 6.0, 0), (0, 6.8, 0), 5.2, 'barro_maceta'), elip((0, 11.4, 0), (6.2, 5.6, 6.2), 'arbusto')]

    def ret(p, Pm, nm, nw):
        if p is maceta and abs(Pm[1] - 3.0) < 0.5:
            return 'barro_maceta_l'
        return None
    return pr, ret, mats('barro_maceta', 'arbusto')


# ===========================================================================
# EL PANTANO
# ===========================================================================
def choza_zancos():
    plataforma = caja((0, 8.0, 0), (15.0, 1.0, 12.0), 'madera_pantano')
    paredes = caja((0, 15.0, -0.5), (11.0, 6.0, 8.5), 'junco_pared')
    techo = piramide((0, 20.6, -0.5), 14.5, 12.0, 12.0, 'paja_pantano')
    pr = [plataforma, paredes, techo, caja((0, 13.6, 8.2), (2.6, 4.6, 0.4), 'hueco_oscuro')]
    for (x, z) in ((-13.0, -10.0), (13.0, -10.0), (-13.0, 10.0), (13.0, 10.0), (0, 10.4), (0, -10.4)):
        pr.append(tubo((x, 0.0, z), (x, 8.0, z), 1.0, 0.8, 'madera_osc_r'))
    for sg in (-1, 1):
        pr.append(cil((sg * 2.0, 0, 16.4), (sg * 2.0, 8.6, 12.4), 0.45, 'madera_r'))
    for t in (0.25, 0.5, 0.75):
        z = 16.4 - 4.0 * t
        pr.append(cil((-2.0, 8.6 * t, z), (2.0, 8.6 * t, z), 0.35, 'madera_r'))
    pr.append(cil((13.0, 8.0, 10.0), (13.0, 19.0, 10.0), 0.45, 'madera_osc_r'))
    pr.append(caja((13.0, 16.6, 10.0), (1.4, 1.8, 1.4), 'luz_fatuo'))

    def ret(p, Pm, nm, nw):
        if p is plataforma and nm[1] > 0.9:
            return 'madera_pantano_l' if raya(Pm[0] + 20, 2.2, 0.4) else None
        if p is paredes and nm[2] > 0.9:
            return 'junco_pared_l' if raya(Pm[0] + 20, 1.5, 0.35) else None
        if p is techo:
            return 'paja_pantano_l' if raya(Pm[1], 2.2, 0.55) else None
        return None
    return pr, ret, mats('madera_pantano', 'junco_pared', 'paja_pantano', 'hueco_oscuro', 'madera_osc_r', 'madera_r', 'luz_fatuo')


def _tronco_tumbado(corteza, musgo, largo=15.0, r=3.6):
    t = cil((-largo, r - 0.4, 0), (largo, r - 0.4, 0), r, corteza)

    def ret(p, Pm, nm, nw):
        if p is t:
            if musgo and Pm[1] > r * 1.55 and raya(Pm[0] * 0.35 + math.sin(Pm[0] * 0.5), 6.0, 4.0):
                return musgo
            ang = math.atan2(Pm[1] - (r - 0.4), Pm[2])
            if ((ang / (2 * math.pi)) * 11) % 1.0 < 0.14:
                return corteza + '_l'
        return None
    return t, ret


def tronco_caido():
    t, ret0 = _tronco_tumbado('corteza_pantano', 'musgo_pantano')
    pr = [t, cono((5.0, 5.0, 1.0), (8.0, 10.0, 3.0), 1.2, 0.6, 'corteza_pantano')]
    for (x, z, s) in ((-9.0, 4.6, 1.0), (-6.4, 5.2, 0.8)):
        pr.append(cil((x, 0, z), (x, 3.0 * s, z), 0.6 * s, 'seta_crema'))
        pr.append(cortar(elip((x, 3.0 * s, z), (2.0 * s, 1.2 * s, 2.0 * s), 'seta_ocre'), (x, 2.9 * s, z), (0, -1, 0)))
    return pr, ret0, mats('corteza_pantano', 'musgo_pantano', 'seta_crema', 'seta_ocre')


def juncos():
    pr = [elip((0, 0.4, 0), (6.0, 1.2, 4.5), 'barro')]
    tallos = ((-3.0, -1.0, 24, -0.8), (-1.0, 1.4, 20, 0.4), (1.4, -1.6, 26, 0.9), (3.4, 1.0, 18, 1.3), (0.2, 2.6, 15, -0.3), (-3.8, 2.2, 13, -1.2))
    for i, (x, z, h, inc) in enumerate(tallos):
        pr.append(cono((x, 0.5, z), (x + inc, h, z), 0.5, 0.3, 'hoja_junco'))
        if i < 3:
            pr.append(elip((x + inc * 0.85, h - 3.4, z), (1.0, 2.8, 1.0), 'espadana'))
    for (x, z, a, h) in ((-1.6, 0.6, 0.35, 9.0), (2.2, 0.2, -0.4, 8.0), (0.4, -1.2, 0.1, 10.0)):
        pr.append(caja((x, h, z), (0.6, h, 0.25), 'hoja_junco', rot=giro_z(a)))
    return pr, None, mats('barro', 'hoja_junco', 'espadana')


def farol_fatuo():
    pr = cadena([(0, 0, 0), (1.0, 10.0, 0), (-0.5, 20.0, 0), (2.4, 27.0, 0)], 1.0, 0.6, 'madera_osc_r')
    pr.append(cono((2.4, 27.0, 0), (7.0, 27.6, 0), 0.6, 0.4, 'madera_osc_r'))
    pr.append(cil((7.0, 27.4, 0), (7.0, 25.4, 0), 0.25, 'hierro_r'))
    farol = caja((7.0, 23.0, 0), (1.8, 2.4, 1.8), 'luz_fatuo', bisel=0.99, arista=0.99)
    pr.append(farol)
    pr.append(piramide((7.0, 25.4, 0), 2.2, 2.2, 1.6, 'hierro_r'))
    pr.append(elip((11.0, 29.0, 2.0), (1.5, 1.5, 1.5), 'luz_fatuo'))

    def ret(p, Pm, nm, nw):
        if p is farol:
            q = _local(p, Pm[None, :])[0]
            if abs(q[0]) > 1.4 or abs(q[2]) > 1.4 or abs(q[1]) > 2.0:
                return 'hierro_r'
        return None
    return pr, ret, mats('madera_osc_r', 'hierro_r', 'luz_fatuo')


def caldero_pantano():
    olla = cortar(elip((0, 6.0, 0), (7.0, 6.0, 7.0), 'caldero_negro'), (0, 9.6, 0), (0, 1, 0))
    pr = [olla, cil((0, 9.6, 0), (0, 10.4, 0), 6.6, 'caldero_negro')]
    for a in (0.4, 2.5, 4.6):
        pr.append(roca((math.cos(a) * 6.4, 1.2, math.sin(a) * 5.2), (2.0, 1.4, 1.8), 'roca_pantano'))
    for a in (0.0, 2.1, 4.2):
        pr.append(cono((math.cos(a) * 9.0, 0, math.sin(a) * 7.0), (0, 22.0, 0), 0.6, 0.45, 'madera_osc_r'))
    pr.append(cil((0, 22.0, 0), (0, 10.8, 0), 0.25, 'hierro_r'))

    def ret(p, Pm, nm, nw):
        if nm[1] > 0.9 and Pm[1] > 9.9 and math.hypot(Pm[0], Pm[2]) < 5.6:
            return 'pocima_verde'
        return None
    return pr, ret, mats('caldero_negro', 'pocima_verde', 'roca_pantano', 'madera_osc_r', 'hierro_r')


def totem_pantano():
    cuerpo = cil((0, 8.0, 0), (0, 16.0, 0), 3.8, 'madera_totem_c')
    pr = [caja((0, 4.0, 0), (4.0, 4.0, 3.6), 'madera_totem'), cuerpo, caja((0, 19.6, 0), (4.4, 3.6, 3.8), 'madera_totem'),
          cono((0, 18.6, 3.8), (0, 17.2, 6.2), 1.2, 0.3, 'madera_totem_c')]
    for sg in (-1, 1):
        pr.append(caja((sg * 1.7, 20.4, 3.9), (1.0, 0.35, 0.3), 'luz_fatuo'))
        pr.append(caja((sg * 6.4, 21.0, 0), (2.6, 1.5, 0.6), 'madera_totem_c', rot=giro_z(sg * 0.35)))
        pr.append(caja((sg * 1.6, 5.2, 3.7), (0.9, 0.3, 0.3), 'madera_totem_l'))

    def ret(p, Pm, nm, nw):
        if p is cuerpo and abs(nm[1]) < 0.6:
            return 'madera_totem_c_l' if raya(Pm[1], 2.0, 0.42) else None
        return None
    return pr, ret, mats('madera_totem', 'madera_totem_c', 'luz_fatuo')


def _arco_raiz(corteza, r0=2.8, r1=1.4, ancho=12.0, alto=16.0, z=0.0):
    pts = []
    for i in range(9):
        t = i / 8.0
        a = math.pi * (1 - t)
        pts.append((math.cos(a) * ancho, math.sin(a) * alto - 0.6, z + math.sin(a * 2) * 1.2))
    out = []
    for i in range(8):
        t0, t1 = i / 8.0, (i + 1) / 8.0
        ra = r0 + (r1 - r0) * (1 - abs(2 * t0 - 1))
        rb = r0 + (r1 - r0) * (1 - abs(2 * t1 - 1))
        out.append(cono(pts[i], pts[i + 1], ra, rb, corteza))
    return out


def raiz_retorcida():
    pr = _arco_raiz('corteza_pantano') + _arco_raiz('corteza_pantano', 1.6, 0.9, 10.0, 12.5, 2.4)
    pr.append(elip((-12.0, 0.6, 0), (4.0, 1.6, 3.6), 'corteza_pantano'))
    pr.append(elip((12.0, 0.6, 0), (4.0, 1.6, 3.6), 'corteza_pantano'))

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.7 and Pm[1] > 10:
            return 'musgo_pantano'
        return 'corteza_pantano_l' if raya(Pm[0] + Pm[1] * 0.6 + 40, 3.0, 0.45) else None
    return pr, ret, mats('corteza_pantano', 'musgo_pantano')


def roca_pantano():
    pr = [roca((0, 5.0, 0), (9.0, 5.5, 7.0), 'roca_pantano', bisel=0.82, arista=0.9),
          roca((7.4, 3.0, 3.4), (4.5, 3.0, 4.0), 'roca_pantano', bisel=0.8, arista=0.9)]

    def ret(p, Pm, nm, nw):
        return 'musgo_pantano' if nw[1] > 0.6 else None
    return pr, ret, mats('roca_pantano', 'musgo_pantano')


def seta_pantano():
    pr = []
    for (x, z, s) in ((0, 0, 1.3), (5.0, 2.4, 0.9), (-4.4, 2.0, 0.8)):
        pr.append(tubo((x, 0, z), (x, 5.0 * s, z), 0.9 * s, 0.7 * s, 'seta_crema'))
        pr.append(cortar(elip((x, 5.0 * s, z), (3.0 * s, 1.5 * s, 3.0 * s), 'seta_ocre'), (x, 4.9 * s, z), (0, -1, 0)))

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'seta_ocre' and nw[1] < 0.35:
            return 'seta_ocre_l'
        return None
    return pr, ret, mats('seta_crema', 'seta_ocre')


# ===========================================================================
# ALDOR, LAS RUINAS HUNDIDAS
# ===========================================================================
def _estrias(p, Pm, eje, c, n=16):
    """Las estrías de una columna (rayas alrededor de su eje)."""
    if eje == 'y':
        ang = math.atan2(Pm[2] - c[2], Pm[0] - c[0])
    else:
        ang = math.atan2(Pm[1] - c[1], Pm[2] - c[2])
    return ((ang / (2 * math.pi)) * n) % 1.0 < 0.22


def columna_caida():
    a = cil((-14.0, 3.4, 0), (-2.0, 3.4, 0), 3.4, 'marmol_aldor')
    b = cil((0.6, 3.0, 1.0), (11.0, 3.0, 3.0), 3.0, 'marmol_aldor')
    capitel = caja((13.8, 2.8, 3.6), (2.6, 2.8, 4.0), 'marmol_aldor', rot=giro_y(-0.2))
    pr = [a, b, capitel, roca((-4.0, 0.8, 4.6), (1.6, 0.8, 1.4), 'marmol_aldor')]

    def ret(p, Pm, nm, nw):
        if p is a and _estrias(p, Pm, 'x', (0, 3.4, 0)):
            return 'marmol_aldor_l'
        if p is b and _estrias(p, Pm, 'x', (0, 3.0, 2.0)):
            return 'marmol_aldor_l'
        if p is a and nw[1] > 0.75 and Pm[0] < -8:
            return 'hiedra'
        return None
    return pr, ret, mats('marmol_aldor', 'hiedra')


def _columna(x, z, alto, pr, fustes, capitel=True, cortada=False):
    pr.append(caja((x, 1.2, z), (4.6, 1.2, 4.6), 'marmol_aldor'))
    f = cil((x, 2.4, z), (x, alto, z), 3.2, 'marmol_aldor')
    if cortada:
        f = cortar(f, (x, alto - 3.0, z), (0.45, 1.0, 0.2))
    pr.append(f)
    fustes.append(f)
    if capitel:
        pr.append(caja((x, alto + 0.9, z), (4.0, 0.9, 4.0), 'marmol_aldor'))
        pr.append(caja((x, alto + 2.4, z), (4.8, 0.7, 4.8), 'marmol_aldor'))
    return f


def columna_hiedra():
    pr, fustes = [], []
    _columna(0, 0, 30.0, pr, fustes)

    def ret(p, Pm, nm, nw):
        if de(p, fustes):
            ang = math.atan2(Pm[2], Pm[0])
            if Pm[1] < 26 and ((ang / (2 * math.pi) + Pm[1] * 0.05) % 1.0) < 0.2:
                return 'hiedra'
            if _estrias(p, Pm, 'y', (0, 0, 0)):
                return 'marmol_aldor_l'
        return None
    return pr, ret, mats('marmol_aldor', 'hiedra')


def fuste_roto():
    pr, fustes = [], []
    _columna(0, 0, 18.0, pr, fustes, capitel=False, cortada=True)
    pr.append(roca((6.4, 1.2, 3.4), (2.2, 1.2, 1.8), 'marmol_aldor'))

    def ret(p, Pm, nm, nw):
        if de(p, fustes):
            if Pm[1] < 7 and nw[1] < 0.5:
                return 'hiedra'
            if _estrias(p, Pm, 'y', (0, 0, 0)):
                return 'marmol_aldor_l'
        return None
    return pr, ret, mats('marmol_aldor', 'hiedra')


def portico_ruinas():
    pr, fustes = [], []
    for x in (-13.0, 13.0):
        _columna(x, 0, 26.0, pr, fustes)
    dintel = cortar(caja((0, 31.4, 0), (18.0, 2.2, 3.4), 'marmol_aldor'), (14.0, 31.4, 0), (0.6, 0.8, 0.0))
    pr.append(dintel)
    pr.append(roca((19.5, 1.6, 6.0), (3.4, 1.6, 2.4), 'marmol_aldor', rot=giro_y(0.4)))

    def ret(p, Pm, nm, nw):
        if de(p, fustes):
            if Pm[0] < 0 and Pm[1] < 22 and ((math.atan2(Pm[2], Pm[0] + 13) / (2 * math.pi) + Pm[1] * 0.05) % 1.0) < 0.2:
                return 'hiedra'
            return 'marmol_aldor_l' if _estrias(p, Pm, 'y', (13.0 if Pm[0] > 0 else -13.0, 0, 0)) else None
        if p is dintel and nm[2] > 0.9 and abs(Pm[1] - 31.4) < 0.5:
            return 'grabado_aldor'
        return None
    return pr, ret, mats('marmol_aldor', 'hiedra', 'grabado_aldor')


def obelisco_sol():
    cuerpo = tronco_piramide((0, 4.2, 0), 3.4, 2.4, 22.0, 'arenisca_aldor')
    pr = [caja((0, 1.5, 0), (6.0, 1.5, 6.0), 'marmol_aldor'), caja((0, 3.6, 0), (4.6, 0.6, 4.6), 'marmol_aldor'), cuerpo,
          piramide((0, 26.2, 0), 2.4, 2.4, 4.0, 'oro_metal'),
          cortar(cil((0, 21.0, 2.2), (0, 21.0, 3.0), 2.0, 'oro_sol'), (0, 21.0, 2.4), (0, 0, -1))]

    def ret(p, Pm, nm, nw):
        if p is cuerpo and nm[2] > 0.8:
            if 6.5 < Pm[1] < 17.5 and raya(Pm[1], 3.6, 0.5) and abs(Pm[0]) < 2.0:
                return 'grabado_aldor'
            if 6.5 < Pm[1] < 17.5 and abs(Pm[0]) < 0.3:
                return 'grabado_aldor'
        return None
    return pr, ret, mats('marmol_aldor', 'arenisca_aldor', 'oro_metal', 'oro_sol', 'grabado_aldor')


def altar_solar():
    disco = cortar(cil((0, 13.6, -1.0), (0, 13.6, 0.0), 5.2, 'oro_metal'), (0, 13.6, -0.6), (0, 0, -1))
    pr = [caja((0, 1.2, 0), (10.0, 1.2, 7.0), 'marmol_aldor'), caja((0, 3.4, 0), (7.5, 1.0, 5.0), 'marmol_aldor'),
          caja((0, 6.4, 0), (5.0, 2.0, 3.6), 'arenisca_aldor'), disco,
          caja((0, 8.8, -0.4), (1.4, 0.6, 1.0), 'oro_metal')]

    def ret(p, Pm, nm, nw):
        if p is disco and nm[2] > 0.8:
            r = math.hypot(Pm[0], Pm[1] - 13.6)
            if r < 2.4:
                return 'oro_sol'
            ang = math.atan2(Pm[1] - 13.6, Pm[0])
            if r > 3.0 and ((ang / (2 * math.pi)) * 12) % 1.0 < 0.35:
                return 'oro_sol'
        return None
    return pr, ret, mats('marmol_aldor', 'arenisca_aldor', 'oro_metal', 'oro_sol')


def escalinata_rota():
    pr = []
    for i in range(4):
        pr.append(cortar(caja((0, 0.9 + i * 1.8, 4.5 - i * 3.0), (10.0, 0.9, 2.0), 'marmol_aldor'), (5.0, 3.0, 0), (0.55, 0.8, -0.1)))
    for (x, z) in ((8.6, 6.4), (11.0, 3.0)):
        pr.append(roca((x, 1.0, z), (1.8, 1.0, 1.6), 'marmol_aldor', rot=giro_y(x * 0.3)))

    def ret(p, Pm, nm, nw):
        if nm[2] > 0.9:
            return 'marmol_aldor_l' if raya(Pm[0] + 20, 5.0, 0.3) else None
        return None
    return pr, ret, mats('marmol_aldor', 'hiedra')


def brasero_dorado():
    pr = []
    for a in (0.5, 2.6, 4.7):
        pr.append(cono((math.cos(a) * 3.6, 0, math.sin(a) * 3.0), (0, 9.4, 0), 0.5, 0.35, 'oro_metal'))
    pr.append(cortar(elip((0, 10.4, 0), (4.6, 2.4, 4.6), 'oro_metal'), (0, 11.4, 0), (0, 1, 0)))
    pr.append(cil((0, 11.0, 0), (0, 11.5, 0), 4.0, 'basalto_o'))
    pr.append(cono((0, 11.4, 0), (0.6, 19.4, 0), 3.0, 0.2, 'llama_naranja'))
    pr.append(cono((0, 11.4, 0.6), (-0.4, 16.4, 0.6), 1.9, 0.2, 'llama_amarilla'))
    return pr, None, mats('oro_metal', 'basalto_o', 'llama_naranja', 'llama_amarilla')


def anfora():
    cuerpo = elip((0, 7.0, 0), (4.0, 6.0, 4.0), 'barro_aldor')
    pr = [tubo((0, 0, 0), (0, 2.2, 0), 1.6, 2.4, 'barro_aldor'), cuerpo, cil((0, 12.0, 0), (0, 15.4, 0), 1.6, 'barro_aldor'),
          cil((0, 15.4, 0), (0, 16.3, 0), 2.3, 'barro_aldor'),
          elip((6.4, 2.6, 2.4), (2.6, 2.6, 2.6), 'barro_aldor'), cil((6.4, 4.6, 2.4), (6.4, 5.8, 2.4), 1.4, 'barro_aldor')]

    def ret(p, Pm, nm, nw):
        if p is cuerpo and (abs(Pm[1] - 6.2) < 0.55 or abs(Pm[1] - 9.4) < 0.4):
            return 'pintura_negra'
        return None
    return pr, ret, mats('barro_aldor', 'pintura_negra')


def muro_roto():
    muro = cortar(caja((0, 7.0, 0), (14.0, 7.0, 2.6), 'arenisca_aldor'), (5.0, 10.0, 0), (0.5, 0.85, 0))
    pr = [muro]
    for (x, z, s) in ((10.0, 4.6, 1.0), (13.6, 2.0, 0.8), (7.0, 5.6, 0.7)):
        pr.append(roca((x, 1.2 * s, z), (2.2 * s, 1.2 * s, 1.6 * s), 'arenisca_aldor', rot=giro_y(x)))

    def ret(p, Pm, nm, nw):
        if p is muro:
            if nm[2] > 0.9 and Pm[0] < -6.0 and Pm[1] > 6.0:
                return 'hiedra'
            if abs(nm[1]) < 0.6 and raya(Pm[1], 3.0, 0.45):
                return 'arenisca_aldor_l'
        return None
    return pr, ret, mats('arenisca_aldor', 'hiedra')


def cabeza_estatua():
    rot = giro_z(0.32)
    cabeza = cortar(elip((0, 7.0, 0), (8.0, 10.0, 8.0), 'marmol_gris', rot=rot), (0, 0.6, 0), (0, -1, 0))

    def en(x, y, z):                                  # un punto de la cara, girado con la cabeza
        q = rot @ np.array([x, y - 7.0, z])
        return (q[0], q[1] + 7.0, q[2])
    pr = [cabeza, cono(en(0, 8.4, 7.2), en(0, 5.0, 9.2), 1.6, 1.0, 'marmol_gris'),
          caja(en(0, 11.0, 6.6), (5.6, 0.9, 1.4), 'marmol_gris', rot=rot),
          caja(en(0, 3.4, 7.4), (2.2, 0.4, 0.6), 'grabado_aldor', rot=rot),
          roca((9.6, 1.4, 4.4), (2.6, 1.4, 2.0), 'marmol_gris', rot=giro_y(0.5))]
    for sg in (-1, 1):
        pr.append(caja(en(sg * 2.8, 9.4, 7.5), (1.6, 0.25, 0.4), 'grabado_aldor', rot=rot))

    def ret(p, Pm, nm, nw):
        if p is cabeza:
            q = _local(p, Pm[None, :])[0]
            if 6.6 < q[1] < 8.2:
                return 'oro_metal'                        # la diadema
            if nw[1] > 0.86:
                return 'hiedra'
            if abs(q[0] - q[1] * 0.3 - 3.0) < 0.35 and q[1] < 5 and nm[2] > 0.3:
                return 'marmol_gris_l'                      # la grieta: una raya
        return None
    return pr, ret, mats('marmol_gris', 'grabado_aldor', 'oro_metal', 'hiedra')


# ===========================================================================
# LAS COLINAS DE OTOÑO
# ===========================================================================
def calabazas():
    pr = []
    centros = []
    for (x, z, r, h, m) in ((0, 0, 6.0, 4.5, 'calabaza_c'), (8.0, 3.0, 4.0, 3.0, 'calabaza_c'), (-7.4, 3.4, 3.4, 2.6, 'calabaza_b')):
        e = elip((x, h, z), (r, h, r * 0.92), m)
        pr.append(e)
        centros.append((e, x, z))
        pr.append(cono((x, h * 1.9, z), (x + 0.6, h * 1.9 + 2.0, z), 0.6, 0.4, 'madera_osc_r'))

    def ret(p, Pm, nm, nw):
        for e, x, z in centros:
            if p is e:
                ang = math.atan2(Pm[2] - z, Pm[0] - x)
                return p['mat'] + '_l' if ((ang / (2 * math.pi)) * 10) % 1.0 < 0.12 else None
        return None
    return pr, ret, mats('calabaza_c', 'calabaza_b', 'madera_osc_r')


def pila_hojas():
    pr = [elip((0, 1.6, 0), (9.0, 3.4, 7.0), 'hojas_naranja'), elip((5.0, 1.2, 3.0), (5.0, 2.6, 4.0), 'hojas_rojo'),
          elip((-5.4, 1.0, 2.4), (4.0, 2.2, 3.4), 'hojas_amarillo')]

    def ret(p, Pm, nm, nw):
        ang = math.atan2(Pm[2], Pm[0])
        if raya(Pm[1] + math.sin(ang * 3.0) * 0.9 + 10, 2.0, 0.55):
            return p['mat'] + '_l'
        return None
    return pr, ret, mats('hojas_naranja', 'hojas_rojo', 'hojas_amarillo')


def pila_lena():
    troncos = []
    for (y, z, x0, x1) in ((2.2, 3.6, -13.0, 13.0), (2.2, -0.8, -12.4, 12.6), (5.8, 1.4, -12.0, 12.2), (9.2, 0.4, -10.6, 10.8)):
        troncos.append(cil((x0, y, z), (x1, y, z), 2.2, 'corteza_otono'))
    pr = list(troncos)
    for x in (-14.6, 14.6):
        pr.append(cono((x, 0, 1.4), (x, 12.0, 1.4), 0.7, 0.55, 'madera_osc_r'))

    def ret(p, Pm, nm, nw):
        if de(p, troncos):
            ang = math.atan2(Pm[1] - p['a'][1], Pm[2] - p['a'][2])
            return 'corteza_otono_l' if ((ang / (2 * math.pi)) * 9) % 1.0 < 0.15 else None
        return None
    return pr, ret, mats('corteza_otono', 'madera_osc_r')


def tocon_hacha():
    tocon = tubo((0, 0, 0), (0, 6.0, 0), 5.6, 5.0, 'corteza_otono')
    pr = [tocon]
    for a in (0.3, 2.2, 4.0):
        pr.append(cono((math.cos(a) * 4.0, 1.0, math.sin(a) * 4.0), (math.cos(a) * 8.0, 0.0, math.sin(a) * 7.0), 1.6, 0.5, 'corteza_otono'))
    pr.append(cono((1.0, 6.0, 0.5), (8.0, 12.4, 3.0), 0.45, 0.45, 'madera_clara_r'))
    pr.append(caja((1.4, 6.6, 0.6), (2.6, 1.6, 0.35), 'hierro_r', rot=giro_z(0.7)))

    def ret(p, Pm, nm, nw):
        if p is tocon:
            if nm[1] > 0.9:
                r = math.hypot(Pm[0], Pm[2])
                return 'madera_anillo_l' if raya(r, 1.7, 0.34) else 'madera_anillo'
            return 'corteza_otono_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 13) % 1.0 < 0.15 else None
        return None
    return pr, ret, mats('corteza_otono', 'madera_anillo', 'madera_clara_r', 'hierro_r')


def cerca_rustica():
    pr = []
    for x in (-12.0, 0.0, 12.0):
        pr.append(tubo((x, 0, 0), (x, 10.0, 0), 0.95, 0.8, 'madera_osc_r'))
    pr.append(cil((-13.4, 3.6, 0.4), (13.4, 3.8, 0.9), 0.65, 'madera_r'))
    pr.append(cil((-13.4, 7.4, 0.2), (13.4, 7.0, 0.7), 0.6, 'madera_r'))
    return pr, None, mats('madera_osc_r', 'madera_r')


def cabana_cazador():
    D = 13.0
    cuerpo = caja((0, 11.0, 0), (18.0, 11.0, D), 'troncos_cabana', bisel=0.995, arista=0.997)
    techo = tejado_x(21.0, 21.0, D + 4.0, 13.0, 'madera_osc_r')
    pr = [cuerpo, caja((0, 1.0, 0.4), (19.0, 1.0, D + 0.8), 'piedra_chimenea'), techo]
    for sg in (-1, 1):
        pr.append(cil((sg * 18.2, 0, D + 0.2), (sg * 18.2, 22.0, D + 0.2), 1.1, 'troncos_cabana'))
    pr.append(caja((-15.0, 18.0, -6.0), (3.2, 16.0, 3.2), 'piedra_chimenea'))
    pr.append(caja((-4.0, 7.0, D + 0.4), (3.4, 7.0, 0.5), 'puerta_madera'))
    pr.append(caja((-4.0, 14.6, D + 0.5), (4.2, 0.6, 0.6), 'madera_osc_r'))
    pr.append(caja((8.0, 10.4, D + 0.5), (3.6, 3.0, 0.5), 'luz_ventana'))
    pr.append(caja((8.0, 10.4, D + 0.3), (4.3, 3.7, 0.4), 'madera_osc_r'))
    for sg in (-1, 1):
        pr += cadena([(-4.0, 16.6, D + 0.9), (-4.0 + sg * 2.4, 18.4, D + 1.2), (-4.0 + sg * 3.6, 21.0, D + 1.2)], 0.45, 0.25, 'hueso_r')
        pr.append(cono((-4.0 + sg * 2.4, 18.4, D + 1.2), (-4.0 + sg * 1.2, 20.4, D + 1.4), 0.3, 0.15, 'hueso_r'))
    pr.append(caja((0, 0.6, D + 3.0), (13.0, 0.6, 2.6), 'madera_r'))
    for (y, z) in ((1.4, D + 5.0), (1.4, D + 2.6), (3.6, D + 3.8)):
        pr.append(cil((10.0, y, z), (17.0, y, z), 1.2, 'corteza_otono'))

    def ret(p, Pm, nm, nw):
        if p is cuerpo and nm[2] > 0.9:
            return 'troncos_cabana_l' if raya(Pm[1], 2.4, 0.55) else None
        if p is techo and nm[1] > 0.2:
            return 'madera_osc_r_l' if raya(Pm[0] + 30, 3.2, 0.5) else None
        if p['mat'] == 'piedra_chimenea' and abs(nm[1]) < 0.6:
            return 'piedra_chimenea_l' if raya(Pm[1], 2.6, 0.45) else None
        if p['mat'] == 'puerta_madera':
            return 'puerta_madera_l' if raya(Pm[0] + 20, 1.7, 0.32) else None
        if p['mat'] == 'corteza_otono':
            ang = math.atan2(Pm[1] - p['a'][1], Pm[2] - p['a'][2])
            return 'corteza_otono_l' if ((ang / (2 * math.pi)) * 9) % 1.0 < 0.15 else None
        return None
    return pr, ret, mats('troncos_cabana', 'piedra_chimenea', 'madera_osc_r', 'puerta_madera', 'luz_ventana', 'hueso_r', 'madera_r', 'corteza_otono')


def carro_lena():
    pr = [caja((0, 7.0, 0), (11.0, 1.0, 6.0), 'madera_r')]
    for sg in (-1, 1):
        pr.append(caja((0, 9.4, sg * 5.6), (11.0, 1.6, 0.4), 'madera_r'))
    rueda = cil((-3.0, 4.2, 6.6), (-3.0, 4.2, 7.6), 4.2, 'madera_osc_r')
    pr.append(rueda)
    pr.append(cil((-3.0, 4.2, -7.6), (-3.0, 4.2, -6.6), 4.2, 'madera_osc_r'))
    for (y, z) in ((9.6, 2.8), (9.6, -1.6), (12.2, 0.6)):
        pr.append(cil((-9.6, y, z), (9.8, y, z), 2.0, 'corteza_otono'))
    for sg in (-1, 1):
        pr.append(cono((-11.0, 7.2, sg * 4.6), (-21.0, 1.0, sg * 3.6), 0.6, 0.45, 'madera_r'))

    def ret(p, Pm, nm, nw):
        if p is rueda and nm[2] > 0.8:
            r = math.hypot(Pm[0] + 3.0, Pm[1] - 4.2)
            if r > 3.4 or r < 0.9:
                return 'hierro_r'                         # la llanta y el cubo
            ang = math.atan2(Pm[1] - 4.2, Pm[0] + 3.0)
            return 'madera_clara_r' if ((ang / (2 * math.pi)) * 8) % 1.0 < 0.2 else 'madera_osc_r'
        if p['mat'] == 'corteza_otono':
            ang = math.atan2(Pm[1] - p['a'][1], Pm[2] - p['a'][2])
            return 'corteza_otono_l' if ((ang / (2 * math.pi)) * 9) % 1.0 < 0.15 else None
        if p['mat'] == 'madera_r' and nm[2] > 0.9:
            return 'madera_r_l' if raya(Pm[1], 1.6, 0.3) else None
        return None
    return pr, ret, mats('madera_r', 'madera_osc_r', 'madera_clara_r', 'corteza_otono', 'hierro_r')


def roca_liquen():
    a = roca((0, 5.0, 0), (8.0, 5.0, 6.5), 'roca_gris_c', bisel=0.8, arista=0.9)
    pr = [a, roca((-7.0, 3.0, 2.0), (4.0, 3.0, 3.5), 'roca_gris_c', bisel=0.8, arista=0.9)]

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.66:
            return 'liquen_naranja'
        if nw[1] > 0.42:
            return 'liquen_amarillo'
        return None
    return pr, ret, mats('roca_gris_c', 'liquen_naranja', 'liquen_amarillo')


def seta_otono():
    pr = []
    for (x, z, s) in ((0, 0, 1.4), (5.4, 2.6, 0.9)):
        pr.append(tubo((x, 0, z), (x, 6.0 * s, z), 1.6 * s, 1.2 * s, 'seta_pie'))
        pr.append(cortar(elip((x, 6.0 * s, z), (3.6 * s, 2.6 * s, 3.6 * s), 'seta_marron'), (x, 5.6 * s, z), (0, -1, 0)))
    return pr, None, mats('seta_pie', 'seta_marron')


def gavilla():
    a = tubo((0, 0, 0), (0, 8.0, 0), 3.2, 1.6, 'trigo')
    b = tubo((0, 8.0, 0), (0, 14.0, 0), 1.6, 3.6, 'trigo')
    pr = [a, b, cil((0, 7.2, 0), (0, 8.4, 0), 1.9, 'cuerda')]

    def ret(p, Pm, nm, nw):
        if p is a or p is b:
            return 'trigo_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 16) % 1.0 < 0.18 else None
        return None
    return pr, ret, mats('trigo', 'cuerda')


# ===========================================================================
# LA SELVA
# ===========================================================================
def templo_selva():
    gradas = [caja((0, 3.0, 0), (22.0, 3.0, 16.0), 'piedra_selva', bisel=0.99, arista=0.995),
              caja((0, 8.5, -1.0), (17.0, 2.5, 12.5), 'piedra_selva', bisel=0.99, arista=0.995),
              caja((0, 13.0, -2.0), (12.5, 2.0, 9.0), 'piedra_selva', bisel=0.99, arista=0.995)]
    santuario = caja((0, 18.5, -3.0), (7.0, 3.5, 5.5), 'piedra_selva', bisel=0.99, arista=0.995)
    escalera = prisma((0, 0, 0), [((1, 0, 0), 4.6), ((-1, 0, 0), 4.6), ((0, -1, 0), 0), ((0, 0, -1), 0),
                                  ((0, 13.0, 16.5), 16.5 * 17.4)], 'piedra_selva')
    pr = gradas + [santuario, escalera, caja((0, 22.8, -3.0), (8.4, 0.8, 6.6), 'piedra_selva_l'),
                   piramide((0, 23.6, -3.0), 6.0, 4.6, 3.6, 'piedra_selva'),
                   caja((0, 17.2, 2.6), (2.6, 2.6, 0.4), 'hueco_oscuro'), caja((0, 20.8, 2.7), (2.0, 0.5, 0.4), 'luz_jade')]

    def ret(p, Pm, nm, nw):
        if p is escalera:
            return 'piedra_selva_l' if raya(Pm[1], 1.6, 0.42) else None
        if de(p, gradas) or p is santuario:
            if nm[1] > 0.9:
                return 'musgo_selva' if raya(Pm[0] * 0.4 + Pm[2] * 0.3 + 40, 6.0, 3.6) else None
            if nm[2] > 0.9:
                if raya(Pm[0] * 0.8 + 60, 7.0, 0.7) and Pm[1] > p['c'][1] - 1.0:
                    return 'liana'
                return 'piedra_selva_l' if raya(Pm[1], 2.0, 0.4) else None
        return None
    return pr, ret, mats('piedra_selva', 'musgo_selva', 'liana', 'hueco_oscuro', 'luz_jade')


def totem_selva():
    cabeza = elip((0, 9.0, 0), (7.0, 8.5, 6.4), 'piedra_selva')
    pr = [caja((0, 1.0, 0), (6.4, 1.0, 5.6), 'piedra_selva'), cabeza, caja((0, 11.0, 5.4), (5.6, 1.0, 1.4), 'piedra_selva'),
          cono((0, 9.0, 5.8), (0, 6.2, 7.6), 1.8, 1.2, 'piedra_selva'), caja((0, 4.4, 6.0), (2.8, 0.8, 0.9), 'piedra_selva_l'),
          caja((0, 15.6, 0), (6.6, 1.3, 5.8), 'piedra_selva')]
    for sg in (-1, 1):
        pr.append(caja((sg * 2.6, 9.6, 5.9), (1.5, 0.5, 0.4), 'luz_jade'))

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.75:
            return 'musgo_selva'
        if p is cabeza and raya(Pm[1], 3.0, 0.35) and Pm[1] < 5.0:
            return 'piedra_selva_l'
        return None
    return pr, ret, mats('piedra_selva', 'musgo_selva', 'luz_jade')


def helecho():
    pr = []
    frondas = []
    for i in range(7):
        a = i / 7.0 * 2 * math.pi + 0.3
        d = np.array([math.cos(a), 0.55, math.sin(a)])
        d /= np.linalg.norm(d)
        c = (d[0] * 6.0, 2.6 + d[1] * 4.0, d[2] * 6.0)
        e = elip(c, (7.0, 0.6, 2.3), 'helecho', rot=ejes((d[0], -0.25, d[2])))
        frondas.append(e)
        pr.append(e)
    pr.append(elip((0, 1.0, 0), (2.4, 1.6, 2.4), 'helecho'))

    def ret(p, Pm, nm, nw):
        if de(p, frondas):
            q = _local(p, Pm[None, :])[0]
            if abs(q[2]) < 0.28:
                return 'hoja_r'
            return 'helecho_l' if raya(q[0] + 20, 1.3, 0.3) else None
        return None
    return pr, ret, mats('helecho', 'hoja_r')


def flor_tropical():
    pr = [cil((0, 0, 0), (0, 14.0, 0), 0.6, 'hoja_osc_r')]
    for (a, l) in ((0.5, 9.0), (2.6, 8.0), (4.4, 9.4)):
        d = (math.cos(a), 0.4, math.sin(a))
        pr.append(elip((math.cos(a) * 5.0, 4.0, math.sin(a) * 5.0), (l * 0.6, 0.6, 2.6), 'hoja_r', rot=ejes((d[0], -0.1, d[2]))))
    petalos = []
    for i in range(5):
        a = i / 5.0 * 2 * math.pi
        d = (math.cos(a), math.sin(a) * 0.9, 0.35)
        e = elip((math.cos(a) * 2.6, 15.0 + math.sin(a) * 2.4, 1.6), (3.2, 1.6, 0.9), 'flor_tropical', rot=ejes(d, (0, 0, 1)))
        petalos.append(e)
        pr.append(e)
    pr.append(elip((0, 15.0, 2.4), (1.4, 1.4, 1.0), 'flor_centro'))

    def ret(p, Pm, nm, nw):
        if de(p, petalos):
            q = _local(p, Pm[None, :])[0]
            return 'flor_tropical_l' if abs(q[1]) < 0.3 else None
        if p['mat'] == 'hoja_r':
            q = _local(p, Pm[None, :])[0]
            return 'hoja_r_l' if abs(q[2]) < 0.35 else None
        return None
    return pr, ret, mats('hoja_osc_r', 'hoja_r', 'flor_tropical', 'flor_centro')


def roca_selva():
    pr = [roca((0, 6.0, 0), (9.0, 6.0, 7.0), 'piedra_selva', bisel=0.8, arista=0.9),
          roca((-7.4, 3.4, 3.0), (4.4, 3.4, 3.6), 'piedra_selva', bisel=0.8, arista=0.9)]

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.55:
            return 'musgo_selva'
        if raya(Pm[0] + 40, 4.6, 0.75) and Pm[1] > 2.5:
            return 'liana'
        return None
    return pr, ret, mats('piedra_selva', 'musgo_selva', 'liana')


def bambu():
    pr, cañas = [], []
    for (x, z, h, inc) in ((-4.0, -1.0, 44.0, -1.4), (-1.0, 1.6, 50.0, 0.4), (2.4, -1.4, 40.0, 1.2), (4.6, 1.4, 34.0, 2.2), (0.6, 3.6, 28.0, -0.6)):
        c = tubo((x, 0, z), (x + inc, h, z), 1.35, 1.05, 'bambu')
        cañas.append(c)
        pr.append(c)
        for k, sg in ((0.78, 1), (0.9, -1)):
            yy = h * k
            xx = x + inc * k
            pr.append(elip((xx + sg * 3.0, yy, z + 0.6), (3.4, 0.5, 1.2), 'hoja_bambu', rot=ejes((sg, -0.35, 0.2))))

    def ret(p, Pm, nm, nw):
        if de(p, cañas):
            return 'bambu_l' if raya(Pm[1] + 2, 5.2, 0.55) else None
        return None
    return pr, ret, mats('bambu', 'hoja_bambu')


def tronco_lianas():
    t, ret0 = _tronco_tumbado('corteza_selva', 'musgo_selva', 15.0, 3.8)
    pr = [t]
    for (x, inc) in ((-9.0, 1.0), (-2.0, -0.6), (6.0, 0.8), (11.0, -1.0)):
        pr += cadena([(x, 7.4, -1.0), (x + inc, 6.6, 2.4), (x + inc * 1.6, 3.4, 4.0), (x + inc * 1.8, 0.4, 4.4)], 0.45, 0.35, 'liana')
    for (x, a) in ((13.0, 0.2), (-13.6, 2.9)):
        pr.append(elip((x + math.cos(a) * 3.0, 3.0, 3.0), (5.0, 0.5, 2.0), 'hoja_r', rot=ejes((math.cos(a), 0.3, 0.6))))
    return pr, ret0, mats('corteza_selva', 'musgo_selva', 'liana', 'hoja_r')


def cabana_selva():
    plataforma = cil((0, 4.0, 0), (0, 5.4, 0), 13.0, 'madera_selva')
    pared = cil((0, 5.4, 0), (0, 14.0, 0), 9.5, 'bambu_pared')
    techo = tubo((0, 13.4, 0), (0, 30.0, 0), 14.5, 0.8, 'paja_selva')
    pr = [plataforma, pared, techo, caja((0, 9.6, 9.4), (2.6, 4.2, 0.4), 'hueco_oscuro')]
    for a in range(6):
        ang = a / 6.0 * 2 * math.pi + 0.5
        pr.append(cono((math.cos(ang) * 11.0, 0, math.sin(ang) * 11.0), (math.cos(ang) * 11.0, 4.2, math.sin(ang) * 11.0), 0.9, 0.8, 'madera_osc_r'))
    for sg in (-1, 1):
        pr.append(cil((sg * 2.0, 0, 17.0), (sg * 2.0, 5.0, 13.0), 0.45, 'madera_r'))
    for t in (0.33, 0.66):
        pr.append(cil((-2.0, 5.0 * t, 17.0 - 4.0 * t), (2.0, 5.0 * t, 17.0 - 4.0 * t), 0.35, 'madera_r'))
    pr.append(elip((0, 30.4, 0), (1.4, 1.4, 1.4), 'paja_selva'))

    def ret(p, Pm, nm, nw):
        if p is pared:
            return 'bambu_pared_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 30) % 1.0 < 0.16 else None
        if p is techo:
            return 'paja_selva_l' if raya(Pm[1], 2.6, 0.6) else None
        if p is plataforma and nm[1] > 0.9:
            return 'madera_selva_l' if raya(Pm[0] + 20, 2.4, 0.4) else None
        return None
    return pr, ret, mats('madera_selva', 'bambu_pared', 'paja_selva', 'hueco_oscuro', 'madera_osc_r', 'madera_r')


# ===========================================================================
# EL VOLCÁN
# ===========================================================================
def roca_volcanica():
    a = roca((0, 6.0, 0), (9.0, 6.0, 7.0), 'basalto', bisel=0.78, arista=0.88)
    pr = [a, roca((7.4, 3.6, 3.0), (4.5, 3.6, 4.0), 'basalto_o', bisel=0.78, arista=0.88)]

    def ret(p, Pm, nm, nw):
        if p is a and nw[2] > 0.3 and Pm[1] > 1.2:
            f = (Pm[1] / 2.6) % 2.0
            zz = 1.5 * (f if f < 1.0 else 2.0 - f) - 0.75     # onda en triangulo
            if abs(Pm[0] + 1.0 - zz) < 0.5:
                return 'brasa_lava'                       # la grieta: un zigzag que brilla
        return None
    return pr, ret, mats('basalto', 'basalto_o', 'brasa_lava')


def fumarola():
    monte = tubo((0, 0, 0), (0, 7.0, 0), 9.0, 3.4, 'roca_ceniza')
    boca = cil((0, 7.0, 0), (0, 7.6, 0), 3.6, 'basalto_o')
    pr = [monte, boca]

    def ret(p, Pm, nm, nw):
        if p is boca and nm[1] > 0.9:
            r = math.hypot(Pm[0], Pm[2])
            return 'brasa_lava' if r < 2.2 else 'lava_clara' if r < 2.8 else None
        if p is monte:
            if Pm[1] > 5.6:
                return 'azufre'
            return 'roca_ceniza_l' if raya(Pm[1], 2.4, 0.45) else None
        return None
    return pr, ret, mats('roca_ceniza', 'basalto_o', 'brasa_lava', 'lava_clara', 'azufre')


def _cristales(mat_, luz_, base_mat):
    pr = [roca((0, 1.4, 0), (6.0, 1.6, 4.6), base_mat, bisel=0.8, arista=0.9)]
    picos = []
    for (x, z, h, inc) in ((0, 0, 12.0, 0.15), (-4.0, 1.6, 8.0, -0.45), (4.0, 1.2, 9.0, 0.5)):
        r = giro_z(-inc)
        c = roca((x + math.sin(inc) * h * 0.5, 1.6 + h * 0.5, z), (1.9, h * 0.5, 1.9), mat_, rot=r, bisel=0.72, arista=0.82)
        picos.append(c)
        pr.append(c)

    def ret(p, Pm, nm, nw):
        if de(p, picos):
            q = _local(p, Pm[None, :])[0]
            if abs(q[0]) < 0.45 and nm[2] > 0.3:
                return luz_
        return None
    return pr, ret, mats(mat_, luz_, base_mat)


def cristal_fuego():
    return _cristales('cristal_rojo', 'cristal_rojo_luz', 'basalto')


def yunque():
    pr = [cil((0, 0, 0), (0, 6.0, 0), 4.2, 'madera_quemada'), caja((0, 6.6, 0), (2.4, 1.0, 1.6), 'hierro_negro'),
          caja((0, 8.2, 0), (4.6, 1.6, 2.2), 'hierro_negro'), cono((4.6, 8.8, 0), (9.0, 9.0, 0), 1.6, 0.2, 'hierro_negro'),
          caja((-5.4, 9.0, 0), (1.2, 0.8, 1.6), 'hierro_negro'), caja((0.6, 10.1, 0.4), (2.6, 0.35, 0.5), 'brasa_lava'),
          cono((4.0, 0, 5.0), (2.0, 8.0, 4.6), 0.4, 0.4, 'madera_r'), caja((1.8, 8.6, 4.6), (1.6, 1.0, 1.0), 'hierro_negro')]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'madera_quemada':
            if nm[1] > 0.9:
                return 'madera_quemada_l' if raya(math.hypot(Pm[0], Pm[2]), 1.6, 0.35) else None
            return 'madera_quemada_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 12) % 1.0 < 0.16 else None
        return None
    return pr, ret, mats('madera_quemada', 'hierro_negro', 'brasa_lava', 'madera_r')


def forja():
    hogar = caja((0, 5.0, 0), (12.0, 5.0, 8.0), 'ladrillo_forja')
    campana = piramide((0, 14.0, -1.0), 10.0, 6.6, 9.0, 'hierro_negro')
    pr = [hogar, campana, cil((0, 20.0, -1.0), (0, 38.0, -1.0), 2.6, 'hierro_negro'),
          cil((0, 38.0, -1.0), (0, 39.0, -1.0), 3.4, 'hierro_negro')]
    for x in (-10.4, 10.4):
        pr.append(cil((x, 10.0, -6.0), (x, 14.4, -6.0), 0.7, 'hierro_negro'))
    pr.append(cono((-3.0, 10.0, 1.0), (-2.4, 15.0, 1.4), 2.2, 0.2, 'llama_naranja'))
    pr.append(cono((3.4, 10.0, 0.0), (3.8, 14.0, 0.4), 1.8, 0.2, 'llama_amarilla'))
    pr.append(elip((15.4, 6.0, 2.0), (3.4, 2.4, 2.6), 'madera_quemada'))
    pr.append(cono((12.6, 6.4, 2.0), (11.6, 7.0, 1.6), 0.8, 0.4, 'hierro_negro'))

    def ret(p, Pm, nm, nw):
        if p is hogar:
            if nm[1] > 0.9:
                return 'brasa_lava' if abs(Pm[0]) < 9.6 and abs(Pm[2]) < 6.0 else None
            return 'ladrillo_forja_l' if raya(Pm[1], 2.2, 0.4) else None
        if p is campana:
            return 'hierro_negro_l' if raya(Pm[1], 2.4, 0.4) else None
        return None
    return pr, ret, mats('ladrillo_forja', 'hierro_negro', 'brasa_lava', 'llama_naranja', 'llama_amarilla', 'madera_quemada')


def craneo_dragon():
    craneo = elip((-3.0, 6.0, 0), (7.0, 5.5, 6.0), 'hueso_dragon')
    hocico = elip((6.0, 4.0, 0), (7.0, 3.2, 4.0), 'hueso_dragon')
    pr = [craneo, hocico, elip((5.0, 1.4, 1.6), (7.0, 1.4, 3.4), 'hueso_dragon'),
          elip((0.8, 7.0, 4.6), (2.2, 1.8, 1.6), 'hueco_oscuro'),
          cono((-6.0, 9.0, 3.0), (-11.0, 12.0, 5.0), 2.0, 1.0, 'hueso_dragon'), cono((-11.0, 12.0, 5.0), (-15.0, 12.4, 6.4), 1.0, 0.3, 'hueso_dragon'),
          cono((-6.0, 9.0, -3.0), (-11.0, 12.0, -5.0), 2.0, 1.0, 'hueso_dragon'), cono((-11.0, 12.0, -5.0), (-15.0, 12.4, -6.4), 1.0, 0.3, 'hueso_dragon')]

    def ret(p, Pm, nm, nw):
        if p is craneo or p is hocico:
            return 'hueso_dragon_l' if raya(Pm[0] + 40, 3.4, 0.4) and nw[1] > 0.4 else None
        return None
    return pr, ret, mats('hueso_dragon', 'hueco_oscuro')


def brasero_volcan():
    pr = [caja((0, 1.0, 0), (3.6, 1.0, 3.6), 'basalto'), cil((0, 2.0, 0), (0, 9.0, 0), 2.2, 'obsidiana'),
          cortar(elip((0, 10.6, 0), (4.8, 2.4, 4.8), 'obsidiana'), (0, 11.6, 0), (0, 1, 0)),
          cil((0, 11.2, 0), (0, 11.7, 0), 4.2, 'brasa_lava'),
          cono((0, 11.6, 0), (0.6, 20.0, 0), 3.2, 0.2, 'llama_naranja'), cono((0.4, 11.6, 0.8), (-0.4, 16.6, 0.8), 2.0, 0.2, 'llama_amarilla')]
    return pr, None, mats('basalto', 'obsidiana', 'brasa_lava', 'llama_naranja', 'llama_amarilla')


def obelisco_obsidiana():
    cuerpo = tronco_piramide((0, 2.6, 0), 3.4, 2.2, 26.0, 'obsidiana')
    pr = [caja((0, 1.3, 0), (5.4, 1.3, 5.4), 'basalto'), cuerpo, piramide((0, 28.6, 0), 2.2, 2.2, 3.6, 'obsidiana')]

    def ret(p, Pm, nm, nw):
        if p is cuerpo and nm[2] > 0.8:
            if 5.0 < Pm[1] < 24.0 and (abs(Pm[0]) < 0.32 or (raya(Pm[1], 4.2, 0.45) and abs(Pm[0]) < 1.9)):
                return 'runa_roja'
        if p is cuerpo:
            return 'obsidiana_l' if abs(nm[0]) > 0.6 else None
        return None
    return pr, ret, mats('obsidiana', 'basalto', 'runa_roja')


def roca_lava():
    a = roca((0, 3.6, 0), (8.0, 3.6, 6.0), 'basalto_o', bisel=0.8, arista=0.9)
    pr = [a, roca((6.6, 2.0, 2.6), (3.6, 2.0, 3.0), 'basalto', bisel=0.8, arista=0.9)]

    def ret(p, Pm, nm, nw):
        if p is a and abs(Pm[0] * 0.8 + Pm[2] * 0.45 - 1.6 * math.sin(Pm[1] * 0.9 + Pm[2] * 0.3)) < 0.55:
            return 'brasa_lava'
        return None
    return pr, ret, mats('basalto_o', 'basalto', 'brasa_lava')


# ===========================================================================
# LA HONDONADA DE LAS SETAS
# ===========================================================================
def _seta(pr, sombreros, x, z, s, gorro, alto=4.0):
    pr.append(tubo((x, 0, z), (x, alto * s, z), 0.9 * s, 0.7 * s, 'pie_seta'))
    e = cortar(elip((x, alto * s, z), (2.8 * s, 1.9 * s, 2.8 * s), gorro), (x, alto * s - 0.2 * s, z), (0, -1, 0))
    pr.append(e)
    sombreros.append((e, alto * s))


def seta_pequena():
    pr, sombreros = [], []
    _seta(pr, sombreros, 0, 0, 1.3, 'seta_azul')
    _seta(pr, sombreros, 4.6, 2.2, 0.9, 'seta_rosa')
    _seta(pr, sombreros, -4.0, 2.4, 0.8, 'seta_azul')

    def ret(p, Pm, nm, nw):
        for e, y0 in sombreros:
            if p is e and Pm[1] < y0 + 0.5:
                return 'luz_seta_azul' if p['mat'] == 'seta_azul' else 'luz_seta_rosa'   # el borde que brilla
        return None
    return pr, ret, mats('pie_seta', 'seta_azul', 'seta_rosa', 'luz_seta_azul', 'luz_seta_rosa')


def cristal_luz():
    return _cristales('cristal_cian', 'cristal_cian_luz', 'piedra_runa')


def raiz_brillante():
    pr = _arco_raiz('raiz', 2.6, 1.3, 12.0, 14.0) + _arco_raiz('raiz', 1.5, 0.9, 9.0, 10.5, 2.6)
    pr.append(elip((-12.0, 0.6, 0), (4.0, 1.6, 3.6), 'raiz'))
    pr.append(elip((12.0, 0.6, 0), (4.0, 1.6, 3.6), 'raiz'))

    def ret(p, Pm, nm, nw):
        if nw[2] > 0.55 and abs(nw[1]) < 0.35:
            return 'luz_raiz'                             # la veta que brilla, seguida
        if nw[1] > 0.75:
            return 'musgo_hongos'
        return 'raiz_l' if raya(Pm[0] + Pm[1] * 0.6 + 40, 3.4, 0.5) else None
    return pr, ret, mats('raiz', 'luz_raiz', 'musgo_hongos')


def tocon_musgo():
    tocon = tubo((0, 0, 0), (0, 7.0, 0), 5.6, 5.0, 'tocon_hongos')
    pr, sombreros = [tocon, elip((0, 7.2, 0), (5.4, 1.8, 5.4), 'musgo_hongos')], []
    for a in (0.6, 2.4, 4.2):
        pr.append(cono((math.cos(a) * 4.0, 1.0, math.sin(a) * 4.0), (math.cos(a) * 8.0, 0.0, math.sin(a) * 7.0), 1.6, 0.5, 'tocon_hongos'))
    _seta(pr, sombreros, 6.0, 4.0, 0.7, 'seta_verde')

    def ret(p, Pm, nm, nw):
        if p is tocon:
            return 'tocon_hongos_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 13) % 1.0 < 0.15 else None
        for e, y0 in sombreros:
            if p is e and Pm[1] < y0 + 0.4:
                return 'luz_raiz'
        return None
    return pr, ret, mats('tocon_hongos', 'musgo_hongos', 'pie_seta', 'seta_verde', 'luz_raiz')


def farol_luciernaga():
    pr = cadena([(0, 0, 0), (-0.6, 9.0, 0), (0.6, 18.0, 0), (-0.4, 24.0, 0)], 0.9, 0.6, 'raiz')
    pr.append(cono((-0.4, 24.0, 0), (4.6, 25.0, 0), 0.5, 0.35, 'raiz'))
    frasco = cil((4.6, 18.6, 0), (4.6, 23.0, 0), 1.9, 'luz_luciernaga')
    pr += [frasco, cil((4.6, 23.0, 0), (4.6, 24.0, 0), 2.1, 'hierro_r'), cil((4.6, 18.0, 0), (4.6, 18.6, 0), 2.1, 'hierro_r')]
    return pr, None, mats('raiz', 'luz_luciernaga', 'hierro_r')


def casa_seta():
    pie = tubo((0, 0, 0), (0, 17.0, 0), 12.0, 10.0, 'tallo_casa')
    sombrero = cortar(elip((0, 20.0, 0), (18.0, 10.0, 16.0), 'sombrero_casa'), (0, 16.4, 0), (0, -1, 0))
    pr = [pie, sombrero, caja((0, 5.6, 11.0), (3.2, 5.6, 0.6), 'puerta_seta'),
          cortar(elip((5.8, 10.6, 9.6), (2.6, 2.6, 0.8), 'luz_ventana'), (5.8, 10.6, 9.2), (0, 0, -1)),
          cortar(elip((-6.2, 11.6, 9.4), (2.0, 2.0, 0.8), 'luz_ventana'), (-6.2, 11.6, 9.0), (0, 0, -1)),
          cil((8.0, 26.0, -4.0), (8.0, 32.0, -4.0), 1.6, 'tallo_casa'), cortar(elip((8.0, 32.4, -4.0), (2.8, 1.4, 2.8), 'sombrero_casa'), (8.0, 32.0, -4.0), (0, -1, 0)),
          caja((0, 0.4, 14.0), (4.4, 0.4, 2.4), 'piedra_runa'), caja((0, 0.3, 18.0), (3.4, 0.3, 1.8), 'piedra_runa')]

    def ret(p, Pm, nm, nw):
        if p is sombrero:
            if Pm[1] < 17.4:
                return 'luz_seta_rosa'                    # el borde del sombrero, encendido
            return 'sombrero_casa_l' if raya(Pm[1], 3.4, 0.6) else None
        if p is pie:
            return 'tallo_casa_l' if ((math.atan2(Pm[2], Pm[0]) / (2 * math.pi)) * 22) % 1.0 < 0.1 else None
        if p['mat'] == 'puerta_seta':
            return 'puerta_seta_l' if raya(Pm[0] + 20, 1.6, 0.32) else None
        return None
    return pr, ret, mats('tallo_casa', 'sombrero_casa', 'puerta_seta', 'luz_ventana', 'piedra_runa', 'luz_seta_rosa')


def piedra_runa():
    a = roca((0, 12.0, 0), (4.6, 12.0, 3.4), 'piedra_runa', rot=giro_z(0.06), bisel=0.84, arista=0.92)
    pr = [a, roca((3.4, 1.0, 3.0), (2.0, 1.0, 1.6), 'piedra_runa')]

    def ret(p, Pm, nm, nw):
        if p is a and nm[2] > 0.8 and 4.0 < Pm[1] < 20.5:
            if abs(Pm[0]) < 0.6 or (raya(Pm[1] - 4.0, 4.4, 0.9) and abs(Pm[0]) < 2.6):
                return 'runa_violeta'
        if p is a and nw[1] > 0.8:
            return 'musgo_hongos'
        return None
    return pr, ret, mats('piedra_runa', 'runa_violeta', 'musgo_hongos')


def hongo_estante():
    """Un tronco caido con hongos de repisa en el costado (con sus franjas de
    crecimiento: bandas, nada de poros)."""
    t = tubo((-13.0, 3.6, 0), (13.0, 3.6, 0), 3.6, 3.2, 'tocon_hongos')
    pr = [t]
    centros = {}
    for (x, y, m, r) in ((-7.0, 5.4, 'repisa_naranja', 3.8), (-0.8, 4.0, 'repisa_cian', 3.2),
                         (5.0, 5.8, 'repisa_naranja', 4.0), (10.0, 4.2, 'repisa_cian', 3.0)):
        e = cortar(elip((x, y, 3.0), (r, 0.9, r), m), (x, y, 2.2), (0, 0, -1))
        centros[id(e)] = (x, 3.0)
        pr.append(e)
    for (x, inc) in ((-10.0, 0.8), (6.0, -0.6)):
        pr.append(cono((x, 6.8, -1.0), (x + inc, 9.4, -1.6), 0.6, 0.3, 'tocon_hongos'))

    def ret(p, Pm, nm, nw):
        if p is t:
            ang = math.atan2(Pm[1] - 3.6, Pm[2])
            return 'tocon_hongos_l' if ((ang / (2 * math.pi)) * 11) % 1.0 < 0.14 else None
        c = centros.get(id(p))
        if c and nw[1] > 0.2:
            return p['mat'] + '_l' if raya(math.hypot(Pm[0] - c[0], Pm[2] - c[1]), 1.15, 0.38) else None
        return None
    return pr, ret, mats('tocon_hongos', 'repisa_naranja', 'repisa_cian')


# ===========================================================================
# LOS CATÁLOGOS
# ===========================================================================
def C(h):
    return contorno_de(hex_rgb(h))


CATALOGO = {
    'puerto': dict(
        {n: (casa(n), 64, 80, 14, C('#4a3428'), (160, 60), 172, 0.0, 1.6) for n in CASAS},
        tienda_puerto=(tienda_puerto, 76, 66, 16, C('#4a3428'), (196, 60), 210, 0.0, 1.6),
        taberna_puerto=(taberna_puerto, 72, 82, 14, C('#4a3428'), (184, 60), 196, 0.0, 1.6),
        faro=(faro, 30, 92, 10, C('#6c6f78'), (64, 30), 70, 0.0, 1.4),
        barril=(barril, 16, 22, 6, C('#6a4428'), (18, 10), 18, 0.0),
        cajas=(cajas, 22, 30, 6, C('#6a4a2a'), (22, 12), 24, 0.0),
        ancla=(ancla, 24, 34, 6, C('#3a3e46'), (26, 10), 24, 0.0),
        noray=(noray, 12, 14, 4, C('#3a3e46'), (10, 8), 10, 0.0),
        farol_puerto=(farol_puerto, 16, 46, 4, C('#3a3e46'), (8, 8), 10, 0.0),
        bote_varado=(bote_varado, 38, 22, 8, C('#2a4a5a'), (78, 24), 78, 0.35, 1.4),
        rollo_cuerda=(rollo_cuerda, 16, 14, 5, C('#7a5a2a'), (14, 8), 14, 0.0),
        puesto_pescado=(puesto_pescado, 30, 36, 9, C('#4a3428'), (46, 16), 48, 0.0),
        banco_puerto=(banco_puerto, 26, 20, 5, C('#6c6f78'), (36, 8), 34, 0.0),
        boya=(boya, 12, 22, 4, C('#7a2a22'), (10, 6), 12, 0.0),
        fuente_ancla=(fuente_ancla, 36, 36, 10, C('#6c6f78'), (86, 30), 90, 0.0, 1.5),
        macetero=(macetero, 16, 22, 5, C('#6a3a22'), (12, 8), 14, 0.0),
    ),
    'pantano': dict(
        choza_zancos=(choza_zancos, 46, 54, 10, C('#4a3a2a'), (92, 46), 100, 0.0, 1.4),
        tronco_caido=(tronco_caido, 40, 22, 7, C('#3a2e24'), (62, 14), 64, 0.2),
        juncos=(juncos, 20, 32, 5, C('#3a4a22'), (0, 0), 14, 0.0),
        farol_fatuo=(farol_fatuo, 30, 36, 4, C('#2a2420'), (8, 8), 10, 0.0),
        caldero_pantano=(caldero_pantano, 26, 30, 6, C('#24262c'), (22, 12), 24, 0.0),
        totem_pantano=(totem_pantano, 22, 30, 5, C('#4a3424'), (14, 10), 16, 0.0),
        raiz_retorcida=(raiz_retorcida, 42, 28, 6, C('#3a2e24'), (0, 0), 0, 0.0),
        roca_pantano=(roca_pantano, 30, 22, 7, C('#4a4e44'), (32, 14), 34, 0.0),
        seta_pantano=(seta_pantano, 20, 16, 5, C('#6a5a3a'), (0, 0), 12, 0.0),
    ),
    'aldor': dict(
        columna_caida=(columna_caida, 42, 18, 7, C('#8a8070'), (60, 14), 62, 0.15),
        columna_hiedra=(columna_hiedra, 16, 42, 5, C('#8a8070'), (14, 10), 16, 0.0),
        fuste_roto=(fuste_roto, 26, 28, 6, C('#8a8070'), (14, 10), 16, 0.0),
        portico_ruinas=(portico_ruinas, 54, 46, 8, C('#8a8070'), (0, 0), 90, 0.0, 1.4),
        obelisco_sol=(obelisco_sol, 18, 40, 6, C('#8a6a40'), (14, 10), 18, 0.0),
        altar_solar=(altar_solar, 26, 26, 7, C('#8a6a40'), (28, 14), 30, 0.0),
        escalinata_rota=(escalinata_rota, 34, 24, 8, C('#8a8070'), (36, 16), 38, 0.0),
        brasero_dorado=(brasero_dorado, 14, 26, 4, C('#7a5a22'), (10, 8), 12, 0.0),
        anfora=(anfora, 24, 22, 5, C('#7a3e22'), (14, 8), 16, 0.0),
        muro_roto=(muro_roto, 34, 24, 6, C('#8a6a40'), (56, 12), 58, 0.0),
        cabeza_estatua=(cabeza_estatua, 30, 30, 7, C('#6c6a64'), (30, 14), 34, 0.0, 1.3),
    ),
    'colinas': dict(
        calabazas=(calabazas, 34, 18, 6, C('#8a4a1a'), (30, 10), 32, 0.0),
        pila_hojas=(pila_hojas, 26, 14, 6, C('#8a4a1a'), (0, 0), 0, 0.0),
        pila_lena=(pila_lena, 34, 20, 6, C('#4a3424'), (52, 14), 54, 0.0),
        tocon_hacha=(tocon_hacha, 24, 18, 6, C('#4a3424'), (16, 10), 18, 0.0),
        cerca_rustica=(cerca_rustica, 30, 16, 4, C('#3a2a1e'), (56, 8), 0, 0.0),
        cabana_cazador=(cabana_cazador, 52, 52, 12, C('#3a2a1e'), (118, 50), 124, 0.0, 1.6),
        carro_lena=(carro_lena, 46, 24, 8, C('#3a2a1e'), (52, 16), 54, 0.0),
        roca_liquen=(roca_liquen, 32, 20, 6, C('#5a5a56'), (30, 12), 32, 0.0),
        seta_otono=(seta_otono, 24, 20, 5, C('#4a2e1a'), (12, 8), 14, 0.0),
        gavilla=(gavilla, 12, 20, 4, C('#7a5a22'), (8, 6), 10, 0.0),
    ),
    'selva': dict(
        templo_selva=(templo_selva, 54, 44, 14, C('#4a4e3a'), (140, 60), 150, 0.0, 1.6),
        totem_selva=(totem_selva, 20, 24, 5, C('#4a4e3a'), (22, 12), 26, 0.0, 1.2),
        helecho=(helecho, 30, 18, 6, C('#1f4a1e'), (0, 0), 20, 0.0),
        flor_tropical=(flor_tropical, 24, 26, 6, C('#2a4a1e'), (0, 0), 14, 0.0),
        roca_selva=(roca_selva, 30, 22, 7, C('#4a4e3a'), (32, 14), 34, 0.0),
        bambu=(bambu, 30, 58, 5, C('#4a5a22'), (18, 10), 18, 0.0),
        tronco_lianas=(tronco_lianas, 48, 22, 8, C('#3a2e22'), (60, 14), 62, 0.2),
        cabana_selva=(cabana_selva, 40, 44, 13, C('#4a3a22'), (74, 40), 80, 0.0, 1.5),
    ),
    'volcan': dict(
        roca_volcanica=(roca_volcanica, 30, 22, 7, C('#2a2830'), (32, 14), 34, 0.0),
        fumarola=(fumarola, 28, 18, 8, C('#3a3434'), (26, 12), 28, 0.0),
        cristal_fuego=(cristal_fuego, 22, 24, 6, C('#6a2a1e'), (20, 10), 22, 0.0),
        yunque=(yunque, 24, 18, 7, C('#1e1e24'), (18, 10), 20, 0.0),
        forja=(forja, 40, 48, 9, C('#3a2a24'), (70, 30), 74, 0.0, 1.4),
        craneo_dragon=(craneo_dragon, 48, 28, 7, C('#8a7e64'), (50, 16), 54, 0.5, 1.3),
        brasero_volcan=(brasero_volcan, 16, 28, 4, C('#1e1c26'), (10, 8), 12, 0.0),
        obelisco_obsidiana=(obelisco_obsidiana, 18, 44, 5, C('#1e1c26'), (14, 10), 18, 0.0),
        roca_lava=(roca_lava, 30, 18, 6, C('#1e1c26'), (26, 10), 28, 0.0),
    ),
    'hongos': dict(
        seta_pequena=(seta_pequena, 18, 14, 5, C('#2a3a6a'), (0, 0), 10, 0.0),
        cristal_luz=(cristal_luz, 22, 24, 6, C('#1e5a6a'), (20, 10), 22, 0.0),
        raiz_brillante=(raiz_brillante, 42, 26, 6, C('#2a2226'), (0, 0), 0, 0.0),
        tocon_musgo=(tocon_musgo, 24, 18, 6, C('#3a2a26'), (16, 10), 18, 0.0),
        farol_luciernaga=(farol_luciernaga, 22, 32, 4, C('#2a2226'), (8, 8), 10, 0.0),
        casa_seta=(casa_seta, 44, 48, 13, C('#5a2234'), (80, 40), 90, 0.0, 1.6),
        piedra_runa=(piedra_runa, 18, 30, 5, C('#3a3a4a'), (14, 10), 16, 0.0),
        hongo_estante=(hongo_estante, 38, 20, 6, C('#3a2a26'), (52, 12), 54, 0.0),
    ),
}
# (2026-11-24) "Los objetos de ese mapa no se adaptan al tamaño correcto respetando el tamaño del mapa y del
# personaje": los modelos salían a media escala de GameScene (un barril de 44 px junto a un personaje de 102).
# Se agrandan el modelo (`k`), la huella y la sombra: los pequeños x1.35, los medianos x1.6, el templo y el
# pórtico x2.1. Las casas, la tienda, la taberna, el faro, la farola, las cabañas, la fragua y la casa seta
# ya no salen de aquí: las dibuja en 2D tools/gf_motor_casas.py (generar-reinos, construir).
DIBUJO_2D = {'tienda_puerto', 'taberna_puerto', 'faro', 'farol_puerto', 'choza_zancos', 'cabana_cazador',
             'cabana_selva', 'forja', 'casa_seta'} | set(CASAS)


def _aumento(nombre, k):
    if nombre in ('templo_selva', 'portico_ruinas'):
        return 2.1
    return 1.6 if k > 1.05 else 1.35


for _c in CATALOGO.values():
    for _n, _f in list(_c.items()):
        if _n in DIBUJO_2D:
            continue
        _k = _f[8] if len(_f) > 8 else 1.0
        _a = _aumento(_n, _k)
        _hw, _hh = _f[5]
        _c[_n] = _f[:5] + ((round(_hw * _a), round(_hh * _a)), round(_f[6] * _a), _f[7], _k * _a)

for _z, _c in CATALOGO.items():
    assert _z not in P.CATALOGO, 'el catálogo %s ya existe' % _z
    P.CATALOGO[_z] = _c

# Las luces de noche de cada objeto (gf-zonas.js LUCES): [desplazamiento y, radio, fuerza].
LUCES = {
    # (2026-11-24) Medidas en el dibujo del motor 2D: la farola alumbra desde su farol (198 px sobre el pie,
    # como el poste de GameScene) y el faro desde su linterna (434 px; gf-reinos.js ALTO_FARO).
    'farol_puerto': [-198, 270, 0.95], 'faro': [-434, 560, 1], 'taberna_puerto': [-110, 300, 0.8], 'tienda_puerto': [-64, 250, 0.55],
    # (2026-11-24) Las casas 2D del puerto (tools/gf_motor_casas.py): el farol de la puerta.
    'casa_azul': [-106, 170, 0.55], 'casa_coral': [-106, 170, 0.55], 'casa_ocre': [-106, 170, 0.55],
    'casa_menta': [-106, 170, 0.55], 'casa_pizarra': [-106, 170, 0.55], 'casa_terracota': [-106, 170, 0.55],
    'casa_lila': [-106, 170, 0.55], 'casa_marfil': [-106, 170, 0.55],
    'farol_fatuo': [-158, 220, 0.7, 49], 'caldero_pantano': [-32, 220, 0.7], 'choza_zancos': [-158, 210, 0.6],
    'brasero_dorado': [-54, 300, 1], 'altar_solar': [-49, 240, 0.7], 'obelisco_sol': [-81, 200, 0.6],
    'cabana_cazador': [-106, 250, 0.7],
    'templo_selva': [-147, 300, 0.6], 'cabana_selva': [-134, 190, 0.55], 'totem_selva': [-38, 150, 0.5],
    'forja': [-56, 340, 1], 'brasero_volcan': [-59, 300, 1], 'fumarola': [-22, 200, 0.7], 'cristal_fuego': [-32, 170, 0.6],
    'obelisco_obsidiana': [-68, 190, 0.6], 'roca_lava': [-14, 150, 0.5], 'roca_volcanica': [-19, 130, 0.4],
    'cristal_luz': [-32, 180, 0.7], 'farol_luciernaga': [-180, 210, 0.8, 2], 'casa_seta': [-96, 270, 0.8],
    'piedra_runa': [-40, 160, 0.6], 'seta_pequena': [-14, 110, 0.5], 'raiz_brillante': [-22, 140, 0.5], 'tocon_musgo': [-16, 100, 0.4],
}


def comprobar_biomas(ruta_tileset):
    """El agua sigue azul y nada más se le parece (gf-agua, la pesca)."""
    from PIL import Image
    ts = np.array(Image.open(ruta_tileset).convert('RGBA'))
    fam = gf_biomas.mascara_familias(ts)
    out = {}
    for z in REINOS:
        a = gf_biomas.recolorear(ts, z)[..., :3].astype(int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        opaco = ts[..., 3] > 0
        agua = fam['agua'] & opaco
        ok_agua = ((b > 110) & (b > r + 35) & (b > g + 10))[agua].mean() if agua.any() else 1.0
        resto = opaco & ~agua
        falso = ((b > r + 35) & (b > g + 10) & (b > 110))[resto].mean()
        out[z] = (round(float(ok_agua), 4), round(float(falso), 5))
    return out
