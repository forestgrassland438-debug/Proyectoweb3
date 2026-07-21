
/*!
 * ============================================================================
 * Grassland Forest © 2025 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 * 
 * GRASSLAND FOREST v13
 * Desarrollado y Publicado por: Jean Larreal
 * CONTACTO PARA PERMISOS:
 * Jean Larreal
 * Email: [killerhackcodeup@gmail.com]
 * Sitio Web: [grasslandforest.xyz]
 * 
 * VERSIÓN: v13.0.0-release
 * GENERADO: 19/20/2025
 * ============================================================================
 */


// lib/tileMonitor.js - MONITOR ULTRA-OPTIMIZADO
export class TileMonitor {
  constructor(tileManager, scene) {
    if (!tileManager || !scene) {
      console.error('❌ TileMonitor: tileManager o scene no proporcionados');
      return;
    }

    this.tileManager = tileManager;
    this.scene = scene;
    this.debugText = null;
    this.isVisible = true;
    this.isInitialized = false;
    this.performanceHistory = [];
    
    try {
      this.setupAdvancedDisplay();
      this.isInitialized = true;
      console.log('🎯 TileMonitor Ultra-Optimizado inicializado');
    } catch (error) {
      console.error('💥 ERROR inicializando TileMonitor Ultra-Optimizado:', error);
    }
  }

  setupAdvancedDisplay() {
    try {
      if (!this.scene || !this.scene.add) {
        console.error('❌ Scene no disponible para crear debug display');
        return;
      }

      // Crear texto de debug ultra-optimizado
      this.debugText = this.scene.add.text(10, 50, '', {
        font: 'bold 12px "Courier New", Monaco, monospace',
        fill: '#00ff88',
        backgroundColor: 'rgba(0,0,0,0.95)',
        padding: { x: 12, y: 8 },
        stroke: '#001100',
        strokeThickness: 3,
        lineSpacing: 1
      });
      
      if (this.debugText) {
        this.debugText.setScrollFactor(0);
        this.debugText.setDepth(10000);
        this.debugText.setName('tileMonitorDebugText');
        this.debugText.setAlpha(0.9);

        // Controles ultra-optimizados
        if (this.scene.input && this.scene.input.keyboard) {
          this.scene.input.keyboard.on('keydown-F1', () => {
            this.isVisible = !this.isVisible;
            this.debugText.setVisible(this.isVisible);
            console.log(`🎯 TileMonitor ${this.isVisible ? 'activado' : 'desactivado'}`);
          });

          this.scene.input.keyboard.on('keydown-F2', () => {
            this.logAdvancedPerformance();
          });

          this.scene.input.keyboard.on('keydown-F8', () => {
            this.toggleOptimization();
          });
        }

        console.log('✅ Display de debug ultra-optimizado configurado');
      }
    } catch (error) {
      console.error('💥 ERROR configurando TileMonitor display ultra-optimizado:', error);
    }
  }

  // FIX: el TileManager actual (lib/tileManager.js) usa la propiedad
  // `_destroyed` (no `isDestroyed`) y no implementa getMetrics(). Antes,
  // cada frame lanzaba TypeError (capturado) y llenaba la consola de errores.
  _managerDestroyed() {
    return !this.tileManager || this.tileManager.isDestroyed || this.tileManager._destroyed;
  }

  _getManagerMetrics() {
    if (!this.tileManager || typeof this.tileManager.getMetrics !== 'function') return null;
    return this.tileManager.getMetrics();
  }

  update() {
    try {
      if (!this.isInitialized || !this.isVisible || !this.debugText) return;
      if (this._managerDestroyed()) return;

      const metrics = this._getManagerMetrics();
      if (!metrics) return;

      // Actualizar historial de rendimiento
      this.updatePerformanceHistory(metrics);

      const debugInfo = [
        '🎯 TILE MANAGER ULTRA-OPTIMIZADO AAA',
        `📊 CHUNKS: ${metrics.loadedChunks} loaded | ${metrics.chunksRendered} rendered`,
        `🧩 TILES: ${metrics.loadedTiles} loaded | ${metrics.tilesRendered} rendered`,
        `🧠 MEM: ${metrics.memoryUsage} (Peak: ${metrics.memoryPeak})`,
        `🎮 FPS: ${metrics.currentFPS || 'N/A'} | Level: ${metrics.performanceLevel}`,
        `⚡ OPTIM: ${metrics.repaintsAvoided} repaints avoided | ${metrics.optimizationSavings} frames saved`,
        `📈 LOAD: ${metrics.loadSuccess} OK | ${metrics.loadErrors} errors`,
        `🛡️  SAFE: ${metrics.crashesPrevented} crashes | ${metrics.stableFrames} stable`,
        `🎚️  LOD: ${metrics.currentLOD} | Chunk: ${metrics.chunkSize}x`,
        `📍 DEPTH: Tiles=${metrics.tileDepth} | Player=${metrics.playerDepth}`,
        `🔄 MODE: ${metrics.useChunkSystem ? 'CHUNKS' : 'TILES'} | ${metrics.pixelPerfect ? 'PIXEL-PERFECT' : 'NORMAL'}`,
        `💾 POOL: ${metrics.spritePool} sprites | ${metrics.chunkPool} chunks`
      ].join('\n');

      this.debugText.setText(debugInfo);

      // Color dinámico basado en rendimiento
      this.updateDisplayColor(metrics);
    } catch (error) {
      console.error('💥 ERROR actualizando TileMonitor ultra-optimizado:', error);
    }
  }

