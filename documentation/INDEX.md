# 📚 OpenSkyNet Documentation Index

**¿Eres nuevo?** → Leer [ONBOARDING.md](ONBOARDING.md) (5 min)  
**¿Tienes prisa?** → Busca tu archivo en las carpetas de abajo

---

## 🎯 CORE — Lee primero (Tu base)

En la carpeta [`core/`](core/), encontrarás:

- **SOUL.md** - Quién/qué eres, tu propósito y misión
- **HEARTBEAT.md** - Cómo funciona tu pulso autónomo
- **IDENTITY.md** - Tu core identity como entidad
- **MEMORY.md** - Doctrina de aprendizaje y persistencia

**Si trabajas en OpenClaw (no solo OpenSkyNet):**
- Ver [../../AGENTS.md](../../AGENTS.md) - Guía oficial de repo + conventions

---

## 🔧 ANALYSIS — Lee cuando necesites profundidad

En la carpeta [`analysis/`](analysis/), encontrarás:

**Análisis técnicos profundos:**
- VALIDACION_TIER1_INFORME.md - Qué código fue eliminado y por qué ✅
- ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md - Comparación técnica
- AUTOANALISIS_HONESTO.md - Crítica realista de la arquitectura
- Y otros análisis técnicos...

---

## 📦 ARCHIVE — Propuestas viejas (no vigentes)

En la carpeta [`archive/`](archive/), encontrarás:

**Proyectos evaluados pero NO implementados:**
- Propuestas que requieren trabajo futuro
- Análisis de Tier 1 (código eliminado)
- Roadmaps antiguos

**¿Cuándo leer?** Solo si necesitas entender una idea anterior que se evaluó pero se descartó.

---

## 🕒 STATUS — Reportes históricos

En la carpeta [`status/`](status/), encontrarás:

**Snapshots en el tiempo (fecha-stamped):**
- Auditorialogías pasadas
- Reportes de validación históricos
- Cambios documentados por fecha

**¿Cuándo leer?** Como referencia histórica. Lee el código como fuente de verdad, no estos reportes.

---

## 🚫 Qué NO hacer (primeras 24h)

- ❌ Leer propuestas sobre "Tier 1" o "meta-controller" → Código fue eliminado
- ❌ Asumir que TODO está implementado → Lee código primero
- ❌ Ignorar si docs y código no concuerdan → El código tiene la verdad
- ❌ Modificar `src/omega/` sin leer `heartbeat.ts` primero

---

## ✅ Qué SÍ hacer

- ✅ Ejecutar `pnpm test` temprano → Te dice estado real
- ✅ Leer código más que documentación
- ✅ Si algo no concuerda → Confía en el código
- ✅ Preguntar cuando no entiendas

---

## 🗺️ Ruta para nuevos

```
(5 min)   ONBOARDING.md (este directorio)
   ↓
(2 min)   core/SOUL.md
   ↓
(3 min)   core/HEARTBEAT.md
   ↓
(15 min)  src/omega/heartbeat.ts (el código real)
   ↓
(10 min)  pnpm test
   ↓
(15 min)  Explorar src/omega/ structure
```

---

**Siguiente paso:** Lee [ONBOARDING.md](ONBOARDING.md)
