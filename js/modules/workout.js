// ==================== PLAN DE ENTRENAMIENTOS ====================

import AppState from './state.js';
import { GYM_ROUTINE } from './constants.js';
import { showNotification } from './ui/notifications.js';

export function initWorkoutPlan() {
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const routine = AppState.config.customGymRoutine || GYM_ROUTINE;
    const dayNames = {
        lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
        jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
    };

    days.forEach(day => {
        const dayName = dayNames[day];
        const dayInfo = routine[dayName] || { type: 'descanso', label: '' };
        const typeSelect = document.getElementById(`${day}-type`);
        const labelInput = document.getElementById(`${day}-label`);
        if (typeSelect) typeSelect.value = dayInfo.type || 'descanso';
        if (labelInput) labelInput.value = dayInfo.label || '';
    });
}

export function updateWorkoutPlan() {
    // Placeholder para validación en tiempo real si se necesita
}

export function saveWorkoutPlan() {
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const dayNames = {
        lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
        jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
    };

    const customRoutine = {};
    let hasError = false;

    days.forEach(day => {
        const dayName = dayNames[day];
        const typeSelect = document.getElementById(`${day}-type`);
        const labelInput = document.getElementById(`${day}-label`);
        const type = typeSelect?.value || 'descanso';
        const label = labelInput?.value?.trim() || '';

        if (!label && type === 'entreno') {
            showNotification(`⚠️ Por favor completa la descripción para ${dayName}`, 'warning');
            hasError = true;
            return;
        }

        customRoutine[dayName] = {
            type: type,
            label: label || (type === 'descanso' ? 'Descanso' : ''),
        };
    });

    if (hasError) return;

    AppState.config.customGymRoutine = customRoutine;
    localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
    showNotification('✅ Plan de entrenamientos guardado correctamente', 'success');

    import('./meals.js').then(m => m.renderDay());
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    import('./weight.js').then(m => m.displayNextDayPrediction());
}

export function resetWorkoutPlan() {
    if (confirm('¿Seguro que deseas restaurar el plan por defecto?')) {
        AppState.config.customGymRoutine = null;
        localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
        initWorkoutPlan();
        showNotification('✅ Plan restaurado al valor por defecto', 'success');

        import('./meals.js').then(m => m.renderDay());
        import('./config-settings.js').then(m => m.updateHeaderInfo());
        import('./weight.js').then(m => m.displayNextDayPrediction());
    }
}
