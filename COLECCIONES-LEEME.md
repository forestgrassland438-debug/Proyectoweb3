# Panel de colecciones

`colecciones.html` administra un catálogo de colecciones e imágenes y lo vincula al contrato `InvoiceSystem` de `rr.txt.txt`. Los datos del catálogo se guardan en MongoDB mediante el backend `server2.js`.

## Acceso

1. Publica los archivos del panel y actualiza el backend como se indica abajo.
2. Abre `colecciones.html` por HTTP o HTTPS y revisa la dirección de la API y del contrato.
3. Conecta la wallet que sea `owner()` o que el contrato reconozca con `isAdmin(direccion)`.
4. Firma el mensaje de inicio de sesión solicitado. Esa firma autentica la sesión; las transacciones del contrato requieren una aprobación adicional en la wallet.

La protección se comprueba en el servidor. Una dirección escrita a mano o cambiar la interfaz del navegador no sustituye una firma válida. Solo el owner del sistema asigna o retira delegados. Si la colección tiene delegado, las modificaciones en el panel quedan reservadas al delegado y al owner del sistema; los otros administradores pueden consultarla. El delegado debe ser además administrador contractual para iniciar sesión. Asignarlo no convierte una cartera cualquiera en administrador global del contrato. Las operaciones ya firmadas pueden ser confirmadas por su actor original aunque cambie la delegación.

## Crear y administrar

1. Crea una colección con nombre, descripción y las opciones que necesites. Cada colección usa un `tipo` técnico estable con prefijo `col:`; cambiar su nombre visual no debe cambiarlo.
2. Selecciona varias imágenes. El panel cuenta los archivos y asigna números de catálogo automáticamente. El nombre de cada pieza es opcional. Puedes añadir y quitar filas de atributos por pieza dentro de los límites de tamaño aceptados por la API.
3. Revisa las imágenes y los destinatarios antes de emitir. Cada pieza vinculada a cadena representa una factura de cantidad `1`, con límite de una unidad por factura.
4. Confirma en la wallet las operaciones que solicite el panel. Espera el resultado confirmado y conserva el hash para cualquier comprobación.
5. Usa los filtros y las vistas de tenedores, actividad y conexiones para revisar las direcciones participantes.

El identificador del catálogo y el `invoiceId` son distintos. El primero identifica la misma pieza en el panel. El contrato genera su propio ID al crear una factura y **genera otro ID al transferirla**. El panel debe enlazar el `newId` confirmado con la pieza original. No uses el número de archivos seleccionados para adivinar el siguiente ID contractual.

`sendmulticuentas` prepara envíos a varias direcciones con asignaciones concretas. El contrato no ofrece una función de envío múltiple: cada fila necesita su propia transacción. Un lote puede quedar completado parcialmente. Revisa el resultado por fila y reintenta solo los pendientes o fallidos; cerrar la página no revierte una transacción que ya llegó a cadena.

La preparación de una emisión reserva esa pieza para la cartera y el destinatario elegidos. Si se interrumpe el proceso, vuelve con la misma cartera y el mismo destino para recuperar la operación, y confirma el hash que ya se haya enviado. No prepares otra pieza para sustituir una emisión cuyo resultado todavía no conoces. Revisa el destino antes de preparar: las reservas no se liberan automáticamente al cerrar la página o rechazar una firma.

## Qué depende del backend

Los nombres, descripciones, imágenes, atributos, delegados y ajustes de royalties son metadatos del catálogo. MongoDB debe conservarse y respaldarse para poder recuperarlos.

- **Suspender, bloquear, eliminar y restaurar:** son estados reversibles del catálogo aplicados por esta aplicación. No congelan el contrato ni impiden que otro administrador contractual opere desde otra herramienta. La papelera de una colección conserva sus piezas y permite restaurarlas.
- **Royalties:** guardan la política de porcentaje y receptor. El contrato proporcionado no tiene ERC-2981, importes de venta ni cobro automático. En «Royalties → Registrar cobro» selecciona una pieza emitida, declara el precio de venta en moneda nativa e introduce el hash de un pago de royalty ya realizado. El backend verifica red, receptor, importe exacto, datos vacíos, recibo exitoso y confirmaciones canónicas. El precio de venta es declarado; el cobro recibido queda verificado. Un hash solo puede registrarse una vez. No se registran pagos ERC-20 ni se envían fondos desde este formulario.
- **Conexiones entre cuentas:** las transferencias permiten mostrar quién envió a quién y cuántas direcciones participan. Una conexión no demuestra que dos wallets pertenezcan a la misma persona.
- **Eliminar en cadena:** `deleteInvoice` y reducir una factura a cero son operaciones irreversibles para ese ID. No equivalen a la papelera y no permiten restauración contractual. El panel no debe usarlas para prometer una eliminación reversible.

