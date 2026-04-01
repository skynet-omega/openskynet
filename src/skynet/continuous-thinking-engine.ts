/**
 * continuous-thinking-engine.ts
 * ==============================
 *
 * The core daemon that makes OpenSkyNet "alive":
 * - Runs continuously (every N milliseconds)
 * - Generates genuine questions (not scripted)
 * - Detects uncertainty and works to resolve it
 * - Operates INDEPENDENTLY of external triggers
 *
 * PERSISTENCIA: Los pensamientos se guardan en .openskynet/omega-thoughts.jsonl
 * y sobreviven reinicios. El singleton carga el historial al inicializarse.
 *
 * This is what transforms OpenSkyNet from "reactive system"
 * to "genuinely autonomous agent".
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

const THOUGHTS_FILENAME = "omega-thoughts.jsonl";
const MAX_PERSISTED_THOUGHTS = 500; // Límite para evitar crecimiento ilimitado

// ────────────────────────────────────────────────────────────────────────────

export interface ContinuousThought {
  /** Unique ID for this thought */
  id: string;

  /** When was this thought generated (ms since epoch) */
  timestamp: number;

  /** Which drive triggered this thought? */
  drive: "learning" | "entropy_minimization" | "adaptive_depth";

  /** The actual question/observation */
  question: string;

  /** Why this question? (explanation of uncertainty) */
  reasoning: string;

  /** Confidence that this is a genuine insight (0-1) */
  confidence: number;

  /** How much should this reduce uncertainty? (expected H reduction) */
  expectedEntropyReduction: number;

  /** Has this been acted upon? */
  processed: boolean;

  /** If processed, what was the result? */
  result?: {
    success: boolean;
    finding?: string;
    updatedUncertainty?: number;
  };
}

export interface ContinuousThinkingState {
  /** All thoughts generated in this session */
  thoughts: ContinuousThought[];

  /** Current internal entropy H(system) */
  internalEntropy: number;

  /** Causal graph uncertainty (how many unknowns remain?) */
  causalUncertainty: number;

  /** Last time continuous thinking ran */
  lastThinkingCycle: number;

  /** How many cycles have run since startup? */
  totalCycles: number;

