# 📊 Nutrition Tracker Pro

> ⚠️ **IMPORTANTE:** Esta aplicación ha sido desarrollada **para uso personal y pruebas** utilizando **Inteligencia Artificial (Claude)** en todo el proceso de desarrollo. Es un proyecto experimental sin garantía de soporte oficial.

**Una aplicación web avanzada de código abierto para rastreo nutricional personalizado con análisis predictivo, estadísticas detalladas y gestión completa de datos offline.**

---

## 🎯 Descripción General

Nutrition Tracker Pro es una solución integral para monitoreo nutricional diario que combina:
- **Registro de comidas** con búsqueda inteligente en base de datos
- **Cálculo automático** de macronutrientes
- **Análisis predictivo** de pérdida de peso
- **Estadísticas avanzadas** con visualización interactiva
- **Gestión de objetivos** personalizados
- **Sincronización offline** con Progressive Web App

Diseñada para maximizar privacidad con almacenamiento 100% local y sin conexión a servidores.

---

## ✨ Características Principales

### 📋 Registro Diario
- ✅ **4 momentos de comida** - Desayuno, Comida, Snack, Cena
- ✅ **Búsqueda inteligente** - Base de datos de alimentos con filtros
- ✅ **Productos personalizados** - Crea y guarda tus propios productos
- ✅ **Cálculo en tiempo real** - Macros calculadas automáticamente
- ✅ **Edición flexible** - Modifica cantidades y comidas fácilmente

### 📊 Análisis & Estadísticas
- ✅ **Resumen semanal** - Promedio de calorías, proteína y pérdida de peso
- ✅ **Estadísticas generales** - Análisis de todos tus datos históricos
- ✅ **Mejor día** - Día con mayor ingesta de proteína
- ✅ **4 gráficos interactivos** - Peso, Calorías, Proteína, Macros
- ✅ **Historial detallado** - Vista completa de todos los días registrados

### 🎯 Gestión de Objetivos
- ✅ **Progreso de peso** - Visualización con barra de progreso
- ✅ **Estimación de tiempo** - Cálculo automático según ritmo actual
- ✅ **Objetivos nutricionales** - Configuración de macros personalizados
- ✅ **Rangos flexibles** - Carbohidratos y grasas con rango min/max
- ✅ **Motivación dinámica** - Mensajes personalizados según progreso

### 🔮 Predicción Avanzada
- ✅ **Predicción de peso** - Algoritmo que estima tu peso futuro
- ✅ **Factors considerados** - Retención de agua, cambio de grasa, inflamación
- ✅ **Precisión mejorada** - Análisis histórico para mejor estimación
- ✅ **Proyección visual** - Gráfico con valores reales vs predichos

### 💾 Gestión de Datos
- ✅ **Export JSON** - Descarga completa con config + estadísticas + predicciones
- ✅ **Export CSV** - Formato tabular para análisis en Excel
- ✅ **Import automático** - Restaura todos tus datos desde backup
- ✅ **Productos incluidos** - Tus productos personalizados se exportan/importan

### 🌐 Experiencia de Usuario
- ✅ **PWA Offline** - Funciona sin internet (Service Worker)
- ✅ **Responsive Design** - Móvil, tablet, desktop
- ✅ **Dark Mode** - Interfaz oscura por defecto
- ✅ **Onboarding inteligente** - Modal de bienvenida para nuevos usuarios
- ✅ **Instalación nativa** - Agregar a pantalla de inicio (iOS/Android)

### 🔐 Privacidad
- ✅ **100% Local** - Todos los datos se guardan en tu dispositivo
- ✅ **Cero servidores** - No hay transmisión de datos
- ✅ **Sin tracking** - Privacidad garantizada
- ✅ **Backup manual** - Controlas cuándo descargar tus datos

---

## 🚀 Instalación & Acceso

### Acceso Online (GitHub Pages)
```
https://victorgonz93.github.io/dieta/app/
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
cd dieta/app
# Abre index.html en tu navegador
# O ejecuta un servidor local:
python -m http.server 5000
```

---

## 📱 Interfaz - 6 Tabs Principales

| Tab | Icono | Descripción |
|-----|-------|-------------|
| **Hoy** | 🏠 | Registro diario de comidas + resumen en tiempo real |
| **Productos** | 🍽️ | Base de datos de alimentos con búsqueda + productos personalizados |
| **Gráficos** | 📊 | 4 visualizaciones interactivas (peso, calorías, proteína, macros) |
| **Objetivos** | 🎯 | Progreso de peso, metas nutricionales, histórico y motivación |
| **Estadísticas** | 📈 | Análisis semanales, promedio general, mejor día + historial |
| **Configuración** | ⚙️ | Datos personales, objetivos, export/import, dark mode |

---

## 🛠️ Stack Tecnológico

```
Frontend:
  • Vanilla JavaScript ES6+
  • Tailwind CSS 3 (utilidades personalizadas)
  • Material Icons (Google Fonts)

Visualización:
  • Chart.js 3.9.1 (gráficos interactivos)

PWA & Storage:
  • Service Worker (offline-first)
  • localStorage API
  • Manifest.json

Algoritmos:
  • Predicción de peso (regresión lineal + factores)
  • Cálculo de macros (automatizado)
  • Análisis estadístico (promedio, máximo, mínimo)
```

---

## 💾 Estructura de Datos

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

## 🎨 Diseño & UX

- **Tema:** Dark Mode + Gradientes modernos
- **Colores:** Paleta primaria (Morado) + Acentos (Rosa)
- **Tipografía:** Inter (body) + Poppins (headings)
- **Animaciones:** Transiciones suaves con cubic-bezier
- **Iconografía:** Material Icons de Google (24 px)
- **Responsive:** Mobile-first, breakpoints en md (768px)

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

## 🔄 Actualización de Caché

Para obtener la última versión en tu móvil:
1. **Cierra completamente** la app (no solo minimizar)
2. **Recarga con Ctrl+Shift+R** (Windows) o **Cmd+Shift+R** (Mac)
3. **En móvil:** Cierra el navegador completamente y reabre

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

