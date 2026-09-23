// eslint-disable-next-line no-unused-vars
// En tu archivo de configuración de Phaser
class BootScene1 extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene1' });
  }
  
  preload() {
    // Mostrar loading overlay
    window.showLoadingOverlay({
      message: 'Cargando Phaser...',
      initialProgress: 0.1
    });


    
    // Actualizar progreso durante la carga
    this.load.on('progress', (value) => {
      window.updateLoadingProgress(value);
    });
    
    this.load.on('complete', () => {
      window.hideLoadingOverlay();
    });
  }

  create() {
    // Ir a la siguiente escena
    this.scene.start('LoadingSceneshop');
  }
}


class LoadingSceneshop extends Phaser.Scene {
    constructor() {
        super({ key: "LoadingSceneshop" });
        
        this.loadingSystem = new LoadingSystem();
    }

    
/**
 * Espera a que terminen las transacciones on-chain que siguen en vuelo.
 *
 * Caso real: el jugador tala un árbol y, sin esperar, cruza la puerta de la
 * tienda. GameScene se destruye con su transacción a medias y al volver la
 * madera no estaba. El contador vive en `window.GFTxGate` (tx-gate.js), fuera
 * de las escenas, así que sobrevive a esa destrucción y aquí se puede esperar.
 *
 * Tiene tope de 90 s: si se agota, se entra a la tienda igualmente. Vale más
 * una transacción rezagada que una pantalla de carga eterna.
 */
async _esperarTransaccionesPendientes() {
  const gate = window.GFTxGate;
  if (!gate || typeof gate.whenIdle !== 'function') return;
  if (gate.pending() === 0) return;

  console.log(`⏳ ${gate.pending()} transacción(es) en vuelo — esperando antes de entrar a la tienda`);

  const texto = this.loadingSystem && this.loadingSystem.textElement;
  const resultado = await gate.whenIdle({
    timeout: 90000,
    onTick: (n, etiquetas) => {
      if (!texto) return;
      texto.textContent = n === 1
        ? `Finishing 1 pending transaction… (${etiquetas[0] || ''})`
        : `Finishing ${n} pending transactions…`;
    }
  });

  if (!resultado.idle) {
    console.warn('⚠️ Se entró a la tienda con transacciones aún pendientes:', gate.labels());
  } else {
    console.log(`✅ Transacciones terminadas en ${resultado.waitedMs} ms`);
  }
}

async loadResources() {
  /* ESTA CARGA PUEDE QUEDAR ANTICUADA (mismo arreglo que LoadingScenegame).
     Phaser no espera a este async: si la escena se apagaba durante los ~3 s de
     la carga —logout, otra escena que la para—, al terminar hacía igualmente
     `scene.start("tiendajuego")` y metía al jugador en la tienda por sorpresa.
     Y dos create() seguidos lanzaban dos cargas que arrancaban la tienda dos
     veces. Solo la pasada vigente puede terminar. */
  const turno = this._turnoCarga = (this._turnoCarga || 0) + 1;
  const vigente = () => {
    if (this._turnoCarga !== turno || !this.sys || !this.sys.settings) return false;
    const st = this.sys.settings.status;
    return st !== Phaser.Scenes.SHUTDOWN && st !== Phaser.Scenes.DESTROYED;
  };
  // El texto va protegido: sin el elemento en el HTML, el TypeError dejaba la
  // pantalla de carga puesta para siempre.
  const texto = (t) => { if (this.loadingSystem.textElement) this.loadingSystem.textElement.textContent = t; };

  // Mostrar loading con mensaje inicial
  this.loadingSystem.show({
    message: 'Loading resources...',
    initialProgress: 0
  });

  // Antes de nada: terminar lo que quedó en vuelo en GameScene (una tala, un
  // crafteo, una siembra…). Si no, la tienda cargaría un inventario incompleto.
  await this._esperarTransaccionesPendientes();
  if (!vigente()) return;

  // Simular carga con tiempo controlado
  const steps = 10; // 10 pasos
  const stepDelay = 250; // 250ms por paso = 2.5 segundos total
  
  for (let i = 0; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDelay));
    if (!vigente()) return;
    
    // Usar easing para progreso más natural
    const progress = i / steps;
    const easedProgress = this.loadingSystem.easeOutCubic(progress);
    
    // Actualizar progreso (evitar retrocesos)
    this.loadingSystem.update(easedProgress);
    
    // Cambiar mensaje según progreso
    if (progress < 0.4) {
      texto('Loading resources...');
    } else if (progress < 0.8) {
      texto('Processing data...');
    } else {
      texto('Finalizing...');
    }
  }
  
  // Asegurar 100%
  this.loadingSystem.update(1);
  
  // Cambiar mensaje final
  texto('Loaded successfully!');
  
  // Esperar un momento para que se vea el 100%
  await new Promise(resolve => setTimeout(resolve, 800));
  if (!vigente()) return;
  
  // Ocultar con fade suave
  this.loadingSystem.hide(600);

  this.scene.start("tiendajuego");
}



    preload() {

        /*


        document.fonts.ready.then(() => {
            const canvasWidth = this.scale.width;
            const canvasHeight = this.scale.height;
        
            // Porcentaje de ubicación
            const xPercentage = 0.8; // 80% del ancho de la pantalla
            const yPercentage = 0.8; // 50% de la altura de la pantalla
        
            // Calcular la posición en píxeles según el porcentaje
            const xPos = canvasWidth * xPercentage;
            const yPos = canvasHeight * yPercentage;
        
            // Agrega texto con la fuente cargada
            this.add.text(xPos, yPos, 'Cargando...', {
                fontFamily: '"PressStart2P"', // Fuente personalizada
                fontSize: '16px', // Tamaño
                color: '#ffffff', // Color blanco
                resolution: 4, // Asegura calidad en pantallas de alta resolución
            }).setOrigin(0.5).setScale(1.2, 1.5);
        });


        */


    }

    create() {
        // Un apagado invalida la carga en curso (ver loadResources).
        this.events.once('shutdown', () => { this._turnoCarga = (this._turnoCarga || 0) + 1; });

        this.loadResources().catch((err) => {
            // Sin esto el fallo era un "unhandled rejection" y la pantalla de
            // carga se quedaba puesta: se entra a la tienda igualmente.
            console.error('❌ LoadingSceneshop: la carga falló, se entra igual a la tienda:', err);
            try { this.loadingSystem.hide(300); } catch (_) {}
            try { if (this.sys.isActive()) this.scene.start("tiendajuego"); } catch (_) {}
        });
    }


}

// Al final de LoadingSceneshop.js — después de todas las clases
window.BootScene1       = BootScene1;
window.LoadingSceneshop = LoadingSceneshop;