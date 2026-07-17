// eslint-disable-next-line no-unused-
class GameScene1 extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene1' });
   
      
  }

  

  preload() {


    
    this.load.image('tiles', './Game/MAPAS/tiles.png');
    
    this.load.image('mapa_img', './Game/MAPAS/mapa_principal.png');

    this.load.tilemapTiledJSON('tilemap', './Maps/mapa_principal.json');

  }

  create() {
 // Cargar el tilemap y el conjunto de tiles
    this.map = this.make.tilemap({ key: 'tilemap' });
    const tileset = this.map.addTilesetImage('Tileset_mapa', 'tiles', 16, 16);
    this.backgroundLayer = this.map.createLayer('mapa_principal', tileset, 0, 0);


    
    
    // 1. Crear el render texture y dibujar sobre él
    const rt = this.add.renderTexture(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    rt.draw(this.backgroundLayer);

    // 2. Esperar a que todo se dibuje antes de exportar
    this.time.delayedCall(100, () => {
      // 3. Usar snapshot directamente del renderTexture
      rt.snapshot((image) => {
        // 4. Crear un enlace para descargar
        const a = document.createElement('a');
        a.href = image.src; // image es un HTMLImageElement
        a.download = 'mapa_exportado.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });


  }

  update(){


  }

}


window.sceneClasses = window.sceneClasses || [];
window.sceneClasses.push({ key: 'GameScene1', cls: GameScene1 });
