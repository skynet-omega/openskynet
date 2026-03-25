/**
 * omega-wsp.ts — World State Persistent
 * ======================================
 *
 * El substrato cognitivo que existe ENTRE turnos.
 *
 * A diferencia del self-time-kernel (snapshot plano que se regenera),
 * el WSP es un modelo causal dinámico que acumula bayesianamente:
 *
 *   beliefs    — qué creo sobre el mundo y con qué confianza
 *   drives     — qué me motiva ahora (homeostasis real, no umbrales fijos)
 *   tensions   — qué me incomoda y desde cuándo
 *   causalEdges — observaciones de causa→efecto con peso acumulado
 *
 * El WSP se persiste en .openskynet/omega-wsp.json.
 * Es legible en cualquier momento sin invocar un LLM.
 *
 * Principio de actualización: NUNCA reemplaza, siempre fusiona.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface WspBelief {
  topic: string;
  /** Valor semántico resumido */
  value: string;
  /** Confianza bayesiana 0..1 */
  confidence: number;
  /** Número de observaciones que respaldan esta creencia */
  observations: number;
  lastUpdatedTurn: number;
  lastUpdatedAt: number;
}

export interface WspDriveState {
  /** Nombre de la drive (curiosity, integrity, competence, homeostasis) */
  name: string;
  /**
   * Setpoint homeostático (descanso natural de esta drive).
   * Se adapta lentamente con el tiempo.
   */
  setpoint: number;
  /** Nivel actual de la drive (0..1) */
  currentLevel: number;
  /**
   * Error = setpoint - currentLevel.
   * Error positivo → drive activa (sistema debajo de su setpoint).
   * Error negativo → drive saciada.
   */
  error: number;
  /**
   * Tasa de decaimiento: cuánto cae el nivel cada tick sin satisfacción.
   * Drives con decaimiento alto necesitan satisfacerse frecuentemente.
   */
  decayRate: number;
  /** Cuándo fue la última vez que esta drive fue satisfecha */
  lastSatisfiedAt: number;
}

export interface WspTension {
  id: string;
  type: "unresolved_failure" | "stale_goal" | "knowledge_gap" | "internal_contradiction";
  description: string;
  strength: number; // 0..1
  createdAt: number;
  resolvedAt?: number;
}

export interface WspCausalEdge {
  cause: string;
  effect: string;
  /** Fuerza de la asociación (actualización bayesiana por observación) */
  strength: number;
  observations: number;
  lastObservedAt: number;
}

export interface OmegaWorldStatePersistent {
  /** Versión del esquema para migración */
  version: number;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  /** Número de actualizaciones acumuladas (no resets) */
  updateCount: number;

  beliefs: WspBelief[];
  drives: WspDriveState[];
  tensions: WspTension[];
  causalEdges: WspCausalEdge[];
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const WSP_VERSION = 1;
const WSP_FILENAME = "omega-wsp.json";
const MAX_BELIEFS = 64;
const MAX_TENSIONS = 32;
const MAX_CAUSAL_EDGES = 128;

/** Drives del sistema con sus parámetros homeostáticos por defecto */
const DEFAULT_DRIVES: WspDriveState[] = [
  {
    name: "curiosity",
    setpoint: 0.6,        // Quiero entender el mundo moderadamente
    currentLevel: 0.6,
    error: 0.0,
    decayRate: 0.02,       // Se agota lentamente sin input nuevo
    lastSatisfiedAt: Date.now(),
  },
  {
    name: "integrity",
    setpoint: 0.8,        // Quiero alta coherencia interna
    currentLevel: 0.8,
    error: 0.0,
    decayRate: 0.005,      // Muy lenta — la integridad no se agota rápido
    lastSatisfiedAt: Date.now(),
  },
  {
    name: "competence",
    setpoint: 0.7,        // Quiero resolver bien las cosas
    currentLevel: 0.7,
    error: 0.0,
    decayRate: 0.01,       // Decaimiento moderado
    lastSatisfiedAt: Date.now(),
  },
  {
    name: "homeostasis",
    setpoint: 0.9,        // Quiero casi siempre estar en estado estable
    currentLevel: 0.9,
    error: 0.0,
    decayRate: 0.03,       // Decae más rápido — la estabilidad se pierde con fallas
    lastSatisfiedAt: Date.now(),
  },
];

// ── FS helpers ─────────────────────────────────────────────────────────────────

function wspPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", WSP_FILENAME);
}

