# Diseño Arquitectónico: De la Drosophila al Hardware de Silicio
## Síntesis, Validación y Directivas de Modelado Matemático

**Ubicación:** `~/openskynet/MODELADO_MATEMATICO_DROSOPHILA.md`
**Propósito:** Este documento sirve como *ground truth* teórico y manifiesto de diseño para los agentes de ingeniería de OpenSkyNet. Contiene la auditoría de la viabilidad biológica-matemática de sistemas dinámicos (vs. Transformers monolíticos) y establece las directivas exactas para modelar los primeros tensores basados en el conectoma de la *Drosophila melanogaster*.

---

## PARTE I: Validación y Auditoría del Marco Teórico

La propuesta de reemplazar la atención auto-regresiva masiva por solucionadores de EDOs (Mamba/LIF) operando sobre una topología de grafo esparza con reglas Hebbianas locales (Nested Learning) es **VERDADERA** en sus fundamentos físicos y biológicos, pero presenta **FRICCIONES DE TRADUCCIÓN** al hardware actual que el agente desarrollador debe resolver.

### 1. La Falacia de la Atención Global y la Topología Esparza
*   **El Acierto:** El cerebro de la mosca desmiente la necesidad matemática de complejidad $\mathcal{O}(N^2)$. Con $\approx 125,000$ neuronas y una densidad sináptica del $0.32\%$, la cognición corporizada opera sobre un grafo dirigido altamente esparzo y fuertemente modularizado.
*   **La Fricción de Hardware (A resolver por el Agente):** El Transformer domina por su "simpatía mecánica" con las GPUs, optimizadas para matrices densas. Una matriz $\mathbf{W}$ con $99.68\%$ de ceros es ineficiente por el *memory bandwidth wall*.
*   **Directiva:** El modelo debe traducirse a **esparcidad estructurada (Block-Sparse o Mixture of Experts)**. Los módulos densos simularán ganglios/lóbulos específicos (e.g., complejo central), conectados por vías ultra-esparzas.

### 2. Isomorfismo LIF vs. SSMs (Mamba) y Dinámicas Continuas
*   **El Acierto:** La analogía entre la ecuación LIF ($\tau_m \frac{dV}{dt} = -V + RI$) y el estado oculto de Mamba ($\dot{x} = Ax + Bu$) es el núcleo de la nueva causalidad computacional.
*   **La Fricción Matemática:** Mamba exige que la evolución de la EDO sea *estrictamente lineal* respecto al estado $x(t)$ para paralelizar el entrenamiento mediante *Parallel Scan*. El modelo biológico (LIF) usa un "Fire" (spike) que es altamente no lineal y resetea el estado.
*   **Directiva:** El agente debe formular una aproximación continua-diferenciable del *spike* biológico que preserve la asociatividad del operador en el tiempo para no perder la capacidad de entrenamiento paralelo.

### 3. La Falacia de BPTT y Nested Learning
*   **El Acierto:** Backpropagation Through Time (BPTT) viola la termodinámica del aprendizaje continuo. Las reglas anidadas (Nested Learning) mediante el lema de Sherman-Morrison ($O(d^2)$) permiten la optimización causal.
*   **La Fricción Empírica:** Las reglas locales puras sufren de mínimos locales miopes si carecen de una señal de optimización sistémica.
*   **Directiva:** Instituir un tensor de **Neuromodulación (análogo a Dopamina/Octopamina)** que no rutee datos, sino que ajuste dinámicamente el hiperparámetro de tasa de aprendizaje ($\eta_t$) a nivel local basado en la recompensa global retardada.

---

## PARTE II: Directivas para el Agente (Modelado del Tensor $\mathbf{W}$)

**A la atención del Agente de Ingeniería / Arquitecto de IA:**
Tu tarea es derivar la topología de matriz dispersa $\mathbf{W}$ (Weight Matrix) basándote en los clústeres funcionales y conectores de neurotransmisores de la Drosophila, y plantear la ecuación de propagación *forward*.

Debes diseñar la arquitectura siguiendo estas estrictas restricciones matemáticas:

