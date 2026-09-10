// ==================== GESTIÓN DE COMBOS / RECETAS FRECUENTES ====================

import AppState from './state.js';
import { getDateKey, saveDays, saveMealCombos } from './storage.js';
import { showNotification } from './ui/notifications.js';

/**
 * Obtiene los combos guardados
 */
export function getMealCombos() {
    return AppState.mealCombos || [];
}

/**
 * Guarda una lista de alimentos como un nuevo combo
 * @param {string} comboName - Nombre identificativo del combo (ej: "Desayuno Proteico")
 * @param {Array} items - Lista de alimentos [{ name, quantity, unit, kcal, protein, carbs, fats }]
 */
export function createMealCombo(comboName, items) {
    if (!comboName || !items || items.length === 0) {
        showNotification('El combo debe tener un nombre y al menos un alimento', 'error');
        return false;
    }

    const cleanItems = items.map(item => ({
        name: item.name,
        quantity: parseFloat(item.quantity) || 100,
        unit: item.unit || 'g',
        kcal: parseFloat(item.kcal) || 0,
        protein: parseFloat(item.protein) || 0,
        carbs: parseFloat(item.carbs) || 0,
        fats: parseFloat(item.fats) || 0,
    }));

    const totalKcal = cleanItems.reduce((s, i) => s + i.kcal, 0);
    const totalProtein = cleanItems.reduce((s, i) => s + i.protein, 0);

    const newCombo = {
        id: Date.now(),
        name: comboName.trim(),
        totalKcal: Math.round(totalKcal),
        totalProtein: parseFloat(totalProtein.toFixed(1)),
        items: cleanItems,
        createdAt: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    };

    AppState.mealCombos.push(newCombo);
    saveMealCombos();
    showNotification(`Combo "${newCombo.name}" guardado correctamente`);
    return true;
}

/**
 * Guarda los alimentos actualmente presentes en una comida como un combo
 * @param {'breakfast' | 'lunch' | 'snack' | 'dinner'} mealType
 * @param {string} comboName
 */
export function saveCurrentMealAsCombo(mealType, comboName) {
    const dateKey = getDateKey(AppState.currentDate);
    const dayData = AppState.allDays[dateKey];
    if (!dayData || !dayData.meals[mealType] || dayData.meals[mealType].length === 0) {
        showNotification('No hay alimentos en esta comida para guardar como combo', 'warning');
        return false;
    }

    return createMealCombo(comboName, dayData.meals[mealType]);
}

/**
 * Elimina un combo por su ID
 * @param {number} comboId
 */
export function deleteMealCombo(comboId) {
    const idx = AppState.mealCombos.findIndex(c => c.id == comboId);
    if (idx > -1) {
        const deletedName = AppState.mealCombos[idx].name;
        AppState.mealCombos.splice(idx, 1);
        saveMealCombos();
        showNotification(`Combo "${deletedName}" eliminado`, 'success');
        return true;
    }
    return false;
}

/**
 * Aplica todos los alimentos de un combo a la comida actual del modal
 * @param {number} comboId
 */
export async function applyComboToCurrentMeal(comboId) {
    if (!AppState.currentMealForModal) {
        showNotification('Selecciona primero una comida para añadir el combo', 'error');
        return;
    }

    const combo = AppState.mealCombos.find(c => c.id == comboId);
    if (!combo) {
        showNotification('Combo no encontrado. Intenta de nuevo.', 'error');
        return;
    }

    try {
        const dateKey = getDateKey(AppState.currentDate);
        if (!AppState.allDays[dateKey]) {
            const { initializeToday } = await import('./meals.js');
            initializeToday();
        }

        const currentMealList = AppState.allDays[dateKey].meals[AppState.currentMealForModal];
        if (!currentMealList) {
            showNotification('No se pudo acceder a la comida seleccionada', 'error');
            return;
        }

        // Añadir cada alimento del combo a la comida
        combo.items.forEach(item => {
            currentMealList.push({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                kcal: item.kcal,
                protein: item.protein,
                carbs: item.carbs,
                fats: item.fats,
                time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            });
        });

        saveDays();

        // Actualizar UI
        const { renderDay, updateDaySummary } = await import('./meals.js');
        const { closeModal } = await import('./ui/modal.js');

        closeModal();
        renderDay();
        updateDaySummary(AppState.allDays[dateKey]);

        showNotification(`Combo "${combo.name}" (${combo.items.length} alimentos) añadido`);
    } catch (err) {
        console.error('Error aplicando combo:', err);
        showNotification('Error al aplicar el combo. Reintenta.', 'error');
    }
}

window.applyComboToCurrentMeal = applyComboToCurrentMeal;
window.deleteMealCombo = deleteMealCombo;
