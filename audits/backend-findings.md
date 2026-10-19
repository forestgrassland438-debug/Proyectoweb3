# Revisión del backend y marketplace — 2026-10-12

Se reparó el backend canónico `C:/Users/pc/Desktop/server2.js` y las dos copias
idénticas de `marketplace-routes.js` (workspace y Escritorio). No se arrancó el
backend, no se contactó Mongo ni la cadena, no se firmaron transacciones reales
y no se desplegó nada. Las pruebas extraen declaraciones concretas por AST y
las ejecutan contra proveedores, sockets y modelos falsos.

## Copias de seguridad y trazabilidad

Antes de modificar se copiaron los bytes originales y se verificaron hashes:

| Archivo original | Backup exacto | SHA-256 original/backup |
| --- | --- | --- |
| `C:/Users/pc/Desktop/server2.js` | `C:/Users/pc/Desktop/server2.js.bak-deep-stability-20261012` | `b5a2aa0057bfa7e56c38b957979c4909a4b0053094f5e38728cfc317baacd546` |
| `C:/Users/pc/Desktop/marketplace-routes.js` | `C:/Users/pc/Desktop/marketplace-routes.js.bak-deep-stability-20261012` | `5d5146d6ffc72c60dd34e7fdf81d88e9e6bea87fdf2b3f712cd73dc3b41d616f` |
| `marketplace-routes.js` del workspace | `marketplace-routes.js.bak-deep-stability-20261012` | mismo hash anterior |

La lectura/escritura UTF-8 del original se verificó reversible a nivel de bytes.
El original mezclaba 26.123 CRLF y 135 LF; las ediciones de texto normalizaron a
CRLF. La sincronización del motor embebido usó el script existente que opera
sobre bytes, valida sintaxis y hace un backup adicional antes del reemplazo.
Se conservaron los cambios del usuario existentes en ambos archivos.

Para revisar el diff exclusivo de este trabajo:

```powershell
git diff --no-index -- 'C:\Users\pc\Desktop\server2.js.bak-deep-stability-20261012' 'C:\Users\pc\Desktop\server2.js'
git diff --no-index -- marketplace-routes.js.bak-deep-stability-20261012 marketplace-routes.js
```

## Cobertura real del análisis

El inventario AST abarcó el archivo completo original: 26.258 líneas, seis
clases, 1.188 declaraciones/callbacks de funciones, 54 llamadas de
temporizadores y 64 handlers de `socket.on`. Tras las reparaciones y la
sincronización del motor se inventariaron 209 registros HTTP, 64 handlers de
socket y 51 estructuras Map/Set de nivel superior. El conteo incluye código
embebido y callbacks; no son 1.188 unidades independientes de negocio.

Se analizó estructuralmente todo el archivo y se leyeron en detalle los
fragmentos modificados y sus llamadores. Esta revisión **no equivale a demostrar
corrección de todos los flujos de negocio ni a un test de carga de producción**.

| Bloque del archivo original | Revisión efectuada |
| --- | --- |
| 1–940: configuración, nonce, acceso, identidad | versionado, firma/broadcast, middleware y cachés |
| 941–1639: modelos | inventario AST; campos de transacciones, whitelist, inventario, límites y TTL |
| 1640–2497: SecurityController | métodos/timers/cachés inventariados; lectura de bloqueo y consultas |
| 2512–3958: RelayManager | lectura de cola, retries, permisos, límites, gas, broadcast, confirmation, recovery y status |
| 3978–4852: WaterCollection/CropController | lectura de intervalos, escrituras, crecimiento y concurrencia |
| 4853–6346: salas y sockets | auth, joins, disconnect, publicación de presencia y retención |
| 6349–8139: middleware HTTP/auth/pairing | CORS/CSRF/JWT, saneado, refresh, handlers async y PKCE |
| 8147–12088: acciones/recolección/PvP/traducción | timers y mapas, pesca, daño, botín, proveedores HTTP |
| 12220–16454: clima/misiones/admin/NFT | lecturas focalizadas, mapa de handlers, providers/cachés NFT |
| 16850–20823: vitales/inventario/cadena/market | colas por jugador, sincronización, inventario, identidad, correo y liquidación |
| 21180–24944: batalla/motor embebido | inventario/expiración; motor revisado por agente de engine y sincronizado; 98 verificaciones físicas |
| 25070–26123: social | inventario de listeners, presencia, desconexión y promesas |
| 26125–fin: errores/arranque/shutdown | manejo de errores Express, liberación de timers/providers |
| marketplace-routes.js completo | inventario AST, lectura de compras/publicaciones/ofertas/reembolsos/limitados e inserciones |

