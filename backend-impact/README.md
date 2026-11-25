# Panel de impacto LitVM — Grassland Forest

Actualización local del 14 de octubre de 2026. El contrato desplegado no necesita modificación ni migración para esta auditoría.

## Instalación

**Corrección de arranque del 14 de octubre:** `server2.js` ahora incluye la analítica dentro del propio archivo. Para publicar esta corrección, sube únicamente el `server2.js` actualizado del escritorio —también disponible en esta carpeta— y reinicia el backend. Ya no requiere subir `litvm-chain-audit.cjs` ni `litvm-impact-analytics.cjs` por separado. Conserva las dependencias, variables de entorno y módulos existentes del proyecto; no reemplaces la base de datos.

El error de despliegue confirmado fue `Cannot find module './litvm-chain-audit.cjs'`: el servidor se detenía antes de instalar CORS y de escuchar peticiones. Por eso el navegador mostraba ausencia de cabeceras CORS incluso para login. Los mensajes de `contentscript.js` son independientes de este fallo de arranque.

Los dos archivos `.cjs` se conservan como fuentes editables y para pruebas. Si los modificas, ejecuta `node tools/build-impact-backend.cjs C:/Users/pc/Desktop/server2.js` para regenerar las funciones integradas antes de publicar. El generador sólo permite dependencias internas de Node para estos módulos.

El arranque también aísla fallos de inicialización de analítica: conserva login/juego y devuelve un error administrativo 503 en las rutas de impacto si la configuración de ese módulo es inválida.

`server2.integration.patch` contiene la integración completa, incluidas las funciones de analítica integradas. Su aplicación sobre la copia original local fue comprobada y reproduce exactamente el archivo actualizado. Para un checkout del backend con esa misma versión original: `git apply --check server2.integration.patch` y luego `git apply server2.integration.patch`. Si el checkout tiene otros cambios, revisa los bloques del patch e intégralos conservando esos cambios; no reemplaces el servidor remoto a ciegas.

En el frontend publica juntos `admin.html`, `admin-impact.js` y `admin-impact.css`. El administrador entra mediante la autenticación de cartera que ya existía. Los nuevos endpoints requieren la misma autorización administrativa; iniciar el análisis también requiere CSRF.

El admin actualizado avisa si la API no responde y detiene el login antes de pedir nonce/firma si no obtiene un token CSRF válido. Los GET ya no añaden `Content-Type: application/json` cuando no llevan cuerpo.

Comprueba que `ITEM_CONTRACT_ADDRESS` y `RPC_URL` correspondan al contrato real. El indexador debe validar la red y la existencia de bytecode antes de iniciar. El panel utiliza la dirección efectiva del backend, no una dirección introducida en el navegador.

## Estabilidad, sesión y reanudación automática

La revisión actual es **`admin-entry-recovery-20261014-r3`**. Publica el `server2.js` del escritorio y el `admin.html` actualizado; conserva también el `admin-impact.js` publicado junto al panel. El servidor sigue siendo autocontenido.

El checkpoint y el contador de bloques se guardan atómicamente después de cada bloque completo. Después de un despliegue, el mantenimiento recupera de MongoDB los análisis solicitados e incompletos, conserva la pausa RPC y continúa automáticamente. Relee una franja de seguridad para detectar reorganizaciones, sin duplicar hashes. Si el proceso anterior murió sin liberar su lease, puede esperar hasta unos 135 segundos antes de continuar; no reinicia el historial desde cero. Los análisis completos no se vuelven a iniciar cada minuto.

El error `-31002: Bandwidth limit exceeded` pasa a una pausa con `nextRetryAt`, `retryCount` y reintentos progresivos. Cerrar el navegador o pulsar de nuevo el botón no elimina esa pausa ni el progreso. Las lecturas históricas usan un transporte separado con tiempo máximo y sin los reintentos HTTP ocultos de ethers. La captura del envío del juego continúa usando el proveedor original.

