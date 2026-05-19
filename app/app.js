// NUTRITION TRACKER PRO - VERSIÓN MEJORADA
// Sistema profesional con gráficos, estadísticas y funcionalidades avanzadas

// DATOS INICIALES EXPANDIDA
const PRODUCTS_DB = [
    // Bebidas/Lácteos
    { id: 1, name: '🥛 Leche entera', portion: 100, unit: 'ml', category: 'bebidas', kcal: 61, protein: 3.2, carbs: 4.7, fats: 3.6 },
    { id: 3, name: '🍯 Yogur Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 52, protein: 10, carbs: 1, fats: 0.1 },
    { id: 4, name: '🍮 Gelatina Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 40, protein: 10, carbs: 1, fats: 0.1 },
    { id: 5, name: '🍫 Cacao Hacendado', portion: 10, unit: 'g', category: 'bebidas', kcal: 30, protein: 1.5, carbs: 4.5, fats: 0.5 },
    // Proteínas
    { id: 6, name: '🥚 Huevo entero', portion: 50, unit: 'g', category: 'proteinas', kcal: 72, protein: 6.3, carbs: 0.6, fats: 5.1 },
    { id: 7, name: '⚪ Clara de huevo', portion: 30, unit: 'g', category: 'proteinas', kcal: 17, protein: 3.6, carbs: 0.4, fats: 0.1 },
    { id: 8, name: '🐟 Atún en lata (lata 80g)', portion: 80, unit: 'g', category: 'proteinas', kcal: 78, protein: 16.8, carbs: 0.7, fats: 1 },
    { id: 9, name: '💪 Proteína Whey', portion: 40, unit: 'g', category: 'proteinas', kcal: 155, protein: 34.4, carbs: 1.2, fats: 1.5 },
    { id: 10, name: '💊 Creatina monohidrato', portion: 5, unit: 'g', category: 'suplementos', kcal: 0, protein: 0, carbs: 0, fats: 0 },
    // Carbohidratos
    { id: 11, name: '🥔 Patata cocida', portion: 100, unit: 'g', category: 'carbos', kcal: 77, protein: 2, carbs: 17, fats: 0.1 },
    { id: 12, name: '🍌 Plátano', portion: 100, unit: 'g', category: 'carbos', kcal: 89, protein: 1.1, carbs: 23, fats: 0.3 },
    { id: 13, name: '🍚 Arroz blanco cocido', portion: 100, unit: 'g', category: 'carbos', kcal: 130, protein: 2.7, carbs: 28, fats: 0.3 },
    // Platos completos
    { id: 14, name: '🍖 Albóndigas cerdo (5) + patatas', portion: 487, unit: 'g', category: 'platos', kcal: 646, protein: 34, carbs: 54, fats: 33 },
];

// PRODUCTOS PERSONALIZADOS
var customProducts = [];

function loadCustomProducts() {
    const saved = localStorage.getItem('custom_products');
    if (saved) {
        customProducts = JSON.parse(saved);
        // Agregar productos personalizados a la DB
        const maxId = Math.max(...PRODUCTS_DB.map(p => p.id), 100);
        customProducts.forEach((p, index) => {
            if (!p.id) p.id = maxId + index + 1;
            if (!PRODUCTS_DB.find(db => db.id === p.id)) {
                PRODUCTS_DB.push(p);
            }
        });
    }
}

function saveCustomProducts() {
    localStorage.setItem('custom_products', JSON.stringify(customProducts));
}

function addNewProduct() {
    const name = document.getElementById('newProductName').value.trim();
    const category = document.getElementById('newProductCategory').value;
    const kcal = parseFloat(document.getElementById('newProductKcal').value);
    const protein = parseFloat(document.getElementById('newProductProtein').value);
    const carbs = parseFloat(document.getElementById('newProductCarbs').value);
    const fats = parseFloat(document.getElementById('newProductFats').value);
    
    if (!name || isNaN(kcal) || isNaN(protein) || isNaN(carbs) || isNaN(fats)) {
        showNotification('❌ Completa todos los campos', 'error');
        return;
    }
    
    const newProduct = {
        id: Date.now(),
        name: name,
        portion: 100,
        unit: 'g',
        category: category,
        kcal: kcal,
        protein: protein,
        carbs: carbs,
        fats: fats
    };
    
    customProducts.push(newProduct);
    PRODUCTS_DB.push(newProduct);
    saveCustomProducts();
    
    // Limpiar formulario
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductKcal').value = '';
    document.getElementById('newProductProtein').value = '';
    document.getElementById('newProductCarbs').value = '';
    document.getElementById('newProductFats').value = '';
    
    renderCustomProducts();
    renderProductsList();
    showNotification(`✅ Producto "${name}" agregado correctamente`);
}

function deleteCustomProduct(productId) {
    const index = customProducts.findIndex(p => p.id === productId);
    if (index > -1) {
        const name = customProducts[index].name;
        customProducts.splice(index, 1);
        const dbIndex = PRODUCTS_DB.findIndex(p => p.id === productId);
        if (dbIndex > -1) PRODUCTS_DB.splice(dbIndex, 1);
        saveCustomProducts();
        renderCustomProducts();
        renderProductsList();
        showNotification(`✅ Producto "${name}" eliminado`);
    }
}

function renderCustomProducts() {
    const container = document.getElementById('customProductsList');
    if (!container) return;
    
    if (customProducts.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.6;">No hay productos personalizados aún</p>';
        return;
    }
    
    container.innerHTML = customProducts.map(p => `
        <div class="custom-product-item">
            <div class="custom-product-info">
                <div class="custom-product-name">${p.name}</div>
                <div class="custom-product-macros">
                    <span class="macro-badge">🔥 ${p.kcal}kcal</span>
                    <span class="macro-badge">💪 ${p.protein}g</span>
                    <span class="macro-badge">🥔 ${p.carbs}g</span>
                    <span class="macro-badge">🥑 ${p.fats}g</span>
                </div>
                <small style="opacity: 0.6;">Por 100${p.unit}</small>
            </div>
            <button class="btn-delete" onclick="deleteCustomProduct(${p.id})">🗑️ Eliminar</button>
        </div>
    `).join('');
}

// ==================== HISTORIAL FRECUENTE ====================
var mealHistory = [];

function loadMealHistory() {
    const saved = localStorage.getItem('meal_history');
    if (saved) {
        mealHistory = JSON.parse(saved);
    }
}

function saveMealHistory() {
    localStorage.setItem('meal_history', JSON.stringify(mealHistory.slice(0, 50))); // Guardar últimas 50
}

function addToMealHistory(mealData) {
    mealHistory.unshift({
        timestamp: Date.now(),
        name: mealData.name,
        quantity: mealData.quantity,
        unit: mealData.unit,
        kcal: mealData.kcal,
        protein: mealData.protein,
        carbs: mealData.carbs,
        fats: mealData.fats
    });
    saveMealHistory();
}

function getFrequentMeals() {
    // Agrupar por nombre y contar frecuencia
    const frequencyMap = {};
    mealHistory.forEach(meal => {
        frequencyMap[meal.name] = (frequencyMap[meal.name] || 0) + 1;
    });
    
    // Ordenar por frecuencia y retornar top 15
    return Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, count]) => mealHistory.find(m => m.name === name));
}

function getRecentMeals() {
    return mealHistory.slice(0, 10); // Últimas 10 comidas
}

function renderRecentMeals() {
    const container = document.getElementById('recentMealsList');
    if (!container) return;
    
    const recents = getRecentMeals();
    if (recents.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.6; padding: 15px;">No hay comidas recientes</p>';
        return;
    }
    
    container.innerHTML = recents.map((meal, idx) => `
        <div class="recent-meal-item" onclick="reuseRecentMeal(${idx})">
            <div class="recent-meal-info">
                <div class="recent-meal-name">${meal.name} (${meal.quantity}${meal.unit})</div>
                <div class="recent-meal-macros">
                    <span class="macro-badge">🔥 ${Math.round(meal.kcal)}</span>
                    <span class="macro-badge">💪 ${meal.protein.toFixed(1)}g</span>
                    <span class="macro-badge">🥔 ${meal.carbs.toFixed(1)}g</span>
                    <span class="macro-badge">🥑 ${meal.fats.toFixed(1)}g</span>
                </div>
            </div>
            <span class="recent-meal-badge">+ Agregar</span>
        </div>
    `).join('');
}

function reuseRecentMeal(index) {
    const recents = getRecentMeals();
    const meal = recents[index];
    
    // Rellenar modal con datos de comida reciente
    document.getElementById('foodName').value = meal.name;
    document.getElementById('foodQuantity').value = meal.quantity;
    document.getElementById('foodUnit').value = meal.unit;
    document.getElementById('foodCals').value = meal.kcal;
    document.getElementById('foodProtein').value = meal.protein.toFixed(1);
    document.getElementById('foodCarbs').value = meal.carbs.toFixed(1);
    document.getElementById('foodFats').value = meal.fats.toFixed(1);
}

// PREDICCIÓN DE PESO
function loadWeightHistory() {
    const saved = localStorage.getItem('weight_history');
    if (!saved) {
        config.weightHistory = [];
        // Inicializar con peso inicial
        config.weightHistory.push({
            date: config.startDate.toISOString().split('T')[0],
            weight: config.startWeight,
            day: 1
        });
        saveWeightHistory();
    } else {
        config.weightHistory = JSON.parse(saved);
    }
}

function saveWeightHistory() {
    localStorage.setItem('weight_history', JSON.stringify(config.weightHistory || []));
}

function recordWeight(date, weight) {
    if (!config.weightHistory) config.weightHistory = [];
    const dateStr = date.toISOString().split('T')[0];
    const existingIndex = config.weightHistory.findIndex(w => w.date === dateStr);
    const dayNum = getDayNumber(date);
    
    if (existingIndex >= 0) {
        config.weightHistory[existingIndex].weight = weight;
    } else {
        config.weightHistory.push({ date: dateStr, weight, day: dayNum });
    }
    
    config.weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveWeightHistory();
}

