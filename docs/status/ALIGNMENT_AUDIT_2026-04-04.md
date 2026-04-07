# Alignment Audit 2026-04-04

Scope: runtime alignment and recent stability review for `OpenSkyNet`, explicitly excluding `src/skynet`.

## Baseline

- Current branch: `codex/upstream-hardening-omega-decouple`
- Current `HEAD`: `a2a08ac164c1ae610a851f214d10264f07edd50f`
- Upstream release tag reviewed: `openclaw/openclaw` `v2026.4.2` (`d74a12264aa5fb0598605e8f04e1864b7239ddd5`)

## Important constraint

- `src/skynet` is experimental ballast and should not influence runtime alignment decisions.
- Alignment work should focus on `src/omega`, `src/daemon`, `src/gateway`, `src/infra`, `src/plugins`, `src/agents`, `src/telegram`, `src/auto-reply`, and `src/config`.

## Last three local uploads

### `a2a08ac164` `publish omega hardening and skynet sync updates`

- High-risk mixed commit.
- Even excluding `src/skynet`, it still changes the `omega` spine heavily.
- It also removes or rewrites repo-level docs/state files in the same commit, which makes rollback and blame harder.

### `389e07a6ad` `Add prompt preparation telemetry and reuse active plugin registry`

- Moderate-risk commit.
- Runtime-facing changes are relatively contained.
- Main non-`skynet` surfaces changed:
  - `src/agents/pi-embedded-runner/run/attempt.ts`
  - `src/agents/system-prompt-report.ts`
  - `src/auto-reply/reply/commands-context-report.ts`
  - `src/auto-reply/reply/commands-system-prompt.ts`
  - `src/config/sessions/types.ts`
  - `src/plugins/loader.ts`
  - `src/plugins/tools.ts`

### `1c3993081b` `Update continuity retry policy and Skynet hypergraph experiments`

- Most plausible "last stable" candidate among the last three uploads.
- Non-`skynet` runtime changes are narrower and more operational:
  - `src/auto-reply/reply/agent-runner.ts`
  - `src/config/sessions/unfinished-turn.ts`
  - `src/infra/runtime-failure.ts`
- This is the best rollback target if the latest upload is suspected.

## Recent delta excluding `src/skynet`

From `HEAD~2..HEAD`, excluding `src/skynet`:

- `src/omega`: dominant share of changed runtime files
- `src/plugins`: moderate
- `src/auto-reply`: moderate
- `src/agents`: moderate

Interpretation:

- The instability suspicion should focus first on `src/omega`, not on `src/skynet`.
- `src/skynet` is noisy, but the runtime risk in the last upload lives mainly in the `omega` spine.

## Upstream release `v2026.4.2` notes relevant to runtime

Reviewed release page:

- Exec defaults moved toward no-prompt host exec behavior.
- Exec approval/config normalization was hardened.
- Gateway loopback pairing regressions were fixed.
- Subagent gateway privilege handling was tightened.

These upstream changes are relevant to current OpenSkyNet pain points around daemon/gateway/exec approval behavior.

## Recommended alignment strategy

1. Do not replace local `.ts` files wholesale with upstream versions.
2. Treat `src/skynet` as out-of-scope for alignment and keep it quarantined from spine decisions.
3. Audit `src/omega` changes introduced after `1c3993081b` before touching the rest of the tree.
4. Import upstream `v2026.4.2` behavior selectively by subsystem, starting with:
   - `src/daemon`
   - `src/gateway`
   - `src/agents/bash-tools*`
   - `src/infra`
   - `src/telegram`
5. Prefer surgical forward-porting or cherry-picking behavior, with local adaptation, over file replacement.
6. Keep OpenSkyNet identity/docs changes separate from runtime alignment work.

## Immediate practical next step

If we need a stabilization pass now, compare runtime behavior against commit `1c3993081b` first, then review only the `src/omega` portion of `a2a08ac164` before deciding whether to keep, split, or revert it.
