# Auditoría y reparaciones de Grassland Forest — 16 de octubre de 2026

Se contrastaron los **46 puntos del TXT** con el código local y se ampliaron las revisiones a otras bibliotecas, escenas, backend, herramientas de escritorio y dependencias. Se confirmaron y repararon defectos funcionales, de concurrencia, validación y liberación de recursos. También se identificaron afirmaciones exageradas y problemas de arquitectura que no deben presentarse como solucionados por un parche local.

El TXT se usó como evidencia a verificar, no como instrucciones ejecutables. Se conservaron los cambios que ya existían en el proyecto y la eliminación de `_prueba_3d.html`, que el usuario confirmó haber realizado. No se desplegó, firmó ni envió ninguna transacción real; no se conectó el juego a una base de producción.

## Alcance y trazabilidad

- Copias previas: `audits/pre-txt-audit-2026-10-16/`. Su `manifest.json` registra 273 archivos iniciales; las copias adicionales de dependencias y backend se guardaron antes de modificarlas.
- Inventario completo de los archivos activos seleccionados: **110 archivos y 168.884 líneas**, `audits/txt-source-inventory.json`. Incluye fuentes completas de raíz, Scenes, lib, SDK de wallet, backend-impact y escritorio, además de scripts embebidos en HTML. No recorre las copias históricas, archivos generados, recursos gráficos ni `node_modules` como si fueran código propio. La comprobación específica de bibliotecas analizó 79 módulos sin errores estáticos.
- Diferencias de esta intervención: `audits/txt-changes.json`, con hashes antes/después y rutas de respaldo. Permite distinguir estas reparaciones de las numerosas modificaciones previas del usuario. Se genera mediante `node tools/txt-change-manifest.cjs`.
- Los scripts públicos modificados tienen nuevas versiones por hash en `index.html` y `admin.html`, para evitar servir una copia anterior desde caché al publicar los archivos.
- Se actualizó el motor embebido de combate con el sincronizador existente en `backend-impact/server2.js`, `GrasslandBuild/repositories/backend/server2.js` y `C:/Users/pc/Desktop/server2.js`. El marketplace canónico y su copia efectiva de Escritorio coinciden. Se preservó el resto de cada servidor; las distintas versiones de backend no se reemplazaron enteras.
- El empaquetador del backend ahora incluye el marketplace canónico reparado, que antes omitía. No se regeneraron ni publicaron ZIP, ejecutables ni APK; las distribuciones ya construidas conservan su versión anterior.

La inspección estructural cubre archivos completos. La revisión humana se concentró en flujos de recursos, asincronía, validación, sesión e inventario. Esto **no equivale a demostrar matemáticamente todas las ramas del programa** ni a certificar ausencia universal de vulnerabilidades.

## Verificación de los 46 puntos

«Matizado y corregido» significa que existe la retención o el fallo descrito, pero que su gravedad, crecimiento o solución requieren precisión. Una textura pequeña reutilizable no constituye automáticamente una fuga creciente. Las texturas se liberan por identidad y respetando otras escenas que comparten el gestor.

