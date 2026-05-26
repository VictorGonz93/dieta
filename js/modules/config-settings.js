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

export function saveConfig() {
    const newWeight = parseFloat(document.getElementById('currentWeightInput')?.value || AppState.config.currentWeight);
    const oldWeight = AppState.config.currentWeight;

    AppState.config.startWeight = parseFloat(document.getElementById('startWeight')?.value || AppState.config.startWeight);
    AppState.config.currentWeight = newWeight;
    AppState.config.targetWeight = parseFloat(document.getElementById('targetWeight')?.value || AppState.config.targetWeight);

    const startDateInput = document.getElementById('startDate')?.value;
    AppState.config.startDate = startDateInput ? new Date(startDateInput) : (AppState.config.startDate || null);

    AppState.config.height = parseInt(document.getElementById('height')?.value || AppState.config.height);
    AppState.config.age = parseInt(document.getElementById('age')?.value || AppState.config.age);
    AppState.config.gender = document.getElementById('gender')?.value || AppState.config.gender;
    AppState.config.proteinGoal = parseInt(document.getElementById('proteinGoalInput')?.value || AppState.config.proteinGoal);
    AppState.config.calsEntrenamiento = parseInt(document.getElementById('calsEntrenamiento')?.value || AppState.config.calsEntrenamiento);
    AppState.config.calsDescanso = parseInt(document.getElementById('calsDescanso')?.value || AppState.config.calsDescanso);
    AppState.config.carbsMin = parseInt(document.getElementById('carbsMin')?.value || AppState.config.carbsMin);
    AppState.config.carbsMax = parseInt(document.getElementById('carbsMax')?.value || AppState.config.carbsMax);
    AppState.config.fatsMin = parseInt(document.getElementById('fatsMin')?.value || AppState.config.fatsMin);
    AppState.config.fatsMax = parseInt(document.getElementById('fatsMax')?.value || AppState.config.fatsMax);

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
