// app.js (versión FORZADA sin margins)
// Asegúrate de haber cargado Phaser y, si usas, phaser-canvas-scaler antes de este script.

// ---------------------- Inyectar CSS global para eliminar margins ----------------------
(function injectNoMarginCSS() {
    const css = `
        /* Reset estrictamente forzado para asegurar cero margins/paddings */
        html, body, #container {
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        /* Evitar márgenes/paddings en todos los elementos por defecto */
        * {
            box-sizing: border-box !important;
        }
        /* Forzar el contenedor a pantalla completa */
        #container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            overflow: hidden !important;
            z-index: 1 !important;
            background: transparent !important;
        }
        /* Forzar el canvas a ocupar todo el contenedor y quitar transform/translate */
        #container canvas, canvas {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: none !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
        }
        /* Opcional: evitar scroll involuntario */
        body, html {
            overscroll-behavior: none !important;
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
        }
    `;
    const style = document.createElement('style');
    style.setAttribute('id', 'no-margin-game-style');
    style.appendChild(document.createTextNode(css));
    document.head && document.head.appendChild(style);
})();

// ---------------------- Helpers y Auth (sin cambios funcionales) ----------------------
function toggleMenu() {
    var menu = document.querySelector('nav ul');
    if (menu) menu.classList.toggle('show');
}

document.addEventListener("DOMContentLoaded", () => {
    checkAuthentication();
});

function getAuthTokens() {
    try {
        const stored = sessionStorage.getItem('authTokens');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error loading auth tokens:', e);
    }
    return null;
}

