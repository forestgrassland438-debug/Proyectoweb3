// Redirección de game.html a index.html.
// Va en un archivo aparte y no en línea porque la CSP del sitio prohíbe los
// scripts en línea (`script-src 'self'`): un <script> dentro del HTML sería
// bloqueado y la redirección dependería solo de la meta refresh.
// Con `replace` la página vieja no queda en el historial, así que el botón
// "atrás" del navegador no devuelve al jugador aquí una y otra vez.
(function () {
  'use strict';
  try {
    window.location.replace('./index.html');
  } catch (e) {
    window.location.href = './index.html';
  }
})();
