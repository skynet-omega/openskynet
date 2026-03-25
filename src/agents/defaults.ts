// Defaults for agent metadata when upstream does not supply them.
// No default provider or model is set to ensure user-driven configuration.
export const DEFAULT_PROVIDER = "";
export const DEFAULT_MODEL = "";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 128_000;
