# Economía de Grassland Forest

Guía de operación · revisión del 28 de octubre de 2026.

El código se modificó localmente, incluyendo `C:\Users\pc\Desktop\server2.js`. No se arrancó el backend con tus credenciales, no se desplegó y no se gastó dinero real para probarlo. La migración de reservas se ejecutará cuando arranque el backend actualizado y Mongo permita confirmar la transacción.

## Qué protege esta revisión

La economía tiene dos tesoros operativos: **circular**, que financia el bronce del botín, y **juego**, que recibe ingresos y contiene la reserva protegida. La antigua colección de reserva se conserva como archivo: su saldo y configuración se trasladan una vez al tesoro del juego, dentro de una transacción. No se borra la colección ni se restablecen los saldos de los jugadores.

El navegador dejó de tener autoridad para fijar oro, plata y bronce en `/api/stats/.../update`. Las monedas también se bloquearon entre las tablas que puede escribir el relay del cliente. La tienda del NPC ahora pide al servidor que calcule, cobre, entregue o retire el objeto y liquide la operación. Una respuesta ambigua queda registrada para conciliación; repetir su misma referencia no vuelve a ejecutar la entrega.

Los cambios manuales del mapa, imágenes y catálogo se conservaron. Los archivos editados tienen copias en `audits/economia-20261028/frontend`; el backend original está en `audits/economia-20261028/server2.before.js`. Para revertir algo, restaura el archivo concreto, sin hacer un restablecimiento general de Git.

## Las monedas y la contabilidad

Los tipos de cambio del juego permanecen fijos: **1 oro = 1.000 plata = 1.000.000 bronce**. Toda comparación económica se hace en bronce entero. Cambiar la denominación no crea riqueza: el cambio y las comisiones deben conservar el valor.

Se distinguen cuatro cantidades:

- **C:** monedas en las cuentas de los jugadores, expresadas en bronce.
- **A:** C más el tesoro circular y las monedas de botín reservadas. Es dinero que puede volver a los jugadores.
- **F:** saldo del tesoro del juego, incluyendo sus importes protegidos.
- **S:** A + F, oferta monetaria registrada.

El índice usa el crecimiento de A durante siete días. Es un **indicador monetario del juego**, no una medición completa de inflación de precios, ni una garantía de valor o de convertibilidad de un token. El cambio de población, las recompensas, las recargas y la redistribución desde tesoros también pueden moverlo. El historial de precios de objetos y el P2P ayudan a interpretar esos movimientos.

Destruir un objeto no destruye monedas. Por eso, la basura y los objetos caducados se muestran como una métrica aparte y ya no pueden reducir artificialmente la inflación monetaria. Las ventas P2P tampoco elevan por sí solas la valoración usada para cobrar servicios.

## Por qué los precios se comportan de forma más ordenada

El índice de tienda tiene como objetivo `1 + crecimiento monetario × sensibilidad`, con límites absolutos y un movimiento diario acotado. La sensibilidad predeterminada es 0,6 y el paso diario predeterminado es 3 %. El precio combina la base que tú configuras, el índice y la demanda de operaciones liquidadas por el servidor.

El cambio conjunto de índice y demanda se limita respecto al precio del día anterior. Recalcular varias veces no permite acumular sucesivos pasos diarios. Como las monedas son enteras, un precio pequeño puede permanecer igual durante varios días: redondearlo no debe convertir un límite del 3 % en un salto del 10 %.

El oro de recarga usa su precio base y sensibilidad propios; el paso predeterminado es 5 % por día. El precio del día se conserva al rehacer la fotografía horaria. Una cotización fija el importe durante quince minutos. Un pago tardío puede recibir la cantidad que corresponda al precio vigente, según las reglas del servidor.

Un precio de venta del NPC no puede superar su precio de compra. Cambiar una base manualmente es una decisión administrativa deliberada y puede producir un cambio mayor que el ajuste automático diario. Conviene probar el resultado antes de confirmar precios nuevos.

## Compras, ventas y comisiones

La tienda del NPC cobra el precio y una comisión del 5 % en las compras. En las ventas, descuenta el 5 % del importe bruto. Del importe bruto de la operación, 1,5 % alimenta el circular y 3,5 % corresponde al juego; los redondeos se hacen en bronce.

