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
                if (!_parseDateKey(dateKey)) { dropped++; return; }
                const day = _sanitizeDay(parsed[dateKey], dateKey);
                if (day) { day.date = dateKey; clean[dateKey] = day; }
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
    // Los días son una entrada del TDEE adaptativo: cualquier resultado
    // cacheado antes de esta carga (p. ej. loadConfig al arrancar) es obsoleto.
    clearAdaptiveTDEECache();
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
    const header = ['Fecha', 'Día', 'Calorías', 'Proteína (g)', 'Carbos (g)', 'Grasas (g)'];
    const rows = [];
    Object.keys(AppState.allDays).sort().forEach(date => {
        const day = AppState.allDays[date];
        if (!day || !_isPlainObject(day.meals)) return;
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        Object.values(day.meals).forEach(meal => {
            if (!Array.isArray(meal)) return;
            meal.forEach(food => {
                if (!food) return;
                dayKcal += _nonNegative(food.kcal, 0);
                dayProtein += _nonNegative(food.protein, 0);
                dayCarbs += _nonNegative(food.carbs, 0);
                dayFats += _nonNegative(food.fats, 0);
            });
        });
        rows.push([
            date,
            Number.isFinite(parseInt(day.dayNumber, 10)) ? parseInt(day.dayNumber, 10) : '',
            dayKcal.toFixed(0),
            dayProtein.toFixed(1),
            dayCarbs.toFixed(1),
            dayFats.toFixed(1),
        ]);
    });

    const csv = [header, ...rows].map(row => row.map(_csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
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
        productOverrides: AppState.productOverrides || safeGet('product_overrides', {}),
        mealHistory: AppState.mealHistory,
        mealCombos: AppState.mealCombos,
        weight_history: AppState.config.weightHistory,
        workoutSessions: safeGet('workoutSessions', {}),
        workoutTemplates: safeGet('workoutTemplates', {}),
        workoutTombstones: safeGet('workoutTombstones', { sessions: {}, templates: {} }),
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

const _MAX_RANGE_DAYS = 731; // 2 años (incluye un bisiesto)

// Devuelve las claves diarias del rango (ambas inclusive). [] si es inválido
// o supera 2 años: evita congelar la pestaña con rangos absurdos.
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
    if (dates.length === 0) throw new Error('Rango de fechas no válido o superior a 2 años');

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
        const finalized = !session || session.finalized !== false;
        const workout = finalized && session && Array.isArray(session.exercises) && session.exercises.length > 0 ? {
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
    let text = String(value);
    // Inyección de fórmulas en Excel/Sheets: un nombre/nota que empiece por
    // =, +, -, @ o tabulador se ejecutaría al abrir el CSV.
    if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
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
        hint.textContent = 'Rango no válido (máximo 2 años)';
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
const _TRACKING_TYPES = ['weight_reps', 'cardio_distance', 'steps', 'time_hold', 'calisthenics'];
const _MAX_TEXT = 500;

function _isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Claves que, asignadas a un objeto normal, mutan su prototipo. Se rechazan
// en mapas importados (overrides, PRs, tombstones) para que un JSON malicioso
// no contamine Object.prototype.
function _isSafeMapKey(key) {
    return typeof key === 'string' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function _finiteNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.trim().replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function _nonNegative(v, fallback = 0) {
    const n = _finiteNumber(v);
    return n === null ? fallback : Math.max(0, n);
}

function _cleanText(v, max = _MAX_TEXT) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function _round2(v) {
    return Math.round(v * 100) / 100;
}

// ─── Saneo de comidas y días ────────────────────────────────────────────────
// Normaliza macros a número: un string ("12,5") en un import rompía
// updateDaySummary/CSV con concatenaciones y NaN.
function _sanitizeFood(raw) {
    if (!_isPlainObject(raw)) return null;
    const name = _cleanText(raw.name, 160);
    if (!name) return null;
    const food = {
        name,
        quantity: _round2(_nonNegative(raw.quantity, 0)),
        unit: _cleanText(raw.unit, 20) || 'g',
        kcal: _round2(_nonNegative(raw.kcal, 0)),
        protein: _round2(_nonNegative(raw.protein, 0)),
        carbs: _round2(_nonNegative(raw.carbs, 0)),
        fats: _round2(_nonNegative(raw.fats, 0)),
    };
    if (typeof raw.id === 'number' || typeof raw.id === 'string') food.id = raw.id;
    const time = _cleanText(raw.time, 20);
    if (time) food.time = time;
    return food;
}

function _sanitizeMealList(list, stats) {
    if (!Array.isArray(list)) return [];
    const clean = [];
    list.forEach(item => {
        const food = _sanitizeFood(item);
        if (food) clean.push(food);
        else if (stats) stats.droppedFoods++;
    });
    return clean;
}

function _sanitizeDay(rawDay, dateKey, stats) {
    if (!_isPlainObject(rawDay)) return null;
    const rawMeals = _isPlainObject(rawDay.meals) ? rawDay.meals : {};
    const meals = {};
    _MEAL_SLOTS.forEach(slot => {
        meals[slot] = _sanitizeMealList(rawMeals[slot], stats);
    });
    // Conservar slots desconocidos (si son arrays) sin perder datos de versiones futuras
    Object.keys(rawMeals).forEach(slot => {
        if (_MEAL_SLOTS.includes(slot) || !_isSafeMapKey(slot)) return;
        if (Array.isArray(rawMeals[slot])) {
            meals[slot] = _sanitizeMealList(rawMeals[slot], stats);
        }
    });
    const dayNumber = _finiteNumber(rawDay.dayNumber);
    return {
        date: typeof rawDay.date === 'string' && rawDay.date ? rawDay.date : (dateKey || null),
        dayNumber: dayNumber === null ? 0 : Math.max(0, Math.round(dayNumber)),
        meals,
        notes: typeof rawDay.notes === 'string' ? rawDay.notes.slice(0, 10000) : '',
    };
}

// Sanea un historial de pesos: solo entradas con fecha YYYY-MM-DD válida y
// peso finito en rango humano (25-350 kg). Devuelve {clean, dropped}.
// Sin esto, un import con pesos corruptos degradaba el TDEE adaptativo
// (pesos no numéricos → Δ tratado como 0; fechas malas → filtros/orden rotos).
export function _sanitizeWeightHistory(hist) {
    if (!Array.isArray(hist)) return { clean: [], dropped: 0 };
    const byDate = new Map();
    const todayKey = getDateKey(new Date());
    let dropped = 0;
    for (const e of hist) {
        const dateOk = e && typeof e.date === 'string' && _parseDateKey(e.date);
        const w = _finiteNumber(e && e.weight);
        // Fechas futuras: un pesaje no puede existir antes de ocurrir.
        if (!dateOk || e.date > todayKey || w === null || w < 25 || w > 350) {
            dropped++;
            continue;
        }
        if (byDate.has(e.date)) dropped++;
        const entry = { date: e.date, weight: _round2(w) };
        const day = _finiteNumber(e.day);
        if (day !== null) entry.day = Math.max(1, Math.round(day));
        const pred = _finiteNumber(e.predictedWeight);
        if (pred !== null && pred >= 25 && pred <= 350) entry.predictedWeight = _round2(pred);
        byDate.set(e.date, entry);
    }
    const clean = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { clean, dropped };
}

// ─── Saneo de configuración ──────────────────────────────────────────────────
// Se copian solo claves conocidas y tipos válidos: evita __proto__/constructor
// y que un "abc" en currentWeight envenene TDEE, objetivos e historial.
const _ROUTINE_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function _sanitizeRoutine(raw) {
    if (!_isPlainObject(raw)) return null;
    const routine = {};
    _ROUTINE_DAYS.forEach(day => {
        const info = raw[day];
        if (!_isPlainObject(info)) return;
        routine[day] = {
            type: info.type === 'entreno' ? 'entreno' : 'descanso',
            label: _cleanText(info.label, 80) || (info.type === 'entreno' ? 'Entreno' : 'Descanso'),
            templateId: _cleanText(info.templateId, 80),
        };
    });
    return Object.keys(routine).length > 0 ? routine : null;
}

function _sanitizeConfig(raw, warnings) {
    const out = {};
    const warn = (msg) => warnings.push(msg);

    const readNumber = (key, min, max, integer = false, nullOnInvalid = false) => {
        if (!(key in raw)) return;
        if (raw[key] === null || raw[key] === '') {
            if (nullOnInvalid) out[key] = null;
            return;
        }
        let n = _finiteNumber(raw[key]);
        if (n === null) {
            warn(`Config: "${key}" no es numérico`);
            if (nullOnInvalid) out[key] = null;
            return;
        }
        if (integer) n = Math.round(n);
        if (n < min || n > max) {
            warn(`Config: "${key}" fuera de rango (${min}-${max})`);
            if (nullOnInvalid) out[key] = null;
            return;
        }
        out[key] = n;
    };

    readNumber('startWeight', 25, 350, false, true);
    readNumber('currentWeight', 25, 350, false, true);
    readNumber('targetWeight', 25, 350, false, true);
    readNumber('phaseStartWeight', 25, 350, false, true);
    readNumber('height', 100, 250, true, true);
    readNumber('age', 14, 100, true, true);
    readNumber('proteinGoal', 20, 400, true, false);
    readNumber('proteinFactor', 1.0, 3.5, false, false);
    readNumber('calsEntrenamiento', 800, 8000, false, false);
    readNumber('calsDescanso', 800, 8000, false, false);
    readNumber('carbsMin', 0, 1000, false, false);
    readNumber('carbsMax', 0, 1000, false, false);
    readNumber('fatsMin', 0, 500, false, false);
    readNumber('fatsMax', 0, 500, false, false);
    readNumber('deficitTarget', -2000, 2000, false, false);
    readNumber('surplusTarget', 0, 2000, false, false);

    const genderMap = { male: 'male', female: 'female', hombre: 'male', mujer: 'female', m: 'male', f: 'female' };
    if ('gender' in raw) {
        const g = genderMap[String(raw.gender || '').toLowerCase()];
        if (g) out.gender = g;
        else { out.gender = null; warn('Config: género no válido'); }
    }

    const enumField = (key, allowed, fallback) => {
        if (!(key in raw)) return;
        if (allowed.includes(raw[key])) out[key] = raw[key];
        else { out[key] = fallback; warn(`Config: "${key}" no válido`); }
    };
    enumField('goalPhase', ['definicion', 'mantenimiento', 'volumen'], 'definicion');
    enumField('lossPace', ['suave', 'moderado', 'intenso', 'manual'], 'moderado');
    enumField('gainPace', ['lento', 'moderado', 'manual'], 'lento');
    enumField('tdeeMode', ['formula', 'adaptive'], 'formula');

    const readDate = (key) => {
        if (!(key in raw)) return;
        if (raw[key] === null || raw[key] === '') { out[key] = null; return; }
        const text = String(raw[key]);
        const keyMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
        if (keyMatch && _parseDateKey(keyMatch[1])) {
            out[key] = keyMatch[1];
            return;
        }
        const dt = new Date(text);
        if (!Number.isNaN(dt.getTime())) {
            out[key] = getDateKey(dt);
        } else {
            out[key] = null;
            warn(`Config: "${key}" no es una fecha válida`);
        }
    };
    readDate('startDate');
    readDate('phaseStartDate');
    readDate('bridgeStartDate');

    if ('customGymRoutine' in raw) out.customGymRoutine = _sanitizeRoutine(raw.customGymRoutine);
    if ('weightHistory' in raw) {
        const { clean, dropped } = _sanitizeWeightHistory(raw.weightHistory);
        out.weightHistory = clean;
        if (dropped > 0) warn(`Historial de peso: ${dropped} entrada(s) inválida(s) descartada(s)`);
    }
    if ('phaseHistory' in raw) {
        const allowedPhases = new Set(['definicion', 'mantenimiento', 'volumen']);
        const todayKey = getDateKey(new Date());
        let dropped = 0;
        out.phaseHistory = (Array.isArray(raw.phaseHistory) ? raw.phaseHistory : [])
            .filter(e => {
                // Una fase no puede empezar en el futuro ni tener un peso fuera
                // del rango humano: ambos casos envenenarían el histórico y los
                // cálculos de progreso.
                const ok = _isPlainObject(e)
                    && typeof e.date === 'string'
                    && _parseDateKey(e.date)
                    && e.date <= todayKey
                    && allowedPhases.has(e.phase);
                if (!ok) dropped++;
                return ok;
            })
            .map(e => {
                const w = _finiteNumber(e.startWeight);
                return {
                    date: e.date,
                    phase: e.phase,
                    startWeight: w !== null && w >= 25 && w <= 350 ? _round2(w) : null,
                    tdeeMode: e.tdeeMode === 'adaptive' ? 'adaptive' : 'formula',
                };
            })
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
            .slice(-100);
        if (dropped > 0) warn(`Historial de fases: ${dropped} entrada(s) inválida(s) descartada(s)`);
    }
    return out;
}

// Wrapper público para loadConfig: misma lista blanca de claves que la
// importación, sin __proto__ ni tipos corruptos.
export function sanitizeConfig(raw) {
    const warnings = [];
    return _sanitizeConfig(_isPlainObject(raw) ? raw : {}, warnings);
}

// ─── Saneo de productos, combos e historial de comidas ─────────────────────
export function _sanitizeProduct(raw) {
    if (!_isPlainObject(raw)) return null;
    const name = _cleanText(raw.name, 120);
    if (!name) return null;
    if (typeof raw.id !== 'number' && typeof raw.id !== 'string') return null;
    return {
        id: raw.id,
        name,
        portion: _nonNegative(raw.portion, 100) || 100,
        unit: _cleanText(raw.unit, 20) || 'g',
        category: _cleanText(raw.category, 30) || 'otros',
        kcal: _round2(_nonNegative(raw.kcal, 0)),
        protein: _round2(_nonNegative(raw.protein, 0)),
        carbs: _round2(_nonNegative(raw.carbs, 0)),
        fats: _round2(_nonNegative(raw.fats, 0)),
        customUnit: _cleanText(raw.customUnit, 30),
        customUnitWeight: (() => {
            const w = _finiteNumber(raw.customUnitWeight);
            return w !== null && w > 0 ? _round2(w) : null;
        })(),
    };
}

function _sanitizeProductPatch(raw) {
    if (!_isPlainObject(raw)) return null;
    const patch = {};
    if ('name' in raw) {
        const name = _cleanText(raw.name, 120);
        if (name) patch.name = name;
    }
    ['portion', 'kcal', 'protein', 'carbs', 'fats'].forEach(key => {
        if (key in raw) patch[key] = _round2(_nonNegative(raw[key], 0));
    });
    if ('unit' in raw) patch.unit = _cleanText(raw.unit, 20) || 'g';
    if ('category' in raw) patch.category = _cleanText(raw.category, 30) || 'otros';
    if ('customUnit' in raw) patch.customUnit = _cleanText(raw.customUnit, 30);
    if ('customUnitWeight' in raw) {
        const w = _finiteNumber(raw.customUnitWeight);
        patch.customUnitWeight = w !== null && w > 0 ? _round2(w) : null;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}

export function _sanitizeProductOverrides(raw, warnings = []) {
    if (!_isPlainObject(raw)) return null;
    const overrides = {};
    Object.keys(raw).forEach(id => {
        if (!_isSafeMapKey(id) || !/^[\w-]{1,60}$/.test(id)) return;
        const patch = _sanitizeProductPatch(raw[id]);
        if (patch) overrides[id] = patch;
        else warnings.push(`Producto integrado "${id}": override inválido descartado`);
    });
    return overrides;
}

function _sanitizeMealHistory(raw, warnings) {
    if (!Array.isArray(raw)) return null;
    const clean = [];
    raw.forEach(item => {
        const food = _sanitizeFood(item);
        if (!food) { warnings.push('Historial de comidas: entrada inválida descartada'); return; }
        const timestamp = _finiteNumber(item.timestamp);
        clean.push({ ...food, timestamp: timestamp === null ? Date.now() : Math.max(0, Math.round(timestamp)) });
    });
    return clean.slice(0, 200);
}

function _sanitizeCombos(raw, warnings) {
    if (!Array.isArray(raw)) return null;
    const clean = [];
    raw.forEach(combo => {
        if (!_isPlainObject(combo) || (typeof combo.id !== 'number' && typeof combo.id !== 'string')) return;
        const name = _cleanText(combo.name, 80);
        if (!name || !Array.isArray(combo.items)) return;
        const items = combo.items.map(_sanitizeFood).filter(Boolean);
        if (items.length === 0) { warnings.push(`Combo "${name}" sin alimentos válidos: descartado`); return; }
        const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0);
        const totalProtein = items.reduce((sum, item) => sum + item.protein, 0);
        clean.push({
            id: combo.id,
            name,
            totalKcal: Math.round(totalKcal),
            totalProtein: _round1(totalProtein),
            items,
            createdAt: _cleanText(combo.createdAt, 40),
        });
    });
    return clean;
}

// ─── Saneo de entrenos ──────────────────────────────────────────────────────
function _sanitizeExerciseSet(raw) {
    if (!_isPlainObject(raw)) return null;
    const set = { done: raw.done === true };
    ['reps', 'kg', 'steps', 'mins', 'km', 'secs'].forEach(key => {
        if (!(key in raw)) return;
        const n = _finiteNumber(raw[key]);
        if (n !== null) set[key] = _round2(Math.max(0, n));
    });
    return set;
}

function _sanitizeSessionExercise(raw) {
    if (!_isPlainObject(raw)) return null;
    const name = _cleanText(raw.name, 80);
    const exerciseId = (typeof raw.exerciseId === 'number' || typeof raw.exerciseId === 'string')
        ? raw.exerciseId : null;
    if (!name && exerciseId === null) return null;

    const ex = {
        exerciseId,
        name,
        muscle: _cleanText(raw.muscle, 30) || 'Otros',
        sets: Array.isArray(raw.sets) ? raw.sets.map(_sanitizeExerciseSet).filter(Boolean).slice(0, 50) : [],
    };
    if (_TRACKING_TYPES.includes(raw.trackingType)) ex.trackingType = raw.trackingType;
    if (typeof raw.type === 'string') ex.type = _cleanText(raw.type, 30);
    if (typeof raw.category === 'string') ex.category = _cleanText(raw.category, 30);
    const met = _finiteNumber(raw.met);
    if (met !== null) ex.met = Math.max(0, met);
    if (Array.isArray(raw.secondary)) {
        ex.secondary = raw.secondary.filter(m => typeof m === 'string').map(m => _cleanText(m, 30)).filter(Boolean);
    }
    return ex;
}

function _sanitizeSession(raw, dateKey, warnings) {
    if (!_isPlainObject(raw)) return null;
    const exercises = Array.isArray(raw.exercises)
        ? raw.exercises.map(_sanitizeSessionExercise).filter(Boolean)
        : [];
    if (exercises.length === 0) {
        if (raw.exercises !== undefined) warnings.push(`Sesión ${dateKey}: sin ejercicios válidos, descartada`);
        return null;
    }
    const session = {
        date: dateKey,
        exercises,
        duration: Math.min(1440, _nonNegative(raw.duration, 0)),
        restTimeMin: Math.min(60, _nonNegative(raw.restTimeMin, 3)),
        notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
        finalized: raw.finalized !== false,
    };
    const kcal = _finiteNumber(raw.estimatedKcal);
    if (kcal !== null) session.estimatedKcal = Math.min(20000, Math.max(0, Math.round(kcal)));
    if (typeof raw.name === 'string' && raw.name.trim()) session.name = _cleanText(raw.name, 80);
    if (typeof raw.templateName === 'string' && raw.templateName.trim()) session.templateName = _cleanText(raw.templateName, 80);
    if (raw.onlySteps === true) session.onlySteps = true;
    if (typeof raw.source === 'string') session.source = _cleanText(raw.source, 30);
    return session;
}

function _sanitizeTemplate(raw, id) {
    if (!_isPlainObject(raw)) return null;
    const name = _cleanText(raw.name, 80);
    if (!name) return null;
    const exercises = Array.isArray(raw.exercises)
        ? raw.exercises.map(_sanitizeSessionExercise).filter(Boolean)
        : [];
    if (exercises.length === 0) return null;
    return {
        id,
        name,
        createdAt: _cleanText(raw.createdAt, 40),
        exercises,
    };
}

function _sanitizeTombstones(raw) {
    const out = { sessions: {}, templates: {} };
    if (!_isPlainObject(raw)) return out;
    const readMap = (value, target, dateKeysOnly) => {
        if (!_isPlainObject(value)) return;
        Object.keys(value).forEach(key => {
            if (!_isSafeMapKey(key)) return;
            if (dateKeysOnly && !_parseDateKey(key)) return;
            if (!dateKeysOnly && !/^[\w-]{1,80}$/.test(key)) return;
            const n = _finiteNumber(value[key]);
            const ts = n !== null ? n : (typeof value[key] === 'string' ? Date.parse(value[key]) : NaN);
            if (Number.isFinite(ts)) target[key] = ts;
        });
    };
    readMap(raw.sessions, out.sessions, true);
    readMap(raw.templates, out.templates, false);
    return out;
}

function _sanitizeExercisePRs(raw) {
    if (!_isPlainObject(raw)) return null;
    const out = {};
    Object.keys(raw).forEach(key => {
        if (!_isSafeMapKey(key)) return;
        const value = raw[key];
        if (!_isPlainObject(value)) return;
        // Formato real: { maxWeight, reps, date }. Se acepta también { kg } de
        // backups intermedios y se normaliza siempre a maxWeight.
        const weight = _finiteNumber(value.maxWeight !== undefined ? value.maxWeight : value.kg);
        const reps = _finiteNumber(value.reps);
        if (weight === null || reps === null) return;
        const entry = { maxWeight: _round2(Math.max(0, weight)), reps: Math.max(0, Math.round(reps)) };
        if (typeof value.date === 'string' && _parseDateKey(value.date)) entry.date = value.date;
        const id = _cleanText(key, 80);
        if (id) out[id] = entry;
    });
    return out;
}

function _sanitizeCustomExercises(raw, warnings) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    raw.forEach(item => {
        if (!_isPlainObject(item)) return;
        const name = _cleanText(item.name, 80);
        if (!name || (typeof item.id !== 'string' && typeof item.id !== 'number')) {
            warnings.push('Ejercicio personalizado inválido descartado');
            return;
        }
        const ex = {
            id: item.id,
            name,
            muscle: _cleanText(item.muscle, 30) || 'Otros',
            type: _cleanText(item.type, 30) || 'libre',
            category: _cleanText(item.category, 30) || 'aislamiento',
            met: Math.max(0, _finiteNumber(item.met) ?? 4.5),
            isCustom: true,
        };
        out.push(ex);
    });
    return out;
}

export function validateBackupData(data) {
    const errors = [];
    const warnings = [];
    const cleaned = {};

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, errors: ['Formato de archivo no válido'], warnings, days: null, cleaned: null };
    }
    if (data.importable === false) {
        errors.push('El archivo es una exportación de solo lectura (no reimportable)');
    }
    if (!_isPlainObject(data.config)) {
        errors.push('Archivo no contiene configuración válida');
    } else {
        cleaned.config = _sanitizeConfig(data.config, warnings);
    }

    // Días
    if (data.days !== undefined) {
        if (!_isPlainObject(data.days)) {
            errors.push('Sección "days" malformada (no es un objeto)');
        } else {
            const days = {};
            const stats = { droppedFoods: 0 };
            let dropped = 0;
            Object.keys(data.days).forEach(dateKey => {
                if (!_parseDateKey(dateKey)) { dropped++; return; }
                const day = _sanitizeDay(data.days[dateKey], dateKey, stats);
                if (!day) { dropped++; return; }
                day.date = dateKey;
                days[dateKey] = day;
            });
            cleaned.days = days;
            if (dropped > 0) warnings.push(`${dropped} día(s) malformados descartados`);
            if (stats.droppedFoods > 0) warnings.push(`${stats.droppedFoods} alimento(s) inválidos descartados`);
        }
    }

    // Historial de peso: preferencia a config.weightHistory (formato actual),
    // con weight_history como fallback de backups antiguos.
    let weightHist;
    if (cleaned.config && cleaned.config.weightHistory !== undefined) {
        weightHist = cleaned.config.weightHistory;
    } else if (data.weight_history !== undefined) {
        const { clean, dropped } = _sanitizeWeightHistory(data.weight_history);
        if (dropped > 0) warnings.push(`Historial de peso: ${dropped} entrada(s) inválidas descartadas`);
        weightHist = clean;
    }
    if (weightHist !== undefined) {
        cleaned.weightHistory = weightHist;
        if (cleaned.config) cleaned.config.weightHistory = weightHist;
    }

    // Colecciones
    if (data.customProducts !== undefined) {
        if (!Array.isArray(data.customProducts)) warnings.push('Sección "customProducts" malformada (no es array): omitida');
        else {
            cleaned.customProducts = data.customProducts.map(_sanitizeProduct).filter(Boolean);
            const dropped = data.customProducts.length - cleaned.customProducts.length;
            if (dropped > 0) warnings.push(`${dropped} producto(s) personalizado(s) inválidos descartados`);
        }
    }
    if (data.productOverrides !== undefined) {
        if (!_isPlainObject(data.productOverrides)) warnings.push('Sección "productOverrides" malformada: omitida');
        else cleaned.productOverrides = _sanitizeProductOverrides(data.productOverrides, warnings);
    }
    if (data.mealHistory !== undefined) {
        if (!Array.isArray(data.mealHistory)) warnings.push('Sección "mealHistory" malformada: omitida');
        else cleaned.mealHistory = _sanitizeMealHistory(data.mealHistory, warnings);
    }
    if (data.mealCombos !== undefined) {
        if (!Array.isArray(data.mealCombos)) warnings.push('Sección "mealCombos" malformada: omitida');
        else cleaned.mealCombos = _sanitizeCombos(data.mealCombos, warnings);
    }
    if (data.workoutSessions !== undefined) {
        if (!_isPlainObject(data.workoutSessions)) warnings.push('Sección "workoutSessions" malformada: omitida');
        else {
            const sessions = {};
            let dropped = 0;
            Object.keys(data.workoutSessions).forEach(dateKey => {
                if (!_parseDateKey(dateKey)) { dropped++; return; }
                const session = _sanitizeSession(data.workoutSessions[dateKey], dateKey, warnings);
                if (session) sessions[dateKey] = session;
                else dropped++;
            });
            cleaned.workoutSessions = sessions;
            if (dropped > 0) warnings.push(`${dropped} sesión(es) inválidas descartadas`);
        }
    }
    if (data.workoutTemplates !== undefined) {
        if (!_isPlainObject(data.workoutTemplates)) warnings.push('Sección "workoutTemplates" malformada: omitida');
        else {
            const templates = {};
            Object.keys(data.workoutTemplates).forEach(id => {
                const template = _sanitizeTemplate(data.workoutTemplates[id], id);
                if (template) templates[id] = template;
                else warnings.push(`Plantilla "${id}" inválida descartada`);
            });
            cleaned.workoutTemplates = templates;
        }
    }
    if (data.workoutTombstones !== undefined) {
        if (!_isPlainObject(data.workoutTombstones)) warnings.push('Sección "workoutTombstones" malformada: omitida');
        else cleaned.workoutTombstones = _sanitizeTombstones(data.workoutTombstones);
    }
    if (data.exercisePRs !== undefined) {
        if (!_isPlainObject(data.exercisePRs)) warnings.push('Sección "exercisePRs" malformada: omitida');
        else cleaned.exercisePRs = _sanitizeExercisePRs(data.exercisePRs);
    }
    if (data.customExercises !== undefined) {
        if (!Array.isArray(data.customExercises)) warnings.push('Sección "customExercises" malformada: omitida');
        else cleaned.customExercises = _sanitizeCustomExercises(data.customExercises, warnings);
    }
    if (data.predictionCalibration !== undefined) {
        if (data.predictionCalibration === null) cleaned.predictionCalibration = null;
        else if (!_isPlainObject(data.predictionCalibration)) {
            warnings.push('Sección "predictionCalibration" malformada: omitida');
        } else {
            cleaned.predictionCalibration = JSON.parse(JSON.stringify(data.predictionCalibration));
        }
    }
    if (typeof data.darkModeEnabled === 'boolean') cleaned.darkModeEnabled = data.darkModeEnabled;

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        days: cleaned.days !== undefined ? cleaned.days : null,
        cleaned,
    };
}

