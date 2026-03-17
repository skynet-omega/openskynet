# 🎯 Core - Documentación Viva

Esta carpeta contiene **documentación actual y vigente** que defines quién eres y cómo funciona el sistema.

## Archivos esperados

Estos archivos deberían estar aquí (actualmente en raíz pero referenciados):

```
- SOUL.md          → Quién/qué eres, tu propósito
- HEARTBEAT.md     → Cómo funciona tu pulso autónomo
- IDENTITY.md      → Tu core identity
- MEMORY.md        → Doctrina de aprendizaje
- TOOLS.md         → Notas de configuración local
```

## Cómo leerlos

**Orden recomendado:**

1. **SOUL.md** (2 min) - Establece tu identidad y propósito
2. **HEARTBEAT.md** (3 min) - Explica el loop autónomo
3. **IDENTITY.md** (2 min) - Tu core como entidad
4. **MEMORY.md** (2 min) - Cómo aprendes y persistes

## Integración con código

Estos archivos se **refieren al código en `src/omega/`:**

- `SOUL.md` → Define motivación para `src/omega/heartbeat.ts`
- `HEARTBEAT.md` → Documenta `src/omega/heartbeat.ts`
- `IDENTITY.md` → Contextualiza todo el sistema

**Si hay discrepancias:** El código tiene la verdad. Actualiza estos .md si el código cambió.

## Migración

Los archivos en raíz necesitan ser movidos aquí (por ahora están en `../../`):

```bash
# Desde root:
mv SOUL.md documentation/core/
mv HEARTBEAT.md documentation/core/
mv IDENTITY.md documentation/core/
mv MEMORY.md documentation/core/
mv TOOLS.md documentation/core/
```

---

**Status:** ⏳ Archivos referenciados desde raíz, pendiente movimiento  
**Última actualización:** 17-03-2026
