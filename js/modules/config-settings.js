// ==================== CONFIGURACIÓN ====================

import AppState from './state.js';
import { calculateTMR, calculateTDEE, getDayType, getCalorieTarget } from './nutrition.js';
import { recordWeight, updateWeightPrediction, displayNextDayPrediction } from './weight.js';
import { showNotification } from './ui/notifications.js';

export function loadConfig() {
    const saved = localStorage.getItem('nutrition_config');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(AppState.config, parsed);
        if (parsed.startDate) AppState.config.startDate = new Date(parsed.startDate);
    }
    updateConfigUI();
}

function parseNum(id, currentVal, isInt = false) {
    const el = document.getElementById(id);
    if (!el) return currentVal;
    const v = el.value?.trim();
    if (v === '' || v === null || v === undefined) return currentVal;
    const num = isInt ? parseInt(v, 10) : parseFloat(v);
    return isNaN(num) ? currentVal : num;
}

export function saveConfig() {
    const oldWeight = AppState.config.currentWeight;
    const newWeight = parseNum('currentWeightInput', AppState.config.currentWeight);

    AppState.config.startWeight = parseNum('startWeight', AppState.config.startWeight);
    AppState.config.currentWeight = newWeight;
    AppState.config.targetWeight = parseNum('targetWeight', AppState.config.targetWeight);

    const startDateInput = document.getElementById('startDate')?.value;
    if (startDateInput) {
        AppState.config.startDate = new Date(startDateInput);
    }

    AppState.config.height = parseNum('height', AppState.config.height, true);
    AppState.config.age = parseNum('age', AppState.config.age, true);

    const genderEl = document.getElementById('gender');
    if (genderEl?.value) AppState.config.gender = genderEl.value;

    AppState.config.proteinGoal = parseNum('proteinGoalInput', AppState.config.proteinGoal, true);
    AppState.config.deficitTarget = parseNum('deficitTargetInput', AppState.config.deficitTarget || 500, true);
    AppState.config.calsEntrenamiento = parseNum('calsEntrenamiento', AppState.config.calsEntrenamiento, true);
    AppState.config.calsDescanso = parseNum('calsDescanso', AppState.config.calsDescanso, true);
    AppState.config.carbsMin = parseNum('carbsMin', AppState.config.carbsMin, true);
    AppState.config.carbsMax = parseNum('carbsMax', AppState.config.carbsMax, true);
    AppState.config.fatsMin = parseNum('fatsMin', AppState.config.fatsMin, true);
    AppState.config.fatsMax = parseNum('fatsMax', AppState.config.fatsMax, true);

    if (newWeight !== oldWeight) {
        recordWeight(new Date(), newWeight);
    }

    localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
    showNotification('Configuración guardada correctamente', 'success');
    updateHeaderInfo();
    updateCalculatedValues();
    updateWeightPrediction();
    displayNextDayPrediction();

    import('./meals.js').then(m => m.renderDay());
    import('./stats.js').then(m => { m.updateGoalsDisplay(); });
    import('./ui/onboarding.js').then(m => {
        m.updateOnboardingProgress();
        if (m.isConfigComplete()) m.closeOnboarding();
    });
}

export function updateConfigUI() {
    const el = (id) => document.getElementById(id);
    if (el('startWeight')) el('startWeight').value = AppState.config.startWeight || '';
    if (el('currentWeightInput')) el('currentWeightInput').value = AppState.config.currentWeight || '';
    if (el('targetWeight')) el('targetWeight').value = AppState.config.targetWeight || '';
    if (el('startDate')) el('startDate').value = AppState.config.startDate ? AppState.config.startDate.toISOString().split('T')[0] : '';
    if (el('height')) el('height').value = AppState.config.height || '';
    if (el('age')) el('age').value = AppState.config.age || '';
    if (el('gender')) el('gender').value = AppState.config.gender || '';
    if (el('proteinGoalInput')) el('proteinGoalInput').value = AppState.config.proteinGoal || '';
    if (el('deficitTargetInput')) el('deficitTargetInput').value = AppState.config.deficitTarget || 500;
    if (el('calsEntrenamiento')) el('calsEntrenamiento').value = AppState.config.calsEntrenamiento || '';
    if (el('calsDescanso')) el('calsDescanso').value = AppState.config.calsDescanso || '';
    if (el('carbsMin')) el('carbsMin').value = AppState.config.carbsMin || '';
    if (el('carbsMax')) el('carbsMax').value = AppState.config.carbsMax || '';
    if (el('fatsMin')) el('fatsMin').value = AppState.config.fatsMin || '';
    if (el('fatsMax')) el('fatsMax').value = AppState.config.fatsMax || '';

    updateCalculatedValues();
}

export function updateCalculatedValues() {
    if (!AppState.config.age || !AppState.config.height || !AppState.config.gender) {
        const el = (id) => document.getElementById(id);
        if (el('tmrValue')) el('tmrValue').textContent = '-';
        if (el('tdeeEntrenoValue')) el('tdeeEntrenoValue').textContent = '-';
        if (el('tdeeDescansoValue')) el('tdeeDescansoValue').textContent = '-';
        return;
    }

    const tmr = calculateTMR();
    const tdeeEntreno = calculateTDEE('entreno');
    const tdeeDescanso = calculateTDEE('descanso');

    const el = (id) => document.getElementById(id);
    if (el('tmrValue')) el('tmrValue').textContent = `${Math.round(tmr)} kcal/día`;
    if (el('tdeeEntrenoValue')) el('tdeeEntrenoValue').textContent = `${tdeeEntreno} kcal/día`;
    if (el('tdeeDescansoValue')) el('tdeeDescansoValue').textContent = `${tdeeDescanso} kcal/día`;
}

export function updateHeaderInfo() {
    const dayInfo = getDayType(AppState.currentDate);
    const targetCals = getCalorieTarget();
    const { startWeight, currentWeight, targetWeight, startDate } = AppState.config;

    if (!startDate || !startWeight || !currentWeight) {
        if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = '-';
        if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = '- kg';
        if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = '-';
        return;
    }

    // getDayNumber sin importar el módulo nutrition (evitar circular en carga)
    const start = new Date(startDate);
    const diff = new Date() - start;
    const dayNumber = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;

    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const progressPercent = totalToLose !== 0 ? Math.round((alreadyLost / totalToLose) * 100) : 0;

    if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = dayNumber;
    if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = `${currentWeight} kg`;
    if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = `${Math.min(progressPercent, 100)}%`;

    const dayTypeEl = document.getElementById('dayType');
    if (dayTypeEl && dayInfo) {
        if (dayInfo.type === 'entreno') {
            dayTypeEl.textContent = dayInfo.label;
            dayTypeEl.style.color = 'var(--primary)';
        } else {
            dayTypeEl.textContent = dayInfo.label;
            dayTypeEl.style.color = 'var(--color-blue)';
        }
    }
}
