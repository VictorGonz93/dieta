// ==================== ONBOARDING ====================

import AppState from '../state.js';
import { REQUIRED_FIELDS } from '../constants.js';

export function isConfigComplete() {
    return !!(
        AppState.config.startWeight &&
        AppState.config.currentWeight &&
        AppState.config.targetWeight &&
        AppState.config.startDate &&
        AppState.config.height &&
        AppState.config.age &&
        AppState.config.gender
    );
}

export function calculateProfileProgress() {
    let completed = 0;
    REQUIRED_FIELDS.forEach(field => {
        if (AppState.config[field.key]) completed++;
    });

    return {
        completed,
        total: REQUIRED_FIELDS.length,
        percentage: Math.round((completed / REQUIRED_FIELDS.length) * 100),
    };
}

export function getMotivationalMessage(progress) {
    const { percentage } = progress;
    if (percentage === 0) return '¡Comienza rellenando los datos personales!';
    if (percentage < 30) return '¡Buen comienzo! Continúa completando tu perfil.';
    if (percentage < 60) return '¡Ya va bien! Falta poco para terminar.';
    if (percentage < 100) return '¡Casi lo logras! Solo falta completar unos pocos campos.';
    return '¡Perfil completado! ¡A rastrear!';
}

export function updateOnboardingProgress() {
    const progress = calculateProfileProgress();
    const { completed, total, percentage } = progress;

    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercentage = document.getElementById('progressPercentage');

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${completed}/${total}`;
    if (progressPercentage) progressPercentage.textContent = `${percentage}% completado`;

    const missingFieldsList = document.getElementById('missingFieldsList');
    if (missingFieldsList) {
        missingFieldsList.innerHTML = '';
        REQUIRED_FIELDS.forEach(field => {
            const isCompleted = !!AppState.config[field.key];
            const fieldElement = document.createElement('div');
            fieldElement.className = `flex items-center gap-2 p-2 rounded ${isCompleted ? 'bg-success/10 text-success' : 'bg-slate-700/30 text-slate-400'}`;

            const checkIcon = document.createElement('span');
            checkIcon.className = 'material-icons text-sm';
            checkIcon.textContent = isCompleted ? 'check_circle' : 'radio_button_unchecked';

            const label = document.createElement('span');
            label.className = 'text-xs font-medium';
            label.textContent = field.label;

            fieldElement.appendChild(checkIcon);
            fieldElement.appendChild(label);
            missingFieldsList.appendChild(fieldElement);
        });
    }

    const motivationalText = document.getElementById('motivationalText');
    if (motivationalText) motivationalText.textContent = getMotivationalMessage(progress);
}

export function showOnboarding() {
    if (!isConfigComplete()) {
        const modal = document.getElementById('onboardingModal');
        if (modal) {
            modal.classList.remove('hidden');
            updateOnboardingProgress();
        }
    }
}

export function closeOnboarding() {
    const modal = document.getElementById('onboardingModal');
    if (modal) modal.classList.add('hidden');
}

export function startOnboarding() {
    closeOnboarding();
    import('./tabs.js').then(m => m.showTab('config'));
    setTimeout(() => {
        const personalAccordion = document.querySelector('[data-step="personal"]');
        if (personalAccordion) {
            personalAccordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
}

export function setupOnboardingListeners() {
    const inputIds = ['startWeight', 'currentWeightInput', 'targetWeight', 'startDate', 'height', 'age', 'gender'];
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', updateOnboardingProgress);
            input.addEventListener('blur', updateOnboardingProgress);
        }
    });
}