Versiones comprobadas en la instalación backend del proyecto:
Express 4.22.3, Mongoose 7.8.12, Ethers 6.17.0, Socket.IO 4.8.1,
express-rate-limit 6.11.2, jsonwebtoken 9.0.3 y compression 1.8.2.
La instalación asociada al Escritorio no tiene package.json visible allí;
no se presupone que las dependencias de producción coincidan automáticamente.

## Defectos confirmados reparados

1. **P1: ejecución doble por respuesta RPC ambigua.** Los retries firmaban otra
   transacción con nonce nuevo. Un nodo podía haber aceptado la primera aunque
   la respuesta HTTP se perdiera. Ahora se firma una vez, se calcula/persiste el
   hash antes de transmitir y se reenvían los mismos bytes. Si hubo un envío
   ambiguo, un rechazo posterior tampoco demuestra ausencia: se conserva el
   hash pendiente. Un rechazo definitivo en el primer intento sigue fallando.

2. **P1: timeout convertido en fallo terminal.** `waitForConfirmation` marcaba
   `failed` a los 30 segundos aunque la operación pudiera minarse después.
   Ahora permanece `broadcasted`; el estado final viene de un receipt. El
   update de timeout filtra estados terminales en Mongo para no pisar una
   confirmación concurrente obtenida con otro documento.

3. **P1: recovery repetía operaciones aún pendientes.** Una transacción con
   hash y sin receipt durante cinco minutos se reconstruía con nonce nuevo.
   Recovery y reprocesamiento ahora consultan ese hash; no autorizan otra
   operación por haber esperado demasiado. Status también reconcilia hashes
   que quedaron `signed` o `failed` por las versiones anteriores.

4. **P1: usuarios podían invocar métodos administrativos del relayer.** La
   whitelist de ItemContract incluía `setLimit` y `deprecateTipo`; no se exigía
   admin al jugador. El ABI local también contiene administración de cuentas,
   ownership y migración. Esos ocho métodos exigen ahora
   `isAdminAddressCached`. Se aplica en envío inicial y reprocesamiento; se
   normalizan firmas completas como `setLimit(string,uint256,uint256)`.

5. **P1: verificación de tablas fallaba abierta.** Las lecturas fallidas de
   `getInvoice` se convertían en tipo vacío y podían saltarse las restricciones
   de tablas del servidor/peces/recolección. Ahora el error se propaga y no se
   firma el aumento sin haber comprobado el tipo. Las firmas completas del ABI
   tampoco esquivan esas verificaciones.

6. **P1: cola sin techo de memoria.** Durante una caída RPC se podían retener
   cuerpos de petición de hasta 1 MB sin límite de trabajos. Ahora admite hasta
   250 pendientes de como máximo 64 KiB cada uno; sobrecarga devuelve HTTP 503.
   Los retries ya existentes conservan su espera y su límite de intentos.

7. **P2: API Ethers v5 usada en Ethers v6.** Receipt v6 expone `gasPrice`; el
   servidor leía solamente `effectiveGasPrice`, dejando coste/estadísticas en
   cero. Se usa `gasPrice` con fallback para receipts antiguos. Dos rutas de gas
   llamaban `provider.getGasPrice()`, que v6 no tiene: usan `getFeeData` y el
   fallback de configuración existente.

8. **P2: rechazos async de Express 4 no propagados.** Siete callbacks HTTP
   (análisis de seguridad, hora admin y cinco rutas de correo) quedaron envueltos
   en `asyncRoute(...).catch(next)`. El middleware final delega si las cabeceras
   ya se enviaron. Inventario AST final: cero callbacks async HTTP sin try o
   wrapper entre los registros directos.

