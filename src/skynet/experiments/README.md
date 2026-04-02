# SKYNET V28: THE PHYSICAL CYBORG

## Vision: Dos Naturalezas, Un Cerebro

Un humano usando una calculadora es poderoso: la biologia detecta patrones, la calculadora computa logica exacta. Pero la interfaz es **lenta** — dedos teclean, ojos leen, cuello de botella fisico entre dos mundos.

**SKYNET V28 elimina ese cuello de botella.**

Es un **Cyborg**: dos naturalezas irreconciliables que cohabitan el mismo cerebro con **comunicacion directa**, sin latencia fisica.

| Componente                                 | Naturaleza            | Bueno en                                  | Malo en                         |
| ------------------------------------------ | --------------------- | ----------------------------------------- | ------------------------------- |
| **BiphasicOrgan** ("El Biologico")         | Fisica continua       | Patrones continuos, adaptacion, intuicion | Logica discreta, memoria exacta |
| **GRU Cortex** ("El Logico")               | Red neuronal discreta | Memoria secuencial, logica, enrutamiento  | Patrones continuos cambiantes   |
| **TemperatureController** ("El Protocolo") | Interfaz aprendida    | Comunicacion directa entre mundos         | —                               |

**T no es un "switch de modo"** dentro de un sustrato unificado. T es el **protocolo de comunicacion** entre dos especies diferentes. Es lo que permite que El Biologico y El Logico se hablen instantaneamente, sin manos ni ojos de por medio.

La fusion `cat[h_ctx, h_phys]` es la **sinapsis directa** entre ambos mundos — cada uno aporta lo suyo, sin traduccion ni cuello de botella.

---

## Arquitectura

```
Input [658] --> InputProj --> LayerNorm --> [128]
                                             |
                              "El Logico" (GRU Cortex) --> h_ctx [128]
                                             |
          ,-- "El Protocolo" T = TempController(h_ctx, h_phys, grad_norm) --,
          |                                                                  |
          |    "El Biologico" (BiphasicOrgan):                              |
          |    h_phys += alpha(T)*R_theta*h  (Memoria RoPE)                 |
          |             + beta*B*x            (Input drive)                  |
          |             + dt*G(h, T)          (Crecimiento bifasico)         |
          |             + dt*D*T*nabla^2*h    (Difusion fluida)              |
          |             - lambda*T*h          (Disipacion)                   |
          |         clamp [0,1] (frontera termodinamica)                     |
          '------------- h_phys [64] ----------------------------------------'
                                             |
                    SINAPSIS DIRECTA: cat[h_ctx, h_phys] --> [192]
                         |                  |
                   MexicanHat Actor    Critic MLP
                      --> logits [20]     --> value [1]
```

### Componentes

| Componente                                 | Rol en el Cyborg        | Funcion                                                   |
| ------------------------------------------ | ----------------------- | --------------------------------------------------------- |
| **GRU Cortex** ("El Logico")               | Cerebro discreto        | Memoria secuencial, enrutamiento, logica temporal         |
| **BiphasicOrgan** ("El Biologico")         | Cuerpo continuo         | Sustrato termodinamico: cristal(memoria) / fluido(patron) |
| **TemperatureController** ("El Protocolo") | Interfaz directa        | Decide que calentar/congelar — comunicacion entre mundos  |
| **BiphasicGrowth**                         | Fisica del Biologico    | G(h,T) = T*Lenia + (1-T)*DoubleWell                       |
| **DiffusionOperator**                      | Fisica del Biologico    | Laplaciano discreto escalado por T                        |
| **RoPE**                                   | Temporal (ambos mundos) | Codificacion temporal modulada por T                      |
| **MexicanHatReadout**                      | Decisor final           | WTA con inhibicion lateral                                |
| **MinEntropyInjection**                    | Seguridad               | Piso de entropia (previene colapso)                       |

### Ecuacion Fundamental (El Biologico)

```
h_{t+1} = alpha(T) * R_theta * h_t       # Memoria temporal (RoPE)
         + beta * B * x                    # Input drive
         + dt * G(h, T)                    # Crecimiento bifasico
         + dt * D * T * nabla^2 h          # Difusion fluida
         - lambda(T) * h                   # Disipacion

T = f(h_cortex, h_physics, grad_norm)      # T APRENDIDO (El Protocolo)
G(h, T) = T * G_lenia(h) + (1-T) * G_doublewell(h)
```

**Interpretacion fisica:**

