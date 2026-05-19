// NUTRITION TRACKER PRO - VERSIÃ“N MEJORADA
// Sistema profesional con grÃ¡ficos, estadÃ­sticas y funcionalidades avanzadas

// ==================== ACCORDION FUNCTIONS (TOP-LEVEL) ====================
function toggleAccordion(headerElement) {
    // Close all other accordions
    document.querySelectorAll('.accordion-header').forEach(header => {
        if (header !== headerElement) {
            header.classList.remove('active');
            const content = header.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                content.classList.remove('active');
            }
        }
    });
    
    // Toggle current accordion
    headerElement.classList.toggle('active');
    const contentElement = headerElement.nextElementSibling;
    if (contentElement && contentElement.classList.contains('accordion-content')) {
        contentElement.classList.toggle('active');
        
        // Render weight history if this is the weight section
        if (contentElement.id === 'tab-pesos') {
            renderWeightHistory();
        }
    }
}

// ==================== ONBOARDING FUNCTIONS ====================

function isConfigComplete() {
    // Retorna true si la configuraciÃ³n bÃ¡sica estÃ¡ completa
    return !!(
        config.startWeight && 
        config.currentWeight && 
        config.targetWeight && 
        config.startDate && 
        config.height && 
        config.age && 
        config.gender
    );
}

