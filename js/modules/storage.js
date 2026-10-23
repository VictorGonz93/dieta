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
                ..._collectDatabase(),
                dailySummary,
                statistics,
                weightPrediction: prediction ? {
                    weeklyLoss: typeof prediction.weeklyLoss === 'string' ? parseFloat(prediction.weeklyLoss) : parseFloat(prediction.weeklyLoss?.toFixed(2)),
                    estimatedDays: prediction.estimatedDays,
                    estimatedDate: prediction.estimatedDate,
                    confidence: prediction.confidence,
                } : null,
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

// ─── Exportaciones: base de datos cruda y días seleccionados ─────────────────
// Se separan los constructores puros (testeables) de la descarga DOM.

function _downloadFile(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function _hasMeals(day) {
    if (!day || !day.meals || typeof day.meals !== 'object') return false;
    return Object.values(day.meals).some(meal => Array.isArray(meal) && meal.length > 0);
}

function _sumConsumed(day) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
    if (!day || !day.meals || typeof day.meals !== 'object') return totals;
    Object.values(day.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => {
            ['kcal', 'protein', 'carbs', 'fats'].forEach(key => {
                const v = parseFloat(food && food[key]);
                if (Number.isFinite(v)) totals[key] += v;
            });
        });
    });
    return {
        kcal: Math.round(totals.kcal),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fats: Math.round(totals.fats * 10) / 10,
    };
}

// Reúne SOLO la base de datos (nada derivado: ni estadísticas, ni predicciones)
function _collectDatabase() {
    return {
        config: AppState.config,
        days: AppState.allDays,
        customProducts: AppState.customProducts,
        mealHistory: AppState.mealHistory,
        mealCombos: AppState.mealCombos,
        weight_history: AppState.config.weightHistory,
        workoutSessions: safeGet('workoutSessions', {}),
        workoutTemplates: safeGet('workoutTemplates', {}),
        exercisePRs: safeGet('exercisePRs', {}),
        customExercises: safeGet('custom_exercises', []),
        predictionCalibration: safeGet('prediction_calibration', null),
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
    };
}

export function buildDatabaseExport() {
    const db = _collectDatabase();
    const days = _isPlainObject(db.days) ? db.days : {};
    const sessions = _isPlainObject(db.workoutSessions) ? db.workoutSessions : {};
    return {
        format: 'apex-nutrition-database',
        version: '2.0',
        exportDate: new Date().toISOString(),
        importable: true,
        note: 'Base de datos completa de Apex Nutrition. No incluye estadísticas ni predicciones derivadas. Se puede restaurar con Subir JSON.',
        counts: {
            days: Object.keys(days).length,
            daysWithMeals: Object.values(days).filter(_hasMeals).length,
            weightEntries: Array.isArray(db.weight_history) ? db.weight_history.length : 0,
            customProducts: Array.isArray(db.customProducts) ? db.customProducts.length : 0,
            workoutSessions: Object.keys(sessions).length,
            customExercises: Array.isArray(db.customExercises) ? db.customExercises.length : 0,
        },
        ...db,
    };
}

export function exportDatabaseJSON() {
    try {
        const data = buildDatabaseExport();
        _downloadFile(
            JSON.stringify(data, null, 2),
            'application/json',
            `apex_base_datos_${getDateKey(new Date())}.json`
        );
        showNotification(
            `Base de datos exportada: ${data.counts.days} días, ${data.counts.weightEntries} pesajes`,
            'success'
        );
    } catch (err) {
        console.error('[Export DB] Error:', err);
        showNotification('Error al exportar la base de datos: ' + err.message, 'error');
    }
}

export function buildProductsExport() {
    const products = Array.isArray(AppState.customProducts) ? AppState.customProducts : [];
    return {
        format: 'apex-nutrition-products',
        version: '1.0',
        exportDate: new Date().toISOString(),
        importable: false,
        note: 'Productos personalizados de Apex Nutrition (no incluye los alimentos precargados).',
        count: products.length,
        products,
    };
}

export function exportProductsJSON() {
    try {
        const data = buildProductsExport();
        if (data.count === 0) {
            showNotification('No tienes productos personalizados que exportar', 'info');
            return;
        }
        _downloadFile(
            JSON.stringify(data, null, 2),
            'application/json',
            `apex_productos_${getDateKey(new Date())}.json`
        );
        showNotification(`${data.count} producto(s) personalizado(s) exportados`, 'success');
    } catch (err) {
        console.error('[Export products] Error:', err);
        showNotification('Error al exportar productos: ' + err.message, 'error');
    }
}

function _parseDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
}

const _MAX_RANGE_DAYS = 1826; // 5 años (incluye un bisiesto)

