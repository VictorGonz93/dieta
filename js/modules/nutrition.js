// ==================== NUTRICIÓN Y CÁLCULOS ====================

import AppState from './state.js';
import { GYM_ROUTINE, UNIT_CONVERSIONS, KCAL_PER_KG_FAT } from './constants.js';
import { estimateWorkoutKcal, calculateWorkoutDuration, getWorkoutSessions, getWorkoutTemplates } from './workout.js';
import { getDateKey } from './storage.js';

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
    const dateKey = AppState.currentDate ? getDateKey(AppState.currentDate) : '';
    const dynamic = getDynamicDayTargets(dateKey);
    if (dynamic) return dynamic.cals;
    return AppState.config.calsDescanso || 1800;
}

export function getTDEE() {
    const dateKey = AppState.currentDate ? getDateKey(AppState.currentDate) : '';
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
 * Promedio de pesos en un radio alrededor de un índice (suavizado de 3 días).
 * Filtra fluctuaciones diarias de agua/sodio.
 * Referencia: ENHANCE Framework (Int J Obesity, 2026) ±3-day moving average.
 */
function _avgWeight(entries, index, halfWindow) {
    if (!entries || entries.length === 0) return 0;
    const start = Math.max(0, index - halfWindow);
    const end = Math.min(entries.length - 1, index + halfWindow);
    let sum = 0;
    for (let i = start; i <= end; i++) sum += entries[i].weight;
    return sum / (end - start + 1);
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

    // Calcular cambio de peso: primer vs último en la ventana (suavizado 3 días)
    const firstWeight = _avgWeight(window, 0, 1);
    const lastWeight = _avgWeight(window, window.length - 1, 1);
    const weightChangeKg = firstWeight - lastWeight;

    const firstDate = new Date(window[0].date);
    const lastDate = new Date(window[window.length - 1].date);
    const daysBetween = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));

    const avgDailyCalories = totalCalories / validDays;
    const adaptiveTDEE = avgDailyCalories + (weightChangeKg * KCAL_PER_KG_FAT / daysBetween);

    // Safety cap: ±400 (evidence-based margin)
    const CAP = 400;
    const cappedTDEE = Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, adaptiveTDEE));

    // EMA de 14 días (suavizado, media móvil de 3 días en pesos)
    const recent14 = historicalWeights.slice(-14);
    if (recent14.length >= 14) {
        let r14Calories = 0;
        let r14Days = 0;
        for (const entry of recent14) {
            const dayKcal = _sumDayKcal(entry.date);
            if (dayKcal > 500) { r14Calories += dayKcal; r14Days++; }
        }
        if (r14Days >= 10) {
            const r14W0 = _avgWeight(recent14, 0, 1);
            const r14W1 = _avgWeight(recent14, recent14.length - 1, 1);
            const r14DaysSpan = Math.max(1, (new Date(recent14[recent14.length - 1].date) - new Date(recent14[0].date)) / (1000 * 60 * 60 * 24));
            const r14AvgCals = r14Calories / r14Days;
            const r14TDEE = r14AvgCals + ((r14W0 - r14W1) * KCAL_PER_KG_FAT / r14DaysSpan);
            const r14Capped = Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, r14TDEE));

            // EMA: 0.70 reciente / 0.30 histórico (estabilidad vs responsividad)
            const smoothedTDEE = r14Capped * 0.70 + cappedTDEE * 0.30;

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
    // Usar el día actual + 1 para incluir todos los datos en la ventana
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = getDateKey(tomorrow);
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
        return Math.round((weeklyLossKg * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'moderado') {
        // ~0.75% del peso corporal por semana (Recomendado)
        const weeklyLossKg = w * 0.0075;
        return Math.round((weeklyLossKg * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'intenso') {
        // ~1.0% del peso corporal por semana
        const weeklyLossKg = w * 0.010;
        return Math.round((weeklyLossKg * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'manual') {
        return AppState.config.deficitTarget || 500;
    }

    const weeklyLossKg = w * 0.0075;
    return Math.round((weeklyLossKg * KCAL_PER_KG_FAT) / 7);
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
        const sessions = getWorkoutSessions();
        const session = sessions[dateKey];

        if (session && session.exercises && session.exercises.length > 0) {
            workoutKcal = session.estimatedKcal || estimateWorkoutKcal(session) || 0;
            isRealLoggedSession = true;
        } else if (dayInfo.templateId) {
            const templates = getWorkoutTemplates();
            const tmpl = templates[dayInfo.templateId];
            if (tmpl && tmpl.exercises && tmpl.exercises.length > 0) {
                const estDuration = calculateWorkoutDuration({ exercises: tmpl.exercises, restTimeMin: 3 });
                workoutKcal = estimateWorkoutKcal({ date: dateKey, exercises: tmpl.exercises, duration: estDuration, restTimeMin: 3 });
            }
        }
    } catch { workoutKcal = 0; }

    // TDEE Base: adaptativo congelado o fórmula
    const tdeeMode = AppState.config.tdeeMode || 'formula';
    let tdeeBase;
    let adaptiveResult = null;
    const formulaTDEE = Math.round(tmr * 1.25);
    const CAP = 400;
    if (tdeeMode === 'adaptive') {
        adaptiveResult = calculateAdaptiveTDEEForDate(dateKey);
        if (adaptiveResult.confidence !== 'none') {
            // Usar TDEE adaptativo directamente — ya incluye el efecto de workouts
            tdeeBase = Math.round(adaptiveResult.tdee);
            // Proteger tdeeBase: no puede bajar de formulaTDEE - CAP
            tdeeBase = Math.max(formulaTDEE - CAP, tdeeBase);
        } else {
            tdeeBase = formulaTDEE;
        }
    } else {
        tdeeBase = formulaTDEE;
    }
    // In adaptive mode, workoutKcal is already included in the TDEE estimate
    // (historical workouts contribute to weight change → reflected in adaptive TDEE)
    // In formula mode, we add today's workout kcal explicitly
    const tdee = tdeeMode === 'adaptive' ? tdeeBase : tdeeBase + workoutKcal;

    // Déficit según peso del día
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(dayWeight, lossPace);

    // Calorías objetivo — piso según sexo (AHA/ACC guidelines)
    const gender = AppState.config.gender || 'male';
    const calorieFloor = gender === 'female' ? 1200 : 1500;
    const cals = Math.max(calorieFloor, tdee - deficitTarget);

    // Macros
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    const protein = Math.round(dayWeight * pFactor);
    const fats = Math.max(Math.round(dayWeight * 0.8), 40);
    const macroCals = protein * 4 + fats * 9;
    // If macros exceed calorie target, adjust carbs (can go to 0)
    const carbs = Math.max(0, Math.round((cals - macroCals) / 4));
    // If macros still exceed target, report the actual achievable cals
    const actualCals = macroCals + carbs * 4 > cals ? macroCals + carbs * 4 : cals;

    return {
        cals: actualCals,
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
