# -*- coding: utf-8 -*-
"""
LOS ICONOS DEL HUD                                                (2026-10-05)

    python tools/generar-iconos-hud.py       ->  Game/Source/hud/*.png  (128x128)

Los botones redondos llevaban iconos de cinco sitios distintos: dibujos
planos de 512 px, un NFT de 24 px y dos EMOJIS (⚔️ 🛒) que cada sistema pinta
a su manera (y Windows 10 a medias, ver la nota de los emojis). Esto los hace
todos de una vez y con la misma mano:

  · contorno oscuro del mismo grueso en todos,
  · la misma paleta (crema, oro, turquesa, rojo, violeta, verde, cuero),
  · luz desde arriba a la izquierda (el brillo y la sombra caen igual),
  · sombra suave debajo, para que se lean sobre cualquier fondo.

Se dibujan a 512 px y se reducen a 128 con filtro Lanczos: bordes suaves sin
dientes, también en pantallas de densidad 2 y 3.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(os.path.dirname(AQUI), 'Game', 'Source', 'hud')
N = 512
OUT = 128
TINTA = (29, 20, 40, 255)
GROSOR = 22

CREMA = (248, 236, 204); CREMA_O = (214, 190, 140)
ORO = (246, 192, 80); ORO_O = (196, 128, 40); ORO_C = (255, 232, 150)
TURQ = (64, 196, 178); TURQ_O = (30, 132, 128)
ROJO = (220, 78, 70); ROJO_O = (150, 40, 44)
VIOLETA = (150, 100, 240); VIOLETA_O = (88, 52, 170); CIAN = (110, 220, 255)
VERDE = (110, 196, 80); VERDE_O = (60, 130, 50)
CUERO = (150, 96, 54); CUERO_O = (98, 58, 32)
PLATA = (226, 232, 240); PLATA_O = (140, 150, 168)


class Icono:
    def __init__(self):
        self.capas = []                       # (máscara, color o degradado)

    @staticmethod
    def mascara():
        return Image.new('L', (N, N), 0)

    def pieza(self, dibujar, color, oscuro=None, brillo=True):
        """Una pieza: su máscara, su color con sombreado (arriba claro, abajo oscuro)."""
        m = self.mascara()
        dibujar(ImageDraw.Draw(m))
        self.capas.append((m, color, oscuro, brillo))
        return m

    def render(self):
        lienzo = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        union = self.mascara()
        for m, _, _, _ in self.capas:
            union = ImageChops.lighter(union, m)
        # Sombra suave debajo.
        sombra = union.filter(ImageFilter.MaxFilter(GROSOR // 2 * 2 + 1)).filter(ImageFilter.GaussianBlur(14))
        capa_sombra = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        capa_sombra.putalpha(sombra.point(lambda v: int(v * 0.45)))
        lienzo.alpha_composite(capa_sombra, (0, 14))
        for m, color, oscuro, brillo in self.capas:
            # Contorno: la máscara engordada, en tinta.
            borde = m.filter(ImageFilter.MaxFilter(GROSOR + 1))
            t = Image.new('RGBA', (N, N), TINTA)
            t.putalpha(borde)
            lienzo.alpha_composite(t)
            # Relleno con degradado vertical dentro de la pieza.
            bb = m.getbbox()
            if not bb:
                continue
            relleno = Image.new('RGBA', (N, N), color + (255,))
            if oscuro:
                g = Image.new('RGBA', (N, N), (0, 0, 0, 0))
                dg = ImageDraw.Draw(g)
                y0, y1 = bb[1], bb[3]
                for y in range(y0, y1 + 1):
                    k = (y - y0) / max(1, y1 - y0)
                    k = max(0.0, (k - 0.45) / 0.55)
                    c = tuple(int(color[i] + (oscuro[i] - color[i]) * k) for i in range(3))
                    dg.line([(0, y), (N, y)], fill=c + (255,))
                relleno = g
            relleno.putalpha(m)
            lienzo.alpha_composite(relleno)
            if brillo:
                # Brillo: la parte de arriba-izquierda de la pieza, un poco más clara.
                desp = ImageChops.offset(m, 12, 16)
                luz = ImageChops.subtract(m, desp)
                luz = luz.filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.55))
                b = Image.new('RGBA', (N, N), (255, 255, 255, 0))
                b.putalpha(luz)
                lienzo.alpha_composite(b)
        return lienzo.resize((OUT, OUT), Image.LANCZOS)


def rr(d, caja, r):
    d.rounded_rectangle(caja, r, fill=255)


# ───────────────────────────────────────────────────────────── los iconos
def panel():
    ic = Icono()
    ic.pieza(lambda d: rr(d, (70, 110, 442, 402), 46), CREMA, CREMA_O)
    ic.pieza(lambda d: rr(d, (70, 110, 442, 178), 40), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((108, 214, 220, 326), fill=255), TURQ, TURQ_O)
    ic.pieza(lambda d: d.ellipse((134, 196, 194, 256), fill=255), CREMA, None, False)
    for y, x1 in ((222, 400), (270, 370), (318, 392)):
        ic.pieza(lambda d, y=y, x1=x1: rr(d, (250, y, x1, y + 22), 11), CREMA_O, None, False)
    return ic


def correo():
    ic = Icono()
    ic.pieza(lambda d: rr(d, (58, 128, 454, 392), 34), CREMA, CREMA_O)
    ic.pieza(lambda d: d.polygon([(64, 140), (256, 286), (448, 140), (448, 170), (256, 316), (64, 170)], fill=255), CREMA_O, None, False)
    ic.pieza(lambda d: d.ellipse((204, 236, 308, 340), fill=255), ROJO, ROJO_O)
    ic.pieza(lambda d: d.ellipse((232, 262, 280, 310), fill=255), (255, 140, 120), None, False)
    return ic


def musica():
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(186, 110), (420, 66), (420, 130), (186, 174)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: rr(d, (178, 120, 214, 360), 14), ORO, ORO_O)
    ic.pieza(lambda d: rr(d, (392, 80, 428, 320), 14), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((96, 312, 220, 410), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((310, 272, 434, 370), fill=255), ORO, ORO_O)
    return ic


def transacciones():
    ic = Icono()
    def flecha(d, arriba):
        if arriba:
            d.arc((76, 76, 436, 436), 200, 340, fill=255, width=46)
            d.polygon([(380, 98), (452, 196), (348, 204)], fill=255)
        else:
            d.arc((76, 76, 436, 436), 20, 160, fill=255, width=46)
            d.polygon([(132, 414), (60, 316), (164, 308)], fill=255)
    ic.pieza(lambda d: flecha(d, True), TURQ, TURQ_O)
    ic.pieza(lambda d: flecha(d, False), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((176, 176, 336, 336), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((214, 214, 298, 298), fill=255), ORO_C, None, False)
    return ic


def nft():
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(256, 52), (420, 190), (256, 460), (92, 190)], fill=255), VIOLETA, VIOLETA_O)
    ic.pieza(lambda d: d.polygon([(256, 52), (330, 190), (256, 460), (182, 190)], fill=255), CIAN, VIOLETA, False)
    ic.pieza(lambda d: d.polygon([(92, 190), (420, 190), (404, 214), (108, 214)], fill=255), (210, 190, 255), None, False)
    ic.pieza(lambda d: d.polygon([(400, 54), (414, 96), (456, 110), (414, 124), (400, 166), (386, 124), (344, 110), (386, 96)], fill=255), (255, 255, 255), None, False)
    return ic


def habilidades():
    ic = Icono()
    def hoja(d, sentido):
        if sentido > 0:
            d.polygon([(110, 64), (150, 70), (372, 300), (340, 332)], fill=255)
        else:
            d.polygon([(402, 64), (362, 70), (140, 300), (172, 332)], fill=255)
    ic.pieza(lambda d: hoja(d, 1), PLATA, PLATA_O)
    ic.pieza(lambda d: hoja(d, -1), PLATA, PLATA_O)
    ic.pieza(lambda d: d.polygon([(300, 360), (380, 280), (402, 302), (322, 382)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon([(212, 360), (132, 280), (110, 302), (190, 382)], fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.polygon([(356, 352), (380, 330), (440, 392), (418, 414)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.polygon([(156, 352), (132, 330), (72, 392), (94, 414)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.ellipse((420, 394, 462, 436), fill=255), ORO, ORO_O)
    ic.pieza(lambda d: d.ellipse((50, 394, 92, 436), fill=255), ORO, ORO_O)
    return ic


def tienda():
    ic = Icono()
    ic.pieza(lambda d: rr(d, (100, 230, 412, 428), 18), CUERO, CUERO_O)
    ic.pieza(lambda d: rr(d, (150, 270, 362, 330), 12), CREMA, CREMA_O, False)
    def toldo(d, impar):
        for i in range(5):
            if i % 2 == impar:
                x0 = 70 + i * 74
                d.polygon([(x0, 96), (x0 + 74, 96), (x0 + 74, 214), (x0, 214)], fill=255)
                d.pieslice((x0, 176, x0 + 74, 250), 0, 180, fill=255)
    ic.pieza(lambda d: toldo(d, 0), ROJO, ROJO_O)
    ic.pieza(lambda d: toldo(d, 1), CREMA, CREMA_O)
    ic.pieza(lambda d: d.ellipse((222, 350, 290, 418), fill=255), ORO, ORO_O)
    return ic


def amigos():
    ic = Icono()
    ic.pieza(lambda d: (d.ellipse((248, 86, 372, 210), fill=255), d.pieslice((206, 214, 414, 422), 180, 360, fill=255)), TURQ, TURQ_O)
    ic.pieza(lambda d: (d.ellipse((120, 140, 250, 270), fill=255), d.pieslice((76, 272, 294, 490), 180, 360, fill=255)), ORO, ORO_O)
    def corazon(d):
        d.ellipse((330, 300, 392, 362), fill=255); d.ellipse((380, 300, 442, 362), fill=255)
        d.polygon([(334, 344), (438, 344), (386, 420)], fill=255)
    ic.pieza(corazon, (255, 110, 150), (200, 50, 100))
    return ic


def isla(con_flecha=False):
    ic = Icono()
    ic.pieza(lambda d: d.polygon([(90, 250), (422, 250), (330, 420), (256, 460), (190, 420)], fill=255), CUERO, CUERO_O)
    ic.pieza(lambda d: d.ellipse((70, 196, 442, 300), fill=255), VERDE, VERDE_O)
    ic.pieza(lambda d: (d.ellipse((150, 228, 196, 262), fill=255), d.ellipse((300, 238, 336, 262), fill=255)), (140, 136, 130), None, False)
    ic.pieza(lambda d: rr(d, (250, 70, 268, 240), 8), CUERO_O, None, False)
    ic.pieza(lambda d: d.polygon([(268, 76), (372, 108), (268, 142)], fill=255), ROJO, ROJO_O)
    if con_flecha:
        def flecha(d):
            d.arc((60, 40, 300, 280), 150, 300, fill=255, width=40)
            d.polygon([(44, 120), (130, 106), (88, 200)], fill=255)
        ic.pieza(flecha, ORO, ORO_O)
    return ic


def chat():
    ic = Icono()
    ic.pieza(lambda d: (rr(d, (60, 90, 452, 360), 70), d.polygon([(140, 340), (230, 340), (120, 446)], fill=255)), CREMA, CREMA_O)
    for x in (156, 256, 356):
        ic.pieza(lambda d, x=x: d.ellipse((x - 30, 196, x + 30, 256), fill=255), TURQ, TURQ_O, False)
    return ic


def ojo():
    ic = Icono()
    ic.pieza(lambda d: (d.chord((40, 120, 472, 520), 200, 340, fill=255), d.chord((40, -8, 472, 392), 20, 160, fill=255)), CREMA, CREMA_O)
    ic.pieza(lambda d: d.ellipse((176, 176, 336, 336), fill=255), TURQ, TURQ_O)
    ic.pieza(lambda d: d.ellipse((222, 222, 290, 290), fill=255), (24, 30, 46), None, False)
    ic.pieza(lambda d: d.ellipse((268, 206, 296, 234), fill=255), (255, 255, 255), None, False)
    return ic


def mochila():
    ic = Icono()
    ic.pieza(lambda d: d.arc((176, 46, 336, 206), 180, 360, fill=255, width=34), CUERO_O, None, False)
    ic.pieza(lambda d: rr(d, (96, 120, 416, 462), 80), CUERO, CUERO_O)
    ic.pieza(lambda d: rr(d, (126, 120, 386, 280), 60), (178, 118, 70), CUERO_O)
    ic.pieza(lambda d: rr(d, (150, 330, 362, 430), 28), (128, 80, 44), CUERO_O, False)
    ic.pieza(lambda d: rr(d, (228, 236, 284, 304), 12), ORO, ORO_O)
    return ic


ICONOS = {
    'panel': panel, 'correo': correo, 'musica': musica, 'transacciones': transacciones, 'nft': nft,
    'habilidades': habilidades, 'tienda': tienda, 'amigos': amigos, 'lands': lambda: isla(False),
    'lands_volver': lambda: isla(True), 'chat': chat, 'ojo': ojo, 'mochila': mochila,
}


def main():
    os.makedirs(DESTINO, exist_ok=True)
    for nombre, f in ICONOS.items():
        f().render().save(os.path.join(DESTINO, nombre + '.png'), optimize=True)
    print('%d iconos -> %s' % (len(ICONOS), DESTINO))


if __name__ == '__main__':
    main()
