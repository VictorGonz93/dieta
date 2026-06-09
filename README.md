## Licencia & Créditos

**IMPORTANTE:** Desarrollada con IA (Claude) para uso personal y experimental. Sin garantía de soporte oficial. Privacidad 100% garantizada.

---

# Apex Nutrition

**Rastreo nutricional profesional · 100% local · Sin servidores**

<div align="center">

Aplicación web avanzada de código abierto para seguimiento nutricional con análisis predictivo, visualización interactiva y gestión offline completa.

| 5 Gráficos | PWA Offline | Privacidad Total |
|---|---|---|
| Interactivos | Sin internet | 100% local |

</div>

---

## Las 7 Pestañas

### Hoy — Registro Diario
Tu centro de control diario para registrar y monitorear todo lo que comes.

- **4 momentos de comida:** Desayuno, Comida, Snack, Cena
- **Cálculo automático** de calorías y macronutrientes en tiempo real
- **Botón para copiar comidas** del día anterior
- **Productos personalizados** — Crea tus propias recetas y productos
- **Edición flexible** — Modifica cantidades en cualquier momento
- **Resumen visual** — Cards con kcal, proteína, carbs y grasas

---

### Objetivos — Tu Meta
Seguimiento visual de tu progreso hacia tu peso objetivo.

- **Barra de progreso dinámica** con porcentaje visual
- **Estimación automática** de días faltantes según tu ritmo actual
- **Configuración personalizada** de macros (proteína, carbs, grasas)
- **Rangos flexibles** para Carbs y Grasas (min/max)
- **Motivación en tiempo real** según tu progreso
- **Histórico de cambios** de tus objetivos

---

### Productos — Base de Datos
Acceso rápido a la información nutricional de miles de alimentos.

- **5000+ alimentos precargados** con datos nutricionales
- **Búsqueda rápida** por nombre o macros
- **Tus propios productos** — Crea y guarda recetas favoritas
- **Favoritos** para acceso instantáneo
- **Filtros avanzados** por categoría, calorías, proteína
- **Import/Export** de tus productos personalizados

---

### Planteamiento — Tu Semana
Planifica tu semana de entrenamientos y ajusta objetivos.

- **Plan semanal visual** con tipo de entrenamiento por día
- **Tipos personalizables:** Fuerza, Cardio, HIIT, Descanso, etc.
- **Objetivos por tipo:** Diferentes metas para días de entreno vs descanso
- **Calorías diferenciadas** según tipo de día
- **Visualización clara** de tu plan semana completa

---

### Gráficos — Análisis Visual
Cinco visualizaciones interactivas con datos profundos.

| Gráfico | Datos | Análisis |
|---------|-------|----------|
| **Progresión de Peso** | Histórico completo | Línea de tendencia + regresión lineal |
| **Tendencia** | Última semana | Proyección de cambio esperado |
| **Calorías Diarias** | Ingesta diaria | Líneas objetivo (entreno/descanso) |
| **Proteína Diaria** | Ingesta diaria | Promedio + objetivo personalizado |
| **Macros Distribuidos** | Proporciones | Doughnut: %, gramos y kcal/día |

**Características:**
- Eje Y dinámico según rango de datos
- Filtro automático de datos aislados (no distorsiona gráficos)
- Tooltip interactivo con detalles
- Exportables como imagen

---

### Estadísticas — Análisis Profundo
Estadísticas completas de todo tu histórico registrado.

- **Promedio semanal** — Calorías, proteína, pérdida de peso
- **Mejor día** — El día con mayor ingesta de proteína
- **Estadísticas generales** — Min, máx, desviación estándar
- **Historial completo** — Vista de todos los días registrados
- **Análisis de tendencias** — Cómo evolucionas en el tiempo

---

### Config — Tu Perfil
Personalización completa de la app y gestión de datos.

**Datos Personales:**
- Edad, sexo, altura, peso actual, peso objetivo
- Actividad física promedio

**Configuración:**
- Macros personalizados por defecto
- Calorías objetivo
- Preferencias de visualización

**Datos:**
- **Export JSON** — Descarga todo (config, historia, predicciones)
- **Export CSV** — Formato Excel para análisis avanzado
- **Import** — Restaura tu backup en cualquier dispositivo
- **Dark Mode** — Activado por defecto (navy/esmeralda)

---

## Características Especiales

### Predicción de Peso Avanzada
Algoritmo inteligente que considera múltiples factores:
- Retención de agua según ciclo
- Cambio real de grasa corporal
- Variabilidad e inflamación
- Proyección visual vs peso real

### Actualizaciones Automáticas
Modal inteligente que:
- Detecta nuevas versiones automáticamente
- Avisa sin interrumpir tu flujo
- Actualiza sin perder ningún dato
- Mantiene sincronización offline

### 100% Offline
Funciona completamente sin internet:
- Service Worker gestiona caché
- Todos los datos en tu dispositivo
- Cero transmisión a servidores
- Privacidad total garantizada

