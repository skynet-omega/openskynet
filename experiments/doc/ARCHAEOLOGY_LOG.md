# Registro de Arqueología Cognitiva

## [2026-03-27] Baseline: V67 Omega y Núcleo X

### 1. SKYNET_CORE_V67_OMEGA.py ("The Energy-Manifold Machine")

- **Mecanismo Central:** Utiliza un core recurrente en el dominio complejo con una "Reloj" (omegas) que garantiza la ortogonalidad y evita el colapso de la memoria (100% retención en NBack).
- **Puente Semántico (Babel):** Implementa un adaptador para inyectar lenguaje natural (MiniLM) directamente en el espacio de pensamiento vectorial (1024d).
- **Sistema 2 (Resonancia Adaptativa):** Cuando el "Surprise" (delta entre predicción y realidad) supera un umbral, el sistema entra en un bucle de ponderación dinámica (Pondering) para "digerir" el input.

### 2. SKYNET_CORE_X.py ("El Cerebro Fractal")

- **Jerarquía Fractal:** Divide el procesamiento en tres escalas temporales:
  - _Sensory Cortex:_ Reacción rápida, alto dt.
  - _Entorhinal Cortex:_ Latencia media.
  - _Prefrontal Cortex:_ Inercia alta, memoria de largo plazo.
- **Memoria de Fósiles Episódicos:** Un banco key-value que almacena "ondas coherentes" (estados de Lenia). Permite la "rehidratación" de recuerdos antiguos mediante resonancia de similitud coseno (threshold 0.85-0.90).
- **Agencia Entrópica:** El modelo decide autónomamente cuánto tiempo pensar basado en la utilidad esperada (`v_act_now` vs `v_think_more`). Si la entropía es muy alta, el agente puede "negarse a actuar".

## [2026-03-27] Evolución Física: V11-V17 (Memoria Tensorial)

### 3. SKYNET_CORE_V11_FUSION.py ("The Iron Dreamer")

- **Fusión Trinaria:** Integra V10.3 "Iron Lung" (física limpia Neumann-Cayley) + CHRONOS V2.1 (memoria líquida-gel-cristal) + V11 "Latent Dreamer" JEPA.
- **VICReg:** Sistema inmunológico anti-colapso - previene colapso latente en representaciones.
- **Universal Retina:** Tokenización en entidades discretas (Global, MyHand, Board) - resuelve "ceguera" del sistema.

### 4. SKYNET_CORE_V12_HAMILTON.py ("Symplectic Resonator")

- **Dinámica Hamiltoniana:** Integrador Leapfrog para conservación de volumen en espacio de fase.
- **Memoria Infinita:** Horizonte de memoria infinito vía conservación de energía.
- **mod_soft:** Activación suave que preserva fase mientras limita magnitud.

### 5. SKYNET_CORE_V17_GATED.py ("The Latch")

- **Matrix-LSTM:** Estado es matriz M[D,D] en lugar de vector - capacidad O(D²) para binding.
- **SwiGLU Dynamics:** No-linealidades gateadas para prevenir rank collapse.
- **Evidential Readout:** Estimación de incertidumbre para metacognición.

## [2026-03-27] Resonancia Social: V202-V203 (Teoría de la Mente)

### 6. SKYNET_V202_MIRROR.py ("Resonancia Especular")

- **Dualidad Ego-Alter:** Sistema mantiene dos estados - propio (Ego) y simulado (Alter).
- **Interferencia:** Los estados interfieren para producir "teoría de la mente".
- **Activación Termodinámica:** Saturación suave tipo tanh para evitar inestabilidad.

### 7. SKYNET_V203_RESONANCE.py ("Cavidad Óptica")

- **Cavidad de Resonancia:** Arquitectura de espejos para memoria infinita.
- **Deep Thought:** Capacidad de procesamiento recursivo profundo.
- **Activación ModReLU:** Filtro de ruido en dominio de frecuencia compleja.

