# 📚 OpenSkyNet Documentation Index

**¿Eres nuevo?** → Leer [ONBOARDING.md](ONBOARDING.md) (5 min)  
**¿Tienes prisa?** → Leer [SOUL.md](core/SOUL.md) (2 min)

---

## 🎯 CORE — Lee primero (Tu base)

**Si necesitas entender QUÉ ES OpenSkyNet:**
- [SOUL.md](core/SOUL.md) - Quién/qué eres, tu propósito y misión
- [HEARTBEAT.md](core/HEARTBEAT.md) - Cómo funciona el pulso autónomo
- [IDENTITY.md](core/IDENTITY.md) - Tu identidad como entidad
- [MEMORY.md](core/MEMORY.md) - Doctrina de aprendizaje

**Si trabajas en OpenClaw (no OpenSkyNet):**
- [../../AGENTS.md](../../AGENTS.md) - Guía de repo + conventions oficiales

---

## 🔧 ANALYSIS — Lee cuando necesites profundidad

**Si necesitas entender la ARQUITECTURA actual:**
- [VALIDACION_TIER1_INFORME.md](analysis/VALIDACION_TIER1_INFORME.md) - Qué código orphaned fue eliminado y por qué ✅
- [ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md](analysis/ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md) - Comparación técnica SkyNet vs OpenSkyNet

**Si necesitas CONTEXTO HISTÓRICO:**
- [analysis/](analysis/) - Todos los análisis técnicos profundos (date-stamped)

---

## 📦 ARCHIVE — No son vigentes

**Estas son PROPUESTAS evaluadas pero NO implementadas** (código fue eliminado):
- Archivos sobre "Tier 1": meta-controller, dsl-searcher, panel-logic, rule-extractor
- Propuestas arquitectónicas que requieren trabajo futuro
- Roadmaps para mejoras no realizadas

**¿Cuándo leerlas?** Solo si necesitas entender una idea anterior que se rechazó.

---

## 🕒 STATUS — Reportes históricos

**Estos son snapshots en el tiempo** (fecha-stamped):
- Útiles como referencia histórica
- Pueden estar desactualizados
- Lee el código, no estos reportes, como fuente de verdad

---

## 🚫 Qué NO hacer (primeras 24h)

- ❌ Leer propuestas sobre "Tier 1" o "meta-controller" → Código fue eliminado
- ❌ Asumir que TODO en docs/ está implementado → Lee código primero
- ❌ Ignorar si docs y código no concuerdan → El código tiene la verdad
- ❌ Modificar `src/omega/` sin leer `heartbeat.ts` primero

---

## ✅ Qué SÍ hacer

- ✅ Ejecutar `pnpm test` temprano → Te dice estado real
- ✅ Leer código más que documentación
- ✅ Si algo no concuerda → Confía en el código
- ✅ Preguntar cuando no entiendas (docs están fragmentadas)

---

## 🗺️ Estructura rápida

```
docs/
├─ INDEX.md                    ← Estás aquí
├─ ONBOARDING.md               ← Para nuevos (5 min)
├─ core/                       ← Documentación viva
│  ├─ SOUL.md                  (identidad)
│  ├─ HEARTBEAT.md             (pulso autónomo)
│  ├─ IDENTITY.md              (core identity)
│  ├─ MEMORY.md                (doctrina)
│  └─ TOOLS.md                 (notas locales)
├─ analysis/                   ← Análisis técnicos profundos
│  ├─ VALIDACION_TIER1_INFORME.md
│  ├─ ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md
│  └─ [otros análisis]
├─ archive/                    ← Propuestas sin hacer
│  ├─ PROPUESTA_100_ARQUITECTONICO.md
│  ├─ DECISION_EJECUTIVA_TIER1.md
│  └─ [otras propuestas]
└─ status/                     ← Reportes históricos
   ├─ ESTADO_OMEGA_2026-03-15.md
   └─ [snapshots en el tiempo]
```

---

## 🔗 Referencias Oficiales (Así trabaja tu host)

- **OpenClaw Docs:** https://docs.openclaw.ai
- **OpenClaw GitHub:** https://github.com/openclaw/openclaw
- **Discord:** https://discord.gg/clawd

---

**Última actualización:** 17-03-2026  
**Para nuevos devs:** Comienza en [ONBOARDING.md](ONBOARDING.md)
