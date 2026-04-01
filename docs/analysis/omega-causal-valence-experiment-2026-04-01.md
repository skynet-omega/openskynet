# Omega Causal Valence Experiment

## Goal

Explore whether OpenSkyNet can learn a general, language-agnostic notion of causal importance from lived episodes, without hardcoding large taxonomies of feelings, words, or language-specific rules into the kernel.

The target is not "emotion simulation". The target is:

- distinguish materially different transitions of the world
- associate them with good or bad downstream consequences
- expose that learned asymmetry back to Omega and, later, to the LLM

## Problem

LLMs collapse many actions into similar token patterns.

Examples:

- edit a file
- delete a file
- create a file

Textually they are close. Causally they are not.

The same action can also have different valence depending on context:

- deleting a generated cache file can be healthy
- deleting a source file can be destructive
- editing a config file can be low-cost or high-risk depending on blast radius

Therefore, hardcoded verb or keyword rules are not enough, and neither is raw embedding similarity.

## Non-goals

- No attempt to simulate consciousness or anthropomorphic feeling
- No giant if/else tree for every action type
- No language-specific semantic inventory
- No direct kernel integration before empirical signal exists

## Hypothesis

OpenSkyNet can learn a useful notion of causal valence if it stores episodes in this form:

1. prior state
2. world transition
3. local context / goal
4. observed outcome
5. recovery cost / continuity impact

From this, a lightweight learner may infer patterns like:

- some transitions often precede recovery difficulty
- some transitions correlate with progress
- some transitions are neutral unless combined with collateral change

## Proposed Experimental Surface

Run this first in `src/skynet`, not in `src/omega`.

Suggested experimental modules:

- `src/skynet/causal-valence/episode-ledger.ts`
- `src/skynet/causal-valence/world-transition.ts`
- `src/skynet/causal-valence/valence-learner.ts`
- `src/skynet/causal-valence/bench.ts`

These should stay disconnected from the kernel until they beat a baseline.

## Minimal Episode Schema

Each episode should capture:

- `context`
  - active task kind
  - target scope
  - prior failure streak
  - continuity freshness
- `transition`
  - changed targets
  - collateral paths
  - structural operation counts
  - before/after state descriptors
- `outcome`
  - success / error / timeout
  - write validation result
  - structured validation result
  - later recovery burden
  - continuity delta
- `valence labels`
  - initially derived from operational outcome, not human emotion words
  - e.g. `progress`, `damage`, `frustration`, `relief`, `stall`

## Bootstrap Rule

Only bootstrap labels from existing operational facts.

Examples:

- `progress`: validated success with positive continuity delta
- `stall`: repeated attempts with no target delta
- `damage`: collateral writes, missing target writes, or regression after prior success
- `relief`: recovery from prior failure streak
- `frustration`: persistent repeated failure after similar transition pattern

These are not final truths. They are seed labels for learning.

## Learning Objective

The learner should not memorize words. It should learn from episodes:

- transition pattern
- context
- outcome sequence

Possible first objective:

- predict whether a transition under a context tends toward `progress` or `damage`

Possible second objective:

- predict recovery burden after the transition

## Success Criteria

Promote to Omega only if the experiment shows at least one of:

- fewer harmful retries
- better route selection after similar failures
- improved recovery success
- better prediction of when to revalidate before continuing

And only if the implementation remains small relative to gain.

## Failure Criteria

Reject or archive the experiment if:

- gains are mostly anecdotal
- the mechanism needs many hand-tuned symbolic rules
- it increases code complexity without changing real behavior
- it depends on language-specific prompt tricks

## Integration Path If Successful

If the experiment shows value, integrate in this order:

1. read-only signal into `Omega` state
2. policy modulation in recovery / execution routing
3. prompt bridge to inform the LLM

Do not start by prompting the LLM with pseudo-emotional narratives.

## Design Rule

OpenSkyNet should learn causal valence from episodes of action and consequence, not from a manually curated dictionary of feelings.
