// ==================== PREDICCIÓN Y GESTIÓN DE PESO ====================

import AppState from './state.js';
import { KCAL_PER_KG_FAT } from './constants.js';
import { escapeHTML } from './utils.js';
import { getDayType, calculateTDEE, calculateTMR, getDynamicDayTargets, calculateAutoDeficit, clearAdaptiveTDEECache } from './nutrition.js';
import { getWorkoutSessions, recomputeSessionKcal } from './workout.js';
import { getDateKey, saveDays, safeGet, safeSet } from './storage.js';
import { showNotification } from './ui/notifications.js';

export function loadWeightHistory() {
    const saved = localStorage.getItem('weight_history');
    if (saved === null || saved === undefined) {
        AppState.config.weightHistory = [];
        if (AppState.config.startDate && AppState.config.startWeight) {
            AppState.config.weightHistory.push({
                date: getDateKey(AppState.config.startDate),
                weight: AppState.config.startWeight,
                day: 1,
                predictedWeight: null,
            });
            saveWeightHistory();
        }
    } else {
        const parsed = safeGet('weight_history', []);
        AppState.config.weightHistory = Array.isArray(parsed) ? parsed : [];
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
    return safeSet('weight_history', AppState.config.weightHistory || []);
}

export function recordWeight(date, weight) {
    if (!AppState.config.weightHistory) AppState.config.weightHistory = [];
    const dateStr = getDateKey(date);
    const existingIndex = AppState.config.weightHistory.findIndex(w => w.date === dateStr);

    const { getDayNumber } = await_getDayNumber();
    const dayNum = getDayNumber(date);

    const prediction = calculateNextDayPredictionForDate(dateStr, weight);
    const predictedWeight = prediction?.predictedWeight || null;

    // Bayesian: store prediction error if we have yesterday's prediction vs today's actual
    if (AppState.config.weightHistory.length > 0) {
        const yesterdayDate = new Date(date);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayKey = getDateKey(yesterdayDate);
        const yesterdayEntry = AppState.config.weightHistory.find(w => w.date === yesterdayKey);
        if (yesterdayEntry && yesterdayEntry.predictedWeight) {
            storePredictionError(weight, yesterdayEntry.predictedWeight);
        }
    }

    if (existingIndex >= 0) {
        AppState.config.weightHistory[existingIndex].weight = weight;
        AppState.config.weightHistory[existingIndex].predictedWeight = predictedWeight;
    } else {
        AppState.config.weightHistory.push({ date: dateStr, weight, day: dayNum, predictedWeight });
    }

    AppState.config.weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveWeightHistory();
    clearAdaptiveTDEECache();
    // El estimado de la sesión de ese día usaba el peso anterior: recalcular
    try { recomputeSessionKcal(dateStr); } catch (_) { /* sin sesión, nada que hacer */ }
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

function getBayesianCalibration() {
    const cal = safeGet('prediction_calibration', null);
    if (cal && Array.isArray(cal.errors) && cal.errors.length > 5) {
        const recent = cal.errors.slice(-20);
        const meanError = recent.reduce((a, b) => a + b, 0) / recent.length;
        if (Number.isFinite(meanError)) return { meanError, count: recent.length };
    }
    return { meanError: 0, count: 0 };
}

function storePredictionError(actualWeight, predictedWeight) {
    const cal = safeGet('prediction_calibration', null);
    const errors = (cal && Array.isArray(cal.errors) ? cal.errors : []);
    errors.push(actualWeight - predictedWeight);
    safeSet('prediction_calibration', { errors: errors.slice(-60) });
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

// Media de carbos de los últimos 14 días con comida registrada (excluye dateKey).
// Es la basal contra la que se calcula el Δ de retención de glucógeno.
function getCarbBaseline(dateKey) {
    const parts = (dateKey || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return 150;
    const [y, m, d] = parts;
    let sum = 0, n = 0;
    for (let i = 1; i <= 14; i++) {
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - i);
        const day = AppState.allDays[getDateKey(dt)];
        if (!day || !day.meals || typeof day.meals !== 'object') continue;
        let carbs = 0, hasFood = false;
        Object.values(day.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => {
                const c = parseFloat(food && food.carbs);
                if (Number.isFinite(c)) { carbs += c; hasFood = true; }
            });
        });
        if (hasFood) { sum += carbs; n++; }
    }
    if (n === 0) return 150; // fallback: ingesta moderada típica
    return sum / n;
}

function _inflammationForKcal(kcal) {
    if (kcal > 500) return 0.30;
    if (kcal > 300) return 0.20;
    if (kcal > 150) return 0.12;
    if (kcal > 0) return 0.05;
    return 0;
}

// Kcal del entreno de AYER (para el residuo inflamatorio con decaimiento 48h)
function _getYesterdayWorkoutKcal(dateKey) {
    try {
        const parts = (dateKey || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return 0;
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        dt.setDate(dt.getDate() - 1);
        const session = getWorkoutSessions()[getDateKey(dt)];
        const kcal = parseFloat(session && session.estimatedKcal);
        return Number.isFinite(kcal) ? kcal : 0;
    } catch (e) { return 0; }
}

export function calculateNextDayPredictionForDate(dateKey, nextDayWeight = AppState.config.currentWeight) {
    const dayData = AppState.allDays[dateKey];
    let totalKcal = 0, totalCarbs = 0, mealSlots = 0;

    if (dayData && dayData.meals && typeof dayData.meals === 'object') {
        Object.values(dayData.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            // Solo cuenta como comida si aporta macros (agua/café solo no retienen sodio)
            const hasMacros = meal.some(food => {
                food = food || {};
                return (parseFloat(food.kcal) || 0) > 0 || (parseFloat(food.carbs) || 0) > 0 ||
                    (parseFloat(food.protein) || 0) > 0 || (parseFloat(food.fats) || 0) > 0;
            });
            if (hasMacros) mealSlots++;
            meal.forEach(food => {
                const k = parseFloat(food && food.kcal);
                const c = parseFloat(food && food.carbs);
                if (Number.isFinite(k)) totalKcal += k;
                if (Number.isFinite(c)) totalCarbs += c;
            });
        });
    }

    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);

    const dynamic = getDynamicDayTargets(dateKey);
    const calorieTarget = dynamic ? dynamic.cals : 1800;
    const tdee = dynamic ? dynamic.tdee : calculateTDEE(dayInfo.type);
    const workoutKcal = dynamic ? dynamic.workoutKcal : 0;

    const deficitVsMeta = totalKcal - calorieTarget;
    const deficitVsTDEE = totalKcal - tdee;

    // === RETENCIÓN DE AGUA (MODELO Δ vs basal) ===
    // Solo el EXCESO de carbos sobre tu media retiene agua extra; comer tu
    // basal mantiene stores estables (Δ≈0). Clamp ±1.0 kg anti-ruido.
    const carbBaseline = getCarbBaseline(dateKey);
    const glycogenDeltaWater = Math.max(-1.0, Math.min(1.0, ((totalCarbs - carbBaseline) / 1000) * 3));

    // Sodio: ~800mg por franja de comida → ~0.03 kg agua por slot (conservador)
    const sodiumWater = mealSlots * 0.03;

    const finalWaterRetention = glycogenDeltaWater + sodiumWater;

    // === CAMBIO GRASO ===
    // KCAL_PER_KG_FAT ya incluye la composición del tejido adiposo: sin factores extra
    const fatChange = deficitVsTDEE / KCAL_PER_KG_FAT;

    // === INFLAMACIÓN MUSCULAR (con decaimiento 48h) ===
    // Día de entreno: valor completo. Día siguiente sin entreno: residuo ×0.4.
    let trainingInflammation = _inflammationForKcal(workoutKcal);
    if (trainingInflammation === 0) {
        trainingInflammation = _inflammationForKcal(_getYesterdayWorkoutKcal(dateKey)) * 0.4;
    }

    // === CALIBRACIÓN BAYESIANA ===
    const cal = getBayesianCalibration();
    const bayesianAdjustment = cal.count >= 10 ? cal.meanError * 0.3 : 0;

    const predictedWeight = parseFloat((
        nextDayWeight + fatChange + finalWaterRetention + trainingInflammation + bayesianAdjustment
    ).toFixed(2));

    const daysTracked = AppState.config.weightHistory?.length || 1;
    let confidenceRange = 0.8;
    if (daysTracked > 28) confidenceRange = 0.4;
    else if (daysTracked > 14) confidenceRange = 0.6;

    // Reducir rango de confianza si hay calibración bayesiana
    if (cal.count >= 20) confidenceRange *= 0.8;

    return {
        date: dateKey,
        predictedWeight,
        predictedWeightLow: parseFloat((predictedWeight - confidenceRange).toFixed(2)),
        predictedWeightHigh: parseFloat((predictedWeight + confidenceRange).toFixed(2)),
        confidenceRange,
        fatChange: parseFloat(fatChange.toFixed(3)),
        waterRetention: parseFloat(finalWaterRetention.toFixed(2)),
        trainingInflammation,
        totalRetention: parseFloat((finalWaterRetention + trainingInflammation).toFixed(2)),
        caloriesConsumed: Math.round(totalKcal),
        calorieTarget,
        tdee,
        workoutKcal,
        deficitVsMeta: Math.round(deficitVsMeta),
        deficitVsTDEE: Math.round(deficitVsTDEE),
        carbsConsumed: Math.round(totalCarbs),
        carbBaseline: Math.round(carbBaseline),
        mealCount: mealSlots,
        bayesianAdjustment: parseFloat(bayesianAdjustment.toFixed(3)),
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

    const cal = getBayesianCalibration();
    const calNote = cal.count >= 10 ? ` (Bayes: ${cal.meanError > 0 ? '+' : ''}${(cal.meanError * 1000).toFixed(0)}g ajuste)` : '';

    return {
        ...pred,
        todayWeight,
        date: AppState.currentDate.toLocaleDateString('es-ES'),
        explanation: pred.deficitVsTDEE < 0
            ? `Déficit REAL de ${Math.abs(pred.deficitVsTDEE)} kcal vs TDEE (${pred.carbsConsumed}g carbos vs basal ${pred.carbBaseline}g = ${pred.waterRetention.toFixed(2)}kg retención)${calNote}`
            : `Superávit REAL de ${pred.deficitVsTDEE} kcal vs TDEE${calNote}`,
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

    const todayWeight = nextPred.todayWeight;
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
                    <div class="factor"><span class="factor-label">TDEE (gasto total)</span><span class="factor-value">${nextPred.tdee || '-'} kcal</span></div>
                    ${nextPred.workoutKcal > 0 ? `<div class="factor"><span class="factor-label">↳ Entreno registrado</span><span class="factor-value">+${nextPred.workoutKcal} kcal</span></div>` : ''}
                    <div class="factor"><span class="factor-label">Déficit vs meta</span><span class="factor-value">${nextPred.deficitVsMeta} kcal</span></div>
                    <div class="factor"><span class="factor-label">Déficit real vs TDEE</span><span class="factor-value">${nextPred.deficitVsTDEE} kcal</span></div>
                    <div class="factor"><span class="factor-label">Déficit diario estructural</span><span class="factor-value">${structuralDeficit} kcal/día</span></div>
                    <div class="factor"><span class="factor-label">Carbohidratos</span><span class="factor-value">${nextPred.carbsConsumed}g</span></div>
                    <div class="factor"><span class="factor-label">Comidas</span><span class="factor-value">${nextPred.mealCount || '-'}</span></div>
                    <div class="factor"><span class="factor-label">${nextPred.fatChange < 0 ? 'Pérdida de grasa' : 'Ganancia de grasa'}</span><span class="factor-value">${Math.abs(nextPred.fatChange).toFixed(2)} kg</span></div>
                    <div class="factor"><span class="factor-label">Retención agua (glucógeno+sodio)</span><span class="factor-value">+${nextPred.waterRetention.toFixed(2)} kg</span></div>
                    ${nextPred.bayesianAdjustment !== 0 ? `<div class="factor"><span class="factor-label">↳ Ajuste Bayes</span><span class="factor-value">${nextPred.bayesianAdjustment > 0 ? '+' : ''}${(nextPred.bayesianAdjustment * 1000).toFixed(0)}g</span></div>` : ''}
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

    // Recalcular proteína y déficit automático con el nuevo peso
    const pace = AppState.config.lossPace || 'moderado';
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    AppState.config.deficitTarget = calculateAutoDeficit(weight, pace);
    AppState.config.proteinGoal = Math.round(weight * pFactor);

    safeSet('nutrition_config', AppState.config);
    showNotification(`Peso registrado: ${weight}kg`, 'success');

    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
    import('./stats.js').then(m => m.updateGoalsDisplay());
    import('./charts.js').then(m => m.renderWeightPredictionChart());
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
                               onchange="window.updateWeightEntry('${escapeHTML(entry.date)}', this.value)"
                               onkeyup="if(event.key === 'Enter') this.onchange()">
                        <span class="text-slate-400 font-medium">kg</span>
                        <button onclick="window.deleteWeightEntry('${escapeHTML(entry.date)}')" class="ml-2 p-2 hover:bg-red-600/20 text-red-400 rounded-lg smooth-transition" title="Eliminar">
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
        clearAdaptiveTDEECache();
        // Sync currentWeight if editing today's entry
        const todayKey = getDateKey(new Date());
        if (date === todayKey) {
            AppState.config.currentWeight = weight;
            const pace = AppState.config.lossPace || 'moderado';
            const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
            AppState.config.deficitTarget = calculateAutoDeficit(weight, pace);
            AppState.config.proteinGoal = Math.round(weight * pFactor);
            safeSet('nutrition_config', AppState.config);
        }
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
    clearAdaptiveTDEECache();
    // Sync currentWeight if deleting today's entry
    const todayKey = getDateKey(new Date());
    if (date === todayKey) {
        const lastEntry = AppState.config.weightHistory.length > 0
            ? AppState.config.weightHistory[AppState.config.weightHistory.length - 1]
            : null;
        AppState.config.currentWeight = lastEntry ? lastEntry.weight : null;
        if (AppState.config.currentWeight) {
            const pace = AppState.config.lossPace || 'moderado';
            const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
            AppState.config.deficitTarget = calculateAutoDeficit(AppState.config.currentWeight, pace);
            AppState.config.proteinGoal = Math.round(AppState.config.currentWeight * pFactor);
        }
        safeSet('nutrition_config', AppState.config);
    }
    renderWeightHistory();
    showNotification('Registro eliminado', 'success');
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
}
