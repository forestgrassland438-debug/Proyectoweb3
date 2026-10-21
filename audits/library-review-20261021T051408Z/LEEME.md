# Revisión de librerías, seguridad y recursos — 21 de octubre de 2026

Se repararon fallos reproducidos de autenticación, colas de objetos, cambios de mapa y liberación de recursos. Se trabajó sin agentes. El backend revisado y editado es `C:/Users/pc/Desktop/server2.js`, conservando el resto de su contenido y las modificaciones manuales existentes.

Antes de editar se respaldaron las fuentes actuales. El respaldo está fuera de la carpeta pública: `C:/Users/pc/.codex/backups/library-review-20261021T051408Z`. `baseline.json` registra 167 originales, sus rutas y hashes. `changes.json` distingue esta intervención de los cambios que ya tenía el proyecto: **9 archivos existentes modificados, 158 originales idénticos y 4 herramientas de verificación nuevas**. Los ocho HTML administrativos, sus controles y sus ediciones manuales conservan los mismos bytes que al comenzar esta revisión. No se modificaron mapas, sprites, contratos, balances ni documentos persistentes.

La comparación por AST del backend abarca sus 1.149 nodos superiores. Solo cambiaron `checkGameAccess`, `enforceGameAccess` y los handlers de `/api/auth/nonce`, `/api/auth/login` y `/api/auth/refresh`. No se reemplazó el servidor por una copia antigua ni se regeneraron sus módulos embebidos.

## Reparaciones comprobadas

| Área | Fallo reproducido | Cambio |
|---|---|---|
| Carga de mapas | Las cargas terminadas conservaban listeners de shutdown/destroy; los remontajes los acumulaban. | Se retiran ambos hooks, el intervalo y la referencia del estado en cada terminación. La carga es idempotente ante doble inclusión. |
| Pantalla de carga | Una escena anterior podía actualizar u ocultar la pantalla retenida por otra transición. | Cada montaje comprueba la identidad de su pantalla antes de modificarla o cerrarla. |
| Trabajo por fotograma | Se comprobaba el loader y se escribía el mismo porcentaje en el DOM en cada update. | Muestreo máximo cada 100 ms y escritura únicamente cuando cambia el texto. Se conservan los límites de espera y el bloqueo del movimiento mientras se prepara el mapa. El ensayo de 200 updates con progreso constante exige como máximo tres escrituras. No se atribuye una mejora de FPS que no se haya medido. |
| Cola de cadena | Una confirmación anterior podía aplicar inventario sobre la nueva cuenta; durante un cambio de mapa podía perderse por falta de escena activa. | El coordinador compara una identidad separada de la escena. La respuesta espera el siguiente mapa del mismo jugador; otra cuenta no recibe la factura. Los tres consumidores pasan el origen de la operación. |
| Cola y memoria | Doble inclusión, sockets retirados, avisos desconocidos y confirmaciones repetidas podían conservar callbacks o datos innecesarios. | Un solo coordinador; retirada de listeners del socket anterior incluso al quedar sin socket; diccionarios sin prototipo; máximo de 256 avisos anticipados y 256 identificadores terminados; caducidad y destrucción explícita al salir. |
| Recogida de objetos | Una respuesta pendiente que llegaba después de cerrar el mapa no se registraba en la cola. | La recogida del suelo registra también esa respuesta para entregarla en el mapa siguiente, conservando las comprobaciones de estado de su interfaz. |
| Caducidad | Una espera de cero volvía a dos minutos por el operador `||`; un fallo asíncrono de reconciliación podía quedar sin manejar. | El cero se respeta, las duraciones son finitas y se captura el rechazo de la sincronización de inventario. |
| Sesión del juego | Tras logout y login en la misma página quedaba suspendida la renovación. Un 401 lento del login anterior podía repetirse con la cuenta nueva. | La renovación se reactiva tras login correcto y una generación invalida los reintentos de la sesión anterior. Se mantiene la espera de renovaciones anteriores antes del cambio de sesión y el tratamiento de CSRF. |
| Login del servidor | Varias solicitudes con la misma firma podían emitir varias sesiones antes de limpiar el nonce. | Consumo atómico del nonce antes de generar tokens; diez solicitudes simultáneas producen un solo login y un solo hash costoso. La finalización anterior tampoco borra un nonce nuevo. |
| Validación de acceso | Se podía saltar un bloqueo temporal reutilizando un nonce; entradas de tipo objeto causaban errores internos; fallos de comprobación permitían continuar. | Se comprueba el bloqueo también en login y antes de reutilizar el nonce. Los tipos y tamaños se validan antes de procesar firmas. Si no se pueden comprobar permisos o suspensión, se responde 503 recuperable, conservando la excepción para cerrar sesión. |
| Renovación del servidor | Se borraba el refresh token antes de crear su reemplazo; solicitudes simultáneas podían generar varios. | Reemplazo condicional del mismo documento, en una sola operación Mongo. Solo una solicitud gana; un fallo anterior al reemplazo conserva el token vigente. El fallo de metadatos auxiliares ya no impide entregar la cookie rotada. No exige replica set ni cambia el formato JWT. |
| Prueba de analítica | Su fixture ejecutaba también el bootstrap de colecciones añadido después y confundía su fallback con un fallo de analítica. | La extracción termina al comenzar el siguiente módulo. Se reprodujo el mismo fallo con el respaldo inicial antes de corregir la prueba. El código de analítica no cambió. |