Las métricas y la tabla se refrescan cada **10 segundos**, sin ciclos solapados ni otra consulta periódica redundante de `/scan`. Las observaciones RPC del relayer se comparten durante diez segundos entre los administradores; si fallan, se espacian los intentos y se muestra cuándo se obtuvo la lectura.

El panel renueva la sesión existente y comparte una sola renovación cuando varias peticiones reciben 401. También actualiza CSRF y reintenta una vez. Un fallo temporal de red o RPC conserva el panel; una sesión revocada, una cuenta removida o una respuesta verificada `not_admin` cierran el acceso. El backend distingue un permiso desconocido por fallo RPC (**503 `admin_verification_unavailable`**) de un resultado negativo real (**403 `not_admin`**). No autoriza con un permiso desconocido ni con una caché vencida.

| Variable opcional | Uso y valor predeterminado |
| --- | --- |
| `LITVM_AUDIT_RPC_URL` | RPC de lectura dedicado; si falta utiliza `RPC_URL` |
| `ADMIN_RPC_URL` | RPC administrativo independiente del escaneo; si falta utiliza `RPC_URL` |
| `LITVM_AUDIT_RPC_INTERVAL_MS` | Separación entre lecturas de auditoría: 250 ms |
| `LITVM_AUDIT_RETRY_BASE_MS` | Espera inicial aproximada ante fallos RPC: 30000 ms |
| `LITVM_AUDIT_RETRY_MAX_MS` | Tope de espera progresiva: 900000 ms |
| `LITVM_AUDIT_DEPLOYMENT_TX_HASH` | Hash de creación que el backend debe verificar antes de omitir bloques anteriores |
| `LITVM_AUDIT_SCAN_FROM_GENESIS=1` | Desactiva el salto al despliegue; recorre desde génesis |

Para el contrato `0x686e17d89bf97247fadc04c3a3f0dfd02f914115` se identificó la creación en el bloque **33.405.472**, hash `0x87a117fa69611ce8eb79a3b145de39fb64caf1e30382cb995f1bc61df97ccd9e`. El backend vuelve a comprobar la evidencia con su propio RPC antes de usarla. La cobertura de ejecución desde el despliegue se distingue de una revisión desde génesis: no enumera posibles envíos a la dirección antes de que existiera el contrato. La prueba pública está en `audits/resilience-fix-2026-10-14/deployment-proof.json`.

El ritmo de avance depende del tamaño de los bloques y de la cuota del RPC. La pausa evita insistir sobre un servicio limitado; no puede aumentar una cuota agotada. Una recuperación de millones de bloques sigue necesitando un RPC con capacidad e historial suficientes.

## Entrada administrativa cuando el RPC está limitado

La verificación administrativa usa un proveedor propio, comprueba el chain ID real y utiliza únicamente `function isAdmin(address) view returns (bool)`. Un archivo de ABI antiguo no impide consultar este getter. Los fallos se registran como `[Admin auth] verification unavailable` con un diagnóstico saneado, que también se incluye en la respuesta 503.

Después de iniciar sesión, `admin.html` reintenta `/whoami` con esa misma sesión, respetando la espera indicada por el backend y sin repetir nonce ni firma. Hace un máximo de seis intentos automáticos; después ofrece **Reintentar verificación**. Un cambio de cartera o el cierre de página cancela las peticiones pendientes.

Se comprobó mediante lecturas públicas que la cartera `0x1dda2cdc8e35908d27ce7f1622d30839d15510ae` es propietaria y que `isAdmin` devuelve `true` en el contrato de red 4441. La evidencia de esa lectura está en `audits/admin-entry-fix-2026-10-14/admin-role-proof.json`.