9. **P2: intervalos async solapados.** Trece intervalos de Mongo/crecimiento/
   seguridad/cola podían lanzar otra pasada antes de finalizar la anterior.
   `setIntervalAsync` mantiene una sola pasada por reloj y libera la guardia
   incluso cuando falla. El shutdown cancela sus intervalos registrados.

10. **P2: joins tardíos y paquetes inválidos.** `joinRoom(null)` rechazaba una
    promesa huérfana; una lectura lenta podía publicar la sala después de
    desconectarse o después de una solicitud más nueva. Se validan tipos,
    se capturan errores y una versión por solicitud invalida joins anteriores.
    Nombres del jugador/mascota quedan limitados a 40 caracteres en el join.

11. **P2: retención de cachés por cuentas abandonadas.** La purga incluye ahora
    último lanzamiento y sesión de pesca, último envío de casillas, espadas
    PvP, fantasmas, uso de traducción y cachés NFT. Firma de identidad se acota a
    5.000 cuentas y comprobación de migración de isla a 10.000 entradas. Son
    cachés reconstructibles; no se borran inventarios/documentos persistentes.

12. **P2: providers NFT abandonados.** `clear()` olvidaba los providers sin
    destruir sus recursos. Ahora la caché contiene hasta ocho providers,
    destruye el evictado, distingue RPC+chainId y separa los resultados de
    cartera cuando cambian red/RPC. El shutdown destruye los providers.

13. **P2: traducción HTTP con errores de stream huérfanos.** El request tenía
    listener de error, pero el IncomingMessage podía fallar/abortarse tras
    cabeceras. Se manejan error, aborted y cierre incompleto y la promesa termina.

14. **P2: saneado incompleto y claves heredadas.** El filtro de Mongo abandonaba
    todo después de profundidad ocho. Ahora recorre iterativamente, elimina
    operadores/puntos y claves de prototipo y soporta ciclos sin desbordar pila.
    Lookups de tipos/catálogo y buzones distinguen propiedades propias.

15. **P2: nonce inicial inventado y async Promise executor.** El fallo de lectura
    inicial inventaba nonce cero y un init tardío rebajaba reservas recientes.
    Ahora se mantiene null si no hay lectura y el init respeta el máximo ya
    reservado. Se quitó el executor async; si la primera lectura no existe,
    getNextNonce rechaza el error para que se trate como transitorio.

16. **P2: marketplace aceptaba importes/planes corruptos.** Publicación aceptaba
    Infinity; cantidades grandes perdían precisión y entradas nulas del
    inventario rompían el plan. Precios/totales se validan finitos y dentro de
    precisión de centavos; qty es entero seguro; stacks negativos/ilegales no
    se rellenan y no se crean planes para qty/maxStack inválidos.

17. **Motor compartido.** Se sincronizaron las reparaciones del agente engine
    en la copia embebida de server2: lookups propios de arenas/especies,
    dimensiones/stats finitos y límite de pasos de movimiento.

## Validación realizada

```powershell
node --check 'C:\Users\pc\Desktop\server2.js'
node --check marketplace-routes.js
node --check 'C:\Users\pc\Desktop\marketplace-routes.js'
node --test tools/backend-deep-stability.test.cjs
node --test tools/invitaciones.test.cjs tools/mobs-red.test.cjs tools/native-pairing.test.cjs tools/character-world.test.cjs tools/batalla-conexion.test.cjs tools/battle-supplies.test.cjs tools/battle-upgrade.test.cjs
node tools/brawl-a-servidor.js --comprobar 'C:\Users\pc\Desktop\server2.js'
node tools/brawl-prueba-motor.js 'C:\Users\pc\Desktop\server2.js'
```

- 24 nuevas regresiones backend/market: **24/24**, sin skips.
- 38 pruebas existentes seleccionadas: **38/38**, sin skips.
- Motor embebido: copia idéntica y **98 comprobaciones correctas, cero fallos**.
- Lint lógico de archivo completo: no-undef (self declarado para UMD),
  no-unreachable, no-constant-condition, no-dupe-keys y
  no-async-promise-executor: **cero incidencias**.
- Comparación contra backup pre-reparación con la suite inicial de 23 casos:
  21 fallaban antes. Parte de esos fallos corresponde a helpers nuevos que
  antes no existían; no se presentan como 21 defectos independientes.