Los cinco scripts públicos editados tienen hashes de versión nuevos en `index.html`, para que al publicarlos se soliciten sus versiones corregidas.

## Dependencias verificadas

Se consultó el registro actual mediante `npm audit`, además de los avisos del mantenedor. Se actualizó exclusivamente `follow-redirects` de **1.16.0 a 1.16.1**, dentro de su rango compatible. La comparación del lock confirma que solo cambió `node_modules/follow-redirects`; `package.json`, Phaser, Ethers y el resto del grafo conservaron sus versiones.

La versión anterior podía filtrar credenciales al seguir redirecciones con cabeceras en array o ciertos nombres de cabecera personalizados. Fuentes: [aviso de cabeceras en array](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [aviso de nombres personalizados](https://github.com/advisories/GHSA-8r9p-f939-6h3c) y [parche oficial 1.16.1](https://github.com/follow-redirects/follow-redirects/releases/tag/v1.16.1). Las tres pruebas nuevas verifican HTTP local real y la compatibilidad de Axios con POST/JSON y redirección 307.

| Árbol local auditado | Avisos iniciales | Avisos finales |
|---|---:|---:|
| Cliente web completo | 0 | 0 |
| Escritorio completo | 0 | 0 |
| Backend: dependencias de producción | 1 paquete alto, con dos avisos | 0 |
| Backend: producción y desarrollo/contratos | 74 | 73 |

Los **73 restantes** pertenecen al entorno de desarrollo/contratos: **46 altos, 7 moderados y 20 bajos**. Incluyen dependencias de Hardhat 2, Mocha/Jest, undici 5, elliptic, braces y sprintf-js. La ejecución final de `npm audit fix --dry-run --ignore-scripts` propuso **cero cambios compatibles**. Las soluciones indicadas requieren migraciones mayores o sustituir consumidores de paquetes sin parche publicado. No se cambió la cadena de compilación/despliegue de contratos mediante actualizaciones forzadas: esas migraciones siguen pendientes y este informe no declara todo el backend libre de vulnerabilidades.

El árbol del backend auditado está en `GrasslandBuild/repositories/backend`; en el Escritorio está el fuente `server2.js`, sin manifiesto de instalación asociado. Los resultados describen esta instalación local, no certifican las versiones de un servidor remoto ni de un ejecutable ya construido.

## Evidencia de verificación

- Base seleccionada antes de editar: **109/109** pruebas existentes aprobadas (`baseline-tests.txt`).
- Casos nuevos de runtime antes de reparar: **12/12 reproducían fallos** (`runtime-before.txt`). Los ocho casos iniciales de autenticación también fallaban antes (`auth-before.txt`); la suite final amplía ese bloque a diez.
- Regresión final: **594/594**, cero fallos, cancelaciones u omisiones, en 61 archivos de pruebas (`regression-verified.txt`). Incluye inventario, crafting, combate, red, wallet, misiones, sesiones, entorno, marketplace y backend. Las pruebas del backend extraen los handlers reales sin arrancar su servicio.
- Escritorio: **15/15** pruebas adicionales aprobadas (`desktop-regression.txt`).
- Navegador de librerías: **60 ciclos de paneles y 20 ciclos WebGL**, cero errores JS (`libraries-browser/`).
- Navegador nuevo: **100 ciclos de carga y 100 confirmaciones durante transiciones**, cero intervalos o listeners de escena/socket retenidos al terminar y cero errores JS (`runtime-browser.json`). Usa DOM y EventEmitter de Phaser reales.
- Panel administrativo central: **12 grupos**, incluidos edición manual, misiones, cero EXP, idioma/tema, sesión, ocho herramientas y móvil (`admin-browser/`).
- Analítica administrativa: **21 grupos** de navegador, cero errores JS (`impact-browser/`).
- Análisis estático de **96 bibliotecas propias**, cero errores. Inventario profundo de **115 archivos y 166.805 líneas**, incluido el backend del Escritorio, con cero diagnósticos. El análisis adicional de HTML/scripts abarca **131 archivos y 177.792 líneas**, sin errores y con una advertencia conocida del selector de una sala de combate. Los totales se solapan y no deben sumarse.
- Las cuatro bibliotecas vendorizadas conservan la integridad y tamaño de su manifiesto.

Los logs de esta revisión están en esta carpeta, conservando los informes anteriores. `changes.json` y los inventarios registran hashes para contrastar cualquier edición posterior. La atomicidad usada en los handlers se apoya en [la semántica documentada de findOneAndUpdate](https://mongoosejs.com/docs/tutorials/findoneandupdate.html); las pruebas de concurrencia aquí emplean un fixture atómico, sin conectarse a una base de datos real.

La lectura manual se concentró en los flujos modificados y sus consumidores; el inventario AST cubre archivos completos. Las pruebas con ciclos verifican los recursos indicados, pero no equivalen a una medición prolongada de heap/GPU en todos los dispositivos ni prueban ausencia universal de defectos.

Se editaron los archivos locales. No se desplegó, reinició el backend, operó sobre Mongo de producción ni usó una firma de la cartera del usuario. Para que el servicio activo reciba estas correcciones debe utilizar el `server2.js` editado y el lock actualizado al publicarse o instalarse; los binarios y paquetes antiguos no se regeneraron.
