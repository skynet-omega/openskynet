/**
 * src/omega/autonomy-logger.ts
 *
 * Sistema de logging para monitorear decisiones autónomas en tiempo real
 * Registra:
 * - Cada decisión: autónoma vs requiere input
 * - Frustración JEPA en cada ciclo
 * - Activación de drives
 * - Métricas consolidadas cada N ciclos
 *
 * Permite "recordar" el estado histórico y detectar patrones
 */

import fs from "fs";
import path from "path";
import { resolveStateDir } from "../config/paths.js";

export interface DecisionEvent {
  timestamp: number;
  cycleNumber: number;
  decision: {
    kind: "homeostasis" | "curiosity" | "entropy_alert" | "idle";
    isAutonomous: boolean;
    urgency: number;
    jepaBoosted?: boolean;
  };
  jepa?: {
    frustration: number;
    confidence: number;
  };
  memoryMetrics?: {
    successRate: number;
    failureCount: number;
    recentFailures: number;
  };
}

export interface AutonomyMetrics {
  timestamp: number;
  cycleRange: [number, number];
  totalCycles: number;
  autonomousCycles: number;
  idleCycles: number;
  autonomyPercentage: number;
  averageFrustration: number;
  driveBreakdown: Record<string, number>;
}

export class AutonomyLogger {
  private logFilePath: string;
  private metricsFilePath: string;
  private events: DecisionEvent[] = [];
  private metrics: AutonomyMetrics[] = [];
  private cycleCounter = 0;
  private aggregationWindow = 10; // Consolidar cada 10 ciclos

  constructor(stateDir?: string) {
    const expandedDir = stateDir ? path.resolve(stateDir) : resolveStateDir(process.env);
    this.logFilePath = path.join(expandedDir, "autonomy-decisions.jsonl");
    this.metricsFilePath = path.join(expandedDir, "autonomy-metrics.json");

    // Crear directorio si no existe
    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.loadExistingMetrics();
  }

  /**
   * Cargar métricas históricas (para "recordar")
   */
  private loadExistingMetrics() {
    try {
      if (fs.existsSync(this.metricsFilePath)) {
        const data = fs.readFileSync(this.metricsFilePath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.metrics = parsed;
        }
      }
    } catch (error) {
      // Archivo vacío o corrupto, empezar de cero
      this.metrics = [];
    }
  }

  /**
   * Registrar una decisión del heartbeat
   */
  logDecision(
    decision: {
      kind: "homeostasis" | "curiosity" | "entropy_alert" | "idle";
      urgency: number;
      jepaBoosted?: boolean;
    },
    jepa?: { frustration: number; confidence: number },
    memoryMetrics?: any,
  ) {
    const event: DecisionEvent = {
      timestamp: Date.now(),
      cycleNumber: this.cycleCounter++,
      decision: {
        ...decision,
        isAutonomous: decision.kind !== "idle",
      },
      jepa,
      memoryMetrics,
    };

    this.events.push(event);

    // Escribir en JSONL para análisis posterior
    fs.appendFileSync(this.logFilePath, JSON.stringify(event) + "\n", { encoding: "utf-8" });

    // Consolidar métricas cada N ciclos
    if (this.events.length % this.aggregationWindow === 0) {
      this.consolidateMetrics();
      this.printLiveMetrics();
    }
  }

  /**
   * Consolidar última ventana de eventos en métrica
   */
  private consolidateMetrics() {
    const recentEvents = this.events.slice(-this.aggregationWindow);
    if (recentEvents.length === 0) return;

    const autonomous = recentEvents.filter((e) => e.decision.isAutonomous).length;
    const idle = recentEvents.filter((e) => e.decision.kind === "idle").length;
    const avgFrustration =
      recentEvents.reduce((sum, e) => sum + (e.jepa?.frustration || 0), 0) / recentEvents.length;

    const driveBreakdown: Record<string, number> = {};
    recentEvents.forEach((e) => {
      driveBreakdown[e.decision.kind] = (driveBreakdown[e.decision.kind] || 0) + 1;
    });

    const metric: AutonomyMetrics = {
      timestamp: Date.now(),
      cycleRange: [recentEvents[0].cycleNumber, recentEvents[recentEvents.length - 1].cycleNumber],
      totalCycles: recentEvents.length,
      autonomousCycles: autonomous,
      idleCycles: idle,
      autonomyPercentage: (autonomous / recentEvents.length) * 100,
      averageFrustration: avgFrustration,
      driveBreakdown,
    };

    this.metrics.push(metric);
    this.saveMetrics();
  }

  /**
   * Guardar métricas a disco para persistencia
   */
  private saveMetrics() {
    fs.writeFileSync(this.metricsFilePath, JSON.stringify(this.metrics, null, 2), {
      encoding: "utf-8",
    });
  }

