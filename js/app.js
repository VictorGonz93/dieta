// ==================== ENTRY POINT (ES MODULES) ====================
// Versión modularizada. Importa todos los módulos y expone funciones a window.

import AppState from './modules/state.js';
import { CURRENT_APP_VERSION } from './modules/constants.js';

// Módulos de lógica
import { loadCustomProducts, addNewProduct, deleteProduct, editProductCustomUnit, saveProductCustomUnit, editProduct, saveProductEdit } from './modules/products.js';
import { loadConfig, saveConfig, updateHeaderInfo } from './modules/config-settings.js';
import { loadMealHistory, initializeToday, renderDay, addFood, deleteFood, previousDay, nextDay, todayDay } from './modules/meals.js';
import { loadWeightHistory, saveDailyWeight, updateWeightPrediction, displayNextDayPrediction, renderWeightHistory, updateWeightEntry, deleteWeightEntry } from './modules/weight.js';
import { loadAllDays, exportData, exportCSV, importData, clearAllData } from './modules/storage.js';
import { initializeCharts } from './modules/charts.js';
import { initWorkoutPlan, updateWorkoutPlan, saveWorkoutPlan, resetWorkoutPlan } from './modules/workout.js';

// Módulos de UI
import { loadDarkMode, toggleDarkMode } from './modules/ui/darkmode.js';
import { toggleAccordion } from './modules/ui/accordion.js';
import { setupTabNavigation, showTab } from './modules/ui/tabs.js';
import { openModal, closeModal, setupTabSearch, selectProduct } from './modules/ui/modal.js';
import { showOnboarding, closeOnboarding, startOnboarding, setupOnboardingListeners } from './modules/ui/onboarding.js';
import { renderProductsList } from './modules/ui/products-list.js';
import { startUpdateChecker, showUpdateAvailableModal, performUpdate } from './modules/ui/update.js';
import { showNotification } from './modules/ui/notifications.js';

// ==================== SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(registration => {
        console.log('✅ Service Worker registrado:', registration);
    }).catch(error => {
        console.log('❌ Error al registrar Service Worker:', error);
    });

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
            console.log('📦 Nueva versión disponible (SW):', event.data.version);
            showUpdateAvailableModal();
        }
    });
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    loadDarkMode();
    loadConfig();
    loadCustomProducts();
    loadMealHistory();
    loadWeightHistory();
    loadAllDays();
    initializeToday();
    renderProductsList();
    updateWeightPrediction();
    displayNextDayPrediction();
    setupTabNavigation();
    setupTabSearch();
    updateHeaderInfo();
    showOnboarding();
    setupOnboardingListeners();
    startUpdateChecker();

    // Búsqueda y filtro de productos
    const searchInput = document.getElementById('searchProduct');
    const categorySelect = document.getElementById('categoryFilter');
    if (searchInput) searchInput.addEventListener('input', renderProductsList);
    if (categorySelect) categorySelect.addEventListener('change', renderProductsList);
});

// ==================== EXPOSICIÓN A WINDOW (onclick en HTML) ====================
window.toggleDarkMode = toggleDarkMode;
window.openModal = openModal;
window.closeModal = closeModal;
window.addFood = addFood;
window.deleteFood = deleteFood;
window.selectProduct = selectProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.editProductCustomUnit = editProductCustomUnit;
window.saveProductCustomUnit = saveProductCustomUnit;
window.saveProductEdit = saveProductEdit;
window.addNewProduct = addNewProduct;
window.renderProductsList = renderProductsList;
window.previousDay = previousDay;
window.nextDay = nextDay;
window.todayDay = todayDay;
window.saveDailyWeight = saveDailyWeight;
window.saveConfig = saveConfig;
window.exportData = exportData;
window.exportCSV = exportCSV;
window.importData = importData;
window.clearAllData = clearAllData;
window.showTab = showTab;
window.toggleAccordion = toggleAccordion;
window.showOnboarding = showOnboarding;
window.closeOnboarding = closeOnboarding;
window.startOnboarding = startOnboarding;
window.saveWorkoutPlan = saveWorkoutPlan;
window.resetWorkoutPlan = resetWorkoutPlan;
window.updateWorkoutPlan = updateWorkoutPlan;
window.updateWeightEntry = updateWeightEntry;
window.deleteWeightEntry = deleteWeightEntry;
window.performUpdate = performUpdate;
window.initializeCharts = initializeCharts;
window.renderWeightHistory = renderWeightHistory;
window.showNotification = showNotification;
