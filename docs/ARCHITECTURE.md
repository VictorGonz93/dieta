# 📐 Arquitectura del Proyecto - Nutrition Tracker

> **Estado Actual**: ✅ Producción - Monolítico optimizado (2838 líneas, 103 funciones)

## 📋 Descripción General

**Nutrition Tracker Pro** es una aplicación web de una sola página (SPA) completamente funcional desarrollada en **Vanilla JavaScript** sin build process, empaquetador o dependencias externas (excepto CDNs).

### Características Técnicas
- **Single File Architecture**: Toda la lógica en `app.js` (2838 líneas)
- **No Build Process**: Archivos servidos directamente
- **100% Vanilla**: Sin frameworks (React, Vue, etc.)
- **PWA Completa**: Service Worker + Manifest
- **Offline-First**: Funciona sin internet
- **localStorage**: Persistencia de datos en cliente
- **Responsive**: Mobile-first design

## 🏗️ Estructura de Directorios

```
/dieta/
├── index.html                 # Punto de entrada principal (PWA)
├── manifest.json              # Configuración PWA (requerido en raíz)
├── sw.js                       # Service Worker (requerido en raíz)
├── .nojekyll                  # Marker para GitHub Pages
├── .gitignore                 # Configuración Git
├── README.md                  # Documentación principal
│
├── js/
│   └── app.js                 # Lógica principal (2838 líneas, 103 funciones)
│
├── css/
│   └── styles.css             # Estilos Tailwind + custom CSS
│
└── docs/
    └── ARCHITECTURE.md        # Este archivo - documentación técnica
```

## 🔌 Rutas Críticas para PWA

### ⚠️ NO MOVER ESTOS ARCHIVOS:
- `manifest.json` - DEBE estar en raíz `/dieta/`
- `sw.js` - DEBE estar en raíz `/dieta/`
- `index.html` - DEBE estar en raíz `/dieta/`

Cambiar estas rutas rompería la instalación de la PWA en dispositivos móviles.

### ✅ SEGURO REORGANIZAR:
- `js/app.js` - Referencias actualizadas en index.html
- `css/styles.css` - Referencias actualizadas en index.html

## 🔄 Flujo de Funcionamiento

### 1️⃣ **Carga Inicial**
```
Usuario accede a https://victorgonz93.github.io/dieta/
    ↓
Se carga index.html (desde raíz)
    ↓
Se carga js/app.js y css/styles.css
    ↓
Se registra Service Worker (sw.js)
```

### 2️⃣ **Service Worker - Estrategia Cache-First**
```
Solicitud HTTP
    ↓
¿Está en cache v10? → SÍ: devolver cache (rápido, offline)
    ↓
NO → Buscar en network
    ↓
¿Network disponible? → SÍ: descargar + cachear
    ↓
NO → Fallback offline
```

## 💾 Gestión de Datos

### LocalStorage (Cliente)
```javascript
{
  nutrition_config: {...},      // Configuración de macros
  nutrition_days: {...},        // Comidas y calorías diarias
  weight_history: [...],        // Historial de pesos
  custom_products: [...],       // Productos personalizados
  meal_history: [...],          // Historial de comidas
  darkModeEnabled: boolean      // Preferencia tema
}
```

### Export/Import JSON
- `exportData()` - Exporta TODO: config + días + productos + estadísticas
- `importData()` - Restaura desde backup JSON

## � Estructura Interna de app.js

El archivo `app.js` (2838 líneas) está organizado en **secciones funcionales**:

```javascript
// 1. Service Worker Registration (líneas 1-11)
//    Registra el SW para offline support

// 2. Accordion Functions (líneas 14-37)
//    toggleAccordion() - Abre/cierra secciones

// 3. Onboarding System (líneas 40-185)
//    Bienvenida para nuevos usuarios
//    Validación de configuración inicial

// 4. Products Database (líneas 188-311)
//    PRODUCTS_DB[] - 14 productos precarados
//    Funciones de productos personalizados

// 5. Meal History (líneas 316-383)
//    loadMealHistory(), saveMealHistory()
//    Historial de comidas frecuentes

// 6. Weight Prediction (líneas 400-735)
//    calculateNextDayPredictionForDate()
//    Predicción avanzada con retención de agua
//    displayNextDayPrediction() - UI de predicción

// 7. Configuration & Calculations (líneas 771-919)
//    calculateTMR(), calculateTDEE()
//    getDayType(), getTrainingTime()
//    calculateWaterRetentionWithTiming()

// 8. UI & Navigation (líneas 941-1233)
//    setupTabNavigation(), showTab()
//    updateHeaderInfo(), loadDarkMode()
//    toggleDarkMode()

// 9. Day Rendering (líneas 1250-1507)
//    renderDay(), renderMealSection()
//    updateDaySummary(), getMacroSuggestions()

// 10. Statistics & Charts (líneas 1483-2346)
//     calculateWeeklyStats(), getWeeklyProgress()
//     displayWeeklyStats(), displayWeeklyProgress()
//     initWeightChart(), initCaloriesChart(), etc.

// 11. Modal & Product Selection (líneas 1985-2131)
//     openModal(), closeModal()
//     selectProduct(), addFood()

// 12. Data Management (líneas 2565-2803)
//     loadAllDays(), saveDays()
//     exportData(), exportCSV(), importData()
//     clearAllData()
```