function calculateWeightPrediction() {
    if (!config.weightHistory || config.weightHistory.length < 2) {
        return {
            estimatedDays: null,
            estimatedDate: null,
            weeklyLoss: null,
            confidence: 'low'
        };
    }
    
    // Usar los últimos 14 días para calcular tendencia
    const recentHistory = config.weightHistory.slice(-14);
    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];
    
    const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
    const weightDiff = first.weight - last.weight; // positivo = pérdida
    
    if (daysDiff === 0) return { estimatedDays: null, estimatedDate: null, weeklyLoss: null, confidence: 'low' };
    
    const weeklyLoss = (weightDiff / daysDiff) * 7;
    const remainingWeight = config.currentWeight - config.targetWeight;
    
    if (weeklyLoss <= 0) {
        return {
            estimatedDays: null,
            estimatedDate: null,
            weeklyLoss,
            confidence: 'low'
        };
    }
    
    const estimatedDays = Math.ceil((remainingWeight / weeklyLoss) * 7);
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);
    
    return {
        estimatedDays,
        estimatedDate: estimatedDate.toLocaleDateString('es-ES'),
        weeklyLoss: Math.abs(weeklyLoss).toFixed(2),
        confidence: config.weightHistory.length > 20 ? 'high' : 'medium'
    };
}

function getWeightTrendData() {
    if (!config.weightHistory || config.weightHistory.length === 0) return [];
    
    return config.weightHistory.map((w, i) => ({
        day: w.day,
        date: w.date,
        actual: w.weight,
        theoretical: config.startWeight - ((w.day - 1) * 0.3) // 0.3 kg/día teórico
    }));
}

function calculateNextDayPredictionForDate(dateKey, nextDayWeight = config.currentWeight) {
    // Versión genérica que calcula para cualquier fecha
    const dayData = allDays[dateKey];
    
    if (!dayData) {
        return null;
    }
    
    let totalKcal = 0, totalCarbs = 0;
    let totalWaterRetention = 0;
    
    Object.values(dayData.meals).forEach(meal => {
        meal.forEach(food => {
            totalKcal += food.kcal;
            totalCarbs += food.carbs;
            
            // Calcular retención de agua con timing para cada comida
            const foodWaterRetention = calculateWaterRetentionWithTiming(food.carbs, food.time, dateKey);
            totalWaterRetention += foodWaterRetention;
        });
    });
    
    // Obtener datos según tipo de día - PARSEAR CORRECTAMENTE EL DATEKEY
    // dateKey es "YYYY-MM-DD", necesitamos convertirlo a Date correctamente
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);
    const calorieTarget = dayInfo.type === 'entreno' ? config.calsEntrenamiento : config.calsDescanso;
    const tdee = calculateTDEE(dayInfo.type);
    
    // DÉFICIT PARA RESUMEN: vs Meta de ingesta (para mostrar avance hacia objetivo)
    const deficitVsMeta = totalKcal - calorieTarget; // negativo = déficit, positivo = superávit
    
    // DÉFICIT REAL PARA PESO: vs TDEE (gasto real - lo que importa para pérdida de grasa)
    const deficitVsTDEE = totalKcal - tdee; // negativo = déficit de verdad, positivo = superávit
    
    // Convertir DÉFICIT REAL a cambio de peso graso (1 kg grasa = 7700 kcal)
    // Usamos deficitVsTDEE porque es el déficit real contra tu gasto
    const fatChange = (deficitVsTDEE / 7700) * 0.45;
    
    // Entrenamientos también pueden causar inflamación (~200-300g para días de entreno)
    const trainingInflammation = dayInfo.type === 'entreno' ? 0.2 : 0;
    
    // Peso predicho para mañana (cambio de grasa + retención agua + inflamación)
    const predictedWeight = parseFloat((nextDayWeight + fatChange + totalWaterRetention + trainingInflammation).toFixed(2));
    
    return {
        date: dateKey,
        predictedWeight,
        fatChange: parseFloat(fatChange.toFixed(3)),
        waterRetention: parseFloat(totalWaterRetention.toFixed(2)),
        trainingInflammation,
        totalRetention: parseFloat((totalWaterRetention + trainingInflammation).toFixed(2)),
        caloriesConsumed: Math.round(totalKcal),
        calorieTarget,
        tdee,
        deficitVsMeta: Math.round(deficitVsMeta), // Déficit vs meta (para resumen)
        deficitVsTDEE: Math.round(deficitVsTDEE), // Déficit real (para peso)
        carbsConsumed: Math.round(totalCarbs),
        confidence: 'medium'
    };
}

function calculateNextDayPrediction() {
    // Usar versión genérica para hoy
    const today = getDateKey(currentDate);
    const pred = calculateNextDayPredictionForDate(today);
    
    if (!pred) return null;
    
    // Agregar explanación basada en déficit REAL vs TDEE
    return {
        ...pred,
        date: currentDate.toLocaleDateString('es-ES'),
        explanation: pred.deficitVsTDEE < 0 ? 
            `Déficit REAL de ${Math.abs(pred.deficitVsTDEE)} kcal vs TDEE (${pred.carbsConsumed}g carbos = ${pred.waterRetention}kg retención)` :
            `Superávit REAL de ${pred.deficitVsTDEE} kcal vs TDEE`
    };
}

function updateWeightPrediction() {
    const pred = calculateWeightPrediction();
    const predictionEl = document.getElementById('weightPrediction');
    
    if (!predictionEl) return;
    
    if (pred.estimatedDays && pred.weeklyLoss > 0) {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">📊 Proyección</div>
                <div class="prediction-content">
                    <div class="prediction-stat">
                        <span>Pérdida semanal:</span>
                        <strong>${pred.weeklyLoss} kg</strong>
                    </div>
                    <div class="prediction-stat">
                        <span>Días para meta:</span>
                        <strong>${pred.estimatedDays}</strong>
                    </div>
                    <div class="prediction-stat">
                        <span>Fecha estimada:</span>
                        <strong>${pred.estimatedDate}</strong>
                    </div>
                    <div class="prediction-confidence">
                        (Confianza: ${pred.confidence})
                    </div>
                </div>
            </div>
        `;
    } else {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">📊 Proyección</div>
                <div class="prediction-content">
                    <small>Registra tu peso regularmente para ver la predicción</small>
                </div>
            </div>
        `;
    }
}

function displayNextDayPrediction() {
    const nextPred = calculateNextDayPrediction();
    const predictionEl = document.getElementById('nextDayPrediction');
    
    if (!predictionEl || !nextPred) return;
    
    const sign = nextPred.deficitVsTDEE < 0 ? '📉' : '📈';
    const weightChange = nextPred.predictedWeight - config.currentWeight;
    const weightChangeSign = weightChange > 0 ? '+' : '';
    const weightColor = weightChange > 0 ? '#f56565' : '#48bb78';
    const structuralDeficit = nextPred.tdee - nextPred.calorieTarget; // Déficit diario incorporado
    
    predictionEl.innerHTML = `
        <div class="next-day-card">
            <div class="prediction-title">🔮 Peso Mañana (10:00 AM)</div>
            <div class="next-day-content">
                <div class="next-day-main">
                    <div class="next-day-weight">
                        <div class="weight-label">Peso estimado mañana:</div>
                        <div class="weight-value">${nextPred.predictedWeight} kg</div>
                        <div class="weight-change" style="color: ${weightColor};">
                            ${sign} ${weightChangeSign}${weightChange.toFixed(2)} kg
                        </div>
                    </div>
                </div>
                
                <div class="next-day-factors">
                    <div class="factor">
                        <span class="factor-label">💪 Consumidas:</span>
                        <span class="factor-value">${nextPred.caloriesConsumed} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">🎯 Meta ingesta:</span>
                        <span class="factor-value">${nextPred.calorieTarget} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">💨 TDEE (gasto):</span>
                        <span class="factor-value">${nextPred.tdee} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">❌ Déficit vs META:</span>
                        <span class="factor-value">${nextPred.deficitVsMeta} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">✅ Déficit REAL vs TDEE:</span>
                        <span class="factor-value">${nextPred.deficitVsTDEE} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">📊 Déficit diario:</span>
                        <span class="factor-value">${structuralDeficit} kcal/día</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">🥔 Carbos:</span>
                        <span class="factor-value">${nextPred.carbsConsumed}g</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">${nextPred.fatChange < 0 ? '🔥 Pérdida grasa:' : '📈 Ganancia grasa:'}</span>
                        <span class="factor-value">${Math.abs(nextPred.fatChange).toFixed(2)}kg</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">💧 Retención agua:</span>
                        <span class="factor-value">+${nextPred.waterRetention.toFixed(2)}kg</span>
                    </div>
                </div>
                
                <div class="next-day-explanation">
                    <small>⚠️ ${nextPred.explanation}</small>
                </div>
            </div>
        </div>
    `;
}

// ESTADO GLOBAL
var currentDate = new Date();
var allDays = {};
var config = {
    startWeight: 85.4,
    currentWeight: 73.1,
    targetWeight: 70,
    startDate: new Date('2025-12-29'),
    // Datos personales
    height: 170, // cm
    age: 33, // años
    gender: 'male', // male/female
    // Objetivos nutricionales (deprecated, calculados automáticamente ahora)
    proteinGoal: 160,
    calsEntrenamiento: 1800,
    calsDescanso: 1650,
    carbsMin: 90,
    carbsMax: 130,
    fatsMin: 50,
    fatsMax: 60,
};

