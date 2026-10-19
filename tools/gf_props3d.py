# -*- coding: utf-8 -*-
"""
=============================================================================
LOS OBJETOS 2.5D DE LOS MAPAS NUEVOS                             (2026-10-18)
=============================================================================

"Los nuevos objetos deben ser 2.5D, no te olvides, y altamente con gráficos."

Cada objeto es un MODELO 3D pequeño (elipsoides, conos redondeados y bloques
biselados de tools/gf_bestias3d.py) fotografiado con la cámara del juego —a
32° desde arriba—, con la luz arriba a la izquierda en bandas lisas, el
contorno del juego por fuera y por dentro (donde una pieza tapa a otra) y sin
píxeles sueltos. Se dibujan a la densidad del personaje: el juego los pone a
escala 2, como a los monstruos y a las casas.

  · CEMENTERIO: lápidas (redonda, en cruz, rota, con ángel), obelisco, la
    cripta, verjas de hierro (de frente y de lado), farolas, ataúd, tumba
    abierta, la estatua encapuchada.
  · DESIERTO: saguaros, cactus barril, nopales, cactus pequeño, rocas y una
    mesa de arenisca con sus estratos, columna rota, arco en ruinas, obelisco,
    costillas de una bestia gigante, cráneo con cuernos, tienda de caravana,
    vasijas.
  · TUNDRA: cristales de hielo (y el grande del santuario), rocas nevadas,
    muñeco de nieve, iglú, tronco nevado, hoguera.

SIN MOTAS NI AGUJEROS (tripofobia): las texturas son bandas, rayas y
estratos; nada de puntos, poros ni racimos. Los cactus no llevan espinas en
punto: llevan COSTILLAS (rayas). Ninguna pieza repetida lleva reflejo
especular (una fila de puntos blancos).

Cada objeto da: la foto, su punto de apoyo (los pies, en px de la foto), la
huella que choca (en px del JUEGO, ya a escala 2) y el ancho de su sombra.
Determinista.
=============================================================================
"""
import math

import numpy as np

from gf_arte import rampa, hex_rgb, contorno_de
from gf_bestias3d import elip, cono, roca, fotografiar, giro_z, _local

ESCALA = 2          # el juego los pone a escala 2


