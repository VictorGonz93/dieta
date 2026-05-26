// ==================== PREDICCIÓN Y GESTIÓN DE PESO ====================

import AppState from './state.js';
import { getDayType, calculateTDEE } from './nutrition.js';
import { getDateKey, saveDays } from './storage.js';
import { showNotification } from './ui/notifications.js';

export function loadWeightHistory() {
    const saved = localStorage.getItem('weight_history');
    if (!saved) {
        AppState.config.weightHistory = [];
        if (AppState.config.startDate && AppState.config.startWeight) {
            AppState.config.weightHistory.push({
                date: AppState.config.startDate.toISOString().split('T')[0],
                weight: AppState.config.startWeight,
                day: 1,
                predictedWeight: null,
            });
            saveWeightHistory();
        }
    } else {
        AppState.config.weightHistory = JSON.parse(saved);
        let migratedCount = 0;
        AppState.config.weightHistory.forEach((entry) => {
            if (entry.predictedWeight === undefined) {
                const prediction = calculateNextDayPredictionForDate(entry.date, entry.weight);
                entry.predictedWeight = prediction?.predictedWeight || null;
                migratedCount++;
            }
        });
        if (migratedCount > 0) {
            console.log(`[Weight History] Migrated ${migratedCount} entries with predicted weights`);
            saveWeightHistory();
        }
    }
}

export function saveWeightHistory() {
    localStorage.setItem('weight_history', JSON.stringify(AppState.config.weightHistory || []));
}

export function recordWeight(date, weight) {
    if (!AppState.config.weightHistory) AppState.config.weightHistory = [];
    const dateStr = date.toISOString().split('T')[0];
    const existingIndex = AppState.config.weightHistory.findIndex(w => w.date === dateStr);

    const { getDayNumber } = await_getDayNumber();
    const dayNum = getDayNumber(date);

    const prediction = calculateNextDayPredictionForDate(dateStr, weight);
    const predictedWeight = prediction?.predictedWeight || null;

    if (existingIndex >= 0) {
        AppState.config.weightHistory[existingIndex].weight = weight;
        AppState.config.weightHistory[existingIndex].predictedWeight = predictedWeight;
    } else {
        AppState.config.weightHistory.push({ date: dateStr, weight, day: dayNum, predictedWeight });
    }

    AppState.config.weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveWeightHistory();
}

// Helper síncrono para getDayNumber (evitar circular import)
function await_getDayNumber() {
    return { getDayNumber: (date) => {
        if (!AppState.config.startDate) return 0;
        const start = new Date(AppState.config.startDate);
        const diff = date - start;
        return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    }};
}

export function calculateWeightPrediction() {
    if (!AppState.config.weightHistory || AppState.config.weightHistory.length < 2) {
        return { estimatedDays: null, estimatedDate: null, weeklyLoss: null, confidence: 'low' };
    }

    const recentHistory = AppState.config.weightHistory.slice(-14);
    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];

    const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
    const weightDiff = first.weight - last.weight;

    if (daysDiff === 0) return { estimatedDays: null, estimatedDate: null, weeklyLoss: null, confidence: 'low' };

    const weeklyLoss = (weightDiff / daysDiff) * 7;
    const remainingWeight = AppState.config.currentWeight - AppState.config.targetWeight;

    if (weeklyLoss <= 0) {
        return { estimatedDays: null, estimatedDate: null, weeklyLoss, confidence: 'low' };
    }

    const estimatedDays = Math.ceil((remainingWeight / weeklyLoss) * 7);
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);

    return {
        estimatedDays,
        estimatedDate: estimatedDate.toLocaleDateString('es-ES'),
        weeklyLoss: Math.abs(weeklyLoss).toFixed(2),
        confidence: AppState.config.weightHistory.length > 20 ? 'high' : 'medium',
    };
}

export function getWeightTrendData() {
    if (!AppState.config.weightHistory || AppState.config.weightHistory.length === 0) return [];
    return AppState.config.weightHistory.map(w => ({
        day: w.day,
        date: w.date,
        actual: w.weight,
        theoretical: AppState.config.startWeight - ((w.day - 1) * 0.3),
    }));
}

