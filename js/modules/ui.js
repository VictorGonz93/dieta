/**
 * UI Module - Navegación, onboarding, renderizado de UI
 */
const UI = {
    currentDay: new Date().toISOString().split('T')[0],
    currentTab: 'hoy',

    // Inicializar
    init() {
        this.setupTabNavigation();
        this.setupOnboarding();
        this.loadDarkMode();
    },

    // Configurar navegación de pestañas
    setupTabNavigation() {
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.showTab(tabId);
            });
        });
    },

    // Mostrar pestaña
    showTab(tabId) {
        this.currentTab = tabId;

        // Ocultar todas las pestañas
        document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
            panel.classList.add('hidden');
        });

        // Mostrar pestaña seleccionada
        const activePanel = document.getElementById(tabId);
        if (activePanel) {
            activePanel.classList.remove('hidden');

            // Trigger updates
            if (tabId === 'estadisticas') {
                Statistics.renderHistory();
            } else if (tabId === 'historial') {
                Statistics.renderHistory();
            }
        }
    },

    // Configurar onboarding
    setupOnboarding() {
        if (!this.isConfigComplete()) {
            this.showOnboarding();
        }
    },

    // Verificar si configuración está completa
    isConfigComplete() {
        const config = Config.data;
        return !!(
            config.currentWeight &&
            config.targetWeight &&
            config.startDate &&
            config.height &&
            config.age
        );
    },

    // Mostrar modal onboarding
    showOnboarding() {
        const modal = document.querySelector('[data-onboarding]');
        if (modal) modal.classList.remove('hidden');
    },

    // Cerrar modal onboarding
    closeOnboarding() {
        const modal = document.querySelector('[data-onboarding]');
        if (modal) modal.classList.add('hidden');
    },

    // Dark mode
    loadDarkMode() {
        if (Config.loadDarkMode()) {
            document.documentElement.classList.add('dark');
        }
    },

    toggleDarkMode() {
        Config.toggleDarkMode();
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    },

    // Navegar días
    previousDay() {
        const date = new Date(this.currentDay);
        date.setDate(date.getDate() - 1);
        this.currentDay = date.toISOString().split('T')[0];
        this.renderDay();
    },

    nextDay() {
        const date = new Date(this.currentDay);
        date.setDate(date.getDate() + 1);
        const today = new Date().toISOString().split('T')[0];
        if (date.toISOString().split('T')[0] <= today) {
            this.currentDay = date.toISOString().split('T')[0];
            this.renderDay();
        }
    },

    todayDay() {
        this.currentDay = new Date().toISOString().split('T')[0];
        this.renderDay();
    },

    // Renderizar día actual
    renderDay() {
        const dayContainer = document.querySelector('#dayContent');
        if (!dayContainer) return;

        Meals.initializeDay(this.currentDay);
        const day = Meals.days[this.currentDay];

        dayContainer.innerHTML = `
            <h2>${this.currentDay}</h2>
            <div>Total: ${day.totalCalories} kcal</div>
            <div>Proteína: ${day.totalProtein}g</div>
        `;
    }
};