def giro_y(a):
    """Gira sobre la vertical (columnas = ejes locales)."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def giro_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def caja(c, e, mat, rot=None, bisel=0.94, arista=0.97):
    """Un bloque con los cantos apenas biselados (piedra tallada)."""
    return roca(c, e, mat, rot=rot, bisel=bisel, arista=arista)


def cortar(p, c, n, o=0.0):
    """Recorta la pieza por un plano: fuera lo que queda del lado de `n`."""
    p['corte'] = {'c': np.array(c, float), 'n': np.array(n, float) / np.linalg.norm(n), 'o': o}
    return p


def tonos(h, arriba=0.32, abajo=0.58):
    return rampa(hex_rgb(h), 5, arriba=arriba, abajo=abajo)


# ── MATERIALES ───────────────────────────────────────────────────────────
MAT = {
    # piedras
    'piedra': {'tonos': tonos('#8e9097')},
    'piedra_osc': {'tonos': tonos('#6c6f78')},
    'piedra_clara': {'tonos': tonos('#a9aab0', arriba=0.28)},
    'grabado': {'tonos': tonos('#4d505a', arriba=0.15, abajo=0.4)},
    'musgo': {'tonos': tonos('#6f7d4a', arriba=0.25, abajo=0.5)},
    'marmol': {'tonos': tonos('#c9c6bc', arriba=0.25, abajo=0.5)},
    'tejado': {'tonos': tonos('#4f4a57')},
    'puerta': {'tonos': tonos('#3a2f2a', arriba=0.2, abajo=0.45)},
    'hierro': {'tonos': tonos('#3d3f48', arriba=0.35, abajo=0.5)},
    'oro_viejo': {'tonos': tonos('#a88a48', arriba=0.3)},
    'madera': {'tonos': tonos('#6e4a2c')},
    'madera_osc': {'tonos': tonos('#4e3420')},
    'tierra': {'tonos': tonos('#5a4632', arriba=0.25, abajo=0.5)},
    'hoyo': {'tonos': tonos('#241c16', arriba=0.1, abajo=0.3)},
    'luz_farol': {'emite': hex_rgb('#ffd27a')},
    'luz_alma': {'emite': hex_rgb('#9dffcf')},
    # desierto
    'cactus': {'tonos': tonos('#5f8f4a', arriba=0.3, abajo=0.55)},
    'cactus_osc': {'tonos': tonos('#3f6a36', arriba=0.25, abajo=0.5)},
    'flor_rosa': {'tonos': tonos('#e57aa0', arriba=0.25, abajo=0.4)},
    'flor_amarilla': {'tonos': tonos('#f0c64a', arriba=0.25, abajo=0.4)},
    'arenisca': {'tonos': tonos('#c9a46c')},
    'arenisca_osc': {'tonos': tonos('#a57f4e')},
    'arenisca_roja': {'tonos': tonos('#b9784c')},
    'hueso': {'tonos': tonos('#e6dcc2', arriba=0.25, abajo=0.5)},
    'cuerno': {'tonos': tonos('#5a4a3c', arriba=0.3, abajo=0.5)},
    'lona': {'tonos': tonos('#d9c6a0', arriba=0.25, abajo=0.5)},
    'lona_roja': {'tonos': tonos('#a8443a', arriba=0.28, abajo=0.5)},
    'barro_cocido': {'tonos': tonos('#b0623c')},
    # tundra
    'hielo': {'tonos': rampa(hex_rgb('#9fd9f0'), 5, arriba=0.45, abajo=0.5)},
    'hielo_hondo': {'tonos': rampa(hex_rgb('#5aa8d6'), 5, arriba=0.4, abajo=0.5)},
    'nieve': {'tonos': rampa(hex_rgb('#e8eef6'), 5, arriba=0.5, abajo=0.32)},
    'roca_fria': {'tonos': tonos('#77808e')},
    'carbon': {'tonos': tonos('#24242a', arriba=0.2, abajo=0.3)},
    'zanahoria': {'tonos': tonos('#f08a32', arriba=0.25)},
    'bufanda': {'tonos': tonos('#c8433c', arriba=0.25)},
    'brasa': {'emite': hex_rgb('#ffb04a')},
    'llama': {'emite': hex_rgb('#ffe28a')},
}


def mats(*nombres):
    return {n: MAT[n] for n in nombres}


# ===========================================================================
# CEMENTERIO
# ===========================================================================

def lapida_redonda(variante=0):
    """Losa con la cabeza redonda sobre su peana; una cruz grabada al frente
    y musgo por arriba."""
    alto = 15 + variante * 2
    losa = caja((0, 3 + alto / 2.0, 0), (6.5, alto / 2.0, 1.8), 'piedra')
    cabeza = cortar(elip((0, 3 + alto, 0), (6.5, 4.5, 1.8), 'piedra'), (0, 3 + alto, 0), (0, -1, 0))
    peana = caja((0, 1.5, 0.6), (8.5, 1.6, 3.4), 'piedra_osc')
    pr = [losa, cabeza, peana]

    def ret(p, Pm, nm, nw):
        if (p is losa or p is cabeza) and nm[2] > 0.75:
            x, y = Pm[0], Pm[1] - 3
            # La cruz grabada (dos rayas), en el tercio de arriba.
            if (abs(x) < 0.9 and alto * 0.35 < y < alto * 0.95) or (abs(y - alto * 0.75) < 0.9 and abs(x) < 3.2):
                return 'grabado'
        if (p is losa or p is cabeza) and nw[1] > 0.72:
            return 'musgo'
        return None
    return pr, ret, mats('piedra', 'piedra_osc', 'grabado', 'musgo')


def lapida_cruz():
    palo = caja((0, 3 + 10, 0), (1.9, 10, 1.9), 'piedra_clara')
    brazo = caja((0, 3 + 14.5, 0), (6.2, 1.8, 1.9), 'piedra_clara')
    peana = caja((0, 1.6, 0.4), (5.5, 1.7, 4.0), 'piedra_osc')
    escalon = caja((0, 4.0, 0.2), (3.6, 0.9, 2.8), 'piedra')
    return [palo, brazo, peana, escalon], None, mats('piedra_clara', 'piedra_osc', 'piedra')


def lapida_rota():
    """La losa partida en diagonal y su trozo caído delante."""
    losa = cortar(caja((0, 3 + 8, 0), (6.5, 8, 1.8), 'piedra'), (0, 3 + 12, 0), (0.45, 1, 0))
    trozo = caja((4.5, 1.6, 6.0), (4.0, 1.4, 2.6), 'piedra', rot=giro_y(0.5) @ giro_z(0.25))
    peana = caja((0, 1.5, 0.6), (8.5, 1.6, 3.4), 'piedra_osc')

    def ret(p, Pm, nm, nw):
        if p is losa and nw[1] > 0.6:
            return 'piedra_clara'                 # la rotura, más clara: piedra viva
        return None
    return [losa, trozo, peana], ret, mats('piedra', 'piedra_osc', 'piedra_clara')


def lapida_angel():
    """Una losa alta con un ángel encima, las alas plegadas."""
    losa = caja((0, 3 + 9, 0), (6.0, 9, 2.0), 'marmol')
    peana = caja((0, 1.5, 0.6), (8.0, 1.6, 3.6), 'piedra_osc')
    cuerpo = cono((0, 21, 0), (0, 30, 0), 3.4, 2.2, 'marmol')
    cabeza = elip((0, 32.5, 0.4), (2.2, 2.4, 2.2), 'marmol')
    pr = [losa, peana, cuerpo, cabeza]
    for sg in (1, -1):
        pr.append(elip((3.0 * sg, 27.5, -1.2), (2.0, 5.5, 1.4), 'marmol', rot=giro_z(-0.25 * sg)))

    def ret(p, Pm, nm, nw):
        if p is losa and nm[2] > 0.75 and abs(Pm[1] - 14) < 0.8 and abs(Pm[0]) < 4:
            return 'grabado'                      # una raya: el nombre
        return None
    return pr, ret, mats('marmol', 'piedra_osc', 'grabado')


def obelisco():
    pr = [caja((0, 2.5, 0), (8, 2.5, 8), 'piedra_osc'),
          caja((0, 6.5, 0), (6, 1.6, 6), 'piedra'),
          caja((0, 14, 0), (4.4, 6.5, 4.4), 'piedra_clara'),
          caja((0, 26, 0), (3.8, 6.0, 3.8), 'piedra_clara'),
          caja((0, 36.5, 0), (3.2, 5.0, 3.2), 'piedra_clara'),
          roca((0, 42.5, 0), (2.4, 2.4, 2.4), 'piedra_clara', rot=giro_y(math.pi / 4), bisel=0.7, arista=0.82)]

    def ret(p, Pm, nm, nw):
        # Una banda grabada en cada tramo (rayas, no puntos).
        if p['mat'] == 'piedra_clara' and nm[2] > 0.7 and abs((Pm[1] % 12) - 3) < 0.7 and Pm[1] < 40:
            return 'grabado'
        return None
    return pr, ret, mats('piedra_osc', 'piedra', 'piedra_clara', 'grabado')


def cripta():
    """El mausoleo: plataforma, escalinata, cuerpo, cuatro columnas, frontón
    a dos aguas con su cruz, y la puerta de hierro con una rendija de luz."""
    pr = []
    pr.append(caja((0, 2.0, 0), (46, 2.0, 30), 'piedra_osc'))                       # plataforma
    for i, (z, y, w) in enumerate(((31, 1.2, 18), (34, 0.6, 16))):
        pr.append(caja((0, y, z), (w, 1.2 - i * 0.5, 2.4), 'piedra'))                 # escalones
    pr.append(caja((0, 4 + 20, -4), (36, 20, 20), 'piedra'))                         # cuerpo
    pr.append(caja((0, 4 + 41.5, -4), (39, 2.0, 23), 'piedra_osc'))                  # cornisa
    for x in (-27, -10, 10, 27):
        pr.append(cono((x, 4.2, 20), (x, 43, 20), 3.3, 3.0, 'piedra_clara'))          # columnas
        pr.append(caja((x, 5.0, 20), (4.6, 1.0, 4.6), 'piedra_osc'))                 # basa
        pr.append(caja((x, 42.6, 20), (4.4, 1.0, 4.4), 'piedra_osc'))                # capitel
    # (2026-10-19) "El techo está malo: la pared pasa el techo." Antes los
    # faldones se apoyaban MÁS ABAJO que la cornisa (sus aleros quedaban a
    # y 45 y la cornisa llega a 47,5), así que la cornisa asomaba por los
    # dos lados, y el tímpano era un rectángulo en vez de un triángulo.
    # Ahora: el frontón es un TRIÁNGULO de verdad (dos medios bloques
    # recortados por la pendiente), los faldones se apoyan justo encima de
    # él y de la cornisa, y los aleros salen por delante, por detrás y por
    # los lados (x 45 > cornisa 39).
    a = 0.42                                   # la pendiente del tejado
    y_base = 4 + 41.5 + 2.0                    # lo alto de la cornisa
    y_cumbre = y_base + 39 * math.tan(a)       # la punta del frontón
    for sg in (1, -1):
        mitad = caja((sg * 19.5, (y_base + y_cumbre) / 2 + 0.2, 18.5), (19.5, (y_cumbre - y_base) / 2 + 0.6, 1.8), 'piedra')
        cortar(mitad, (0, y_cumbre, 18.5), (sg * math.sin(a), math.cos(a), 0))
        pr.append(mitad)                                                             # el frontón
    tejas = []
    for sg in (1, -1):
        bx, by = 22.5, y_cumbre - 22.5 * math.tan(a)
        cxr, cyr = sg * (bx + 2.5 * math.sin(a)), by + 2.5 * math.cos(a)
        t = caja((cxr, cyr, -4), (25, 2.2, 27.5), 'tejado', rot=giro_z(-sg * a))
        tejas.append(t)
        pr.append(t)
    y_tope = y_cumbre + 4.7 / math.cos(a)                                            # lo alto de la cumbrera
    pr.append(caja((0, y_tope - 0.6, -4), (1.8, 1.6, 28), 'piedra_osc'))             # la cumbrera
    pr.append(caja((0, y_tope + 4.4, 19), (1.4, 5, 1.4), 'hierro'))                  # la cruz, en la punta
    pr.append(caja((0, y_tope + 5.9, 19), (4, 1.3, 1.4), 'hierro'))
    puerta = caja((0, 4 + 13, 16.6), (8.5, 13, 1.0), 'puerta')
    pr.append(puerta)
    pr.append(caja((0, 4 + 27.5, 16.4), (10.5, 1.6, 1.2), 'piedra_osc'))            # dintel
    rendija = caja((0, 4 + 12, 17.3), (0.6, 11, 0.4), 'luz_alma')
    pr.append(rendija)

    def ret(p, Pm, nm, nw):
        if p is puerta and nm[2] > 0.7 and abs(Pm[1] - 17) % 6 < 0.7:
            return 'hierro'                       # los refuerzos de la puerta: rayas
        if (p is tejas[0] or p is tejas[1]) and nw[1] > 0.3:
            # Las hileras de tejas: rayas paralelas a la cumbrera, por la
            # pendiente de cada faldón (en sus ejes, no en los del mundo).
            q = _local(p, Pm[None, :])[0]
            if (q[0] % 5.0) < 0.9:
                return 'piedra_osc'
        return None
    return pr, ret, mats('piedra_osc', 'piedra', 'piedra_clara', 'tejado', 'hierro', 'puerta', 'luz_alma')


def verja():
    """Un tramo de verja de hierro de 32 px: barrotes con punta y dos largueros."""
    pr = [caja((0, 3.0, 0), (16, 1.0, 0.9), 'hierro'), caja((0, 14.5, 0), (16, 0.9, 0.8), 'hierro')]
    for i in range(-15, 16, 5):
        pr.append(cono((i, 0, 0), (i, 17, 0), 0.75, 0.75, 'hierro'))
        pr.append(cono((i, 17, 0), (i, 19.5, 0), 0.9, 0.15, 'oro_viejo'))
    for x in (-16, 16):
        pr.append(caja((x, 9.5, 0), (1.4, 9.5, 1.4), 'piedra_osc'))                  # pilares
        pr.append(caja((x, 19.8, 0), (1.8, 0.9, 1.8), 'piedra'))
    return pr, None, mats('hierro', 'oro_viejo', 'piedra_osc', 'piedra')


def farola():
    pr = [caja((0, 1.2, 0), (3.2, 1.2, 3.2), 'piedra_osc'),
          cono((0, 2, 0), (0, 36, 0), 1.1, 0.9, 'hierro'),
          cono((0, 34, 0), (4.5, 36.5, 0), 0.7, 0.6, 'hierro'),
          caja((5.0, 31.0, 0), (2.6, 3.4, 2.6), 'hierro'),
          caja((5.0, 31.2, 0), (2.0, 2.6, 2.7), 'luz_farol'),
          cono((5.0, 34.6, 0), (5.0, 37.0, 0), 2.6, 0.5, 'hierro')]
    return pr, None, mats('piedra_osc', 'hierro', 'luz_farol')


def ataud():
    caja_ = caja((0, 3.0, 0), (5.2, 2.8, 11), 'madera', rot=giro_y(0.35))
    tapa = caja((0.4, 6.2, 0.2), (5.6, 0.8, 11.6), 'madera_osc', rot=giro_y(0.35))
    cruz1 = caja((0.4, 7.1, -1.0), (0.7, 0.3, 4.0), 'oro_viejo', rot=giro_y(0.35))
    cruz2 = caja((0.4, 7.1, -2.2), (2.2, 0.3, 0.7), 'oro_viejo', rot=giro_y(0.35))
    return [caja_, tapa, cruz1, cruz2], None, mats('madera', 'madera_osc', 'oro_viejo')


def tumba_abierta():
    monton = cortar(elip((-11, 0, 1), (6, 5.5, 9), 'tierra'), (0, 0, 0), (0, -1, 0))
    borde = caja((4, 0.5, 2), (6.4, 0.5, 10.4), 'tierra')
    hoyo = caja((4, 0.75, 2), (4.8, 0.4, 8.8), 'hoyo')
    lapida = caja((4, 3 + 7, -10), (5.5, 7, 1.6), 'piedra')
    peana = caja((4, 1.4, -10), (7, 1.4, 3), 'piedra_osc')
    pala = cono((-13, 4, 6), (-8, 15, 4), 0.6, 0.6, 'madera')
    hoja = caja((-13.6, 2.6, 6.4), (1.7, 2.4, 0.5), 'hierro', rot=giro_z(-0.4))
    return [monton, borde, hoyo, lapida, peana, pala, hoja], None, mats('tierra', 'hoyo', 'piedra', 'piedra_osc', 'madera', 'hierro')


def estatua():
    """La doliente encapuchada sobre su pedestal."""
    pr = [caja((0, 3, 0), (8, 3, 8), 'piedra_osc'),
          caja((0, 7, 0), (6.5, 1.2, 6.5), 'piedra'),
          cono((0, 8, 0), (0, 26, 0), 6.0, 3.8, 'marmol'),                           # el manto
          elip((0, 28, 0.5), (3.6, 4.0, 3.6), 'marmol'),                              # la capucha
          cortar(elip((0, 27.4, 1.6), (2.4, 2.6, 2.4), 'piedra_osc'), (0, 27, 2.4), (0, 0, -1)),   # la cara en sombra
          elip((0, 20, 3.5), (2.6, 2.0, 1.6), 'marmol')]                              # las manos juntas
    return pr, None, mats('piedra_osc', 'piedra', 'marmol')


# ===========================================================================
# DESIERTO
# ===========================================================================

def _costillas(eje_x=0.0, eje_z=0.0, n=9):
    """Retoque de cactus: costillas verticales (rayas) según el ángulo."""
    def ret(p, Pm, nm, nw):
        if p['mat'] != 'cactus':
            return None
        ang = math.atan2(Pm[2] - eje_z, Pm[0] - eje_x)
        if ((ang / (2 * math.pi)) * n) % 1.0 < 0.3:
            return 'cactus_osc'
        return None
    return ret


def saguaro(brazos=2, alto=40):
    pr = [cono((0, 0, 0), (0, alto, 0), 4.6, 4.0, 'cactus')]
    cuales = [(1, alto * 0.45, alto * 0.75), (-1, alto * 0.6, alto * 0.85)][:brazos]
    for sg, y0, y1 in cuales:
        pr.append(cono((0, y0, 0), (sg * 9, y0 + 1.5, 0), 2.8, 2.8, 'cactus'))
        pr.append(cono((sg * 9, y0 + 1.5, 0), (sg * 9, y1, 0), 2.8, 2.4, 'cactus'))
    pr.append(elip((0.8, alto + 3.6, 0.6), (1.8, 1.4, 1.8), 'flor_rosa'))

    def ret(p, Pm, nm, nw):
        if p['mat'] != 'cactus':
            return None
        # El eje de la pieza más cercana: el tronco o el brazo.
        ex = 0.0
        if abs(Pm[0]) > 6:
            ex = 9.0 if Pm[0] > 0 else -9.0
        ang = math.atan2(Pm[2], Pm[0] - ex)
        return 'cactus_osc' if ((ang / (2 * math.pi)) * 10) % 1.0 < 0.3 else None
    return pr, ret, mats('cactus', 'cactus_osc', 'flor_rosa')


def cactus_barril():
    cuerpo = elip((0, 8, 0), (7.5, 8.5, 7.5), 'cactus')
    corona = elip((0, 16.6, 0), (2.6, 1.2, 2.6), 'flor_amarilla')
    return [cuerpo, corona], _costillas(n=12), mats('cactus', 'cactus_osc', 'flor_amarilla')


def nopal():
    pr = [elip((0, 6, 0), (5, 6.5, 1.8), 'cactus', rot=giro_z(0.15)),
          elip((-5, 14, 0.5), (4.2, 5.4, 1.6), 'cactus', rot=giro_z(0.55)),
          elip((5.5, 13.5, -0.5), (4.0, 5.0, 1.6), 'cactus', rot=giro_z(-0.5)),
          elip((-1, 20.5, 0.2), (3.4, 4.4, 1.4), 'cactus', rot=giro_z(0.1)),
          elip((-1.2, 25.4, 0.4), (1.6, 1.2, 1.6), 'flor_amarilla'),
          elip((8.6, 18.0, -0.2), (1.4, 1.1, 1.4), 'flor_rosa')]

    def ret(p, Pm, nm, nw):
        # Las palas: una raya de luz por el canto (sin espinas en punto).
        if p['mat'] == 'cactus' and abs(nm[2]) < 0.35:
            return 'cactus_osc'
        return None
    return pr, ret, mats('cactus', 'cactus_osc', 'flor_amarilla', 'flor_rosa')


def cactus_pequeno():
    pr = [cono((0, 0, 0), (0, 15, 0), 3.4, 3.0, 'cactus'),
          cono((0, 6, 0), (5, 7, 0), 2.0, 2.0, 'cactus'),
          cono((5, 7, 0), (5, 12, 0), 2.0, 1.8, 'cactus')]
    return pr, _costillas(n=8), mats('cactus', 'cactus_osc')


def _estratos(base, oscura, paso=4.0, grueso=0.9):
    def ret(p, Pm, nm, nw):
        if p['mat'] == base and abs(nw[1]) < 0.6 and (Pm[1] % paso) < grueso:
            return oscura
        return None
    return ret


def roca_arenisca(v=0):
    if v == 0:
        pr = [roca((0, 7, 0), (11, 7, 8), 'arenisca', rot=giro_y(0.3)),
              roca((8, 4, 5), (5, 4, 4), 'arenisca', rot=giro_y(-0.4))]
    else:
        pr = [roca((0, 9, 0), (8, 9, 7), 'arenisca', rot=giro_y(-0.2)),
              roca((-7, 3.5, 4), (5, 3.5, 4), 'arenisca', rot=giro_y(0.5))]
    return pr, _estratos('arenisca', 'arenisca_osc'), mats('arenisca', 'arenisca_osc')


def mesa_roca():
    """Una mesa de arenisca roja: paredes con estratos y la cima plana."""
    pr = [roca((0, 16, 0), (34, 16, 22), 'arenisca_roja', bisel=0.86, arista=0.93),
          roca((-16, 34, -4), (16, 4, 13), 'arenisca_roja', bisel=0.8, arista=0.9),
          roca((26, 6, 14), (10, 6, 8), 'arenisca_roja', rot=giro_y(0.4))]

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.75:
            return 'arenisca'                     # la cima, más clara
        if abs(nw[1]) < 0.6 and (Pm[1] % 6.0) < 1.1:
            return 'arenisca_osc'
        return None
    return pr, ret, mats('arenisca_roja', 'arenisca', 'arenisca_osc')


def columna_rota(alto=26):
    fuste = cortar(cono((0, 3, 0), (0, alto, 0), 4.6, 4.3, 'arenisca'), (0, alto - 3, 0), (0.5, 1, 0.2))
    pr = [caja((0, 1.6, 0), (6.5, 1.6, 6.5), 'arenisca_osc'), fuste,
          cono((7, 1.8, 6), (14, 2.6, 4), 4.0, 4.0, 'arenisca')]                    # el trozo caído

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'arenisca' and abs(nw[1]) < 0.6:
            ang = math.atan2(Pm[2], Pm[0])
            if ((ang / (2 * math.pi)) * 10) % 1.0 < 0.22:
                return 'arenisca_osc'             # las acanaladuras: rayas
        return None
    return pr, ret, mats('arenisca', 'arenisca_osc')


def arco_ruinas():
    pr = [caja((-14, 15, 0), (4.5, 15, 4.5), 'arenisca'),
          caja((14, 12, 0), (4.5, 12, 4.5), 'arenisca'),
          cortar(caja((-2, 32, 0), (19, 3, 5), 'arenisca_osc'), (6, 32, 0), (1, 0.6, 0)),
          caja((18, 2, 8), (5, 2, 3), 'arenisca', rot=giro_y(0.6))]
    return pr, _estratos('arenisca', 'arenisca_osc', paso=5.0), mats('arenisca', 'arenisca_osc')


def obelisco_desierto():
    pr = [caja((0, 2, 0), (7, 2, 7), 'arenisca_osc'),
          caja((0, 12, 0), (4.0, 8, 4.0), 'arenisca'),
          caja((0, 26, 0), (3.4, 6, 3.4), 'arenisca'),
          roca((0, 33.5, 0), (2.6, 2.6, 2.6), 'oro_viejo', rot=giro_y(math.pi / 4), bisel=0.7, arista=0.82)]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'arenisca' and nm[2] > 0.7 and abs(Pm[0]) < 1.6 and (Pm[1] % 4.0) < 1.4:
            return 'arenisca_osc'                 # los glifos: rayas cortas en columna
        return None
    return pr, ret, mats('arenisca', 'arenisca_osc', 'oro_viejo')


def costillas():
    """Las costillas de una bestia gigante que asoman de la arena."""
    pr = []
    for i, x in enumerate((-18, -9, 0, 9, 18)):
        alto = 18 - abs(x) * 0.35
        for sg in (1, -1):
            a = (x, 0, sg * 10.0)
            b = (x + 1, alto, sg * 6.0)
            c = (x + 2, alto + 5, sg * 1.0)
            pr.append(cono(a, b, 1.6, 1.3, 'hueso'))
            pr.append(cono(b, c, 1.3, 0.8, 'hueso'))
    pr.append(cortar(cono((-26, 1.5, 0), (24, 1.5, 0), 2.2, 1.6, 'hueso'), (0, 0, 0), (0, -1, 0)))   # el espinazo
    return pr, None, mats('hueso')


def craneo():
    pr = [elip((0, 4, 0), (6, 4.5, 5), 'hueso'),
          elip((5, 2.6, 0), (4.2, 2.8, 3.4), 'hueso'),
          cono((-2, 6, 4), (-6, 9, 10), 1.6, 0.5, 'cuerno'),
          cono((-2, 6, -4), (-6, 9, -10), 1.6, 0.5, 'cuerno')]
    return pr, None, mats('hueso', 'cuerno')


def tienda():
    lona = cono((0, 0, 0), (0, 30, 0), 18, 1.2, 'lona')
    puerta = cortar(cono((0, 0, 9), (0, 17, 5), 6, 1.5, 'lona_roja'), (0, 0, 0), (0, -1, 0))
    mastil = cono((0, 29, 0), (0, 36, 0), 0.7, 0.6, 'madera')
    pr = [lona, puerta, mastil]

    def ret(p, Pm, nm, nw):
        if p is lona:
            ang = math.atan2(Pm[2], Pm[0])
            if ((ang / (2 * math.pi)) * 8) % 1.0 < 0.18:
                return 'lona_roja'                # las franjas de la lona
        return None
    return pr, ret, mats('lona', 'lona_roja', 'madera')


def vasija():
    pr = [elip((0, 6, 0), (5, 6, 5), 'barro_cocido'),
          cono((0, 10, 0), (0, 14, 0), 2.4, 3.0, 'barro_cocido'),
          cono((-4, 9, 0), (-5, 12, 0), 0.8, 0.8, 'barro_cocido')]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'barro_cocido' and abs(Pm[1] - 6.5) < 0.8:
            return 'arenisca_osc'                 # una franja pintada
        return None
    return pr, ret, mats('barro_cocido', 'arenisca_osc')


# ===========================================================================
# TUNDRA
# ===========================================================================

def cristal_hielo(grande=False):
    k = 1.8 if grande else 1.0
    pr = [roca((0, 13 * k, 0), (3.2 * k, 13 * k, 3.2 * k), 'hielo', rot=giro_z(0.08) @ giro_y(0.6), bisel=0.62, arista=0.8),
          roca((-6 * k, 8 * k, 2 * k), (2.4 * k, 8 * k, 2.4 * k), 'hielo', rot=giro_z(0.45) @ giro_y(0.2), bisel=0.62, arista=0.8),
          roca((5.5 * k, 6.5 * k, 3 * k), (2.2 * k, 6.5 * k, 2.2 * k), 'hielo', rot=giro_z(-0.5) @ giro_y(1.1), bisel=0.62, arista=0.8),
          cortar(elip((0, 0, 0), (9 * k, 2.6 * k, 7 * k), 'nieve'), (0, 0, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        # El hielo con su corazón más hondo: una banda por el centro de cada cara.
        if p['mat'] == 'hielo' and nw[0] > 0.35:
            return 'hielo_hondo'
        return None
    return pr, ret, mats('hielo', 'hielo_hondo', 'nieve')


def roca_nevada(v=0):
    if v == 0:
        pr = [roca((0, 7, 0), (10, 7, 8), 'roca_fria', rot=giro_y(0.4)),
              cortar(elip((0, 12.5, 0), (9.6, 3.0, 7.6), 'nieve', rot=giro_y(0.4)), (0, 11.5, 0), (0, -1, 0))]
    else:
        pr = [roca((0, 5, 0), (7, 5, 6), 'roca_fria', rot=giro_y(-0.6)),
              roca((7, 3, 4), (4, 3, 3.5), 'roca_fria', rot=giro_y(0.3)),
              cortar(elip((0, 9, 0), (6.6, 2.4, 5.6), 'nieve', rot=giro_y(-0.6)), (0, 8.2, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'roca_fria' and nw[1] > 0.65:
            return 'nieve'
        return None
    return pr, ret, mats('roca_fria', 'nieve')


def muneco_nieve():
    pr = [elip((0, 6, 0), (7, 6.5, 7), 'nieve'),
          elip((0, 16, 0), (5.2, 5.0, 5.2), 'nieve'),
          elip((0, 24, 0), (3.8, 3.8, 3.8), 'nieve'),
          cono((0, 24, 3.4), (0, 23.4, 7.4), 0.9, 0.2, 'zanahoria'),
          elip((-1.4, 25.4, 3.2), (0.6, 0.6, 0.4), 'carbon'),
          elip((1.4, 25.4, 3.2), (0.6, 0.6, 0.4), 'carbon'),
          elip((0, 20.4, 0), (4.4, 1.4, 4.4), 'bufanda'),
          cono((2.8, 20.4, 3.4), (3.6, 15.0, 4.4), 1.0, 0.8, 'bufanda'),
          cono((4.6, 17, 0), (11, 22, 0), 0.6, 0.4, 'madera_osc'),
          cono((-4.6, 17, 0), (-10, 23, 0), 0.6, 0.4, 'madera_osc'),
          caja((0, 28.6, 0), (3.0, 0.6, 3.0), 'carbon'),
          caja((0, 30.6, 0), (2.0, 2.0, 2.0), 'carbon')]
    return pr, None, mats('nieve', 'zanahoria', 'carbon', 'bufanda', 'madera_osc')


def iglu():
    cupula = cortar(elip((0, 0, -3), (19, 13, 16), 'nieve'), (0, 0, 0), (0, -1, 0))
    tunel = cortar(cono((0, 0, 8), (0, 0, 15), 6.0, 5.6, 'nieve'), (0, 0, 0), (0, -1, 0))
    boca = cortar(elip((0, 0, 20.4), (3.4, 4.2, 1.0), 'hoyo'), (0, 0, 0), (0, -1, 0))

    def ret(p, Pm, nm, nw):
        if p is cupula:
            # Los bloques: hiladas (rayas) y juntas alternas, no puntos.
            y = Pm[1]
            if (y % 3.6) < 0.55:
                return 'hielo'
            ang = math.atan2(Pm[2] + 2, Pm[0])
            fila = int(y // 3.6)
            if (((ang / (2 * math.pi)) * 18 + (fila % 2) * 0.5) % 1.0) < 0.07:
                return 'hielo'
        return None
    return [cupula, tunel, boca], ret, mats('nieve', 'hielo', 'hoyo')


def tronco_nevado():
    tronco = cono((-14, 3.2, 0), (14, 3.2, 1), 3.4, 3.0, 'madera')
    pr = [tronco,
          cortar(elip((-2, 6.2, 0.3), (12, 1.6, 2.6), 'nieve'), (0, 5.6, 0), (0, -1, 0)),
          cono((5, 4, 2.5), (8, 9, 4), 0.8, 0.5, 'madera_osc')]

    def ret(p, Pm, nm, nw):
        if p is tronco and abs(nm[0]) > 0.8:
            return 'madera_osc'                   # los cortes de los extremos
        return None
    return pr, ret, mats('madera', 'madera_osc', 'nieve')


def hoguera():
    pr = []
    for k in range(7):
        a = k / 7.0 * 2 * math.pi
        pr.append(roca((math.cos(a) * 7.5, 1.6, math.sin(a) * 5.8), (2.2, 1.6, 2.0), 'roca_fria', rot=giro_y(a)))
    pr.append(cono((-5, 1.6, -2), (5, 4.5, 2), 1.4, 1.2, 'madera_osc'))
    pr.append(cono((5, 1.6, -2), (-4, 4.5, 2), 1.4, 1.2, 'madera_osc'))
    pr.append(cortar(elip((0, 1.2, 0), (4.5, 1.6, 3.4), 'brasa'), (0, 0, 0), (0, -1, 0)))
    pr.append(cono((0, 2, 0), (0, 11, 0), 3.2, 0.3, 'llama'))
    pr.append(cono((1.6, 2, 0.5), (2.2, 7.5, 0.5), 1.8, 0.2, 'brasa'))
    return pr, None, mats('roca_fria', 'madera_osc', 'brasa', 'llama')


# ===========================================================================
# EL CATÁLOGO
# ===========================================================================
# nombre: (modelo, ancho, alto de la foto, filas bajo el apoyo, contorno,
#          huella que choca (ancho, alto) en px del juego, ancho de sombra,
#          vista (ángulo; 0 = de frente))
C_PIEDRA = contorno_de(hex_rgb('#6c6f78'))
C_HIERRO = (18, 18, 24)
C_ARENA = contorno_de(hex_rgb('#a57f4e'))
C_CACTUS = contorno_de(hex_rgb('#3f6a36'))
C_HIELO = contorno_de(hex_rgb('#5aa8d6'))
C_NIEVE = contorno_de(hex_rgb('#8ea4bd'))

CATALOGO = {
    'cementerio': {
        'lapida_redonda': (lambda: lapida_redonda(0), 32, 36, 6, C_PIEDRA, (30, 14), 34, 0.0),
        'lapida_alta': (lambda: lapida_redonda(2), 32, 40, 6, C_PIEDRA, (30, 14), 34, 0.0),
        'lapida_cruz': (lapida_cruz, 28, 40, 6, C_PIEDRA, (22, 14), 28, 0.0),
        'lapida_rota': (lapida_rota, 40, 30, 8, C_PIEDRA, (30, 14), 34, 0.0),
        'lapida_angel': (lapida_angel, 30, 50, 6, C_PIEDRA, (30, 16), 34, 0.0),
        'obelisco': (obelisco, 30, 62, 8, C_PIEDRA, (30, 18), 36, 0.0),
        'cripta': (cripta, 112, 124, 24, C_PIEDRA, (270, 104), 300, 0.0, 1.55),
        'verja': (verja, 40, 32, 4, C_HIERRO, (64, 10), 0, 0.0),
        'farola': (farola, 22, 50, 5, C_HIERRO, (14, 10), 16, 0.0),
        'ataud': (ataud, 36, 30, 10, contorno_de(hex_rgb('#4e3420')), (34, 20), 40, 0.0),
        'tumba_abierta': (tumba_abierta, 46, 40, 12, contorno_de(hex_rgb('#5a4632')), (40, 22), 46, 0.0),
        'estatua': (estatua, 30, 48, 8, C_PIEDRA, (28, 16), 32, 0.0),
    },
    'desierto': {
        'saguaro': (lambda: saguaro(2, 40), 34, 58, 6, C_CACTUS, (16, 10), 22, 0.0),
        'saguaro_bajo': (lambda: saguaro(1, 30), 30, 46, 6, C_CACTUS, (16, 10), 20, 0.0),
        'cactus_barril': (cactus_barril, 22, 26, 5, C_CACTUS, (22, 12), 24, 0.0),
        'nopal': (nopal, 30, 36, 5, C_CACTUS, (22, 10), 24, 0.0),
        'cactus_pequeno': (cactus_pequeno, 20, 24, 5, C_CACTUS, (12, 8), 14, 0.0),
        'roca_arenisca': (lambda: roca_arenisca(0), 40, 28, 8, C_ARENA, (40, 18), 44, 0.0),
        'roca_arenisca2': (lambda: roca_arenisca(1), 34, 30, 8, C_ARENA, (32, 16), 36, 0.0),
        'mesa_roca': (mesa_roca, 96, 70, 20, contorno_de(hex_rgb('#8a5232')), (150, 60), 170, 0.0),
        'columna_rota': (columna_rota, 34, 40, 8, C_ARENA, (22, 14), 28, 0.0),
        'arco_ruinas': (arco_ruinas, 56, 52, 8, C_ARENA, (84, 14), 90, 0.0),
        'obelisco_desierto': (obelisco_desierto, 22, 48, 6, C_ARENA, (22, 14), 26, 0.0),
        'costillas': (costillas, 64, 44, 16, contorno_de(hex_rgb('#b8ab90')), (24, 10), 0, 0.55),
        'craneo': (craneo, 30, 22, 8, contorno_de(hex_rgb('#b8ab90')), (24, 12), 26, 0.0),
        'tienda': (tienda, 44, 46, 12, contorno_de(hex_rgb('#9a8558')), (110, 50), 120, 0.0, 1.7),
        'vasija': (vasija, 18, 20, 5, contorno_de(hex_rgb('#7a3e22')), (16, 10), 16, 0.0),
    },
    'tundra': {
        'cristal_hielo': (lambda: cristal_hielo(False), 30, 36, 8, C_HIELO, (24, 12), 28, 0.0),
        'cristal_grande': (lambda: cristal_hielo(True), 48, 60, 12, C_HIELO, (44, 20), 50, 0.0),
        'roca_nevada': (lambda: roca_nevada(0), 36, 26, 8, C_NIEVE, (36, 16), 40, 0.0),
        'roca_nevada2': (lambda: roca_nevada(1), 30, 22, 8, C_NIEVE, (30, 14), 32, 0.0),
        'muneco_nieve': (muneco_nieve, 30, 40, 6, C_NIEVE, (22, 12), 24, 0.0),
        'iglu': (iglu, 46, 34, 12, C_NIEVE, (100, 46), 108, 0.0, 1.4),
        'tronco_nevado': (tronco_nevado, 40, 18, 6, contorno_de(hex_rgb('#4e3420')), (56, 12), 58, 0.0),
        'hoguera': (hoguera, 26, 20, 6, (24, 20, 18), (24, 12), 0, 0.0),
    },
}


def recortar(li, apoyo_x, apoyo_y):
    """Quita el margen vacío y dice dónde queda el apoyo dentro de lo que queda."""
    xs, ys = [], []
    for y in range(li.h):
        for x in range(li.w):
            if li.px[y * li.w + x][3]:
                xs.append(x); ys.append(y)
    if not xs:
        return li, apoyo_x, apoyo_y
    x0, x1, y0, y1 = max(0, min(xs) - 1), min(li.w - 1, max(xs) + 1), max(0, min(ys) - 1), min(li.h - 1, max(ys) + 1)
    from gf_arte import Lienzo
    out = Lienzo(x1 - x0 + 1, y1 - y0 + 1)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            out.px[(y - y0) * out.w + (x - x0)] = li.px[y * li.w + x]
    return out, apoyo_x - x0, apoyo_y - y0


def fotos(zona):
    """{nombre: {'foto': Lienzo, 'apoyo': (x, y) en px de la foto,
                 'huella': (w, h) en px del juego, 'sombra': ancho}}."""
    out = {}
    for nombre, ficha in CATALOGO[zona].items():
        fn, W, H, suelo, cont, huella, sombra, vista = ficha[:8]
        # Los grandes (la cripta, las tiendas, el iglú) van con el modelo
        # agrandado `k` veces: más píxeles, más detalle, la misma luz.
        k = ficha[8] if len(ficha) > 8 else 1.0
        W, H, suelo = int(round(W * k)), int(round(H * k)), suelo * k
        pr, ret, mt = fn()
        li = fotografiar(pr, W, H, vista, mt, ret, cont, k=k, suelo=suelo, salto=2.5)
        li, ax, ay = recortar(li, W / 2.0, H - suelo)
        out[nombre] = {'foto': li, 'apoyo': (ax, ay), 'huella': huella, 'sombra': sombra}
    return out