function _isQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22 || e.code === 1014);
}

function _cloneForRollback(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function _snapshotAppState() {
    const config = { ...AppState.config };
    config.startDate = AppState.config.startDate ? new Date(AppState.config.startDate.getTime()) : null;
    config.weightHistory = Array.isArray(AppState.config.weightHistory)
        ? AppState.config.weightHistory.map(e => ({ ...e }))
        : [];
    config.customGymRoutine = AppState.config.customGymRoutine
        ? _cloneForRollback(AppState.config.customGymRoutine)
        : null;
    return {
        config,
        allDays: _cloneForRollback(AppState.allDays) || {},
        customProducts: _cloneForRollback(AppState.customProducts) || [],
        productOverrides: _cloneForRollback(AppState.productOverrides) || {},
        mealHistory: _cloneForRollback(AppState.mealHistory) || [],
        mealCombos: _cloneForRollback(AppState.mealCombos) || [],
    };
}

function _restoreAppState(snapshot) {
    Object.assign(AppState.config, snapshot.config);
    AppState.allDays = snapshot.allDays;
    AppState.customProducts = snapshot.customProducts;
    AppState.productOverrides = snapshot.productOverrides;
    AppState.mealHistory = snapshot.mealHistory;
    AppState.mealCombos = snapshot.mealCombos;
}

async function _commitImportedData(cleaned) {
    // Construir TODAS las escrituras antes de ejecutar ninguna.
    const entries = [];
    const add = (key, value) => entries.push({ key, value });
    add('nutrition_config', cleaned.config);
    if (cleaned.weightHistory !== undefined) add('weight_history', cleaned.weightHistory);
    if (cleaned.days !== undefined) add('nutrition_days', cleaned.days);
    if (cleaned.customProducts !== undefined) add('custom_products', cleaned.customProducts);
    if (cleaned.productOverrides !== undefined) add('product_overrides', cleaned.productOverrides);
    if (cleaned.mealHistory !== undefined) add('meal_history', cleaned.mealHistory);
    if (cleaned.mealCombos !== undefined) add('meal_combos', cleaned.mealCombos);
    if (cleaned.workoutSessions !== undefined) add('workoutSessions', cleaned.workoutSessions);
    if (cleaned.workoutTemplates !== undefined) add('workoutTemplates', cleaned.workoutTemplates);
    if (cleaned.workoutTombstones !== undefined) add('workoutTombstones', cleaned.workoutTombstones);
    if (cleaned.exercisePRs !== undefined) add('exercisePRs', cleaned.exercisePRs);
    if (cleaned.customExercises !== undefined) add('custom_exercises', cleaned.customExercises);
    if (cleaned.predictionCalibration !== undefined) add('prediction_calibration', cleaned.predictionCalibration);
    if (cleaned.darkModeEnabled !== undefined) add('darkModeEnabled', cleaned.darkModeEnabled ? 'true' : 'false');

    // Serializar antes de escribir: un dato no serializable no debe dejar la
    // importación a medias.
    entries.forEach(entry => {
        entry.serialized = entry.value === null
            ? null
            : (typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value));
    });

    const appSnapshot = _snapshotAppState();
    const previousRaw = new Map();
    entries.forEach(({ key }) => {
        if (!previousRaw.has(key)) previousRaw.set(key, localStorage.getItem(key));
    });

    const rollbackStorage = () => {
        for (let i = entries.length - 1; i >= 0; i--) {
            const { key } = entries[i];
            const old = previousRaw.get(key);
            try {
                if (old === null) localStorage.removeItem(key);
                else localStorage.setItem(key, old);
            } catch (_) { /* mejor esfuerzo */ }
        }
    };

    try {
        entries.forEach(({ key, serialized }) => {
            if (serialized === null) localStorage.removeItem(key);
            else localStorage.setItem(key, serialized);
        });
    } catch (writeErr) {
        rollbackStorage();
        throw new Error(_isQuotaError(writeErr)
            ? 'Almacenamiento lleno: no se guardó nada. Exporta y borra días antiguos, o libera espacio'
            : 'No se pudo escribir en el almacenamiento: no se guardó nada');
    }

    // Aplicar a memoria solo cuando las escrituras han ido bien.
    try {
        const config = { ...cleaned.config };
        if (config.startDate) config.startDate = new Date(`${config.startDate}T00:00:00`);
        Object.assign(AppState.config, config);
        if (cleaned.weightHistory !== undefined) AppState.config.weightHistory = cleaned.weightHistory;
        if (cleaned.days !== undefined) AppState.allDays = cleaned.days;
        if (cleaned.customProducts !== undefined) AppState.customProducts = cleaned.customProducts;
        if (cleaned.productOverrides !== undefined) AppState.productOverrides = cleaned.productOverrides;
        if (cleaned.mealHistory !== undefined) AppState.mealHistory = cleaned.mealHistory;
        if (cleaned.mealCombos !== undefined) AppState.mealCombos = cleaned.mealCombos;

        if (cleaned.customProducts !== undefined || cleaned.productOverrides !== undefined) {
            const productsModule = await import('./products.js');
            if (typeof productsModule.syncProductsWithOverrides === 'function') {
                productsModule.syncProductsWithOverrides();
            }
        }

        if (cleaned.darkModeEnabled !== undefined) {
            if (cleaned.darkModeEnabled) {
                document.documentElement.classList.add('dark-mode');
                document.body.classList.add('dark-mode');
            } else {
                document.documentElement.classList.remove('dark-mode');
                document.body.classList.remove('dark-mode');
            }
        }
    } catch (applyErr) {
        rollbackStorage();
        _restoreAppState(appSnapshot);
        throw new Error('No se pudo aplicar la importación: ' + applyErr.message);
    }

    notifyNutritionChanged();
}

