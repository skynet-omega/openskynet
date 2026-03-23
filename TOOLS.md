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

- Default model: `ollama/gpt-oss-safeguard:20b`
- Fallback model: `google-gemini-cli/gemini-3-flash-preview`
- Fast cheap model: `ollama/gpt-oss-safeguard:20b`
- Notes on model limits: Small models (<300B) are currently running without sandboxing (Security Warning active).

## OpenSkyNet / Gateway

- Gateway host: `127.0.0.1`
- Gateway port: `18789`
- Config path: Internal JSON5 managed by OpenClaw.
- Session/log path: `openskynet-gateway.log`
- Sandbox mode: `off`
- Important runtime notes: Running on Node `v22.22.1` via NVM.

## SSH / Machines

- Primary machine alias: `DAROCHIN-PC` (WSL2)
- Remote notes: GitHub repo linked at `git@github.com:skynet-omega/openskynet.git`.

## Devices

### Mobile / Nodes

- WhatsApp: Linked (+56988208988). Active and healthy.

## Common Commands

- Check status: `bash -i -c "nvm use 22 && ./openclaw.mjs status"`
- Start gateway: `bash -i -c "nvm use 22 && ./openclaw.mjs gateway start"`
- Run tests: `bash -i -c "nvm use 22 && pnpm test <path>"`
- Update system: `bash -i -c "nvm use 22 && ./openclaw.mjs update"`

## Safety Notes

- Gateway auth token is currently short (6 chars). Prefer lengthening for production.
- Small models are exposed to host environment; avoid untrusted inputs in this mode.

_Last updated: 2026-03-23_