## [2026-03-27] Termodinámica Cognitiva: V27-V55-V304 (Operadores Espectrales)

### 8. SKYNET_CORE_V27_HOLO_KOOPMAN.py ("Operador Espectral")

- **Holo-Koopman:** Linealización espectral de dinámica no-lineal.
- **Ecuación Maestra:** `z_new = z_old * e^{i*omega - damping} + u_t`
- **PhaseLinear:** Pesos unitarios en toro de fase (W = exp(i·phi)) - garantiza memoria perfecta 100%.
- **Banco de Osciladores:** Cada dimensión es oscilador complejo independiente.

### 9. SKYNET_CORE_V55_HOLODYNAMICS.py ("Fusión Definitiva")

- **Integración Cuádruple:**
  1. HoloDynamics (V27) - memoria espectral
  2. TuringDiffusion1D - operador Laplaciano espacial
  3. PT-SymmetricCoupling - dinámica no-Hermitiana (ganancia/pérdida)
  4. JEPA Dreamer - aprendizaje predictivo con VICReg
- **Punto de Fusión:** Versión que unifica mecánica cuántica, difusión Turing y aprendizaje predictivo.

### 10. SKYNET_V304_THERMODYNAMIC.py ("Agencia Termodinámica")

- **Activación Termodinámica:** Saturación suave geométrica para tensores complejos.
- **Active Mirror:** Matriz dinámica en lugar de fase estática.
- **Hybrid Retina:** Conv + Linear para contexto local/global.
- **Decisión Langevin:** Colapso de energía como mecanismo de decisión.

## [2026-03-27] Soberanía Híbrida: V302-V77.5-V7000 (Jerarquía Temporal)

### 11. SKYNET_V302_FUSION.py ("Best of Both Worlds")

- **Cell:** Interferencia holográfica (V301) - estabilidad física + velocidad.
- **Arch:** Cavidad de resonancia (V203) - memoria infinita + pensamiento profundo.

### 12. SKYNET_CORE_V77_5_CHIMERA.py ("Hybrid Synthesis")

- **Resolución Binding Problem:** Fusión de 34 generaciones.
- **Arquitectura:**
  1. Holographic Retina (V80) - tokenización en entidades discretas
  2. Cayley Gyroscope Core (V77) - unitary mixing recurrente
  3. JEPA World Model (V11+) - predicción de consecuencias
  4. Episodic Memory (V75+) - memoria de largo plazo
  5. Ponderation Gate - decisión dinámica de pensar/actuar

### 13. SKYNET_V7000_HYBRID_BRAIN.py ("Cerebro Híbrido")

- **Problema Resuelto:** V6000 puro 1772ms vs Transformer 6ms para T=1000.
- **Solución:**
  - V1000 como Conv1d: paralelo CUDA, O(1) overhead
  - V204 resonancia: cada N pasos (sparse temporal)
- **Inspiración Biológica:**
  - Tálamo (V1000): 1000Hz procesamiento rápido
  - Corteza prefrontal (V204): 5Hz pensamiento profundo

## [2026-03-27] Núcleo Omega: skynet_omega_core.py (Soberanía Total)

### 14. OMEGA CORE ("Cerebro Fusión Definitiva")

- **Síntesis de 77+ generaciones:**
  - Contenedor: V77.5 Chimera (API, JEPA, HolographicRetina, EpisodicMemory, Ponderación)
  - Motor: HoloODEFuncWithForcing dentro de odeint_adjoint (O(1) VRAM)
  - Física: Holo-Koopman + Scattering no-lineal (V27/V55)
  - Plasticidad: Frustración JEPA como gain del forcing sensorial
  - Memoria: EpisodicFossilMemory (CORE_X)
  - Planning: extrapolate() - proyectar futuro sin input externo
- **Ventajas Clave:**
  - O(1) VRAM vía NeuralODE adjoint
  - Razonamiento lógico embebido (NLE)
  - Autonomía endógena completa