// Importación TRANSACCIONAL: serializa y valida todas las secciones antes de
// tocar localStorage; si una escritura falla (cuota), restaura las claves
// previas y el estado en memoria. Antes se escribía por secciones y un fallo
// a mitad dejaba la base mezclada (config nueva + días viejos).
export function importData(event) {
    const inputEl = event && event.target;
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let parsed;
            try {
                parsed = JSON.parse(e.target.result);
            } catch (jsonErr) {
                throw new Error('El archivo no es un JSON válido');
            }

            const { ok, errors, warnings, cleaned } = validateBackupData(parsed);
            if (!ok || !cleaned) throw new Error(errors.join('; '));

            await _commitImportedData(cleaned);

            // Refrescar auto-backup para que no pise lo recién importado
            try { await refreshAutoBackup(); } catch (_) { /* no bloquea el import */ }

            // Refrescar UI: un fallo aquí no invalida la importación ya escrita.
            try {
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
            } catch (uiErr) {
                console.warn('[Import] Datos guardados, fallo al refrescar UI:', uiErr);
                showNotification('Datos importados. Recarga la página para ver todos los cambios', 'warning');
            }

            showNotification(warnings.length > 0
                ? `Datos importados con avisos: ${warnings.join('; ')}`
                : 'Todos los datos importados correctamente',
                warnings.length > 0 ? 'warning' : 'success');
        } catch (err) {
            showNotification('Error al importar: ' + err.message, 'error');
        } finally {
            if (inputEl) {
                try { inputEl.value = ''; } catch (_) { /* input no reseteable */ }
            }
        }
    };
    reader.onerror = () => showNotification('No se pudo leer el archivo', 'error');
    reader.readAsText(file);
}

