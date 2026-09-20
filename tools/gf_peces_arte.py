#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF PECES ARTE — el pincel que dibuja un pez
=============================================================================

Aqui NO hay ninguna especie. Solo la maquinaria: siluetas, aletas, patrones,
ojos y podredumbre. El catalogo de especies vive en `generar-peces.py`.

POR QUE ASI Y NO 400 DIBUJOS
---------------------------------------------------------------------------
400 peces dibujados a mano salen distintos entre si de la forma mala: distinto
grosor de contorno, distinta luz, distinto ojo. Y 400 peces sacados de UNA
plantilla recoloreada salen distintos de ninguna forma: se ve que son el mismo
pez pintado de otro color.

La solucion es separar las dos cosas que de verdad distinguen a un pez:

    LA SILUETA   -> 26 arquetipos, cada uno con su propio perfil de lomo y de
                    vientre, su cola y su juego de aletas. Una anguila y un pez
                    globo no comparten un solo pixel de contorno.
    LA LIBREA    -> paleta (lomo / vientre / patron / aleta) + patron (16
                    formas distintas de manchar el cuerpo).

Una trucha y un salmon comparten arquetipo pero no librea; un salmon y una
anguila no comparten nada. Cruzando 26 x 80 x 16 hay sitio de sobra para 400
peces sin que dos se confundan.

COMO SE CONSTRUYE LA SILUETA
---------------------------------------------------------------------------
Columna a columna, a resolucion nativa. Cada arquetipo define dos perfiles —
cuanto sube el lomo y cuanto baja el vientre en cada punto del cuerpo — como
puntos de control que `gf_arte.perfil()` interpola sin rebotes. Para la columna
x se rellena de `centro - lomo(t)` a `centro + vientre(t)`.

De ahi sale gratis lo que hace que un pez parezca un pez:

  * el SOMBREADO. Sabiendo el techo y el suelo de cada columna se puede saber
    a que altura RELATIVA esta cada pixel (0 = lomo, 1 = vientre). Los peces
    van contrasombreados —lomo oscuro, vientre claro, porque desde arriba se
    confunden con el fondo y desde abajo con la luz— y eso es exactamente una
    interpolacion sobre esa altura relativa.
  * los PATRONES, que se estampan en coordenadas del cuerpo y no de la imagen,
    asi que las bandas de un pez alto y las de uno plano caen donde deben.
  * las ALETAS, que se anclan al perfil y nunca quedan flotando.

EL CONTORNO ES UNO SOLO
---------------------------------------------------------------------------
Se calcula sobre la union de cuerpo + aletas + cola, nunca por pieza. Si no,
cada aleta trae su propia linea negra y el pez se ve despiezado. Dentro, la
union cuerpo/aleta se marca con una linea mas suave (`contorno_de(c, 0.55)`).

LOS PECES MALOS
---------------------------------------------------------------------------
Tres formas distintas de ser malo, y ninguna es "el mismo pez en marron":

    podrido   la regla de podredumbre medida en el juego (ver gf_arte.pudrir),
              mas mordidas en las aletas, manchas de moho y ojo lechoso.
    enfermo   palido y lavado, con llagas, costillas marcadas y aletas rotas.
    venenoso  sano y vistoso, pero con espinas, colores de aviso y ojo rojo.
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, perfil, rng_de


# ===========================================================================
# LIENZO DE TRABAJO
# ===========================================================================

W = 78          # el pez se dibuja aqui dentro y luego se recorta a su tamano
H = 60
CX = 6          # el morro empieza aqui
CY = H // 2


# ===========================================================================
# PALETAS
#   (lomo, vientre, patron, aleta)  —  la aleta a None se deduce del lomo
# ===========================================================================

PALETAS = {
    # --- agua dulce ---------------------------------------------------
    'trucha_iris':    ('#4a5f52', '#e2e0d2', '#c0453f', '#7d8f6a'),
    'trucha_marron':  ('#6b5330', '#ded1a8', '#3b2a15', '#8a6c40'),
    'trucha_arroyo':  ('#3d4a33', '#d9c99a', '#d8863a', '#6d7a4c'),
    'salmon':         ('#4d6d84', '#e9e4e0', '#d1727a', '#8ba0ad'),
    'salmon_rojo':    ('#7c2f2a', '#c65e4e', '#3f1614', '#96453a'),
    'carpa_bronce':   ('#7a6234', '#d8c07e', '#4e3d1d', '#96793f'),
    'koi_naranja':    ('#e07c30', '#f6efe4', '#b2461c', '#f0a765'),
    'koi_rojo':       ('#c8352f', '#f4ece0', '#7a1c18', '#dd6a5c'),
    'koi_negro':      ('#2f3138', '#e8e6df', '#14161a', '#4b4e57'),
    'dorado':         ('#d9a326', '#f7e9b6', '#8f6410', '#ecc55c'),
    'lucio':          ('#4f6136', '#d5cf9d', '#96a45c', '#6d7f45'),
    'perca':          ('#6c7434', '#dcd6a4', '#2f3a17', '#c8802e'),
    'lubina_verde':   ('#43593c', '#d7d5b4', '#26331f', '#5e7551'),
    'siluro':         ('#4a463c', '#c9bfa4', '#2b2822', '#615c4e'),
    'anguila_oliva':  ('#4c4a27', '#c2b483', '#2c2a17', '#5d5a33'),
    'anguila_negra':  ('#2c2f2b', '#9aa08d', '#181a17', '#3b3f39'),
    'esturion':       ('#6a6c66', '#d3cec0', '#3d3f3a', '#828479'),
    'tenca':          ('#5b5a2c', '#b6ad6c', '#33321a', '#6f6d36'),
    'barbo':          ('#8a7a4e', '#e0d3ae', '#5a4e30', '#a3925f'),
    'gobio':          ('#7d7358', '#d6cdb4', '#4a4434', '#8f8567',),
    'pirana':         ('#7b7f86', '#c85a44', '#3c3f45', '#9aa0a8'),
    'arowana':        ('#c2a33c', '#efe0a8', '#7d6720', '#d8bd5d'),
    'disco_rojo':     ('#c1442c', '#f0c66a', '#5c2a15', '#3f7ab0'),
    'betta':          ('#8e2f6e', '#d3568f', '#4a1839', '#3f5fb8'),
    'neon_tetra':     ('#2f5f8c', '#d8dde2', '#2ec6d8', '#8fa4b5'),
    'guppy':          ('#5f8fbf', '#f0d98a', '#d8593f', '#7fd8c8'),
    'pez_gato_albino': ('#e4d9c8', '#f7f1e6', '#c9b8a2', '#efe6d6'),

    # --- mar templado --------------------------------------------------
    'caballa':        ('#2f6a7a', '#e6e9ea', '#12313a', '#4d8996'),
    'sardina':        ('#4d7f96', '#eceff0', '#2c5666', '#7ba3b4'),
    'arenque':        ('#5a7d8c', '#e8ecee', '#37545f', '#85a3ae'),
    'boqueron':       ('#6f92a3', '#f2f4f4', '#4a6d7c', '#96b2bf'),
    'atun':           ('#28517e', '#dfe6ea', '#123055', '#d8b44a'),
    'bonito':         ('#2c5f74', '#e2e7e9', '#163846', '#4f8496'),
    'bacalao':        ('#7c7a52', '#e6e2ce', '#4e4c2f', '#94926a'),
    'merluza':        ('#6d7a80', '#e2e4e0', '#454f54', '#8b979c'),
    'abadejo':        ('#5f6d55', '#dcdcc8', '#3a4433', '#79876e'),
    'lenguado':       ('#8a7550', '#ded0b2', '#5a4a2e', '#9d8862'),
    'platija':        ('#7a6b4a', '#d8ccae', '#c07a2c', '#8d7d59'),
    'rodaballo':      ('#6c6448', '#cfc6a8', '#433d2b', '#7e7659'),
    'dorada':         ('#a8a48c', '#efeade', '#d9c25e', '#bcb89f'),
    'lubina_plata':   ('#7e8d95', '#eff2f2', '#4f5c63', '#98a6ad'),
    'sargo':          ('#8f9298', '#eef0f1', '#31343a', '#a5a8ad'),
    'salmonete':      ('#c05a48', '#f0d9c4', '#8a3325', '#d98a6a'),
    'jurel':          ('#5c7f8f', '#e7ebec', '#38596a', '#7fa0ae'),
    'besugo':         ('#c2705e', '#f2ded0', '#8c4433', '#d8968a'),
    'rape':           ('#5a4c3f', '#a89682', '#332b22', '#6b5c4c'),
    'congrio':        ('#585c56', '#c4c6bb', '#33362f', '#6a6e67'),
    'morena':         ('#4f5c2c', '#c3c07a', '#2b3317', '#616f38'),
    'raya_gris':      ('#7c7566', '#ccc4b0', '#4a453a', '#8d8677'),
    'tiburon_gris':   ('#6e7a82', '#e2e5e4', '#454f56', '#828d94'),
    'tiburon_azul':   ('#3f6288', '#e4e9ec', '#22405e', '#5d80a4'),
    'pez_espada':     ('#33445e', '#dee3e8', '#1b2739', '#4d6280'),
    'barracuda':      ('#7b8790', '#eef0f0', '#4b545b', '#919ca4'),
    'mero':           ('#6b5340', '#c9b48f', '#3d2d21', '#7d6450'),
    'cabracho':       ('#a83f34', '#e0a878', '#6b2118', '#c05f4a'),

    # --- arrecife -------------------------------------------------------
    'payaso':         ('#e2691f', '#f7f2e8', '#2b1a10', '#f09a4e'),
    'cirujano_azul':  ('#2555a8', '#5a8fd8', '#101c33', '#e8c53a'),
    'mariposa':       ('#e8c23a', '#f7efd2', '#2c2618', '#f0d76e'),
    'angel_real':     ('#2f6fa8', '#e8d45a', '#16324a', '#4d92c6'),
    'loro_verde':     ('#2f8f77', '#67c8a8', '#155245', '#d85f8a'),
    'napoleon':       ('#3f7f8c', '#8fc4c2', '#22474f', '#57a0a8'),
    'pez_leon':       ('#a83a30', '#f2e2d0', '#3a1512', '#e0e0d8'),
    'pez_globo':      ('#a8925f', '#e6dcc0', '#4a3f26', '#bda878'),
    'pez_cofre':      ('#e0b52c', '#f5e6a8', '#5c4610', '#efd06a'),
    'mandarin':       ('#2f6f9e', '#e07a2c', '#123246', '#3f9f6a'),
    'damisela':       ('#2f4f9e', '#6f8fd8', '#16264a', '#4a6ec0'),
    'labrido':        ('#5f9e3f', '#d8e08a', '#2f5218', '#7ac055'),
    'pez_payaso_rosa': ('#d8628a', '#f5e0e6', '#7a2f45', '#e88faa'),

    # --- abismo ---------------------------------------------------------
    'abisal_negro':   ('#22252c', '#3c4049', '#0f1114', '#2e323a'),
    'rape_abisal':    ('#2b2621', '#463f36', '#141210', '#38322b'),
    'vibora_mar':     ('#1e2a33', '#38505f', '#0d1317', '#2a3a46'),
    'linterna':       ('#2a3040', '#4a5468', '#7fe0d8', '#363d4f'),
    'pez_gelatina':   ('#8a7f8c', '#c8bcc6', '#5c5460', '#a397a0'),
    'pelicano':       ('#241f2b', '#3e3648', '#100e14', '#2f2938'),
    'quimera':        ('#4a4258', '#8a7fa0', '#282234', '#5d5470'),
    'nautilo':        ('#c8a878', '#f0e2c8', '#8a5f3a', '#d8bd95'),

    # --- hielo ----------------------------------------------------------
    'artico_plata':   ('#8fa4b5', '#eff5f8', '#5b6e7d', '#a8bcc9'),
    'bacalao_polar':  ('#6f8296', '#dfe8ee', '#42505e', '#8697a8'),
    'escarcha':       ('#7fb2c8', '#e8f6fa', '#4a7f96', '#9fcbdb'),
    'cristal_hielo':  ('#a8d8e8', '#f2fbfd', '#5f9fb8', '#c6e8f2'),
    'salvelino':      ('#37514f', '#d8c9a8', '#d8624a', '#5d7a76'),

    # --- pantano --------------------------------------------------------
    'cieno':          ('#4f5232', '#a8a273', '#2c2e1a', '#61643e'),
    'limo_verde':     ('#3f5a2c', '#9fb06a', '#223315', '#537538'),
    'turbio':         ('#5c4f38', '#b0a180', '#332c1e', '#6e5f45'),
    'sanguijuela':    ('#3a2b2f', '#7a5f52', '#1e1517', '#4a373b'),
    'rana_verde':     ('#5f8f3a', '#d2d88f', '#2f4f18', '#75a84a'),
    'tortuga':        ('#5a6b3a', '#b8a86a', '#33401f', '#6d8047'),

    # --- caverna / subterraneo -------------------------------------------
    'ciego_palido':   ('#d8cfc0', '#f2ece0', '#a89880', '#e6ddd0'),
    'gruta_azul':     ('#3f5a6b', '#8fa8b5', '#22333e', '#4f7080'),
    'hongo_pez':      ('#7a5f7f', '#c0a8c4', '#452f48', '#8e7093'),

    # --- magico / legendario ---------------------------------------------
    'espectral':      ('#8fd8d0', '#e8fbf8', '#3f7a76', '#b0e8e2'),
    'obsidiana':      ('#26232b', '#4f4a58', '#100e13', '#6a3f8a'),
    'magma':          ('#a8331c', '#f0a83a', '#4a1408', '#d85f1c'),
    'celestial':      ('#d8bd4a', '#f7edc0', '#8a6f14', '#efd97a'),
    'lunar':          ('#8f96c8', '#e4e6f7', '#565c8a', '#a8afd8'),
    'jade':           ('#2f8f6a', '#a8d8c0', '#155440', '#46a884'),
    'rubi':           ('#b8203f', '#e88a9a', '#6b0d22', '#d44560'),
    'amatista':       ('#7a3fa8', '#c8a0e0', '#43206b', '#9560c0'),
    'perla':          ('#e0dae4', '#faf7fb', '#a89fb0', '#ece7ef'),
    'arcoiris':       ('#3f8fd8', '#f0e8a8', '#d84a7a', '#5fc0a8'),
    'vacio':          ('#2a2038', '#5a4a72', '#120d1a', '#3d3050'),
    'tormenta':       ('#4a5a6b', '#c8d2da', '#e8d84a', '#5f7285'),
    'coral_vivo':     ('#d8624a', '#f2b08f', '#8a2f1c', '#e88a6a'),

    # --- crustaceos y moluscos --------------------------------------------
    'cangrejo_rojo':  ('#bd3f2c', '#e89a72', '#6b1a10', '#c9553c'),
    'cangrejo_verde': ('#4f6b3a', '#a8b878', '#2a3a1c', '#5f7d46'),
    'buey_mar':       ('#a86b3f', '#dfbc8a', '#5f3418', '#b87c4f'),
    'gamba_rosa':     ('#e08a7a', '#f7d8c8', '#a04a3a', '#ee9f90'),
    'langosta_azul':  ('#2f5f9e', '#7fa8d8', '#153a6b', '#3f75b5'),
    'pulpo_purpura':  ('#8a4a7a', '#c890b5', '#4f2545', '#9c5c8c'),
    'calamar':        ('#c8a0a8', '#efdcd8', '#8a5f68', '#d8b5bc'),
    'medusa_luna':    ('#a8c8e0', '#e2f0f8', '#6b8fa8', '#c0dcee'),
    'medusa_fuego':   ('#d8624a', '#f0a890', '#8a2f1c', '#e88a72'),
    'ostra':          ('#9a917f', '#d8d0bc', '#5f584a', '#aca392'),
    'vieira':         ('#d8a06a', '#f2d8b5', '#8f5f30', '#e3b586'),
    'mejillon':       ('#2f3548', '#5a6478', '#171b26', '#3d4557'),
    'caracola':       ('#e0c08a', '#f7ead0', '#a07f4a', '#ebd3aa'),
    'erizo':          ('#4a2f5a', '#7a5f8a', '#281633', '#5c3d6e'),
    'estrella_mar':   ('#e08a3a', '#f2c88a', '#a05518', '#e9a75f'),
    'pepino_mar':     ('#7a5f4a', '#b09580', '#4a382c', '#8a6d57'),
}


