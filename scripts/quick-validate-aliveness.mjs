#!/usr/bin/env node

/**
 * quick-validate-aliveness.mjs
 * ============================
 *
 * Validación RÁPIDA del estado de "modo vivo" en OpenSkyNet
 * Ejecuta los 3 tests críticos en ~10 segundos
 *
 * Uso: node scripts/quick-validate-aliveness.mjs
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

console.log('═'.repeat(80));
console.log('QUICK VALIDATION: OpenSkyNet Aliveness Mode Status');
console.log('═'.repeat(80));
console.log('');

const tests = {
  code_exists: { status: '⏳', label: 'Code exists & integrated' },
  audit_passes: { status: '⏳', label: 'Audit tests pass (6/6)' },
  metrics_updated: { status: '⏳', label: 'Metrics populated' },
};

// TEST 1: Code Exists
try {
  const files = [
    'src/omega/continuous-thinking-engine.ts',
    'src/omega/entropy-minimization-loop.ts',
    'src/omega/active-learning-strategy.ts',
    'src/omega/heartbeat.ts',
  ];
  
  let allExist = true;
  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    const stats = fs.statSync(fullPath);
    if (stats.size < 100) allExist = false;
  }
  
  if (allExist) {
    tests.code_exists.status = '✅';
  } else {
    tests.code_exists.status = '❌';
  }
} catch (err) {
  tests.code_exists.status = '❌';
}

// TEST 2: Run Continuous Thinking Audit
try {
  const output = execSync('node scripts/continuous-thinking-audit.mjs 2>&1', {
    cwd: ROOT,
    timeout: 30000,
    encoding: 'utf-8',
  });
  
  // Check if all 6 tests passed
  const testsPassed = (output.match(/✅ PASS/g) || []).length >= 6;
  tests.audit_passes.status = testsPassed ? '✅' : '❌';
} catch (err) {
  tests.audit_passes.status = '❌';
}

// TEST 3: Check Metrics
try {
  const metricsPath = path.join(ROOT, '.openskynet/omega-empirical-metrics.json');
  const metricsContent = fs.readFileSync(metricsPath, 'utf-8');
  const metrics = JSON.parse(metricsContent);
  
  // Metrics are "populated" if recordedOutcomes > 0
  const hasMetrics = (metrics.validation?.recordedOutcomes ?? 0) > 0;
  tests.metrics_updated.status = hasMetrics ? '✅' : '⚠️';
} catch (err) {
  tests.metrics_updated.status = '❌';
}

// PRINT RESULTS
console.log('QUICK TEST RESULTS:');
console.log('─'.repeat(80));

for (const [key, test] of Object.entries(tests)) {
  console.log(`${test.status} ${test.label}`);
}

console.log('');
console.log('═'.repeat(80));

const allPassed = Object.values(tests).every(t => t.status === '✅' || t.status === '⚠️');

if (allPassed) {
  console.log('✅ ALIVENESS MODE VALIDATED - System is operational');
} else {
  console.log('❌ ALIVENESS MODE VALIDATION FAILED - Check detailed logs');
  process.exit(1);
}

console.log('═'.repeat(80));
console.log('');
console.log('For detailed audit, run:');
console.log('  node scripts/continuous-thinking-audit.mjs');
console.log('  node scripts/validate-heartbeat-integration.mjs');
console.log('  node scripts/audit-no-smoke.mjs');
console.log('');
