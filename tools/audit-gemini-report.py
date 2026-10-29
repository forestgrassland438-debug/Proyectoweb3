from pathlib import Path
import json,sys,collections,datetime,html,hashlib,difflib,shutil,re
sys.path.insert(0,'C:/Users/pc/.codex/tmp/grassland-resource-plots-20261028')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch,FancyArrowPatch
R=Path.cwd();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029')
rows=json.loads((A/'findings.json').read_text(encoding='utf8'));counts=dict(collections.Counter(r['status'] for r in rows))
metrics=json.loads((A/'browser-metrics.json').read_text(encoding='utf8'));before,after=metrics['samples']
evidence=[]
for filename,label in [('continuation-regression.txt','Regresión amplia'),('preflight-remaining-tests.txt','Regresión posterior de rutas nativas')]:
 log=(A/filename).read_text(encoding='utf8');values={key:int(re.search(r'(?:ℹ |# )'+key+r'\s+(\d+)',log).group(1)) for key in ['tests','pass','fail']};evidence.append({'label':label,'file':filename,**values})
for filename,label in [('craft-integration.json','Contrato EVM y trabajos durables'),('mongo-guards.json','Mongo, concurrencia y propiedad'),('vip-browser.json','Interfaz VIP en Chromium')]:
 data=json.loads((A/filename).read_text(encoding='utf8'));assert data['ok'],filename;evidence.append({'label':label,'file':filename,'checks':len(data['checks']),'ok':data['ok']})
