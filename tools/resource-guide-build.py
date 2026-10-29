from pathlib import Path
import sys, json, html, hashlib
sys.path.insert(0,'C:/Users/pc/.codex/tmp/grassland-resource-plots-20261028')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import markdown
R=Path(__file__).resolve().parent.parent; A=R/'audits/recursos-20261028'; G=R/'assets/economia'
G.mkdir(parents=True,exist_ok=True)
data=json.loads((A/'simulation.json').read_text(encoding='utf8'))
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'#f3f6ef','axes.facecolor':'#f3f6ef','axes.labelcolor':'#183e38','text.color':'#183e38','xtick.color':'#416359','ytick.color':'#416359'})
fig,axes=plt.subplots(1,2,figsize=(12,4.5),layout='constrained')
curve=data['curve'];x=[r['percent'] for r in curve]
for ax,key,title,color in [(axes[0],'respawnSeconds','Reaparición gradual','#286f57'),(axes[1],'priceFactor','Factor de referencia (antes del límite diario)','#a16e27')]:
 ax.plot(x,[r[key] for r in curve],color=color,lw=3);ax.axvline(50,color='#9bada0',ls='--');ax.grid(alpha=.17);ax.set(xlabel='Ocupación global de la tabla (%)',title=title,xlim=(0,100));ax.set_ylabel('Segundos' if key=='respawnSeconds' else 'Multiplicador')
fig.suptitle('Se reduce la emisión cuando queda menos capacidad',fontweight='bold');fig.savefig(G/'curva-recursos.png',dpi=160);plt.close(fig)
fig,ax=plt.subplots(figsize=(12,6))
fig.subplots_adjust(bottom=.18,top=.90,left=.08,right=.98)
for s,color,style in zip(data['scenarios'],['#286f57','#29638b','#c06f3f','#997b2f'],['-','-','--',':']):
 ax.plot([r['day'] for r in s['days']],[r['occupancy'] for r in s['days']],label=s['name'],color=color,ls=style,lw=2.3)