def paleta(nombre):
    p = PALETAS[nombre]
    lomo = A.hex_rgb(p[0])
    vientre = A.hex_rgb(p[1])
    patron = A.hex_rgb(p[2])
    aleta = A.hex_rgb(p[3]) if p[3] else ajusta(lomo, dv=1.15, ds=0.85)
    return {'lomo': lomo, 'vientre': vientre, 'patron': patron, 'aleta': aleta}


# ===========================================================================
# ARQUETIPOS — la silueta
#   lomo/vientre: puntos de control (t, altura) en fraccion de `alto`
#   cola: (tipo, largo_rel, alto_rel)
#   aletas: lista de (sitio, tipo, t0, t1, alto_rel)
# ===========================================================================

ARQ = {
    'fusiforme': dict(
        lomo=[(0, .12), (.10, .40), (.32, .50), (.60, .42), (.86, .24), (1, .17)],
        vientre=[(0, .10), (.12, .36), (.42, .46), (.72, .34), (1, .15)],
        cola=('bifurcada', .40, .95), largo_rel=3.0,
        aletas=[('dorsal', 'triangulo', .34, .56, .46),
                ('adiposa', 'boton', .74, .80, .16),
                ('anal', 'triangulo', .62, .76, .32),
                ('pectoral', 'hoja', .24, .38, .30),
                ('pelvica', 'hoja', .42, .52, .24)]),
    'fusiforme_rapido': dict(
        lomo=[(0, .14), (.14, .42), (.36, .46), (.68, .30), (1, .13)],
        vientre=[(0, .12), (.16, .38), (.48, .40), (.78, .24), (1, .12)],
        cola=('lunada', .42, 1.25), largo_rel=3.5,
        aletas=[('dorsal', 'guadana', .30, .48, .52),
                ('dorsal', 'triangulo', .60, .70, .20),
                ('anal', 'guadana', .58, .72, .34),
                ('pectoral', 'guadana', .24, .42, .34),
                ('quilla', 'linea', .86, .94, .06)]),
    'alto': dict(
        lomo=[(0, .16), (.12, .52), (.34, .74), (.62, .60), (.88, .28), (1, .20)],
        vientre=[(0, .14), (.16, .52), (.46, .66), (.78, .38), (1, .18)],
        cola=('bifurcada', .34, 1.0), largo_rel=1.7,
        aletas=[('dorsal', 'espinosa', .22, .58, .40),
                ('dorsal', 'triangulo', .58, .78, .30),
                ('anal', 'espinosa', .58, .80, .30),
                ('pectoral', 'hoja', .26, .40, .34),
                ('pelvica', 'punta', .38, .46, .40)]),
    'disco': dict(
        lomo=[(0, .22), (.14, .62), (.40, .84), (.68, .70), (.90, .34), (1, .22)],
        vientre=[(0, .20), (.16, .60), (.44, .80), (.74, .52), (1, .22)],
        cola=('redondeada', .26, .70), largo_rel=1.25,
        aletas=[('dorsal', 'manto', .18, .74, .34),
                ('anal', 'manto', .22, .76, .32),
                ('pectoral', 'redonda', .28, .40, .32),
                ('pelvica', 'hilo', .34, .40, .52)]),
    'plano': dict(
        lomo=[(0, .18), (.16, .56), (.46, .64), (.76, .46), (1, .18)],
        vientre=[(0, .16), (.18, .54), (.50, .62), (.80, .42), (1, .16)],
        cola=('abanico', .26, .80), largo_rel=1.9,
        aletas=[('dorsal', 'manto', .10, .92, .26),
                ('anal', 'manto', .14, .92, .24),
                ('pectoral', 'redonda', .26, .36, .22)]),
    'anguila': dict(
        lomo=[(0, .30), (.10, .40), (.45, .36), (.80, .26), (1, .14)],
        vientre=[(0, .26), (.12, .38), (.50, .34), (.84, .22), (1, .12)],
        cola=('punta', .10, .40), largo_rel=5.2, ondula=0.9,
        aletas=[('dorsal', 'manto', .28, .98, .22),
                ('anal', 'manto', .46, .98, .18),
                ('pectoral', 'redonda', .14, .22, .26)]),
    'serpiente': dict(
        lomo=[(0, .34), (.12, .42), (.55, .34), (.85, .22), (1, .10)],
        vientre=[(0, .30), (.14, .40), (.58, .32), (.88, .18), (1, .08)],
        cola=('punta', .08, .30), largo_rel=6.5, ondula=1.5,
        aletas=[]),
    'aguja': dict(
        lomo=[(0, .10), (.20, .30), (.50, .30), (.80, .20), (1, .10)],
        vientre=[(0, .08), (.22, .28), (.54, .28), (.84, .18), (1, .09)],
        cola=('bifurcada', .34, .95), largo_rel=6.0, pico=0.30,
        aletas=[('dorsal', 'triangulo', .62, .78, .34),
                ('anal', 'triangulo', .64, .78, .28),
                ('pectoral', 'hoja', .34, .44, .22)]),
    'vela': dict(
        lomo=[(0, .12), (.18, .40), (.46, .44), (.76, .26), (1, .12)],
        vientre=[(0, .10), (.20, .36), (.54, .38), (.82, .22), (1, .11)],
        cola=('lunada', .40, 1.35), largo_rel=4.0, pico=0.34,
        aletas=[('dorsal', 'vela', .28, .70, 1.15),
                ('anal', 'guadana', .66, .80, .30),
                ('pelvica', 'hilo', .40, .46, .70),
                ('pectoral', 'guadana', .30, .44, .30)]),
    'globo': dict(
        lomo=[(0, .30), (.16, .62), (.44, .70), (.72, .56), (.92, .26), (1, .16)],
        vientre=[(0, .28), (.18, .60), (.48, .68), (.78, .48), (1, .16)],
        cola=('abanico', .24, .80), largo_rel=1.35, espinas=True,
        aletas=[('dorsal', 'redonda', .62, .76, .26),
                ('anal', 'redonda', .64, .78, .24),
                ('pectoral', 'redonda', .28, .40, .30)]),
    'cofre': dict(
        lomo=[(0, .30), (.14, .60), (.50, .62), (.80, .40), (1, .18)],
        vientre=[(0, .28), (.16, .56), (.52, .58), (.82, .34), (1, .16)],
        cola=('recta', .24, .70), largo_rel=1.6,
        aletas=[('dorsal', 'redonda', .60, .74, .24),
                ('anal', 'redonda', .62, .76, .22),
                ('pectoral', 'redonda', .26, .38, .28)]),
    'tiburon': dict(
        lomo=[(0, .12), (.16, .42), (.40, .46), (.72, .30), (.92, .16), (1, .12)],
        vientre=[(0, .10), (.18, .40), (.50, .42), (.80, .22), (1, .10)],
        cola=('heterocerca', .46, 1.25), largo_rel=3.6, morro=0.5,
        aletas=[('dorsal', 'guadana', .34, .50, .62),
                ('dorsal', 'triangulo', .70, .78, .18),
                ('anal', 'triangulo', .70, .80, .20),
                ('pectoral', 'guadana', .26, .44, .52)]),
    'martillo': dict(
        lomo=[(0, .16), (.18, .42), (.44, .44), (.74, .28), (1, .12)],
        vientre=[(0, .14), (.20, .40), (.52, .40), (.82, .20), (1, .10)],
        cola=('heterocerca', .44, 1.2), largo_rel=3.6, martillo=True,
        aletas=[('dorsal', 'guadana', .32, .48, .66),
                ('anal', 'triangulo', .70, .80, .18),
                ('pectoral', 'guadana', .26, .42, .50)]),
    'raya': dict(largo_rel=1.5, pintor='raya'),
    'bagre': dict(
        lomo=[(0, .26), (.14, .42), (.40, .44), (.72, .30), (1, .14)],
        vientre=[(0, .22), (.16, .44), (.50, .42), (.80, .22), (1, .12)],
        cola=('redondeada', .30, .90), largo_rel=3.4, barbas=4,
        aletas=[('dorsal', 'triangulo', .28, .42, .40),
                ('adiposa', 'boton', .70, .78, .18),
                ('anal', 'manto', .58, .84, .24),
                ('pectoral', 'punta', .22, .34, .38)]),
    'cabezon': dict(
        lomo=[(0, .26), (.14, .54), (.40, .56), (.72, .38), (1, .16)],
        vientre=[(0, .24), (.18, .52), (.52, .52), (.82, .28), (1, .14)],
        cola=('redondeada', .28, .95), largo_rel=2.4,
        aletas=[('dorsal', 'espinosa', .24, .56, .34),
                ('dorsal', 'manto', .58, .80, .26),
                ('anal', 'manto', .62, .82, .24),
                ('pectoral', 'redonda', .26, .40, .36)]),
    'linterna': dict(
        lomo=[(0, .34), (.16, .66), (.42, .62), (.74, .36), (1, .14)],
        vientre=[(0, .40), (.20, .60), (.54, .50), (.84, .24), (1, .12)],
        cola=('redondeada', .26, .80), largo_rel=1.7, cana=True, dientes=True,
        aletas=[('dorsal', 'manto', .48, .72, .22),
                ('anal', 'manto', .58, .78, .20),
                ('pectoral', 'punta', .30, .42, .30)]),
    'luna': dict(
        lomo=[(0, .30), (.16, .74), (.46, .88), (.78, .70), (1, .52)],
        vientre=[(0, .28), (.18, .72), (.50, .86), (.80, .66), (1, .50)],
        cola=('recta', .12, 1.05), largo_rel=1.15,
        aletas=[('dorsal', 'guadana_alta', .74, .92, .70),
                ('anal', 'guadana_alta', .76, .94, .66),
                ('pectoral', 'redonda', .30, .40, .22)]),
    'caballito': dict(largo_rel=1.0, pintor='caballito'),
    'medusa':   dict(largo_rel=1.0, pintor='medusa'),
    'pulpo':    dict(largo_rel=1.0, pintor='pulpo'),
    'calamar':  dict(largo_rel=1.0, pintor='calamar'),
    'cangrejo': dict(largo_rel=1.0, pintor='cangrejo'),
    'gamba':    dict(largo_rel=1.0, pintor='gamba'),
    'langosta': dict(largo_rel=1.0, pintor='langosta'),
    'concha':   dict(largo_rel=1.0, pintor='concha'),
    'caracola': dict(largo_rel=1.0, pintor='caracola'),
    'estrella': dict(largo_rel=1.0, pintor='estrella'),
    'erizo':    dict(largo_rel=1.0, pintor='erizo'),
    'pepino':   dict(largo_rel=1.0, pintor='pepino'),
    'tortuga':  dict(largo_rel=1.0, pintor='tortuga'),
    'rana':     dict(largo_rel=1.0, pintor='rana'),
    'renacuajo': dict(largo_rel=1.0, pintor='renacuajo'),
    'gusano':   dict(largo_rel=1.0, pintor='gusano'),
}


