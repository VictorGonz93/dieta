// ==================== GRÁFICOS ====================

import AppState from './state.js';
import { calculateNextDayPredictionForDate } from './weight.js';
import { updateStatistics } from './stats.js';

export function initializeCharts() {
    if (window.Chart) {
        initWeightChart();
        initCaloriesChart();
        initProteinChart();
        initMacroChart();
        updateStatistics();
    }
}

export function initWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;

    if (AppState.charts.weight) {
        AppState.charts.weight.destroy();
        AppState.charts.weight = null;
    }

    const weightsData = AppState.config.weightHistory || [];
    // Filtrar entradas iniciales aisladas (p.ej. peso de inicio con gap >30d hasta la siguiente)
    let startIdx = 0;
    while (startIdx < weightsData.length - 1) {
        const gap = (new Date(weightsData[startIdx + 1].date) - new Date(weightsData[startIdx].date)) / 86400000;
        if (gap > 30) startIdx++; else break;
    }
    const displayData = weightsData.slice(startIdx).slice(-30);
    const labelsText = displayData.map(w => {
        const d = new Date(w.date);
        return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    });
    const weights = displayData.map(w => w.weight);

    // Eje Y dinámico: rango real de los datos ± 0.8 kg
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const yPad = 0.8;
    const yMin = Math.floor((minW - yPad) * 10) / 10;
    const yMax = Math.ceil((maxW + yPad) * 10) / 10;

    // Línea de tendencia (regresión lineal)
    function linearRegression(data) {
        const n = data.length;
        if (n < 2) return data.map(() => null);
        const xs = data.map((_, i) => i);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = data.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((sum, x, i) => sum + x * data[i], 0);
        const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return xs.map(x => Math.round((slope * x + intercept) * 100) / 100);
    }
    const trendData = linearRegression(weights);

    AppState.charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [
                {
                    label: 'Peso (kg)',
                    data: weights,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#10B981',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    order: 1,
                },
                {
                    label: 'Tendencia',
                    data: trendData,
                    borderColor: '#60A5FA',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    order: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#6B8BAE', font: { size: 11 }, boxWidth: 24, padding: 12 },
                },
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: yMin,
                    max: yMax,
                    ticks: { color: '#6B8BAE', callback: v => v + ' kg' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                x: { ticks: { color: '#6B8BAE' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            },
        },
    });
}

export function initCaloriesChart() {
    const ctx = document.getElementById('caloriesChart');
    if (!ctx) return;

    if (AppState.charts.calories) {
        AppState.charts.calories.destroy();
        AppState.charts.calories = null;
    }

    const allDates = Object.keys(AppState.allDays).sort();
    // Filtrar días sin comidas registradas
    const filteredDates = allDates.filter(date => {
        const day = AppState.allDays[date];
        return Object.values(day.meals).some(meal => meal.length > 0);
    });
    const displayDates = filteredDates.slice(-30);
    const caloriesData = displayDates.map(date => {
        const day = AppState.allDays[date];
        let totalKcal = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { totalKcal += food.kcal; });
        });
        return totalKcal;
    });

    const labelsText = displayDates.map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));

    const caloriesGoal = AppState.config.calsEntrenamiento || 1800;
    const caloriesRest = AppState.config.calsDescanso || 1650;
    const avgGoal = Math.round((caloriesGoal + caloriesRest) / 2);

    AppState.charts.calories = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsText,
            datasets: [
                {
                    label: 'Calorías',
                    data: caloriesData,
                    backgroundColor: caloriesData.map(val => val > caloriesGoal ? 'rgba(248,113,113,0.85)' : 'rgba(16,185,129,0.85)'),
                    borderRadius: 5,
                    borderSkipped: false,
                    order: 2,
                },
                {
                    label: `Objetivo entreno (${caloriesGoal})`,
                    data: new Array(labelsText.length).fill(caloriesGoal),
                    type: 'line',
                    borderColor: '#FBBF24',
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    fill: false,
                    order: 1,
                },
                {
                    label: `Objetivo descanso (${caloriesRest})`,
                    data: new Array(labelsText.length).fill(caloriesRest),
                    type: 'line',
                    borderColor: '#A78BFA',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    fill: false,
                    order: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#6B8BAE', font: { size: 11 }, boxWidth: 24, padding: 10 },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#6B8BAE' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                x: { ticks: { color: '#6B8BAE' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            },
        },
    });
}

export function initProteinChart() {
    const ctx = document.getElementById('proteinChart');
    if (!ctx) return;

    if (AppState.charts.protein) {
        AppState.charts.protein.destroy();
        AppState.charts.protein = null;
    }

    const allDates2 = Object.keys(AppState.allDays).sort();
    const filteredDates2 = allDates2.filter(date => {
        const day = AppState.allDays[date];
        return Object.values(day.meals).some(meal => meal.length > 0);
    });
    const displayDates2 = filteredDates2.slice(-30);
    const proteinData = displayDates2.map(date => {
        const day = AppState.allDays[date];
        let totalProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { totalProtein += food.protein; });
        });
        return totalProtein;
    });

    const labelsText = displayDates2.map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));

    AppState.charts.protein = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Proteína (g)',
                data: proteinData,
                borderColor: '#48bb78',
                backgroundColor: 'rgba(72, 187, 120, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
        },
    });
}