### Instalable en Móvil
Funciona como app nativa en tu teléfono:
- **iOS:** Safari → Compartir → Agregar a pantalla de inicio
- **Android:** Chrome → Menú → Instalar app
- **Acceso rápido** desde pantalla de inicio
- **Sincronización automática** entre dispositivos

---

## Stack Tecnológico

```
Frontend
   • Vanilla JavaScript ES6+ (módulos ES, sin frameworks)
   • Tailwind CSS 3 (CDN)
   • Material Icons (Google Fonts)

Visualización
   • Chart.js 3.9.1 (interactivo, responsive)

PWA & Storage
   • Service Worker (offline-first, cache-first)
   • localStorage (100% local, no servidores)
   • Manifest.json (instalable)

Algoritmos
   • Regresión lineal (tendencia de peso)
   • Predicción de peso (factores múltiples)
   • Análisis estadístico (promedio, máx, mín)
```

---

## Diseño Visual

<div align="center">

| Elemento | Color | Código |
|----------|-------|--------|
| **Fondo Base** | Navy oscuro | `#06090F` |
| **Tarjetas** | Navy medio-claro | `#0B1220` → `#101928` |
| **Primario (Acento)** | Esmeralda | `#10B981` |
| **Secundarios** | Azul · Ámbar · Púrpura | `#60A5FA` · `#FBBF24` · `#A78BFA` |
| **Tipografía** | Inter + Plus Jakarta Sans | Material Icons |

</div>

---

## Instalación & Acceso

### Versión Online
```
https://victorgonz93.github.io/dieta
```

### Versión Local
```bash
git clone https://github.com/VictorGonz93/dieta.git
cd dieta

# Opción 1: Abrir directamente
# Double-click en index.html

# Opción 2: Servidor local
python -m http.server 8000
# Luego: http://localhost:8000
```

---

## Ejemplos de Uso

### Seguimiento Semanal
```
Lunes   → 1800 kcal | 155g proteína | Entreno Fuerza
Martes  → 1750 kcal | 148g proteína | Cardio
...
Domingo → Promedio: 1770 kcal | 151g proteína | -0.4kg esta semana
```

### Predicción de Peso
```
Peso actual:  73.2 kg
Tendencia:    -0.35 kg/semana
Predicción:   72.3 kg en 2 semanas
Confianza:    Alta (basada en 6+ datos)
```

### Backup & Restauración
```
1. Config → Export JSON
   ↓ Se descarga: nutrition_backup_20250526.json

2. En otro dispositivo → Config → Import
   ↓ Selecciona el archivo descargado

3. ¡Listo! Todos tus datos restaurados
```

---

## Actualización de Caché

**Automática:** La app detecta nuevas versiones y muestra modal con **Actualizar**.

**Manual (si es necesario):**
- **Windows/Linux:** `Ctrl+Shift+R`
- **Mac:** `Cmd+Shift+R`
- **Móvil:** Cierra completamente y reabre el navegador

---

## Estructura de Datos

### localStorage Keys
```javascript
{
  nutrition_config:     // Config personal
  nutrition_days:       // Días con comidas (JSON)
  weight_history:       // Histórico de pesos
  custom_products:      // Productos personalizados
  meal_history:         // Últimas 50 comidas
  darkModeEnabled:      // Preferencia de tema
}
```

### JSON Exportado Completo
```json
{
  "version": "1.0",
  "exportDate": "2026-05-26T...",
  "config": {
    "name": "...",
    "age": 28,
    "sex": "M",
    "height": 175,
    "weight": 73.2,
    "weightObjective": 72,
    "macros": { "protein": 160, "carbs": 200, "fats": 60 }
  },
  "days": { /* todos los días registrados */ },
  "customProducts": [ /* tus productos */ ],
  "statistics": { /* análisis históricos */ },
  "weightPrediction": { /* predicción futura */ }
}
```

---

## Privacidad & Seguridad

**100% Local** — Todos los datos en tu dispositivo  
**Cero Servidores** — No hay transmisión de datos  
**Sin Tracking** — Privacidad garantizada  
**Backup Manual** — Controlas cuándo descargar  
**Open Source** — Código transparente en GitHub  

---

## Atajos de Teclado

| Tecla | Acción |
|-------|--------|
| `ESC` | Cerrar modal |
| `Enter` | Guardar/Enviar |
| `Tab` | Navegar entre campos |

---

## Compatibilidad

| Navegador | Desktop | Mobile | PWA |
|-----------|---------|--------|-----|
| **Chrome** | Sí | Sí | Sí |
| **Firefox** | Sí | Sí | Sí |
| **Safari** | Sí | Sí | Sí |
| **Edge** | Sí | Sí | Sí |

---

**Apex Nutrition** — Rastreo nutricional profesional sin complicaciones.
