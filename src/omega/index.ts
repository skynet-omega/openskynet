export type {
  OmegaSmokeResult,
  OmegaStructuredTask,
  OmegaValidationResult,
  OmegaJepaTensionResult,
} from "./types.js";
export {
  formatOmegaRecoveryEpisodeRecall,
  loadOmegaRecoveryEpisodeRecall,
  type OmegaRecoveryEpisode,
} from "./episodic-recall.js";
export {
  loadOmegaEmpiricalMetrics,
  recordOmegaBackgroundActionMetrics,
  recordOmegaRouteMetrics,
  recordOmegaValidationMetrics,
  resolveOmegaEmpiricalMetricsFile,
  type OmegaEmpiricalMetrics,
  type OmegaEmpiricalRoute,
} from "./empirical-metrics.js";
export {
  createOmegaPythonEnv,
  resolveOmegaPythonRoot,
  resolveOmegaSmokeEntry,
  resolveOmegaSmokeModule,
  runOmegaSmoke,
  runJepaTensionBridge,
} from "./runtime.js";
export { collectObservedWriteChanges, createObservedWriteBaseline } from "./observed-write.js";
export { buildOmegaInteractionPrompt, interpretOmegaInput } from "./interaction-model.js";
export { deriveOmegaSessionSelfState, type OmegaSessionSelfState } from "./event-model.js";
export { decideOmegaFrontalAction, type OmegaFrontalAction } from "./frontal/controller.js";
export { deriveOmegaTensionState, type OmegaTensionState } from "./frontal/tension-engine.js";
export { decideOmegaWakeAction, type OmegaWakeAction } from "./frontal/wake-policy.js";
export {
  deriveOmegaInterruptedGoalRecovery,
  taskMatchesOmegaInterruptedGoalRecovery,
  type OmegaInterruptedGoalRecovery,
} from "./recovery.js";
export {
  resumeInterruptedOmegaGoal,
  type OmegaAutonomousRecoveryResult,
} from "./recovery-runner.js";
export {
  applyOmegaHeartbeatExecutiveAction,
  buildOmegaHeartbeatPrompt,
  deriveOmegaHeartbeatContinuationDelay,
  deriveOmegaHeartbeatTurnDecision,
  executeOmegaHeartbeatTurnWithDeps,
  runOneHeartbeatCycleWithDeps,
  runAutonomousLoop,
  type OmegaHeartbeatCycleDeps,
  type OmegaHeartbeatCycleResult,
  type OmegaHeartbeatExecutiveResult,
  type OmegaHeartbeatRuntimeSnapshot,
  type OmegaHeartbeatTurnDecision,
  type OmegaHeartbeatTurnMetric,
  type OmegaHeartbeatTurnResult,
} from "./heartbeat.js";
export {
  deriveOmegaSelfTimeKernel,
  type OmegaKernelGoal,
  type OmegaSelfTimeKernelState,
} from "./self-time-kernel.js";
export {
  buildOmegaSessionContextPrompt,
  deriveFocusedActiveTargets,
  deriveShadowedGoalTasks,
  deriveSupersededGoalTasks,
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionSelfState,
  loadOmegaSessionTimeline,
  loadOmegaTaskTransactions,
  pruneShadowedOmegaGoals,
  pruneSupersededOmegaGoals,
  recordOmegaSessionOutcome,
  resolveOmegaSessionStateFile,
} from "./session-context.js";
export { awaitValidatedOmegaSessionRun, runValidatedOmegaSessionTask } from "./session-task.js";
export {
  selectActiveOmegaTaskTransaction,
  type OmegaTaskTransaction,
  type OmegaTaskTransactionAttempt,
  type OmegaTaskTransactionExecutionSnapshot,
  type OmegaTaskTransactionRecoveryStep,
} from "./task-transaction.js";
export { validateObservedWrite, validateStructuredOmegaResult } from "./validator.js";
export {
  evaluateInnerDrives,
  buildAutonomousDirectivePrompt,
  type InnerDriveSignal,
} from "./inner-life/index.js";
export {
  executeAutonomousAction,
  runAutonomousCycle,
  formatAutonomousExecution,
  type AutonomousActionResult,
  type AutonomousExecution,
} from "./autonomous-executor.js";

export {
  runResearchLoop,
  hasRecentResearchProse,
  type ResearchLoopResult,
} from "./research-loop.js";

export {
  loadScienceBaseInvariants,
  buildScienceBasePromptSection,
  formatScienceBasePromptBlock,
  type ScienceBaseEntry,
} from "./science-base-reader.js";

export {
  registerLearnedRule,
  applyLearnedRules,
  recordLearnedRuleOutcome,
  pruneIneffectiveRules,
  getLearnedRulesStats,
  type LearnedRoutingRule,
  type LearnedRuleContext,
  type LearnedRouteKind,
} from "./learned-rules/index.js";
