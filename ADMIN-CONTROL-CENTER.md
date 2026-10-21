# Centro de administración de Grassland Forest

La entrada nueva es **`control-center.html`**. Reúne las ocho herramientas existentes y conserva sus rutas, identificadores, controles y funciones. También pueden seguir abriéndose por separado.

| Herramienta | Archivo original |
| --- | --- |
| Jugadores, economía, siembra, clasificación e impacto | `admin.html` |
| Colecciones y distribución NFT | `colecciones.html` |
| Clima, estaciones y reloj del mundo | `climas.html` |
| Reportes de jugadores y moderación | `consola-reportes.html` |
| Lecturas y estadísticas del contrato | `contrato-stats.html` |
| Editor, reglas, entregas e historial de misiones | `misiones.html` |
| Lista de acceso y bloqueos | `puerta_login.html` |
| Errores del cliente y fallos del relayer | `reporter.html` |

`puerta-login.html` es un enlace de compatibilidad al archivo con guion bajo; conserva los parámetros de idioma y tema. No añade otra herramienta.

## Abrir y publicar

Sirve los archivos desde el servidor web habitual y abre `/control-center.html`. También puedes abrir cualquiera de las ocho páginas directamente; su barra superior permite volver al centro.

Para una vista local, desde esta carpeta:

```powershell
node tools/admin-suite-preview.cjs
```

Abre la dirección que imprime, normalmente `http://127.0.0.1:8137/control-center.html`. Esta vista espera el backend local en `http://127.0.0.1:8080`. El backend conserva sus requisitos habituales de entorno, dependencias y base de datos. En el dominio publicado se usa `https://api.grasslandforest.com`, igual que en los paneles originales. Las cookies de sesión requieren abrir la web mediante HTTP/HTTPS.

El archivo **`C:\Users\pc\Desktop\server2.js` ya contiene las correcciones**. Para que se apliquen en tu backend publicado, despliega ese archivo actualizado y reinicia el servicio mediante tu procedimiento habitual. Esta intervención no ha reiniciado el servidor ni ha modificado una base de datos o un contrato.

Al subir la web, incluye las ocho páginas actualizadas, `colecciones.js`, `reporter.js` y estos archivos nuevos:

```text
control-center.html
control-center.css
control-center.js
admin-session.js
admin-suite.css
admin-suite.js
admin-suite-i18n.js
mission-studio.css
mission-studio.js
puerta-login.html
```

Mantén disponibles las dependencias ya existentes, como `vendor/ethers.umd.min.js`, `colecciones.css`, `admin-impact.js`, `admin-impact.css`, el favicon y los recursos gráficos de colecciones. Los respaldos, las pruebas y los documentos de auditoría no forman parte de los archivos de publicación.

## Acceso y preferencias

El centro verifica `/api/admin/whoami` antes de mostrar datos. Reutiliza una sesión válida de la misma cartera. Si hace falta iniciar sesión, usa el flujo existente nonce → firma del mensaje → login → verificación del rol. La firma de acceso no envía una transacción.

Los permisos concretos de cada herramienta siguen siendo los del backend y del contrato. Entrar al centro no concede permisos contractuales adicionales. Colecciones mantiene sus comprobaciones y su configuración de conexión existente; el libro del contrato mantiene su comprobación de owner/admin y sus lecturas por RPC.

Idioma y apariencia se cambian desde la cabecera. Se transmiten a las herramientas sin recargar sus formularios. También se pueden indicar con `?lang=en&theme=dark` o `?lang=es&theme=light`. Las preferencias nuevas se conservan en la URL; la sesión usa las cookies del backend. El panel Reporter continúa sin guardar datos de sesión en localStorage o sessionStorage. Las preferencias y colas que colecciones ya guardaba siguen funcionando.

Solo se mantiene una herramienta cargada a la vez. Al cambiar, se comprueban los cambios pendientes y las operaciones en curso. Se liberan los observadores, peticiones y escuchas de cartera correspondientes a la herramienta cerrada. Las renovaciones de sesión de las herramientas integradas comparten el coordinador del centro.

## Mejoras de misiones

- Secciones separadas para el editor manual, reglas automáticas, entregas y premios, historial, y calendario/copias.
- Vista previa del jugador en inglés y español, conservando los seis idiomas de contenido que ya admitía el juego.
- Totales de EXP, oro y plata por jugador; distribución de entrega/caza; presupuesto máximo de las reglas y gráfico de cumplimiento de las entregas cargadas.
- Duplicar y reordenar misiones, IDs únicos al duplicar y límite de diez misiones.
- Exportación JSON del borrador e importación validada con confirmación. Importar cambia el editor local; publicar sigue requiriendo Guardar.
- Indicador de cambios pendientes, protección al salir, validación de rangos y confirmación antes de reemplazar un día o copiar sobre días de destino.
- Correspondencia explícita entre el borrador y el NPC/día cargados. Cambiar la selección no permite publicar accidentalmente el borrador de otro contexto.
- Lecturas con revisión: una respuesta antigua de días, misiones, reglas o historial no sustituye una selección más reciente. El editor correspondiente se bloquea durante la carga para proteger lo que se está escribiendo.
- Vista previa automática ligada a las reglas, fecha, NPC y semilla actuales. Si cambian, se pide regenerar la vista previa antes de llevarla al editor.
- Recarga explícita de reglas. Las exportaciones CSV neutralizan fórmulas incluidas en nombres de jugadores.

