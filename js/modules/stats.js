// ==================== ESTADÍSTICAS Y ANÁLISIS ====================

import AppState from './state.js';
import { getDateKey } from './storage.js';
import { getDayType, calculateTDEE, getCalorieTarget } from './nutrition.js';
import { calculateNextDayPredictionForDate } from './weight.js';

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

    const targetCals = getCalorieTarget();
    const dayInfo = getDayType(AppState.currentDate);
    const targetProtein = AppState.config.proteinGoal;
    const targetCarbs = dayInfo.type === 'entreno' ? AppState.config.carbsMax : AppState.config.carbsMax - 20;
    const targetFats = AppState.config.fatsMax;

    const missing = {
        kcal: Math.max(0, targetCals - sumKcal),
        protein: Math.max(0, targetProtein - sumProtein),
        carbs: Math.max(0, targetCarbs - sumCarbs),
        fats: Math.max(0, targetFats - sumFats),
    };

    return {
        consumido: { sumKcal, sumProtein, sumCarbs, sumFats },
        falta: missing,
        targetCarbs,
        porcentajeCals: Math.round((sumKcal / targetCals) * 100),
        porcentajeProtein: Math.round((sumProtein / targetProtein) * 100),
        porcentajeCarbos: Math.round((sumCarbs / targetCarbs) * 100),
        porcentajeFats: Math.round((sumFats / targetFats) * 100),
    };
}

export function calculateWeeklyStats() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    let totalWeight = 0, totalKcal = 0, totalDeficit = 0, daysRecorded = 0;
    const dailyStats = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateKey = getDateKey(date);

        const weight = AppState.config.weightHistory?.find(w => w.date === dateKey);
        if (weight) {
            daysRecorded++;
            totalWeight += weight.weight;

            const dayData = AppState.allDays[dateKey];
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

    const avgWeight = daysRecorded > 0 ? totalWeight / daysRecorded : AppState.config.currentWeight;
    const weeklyLoss = daysRecorded >= 2 ? dailyStats[0]?.weight - dailyStats[daysRecorded - 1]?.weight : 0;

    return {
        daysRecorded,
        avgWeight,
        avgKcal: Math.round(totalKcal / Math.max(daysRecorded, 1)),
        avgDeficit: Math.round(totalDeficit / Math.max(daysRecorded, 1)),
        weeklyLoss: weeklyLoss?.toFixed(2) || 0,
        dailyStats,
    };
}

