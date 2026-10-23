// ==================== GESTIÓN DE COMIDAS Y DÍAS ====================

import AppState from './state.js';
import { escapeHTML } from './utils.js';
import { getDateKey, saveDays, safeSet } from './storage.js';
import { getDayNumber, getDayType, getCalorieTarget, getDynamicDayTargets } from './nutrition.js';
import { getWorkoutSessions } from './workout.js';
import {
    calculateNextDayPredictionForDate,
    displayNextDayPrediction,
    saveWeightHistory,
} from './weight.js';
import { showNotification } from './ui/notifications.js';

// ==================== HISTORIAL DE COMIDAS ====================

export function loadMealHistory() {
    const saved = localStorage.getItem('meal_history');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            AppState.mealHistory = Array.isArray(parsed)
                ? parsed.filter(m => m && typeof m === 'object' && typeof m.name === 'string')
                : [];
        } catch (e) {
            console.warn('Meal history corrupto, reiniciando:', e.message);
            AppState.mealHistory = [];
        }
    }
}

export function saveMealHistory() {
    const history = Array.isArray(AppState.mealHistory) ? AppState.mealHistory : [];
    return safeSet('meal_history', history.slice(0, 50));
}

export function addToMealHistory(mealData) {
    if (!AppState.mealHistory) AppState.mealHistory = [];
    const num = (v) => {
        const n = typeof v === 'number' ? v : parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    AppState.mealHistory.unshift({
        timestamp: Date.now(),
        name: String(mealData.name || '').trim().slice(0, 160),
        quantity: num(mealData.quantity),
        unit: String(mealData.unit || 'g').slice(0, 20),
        kcal: num(mealData.kcal),
        protein: num(mealData.protein),
        carbs: num(mealData.carbs),
        fats: num(mealData.fats),
    });
    saveMealHistory();
}

export function getFrequentMeals() {
    const frequencyMap = {};
    AppState.mealHistory.forEach(meal => {
        frequencyMap[meal.name] = (frequencyMap[meal.name] || 0) + 1;
    });
    return Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name]) => AppState.mealHistory.find(m => m.name === name));
}

// ==================== GESTIÓN DE DÍAS ====================

export function initializeToday() {
    const dateKey = getDateKey(AppState.currentDate);
    if (!AppState.allDays[dateKey]) {
        AppState.allDays[dateKey] = {
            date: dateKey,
            dayNumber: getDayNumber(AppState.currentDate),
            meals: { breakfast: [], lunch: [], snack: [], dinner: [] },
            notes: '',
        };
        saveDays();
    }
    renderDay();
    if (document.getElementById('sport-entreno-hoy')) {
        import('./ui/workout-ui.js').then(m => m.renderTodayWorkout());
    }
}

export function renderDay() {
    const dateKey = getDateKey(AppState.currentDate);
    const dayData = AppState.allDays[dateKey];

    if (!dayData) {
        initializeToday();
        return;
    }

    const dayNumber = getDayNumber(AppState.currentDate);
    const formattedDate = AppState.currentDate.toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const dayInfo = getDayType(AppState.currentDate);
    const dayTypeClass = dayInfo.type === 'entreno' ? 'entreno' : 'descanso';
    const dayTypeIcon = dayInfo.type === 'entreno' ? 'fitness_center' : 'self_improvement';
    const dayName = dayInfo.label;

    if (document.getElementById('dayTitle')) {
        document.getElementById('dayTitle').innerHTML =
            `Día ${dayNumber} <span class="day-type-badge ${dayTypeClass} ml-2"><span class="material-icons">${dayTypeIcon}</span>${escapeHTML(dayName)}</span>`;
    }
    if (document.getElementById('dayDate')) {
        document.getElementById('dayDate').textContent = formattedDate;
    }

    const todayWeight = AppState.config.weightHistory?.find(w => w.date === dateKey);
    if (document.getElementById('dailyWeightInput')) {
        document.getElementById('dailyWeightInput').value = todayWeight ? todayWeight.weight : '';
    }

    renderMealSection('breakfast', dayData.meals.breakfast);
    renderMealSection('lunch', dayData.meals.lunch);
    renderMealSection('snack', dayData.meals.snack);
    renderMealSection('dinner', dayData.meals.dinner);

    const notesInput = document.getElementById('dayNotesInput');
    if (notesInput) {
        notesInput.value = dayData.notes || '';
    }

    updateDaySummary(dayData);
    displayNextDayPrediction();

    // Actualizar progreso semanal
    import('./stats.js').then(m => m.displayWeeklyProgress());
}