Los presupuestos del editor describen el borrador por jugador. El gráfico de entregas usa los registros devueltos por el backend. La API aplica límites a sus resultados; la página indica el alcance de la consulta. El resumen del centro muestra una lectura actual de cuentas, no una serie temporal inventada. La lista de días del backend conserva su límite de 60 días guardados por NPC.

## Errores reparados

1. **Edición manual de un día automático:** guardar manualmente ahora establece `auto: false`; una tirada posterior no puede tratar esa edición como generada automáticamente. Copiar un día también crea una programación manual protegida.
2. **Tirada rechazada con efectos secundarios:** el backend comprueba primero si hoy es manual. Rechazar la operación ya no cambia la semilla de las reglas. Las tiradas válidas incrementan la semilla mediante `$inc`.
3. **0 EXP se convertía en 50:** el editor conserva explícitamente un cero guardado.
4. **Semilla de la vista previa:** el editor utiliza la semilla cargada del backend, también después de una nueva tirada.
5. **Fechas imposibles:** las rutas administrativas de misiones comprueban el calendario real, incluidos los años bisiestos.
6. **Vista previa vacía:** si las reglas no generan misiones, devuelve una lista vacía sin provocar un error del saneador de listas no vacías.
7. **Días de actividad duplicados:** el historial cuenta fechas distintas, aunque un jugador tenga registros de varios NPC en la misma fecha.
8. **Respuestas fuera de orden:** protección en los editores de misiones, fichas/listas de jugadores, actividad, clima y expedientes de moderación.
9. **Sesión y CSRF:** renovación compartida, recuperación acotada de peticiones rechazadas, actualización del CSRF y cierre de sesión coordinado con una renovación pendiente. Los errores temporales del RPC no inician nuevas firmas automáticamente.
10. **Recursos retenidos:** retirada de escuchas de cartera al abandonar los paneles, cancelación de peticiones de herramientas cerradas y destrucción del proveedor RPC del libro del contrato cuando corresponde.
11. **Texto del clima:** las pastillas y la cola escapan los datos antes de insertarlos como HTML.
12. **Exportaciones:** protección de fórmulas en CSV de misiones y actividad de jugadores.

No se sustituyó el backend por las copias antiguas que existían en otras carpetas. No se ejecutaron operaciones sobre jugadores, premios, bloqueos, colecciones, contratos ni servicios publicados.

## Respaldo y revisión

Los originales de las páginas y scripts se copiaron antes de editarlos a:

```text
audits/admin-suite-20261020-225316/
```

`originals.json` registra tamaños y SHA-256 originales. El respaldo del backend se guarda fuera de la carpeta de la web:

```text
C:\Users\pc\.codex\backups\grassland-admin-suite-20261020-225316\server2.js
```

Para revertir, restaura únicamente los archivos que quieras recuperar desde esas copias. No restaures versiones de otras carpetas ni todo el repositorio: ya existían numerosos cambios manuales y archivos sin seguimiento antes de esta intervención.

Las verificaciones y capturas de pantalla se guardan en `audits/admin-suite-20261020-225316/verification/`. Las capturas utilizan respuestas de prueba, no cifras de producción.

## Verificaciones

```powershell
node --test tools/admin-session.test.cjs tools/admin-suite-backend.test.cjs tools/admin-auth-rpc.test.cjs tools/misiones-auto.test.cjs tools/backend-deep-stability.test.cjs tools/shop-auth-session.test.cjs tools/collections-frontend.test.cjs
node tools/admin-suite-browser.cjs
node tools/admin-impact-browser.test.cjs
```

La primera batería reúne 64 pruebas de autenticación, backend, misiones, colecciones y compatibilidad. Las pruebas nuevas del backend extraen funciones y rutas reales mediante AST con modelos simulados; no arrancan el servidor. Las pruebas de navegador interceptan API/RPC y utilizan carteras simuladas. Se revisaron temas claro/oscuro y escritorio/móvil; también se verificó que los IDs originales de los ocho HTML permanecen presentes.

Queda por validar el acceso con tu cartera real y el backend desplegado después de publicar los archivos. Ninguna prueba local de este trabajo envió una transacción ni usó credenciales de producción.
