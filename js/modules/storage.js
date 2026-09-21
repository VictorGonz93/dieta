// ==================== GESTIÓN DE ALMACENAMIENTO ====================

import AppState from './state.js';
import { clearAdaptiveTDEECache } from './nutrition.js';
import { showNotification } from './ui/notifications.js';

export function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ─── Acceso seguro a localStorage ───────────────────────────────────────────
// safeGet: nunca lanza; ante JSON corrupto pone en cuarentena y devuelve fallback.
// safeSet: nunca lanza; ante falta de cuota avisa al usuario. Devuelve true/false.
export function safeGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`[Storage] Clave corrupta '${key}', usando fallback:`, e.message);
        try {
            const raw = localStorage.getItem(key);
            localStorage.setItem(`${key}:corrupt:${Date.now()}`, raw);
            localStorage.removeItem(key);
        } catch (_) { /* cuarentena best-effort */ }
        return fallback;
    }
}

export function safeSet(key, value) {
    try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
    } catch (e) {
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
        console.error(`[Storage] Error al guardar '${key}':`, e && e.message);
        showNotification(
            isQuota
                ? 'Almacenamiento lleno: exporta tus datos y borra días antiguos'
                : `Error al guardar datos (${key})`,
            'error'
        );
        return false;
    }
}

export function saveDays() {
    const ok = safeSet('nutrition_days', AppState.allDays);
    // Los targets/TDEE dependen de AppState.allDays: invalidar siempre tras mutar
    notifyNutritionChanged();
    return ok;
}

// Invalida cachés nutricionales tras mutar entrenos o días por vías que no
// pasan por saveDays() (sesiones, import). Síncrono y sin propagar errores.
export function notifyNutritionChanged() {
    try { clearAdaptiveTDEECache(); } catch (_) { /* módulo aún no evaluado */ }
}

export function loadMealCombos() {
    const saved = localStorage.getItem('meal_combos');
    if (saved) {
        try { AppState.mealCombos = JSON.parse(saved); } catch (e) { AppState.mealCombos = []; }
    }
}

export function saveMealCombos() {
    return safeSet('meal_combos', AppState.mealCombos);
}

export function loadAllDays() {
    const saved = localStorage.getItem('nutrition_days');
    if (saved) {
        const parsed = safeGet('nutrition_days', {});
        if (!_isPlainObject(parsed)) {
            AppState.allDays = {};
        } else {
            // Sanitizar en memoria: días malformados se descartan sin romper consumidores
            const clean = {};
            let dropped = 0;
            Object.keys(parsed).forEach(dateKey => {
                const day = _sanitizeDay(parsed[dateKey]);
                if (day) clean[dateKey] = day;
                else dropped++;
            });
            if (dropped > 0) console.warn(`[Storage] ${dropped} día(s) malformados descartados al cargar`);
            AppState.allDays = clean;
            console.log('loadAllDays: Cargados', Object.keys(AppState.allDays).length, 'días desde localStorage');
        }
    } else {
        console.log('loadAllDays: No se encontraron datos en localStorage');
        AppState.allDays = {};
    }
}

