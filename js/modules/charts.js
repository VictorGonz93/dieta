// ==================== GRÁFICOS ====================

import AppState from './state.js';
import { calculateNextDayPredictionForDate } from './weight.js';
import { updateStatistics } from './stats.js';
import { getDynamicDayTargets, calculateRobustWeightTrend } from './nutrition.js';
import { getDateKey } from './storage.js';

const CHART_RANGE_KEY = 'chartRange';
const CHART_RANGES = [7, 30, 90];

/** Rango activo de los gráficos (7, 30 o 90 días), persistido en localStorage. */
export function getChartRange() {
    try {
        const saved = parseInt(localStorage.getItem(CHART_RANGE_KEY), 10);
        if (CHART_RANGES.includes(saved)) return saved;
    } catch (_) { /* localStorage no disponible */ }
    return 30;
}

export function setChartRange(days) {
    const range = parseInt(days, 10);
    if (!CHART_RANGES.includes(range)) return getChartRange();
    try { localStorage.setItem(CHART_RANGE_KEY, String(range)); } catch (_) { /* ignore */ }
    updateChartRangeButtons();
    initializeCharts();
    renderWeightPredictionChart();
    return range;
}

function updateChartRangeButtons() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const active = getChartRange();
    document.querySelectorAll('.chart-range-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.chartRange, 10) === active);
    });
}

function _rangeCutoffKey(range) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (range - 1));
    return getDateKey(cutoff);
}

function _inChartRange(dateKey, range, cutoffKey) {
    return typeof dateKey === 'string' && dateKey >= (cutoffKey || _rangeCutoffKey(range));
}

