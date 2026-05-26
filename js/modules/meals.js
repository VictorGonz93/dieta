// ==================== GESTIÓN DE COMIDAS Y DÍAS ====================

import AppState from './state.js';
import { getDateKey, saveDays } from './storage.js';
import { getDayNumber, getDayType, getCalorieTarget } from './nutrition.js';
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
        AppState.mealHistory = JSON.parse(saved);
    }
}

export function saveMealHistory() {
    localStorage.setItem('meal_history', JSON.stringify(AppState.mealHistory.slice(0, 50)));
}

export function addToMealHistory(mealData) {
    AppState.mealHistory.unshift({
        timestamp: Date.now(),
        name: mealData.name,
        quantity: mealData.quantity,
        unit: mealData.unit,
        kcal: mealData.kcal,
        protein: mealData.protein,
        carbs: mealData.carbs,
        fats: mealData.fats,
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
    const emoji = dayInfo.type === 'entreno' ? '💪' : '😴';
    const dayName = dayInfo.label;

    if (document.getElementById('dayTitle')) {
        document.getElementById('dayTitle').textContent = `Día ${dayNumber} • ${emoji} ${dayName}`;
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

    updateDaySummary(dayData);
    displayNextDayPrediction();

    // Actualizar progreso semanal
    import('./stats.js').then(m => m.displayWeeklyProgress());
}

export function renderMealSection(mealName, foods) {
    const container = document.getElementById(mealName + '-items');
    const totalEl = document.getElementById(mealName + '-total');
    if (!container || !totalEl) return;

    container.innerHTML = '';
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

    foods.forEach((food, index) => {
        const foodEl = document.createElement('div');
        foodEl.className = 'food-item';
        const timeDisplay = food.time ? ` <span class="food-time">⏰ ${food.time}</span>` : '';
        const quantityDisplay = `${food.quantity} ${food.unit}`.replace(/^\s+|\s+$/g, '');
        foodEl.innerHTML = `
            <span class="food-item-name">${food.name} (${quantityDisplay})${timeDisplay}</span>
            <span class="food-item-macros">
                <span class="food-macro">🔥${food.kcal.toFixed(0)}</span>
                <span class="food-macro">💪${food.protein.toFixed(1)}g</span>
            </span>
            <button class="food-item-delete" onclick="window.deleteFood('${mealName}', ${index})">✕</button>
        `;
        container.appendChild(foodEl);

        totalKcal += food.kcal;
        totalProtein += food.protein;
        totalCarbs += food.carbs;
        totalFats += food.fats;
    });

    totalEl.textContent = `${totalKcal.toFixed(0)} kcal | ${totalProtein.toFixed(1)}g P`;
}

export function updateDaySummary(dayData) {
    const meals = ['breakfast', 'lunch', 'snack', 'dinner'];
    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;

    meals.forEach(meal => {
        dayData.meals[meal].forEach(food => {
            sumKcal += food.kcal;
            sumProtein += food.protein;
            sumCarbs += food.carbs;
            sumFats += food.fats;
        });
    });

    const targetCals = getCalorieTarget();
    const targetProtein = AppState.config.proteinGoal;

    if (document.getElementById('sumCals')) document.getElementById('sumCals').textContent = sumKcal.toFixed(0);
    if (document.getElementById('calsGoal')) document.getElementById('calsGoal').textContent = `/ ${targetCals}`;
    if (document.getElementById('sumProtein')) document.getElementById('sumProtein').textContent = sumProtein.toFixed(1) + 'g';
    if (document.getElementById('proteinGoal')) document.getElementById('proteinGoal').textContent = `/ ${targetProtein}g`;
    if (document.getElementById('sumCarbs')) document.getElementById('sumCarbs').textContent = sumCarbs.toFixed(1) + 'g';
    if (document.getElementById('carbsGoal')) document.getElementById('carbsGoal').textContent = `/ ${AppState.config.carbsMin}-${AppState.config.carbsMax}g`;
    if (document.getElementById('sumFats')) document.getElementById('sumFats').textContent = sumFats.toFixed(1) + 'g';
    if (document.getElementById('fatsGoal')) document.getElementById('fatsGoal').textContent = `/ ${AppState.config.fatsMin}-${AppState.config.fatsMax}g`;

    if (document.getElementById('statusCals')) document.getElementById('statusCals').textContent = getStatusTarget(sumKcal, targetCals);
    if (document.getElementById('statusProtein')) document.getElementById('statusProtein').textContent = getStatusTarget(sumProtein, targetProtein);
    if (document.getElementById('statusCarbs')) document.getElementById('statusCarbs').textContent = getStatusRange(sumCarbs, AppState.config.carbsMin, AppState.config.carbsMax);
    if (document.getElementById('statusFats')) document.getElementById('statusFats').textContent = getStatusRange(sumFats, AppState.config.fatsMin, AppState.config.fatsMax);

    updateQuickMacros(sumKcal, sumProtein, sumCarbs, sumFats, targetCals);
}

export function updateQuickMacros(kcal, protein, carbs, fats, targetCals) {
    if (document.getElementById('quickCals')) document.getElementById('quickCals').textContent = `${kcal.toFixed(0)} / ${targetCals || 0}`;
    if (document.getElementById('quickProtein')) document.getElementById('quickProtein').textContent = `${protein.toFixed(1)} / ${AppState.config.proteinGoal || '-'}g`;
    if (document.getElementById('quickCarbs')) document.getElementById('quickCarbs').textContent = `${carbs.toFixed(1)} / ${AppState.config.carbsMax || '-'}g`;
    if (document.getElementById('quickFats')) document.getElementById('quickFats').textContent = `${fats.toFixed(1)} / ${AppState.config.fatsMax || '-'}g`;
}

export function getStatusTarget(value, target) {
    const diff = value - target;
    const absDiff = Math.abs(diff);
    if (absDiff <= 50) return '✅';
    if (absDiff <= 150) return `⚠️ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`;
    return `❌ ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`;
}

export function getStatusRange(value, min, max) {
    if (value >= min && value <= max) return '✅';
    if (value > max) return `⚠️ +${(value - max).toFixed(0)}`;
    return `❌ -${(min - value).toFixed(0)}`;
}

// ==================== AGREGAR / ELIMINAR COMIDA ====================

export function addFood() {
    if (!AppState.currentMealForModal) return;

    const food = {
        name: document.getElementById('foodName').value,
        quantity: parseFloat(document.getElementById('foodQuantity').value),
        unit: document.getElementById('foodUnit').value,
        kcal: parseFloat(document.getElementById('foodCals').value),
        protein: parseFloat(document.getElementById('foodProtein').value),
        carbs: parseFloat(document.getElementById('foodCarbs').value),
        fats: parseFloat(document.getElementById('foodFats').value),
        time: document.getElementById('foodTime').value || null,
    };

    if (!food.name || !food.quantity || !food.kcal) {
        showNotification('❌ Completa todos los campos', 'error');
        return;
    }

    const dateKey = getDateKey(AppState.currentDate);
    AppState.allDays[dateKey].meals[AppState.currentMealForModal].push(food);
    saveDays();
    addToMealHistory(food);

    if (AppState.config.weightHistory && AppState.config.currentWeight) {
        const todayEntry = AppState.config.weightHistory.find(w => w.date === dateKey);
        if (todayEntry) {
            const updatedPrediction = calculateNextDayPredictionForDate(dateKey, AppState.config.currentWeight);
            if (updatedPrediction) {
                todayEntry.predictedWeight = updatedPrediction.predictedWeight;
                saveWeightHistory();
            }
        }
    }

    import('./ui/modal.js').then(m => m.closeModal());
    renderDay();
    updateDaySummary(AppState.allDays[dateKey]);
    displayNextDayPrediction();
    import('./charts.js').then(m => m.renderWeightPredictionChart());
    showNotification(`✅ ${food.name} agregado correctamente`);
}

export function deleteFood(meal, index) {
    const dateKey = getDateKey(AppState.currentDate);
    AppState.allDays[dateKey].meals[meal].splice(index, 1);
    saveDays();

    if (AppState.config.weightHistory && AppState.config.currentWeight) {
        const todayEntry = AppState.config.weightHistory.find(w => w.date === dateKey);
        if (todayEntry) {
            const updatedPrediction = calculateNextDayPredictionForDate(dateKey, AppState.config.currentWeight);
            if (updatedPrediction) {
                todayEntry.predictedWeight = updatedPrediction.predictedWeight;
                saveWeightHistory();
            }
        }
    }

    renderDay();
    updateDaySummary(AppState.allDays[dateKey]);
    displayNextDayPrediction();
    import('./charts.js').then(m => m.renderWeightPredictionChart());
    showNotification('✅ Comida eliminada', 'success');
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
