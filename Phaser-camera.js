/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * GRASSLAND FOREST v13
 * VERSIÓN: v13.2.0-fixed
 * GENERADO: 12/19/2025
 * ============================================================================
 */

class RulerOverlay {
  constructor(scene, player, opts = {}) {
    try {
      if (!scene)  throw new Error('RulerOverlay: scene is required');
      if (!player) throw new Error('RulerOverlay: player is required');

      this.scene  = scene;
      this.player = player;

      const defaults = {
        radiusX:                12,
        radiusY:                10,
        unitPx:                 32,
        maxNumbers:             1000,
        density:                1,
        showNumbers:            true,
        showTicks:              true,
        showCenter:             true,
        tickLength:             8,
        majorTickLength:        14,
        fontSize:               12,
        fontFamily:             'Arial',
        fontColor:              '#ffffff',
        lineColor:              0x00aaff,
        lineAlpha:              0.9,
        bgAlpha:                0.0,
        updateIntervalMs:       200,
        snapToPixels:           true,
        cameraFollowLerpX:      0.1,
        cameraFollowLerpY:      0.1,
        zoomTweenDuration:      500,
        zoomMin:                1,
        zoomMax:                8,
        zoomStep:               1,
        minPxPerUnitForNumbers: 8,
        majorTickInterval:      5,
        touchToggle:            false,
        autoAdjustZoom:         false,
        worldBounds:            null,
        deadZone:               { width: 100, height: 80 },
        preloadComplete:        false,
        pixelArt:               true,
        initialZoom:            2,
        onError:                null,
      };

      this.opt = Object.assign({}, defaults, opts);

      if (this.opt.pixelArt) {
        this.opt.snapToPixels = true;
        this.opt.zoomStep     = Math.max(1, Math.floor(this.opt.zoomStep));
      }

      this.opt.radiusX    = Math.max(8,   Math.min(this.opt.radiusX,    this.opt.maxNumbers));
      this.opt.radiusY    = Math.max(6,   Math.min(this.opt.radiusY,    this.opt.maxNumbers));
      this.opt.density    = Math.max(1,   Math.floor(this.opt.density));
      this.opt.maxNumbers = Math.max(100, Math.floor(this.opt.maxNumbers));

      this.visible          = true;
      this._paused          = false;
      this._destroyed       = false; // MEJ#1: flag de destrucción
      this._lastPlayerUnit  = { x: null, y: null };
      this._lastUpdate      = 0;
      this._needsRedraw     = false;
      this._isManualZoom    = false;
      this._mapPreloaded    = this.opt.preloadComplete;
      this._initialSetupDone = false;
      this._previousZoom    = this.opt.initialZoom; // MEJ#3: zoom anterior

      this.rt           = null;
      this.g            = null;
      this.centerMarker = null;
      this._textPool    = [];
      this._usedText    = [];

      this.formulaFn = (n) => String(n);
      this._zoomTween = null;
      this._initDelayedCall = null; // FIX #3: referencia al delayed call

      this._onSceneUpdate = this._onSceneUpdate.bind(this);
      this._onResize      = this._onResize.bind(this);

      this._setupCameraImmediately();

      // FIX #3: guardar referencia para cancelar si destroy() se llama antes de 100ms
      this._initDelayedCall = this.scene.time.delayedCall(100, () => {
        if (this._destroyed) return;
        this._initializeGraphics();
        this._forceRedraw();
      });

    } catch (err) {
      this._handleError(err);
    }
  }

  // ─── Configuración inmediata de cámara ───────────────────────────────────

  _setupCameraImmediately() {
    try {
      const cam = this.scene.cameras.main;
      if (!cam) return;

      cam.roundPixels = this.opt.pixelArt;
      cam.setZoom(this.opt.initialZoom);

      if (this.opt.worldBounds) {
        cam.setBounds(
          this.opt.worldBounds.x, this.opt.worldBounds.y,
          this.opt.worldBounds.width, this.opt.worldBounds.height
        );
      }

      cam.setDeadzone(this.opt.deadZone.width, this.opt.deadZone.height);
      cam.startFollow(this.player, false, this.opt.cameraFollowLerpX, this.opt.cameraFollowLerpY);

      console.log('🎮 Cámara configurada para pixel art');
    } catch (err) {
      this._handleError(err);
    }
  }

