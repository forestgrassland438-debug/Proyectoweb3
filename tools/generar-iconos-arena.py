# -*- coding: utf-8 -*-
"""
LOS ICONOS DE LA ARENA DE MASCOTAS                                (2026-11-15)

    python tools/generar-iconos-arena.py [nombre ...]  ->  Game/Source/arena/*.png  (128x128)

"El panel no es igual a los del juego, no tiene iconos originales… si
necesitas iconos, haz imágenes." El panel de la arena y su HUD llevaban
EMOJIS (🐾 🌲 ⚔ 🎯 🏆 🦴 💥 ☁): cada sistema los pinta a su manera, Windows 10
a medias, y ninguno se parece a los iconos del juego.

Estos se hacen con LA MISMA MANO que los de los botones redondos
(tools/generar-iconos-hud.py, de donde sale la clase Icono): contorno oscuro
del mismo grueso, la misma paleta (crema, oro, turquesa, rojo, violeta, verde,
cuero), la luz arriba a la izquierda y su sombra debajo. Se dibujan a 512 y
se reducen a 128.

  Panel:  arena · diarias · pvp · practica · ranking
  HUD:    hueso · ko · vivos · gas · reloj · super · ladrido · escudo ·
          rapidez · corazon · rendirse · listo · bot · buscar · exp · puntos
"""
import importlib.util
import math
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('iconos_hud', os.path.join(AQUI, 'generar-iconos-hud.py'))
H = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(H)

Icono, rr = H.Icono, H.rr
CREMA, CREMA_O = H.CREMA, H.CREMA_O
ORO, ORO_O, ORO_C = H.ORO, H.ORO_O, H.ORO_C
TURQ, TURQ_O = H.TURQ, H.TURQ_O
ROJO, ROJO_O = H.ROJO, H.ROJO_O
VIOLETA, VIOLETA_O = H.VIOLETA, H.VIOLETA_O
VERDE, VERDE_O = H.VERDE, H.VERDE_O
CUERO, CUERO_O = H.CUERO, H.CUERO_O
PLATA, PLATA_O = H.PLATA, H.PLATA_O
NOCHE = (24, 30, 46)
DESTINO = os.path.join(os.path.dirname(AQUI), 'Game', 'Source', 'arena')


def estrella(cx, cy, r_fuera, r_dentro, puntas=5, giro=-90):
    pts = []
    for i in range(puntas * 2):
        r = r_fuera if i % 2 == 0 else r_dentro
        a = math.radians(giro + i * 180.0 / puntas)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def huella(d, cx, cy, k=1.0):
    """Una huella de perro: la almohadilla y sus cuatro dedos."""
    d.ellipse((cx - 62 * k, cy - 10 * k, cx + 62 * k, cy + 92 * k), fill=255)
    for dx, dy, r in ((-86, -42, 30), (-34, -92, 32), (34, -92, 32), (86, -42, 30)):
        d.ellipse((cx + (dx - r) * k, cy + (dy - r) * k, cx + (dx + r) * k, cy + (dy + r) * k), fill=255)


def hueso_forma(d, x0, y0, x1, y1, grueso=34, bola=44):
    """Un hueso de (x0, y0) a (x1, y1): la caña y dos nudos en cada punta."""
    ang = math.atan2(y1 - y0, x1 - x0)
    nx, ny = -math.sin(ang) * grueso, math.cos(ang) * grueso
    d.polygon([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], fill=255)
    px, py = -math.sin(ang) * bola * 0.72, math.cos(ang) * bola * 0.72
    for (x, y) in ((x0, y0), (x1, y1)):
        for s in (1, -1):
            d.ellipse((x + px * s - bola, y + py * s - bola, x + px * s + bola, y + py * s + bola), fill=255)


# ───────────────────────────────────────────────────────────── el panel
def arena():
    """El emblema: un escudo con la huella."""
    ic = Icono()
    forma = [(256, 44), (430, 104), (430, 250), (256, 466), (82, 250), (82, 104)]
    ic.pieza(lambda d: d.polygon(forma, fill=255), ORO, ORO_O)
    dentro = [(256, 92), (386, 136), (386, 240), (256, 404), (126, 240), (126, 136)]
    ic.pieza(lambda d: d.polygon(dentro, fill=255), VIOLETA, VIOLETA_O)
    ic.pieza(lambda d: huella(d, 256, 248, 0.78), CREMA, CREMA_O, False)
    return ic


