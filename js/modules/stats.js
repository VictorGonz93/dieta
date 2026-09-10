// ==================== ESTADÍSTICAS Y ANÁLISIS ====================

import AppState from './state.js';
import { getDateKey } from './storage.js';
import { getDayType, calculateTDEE, getCalorieTarget, getDynamicDayTargets, calculateAutoDeficit } from './nutrition.js';
import { calculateNextDayPredictionForDate } from './weight.js';

const HISTORY_PER_PAGE = 10;
let _historyPage = 0;

export function getMacroSuggestions() {
    const dateKey = getDateKey(AppState.currentDate);
    const dayData = AppState.allDays[dateKey];
    if (!dayData) return null;

    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;
    Object.values(dayData.meals).forEach(meal => {
        meal.forEach(food => {
            sumKcal += food.kcal;
            sumProtein += food.protein;
            sumCarbs += food.carbs;
            sumFats += food.fats;
        });
    });

    const targets = getDynamicDayTargets(dateKey);
    const targetCals    = targets?.cals    || getCalorieTarget();
    const targetProtein = targets?.protein || AppState.config.proteinGoal;
    const targetCarbs   = targets?.carbs   || AppState.config.carbsMax;
    const targetFats    = targets?.fats    || AppState.config.fatsMax;

    const missing = {
        kcal:    Math.max(0, targetCals    - sumKcal),
        protein: Math.max(0, targetProtein - sumProtein),
        carbs:   Math.max(0, targetCarbs   - sumCarbs),
        fats:    Math.max(0, targetFats    - sumFats),
    };

    return {
        consumido: { sumKcal, sumProtein, sumCarbs, sumFats },
        falta: missing,
        targetCarbs,
        porcentajeCals:    Math.round((sumKcal    / targetCals)    * 100),
        porcentajeProtein: Math.round((sumProtein / targetProtein) * 100),
        porcentajeCarbos:  Math.round((sumCarbs   / targetCarbs)   * 100),
        porcentajeFats:    Math.round((sumFats    / targetFats)    * 100),
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
        const currentWeight = weightEntry?.weight || AppState.config.currentWeight;
        if (weightEntry) {
            daysWithWeight++;
            totalWeight += weightEntry.weight;
        }

        const dayData = AppState.allDays[dateKey];
        let kcal = 0, protein = 0, carbs = 0, fats = 0;

        if (dayData) {
            Object.values(dayData.meals).forEach(meal => {
                meal.forEach(food => {
                    kcal += food.kcal;
                    protein += food.protein;
                    carbs += food.carbs;
                    fats += food.fats;
                });
            });
        }

        if (kcal > 0) daysWithFood++;

        const targets = getDynamicDayTargets(dateKey);
        const dayInfo = getDayType(date);
        const tdee = targets?.tdee || calculateTDEE(dayInfo.type);
        const deficit = tdee - kcal;

        totalKcal += kcal;
        totalDeficit += deficit;

        dailyStats.push({
            date: dateKey,
            weight: currentWeight,
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
    const firstW = dailyStats.find(d => d.weight)?.weight;
    const lastW = [...dailyStats].reverse().find(d => d.weight)?.weight;
    const weeklyLoss = (firstW && lastW && firstW !== lastW) ? (firstW - lastW) : 0;

    return {
        daysRecorded: daysWithFood,
        avgWeight,
        avgKcal: Math.round(totalKcal / Math.max(daysWithFood, 1)),
        avgDeficit: Math.round(totalDeficit / Math.max(daysWithFood, 1)),
        weeklyLoss: weeklyLoss?.toFixed(2) || 0,
        dailyStats,
    };
}

export function getWeeklyProgress() {
    const stats = calculateWeeklyStats();
    const expectedWeeklyLoss = 0.5;
    const diff = parseFloat(stats.weeklyLoss) - expectedWeeklyLoss;
    const status = diff > -0.05 ? 'En camino' : diff > -0.2 ? 'Algo lento' : 'Muy lento';

    const daysToGoal = AppState.config.currentWeight > AppState.config.targetWeight
        ? Math.round((AppState.config.currentWeight - AppState.config.targetWeight) / (expectedWeeklyLoss / 7))
        : 0;

    return {
        status,
        weeklyLoss: stats.weeklyLoss,
        expectedWeeklyLoss,
        diff: diff.toFixed(2),
        daysToGoal,
        estimatedDate: new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
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

    const { falta, consumido, porcentajeCals, targetCarbs, porcentajeCarbos } = suggestions;

    container.innerHTML = `
        <div class="suggestions-card">
            <div class="suggestions-title">Sugerencias de Macros</div>
            <div class="suggestions-content">
                <div class="progress-item">
                    <span>Calorías: ${consumido.sumKcal}/${getCalorieTarget()}</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(porcentajeCals, 100)}%"></div></div>
                    ${falta.kcal > 0 ? `<small>Te faltan ${falta.kcal} kcal</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Proteína: ${consumido.sumProtein.toFixed(0)}g / ${AppState.config.proteinGoal}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min((consumido.sumProtein / AppState.config.proteinGoal) * 100, 100)}%"></div></div>
                    ${falta.protein > 0 ? `<small>Te faltan ${falta.protein.toFixed(0)}g</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Carbos: ${consumido.sumCarbs.toFixed(0)}g / ${targetCarbs}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(porcentajeCarbos, 100)}%"></div></div>
                    ${falta.carbs > 0 ? `<small>Te faltan ${falta.carbs.toFixed(0)}g</small>` : '<small>Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>Grasas: ${consumido.sumFats.toFixed(0)}g / ${AppState.config.fatsMax}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min((consumido.sumFats / AppState.config.fatsMax) * 100, 100)}%"></div></div>
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
                        <small>Pérdida actual: <strong>${progress.weeklyLoss} kg</strong> / Esperado: <strong>${progress.expectedWeeklyLoss} kg</strong></small>
                        <br><small>Diferencia: <strong>${progress.diff} kg</strong></small>
                    </div>
                </div>
                <div class="goal-info">
                    <div class="info-item"><span>Días hasta meta:</span><strong>${progress.daysToGoal} días</strong></div>
                    <div class="info-item"><span>Fecha estimada:</span><strong>${progress.estimatedDate}</strong></div>
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
                <div class="stat-item"><span>Pérdida semanal:</span><strong>${stats.weeklyLoss} kg</strong></div>
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

export function updateGoalsDisplay() {
    const { startWeight, currentWeight, targetWeight } = AppState.config;
    const totalToLose = (startWeight || 0) - (targetWeight || 0);
    const alreadyLost = (startWeight || 0) - (currentWeight || 0);
    const stillToLose = (currentWeight || 0) - (targetWeight || 0);
    const progressPercent = totalToLose > 0 ? Math.round((alreadyLost / totalToLose) * 100) : 0;

    const w = currentWeight || 75;
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(w, lossPace);
    const weeklyLossKg = (deficitTarget * 7) / 7700; // kg/semana equivalentes
    const weeksRemaining = weeklyLossKg > 0 && stillToLose > 0 ? Math.ceil(stillToLose / weeklyLossKg) : 0;
    const daysRemaining = weeksRemaining * 7;

    const dateKey = getDateKey(AppState.currentDate);
    const dynamic = getDynamicDayTargets(dateKey);

    const calsTarget    = dynamic?.cals    || 1550;
    const proteinTarget = dynamic?.protein || Math.round((currentWeight || 75) * 2.0);
    const carbsTarget   = dynamic?.carbs   || 130;
    const fatsTarget    = dynamic?.fats    || 60;

    const el = (id) => document.getElementById(id);
    if (el('goalStartWeight')) el('goalStartWeight').textContent = startWeight ? `${startWeight} kg` : '-';
    if (el('goalCurrentWeight')) el('goalCurrentWeight').textContent = currentWeight ? `${currentWeight} kg` : '-';
    if (el('goalTargetWeight')) el('goalTargetWeight').textContent = targetWeight ? `${targetWeight} kg` : '-';
    if (el('goalWeightLost')) el('goalWeightLost').textContent = alreadyLost > 0 ? `${alreadyLost.toFixed(1)} kg` : '0 kg';
    if (el('goalProgressBar')) el('goalProgressBar').style.width = `${Math.min(progressPercent, 100)}%`;
    if (el('goalProgressPercent')) el('goalProgressPercent').textContent = `${progressPercent}%`;

    let timeEstimate = '-', timeExplain = '';
    if (stillToLose > 0) {
        if (weeksRemaining === 0) {
            timeEstimate = '¡Ya casi!';
            timeExplain = 'Estás muy cerca de tu objetivo';
        } else if (weeksRemaining < 4) {
            timeEstimate = `${weeksRemaining} semana${weeksRemaining > 1 ? 's' : ''}`;
            timeExplain = `Aproximadamente ${daysRemaining} días (${weeklyLossKg.toFixed(2)} kg/semana)`;
        } else {
            const months = Math.ceil(weeksRemaining / 4.3);
            timeEstimate = `${months} mes${months > 1 ? 'es' : ''}`;
            timeExplain = `Aproximadamente ${weeksRemaining} semanas (${weeklyLossKg.toFixed(2)} kg/semana)`;
        }
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

    if (el('lossPaceSelect')) el('lossPaceSelect').value = lossPace;
    if (el('deficitTargetInput')) el('deficitTargetInput').value = deficitTarget;
    if (el('proteinFactorSelect')) el('proteinFactorSelect').value = AppState.config.proteinFactor || 2.0;

    _updateLossPaceExplanation(w, lossPace, deficitTarget, weeklyLossKg);
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

window._onLossPaceChange = function() {
    const select = document.getElementById('lossPaceSelect');
    if (!select) return;
    const pace = select.value;
    const w = AppState.config.currentWeight || 75;
    import('./nutrition.js').then(m => {
        const def = m.calculateAutoDeficit(w, pace);
        const weeklyLoss = (def * 7) / 7700;
        _updateLossPaceExplanation(w, pace, def, weeklyLoss);
    });
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
        if (dayData) {
            let dayKcal = 0, dayProtein = 0;
            Object.values(dayData.meals).forEach(meal => {
                meal.forEach(food => { dayKcal += food.kcal; dayProtein += food.protein; });
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
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { dayKcal += food.kcal; dayProtein += food.protein; });
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
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { dayKcal += food.kcal; dayProtein += food.protein; });
        });

        if (dayKcal > 200) {
            const targets = getDynamicDayTargets(dateKey);
            const targetCals = targets?.cals || getCalorieTarget() || 1800;
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
        return Object.values(day.meals).some(meal => meal.length > 0);
    });

    const totalPages = Math.max(1, Math.ceil(datesWithData.length / HISTORY_PER_PAGE));
    if (_historyPage >= totalPages) _historyPage = totalPages - 1;

    const paged = datesWithData.slice(_historyPage * HISTORY_PER_PAGE, (_historyPage + 1) * HISTORY_PER_PAGE);

    const itemsHTML = paged.map(date => {
        const day = AppState.allDays[date];
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