**Total: 103 funciones distribuidas en 2838 líneas**

## �🔐 Seguridad & Privacidad

- ✅ **100% Cliente-side**: Sin servidores, sin API calls
- ✅ **Sin Datos en Cloud**: Todo en localStorage del navegador
- ✅ **Backup Local**: JSON export/import controlado por usuario
- ✅ **Offline First**: Funciona sin internet después del primera carga

## 🚀 Caché Busting

### Version Parameter en HTML
```html
<link rel="stylesheet" href="css/styles.css?v=20250519-6">
<script src="js/app.js?v=20250519-12"></script>
```

### Incrementar Versión Cuando:
1. Cambios en `js/app.js` → incrementar número de app.js
2. Cambios en `css/styles.css` → incrementar número de css
3. Cambios en `sw.js` → incrementar `CACHE_VERSION`

**Ejemplo:**
```javascript
// En sw.js
const CACHE_VERSION = 12;  // ← Incrementa aquí
```

```html
<!-- En index.html -->
<script src="js/app.js?v=20250520-3"></script>  <!-- ← Y/o aquí -->
```

## 📱 PWA Manifest

El archivo `manifest.json` define:
- `start_url: "/dieta/"` - Punto de partida en instalación
- `scope: "/dieta/"` - Contexto de la app
- `display: "standalone"` - Parece app nativa (sin barra del navegador)
- `icons: [...]` - SVG data URIs (no requiere archivos externos)

## ️ Stack Técnico

| Capa | Tecnología |
|------|-----------|
| **UI** | HTML5 + Tailwind CSS 3 |
| **Lógica** | Vanilla JavaScript ES6+ |
| **Gráficos** | Chart.js 3.9.1 |
| **Iconos** | Material Icons (Google Fonts) |
| **Tipografía** | Inter + Poppins (Google Fonts) |
| **Storage** | LocalStorage API |
| **Offline** | Service Worker API |
| **Deploy** | GitHub Pages |

## ⚡ Performance

- ✅ **Sin Build Process**: Archivos servidos como-están
- ✅ **Lazy Loading**: Datos cargados bajo demanda
- ✅ **Caché Agresivo**: Service Worker cache-first
- ✅ **CDN Externo**: Tailwind y Chart.js desde CDN

## 📊 Estadísticas de Código

- `app.js`: 2838 líneas con 103 funciones
- `styles.css`: Tailwind CSS 3 + custom utilities
- `index.html`: ~920 líneas de markup + scripts inline
- **Total funciones**: 103
- **Sin dependencias externas**: Vanilla JS

## 🔍 Debugging

### En Navegador (DevTools)
```javascript
// Ver datos locales
console.log(JSON.parse(localStorage.getItem('nutrition_days')))

// Ver versión de cache
navigator.serviceWorker.controller?.postMessage({type: 'CHECK_UPDATE'})

// Desregistrar Service Worker
navigator.serviceWorker.getRegistrations().then(reg => 
  reg.forEach(r => r.unregister())
)
```

### Cache Storage (DevTools → Application → Cache Storage)
- `nutrition-tracker-v10` - Versión actual en caché
- Contiene: index.html, app.js, styles.css, manifest.json + CDNs

## 🎯 Decisiones Arquitectónicas

### ¿Por qué Monolítico?
1. **Simplicidad**: Un solo archivo fácil de entender y mantener
2. **Sin Dependencies**: No depende de build tools, bundlers, ni npm
3. **PWA Rápido**: Service Worker cachea un único archivo
4. **Deploy Trivial**: Solo 8 archivos en total (HTML, JS, CSS, manifest, SW)
5. **Offline Ready**: Todo lo necesario se cachea al primer acceso

### Ventajas del Diseño
✅ **No hay breaking changes** por actualizaciones de librerías  
✅ **No hay vulnerabilidades** en node_modules  
✅ **No hay build process** que falle  
✅ **No hay tree-shaking** complicado  
✅ **Code es visible** y auditable  

### Limitaciones Aceptadas
⚠️ Archivo grande (2838 líneas) - Mitigado con comentarios organizados  
⚠️ Recarga completa en cambios - Aceptable (aplicación estable)  
⚠️ Sin hot reloading - Aceptable (desarrollo raro)

### Por qué NO se refactorizó a módulos
Durante desarrollo se intentó modularizar en `/js/modules/*`:
- `storage.js`, `config.js`, `weight.js`, `meals.js`, `statistics.js`, `ui.js`, `utils.js`

**Resultado**: Incompleto (solo 32% de funciones) + mayor complejidad  
**Decisión**: Restaurar monolito completo → **100% funcional**

---

## 🚀 Deployment

1. **Cambios locales** → git add/commit
2. **Push a main** → `git push`
3. **GitHub Pages actualiza** → Automático en segundos
4. **Usuarios ven cambios** → Próxima visita (con cache busting)

---

**Última actualización**: 19/05/2026 v1.0  
**Estado**: ✅ Producción lista - 2838 líneas, 103 funciones, 100% offline-capable