function showOnboarding() {
    // Solo mostrar si no estÃ¡ completa la config y no estÃ¡ cerrada manualmente
    if (!isConfigComplete() && !localStorage.getItem('onboardingClosed')) {
        const modal = document.getElementById('onboardingModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }
}

function closeOnboarding() {
    const modal = document.getElementById('onboardingModal');
    if (modal) {
        modal.classList.add('hidden');
        // Guardar que el usuario cerrÃ³ el modal (no mostrar hasta que recargue)
        localStorage.setItem('onboardingClosed', 'true');
    }
}

function startOnboarding() {
    // Cerrar modal
    closeOnboarding();
    // Ir a pestaÃ±a Config
    showTab('config');
    // Scroll al acordeÃ³n Personal
    setTimeout(() => {
        const personalAccordion = document.querySelector('[data-step="personal"]');
        if (personalAccordion) {
            personalAccordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
}

// ==================== GOALS TRACKING FUNCTIONS ====================

// Calcular y mostrar objetivos
function updateGoalsDisplay() {
    if (!isConfigComplete()) return;

    const { startWeight, currentWeight, targetWeight, startDate, height, gender, age } = config;
    const now = new Date();
    
    // CÃ¡lculos de progreso
    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const remaining = currentWeight - targetWeight;
    const progressPercent = Math.round((alreadyLost / totalToLose) * 100);
    
    // BMI
    const heightM = height / 100;
    const currentBMI = (currentWeight / (heightM * heightM)).toFixed(1);
    const targetBMI = (targetWeight / (heightM * heightM)).toFixed(1);
    
    // DÃ­as en dÃ©ficit
    const startD = new Date(startDate);
    const daysTracking = Math.floor((now - startD) / (1000 * 60 * 60 * 24));
    
    // Promedio semanal
    const weeklyAvg = daysTracking > 0 ? (alreadyLost / (daysTracking / 7)).toFixed(2) : 0;
    
    // EstimaciÃ³n para alcanzar meta
    const expectedWeeklyLoss = 0.5;
    const daysRemaining = remaining > 0 ? Math.round((remaining / (expectedWeeklyLoss / 7))) : 0;
    const targetDateObj = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);
    const targetDateStr = targetDateObj.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    
    // Actualizar elementos del DOM
    el('goalCurrentWeight').textContent = currentWeight.toFixed(1) + ' kg';
    el('goalTargetWeight').textContent = targetWeight.toFixed(1) + ' kg';
    el('goalWeightStatus').textContent = `${alreadyLost.toFixed(1)} kg perdidos de ${totalToLose.toFixed(1)} kg`;
    el('goalTotalLost').textContent = alreadyLost.toFixed(1) + ' kg';
    el('goalRemaining').textContent = remaining.toFixed(1) + ' kg';
    el('goalPercentage').textContent = progressPercent + '%';
    el('goalDaysRemaining').textContent = daysRemaining;
    el('goalTargetDate').textContent = targetDateStr;
    el('goalDaysTracking').textContent = daysTracking;
    el('goalWeeklyAvg').textContent = weeklyAvg + ' kg/sem';
    el('goalCurrentBMI').textContent = currentBMI;
    el('goalTargetBMI').textContent = targetBMI;
    
    // Barra de progreso
    const barPercent = Math.min(progressPercent, 100);
    const goalWeightBar = document.getElementById('goalWeightBar');
    if (goalWeightBar) {
        goalWeightBar.style.width = barPercent + '%';
    }
    
    // Macros y calorÃ­as
    const tmr = calculateTMR(currentWeight, height, age, gender);
    const calsTraining = Math.round(tmr * 1.55);
    const calsRest = Math.round(tmr * 1.30);
    
    el('goalCalsTraining').textContent = calsTraining + ' kcal';
    el('goalCalsRest').textContent = calsRest + ' kcal';
    el('goalProtein').textContent = config.proteinGoal || '160' + ' g';
    el('goalCarbs').textContent = (config.carbsMax || 130) + ' g';
    el('goalFats').textContent = (config.fatsMax || 60) + ' g';
    
    // Mensajes motivacionales
    updateMotivationalMessage(progressPercent, alreadyLost, remaining);
}

function updateMotivationalMessage(progressPercent, lostWeight, remainingWeight) {
    const messages = [
        'Â¡Vas por buen camino! ContinÃºa con el dÃ©ficit calÃ³rico.',
        `Â¡Excelente! Ya has perdido ${lostWeight.toFixed(1)} kg. Solo faltan ${remainingWeight.toFixed(1)} kg.`,
        `Ya estÃ¡s al ${progressPercent}% de tu objetivo. Â¡Casi lo logras!`,
        'MantÃ©n la consistencia y alcanzarÃ¡s tu meta de peso.',
        `Con el ritmo actual, alcanzarÃ¡s tu objetivo en poco tiempo.`,
    ];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const motivationEl = document.getElementById('goalMotivation');
    if (motivationEl) {
        motivationEl.textContent = randomMessage;
    }
}

function calculateTMR(weight, height, age, gender) {
    // Fórmula Mifflin-St Jeor
    if (gender === 'male') {
        return (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
        return (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }
}

// ==================== NAVIGATION & UI FUNCTIONS ====================

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.darkModeEnabled = isDark;
}

function nextDay() {
    currentDateOffset++;
    loadCurrentDay();
}

function previousDay() {
    currentDateOffset--;
    loadCurrentDay();
}

function todayDay() {
    currentDateOffset = 0;
    loadCurrentDay();
}

// ==================== DATA INITIALIZATION ====================


const PRODUCTS_DB = [
    // Bebidas/LÃ¡cteos
    { id: 1, name: 'ðŸ¥› Leche entera', portion: 100, unit: 'ml', category: 'bebidas', kcal: 61, protein: 3.2, carbs: 4.7, fats: 3.6 },
    { id: 3, name: 'ðŸ¯ Yogur ProteÃ­nas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 52, protein: 10, carbs: 1, fats: 0.1 },
    { id: 4, name: 'ðŸ® Gelatina ProteÃ­nas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 40, protein: 10, carbs: 1, fats: 0.1 },
    { id: 5, name: 'ðŸ« Cacao Hacendado', portion: 10, unit: 'g', category: 'bebidas', kcal: 30, protein: 1.5, carbs: 4.5, fats: 0.5 },
    // ProteÃ­nas
    { id: 6, name: 'ðŸ¥š Huevo entero', portion: 50, unit: 'g', category: 'proteinas', kcal: 72, protein: 6.3, carbs: 0.6, fats: 5.1 },
    { id: 7, name: 'âšª Clara de huevo', portion: 30, unit: 'g', category: 'proteinas', kcal: 17, protein: 3.6, carbs: 0.4, fats: 0.1 },
    { id: 8, name: 'ðŸŸ AtÃºn en lata (lata 80g)', portion: 80, unit: 'g', category: 'proteinas', kcal: 78, protein: 16.8, carbs: 0.7, fats: 1 },
    { id: 9, name: 'ðŸ’ª ProteÃ­na Whey', portion: 40, unit: 'g', category: 'proteinas', kcal: 155, protein: 34.4, carbs: 1.2, fats: 1.5 },
    { id: 10, name: 'ðŸ’Š Creatina monohidrato', portion: 5, unit: 'g', category: 'suplementos', kcal: 0, protein: 0, carbs: 0, fats: 0 },
    // Carbohidratos
    { id: 11, name: 'ðŸ¥” Patata cocida', portion: 100, unit: 'g', category: 'carbos', kcal: 77, protein: 2, carbs: 17, fats: 0.1 },
    { id: 12, name: 'ðŸŒ PlÃ¡tano', portion: 100, unit: 'g', category: 'carbos', kcal: 89, protein: 1.1, carbs: 23, fats: 0.3 },
    { id: 13, name: 'ðŸš Arroz blanco cocido', portion: 100, unit: 'g', category: 'carbos', kcal: 130, protein: 2.7, carbs: 28, fats: 0.3 },
    // Platos completos
    { id: 14, name: 'ðŸ– AlbÃ³ndigas cerdo (5) + patatas', portion: 487, unit: 'g', category: 'platos', kcal: 646, protein: 34, carbs: 54, fats: 33 },
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
        showNotification('âŒ Completa todos los campos', 'error');
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
    showNotification(`âœ… Producto "${name}" agregado correctamente`);
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
        showNotification(`âœ… Producto "${name}" eliminado`);
    }
}

function renderCustomProducts() {
    const container = document.getElementById('customProductsList');
    if (!container) return;
    
    if (customProducts.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.6;">No hay productos personalizados aÃºn</p>';
        return;
    }
    
    container.innerHTML = customProducts.map(p => `
        <div class="custom-product-item">
            <div class="custom-product-info">
                <div class="custom-product-name">${p.name}</div>
                <div class="custom-product-macros">
                    <span class="macro-badge">ðŸ”¥ ${p.kcal}kcal</span>
                    <span class="macro-badge">ðŸ’ª ${p.protein}g</span>
                    <span class="macro-badge">ðŸ¥” ${p.carbs}g</span>
                    <span class="macro-badge">ðŸ¥‘ ${p.fats}g</span>
                </div>
                <small style="opacity: 0.6;">Por 100${p.unit}</small>
            </div>
            <button class="btn-delete" onclick="deleteCustomProduct(${p.id})">ðŸ—‘ï¸ Eliminar</button>
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
    localStorage.setItem('meal_history', JSON.stringify(mealHistory.slice(0, 50))); // Guardar Ãºltimas 50
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
    return mealHistory.slice(0, 10); // Ãšltimas 10 comidas
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
                    <span class="macro-badge">ðŸ”¥ ${Math.round(meal.kcal)}</span>
                    <span class="macro-badge">ðŸ’ª ${meal.protein.toFixed(1)}g</span>
                    <span class="macro-badge">ðŸ¥” ${meal.carbs.toFixed(1)}g</span>
                    <span class="macro-badge">ðŸ¥‘ ${meal.fats.toFixed(1)}g</span>
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

// PREDICCIÃ“N DE PESO
function loadWeightHistory() {
    const saved = localStorage.getItem('weight_history');
    if (!saved) {
        config.weightHistory = [];
        // Solo inicializar si hay startDate y startWeight configurados
        if (config.startDate && config.startWeight) {
            config.weightHistory.push({
                date: config.startDate.toISOString().split('T')[0],
                weight: config.startWeight,
                day: 1,
                predictedWeight: null
            });
            saveWeightHistory();
        }
    } else {
        config.weightHistory = JSON.parse(saved);
        
        // Migrate: add predictedWeight if missing
        let migratedCount = 0;
        config.weightHistory.forEach((entry, idx) => {
            if (entry.predictedWeight === undefined) {
                const prediction = calculateNextDayPredictionForDate(entry.date, entry.weight);
                entry.predictedWeight = prediction?.predictedWeight || null;
                migratedCount++;
            }
        });
        
        // Save if any migrations happened
        if (migratedCount > 0) {
            console.log(`[Weight History] Migrated ${migratedCount} entries with predicted weights`);
            saveWeightHistory();
        }
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
    
    // Calculate and save the prediction for this day
    const prediction = calculateNextDayPredictionForDate(dateStr, weight);
    const predictedWeight = prediction?.predictedWeight || null;
    
    if (existingIndex >= 0) {
        config.weightHistory[existingIndex].weight = weight;
        config.weightHistory[existingIndex].predictedWeight = predictedWeight;
    } else {
        config.weightHistory.push({ 
            date: dateStr, 
            weight, 
            day: dayNum,
            predictedWeight: predictedWeight
        });
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
    
    // Usar los Ãºltimos 14 dÃ­as para calcular tendencia
    const recentHistory = config.weightHistory.slice(-14);
    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];
    
    const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
    const weightDiff = first.weight - last.weight; // positivo = pÃ©rdida
    
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
        theoretical: config.startWeight - ((w.day - 1) * 0.3) // 0.3 kg/dÃ­a teÃ³rico
    }));
}

function calculateNextDayPredictionForDate(dateKey, nextDayWeight = config.currentWeight) {
    // VersiÃ³n genÃ©rica que calcula para cualquier fecha
    const dayData = allDays[dateKey];
    
    // Si no hay datos de comidas para ese dÃ­a, asumir 0 calorÃ­as (descanso o sin registro)
    let totalKcal = 0, totalCarbs = 0;
    let totalWaterRetention = 0;
    
    if (dayData) {
        Object.values(dayData.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
                totalCarbs += food.carbs;
                
                // Calcular retenciÃ³n de agua con timing para cada comida
                const foodWaterRetention = calculateWaterRetentionWithTiming(food.carbs, food.time, dateKey);
                totalWaterRetention += foodWaterRetention;
            });
        });
    }
    
    // Obtener datos segÃºn tipo de dÃ­a - PARSEAR CORRECTAMENTE EL DATEKEY
    // dateKey es "YYYY-MM-DD", necesitamos convertirlo a Date correctamente
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);
    const calorieTarget = dayInfo.type === 'entreno' ? config.calsEntrenamiento : config.calsDescanso;
    const tdee = calculateTDEE(dayInfo.type);
    
    // DÃ‰FICIT PARA RESUMEN: vs Meta de ingesta (para mostrar avance hacia objetivo)
    const deficitVsMeta = totalKcal - calorieTarget; // negativo = dÃ©ficit, positivo = superÃ¡vit
    
    // DÃ‰FICIT REAL PARA PESO: vs TDEE (gasto real - lo que importa para pÃ©rdida de grasa)
    const deficitVsTDEE = totalKcal - tdee; // negativo = dÃ©ficit de verdad, positivo = superÃ¡vit
    
    // Convertir DÃ‰FICIT REAL a cambio de peso graso (1 kg grasa = 7700 kcal)
    // Usamos deficitVsTDEE porque es el dÃ©ficit real contra tu gasto
    const fatChange = (deficitVsTDEE / 7700) * 0.45;
    
    // Entrenamientos tambiÃ©n pueden causar inflamaciÃ³n (~200-300g para dÃ­as de entreno)
    const trainingInflammation = dayInfo.type === 'entreno' ? 0.2 : 0;
    
    // Peso predicho para maÃ±ana (cambio de grasa + retenciÃ³n agua + inflamaciÃ³n)
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
        deficitVsMeta: Math.round(deficitVsMeta), // DÃ©ficit vs meta (para resumen)
        deficitVsTDEE: Math.round(deficitVsTDEE), // DÃ©ficit real (para peso)
        carbsConsumed: Math.round(totalCarbs),
        confidence: 'medium'
    };
}

function calculateNextDayPrediction() {
    // Usar versiÃ³n genÃ©rica para hoy
    const today = getDateKey(currentDate);
    const pred = calculateNextDayPredictionForDate(today);
    
    if (!pred) return null;
    
    // Agregar explanaciÃ³n basada en dÃ©ficit REAL vs TDEE
    return {
        ...pred,
        date: currentDate.toLocaleDateString('es-ES'),
        explanation: pred.deficitVsTDEE < 0 ? 
            `DÃ©ficit REAL de ${Math.abs(pred.deficitVsTDEE)} kcal vs TDEE (${pred.carbsConsumed}g carbos = ${pred.waterRetention}kg retenciÃ³n)` :
            `SuperÃ¡vit REAL de ${pred.deficitVsTDEE} kcal vs TDEE`
    };
}

function updateWeightPrediction() {
    const pred = calculateWeightPrediction();
    const predictionEl = document.getElementById('weightPrediction');
    
    if (!predictionEl) return;
    
    if (pred.estimatedDays && pred.weeklyLoss > 0) {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">ðŸ“Š ProyecciÃ³n</div>
                <div class="prediction-content">
                    <div class="prediction-stat">
                        <span>PÃ©rdida semanal:</span>
                        <strong>${pred.weeklyLoss} kg</strong>
                    </div>
                    <div class="prediction-stat">
                        <span>DÃ­as para meta:</span>
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
                <div class="prediction-title">ðŸ“Š ProyecciÃ³n</div>
                <div class="prediction-content">
                    <small>Registra tu peso regularmente para ver la predicciÃ³n</small>
                </div>
            </div>
        `;
    }
}

function saveDailyWeight() {
    const input = document.getElementById('dailyWeightInput');
    if (!input) return;
    
    const weight = parseFloat(input.value);
    if (isNaN(weight) || weight <= 0) {
        showNotification('âš ï¸ Ingresa un peso vÃ¡lido', 'warning');
        return;
    }
    
    // Registrar peso para hoy
    recordWeight(currentDate, weight);
    config.currentWeight = weight;
    
    // Guardar config y actualizar todo
    localStorage.setItem('nutrition_config', JSON.stringify(config));
    
    showNotification(`âœ… Peso registrado: ${weight}kg`, 'success');
    updateHeaderInfo();
    updateWeightPrediction();
    displayNextDayPrediction();
    renderDay();
    updateGoalsDisplay();
}

function displayNextDayPrediction() {
    const nextPred = calculateNextDayPrediction();
    const predictionEl = document.getElementById('nextDayPrediction');
    
    if (!predictionEl || !nextPred) return;
    
    const sign = nextPred.deficitVsTDEE < 0 ? 'ðŸ“‰' : 'ðŸ“ˆ';
    const weightChange = nextPred.predictedWeight - config.currentWeight;
    const weightChangeSign = weightChange > 0 ? '+' : '';
    const weightColor = weightChange > 0 ? '#f56565' : '#48bb78';
    const structuralDeficit = nextPred.tdee - nextPred.calorieTarget; // DÃ©ficit diario incorporado
    
    predictionEl.innerHTML = `
        <div class="next-day-card">
            <div class="prediction-title">ðŸ”® Peso MaÃ±ana (10:00 AM)</div>
            <div class="next-day-content">
                <div class="next-day-main">
                    <div class="next-day-weight">
                        <div class="weight-label">Peso estimado maÃ±ana:</div>
                        <div class="weight-value">${nextPred.predictedWeight} kg</div>
                        <div class="weight-change" style="color: ${weightColor};">
                            ${sign} ${weightChangeSign}${weightChange.toFixed(2)} kg
                        </div>
                    </div>
                </div>
                
                <div class="next-day-factors">
                    <div class="factor">
                        <span class="factor-label">ðŸ’ª Consumidas:</span>
                        <span class="factor-value">${nextPred.caloriesConsumed} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">ðŸŽ¯ Meta ingesta:</span>
                        <span class="factor-value">${nextPred.calorieTarget || '-'} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">ðŸ’¨ TDEE (gasto):</span>
                        <span class="factor-value">${nextPred.tdee || '-'} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">âŒ DÃ©ficit vs META:</span>
                        <span class="factor-value">${nextPred.deficitVsMeta} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">âœ… DÃ©ficit REAL vs TDEE:</span>
                        <span class="factor-value">${nextPred.deficitVsTDEE} kcal</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">ðŸ“Š DÃ©ficit diario:</span>
                        <span class="factor-value">${structuralDeficit} kcal/dÃ­a</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">ðŸ¥” Carbos:</span>
                        <span class="factor-value">${nextPred.carbsConsumed}g</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">${nextPred.fatChange < 0 ? 'ðŸ”¥ PÃ©rdida grasa:' : 'ðŸ“ˆ Ganancia grasa:'}</span>
                        <span class="factor-value">${Math.abs(nextPred.fatChange).toFixed(2)}kg</span>
                    </div>
                    <div class="factor">
                        <span class="factor-label">ðŸ’§ RetenciÃ³n agua:</span>
                        <span class="factor-value">+${nextPred.waterRetention.toFixed(2)}kg</span>
                    </div>
                </div>
                
                <div class="next-day-explanation">
                    <small>âš ï¸ ${nextPred.explanation}</small>
                </div>
            </div>
        </div>
    `;
}

// ESTADO GLOBAL
var currentDate = new Date();
var allDays = {};
var config = {
    startWeight: null,
    currentWeight: null,
    targetWeight: null,
    startDate: null,
    // Datos personales
    height: null, // cm
    age: null, // aÃ±os
    gender: null, // male/female
    // Objetivos nutricionales (deprecated, calculados automÃ¡ticamente ahora)
    proteinGoal: null,
    calsEntrenamiento: null,
    calsDescanso: null,
    carbsMin: null,
    carbsMax: null,
    fatsMin: null,
    fatsMax: null,
};

// RUTINA DE GIMNASIO
const GYM_ROUTINE = {
    'Lunes': { type: 'descanso', label: 'Descanso' },
    'Martes': { type: 'entreno', label: 'Pierna (fuerte)' },
    'MiÃ©rcoles': { type: 'entreno', label: 'Espalda + Pecho (ligero)' },
    'Jueves': { type: 'descanso', label: 'Descanso' },
    'Viernes': { type: 'entreno', label: 'Hombro + Brazos' },
    'SÃ¡bado': { type: 'entreno', label: 'Pecho + Espalda (fuerte)' },
    'Domingo': { type: 'entreno', label: 'Core + Antebrazo' },
};

// FunciÃ³n para obtener tipo de dÃ­a (entreno/descanso)
function getDayType(date) {
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'MiÃ©rcoles', 'Jueves', 'Viernes', 'SÃ¡bado'];
    const dayName = daysOfWeek[date.getDay()];
    return GYM_ROUTINE[dayName];
}

// FunciÃ³n para obtener calorÃ­as objetivo segÃºn tipo de dÃ­a (META DE INGESTA)
function getCalorieTarget() {
    const dayInfo = getDayType(currentDate);
    // Si no estÃ¡n configuradas las calorÃ­as, retorna 0
    if (!config.calsEntrenamiento && !config.calsDescanso) return 0;
    // Retorna la meta de ingesta (dÃ©ficit ya aplicado)
    return dayInfo.type === 'entreno' ? (config.calsEntrenamiento || 0) : (config.calsDescanso || 0);
}

// FunciÃ³n para obtener TDEE personalizado (GASTO REAL)
function getTDEE() {
    const dayInfo = getDayType(currentDate);
    return calculateTDEE(dayInfo.type);
}

// FunciÃ³n para calcular dÃ©ficit actual
function getCurrentDeficit() {
    const tdee = getTDEE();
    const meta = getCalorieTarget();
    return tdee - meta; // DÃ©ficit positivo = necesario para perder peso
}

// Calcular TMR (Tasa MetabÃ³lica en Reposo) usando Mifflin-St Jeor
function calculateTMR() {
    const { currentWeight, height, age, gender } = config;
    
    // Si falta informaciÃ³n, retorna 0
    if (!currentWeight || !height || !age || !gender) return 0;
    
    if (gender === 'male') {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) + 5;
    } else {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) - 161;
    }
}

// Calcular TDEE (Gasto EnergÃ©tico Diario Total) basado en actividad
function calculateTDEE(dayType) {
    const tmr = calculateTMR();
    
    // Factores de actividad ajustados segÃºn tipo de dÃ­a
    const activityFactors = {
        'entreno': 1.55,  // Entrenamiento + actividad (~55% encima de TMR)
        'descanso': 1.30  // Descanso + actividad baja (~30% encima de TMR)
    };
    
    const factor = activityFactors[dayType] || 1.30;
    return Math.round(tmr * factor);
}

// ==================== FUNCIONES DE TIMING DE COMIDAS ====================

// Obtener hora de entrenamiento del dÃ­a (si existe evento de entreno)
function getTrainingTime(dateKey) {
    const dayData = allDays[dateKey];
    if (!dayData) return null;
    
    const dayInfo = getDayType(new Date(dateKey.split('-').map((d, i) => i === 1 ? parseInt(d) - 1 : d).join('-')));
    if (dayInfo.type !== 'entreno') return null;
    
    // Hora tÃ­pica de entreno: 18:00 (6 PM) si no se especifica
    return '18:00';
}

// Calcular retenciÃ³n de agua ajustada por timing de comida
function calculateWaterRetentionWithTiming(carbs, mealTime, dateKey) {
    const baseRetention = carbs * 0.0035;
    
    if (!mealTime) return baseRetention;
    
    const trainingTime = getTrainingTime(dateKey);
    if (!trainingTime) return baseRetention;
    
    // Convertir strings "HH:MM" a minutos
    const mealMinutes = parseInt(mealTime.split(':')[0]) * 60 + parseInt(mealTime.split(':')[1]);
    const trainingMinutes = parseInt(trainingTime.split(':')[0]) * 60 + parseInt(trainingTime.split(':')[1]);
    const pesajeTime = 10 * 60; // 10:00 AM
    
    // Si comida fue pre-entreno (menos de 2 horas antes), mejor absorciÃ³n
    if (mealTime < trainingTime && trainingMinutes - mealMinutes < 120) {
        return baseRetention * 0.7; // 30% menos retenciÃ³n (mejor absorciÃ³n)
    }
    
    // Si comida fue post-entreno (hasta 2 horas despuÃ©s), mayor retenciÃ³n
    if (mealTime > trainingTime && mealMinutes - trainingMinutes < 120) {
        return baseRetention * 1.3; // 30% mÃ¡s retenciÃ³n (mÃºsculos cargan glucÃ³geno)
    }
    
    // Si comida fue menos de 2 horas antes del pesaje
    if (mealMinutes < pesajeTime && pesajeTime - mealMinutes < 120) {
        return baseRetention * 1.2; // 20% mÃ¡s retenciÃ³n (aÃºn en tracto digestivo)
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
        return 'post-entreno'; // Menos de 3 horas despuÃ©s
    }
    
    return 'normal';
}

var charts = {};

// INICIALIZACIÃ“N
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
    
    // Mostrar onboarding si la config no estÃ¡ completa
    showOnboarding();
});

// ==================== TAB NAVIGATION ====================
function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            showTab(tabId);
            
            // Inicializar grÃ¡ficos si es necesario
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
    
    // Renderizar contenido especÃ­fico por tab
    if (tabId === 'gestionar') {
        renderCustomProducts();
    } else if (tabId === 'hoy') {
        displayWeeklyProgress();
    } else if (tabId === 'historial' || tabId === 'graficos') {
        renderWeightPredictionChart();
    } else if (tabId === 'estadisticas') {
        displayWeeklyStats();
        displayPredictionAccuracy();
    } else if (tabId === 'objetivos') {
        updateGoalsDisplay();
    }
}

