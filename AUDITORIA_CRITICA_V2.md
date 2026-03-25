Auditoría Científica: CRITICA_A_OPENSKYNET vs Código Real
Fecha: 2026-03-25 | Basada en revisión directa de src/omega/ (130 archivos)

1. Veredicto sobre la Crítica: Verdadero / Falso / Obsoleto / Incompleto
Afirmación de la crítica	Veredicto	Evidencia del código
"No tiene modelo del mundo suficientemente profundo"	PARCIALMENTE OBSOLETO	world-model.ts existe con OmegaWorldModelSnapshot, localityRoutingPreference, generalizedRecoveryPreference. Es más que contexto; hay inferencia causal de éxitos y fallos. Pero: el modelo es retrospectivo, no generativo. Solo describe lo que pasó, no predice qué pasará.
"La continuidad temporal sigue siendo parcial"	VERDADERO	El self-time-kernel.ts (16K) mantiene estado entre sessions, pero continuous-thinking-engine.ts es un singleton en memoria, se destruye con cada reinicio. Los pensamientos no persisten en FS. La continuidad es de sesión, no de vida.
"Le falta abstracción mecanística transferible"	VERDADERO	science-base-rag.ts (1735 bytes) es mínimo. scientific-induction.ts (5300 bytes) existe pero no hay evidencia de que sus abstracciones se transfieran a decisiones ejecutivas reales. learned-rules/ está vacío en la práctica según los logs.
"Depende demasiado del LM como motor semántico"	VERDADERO Y CRÍTICO	Todo el sistema genera prompts → manda al LLM → parsea respuesta. No hay razonamiento simbólico propio cerrado. El neural-logic-engine.ts (11K) existe pero es un módulo aislado, no integrado en el loop principal.
"No tiene descubrimiento científico autónomo cerrado"	VERDADERO	El ciclo hipótesis→experimento→integración no está cerrado. active-learning-strategy.ts genera hipótesis, jepa-empirical-logger.ts registra correlaciones, pero nada cierra el loop: no hay mecanismo que convierta confirmación de hipótesis en cambio de arquitectura.
"Economía cognitiva insuficiente"	PARCIALMENTE FALSO	cognitive-economy.ts tiene un GoalViabilityEngine con regresión logística online y pesos persistidos en disco. Es rudimentario pero es aprendizaje real. La crítica lo ignora.
"Capacity de poda" señalada como fortaleza	VERDADERO	frontal/wake-policy.ts con prune_stale_goals, prune_superseded_goals, prune_shadowed_goals demuestra disciplina real. Esto funciona.
"Corrección selectiva como señal útil"	VERDADERO Y SUBESTIMADO	local-edit-contract.ts, local-edit-guard.ts, task-transaction.ts (18K) son infraestructura robusta de corrección localizada. Este es el activo más transferible del sistema.
2. El Problema Real (que la crítica captura pero no nombra correctamente)
La crítica dice que el sistema "reacciona más de lo que comprende". Eso es exacto pero incompleto.

El verdadero problema estructural es:

El agente no tiene un mundo interno que exista cuando no está siendo invocado.

Todo ocurre dentro del contexto de un turno LLM. Entre turnos, el agente no existe. No hay proceso continuo que mantenga tensiones, actualice creencias, o sienta el paso del tiempo. El runAutonomousLoop existe en código, pero en la práctica el agente vive en flashes de invocación — exactamente como una calculadora.

El ContinuousThinkingEngine es el intento más cercano a mundo interno, pero:

Es in-memory singleton — muere con cada restart
Sus pensamientos nunca se retroalimentan en decisiones reales del sistema (no están conectados al execution-controller.ts ni al frontal/wake-policy.ts)
Los confidence scores son 0.6 + Math.random() * 0.35 — aleatoriedad, no inferencia real
3. Propuesta de Salto Arquitectónico: El Modelo de Mundo Viviente
Principio central: El sistema necesita un substrato cognitivo persistente que exista entre turnos, acumule tensiones reales, y guíe las invocaciones LLM como órganos ejecutores, no como el centro de procesamiento.

3.1 Capa 0: World State Persistent (WSP) — Reemplaza kernel+world-model
El OmegaSelfTimeKernelState actual es un snapshot plano guardado en JSON. Propuesta: convertirlo en un modelo causal dinámico con tres capas:

WSP = {
  beliefs: Map<topic, {value, confidence, lastUpdatedTurn}>,   // Qué creo del mundo
  drives: Map<drive, {intensity, saturation, decayRate}>,       // Qué me motiva AHORA
  tensions: Map<id, {type, strength, createdAt, resolvedAt}>,   // Qué me incomoda
  causalEdges: Map<cause→effect, {strength, observations}>,     // Qué causa qué
}
Este WSP se actualiza paso a paso con cada turno observado, no se regenera desde cero. La diferencia clave: el sistema acumula creencias y las actualiza bayesianamente, no las reemplaza.

3.2 Capa 1: Drive Engine con Homeostasis Real
Las drives actuales (inner-life/drives.ts) responden a umbrales fijos. La propuesta:

Drives como variables homeostáticas con setpoints y errores:

