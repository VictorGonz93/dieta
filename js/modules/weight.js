// ==================== PREDICCIÓN Y GESTIÓN DE PESO ====================

import AppState from './state.js';
import { KCAL_PER_KG_FAT } from './constants.js';
import { escapeHTML, num } from './utils.js';
import { getDayNumber, getDayType, calculateTDEE, calculateTMR, getDynamicDayTargets, calculateAutoDeficit, calculateAutoSurplus, clearAdaptiveTDEECache, calculateRobustWeightTrend } from './nutrition.js';
import { getWorkoutSessions, recomputeSessionKcal } from './workout.js';
import { getDateKey, saveDays, safeGet, safeSet, _sanitizeWeightHistory } from './storage.js';
import { showNotification } from './ui/notifications.js';

const MIN_WEIGHT_KG = 25;
const MAX_WEIGHT_KG = 350;

function _todayKey() {
    return getDateKey(new Date());
}

// new Date('2026-02-30') no falla: JS la desborda al 2 de marzo. Para las
// claves de día exigimos que la fecha exista de verdad.
function _parseDateKeyStrict(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
}

// Suma días por UTC y devuelve una fecha local a medianoche: con setDate, un
// rango que cruza el cambio de hora podía devolver el día anterior/siguiente.
function _datePlusDays(base, days) {
    const utc = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + days);
    const d = new Date(utc);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function _latestWeightEntry() {
    const history = Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory : [];
    let latest = null;
    history.forEach(entry => {
        if (!entry || typeof entry.date !== 'string') return;
        const w = parseFloat(entry.weight);
        if (!Number.isFinite(w) || w < MIN_WEIGHT_KG || w > MAX_WEIGHT_KG) return;
        if (!latest || entry.date > latest.date) latest = entry;
    });
    return latest;
}

function _recalculateWeightTargets(weight) {
    if (!Number.isFinite(weight)) return;
    const pace = AppState.config.lossPace || 'moderado';
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    AppState.config.deficitTarget = calculateAutoDeficit(weight, pace);
    AppState.config.surplusTarget = calculateAutoSurplus(weight, AppState.config.gainPace || 'lento');
    AppState.config.proteinGoal = Math.round(weight * pFactor);
}

// currentWeight SIEMPRE se deriva del pesaje válido más reciente por fecha.
// Editar o borrar un peso antiguo ya no pisa el peso actual.
function _syncCurrentWeightFromHistory() {
    const latest = _latestWeightEntry();
    if (!latest) return false;
    const previous = AppState.config.currentWeight;
    const changed = parseFloat(previous) !== latest.weight;
    AppState.config.currentWeight = latest.weight;
    if (changed) {
        _recalculateWeightTargets(latest.weight);
        safeSet('nutrition_config', AppState.config);
    }
    return changed;
}

export function loadWeightHistory() {
    const saved = localStorage.getItem('weight_history');
    const configHistory = Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory : null;
    let source = null;

    if (saved !== null && saved !== undefined) {
        const parsed = safeGet('weight_history', null);
        source = Array.isArray(parsed) ? parsed : [];
    } else if (configHistory && configHistory.length > 0) {
        // Compatibilidad: backups antiguos solo tenían config.weightHistory
        source = configHistory;
    }

    if (source === null) {
        AppState.config.weightHistory = [];
        if (AppState.config.startDate && Number.isFinite(AppState.config.startWeight)
            && AppState.config.startWeight >= MIN_WEIGHT_KG && AppState.config.startWeight <= MAX_WEIGHT_KG) {
            AppState.config.weightHistory.push({
                date: getDateKey(new Date(AppState.config.startDate)),
                weight: AppState.config.startWeight,
                day: 1,
                predictedWeight: null,
            });
            saveWeightHistory();
        }
        return;
    }

    const { clean, dropped } = _sanitizeWeightHistory(source);
    if (dropped > 0) console.warn(`[Weight History] ${dropped} entrada(s) inválidas descartadas`);
    AppState.config.weightHistory = clean;

    let migratedCount = 0;
    AppState.config.weightHistory.forEach((entry) => {
        if (entry.predictedWeight === undefined || entry.predictedWeight === null) {
            const prediction = calculateNextDayPredictionForDate(entry.date, entry.weight);
            const predicted = prediction?.predictedWeight;
            if (predicted !== undefined) {
                entry.predictedWeight = predicted;
                migratedCount++;
            }
        }
    });
    if (migratedCount > 0) {
        console.log(`[Weight History] Migrated ${migratedCount} entries with predicted weights`);
        saveWeightHistory();
    }

    // Solo derivar currentWeight si ya existía historial real (no en el alta
    // inicial, donde currentWeight puede diferir de startWeight).
    if (clean.length > 0) _syncCurrentWeightFromHistory();
}