  /** Is the thinking engine currently active? */
  isActive: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton instance
// ────────────────────────────────────────────────────────────────────────────

let _instance: ContinuousThinkingEngine | null = null;

function getInstance(): ContinuousThinkingEngine {
  if (!_instance) {
    _instance = new ContinuousThinkingEngine();
  }
  return _instance;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Engine
// ────────────────────────────────────────────────────────────────────────────

export class ContinuousThinkingEngine {
  private state: ContinuousThinkingState = {
    thoughts: [],
    internalEntropy: 1.0, // Start at max uncertainty
    causalUncertainty: 1.0,
    lastThinkingCycle: Date.now(),
    totalCycles: 0,
    isActive: true,
  };

  private thoughtCounter = 0;
  private kernel: OmegaSelfTimeKernelState | null = null;
  /** Ruta del workspace para persistencia — se establece en initialize() */
  private workspaceRoot: string | null = null;
  /** Indica si ya cargó el historial del disco */
  private loaded = false;

  /**
   * Initialize with kernel state and optionally workspace root for FS persistence.
   * Si se provee workspaceRoot, carga el historial previo del disco.
   */
  async initialize(kernel: OmegaSelfTimeKernelState, workspaceRoot?: string): Promise<void> {
    this.kernel = kernel;
    this.state.isActive = true;
    if (workspaceRoot && !this.loaded) {
      this.workspaceRoot = workspaceRoot;
      await this.loadFromDisk();
      this.loaded = true;
    }
  }

  /**
   * THE MAIN THINKING LOOP
   *
   * Genera pensamientos basados en incertidumbre medida.
   * Persiste los nuevos pensamientos en disco si workspaceRoot está configurado.
   */
  think(kernel: OmegaSelfTimeKernelState): ContinuousThought[] {
    if (!this.state.isActive) {
      return [];
    }

    this.kernel = kernel;
    this.state.totalCycles += 1;
    this.state.lastThinkingCycle = Date.now();

    const newThoughts: ContinuousThought[] = [];

    // Drive 1: Learning Loop - "What don't I understand?"
    const learningThoughts = this.generateLearningThoughts(kernel);
    newThoughts.push(...learningThoughts);

    // Drive 2: Entropy Minimization - "Where am I inconsistent?"
    const entropyThoughts = this.generateEntropyMinimizationThoughts(kernel);
    newThoughts.push(...entropyThoughts);

    // Drive 3: Adaptive Depth - "Where should I focus?"
    const depthThoughts = this.generateAdaptiveDepthThoughts(kernel);
    newThoughts.push(...depthThoughts);

    // Store all thoughts
    for (const thought of newThoughts) {
      this.state.thoughts.push(thought);
    }

    // Update uncertainty estimates
    this.updateUncertaintyMetrics(kernel);

    // Persist asíncronamente sin bloquear el loop
    if (newThoughts.length > 0 && this.workspaceRoot) {
      void this.persistToDisk(newThoughts);
    }

    return newThoughts;
  }

  /**
   * DRIVE 1: LEARNING LOOP
   *
   * Questions: "What patterns in my world don't I understand yet?"
   * Generates questions by finding high-entropy regions.
   */
  private generateLearningThoughts(kernel: OmegaSelfTimeKernelState): ContinuousThought[] {
    const thoughts: ContinuousThought[] = [];

    // Question 1: Unexplained correlations
    if (kernel.goals && kernel.goals.length > 0) {
      const successRate =
        kernel.goals.filter((g) => g.status === "completed").length / kernel.goals.length;
      const failureRate = 1 - successRate;

      if (failureRate > 0 && this.state.causalUncertainty > 0.3) {
        thoughts.push(
          this.createThought({
            drive: "learning",
            question: `Why do failures occur at rate ${(failureRate * 100).toFixed(1)}%? What causal factors drive success vs failure?`,
            reasoning:
              "High unexplained variance in outcomes suggests missing causal variables. Understanding these would improve predictions.",
            expectedEntropyReduction: failureRate * 0.3,
          }),
        );
      }
    }

    // Question 2: Pattern in tension history
    if (kernel.tension && kernel.identity) {
      const recentTension = kernel.tension.failureStreak || 0;

      if (recentTension > 2 && this.state.internalEntropy > 0.4) {
        thoughts.push(
          this.createThought({
            drive: "learning",
            question: `Current failure streak is ${recentTension}. Is this a random fluctuation or evidence of a systematic problem?`,
            reasoning:
              "Distinguishing signal from noise is fundamental to causal understanding. Sustained streaks suggest real causes.",
            expectedEntropyReduction: 0.15,
          }),
        );
      }
    }

    // Question 3: Unexplored memory relationships
    if (kernel.causalGraph && kernel.causalGraph.files) {
      const recentFiles = kernel.causalGraph.files.filter(
        (f) => typeof f.lastWriteTurn === "number" && kernel.turnCount - f.lastWriteTurn < 50,
      );

      if (recentFiles.length > 3 && this.state.causalUncertainty > 0.5) {
        thoughts.push(
          this.createThought({
            drive: "learning",
            question: `${recentFiles.length} files changed recently. Are these changes independent or part of coherent pattern?`,
            reasoning:
              "Understanding relationships between file changes could reveal hidden workflows or systemic patterns.",
            expectedEntropyReduction: 0.2,
          }),
        );
      }
    }

    return thoughts;
  }

  /**
   * DRIVE 2: ENTROPY MINIMIZATION
   *
   * Questions: "Where is my internal model contradictory or uncertain?"
   * Detects inconsistencies before they compound.
   */
  private generateEntropyMinimizationThoughts(
    kernel: OmegaSelfTimeKernelState,
  ): ContinuousThought[] {
    const thoughts: ContinuousThought[] = [];

    // Contradiction 1: Stale goals accumulating
    const staleGoals = kernel.goals?.filter((g) => g.status === "stale") || [];
    if (staleGoals.length > 0 && this.state.internalEntropy > 0.4) {
      thoughts.push(
        this.createThought({
          drive: "entropy_minimization",
          question: `I have ${staleGoals.length} stale goals still in memory. Should I abandon them, resurrect them, or understand why they stalled?`,
          reasoning:
            "Persistent pending goals create cognitive dissonance. Resolving this ambiguity is necessary for internal coherence.",
          expectedEntropyReduction: staleGoals.length * 0.1,
        }),
      );
    }

    // Contradiction 2: Identity inconsistency
    if (kernel.identity && kernel.identity.lastTask && kernel.activeGoalId) {
      const lastTaskRelated = kernel.goals?.some((g) => g.id === kernel.activeGoalId) || false;
      if (!lastTaskRelated && this.state.internalEntropy > 0.3) {
        thoughts.push(
          this.createThought({
            drive: "entropy_minimization",
            question: `My last task was "${kernel.identity.lastTask}" but now pursuing ${kernel.activeGoalId}. Is there continuity or did I lose context?`,
            reasoning:
              "Unexplained shifts in focus suggest missing context or failed memory retrieval. Should be understood.",
            expectedEntropyReduction: 0.15,
          }),
        );
      }
    }

    // Contradiction 3: Repeated failure types
    if (kernel.tension && kernel.tension.repeatedFailureKinds.length > 2) {
      const failurePattern = kernel.tension.repeatedFailureKinds.join(", ");
      thoughts.push(
        this.createThought({
          drive: "entropy_minimization",
          question: `Same failure types keep recurring: ${failurePattern}. Am I stuck in a loop? Why don't I adapt?`,
          reasoning:
            "Systematic failure despite recognition suggests a deeper issue: either poor learning, wrong assumptions, or actual constraint.",
          expectedEntropyReduction: 0.25,
        }),
      );
    }

    return thoughts;
  }

  /**
   * DRIVE 3: ADAPTIVE DEPTH
   *
   * Questions: "Where should I invest my cognitive resources?"
   * Prioritizes high-impact learning opportunities.
   */
  private generateAdaptiveDepthThoughts(kernel: OmegaSelfTimeKernelState): ContinuousThought[] {
    const thoughts: ContinuousThought[] = [];

    // Priority 1: High-cost decisions with high uncertainty
    if (kernel.goals && kernel.goals.filter((g) => g.status === "active").length > 0) {
      const activeWorkCount = kernel.goals.filter((g) => g.status === "active").length;

      if (activeWorkCount > 2 && this.state.causalUncertainty > 0.4) {
        thoughts.push(
          this.createThought({
            drive: "adaptive_depth",
            question: `I'm juggling ${activeWorkCount} concurrent tasks. Should I deepen focus on one or maintain parallel exploration?`,
            reasoning:
              "Resource allocation is key to efficiency. Understanding my own attention capacity would improve outcomes.",
            expectedEntropyReduction: 0.2,
          }),
        );
      }
    }

    // Priority 2: Highest-leverage learning area
    if (this.state.causalUncertainty > 0.6) {
      thoughts.push(
        this.createThought({
          drive: "adaptive_depth",
          question: `My causal understanding is still uncertain (${(this.state.causalUncertainty * 100).toFixed(0)}%). What single question, if answered, would reduce this most?`,
          reasoning:
            "Focusing on high-leverage questions accelerates learning. Need to identify which unknowns matter most.",
          expectedEntropyReduction: 0.3,
        }),
      );
    }

    // Priority 3: Feedback loops
    if (kernel.goals && kernel.goals.length > 3) {
      const completionRate =
        kernel.goals.filter((g) => g.status === "completed").length / kernel.goals.length;

      if (completionRate < 0.7) {
        thoughts.push(
          this.createThought({
            drive: "adaptive_depth",
            question: `My goal completion rate is ${(completionRate * 100).toFixed(0)}%. Should I pick different types of goals or improve execution?`,
            reasoning:
              "Understanding why I fail to complete goals is critical for adaptive improvement. Requires honest self-assessment.",
            expectedEntropyReduction: 0.25,
          }),
        );
      }
    }

    return thoughts;
  }

  /**
   * Update internal entropy metrics based on current state
   */
  private updateUncertaintyMetrics(kernel: OmegaSelfTimeKernelState): void {
    // Calculate entropy from goal distribution
    if (kernel.goals && kernel.goals.length > 0) {
      const statusCounts = {
        completed: kernel.goals.filter((g) => g.status === "completed").length,
        active: kernel.goals.filter((g) => g.status === "active").length,
        stale: kernel.goals.filter((g) => g.status === "stale").length,
      };

      // Shannon entropy: H = -Σ p_i * log(p_i)
      let entropy = 0;
      for (const count of Object.values(statusCounts)) {
        if (count > 0) {
          const p = count / kernel.goals.length;
          entropy -= p * Math.log2(p);
        }
      }

      // Normalize to 0-1 range
      this.state.internalEntropy = entropy / Math.log2(3); // 3 possible states
    }

    // Causal uncertainty: normalized by number of unexplained failures
    if (kernel.tension) {
      const failureStreakNorm = Math.min(1.0, kernel.tension.failureStreak / 5);
      const repeatedFailuresNorm = Math.min(1.0, kernel.tension.repeatedFailureKinds.length / 4);
      this.state.causalUncertainty = (failureStreakNorm + repeatedFailuresNorm) / 2;
    }

    // Decay uncertainty over time (as we learn, certainty improves)
    const cyclesSinceStart = this.state.totalCycles;
    const decayFactor = Math.max(0.5, 1 - cyclesSinceStart / 200); // Asymptotic learning
    this.state.internalEntropy *= decayFactor;
    this.state.causalUncertainty *= decayFactor;
  }

  /**
   * Create a thought with all fields.
   * La confianza se deriva del estado real del kernel (no aleatoriedad).
   */
  private createThought(params: {
    drive: "learning" | "entropy_minimization" | "adaptive_depth";
    question: string;
    reasoning: string;
    expectedEntropyReduction?: number;
  }): ContinuousThought {
    this.thoughtCounter += 1;

    // Confianza derivada del estado del kernel (no random)
    let confidence = 0.5;
    if (this.kernel) {
      const totalGoals = this.kernel.goals.length || 1;
      const successRate =
        this.kernel.goals.filter((g) => g.status === "completed").length / totalGoals;
      const stabilityFactor = Math.max(0, 1 - this.kernel.tension.failureStreak / 5);
      confidence = successRate * 0.5 + stabilityFactor * 0.5;
      confidence = Math.max(0.1, Math.min(0.95, confidence));
    }

    return {
      id: `thought_${this.state.totalCycles}_${this.thoughtCounter}`,
      timestamp: Date.now(),
      drive: params.drive,
      question: params.question,
      reasoning: params.reasoning,
      confidence,
      expectedEntropyReduction: params.expectedEntropyReduction ?? 0.15,
      processed: false,
    };
  }

  /**
   * Mark a thought as processed and update result
   */
  processThought(
    id: string,
    result: { success: boolean; finding?: string; updatedUncertainty?: number },
  ): void {
    const thought = this.state.thoughts.find((t) => t.id === id);
    if (thought) {
      thought.processed = true;
      thought.result = result;

      // Update internal uncertainty if provided
      if (result.updatedUncertainty !== undefined) {
        this.state.internalEntropy = result.updatedUncertainty;
      }
    }
  }

  /**
   * Get current thinking state
   */
  getState(): ContinuousThinkingState {
    return { ...this.state };
  }

  /**
   * Get unprocessed thoughts (actions to take)
   */
  getUnprocessedThoughts(): ContinuousThought[] {
    return this.state.thoughts.filter((t) => !t.processed);
  }

  /**
   * Statistics for auditing
   */
  getStats(): {
    totalThoughts: number;
    unprocessedThoughts: number;
    avgConfidence: number;
    thoughtsByDrive: Record<string, number>;
    internalEntropy: number;
    causalUncertainty: number;
    totalCycles: number;
  } {
    const avgConfidence =
      this.state.thoughts.length > 0
        ? this.state.thoughts.reduce((sum, t) => sum + t.confidence, 0) / this.state.thoughts.length
        : 0;

    const thoughtsByDrive: Record<string, number> = {
      learning: 0,
      entropy_minimization: 0,
      adaptive_depth: 0,
    };

    for (const thought of this.state.thoughts) {
      thoughtsByDrive[thought.drive]++;
    }

    return {
      totalThoughts: this.state.thoughts.length,
      unprocessedThoughts: this.getUnprocessedThoughts().length,
      avgConfidence,
      thoughtsByDrive,
      internalEntropy: this.state.internalEntropy,
      causalUncertainty: this.state.causalUncertainty,
      totalCycles: this.state.totalCycles,
    };
  }

  // ── Persistencia en FS ──────────────────────────────────────────────────────

  /**
   * Carga historial de pensamientos desde .openskynet/omega-thoughts.jsonl.
   * Solo carga los últimos MAX_PERSISTED_THOUGHTS para no sobrecargar memoria.
   */
  private async loadFromDisk(): Promise<void> {
    if (!this.workspaceRoot) return;
    const filePath = path.join(this.workspaceRoot, ".openskynet", THOUGHTS_FILENAME);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      const recent = lines.slice(-MAX_PERSISTED_THOUGHTS);
      const loaded: ContinuousThought[] = [];
      for (const line of recent) {
        try {
          loaded.push(JSON.parse(line) as ContinuousThought);
        } catch {
          // Línea corrupta — ignorar
        }
      }
      // Merge con estado actual (los del historial van primero)
      this.state.thoughts = [...loaded, ...this.state.thoughts];
      // Recalcular contador para evitar colisiones de ID
      this.thoughtCounter = loaded.length;
    } catch {
      // Archivo no existe aún — primera ejecución
    }
  }

  /**
   * Persiste pensamientos nuevos en JSONL (append-only para eficiencia).
   * Si el archivo supera MAX_PERSISTED_THOUGHTS líneas, rota (trunca antiguas).
   */
  private async persistToDisk(newThoughts: ContinuousThought[]): Promise<void> {
    if (!this.workspaceRoot || newThoughts.length === 0) return;
    const dir = path.join(this.workspaceRoot, ".openskynet");
    const filePath = path.join(dir, THOUGHTS_FILENAME);
    try {
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      const lines = newThoughts.map((t) => JSON.stringify(t)).join("\n") + "\n";
      await fs.appendFile(filePath, lines, "utf-8");

      // Rotación: si el archivo crece demasiado, mantener solo las últimas N líneas
      const full = await fs.readFile(filePath, "utf-8");
      const allLines = full.trim().split("\n").filter(Boolean);
      if (allLines.length > MAX_PERSISTED_THOUGHTS) {
        const trimmed = allLines.slice(-MAX_PERSISTED_THOUGHTS).join("\n") + "\n";
        await fs.writeFile(filePath, trimmed, "utf-8");
      }
    } catch {
      // Error de I/O — ignorar silenciosamente para no interrumpir el loop
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export function getContinuousThinkingEngine(): ContinuousThinkingEngine {
  return getInstance();
}

export function initializeContinuousThinkingEngine(
  kernel?: OmegaSelfTimeKernelState,
): ContinuousThinkingEngine {
  const engine = getInstance();
  if (kernel) {
    engine.initialize(kernel);
  }
  return engine;
}