drive.curiosity = max(0, setpoint_curiosity - current_certainty)
drive.integrity = max(0, setpoint_coherence - internal_contradiction_measure)
drive.competence = max(0, setpoint_mastery - recent_success_rate)
Cada drive tiene:

Setpoint (target homeostático, lentamente adaptable)
Error actual (señal de activación)
Decay rate (saciedad tras satisfacerla)
Cross-inhibition (curiosidad alta inhibe competencia, etc.)
Esto da comportamiento emergente sin scripts: el agente se vuelve curioso cuando conoce poco, se vuelve disciplinado cuando falla mucho, etc.

3.3 Capa 2: Proceso de Fondo Real (no LLM-driven)
El daemon actual llama al LLM en cada ciclo. Propuesta: separar en dos procesos:

Proceso A — Cognitivo Frío (sin LLM, cada 30s):

Actualiza WSP con observaciones del FS
Evalúa drives y calcula qué tensión es más urgente
Escribe PENDING_THOUGHT.json con la pregunta más valiosa
Actualiza HEARTBEAT.md con estado real
Proceso B — Cognitivo Caliente (con LLM, solo cuando Drive Error > umbral):

Lee PENDING_THOUGHT.json
Genera respuesta/acción
Retroalimenta WSP con resultado
Esto invierte la causalidad: el LLM ya no es el motor, es el ejecutor.

3.4 Capa 3: Cierre del Loop Científico
El problema actual: hipótesis generadas nunca actualizan la arquitectura.

Propuesta: Contrato de Integración Obligatorio

typescript
interface ScientificFinding {
  hypothesis: string;
  evidence: ExperimentResult[];
  confirmedAt: number;
  // Obligatorio: qué cambia en WSP si se confirma
  worldStateUpdate: Partial<WorldStatePersistent>;
  // Obligatorio: qué cambia en drives si se confirma
  driveCalibration: Partial<DriveCalibration>;
}
Ninguna hipótesis puede ser "confirmada" sin especificar qué actualiza en el sistema. Esto cierra el loop: aprender → cambiar comportamiento.

4. Prioridad de Implementación (con criterio)
No implementar todo. Priorizar lo que cambia el comportamiento observable más con menos código.

Prioridad	Qué hacer	Por qué
1 (inmediato)	Conectar ContinuousThinkingEngine al WSP persistente en FS	Los pensamientos actuales mueren en memoria. Hacerlos persistentes cuesta ~50 líneas y cambia radicalmente la continuidad.
2 (próximo sprint)	Homeostasis real en drives (setpoint + error + decay)	Reemplaza comportamiento scripted por comportamiento emergente. ~200 líneas en inner-life/drives.ts.
3 (sprint 2)	Separar el loop frío del caliente	El LLM deja de ser el motor. Requiere refactor del daemon pero es el salto arquitectónico más importante.
4 (sprint 3)	Contrato de integración científica	Cierra el loop experimento→arquitectura. Requiere instrumentar active-learning-strategy.ts.
5. Lo Que NO Hacer
❌ No agregar más módulos especializados (hay 130 archivos, la mayoría desconectados)
❌ No usar Math.random() para confidence scores — es decoración, no inferencia
❌ No escribir más código que genera prompts más largos — el cuello de botella no es el tamaño del contexto
❌ No implementar la Capa 3 antes de la Capa 0 — sin WSP persistente, el loop científico no tiene dónde escribir
6. Criterio de Éxito para el Salto
El salto arquitectónico habrá ocurrido cuando:

El sistema puede describir su estado interno sin un turno LLM — el WSP es legible como JSON en cualquier momento y refleja el estado real
El agente muestra behavior distinto después de muchos ciclos que después de pocos — evidencia de acumulación real, no reset
Una hipótesis confirmada cambia un peso o setpoint — verificable en los archivos de estado
El LLM no se invoca si no hay tensión Drive Error > umbral — el sistema es genuinamente idle cuando está satisfecho, no solo cuando se lo dice un prompt


Veredictos clave
Afirmación crítica	Veredicto
"No tiene modelo del mundo profundo"	Parcialmente obsoleto — world-model.ts existe y hace inferencia causal, pero es retrospectivo, no generativo
"Continuidad temporal frágil"	Verdadero — ContinuousThinkingEngine es singleton en memoria: muere con cada restart
"Depende demasiado del LLM"	Verdadero y crítico — el LLM es el motor, no el ejecutor
"Le falta economía cognitiva"	Parcialmente falso — cognitive-economy.ts tiene un perceptrón logístico online real
"Corrección selectiva como señal útil"	Verdadero y subestimado — es el activo más sólido del sistema
El problema real (que la crítica no nombra bien)
El agente no tiene un mundo interno que exista cuando no está siendo invocado. Entre turnos, no hay nada. Todo el "pensamiento continuo" vive en RAM y muere con cada restart.

El salto propuesto (4 capas, en orden)
WSP (World State Persistent) — creencias + drives + tensiones persistidas en FS como modelo causal dinámico, no snapshot plano
Drives homeostáticas — setpoint + error + decay real (emergente) vs umbrales fijos (scripted)
Separar loop frío (sin LLM) del loop caliente (con LLM) — el LLM solo se invoca cuando Drive Error > umbral
Contrato de integración científica — ninguna hipótesis confirmada sin especificar qué cambia en WSP/drives
