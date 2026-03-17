#!/usr/bin/env node

/**
 * DEMO: Simulación de OpenSkyNet con Plan B
 * 
 * Genera datos sintéticos del logger para demostrar
 * cómo "recuerda" y registra las decisiones en tiempo real
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(__dirname, '..');
const demoDir = path.join(workspaceRoot, '.demo-openskynet');

// Crear directorio demo
if (!fs.existsSync(demoDir)) {
  fs.mkdirSync(demoDir, { recursive: true });
}

const metricsFile = path.join(demoDir, 'autonomy-metrics.json');
const eventsFile = path.join(demoDir, 'autonomy-decisions.jsonl');

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║  🎬 SIMULACIÓN: OpenSkyNet con Plan B en acción                          ║
║                                                                           ║
║  Este script simula que OpenSkyNet está ejecutándose con JEPA            ║
║  y registra decisiones autónomas en tiempo real.                         ║
║                                                                           ║
║  Verás:                                                                   ║
║  ✓ 3 "sesiones" de ejemplo (Discovery, Struggle, Recovery)              ║
║  ✓ Decisiones autónomas simuladas                                        ║
║  ✓ Frustración JEPA variando                                             ║
║  ✓ Sistema "recordando" el histórico                                     ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

// Generar datos demo
function generateDemoData() {
  console.log('\n⏳ Generando datos de simulación...\n');

  const allMetrics = [];
  let cycleNumber = 0;

  // Phase 1: Discovery (mejora inicial)
  console.log('  📍 Phase 1: Discovery (mejora inicial)');
  for (let i = 0; i < 5; i++) {
    const autonomyPercentage = 50 + Math.random() * 30; // 50-80%
    const frustration = 0.3 + Math.random() * 0.4; // 0.3-0.7 (baja)
    
    const metric = {
      timestamp: Date.now() - (5 - i) * 60000, // -5 a 0 minutos
      cycleRange: [cycleNumber, cycleNumber + 9],
      totalCycles: 10,
      autonomousCycles: Math.round(autonomyPercentage / 10),
      idleCycles: 10 - Math.round(autonomyPercentage / 10),
      autonomyPercentage,
      averageFrustration: frustration,
      driveBreakdown: {
        homeostasis: 4 + Math.floor(Math.random() * 3),
        curiosity: 2 + Math.floor(Math.random() * 2),
        entropy_alert: Math.floor(Math.random() * 2),
        idle: 10 - Math.round(autonomyPercentage / 10)
      }
    };
    allMetrics.push(metric);
    cycleNumber += 10;
  }

  // Phase 2: Struggle (frustración sube, autonomía se mantiene)
  console.log('  📍 Phase 2: Struggle (frustración sube, sistema responde)');
  for (let i = 0; i < 5; i++) {
    const autonomyPercentage = 75 + Math.random() * 25; // 75-100% (JEPA boost)
    const frustration = 0.8 + Math.random() * 0.7; // 0.8-1.5 (media-alta)
    
    const metric = {
      timestamp: Date.now() - (5 - i - 5) * 60000, // -10 a -5 minutos
      cycleRange: [cycleNumber, cycleNumber + 9],
      totalCycles: 10,
      autonomousCycles: Math.round(autonomyPercentage / 10),
      idleCycles: 10 - Math.round(autonomyPercentage / 10),
      autonomyPercentage,
      averageFrustration: frustration,
      driveBreakdown: {
        homeostasis: 3 + Math.floor(Math.random() * 2),
        curiosity: 3 + Math.floor(Math.random() * 2),
        entropy_alert: 1 + Math.floor(Math.random() * 2),
        idle: 10 - Math.round(autonomyPercentage / 10)
      }
    };
    allMetrics.push(metric);
    cycleNumber += 10;
  }

  // Phase 3: Recovery (frustración baja, sistemas vuelven a normal)
  console.log('  📍 Phase 3: Recovery (frustración desciende, estabilización)');
  for (let i = 0; i < 5; i++) {
    const autonomyPercentage = 80 + Math.random() * 15; // 80-95%
    const frustration = 0.5 + Math.random() * 0.3; // 0.5-0.8
    
    const metric = {
      timestamp: Date.now() - i * 60000, // últimos 5 minutos
      cycleRange: [cycleNumber, cycleNumber + 9],
      totalCycles: 10,
      autonomousCycles: Math.round(autonomyPercentage / 10),
      idleCycles: 10 - Math.round(autonomyPercentage / 10),
      autonomyPercentage,
      averageFrustration: frustration,
      driveBreakdown: {
        homeostasis: 4 + Math.floor(Math.random() * 3),
        curiosity: 2 + Math.floor(Math.random() * 2),
        entropy_alert: Math.floor(Math.random() * 1),
        idle: 10 - Math.round(autonomyPercentage / 10)
      }
    };
    allMetrics.push(metric);
    cycleNumber += 10;
  }

  // Guardar métricas
  fs.writeFileSync(metricsFile, JSON.stringify(allMetrics, null, 2));
  
  // Generar eventos JSONL
  let eventCount = 0;
  let events = '';
  allMetrics.forEach(metric => {
    for (let i = 0; i < metric.totalCycles; i++) {
      const isAutonomous = Math.random() < (metric.autonomousCycles / metric.totalCycles);
      const drives = Object.keys(metric.driveBreakdown);
      
      // Seleccionar drive ponderado
      let drive = 'idle';
      const rand = Math.random() * metric.totalCycles;
      let sum = 0;
      for (const [d, count] of Object.entries(metric.driveBreakdown)) {
        sum += count;
        if (rand < sum) {
          drive = d;
          break;
        }
      }

      const event = {
        timestamp: metric.timestamp + i * 1000,
        cycleNumber: allMetrics.reduce((sum, m) => sum + m.totalCycles, 0) - metric.totalCycles + i,
        decision: {
          kind: drive,
          isAutonomous,
          urgency: Math.random(),
          jepaBoosted: isAutonomous && metric.averageFrustration > 0.5
        },
        jepa: {
          frustration: metric.averageFrustration + (Math.random() - 0.5) * 0.2,
          confidence: 1 - (metric.averageFrustration + (Math.random() - 0.5) * 0.2) / 2
        }
      };
      events += JSON.stringify(event) + '\n';
      eventCount++;
    }
  });

  fs.writeFileSync(eventsFile, events);

  console.log(`\n✅ Generación completa:\n`);
  console.log(`  Métricas: 15 ventanas (150 ciclos total)`);
  console.log(`  Eventos: ${eventCount} decisiones registradas`);
  console.log(`  Ubicación: ${demoDir}\n`);
}

// Ejecutar generación
generateDemoData();

// Analyar datos generados
console.log('═══════════════════════════════════════════════════════════════════════════\n');
console.log('📊 ANÁLISIS DE DATOS GENERADOS\n');

const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));

const avgAutonomy = metrics.reduce((sum, m) => sum + m.autonomyPercentage, 0) / metrics.length;
const maxAutonomy = Math.max(...metrics.map(m => m.autonomyPercentage));
const minAutonomy = Math.min(...metrics.map(m => m.autonomyPercentage));
const avgFrustration = metrics.reduce((sum, m) => sum + m.averageFrustration, 0) / metrics.length;

console.log(`Autonomía promedio: ${avgAutonomy.toFixed(1)}% (min: ${minAutonomy.toFixed(1)}%, max: ${maxAutonomy.toFixed(1)}%)`);
console.log(`Frustración promedio: ${avgFrustration.toFixed(2)}/2.0`);
console.log(`Mejora vs baseline (30% sin Plan B): +${(avgAutonomy - 30).toFixed(1)}%`);

console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
console.log('🔧 PUEDES ANALIZAR ESTOS DATOS CON:\n');
console.log(`  $ OPENSKYNET_STATE_DIR=${demoDir} node scripts/live-autonomy-monitor.mjs`);
console.log(`  $ OPENSKYNET_STATE_DIR=${demoDir} node scripts/analyze-autonomy-history.mjs`);
console.log('\n💾 Los datos están "recordados" en disco\n');
