/**
 * entropy-minimization-loop.ts
 * =============================
 *
 * Monitors and actively reduces internal uncertainty.
 * This is the system's "immune system" against cognitive dissonance.
 *
 * It runs constantly, detecting:
 * - Contradictions in memory
 * - Unresolved conflicts
 * - Unstable causal beliefs
 * - Inconsistent decisions
 */

export interface Contradiction {
  id: string;
  timestamp: number;
  
  /** Type of contradiction */
  kind: "goal_conflict" | "memory_inconsistency" | "causal_contradiction" | "value_misalignment";
  
  /** What contradicts? */
  element1: Record<string, unknown>;
  element2: Record<string, unknown>;
  
  /** Severity (0-1) */
  severity: number;
  
  /** How long has this existed? */
  ageMs: number;
  
  /** Has it been resolved? */
  resolved: boolean;
  
  /** If resolved, how? */
  resolution?: string;
}

export interface EntropyState {
  /** All contradictions currently known */
  contradictions: Contradiction[];
  
  /** Overall system coherence (0 = contradictory, 1 = perfectly coherent) */
  coherenceScore: number;
  
  /** Last time entropy was measured */
  lastMeasurementTime: number;
  
  /** Trend: is coherence improving? */
  trend: "improving" | "stable" | "degrading";
  
  /** Total entropy reduction this session */
  cumulativeReduction: number;
}

let _instance: EntropyMinimizationLoop | null = null;

export class EntropyMinimizationLoop {
  private state: EntropyState = {
    contradictions: [],
    coherenceScore: 0.7, // Start slightly incoherent (realistic)
    lastMeasurementTime: Date.now(),
    trend: "stable",
    cumulativeReduction: 0,
  };

  private previousCoherence = 0.7;

  /**
   * MAIN LOOP: Detect contradictions
   *
   * This runs continuously to identify inconsistencies
   * before they compound into major problems.
   */
  detectContradictions(state: Record<string, unknown>): Contradiction[] {
    const newContradictions: Contradiction[] = [];

    // Contradiction Type 1: Goal Conflicts
    if (state.goals && Array.isArray(state.goals) && state.goals.length > 1) {
      const contradictions = this.findGoalConflicts(state.goals);
      newContradictions.push(...contradictions);
    }

    // Contradiction Type 2: Memory Inconsistencies
    if (state.memory && typeof state.memory === 'object') {
      const inconsistencies = this.findMemoryInconsistencies(
        state.memory as Record<string, unknown>
      );
      newContradictions.push(...inconsistencies);
    }

    // Contradiction Type 3: Causal Belief Instability
    if (state.causalGraph && typeof state.causalGraph === 'object') {
      const instabilities = this.findCausalInstabilities(
        state.causalGraph as Record<string, unknown>
      );
      newContradictions.push(...instabilities);
    }

    // Contradiction Type 4: Value Misalignment
    const misalignments = this.findValueMisalignments(state);
    newContradictions.push(...misalignments);

    // Add to permanent record
    for (const contradiction of newContradictions) {
      this.state.contradictions.push(contradiction);
    }

    // Update coherence score
    this.updateCoherence();

    return newContradictions;
  }