| Nº | Archivo | Dictamen y resultado |
|---:|---|---|
| 1 | gf-agua.js | Confirmado y corregido: la lectura de píxeles pasa a ser local al cálculo y deja de vivir en un diccionario global. También deja de reutilizar píxeles de otra imagen con igual clave. |
| 2 | gf-agua.js | Confirmado y corregido: pez temporal y counter tween registrados; desmontaje destruye el salto y callbacks tardíos comprueban el estado. |
| 3 | gf-agua.js | Matizado y corregido: los atlas variables sí podían acumularse. Se retiran los atlas propios al salir y las texturas comunes tras la última escena usuaria, conservando reemplazos ajenos. |
| 4 | gf-agua.js | Confirmado y corregido: se paran counters y tweens de sprites antes de destruirlos. |
| 5 | gf-alquimista.js | Confirmado y corregido: un HTTP 200 con JSON `ok:false` ya no aplica estadísticas ni devuelve éxito. |
| 6 | gf-alquimista.js | Confirmado y corregido: la búsqueda del NPC se espacia y se retira al encontrarlo. Se admite un NPC cargado después del montaje. |
| 7 | gf-amigos.js | Confirmado y corregido: lectura diferida al final del freno, ligada a socket y conversación; se liquida al cerrar o cambiar de chat. |
| 8 | gf-amigos.js | Confirmado y corregido: confirmaciones de mensajes iguales se asocian al pendiente más antiguo; se comprueba antes la duplicación por ID y se compara el texto desescapado del servidor. |
| 9 | gf-amigos.js | Confirmado y corregido: interacción idempotente por sprite, retirada al cerrar/destruir la escena o sprite, y una sola confirmación DOM. |
| 10 | gf-animales.js | Confirmado y corregido: cada efecto de muerte registra su limpieza y la ejecuta también durante desmontaje. Sus claves son únicas entre escenas. |
| 11 | gf-animales.js | Confirmado y corregido: comprobación de oclusión espaciada mientras la mariposa permanece posada. |
| 12 | gf-animales.js | Confirmado y corregido: restaura el origen central al despegar o huir. |
| 13 | gf-animales.js | Matizado y corregido: cachés pasan a identidad débil de recursos y se reinician al salir; canvas propios se liberan tras la última escena, sin borrar recursos ajenos. |
| 14 | gf-antorchas.js | Confirmado y corregido: la selección se limpia después de superar las validaciones locales. |
| 15 | gf-antorchas.js | Confirmado y corregido: una antorcha en despedida se elimina correctamente y se recrea si el servidor extiende su vigencia. |
| 16 | gf-audio.js | Confirmado y corregido: ganancia parte de una mezcla inicial inmutable; `0 → 1` recupera el sonido. Valores no finitos no contaminan la mezcla. |
| 17 | gf-audio.js | Matizado y corregido: el campo conserva buffers ambientales entre rachas; desmontaje los libera y se mantiene la política austera de escenas interiores. No se retienen buffers sin límite. |
| 18 | gf-audio.js | Redundancia confirmada y simplificada a `return 0`; no era un fallo crítico. |
| 19 | gf-batalla-arte.js | Confirmado y corregido: registro automático de shutdown/destroy y retirada de ambos listeners al olvidar una escena. Se conserva el conteo compartido de referencias. |
| 20 | gf-batalla-arte.js | Confirmado y corregido: la luna creciente se dibuja con una máscara de canvas; no tapa el cielo con un disco de color sólido incorrecto. |
| 21 | gf-brawl-motor.js | Confirmado y corregido: ACK de corrección debe ser entero y coherente con la corrección vigente; omisiones y valores futuros no habilitan movimiento ni silencian correcciones. |
| 22 | gf-brawl-motor.js | Confirmado y corregido: secuencias seguras y salto limitado; ángulos normalizados antes de usarlos/retransmitirlos. |
| 23 | gf-buho.js | Confirmado y corregido: cuerpo y ojos siguen el balanceo de la rama con posición base estable, sin acumular desplazamiento por frame. |
| 24 | gf-buho.js | Matizado y corregido: texturas reutilizables pequeñas, no crecimiento por cada búho. Ahora se liberan por propiedad y tras la última escena. |
| 25 | gf-canales.js | Confirmado y corregido: se usa el resolutor real `_salaDeEscena` cuando existe y el contexto actual; admite Lands visitadas, Salvaje, minas y casas sin inventar una sala genérica. |
| 26 | gf-canales.js | Confirmado y corregido: se conservan ambos relojes de enlace y se pueden detener. |
| 27 | gf-canales.js | Confirmado y corregido: un cambio efectivo recibido en `canalesEstado` notifica al HUD. |
| 28 | admin-impact.js | Confirmado y corregido: `destroy()` retira listeners, aborta peticiones, cancela relojes y libera URLs de descarga. Una nueva instancia destruye la anterior. `stop()` sigue permitiendo reiniciar el panel tras autenticar. |
| 29 | admin-impact.js | Confirmado y corregido: escritura, controles opcionales y enlace de eventos toleran nodos ausentes o retirados. No se crean nodos falsos para ocultar errores. |
| 30 | app.js | Limitación confirmada del fallback antiguo; documentada. No es una fuga del WeakMap nativo usado por los navegadores actuales. Se corrigió además que el fallback confundía claves con sus descendientes de prototipo. No se afirma haber reproducido recolección débil nativa en JavaScript antiguo. |
| 31 | app.js | Medición duplicada confirmada y corregida: se reutiliza el tamaño CSS ya calculado, conservando límites y DPR. Los helpers privados sin uso no ejecutan trabajo y se conservaron para evitar un refactor innecesario. |
| 32 | BlockchainManager.js | Reparación parcial: JSON corrupto, storage bloqueado o token ausente ya no consumen un nonce. Sigue existiendo el camino de autenticación heredado con accessToken legible por JS; requiere migración coordinada de login/backend a cookies para retirarlo sin romper compatibilidad. |
| 33 | BlockchainManager.js | Confirmado y corregido: normalización de nonce hexadecimal con/sin prefijo y números decimales JS, ejecución secuencial y revisión de sesión. Una operación de otra cuenta no modifica el nonce vigente. Las cadenas sin prefijo conservan el protocolo hexadecimal histórico. |
| 34 | CraftingHub.js | Confirmado y corregido: no hay entrega local de respaldo para un resultado on-chain rechazado o parcial. Si ya llegó una parte, tampoco se devuelve íntegramente el material para regalar ambas cosas. Una confirmación parcial requiere revisar el inventario autoritativo. |
| 35 | CraftingHub.js | Confirmado y corregido: destroy libera inmediatamente escena actual, diferida y sus listeners, aun con cola pendiente; no inicia trabajo nuevo sobre la instancia destruida. |
| 36 | gf-casas.js | Confirmado y corregido: entrada valida identidad del montaje y estado de escena después del guardado asíncrono. Un desmontaje/remontaje invalida la continuación vieja. |
| 37 | gf-casas.js | Matizado y corregido: listas estables y reintentos espaciados. Marcar «cueva buscada» en el primer intento habría roto mapas cargados después del montaje; se comprobó expresamente esa llegada tardía. |
| 38 | gf-character-skills.js | Confirmado y corregido: API ausente devuelve un fallo controlado en lugar de TypeError. |
| 39 | gf-character-skills.js | Confirmado y corregido: modal de batalla separado del panel principal y sin IDs duplicados al pulsar varias veces. |
| 40 | gf-chat-social.js | Matizado y corregido: el registro de 300 mensajes era acotado, pero podía retener nodos retirados. Ahora poda desconectados y limpia/reconecta observer y estado con el ciclo de escenas. Un observer persistente por página no era por sí solo una fuga creciente. |
| 41 | gf-ciclo-dia.js | Matizado y corregido: libera únicamente las texturas propias al desaparecer su última escena; las tres texturas base eran una caché constante, no una asignación nueva por frame. |
| 42 | gf-clima.js | Matizado y corregido: todas las rutas de creación de canvas registran propiedad y liberan tras su última escena usuaria. No se toma «75 texturas» como una medida exacta de VRAM; depende de variantes efectivamente creadas y del renderer. |
| 43 | gf-clima.js | Confirmado y corregido: counters y tweens de gotas/ondas se paran antes de destruir y callbacks tardíos ignoran el estado desmontado. |
| 44 | gf-clima.js | Confirmado y corregido: caché de copas por identidad débil del frame y reinicio al detener, evitando confusión entre texturas con igual nombre. |
| 45 | gf-cuervo.js | Confirmado y corregido: comprueba mapa, agua y colisión antes de caminar; el mismo criterio valida el punto de aterrizaje. |
| 46 | gf-cuervo.js | Confirmado y corregido: sin árboles continúa con la elección de suelo/parcela, incluso sin jugador presente. |

