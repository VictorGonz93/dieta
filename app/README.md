# � Nutrition Tracker Pro - Versión 1.0 Profesional

## 🎯 Descripción General

**Nutrition Tracker Pro** es una aplicación web profesional para rastreo nutricional en tiempo real con funcionalidades avanzadas de análisis, gráficos interactivos y gestión de datos completamente offline.

### Características Principales ✨

- ✅ **Rastreo de comidas en tiempo real** - Desayuno, comida, snack, cena
- ✅ **Cálculo automático de macros** - Proteína, carbohidratos, grasas basado en cantidad
- ✅ **4 gráficos interactivos** - Peso, calorías, proteína, distribución de macros
- ✅ **Estadísticas detalladas** - Semanales, generales, mejor día
- ✅ **Base de datos de productos** - 13 alimentos precarados + búsqueda
- ✅ **Configuración personalizable** - Pesos, objetivos, rangos nutricionales
- ✅ **Export/Import** - JSON y CSV para respaldo de datos
- ✅ **Modo Offline** - PWA con Service Worker
- ✅ **Completamente local** - 100% privacidad, sin servidores
- ✅ **Responsive** - Funciona en móvil, tablet, desktop

---

## 📱 Interfaz Profesional

### 5 Tabs Principales

1. **🏠 Hoy** - Registro de comidas del día actual
   - 4 secciones de comidas (desayuno, comida, snack, cena)
   - Resumen en tiempo real
   - Navegación entre días

2. **🍽️ Productos** - Base de datos completa
   - Búsqueda por nombre
   - Filtro por categoría
   - Información nutricional completa

3. **📊 Gráficos** - Visualización de progresión
   - Gráfico de peso (línea)
   - Calorías diarias (barras)
   - Proteína diaria (línea)
   - Distribución de macros (dona)

4. **📈 Estadísticas** - Análisis detallados
   - Estadísticas semanales
   - Promedio general
   - Mejor día
   - Historial de últimos 10 días

5. **⚙️ Config** - 3 sub-pestañas
   - **Personal**: Peso inicial, actual, fecha, objetivo
   - **Objetivos**: Proteína, calorías, rangos
   - **Datos**: Export, import, almacenamiento

---

## 🎨 Diseño Profesional

### Color Scheme
```
Primario: #1a202c (Azul oscuro)
Secundario: #4299e1 (Azul cielo)
Éxito: #48bb78 (Verde)
Advertencia: #ed8936 (Naranja)
Peligro: #f56565 (Rojo)
```

### Responsive
- Desktop: 1200px
- Tablet: 768px
- Móvil: 480px

---

## 📝 Atajos de Teclado

| Tecla | Acción |
|-------|--------|
| `ESC` | Cerrar modal |

---

## 📄 Licencia

Uso personal - Nutrition Tracker Pro v1.0

---

## 🎉 ¡Gracias por usar Nutrition Tracker Pro!

**Última actualización**: 18 mayo 2026 | **Versión**: 1.0 Profesional

## 🚀 Cómo usar

### 📱 En móvil
1. Abre en navegador: `https://[tu-dominio]/app/`
2. Toca el menú (⋮) → "Instalar app"
3. ¡Úsalo como app nativa!

### 💻 En desktop
1. Abre `index.html` en navegador
2. O abre desde terminal: `python -m http.server 8000`
3. Accede a: `http://localhost:8000/app/`

## 📋 Instrucciones rápidas

### 1️⃣ Configuración inicial
- Ve a **⚙️ Configuración**
- Actualiza: peso, fechas, objetivos de macros
- Guarda los cambios

### 2️⃣ Agregar comidas
- Ve a **🏠 Hoy**
- En cada comida, toca **+ Agregar**
- Busca el producto o escribe manualmente
- La app calcula automáticamente

### 3️⃣ Ver productos
- Ve a **🍽️ Productos**
- Busca por nombre o categoría
- Toca para agregar rápidamente

### 4️⃣ Historial
- Ve a **📊 Historial**
- Ve tu progresión de peso y calorías

## 🗂️ Estructura de carpetas

```
app/
├── index.html       # Interfaz principal
├── app.js          # Lógica de la app
├── styles.css      # Estilos responsive
├── sw.js           # Service Worker (offline)
├── manifest.json   # Config PWA
└── README.md       # Este archivo
```

## 💾 Sincronización de datos

Todos tus datos se guardan en **LocalStorage** (navegador):
- Automático: se guardan al agregar cada comida
- Seguro: puedes exportar a `.json` como backup
- Restaurable: importa tus datos en cualquier dispositivo

## 📊 Datos pre-cargados

**Bebidas/Lácteos:**
- 🥛 Leche entera (300ml) = 183 kcal, 9.6g P
- 🍯 Yogur Proteínas+ (100g) = 52 kcal, 10g P
- 🍮 Gelatina Proteínas+ (100g) = 40 kcal, 10g P

**Proteínas:**
- 🥚 Huevo (50g) = 72 kcal, 6.3g P
- ⚪ Clara (30g) = 17 kcal, 3.6g P
- 🐟 Atún (100g) = 98 kcal, 21g P
- 💪 Whey (40g) = 155 kcal, 34.4g P

*Puedes agregar más productos directamente en la app*

## ⚙️ Configuración avanzada

En **⚙️ Configuración** puedes ajustar:
- Peso inicial/actual
- Fecha de inicio del déficit
- Objetivos de proteína diarios
- Calorías para días de entreno vs descanso

## 🔄 Cambiar de dispositivo

1. En dispositivo antiguo: **⚙️ Configuración** → **📥 Descargar Datos**
2. Guarda el archivo `.json` en la nube
3. En dispositivo nuevo: **⚙️ Configuración** → **📤 Cargar Datos**
4. Elige el archivo descargado

## 🛠️ Desarrollo local

```bash
# Opción 1: Con Python
python -m http.server 8000

# Opción 2: Con Node.js (http-server)
npm install -g http-server
http-server

# Opción 3: Con VS Code Live Server
# Extensión: "Live Server" → Click derecho → "Open with Live Server"
```

Accede a `http://localhost:8000/app/`

## 📱 Instalar como PWA

### Chrome/Edge
1. Abre la app
2. Menú (⋮) → "Instalar app"
3. Confirma

### Safari (iOS)
1. Abre la app
2. Comparte → "Agregar a pantalla de inicio"
3. Elige nombre y confirma

### Firefox
1. Abre la app
2. Menú (≡) → "Instalar aplicación"
3. Confirma

## 🐛 Troubleshooting

**❌ "LocalStorage no funciona"**
- Intenta en incógnito/privado
- Borra caché del navegador

**❌ "No se carga offline"**
- Recarga la página una vez online
- El Service Worker necesita registrarse

**❌ "Datos no se sincronizan"**
- Exporta e importa manualmente
- Los datos son locales por seguridad

## 🔐 Privacidad

✅ **Todos tus datos están en TU dispositivo**  
✅ **No se envían a servidores**  
✅ **Puedes eliminar todo cuando quieras**  
✅ **Export/Import es opcional**

## 📈 Próximas características

- 📊 Gráficos reales de peso y calorías
- 📅 Historial completo de días
- 🎯 Alertas de objetivos diarios
- 🔄 Sincronización cloud (opcional)
- 🌙 Modo oscuro
- 🌍 Múltiples idiomas

## 📞 Soporte

Si tienes problemas:
1. Recarga la página (F5)
2. Borra caché/cookies
3. Reintenta en otro navegador
4. Exporta tus datos por seguridad

---

**Hecho con 💪 para tu corte de 2026**  
*Defcit: 615 kcal/día | Objetivo: 70kg*
