import type {
  ActiveLearningStrategy,
  ExperimentalHypothesis,
  LearningStrategy,
} from "../active-learning-strategy.js";
import type { ContinuousThinkingEngine, ContinuousThought } from "../continuous-thinking-engine.js";
import type { Contradiction, EntropyMinimizationLoop } from "../entropy-minimization-loop.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";

export type OmegaContinuousThinkingAdapter = {
  id: "continuous-thinking";
  think: (kernel: OmegaSelfTimeKernelState) => ContinuousThought[];
  getStats: ContinuousThinkingEngine["getStats"];
};

export type OmegaEntropyMinimizationAdapter = {
  id: "entropy-minimization";
  detectContradictions: (
    state: Record<string, unknown>,
  ) => ReturnType<EntropyMinimizationLoop["detectContradictions"]>;
};

export type OmegaActiveLearningAdapter = {
  id: "active-learning";
  generateHypothesis: ActiveLearningStrategy["generateHypothesis"];
  updateHypothesis: ActiveLearningStrategy["updateHypothesis"];
  getState: () => LearningStrategy;
};

export type OmegaJepaEmpiricalAdapter = {
  id: "jepa-empirical";
  logSample: (params: {
    workspaceRoot: string;
    sessionKey: string;
    kernel: OmegaSelfTimeKernelState;
  }) => Promise<void>;
  analyzeCorrelation: (workspaceRoot: string) => Promise<{
    correlationScore: number | null;
    totalEvents: number;
  }>;
};

export type OmegaEngineSignal =
  | {
      source: "continuous-thinking";
      kind: "thought";
      severity: number;
      summary: string;
      thoughtId: string;
      drive: ContinuousThought["drive"];
    }
  | {
      source: "entropy-minimization";
      kind: "contradiction";
      severity: number;
      summary: string;
      contradictionKind: Contradiction["kind"];
    }
  | {
      source: "active-learning";
      kind: "hypothesis_generated" | "hypothesis_tested";
      severity: number;
      summary: string;
      hypothesisId: string;
      confirmed?: boolean;
    }
  | {
      source: "jepa-empirical";
      kind: "correlation";
      severity: number;
      summary: string;
      correlationScore: number | null;
      totalEvents: number;
    };

export type OmegaKernelSignalCollection = {
  thoughts: ContinuousThought[];
  contradictions: Contradiction[];
  generatedHypotheses: ExperimentalHypothesis[];
  signals: OmegaEngineSignal[];
};

export type OmegaHypothesisSignalCollection = {
  jepaEvaluation: {
    correlationScore: number | null;
    totalEvents: number;
  };
  testedHypotheses: Array<{
    hypothesisId: string;
    evidence: string;
    confirmed: boolean;
  }>;
  signals: OmegaEngineSignal[];
};

export type OmegaHeartbeatEngineRegistry = {
  continuousThinking: OmegaContinuousThinkingAdapter;
  entropyMinimization: OmegaEntropyMinimizationAdapter;
  activeLearning: OmegaActiveLearningAdapter;
  jepaEmpirical: OmegaJepaEmpiricalAdapter;
  collectKernelSignals: (params: {
    kernel: OmegaSelfTimeKernelState;
    minEntropyReduction: number;
    maxThoughtConfidence: number;
  }) => OmegaKernelSignalCollection;
  testUntestedHypotheses: (params: {
    workspaceRoot: string;
    maxHypothesesToTest: number;
    correlationConfirmationThreshold: number;
  }) => Promise<OmegaHypothesisSignalCollection>;
};

export type { ContinuousThought, Contradiction, ExperimentalHypothesis };
