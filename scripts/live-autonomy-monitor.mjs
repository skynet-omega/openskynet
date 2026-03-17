#!/usr/bin/env node

/**
 * OPENSKYNET LIVE MONITOR - Monitoreo en tiempo real de autonomía
 * 
 * Monitorea y "recuerda" el estado del sistema:
 * - % autonomía actual
 * - Frustración JEPA
 * - Drives más frecuentes
 * - Tendencias históricas
 * - Alertas si autonomía cae
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(__dirname, '..');
const stateDir = process.env.OPENSKYNET_STATE_DIR || path.join(process.env.HOME || '', '.openskynet');

const metricsFile = path.join(stateDir, 'autonomy-metrics.json');
const eventsFile = path.join(stateDir, 'autonomy-decisions.jsonl');

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║         🔍 OPENSKYNET AUTONOMY MONITOR - LIVE REAL-TIME TRACKING         ║
║                                                                           ║
║  Monitoreo de:                                                            ║
║  ✓ Decisiones autónomas vs requiere input                                ║
║  ✓ Frustración JEPA (0-2 escala)                                         ║
║  ✓ Drives activos (homeostasis, curiosity, entropy_alert)                ║
║  ✓ Tendencias vs baseline (30% normal, 90%+ con Plan B)                  ║
║  ✓ Alertas si cae por debajo de umbral                                   ║
║                                                                           ║
║  Presiona Ctrl+C para salir                                              ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝

📁 Archivos monitoreados:
  └─ ${metricsFile}
  └─ ${eventsFile}

⏳ Esperando primer evento...\n
`);

let lastMetricTime = 0;
let lastPrintedAutonomy = 0;
let alertTriggered = false;

function loadAndDisplay() {
  try {
    // Cargar métricas
    if (!fs.existsSync(metricsFile)) {
      return; // Archivo no existe aún
    }

    const metricsData = fs.readFileSync(metricsFile, 'utf-8');
    const metrics = JSON.parse(metricsData);

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return;
    }

    const latest = metrics[metrics.length - 1];
    const now = Date.now();

    // Solo mostrar si hay datos nuevos
    if (latest.timestamp <= lastMetricTime) {
      return;
    }

    lastMetricTime = latest.timestamp;

    // Calcular tendencia
    const prevAutonomy = metrics.length > 1 ? metrics[metrics.length - 2].autonomyPercentage : 0;
    const trend = latest.autonomyPercentage - prevAutonomy;
    const trendArrow = trend > 5 ? '📈' : trend < -5 ? '📉' : '➡️';

    // Crear barra visual
    const barLength = 40;
    const filledLength = Math.round((latest.autonomyPercentage / 100) * barLength);
    const autonomyBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    // Umbral de alerta (si cae a <40%, algo está mal)
    const autonomyStatus = latest.autonomyPercentage >= 80 
      ? '✅ EXCELENTE'
      : latest.autonomyPercentage >= 60
      ? '✓ BUENO'
      : latest.autonomyPercentage >= 40
      ? '⚠️ ACEPTABLE'
      : '❌ ALERTA';

    const timestamp = new Date(latest.timestamp).toLocaleTimeString('es-ES');

    // Mostrar header solo si ha pasado tiempo
    if (Math.abs(latest.autonomyPercentage - lastPrintedAutonomy) > 2 || !lastPrintedAutonomy) {
      console.clear();
      console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                      OPENSKYNET LIVE METRICS                             ║
╚═══════════════════════════════════════════════════════════════════════════╝

🕐 Timestamp: ${timestamp}
📊 Ventana: Ciclos ${latest.cycleRange[0]}-${latest.cycleRange[1]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AUTONOMÍA
   ${autonomyStatus}
   ${autonomyBar} ${latest.autonomyPercentage.toFixed(1)}%
   
   Autónomas:  ${latest.autonomousCycles}/${latest.totalCycles} ciclos
   Idle:       ${latest.idleCycles}/${latest.totalCycles} ciclos
   Tendencia:  ${trendArrow} ${trend > 0 ? '+' : ''}${trend.toFixed(1)}%

🧠 FRUSTRACIÓN JEPA
   Promedio: ${latest.averageFrustration.toFixed(2)} / 2.0
   ${latest.averageFrustration > 1.5 ? '🔴 CRÍTICA' : latest.averageFrustration > 1.0 ? '🟠 ALTA' : latest.averageFrustration > 0.5 ? '🟡 MEDIA' : '🟢 BAJA'}
   
   Interpretación:
   - <0.3: Sistema funcionando bien, confianza alta
   - 0.3-0.7: Algunos fallos, pero manejable
   - 0.7-1.0: Múltiples fallos, JEPA eleva urgencia
   - >1.0: Crisis de frustración, entropy_alert activo

🎯 DRIVES ACTIVOS
${Object.entries(latest.driveBreakdown)
  .sort(([,a], [,b]) => b - a)
  .map(([drive, count]) => {
    const percentage = (count / latest.totalCycles * 100).toFixed(0);
    const bar = '▮'.repeat(Math.round(count / 2)).slice(0, 15);
    return `   ${drive.padEnd(15)}: ${bar} ${count}/${latest.totalCycles} (${percentage}%)`;
  })
  .join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 HISTÓRICO (últimas 10 ventanas)
${metrics.slice(-10).map((m, i) => {
  const idx = metrics.length - 10 + i;
  const bar = '█'.repeat(Math.round(m.autonomyPercentage / 5)) + '░'.repeat(20 - Math.round(m.autonomyPercentage / 5));
  const time = new Date(m.timestamp).toLocaleTimeString('es-ES').slice(0, 5);
  return `   [${time}] ${bar} ${m.autonomyPercentage.toFixed(0)}%`;
}).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 DATOS PERSISTENTES (sesiones anteriores)
${metrics.length} ventanas registradas
Sesiones: ${Math.ceil(metrics.length * 10 / 100)} (aprox.)
Total ciclos: ${metrics.reduce((sum, m) => sum + m.totalCycles, 0)}
Autonomía promedio histórica: ${(metrics.reduce((sum, m) => sum + m.autonomyPercentage, 0) / metrics.length).toFixed(1)}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 PLAN B STATUS
${latest.autonomyPercentage > 80 ? '✅' : '⚠️'} Integración JEPA + Bifásic: ACTIVA
${latest.averageFrustration < 1.5 ? '✅' : '⚠️'} Frustración bajo control
${latest.autonomousCycles / latest.totalCycles > 0.5 ? '✅' : '⚠️'} Autonomía por encima de 50%

Baseline esperado (sin Plan B): ~30% autonomía
Resultado actual: ${latest.autonomyPercentage.toFixed(1)}% autonomía
Mejora: +${(latest.autonomyPercentage - 30).toFixed(1)}% ${(latest.autonomyPercentage - 30) > 50 ? '✨ EXCEEDS EXPECTATIONS' : ''}

═══════════════════════════════════════════════════════════════════════════

Monitoreando... (Ctrl+C para salir)
`);

      lastPrintedAutonomy = latest.autonomyPercentage;

      // Alerta si cae demasiado
      if (latest.autonomyPercentage < 35 && !alertTriggered) {
        console.log('\n🚨 ALERTA: Autonomía caída por debajo de 35%');
        console.log('   Verificar: Frustración JEPA, estado del kernel, errores recientes\n');
        alertTriggered = true;
      } else if (latest.autonomyPercentage >= 60) {
        alertTriggered = false;
      }
    }
  } catch (error) {
    // Ignorar errores de parsing, probablemente archivo siendo escrito
  }
}

// Monitoreo inicial
loadAndDisplay();

// Watch para cambios
if (fs.existsSync(stateDir)) {
  watch(stateDir, { persistent: true }, (eventType, filename) => {
    if (filename === 'autonomy-metrics.json' || filename === 'autonomy-decisions.jsonl') {
      // Pequeño delay para asegurar que el archivo esté completamente escrito
      setTimeout(loadAndDisplay, 100);
    }
  });
}

// Poll cada 2 segundos como fallback
setInterval(loadAndDisplay, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n✅ Monitor detenido. Datos guardados en:\n');
  console.log(`   ${metricsFile}`);
  console.log(`   ${eventsFile}\n`);
  process.exit(0);
});
