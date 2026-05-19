/**
 * Storage Module - Gestiona localStorage, import/export de datos
 */
const Storage = {
    // Cargar toda la configuración
    loadConfig() {
        const saved = localStorage.getItem('nutrition_config');
        return saved ? JSON.parse(saved) : this.getDefaultConfig();
    },

    // Guardar configuración
    saveConfig(config) {
        localStorage.setItem('nutrition_config', JSON.stringify(config));
    },

    // Cargar días
    loadDays() {
        const saved = localStorage.getItem('nutrition_days');
        return saved ? JSON.parse(saved) : {};
    },

    // Guardar días
    saveDays(days) {
        localStorage.setItem('nutrition_days', JSON.stringify(days));
    },

    // Cargar historial de pesos
    loadWeightHistory() {
        const saved = localStorage.getItem('weight_history');
        return saved ? JSON.parse(saved) : {};
    },

    // Guardar historial de pesos
    saveWeightHistory(history) {
        localStorage.setItem('weight_history', JSON.stringify(history));
    },

    // Cargar productos personalizados
    loadCustomProducts() {
        const saved = localStorage.getItem('custom_products');
        return saved ? JSON.parse(saved) : [];
    },

    // Guardar productos personalizados
    saveCustomProducts(products) {
        localStorage.setItem('custom_products', JSON.stringify(products));
    },

    // Cargar historial de comidas
    loadMealHistory() {
        const saved = localStorage.getItem('meal_history');
        return saved ? JSON.parse(saved) : [];
    },

    // Guardar historial de comidas
    saveMealHistory(history) {
        localStorage.setItem('meal_history', JSON.stringify(history));
    },

    // Cargar preferencia dark mode
    loadDarkMode() {
        const saved = localStorage.getItem('darkModeEnabled');
        return saved ? JSON.parse(saved) : false;
    },

    // Guardar preferencia dark mode
    saveDarkMode(enabled) {
        localStorage.setItem('darkModeEnabled', JSON.stringify(enabled));
    },

    // Exportar datos completos a JSON
    exportData() {
        const data = {
            config: this.loadConfig(),
            days: this.loadDays(),
            weightHistory: this.loadWeightHistory(),
            customProducts: this.loadCustomProducts(),
            mealHistory: this.loadMealHistory(),
            exportedAt: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    // Importar datos desde JSON
    importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.config) this.saveConfig(data.config);
            if (data.days) this.saveDays(data.days);
            if (data.weightHistory) this.saveWeightHistory(data.weightHistory);
            if (data.customProducts) this.saveCustomProducts(data.customProducts);
            if (data.mealHistory) this.saveMealHistory(data.mealHistory);
            return true;
        } catch (e) {
            console.error('Error importing data:', e);
            return false;
        }
    },

    // Exportar a CSV
    exportCSV() {
        const days = this.loadDays();
        let csv = 'Fecha,Kcal,Proteína (g),Hidratos (g),Grasas (g)\n';
        Object.keys(days).sort().forEach(dateKey => {
            const day = days[dateKey];
            csv += `${dateKey},${day.totalCalories || 0},${day.totalProtein || 0},${day.totalCarbs || 0},${day.totalFats || 0}\n`;
        });
        return csv;
    },

    // Limpiar todo
    clearAllData() {
        if (confirm('¿Estás seguro? Esto eliminará TODO.')) {
            localStorage.clear();
            location.reload();
        }
    },

    // Configuración por defecto
    getDefaultConfig() {
        return {
            currentWeight: 75,
            startDate: new Date().toISOString().split('T')[0],
            targetWeight: 70,
            age: 25,
            height: 180,
            gender: 'male',
            trainingDaysPerWeek: 4,
            dailyProteinTarget: 160,
            macroPreset: 'balanced',
            weeklyDeficitTarget: 3500
        };
    }
};