  // ─── Inicialización diferida de gráficos ─────────────────────────────────

  _initializeGraphics() {
    try {
      // FIX WARN#1: usar scale.width/height para elementos HUD, no cam.width
      const w = this.scene.scale.width;
      const h = this.scene.scale.height;

      this.rt = this.scene.add.renderTexture(0, 0, w, h)
        .setDepth(9999)
        .setScrollFactor(0)
        .setAlpha(0.95);

      this.g = this.scene.add.graphics()
        .setDepth(9998)
        .setScrollFactor(0);

      this.centerMarker = this.scene.add.circle(w / 2, h / 2, 3, 0xff4444, 0.8)
        .setDepth(10000)
        .setScrollFactor(0);
      this.centerMarker.setVisible(this.opt.showCenter && this.visible);

      this.scene.events.on('update', this._onSceneUpdate);
      this.scene.scale.on('resize',  this._onResize);

      this._initialSetupDone = true;
      console.log('🎨 Gráficos del RulerOverlay inicializados');
    } catch (err) {
      this._handleError(err);
    }
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  markPreloadComplete() {
    this._mapPreloaded = true;
    this._forceRedraw();
    console.log('🗺️ Precarga completada — RulerOverlay listo');
  }

  show() {
    try {
      if (this.visible) return;
      this.visible = true;
      if (this.rt) this.rt.setVisible(true);
      if (this.centerMarker) this.centerMarker.setVisible(this.opt.showCenter);
      this._forceRedraw();
    } catch (e) { this._handleError(e); }
  }

  hide() {
    try {
      if (!this.visible) return;
      this.visible = false;
      if (this.rt) this.rt.setVisible(false);
      if (this.centerMarker) this.centerMarker.setVisible(false);
    } catch (e) { this._handleError(e); }
  }

  toggle()      { try { this.visible ? this.hide() : this.show(); } catch (e) { this._handleError(e); } }
  showRule()    { this.show(); }
  hideRule()    { this.hide(); }

  showCenter() {
    try {
      this.opt.showCenter = true;
      if (this.centerMarker) this.centerMarker.setVisible(this.visible);
    } catch (e) { this._handleError(e); }
  }

  hideCenter() {
    try {
      this.opt.showCenter = false;
      if (this.centerMarker) this.centerMarker.setVisible(false);
    } catch (e) { this._handleError(e); }
  }

  toggleCenter() { this.opt.showCenter ? this.hideCenter() : this.showCenter(); }

  setFormula(fn) {
    try {
      if (typeof fn !== 'function') throw new Error('setFormula: se esperaba una función');
      this.formulaFn = fn;
      this._forceRedraw();
    } catch (e) { this._handleError(e); }
  }

  setDensity(n) {
    try { this.opt.density = Math.max(1, Math.floor(n)); this._forceRedraw(); }
    catch (e) { this._handleError(e); }
  }

  setRadius(rx, ry) {
    try {
      this.opt.radiusX = Math.min(Math.max(8, Math.floor(rx)), this.opt.maxNumbers);
      this.opt.radiusY = Math.min(Math.max(6, Math.floor(ry)), this.opt.maxNumbers);
      this._forceRedraw();
    } catch (e) { this._handleError(e); }
  }

  setUnitPx(px) {
    try { this.opt.unitPx = Math.max(16, px); this._forceRedraw(); }
    catch (e) { this._handleError(e); }
  }

  setShowCenter(val) {
    try {
      this.opt.showCenter = !!val;
      if (this.centerMarker) this.centerMarker.setVisible(this.opt.showCenter && this.visible);
    } catch (e) { this._handleError(e); }
  }

  pause()  { try { this._paused = true;  } catch (e) { this._handleError(e); } }
  resume() { try { this._paused = false; this._forceRedraw(); } catch (e) { this._handleError(e); } }

  // FIX #4: usar API pública startFollow en lugar de cam._follow privado
  setFollowLerp(xLerp, yLerp) {
    try {
      this.opt.cameraFollowLerpX = Math.max(0.05, Math.min(0.3, xLerp));
      this.opt.cameraFollowLerpY = Math.max(0.05, Math.min(0.3, yLerp));
      const cam = this.scene.cameras.main;
      if (cam) {
        cam.startFollow(this.player, false, this.opt.cameraFollowLerpX, this.opt.cameraFollowLerpY);
      }
    } catch (e) { this._handleError(e); }
  }

  // ─── Zoom ─────────────────────────────────────────────────────────────────

  zoomTo(zoomTarget, duration = null) {
    try {
      const cam = this.scene.cameras.main;
      if (!cam) return;

      // MEJ#3: guardar zoom previo
      this._previousZoom = cam.zoom;

      let target = this.opt.pixelArt
        ? Math.round(zoomTarget / this.opt.zoomStep) * this.opt.zoomStep
        : zoomTarget;
      target = Phaser.Math.Clamp(target, this.opt.zoomMin, this.opt.zoomMax);

      if (Math.abs(cam.zoom - target) < 0.01) return;

      this._isManualZoom = true;
      duration = duration === null ? this.opt.zoomTweenDuration : Math.max(300, duration);

      if (this._zoomTween) { this._zoomTween.stop(); this._zoomTween = null; }

      this._zoomTween = this.scene.tweens.add({
        targets: cam,
        zoom: target,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this._zoomTween = null;
          this.scene.time.delayedCall(50, () => { if (!this._destroyed) this._forceRedraw(); });
        }
      });
    } catch (e) { this._handleError(e); }
  }

