// ==================== ESTADÍSTICAS Y ANÁLISIS ====================

import AppState from './state.js';
import { KCAL_PER_KG_FAT, LEAN_GAIN_KCAL_PER_KG } from './constants.js';
import { num } from './utils.js';
import { getDateKey } from './storage.js';
import { getDayType, calculateTDEE, getCalorieTarget, getDynamicDayTargets, calculateAutoDeficit, calculateAutoSurplus, getPhaseProgress, getAdaptiveConfidenceLabel, getAdaptiveFallbackLabel } from './nutrition.js';
import { calculateNextDayPredictionForDate } from './weight.js';

const HISTORY_PER_PAGE = 10;
let _historyPage = 0;

function _sumDayKcal(day) {
    if (!day || !day.meals || typeof day.meals !== 'object') return 0;
    let total = 0;
    Object.values(day.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => { total += num(food && food.kcal); });
    });
    return total;
}

function _hasFoodEntries(day) {
    if (!day || !day.meals || typeof day.meals !== 'object') return false;
    return Object.values(day.meals).some(meal => Array.isArray(meal)
        && meal.some(food => food && typeof food === 'object' && String(food.name || '').trim() !== ''));
}

/** Racha de días consecutivos con al menos una comida registrada. */
export function getLoggingStreak() {
    const hasFood = (key) => _hasFoodEntries(AppState.allDays[key]);
    const cursor = new Date();
    let includesToday = false;
    if (hasFood(getDateKey(cursor))) {
        includesToday = true;
    } else {
        cursor.setDate(cursor.getDate() - 1);
    }
    let days = 0;
    // Tope de seguridad: 10 años. Evita bucles si allDays tuviera datos raros.
    for (let i = 0; i < 3660; i++) {
        if (!hasFood(getDateKey(cursor))) break;
        days++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return { days, includesToday };
}

/** Adherencia de los últimos N días: días registrados dentro de ±10% del objetivo. */
export function getWeeklyAdherence(windowDays = 7) {
    const totalDays = Math.min(90, Math.max(1, parseInt(windowDays, 10) || 7));
    const cursor = new Date();
    let logged = 0, onTarget = 0, kcalSum = 0;

    for (let i = 0; i < totalDays; i++) {
        const key = getDateKey(cursor);
        const dayKcal = _sumDayKcal(AppState.allDays[key]);
        if (dayKcal > 0) {
            logged++;
            kcalSum += dayKcal;
            const targets = getDynamicDayTargets(key);
            const target = targets && Number.isFinite(targets.cals) ? targets.cals : 0;
            if (target > 0 && Math.abs(dayKcal - target) <= target * 0.10) onTarget++;
        }
        cursor.setDate(cursor.getDate() - 1);
    }

    return {
        windowDays: totalDays,
        logged,
        onTarget,
        avgKcal: logged > 0 ? Math.round(kcalSum / logged) : 0,
        percent: logged > 0 ? Math.round((onTarget / logged) * 100) : null,
    };
}


export function getMacroSuggestions() {
    const dateKey = getDateKey(AppState.currentDate);
    const dayData = AppState.allDays[dateKey];
    if (!dayData) return null;

    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;
    if (dayData.meals && typeof dayData.meals === 'object') {
        Object.values(dayData.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => {
                sumKcal += num(food && food.kcal);
                sumProtein += num(food && food.protein);
                sumCarbs += num(food && food.carbs);
                sumFats += num(food && food.fats);
            });
        });
    }

    const targets = getDynamicDayTargets(dateKey);
    const targetCals    = targets?.cals    ?? getCalorieTarget() ?? 0;
    const targetProtein = targets?.protein ?? AppState.config.proteinGoal ?? 0;
    const targetCarbs   = targets?.carbs   ?? AppState.config.carbsMax ?? 0;
    const targetFats    = targets?.fats    ?? AppState.config.fatsMax ?? 0;

    const missing = {
        kcal:    Math.max(0, targetCals    - sumKcal),
        protein: Math.max(0, targetProtein - sumProtein),
        carbs:   Math.max(0, targetCarbs   - sumCarbs),
        fats:    Math.max(0, targetFats    - sumFats),
    };

    return {
        consumido: { sumKcal, sumProtein, sumCarbs, sumFats },
        falta: missing,
        targetCals,
        targetProtein,
        targetCarbs,
        targetFats,
        porcentajeCals:    targetCals    > 0 ? Math.round((sumKcal    / targetCals)    * 100) : 0,
        porcentajeProtein: targetProtein > 0 ? Math.round((sumProtein / targetProtein) * 100) : 0,
        porcentajeCarbos:  targetCarbs   > 0 ? Math.round((sumCarbs   / targetCarbs)   * 100) : 0,
        porcentajeFats:    targetFats    > 0 ? Math.round((sumFats    / targetFats)    * 100) : 0,
        targets,
    };
}

