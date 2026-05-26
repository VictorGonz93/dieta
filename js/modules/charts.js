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
    const displayData = weightsData.slice(-30);
    const labelsText = displayData.map(w => {
        const d = new Date(w.date);
        return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    });
    const weights = displayData.map(w => w.weight);

    AppState.charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Peso (kg)',
                data: weights,
                borderColor: '#4299e1',
                backgroundColor: 'rgba(66, 153, 225, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#4299e1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: false,
                    min: AppState.config.targetWeight - 5,
                    max: AppState.config.startWeight + 2,
                },
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

    const dates = Object.keys(AppState.allDays).sort();
    const caloriesData = dates.map(date => {
        const day = AppState.allDays[date];
        let totalKcal = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { totalKcal += food.kcal; });
        });
        return totalKcal;
    }).slice(-30);

    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));

    AppState.charts.calories = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Calorías',
                data: caloriesData,
                backgroundColor: caloriesData.map(val => val > AppState.config.calsEntrenamiento ? '#f56565' : '#48bb78'),
                borderRadius: 6,
                borderSkipped: false,
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

export function initProteinChart() {
    const ctx = document.getElementById('proteinChart');
    if (!ctx) return;

    if (AppState.charts.protein) {
        AppState.charts.protein.destroy();
        AppState.charts.protein = null;
    }

    const dates = Object.keys(AppState.allDays).sort();
    const proteinData = dates.map(date => {
        const day = AppState.allDays[date];
        let totalProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => { totalProtein += food.protein; });
        });
        return totalProtein;
    }).slice(-30);

    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));

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
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalProtein += food.protein;
                totalCarbs += food.carbs;
                totalFats += food.fats;
            });
        });
        if (Object.values(day.meals).some(m => m.length > 0)) count++;
    });

    const avgProteinCals = totalProtein * 4 / count;
    const avgCarbsCals = totalCarbs * 4 / count;
    const avgFatsCals = totalFats * 9 / count;

    AppState.charts.macro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Proteína (4 kcal/g)', 'Carbos (4 kcal/g)', 'Grasas (9 kcal/g)'],
            datasets: [{
                data: [avgProteinCals, avgCarbsCals, avgFatsCals],
                backgroundColor: ['#4299e1', '#48bb78', '#ed8936'],
                borderRadius: 8,
                borderWidth: 2,
                borderColor: '#fff',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } },
            },
        },
    });
}

export function renderWeightPredictionChart() {
    const canvas = document.getElementById('weightPredictionChart');
    if (!canvas || !AppState.config.weightHistory || AppState.config.weightHistory.length < 2) {
        if (canvas) canvas.parentElement.innerHTML = '<small>Necesitas más datos para mostrar el gráfico</small>';
        return;
    }

    const labels = [];
    const realWeights = [];
    const predictedWeights = [];

    AppState.config.weightHistory.forEach((entry, idx) => {
        labels.push(entry.date);
        realWeights.push(entry.weight);

        if (entry.predictedWeight !== undefined && entry.predictedWeight !== null) {
            predictedWeights.push(entry.predictedWeight);
        } else if (idx > 0) {
            const pred = calculateNextDayPredictionForDate(
                AppState.config.weightHistory[idx - 1].date,
                AppState.config.weightHistory[idx - 1].weight
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