// Devuelve las claves diarias del rango (ambas inclusive). [] si es inválido
// o supera 5 años: evita congelar la pestaña con rangos absurdos.
export function _dateKeysBetween(fromKey, toKey) {
    const from = _parseDateKey(fromKey);
    const to = _parseDateKey(toKey);
    if (!from || !to || from.getTime() > to.getTime()) return [];
    const dates = [];
    for (let d = new Date(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
        if (dates.length >= _MAX_RANGE_DAYS) return [];
        dates.push(getDateKey(d));
    }
    return dates;
}

const _WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function _round1(v) {
    return Math.round(v * 10) / 10;
}

function _pct(value, target) {
    return Number.isFinite(target) && target > 0 ? _round1((value / target) * 100) : null;
}

// Exportación de días concretos CON las macros objetivo de cada fecha.
// Los objetivos usan getDynamicDayTargets (TDEE congelado por día), igual que
// la UI. No es un backup: no incluye config ni se puede importar.
export async function buildRangeExport(fromKey, toKey, options = {}) {
    const includeMeals = options.includeMeals !== false;
    const onlyLogged = options.onlyLogged === true;
    const dates = _dateKeysBetween(fromKey, toKey);
    if (dates.length === 0) throw new Error('Rango de fechas no válido o superior a 5 años');

    const { getDynamicDayTargets, getDayType } = await import('./nutrition.js');
    const sessions = safeGet('workoutSessions', {});
    const history = Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory : [];
    const weightByDate = new Map();
    history.forEach(entry => {
        const w = parseFloat(entry && entry.weight);
        if (entry && typeof entry.date === 'string' && Number.isFinite(w)) {
            weightByDate.set(entry.date, w);
        }
    });

    const days = [];
    dates.forEach(dateKey => {
        const day = AppState.allDays[dateKey];
        const hasData = _hasMeals(day);
        if (onlyLogged && !hasData) return;

        const consumed = _sumConsumed(day);
        const targets = getDynamicDayTargets(dateKey);
        const target = targets ? {
            kcal: targets.cals,
            protein: targets.protein,
            carbs: targets.carbs,
            fats: targets.fats,
            tdee: targets.tdee,
            deficit: targets.actualDeficit,
        } : null;
        const difference = target ? {
            kcal: Math.round(consumed.kcal - target.kcal),
            protein: _round1(consumed.protein - target.protein),
            carbs: _round1(consumed.carbs - target.carbs),
            fats: _round1(consumed.fats - target.fats),
        } : null;
        const compliancePct = target ? {
            kcal: _pct(consumed.kcal, target.kcal),
            protein: _pct(consumed.protein, target.protein),
            carbs: _pct(consumed.carbs, target.carbs),
            fats: _pct(consumed.fats, target.fats),
        } : null;

        const dayDate = _parseDateKey(dateKey);
        let dayType = null;
        try {
            const info = getDayType(dayDate);
            if (info) dayType = { type: info.type || null, label: info.label || null };
        } catch (_) { /* rutina no configurada */ }

        const session = sessions && sessions[dateKey];
        const workout = session && Array.isArray(session.exercises) && session.exercises.length > 0 ? {
            name: session.name || session.templateName || 'Entreno',
            kcal: Math.round(parseFloat(session.estimatedKcal) || 0),
            exercises: session.exercises.length,
            durationMin: parseInt(session.duration, 10) || 0,
        } : null;

        const entry = {
            date: dateKey,
            dayNumber: day && Number.isFinite(parseInt(day.dayNumber, 10)) ? parseInt(day.dayNumber, 10) : null,
            weekday: _WEEKDAYS[dayDate.getDay()],
            dayType,
            hasData,
            weight: weightByDate.has(dateKey) ? weightByDate.get(dateKey) : null,
            consumed,
            target,
            difference,
            compliancePct,
            withinKcal10: !!(target && hasData && Math.abs(consumed.kcal - target.kcal) <= target.kcal * 0.10),
            proteinAtLeast90: !!(target && hasData && consumed.protein >= target.protein * 0.9),
            workout,
            notes: day && typeof day.notes === 'string' ? day.notes : '',
        };
        if (includeMeals) entry.meals = day ? day.meals : null;
        days.push(entry);
    });

    if (onlyLogged && days.length === 0) {
        throw new Error('No hay días con registros en el rango seleccionado');
    }

    const logged = days.filter(d => d.hasData);
    const withTarget = logged.filter(d => d.target);
    const avg = (arr, pick) => arr.length > 0
        ? _round1(arr.reduce((sum, d) => sum + pick(d), 0) / arr.length)
        : 0;
    const weights = days.filter(d => Number.isFinite(d.weight));

    return {
        format: 'apex-nutrition-range',
        version: '1.0',
        exportDate: new Date().toISOString(),
        importable: false,
        note: 'Exportación de días seleccionados. No es un backup: no se puede restaurar.',
        phase: AppState.config.goalPhase || 'definicion',
        targetsNote: 'Objetivos calculados día a día con el TDEE congelado de cada fecha. La fase y la rutina actuales se aplican a todo el rango (la app no guarda historial de fases ni de rutina). Un déficit negativo es superávit.',
        adherenceNote: 'Cumplimiento: kcal dentro de ±10% del objetivo; proteína ≥90% del objetivo.',
        range: { from: fromKey, to: toKey, daysRequested: dates.length, daysExported: days.length, days: days.length },
        summary: {
            rangeDays: days.length,
            daysWithData: logged.length,
            emptyDays: days.length - logged.length,
            avgConsumed: {
                kcal: Math.round(avg(logged, d => d.consumed.kcal)),
                protein: avg(logged, d => d.consumed.protein),
                carbs: avg(logged, d => d.consumed.carbs),
                fats: avg(logged, d => d.consumed.fats),
            },
            avgTarget: {
                kcal: Math.round(avg(withTarget, d => d.target.kcal)),
                protein: avg(withTarget, d => d.target.protein),
                carbs: avg(withTarget, d => d.target.carbs),
                fats: avg(withTarget, d => d.target.fats),
            },
            weightChangeKg: weights.length >= 2
                ? _round1(weights[weights.length - 1].weight - weights[0].weight)
                : null,
            adherence: {
                kcalWithin10Pct: withTarget.filter(d => d.withinKcal10).length,
                proteinAtLeast90Pct: withTarget.filter(d => d.proteinAtLeast90).length,
                daysEvaluated: withTarget.length,
            },
        },
        days,
    };
}

function _csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildRangeCSV(data) {
    const header = [
        'Fecha', 'Día', 'Día semana', 'Tipo', 'Peso (kg)', 'Registrado',
        'Calorías', 'Objetivo kcal', 'TDEE', 'Déficit/Superávit', 'Dif kcal', '% kcal',
        'Proteína (g)', 'Objetivo proteína (g)', 'Dif proteína', '% proteína',
        'Carbos (g)', 'Objetivo carbos (g)', 'Dif carbos', '% carbos',
        'Grasas (g)', 'Objetivo grasas (g)', 'Dif grasas', '% grasas',
        'Entreno', 'Notas',
    ];
    const rows = data.days.map(d => {
        const consumed = d.consumed || {};
        const target = d.target || {};
        const diff = d.difference || {};
        const pct = d.compliancePct || {};
        return [
            d.date, d.dayNumber ?? '', d.weekday, d.dayType?.label || '',
            d.weight ?? '', d.hasData ? 'Sí' : 'No',
            consumed.kcal ?? '', target.kcal ?? '', target.tdee ?? '', target.deficit ?? '',
            diff.kcal ?? '', pct.kcal ?? '',
            consumed.protein ?? '', target.protein ?? '', diff.protein ?? '', pct.protein ?? '',
            consumed.carbs ?? '', target.carbs ?? '', diff.carbs ?? '', pct.carbs ?? '',
            consumed.fats ?? '', target.fats ?? '', diff.fats ?? '', pct.fats ?? '',
            d.workout ? `${d.workout.name} (${d.workout.kcal} kcal)` : '',
            d.notes || '',
        ];
    });
    const csv = [header, ...rows].map(row => row.map(_csvCell).join(',')).join('\r\n');
    return '\uFEFF' + csv; // BOM: Excel y LibreOffice muestran bien los acentos
}

function _rangeFromInputs() {
    const fromEl = document.getElementById('exportRangeFrom');
    const toEl = document.getElementById('exportRangeTo');
    let from = fromEl && typeof fromEl.value === 'string' ? fromEl.value.trim() : '';
    let to = toEl && typeof toEl.value === 'string' ? toEl.value.trim() : '';
    if (!from && !to) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return { from: getDateKey(start), to: getDateKey(end) };
    }
    if (!from) from = to;
    if (!to) to = from;
    return { from, to };
}