export function getTrainingTime(dateKey) {
    const dayData = AppState.allDays[dateKey];
    if (!dayData) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayInfo = getDayType(new Date(year, month - 1, day));
    if (dayInfo.type !== 'entreno') return null;
    return '18:00';
}

export function calculateWaterRetentionWithTiming(carbs, mealTime, dateKey) {
    const baseRetention = carbs * 0.0037;
    if (!mealTime) return baseRetention;

    const trainingTime = getTrainingTime(dateKey);
    if (!trainingTime) return baseRetention;

    const mealMinutes = parseInt(mealTime.split(':')[0]) * 60 + parseInt(mealTime.split(':')[1]);
    const trainingMinutes = parseInt(trainingTime.split(':')[0]) * 60 + parseInt(trainingTime.split(':')[1]);
    const pesajeTime = 10 * 60;

    if (mealTime < trainingTime && trainingMinutes - mealMinutes < 120) {
        return baseRetention * 0.7;
    }
    if (mealTime > trainingTime && mealMinutes - trainingMinutes < 120) {
        return baseRetention * 1.3;
    }
    if (mealMinutes < pesajeTime && pesajeTime - mealMinutes < 120) {
        return baseRetention * 1.2;
    }

    return baseRetention;
}

export function getMealType(mealName, mealTime, dateKey) {
    if (!mealTime) return 'normal';
    const trainingTime = getTrainingTime(dateKey);
    if (!trainingTime) return 'normal';

    const mealMinutes = parseInt(mealTime.split(':')[0]) * 60 + parseInt(mealTime.split(':')[1]);
    const trainingMinutes = parseInt(trainingTime.split(':')[0]) * 60 + parseInt(trainingTime.split(':')[1]);

    if (mealTime < trainingTime && trainingMinutes - mealMinutes < 180) return 'pre-entreno';
    if (mealTime > trainingTime && mealMinutes - trainingMinutes < 180) return 'post-entreno';

    return 'normal';
}

export function calculateNextDayPredictionForDate(dateKey, nextDayWeight = AppState.config.currentWeight) {
    const dayData = AppState.allDays[dateKey];
    let totalKcal = 0, totalCarbs = 0, totalWaterRetention = 0;

    if (dayData) {
        Object.values(dayData.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
                totalCarbs += food.carbs;
                const foodWaterRetention = calculateWaterRetentionWithTiming(food.carbs, food.time, dateKey);
                totalWaterRetention += foodWaterRetention;
            });
        });
    }

    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);
    const calorieTarget = dayInfo.type === 'entreno' ? AppState.config.calsEntrenamiento : AppState.config.calsDescanso;
    const tdee = calculateTDEE(dayInfo.type);

    const deficitVsMeta = totalKcal - calorieTarget;
    const deficitVsTDEE = totalKcal - tdee;
    const fatChange = (deficitVsTDEE / 7700) * 0.75;
    const trainingInflammation = dayInfo.type === 'entreno' ? 0.2 : 0;
    const predictedWeight = parseFloat((nextDayWeight + fatChange + totalWaterRetention + trainingInflammation).toFixed(2));

    const daysTracked = AppState.config.weightHistory?.length || 1;
    let confidenceRange = 0.8;
    if (daysTracked > 28) confidenceRange = 0.4;
    else if (daysTracked > 14) confidenceRange = 0.6;

    return {
        date: dateKey,
        predictedWeight,
        predictedWeightLow: parseFloat((predictedWeight - confidenceRange).toFixed(2)),
        predictedWeightHigh: parseFloat((predictedWeight + confidenceRange).toFixed(2)),
        confidenceRange,
        fatChange: parseFloat(fatChange.toFixed(3)),
        waterRetention: parseFloat(totalWaterRetention.toFixed(2)),
        trainingInflammation,
        totalRetention: parseFloat((totalWaterRetention + trainingInflammation).toFixed(2)),
        caloriesConsumed: Math.round(totalKcal),
        calorieTarget,
        tdee,
        deficitVsMeta: Math.round(deficitVsMeta),
        deficitVsTDEE: Math.round(deficitVsTDEE),
        carbsConsumed: Math.round(totalCarbs),
        confidence: daysTracked > 28 ? 'high' : daysTracked > 14 ? 'medium' : 'low',
    };
}