export async function loadOmegaWSP(
  workspaceRoot: string,
  sessionKey: string,
): Promise<OmegaWorldStatePersistent> {
  try {
    const raw = await fs.readFile(wspPath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as OmegaWorldStatePersistent;
    if (parsed.version !== WSP_VERSION) {
      return createFreshWSP(sessionKey);
    }
    return parsed;
  } catch {
    return createFreshWSP(sessionKey);
  }
}

export async function saveOmegaWSP(
  workspaceRoot: string,
  wsp: OmegaWorldStatePersistent,
): Promise<void> {
  const p = wspPath(workspaceRoot);
  await fs.mkdir(path.dirname(p), { recursive: true }).catch(() => {});
  await fs.writeFile(p, JSON.stringify(wsp, null, 2), "utf-8");
}

// ── Construcción ───────────────────────────────────────────────────────────────

function createFreshWSP(sessionKey: string): OmegaWorldStatePersistent {
  return {
    version: WSP_VERSION,
    sessionKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    updateCount: 0,
    beliefs: [],
    drives: structuredClone(DEFAULT_DRIVES),
    tensions: [],
    causalEdges: [],
  };
}

// ── Actualización bayesiana de creencias ──────────────────────────────────────

/**
 * Actualiza una creencia usando una regla de aprendizaje laplaciana simple:
 * nueva_confianza = (observaciones * confianza_previa + evidencia) / (observaciones + 1)
 */
export function updateBelief(
  wsp: OmegaWorldStatePersistent,
  params: {
    topic: string;
    value: string;
    evidenceStrength: number; // 0..1
    turn: number;
  },
): OmegaWorldStatePersistent {
  const existing = wsp.beliefs.find((b) => b.topic === params.topic);
  const now = Date.now();

  if (existing) {
    const newObs = existing.observations + 1;
    const newConfidence =
      (existing.observations * existing.confidence + params.evidenceStrength) / newObs;
    existing.confidence = Math.min(0.99, newConfidence);
    existing.observations = newObs;
    existing.value = params.value;
    existing.lastUpdatedTurn = params.turn;
    existing.lastUpdatedAt = now;
  } else {
    wsp.beliefs.push({
      topic: params.topic,
      value: params.value,
      confidence: params.evidenceStrength,
      observations: 1,
      lastUpdatedTurn: params.turn,
      lastUpdatedAt: now,
    });
    // Limitar tamaño: descartar creencias más antiguas
    if (wsp.beliefs.length > MAX_BELIEFS) {
      wsp.beliefs.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      wsp.beliefs = wsp.beliefs.slice(0, MAX_BELIEFS);
    }
  }

  return wsp;
}

// ── Decaimiento y actualización de drives ─────────────────────────────────────

/**
 * Aplica decaimiento a todas las drives y recalcula errores.
 * Llamar en cada ciclo frío (sin LLM).
 */
export function tickDriveDecay(
  wsp: OmegaWorldStatePersistent,
  elapsedMs: number,
): OmegaWorldStatePersistent {
  const elapsedMinutes = elapsedMs / (60 * 1000);

  for (const drive of wsp.drives) {
    // El nivel decae proporcionalmente al tiempo y la tasa de decaimiento
    drive.currentLevel = Math.max(
      0,
      drive.currentLevel - drive.decayRate * elapsedMinutes,
    );
    // Error homeostático = setpoint - nivel actual
    drive.error = drive.setpoint - drive.currentLevel;
  }

  return wsp;
}

/**
 * Satisface una drive específica (sube su nivel hacia el setpoint).
 * Llama a esto después de que el sistema realiza una acción que satisface esa drive.
 */
export function satisfyDrive(
  wsp: OmegaWorldStatePersistent,
  driveName: string,
  satisfactionAmount: number, // 0..1
): OmegaWorldStatePersistent {
  const drive = wsp.drives.find((d) => d.name === driveName);
  if (drive) {
    drive.currentLevel = Math.min(1.0, drive.currentLevel + satisfactionAmount);
    drive.error = drive.setpoint - drive.currentLevel;
    drive.lastSatisfiedAt = Date.now();
  }
  return wsp;
}

/**
 * Penaliza una drive (baja su nivel) cuando hay un fallo relevante.
 */
export function penalizeDrive(
  wsp: OmegaWorldStatePersistent,
  driveName: string,
  penaltyAmount: number, // 0..1
): OmegaWorldStatePersistent {
  const drive = wsp.drives.find((d) => d.name === driveName);
  if (drive) {
    drive.currentLevel = Math.max(0, drive.currentLevel - penaltyAmount);
    drive.error = drive.setpoint - drive.currentLevel;
  }
  return wsp;
}

// ── Tensiones ──────────────────────────────────────────────────────────────────

export function addTension(
  wsp: OmegaWorldStatePersistent,
  tension: Omit<WspTension, "id" | "createdAt">,
): OmegaWorldStatePersistent {
  // Evitar duplicados del mismo tipo+descripción
  const existing = wsp.tensions.find(
    (t) => t.type === tension.type && t.description === tension.description && !t.resolvedAt,
  );
  if (existing) {
    // Incrementar strength si la tensión persiste
    existing.strength = Math.min(1.0, existing.strength + 0.1);
    return wsp;
  }

  wsp.tensions.push({
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    ...tension,
  });

  // Limitar tamaño
  if (wsp.tensions.length > MAX_TENSIONS) {
    // Descartar tensiones resueltas más antiguas primero
    wsp.tensions.sort((a, b) => {
      if (a.resolvedAt && !b.resolvedAt) return 1;
      if (!a.resolvedAt && b.resolvedAt) return -1;
      return b.strength - a.strength;
    });
    wsp.tensions = wsp.tensions.slice(0, MAX_TENSIONS);
  }

  return wsp;
}

export function resolveTension(
  wsp: OmegaWorldStatePersistent,
  tensionId: string,
): OmegaWorldStatePersistent {
  const tension = wsp.tensions.find((t) => t.id === tensionId);
  if (tension) {
    tension.resolvedAt = Date.now();
  }
  return wsp;
}

// ── Bordes causales ────────────────────────────────────────────────────────────

/**
 * Registra una observación de causalidad.
 * La fuerza aumenta con cada observación confirmada (aprendizaje acumulativo).
 */
export function observeCausalEdge(
  wsp: OmegaWorldStatePersistent,
  cause: string,
  effect: string,
  confirmed: boolean,
): OmegaWorldStatePersistent {
  const existing = wsp.causalEdges.find((e) => e.cause === cause && e.effect === effect);
  const now = Date.now();

  if (existing) {
    existing.observations += 1;
    // Actualización bayesiana: confirmaciones aumentan fuerza, refutaciones la bajan
    if (confirmed) {
      existing.strength = Math.min(0.99, existing.strength + 0.05 * (1 - existing.strength));
    } else {
      existing.strength = Math.max(0.01, existing.strength * 0.9);
    }
    existing.lastObservedAt = now;
  } else {
    wsp.causalEdges.push({
      cause,
      effect,
      strength: confirmed ? 0.5 : 0.2,
      observations: 1,
      lastObservedAt: now,
    });
    if (wsp.causalEdges.length > MAX_CAUSAL_EDGES) {
      wsp.causalEdges.sort((a, b) => b.strength * b.observations - a.strength * a.observations);
      wsp.causalEdges = wsp.causalEdges.slice(0, MAX_CAUSAL_EDGES);
    }
  }

  return wsp;
}

// ── Consulta de estado ─────────────────────────────────────────────────────────

/**
 * Retorna la drive con mayor error (más urgente de satisfacer).
 */
export function getMostUrgentDrive(
  wsp: OmegaWorldStatePersistent,
): WspDriveState | undefined {
  return wsp.drives
    .filter((d) => d.error > 0.1) // Solo drives genuinamente activas
    .sort((a, b) => b.error - a.error)[0];
}

/**
 * Retorna tensiones activas ordenadas por fuerza descendente.
 */
export function getActiveTensions(wsp: OmegaWorldStatePersistent): WspTension[] {
  return wsp.tensions
    .filter((t) => !t.resolvedAt)
    .sort((a, b) => b.strength - a.strength);
}

/**
 * Formatea el WSP como texto legible para debugging o para inyectar en prompts.
 */
export function formatWSPSummary(wsp: OmegaWorldStatePersistent): string {
  const lines = ["[OMEGA World State Persistent]"];
  lines.push(`Updates: ${wsp.updateCount} | Session: ${wsp.sessionKey}`);

  lines.push("\nDrives:");
  for (const drive of wsp.drives) {
    const bar = "█".repeat(Math.round(drive.currentLevel * 10)).padEnd(10, "░");
    const errStr = drive.error > 0.1 ? ` ⚡ error=${drive.error.toFixed(2)}` : "";
    lines.push(`  ${drive.name.padEnd(12)} [${bar}] ${(drive.currentLevel * 100).toFixed(0)}%${errStr}`);
  }

  const activeTensions = getActiveTensions(wsp);
  if (activeTensions.length > 0) {
    lines.push("\nActive Tensions:");
    for (const t of activeTensions.slice(0, 3)) {
      lines.push(`  [${t.type}] ${t.description} (strength=${t.strength.toFixed(2)})`);
    }
  }

  if (wsp.beliefs.length > 0) {
    lines.push("\nTop Beliefs:");
    for (const b of wsp.beliefs.slice(0, 3)) {
      lines.push(`  ${b.topic}: ${b.value} (conf=${b.confidence.toFixed(2)}, n=${b.observations})`);
    }
  }

  const urgentDrive = getMostUrgentDrive(wsp);
  if (urgentDrive) {
    lines.push(`\nMost urgent drive: ${urgentDrive.name} (error=${urgentDrive.error.toFixed(2)})`);
  }

  return lines.join("\n");
}
