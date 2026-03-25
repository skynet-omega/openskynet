# OpenSkyNet Episodic Memory

This file serves as the project-level persistence layer for Omega.

## Recent Events

- 2026-03-24: Completed project rebranding from OpenClaw to OpenSkyNet.
- 2026-03-24: Dynamic Fallbacks successfully implemented.
- 2026-03-24: Integrated AllTalk TTS support (isolated instance at :7851) and Science Base RAG for autonomous heartbeats.
- 2026-03-25: Resolved `low_value_result` failure pattern in OMEGA Critic by explicitly recognizing autonomous control signals (`HEARTBEAT_OK`, `NO_REPLY`) as substantive.
- 2026-03-25: Fixed entropy in `src/omega/heartbeat.ts` by removing unused imports and variables detected during commit linting.