El precio pagado al NPC también entra en el tesoro del juego. Cuando el NPC compra un objeto, paga con ese tesoro, respetando su reserva y los importes retenidos. **Vender al NPC ya no crea monedas de la nada.** Si falta liquidez, el servidor rechaza la venta antes de consumir el objeto.

Ejemplo: una compra cuyo precio sea 10.000 BR cobra 10.500 BR. El circular recibe 150 BR y el juego 10.350 BR. Una venta cuyo precio bruto sea 10.000 BR entrega 9.500 BR al jugador, destina 150 BR al circular y reduce en 9.650 BR el saldo del juego. El valor total se conserva.

Los saldos que se muestran después de una operación proceden del servidor. Si ya se entregó el objeto y falla la actualización visual del inventario, se conserva el cobro y se avisa de que la sincronización está pendiente; no se concede un reembolso adicional por un simple fallo de lectura.

## Bronce al matar enemigos

En modo automático, un enemigo válido reserva una recompensa base de bronce cuando el circular puede pagarla. El mínimo predeterminado es 100 BR. La probabilidad adicional calcula un premio mayor, con los ajustes existentes de nivel, VIP y jefe; tras una racha se garantiza ese intento de bonificación.

Siguen siendo necesarios un nombre válido, el nivel de la zona, el tiempo de reaparición del enemigo y no haber alcanzado el límite diario. El límite predeterminado es 25 recompensas por jugador al día. La configuración manual del tesoro puede cambiar esas condiciones o pausar los incentivos.

El bronce sale del circular, queda reservado mientras está en el suelo y se suma a la cuenta al recogerlo. **Si nadie lo recoge en cinco minutos, vuelve al circular.** Caducar el botín no debe agotar la reserva mediante una quema involuntaria. Si no hay fondos, no se inventan monedas para ocultar el problema.

## Crafteo, horno y devoluciones

El crafteo cobra, por defecto, 4 % del valor de referencia del resultado, con un mínimo de 50 BR por unidad que sigue el índice. Fundir usa, por defecto, 5 % y el mismo mínimo. El servidor calcula el importe y, si hace falta, cambia plata u oro y devuelve el cambio exacto. Una caída del servicio o una ruta antigua que devuelva 404 ya no permite continuar gratis.

Cada cobro tiene una referencia y retiene su importe en el tesoro del juego hasta recibir confirmación. Un crafteo o fundido confirmado libera la retención. Un informe de fallo del navegador solicita revisión: **no autoriza por sí mismo a devolver dinero**. Esto impide craftear, reclamar falsamente un fallo y conservar el objeto junto con el reembolso.

En Economía → Supervisor aparecen los recibos pendientes. Verifica cadena e inventario antes de marcar una entrega o devolver un servicio. En una operación de tienda, indica cuántas unidades se confirmaron realmente: el servidor calcula el pago o la devolución y libera la retención correspondiente. Los casos ambiguos de consumo de materiales también requieren revisar qué transacciones se confirmaron; no repitas operaciones a ciegas.

## El supervisor automático

Se añadió un supervisor por reglas, sin proveedor externo de IA, claves de un modelo ni decisiones financieras generadas por texto. Sus decisiones se pueden explicar y comprobar. Se ejecuta cada minuto, evita solaparse y consulta lotes acotados.

- Revisa hasta veinte recargas pendientes por ejecución. Para acreditar exige un pago válido y tres confirmaciones; el recibo y las monedas se confirman juntos en Mongo. No usa dos veces el mismo hash.
- Repone el circular desde excedentes del juego, con objetivo de 1.000.000 BR. La referencia diaria impide repetir esa transferencia automáticamente durante el mismo día UTC.
- Conserva un piso de 5.000.000 BR en el juego, más los importes retenidos para operaciones. El piso circular para quemas es 100.000 BR. Los fondos de botín reservados están separados del saldo disponible.
- La quema automática solo considera excedentes circulares por encima del objetivo, con ocho fotografías diarias que cubran siete días y crecimiento monetario superior al 20 %. Su máximo es 0,1 % del saldo circular por día UTC.

Puedes pausar el supervisor o únicamente su quema desde el panel. La recuperación de pagos ya enviados sigue activa aunque pauses la política de tesorería. El supervisor no firma pagos con la cartera del jugador, no gasta zkLTC de la reserva y no necesita conocer su contraseña.

