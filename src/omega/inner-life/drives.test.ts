/**
 * inner-life/drives.test.ts
 * ==========================
 * Tests unitarios para el evaluador de drives internas.
 */

import { describe, it, expect } from "vitest";
import type { OmegaWorldStatePersistent } from "../omega-wsp.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import { evaluateInnerDrives, evaluateInnerDrivesFromWSP } from "./drives.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // timestamp fijo para tests

function makeKernel(overrides: Partial<OmegaSelfTimeKernelState> = {}): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "agent:main:main",
    turnCount: 10,
    activeGoalId: undefined,
    identity: {
      continuityId: "abc123",
      firstSeenAt: NOW - 35 * 1000,
      lastSeenAt: NOW - 35 * 1000, // 35 segundos atrás por default (entre MIN_IDLE_MS y ENTROPY_THRESHOLD)
      lastTask: "analizar SOLITONES",
      lastInteractionKind: "direct_instruction",
    },
    world: {
      lastOutcomeStatus: "ok",
      lastObservedChangedFiles: [],
    },
    goals: [],
    tension: {
      openGoalCount: 0,
      staleGoalCount: 0,
      failureStreak: 0,
      repeatedFailureKinds: [],
      pendingCorrection: false,
    },
    causalGraph: {
      files: [],
      edges: [],
    },
    updatedAt: NOW - 35 * 1000,
    ...overrides,
  };
}

function makeWsp(overrides: Partial<OmegaWorldStatePersistent> = {}): OmegaWorldStatePersistent {
  return {
    version: 1,
    sessionKey: "agent:main:main",
    createdAt: NOW - 60_000,
    updatedAt: NOW - 1_000,
    updateCount: 4,
    beliefs: [],
    drives: [
      {
        name: "curiosity",
        setpoint: 0.6,
        currentLevel: 0.05,
        error: 0.55,
        decayRate: 0.02,
        lastSatisfiedAt: NOW - 60_000,
      },
      {
        name: "integrity",
        setpoint: 0.8,
        currentLevel: 0.8,
        error: 0,
        decayRate: 0.005,
        lastSatisfiedAt: NOW - 60_000,
      },
      {
        name: "competence",
        setpoint: 0.7,
        currentLevel: 0.4,
        error: 0.3,
        decayRate: 0.01,
        lastSatisfiedAt: NOW - 60_000,
      },
      {
        name: "homeostasis",
        setpoint: 0.9,
        currentLevel: 0.5,
        error: 0.4,
        decayRate: 0.03,
        lastSatisfiedAt: NOW - 60_000,
      },
    ],
    tensions: [],
    causalEdges: [],
    ...overrides,
  };
}

// ─── Drive: idle ──────────────────────────────────────────────────────────────