export function clearAllData() {
    if (!confirm('¿Estás seguro? Esto eliminará TODOS los datos.')) return;
    const appKeys = [
        'nutrition_config', 'nutrition_days', 'weight_history',
        'custom_products', 'product_overrides', 'meal_history', 'meal_combos',
        'workoutSessions', 'workoutTemplates', 'workoutTombstones', 'exercisePRs',
        'custom_exercises', 'darkModeEnabled', 'prediction_calibration',
        'gfit_access_token', 'gfit_expires_at', 'gfit_client_id', 'gfit_auto_sync',
        'nutrition_ai_key', 'nutrition_ai_settings', 'nutrition_ai_chat',
        BACKUP_KEY, BACKUP_CHECK_KEY, 'appInstalledVersion',
    ];
    appKeys.forEach(k => localStorage.removeItem(k));
    // Cuarentenas de JSON corrupto
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.includes(':corrupt:')) localStorage.removeItem(key);
    }
    AppState.allDays = {};
    showNotification('Todos los datos fueron eliminados');
    location.reload();
}

// ==================== BACKUP AUTOMÁTICO ====================
// Formato compacto: la config no duplica weightHistory y el JSON se comprime
// con gzip cuando el navegador soporta CompressionStream. Así el snapshot
// diario no consume el doble de la cuota de localStorage.