function renderWeightHistory() {
    const container = document.getElementById('weightHistoryContainer');
    if (!container) return;
    
    if (!config.weightHistory || config.weightHistory.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-center py-4">No hay pesos registrados</p>';
        return;
    }
    
    container.innerHTML = config.weightHistory
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((entry, index) => {
            const date = new Date(entry.date + 'T00:00:00');
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
            const dayNum = entry.day || (index + 1);
            
            return `
                <div class="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-primary smooth-transition flex items-center justify-between gap-4">
                    <div class="flex-1">
                        <p class="text-white font-semibold">DÃ­a ${dayNum}</p>
                        <p class="text-xs text-slate-400">${dayName}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="number" 
                               step="0.1" 
                               value="${entry.weight}" 
                               class="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-right focus:outline-none focus:border-accent smooth-transition"
                               onchange="updateWeightEntry('${entry.date}', this.value)"
                               onkeyup="if(event.key === 'Enter') this.onchange()">
                        <span class="text-slate-400 font-medium">kg</span>
                        <button onclick="deleteWeightEntry('${entry.date}')" class="ml-2 p-2 hover:bg-red-600/20 text-red-400 rounded-lg smooth-transition" title="Eliminar">
                            <span class="material-icons text-lg">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
}

function updateWeightEntry(date, newWeight) {
    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight <= 0) return;
    
    const index = config.weightHistory.findIndex(w => w.date === date);
    if (index >= 0) {
        config.weightHistory[index].weight = weight;
        
        // Calculate and save prediction for this day
        const prediction = calculateNextDayPredictionForDate(date, weight);
        config.weightHistory[index].predictedWeight = prediction?.predictedWeight || null;
        
        saveWeightHistory();
        renderWeightHistory();
        showNotification(`âœ… Peso actualizado: ${weight}kg`, 'success');
        updateHeaderInfo();
        updateWeightPrediction();
        displayNextDayPrediction();
        renderDay();
    }
}

function deleteWeightEntry(date) {
    if (!confirm('Â¿EstÃ¡s seguro de que quieres eliminar este registro?')) return;
    
    config.weightHistory = config.weightHistory.filter(w => w.date !== date);
    saveWeightHistory();
    renderWeightHistory();
    showNotification('âœ… Registro eliminado', 'success');
    updateHeaderInfo();
    updateWeightPrediction();
    displayNextDayPrediction();
    renderDay();
}

// ==================== CONFIGURACIÃ“N ====================
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
    
    const startDateInput = document.getElementById('startDate')?.value;
    config.startDate = startDateInput ? new Date(startDateInput) : (config.startDate || null);
    
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
    
    // Registrar peso si cambiÃ³
    if (newWeight !== oldWeight) {
        recordWeight(new Date(), newWeight);
    }
    
    localStorage.setItem('nutrition_config', JSON.stringify(config));
    showNotification('âœ… ConfiguraciÃ³n guardada correctamente', 'success');
    updateHeaderInfo();
    updateCalculatedValues();
    updateWeightPrediction();
    displayNextDayPrediction();
    renderDay();
    updateGoalsDisplay();
    
    // Si la configuraciÃ³n estÃ¡ completa, cerrar onboarding y limpiar flag
    if (isConfigComplete()) {
        closeOnboarding();
        localStorage.removeItem('onboardingClosed');
    }
}

function updateConfigUI() {
    const el = (id) => document.getElementById(id);
    if (el('startWeight')) el('startWeight').value = config.startWeight || '';
    if (el('currentWeightInput')) el('currentWeightInput').value = config.currentWeight || '';
    if (el('targetWeight')) el('targetWeight').value = config.targetWeight || '';
    if (el('startDate')) el('startDate').value = config.startDate ? config.startDate.toISOString().split('T')[0] : '';
    if (el('height')) el('height').value = config.height || '';
    if (el('age')) el('age').value = config.age || '';
    if (el('gender')) el('gender').value = config.gender || '';
    if (el('proteinGoalInput')) el('proteinGoalInput').value = config.proteinGoal || '';
    if (el('calsEntrenamiento')) el('calsEntrenamiento').value = config.calsEntrenamiento || '';
    if (el('calsDescanso')) el('calsDescanso').value = config.calsDescanso || '';
    if (el('carbsMin')) el('carbsMin').value = config.carbsMin || '';
    if (el('carbsMax')) el('carbsMax').value = config.carbsMax || '';
    if (el('fatsMin')) el('fatsMin').value = config.fatsMin || '';
    if (el('fatsMax')) el('fatsMax').value = config.fatsMax || '';
    
    // Actualizar valores calculados
    updateCalculatedValues();
}

function updateCalculatedValues() {
    // Si falta informaciÃ³n, no calcular
    if (!config.age || !config.height || !config.gender) {
        const el = (id) => document.getElementById(id);
        if (el('tmrValue')) el('tmrValue').textContent = '-';
        if (el('tdeeEntrenoValue')) el('tdeeEntrenoValue').textContent = '-';
        if (el('tdeeDescansoValue')) el('tdeeDescansoValue').textContent = '-';
        return;
    }
    
    const tmr = calculateTMR();
    const tdeeEntreno = calculateTDEE('entreno');
    const tdeeDescanso = calculateTDEE('descanso');
    
    const el = (id) => document.getElementById(id);
    if (el('tmrValue')) el('tmrValue').textContent = `${Math.round(tmr)} kcal/dÃ­a`;
    if (el('tdeeEntrenoValue')) el('tdeeEntrenoValue').textContent = `${tdeeEntreno} kcal/dÃ­a`;
    if (el('tdeeDescansoValue')) el('tdeeDescansoValue').textContent = `${tdeeDescanso} kcal/dÃ­a`;
}

function updateHeaderInfo() {
    const dayNumber = getDayNumber(new Date());
    const startWeight = config.startWeight;
    const currentWeight = config.currentWeight;
    const targetWeight = config.targetWeight;
    const dayInfo = getDayType(currentDate);
    const targetCals = getCalorieTarget();
    
    // Si no hay configuraciÃ³n, mostrar estados iniciales
    if (!config.startDate || !startWeight || !currentWeight) {
        if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = '-';
        if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = '- kg';
        if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = '-';
        return;
    }
    
    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const progressPercent = totalToLose !== 0 ? Math.round((alreadyLost / totalToLose) * 100) : 0;
    
    if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = dayNumber;
    if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = `${currentWeight} kg`;
    if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = `${Math.min(progressPercent, 100)}%`;
    
    // Mostrar tipo de dÃ­a (entreno/descanso)
    const dayTypeEl = document.getElementById('dayType');
    if (dayTypeEl) {
        if (dayInfo.type === 'entreno') {
            dayTypeEl.textContent = `ðŸ’ª ${dayInfo.label}`;
            dayTypeEl.style.color = '#4299e1';
        } else {
            dayTypeEl.textContent = `ðŸ˜´ ${dayInfo.label}`;
            dayTypeEl.style.color = '#48bb78';
        }
    }
    
    // Actualizar objetivo de calorÃ­as en quick-macros
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

// ==================== GESTIÃ“N DE DÃAS ====================
function getDayNumber(date) {
    // Si no hay fecha de inicio, no hay dÃ­a registrado
    if (!config.startDate) return 0;
    
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
    
    // Recalcular dayNumber cada vez para asegurar que estÃ© actualizado
    const dayNumber = getDayNumber(currentDate);
    
    const formattedDate = currentDate.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Obtener tipo de dÃ­a real del GYM_ROUTINE
    const dayInfo = getDayType(currentDate);
    const emoji = dayInfo.type === 'entreno' ? 'ðŸ’ª' : 'ðŸ˜´';
    const dayName = dayInfo.label; // Usa el label del GYM_ROUTINE
    
    if (document.getElementById('dayTitle')) {
        document.getElementById('dayTitle').textContent = `DÃ­a ${dayNumber} â€¢ ${emoji} ${dayName}`;
    }
    if (document.getElementById('dayDate')) {
        document.getElementById('dayDate').textContent = formattedDate;
    }
    
    // Cargar peso actual del dÃ­a en el input
    const todayWeight = config.weightHistory?.find(w => w.date === dateKey);
    if (document.getElementById('dailyWeightInput')) {
        if (todayWeight) {
            document.getElementById('dailyWeightInput').value = todayWeight.weight;
        } else {
            document.getElementById('dailyWeightInput').value = '';
        }
    }
    
    // Renderizar comidas
    renderMealSection('breakfast', dayData.meals.breakfast);
    renderMealSection('lunch', dayData.meals.lunch);
    renderMealSection('snack', dayData.meals.snack);
    renderMealSection('dinner', dayData.meals.dinner);
    
    // Actualizar totales
    updateDaySummary(dayData);
    
    // Actualizar predicciÃ³n del peso
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
        const timeDisplay = food.time ? ` <span class="food-time">â° ${food.time}</span>` : '';
        foodEl.innerHTML = `
            <span class="food-item-name">${food.name} (${food.quantity}${food.unit})${timeDisplay}</span>
            <span class="food-item-macros">
                <span class="food-macro">ðŸ”¥${food.kcal.toFixed(0)}</span>
                <span class="food-macro">ðŸ’ª${food.protein.toFixed(1)}g</span>
            </span>
            <button class="food-item-delete" onclick="deleteFood('${mealName}', ${index})">âœ•</button>
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
    
    // Determinar objetivos segÃºn el tipo de dÃ­a
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
    if (document.getElementById('quickCals')) document.getElementById('quickCals').textContent = `${kcal.toFixed(0)} / ${targetCals || 0}`;
    if (document.getElementById('quickProtein')) document.getElementById('quickProtein').textContent = `${protein.toFixed(1)} / ${config.proteinGoal || '-'}g`;
    if (document.getElementById('quickCarbs')) document.getElementById('quickCarbs').textContent = `${carbs.toFixed(1)} / ${config.carbsMax || '-'}g`;
    if (document.getElementById('quickFats')) document.getElementById('quickFats').textContent = `${fats.toFixed(1)} / ${config.fatsMax || '-'}g`;
    
    // Actualizar barra de progreso
    const percent = Math.min((kcal / targetCals) * 100, 100);
    const bar = document.querySelector('.macro-bar::after');
    if (bar) {
        bar.style.width = percent + '%';
    }
}

// Status para TARGET (calorÃ­as, proteÃ­na) - compara vs meta con tolerancia de Â±50 kcal/g
function getStatusTarget(value, target) {
    const diff = value - target;
    const absDiff = Math.abs(diff);
    
    if (absDiff <= 50) return 'âœ…'; // Verde: dentro de Â±50
    if (absDiff <= 150) return `âš ï¸ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`; // Naranja: Â±50 a Â±150
    return `âŒ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`; // Rojo: >Â±150
}

// Status para RANGO (carbos, grasas) - verifica si estÃ¡ dentro del rango
function getStatusRange(value, min, max) {
    if (value >= min && value <= max) return 'âœ…'; // Verde: dentro del rango
    if (value > max) return `âš ï¸ +${(value - max).toFixed(0)}`; // Naranja: arriba
    return `âŒ -${(min - value).toFixed(0)}`; // Rojo: abajo
}

// ==================== ANÃLISIS Y ESTADÃSTICAS ====================

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

// Calcular estadÃ­sticas de la semana
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
        
        // Si hay peso registrado para este dÃ­a
        const weight = config.weightHistory?.find(w => w.date === dateKey);
        if (weight) {
            daysRecorded++;
            totalWeight += weight.weight;
            
            // Calcular macros del dÃ­a
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
    const status = diff > -0.05 ? 'âœ… En camino' : diff > -0.2 ? 'âš ï¸ Algo lento' : 'âŒ Muy lento';
    
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
            let predictedWeight = null;
            
            // Usar predicciÃ³n guardada si estÃ¡ disponible
            if (config.weightHistory[idx - 1]?.predictedWeight) {
                predictedWeight = config.weightHistory[idx - 1].predictedWeight;
            } else {
                // Si no estÃ¡ guardada, calcularla
                const prevDate = config.weightHistory[idx - 1];
                const pred = calculateNextDayPredictionForDate(prevDate.date, prevDate.weight);
                predictedWeight = pred?.predictedWeight;
            }
            
            if (predictedWeight) {
                const error = Math.abs(entry.weight - predictedWeight);
                predictions.push({
                    date: entry.date,
                    predicted: predictedWeight,
                    actual: entry.weight,
                    error: error.toFixed(3)
                });
                errors.push(error);
            }
        }
    });
    
    const avgError = errors.length > 0 ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(3) : 0;
    const accuracy = 100 - (avgError * 100); // AproximaciÃ³n simple
    
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
            <div class="suggestions-title">âš¡ Sugerencias de Macros</div>
            <div class="suggestions-content">
                <div class="progress-item">
                    <span>ðŸ”¥ CalorÃ­as: ${consumido.sumKcal}/${getCalorieTarget()}</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(porcentajeCals, 100)}%"></div>
                    </div>
                    ${falta.kcal > 0 ? `<small>Te faltan ${falta.kcal} kcal</small>` : '<small>âœ… Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>ðŸ’ª ProteÃ­na: ${consumido.sumProtein.toFixed(0)}g / ${config.proteinGoal}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min((consumido.sumProtein / config.proteinGoal) * 100, 100)}%"></div>
                    </div>
                    ${falta.protein > 0 ? `<small>Te faltan ${falta.protein.toFixed(0)}g</small>` : '<small>âœ… Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>ðŸ¥” Carbos: ${consumido.sumCarbs.toFixed(0)}g / ${targetCarbs}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(porcentajeCarbos, 100)}%"></div>
                    </div>
                    ${falta.carbs > 0 ? `<small>Te faltan ${falta.carbs.toFixed(0)}g</small>` : '<small>âœ… Alcanzada</small>'}
                </div>
                
                <div class="progress-item">
                    <span>ðŸ¥‘ Grasas: ${consumido.sumFats.toFixed(0)}g / ${config.fatsMax}g</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min((consumido.sumFats / config.fatsMax) * 100, 100)}%"></div>
                    </div>
                    ${falta.fats > 0 ? `<small>Te faltan ${falta.fats.toFixed(0)}g</small>` : '<small>âœ… Alcanzada</small>'}
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
            <div class="progress-title">ðŸŽ¯ Progreso Semanal</div>
            <div class="progress-content">
                <div class="progress-indicator">
                    <div class="indicator-status">${progress.status}</div>
                    <div class="indicator-details">
                        <small>PÃ©rdida actual: <strong>${progress.weeklyLoss} kg</strong> / Esperado: <strong>${progress.expectedWeeklyLoss} kg</strong></small>
                        <br>
                        <small>Diferencia: <strong>${progress.diff} kg</strong></small>
                    </div>
                </div>
                
                <div class="goal-info">
                    <div class="info-item">
                        <span>ðŸ“… DÃ­as hasta meta:</span>
                        <strong>${progress.daysToGoal} dÃ­as</strong>
                    </div>
                    <div class="info-item">
                        <span>ðŸŽ¯ Fecha estimada:</span>
                        <strong>${progress.estimatedDate}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Mostrar estadÃ­sticas semanales
function displayWeeklyStats() {
    const stats = calculateWeeklyStats();
    const container = document.getElementById('weeklyStats');
    
    if (!container) return;
    
    container.innerHTML = `
        <div class="stats-card">
            <div class="stats-title">ðŸ“ˆ Resumen Semanal</div>
            <div class="stats-content">
                <div class="stat-item">
                    <span>ðŸ“Š DÃ­as registrados:</span>
                    <strong>${stats.daysRecorded} / 7</strong>
                </div>
                <div class="stat-item">
                    <span>âš–ï¸ Peso promedio:</span>
                    <strong>${stats.avgWeight.toFixed(1)} kg</strong>
                </div>
                <div class="stat-item">
                    <span>ðŸ“‰ PÃ©rdida semanal:</span>
                    <strong>${stats.weeklyLoss} kg</strong>
                </div>
                <div class="stat-item">
                    <span>ðŸ½ï¸ CalorÃ­as promedio:</span>
                    <strong>${stats.avgKcal} kcal/dÃ­a</strong>
                </div>
                <div class="stat-item">
                    <span>âŒ DÃ©ficit promedio:</span>
                    <strong>${stats.avgDeficit} kcal/dÃ­a</strong>
                </div>
            </div>
        </div>
    `;
}

// Mostrar precisiÃ³n de predicciones
function displayPredictionAccuracy() {
    const accuracy = getPredictionAccuracy();
    const container = document.getElementById('predictionAccuracy');
    
    if (!container || !accuracy) {
        if (container) container.innerHTML = '<small>Necesitas mÃ¡s datos (al menos 2 pesos registrados)</small>';
        return;
    }
    
    const predictions = accuracy.predictions.slice(-7); // Ãšltimas 7 predicciones
    
    container.innerHTML = `
        <div class="accuracy-card">
            <div class="accuracy-title">ðŸŽ¯ PrecisiÃ³n de Predicciones</div>
            <div class="accuracy-content">
                <div class="accuracy-stats">
                    <div class="stat">
                        <span>Error promedio:</span>
                        <strong>${accuracy.avgError} kg</strong>
                    </div>
                    <div class="stat">
                        <span>PrecisiÃ³n:</span>
                        <strong>${accuracy.accuracy}%</strong>
                    </div>
                    <div class="stat">
                        <span>Comparaciones:</span>
                        <strong>${accuracy.totalComparisons}</strong>
                    </div>
                </div>
                
                <div class="predictions-list">
                    <small><strong>Ãšltimas predicciones vs realidad:</strong></small>
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

// Renderizar grÃ¡fico de peso predicho vs real
function renderWeightPredictionChart() {
    const canvas = document.getElementById('weightPredictionChart');
    if (!canvas || !config.weightHistory || config.weightHistory.length < 2) {
        if (canvas) canvas.parentElement.innerHTML = '<small>Necesitas mÃ¡s datos para mostrar el grÃ¡fico</small>';
        return;
    }
    
    // Preparar datos usando predicciones guardadas
    const labels = [];
    const realWeights = [];
    const predictedWeights = [];
    
    config.weightHistory.forEach((entry, idx) => {
        labels.push(entry.date);
        realWeights.push(entry.weight);
        
        // Si hay predicciÃ³n guardada para este dÃ­a, usarla
        if (entry.predictedWeight !== undefined && entry.predictedWeight !== null) {
            predictedWeights.push(entry.predictedWeight);
        } else if (idx > 0) {
            // Si no hay predicciÃ³n guardada, calcularla del dÃ­a anterior
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
                            <span class="macro-badge">ðŸ”¥ ${p.kcal}kcal</span>
                            <span class="macro-badge">ðŸ’ª ${p.protein}g</span>
                            <span class="macro-badge">ðŸ¥” ${p.carbs}g</span>
                            <span class="macro-badge">ðŸ¥‘ ${p.fats}g</span>
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
        showNotification('âŒ Completa todos los campos', 'error');
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
    showNotification(`âœ… ${food.name} agregado correctamente`);
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
                <div class="product-portion">ðŸ“ ${p.portion}${p.unit}</div>
                <div class="product-macros">
                    <span class="macro-badge">ðŸ”¥ ${p.kcal}kcal</span>
                    <span class="macro-badge">ðŸ’ª ${p.protein}g</span>
                    <span class="macro-badge">ðŸ¥” ${p.carbs}g</span>
                    <span class="macro-badge">ðŸ¥‘ ${p.fats}g</span>
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

// ==================== GRÃFICOS ====================
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
    if (!ctx) return;
    
    // Destruir chart existente si existe
    if (charts.weight) {
        charts.weight.destroy();
        charts.weight = null;
    }
    
    // Usar el histÃ³rico de pesos en lugar de las fechas de allDays
    const weightsData = config.weightHistory || [];
    
    // Obtener Ãºltimos 30 registros de peso
    const displayData = weightsData.slice(-30);
    const labelsText = displayData.map(w => {
        const d = new Date(w.date);
        return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    });
    const weights = displayData.map(w => w.weight);
    
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
    if (!ctx) return;
    
    // Destruir chart existente si existe
    if (charts.calories) {
        charts.calories.destroy();
        charts.calories = null;
    }
    
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
                label: 'CalorÃ­as',
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
    if (!ctx) return;
    
    // Destruir chart existente si existe
    if (charts.protein) {
        charts.protein.destroy();
        charts.protein = null;
    }
    
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
                label: 'ProteÃ­na (g)',
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
    if (!ctx) return;
    
    // Destruir chart existente si existe
    if (charts.macro) {
        charts.macro.destroy();
        charts.macro = null;
    }
    
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
            labels: ['ProteÃ­na (4 kcal/g)', 'Carbos (4 kcal/g)', 'Grasas (9 kcal/g)'],
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

// ==================== ESTADÃSTICAS ====================
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
        <p><strong>Promedio proteÃ­na:</strong> ${avgProtein}g</p>
        <p><strong>DÃ­as registrados:</strong> ${weekDaysLogged} / 7</p>
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
        <p><strong>Total de dÃ­as:</strong> ${count}</p>
        <p><strong>Promedio calÃ³rico:</strong> ${avgCals} kcal</p>
        <p><strong>Promedio proteÃ­na:</strong> ${avgProtein}g</p>
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
            <p><strong>DÃ­a ${bestDay.dayNumber}</strong></p>
            <p><strong>ProteÃ­na:</strong> ${bestDay.protein.toFixed(1)}g</p>
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
                    <span class="history-item-date">DÃ­a ${day.dayNumber} - ${date}</span>
                </div>
                <div class="history-item-macros">
                    <div class="history-macro">
                        <span class="history-macro-label">Kcal</span>
                        <span class="history-macro-value">${dayKcal.toFixed(0)}</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">ProteÃ­na</span>
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
            console.log('âœ… loadAllDays: Cargados', Object.keys(allDays).length, 'dÃ­as desde localStorage');
        } catch (e) {
            console.error('âŒ Error parsing nutrition_days:', e);
            allDays = {};
        }
    } else {
        console.log('âš ï¸ loadAllDays: No se encontraron datos en localStorage');
        allDays = {};
    }
}

function exportData() {
    // Calcular macros totales por dÃ­a
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
        
        // Agregar predicciÃ³n del prÃ³ximo dÃ­a
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
    
    // Calcular estadÃ­sticas generales
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
    
    // PredicciÃ³n de peso
    const prediction = calculateWeightPrediction();
    
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        
        // ConfiguraciÃ³n y metas
        config,
        
        // Datos detallados
        days: allDays,
        customProducts,
        mealHistory,
        
        // ResÃºmenes y estadÃ­sticas
        dailySummary,
        statistics,
        
        // PredicciÃ³n
        weightPrediction: prediction ? {
            weeklyLoss: typeof prediction.weeklyLoss === 'string' ? parseFloat(prediction.weeklyLoss) : parseFloat(prediction.weeklyLoss?.toFixed(2)),
            estimatedDays: prediction.estimatedDays,
            estimatedDate: prediction.estimatedDate,
            confidence: prediction.confidence
        } : null,
        
        // Preferencias
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
        
        note: 'Backup completo de todos los datos de la app con resÃºmenes y estadÃ­sticas'
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_backup_${getDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('âœ… Datos exportados correctamente (con estadÃ­sticas)');
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
        
        csv += `${date},${day.dayNumber},${dayKcal.toFixed(0)},${dayProtein.toFixed(1)},${dayCarbs.toFixed(1)},${dayFats.toFixed(1)}
`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_data_${getDateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('âœ… CSV exportado correctamente');
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
            
            // Restaurar dÃ­as
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
                    if (toggleBtn) toggleBtn.textContent = 'â˜€ï¸';
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    document.body.classList.remove('dark-mode');
                    const toggleBtn = document.getElementById('darkModeToggle');
                    if (toggleBtn) toggleBtn.textContent = 'ðŸŒ™';
                }
            }
            
            // Recargar la UI
            loadConfig();
            renderProductsList();
            renderRecentMeals();
            updateWeightPrediction();
            displayNextDayPrediction();
            initializeToday();
            showNotification('âœ… Todos los datos importados correctamente');
        } catch (err) {
            showNotification('âŒ Error al importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (!confirm('âš ï¸ Â¿EstÃ¡s seguro? Esto eliminarÃ¡ TODOS los datos.')) return;
    localStorage.clear();
    allDays = {};
    showNotification('âœ… Todos los datos fueron eliminados');
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
    // Crear modal de actualizaciÃ³n
    const updateModal = document.createElement('div');
    updateModal.className = 'update-modal';
    updateModal.innerHTML = `
        <div class="update-modal-content">
            <div class="update-modal-header">
                <h2>ðŸ“² ActualizaciÃ³n Disponible</h2>
            </div>
            <div class="update-modal-body">
                <p>Hay una nueva versiÃ³n de <strong>Nutrition Tracker Pro</strong> disponible.</p>
                <p style="font-size: 0.9em; opacity: 0.7;">âœ… Tus datos se conservarÃ¡n automÃ¡ticamente</p>
            </div>
            <div class="update-modal-footer">
                <button class="btn-secondary" id="update-later">DespuÃ©s</button>
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


// ==================== UTILITIES ====================
document.addEventListener('DOMContentLoaded', () => {
    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});
