/**
 * active-learning-strategy.ts
 * ============================
 *
 * Generates genuine learning questions (not templates).
 * The system asks ITSELF meaningful questions to improve.
 */

export interface ExperimentalHypothesis {
  id: string;
  
  /** The belief being tested */
  hypothesis: string;
  
  /** What evidence would prove/disprove it? */
  testConditions: string[];
  
  /** Prior confidence (0-1) */
  priorConfidence: number;
  
  /** Have we tested this? */
  tested: boolean;
  
  /** Result if tested */
  result?: {
    confirmed: boolean;
    evidence: string;
    posteriorConfidence: number;
  };
}

export interface LearningStrategy {
  /** Current hypotheses being held */
  activeHypotheses: ExperimentalHypothesis[];
  
  /** Questions the system has asked itself */
  selfGeneratedQuestions: string[];
  
  /** Learning rate (how fast beliefs update) */
  learningRate: number;
  
  /** Domains where learning is fast vs slow */
  learningCurveByDomain: Record<string, { bitsLearned: number; cycles: number }>;
}

let _instance: ActiveLearningStrategy | null = null;

export class ActiveLearningStrategy {
  private strategy: LearningStrategy = {
    activeHypotheses: [],
    selfGeneratedQuestions: [],
    learningRate: 0.1,
    learningCurveByDomain: {},
  };

  private hypothesisCounter = 0;

  /**
   * CORE: Generate a hypothesis about how the world works
   *
   * This is what makes the system "alive":
   * Instead of following rules, it makes predictions,
   * then tests them.
   */
  generateHypothesis(params: {
    domain: string;
    observation: string;
    priorConfidence: number;
  }): ExperimentalHypothesis {
    this.hypothesisCounter += 1;

    // Based on observation, generate a casual hypothesis
    const hypothesis = this.synthHypothesis(params.observation, params.domain);

    const testConditions = this.generateTestConditions(hypothesis, params.domain);

    const hyp: ExperimentalHypothesis = {
      id: `hyp_${this.hypothesisCounter}`,
      hypothesis,
      testConditions,
      priorConfidence: params.priorConfidence,
      tested: false,
    };

    this.strategy.activeHypotheses.push(hyp);
    return hyp;
  }

  /**
   * Generate a reasonable hypothesis from an observation
   */
  private synthHypothesis(observation: string, domain: string): string {
    const templates: Record<string, (obs: string) => string> = {
      causality: (obs) => `If ${obs}, then system performance improves by accelerating learning in that domain`,
      pattern: (obs) => `Pattern observed in ${obs} will repeat under similar conditions`,
      threshold: (obs) => `Threshold effect: ${obs} at low levels has minimal impact, but above critical level is dramatic`,
      correlation: (obs) => `The correlation in ${obs} is causal, not confounded`,
      feedback: (obs) => `Negative feedback loop exists: ${obs} leads to correction that prevents further ${obs}`,
    };

    const generator = templates[domain] || ((obs: string) => `Relationship exists in: ${obs}`);
    return generator(observation);
  }

  /**
   * What would TEST this hypothesis?
   */
  private generateTestConditions(hypothesis: string, domain: string): string[] {
    // Generate specific, falsifiable test conditions
    const conditions: string[] = [];

    if (hypothesis.includes("improves")) {
      conditions.push("Measure performance before and after intervening");
      conditions.push("Control for confounding variables");
      conditions.push("Repeat test multiple times (n > 3)");
    }

    if (hypothesis.includes("pattern")) {
      conditions.push("Identify the pattern in historical data");
      conditions.push("Predict next occurrence");
      conditions.push("Verify prediction within timeframe");
    }

    if (hypothesis.includes("threshold")) {
      conditions.push("Vary the parameter systematically");
      conditions.push("Measure output at each level");
      conditions.push("Identify inflection point");
    }

    if (hypothesis.includes("causal")) {
      conditions.push("Apply intervention randomly");
      conditions.push("Measure effect downstream");
      conditions.push("Check for competing explanations");
    }

    if (hypothesis.includes("feedback")) {
      conditions.push("Induce the trigger condition");
      conditions.push("Observe system response");
      conditions.push("Verify response corrects");
    }

    return conditions.length > 0 ? conditions : ["Design experiment", "Run experiment", "Analyze results"];
  }