export function getWeeklyProgress() {
    const stats = calculateWeeklyStats();
    const expectedWeeklyLoss = 0.5;
    const diff = parseFloat(stats.weeklyLoss) - expectedWeeklyLoss;
    const status = diff > -0.05 ? '✅ En camino' : diff > -0.2 ? '⚠️ Algo lento' : '❌ Muy lento';

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
            <div class="suggestions-title">⚡ Sugerencias de Macros</div>
            <div class="suggestions-content">
                <div class="progress-item">
                    <span>🔥 Calorías: ${consumido.sumKcal}/${getCalorieTarget()}</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(porcentajeCals, 100)}%"></div></div>
                    ${falta.kcal > 0 ? `<small>Te faltan ${falta.kcal} kcal</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>💪 Proteína: ${consumido.sumProtein.toFixed(0)}g / ${AppState.config.proteinGoal}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min((consumido.sumProtein / AppState.config.proteinGoal) * 100, 100)}%"></div></div>
                    ${falta.protein > 0 ? `<small>Te faltan ${falta.protein.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>🥔 Carbos: ${consumido.sumCarbs.toFixed(0)}g / ${targetCarbs}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(porcentajeCarbos, 100)}%"></div></div>
                    ${falta.carbs > 0 ? `<small>Te faltan ${falta.carbs.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
                </div>
                <div class="progress-item">
                    <span>🥑 Grasas: ${consumido.sumFats.toFixed(0)}g / ${AppState.config.fatsMax}g</span>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min((consumido.sumFats / AppState.config.fatsMax) * 100, 100)}%"></div></div>
                    ${falta.fats > 0 ? `<small>Te faltan ${falta.fats.toFixed(0)}g</small>` : '<small>✅ Alcanzada</small>'}
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
            <div class="progress-title">🎯 Progreso Semanal</div>
            <div class="progress-content">
                <div class="progress-indicator">
                    <div class="indicator-status">${progress.status}</div>
                    <div class="indicator-details">
                        <small>Pérdida actual: <strong>${progress.weeklyLoss} kg</strong> / Esperado: <strong>${progress.expectedWeeklyLoss} kg</strong></small>
                        <br><small>Diferencia: <strong>${progress.diff} kg</strong></small>
                    </div>
                </div>
                <div class="goal-info">
                    <div class="info-item"><span>📅 Días hasta meta:</span><strong>${progress.daysToGoal} días</strong></div>
                    <div class="info-item"><span>🎯 Fecha estimada:</span><strong>${progress.estimatedDate}</strong></div>
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
        container.innerHTML = `<div class="stats-card"><div class="stats-title">📈 Resumen Semanal</div><div class="stats-content"><p class="text-slate-400 text-sm">Registra pesos esta semana para ver estadísticas</p></div></div>`;
        return;
    }

    container.innerHTML = `
        <div class="stats-card">
            <div class="stats-title">📈 Resumen Semanal</div>
            <div class="stats-content">
                <div class="stat-item"><span>📊 Días registrados:</span><strong>${stats.daysRecorded} / 7</strong></div>
                <div class="stat-item"><span>⚖️ Peso promedio:</span><strong>${(stats.avgWeight || 0).toFixed(1)} kg</strong></div>
                <div class="stat-item"><span>📉 Pérdida semanal:</span><strong>${stats.weeklyLoss} kg</strong></div>
                <div class="stat-item"><span>🍽️ Calorías promedio:</span><strong>${stats.avgKcal} kcal/día</strong></div>
                <div class="stat-item"><span>❌ Déficit promedio:</span><strong>${stats.avgDeficit} kcal/día</strong></div>
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

    container.innerHTML = `
        <div class="accuracy-card">
            <div class="accuracy-title">🎯 Precisión de Predicciones</div>
            <div class="accuracy-content">
                <div class="accuracy-stats">
                    <div class="stat"><span>Error promedio:</span><strong>${accuracy.avgError} kg</strong></div>
                    <div class="stat"><span>Precisión:</span><strong>${accuracy.accuracy}%</strong></div>
                    <div class="stat"><span>Comparaciones:</span><strong>${accuracy.totalComparisons}</strong></div>
                </div>
                <div class="predictions-list">
                    <small><strong>Últimas predicciones vs realidad:</strong></small>
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

export function displayGoalsTracking() {
    updateGoalsDisplay();
    import('./weight.js').then(m => m.renderWeightHistory());
}

export function updateGoalsDisplay() {
    const { startWeight, currentWeight, targetWeight } = AppState.config;
    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const stillToLose = currentWeight - targetWeight;
    const progressPercent = totalToLose > 0 ? Math.round((alreadyLost / totalToLose) * 100) : 0;
    const weeklyLoss = 0.5;
    const weeksRemaining = Math.ceil(stillToLose / weeklyLoss);
    const daysRemaining = weeksRemaining * 7;

    const calsTarget = getCalorieTarget() || 1550;
    const proteinTarget = AppState.config.proteinGoal || 160;
    const carbsTarget = AppState.config.carbsMax || 130;
    const fatsTarget = AppState.config.fatsMax || 60;

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
            timeEstimate = '¡Ya casi! 🎉';
            timeExplain = 'Estás muy cerca de tu objetivo';
        } else if (weeksRemaining < 4) {
            timeEstimate = `${weeksRemaining} semana${weeksRemaining > 1 ? 's' : ''}`;
            timeExplain = `Aproximadamente ${daysRemaining} días`;
        } else {
            const months = Math.ceil(weeksRemaining / 4.3);
            timeEstimate = `${months} mes${months > 1 ? 'es' : ''}`;
            timeExplain = `Aproximadamente ${weeksRemaining} semanas`;
        }
    } else {
        timeEstimate = '✅ ¡Objetivo alcanzado!';
        timeExplain = 'Has llegado a tu peso objetivo';
    }

    if (el('goalTimeEstimate')) el('goalTimeEstimate').textContent = timeEstimate;
    if (el('goalTimeExplain')) el('goalTimeExplain').textContent = timeExplain;
    if (el('goalCals')) el('goalCals').textContent = Math.round(calsTarget);
    if (el('goalProtein')) el('goalProtein').textContent = Math.round(proteinTarget);
    if (el('goalCarbs')) el('goalCarbs').textContent = Math.round(carbsTarget);
    if (el('goalFats')) el('goalFats').textContent = Math.round(fatsTarget);

    updateMotivationMessage(progressPercent, stillToLose);
}

export function updateMotivationMessage(progressPercent, stillToLose) {
    const container = document.getElementById('motivationMessage');
    if (!container) return;

    let message = '';
    if (progressPercent === 0) message = '🚀 ¡Comienza tu viaje! Cada paso te acerca a tu objetivo.';
    else if (progressPercent < 25) message = '💪 ¡Buen comienzo! Llevas el impulso inicial. Sigue así.';
    else if (progressPercent < 50) message = '🔥 ¡Vas muy bien! Ya llevas avance visible. ¡Continúa!';
    else if (progressPercent < 75) message = '⚡ ¡Más de la mitad! Ya falta menos. La meta está a la vista.';
    else if (progressPercent < 100) message = '🎯 ¡Estás muy cerca! Sigue con el ritmo, ya casi lo logras.';
    else message = '🏆 ¡FELICIDADES! 🎉 ¡Has alcanzado tu objetivo!';

    container.innerHTML = `<p class="text-lg text-slate-100 leading-relaxed">${message}</p>`;
}

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
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
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
    let bestDay = null, maxProtein = 0;

    dates.forEach(date => {
        const day = AppState.allDays[date];
        let dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { dayProtein += food.protein; });
        });
        if (dayProtein > maxProtein) { maxProtein = dayProtein; bestDay = { date, protein: dayProtein, dayNumber: day.dayNumber }; }
    });

    container.innerHTML = bestDay
        ? `<p><strong>Día ${bestDay.dayNumber}</strong></p><p><strong>Proteína:</strong> ${bestDay.protein.toFixed(1)}g</p><p><strong>Fecha:</strong> ${bestDay.date}</p>`
        : '<p>Sin datos registrados</p>';
}

export function updateHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const dates = Object.keys(AppState.allDays).sort().reverse();

    container.innerHTML = dates.slice(0, 10).map(date => {
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
                    <div class="history-macro"><span class="history-macro-label">Kcal</span><span class="history-macro-value">${dayKcal.toFixed(0)}</span></div>
                    <div class="history-macro"><span class="history-macro-label">Proteína</span><span class="history-macro-value">${dayProtein.toFixed(1)}g</span></div>
                    <div class="history-macro"><span class="history-macro-label">Carbos</span><span class="history-macro-value">${dayCarbs.toFixed(1)}g</span></div>
                    <div class="history-macro"><span class="history-macro-label">Grasas</span><span class="history-macro-value">${dayFats.toFixed(1)}g</span></div>
                </div>
            </div>
        `;
    }).join('');
}
