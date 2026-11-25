# -*- coding: utf-8 -*-
"""
=============================================================================
LOS ÁRBOLES NUEVOS DE LOS SIETE MAPAS DEL ESTE        (2026-11-21, 2026-11-24)
=============================================================================

"Quiero que hagas árboles nuevos ... respetando los gráficos del juego ... no
uses cosas que existen en las imágenes del juego."

(2026-11-24) Los primeros (bandas de luz sobre siluetas lisas) se veían
"feos y no profesionales" al lado de los de GameScene y del mapa salvaje, y
recolorear los del paquete no valía ("yo quería diferentes estilos y
colores"). Ahora los dibuja el motor propio tools/gf_motor_arboles.py: copas
de racimos en relieve con su textura de hojitas, troncos con vetas y raíces,
a la escala de GameScene (lienzo 160x200, el juego los pone a 1.3: 208x260).

Veintidós especies que NO están en el paquete ni en newpro:

  puerto   pino_costero (pino piñonero, copa en sombrilla), jacaranda (lila),
           tilo_costero (copa alta con la cima en corazón)
  pantano  manglar (raíces en zancos), cipres_calvo (pagoda con musgo),
           aliso_negro (copa en tres pisos)
  aldor    olivo_antiguo (dos troncos retorcidos, hoja de plata),
           higuera_raices (raíces que cuelgan), laurel (huevo denso)
  colinas  arce_rojo, ginkgo (ramas que suben con abanicos de oro),
           roble_ambar, haya_cobre
  selva    ceiba (contrafuertes y copa en pisos), platanera (palas con su
           nervio y racimo), helecho_arboreo
  volcan   arbol_carbonizado (grietas de brasa), pino_ceniza, arbusto_brasa
  hongos   seta_paraguas, seta_campana, seta_torre (sombreros con grano y el
           borde que brilla)

El pie queda abajo en el centro (el juego pone el origen en el pie y
gf-troncos.js busca ahí la columna del tronco). Determinista.
=============================================================================
"""
import os

import gf_motor_arboles as MOTOR

W, H = MOTOR.W, MOTOR.H

# El paquete de cada mapa (los nombres son los de la capa `arboles` del mapa).
POR_ZONA = {
    'puerto': ['pino_costero', 'jacaranda', 'tilo_costero'],
    'pantano': ['manglar', 'cipres_calvo', 'aliso_negro'],
    'aldor': ['olivo_antiguo', 'higuera_raices', 'laurel'],
    'colinas': ['arce_rojo', 'ginkgo', 'roble_ambar', 'haya_cobre'],
    'selva': ['ceiba', 'platanera', 'helecho_arboreo'],
    'volcan': ['arbol_carbonizado', 'pino_ceniza', 'arbusto_brasa'],
    'hongos': ['seta_paraguas', 'seta_campana', 'seta_torre'],
}

ESPECIES = MOTOR.ESPECIES
assert set(ESPECIES) == {n for v in POR_ZONA.values() for n in v}


def dibujar(nombre):
    """La imagen RGBA (W x H) de una especie."""
    return MOTOR.dibujar(nombre)


def arboles(zona, destino):
    """Escribe los árboles de `zona` en `destino` (W x H, sin recortar: el pie
    queda en el centro) y devuelve sus nombres."""
    os.makedirs(destino, exist_ok=True)
    for n in POR_ZONA[zona]:
        dibujar(n).save(os.path.join(destino, n + '.png'), optimize=True)
    return sorted(POR_ZONA[zona])
