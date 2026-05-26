# Apex Nutrition

> ⚠️ **IMPORTANTE:** Esta aplicación ha sido desarrollada **para uso personal y pruebas** utilizando **Inteligencia Artificial (Claude)** en todo el proceso de desarrollo. Es un proyecto experimental sin garantía de soporte oficial.

**Una aplicación web avanzada de código abierto para rastreo nutricional personalizado con análisis predictivo, estadísticas detalladas y gestión completa de datos offline.**
- **Registro de comidas** con búsqueda inteligente en base de datos
- **Cálculo automático** de macronutrientes
- **Análisis predictivo** de pérdida de peso
- **Estadísticas avanzadas** con visualización interactiva
- **Gestión de objetivos** personalizados
- **Sincronización offline** con Progressive Web App

Diseñada para maximizar privacidad con almacenamiento 100% local y sin conexión a servidores.

---

## Características Principales

### Registro Diario
- **4 momentos de comida** - Desayuno, Comida, Snack, Cena
- **Búsqueda inteligente** - Base de datos de alimentos con filtros
- **Productos personalizados** - Crea y guarda tus propios productos
- **Cálculo en tiempo real** - Macros calculadas automáticamente
- **Copiar comidas** - Botón para copiar las comidas del día anterior
- **Edición flexible** - Modifica cantidades y comidas fácilmente

### Análisis & Estadísticas
- **Resumen semanal** - Promedio de calorías, proteína y pérdida de peso
- **Estadísticas generales** - Análisis de todos tus datos históricos
- **Mejor día** - Día con mayor ingesta de proteína
- **5 gráficos interactivos** - Peso, Tendencia, Calorías, Proteína, Macros
- **Historial detallado** - Vista completa de todos los días registrados

### Gráficos Mejorados
- **Progresión de peso** - Eje Y dinámico + línea de tendencia por regresión lineal
- **Calorías diarias** - Líneas de referencia para objetivo entreno / descanso
- **Distribución de macros** - Doughnut con % + g/día + kcal/día
- **Peso predicho vs real** - Comparativa histórica
- **Filtro de datos aislados** - Las entradas sin continuidad (ej. peso inicial muy anterior) no distorsionan los gráficos

### Gestión de Objetivos
- **Progreso de peso** - Visualización con barra de progreso
- **Estimación de tiempo** - Cálculo automático según ritmo actual
- **Objetivos nutricionales** - Configuración de macros personalizados
- **Rangos flexibles** - Carbohidratos y grasas con rango min/max

### Predicción Avanzada
- **Predicción de peso** - Algoritmo que estima tu peso futuro
- **Factores considerados** - Retención de agua, cambio de grasa, inflamación
- **Precisión mejorada** - Análisis histórico para mejor estimación
- **Proyección visual** - Gráfico con valores reales vs predichos

### Gestión de Datos
- **Export JSON** - Descarga completa con config + estadísticas + predicciones
- **Export CSV** - Formato tabular para análisis en Excel
- **Import automático** - Restaura todos tus datos desde backup
- **Productos incluidos** - Tus productos personalizados se exportan/importan

### Experiencia de Usuario
- **PWA Offline** - Funciona sin internet (Service Worker)
- **Actualizaciones automáticas** - Modal de aviso cuando hay nueva versión disponible
- **Responsive Design** - Móvil, tablet, desktop
- **Dark Mode** - Tema oscuro navy/esmeralda por defecto
- **Onboarding inteligente** - Modal de bienvenida para nuevos usuarios
- **Plan de entrenamientos** - Configura qué entrenas cada día de la semana

### Privacidad
- **100% Local** - Todos los datos se guardan en tu dispositivo
- **Cero servidores** - No hay transmisión de datos
- **Sin tracking** - Privacidad garantizada
- **Backup manual** - Controlas cuándo descargar tus datos

---

## 🚀 Instalación & Acceso

