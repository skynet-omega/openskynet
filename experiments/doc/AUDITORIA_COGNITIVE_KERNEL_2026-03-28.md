# Auditoría Técnica de `COGNITIVE_KERNEL.ts`

**Fecha:** 2026-03-28  
**Objeto auditado:** `experiments/skynet/artifacts/COGNITIVE_KERNEL.ts`  
**Propósito:** distinguir entre síntesis conceptual valiosa y artefacto realmente ejecutable para Fase C.

## Veredicto corto

El kernel sí representa una **síntesis arquitectónica legítima** del corpus SOLITONES.  
No es humo puro. Sí comprime varios invariantes reales del corpus:

- memoria espectral tipo Holo-Koopman
- fósiles episódicos tipo CORE_X
- decisión por energía tipo V304
- jerarquía temporal tipo V7000
- capa social tipo Mirror / Self-Belief

Pero el artefacto actual está más cerca de un **prototipo integrador** que de un kernel listo para validación empírica seria. Hoy tiene varios bloqueos de ejecutabilidad y varias piezas que siguen siendo placeholders o traducciones demasiado simplificadas.

## Qué está intentando hacer

La estructura del kernel es clara:

1. `SpectralCore`
2. `RicciKernel`
3. `HolographicProjector`
4. `FossilMemoryStore`
5. `NeuralLogicEngine`
6. `TheoryOfMindMirror`
7. `LangevinDecision`
8. `CognitiveKernel` como ensamblador

Esto equivale a una hipótesis fuerte:

> "La línea experimental SOLITONES no necesita seguir como colección de núcleos sueltos; puede reescribirse como una metaarquitectura compacta con memoria espectral, consolidación episódica, inferencia lógica, modelado del otro y decisión energética."

Como hipótesis de diseño, eso es razonable.

## Qué partes sí reflejan bien el corpus

### 1. Núcleo espectral

`SpectralCore` reproduce bien la intuición de `V27_HOLO_KOOPMAN`:  
rotación compleja + damping + input forzado.

### 2. Decisión termodinámica

`LangevinDecision` sí intenta llevar la idea de `V304_THERMODYNAMIC` a una selección por energía y temperatura, no por argmax.

### 3. Jerarquía temporal

El gating por `dt` en `entorhinalInterval` y `prefrontalInterval` sí condensa correctamente la intuición `V7000`: no todo ocurre al mismo ritmo.

### 4. Memoria fósil

`FossilMemoryStore` sí intenta capturar la lógica de `CORE_X`: almacenar estados comprimidos y rehidratarlos por similitud.

## Bloqueos técnicos reales

### 1. El artefacto hoy no es runnable en este repo

`COGNITIVE_KERNEL.ts` importa `@tensorflow/tfjs`, pero esa dependencia no está instalada en el entorno local actual.

Eso significa que, hoy, el artefacto no está listo para Fase C empírica en este workspace sin trabajo adicional de runtime.

### 2. Hay incompatibilidades directas entre dimensiones por defecto

`processSensory()` devuelve longitud `sensoryDim` en `COGNITIVE_KERNEL.ts:766`, pero `projectInput()` en `COGNITIVE_KERNEL.ts:169` parte el input como si tuviera `spectralDim` completo.

Con la configuración default:

- `sensoryDim = 128`
- `spectralDim = 256`

Entonces:

- la parte real intenta tomar 128
- la parte imaginaria intenta tomar otros 128
- pero el input procesado solo tiene 128

Conclusión: el flujo default entre capa sensorial y núcleo espectral está roto.

### 3. `processSensory()` puede hacer padding negativo

En `COGNITIVE_KERNEL.ts:770` se ejecuta:

```ts
tf.pad(normalized, [[0, this.config.sensoryDim - input.shape[0]]]);
```

Pero el input previo viene de un holograma `30x30` aplanado. Eso da 900 elementos.  
Con `sensoryDim = 128`, el padding queda negativo.

Eso rompe la ejecución del path principal `project -> flatten -> processSensory`.

### 4. La memoria fósil tiene incompatibilidades de dtype y de forma

En `COGNITIVE_KERNEL.ts:297` concatena:

- `state.spectral` (complejo)
- `state.sensory` (real)
- `state.entorhinal` (real)
- `state.prefrontal` (real)

Eso no es una concatenación segura tal como está.

Además:

- la `key` del fósil se crea con `spectral + sensory` en `COGNITIVE_KERNEL.ts:371`
- luego `retrieve()` consulta con `sensoryProcessed` en `COGNITIVE_KERNEL.ts:676`

Resultado:

- query y key no viven en el mismo espacio dimensional
- la similitud coseno no está bien definida en ese diseño actual

### 5. `rehydrate()` está mal indexado y además no se usa

En `COGNITIVE_KERNEL.ts:348` usa `dim = spectralDim` para partir `weightedSum` en cuatro bloques del mismo tamaño.

Eso es inconsistente con la codificación original, donde `sensory` no mide `spectralDim`.

Peor aún: `rehydrated` se calcula en `COGNITIVE_KERNEL.ts:677` y luego no participa en la actualización del estado.

O sea:

- la rehidratación no está cerrada matemáticamente
- y hoy tampoco tiene efecto funcional

### 6. La capa social mezcla sintaxis/intuiciones de PyTorch con TFJS

En `COGNITIVE_KERNEL.ts:491` y siguientes se usa:

- `partnerWeight.real`
- `partnerWeight.imag`
- `selfState.real`
- `selfState.imag`