const BACKUP_KEY = 'nutrition_auto_backup';
const BACKUP_CHECK_KEY = 'nutrition_backup_last_check';
const BACKUP_FORMAT = 'apex-auto-backup';
const BACKUP_ENCODING = 'gzip-base64';
const _MAX_BACKUP_CHARS = 2500000;

function _buildBackup() {
    const config = JSON.parse(JSON.stringify(AppState.config));
    const weightHistory = Array.isArray(config.weightHistory) ? config.weightHistory : [];
    delete config.weightHistory; // se guarda una sola vez, en weight_history
    return {
        format: 'apex-nutrition-database',
        version: '2.0',
        importable: true,
        backupDate: new Date().toISOString(),
        config,
        weight_history: weightHistory,
        days: JSON.parse(JSON.stringify(AppState.allDays)),
        customProducts: JSON.parse(JSON.stringify(AppState.customProducts)),
        productOverrides: _cloneForRollback(AppState.productOverrides || safeGet('product_overrides', {})) || {},
        mealHistory: JSON.parse(JSON.stringify(AppState.mealHistory)),
        mealCombos: JSON.parse(JSON.stringify(AppState.mealCombos)),
        workoutSessions: safeGet('workoutSessions', {}),
        workoutTemplates: safeGet('workoutTemplates', {}),
        workoutTombstones: safeGet('workoutTombstones', { sessions: {}, templates: {} }),
        exercisePRs: safeGet('exercisePRs', {}),
        customExercises: safeGet('custom_exercises', []),
        predictionCalibration: safeGet('prediction_calibration', null),
        darkModeEnabled: localStorage.getItem('darkModeEnabled') === 'true',
    };
}