### Acceso Online (GitHub Pages)
```
https://victorgonz93.github.io/dieta
```

### Instalación en Móvil

**iOS (Safari):**
1. Abre la app en Safari
2. Toca el icono de compartir ⬆️
3. Selecciona "Agregar a pantalla de inicio"
4. La app se instalará como nativa

**Android (Chrome):**
1. Abre la app en Chrome
2. Toca el menú ⋮ (tres puntos)
3. Selecciona "Instalar app"
4. La app se instalará en tu pantalla de inicio

### Instalación Local
```bash
git clone https://github.com/VictorGonz93/dieta.git
cd dieta
# Abre index.html en tu navegador
# O ejecuta un servidor local:
python -m http.server 8000
# Luego accede a: http://localhost:8000
```

---

## Interfaz - 7 Tabs Principales

| Tab | Descripción |
|-----|-------------|
| **Hoy** | Registro diario de comidas + resumen en tiempo real |
| **Objetivos** | Progreso de peso, metas nutricionales, histórico |
| **Productos** | Base de datos de alimentos con búsqueda + productos personalizados |
| **Planteamiento** | Plan semanal de entrenamientos (tipo por día) |
| **Gráficos** | 5 visualizaciones interactivas (peso, tendencia, calorías, proteína, macros) |
| **Estadísticas** | Análisis semanales, promedio general, mejor día + historial |
| **Config** | Datos personales, objetivos, export/import |

---

## Stack Tecnológico

```
Frontend:
  • Vanilla JavaScript ES6+ (módulos ES)
  • Tailwind CSS 3 (CDN)
  • Material Icons (Google Fonts)

Visualización:
  • Chart.js 3.9.1 (gráficos interactivos)

PWA & Storage:
  • Service Worker (offline-first, cache-first)
  • localStorage API
  • Manifest.json

Algoritmos:
  • Predicción de peso (retención de agua + grasa corporal)
  • Regresión lineal (tendencia de peso)
  • Cálculo de macros (automatizado)
  • Análisis estadístico (promedio, máximo, mínimo)
```

---

## Estructura de Datos

### localStorage Keys
```javascript
{
  nutrition_config:    // Configuración personal
  nutrition_days:      // Días con comidas
  weight_history:      // Histórico de pesos
  custom_products:     // Productos personalizados
  meal_history:        // Historial de comidas (últimas 50)
  darkModeEnabled:     // Preferencia de tema
}
```

### Estructura JSON Exportado
```json
{
  "version": "1.0",
  "exportDate": "2026-05-19T...",
  "config": { /* configuración personal */ },
  "days": { /* todos los días con comidas */ },
  "customProducts": { /* productos personalizados */ },
  "mealHistory": [ /* comidas recientes */ ],
  "dailySummary": { /* resumen por día */ },
  "statistics": { /* estadísticas generales */ },
  "weightPrediction": { /* predicción de peso */ },
  "darkModeEnabled": true
}
```

---

## Diseño & UX

- **Tema:** Dark navy + esmeralda (`#06090F` base, `#10B981` primario)
- **Colores:** Sistema de variables CSS custom (bg-base, bg-surface, bg-card, primary, etc.)
- **Tipografía:** Inter (cuerpo) + Plus Jakarta Sans (headings)
- **Iconografía:** Material Icons de Google (sin emojis)
- **Responsive:** Mobile-first, breakpoints en sm (640px) y md (768px)

---

## 📊 Ejemplos de Uso

### Caso 1: Seguimiento Semanal
```
Lunes:  1800 kcal | 155g proteína → Gráfico actualizado
Martes: 1750 kcal | 148g proteína → Resumen recalculado
...
Domingo: Promedio semanal = 1770 kcal | 151g proteína
```

### Caso 2: Predicción de Peso
```
Peso actual: 73.2 kg
Tendencia: -0.35 kg/semana
Predicción: 72.3 kg en 2 semanas
Confianza: Alta (6+ datos)
```