// RUTINA DE GIMNASIO
const GYM_ROUTINE = {
    'Lunes': { type: 'descanso', label: 'Descanso' },
    'Martes': { type: 'entreno', label: 'Pierna (fuerte)' },
    'Miércoles': { type: 'entreno', label: 'Espalda + Pecho (ligero)' },
    'Jueves': { type: 'descanso', label: 'Descanso' },
    'Viernes': { type: 'entreno', label: 'Hombro + Brazos' },
    'Sábado': { type: 'entreno', label: 'Pecho + Espalda (fuerte)' },
    'Domingo': { type: 'entreno', label: 'Core + Antebrazo' },
};

// Función para obtener tipo de día (entreno/descanso)
function getDayType(date) {
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = daysOfWeek[date.getDay()];
    return GYM_ROUTINE[dayName];
}

// Función para obtener calorías objetivo según tipo de día (META DE INGESTA)
function getCalorieTarget() {
    const dayInfo = getDayType(currentDate);
    // Retorna la meta de ingesta (déficit ya aplicado)
    return dayInfo.type === 'entreno' ? config.calsEntrenamiento : config.calsDescanso;
}

// Función para obtener TDEE personalizado (GASTO REAL)
function getTDEE() {
    const dayInfo = getDayType(currentDate);
    return calculateTDEE(dayInfo.type);
}

// Función para calcular déficit actual
function getCurrentDeficit() {
    const tdee = getTDEE();
    const meta = getCalorieTarget();
    return tdee - meta; // Déficit positivo = necesario para perder peso
}

// Calcular TMR (Tasa Metabólica en Reposo) usando Mifflin-St Jeor
function calculateTMR() {
    const { currentWeight, height, age, gender } = config;
    
    if (gender === 'male') {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) + 5;
    } else {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) - 161;
    }
}

// Calcular TDEE (Gasto Energético Diario Total) basado en actividad
function calculateTDEE(dayType) {
    const tmr = calculateTMR();
    
    // Factores de actividad ajustados según tipo de día
    const activityFactors = {
        'entreno': 1.55,  // Entrenamiento + actividad (~55% encima de TMR)
        'descanso': 1.30  // Descanso + actividad baja (~30% encima de TMR)
    };
    
    const factor = activityFactors[dayType] || 1.30;
    return Math.round(tmr * factor);
}

// ==================== FUNCIONES DE TIMING DE COMIDAS ====================

// Obtener hora de entrenamiento del día (si existe evento de entreno)
function getTrainingTime(dateKey) {
    const dayData = allDays[dateKey];
    if (!dayData) return null;
    
    const dayInfo = getDayType(new Date(dateKey.split('-').map((d, i) => i === 1 ? parseInt(d) - 1 : d).join('-')));
    if (dayInfo.type !== 'entreno') return null;
    
    // Hora típica de entreno: 18:00 (6 PM) si no se especifica
    return '18:00';
}

// Calcular retención de agua ajustada por timing de comida
function calculateWaterRetentionWithTiming(carbs, mealTime, dateKey) {
    const baseRetention = carbs * 0.0035;
    
    if (!mealTime) return baseRetention;
    
    const trainingTime = getTrainingTime(dateKey);
    if (!trainingTime) return baseRetention;
    
    // Convertir strings "HH:MM" a minutos
    const mealMinutes = parseInt(mealTime.split(':')[0]) * 60 + parseInt(mealTime.split(':')[1]);
    const trainingMinutes = parseInt(trainingTime.split(':')[0]) * 60 + parseInt(trainingTime.split(':')[1]);
    const pesajeTime = 10 * 60; // 10:00 AM
    
    // Si comida fue pre-entreno (menos de 2 horas antes), mejor absorción
    if (mealTime < trainingTime && trainingMinutes - mealMinutes < 120) {
        return baseRetention * 0.7; // 30% menos retención (mejor absorción)
    }
    
    // Si comida fue post-entreno (hasta 2 horas después), mayor retención
    if (mealTime > trainingTime && mealMinutes - trainingMinutes < 120) {
        return baseRetention * 1.3; // 30% más retención (músculos cargan glucógeno)
    }
    
    // Si comida fue menos de 2 horas antes del pesaje
    if (mealMinutes < pesajeTime && pesajeTime - mealMinutes < 120) {
        return baseRetention * 1.2; // 20% más retención (aún en tracto digestivo)
    }
    
    return baseRetention;
}

// Determinar tipo de comida (pre, post, normal)
function getMealType(mealName, mealTime, dateKey) {
    if (!mealTime) return 'normal';
    
    const trainingTime = getTrainingTime(dateKey);
    if (!trainingTime) return 'normal';
    
    const mealMinutes = parseInt(mealTime.split(':')[0]) * 60 + parseInt(mealTime.split(':')[1]);
    const trainingMinutes = parseInt(trainingTime.split(':')[0]) * 60 + parseInt(trainingTime.split(':')[1]);
    
    if (mealTime < trainingTime && trainingMinutes - mealMinutes < 180) {
        return 'pre-entreno'; // Menos de 3 horas antes
    }
    
    if (mealTime > trainingTime && mealMinutes - trainingMinutes < 180) {
        return 'post-entreno'; // Menos de 3 horas después
    }
    
    return 'normal';
}

var charts = {};

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    loadDarkMode();
    loadConfig();
    loadCustomProducts();
    loadMealHistory();
    loadWeightHistory();
    loadAllDays();
    initializeToday();
    renderProductsList();
    renderRecentMeals();
    updateWeightPrediction();
    displayNextDayPrediction();
    setupTabNavigation();
    setupTabSearch();
    updateHeaderInfo();
    
    // Service Worker con detección de actualizaciones
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
            console.log('Service Worker registrado exitosamente');
            
            // Verificar actualizaciones cada 30 segundos
            setInterval(() => {
                registration.update();
            }, 30000);
            
            // Detectar cuando hay una nueva versión disponible
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Nueva versión disponible
                        showUpdateNotification(() => {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            // Recargar página para aplicar actualización
                            setTimeout(() => {
                                window.location.reload();
                            }, 500);
                        });
                    }
                });
            });
            
        }).catch((err) => {
            console.log('Error registrando Service Worker:', err);
        });
    }
    
    // Escuchar cuando el Service Worker se activa (cambio de versión)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('Nueva versión de Service Worker activada');
        });
    }
});

// ==================== TAB NAVIGATION ====================
function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            showTab(tabId);
            
            // Inicializar gráficos si es necesario
            if (tabId === 'historial' || tabId === 'estadisticas') {
                setTimeout(() => initializeCharts(), 100);
            }
        });
    });
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active');
    }
    
    // Renderizar contenido específico por tab
    if (tabId === 'gestionar') {
        renderCustomProducts();
    } else if (tabId === 'hoy') {
        displayWeeklyProgress();
    } else if (tabId === 'historial' || tabId === 'graficos') {
        renderWeightPredictionChart();
    } else if (tabId === 'estadisticas') {
        displayWeeklyStats();
        displayPredictionAccuracy();
    }
}