- `T -> 0` (frio): Double-well domina -> 2 atractores {0,1} -> **CRISTAL = MEMORIA**
- `T -> 1` (caliente): Lenia domina -> 1 atractor -> **FLUIDO = PATRON**
- `T ~ 0.5` (critico): Transicion de fase -> **DECISION (SSB)**

### Parametros

- **Total**: 274,495 entrenables
- **d_model**: 128 (cortex / El Logico)
- **d_state**: 64 (organo bifasico / El Biologico)
- **n_actions**: 20

---

## Interfaz PPO

```python
from SKYNET_V28_PHYSICAL_CYBORG import SKYNET_V28_PHYSICAL_CYBORG

model = SKYNET_V28_PHYSICAL_CYBORG(
    n_input=658, n_actions=20, d_model=128, d_state=64, device='cuda'
)

# Al inicio de cada episodio:
model.reset()

# En cada paso:
output = model(x, grad_norm=grad_norm, training=True)
# output = {
#     'logits': [B, 20],
#     'probs': [B, 20],
#     'value': [B, 1],
#     'entropy': [B, 1],
#     'audit': dict con T_mean, h_bimodal, flux, etc.
# }
```

---

## Filosofia Cyborg

### ¿Por que no un sustrato unificado?

Porque la fisica lo impide. Un mismo canal no puede tener simultaneamente:

- **Memoria perfecta** (estado discreto, estable, inmutable)
- **Procesamiento continuo** (estado fluido, adaptable, cambiante)

Esto no es una limitacion de ingenieria — es una propiedad fundamental. Cristal y fluido son fases termodinamicas incompatibles en el mismo punto del espacio.

### ¿Por que no dos sistemas separados?

Porque la interfaz mata el rendimiento. Un humano con calculadora es poderoso pero **lento**: la informacion viaja por nervios -> musculos -> teclas -> pantalla -> ojos -> nervios. Cada paso introduce latencia, ruido, y cuello de botella.

Los sistemas actuales (LLM + herramientas externas, neuro-simbolicos) sufren el mismo problema: la comunicacion entre modulos es explicita, serializada, lenta.

### La solucion Cyborg: comunicacion directa

En V28, El Logico y El Biologico comparten el mismo forward pass. No hay API, no hay serializacion, no hay cuello de botella:

1. El Logico (GRU) procesa y produce `h_ctx`
2. El Protocolo (T) lee ambos estados y decide como comunicarlos
3. El Biologico (Organ) evoluciona segun la fisica + las instrucciones de T
4. Ambos se fusionan directamente: `cat[h_ctx, h_phys]`

Todo ocurre en **un solo backward pass**. Los gradientes fluyen de la decision final hasta los parametros fisicos del organo. Es simbiosis diferenciable.

### Diferencia con arquitecturas existentes

| Arquitectura           | Tipo                              | Limitacion                                                             |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **Transformers**       | Puramente discreto                | Sin sustrato fisico continuo. Aproximan patrones con atencion discreta |
| **Mamba/SSMs**         | Discreto con inspiracion continua | Estado continuo pero sin transicion de fase real                       |
| **Biomiméticos puros** | Solo fisica                       | Sin enrutamiento logico (Exp26: confirmado que falla)                  |
| **Neuro-simbolicos**   | Dos sistemas separados            | Interfaz lenta entre modulos                                           |
| **V28 Cyborg**         | **Simbiosis directa**             | Dos naturalezas, un cerebro, comunicacion sin latencia                 |

---

## Validacion Empirica

### Exp21-25: El Biologico funciona como cuerpo

Estos experimentos validan que el sustrato bifasico tiene las propiedades fisicas necesarias para servir como "cuerpo" del Cyborg.

| Exp    | Concepto                  | Resultado | Que valida                                   |
| ------ | ------------------------- | --------- | -------------------------------------------- |
| **21** | Coexistencia de Fases     | SUCCESS   | Cristal + Fluido coexisten en UN sustrato    |
| **22** | Cristalizacion = Decision | SUCCESS   | SSB: bimodal 1%->100% al enfriar             |
| **23** | G(rho,T) Bifurcacion      | SUCCESS   | 2 atractores(frio) -> 1(caliente)            |
| **24** | Memoria Selectiva         | SUCCESS   | Region fria preservada 100% al calentar otra |
| **25** | Tarea Cognitiva (FLIP)    | SUCCESS   | 100% storage, 75% prediccion                 |

### Exp26: La biologia SOLA no puede — valida el enfoque Cyborg