(A/'verification-summary.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
plt.rcParams.update({'font.family':'DejaVu Sans','figure.facecolor':'#101727','axes.facecolor':'#172238','text.color':'#eff4ff','axes.labelcolor':'#dae4f8','xtick.color':'#b7c8e8','ytick.color':'#b7c8e8','axes.edgecolor':'#344660','savefig.facecolor':'#101727','font.size':11})
fig,axes=plt.subplots(1,3,figsize=(15,6));colors=['#8c9ebc','#56d6b6']
for ax,key,title,unit in zip(axes,['cpuMedianMs','chartMedianMs','fps'],['Culling: componente aislado','Gráficos: 8 × 365 puntos','Cadencia rAF de la prueba'],['ms por actualización','ms por redibujado','fotogramas / segundo']):
 vals=[before[key],after[key]];bars=ax.bar(['Antes','Después'],vals,color=colors,width=.6);ax.set_title(title,pad=20,fontweight='bold',fontsize=12);ax.set_ylabel(unit);ax.set_ylim(0,max(vals)*1.25)
 ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',alpha=.12);ax.set_axisbelow(True)
 for b,v in zip(bars,vals):ax.text(b.get_x()+b.get_width()/2,v+max(vals)*.04,f'{v:.3f}' if key=='cpuMedianMs' else f'{v:.1f}',ha='center',fontweight='bold',fontsize=14)
fig.suptitle('Mediciones locales verificables · Grassland Forest',fontsize=20,fontweight='bold',y=.97)
fig.text(.5,.10,'Chromium local · medianas de CPU/redibujado · FPS calculados sobre 150 intervalos de fotograma',ha='center',color='#b7c8e8')
fig.text(.5,.055,'Culling: 30.000 objetivos sintéticos; el juego actual no registra estos objetivos. No es una mejora medida de la partida.',ha='center',fontsize=10,color='#ffd18e')
fig.text(.5,.02,'Los FPS mostrados son del escenario de prueba. FPS de partida, latencia Railway y capacidad de millones de jugadores: NO medidos.',ha='center',fontsize=10,color='#ffd18e')
fig.tight_layout(rect=(.02,.16,.99,.88));fig.savefig(A/'metricas-rendimiento.png',dpi=155);plt.close(fig)

labels={'corregido':'Corregido','parcial':'Mejora parcial','pendiente':'Pendiente','no_confirmado':'No confirmado','ya_protegido':'Ya protegido','recomendacion':'Recomendación','no_aplica':'No aplica'}
fig,ax=plt.subplots(figsize=(12,6.4));keys=list(labels);bars=ax.barh([labels[k] for k in keys],[counts.get(k,0) for k in keys],color=['#56d6b6','#ffc67b','#ff8e97','#a6b5ce','#80b8ff','#b5a5f9','#7b8da9']);ax.invert_yaxis()
for b,k in zip(bars,keys):ax.text(b.get_width()+.6,b.get_y()+b.get_height()/2,str(counts.get(k,0)),va='center',fontweight='bold',fontsize=13)
ax.set_xlim(0,max(counts.values())+12);ax.spines[['top','right']].set_visible(False);ax.set_xlabel('Identificadores del informe externo');ax.set_title('160 afirmaciones contrastadas con el código actual',fontsize=19,fontweight='bold',pad=20)
fig.text(.5,.045,'Los identificadores se solapan: no equivalen a 160 fallos independientes. Parcial y pendiente NO significan resuelto.',ha='center',color='#ffd18e',fontsize=10);fig.tight_layout(rect=(.02,.09,.99,.98));fig.savefig(A/'estado-auditoria.png',dpi=155);plt.close(fig)

fig,ax=plt.subplots(figsize=(14,6));ax.set_xlim(0,14);ax.set_ylim(0,6);ax.axis('off')
def box(x,y,w,h,title,body,color='#56d6b6'):
 ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=.13,rounding_size=.12',facecolor='#172238',edgecolor=color,linewidth=1.6));ax.text(x+w/2,y+h-.32,title,ha='center',va='top',fontweight='bold',fontsize=13);ax.text(x+w/2,y+h/2-.22,body,ha='center',va='center',fontsize=10,color='#c8d6ec',linespacing=1.5)
def arrow(a,b,color='#56d6b6'):ax.add_patch(FancyArrowPatch(a,b,arrowstyle='-|>',mutation_scale=17,color=color,linewidth=1.5))
box(.5,3.0,2.7,1.6,'1 · Validar','Sesión + receta o plan\nMateriales y capacidad\nPrecio del servidor')
box(3.9,3.0,2.7,1.6,'2 · Registrar','Cobro + trabajo durable\nRetención en el tesoro\nReferencia única')
box(7.3,3.0,2.7,1.6,'3 · Confirmar','Nonce reservado\nFirma guardada\nRecibo comprobado')
box(10.7,3.0,2.7,1.6,'4 · Liquidar','Entrega o beneficio\nSin doble cobro\nLiberar la retención')
for a,b in [((3.25,3.8),(3.75,3.8)),((6.65,3.8),(7.15,3.8)),((10.05,3.8),(10.55,3.8))]:arrow(a,b)
box(4.4,.45,5.2,1.4,'Si se pierde la respuesta','Consultar el mismo trabajo y la misma firma.\nUna respuesta ausente no autoriza un reembolso.','#ffc67b')
arrow((8.65,2.85),(8.65,2.02),'#ffc67b');arrow((4.2,1.2),(3.0,2.9),'#ffc67b')
ax.text(7,5.5,'Crafteo, consumo y VIP · recuperación comprobada',ha='center',fontsize=21,fontweight='bold')
ax.text(7,.04,'Dos tesoros operativos: circular y juego. Los fondos retenidos no se ofrecen a la quema automática.',ha='center',fontsize=10,color='#b7c8e8')
fig.savefig(A/'operaciones-recuperables.png',dpi=155,bbox_inches='tight');plt.close(fig)

public="""# Actualización de estabilidad de Grassland Forest

Cambios preparados y probados localmente. La publicación del servidor es un paso separado.

1. ✅ Corregidos permisos de estadísticas y guardados que podían aceptar datos ajenos al progreso validado.
2. ✅ Protegidos cobros y saldos frente a respuestas de red perdidas y sincronizaciones simultáneas.
3. ✅ Crafteo con recetas del servidor, comprobación de materiales, consumo confirmado y cobro registrado.
4. ✅ Consumo de comida y agua comprobado antes de aplicar su beneficio.
5. ✅ Compra de VIP recuperable, conservando planes, precios y moneda elegida.
6. ✅ Gestión de nonces con reservas persistentes y pruebas de dos gestores simultáneos.
7. ✅ Mayor aislamiento de eventos privados, correo y lecturas de inventario.
8. ✅ Desgaste de herramientas calculado con el catálogo del servidor y actualizaciones atómicas.
9. ✅ Corregidas carreras de reaparición de paneles y respuestas recibidas después de cerrar una escena.
10. ✅ Limpieza de suscripciones, temporizadores, observadores y recursos propios al desmontar interfaces.
11. ✅ Corregido el tamaño real del canvas al cambiar resolución y densidad de pantalla.
12. ✅ Mejorados los gráficos y reducido trabajo repetido de índices y formatos.
13. ✅ Persistencia cifrada local con clave no extraíble que sobrevive a una recarga compatible.
14. ✅ Actualizada una dependencia afectada por avisos de seguridad, sin cambiar la versión del motor.
15. ✅ Comprobaciones automáticas con navegador, Mongo y una blockchain locales; sin usar fondos de jugadores.

Las métricas publicadas corresponden a escenarios locales aislados. No se ha medido una mejora de FPS de partida ni se promete ausencia total de errores. La revisión mantiene abiertos los puntos que necesitan autoridad adicional del servidor y pruebas en dispositivos reales.
"""
(A/'DISCORD-CAMBIOS.md').write_text(public,encoding='utf8')
if (R/'tools/audit-gemini-discord.py').is_file():
 import runpy
 runpy.run_path(str(R/'tools/audit-gemini-discord.py'),run_name='__main__')
summary=f"""# Auditoría privada · Grassland Forest · 29 de octubre de 2026

Se contrastaron los 160 identificadores del informe externo. Resultado: {counts.get('corregido',0)} corregidos, {counts.get('parcial',0)} parciales, {counts.get('pendiente',0)} pendientes, {counts.get('no_confirmado',0)} no confirmados, {counts.get('ya_protegido',0)} ya protegidos, {counts.get('recomendacion',0)} recomendaciones y {counts.get('no_aplica',0)} no aplicables. Los identificadores se solapan; no equivalen a 160 vulnerabilidades independientes.

Se preservaron las copias previas y se hicieron modificaciones localizadas. No se restauró Git ni se publicaron cambios en Railway. No se inició el backend con credenciales de producción, no se modificó el contrato entregado y no se usaron fondos reales. La comprobación de preservación de archivos se documenta en el manifiesto al finalizar.

## Qué se comprobó adicionalmente al continuar

- VIP usa el trabajo durable de crafteo: cobro y retención atómicos en Mongo, factura firmada registrada antes del envío, recuperación por la misma referencia y prohibición de reembolso automático cuando la firma puede ejecutarse. Conserva exactamente los planes y precios manuales. La devolución administrativa de una compra intacta usa su moneda original.
- Los nueve identificadores de VIP respetan los 64 bytes del contrato original. No se aumentaron límites de recursos para ocultar falta de capacidad.
- Cada factura de estadísticas tiene un único intento firmado pendiente con lease en Mongo. Primero se recupera ese delta; después puede calcularse el objetivo nuevo. Un reinicio no transforma la ausencia de respuesta en un segundo descuento.
- Una sincronización antigua no puede sobrescribir un crédito recibido mientras esperaba a la cadena. La retirada de marcas pendientes compara los valores utilizados y mantiene los nuevos cambios.
- Todas las subrutas de estadísticas vinculan el jugador con la wallet autenticada. Un jugador inexistente no se interpreta como permiso.
- Construcción heredada: una respuesta incierta de cadena o un acuse perdido de Mongo ya no autoriza una devolución automática adicional. Su orquestación completa sigue abierta; no está migrada al mismo trabajo durable.

## Métricas y límites

![Mediciones](metricas-rendimiento.png)

Gráficos sintéticos (8 series × 365 puntos): mediana {before['chartMedianMs']:.1f} → {after['chartMedianMs']:.1f} ms, reducción de {(1-after['chartMedianMs']/before['chartMedianMs'])*100:.1f} %. Percentil 95: {before['chartP95Ms']:.1f} → {after['chartP95Ms']:.1f} ms. Son redibujados locales de DOM, no latencia del servidor.

Culling con 30.000 objetivos artificiales: {before['cpuMedianMs']:.3f} → {after['cpuMedianMs']:.3f} ms por actualización. **El juego actual no registra esos objetivos: esta cifra no demuestra una mejora de la partida.** Cadencia rAF del escenario: {before['fps']:.1f} → {after['fps']:.1f} FPS; la pequeña variación no prueba un aumento de FPS de juego. La fuente de muestras es `browser-metrics.json`.

Pruebas de desmontaje: 40 aperturas y cierres de gráficos dejan cero nodos del gráfico en el escenario ensayado. Eso no demuestra cero fugas en toda la partida. La clave AES-GCM no extraíble se guardó y recuperó tras recargar IndexedDB; no recupera claves antiguas perdidas ni protege frente a scripts del mismo origen.

![Estado](estado-auditoria.png)

## Operación y despliegue

![Recuperación](operaciones-recuperables.png)

El backend actualizado requiere junto a `server2.js`: `crafting-authority.js`, `craft-recipes.json`, `consumables.json` y `stat-chain-journal.js`. Las fuentes equivalentes del proyecto están en `backend-gameplay/`. No basta con copiar solo el servidor. Mongo debe admitir transacciones y deben existir sus índices; el código falla antes de cobrar cuando no puede establecerlos.

Mantener una sola instancia activa del juego mientras el resto de estados de mundo siga en memoria. La prueba de dos gestores de nonce y dos sincronizadores no certifica escalado horizontal de todo el servidor.

Antes de producción: resolver los puntos críticos abiertos, revisar diferencias y probar los flujos con el contrato/configuración de un entorno de ensayo. Conservar copias verificadas de base de datos, configuración y fuentes. No repetir manualmente una firma ni devolver un servicio firmado sin comprobar el resultado.

## Lo que todavía no está cerrado

Hay autoridad pendiente de combate (incluidos golpes de mascotas, poderes y muerte), movimientos y transiciones; progreso legítimo de fuerza/tutorial; asociación completa entre golpe y desgaste; y varias acciones heredadas de horno, agua, cultivos y construcciones. El cierre de unas rutas de emisión no certifica todas las actividades.

No se ha probado con miles o millones de jugadores conectados ni se han medido FPS de una partida completa, memoria de todos los dispositivos o latencia real de Railway. No afirmar seguridad absoluta, cero errores o solvencia para cualquier población.

## Matriz de comprobación

Cada fila corresponde a un identificador del documento recibido. La evidencia completa está en `findings.json`; conservar este informe privado porque describe superficies aún pendientes.

| ID | Estado | Hallazgo | Evidencia / límite |
|---|---|---|---|
"""
verification='## Validación registrada\n\n'
for item in evidence:
 verification+=('- '+item['label']+': '+(str(item['pass'])+'/'+str(item['tests'])+' pruebas; '+str(item['fail'])+' fallos' if 'tests' in item else str(item['checks'])+' comprobaciones correctas')+' · `'+item['file']+'`.\n')
verification+='\nLas suites se solapan y sus cuentas no se suman como fallos independientes. Los errores de red inyectados forman parte de las pruebas de recuperación. Ganache usa su implementación JavaScript por incompatibilidad del módulo nativo con este Node; el benchmark gráfico se midió en Chromium, no en Ganache.\n\n'
extras=json.loads((A/'extras.json').read_text(encoding='utf8'));verification+='## Hallazgos adicionales de esta continuación\n\n'
for row in extras:verification+='- **'+row['id']+' · '+row['status']+'**: '+html.escape(row['title'])+' '+html.escape(row['evidence'])+'\n'
verification+='\nLos detalles de construcción siguen marcados como parciales: la protección contra devoluciones ambiguas no sustituye una liquidación durable completa.\n\n'
summary=summary.replace('## Matriz de comprobación',verification+'## Matriz de comprobación')
for row in rows:
 clean=lambda s:html.escape(str(s).replace('|','/').replace('\n',' '))
 summary+='| '+ ' | '.join(map(clean,[row['id'],labels.get(row['status'],row['status']),row['title'],' '.join(row['evidence'])+' '+(row.get('action') or '')]))+' |\n'
(A/'INFORME-PRIVADO.md').write_text(summary,encoding='utf8')
try:
 import markdown
 body=markdown.markdown(summary,extensions=['tables','fenced_code'])
 (A/'INFORME-PRIVADO.html').write_text('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoría privada Grassland Forest</title><style>body{margin:0;background:#101727;color:#e8efff;font:16px/1.6 system-ui}main{max-width:1200px;margin:auto;padding:30px}h1,h2{color:#68dfbd}img{max-width:100%;height:auto}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #344660;padding:9px;text-align:left;vertical-align:top}code{overflow-wrap:anywhere}a{color:#8bbdff}p,li{max-width:1000px}</style><main>'+body+'</main></html>',encoding='utf8')
except ImportError:print('Markdown HTML renderer unavailable; Markdown and PNGs still generated')
print('Private report, three measured figures and sanitized Discord changelog generated')
