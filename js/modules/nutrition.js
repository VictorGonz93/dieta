// ==================== NUTRICIÓN Y CÁLCULOS ====================

import AppState from './state.js';
import { GYM_ROUTINE, UNIT_CONVERSIONS } from './constants.js';
import { estimateWorkoutKcal } from './workout.js';

export function getDayNumber(date) {
    if (!AppState.config.startDate) return 0;
    const start = new Date(AppState.config.startDate);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

export function getDayType(date) {
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = daysOfWeek[date.getDay()];
    const routine = AppState.config.customGymRoutine || GYM_ROUTINE;
    return routine[dayName] || { type: 'descanso', label: 'Descanso', templateId: '' };
}

export function getCalorieTarget() {
    const dateKey = AppState.currentDate ? AppState.currentDate.toISOString().split('T')[0] : '';
    const dynamic = getDynamicDayTargets(dateKey);
    if (dynamic) return dynamic.cals;
    return AppState.config.calsDescanso || 1800;
}

export function getTDEE() {
    const dateKey = AppState.currentDate ? AppState.currentDate.toISOString().split('T')[0] : '';
    const dynamic = getDynamicDayTargets(dateKey);
    if (dynamic) return dynamic.tdee;
    return calculateTDEE('descanso');
}

export function getCurrentDeficit() {
    return getTDEE() - getCalorieTarget();
}

export function calculateTMR() {
    const { currentWeight, height, age, gender } = AppState.config;
    const w = parseFloat(currentWeight) || 75;
    const h = parseFloat(height) || 170;
    const a = parseFloat(age) || 30;
    const g = gender || 'male';

    if (g === 'male') {
        return (10 * w) + (6.25 * h) - (5 * a) + 5;
    } else {
        return (10 * w) + (6.25 * h) - (5 * a) - 161;
    }
}

export function calculateTDEE(dayType) {
    const tmr = calculateTMR();
    const factor = dayType === 'entreno' ? 1.50 : 1.25;
    return Math.round(tmr * factor);
}

// ─── TDEE Adaptativo con caché por día ────────────────────────────────────────
// Cada día "congela" su TDEE basado SOLO en datos disponibles hasta esa fecha.
// Esto evita que entrar un peso hoy cambie los objetivos de ayer.

const _adaptiveTDEECache = new Map();

export function clearAdaptiveTDEECache() {
    _adaptiveTDEECache.clear();
}

function _getWorkoutKcalForDate(dateKey, sessions) {
    try {
        const session = sessions[dateKey];
        if (session && session.exercises && session.exercises.length > 0) {
            return session.estimatedKcal || 0;
        }
    } catch {}
    return 0;
}

function _sumDayKcal(dateKey) {
    const dayData = AppState.allDays[dateKey];
    if (!dayData || !dayData.meals) return 0;
    let total = 0;
    Object.values(dayData.meals).forEach(meal => {
        meal.forEach(food => { total += food.kcal; });
    });
    return total;
}

function _getFormulaTMR(weightKg) {
    const { height, age, gender } = AppState.config;
    const w = parseFloat(weightKg) || 75;
    const h = parseFloat(height) || 170;
    const a = parseFloat(age) || 30;
    const g = gender || 'male';
    return g === 'male'
        ? (10 * w) + (6.25 * h) - (5 * a) + 5
        : (10 * w) + (6.25 * h) - (5 * a) - 161;
}

/**
 * Calcula el TDEE adaptativo para una fecha específica.
 * Solo usa datos de peso Y comida de FECHAS ANTERIORES a dateKey.
 * Resultados cacheados — llamar clearAdaptiveTDEECache() al modificar peso.
 *
 * @param {string} dateKey - Fecha objetivo (YYYY-MM-DD)
 * @returns {{ tdee, confidence, daysUsed, formulaTDEE, avgWorkoutPerDay, ... }}
 */
export function calculateAdaptiveTDEEForDate(dateKey) {
    if (_adaptiveTDEECache.has(dateKey)) {
        return _adaptiveTDEECache.get(dateKey);
    }

    const weightHistory = AppState.config.weightHistory || [];

    // Solo usar entradas de peso ANTERIORES a dateKey (excluir el día objetivo)
    const historicalWeights = weightHistory.filter(w => w.date < dateKey);

    // BUG FIX 1: formulaTDEE usa el peso más reciente del histórico, no el actual
    const lastHistoricalWeight = historicalWeights.length > 0
        ? historicalWeights[historicalWeights.length - 1].weight
        : AppState.config.currentWeight;
    const formulaTDEE = Math.round(_getFormulaTMR(lastHistoricalWeight) * 1.25);

    if (historicalWeights.length < 14) {
        const result = { tdee: formulaTDEE, confidence: 'none', daysUsed: 0, formulaTDEE, avgWorkoutPerDay: 0 };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    let sessions = {};
    try { sessions = JSON.parse(localStorage.getItem('workoutSessions') || '{}'); } catch {}

    const windowSize = Math.min(21, historicalWeights.length);
    const window = historicalWeights.slice(-windowSize);

    let totalCalories = 0;
    let validDays = 0;
    let validWorkoutKcal = 0;

    for (const entry of window) {
        const dayKcal = _sumDayKcal(entry.date);
        if (dayKcal > 500) {
            totalCalories += dayKcal;
            validDays++;
            // BUG FIX 2: solo contar workout de días válidos (con comida registrada)
            validWorkoutKcal += _getWorkoutKcalForDate(entry.date, sessions);
        }
    }

    const avgWorkoutPerDay = validDays > 0 ? validWorkoutKcal / validDays : 0;

    // BUG FIX 2b: fallback con validDays < 10 no debe restar workouts del TDEE fórmula
    if (validDays < 10) {
        const result = { tdee: formulaTDEE, confidence: 'low', daysUsed: validDays, formulaTDEE, avgWorkoutPerDay: 0 };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    // Calcular cambio de peso: primer vs último en la ventana
    const firstWeight = window[0].weight;
    const lastWeight = window[window.length - 1].weight;
    const weightChangeKg = firstWeight - lastWeight;

    const firstDate = new Date(window[0].date);
    const lastDate = new Date(window[window.length - 1].date);
    const daysBetween = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));

    const avgDailyCalories = totalCalories / validDays;
    const adaptiveTDEE = avgDailyCalories + (weightChangeKg * 7700 / daysBetween);

    // Safety cap: ±300 (más conservador que ±500)
    const CAP = 300;
    const cappedTDEE = Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, adaptiveTDEE));

    // EMA de 7 días (si hay suficientes datos)
    const recent7 = historicalWeights.slice(-7);
    if (recent7.length >= 7) {
        let r7Calories = 0;
        let r7Days = 0;
        for (const entry of recent7) {
            const dayKcal = _sumDayKcal(entry.date);
            if (dayKcal > 500) { r7Calories += dayKcal; r7Days++; }
        }
        if (r7Days >= 5) {
            const r7W0 = recent7[0].weight;
            const r7W1 = recent7[recent7.length - 1].weight;
            const r7DaysSpan = Math.max(1, (new Date(recent7[recent7.length - 1].date) - new Date(recent7[0].date)) / (1000 * 60 * 60 * 24));
            const r7AvgCals = r7Calories / r7Days;
            const r7TDEE = r7AvgCals + ((r7W0 - r7W1) * 7700 / r7DaysSpan);
            const r7Capped = Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, r7TDEE));

            // EMA: 0.85 reciente / 0.15 histórico
            const smoothedTDEE = r7Capped * 0.85 + cappedTDEE * 0.15;

            let confidence = 'medium';
            if (windowSize >= 21 && validDays >= 18) confidence = 'high';
            else if (windowSize >= 14 && validDays >= 12) confidence = 'medium';
            else confidence = 'low';

            const result = {
                tdee: Math.round(smoothedTDEE),
                confidence,
                daysUsed: validDays,
                formulaTDEE,
                rawAdaptive: Math.round(adaptiveTDEE),
                smoothedAdaptive: Math.round(smoothedTDEE),
                avgWorkoutPerDay,
            };
            _adaptiveTDEECache.set(dateKey, result);
            return result;
        }
    }

    let confidence = 'low';
    if (windowSize >= 14 && validDays >= 12) confidence = 'medium';

    const result = {
        tdee: Math.round(cappedTDEE),
        confidence,
        daysUsed: validDays,
        formulaTDEE,
        rawAdaptive: Math.round(adaptiveTDEE),
        smoothedAdaptive: Math.round(cappedTDEE),
        avgWorkoutPerDay,
    };
    _adaptiveTDEECache.set(dateKey, result);
    return result;
}