export async function exportRangeJSON() {
    const { from, to } = _rangeFromInputs();
    const onlyLogged = document.getElementById('exportOnlyLogged')?.checked === true;
    const includeMeals = document.getElementById('exportIncludeMeals')?.checked !== false;
    try {
        const data = await buildRangeExport(from, to, { includeMeals, onlyLogged });
        _downloadFile(
            JSON.stringify(data, null, 2),
            'application/json',
            `apex_dias_${from}_${to}.json`
        );
        showNotification(`Exportados ${data.days.length} día(s) con objetivos y cumplimiento`, 'success');
    } catch (err) {
        console.error('[Export range JSON] Error:', err);
        showNotification('Error al exportar días: ' + err.message, 'error');
    }
}

export async function exportRangeCSV() {
    const { from, to } = _rangeFromInputs();
    const onlyLogged = document.getElementById('exportOnlyLogged')?.checked === true;
    try {
        const data = await buildRangeExport(from, to, { includeMeals: false, onlyLogged });
        _downloadFile(
            buildRangeCSV(data),
            'text/csv;charset=utf-8',
            `apex_dias_${from}_${to}.csv`
        );
        showNotification(`CSV exportado: ${data.days.length} día(s)`, 'success');
    } catch (err) {
        console.error('[Export range CSV] Error:', err);
        showNotification('Error al exportar días: ' + err.message, 'error');
    }
}