- Desktop/workspace marketplace: igualdad de bytes después de sincronizar.

## Riesgos confirmados que requieren trabajo adicional

1. **P1: marketplace no atómico entre documentos.** Publicar descuenta inventario
   antes de crear Listing; comprar cobra antes de descontar stock/pagar/entregar;
   aceptar una oferta y caducarla/rechazarla pueden devolver o gastar la misma
   retención porque primero mueven saldo y después guardan status. Una caída o
   solicitudes concurrentes pueden perder/duplicar dinero o ítems. Un CAS
   aislado de status no resuelve el crash entre documentos. Hace falta una
   transacción Mongo sobre todas las escrituras y/o ledger idempotente durable,
   verificando soporte de replica set/sharded y estrategia de reparación de
   documentos existentes. No se certifica atomicidad con los cambios anteriores.

2. **P1: reservas de nonce y varios procesos.** `resetNonce` aún puede competir
   con otras reservas y las colas/nonce manager son locales al proceso. Una
   reserva fallida antes de publicar puede dejar un hueco. Hace falta centralizar
   todos los envíos del relayer o una reserva durable coordinada. Ninguna prueba
   offline demuestra exclusión entre múltiples instancias ni liquida huecos reales.

3. **P1: persistencia de cola/idempotencia.** La cola y `_relayIdem` viven en
   RAM y no son compartidos por varios workers. Los hashes nuevos se persisten
   antes de transmisión, pero los bytes firmados todavía no se guardan: crash
   entre persistir hash y broadcast puede dejar `signed` huérfano. Las operaciones
   sin hash pendientes al reiniciar tampoco tienen un outbox durable completo.
   Resolver con outbox/idempotency key única en Mongo, sin reejecutar operaciones
   que tengan resultado RPC ambiguo.

4. **Estado pendiente después de timeout.** Un hash dropped/replaced o nunca
   transmitido puede permanecer pendiente indefinidamente; recovery solo corre
   al arrancar y status consulta a demanda. Se privilegia conservar una operación
   ambigua sobre repetirla con otro nonce. Hace falta reconciliación periódica y
   resolución de replacements por nonce/hash confirmada antes de cerrar el estado.

5. **Auth concurrente.** Login consume nonce mediante lectura/escritura separadas;
   refresh elimina el token viejo antes de completar la creación del nuevo.
   Solicitudes simultáneas o una caída intermedia requieren consumo/CAS durable y
   política explícita de reintento. Las deduplicaciones del cliente ayudan, pero
   no prueban atomicidad del servidor entre navegadores o instancias.

6. **Correo efímero y recursos de alta cardinalidad.** Los buzones son RAM por
   cuenta y solo acotan mensajes dentro de cada cuenta; no hay persistencia ni
   cuota global de buzones. Los Maps de sesiones, chat, seguridad y ofertas
   necesitan medición de heap en un entorno de carga real para dimensionar sus
   cuotas. El crecimiento de plantas usa ticks, por lo que una DB lenta puede
   hacer que el tiempo de progreso se retrase respecto al tiempo de pared.

7. **Economía on-chain.** El relay comprueba propiedad/tipos y ahora admin, pero
   varios métodos de mint/increase siguen partiendo de cantidades del cliente.
   La legitimidad económica depende de los contratos y reglas de negocio. No se
   ha verificado cada ABI desplegado, la autoridad de cada recompensa ni la
   consistencia total de dinero/ítems off-chain con sincronización on-chain.

## Fuentes primarias consultadas

- [Ethers v6 — documentación/API y migración](https://docs.ethers.org/v6/single-page/):
  gasPrice del receipt, getFeeData y semántica de broadcast/confirmación.
- [Node HTTP — ClientRequest e IncomingMessage](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html):
  errors/abort después de cabeceras y timeout del request.
- Código instalado local de Ethers y package.json/lock del backend del proyecto.
- ABI local `C:/Users/pc/Desktop/abis/ItemContract.json`: inventario de métodos
  de administración, ownership, migración y facturas.
- El agente principal verificó [Express — errores async](https://expressjs.com/en/guide/error-handling.html)
  para la diferencia de manejo de promesas entre Express 4 y 5.