export function calculateNextDayPrediction() {
    const today = getDateKey(AppState.currentDate);
    let todayWeight = null;

    if (AppState.config.weightHistory && AppState.config.weightHistory.length > 0) {
        const exactWeight = AppState.config.weightHistory.find(w => w.date === today);
        if (exactWeight) todayWeight = exactWeight.weight;
    }

    if (todayWeight === null) return null;

    const pred = calculateNextDayPredictionForDate(today, todayWeight);
    if (!pred) return null;

    return {
        ...pred,
        date: AppState.currentDate.toLocaleDateString('es-ES'),
        explanation: pred.deficitVsTDEE < 0
            ? `Déficit REAL de ${Math.abs(pred.deficitVsTDEE)} kcal vs TDEE (${pred.carbsConsumed}g carbos = ${pred.waterRetention}kg retención)`
            : `Superávit REAL de ${pred.deficitVsTDEE} kcal vs TDEE`,
    };
}

export function updateWeightPrediction() {
    const pred = calculateWeightPrediction();
    const predictionEl = document.getElementById('weightPrediction');
    if (!predictionEl) return;

    if (pred.estimatedDays && pred.weeklyLoss > 0) {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">Proyección de Peso</div>
                <div class="prediction-content">
                    <div class="prediction-stat"><span>Pérdida semanal:</span><strong>${pred.weeklyLoss} kg</strong></div>
                    <div class="prediction-stat"><span>Días para meta:</span><strong>${pred.estimatedDays}</strong></div>
                    <div class="prediction-stat"><span>Fecha estimada:</span><strong>${pred.estimatedDate}</strong></div>
                    <div class="prediction-confidence">(Confianza: ${pred.confidence})</div>
                </div>
            </div>
        `;
    } else {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">Proyección de Peso</div>
                <div class="prediction-content">
                    <small>Registra tu peso regularmente para ver la predicción</small>
                </div>
            </div>
        `;
    }
}

export function displayNextDayPrediction() {
    const nextPred = calculateNextDayPrediction();
    const predictionEl = document.getElementById('nextDayPrediction');
    if (!predictionEl || !nextPred) return;

    const today = getDateKey(AppState.currentDate);
    let todayWeight = null;
    if (AppState.config.weightHistory && AppState.config.weightHistory.length > 0) {
        const exactWeight = AppState.config.weightHistory.find(w => w.date === today);
        if (exactWeight) todayWeight = exactWeight.weight;
    }
    if (todayWeight === null) return;

    const sign = nextPred.deficitVsTDEE < 0 ? '&#8600;' : '&#8599;';
    const weightChange = nextPred.predictedWeight - todayWeight;
    const weightChangeSign = weightChange > 0 ? '+' : '';
    const weightColor = weightChange > 0 ? 'var(--color-red)' : 'var(--primary)';
    const structuralDeficit = nextPred.tdee - nextPred.calorieTarget;

    predictionEl.innerHTML = `
        <div class="next-day-card">
            <div class="prediction-title">Peso estimado mañana &mdash; 10:00 AM</div>
            <div class="next-day-content">
                <div class="next-day-main">
                    <div class="next-day-weight">
                        <div class="weight-label">Estimación</div>
                        <div class="weight-value">${nextPred.predictedWeight} <span style="font-size:1rem;font-weight:500;color:var(--text-2)">kg</span></div>
                        <div class="weight-change" style="color: ${weightColor};">
                            ${sign} ${weightChangeSign}${weightChange.toFixed(2)} kg vs hoy
                        </div>
                    </div>
                </div>
                <div class="next-day-factors">
                    <div class="factor"><span class="factor-label">Calorías consumidas</span><span class="factor-value">${nextPred.caloriesConsumed} kcal</span></div>
                    <div class="factor"><span class="factor-label">Meta calorías</span><span class="factor-value">${nextPred.calorieTarget || '-'} kcal</span></div>
                    <div class="factor"><span class="factor-label">TDEE (gasto)</span><span class="factor-value">${nextPred.tdee || '-'} kcal</span></div>
                    <div class="factor"><span class="factor-label">Déficit vs meta</span><span class="factor-value">${nextPred.deficitVsMeta} kcal</span></div>
                    <div class="factor"><span class="factor-label">Déficit real vs TDEE</span><span class="factor-value">${nextPred.deficitVsTDEE} kcal</span></div>
                    <div class="factor"><span class="factor-label">Déficit diario estructural</span><span class="factor-value">${structuralDeficit} kcal/día</span></div>
                    <div class="factor"><span class="factor-label">Carbohidratos</span><span class="factor-value">${nextPred.carbsConsumed}g</span></div>
                    <div class="factor"><span class="factor-label">${nextPred.fatChange < 0 ? 'Pérdida de grasa' : 'Ganancia de grasa'}</span><span class="factor-value">${Math.abs(nextPred.fatChange).toFixed(2)} kg</span></div>
                    <div class="factor"><span class="factor-label">Retención de agua</span><span class="factor-value">+${nextPred.waterRetention.toFixed(2)} kg</span></div>
                </div>
                <div class="next-day-explanation"><small>${nextPred.explanation}</small></div>
            </div>
        </div>
    `;
}