export function saveWeightHistory() {
    return safeSet('weight_history', AppState.config.weightHistory || []);
}

export function recordWeight(date, weight) {
    let dt;
    if (date instanceof Date) dt = new Date(date.getTime());
    else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) dt = _parseDateKeyStrict(date);
    else dt = new Date(date);
    if (!dt || Number.isNaN(dt.getTime())) {
        showNotification('Fecha de pesaje no válida', 'warning');
        return false;
    }
    const dateStr = getDateKey(dt);
    if (dateStr > _todayKey()) {
        showNotification('No puedes registrar un peso con fecha futura', 'warning');
        return false;
    }
    const w = typeof weight === 'number' ? weight : parseFloat(weight);
    if (!Number.isFinite(w) || w < MIN_WEIGHT_KG || w > MAX_WEIGHT_KG) {
        showNotification(`El peso debe estar entre ${MIN_WEIGHT_KG} y ${MAX_WEIGHT_KG} kg`, 'warning');
        return false;
    }

    if (!Array.isArray(AppState.config.weightHistory)) AppState.config.weightHistory = [];
    const existingIndex = AppState.config.weightHistory.findIndex(entry => entry.date === dateStr);

    const dayNum = getDayNumber(dt);
    const prediction = calculateNextDayPredictionForDate(dateStr, w);
    const predictedWeight = prediction?.predictedWeight ?? null;

    // Bayesian: store prediction error if we have yesterday's prediction vs today's actual
    if (AppState.config.weightHistory.length > 0) {
        const yesterdayDate = new Date(dt);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayKey = getDateKey(yesterdayDate);
        const yesterdayEntry = AppState.config.weightHistory.find(entry => entry.date === yesterdayKey);
        if (yesterdayEntry && yesterdayEntry.predictedWeight) {
            storePredictionError(w, yesterdayEntry.predictedWeight);
        }
    }

    if (existingIndex >= 0) {
        AppState.config.weightHistory[existingIndex] = {
            ...AppState.config.weightHistory[existingIndex],
            date: dateStr,
            weight: w,
            day: dayNum || AppState.config.weightHistory[existingIndex].day,
            predictedWeight,
        };
    } else {
        AppState.config.weightHistory.push({ date: dateStr, weight: w, day: dayNum, predictedWeight });
    }

    AppState.config.weightHistory.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!saveWeightHistory()) return false;
    _syncCurrentWeightFromHistory();
    clearAdaptiveTDEECache();
    // El estimado de la sesión de ese día usaba el peso anterior: recalcular
    try { recomputeSessionKcal(dateStr); } catch (_) { /* sin sesión, nada que hacer */ }
    return true;
}

