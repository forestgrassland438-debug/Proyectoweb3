#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF PECES CATALOGO — que peces hay
=============================================================================

El catalogo esta separado del pincel (`gf_peces_arte.py`) a proposito: aqui no
se dibuja nada y alli no se nombra ninguna especie. Asi se puede anadir un pez
sin tocar el motor y arreglar el motor sin tocar las 380 especies.

COMO SE LEE UNA FICHA
---------------------------------------------------------------------------
    trucha_arcoiris | Trucha arcoiris | trucha | comun | pal=trucha_iris

    id       nombre de archivo y de item (pez_<id>.png)
    nombre   el que ve el jugador
    grupo    de donde saca la forma: arquetipo, tamano, paletas y patrones
    rareza   comun / poco_comun / rara / epica / legendaria
    extras   lo que se quiera fijar a mano: pal=, patron=, largo=, mal=, ...

Lo que NO se escribe se sortea del grupo con un dado sembrado por el id del
pez (`rng_de`), asi que es siempre el mismo y no hace falta elegir paleta y
patron 380 veces. Lo que si se escribe manda: los peces reconocibles (el koi,
el payaso, el salmon) llevan su paleta puesta a mano, porque un payaso naranja
y blanco sorteado al azar no es un payaso.

POR QUE LOS GRUPOS
---------------------------------------------------------------------------
Un grupo es "que clase de bicho es". Las diez truchas del catalogo comparten
arquetipo, rango de tamano y familia de patrones, y se diferencian en la
librea; una trucha y una anguila no comparten nada. Sin esa capa, o se repite
la misma configuracion en cada ficha (y se cuela una anguila con aletas de
trucha) o se sortea todo (y salen 380 peces genericos).
"""

# ===========================================================================
# GRUPOS
#   arq       arquetipo de gf_peces_arte
#   tam       (min, max) del largo del cuerpo en pixeles
#   pal       paletas posibles
#   patron    patrones posibles
#   extra     lo que se pasa tal cual al pincel
# ===========================================================================

def G(arq, tam, pal, patron=('liso',), **extra):
    return dict(arq=arq, tam=tam, pal=list(pal), patron=list(patron), extra=extra)


GRUPOS = {
    # --- agua dulce ------------------------------------------------------
    'trucha':     G('fusiforme', (18, 26), ['trucha_iris', 'trucha_marron', 'trucha_arroyo', 'salvelino'],
                    ['puntos', 'moteado', 'manchas']),
    'salmon':     G('fusiforme', (22, 30), ['salmon', 'salmon_rojo', 'artico_plata'],
                    ['puntos', 'liso', 'lateral']),
    'carpa':      G('alto', (20, 28), ['carpa_bronce', 'koi_naranja', 'koi_rojo', 'koi_negro', 'dorado'],
                    ['mosaico', 'manchas', 'liso'], escamas=True),
    'ciprinido':  G('fusiforme', (12, 18), ['gobio', 'barbo', 'tenca', 'boqueron'],
                    ['liso', 'lateral', 'moteado']),
    'perca':      G('alto', (17, 24), ['perca', 'lubina_verde'], ['bandas', 'chevron']),
    'lucio':      G('fusiforme_rapido', (26, 32), ['lucio', 'limo_verde'], ['manchas', 'vetas', 'moteado'],
                    boca='dientes'),
    'siluro':     G('bagre', (24, 32), ['siluro', 'pez_gato_albino', 'turbio'], ['moteado', 'manchas']),
    'esturion':   G('bagre', (26, 32), ['esturion', 'artico_plata'], ['franja_dorsal', 'liso']),
    'anguila':    G('anguila', (26, 34), ['anguila_oliva', 'anguila_negra', 'congrio', 'morena'],
                    ['liso', 'manchas', 'moteado']),
    'pez_disco':  G('disco', (14, 20), ['disco_rojo', 'mandarin', 'betta'], ['bandas', 'vetas', 'liso']),
    'menudo':     G('fusiforme', (8, 14), ['neon_tetra', 'guppy', 'gobio'], ['lateral', 'liso']),
    'pirana':     G('alto', (14, 20), ['pirana'], ['liso', 'lateral', 'moteado'], boca='dientes'),
    'arowana':    G('aguja', (28, 34), ['arowana', 'dorado'], ['mosaico', 'liso'], escamas=True),

    # --- mar -------------------------------------------------------------
    'sardina':    G('fusiforme', (14, 20), ['sardina', 'arenque', 'boqueron', 'jurel'], ['lateral', 'liso']),
    'caballa':    G('fusiforme_rapido', (20, 26), ['caballa', 'bonito'], ['vetas', 'rayas']),
    'atun':       G('fusiforme_rapido', (26, 32), ['atun', 'bonito', 'jurel'], ['liso', 'lateral']),
    'picudo':     G('vela', (28, 32), ['pez_espada', 'tormenta', 'atun'], ['liso', 'bandas']),
    'dorada':     G('alto', (18, 26), ['dorada', 'besugo', 'salmonete', 'sargo'],
                    ['bandas', 'liso', 'franja_dorsal'], escamas=True),
    'lubina':     G('fusiforme', (20, 28), ['lubina_plata', 'sargo', 'merluza'], ['liso', 'lateral']),
    'bacalao':    G('fusiforme', (22, 30), ['bacalao', 'merluza', 'abadejo'], ['moteado', 'manchas']),
    'plano':      G('plano', (18, 26), ['lenguado', 'platija', 'rodaballo'], ['moteado', 'manchas', 'puntos']),
    'raya':       G('raya', (22, 30), ['raya_gris', 'artico_plata'], ['puntos', 'manchas']),
    'tiburon':    G('tiburon', (28, 32), ['tiburon_gris', 'tiburon_azul'], ['liso', 'vientre_claro'],
                    boca='dientes'),
    'martillo':   G('martillo', (30, 32), ['tiburon_gris', 'tiburon_azul'], ['liso'], boca='dientes'),
    'mero':       G('cabezon', (22, 30), ['mero', 'cabracho', 'rape'], ['manchas', 'moteado'], boca='grande'),
    'barracuda':  G('fusiforme_rapido', (28, 32), ['barracuda', 'lubina_plata'], ['liso', 'lateral'],
                    boca='dientes'),
    'pez_luna':   G('luna', (26, 32), ['perla', 'artico_plata', 'quimera'], ['liso', 'moteado']),

    # --- arrecife ---------------------------------------------------------
    'payaso':     G('alto', (12, 18), ['payaso', 'pez_payaso_rosa'], ['bandas']),
    'cirujano':   G('disco', (14, 20), ['cirujano_azul', 'damisela'], ['liso', 'lateral']),
    'mariposa':   G('disco', (14, 20), ['mariposa', 'angel_real'], ['bandas', 'diamante', 'ocelo']),
    'loro':       G('alto', (18, 26), ['loro_verde', 'napoleon', 'labrido'], ['mosaico', 'vetas']),
    'globo':      G('globo', (16, 22), ['pez_globo', 'pez_cofre'], ['puntos', 'manchas']),
    'cofre':      G('cofre', (14, 20), ['pez_cofre', 'mandarin'], ['mosaico', 'puntos']),
    'leon':       G('cabezon', (16, 22), ['pez_leon', 'cabracho'], ['bandas'], boca='grande'),

    # --- abismo -----------------------------------------------------------
    'rape':       G('linterna', (18, 26), ['rape_abisal', 'abisal_negro', 'quimera'], ['liso', 'bioluz'],
                    boca='dientes'),
    'vibora':     G('aguja', (22, 30), ['vibora_mar', 'abisal_negro'], ['bioluz', 'liso'], boca='dientes'),
    'linternilla': G('fusiforme', (12, 18), ['linterna', 'abisal_negro'], ['bioluz']),
    'gelatinoso': G('cabezon', (18, 26), ['pez_gelatina', 'quimera', 'pelicano'], ['liso', 'moteado']),
    'nautilo':    G('caracola', (16, 24), ['nautilo', 'perla', 'caracola'], ['liso']),

    # --- invertebrados -----------------------------------------------------
    'cangrejo':   G('cangrejo', (16, 26), ['cangrejo_rojo', 'cangrejo_verde', 'buey_mar'], ['liso', 'moteado']),
    'gamba':      G('gamba', (14, 22), ['gamba_rosa', 'coral_vivo'], ['liso']),
    'langosta':   G('langosta', (22, 30), ['langosta_azul', 'cangrejo_rojo', 'buey_mar'], ['liso']),
    'pulpo':      G('pulpo', (18, 28), ['pulpo_purpura', 'coral_vivo', 'calamar'], ['liso']),
    'calamar':    G('calamar', (18, 28), ['calamar', 'perla', 'pulpo_purpura'], ['liso']),
    'medusa':     G('medusa', (16, 24), ['medusa_luna', 'medusa_fuego', 'espectral'], ['liso']),
    'concha':     G('concha', (12, 20), ['ostra', 'vieira', 'mejillon', 'perla'], ['liso']),
    'caracola':   G('caracola', (14, 22), ['caracola', 'nautilo', 'perla'], ['liso']),
    'estrella':   G('estrella', (14, 22), ['estrella_mar', 'coral_vivo', 'amatista'], ['liso']),
    'erizo':      G('erizo', (12, 18), ['erizo', 'obsidiana'], ['liso']),
    'pepino':     G('pepino', (16, 24), ['pepino_mar', 'turbio'], ['liso']),
    'caballito':  G('caballito', (16, 24), ['dorado', 'coral_vivo', 'jade', 'amatista'], ['liso']),

    # --- pantano y charca ---------------------------------------------------
    'rana':       G('rana', (14, 20), ['rana_verde', 'limo_verde', 'cieno'], ['liso', 'manchas']),
    'renacuajo':  G('renacuajo', (8, 12), ['cieno', 'limo_verde', 'sanguijuela'], ['liso']),
    'gusano':     G('gusano', (12, 18), ['sanguijuela', 'turbio', 'cieno'], ['liso']),
    'serpiente':  G('serpiente', (26, 34), ['limo_verde', 'cieno', 'anguila_oliva'], ['bandas', 'manchas']),
    'tortuga':    G('tortuga', (18, 26), ['tortuga', 'jade', 'cieno'], ['liso']),
    'cieno':      G('cabezon', (16, 24), ['cieno', 'turbio', 'sanguijuela'], ['manchas', 'moteado']),

    # --- hielo y caverna ------------------------------------------------------
    'artico':     G('fusiforme', (20, 28), ['artico_plata', 'bacalao_polar', 'escarcha'], ['liso', 'moteado']),
    'hielo':      G('alto', (18, 26), ['cristal_hielo', 'escarcha', 'artico_plata'], ['liso', 'diamante']),
    'ciego':      G('fusiforme', (14, 22), ['ciego_palido', 'gruta_azul'], ['liso', 'vientre_claro'],
                    ojo_ciego=True),
    'gruta':      G('bagre', (18, 26), ['gruta_azul', 'hongo_pez', 'ciego_palido'], ['moteado', 'manchas']),

    # --- magico ----------------------------------------------------------------
    'espectral':  G('fusiforme', (22, 30), ['espectral', 'lunar', 'perla'], ['liso', 'bioluz']),
    'gema':       G('alto', (20, 28), ['rubi', 'amatista', 'jade', 'celestial'], ['mosaico', 'diamante'],
                    escamas=True),
    'elemental':  G('fusiforme_rapido', (24, 32), ['magma', 'tormenta', 'obsidiana', 'vacio'],
                    ['vetas', 'manchas', 'bioluz']),
    'quimerico':  G('vela', (28, 32), ['arcoiris', 'celestial', 'lunar'], ['bandas', 'ocelo']),
    'abisal_mag': G('linterna', (22, 30), ['vacio', 'obsidiana', 'espectral'], ['bioluz'], boca='dientes'),
}


# ===========================================================================
# ESPECIES
#   id | Nombre | grupo | rareza | extras (opcional, clave=valor,clave=valor)
# ===========================================================================

RIO = """
trucha_arcoiris    | Trucha arcoiris        | trucha    | comun       | pal=trucha_iris,patron=puntos
trucha_comun       | Trucha comun           | trucha    | comun       | pal=trucha_marron,patron=puntos
trucha_de_arroyo   | Trucha de arroyo       | trucha    | comun       | pal=trucha_arroyo
trucha_dorada      | Trucha dorada          | trucha    | rara        | pal=dorado,patron=puntos
trucha_de_lago     | Trucha lacustre        | trucha    | poco_comun
trucha_alpina      | Trucha alpina          | trucha    | poco_comun  | pal=salvelino
salvelino          | Salvelino              | trucha    | poco_comun  | pal=salvelino,patron=moteado
reo                | Reo                    | trucha    | rara
salmon_atlantico   | Salmon atlantico       | salmon    | poco_comun  | pal=salmon
salmon_rojo        | Salmon rojo            | salmon    | poco_comun  | pal=salmon_rojo
salmon_plateado    | Salmon plateado        | salmon    | rara        | pal=artico_plata
salmon_real        | Salmon real            | salmon    | epica       | pal=salmon,largo=30
esguin             | Esguin                 | menudo    | comun       | pal=artico_plata
barbo_comun        | Barbo comun            | ciprinido | comun       | pal=barbo
barbo_gitano       | Barbo gitano           | ciprinido | comun
boga_de_rio        | Boga de rio            | ciprinido | comun
bermejuela         | Bermejuela             | ciprinido | comun
cachuelo           | Cachuelo               | ciprinido | comun
piscardo           | Piscardo               | menudo    | comun
gobio_de_rio       | Gobio de rio           | ciprinido | comun       | pal=gobio
madrilla           | Madrilla               | ciprinido | comun
lucio_del_norte    | Lucio del norte        | lucio     | poco_comun  | pal=lucio
lucioperca         | Lucioperca             | perca     | poco_comun  | pal=perca
perca_de_rio       | Perca de rio           | perca     | comun       | pal=perca,patron=bandas
perca_sol          | Perca sol              | perca     | comun       | pal=dorada
lubina_negra       | Lubina negra           | perca     | poco_comun  | pal=lubina_verde
carpa_comun        | Carpa comun            | carpa     | comun       | pal=carpa_bronce
carpa_espejo       | Carpa espejo           | carpa     | poco_comun  | pal=carpa_bronce,patron=manchas
carpa_herbivora    | Carpa herbivora        | carpa     | comun
carpin_dorado      | Carpin dorado          | carpa     | comun       | pal=dorado
koi_naranja        | Koi naranja            | carpa     | rara        | pal=koi_naranja,patron=manchas
koi_carmesi        | Koi carmesi            | carpa     | rara        | pal=koi_rojo,patron=manchas
koi_de_tinta       | Koi de tinta           | carpa     | epica       | pal=koi_negro,patron=manchas
tenca              | Tenca                  | ciprinido | comun       | pal=tenca,largo=18
siluro             | Siluro                 | siluro    | rara        | pal=siluro,largo=30
pez_gato_negro     | Pez gato negro         | siluro    | comun       | pal=siluro
pez_gato_moteado   | Pez gato moteado       | siluro    | comun       | patron=moteado
esturion_comun     | Esturion               | esturion  | rara        | pal=esturion
esturion_beluga    | Esturion beluga        | esturion  | epica       | pal=esturion,largo=32
anguila_de_rio     | Anguila de rio         | anguila   | poco_comun  | pal=anguila_oliva
angula             | Angula                 | menudo    | poco_comun  | pal=anguila_oliva
lamprea            | Lamprea                | anguila   | poco_comun  | pal=anguila_negra
nutria_de_agua     | Pez nutria             | siluro    | rara
trucha_de_cascada  | Trucha de cascada      | trucha    | rara        | patron=manchas
sabalo             | Sabalo                 | sardina   | comun       | pal=sardina,largo=20
"""

LAGO = """
carpa_de_espejo    | Carpa espejada         | carpa     | poco_comun  | patron=mosaico
carpa_luna         | Carpa de luna          | carpa     | rara        | pal=lunar
carpin_rojo        | Carpin rojo            | carpa     | comun       | pal=koi_rojo
tenca_dorada       | Tenca dorada           | ciprinido | poco_comun  | pal=dorado
perca_de_lago      | Perca de lago          | perca     | comun
lucio_de_juncos    | Lucio de juncos        | lucio     | poco_comun  | patron=manchas
lucio_plateado     | Lucio plateado         | lucio     | rara        | pal=barracuda
pejerrey           | Pejerrey               | sardina   | comun       | pal=sardina
pez_sol            | Pez sol                | perca     | comun       | pal=dorada,patron=puntos
brema              | Brema                  | carpa     | comun       | pal=carpa_bronce
cacho              | Cacho                  | ciprinido | comun
gobio_de_fango     | Gobio de fango         | ciprinido | comun       | pal=turbio
platija_de_lago    | Platija de lago        | plano     | poco_comun
anguila_de_lago    | Anguila de lago        | anguila   | poco_comun
almeja_de_rio      | Almeja de rio          | concha    | comun       | pal=mejillon
mejillon_de_agua   | Mejillon de agua dulce | concha    | comun       | pal=mejillon
cangrejo_de_rio    | Cangrejo de rio        | cangrejo  | comun       | pal=cangrejo_verde
cangrejo_senal     | Cangrejo senal         | cangrejo  | poco_comun  | pal=cangrejo_rojo
gamba_de_agua      | Gamba de agua dulce    | gamba     | comun
caracol_de_estanque| Caracol de estanque    | caracola  | comun       | pal=caracola
tortuga_de_estanque| Tortuga de estanque    | tortuga   | poco_comun  | pal=tortuga
tortuga_pintada    | Tortuga pintada        | tortuga   | rara        | pal=jade
rana_verde         | Rana verde             | rana      | comun       | pal=rana_verde
rana_toro          | Rana toro              | rana      | poco_comun  | pal=limo_verde,largo=20
renacuajo          | Renacuajo              | renacuajo | comun
tritón_de_lago     | Triton de lago         | rana      | poco_comun  | pal=cieno
esturion_de_lago   | Esturion de lago       | esturion  | rara
trucha_de_altura   | Trucha de altura       | trucha    | poco_comun  | pal=escarcha
pez_espejo         | Pez espejo             | gema      | epica       | pal=perla,patron=mosaico
locha              | Locha                  | gusano    | comun       | pal=turbio
locha_espinosa     | Locha espinosa         | gusano    | poco_comun
pez_luna_de_lago   | Pez luna de lago       | perca     | poco_comun  | pal=dorada
"""

PANTANO = """
siluro_de_cieno    | Siluro de cieno        | siluro    | comun       | pal=cieno
pez_gato_de_lodo   | Pez gato de lodo       | siluro    | comun       | pal=turbio
anguila_de_pantano | Anguila de pantano     | anguila   | comun       | pal=limo_verde
serpiente_de_agua  | Serpiente de agua      | serpiente | poco_comun  | pal=limo_verde
serpiente_de_cieno | Serpiente de cieno     | serpiente | poco_comun  | pal=cieno
sanguijuela        | Sanguijuela            | gusano    | comun       | pal=sanguijuela
gusano_de_fango    | Gusano de fango        | gusano    | comun       | pal=turbio
lombriz_de_agua    | Lombriz de agua        | gusano    | comun       | pal=cieno
rana_de_pantano    | Rana de pantano        | rana      | comun       | pal=limo_verde
rana_arboricola    | Rana arboricola        | rana      | poco_comun  | pal=rana_verde
sapo_de_charca     | Sapo de charca         | rana      | comun       | pal=cieno
tortuga_mordedora  | Tortuga mordedora      | tortuga   | rara        | pal=cieno
pez_pulmonado      | Pez pulmonado          | cieno     | rara
pez_de_barro       | Pez de barro           | cieno     | comun
pez_hoja           | Pez hoja               | plano     | poco_comun  | pal=turbio
carpa_de_junco     | Carpa de junco         | carpa     | comun       | pal=tenca
piraña_roja        | Pirana roja            | pirana    | rara        | pal=pirana
piraña_negra       | Pirana negra           | pirana    | rara        | pal=koi_negro
pez_ciego_de_turba | Pez ciego de turba     | ciego     | rara
salamandra_de_agua | Salamandra de agua     | rana      | rara        | pal=magma
renacuajo_gigante  | Renacuajo gigante      | renacuajo | poco_comun  | largo=12
larva_de_libelula  | Larva de libelula      | gusano    | comun       | pal=limo_verde
caracol_de_fango   | Caracol de fango       | caracola  | comun       | pal=turbio
almeja_de_turba    | Almeja de turba        | concha    | comun       | pal=cieno
cangrejo_de_manglar| Cangrejo de manglar    | cangrejo  | poco_comun  | pal=cangrejo_verde
gamba_de_junco     | Gamba de junco         | gamba     | comun       | pal=turbio
pez_araña_de_lodo  | Pez arana de lodo      | cieno     | rara
anguila_electrica  | Anguila electrica      | anguila   | epica       | pal=tormenta,patron=bioluz
pez_serpiente      | Pez serpiente          | serpiente | rara        | pal=anguila_negra
axolote            | Axolote                | rana      | epica       | pal=pez_payaso_rosa
arowana_dorada     | Arowana dorada         | arowana   | epica       | pal=arowana
arowana_plateada   | Arowana plateada       | arowana   | rara        | pal=artico_plata
pez_disco          | Pez disco              | pez_disco | rara        | pal=disco_rojo
pez_luchador       | Pez luchador           | pez_disco | rara        | pal=betta
"""

COSTA = """
sardina            | Sardina                | sardina   | comun       | pal=sardina
boqueron           | Boqueron               | sardina   | comun       | pal=boqueron
arenque            | Arenque                | sardina   | comun       | pal=arenque
jurel              | Jurel                  | sardina   | comun       | pal=jurel,largo=20
caballa            | Caballa                | caballa   | comun       | pal=caballa,patron=vetas
chicharro          | Chicharro              | sardina   | comun       | pal=jurel
salmonete          | Salmonete              | dorada    | poco_comun  | pal=salmonete
sargo              | Sargo                  | dorada    | comun       | pal=sargo,patron=bandas
dorada             | Dorada                 | dorada    | poco_comun  | pal=dorada
besugo             | Besugo                 | dorada    | poco_comun  | pal=besugo
breca              | Breca                  | dorada    | comun
mojarra            | Mojarra                | dorada    | comun       | pal=sargo
lubina             | Lubina                 | lubina    | poco_comun  | pal=lubina_plata
baila              | Baila                  | lubina    | comun
corvina            | Corvina                | lubina    | poco_comun
lisa               | Lisa                   | lubina    | comun
robalo             | Robalo                 | lubina    | poco_comun
lenguado           | Lenguado               | plano     | poco_comun  | pal=lenguado
platija            | Platija                | plano     | comun       | pal=platija
acedia             | Acedia                 | plano     | comun       | pal=lenguado,largo=18
rodaballo          | Rodaballo              | plano     | rara        | pal=rodaballo
gallo              | Gallo                  | plano     | comun
cabracho           | Cabracho               | mero      | rara        | pal=cabracho
rascacio           | Rascacio               | mero      | poco_comun  | pal=cabracho
congrio            | Congrio                | anguila   | poco_comun  | pal=congrio
morena             | Morena                 | anguila   | rara        | pal=morena,boca=dientes
pulpo_de_roca      | Pulpo de roca          | pulpo     | poco_comun  | pal=pulpo_purpura
sepia              | Sepia                  | calamar   | comun       | pal=calamar
calamar            | Calamar                | calamar   | comun       | pal=calamar
chipiron           | Chipiron               | calamar   | comun       | largo=18
"""

MAR = """
atun_rojo          | Atun rojo              | atun      | rara        | pal=atun
atun_claro         | Atun claro             | atun      | poco_comun  | pal=bonito
bonito_del_norte   | Bonito del norte       | atun      | poco_comun  | pal=bonito
listado            | Listado                | atun      | comun       | patron=vetas
melva              | Melva                  | caballa   | comun
pez_espada         | Pez espada             | picudo    | epica       | pal=pez_espada
marlin_azul        | Marlin azul            | picudo    | epica       | pal=tormenta
pez_vela           | Pez vela               | picudo    | epica       | pal=atun
aguja_imperial     | Aguja imperial         | picudo    | legendaria  | pal=celestial
dorado_de_altura   | Dorado de altura       | atun      | rara        | pal=dorado
bacalao            | Bacalao                | bacalao   | comun       | pal=bacalao
merluza            | Merluza                | bacalao   | comun       | pal=merluza
abadejo            | Abadejo                | bacalao   | comun       | pal=abadejo
maruca             | Maruca                 | bacalao   | poco_comun
faneca             | Faneca                 | bacalao   | comun
mero               | Mero                   | mero      | rara        | pal=mero
cherna             | Cherna                 | mero      | rara        | pal=mero
denton             | Denton                 | dorada    | rara
pargo              | Pargo                  | dorada    | poco_comun  | pal=besugo
palometa           | Palometa               | dorada    | poco_comun  | pal=lubina_plata
japuta             | Japuta                 | dorada    | comun
barracuda          | Barracuda              | barracuda | rara        | pal=barracuda
tiburon_azul       | Tiburon azul           | tiburon   | epica       | pal=tiburon_azul
tintorera          | Tintorera              | tiburon   | rara        | pal=tiburon_gris
marrajo            | Marrajo                | tiburon   | epica       | pal=tiburon_azul
cazon              | Cazon                  | tiburon   | poco_comun  | largo=28
pez_martillo       | Pez martillo           | martillo  | epica       | pal=tiburon_gris
raya_comun         | Raya comun             | raya      | poco_comun  | pal=raya_gris
raya_manchada      | Raya manchada          | raya      | poco_comun  | patron=puntos
mantarraya         | Mantarraya             | raya      | epica       | largo=30
torpedo            | Pez torpedo            | raya      | rara        | pal=tormenta
chucho             | Chucho                 | raya      | poco_comun
pez_luna           | Pez luna               | pez_luna  | epica       | pal=perla
pez_luna_gris      | Pez luna gris          | pez_luna  | rara        | pal=artico_plata
langosta_comun     | Langosta               | langosta  | rara        | pal=cangrejo_rojo
bogavante          | Bogavante              | langosta  | rara        | pal=langosta_azul
cigala             | Cigala                 | gamba     | poco_comun  | pal=gamba_rosa
gamba_roja         | Gamba roja             | gamba     | poco_comun  | pal=coral_vivo
langostino         | Langostino             | gamba     | comun       | pal=gamba_rosa
quisquilla         | Quisquilla             | gamba     | comun       | largo=14
buey_de_mar        | Buey de mar            | cangrejo  | poco_comun  | pal=buey_mar
centollo           | Centollo               | cangrejo  | rara        | pal=cangrejo_rojo
necora             | Necora                 | cangrejo  | comun       | pal=cangrejo_verde
cangrejo_ermitano  | Cangrejo ermitano      | caracola  | comun       | pal=caracola
percebe            | Percebe                | concha    | rara        | pal=mejillon
mejillon           | Mejillon               | concha    | comun       | pal=mejillon
ostra              | Ostra                  | concha    | poco_comun  | pal=ostra
vieira             | Vieira                 | concha    | poco_comun  | pal=vieira
almeja_fina        | Almeja fina            | concha    | comun       | pal=ostra
navaja             | Navaja                 | concha    | comun       | pal=perla
pulpo_comun        | Pulpo comun            | pulpo     | poco_comun  | pal=pulpo_purpura
calamar_gigante    | Calamar gigante        | calamar   | legendaria  | largo=28
potа               | Pota                   | calamar   | comun       | pal=calamar
medusa_luna        | Medusa luna            | medusa    | comun       | pal=medusa_luna
medusa_de_fuego    | Medusa de fuego        | medusa    | poco_comun  | pal=medusa_fuego
erizo_de_mar       | Erizo de mar           | erizo     | comun       | pal=erizo
estrella_de_mar    | Estrella de mar        | estrella  | comun       | pal=estrella_mar
pepino_de_mar      | Pepino de mar          | pepino    | comun       | pal=pepino_mar
caracola_marina    | Caracola marina        | caracola  | poco_comun  | pal=caracola
"""

ARRECIFE = """
pez_payaso         | Pez payaso             | payaso    | poco_comun  | pal=payaso,patron=bandas
payaso_rosa        | Payaso rosa            | payaso    | rara        | pal=pez_payaso_rosa
cirujano_azul      | Cirujano azul          | cirujano  | poco_comun  | pal=cirujano_azul
cirujano_amarillo  | Cirujano amarillo      | cirujano  | poco_comun  | pal=mariposa
pez_mariposa       | Pez mariposa           | mariposa  | poco_comun  | pal=mariposa
mariposa_de_bandas | Mariposa de bandas     | mariposa  | poco_comun  | patron=bandas
pez_angel_real     | Pez angel real         | mariposa  | rara        | pal=angel_real
angel_emperador    | Angel emperador        | mariposa  | rara        | pal=angel_real,patron=bandas
pez_loro           | Pez loro               | loro      | poco_comun  | pal=loro_verde
loro_arcoiris      | Loro arcoiris          | loro      | rara        | pal=arcoiris
napoleon           | Napoleon               | loro      | epica       | pal=napoleon,largo=26
budion             | Budion                 | loro      | comun       | pal=labrido
doncella           | Doncella               | loro      | comun       | pal=labrido
damisela_azul      | Damisela azul          | cirujano  | comun       | pal=damisela
pez_mandarin       | Pez mandarin           | cofre     | rara        | pal=mandarin
pez_globo          | Pez globo              | globo     | poco_comun  | pal=pez_globo
globo_estrellado   | Globo estrellado       | globo     | rara        | patron=puntos
pez_erizo          | Pez erizo              | globo     | rara        | pal=pez_globo,patron=manchas
pez_cofre          | Pez cofre              | cofre     | poco_comun  | pal=pez_cofre
cofre_amarillo     | Cofre amarillo         | cofre     | rara        | pal=pez_cofre,patron=puntos
pez_leon           | Pez leon               | leon      | rara        | pal=pez_leon
pez_piedra         | Pez piedra             | mero      | rara        | pal=rape
pez_cerdo          | Pez cerdo              | dorada    | comun       | pal=besugo
pez_ardilla        | Pez ardilla            | dorada    | comun       | pal=besugo,patron=rayas
gobio_de_coral     | Gobio de coral         | menudo    | comun       | pal=mandarin
blenio             | Blenio                 | menudo    | comun       | pal=labrido
pez_aguja          | Pez aguja              | vibora    | poco_comun  | pal=barracuda,boca=normal
caballito_de_mar   | Caballito de mar       | caballito | rara        | pal=dorado
caballito_pigmeo   | Caballito pigmeo       | caballito | epica       | pal=coral_vivo,largo=16
caballito_espinoso | Caballito espinoso     | caballito | rara        | pal=jade
estrella_de_coral  | Estrella de coral      | estrella  | poco_comun  | pal=coral_vivo
estrella_corona    | Estrella corona        | estrella  | rara        | pal=amatista
erizo_diadema      | Erizo diadema          | erizo     | poco_comun  | pal=obsidiana
nudibranquio       | Nudibranquio           | gusano    | rara        | pal=coral_vivo
pulpo_de_arrecife  | Pulpo de arrecife      | pulpo     | rara        | pal=coral_vivo
sepia_flamenca     | Sepia flamenca         | calamar   | epica       | pal=arcoiris
almeja_gigante     | Almeja gigante         | concha    | rara        | pal=vieira,largo=20
caracola_reina     | Caracola reina         | caracola  | rara        | pal=caracola,largo=22
gamba_limpiadora   | Gamba limpiadora       | gamba     | poco_comun  | pal=coral_vivo
cangrejo_porcelana | Cangrejo porcelana     | cangrejo  | poco_comun  | pal=perla
"""

ABISMO = """
rape_abisal        | Rape abisal            | rape      | rara        | pal=rape_abisal
rape_de_linterna   | Rape de linterna       | rape      | rara        | pal=abisal_negro,patron=bioluz
pez_vibora         | Pez vibora             | vibora    | rara        | pal=vibora_mar
pez_hacha          | Pez hacha              | linternilla | poco_comun | pal=linterna,patron=bioluz
pez_linterna       | Pez linterna           | linternilla | comun     | pal=linterna
pez_pelicano       | Pez pelicano           | rape      | epica       | pal=pelicano
anguila_engullidora| Anguila engullidora    | anguila   | epica       | pal=abisal_negro
pez_gelatina       | Pez gelatina           | gelatinoso | rara       | pal=pez_gelatina
pez_borron         | Pez borron             | gelatinoso | rara       | pal=pez_gelatina
quimera            | Quimera                | gelatinoso | epica      | pal=quimera
pez_duende         | Pez duende             | vibora    | epica       | pal=quimera
granadero          | Granadero              | bacalao   | poco_comun  | pal=abisal_negro
pez_tripode        | Pez tripode            | linternilla | rara      | pal=abisal_negro
pez_ogro           | Pez ogro               | rape      | epica       | pal=abisal_negro,boca=dientes
pez_dragon_negro   | Pez dragon negro       | vibora    | epica       | pal=abisal_negro,patron=bioluz
tiburon_duende     | Tiburon duende         | tiburon   | legendaria  | pal=pez_payaso_rosa
tiburon_linterna   | Tiburon linterna       | tiburon   | epica       | pal=abisal_negro,patron=bioluz
isopodo_gigante    | Isopodo gigante        | cangrejo  | rara        | pal=quimera
cangrejo_yeti      | Cangrejo yeti          | cangrejo  | epica       | pal=perla
calamar_vampiro    | Calamar vampiro        | calamar   | epica       | pal=vacio
pulpo_dumbo        | Pulpo dumbo            | pulpo     | rara        | pal=pez_gelatina
medusa_abisal      | Medusa abisal          | medusa    | rara        | pal=espectral,patron=bioluz
nautilo            | Nautilo                | nautilo   | rara        | pal=nautilo
nautilo_de_perla   | Nautilo de perla       | nautilo   | epica       | pal=perla
pepino_abisal      | Pepino abisal          | pepino    | poco_comun  | pal=quimera
estrella_de_abismo | Estrella de abismo     | estrella  | rara        | pal=vacio
gusano_de_tubo     | Gusano de tubo         | gusano    | poco_comun  | pal=coral_vivo
celacanto          | Celacanto              | mero      | legendaria  | pal=gruta_azul,largo=30
pez_de_cristal_abisal | Pez de cristal      | espectral | rara        | pal=perla
anguila_espectral  | Anguila espectral      | anguila   | epica       | pal=espectral
"""

HIELO = """
bacalao_polar      | Bacalao polar          | artico    | comun       | pal=bacalao_polar
trucha_de_hielo    | Trucha de hielo        | artico    | poco_comun  | pal=escarcha
salvelino_artico   | Salvelino artico       | artico    | poco_comun  | pal=salvelino
arenque_polar      | Arenque polar          | sardina   | comun       | pal=artico_plata
capelan            | Capelan                | sardina   | comun       | pal=artico_plata
fletan             | Fletan                 | plano     | rara        | pal=rodaballo,largo=26
platija_polar      | Platija polar          | plano     | poco_comun  | pal=escarcha
lucio_de_escarcha  | Lucio de escarcha      | lucio     | rara        | pal=escarcha
perca_de_hielo     | Perca de hielo         | hielo     | poco_comun  | pal=cristal_hielo
pez_de_cristal     | Pez de cristal helado  | hielo     | rara        | pal=cristal_hielo,patron=diamante
pez_escarcha       | Pez escarcha           | hielo     | poco_comun  | pal=escarcha
draco_blanco       | Draco blanco           | artico    | rara        | pal=ciego_palido
lompo              | Lompo                  | globo     | poco_comun  | pal=escarcha
cangrejo_de_nieve  | Cangrejo de nieve      | cangrejo  | rara        | pal=artico_plata
cangrejo_real      | Cangrejo real          | cangrejo  | epica       | pal=cangrejo_rojo,largo=26
gamba_polar        | Gamba polar            | gamba     | comun       | pal=artico_plata
krill              | Krill                  | gamba     | comun       | largo=14
medusa_de_hielo    | Medusa de hielo        | medusa    | rara        | pal=cristal_hielo
anguila_de_hielo   | Anguila de hielo       | anguila   | rara        | pal=escarcha
esturion_blanco    | Esturion blanco        | esturion  | epica       | pal=artico_plata
pez_luna_polar     | Pez luna polar         | pez_luna  | epica       | pal=cristal_hielo
caracola_de_hielo  | Caracola de hielo      | caracola  | poco_comun  | pal=cristal_hielo
estrella_polar     | Estrella polar         | estrella  | poco_comun  | pal=artico_plata
concha_helada      | Concha helada          | concha    | comun       | pal=escarcha
tiburon_de_groenlandia | Tiburon de Groenlandia | tiburon | legendaria | pal=artico_plata
"""

CAVERNA = """
pez_ciego          | Pez ciego              | ciego     | poco_comun  | pal=ciego_palido
pez_ciego_albino   | Pez ciego albino       | ciego     | rara        | pal=ciego_palido
tetra_ciego        | Tetra ciego            | ciego     | comun       | largo=14
siluro_de_gruta    | Siluro de gruta        | gruta     | poco_comun  | pal=gruta_azul
pez_gato_cavernario| Pez gato cavernario    | gruta     | poco_comun  | pal=hongo_pez
salamandra_ciega   | Salamandra ciega       | rana      | rara        | pal=ciego_palido
proteo             | Proteo                 | rana      | rara        | pal=pez_payaso_rosa
anguila_de_gruta   | Anguila de gruta       | anguila   | poco_comun  | pal=gruta_azul
gobio_de_pozo      | Gobio de pozo          | ciego     | comun
pez_de_estalactita | Pez de estalactita     | hielo     | rara        | pal=gruta_azul
camaron_de_gruta   | Camaron de gruta       | gamba     | comun       | pal=ciego_palido
cangrejo_de_gruta  | Cangrejo de gruta      | cangrejo  | poco_comun  | pal=gruta_azul
caracol_ciego      | Caracol ciego          | caracola  | comun       | pal=ciego_palido
gusano_de_gruta    | Gusano de gruta        | gusano    | comun       | pal=hongo_pez
pez_hongo          | Pez hongo              | gruta     | rara        | pal=hongo_pez
pez_de_azufre      | Pez de azufre          | gruta     | rara        | pal=magma
trucha_subterranea | Trucha subterranea     | trucha    | poco_comun  | pal=gruta_azul
larva_de_gruta     | Larva de gruta         | renacuajo | comun       | pal=hongo_pez
pez_fosil          | Pez fosil              | mero      | epica       | pal=esturion
pez_de_obsidiana   | Pez de obsidiana       | gema      | epica       | pal=obsidiana
"""

MAGICO = """
pez_espectral      | Pez espectral          | espectral | epica       | pal=espectral
pez_lunar          | Pez lunar              | espectral | epica       | pal=lunar
pez_estelar        | Pez estelar            | espectral | legendaria  | pal=celestial,patron=bioluz
pez_de_rubi        | Pez de rubi            | gema      | epica       | pal=rubi
pez_de_amatista    | Pez de amatista        | gema      | epica       | pal=amatista
pez_de_jade        | Pez de jade            | gema      | epica       | pal=jade
pez_de_perla       | Pez de perla           | gema      | rara        | pal=perla
pez_dorado_antiguo | Pez dorado antiguo     | gema      | legendaria  | pal=celestial
salamandra_de_magma| Salamandra de magma    | elemental | legendaria  | pal=magma
pez_de_magma       | Pez de magma           | elemental | epica       | pal=magma
pez_de_tormenta    | Pez de tormenta        | elemental | epica       | pal=tormenta
pez_de_vacio       | Pez del vacio          | elemental | legendaria  | pal=vacio
pez_de_obsidiana_vivo | Pez de obsidiana    | elemental | epica       | pal=obsidiana
serpiente_marina   | Serpiente marina       | serpiente | legendaria  | pal=jade,largo=34
leviatan_menor     | Leviatan menor         | quimerico | legendaria  | pal=tormenta
dragon_de_agua     | Dragon de agua         | quimerico | legendaria  | pal=jade
pez_arcoiris       | Pez arcoiris           | quimerico | epica       | pal=arcoiris
pez_del_alba       | Pez del alba           | quimerico | epica       | pal=celestial
guardian_del_lago  | Guardian del lago      | quimerico | legendaria  | pal=lunar
sombra_abisal      | Sombra abisal          | abisal_mag | legendaria | pal=vacio
devorador_palido   | Devorador palido       | abisal_mag | epica      | pal=espectral
terror_de_obsidiana| Terror de obsidiana    | abisal_mag | legendaria | pal=obsidiana
medusa_espectral   | Medusa espectral       | medusa    | epica       | pal=espectral
medusa_estelar     | Medusa estelar         | medusa    | legendaria  | pal=celestial
pulpo_del_vacio    | Pulpo del vacio        | pulpo     | legendaria  | pal=vacio
kraken_menor       | Kraken menor           | calamar   | legendaria  | pal=obsidiana,largo=28
caballito_celeste  | Caballito celeste      | caballito | legendaria  | pal=celestial
tortuga_ancestral  | Tortuga ancestral      | tortuga   | legendaria  | pal=jade,largo=26
cangrejo_de_ambar  | Cangrejo de ambar      | cangrejo  | epica       | pal=dorado
concha_de_nacar    | Concha de nacar        | concha    | rara        | pal=perla
estrella_celeste   | Estrella celeste       | estrella  | epica       | pal=celestial
caracola_del_eco   | Caracola del eco       | caracola  | epica       | pal=lunar
"""

# ---------------------------------------------------------------------------
# LOS MALOS. Tres formas de serlo, y cada una se pesca por un motivo distinto:
# el podrido llevaba muerto en el anzuelo, el enfermo esta vivo pero no se come
# y el venenoso te hace dano al sacarlo.
# ---------------------------------------------------------------------------

MALOS = """
trucha_podrida     | Trucha podrida         | trucha    | comun       | mal=podrido,bioma=rio
salmon_podrido     | Salmon podrido         | salmon    | comun       | mal=podrido,bioma=rio
carpa_podrida      | Carpa podrida          | carpa     | comun       | mal=podrido,bioma=lago
sardina_podrida    | Sardina podrida        | sardina   | comun       | mal=podrido,bioma=costa
caballa_podrida    | Caballa podrida        | caballa   | comun       | mal=podrido,bioma=costa
bacalao_podrido    | Bacalao podrido        | bacalao   | comun       | mal=podrido,bioma=mar
lubina_podrida     | Lubina podrida         | lubina    | comun       | mal=podrido,bioma=costa
dorada_podrida     | Dorada podrida         | dorada    | comun       | mal=podrido,bioma=costa
anguila_podrida    | Anguila podrida        | anguila   | comun       | mal=podrido,bioma=pantano
siluro_podrido     | Siluro podrido         | siluro    | comun       | mal=podrido,bioma=pantano
perca_podrida      | Perca podrida          | perca     | comun       | mal=podrido,bioma=lago
lucio_podrido      | Lucio podrido          | lucio     | comun       | mal=podrido,bioma=lago
atun_podrido       | Atun podrido           | atun      | poco_comun  | mal=podrido,bioma=mar
mero_podrido       | Mero podrido           | mero      | poco_comun  | mal=podrido,bioma=mar
plano_podrido      | Lenguado podrido       | plano     | comun       | mal=podrido,bioma=costa
gamba_podrida      | Gamba podrida          | gamba     | comun       | mal=podrido,bioma=costa
cangrejo_podrido   | Cangrejo podrido       | cangrejo  | comun       | mal=podrido,bioma=costa
pulpo_podrido      | Pulpo podrido          | pulpo     | comun       | mal=podrido,bioma=mar
calamar_podrido    | Calamar podrido        | calamar   | comun       | mal=podrido,bioma=mar
concha_podrida     | Concha podrida         | concha    | comun       | mal=podrido,bioma=costa
ostra_podrida      | Ostra podrida          | concha    | comun       | mal=podrido,bioma=mar
rana_podrida       | Rana podrida           | rana      | comun       | mal=podrido,bioma=pantano
tenca_podrida      | Tenca podrida          | ciprinido | comun       | mal=podrido,bioma=lago
barbo_podrido      | Barbo podrido          | ciprinido | comun       | mal=podrido,bioma=rio
gobio_podrido      | Gobio podrido          | menudo    | comun       | mal=podrido,bioma=rio
pez_de_gruta_podrido | Pez de gruta podrido | gruta     | comun       | mal=podrido,bioma=caverna
bacalao_polar_podrido | Bacalao polar podrido | artico   | comun       | mal=podrido,bioma=hielo
rape_podrido       | Rape podrido           | rape      | poco_comun  | mal=podrido,bioma=abismo
trucha_enferma     | Trucha enferma         | trucha    | comun       | mal=enfermo,bioma=rio
carpa_enferma      | Carpa enferma          | carpa     | comun       | mal=enfermo,bioma=lago
perca_enferma      | Perca enferma          | perca     | comun       | mal=enfermo,bioma=lago
siluro_enfermo     | Siluro enfermo         | siluro    | comun       | mal=enfermo,bioma=pantano
anguila_enferma    | Anguila enferma        | anguila   | comun       | mal=enfermo,bioma=pantano
lubina_enferma     | Lubina enferma         | lubina    | comun       | mal=enfermo,bioma=costa
sardina_enferma    | Sardina enferma        | sardina   | comun       | mal=enfermo,bioma=costa
bacalao_enfermo    | Bacalao enfermo        | bacalao   | comun       | mal=enfermo,bioma=mar
dorada_enferma     | Dorada enferma         | dorada    | comun       | mal=enfermo,bioma=costa
rana_enferma       | Rana enferma           | rana      | comun       | mal=enfermo,bioma=pantano
renacuajo_enfermo  | Renacuajo enfermo      | renacuajo | comun       | mal=enfermo,bioma=pantano
pez_ciego_enfermo  | Pez ciego enfermo      | ciego     | comun       | mal=enfermo,bioma=caverna
gusano_enfermo     | Gusano palido          | gusano    | comun       | mal=enfermo,bioma=pantano
tortuga_enferma    | Tortuga enferma        | tortuga   | poco_comun  | mal=enfermo,bioma=lago
plano_enfermo      | Platija enferma        | plano     | comun       | mal=enfermo,bioma=costa
mero_enfermo       | Mero enfermo           | mero      | poco_comun  | mal=enfermo,bioma=mar
caballito_enfermo  | Caballito enfermo      | caballito | poco_comun  | mal=enfermo,bioma=arrecife
medusa_enferma     | Medusa deshecha        | medusa    | comun       | mal=enfermo,bioma=mar
pez_globo_venenoso | Pez globo venenoso     | globo     | poco_comun  | mal=venenoso,bioma=arrecife
pez_leon_venenoso  | Pez leon               | leon      | rara        | mal=venenoso,bioma=arrecife,pal=pez_leon
pez_piedra_venenoso| Pez piedra venenoso    | mero      | rara        | mal=venenoso,bioma=arrecife
raya_venenosa      | Raya venenosa          | raya      | poco_comun  | mal=venenoso,bioma=mar
medusa_venenosa    | Medusa venenosa        | medusa    | poco_comun  | mal=venenoso,bioma=mar
avispa_de_mar      | Avispa de mar          | medusa    | rara        | mal=venenoso,bioma=mar
erizo_venenoso     | Erizo venenoso         | erizo     | poco_comun  | mal=venenoso,bioma=arrecife
pulpo_de_anillos   | Pulpo de anillos       | pulpo     | rara        | mal=venenoso,bioma=arrecife
caracola_conica    | Caracola conica        | caracola  | rara        | mal=venenoso,bioma=arrecife
pez_sapo_venenoso  | Pez sapo venenoso      | cieno     | poco_comun  | mal=venenoso,bioma=pantano
rana_de_dardo      | Rana de dardo          | rana      | rara        | mal=venenoso,bioma=pantano,pal=payaso
serpiente_venenosa | Serpiente de agua venenosa | serpiente | rara    | mal=venenoso,bioma=pantano
anguila_venenosa   | Anguila venenosa       | anguila   | poco_comun  | mal=venenoso,bioma=pantano
bagre_espinoso     | Bagre espinoso         | siluro    | poco_comun  | mal=venenoso,bioma=rio
cabracho_venenoso  | Cabracho venenoso      | mero      | poco_comun  | mal=venenoso,bioma=costa
vibora_venenosa    | Pez vibora venenoso    | vibora    | rara        | mal=venenoso,bioma=abismo
"""

BIOMAS = [
    ('rio', RIO), ('lago', LAGO), ('pantano', PANTANO), ('costa', COSTA),
    ('mar', MAR), ('arrecife', ARRECIFE), ('abismo', ABISMO), ('hielo', HIELO),
    ('caverna', CAVERNA), ('magico', MAGICO), ('malos', MALOS),
]

RAREZA_PRECIO = {'comun': 4, 'poco_comun': 9, 'rara': 22, 'epica': 60, 'legendaria': 180}
RAREZA_TAM = {'comun': 0.0, 'poco_comun': 0.15, 'rara': 0.4, 'epica': 0.7, 'legendaria': 1.0}


def _limpia(txt):
    return txt.replace('ñ', 'n').replace('á', 'a').replace('é', 'e') \
              .replace('í', 'i').replace('ó', 'o').replace('ú', 'u') \
              .replace('а', 'a').replace('о', 'o')


def fichas():
    """Devuelve la lista de especies ya normalizada, en orden de catalogo."""
    fuera = []
    vistos = set()
    for bioma, bloque in BIOMAS:
        for linea in bloque.strip().split('\n'):
            linea = linea.strip()
            if not linea:
                continue
            partes = [p.strip() for p in linea.split('|')]
            ident = _limpia(partes[0])
            nombre = partes[1]
            grupo = partes[2]
            rareza = partes[3]
            extras = {}
            if len(partes) > 4 and partes[4]:
                for par in partes[4].split(','):
                    k, _, v = par.partition('=')
                    extras[k.strip()] = v.strip()
            if ident in vistos:
                raise ValueError('id repetido: ' + ident)
            vistos.add(ident)
            if grupo not in GRUPOS:
                raise ValueError('grupo desconocido en %s: %s' % (ident, grupo))
            if rareza not in RAREZA_PRECIO:
                raise ValueError('rareza desconocida en %s: %s' % (ident, rareza))
            fuera.append(dict(id=ident, nombre=nombre, grupo=grupo, rareza=rareza,
                              bioma=extras.pop('bioma', bioma), carpeta=bioma, extras=extras))
    return fuera