function _number(value, fallback = 0) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string' && value.trim() !== '') {
        // Datos en español pueden llegar como "100,5": parseFloat los cortaba
        // en 100 sin avisar. Number rechaza basura tipo "10abc".
        const n = Number(value.trim().replace(',', '.'));
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

export function renderMealSection(mealName, foods) {
    const container = document.getElementById(mealName + '-items');
    const totalEl = document.getElementById(mealName + '-total');
    if (!container || !totalEl) return;

    container.innerHTML = '';
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

    (Array.isArray(foods) ? foods : []).forEach((rawFood, index) => {
        const food = rawFood && typeof rawFood === 'object' ? rawFood : {};
        const kcal = _number(food.kcal);
        const protein = _number(food.protein);
        const carbs = _number(food.carbs);
        const fats = _number(food.fats);
        const foodEl = document.createElement('div');
        foodEl.className = 'food-item';
        const timeDisplay = food.time ? ` <span class="food-time"><span class="material-icons" style="font-size:11px;vertical-align:middle">schedule</span> ${escapeHTML(food.time)}</span>` : '';
        const quantityDisplay = `${food.quantity ?? ''} ${food.unit ?? ''}`.trim();
        foodEl.innerHTML = `
            <span class="food-item-name">${escapeHTML(food.name || 'Alimento')} (${escapeHTML(quantityDisplay)})${timeDisplay}</span>
            <span class="food-item-macros">
                <span class="food-macro kcal">${kcal.toFixed(0)} kcal</span>
                <span class="food-macro protein">${protein.toFixed(1)}g P</span>
            </span>
            <button class="food-item-delete" onclick="window.deleteFood('${mealName}', ${index})">×</button>
        `;
        container.appendChild(foodEl);

        totalKcal += kcal;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFats += fats;
    });

    totalEl.textContent = `${totalKcal.toFixed(0)} kcal | ${totalProtein.toFixed(1)}g P`;
}

export function updateDaySummary(dayData, dateKey) {
    const _dateKey = dateKey || getDateKey(AppState.currentDate);
    const meals = ['breakfast', 'lunch', 'snack', 'dinner'];
    const day = (dayData && typeof dayData === 'object' && dayData.meals)
        ? dayData
        : AppState.allDays[_dateKey];
    const mealData = day && day.meals && typeof day.meals === 'object' ? day.meals : {};
    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;

    meals.forEach(meal => {
        const foods = Array.isArray(mealData[meal]) ? mealData[meal] : [];
        foods.forEach(food => {
            if (!food || typeof food !== 'object') return;
            sumKcal += _number(food.kcal);
            sumProtein += _number(food.protein);
            sumCarbs += _number(food.carbs);
            sumFats += _number(food.fats);
        });
    });

    const targets = getDynamicDayTargets(_dateKey);
    const w = AppState.config.currentWeight || 75;
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;

    // ?? (no ||): carbs puede ser 0 legítimo y || lo convertiría en 130
    const targetCals    = targets?.cals    ?? 1800;
    const targetProtein = targets?.protein ?? Math.round(w * pFactor);
    const targetCarbs   = targets?.carbs   ?? 130;
    const targetFats    = targets?.fats    ?? Math.round(w * 0.8);

    // (Bloque sum*/status* eliminado: esos IDs no existen en index.html;
    // el resumen vive en updateQuickMacros.)
    updateQuickMacros(sumKcal, sumProtein, sumCarbs, sumFats, targetCals, targetProtein, targetCarbs, targetFats);
    updateStepsDisplay();
}

export function updateQuickMacros(kcal, protein, carbs, fats, targetCals, targetProtein, targetCarbs, targetFats) {
    if (document.getElementById('quickCals'))    document.getElementById('quickCals').textContent    = `${kcal.toFixed(0)} / ${targetCals || 0}`;
    if (document.getElementById('quickProtein')) document.getElementById('quickProtein').textContent = `${protein.toFixed(1)} / ${targetProtein || 0}g`;
    if (document.getElementById('quickCarbs'))   document.getElementById('quickCarbs').textContent   = `${carbs.toFixed(1)} / ${targetCarbs || 0}g`;
    if (document.getElementById('quickFats'))    document.getElementById('quickFats').textContent    = `${fats.toFixed(1)} / ${targetFats || 0}g`;
}