Los pisos elegidos son parámetros conservadores de esta revisión, no una demostración de solvencia para cualquier número de jugadores. Hay que comparar ingresos, pagos, población activa y liquidez conforme crezca el juego.

## Qué ocurre al quemar

Una quema reduce el saldo del tesoro elegido y registra su valor equivalente en bronce. Una quema del circular reduce A y S. Una quema del juego reduce S, pero no retira monedas de las cuentas de los jugadores ni reduce directamente A. Por eso, quemar el tesoro del juego no corrige automáticamente un exceso de dinero activo.

Las quemas de tesorería son movimientos del **libro económico interno**. No son una transacción `burn()` de un ERC-20 ni destruyen zkLTC. Si necesitas quemar un token emitido por otro contrato, hace falta una integración específica y verificable con ese contrato.

No quemes para conseguir un precio concreto ni uses la reserva para sostener una cotización prometida. Los límites de variación evitan saltos automáticos, pero no garantizan demanda, rentabilidad o estabilidad de una moneda externa. Una quema no es una solución universal a la inflación.

## Cómo mantenerla operativa

Primero comprueba el capital de trabajo: sin excedentes del juego, el NPC no puede comprar objetos; sin saldo circular, no puede haber recompensas financiadas. Un ajuste administrativo de saldo es una decisión de emisión o contabilidad: no equivale a ingresar dinero real desde una cartera.

Las cuentas nuevas empiezan sin los antiguos regalos automáticos de 1.000 oro, plata y bronce. Esto limita la emisión por creación de carteras; los saldos existentes permanecen intactos. Revisa la progresión inicial y proporciona recompensas o equipo de inicio mediante un presupuesto explícito, sin volver a introducir saldos ilimitados por registro.

Evita aumentar simultáneamente premios de misiones, regalos, rentabilidad de cultivos y descuentos. Conserva límites de emisión por actividad, vigila la relación entre jugadores activos y recompensas y revisa precios P2P con volumen suficiente. No uses operaciones entre cuentas propias para justificar cambios de precio.

Revisa los recibos pendientes, el estado del supervisor, los errores RPC, el espacio disponible de Mongo y las tendencias de varios días. Una falta puntual de datos debe verse como falta de datos, no como inflación cero. Los gráficos ahora distinguen esos casos, muestran un punto único y liberan sus observadores al cerrar el panel.

## Puesta en marcha y límites comprobados

Publica juntos el backend y los archivos web de esta revisión, y reinicia el proceso correspondiente. Los cambios en el disco no actualizan un servidor que ya está ejecutando código antiguo. Las versiones de caché de los archivos web se actualizaron para evitar mezclar ambos flujos.

Mongo debe admitir transacciones: una instalación standalone no las soporta. Usa una configuración compatible y comprueba sus permisos e índices antes de abrir los cobros. La política es detener una operación que no pueda confirmarse de forma segura. Referencia: [transacciones de MongoDB](https://www.mongodb.com/docs/manual/core/transactions/) y [consideraciones de producción](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

Mantén una sola instancia activa del backend del juego mientras el botín y otros estados de sesión sigan usando memoria de proceso. Esta revisión no convierte todo el juego en un servicio distribuido.

La regresión local comprobó cobros, pagos duplicados, fallos de escritura, conservación de valor, migración, liquidez, gráficos y ciclos de apertura/cierre con datos simulados. No sustituye una prueba integrada con tu Mongo, tus contratos, tus permisos y el RPC real. Mongo y una blockchain no comparten una única transacción: un resultado ambiguo necesita conciliación.

También hay rutas generales de relay y actividades fuera del flujo económico revisado. Sus permisos, los contratos y la emisión de recursos deben auditarse antes de atribuir seguridad total al proyecto o usar fondos de valor real. El modo de recolección autoritativa depende de `GATHER_ENFORCE`; revisa su configuración y prueba sus acciones antes de cambiarlo. No se modificaron tus credenciales ni se activó ese modo a ciegas.

No sería honesto prometer cero bugs, cero fugas o estabilidad absoluta. Lo comprobable aquí son las reglas implementadas, la conservación de saldos en los casos ensayados y los informes de `audits/economia-20261028/`. Puedes operar con límites y diagnósticos claros, manteniendo la revisión de las excepciones.
