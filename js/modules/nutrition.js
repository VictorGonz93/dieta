// ==================== NUTRICIÓN Y CÁLCULOS ====================

import AppState from './state.js';
import { GYM_ROUTINE, UNIT_CONVERSIONS } from './constants.js';

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
    return routine[dayName];
}

export function getCalorieTarget() {
    const dayInfo = getDayType(AppState.currentDate);
    if (!AppState.config.calsEntrenamiento && !AppState.config.calsDescanso) return 0;
    return dayInfo.type === 'entreno'
        ? (AppState.config.calsEntrenamiento || 0)
        : (AppState.config.calsDescanso || 0);
}

export function getTDEE() {
    const dayInfo = getDayType(AppState.currentDate);
    return calculateTDEE(dayInfo.type);
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
    const activityFactors = {
        'entreno': 1.55,
        'descanso': 1.30,
    };
    const factor = activityFactors[dayType] || 1.30;
    return Math.round(tmr * factor);
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