// Diferencia en días entre claves YYYY-MM-DD sin depender de la zona horaria.
function _dayDiff(a, b) {
    const [ay, am, ad] = String(a).split('-').map(Number);
    const [by, bm, bd] = String(b).split('-').map(Number);
    if ([ay, am, ad, by, bm, bd].some(n => !Number.isFinite(n))) return 0;
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function _formatDateKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return String(key);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

// Eje temporal real: cada día del rango ocupa su sitio, aunque no haya pesaje o
// comida registrada. Antes el gráfico encogía los huecos y una semana sin datos
// parecía un día, falseando la pendiente visual.
function _keyToDayNumber(dateKey) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function _dayNumberToKey(dayNumber) {
    const d = new Date(dayNumber * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function _continuousDateKeys(startKey, endKey) {
    const start = _keyToDayNumber(startKey);
    const end = _keyToDayNumber(endKey);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const keys = [];
    for (let d = start; d <= end; d++) keys.push(_dayNumberToKey(d));
    return keys;
}

function _sumMealMacros(day, key) {
    if (!day || !day.meals || typeof day.meals !== 'object') return 0;
    let total = 0;
    Object.values(day.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => {
            const n = parseFloat(food && food[key]);
            if (Number.isFinite(n)) total += n;
        });
    });
    return total;
}

export function initializeCharts() {
    updateChartRangeButtons();
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

    const range = getChartRange();
    const cutoff = _rangeCutoffKey(range);
    const weightsData = (AppState.config.weightHistory || [])
        .filter(w => w && typeof w.date === 'string' && Number.isFinite(parseFloat(w.weight)) && _inChartRange(w.date, range, cutoff))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // Filtrar entradas iniciales aisladas (p.ej. peso de inicio con gap >30d hasta la siguiente)
    let startIdx = 0;
    while (startIdx < weightsData.length - 1) {
        const gap = _dayDiff(weightsData[startIdx].date, weightsData[startIdx + 1].date);
        if (gap > 30) startIdx++; else break;
    }
    const displayData = weightsData.slice(startIdx);
    if (displayData.length === 0) return; // nada que dibujar (evita min/max = ±Infinity)

    // Días continuos entre el primer y el último pesaje: los huecos se ven como
    // huecos y el eje X refleja fechas reales, no posiciones de array.
    const continuousKeys = _continuousDateKeys(displayData[0].date, displayData[displayData.length - 1].date);
    const weightByDate = new Map(displayData.map(w => [w.date, parseFloat(w.weight)]));
    const labelsText = continuousKeys.map(_formatDateKey);
    const weights = continuousKeys.map(k => weightByDate.has(k) ? weightByDate.get(k) : null);
    const targetWeight = parseFloat(AppState.config.targetWeight);
    const showTarget = Number.isFinite(targetWeight) && targetWeight >= 25 && targetWeight <= 350;

    // Eje Y dinámico: rango real de los datos (y objetivo) ± 0.8 kg
    const axisWeights = showTarget ? [...displayData.map(w => parseFloat(w.weight)), targetWeight] : displayData.map(w => parseFloat(w.weight));
    const minW = Math.min(...axisWeights);
    const maxW = Math.max(...axisWeights);
    const yPad = 0.8;
    const yMin = Math.floor((minW - yPad) * 10) / 10;
    const yMax = Math.ceil((maxW + yPad) * 10) / 10;

    // Tendencia robusta (Theil-Sen + MAD) evaluada en cada día del eje.
    const fit = calculateRobustWeightTrend(displayData);
    const trendData = fit
        ? continuousKeys.map(k => {
            const x = _keyToDayNumber(k);
            return Math.round((fit.intercept + fit.slope * x) * 100) / 100;
        })
        : continuousKeys.map(() => null);

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
                    spanGaps: true,
                    order: 2,
                },
                ...(showTarget ? [{
                    label: `Objetivo (${targetWeight.toFixed(1)} kg)`,
                    data: new Array(labelsText.length).fill(targetWeight),
                    borderColor: '#FBBF24',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    fill: false,
                    pointRadius: 0,
                    order: 0,
                }] : []),
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
    const range = getChartRange();
    const cutoff = _rangeCutoffKey(range);
    // Filtrar días sin comidas registradas (y días corruptos sin meals)
    const filteredDates = allDates.filter(date => {
        const day = AppState.allDays[date];
        return _inChartRange(date, range, cutoff)
            && day && day.meals && typeof day.meals === 'object'
            && Object.values(day.meals).some(meal => Array.isArray(meal) && meal.length > 0);
    });
    const displayDates = filteredDates.slice(-range);
    if (displayDates.length === 0) return;
    // Eje temporal continuo: los días sin registro quedan como huecos, no se
    // comprimen contra los días con comida.
    const continuousKeys = _continuousDateKeys(displayDates[0], displayDates[displayDates.length - 1]);
    const kcalByDate = new Map(displayDates.map((date, i) => [date, _sumMealMacros(AppState.allDays[date], 'kcal')]));
    const targetByDate = new Map(displayDates.map(date => {
        const dyn = getDynamicDayTargets(date);
        return [date, dyn ? dyn.cals : 1800];
    }));
    const caloriesData = continuousKeys.map(k => kcalByDate.has(k) ? kcalByDate.get(k) : null);
    const dynamicTargetsData = continuousKeys.map(k => targetByDate.has(k) ? targetByDate.get(k) : null);

    const labelsText = continuousKeys.map(_formatDateKey);

    AppState.charts.calories = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsText,
            datasets: [
                {
                    label: 'Calorías Consumidas',
                    data: caloriesData,
                    backgroundColor: caloriesData.map((val, i) => val == null
                        ? 'transparent'
                        : val > (dynamicTargetsData[i] ?? 0)
                            ? 'rgba(248,113,113,0.85)'
                            : 'rgba(16,185,129,0.85)'),
                    borderRadius: 5,
                    borderSkipped: false,
                    order: 2,
                },
                {
                    label: 'Objetivo Adaptativo',
                    data: dynamicTargetsData,
                    type: 'line',
                    borderColor: '#FBBF24',
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 2,
                    fill: false,
                    spanGaps: true,
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
    const range2 = getChartRange();
    const cutoff2 = _rangeCutoffKey(range2);
    const filteredDates2 = allDates2.filter(date => {
        const day = AppState.allDays[date];
        return _inChartRange(date, range2, cutoff2)
            && day && day.meals && typeof day.meals === 'object'
            && Object.values(day.meals).some(meal => Array.isArray(meal) && meal.length > 0);
    });
    const displayDates2 = filteredDates2.slice(-range2);
    if (displayDates2.length === 0) return;
    // Eje temporal continuo, igual que en calorías.
    const continuousKeys = _continuousDateKeys(displayDates2[0], displayDates2[displayDates2.length - 1]);
    const proteinByDate = new Map(displayDates2.map(date => [date, _sumMealMacros(AppState.allDays[date], 'protein')]));
    const proteinTargetByDate = new Map(displayDates2.map(date => {
        const dyn = getDynamicDayTargets(date);
        return [date, dyn && Number.isFinite(dyn.protein) ? dyn.protein : (AppState.config.proteinGoal || 160)];
    }));
    const proteinData = continuousKeys.map(k => proteinByDate.has(k) ? proteinByDate.get(k) : null);

    const labelsText = continuousKeys.map(_formatDateKey);
    const proteinTargets = continuousKeys.map(k => proteinTargetByDate.has(k) ? proteinTargetByDate.get(k) : null);

    AppState.charts.protein = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [
                {
                    label: 'Proteína (g)',
                    data: proteinData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#10B981',
                    order: 2,
                },
                {
                    label: 'Objetivo diario',
                    data: proteinTargets,
                    borderColor: '#60A5FA',
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    fill: false,
                    spanGaps: true,
                    order: 1,
                }
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#6B8BAE', font: { size: 11 }, boxWidth: 24 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#6B8BAE', callback: v => v + 'g' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                x: { ticks: { color: '#6B8BAE' }, grid: { color: 'rgba(255,255,255,0.04)' } }
            },
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
    const range = getChartRange();
    const cutoff = _rangeCutoffKey(range);
    let totalProtein = 0, totalCarbs = 0, totalFats = 0, count = 0;

    dates.forEach(date => {
        if (!_inChartRange(date, range, cutoff)) return;
        const day = AppState.allDays[date];
        if (!day || !day.meals || typeof day.meals !== 'object') return;
        if (!Object.values(day.meals).some(m => Array.isArray(m) && m.length > 0)) return;
        Object.values(day.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => {
                const p = parseFloat(food && food.protein);
                const c = parseFloat(food && food.carbs);
                const f = parseFloat(food && food.fats);
                if (Number.isFinite(p)) totalProtein += p;
                if (Number.isFinite(c)) totalCarbs += c;
                if (Number.isFinite(f)) totalFats += f;
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
    if (typeof Chart === 'undefined') return;
    const range = getChartRange();
    const cutoff = _rangeCutoffKey(range);
    const history = (AppState.config.weightHistory || [])
        .filter(w => w && typeof w.date === 'string' && Number.isFinite(parseFloat(w.weight)) && _inChartRange(w.date, range, cutoff))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (history.length < 2) {
        if (msg) msg.classList.remove('hidden');
        canvas.classList.add('hidden');
        if (canvas.chart) { canvas.chart.destroy(); canvas.chart = null; }
        return;
    }
    if (msg) msg.classList.add('hidden');
    canvas.classList.remove('hidden');

    // Filtrar entradas iniciales aisladas (gap >30d hasta la siguiente)
    let predStartIdx = 0;
    while (predStartIdx < history.length - 1) {
        const gap = _dayDiff(history[predStartIdx].date, history[predStartIdx + 1].date);
        if (gap > 30) predStartIdx++; else break;
    }
    const filteredWH = history.slice(predStartIdx);

    // Eje temporal continuo entre el primer y el último pesaje del rango.
    const continuousKeys = _continuousDateKeys(filteredWH[0].date, filteredWH[filteredWH.length - 1].date);
    const realByDate = new Map(filteredWH.map(entry => [entry.date, parseFloat(entry.weight)]));
    const predictedByDate = new Map();

    // El predictedWeight guardado en la entrada[i] predice el día i+1, así que
    // se pinta en la fecha del pesaje siguiente.
    filteredWH.forEach((entry, idx) => {
        if (idx === 0) return;
        const prevEntry = filteredWH[idx - 1];
        let predicted = prevEntry.predictedWeight;
        if (predicted === undefined || predicted === null) {
            const pred = calculateNextDayPredictionForDate(prevEntry.date, prevEntry.weight);
            predicted = pred ? pred.predictedWeight : null;
        }
        predicted = parseFloat(predicted);
        if (Number.isFinite(predicted)) predictedByDate.set(entry.date, predicted);
    });

    const labels = continuousKeys.map(_formatDateKey);
    const realWeights = continuousKeys.map(k => realByDate.has(k) ? realByDate.get(k) : null);
    const predictedWeights = continuousKeys.map(k => predictedByDate.has(k) ? predictedByDate.get(k) : null);

    if (canvas.chart) canvas.chart.destroy();

    canvas.chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Peso Real',
                    data: realWeights,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: true,
                    borderWidth: 2.5,
                    pointRadius: 4,
                },
                {
                    label: 'Peso Predicho',
                    data: predictedWeights,
                    borderColor: '#60A5FA',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    fill: false,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 2,
                    spanGaps: true,
                },
                ...(Number.isFinite(parseFloat(AppState.config.targetWeight)) ? [{
                    label: `Objetivo (${parseFloat(AppState.config.targetWeight).toFixed(1)} kg)`,
                    data: new Array(labels.length).fill(parseFloat(AppState.config.targetWeight)),
                    borderColor: '#FBBF24',
                    backgroundColor: 'transparent',
                    fill: false,
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    pointRadius: 0,
                }] : []),
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#6B8BAE', font: { size: 11 } }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { color: '#6B8BAE', callback: v => v + ' kg' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                x: {
                    ticks: { color: '#6B8BAE' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            },
        },
    });
}

/**
 * Exporta un canvas de Chart.js como PNG con el fondo del tema y una marca de
 * fecha. Devuelve false si el gráfico no está visible o no hay soporte.
 */
export function exportChartPNG(canvasId, filename = 'grafico') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof canvas.toDataURL !== 'function' || !canvas.width || !canvas.height) return false;

    const out = document.createElement('canvas');
    const width = canvas.width;
    const height = canvas.height;
    const scale = (typeof canvas.clientWidth === 'number' && canvas.clientWidth > 0)
        ? Math.max(1, width / canvas.clientWidth)
        : 1;
    const footer = Math.max(26, Math.round(30 * scale));
    out.width = width;
    out.height = height + footer;

    const ctx = out.getContext('2d');
    if (!ctx) return false;

    const css = (typeof getComputedStyle === 'function') ? getComputedStyle(document.documentElement) : null;
    const bg = (css && css.getPropertyValue('--bg-card') || '#101928').trim() || '#101928';
    const fg = (css && css.getPropertyValue('--text-2') || '#6B8BAE').trim() || '#6B8BAE';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);

    const fontSize = Math.max(10, Math.round(footer * 0.38));
    ctx.fillStyle = fg;
    ctx.font = `${fontSize}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
        `Apex Nutrition · ${new Date().toLocaleDateString('es-ES')}`,
        Math.round(footer * 0.35),
        height + footer / 2
    );

    const link = document.createElement('a');
    link.download = `apex-${filename}-${getDateKey(new Date())}.png`;
    link.href = out.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    if (link.remove) link.remove();
    else if (link.parentNode) link.parentNode.removeChild(link);
    return true;
}