La leccion mas importante: la fisica pura NO puede enrutar informacion. No hay forma de que un sustrato termodinamico haga memoria asociativa (key->value) sin conexiones aprendidas. Esto **valida** que necesitamos el Cyborg completo: cerebro neural + cuerpo fisico.

### Exp27-28: El Cyborg completo aprende

| Exp    | Concepto           | Resultado | Que demuestra                                 |
| ------ | ------------------ | --------- | --------------------------------------------- |
| **27** | Core Diferenciable | SUCCESS   | PyTorch, gradientes fluyen, XOR 100%          |
| **28** | Entrenamiento V28  | SUCCESS   | 100% reconocimiento + 100% memoria secuencial |

### Dinamicas de Entrenamiento (Exp28)

| Metrica       | Inicio | Final  | Significado                                       |
| ------------- | ------ | ------ | ------------------------------------------------- |
| **T_mean**    | 0.62   | 0.23   | El Protocolo aprende a cristalizar                |
| **h_bimodal** | 0.00   | 0.18   | El Biologico se vuelve discreto donde lo necesita |
| **Entropy**   | 3.0    | 0.0    | Decisiones confiantes                             |
| **Accuracy**  | random | 100%   | El Cyborg aprende patrones Y memoria              |
| **Loss**      | 2.0    | 0.0001 | Convergencia completa                             |

### Exp34: Benchmark Cyborg — Lecciones de Simbiosis

Exp34 mide lo que importa: la **simbiosis**, no cada parte aislada en tareas equivocadas.

**4 pruebas:**

1. **El Logico Solo** — GRU sin organo en tarea discreta (XOR). Establece baseline.
2. **El Biologico Solo** — Organo sin GRU en tarea continua (deteccion de regimen). Establece baseline.
3. **La Simbiosis** — Tarea que NINGUNO resuelve solo (patron continuo + memoria secuencial).
4. **El Protocolo** — ¿T aprende a enrutar? Participation ratio, distribucion de T.

**Hipotesis central**: Solo el Cyborg completo resuelve la Prueba 3. El Logico solo falla en la parte continua, El Biologico solo falla en la parte secuencial.

### Self-Test (7/7 PASS)

```
Test 1: Forward Pass          -> PASS (shapes, no NaN)
Test 2: Gradient Flow         -> PASS (31/36 non-zero)
Test 3: State Evolution       -> PASS (T y h evolucionan)
Test 4: Reset                 -> PASS (limpia todo)
Test 5: Grad Norm -> T        -> PASS (T_diff = 0.30)
Test 6: Probability Validity  -> PASS (sum=1, all positive)
Test 7: Batch Size 1          -> PASS (inference mode)
```

---

## Estructura del Proyecto

```
V28_PHYSICAL_CYBORG/
|-- README.md                              # Este archivo
|-- SKYNET_V28_PHYSICAL_CYBORG.py          # Modelo principal
|-- experimentos/
|   |-- exp21_phase_coexistence.py/log/png     # Coexistencia cristal+fluido
|   |-- exp22_crystallization_decision.py/...  # SSB = decision
|   |-- exp23_growth_interpolation.py/...      # Bifurcacion G(h,T)
|   |-- exp24_selective_memory.py/...          # Memoria selectiva
|   |-- exp25_biphasic_substrate.py/...        # Tarea cognitiva
|   |-- exp26_reward_temperature.py/...        # Reward-driven T
|   |-- exp27_differentiable_biphasic.py/...   # Core PyTorch
|   |-- exp28_v28_training_validation.py/...   # Validacion de entrenamiento
|   |-- exp34_hard_bio_benchmark.py/...        # Benchmark Cyborg: Simbiosis
|   '-- study_biphasic_foundation.md           # Estudio Completo (Exp21-34)
'-- legacy/
    |-- SKYNET_V28_DIAGNOSTIC.py               # V28 anterior (ARC, Conv2d)
    '-- V28_PHYSICAL_CORE.py                   # Core anterior (ARC)
```

---

## Lecciones Empiricas Criticas

1. **Exp23 - Sigma de Lenia**: sigma >= 0.3 obligatorio. Sigma estrecho (0.08) crea un atractor espurio en 0 que impide la transicion de fase limpia.

2. **Exp25 - Fronteras**: Con N pequeno, los bits adyacentes interfieren. Solucion: margenes entre bits (`margin = chunk // 6`).

3. **Exp26 - La leccion mas importante**: La fisica PURA no puede enrutar informacion. Esto VALIDA el enfoque Cyborg: El Biologico necesita a El Logico, y viceversa. Ninguno es completo solo.