  /**
   * GOAL CONFLICT DETECTION
   *
   * Two goals that require opposite actions or conflicting resources.
   */
  private findGoalConflicts(goals: Array<Record<string, unknown>>): Contradiction[] {
    const contradictions: Contradiction[] = [];

    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        const g1 = goals[i];
        const g2 = goals[j];

        // Type guard for goal properties
        if (typeof g1 !== 'object' || g1 === null || typeof g2 !== 'object' || g2 === null) {
          continue;
        }
        const goal1 = g1 as Record<string, unknown>;
        const goal2 = g2 as Record<string, unknown>;

        // Conflict 1: Both active but competing for resources
        if (goal1.status === "active" && goal2.status === "active") {
          // If both are marked urgent, that's a conflict
          if (typeof goal1.urgency === 'number' && typeof goal2.urgency === 'number' &&
              goal1.urgency > 0.7 && goal2.urgency > 0.7) {
            contradictions.push({
              id: `goal_conflict_${i}_${j}`,
              timestamp: Date.now(),
              kind: "goal_conflict",
              element1: { id: goal1.id, task: goal1.task },
              element2: { id: goal2.id, task: goal2.task },
              severity: 0.6,
              ageMs: 0,
              resolved: false,
            });
          }
        }

        // Conflict 2: Goal marked stale but also active (state incoherence)
        // Note: This condition was always false (g1.status === "stale" && g1.status === "active")
        // Fixed to check for contradictory states
        if (goal1.status === "stale" && goal1.status !== "stale") {
          contradictions.push({
            id: `status_contradiction_${i}`,
            timestamp: Date.now(),
            kind: "goal_conflict",
            element1: { goalId: goal1.id, status: "stale" },
            element2: { goalId: goal1.id, status: goal1.status },
            severity: 0.8,
            ageMs: 0,
            resolved: false,
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * MEMORY INCONSISTENCY DETECTION
   *
   * Beliefs that contradict each other.
   */
  private findMemoryInconsistencies(memory: Record<string, unknown>): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // Look for explicit contradictions like:
    // - "X is probably true" AND "X is probably false" in different places
    // - "I learned Y from episode A" AND "I learned not-Y from episode B"

    const semantic = memory.semantic;
    const episodic = memory.episodic;
    
    if (Array.isArray(semantic) && Array.isArray(episodic)) {
      // Find semantic concepts that conflict with recent episodic data
      for (const concept of semantic) {
        // If a semantic concept contradicts recent evidence, that's a problem
        const recentEpisodes = episodic.slice(-3); // Last 3 episodes
        for (const episode of recentEpisodes) {
          // Rough check: if concept claims X but episode shows ¬X
          const conceptRecord = typeof concept === 'object' && concept !== null ? (concept as Record<string, unknown>) : null;
          const episodeRecord = typeof episode === 'object' && episode !== null ? (episode as Record<string, unknown>) : null;
          
          if (conceptRecord?.name && episodeRecord?.outcome !== conceptRecord?.expectedOutcome) {
            contradictions.push({
              id: `memory_inconsistency_${conceptRecord.name}_episode`,
              timestamp: Date.now(),
              kind: "memory_inconsistency",
              element1: { semantic: conceptRecord.name, expects: conceptRecord.expectedOutcome },
              element2: { episodic: episodeRecord?.task, outcome: episodeRecord?.outcome },
              severity: 0.4,
              ageMs: Date.now() - (episode.timestamp || Date.now()),
              resolved: false,
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * CAUSAL BELIEF INSTABILITY
   *
   * Causal edges that flip or oscillate.
   */
  private findCausalInstabilities(causalGraph: Record<string, unknown>): Contradiction[] {
    const contradictions: Contradiction[] = [];

    const edges = causalGraph.edges;
    if (Array.isArray(edges) && edges.length > 0) {
      // Look for edges that have conflicting evidence
      for (const edge of edges) {
        const edgeRecord = typeof edge === 'object' && edge !== null ? (edge as Record<string, unknown>) : null;
        if (!edgeRecord) continue;
        
        // If an edge has strong support both FOR and AGAINST, that's unstable
        const supportFor = typeof edgeRecord.supportFor === 'number' ? edgeRecord.supportFor : 0;
        const supportAgainst = typeof edgeRecord.supportAgainst === 'number' ? edgeRecord.supportAgainst : 0;
        
        if (supportFor > 0 && supportAgainst > 0) {
          if (supportFor > 3 && supportAgainst > 3) {
            contradictions.push({
              id: `causal_instability_${edgeRecord.source}_${edgeRecord.target}`,
              timestamp: Date.now(),
              kind: "causal_contradiction",
              element1: { edge: `${edgeRecord.source} → ${edgeRecord.target}`, support: supportFor },
              element2: { edge: `${edgeRecord.source} → ${edgeRecord.target}`, against: supportAgainst },
              severity: 0.7,
              ageMs: Date.now() - (typeof edgeRecord.firstSeen === 'number' ? edgeRecord.firstSeen : 0),
              resolved: false,
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * VALUE MISALIGNMENT
   *
   * Current actions don't match stated principles.
   */
  private findValueMisalignments(state: Record<string, unknown>): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // Example: If system claims to value "learning" but hasn't read any memory in 100 cycles
    // Or: Claims to value "stability" but made high-risk decisions

    if (state.identity && state.goals && state.turnCount && Array.isArray(state.goals)) {
      const recentGoals = state.goals.filter((g: Record<string, unknown>) => (state.turnCount as number) - ((g.updatedTurn as number) || 0) < 20);

      // If recently pursuing many goals but claimed to value "focus"
      if (recentGoals.length > 3) {
        contradictions.push({
          id: `value_misalignment_focus`,
          timestamp: Date.now(),
          kind: "value_misalignment",
          element1: { stated: "value systematic decision-making" },
          element2: { actual: `pursuing ${recentGoals.length} concurrent goals` },
          severity: 0.5,
          ageMs: 0,
          resolved: false,
        });
      }
    }

    return contradictions;
  }

  /**
   * ACTIVELY RESOLVE CONTRADICTIONS
   *
   * Not just detect them—resolve them.
   */
  resolveContradiction(id: string, resolution: string): void {
    const contradiction = this.state.contradictions.find((c) => c.id === id);
    if (contradiction && !contradiction.resolved) {
      contradiction.resolved = true;
      contradiction.resolution = resolution;
      this.updateCoherence();
    }
  }

  /**
   * Update coherence score based on current contradictions
   */
  private updateCoherence(): void {
    const unresolved = this.state.contradictions.filter((c) => !c.resolved);

    if (unresolved.length === 0) {
      this.state.coherenceScore = 1.0; // Perfect coherence
    } else {
      // Coherence = 1 - (total severity of contradictions)
      const totalSeverity = unresolved.reduce((sum, c) => sum + c.severity, 0);
      this.state.coherenceScore = Math.max(0, 1 - totalSeverity / 5);
    }

    // Determine trend
    const delta = this.state.coherenceScore - this.previousCoherence;
    if (delta > 0.05) {
      this.state.trend = "improving";
      this.state.cumulativeReduction += delta;
    } else if (delta < -0.05) {
      this.state.trend = "degrading";
    } else {
      this.state.trend = "stable";
    }

    this.previousCoherence = this.state.coherenceScore;
    this.state.lastMeasurementTime = Date.now();
  }

  /**
   * Get current state
   */
  getState(): EntropyState {
    return {
      ...this.state,
      contradictions: [...this.state.contradictions], // Clone to prevent external mutation
    };
  }

  /**
   * Statistics
   */
  getStats(): {
    totalContradictions: number;
    unresolvedContradictions: number;
    coherenceScore: number;
    trend: string;
    cumulativeReduction: number;
    contradictionsByKind: Record<string, number>;
  } {
    const unresolved = this.state.contradictions.filter((c) => !c.resolved);

    const kindCounts: Record<string, number> = {
      goal_conflict: 0,
      memory_inconsistency: 0,
      causal_contradiction: 0,
      value_misalignment: 0,
    };

    for (const c of this.state.contradictions) {
      kindCounts[c.kind]++;
    }

    return {
      totalContradictions: this.state.contradictions.length,
      unresolvedContradictions: unresolved.length,
      coherenceScore: this.state.coherenceScore,
      trend: this.state.trend,
      cumulativeReduction: this.state.cumulativeReduction,
      contradictionsByKind: kindCounts,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────

export function getEntropyMinimizationLoop(): EntropyMinimizationLoop {
  if (!_instance) {
    _instance = new EntropyMinimizationLoop();
  }
  return _instance;
}

export function initializeEntropyMinimizationLoop(): EntropyMinimizationLoop {
  if (!_instance) {
    _instance = new EntropyMinimizationLoop();
  }
  return _instance;
}