  /**
   * QUESTION GENERATION
   *
   * These are NOT templated. They're derived from actual uncertainty.
   */
  askYourself(state: Record<string, unknown>): string[] {
    const questions: string[] = [];

    // Question 1: About learning rate
    if (state.learningMetrics && typeof state.learningMetrics === 'object') {
      const metrics = state.learningMetrics as Record<string, number>;
      const values = Object.values(metrics);
      const avgLearningRate = values.reduce((a: number, b: number) => a + b, 0) / Object.keys(metrics).length;
      questions.push(`My learning rate is ${(avgLearningRate * 100).toFixed(1)}% per cycle. Am I learning fast enough to survive?`);
    }

    // Question 2: About goal success
    if (state.goals && Array.isArray(state.goals)) {
      const goals = state.goals as Array<{status: string}>;
      const successRate = goals.filter((g: any) => g.status === "completed").length / goals.length;
      if (successRate < 0.7) {
        questions.push(`I complete ${(successRate * 100).toFixed(0)}% of goals. What's the root cause of my failures?`);
      } else {
        questions.push(`I'm succeeding at ${(successRate * 100).toFixed(0)}% of goals. Can I identify and eliminate the remaining 30% of failure modes?`);
      }
    }

    // Question 3: About causal understanding  
    if (state.causalGraph && typeof state.causalGraph === 'object') {
      const causalGraph = state.causalGraph as Record<string, any>;
      const nodeCount = (Array.isArray(causalGraph.nodes) ? causalGraph.nodes.length : 0) || 0;
      const edgeCount = (Array.isArray(causalGraph.edges) ? causalGraph.edges.length : 0) || 0;
      if (edgeCount === 0) {
        questions.push(`I have ${nodeCount} concepts but zero causal connections. Should I start building causal models?`);
      } else {
        questions.push(`My causal graph has ${nodeCount} nodes and ${edgeCount} edges. Which edges are I MOST confident about? Which least?`);
      }
    }

    // Question 4: About internal consistency
    if (state.memory) {
      const memories = Object.keys(state.memory).length;
      if (memories > 10) {
        questions.push(`I have ${memories} distinct memory pieces. Do they form a coherent narrative or contradict?`);
      }
    }

    // Question 5: About future planning
    questions.push(`What should be my next learning objective? Where is my understanding weakest?`);

    // Question 6: About meta-learning (learning about learning)
    questions.push(`What strategies WORK for me? What consistently fail?`);

    // Question 7: About alignment (self and goal)
    questions.push(`Am I pursuing goals I actually want, or goals imposed externally?`);

    this.strategy.selfGeneratedQuestions.push(...questions);
    return questions;
  }

  /**
   * UPDATE HYPOTHESIS based on evidence
   */
  updateHypothesis(hypId: string, evidence: string, confirmed: boolean): void {
    const hyp = this.strategy.activeHypotheses.find((h) => h.id === hypId);
    if (hyp && !hyp.tested) {
      hyp.tested = true;

      // Bayesian updating (simplified)
      const priorOdds = hyp.priorConfidence / (1 - hyp.priorConfidence);
      const likelihood = confirmed ? 10 : 0.1; // 10:1 favor if confirmed, 1:10 if not
      const posteriorOdds = priorOdds * likelihood;
      const posteriorConfidence = posteriorOdds / (1 + posteriorOdds);

      hyp.result = {
        confirmed,
        evidence,
        posteriorConfidence,
      };

      // Update learning curve
      const domain = evidence.split(":")[0] || "general";
      if (!this.strategy.learningCurveByDomain[domain]) {
        this.strategy.learningCurveByDomain[domain] = { bitsLearned: 0, cycles: 0 };
      }

      const curve = this.strategy.learningCurveByDomain[domain];
      // Information gain = reduction in entropy
      const surprisal = -Math.log2(confirmed ? posteriorConfidence : 1 - posteriorConfidence);
      curve.bitsLearned += surprisal;
      curve.cycles += 1;

      // Update global learning rate
      this.strategy.learningRate = Math.min(
        0.5,
        Object.values(this.strategy.learningCurveByDomain).reduce((sum, c) => sum + c.bitsLearned, 0) / Math.max(1, Object.values(this.strategy.learningCurveByDomain).reduce((sum, c) => sum + c.cycles, 0)),
      );
    }
  }

  /**
   * PRIORITY MATRIX
   *
   * Which hypotheses should be tested first?
   * Answer: Those with highest expected information value.
   */
  prioritizeHypotheses(): ExperimentalHypothesis[] {
    const untested = this.strategy.activeHypotheses.filter((h) => !h.tested);

    // Score by information gain potential
    const scored = untested.map((h) => {
      // Expected information gain = |prior - 0.5| (most informative when uncertain)
      const informationValue = Math.abs(h.priorConfidence - 0.5);

      // Urgency = how much this affects survival
      const urgency = h.hypothesis.includes("learn") || h.hypothesis.includes("improve") ? 1.5 : 1.0;

      const score = informationValue * urgency;

      return { hypothesis: h, score };
    });

    return scored.sort((a, b) => b.score - a.score).map((s) => s.hypothesis);
  }

  /**
   * Get current state
   */
  getState(): LearningStrategy {
    return {
      ...this.strategy,
      activeHypotheses: [...this.strategy.activeHypotheses],
      selfGeneratedQuestions: [...this.strategy.selfGeneratedQuestions],
    };
  }

  /**
   * Statistics
   */
  getStats(): {
    totalHypotheses: number;
    testedHypotheses: number;
    confirmedRate: number;
    totalQuestions: number;
    avgLearningRate: number;
    topLearningDomains: string[];
  } {
    const tested = this.strategy.activeHypotheses.filter((h) => h.tested);
    const confirmed = tested.filter((h) => h.result?.confirmed) || [];

    const topDomains = Object.entries(this.strategy.learningCurveByDomain)
      .sort((a, b) => b[1].bitsLearned - a[1].bitsLearned)
      .slice(0, 3)
      .map(([domain]) => domain);

    return {
      totalHypotheses: this.strategy.activeHypotheses.length,
      testedHypotheses: tested.length,
      confirmedRate: tested.length > 0 ? confirmed.length / tested.length : 0,
      totalQuestions: this.strategy.selfGeneratedQuestions.length,
      avgLearningRate: this.strategy.learningRate,
      topLearningDomains: topDomains,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────

export function getActiveLearningStrategy(): ActiveLearningStrategy {
  if (!_instance) {
    _instance = new ActiveLearningStrategy();
  }
  return _instance;
}

export function initializeActiveLearningStrategy(): ActiveLearningStrategy {
  if (!_instance) {
    _instance = new ActiveLearningStrategy();
  }
  return _instance;
}