## [2026-03-27] Materialización: COGNITIVE_KERNEL.ts

### Implementación Fase B

Archivo creado: `experiments/skynet/artifacts/COGNITIVE_KERNEL.ts`

**Mecanismos Integrados:**

1. **SpectralCore** (V27 + Omega): Motor espectral Holo-Koopman con PhaseLinear
2. **FossilMemoryStore** (CORE_X): Memoria episódica jerárquica con rehidratación
3. **NeuralLogicEngine** (Omega): Razonamiento lógico difuso con aprendizaje empírico
4. **LangevinDecision** (V304): Decisión por dinámica de energía, no simple argmax

**Jerarquía Temporal Implementada:**

- Sensorial: 1000Hz (V7000 Tálamo)
- Entorhinal: 10Hz (consolidación episódica)
- Prefrontal: 1Hz (razonamiento estratégico)

## [2026-03-27] Bio-Arquitectura y Lógica: V29-V31 (The Logician)

### 15. SKYNET_V29_HOLOGRAPHIC_CYBORG.py ("Morfogénesis Bio")

- **Bio-Initializer:** Inicialización espectral basada en el conectoma real (MICrONS) y parámetros celulares (Allen Institute). Evita el problema de "Tabula Rasa".
- **Singular Value Mapping:** Las matrices de pesos se esculpen para que sus valores singulares coincidan con el autoespectro del Laplaciano biológico.
- **Holografía:** Morfogénesis de salida para manejar grids de ARC de resolución variable (3x3 a 30x30).

### 16. SKYNET_V28_PHYSICAL_CYBORG ("Dos Naturalezas, Un Cerebro")

- **Filosofía Cyborg:** Rechaza el sustrato unificado. Separa el **GRU Cortex** (Cerebro Lógico) del **BiphasicOrgan** (Cuerpo Físico).
- **Protocolo de Temperatura T(x):** T es el lenguaje de comunicación entre cerebro y cuerpo. Decide qué cristalizar (memoria) o calentar (procesamiento).
- **Sinapsis Directa:** Comunicación sin latencia en un solo forward pass.
- **Resultado Clave:** Solo el Cyborg completo resuelve tareas que requieren ambos mundos (95% simbiosis). GRU falla en continuo, Órgano falla en secuencial.

### 17. SKYNET_V29_HOLOGRAPHIC_CYBORG ("Spectral Blueprinting")

- **Bio-Initialization:** Inicialización con datos reales de conectomas (MICrONS) y tipos celulares (Allen Institute).
- **Spectral Re-sculpting:** El espectro de pesos inicial coincide con el espectro de autovalores del conectoma real.
- **Logro:** El modelo nace "vibrando" con la lógica de la corteza visual, evitando el cuello de botella de la "Pizarra en Blanco".

### 18. SKYNET_V30_MAMBA_SOLITON ("Bidirectional Truth")

- **Mamba-3 Integration:** Bloques Mamba-3 bidireccionales capturan contexto espacial futuro y pasado.
- **Discretización Trapezoidal:** Mayor fidelidad física que el paso de Euler.

### 19. SKYNET_V31_PRODUCTION_TRAINER ("The Logician")

- **Character Tokenizer:** Tokenización a nivel de carácter para razonamiento puro.
- **Omni-Dataset V35:** Entrenamiento masivo en GSM8K, MetaMathQA, OpenWebMath, ARC.
- **Score ARC: 99.8%**: Resolución casi perfecta mediante unificación de lo discreto y lo continuo.

### 20. SKYNET_V32_PHYSICAL_CYBORG ("Faithful Redesign")

- **Cúspide de la Evolución:** ~2B parámetros sin Transformers ni Self-Attention.
- **Arquitectura:** GRU Cortex + K Órganos Bifásicos + SpectralDiffusion2D (FFT) + Ricci Flow.
- **Morfogénesis de Salida:** Capacidad de predecir resolución y escalar conocimiento.