def _normalizar_perfiles():
    """
    Los perfiles se escriben "a ojo" (el lomo sube .50, el vientre baja .46) y
    eso deja el alto real del cuerpo en 0.96 o en 1.64 segun el arquetipo. Aqui
    se reescalan para que lomo_max + vientre_max = 1 en TODOS.

    A partir de esa linea `alto` significa lo mismo en los 17 arquetipos con
    perfil: los pixeles que mide el cuerpo de arriba abajo, sin aletas. Sin
    esto, pedir "un pez de 8 de alto" daba 8 en unos y 13 en otros, y el
    catalogo no habia forma de cuadrarlo.
    """
    for arq in ARQ.values():
        if 'lomo' not in arq:
            continue
        k = max(p[1] for p in arq['lomo']) + max(p[1] for p in arq['vientre'])
        arq['lomo'] = [(t, h / k) for t, h in arq['lomo']]
        arq['vientre'] = [(t, h / k) for t, h in arq['vientre']]
        # Las aletas y la cola se escriben en la misma escala que el perfil, asi
        # que se dividen por lo mismo: si no, al normalizar el cuerpo encoge y
        # las aletas se quedan como estaban (un disco de 20 px acababa con un
        # hilo ventral de 16).
        arq['aletas'] = [(s, t, t0, t1, a / k) for s, t, t0, t1, a in arq.get('aletas', [])]
        c = arq['cola']
        arq['cola'] = (c[0], c[1], c[2] / k)


_normalizar_perfiles()


# ===========================================================================
# PIEZAS
# ===========================================================================

def _cola(m, tipo, bx, cy, largo, alto):
    """La cola nace en (bx, cy) y crece hacia la derecha."""
    l = max(2.0, largo)
    a = max(1.5, alto)
    if tipo == 'bifurcada':
        m.poligono([(bx - 1, cy - a * .30), (bx + l, cy - a), (bx + l * .62, cy),
                    (bx + l, cy + a), (bx - 1, cy + a * .30)])
    elif tipo == 'lunada':
        m.poligono([(bx - 1, cy - a * .22), (bx + l * .85, cy - a),
                    (bx + l, cy - a * .78), (bx + l * .50, cy),
                    (bx + l, cy + a * .78), (bx + l * .85, cy + a),
                    (bx - 1, cy + a * .22)])
    elif tipo == 'heterocerca':
        m.poligono([(bx - 1, cy - a * .30), (bx + l * .78, cy - a),
                    (bx + l, cy - a * .55), (bx + l * .52, cy + a * .10),
                    (bx + l * .80, cy + a * .62), (bx + l * .30, cy + a * .34),
                    (bx - 1, cy + a * .28)])
    elif tipo == 'redondeada':
        # Pala, no elipse: una elipse centrada en la cola se mete dentro del
        # cuerpo y por fuera se lee como un globo pegado al pez.
        m.poligono([(bx - 1, cy - a * .38), (bx + l * .45, cy - a * .96),
                    (bx + l, cy - a * .50), (bx + l, cy + a * .50),
                    (bx + l * .45, cy + a * .96), (bx - 1, cy + a * .38)])
    elif tipo == 'abanico':
        m.poligono([(bx - 1, cy - a * .34), (bx + l * .80, cy - a),
                    (bx + l, cy - a * .40), (bx + l, cy + a * .40),
                    (bx + l * .80, cy + a), (bx - 1, cy + a * .34)])
    elif tipo == 'recta':
        m.poligono([(bx - 1, cy - a), (bx + l, cy - a * .92),
                    (bx + l, cy + a * .92), (bx - 1, cy + a)])
    elif tipo == 'punta':
        m.poligono([(bx - 1, cy - a), (bx + l, cy), (bx - 1, cy + a)])
    elif tipo == 'velo':
        m.poligono([(bx - 1, cy - a * .30), (bx + l * .50, cy - a),
                    (bx + l, cy - a * .40), (bx + l * .70, cy + a * .30),
                    (bx + l, cy + a), (bx + l * .30, cy + a * .80),
                    (bx - 1, cy + a * .30)])
    return m


def _aleta(m, tipo, x0, x1, base, alto, arriba):
    """
    Una aleta entre x0 y x1. `arriba` = hacia el lomo.

    `base` es una FUNCION x -> y del filo del cuerpo, no un numero. Ese es el
    detalle que hace que la aleta se lea pegada: una aleta larga sobre un pez
    alto (la dorsal de un disco recorre medio cuerpo) tiene debajo un lomo que
    sube y baja 6 px, y anclarla a una recta la dejaba flotando por un lado y
    enterrada por el otro. Columna a columna no puede pasar.
    """
    s = -1 if arriba else 1
    a = max(1.0, alto)
    ancho = max(1.0, x1 - x0)
    ix0, ix1 = int(round(x0)), int(round(x1))

    if tipo in ('triangulo', 'espinosa', 'vela', 'manto', 'guadana_alta', 'cresta'):
        for x in range(ix0, ix1 + 1):
            u = min(1.0, max(0.0, (x - x0) / ancho))
            if tipo == 'triangulo':
                h = a * max(0.0, 1.0 - abs(u - 0.42) / 0.60) ** 0.8
            elif tipo == 'manto':
                h = a * (0.45 + 0.55 * math.sin(math.pi * u))
            elif tipo == 'vela':
                h = a * math.sin(math.pi * (0.13 + 0.74 * u))
            elif tipo == 'guadana_alta':
                h = a * (1.0 - u) ** 0.65
            elif tipo == 'cresta':
                h = a * (0.5 + 0.5 * math.sin(math.pi * u)) * (1.0 if x % 2 else 0.55)
            else:                                   # espinosa
                # La membrana NO puede bajar de la mitad. Con dientes de 0.6
                # los cortos quedaban tapados por el propio lomo y la dorsal se
                # veia como cinco pinchos sueltos flotando sobre el pez.
                h = a * (0.62 + 0.38 * math.sin(math.pi * u))
                h *= (1.0 if x % 2 == ix0 % 2 else 0.80)
                h = max(h, a * 0.50)
            yb = base(x)
            m.columna(x, yb, yb + s * max(1.0, h))
        return m

    cx = (x0 + x1) / 2.0
    yb = base(cx)
    if tipo == 'guadana':
        m.poligono([(x0, base(x0)), (x0 + ancho * .30, yb + s * a),
                    (x1 + ancho * .35, yb + s * a * .35), (x1, base(x1))])
    elif tipo == 'hoja':
        m.elipse(cx, yb + s * a * .45, ancho / 2.0, a * .70)
    elif tipo == 'redonda':
        m.elipse(cx, yb + s * a * .35, ancho / 2.0, a * .60)
    elif tipo == 'punta':
        m.poligono([(x0, base(x0)), (x1 + ancho * .40, yb + s * a * .75), (x1, base(x1))])
    elif tipo == 'boton':
        m.elipse(cx, yb + s * a * .5, max(1.0, ancho / 2.0), a * .8)
    elif tipo == 'hilo':
        m.linea(cx, yb, cx - 1, yb + s * a)
        m.linea(cx + 1, yb, cx, yb + s * a * .8)
    elif tipo == 'linea':
        m.poligono([(x0, yb - 1), (x1, yb + s * a), (x0, yb + 1)])
    return m


# ===========================================================================
# PATRONES
# ===========================================================================