  /**
   * Imprimir métricas en vivo (para monitoreo)
   */
  private printLiveMetrics() {
    if (this.metrics.length === 0) return;

    const latest = this.metrics[this.metrics.length - 1];
    const trend =
      this.metrics.length > 1
        ? this.metrics[this.metrics.length - 1].autonomyPercentage -
          this.metrics[this.metrics.length - 2].autonomyPercentage
        : 0;

    const timestamp = new Date(latest.timestamp).toISOString();
    const autonomyBar =
      "█".repeat(Math.round(latest.autonomyPercentage / 5)) +
      "░".repeat(20 - Math.round(latest.autonomyPercentage / 5));

    console.log(
      `\n[${timestamp}] AUTONOMY METRICS (Cycles ${latest.cycleRange[0]}-${latest.cycleRange[1]})`,
    );
    console.log(
      `  Autonomous: ${latest.autonomousCycles}/${latest.totalCycles} [${autonomyBar}] ${latest.autonomyPercentage.toFixed(1)}%`,
    );
    console.log(`  Trend: ${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`);
    console.log(`  Frustration: ${latest.averageFrustration.toFixed(2)} (0-2 scale)`);
    console.log(`  Drives: ${JSON.stringify(latest.driveBreakdown)}`);
  }

  /**
   * Obtener resumen histórico (para "recordar" sesiones anteriores)
   */
  getHistoricalSummary(): {
    totalCycles: number;
    avgAutonomy: number;
    maxAutonomy: number;
    minAutonomy: number;
    trend: number;
    sessions: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalCycles: 0,
        avgAutonomy: 0,
        maxAutonomy: 0,
        minAutonomy: 0,
        trend: 0,
        sessions: 0,
      };
    }

    const autonomyValues = this.metrics.map((m) => m.autonomyPercentage);
    const avgAutonomy = autonomyValues.reduce((a, b) => a + b, 0) / autonomyValues.length;
    const maxAutonomy = Math.max(...autonomyValues);
    const minAutonomy = Math.min(...autonomyValues);
    const trend = autonomyValues[autonomyValues.length - 1] - autonomyValues[0];
    const totalCycles = this.metrics.reduce((sum, m) => sum + m.totalCycles, 0);

    return {
      totalCycles,
      avgAutonomy,
      maxAutonomy,
      minAutonomy,
      trend,
      sessions: this.metrics.length,
    };
  }

  /**
   * Detectar patrones: en qué condiciones es más autónoma
   */
  detectPatterns() {
    if (this.metrics.length < 3) {
      return { high_frustration: "Not enough data", low_frustration: "Not enough data" };
    }

    const highFrustration = this.metrics.filter((m) => m.averageFrustration > 1.0);
    const lowFrustration = this.metrics.filter((m) => m.averageFrustration < 0.5);

    return {
      high_frustration:
        highFrustration.length > 0
          ? (
              highFrustration.reduce((sum, m) => sum + m.autonomyPercentage, 0) /
              highFrustration.length
            ).toFixed(1) + "%"
          : "No data",
      low_frustration:
        lowFrustration.length > 0
          ? (
              lowFrustration.reduce((sum, m) => sum + m.autonomyPercentage, 0) /
              lowFrustration.length
            ).toFixed(1) + "%"
          : "No data",
    };
  }

  /**
   * Exportar resumen ejecutivo
   */
  exportSummary(): string {
    const summary = this.getHistoricalSummary();
    const patterns = this.detectPatterns();

    return `
AUTONOMY LOGGER SUMMARY
═══════════════════════════════════════════════════════════

Total Cycles Tracked: ${summary.totalCycles}
Sessions: ${summary.sessions}

Autonomy Statistics:
  Average: ${summary.avgAutonomy.toFixed(1)}%
  Maximum: ${summary.maxAutonomy.toFixed(1)}%
  Minimum: ${summary.minAutonomy.toFixed(1)}%
  Trend: ${summary.trend >= 0 ? "+" : ""}${summary.trend.toFixed(1)}%

Behavioral Patterns:
  High Frustration (>1.0): ${patterns.high_frustration} autonomous
  Low Frustration (<0.5): ${patterns.low_frustration} autonomous

Latest Data Files:
  Events log: ${this.logFilePath}
  Metrics: ${this.metricsFilePath}

Status: ✅ MONITORING ACTIVE
═══════════════════════════════════════════════════════════
    `.trim();
  }
}

// Export singleton instance
let loggerInstance: AutonomyLogger | null = null;

export function getAutonomyLogger(stateDir?: string): AutonomyLogger {
  if (!loggerInstance) {
    loggerInstance = new AutonomyLogger(stateDir);
  }
  return loggerInstance;
}

export function initializeAutonomyLogger(stateDir?: string): AutonomyLogger {
  loggerInstance = new AutonomyLogger(stateDir);
  return loggerInstance;
}