export function calculateWeeklyStats() {
    const today = new Date();
    const weekStart = new Date(today);
    // Lunes como inicio de semana (0=Lun, 6=Dom)
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    let totalWeight = 0, totalKcal = 0, totalDeficit = 0, daysWithFood = 0, daysWithWeight = 0;
    const dailyStats = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateKey = getDateKey(date);

        const weightEntry = AppState.config.weightHistory?.find(w => w.date === dateKey);
        const entryWeight = parseFloat(weightEntry && weightEntry.weight);
        const hasWeighIn = Number.isFinite(entryWeight) && entryWeight >= 25 && entryWeight <= 350;
        const currentWeight = hasWeighIn ? entryWeight : AppState.config.currentWeight;
        if (hasWeighIn) {
            daysWithWeight++;
            totalWeight += entryWeight;
        }

        const dayData = AppState.allDays[dateKey];
        let kcal = 0, protein = 0, carbs = 0, fats = 0;

        if (dayData && dayData.meals && typeof dayData.meals === 'object') {
            Object.values(dayData.meals).forEach(meal => {
                if (!Array.isArray(meal)) return;
                meal.forEach(food => {
                    kcal += num(food && food.kcal);
                    protein += num(food && food.protein);
                    carbs += num(food && food.carbs);
                    fats += num(food && food.fats);
                });
            });
        }

        if (kcal > 0) daysWithFood++;

        const targets = getDynamicDayTargets(dateKey);
        const dayInfo = getDayType(date);
        const tdee = targets?.tdee || calculateTDEE(dayInfo.type);
        const deficit = tdee - kcal;

        totalKcal += kcal;
        // Only count deficit for days with actual food logged (otherwise deficit = TDEE, inflating average)
        if (kcal > 0) totalDeficit += deficit;

        dailyStats.push({
            date: dateKey,
            weight: currentWeight,
            hasWeighIn,
            kcal,
            protein,
            carbs,
            fats,
            tdee,
            deficit,
            workoutKcal: targets?.workoutKcal || 0,
        });
    }

    const avgWeight = daysWithWeight > 0 ? totalWeight / daysWithWeight : AppState.config.currentWeight;

    // weeklyLoss con signo vía regresión lineal sobre pesajes REALES de la semana
    // (positivo = perdiendo, negativo = ganando). Más robusto que primero/último
    // con entradas dispersas. Solo cuentan días con pesaje registrado.
    const weightEntries = dailyStats.filter(d => d.hasWeighIn && Number.isFinite(parseFloat(d.weight)));
    let weeklyLoss = 0;
    if (weightEntries.length >= 2) {
        // Regresión simple: y = a + b*x con x = día (fecha real), y = peso
        const n = weightEntries.length;
        const firstDate = new Date(weekStart);
        const xs = weightEntries.map(d => {
            const [y, m, dd] = d.date.split('-').map(Number);
            // UTC: un cambio de hora no convierte un día en 0,958 días.
            return (Date.UTC(y, m - 1, dd) - Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate())) / 86400000;
        });
        const ys = weightEntries.map(d => parseFloat(d.weight));
        if (xs.every(Number.isFinite) && ys.every(Number.isFinite)) {
            const sumX = xs.reduce((a, b) => a + b, 0);
            const sumY = ys.reduce((a, b) => a + b, 0);
            const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
            const sumX2 = xs.reduce((a, x) => a + x * x, 0);
            const denom = n * sumX2 - sumX * sumX;
            if (denom !== 0) {
                const slope = (n * sumXY - sumX * sumY) / denom; // kg por día
                const loss = -slope * 7; // positivo = pérdida semanal
                if (Number.isFinite(loss)) weeklyLoss = loss;
            }
        }
    }

    return {
        daysRecorded: daysWithFood,
        avgWeight,
        avgKcal: Math.round(totalKcal / Math.max(daysWithFood, 1)),
        avgDeficit: Math.round(totalDeficit / Math.max(daysWithFood, 1)),
        weeklyLoss: Number.isFinite(weeklyLoss) ? weeklyLoss.toFixed(2) : '0.00',
        dailyStats,
    };
}

export function getWeeklyProgress() {
    const stats = calculateWeeklyStats();
    const currentWeight = AppState.config.currentWeight || 75;
    const lossPace = AppState.config.lossPace || 'moderado';
    const goalPhase = AppState.config.goalPhase || 'definicion';
    const todayKey = getDateKey(AppState.currentDate);
    const todayTargets = getDynamicDayTargets(todayKey);
    const actualLoss = parseFloat(stats.weeklyLoss) || 0; // + pierde, - gana

    // VOLUMEN: umbrales sobre ritmo de ganancia (%/sem). Evidencia Helms 2023:
    // 0.10-0.30%/sem óptimo; >0.60% sostenido = grasa (recortar superávit).
    if (goalPhase === 'volumen') {
        const surplus = (todayTargets && Number.isFinite(todayTargets.surplusTarget) && todayTargets.surplusTarget > 0)
            ? todayTargets.surplusTarget
            : calculateAutoSurplus(currentWeight, AppState.config.gainPace || 'lento');
        const expectedWeeklyGain = parseFloat(((surplus * 7) / LEAN_GAIN_KCAL_PER_KG).toFixed(2));
        const gainActual = -actualLoss; // + ganando, - perdiendo
        const gainRatePct = (gainActual / currentWeight) * 100;
        let status;
        if (gainActual < -0.05) status = 'Perdiendo peso';
        else if (gainActual <= 0.02) status = 'Estancado';
        else if (gainRatePct > 0.60) status = 'Muy rápido';
        else if (gainRatePct > 0.40) status = 'Algo rápido';
        else if (gainRatePct >= 0.10) status = 'En camino';
        else status = 'Algo lento';
        const diff = gainActual - expectedWeeklyGain;
        const target = AppState.config.targetWeight;
        const daysToGoal = (target > currentWeight && gainActual > 0)
            ? Math.round((target - currentWeight) / (gainActual / 7))
            : null;
        return {
            status,
            weeklyLoss: stats.weeklyLoss,
            expectedWeeklyLoss: expectedWeeklyGain,
            expectedWeeklyGain,
            diff: diff.toFixed(2),
            daysToGoal,
            estimatedDate: daysToGoal
                ? new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
                : null,
        };
    }

    // MANTENIMIENTO: estable si |ritmo| < 0.10%/sem
    if (goalPhase === 'mantenimiento') {
        const ratePct = (actualLoss / currentWeight) * 100; // + pierde
        let status;
        if (Math.abs(ratePct) < 0.10) status = 'Estable';
        else if (ratePct <= -0.10) status = 'Por encima';
        else status = 'Por debajo';
        return {
            status,
            weeklyLoss: stats.weeklyLoss,
            expectedWeeklyLoss: 0,
            diff: actualLoss.toFixed(2),
            daysToGoal: null,
            estimatedDate: null,
        };
    }

    // DEFINICIÓN: déficit REAL del día (0 si el suelo/macros lo anulan). No
    // sustituirlo por el teórico: prometería una pérdida que no existe.
    const dailyDeficit = todayTargets && Number.isFinite(todayTargets.actualDeficit)
        ? Math.max(0, todayTargets.actualDeficit)
        : calculateAutoDeficit(currentWeight, lossPace);
    const expectedWeeklyLoss = parseFloat(((dailyDeficit * 7) / KCAL_PER_KG_FAT).toFixed(2));
    const diff = actualLoss - expectedWeeklyLoss;
    // weeklyLoss con signo: positivo = perdiendo, negativo = ganando
    const status = expectedWeeklyLoss <= 0 ? 'Sin déficit'
        : actualLoss < -0.05 ? 'Ganando peso'
        : diff > -0.05 ? 'En camino'
        : diff > -0.2 ? 'Algo lento' : 'Muy lento';

    const daysToGoal = (expectedWeeklyLoss > 0
        && AppState.config.currentWeight > AppState.config.targetWeight)
        ? Math.round((AppState.config.currentWeight - AppState.config.targetWeight) / (expectedWeeklyLoss / 7))
        : null;

    return {
        status,
        weeklyLoss: stats.weeklyLoss,
        expectedWeeklyLoss,
        diff: diff.toFixed(2),
        daysToGoal,
        estimatedDate: daysToGoal
            ? new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
            : null,
    };
}