function _updateExportRangeHint() {
    const hint = document.getElementById('exportRangeHint');
    if (!hint) return;
    const { from, to } = _rangeFromInputs();
    const dates = _dateKeysBetween(from, to);
    if (dates.length === 0) {
        hint.textContent = 'Rango no válido (máximo 5 años)';
        return;
    }
    const logged = dates.filter(key => _hasMeals(AppState.allDays[key])).length;
    hint.textContent = `${dates.length} día(s) seleccionados · ${logged} con registros`;
}

export function setExportRangePreset(preset) {
    const fromEl = document.getElementById('exportRangeFrom');
    const toEl = document.getElementById('exportRangeTo');
    if (!fromEl || !toEl) return;

    const today = new Date();
    let from = new Date(today);
    let to = new Date(today);
    if (preset === 'all') {
        const keys = [
            ...Object.keys(AppState.allDays || {}),
            ...(Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory.map(e => e && e.date) : []),
        ];
        const parsed = keys.map(key => _parseDateKey(key)).filter(Boolean).sort((a, b) => a - b);
        if (parsed.length > 0) {
            from = parsed[0];
            to = parsed[parsed.length - 1];
        } else {
            from.setDate(from.getDate() - 6);
        }
    } else if (preset === 'month') {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
    } else {
        const n = Math.max(1, parseInt(preset, 10) || 7);
        from.setDate(from.getDate() - (n - 1));
    }
    fromEl.value = getDateKey(from);
    toEl.value = getDateKey(to);
    _updateExportRangeHint();
}

export function initExportRangeUI() {
    const fromEl = document.getElementById('exportRangeFrom');
    const toEl = document.getElementById('exportRangeTo');
    if (!fromEl || !toEl) return;
    if (!fromEl.value && !toEl.value) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        fromEl.value = getDateKey(start);
        toEl.value = getDateKey(end);
    } else if (!fromEl.value) {
        fromEl.value = toEl.value;
    } else if (!toEl.value) {
        toEl.value = fromEl.value;
    }
    if (typeof fromEl.addEventListener === 'function') fromEl.addEventListener('change', _updateExportRangeHint);
    if (typeof toEl.addEventListener === 'function') toEl.addEventListener('change', _updateExportRangeHint);
    _updateExportRangeHint();
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

// Sanea un historial de pesos: solo entradas con fecha YYYY-MM-DD válida y
// peso finito en rango humano (25-350 kg). Devuelve {clean, dropped}.
// Sin esto, un import con pesos corruptos degradaba el TDEE adaptativo
// (pesos no numéricos → Δ tratado como 0; fechas malas → filtros/orden rotos).
export function _sanitizeWeightHistory(hist) {
    if (!Array.isArray(hist)) return { clean: [], dropped: 0 };
    const clean = [];
    let dropped = 0;
    for (const e of hist) {
        const dateOk = e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
        const w = parseFloat(e && e.weight);
        if (dateOk && Number.isFinite(w) && w >= 25 && w <= 350) {
            clean.push({ ...e, weight: w });
        } else {
            dropped++;
        }
    }
    clean.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { clean, dropped };
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
    // Historiales de peso: sanean + ordenan (no bloquean el restore, avisan)
    for (const key of ['weight_history']) {
        if (data[key] !== undefined) {
            const { clean, dropped } = _sanitizeWeightHistory(data[key]);
            if (dropped > 0) warnings.push(`Historial "${key}": ${dropped} entrada(s) inválidas descartadas`);
            data[key] = clean;
        }
    }
    if (data.config && data.config.weightHistory !== undefined) {
        const { clean, dropped } = _sanitizeWeightHistory(data.config.weightHistory);
        if (dropped > 0) warnings.push(`Historial "config.weightHistory": ${dropped} entrada(s) inválidas descartadas`);
        data.config.weightHistory = clean;
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
            const { clean, dropped } = _sanitizeWeightHistory(weightHist);
            if (dropped > 0) console.warn(`[Restore] ${dropped} peso(s) inválidos descartados`);
            AppState.config.weightHistory = clean;
            safeSet('weight_history', clean);
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