// ==================== CONFIG TABS ====================
function switchConfigTab(tabName) {
    // Remove active class from all tabs and buttons
    document.querySelectorAll('.config-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.config-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const tabElement = document.getElementById(`tab-${tabName}`);
    if (tabElement) tabElement.classList.add('active');
    
    // Activate the button that matches this tabName
    document.querySelectorAll('.config-tab-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });
}

// ==================== CONFIGURACIÓN ====================
function loadConfig() {
    const saved = localStorage.getItem('nutrition_config');
    if (saved) {
        const parsed = JSON.parse(saved);
        config = { ...config, ...parsed };
        if (parsed.startDate) config.startDate = new Date(parsed.startDate);
    }
    updateConfigUI();
}

function saveConfig() {
    const newWeight = parseFloat(document.getElementById('currentWeightInput')?.value || config.currentWeight);
    const oldWeight = config.currentWeight;
    
    config.startWeight = parseFloat(document.getElementById('startWeight')?.value || config.startWeight);
    config.currentWeight = newWeight;
    config.targetWeight = parseFloat(document.getElementById('targetWeight')?.value || config.targetWeight);
    config.startDate = new Date(document.getElementById('startDate')?.value || config.startDate.toISOString().split('T')[0]);
    config.height = parseInt(document.getElementById('height')?.value || config.height);
    config.age = parseInt(document.getElementById('age')?.value || config.age);
    config.gender = document.getElementById('gender')?.value || config.gender;
    config.proteinGoal = parseInt(document.getElementById('proteinGoalInput')?.value || config.proteinGoal);
    config.calsEntrenamiento = parseInt(document.getElementById('calsEntrenamiento')?.value || config.calsEntrenamiento);
    config.calsDescanso = parseInt(document.getElementById('calsDescanso')?.value || config.calsDescanso);
    config.carbsMin = parseInt(document.getElementById('carbsMin')?.value || config.carbsMin);
    config.carbsMax = parseInt(document.getElementById('carbsMax')?.value || config.carbsMax);
    config.fatsMin = parseInt(document.getElementById('fatsMin')?.value || config.fatsMin);
    config.fatsMax = parseInt(document.getElementById('fatsMax')?.value || config.fatsMax);
    
    // Registrar peso si cambió
    if (newWeight !== oldWeight) {
        recordWeight(new Date(), newWeight);
    }
    
    localStorage.setItem('nutrition_config', JSON.stringify(config));
    showNotification('✅ Configuración guardada correctamente', 'success');
    updateHeaderInfo();
    updateCalculatedValues();
    updateWeightPrediction();
    displayNextDayPrediction();
    renderDay();
}

function updateConfigUI() {
    const el = (id) => document.getElementById(id);
    if (el('startWeight')) el('startWeight').value = config.startWeight;
    if (el('currentWeightInput')) el('currentWeightInput').value = config.currentWeight;
    if (el('targetWeight')) el('targetWeight').value = config.targetWeight;
    if (el('startDate')) el('startDate').value = config.startDate.toISOString().split('T')[0];
    if (el('height')) el('height').value = config.height;
    if (el('age')) el('age').value = config.age;
    if (el('gender')) el('gender').value = config.gender;
    if (el('proteinGoalInput')) el('proteinGoalInput').value = config.proteinGoal;
    if (el('calsEntrenamiento')) el('calsEntrenamiento').value = config.calsEntrenamiento;
    if (el('calsDescanso')) el('calsDescanso').value = config.calsDescanso;
    if (el('carbsMin')) el('carbsMin').value = config.carbsMin;
    if (el('carbsMax')) el('carbsMax').value = config.carbsMax;
    if (el('fatsMin')) el('fatsMin').value = config.fatsMin;
    if (el('fatsMax')) el('fatsMax').value = config.fatsMax;
    
    // Actualizar valores calculados
    updateCalculatedValues();
}

function updateCalculatedValues() {
    const tmr = calculateTMR();
    const tdeeEntreno = calculateTDEE('entreno');
    const tdeeDescanso = calculateTDEE('descanso');
    
    const el = (id) => document.getElementById(id);
    if (el('tmrValue')) el('tmrValue').textContent = `${Math.round(tmr)} kcal/día`;
    if (el('tdeeEntrenoValue')) el('tdeeEntrenoValue').textContent = `${tdeeEntreno} kcal/día`;
    if (el('tdeeDescansoValue')) el('tdeeDescansoValue').textContent = `${tdeeDescanso} kcal/día`;
}

function updateHeaderInfo() {
    const dayNumber = getDayNumber(new Date());
    const startWeight = config.startWeight;
    const currentWeight = config.currentWeight;
    const targetWeight = config.targetWeight;
    const dayInfo = getDayType(currentDate);
    const targetCals = getCalorieTarget();
    
    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const progressPercent = Math.round((alreadyLost / totalToLose) * 100);
    
    if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = dayNumber;
    if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = `${currentWeight} kg`;
    if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = `${Math.min(progressPercent, 100)}%`;
    
    // Mostrar tipo de día (entreno/descanso)
    const dayTypeEl = document.getElementById('dayType');
    if (dayTypeEl) {
        if (dayInfo.type === 'entreno') {
            dayTypeEl.textContent = `💪 ${dayInfo.label}`;
            dayTypeEl.style.color = '#4299e1';
        } else {
            dayTypeEl.textContent = `😴 ${dayInfo.label}`;
            dayTypeEl.style.color = '#48bb78';
        }
    }
    
    // Actualizar objetivo de calorías en quick-macros
    if (document.getElementById('quickCals')) {
        const currentCals = document.getElementById('quickCals').textContent.split(' / ')[0] || '0';
        document.getElementById('quickCals').textContent = `${currentCals} / ${targetCals}`;
    }
}

// DARK MODE FUNCTIONALITY
function loadDarkMode() {
    const darkModeEnabled = localStorage.getItem('darkModeEnabled');
    
    // Por defecto, usar dark mode si no hay preferencia guardada
    if (darkModeEnabled === null || darkModeEnabled === 'true') {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkModeEnabled', 'true');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'dark_mode';
        }
    } else {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'light_mode';
        }
    }
}

function toggleDarkMode() {
    const isDarkMode = document.documentElement.classList.contains('dark-mode');
    
    if (isDarkMode) {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkModeEnabled', 'false');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'light_mode';
        }
    } else {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkModeEnabled', 'true');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'dark_mode';
        }
    }
}

