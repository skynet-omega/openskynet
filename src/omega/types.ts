export type OmegaSessionTaskValidationRequest = {
  expectsJson?: boolean;
  expectedKeys?: string[];
  expectedPaths?: string[];
  watchedPaths?: string[];
};

export type OmegaCriticVerdict = "high_value" | "useful" | "low_value" | "invalid";

export type OmegaOutcomeCritique = {
  verdict: OmegaCriticVerdict;
  score: number;
  reasons: string[];
  errorKind?:
    | "low_value_result"
    | "invalid_structured_result"
    | "target_not_touched"
    | "missing_target_writes"
    | "unexpected_collateral_writes";
  message: string;
};

export type OmegaSessionTaskValidationSummary = {
  structured?: OmegaValidationResult;
  write?: OmegaValidationResult;
  critic?: OmegaOutcomeCritique;
};

export type OmegaStructuredTask = {
  task: string;
  expectsJson?: boolean;
  expectedKeys?: string[];
  expectedPaths?: string[];
};

export type OmegaValidationResult = {
  ok: boolean;
  errorKind?:
    | "invalid_structured_result"
    | "target_not_touched"
    | "missing_target_writes"
    | "low_value_result";
  message: string;
  expectedKeys?: string[];
  expectedPaths?: string[];
  observedChangedFiles?: string[];
  missingExpectedPaths?: string[];
};

export type OmegaSmokeResult = {
  ok: boolean;
  core_profile: string;
  available_profiles: string[];
  n_input: number;
  n_actions: number;
  d_state: number;
};

export type OmegaInterruptedGoalRecovery = {
  goalId: string;
  goalTask: string;
  remainingTargets: string[];
  expectsJson: boolean;
  requiredKeys: string[];
  lastErrorKind?: string;
  failureStreak: number;
  reason:
    | "pending_active_goal_after_restart"
    | "verified_structured_failure_after_restart"
    | "verified_write_failure_after_restart";
  suggestedRoute: "omega_delegate" | "sessions_spawn";
  resumeTask: string;
  collateralPaths?: string[];
};

/**
 * Resultado del bridge JEPA para señal de tensión.
 * EXPERIMENTAL: puede eliminarse si no demuestra valor.
 */
export type OmegaJepaTensionResult = {
  /** Frustración del predictor (0-2, donde 2 = máxima predicción errónea) */
  frustration: number;
  /** Confianza en la métrica (0-1, basada en cantidad de datos históricos) */
  confidence: number;
  /** Error opcional si el bridge falló */
  error?: string;
  /** Loss JEPA cruda (para debugging) */
  jepa_loss?: number;
  /** Muestras usadas para el cálculo */
  samples_used?: number;
};
