# 📐 Arquitectura del Proyecto - Nutrition Tracker

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
│   └── app.js                 # Lógica principal de la aplicación (2600+ líneas)
│
├── css/
│   └── styles.css             # Estilos Tailwind + custom CSS
│
├── cache/
│   └── products_cache.json    # Cache local de productos (datos)
│
├── docs/
│   └── ARCHITECTURE.md        # Este archivo - documentación técnica
│
└── app/
    ├── index.html             # Redirect de compatibilidad hacia raíz
    └── README.md              # Documentación del redirect
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
- `cache/products_cache.json` - Datos locales no linkeados en HTML

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
¿Está en cache v7? → SÍ: devolver cache (rápido, offline)
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

## 🔐 Seguridad & Privacidad

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
const CACHE_VERSION = 7;  // ← Incrementa aquí
```

```html
<!-- En index.html -->
<script src="js/app.js?v=20250519-12"></script>  <!-- ← Y/o aquí -->
```

## 📱 PWA Manifest

El archivo `manifest.json` define:
- `start_url: "/dieta/"` - Punto de partida en instalación
- `scope: "/dieta/"` - Contexto de la app
- `display: "standalone"` - Parece app nativa (sin barra del navegador)
- `icons: [...]` - SVG data URIs (no requiere archivos externos)

## 🔄 Backward Compatibility

El archivo `app/index.html` contiene un redirect por si usuarios visitan:
```
https://victorgonz93.github.io/dieta/app/
    ↓ (redirect)
https://victorgonz93.github.io/dieta/
```

Esto mantiene compatibilidad con links antiguos.

## 🛠️ Stack Técnico

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

- `app.js`: ~2600 líneas de lógica
- `styles.css`: Tailwind + custom utilities
- `index.html`: ~920 líneas de markup + scripts inline

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
- `nutrition-tracker-v7` - Versión actual en caché
- Contiene todos los assets estáticos

## 🚀 Deployment

1. **Cambios locales** → git add/commit
2. **Push a main** → `git push`
3. **GitHub Pages actualiza** → Automático en segundos
4. **Usuarios ven cambios** → Próxima visita (con cache busting)

---

**Última actualización**: 19/05/2026 - Reestructuración profesional del proyecto