export function exportData() {
    // Importar módulos necesarios de forma dinámica para evitar circulares
    import('./weight.js').then(({ calculateNextDayPredictionForDate, calculateWeightPrediction }) => {
        try {
            const dailySummary = {};
            const dateArray = Object.keys(AppState.allDays).sort();
            let skippedDays = 0;

            dateArray.forEach((date) => {
                try {
                    const day = AppState.allDays[date];
                    if (!day || typeof day.meals !== 'object') { skippedDays++; return; }
                    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

                    Object.values(day.meals).forEach(meal => {
                        if (!Array.isArray(meal)) return;
                        meal.forEach(food => {
                            totalKcal += parseFloat(food.kcal) || 0;
                            totalProtein += parseFloat(food.protein) || 0;
                            totalCarbs += parseFloat(food.carbs) || 0;
                            totalFats += parseFloat(food.fats) || 0;
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
                            deficitVsTDEE: nextPrediction.deficitVsTDEE,
                        };
                    }
                    dailySummary[date] = daySummary;
                } catch (dayErr) {
                    console.warn(`[Export] Día ${date} omitido:`, dayErr.message);
                    skippedDays++;
                }
            });

            const summaryValues = Object.values(dailySummary);
            const weightRange = (AppState.config.startWeight || 0) - (AppState.config.targetWeight || 0);
            const statistics = {
                totalDays: summaryValues.length,
                averageKcal: summaryValues.length > 0 ? Math.round(summaryValues.reduce((s, d) => s + d.totalKcal, 0) / summaryValues.length) : 0,
                averageProtein: summaryValues.length > 0 ? parseFloat((summaryValues.reduce((s, d) => s + d.totalProtein, 0) / summaryValues.length).toFixed(1)) : 0,
                minKcal: summaryValues.length > 0 ? Math.min(...summaryValues.map(d => d.totalKcal)) : 0,
                maxKcal: summaryValues.length > 0 ? Math.max(...summaryValues.map(d => d.totalKcal)) : 0,
                weightLost: AppState.config.startWeight - AppState.config.currentWeight,
                progressPercent: weightRange > 0 ? Math.round(((AppState.config.startWeight - AppState.config.currentWeight) / weightRange) * 100) : 0,
            };

            const prediction = calculateWeightPrediction();

            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                config: AppState.config,
                days: AppState.allDays,
                customProducts: AppState.customProducts,
                mealHistory: AppState.mealHistory,
                mealCombos: AppState.mealCombos,
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
                workoutSessions: safeGet('workoutSessions', {}),
                workoutTemplates: safeGet('workoutTemplates', {}),
                exercisePRs: safeGet('exercisePRs', {}),
                customExercises: safeGet('custom_exercises', []),
                predictionCalibration: safeGet('prediction_calibration', null),
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
            showNotification(skippedDays > 0
                ? `Datos exportados (${skippedDays} día(s) corrupto(s) omitidos)`
                : 'Datos exportados correctamente (con estadísticas)',
                skippedDays > 0 ? 'warning' : 'success');
        } catch (err) {
            console.error('[Export] Error:', err);
            showNotification('Error al exportar: ' + err.message, 'error');
        }
    }).catch(err => {
        console.error('[Export] Error cargando módulo:', err);
        showNotification('Error al exportar: ' + err.message, 'error');
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

// ─── Validación de backups ────────────────────────────────────────────────────
// Valida la estructura ANTES de escribir nada (importación atómica).
// Los días malformados se reparan (slots no-array → []) o se descartan;
// el resto de secciones inválidas se omiten con aviso. Nunca lanza.
const _MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];

function _sanitizeDay(rawDay) {
    if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) return null;
    if (!rawDay.meals || typeof rawDay.meals !== 'object' || Array.isArray(rawDay.meals)) return null;
    const meals = {};
    _MEAL_SLOTS.forEach(slot => {
        const m = rawDay.meals[slot];
        meals[slot] = Array.isArray(m) ? m : [];
    });
    return {
        date: rawDay.date || null,
        dayNumber: parseInt(rawDay.dayNumber) || 0,
        meals,
        notes: typeof rawDay.notes === 'string' ? rawDay.notes : '',
    };
}

function _isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function validateBackupData(data) {
    const errors = [];
    const warnings = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, errors: ['Formato de archivo no válido'], warnings, days: null };
    }
    if (!data.config || typeof data.config !== 'object') {
        errors.push('Archivo no contiene configuración válida');
    }

    let days = null;
    if (data.days !== undefined) {
        if (!_isPlainObject(data.days)) {
            errors.push('Sección "days" malformada (no es un objeto)');
        } else {
            days = {};
            let dropped = 0;
            Object.keys(data.days).forEach(dateKey => {
                const clean = _sanitizeDay(data.days[dateKey]);
                if (clean) days[dateKey] = clean;
                else dropped++;
            });
            if (dropped > 0) warnings.push(`${dropped} día(s) malformados descartados`);
        }
    }

    ['customProducts', 'mealHistory', 'mealCombos', 'customExercises'].forEach(key => {
        if (data[key] !== undefined && !Array.isArray(data[key])) {
            warnings.push(`Sección "${key}" malformada (no es array): omitida`);
            data[key] = undefined;
        }
    });
    ['workoutSessions', 'workoutTemplates', 'exercisePRs'].forEach(key => {
        if (data[key] !== undefined && !_isPlainObject(data[key])) {
            warnings.push(`Sección "${key}" malformada (no es objeto): omitida`);
            data[key] = undefined;
        }
    });
    if (data.predictionCalibration !== undefined && data.predictionCalibration !== null &&
        !_isPlainObject(data.predictionCalibration)) {
        warnings.push('Sección "predictionCalibration" malformada: omitida');
        data.predictionCalibration = undefined;
    }

    return { ok: errors.length === 0, errors, warnings, days };
}

export function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Validar TODO antes de escribir nada (atómico)
            const { ok, errors, warnings, days } = validateBackupData(data);
            if (!ok) throw new Error(errors.join('; '));

            if (data.config) {
                Object.assign(AppState.config, data.config);
                if (data.config.startDate) AppState.config.startDate = new Date(data.config.startDate);
                if (!safeSet('nutrition_config', AppState.config)) throw new Error('No se pudo guardar la configuración (cuota)');
            }

            // weight_history se guarda en su propia clave (loadWeightHistory la lee por separado)
            const weightHist = (data.config && data.config.weightHistory) || data.weight_history;
            if (weightHist && weightHist.length > 0) {
                AppState.config.weightHistory = weightHist;
                if (!safeSet('weight_history', weightHist)) throw new Error('No se pudo guardar el historial de peso (cuota)');
                const { clearAdaptiveTDEECache } = await import('./nutrition.js');
                clearAdaptiveTDEECache();
            }

            if (days) {
                AppState.allDays = days;
                if (!safeSet('nutrition_days', AppState.allDays)) throw new Error('No se pudieron guardar los días (cuota)');
            }

            if (data.customProducts) {
                const { PRODUCTS_DB } = await import('./products.js');
                AppState.customProducts = data.customProducts.map(p => ({
                    ...p,
                    customUnit: p.customUnit || '',
                    customUnitWeight: p.customUnitWeight || null,
                }));
                safeSet('custom_products', AppState.customProducts);
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
                safeSet('meal_history', AppState.mealHistory);
            }

            if (data.mealCombos) {
                AppState.mealCombos = data.mealCombos;
                safeSet('meal_combos', AppState.mealCombos);
            }

            if (data.darkModeEnabled !== undefined) {
                safeSet('darkModeEnabled', data.darkModeEnabled.toString());
                if (data.darkModeEnabled) {
                    document.documentElement.classList.add('dark-mode');
                    document.body.classList.add('dark-mode');
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    document.body.classList.remove('dark-mode');
                }
            }

            // Ausente = no tocar; presente (aunque vacío) = restaurar/limpiar
            if (data.workoutSessions !== undefined) safeSet('workoutSessions', data.workoutSessions);
            if (data.workoutTemplates !== undefined) safeSet('workoutTemplates', data.workoutTemplates);
            if (data.exercisePRs !== undefined) safeSet('exercisePRs', data.exercisePRs);
            if (data.customExercises !== undefined) safeSet('custom_exercises', data.customExercises);
            if (data.predictionCalibration !== undefined && data.predictionCalibration !== null) {
                safeSet('prediction_calibration', data.predictionCalibration);
            }

            // Refrescar auto-backup para que no pise lo recién importado
            refreshAutoBackup();
            // Los días/sesiones importados cambian los inputs del TDEE adaptativo
            notifyNutritionChanged();

            const { loadConfig } = await import('./config-settings.js');
            const { renderProductsList } = await import('./ui/products-list.js');
            const { updateWeightPrediction, displayNextDayPrediction } = await import('./weight.js');
            const { initializeToday } = await import('./meals.js');
            const { initializeCharts, renderWeightPredictionChart } = await import('./charts.js');
            const { initSportTabs } = await import('./ui/workout-ui.js');

            loadConfig();
            renderProductsList();
            updateWeightPrediction();
            initializeToday();
            displayNextDayPrediction();
            initializeCharts();
            renderWeightPredictionChart();
            initSportTabs();
            showNotification(warnings.length > 0
                ? `Datos importados con avisos: ${warnings.join('; ')}`
                : 'Todos los datos importados correctamente',
                warnings.length > 0 ? 'warning' : 'success');
        } catch (err) {
            showNotification('Error al importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

export function clearAllData() {
    if (!confirm('¿Estás seguro? Esto eliminará TODOS los datos.')) return;
    const appKeys = [
        'nutrition_config', 'nutrition_days', 'weight_history',
        'custom_products', 'meal_history', 'meal_combos',
        'workoutSessions', 'workoutTemplates', 'exercisePRs',
        'custom_exercises', 'darkModeEnabled', 'prediction_calibration',
        'gfit_access_token', 'gfit_expires_at', 'gfit_client_id', 'gfit_auto_sync',
        'nutrition_auto_backup', 'nutrition_backup_last_check',
        'appInstalledVersion',
    ];
    appKeys.forEach(k => localStorage.removeItem(k));
    AppState.allDays = {};
    showNotification('Todos los datos fueron eliminados');
    location.reload();
}

// ==================== BACKUP AUTOMÁTICO ====================

const BACKUP_KEY = 'nutrition_auto_backup';
const BACKUP_CHECK_KEY = 'nutrition_backup_last_check';

function _buildBackup() {
    return {
        version: '1.0',
        backupDate: new Date().toISOString(),
        config: JSON.parse(JSON.stringify(AppState.config)),
        days: JSON.parse(JSON.stringify(AppState.allDays)),
        customProducts: JSON.parse(JSON.stringify(AppState.customProducts)),
        mealHistory: JSON.parse(JSON.stringify(AppState.mealHistory)),
        mealCombos: JSON.parse(JSON.stringify(AppState.mealCombos)),
        workoutSessions: safeGet('workoutSessions', {}),
        workoutTemplates: safeGet('workoutTemplates', {}),
        exercisePRs: safeGet('exercisePRs', {}),
        customExercises: safeGet('custom_exercises', []),
        predictionCalibration: safeGet('prediction_calibration', null),
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
    };
}

export function autoBackup() {
    try {
        const lastCheck = parseInt(localStorage.getItem(BACKUP_CHECK_KEY) || '0');
        const now = Date.now();
        if (now - lastCheck < 24 * 60 * 60 * 1000) return;

        const backup = _buildBackup();
        if (!safeSet(BACKUP_KEY, backup)) return;
        safeSet(BACKUP_CHECK_KEY, String(now));
        console.log('Backup automático guardado:', Object.keys(backup.days).length, 'días');
    } catch (e) {
        console.error('Error en backup automático:', e);
    }
}

// Regenera el snapshot inmediatamente (tras un import manual, para que el
// backup previo no pueda pisar los datos recién importados).
export function refreshAutoBackup() {
    try {
        const backup = _buildBackup();
        if (!safeSet(BACKUP_KEY, backup)) return false;
        safeSet(BACKUP_CHECK_KEY, String(Date.now()));
        return true;
    } catch (e) {
        console.error('Error al refrescar backup:', e);
        return false;
    }
}

export function restoreFromBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) {
        showNotification('No hay backup automático disponible', 'warning');
        return;
    }

    try {
        const backup = JSON.parse(raw);
        const daysCount = backup.days ? Object.keys(backup.days).length : 0;

        if (!confirm(`Backup del ${new Date(backup.backupDate).toLocaleDateString('es-ES')}\n${daysCount} días de datos.\n\n¿Restaurar este backup?`)) return;

        if (backup.config) {
            Object.assign(AppState.config, backup.config);
            if (backup.config.startDate) AppState.config.startDate = new Date(backup.config.startDate);
            safeSet('nutrition_config', AppState.config);
        }

        const weightHist = (backup.config && backup.config.weightHistory) || backup.weight_history;
        if (weightHist && weightHist.length > 0) {
            AppState.config.weightHistory = weightHist;
            safeSet('weight_history', weightHist);
        }

        if (backup.days) {
            // Sanitizar por si el backup es de formato antiguo
            const clean = {};
            Object.keys(backup.days).forEach(dateKey => {
                const day = _sanitizeDay(backup.days[dateKey]);
                if (day) clean[dateKey] = day;
            });
            AppState.allDays = clean;
            saveDays();
        }

        if (backup.customProducts) {
            AppState.customProducts = backup.customProducts;
            safeSet('custom_products', AppState.customProducts);
        }

        if (backup.mealHistory) {
            AppState.mealHistory = backup.mealHistory;
            safeSet('meal_history', AppState.mealHistory);
        }

        if (backup.mealCombos) {
            AppState.mealCombos = backup.mealCombos;
            saveMealCombos();
        }

        // Ausente = no tocar; presente (aunque vacío) = restaurar/limpiar
        if (backup.workoutSessions !== undefined) safeSet('workoutSessions', backup.workoutSessions);
        if (backup.workoutTemplates !== undefined) safeSet('workoutTemplates', backup.workoutTemplates);
        if (backup.exercisePRs !== undefined) safeSet('exercisePRs', backup.exercisePRs);
        if (backup.customExercises !== undefined) safeSet('custom_exercises', backup.customExercises);
        if (backup.predictionCalibration !== undefined && backup.predictionCalibration !== null) {
            safeSet('prediction_calibration', backup.predictionCalibration);
        }

        if (backup.darkModeEnabled !== undefined) {
            safeSet('darkModeEnabled', backup.darkModeEnabled ? 'true' : 'false');
        }

        showNotification(`Backup restaurado: ${daysCount} días recuperados`, 'success');
        location.reload();
    } catch (e) {
        showNotification('Error al restaurar backup: ' + e.message, 'error');
    }
}

export function getBackupInfo() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    try {
        const backup = JSON.parse(raw);
        return {
            date: backup.backupDate,
            days: backup.days ? Object.keys(backup.days).length : 0,
            size: raw.length,
        };
    } catch (e) {
        return null;
    }
}