ax.axhline(100,color='#b54f3b',ls='--',alpha=.4);ax.set(title='365 días: el límite se respeta; el consumo determina la capacidad libre',xlabel='Día',ylabel='Ocupación de la tabla (%)',ylim=(0,105),xlim=(1,365));ax.grid(alpha=.17);ax.legend(loc='lower right',fontsize=10)
fig.text(.1,.02,'Modelo ilustrativo: límite 100.000 u · 20 nodos · 2 u/recolección · demanda y consumo supuestos. No es una prueba de carga.',fontsize=9)
fig.savefig(G/'simulacion-365-dias.png',dpi=160);plt.close(fig)
flow='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 390"><defs><marker id="a" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#8cb69d"/></marker></defs><rect width="1100" height="390" rx="18" fill="#102b2a"/><g font-family="system-ui,sans-serif" fill="#e6edde"><text x="42" y="50" font-size="24" font-weight="700">Dos controles que trabajan juntos</text><g fill="#193e35" stroke="#709d80"><rect x="40" y="85" width="300" height="105" rx="12"/><rect x="400" y="85" width="300" height="105" rx="12"/><rect x="760" y="85" width="300" height="105" rx="12"/></g><g font-size="18" font-weight="650"><text x="60" y="117">Contrato: cantidad / límite</text><text x="420" y="117">Servidor: política acotada</text><text x="780" y="117">Juego: entrega confirmada</text></g><g font-size="15" fill="#bcd2c4"><text x="60" y="148">Límite global y por factura</text><text x="60" y="174">La cadena rechaza exceso de emisión</text><text x="420" y="148">Menos capacidad → más espera</text><text x="420" y="174">Precios con margen y tope diario</text><text x="780" y="148">Nodo reclamado una sola vez</text><text x="780" y="174">Sin entrega inventada por el cliente</text></g><path d="M345 138H390M705 138H750" stroke="#8cb69d" stroke-width="3" marker-end="url(#a)"/><text x="42" y="247" font-size="19" font-weight="650">Acuñar: Q sube · consumir o quemar: Q baja · transferir P2P: Q se conserva</text><text x="42" y="284" font-size="16" fill="#bcd2c4">Las monedas usan otro libro: jugadores + tesoro circular + tesoro del juego.</text><text x="42" y="315" font-size="16" fill="#bcd2c4">Una quema de recursos no financia recompensas ni repone el dinero del tesoro.</text><text x="42" y="354" font-size="15" fill="#e3c68d">Excepción privilegiada: ampliar límites o importar con migración abierta requiere revisión del propietario.</text></g></svg>'''
(G/'circuito-recursos.svg').write_text(flow,encoding='utf8')
p=R/'GUIA-ECONOMIA.md';s=p.read_text(encoding='utf8')
s=s.replace('revisión del 28 de octubre de 2026.','ampliación de recursos del 29 de octubre de 2026.')
s=s.replace('Evita aumentar simultáneamente premios de misiones, regalos, rentabilidad de cultivos y descuentos. Conserva límites de emisión por actividad,','Evita aumentar simultáneamente premios de misiones, regalos, rentabilidad de cultivos y descuentos. Conserva presupuestos de monedas y los límites globales de recursos,')
s=s.replace('El modo de recolección autoritativa depende de `GATHER_ENFORCE`; revisa su configuración y prueba sus acciones antes de cambiarlo. No se modificaron tus credenciales ni se activó ese modo a ciegas.','La ampliación activa `GATHER_ENFORCE` y `GameScene.GATHER_SERVER`: el servidor valida los nodos y la herramienta, decide los premios y confirma sus facturas. Esto exige desplegar ambas partes juntas. No se modificaron tus credenciales.')
marker='\n## Recursos: tablas globales, facturas y capacidad libre\n'
if marker in s:s=s[:s.index(marker)]
addition='''
## Recursos: tablas globales, facturas y capacidad libre

Se leyó el contrato que entregaste como `C:/Users/pc/Desktop/rr.txt.txt`; su código no se modificó. `getTipoStats` informa cantidad global activa, límite global, máximo por factura, facturas activas y unidades quemadas. Las cantidades grandes se calculan con enteros exactos, sin redondearlas con `Number`.

**Ocupación = cantidad global / límite global. Capacidad libre = máximo entre cero y límite − cantidad.** El límite por factura controla cada pila; no es un límite de cantidad de facturas. Dividir un recurso en más facturas no evita el límite global. Por ejemplo, 90.000 unidades de madera con un límite de 100.000 ocupan 90 %, aunque cada factura admita solamente 50 unidades.

Las ocho tablas reguladas son madera de pino, madera seca, madera con hojas, piedra, mineral de cobre, mineral de hierro, carbón y mineral de carbón. Se conservan las probabilidades y salidas mixtas de tus árboles y minas. Si un nodo entrega varios recursos, usa la espera más alta de sus tablas; excluye las salidas llenas y se bloquea si todas están llenas. La capacidad por recurso y por factura limita lo que puede entregarse.

![Contrato, servidor y juego conservan cantidades](assets/economia/circuito-recursos.svg)

**No se amplían tablas automáticamente.** Se eliminó el antiguo crecimiento automático de límites al agotarse el cupo. En Centro de control → Recursos puedes ver ocupación, capacidad libre, máximos por factura, consumo acumulado, reaparición y factor de referencia. Puedes simular y guardar la curva; dos administradores no pueden sobrescribir silenciosamente la misma versión.

No se añadió una cuota económica diaria de tala o minería por jugador. El freno económico de esos recursos viene de sus tablas. Los límites de solicitudes y concurrencia protegen el servicio frente a saturación: no crean más recursos ni son un presupuesto económico oculto. Los límites existentes de herramientas especiales de tienda, recargas y recompensas monetarias se conservan: corresponden a otros flujos.

## Cómo cambia la reaparición y el precio

La regulación predeterminada empieza al 50 %. Se calcula `t = acotar((ocupación − 50) / 50, 0, 1)` y `curva = t² × (3 − 2t)`. La espera es `60 + 1.740 × curva` segundos; el factor de referencia es `1 + 1,5 × curva`. Puedes ajustar estos parámetros dentro de rangos explícitos desde el panel.

| Ocupación | Reaparición aproximada | Factor de referencia |
| --- | --- | --- |
| 0–50 % | 60 s | ×1,00 |
| 75 % | 930 s (15,5 min) | ×1,75 |
| 90 % | 1.619 s (27 min) | ×2,344 |
| 100 % | 1.800 s; no se acuña sin capacidad | ×2,50 |

![Espera y referencia de precio según ocupación](assets/economia/curva-recursos.png)

La curva es gradual y tiene máximos; evita saltos y tiempos ilimitados. La ocupación mide **escasez de capacidad para emitir**, no demuestra que un objeto sea escaso en manos de jugadores ni que exista demanda de compra. Una tabla muy llena puede contener mucho stock inactivo. Por eso el factor modifica la referencia del NPC, conserva el margen compra/venta, respeta el límite diario de variación y deja intactos los precios manuales que no siguen el índice. Un ×2,5 de referencia no implica subir el precio final 150 % en un día. Las ofertas P2P conservan el precio elegido por su vendedor.

Los datos del contrato se comparten durante 15 segundos, con un máximo de tres lecturas simultáneas de tablas por instancia; el aviso de migración se consulta cada minuto. Un RPC fallido se muestra como lectura no disponible y no se convierte en cantidad cero. El contrato decide el cupo final al confirmar la acuñación, incluso si otra petición usó parte del cupo desde la fotografía anterior. Una compra NPC de recursos comprueba la capacidad conocida antes de cobrar; un cambio posterior o una confirmación ambigua requiere conciliación.

La reclamación del nodo usa una escritura condicional atómica en Mongo: dos jugadores no obtienen simultáneamente el mismo nodo. La herramienta debe existir en la cartera y corresponder a la actividad. El recibo guarda la referencia de la acción; al repetirla se devuelve el mismo resultado, sin volver a emitir. Se conservan siete días de recibos de recolección. Solo se muestran como entregados los objetos con confirmación; un inventario lleno no elimina la factura que ya existe en la cadena. Este control no sustituye un sistema completo contra bots o trampas de movimiento.

## Transferencias P2P que conservan recursos

El mercado ahora usa `transferInvoice`: al publicar, el recurso pasa del vendedor a custodia del relayer; al comprar, de custodia al comprador; al cancelar, se devuelve el sobrante. Estas transferencias conservan la cantidad global y no se contabilizan como quemas. Por eso se puede vender una madera existente aunque su tabla esté llena. La custodia del mercado es una tenencia temporal de **objetos**, no un tercer tesoro de monedas.

El cobro y el derecho de entrega se guardan juntos en una transacción Mongo. Cada compra tiene una referencia y un recibo distinto. Si se pierde una respuesta, la misma referencia recupera el resultado. Antes de emitir una transferencia se guarda su transacción firmada: la recuperación vuelve a emitir los mismos bytes y verifica su hash, destino y contenido. No se vuelve a cobrar por pulsar comprobar entrega. La página muestra las entregas pendientes y permite continuar un depósito que aún no terminó.

Mongo y la cadena tienen confirmaciones independientes. Si no existe un hash verificable, el sistema exige revisión; no supone que el envío falló ni fabrica otro. Una interrupción entre asignar un nonce y guardar el envío puede necesitar reparar la cola del relayer después de verificar sus transacciones pendientes. No cambies el nonce ni envíes una compensación a ciegas. El supervisor procesa lotes limitados y evita solapar sus barridos.

**Publicaciones anteriores:** las que no tienen prueba del nuevo depósito quedan en `legacy_review`. Se conserva su historial, pero se impiden compras nuevas sobre una custodia no demostrada. Recursos → Entregas por conciliar muestra recibos y una muestra de hasta veinte publicaciones antiguas. Antes de compensar una antigua publicación, verifica factura original, quema antigua, cobros, entregas y propietario. No hay una conversión automática que invente esas pruebas. Conserva la copia de Mongo antes de conciliar; no borres los registros antiguos.

## Qué ocurre cuando consumes o quemas recursos

La conservación es `cantidad final = cantidad inicial + acuñación − consumo o quema`. Transferir y dividir facturas mantiene la cantidad global. Consumir recursos mediante una transacción confirmada libera capacidad en su tabla y permite nuevas entregas. El crafteo sigue cobrando monedas mediante sus recibos; destruir materiales y cobrar el servicio son operaciones diferentes.

Una tabla llena no vuelve a tener espacio simplemente esperando treinta minutos. Necesita consumo real, una quema válida o una ampliación administrativa deliberada. Quemar material útil solo para acelerar el respawn reduce las existencias del jugador y puede empeorar su experiencia; favorece recetas y usos que tengan valor jugable. Mantén una relación razonable entre recursos generados y recursos utilizados. No elimines materiales de otros jugadores sin una regla del juego que lo autorice.

Las quemas de recursos no alimentan el circular ni la reserva del juego. Las quemas monetarias siguen los pisos y retenciones descritos arriba. Ni una quema ni una subida de precio garantizan demanda, rentabilidad, convertibilidad o valor de un token externo.

## Excepciones del propietario del contrato

En el contrato entregado, **la importación de migración abierta puede superar los límites global y por factura**. La prueba con su código original importó once unidades en una tabla limitada a diez; el resultado se documenta, no se oculta. El panel consulta `migrationSealed` y distingue sellada, abierta y no verificable.

`sealMigration()` es irreversible. No se ejecutó ni se añadió un botón que la active automáticamente: primero verifica que toda tu migración esté terminada. El propietario también puede modificar `setLimit`, por lo que la estabilidad depende de no ampliar límites sin revisar existencias, consumo y población. El editor del panel permite ampliaciones explícitas firmadas con tu cartera y registra su hash; no baja límites ni firma por ti. Subir el límite reduce inmediatamente la ocupación relativa y admite más emisión. No se necesita redeplegar el contrato para usar esta política del servidor.

## Simulación de miles y millones de jugadores

![Simulación de ocupación durante un año](assets/economia/simulacion-365-dias.png)

El ensayo usa una tabla hipotética de 100.000 unidades, veinte nodos, dos unidades por recolección y 365 días; parte de cero. La demanda y el consumo son supuestos explícitos, no mediciones de tus jugadores. Los cuatro escenarios conservan cada unidad y nunca exceden el límite. Con un millón de jugadores y cero consumo se alcanza 100 % y se detiene la emisión. Con consumo de 5.000 unidades diarias, termina cerca del 70,5 %. Al activar consumo desde el día 181, vuelve a recuperar capacidad. Incluso 1.000 jugadores pueden llenar la tabla si la producción supera su consumo.

Se procesaron además **1.000.000 consultas de política en lotes de 1.000**: compartieron ocho lecturas y un máximo de tres lecturas activas, con ocho entradas finales de caché y ninguna petición en cola. Esto demuestra que la política no necesita una entrada por jugador. **No demuestra que Railway, el RPC, Mongo o el relayer atiendan a un millón de jugadores simultáneos.** Las escrituras, el gas, la latencia, el tamaño de los inventarios y las consultas agregadas del mercado requieren una prueba de capacidad con infraestructura y datos reales antes de crecer. La presencia actual se etiqueta por instancia; no se presenta como un contador distribuido.

Los informes reproducibles están en `audits/recursos-20261028/simulation.json`, `chain-integration.json`, `unit-results.txt` y `browser-results.json`. La prueba integrada ejecutó el contrato original en una EVM local y Mongo en un replica set temporal. Verificó una reclamación ganadora entre cien concurrentes, rechazo de emisión por exceso, custodia, comprador autorizado, cantidades manipuladas, dos compras iguales con recibos diferentes, repetición de respuestas y conservación de objetos y monedas. No usó carteras, claves ni saldos de producción.

## Monitor de errores, conectados y cuentas

El monitor agrupa fallos repetidos, los ordena por ocurrencias y fecha y presenta un resumen corto. Al abrirlo se puede ver y copiar mensaje, traza y hasta veinte carteras afectadas por grupo, con su contador. La búsqueda de errores de cliente acepta una cartera completa; consulta hasta mil identificadores de error asociados. Las atribuciones antiguas sin sesión verificada se señalan como históricas. El botón de limpiar relayer archiva la bandeja hasta el momento elegido: conserva transacciones, pagos y evidencia para conciliación.

«Conectados ahora» cuenta carteras autenticadas con sockets activos en **esta instancia**. Dos pestañas de una misma cartera cuentan una vez; al desconectarse el último socket se retira. Un registro persistido en Mongo ya no se presenta como alguien conectado. Si la consulta falla se muestra un dato no disponible. Si se escala a varios procesos, hay que agregar presencia con un servicio compartido antes de llamar global a ese contador.

El directorio Cuentas exige administrador en el servidor y pagina cincuenta filas. Muestra cartera, nombre, correo realmente registrado, proveedor, verificación, nivel, mundo y actividad disponible. Los accesos sociales nuevos de Google/Apple guardan el correo cuando el proveedor confirma su verificación; una dirección de cartera no permite adivinar un correo. Los registros anteriores sin ese dato siguen sin correo hasta un acceso válido que permita actualizarlo. No se seleccionan claves privadas, fragmentos del vault, contraseñas ni datos de recuperación. La pantalla limpia sus filas al invalidarse la sesión; no exporta masivamente correos.

## Publicar esta ampliación sin perder tu trabajo

Los cambios están en disco; **esta revisión no se desplegó en Railway** y no modificó saldos de producción. Las capturas que compartiste muestran Mongo HA; conserva esa configuración y verifica que el backend apunte al replica set. No vuelvas a standalone para sortear un fallo de cobro: las operaciones financieras necesitan transacciones. La configuración HA se describe en la [documentación de Railway](https://docs.railway.com/databases/mongo-ha).

1. Conserva una copia de la base y de los archivos. Las copias del inicio de esta ampliación están en `audits/recursos-20261028/before/`; no uses un reset global de Git sobre tu trabajo manual.
2. Actualiza juntos `C:/Users/pc/Desktop/server2.js`, `C:/Users/pc/Desktop/marketplace-routes.js` y `C:/Users/pc/Desktop/gf-wallet-sdk/server/gf-wallet-routes.js` en el repositorio que Railway despliega. Esta última ruta guarda el correo social verificado; no es el archivo de SDK del navegador.
3. Publica los archivos web indicados en `audits/recursos-20261028/manifest.json`, incluyendo `recursos.html/js`, `cuentas.html/js`, `operations-panels.css/js`, el mercado, su ilustración y las imágenes de la guía. Los HTML apuntan a las nuevas versiones de los scripts cambiados.
4. Reinicia el backend actualizado y entra en Centro de control → Recursos. Comprueba las ocho tablas y el aviso de migración. Una tabla ausente requiere configuración del propietario; no se da de alta con cantidades inventadas.
5. Haz una compra pequeña, una venta, un crafteo y una tala/mina con una cuenta de prueba. Comprueba recibo, saldo y factura. En P2P, prueba depósito, compra parcial y cancelación del sobrante. Revisa pendientes antes de repetir una operación.
6. Revisa tus publicaciones anteriores y la progresión con inventarios pequeños. Conserva una instancia del juego hasta resolver los demás estados de sesión que aún dependen de memoria de proceso. Mongo HA no convierte por sí solo todo el juego en un servicio distribuido.

No hace falta vigilar manualmente cada precio o cada quema: hay reglas acotadas, referencias y trazabilidad para los flujos revisados. Sí hace falta revisar excepciones, liquidez, capacidad ocupada, consumo y fallos persistentes. El límite impide emisión ilimitada bajo sus condiciones; la utilidad del juego y una operación mantenida determinan que la economía siga funcionando a largo plazo.
'''
p.write_text(s+addition,encoding='utf8')
body=markdown.markdown(s+addition,extensions=['tables','fenced_code','toc'])
style='''*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#0c2022;color:#dbe8df;font:16px/1.8 system-ui,sans-serif}header{padding:22px max(20px,calc((100% - 1000px)/2));background:#17352e;border-bottom:1px solid #44614e}main{max-width:1060px;margin:auto;padding:36px 24px 80px}h1{font-size:clamp(32px,5vw,54px);line-height:1.1;color:#ead7a6;letter-spacing:-.04em}h2{font-size:25px;line-height:1.3;color:#b5d6ae;border-top:1px solid #385247;padding-top:30px;margin-top:50px}p,li{overflow-wrap:anywhere}a{color:#b7dabe}strong{color:#f1eddb}code{background:#19352d;color:#e2ce95;font-size:.86em;padding:2px 5px;border-radius:5px}img{display:block;max-width:100%;height:auto;border-radius:14px;margin:24px auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px;border:1px solid #385247;text-align:left}th{background:#17352e}li{margin-bottom:10px}@media(max-width:500px){main{padding:24px 16px}table{font-size:11px}th,td{padding:8px 5px}}@media print{html{color-scheme:light}body{background:white;color:#142a23}h1,h2,strong,a{color:#142a23}header{display:none}img,table{break-inside:avoid}}'''
(R/'GUIA-ECONOMIA.html').write_text('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Guía de economía · Grassland Forest</title><style>'+style+'</style></head><body><header><a href="control-center.html">← Centro de control</a> · Recursos, monedas y conciliación</header><main>'+body+'</main></body></html>',encoding='utf8')
asset=R/'assets/market/forest-outpost-20261028.png'
(A/'image-asset.json').write_text(json.dumps({'tool':'image_gen.imagegen','path':str(asset),'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'prompt':'Polished wide 3:1 hand-painted pixel-art fantasy forest trading outpost; merchant stall right, dark negative space left, logs, ores, herbs and coins, lanterns, pine green and teal with aged brass; no text and no people.','purpose':'New market hero illustration; existing game resource icons preserved.'},ensure_ascii=False,indent=2),encoding='utf8')
print('Updated guide and generated three explanatory figures.')