export function initMacroChart() {
    const ctx = document.getElementById('macroChart');
    if (!ctx) return;

    if (AppState.charts.macro) {
        AppState.charts.macro.destroy();
        AppState.charts.macro = null;
    }

    const dates = Object.keys(AppState.allDays).sort();
    let totalProtein = 0, totalCarbs = 0, totalFats = 0, count = 0;

    dates.forEach(date => {
        const day = AppState.allDays[date];
        if (!Object.values(day.meals).some(m => m.length > 0)) return;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalProtein += food.protein || 0;
                totalCarbs   += food.carbs   || 0;
                totalFats    += food.fats    || 0;
            });
        });
        count++;
    });

    if (count === 0) return;

    const avgProteinG  = totalProtein / count;
    const avgCarbsG    = totalCarbs   / count;
    const avgFatsG     = totalFats    / count;

    const avgProteinKcal = avgProteinG * 4;
    const avgCarbsKcal   = avgCarbsG   * 4;
    const avgFatsKcal    = avgFatsG    * 9;
    const totalKcal      = avgProteinKcal + avgCarbsKcal + avgFatsKcal;

    AppState.charts.macro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Proteína', 'Carbohidratos', 'Grasas'],
            datasets: [{
                data: [avgProteinKcal, avgCarbsKcal, avgFatsKcal],
                backgroundColor: ['#60A5FA', '#10B981', '#FBBF24'],
                borderRadius: 6,
                borderWidth: 2,
                borderColor: 'rgba(0,0,0,0.3)',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 16,
                        font: { size: 12 },
                        color: '#DBE8F8',
                        generateLabels(chart) {
                            const ds = chart.data.datasets[0];
                            const grams = [avgProteinG, avgCarbsG, avgFatsG];
                            return chart.data.labels.map((label, i) => {
                                const pct = totalKcal > 0 ? Math.round(ds.data[i] / totalKcal * 100) : 0;
                                return {
                                    text: `${label}  ${pct}%  (${Math.round(grams[i])}g · ${Math.round(ds.data[i])} kcal)`,
                                    fillStyle: ds.backgroundColor[i],
                                    strokeStyle: ds.borderColor,
                                    lineWidth: 1,
                                    index: i,
                                };
                            });
                        },
                    },
                },
                tooltip: {
                    callbacks: {
                        label(item) {
                            const kcal = Math.round(item.raw);
                            const pct  = totalKcal > 0 ? Math.round(item.raw / totalKcal * 100) : 0;
                            const grams = [avgProteinG, avgCarbsG, avgFatsG][item.dataIndex];
                            return ` ${item.label}: ${pct}%  ·  ${Math.round(grams)}g/día  ·  ${kcal} kcal/día`;
                        },
                        title() { return `Media diaria (${count} días)`; },
                    },
                },
            },
        },
    });
}

export function renderWeightPredictionChart() {
    const canvas = document.getElementById('weightPredictionChart');
    const msg = document.getElementById('weightPredictionChartMsg');
    if (!canvas) return;
    if (!AppState.config.weightHistory || AppState.config.weightHistory.length < 2) {
        if (msg) msg.classList.remove('hidden');
        canvas.classList.add('hidden');
        return;
    }
    if (msg) msg.classList.add('hidden');
    canvas.classList.remove('hidden');

    const labels = [];
    const realWeights = [];
    const predictedWeights = [];

    // Filtrar entradas iniciales aisladas (gap >30d hasta la siguiente)
    const wh = AppState.config.weightHistory;
    let predStartIdx = 0;
    while (predStartIdx < wh.length - 1) {
        const gap = (new Date(wh[predStartIdx + 1].date) - new Date(wh[predStartIdx].date)) / 86400000;
        if (gap > 30) predStartIdx++; else break;
    }
    const filteredWH = wh.slice(predStartIdx);

    filteredWH.forEach((entry, idx) => {
        labels.push(entry.date);
        realWeights.push(entry.weight);

        if (entry.predictedWeight !== undefined && entry.predictedWeight !== null) {
            predictedWeights.push(entry.predictedWeight);
        } else if (idx > 0) {
            const pred = calculateNextDayPredictionForDate(
                filteredWH[idx - 1].date,
                filteredWH[idx - 1].weight
            );
            if (pred) predictedWeights.push(pred.predictedWeight);
        }
    });

    if (canvas.chart) canvas.chart.destroy();

    canvas.chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Peso Real',
                    data: realWeights,
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: 'Peso Predicho',
                    data: predictedWeights,
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    tension: 0.3,
                    fill: true,
                    borderDash: [5, 5],
                },
            ],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: false, title: { display: true, text: 'Peso (kg)' } } },
        },
    });
}
