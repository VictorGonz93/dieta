# Tests

## Suite de regresión

```bash
npm test
```

Ejecuta en procesos independientes, contra datos sintéticos y sin tocar datos reales:

- `audit-tdee-p0.mjs`: cobertura/calidad del adaptativo, confianza, hold de transición, `phaseHistory`, macros y suelo calórico.
- `audit-tdee-p1.mjs`: estimador Theil-Sen/MAD, aislamiento por fase, macros, suelo y ETA de mantenimiento.
- `audit-tdee-ui.mjs`: render de “Tus Objetivos” con DOM falso (badges, avisos, hold y ETA).
- `audit-tdee-p2.mjs`: predicción de peso robusta y eje temporal real en los gráficos (Chart.js simulado).
- `audit-tdee-p3.mjs`: progreso de peso por fase (definición, mantenimiento y volumen): etiquetas, ETA, tarjeta semanal, meta inválida y predicción de mañana.

## Diagnóstico

```bash
npm run diagnose
```

Imprime los escenarios A–J y los bucles cerrados de mantenimiento/volumen. No es una suite de pass/fail: sirve para revisar la forma de la curva y comparar cambios de fórmula.

## Validación real pendiente

La suite sintética no sustituye un backtest temporal. Para validarlo hacen falta 8–12 semanas de:

- peso diario (o casi diario),
- comidas completas y creíbles,
- cambios de fase registrados,
- rutina de entrenamiento y actividad.

`test_backup.json` en la raíz no alcanza ese mínimo (3 pesajes y 0 días de comidas), así que la validación con datos reales sigue pendiente.
