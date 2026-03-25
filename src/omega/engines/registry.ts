import { getActiveLearningStrategy } from "../active-learning-strategy.js";
import { getContinuousThinkingEngine } from "../continuous-thinking-engine.js";
import { getEntropyMinimizationLoop } from "../entropy-minimization-loop.js";
import { analyzeJepaCorrelation, logJepaSample } from "../jepa-empirical-logger.js";
import type {
  OmegaEngineSignal,
  OmegaHeartbeatEngineRegistry,
  OmegaHypothesisSignalCollection,
  OmegaKernelSignalCollection,
} from "./types.js";

let cachedRegistry: OmegaHeartbeatEngineRegistry | null = null;

function summarizeContradiction(
  contradiction: OmegaKernelSignalCollection["contradictions"][number],
): string {
  const left =
    typeof contradiction.element1.task === "string"
      ? contradiction.element1.task
      : typeof contradiction.element1.goalId === "string"
        ? contradiction.element1.goalId
        : contradiction.kind;
  const right =
    typeof contradiction.element2.task === "string"
      ? contradiction.element2.task
      : typeof contradiction.element2.goalId === "string"
        ? contradiction.element2.goalId
        : contradiction.kind;
  return `${contradiction.kind}:${left}:${right}`;
}

function buildKernelSignals(params: OmegaKernelSignalCollection): OmegaEngineSignal[] {
  const thoughtSignals: OmegaEngineSignal[] = params.thoughts.map((thought) => ({
    source: "continuous-thinking",
    kind: "thought",
    severity: thought.expectedEntropyReduction,
    summary: thought.question,
    thoughtId: thought.id,
    drive: thought.drive,
  }));
  const contradictionSignals: OmegaEngineSignal[] = params.contradictions.map((contradiction) => ({
    source: "entropy-minimization",
    kind: "contradiction",
    severity: contradiction.severity,
    summary: summarizeContradiction(contradiction),
    contradictionKind: contradiction.kind,
  }));
  const generatedSignals: OmegaEngineSignal[] = params.generatedHypotheses.map((hypothesis) => ({
    source: "active-learning",
    kind: "hypothesis_generated",
    severity: 1 - hypothesis.priorConfidence,
    summary: hypothesis.hypothesis,
    hypothesisId: hypothesis.id,
  }));
  return [...thoughtSignals, ...contradictionSignals, ...generatedSignals];
}

function buildHypothesisSignals(
  params: OmegaHypothesisSignalCollection,
): OmegaHypothesisSignalCollection {
  const signals: OmegaEngineSignal[] = [
    {
      source: "jepa-empirical",
      kind: "correlation",
      severity: Math.abs(params.jepaEvaluation.correlationScore ?? 0),
      summary: `jepa_correlation=${params.jepaEvaluation.correlationScore ?? "null"} events=${params.jepaEvaluation.totalEvents}`,
      correlationScore: params.jepaEvaluation.correlationScore,
      totalEvents: params.jepaEvaluation.totalEvents,
    },
    ...params.testedHypotheses.map((result) => ({
      source: "active-learning" as const,
      kind: "hypothesis_tested" as const,
      severity: result.confirmed ? 1 : 0.5,
      summary: result.evidence,
      hypothesisId: result.hypothesisId,
      confirmed: result.confirmed,
    })),
  ];
  return {
    ...params,
    signals,
  };
}

export function getOmegaHeartbeatEngineRegistry(): OmegaHeartbeatEngineRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  cachedRegistry = {
    continuousThinking: {
      id: "continuous-thinking",
      think: (kernel) => getContinuousThinkingEngine().think(kernel),
      getStats: () => getContinuousThinkingEngine().getStats(),
    },
    entropyMinimization: {
      id: "entropy-minimization",
      detectContradictions: (state) => getEntropyMinimizationLoop().detectContradictions(state),
    },
    activeLearning: {
      id: "active-learning",
      generateHypothesis: (params) => getActiveLearningStrategy().generateHypothesis(params),
      updateHypothesis: (hypId, evidence, confirmed) =>
        getActiveLearningStrategy().updateHypothesis(hypId, evidence, confirmed),
      getState: () => getActiveLearningStrategy().getState(),
    },
    jepaEmpirical: {
      id: "jepa-empirical",
      logSample: (params) => logJepaSample(params),
      analyzeCorrelation: (workspaceRoot) => analyzeJepaCorrelation(workspaceRoot),
    },
    collectKernelSignals: (params) => {
      const continuousThinking = getContinuousThinkingEngine();
      const entropyMinimization = getEntropyMinimizationLoop();
      const activeLearning = getActiveLearningStrategy();

      const thoughts = continuousThinking.think(params.kernel);
      const contradictions = entropyMinimization.detectContradictions(params.kernel);
      const generatedHypotheses = thoughts
        .filter(
          (thought) =>
            thought.expectedEntropyReduction > params.minEntropyReduction &&
            thought.confidence < params.maxThoughtConfidence,
        )
        .map((thought) =>
          activeLearning.generateHypothesis({
            observation: thought.question,
            domain: thought.drive,
            priorConfidence: thought.confidence,
          }),
        );

      const collection: OmegaKernelSignalCollection = {
        thoughts,
        contradictions,
        generatedHypotheses,
        signals: [],
      };
      return {
        ...collection,
        signals: buildKernelSignals(collection),
      };
    },
    testUntestedHypotheses: async (params) => {
      const activeLearning = getActiveLearningStrategy();
      const hypothesesState = activeLearning.getState();
      const untestedHypotheses = hypothesesState.activeHypotheses.filter(
        (hypothesis) => !hypothesis.tested,
      );
      if (untestedHypotheses.length === 0) {
        return {
          jepaEvaluation: {
            correlationScore: null,
            totalEvents: 0,
          },
          testedHypotheses: [],
          signals: [],
        };
      }
      const jepaEvaluation = await analyzeJepaCorrelation(params.workspaceRoot);
      const testedHypotheses = untestedHypotheses
        .slice(0, params.maxHypothesesToTest)
        .map((hypothesis) => {
          const confirmed =
            jepaEvaluation.correlationScore !== null &&
            jepaEvaluation.correlationScore > params.correlationConfirmationThreshold;
          const evidence = `jepa_correlation:${jepaEvaluation.correlationScore?.toFixed(2) ?? "null"}, events:${jepaEvaluation.totalEvents}`;
          activeLearning.updateHypothesis(hypothesis.id, evidence, confirmed);
          return {
            hypothesisId: hypothesis.id,
            evidence,
            confirmed,
          };
        });

      return buildHypothesisSignals({
        jepaEvaluation,
        testedHypotheses,
        signals: [],
      });
    },
  };

  return cachedRegistry;
}
