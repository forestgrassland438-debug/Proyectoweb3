"""
EL FERRI DEL RÍO, SU MUELLE Y SU CARTEL                          (2026-11-24)
===========================================================================

"En el río de GameScene no existe un barco con un NPC para llevarte a los
otros mapas, como por ejemplo el otro pueblo; además el río es corto:
repáralo para el paso del barco. La idea es el barco para ir a GameScene y el
de ir al nuevo pueblo."

QUÉ ESCRIBE (pixel art a 1x; en el juego va a ESCALA 2, como el bote de remos)
  Game/Objetos/ferri/ferri.png + ferri.json   atlas con dos cuadros que se
      superponen EXACTOS (mismo tamaño, mismo origen):
        'atras'    la cubierta, la borda de enfrente, la cabina, el mástil con
                   la vela recogida, la carga y el farol de proa: lo que queda
                   DETRÁS de quien va de pie en la cubierta;
        'delante'  el costado que mira al jugador (tablas, franja pintada,
                   defensas de cuerda): tapa las piernas del pasajero, igual
                   que 'h_delante' del bote de remos tapa al remero.
  Game/Objetos/ferri/muelle.png   el muelle de madera del pueblo (tablas de
      través, largueros, pilotes que entran en el agua y un noray).
  Game/Objetos/ferri/cartel.png   el poste con la tabla del barco pintado.

POR QUÉ ASÍ
  * Nada de recolorear arte que ya existe: se dibuja píxel a píxel con un
    motor propio (rectas, polígonos, elipses y un contorno de 1 px), con la
    paleta del bote de remos (Game/Objetos/bote/bote_mundo.png) para que
    los dos barcos sean de la misma mano.
  * Las cotas salen de la cuenta del juego: el jugador mide 102 px en
    pantalla; a ESCALA 2 el ferri mide 268 px de eslora y su cubierta
    deja de pie a dos pasajeros y al barquero (ver gf-ferri.js).
  * Determinista: sin azar suelto (semilla fija). Volver a correrlo da los
    mismos bytes; tools/ferri.test.cjs lo comprueba.

USO
  python tools/generar-ferri.py            escribe los tres
  python tools/generar-ferri.py --ver X    además una hoja de muestra en X
  python tools/generar-ferri.py --salida D escribe en D (tools/ferri.test.cjs compara)
"""
import json
import os
import random
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'Game', 'Objetos', 'ferri')


def hx(c):
    c = c.lstrip('#')
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


# La paleta del bote de remos (madera) y lo propio del ferri.
CONTORNO = hx('#22160e')
M = {  # madera, de oscura a clara
    0: hx('#3a2414'), 1: hx('#5a381e'), 2: hx('#6e4628'), 3: hx('#86582c'),
    4: hx('#93622f'), 5: hx('#a2703c'), 6: hx('#b67e44'), 7: hx('#c08a52'), 8: hx('#d8a468'),
}
MOJADO = hx('#3e2614')
FRANJA = [hx('#5fb0b8'), hx('#3f8f9a'), hx('#2f6f7f'), hx('#24545f')]
CREMA = [hx('#f6eed8'), hx('#efe4c8'), hx('#e2d4b0'), hx('#c9b78c'), hx('#a89466')]
TEJA = [hx('#d8704a'), hx('#c8603f'), hx('#b84a32'), hx('#a8432f'), hx('#7a2e22'), hx('#5a1e16')]
HIERRO = [hx('#7a7a86'), hx('#5a5a64'), hx('#3a3a40'), hx('#26262c')]
LATON = [hx('#fff0a8'), hx('#e8c040'), hx('#b8902a'), hx('#7a5a1a')]
VIDRIO = [hx('#ecfaff'), hx('#9ad4e8'), hx('#5aa0c0'), hx('#3a7090')]
LUZ = [hx('#fffbe0'), hx('#ffe48a'), hx('#ffc84a'), hx('#c8901a')]
CUERDA = [hx('#e8d4a0'), hx('#cfb07a'), hx('#a8844e'), hx('#7a5a30')]
VELA = [hx('#fbf6e8'), hx('#efe6d0'), hx('#ddd2b4'), hx('#c4b892'), hx('#a89a72')]
BANDERA = [hx('#e8583a'), hx('#c8402a'), hx('#8a2a1a')]