def _patron(nombre, esp, rnd):
    """
    Devuelve fn(x, y, t, f) -> None (deja el color del cuerpo) o un color.
    `t` = 0 morro .. 1 cola;  `f` = 0 lomo .. 1 vientre.
    """
    pal = esp['pal']
    pc = pal['patron']
    L = esp['_L']

    if nombre == 'liso':
        return lambda x, y, t, f: None

    if nombre == 'rayas':
        n = rnd.choice([2, 3, 3, 4])
        gr = rnd.choice([0.055, 0.07, 0.09])
        cent = [0.25 + 0.5 * i / float(max(1, n - 1)) for i in range(n)] if n > 1 else [0.42]
        def fn(x, y, t, f):
            for c in cent:
                if abs(f - c) < gr:
                    return pc
            return None
        return fn

    if nombre == 'lateral':
        c0 = rnd.uniform(0.40, 0.52)
        gr = rnd.uniform(0.07, 0.11)
        return lambda x, y, t, f: pc if abs(f - c0) < gr and t > 0.06 else None

    if nombre == 'bandas':
        n = rnd.randint(4, 8)
        anch = rnd.uniform(0.30, 0.48)
        incl = rnd.uniform(-0.9, 0.9)
        def fn(x, y, t, f):
            u = (t + incl * (f - 0.5) * 0.35) * n
            return pc if (u % 1.0) < anch else None
        return fn

    if nombre == 'puntos':
        n = rnd.randint(7, 22)
        pts = [(rnd.uniform(0.10, 0.95), rnd.uniform(0.05, 0.85), rnd.choice([0, 0, 1]))
               for _ in range(n)]
        def fn(x, y, t, f):
            for pt, pf, g in pts:
                if abs(t - pt) * L < 1.0 + g and abs(f - pf) < (0.075 + 0.05 * g):
                    return pc
            return None
        return fn

    if nombre == 'manchas':
        n = rnd.randint(4, 9)
        pts = [(rnd.uniform(0.12, 0.92), rnd.uniform(0.10, 0.80),
                rnd.uniform(0.08, 0.18), rnd.uniform(0.12, 0.30)) for _ in range(n)]
        def fn(x, y, t, f):
            for pt, pf, rt, rf in pts:
                d = ((t - pt) / rt) ** 2 + ((f - pf) / rf) ** 2
                if d < 1.0:
                    return pc
            return None
        return fn

    if nombre == 'moteado':
        sal = rnd.random() * 1000
        def fn(x, y, t, f):
            v = math.sin(x * 2.13 + sal) * math.cos(y * 1.71 - sal) + \
                math.sin((x + y) * 0.97 + sal * .3)
            return pc if v > 0.95 else None
        return fn

    if nombre == 'red':
        n = rnd.randint(3, 5)
        def fn(x, y, t, f):
            if (t * n * 2) % 1.0 < 0.18 or (f * n) % 1.0 < 0.16:
                return pc
            return None
        return fn

    if nombre == 'mosaico':
        p = rnd.choice([2, 3])
        return lambda x, y, t, f: pc if ((x // p) + (y // p)) % 2 == 0 and 0.08 < f < 0.92 else None

    if nombre == 'chevron':
        n = rnd.randint(3, 6)
        def fn(x, y, t, f):
            u = (t * n + abs(f - 0.45) * 1.6) % 1.0
            return pc if u < 0.22 else None
        return fn

    if nombre == 'vetas':
        n = rnd.randint(4, 8)
        def fn(x, y, t, f):
            if f > 0.55:
                return None
            u = (t * n + math.sin(f * 6.0) * 0.35) % 1.0
            return pc if u < 0.26 else None
        return fn

    if nombre == 'ocelo':
        ot, of = rnd.uniform(0.72, 0.86), rnd.uniform(0.28, 0.45)
        aro = ajusta(pc, dv=2.2, ds=0.5)
        def fn(x, y, t, f):
            d = ((t - ot) * L / 2.6) ** 2 + ((f - of) / 0.16) ** 2
            if d < 0.45:
                return pc
            if d < 1.0:
                return aro
            return None
        return fn

    if nombre == 'bioluz':
        n = rnd.randint(4, 9)
        luz = ajusta(pc, dv=2.6, ds=0.75, v_abs=None)
        fila = rnd.uniform(0.72, 0.90)
        def fn(x, y, t, f):
            if abs(f - fila) > 0.10:
                return None
            return luz if int(t * n * 2) % 2 == 0 else None
        return fn

    if nombre == 'franja_dorsal':
        return lambda x, y, t, f: pc if f < 0.20 else None

    if nombre == 'vientre_claro':
        cl = ajusta(pal['vientre'], dv=1.12)
        return lambda x, y, t, f: cl if f > 0.78 else None

    if nombre == 'diamante':
        n = rnd.randint(3, 5)
        def fn(x, y, t, f):
            u = (t * n) % 1.0 - 0.5
            v = (f * 2.4) % 1.0 - 0.5
            return pc if abs(u) + abs(v) < 0.32 else None
        return fn

    return lambda x, y, t, f: None


# ===========================================================================
# EL PEZ ESTANDAR (arquetipos con perfil)
# ===========================================================================

def _pinta_estandar(esp):
    arq = esp['_arq']
    rnd = esp['_rnd']
    pal = esp['pal']
    L = esp['_L']
    Hb = esp['_H']

    f_lomo = perfil(arq['lomo'])
    f_vien = perfil(arq['vientre'])
    ond = arq.get('ondula', 0.0)
    fase = rnd.uniform(0, 6.28)

    def centro(t):
        if not ond:
            return CY
        return CY + math.sin(t * math.pi * 1.6 + fase) * ond * Hb * 0.42

    # --- cuerpo ---------------------------------------------------------
    cuerpo = Mascara(W, H)
    topo = {}
    x0 = CX
    for i in range(L):
        t = i / float(L - 1)
        x = x0 + i
        cy = centro(t)
        yt = cy - f_lomo(t) * Hb
        yb = cy + f_vien(t) * Hb
        if yb - yt < 0.8:
            yb = yt + 0.8
        a, b = int(round(yt)), int(round(yb))
        if b < a:
            b = a
        cuerpo.columna(x, a, b)
        topo[x] = (a, b)

    # pico / morro alargado
    if arq.get('pico'):
        pl = int(round(L * arq['pico']))
        cy = int(round(centro(0)))
        for i in range(1, pl + 1):
            xx = x0 - i
            gr = 0 if i > pl * 0.55 else (1 if i > pl * 0.25 else 1)
            cuerpo.columna(xx, cy - gr, cy)
            topo[xx] = (cy - gr, cy)
        x0 = x0 - pl

    # --- aletas ----------------------------------------------------------
    def _t_de(x):
        return min(1.0, max(0.0, (x - CX) / float(max(1, L - 1))))

    def base_lomo(x):
        t = _t_de(x)
        return centro(t) - f_lomo(t) * Hb + 1

    def base_vientre(x):
        t = _t_de(x)
        return centro(t) + f_vien(t) * Hb - 1

    def base_flanco(x):
        t = _t_de(x)
        return centro(t) + f_vien(t) * Hb * 0.30

    aletas = Mascara(W, H)
    for sitio, tipo, t0, t1, alto in arq.get('aletas', []):
        if sitio == 'pectoral':
            continue
        ax0 = CX + t0 * (L - 1)
        ax1 = CX + t1 * (L - 1)
        arriba = sitio in ('dorsal', 'adiposa')
        base = base_lomo if arriba else (centro if sitio == 'quilla' else base_vientre)
        if sitio == 'quilla':
            base = lambda x: centro(_t_de(x))
        _aleta(aletas, tipo, ax0, ax1, base, alto * Hb, arriba)

    # Las pectorales van APARTE porque se pintan por encima del cuerpo: son las
    # del lado de aca, y un pez con la pectoral detras del cuerpo parece plano.
    aletas_pect = Mascara(W, H)
    for sitio, tipo, t0, t1, alto in arq.get('aletas', []):
        if sitio != 'pectoral':
            continue
        _aleta(aletas_pect, tipo, CX + t0 * (L - 1), CX + t1 * (L - 1),
               base_flanco, alto * Hb, False)

    # --- cola -------------------------------------------------------------
    cola = Mascara(W, H)
    tipo_c, cl, ca = arq['cola']
    bx = CX + L - 1
    _cola(cola, tipo_c, bx, centro(1.0), cl * L * 0.55, ca * Hb * 0.55)

    # --- martillo / barbas / espinas ---------------------------------------
    extra = Mascara(W, H)
    if arq.get('martillo'):
        # El martillo es MAS ALTO que el cuerpo y sobresale por los dos lados:
        # si solo se ensancha hasta el borde del lomo, un martillo y un tiburon
        # normal salen iguales.
        cy = int(round(centro(0)))
        ala = max(3, int(Hb * .85))
        extra.rect(x0 - 3, cy - ala, x0 + 1, cy + ala)
        extra.set(x0 - 4, cy - ala + 1)
        extra.set(x0 - 4, cy + ala - 1)
    if arq.get('cana'):
        cy = int(round(centro(0) - f_lomo(0.12) * Hb))
        extra.linea(CX + L * .16, cy, CX + L * .04, cy - Hb * .95)
        extra.disco(CX + L * .02, cy - Hb * 1.05, 1.2)

    total = Mascara(W, H)
    total.unir(cola).unir(aletas).unir(cuerpo).unir(aletas_pect).unir(extra)
    total.limpiar_sueltos()

    # --- pintar ------------------------------------------------------------
    li = Lienzo(W, H)
    c_aleta = pal['aleta']
    r_aleta = A.rampa(c_aleta, 5)
    cbx, cby = CX + L - 1, centro(1.0)
    for x, y in Mascara(W, H).unir(cola).unir(aletas).unir(extra).puntos():
        if cuerpo.get(x, y):
            continue
        d = (y - CY) / float(max(1, Hb))
        c = r_aleta[min(4, max(0, int(2 + d * 2.2)))]
        # Radios. Una aleta es una membrana tensada entre varillas, y sin ellas
        # se lee como un trozo de plastico: en la cola salen en abanico desde
        # el pedunculo, en la dorsal y la anal van rectas de arriba abajo.
        if cola.get(x, y):
            ang = math.atan2(y - cby, max(0.6, x - cbx + 1.0))
            if int((ang + 3.3) * 3.4) % 2 == 0:
                c = ajusta(c, dv=0.86, ds=1.05)
        elif x % 3 == 0:
            c = ajusta(c, dv=0.88, ds=1.05)
        li.set(x, y, c)

    patron_fn = _patron(esp.get('patron', 'liso'), esp, rnd)
    lomo, vientre = pal['lomo'], pal['vientre']
    escamas = esp.get('escamas', L >= 20)
    for x, y in cuerpo.puntos():
        a, b = topo[x]
        f = (y - a) / float(max(1, b - a))
        t = (x - CX) / float(max(1, L - 1))
        t = min(1.0, max(0.0, t))
        # contrasombreado: el lomo oscuro no se funde poco a poco con el
        # vientre, cambia deprisa en el tercio de arriba (es como se ve en un
        # pez de verdad y es lo que le da volumen a 20 px)
        k = 1.0 / (1.0 + math.exp((f - 0.44) * 7.0))
        c = mezcla(vientre, lomo, k)
        p = patron_fn(x, y, t, f)
        if p is not None:
            c = mezcla(c, p, 0.82)
        if escamas and 0.14 < f < 0.86 and t > 0.24:
            # Escamas de verdad: filas desplazadas media escama, un solo pixel
            # por escama. Un damero 2x2 se lee como cuadricula de fondo, no
            # como piel — se probo y parecia el png roto.
            fila = (y - a) // 3
            if (y - a) % 3 == 0 and (x + fila * 2) % 4 == 0:
                c = ajusta(c, dv=0.93, ds=1.05)
        if f < 0.10:                              # filo del lomo
            c = ajusta(c, dv=0.86)
        elif f > 0.93:                            # filo del vientre
            c = ajusta(c, dv=0.90)
        if t < 0.30 and 0.18 < f < 0.50:          # destello de la mejilla
            c = mezcla(c, ajusta(c, dv=1.35, ds=0.7), 0.45)
        if t > 0.86:
            c = ajusta(c, dv=0.92)
        li.set(x, y, c)

    # aletas pectorales POR ENCIMA del cuerpo (son las del lado de aca)
    c_pec = ajusta(c_aleta, dv=0.86, ds=1.05)
    for x, y in aletas_pect.puntos():
        if li.get(x, y)[3]:
            li.set(x, y, mezcla(li.get(x, y), c_pec, 0.72))
        else:
            li.set(x, y, c_pec)

    # --- linea de las agallas ----------------------------------------------
    if L >= 10:
        gx = CX + int(L * (0.30 if L > 20 else 0.34))
        if arq.get('pico'):
            gx = CX + int(L * 0.34)
        if gx in topo:
            a, b = topo[gx]
            for y in range(a + 1, b):
                c = li.get(gx, y)
                if c[3]:
                    li.set(gx, y, ajusta(c, dv=0.80, ds=1.08))
            if gx - 1 in topo:
                a2, b2 = topo[gx - 1]
                c = li.get(gx - 1, a2 + max(1, (b2 - a2) // 3))
                if c[3]:
                    li.set(gx - 1, a2 + max(1, (b2 - a2) // 3), ajusta(c, dv=0.88))

    # --- barbas -------------------------------------------------------------
    barbas = Mascara(W, H)
    if arq.get('barbas'):
        cy = centro(0.04)
        bxx = x0 + 1
        n = arq['barbas']
        for i in range(n):
            s = 1 if i % 2 == 0 else -1
            lg = 2 + (i // 2)
            barbas.linea(bxx, cy + s * (0.5 + i * 0.6), bxx - lg, cy + s * (1.6 + i * 0.9))
        col = ajusta(pal['lomo'], dv=0.9)
        for x, y in barbas.puntos():
            if not li.get(x, y)[3]:
                li.set(x, y, col)
        total.unir(barbas)

    # --- espinas del pez globo ----------------------------------------------
    if arq.get('espinas'):
        col = ajusta(pal['patron'], dv=1.25, ds=0.9)
        ccx = CX + L * 0.48
        pi = 0
        for x, y in cuerpo.borde_interno(True).puntos():
            pi += 1
            if pi % 3:
                continue
            # Hacia AFUERA de verdad: la direccion se saca del centro del
            # cuerpo, no de en que mitad cae el pixel. Con la mitad, las
            # espinas del lomo salian de canto y no se veian.
            vx, vy = x - ccx, (y - CY) * 1.35
            n = math.hypot(vx, vy) or 1.0
            vx, vy = vx / n, vy / n
            for k in (1, 2):
                px, py = int(round(x + vx * k)), int(round(y + vy * k))
                if not cuerpo.get(px, py):
                    li.set(px, py, col if k == 1 else ajusta(col, dv=0.85))
                    total.set(px, py)

    esp['_topo'] = topo
    esp['_cuerpo'] = cuerpo
    esp['_x0'] = x0
    esp['_centro'] = centro
    esp['_f_lomo'] = f_lomo
    esp['_f_vien'] = f_vien
    return li, total, cuerpo


def _cara(li, esp, total, cuerpo):
    """Ojo, boca y dientes. Se hace al final para que nada los tape."""
    arq = esp['_arq']
    L, Hb = esp['_L'], esp['_H']
    topo = esp['_topo']
    centro = esp['_centro']
    pal = esp['pal']
    rnd = esp['_rnd']

    t_ojo = arq.get('t_ojo', 0.14 if not arq.get('pico') else 0.42)
    if arq.get('martillo'):
        t_ojo = 0.05
    # El ojo se mide desde CX (donde empieza el CUERPO), no desde x0 (donde
    # empieza el pico): a un pez espada el ojo le va detras del pico.
    ex = CX + max(1, int(round(L * t_ojo)))
    if ex not in topo:
        ex = min(topo.keys()) + 1
    a, b = topo[ex]
    alt = b - a
    ey = a + max(1, int(round(alt * 0.36)))

    grande = alt >= 7
    ojo_blanco = esp.get('ojo_blanco', (255, 255, 255))
    ojo_iris = esp.get('ojo_iris', None)
    pupila = esp.get('ojo_pupila', (18, 16, 20))

    if arq.get('martillo'):
        # Los ojos de un martillo estan en las PUNTAS del martillo. Es lo unico
        # que lo distingue de un tiburon a 30 px, asi que van ahi y no en la
        # cara.
        cy = int(round(centro(0)))
        ala = max(3, int(esp['_H'] * .85))
        px = esp['_x0'] - 2
        for s in (-1, 1):
            li.encima(px, cy + s * (ala - 1), pupila)
            li.encima(px + 1, cy + s * (ala - 1), ojo_blanco)
        for i in range(-1, 2):
            li.encima(esp['_x0'] - 3, cy + i, A.contorno_de(pal['lomo']))
        return li

    esp['_ojo'] = (ex, ey, alt)
    if esp.get('ojo_ciego'):
        # Los peces de cueva no tienen ojo: tienen la PIEL pasandole por encima.
        # Un punto negro los delataria como peces normales pintados de blanco.
        piel = ajusta(pal['vientre'], dv=0.90, ds=1.15)
        for dx in range(-1, 2):
            for dy in range(0, 2):
                li.encima(ex + dx, ey + dy, piel)
        li.encima(ex, ey, ajusta(piel, dv=0.88))
        esp.pop('_ojo')
        alt = 0
    elif alt <= 4:
        li.set(ex, ey, pupila)
    elif not grande:
        li.set(ex, ey, pupila)
        li.set(ex + 1, ey, pupila)
        li.set(ex, ey + 1, ojo_iris or ajusta(pal['vientre'], dv=1.05))
        li.set(ex + 1, ey + 1, pupila)
        li.set(ex, ey - 1, ojo_blanco)
    else:
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                li.set(ex + dx, ey + dy, ojo_iris or ajusta(pal['vientre'], dv=0.95, ds=1.2))
        li.set(ex, ey, pupila)
        li.set(ex + 1, ey, pupila)
        li.set(ex, ey + 1, pupila)
        li.set(ex + 1, ey + 1, pupila)
        li.set(ex - 1, ey - 1, ojo_blanco)
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                if abs(dx) + abs(dy) == 3:
                    c = li.get(ex + dx, ey + dy)
                    if c[3]:
                        li.set(ex + dx, ey + dy, ajusta(c, dv=0.82))

    # boca
    bx = min(topo.keys())
    ba, bb = topo[bx]
    boca = esp.get('boca', 'normal')
    col = A.contorno_de(pal['lomo'])
    if boca != 'ninguna' and (bb - ba) >= 2:
        by = ba + int(round((bb - ba) * (0.62 if boca != 'arriba' else 0.30)))
        li.encima(bx, by, col)
        if boca in ('grande', 'dientes'):
            li.encima(bx + 1, by, col)
            li.encima(bx + 1, by - 1, col)
        if boca == 'dientes' or arq.get('dientes'):
            d = (240, 236, 226)
            li.encima(bx + 1, by - 1, d)
            li.encima(bx + 2, by, d)
            li.encima(bx + 1, by + 1, d)
    return li


def _mordida(mascara, li, rnd, cuantas=3):
    """Muerde el borde de las aletas: es lo que se le rompe primero a un pez."""
    borde = mascara.borde_interno(True)
    pts = list(borde.puntos())
    if not pts:
        return
    rnd.shuffle(pts)
    for x, y in pts[:cuantas]:
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                if rnd.random() < 0.55:
                    li.set(x + dx, y + dy, A.TRANSP)


# ===========================================================================
# PINTORES ESPECIALES (lo que no es un pez con perfil)
# ===========================================================================

def _pinta_cangrejo(esp):
    """
    Visto DESDE ARRIBA y mirando al frente, que es como se dibuja un cangrejo
    en un inventario. De perfil no se le ven las pinzas y parece una piedra.

    Las tres cosas que hay que acertar para que se lea como cangrejo y no como
    arana: el caparazon mas ANCHO que alto, las pinzas por DELANTE y levantadas
    (no a los lados), y las patas dobladas hacia atras en dos tramos.
    """
    pal, rnd = esp['pal'], esp['_rnd']
    L = esp['_L']
    an = max(10, int(L * 0.86))
    al = max(7, int(an * 0.66))
    cx, cy = CX + an // 2 + 3, CY + 1

    cuerpo = Mascara(W, H)
    for x in range(int(cx - an / 2.0), int(cx + an / 2.0) + 1):
        u = (x - cx) / (an / 2.0)
        if abs(u) > 1:
            continue
        h = math.sqrt(max(0.0, 1 - u * u))
        cuerpo.columna(x, cy - al * 0.44 * (0.55 + 0.45 * h), cy + al * 0.52 * h)

    patas = Mascara(W, H)
    n = esp.get('patas', 3)
    for i in range(n):
        t = (i + 0.6) / (n + 0.5)
        for s in (-1, 1):
            bx = cx + s * an * (0.30 + 0.16 * t)
            by = cy - al * 0.10 + al * 0.70 * t
            mx = bx + s * (2.5 + t * 1.5)
            my = by + 1 + t
            patas.linea(bx, by, mx, my)
            patas.linea(mx, my, mx + s * (1.5 - t), my + 2.2 + t)

    pinzas = Mascara(W, H)
    for s in (-1, 1):
        bx = cx + s * an * 0.34
        by = cy - al * 0.30
        pinzas.linea(bx, by, bx + s * 2, by - 2.2, 1)          # brazo
        px, py = bx + s * 3.4, by - 4.2
        pinzas.elipse(px, py, 2.3, 2.0)                        # mano
        pinzas.poligono([(px + s * 0.5, py - 1.6), (px + s * 3.2, py - 2.6),
                         (px + s * 1.4, py - 0.2)])            # dedo movil
        pinzas.set(int(px + s * 1.6), int(py - 1.4), 0)        # la hendidura

    total = Mascara(W, H).unir(patas).unir(pinzas).unir(cuerpo)
    li = Lienzo(W, H)
    r = A.rampa(pal['lomo'], 5)
    for x, y in patas.puntos():
        li.set(x, y, r[3])
    for x, y in pinzas.puntos():
        li.set(x, y, r[2])
    for x, y in pinzas.borde_interno(True).puntos():
        li.set(x, y, r[3])
    for x, y in cuerpo.puntos():
        f = (y - (cy - al * 0.5)) / float(al)
        u = abs(x - cx) / (an / 2.0)
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, f * 0.85 + 0.20)))
        if u > 0.55:
            c = ajusta(c, dv=0.92)
        if x < cx and f < 0.45:
            c = ajusta(c, dv=1.10)
        li.set(x, y, c)
    # el surco del caparazon y los ojos
    surco = ajusta(pal['lomo'], dv=0.80)
    for x in range(int(cx - an * 0.22), int(cx + an * 0.22) + 1):
        li.encima(x, int(cy + al * 0.06), surco)
    for s in (-1, 1):
        ox = int(cx + s * an * 0.17)
        oy = int(cy - al * 0.34)
        li.encima(ox, oy + 1, r[3])
        li.set(ox, oy, (20, 18, 22))
        total.set(ox, oy)
    return li, total, cuerpo


def _esqueleto_gamba(L, curva=0.62):
    """
    La coma que forma el cuerpo de una gamba: cabeza arriba a la izquierda,
    el abdomen curvandose hacia abajo y a la derecha. Devuelve la lista de
    (x, y, radio) de los segmentos, del morro a la cola.
    """
    pts = []
    n = 7
    for i in range(n + 1):
        t = i / float(n)
        ang = math.pi * (1.02 - curva * t)
        rr = L * 0.40
        px = CX + L * 0.52 + math.cos(ang) * rr
        py = CY - L * 0.26 + math.sin(ang) * rr * 0.96
        gr = L * (0.20 - 0.115 * t)
        pts.append((px, py, max(1.1, gr)))
    return pts


def _pinta_gamba(esp):
    """
    Gamba de perfil. Lo que la hace legible a 20 px son los SEGMENTOS: el
    abdomen de un crustaceo son anillos que se montan unos sobre otros, y sin
    la linea entre anillo y anillo queda un platano.
    """
    pal = esp['pal']
    L = esp['_L']
    pts = _esqueleto_gamba(L)
    cuerpo = Mascara(W, H)
    for px, py, gr in pts:
        cuerpo.disco(px, py, gr)

    # abanico de la cola
    tx, ty, tg = pts[-1]
    cola = Mascara(W, H)
    cola.poligono([(tx, ty - tg), (tx + L * .20, ty - tg - L * .10),
                   (tx + L * .24, ty + tg + L * .06), (tx, ty + tg)])
    cola.poligono([(tx, ty), (tx + L * .22, ty + tg + L * .12), (tx, ty + tg)])

    fino = Mascara(W, H)
    hx, hy, hg = pts[0]
    fino.linea(hx - hg * .3, hy - hg, hx - L * .26, hy - L * .30)       # rostro
    fino.linea(hx, hy - hg * .4, hx - L * .30, hy - L * .12)            # antena 1
    fino.linea(hx, hy + hg * .2, hx - L * .24, hy + L * .12)            # antena 2
    for i in range(1, 5):
        bx, by, bg = pts[i]
        fino.linea(bx, by + bg * .7, bx - 1.2, by + bg + 1.8)

    total = Mascara(W, H).unir(fino).unir(cola).unir(cuerpo)
    li = Lienzo(W, H)
    r = A.rampa(pal['lomo'], 5)
    for x, y in fino.puntos():
        li.set(x, y, r[3])
    for x, y in cola.puntos():
        li.set(x, y, pal['aleta'])
    for x, y in cola.borde_interno(False).puntos():
        li.set(x, y, ajusta(pal['aleta'], dv=0.84))
    for i, (px, py, gr) in enumerate(pts):
        seg = Mascara(W, H).disco(px, py, gr)
        for x, y in seg.puntos():
            f = (y - (py - gr)) / float(max(1.0, gr * 2))
            c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, f * 0.9 + 0.15)))
            if x < px and y < py:
                c = ajusta(c, dv=1.10)
            li.set(x, y, c)
        if i:                                   # el filo del anillo anterior
            for x, y in seg.borde_interno(False).puntos():
                if x < px:
                    c = li.get(x, y)
                    if c[3]:
                        li.set(x, y, ajusta(c, dv=0.80, ds=1.08))
    li.set(int(hx - hg * .5), int(hy - hg * .3), (22, 18, 20))
    return li, total, cuerpo


def _pinta_langosta(esp):
    """La gamba con dos pinzas grandes por delante — y por eso vale la pena
    compartir el esqueleto: una langosta ES una gamba con pinzas."""
    li, total, cuerpo = _pinta_gamba(esp)
    pal = esp['pal']
    L = esp['_L']
    pts = _esqueleto_gamba(L)
    hx, hy, hg = pts[0]
    pinzas = Mascara(W, H)
    for s in (-1, 1):
        # Hacia DELANTE y bien separadas: pegadas al cuerpo, las dos pinzas y
        # las antenas se juntaban en un borron a la altura de la cabeza.
        by = hy + s * L * .17
        pinzas.linea(hx - hg * .4, hy + s * hg * .3, hx - L * .16, by, 2)
        px, py = hx - L * .30, by + s * L * .02
        pinzas.elipse(px, py, L * .15, L * .10)
        pinzas.poligono([(px - L * .10, py - s * L * .07), (px - L * .30, py - s * L * .10),
                         (px - L * .06, py + s * L * .01)])
        pinzas.set(int(px - L * .13), int(py - s * L * .05), 0)
    r = A.rampa(pal['lomo'], 5)
    for x, y in pinzas.puntos():
        li.set(x, y, r[2])
    for x, y in pinzas.borde_interno(True).puntos():
        li.set(x, y, r[3])
    total.unir(pinzas)
    return li, total, cuerpo


def _pinta_pulpo(esp):
    pal, rnd = esp['pal'], esp['_rnd']
    L = esp['_L']
    rx = L * 0.42
    ry = L * 0.40
    cx, cy = CX + rx, CY - ry * 0.5
    cabeza = Mascara(W, H)
    cabeza.elipse(cx, cy, rx, ry)
    brazos = Mascara(W, H)
    n = esp.get('brazos', 6)
    for i in range(n):
        t = (i + 0.5) / n
        bx = cx - rx * 0.85 + rx * 1.7 * t
        by = cy + ry * 0.72
        curva = (t - 0.5) * 2.0
        px, py = bx, by
        for j in range(int(L * 0.55)):
            px += curva * 0.55 + math.sin(j * 0.8 + i) * 0.35
            py += 0.85
            brazos.disco(px, py, 1.2 - 0.7 * j / float(max(1, int(L * 0.55))))
    total = Mascara(W, H).unir(brazos).unir(cabeza)
    li = Lienzo(W, H)
    r = A.rampa(pal['lomo'], 5)
    for x, y in brazos.puntos():
        f = (y - cy) / float(max(1, L * 0.8))
        li.set(x, y, r[min(4, 1 + int(f * 3.4))])
    for x, y in cabeza.puntos():
        fy = (y - (cy - ry)) / float(ry * 2)
        fx = (x - (cx - rx)) / float(rx * 2)
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fy * 0.85 + 0.2)))
        if fx < 0.42 and fy < 0.40:
            c = ajusta(c, dv=1.18, ds=0.85)
        li.set(x, y, c)
    # ventosas
    vc = ajusta(pal['vientre'], dv=1.05)
    for i in range(n):
        t = (i + 0.5) / n
        bx = cx - rx * 0.7 + rx * 1.4 * t
        for j in range(2):
            li.encima(int(bx), int(cy + ry * 0.9 + j * 3), vc)
    for s in (-1, 1):
        ox = int(cx + s * rx * 0.42)
        oy = int(cy + ry * 0.15)
        li.set(ox, oy, (18, 16, 20))
        li.set(ox, oy - 1, ajusta(pal['vientre'], dv=1.2))
    return li, total, cabeza