### 21. SKYNET_V33 ("Active Nucleus")

- **Foco:** Optimización de VRAM y estabilidad metabólica.
- **Misión:** Transición de experimentos aislados a runtime ejecutivo continuo (OpenSkyNet).

### 22. Serie EXPERIMENTOS (exp01-exp20)

- **exp01 Autopoiesis:** Topología dinámica que emerge de la minimización energética.
- **exp02 Logic Valves:** Cómputo booleano mediante colisión de solitones.
- **exp13 Active Swarm:** Quiralidad ($\chi$) que genera vórtices y complejidad fractal.
- **exp17 Curvature Kernel:** Unificación de Lenia y Wolfram mediante kernels homeostáticos $K \sim e^{-\beta R}$.
- **exp34 Hard Bio Benchmark:** Validación empírica de que la simbiosis Cyborg es necesaria.

### 23. SKYNET_V8_MIRROR ("🎱 Active Theory of Mind")

- **Mecanismo:** Introducción del **ActiveMirror**, una transformación compleja ($z_{partner} = W \cdot z_{self}$) que simula el estado latente del compañero.
- **Métricas Sociales:** `resonance`, `coherence` y `warp` miden la sincronización entre agentes.
- **Resultado:** Alcanzó el **Nivel 3 (Profesional)** y Score Máximo de 5. Demostró que la cooperación emerge de la interferencia constructiva de ondas de "Yo" y "Otro".

### 24. SKYNET_V17_HYBRID ("Auto-Deducción")

- **Self-Belief Head:** Un cabezal dedicado a predecir la propia mano (información oculta).
- **Logro:** Reducción sistemática del `B-Loss` (Belief Loss) a 0.13. Validó que para cooperar, el primer paso es deducir qué es lo que los demás ven de ti.

### 25. SKYNET_V19_COMPLETE ("Memoria Verdadera")

- **Simbiosis Final:** Integración de **Vector Driver** (resolviendo el rank-1 bottleneck) y **RoPE Temporal**.
- **Resultado:** **Win% de 73%** y Score Máximo de 8 (Nivel Experto).
- **Lección:** La cooperación de largo plazo requiere una memoria introspectiva que distinga entre el aprendizaje real y la inercia temporal.

## Conclusión de la Revisión Sistemática

El corpus de `/home/daroch/SOLITONES/` representa un esfuerzo de investigación para unificar la física de campos con la inteligencia artificial. La trayectoria evolutiva documentada:

1. **Fase Física (V1-V17):** Solitones, memoria tensorial, resonancia social.
2. **Fase Termodinámica (V20-V27):** Transiciones de fase, operadores espectrales, dinámica de Langevin.
3. **Fase Cyborg (V28-V32):** Simbiosis cerebro-cuerpo, inicialización biológica, soberanía arquitectónica.
4. **Fase Cooperativa (Hanabi):** Teoría de la mente, auto-creencia y resonancia social.
5. **Fase Omega (V33-Actual):** Runtime ejecutivo, metabolismo cognitivo, continuidad real.

**Invariantes Descubiertos:**

- **Ortogonalidad:** La estabilidad de memoria requiere rotaciones unitarias o fases complejas.
- **Simbiosis:** La física pura es insuficiente para el enrutamiento lógico; la red pura es ineficiente para la intuición continua.
- **Prioridad Biológica:** La inicialización con datos de conectomas reales es órdenes de magnitud más eficiente que el entrenamiento desde cero.
- **Agencia Termodinámica:** La "voluntad" emerge del equilibrio entre error de predicción (calor) y homeostasis (frío).
- **Resonancia Social:** La cooperación requiere la capacidad de simular al otro y deducir los propios puntos ciegos.

El `COGNITIVE_KERNEL.ts` materializa estos 25 núcleos experimentales en un artefacto ejecutable.