export function getPredictionAccuracy() {
    if (!AppState.config.weightHistory || AppState.config.weightHistory.length < 2) return null;

    const predictions = [];
    const errors = [];

    AppState.config.weightHistory.forEach((entry, idx) => {
        if (idx > 0) {
            let predictedWeight = null;
            if (AppState.config.weightHistory[idx - 1]?.predictedWeight) {
                predictedWeight = AppState.config.weightHistory[idx - 1].predictedWeight;
            } else {
                const prevDate = AppState.config.weightHistory[idx - 1];
                const pred = calculateNextDayPredictionForDate(prevDate.date, prevDate.weight);
                predictedWeight = pred?.predictedWeight;
            }

            if (predictedWeight) {
                const error = Math.abs(entry.weight - predictedWeight);
                predictions.push({ date: entry.date, predicted: predictedWeight, actual: entry.weight, error: error.toFixed(3) });
                errors.push(error);
            }
        }
    });

    const avgError = errors.length > 0 ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(3) : 0;
    const accuracy = 100 - (avgError * 100);

    return {
        predictions,
        avgError,
        accuracy: Math.max(0, accuracy.toFixed(1)),
        totalComparisons: predictions.length,
    };
}

export function displayMacroSuggestions() {
    const suggestions = getMacroSuggestions();
    const container = document.getElementById('macroSuggestions');
    if (!container || !suggestions) return;

    const { falta, consumido, porcentajeCals, porcentajeProtein, targetCals, targetProtein, targetCarbs, porcentajeCarbos, targetFats, porcentajeFats } = suggestions;
    const pct = (v) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), 100);

    container.innerHTML = `
        <div class="suggestions-card">
            <div class="suggestions-title">Sugerencias de Macros</div>
            <div class="suggestions-content">
                <div class="progress-item">
                    <span>Calorías: ${consumido.sumKcal}/${targetCals}</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct(porcentajeCals)}%"></div></div>
                    ${falta.kcal > 0 ? `<small>Te faltan ${falta.kcal} kcal</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Proteína: ${consumido.sumProtein.toFixed(0)}g / ${targetProtein}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct(porcentajeProtein)}%"></div></div>
                    ${falta.protein > 0 ? `<small>Te faltan ${falta.protein.toFixed(0)}g</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Carbos: ${consumido.sumCarbs.toFixed(0)}g / ${targetCarbs}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct(porcentajeCarbos)}%"></div></div>
                    ${falta.carbs > 0 ? `<small>Te faltan ${falta.carbs.toFixed(0)}g</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Grasas: ${consumido.sumFats.toFixed(0)}g / ${targetFats}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct(porcentajeFats)}%"></div></div>
                    ${falta.fats > 0 ? `<small>Te faltan ${falta.fats.toFixed(0)}g</small>` : '<small>Alcanzada</small>'}
                </div>
            </div>
        </div>
    `;
}

export function displayWeeklyProgress() {
    const progress = getWeeklyProgress();
    const container = document.getElementById('weeklyProgress');
    if (!container) return;

    container.innerHTML = `
        <div class="progress-card">
            <div class="progress-title">Progreso Semanal</div>
            <div class="progress-content">
                <div class="progress-indicator">
                    <div class="indicator-status">${progress.status}</div>
                    <div class="indicator-details">
                        <small>${parseFloat(progress.weeklyLoss) < 0 ? 'Ganancia' : 'Pérdida'} actual: <strong>${Math.abs(parseFloat(progress.weeklyLoss) || 0).toFixed(2)} kg</strong> / Esperado: <strong>${progress.expectedWeeklyLoss} kg</strong></small>
                        <br><small>Diferencia: <strong>${progress.diff} kg</strong></small>
                    </div>
                </div>
                <div class="goal-info">
                    ${progress.daysToGoal
                        ? `<div class="info-item"><span>Días hasta meta:</span><strong>${progress.daysToGoal} días</strong></div>
                           <div class="info-item"><span>Fecha estimada:</span><strong>${progress.estimatedDate}</strong></div>`
                        : `<div class="info-item"><span>ETA:</span><strong>${
                            (AppState.config.goalPhase || 'definicion') === 'mantenimiento'
                                ? 'Mantenimiento'
                                : (AppState.config.currentWeight || 0) <= (AppState.config.targetWeight || 0)
                                    ? 'Objetivo alcanzado'
                                    : 'Sin estimación'
                        }</strong></div>`}
                </div>
            </div>
        </div>
    `;
}

export function displayWeeklyStats() {
    const stats = calculateWeeklyStats();
    const container = document.getElementById('weeklyStats');
    if (!container) return;

    if (!stats || stats.daysRecorded === 0) {
        container.innerHTML = `<div class="stats-card"><div class="stats-title">Resumen Semanal</div><div class="stats-content"><p class="text-slate-400 text-sm">Registra pesos esta semana para ver estadísticas</p></div></div>`;
        return;
    }

    container.innerHTML = `
        <div class="stats-card">
            <div class="stats-title">Resumen Semanal</div>
            <div class="stats-content">
                <div class="stat-item"><span>Días registrados:</span><strong>${stats.daysRecorded} / 7</strong></div>
                <div class="stat-item"><span>Peso promedio:</span><strong>${(stats.avgWeight || 0).toFixed(1)} kg</strong></div>
                <div class="stat-item"><span>${parseFloat(stats.weeklyLoss) < 0 ? 'Ganancia' : 'Pérdida'} semanal:</span><strong>${Math.abs(parseFloat(stats.weeklyLoss) || 0).toFixed(2)} kg</strong></div>
                <div class="stat-item"><span>Calorías promedio:</span><strong>${stats.avgKcal} kcal/día</strong></div>
                <div class="stat-item"><span>Déficit promedio:</span><strong>${stats.avgDeficit} kcal/día</strong></div>
            </div>
        </div>
    `;
}

export function displayPredictionAccuracy() {
    const accuracy = getPredictionAccuracy();
    const container = document.getElementById('predictionAccuracy');
    if (!container || !accuracy) {
        if (container) container.innerHTML = '<small>Necesitas más datos (al menos 2 pesos registrados)</small>';
        return;
    }

    const predictions = accuracy.predictions.slice(-7);

    const getPrecisionLabel = (error) => {
        const e = parseFloat(error);
        if (e < 0.15) return { label: 'Excelente', color: '#34D399' };
        if (e < 0.35) return { label: 'Buena', color: '#60A5FA' };
        if (e < 0.6)  return { label: 'Aceptable', color: '#FBBF24' };
        return { label: 'Mejorable', color: '#F87171' };
    };

    const avgError = parseFloat(accuracy.avgError);
    const globalPrec = getPrecisionLabel(avgError);

    container.innerHTML = `
        <div class="accuracy-card">
            <div class="accuracy-title">Precisión de Predicciones</div>
            <div class="accuracy-content">
                <div class="accuracy-stats">
                    <div class="stat"><span>Desviación media:</span><strong>±${avgError} kg</strong></div>
                    <div class="stat"><span>Valoración:</span><strong style="color:${globalPrec.color};">${globalPrec.label}</strong></div>
                    <div class="stat"><span>Comparaciones:</span><strong>${accuracy.totalComparisons}</strong></div>
                </div>
                <div class="predictions-list">
                    <small><strong>Últimas predicciones vs realidad:</strong></small>
                    ${predictions.map(p => {
                        const prec = getPrecisionLabel(p.error);
                        return `
                        <div class="prediction-item">
                            <span>${p.date}</span>
                            <span>Predicho: ${p.predicted} kg</span>
                            <span>Real: ${p.actual} kg</span>
                            <span style="color:${prec.color};">±${parseFloat(p.error).toFixed(2)} kg · ${prec.label}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

export function displayGoalsTracking() {
    updateGoalsDisplay();
    import('./weight.js').then(m => m.renderWeightHistory());
}

// Desglose visible del objetivo: TMB → mantenimiento → ajuste → objetivo, más
// la calidad del dato y los avisos que antes solo existían en el código.
function _renderGoalBreakdown(dynamic) {
    const el = (id) => document.getElementById(id);
    if (!el('goalBreakdown')) return;
    if (!dynamic) {
        ['goalTmr', 'goalMaintenance', 'goalAdjustment', 'goalFinalCals'].forEach(id => {
            if (el(id)) el(id).textContent = '-';
        });
        if (el('goalSourceDetail')) el('goalSourceDetail').textContent = 'Sin datos suficientes para calcular el objetivo.';
        if (el('goalWarnings')) el('goalWarnings').replaceChildren();
        return;
    }

    const adaptive = dynamic.adaptiveTDEE;
    const isAdaptive = dynamic.tdeeSource === 'adaptive';
    const held = isAdaptive && adaptive?.transitionHold === true;
    const adjustment = Math.round(dynamic.cals - dynamic.tdee);

    if (el('goalTmr')) el('goalTmr').textContent = `${Math.round(dynamic.tmr)} kcal`;
    if (el('goalMaintenance')) el('goalMaintenance').textContent = `${Math.round(dynamic.tdee)} kcal`;
    if (el('goalMaintenanceHint')) {
        el('goalMaintenanceHint').textContent = held
            ? 'Congelado por cambio de fase'
            : isAdaptive ? 'TDEE adaptativo' : 'Fórmula + entreno';
    }
    if (el('goalAdjustment')) {
        el('goalAdjustment').textContent = `${adjustment > 0 ? '+' : ''}${adjustment} kcal`;
    }
    if (el('goalAdjustmentHint')) {
        el('goalAdjustmentHint').textContent = dynamic.goalPhase === 'definicion'
            ? 'Déficit real'
            : dynamic.goalPhase === 'volumen' ? 'Superávit real' : 'Sin ajuste';
    }
    if (el('goalFinalCals')) el('goalFinalCals').textContent = `${Math.round(dynamic.cals)} kcal`;

    const badge = el('goalQualityBadge');
    if (badge) {
        let label = 'Fórmula';
        let cls = 'text-xs px-3 py-1 rounded-full border border-slate-600 text-slate-300';
        if (isAdaptive) {
            const conf = adaptive?.confidence;
            label = `Adaptativo · confianza ${getAdaptiveConfidenceLabel(conf)}`;
            cls = conf === 'high'
                ? 'text-xs px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'text-xs px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300';
        } else if (adaptive && (adaptive.confidence !== 'none' || adaptive.fallbackReason)) {
            label = 'Fórmula · adaptativo descartado';
            cls = 'text-xs px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300';
        }
        badge.textContent = label;
        badge.className = cls;
    }

    const coverageText = adaptive && Number.isFinite(adaptive.coverage)
        ? `${Math.round(adaptive.coverage * 100)} %`
        : null;
    let sourceDetail = '';
    if (isAdaptive && adaptive) {
        sourceDetail = `TDEE adaptativo con ${adaptive.weighIns} pesajes en ${adaptive.spanDays} días`
            + `${coverageText ? ` y cobertura de comida del ${coverageText}` : ''}`
            + ` · ${adaptive.daysUsed} días de comida · confianza ${getAdaptiveConfidenceLabel(adaptive.confidence)}.`;
        if (held) {
            sourceDetail += ` Objetivo congelado durante el cambio de fase: quedan ${adaptive.holdDaysLeft} días.`;
        }
    } else if (adaptive && (adaptive.confidence !== 'none' || adaptive.fallbackReason)) {
        sourceDetail = `Fórmula Mifflin-St Jeor ×1.25 + entreno del día. `
            + `Adaptativo descartado: ${getAdaptiveFallbackLabel(dynamic.adaptiveFallbackReason || adaptive.fallbackReason)}.`;
        if (coverageText) sourceDetail += ` Cobertura de comida: ${coverageText}.`;
    } else {
        sourceDetail = 'Fórmula Mifflin-St Jeor ×1.25'
            + (dynamic.workoutKcal > 0 ? ` + ${Math.round(dynamic.workoutKcal)} kcal de entreno` : '')
            + '.';
    }
    if (el('goalSourceDetail')) el('goalSourceDetail').textContent = sourceDetail;

    const warnings = el('goalWarnings');
    if (!warnings) return;
    warnings.replaceChildren();
    const addWarning = (text, tone) => {
        const palette = tone === 'red'
            ? { box: 'bg-red-500/10 border-red-500/20 text-red-200', icon: 'error_outline' }
            : tone === 'blue'
                ? { box: 'bg-blue-500/10 border-blue-500/20 text-blue-200', icon: 'schedule' }
                : { box: 'bg-amber-500/10 border-amber-500/20 text-amber-200', icon: 'info' };
        const box = document.createElement('div');
        box.className = `flex items-start gap-2 p-3 rounded-lg border text-xs leading-relaxed ${palette.box}`;
        const icon = document.createElement('span');
        icon.className = 'material-icons text-sm';
        icon.textContent = palette.icon;
        const label = document.createElement('span');
        label.textContent = text;
        box.append(icon, label);
        warnings.appendChild(box);
    };

    if (dynamic.macroOverflow) {
        addWarning(
            `Ni con los mínimos de grasa y proteína caben las kcal objetivo: el objetivo real sube a ${Math.round(dynamic.cals)} kcal. Revisa el ritmo o el factor de proteína.`,
            'red'
        );
    } else if (dynamic.proteinCompromised || dynamic.fatReduced) {
        const parts = [];
        if (dynamic.proteinCompromised) {
            parts.push(`la proteína baja de ${Math.round(dynamic.proteinDesired)} a ${Math.round(dynamic.protein)} g`);
        }
        if (dynamic.fatReduced) {
            parts.push(`las grasas bajan de ${Math.round(dynamic.fatsPreferred)} a ${Math.round(dynamic.fats)} g`);
        }
        addWarning(
            `Para no superar las ${Math.round(dynamic.targetCals)} kcal, ${parts.join(' y ')}. Los carbohidratos absorben el resto.`,
            'amber'
        );
    }
    if (dynamic.belowFloor) {
        addWarning(
            `El suelo calórico (${Math.round(dynamic.calorieFloor || 1500)} kcal) supera el mantenimiento estimado (${Math.round(dynamic.tdee)} kcal). En definición no habrá déficit real: usa mantenimiento o revisa los datos.`,
            'red'
        );
    } else if (dynamic.floorApplied) {
        addWarning(
            `El suelo calórico (${Math.round(dynamic.calorieFloor || 1500)} kcal) eleva el objetivo calculado (${Math.round(dynamic.rawCals)} kcal) para no bajar de un mínimo seguro.`,
            'amber'
        );
    }
    if (held) {
        addWarning(
            `Cambio de fase: el mantenimiento queda congelado durante 14 días para no confundir agua/glucógeno con grasa. Quedan ${adaptive.holdDaysLeft} días.`,
            'blue'
        );
    }
    if (!isAdaptive && dynamic.adaptiveFallbackReason) {
        addWarning(
            `El TDEE adaptativo no fija el objetivo (${getAdaptiveFallbackLabel(dynamic.adaptiveFallbackReason)}). Se usa la fórmula hasta que haya datos suficientes y con cobertura.`,
            'amber'
        );
    }
}

export function updateGoalsDisplay() {
    const { startWeight, currentWeight, targetWeight } = AppState.config;
    const progress = getPhaseProgress();
    const isBulk = progress.isBulk;
    // Punto de partida de la fase (fallback a startWeight) compartido con la
    // cabecera: ambas cifras salen de getPhaseProgress.
    const phaseStartWeight = progress.startWeight ?? startWeight ?? 0;
    const totalToLose = phaseStartWeight - (targetWeight || 0);
    const alreadyLost = phaseStartWeight - (currentWeight || 0);
    const stillToLose = (currentWeight || 0) - (targetWeight || 0);
    const alreadyGained = (currentWeight || 0) - phaseStartWeight;
    const progressPercent = progress.progressPercent;

    const w = currentWeight || 75;
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(w, lossPace);

    const dateKey = getDateKey(AppState.currentDate);
    const dynamic = getDynamicDayTargets(dateKey);

    const goalPhase = AppState.config.goalPhase || 'definicion';

    // ETA con el ajuste REAL del día (piso calórico / macros pueden recortarlo
    // respecto al teórico). NO hacer fallback al déficit teórico cuando el real
    // es 0 o negativo: eso prometía una pérdida que no existe.
    const effectiveDeficit = dynamic && Number.isFinite(dynamic.actualDeficit)
        ? dynamic.actualDeficit
        : deficitTarget;
    const weeklyLossKg = Math.max(0, (effectiveDeficit * 7) / KCAL_PER_KG_FAT);
    const effectiveSurplus = dynamic && Number.isFinite(dynamic.cals) && Number.isFinite(dynamic.tdee)
        ? Math.max(0, dynamic.cals - dynamic.tdee)
        : Math.max(0, dynamic?.surplusTarget ?? calculateAutoSurplus(w, AppState.config.gainPace || 'lento'));
    const weeklyGainKg = (effectiveSurplus * 7) / LEAN_GAIN_KCAL_PER_KG;
    const stillToGain = (targetWeight || 0) - (currentWeight || 0);
    const weeklyRateKg = goalPhase === 'volumen' ? weeklyGainKg : weeklyLossKg;
    const stillToGo = goalPhase === 'volumen' ? stillToGain : stillToLose;
    const weeksRemaining = weeklyRateKg > 0 && stillToGo > 0 ? Math.ceil(stillToGo / weeklyRateKg) : 0;
    const daysRemaining = weeksRemaining * 7;

    // ?? (no ||): carbs puede ser 0 legítimo y || lo convertiría en 130
    const calsTarget    = dynamic?.cals    ?? 1550;
    const proteinTarget = dynamic?.protein ?? Math.round((currentWeight || 75) * 2.0);
    const carbsTarget   = dynamic?.carbs   ?? 130;
    const fatsTarget    = dynamic?.fats    ?? 60;

    const el = (id) => document.getElementById(id);
    if (el('goalStartWeight')) el('goalStartWeight').textContent = phaseStartWeight ? `${phaseStartWeight} kg` : '-';
    if (el('goalCurrentWeight')) el('goalCurrentWeight').textContent = currentWeight ? `${currentWeight} kg` : '-';
    if (el('goalTargetWeight')) el('goalTargetWeight').textContent = targetWeight ? `${targetWeight} kg` : '-';
    if (el('goalWeightLost')) el('goalWeightLost').textContent = isBulk
        ? (alreadyGained > 0 ? `+${alreadyGained.toFixed(1)} kg` : '0 kg')
        : (alreadyLost > 0 ? `${alreadyLost.toFixed(1)} kg` : '0 kg');
    if (el('goalProgressBar')) el('goalProgressBar').style.width = `${Math.min(progressPercent, 100)}%`;
    if (el('goalProgressPercent')) el('goalProgressPercent').textContent = `${progressPercent}%`;

    const rateExplain = `(${weeklyRateKg.toFixed(2)} kg/semana)`;
    let timeEstimate = '-', timeExplain = '';
    if (goalPhase === 'mantenimiento') {
        timeEstimate = 'Mantener';
        timeExplain = 'Objetivo de mantenimiento: no hay fecha de llegada; el ETA no aplica.';
    } else if (stillToGo > 0) {
        if (weeklyRateKg <= 0) {
            timeEstimate = goalPhase === 'volumen' ? 'Sin superávit' : 'Sin déficit';
            timeExplain = goalPhase === 'volumen'
                ? 'El objetivo actual no genera un superávit real; revisa el cálculo o los macros.'
                : 'El objetivo actual no genera un déficit real; revisa el suelo, los macros o el TDEE.';
        } else if (weeksRemaining === 0) {
            timeEstimate = '¡Ya casi!';
            timeExplain = 'Estás muy cerca de tu objetivo';
        } else if (weeksRemaining < 4) {
            timeEstimate = `${weeksRemaining} semana${weeksRemaining > 1 ? 's' : ''}`;
            timeExplain = `Aproximadamente ${daysRemaining} días ${rateExplain}`;
        } else {
            const months = Math.ceil(weeksRemaining / 4.3);
            timeEstimate = `${months} mes${months > 1 ? 'es' : ''}`;
            timeExplain = `Aproximadamente ${weeksRemaining} semanas ${rateExplain}`;
        }
    } else if (goalPhase === 'volumen') {
        timeEstimate = 'Define tu meta';
        timeExplain = 'En volumen la meta debe estar por encima de tu peso actual';
    } else {
        timeEstimate = 'Objetivo alcanzado';
        timeExplain = 'Has llegado a tu peso objetivo';
    }

    if (el('goalTimeEstimate')) el('goalTimeEstimate').textContent = timeEstimate;
    if (el('goalTimeExplain')) el('goalTimeExplain').textContent = timeExplain;
    if (el('goalCals')) el('goalCals').textContent = Math.round(calsTarget);
    if (el('goalProtein')) el('goalProtein').textContent = Math.round(proteinTarget);
    if (el('goalCarbs')) el('goalCarbs').textContent = Math.round(carbsTarget);
    if (el('goalFats')) el('goalFats').textContent = Math.round(fatsTarget);

    _renderGoalBreakdown(dynamic);

    if (el('lossPaceSelect')) el('lossPaceSelect').value = lossPace;
    if (el('deficitTargetInput')) el('deficitTargetInput').value = deficitTarget;
    if (el('proteinFactorSelect')) el('proteinFactorSelect').value = AppState.config.proteinFactor || 2.0;
    if (el('goalPhaseSelect')) el('goalPhaseSelect').value = AppState.config.goalPhase || 'definicion';
    if (el('gainPaceSelect')) el('gainPaceSelect').value = AppState.config.gainPace || 'lento';
    if (el('surplusTargetInput')) el('surplusTargetInput').value = AppState.config.surplusTarget || 150;

    refreshPhaseExplanations();
}

function _updateLossPaceExplanation(weight, lossPace, deficit, weeklyLossKg) {
    const explainEl = document.getElementById('lossPaceExplain');
    const manualContainer = document.getElementById('manualDeficitContainer');

    if (manualContainer) {
        manualContainer.style.display = lossPace === 'manual' ? 'block' : 'none';
    }

    if (explainEl) {
        if (lossPace === 'suave') {
            explainEl.innerHTML = `Paso Suave (~0.5%/sem): Déficit de <strong>~${deficit} kcal/día</strong> (Pérdida estimada: <strong>~${weeklyLossKg.toFixed(2)} kg/sem</strong> para tus ${weight} kg).`;
        } else if (lossPace === 'moderado') {
            explainEl.innerHTML = `Paso Moderado (~0.75%/sem): Déficit de <strong>~${deficit} kcal/día</strong> (Pérdida estimada: <strong>~${weeklyLossKg.toFixed(2)} kg/sem</strong> para tus ${weight} kg).`;
        } else if (lossPace === 'intenso') {
            explainEl.innerHTML = `Paso Intenso (~1.0%/sem): Déficit de <strong>~${deficit} kcal/día</strong> (Pérdida estimada: <strong>~${weeklyLossKg.toFixed(2)} kg/sem</strong> para tus ${weight} kg).`;
        } else if (lossPace === 'manual') {
            explainEl.innerHTML = `Modo Manual: Déficit fijo de <strong>${deficit} kcal/día</strong> (Pérdida estimada: <strong>~${weeklyLossKg.toFixed(2)} kg/sem</strong>).`;
        }
    }
}

function _updateGainPaceExplanation(weight, gainPace, surplus, weeklyGainKg) {
    const explainEl = document.getElementById('gainPaceExplain');
    const manualContainer = document.getElementById('manualSurplusContainer');

    if (manualContainer) {
        manualContainer.style.display = gainPace === 'manual' ? 'block' : 'none';
    }

    if (explainEl) {
        if (gainPace === 'lento') {
            explainEl.innerHTML = `Paso Lento (+0.25%/sem): Superávit de <strong>~${surplus} kcal/día</strong> (Ganancia estimada: <strong>~${weeklyGainKg.toFixed(2)} kg/sem</strong> para tus ${weight} kg).`;
        } else if (gainPace === 'moderado') {
            explainEl.innerHTML = `Paso Moderado (+0.50%/sem): Superávit de <strong>~${surplus} kcal/día</strong> (Ganancia estimada: <strong>~${weeklyGainKg.toFixed(2)} kg/sem</strong> para tus ${weight} kg).`;
        } else if (gainPace === 'manual') {
            explainEl.innerHTML = `Modo Manual: Superávit fijo de <strong>${surplus} kcal/día</strong> (Ganancia estimada: <strong>~${weeklyGainKg.toFixed(2)} kg/sem</strong>).`;
        }
    }
}

export function refreshPhaseExplanations() {
    const w = AppState.config.currentWeight || 75;
    const lossPace = AppState.config.lossPace || 'moderado';
    const gainPace = AppState.config.gainPace || 'lento';
    const deficitTarget = calculateAutoDeficit(w, lossPace);
    const surplusTarget = calculateAutoSurplus(w, gainPace);
    _updateLossPaceExplanation(w, lossPace, deficitTarget, (deficitTarget * 7) / KCAL_PER_KG_FAT);
    _updateGainPaceExplanation(w, gainPace, surplusTarget, (surplusTarget * 7) / LEAN_GAIN_KCAL_PER_KG);
    const phaseEl = document.getElementById('goalPhaseExplain');
    if (phaseEl) {
        const phase = AppState.config.goalPhase || 'definicion';
        let text = phase === 'volumen'
            ? 'Tus calorías van por encima de tu gasto (superávit para ganar músculo).'
            : phase === 'mantenimiento'
            ? 'Tus calorías igualan tu gasto (ni ganas ni pierdes).'
            : 'Tus calorías van por debajo de tu gasto (déficit para perder grasa).';
        // Contador del puente de mantenimiento (día X de 14)
        if (phase === 'mantenimiento' && AppState.config.bridgeStartDate) {
            const start = new Date(AppState.config.bridgeStartDate + 'T00:00:00');
            const days = Math.floor((Date.now() - start.getTime()) / 86400000);
            if (Number.isFinite(days) && days >= 0) {
                text += ` Puente en curso: día ${Math.min(days + 1, 14)} de 14.`;
            }
        }
        phaseEl.textContent = text;
    }
}

window._onLossPaceChange = function() {
    const select = document.getElementById('lossPaceSelect');
    if (!select) return;
    const pace = select.value;
    const w = AppState.config.currentWeight || 75;
    import('./nutrition.js').then(m => {
        const def = m.calculateAutoDeficit(w, pace);
        const weeklyLoss = (def * 7) / KCAL_PER_KG_FAT;
        _updateLossPaceExplanation(w, pace, def, weeklyLoss);
    });
};

window._onGainPaceChange = function() {
    const select = document.getElementById('gainPaceSelect');
    if (!select) return;
    const pace = select.value;
    const w = AppState.config.currentWeight || 75;
    import('./nutrition.js').then(m => {
        const sur = m.calculateAutoSurplus(w, pace);
        const weeklyGain = (sur * 7) / LEAN_GAIN_KCAL_PER_KG;
        _updateGainPaceExplanation(w, pace, sur, weeklyGain);
    });
};

window._onGoalPhaseChange = function() {
    refreshPhaseExplanations();
};

export function updateStatistics() {
    updateWeekStats();
    updateAverageStats();
    updateBestDayStats();
    updateHistoryList();
}

export function updateWeekStats() {
    const container = document.getElementById('weekStats');
    if (!container) return;

    const today = new Date();
    // Semana Lunes-Domingo
    const dayOfWeek = (today.getDay() + 6) % 7; // 0=Lun, 6=Dom
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDays.push(getDateKey(d));
    }

    let weekCals = 0, weekProtein = 0, weekDaysLogged = 0;
    weekDays.forEach(day => {
        const dayData = AppState.allDays[day];
        if (dayData && dayData.meals && typeof dayData.meals === 'object') {
            let dayKcal = 0, dayProtein = 0;
            Object.values(dayData.meals).forEach(meal => {
                if (!Array.isArray(meal)) return;
                meal.forEach(food => { dayKcal += num(food && food.kcal); dayProtein += num(food && food.protein); });
            });
            if (dayKcal > 0) { weekCals += dayKcal; weekProtein += dayProtein; weekDaysLogged++; }
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

export function updateAverageStats() {
    const container = document.getElementById('avgStats');
    if (!container) return;

    const dates = Object.keys(AppState.allDays).sort();
    let totalKcal = 0, totalProtein = 0, count = 0;

    dates.forEach(date => {
        const day = AppState.allDays[date];
        if (!day || !day.meals || typeof day.meals !== 'object') return;
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => { dayKcal += num(food && food.kcal); dayProtein += num(food && food.protein); });
        });
        if (dayKcal > 0) { totalKcal += dayKcal; totalProtein += dayProtein; count++; }
    });

    container.innerHTML = `
        <p><strong>Total de días:</strong> ${count}</p>
        <p><strong>Promedio calórico:</strong> ${count > 0 ? (totalKcal / count).toFixed(0) : 0} kcal</p>
        <p><strong>Promedio proteína:</strong> ${count > 0 ? (totalProtein / count).toFixed(1) : 0}g</p>
    `;
}

export function updateBestDayStats() {
    const container = document.getElementById('bestDayStats');
    if (!container) return;

    const dates = Object.keys(AppState.allDays).sort();
    let bestDay = null, bestScore = -1;

    dates.forEach(dateKey => {
        const day = AppState.allDays[dateKey];
        if (!day || !day.meals || typeof day.meals !== 'object') return;
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => { dayKcal += num(food && food.kcal); dayProtein += num(food && food.protein); });
        });

        if (dayKcal > 200) {
            const targets = getDynamicDayTargets(dateKey);
            const targetCals = targets?.cals ?? getCalorieTarget() ?? 1800;
            const targetProtein = targets?.protein || AppState.config.proteinGoal || 150;

            const kcalDiff = Math.abs(dayKcal - targetCals);
            const kcalScore = Math.max(0, 100 - (kcalDiff / targetCals * 100));

            const proteinRatio = Math.min(1.2, dayProtein / targetProtein);
            const proteinScore = Math.min(100, proteinRatio * 100);

            const totalScore = (kcalScore * 0.5) + (proteinScore * 0.5);

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestDay = {
                    date: dateKey,
                    dayNumber: day.dayNumber,
                    kcal: Math.round(dayKcal),
                    protein: Math.round(dayProtein),
                    score: Math.round(totalScore)
                };
            }
        }
    });

    container.innerHTML = bestDay
        ? `<p><strong>Día ${bestDay.dayNumber} (${bestDay.date})</strong></p><p><strong>Adherencia:</strong> ${bestDay.score}%</p><p><strong>Macros:</strong> ${bestDay.kcal} kcal · ${bestDay.protein}g P</p>`
        : '<p>Sin suficientes datos registrados</p>';
}

export function updateHistoryList(resetPage = false) {
    const container = document.getElementById('historyList');
    if (!container) return;

    if (resetPage) _historyPage = 0;

    const dates = Object.keys(AppState.allDays).sort().reverse();
    const datesWithData = dates.filter(date => {
        const day = AppState.allDays[date];
        if (!day || !day.meals || typeof day.meals !== 'object') return false;
        return Object.values(day.meals).some(meal => Array.isArray(meal) && meal.length > 0);
    });

    const totalPages = Math.max(1, Math.ceil(datesWithData.length / HISTORY_PER_PAGE));
    if (_historyPage >= totalPages) _historyPage = totalPages - 1;

    const paged = datesWithData.slice(_historyPage * HISTORY_PER_PAGE, (_historyPage + 1) * HISTORY_PER_PAGE);

    const itemsHTML = paged.map(date => {
        const day = AppState.allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        if (day && day.meals && typeof day.meals === 'object') {
            Object.values(day.meals).forEach(meal => {
                if (!Array.isArray(meal)) return;
                meal.forEach(food => {
                    dayKcal += num(food && food.kcal);
                    dayProtein += num(food && food.protein);
                    dayCarbs += num(food && food.carbs);
                    dayFats += num(food && food.fats);
                });
            });
        }
        return `
            <div class="history-item">
                <div class="history-item-header">
                    <span class="history-item-date">Día ${day.dayNumber} - ${date}</span>
                </div>
                <div class="history-item-macros">
                    <div class="history-macro"><span class="history-macro-label" style="color:#34D399;">Kcal</span><span class="history-macro-value" style="color:#34D399;">${dayKcal.toFixed(0)}</span></div>
                    <div class="history-macro"><span class="history-macro-label" style="color:#60A5FA;">Proteína</span><span class="history-macro-value" style="color:#60A5FA;">${dayProtein.toFixed(1)}g</span></div>
                    <div class="history-macro"><span class="history-macro-label" style="color:#FBBF24;">Carbos</span><span class="history-macro-value" style="color:#FBBF24;">${dayCarbs.toFixed(1)}g</span></div>
                    <div class="history-macro"><span class="history-macro-label" style="color:#A78BFA;">Grasas</span><span class="history-macro-value" style="color:#A78BFA;">${dayFats.toFixed(1)}g</span></div>
                </div>
            </div>
        `;
    }).join('');

    const paginationHTML = totalPages > 1 ? `
        <div class="history-pagination" style="display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0 4px;">
            <button onclick="window._historyGoToPage(${_historyPage - 1})" ${_historyPage === 0 ? 'disabled' : ''} style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${_historyPage === 0 ? '#1E2E48' : '#2D4468'}; background: ${_historyPage === 0 ? 'transparent' : 'rgba(16,185,129,0.1)'}; color: ${_historyPage === 0 ? '#344D6A' : '#34D399'}; cursor: ${_historyPage === 0 ? 'not-allowed' : 'pointer'}; font-size: 0.9rem;">‹ Anterior</button>
            <span style="color: #6B8BAE; font-size: 0.9rem;">Página ${_historyPage + 1} de ${totalPages}</span>
            <button onclick="window._historyGoToPage(${_historyPage + 1})" ${_historyPage >= totalPages - 1 ? 'disabled' : ''} style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${_historyPage >= totalPages - 1 ? '#1E2E48' : '#2D4468'}; background: ${_historyPage >= totalPages - 1 ? 'transparent' : 'rgba(16,185,129,0.1)'}; color: ${_historyPage >= totalPages - 1 ? '#344D6A' : '#34D399'}; cursor: ${_historyPage >= totalPages - 1 ? 'not-allowed' : 'pointer'}; font-size: 0.9rem;">Siguiente ›</button>
        </div>
    ` : '';

    container.innerHTML = itemsHTML + paginationHTML;
}

window._historyGoToPage = function(page) {
    _historyPage = page;
    updateHistoryList(false);
};
