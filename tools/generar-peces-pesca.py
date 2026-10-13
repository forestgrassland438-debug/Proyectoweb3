#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LOS PECES DE LA PESCA (pes9 … pes14)                              (2026-10-11)
=============================================================================

"Agrega 6 peces más a la pesca." Como los de antes (pes4 … pes8), salen del
banco de peces del juego (Game/newpro/peces, tools/generar-peces.py): mismo
pincel, mismo contorno, misma luz. Se eligen SOLO libreas lisas, de bandas o
de franjas — nada de puntos, manchas ni moteados (el dueño del juego tiene
tripofobia) —:

    pes9   Silver Pike    lucio plateado   franja dorsal   lago
    pes10  Zander         lucioperca       bandas          río
    pes11  Ice Trout      trucha de hielo  lisa            hielo
    pes12  Rainbow Fish   pez arcoíris     franja lateral  mágico (muy raro)
    pes13  King Salmon    salmón real      liso            río
    pes14  Pufferfish     pez globo        liso            VENENOSO

Tres se copian tal cual del banco (ya son lisos o de bandas). Otros tres se
vuelven a pintar con SU ficha del banco cambiando solo la librea: el lucio
plateado ("vetas") y el pez arcoíris (mosaico de píxeles) salían moteados, y
el pez globo del banco va con puntos. El globo, además, sin el tratamiento
"venenoso" del pincel, que mezcla un píxel de cada siete (un tramado) y pone
púas sueltas como puntitos: sus púas son la propia silueta.

Salida: Game/Objetos/pesca/pes9.png … pes14.png (y una hoja para revisar en
la carpeta temporal que se pase con --hoja).
=============================================================================
"""

import os
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gf_arte as A            # noqa: E402
import gf_peces_arte as PA     # noqa: E402

RAIZ = os.path.dirname(AQUI)
BANCO = os.path.join(RAIZ, 'Game', 'newpro', 'peces')
DESTINO = os.path.join(RAIZ, 'Game', 'Objetos', 'pesca')

DEL_BANCO = {
    'pes10': ('rio', 'pez_lucioperca.png'),
    'pes11': ('hielo', 'pez_trucha_de_hielo.png'),
    'pes13': ('rio', 'pez_salmon_real.png'),
}


# Repintados con la ficha del banco: id del catálogo y lo que se cambia.
REPINTADOS = {
    'pes9':  ('lucio_plateado', {'patron': 'franja_dorsal'}),
    'pes12': ('pez_arcoiris', {'patron': 'lateral'}),
    'pes14': ('pez_globo', {'patron': 'liso', 'mal': None}),
}


def fichas_del_banco():
    """La ficha de pincel de cada especie, igual que la arma generar-peces.py."""
    import importlib.util
    import gf_peces_catalogo as CAT
    sp = importlib.util.spec_from_file_location('generar_peces', os.path.join(AQUI, 'generar-peces.py'))
    gp = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(gp)
    orden, out = {}, {}
    for f in CAT.fichas():
        o = orden.get(f['grupo'], 0)
        orden[f['grupo']] = o + 1
        out[f['id']] = gp.especie_a_spec(f, o)
    return out


def main():
    os.makedirs(DESTINO, exist_ok=True)
    rutas = []
    for pid, (bioma, archivo) in sorted(DEL_BANCO.items(), key=lambda kv: int(kv[0][3:])):
        src = os.path.join(BANCO, bioma, archivo)
        dst = os.path.join(DESTINO, pid + '.png')
        shutil.copyfile(src, dst)
        rutas.append(dst)
        print(pid, '<-', bioma + '/' + archivo)
    fichas = fichas_del_banco()
    for pid, (especie, cambios) in sorted(REPINTADOS.items(), key=lambda kv: int(kv[0][3:])):
        spec = dict(fichas[especie])
        for k, v in cambios.items():
            if v is None:
                spec.pop(k, None)
            else:
                spec[k] = v
        dst = os.path.join(DESTINO, pid + '.png')
        PA.dibujar(spec).guardar(dst)
        rutas.append(dst)
        print(pid, '<-', especie, 'repintado', cambios)
    rutas.sort(key=lambda r: int(os.path.basename(r)[3:-4]))
    if '--hoja' in sys.argv:
        salida = sys.argv[sys.argv.index('--hoja') + 1]
        A.hoja_contacto(rutas, columnas=6, escala=6, fondo=(70, 110, 160, 255)).save(salida)
        print('hoja:', salida)


if __name__ == '__main__':
    main()