  updatePerformanceHistory(metrics) {
    try {
      this.performanceHistory.push({
        timestamp: Date.now(),
        fps: metrics.currentFPS,
        memory: metrics.memoryUsage,
        loadedChunks: metrics.loadedChunks,
        loadedTiles: metrics.loadedTiles,
        tilesRendered: metrics.tilesRendered,
        repaintsAvoided: metrics.repaintsAvoided
      });

      // Mantener solo los últimos 30 frames para optimizar memoria
      if (this.performanceHistory.length > 30) {
        this.performanceHistory.shift();
      }
    } catch (error) {
      console.error('💥 ERROR actualizando historial de rendimiento:', error);
    }
  }

  updateDisplayColor(metrics) {
    try {
      if (!this.debugText) return;

      let color = '#00ff88'; // Verde - buen rendimiento
      
      if (metrics.currentFPS < 45) {
        color = '#ffff00'; // Amarillo - rendimiento medio
      }
      
      if (metrics.currentFPS < 30) {
        color = '#ff6600'; // Naranja - rendimiento bajo
      }
      
      if (metrics.currentFPS < 20) {
        color = '#ff0000'; // Rojo - rendimiento crítico
      }

      this.debugText.setColor(color);
    } catch (error) {
      console.error('💥 ERROR actualizando color de display:', error);
    }
  }

  logAdvancedPerformance() {
    try {
      if (this._managerDestroyed()) {
        console.warn('⚠️ TileManager no disponible para reporte avanzado');
        return;
      }

      const metrics = this._getManagerMetrics();
      if (!metrics) {
        console.warn('⚠️ El TileManager actual no expone getMetrics() — sin reporte');
        return;
      }

      console.group('📊 PERFORMANCE REPORT ULTRA-OPTIMIZADO AAA');
      
      console.log('🎯 MÉTRICAS PRINCIPALES:');
      console.table({
        'FPS Actual': metrics.currentFPS,
        'Nivel Rendimiento': metrics.performanceLevel,
        'Chunks Cargados': metrics.loadedChunks,
        'Chunks Renderizados': metrics.chunksRendered,
        'Tiles Cargados': metrics.loadedTiles,
        'Tiles Renderizados': metrics.tilesRendered,
        'Uso Memoria': metrics.memoryUsage,
        'Pico Memoria': metrics.memoryPeak,
        'Repintados Evitados': metrics.repaintsAvoided,
        'Frames Estables': metrics.stableFrames,
        'Pixel Perfect': metrics.pixelPerfect ? 'SÍ' : 'NO'
      });

      console.log('🔧 CONFIGURACIÓN:');
      console.table({
        'Sistema de Chunks': metrics.useChunkSystem ? 'ACTIVADO' : 'DESACTIVADO',
        'Tamaño Chunk': `${metrics.chunkSize}x${metrics.chunkSize}`,
        'LOD Actual': metrics.currentLOD,
        'Profundidad Tiles': metrics.tileDepth,
        'Profundidad Jugador': metrics.playerDepth
      });

      console.log('📈 ESTADÍSTICAS:');
      console.table({
        'Cargas Exitosas': metrics.loadSuccess,
        'Errores de Carga': metrics.loadErrors,
        'Reintentos': metrics.retryAttempts,
        'Hits Pool': metrics.poolHits,
        'Misses Pool': metrics.poolMisses,
        'Crashes Evitados': metrics.crashesPrevented,
        'Frames Optimizados': metrics.optimizationSavings
      });

      // Análisis del historial de rendimiento
      if (this.performanceHistory.length > 0) {
        console.log('📊 TENDENCIA DE RENDIMIENTO:');
        const recent = this.performanceHistory.slice(-5);
        const avgFPS = recent.reduce((sum, entry) => sum + (entry.fps || 0), 0) / recent.length;
        const avgTilesRendered = recent.reduce((sum, entry) => sum + (entry.tilesRendered || 0), 0) / recent.length;
        console.log(`- FPS promedio (últimos 5s): ${avgFPS.toFixed(1)}`);
        console.log(`- Tiles renderizados promedio: ${avgTilesRendered.toFixed(0)}`);
        console.log(`- Repintados evitados total: ${metrics.repaintsAvoided}`);
      }
      
      console.groupEnd();
    } catch (error) {
      console.error('💥 ERROR generando reporte de performance ultra-optimizado:', error);
    }
  }

  toggleOptimization() {
    try {
      if (this.tileManager) {
        this.tileManager.renderOptimizationEnabled = !this.tileManager.renderOptimizationEnabled;
        const status = this.tileManager.renderOptimizationEnabled ? 'ACTIVADA' : 'DESACTIVADA';
        console.log(`🔧 Optimización de renderizado ${status}`);
        
        // Feedback visual
        if (this.debugText) {
          this.debugText.setColor(this.tileManager.renderOptimizationEnabled ? '#00ff88' : '#ff6600');
          setTimeout(() => {
            const m = this._getManagerMetrics();
            if (m) this.updateDisplayColor(m);
          }, 1000);
        }
      }
    } catch (error) {
      console.error('💥 ERROR alternando optimización:', error);
    }
  }

  destroy() {
    try {
      if (this.debugText && this.debugText.destroy) {
        this.debugText.destroy();
      }
      this.isInitialized = false;
      this.performanceHistory = [];
      console.log('✅ TileMonitor Ultra-Optimizado destruído');
    } catch (error) {
      console.error('💥 ERROR destruyendo TileMonitor ultra-optimizado:', error);
    }
  }
}