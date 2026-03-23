export const OMEGA_MIN_IDLE_MS_BEFORE_DRIVE = 30 * 1000;
export const OMEGA_CURIOSITY_THRESHOLD_TURNS = 2;
export const OMEGA_ENTROPY_SILENCE_THRESHOLD_MS = 60 * 1000;

export const OMEGA_HOMEOSTASIS_MIN_URGENCY = 0.3;

export const OMEGA_JEPA_MIN_CONFIDENCE = 0.3;
export const OMEGA_JEPA_ENGAGED_FRUSTRATION = 0.5;
export const OMEGA_JEPA_CURIOSITY_FRUSTRATION = 1.0;
export const OMEGA_JEPA_EMERGENCY_FRUSTRATION = 1.5;
export const OMEGA_JEPA_URGENCY_GAIN = 0.15;

export const OMEGA_MIN_THOUGHT_ENTROPY_REDUCTION = 0.15;
export const OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS = 0.8;
export const OMEGA_HIGH_CONFIDENCE_RULE_THRESHOLD = 0.3;

export const OMEGA_MEMORY_EMBEDDING_DIMENSIONS = 64;
export const OMEGA_MAX_MEMORY_RESONANCE_RESULTS = 3;
export const OMEGA_RICCI_BOTTLENECK_THRESHOLD = -0.3;
export const OMEGA_RICCI_NEGATIVE_CURVATURE_THRESHOLD = -0.2;

export const OMEGA_THINKING_CAUSAL_UNCERTAINTY_THRESHOLD = 0.3;
export const OMEGA_THINKING_INTERNAL_ENTROPY_THRESHOLD = 0.4;
export const OMEGA_THINKING_HIGH_CAUSAL_UNCERTAINTY = 0.6;
export const OMEGA_THINKING_ACTIVE_WORK_THRESHOLD = 2;
export const OMEGA_THINKING_RECENT_FILE_WINDOW = 50;
export const OMEGA_THINKING_RECENT_FILE_COUNT = 3;
export const OMEGA_THINKING_REPEATED_FAILURE_THRESHOLD = 2;
export const OMEGA_THINKING_COMPLETION_RATE_THRESHOLD = 0.7;
export const OMEGA_THINKING_MIN_CONFIDENCE = 0.6;
export const OMEGA_THINKING_MAX_CONFIDENCE = 0.95;

export const OMEGA_METABOLISM_HISTORY_SIZE = 50;

export const OMEGA_NLE_ACTIVATION_THRESHOLD = 0.5;
export const OMEGA_NLE_MAX_RULES = 64;
export const OMEGA_NLE_MAX_CONTEXT_BOOST = 1.35;
export const OMEGA_NLE_RULE_EFFECT_GAIN = 0.2;

export const OMEGA_REASONING_NLE_WEIGHT = 0.35;
export const OMEGA_REASONING_HM_WEIGHT = 0.2;
export const OMEGA_REASONING_LYAPUNOV_STABLE_WEIGHT = 0.3;
export const OMEGA_REASONING_LYAPUNOV_UNSTABLE_WEIGHT = 0.15;
export const OMEGA_REASONING_CAUSAL_WEIGHT = 0.15;
export const OMEGA_REASONING_MIN_CONFIDENCE = 0.45;
export const OMEGA_REASONING_MAX_CONFIDENCE = 0.95;

export const OMEGA_METABOLISM_BASE_ACTIVITY = {
  neural_logic_engine: 0.15,
  hierarchical_memory: 0.2,
  lyapunov_controller: 0.05,
  causal_reasoner: 0.1,
  autonomy_logger: 0.02,
  jepa_enhancer: 0.08,
} as const;

export const OMEGA_METABOLISM_FRUSTRATION_MULTIPLIER = {
  neural_logic_engine: 1.5,
  hierarchical_memory: 2.0,
  lyapunov_controller: 3.0,
  causal_reasoner: 1.8,
  autonomy_logger: 1.0,
  jepa_enhancer: 2.0,
} as const;

export const OMEGA_METABOLISM_ACTIVATION_THRESHOLD = {
  neural_logic_engine: 0.0,
  hierarchical_memory: 0.4,
  lyapunov_controller: 0.3,
  causal_reasoner: 0.6,
  autonomy_logger: 0.0,
  jepa_enhancer: 0.2,
} as const;