// ==================== GESTIÓN DE DÍAS ====================
function getDayNumber(date) {
    const start = new Date(config.startDate);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function initializeToday() {
    const dateKey = getDateKey(currentDate);
    if (!allDays[dateKey]) {
        allDays[dateKey] = {
            date: dateKey,
            dayNumber: getDayNumber(currentDate),
            meals: { breakfast: [], lunch: [], snack: [], dinner: [] },
            notes: ''
        };
        saveDays();
    }
    renderDay();
}

function renderDay() {
    const dateKey = getDateKey(currentDate);
    const dayData = allDays[dateKey];
    
    if (!dayData) {
        initializeToday();
        return;
    }
    
    // Recalcular dayNumber cada vez para asegurar que esté actualizado
    const dayNumber = getDayNumber(currentDate);
    
    const formattedDate = currentDate.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Obtener tipo de día real del GYM_ROUTINE
    const dayInfo = getDayType(currentDate);
    const emoji = dayInfo.type === 'entreno' ? '💪' : '😴';
    const dayName = dayInfo.label; // Usa el label del GYM_ROUTINE
    
    if (document.getElementById('dayTitle')) {
        document.getElementById('dayTitle').textContent = `Día ${dayNumber} • ${emoji} ${dayName}`;
    }
    if (document.getElementById('dayDate')) {
        document.getElementById('dayDate').textContent = formattedDate;
    }
    
    // Renderizar comidas
    renderMealSection('breakfast', dayData.meals.breakfast);
    renderMealSection('lunch', dayData.meals.lunch);
    renderMealSection('snack', dayData.meals.snack);
    renderMealSection('dinner', dayData.meals.dinner);
    
    // Actualizar totales
    updateDaySummary(dayData);
    
    // Actualizar predicción del peso
    displayNextDayPrediction();
    
    // Actualizar progreso semanal
    displayWeeklyProgress();
}

function renderMealSection(mealName, foods) {
    const container = document.getElementById(mealName + '-items');
    const totalEl = document.getElementById(mealName + '-total');
    
    if (!container || !totalEl) return;
    
    container.innerHTML = '';
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
    
    foods.forEach((food, index) => {
        const foodEl = document.createElement('div');
        foodEl.className = 'food-item';
        const timeDisplay = food.time ? ` <span class="food-time">⏰ ${food.time}</span>` : '';
        foodEl.innerHTML = `
            <span class="food-item-name">${food.name} (${food.quantity}${food.unit})${timeDisplay}</span>
            <span class="food-item-macros">
                <span class="food-macro">🔥${food.kcal.toFixed(0)}</span>
                <span class="food-macro">💪${food.protein.toFixed(1)}g</span>
            </span>
            <button class="food-item-delete" onclick="deleteFood('${mealName}', ${index})">✕</button>
        `;
        container.appendChild(foodEl);
        
        totalKcal += food.kcal;
        totalProtein += food.protein;
        totalCarbs += food.carbs;
        totalFats += food.fats;
    });
    
    totalEl.textContent = `${totalKcal.toFixed(0)} kcal | ${totalProtein.toFixed(1)}g P`;
}

function updateDaySummary(dayData) {
    const meals = ['breakfast', 'lunch', 'snack', 'dinner'];
    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;
    
    meals.forEach(meal => {
        dayData.meals[meal].forEach(food => {
            sumKcal += food.kcal;
            sumProtein += food.protein;
            sumCarbs += food.carbs;
            sumFats += food.fats;
        });
    });
    
    // Determinar objetivos según el tipo de día
    const targetCals = getCalorieTarget();
    const targetProtein = config.proteinGoal;
    
    // Actualizar summary items
    const updateSummaryItem = (icon, label, value, goal, status, id) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<div class="summary-value">${value.toFixed(0)}</div>`;
        }
    };
    
    if (document.getElementById('sumCals')) document.getElementById('sumCals').textContent = sumKcal.toFixed(0);
    if (document.getElementById('calsGoal')) document.getElementById('calsGoal').textContent = `/ ${targetCals}`;
    if (document.getElementById('sumProtein')) document.getElementById('sumProtein').textContent = sumProtein.toFixed(1) + 'g';
    if (document.getElementById('proteinGoal')) document.getElementById('proteinGoal').textContent = `/ ${targetProtein}g`;
    if (document.getElementById('sumCarbs')) document.getElementById('sumCarbs').textContent = sumCarbs.toFixed(1) + 'g';
    if (document.getElementById('carbsGoal')) document.getElementById('carbsGoal').textContent = `/ ${config.carbsMin}-${config.carbsMax}g`;
    if (document.getElementById('sumFats')) document.getElementById('sumFats').textContent = sumFats.toFixed(1) + 'g';
    if (document.getElementById('fatsGoal')) document.getElementById('fatsGoal').textContent = `/ ${config.fatsMin}-${config.fatsMax}g`;
    
    // Status
    if (document.getElementById('statusCals')) document.getElementById('statusCals').textContent = getStatusTarget(sumKcal, targetCals);
    if (document.getElementById('statusProtein')) document.getElementById('statusProtein').textContent = getStatusTarget(sumProtein, targetProtein);
    if (document.getElementById('statusCarbs')) document.getElementById('statusCarbs').textContent = getStatusRange(sumCarbs, config.carbsMin, config.carbsMax);
    if (document.getElementById('statusFats')) document.getElementById('statusFats').textContent = getStatusRange(sumFats, config.fatsMin, config.fatsMax);
    
    // Quick macros
    updateQuickMacros(sumKcal, sumProtein, sumCarbs, sumFats, targetCals);
}

function updateQuickMacros(kcal, protein, carbs, fats, targetCals) {
    if (document.getElementById('quickCals')) document.getElementById('quickCals').textContent = `${kcal.toFixed(0)} / ${targetCals}`;
    if (document.getElementById('quickProtein')) document.getElementById('quickProtein').textContent = `${protein.toFixed(1)} / ${config.proteinGoal}g`;
    if (document.getElementById('quickCarbs')) document.getElementById('quickCarbs').textContent = `${carbs.toFixed(1)} / ${config.carbsMax}g`;
    if (document.getElementById('quickFats')) document.getElementById('quickFats').textContent = `${fats.toFixed(1)} / ${config.fatsMax}g`;
    
    // Actualizar barra de progreso
    const percent = Math.min((kcal / targetCals) * 100, 100);
    const bar = document.querySelector('.macro-bar::after');
    if (bar) {
        bar.style.width = percent + '%';
    }
}

// Status para TARGET (calorías, proteína) - compara vs meta con tolerancia de ±50 kcal/g
function getStatusTarget(value, target) {
    const diff = value - target;
    const absDiff = Math.abs(diff);
    
    if (absDiff <= 50) return '✅'; // Verde: dentro de ±50
    if (absDiff <= 150) return `⚠️ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`; // Naranja: ±50 a ±150
    return `❌ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`; // Rojo: >±150
}

// Status para RANGO (carbos, grasas) - verifica si está dentro del rango
function getStatusRange(value, min, max) {
    if (value >= min && value <= max) return '✅'; // Verde: dentro del rango
    if (value > max) return `⚠️ +${(value - max).toFixed(0)}`; // Naranja: arriba
    return `❌ -${(min - value).toFixed(0)}`; // Rojo: abajo
}

// ==================== ANÁLISIS Y ESTADÍSTICAS ====================

// Obtener sugerencias de macros inteligentes para hoy
function getMacroSuggestions() {
    const dateKey = getDateKey(currentDate);
    const dayData = allDays[dateKey];
    if (!dayData) return null;
    
    // Calcular consumo actual
    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;
    Object.values(dayData.meals).forEach(meal => {
        meal.forEach(food => {
            sumKcal += food.kcal;
            sumProtein += food.protein;
            sumCarbs += food.carbs;
            sumFats += food.fats;
        });
    });
    
    // Obtener metas
    const targetCals = getCalorieTarget();
    const dayInfo = getDayType(currentDate);
    const targetProtein = config.proteinGoal;
    const targetCarbs = dayInfo.type === 'entreno' ? config.carbsMax : config.carbsMax - 20;
    const targetFats = config.fatsMax;
    
    // Calcular deficiencias
    const missing = {
        kcal: Math.max(0, targetCals - sumKcal),
        protein: Math.max(0, targetProtein - sumProtein),
        carbs: Math.max(0, targetCarbs - sumCarbs),
        fats: Math.max(0, targetFats - sumFats)
    };
    
    return {
        consumido: { sumKcal, sumProtein, sumCarbs, sumFats },
        falta: missing,
        targetCarbs: targetCarbs,
        porcentajeCals: Math.round((sumKcal / targetCals) * 100),
        porcentajeProtein: Math.round((sumProtein / targetProtein) * 100),
        porcentajeCarbos: Math.round((sumCarbs / targetCarbs) * 100),
        porcentajeFats: Math.round((sumFats / targetFats) * 100)
    };
}

// Calcular estadísticas de la semana
function calculateWeeklyStats() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Comenzar desde domingo
    
    let totalDays = 0;
    let totalWeight = 0;
    let totalKcal = 0;
    let totalDeficit = 0;
    let daysRecorded = 0;
    const dailyStats = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateKey = getDateKey(date);
        
        // Si hay peso registrado para este día
        const weight = config.weightHistory?.find(w => w.date === dateKey);
        if (weight) {
            daysRecorded++;
            totalWeight += weight.weight;
            
            // Calcular macros del día
            const dayData = allDays[dateKey];
            if (dayData) {
                let kcal = 0;
                Object.values(dayData.meals).forEach(meal => {
                    meal.forEach(food => { kcal += food.kcal; });
                });
                
                const dayInfo = getDayType(date);
                const tdee = calculateTDEE(dayInfo.type);
                const deficit = tdee - kcal;
                
                totalKcal += kcal;
                totalDeficit += deficit;
                dailyStats.push({ date: dateKey, weight: weight.weight, kcal, deficit });
            }
        }
    }
    
    const avgWeight = daysRecorded > 0 ? totalWeight / daysRecorded : config.currentWeight;
    const weeklyLoss = daysRecorded >= 2 ? dailyStats[0]?.weight - dailyStats[daysRecorded - 1]?.weight : 0;
    
    return {
        daysRecorded,
        avgWeight,
        avgKcal: Math.round(totalKcal / Math.max(daysRecorded, 1)),
        avgDeficit: Math.round(totalDeficit / Math.max(daysRecorded, 1)),
        weeklyLoss: weeklyLoss?.toFixed(2) || 0,
        dailyStats
    };
}

// Indicador de progreso semanal
function getWeeklyProgress() {
    const stats = calculateWeeklyStats();
    const dayInfo = getDayType(currentDate);
    const expectedWeeklyLoss = 0.5; // 500g por semana = 500 kcal diarios vs TDEE
    
    const diff = parseFloat(stats.weeklyLoss) - expectedWeeklyLoss;
    const status = diff > -0.05 ? '✅ En camino' : diff > -0.2 ? '⚠️ Algo lento' : '❌ Muy lento';
    
    const daysToGoal = config.currentWeight > config.targetWeight 
        ? Math.round((config.currentWeight - config.targetWeight) / (expectedWeeklyLoss / 7)) 
        : 0;
    
    return {
        status,
        weeklyLoss: stats.weeklyLoss,
        expectedWeeklyLoss,
        diff: diff.toFixed(2),
        daysToGoal,
        estimatedDate: new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
    };
}

// Comparar predicciones vs peso real
function getPredictionAccuracy() {
    if (!config.weightHistory || config.weightHistory.length < 2) return null;
    
    const predictions = [];
    const errors = [];
    
    // Para cada peso registrado, comparar con lo predicho
    config.weightHistory.forEach((entry, idx) => {
        if (idx > 0) {
            const prevDate = config.weightHistory[idx - 1];
            const dateKey = prevDate.date;
            
            // Obtener predicción del día anterior
            const pred = calculateNextDayPredictionForDate(dateKey, prevDate.weight);
            if (pred) {
                const error = Math.abs(entry.weight - pred.predictedWeight);
                predictions.push({
                    date: entry.date,
                    predicted: pred.predictedWeight,
                    actual: entry.weight,
                    error: error.toFixed(3)
                });
                errors.push(error);
            }
        }
    });
    
    const avgError = errors.length > 0 ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(3) : 0;
    const accuracy = 100 - (avgError * 100); // Aproximación simple
    
    return {
        predictions,
        avgError,
        accuracy: Math.max(0, accuracy.toFixed(1)),
        totalComparisons: predictions.length
    };
}

function previousDay() {
    currentDate.setDate(currentDate.getDate() - 1);
    currentDate = new Date(currentDate);
    initializeToday();
}

// ==================== FUNCIONES DE RENDERIZADO ====================

// Mostrar sugerencias de macros inteligentes
function displayMacroSuggestions() {
    const suggestions = getMacroSuggestions();
    const container = document.getElementById('macroSuggestions');
    
    if (!container || !suggestions) return;
    
    const { falta, consumido, porcentajeCals, targetCarbs, porcentajeCarbos } = suggestions;
    
    container.innerHTML = `
        <div class="suggestions-card">
            <div class="suggestions-title">⚡ Sugerencias de Macros</div>
            <div class="suggestions-content">
                <div class="progress-item">
                    <span>🔥 Calorías: ${consumido.sumKcal}/${getCalorieTarget()}</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(porcentajeCals, 100)}%"></div>
                    </div>
                    ${falta.kcal > 0 ? `<small>Te faltan ${falta.kcal} kcal</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>💪 Proteína: ${consumido.sumProtein.toFixed(0)}g / ${config.proteinGoal}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min((consumido.sumProtein / config.proteinGoal) * 100, 100)}%"></div>
                    </div>
                    ${falta.protein > 0 ? `<small>Te faltan ${falta.protein.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>🥔 Carbos: ${consumido.sumCarbs.toFixed(0)}g / ${targetCarbs}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(porcentajeCarbos, 100)}%"></div>
                    </div>
                    ${falta.carbs > 0 ? `<small>Te faltan ${falta.carbs.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>🥑 Grasas: ${consumido.sumFats.toFixed(0)}g / ${config.fatsMax}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min((consumido.sumFats / config.fatsMax) * 100, 100)}%"></div>
                    </div>
                    ${falta.fats > 0 ? `<small>Te faltan ${falta.fats.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
                </div>
            </div>
        </div>
    `;
}

// Mostrar indicador de progreso semanal
function displayWeeklyProgress() {
    const progress = getWeeklyProgress();
    const container = document.getElementById('weeklyProgress');
    
    if (!container) return;
    
    container.innerHTML = `
        <div class="progress-card">
            <div class="progress-title">🎯 Progreso Semanal</div>
            <div class="progress-content">
                <div class="progress-indicator">
                    <div class="indicator-status">${progress.status}</div>
                    <div class="indicator-details">
                        <small>Pérdida actual: <strong>${progress.weeklyLoss} kg</strong> / Esperado: <strong>${progress.expectedWeeklyLoss} kg</strong></small>
                        <br>
                        <small>Diferencia: <strong>${progress.diff} kg</strong></small>
                    </div>
                </div>
                
                <div class="goal-info">
                    <div class="info-item">
                        <span>📅 Días hasta meta:</span>
                        <strong>${progress.daysToGoal} días</strong>
                    </div>
                    <div class="info-item">
                        <span>🎯 Fecha estimada:</span>
                        <strong>${progress.estimatedDate}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Mostrar estadísticas semanales
function displayWeeklyStats() {
    const stats = calculateWeeklyStats();
    const container = document.getElementById('weeklyStats');
    
    if (!container) return;
    
    container.innerHTML = `
        <div class="stats-card">
            <div class="stats-title">📈 Resumen Semanal</div>
            <div class="stats-content">
                <div class="stat-item">
                    <span>📊 Días registrados:</span>
                    <strong>${stats.daysRecorded} / 7</strong>
                </div>
                <div class="stat-item">
                    <span>⚖️ Peso promedio:</span>
                    <strong>${stats.avgWeight.toFixed(1)} kg</strong>
                </div>
                <div class="stat-item">
                    <span>📉 Pérdida semanal:</span>
                    <strong>${stats.weeklyLoss} kg</strong>
                </div>
                <div class="stat-item">
                    <span>🍽️ Calorías promedio:</span>
                    <strong>${stats.avgKcal} kcal/día</strong>
                </div>
                <div class="stat-item">
                    <span>❌ Déficit promedio:</span>
                    <strong>${stats.avgDeficit} kcal/día</strong>
                </div>
            </div>
        </div>
    `;
}

// Mostrar precisión de predicciones
function displayPredictionAccuracy() {
    const accuracy = getPredictionAccuracy();
    const container = document.getElementById('predictionAccuracy');
    
    if (!container || !accuracy) {
        if (container) container.innerHTML = '<small>Necesitas más datos (al menos 2 pesos registrados)</small>';
        return;
    }
    
    const predictions = accuracy.predictions.slice(-7); // Últimas 7 predicciones
    
    container.innerHTML = `
        <div class="accuracy-card">
            <div class="accuracy-title">🎯 Precisión de Predicciones</div>
            <div class="accuracy-content">
                <div class="accuracy-stats">
                    <div class="stat">
                        <span>Error promedio:</span>
                        <strong>${accuracy.avgError} kg</strong>
                    </div>
                    <div class="stat">
                        <span>Precisión:</span>
                        <strong>${accuracy.accuracy}%</strong>
                    </div>
                    <div class="stat">
                        <span>Comparaciones:</span>
                        <strong>${accuracy.totalComparisons}</strong>
                    </div>
                </div>
                
                <div class="predictions-list">
                    <small><strong>Últimas predicciones vs realidad:</strong></small>
                    ${predictions.map(p => `
                        <div class="prediction-item">
                            <span>${p.date}</span>
                            <span>Predicho: ${p.predicted} kg</span>
                            <span>Real: ${p.actual} kg</span>
                            <span style="color: ${Math.abs(parseFloat(p.error)) < 0.15 ? '#48bb78' : '#f56565'};">Error: ${p.error} kg</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Renderizar gráfico de peso predicho vs real
function renderWeightPredictionChart() {
    const canvas = document.getElementById('weightPredictionChart');
    if (!canvas || !config.weightHistory || config.weightHistory.length < 2) {
        if (canvas) canvas.parentElement.innerHTML = '<small>Necesitas más datos para mostrar el gráfico</small>';
        return;
    }
    
    // Preparar datos
    const labels = [];
    const realWeights = [];
    const predictedWeights = [];
    
    config.weightHistory.forEach((entry, idx) => {
        labels.push(entry.date);
        realWeights.push(entry.weight);
        
        if (idx > 0) {
            const pred = calculateNextDayPredictionForDate(config.weightHistory[idx - 1].date, config.weightHistory[idx - 1].weight);
            if (pred) {
                predictedWeights.push(pred.predictedWeight);
            }
        }
    });
    
    // Si ya existe chart, destruirlo
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    canvas.chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Peso Real',
                    data: realWeights,
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Peso Predicho',
                    data: predictedWeights,
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    tension: 0.3,
                    fill: true,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'Peso (kg)' }
                }
            }
        }
    });
}

