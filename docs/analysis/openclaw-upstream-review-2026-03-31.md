# OpenClaw Upstream Review - 2026-03-31

## Context

- Local fork under review: `openskynet`
- Upstream reference: `https://github.com/openclaw/openclaw`
- Official releases reviewed:
  - `v2026.3.24` published on 2026-03-25 16:35
  - `v2026.3.28`
  - `v2026.3.31` published on 2026-03-31 20:54
- Important constraint: `openskynet` and `openclaw` do **not** currently share usable git ancestry, so a normal `merge`/`rebase` is not the right first move.

## What This Means

OpenSkyNet looks like a content fork, not a git-connected fork. That means the safe path is:

1. Compare by path and subsystem, not by branch ancestry.
2. Protect `src/omega` as a no-touch zone unless a change is explicitly ported into Omega terms.
3. Re-import upstream improvements in batches, each with tests.

## Current Local Divergence

Uncommitted local work is concentrated in:

- `src/omega/*`
- `src/acp/persistent-bindings.lifecycle.ts`
- `src/acp/persistent-bindings.types.ts`
- `src/config/paths.ts`
- `src/gateway/server-restart-sentinel.ts`
- `src/secrets/audit.ts`
- `src/security/audit.ts`

This is good news: the non-Omega surface currently in motion is narrow enough to review carefully.

## High-Value Upstream Areas Since 2026-03-24

From the official release stream, the most relevant upstream areas for this fork are:

- `src/config`, `src/gateway`, `src/security`, `src/secrets`
- `src/acp`
- `src/agents`, `src/auto-reply`, `src/commands`
- Background task infrastructure (`tasks`, `flows`) introduced and expanded in `2026.3.31`
- Gateway compatibility and auth hardening from `2026.3.24` to `2026.3.31`

Notable upstream themes:

- `2026.3.24`: Gateway OpenAI compatibility (`/v1/models`, `/v1/embeddings`), tool visibility, plugin hook delivery, container CLI support.
- `2026.3.28`: memory/QMD fixes, auth/CLI hardening, provider/onboarding cleanup.
- `2026.3.31`: background task ledger/flows, ACPX bridge hardening, MCP transport improvements, gateway auth tightening, node trust-surface tightening.

## Findings

### 1. `src/config/paths.ts` likely regressed upstream hardening

File: `src/config/paths.ts`

Risk points:

- `resolveConfigPath()` only honors `OPENCLAW_CONFIG_PATH` and ignores the same legacy aliases already honored elsewhere in the file. See lines 167-175.
- `resolveStateDir()` honors `OPENSKYNET_STATE_DIR`, but `resolveConfigPath()` and `resolveDefaultConfigCandidates()` are still partially keyed around `OPENCLAW_*` and `CLAWDBOT_*`, creating inconsistent path resolution behavior. See lines 64-104, 167-196, 207-234.
- `resolveGatewayPort()` now uses plain `parseInt()` on env input. That drops upstream support for Docker Compose style values like `127.0.0.1:18789` or `[::1]:18789`, which OpenClaw explicitly hardened. See lines 276-294.

Interpretation:

This file is a strong candidate for selective upstream recovery. The OpenSkyNet branding/state-dir work is legitimate, but some robustness improvements were lost while rebasing naming and path semantics.

### 2. `src/gateway/server-restart-sentinel.ts` is carrying a type escape hatch

File: `src/gateway/server-restart-sentinel.ts`

Risk points:

- `params.deps as any` is used in the two outbound delivery call sites. See lines 85 and 201.

Interpretation:

This is usually a sign that upstream delivery contracts evolved and OpenSkyNet bypassed the mismatch instead of reconciling it. Given the amount of gateway and routing work shipped upstream, this deserves a focused compare against current OpenClaw before more gateway work lands on top.

### 3. `src/acp/persistent-bindings.lifecycle.ts` diverged in reset logic

File: `src/acp/persistent-bindings.lifecycle.ts`

Risk points:

- `configuredBinding` is now resolved unconditionally before reading ACP session metadata. See lines 122-129.
- Upstream only consulted the configured binding on a narrower path when session metadata did not already carry a normalized agent.

Interpretation:

This may be intentional for OpenSkyNet, but it is logic drift, not just renaming. Because OpenClaw continued shipping ACP startup hardening in this area, this file should be diffed function-by-function before porting more ACP work.

### 4. `src/security/audit.ts` and `src/secrets/audit.ts` look mostly rebrand-local

Files:

- `src/security/audit.ts`
- `src/secrets/audit.ts`

Observed difference:

- The current delta is mostly type renaming (`OpenClawConfig` -> `OpenSkynetConfig`) and wording changes (`OpenClaw state` -> `OpenSkynet state`).

Interpretation:

These files are lower risk than `paths.ts` and `server-restart-sentinel.ts`. They still need an upstream compare, but they do not currently look like the main source of behavioral regression.

## Recommended Import Order

### Batch A: Safe hardening outside Omega

Target first:

- `src/config/paths.ts`
- `src/gateway/server-restart-sentinel.ts`
- `src/security/audit.ts`
- `src/secrets/audit.ts`

Goal:

- Reconcile upstream hardening while preserving OpenSkyNet naming and state-dir conventions.

### Batch B: ACP recovery

Target next:

- `src/acp/*`

Goal:

- Review upstream ACP startup/session/binding changes from `2026.3.24` through `2026.3.31`.
- Port only the pieces that strengthen lifecycle correctness and routing stability.

### Batch C: New upstream substrate features

Consider separately:

- `src/tasks`
- `src/flows`
- related `src/commands`, `src/cli`, `src/auto-reply`

Goal:

- Decide whether OpenSkyNet wants the upstream detached-task substrate as-is, adapted, or explicitly rejected in favor of Omega runtime authority.

This should be a design decision, not a blind sync.

## What I Would Avoid

- Do not attempt a direct merge from `upstream/main` into `main`.
- Do not bulk-copy `src/agents` or `src/gateway` wholesale.
- Do not touch `src/omega` until the shared substrate beneath it is stabilized.

## Practical Next Step

Create a dedicated integration branch and do a first surgical pass on:

- `src/config/paths.ts`
- `src/gateway/server-restart-sentinel.ts`

Those two files are the clearest examples of OpenSkyNet-specific edits sitting on top of fast-moving upstream code, and they are the most likely places to recover robustness without threatening Omega.