def _pinta_calamar(esp):
    pal = esp['pal']
    L = esp['_L']
    rx, ry = L * 0.28, L * 0.42
    cx, cy = CX + rx + 3, CY - ry * 0.30
    manto = Mascara(W, H)
    manto.elipse(cx, cy, rx, ry)
    manto.poligono([(cx - rx, cy - ry * 0.55), (cx, cy - ry * 1.25), (cx + rx, cy - ry * 0.55)])
    # Las aletas del calamar son dos triangulos ANCHOS a los lados de la punta.
    # Estrechos y verticales parecian orejas de conejo.
    aletas = Mascara(W, H)
    for s in (-1, 1):
        aletas.poligono([(cx + s * rx * .90, cy - ry * .30),
                         (cx + s * (rx + L * .24), cy - ry * .92),
                         (cx + s * rx * .55, cy - ry * 1.12)])
    brazos = Mascara(W, H)
    for i in range(6):
        t = (i + 0.5) / 6.0
        bx = cx - rx * 0.9 + rx * 1.8 * t
        largo = L * (0.30 + 0.22 * abs(t - 0.5) * 2)
        brazos.linea(bx, cy + ry * 0.85, bx + (t - 0.5) * 5, cy + ry * 0.85 + largo)
    total = Mascara(W, H).unir(brazos).unir(aletas).unir(manto)
    li = Lienzo(W, H)
    r = A.rampa(pal['lomo'], 5)
    for x, y in brazos.puntos():
        li.set(x, y, r[3])
    for x, y in aletas.puntos():
        li.set(x, y, pal['aleta'])
    for x, y in manto.puntos():
        fx = (x - (cx - rx)) / float(rx * 2)
        c = mezcla(pal['lomo'], pal['vientre'], min(1.0, max(0.0, 1.0 - abs(fx - 0.38) * 1.8)))
        li.set(x, y, c)
    for s in (-1, 1):
        li.set(int(cx + s * rx * 0.55), int(cy + ry * 0.62), (18, 16, 20))
    return li, total, manto


