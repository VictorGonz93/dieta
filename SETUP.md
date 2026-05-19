# 🎉 Web App Creada Exitosamente

## 📁 Estructura del proyecto

```
dieta/
├── 📄 index.html              ← Página de bienvenida (abre esta)
├── app/
│   ├── 📄 index.html          ← Aplicación principal
│   ├── 💻 app.js              ← Lógica de la app
│   ├── 🎨 styles.css          ← Estilos responsive
│   ├── ⚙️ sw.js               ← Service Worker (offline)
│   ├── 📋 manifest.json       ← Configuración PWA
│   └── 📖 README.md           ← Instrucciones detalladas
├── 📋 comidas_diarias.md      ← Tus datos de nutrición (markdown)
├── ℹ️ info.md                 ← Context general
└── 🏋️ gym.md                  ← Rutina de entreno
```

## 🚀 Cómo usar

### 1️⃣ Opción A: Local con Python (Recomendado)
```bash
cd c:\Users\victo\Documents\GitHub\dieta

# En Windows PowerShell:
python -m http.server 8000

# O si usas Python 2:
python -m SimpleHTTPServer 8000
```
Luego abre: http://localhost:8000

### 2️⃣ Opción B: Abrir directamente
Haz doble clic en `index.html` o arrastra a navegador

### 3️⃣ Opción C: Live Server en VS Code
- Instala extensión "Live Server"
- Haz clic derecho en `index.html` → "Open with Live Server"

## ✨ Qué incluye

✅ **Dashboard completo** - Vista de hoy con todas las comidas  
✅ **Cálculo automático** - Macros en tiempo real (kcal, proteína, hidratos, grasas)  
✅ **Base de datos** - 10+ alimentos pre-cargados (leche, huevo, atún, whey, etc.)  
✅ **Añadir alimentos** - Búsqueda rápida + manual  
✅ **Responsive** - Se adapta a móvil, tablet, desktop  
✅ **Offline ready** - Service Worker para funcionar sin internet  
✅ **Localización** - Todos los datos en tu navegador (100% privado)  
✅ **Backup/Restore** - Exporta e importa tus datos (.json)  
✅ **Configuración** - Personaliza pesos, objetivos, macros  

## 📱 Instalarlo en móvil

### iOS (Safari)
1. Abre http://localhost:8000 en Safari
2. Toca compartir (↗️) → "Agregar a pantalla de inicio"
3. Usa desde inicio

### Android (Chrome)
1. Abre http://localhost:8000 en Chrome
2. Menú (⋮) → "Instalar app"
3. Abre desde inicio

## 💾 Tus datos

Todos los datos se guardan en **LocalStorage**:
- 🔐 Privado: solo en tu dispositivo
- ⚡ Rápido: instantáneo
- 💾 Seguro: puedes exportar backup

**Exportar datos:**
- ⚙️ Configuración → 📥 Descargar Datos
- Se guardará en tu carpeta de descargas

**Importar en otro dispositivo:**
- ⚙️ Configuración → 📤 Cargar Datos
- Selecciona el archivo .json descargado

## 🎯 Próximas mejoras

- 📊 Gráficos reales (peso, calorías)
- 📅 Historial completo
- 🔄 Sincronización cloud (opcional)
- 🌙 Modo oscuro
- 🧮 Cálculos avanzados

## 🛠️ Customización

### Agregar más alimentos a la base de datos:
Edita `app/app.js` línea ~16 en `PRODUCTS_DB`:
```javascript
{ id: 99, name: '🍗 Pollo pechuga', portion: '100g', category: 'proteinas', 
  kcal: 165, protein: 31, carbs: 0, fats: 3.6 },
```

### Cambiar colores:
Edita `app/styles.css` línea ~7 (variables CSS):
```css
--primary: #2c3e50;      /* Color principal */
--secondary: #3498db;    /* Color secundario */
```

## 🔗 Integración con tus archivos

La app funciona **independiente** pero puedes mantener sincronizado:
- `comidas_diarias.md` - Sigue siendo tu respaldo markdown
- Los datos en la web app son locales en el navegador
- Puedes exportar la web app como backup

## 📞 Si algo no funciona

1. **Recarga la página** (Ctrl+F5)
2. **Borra caché**: 
   - Dev Tools (F12) → Application → Clear Storage
3. **Intenta en incógnito** (Ctrl+Shift+N)
4. **Otro navegador**: Chrome, Firefox, Edge, Safari

---

## 🎊 ¡Listo para usar!

```
📍 Abre: http://localhost:8000
o
📍 Doble clic en: c:\Users\victo\Documents\GitHub\dieta\index.html
```

**Recuerda:**
- 🏃 Registra tus comidas en tiempo real
- 📊 Ve tus macros actualizarse automáticamente
- 💾 Tus datos están 100% seguros en tu dispositivo
- 📱 Funciona perfectamente en móvil también

¡Que disfrutes del tracker! 💪