## Hallazgos adicionales reparados

| Área | Defecto y reparación |
|---|---|
| Pesca | Counter tweens de corcho/pez y tweens de efectos sobrevivían a terminar el lance. Se registran, cancelan antes de destruir y se invalidan por número de lance. |
| Pesca | Respuestas y errores viejos de enganchar/recoger, o el temporizador de finalizar, podían afectar un lance nuevo. Se comprueba escena y generación en todos esos caminos. La entrega también exige éxito HTTP. |
| Pesca | Una clasificación global reutilizaba el agua de otra imagen `tiles`. Ahora se cachea por identidad débil de imagen y se libera el canvas aun al fallar la lectura de píxeles. |
| Agua | Atlas compartido únicamente por textura/tamaño/N mezclaba parejas distintas de casillas. Cada montaje obtiene sus atlas; construcción fallida revierte las asignaciones parciales. |
| Fauna | Texturas de muerte con contadores locales podían colisionar entre escenas. Claves únicas y limpieza registrada. La construcción parcial del búho revierte cuerpo/ojos; si desaparece su último árbol, se marcha. |
| Viento | Montaje parcialmente fallido dejaba objetos y canvas sin propietario. Se revierte y se liberan texturas por identidad, conservando los recursos compartidos. |
| Mina | Botín de serpiente dejaba counters y callbacks de carga pendientes; se registran por archivo y se retiran ante carga, error o limpieza. El jefe zombi conserva y cancela su salto y los tweens de sus sprites al salir. |
| Sombras | Rehornear una escena eliminaba una textura que otra seguía usando; el caché también confundía gestores con claves iguales. Horno por gestor, claves propias, reconstrucción sin sustitución y poda de canvas que ya no usa ninguna escena. Se acotan asignaciones y se rechazan números no finitos. |
| HUD | Nuevo desmontaje explícito e idempotente de observers, listeners y RAF, con soporte de remontaje; no se desmonta durante BFCache. |
| Invitaciones | Peticiones y formularios antiguos podían operar sobre otra identidad o borrar una referencia nueva. Se vinculan al usuario y revisión correctos. |
| Wallet | Lecturas, secretos y `adoptSession` tardíos podían pintar la dirección anterior si cambiaba la cuenta o instancia de SDK. Ahora comprueban ambas identidades. |
| Traducción | El rechazo de una petición del idioma anterior podía borrar una traducción del idioma nuevo o imponerle pausa. Se valida la revisión antes de aplicar el fallo. |
| Crafting | La llamada a GFTxGate pasaba el timeout con la forma incorrecta; se usa el objeto de opciones admitido. |
| Mercado | Cancelaciones concurrentes podían devolver la misma publicación varias veces. La retención de ofertas decía ser idempotente pero abonaba con `$inc` sin reclamar el estado. La combinación de escrituras podía quedar a medias. Ahora las mutaciones, entrega, pago, estado e historial comparten transacción Mongo, y la respuesta espera al commit. Las devoluciones reclaman `pending` dentro de la misma transacción. |
| Dependencias | Se eliminó la cadena vulnerable de logging del empaquetador mediante global-agent 4.1.3 acotado a @electron/get, manteniendo Electron y electron-builder. En backend se corrigieron ws de providers, bn.js 4 y tmp de solc mediante overrides acotados. Se comprobaron APIs reales y compilación Solidity local sin red. |