function nextDay() {
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate = new Date(currentDate);
    initializeToday();
}

function todayDay() {
    currentDate = new Date();
    initializeToday();
}

// ==================== MODAL ====================
var currentMealForModal = null;

function openModal(mealType) {
    currentMealForModal = mealType;
    document.getElementById('modal').classList.add('show');
    resetModalForm();
    renderRecentMeals();
    setupTabSearch();
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

function resetModalForm() {
    const el = (id) => document.getElementById(id);
    el('foodName').value = '';
    el('foodQuantity').value = '';
    el('foodQuantity').dataset.basePortion = '1';
    el('foodUnit').value = 'g';
    el('foodCals').value = '';
    el('foodCals').dataset.base = '0';
    el('foodProtein').value = '';
    el('foodProtein').dataset.base = '0';
    el('foodCarbs').value = '';
    el('foodCarbs').dataset.base = '0';
    el('foodFats').value = '';
    el('foodFats').dataset.base = '0';
    el('foodTime').value = '';
}

function calculateMacros() {
    const quantity = parseFloat(document.getElementById('foodQuantity').value) || 0;
    const baseKcal = parseFloat(document.getElementById('foodCals').dataset.base) || 0;
    const baseProtein = parseFloat(document.getElementById('foodProtein').dataset.base) || 0;
    const baseCarbs = parseFloat(document.getElementById('foodCarbs').dataset.base) || 0;
    const baseFats = parseFloat(document.getElementById('foodFats').dataset.base) || 0;
    const basePortion = parseFloat(document.getElementById('foodQuantity').dataset.basePortion) || 1;
    
    if (quantity <= 0 || basePortion <= 0) return;
    
    const multiplier = quantity / basePortion;
    document.getElementById('foodCals').value = (baseKcal * multiplier).toFixed(1);
    document.getElementById('foodProtein').value = (baseProtein * multiplier).toFixed(1);
    document.getElementById('foodCarbs').value = (baseCarbs * multiplier).toFixed(1);
    document.getElementById('foodFats').value = (baseFats * multiplier).toFixed(1);
}

function setupTabSearch() {
    const search = document.getElementById('modalSearch');
    const quantity = document.getElementById('foodQuantity');
    
    if (search) {
        // Remover event listeners antiguos y agregar uno nuevo
        const newSearch = search.cloneNode(true);
        search.parentNode.replaceChild(newSearch, search);
        
        newSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const suggested = document.getElementById('suggestedProducts');
            
            if (query.length < 2) {
                suggested.innerHTML = '';
                return;
            }
            
            const matches = PRODUCTS_DB.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
            suggested.innerHTML = matches.map(p => `
                <div class="suggested-product-item" onclick="selectProduct(${p.id})">
                    <div class="suggested-product-info">
                        <div class="suggested-product-name">${p.name}</div>
                        <div class="suggested-product-macros">
                            <span class="macro-badge">🔥 ${p.kcal}kcal</span>
                            <span class="macro-badge">💪 ${p.protein}g</span>
                            <span class="macro-badge">🥔 ${p.carbs}g</span>
                            <span class="macro-badge">🥑 ${p.fats}g</span>
                        </div>
                    </div>
                    <span class="suggested-product-badge">+ Select</span>
                </div>
            `).join('');
        });
    }
    
    if (quantity) {
        quantity.addEventListener('input', calculateMacros);
    }
}

function selectProduct(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;
    
    document.getElementById('foodName').value = product.name;
    document.getElementById('foodQuantity').value = product.portion;
    document.getElementById('foodQuantity').dataset.basePortion = product.portion;
    document.getElementById('foodUnit').value = product.unit;
    
    const calsInput = document.getElementById('foodCals');
    const proteinInput = document.getElementById('foodProtein');
    const carbsInput = document.getElementById('foodCarbs');
    const fatsInput = document.getElementById('foodFats');
    
    calsInput.dataset.base = product.kcal;
    proteinInput.dataset.base = product.protein;
    carbsInput.dataset.base = product.carbs;
    fatsInput.dataset.base = product.fats;
    
    calsInput.value = product.kcal;
    proteinInput.value = product.protein;
    carbsInput.value = product.carbs;
    fatsInput.value = product.fats;
    
    document.getElementById('suggestedProducts').innerHTML = '';
}

function addFood() {
    if (!currentMealForModal) return;
    
    const food = {
        name: document.getElementById('foodName').value,
        quantity: parseFloat(document.getElementById('foodQuantity').value),
        unit: document.getElementById('foodUnit').value,
        kcal: parseFloat(document.getElementById('foodCals').value),
        protein: parseFloat(document.getElementById('foodProtein').value),
        carbs: parseFloat(document.getElementById('foodCarbs').value),
        fats: parseFloat(document.getElementById('foodFats').value),
        time: document.getElementById('foodTime').value || null,
    };
    
    if (!food.name || !food.quantity || !food.kcal) {
        showNotification('❌ Completa todos los campos', 'error');
        return;
    }
    
    const dateKey = getDateKey(currentDate);
    allDays[dateKey].meals[currentMealForModal].push(food);
    saveDays();
    
    // Guardar en historial
    addToMealHistory(food);
    
    closeModal();
    renderDay();
    renderRecentMeals();
    showNotification(`✅ ${food.name} agregado correctamente`);
}

function deleteFood(meal, index) {
    const dateKey = getDateKey(currentDate);
    allDays[dateKey].meals[meal].splice(index, 1);
    saveDays();
    renderDay();
}

