# Reporte Paralelo MVK vs Sesión `agent:openskynet:telegram:direct:8712203118`

**Fecha:** 2026-03-28  
**Objeto comparado:** trabajo paralelo sobre `experiments/skynet/artifacts/COGNITIVE_KERNEL_MIN.ts`

## Resumen corto

La sesión `agent:openskynet:telegram:direct:8712203118` sí avanzó de forma útil:

- redujo `COGNITIVE_KERNEL.ts` a un `COGNITIVE_KERNEL_MIN.ts`
- dejó un `TEST_MVK.ts`
- confirmó el primer bloqueo de entorno: falta `@tensorflow/tfjs`

Mi ejecución paralela confirmó que la reducción fue correcta en espíritu, pero encontró un bug adicional que la otra sesión no llegó a ver:

- la memoria fósil persistía tensores creados dentro del `tf.tidy()` del ciclo de percepción sin `tf.keep()`
- eso hacía que la consolidación pareciera funcionar, pero luego fallara en tiempo de ejecución al reutilizar fósiles

Ese bug quedó corregido y el MVK ya pasó pruebas empíricas reales.

## Qué hizo la otra sesión

De acuerdo al transcript persistido, la otra sesión:

1. creó `experiments/skynet/artifacts/COGNITIVE_KERNEL_MIN.ts`
2. creó `experiments/skynet/artifacts/TEST_MVK.ts`
3. intentó ejecutar el test
4. quedó bloqueada por `ERR_MODULE_NOT_FOUND` de `@tensorflow/tfjs`

Ese diagnóstico inicial era correcto, pero incompleto.

## Qué validé en paralelo

### 1. Corrección real del lifecycle TFJS

En `FossilMemoryStore.store()` los tensores persistentes ahora se guardan con `tf.keep(...)`.

Sin eso, el test fallaba durante consolidación con un error de backend interno de TFJS al intentar reutilizar un fósil ya recolectado por el `tidy`.

### 2. Smoke test falsable

`TEST_MVK.ts` ya no es solo narrativo. Ahora valida:

- normalización de forma a `spectralDim`
- path `30x30` sin padding negativo
- consolidación efectiva de fósiles
- recuperabilidad explícita del patrón previamente consolidado

### 3. Stress test separado

Se añadió `STRESS_TEST_MVK.ts`, que mezcla:

- inputs `10x10`
- inputs `30x30`
- vectores de tamaño `spectralDim`
- ciclos de sorpresa alta

Resultado observado:

- `60` ciclos sin crash
- `32` fósiles consolidados
- patrón ancla recuperable al final

## Hallazgos macro adicionales

El root del repo sigue con una inconsistencia de workspace que impide usar `pnpm add` limpiamente:

- `extensions/googlechat/package.json`
- `packages/moltbot/package.json`
- `packages/clawdbot/package.json`
- `extensions/memory-core/package.json`

Todos siguen apuntando a `openclaw: workspace:*` aunque el paquete raíz actual es `openskynet`.

Por eso, para validar Fase C sin ensuciar más el root, el runtime de `@tensorflow/tfjs` quedó instalado localmente en `experiments/skynet/node_modules`.

## Estado actual del MVK

**Sí quedó operativo para Fase C mínima.**

Validado:

- ejecutabilidad básica
- formas consistentes
- consolidación episódica
- recuperación explícita
- estabilidad en stress corto

Todavía pendiente:

- `LangevinDecision` sigue definido pero no participa aún en la dinámica principal
- se está usando `@tensorflow/tfjs` puro; para benchmarks más duros conviene migrar a `@tensorflow/tfjs-node`
- la recuperacion existe, pero aún no está demostrado que mejore desempeño aguas abajo; solo que el loop memoria -> recuperación ya no está roto
