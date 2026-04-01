# Omega Directive Audit

## Scope

Audit `src/omega` against the permanent project directive:

- evaluate empirically
- keep mechanisms falsifiable
- judge cost/benefit explicitly
- avoid high code/piece complexity with little or no measured benefit

## Result

`Omega` is not empty rhetoric, but it is mixed.

There is a defensible kernel with real runtime value, and there is still a smaller perimeter of speculative or weakly validated modules that should not be treated as part of the sovereign core.

## Defensible Kernel

These modules justify their existence because they sit on real platform paths, have tests, or are part of the shared runtime authority used by heartbeat, `omega_work`, recovery, or living memory:

- `runtime-authority.ts`
- `decision-context.ts`
- `state-authority.ts`
- `world-model.ts`
- `living-memory.ts`
- `operational-memory.ts`
- `execution-controller.ts`
- `execution-policy.ts`
- `session-context.ts`
- `task-transaction.ts`
- `validator.ts`
- `problem-agenda.ts`
- `heartbeat.ts`
- `heartbeat-core.ts` (indirectly covered through heartbeat tests)
- `autonomous-executor.ts`
- `runtime-observer.ts` (now only as read-only soft prior from lab evidence)

These are the files that currently make `Omega` materially useful rather than decorative.

## Experimental But Currently Justified

These remain experimental, but their complexity is still defensible because they connect to measured mechanisms or bounded runtime features:

- `holographic-memory.ts`
- `hierarchical-memory.ts`
- `embedding-quantization.ts`
- `inbound-cognition.ts`
- `jepa-empirical-logger.ts`
- `active-learning-strategy.ts`

They should remain under scrutiny, but they are not immediate deletion candidates.

## High-Risk Density Areas

These areas are probably doing too much at once and should be refactored by boundary, not expanded:

- `session-context.ts`
- `world-model.ts`
- `living-memory.ts`
- `heartbeat-core.ts`
- `executive-dispatch.ts`
- `self-time-kernel.ts`

The issue here is not “remove now”, but “stop adding conceptual weight until boundaries are clearer”.

## Remaining Weak / Low-Confidence Perimeter

After this pass, the weak perimeter is smaller but not gone.

The main remaining candidate under the directive is:

- `session-goal-maintenance.ts`

It has a real callsite through `session-context.ts`, so it is not dead code, but it still deserves either:

1. explicit tests
2. a clearer role boundary
3. or consolidation into the surrounding session-state machinery

## Files Moved Out Of Kernel Path

These files had no justified place in `src/omega`, so they were moved to `scripts/omega-lab/`:

- `empirical-validation.ts`
- `learning-validation.ts`
- `proof-of-flow.ts`
- `force-active.ts`
- `autonomy-logger.ts`
- `auto-reflection.ts`
- `adaptive-policy.ts`
- `bifasic-client.ts`
- `interactive-prompt.runtime.ts`
- `local-edit-guard.ts`

This improves the cost/benefit profile of the kernel without changing real runtime behavior.

## Runtime Observer Decision

The new `runtime observer` experiment in `src/skynet` did justify a minimal promotion path:

- lab benchmark passed on real transcripts
- improvement over majority baseline was positive and above threshold
- integration into `Omega` is read-only and soft-prior only

That promotion is acceptable because:

- it is empirically grounded
- it stays optional
- it does not become a new center of decision

## Current Recommendation

Do not call `Omega` “perfect” yet.

What is true now:

- the kernel is more disciplined than before
- clearly unjustified or unintegrated files were removed from the kernel path
- the new lab-to-kernel promotion path is following the right rule

What still needs work:

- split dense core files by responsibility
- finish auditing the remaining low-confidence perimeter
- avoid adding more conceptual modules until the current sovereign spine is simpler

## Bottom Line

`Omega` is now substantially more defensible and much cleaner than before, but not mathematically “finished”.

The correct next principle is:

- strengthen the kernel by removing ambiguity
- keep experiments in lab until measured
- only promote narrow, read-only, empirically justified signals into the core