export function saveDailyWeight() {
    const input = document.getElementById('dailyWeightInput');
    if (!input) return;

    const weight = parseFloat(input.value);
    if (isNaN(weight) || weight <= 0) {
        showNotification('Ingresa un peso válido', 'warning');
        return;
    }

    recordWeight(AppState.currentDate, weight);
    AppState.config.currentWeight = weight;
    localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
    showNotification(`Peso registrado: ${weight}kg`, 'success');

    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
}

export function renderWeightHistory() {
    const container = document.getElementById('weightHistoryContainer');
    if (!container) return;

    if (!AppState.config.weightHistory || AppState.config.weightHistory.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-center py-4">No hay pesos registrados</p>';
        return;
    }

    container.innerHTML = AppState.config.weightHistory
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((entry, index) => {
            const date = new Date(entry.date + 'T00:00:00');
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
            const dayNum = entry.day || (index + 1);
            return `
                <div class="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-primary smooth-transition flex items-center justify-between gap-4">
                    <div class="flex-1">
                        <p class="text-white font-semibold">Día ${dayNum}</p>
                        <p class="text-xs text-slate-400">${dayName}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="number" step="0.1" value="${entry.weight}"
                               class="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-right focus:outline-none focus:border-accent smooth-transition"
                               onchange="window.updateWeightEntry('${entry.date}', this.value)"
                               onkeyup="if(event.key === 'Enter') this.onchange()">
                        <span class="text-slate-400 font-medium">kg</span>
                        <button onclick="window.deleteWeightEntry('${entry.date}')" class="ml-2 p-2 hover:bg-red-600/20 text-red-400 rounded-lg smooth-transition" title="Eliminar">
                            <span class="material-icons text-lg">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
}

export function updateWeightEntry(date, newWeight) {
    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight <= 0) return;

    const index = AppState.config.weightHistory.findIndex(w => w.date === date);
    if (index >= 0) {
        AppState.config.weightHistory[index].weight = weight;
        const prediction = calculateNextDayPredictionForDate(date, weight);
        AppState.config.weightHistory[index].predictedWeight = prediction?.predictedWeight || null;
        saveWeightHistory();
        renderWeightHistory();
        showNotification(`Peso actualizado: ${weight}kg`, 'success');
        import('./config-settings.js').then(m => m.updateHeaderInfo());
        updateWeightPrediction();
        displayNextDayPrediction();
        import('./meals.js').then(m => m.renderDay());
    }
}

export function deleteWeightEntry(date) {
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) return;
    AppState.config.weightHistory = AppState.config.weightHistory.filter(w => w.date !== date);
    saveWeightHistory();
    renderWeightHistory();
    showNotification('Registro eliminado', 'success');
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
}