export function updateStepsDisplay() {
    const container = document.getElementById('stepsContainer');
    if (!container) return;

    const dateKey = getDateKey(AppState.currentDate);
    const sessions = getWorkoutSessions();
    const session = sessions[dateKey];

    let totalSteps = 0;
    if (session && session.exercises) {
        for (const ex of session.exercises) {
            if (ex.trackingType === 'steps' && ex.sets) {
                for (const set of ex.sets) {
                    totalSteps += parseFloat(set.steps) || 0;
                }
            }
        }
    }

    if (totalSteps <= 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const w = AppState.config.currentWeight || 75;
    const met = 3.8;
    const estKcal = Math.round(met * w * (totalSteps / 100 / 60));
    const goal = 10000;
    const pct = Math.min((totalSteps / goal) * 100, 100);

    const stepsEl = document.getElementById('stepsValue');
    const fillEl = document.getElementById('stepsFill');
    const infoEl = document.getElementById('stepsKcalInfo');

    if (stepsEl) stepsEl.textContent = `${totalSteps.toLocaleString('es-ES')} / ${goal.toLocaleString('es-ES')}`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (infoEl) infoEl.textContent = `≈ ${estKcal} kcal quemadas (MET ${met} × ${w}kg)`;
}

export function getStatusTarget(value, target) {
    const diff = value - target;
    const absDiff = Math.abs(diff);
    if (absDiff <= 50) return '✓';
    if (absDiff <= 150) return `${diff > 0 ? '+' : ''}${diff.toFixed(0)}`;
    return `${diff > 0 ? '+' : ''}${diff.toFixed(0)}`;
}

export function getStatusRange(value, min, max) {
    if (value >= min && value <= max) return '✓';
    if (value > max) return `+${(value - max).toFixed(0)}`;
    return `-${(min - value).toFixed(0)}`;
}

// ==================== AGREGAR / ELIMINAR COMIDA ====================

export function addFood() {
    if (!AppState.currentMealForModal) return;

    const mealSlot = AppState.currentMealForModal;
    if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(mealSlot)) return;

    const name = String(document.getElementById('foodName').value || '').trim();
    const rawQuantity = parseFloat(document.getElementById('foodQuantity').value);
    const unit = String(document.getElementById('foodUnit').value || 'g').trim().slice(0, 20) || 'g';
    const kcal = parseFloat(document.getElementById('foodCals').value);
    const protein = parseFloat(document.getElementById('foodProtein').value);
    const carbs = parseFloat(document.getElementById('foodCarbs').value);
    const fats = parseFloat(document.getElementById('foodFats').value);
    const timeRaw = String(document.getElementById('foodTime').value || '');
    const time = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : null;

    if (!name) {
        showNotification('Pon un nombre al alimento', 'error');
        return;
    }
    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0 || rawQuantity > 100000) {
        showNotification('La cantidad debe ser un número mayor que 0', 'error');
        return;
    }
    const macros = { kcal, protein, carbs, fats };
    const invalidMacro = Object.entries(macros).find(([, v]) => !Number.isFinite(v) || v < 0 || v > 100000);
    if (invalidMacro) {
        showNotification('Las calorías y macros deben ser números no negativos', 'error');
        return;
    }

    const dateKey = getDateKey(AppState.currentDate);
    const todayKey = getDateKey(new Date());
    if (dateKey > todayKey) {
        showNotification('No puedes registrar comida en una fecha futura', 'warning');
        return;
    }
    if (!AppState.allDays[dateKey] || !AppState.allDays[dateKey].meals) {
        initializeToday();
    }
    const day = AppState.allDays[dateKey];
    if (!day || !day.meals) return;
    if (!Array.isArray(day.meals[mealSlot])) day.meals[mealSlot] = [];

    const food = {
        name: name.slice(0, 160),
        quantity: Math.round(rawQuantity * 100) / 100,
        unit,
        kcal: Math.round(kcal * 100) / 100,
        protein: Math.round(protein * 100) / 100,
        carbs: Math.round(carbs * 100) / 100,
        fats: Math.round(fats * 100) / 100,
        time,
    };

    day.meals[mealSlot].push(food);
    saveDays();
    addToMealHistory(food);

    if (AppState.config.weightHistory && AppState.config.currentWeight) {
        const todayEntry = AppState.config.weightHistory.find(w => w.date === dateKey);
        if (todayEntry) {
            const updatedPrediction = calculateNextDayPredictionForDate(dateKey, AppState.config.currentWeight);
            todayEntry.predictedWeight = updatedPrediction ? updatedPrediction.predictedWeight : null;
            saveWeightHistory();
        }
    }

    import('./ui/modal.js').then(m => m.closeModal());
    renderDay();
    updateDaySummary(AppState.allDays[dateKey], dateKey);
    displayNextDayPrediction();
    import('./charts.js').then(m => m.renderWeightPredictionChart());
    showNotification(`${food.name} agregado correctamente`);
}

