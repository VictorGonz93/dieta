// ==================== GESTIÓN DE COMIDAS Y DÍAS ====================

import AppState from './state.js';
import { escapeHTML, num } from './utils.js';
import { getDateKey, saveDays, safeSet } from './storage.js';
import { getDayNumber, getDayType, getCalorieTarget, getDynamicDayTargets } from './nutrition.js';
import { getWorkoutSessions, isSessionFinalized } from './workout.js';
import { getWeeklyAdherence, getLoggingStreak } from './stats.js';
import { PRODUCTS_DB } from './products.js';
import {
    calculateNextDayPredictionForDate,
    displayNextDayPrediction,
    saveWeightHistory,
} from './weight.js';
import { showNotification } from './ui/notifications.js';

// ==================== PANEL "HOY" Y ACCIONES RÁPIDAS ====================

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_META = {
    breakfast: { name: 'Desayuno', short: 'Desayuno', icon: 'wb_sunny' },
    lunch:     { name: 'Almuerzo', short: 'Almuerzo', icon: 'restaurant' },
    snack:     { name: 'Merienda', short: 'Merienda', icon: 'coffee' },
    dinner:    { name: 'Cena', short: 'Cena', icon: 'nights_stay' },
};

let _closeDaySuggestions = [];
let _mealPickerAction = null;

function _dateFromKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

function _validDateKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
    const date = _dateFromKey(key);
    return !!date && getDateKey(date) === key;
}

function _sumDayTotals(day) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
    if (!day || !day.meals || typeof day.meals !== 'object') return totals;
    Object.values(day.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => {
            if (!food || typeof food !== 'object') return;
            totals.kcal += _number(food.kcal);
            totals.protein += _number(food.protein);
            totals.carbs += _number(food.carbs);
            totals.fats += _number(food.fats);
        });
    });
    return totals;
}

function _countFoods(day) {
    if (!day || !day.meals || typeof day.meals !== 'object') return 0;
    return Object.values(day.meals).reduce((sum, meal) => sum + (Array.isArray(meal) ? meal.length : 0), 0);
}

function _mealKcal(day, slot) {
    const foods = day && day.meals && Array.isArray(day.meals[slot]) ? day.meals[slot] : [];
    return foods.reduce((sum, food) => sum + _number(food && food.kcal), 0);
}

function _leastCaloricMeal(day) {
    let best = MEAL_ORDER[0];
    let bestKcal = Infinity;
    MEAL_ORDER.forEach(slot => {
        const kcal = _mealKcal(day, slot);
        if (kcal < bestKcal) { bestKcal = kcal; best = slot; }
    });
    return best;
}

/** Comida que toca según la hora: desayuno, almuerzo, merienda o cena. */
export function getSuggestedMealSlot(date = new Date()) {
    const hour = date.getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 20) return 'snack';
    return 'dinner';
}

function _targetsFor(dateKey) {
    const targets = getDynamicDayTargets(dateKey);
    const w = AppState.config.currentWeight || 75;
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    return {
        cals: targets?.cals ?? getCalorieTarget() ?? 1800,
        protein: targets?.protein ?? Math.round(w * pFactor),
        carbs: targets?.carbs ?? 130,
        fats: targets?.fats ?? Math.round(w * 0.8),
    };
}

function _kcalStatus(remaining, target) {
    const tolerance = Math.max(100, target * 0.10);
    if (remaining < 0) return remaining < -tolerance ? 'over' : 'warn';
    if (remaining <= Math.max(150, target * 0.15)) return 'ok';
    return 'warn';
}

function _proteinStatus(consumed, target) {
    const pct = target > 0 ? consumed / target : 0;
    if (pct >= 0.9) return 'ok';
    if (pct >= 0.6) return 'warn';
    return 'low';
}

function _cloneFood(food) {
    return {
        name: String(food && food.name || 'Alimento').slice(0, 160),
        quantity: Math.round(_number(food && food.quantity) * 100) / 100,
        unit: String(food && food.unit || 'g').slice(0, 20) || 'g',
        kcal: Math.round(_number(food && food.kcal) * 100) / 100,
        protein: Math.round(_number(food && food.protein) * 100) / 100,
        carbs: Math.round(_number(food && food.carbs) * 100) / 100,
        fats: Math.round(_number(food && food.fats) * 100) / 100,
        time: food && food.time ? String(food.time).slice(0, 5) : null,
    };
}