El backend ya admite una lista de administradores explícitos, `ADMIN_ADDRESSES`, para que esas carteras accedan sin depender de una lectura RPC. En el servicio **backend** de Railway, abre **Variables** y añade la dirección propietaria a esa variable. Si ya contiene otras direcciones, conserva la lista y agrega la nueva separada por coma. Aplica el despliegue pendiente. [Variables en Railway](https://docs.railway.com/variables).

```dotenv
ADMIN_ADDRESSES=0x1dda2cdc8e35908d27ce7f1622d30839d15510ae
```

Esta lista constituye una autorización explícita del backend: la dirección conserva ese permiso hasta retirarla de la variable. Las carteras que no estén en la lista requieren una verificación on-chain válida. La configuración de producción no se ha modificado desde este workspace.

## Corrección de analizarCC y diagnóstico de MongoDB

La revisión `mongo-storage-diagnostics-20261014-r1` corrige la inicialización que podía conservar un rechazo anterior de `Model.init()` y volver a presentar el mismo `14031` después de que MongoDB se recuperara. La preparación de colecciones/índices ahora es reintentable mediante APIs públicas. Se conserva el índice único y no se borra el historial ni se modifican contadores del juego.

Un `legacyImportError: "14031"` almacenado es un registro de error, no una medición actual del disco. Si Railway indica 8 GB de capacidad y 209 MB usados, primero hay que comprobar que esa cifra corresponde al mismo sistema de archivos donde MongoDB guarda sus datos y que no es una métrica de RAM.

Después de desplegar el `server2.js` actualizado, inicia sesión como administrador y abre **`GET /api/admin/impact/diagnostics`**. Es una ruta de solo lectura que funciona sin iniciar el análisis y sin necesitar crear sus índices. Comprueba:

| Campo | Qué verifica |
| --- | --- |
| `revision` | Debe ser `admin-entry-recovery-20261014-r3`; identifica el backend actual |
| `mongodb.connected` | Si MongoDB responde al ping |
| `mongodb.storage.fsAvailableSizeMB` | Espacio libre del sistema de archivos que reporta MongoDB, en MiB |
| `mongodb.indexBuildDiskRequirement.minimumAvailableMB` | Reserva mínima para índices, consultada con `getParameter` sin cambiarla |
| `mongodb.indexBuildDiskRequirement.enoughSpaceForIndexBuild` | Compara ambas lecturas cuando se dispone de ellas |
| `mongodb.statsDiagnostic` / `indexBuildDiskRequirement.diagnostic` | Permisos insuficientes, timeout u otra causa por la que no se pudo leer una medida |
| `rpc.chainMatches` / `rpc.headBlock` | Comprobación independiente del RPC y de la red 4441 |

MongoDB 7.1 y posteriores exigen por defecto **500 MB libres** para construir índices; por eso `OutOfDiskSpace` no significa necesariamente disco lleno al 100 %. El parámetro real puede ser distinto. [Referencia oficial para MongoDB 8.3](https://www.mongodb.com/docs/v8.3/reference/parameters/#mongodb-parameter-param.indexBuildMinAvailableDiskSpaceMB).

Si el sistema de archivos efectivamente tiene espacio suficiente, vuelve a ejecutar `analizarCC` con el backend corregido: la respuesta del POST ahora identifica la operación y el error actual, por separado del registro anterior. Un error de almacenamiento devuelve HTTP 507 y su etapa; un fallo de RPC mantiene su código y descripción. El mensaje genérico que afirmaba indisponibilidad conjunta de Mongo/RPC fue reemplazado.

Si el diagnóstico confirma espacio insuficiente, Railway permite ampliar el volumen desde sus ajustes con **Live Resize**. No se cambia el volumen ni la reserva de seguridad desde el código del juego. [Documentación oficial de Railway](https://docs.railway.com/volumes).

## Uso

1. Abre `admin.html` e inicia sesión como administrador.
2. Comprueba las direcciones del contrato y del relayer.
3. Pulsa **analizarCC**. La recuperación se ejecuta en el backend y guarda su progreso en MongoDB. Cerrar la página no cancela el trabajo.
4. Espera a que el estado muestre que se alcanzó el bloque objetivo. El panel muestra cobertura parcial mientras el análisis continúa o falla.
5. Exporta CSV para la auditoría de jugadores y JSON para contrastar hashes, recibos y bloques con el explorador.
6. Genera el informe en inglés o español, completa las cifras de Discord/X y copia el texto o utiliza **Imprimir / PDF**.

## Qué se cuenta

- Un hash representa una transacción. Varios eventos del mismo recibo no representan varias transacciones.
- Las operaciones confirmadas con éxito, revertidas y pendientes se presentan separadas. Un error anterior al envío no equivale a una acción ejecutada en cadena.
- El nonce del relayer corresponde a sus transacciones en toda la red. No es el contador del contrato ni una medida exacta de firmas producidas fuera de la cadena.
- Los jugadores registrados son identidades del backend. Los participantes on-chain requieren evidencia independiente de atribución. Una única cartera relayer puede patrocinar operaciones de muchos jugadores.
- La atribución exacta del actor utiliza los registros autenticados del relayer o la firma de una cartera emisora vinculada inequívocamente a un jugador. Los parámetros/eventos permiten reconstruir el titular afectado, pero esa asociación se marca como inferida cuando no prueba quién inició la acción. La evidencia ambigua permanece separada.
- El tiempo de juego procede de los registros existentes de conexión/guardado. No se suman dos fuentes que miden el mismo tiempo.
- La duración de sesión y la retención necesitan registros de sesión. Los acumulados históricos y la última conexión, por sí solos, no permiten reconstruir sesiones completas ni una retención D7 exacta.
- El ratio de transacciones por hora y la etiqueta de actividad son indicios. No prueban ausencia de bots ni sustituyen un análisis de fraude.

## Recuperación histórica y límites

El análisis recorre bloques y verifica recibos para las transacciones cuyo destino directo sea el contrato configurado; también identifica su creación mediante `receipt.contractAddress`. Esto permite incluir llamadas revertidas y llamadas sin eventos. La creación se clasifica como operación del sistema. Las llamadas internas desde otros contratos requieren trazas del nodo y no forman parte de esta cobertura de envíos directos.

El historial se conserva en colecciones nuevas, con una clave única que incluye red, contrato y hash. El reanálisis reconcilia la misma transacción en vez de incrementar de nuevo un contador. Los registros recientes y los históricos utilizan el mismo libro de auditoría. El análisis solo lee la cadena; no firma operaciones, cambia inventarios ni modifica el contrato.

Un RPC que no conserve bloques/recibos antiguos puede impedir completar una sección. En ese caso se conserva el progreso y el error; no se presenta el resultado como completo. Un inicio posterior al bloque cero representa cobertura desde ese bloque y debe declararse.

El contrato `rr.txt.txt` registra operaciones de facturas/inventario. Si dos acciones del juego generan la misma llamada y no se conservó su contexto en el backend, no se puede demostrar si una transacción histórica fue **talar**, **minar** u otra acción. El panel muestra el método verificable en esos casos. No se infieren nombres de acciones a partir de cantidades o del ritmo de juego.

## Campos y punto de captura

Ya se añadió la captura central en `provider.broadcastTransaction`, que cubre el envío de bytes firmados del RelayManager y el de las llamadas directas de contratos ethers que utilizan el mismo proveedor. La captura de auditoría no bloquea el envío del juego. Los recibos se reconcilian después; un fallo de auditoría no provoca un reenvío de la operación. El outbox previo de `RelayedTransaction` conserva su comportamiento.

La colección **`litvm_chain_transactions`** guarda:

| Campo | Uso |
| --- | --- |
| `chainId`, `contractAddress`, `txHash` | Índice único para impedir duplicados live/histórico |
| `status`, `canonical`, `finalized`, `receiptStatus` | Firma/pending, éxito, revert, huérfana y verificación de recibo |
| `blockNumber`, `blockHash`, `transactionIndex`, `timestamp` | Evidencia verificable y orden histórico |
| `playerName`, `playerAddress`, `actorVerified`, `attributionStatus`, `attributionSource` | Actor verificado o asociación inferida; nunca confundir ambas |
| `participantPlayerNames`, `attributionCandidates` | Participantes/candidatos cuando no se conoce un iniciador único |
| `action`, `gameplayAction`, `actions`, `eventNames`, `invoiceIds`, `invoiceUpdates` | Método del contrato, contexto de juego aportado por servidor y reconstrucción del inventario |
| `from`, `to`, `nonce`, `gasUsed`, `effectiveGasPrice` | Datos de emisor, envío y coste exacto en enteros/string |
| `sources`, `firstSeenAt`, `lastSeenAt`, `scanGeneration` | Procedencia, reconciliación y protección contra escrituras de un proceso vencido |

**`txCount` no se incrementa manualmente en GamePlayer:** se deriva del número de hashes únicos con recibo exitoso canónico y actor atribuido. **`lastTxHash`** se obtiene del libro ordenado por bloque/posición. **`actionLogs`** se representa mediante el historial de documentos de ese libro y sus acciones; no se agrega un array ilimitado al documento del jugador. Se muestran aparte las revertidas, pendientes y asociaciones inferidas. No añadas un `$inc` paralelo: un reintento, un reanálisis o varios eventos del mismo hash podrían duplicarlo.

Para que un **nuevo comando** del servidor conserve su nombre de juego exacto, envuelve su envío con `withPlayer` usando la identidad que el backend ya autenticó y el nombre de acción que el servidor validó:

```js
async function ejecutarAccionAuditada(jugadorAutenticado, accionValidada, enviar) {
  return chainAudit.withPlayer({
    playerName: jugadorAutenticado.playerName,
    address: jugadorAutenticado.address,
    gameplayAction: accionValidada // por ejemplo 'talar' o 'minar'
  }, async () => {
    const tx = await enviar(); // la llamada real existente al contrato
    return tx.wait();
  });
}
```

Obtén `jugadorAutenticado` del control de sesión/ownership existente; no aceptes la identidad o la acción directamente de un body sin validación. El hash queda vinculado al actor y conserva esa atribución durante la reconciliación histórica. Una operación fallida no suma una acción exitosa. Sin ese contexto anterior, el método del contrato sigue siendo la única acción recuperable con certeza.

Las colecciones **`litvm_chain_scans`**, **`impact_play_segments`** e **`impact_analytics_meta`** conservan, respectivamente, el checkpoint/lease del análisis, los tramos autenticados de sesión y el inicio de cobertura. Los segmentos usan identificadores deterministas para deduplicar reintentos y unir solapamientos de una sesión; el token original de sesión no se exporta ni se almacena en claro.

El ajuste opcional `LITVM_AUDIT_CONFIRMATIONS` controla la profundidad de confirmación del análisis (por defecto 12, mínimo 2). El valor es una política del indexador, no una garantía absoluta de finalidad del RPC. Si cambia el hash del checkpoint, el indexador reconstruye desde el inicio de su cobertura y reconcilia las filas huérfanas.

Cada adquisición del trabajo incrementa `litvm_chain_scans.generation`. Las escrituras históricas y los checkpoints comprueban esa generación; un proceso que pierde su lease no puede sobrescribir el resultado de su reemplazo.

## Rutas nuevas

Todas usan `/api/admin/impact` como prefijo:

| Ruta | Función |
| --- | --- |
| `GET /summary` | KPIs, relayer, cobertura y definiciones |
| `GET /users?q=&sort=txCount\|playtime&page=&limit=` | Tabla paginada y ordenada |
| `GET /scan` | Progreso persistido |
| `GET /diagnostics` | Ping, espacio del sistema de archivos, reserva de índices y RPC; sin escrituras |
| `POST /scan` | Iniciar/reanudar `analizarCC`, protegido por CSRF |
| `GET /export/users.csv` | Jugadores completos y todos los hashes autorizados, sin filtro de pantalla |
| `GET /export/onchain.json` | Evidencia del libro; contadores calculados sobre las mismas filas exportadas |

Las exportaciones utilizan una selección explícita de campos. No incluyen contraseñas, claves privadas, firmas, IP, user agents ni tokens de sesión. El CSV neutraliza fórmulas de hoja de cálculo en los textos exportados.

## Referencias de red y API

- [Configuración oficial de LiteForge](https://testnet.litvm.com/): chain ID 4441, gas zkLTC y explorador `https://liteforge.explorer.caldera.xyz`.
- [Documentación oficial de ethers v6](https://docs.ethers.org/v6/api/providers/): lectura de bloques con transacciones completas y recibos.

Las pruebas locales usan fixtures y no envían transacciones reales. La recuperación de los datos de producción comienza al desplegar el backend actualizado y ejecutar `analizarCC` con la sesión administrativa.

## Verificación realizada

Pasaron **119 pruebas automatizadas**, incluidas indexación/analítica, checkpoint entre procesos, límites de ancho de banda, prueba de despliegue, permisos administrativos desconocidos frente a revocados, aislamiento del RPC administrativo, ABI incompleto y red incorrecta, recuperación después de un error 14031 y regresiones de transacciones, compras, sesiones y seguridad. La prueba de recuperación inyectó el error en una instancia MongoDB 4.4.31 local y aislada: comprobó el reintento, el índice único y la conservación de los registros existentes. No equivale a una prueba sobre MongoDB 8.3 de producción.

El navegador Edge en modo headless pasó **21 grupos de comprobaciones**, incluidos reintento automático de acceso sin otra firma, límite de intentos y cancelación, refresco real de diez segundos, renovación concurrente de sesión, CSRF rotado, límites RPC, revocación real, reportes EN/ES, exportaciones, XSS y diseño móvil. Las factories integradas también se cargaron con **Node 18.20.8** —la versión del hosting—, Mongoose 7.8.8, ethers 6.16.0 y Express 4.22.1 reales: siete rutas montadas, sin conexiones RPC/Mongo ni rechazos sin capturar. Además, trece pruebas de autorización y transporte se ejecutaron en Node 18.20.8; el transporte real de ethers recibió un HTTP 429 de un servidor local y emitió una sola petición, sin reintentos ocultos. No se ha ejecutado el análisis sobre la base de producción.

```powershell
node --test tools/litvm-impact-analytics.test.cjs backend-impact/litvm-chain-audit.test.cjs
node --test tools/impact-backend-bundle.test.cjs
node --test tools/admin-auth-rpc.test.cjs tools/impact-rpc-transport.test.cjs
node tools/impact-real-dependency-boot-check.cjs
node tools/admin-impact-browser.test.cjs
node --test tools/backend-deep-stability.test.cjs tools/web3-seguridad-prueba.cjs tools/shop-persistence.test.cjs tools/session-api.test.cjs
```

`audits/impact-integration-2026-10-14/` conserva la verificación del patch y las huellas SHA-256 de los archivos finales. `audits/impact-frontend-2026-10-14/` contiene el resultado de las comprobaciones y capturas del panel con fixtures. Hay respaldos del admin original en `audits/pre-impact-2026-10-14/` y del servidor en `C:/Users/pc/Desktop/server2.before-litvm-impact-20261014-061744.js`.

`audits/resilience-fix-2026-10-14/` conserva la prueba pública del despliegue, la ejecución de 116 pruebas, la comprobación de Node 18 y las huellas del paquete actual. El respaldo inmediato del backend anterior a esta corrección es `C:/Users/pc/Desktop/server2.before-resilience-fix-20261014.js`.

`audits/admin-entry-fix-2026-10-14/` contiene la evidencia de propietario/rol, las 119 pruebas y la verificación del paquete r3 actual. El respaldo anterior a esta corrección de entrada es `C:/Users/pc/Desktop/server2.before-admin-entry-fix-20261014.js`.