/**
 * Wrapper legacy: calcula TDEE adaptativo usando TODOS los datos actuales.
 * Solo se usa para la tarjeta informativa en Ajustes.
 */
export function calculateAdaptiveTDEE() {
    const today = new Date().toISOString().split('T')[0];
    // Usar el día actual + 1 para incluir todos los datos en la ventana
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split('T')[0];
    return calculateAdaptiveTDEEForDate(tomorrowKey);
}

/**
 * Calcula el déficit calórico diario óptimo automáticamente según el peso corporal
 * y el ritmo de pérdida elegido (suave, moderado, intenso o manual).
 */
export function calculateAutoDeficit(weight = null, lossPace = null) {
    const w = parseFloat(weight || AppState.config.currentWeight) || 75;
    const pace = lossPace || AppState.config.lossPace || 'moderado';

    if (pace === 'suave') {
        // ~0.5% del peso corporal por semana
        const weeklyLossKg = w * 0.005;
        return Math.round((weeklyLossKg * 7700) / 7);
    } else if (pace === 'moderado') {
        // ~0.75% del peso corporal por semana (Recomendado)
        const weeklyLossKg = w * 0.0075;
        return Math.round((weeklyLossKg * 7700) / 7);
    } else if (pace === 'intenso') {
        // ~1.0% del peso corporal por semana
        const weeklyLossKg = w * 0.010;
        return Math.round((weeklyLossKg * 7700) / 7);
    } else if (pace === 'manual') {
        return AppState.config.deficitTarget || 500;
    }

    const weeklyLossKg = w * 0.0075;
    return Math.round((weeklyLossKg * 7700) / 7);
}