## Dependencias y límites pendientes

Los informes npm se obtuvieron durante esta revisión, no se reutilizó un resultado de días anteriores:

| Árbol | Antes | Después | Evidencia |
|---|---:|---:|---|
| Cliente web, árbol completo | 0 | 0 | txt-dependencies-root.json |
| Escritorio, árbol completo | 8 moderados | 0 | txt-dependencies-desktop.json y txt-dependencies-desktop-final.json |
| Backend, solo producción | 0 | 0 | txt-dependencies-backend-production.json y txt-dependencies-backend-production-final.json |
| Backend, incluido desarrollo/contratos | 80 | 73 | txt-dependencies-backend-all.json y txt-dependencies-backend-final.json |

Los **73 avisos restantes** corresponden al entorno de desarrollo/contratos: 46 altos, 7 moderados y 20 bajos. Incluyen cadenas transitivas de Hardhat 2, Mocha/Jest, undici 5, elliptic, braces y sprintf-js. `npm audit fix` sin forzar no los resuelve; las alternativas propuestas requieren migraciones mayores o no tienen versión corregida publicada. No se hizo `npm audit fix --force` sobre una herramienta de contratos sin su proyecto y pruebas de despliegue. Esto queda pendiente: **no se declara el árbol completo del backend libre de vulnerabilidades**.