export function calculateWeightPrediction() {
    const empty = { estimatedDays: null, estimatedDate: null, weeklyLoss: null, weeklyGain: null, confidence: 'low' };
    const history = (Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory : [])
        .filter(e => e && typeof e.date === 'string')
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (history.length < 2) return empty;

    // Misma ventana que el TDEE adaptativo (28 pesajes). La tendencia se ajusta
    // con Theil-Sen + limpieza MAD: un pico aislado de agua ya no cambia el ETA.
    const trend = calculateRobustWeightTrend(history.slice(-28));
    if (!trend) return empty;

    const weeklyLoss = -trend.slope * 7; // + pierde, - gana
    const weeklyGain = trend.slope * 7;
    const target = parseFloat(AppState.config.targetWeight);
    if (!Number.isFinite(target)) return empty;

    // Base robusta: peso suavizado en el último pesaje. Evita que el último
    // registro (comida salada, sesión dura) fije toda la proyección.
    const baseline = trend.fittedLastWeight;
    if (!Number.isFinite(baseline) || !Number.isFinite(weeklyLoss)) return empty;

    const goalPhase = AppState.config.goalPhase || 'definicion';
    const actualCurrent = parseFloat(AppState.config.currentWeight);
    const current = Number.isFinite(actualCurrent) ? actualCurrent : trend.lastActualWeight;

    // Confianza por calidad del ajuste, no solo por tamaño del histórico.
    const cleanPoints = trend.pointsUsed >= Math.ceil(trend.pointsTotal * 0.8);
    const confidence = trend.pointsUsed >= 14 && trend.spanDays >= 21 && cleanPoints
        ? 'high'
        : trend.pointsUsed >= 7 && trend.spanDays >= 7
            ? 'medium'
            : 'low';
    const base = {
        weeklyLoss: weeklyLoss.toFixed(2),
        weeklyGain: weeklyGain.toFixed(2),
        confidence,
        baselineWeight: Math.round(baseline * 100) / 100,
        pointsUsed: trend.pointsUsed,
        pointsTotal: trend.pointsTotal,
        spanDays: trend.spanDays,
    };

    // Mantenimiento: no hay fecha de llegada que calcular. Devolver la tasa
    // observada sin ETA evita "días hasta meta" absurdos.
    if (goalPhase === 'mantenimiento') {
        return { ...base, estimatedDays: null, estimatedDate: null };
    }

    // Volumen (o target por encima del actual): ETA por ritmo de ganancia.
    if ((goalPhase === 'volumen' || target > current) && target > current && weeklyGain > 0 && target > baseline) {
        const remaining = target - baseline;
        const estimatedDays = Math.ceil((remaining / weeklyGain) * 7);
        const estimatedDate = _datePlusDays(new Date(), estimatedDays);
        return {
            ...base,
            estimatedDays,
            estimatedDate: estimatedDate.toLocaleDateString('es-ES'),
        };
    }

    const remainingWeight = baseline - target;

    if (weeklyLoss <= 0 || remainingWeight <= 0 || current <= target) {
        return { ...base, estimatedDays: null, estimatedDate: null, confidence: weeklyLoss > 0 ? confidence : 'low' };
    }

    const estimatedDays = Math.ceil((remainingWeight / weeklyLoss) * 7);
    const estimatedDate = _datePlusDays(new Date(), estimatedDays);

    return {
        ...base,
        estimatedDays,
        estimatedDate: estimatedDate.toLocaleDateString('es-ES'),
        weeklyLoss: Math.abs(weeklyLoss).toFixed(2),
    };
}