function _bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function _base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function _encodeBackup(backup) {
    const json = JSON.stringify(backup);
    const canCompress = typeof CompressionStream === 'function'
        && typeof Blob === 'function' && typeof Response === 'function'
        && typeof btoa === 'function';
    if (canCompress) {
        try {
            const stream = new Blob([json], { type: 'application/json' })
                .stream().pipeThrough(new CompressionStream('gzip'));
            const buffer = await new Response(stream).arrayBuffer();
            return JSON.stringify({
                format: BACKUP_FORMAT,
                version: '2.0',
                encoding: BACKUP_ENCODING,
                backupDate: backup.backupDate,
                days: Object.keys(backup.days || {}).length,
                payload: _bytesToBase64(new Uint8Array(buffer)),
            });
        } catch (e) {
            console.warn('[Backup] Compresión no disponible, usando JSON:', e.message);
        }
    }
    return JSON.stringify({
        format: BACKUP_FORMAT,
        version: '2.0',
        encoding: 'json',
        backupDate: backup.backupDate,
        days: Object.keys(backup.days || {}).length,
        payload: backup,
    });
}

async function _decodeBackup(raw) {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.format === BACKUP_FORMAT) {
        if (parsed.encoding === 'json') return parsed.payload;
        if (parsed.encoding === BACKUP_ENCODING) {
            if (typeof DecompressionStream !== 'function' || typeof atob !== 'function') {
                throw new Error('Este navegador no puede descomprimir el backup automático');
            }
            const stream = new Blob([_base64ToBytes(parsed.payload)])
                .stream().pipeThrough(new DecompressionStream('gzip'));
            const text = await new Response(stream).text();
            return JSON.parse(text);
        }
        throw new Error('Formato de backup automático no reconocido');
    }
    return parsed; // backups antiguos sin sobre
}

