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


# ===========================================================================
# LOS TRES MAPAS DE NIVEL 8, 9 Y 10                               (2026-10-25)
# ===========================================================================
# "Tres mapas nuevos: otro de hielo, una caverna (al entrar en la casa de la
# bruja del cementerio) y una pradera muy bonita, con árboles nuevos y demás
# ambiente." Los mismos modelos pequeños, la misma cámara y la misma luz en
# bandas. Sin motas ni racimos: las flores son pocas y GRANDES (bolas de
# hortensia, copas de tulipán en fila, la lavanda en banda), las texturas son
# rayas (anillos de estalagmita, paja, tablas) y los cristales, caras lisas.
MAT.update({
    # glaciar
    'runa_azul': {'emite': hex_rgb('#7fe6ff')},
    'piel_tienda': {'tonos': tonos('#86705a', arriba=0.3, abajo=0.55)},
    'piel_clara': {'tonos': tonos('#b8a284', arriba=0.25, abajo=0.5)},
    'colmillo': {'tonos': rampa(hex_rgb('#efe8d6'), 5, arriba=0.18, abajo=0.42)},
    'pizarra': {'tonos': tonos('#5f6b7a')},
    # caverna
    'roca_cueva': {'tonos': tonos('#5e5866')},
    'roca_cueva_o': {'tonos': tonos('#45404d', arriba=0.25, abajo=0.5)},
    'roca_cueva_c': {'tonos': tonos('#7d7787', arriba=0.28)},
    'amatista': {'tonos': rampa(hex_rgb('#a77ae6'), 5, arriba=0.45, abajo=0.5)},
    'amatista_luz': {'emite': hex_rgb('#ecd6ff')},
    'turquesa': {'tonos': rampa(hex_rgb('#4fd0c0'), 5, arriba=0.45, abajo=0.5)},
    'turquesa_luz': {'emite': hex_rgb('#d2fff6')},
    'seta_tallo': {'tonos': tonos('#d8cfc0', arriba=0.2, abajo=0.45)},
    'seta_gorro': {'tonos': rampa(hex_rgb('#4fb8a8'), 5, arriba=0.4, abajo=0.5)},
    'seta_luz': {'emite': hex_rgb('#a8fff0')},
    'hierro_vagon': {'tonos': tonos('#5a5e66', arriba=0.35, abajo=0.5)},
    'mineral_oro': {'tonos': rampa(hex_rgb('#e0b84a'), 5, arriba=0.4, abajo=0.5)},
    # pradera
    'hoja': {'tonos': tonos('#4f8f3a', arriba=0.3, abajo=0.55)},
    'hoja_osc': {'tonos': tonos('#3a6e2c', arriba=0.25, abajo=0.5)},
    'flor_azul': {'tonos': tonos('#7aa8e6', arriba=0.3, abajo=0.45)},
    'flor_lila': {'tonos': tonos('#b08ae0', arriba=0.3, abajo=0.45)},
    'flor_roja': {'tonos': tonos('#e05a4a', arriba=0.28, abajo=0.42)},
    'flor_blanca': {'tonos': rampa(hex_rgb('#f4efe6'), 5, arriba=0.15, abajo=0.32)},
    'lavanda': {'tonos': tonos('#9a7ad6', arriba=0.3, abajo=0.45)},
    'paja': {'tonos': tonos('#dcb85e', arriba=0.28, abajo=0.5)},
    'paja_osc': {'tonos': tonos('#b08a3a', arriba=0.25, abajo=0.5)},
    'madera_clara': {'tonos': tonos('#9a6e44')},
    'piedra_calida': {'tonos': tonos('#aaa08e')},
    'teja_roja': {'tonos': tonos('#a8503a')},
    'agua_pozo': {'tonos': rampa(hex_rgb('#4a7ab0'), 5, arriba=0.4, abajo=0.4), 'brillo': True},
    'liquen': {'tonos': tonos('#8aa860', arriba=0.25, abajo=0.5)},
    'lienzo': {'tonos': rampa(hex_rgb('#efe6d2'), 5, arriba=0.2, abajo=0.35)},
    # la casa de la bruja (cementerio)
    'madera_bruja': {'tonos': tonos('#4f3e36', arriba=0.28, abajo=0.5)},
    'tejado_bruja': {'tonos': tonos('#3d3948', arriba=0.3, abajo=0.5)},
    'ventana_bruja': {'emite': hex_rgb('#9dff7a')},
    'portal_bruja': {'emite': hex_rgb('#c79cff')},
    'caldero': {'tonos': tonos('#2e2e36', arriba=0.35, abajo=0.4)},
    'pocima': {'emite': hex_rgb('#a8ff5a')},
    'calabaza': {'tonos': tonos('#e07a2a', arriba=0.28, abajo=0.45)},
})


def _anillos(base, oscura, paso=4.0, grueso=1.0):
    """Anillos horizontales (estalagmitas, troncos): rayas, nunca puntos."""
    def ret(p, Pm, nm, nw):
        if p['mat'] == base and abs(nw[1]) < 0.7 and (Pm[1] % paso) < grueso:
            return oscura
        return None
    return ret