export function deleteFood(meal, index) {
    const dateKey = getDateKey(AppState.currentDate);
    const day = AppState.allDays[dateKey];
    const foods = day && day.meals && Array.isArray(day.meals[meal]) ? day.meals[meal] : null;
    if (!foods) return;
    const idx = parseInt(index, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= foods.length) return;
    const removed = foods.splice(idx, 1)[0];
    saveDays();

    if (AppState.config.weightHistory && AppState.config.currentWeight) {
        const todayEntry = AppState.config.weightHistory.find(w => w.date === dateKey);
        if (todayEntry) {
            const updatedPrediction = calculateNextDayPredictionForDate(dateKey, AppState.config.currentWeight);
            todayEntry.predictedWeight = updatedPrediction ? updatedPrediction.predictedWeight : null;
            saveWeightHistory();
        }
    }

    renderDay();
    updateDaySummary(AppState.allDays[dateKey], dateKey);
    displayNextDayPrediction();
    import('./charts.js').then(m => m.renderWeightPredictionChart());

    let undone = false;
    showNotification(`"${removed.name}" eliminado · Deshacer`, 'warning', () => {
        if (undone) return;
        undone = true;
        const currentFoods = AppState.allDays[dateKey]?.meals?.[meal];
        if (!Array.isArray(currentFoods)) return;
        currentFoods.splice(Math.min(idx, currentFoods.length), 0, removed);
        saveDays();
        renderDay();
        updateDaySummary(AppState.allDays[dateKey], dateKey);
        displayNextDayPrediction();
        import('./charts.js').then(m => m.renderWeightPredictionChart());
        showNotification('Comida restaurada', 'success');
    }, 5000);
}

// ==================== NAVEGACIÓN DE DÍAS ====================

export function previousDay() {
    AppState.currentDate.setDate(AppState.currentDate.getDate() - 1);
    AppState.currentDate = new Date(AppState.currentDate);
    initializeToday();
}

export function nextDay() {
    AppState.currentDate.setDate(AppState.currentDate.getDate() + 1);
    AppState.currentDate = new Date(AppState.currentDate);
    initializeToday();
}

export function todayDay() {
    AppState.currentDate = new Date();
    initializeToday();
}

export function copyYesterdayMeals() {
    const currentKey = getDateKey(AppState.currentDate);
    if (currentKey > getDateKey(new Date())) {
        showNotification('No puedes copiar comidas a una fecha futura', 'warning');
        return;
    }
    const yesterday = new Date(AppState.currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);

    const yesterdayData = AppState.allDays[yesterdayKey];
    const yesterdayMeals = yesterdayData && yesterdayData.meals && typeof yesterdayData.meals === 'object'
        ? yesterdayData.meals : null;
    if (!yesterdayMeals || !Object.values(yesterdayMeals).some(m => Array.isArray(m) && m.length > 0)) {
        showNotification('No hay comidas registradas ayer', 'error');
        return;
    }

    let currentData = AppState.allDays[currentKey];
    if (!currentData || !currentData.meals) {
        initializeToday();
        currentData = AppState.allDays[currentKey];
    }
    if (!currentData || !currentData.meals) return;
    const hasMeals = Object.values(currentData.meals).some(m => Array.isArray(m) && m.length > 0);
    if (hasMeals && !confirm('Este día ya tiene comidas. ¿Sobrescribir con las de ayer?')) return;

    // Copia profunda de las comidas de ayer
    currentData.meals = JSON.parse(JSON.stringify(yesterdayMeals));
    saveDays();
    renderDay();
    showNotification('Comidas copiadas del día anterior');
}

// Notas con debounce (400ms trailing): escribir a disco en cada tecla con
// historiales grandes causa jank. flushDayNotes() vuelca lo pendiente.
let _notesTimer = null;
let _pendingNotes = null;

export function flushDayNotes() {
    if (_pendingNotes === null) return;
    if (_notesTimer) { clearTimeout(_notesTimer); _notesTimer = null; }
    const { dateKey, value } = _pendingNotes;
    _pendingNotes = null;
    if (!AppState.allDays[dateKey]) return;
    AppState.allDays[dateKey].notes = value;
    saveDays();
}

if (typeof document !== 'undefined' && document.addEventListener) {
    // No perder la última edición si se cierra/oculta la pestaña <400ms después
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushDayNotes();
    });
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pagehide', flushDayNotes);
    }
}

window._saveDayNotes = (value) => {
    const dateKey = getDateKey(AppState.currentDate);
    if (!AppState.allDays[dateKey]) return;
    // Memoria inmediata (la UI lee de aquí), disco con debounce
    AppState.allDays[dateKey].notes = value;
    _pendingNotes = { dateKey, value };
    if (_notesTimer) clearTimeout(_notesTimer);
    _notesTimer = setTimeout(flushDayNotes, 400);
};
