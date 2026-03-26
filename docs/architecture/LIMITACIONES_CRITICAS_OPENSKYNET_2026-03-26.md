# Limitaciones Criticas de OpenSkyNet y del Proyecto Interno

**Fecha:** 2026-03-26

Este documento fija el punto donde termina la fase de limpieza/consolidacion y empieza el trabajo serio.

No enumera "bugs". Enumera los limites estructurales que hoy impiden que OpenSkyNet y su proyecto interno autónomo den un salto cualitativo.

## 1. Veredicto General

OpenSkyNet ya tiene:

- memoria viva estructurada
- continuidad parcial
- agenda experimental
- artefactos ejecutables
- observabilidad razonable

Pero todavia no tiene:

- soberania de decision cerrada
- metabolismo cognitivo fuerte
- autonomia cientifica robusta
- aprendizaje mecanistico transferible

La siguiente fase no debe ser "hacer mas piezas".
Debe ser cerrar estos limites o demostrar empiricamente que ciertas lineas no sirven.

## 2. Limites Criticos Reales

### 2.1 El control de alto nivel sigue demasiado cerca del LLM

Aunque el sistema ya tiene `decision-context`, `world-model`, `state-authority` y `living-memory`, el LLM sigue participando demasiado arriba en la cadena de eleccion.

Consecuencia:

- el sistema aun interpreta demasiado
- gobierna poco desde estructuras frias
- mezcla observacion, seleccion y expansion semantica en una misma capa

Lo que falta:

- separar mejor loop frio y loop caliente
- usar el LLM por umbral y no por costumbre
- bajar la latencia epistemica entre hecho estructurado y accion

### 2.2 No existe una sola ley de estado

La memoria mejoro mucho, pero la soberania de estado no esta totalmente cerrada.

Hoy la conducta todavia emerge desde varias capas:

- sesiones del gateway
- `living-memory`
- `world-model`
- `session-context`
- stores `skynet-*`
- algunos artefactos humanos derivados

Eso ya no es caos, pero tampoco es una autoridad unica.

Consecuencia:

- el sistema puede volver a arrastrar metadata o contexto lateral
- el debugging sigue siendo mas caro de lo que deberia
- los resets siguen siendo correctos, pero no todavia triviales en todo el stack

Avance reciente:

- el proyecto interno por defecto (`Skynet`) ya consolidó una autoridad operativa comun en `src/skynet/runtime-authority.ts`
- pulso, autonomia y bifurcacion ya no recalculan compromiso/experimento/memoria cada uno por su cuenta
- esto mejora el spine experimental, aunque `Omega` completo todavia no viva bajo una sola ley de estado

### 2.3 El proyecto interno tiene coordinacion, pero todavia poco metabolismo

El proyecto interno actual (`Skynet`) ya tiene:

- foco
- continuidad
- compromiso
- experimento activo
- pulso

Pero eso todavia es mas parecido a una arquitectura de coordinacion que a una dinamica interna fuerte.

Consecuencia:

- puede sostener una agenda
- pero aun no "necesita" resolver nada con fuerza propia
- le falta costo interno por no converger, estancarse o desperdiciar ciclos

Este es uno de los limites mas importantes si la meta sigue siendo algo mas cercano a un sistema vivo que a un orquestador sofisticado.

### 2.4 El aprendizaje sigue siendo mas local que mecanistico

OpenSkyNet ya aprende restricciones, rutas de recovery y algunas preferencias.

Pero sigue siendo debil en:

- extraer mecanismos generales
- comprimir hallazgos en reglas durables
- transferir un hallazgo entre dominios o escalas
- convertir experimento en ley operativa del sistema

Consecuencia:

- mejora por correcciones y ajustes locales
- pero aun no reestructura su propia inteligencia de forma fuerte

### 2.5 El sistema experimental sigue desparejo

Dentro de `src/skynet` conviven piezas con madurez distinta:

