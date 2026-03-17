#!/usr/bin/env node
/**
 * openskynet-self.mjs
 * ==================
 * Ejecutor autónomo independiente para OpenSkyNet.
 * 
 * Este script implementa el Modo Self sin depender de la compilación
 * del proyecto TypeScript. Se ejecuta directamente con Node.js.
 * 
 * Uso:
 *   node openskynet-self.mjs [comando]
 * 
 * Comandos:
 *   cycle     - Ejecuta un ciclo autónomo completo (default)
 *   status    - Verifica estado del sistema
 *   clean     - Limpia sesiones acumuladas
 *   explore   - Explora memoria reciente
 *   install   - Instala el cron job para ejecución cada 30 min
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE || '/home/daroch/openskynet';
const STATE_DIR = path.join(WORKSPACE_ROOT, '.openskynet');
const LOG_FILE = path.join(STATE_DIR, 'autonomous-executions.jsonl');
const HEARTBEAT_LOG = path.join(STATE_DIR, 'heartbeat.log');

// Umbrales de drives (en milisegundos)
const THRESHOLDS = {
  HOMEOSTASIS_FAILURE_STREAK: 3,      // 3 fallos consecutivos
  CURIOSITY_SILENCE_MS: 8 * 60 * 1000, // 8 minutos sin actividad
  ENTROPY_ALERT_MS: 60 * 1000,        // 1 minuto de silencio
};

// ─── UTILIDADES ─────────────────────────────────────────────────────────────
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  
  // Append to heartbeat log
  try {
    fs.appendFileSync(HEARTBEAT_LOG, line + '\n');
  } catch {
    // Ignore write errors
  }
}

function loadState() {
  const stateFile = path.join(STATE_DIR, 'self-state.json');
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    }
  } catch {
    // Ignore parse errors
  }
  return {
    lastRun: 0,
    lastActivity: Date.now(),
    failureStreak: 0,
    goalsCompleted: 0,
    lastMemoryExplored: null,
  };
}

function saveState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(STATE_DIR, 'self-state.json'),
      JSON.stringify(state, null, 2)
    );
  } catch (err) {
    log(`Error saving state: ${err.message}`);
  }
}

function logExecution(execution) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const line = JSON.stringify(execution) + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore
  }
}

// ─── ACCIONES AUTÓNOMAS ─────────────────────────────────────────────────────
function executeSessionCleanup() {
  log('🧹 Ejecutando limpieza de sesiones...');
  
  try {
    // Intenta con openskynet primero, luego openclaw
    let result;
    try {
      result = execSync('openskynet sessions cleanup 2>&1', { 
        encoding: 'utf-8',
        timeout: 30000 
      });
    } catch {
      result = execSync('openclaw sessions cleanup 2>&1', { 
        encoding: 'utf-8',
        timeout: 30000 
      });
    }
    
    // Parsear resultado
    const match = result.match(/(\d+)\s*(?:entries?|session)/i);
    const count = match ? parseInt(match[1], 10) : 0;
    
    log(`✅ Sesiones limpiadas: ${count}`);
    return { kind: 'sessions_cleaned', count };
  } catch (err) {
    log(`❌ Error limpiando sesiones: ${err.message}`);
    return { kind: 'error', error: err.message };
  }
}

function executeStatusCheck() {
  log('🔍 Verificando estado del sistema...');
  
  const issues = [];
  
  // Verificar gateway
  try {
    const gatewayStatus = execSync('openclaw gateway status 2>&1 || openskynet gateway status 2>&1', { 
      encoding: 'utf-8',
      timeout: 10000 
    });
    
    if (gatewayStatus.includes('error') || gatewayStatus.includes('not running')) {
      issues.push('Gateway no está ejecutándose');
    }
  } catch {
    issues.push('No se pudo verificar gateway');
  }
  
  // Verificar sesiones acumuladas
  try {
    const sessionsOutput = execSync('openclaw sessions list 2>&1 | wc -l || openskynet sessions list 2>&1 | wc -l', { 
      encoding: 'utf-8',
      timeout: 10000 
    });
    const sessionCount = parseInt(sessionsOutput.trim(), 10) || 0;
    
    if (sessionCount > 50) {
      issues.push(`Demasiadas sesiones acumuladas: ${sessionCount}`);
    }
  } catch {
    // Ignore
  }
  
  const status = issues.length === 0 ? 'healthy' : 'degraded';
  log(`📊 Estado: ${status}${issues.length > 0 ? ' (' + issues.join(', ') + ')' : ''}`);
  
  return { kind: 'status_check', status, issues };
}

function executeMemoryExploration() {
  log('🔍 Explorando memoria...');
  
  const findings = [];
  const memoryPath = path.join(WORKSPACE_ROOT, 'MEMORY.md');
  
  try {
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Buscar items de lista
        if (line.match(/^[-*]\s+.*\w+.*$/)) {
          findings.push(line.trim().slice(2));
        }
        // Limitar a 5 hallazgos
        if (findings.length >= 5) break;
      }
      
      log(`📚 Hallazgos en memoria: ${findings.length}`);
    } else {
      log('⚠️ No se encontró MEMORY.md');
    }
  } catch (err) {
    log(`❌ Error leyendo memoria: ${err.message}`);
  }
  
  return { kind: 'memory_explored', target: 'MEMORY.md', findings };
}

function proposeExperiment() {
  log('💡 Proponiendo experimento...');
  
  // Leer MEMORY.md para proponer experimento
  try {
    const memoryPath = path.join(WORKSPACE_ROOT, 'MEMORY.md');
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      
      // Buscar sección de dirección estratégica
      const match = content.match(/##\s*Current Strategic Direction[\s\S]*?(?=##|$)/i);
      if (match) {
        const lines = match[0].split('\n').filter(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));
        if (lines.length > 0) {
          const item = lines[0].replace(/^[-*]\s+/, '').trim();
          log(`🎯 Experimento propuesto: Validar "${item}"`);
          return { kind: 'experiment_proposed', hypothesis: item, testable: true };
        }
      }
    }
  } catch {
    // Ignore
  }
  
  return { kind: 'experiment_proposed', hypothesis: 'Continuar mejora de autonomía', testable: true };
}

// ─── EVALUACIÓN DE DRIVES ───────────────────────────────────────────────────
function evaluateDrives(state) {
  const now = Date.now();
  const drives = [];
  
  // Drive 1: Homeostasis (mantenimiento)
  if (state.failureStreak >= THRESHOLDS.HOMEOSTASIS_FAILURE_STREAK) {
    drives.push({
      kind: 'homeostasis',
      urgency: 0.8,
      reason: `${state.failureStreak} fallos consecutivos`,
    });
  }
  
  // Drive 2: Curiosity (exploración)
  const silenceMs = now - state.lastActivity;
  if (silenceMs > THRESHOLDS.CURIOSITY_SILENCE_MS) {
    drives.push({
      kind: 'curiosity',
      urgency: 0.4,
      reason: `${Math.floor(silenceMs / 60000)} minutos sin actividad`,
    });
  }
  
  // Drive 3: Entropy Alert (acción proactiva)
  if (silenceMs > THRESHOLDS.ENTROPY_ALERT_MS) {
    drives.push({
      kind: 'entropy_alert',
      urgency: 0.6,
      reason: 'Silencio prolongado detectado',
    });
  }
  
  // Ordenar por urgencia
  drives.sort((a, b) => b.urgency - a.urgency);
  
  return drives;
}

// ─── CICLO AUTÓNOMO PRINCIPAL ────────────────────────────────────────────────
function runAutonomousCycle() {
  log('🤖 Iniciando ciclo autónomo...');
  
  const state = loadState();
  const now = Date.now();
  
  // Evaluar drives
  const drives = evaluateDrives(state);
  
  if (drives.length === 0) {
    log('💤 No hay drives activas. Sistema estable.');
    return { kind: 'idle', reason: 'no_drive_active' };
  }
  
  // Ejecutar la drive más urgente
  const activeDrive = drives[0];
  log(`⚡ Drive activa: ${activeDrive.kind} (urgencia: ${activeDrive.urgency})`);
  
  let action;
  switch (activeDrive.kind) {
    case 'homeostasis':
      // Primero verificar estado, luego limpiar si es necesario
      action = executeStatusCheck();
      if (action.status === 'degraded') {
        const cleanup = executeSessionCleanup();
        action.cleanup = cleanup;
      }
      break;
      
    case 'curiosity':
      action = executeMemoryExploration();
      state.lastMemoryExplored = now;
      break;
      
    case 'entropy_alert':
      action = proposeExperiment();
      break;
      
    default:
      action = { kind: 'none', reason: 'unknown_drive' };
  }
  
  // Actualizar estado
  state.lastRun = now;
  state.lastActivity = now;
  if (action.kind === 'error') {
    state.failureStreak++;
  } else {
    state.failureStreak = 0;
  }
  saveState(state);
  
  // Loggear ejecución
  const execution = {
    executedAt: now,
    driveKind: activeDrive.kind,
    urgency: activeDrive.urgency,
    action,
  };
  logExecution(execution);
  
  log(`✅ Ciclo completado: ${action.kind}`);
  return execution;
}

// ─── INSTALACIÓN DE CRON ────────────────────────────────────────────────────
function installCron() {
  log('📅 Instalando cron job...');
  
  const scriptPath = __filename;
  const cronLine = `*/30 * * * * cd ${WORKSPACE_ROOT} && /usr/bin/node ${scriptPath} cycle >> ${HEARTBEAT_LOG} 2>&1`;
  
  try {
    // Verificar si ya existe
    const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
    
    if (currentCrontab.includes(scriptPath)) {
      log('⚠️ Cron job ya existe');
      return;
    }
    
    // Añadir al crontab
    const newCrontab = currentCrontab + '\n' + cronLine + '\n';
    
    const child = execSync('crontab -', { input: newCrontab });
    
    log('✅ Cron job instalado. Ejecutará cada 30 minutos.');
  } catch (err) {
    log(`❌ Error instalando cron: ${err.message}`);
    log('💡 Puedes añadir manualmente al crontab:');
    log(cronLine);
  }
}

// ─── COMANDO STATUS ─────────────────────────────────────────────────────────
function showStatus() {
  const state = loadState();
  
  console.log('\n🤖 OpenSkyNet Self Status');
  console.log('========================\n');
  
  console.log(`Workspace: ${WORKSPACE_ROOT}`);
  console.log(`Última ejecución: ${state.lastRun ? new Date(state.lastRun).toLocaleString() : 'Nunca'}`);
  console.log(`Última actividad: ${new Date(state.lastActivity).toLocaleString()}`);
  console.log(`Racha de fallos: ${state.failureStreak}`);
  console.log(`Goals completados: ${state.goalsCompleted}`);
  console.log(`Última exploración memoria: ${state.lastMemoryExplored ? new Date(state.lastMemoryExplored).toLocaleString() : 'Nunca'}`);
  
  // Verificar drives activas
  const drives = evaluateDrives(state);
  console.log(`\nDrives activas: ${drives.length}`);
  drives.forEach(d => {
    console.log(`  - ${d.kind}: ${d.reason} (urgencia: ${d.urgency})`);
  });
  
  console.log('');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
function main() {
  const command = process.argv[2] || 'cycle';
  
  switch (command) {
    case 'cycle':
      runAutonomousCycle();
      break;
      
    case 'status':
      showStatus();
      break;
      
    case 'clean':
      executeSessionCleanup();
      break;
      
    case 'explore':
      executeMemoryExploration();
      break;
      
    case 'install':
      installCron();
      break;
      
    default:
      console.log(`
Uso: node openskynet-self.mjs [comando]

Comandos:
  cycle     - Ejecuta un ciclo autónomo completo (default)
  status    - Muestra estado del sistema
  clean     - Limpia sesiones acumuladas
  explore   - Explora memoria reciente
  install   - Instala el cron job para ejecución cada 30 min
`);
  }
}

main();