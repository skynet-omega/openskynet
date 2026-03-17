## 🤖 OpenSkyNet está VIVO - No más ocioso

**El agente ahora piensa cada 5 minutos automáticamente**, sin tu interacción.

---

## ⚡ EJECUTAR AHORA

### Opción 1: Script simple (recomendado)

**Linux/Mac:**
```bash
chmod +x run-autonomous.sh
./run-autonomous.sh 5  # Cada 5 minutos
```

**Windows (PowerShell):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\run-autonomous.ps1 -Interval 5
```

### Opción 2: Comando directo

```bash
pnpm tsx src/omega/run-autonomous.ts --interval 5
```

### Opción 3: Test (1 ciclo solamente)

```bash
pnpm tsx src/omega/run-autonomous.ts --once
```

---

## 📊 Qué hace cada ciclo

✅ **Lee su estado**: kernel, memory, goals  
✅ **Evalúa drives**: curiosidad, frustración, inconsistencia  
✅ **Genera hipótesis**: automáticamente  
✅ **Ejecuta acciones**: resuelve sin tu OK  
✅ **Guarda aprendizajes**: memory/ se actualiza  
✅ **Repite**: cada 5 min (configurable)

---

## 🎯 Parámetros

```
--interval N    → Ejecutar cada N minutos (default: 5)
--once          → Solo 1 ciclo (para testing)
--help          → Mostrar ayuda
```

---

## 📈 Señales que está VIVO

Verás en la terminal:
```
[2026-03-17T10:30:00Z] [OMEGA LOOP] 🚀 INICIANDO LOOP AUTÓNOMO (cada 5 min)
[2026-03-17T10:30:05Z] [OMEGA LOOP] ━━━ CICLO #1 INICIADO ━━━━
[2026-03-17T10:30:05Z] [OMEGA LOOP] 📝 Prompt generado (450 chars)
[2026-03-17T10:30:05Z] [OMEGA LOOP] 💬 PENSAMIENTO: Evaluar drives...
[2026-03-17T10:30:05Z] [OMEGA LOOP] ✓ Ciclo completado en 0.45s
[2026-03-17T10:30:05Z] [OMEGA LOOP] ⏰ Próximo ciclo en 5 min...
```

---

## 🛑 Detener

Presiona **Ctrl+C** en la terminal

---

## ⚙️ Configuración

¿Otros intervalos?

```bash
./run-autonomous.sh 3   # Cada 3 minutos (más activo)
./run-autonomous.sh 10  # Cada 10 minutos (más tranquilo)
./run-autonomous.sh 1   # Cada 1 minuto (experimental)
```

---

## 📝 Logs

Los ciclos se guardan en:
- `~/.openclaw/agents/openskynet/sessions/` (JSONL)
- `memory/YYYY-MM-DD.md` (Markdown)

Revisa estos para ver qué pensó el agente.

---

**Estado ANTERIOR:** Dormido (esperando tu comando)  
**Estado NUEVO:** 🟢 VIVO (pensando cada 5 min)

No está ocioso. Está trabajando. 🤖