4. **grad_norm como senal de reward**: Necesita un camino directo (`grad_sensitivity` param), no solo ser un input mas del gate. Sin esto, queda enterrado entre 192 inputs.

5. **Exp34 - No testear cada parte en tareas equivocadas**: El Biologico no deberia resolver XOR (tarea discreta). El Logico no deberia detectar regimenes continuos. Medir la simbiosis requiere tareas que necesiten AMBOS.

---

## Modelos Anteriores (Contexto)

| Version     | Arquitectura                      | Resultado Hanabi        |
| ----------- | --------------------------------- | ----------------------- |
| V10 PHOENIX | GRU + Hamiltonian organ           | 54.9% win, 9pts (mejor) |
| V20         | Mamba SSM + MexicanHat + T global | No benchmark            |
| **V28**     | **GRU + BiphasicOrgan + T local** | **Pendiente de PPO**    |

La diferencia clave: V10 usaba un organo Hamiltoniano (conserva energia). V28 usa un organo bifasico (cristal/fluido). V20 tenia T global; V28 tiene T local aprendido.

---

## Proximo Paso

1. **Entrenar con PPO en Hanabi** (benchmark definitivo)
2. **Comparar con V10 PHOENIX** (54.9% win rate a superar)
3. **Topologia Dinamica** (rewiring Wolfram, futuro)

4. **Escalabilidad Funcional (De Agente a Simulador)**
   Aunque ahora lo usas para Hanabi o tareas de logica, la misma matematica sirve para:

Simulacion Medica/Cerebral: Podrías escalar este modelo usando los datasets de MICrONs a gran escala para crear Gemelos Digitales de secciones enteras de corteza cerebral.
Sistemas de Control Industrial: Un sistema que maneja flujo continuo y logica discreta es ideal para controlar plantas quimicas, reactores o redes electricas, donde hay variables fisicas reales (fluido) y decisiones criticas (cristal).

---

## Apéndice Técnico (Referencia)

### Clasificación de Componentes

| Componente                | Tipo          | Funcion                                          |
| ------------------------- | ------------- | ------------------------------------------------ |
| **GRU Cortex**            | Neural        | Procesamiento secuencial rapido, enrutamiento    |
| **BiphasicOrgan**         | Fisico+Neural | Sustrato termodinamico con cristal/fluido        |
| **TemperatureController** | Neural        | Atencion aprendida: decide que calentar/congelar |
| **BiphasicGrowth**        | Fisico        | G(h,T) = T*Lenia + (1-T)*DoubleWell              |
| **DiffusionOperator**     | Fisico        | Laplaciano discreto escalado por T               |
| **RoPE**                  | Neural+Fisico | Codificacion temporal modulada por T             |
| **MexicanHatReadout**     | Neural        | WTA con inhibicion lateral                       |
| **MinEntropyInjection**   | Neural        | Piso de entropia (previene colapso)              |

### Resumen Experimental (Exp21-34)

| Exp    | Concepto                  | Resultado | Leccion Clave                                                                           |
| ------ | ------------------------- | --------- | --------------------------------------------------------------------------------------- |
| **21** | Coexistencia de Fases     | SUCCESS   | Cristal (100% bimodal) + Fluido (std 0.043) en UN sustrato                              |
| **22** | Cristalizacion = Decision | SUCCESS   | SSB: bimodal 1%->100% al enfriar, 53% estocastico, 100% reproducible                    |
| **23** | G(rho,T) Bifurcacion      | SUCCESS   | 2 atractores(frio) -> 1(caliente). Sigma >= 0.3 obligatorio                             |
| **24** | Memoria Selectiva         | SUCCESS   | Region B 100% preservada tras calentar A                                                |
| **25** | Tarea Cognitiva (FLIP)    | SUCCESS   | 100% storage, 75% prediccion                                                            |
| **26** | Reward-Driven T           | SUCCESS   | Calor local = Olvido selectivo. Aprendizaje sin olvidar lo correcto.                    |
| **27** | Core Diferenciable        | SUCCESS   | PyTorch, gradientes fluyen, XOR 100%                                                    |
| **28** | Entrenamiento V28         | SUCCESS   | 100% reconocimiento + 100% memoria secuencial                                           |
| **34** | Benchmark Cyborg          | SUCCESS   | Solo el Cyborg resuelve simbiosis (95%). GRU falla en continuo, Organ falla en memoria. |
