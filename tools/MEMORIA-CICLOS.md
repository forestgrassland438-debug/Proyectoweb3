# Correcciones de memoria y ciclo de vida

Revisión del 21 de septiembre de 2026.

## Fallos corregidos

- **Huellas:** duración estable, orden por creación al reutilizar el pool y un único reloj de escena. Se eliminan referencias a actores que ya salieron.
- **Audio:** cancelación de descargas y descarte de decodificaciones tardías; lluvia y otros ambientes se cargan cuando hacen falta y liberan sus buffers al terminar. Al salir se destruyen los sonidos de esa escena, respetando recursos compartidos en uso.
- **Noche:** se libera la textura de renderizado al amanecer y se recrea al anochecer. Los pinceles de luz utilizan texturas más pequeñas con filtrado lineal.
- **Nieve:** se liberan las texturas generadas cuando se derrite o se abandona la escena; se evitan candidatos duplicados y lienzos sin límite de tamaño.
- **Postproceso:** cada renderer registra sus propios shaders; la limpieza retira solamente el efecto que pertenece al módulo y elimina el pulso residual.
- **Escenas y HUD:** limpieza temprana e idempotente, cargas antiguas que no pueden reactivar una escena, liberación del Tilemap, índices de colisión y etiquetas. Los controles de audio, chat, emojis, perfil, ajustes y arrastre dejan de conservar manejadores de escenas anteriores.
- **Sesión:** la renovación periódica utiliza un servicio único con datos escalares, sin conservar cada GameScene visitada. Se elimina al destruir el juego.
- **Tienda:** el hub de notificaciones se crea al entrar, no al registrar una escena inactiva; se limpian sus recursos y se reutiliza la reproducción de audio corregida.
- **Caché HTTP:** los diez scripts modificados usan `v=19.6` en `bin/index.html`.

## Validación

Desde `bin`:

```powershell
npm run test:memory
npm run test:environment
node --test tools/*.test.cjs
node tools/audio-prueba-rango-memoria.js .
node tools/mina-prueba.js .
node tools/sombras-prueba-suelo.js .
```

La prueba de navegador se abre sirviendo `bin` mediante HTTP local:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/_prueba_memoria_ciclos.html` y pulsar **Ejecutar 20 ciclos**.

Resultado observado con Phaser 3.90 y WebGL reales: los 20 ciclos terminaron con **0 objetos**, **51 texturas compartidas** y **24 listeners del motor**, sin crecimiento entre ciclos. Se verificó también la liberación de la capa nocturna al amanecer y de la nieve al derretirse. La página usa un reloj y clima simulados, sin autenticación ni transacciones.

Las pruebas Node cubren también 20 cambios de audio, respuestas tardías, apagado durante `create()`, orden de huellas, conservación de recursos usados por otra escena y limpieza aunque falle un destructor.

## Alcance de la medición

Esto verifica recursos y regresiones concretas; no mide la RAM total de una partida autenticada completa. El navegador puede conservar memoria ya reservada y cachés compartidas después de liberar objetos, por lo que el número de MB del proceso no tiene por qué volver inmediatamente al inicial. Para comparar partidas, recargar la página y repetir el mismo recorrido y clima tras el calentamiento inicial.