# ===========================================================================
# EL MOTOR: un lienzo de píxeles con lo justo para dibujar a mano
# ===========================================================================
class Lienzo:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [[None] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.p[y][x]
        return None

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c)

    def linea(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        e = dx + dy
        while True:
            self.put(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * e
            if e2 >= dy:
                e += dy
                x0 += sx
            if e2 <= dx:
                e += dx
                y0 += sy

    def poligono(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            yc = y + 0.5
            xs = []
            n = len(pts)
            for i in range(n):
                (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % n]
                if (ya <= yc < yb) or (yb <= yc < ya):
                    xs.append(xa + (yc - ya) * (xb - xa) / (yb - ya))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[k])), int(round(xs[k + 1]))):
                    self.put(x, y, c)

    def elipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c)

    def contorno(self, c=CONTORNO, solo_fuera=True):
        """1 px oscuro alrededor de todo lo pintado (como el bote de remos)."""
        marcar = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) is not None:
                        marcar.append((x, y))
                        break
        for x, y in marcar:
            self.p[y][x] = c

    def imagen(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        px = im.load()
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is not None:
                    px[x, y] = self.p[y][x]
        return im


# ===========================================================================
# EL FERRI
# ===========================================================================
# A escala del personaje: quien va de pie en cubierta mide 51 px a 1x (102 en
# pantalla) y la puerta de la cabina, 40 (80): cabe una persona. La cabina
# va a popa, el mástil con la vela recogida en medio y la carga a proa.
W, H = 152, 152
X0, X1 = 8, 144          # popa (espejo) y roda (proa)
AGUA = 146               # la línea de flotación: la fila más baja del casco
BORDA = 121              # la regala del costado cercano en el centro del barco


def borda(x):
    """La regala del costado cercano (su fila de arriba): sube en la proa y un poco en la popa."""
    y = float(BORDA)
    if x > 104:
        y -= 11.0 * ((x - 104) / float(X1 - 104)) ** 1.7
    if x < 22:
        y -= 3.0 * ((22 - x) / 14.0) ** 2
    return y


def quilla(x):
    """El fondo del costado (la línea de flotación, que se curva en la roda y en la popa)."""
    if x >= 114:
        u = (x - 114) / float(X1 - 114)
        return AGUA - (AGUA - (BORDA - 8)) * u ** 1.55
    if x <= 18:
        u = (18 - x) / float(18 - X0)
        return AGUA - 9 * u ** 1.4
    return float(AGUA)


def manga(x):
    """Cuánto se ve de cubierta (la manga vista desde arriba)."""
    if x >= 98:
        return max(0.0, 15.0 * (1 - ((x - 98) / float(X1 - 98)) ** 1.5))
    if x <= 14:
        return 12.0 + 3.0 * (x - X0) / 6.0
    return 15.0


def pies_en_cubierta(x):
    """Dónde van los pies de quien está de pie (a 1x): 9 px por DEBAJO de la
    regala, para que el costado le tape los tobillos como el bote al remero."""
    return int(round(borda(x))) + 9


def costado_cercano(L):
    """'delante': el costado que mira al jugador."""
    rnd = random.Random(20261124)
    juntas = {}
    for x in range(X0, X1 + 1):
        yt, yb = int(round(borda(x))), int(round(quilla(x)))
        if yb < yt:
            continue
        for y in range(yt, yb + 1):
            d = y - yt
            if d == 0:
                c = M[8]
            elif d == 1:
                c = M[6]
            elif d == 2:
                c = M[4]
            elif 3 <= d <= 6:
                c = FRANJA[d - 3]
            elif d == 7:
                c = M[2]
            else:
                fila = (d - 8) // 5
                k = (d - 8) % 5
                hondo = (y - (BORDA + 6)) / 20.0
                base = 5 if fila % 2 == 0 else 4
                if hondo > 0.55:
                    base -= 1
                c = M[1] if k == 4 else (M[base + 1] if k == 0 else M[base])
                if yb - y <= 1:
                    c = MOJADO
                # juntas a tope, al tresbolillo
                clave = (fila, x // 22)
                if clave not in juntas:
                    juntas[clave] = (x // 22) * 22 + (fila * 9 + rnd.randint(0, 6)) % 22
                if x == juntas[clave] and k != 4:
                    c = M[1]
            L.put(x, y, c)
    # La roda: un canto oscuro y un remate de latón arriba.
    for x in range(X1 - 3, X1 + 1):
        yt, yb = int(round(borda(x))), int(round(quilla(x)))
        for y in range(yt, yb + 1):
            L.put(x, y, M[2] if x < X1 else M[1])
    L.put(X1 - 1, int(round(borda(X1 - 1))) - 1, LATON[1])
    L.put(X1, int(round(borda(X1))) - 1, LATON[2])
    # El timón, por fuera del espejo de popa, con la caña que entra a bordo.
    yp = int(round(borda(X0)))
    L.rect(2, yp + 2, 6, AGUA - 6, M[2])
    L.linea(2, yp + 2, 2, AGUA - 6, M[5])
    L.linea(6, yp + 2, 6, AGUA - 6, M[1])
    L.rect(2, AGUA - 7, 6, AGUA - 6, MOJADO)
    L.rect(3, yp - 1, 13, yp, M[3])
    L.linea(3, yp - 1, 13, yp - 1, M[6])
    # Las defensas de cuerda que cuelgan por la borda.
    for fx in (40, 98):
        yt = int(round(borda(fx)))
        L.linea(fx, yt + 1, fx, yt + 5, CUERDA[3])
        L.elipse(fx + 0.5, yt + 10, 2.8, 5.0, CUERDA[2])     # un cilindro de cuerda trenzada
        L.elipse(fx + 0.0, yt + 9.4, 1.8, 4.0, CUERDA[1])
        L.linea(fx, yt + 6, fx, yt + 7, CUERDA[0])
        for yy in (yt + 8, yt + 11, yt + 14):
            L.linea(fx - 2, yy, fx + 2, yy, CUERDA[3])
    # El salvavidas, blanco y rojo, colgado entre las dos.
    sx, sy = 68, int(round(borda(68))) + 9
    L.linea(sx, sy - 8, sx, sy - 5, CUERDA[3])
    for y in range(sy - 6, sy + 7):
        for x in range(sx - 6, sx + 7):
            r = ((x + 0.5 - (sx + 0.5)) ** 2 + (y + 0.5 - (sy + 0.5)) ** 2) ** 0.5
            if 2.6 <= r <= 6.2:
                cuarto = (x >= sx) != (y >= sy)
                c = BANDERA[1] if cuarto else CREMA[0]
                if r > 5.4 or (x - sx) + (y - sy) > 5:
                    c = BANDERA[2] if cuarto else CREMA[3]
                L.put(x, y, c)
    L.put(sx - 3, sy - 4, hx('#ffffff'))
    # Una placa de latón con el ancla, junto a la proa, sobre la franja.
    ax = 120
    ay = int(round(borda(ax))) + 3
    L.rect(ax - 3, ay, ax + 3, ay + 3, LATON[2])
    L.rect(ax - 2, ay, ax + 2, ay + 3, LATON[1])
    L.put(ax, ay, LATON[3]); L.put(ax, ay + 1, LATON[3]); L.put(ax, ay + 2, LATON[3])
    L.put(ax - 1, ay + 2, LATON[3]); L.put(ax + 1, ay + 2, LATON[3])
    L.put(ax - 1, ay, LATON[0])


def cubierta(L):
    """'atras': la borda de enfrente y las tablas de la cubierta."""
    for x in range(X0 + 1, X1 - 1):
        yt = int(round(borda(x)))
        m = manga(x)
        if m < 1.5:
            continue
        yf = int(round(borda(x) - m))
        # la regala de enfrente
        L.put(x, yf, M[8])
        L.put(x, yf + 1, M[6])
        # la cara de dentro del costado de enfrente, en sombra
        for y in range(yf + 2, min(yt + 2, yf + 5)):
            L.put(x, y, M[2] if y < yf + 4 else M[1])
        # las tablas de la cubierta, a lo largo, con juntas al tresbolillo
        for y in range(yf + 5, yt + 2):
            fila = (y - yf - 5) // 3
            k = (y - yf - 5) % 3
            c = M[3] if k == 2 else (M[7] if fila % 2 == 0 else M[6])
            if k != 2 and (x + fila * 13) % 29 == 0:
                c = M[3]
            L.put(x, y, c)
    # El espejo de popa, visto de lado: un canto grueso.
    for y in range(int(round(borda(X0 + 1) - manga(X0 + 1))), int(round(borda(X0 + 1))) + 2):
        L.put(X0, y, M[3])
        L.put(X0 + 1, y, M[5])


TOPE = (94, 8)           # el tope del mástil


def jarcia(L):
    """Los cabos del mástil (van primero: lo demás los tapa)."""
    cabo = hx('#4a3420')
    L.linea(TOPE[0], TOPE[1], X1 - 2, int(round(borda(X1 - 2))) - 1, cabo)   # estay de proa
    L.linea(TOPE[0], TOPE[1], 63, 57, cabo)                                  # backstay, al techo


def cabina(L):
    """La cabina del barquero, a popa: tablas pintadas, ventana, puerta y farolillo."""
    x0, x1, ytecho, ybase = 16, 62, 67, 115
    # paredes de tablas pintadas de crema
    for y in range(ytecho, ybase + 1):
        k = (y - ytecho) % 4
        c = CREMA[3] if k == 3 else (CREMA[1] if (y - ytecho) // 4 % 2 == 0 else CREMA[2])
        for x in range(x0, x1 + 1):
            L.put(x, y, c)
    for y in range(ytecho, ybase + 1):            # brillo a la izquierda, sombra a la derecha
        L.put(x0 + 2, y, CREMA[0] if (y - ytecho) % 4 != 3 else CREMA[3])
        L.put(x1 - 2, y, CREMA[3])
    # esquineros y zócalo de madera
    for x in (x0, x0 + 1, x1 - 1, x1):
        for y in range(ytecho, ybase + 1):
            L.put(x, y, M[6] if x in (x0, x1 - 1) else M[3])
    L.rect(x0, ybase - 3, x1, ybase, M[2])
    L.linea(x0, ybase - 3, x1, ybase - 3, M[5])
    # la ventana de cuatro cristales, con su marco y su alféizar
    vx0, vy0, vx1, vy1 = 21, 79, 34, 93
    L.rect(vx0 - 1, vy0 - 1, vx1 + 1, vy1 + 1, M[2])
    L.rect(vx0, vy0, vx1, vy1, VIDRIO[2])
    for y in range(vy0, vy1 + 1):
        for x in range(vx0, vx1 + 1):
            if x + y - vx0 - vy0 < 7:
                L.put(x, y, VIDRIO[1])
    L.put(vx0 + 1, vy0 + 1, VIDRIO[0]); L.put(vx0 + 2, vy0 + 1, VIDRIO[0]); L.put(vx0 + 1, vy0 + 2, VIDRIO[0])
    L.linea((vx0 + vx1) // 2, vy0, (vx0 + vx1) // 2, vy1, M[3])
    L.linea(vx0, (vy0 + vy1) // 2, vx1, (vy0 + vy1) // 2, M[3])
    L.rect(vx0 - 2, vy1 + 2, vx1 + 2, vy1 + 3, M[6])
    L.linea(vx0 - 2, vy1 + 3, vx1 + 2, vy1 + 3, M[3])
    # la puerta, con su arco, su marco, sus tablas y el pomo de latón
    px0, px1, py0 = 41, 55, 74
    L.rect(px0 - 1, py0 + 2, px1 + 1, ybase - 4, M[3])
    L.rect(px0, py0 + 3, px1, ybase - 4, M[1])
    L.linea(px0 + 1, py0 + 1, px1 - 1, py0 + 1, M[3])
    L.linea(px0 + 2, py0, px1 - 2, py0, M[3])
    L.linea(px0 + 1, py0 + 2, px1 - 1, py0 + 2, M[1])
    for x in range(px0 + 3, px1, 4):
        L.linea(x, py0 + 3, x, ybase - 5, M[2])
    L.linea(px0, py0 + 14, px1, py0 + 14, M[2])
    L.linea(px0, py0 + 28, px1, py0 + 28, M[2])
    L.put(px1 - 2, 95, LATON[1]); L.put(px1 - 2, 96, LATON[2])
    # el farolillo junto a la puerta
    L.put(38, 77, HIERRO[2])
    L.rect(37, 78, 39, 82, HIERRO[2])
    L.put(38, 79, LUZ[1]); L.put(38, 80, LUZ[1]); L.put(38, 81, LUZ[2])
    # el techo de tablas pintadas de rojo, con el alero que vuela y su canto en sombra
    for y in range(57, 65):
        k = (y - 57) % 3
        for x in range(x0 - 3, x1 + 4):
            c = TEJA[4] if k == 2 else TEJA[1 + ((y - 57) // 3 % 2)]
            if y == 57:
                c = TEJA[0]
            if x in (x0 - 3, x1 + 3) and y > 57:
                c = TEJA[3]
            L.put(x, y, c)
    L.rect(x0 - 3, 65, x1 + 3, 66, TEJA[5])
    L.linea(x0 - 3, 65, x1 + 3, 65, TEJA[4])
    # la chimenea de hierro con su sombrerete
    L.rect(24, 45, 27, 56, HIERRO[1])
    L.linea(24, 45, 24, 56, HIERRO[0])
    L.linea(27, 45, 27, 56, HIERRO[2])
    L.rect(23, 43, 28, 44, HIERRO[2])
    L.linea(23, 43, 28, 43, HIERRO[1])


def mastil_y_vela(L):
    # el mástil (3 px: luz, madera, sombra)
    tx = TOPE[0]
    for y in range(TOPE[1] - 2, 118):
        L.put(tx - 1, y, M[7])
        L.put(tx, y, M[5])
        L.put(tx + 1, y, M[2])
    L.rect(tx - 2, TOPE[1] - 4, tx + 2, TOPE[1] - 3, M[1])
    # la botavara y la vela recogida encima: un rollo abultado entre ligaduras
    yb = 77              # por encima de las cabezas (y de la carga: si no, parecía una mesa)
    L.rect(72, yb, 128, yb + 1, M[3])
    L.linea(72, yb, 128, yb, M[6])
    for x in range(74, 127):
        t = (x - 74) / 52.0
        lig = (x - 78) % 9 == 0
        bulto = 0 if lig else (1 if 2 <= (x - 78) % 9 <= 6 else 0)
        alto = 6 - int(round(3 * abs(t - 0.45) ** 1.3)) + bulto
        for y in range(yb - alto, yb):
            d = y - (yb - alto)
            c = VELA[0] if d == 0 else (VELA[1] if d < 2 else (VELA[2] if d < alto - 1 else VELA[3]))
            if lig:
                c = CUERDA[2] if d > 0 else CUERDA[1]
            L.put(x, y, c)
    # el gallardete en el tope, al viento
    for i in range(16):
        y0 = TOPE[1] - 2 + (1 if (i // 4) % 2 else 0)
        alto = max(1, 4 - i // 4)
        for j in range(alto):
            L.put(tx + 2 + i, y0 + j, BANDERA[0] if j == 0 else (BANDERA[1] if j < alto - 1 else BANDERA[2]))
        if alto >= 3:
            L.put(tx + 2 + i, y0 + 1, LATON[1])


def carga_y_farol(L):
    # dos cajas (una encima de otra) y un barril, a proa
    def caja(x0, y0, w, h):
        L.rect(x0, y0, x0 + w, y0 + 2, M[8])                # la tapa, al sol
        L.rect(x0, y0 + 3, x0 + w, y0 + h, M[6])
        for yy in range(y0 + 5, y0 + h, 3):
            L.linea(x0 + 1, yy, x0 + w - 1, yy, M[4])
        L.linea(x0, y0 + 3, x0 + w, y0 + 3, M[3])
        L.rect(x0, y0 + 3, x0 + 1, y0 + h, M[3])            # los listones de las esquinas
        L.rect(x0 + w - 1, y0 + 3, x0 + w, y0 + h, M[2])
    caja(103, 104, 11, 10)
    caja(106, 96, 7, 7)
    # el barril
    L.elipse(121, 110, 4.2, 6.0, M[4])
    L.elipse(120.4, 109.5, 2.8, 5.0, M[6])
    L.elipse(121, 104.6, 3.6, 1.4, M[7])
    for yy in (107, 113):
        L.linea(117, yy, 125, yy, HIERRO[2])
    L.put(118, 106, M[8])
    # el rollo de cabo junto a la cabina
    L.elipse(28, 118, 4.4, 2.2, CUERDA[2])
    L.elipse(28, 117.6, 3.0, 1.4, CUERDA[1])
    L.elipse(28, 117.6, 1.4, 0.7, M[2])
    # el farol de proa en su poste
    L.rect(133, 98, 134, 112, M[2])
    L.linea(133, 98, 133, 112, M[5])
    L.rect(131, 90, 136, 97, HIERRO[2])
    L.rect(132, 91, 135, 96, LUZ[1])
    L.put(132, 91, LUZ[0]); L.put(133, 91, LUZ[0])
    L.put(135, 96, LUZ[3])
    L.rect(131, 88, 136, 89, HIERRO[1])
    L.put(133, 87, HIERRO[2]); L.put(134, 87, HIERRO[2])


def ferri():
    atras = Lienzo(W, H)
    jarcia(atras)
    cubierta(atras)
    cabina(atras)
    carga_y_farol(atras)
    mastil_y_vela(atras)
    atras.contorno()
    delante = Lienzo(W, H)
    costado_cercano(delante)
    delante.contorno()
    return atras.imagen(), delante.imagen()


# ===========================================================================
# EL MUELLE DEL PUEBLO
# ===========================================================================
MW, MH = 96, 50
SUP0, SUP1 = 5, 36       # la superficie que se pisa (filas)
POSTES = (3, 33, 63, 92)


def muelle():
    L = Lienzo(MW, MH)
    rnd = random.Random(4242)
    # las cabezas de los pilotes de enfrente (asoman por encima)
    for x in POSTES:
        L.elipse(x + 1.5, 3.2, 2.6, 1.8, M[6])
        L.put(x + 1, 2, M[8])
        L.rect(x, 4, x + 3, SUP0, M[2])
    # las tablas, de través, con su veta, sus clavos y su luz a la izquierda
    tonos = [6, 5, 7, 5, 6, 4, 6, 7]
    for i in range(MW // 6 + 1):
        xa, xb = i * 6, min(MW - 1, i * 6 + 5)
        t = tonos[(i * 5 + 3) % len(tonos)]
        for x in range(xa, xb + 1):
            for y in range(SUP0, SUP1 + 1):
                c = M[t]
                if x == xa:
                    c = M[min(8, t + 1)]
                if x == xb:
                    c = M[2]
                L.put(x, y, c)
        for _ in range(3):                                   # la veta
            gx = rnd.randint(xa + 1, max(xa + 1, xb - 1))
            gy = rnd.randint(SUP0 + 2, SUP1 - 6)
            for y in range(gy, gy + rnd.randint(3, 6)):
                L.put(gx, y, M[max(2, t - 2)])
        cx = (xa + xb) // 2
        L.put(cx, SUP0 + 2, M[0]); L.put(cx, SUP1 - 2, M[0])  # los clavos
    # los largueros de los dos bordes
    L.rect(0, SUP0, MW - 1, SUP0 + 1, M[3])
    L.linea(0, SUP0, MW - 1, SUP0, M[6])
    L.rect(0, SUP1 + 1, MW - 1, SUP1 + 5, M[2])
    L.linea(0, SUP1 + 1, MW - 1, SUP1 + 1, M[5])
    for x in range(2, MW, 11):
        L.linea(x, SUP1 + 2, x + 3, SUP1 + 2, M[3])
    # los pilotes de este lado, que bajan al agua (mojados abajo)
    for x in POSTES:
        L.rect(x, SUP1 + 2, x + 3, MH - 2, M[3])
        L.linea(x, SUP1 + 2, x, MH - 2, M[6])
        L.linea(x + 3, SUP1 + 2, x + 3, MH - 2, M[1])
        L.rect(x, MH - 4, x + 3, MH - 2, MOJADO)
    # el noray de la punta, con su cabo enrollado
    L.elipse(88.5, 29, 3.2, 2.0, CUERDA[2])
    L.rect(87, 23, 90, 29, HIERRO[2])
    L.linea(87, 23, 87, 29, HIERRO[1])
    L.rect(86, 21, 91, 22, HIERRO[1])
    L.linea(86, 21, 91, 21, HIERRO[0])
    L.elipse(88.5, 29.4, 2.2, 1.0, CUERDA[1])
    L.contorno()
    return L.imagen()


# ===========================================================================
# EL CARTEL DEL FERRI
# ===========================================================================
def cartel():
    L = Lienzo(28, 34)
    # el poste
    L.rect(12, 12, 15, 33, M[3])
    L.linea(12, 12, 12, 33, M[6])
    L.linea(15, 12, 15, 33, M[1])
    # la tabla con su marco
    L.rect(1, 2, 26, 15, M[2])
    L.rect(2, 3, 25, 14, FRANJA[2])
    L.linea(2, 3, 25, 3, FRANJA[1])
    L.linea(2, 14, 25, 14, FRANJA[3])
    # el barco pintado: casco, cabina y vela (crema sobre azul)
    L.poligono([(5, 10), (22, 10), (20, 13), (7, 13)], CREMA[1])
    L.rect(7, 8, 10, 9, CREMA[2])
    L.linea(14, 4, 14, 9, CREMA[1])
    L.poligono([(15, 4), (20, 9), (15, 9)], CREMA[0])
    # las olas
    for x in (4, 9, 14, 19):
        L.put(x, 14, CREMA[2]); L.put(x + 1, 13, CREMA[2]); L.put(x + 2, 14, CREMA[2])
    L.contorno()
    return L.imagen()


# ===========================================================================
def guardar_png(im, ruta):
    tmp = ruta + '.tmp'
    im.save(tmp, format='PNG', optimize=True)
    os.replace(tmp, ruta)


def main():
    global SALIDA
    if '--salida' in sys.argv:                     # para la prueba: escribir en otra carpeta
        SALIDA = sys.argv[sys.argv.index('--salida') + 1]
    os.makedirs(SALIDA, exist_ok=True)
    atras, delante = ferri()
    hoja = Image.new('RGBA', (W * 2 + 2, H), (0, 0, 0, 0))
    hoja.paste(atras, (0, 0))
    hoja.paste(delante, (W + 2, 0))
    guardar_png(hoja, os.path.join(SALIDA, 'ferri.png'))
    meta = {
        'frames': {
            'atras': {'frame': {'x': 0, 'y': 0, 'w': W, 'h': H}, 'rotated': False, 'trimmed': False,
                      'spriteSourceSize': {'x': 0, 'y': 0, 'w': W, 'h': H}, 'sourceSize': {'w': W, 'h': H}},
            'delante': {'frame': {'x': W + 2, 'y': 0, 'w': W, 'h': H}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': W, 'h': H}, 'sourceSize': {'w': W, 'h': H}},
        },
        'meta': {'image': 'ferri.png', 'size': {'w': W * 2 + 2, 'h': H}, 'scale': '1',
                 'app': 'tools/generar-ferri.py',
                 # Para gf-ferri.js: la flotación y la cubierta, en px del cuadro (1x).
                 'agua': AGUA, 'popa': X0, 'proa': X1, 'farol': [133, 93],
                 # los pies de quien va de pie: el barquero junto a la cabina, el pasajero en medio
                 'barquero': [72, pies_en_cubierta(72)], 'pasajero': [88, pies_en_cubierta(88)]},
    }
    tmp = os.path.join(SALIDA, 'ferri.json.tmp')
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(meta, f, indent=1)
        f.write('\n')
    os.replace(tmp, os.path.join(SALIDA, 'ferri.json'))
    guardar_png(muelle(), os.path.join(SALIDA, 'muelle.png'))
    guardar_png(cartel(), os.path.join(SALIDA, 'cartel.png'))
    print('ferri.png', hoja.size, '| muelle.png', (MW, MH), '| cartel.png -> ' + os.path.normpath(SALIDA))
    if '--ver' in sys.argv:
        destino = sys.argv[sys.argv.index('--ver') + 1]
        esc = 4
        muestra = Image.new('RGBA', ((W + 110) * esc, (H + 60) * esc), (54, 104, 150, 255))
        f = Image.alpha_composite(atras, delante)
        muestra.alpha_composite(f.resize((W * esc, H * esc), Image.NEAREST), (0, 0))
        mu = muelle()
        muestra.alpha_composite(mu.resize((MW * esc, MH * esc), Image.NEAREST), (0, (H + 8) * esc))
        ca = cartel()
        muestra.alpha_composite(ca.resize((28 * esc, 34 * esc), Image.NEAREST), ((W + 20) * esc, 10 * esc))
        muestra.save(destino)
        print('muestra:', destino)


if __name__ == '__main__':
    main()
