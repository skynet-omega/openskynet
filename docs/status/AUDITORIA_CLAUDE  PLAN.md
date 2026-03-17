Loop de Vida Autónoma — Opción C
OpenSkyNet como sistema proactivo con drives internas

Diagnóstico de partida
El estado actual del heartbeat de OpenSkyNet:

OpenClaw padre tiene un cron de heartbeat configurable (heartbeat.every) en 
acp-spawn.ts
El prompt viene de 
HEARTBEAT.md
 (estático: "busca tensión, si no hay, HEARTBEAT_OK")
El módulo OMEGA tiene estado (
self-time-kernel.ts
), tensión de tareas, episodic recall
applyOmegaHeartbeatExecutiveAction()
 en 
heartbeat.ts
 existe pero su lógica es reactiva: solo actúa si hay tensión de tarea fallida o stale
El problema: El tick es externo (cron), el prompt es estático, y el sistema solo actúa si hay tensión de tarea. No tiene drives propias. Entre dos mensajes humanos, el sistema no "piensa".

La distinción clave:

Ahora:  Cron → [¿hay tensión de tarea?] → Si sí, llama LLM → HEARTBEAT_OK
Meta:   Tick → [evalúa estado PROPIO] → Decide si invoca LLM y qué hace
Diseño de la Opción C
Principio: Mínima fricción, máxima autonomía real
No tocar el runtime base. No añadir librerías. No tirar nada. Un módulo nuevo que se engancha al heartbeat existente y añade lógica de drives internas.

Las 3 drives mínimas implementables
Drive	Pregunta que responde	Acción al activarse
Homeostasis epistémica	¿Hay incoherencia entre lo que el kernel registra y lo que hay en disco?	Verificar, reconciliar
Curiosidad dirigida	¿Hay algo en memory/, experimentos, o el propio código que no se ha estudiado desde hace N días?	Leer, anotar, enlazar
Entropía propia	¿Qué tan "vivo" está el sistema? ¿Cuántos turnos sin trabajo real?	Si mucho silencio → elegir un objetivo propio
Estas drives son funciones puras que toman el estado del kernel y retornan una decisión.

Proposed Changes
Nuevo módulo: src/omega/inner-life/
[NEW] src/omega/inner-life/drives.ts
Tres funciones puras de evaluación de drives internas:

typescript
export type InnerDriveSignal =
  | { kind: "homeostasis"; reason: string; urgency: number }
  | { kind: "curiosity"; target: string; reason: string; urgency: number }
  | { kind: "entropy_alert"; silentTurns: number; urgency: number }
  | { kind: "idle" };
export function evaluateInnerDrives(params: {
  kernel: OmegaSelfTimeKernelState;
  nowMs: number;
  memoryCandidates?: string[];  // rutas de archivos de memoria recientes
}): InnerDriveSignal
Lógica interna:

homeostasis: si tension.failureStreak > 0 Y no hay activeGoalId → reconciliar
curiosity: si turnCount > lastExploreAt + CURIOSITY_THRESHOLD → identificar fichero de memoria/experimento más antiguo no referenciado
entropy_alert: si identity.lastSeenAt < nowMs - SILENCE_THRESHOLD_MS → elegir objetivo autónomo
[NEW] src/omega/inner-life/autonomous-directive.ts
Convierte un InnerDriveSignal en un prompt concreto para el LLM:

typescript
export function buildAutonomousDirectivePrompt(params: {
  signal: InnerDriveSignal;
  kernel: OmegaSelfTimeKernelState;
  episodicHints?: OmegaRecoveryEpisode[];
}): string | undefined
El prompt tiene estructura diferente al heartbeat reactivo:

[INNER LIFE — drives autónomas]
Drive activa: curiosity
Objetivo elegido por iniciativa propia: revisar memory/omega-episodes/...
Restricción: no requerir confirmación humana para trabajo de lectura/anotación.
[NEW] src/omega/inner-life/index.ts
Exporta evaluateInnerDrives y buildAutonomousDirectivePrompt.

Modificación minimal: conectar al heartbeat existente
[MODIFY] 
src/omega/heartbeat.ts
Añadir en 
buildOmegaHeartbeatPrompt()
 el fallback a drives internas:

typescript
// Si wakeAction es heartbeat_ok (sin tensión de tarea), evaluar drives internas
if (wakeAction.kind === "heartbeat_ok") {
  const driveSignal = evaluateInnerDrives({ kernel, nowMs: Date.now() });
  if (driveSignal.kind !== "idle") {
    const autonomousPrompt = buildAutonomousDirectivePrompt({ signal: driveSignal, kernel });
    return autonomousPrompt; // ← esto es lo nuevo: el sistema decide por sí mismo qué hacer
  }
  return undefined; // heartbeat real OK, sin acción
}
Esto es el salto: hoy heartbeat_ok → undefined (no hace nada). Mañana: heartbeat_ok → evalúa drives → puede generar prompt.

Lo que NO se toca
src/omega/self-time-kernel.ts
 — sin cambios
src/omega/recovery.ts
 — sin cambios
src/omega/task-transaction.ts
 — sin cambios
src/omega/validator.ts
 — sin cambios
Todo el runtime de OpenClaw base — sin cambios
python/omega_py/ — sin cambios (se reserva para Opción A)
Parámetros configurables (sin magia)
typescript
const INNER_LIFE_CONFIG = {
  CURIOSITY_THRESHOLD_TURNS: 10,     // cada N turnos en silencio, drive de curiosidad
  SILENCE_THRESHOLD_MS: 4 * 60 * 60 * 1000,  // 4h sin actividad → entropy_alert
  MAX_URGENCY_FOR_LLM_CALL: 0.7,     // urgencias bajas no llaman al LLM
};
Todo configurable. Se puede deshabilitar completamente poniendo CURIOSITY_THRESHOLD_TURNS: Infinity.

Verificación
Test unitario (nuevo)
src/omega/inner-life/drives.test.ts:

Kernel sin tensión + silencio largo → retorna entropy_alert
Kernel con muchos turnos sin explorar → retorna curiosity
Kernel con tensión activa → retorna homeostasis
Kernel normal reciente → retorna idle
bash
# Desde el directorio openskynet
pnpm vitest run src/omega/inner-life/drives.test.ts
Test de integración (manual — puede observarse en logs)
Configurar heartbeat en 1m en el config de OpenSkyNet
No enviar mensajes durante 10 minutos
Verificar en logs del agente que se activa alguna drive y se genera un prompt autónomo
El agente debe hacer algo (leer un archivo de memoria, anotar algo) SIN que el usuario haya enviado nada
Criterio de éxito del experimento
El sistema hace al menos una acción útil por iniciativa propia en un período de silencio de >1h.

Si no hace nada útil, se analiza por qué y se ajustan los umbrales. No se añade complejidad.

Secuencia de implementación (2-3 horas de trabajo)
drives.ts — lógica pura, testeable, sin efectos
autonomous-directive.ts — prompt builder, retorna string o undefined
drives.test.ts — tests unitarios
heartbeat.ts
 — 5 líneas modificadas para conectar el fallback
Observar comportamiento en sesión real
Relación con Opción A (futuro)
Si esto funciona empíricamente, el siguiente paso es reemplazar evaluateInnerDrives() (que hoy usa heurísticas de estado discreto) con las salidas del motor 
holo_ode_func.py
:

El estado holográfico Python → señal de tensión continua → InnerDriveSignal
El motor Python corre en paralelo y el heartbeat lo consulta via IPC
Pero eso solo si la Opción C demuestra ser útil.
