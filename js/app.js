// NUTRITION TRACKER PRO - MODULAR VERSION
// Sistema profesional con arquitectura modularizada

// ==================== SERVICE WORKER REGISTRATION ====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(registration => {
        console.log('✅ Service Worker registrado:', registration);
    }).catch(error => {
        console.log('❌ Error al registrar Service Worker:', error);
    });
}

// ==================== MAIN APP ORCHESTRATOR ====================
const App = {
    // Inicializar toda la aplicación
    init() {
        console.log('🚀 Iniciando Nutrition Tracker...');

        try {
            // 1. Cargar datos desde localStorage
            Config.load();
            Meals.loadDays();
            Meals.loadCustomProducts();
            Meals.loadMealHistory();
            Weight.loadHistory();

            // 2. Configurar UI
            UI.init();
            Statistics.initializeCharts();

            // 3. Renderizar día actual
            UI.renderDay();

            // 4. Setup event listeners
            this.setupEventListeners();

            console.log('✅ Aplicación inicializada correctamente');
            Utils.showNotification('¡Bienvenido a Nutrition Tracker!', 'success');

        } catch (error) {
            console.error('❌ Error al inicializar app:', error);
            Utils.showNotification('Error al inicializar la aplicación', 'error');
        }
    },

    // Configurar listeners globales
    setupEventListeners() {
        // Botones de navegación de días
        const prevBtn = document.querySelector('[data-prev-day]');
        const nextBtn = document.querySelector('[data-next-day]');
        const todayBtn = document.querySelector('[data-today]');

        if (prevBtn) prevBtn.addEventListener('click', () => {
            UI.previousDay();
            UI.renderDay();
        });

        if (nextBtn) nextBtn.addEventListener('click', () => {
            UI.nextDay();
            UI.renderDay();
        });

        if (todayBtn) todayBtn.addEventListener('click', () => {
            UI.todayDay();
            UI.renderDay();
        });

        // Botones de configuración
        this.setupConfigListeners();

        // Botones de comidas
        this.setupMealListeners();

        // Botones de import/export
        this.setupStorageListeners();

        // Dark mode
        const darkModeToggle = document.querySelector('[data-toggle-dark-mode]');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', () => UI.toggleDarkMode());
        }
    },

    // Setup listeners de configuración
    setupConfigListeners() {
        const configInputs = [
            'startWeight', 'currentWeight', 'targetWeight', 'age', 'height', 'startDate'
        ];

        configInputs.forEach(key => {
            const input = document.querySelector(`[data-config="${key}"]`);
            if (input) {
                input.addEventListener('change', (e) => {
                    Config.set(key, e.target.value);
                    Config.updateCalculatedValues();
                    UI.renderDay();
                    Utils.showNotification('Configuración actualizada', 'success');
                });
            }
        });
    },

    // Setup listeners de comidas
    setupMealListeners() {
        // Buttons para agregar comidas
        document.querySelectorAll('[data-add-meal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mealType = e.target.dataset.addMeal;
                this.openMealModal(mealType);
            });
        });

        // Buttons para eliminar comidas
        document.addEventListener('click', (e) => {
            if (e.target.dataset.deleteFood) {
                const [dateKey, mealType, index] = e.target.dataset.deleteFood.split('|');
                Meals.deleteFood(dateKey, mealType, parseInt(index));
                UI.renderDay();
                Utils.showNotification('Comida eliminada', 'success');
            }
        });
    },

    // Setup listeners de storage
    setupStorageListeners() {
        const exportBtn = document.querySelector('[data-export]');
        const importBtn = document.querySelector('[data-import]');
        const clearBtn = document.querySelector('[data-clear]');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const data = Storage.exportData();
                Utils.downloadFile(data, `nutrition-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
                Utils.showNotification('Datos exportados', 'success');
            });
        }

        if (importBtn) {
            importBtn.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (Storage.importData(event.target.result)) {
                            location.reload();
                        } else {
                            Utils.showNotification('Error al importar datos', 'error');
                        }
                    };
                    reader.readAsText(file);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('¿Estás seguro de que quieres eliminar TODO?')) {
                    Storage.clearAllData();
                }
            });
        }
    },

    // Modal de comidas
    openMealModal(mealType) {
        const modal = document.querySelector('[data-meal-modal]');
        if (!modal) return;

        modal.dataset.mealType = mealType;
        modal.classList.remove('hidden');

        // Setup form submit
        const form = modal.querySelector('form');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                this.submitMealForm(mealType);
            };
        }
    },

    closeMealModal() {
        const modal = document.querySelector('[data-meal-modal]');
        if (modal) modal.classList.add('hidden');
    },

    submitMealForm(mealType) {
        const modal = document.querySelector('[data-meal-modal]');
        const nameInput = modal.querySelector('input[name="food_name"]');
        const caloriesInput = modal.querySelector('input[name="calories"]');
        const proteinInput = modal.querySelector('input[name="protein"]');
        const carbsInput = modal.querySelector('input[name="carbs"]');
        const fatsInput = modal.querySelector('input[name="fats"]');

        if (!nameInput?.value) {
            Utils.showNotification('Completa todos los campos', 'error');
            return;
        }

        const food = {
            name: nameInput.value,
            calories: parseFloat(caloriesInput?.value || 0),
            protein: parseFloat(proteinInput?.value || 0),
            carbs: parseFloat(carbsInput?.value || 0),
            fats: parseFloat(fatsInput?.value || 0)
        };

        Meals.addFood(UI.currentDay, mealType, food);
        Meals.addToHistory(food);
        this.closeMealModal();
        UI.renderDay();
        Utils.showNotification('Comida agregada', 'success');

        // Limpiar form
        modal.querySelector('form').reset();
    }
};

// ==================== INITIALIZE APP ====================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// ==================== GLOBAL EXPORTS FOR BACKWARD COMPATIBILITY ====================
// Funciones globales mantenidas para compatibilidad con HTML inline
function toggleAccordion(headerElement) {
    if (headerElement.classList.contains('active')) {
        headerElement.classList.remove('active');
        const content = headerElement.nextElementSibling;
        if (content?.classList.contains('accordion-content')) {
            content.classList.remove('active');
        }
    } else {
        document.querySelectorAll('.accordion-header').forEach(h => {
            h.classList.remove('active');
            h.nextElementSibling?.classList.remove('active');
        });
        headerElement.classList.add('active');
        const content = headerElement.nextElementSibling;
        if (content?.classList.contains('accordion-content')) {
            content.classList.add('active');
            if (content.id === 'tab-pesos') {
                Weight.renderHistory();
            }
        }
    }
}

function openModal(mealType) {
    App.openMealModal(mealType);
}

function closeModal() {
    App.closeMealModal();
}

function deleteFood(dateKey, mealType, index) {
    Meals.deleteFood(dateKey, mealType, index);
    UI.renderDay();
}

function recordWeight(date, weight) {
    Weight.recordWeight(date, weight);
    Weight.renderHistory();
    Utils.showNotification('Peso registrado', 'success');
}

function previousDay() {
    UI.previousDay();
}

function nextDay() {
    UI.nextDay();
}

function todayDay() {
    UI.todayDay();
}

function showTab(tabId) {
    UI.showTab(tabId);
}

function exportData() {
    const data = Storage.exportData();
    Utils.downloadFile(data, `nutrition-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function clearAllData() {
    Storage.clearAllData();
}