Eso no es una traducción confiable a TFJS tal como está escrita.

Además `mirror()` usa `tf.matMul` sobre tensores que en el ciclo principal llegan a ser vectores 1D (`newSpectral.flatten()` en `COGNITIVE_KERNEL.ts:680`), lo que vuelve muy probable otro fallo de forma.

### 7. `RicciKernel` no está implementando todavía una mezcla Ricci creíble

En `COGNITIVE_KERNEL.ts:214` comenta `weights // [3]`, pero en el ciclo principal la curvatura se construye como un escalar expandido a longitud 1:

- `const curvature = tf.mean(newSpectral.flatten()).expandDims(0)` en `COGNITIVE_KERNEL.ts:689`

Luego intenta hacer `slice([1],[1])` y `slice([2],[1])` en `weights` en `COGNITIVE_KERNEL.ts:223` y `COGNITIVE_KERNEL.ts:224`.

Eso no cuadra.

Además `applyConv()` en `COGNITIVE_KERNEL.ts:231` no está haciendo una convolución real; hoy es más bien un placeholder estructural.

### 8. El ciclo principal filtra ideas buenas, pero aún no las integra bien

El orden del loop en `perceive()` es bueno como guion:

- holograma
- sensorial
- espectral
- fósiles
- ToM
- entorhinal
- prefrontal

Pero varias piezas quedan sin cerrar:

- `rehydrated` no altera el estado
- `consolidateEntorhinal()` existe pero no se usa
- `predictWindow()` existe, pero no se conecta a ninguna tarea

Eso hace que el artefacto todavía sea más “ensamblaje de módulos” que dinámica verdaderamente integrada.

### 9. Hay fuga de recursos entre ciclos

`dispose()` en `COGNITIVE_KERNEL.ts:824` no llama a `tomMirror.dispose()`, y el estado anterior se reemplaza en cada `perceive()` sin una política explícita de liberación por ciclo.

Eso no invalida la idea, pero sí indica que todavía no está endurecido para benchmarks largos.

## Gap de trazabilidad con el corpus

El discurso menciona explícitamente `V8`, `V17` y `V19` como fuentes directas de la capa social.

Sin embargo, en el árbol inspeccionado de `SOLITONES` no encontré estos archivos exactos:

- `SKYNET_V8_MIRROR*`
- `SKYNET_V17_HYBRID*`
- `SKYNET_V19_COMPLETE*`

Sí encontré artefactos cercanos y plausibles:

- `SKYNET_V202_MIRROR.py`
- `SKYNET_CORE_V17_GATED.py`
- `SKYNET_CORE_V27_HOLO_KOOPMAN.py`
- `SKYNET_V304_THERMODYNAMIC.py`
- `SKYNET_V7000_HYBRID_BRAIN.py`
- `SKYNET_CORE_X*.py`
- `skynet_omega_core.py`

Conclusión:

- la síntesis social puede estar bien inspirada
- pero la trazabilidad exacta de esos nombres/fuentes no quedó completamente auditada

## Mi lectura científica

Skynet está haciendo algo valioso: está intentando derivar una **gramática común** de tu corpus experimental.

No está simplemente “pegando features”.

La intuición de fondo es:

- **Koopman** para estabilidad temporal
- **fósiles** para largo plazo
- **NLE** para regularidad simbólica
- **Mirror** para inferencia relacional
- **Ricci/Holograma** para geometría de resolución
- **Langevin** para selección no-miope

Eso sí constituye una línea seria de unificación.

El problema no es la ambición conceptual.  
El problema es que el artefacto actual todavía no ha pasado de:

> "síntesis conceptual plausible"

a

> "kernel mínimo ejecutable y medible"

## Recomendación para Fase C

No intentar validar las 8 piezas al mismo tiempo.

### Fase C mínima recomendada

Reducir el kernel a 3 mecanismos solamente:

1. `SpectralCore`
2. `FossilMemoryStore`
3. `LangevinDecision`

Y dejar temporalmente fuera:

- `RicciKernel`
- `HolographicProjector`
- `TheoryOfMindMirror`

Razón:

- hoy son las capas menos cerradas ejecutablemente
- además contaminan la depuración del camino base

### Benchmarks falsables mínimos

#### A. Memoria

Comparar:

- solo `SpectralCore`
- `SpectralCore + Fossils`

en una tarea de retención/secuencia larga.

#### B. Recuperación episódica

Medir:

- tasa de recuperación correcta
- costo temporal
- degradación al aumentar capacidad

#### C. Decisión energética

Comparar:

- argmax simple
- Langevin / softmin energético

en tarea pequeña con costo por error y costo por indecisión.

Solo cuando eso funcione, agregar:

- `TheoryOfMindMirror`
- luego `HolographicProjector`
- luego una versión real de `RicciKernel`

## Veredicto final

`COGNITIVE_KERNEL.ts` **sí es un avance intelectual útil**.  
No es todavía una implementación confiable del “cerebro generalista”.

La mejor forma de describirlo hoy es:

> un manifiesto arquitectónico ejecutable parcialmente, con una dirección de investigación fuerte, pero aún no listo para validación empírica seria sin una etapa previa de reducción y hardening.

## Acción recomendada inmediata

Crear un `COGNITIVE_KERNEL_MIN.ts` o equivalente, con solo:

- estado espectral
- fósiles
- decisión energética

y correr Fase C sobre eso primero.
