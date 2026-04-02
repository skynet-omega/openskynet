# Omega Lab Scripts

Estos archivos no forman parte del kernel de `OpenSkyNet` ni del runtime soberano de `Omega`.

Se movieron fuera de `src/omega` porque violaban la directiva de ingeniería del proyecto:

- evaluar empíricamente
- mantener falsabilidad
- revisar costo/beneficio
- evitar alta complejidad o superficie de código cuando el beneficio operativo es nulo o no medido

Aquí quedan scripts manuales, pruebas ad hoc o demos históricas que pueden servir como referencia humana, pero no deben contaminar el árbol compilable del kernel.

Si alguno vuelve a demostrar utilidad real:

1. se convierte en experimento falsable con tests
2. se mide sobre datos reales
3. recién entonces se considera reintegrarlo al runtime
