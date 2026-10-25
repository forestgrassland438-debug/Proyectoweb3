# -*- coding: utf-8 -*-
"""
=============================================================================
LOS COLORES DE CADA BIOMA                                        (2026-10-18)
=============================================================================

"Quiero buenos gráficos en el piso y agua, así como los hiciste en el mapa
salvaje." El suelo de los mapas nuevos se COMPONE igual que el del mapa
salvaje (el tileset del pueblo, Game/MAPAS/tiles.png, con sus reglas de
esquinas, orillas y bordillos; tools/generar-salvaje.py) y luego se VUELVE A
COLOREAR por familias de color:

    hierba  (verdes)        -> el suelo del bioma (hierba muerta, arena, nieve)
    tierra  (pardos)        -> el camino del bioma (barro, arena prensada, tierra helada)
    piedra  (grises)        -> la piedra del bioma (fría, arenisca, gris hielo)
    agua    (azules)        -> el agua del bioma (turbia, turquesa, helada)

Se conserva el VALOR de cada píxel respecto al de su familia: las luces, las
sombras, los bordillos y la espuma del dibujo original siguen ahí, con otro
color. Lo mismo se hace con el tileset entero (tiles_<bioma>.png): de él
lee el agua que se mueve (gf-agua.js), que tiene que seguir siendo AZUL para
reconocerla (b > 110, b > r + 35, b > g + 10).

Determinista y sin ruido por píxel: cada COLOR va siempre al mismo color
(una tabla), así que no aparecen motas (el dueño del juego tiene tripofobia).
=============================================================================
"""
import colorsys

import numpy as np

# ── LAS PALETAS ──────────────────────────────────────────────────────────
# Por familia: (tono, saturación, valor medio, cuánto se abre el valor
# alrededor de su medio). El valor de cada píxel se coloca respecto al medio
# de su familia en el tileset del pueblo.
MEDIOS = {'hierba': 0.52, 'tierra': 0.69, 'piedra': 0.44, 'agua': 0.64}

BIOMAS = {
    # El cementerio: hierba muerta (oliva apagado), barro oscuro, piedra fría
    # y agua turbia de pantano (azul verdoso, oscura pero aún azul).
    'cementerio': {
        'hierba': (0.205, 0.30, 0.43, 0.85),
        'tierra': (0.070, 0.34, 0.42, 0.85),
        'piedra': (0.610, 0.10, 0.46, 0.95),
        'agua':   (0.555, 0.58, 0.55, 0.55),
        'otro_sat': 0.45, 'otro_val': 0.78,
    },
    # El desierto: arena dorada, arena prensada más rojiza en los caminos,
    # arenisca y el turquesa de los oasis.
    'desierto': {
        'hierba': (0.118, 0.40, 0.86, 0.55),
        'tierra': (0.080, 0.46, 0.74, 0.70),
        'piedra': (0.095, 0.26, 0.66, 0.90),
        'agua':   (0.537, 0.66, 0.80, 0.45),
        'otro_sat': 0.55, 'otro_val': 1.0,
    },
    # La tundra: nieve (casi blanca, con la sombra azulada), tierra helada,
    # piedra gris hielo y agua fría y honda.
    'tundra': {
        'hierba': (0.590, 0.07, 0.93, 0.30),
        'tierra': (0.075, 0.16, 0.58, 0.80),
        'piedra': (0.590, 0.12, 0.62, 0.95),
        'agua':   (0.585, 0.62, 0.70, 0.50),
        'otro_sat': 0.30, 'otro_val': 1.05,
    },
    # (2026-10-25) LOS TRES MAPAS NUEVOS.
    # El glaciar: nieve vieja más azulada que la de la tundra, caminos de
    # hielo prensado, roca de pizarra azul y agua de deshielo, honda y fría.
    'glaciar': {
        'hierba': (0.565, 0.13, 0.91, 0.32),
        # (2026-10-25) Poco saturados: con más azul, gf-agua (y la pesca del
        # servidor) tomaban los caminos de hielo por agua. Y claros, de nieve
        # prensada: en gris oscuro las manchas parecían losas sueltas.
        # Comprobado contra el tileset: b - r no pasa de 26 (agua > 35).
        'tierra': (0.575, 0.12, 0.84, 0.50),
        'piedra': (0.600, 0.12, 0.56, 0.95),
        'agua':   (0.560, 0.70, 0.66, 0.50),
        'otro_sat': 0.28, 'otro_val': 1.05,
    },
    # La caverna: suelo de roca fría y oscura (pizarra violácea), caminos de
    # tierra apisonada, losas talladas y el lago subterráneo, turquesa.
    'caverna': {
        'hierba': (0.690, 0.13, 0.34, 0.70),
        'tierra': (0.070, 0.30, 0.38, 0.80),
        'piedra': (0.640, 0.10, 0.40, 0.95),
        'agua':   (0.540, 0.68, 0.60, 0.50),
        'otro_sat': 0.35, 'otro_val': 0.60,
    },
    # La pradera: hierba de primavera, viva y clara; caminos de tierra
    # cálida, piedra clara y agua limpia. Las flores del dibujo se quedan.
    'pradera': {
        'hierba': (0.255, 0.50, 0.63, 0.85),
        'tierra': (0.085, 0.38, 0.72, 0.75),
        'piedra': (0.100, 0.10, 0.70, 0.90),
        'agua':   (0.570, 0.60, 0.80, 0.45),
        'otro_sat': 1.0, 'otro_val': 1.0,
    },
}