async function _writeBackupSnapshot() {
    const backup = _buildBackup();
    const encoded = await _encodeBackup(backup);
    if (encoded.length > _MAX_BACKUP_CHARS) {
        showNotification('Backup automático omitido: la base es demasiado grande. Exporta y borra días antiguos', 'warning');
        return false;
    }
    if (!safeSet(BACKUP_KEY, encoded)) return false;
    safeSet(BACKUP_CHECK_KEY, String(Date.now()));
    return true;
}

export async function autoBackup() {
    try {
        const lastCheck = parseInt(localStorage.getItem(BACKUP_CHECK_KEY) || '0', 10) || 0;
        const now = Date.now();
        if (lastCheck > 0 && now >= lastCheck && now - lastCheck < 24 * 60 * 60 * 1000) return false;

        const ok = await _writeBackupSnapshot();
        if (ok) console.log('Backup automático guardado:', Object.keys(AppState.allDays || {}).length, 'días');
        return ok;
    } catch (e) {
        console.error('Error en backup automático:', e);
        return false;
    }
}

// Regenera el snapshot inmediatamente (tras un import manual, para que el
// backup previo no pueda pisar los datos recién importados).
export async function refreshAutoBackup() {
    try {
        return await _writeBackupSnapshot();
    } catch (e) {
        console.error('Error al refrescar backup:', e);
        return false;
    }
}