- algunas ya son utiles
- otras son probes o artefactos de validacion parcial
- otras todavia no gobiernan conducta real

Consecuencia:

- el mapa conceptual de `Skynet` todavia puede inflarse mas rapido que su realidad causal
- no todo lo que existe en `src/skynet` debe sobrevivir

### 2.6 La autonomia cientifica aun no cierra el ciclo

El sistema ya puede:

- priorizar agenda
- registrar continuidad
- materializar artefactos
- medir algunos resultados

Pero todavia no cierra de forma robusta:

1. formular hipotesis fuerte
2. ejecutar experimento
3. evaluar con criterio de descarte
4. integrar el hallazgo en la arquitectura
5. demostrar cambio conductual futuro

Eso significa que hoy `Skynet` todavia es una linea experimental prometedora, no un cientifico autonomo fuerte.

## 3. Lo Que Ya No Debe Volver a Pasar

### 3.1 Memoria historica usada como verdad presente

Eso era uno de los problemas mas peligrosos y ya se corrigio bastante.

La regla correcta ahora es:

- diarios y `.md` humanos = historia y vistas
- `living-memory` y stores estructurados = autoridad presente

No debe volver a gobernar el sistema un snapshot textual viejo.

### 3.2 Contaminacion del `main` por runtime autonomo

Tambien era una falla estructural.

La regla correcta ahora es:

- `main` = conversacion humana principal
- tareas autonomas = aisladas
- `heartbeat` no debe ensuciar `main`

### 3.3 Superficies que aparentan mas de lo que realmente hacen

Otra regla importante:

- un modulo experimental no debe ser tratado como runtime soberano solo porque existe
- la autoridad la define el path real de ejecucion, no el nombre del archivo

## 4. Que Significa Resolver "de Fondo" la Memoria

No significa guardar mas archivos.

Significa estas cuatro propiedades:

1. **Autoridad unica del presente**
   El sistema sabe donde esta su verdad actual.

2. **Historia derivable**
   Su historia puede reconstruirse desde eventos y estado, no desde prosa dispersa.

3. **Reset simple**
   El sistema puede volver a cero sin ambiguedad.

4. **Visibilidad**
   La Web UI y el runtime leen primero la memoria estructurada.

Estado actual:

- `1`: bastante resuelto
- `2`: parcialmente resuelto
- `3`: razonablemente resuelto para `Skynet`
- `4`: parcialmente resuelto

Conclusión:

La memoria quedo mucho mejor resuelta de fondo que antes, pero todavia no completamente cerrada para todo OpenSkyNet.

## 5. Trabajo Serio Que Sigue

La siguiente fase no deberia ser otra lista de fixes chicos.

Deberia concentrarse en uno de estos frentes:

### Frente A: Soberania Arquitectonica

- reducir centros de estado
- bajar dependencia del LLM en la capa alta
- formalizar mejor loop frio/caliente

### Frente B: Metabolismo Cognitivo Real

- costo por no converger
- costo por ciclos desperdiciados
- tension interna estable
- prioridad endogena no solo textual

### Frente C: Ciencia Autonoma Medible

- benchmarks propios de autonomia
- criterios de kill reales
- integracion automatica de hallazgos validos
- comparacion entre versiones del nucleo

## 6. Recomendacion

La mejor siguiente fase es combinar:

- **A** para que la arquitectura no siga siendo blanda
- **C** para que no se convierta en otra teoria elegante sin cierre empirico

El frente **B** es probablemente el mas importante a largo plazo, pero conviene atacarlo con metrica dura y no solo con intuicion biologica.

## 7. Conclusion

OpenSkyNet ya no necesita mas identidad narrativa.
Necesita:

- menos autoridad dispersa
- mas mecanismo causal
- mas criterio de descarte
- y un nucleo experimental que no solo organice estudio, sino que cambie realmente su conducta futura

Ese es el umbral entre "agente sofisticado" y "sistema que empieza a parecer otra cosa".