# ── GLACIAR ─────────────────────────────────────────────────────────────────
def seraque(v=0):
    """Una aguja de hielo del glaciar: tres placas inclinadas y la nieve al pie."""
    s = 1.0 if v == 0 else 0.8
    pr = [roca((0, 22 * s, 0), (5.0, 22 * s, 4.2), 'hielo', rot=giro_z(0.10) @ giro_y(0.4), bisel=0.6, arista=0.78),
          roca((-6, 13 * s, 3), (3.6, 13 * s, 3.4), 'hielo', rot=giro_z(0.32) @ giro_y(-0.3), bisel=0.6, arista=0.78),
          roca((6.5, 10 * s, 2), (3.4, 10 * s, 3.0), 'hielo', rot=giro_z(-0.36) @ giro_y(0.9), bisel=0.6, arista=0.78),
          cortar(elip((0, 0, 0), (11, 3.0, 8), 'nieve'), (0, 0, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'hielo' and nw[0] > 0.3:
            return 'hielo_hondo'
        if p['mat'] == 'hielo' and nw[1] > 0.8:
            return 'nieve'
        return None
    return pr, ret, mats('hielo', 'hielo_hondo', 'nieve')


def bloque_hielo():
    pr = [roca((0, 9, 0), (12, 9, 9), 'hielo', rot=giro_y(0.35), bisel=0.7, arista=0.85),
          roca((9, 4, 6), (5, 4, 4), 'hielo_hondo', rot=giro_y(-0.5), bisel=0.7, arista=0.85),
          cortar(elip((0, 17, 0), (11, 2.6, 8.4), 'nieve', rot=giro_y(0.35)), (0, 16.2, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'hielo' and abs(nw[1]) < 0.5 and (Pm[1] % 6.0) < 1.0:
            return 'hielo_hondo'                  # las capas del hielo viejo: rayas
        return None
    return pr, ret, mats('hielo', 'hielo_hondo', 'nieve')


def arco_hielo():
    pr = [roca((-15, 13, 0), (5, 13, 5), 'hielo', rot=giro_z(0.08), bisel=0.65, arista=0.8),
          roca((15, 11, 0), (5, 11, 5), 'hielo', rot=giro_z(-0.1), bisel=0.65, arista=0.8)]
    for k in range(7):
        a = math.pi * (k + 0.5) / 7.0
        pr.append(roca((-math.cos(a) * 15, 24 + math.sin(a) * 10, 0), (4.4, 3.6, 4.6), 'hielo', rot=giro_z(-math.cos(a) * 0.9), bisel=0.65, arista=0.8))
    pr.append(cortar(elip((0, 36, 0), (17, 2.6, 5.2), 'nieve'), (0, 35, 0), (0, -1, 0)))
    for x in (-15, 15):
        pr.append(cortar(elip((x, 0, 0), (8, 2.4, 7), 'nieve'), (x, 0, 0), (0, -1, 0)))

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'hielo' and nw[0] > 0.35:
            return 'hielo_hondo'
        return None
    return pr, ret, mats('hielo', 'hielo_hondo', 'nieve')


def trineo():
    rot = giro_y(0.3)
    pr = []
    for z in (-4.5, 4.5):
        pr.append(caja((0, 1.0, z), (11, 0.6, 0.6), 'madera_osc', rot=rot))
        pr.append(cono((10.5, 1.0, z), (13, 4.5, z * 1.0), 0.6, 0.5, 'madera_osc'))
    pr.append(caja((-0.5, 3.4, 0), (10, 0.8, 5.4), 'madera', rot=rot))
    fardo = caja((-2, 6.4, 0), (7, 2.4, 4.4), 'piel_tienda', rot=rot)
    pr.append(fardo)
    pr.append(cono((-8, 4, -4.6), (-10, 9, -4.6), 0.5, 0.5, 'madera_osc'))

    def ret(p, Pm, nm, nw):
        if p is fardo and (Pm[0] % 3.0) < 0.6:
            return 'piel_clara'                   # las cuerdas del fardo: rayas
        if p['mat'] == 'madera' and nw[1] > 0.6 and (Pm[2] % 2.2) < 0.4:
            return 'madera_osc'                   # las tablas
        return None
    return pr, ret, mats('madera', 'madera_osc', 'piel_tienda', 'piel_clara')


def tienda_pieles():
    lona = cono((0, 0, 0), (0, 32, 0), 17, 1.0, 'piel_tienda')
    puerta = cortar(cono((0, 0, 9), (0, 16, 5), 6, 1.5, 'hoyo'), (0, 0, 0), (0, -1, 0))
    pr = [lona, puerta]
    for a in (0.3, 1.5, 2.6, 3.8, 5.0):
        pr.append(cono((math.cos(a) * 2, 28, math.sin(a) * 2), (math.cos(a) * 4.5, 38, math.sin(a) * 4.5), 0.6, 0.5, 'madera_osc'))

    def ret(p, Pm, nm, nw):
        if p is lona:
            if (Pm[1] % 7.0) < 1.1:
                return 'piel_clara'               # las costuras de las pieles: anillos
            ang = math.atan2(Pm[2], Pm[0])
            if ((ang / (2 * math.pi)) * 6) % 1.0 < 0.06:
                return 'madera_osc'
        return None
    return pr, ret, mats('piel_tienda', 'piel_clara', 'madera_osc', 'hoyo')


def esqueleto_mamut():
    """Los huesos de un mamut que asoman de la nieve: cráneo, colmillos curvos y costillas."""
    pr = [elip((12, 8, 0), (7, 7, 6.4), 'hueso'),
          cortar(elip((0, 0, 0), (26, 3.0, 11), 'nieve'), (0, 0, 0), (0, -1, 0))]
    for sg in (1, -1):
        pts = [(16, 6, 3.2 * sg), (21, 3, 5 * sg), (25, 4, 7 * sg), (27, 9, 7.5 * sg), (25, 13, 6 * sg)]
        for (a, b) in zip(pts, pts[1:]):
            pr.append(cono(a, b, 1.7, 1.3, 'colmillo'))
    for x in (-14, -8, -2, 4):
        alto = 12 - abs(x + 5) * 0.2
        for sg in (1, -1):
            pr.append(cono((x, 1, sg * 8), (x + 1, alto, sg * 4.5), 1.3, 1.0, 'hueso'))
            pr.append(cono((x + 1, alto, sg * 4.5), (x + 1.5, alto + 3, sg * 0.8), 1.0, 0.6, 'hueso'))
    pr.append(cortar(cono((-20, 1.5, 0), (8, 2.0, 0), 1.8, 1.6, 'hueso'), (0, 0, 0), (0, -1, 0)))
    return pr, None, mats('hueso', 'colmillo', 'nieve')


def estatua_hielo():
    """Un caballero de hielo sobre su peana, con la espada clavada delante."""
    pr = [caja((0, 2.6, 0), (8, 2.6, 7), 'pizarra'),
          caja((0, 6, 0), (6.5, 1.0, 5.6), 'nieve'),
          cono((0, 6.5, 0), (0, 23, 0), 5.4, 4.0, 'hielo'),
          elip((0, 26, 0.3), (3.0, 3.2, 3.0), 'hielo'),
          cono((0, 28.5, 0.3), (0, 31.5, 0.3), 2.2, 0.5, 'hielo_hondo'),
          caja((0, 12, 5.4), (0.6, 7, 0.4), 'hielo_hondo'),
          caja((0, 18.5, 5.4), (2.6, 0.5, 0.6), 'hielo_hondo')]
    for sg in (1, -1):
        pr.append(cono((4.4 * sg, 20, 1), (3.2 * sg, 14, 4.6), 1.6, 1.2, 'hielo'))

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'hielo' and nw[0] > 0.45:
            return 'hielo_hondo'
        return None
    return pr, ret, mats('pizarra', 'nieve', 'hielo', 'hielo_hondo')


def poste_runas():
    poste = caja((0, 16, 0), (3.6, 16, 3.6), 'pizarra', bisel=0.85, arista=0.92)
    pr = [caja((0, 1.6, 0), (6, 1.6, 6), 'roca_fria'), poste,
          roca((0, 34, 0), (3.0, 2.6, 3.0), 'pizarra', rot=giro_y(math.pi / 4), bisel=0.7, arista=0.82),
          cortar(elip((0, 3.4, 0), (6.4, 1.6, 6.4), 'nieve'), (0, 3, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p is poste and nm[2] > 0.7 and abs(Pm[0] + math.sin(Pm[1] / 3.0) * 1.2) < 0.8 and 5 < Pm[1] < 29:
            return 'runa_azul'                    # la runa: UNA línea que serpentea y brilla
        return None
    return pr, ret, mats('roca_fria', 'pizarra', 'nieve', 'runa_azul')


# ── CAVERNA ─────────────────────────────────────────────────────────────────
def estalagmita(alto=34, r=6.0):
    pr = [cono((0, 0, 0), (0, alto * 0.6, 0), r, r * 0.55, 'roca_cueva'),
          cono((0, alto * 0.55, 0), (0.6, alto, 0.2), r * 0.6, 0.35, 'roca_cueva'),
          cortar(elip((0, 0, 0), (r + 3, 1.8, r + 2), 'roca_cueva_o'), (0, 0, 0), (0, -1, 0))]
    return pr, _anillos('roca_cueva', 'roca_cueva_c', paso=5.0, grueso=1.0), mats('roca_cueva', 'roca_cueva_o', 'roca_cueva_c')


def estalagmitas():
    pr = []
    for (x, z, alto, r) in ((-7, -1, 30, 5.0), (3, 1, 22, 4.4), (10, -2, 14, 3.4)):
        pr.append(cono((x, 0, z), (x, alto * 0.6, z), r, r * 0.55, 'roca_cueva'))
        pr.append(cono((x, alto * 0.55, z), (x + 0.5, alto, z), r * 0.6, 0.3, 'roca_cueva'))
    pr.append(cortar(elip((0, 0, 0), (17, 1.8, 7), 'roca_cueva_o'), (0, 0, 0), (0, -1, 0)))
    return pr, _anillos('roca_cueva', 'roca_cueva_c', paso=5.0, grueso=1.0), mats('roca_cueva', 'roca_cueva_o', 'roca_cueva_c')


def columna_cueva():
    """Una columna de la cueva: estalagmita y estalactita que se juntaron."""
    pr = [roca((0, 10, 0), (11, 10, 9), 'roca_cueva', rot=giro_y(0.3), bisel=0.82, arista=0.9),
          roca((1, 28, 0), (8.5, 10, 7), 'roca_cueva', rot=giro_y(-0.2), bisel=0.82, arista=0.9),
          cortar(roca((0, 44, 0), (7, 9, 6), 'roca_cueva', rot=giro_y(0.5), bisel=0.8, arista=0.9), (0, 50, 0), (0.35, 1, 0.1)),
          roca((-9, 4, 6), (4, 4, 3.4), 'roca_cueva_o', rot=giro_y(0.7)),
          cortar(elip((0, 0, 0), (14, 2.0, 11), 'roca_cueva_o'), (0, 0, 0), (0, -1, 0))]
    return pr, _anillos('roca_cueva', 'roca_cueva_c', paso=6.0, grueso=1.2), mats('roca_cueva', 'roca_cueva_o', 'roca_cueva_c')


def cristal_cueva(color='amatista', grande=False):
    k = 1.7 if grande else 1.0
    luz = color + '_luz'
    pr = [roca((0, 12 * k, 0), (3.0 * k, 12 * k, 3.0 * k), color, rot=giro_z(0.1) @ giro_y(0.5), bisel=0.6, arista=0.78),
          roca((-5.5 * k, 7.5 * k, 2 * k), (2.3 * k, 7.5 * k, 2.3 * k), color, rot=giro_z(0.5) @ giro_y(0.1), bisel=0.6, arista=0.78),
          roca((5 * k, 6 * k, 2.5 * k), (2.1 * k, 6 * k, 2.1 * k), color, rot=giro_z(-0.55) @ giro_y(1.0), bisel=0.6, arista=0.78),
          cortar(elip((0, 0, 0), (9 * k, 2.4 * k, 7 * k), 'roca_cueva_o'), (0, 0, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        # El corazón que brilla: una banda por el centro de cada cara de delante.
        if p['mat'] == color and nm[2] > 0.55 and abs(_local(p, Pm[None, :])[0][0]) < 0.9 * k:
            return luz
        return None
    return pr, ret, mats(color, luz, 'roca_cueva_o')


def seta_brillante():
    pr = []
    for (x, z, alto, r) in ((-3, 0, 9, 4.2), (4, 1.5, 6, 3.0)):
        pr.append(cono((x, 0, z), (x, alto, z), 1.2, 1.0, 'seta_tallo'))
        pr.append(cortar(elip((x, alto, z), (r, 2.6, r), 'seta_gorro'), (x, alto - 0.3, z), (0, -1, 0)))
        pr.append(elip((x, alto - 0.4, z), (r * 0.85, 0.45, r * 0.85), 'seta_luz'))
    return pr, None, mats('seta_tallo', 'seta_gorro', 'seta_luz')


def roca_cueva(v=0):
    if v == 0:
        pr = [roca((0, 8, 0), (12, 8, 9), 'roca_cueva', rot=giro_y(0.4)),
              roca((9, 4, 6), (5, 4, 4), 'roca_cueva_o', rot=giro_y(-0.4))]
    else:
        pr = [roca((0, 10, 0), (8, 10, 7), 'roca_cueva', rot=giro_y(-0.3)),
              roca((-8, 3.5, 4), (5, 3.5, 4), 'roca_cueva_o', rot=giro_y(0.6))]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'roca_cueva' and nw[1] > 0.7:
            return 'roca_cueva_c'                 # lo de arriba, con luz
        return None
    return pr, ret, mats('roca_cueva', 'roca_cueva_o', 'roca_cueva_c')


def vagoneta():
    rot = giro_y(0.35)
    cuerpo = caja((0, 7, 0), (9, 4.6, 6), 'hierro_vagon', rot=rot)
    pr = [cuerpo]
    for x in (-5.5, 5.5):
        for z in (-6.2, 6.2):
            q = rot @ np.array([x, 0, z])
            pr.append(cono((q[0], 2.4, q[2] - 0.6), (q[0], 2.4, q[2] + 0.6), 2.4, 2.4, 'madera_osc'))
    for (x, z, r) in ((-3, -1, 3.0), (2, 1.5, 3.4), (4, -2, 2.6)):
        q = rot @ np.array([x, 0, z])
        pr.append(roca((q[0], 11.6, q[2]), (r, r * 0.8, r), 'mineral_oro', rot=giro_y(x)))

    def ret(p, Pm, nm, nw):
        if p is cuerpo and abs(nw[1]) < 0.6 and (Pm[1] % 3.4) < 0.7:
            return 'madera_osc'                   # los flejes del vagón: rayas
        return None
    return pr, ret, mats('hierro_vagon', 'madera_osc', 'mineral_oro')


def brasero():
    pr = [cono((0, 0, 0), (0, 14, 0), 0.9, 0.9, 'hierro')]
    for a in (0.5, 2.6, 4.7):
        pr.append(cono((math.cos(a) * 5, 0, math.sin(a) * 4), (0, 12, 0), 0.7, 0.6, 'hierro'))
    pr.append(cortar(elip((0, 15.5, 0), (6, 3.4, 5), 'hierro'), (0, 15.6, 0), (0, 1, 0)))
    pr.append(cortar(elip((0, 15.8, 0), (5, 1.6, 4.2), 'brasa'), (0, 14.8, 0), (0, -1, 0)))
    pr.append(cono((0, 16, 0), (0, 25, 0), 3.0, 0.3, 'llama'))
    return pr, None, mats('hierro', 'brasa', 'llama')


def huesos():
    pr = [elip((0, 3.6, 0), (4.2, 3.6, 3.6), 'hueso'),
          elip((3.2, 2.2, 0.4), (2.6, 1.8, 2.2), 'hueso'),
          cono((-9, 1.2, 3), (1, 1.2, 6), 1.0, 1.0, 'hueso'),
          cono((4, 1.0, 5), (12, 1.0, 1), 0.9, 0.9, 'hueso')]
    return pr, None, mats('hueso')


def cofre_viejo():
    rot = giro_y(0.25)
    caja_ = caja((0, 4, 0), (8, 4, 5.4), 'madera', rot=rot)
    tapa = cortar(elip((0, 8, 0), (8, 3.4, 5.4), 'madera_osc', rot=rot), (0, 8, 0), (0, -1, 0))
    pr = [caja_, tapa, caja((0, 6, 5.6), (1.2, 1.4, 0.4), 'oro_viejo', rot=rot)]

    def ret(p, Pm, nm, nw):
        if p['mat'] in ('madera', 'madera_osc') and abs(Pm[0] - 0) % 5.0 < 0.8:
            return 'hierro'                       # los flejes: rayas
        return None
    return pr, ret, mats('madera', 'madera_osc', 'oro_viejo', 'hierro')


def salida_cueva():
    """La subida al cementerio: un montículo de roca con su boca y los
    escalones de piedra que suben hacia la luz."""
    pr = [roca((0, 16, -6), (30, 16, 14), 'roca_cueva', rot=giro_y(0.05), bisel=0.78, arista=0.9),
          roca((-24, 10, 4), (10, 10, 10), 'roca_cueva', rot=giro_y(0.5)),
          roca((24, 9, 4), (10, 9, 10), 'roca_cueva', rot=giro_y(-0.5))]
    boca = cortar(elip((0, 0, 7.5), (11, 20, 3), 'hoyo'), (0, 0, 0), (0, -1, 0))
    pr.append(boca)
    for k in range(4):
        pr.append(caja((0, 1.0 + k * 3.2, 12 - k * 2.8), (9 - k * 0.6, 1.0, 1.6), 'piedra_clara'))
    luz = cortar(elip((0, 14, 6.2), (5.5, 9, 1.0), 'luz_farol'), (0, 0, 0), (0, -1, 0))
    pr.append(luz)

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'roca_cueva' and nw[1] > 0.72:
            return 'roca_cueva_c'
        return None
    return pr, ret, mats('roca_cueva', 'roca_cueva_c', 'hoyo', 'piedra_clara', 'luz_farol')


# ── PRADERA ─────────────────────────────────────────────────────────────────
def hortensia(flor='flor_rosa'):
    # Las flores son UNA masa grande sobre la mata (dos lóbulos que se
    # funden), no bolitas sueltas: nada de racimos.
    pr = [elip((0, 6, 0), (12, 6.5, 8.5), 'hoja'),
          elip((-6, 5, 3), (6, 5, 5), 'hoja'), elip((6, 5, 2), (6.5, 5, 5), 'hoja'),
          elip((-2.5, 10.5, 1.5), (7.5, 4.2, 6.0), flor), elip((4, 10.0, 2.5), (6.0, 3.8, 5.0), flor)]

    def ret(p, Pm, nm, nw):
        if p['mat'] == 'hoja' and nw[1] < 0.1:
            return 'hoja_osc'
        return None
    return pr, ret, mats('hoja', 'hoja_osc', flor)


def tulipanes(colores=('flor_roja', 'flor_amarilla', 'flor_rosa', 'flor_blanca')):
    pr = []
    for k, c in enumerate(colores):
        x, z = -11 + k * 7.4, (k % 2) * 2.0 - 1.0
        alto = 9 + (k % 3)
        pr.append(cono((x, 0, z), (x, alto, z), 0.5, 0.45, 'hoja_osc'))
        pr.append(elip((x - 2.0, 3.6, z), (1.3, 3.8, 0.8), 'hoja', rot=giro_z(0.35)))
        pr.append(cortar(elip((x, alto + 1.8, z), (2.8, 3.4, 2.8), c), (x, alto + 3.9, z), (0, 1, 0)))
    return pr, None, mats('hoja', 'hoja_osc', *colores)


def lavanda():
    base = elip((0, 3.4, 0), (17, 3.6, 4.4), 'hoja')
    flor = elip((0, 7.6, 0), (16, 2.6, 3.6), 'lavanda')
    pr = [base, flor]

    def ret(p, Pm, nm, nw):
        if p is flor and (Pm[0] % 4.0) < 0.7:
            return 'flor_lila'                    # las espigas: rayas verticales
        return None
    return pr, ret, mats('hoja', 'lavanda', 'flor_lila')


def pajar():
    monton = cortar(elip((0, 0, 0), (13, 16, 11), 'paja'), (0, 0, 0), (0, -1, 0))
    pr = [monton, cono((0, 15, 0), (0, 20, 0), 1.4, 0.6, 'madera_osc')]

    def ret(p, Pm, nm, nw):
        if p is monton and (Pm[1] % 3.2) < 0.7:
            return 'paja_osc'                     # la paja en hiladas: rayas
        return None
    return pr, ret, mats('paja', 'paja_osc', 'madera_osc')


def valla():
    pr = [caja((0, 5, 0), (16, 0.9, 0.7), 'madera_clara'), caja((0, 10, 0), (16, 0.9, 0.7), 'madera_clara')]
    for x in (-15, 0, 15):
        pr.append(caja((x, 6.5, 0.4), (1.4, 6.5, 1.4), 'madera'))
    return pr, None, mats('madera', 'madera_clara')


def molino():
    torre = cono((0, 0, 0), (0, 44, 0), 13, 9, 'piedra_calida')
    pr = [torre, cono((0, 43, 0), (0, 58, 0), 11, 1.0, 'teja_roja'),
          caja((0, 8, 12.4), (3.4, 6, 0.6), 'puerta'),
          cono((0, 44, 10), (0, 44, 14), 1.4, 1.4, 'madera_osc')]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c = (math.cos(a) * 12, 44 + math.sin(a) * 12, 14.5)
        aspa = caja(c, (11, 2.4, 0.4), 'lienzo', rot=giro_z(a))
        pr.append(aspa)
        pr.append(cono((0, 44, 14.5), (math.cos(a) * 23, 44 + math.sin(a) * 23, 14.5), 0.5, 0.5, 'madera_osc'))

    def ret(p, Pm, nm, nw):
        if p is torre and abs(nw[1]) < 0.6 and (Pm[1] % 5.0) < 0.9:
            return 'piedra'                       # las hiladas de piedra
        if p['mat'] == 'lienzo':
            q = _local(p, Pm[None, :])[0]
            if (q[0] % 3.6) < 0.6:
                return 'madera_osc'               # el bastidor de las aspas
        return None
    return pr, ret, mats('piedra_calida', 'piedra', 'teja_roja', 'puerta', 'madera_osc', 'lienzo')


def pozo():
    aro = cortar(elip((0, 2, 0), (8, 7, 7), 'piedra_calida'), (0, 7, 0), (0, 1, 0))
    pr = [aro, cortar(elip((0, 7.0, 0), (6.2, 0.6, 5.2), 'agua_pozo'), (0, 7.2, 0), (0, 1, 0))]
    for x in (-7, 7):
        pr.append(caja((x, 12, 0), (0.9, 6, 0.9), 'madera'))
    pr.append(caja((-3.6, 19.4, 0), (5, 0.9, 7.4), 'teja_roja', rot=giro_z(0.5)))
    pr.append(caja((3.6, 19.4, 0), (5, 0.9, 7.4), 'teja_roja', rot=giro_z(-0.5)))
    pr.append(cono((-7, 14, 0), (7, 14, 0), 0.6, 0.6, 'madera_osc'))

    def ret(p, Pm, nm, nw):
        if p is aro and abs(nw[1]) < 0.6 and (Pm[1] % 2.6) < 0.5:
            return 'piedra'
        return None
    return pr, ret, mats('piedra_calida', 'piedra', 'agua_pozo', 'madera', 'teja_roja', 'madera_osc')


def carreta():
    rot = giro_y(0.3)
    cuerpo = caja((0, 7, 0), (11, 3.4, 6), 'madera_clara', rot=rot)
    pr = [cuerpo, cortar(elip((0, 10, 0), (10, 4.4, 5.6), 'paja', rot=rot), (0, 9.6, 0), (0, -1, 0))]
    for sg in (1, -1):
        q = rot @ np.array([0, 0, 6.6 * sg])
        pr.append(cono((q[0], 4.6, q[2] - 0.5 * sg), (q[0], 4.6, q[2] + 0.5 * sg), 4.6, 4.6, 'madera_osc'))
        q2 = rot @ np.array([11, 0, 3.5 * sg])
        q3 = rot @ np.array([22, 0, 3.0 * sg])
        pr.append(cono((q2[0], 6, q2[2]), (q3[0], 3, q3[2]), 0.6, 0.5, 'madera'))

    def ret(p, Pm, nm, nw):
        if p is cuerpo and abs(nw[1]) < 0.6 and (Pm[1] % 2.4) < 0.5:
            return 'madera'
        return None
    return pr, ret, mats('madera', 'madera_clara', 'madera_osc', 'paja')


def menhir(v=0):
    alto = 30 if v == 0 else 22
    piedra_ = roca((0, alto / 2.0, 0), (5.5, alto / 2.0, 4.0), 'piedra_calida', rot=giro_y(0.3 + v) @ giro_z(0.06), bisel=0.8, arista=0.9)
    pr = [piedra_, cortar(elip((0, 0, 0), (8, 1.6, 6), 'hoja'), (0, 0, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p is piedra_ and nw[1] > 0.55:
            return 'liquen'
        if p is piedra_ and nm[2] > 0.7 and abs(Pm[0] + math.sin(Pm[1] / 2.6) * 1.4) < 0.7 and 6 < Pm[1] < alto - 6:
            return 'runa_azul'                    # el trazo antiguo: UNA línea que brilla
        return None
    return pr, ret, mats('piedra_calida', 'liquen', 'hoja', 'runa_azul')


def roca_musgo():
    pr = [roca((0, 7, 0), (11, 7, 8), 'piedra_calida', rot=giro_y(0.5)),
          roca((8, 3.5, 5), (5, 3.5, 4), 'piedra_calida', rot=giro_y(-0.3))]

    def ret(p, Pm, nm, nw):
        if nw[1] > 0.6:
            return 'musgo'
        return None
    return pr, ret, mats('piedra_calida', 'musgo')


def tronco_musgo():
    tronco = cono((-14, 3.6, 0), (14, 3.4, 1), 3.8, 3.4, 'madera')
    pr = [tronco, cono((4, 4, 3), (8, 10, 4), 0.9, 0.6, 'madera_osc'),
          cortar(elip((-3, 6.6, 0.3), (10, 1.8, 2.8), 'musgo'), (0, 6.0, 0), (0, -1, 0))]

    def ret(p, Pm, nm, nw):
        if p is tronco and abs(nm[0]) > 0.8:
            return 'madera_osc'
        return None
    return pr, ret, mats('madera', 'madera_osc', 'musgo')


def banco():
    rot = giro_y(0.0)
    pr = [caja((0, 5, 0), (12, 0.8, 3.0), 'madera_clara', rot=rot), caja((0, 9, -2.6), (12, 2.4, 0.6), 'madera_clara', rot=rot)]
    for x in (-10, 10):
        pr.append(caja((x, 2.4, 0), (0.9, 2.4, 2.6), 'madera_osc'))
    return pr, None, mats('madera_clara', 'madera_osc')


def farol_jardin():
    pr = [caja((0, 1.0, 0), (3.0, 1.0, 3.0), 'piedra_calida'),
          cono((0, 1.5, 0), (0, 22, 0), 0.9, 0.8, 'madera_osc'),
          caja((0, 25, 0), (2.8, 3.4, 2.8), 'madera_osc'),
          caja((0, 25, 0), (2.2, 2.6, 2.9), 'luz_farol'),
          cono((0, 28.4, 0), (0, 31.5, 0), 3.4, 0.4, 'teja_roja')]
    return pr, None, mats('piedra_calida', 'madera_osc', 'luz_farol', 'teja_roja')


def cenador():
    # (Un `cono` es una cápsula: con radio grande y poco largo sale una
    # cúpula. Las bases planas van con elipsoides recortados.)
    pr = [cortar(elip((0, 0, 0), (19, 2.2, 15), 'piedra'), (0, 1.6, 0), (0, 1, 0))]
    for k in range(6):
        a = k / 6.0 * math.tau + 0.26
        pr.append(cono((math.cos(a) * 15, 1.5, math.sin(a) * 12), (math.cos(a) * 15, 23, math.sin(a) * 12), 1.3, 1.2, 'madera'))
    techo = cortar(cono((0, 24, 0), (0, 35, 0), 18, 1.0, 'teja_roja'), (0, 22.5, 0), (0, -1, 0))
    pr.append(techo)
    pr.append(elip((0, 37, 0), (1.6, 1.6, 1.6), 'oro_viejo'))

    def ret(p, Pm, nm, nw):
        if p is techo:
            ang = math.atan2(Pm[2], Pm[0])
            if ((ang / (2 * math.pi)) * 12) % 1.0 < 0.1:
                return 'madera_osc'               # las aristas del tejado
        return None
    return pr, ret, mats('piedra', 'madera', 'teja_roja', 'madera_osc', 'oro_viejo')


def fuente():
    vaso = cortar(elip((0, 1, 0), (17, 6, 13), 'piedra_calida'), (0, 5, 0), (0, 1, 0))
    pr = [vaso, cortar(elip((0, 5.0, 0), (14.5, 0.6, 10.8), 'agua_pozo'), (0, 5.2, 0), (0, 1, 0)),
          cono((0, 4, 0), (0, 13, 0), 2.2, 1.8, 'piedra_calida'),
          cortar(elip((0, 13.4, 0), (6, 2.6, 5), 'piedra_calida'), (0, 14, 0), (0, 1, 0)),
          cortar(elip((0, 14.0, 0), (4.8, 0.5, 3.8), 'agua_pozo'), (0, 14.2, 0), (0, 1, 0)),
          cono((0, 14.4, 0), (0, 19, 0), 0.9, 0.3, 'agua_pozo')]

    def ret(p, Pm, nm, nw):
        if p is vaso and abs(nw[1]) < 0.6 and (Pm[1] % 2.6) < 0.5:
            return 'piedra'
        return None
    return pr, ret, mats('piedra_calida', 'piedra', 'agua_pozo')


# ── LA CASA DE LA BRUJA (en el cementerio: la entrada a la caverna) ──────────
def casa_bruja():
    """La casa torcida de la bruja: paredes de tablas oscuras, el tejado
    picudo y caído, la chimenea que echa luz verde, la ventana redonda
    encendida, el caldero y una calabaza; y la PUERTA abierta, con la luz
    violeta de la caverna que hay debajo."""
    pr = []
    cuerpo = caja((0, 16, 0), (22, 16, 15), 'madera_bruja', rot=giro_z(0.03))
    pr.append(cuerpo)
    pr.append(caja((0, 1.6, 2), (25, 1.6, 18), 'piedra_osc'))
    # El tejado: la cumbrera va de lado a lado; se ve el faldón de delante con
    # sus hileras (rayas horizontales), algo torcido.
    tejas = []
    for sg in (1, -1):
        t = caja((0, 38, sg * 9.5), (26, 1.8, 13), 'tejado_bruja', rot=giro_x(sg * 0.72) @ giro_z(0.04))
        tejas.append(t)
        pr.append(t)
    pr.append(cono((0, 46, 0), (-5, 62, -3), 4.4, 0.6, 'tejado_bruja'))            # la punta, caída hacia atrás
    pr.append(caja((13, 44, -8), (3.4, 9, 3.4), 'piedra_osc'))                      # chimenea
    pr.append(cono((13, 53, -8), (14, 60, -8), 2.4, 0.8, 'pocima'))                 # el humo verde (luz)
    pr.append(caja((0, 11.5, 15.3), (7.6, 11.5, 0.5), 'madera_osc'))            # el marco
    puerta = caja((0, 10.5, 15.6), (6.0, 10.5, 0.5), 'portal_bruja')
    pr.append(puerta)
    pr.append(caja((0, 23, 15.6), (8.2, 1.2, 0.8), 'madera_osc'))                   # dintel
    pr.append(cortar(elip((-13, 22, 15.2), (4.0, 4.0, 0.8), 'ventana_bruja'), (-13, 22, 15.0), (0, 0, -1)))
    pr.append(cortar(elip((13, 20, 15.2), (3.2, 3.6, 0.8), 'ventana_bruja'), (13, 20, 15.0), (0, 0, -1)))
    # El caldero, a la derecha de la puerta, y la calabaza a la izquierda.
    pr.append(cortar(elip((22, 5, 22), (6, 5, 5), 'caldero'), (22, 7.5, 22), (0, 1, 0)))
    pr.append(elip((22, 7.4, 22), (5, 0.6, 4.2), 'pocima'))
    for a in (0.6, 2.7, 4.8):
        pr.append(cono((22 + math.cos(a) * 4, 0, 22 + math.sin(a) * 3.4), (22 + math.cos(a) * 3, 3, 22 + math.sin(a) * 2.6), 0.6, 0.5, 'caldero'))
    calabaza = elip((-21, 4, 22), (5, 4, 4.6), 'calabaza')
    pr.append(calabaza)
    pr.append(cono((-21, 7.5, 22), (-20, 9.5, 22), 0.6, 0.4, 'madera_osc'))

    def ret(p, Pm, nm, nw):
        if p is cuerpo and abs(nw[1]) < 0.6:
            q = _local(p, Pm[None, :])[0]
            if (q[1] % 4.0) < 0.8:
                return 'madera_osc'               # las tablas: rayas
        if any(p is t for t in tejas):
            q = _local(p, Pm[None, :])[0]
            if (q[2] % 4.2) < 0.9:
                return 'piedra_osc'               # las hileras del tejado
        if p is calabaza:
            ang = math.atan2(Pm[2] - 22, Pm[0] + 21)
            if ((ang / (2 * math.pi)) * 8) % 1.0 < 0.14:
                return 'madera_osc'               # los gajos: rayas
        return None
    return pr, ret, mats('madera_bruja', 'madera_osc', 'piedra_osc', 'tejado_bruja', 'pocima', 'portal_bruja',
                         'ventana_bruja', 'caldero', 'calabaza')


C_CUEVA = contorno_de(hex_rgb('#45404d'))
C_MADERA = contorno_de(hex_rgb('#4e3420'))
C_HOJA = contorno_de(hex_rgb('#3a6e2c'))
C_PIEDRA_C = contorno_de(hex_rgb('#8a8070'))

CATALOGO['glaciar'] = {
    'seraque': (lambda: seraque(0), 40, 70, 8, C_HIELO, (30, 14), 36, 0.0),
    'seraque_bajo': (lambda: seraque(1), 36, 56, 8, C_HIELO, (26, 12), 30, 0.0),
    'bloque_hielo': (bloque_hielo, 40, 34, 8, C_HIELO, (40, 16), 44, 0.0),
    'arco_hielo': (arco_hielo, 52, 54, 8, C_HIELO, (70, 14), 70, 0.0),
    'trineo': (trineo, 40, 24, 8, C_MADERA, (40, 14), 40, 0.0),
    'tienda_pieles': (tienda_pieles, 44, 48, 12, contorno_de(hex_rgb('#5a4632')), (90, 44), 100, 0.0, 1.6),
    'hoguera': (hoguera, 26, 20, 6, (24, 20, 18), (24, 12), 0, 0.0),
    'esqueleto_mamut': (esqueleto_mamut, 70, 36, 14, contorno_de(hex_rgb('#b8ab90')), (60, 16), 70, 0.0),
    'estatua_hielo': (estatua_hielo, 30, 46, 6, C_HIELO, (26, 14), 30, 0.0),
    'poste_runas': (poste_runas, 22, 46, 6, C_NIEVE, (18, 12), 22, 0.0),
    'cristal_hielo': (lambda: cristal_hielo(False), 30, 36, 8, C_HIELO, (24, 12), 28, 0.0),
    'cristal_grande': (lambda: cristal_hielo(True), 48, 60, 12, C_HIELO, (44, 20), 50, 0.0),
    'roca_nevada': (lambda: roca_nevada(0), 36, 26, 8, C_NIEVE, (36, 16), 40, 0.0),
    'roca_nevada2': (lambda: roca_nevada(1), 30, 22, 8, C_NIEVE, (30, 14), 32, 0.0),
    'tronco_nevado': (tronco_nevado, 40, 18, 6, contorno_de(hex_rgb('#4e3420')), (56, 12), 58, 0.0),
}
CATALOGO['caverna'] = {
    'estalagmita': (estalagmita, 24, 46, 6, C_CUEVA, (14, 10), 18, 0.0),
    'estalagmita_baja': (lambda: estalagmita(22, 4.6), 20, 32, 6, C_CUEVA, (12, 8), 14, 0.0),
    'estalagmitas': (estalagmitas, 40, 40, 8, C_CUEVA, (36, 14), 40, 0.0),
    'columna_cueva': (columna_cueva, 34, 80, 8, C_CUEVA, (30, 16), 36, 0.0),
    'cristal_cueva': (lambda: cristal_cueva('amatista'), 30, 34, 8, contorno_de(hex_rgb('#6a4aa8')), (24, 12), 26, 0.0),
    'cristal_cueva_t': (lambda: cristal_cueva('turquesa'), 30, 34, 8, contorno_de(hex_rgb('#2a8a80')), (24, 12), 26, 0.0),
    'cristal_grande_cueva': (lambda: cristal_cueva('amatista', True), 48, 56, 12, contorno_de(hex_rgb('#6a4aa8')), (40, 18), 46, 0.0),
    'seta_brillante': (seta_brillante, 24, 20, 6, contorno_de(hex_rgb('#2a6a60')), (0, 0), 14, 0.0),
    'roca_cueva': (lambda: roca_cueva(0), 38, 28, 8, C_CUEVA, (38, 16), 42, 0.0),
    'roca_cueva2': (lambda: roca_cueva(1), 32, 30, 8, C_CUEVA, (30, 14), 34, 0.0),
    'vagoneta': (vagoneta, 36, 30, 8, contorno_de(hex_rgb('#3a3e46')), (36, 14), 38, 0.0),
    'brasero': (brasero, 22, 30, 5, (24, 20, 18), (16, 10), 16, 0.0),
    'huesos': (huesos, 30, 16, 6, contorno_de(hex_rgb('#b8ab90')), (0, 0), 0, 0.0),
    'cofre_viejo': (cofre_viejo, 26, 22, 6, C_MADERA, (22, 12), 24, 0.0),
    'salida_cueva': (salida_cueva, 76, 52, 14, C_CUEVA, (0, 0), 0, 0.0, 1.4),
}
CATALOGO['pradera'] = {
    'hortensia_rosa': (lambda: hortensia('flor_rosa'), 32, 24, 6, C_HOJA, (26, 10), 30, 0.0),
    'hortensia_azul': (lambda: hortensia('flor_azul'), 32, 24, 6, C_HOJA, (26, 10), 30, 0.0),
    'hortensia_lila': (lambda: hortensia('flor_lila'), 32, 24, 6, C_HOJA, (26, 10), 30, 0.0),
    'tulipanes': (tulipanes, 36, 20, 6, C_HOJA, (0, 0), 0, 0.0),
    'tulipanes2': (lambda: tulipanes(('flor_amarilla', 'flor_rosa', 'flor_blanca', 'flor_roja')), 36, 20, 6, C_HOJA, (0, 0), 0, 0.0),
    'lavanda': (lavanda, 40, 18, 6, C_HOJA, (0, 0), 0, 0.0),
    'pajar': (pajar, 32, 30, 6, contorno_de(hex_rgb('#8a6a2a')), (36, 14), 36, 0.0),
    'valla': (valla, 40, 20, 4, C_MADERA, (64, 8), 0, 0.0),
    'molino': (molino, 60, 76, 12, C_PIEDRA_C, (64, 30), 72, 0.0, 1.6),
    'pozo': (pozo, 26, 30, 6, C_PIEDRA_C, (34, 16), 32, 0.0),
    'carreta': (carreta, 50, 26, 8, C_MADERA, (48, 16), 50, 0.0),
    'menhir': (lambda: menhir(0), 22, 40, 6, C_PIEDRA_C, (20, 12), 22, 0.0),
    'menhir_bajo': (lambda: menhir(1), 22, 30, 6, C_PIEDRA_C, (18, 10), 20, 0.0),
    'roca_musgo': (roca_musgo, 36, 24, 8, C_PIEDRA_C, (34, 14), 38, 0.0),
    'tronco_musgo': (tronco_musgo, 40, 20, 6, C_MADERA, (56, 12), 58, 0.0),
    'banco': (banco, 32, 18, 6, C_MADERA, (32, 8), 30, 0.0),
    'farol_jardin': (farol_jardin, 16, 36, 4, C_MADERA, (10, 8), 12, 0.0),
    'cenador': (cenador, 50, 46, 10, C_PIEDRA_C, (84, 30), 90, 0.0, 1.5),
    'fuente': (fuente, 40, 28, 8, C_PIEDRA_C, (100, 40), 110, 0.0, 1.6),
}
# La casa de la bruja va en su propio atlas (Game/MAPAS/cementerio/casa_bruja):
# el del cementerio no se toca.
CATALOGO['cementerio_bruja'] = {
    'casa_bruja': (casa_bruja, 66, 76, 16, contorno_de(hex_rgb('#3a2e2a')), (150, 64), 170, 0.0, 1.5),
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
        # (2026-10-19) Lo que el dibujo baja por DEBAJO de su apoyo (el frente
        # de la base en perspectiva), en px del juego: la colisión lo cubre
        # (generar-zonas.py, poner_objeto) o el jugador se mete en la tienda.
        bajo = max(0, (li.h - ay)) * ESCALA
        out[nombre] = {'foto': li, 'apoyo': (ax, ay), 'huella': huella, 'sombra': sombra, 'bajo': bajo}
    return out