export async function restoreFromBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) {
        showNotification('No hay backup automático disponible', 'warning');
        return;
    }

    try {
        const backup = await _decodeBackup(raw);
        const { ok, errors, warnings, cleaned } = validateBackupData(backup);
        if (!ok || !cleaned) throw new Error(errors.join('; ') || 'Backup no válido');

        const daysCount = backup.days ? Object.keys(backup.days).length : 0;
        const date = backup.backupDate ? new Date(backup.backupDate) : null;
        const dateText = date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString('es-ES')
            : 'fecha desconocida';

        if (!confirm(`Backup del ${dateText}\n${daysCount} días de datos.\n\n¿Restaurar este backup?`)) return;

        await _commitImportedData(cleaned);
        try { await refreshAutoBackup(); } catch (_) { /* no bloquea */ }

        showNotification(warnings.length > 0
            ? `Backup restaurado con avisos: ${warnings.join('; ')}`
            : `Backup restaurado: ${daysCount} días recuperados`,
            warnings.length > 0 ? 'warning' : 'success');
        location.reload();
    } catch (e) {
        showNotification('Error al restaurar backup: ' + e.message, 'error');
    }
}

export function getBackupInfo() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.format === BACKUP_FORMAT) {
            return {
                date: parsed.backupDate,
                days: parseInt(parsed.days, 10) || 0,
                size: raw.length,
                compressed: parsed.encoding === BACKUP_ENCODING,
            };
        }
        return {
            date: parsed.backupDate,
            days: parsed.days ? Object.keys(parsed.days).length : 0,
            size: raw.length,
            compressed: false,
        };
    } catch (e) {
        return null;
    }
}
