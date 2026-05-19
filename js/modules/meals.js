/**
 * Meals Module - Gestiona comidas, productos, modal
 */
const Meals = {
    days: {},
    customProducts: [],
    mealHistory: [],

    // Cargar días
    loadDays() {
        this.days = Storage.loadDays();
        return this.days;
    },

    // Guardar días
    saveDays() {
        Storage.saveDays(this.days);
    },

    // Cargar productos personalizados
    loadCustomProducts() {
        this.customProducts = Storage.loadCustomProducts();
        return this.customProducts;
    },

    // Guardar productos personalizados
    saveCustomProducts() {
        Storage.saveCustomProducts(this.customProducts);
    },

    // Cargar historial de comidas
    loadMealHistory() {
        this.mealHistory = Storage.loadMealHistory();
        return this.mealHistory;
    },

    // Guardar historial de comidas
    saveMealHistory() {
        Storage.saveMealHistory(this.mealHistory);
    },

    // Inicializar día si no existe
    initializeDay(dateKey) {
        if (!this.days[dateKey]) {
            this.days[dateKey] = {
                breakfast: [],
                lunch: [],
                snack: [],
                dinner: [],
                totalCalories: 0,
                totalProtein: 0,
                totalCarbs: 0,
                totalFats: 0
            };
            this.saveDays();
        }
        return this.days[dateKey];
    },

    // Agregar comida
    addFood(dateKey, mealType, food) {
        this.initializeDay(dateKey);
        this.days[dateKey][mealType].push(food);
        this.updateDayTotals(dateKey);
        this.saveDays();
    },

    // Eliminar comida
    deleteFood(dateKey, mealType, index) {
        this.days[dateKey][mealType].splice(index, 1);
        this.updateDayTotals(dateKey);
        this.saveDays();
    },

    // Calcular totales del día
    updateDayTotals(dateKey) {
        const day = this.days[dateKey];
        const allFoods = [
            ...day.breakfast,
            ...day.lunch,
            ...day.snack,
            ...day.dinner
        ];

        day.totalCalories = allFoods.reduce((sum, food) => sum + (food.calories || 0), 0);
        day.totalProtein = allFoods.reduce((sum, food) => sum + (food.protein || 0), 0);
        day.totalCarbs = allFoods.reduce((sum, food) => sum + (food.carbs || 0), 0);
        day.totalFats = allFoods.reduce((sum, food) => sum + (food.fats || 0), 0);
    },

    // Agregar producto personalizado
    addCustomProduct(product) {
        this.customProducts.push({
            id: Date.now(),
            ...product
        });
        this.saveCustomProducts();
    },

    // Eliminar producto personalizado
    deleteCustomProduct(productId) {
        this.customProducts = this.customProducts.filter(p => p.id !== productId);
        this.saveCustomProducts();
    },

    // Agregar comida a historial
    addToHistory(mealData) {
        this.mealHistory.unshift(mealData);
        if (this.mealHistory.length > 50) {
            this.mealHistory.pop();
        }
        this.saveMealHistory();
    },

    // Obtener comidas frecuentes
    getFrequentMeals(limit = 15) {
        const frequency = {};
        this.mealHistory.forEach(meal => {
            const key = meal.name;
            frequency[key] = (frequency[key] || 0) + 1;
        });
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name, count]) => {
                const meal = this.mealHistory.find(m => m.name === name);
                return meal;
            });
    }
};