async function checkAuthentication() {
    try {
        console.log("Checking authentication...");
        const tokens = getAuthTokens();
        if (!tokens || !tokens.accessToken) throw new Error('No authentication tokens found');

        const response = await fetch('http://localhost:3000/api/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        console.log("Auth response:", data);

        if (data.authenticated && data.address) {
            console.log("✅ Sesión válida encontrada para:", data.address);
            startGame(data.address);
        } else {
            console.log("❌ No autenticado:", data.message);
            let errorMessage = "Error: Please log in first.";
            if (data.message) errorMessage = `Authentication required: ${data.message}`;
            showErrorMessage(errorMessage);
        }
    } catch (error) {
        console.error('Authentication error:', error);
        sessionStorage.removeItem('authTokens');
        let errorMessage = "Cannot connect to authentication service. ";
        if (error.message.includes('Failed to fetch')) {
            errorMessage += "Backend server is unavailable.";
        } else if (error.message.includes('No authentication tokens')) {
            errorMessage = "Please log in first to access the game.";
        } else {
            errorMessage += "Please try again later.";
        }
        showErrorMessage(errorMessage);
    }
}

function showErrorMessage(message) {
    document.querySelectorAll('.error-message').forEach(msg => msg.remove());
    const messageContainer = document.getElementById("message-container");
    const errorMessage = document.createElement("div");
    errorMessage.className = "error-message";

    errorMessage.innerHTML = `
        <div style="color: red; font-size: 16px; text-align: center; margin: 10px 0;">
            ${message}
        </div>
        <button onclick="redirectToLogin()" 
                style="margin: 10px; padding: 10px 20px; cursor: pointer; 
                       background-color: #007bff; color: white; border: none; 
                       border-radius: 5px; font-size: 16px;">
            Go to Login
        </button>
    `;

    errorMessage.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        background-color: white;
        padding: 20px;
        border: 2px solid red;
        border-radius: 10px;
        text-align: center;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    `;

    if (messageContainer) messageContainer.appendChild(errorMessage);
    else document.body.appendChild(errorMessage);
}

function redirectToLogin() {
    sessionStorage.removeItem('authTokens');
    localStorage.removeItem('screenWidth');
    localStorage.removeItem('screenHeight');
    window.location.href = "/";
}

// ---------------------- Utilidades para forzar canvas full (sin margins) ----------------------
function ensureBodyFullScreen() {
    try {
        const html = document.documentElement;
        const body = document.body;
        html.style.setProperty('height', '100vh', 'important');
        html.style.setProperty('width', '100vw', 'important');
        body.style.setProperty('height', '100vh', 'important');
        body.style.setProperty('width', '100vw', 'important');
        body.style.setProperty('margin', '0', 'important');
        body.style.setProperty('padding', '0', 'important');
    } catch (e) { /* ignore */ }
}

function applyFullScreenContainerStyles(container) {
    if (!container) return;
    const st = container.style;
    st.setProperty('position', 'fixed', 'important');
    st.setProperty('left', '0', 'important');
    st.setProperty('top', '0', 'important');
    st.setProperty('right', '0', 'important');
    st.setProperty('bottom', '0', 'important');
    st.setProperty('width', '100vw', 'important');
    st.setProperty('height', '100vh', 'important');
    st.setProperty('margin', '0', 'important');
    st.setProperty('padding', '0', 'important');
    st.setProperty('overflow', 'hidden', 'important');
    st.setProperty('z-index', '1', 'important');
    st.setProperty('background', 'transparent', 'important');
}

function applyFullScreenCanvasStyles(canvas, container) {
    if (!canvas) return;
    if (container) applyFullScreenContainerStyles(container);

    const st = canvas.style;
    // Remove common inline props that Phaser or other libs might add
    st.setProperty('display', 'block', 'important');
    st.setProperty('position', 'absolute', 'important');
    st.setProperty('left', '0', 'important');
    st.setProperty('top', '0', 'important');
    st.setProperty('transform', 'none', 'important');
    st.setProperty('margin', '0', 'important');
    st.setProperty('padding', '0', 'important');
    st.setProperty('width', '100vw', 'important');
    st.setProperty('height', '100vh', 'important');
    st.setProperty('max-width', 'none', 'important');
    st.setProperty('max-height', 'none', 'important');
    st.setProperty('z-index', '1', 'important');
    canvas.setAttribute('touch-action', 'none');

    // Eliminar atributos inline antiguos que puedan permanecer
    ['marginLeft','marginTop','marginRight','marginBottom','transform'].forEach(k => {
        try { canvas.style[k] = '0'; } catch(e) {}
    });
    // Ajustar tamaño físico del canvas según DPR
    try {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const cssW = (container && container.clientWidth) ? container.clientWidth : window.innerWidth;
        const cssH = (container && container.clientHeight) ? container.clientHeight : window.innerHeight;
        const physW = Math.max(1, Math.floor(cssW * dpr));
        const physH = Math.max(1, Math.floor(cssH * dpr));
        canvas.width = physW;
        canvas.height = physH;
    } catch (e) { /* ignore */ }
}

function waitForCanvasAndApply(container, callback) {
    if (!container) container = document.getElementById('container') || document.body;
    const existingCanvas = container.querySelector && container.querySelector('canvas');
    if (existingCanvas) { callback(existingCanvas, container); return; }
    const obs = new MutationObserver((mutations, obsRef) => {
        const c = container.querySelector && container.querySelector('canvas');
        if (c) {
            obsRef.disconnect();
            callback(c, container);
        }
    });
    obs.observe(container, { childList: true, subtree: true });
}

function forceResizeForCanvas(container, canvas, phaserGame) {
    try {
        const cssW = (container && container.clientWidth) ? container.clientWidth : window.innerWidth;
        const cssH = (container && container.clientHeight) ? container.clientHeight : window.innerHeight;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const physicalW = Math.max(1, Math.floor(cssW * dpr));
        const physicalH = Math.max(1, Math.floor(cssH * dpr));

        if (phaserGame) {
            if (phaserGame.scale && typeof phaserGame.scale.resize === 'function') {
                try { phaserGame.scale.resize(physicalW, physicalH); } catch(e) {}
            }
            if (phaserGame.renderer && typeof phaserGame.renderer.resize === 'function') {
                try { phaserGame.renderer.resize(physicalW, physicalH); } catch(e) {}
            }
        }

        if (canvas) {
            canvas.style.setProperty('width', '100vw', 'important');
            canvas.style.setProperty('height', '100vh', 'important');
            canvas.width = physicalW;
            canvas.height = physicalH;
        }
    } catch (e) { /* ignore */ }
}

// ---------------------- Start game (integración completa) ----------------------
async function startGame(account = "") {
    console.log("Starting game with account:", account);

    ensureBodyFullScreen();

    try {
        const font = new FontFace("PressStart2P", "url('./fonts/PressStart2P-Regular.ttf')");
        await font.load();
        document.fonts.add(font);
    } catch (error) {
        console.error('Error loading font:', error);
    }

    localStorage.setItem('screenWidth', window.innerWidth.toString());
    localStorage.setItem('screenHeight', window.innerHeight.toString());
    const width = Number(localStorage.getItem('screenWidth')) || window.innerWidth;
    const height = Number(localStorage.getItem('screenHeight')) || window.innerHeight;
    console.log("Game dimensions:", width, height);

    const config = {
        type: Phaser.WEBGL,
        parent: "container",
        width: 1200,
        height: 800,
        physics: { default: 'arcade', arcade: { debug: false } },
        scene: [LoadingScenegame, GameScene, ShopScene, LoadingSceneshop, LoadingScene, MenuScene, tiendajuego],
        fps: { target: 120 },
        scale: {
            mode: Phaser.Scale.ScaleModes.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            autoRound: false,
            expandParent: true,
            min: { width: width, height: height },
            max: { width: 100000, height: 100000 }
        },
        render: {
            antialias: false,
            antialiasGL: false,
            pixelart: false,
            roundPixels: false,
            powerPreference: 'high-performance'
        },
        dom: { createContainer: true },
        plugins: {
            scene: [
                {
                    key: 'LightsPlugin',
                    plugin: Phaser.Renderer.WebGL.Pipelines.LightPipeline,
                    mapping: 'lights'
                }
            ]
        }
    };

    // Si usas PhaserCanvasScaler
    if (window.PhaserCanvasScaler) {
        try {
            const phaserConfig = Object.assign({}, config);
            delete phaserConfig.width;
            delete phaserConfig.height;
            delete phaserConfig.parent;
            delete phaserConfig.scale;

            window.phaserScaler = new PhaserCanvasScaler({
                parent: '#container',
                designWidth: config.width || 1200,
                designHeight: config.height || 800,
                scaleMode: 'cover', // fill pantalla (puede recortar)
                backgroundColor: '#000000',
                pixelArt: config.render.pixelart || false,
                phaserConfig: phaserConfig
            });

            // Aplicar estilos full cuando canvas exista
            waitForCanvasAndApply(window.phaserScaler.container, (canvas, container) => {
                applyFullScreenContainerStyles(container);
                applyFullScreenCanvasStyles(canvas, container);
                forceResizeForCanvas(container, canvas, window.phaserScaler.game);
            });

            // Escuchar evento para re-ajustar y actualizar localStorage
            if (window.phaserScaler && window.phaserScaler.container) {
                window.phaserScaler.container.addEventListener('phaser-canvas-scaled', (e) => {
                    try {
                        const { cssWidth, cssHeight } = e.detail || {};
                        if (cssWidth && cssHeight) {
                            localStorage.setItem('screenWidth', String(cssWidth));
                            localStorage.setItem('screenHeight', String(cssHeight));
                        } else {
                            localStorage.setItem('screenWidth', String(window.innerWidth));
                            localStorage.setItem('screenHeight', String(window.innerHeight));
                        }
                        const canvas = window.phaserScaler.canvas || (window.phaserScaler.container && window.phaserScaler.container.querySelector('canvas'));
                        forceResizeForCanvas(window.phaserScaler.container, canvas, window.phaserScaler.game);
                        // Forzar quitar márgenes inline persistentes
                        if (canvas) {
                            canvas.style.setProperty('margin', '0', 'important');
                            canvas.style.setProperty('margin-left', '0', 'important');
                            canvas.style.setProperty('margin-top', '0', 'important');
                            canvas.style.setProperty('transform', 'none', 'important');
                        }
                    } catch (err) { /* ignore */ }
                });
            }

            window.game = window.phaserScaler.game;
            window.gameRunning = true;

            // Quitar menú contextual cuando canvas exista
            waitForCanvasAndApply(window.phaserScaler.container, (canvas) => {
                canvas.addEventListener("contextmenu", (event) => { event.preventDefault(); });
            });

            console.log('Phaser initialized via PhaserCanvasScaler (no margins).');
            return;
        } catch (err) {
            console.warn('PhaserCanvasScaler failed, falling back to default Phaser.Game():', err);
        }
    }

    // Fallback Phaser nativo
    window.game = new Phaser.Game(config);
    window.gameRunning = true;

    const parentContainer = document.getElementById('container') || document.body;
    waitForCanvasAndApply(parentContainer, (canvas, container) => {
        applyFullScreenContainerStyles(container);
        applyFullScreenCanvasStyles(canvas, container);
        forceResizeForCanvas(container, canvas, window.game);
        canvas.addEventListener("contextmenu", (event) => { event.preventDefault(); });
        // Quitar cualquier margin inline que aparezca
        canvas.style.setProperty('margin', '0', 'important');
        canvas.style.setProperty('margin-left', '0', 'important');
        canvas.style.setProperty('margin-top', '0', 'important');
        canvas.style.setProperty('transform', 'none', 'important');
    });
}

// Forzar resize manual
function forceResizeGame() {
    const container = (window.phaserScaler && window.phaserScaler.container) ? window.phaserScaler.container : (document.getElementById('container') || document.body);
    const canvas = (window.phaserScaler && window.phaserScaler.canvas) ? window.phaserScaler.canvas : (window.game && window.game.canvas) ? window.game.canvas : (container.querySelector ? container.querySelector('canvas') : null);
    forceResizeForCanvas(container, canvas, window.game || (window.phaserScaler && window.phaserScaler.game));
}

// Mantener localStorage actualizado
window.addEventListener('resize', () => {
    try {
        localStorage.setItem('screenWidth', String(window.innerWidth));
        localStorage.setItem('screenHeight', String(window.innerHeight));
        forceResizeGame();
    } catch (e) { /* ignore */ }
});