def diarias():
    """Las batallas del día: un calendario con la huella."""
    ic = Icono()
    ic.pieza(lambda d: rr(d, (72, 116, 440, 444), 44), CREMA, CREMA_O)
    ic.pieza(lambda d: rr(d, (72, 116, 440, 210), 40), ROJO, ROJO_O)
    for x in (150, 326):
        ic.pieza(lambda d, x=x: rr(d, (x, 66, x + 36, 156), 16), PLATA, PLATA_O)
    ic.pieza(lambda d: huella(d, 256, 330, 0.62), ORO, ORO_O, False)
    return ic


def pvp():
    """Jugador contra jugador: dos espadas cruzadas sobre un escudo redondo."""
    ic = Icono()
    ic.pieza(lambda d: d.ellipse((96, 96, 416, 416), fill=255), ROJO, ROJO_O)
    ic.pieza(lambda d: d.ellipse((150, 150, 362, 362), fill=255), CREMA, CREMA_O, False)

    def hoja(d, sentido):
        if sentido > 0:
            d.polygon([(96, 60), (140, 66), (356, 290), (324, 322)], fill=255)
        else:
            d.polygon([(416, 60), (372, 66), (156, 290), (188, 322)], fill=255)
    ic.pieza(lambda d: hoja(d, 1), PLATA, PLATA_O)
    ic.pieza(lambda d: hoja(d, -1), PLATA, PLATA_O)
    ic.pieza(lambda d: d.polygon([(288, 350), (366, 272), (390, 296), (312, 374)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon([(224, 350), (146, 272), (122, 296), (200, 374)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon([(346, 342), (370, 320), (432, 384), (410, 406)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.polygon([(166, 342), (142, 320), (80, 384), (102, 406)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.ellipse((412, 386, 456, 430), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((56, 386, 100, 430), fill=255), ORO, ORO_O)
    return ic


def practica():
    """Entrenar: una diana con un hueso clavado."""
    ic = Icono()
    ic.pieza(lambda d: d.ellipse((60, 92, 420, 452), fill=255), ROJO, ROJO_O)
    ic.pieza(lambda d: d.ellipse((120, 152, 360, 392), fill=255), CREMA, CREMA_O, False)
    ic.pieza(lambda d: d.ellipse((176, 208, 304, 336), fill=255), ROJO, ROJO_O, False)
    ic.pieza(lambda d: d.ellipse((216, 248, 264, 296), fill=255), ORO, ORO_O, False)
    ic.pieza(lambda d: hueso_forma(d, 262, 250, 408, 104, 20, 30), CREMA, CREMA_O)
    return ic


def ranking():
    """La clasificación: la copa."""
    ic = Icono()
    for x0, x1 in ((62, 190), (322, 450)):
        ic.pieza(lambda d, x0=x0, x1=x1: d.arc((x0, 96, x1, 252), 0, 360, fill=255, width=34), ORO_O, None, False)
    ic.pieza(lambda d: d.polygon([(140, 76), (372, 76), (348, 250), (286, 304), (226, 304), (164, 250)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: rr(d, (232, 296, 280, 372), 10), ORO, ORO_O)
    ic.pieza(lambda d: rr(d, (160, 366, 352, 432), 20), CUERO, CUERO_O)
    ic.pieza(lambda d: d.polygon(estrella(256, 176, 60, 26), fill=255), CREMA, None, False)
    return ic


# ───────────────────────────────────────────────────────────── el HUD
def hueso():
    ic = Icono()
    ic.pieza(lambda d: hueso_forma(d, 150, 362, 362, 150, 38, 54), CREMA, CREMA_O)
    return ic


def ko():
    """Un rival tumbado: el estallido del golpe."""
    ic = Icono()
    ic.pieza(lambda d: d.polygon(estrella(256, 256, 216, 124, 10, -90), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon(estrella(256, 256, 146, 82, 10, -72), fill=255), ROJO, ROJO_O, False)
    ic.pieza(lambda d: d.ellipse((206, 206, 306, 306), fill=255), CREMA, None, False)
    return ic


def vivos():
    """Los que quedan en pie: la huella."""
    ic = Icono()
    ic.pieza(lambda d: huella(d, 256, 250, 1.5), ORO, ORO_O)
    return ic


def gas():
    """El gas que entra: una nube verde con sus remolinos y tres vahos que caen.
    Sin burbujas ni gotas sueltas: nada de grupos de puntos (ver la nota de
    tripofobia en la memoria del proyecto)."""
    ic = Icono()

    def nube(d):
        d.ellipse((60, 166, 250, 356), fill=255)
        d.ellipse((150, 80, 370, 300), fill=255)
        d.ellipse((270, 160, 456, 346), fill=255)
        d.rounded_rectangle((120, 240, 400, 362), 60, fill=255)
    ic.pieza(nube, VERDE, VERDE_O)

    def remolinos(d):
        d.arc((146, 150, 334, 298), 196, 344, fill=255, width=26)
        d.arc((214, 226, 404, 330), 188, 330, fill=255, width=20)
    ic.pieza(remolinos, (190, 240, 150), None, False)

    def vahos(d):
        for x in (176, 256, 336):
            pts = [(x + 15 * math.sin(t / 5.0 * math.pi * 2), 384 + t * 17) for t in range(0, 6)]
            d.line(pts, fill=255, width=24, joint='curve')
            d.ellipse((pts[-1][0] - 12, pts[-1][1] - 12, pts[-1][0] + 12, pts[-1][1] + 12), fill=255)
            d.ellipse((pts[0][0] - 12, pts[0][1] - 12, pts[0][0] + 12, pts[0][1] + 12), fill=255)
    ic.pieza(vahos, VERDE, VERDE_O)
    return ic


def reloj():
    ic = Icono()
    ic.pieza(lambda d: rr(d, (226, 40, 286, 110), 16), PLATA, PLATA_O)
    ic.pieza(lambda d: d.polygon([(352, 110), (396, 76), (424, 110), (384, 146)], fill=255), PLATA, PLATA_O)
    ic.pieza(lambda d: d.ellipse((76, 100, 436, 460), fill=255), PLATA, PLATA_O)
    ic.pieza(lambda d: d.ellipse((120, 144, 392, 416), fill=255), CREMA, CREMA_O, False)
    ic.pieza(lambda d: (rr(d, (244, 176, 268, 292), 10), d.polygon([(250, 268), (270, 290), (340, 226), (320, 206)], fill=255),
                        d.ellipse((232, 256, 280, 304), fill=255)), NOCHE, None, False)
    return ic


def super_():
    """La súper: el rayo."""
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(300, 36), (116, 290), (232, 290), (196, 476), (396, 208), (276, 208)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon([(276, 90), (176, 250), (236, 250)], fill=255), ORO_C, None, False)
    return ic


def ladrido():
    """El ladrido (el disparo): la boca y sus ondas."""
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(64, 196), (200, 150), (200, 362), (64, 316)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.ellipse((40, 222, 104, 290), fill=255), NOCHE, None, False)
    for i, (r, ancho) in enumerate(((96, 40), (176, 40), (256, 40))):
        ic.pieza(lambda d, r=r, ancho=ancho: d.arc((200 - r, 256 - r, 200 + r, 256 + r), -48, 48, fill=255, width=ancho),
                 ORO if i != 1 else ORO_C, ORO_O if i != 1 else ORO)
    return ic


def escudo():
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(256, 48), (424, 106), (424, 252), (256, 462), (88, 252), (88, 106)], fill=255), TURQ, TURQ_O)
    ic.pieza(lambda d: d.polygon([(256, 48), (256, 462), (88, 252), (88, 106)], fill=255), (120, 226, 208), TURQ, False)
    ic.pieza(lambda d: (rr(d, (232, 136, 280, 356), 12), rr(d, (160, 200, 352, 248), 12)), CREMA, None, False)
    return ic


def rapidez():
    """Más deprisa: dos galones."""
    ic = Icono()
    for x in (70, 232):
        ic.pieza(lambda d, x=x: d.polygon([(x, 96), (x + 90, 96), (x + 210, 256), (x + 90, 416), (x, 416), (x + 120, 256)], fill=255),
                 TURQ if x == 70 else (120, 226, 208), TURQ_O if x == 70 else TURQ)
    return ic


def corazon():
    ic = Icono()

    def forma(d):
        d.ellipse((66, 96, 266, 296), fill=255)
        d.ellipse((246, 96, 446, 296), fill=255)
        d.polygon([(80, 240), (432, 240), (256, 446)], fill=255)
    ic.pieza(forma, ROJO, ROJO_O)
    ic.pieza(lambda d: d.ellipse((120, 140, 190, 210), fill=255), (255, 150, 140), None, False)
    return ic


def rendirse():
    """Rendirse: la bandera blanca."""
    ic = Icono()
    ic.pieza(lambda d: rr(d, (112, 56, 150, 460), 16), CUERO, CUERO_O)
    ic.pieza(lambda d: d.polygon([(150, 84), (300, 110), (420, 82), (420, 268), (300, 296), (150, 270)], fill=255), CREMA, CREMA_O)
    ic.pieza(lambda d: d.ellipse((96, 30, 166, 100), fill=255), ORO, ORO_O)
    return ic


def listo():
    ic = Icono()
    ic.pieza(lambda d: d.ellipse((60, 60, 452, 452), fill=255), VERDE, VERDE_O)
    ic.pieza(lambda d: d.line([(150, 262), (228, 340), (366, 180)], fill=255, width=52, joint='curve'), CREMA, None, False)
    return ic


def bot():
    """Una plaza de bot: la cabeza de un robot."""
    ic = Icono()
    ic.pieza(lambda d: rr(d, (244, 56, 268, 140), 10), PLATA_O, None, False)
    ic.pieza(lambda d: d.ellipse((222, 32, 290, 100), fill=255), ROJO, ROJO_O)
    ic.pieza(lambda d: rr(d, (86, 130, 426, 430), 60), PLATA, PLATA_O)
    for x in (150, 290):
        ic.pieza(lambda d, x=x: d.ellipse((x, 204, x + 72, 276), fill=255), TURQ, TURQ_O, False)
    ic.pieza(lambda d: rr(d, (170, 330, 342, 366), 16), NOCHE, None, False)
    for x in (44, 426):
        ic.pieza(lambda d, x=x: rr(d, (x, 230, x + 42, 320), 14), PLATA_O, None, False)
    return ic


def buscar():
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(310, 344), (344, 310), (452, 418), (418, 452)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.ellipse((60, 60, 372, 372), fill=255), PLATA, PLATA_O)
    ic.pieza(lambda d: d.ellipse((110, 110, 322, 322), fill=255), TURQ, TURQ_O, False)
    ic.pieza(lambda d: d.ellipse((146, 140, 206, 200), fill=255), (190, 244, 236), None, False)
    return ic


def exp():
    ic = Icono()
    ic.pieza(lambda d: d.polygon(estrella(256, 266, 214, 92), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon(estrella(256, 266, 110, 48), fill=255), ORO_C, None, False)
    return ic


def puntos():
    """Los puntos de la temporada: la medalla."""
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(150, 40), (236, 40), (286, 220), (200, 220)], fill=255), ROJO, ROJO_O)
    ic.pieza(lambda d: d.polygon([(362, 40), (276, 40), (226, 220), (312, 220)], fill=255), TURQ, TURQ_O)
    ic.pieza(lambda d: d.ellipse((126, 180, 386, 440), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon(estrella(256, 312, 78, 34), fill=255), CREMA, None, False)
    return ic


def girar():
    """Gira el teléfono: el móvil tumbado y la flecha que le da la vuelta (el
    aviso de jugar en horizontal; antes era el emoji 📱↻)."""
    ic = Icono()
    cx, cy, r = 256, 256, 196
    # La flecha: tres cuartos de vuelta y su punta, en el sentido del reloj.
    ic.pieza(lambda d: (d.arc((cx - r, cy - r, cx + r, cy + r), 205, 360, fill=255, width=38),
                        d.arc((cx - r, cy - r, cx + r, cy + r), 0, 118, fill=255, width=38)), ORO, ORO_O)
    a = math.radians(122)
    px, py = cx + r * math.cos(a), cy + r * math.sin(a)
    tx, ty = -math.sin(a), math.cos(a)                 # hacia donde avanza la flecha
    nx, ny = math.cos(a), math.sin(a)                  # hacia fuera del círculo
    punta = [(px + tx * 74, py + ty * 74), (px + nx * 62 - tx * 6, py + ny * 62 - ty * 6), (px - nx * 62 - tx * 6, py - ny * 62 - ty * 6)]
    ic.pieza(lambda d: d.polygon(punta, fill=255), ORO, ORO_O)
    # El teléfono, tumbado: la carcasa y su pantalla.
    ic.pieza(lambda d: rr(d, (128, 176, 384, 336), 34), PLATA, PLATA_O)
    ic.pieza(lambda d: rr(d, (160, 196, 342, 316), 14), (54, 70, 104), None, False)
    ic.pieza(lambda d: rr(d, (356, 226, 370, 286), 7), PLATA_O, None, False)
    return ic


ICONOS = {
    'arena': arena, 'diarias': diarias, 'pvp': pvp, 'practica': practica, 'ranking': ranking,
    'hueso': hueso, 'ko': ko, 'vivos': vivos, 'gas': gas, 'reloj': reloj, 'super': super_, 'ladrido': ladrido,
    'escudo': escudo, 'rapidez': rapidez, 'corazon': corazon, 'rendirse': rendirse, 'listo': listo, 'bot': bot,
    'buscar': buscar, 'exp': exp, 'puntos': puntos, 'girar': girar,
}


def main():
    os.makedirs(DESTINO, exist_ok=True)
    elegidos = [n for n in sys.argv[1:] if n in ICONOS] or list(ICONOS)
    for nombre in elegidos:
        ICONOS[nombre]().render().save(os.path.join(DESTINO, nombre + '.png'), optimize=True)
    print('%d iconos -> %s' % (len(elegidos), DESTINO))


if __name__ == '__main__':
    main()