def _pinta_medusa(esp):
    pal = esp['pal']
    L = esp['_L']
    rx, ry = L * 0.46, L * 0.34
    cx, cy = CX + rx, CY - ry
    campana = Mascara(W, H)
    for x in range(int(cx - rx), int(cx + rx) + 1):
        dx = (x - cx) / rx
        if abs(dx) > 1:
            continue
        h = math.sqrt(max(0.0, 1 - dx * dx)) * ry
        campana.columna(x, cy - h, cy + h * 0.28)
    tent = Mascara(W, H)
    n = 5
    for i in range(n):
        t = (i + 0.5) / n
        bx = cx - rx * 0.85 + rx * 1.7 * t
        px, py = bx, cy + ry * 0.28
        for j in range(int(L * 0.7)):
            px += math.sin(j * 0.55 + i * 1.4) * 0.5
            py += 0.9
            tent.set(int(round(px)), int(round(py)))
    total = Mascara(W, H).unir(tent).unir(campana)
    li = Lienzo(W, H)
    for x, y in tent.puntos():
        li.set(x, y, mezcla(pal['aleta'], pal['vientre'], 0.4))
    for x, y in campana.puntos():
        fy = (y - (cy - ry)) / float(ry * 1.3)
        fx = (x - (cx - rx)) / float(rx * 2)
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fy * 0.7)))
        if fx < 0.45 and fy < 0.45:
            c = ajusta(c, dv=1.15, ds=0.8)
        li.set(x, y, c)
    arco = ajusta(pal['patron'], dv=1.4)
    for i in range(3):
        xx = int(cx - rx * 0.5 + rx * 0.5 * i)
        li.encima(xx, int(cy + ry * 0.05), arco)
    return li, total, campana


def _pinta_concha(esp):
    pal = esp['pal']
    L = esp['_L']
    rx, ry = L * 0.5, L * 0.42
    cx, cy = CX + rx, CY
    m = Mascara(W, H)
    m.poligono([(cx - rx, cy + ry * .55), (cx - rx * .75, cy - ry * .35),
                (cx, cy - ry), (cx + rx * .75, cy - ry * .35),
                (cx + rx, cy + ry * .55), (cx, cy + ry * .85)])
    li = Lienzo(W, H)
    for x, y in m.puntos():
        fy = (y - (cy - ry)) / float(ry * 1.85)
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fy)))
        li.set(x, y, c)
    # nervaduras en abanico
    rib = ajusta(pal['lomo'], dv=0.86)
    for i in range(-3, 4):
        ang = math.pi / 2 + i * 0.28
        for j in range(int(ry * 1.7)):
            px = cx + math.cos(ang) * j * 0.62
            py = cy - ry * .8 + math.sin(ang) * j * 0.62
            li.encima(int(round(px)), int(round(py)), rib)
    return li, m, m


def _pinta_caracola(esp):
    """
    Una espiral de verdad no se lee a 20 px: sale una mancha con un agujero.
    Lo que se lee es la construccion clasica de la caracola en pixel art —
    UNA vuelta grande (el cuerpo), una TORRE de vueltas cada vez menores arriba
    a la derecha, y la BOCA abierta abajo a la izquierda, en color claro. La
    espiral aparece sola en la union de las vueltas.
    """
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.42, CY + L * 0.12

    cuerpo = Mascara(W, H)
    cuerpo.elipse(cx, cy, L * 0.40, L * 0.34)
    torre = []
    px, py, rr = cx + L * 0.12, cy - L * 0.26, L * 0.24
    for i in range(4):
        cuerpo.elipse(px, py, rr, rr * 0.86)
        torre.append((px, py, rr))
        px += rr * 0.62
        py -= rr * 0.80
        rr *= 0.62
    # la punta afilada
    cuerpo.poligono([(px - rr, py), (px + rr * 2.0, py - rr * 2.2), (px + rr, py + rr)])

    boca = Mascara(W, H)
    boca.elipse(cx - L * 0.20, cy + L * 0.10, L * 0.17, L * 0.22)
    boca.intersecar(cuerpo)

    li = Lienzo(W, H)
    caja = cuerpo.caja()
    for x, y in cuerpo.puntos():
        fy = (y - caja[1]) / float(max(1, caja[3] - caja[1]))
        fx = (x - caja[0]) / float(max(1, caja[2] - caja[0]))
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fy * 0.75 + 0.15)))
        if fx < 0.42 and fy < 0.45:
            c = ajusta(c, dv=1.12)
        li.set(x, y, c)
    # el escalon entre vuelta y vuelta
    for pxx, pyy, rrr in torre:
        anillo = Mascara(W, H).elipse(pxx, pyy, rrr, rrr * 0.86).borde_interno(True)
        for x, y in anillo.puntos():
            c = li.get(x, y)
            if c[3] and y > pyy - rrr * 0.2:
                li.set(x, y, ajusta(c, dv=0.82, ds=1.1))
    # nervios radiales
    rib = ajusta(pal['patron'], dv=1.35)
    for k in range(6):
        ang = math.pi * (0.15 + 0.62 * k / 5.0)
        for j in range(2, int(L * 0.40)):
            li.encima(int(round(cx + math.cos(ang) * j * 1.05)),
                      int(round(cy + math.sin(ang) * j * 0.9)), rib if j % 2 == 0 else None)
    # la boca, en claro y con el labio marcado
    cboca = ajusta(pal['vientre'], dv=1.10, ds=0.6)
    for x, y in boca.puntos():
        li.set(x, y, cboca)
    for x, y in boca.borde_interno(True).puntos():
        li.set(x, y, ajusta(cboca, dv=0.80))
    return li, cuerpo, cuerpo