En particular, el [aviso oficial de sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) indica que no hay versión corregida. Para escritorio se retiró esa dependencia transitiva sustituyendo su consumidor; no se parcheó manualmente node_modules. Las [versiones de global-agent](https://github.com/gajus/global-agent/releases/tag/v4.1.3) y la prueba de proxy local sustentan la sustitución elegida.

Otros límites importantes:

1. El mercado reparado exige un MongoDB con transacciones: replica set o clúster fragmentado. Con standalone o transacción fallida devuelve `503 marketplace_transaction_unavailable` antes de confirmar cambios. [MongoDB documenta la limitación de standalone](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/). La propagación de sesiones se probó además con el Mongoose real instalado; no se ejecutó una base de producción ni una prueba real de replica set. Véase también [transacciones de Mongoose](https://mongoosejs.com/docs/transactions.html).
2. El mercado sigue liquidando monedas e ítems en Mongo, mientras otras rutas sincronizan inventario y saldo desde el contrato. La reconciliación puede pisar cambios off-chain; las transacciones Mongo no resuelven esa incompatibilidad económica con la cadena. Hace falta definir y probar una liquidación on-chain o un protocolo de custodia/reconciliación. No se modificó el contrato ni se inventó un protocolo financiero.
3. El accessToken heredado de BlockchainManager sigue legible por JavaScript; el manejo seguro de JSON corrige el crash y nonce, pero no convierte sessionStorage en HttpOnly. Su retirada exige coordinar el login, los consumidores del token y el servidor.
4. El fallback WeakMap antiguo sigue siendo un fallback, sin las garantías del recolector nativo. Está documentado y los navegadores actuales usan el nativo.
5. Las mediciones de VRAM de un diagnóstico JavaScript son aproximaciones. Se verificaron ciclos y propiedad de objetos; faltan sesiones prolongadas de heap/GPU en dispositivos reales, pérdida/restauración de WebGL y multijugador contra un backend de pruebas completo.

## Validación reproducible

Las pruebas usan peticiones, sockets e inventarios ficticios. Las pruebas de DOM/WebGL ejecutan Phaser y navegador reales. Las excepciones de asignación que aparecen en algunos logs se inyectan deliberadamente para comprobar rollback.

- Antes de reparar: **412/412** pruebas existentes, `txt-baseline-regression.log`.
- Batería final: **470/470**, sin fallos, cancelaciones ni pruebas omitidas, `txt-final-regression.log`; incluye las regresiones anteriores y todas las nuevas de esta intervención.
- Combate: **98/98**, `txt-brawl-engine.log`, incluidas simulaciones de bots y sincronía del motor incrustado.
- Escritorio: **15/15**, `txt-desktop-regression.log`.
- Navegador del administrador: **21 grupos**, cero errores JavaScript, `txt-admin-browser.log`.
- Navegador general: **60 ciclos de paneles** en escritorio/móvil y **20 ciclos WebGL**, cero errores JavaScript, `txt-libraries-browser.log`. Se repitió después del arreglo final de sombras.
- Pruebas nuevas: `tools/txt-core-audit.test.cjs`, `txt-social-audit.test.cjs`, `txt-environment-audit.test.cjs`, `txt-security-audit.test.cjs`, `txt-marketplace-atomic.test.cjs` y `txt-dependency-audit.test.cjs`.
- `npm run audit:txt`: inventario/sintaxis/reglas AST de fuentes propias e inline HTML. Cero errores; la advertencia de bucle de una iteración en `brawlEmparejar` se revisó: deliberadamente abre la primera sala y termina. No es una fuga ni un bucle infinito.
- `npm run test:audit:txt`: repite únicamente las regresiones de esta revisión.
- `npm run test:regression`: ejecuta la batería conjunta del proyecto.

No se afirma haber reparado cada defecto posible de todas las dependencias. El resultado verificable es el conjunto de correcciones, las pruebas y los límites explícitos anteriores.
