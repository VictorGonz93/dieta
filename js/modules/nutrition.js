// ==================== NUTRICIÓN Y CÁLCULOS ====================

import AppState from './state.js';
import { GYM_ROUTINE, UNIT_CONVERSIONS } from './constants.js';
import { estimateWorkoutKcal } from './workout.js?v=501';

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
    if (!currentWeight || !height || !age || !gender) return 0;
    if (gender === 'male') {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) + 5;
    } else {
        return (10 * currentWeight) + (6.25 * height) - (5 * age) - 161;
    }
}

export function calculateTDEE(dayType) {
    const tmr = calculateTMR();
    const factor = dayType === 'entreno' ? 1.50 : 1.25;
    return Math.round(tmr * factor);
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
// Calcula calorías y macros del día usando el TDEE adaptativo:
// TDEE = TMB * 1.25 (NEAT diario) + gasto deportivo (real o plantilla asignada)
// Objetivo Calórico = TDEE - Déficit Objetivo Automático
export function getDynamicDayTargets(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);
    const tmr = calculateTMR();
    if (!tmr) return null;

    let workoutKcal = 0;
    let isRealLoggedSession = false;

    try {
        const sessions = JSON.parse(localStorage.getItem('workoutSessions') || '{}');
        const session = sessions[dateKey];

        if (session && session.exercises && session.exercises.length > 0) {
            // A) Sesión realmente iniciada/editada en el día
            workoutKcal = session.estimatedKcal || estimateWorkoutKcal(session) || 0;
            isRealLoggedSession = true;
        } else if (dayInfo.templateId) {
            // B) Sin sesión iniciada aún, pero con rutina/plantilla asignada a este día
            const templates = JSON.parse(localStorage.getItem('workoutTemplates') || '{}');
            const tmpl = templates[dayInfo.templateId];
            if (tmpl && tmpl.exercises && tmpl.exercises.length > 0) {
                workoutKcal = estimateWorkoutKcal({ date: dateKey, exercises: tmpl.exercises, duration: 60 });
            }
        }
    } catch { workoutKcal = 0; }

    // TDEE Base sin deporte (TMB * 1.25 factor NEAT sedentario/diario)
    const tdeeBase = Math.round(tmr * 1.25);
    const tdee = tdeeBase + workoutKcal;

    // Déficit objetivo calculado automáticamente según peso actual y ritmo de pérdida
    const weight = AppState.config.currentWeight || 75;
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(weight, lossPace);

    // Calorías diarias objetivo
    const cals = Math.max(1200, tdee - deficitTarget);

    // Macros: proteína fija según objetivo, grasas mínimo saludable, carbos con el resto
    const weight = AppState.config.currentWeight || 75;
    const protein = AppState.config.proteinGoal || Math.round(weight * 2.0);
    const fats = Math.max(AppState.config.fatsMin || Math.round(weight * 0.8), 40);
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
        dayLabel: dayInfo.label || ''
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
