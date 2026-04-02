## Omega Architecture Audit

Date: 2026-03-31

### Main strengths

- `session-context -> world-model -> executive-state -> decision-context` is a real persisted authority chain. Omega is not bluffing state; it stores durable files, revisions, and summarized executive context.
- The locality/recovery routing derived from durable memory is one of the strongest ideas in OpenSkyNet. That logic looks materially useful, not decorative.
- `living-memory` keeps a useful separation between platform identity and the internal benchmark project. That distinction is good and should be preserved.

### Main risks

- `src/omega/world-model.ts` does too much in one sync pass. It loads authority, durable memory, operational signals, problem agenda, study supervisor, Skynet nucleus/program/continuity, and returns prompt-facing state. This is a high-blast-radius function.
- `src/omega/decision-context.ts` and parts of heartbeat rely on silent fallbacks like `.catch(() => undefined)` and `.catch(() => [])`. That means degraded Omega can look like a calm no-op instead of an explicitly degraded subsystem.
- `src/omega` still mixes read-like flows with write-producing flows. In practice, loading the world model can also mutate downstream benchmark artifacts. That inflates write surface and makes causality harder to reason about.

### Fixes applied in this pass

- `src/omega/autonomous-executor.ts` no longer loads full runtime authority just to obtain `memoryCandidates`. It now calls `collectOpenSkynetMemoryCandidates()` directly.
- `src/omega/autonomous-executor.ts` now ensures `.openskynet/` exists before appending `autonomous-executions.jsonl`, fixing silent first-run log loss.

### Recommended next steps

1. Split `world-model` into clearer phases: load raw state, derive routing/executive inputs, then optional benchmark artifact sync.
2. Add explicit degraded-state markers to `decision-context` instead of swallowing subsystem failures into `undefined`.
3. Decide whether Skynet artifacts should be emitted only on explicit executive transitions rather than during general world-model sync.
