// eslint-disable-next-line no-unused-vars
class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: "MenuScene" });
    }

    preload(){
        this.load.image('miImagen', './Game/Source/nubes.png');
        this.load.image('openBtn', './Game/Source/volumen.png');
        this.load.image('config', './Game/Source/config.png');
        
        // Cargar sonido del botón
        this.load.audio('sonidoClick', './Game/MUSIC/blit.mp3');

        // NPC

        //this.load.image('NPCMAGA', './Game/Objetos/NPC/NPCINIT.png');

        // arbol principales

        this.load.image('arbolxd', './Game/Objetos/arbol_pinos.png')

        // Ejemplo de cómo cargar un spritesheet basado en un gif convertido
        this.load.spritesheet('portal', './Game/FONDO/Portal.png', {
          frameWidth: 200,   // ancho de cada frame
          frameHeight: 200   // alto de cada frame
        });


    }

    
    create() {
        // Variables para almacenar el tamaño previo
        
        this.currentWidth = parseInt(localStorage.getItem('screenWidth'));
        this.currentHeight = parseInt(localStorage.getItem('screenHeight'));

        // resolucion de phaser

            
        this.phaser_ancho = this.scale.width;
        this.phaser_largo = this.scale.height;


        

        // Agregar sonido a la escena
        this.sonidoBoton = this.sound.add('sonidoClick');


        // Verifica si la imagen se cargó correctamente
        
        const canvasWidth = this.scale.width;
        const canvasHeight = this.scale.height;


        // FONDO DE PANTALLA

        if (this.textures.exists('background')) {
            // Agregar la imagen de fondo y ajustarla a toda la pantalla
            this.background = this.add.image(0, 0, 'background');
            this.background.setOrigin(0, 0); // Poner la imagen en la esquina superior izquierda
            this.background.setDisplaySize(canvasWidth, canvasHeight);
        } else {
            console.error('No se pudo cargar la imagen de fondo');
        }

        // CREANDO RECTANGULO DE CARTERA

        const graphics = this.add.graphics();
        graphics.fillStyle(0x000000, 0.5);
        graphics.setDepth(1);

        // Dibujar el rectángulo (x, y, width, height)
        graphics.fillRoundedRect(this.phaser_ancho / 2 - 150, 1, 300, 50, 15);

        // Configurar la cuenta en el sistema de datos global
        // Recuperar la cuenta almacenada en localStorage

        this.currentAccountx = localStorage.getItem("connectedAccount");
        this.currentAccount = this.registry.get("account");
        localStorage.removeItem("connectedAccount");

        if (this.currentAccountx) {
        // Guardar en el registro global de Phaser
        this.registry.set("account", this.currentAccountx);
        console.log("Cuenta configurada en LoadingScene:", this.currentAccountx);
        this.currentAccount = this.currentAccountx;
        } else {

          if (this.currentAccount) {
            console.log("ya estabas iniciado xd")
          } else {
            this.registry.remove("account");
            console.error("No se encontró una cuenta conectada en localStorage.");
          }
        }

            // 1) Valores originales de los textos
        this.baseWidth = window.innerWidth;          // diseño inicial
        this.heights = window.innerHeight;
        this.walletTextOriginalFontSize = 25;        // valor numérico sin 'px'
        this.walletTextOriginalScale    = 0.5;       // el setScale inicial
        this.footerTextOriginalFontSize = 30;        // idem para el footer
        this.footerTextOriginalScale    = 0.5;

        // TEXTO DE CARTERA

        this.walletText = this.add.text(
            this.scale.width / 2, 25,
            `>> (${this.currentAccount.slice(0,6)}...${this.currentAccount.slice(-4)})`,
            {
                fontFamily: '"PressStart2P"',
                fontSize: `${this.walletTextOriginalFontSize}px`,
                color: '#ffffff',
                resolution: 4,
            }
        )
        .setOrigin(0.5)
        .setScale(this.walletTextOriginalScale)
        .setDepth(1);

        this.footerText = this.add.text(
            this.scale.width / 2 - 380, this.scale.height - 30,
            '©GRASSLAND FOREST - Version 1.0.1',
            {
                fontFamily: '"PressStart2P"',
                fontSize: `${this.footerTextOriginalFontSize}px`,
                color: '#ffffff',
                resolution: 4,
            }
        )
        .setOrigin(0.5)
        .setScale(this.footerTextOriginalScale);

        // dar radius al rectangulo
        //rect.fillRoundedRect


        //  ------------------ Crear Boton Jugar
        const rect = this.add.graphics({ fillStyle: { color: 0x000000, alpha: 0.5 } });
        rect.fillRoundedRect(1, this.phaser_largo - 355, 130, 40, 15);
        
        // Definir un área interactiva explícita para el gráfico
        rect.setInteractive(new Phaser.Geom.Rectangle(1, this.phaser_largo - 355, 130, 40), Phaser.Geom.Rectangle.Contains);
        
        // Agregar evento de clic
        rect.on('pointerdown', () => {
            console.log("¡Clic en el rectángulo!");  // Verificar si se hace clic
            this.scene.start('LoadingScenegame');  // Cambiar a la escena GameScene
        });
        
        // Crear el texto y asignarlo a una variable para usarlo más tarde
        const text = this.add.text(65, this.phaser_largo - 335, "Play", {
            fontFamily: '"PressStart2P"', // Fuente personalizada
            fontSize: '15px', // Tamaño
            color: '#ffffff', // Color blanco
            resolution: 4, // Asegura calidad en pantallas de alta resolución
        }).setOrigin(0.5);
        
        // Cambiar color al pasar el puntero por encima (hover)
        rect.on('pointerover', () => {
            rect.clear();  // Limpiar el gráfico anterior
            rect.fillStyle(0xffffff, 1);  // Fondo blanco cuando el puntero está sobre el botón
            rect.fillRoundedRect(1, this.phaser_largo - 355, 130, 40, 15);
            this.sound.play('sonidoClick', { volume: this.sfxVolume });

        
            text.setStyle({ fill: '#000000' });  // Cambiar el color del texto a negro
        });
        
        // Restaurar colores cuando el puntero sale del botón
        rect.on('pointerout', () => {
            rect.clear();
            rect.fillStyle(0x000000, 0.5);  // Fondo negro semi-transparente
            rect.fillRoundedRect(1, this.phaser_largo - 355, 130, 40, 15);
        
            text.setStyle({ fill: '#ffffff' });  // Volver el texto a blanco
        });
        




        
        //  --------------------- Crear Boton Mercado
        // Crear el rectángulo negro transparente para el botón Marketplace
        const rect1 = this.add.graphics({ fillStyle: { color: 0x000000, alpha: 0.5 } });
        rect1.fillRoundedRect(1, this.phaser_largo - 300, 130, 40, 15);

        // Crear el texto "Marketplace" y asignarlo a una variable para manipularlo
        const textMarketplace = this.add.text(65, this.phaser_largo - 280, "Lands", {
            fontFamily: '"PressStart2P"', // Fuente personalizada
            fontSize: '14px', // Tamaño
            color: '#ffffff', // Color blanco
            resolution: 4, // Asegura calidad en pantallas de alta resolución
        }).setOrigin(0.5);  // Centrar el texto dentro del rectángulo

        // Hacer el rectángulo interactivo
        rect1.setInteractive(new Phaser.Geom.Rectangle(1, this.phaser_largo - 300, 130, 40), Phaser.Geom.Rectangle.Contains);

        // Agregar evento de clic (para ir a otra escena o lo que desees)
        rect1.on('pointerdown', () => {
            console.log("¡Clic en lands!");  // Verificar clic
            this.scene.start('ShopScene');  // Cambiar a la escena GameScene (puedes cambiarlo según lo necesites)
        });
        

        // Cambiar color al pasar el puntero por encima (hover)
        rect1.on('pointerover', () => {
            rect1.clear();  // Limpiar el gráfico anterior
            rect1.fillStyle(0xffffff, 1);  // Fondo blanco cuando el puntero está sobre el botón
            rect1.fillRoundedRect(1, this.phaser_largo - 300, 130, 40, 15);

            textMarketplace.setStyle({ fill: '#000000' });  // Cambiar el color del texto a negro
        });

        // Restaurar colores cuando el puntero sale del botón
        rect1.on('pointerout', () => {
            rect1.clear();
            rect1.fillStyle(0x000000, 0.5);  // Fondo negro semi-transparente
            rect1.fillRoundedRect(1, this.phaser_largo - 300, 130, 40, 15);

            textMarketplace.setStyle({ fill: '#ffffff' });  // Volver el texto a blanco
        });



        
        //  --------------------- Crear Boton Cerrar Seccion
        // Crear el rectángulo negro transparente para el botón Marketplace
        const rect2 = this.add.graphics({ fillStyle: { color: 0x000000, alpha: 0.5 } });
        rect2.setDepth(1);
        rect2.fillRoundedRect(this.phaser_ancho - 135, 1, 130, 40, 15);

        // Crear el texto "Marketplace" y asignarlo a una variable para manipularlo
        const textseccion = this.add.text(this.phaser_ancho - 70, 20, "log out", {
            fontFamily: '"PressStart2P"', // Fuente personalizada
            fontSize: '11px', // Tamaño
            color: '#ffffff', // Color blanco
            resolution: 4, // Asegura calidad en pantallas de alta resolución
        }).setOrigin(0.5);  // Centrar el texto dentro del rectángulo

        textseccion.setDepth(1);

        // Hacer el rectángulo interactivo
        rect2.setInteractive(new Phaser.Geom.Rectangle(this.phaser_ancho - 135, 1, 130, 40), Phaser.Geom.Rectangle.Contains);

        // Agregar evento de clic (para ir a otra escena o lo que desees)
        rect2.on('pointerdown', () => {
            console.log("¡Clic en cerrar seccion!");  // Verificar clic
            this.registry.set("account", null);
            localStorage.removeItem("connectedAccount");
            window.location.href = "../index.html"; // Cambiar a la escena GameScene (puedes cambiarlo según lo necesites)
        });
        

        // Cambiar color al pasar el puntero por encima (hover)
        rect2.on('pointerover', () => {
            rect2.clear();  // Limpiar el gráfico anterior
            rect2.fillStyle(0xffffff, 1);  // Fondo blanco cuando el puntero está sobre el botón
            rect2.fillRoundedRect(this.phaser_ancho - 135, 1, 130, 40, 15);

            textseccion.setStyle({ fill: '#000000' });  // Cambiar el color del texto a negro
        });

        // Restaurar colores cuando el puntero sale del botón
        rect2.on('pointerout', () => {
            rect2.clear();
            rect2.fillStyle(0x000000, 0.5);  // Fondo negro semi-transparente
            rect2.fillRoundedRect(this.phaser_ancho - 135, 1, 130, 40, 15);

            textseccion.setStyle({ fill: '#ffffff' });  // Volver el texto a blanco
        });

        // npc maga

        /*

        this.maganpc = this.add.image(this.phaser_ancho / 2, this.phaser_largo - 170, 'NPCMAGA');
        
        this.maganpc.displayWidth = 110; // Ancho en píxeles
        this.maganpc.displayHeight = 145; // Alto en píxeles

        */

        

        // arboles 

        /*

        
        this.arbol1 = this.add.image(this.phaser_ancho / 2 - 380, this.phaser_largo - 276, 'arbolxd');
        
        this.arbol1.displayWidth = 300; // Ancho en píxeles
        this.arbol1.displayHeight = 450; // Alto en píxeles

        this.arbol1.setDepth(1);

        
        this.arbol2 = this.add.image(this.phaser_ancho / 2 + 440, this.phaser_largo - 276, 'arbolxd');
        this.arbol2.displayWidth = 300; // Ancho en píxeles
        this.arbol2.displayHeight = 450; // Alto en píxeles

        this.arbol2.setDepth(1);


        // PORTAL
        // Crear animación desde 'portal'
        this.anims.create({
          key: 'animacionGif',
          frames: this.anims.generateFrameNumbers('portal', { start: 0, end: 52 }),
          frameRate: 10,
          repeat: -1
        });

        // Crear sprite también desde 'portal' (¡no 'miGifAnimado'!)
        const gif = this.add.sprite(650, 200, 'portal');
        gif.setDisplaySize(500, 500);
        gif.setDepth(1);
        gif.play('animacionGif');



        */


        






        // moviendo nubes 1

        // Obtén el ancho de la imagen para ajustar el posicionamiento.
        const imageWidth = this.textures.get('miImagen').getSourceImage().width;
        const gameWidth = this.sys.game.config.width;
        //const gameHeight = this.sys.game.config.height;

        // Coloca la imagen justo fuera del borde derecho.
        this.imagen = this.add.image(gameWidth + imageWidth / 2, 40, 'miImagen');

        // Cambiar el ancho y alto de la imagen
        this.imagen.displayWidth = 200; // Ancho en píxeles
        this.imagen.displayHeight = 70; // Alto en píxeles

        this.imagen.setDepth(0);

        // Crea un tween para mover la imagen hacia la izquierda.
        this.tweens.add({
            targets: this.imagen,
            x: -this.imagen.displayWidth / 2, // Se mueve hasta salir por la izquierda.
            duration: 150000,     // Duración de la animación (ajusta según necesidad).
            ease: 'Linear',
            repeat: -1,         // Repetición infinita.
            onRepeat: () => {
                // Reinicia la posición para que vuelva a aparecer por la derecha.
                this.imagen.x = gameWidth + this.imagen.displayWidth / 2;
            }
        });


        // moviendo nubes 2

        // Obtén el ancho de la imagen para ajustar el posicionamiento.
        const imageWidth1 = this.textures.get('miImagen').getSourceImage().width;
        const gameWidth1 = this.sys.game.config.width;
        //const gameHeight = this.sys.game.config.height;

        // Coloca la imagen justo fuera del borde derecho.
        this.imagen1 = this.add.image(gameWidth1 + imageWidth1 / 2, 100, 'miImagen');

        // Cambiar el ancho y alto de la imagen
        this.imagen1.displayWidth = 200; // Ancho en píxeles
        this.imagen1.displayHeight = 70; // Alto en píxeles

        this.imagen1.setDepth(0);

        // Crea un tween para mover la imagen hacia la izquierda.
        this.tweens.add({
            targets: this.imagen1,
            x: -this.imagen1.displayWidth / 2, // Se mueve hasta salir por la izquierda.
            duration: 90000,     // Duración de la animación (ajusta según necesidad).
            ease: 'Linear',
            repeat: -1,         // Repetición infinita.
            onRepeat: () => {
                // Reinicia la posición para que vuelva a aparecer por la derecha.
                this.imagen1.x = gameWidth1 + this.imagen1.displayWidth / 2;
            }
        });


        // moviendo nubes 3

        // Obtén el ancho de la imagen para ajustar el posicionamiento.
        const imageWidth2 = this.textures.get('miImagen').getSourceImage().width;
        const gameWidth2 = this.sys.game.config.width;
        //const gameHeight = this.sys.game.config.height;

        // Coloca la imagen justo fuera del borde derecho.
        this.imagen2 = this.add.image(gameWidth2 + imageWidth2 / 2, 140, 'miImagen');

        // Cambiar el ancho y alto de la imagen
        this.imagen2.displayWidth = 200; // Ancho en píxeles
        this.imagen2.displayHeight = 70; // Alto en píxeles

        this.imagen2.setDepth(0);

        // Crea un tween para mover la imagen hacia la izquierda.
        this.tweens.add({
            targets: this.imagen2,
            x: -this.imagen2.displayWidth / 2, // Se mueve hasta salir por la izquierda.
            duration: 60000,     // Duración de la animación (ajusta según necesidad).
            ease: 'Linear',
            repeat: -1,         // Repetición infinita.
            onRepeat: () => {
                // Reinicia la posición para que vuelva a aparecer por la derecha.
                this.imagen2.x = gameWidth1 + this.imagen2.displayWidth / 2;
            }
        });




        // musica y sonido
        

        this.musica = this.registry.get('musica');
        if (!this.musica) {
          console.error("La música no se encontró en el registry");
        }

        // panel de sonido

        // Variables globales para el panel de volumen
        this.volPanelPosX = this.phaser_ancho / 2 ;
        this.volPanelPosY = 300;
        this.volPanelWidth = 500;
        this.volPanelHeight = 300;

        // Variables de configuración de los elementos dentro del panel
        this.panelMargin = 20;             // margen interno del panel
        this.sliderBarWidth = 200;         // ancho de la barra del slider
        this.sliderBarHeight = 10;         // alto de la barra del slider
        this.sliderXStart = -100;          // posición X de inicio para las barras y knobs (relativo al panel)
        this.knobRadius = 10;              // radio del knob del slider
        this.labelFontSize = '24px';       // tamaño de fuente para los labels
        this.percentFontSize = '24px';     // tamaño de fuente para el porcentaje
        // Posiciones verticales relativas al centro del panel para cada elemento
        this.musicLabelY = -this.volPanelHeight / 2 + this.panelMargin + 40;
        this.musicSliderY = this.musicLabelY + 40;
        this.musicPercentY = this.musicSliderY - 10;
        
        this.sfxLabelY = this.musicSliderY + 80;
        this.sfxSliderY = this.sfxLabelY + 40;
        this.sfxPercentY = this.sfxSliderY - 10;

        // Carga los volúmenes guardados desde localStorage
        this.loadVolumeSettings();

        
        // Crea una imagen interactiva para abrir el panel de volumen
        this.openBtn = this.add.image(1050, 23, 'openBtn').setInteractive();

        
        this.openBtn.displayWidth = 40; // Ancho en píxeles
        this.openBtn.displayHeight = 40; // Alto en píxeles

        // Al hacer clic, se abre el panel
        this.openBtn.on('pointerdown', () => {
            this.openVolumePanel();
        });

        const boton = this.add.image(1100, 23, 'config')
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(11)
        .setDisplaySize(38, 35);


























        // Agregar el botón de pantalla completa
        const fullscreenButton = this.add.image(canvasWidth - 20, 50, 'fullscreenButton').setScale(0.12, 0.1).setOrigin(0.5);
        fullscreenButton.setInteractive();  // Hacerlo interactivo (clickable)

        // Al hacer clic en el botón, activar pantalla completa
        fullscreenButton.on('pointerdown', () => {
            this.toggleFullScreen();
        });

    }

       
    toggleFullScreen() {
        const gameContainer = document.getElementById("container");

        // Si no está en pantalla completa, activarlo
        if (!document.fullscreenElement) {
            if (gameContainer.requestFullscreen) {
                gameContainer.requestFullscreen();
            } else if (gameContainer.mozRequestFullScreen) { // Firefox
                gameContainer.mozRequestFullScreen();
            } else if (gameContainer.webkitRequestFullscreen) { // Chrome, Safari, Opera
                gameContainer.webkitRequestFullscreen();
            } else if (gameContainer.msRequestFullscreen) { // IE/Edge
                gameContainer.msRequestFullscreen();
            }
        } else {
            // Salir de pantalla completa
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
        }
    }


  // Función para cargar y aplicar los ajustes de volumen desde localStorage
  loadVolumeSettings() {
    // Para la música
    let cachedMusicVolume = localStorage.getItem('musicVolume');
    if (cachedMusicVolume !== null) {
      cachedMusicVolume = parseFloat(cachedMusicVolume);
      // Aplica el volumen guardado a la música
      this.musica.setVolume(cachedMusicVolume);
    } else {
      cachedMusicVolume = this.musica.volume;
    }
    // Guarda el valor de la música en una propiedad para usar en el panel
    this.musicVolume = cachedMusicVolume;

    // Para los SFX
    let cachedSfxVolume = localStorage.getItem('sfxVolume');
    if (cachedSfxVolume !== null) {
      cachedSfxVolume = parseFloat(cachedSfxVolume);
      this.sfxVolume = cachedSfxVolume;
    } else {
      cachedSfxVolume = 1;
      this.sfxVolume = 1;
    }
  }

  openVolumePanel() {
    console.log('Abriendo panel de volumen...');

    // Verifica que la música exista
    if (!this.musica) {
      console.error("La música no está definida");
      return;
    }

    // Deshabilita el botón para evitar abrir múltiples paneles
    this.openBtn.disableInteractive();

    // Crea un contenedor para agrupar los elementos del panel, que sigue la cámara (scrollFactor 0) y con depth 2
    this.volumePanel = this.add.container(this.volPanelPosX, this.volPanelPosY)
      .setScrollFactor(0)
      .setDepth(2);

    // Fondo del panel: se dibuja centrado en el contenedor
    let bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.8);
    bg.fillRoundedRect(-this.volPanelWidth / 2, -this.volPanelHeight / 2, this.volPanelWidth, this.volPanelHeight, 15);
    bg.setDepth(2);
    this.volumePanel.add(bg);

    // Botón "X" para cerrar el panel; posición relativa (arriba a la derecha)
    let closeText = this.add.text(this.volPanelWidth / 2 - this.panelMargin - 20, -this.volPanelHeight / 2 + this.panelMargin, 'X', { fontSize: '32px', fill: '#ff0000' })
      .setInteractive()
      .setDepth(2);
    closeText.on('pointerdown', () => {
      this.volumePanel.destroy();
      this.openBtn.setInteractive();
    });
    this.volumePanel.add(closeText);

    // ============================
    // Slider para el volumen de la música
    // ============================

    // Etiqueta: "Música"
    let musicLabel = this.add.text(-this.volPanelWidth / 2 + this.panelMargin, this.musicLabelY, 'Música', { fontSize: this.labelFontSize, fill: '#ffffff' })
      .setDepth(2);
    this.volumePanel.add(musicLabel);

    // Barra del slider de música
    let musicSliderBar = this.add.graphics();
    musicSliderBar.fillStyle(0xffffff, 1);
    musicSliderBar.fillRect(this.sliderXStart, this.musicSliderY, this.sliderBarWidth, this.sliderBarHeight);
    musicSliderBar.setDepth(2);
    this.volumePanel.add(musicSliderBar);

    // Posición inicial del knob de música según el valor guardado
    let musicInitialX = this.sliderXStart + this.musicVolume * this.sliderBarWidth;
    let musicKnob = this.add.circle(musicInitialX, this.musicSliderY + (this.sliderBarHeight / 2), this.knobRadius, 0xff0000)
      .setInteractive({ draggable: true })
      .setDepth(2);
    this.volumePanel.add(musicKnob);

    // Texto del porcentaje de la música
    let musicVolumeText = this.add.text(this.sliderXStart + this.sliderBarWidth + 20, this.musicPercentY, Math.round(this.musicVolume * 100) + '%', { fontSize: this.percentFontSize, fill: '#ffffff' })
      .setDepth(2);
    this.volumePanel.add(musicVolumeText);

    // Arrastrar el knob de música
    this.input.setDraggable(musicKnob);
    musicKnob.on('drag', (pointer, dragX) => {
      const minX = this.sliderXStart;
      const maxX = this.sliderXStart + this.sliderBarWidth;
      dragX = Phaser.Math.Clamp(dragX, minX, maxX);
      musicKnob.x = dragX;
      let newVolume = (dragX - minX) / (maxX - minX);
      this.musica.setVolume(newVolume);
      this.musicVolume = newVolume; // actualiza variable interna
      musicVolumeText.setText(Math.round(newVolume * 100) + '%');
      // Guarda el nuevo volumen en localStorage
      localStorage.setItem('musicVolume', newVolume.toString());
    });

    // ============================
    // Slider para el volumen de los sonidos (SFX)
    // ============================

    // Etiqueta: "Sonidos"
    let sfxLabel = this.add.text(-this.volPanelWidth / 2 + this.panelMargin, this.sfxLabelY, 'Sonidos', { fontSize: this.labelFontSize, fill: '#ffffff' })
      .setDepth(2);
    this.volumePanel.add(sfxLabel);

    // Barra del slider de SFX
    let sfxSliderBar = this.add.graphics();
    sfxSliderBar.fillStyle(0xffffff, 1);
    sfxSliderBar.fillRect(this.sliderXStart, this.sfxSliderY, this.sliderBarWidth, this.sliderBarHeight);
    sfxSliderBar.setDepth(2);
    this.volumePanel.add(sfxSliderBar);

    // Posición inicial del knob de SFX según el valor guardado
    let sfxInitialX = this.sliderXStart + this.sfxVolume * this.sliderBarWidth;
    let sfxKnob = this.add.circle(sfxInitialX, this.sfxSliderY + (this.sliderBarHeight / 2), this.knobRadius, 0xff0000)
      .setInteractive({ draggable: true })
      .setDepth(2);
    this.volumePanel.add(sfxKnob);

    // Texto del porcentaje de SFX
    let sfxVolumeText = this.add.text(this.sliderXStart + this.sliderBarWidth + 20, this.sfxPercentY, Math.round(this.sfxVolume * 100) + '%', { fontSize: this.percentFontSize, fill: '#ffffff' })
      .setDepth(2);
    this.volumePanel.add(sfxVolumeText);

    // Arrastrar el knob de SFX
    this.input.setDraggable(sfxKnob);
    sfxKnob.on('drag', (pointer, dragX) => {
      const minX = this.sliderXStart;
      const maxX = this.sliderXStart + this.sliderBarWidth;
      dragX = Phaser.Math.Clamp(dragX, minX, maxX);
      sfxKnob.x = dragX;
      let newSfxVolume = (dragX - minX) / (maxX - minX);
      this.sfxVolume = newSfxVolume;
      sfxVolumeText.setText(Math.round(newSfxVolume * 100) + '%');
      // Guarda el nuevo volumen de SFX en localStorage
      localStorage.setItem('sfxVolume', newSfxVolume.toString());
    });
  }


   
    update() {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

            
        const newW = window.innerWidth;
        const newH = window.innerHeight;


        // Solo si cambió el tamaño de la ventana
        if (newWidth !== this.currentWidth || newHeight !== this.currentHeight) {
            this.currentWidth = newWidth;
            this.currentHeight = newHeight;
            const width = parseInt(localStorage.getItem('screenWidth'));
            const height = parseInt(localStorage.getItem('screenHeight'));

            console.log(width, height , this.currentWidth , this.currentHeight);

            console.log(`Ventana cambió a: ${newWidth}x${newHeight}`);

            // fondo de pantalla

            // === FACTOR DE ESCALA PERSONALIZADO ===
            const baseW = this.baseWidth ; // o el ancho con el que diseñaste inicialmente
            const baseh = this.heights;
            const widthPercent = (newW / baseW) * 100;
            const widthPercent1 = (newH / baseh) * 100;

            this.background.setOrigin(0.5, 0.5).setPosition(this.scale.width / 2, this.scale.height / 2);
            this.background.setDisplaySize(width, height);
            

            // LIMITAR entre 70% y 100% para evitar que se encoja demasiado o crezca excesivamente
            const clampedPercent = Phaser.Math.Clamp(widthPercent, 55, 100); // entre 70% y 100%
            const scaleFactor = clampedPercent / 100;
            const clampedPercent1 = Phaser.Math.Clamp(widthPercent1, 55, 100); // entre 70% y 100%
            const scaleFactor1 = clampedPercent1 / 100;


            // === WALLET TEXT ===
            this.walletText
                .setFontSize(this.walletTextOriginalFontSize) // se mantiene
                .setScale(this.walletTextOriginalScale * scaleFactor * scaleFactor1)
                .setPosition(newW / 2, 25 * scaleFactor);

            // === FOOTER TEXT ===
            this.footerText
                .setFontSize(this.footerTextOriginalFontSize) // se mantiene
                .setScale(this.footerTextOriginalScale * scaleFactor * scaleFactor1)
                .setPosition(newW * 0.22, newH - (50 * scaleFactor)); // 0.31 equivale a (centro - 380)/width aprox
        }

            


        
    }


}


