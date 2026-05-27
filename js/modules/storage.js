// ==================== GESTIÓN DE ALMACENAMIENTO ====================

import AppState from './state.js';
import { showNotification } from './ui/notifications.js';

export function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function saveDays() {
    localStorage.setItem('nutrition_days', JSON.stringify(AppState.allDays));
}

export function loadAllDays() {
    const saved = localStorage.getItem('nutrition_days');
    if (saved) {
        try {
            AppState.allDays = JSON.parse(saved);
            console.log('loadAllDays: Cargados', Object.keys(AppState.allDays).length, 'días desde localStorage');
        } catch (e) {
            console.error('Error parsing nutrition_days:', e);
            AppState.allDays = {};
        }
    } else {
        console.log('loadAllDays: No se encontraron datos en localStorage');
        AppState.allDays = {};
    }
}

export function exportData() {
    // Importar módulos necesarios de forma dinámica para evitar circulares
    import('./weight.js').then(({ calculateNextDayPredictionForDate, calculateWeightPrediction }) => {
        const dailySummary = {};
        const dateArray = Object.keys(AppState.allDays).sort();

        dateArray.forEach((date) => {
            const day = AppState.allDays[date];
            let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

            Object.values(day.meals).forEach(meal => {
                meal.forEach(food => {
                    totalKcal += food.kcal;
                    totalProtein += food.protein;
                    totalCarbs += food.carbs;
                    totalFats += food.fats;
                });
            });

            const daySummary = {
                dayNumber: day.dayNumber,
                totalKcal: Math.round(totalKcal),
                totalProtein: parseFloat(totalProtein.toFixed(1)),
                totalCarbs: parseFloat(totalCarbs.toFixed(1)),
                totalFats: parseFloat(totalFats.toFixed(1)),
            };

            const nextPrediction = calculateNextDayPredictionForDate(date);
            if (nextPrediction) {
                daySummary.nextDayPrediction = {
                    predictedWeight: nextPrediction.predictedWeight,
                    waterRetention: nextPrediction.waterRetention,
                    fatChange: nextPrediction.fatChange,
                    trainingInflammation: nextPrediction.trainingInflammation,
                    deficit: nextPrediction.deficit,
                };
            }
            dailySummary[date] = daySummary;
        });

        const summaryValues = Object.values(dailySummary);
        const statistics = {
            totalDays: summaryValues.length,
            averageKcal: summaryValues.length > 0 ? Math.round(summaryValues.reduce((s, d) => s + d.totalKcal, 0) / summaryValues.length) : 0,
            averageProtein: summaryValues.length > 0 ? parseFloat((summaryValues.reduce((s, d) => s + d.totalProtein, 0) / summaryValues.length).toFixed(1)) : 0,
            minKcal: summaryValues.length > 0 ? Math.min(...summaryValues.map(d => d.totalKcal)) : 0,
            maxKcal: summaryValues.length > 0 ? Math.max(...summaryValues.map(d => d.totalKcal)) : 0,
            weightLost: AppState.config.startWeight - AppState.config.currentWeight,
            progressPercent: Math.round(((AppState.config.startWeight - AppState.config.currentWeight) / (AppState.config.startWeight - AppState.config.targetWeight)) * 100),
        };

        const prediction = calculateWeightPrediction();

        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            config: AppState.config,
            days: AppState.allDays,
            customProducts: AppState.customProducts,
            mealHistory: AppState.mealHistory,
            weight_history: AppState.config.weightHistory,
            dailySummary,
            statistics,
            weightPrediction: prediction ? {
                weeklyLoss: typeof prediction.weeklyLoss === 'string' ? parseFloat(prediction.weeklyLoss) : parseFloat(prediction.weeklyLoss?.toFixed(2)),
                estimatedDays: prediction.estimatedDays,
                estimatedDate: prediction.estimatedDate,
                confidence: prediction.confidence,
            } : null,
            darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
            workoutSessions: JSON.parse(localStorage.getItem('workoutSessions') || '{}'),
            workoutTemplates: JSON.parse(localStorage.getItem('workoutTemplates') || '{}'),
            exercisePRs: JSON.parse(localStorage.getItem('exercisePRs') || '{}'),
            note: 'Backup completo de todos los datos de la app con resúmenes y estadísticas',
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nutrition_backup_${getDateKey(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Datos exportados correctamente (con estadísticas)');
    });
}

export function exportCSV() {
    let csv = 'Fecha,Día,Calorías,Proteína (g),Carbos (g),Grasas (g)\n';

    Object.keys(AppState.allDays).sort().forEach(date => {
        const day = AppState.allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;

        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
                dayCarbs += food.carbs;
                dayFats += food.fats;
            });
        });

        csv += `${date},${day.dayNumber},${dayKcal.toFixed(0)},${dayProtein.toFixed(1)},${dayCarbs.toFixed(1)},${dayFats.toFixed(1)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_data_${getDateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('CSV exportado correctamente');
}

export function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.config) {
                Object.assign(AppState.config, data.config);
                if (data.config.startDate) AppState.config.startDate = new Date(data.config.startDate);
                localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
            }

            // weight_history se guarda en su propia clave (loadWeightHistory la lee por separado)
            const weightHist = (data.config && data.config.weightHistory) || data.weight_history;
            if (weightHist && weightHist.length > 0) {
                AppState.config.weightHistory = weightHist;
                localStorage.setItem('weight_history', JSON.stringify(weightHist));
            }

            if (data.days) {
                AppState.allDays = data.days;
                saveDays();
            }

            if (data.customProducts) {
                const { PRODUCTS_DB } = await import('./products.js');
                AppState.customProducts = data.customProducts.map(p => ({
                    ...p,
                    customUnit: p.customUnit || '',
                    customUnitWeight: p.customUnitWeight || null,
                }));
                localStorage.setItem('custom_products', JSON.stringify(AppState.customProducts));
                AppState.customProducts.forEach(cp => {
                    const existingIndex = PRODUCTS_DB.findIndex(p => p.id === cp.id);
                    if (existingIndex > -1) {
                        PRODUCTS_DB[existingIndex] = { ...PRODUCTS_DB[existingIndex], ...cp };
                    } else {
                        PRODUCTS_DB.push(cp);
                    }
                });
            }

            if (data.mealHistory) {
                AppState.mealHistory = data.mealHistory;
                localStorage.setItem('meal_history', JSON.stringify(AppState.mealHistory));
            }

            if (data.darkModeEnabled !== undefined) {
                localStorage.setItem('darkModeEnabled', data.darkModeEnabled.toString());
                if (data.darkModeEnabled) {
                    document.documentElement.classList.add('dark-mode');
                    document.body.classList.add('dark-mode');
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    document.body.classList.remove('dark-mode');
                }
            }

            if (data.workoutSessions && Object.keys(data.workoutSessions).length > 0) {
                localStorage.setItem('workoutSessions', JSON.stringify(data.workoutSessions));
            }
            if (data.workoutTemplates && Object.keys(data.workoutTemplates).length > 0) {
                localStorage.setItem('workoutTemplates', JSON.stringify(data.workoutTemplates));
            }
            if (data.exercisePRs && Object.keys(data.exercisePRs).length > 0) {
                localStorage.setItem('exercisePRs', JSON.stringify(data.exercisePRs));
            }

            const { loadConfig } = await import('./config-settings.js');
            const { renderProductsList } = await import('./ui/products-list.js');
            const { updateWeightPrediction, displayNextDayPrediction } = await import('./weight.js');
            const { initializeToday } = await import('./meals.js');
            const { initializeCharts, renderWeightPredictionChart } = await import('./charts.js');
            const { initSportTabs } = await import('./ui/workout-ui.js?v=501');

            loadConfig();
            renderProductsList();
            updateWeightPrediction();
            initializeToday();
            displayNextDayPrediction();
            initializeCharts();
            renderWeightPredictionChart();
            initSportTabs();
            showNotification('Todos los datos importados correctamente');
        } catch (err) {
            showNotification('Error al importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

export function clearAllData() {
    if (!confirm('¿Estás seguro? Esto eliminará TODOS los datos.')) return;
    localStorage.clear();
    AppState.allDays = {};
    showNotification('Todos los datos fueron eliminados');
    location.reload();
}
