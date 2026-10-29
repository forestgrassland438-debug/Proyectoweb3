from pathlib import Path
import json
A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029')
labels={
'SEC-01':'Protegida la actualización del progreso y las barras del personaje.',
'SEC-03':'Protegido el guardado de las misiones.',
'SEC-06':'Separados los tiempos de espera de fusión entre jugadores.',
'SEC-07':'Ampliadas las comprobaciones de sesión y origen en operaciones de escritura.',
'SEC-10':'Corregido el aislamiento de las consultas de cultivos.',
'SEC-11':'Los avisos privados de operaciones llegan a su propietario.',
'SEC-12':'Se conserva el historial de protección al reiniciar el servidor.',
'SEC-13':'Mejorada la interpretación de direcciones y reglas de conexión.',
'SEC-14':'Respuestas de error más discretas y consistentes.',
'SEC-15':'Unificada la comprobación de acceso a estadísticas administrativas.',
'SEC-16':'Comprobación atómica de los turnos de recogida de agua.',
'SEC-20':'La clave de almacenamiento cifrado compatible sobrevive a la recarga.',
'SEC-22':'Reutilizada la comprobación de sesión del panel de operaciones.',
'SEC-23':'El reporte de errores utiliza la sesión vigente.',
'SEC-24':'Mostrado seguro del contenido del correo.',
'SEC-25':'Crafteo con receta, materiales y entrega comprobados por el servidor.',
'SEC-26':'Tarifa de crafteo registrada junto con su operación.',
'SEC-27':'Los efectos del clima ya no bloquean recursos compartidos por su cuenta.',
'SEC-31':'Identificadores de operaciones con aleatoriedad segura.',
'SEC-32':'Mostrado seguro del historial de la tienda.',
'SEC-35':'Añadido un límite configurable a la tarifa máxima de red.',
'BUG-01':'La identidad del relayer permanece estable.',
'BUG-02':'Reservas persistentes de nonces y recuperación de operaciones firmadas.',
'BUG-03':'Corregida la referencia de contrato del envío de mensajes.',
'BUG-04':'Compatibilidad del identificador histórico de la pala de construcción.',
'BUG-05':'Carga segura de las definiciones de pociones y elixir.',
'BUG-06':'Carga inicial coherente del bronce y las facturas VIP.',
'BUG-07':'El panel conserva un fallo cuando su reintento no puede ejecutarse.',
'BUG-09':'Los errores reales del servidor permanecen visibles para diagnóstico.',
'BUG-11':'Correo persistente entre reinicios.',
'BUG-12':'Botones del HUD enlazados por su identidad.',
'BUG-13':'Límite de densidad móvil aplicado antes de crear el canvas.',
'BUG-14':'Arrastre táctil del panel con límites de pantalla.',
'BUG-15':'La consulta de metadatos tolera respuestas lentas o fallidas.',
'BUG-17':'Inicialización repetida del inventario sin acumular estado.',
'BUG-20':'Pilas de objetos ajustadas al catálogo y al tipo de equipo.',
'BUG-21':'Experiencia de crafteo otorgada una sola vez al confirmar.',
'BUG-22':'Corregida la detección de la mascota en el agua.',
'BUG-23':'La cola de texturas continúa después de encontrar un recurso en caché.',
'BUG-26':'Protegidas las acciones del supervisor frente a clics simultáneos.',
'BUG-27':'Aviso de sincronización del bote cuando no queda espacio local.',
'BUG-30':'Estado de efectos visuales separado entre escenas.',
'BUG-32':'Las tarjetas de tienda conservan su interacción con el ratón.',
'BUG-33':'Corregida la comprobación de desgaste desde la tienda.',
'BUG-34':'Animación de notificaciones sin definiciones duplicadas contradictorias.',
'BUG-36':'Respaldo de imágenes para contenido insertado después de cargar.',
'BUG-38':'Tamaño del canvas coherente con su resolución real.',
'BUG-39':'Una respuesta RPC antigua no sustituye el estado de la sesión nueva.',
'BUG-40':'El ajuste administrativo de bronce llega al campo correcto de la escena.',
'BUG-41':'El escudo libera su instancia anterior y respeta el cierre de escena.',
'BUG-42':'Se cancela la vigilancia de isla al desmontar la escena.',
'BUG-43':'Una transición antigua no altera el estado de la escena entrante.',
'BUG-44':'Volver de reposo respeta la visibilidad actual de los elementos.',
'MEM-01':'Añadido un máximo a la caché de ubicación de conexiones.',
'MEM-02':'Buzones limitados sin mantener todo el correo en memoria de proceso.',
'MEM-05':'El procesador de reportes conserva y libera su temporizador.',
'MEM-06':'Los avisos del tutorial sustituyen su temporizador anterior.',
'MEM-07':'Se liberan las suscripciones propias al cambiar o destruir el juego.',
'MEM-09':'Evitados nuevos datos cifrados inaccesibles por renovar su clave al recargar.',
'MEM-12':'Cerrar cultivos conserva las suscripciones de otros sistemas.',
'MEM-16':'Caché de formatos numéricos con tamaño máximo.',
'MEM-17':'La actualización de ajustes gráficos descansa con la pestaña oculta.',
'MEM-18':'Los gráficos liberan su observador de tamaño.',
'MEM-20':'Reutilizado el sistema de carga compartido.',
'MEM-22':'Referencias débiles para registrar recursos compatibles.',
'MEM-24':'La tienda elimina sus manejadores globales al destruirse.',
'MEM-25':'El pool de etiquetas reduce el pico de objetos que conserva.',
'MEM-27':'Las notificaciones registran y cancelan sus temporizadores de animación.',
'MEM-28':'El módulo de ajustes administrativos dispone de limpieza explícita.',
'PERF-01':'Reducido trabajo de CPU redundante al renovar sesiones.',
'PERF-02':'Consultas agrupadas para identidades de listados administrativos.',
'PERF-04':'Consultas de vida PvP con concurrencia acotada.',
'PERF-05':'Metadatos de colecciones con concurrencia y tiempo limitados.',
'PERF-06':'Menos asignaciones temporales en el componente de culling.',
'PERF-07':'Reutilizada la referencia de la burbuja de conversación.',
'PERF-08':'Reutilizada la posición anterior del personaje.',
'PERF-09':'El nombre se redibuja cuando cambia.',
'PERF-22':'Índices directos para redibujar gráficos y tablas.',
'PERF-24':'Reutilizados los valores de destino de los efectos visuales.',
'PERF-28':'Dibujado agrupado de etiquetas de la regla.',
'PERF-29':'Filtros de tienda sin esperas artificiales acumuladas.',
'PERF-30':'Cuenta atrás de operaciones con un único vencimiento.',
'PERF-34':'Reutilizada la búsqueda de orillas para colocar fauna.'}
rows=json.loads((A/'findings.json').read_text(encoding='utf8'));fixed=[r['id'] for r in rows if r['status']=='corregido'];assert set(fixed)==set(labels)
lines=[f'{i}. ✅ {labels[key]}' for i,key in enumerate(fixed,1)]
for text in ['Compra de VIP recuperable sin repetir el cobro tras perder una respuesta.','Sincronización de estadísticas con una única firma pendiente por factura.','Guardados antiguos no sobrescriben ganancias recibidas durante la espera.','Comprobación común de propiedad para las operaciones de estadísticas.']:
 lines.append(f'{len(lines)+1}. ✅ '+text)
intro='Cambios preparados y probados localmente en Grassland Forest. La publicación en Railway es un paso separado. Algunos puntos corresponden a la misma corrección.\n\n'
footer='\n\nContinúa la revisión de otras acciones. Las cifras de rendimiento son de escenarios locales; no se promete ausencia total de errores ni una mejora de FPS de partida.'
(A/'DISCORD-CAMBIOS.md').write_text('# Actualización de estabilidad\n\n'+intro+'\n'.join(lines)+footer+'\n',encoding='utf8')
folder=A/'discord-partes';folder.mkdir(exist_ok=True);blocks=[];current=intro
for line in lines:
 if len(current)+len(line)+1>1750:blocks.append(current.rstrip());current=''
 current+=line+'\n'
if len(current)+len(footer)>1750:blocks.append(current.rstrip());current=''
blocks.append(current.rstrip()+footer)
for i,block in enumerate(blocks,1):(folder/f'DISCORD-{i:02}.txt').write_text(f'Grassland Forest · cambios {i}/{len(blocks)}\n\n'+block,encoding='utf8')
print(len(lines),'numbered completed checks in',len(blocks),'Discord-sized parts; no private routes, wallets or unfinished exploit details')
