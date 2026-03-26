# Operabilidad Y Logs

Esta nota fija el mapa real de observabilidad de `~/openskynet`: qué artefactos se generan, dónde quedan, y qué mirar para entender estado interno, trabajo autónomo y errores.

## Resumen

OpenSkyNet sí genera bastante rastro operativo, pero no está unificado en un solo backend.

Hoy la observabilidad está repartida en cuatro planos:

1. `Gateway/runtime general`
2. `Sesiones y transcripts por agente`
3. `Cron y trabajo autónomo periódico`
4. `Estado interno Omega/Skynet`

La consecuencia práctica es simple:

- para errores del servicio y canales: mirar `journalctl` + rolling log
- para trabajo interno real del agente: mirar `sessions.json` + `*.jsonl`
- para cron: mirar `cron/jobs.json` + `cron/runs/*.jsonl`
- para Skynet/Omega: mirar `~/openskynet/.openskynet/*` + `memory/SKYNET_*.md`

## Fuentes Principales

### 1. Gateway y runtime general

Rutas y comandos principales:

- `journalctl --user -u openskynet-gateway.service -n 200 --no-pager`
- `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
- Web UI -> pestaña `Logs`

Código relevante:

- [logger.ts](/home/daroch/openskynet/src/logging/logger.ts#L1)
- [logs.ts](/home/daroch/openskynet/src/gateway/server-methods/logs.ts#L1)
- [openskynet-gateway.service](/home/daroch/.config/systemd/user/openskynet-gateway.service#L1)

Qué cubre:

- arranque/parada del gateway
- errores HTTP/WebSocket
- errores de channels/providers
- mensajes de runtime y subsistemas
- eventos visibles por `logs.tail`

Notas:

- el rolling log por defecto vive en `/tmp/openclaw`, no en `~/.openskynet`
- `logs.tail` lee el archivo resuelto por `getResolvedLoggerSettings().file`
- el servicio systemd actual no redirige a un archivo propio bajo `~/.openskynet/logs`; el primer lugar a mirar sigue siendo `journalctl`

### 2. Sesiones y transcripts por agente

Rutas:

- `~/.openskynet/agents/<agentId>/sessions/sessions.json`
- `~/.openskynet/agents/<agentId>/sessions/<sessionId>.jsonl`

Ejemplo real:

- [sessions.json](/home/daroch/.openskynet/agents/openskynet/sessions/sessions.json#L1)

Qué cubre:

- historial real de conversaciones/turnos
- herramienta invocada por turno
- contexto de entrega
- session key
- paths a transcript
- metadata persistida de skills/model snapshots

Uso práctico:

- si quieres saber “qué hizo realmente el agente”, esto vale más que el log general
- para heartbeats y cron aislado, el transcript `jsonl` es la fuente más fina de auditoría

### 3. Cron y trabajo autónomo periódico

Rutas:

- [jobs.json](/home/daroch/.openskynet/cron/jobs.json#L1)
- `~/.openskynet/cron/runs/<jobId>.jsonl`

Ejemplo real:

- [9d162660-de31-4c07-b227-99af71165ec5.jsonl](/home/daroch/.openskynet/cron/runs/9d162660-de31-4c07-b227-99af71165ec5.jsonl#L1)

Qué cubre:

- definición activa de jobs
- `nextRunAtMs`, `lastRunStatus`, `consecutiveErrors`
- historia de cada corrida
- `error`, `summary`, `sessionId`, `sessionKey`
- `model`, `provider`, `usage`
- estado de entrega por canal

Esto hoy es uno de los mejores puntos de observabilidad del sistema.

Si un cron “hizo algo raro” o falló sin quedar claro en UI, esta es la primera fuente a revisar.

### 4. Estado interno Omega/Skynet

Rutas de workspace:

- `~/openskynet/.openskynet/living-memory/state/*.json`
- `~/openskynet/.openskynet/living-memory/history.jsonl`
- `~/openskynet/.openskynet/omega-*/*.json`
- `~/openskynet/.openskynet/skynet-*/*.json`
- `~/openskynet/memory/SKYNET_*.md`

Ejemplos reales:

- [agent_openskynet_main.json](/home/daroch/openskynet/.openskynet/living-memory/state/agent_openskynet_main.json#L1)
- [history.jsonl](/home/daroch/openskynet/.openskynet/living-memory/history.jsonl#L1)
- [agent_openskynet_main.json](/home/daroch/openskynet/.openskynet/skynet-nucleus/agent_openskynet_main.json#L1)
- [agent_openskynet_main.json](/home/daroch/openskynet/.openskynet/skynet-study-program/agent_openskynet_main.json#L1)
- [agent_openskynet_main.json](/home/daroch/openskynet/.openskynet/skynet-continuity/agent_openskynet_main.json#L1)
- [SKYNET_PULSE.md](/home/daroch/openskynet/memory/SKYNET_PULSE.md#L1)
- [SKYNET_COMMITMENT.md](/home/daroch/openskynet/memory/SKYNET_COMMITMENT.md#L1)

Qué cubre:

- estado vivo unificado
- historia causal/eventos entre ciclos
- identidad operativa
- foco activo
- continuidad
- compromiso actual
- experimento activo
- snapshots de state authority / agenda / nucleus / study program

Importante:

- esto no es un “log lineal” como `journalctl`
- la autoridad operativa vive primero en `.openskynet/`
- `memory/SKYNET_*.md` debe leerse como vista humana derivada, no como fuente primaria
- `memory/YYYY-MM-DD.md` es historia humana y puede quedar obsoleto rápido; no debe usarse para responder estado actual del sistema

## Logs Especializados

Además del plano general, existen logs o artefactos especializados:

- `~/openskynet/.openskynet/heartbeat.log`
- `~/openskynet/.openskynet/omega-empirical-metrics.json`
- `~/openskynet/.openskynet/holographic-memory.json`
- `~/openskynet/.openskynet/jepa-empirical-log.jsonl`
- `~/openskynet/.openskynet/omega-thoughts.jsonl`
- `~/.openskynet/autonomy-decisions.jsonl`
- `~/.openskynet/autonomy-metrics.json`
- `~/.openskynet/logs/config-audit.jsonl`
- `~/.openskynet/logs/cache-trace.jsonl`
- `~/.openskynet/logs/raw-stream.jsonl`
- `~/.openskynet/logs/commands.log`
- `~/.openskynet/logs/anthropic-payload.jsonl`

No todos estos existen siempre. Muchos aparecen solo si la ruta o el subsistema se activa.

## Qué Mirar Según El Problema

### El gateway o la Web UI están raros

Mirar:

- `journalctl --user -u openskynet-gateway.service -n 200 --no-pager`
- `/tmp/openclaw/openclaw-YYYY-MM-DD.log`

### Un canal Telegram/WhatsApp/Web parece fallar

Mirar:

- `journalctl`
- rolling log `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
- `Health` y `Debug` en Web UI

Observación:

- hoy no hay un archivo de log por canal dedicado y estable para cada provider
- la mayoría de esos errores cae al log general del gateway

### El cron despertó y no sabes qué hizo

Mirar:

- [jobs.json](/home/daroch/.openskynet/cron/jobs.json#L1)
- `~/.openskynet/cron/runs/*.jsonl`
- luego el transcript `sessionId` asociado

### El heartbeat trabajó solo y quieres auditarlo

Mirar:

- `last-heartbeat` por gateway/UI
- `~/.openskynet/agents/openskynet/sessions/sessions.json`
- el `jsonl` de esa sesión

### Quieres entender en qué está trabajando Skynet

Mirar:

- `~/openskynet/.openskynet/living-memory/state/*.json`
- `~/openskynet/.openskynet/living-memory/history.jsonl`
- `~/openskynet/memory/SKYNET_PULSE.md`
- `~/openskynet/memory/SKYNET_CONTINUITY.md`
- `~/openskynet/memory/SKYNET_ACTIVE_EXPERIMENT.md`
- `~/openskynet/memory/SKYNET_COMMITMENT.md`
- `~/openskynet/.openskynet/skynet-*/*.json`

## Problemas Y Huecos Actuales

Estos son los principales huecos reales del pipeline de observabilidad:

### 1. Observabilidad fragmentada

- el estado principal vive en `~/.openskynet`
- el log general vive en `/tmp/openclaw`
- varios experimentos viven en `~/openskynet/.openskynet`

Esto obliga a mirar tres raíces distintas para entender el sistema.

### 2. Legacy naming todavía mezclado

Aunque el producto ya es `OpenSkyNet`, persisten nombres `openclaw` en:

- nombres de logs
- métodos gateway
- rutas legacy
- documentación interna

No rompe operación, pero confunde diagnóstico.

### 3. Falta de logs dedicados por subsistema de canal

Telegram, WhatsApp, Web, Discord y otros no tienen hoy un archivo dedicado consistente por provider.
El error operativo termina mezclado en el log general del gateway.

### 4. Skynet/Omega tiene buen estado, pero poco tracing lineal

Hay snapshots muy útiles, pero menos “timeline continua” de bajo costo para reconstruir:

- qué decidió
- qué descartó
- qué cambió entre ciclos

Esto mejora ahora con `living-memory/history.jsonl`, pero todavía no cubre todo el runtime general.

### 6. Artefactos humanos redundantes pueden contaminar la lectura

Si aparecen archivos como `memory/SKYNET_FOCAL_POINT.md`, `memory/SKYNET_RESEARCH_HARVEST.md` o diarios autónomos nuevos, trátalos como derivados/experimentales a menos que estén respaldados por un store estructurado y un pipeline canónico.

### 5. Algunas rutas especializadas no usan siempre la raíz canónica

El riesgo histórico era que ciertos componentes resolvieran su storage por cuenta propia.
Ejemplo: `AutonomyLogger` antes podía divergir del state dir activo/perfil. Eso ya fue alineado a la resolución canónica.

## Ruta Operativa Recomendada

Para diagnóstico rápido, este orden funciona bien:

1. `journalctl --user -u openskynet-gateway.service -n 200 --no-pager`
2. `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
3. `~/.openskynet/cron/jobs.json`
4. `~/.openskynet/cron/runs/*.jsonl`
5. `~/.openskynet/agents/openskynet/sessions/sessions.json`
6. `~/.openskynet/agents/openskynet/sessions/*.jsonl`
7. `~/openskynet/memory/SKYNET_*.md`
8. `~/openskynet/.openskynet/skynet-*/*.json`
9. `~/openskynet/.openskynet/living-memory/state/*.json`
10. `~/openskynet/.openskynet/living-memory/history.jsonl`

## Próximos Mejorables

Si se quiere endurecer de verdad la operabilidad futura, los siguientes pasos serían sensatos:

1. Unificar logs generales y estado bajo una sola raíz operativa.
2. Exponer cron runs, session transcripts y últimos errores críticos directamente en la Web UI.
3. Agregar logs dedicados por provider/canal.
4. Agregar un `Skynet activity trace` lineal además de snapshots.
5. Crear un comando único tipo `openskynet doctor observability` o `openskynet logs map`.

## Reset De Memoria Viva

Plan en seco:

```bash
node --import tsx scripts/openskynet-memory-reset.ts
```

Ejecución real:

```bash
node --import tsx scripts/openskynet-memory-reset.ts --execute
```

Incluyendo vistas humanas derivadas:

```bash
node --import tsx scripts/openskynet-memory-reset.ts --include-human-readable --execute
```
