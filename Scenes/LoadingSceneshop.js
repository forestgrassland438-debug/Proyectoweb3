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

    
async loadResources() {
  // Mostrar loading con mensaje inicial
  this.loadingSystem.show({ 
    message: 'Loading resources...', 
    initialProgress: 0 
  });
  
  // Simular carga con tiempo controlado
  const steps = 10; // 10 pasos
  const stepDelay = 250; // 250ms por paso = 2.5 segundos total
  
  for (let i = 0; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDelay));
    
    // Usar easing para progreso más natural
    const progress = i / steps;
    const easedProgress = this.loadingSystem.easeOutCubic(progress);
    
    // Actualizar progreso (evitar retrocesos)
    this.loadingSystem.update(easedProgress);
    
    // Cambiar mensaje según progreso
    if (progress < 0.4) {
      this.loadingSystem.textElement.textContent = 'Loading resources...';
    } else if (progress < 0.8) {
      this.loadingSystem.textElement.textContent = 'Processing data...';
    } else {
      this.loadingSystem.textElement.textContent = 'Finalizing...';
    }
  }
  
  // Asegurar 100%
  this.loadingSystem.update(1);
  
  // Cambiar mensaje final
  this.loadingSystem.textElement.textContent = 'Loaded successfully!';
  
  // Esperar un momento para que se vea el 100%
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Ocultar con fade suave
  this.loadingSystem.hide(600);

  
        this.scene.start("tiendajuego");
        clearInterval(this.intervalId);
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



        this.loadResources();
    }


}

// Al final de LoadingSceneshop.js — después de todas las clases
window.BootScene1       = BootScene1;
window.LoadingSceneshop = LoadingSceneshop;