// ==================== PRODUCTOS ====================
function renderProductsList() {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    const search = (document.getElementById('searchProduct')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || '';
    
    let filtered = PRODUCTS_DB.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesCategory = !category || p.category === category;
        return matchesSearch && matchesCategory;
    });
    
    container.innerHTML = filtered.map(p => `
        <div class="product-item" onclick="openModal('${currentMealForModal || 'breakfast'}'); selectProduct(${p.id})">
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-portion">📏 ${p.portion}${p.unit}</div>
                <div class="product-macros">
                    <span class="macro-badge">🔥 ${p.kcal}kcal</span>
                    <span class="macro-badge">💪 ${p.protein}g</span>
                    <span class="macro-badge">🥔 ${p.carbs}g</span>
                    <span class="macro-badge">🥑 ${p.fats}g</span>
                </div>
            </div>
            <button class="product-add-btn">Agregar</button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchProduct');
    const categorySelect = document.getElementById('categoryFilter');
    
    if (searchInput) searchInput.addEventListener('input', renderProductsList);
    if (categorySelect) categorySelect.addEventListener('change', renderProductsList);
});

// ==================== GRÁFICOS ====================
function initializeCharts() {
    if (window.Chart) {
        initWeightChart();
        initCaloriesChart();
        initProteinChart();
        initMacroChart();
        updateStatistics();
    }
}

function initWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx || charts.weight) return;
    
    const dates = Object.keys(allDays).sort();
    const weights = dates.map(date => {
        // Aquí iría la lógica de peso real si lo tienes registrado
        return config.currentWeight;
    }).slice(-30); // Últimos 30 días
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Peso (kg)',
                data: weights,
                borderColor: '#4299e1',
                backgroundColor: 'rgba(66, 153, 225, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#4299e1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: config.targetWeight - 5,
                    max: config.startWeight + 2
                }
            }
        }
    });
}

function initCaloriesChart() {
    const ctx = document.getElementById('caloriesChart');
    if (!ctx || charts.calories) return;
    
    const dates = Object.keys(allDays).sort();
    const caloriesData = dates.map(date => {
        const day = allDays[date];
        let totalKcal = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
            });
        });
        return totalKcal;
    }).slice(-30);
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.calories = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Calorías',
                data: caloriesData,
                backgroundColor: caloriesData.map(val => val > config.calsEntrenamiento ? '#f56565' : '#48bb78'),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function initProteinChart() {
    const ctx = document.getElementById('proteinChart');
    if (!ctx || charts.protein) return;
    
    const dates = Object.keys(allDays).sort();
    const proteinData = dates.map(date => {
        const day = allDays[date];
        let totalProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalProtein += food.protein;
            });
        });
        return totalProtein;
    }).slice(-30);
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.protein = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Proteína (g)',
                data: proteinData,
                borderColor: '#48bb78',
                backgroundColor: 'rgba(72, 187, 120, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function initMacroChart() {
    const ctx = document.getElementById('macroChart');
    if (!ctx || charts.macro) return;
    
    const dates = Object.keys(allDays).sort();
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0, count = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
                totalProtein += food.protein;
                totalCarbs += food.carbs;
                totalFats += food.fats;
            });
        });
        if (Object.values(day.meals).some(m => m.length > 0)) count++;
    });
    
    const avgProteinCals = totalProtein * 4 / count;
    const avgCarbsCals = totalCarbs * 4 / count;
    const avgFatsCals = totalFats * 9 / count;
    
    charts.macro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Proteína (4 kcal/g)', 'Carbos (4 kcal/g)', 'Grasas (9 kcal/g)'],
            datasets: [{
                data: [avgProteinCals, avgCarbsCals, avgFatsCals],
                backgroundColor: ['#4299e1', '#48bb78', '#ed8936'],
                borderRadius: 8,
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15, font: { size: 12 } }
                }
            }
        }
    });
}

// ==================== ESTADÍSTICAS ====================
function updateStatistics() {
    updateWeekStats();
    updateAverageStats();
    updateBestDayStats();
    updateHistoryList();
}

function updateWeekStats() {
    const container = document.getElementById('weekStats');
    if (!container) return;
    
    const today = new Date();
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        weekDays.push(getDateKey(d));
    }
    
    let weekCals = 0, weekProtein = 0, weekDaysLogged = 0;
    
    weekDays.forEach(day => {
        const dayData = allDays[day];
        if (dayData) {
            let dayKcal = 0, dayProtein = 0;
            Object.values(dayData.meals).forEach(meal => {
                meal.forEach(food => {
                    dayKcal += food.kcal;
                    dayProtein += food.protein;
                });
            });
            if (dayKcal > 0) {
                weekCals += dayKcal;
                weekProtein += dayProtein;
                weekDaysLogged++;
            }
        }
    });
    
    const avgCals = weekDaysLogged > 0 ? (weekCals / weekDaysLogged).toFixed(0) : 0;
    const avgProtein = weekDaysLogged > 0 ? (weekProtein / weekDaysLogged).toFixed(1) : 0;
    
    container.innerHTML = `
        <p><strong>Promedio semanal:</strong> ${avgCals} kcal</p>
        <p><strong>Promedio proteína:</strong> ${avgProtein}g</p>
        <p><strong>Días registrados:</strong> ${weekDaysLogged} / 7</p>
    `;
}

function updateAverageStats() {
    const container = document.getElementById('avgStats');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort();
    let totalKcal = 0, totalProtein = 0, count = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
            });
        });
        if (dayKcal > 0) {
            totalKcal += dayKcal;
            totalProtein += dayProtein;
            count++;
        }
    });
    
    const avgCals = count > 0 ? (totalKcal / count).toFixed(0) : 0;
    const avgProtein = count > 0 ? (totalProtein / count).toFixed(1) : 0;
    
    container.innerHTML = `
        <p><strong>Total de días:</strong> ${count}</p>
        <p><strong>Promedio calórico:</strong> ${avgCals} kcal</p>
        <p><strong>Promedio proteína:</strong> ${avgProtein}g</p>
    `;
}

function updateBestDayStats() {
    const container = document.getElementById('bestDayStats');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort();
    let bestDay = null;
    let maxProtein = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        let dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayProtein += food.protein;
            });
        });
        if (dayProtein > maxProtein) {
            maxProtein = dayProtein;
            bestDay = { date, protein: dayProtein, dayNumber: day.dayNumber };
        }
    });
    
    if (bestDay) {
        container.innerHTML = `
            <p><strong>Día ${bestDay.dayNumber}</strong></p>
            <p><strong>Proteína:</strong> ${bestDay.protein.toFixed(1)}g</p>
            <p><strong>Fecha:</strong> ${bestDay.date}</p>
        `;
    } else {
        container.innerHTML = '<p>Sin datos registrados</p>';
    }
}

function updateHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort().reverse();
    
    container.innerHTML = dates.slice(0, 10).map(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
                dayCarbs += food.carbs;
                dayFats += food.fats;
            });
        });
        
        return `
            <div class="history-item">
                <div class="history-item-header">
                    <span class="history-item-date">Día ${day.dayNumber} - ${date}</span>
                </div>
                <div class="history-item-macros">
                    <div class="history-macro">
                        <span class="history-macro-label">Kcal</span>
                        <span class="history-macro-value">${dayKcal.toFixed(0)}</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Proteína</span>
                        <span class="history-macro-value">${dayProtein.toFixed(1)}g</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Carbos</span>
                        <span class="history-macro-value">${dayCarbs.toFixed(1)}g</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Grasas</span>
                        <span class="history-macro-value">${dayFats.toFixed(1)}g</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== DATOS & EXPORT ====================
function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function saveDays() {
    localStorage.setItem('nutrition_days', JSON.stringify(allDays));
}

function loadAllDays() {
    const saved = localStorage.getItem('nutrition_days');
    if (saved) {
        try {
            allDays = JSON.parse(saved);
            console.log('✅ loadAllDays: Cargados', Object.keys(allDays).length, 'días desde localStorage');
        } catch (e) {
            console.error('❌ Error parsing nutrition_days:', e);
            allDays = {};
        }
    } else {
        console.log('⚠️ loadAllDays: No se encontraron datos en localStorage');
        allDays = {};
    }
}

function exportData() {
    // Calcular macros totales por día
    const dailySummary = {};
    const dateArray = Object.keys(allDays).sort();
    
    dateArray.forEach((date, index) => {
        const day = allDays[date];
        let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
        
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
                totalProtein += food.protein;
                totalCarbs += food.carbs;
                totalFats += food.fats;
            });
        });
        
        const daySummary = {
            dayNumber: day.dayNumber,
            totalKcal: Math.round(totalKcal),
            totalProtein: parseFloat(totalProtein.toFixed(1)),
            totalCarbs: parseFloat(totalCarbs.toFixed(1)),
            totalFats: parseFloat(totalFats.toFixed(1))
        };
        
        // Agregar predicción del próximo día
        const nextPrediction = calculateNextDayPredictionForDate(date);
        if (nextPrediction) {
            daySummary.nextDayPrediction = {
                predictedWeight: nextPrediction.predictedWeight,
                waterRetention: nextPrediction.waterRetention,
                fatChange: nextPrediction.fatChange,
                trainingInflammation: nextPrediction.trainingInflammation,
                deficit: nextPrediction.deficit
            };
        }
        
        dailySummary[date] = daySummary;
    });
    
    // Calcular estadísticas generales
    const summaryValues = Object.values(dailySummary);
    const statistics = {
        totalDays: summaryValues.length,
        averageKcal: summaryValues.length > 0 ? Math.round(summaryValues.reduce((sum, d) => sum + d.totalKcal, 0) / summaryValues.length) : 0,
        averageProtein: summaryValues.length > 0 ? parseFloat((summaryValues.reduce((sum, d) => sum + d.totalProtein, 0) / summaryValues.length).toFixed(1)) : 0,
        minKcal: summaryValues.length > 0 ? Math.min(...summaryValues.map(d => d.totalKcal)) : 0,
        maxKcal: summaryValues.length > 0 ? Math.max(...summaryValues.map(d => d.totalKcal)) : 0,
        weightLost: config.startWeight - config.currentWeight,
        progressPercent: Math.round(((config.startWeight - config.currentWeight) / (config.startWeight - config.targetWeight)) * 100)
    };
    
    // Predicción de peso
    const prediction = calculateWeightPrediction();
    
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        
        // Configuración y metas
        config,
        
        // Datos detallados
        days: allDays,
        customProducts,
        mealHistory,
        
        // Resúmenes y estadísticas
        dailySummary,
        statistics,
        
        // Predicción
        weightPrediction: prediction ? {
            weeklyLoss: typeof prediction.weeklyLoss === 'string' ? parseFloat(prediction.weeklyLoss) : parseFloat(prediction.weeklyLoss?.toFixed(2)),
            estimatedDays: prediction.estimatedDays,
            estimatedDate: prediction.estimatedDate,
            confidence: prediction.confidence
        } : null,
        
        // Preferencias
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
        
        note: 'Backup completo de todos los datos de la app con resúmenes y estadísticas'
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_backup_${getDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ Datos exportados correctamente (con estadísticas)');
}