describe("evaluateInnerDrives — idle", () => {
  it("retorna idle si la sesión es muy reciente (< MIN_IDLE_MS)", () => {
    const kernel = makeKernel({
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - 20_000,
        lastSeenAt: NOW - 20_000, // 20 segundos atrás → por debajo de MIN_IDLE_MS (30s)
      },
      // Tiene turnCount > 0 para activar la guarda de sesión reciente
      turnCount: 5,
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("idle");
  });

  it("retorna idle si todo está bien y el silencio es moderado", () => {
    // 45 segundos sin actividad — entre MIN_IDLE_MS (30s) y ENTROPY_THRESHOLD (1min)
    // goals completados recientemente → no hay curiosidad
    const kernel = makeKernel({
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - 45 * 1000,
        lastSeenAt: NOW - 45 * 1000,
      },
      goals: [
        {
          id: "g1",
          task: "revisar memoria episódica",
          targets: [],
          requiredKeys: [],
          status: "completed",
          createdAt: NOW - 45 * 1000,
          updatedAt: NOW - 45 * 1000,
          createdTurn: 2,
          updatedTurn: 8, // reciente (turnCount=10, sólo 2 turns atrás)
          failureCount: 0,
          successCount: 1,
          lastOutcomeStatus: "ok",
          observedChangedFiles: [],
        },
      ],
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("idle");
  });
});

// ─── Drive: homeostasis ───────────────────────────────────────────────────────

describe("evaluateInnerDrives — homeostasis", () => {
  it("activa homeostasis si hay failure_streak sin activeGoalId", () => {
    const kernel = makeKernel({
      activeGoalId: undefined,
      tension: {
        openGoalCount: 0,
        staleGoalCount: 0,
        failureStreak: 2,
        repeatedFailureKinds: ["target_not_touched"],
        pendingCorrection: false,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("homeostasis");
    if (signal.kind === "homeostasis") {
      expect(signal.urgency).toBeGreaterThan(0.4);
      expect(signal.reason).toContain("failure_streak");
    }
  });

  it("activa homeostasis si hay 3+ goals stale", () => {
    const kernel = makeKernel({
      tension: {
        openGoalCount: 0,
        staleGoalCount: 4,
        failureStreak: 0,
        repeatedFailureKinds: [],
        pendingCorrection: false,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("homeostasis");
  });

  it("activa homeostasis si pendingCorrection sin activeGoalId", () => {
    const kernel = makeKernel({
      activeGoalId: undefined,
      tension: {
        openGoalCount: 0,
        staleGoalCount: 0,
        failureStreak: 0,
        repeatedFailureKinds: [],
        pendingCorrection: true,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("homeostasis");
    if (signal.kind === "homeostasis") {
      expect(signal.reason).toBe("pending_correction_no_active_goal");
    }
  });

  it("NO activa homeostasis si activeGoalId está presente con failure_streak", () => {
    // Hay un goal activo persiguiendo la corrección — el sistema ya sabe qué hacer
    const kernel = makeKernel({
      activeGoalId: "g1",
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 1,
        repeatedFailureKinds: [],
        pendingCorrection: true,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    // No debe ser homeostasis porque hay goal activo
    expect(signal.kind).not.toBe("homeostasis");
  });
});

// ─── Drive: entropy_alert ─────────────────────────────────────────────────────

describe("evaluateInnerDrives — entropy_alert", () => {
  it("activa entropy_alert tras silencio prolongado (>1 minuto)", () => {
    const silentMs = 4 * 60 * 1000; // 4 minutos — por encima del umbral de 1 minuto
    const kernel = makeKernel({
      activeGoalId: undefined,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).toBe("entropy_alert");
    if (signal.kind === "entropy_alert") {
      expect(signal.silentMs).toBeGreaterThanOrEqual(silentMs);
      expect(signal.urgency).toBeGreaterThan(0.5);
    }
  });

  it("NO activa entropy_alert si el silencio es menor al umbral (1 minuto)", () => {
    const silentMs = 30 * 1000; // 30 segundos — por debajo del umbral de 1 minuto
    const kernel = makeKernel({
      activeGoalId: undefined,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).not.toBe("entropy_alert");
  });

  it("NO activa entropy_alert si hay un goal activo", () => {
    const silentMs = 5 * 60 * 60 * 1000; // 5 horas pero con goal activo
    const kernel = makeKernel({
      activeGoalId: "g1",
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).not.toBe("entropy_alert");
  });
});

// ─── Drive: curiosity ─────────────────────────────────────────────────────────

describe("evaluateInnerDrives — curiosity", () => {
  it("activa curiosity si hay silencio moderado y no hay goals completados recientes", () => {
    const silentMs = 45 * 1000; // 45 segundos — entre MIN_IDLE_MS (30s) y ENTROPY_THRESHOLD (1min)
    const kernel = makeKernel({
      activeGoalId: undefined,
      turnCount: 20,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
      goals: [
        {
          id: "g1",
          task: "experimenter con JEPA",
          targets: [],
          requiredKeys: [],
          status: "completed",
          createdAt: NOW - 2 * 60 * 60 * 1000,
          updatedAt: NOW - 2 * 60 * 60 * 1000,
          createdTurn: 1,
          updatedTurn: 2, // turno 2, mucho antes del actual (20) → por encima del threshold de 8
          failureCount: 0,
          successCount: 1,
          lastOutcomeStatus: "ok",
          observedChangedFiles: [],
        },
      ],
    });
    const signal = evaluateInnerDrives({
      kernel,
      nowMs: NOW,
      memoryCandidates: ["memory/omega-episodes/agent__main__main.md"],
    });
    expect(signal.kind).toBe("curiosity");
    if (signal.kind === "curiosity") {
      expect(signal.target).toBeTruthy();
    }
  });

  it("NO activa curiosity si hay activeGoalId", () => {
    const silentMs = 45 * 1000; // 45 segundos — dentro del rango de curiosidad
    const kernel = makeKernel({
      activeGoalId: "g1",
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    expect(signal.kind).not.toBe("curiosity");
  });

  it("usa memoryCandidates cuando se proporcionan", () => {
    const silentMs = 45 * 1000;
    const kernel = makeKernel({
      activeGoalId: undefined,
      turnCount: 20,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
      goals: [], // Sin goals completados
    });
    const signal = evaluateInnerDrives({
      kernel,
      nowMs: NOW,
      memoryCandidates: ["memory/experiments.md", "memory/ideas.md"],
    });
    expect(signal.kind).toBe("curiosity");
    if (signal.kind === "curiosity") {
      // Debe usar uno de los memoryCandidates, no el fallback
      expect(["memory/experiments.md", "memory/ideas.md"]).toContain(signal.target);
    }
  });

  it("usa fallback cuando memoryCandidates está vacío", () => {
    const silentMs = 45 * 1000;
    const kernel = makeKernel({
      activeGoalId: undefined,
      turnCount: 20,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
      goals: [],
    });
    const signal = evaluateInnerDrives({
      kernel,
      nowMs: NOW,
      memoryCandidates: [], // Vacío explícito
    });
    expect(signal.kind).toBe("curiosity");
    if (signal.kind === "curiosity") {
      // Fallback hardcoded
      expect(signal.target).toBe("memory/omega-episodes");
    }
  });
});

// ─── Prioridad: homeostasis > entropy > curiosity ─────────────────────────────

describe("evaluateInnerDrives — prioridad de drives", () => {
  it("homeostasis tiene prioridad sobre entropy_alert", () => {
    const silentMs = 5 * 60 * 60 * 1000; // entropy_alert activo
    const kernel = makeKernel({
      activeGoalId: undefined,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - silentMs,
        lastSeenAt: NOW - silentMs,
      },
      tension: {
        openGoalCount: 0,
        staleGoalCount: 0,
        failureStreak: 3, // también homeostasis activo
        repeatedFailureKinds: [],
        pendingCorrection: false,
      },
    });
    const signal = evaluateInnerDrives({ kernel, nowMs: NOW });
    // Homeostasis siempre primero
    expect(signal.kind).toBe("homeostasis");
  });
});

describe("evaluateInnerDrivesFromWSP — contextual selection", () => {
  it("no deja que curiosity tape homeostasis cuando hay activeGoalId", () => {
    const kernel = makeKernel({
      activeGoalId: "g1",
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - 45_000,
        lastSeenAt: NOW - 45_000,
      },
    });
    const signal = evaluateInnerDrivesFromWSP({
      wsp: makeWsp(),
      kernel,
      nowMs: NOW,
      memoryCandidates: ["memory/ideas.md"],
    });

    expect(signal.kind).toBe("homeostasis");
  });

  it("no devuelve idle si la top drive no aplica pero competence sí", () => {
    const kernel = makeKernel({
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - 20_000,
        lastSeenAt: NOW - 20_000,
      },
    });
    const signal = evaluateInnerDrivesFromWSP({
      wsp: makeWsp({
        drives: [
          {
            name: "curiosity",
            setpoint: 0.6,
            currentLevel: 0.05,
            error: 0.55,
            decayRate: 0.02,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "integrity",
            setpoint: 0.8,
            currentLevel: 0.8,
            error: 0,
            decayRate: 0.005,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "competence",
            setpoint: 0.7,
            currentLevel: 0.35,
            error: 0.35,
            decayRate: 0.01,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "homeostasis",
            setpoint: 0.9,
            currentLevel: 0.9,
            error: 0,
            decayRate: 0.03,
            lastSatisfiedAt: NOW - 60_000,
          },
        ],
      }),
      kernel,
      nowMs: NOW,
      memoryCandidates: ["memory/ideas.md"],
    });

    expect(signal.kind).toBe("competence_drive");
  });

  it("respeta entropy_alert sólo cuando el silencio ya es real", () => {
    const kernel = makeKernel({
      activeGoalId: undefined,
      identity: {
        continuityId: "x",
        firstSeenAt: NOW - 40_000,
        lastSeenAt: NOW - 40_000,
      },
    });
    const signal = evaluateInnerDrivesFromWSP({
      wsp: makeWsp({
        drives: [
          {
            name: "curiosity",
            setpoint: 0.6,
            currentLevel: 0.55,
            error: 0.05,
            decayRate: 0.02,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "integrity",
            setpoint: 0.8,
            currentLevel: 0.1,
            error: 0.7,
            decayRate: 0.005,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "competence",
            setpoint: 0.7,
            currentLevel: 0.7,
            error: 0,
            decayRate: 0.01,
            lastSatisfiedAt: NOW - 60_000,
          },
          {
            name: "homeostasis",
            setpoint: 0.9,
            currentLevel: 0.9,
            error: 0,
            decayRate: 0.03,
            lastSatisfiedAt: NOW - 60_000,
          },
        ],
      }),
      kernel,
      nowMs: NOW,
      memoryCandidates: ["memory/ideas.md"],
    });

    expect(signal.kind).toBe("idle");
  });
});