export function getWeightTrendData() {
    if (!AppState.config.weightHistory || AppState.config.weightHistory.length === 0) return [];
    const startWeight = parseFloat(AppState.config.startWeight);
    const phase = AppState.config.goalPhase || 'definicion';
    const rate = parseFloat(AppState.config.surplusTarget ?? AppState.config.deficitTarget);
    // Línea teórica coherente con la fase: en volumen sube al ritmo del
    // superávit, en definición baja al del déficit. Antes bajaba 0,3 kg/día
    // siempre, incluso en volumen (mentira visual en el gráfico).
    const dailyChange = Number.isFinite(rate) && Number.isFinite(startWeight)
        ? (phase === 'volumen' ? Math.abs(rate) : phase === 'mantenimiento' ? 0 : -Math.abs(rate)) / KCAL_PER_KG_FAT
        : 0;
    return AppState.config.weightHistory.map((w, index) => {
        const weight = parseFloat(w.weight);
        const day = parseFloat(w.day);
        const dayNum = Number.isFinite(day) && day > 0 ? day : index + 1;
        return {
            day: dayNum,
            date: w.date,
            actual: Number.isFinite(weight) ? weight : null,
            theoretical: Number.isFinite(startWeight)
                ? Math.round((startWeight + (dayNum - 1) * dailyChange) * 100) / 100
                : null,
        };
    });
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

// Kcal del entreno de AYER (para el residuo inflamatorio con decaimiento 48h).
// Solo sesiones finalizadas: un borrador no es actividad realizada.
function _getYesterdayWorkoutKcal(dateKey) {
    try {
        const parts = (dateKey || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return 0;
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        dt.setDate(dt.getDate() - 1);
        const session = getWorkoutSessions()[getDateKey(dt)];
        if (!session || session.finalized === false || !Array.isArray(session.exercises)
            || session.exercises.length === 0) return 0;
        const kcal = parseFloat(session.estimatedKcal);
        return Number.isFinite(kcal) ? Math.min(20000, Math.max(0, kcal)) : 0;
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

    // Sin comida registrada no hay predicción fiable: devolver 0 kcal de déficit
    // hacía que el peso "predicho" fuese casi el de hoy y contaminaba la
    // calibración bayesiana con errores falsos.
    if (mealSlots === 0) return null;

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
        goalPhase: AppState.config.goalPhase || 'definicion',
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

    const goalPhase = AppState.config.goalPhase || 'definicion';
    const isBulk = goalPhase === 'volumen';
    const isMaintenance = goalPhase === 'mantenimiento';
    const rateValue = isBulk ? pred.weeklyGain : pred.weeklyLoss;
    const rateLabel = isBulk ? 'Ganancia semanal:' : 'Pérdida semanal:';
    if (isMaintenance && Number.isFinite(parseFloat(pred.weeklyGain))) {
        // En mantenimiento no hay meta de peso que alcanzar: mostrar la
        // tendencia observada y "Mantener" evita un ETA inventado.
        const weeklyChange = parseFloat(pred.weeklyGain);
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">Proyección de Peso</div>
                <div class="prediction-content">
                    <div class="prediction-stat"><span>Tendencia semanal:</span><strong>${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(2)} kg</strong></div>
                    <div class="prediction-stat"><span>ETA:</span><strong>Mantener</strong></div>
                    <div class="prediction-confidence">(Confianza: ${pred.confidence} · ${pred.pointsUsed}/${pred.pointsTotal} pesajes)</div>
                </div>
            </div>
        `;
    } else if (pred.estimatedDays && parseFloat(rateValue) > 0) {
        predictionEl.innerHTML = `
            <div class="prediction-card">
                <div class="prediction-title">Proyección de Peso</div>
                <div class="prediction-content">
                    <div class="prediction-stat"><span>${rateLabel}</span><strong>${parseFloat(rateValue).toFixed(2)} kg</strong></div>
                    <div class="prediction-stat"><span>Días para meta:</span><strong>${pred.estimatedDays}</strong></div>
                    <div class="prediction-stat"><span>Fecha estimada:</span><strong>${pred.estimatedDate}</strong></div>
                    <div class="prediction-confidence">(Confianza: ${pred.confidence} · ${pred.pointsUsed}/${pred.pointsTotal} pesajes)</div>
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
    const isBulkPhase = (nextPred.goalPhase || 'definicion') === 'volumen';
    const structuralLabel = isBulkPhase ? 'Superávit diario estructural' : 'Déficit diario estructural';
    const structuralValue = isBulkPhase ? -structuralDeficit : structuralDeficit;

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
                    <div class="factor"><span class="factor-label">${structuralLabel}</span><span class="factor-value">${structuralValue} kcal/día</span></div>
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

    const raw = parseFloat(input.value);
    if (!Number.isFinite(raw)) {
        showNotification('Ingresa un peso válido', 'warning');
        return;
    }
    const weight = Math.round(raw * 100) / 100;
    // recordWeight valida rango, fecha futura, persiste, deriva currentWeight
    // desde el último pesaje y recalcula metas. Antes esta función duplicaba la
    // lógica y podía dejar currentWeight distinto al historial.
    const date = AppState.currentDate instanceof Date ? AppState.currentDate : new Date();
    if (!recordWeight(date, weight)) return;

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

    // Copia antes de ordenar: render no debe reordenar el estado en memoria.
    container.innerHTML = [...AppState.config.weightHistory]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((entry, index) => {
            const date = new Date(`${entry.date}T00:00:00`);
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
            const dayNum = num(entry.day, index + 1);
            const dateKey = escapeHTML(String(entry.date || ''));
            return `
                <div class="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-primary smooth-transition flex items-center justify-between gap-4">
                    <div class="flex-1">
                        <p class="text-white font-semibold">Día ${dayNum}</p>
                        <p class="text-xs text-slate-400">${escapeHTML(dayName)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="number" step="0.1" value="${num(entry.weight)}"
                               class="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-right focus:outline-none focus:border-accent smooth-transition"
                               data-date="${dateKey}"
                               onchange="window.updateWeightEntry(this.dataset.date, this.value)"
                               onkeyup="if(event.key === 'Enter') this.onchange()">
                        <span class="text-slate-400 font-medium">kg</span>
                        <button data-date="${dateKey}" onclick="window.deleteWeightEntry(this.dataset.date)" class="ml-2 p-2 hover:bg-red-600/20 text-red-400 rounded-lg smooth-transition" title="Eliminar">
                            <span class="material-icons text-lg">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
}

export function updateWeightEntry(date, newWeight) {
    const key = String(date || '');
    const weight = typeof newWeight === 'number' ? newWeight : parseFloat(newWeight);
    if (!_parseDateKeyStrict(key)) {
        showNotification('Fecha de pesaje no válida', 'warning');
        return false;
    }
    if (key > _todayKey()) {
        showNotification('No puedes editar un pesaje con fecha futura', 'warning');
        return false;
    }
    if (!Number.isFinite(weight) || weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
        showNotification(`El peso debe estar entre ${MIN_WEIGHT_KG} y ${MAX_WEIGHT_KG} kg`, 'warning');
        return false;
    }

    if (!Array.isArray(AppState.config.weightHistory)) AppState.config.weightHistory = [];
    const index = AppState.config.weightHistory.findIndex(w => w.date === key);
    if (index < 0) return false;

    const entry = AppState.config.weightHistory[index];
    entry.weight = Math.round(weight * 100) / 100;
    entry.day = entry.day || getDayNumber(new Date(`${key}T00:00:00`));
    const prediction = calculateNextDayPredictionForDate(key, entry.weight);
    entry.predictedWeight = prediction?.predictedWeight ?? null;
    AppState.config.weightHistory.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!saveWeightHistory()) return false;
    // El peso actual SIEMPRE sale del pesaje más reciente, no del editado.
    _syncCurrentWeightFromHistory();
    clearAdaptiveTDEECache();
    try { recomputeSessionKcal(key); } catch (_) { /* sin sesión */ }

    renderWeightHistory();
    showNotification(`Peso actualizado: ${entry.weight}kg`, 'success');
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
    import('./stats.js').then(m => m.updateGoalsDisplay());
    import('./charts.js').then(m => m.renderWeightPredictionChart());
    return true;
}

export function deleteWeightEntry(date) {
    const key = String(date || '');
    if (!_parseDateKeyStrict(key)) return false;
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) return false;
    if (!Array.isArray(AppState.config.weightHistory)) return false;
    const before = AppState.config.weightHistory.length;
    AppState.config.weightHistory = AppState.config.weightHistory.filter(w => w.date !== key);
    if (AppState.config.weightHistory.length === before) return false;
    if (!saveWeightHistory()) return false;
    // Si se borra el último pesaje, currentWeight conserva el valor actual:
    // no hay dato del que derivarlo y poner null rompería TDEE/objetivos.
    _syncCurrentWeightFromHistory();
    clearAdaptiveTDEECache();
    try { recomputeSessionKcal(key); } catch (_) { /* sin sesión */ }
    renderWeightHistory();
    showNotification('Registro eliminado', 'success');
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    updateWeightPrediction();
    displayNextDayPrediction();
    import('./meals.js').then(m => m.renderDay());
    import('./stats.js').then(m => m.updateGoalsDisplay());
    import('./charts.js').then(m => m.renderWeightPredictionChart());
    return true;
}