### Paso 1: Partición de Signo y Función (El Principio de Dale)
En Deep Learning, los pesos varían de $-\infty$ a $+\infty$. En este modelo, las neuronas (nodos) están tipificadas biológicamente. Debes descomponer la matriz de pesos global $\mathbf{W} \in \mathbb{R}^{N \times N}$ en sub-matrices ortogonales proyectadas por máscaras de adyacencia binarias $\mathbf{M}$:

1.  **Excitación (Glutamato/Colina):** $\mathbf{W}_{exc} = \max(0, \mathbf{W}_{raw}) \odot \mathbf{M}_{exc}$
2.  **Inhibición (GABA):** $\mathbf{W}_{inh} = \min(0, \mathbf{W}_{raw}) \odot \mathbf{M}_{inh}$
3.  **Modulación (Dopamina/Serotonina):** Matriz $\mathbf{H}_{mod}$. No participa en la ecuación de estado $x(t)$, sino que define el campo dinámico de plasticidad:
    $\eta_t^{(i)} = f_{mod}(\sum_j H_{mod, ij} \cdot r_{t-d})$ (Donde $r$ es la señal de recompensa corporizada).

### Paso 2: Topología Block-Sparse (Afinidad de Hardware)
No inicializarás $\mathbf{W}$ como una matriz gigante dispersa al azar. Debes estructurarla por bloques que imiten el conectoma:
*   $B_{vis}$: Lóbulos ópticos (Alta densidad interna, procesamiento paralelo rápido - Sistema 1).
*   $B_{nav}$: Complejo central (Anillo atractor recurrente continuo - Representación de estado).
*   $B_{motor}$: Vías descendentes (Baja latencia, salida de acción).

La matriz global tendrá bloques densos en la diagonal principal y conexiones altamente esparzas (matrices de permutación o de bajo rango) fuera de la diagonal.

### Paso 3: La Ecuación de Propagación Forward (Sin Atención Masiva)
Debes unificar la dinámica del estado (Mamba/SSM) con el ruteo del grafo (Drosophila). Plantearás un sistema iterativo discreto temporal ($t$) para el estado de los nodos $x \in \mathbb{R}^N$:

**Dinámica Discreta Base:**
$$x_t = \bar{A} x_{t-1} + \bar{B} u_t$$

Donde la señal de entrada al nodo ($u_t$) no es externa, sino el disparo ruteado del resto del conectoma en el tiempo anterior:
$$u_t = \sigma_{LIF} \left( \left(\mathbf{W}_{exc} + \mathbf{W}_{inh}\right) x_{t-1} \right)$$
*(Nota para el agente: $\sigma_{LIF}$ debe ser la función de activación no lineal que emula el spike sin romper la diferenciabilidad si se planea usar hardware de tensores estándar).*

### Paso 4: Actualización Anidada (Local Learning sin BPTT)
Plantear la actualización de la matriz $\mathbf{W}$ en $t+1$ usando el postulado de *Nested Learning*, pero modulado por la red dopaminérgica:

$$\mathbf{W}_{t+1} = \left( \nabla_{y_t}\mathcal{L}_{local}(\dots) x_t^\top + \eta_t \mathbf{W}_t \right) \frac{1}{\eta_t} \left( I - \frac{1}{\lambda^2 + \eta_t} x_t x_t^\top \right)$$
*(El agente deberá expandir y pulir esta ecuación para asegurar la estabilidad numérica con el tensor modulador $\eta_t$ variante en el espacio y en el tiempo).*

---

### Entregables Esperados del Agente Asignado:
1.  **Código PyTorch/JAX base:** Un esqueleto que defina las clases de los clústeres funcionales (`VisBlock`, `NavBlock`, `MotorBlock`) usando multiplicaciones Block-Sparse.
2.  **Capa de Integración Temporal:** Un módulo que reemplace `Attention` por una integración de estado `Mamba/LIF` adaptada a la ecuación planteada.
3.  **Optimizador Local:** Una subclase de optimizador (fuera de Autograd global) que aplique el lema de Sherman-Morrison en el pase forward usando la red moduladora como input.
4.  **Estudio de Estabilidad:** Una comprobación del radio espectral (Jacobiano) de la topología cíclica del Complejo Central para asegurar que $\|J\| < 1$.