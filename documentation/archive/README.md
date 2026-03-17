# 📦 Archive - Propuestas Viejas

Esta carpeta contiene **propuestas, decisiones y roadmaps que fueron evaluados pero NO implementados**.

## Razón por la que están aquí

Estos documentos hablan de:
- Mejoras arquitectónicas que requieren más trabajo
- Componentes (Tier 1) cuyo código fue eliminado
- Planes futuros que se han archivado
- Decisiones que se evaluaron pero se rechazaron

## Archivos que deberían estar aquí

Actualmente en `../../` pero deberían estar aquí:

```
- PROPUESTA_100_ARQUITECTONICO.md ← Propuesta de Tier 1
- QUICK_REFERENCE_10_MEJORAS_2026-03-16.md ← Roadmap no realizado
- DECISION_EJECUTIVA_TIER1.md ← Decisión ejecutiva archivada
- ROADMAP_MAESTRO_TIER1.md ← Plan Tier 1 (no hecho)
- REDUNDANCIA_VISUAL_MAPA.md ← Mapa de Tier 1 redundante
- PLAN_B_COMPLETE_IMPLEMENTATION_REPORT.md ← Plan B (archivado)
- PLAN_B_FASE_1.2_IMPLEMENTATION_COMPLETE.md ← Plan B Fase 1.2
- PROPUESTA_ARQUITECTURA_HIBRIDA_FRONTAL.md ← Propuesta hibrida
- Síntesis Físico-Matemática de Agentes Cognitivos Corporizados.md ← Teórico
- THE_5_JEWELS.md ← Análisis de propuesta
- UPGRADE_PLAN_PHASE4.md ← Plan de actualización archivado
```

## ¿Cuándo leer esto?

- Solo si necesitas entender una idea anterior
- Para contexto histórico
- Para entender qué se evaluó y por qué se descartó

## Migración

```bash
# Desde root:
for f in PROPUESTA_100_ARQUITECTONICO.md QUICK_REFERENCE_10_MEJORAS_2026-03-16.md DECISION_EJECUTIVA_TIER1.md ROADMAP_MAESTRO_TIER1.md REDUNDANCIA_VISUAL_MAPA.md PLAN_B_COMPLETE_IMPLEMENTATION_REPORT.md PLAN_B_FASE_1.2_IMPLEMENTATION_COMPLETE.md PROPUESTA_ARQUITECTURA_HIBRIDA_FRONTAL.md; do
  [ -f "$f" ] && mv "$f" documentation/archive/
done
```

---

**Status:** ⏳ Pendiente migración  
**Última actualización:** 17-03-2026