function _displayName(name) {
    return String(name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function _stepsInSession(session) {
    if (!session || !Array.isArray(session.exercises)) return 0;
    let steps = 0;
    session.exercises.forEach(ex => {
        if (ex && ex.trackingType === 'steps' && Array.isArray(ex.sets)) {
            ex.sets.forEach(set => { steps += _number(set && set.steps); });
        }
    });
    return Math.round(steps);
}

/**
 * Sugerencias para cerrar el día: combos y productos que encajan en las
 * kcal/proteína restantes. Prioriza cubrir proteína sin pasarse de calorías.
 */
export function getCloseDaySuggestions(dayData, dateKey, limit = 3) {
    const key = dateKey || getDateKey(AppState.currentDate);
    const totals = _sumDayTotals(dayData);
    const targets = _targetsFor(key);
    const remaining = {
        kcal: targets.cals - totals.kcal,
        protein: targets.protein - totals.protein,
    };

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (candidate) => {
        const norm = candidate.name.toLowerCase();
        if (!candidate.name || seen.has(norm)) return;
        if (candidate.kcal <= 0 && candidate.protein <= 0) return;
        seen.add(norm);
        candidates.push(candidate);
    };

    (Array.isArray(AppState.mealCombos) ? AppState.mealCombos : []).forEach(combo => {
        const items = Array.isArray(combo && combo.items) ? combo.items.filter(i => i && typeof i === 'object') : [];
        if (!items.length) return;
        const kcal = items.reduce((sum, item) => sum + _number(item.kcal), 0);
        const protein = items.reduce((sum, item) => sum + _number(item.protein), 0);
        pushCandidate({
            type: 'combo', id: combo.id, name: String(combo.name || 'Combo').trim(),
            kcal, protein, items: items.map(_cloneFood),
        });
    });

    PRODUCTS_DB.forEach(product => {
        const name = _displayName(product && product.name);
        const kcal = _number(product && product.kcal);
        const protein = _number(product && product.protein);
        if (!name) return;
        pushCandidate({
            type: 'product', id: product.id, name, kcal, protein,
            items: [{
                name,
                quantity: _number(product.portion) || 100,
                unit: product.unit || 'g',
                kcal, protein,
                carbs: _number(product.carbs),
                fats: _number(product.fats),
                time: null,
            }],
        });
    });

    // Si ya se pasó de kcal, solo tienen sentido opciones ligeras.
    const allowance = remaining.kcal > 0 ? Math.max(remaining.kcal + 120, 220) : 260;
    return candidates
        .filter(c => c.kcal <= allowance && (c.kcal > 0 || c.protein >= 5))
        .map(c => {
            const overshoot = Math.max(0, c.kcal - Math.max(remaining.kcal, 0));
            const proteinGap = Math.max(0, remaining.protein - c.protein);
            const density = c.protein / Math.max(c.kcal, 1);
            const score = proteinGap * 6 + overshoot * 2 - c.protein * 1.2 - density * 120;
            return { ...c, score };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, Math.max(1, parseInt(limit, 10) || 3));
}

function _refreshAfterMealChange(dateKey) {
    renderDay();
    updateDaySummary(AppState.allDays[dateKey], dateKey);
    displayNextDayPrediction();
    import('./charts.js').then(m => m.renderWeightPredictionChart()).catch(() => {});
}

export function addCloseDaySuggestion(index) {
    const suggestion = _closeDaySuggestions[parseInt(index, 10)];
    if (!suggestion) return;

    const dateKey = getDateKey(AppState.currentDate);
    if (dateKey > getDateKey(new Date())) {
        showNotification('No puedes registrar comida en una fecha futura', 'warning');
        return;
    }

    const day = AppState.allDays[dateKey];
    if (!day || !day.meals) return;
    const slot = _leastCaloricMeal(day);
    if (!Array.isArray(day.meals[slot])) day.meals[slot] = [];

    const before = JSON.parse(JSON.stringify(day.meals[slot]));
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    suggestion.items.forEach(item => {
        day.meals[slot].push({ ..._cloneFood(item), time });
    });
    saveDays();
    _refreshAfterMealChange(dateKey);

    showNotification(`${suggestion.name} añadido a ${MEAL_META[slot].name}`, 'success', () => {
        day.meals[slot] = before;
        saveDays();
        _refreshAfterMealChange(dateKey);
        showNotification('Sugerencia deshecha', 'success');
    }, 6000);
}

/** Pinta el panel accionable de "Hoy" y la racha discreta del encabezado. */
export function renderTodayDashboard(dayData, dateKey) {
    const container = document.getElementById('todayDashboard');
    if (!container) return;

    const key = dateKey || getDateKey(AppState.currentDate);
    const day = (dayData && dayData.meals) ? dayData : (AppState.allDays[key] || {});
    const totals = _sumDayTotals(day);
    const targets = _targetsFor(key);
    const remainingKcal = targets.cals - totals.kcal;
    const remainingProtein = targets.protein - totals.protein;
    const kcalStatus = _kcalStatus(remainingKcal, targets.cals);
    const proteinStatus = _proteinStatus(totals.protein, targets.protein);

    const streak = getLoggingStreak();
    const streakEl = document.getElementById('loggingStreak');
    if (streakEl) {
        if (streak.days >= 2) {
            streakEl.style.display = 'inline-flex';
            streakEl.innerHTML = `<span class="material-icons">local_fire_department</span>${streak.days} días`;
            streakEl.title = `${streak.days} días consecutivos registrando comidas`;
        } else {
            streakEl.style.display = 'none';
            streakEl.innerHTML = '';
        }
    }

    const adherence = getWeeklyAdherence(7);
    const weightEntry = (AppState.config.weightHistory || []).find(w => w && w.date === key);
    const weight = weightEntry ? parseFloat(weightEntry.weight) : NaN;
    const sessions = getWorkoutSessions();
    const session = sessions[key];
    const hasSession = session && Array.isArray(session.exercises) && session.exercises.length > 0;
    const dayDate = _dateFromKey(key) || AppState.currentDate;
    const dayInfo = getDayType(dayDate);
    let workoutValue = '—';
    let workoutDetail = '';
    if (hasSession) {
        workoutValue = isSessionFinalized(session) ? 'Hecho' : 'En curso';
        workoutDetail = `${session.exercises.length} ejercicios`;
    } else if (dayInfo && dayInfo.type === 'entreno') {
        workoutValue = 'Pendiente';
        workoutDetail = dayInfo.label;
    } else {
        workoutValue = 'Descanso';
        workoutDetail = 'sin entreno';
    }
    const steps = _stepsInSession(session);

    let summary;
    let summaryClass = '';
    if (targets.cals <= 0) {
        summary = 'Completa tu perfil para calcular objetivos.';
    } else if (remainingKcal < -Math.max(100, targets.cals * 0.10)) {
        summary = `Te has pasado ${Math.abs(Math.round(remainingKcal))} kcal. Prioriza proteína ligera si aún tienes hambre.`;
        summaryClass = 'over';
    } else if (remainingProtein > 30) {
        summary = `Te faltan ${Math.round(remainingProtein)} g de proteína. Es la prioridad para cerrar el día.`;
    } else if (remainingKcal > targets.cals * 0.25) {
        summary = `Tienes margen: quedan ${Math.round(remainingKcal)} kcal y ${Math.max(0, Math.round(remainingProtein))} g de proteína.`;
    } else {
        summary = 'Vas en línea con el objetivo. Cierra el día con algo ligero si tienes hambre.';
    }

    const kcalValue = Math.abs(Math.round(remainingKcal));
    const proteinValue = Math.max(0, Math.round(remainingProtein));
    const adherenceValue = adherence.percent === null ? '—' : `${adherence.percent}%`;
    const adherenceDetail = adherence.logged > 0
        ? `${adherence.onTarget}/${adherence.logged} días en objetivo`
        : 'sin datos aún';

    let suggestionsHTML = '';
    _closeDaySuggestions = [];
    if (key <= getDateKey(new Date()) && totals.kcal > 0) {
        const suggestions = getCloseDaySuggestions(day, key, 3);
        _closeDaySuggestions = suggestions;
        const targetMeal = _leastCaloricMeal(day);
        if (suggestions.length > 0) {
            suggestionsHTML = `
                <div class="close-day">
                    <div class="close-day-head">
                        <span class="close-day-title"><span class="material-icons">flag</span>Cerrar el día</span>
                        <span class="close-day-sub">Opciones que encajan en lo que queda</span>
                    </div>
                    <div class="close-day-list">
                        ${suggestions.map((s, i) => `
                            <button class="close-day-item" data-suggestion-index="${i}" onclick="window.addCloseDaySuggestion(this.dataset.suggestionIndex)">
                                <span class="close-day-item-body">
                                    <span class="close-day-item-name">${escapeHTML(s.name)}</span>
                                    <span class="close-day-item-macros">${Math.round(s.kcal)} kcal · ${Math.round(s.protein)} g P</span>
                                </span>
                                <span class="close-day-add">+ ${MEAL_META[targetMeal].short}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (remainingKcal <= 0) {
            suggestionsHTML = `
                <div class="close-day">
                    <div class="close-day-done"><span class="material-icons">check_circle</span>Día cubierto: no necesitas añadir nada más.</div>
                </div>
            `;
        } else {
            suggestionsHTML = `
                <div class="close-day">
                    <div class="close-day-done"><span class="material-icons">info</span>No hay sugerencias que encajen; añade algo manualmente.</div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="dash-top">
            <div>
                <div class="dash-eyebrow">Resumen de hoy</div>
                <div class="dash-metrics">
                    <div class="dash-metric ${kcalStatus}">
                        <span class="dash-metric-value">${kcalValue}</span>
                        <div>
                            <span class="dash-metric-label">${remainingKcal >= 0 ? 'kcal restantes' : 'kcal de más'}</span>
                            <span class="dash-metric-detail">de ${Math.round(targets.cals)} · ${Math.round(totals.kcal)} consumidas</span>
                        </div>
                    </div>
                    <div class="dash-metric ${proteinStatus}">
                        <span class="dash-metric-value">${proteinValue}</span>
                        <div>
                            <span class="dash-metric-label">proteína pendiente</span>
                            <span class="dash-metric-detail">${Math.round(totals.protein)} / ${Math.round(targets.protein)} g</span>
                        </div>
                    </div>
                </div>
                <div class="dash-summary ${summaryClass}">${escapeHTML(summary)}</div>
            </div>
        </div>
        <div class="dash-mini-grid">
            <div class="dash-mini">
                <div class="dash-mini-label"><span class="material-icons">scale</span>Peso</div>
                <div class="dash-mini-value">${Number.isFinite(weight) ? `${weight.toFixed(1)} kg` : '—'}</div>
                <div class="dash-mini-detail">${Number.isFinite(weight) ? 'pesaje del día' : 'sin pesaje'}</div>
            </div>
            <div class="dash-mini">
                <div class="dash-mini-label"><span class="material-icons">fitness_center</span>Entreno</div>
                <div class="dash-mini-value">${escapeHTML(workoutValue)}</div>
                <div class="dash-mini-detail">${escapeHTML(workoutDetail)}</div>
            </div>
            <div class="dash-mini">
                <div class="dash-mini-label"><span class="material-icons">directions_walk</span>Pasos</div>
                <div class="dash-mini-value">${steps > 0 ? steps.toLocaleString('es-ES') : '—'}</div>
                <div class="dash-mini-detail">${steps > 0 ? 'de 10.000' : 'sin datos'}</div>
            </div>
            <div class="dash-mini">
                <div class="dash-mini-label"><span class="material-icons">target</span>Adherencia 7d</div>
                <div class="dash-mini-value">${adherenceValue}</div>
                <div class="dash-mini-detail">${escapeHTML(adherenceDetail)}</div>
            </div>
        </div>
        ${suggestionsHTML}
    `;
}

// ==================== COPIAR COMIDAS DE CUALQUIER FECHA ====================

function _hasMeals(day) {
    return !!day && !!day.meals && typeof day.meals === 'object'
        && Object.values(day.meals).some(m => Array.isArray(m) && m.length > 0);
}

function _lastDateWithMealsBefore(dateKey, maxDays = 30) {
    const cursor = _dateFromKey(dateKey);
    if (!cursor) return dateKey;
    cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < maxDays; i++) {
        const key = getDateKey(cursor);
        if (_hasMeals(AppState.allDays[key])) return key;
        cursor.setDate(cursor.getDate() - 1);
    }
    return getDateKey(cursor);
}

function _updateCopyDayHint() {
    const input = document.getElementById('copyDaySource');
    const hint = document.getElementById('copyDayHint');
    if (!input || !hint) return;
    const sourceKey = String(input.value || '');
    if (!_validDateKey(sourceKey)) {
        hint.textContent = 'Elige una fecha válida.';
        return;
    }
    const day = AppState.allDays[sourceKey];
    const count = _countFoods(day);
    hint.textContent = count > 0
        ? `${count} alimento${count === 1 ? '' : 's'} en ese día.`
        : 'Ese día no tiene comidas registradas.';
}

export function openCopyDayModal() {
    const destKey = getDateKey(AppState.currentDate);
    const todayKey = getDateKey(new Date());
    if (destKey > todayKey) {
        showNotification('No puedes copiar comidas a una fecha futura', 'warning');
        return;
    }
    const modal = document.getElementById('copyDayModal');
    const input = document.getElementById('copyDaySource');
    if (!modal || !input) return;

    input.max = todayKey;
    input.value = _lastDateWithMealsBefore(destKey);
    input.onchange = _updateCopyDayHint;
    _updateCopyDayHint();
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

export function closeCopyDayModal() {
    const modal = document.getElementById('copyDayModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

function _copyMealsFromDate(sourceKey) {
    const destKey = getDateKey(AppState.currentDate);
    const todayKey = getDateKey(new Date());
    if (destKey > todayKey) {
        showNotification('No puedes copiar comidas a una fecha futura', 'warning');
        return false;
    }
    if (!_validDateKey(sourceKey)) {
        showNotification('Elige una fecha de origen válida', 'error');
        return false;
    }
    if (sourceKey > todayKey) {
        showNotification('La fecha de origen no puede ser futura', 'warning');
        return false;
    }
    if (sourceKey === destKey) {
        showNotification('La fecha de origen y la de destino deben ser distintas', 'warning');
        return false;
    }

    const source = AppState.allDays[sourceKey];
    if (!_hasMeals(source)) {
        showNotification('No hay comidas registradas en esa fecha', 'error');
        return false;
    }
    if (!AppState.allDays[destKey] || !AppState.allDays[destKey].meals) {
        initializeToday();
    }
    const dest = AppState.allDays[destKey];
    if (!dest || !dest.meals) return false;
    if (_hasMeals(dest) && !confirm('Este día ya tiene comidas. ¿Sobrescribir con las del día elegido?')) {
        return false;
    }

    const before = JSON.parse(JSON.stringify(dest.meals));
    dest.meals = JSON.parse(JSON.stringify(source.meals));
    saveDays();
    closeCopyDayModal();
    _refreshAfterMealChange(destKey);

    const pretty = _dateFromKey(sourceKey)?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) || sourceKey;
    showNotification(`Comidas copiadas del ${pretty}`, 'success', () => {
        dest.meals = before;
        saveDays();
        _refreshAfterMealChange(destKey);
        showNotification('Copia deshecha', 'success');
    }, 7000);
    return true;
}

export function confirmCopyDayMeals() {
    const input = document.getElementById('copyDaySource');
    if (!input) return false;
    return _copyMealsFromDate(String(input.value || ''));
}

// ==================== MOVER ALIMENTO / DUPLICAR COMIDA ====================

function _renderMealPicker(title, subtitle, excludedMeal, icon) {
    const modal = document.getElementById('mealPickerModal');
    const titleEl = document.getElementById('mealPickerTitle');
    const subtitleEl = document.getElementById('mealPickerSubtitle');
    const optionsEl = document.getElementById('mealPickerOptions');
    if (!modal || !titleEl || !subtitleEl || !optionsEl) return;

    const dateKey = getDateKey(AppState.currentDate);
    const day = AppState.allDays[dateKey] || {};

    titleEl.innerHTML = `<span class="material-icons text-primary">${icon}</span>${escapeHTML(title)}`;
    subtitleEl.textContent = subtitle;
    optionsEl.innerHTML = MEAL_ORDER.filter(slot => slot !== excludedMeal).map(slot => {
        const foods = Array.isArray(day.meals?.[slot]) ? day.meals[slot] : [];
        const kcal = foods.reduce((sum, food) => sum + _number(food && food.kcal), 0);
        return `
            <button class="meal-picker-option" data-meal="${slot}" onclick="window.confirmMealPicker(this.dataset.meal)">
                <span class="material-icons">${MEAL_META[slot].icon}</span>
                <span>
                    <span class="meal-picker-name">${MEAL_META[slot].name}</span>
                    <span class="meal-picker-meta">${foods.length} alimento${foods.length === 1 ? '' : 's'} · ${Math.round(kcal)} kcal</span>
                </span>
            </button>
        `;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('show');
}

export function openMoveFood(meal, index) {
    if (!MEAL_ORDER.includes(meal)) return;
    const dateKey = getDateKey(AppState.currentDate);
    const foods = AppState.allDays[dateKey]?.meals?.[meal];
    const idx = parseInt(index, 10);
    if (!Array.isArray(foods) || !Number.isInteger(idx) || idx < 0 || idx >= foods.length) return;

    const food = foods[idx];
    const qty = `${food.quantity ?? ''} ${food.unit ?? ''}`.trim();
    _mealPickerAction = { mode: 'move', meal, index: idx, dateKey };
    _renderMealPicker('Mover alimento', `${food.name || 'Alimento'} (${qty})`, meal, 'drive_file_move');
}

export function duplicateMeal(meal) {
    if (!MEAL_ORDER.includes(meal)) return;
    const dateKey = getDateKey(AppState.currentDate);
    const foods = AppState.allDays[dateKey]?.meals?.[meal];
    if (!Array.isArray(foods) || foods.length === 0) {
        showNotification('Esa comida está vacía', 'warning');
        return;
    }
    _mealPickerAction = { mode: 'duplicate', meal, index: null, dateKey };
    _renderMealPicker('Duplicar comida', `${MEAL_META[meal].name}: ${foods.length} alimento${foods.length === 1 ? '' : 's'}. Elige el destino.`, meal, 'content_copy');
}

export function closeMealPicker() {
    _mealPickerAction = null;
    const modal = document.getElementById('mealPickerModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

export function confirmMealPicker(targetMeal) {
    const action = _mealPickerAction;
    if (!action || !MEAL_ORDER.includes(targetMeal) || targetMeal === action.meal) return;

    const day = AppState.allDays[action.dateKey];
    if (!day || !day.meals) return;
    const sourceFoods = day.meals[action.meal];
    if (!Array.isArray(sourceFoods)) return;
    if (!Array.isArray(day.meals[targetMeal])) day.meals[targetMeal] = [];

    const sourceBefore = JSON.parse(JSON.stringify(sourceFoods));
    const targetBefore = JSON.parse(JSON.stringify(day.meals[targetMeal]));
    let message = '';

    if (action.mode === 'move') {
        const idx = action.index;
        if (!Number.isInteger(idx) || idx < 0 || idx >= sourceFoods.length) {
            closeMealPicker();
            return;
        }
        const [food] = sourceFoods.splice(idx, 1);
        day.meals[targetMeal].push(food);
        message = `${food.name || 'Alimento'} movido a ${MEAL_META[targetMeal].name}`;
    } else if (action.mode === 'duplicate') {
        if (sourceFoods.length === 0) { closeMealPicker(); return; }
        const copies = JSON.parse(JSON.stringify(sourceFoods));
        day.meals[targetMeal].push(...copies);
        message = `${MEAL_META[action.meal].name} duplicado en ${MEAL_META[targetMeal].name}`;
    } else {
        closeMealPicker();
        return;
    }

    saveDays();
    closeMealPicker();
    _refreshAfterMealChange(action.dateKey);

    showNotification(message, 'success', () => {
        day.meals[action.meal] = sourceBefore;
        day.meals[targetMeal] = targetBefore;
        saveDays();
        _refreshAfterMealChange(action.dateKey);
        showNotification('Acción deshecha', 'success');
    }, 6000);
}

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
            <span class="food-item-actions">
                <button class="food-item-move" onclick="window.openMoveFood('${mealName}', ${index})" title="Mover a otra comida" aria-label="Mover ${escapeHTML(food.name || 'alimento')} a otra comida"><span class="material-icons">drive_file_move</span></button>
                <button class="food-item-delete" onclick="window.deleteFood('${mealName}', ${index})" title="Eliminar alimento" aria-label="Eliminar ${escapeHTML(food.name || 'alimento')}">×</button>
            </span>
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
    renderTodayDashboard(day, _dateKey);
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
    const yesterday = new Date(AppState.currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return _copyMealsFromDate(getDateKey(yesterday));
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
