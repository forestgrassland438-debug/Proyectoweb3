# Ampliación de recursos · 29 de octubre de 2026

Trabajo local, sin agentes, sin desplegar y sin usar claves o saldos de producción. El contrato entregado se conserva byte por byte. Las copias previas y el parche permiten revisar solo los cambios de esta tarea sin restablecer Git.

- `manifest.json`: rutas, tamaños, hashes anteriores y actuales; distingue backend, web y pruebas.
- `DEPLOY.txt`: lista concreta para desplegar juntos backend y web. Las copias `before/` y el parche son privados y no se publican con la web.
- `unit-results.txt`: 67 pruebas aprobadas de cobros, recursos, precios, idempotencia, permisos y atomicidad.
- `compatibility-results.txt`: 57 pruebas aprobadas de árboles, inventario entre escenas, administración, sesiones y recargas.
- `chain-integration.json` / `chain-results.txt`: nueve escenarios con MongoDB 7.0.14 en replica set local y el contrato original compilado con solc 0.8.20, OpenZeppelin 5.0.2 y EVM local. Incluye 100 reclamaciones concurrentes, conservación a tabla llena y el bypass privilegiado de migración. Ganache usa su alternativa JS porque el módulo nativo µWS no coincide con Node 24; los escenarios finalizaron y se cerraron el cliente, Mongo y EVM.
- `simulation.json`: un millón de consultas de política por lotes y cuatro escenarios de 365 días. Las cantidades nunca exceden el cap bajo las hipótesis. No es una prueba de capacidad de un millón de jugadores conectados.
- `browser-results.json` y capturas: 1280, 390 y 320 px, botones de compra/estadísticas, ausencia de desbordamiento, errores como texto, limpieza de datos al invalidar sesión, limpieza de bandeja relayer y treinta ciclos de retirada de iframe.
- `image-asset.json`: herramienta, descripción y hash de la ilustración nueva. Las figuras económicas se generan con Matplotlib; el diagrama es SVG.

## Reproducir

Ejecutar desde la carpeta del proyecto:

```
node --test tools/economia.test.cjs tools/economia2.test.cjs tools/tesoro.test.cjs tools/economy-authority.test.cjs tools/resource-economy.test.cjs tools/txt-marketplace-atomic.test.cjs
node --test tools/arboles.test.cjs tools/environment-resources.test.cjs tools/admin-suite-backend.test.cjs tools/admin-session.test.cjs tools/recargas-y-suelo.test.cjs tools/inventory-transitions.test.cjs
node tools/resource-chain-integration.cjs
node tools/resource-simulation.cjs
node tools/resource-browser-verification.cjs
```

La integración usa dependencias temporales en `C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules`; no se añadieron al package del juego. El navegador usa el Chromium headless instalado para pruebas, con datos sintéticos y un servidor local efímero. Las herramientas `resource-*-apply/integrate/finishing/final-backend.py` son transformaciones de una sola ejecución: no deben ejecutarse de nuevo sobre los archivos ya modificados. `resource-sync.py` solo actualiza los cuatro bloques nuevos delimitados por marcadores.

## Límites operativos

Migración abierta y cambios de límite por el propietario pueden superar la política. Las publicaciones anteriores sin prueba de custodia necesitan revisión; no se compensan inventando facturas. Un envío sin hash verificable requiere revisar la cadena. La presencia mide la instancia actual. Las pruebas no certifican cero defectos, todas las rutas del proyecto ni la capacidad real de Railway/RPC ante millones de jugadores.
