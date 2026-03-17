<!-- translated: es -->

# OpenSkyNet Autonomous Daemon

El demon autónomo permite que OpenSkyNet **piense y actúe de forma independiente**, incluso cuando no estás interactuando con él.

## Arquitectura

```
┌─────────────────────────────────────────┐
│ OpenSkyNet Autonomous Daemon            │
├─────────────────────────────────────────┤
│                                         │
│  Cada 5 minutos:                        │
│  1. Genera prompt (heartbeat)           │
│  2. Ejecuta razonamiento (LLM)          │
│  3. Aplica acciones                     │
│  4. Guarda episodio → aprendizaje       │
│                                         │
│  PERO:                                  │
│  Si TUI activa → pausa (no bloquea)     │
│  Si TUI cierra → continúa               │
│                                         │
└─────────────────────────────────────────┘
```

## Sincronización TUI ↔️ Daemon

**Sistema de archivos (sin mutex/semáforo):**

```
.interaction-lock (archivo)
  ↓
Si existe & <60s viejo → TUI activa, daemon pausa
Si falta o >60s viejo → TUI inactiva, daemon continúa
```

**Comportamiento:**

```
usuario abre TUI
  → TUI crea .interaction-lock
  → Daemon detecta lock
  → Daemon pausa (verifica cada 10s)

usuario cierra TUI
  → TUI borra .interaction-lock
  → Daemon detecta ausencia
  → Daemon reanuda ciclos cada 5 min

TUI se cuelga (cierre forzado)
  → .interaction-lock queda viejo (>60s)
  → Daemon lo detecta, lo borra automáticamente
  → Daemon continúa (timeout graceful)
```

## Instalación

### Opción 1: Automática (recomendado)

```bash
# Instala daemon (se ejecutará en boot)
pnpm tsx src/omega/daemon-cli.ts install --interval=5

# Inicia ahora
pnpm tsx src/omega/daemon-cli.ts start

# Verifica estado
pnpm tsx src/omega/daemon-cli.ts status
```

### Opción 2: Manual (desarrollo)

```bash
# Terminal 1: Daemon en loop
pnpm tsx src/omega/daemon-entry.ts

# Terminal 2: TUI normal (daemon se pausa automáticamente)
pnpm openskynet tui
```

### Opción 3: Una sola ejecición

```bash
# Ejecuta un solo ciclo
pnpm tsx src/omega/run-autonomous.ts --once

# Ejecuta 10 minutos
pnpm tsx src/omega/run-autonomous.ts --interval=10
```

## Operaciones

```bash
# Estado actual
pnpm tsx src/omega/daemon-cli.ts status

# Inicia (o reinicia)
pnpm tsx src/omega/daemon-cli.ts start

# Pausa
pnpm tsx src/omega/daemon-cli.ts stop

# Desinstala
pnpm tsx src/omega/daemon-cli.ts uninstall --force

# Reinstala con nuevo intervalo
pnpm tsx src/omega/daemon-cli.ts install --interval=10 --force
pnpm tsx src/omega/daemon-cli.ts start
```

## Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| `src/omega/daemon-entry.ts` | Entry point (llamado por systemd/launchd/schtasks) |
| `src/omega/daemon-cooperative.ts` | Lógica cooperativa (pausa/reanuda con TUI) |
| `src/omega/daemon-cli.ts` | CLI para install/start/stop/status |
| `src/omega/heartbeat.ts` | Ciclo de pensamiento (buildOmegaHeartbeatPrompt, etc) |
| `src/daemon/openskynet-service.ts` | Integración con OpenClaw daemon system |
| `src/daemon/openskynet-constants.ts` | Labels/nombres según plataforma |
| `.interaction-lock` | Archivo temporal (creado por TUI, detectado por daemon) |

## Logs

### Systemd (Linux)
```bash
journalctl -u openclaw-openskynet-autonomous -f
```

### Launchd (macOS)
```bash
log stream --predicate 'process == "node"' --level debug | grep openskynet
```

### Windows (Task Scheduler)
Ver en: `Visor de eventos` → `Registros personalizados` → `OpenClawOpenSkyNetAutonomous`

### Directamente
```bash
tail -f ~/.openclaw/agents/openskynet/sessions/*.jsonl
```

## Parámetros de Entorno

| Variable | Propósito | Defecto |
|----------|-----------|---------|
| `WORKSPACE_ROOT` | Ruta del proyecto | `cwd` |
| `SESSION_KEY` | ID de sesión para logs | `openskynet` |
| `OPENSKYNET_INTERVAL_MINUTES` | Minutos entre ciclos | `5` |

## Troubleshooting

### Daemon no se inicia
```bash
# Verifica estado
pnpm tsx src/omega/daemon-cli.ts status

# Reinstala
pnpm tsx src/omega/daemon-cli.ts uninstall --force
pnpm tsx src/omega/daemon-cli.ts install
pnpm tsx src/omega/daemon-cli.ts start
```

### TUI bloquea daemon (no se pauta)
```bash
# Verifica que .interaction-lock no esté viejo
ls -l .interaction-lock

# Si existe, bórralo manualmente
rm .interaction-lock

# El daemon debería continuar en 10s
```

### Demon consume mucha CPU
- Aumenta intervalo: `--interval=30`
- Verifica logs por errores infinitos
- Reduce contexto en heartbeat prompt

## Integración Futura

1. **OpenClaw CLI native**
   ```bash
   openclaw daemon start openskynet-autonomous
   openclaw daemon status openskynet-autonomous
   ```

2. **Systemd timer** (en lugar de loop con sleep)
   - Más preciso
   - Mejor consumo de energía

3. **Metrics/alerting**
   - Ciclos ejecutados por hora
   - Errores por tipo
   - Latencia promedio

4. **Web UI**
   - Ver estado del daemon
   - Ajustar intervalo en tiempo real
   - Ver logs últimos ciclos