`InvoiceSystem` no implementa ERC-721 ni ERC-1155 y no tiene `tokenURI`. Estas piezas no se convierten automáticamente en NFT estándar visibles en la pestaña NFT de MetaMask ni en mercados externos. Para ese comportamiento y para royalties o bloqueos exigidos por el contrato se necesita ampliar o desplegar otro contrato.

## Configuración y despliegue

La configuración inicial corresponde al proyecto existente:

| Dato | Valor inicial |
| --- | --- |
| Red | LitVM Testnet / LiteForge |
| Chain ID | `4441` (`0x1159`) |
| RPC | `https://liteforge.rpc.caldera.xyz/http` |
| Explorador | `https://liteforge.explorer.caldera.xyz` |
| Contrato de arranque | `0x686E17D89Bf97247fadC04C3A3f0dfD02F914115` |

La dirección inicial es la que usa el backend existente mediante `ITEM_CONTRACT_ADDRESS` o su valor por defecto. Tener un archivo Solidity local no comprueba qué código está desplegado en esa dirección. Verifica que la dirección elegida corresponde a tu despliegue de `InvoiceSystem` y que la API informa la misma red y el mismo contrato antes de emitir.

Publica juntos, manteniendo estas rutas relativas:

```text
colecciones.html
colecciones.css
colecciones.js
vendor/ethers.umd.min.js
```

El frontend y la API pueden estar en orígenes diferentes, pero el origen del frontend debe estar autorizado por la configuración CORS del backend. Usa la dirección real de tu API en la configuración del panel y sirve la página mediante HTTP o HTTPS; abrirla como `file://` puede impedir autenticación y llamadas a la API.

El archivo actualizado es **`C:\Users\pc\Desktop\server2.js`**. El módulo de colecciones está integrado dentro de ese archivo, sin requerir que copies el directorio de fuentes al alojamiento. Instálalo en el mismo servicio que ya ejecuta tu backend y reinicia ese proceso con su gestor habitual. Conserva sus variables de entorno y la conexión MongoDB existente. Se guardó una copia previa junto al archivo con nombre `server2.js.before-colecciones-…bak`. Publicar solo el HTML no instala las nuevas rutas de la API. No copies claves privadas al frontend.

Las fuentes mantenibles del módulo están en `backend-collections/collections.cjs`. Si las editas, ejecuta `node tools/build-collections-backend.cjs` para volver a integrar el módulo en el servidor del escritorio, con otra copia de seguridad. La opción `COLLECTIONS_CONFIRMATIONS` acepta de 1 a 20 confirmaciones; por defecto usa 2.

Las imágenes se aceptan hasta **600 KB por archivo** (600.000 bytes). Prepara imágenes optimizadas antes de subirlas y usa PNG, JPEG, WebP o GIF. Puedes añadir hasta **200 atributos por pieza** y registrar hasta **100 piezas por petición**; también se aplica el tamaño máximo de cada petición. Revisa el mensaje de validación si necesitas reducir un lote.

La vista inicial está limitada a **250 colecciones, 1.000 piezas, 2.000 movimientos y 1.000 cobros** para evitar respuestas excesivas. Cuando hay más registros, aparecen botones «Cargar más» que consultan páginas de hasta 500 registros. Los totales, búsquedas, gráficos y exportaciones se calculan sobre los registros cargados: carga las páginas restantes para ampliar el inventario. Un aviso de cobertura histórica pendiente requiere además sincronizar los bloques anteriores.

La sincronización trabaja en tramos de hasta **1.500 bloques** y refresca el estado actual de hasta **200 piezas por ejecución**. Si quedan tramos pendientes, continúa sincronizando y revisa el diagnóstico de cobertura. Por defecto se requieren **2 confirmaciones**; el backend puede configurar este número. Las confirmaciones y los eventos se verifican contra la cadena canónica al procesarlos; una reorganización posterior de la red puede requerir una revisión y una nueva sincronización. El registro local no sustituye la comprobación en el explorador.

Si una carga de borradores pierde su respuesta, la interfaz detiene el reintento de esa imagen y pide actualizar el catálogo antes de volver a cargarla. Así puedes comprobar qué piezas se guardaron sin duplicarlas a ciegas. Los números asignados no se reutilizan; un error de inserción puede dejar un salto en la numeración.

Para comprobar la entrega: `node --test tools/collections-backend.test.cjs tools/collections-frontend.test.cjs`. Las pruebas de navegador usan el Playwright y Edge disponibles en este equipo y respuestas simuladas, sin conectar al servidor de producción ni enviar activos.

## Alcance de la entrega

Se prepararon archivos e integración para revisión y uso posterior. Durante la implementación no se ejecutaron transacciones, no se emitieron piezas ni se enviaron activos desde tus cuentas. El despliegue del frontend y el reinicio del servicio en el alojamiento deben hacerse con los archivos actualizados.