def _pinta_estrella(esp):
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.5, CY
    R = L * 0.5
    brazos = esp.get('brazos', 5)
    pts = []
    for i in range(brazos * 2):
        ang = -math.pi / 2 + i * math.pi / brazos
        r = R if i % 2 == 0 else R * 0.42
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    m = Mascara(W, H).poligono(pts)
    li = Lienzo(W, H)
    for x, y in m.puntos():
        d = math.hypot(x - cx, y - cy) / R
        c = mezcla(pal['lomo'], pal['vientre'], min(1.0, max(0.0, 1.0 - d)))
        if x < cx and y < cy:
            c = ajusta(c, dv=1.08)
        li.set(x, y, c)
    pun = ajusta(pal['patron'], dv=1.3)
    for i in range(brazos):
        ang = -math.pi / 2 + i * 2 * math.pi / brazos
        for j in range(2, int(R)):
            if j % 2 == 0:
                li.encima(int(round(cx + math.cos(ang) * j)), int(round(cy + math.sin(ang) * j)), pun)
    return li, m, m


def _pinta_erizo(esp):
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.5, CY
    r = L * 0.32
    cuerpo = Mascara(W, H).disco(cx, cy, r)
    puas = Mascara(W, H)
    n = 14
    for i in range(n):
        ang = i * 2 * math.pi / n
        lg = r * (1.5 + 0.35 * ((i % 3) - 1))
        puas.linea(cx + math.cos(ang) * r * .8, cy + math.sin(ang) * r * .8,
                   cx + math.cos(ang) * lg, cy + math.sin(ang) * lg)
    total = Mascara(W, H).unir(puas).unir(cuerpo)
    li = Lienzo(W, H)
    for x, y in puas.puntos():
        li.set(x, y, pal['lomo'])
    for x, y in cuerpo.puntos():
        d = math.hypot(x - cx + r * .3, y - cy + r * .3) / (r * 1.6)
        li.set(x, y, mezcla(pal['vientre'], pal['lomo'], min(1.0, d)))
    return li, total, cuerpo


def _pinta_pepino(esp):
    """Salchicha con las puntas redondeadas y papilas arriba. Sin el
    redondeo de las puntas queda un ladrillo."""
    pal = esp['pal']
    L = esp['_L']
    f_alto = perfil([(0, .06), (.14, .30), (.50, .34), (.86, .28), (1, .06)])
    m = Mascara(W, H)
    topo = {}
    for i in range(L):
        t = i / float(L - 1)
        h = f_alto(t) * L
        a, b = CY - h, CY + h * 0.86
        m.columna(CX + i, a, b)
        topo[CX + i] = (a, b)
    li = Lienzo(W, H)
    for x, y in m.puntos():
        a, b = topo[x]
        f = (y - a) / float(max(1.0, b - a))
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, 1.15 - f * 1.25)))
        li.set(x, y, c)
    pap = ajusta(pal['patron'], dv=1.9, ds=0.85)
    som = ajusta(pal['lomo'], dv=0.72)
    for i in range(2, L - 1, 3):
        x = CX + i
        a, b = topo[x]
        li.set(x, int(a) - 1, pap)
        m.set(x, int(a) - 1)
        li.encima(x + 1, int(a), som)
    return li, m, m


def _pinta_caballito(esp):
    """
    El caballito no es una S con cabeza: tiene cuatro tramos que hay que poner
    en su sitio o no se reconoce — MORRO tubular hacia delante, CUELLO doblado,
    PECHO abultado y COLA enroscada hacia delante. La espina se escribe como
    puntos (x, y, grosor) en fraccion del alto total y de ahi sale todo.
    """
    pal = esp['pal']
    Aa = float(esp['_L'])                     # aqui `largo` es el ALTO
    bx, by = CX + 2, CY - Aa * 0.5

    def P(fx, fy):
        return (bx + fx * Aa, by + fy * Aa)

    espina = [(.46, .12, .105), (.50, .21, .105), (.50, .30, .125),
              (.46, .39, .135), (.41, .48, .125), (.38, .57, .105),
              (.40, .66, .085), (.46, .73, .070)]
    cuerpo = Mascara(W, H)
    for fx, fy, gr in espina:
        px, py = P(fx, fy)
        cuerpo.disco(px, py, max(1.0, gr * Aa))

    # cola enroscada hacia delante (media vuelta larga, no un garabato)
    tx, ty = P(.46, .73)
    rr = Aa * 0.115
    for i in range(15):
        t = i / 14.0
        ang = -0.5 + t * 4.6
        cuerpo.disco(tx - rr + math.cos(ang) * rr * (1 - t * .25),
                     ty + rr * .85 + math.sin(ang) * rr * (1 - t * .25),
                     max(0.9, Aa * (0.062 - 0.030 * t)))

    # cabeza y morro
    hx, hy = P(.44, .12)
    cuerpo.elipse(hx, hy, Aa * .125, Aa * .105)
    cuerpo.poligono([(hx - Aa * .06, hy - Aa * .02), (hx - Aa * .30, hy + Aa * .045),
                     (hx - Aa * .30, hy + Aa * .105), (hx - Aa * .05, hy + Aa * .085)])

    cresta = Mascara(W, H)
    for i in range(3):
        cresta.linea(hx + Aa * .02 + i * Aa * .055, hy - Aa * .10,
                     hx + Aa * .06 + i * Aa * .06, hy - Aa * .175 - i * Aa * .01)
    aleta = Mascara(W, H)
    ax, ay = P(.53, .42)
    aleta.poligono([(ax, ay - Aa * .10), (ax + Aa * .13, ay), (ax, ay + Aa * .11)])

    total = Mascara(W, H).unir(cresta).unir(aleta).unir(cuerpo)
    li = Lienzo(W, H)
    for x, y in aleta.puntos():
        li.set(x, y, pal['aleta'])
    for x, y in cresta.puntos():
        li.set(x, y, ajusta(pal['lomo'], dv=0.92))
    caja = cuerpo.caja()
    for x, y in cuerpo.puntos():
        fx = (x - caja[0]) / float(max(1, caja[2] - caja[0]))
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fx * 1.15)))
        li.set(x, y, c)
    # los anillos oseos, que es lo que le da la textura de caballito
    an = ajusta(pal['patron'], dv=1.3)
    for i, (fx, fy, gr) in enumerate(espina):
        if i % 2:
            continue
        px, py = P(fx, fy)
        for k in (-1, 0, 1):
            li.encima(int(px + k), int(py - gr * Aa * .55), an)
    li.set(int(hx - Aa * .045), int(hy - Aa * .01), (18, 16, 20))
    return li, total, cuerpo


def _pinta_tortuga(esp):
    """
    De perfil, no desde arriba: desde arriba una tortuga es un ovalo con cuatro
    picos y se confunde con el cangrejo. De perfil se le ve la CUPULA del
    caparazon, que es su forma reconocible, con el plastron plano debajo.
    """
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.48, CY + L * 0.06
    rx, ry = L * 0.40, L * 0.30

    caparazon = Mascara(W, H)
    for x in range(int(cx - rx), int(cx + rx) + 1):
        u = (x - cx) / rx
        if abs(u) > 1:
            continue
        h = math.sqrt(max(0.0, 1 - u * u))
        caparazon.columna(x, cy - ry * h, cy + ry * 0.30 * (0.4 + 0.6 * h))

    piel_m = Mascara(W, H)
    hx, hy = cx - rx * 0.98, cy - ry * 0.05
    piel_m.elipse(hx, hy, L * 0.135, L * 0.105)                    # cabeza
    piel_m.poligono([(hx, hy - L * .07), (hx + L * .16, hy - L * .02),
                     (hx + L * .16, hy + L * .07), (hx, hy + L * .08)])   # cuello
    for i, s in enumerate((0, 1)):                                  # aletas
        px = cx - rx * (0.45 - s * 0.95)
        piel_m.poligono([(px, cy + ry * .22), (px - L * .10 + s * L * .20, cy + ry * .95),
                         (px + L * .12, cy + ry * .62)])
    piel_m.poligono([(cx + rx * .92, cy + ry * .10), (cx + rx * 1.22, cy + ry * .38),
                     (cx + rx * .88, cy + ry * .34)])               # cola
    piel_m.restar(caparazon)

    total = Mascara(W, H).unir(piel_m).unir(caparazon)
    li = Lienzo(W, H)
    piel = mezcla(pal['vientre'], pal['lomo'], 0.40)
    for x, y in piel_m.puntos():
        li.set(x, y, piel)
    for x, y in piel_m.borde_interno(False).puntos():
        li.set(x, y, ajusta(piel, dv=0.86))
    for x, y in caparazon.puntos():
        fy = (y - (cy - ry)) / float(ry * 1.6)
        fx = (x - (cx - rx)) / float(rx * 2)
        c = mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, fy * 0.95 + 0.05)))
        if fx < 0.42 and fy < 0.42:
            c = ajusta(c, dv=1.14)
        li.set(x, y, c)
    # las placas del caparazon: lineas radiales desde el vertice
    pl = ajusta(pal['patron'], dv=1.20)
    for k in (-2, -1, 1, 2):
        ang = math.pi / 2 + k * 0.46
        for j in range(1, int(ry * 1.9)):
            li.encima(int(round(cx + math.cos(ang) * j * 1.20)),
                      int(round(cy - math.sin(ang) * j * 0.92)), pl)
    for x, y in caparazon.borde_interno(False).puntos():
        if y > cy + ry * 0.1:
            c = li.get(x, y)
            if c[3]:
                li.set(x, y, ajusta(c, dv=0.84))
    li.set(int(hx - L * .05), int(hy - L * .03), (18, 16, 20))
    return li, total, caparazon


def _pinta_rana(esp):
    """
    Sentada y de perfil. Lo que dice "rana" y no "mancha verde" son dos cosas:
    el OJO SALTON que sobresale por encima de la linea de la cabeza, y la PATA
    TRASERA doblada en Z (muslo grueso hacia arriba, tibia hacia abajo, pie
    largo por delante). Todo lo demas es un ovalo.
    """
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.50, CY + L * 0.10

    cuerpo = Mascara(W, H).elipse(cx, cy, L * 0.32, L * 0.24)
    cabeza = Mascara(W, H).elipse(cx - L * 0.28, cy - L * 0.08, L * 0.21, L * 0.15)
    ojo_m = Mascara(W, H).disco(cx - L * 0.34, cy - L * 0.19, L * 0.085)

    patas = Mascara(W, H)
    # trasera en Z
    patas.poligono([(cx + L * .02, cy - L * .10), (cx + L * .30, cy - L * .06),
                    (cx + L * .34, cy + L * .14), (cx + L * .06, cy + L * .18)])
    patas.poligono([(cx + L * .26, cy + L * .06), (cx + L * .36, cy + L * .22),
                    (cx + L * .14, cy + L * .24), (cx + L * .16, cy + L * .10)])
    patas.poligono([(cx + L * .20, cy + L * .18), (cx + L * .40, cy + L * .26),
                    (cx + L * .40, cy + L * .32), (cx + L * .12, cy + L * .28)])
    # delantera
    patas.poligono([(cx - L * .24, cy + L * .04), (cx - L * .30, cy + L * .24),
                    (cx - L * .14, cy + L * .26), (cx - L * .12, cy + L * .08)])
    patas.poligono([(cx - L * .34, cy + L * .20), (cx - L * .16, cy + L * .28),
                    (cx - L * .34, cy + L * .28)])

    total = Mascara(W, H).unir(patas).unir(cuerpo).unir(cabeza).unir(ojo_m)
    li = Lienzo(W, H)
    caja = total.caja()

    def piel(x, y, claro=0.0):
        fy = (y - caja[1]) / float(max(1, caja[3] - caja[1]))
        return mezcla(pal['lomo'], pal['vientre'],
                      min(1.0, max(0.0, (fy - 0.28) * 1.5 + claro)))

    for x, y in patas.puntos():
        li.set(x, y, ajusta(piel(x, y), dv=0.92))
    for x, y in Mascara(W, H).unir(cuerpo).unir(cabeza).puntos():
        li.set(x, y, piel(x, y))
    # el pliegue del muslo
    for x, y in Mascara(W, H).poligono([(cx + L * .02, cy - L * .10), (cx + L * .30, cy - L * .06),
                                        (cx + L * .34, cy + L * .14), (cx + L * .06, cy + L * .18)]
                                       ).borde_interno(False).puntos():
        c = li.get(x, y)
        if c[3]:
            li.set(x, y, ajusta(c, dv=0.84))
    # el ojo: iris claro, pupila horizontal y brillo
    iris = ajusta(pal['patron'], dv=1.9, ds=0.75)
    for x, y in ojo_m.puntos():
        li.set(x, y, iris)
    ox, oy = int(cx - L * 0.34), int(cy - L * 0.19)
    li.set(ox, oy, (22, 20, 18))
    li.set(ox + 1, oy, (22, 20, 18))
    li.set(ox - 1, oy - 1, (245, 242, 230))
    # la boca
    li.encima(int(cx - L * 0.46), int(cy - L * 0.02), A.contorno_de(pal['lomo']))
    li.encima(int(cx - L * 0.42), int(cy + L * 0.00), A.contorno_de(pal['lomo']))
    return li, total, cuerpo