function exportCSV() {
    let csv = 'Fecha,Día,Calorías,Proteína (g),Carbos (g),Grasas (g)\n';
    
    Object.keys(allDays).sort().forEach(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
                dayCarbs += food.carbs;
                dayFats += food.fats;
            });
        });
        
        csv += `${date},${day.dayNumber},${dayKcal.toFixed(0)},${dayProtein.toFixed(1)},${dayCarbs.toFixed(1)},${dayFats.toFixed(1)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_data_${getDateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ CSV exportado correctamente');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Restaurar config (compatible con versiones anteriores)
            if (data.config) {
                config = { ...config, ...data.config };
                localStorage.setItem('nutrition_config', JSON.stringify(config));
            }
            
            // Restaurar días
            if (data.days) {
                allDays = data.days;
                saveDays();
            }
            
            // Restaurar productos personalizados
            if (data.customProducts) {
                customProducts = data.customProducts;
                localStorage.setItem('custom_products', JSON.stringify(customProducts));
            }
            
            // Restaurar historial de comidas
            if (data.mealHistory) {
                mealHistory = data.mealHistory;
                localStorage.setItem('meal_history', JSON.stringify(mealHistory));
            }
            
            // Restaurar preferencia de dark mode
            if (data.darkModeEnabled !== undefined) {
                localStorage.setItem('darkModeEnabled', data.darkModeEnabled.toString());
                if (data.darkModeEnabled) {
                    document.documentElement.classList.add('dark-mode');
                    document.body.classList.add('dark-mode');
                    const toggleBtn = document.getElementById('darkModeToggle');
                    if (toggleBtn) toggleBtn.textContent = '☀️';
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    document.body.classList.remove('dark-mode');
                    const toggleBtn = document.getElementById('darkModeToggle');
                    if (toggleBtn) toggleBtn.textContent = '🌙';
                }
            }
            
            // Recargar la UI
            loadConfig();
            renderProductsList();
            renderRecentMeals();
            updateWeightPrediction();
            displayNextDayPrediction();
            initializeToday();
            showNotification('✅ Todos los datos importados correctamente');
        } catch (err) {
            showNotification('❌ Error al importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (!confirm('⚠️ ¿Estás seguro? Esto eliminará TODOS los datos.')) return;
    localStorage.clear();
    allDays = {};
    showNotification('✅ Todos los datos fueron eliminados');
    location.reload();
}

// ==================== NOTIFICACIONES ====================
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function showUpdateNotification(onUpdate) {
    // Crear modal de actualización
    const updateModal = document.createElement('div');
    updateModal.className = 'update-modal';
    updateModal.innerHTML = `
        <div class="update-modal-content">
            <div class="update-modal-header">
                <h2>📲 Actualización Disponible</h2>
            </div>
            <div class="update-modal-body">
                <p>Hay una nueva versión de <strong>Nutrition Tracker Pro</strong> disponible.</p>
                <p style="font-size: 0.9em; opacity: 0.7;">✅ Tus datos se conservarán automáticamente</p>
            </div>
            <div class="update-modal-footer">
                <button class="btn-secondary" id="update-later">Después</button>
                <button class="btn-primary" id="update-now">Actualizar Ahora</button>
            </div>
        </div>
    `;
    
    // Agregar estilos CSS si no existen
    if (!document.getElementById('update-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'update-modal-styles';
        style.textContent = `
            .update-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                animation: fadeIn 0.3s ease-in-out;
            }
            
            .update-modal-content {
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.3s ease-out;
            }
            
            html.dark-mode .update-modal-content {
                background: rgba(30, 41, 59, 0.95);
                color: #e2e8f0;
            }
            
            .update-modal-header h2 {
                margin: 0 0 16px 0;
                font-size: 1.3em;
            }
            
            .update-modal-body {
                margin: 0 0 24px 0;
                line-height: 1.6;
            }
            
            .update-modal-body p {
                margin: 8px 0;
            }
            
            .update-modal-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
            
            .update-modal-footer button {
                padding: 8px 16px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            .btn-secondary {
                background: #cbd5e1;
                color: #1e293b;
            }
            
            .btn-secondary:hover {
                background: #94a3b8;
            }
            
            html.dark-mode .btn-secondary {
                background: #475569;
                color: #e2e8f0;
            }
            
            html.dark-mode .btn-secondary:hover {
                background: #64748b;
            }
            
            .btn-primary {
                background: #4299e1;
                color: white;
            }
            
            .btn-primary:hover {
                background: #3182ce;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideUp {
                from {
                    transform: translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(updateModal);
    
    // Event listeners
    document.getElementById('update-later').addEventListener('click', () => {
        updateModal.remove();
    });
    
    document.getElementById('update-now').addEventListener('click', () => {
        updateModal.remove();
        onUpdate();
    });
    
    // Cerrar modal si se presiona ESC
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            updateModal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// ==================== OPENFOODFACTS SEARCH ====================

async function searchOpenFoodFacts() {
    const searchInput = document.getElementById('offSearchInput');
    const query = searchInput.value.trim();
    
    if (!query || query.length < 2) {
        showNotification('⚠️ Ingresa al menos 2 caracteres', 'warning');
        return;
    }
    
    const spinner = document.getElementById('offLoadingSpinner');
    const results = document.getElementById('offSearchResults');
    
    spinner.classList.remove('hidden');
    results.innerHTML = '';
    
    try {
        // OpenFoodFacts API directly (use JSONP or alternative endpoint)
        const apiUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&page_size=10&json=1`;
        
        // Use CORS-bypass proxy (thingproxy)
        const proxyUrl = `https://thingproxy.freeboard.io/fetch/${apiUrl}`;
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error('Error en la búsqueda');
        
        const data = await response.json();
        const products = data.products || [];
        
        if (products.length === 0) {
            results.innerHTML = '<p class="text-slate-400 text-center">No se encontraron productos 😕</p>';
            spinner.classList.add('hidden');
            return;
        }
        
        // Filtrar productos con información nutricional completa
        const validProducts = products.filter(p => 
            p.nutriments && 
            p.nutriments.energy_kcal && 
            p.nutriments.proteins && 
            p.nutriments.carbohydrates && 
            p.nutriments.fat
        );
        
        if (validProducts.length === 0) {
            results.innerHTML = '<p class="text-slate-400 text-center">No hay productos con información nutricional completa 📊</p>';
            spinner.classList.add('hidden');
            return;
        }
        
        // Mostrar resultados
        results.innerHTML = validProducts.map((product, index) => {
            const kcal = Math.round(product.nutriments.energy_kcal);
            const protein = product.nutriments.proteins || 0;
            const carbs = product.nutriments.carbohydrates || 0;
            const fats = product.nutriments.fat || 0;
            const productName = product.product_name || product.name || 'Producto desconocido';
            
            return `
                <div class="off-product-result p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-accent smooth-transition">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <h4 class="text-white font-semibold truncate">${productName}</h4>
                            <p class="text-sm text-slate-400">${product.brands || 'Marca desconocida'}</p>
                        </div>
                        <button onclick='addProductFromOFF(${index}, ${JSON.stringify(validProducts[index]).replace(/'/g, "\\'")})'
                                class="ml-2 px-3 py-1 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-opacity-80 smooth-transition">
                            ✓ Agregar
                        </button>
                    </div>
                    <div class="grid grid-cols-4 gap-2 mt-2">
                        <div class="text-center bg-slate-800/50 rounded p-2">
                            <div class="text-xs text-slate-400">Kcal</div>
                            <div class="text-sm text-orange-400 font-bold">${kcal}</div>
                        </div>
                        <div class="text-center bg-slate-800/50 rounded p-2">
                            <div class="text-xs text-slate-400">Proteína</div>
                            <div class="text-sm text-blue-400 font-bold">${protein.toFixed(1)}g</div>
                        </div>
                        <div class="text-center bg-slate-800/50 rounded p-2">
                            <div class="text-xs text-slate-400">Carbos</div>
                            <div class="text-sm text-green-400 font-bold">${carbs.toFixed(1)}g</div>
                        </div>
                        <div class="text-center bg-slate-800/50 rounded p-2">
                            <div class="text-xs text-slate-400">Grasas</div>
                            <div class="text-sm text-yellow-400 font-bold">${fats.toFixed(1)}g</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error en búsqueda de OpenFoodFacts:', error);
        results.innerHTML = `<p class="text-red-400 text-center">⚠️ Error en la búsqueda: ${error.message}</p>`;
    } finally {
        spinner.classList.add('hidden');
    }
}

function addProductFromOFF(index, productData) {
    try {
        const kcal = Math.round(productData.nutriments.energy_kcal);
        const protein = productData.nutriments.proteins || 0;
        const carbs = productData.nutriments.carbohydrates || 0;
        const fats = productData.nutriments.fat || 0;
        const name = productData.product_name || productData.name || 'Producto OpenFoodFacts';
        
        // Crear objeto de producto
        const newProduct = {
            id: Date.now(),
            name: name,
            portion: 100,
            unit: 'g',
            category: 'otros',
            kcal: kcal,
            protein: protein,
            carbs: carbs,
            fats: fats,
            source: 'OpenFoodFacts'
        };
        
        // Agregar a productos personalizados
        customProducts.push(newProduct);
        PRODUCTS_DB.push(newProduct);
        saveCustomProducts();
        
        // Limpiar búsqueda
        document.getElementById('offSearchInput').value = '';
        document.getElementById('offSearchResults').innerHTML = '';
        
        renderCustomProducts();
        renderProductsList();
        
        showNotification(`✅ "${name.substring(0, 30)}" agregado desde OpenFoodFacts`, 'success');
    } catch (error) {
        console.error('Error al agregar producto:', error);
        showNotification('❌ Error al agregar producto', 'error');
    }
}

// ==================== UTILITIES ====================
document.addEventListener('DOMContentLoaded', () => {
    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});
