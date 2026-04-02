# OpenSkyNet Heartbeat Checklist

## Operational Health

- [ ] Check `~/.openskynet/logs/gateway.log` (via systemd or file) for "FailoverError" or "timeout".
- [ ] Verify node version in PATH matches `TOOLS.md` preference for pnpm/vitest execution.

## Lab: Causal Valence

- [ ] Review `src/skynet/causal-valence/FINDINGS_CONFIDENCE.md`.
- [ ] Next: Implement kernel-side "Ambiguity Gating" using `confidence < 0.1` to trigger exploratory sub-agents.

## Workspace

- [ ] Prune ephemeral experiment JSONs in workspace root if > 48h old.