### Caso 3: Backup & Restauración
```
1. Abre Configuración → Export JSON
2. Se descarga: nutrition_backup_20250519.json
3. En otro dispositivo: Import → Selecciona el archivo
4. ¡Todos tus datos restaurados!
```

---

## Actualización de Caché

La app detecta automáticamente nuevas versiones y muestra un modal de aviso con botón **Actualizar**. Al pulsarlo:
1. Se limpian los cachés del Service Worker
2. La página se recarga con los archivos más recientes
3. Tus datos no se ven afectados

Si necesitas forzar la actualización manualmente:
- **Windows/Linux:** Ctrl+Shift+R
- **Mac:** Cmd+Shift+R
- **Móvil:** Cierra completamente el navegador y reabre

Usamos cache busting con versiones (CSS v20250519-4, JS v20250519-10) para forzar actualizaciones.

---

## ⌨️ Atajos de Teclado

| Tecla | Acción |
|-------|--------|
| `ESC` | Cerrar modal |
| `Tab` | Navegar entre campos |
| `Enter` | Guardar/Enviar |

---

## 🌍 Compatibilidad de Navegadores

| Navegador | Desktop | Móvil | PWA |
|-----------|---------|-------|-----|
| Chrome | ✅ Completo | ✅ Completo | ✅ Sí |
| Firefox | ✅ Completo | ✅ Completo | ✅ Sí |
| Safari | ✅ Completo | ✅ Completo | ✅ Sí |
| Edge | ✅ Completo | ✅ Completo | ✅ Sí |

---

## 📋 Requisitos del Sistema

- **Navegador moderno** (ES6+ compatible)
- **JavaScript habilitado**
- **5-10 MB de almacenamiento** (para 1 año de datos)
- **Conexión internet** (solo para primera carga, luego offline)

---

## 🐛 Troubleshooting

### "No veo los cambios en móvil"
→ Hacer reload completo: `Ctrl+Shift+R` o `Cmd+Shift+R`

### "Se perdieron mis datos"
→ Restaurar desde backup JSON: Configuración → Import

### "Los gráficos no cargan"
→ Verificar localStorage en DevTools: F12 → Storage → localStorage

### "¿Funciona sin internet?"
→ Sí, pero necesitas internet la primera vez para descargar archivos

---

## 📈 Hoja de Ruta (Futuro)

- [ ] Sincronización en la nube (opcional)
- [ ] Exportación a Google Sheets
- [ ] Notificaciones push
- [ ] Integración con Apple Health / Google Fit
- [ ] Modo compartido (familia)
- [ ] Análisis avanzado con ML

---

## 📝 Licencia

**MIT License** - Uso libre para proyectos personales

```
Copyright (c) 2026 - Nutrition Tracker Pro
Disponible bajo licencia MIT
```

---

## 🙏 Créditos

- **Desarrollo:** Creado con asistencia de IA (Claude)
- **UI/UX:** Tailwind CSS + Material Design
- **Gráficos:** Chart.js
- **Iconos:** Google Material Icons
- **Hosting:** GitHub Pages

---

## 💬 Contacto & Soporte

Este es un proyecto personal. Para sugerencias o problemas:
- 📌 Abre un issue en GitHub
- 🔀 Crea un pull request con mejoras
- 📧 Contacto personal

---

## 🎉 Estado del Proyecto

| Aspecto | Estado |
|--------|--------|
| Funcionalidad Core | ✅ Production Ready |
| Testing | ✅ Probado en múltiples dispositivos |
| Documentación | ✅ Completa |
| Performance | ✅ Optimizado |
| Privacidad | ✅ Garantizada |

**Versión:** 1.0 Profesional  
**Última actualización:** 19 de Mayo 2026  
**Estado:** ✅ Activo y mantenido

---

**Hecho con ❤️ para rastrear tu nutrición sin comprometer tu privacidad**