  zoomBy(delta, duration = null) {
    try {
      const cam = this.scene.cameras.main;
      if (!cam) return;
      this.zoomTo(Phaser.Math.Clamp(cam.zoom + delta, this.opt.zoomMin, this.opt.zoomMax), duration);
    } catch (e) { this._handleError(e); }
  }

  zoomIn(duration = null)  { try { this.zoomBy( this.opt.zoomStep, duration); } catch (e) { this._handleError(e); } }
  zoomOut(duration = null) { try { this.zoomBy(-this.opt.zoomStep, duration); } catch (e) { this._handleError(e); } }

  // MEJ#3: volver al zoom anterior
  zoomBack(duration = null) {
    try { this.zoomTo(this._previousZoom, duration); }
    catch (e) { this._handleError(e); }
  }

  setAutoZoom(enabled) {
    this.opt.autoAdjustZoom = !!enabled;
    if (!enabled) this._isManualZoom = false;
  }

  forceRedraw() { try { this._forceRedraw(); } catch (e) { this._handleError(e); } }

  // ─── Destrucción ──────────────────────────────────────────────────────────

  destroy() {
    try {
      this._destroyed = true; // MEJ#1: marcar primero

      // FIX #3: cancelar el delayed call si aún no se disparó
      if (this._initDelayedCall) {
        try { this._initDelayedCall.remove(); } catch (e) {}
        this._initDelayedCall = null;
      }

      if (this.scene) {
        this.scene.events.off('update', this._onSceneUpdate);
        this.scene.scale.off('resize',  this._onResize);
      }

      if (this._zoomTween) { this._zoomTween.stop(); this._zoomTween = null; }

      if (this.rt)           this.rt.destroy();
      if (this.g)            this.g.destroy();
      if (this.centerMarker) this.centerMarker.destroy();

      // FIX #2: destruir también los textos en _usedText (no solo los del pool)
      for (const t of this._usedText) {
        if (t && t.destroy) t.destroy();
      }
      for (const t of this._textPool) {
        if (t && t.destroy) t.destroy();
      }
      this._usedText.length = 0;
      this._textPool.length = 0;

    } catch (e) { this._handleError(e); }
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  _resizeRT(w, h) {
    try {
      if (!this.rt) return;
      const W = Math.max(1, Math.round(w));
      const H = Math.max(1, Math.round(h));
      if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
      if (this.centerMarker) this.centerMarker.setPosition(W / 2, H / 2);
      this._forceRedraw();
    } catch (e) { this._handleError(e); }
  }

  _forceRedraw() { this._needsRedraw = true; }

  _onResize(gameSize) {
    try {
      const width  = gameSize?.width  ?? this.scene.scale.width;
      const height = gameSize?.height ?? this.scene.scale.height;
      this._resizeRT(width, height);
    } catch (e) { this._handleError(e); }
  }

  _onSceneUpdate(time) {
    try {
      // MEJ#1: guard de instancia destruida
      if (this._destroyed || !this._initialSetupDone || this._paused || !this.visible) return;

      // FIX WARN#3: actualizar _lastUpdate siempre, incluso cuando se ignora el frame,
      // para evitar procesar un redibujado justo cuando los recursos son más escasos
      const elapsed = time - this._lastUpdate;
      if (elapsed < this.opt.updateIntervalMs) return;
      this._lastUpdate = time;

      const playerUnitX = Math.round(this.player.x / this.opt.unitPx);
      const playerUnitY = Math.round(this.player.y / this.opt.unitPx);
      const playerMoved = (playerUnitX !== this._lastPlayerUnit.x ||
                           playerUnitY !== this._lastPlayerUnit.y);

      if ((playerMoved || this._needsRedraw) && this._mapPreloaded) {
        this._lastPlayerUnit.x = playerUnitX;
        this._lastPlayerUnit.y = playerUnitY;
        this._needsRedraw = false;
        this._drawOverlayOptimized(playerUnitX, playerUnitY);
      }
    } catch (err) {
      this._handleError(err);
    }
  }

  _drawOverlayOptimized(centerUnitX, centerUnitY) {
    try {
      if (!this.g || !this.rt) return;

      const scene = this.scene;
      const cam   = scene.cameras.main;
      if (!cam) return;

      // FIX WARN#1: dimensiones del canvas de juego, no de la cámara
      const w = scene.scale.width;
      const h = scene.scale.height;

      this.g.clear();
      this.rt.clear();

      const unitPxOnScreen = this.opt.unitPx * (cam.zoom || 1);

      if (this.opt.bgAlpha > 0) {
        this.g.fillStyle(0x000000, this.opt.bgAlpha);
        this.g.fillRect(0, 0, w, h);
      }

      if (this.opt.showTicks) {
        this.g.lineStyle(1.5, this.opt.lineColor, this.opt.lineAlpha);
        this.g.beginPath(); this.g.moveTo(0, h / 2); this.g.lineTo(w, h / 2); this.g.strokePath();
        this.g.beginPath(); this.g.moveTo(w / 2, 0); this.g.lineTo(w / 2, h); this.g.strokePath();
      }

      let density = Math.max(1, this.opt.density);
      if (unitPxOnScreen < this.opt.minPxPerUnitForNumbers) {
        density = Math.max(density, Math.ceil(this.opt.minPxPerUnitForNumbers / Math.max(1, unitPxOnScreen)));
      }

      const maxX = Math.min(this.opt.radiusX, this.opt.maxNumbers);
      const maxY = Math.min(this.opt.radiusY, this.opt.maxNumbers);

      if (this.opt.showTicks) {
        // Eje X
        for (let dx = -maxX; dx <= maxX; dx += density) {
          const px = Math.round((w / 2) + dx * unitPxOnScreen);
          if (px < -150 || px > w + 150) continue;

          const isMajor = (this.opt.majorTickInterval > 0) &&
                          ((Math.abs(dx) % this.opt.majorTickInterval) === 0);
          const tlen = isMajor ? this.opt.majorTickLength : this.opt.tickLength;

          this.g.lineStyle(1, this.opt.lineColor, this.opt.lineAlpha);
          this.g.beginPath();
          this.g.moveTo(px, h / 2 - tlen);
          this.g.lineTo(px, h / 2 + tlen);
          this.g.strokePath();

          if (this.opt.showNumbers && unitPxOnScreen >= this.opt.minPxPerUnitForNumbers) {
            const label = this._safeFormula(centerUnitX + dx, 'x');
            const txt   = this._getText(label, px, h / 2 + tlen + 12, 0.5, 0);
            // FIX #1: dibujar en la posición real del texto, no en (0,0)
            if (txt) this.rt.draw(txt, txt.x, txt.y);
          }
        }

        // Eje Y
        for (let dy = -maxY; dy <= maxY; dy += density) {
          const py = Math.round((h / 2) + dy * unitPxOnScreen);
          if (py < -150 || py > h + 150) continue;

          const isMajor = (this.opt.majorTickInterval > 0) &&
                          ((Math.abs(dy) % this.opt.majorTickInterval) === 0);
          const tlen = isMajor ? this.opt.majorTickLength : this.opt.tickLength;

          this.g.lineStyle(1, this.opt.lineColor, this.opt.lineAlpha);
          this.g.beginPath();
          this.g.moveTo(w / 2 - tlen, py);
          this.g.lineTo(w / 2 + tlen, py);
          this.g.strokePath();

          if (this.opt.showNumbers && unitPxOnScreen >= this.opt.minPxPerUnitForNumbers) {
            const label = this._safeFormula(centerUnitY + dy, 'y');
            const txt   = this._getText(label, w / 2 + tlen + 12, py, 0, 0.5);
            // FIX #1: dibujar en la posición real del texto
            if (txt) this.rt.draw(txt, txt.x, txt.y);
          }
        }
      }

      this.rt.draw(this.g, 0, 0);
      this._releaseTextPool();

      if (this.rt)           this.rt.setVisible(this.visible);
      if (this.centerMarker) this.centerMarker.setVisible(this.opt.showCenter && this.visible);

    } catch (err) {
      this._handleError(err);
    }
  }

  _getText(label, x, y, originX = 0, originY = 0.5) {
    try {
      let t = this._textPool.pop();
      if (!t) {
        t = this.scene.add.text(0, 0, label, {
          fontFamily: this.opt.fontFamily,
          fontSize:   this.opt.fontSize + 'px',
          color:      this.opt.fontColor,
          resolution: this.opt.pixelArt ? 1 : 2
        }).setDepth(10002).setScrollFactor(0);
      }
      t.setText(label);
      t.setPosition(Math.round(x), Math.round(y));
      t.setOrigin(originX, originY);
      // FIX WARN#2: mantener siempre invisible — la RT lo dibuja igualmente
      t.setVisible(false);
      this._usedText.push(t);
      return t;
    } catch (err) {
      this._handleError(err);
      return null;
    }
  }

  _releaseTextPool() {
    try {
      while (this._usedText.length) {
        const t = this._usedText.pop();
        this._textPool.push(t);
      }
    } catch (err) {
      this._handleError(err);
    }
  }

  _safeFormula(n, axis) {
    try {
      // SEC: validar que el resultado sea string/número para no ejecutar código arbitrario
      const result = this.formulaFn(n, axis);
      const str    = String(result);
      // Limitar longitud para prevenir abuso
      return str.slice(0, 20);
    } catch (e) {
      this._handleError(e);
      return String(n);
    }
  }

  _handleError(err) {
    try {
      console.error('RulerOverlay Error:', err);
      if (this.opt && typeof this.opt.onError === 'function') {
        try { this.opt.onError(err); } catch (e) { console.error('RulerOverlay.onError threw:', e); }
      }
    } catch (e) {
      console.error('RulerOverlay _handleError failure:', e);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = RulerOverlay;
