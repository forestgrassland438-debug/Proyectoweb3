/* UI vocabulary only. Player names, mission content, addresses and form values are never translated. */
(function (root) {
  'use strict';
  const pairs = `
Control center|Centro de control
Game administration|Administración del juego
Overview|Vista general
Workspace|Espacio de trabajo
Game controls|Controles del juego
Operations|Operaciones
Missions|Misiones
Players & economy|Jugadores y economía
Collections|Colecciones
World & weather|Mundo y clima
Player reports|Reportes de jugadores
Contract analytics|Estadísticas del contrato
Access & permissions|Acceso y permisos
Error monitoring|Monitor de errores
Game operations, in one place.|Todo el juego, bajo control.
Your forest. Your control room.|Tu bosque. Tu centro de control.
Manage the world, its players and its missions from a single workspace.|Gestiona el mundo, sus jugadores y sus misiones desde un solo espacio de trabajo.
Connect your administrator wallet to continue.|Conecta tu cartera administradora para continuar.
The backend verifies your administrator role. A sign-in message proves wallet ownership; it does not send a transaction.|El backend verifica tu rol de administrador. El mensaje de acceso acredita tu cartera; no envía una transacción.
Connect administrator wallet|Conectar cartera administradora
Connect admin wallet|Conectar cartera de administrador
Connect wallet|Conectar cartera
Disconnect|Desconectar
Sign out|Cerrar sesión
Language|Idioma
Appearance|Apariencia
Dark|Oscuro
Light|Claro
Open tool|Abrir herramienta
Open original page|Abrir página original
All tools|Todas las herramientas
Refresh|Actualizar
Refresh data|Actualizar datos
Last updated|Última actualización
Checking your session…|Comprobando tu sesión…
Connecting wallet…|Conectando cartera…
Requesting nonce…|Pidiendo nonce…
Sign the message in your wallet…|Firma el mensaje en tu cartera…
Verifying administrator access…|Verificando acceso de administrador…
No wallet detected. Install MetaMask to continue.|No se detectó una cartera. Instala MetaMask para continuar.
No account selected.|No elegiste ninguna cuenta.
The wallet account changed. Connect again.|La cuenta de la cartera cambió. Conecta de nuevo.
The session and wallet do not match.|La sesión y la cartera no coinciden.
Your session expired. Connect again.|La sesión caducó. Conecta de nuevo.
Your wallet is not an administrator.|Tu cartera no es administradora.
The API could not verify your role. Retry verification without signing again.|La API no pudo verificar tu rol. Reintenta la verificación sin volver a firmar.
Retry verification|Reintentar verificación
Connection unavailable. Check that your backend is running.|Conexión no disponible. Comprueba que tu backend esté activo.
Signature rejected.|Firma rechazada.
Verified administrator|Administrador verificado
Live backend data|Datos reales del backend
Manual refresh|Actualización manual
No data loaded|Sin datos cargados
Unavailable|No disponible
Total accounts|Cuentas totales
Active in 24 hours|Activos en 24 horas
Online now|Conectados ahora
New in 7 days|Nuevos en 7 días
Account activity|Actividad de las cuentas
Daily missions|Misiones diarias
Mission studio|Estudio de misiones
Design, preview and manage daily adventures.|Diseña, previsualiza y administra las aventuras diarias.
Manual editor|Editor manual
Automatic rules|Reglas automáticas
Deliveries & rewards|Entregas y recompensas
History|Historial
Schedule & copy|Calendario y copias
Save in game|Guardar en el juego
Save rules|Guardar reglas
Unsaved changes|Cambios pendientes
Changes saved|Cambios guardados
Draft only|Solo borrador
Leave this tool and discard unsaved changes?|¿Salir de esta herramienta y descartar los cambios pendientes?
Discard unsaved changes?|¿Descartar los cambios pendientes?
Changes are saved only when you choose Save.|Los cambios se guardan solo al pulsar Guardar.
Draft export|Exportar borrador
Import draft|Importar borrador
Duplicate|Duplicar
Move up|Subir
Move down|Bajar
Player preview|Vista previa del jugador
Reward budget per player|Presupuesto de premios por jugador
Mission mix|Tipos de misión
Deliver items|Entregar objetos
Hunt monsters|Cazar monstruos
Total EXP|EXP total
Gold|Oro
Silver|Plata
Reward items|Objetos de recompensa
No missions in the editor.|No hay misiones en el editor.
Add a mission to see its preview.|Añade una misión para ver su vista previa.
No deliveries loaded. Choose Load to read this day.|Sin entregas cargadas. Pulsa Cargar para consultar este día.
Completion by mission|Completadas por misión
Loaded players|Jugadores cargados
Completed missions|Misiones completadas
Issued EXP|EXP entregada
Issued gold / silver|Oro / plata entregados
Values describe the loaded results and current filters.|Los valores describen los resultados cargados y los filtros actuales.
Manual missions take priority over automatic generation.|Las misiones manuales tienen prioridad sobre la generación automática.
Choose an NPC and a UTC day, then load its missions.|Elige un NPC y un día UTC; después carga sus misiones.
Add mission|Añadir misión
Load day|Cargar ese día
UTC day|Día (UTC)
Reset hour (UTC)|Hora de reinicio (UTC)
Reset hour (UTC, 0-23)|Hora de reinicio (UTC, 0-23)
Copy from day|Copiar desde el día
Paste starting on|Pegar a partir del día
Consecutive days|Cuántos días seguidos
Copy|Copiar
Delete displayed day|Borrar el día mostrado
Administrator access|Acceso de administrador
NPC and day|NPC y día
Missions for the day|Misiones del día
Repeat or delete|Repetir o borrar
Mission history|Historial de misiones
Automatic missions|Misiones automáticas
Automatic missions ON|Misiones automáticas activadas
Missions per day (1-10)|Misiones al día (1-10)
Weight: deliver items|Peso: entregar objetos
Weight: hunt monsters|Peso: cazar monstruos
Chance of an item reward (%)|Probabilidad de premio en objetos (%)
Gold min|Oro mín.
Gold max|Oro máx.
Silver min|Plata mín.
Silver max|Plata máx.
Preview the chosen day|Previsualizar el día elegido
Send preview to the manual editor|Enviar vista previa al editor manual
New roll for TODAY|Nueva tirada para HOY
Who completed what|Quién completó cada misión
Search (player, username or wallet)|Buscar (jugador, usuario o cartera)
Search (name, username or address)|Buscar (nombre, usuario o dirección)
How many to show|Cuántos mostrar
Load history|Cargar historial
Delete ALL history|Borrar TODO el historial
leave empty to see everyone|deja vacío para ver todos
Load|Cargar
Export CSV|Exportar CSV
Item to deliver|Ítem que debe entregar
Internal ID|ID interno
Mission type|Tipo de misión
Monster to defeat|Monstruo que derrotar
Amount|Cantidad
Reward item (optional)|Ítem de recompensa (opcional)
Reward amount|Cantidad de recompensa
Gold reward (0 = none)|Oro de recompensa (0 = nada)
Silver reward (0 = none)|Plata de recompensa (0 = nada)
Title|Título
Requested item display name|Nombre visible del ítem pedido
Reward display name|Nombre visible de la recompensa
Description|Descripción
Texts by language (expand to edit)|Textos por idioma (despliega para editar)
Mission|Misión
Remove|Quitar
Optional|Opcional
optional, e.g. mineral_piedra|opcional, ej. mineral_piedra
English (required)|Inglés (obligatorio)
Spanish|Español
Filipino English|Inglés filipino
Portuguese|Portugués
Chinese|Chino
Korean|Coreano
Item to deliver|Ítem que debe entregar
Name shown to players|Nombre que ven los jugadores
Monster / enemy|Monstruo / enemigo
Reward item|Ítem de recompensa
Weight|Peso
Add|Añadir
Items that can be requested (deliver missions)|Objetos disponibles (misiones de entrega)
Monsters / enemies that can be requested (hunt missions)|Monstruos y enemigos disponibles (misiones de caza)
Reward items (one is picked at random by weight)|Objetos de premio (se elige uno al azar según su peso)
Received|Recibido
Last hand-in|Última entrega
Lifetime total|Acumulado
Records|Registros
Days|Días
Player|Jugador
Players|Jugadores
Username|Usuario
Wallet|Cartera
Address|Dirección
Level|Nivel
Search|Buscar
Clear|Limpiar
Close|Cerrar
Discard|Descartar
Save changes|Guardar cambios
Save|Guardar
Cancel|Cancelar
Confirm|Confirmar
Status|Estado
All|Todos
All|Todas
Active|Activo
Active|activa
Pending|Pendiente
Pending|Pendientes
Warned|Advertido
Warned|Advertidos
Banned|Baneado
Banned|Baneados
Dismissed|Descartado
Dismissed|Descartados
Loading…|Cargando…
Waiting for data…|Esperando datos…
Waiting for authentication…|Esperando autenticación…
Summary|Resumen
Theme|Tema
Not connected|Sin conectar
Not connected|sin conectar
Back|Volver
Previous|Anterior
Next|Siguiente
Try again|Reintentar
Update|Actualizar
Ranger registry|Registro de guardabosques
Rangers only|Solo guardabosques
Connect the administrator wallet to open the player registry. You will sign a message; it does not authorize a transaction.|Conecta la cartera de administrador para abrir el registro de jugadores. Se te pedirá firmar un mensaje; no autoriza ninguna transacción.
Game impact · LitVM|Impacto del juego · LitVM
Backend players and verifiable activity on the single contract.|Jugadores del backend y actividad verificable del contrato único.
Refresh metrics|Actualizar métricas
Verifiable metrics|Métricas verificables
Single contract|Contrato único
Relayer wallet|Wallet Relayer
Available gas (zkLTC)|Gas disponible (zkLTC)
Mined / pending nonce|Nonce minado / pendiente
Relayer signatures · observed ledger|Firmas del Relayer · ledger observado
Sponsored tx · current wallet|Tx patrocinadas · wallet actual
Relayer status · network|Estado Relayer · red
The nonce covers all wallet activity; contract volume counts unique hashes.|El nonce corresponde a toda la actividad de la wallet; el volumen del contrato se cuenta por hashes únicos.
Metric coverage and methodology|Cobertura y metodología de las métricas
Waiting for backend data.|Esperando datos del backend.
Historical contract recovery|Recuperación histórica del contrato
The backend retains progress so analysis can continue after this page closes.|El backend conserva el progreso para continuar el análisis al cerrar esta página.
Waiting for status…|Esperando estado…
Export user audit (CSV)|Exportar Auditoría de Usuarios (CSV)
Export on-chain summary (JSON)|Exportar Resumen On-Chain (JSON)
Generate impact report (LitVM Grant & Airdrop)|Generar Reporte de Impacto (LitVM Grant & Airdrop)
Exports include all authorized records, even when the table has filters or multiple pages. They exclude passwords and private keys.|Las exportaciones incluyen todos los registros autorizados, aunque la tabla tenga filtros o varias páginas. No incluyen contraseñas ni claves privadas.
Audit · Relayer → real player|Auditoría · Relayer → jugador real
Search player by ID, name or wallet|Buscar jugador por ID, nombre o billetera
Sort by|Ordenar por
Most transactions|Más transacciones
Most time played|Más tiempo jugado
ID / Player / Wallet|ID / Jugador / Billetera
Registration / last connection|Registro / última conexión
Total time|Tiempo total
Actor / associated tx|Tx del actor / asociadas
Actor actions|Acciones del actor
Tx / hour · activity|Tx / hora · actividad
Last tx hash|Último Tx Hash
Report language|Idioma del informe
Discord · current members|Discord · miembros actuales
Administrator-supplied data.|Dato aportado por el administrador.
X / Twitter · current followers|X / Twitter · seguidores actuales
Growth · sources and context|Crecimiento · fuentes y contexto
Editable report ready to copy|Informe editable listo para copiar
Regenerate with current data|Regenerar con datos actuales
Copy report|Copiar reporte
Print / Save PDF|Imprimir / Guardar PDF
Contract tables|Tablas del contrato
Table|Tabla
Purpose|Para qué
Total limit|Límite total
Per invoice|Por factura
In use|En uso
Invoices|Facturas
Notices|Avisos
Check again|Volver a mirar
Account age|Antigüedad
Time played|Tiempo jugado
Last seen|Última vez
Game NFT collection|Colección NFT del juego
Collection name|Nombre de la colección
The name players see in My NFTs (the same one shown in MetaMask).|El que verán los jugadores en el panel My NFTs (el mismo que sale en MetaMask).
Collection contract (ERC-721)|Contrato de la colección (ERC-721)
In MetaMask: NFT → details → Contract address.|En MetaMask: el NFT → detalles → “Contract address”.
Network (chain id)|Red (chain id)
Empty = game network.|Vacío = la red del juego.
Network RPC (only if different from the game)|RPC de esa red (solo si no es la del juego)
Save collection|Guardar colección
Reload|Recargar
Remove collection|Quitar la colección
Farming|Siembra
Global success chance (%)|Probabilidad de éxito global (%)
At 20%, 8 out of 10 crops fail when ripening.|Con 20 %, 8 de cada 10 cultivos se echan a perder al madurar.
Growth time multiplier|Multiplicador del tiempo de crecimiento
1 = normal · 2 = twice as long · 0.5 = half as long.|1 = normal · 2 = tarda el doble · 0.5 = la mitad.
Water cost multiplier|Multiplicador del coste de agua
Food cost multiplier|Multiplicador del coste de comida
Crops can die|Los cultivos pueden morir
When disabled, every crop ripens successfully.|Si se desactiva, todo madura bien pase lo que pase.
Difficulty by seed|Dificultad por semilla
Empty = global chance|Vacío = usa la probabilidad global
Save farming|Guardar siembra
Most time played|Los que más han jugado
How many players?|¿Cuántos quieres ver?
From 1 to 500, ordered by time played.|De 1 a 500, ordenados de más tiempo a menos.
View ranking|Ver clasificación
Logins|Entradas
Enter a number and choose View ranking.|Pon un número y pulsa «Ver clasificación».
Player activity (bot check)|Actividad de jugadores (revisión de bots)
Last played|Última partida
First played|Primera partida
Fishing time|Tiempo de pesca
Mining time|Tiempo de minería
Shop time|Tiempo en tienda
Wild lands time|Tiempo en tierras salvajes
Fish caught|Peces capturados
Monsters defeated|Monstruos derrotados
Shop time = inside the shop + with the shop panel open. Flags are hints, not proof.|Tiempo en tienda = dentro de la tienda + con su panel abierto. Las señales son indicios, no pruebas.
Page 1|Página 1
Fishing|Pesca
Mining|Minería
Shop|Tienda
Wild lands|Tierras salvajes
Invited by|Invitado por
Invites|Invitaciones
Flags|Señales
Press «Load».|Pulsa «Cargar».
Leaderboard|Tabla de clasificación
Leaderboard enabled|Tabla activa
When disabled, the game shows a notice instead of the ranking.|Desactivada, el juego muestra un aviso en vez del ranking.
Players in ranking|Jugadores en la tabla
Minimum battles to appear|Batallas mínimas para aparecer
Season name (optional)|Nombre de la temporada (opcional)
Hide banned accounts|Ocultar cuentas baneadas
Hide suspended accounts|Ocultar cuentas suspendidas
Hide training bots|Ocultar bots de entrenamiento
Save leaderboard|Guardar clasificación
Collection studio|Estudio de colecciones
THE FOREST ARCHIVE|EL ARCHIVO DEL BOSQUE
COLLECTION STUDIO / ADMIN|ESTUDIO DE COLECCIONES / ADMIN
Your universe.|Tu universo.
Every piece, under control.|Cada pieza, bajo control.
Create collections, prepare your images and manage every delivery from one workspace.|Crea colecciones, prepara tus imágenes y administra cada envío desde una sola mesa de trabajo.
Access restricted to the owner and contract administrators.|Acceso exclusivo a owner y administradores del contrato.
Sign in with your wallet. Your private key is never needed.|Firma el acceso con tu cartera. No se necesita tu clave privada.
Backend connection|Conexión con el backend
API URL|URL de la API
Save connection|Guardar conexión
Use your trusted server. This panel uses server2.js sessions.|Usa tu servidor de confianza. Este panel utiliza las sesiones de server2.js.
STUDIO / ADMINISTRATION|ESTUDIO / ADMINISTRACIÓN
NFT library|Biblioteca NFT
Multi-account delivery|Sendmulticuentas
Transfers|Movimientos
Linked accounts|Cuentas vinculadas
Contract & permissions|Contrato y permisos
Verified session|Sesión verificada
Administrator|Administrador
Close panel|Cerrar panel
Every piece has a story.|Cada pieza tiene una historia.
The pulse of your collections, in one place.|El pulso de tus colecciones, en un solo lugar.
Create collection|Crear colección
Your collections|Tus colecciones
View all|Ver todas
Movement|Movilización
Confirmed transfers · last 14 days|Transferencias confirmadas · últimos 14 días
ON CHAIN|EN CADENA
Recent activity|Actividad reciente
REAL RECORDS|REGISTRO REAL
Compatible with InvoiceSystem.|Compatible con InvoiceSystem.
Each issued piece links to an invoice of quantity 1. Images, attributes and reversible statuses are stored in the backend.|Cada pieza emitida se vincula a una factura de cantidad 1. Sus imágenes, atributos y estados reversibles se guardan en el backend.
ORGANIZATION|ORGANIZACIÓN
Define their identity, rules and representatives.|Define su identidad, sus reglas y quién las representa.
Active|Activas
Suspended|Suspendidas
Blocked|Bloqueadas
Trash|Papelera
CATALOG|CATÁLOGO
One identity per image. A history for every piece.|Una identidad para cada imagen. Un historial para cada pieza.
Add images|Agregar imágenes
Collection|Colección
Drafts|Borradores
Active|Activos
Suspended|Suspendidos
Blocked|Bloqueados
Order|Orden
Most recent|Más recientes
ID ascending|ID ascendente
Name|Nombre
Select results|Seleccionar resultados
0 selected|0 seleccionados
Prepare deliveries|Preparar envíos
Change status|Cambiar estado
Assign royalties|Asignar royalties
DISTRIBUTION|DISTRIBUCIÓN
Choose exactly which piece each address receives.|Elige exactamente qué pieza recibe cada dirección.
Add destination|Agregar destino
Each row requires a transaction and signature. Draft pieces are issued to their recipient; issued pieces are transferred. If a delivery fails, you can resume pending ones.|Cada fila requiere una transacción y su firma. Las piezas en borrador se emiten al destinatario; las emitidas se transfieren. Si un envío falla, puedes reanudar los pendientes.
Distribution plan|Plan de distribución
0 DELIVERIES|0 ENVÍOS
Piece|Pieza
Destination address|Dirección de destino
Action / result|Acción / resultado
Review and send|Revisar y enviar
Pause after this transaction|Pausar después de esta transacción
Clear completed|Limpiar completados
Import destinations from CSV|Importar destinos desde CSV
One piece per row:|Una pieza por fila:
Load rows|Cargar filas
Download template|Descargar plantilla
TRACEABILITY|TRAZABILIDAD
Who sent, who received and the evidence of every transfer.|Quién envió, quién recibió y la evidencia de cada movimiento.
From|Desde
To|Hasta
Date|Fecha
Piece / event|Pieza / evento
Recipient|Hacia
Transaction|Transacción
OWNERSHIP AND CONNECTIONS|TENENCIA Y CONEXIONES
Addresses connected by transfers, with observed holdings.|Direcciones relacionadas por movimientos, con su tenencia observada.
A connection means a transfer took place between addresses. It does not prove they belong to one person. Holdings reflect the last synchronization.|Una conexión indica que hubo una transferencia entre direcciones. No demuestra que pertenezcan a la misma persona. La tenencia se basa en la última sincronización.
Active pieces|Piezas activas
Received|Recibidos
Sent|Enviados
Related accounts|Cuentas relacionadas
Connected addresses|Direcciones conectadas
RULES AND PAYMENTS|CONFIGURACIÓN Y COBROS
One rule per collection, with per-piece exceptions.|Una regla por colección, con excepciones por pieza.
Assign percentages|Asignar porcentajes
Record payment|Registrar cobro
This contract does not collect royalties. Percentages are backend policies. The chart counts only verified recorded payments; a transfer is not counted as a sale or commission.|Este contrato no cobra royalties. Los porcentajes son políticas guardadas en el backend. El gráfico solo cuenta pagos verificados registrados; una transferencia no se contabiliza como venta ni comisión.
Collected commissions|Comisiones cobradas
VERIFIED PAYMENTS|PAGOS VERIFICADOS
Recorded payments|Cobros registrados
Direct payments in native currency. The administrator declares the sale price; the amount received is verified on chain.|Pagos directos en moneda nativa. El precio de venta es declarado por el administrador; el importe recibido se verifica en cadena.
Payer|Pagador
Receiver|Receptor
Native amount|Importe nativo
Collection rules|Reglas de las colecciones
Reference calculator|Calculadora de referencia
Informational estimate. Does not record a payment.|Estimación informativa. No registra un cobro.
Sale price|Precio de venta
In the same currency as the entered price.|En la misma moneda del precio introducido.
RECOVERY|RECUPERACIÓN
Recover a confirmation after closing your browser or losing connection.|Recupera una confirmación si cerraste el navegador o se interrumpió la conexión.
If you already signed and have a hash, confirm that transaction before attempting another delivery of the same piece.|Si ya firmaste y tienes un hash, confirma esa transacción antes de intentar otro envío de la misma pieza.
SYSTEM|SISTEMA
System authority is verified on chain.|La autoridad del sistema se comprueba en cadena.
Synchronize transfers|Sincronizar movimientos
Query events and owners through the backend. Use short ranges if your RPC provider limits queries.|Consulta eventos y propietarios desde el backend. Usa intervalos cortos si tu proveedor RPC limita las consultas.
Start block (optional)|Bloque inicial (opcional)
End block (optional)|Bloque final (opcional)
Synchronize chain|Sincronizar cadena
Catalog backup|Respaldo del catálogo
Export metadata, attributes, observed owners and history as JSON.|Exporta metadatos, atributos, propietarios observados e historial en JSON.
Export catalog|Exportar catálogo
The export contains loaded records. It does not replace a MongoDB backup; images remain in the backend.|La exportación incluye los registros cargados. No reemplaza un respaldo de MongoDB; las imágenes permanecen en el backend.
Collection owners|Dueños de colección
Compatibility scope|Alcance de la compatibilidad
On chain|En cadena
In the backend|En el backend
Configure collection types, issue individual invoices, transfer, verify ownership and query events.|Configurar el tipo de la colección, emitir facturas individuales, transferir, verificar tenencia y consultar eventos.
About the royalty standard|Sobre el estándar de royalties
Synchronization pending|Sincronización pendiente
COLLECTION|COLECCIÓN
Review operation|Revisar operación
World weather|Clima del mundo
Administration panel|Panel de administración
Right now|Ahora mismo
What players are seeing right now.|Lo que están viendo los jugadores en este momento.
Game time|Hora del juego
Set daytime|Poner de día
Set nighttime|Poner de noche
Clock mode|Modo del reloj
Automatic|Automático
automatic|automático
Manual|Manual
manual|manual
Set time (manual)|Fijar la hora (manual)
From 00:00 to 23:59. Dawn at 06:00, dusk at 18:00.|De 00:00 a 23:59. Amanece a las 06:00 y anochece a las 18:00.
Set|Fijar
Return to normal time|Volver a la hora normal
Master switch|Interruptor general
When off, all weather stops, including wind and rain. Players see a clear world.|Apagado no hay clima de ninguna clase: ni viento ni lluvia. Los jugadores ven el mundo despejado.
Weather enabled|Clima encendido
Turning it off ends the current weather.|Si lo apagas, se acaba lo que hubiera en curso.
Mode|Modo
Wind|Viento
Leaves drift and trees sway.|Cruzan hojas y los árboles se mecen.
Wind intensity|Fuerza del viento
Rain|Lluvia
Drops, splashes and a darker world.|Gotas, salpicaduras y el mundo más apagado.
Rain intensity|Fuerza de la lluvia
Thunder|Truenos
Lightning illuminates the screen and shakes the camera. Only visible during rain.|Rayos y centellas que iluminan la pantalla y sacuden la cámara. Solo se ven si está lloviendo.
Snow|Nieve
Snowflakes drift down and settle on the ground.|Copos que caen despacio y se posan en el suelo.
Snow intensity|Fuerza de la nieve
Sunny|Soleado
Sun intensity|Fuerza del sol
Cloudy|Nublado
Cloud coverage|Cuánto tapan
0.2 means a few subtle high clouds; 2 means an overcast sky with strong shadows.|0.2 son cuatro nubes altas que apenas se notan; 2 es un cielo cubierto con sombras marcadas.
Season|Estación del año
Spring|Primavera
Summer|Verano
Autumn|Otoño
Winter|Invierno
Server draw frequency and probabilities.|Con qué frecuencia y con qué probabilidad sortea el servidor.
Wind probability|Probabilidad de viento
On each draw.|En cada sorteo.
Rain probability|Probabilidad de lluvia
On each draw. Rain usually comes with wind.|En cada sorteo. Si llueve, casi siempre viene con viento.
Snow probability|Probabilidad de nieve
Draw interval|Cada cuánto se sortea
Minutes, from 1 to 1440 (one day).|Minutos, de 1 a 1440 (un día).
Duration|Duración
Minutes: minimum and maximum weather duration. Up to 1440, a full day.|Minutos: de cuánto a cuánto dura una racha. Hasta 1440, que es un día entero.
to|a
Launch & schedule|Lanzar y programar
What|Qué
Storm|Tormenta
Clear sky|Despejar
For|Durante
Minutes.|Minutos.
Launch now|Lanzar ahora
Add to queue|Añadir a la cola
Weather queue|Cola de climas
Skip to next|Saltar al siguiente
Clear queue|Vaciar la cola
Save configuration|Guardar configuración
Discard changes|Descartar cambios
Reports console|Consola de reportes
Connect the administrator wallet to view player reports, review account information and apply sanctions.|Conecta la cartera de administrador para ver los reportes de jugadores, revisar la información de cada cuenta y aplicar sanciones.
Active suspensions|Suspensiones activas
Case file|Expediente
Choose a report to view its full case file.|Elige un reporte de la lista para ver el expediente completo.
Bot / automation|Bot / automatización
Cheating / exploits|Trampas / exploits
Harassment or abuse|Acoso o abuso
Scam or fraud|Estafa o fraude
Spam / chat flooding|Spam / inundar el chat
Inappropriate name|Nombre inapropiado
Game bug abuse|Abuso de un fallo del juego
Other|Otro
Why the player was reported|Por qué fue reportado
Reported by|Reportado por
Report date|Fecha del reporte
Where|Dónde
Handled by|Atendido por
Handled on|Atendido el
Player information|Información del jugador
Account|Cuenta
Online now|Conectado ahora
Pet|Mascota
Account created|Cuenta creada
Sessions|Sesiones
Gold / Silver|Oro / Plata
Skills|Habilidades
Received verifications|Verificadores recibidos
Actions|Acciones
Internal note (administrators only)|Nota interna (solo la ven los administradores)
Suspension days|Días de suspensión
Send warning|Enviar advertencia
Suspend temporarily|Suspender temporalmente
Already banned|Ya está baneado
Ban account|Banear cuenta
Remove ban|Quitar el baneo
Dismiss (no sanction)|Quitar de la lista (sin sanción)
Delete report permanently|Borrar el reporte para siempre
Lift|Levantar
Contract ledger|Libro del contrato
No network|Sin red
Contract statistics|Estadísticas del contrato
Contract address (InvoiceSystem)|Dirección del contrato (InvoiceSystem)
Connect MetaMask|Conectar MetaMask
Accounts with authority|Cuentas con poder
Find admins in history|Buscar admins en el historial
Role|Papel
Balance (zkLTC)|Saldo (zkLTC)
Queued|En cola
Tables (types)|Tablas (tipos)
Configured|Configuradas
Near limit|Cerca del límite
In circulation|En circulación
Limit|Límite
Usage|Uso
Burned|Quemado
Activity|Actividad
7 days|7 días
Read activity|Leer actividad
All contract events in the selected window. Times are approximate (interpolated between blocks).|Todos los eventos del contrato en la ventana elegida. Las horas son aproximadas (se interpolan entre bloques).
Most active accounts|Cuentas más activas
Events|Eventos
Tables with most new invoices|Tablas con más facturas nuevas
Created|Creadas
Units|Unidades
Who pays for gas|Quién paga el gas
Tx (sample)|Tx (muestra)
Average gas|Gas medio
Cost|Coste
Block|Bloque
Event|Evento
Detail|Detalle
Invoice by ID|Factura por id
View|Ver
Invoice by manualId|Factura por manualId
Wallet inventory|Inventario de una cartera
Access Gate — Admin Panel|Puerta de acceso — Administración
Grassland Forest · control who can enter the game (whitelist / bans). Admin wallet only.|Grassland Forest · controla quién puede entrar al juego (lista de acceso / bloqueos). Solo cartera administradora.
Admin sign-in|Acceso de administrador
Not connected.|Sin conectar.
Connect & sign in|Conectar e iniciar sesión
Access mode|Modo de acceso
Everyone (except banned)|Todos (salvo bloqueados)
Whitelist only|Solo lista de acceso
In|En
, only the addresses below can enter. Bans always apply in both modes.|, solo pueden entrar las direcciones de abajo. Los bloqueos se aplican en ambos modos.
Whitelist|Lista de acceso
Wallet address (0x…)|Dirección de cartera (0x…)
Bans|Bloqueos
Reason|Motivo
Add ban|Añadir bloqueo
Changes are only saved when you press|Los cambios solo se guardan al pulsar
Error Reporter|Monitor de errores
Admin access only. Connect the wallet registered as an administrator.|Acceso exclusivo de administrador. Conecta la cartera registrada como administradora.
Client errors|Errores del cliente
Relay failures|Fallos del relayer
Unique errors|Errores únicos
Total occurrences|Ocurrencias totales
Error types|Tipos de error
Showing|Mostrando
All types|Todos los tipos
Delete all|Borrar todo
Type|Tipo
Message|Mensaje
Scene|Escena
Count|Cantidad
Last seen|Última detección
No client errors recorded. That is good news.|Sin errores del cliente registrados.
Previous|Anterior
Abnormal failures|Fallos anómalos
Contract reverts are excluded on purpose: a revert is the chain saying|Las reversiones del contrato se excluyen: una reversión es la cadena diciendo
for a legitimate reason (no balance, no permission, a failed requirement). What is listed here is the abnormal kind — node down, nonce clashes, timeouts, gas problems — the ones worth investigating.|por un motivo legítimo (saldo insuficiente, falta de permiso o requisito incumplido). Aquí se muestran fallos anómalos: nodo caído, conflictos de nonce, tiempos agotados o problemas de gas.
Contract · Function|Contrato · Función
Error|Error
Retries|Reintentos
When|Cuándo
No abnormal relay failures. The chain link is healthy.|No hay fallos anómalos del relayer. La conexión con la cadena funciona.
Stack trace|Traza del error
Delete|Borrar
No addresses whitelisted.|La lista de acceso está vacía.
No bans.|No hay bloqueos.
Unban|Desbloquear
No reason|Sin motivo
Saved.|Guardado.
Signed out.|Sesión cerrada.
Enter a valid 0x address.|Introduce una dirección 0x válida.
Not signed in as an administrator yet.|Aún no has iniciado sesión como administrador.
No players match.|Ningún jugador coincide.
Load the table first.|Carga primero la tabla.
Load the deliveries first.|Carga primero las entregas.
That day has no missions for this NPC.|Ese día no tiene misiones para este NPC.
Nobody has handed in or hunted anything that day yet.|Nadie ha entregado misiones ni cazado ese día todavía.
Make a preview first (👁).|Genera primero una vista previa (👁).
Nothing comes out: add items or monsters and give their type some weight.|No se genera nada: añade objetos o monstruos y asigna peso a su tipo.
First connect the administrator wallet.|Primero conecta la cartera de administrador.
Choose a day.|Elige un día.
No matching players.|No hay jugadores que coincidan.
No days loaded for this NPC yet.|Todavía no hay días cargados para este NPC.
Access granted.|Acceso correcto.
Cancelled.|Cancelado.
Day deleted.|Día borrado.
Pending session|Sesión pendiente
Manage players, farming, economy and rankings.|Gestiona jugadores, siembra, economía y clasificaciones.
Create collections and manage NFT distribution.|Crea colecciones y administra la distribución NFT.
Control weather, seasons and the world clock.|Controla el clima, las estaciones y el reloj del mundo.
Review player reports and moderation cases.|Revisa denuncias de jugadores y expedientes de moderación.
Read invoices, contract activity and gas usage.|Consulta facturas, actividad del contrato y uso de gas.
Manage the whitelist and game entry rules.|Administra la lista de acceso y las reglas de entrada al juego.
Investigate client errors and relay failures.|Investiga errores del cliente y fallos del relayer.
Build daily quests and balance their rewards.|Crea misiones diarias y equilibra sus recompensas.
One connected wallet. Eight tools.|Una cartera conectada. Ocho herramientas.
Check your API connection|Comprueba tu conexión con la API
Your tools are ready.|Tus herramientas están listas.
Select a tool from the navigation to begin.|Selecciona una herramienta del menú para empezar.
Open missions|Abrir misiones
Data is read from your existing server. Refresh when you need an updated snapshot.|Los datos se consultan en tu servidor existente. Actualiza cuando necesites una nueva lectura.
New accounts in 24 h|Cuentas nuevas en 24 h
New accounts in 7 d|Cuentas nuevas en 7 días
Active accounts in 24 h|Cuentas activas en 24 h
Counts can overlap; these are snapshots, not a time series.|Los grupos pueden coincidir; son una lectura actual, no una serie histórica.
Today (UTC)|Hoy (UTC)
Saved days|Días guardados
Scheduled missions|Misiones programadas
Automatic generation|Generación automática
Farmer Joe|Granjero Joe
Guardian|Guardián
Enabled|Activada
Disabled|Desactivada
Search tools…|Buscar herramientas…
No matching tools.|No hay herramientas que coincidan.
Go to overview|Ir al resumen
Open navigation|Abrir navegación
Close navigation|Cerrar navegación
Loading tool…|Cargando herramienta…
Tool did not finish loading. Open its original page or retry.|La herramienta no terminó de cargar. Abre su página original o reintenta.
This tool has a pending transaction. Wait for it to finish.|Esta herramienta tiene una transacción pendiente. Espera a que termine.
The tool is still loading.|La herramienta sigue cargando.
Signed in as|Sesión iniciada como
Choose a mission section|Elige una sección de misiones
More controls|Más controles
All eight existing tools are available below.|Las ocho herramientas existentes están disponibles abajo.
No live data is stored in the browser.|No se guardan datos de sesión en el navegador.
This page works through your existing backend session.|Esta página utiliza la sesión de tu backend existente.
English|Inglés
Spanish|Español
Yes|Sí
No|No
Not saved yet|Aún sin guardar
Editor contents|Contenido del editor
This is a draft preview. Save to publish it in the game.|Esta es una vista previa del borrador. Guarda para publicarlo en el juego.
Import replaces only the local editor after confirmation.|La importación reemplaza solo el editor local tras confirmar.
Download a JSON backup before editing a saved day.|Descarga un respaldo JSON antes de editar un día guardado.
Load the selected day before saving to avoid replacing another day's missions.|Carga el día seleccionado antes de guardar para evitar reemplazar misiones de otro día.
The selection changed. Load this NPC and day before saving.|La selección cambió. Carga este NPC y día antes de guardar.
Preview is out of date. Generate a new preview.|La vista previa quedó desactualizada. Genera una nueva.
At most 10 missions per NPC and day.|Máximo 10 misiones por NPC y día.
Mission IDs must be unique and nonempty.|Los IDs de misión deben ser únicos y no estar vacíos.
Complete the highlighted numeric fields.|Completa los campos numéricos indicados.
Imported draft. Review it before saving.|Borrador importado. Revísalo antes de guardar.
Invalid mission draft file.|El archivo de borrador de misiones no es válido.
The draft file is too large (maximum 1 MB).|El borrador es demasiado grande (máximo 1 MB).
No completed missions in these results.|No hay misiones completadas en estos resultados.
Automatic missions for future days use the saved rules.|Las misiones automáticas de días futuros usan las reglas guardadas.
Load the rules before saving.|Carga las reglas antes de guardar.
Minimum values must not exceed maximum values.|Los mínimos no pueden superar los máximos.
Add items or monsters with a positive mission weight.|Añade objetos o monstruos con un peso de misión positivo.
Save replaces every mission for this NPC and day. Continue?|Guardar reemplaza todas las misiones de este NPC y día. ¿Continuar?
This will replace missions on the destination days. Continue?|Esto reemplazará las misiones de los días de destino. ¿Continuar?
Mission editor contains changes. Replace them with the preview?|El editor tiene cambios. ¿Reemplazarlos por la vista previa?
Replace the local editor with this imported draft?|¿Reemplazar el editor local por este borrador importado?
Mission language|Idioma de la misión
Reward|Recompensa
No item reward|Sin premio en objetos
Copy address|Copiar dirección
Wallet copied.|Cartera copiada.
Could not copy wallet.|No se pudo copiar la cartera.
This tool is currently open.|Esta herramienta está abierta.
Preview does not save or send rewards.|La vista previa no guarda ni envía recompensas.
Delivery completion|Entrega de misiones
Rule distribution|Distribución de reglas
Manual|Manual
Automatic|Automático
Source|Origen
JSON backup|Respaldo JSON
No saved daily missions.|Sin misiones diarias guardadas.
Saved snapshot|Lectura guardada
New mission|Nueva misión
More|Más
Protect your work|Protege tu trabajo
Read-only analytics|Análisis de solo lectura
Game control|Control del juego
Moderation|Moderación
Assets|Activos
System|Sistema
Mission editing|Edición de misiones
Transaction in progress|Transacción en curso
Keep this tool open until its transaction finishes.|Mantén esta herramienta abierta hasta que termine su transacción.
Go back|Volver
Connection|Conexión
Loading the rules…|Cargando las reglas…
Rules loaded.|Reglas cargadas.
Rules saved.|Reglas guardadas.
Preview ready.|Vista previa lista.
Deliveries loaded.|Entregas cargadas.
History loaded.|Historial cargado.
Day loaded.|Día cargado.
Day saved.|Día guardado.
No manual missions for this day. You can create a draft.|Este día no tiene misiones manuales. Puedes crear un borrador.
No rules available.|No hay reglas disponibles.
Requested amount|Cantidad solicitada
Objectives|Objetivos
Rewards|Recompensas
Translations|Traducciones
Data could not be loaded.|No se pudieron cargar los datos.
Session could not be verified.|No se pudo verificar la sesión.
Loading deliveries…|Cargando entregas…
Loading history…|Cargando historial…
Mission configuration|Configuración de misiones
Reward totals apply to one player completing all missions in this draft.|Los totales corresponden a un jugador que complete todas las misiones del borrador.
Preview totals are estimates of the draft, not rewards already paid.|Los totales describen el borrador; no son premios ya pagados.
Actual rewards shown here come from the backend delivery records.|Los premios reales mostrados aquí proceden de los registros de entregas del backend.
Limited result set|Resultados limitados
These results may be limited by the API. Use the search to narrow the query.|La API puede limitar estos resultados. Usa la búsqueda para acotar la consulta.
The loaded results include up to 300 delivery records per source.|Los resultados cargados incluyen hasta 300 registros de entregas por origen.
Manual editor|Editor manual
Automatic rules|Reglas automáticas
Deliveries|Entregas
Schedule|Calendario
Saved manually|Guardado manualmente
Automatically generated|Generado automáticamente
1 · Administrator access|1 · Acceso de administrador
2 · NPC and day|2 · NPC y día
3 · Missions for the day|3 · Misiones del día
4 · Repeat or delete|4 · Repetir o borrar
5 · Mission history|5 · Historial de misiones
This signature only proves wallet ownership and does not authorize a transaction.|La firma solo demuestra que la cartera es tuya y no autoriza ninguna transacción.
Saved days for this NPC appear below. Select one to edit it.|Los días ya cargados de este NPC aparecen abajo; púlsalos para editarlos.
Saving replaces all missions for this NPC and day. Players receive the update when they open the mission panel.|Se reemplazan TODAS las misiones de ese NPC y día. El juego las lee al abrir el panel de misiones, así que se reflejan sin tocar nada más.
no manual missions|no hay misiones manuales
When a day has|Cuando un día
deliver|entregar
hunt|cazar
, the game builds that NPC's missions from these rules: how many per day, the mix of|, el juego genera las misiones del NPC según estas reglas: cantidad diaria, combinación de
missions, which items or monsters can be asked for, and which rewards can come out (random, by weight). Manual missions for a day always win. Uses the NPC chosen in section 2.|misiones, objetos o monstruos solicitados y premios posibles (al azar, según su peso). Las misiones manuales tienen prioridad. Se aplica al NPC elegido arriba.
Gold is real money (1 gold = 1 USD): the server caps it at 1000 per mission. Only items that can be minted on-chain are accepted as rewards.|El servidor trata el oro como moneda de valor real (1 oro = 1 USD) y lo limita a 1000 por misión. Solo acepta objetos acuñables en cadena como premios.
For the NPC and day chosen in section 2: every player who did something that day (handed in a mission or hunted), which missions they completed or not, and what they received — with their wallet, name and level.|Para el NPC y día elegidos: jugadores que entregaron misiones o cazaron, sus misiones completadas o pendientes y los premios recibidos, con cartera, nombre y nivel.
Players ranked by total missions delivered. The|Quién ha entregado más misiones. El
lifetime total|acumulado
is the account's all-time counter; the|es el contador de toda la vida de la cuenta; los
records|registros
are daily deliveries, which are removed when clearing history.|son las entregas guardadas día a día, que son las que se borran al limpiar.
Current rules|Reglas actuales
No automatic missions|Sin misiones automáticas
Rules are disabled for this NPC.|Las reglas están desactivadas para este NPC.
No automatic tasks will be generated until rules are enabled and saved.|No se generarán misiones automáticas hasta activar y guardar las reglas.
View all controls|Ver todos los controles
Open full page|Abrir página completa
Loading|Cargando
Confirm before saving|Confirma antes de guardar
Prepared locally|Preparado localmente
Total missions|Misiones totales
Default rules|Reglas predeterminadas
Automatic missions|Misiones automáticas
No data|Sin datos
Saved days|Días guardados
Manual missions|Misiones manuales
Connected|Conectado
No preview yet|Aún sin vista previa
Date and NPC|Fecha y NPC
Edit missions|Editar misiones
Review rewards|Revisar premios
Publish in game|Publicar en el juego
The original controls remain available in each tool.|Los controles originales siguen disponibles en cada herramienta.
Back to control center|Volver al centro de control
Choose appearance|Elegir apariencia
Choose language|Elegir idioma
Security|Seguridad
Signed wallet session|Sesión de cartera firmada
Ready|Listo
read-only|solo lectura
Administrator only|Solo administrador
Refresh failed. The previous snapshot is still displayed.|No se pudo actualizar. Se mantiene la lectura anterior.
Could not load tool|No se pudo cargar la herramienta
Requests were cancelled because the session changed.|Las solicitudes se cancelaron porque cambió la sesión.
Gold reward|Premio en oro
Silver reward|Premio en plata
Tools|Herramientas
Administration|Administración
Active tool|Herramienta activa
Show all|Mostrar todo
Preparing workspace…|Preparando el espacio de trabajo…
Backend|Backend
Connected tools|Herramientas conectadas
Only the selected tool runs in this workspace.|Solo se ejecuta la herramienta seleccionada en este espacio.
Use this workspace to keep all your game controls organized.|Usa este espacio para mantener organizados los controles del juego.
Activity snapshot|Lectura de actividad
Accounts|Cuentas
UTC|UTC
Today|Hoy
Good to go|Listo para empezar
Close workspace|Cerrar espacio de trabajo
Automatic rules preview|Vista previa de reglas automáticas
Update preview|Actualizar vista previa
Scroll to top|Subir al inicio
Details|Detalles
Item|Objeto
Requested|Solicitado
Quantity|Cantidad
No changes pending|Sin cambios pendientes
Read the selected day|Consultar el día elegido
Save this draft|Guardar este borrador
Navigation|Navegación
Select tool|Seleccionar herramienta
Retry|Reintentar
This account has no administrator permission.|Esta cuenta no tiene permiso de administrador.
Please wait…|Espera…
Gold maximum per player|Oro máximo por jugador
Silver maximum per player|Plata máxima por jugador
Currency rewards|Premios en monedas
Changes are not saved automatically.|Los cambios no se guardan automáticamente.
Every field keeps its original game identifier.|Cada campo conserva su identificador original del juego.
No transaction was sent.|No se envió ninguna transacción.
Exported|Exportado
Mission count|Cantidad de misiones
No data available.|No hay datos disponibles.
Game operations,|Todo el juego,
in one place.|bajo control.
Your forest.|Tu bosque.
Your control room.|Tu centro de control.
Your workspace|Tu espacio de trabajo
Game administration / Missions|Administración del juego / Misiones
Farmer Joe|granjero
Guardian|guardian
Hunt monsters / enemies|Cazar monstruos / enemigos
Remove|Quitar
Ranger registry · Grassland Forest|Registro de guardabosques · Grassland Forest
Reports console · Grassland Forest|Consola de reportes · Grassland Forest
Contract ledger · Grassland Forest|Libro del contrato · Grassland Forest
Player audit with backend-attributed hashes and contract operations.|Auditoría de jugadores con hashes y operaciones del contrato atribuidas por el backend.
“Organic Human Activity” is a behavioral indication, not proof that an account is human. The actor requires an authenticated caller or registered sender; historical inventory associations do not prove who initiated the operation and are shown separately. Each hash is counted once per actor; a transaction may contain several operations. Backend users are not equivalent to unique on-chain wallets.|“Actividad Orgánica Humana” es un indicio de comportamiento, no demuestra que una cuenta sea humana. El actor requiere un caller autenticado o un emisor registrado; las asociaciones históricas al inventario no prueban quién originó la operación y se muestran aparte. Un hash se cuenta una vez por actor; una transacción puede contener varias operaciones. Los usuarios del backend no equivalen a wallets únicas on-chain.
The report retains its snapshot date. Regenerating replaces edited text. To create a PDF, choose Save as PDF in the print dialog.|El informe conserva la fecha de la instantánea. Al regenerarlo se reemplaza el texto editado. Para crear el PDF, elige “Guardar como PDF” en el diálogo de impresión.
. Use the full catalog identifier from the detail view or export. Do not repeat pieces.|. Usa el identificador completo del catálogo, disponible en la ficha o exportación. No repitas piezas.
The system owner can assign or remove a delegate per collection. If already a contract administrator, that delegate and the system owner can manage the collection here. Other administrators have read access. A wallet without the admin role is recorded as a representative and cannot sign in. This assignment does not grant global contract permissions.|El owner del sistema puede asignar o retirar un delegado por colección. Si ese delegado ya es administrador contractual, él y el owner del sistema podrán gestionar esa colección en el panel. Los demás administradores tendrán acceso de lectura. Una cartera sin el rol admin queda registrada como representante y no puede iniciar sesión. Esta asignación no concede poderes contractuales globales.
Names, images, attributes, royalty policies, representatives and reversible blocking, suspension or trash. These policies govern operations in this panel.|Nombres, imágenes, atributos, royalties configurados, representantes y bloqueo, suspensión o papelera reversibles. Estas políticas rigen las operaciones de este panel.
InvoiceSystem does not expose tokenURI or ERC-721/ERC-1155. Backend controls cannot prevent operations another administrator performs directly on the contract.|InvoiceSystem no expone tokenURI ni ERC-721/ERC-1155. Los controles del backend no impiden operaciones que otro administrador ejecute directamente contra el contrato.
Connect the administrator wallet to configure the world's weather. It is the same wallet used for|Conecta la cartera de administrador para configurar el tiempo que hace en el mundo. Es la misma cartera que abre
Day or night for everyone. In|Día o noche para todo el mundo. En
the clock runs by itself: Set daytime / nighttime|el reloj corre solo: «Poner de día / de noche» lo
advances|adelanta
it to 08:00 or 21:00 and it keeps running from there. In|hasta las 08:00 o las 21:00 y desde ahí sigue corriendo. En
the time stays|la hora se queda
still|quieta
where you set it. Players see the change immediately.|donde la pongas. Los jugadores lo ven al momento.
: runs by itself.|: corre solo.
: time remains fixed at the value you enter.|: la hora se queda fija en la que escribas.
: the server draws the weather every few minutes.|: el servidor lo sortea cada tantos minutos.
: applies exactly what you set below and does not change by itself.|: manda exactamente lo que pongas aquí abajo y no cambia solo.
What is visible when the mode is|Lo que se ve cuando el modo es
. In automatic mode, these switches show the current weather, but the draw changes it.|. En automático estos interruptores muestran lo que hay en curso, pero los cambia el sorteo.
Sunbeams enter from the top left, where the game's light comes from. This removes rain and snow: sunshine and rain cannot run together.|Entran rayos de sol por la esquina de arriba a la izquierda, de donde viene la luz del juego. Quita la lluvia y la nieve: no puede hacer sol y llover a la vez.
Nothing falls from the sky: cloud shadows cross the world floor. They follow the map, so players walk through them like real shadows. This removes the sun effect: sunbeams and an overcast sky cannot run together.|No cae nada del cielo: lo que se ve son las SOMBRAS DE LAS NUBES cruzando el suelo del mundo. Van pegadas al mapa, no a la cámara, así que al caminar se atraviesan como una sombra de verdad. Quita el sol: no puede haber rayos y cielo cubierto a la vez.
Changes the color of|Cambia el color de
the whole|todo
world. In|el mundo. En
it follows the actual month. The transition takes a couple of seconds.|sale del mes de verdad. El cambio no es de golpe: cruza en un par de segundos.
Choose|Elige
what|qué
and|y
how long|cuánto
Launch|Lanzar
applies it right now;|lo pone ya mismo;
schedules it after the current weather ends. You choose the minutes: from 1 to 1440.|lo deja apuntado para cuando acabe lo que haya en curso. Los minutos los pones tú: de 1 a 1440.
Weather runs|Se van poniendo
one after another|uno detrás de otro
as each previous entry ends. The queue takes priority over the automatic draw: scheduled weather overrides random selection.|conforme acaba el anterior. La cola manda sobre el sorteo automático: mientras haya algo apuntado, el azar no pinta nada.
Connect the wallet of the|Conecta la cartera del
owner|owner
or a contract|o de un
admin|admin
to the contract. This page only reads the chain: no signing is required.|del contrato. La página solo lee la cadena: no pide firmar nada.
The owner and your wallet are always checked. Other admins are discovered through AdminAdded / AdminRemoved events: use the button to scan history (progress is remembered).|El owner y tu cartera se comprueban siempre. Los demás admins salen de los eventos AdminAdded / AdminRemoved: pulsa el botón para recorrer el historial (se recuerda lo ya leído).
The 52 game tables, plus those found in scanned TipoLimitSet events. Usage = circulating units ÷ limit.|Las 52 tablas que usa el juego, más las que aparezcan en los eventos TipoLimitSet leídos. Uso = en circulación ÷ límite.
No token needs to be pasted: sign a message with the administrator wallet, just as in the player panel. The signature only proves wallet ownership and does not authorize a transaction.|Ya no hace falta pegar ningún token: se entra firmando un mensaje con la cartera de administrador, igual que en el panel de jugadores. La firma no autoriza ninguna transacción, solo demuestra que la cartera es tuya.
World weather — Grassland Forest|Clima — Grassland Forest
Grassland Forest — Daily missions|Grassland Forest — Misiones diarias
Search by wallet address or character name…|Buscar por dirección de cartera o nombre del personaje…
Search by player, wallet, reason or details…|Buscar por jugador, cartera, motivo o detalle…
Search collection…|Buscar colección…
Name, #ID or address…|Nombre, #ID o dirección…
Address, piece or transaction…|Dirección, pieza o transacción…
Filter table…|Filtrar tabla…
Search message, scene or file…|Buscar mensaje, escena o archivo…
No players yet.|Todavía no hay jugadores.
No data|sin datos
Character data|Datos del personaje
Account|Cuenta
Registration|Alta
Logins|Inicios de sesión
Inventory|Inventario
Chest|Cofre
Contract invoices|Facturas del contrato
No fields to save.|No hay nada que guardar.
Loading player…|Cargando ficha…
Reading contract…|Leyendo el contrato…
No wallet|sin cartera
Character level|Nivel personaje
Pet level|Nivel mascota
Character name|Nombre personaje
Pet name|Nombre mascota
Inventory plots|Parcelas (inventario)
Placed plots|Parcelas colocadas
Write to chain now|Escribir en la cadena ahora
Delete account|Eliminar la cuenta
Delete permanently|Eliminar definitivamente
Farming configuration saved|Configuración de siembra guardada
Leaderboard configuration saved|Configuración de clasificación guardada
Default values|Valores por defecto
No tables returned by the server.|El servidor no devolvió ninguna tabla.
No seeds returned by the server.|El servidor no informó de ninguna semilla.
Reading…|Leyendo…
Searching…|Buscando…
Version|Versión
Invoices issued|Facturas emitidas
Active invoices|Facturas activas
Circulating units|Unidades en circulación
Burned units|Unidades quemadas
Configured tables|Tablas configuradas
Migration|Migración
Sealed|Sellada
Open|Abierta
Created|Creada
Increased|Aumentada
Spent|Gastada
Deleted|Borrada
Transferred|Transferida
Moved|Movida
Slot|Casilla
Migrated|Migrada
Configuration|Configuración
No tables match this filter.|Ninguna tabla con ese filtro.
No permission|sin permiso
Low gas balance|poco saldo para gas
Healthy|bien
Nothing in this window.|Nada en esta ventana.
Enter a number.|Escribe un número.
Invoice not found.|No existe esa factura.
No ACTIVE invoice with that manualId.|No hay ninguna factura ACTIVA con ese manualId.
Invalid address.|Dirección no válida.
Owner|Dueño
Active|Activa
Unassigned|sin asignar
free|libre
Delete ALL client error reports? This cannot be undone.|¿Borrar TODOS los reportes de errores del cliente? Esto no se puede deshacer.
Really delete every report? Last chance.|¿Borrar todos los reportes? Última oportunidad.
You rejected the signature.|Rechazaste la firma.
This wallet is not an admin. Access denied.|Esta cartera no es administradora. Acceso denegado.
MetaMask not detected. Install it to continue.|No se detectó MetaMask. Instálalo para continuar.
Enter a valid 0x address to ban.|Introduce una dirección 0x válida para bloquear.
Report deleted|Reporte borrado
No message|Sin mensaje
Unknown|Desconocido
just now|hace un momento
Processing…|Procesando…
No account is currently suspended.|No hay ninguna cuenta suspendida ahora mismo.
No reports match the filter.|Ningún reporte coincide con el filtro.
No reports yet. Good news.|No hay reportes todavía. Buena señal.
Loading case file…|Cargando expediente…
The reporting player did not provide details.|El jugador que reportó no escribió detalles.
Warning message (sent to the in-game mailbox and by email if configured)|Mensaje de la advertencia (se envía al buzón del juego y, si hay correo configurado, también por email)
Dismiss marks the report as dismissed and retains the record for later review. Delete permanently removes it.|"Quitar de la lista" marca el reporte como descartado y deja el rastro para futuras revisiones. "Borrar para siempre" lo elimina de verdad.
Suspension lifted|Suspensión levantada
Account banned and removed from the game|Cuenta baneada y expulsada del juego
Ban removed|Baneo retirado
Report dismissed (no sanction)|Reporte descartado (sin sanción)
Reported|Reportado
User name|Nombre de usuario
No collection yet|Aún no hay colecciones
No pieces yet|Aún no hay piezas
No transfers yet|Sin movimientos todavía
No payments yet|Sin cobros todavía
No operations pending|No hay operaciones pendientes
System owner|Owner del sistema
Contract administrator|Administrador del contrato
Every piece|Cada pieza
Ready to send|Listo para enviar
Actions|Acciones
Collection created|Colección creada
Edit|Editar
Edit collection|Editar colección
Edit piece|Editar pieza
New collection|Nueva colección
Create|Crear
Attributes|Atributos
Symbol|Símbolo
Delegate|Delegado
Total supply|Suministro total
Supply limit|Límite de emisión
Collection limit|Límite de la colección
Contract type|Tipo del contrato
Type key|Clave de tipo
Representative|Representante
Inherited|Heredado
No royalty|Sin royalty
No linked accounts|Sin cuentas vinculadas
Draft|Borrador
Selected|Seleccionado
Select|Seleccionar
Transfer|Transferir
Issue|Emitir
Confirm hash|Confirmar hash
Register hash|Registrar hash
Sending|Enviando
Confirmed|Confirmado
Paused|Pausado
Retry|Reintentar
Loading the catalog…|Cargando catálogo…
No results|Sin resultados
No pieces match the filter.|Ninguna pieza coincide con el filtro.
No collections match the filter.|Ninguna colección coincide con el filtro.
No history for the selected filters.|No hay historial para los filtros elegidos.
Collection representative|Representante de la colección
Source|Origen
Destination|Destino
Payer address|Dirección del pagador
Receiver address|Dirección del receptor
Transaction hash|Hash de transacción
Image|Imagen
Choose files|Elegir archivos
Add attribute|Añadir atributo
Attribute|Atributo
Value|Valor
`;
  const supplements = `
Use a percentage from 0 to 100, with up to two decimal places.|Usa un porcentaje entre 0 y 100, con hasta dos decimales.
Royalty cannot exceed 100%.|El royalty no puede superar el 100 %.
Use a list with up to 200 attributes per piece.|Usa una lista con un máximo de 200 atributos por pieza.
Each attribute needs a name of up to 100 characters and a text or numeric value of up to 500 characters.|Cada atributo necesita un nombre de hasta 100 caracteres y un valor de texto o número de hasta 500 caracteres.
Enter only your API's HTTPS origin; HTTP is allowed on localhost for testing.|Indica solo el origen HTTPS de tu API; para pruebas se permite HTTP en localhost.
Could not complete the operation.|No se pudo completar la operación.
The session changed. Reconnect your wallet.|La sesión cambió. Reconecta la cartera.
The API did not return JSON. Check that server2.js is up to date.|La API no devolvió JSON. Comprueba que server2.js esté actualizado.
The session changed.|La sesión cambió.
The session expired. Connect again.|La sesión expiró. Conecta de nuevo.
This account cannot access the panel.|Esta cuenta no tiene acceso al panel.
The backend did not return a CSRF token.|El backend no devolvió el token CSRF.
The connected account changed. Verify access again.|Cambió la cuenta conectada. Verifica el acceso de nuevo.
The wallet network changed. Verify access again.|Cambió la red de la cartera. Verifica el acceso de nuevo.
The wallet disconnected.|La cartera se desconectó.
The backend session belongs to another wallet. Connect the administrator wallet.|La sesión del backend corresponde a otra cartera. Conecta la administradora.
Open this page with an EVM wallet installed, such as MetaMask.|Abre esta página con una cartera EVM instalada, como MetaMask.
No account selected.|No elegiste una cuenta.
Review and sign the access message in your wallet…|Verifica y firma el mensaje de acceso en tu cartera…
Invalid nonce.|Nonce inválido.
The account changed while signing.|La cuenta cambió durante la firma.
The session does not match your wallet.|La sesión no corresponde a tu cartera.
Wallet verified. Welcome to the studio.|Cartera verificada. Bienvenido al estudio.
This query contains partial data or pending synchronization. Review Contract & permissions and catalog limits before exporting or interpreting totals.|La consulta contiene datos parciales o una sincronización pendiente. Revisa Contrato y permisos y los límites del catálogo antes de exportar o interpretar totales.
Your next story starts here.|Tu próxima historia empieza aquí.
Your collection archive|Tu archivo de colecciones
Addresses with on-chain pieces|Direcciones con piezas en cadena
Your first collection starts here|Tu primera colección empieza aquí
Confirmed issues and transfers will appear here.|Aquí aparecerán las emisiones y transferencias confirmadas.
No collections in this view|No hay colecciones en esta vista
Create a collection or adjust the filters.|Crea una colección o cambia los filtros.
No pieces in this view|No hay piezas en esta vista
Choose a collection and add images to get started.|Selecciona una colección y agrega imágenes para comenzar.
Issuance|Emisión
Observed in catalog|Observadas en el catálogo
Pairs with transfers|Pares con transferencias
No confirmed transfers yet.|Todavía no hay transferencias confirmadas.
No verified payments recorded.|No hay cobros verificados registrados.
Transfers in the last fourteen days|Transferencias de los últimos catorce días
Verified payments in the last fourteen days|Cobros verificados de los últimos catorce días
Rules by collection|Reglas por colección
Backend configuration|Configuración en el backend
Per-piece exceptions|Excepciones por pieza
The contract does not record sales|El contrato no registra ventas
Operation|Operación
No operations yet|Sin operaciones todavía
Operations prepared in the backend will appear here.|Las operaciones preparadas en el backend aparecerán aquí.
Invalid pagination response.|Respuesta de paginación inválida.
Read only|Solo lectura
This collection is delegated. Only its delegate and the system owner may modify it here.|Esta colección está delegada. Solo su delegado y el owner del sistema pueden modificarla en el panel.
Configure collection|Configurar colección
Pending on-chain configuration.|Pendiente de configurar en cadena.
Invalid royalty receiver.|Receptor de royalties inválido.
Enter the royalty receiver.|Indica el receptor del royalty.
Invalid representative address.|Dirección del representante inválida.
Enter a collection name.|Escribe el nombre de la colección.
The limit must be a positive integer.|El límite debe ser un entero positivo.
Change collection status|Cambiar estado de la colección
Collection updated.|Colección actualizada.
Collection created. Configure its type on chain before issuing pieces.|Colección creada. Configura su tipo en cadena antes de emitir piezas.
Prepare issuance|Preparar emisión
Invalid receiver.|Receptor inválido.
Enter a royalty receiver.|Indica un receptor de royalties.
You need an active collection with management permission to add images.|Necesitas una colección activa con permiso de gestión para agregar imágenes.
Select at most 100 images at a time.|Selecciona como máximo 100 imágenes a la vez.
Select at least one image.|Selecciona al menos una imagen.
Your selection contains a delegated collection you can only view.|La selección incluye una colección delegada que solo puedes consultar.
No pieces in the selected scope.|No hay piezas en el alcance seleccionado.
Enter a valid receiver.|Indica un receptor válido.
Each collection's rule will be restored.|Se restaurará la regla de cada colección.
Enter a valid positive price with up to 18 decimal places.|Introduce un precio positivo válido, con hasta 18 decimales.
First issue a piece and set its royalty percentage and receiver.|Primero emite una pieza y configura su porcentaje y receptor de royalties.
Update server2.js to record verified payments.|Actualiza server2.js para registrar cobros verificados.
Record royalty payment|Registrar cobro de royalty
Could not load ethers.|No se pudo cargar ethers.
Use a native-currency price with up to 18 decimal places.|Usa un precio en moneda nativa con hasta 18 decimales.
The price must be positive.|El precio debe ser positivo.
The hash must be 32 bytes (0x and 64 hexadecimal characters).|El hash debe tener 32 bytes (0x y 64 caracteres hexadecimales).
Wait for or pause deliveries before changing the queue.|Espera o pausa los envíos antes de cambiar la cola.
You lack management permission for some selected pieces.|No tienes permiso de gestión sobre todas las piezas seleccionadas.
Waiting for confirmation…|Esperando confirmación…
Hash registration pending|Pendiente de registrar hash
Issue to recipient|Emitir al destinatario
All deliveries are already complete.|Todos los envíos ya fueron completados.
Select a piece in every row.|Selecciona una pieza en cada fila.
Could not load vendor/ethers.umd.min.js.|No se pudo cargar vendor/ethers.umd.min.js.
The wallet changed.|Cambió la cartera.
The wallet changed.|La cartera cambió.
Enter a valid 32-byte transaction hash.|Indica un hash de transacción válido de 32 bytes.
The backend did not return a valid operation.|El backend no devolvió una operación válida.
The backend operation does not match the expected contract.|La operación devuelta por el backend no corresponde al contrato esperado.
Configure collection on chain|Configurar colección en cadena
Sign configuration|Firmar configuración
Collection configured on chain.|Colección configurada en cadena.
Start deliveries|Comenzar envíos
Connection saved. Connect your wallet to this backend.|Conexión guardada. Conecta tu cartera con este backend.
Operation confirmed.|Operación confirmada.
Maximum 200 attributes.|Máximo 200 atributos.
Maximum 200 deliveries in a queue.|Máximo 200 envíos en una cola.
Pause the queue before importing.|Pausa la cola antes de importar.
The queue accepts up to 200 rows.|La cola admite un máximo de 200 filas.
Use valid block numbers.|Usa números de bloque válidos.
Range synchronized. More blocks remain; synchronize again to continue.|Tramo sincronizado. Hay más bloques; vuelve a sincronizar para continuar.
Synchronization complete.|Sincronización terminada.
IDENTITY AND RULES|IDENTIDAD Y REGLAS
Name *|Nombre *
Symbol (optional)|Símbolo (opcional)
On-chain piece limit|Límite de piezas en cadena
Reversible status|Estado reversible
Reference royalty (%)|Royalty de referencia (%)
Royalty receiver|Receptor de royalties
Collection representative / owner (optional)|Representante / dueño de la colección (opcional)
Unassigned|Sin asignar
Only the system owner assigns this representative. This grants neither global administration nor access to this panel.|Solo el owner del sistema asigna este representante. No concede administración global ni acceso a este panel.
Royalties and statuses are backend policies. Moving a collection to trash retains its pieces and history; restoring it does not change individual statuses.|Los royalties y estados son políticas del backend. Enviar una colección a la papelera conserva sus piezas e historial; restaurarla no cambia los estados individuales.
Type configured on chain.|Tipo configurado en cadena.
Configure on-chain limit|Configurar límite en cadena
Apply status|Aplicar estado
You can restore it. On-chain invoices are retained.|Podrás restaurarla. Las facturas en cadena se conservan.
Catalog ID|ID catálogo
Current invoice ID|ID factura actual
On-chain owner|Propietario en cadena
Not issued|Sin emitir
Name (optional)|Nombre (opcional)
Inherit from collection|Heredar de la colección
Custom for this piece|Personalizado para esta pieza
Individual royalty (%)|Royalty individual (%)
Individual receiver|Receptor individual
optional|opcionales
· optional|· opcionales
Up to 200 attributes per piece. You can add or remove rows.|Hasta 200 atributos por pieza. Puedes agregar y quitar filas.
Attribute name|Nombre del atributo
Trait, for example: rarity|Rasgo, por ejemplo: rareza
Attribute value|Valor del atributo
Remove attribute|Quitar atributo
Piece updated.|Pieza actualizada.
Prepare transfer|Preparar transferencia
NEW PIECES|NUEVAS PIEZAS
Destination collection|Colección de destino
Select your images|Selecciona tus imágenes
PNG, JPEG, WebP or GIF · maximum 600 000 bytes per image · up to 100 pieces per selection.|PNG, JPEG, WebP o GIF · máximo 600 000 bytes por imagen · hasta 100 piezas por selección.
Select NFT images|Seleccionar imágenes NFT
0 images selected|0 imágenes seleccionadas
Common description (optional)|Descripción común (opcional)
Common attributes are copied to every piece. You can customize them per image below. The backend assigns final IDs without reusing numbers.|Los atributos comunes se copian a cada pieza. Puedes personalizarlos por imagen abajo. Los #ID finales los asigna el backend, sin reutilizar números.
Save drafts|Guardar borradores
Optional name|Nombre opcional
Selected pieces|Piezas seleccionadas
All pieces in the current view|Todas las piezas de la vista actual
All loaded catalog pieces|Todas las piezas cargadas del catálogo
Scope|Alcance
Rule|Regla
Custom percentage|Porcentaje personalizado
Restore each collection's rule|Restaurar regla de cada colección
This sets reference percentages. It does not execute payments or add royalties to the contract.|Esto configura porcentajes de referencia. No ejecuta pagos ni añade royalties al contrato.
Apply|Aplicar
NATIVE PAYMENT VERIFICATION|VERIFICACIÓN DE PAGO NATIVO
Declared sale price · native currency|Precio de venta declarado · moneda nativa
Hash of an existing royalty payment|Hash del pago de royalty ya realizado
Verify and record|Verificar y registrar
Select a piece|Selecciona una pieza
Transfer existing piece|Transferir pieza existente
Destination reserved. Resume this operation.|Destino reservado. Reanuda esta operación.
Add a row, select pieces from the library or import CSV.|Agrega una fila, selecciona piezas en la biblioteca o importa un CSV.
1 unit|1 unidad
Saved data will be applied. This operation requires gas and a signature.|Se aplican los datos ya guardados. Esta operación requiere gas y una firma.
Each transaction requires a signature and gas. Drafts are reserved for the selected wallet and destination when started. Resume the same operation after an interruption; keep its hash if it was already sent.|Cada transacción requiere una firma y gas. Al comenzar, los borradores quedan reservados para la cartera y el destino elegidos. Si interrumpes el proceso, reanuda esta misma operación; conserva el hash si ya se envió.
Data updated.|Datos actualizados.
Panel closed.|Panel cerrado.
No permission|Sin permiso
The maximum duration cannot be less than the minimum.|La duración máxima no puede ser menor que la mínima.
Saved. Players can already see the change.|Guardado. Los jugadores ya lo están viendo.
Enter minutes from 1 to 1440.|Pon los minutos: de 1 a 1440.
The queue is full (maximum 40).|La cola está llena (40 como mucho).
Removed from queue.|Quitado de la cola.
Current weather ended; the next entry starts now.|Se corta lo de ahora y entra el siguiente.
It is daytime.|Es de día
It is nighttime.|Es de noche
Clock running (automatic)|Reloj en marcha (automático)
Clock stopped (manual)|Reloj QUIETO (manual)
Could not read the time|No se pudo leer la hora
It is daytime now.|Ya es de día.
It is nighttime now.|Ya es de noche.
The clock resumes from here.|El reloj vuelve a correr desde aquí.
Enter a time, for example 21:00.|Escribe una hora, por ejemplo 21:00.
Clear the entire queue?|¿Vaciar la cola entera?
Nothing scheduled. Current weather continues, then the automatic draw takes over.|Nada programado. Lo que haya en curso seguirá su camino y luego manda el sorteo.
Weather OFF|Clima APAGADO
No wind|Sin viento
No rain|Sin lluvia
No snow|Sin nieve
No sunlight|Sin sol
No clouds|Sin nubes
It will look like this (e.g. Wood Log)|Se verá así en el panel (ej. Madera Tronco)
It will look like this (e.g. Iron Ore)|Se verá así en el panel (ej. Mineral de Hierro)
Type BORRAR to confirm:|Escribe BORRAR para confirmar:
Could not get the nonce|No se pudo obtener el nonce
The nonce was already used; requesting a new one…|El nonce ya se había usado; pidiendo uno nuevo…
valid session|sesión válida
This wallet is not an administrator. Add it to ADMIN_ADDRESSES or grant admin in the contract.|Esa cartera no es administradora. Añádela a ADMIN_ADDRESSES o dale admin en el contrato.
Connect the administrator wallet to begin.|Conecta la cartera de administrador para empezar.
No missions for this day yet: create a new draft.|Ese día no tiene misiones todavía: empieza una nueva.
Add at least one mission.|Añade al menos una misión.
Choose a day to delete.|Elige el día a borrar.
Could not connect to the API. Check that the published backend is running and permits access from this domain.|No se pudo conectar con la API. Comprueba que el backend publicado esté activo y permita el acceso desde este dominio.
This request belongs to an earlier session.|La solicitud pertenece a una sesión anterior.
The session could not renew due to a temporary failure; another attempt will follow.|La sesión no se pudo renovar por un fallo temporal; volveré a intentarlo.
The API did not return a valid CSRF token.|La API no devolvió un token CSRF válido.
The API did not return a valid CSRF token. Check the published backend before reconnecting.|La API no devolvió un token CSRF válido. Comprueba el backend publicado antes de volver a conectar.
RPC verification is still unavailable. Your session remains active; choose Retry verification without signing again.|El RPC todavía no permite verificar el acceso. Tu sesión sigue activa; pulsa Reintentar verificación para comprobarla sin volver a firmar.
Connect the administrator wallet to enter.|Conecta la cartera de administrador para entrar.
New (24 h)|Nuevas (24 h)
New (7 days)|Nuevas (7 días)
Active (24 h)|Activos (24 h)
Total time played|Tiempo jugado total
Automatic retry|se reintenta sola
Chain up to date.|Cadena al día.
Check the server log|revisa el registro del servidor
No collection: My NFTs shows none.|Sin colección: el panel My NFTs dice que no hay ninguna.
My NFTs will no longer show the collection. Continue?|El panel My NFTs dejará de enseñar la colección. ¿Seguro?
Collection removed.|Colección quitada.
Collection saved.|Colección guardada.
The wallet changed. Connect the administrator account to enter again.|La cartera cambió. Conecta la cuenta administradora para volver a entrar.
The wallet lost its RPC connection. Your administrative session remains active.|La cartera perdió conexión con su RPC. Tu sesión administrativa sigue activa.
This wallet is NOT an administrator. Use an authorized wallet.|Esa cartera NO es administradora. Entra con una que esté autorizada.
Lift this suspension? The account will be able to enter immediately.|¿Levantar esta suspensión? La cuenta podrá entrar de inmediato.
This permanently deletes the report from the database. Continue?|Esto borra el reporte de la base de datos y no se puede deshacer. ¿Seguir?
Warning sent to the in-game mailbox|Advertencia enviada al buzón del juego
✅ passed|✅ pasó
❌ failed|❌ falló
⌛ expired|⌛ expiró
📨 sent|📨 enviado
There is no MetaMask wallet in this browser.|No se encuentra MetaMask en este navegador.
The contract address is invalid.|La dirección del contrato no es válida.
Other network (read only through RPC)|Otra red (solo lectura por RPC)
This wallet is neither owner nor admin of the contract. Change accounts in MetaMask and reconnect.|Esta cartera no es el owner ni un admin del contrato. Cambia de cuenta en MetaMask y vuelve a conectar.
Could not connect.|No se pudo conectar.
highest ID|id más alto
sum of all tables|suma de las tablas
none near the limit|ninguna cerca del límite
seal when finished (sealMigration)|sella al terminar (sealMigration)
Read error|error al leer
Not configured|sin configurar
Your wallet|tu cartera
(you)|(tú)
Finding the contract deployment block…|Buscando el bloque en el que se desplegó el contrato…
No activity|sin actividad
Continue?|¿Continuar?
This cannot be undone. Continue?|Esto no se puede deshacer. ¿Continuar?
Some fields are contract invoices. Saving sends real blockchain transactions. Continue?|Algunos campos son facturas del contrato. Guardar enviará transacciones reales a la blockchain. ¿Continuar?
Your account was reported for|Tu cuenta fue reportada por
automatic|automática
Farmer Joe|Granjero Joe
Guardian|Guardián
`;
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const en = new Map(), es = new Map();
  (pairs+'\n'+supplements).trim().split('\n').forEach(line => {
    const at = line.indexOf('|'); if (at < 0) return;
    const a = normalize(line.slice(0,at)), b = normalize(line.slice(at+1));
    en.set(b,a); en.set(a,a); es.set(a,b); es.set(b,b);
  });
  const templates = [
    [/^Cargadas (\d+) misión\(es\) de (.+)\.$/,/^Loaded (\d+) mission\(s\) for (.+)\.$/,'Loaded $1 mission(s) for $2.','Cargadas $1 misión(es) de $2.'],
    [/^(\d+) misión\(es\)$/,/^(\d+) mission\(s\)$/,'$1 mission(s)','$1 misión(es)'],
    [/^(.+) · (\d+) misión\(es\)$/,/^(.+) · (\d+) mission\(s\)$/,'$1 · $2 mission(s)','$1 · $2 misión(es)'],
    [/^✅ Guardado: (\d+) misión\(es\) para (.+) el (.+)\.$/,/^✅ Saved: (\d+) mission\(s\) for (.+) on (.+)\.$/,'✅ Saved: $1 mission(s) for $2 on $3.','✅ Guardado: $1 misión(es) para $2 el $3.'],
    [/^Página (\d+) de (\d+)(.*)$/,/^Page (\d+) of (\d+)(.*)$/,'Page $1 of $2$3','Página $1 de $2$3'],
    [/^Página (\d+) \/ (\d+)$/,/^Page (\d+) \/ (\d+)$/,'Page $1 / $2','Página $1 / $2'],
    [/^(\d+) jugadores$/,/^(\d+) players$/,'$1 players','$1 jugadores'],
    [/^(\d+) seleccionados$/,/^(\d+) selected$/,'$1 selected','$1 seleccionados'],
    [/^(\d+) ENVÍOS$/,/^(\d+) DELIVERIES$/,'$1 DELIVERIES','$1 ENVÍOS'],
    [/^(\d+) imágenes seleccionadas$/,/^(\d+) images selected$/,'$1 images selected','$1 imágenes seleccionadas'],
    [/^Procesando (\d+) de (\d+)…$/,/^Processing (\d+) of (\d+)…$/,'Processing $1 of $2…','Procesando $1 de $2…'],
    [/^Revisar (\d+) envíos$/,/^Review (\d+) deliveries$/,'Review $1 deliveries','Revisar $1 envíos'],
    [/^Cambiar estado de (\d+) piezas$/,/^Change status of (\d+) pieces$/,'Change status of $1 pieces','Cambiar estado de $1 piezas'],
    [/^Aplicar royalties a (\d+) piezas$/,/^Apply royalties to (\d+) pieces$/,'Apply royalties to $1 pieces','Aplicar royalties a $1 piezas'],
    [/^No se pudo cargar: (.+)$/,/^Could not load: (.+)$/,'Could not load: $1','No se pudo cargar: $1'],
    [/^No se pudo guardar: (.+)$/,/^Could not save: (.+)$/,'Could not save: $1','No se pudo guardar: $1'],
    [/^No se pudo borrar: (.+)$/,/^Could not delete: (.+)$/,'Could not delete: $1','No se pudo borrar: $1'],
    [/^No se pudo entrar: (.+)$/,/^Could not sign in: (.+)$/,'Could not sign in: $1','No se pudo entrar: $1'],
    [/^No se pudo copiar: (.+)$/,/^Could not copy: (.+)$/,'Could not copy: $1','No se pudo copiar: $1'],
    [/^No se pudo completar: (.+)$/,/^Could not complete: (.+)$/,'Could not complete: $1','No se pudo completar: $1'],
    [/^Última edición: (.+)$/,/^Last edited: (.+)$/,'Last edited: $1','Última edición: $1'],
    [/^Última actualización · (.+)$/,/^Last updated · (.+)$/,'Last updated · $1','Última actualización · $1'],
    [/^Expediente · (.+)$/,/^Case file · (.+)$/,'Case file · $1','Expediente · $1'],
    [/^Sesión iniciada como (.+)$/,/^Signed in as (.+)$/,'Signed in as $1','Sesión iniciada como $1'],
    [/^hace (\d+) min$/,/^(\d+) min ago$/,'$1 min ago','hace $1 min'],
    [/^hace (\d+) h$/,/^(\d+) h ago$/,'$1 h ago','hace $1 h'],
    [/^hace (\d+) d$/,/^(\d+) d ago$/,'$1 d ago','hace $1 d'],
    [/^Vista previa de (.+) \((\d+) misiones\):$/,/^Preview for (.+) \((\d+) missions\):$/,'Preview for $1 ($2 missions):','Vista previa de $1 ($2 misiones):'],
    [/^¿Borrar las misiones de (.+) del (.+)\?$/,/^Delete the missions for (.+) on (.+)\?$/,'Delete the missions for $1 on $2?','¿Borrar las misiones de $1 del $2?'],
    [/^Hay (\d+) misión\(es\) sin ítem\.$/,/^(\d+) mission\(s\) have no requested item\.$/,'$1 mission(s) have no requested item.','Hay $1 misión(es) sin ítem.'],
    [/^Peso: (.+)$/,/^Weight: (.+)$/,'Weight: $1','Peso: $1'],
    [/^Eliminar TODOS los reportes de errores del cliente\? Esto no se puede deshacer\.$/,/^Delete ALL client error reports\? This cannot be undone\.$/,'Delete ALL client error reports? This cannot be undone.','Eliminar TODOS los reportes de errores del cliente? Esto no se puede deshacer.']
  ];
  const prefixes = [
    ['No se pudieron leer los días: ','Could not read saved days: '],['No se pudo cargar el historial: ','Could not load history: '],
    ['No se pudo comprobar el acceso: ','Could not verify access: '],['No se pudo comprobar la sesión: ','Could not verify the session: '],
    ['No se pudo verificar el acceso: ','Could not verify access: '],['No se pudieron cargar las suspensiones: ','Could not load suspensions: '],
    ['No se pudieron cargar los reportes: ','Could not load reports: '],['No se pudo leer el historial: ','Could not read history: '],
    ['No se pudo leer la actividad: ','Could not read activity: '],['No se pudo cambiar la hora: ','Could not change the time: '],
    ['No se pudo lanzar: ','Could not launch: '],['No se pudo encolar: ','Could not add to queue: '],['No se pudo quitar: ','Could not remove: '],
    ['No se pudo saltar: ','Could not skip: '],['No se pudo abrir: ','Could not open: '],['No se pudo eliminar: ','Could not delete: '],
    ['Entrada rechazada: ','Sign-in rejected: '],['Error cargando: ','Load error: '],['Cargando historial…','Loading history…'],
    ['No se pudo cargar el catálogo: ','Could not load the catalog: '],['No se pudieron cargar las reglas automáticas: ','Could not load the automatic rules: '],
    ['No se pudieron guardar las reglas: ','Could not save the rules: '],['No se pudo generar la vista previa: ','Could not build the preview: '],
    ['No se pudieron cargar las entregas: ','Could not load the deliveries: ']
  ];
  function translate(value, language) {
    const original = String(value), text = normalize(original), dict = language === 'en' ? en : es;
    let result = dict.get(text);
    if (result === undefined) {
      const pieces = text.match(/^([^\p{L}\p{N}]+)(.+?)(\s*[↗↓›→])?$/u);
      if (pieces && dict.has(pieces[2])) result = pieces[1] + dict.get(pieces[2]) + (pieces[3] || '');
      const trailing = text.match(/^(.+?)\s*([↗↓›→])$/);
      if (result === undefined && trailing && dict.has(trailing[1])) result = dict.get(trailing[1]) + ' ' + trailing[2];
      const previous = text.match(/^([‹←])\s*(.+)$/);
      if (result === undefined && previous && dict.has(previous[2])) result = previous[1] + ' ' + dict.get(previous[2]);
    }
    if (result === undefined) for (const [spanish,english,toEn,toEs] of templates) {
      const pattern = language === 'en' ? spanish : english;
      if (pattern.test(text)) { result = text.replace(pattern,language === 'en' ? toEn:toEs); break; }
    }
    if (result === undefined) {
      const localizedLanguage = text.match(/^(.+?) — (en-US|en-PH|es-419|pt-BR|zh-CN|ko-KR)$/);
      if (localizedLanguage && dict.has(localizedLanguage[1])) result = dict.get(localizedLanguage[1])+' — '+localizedLanguage[2];
    }
    if (result === undefined) for (const [a,b] of prefixes) {
      const source = language === 'en' ? a:b, target = language === 'en' ? b:a;
      if (text.startsWith(source)) { result = target+text.slice(source.length); break; }
    }
    return result === undefined ? original : original.replace(/\S[\s\S]*\S|\S/, result);
  }
  root.GFAdminI18n = Object.freeze({ translate, normalize });
})(window);
