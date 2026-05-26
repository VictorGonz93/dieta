// ==================== ESTADO GLOBAL COMPARTIDO ====================
// Módulo de estado central. Todos los módulos importan de aquí.
// Usar propiedades del objeto para evitar problemas de re-asignación con ES modules.

const AppState = {
    currentDate: new Date(),
    allDays: {},
    config: {
        startWeight: null,
        currentWeight: null,
        targetWeight: null,
        startDate: null,
        height: null,
        age: null,
        gender: null,
        proteinGoal: null,
        calsEntrenamiento: null,
        calsDescanso: null,
        carbsMin: null,
        carbsMax: null,
        fatsMin: null,
        fatsMax: null,
        customGymRoutine: null,
        weightHistory: [],
    },
    customProducts: [],
    mealHistory: [],
    charts: {},
    currentMealForModal: null,
    latestRemoteVersion: null,
    updateCheckInterval: null,
};

export default AppState;