// ─── Targets dinámicos diarios ────────────────────────────────────────────────
// Cada día usa SOLO datos disponibles hasta esa fecha.
// TDEE adaptativo congelado por día — no cambia al navegar al pasado.
export function getDynamicDayTargets(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);

    // Peso específico del día (si existe) — para TMR y macros
    const historyEntry = AppState.config.weightHistory?.find(w => w.date === dateKey);
    const dayWeight = historyEntry?.weight || AppState.config.currentWeight || 75;

    // TMR con peso del día (no el peso actual)
    const tmr = _getFormulaTMR(dayWeight);
    if (!tmr) return null;

    let workoutKcal = 0;
    let isRealLoggedSession = false;

    try {
        const sessions = JSON.parse(localStorage.getItem('workoutSessions') || '{}');
        const session = sessions[dateKey];

        if (session && session.exercises && session.exercises.length > 0) {
            workoutKcal = session.estimatedKcal || estimateWorkoutKcal(session) || 0;
            isRealLoggedSession = true;
        } else if (dayInfo.templateId) {
            const templates = JSON.parse(localStorage.getItem('workoutTemplates') || '{}');
            const tmpl = templates[dayInfo.templateId];
            if (tmpl && tmpl.exercises && tmpl.exercises.length > 0) {
                workoutKcal = estimateWorkoutKcal({ date: dateKey, exercises: tmpl.exercises, duration: 60 });
            }
        }
    } catch { workoutKcal = 0; }

    // TDEE Base: adaptativo congelado o fórmula
    const tdeeMode = AppState.config.tdeeMode || 'formula';
    let tdeeBase;
    let adaptiveResult = null;
    if (tdeeMode === 'adaptive') {
        adaptiveResult = calculateAdaptiveTDEEForDate(dateKey);
        if (adaptiveResult.confidence !== 'none') {
            tdeeBase = Math.round(adaptiveResult.tdee - (adaptiveResult.avgWorkoutPerDay || 0));
        } else {
            tdeeBase = Math.round(tmr * 1.25);
        }
    } else {
        tdeeBase = Math.round(tmr * 1.25);
    }
    const tdee = tdeeBase + workoutKcal;

    // Déficit según peso del día
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(dayWeight, lossPace);

    // Calorías objetivo
    const cals = Math.max(1200, tdee - deficitTarget);

    // Macros
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    const protein = Math.round(dayWeight * pFactor);
    const fats = Math.max(Math.round(dayWeight * 0.8), 40);
    const carbs = Math.max(0, Math.round((cals - protein * 4 - fats * 9) / 4));

    return {
        cals,
        protein,
        carbs,
        fats,
        tdee,
        tdeeBase,
        workoutKcal,
        deficitTarget,
        isRealLoggedSession,
        dayType: dayInfo.type || 'descanso',
        dayLabel: dayInfo.label || '',
        adaptiveTDEE: adaptiveResult,
    };
}

export function convertToGrams(quantity, unit, customUnitWeight = null) {
    if (customUnitWeight && UNIT_CONVERSIONS[unit] === undefined) {
        return quantity * customUnitWeight;
    }
    return quantity * (UNIT_CONVERSIONS[unit] || 1);
}

export function convertQuantity(quantity, fromUnit, toUnit, customUnitWeight = null) {
    if (fromUnit === toUnit || !quantity || quantity === '') return quantity;
    const qty = parseFloat(quantity);
    if (isNaN(qty)) return quantity;

    const grams = convertToGrams(qty, fromUnit, customUnitWeight);

    if (toUnit in UNIT_CONVERSIONS) {
        return parseFloat((grams / UNIT_CONVERSIONS[toUnit]).toFixed(2));
    }

    if (customUnitWeight && toUnit !== fromUnit) {
        return parseFloat((grams / customUnitWeight).toFixed(2));
    }

    return quantity;
}