def familia(r, g, b):
    """La familia de un color del suelo del pueblo (las mismas reglas que
    tools/detallar-captura-mapa.py, más tolerantes con lo oscuro)."""
    mx, mn = max(r, g, b), min(r, g, b)
    if b > r + 30 and b > g + 4 and mx > 70:
        return 'agua'
    if g > r + 18 and g > b + 14 and mx > 45:
        return 'hierba'
    if r > g + 14 and g >= b and mx > 60:
        return 'tierra'
    if mx - mn < 26:
        return 'piedra'
    return 'otro'


def color_bioma(c, bioma):
    """El color `c` (r, g, b) del pueblo en el bioma."""
    r, g, b = c
    P = BIOMAS[bioma]
    fam = familia(r, g, b)
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    if fam == 'otro':
        # Flores, contornos de colores...: se apagan hacia el bioma.
        s2 = s * P['otro_sat']
        v2 = min(1.0, v * P['otro_val'])
        rr, gg, bb = colorsys.hsv_to_rgb(h, s2, v2)
        return (int(round(rr * 255)), int(round(gg * 255)), int(round(bb * 255)))
    th, ts, tv, abre = P[fam]
    rel = v / MEDIOS[fam]                         # 1 = el tono medio de su familia
    v2 = tv * (1 + (rel - 1) * abre)
    # La sombra se enfría y la luz se calienta un poco: volumen sin ruido.
    s2 = ts * (1.0 + (1 - rel) * 0.35)
    h2 = th + (1 - rel) * 0.012
    if fam == 'agua':
        # El agua tiene que seguir siendo agua para gf-agua (azul dominante).
        v2 = max(v2, 0.50)
    v2 = max(0.0, min(1.0, v2)); s2 = max(0.0, min(1.0, s2))
    rr, gg, bb = colorsys.hsv_to_rgb(h2 % 1.0, s2, v2)
    out = (int(round(rr * 255)), int(round(gg * 255)), int(round(bb * 255)))
    if fam == 'agua':
        rr, gg, bb = out
        bb = max(bb, 116); bb = max(bb, rr + 38, gg + 12)
        out = (rr, gg, min(255, bb))
    return out


def recolorear(arr, bioma):
    """`arr`: numpy RGBA (H, W, 4) uint8. Devuelve una copia en el bioma.
    Cada color distinto se calcula una vez (tabla)."""
    a = np.ascontiguousarray(arr[..., :3])
    plano = a.reshape(-1, 3)
    clave = (plano[:, 0].astype(np.int64) << 16) | (plano[:, 1].astype(np.int64) << 8) | plano[:, 2].astype(np.int64)
    unicos, inversa = np.unique(clave, return_inverse=True)
    tabla = np.zeros((len(unicos), 3), np.uint8)
    for i, k in enumerate(unicos):
        tabla[i] = color_bioma(((k >> 16) & 255, (k >> 8) & 255, k & 255), bioma)
    out = arr.copy()
    out[..., :3] = tabla[inversa].reshape(a.shape)
    return out


def mascara_familias(arr):
    """Máscaras booleanas por familia sobre el suelo YA en el bioma no sirven:
    se calculan sobre el del pueblo. Devuelve dict familia -> (H, W) bool."""
    a = arr[..., :3].astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    agua = (b > r + 30) & (b > g + 4) & (mx > 70)
    hierba = (g > r + 18) & (g > b + 14) & (mx > 45) & ~agua
    tierra = (r > g + 14) & (g >= b) & (mx > 60) & ~agua & ~hierba
    piedra = ((mx - mn) < 26) & ~agua & ~hierba & ~tierra
    return {'agua': agua, 'hierba': hierba, 'tierra': tierra, 'piedra': piedra}
