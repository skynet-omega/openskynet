#!/usr/bin/env node

/**
 * AUTONOMY HISTORY ANALYZER - Analizar el histórico de decisiones
 * 
 * Lee los datos acumulados y genera un reporte que "recuerda"
 * qué pasó en sesiones anteriores, patrones detectados, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(__dirname, '..');
const stateDir = process.env.OPENSKYNET_STATE_DIR || path.join(process.env.HOME || '', '.openskynet');

const metricsFile = path.join(stateDir, 'autonomy-metrics.json');
const eventsFile = path.join(stateDir, 'autonomy-decisions.jsonl');

function analyzeHistory() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║        📚 AUTONOMY HISTORY ANALYZER - Recordando sesiones previas         ║
║                                                                           ║
║  Analiza el histórico completo:                                          ║
║  ✓ Sesiones anteriores                                                   ║
║  ✓ Patrones de comportamiento                                            ║
║  ✓ Mejoras a lo largo del tiempo                                         ║
║  ✓ Correlaciones frustración-autonomía                                   ║
║  ✓ Predicciones basadas en tendencias                                    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);

  // Cargar métricas
  if (!fs.existsSync(metricsFile)) {
    console.log('\n❌ No hay datos históricos. Ejecuta OpenSkyNet con Plan B primero.\n');
    return;
  }

  const metricsData = fs.readFileSync(metricsFile, 'utf-8');
  const metrics = JSON.parse(metricsData);

  if (!Array.isArray(metrics) || metrics.length === 0) {
    console.log('\n❌ Archivo de métricas vacío.\n');
    return;
  }

  // Análisis de sesiones
  console.log('\n📊 SESIONES RECORDADAS\n');
  
  const sessions = [];
  let currentSession = [];
  let lastTimestamp = 0;
  const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutos entre sesiones

  metrics.forEach((metric, idx) => {
    if (lastTimestamp && metric.timestamp - lastTimestamp > SESSION_TIMEOUT) {
      // Nueva sesión
      if (currentSession.length > 0) {
        sessions.push(currentSession);
      }
      currentSession = [metric];
    } else {
      currentSession.push(metric);
    }
    lastTimestamp = metric.timestamp;
  });

  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  sessions.forEach((session, sessionIdx) => {
    const start = new Date(session[0].timestamp);
    const end = new Date(session[session.length - 1].timestamp);
    const duration = (end - start) / 1000;

    const autonomies = session.map(m => m.autonomyPercentage);
    const avgAutonomy = autonomies.reduce((a, b) => a + b, 0) / autonomies.length;
    const maxAutonomy = Math.max(...autonomies);
    const minAutonomy = Math.min(...autonomies);
    const trend = autonomies[autonomies.length - 1] - autonomies[0];

    const totalCycles = session.reduce((sum, m) => sum + m.totalCycles, 0);
    const avgFrustration = session.reduce((sum, m) => sum + m.averageFrustration, 0) / session.length;

    console.log(`Session ${sessionIdx + 1}:`);
    console.log(`  ⏱️  ${start.toLocaleString('es-ES')} - ${end.toLocaleString('es-ES')}`);
    console.log(`  ⏲️  Duración: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`);
    console.log(`  📈 Autonomía: ${avgAutonomy.toFixed(1)}% (min: ${minAutonomy.toFixed(1)}%, max: ${maxAutonomy.toFixed(1)}%)`);
    console.log(`  📊 Tendencia: ${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`);
    console.log(`  👁️  Frustración: ${avgFrustration.toFixed(2)}/2.0`);
    console.log(`  🔄 Total ciclos: ${totalCycles}`);
    console.log();
  });

  // Estadísticas globales
  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
  console.log('🎯 ESTADÍSTICAS GLOBALES\n');

  const allAutonomies = metrics.map(m => m.autonomyPercentage);
  const avgGlobal = allAutonomies.reduce((a, b) => a + b, 0) / allAutonomies.length;
  const maxGlobal = Math.max(...allAutonomies);
  const minGlobal = Math.min(...allAutonomies);
  const totalCycles = metrics.reduce((sum, m) => sum + m.totalCycles, 0);
  const overallTrend = allAutonomies[allAutonomies.length - 1] - allAutonomies[0];

  console.log(`Total de ventanas: ${metrics.length}`);
  console.log(`Total de ciclos: ${totalCycles}`);
  console.log(`Sessions: ${sessions.length}`);
  console.log(`Duración total: ${Math.floor((metrics[metrics.length - 1].timestamp - metrics[0].timestamp) / 1000 / 60)} minutos\n`);

  console.log(`Autonomía promedio: ${avgGlobal.toFixed(1)}%`);
  console.log(`Autonomía máxima: ${maxGlobal.toFixed(1)}%`);
  console.log(`Autonomía mínima: ${minGlobal.toFixed(1)}%`);
  console.log(`Tendencia general: ${overallTrend >= 0 ? '+' : ''}${overallTrend.toFixed(1)}%\n`);

  // Patrones
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  console.log('🔍 PATRONES DETECTADOS\n');

  const highFrustration = metrics.filter(m => m.averageFrustration > 1.0);
  const lowFrustration = metrics.filter(m => m.averageFrustration < 0.5);
  const mediumFrustration = metrics.filter(m => m.averageFrustration >= 0.5 && m.averageFrustration <= 1.0);

  console.log('Autonomía por nivel de frustración:');
  console.log(`  Baja frustracion (<0.5):  ${lowFrustration.length > 0 ? (lowFrustration.reduce((s, m) => s + m.autonomyPercentage, 0) / lowFrustration.length).toFixed(1) : 'N/A'}% (${lowFrustration.length} ventanas)`);
  console.log(`  Media frustración (0.5-1.0): ${mediumFrustration.length > 0 ? (mediumFrustration.reduce((s, m) => s + m.autonomyPercentage, 0) / mediumFrustration.length).toFixed(1) : 'N/A'}% (${mediumFrustration.length} ventanas)`);
  console.log(`  Alta frustración (>1.0): ${highFrustration.length > 0 ? (highFrustration.reduce((s, m) => s + m.autonomyPercentage, 0) / highFrustration.length).toFixed(1) : 'N/A'}% (${highFrustration.length} ventanas)\n`);

  // Mejoría desde el baseline
  const baseline = 30; // Baseline sin Plan B
  const improvement = avgGlobal - baseline;

  console.log(`Comparación con baseline (30% sin Plan B):`);
  console.log(`  Mejora promedio: +${improvement.toFixed(1)}%`);
  console.log(`  Multiplicador: ${(avgGlobal / baseline).toFixed(1)}x`);
  console.log(`  Status: ${improvement > 50 ? '✨ EXCEEDS EXPECTATIONS' : improvement > 30 ? '✅ EXCEEDS TARGET' : improvement > 0 ? '✓ POSITIVE' : '❌ NEEDS ATTENTION'}\n`);

  // Predicción
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  console.log('🔮 PREDICCIÓN BASADA EN TENDENCIAS\n');

  if (allAutonomies.length >= 5) {
    // Linear trend
    const recentAutonomies = allAutonomies.slice(-10);
    const recentAvg = recentAutonomies.reduce((a, b) => a + b, 0) / recentAutonomies.length;
    const oldest = allAutonomies[0];

    if (recentAvg > oldest) {
      console.log(`✅ Sistema mejorando consistentemente`);
      console.log(`   Tasa de mejora: ${((recentAvg - oldest) / metrics.length).toFixed(2)}% por ventana`);
      const predictedIn10 = recentAvg + ((recentAvg - oldest) / metrics.length) * 10;
      console.log(`   Predicción (10 ventanas): ${Math.min(100, predictedIn10).toFixed(1)}%`);
    } else if (recentAvg < oldest) {
      console.log(`⚠️  Sistema degradándose`);
      console.log(`   Tasa de degradación: ${((oldest - recentAvg) / metrics.length).toFixed(2)}% por ventana`);
      console.log(`   Revisar: Frustración JEPA, parámetros de drives`);
    } else {
      console.log(`➡️  Sistema estable`);
      console.log(`   Autonomía se mantiene en ~${recentAvg.toFixed(1)}%`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
  console.log('💾 DATOS DISPONIBLES\n');
  console.log(`Métricas: ${metricsFile}`);
  console.log(`Eventos: ${eventsFile}`);
  console.log('\nPara monitoreo en vivo:');
  console.log('  $ node scripts/live-autonomy-monitor.mjs\n');
}

analyzeHistory();