def _pinta_renacuajo(esp):
    pal = esp['pal']
    L = esp['_L']
    cx, cy = CX + L * 0.30, CY
    cabeza = Mascara(W, H).elipse(cx, cy, L * 0.30, L * 0.24)
    cola = Mascara(W, H)
    cola.poligono([(cx + L * .22, cy - L * .12), (cx + L * .95, cy - L * .22),
                   (cx + L * .80, cy), (cx + L * .95, cy + L * .22),
                   (cx + L * .22, cy + L * .12)])
    total = Mascara(W, H).unir(cola).unir(cabeza)
    li = Lienzo(W, H)
    for x, y in cola.puntos():
        li.set(x, y, pal['aleta'])
    for x, y in cabeza.puntos():
        fy = (y - (cy - L * 0.24)) / float(L * 0.48)
        li.set(x, y, mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, 1.0 - fy))))
    li.set(int(cx - L * 0.12), int(cy - L * 0.06), (20, 18, 22))
    return li, total, cabeza


def _pinta_gusano(esp):
    pal = esp['pal']
    L = esp['_L']
    m = Mascara(W, H)
    for i in range(L):
        t = i / float(L - 1)
        py = CY + math.sin(t * 6.0) * L * 0.16
        gr = 1.4 - 0.6 * t
        m.disco(CX + i, py, gr)
    li = Lienzo(W, H)
    for x, y in m.puntos():
        f = (y - CY) / float(max(1, L * 0.3)) + 0.5
        li.set(x, y, mezcla(pal['vientre'], pal['lomo'], min(1.0, max(0.0, f))))
    an = ajusta(pal['patron'], dv=1.2)
    for i in range(1, L, 3):
        t = i / float(L - 1)
        li.encima(CX + i, int(CY + math.sin(t * 6.0) * L * 0.16), an)
    return li, m, m


def _pinta_raya(esp):
    pal = esp['pal']
    L = esp['_L']
    an = L
    al = int(L * 0.78)
    cx, cy = CX + an * 0.42, CY
    cuerpo = Mascara(W, H)
    cuerpo.poligono([(cx - an * .40, cy), (cx - an * .10, cy - al * .48),
                     (cx + an * .30, cy - al * .30), (cx + an * .42, cy),
                     (cx + an * .30, cy + al * .30), (cx - an * .10, cy + al * .48)])
    cuerpo.elipse(cx - an * .05, cy, an * .30, al * .40)
    cola = Mascara(W, H)
    cola.linea(cx + an * .38, cy, cx + an * .95, cy, 2)
    cola.linea(cx + an * .70, cy, cx + an * 1.05, cy - 1, 1)
    total = Mascara(W, H).unir(cola).unir(cuerpo)
    li = Lienzo(W, H)
    for x, y in cola.puntos():
        li.set(x, y, ajusta(pal['lomo'], dv=0.9))
    for x, y in cuerpo.puntos():
        d = math.hypot((x - cx + an * .06) / (an * .45), (y - cy) / (al * .5))
        c = mezcla(pal['lomo'], pal['vientre'], min(1.0, max(0.0, 1.0 - d * 0.9)))
        if x < cx and y < cy:
            c = ajusta(c, dv=1.06)
        li.set(x, y, c)
    p = ajusta(pal['patron'], dv=1.2)
    rnd = esp['_rnd']
    for _ in range(8):
        px = int(cx + rnd.uniform(-an * .3, an * .3))
        py = int(cy + rnd.uniform(-al * .3, al * .3))
        li.encima(px, py, p)
    for s in (-1, 1):
        li.set(int(cx - an * .18), int(cy + s * al * .13), (20, 18, 22))
    return li, total, cuerpo


PINTORES = {
    'cangrejo': _pinta_cangrejo, 'gamba': _pinta_gamba, 'langosta': _pinta_langosta,
    'pulpo': _pinta_pulpo, 'calamar': _pinta_calamar, 'medusa': _pinta_medusa,
    'concha': _pinta_concha, 'caracola': _pinta_caracola, 'estrella': _pinta_estrella,
    'erizo': _pinta_erizo, 'pepino': _pinta_pepino, 'caballito': _pinta_caballito,
    'tortuga': _pinta_tortuga, 'rana': _pinta_rana, 'renacuajo': _pinta_renacuajo,
    'gusano': _pinta_gusano, 'raya': _pinta_raya,
}


# ===========================================================================
# ESTADOS MALOS
# ===========================================================================

def _aplicar_podrido(li, total, cuerpo, esp):
    rnd = esp['_rnd']
    for x, y in total.puntos():
        c = li.get(x, y)
        if not c[3]:
            continue
        ruido = ((x * 7 + y * 13) % 5) / 4.0
        li.set(x, y, A.pudrir(c, ruido * 0.8))
    # moho: el color local muy oscurecido, no pintura verde pegada encima
    caja = cuerpo.caja()
    pts = list(cuerpo.puntos())
    if pts:
        for _ in range(max(3, len(pts) // 26)):
            px, py = pts[rnd.randrange(len(pts))]
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    if abs(dx) + abs(dy) <= 1 or rnd.random() < 0.4:
                        c = li.get(px + dx, py + dy)
                        if c[3]:
                            li.set(px + dx, py + dy, ajusta(c, dv=0.62, ds=1.15, dh=0.02))
    _mordida(total.copia().restar(cuerpo), li, rnd, cuantas=max(2, esp['_L'] // 6))
    return li


def _aplicar_enfermo(li, total, cuerpo, esp):
    rnd = esp['_rnd']
    for x, y in total.puntos():
        c = li.get(x, y)
        if c[3]:
            li.set(x, y, A.enfermar(c, 0.85))
    pts = list(cuerpo.puntos())
    llaga = (206, 158, 150)
    for _ in range(max(2, len(pts) // 40)):
        px, py = pts[rnd.randrange(len(pts))]
        li.encima(px, py, llaga)
        li.encima(px + 1, py, ajusta(llaga, dv=0.8))
    # costillas marcadas
    caja = cuerpo.caja()
    if caja:
        for i in range(caja[0] + 3, caja[2] - 1, 3):
            for y in range(caja[1] + 2, caja[3] - 1):
                if cuerpo.get(i, y) and (y - caja[1]) % 2 == 0:
                    c = li.get(i, y)
                    if c[3]:
                        li.set(i, y, ajusta(c, dv=0.86))
    _mordida(total.copia().restar(cuerpo), li, rnd, cuantas=max(2, esp['_L'] // 8))
    return li


def _aplicar_venenoso(li, total, cuerpo, esp):
    """Sano y vistoso: el peligro se lee por las espinas y el color de aviso."""
    rnd = esp['_rnd']
    aviso = esp.get('color_aviso', (232, 196, 44))
    borde = cuerpo.borde_interno(True)
    i = 0
    puas = []
    for x, y in borde.puntos():
        i += 1
        if i % 4:
            continue
        cx = (cuerpo.caja()[0] + cuerpo.caja()[2]) / 2.0
        dy = -1 if y < CY else 1
        if abs(y - CY) < 2:
            continue
        puas.append((x, y + dy))
    for x, y in puas:
        li.set(x, y, aviso)
        total.set(x, y)
    for x, y in cuerpo.puntos():
        if (x + y) % 7 == 0:
            c = li.get(x, y)
            if c[3]:
                li.set(x, y, mezcla(c, aviso, 0.55))
    return li


# ===========================================================================
# API
# ===========================================================================

def dibujar(esp):
    """
    `esp` = dict con:
        id, arq, pal (nombre de paleta), patron, largo, alto,
        calidad ('bueno'|'malo'), mal ('podrido'|'enfermo'|'venenoso'|None),
        boca, escamas, brazos, patas, ojo_*
    Devuelve un Lienzo ya recortado.
    """
    esp = dict(esp)
    arq = ARQ[esp['arq']]
    esp['_arq'] = arq
    esp['_rnd'] = rng_de(esp['id'], esp['arq'], esp.get('pal'))
    esp['pal'] = paleta(esp['pal']) if isinstance(esp.get('pal'), str) else esp['pal']
    esp['_L'] = int(esp['largo'])
    esp['_H'] = int(esp.get('alto', max(4, int(esp['largo'] / arq.get('largo_rel', 2.5)))))

    if 'pintor' in arq:
        li, total, cuerpo = PINTORES[arq['pintor']](esp)
    else:
        li, total, cuerpo = _pinta_estandar(esp)
        _cara(li, esp, total, cuerpo)

    mal = esp.get('mal')
    if mal == 'podrido':
        _aplicar_podrido(li, total, cuerpo, esp)
    elif mal == 'enfermo':
        _aplicar_enfermo(li, total, cuerpo, esp)
    elif mal == 'venenoso':
        _aplicar_venenoso(li, total, cuerpo, esp)

    # el contorno, UNO para toda la figura
    viva = li.mascara_opaca()
    base_contorno = esp['pal']['lomo'] if mal != 'podrido' else A.pudrir(esp['pal']['lomo'])
    li.contornear(viva, color=A.contorno_de(base_contorno), diagonales=True)

    # linea suave donde la aleta se encuentra con el cuerpo
    if 'pintor' not in arq:
        suave = A.contorno_de(esp['pal']['lomo'], 0.5)
        for x, y in cuerpo.borde_interno(False).puntos():
            c = li.get(x, y)
            if c[3]:
                li.set(x, y, mezcla(c, suave, 0.28))

    if mal in ('podrido', 'enfermo') and '_ojo' in esp:
        # El ojo lechoso. Es lo PRIMERO que se le mira a un pescado para saber
        # si esta pasado —antes que el color, antes que las aletas—, asi que
        # sin esto un pez podrido parece un pez de otro color.
        ex, ey, alt = esp['_ojo']
        turbio = (198, 196, 184) if mal == 'podrido' else (214, 212, 200)
        muerta = (128, 124, 114)
        rad = 1 if alt >= 7 else 0
        for dx in range(-rad, rad + 1):
            for dy in range(-rad, rad + 1):
                li.encima(ex + dx, ey + dy, turbio)
        li.encima(ex, ey, muerta)
        if alt >= 6:
            li.encima(ex + 1, ey, muerta)
    return li.recortado()


def medir(esp):
    """Tamano final sin escribir nada (para catalogos)."""
    li = dibujar(esp)
    return (li.w, li.h)
