# TOOLS.md - Local Operational Notes

This file stores environment-specific facts for OpenSkyNet.

## Workspace

- Main workspace path: `/home/daroch/openskynet`
- Main repo path: `/home/daroch/openskynet`
- Important project folders:
  - `src/omega`: Core logic and Neural Logic Engine.
  - `extensions/`: Messaging and service plugins.
  - `assets/`: Official branding (logo, banner).
  - `memory/`: Durable episodic records.

## Models

- Default model: `google-gemini-cli/gemini-3-flash-preview`
- Fallback chain:
  - `google-gemini-cli/gemini-3.1-pro-preview`
  - `ollama/kimi-k2.5:cloud`
  - `openai-codex/gpt-5.4`
  - `ollama/gpt-oss-safeguard:20b`
- Cheap local fallback: `ollama/gpt-oss-safeguard:20b`
- Config source of truth: `~/.openskynet/openclaw.json`

## OpenSkyNet / Gateway

- Gateway host: `127.0.0.1`
- Gateway port: `18789`
- Config path: `~/.openskynet/openclaw.json`
- State dir: `~/.openskynet`
- Sandbox mode: `off`
- Important runtime notes: systemd user service `openskynet-gateway.service`

## SSH / Machines

- Primary machine alias: `DAROCHIN-PC` (WSL2)
- Remote notes: GitHub repo linked at `git@github.com:skynet-omega/openskynet.git`.

## Devices

### Mobile / Nodes

- WhatsApp: linked locally

## Common Commands

- Gateway dev: `pnpm gateway:dev`
- UI dev: `pnpm ui:dev`
- TUI: `pnpm tui`
- Build: `pnpm build`
- Run targeted tests: `pnpm vitest run <path>`
- Service status: `systemctl --user status openskynet-gateway.service`

## Safety Notes

- `TOOLS.md` should stay operational and local; avoid putting secrets or personal identifiers here.
- Small local models still run host-side in the current trust model; avoid untrusted inputs when tools are enabled.

_Last updated: 2026-03-25_
