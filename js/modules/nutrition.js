// ==================== NUTRICIÓN Y CÁLCULOS ====================

import AppState from './state.js';
import { GYM_ROUTINE, UNIT_CONVERSIONS, KCAL_PER_KG_FAT, LEAN_GAIN_KCAL_PER_KG } from './constants.js';
import { estimateWorkoutKcal, calculateWorkoutDuration, getWorkoutSessions, getWorkoutTemplates } from './workout.js';
import { getDateKey } from './storage.js';

export function getDayNumber(date) {
    if (!AppState.config.startDate) return 0;
    const start = new Date(AppState.config.startDate);
    // Diferencia por componentes UTC del día local: evita que un cambio de
    // horario (23/25 h) devuelva un día de más o de menos.
    const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const dateUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((dateUTC - startUTC) / 86400000) + 1;
}

export function getDayType(date) {
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = daysOfWeek[date.getDay()];
    const routine = AppState.config.customGymRoutine || GYM_ROUTINE;
    return routine[dayName] || { type: 'descanso', label: 'Descanso', templateId: '' };
}

// Progreso de la FASE actual, compartido por la cabecera y "Tus Objetivos".
// Si existe phaseStartWeight/phaseStartDate se usa ese punto de partida; si no,
// startWeight/startDate. Así la cabecera y la tarjeta nunca muestran % distintos.
export function getPhaseProgress() {
    const phase = AppState.config.goalPhase || 'definicion';
    const currentWeight = parseFloat(AppState.config.currentWeight);
    const targetWeight = parseFloat(AppState.config.targetWeight);
    const phaseStart = parseFloat(AppState.config.phaseStartWeight);
    const startWeight = Number.isFinite(phaseStart) && phaseStart >= 25 && phaseStart <= 350
        ? phaseStart
        : parseFloat(AppState.config.startWeight);

    const isBulk = phase === 'volumen'
        || (Number.isFinite(targetWeight) && Number.isFinite(currentWeight)
            && Number.isFinite(startWeight) && targetWeight > currentWeight && targetWeight > startWeight);
    const totalMove = isBulk ? targetWeight - startWeight : startWeight - targetWeight;
    const moved = isBulk ? currentWeight - startWeight : startWeight - currentWeight;
    let progressPercent = 0;
    if (Number.isFinite(totalMove) && totalMove > 0 && Number.isFinite(moved)) {
        progressPercent = Math.min(100, Math.max(0, Math.round((moved / totalMove) * 100)));
    }

    return {
        phase,
        isBulk,
        startWeight: Number.isFinite(startWeight) ? startWeight : null,
        startDateKey: AppState.config.phaseStartDate || (AppState.config.startDate ? getDateKey(new Date(AppState.config.startDate)) : null),
        currentWeight: Number.isFinite(currentWeight) ? currentWeight : null,
        targetWeight: Number.isFinite(targetWeight) ? targetWeight : null,
        moved: Number.isFinite(moved) ? moved : 0,
        remaining: Number.isFinite(currentWeight) && Number.isFinite(targetWeight)
            ? (isBulk ? targetWeight - currentWeight : currentWeight - targetWeight)
            : 0,
        progressPercent,
    };
}

export function getCalorieTarget() {
    const dateKey = AppState.currentDate ? getDateKey(AppState.currentDate) : '';
    const dynamic = getDynamicDayTargets(dateKey);
    if (dynamic) return dynamic.cals;
    return AppState.config.calsDescanso ?? 1800;
}

export function getTDEE() {
    const dateKey = AppState.currentDate ? getDateKey(AppState.currentDate) : '';
    const dynamic = getDynamicDayTargets(dateKey);
    if (dynamic) return dynamic.tdee;
    return calculateTDEE('descanso');
}

export function getCurrentDeficit() {
    return getTDEE() - getCalorieTarget();
}

export function calculateTMR() {
    const { currentWeight, height, age, gender } = AppState.config;
    const w = parseFloat(currentWeight) || 75;
    const h = parseFloat(height) || 170;
    const a = parseFloat(age) || 30;
    const g = gender || 'male';

    if (g === 'male') {
        return (10 * w) + (6.25 * h) - (5 * a) + 5;
    } else {
        return (10 * w) + (6.25 * h) - (5 * a) - 161;
    }
}

export function calculateTDEE(dayType) {
    const tmr = calculateTMR();
    const factor = dayType === 'entreno' ? 1.50 : 1.25;
    return Math.round(tmr * factor);
}

// ─── TDEE Adaptativo con caché por día ────────────────────────────────────────
// Cada día "congela" su TDEE basado SOLO en datos disponibles hasta esa fecha.
// Esto evita que entrar un peso hoy cambie los objetivos de ayer.

const _adaptiveTDEECache = new Map();

export function clearAdaptiveTDEECache() {
    _adaptiveTDEECache.clear();
}

// ─── Calidad y transiciones del TDEE adaptativo ──────────────────────────────
// Un registro incompleto no es "un dato que falta": es un sesgo sistemático.
// La estimación adaptativa solo puede usarse para objetivos si la cobertura del
// periodo es suficiente y no estamos en la ventana de rebote de un cambio de
// fase (agua/glucógeno). Estas constantes son conservadoras y se pueden
// recalibrar con datos reales.
const ADAPTIVE_MIN_WEIGH_INS = 14;
const ADAPTIVE_WINDOW_WEIGH_INS = 28;
const ADAPTIVE_HIGH_WEIGH_INS = 21;
const ADAPTIVE_MAX_SPAN_DAYS = 45;
const ADAPTIVE_MIN_COVERAGE = 0.60;
const ADAPTIVE_MEDIUM_COVERAGE = 0.70;
const ADAPTIVE_HIGH_COVERAGE = 0.80;
const TRANSITION_HOLD_DAYS = 14;
// Días iniciales de una fase que se excluyen de la tendencia: el rebote de
// agua/glucógeno del cambio de fase no es tejido y falsea el TDEE.
const PHASE_WARMUP_DAYS = 5;

function _dateKeyOffset(dateKey, deltaDays) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setDate(dt.getDate() + deltaDays);
    return getDateKey(dt);
}

function _daysBetweenDateKeys(a, b) {
    const [ay, am, ad] = String(a).split('-').map(Number);
    const [by, bm, bd] = String(b).split('-').map(Number);
    if (![ay, am, ad, by, bm, bd].every(Number.isFinite)) return null;
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Devuelve datos si dateKey cae en los 14 días posteriores a un cambio de fase.
// phaseStartDate se actualiza al guardar la fase; no hace falta un historial
// completo para proteger la transición actual.
function _phaseTransitionHold(dateKey) {
    const start = AppState.config.phaseStartDate;
    if (!start || typeof start !== 'string') return null;
    const elapsed = _daysBetweenDateKeys(start, dateKey);
    if (elapsed === null || elapsed < 0 || elapsed >= TRANSITION_HOLD_DAYS) return null;
    return { start, elapsed, daysLeft: TRANSITION_HOLD_DAYS - elapsed };
}

function _getWorkoutKcalForDate(dateKey, sessions) {
    try {
        const session = sessions[dateKey];
        if (session && session.finalized !== false && Array.isArray(session.exercises) && session.exercises.length > 0) {
            // parseFloat: un estimatedKcal corrupto (string) no debe envenenar sumas
            const n = parseFloat(session.estimatedKcal);
            return Number.isFinite(n) ? Math.min(20000, Math.max(0, n)) : 0;
        }
    } catch {}
    return 0;
}

function _sumDayKcal(dateKey) {
    const dayData = AppState.allDays[dateKey];
    if (!dayData || !dayData.meals || typeof dayData.meals !== 'object') return 0;
    let total = 0;
    Object.values(dayData.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => {
            const k = parseFloat(food && food.kcal);
            if (Number.isFinite(k)) total += k;
        });
    });
    // Winsorización anti-atracones: un solo día no puede aportar más de 2× el
    // mantenimiento fórmula. Sin cap, un día de 6000 kcal con 10 días válidos
    // desviaba el promedio ~+420 kcal. El día sigue contando como registrado.
    const cap = _getFormulaTMR(AppState.config.currentWeight) * 1.25 * 2;
    return Math.min(total, cap);
}

function _getFormulaTMR(weightKg) {
    const { height, age, gender } = AppState.config;
    const w = parseFloat(weightKg) || 75;
    const h = parseFloat(height) || 170;
    const a = parseFloat(age) || 30;
    const g = gender || 'male';
    return g === 'male'
        ? (10 * w) + (6.25 * h) - (5 * a) + 5
        : (10 * w) + (6.25 * h) - (5 * a) - 161;
}

/** Mediana robusta; null si no hay valores. */
function _median(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Día absoluto desde una clave YYYY-MM-DD (UTC, sin horas ni DST). */
function _dateToDayNumber(dateKey) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Fecha local a medianoche para iterar días con getDateKey (sin saltos UTC). */
function _dateFromKey(dateKey) {
    return new Date(String(dateKey) + 'T00:00:00');
}

/** Ajuste de Theil-Sen: mediana de pendientes por pares (robusto a outliers). */
function _theilSenFit(points) {
    if (!points || points.length < 2) return null;
    const slopes = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[j].x - points[i].x;
            if (dx >= 2) slopes.push((points[j].y - points[i].y) / dx);
        }
    }
    // Pocos pesajes o todos muy juntos: aceptar también pares de 1 día.
    if (slopes.length < 3) {
        slopes.length = 0;
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const dx = points[j].x - points[i].x;
                if (dx >= 1) slopes.push((points[j].y - points[i].y) / dx);
            }
        }
    }
    if (slopes.length === 0) return null;
    const slope = _median(slopes);
    const intercept = _median(points.map(p => p.y - slope * p.x));
    return { slope, intercept };
}

/**
 * Tendencia de peso robusta (kg/día). Theil-Sen + segunda pasada que descarta
 * pesajes con residuo > 3 MAD. Un pico aislado de 2 kg ya no mueve el TDEE
 * cientos de kcal, y una meseta real sigue detectándose.
 */
function _robustWeightTrend(entries) {
    const points = (entries || [])
        .map(e => ({
            // Acepta tanto entradas {date, weight} como puntos ya normalizados
            // {x, y}: el estimador se reutiliza en predicción y gráficos.
            x: Number.isFinite(e?.x) ? e.x : _dateToDayNumber(e?.date),
            y: parseFloat(e?.weight ?? e?.y),
        }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y >= 25 && p.y <= 350)
        .sort((a, b) => a.x - b.x);
    if (points.length < 3) return null;

    let fit = _theilSenFit(points);
    if (!fit) return null;
    let pointsUsed = points.length;

    const residuals = points.map(p => p.y - (fit.intercept + fit.slope * p.x));
    const medianResidual = _median(residuals);
    const mad = _median(residuals.map(r => Math.abs(r - medianResidual)));
    if (mad > 0.05) {
        const kept = points.filter((p, i) =>
            Math.abs(residuals[i] - medianResidual) <= 3 * mad
        );
        if (kept.length >= Math.max(5, Math.ceil(points.length * 0.6))) {
            const refit = _theilSenFit(kept);
            if (refit) {
                fit = refit;
                pointsUsed = kept.length;
            }
        }
    }

    return {
        slope: fit.slope, // kg/día; positivo = ganancia
        intercept: fit.intercept,
        pointsUsed,
        pointsTotal: points.length,
    };
}

/**
 * Tendencia robusta reutilizable por la predicción de peso y el ETA.
 * Devuelve kg/día, la recta ajustada y el peso suavizado en el último pesaje.
 * Con solo 2 pesajes cae a la pendiente simple para no perder la estimación.
 */
export function calculateRobustWeightTrend(entries) {
    const points = (entries || [])
        .map(e => ({
            date: e?.date,
            x: _dateToDayNumber(e?.date),
            y: parseFloat(e?.weight),
        }))
        .filter(p => typeof p.date === 'string'
            && Number.isFinite(p.x)
            && Number.isFinite(p.y)
            && p.y >= 25 && p.y <= 350)
        .sort((a, b) => a.x - b.x);
    if (points.length < 2) return null;

    let trend = _robustWeightTrend(points);
    if (!trend) {
        const first = points[0];
        const last = points[points.length - 1];
        const dx = last.x - first.x;
        if (dx < 1) return null;
        const slope = (last.y - first.y) / dx;
        trend = {
            slope,
            intercept: first.y - slope * first.x,
            pointsUsed: 2,
            pointsTotal: 2,
        };
    }

    const first = points[0];
    const last = points[points.length - 1];
    return {
        slope: trend.slope,
        intercept: trend.intercept,
        pointsUsed: trend.pointsUsed,
        pointsTotal: trend.pointsTotal,
        firstDate: first.date,
        lastDate: last.date,
        spanDays: last.x - first.x,
        lastActualWeight: last.y,
        fittedLastWeight: trend.intercept + trend.slope * last.x,
    };
}

// Estima TDEE sobre un subconjunto de pesajes: promedio de ingesta de TODOS los
// días del rango − tendencia de peso × KCAL_PER_KG_FAT. La tendencia es robusta,
// no la diferencia entre el primer y el último pesaje.
function _tdeeFromEntries(entries, minValidDays) {
    if (!entries || entries.length < 2) return null;
    const trend = _robustWeightTrend(entries);
    if (!trend) return null;

    const first = _dateFromKey(entries[0].date);
    const last = _dateFromKey(entries[entries.length - 1].date);
    const span = Math.max(1, (_dateToDayNumber(entries[entries.length - 1].date)
        - _dateToDayNumber(entries[0].date)));
    if (span < 3) return null;

    let cals = 0, days = 0;
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        const k = _sumDayKcal(getDateKey(d));
        if (k > 500) { cals += k; days++; }
    }
    if (days < minValidDays) return null;

    return {
        tdee: cals / days - trend.slope * KCAL_PER_KG_FAT,
        validDays: days,
        slope: trend.slope,
        pointsUsed: trend.pointsUsed,
    };
}

/**
 * Calcula el TDEE adaptativo para una fecha específica.
 * Solo usa datos de peso Y comida de FECHAS ANTERIORES a dateKey.
 * Resultados cacheados — llamar clearAdaptiveTDEECache() al modificar peso.
 *
 * @param {string} dateKey - Fecha objetivo (YYYY-MM-DD)
 * @returns {{ tdee, confidence, source, daysUsed, formulaTDEE, avgWorkoutPerDay, ... }}
 */
export function calculateAdaptiveTDEEForDate(dateKey) {
    return _calculateAdaptiveTDEEForDate(dateKey, true);
}

function _calculateAdaptiveTDEEForDate(dateKey, allowTransitionHold) {
    if (_adaptiveTDEECache.has(dateKey)) {
        return _adaptiveTDEECache.get(dateKey);
    }

    const weightHistory = AppState.config.weightHistory || [];

    // Solo usar entradas de peso ANTERIORES a dateKey (excluir el día objetivo).
    // Orden defensivo: un import desordenado rompía ventana/span (daysBetween≈1
    // distorsionaba el Δ ×7700). El orden canónico también se guarda al importar.
    const historicalWeights = weightHistory
        .filter(w => w && typeof w.date === 'string' && w.date < dateKey)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // BUG FIX 1: formulaTDEE usa el peso más reciente del histórico, no el actual
    const lastHistoricalWeight = historicalWeights.length > 0
        ? historicalWeights[historicalWeights.length - 1].weight
        : AppState.config.currentWeight;
    const formulaTDEE = Math.round(_getFormulaTMR(lastHistoricalWeight) * 1.25);

    // Protección de transición: durante los 14 días posteriores a un cambio de
    // fase se conserva la estimación previa. El rebote de agua/glucógeno no debe
    // convertir un mantenimiento o un volumen en un déficit involuntario.
    if (allowTransitionHold) {
        const hold = _phaseTransitionHold(dateKey);
        if (hold) {
            const preKey = _dateKeyOffset(hold.start, -1);
            const pre = preKey ? _calculateAdaptiveTDEEForDate(preKey, false) : null;
            // Solo congelar una base fiable. Si la estimación previa era baja o
            // tenía poca cobertura, el hold la convertiría en un objetivo
            // "protegido" pero igualmente malo.
            const preUsable = pre
                && pre.source === 'adaptive'
                && pre.confidence !== 'low'
                && Number.isFinite(pre.coverage)
                && pre.coverage >= ADAPTIVE_MEDIUM_COVERAGE;
            if (preUsable) {
                const result = {
                    ...pre,
                    tdee: pre.tdee,
                    transitionHold: true,
                    holdStartDate: hold.start,
                    holdDaysLeft: hold.daysLeft,
                    fallbackReason: null,
                };
                _adaptiveTDEECache.set(dateKey, result);
                return result;
            }
            // Sin base fiable: mejor fórmula durante el hold que una estimación
            // contaminada por el rebote de agua del cambio de fase.
            const result = {
                tdee: formulaTDEE, confidence: 'low', source: 'formula',
                daysUsed: pre?.daysUsed ?? 0, formulaTDEE, avgWorkoutPerDay: 0,
                coverage: pre?.coverage ?? null, weighIns: pre?.weighIns ?? 0,
                spanDays: pre?.spanDays ?? 0,
                fallbackReason: 'transition_unreliable',
                transitionHold: true, holdStartDate: hold.start, holdDaysLeft: hold.daysLeft,
            };
            _adaptiveTDEECache.set(dateKey, result);
            return result;
        }
    }

    // Si hay un cambio de fase, la ventana adaptativa empieza en la fase actual.
    // Mezclar el déficit previo con el rebote de agua del cambio contamina la
    // tendencia durante semanas; el TDEE se estima mejor con datos homogéneos.
    const phaseStart = AppState.config.phaseStartDate;
    const phaseFiltered = typeof phaseStart === 'string' && phaseStart <= dateKey;
    const phaseWindowStart = phaseFiltered
        ? (_dateKeyOffset(phaseStart, PHASE_WARMUP_DAYS) || phaseStart)
        : null;
    const adaptiveWeights = phaseFiltered
        ? historicalWeights.filter(w => w.date >= phaseWindowStart)
        : historicalWeights;

    if (adaptiveWeights.length < ADAPTIVE_MIN_WEIGH_INS) {
        const result = {
            tdee: formulaTDEE, confidence: 'none', source: 'formula',
            daysUsed: adaptiveWeights.length, formulaTDEE, avgWorkoutPerDay: 0,
            coverage: null, weighIns: adaptiveWeights.length, spanDays: 0,
            fallbackReason: phaseFiltered && historicalWeights.length >= ADAPTIVE_MIN_WEIGH_INS
                ? 'insufficient_phase_weigh_ins'
                : 'insufficient_weigh_ins',
        };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    const sessions = getWorkoutSessions();

    const windowSize = Math.min(ADAPTIVE_WINDOW_WEIGH_INS, adaptiveWeights.length);
    const window = adaptiveWeights.slice(-windowSize);

    const firstDate = _dateFromKey(window[0].date);
    const lastDate = _dateFromKey(window[window.length - 1].date);
    const daysBetween = Math.max(1, _dateToDayNumber(window[window.length - 1].date)
        - _dateToDayNumber(window[0].date));

    // Ventana demasiado dispersa: el Δ de peso no representa el periodo
    if (daysBetween > ADAPTIVE_MAX_SPAN_DAYS) {
        const result = {
            tdee: formulaTDEE, confidence: 'low', source: 'formula',
            daysUsed: adaptiveWeights.length, formulaTDEE, avgWorkoutPerDay: 0,
            coverage: null, weighIns: windowSize, spanDays: Math.round(daysBetween),
            fallbackReason: 'window_too_sparse',
        };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    // Ingesta sobre TODOS los días del rango (no solo fechas con pesaje):
    // alinea el promedio diario con el Δ de peso del mismo periodo.
    let totalCalories = 0;
    let validDays = 0;
    let validWorkoutKcal = 0;

    for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const key = getDateKey(d);
        const dayKcal = _sumDayKcal(key);
        if (dayKcal > 500) {
            totalCalories += dayKcal;
            validDays++;
            // Solo contar workout de días válidos (con comida registrada)
            validWorkoutKcal += _getWorkoutKcalForDate(key, sessions);
        }
    }

    const avgWorkoutPerDay = validDays > 0 ? validWorkoutKcal / validDays : 0;
    // El bucle incluye el día inicial y el final: el span de calendario es
    // daysBetween + 1. La cobertura debe medirse sobre ese periodo completo.
    const spanDays = Math.max(1, Math.round(daysBetween) + 1);
    const coverage = validDays / spanDays;

    // Fallback si hay pocos días válidos o si el registro cubre menos del 60 %
    // del periodo. Promediar solo los días registrados y dividir por validDays
    // sesga el TDEE a la baja cuando faltan días (el peso sí refleja esos días).
    if (validDays < 10 || coverage < ADAPTIVE_MIN_COVERAGE) {
        const reason = validDays < 10 ? 'insufficient_valid_days' : 'low_coverage';
        const result = {
            tdee: formulaTDEE, confidence: 'low', source: 'formula',
            daysUsed: validDays, formulaTDEE, avgWorkoutPerDay: 0,
            coverage, weighIns: windowSize, spanDays, fallbackReason: reason,
        };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    // Tendencia robusta en lugar de "primer pesaje vs último": un pico aislado
    // de agua no puede cambiar el TDEE cientos de kcal.
    const trend = _robustWeightTrend(window);
    if (!trend) {
        const result = {
            tdee: formulaTDEE, confidence: 'low', source: 'formula',
            daysUsed: validDays, formulaTDEE, avgWorkoutPerDay: 0,
            coverage, weighIns: windowSize, spanDays,
            fallbackReason: 'unstable_trend',
        };
        _adaptiveTDEECache.set(dateKey, result);
        return result;
    }

    const avgDailyCalories = totalCalories / validDays;
    // Balance energético: ingesta − tendencia × 7700. Tendencia positiva
    // (ganancia) reduce el gasto estimado; negativa (pérdida) lo aumenta.
    const adaptiveTDEE = avgDailyCalories - trend.slope * KCAL_PER_KG_FAT;

    // La ventana completa (hasta 28 pesajes) es la base estable. Los últimos
    // 14 pesajes aportan un 25 % para reaccionar antes a cambios de actividad,
    // sin volver a introducir el ruido de una ventana corta como base.
    const recent14 = window.slice(-14);
    const r14 = _tdeeFromEntries(recent14, 10);

    // La confianza no es solo "cuántos pesajes hay": exige cobertura del
    // periodo y un span mínimo. Un 18/44 días (41 %) no puede ser "high".
    let confidence;
    if (windowSize >= ADAPTIVE_HIGH_WEIGH_INS
        && validDays >= 18
        && coverage >= ADAPTIVE_HIGH_COVERAGE
        && daysBetween >= 14) {
        confidence = 'high';
    } else if (windowSize >= ADAPTIVE_MIN_WEIGH_INS
        && validDays >= 12
        && coverage >= ADAPTIVE_MEDIUM_COVERAGE) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    // Evidencia fuerte: confianza alta + cobertura casi completa + ventana
    // larga + tendencia sin outliers. Solo entonces se amplía el CAP a ±500 y
    // se usa la señal completa. Un usuario muy activo (TDEE real 500 kcal por
    // encima de Mifflin) no debe quedarse atrapado en un déficit involuntario
    // por el CAP + el encogimiento. Los casos medios siguen en ±400 y 0,65.
    const cleanTrend = trend.pointsUsed >= Math.ceil(trend.pointsTotal * 0.8);
    const strongEvidence = confidence === 'high'
        && windowSize >= ADAPTIVE_HIGH_WEIGH_INS
        && coverage >= 0.85
        && daysBetween >= 21
        && cleanTrend;
    // CAP escalado por confianza: menos días válidos → margen más estrecho.
    const CAP = strongEvidence ? 500 : validDays < 12 ? 250 : 400;
    const clampFn = (v) => Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, v));
    const cappedTDEE = clampFn(adaptiveTDEE);

    // Encogimiento hacia Mifflin según la calidad: con evidencia fuerte se usa
    // la estimación completa (ya capada); con confianza alta normal, el 85 %;
    // media, el 65 %; baja, el 45 %. Evita que una ventana ruidosa fije un
    // objetivo extremo aunque pase el mínimo de cobertura.
    const baseTDEE = r14 ? cappedTDEE * 0.75 + r14.tdee * 0.25 : cappedTDEE;
    const shrinkFactor = strongEvidence ? 1.0
        : confidence === 'high' ? 0.85
        : confidence === 'medium' ? 0.65 : 0.45;
    const smoothedTDEE = clampFn(formulaTDEE + (baseTDEE - formulaTDEE) * shrinkFactor);

    const result = {
        tdee: Math.round(smoothedTDEE),
        confidence,
        source: 'adaptive',
        daysUsed: validDays,
        formulaTDEE,
        rawAdaptive: Math.round(adaptiveTDEE),
        smoothedAdaptive: Math.round(smoothedTDEE),
        avgWorkoutPerDay,
        coverage,
        weighIns: windowSize,
        spanDays,
        slopeKgPerWeek: trend.slope * 7,
        pointsUsed: trend.pointsUsed,
        pointsTotal: trend.pointsTotal,
        shrinkFactor,
        cap: CAP,
        strongEvidence,
        recentAdaptive: r14 ? Math.round(r14.tdee) : null,
        baseAdaptive: Math.round(baseTDEE),
        fallbackReason: null,
        transitionHold: false,
    };
    _adaptiveTDEECache.set(dateKey, result);
    return result;
}

/**
 * Wrapper para la tarjeta informativa de Ajustes.
 * Usa la misma fecha que los objetivos de hoy: NO incluye la ingesta parcial de
 * hoy (eso podía mostrar un TDEE distinto al que fija el objetivo del día).
 */
export function calculateAdaptiveTDEE() {
    return calculateAdaptiveTDEEForDate(getDateKey(new Date()));
}

/** Etiqueta humana para la confianza de la estimación adaptativa. */
export function getAdaptiveConfidenceLabel(confidence) {
    return ({ high: 'alta', medium: 'media', low: 'baja', none: 'sin datos' })[confidence] || 'sin datos';
}

/** Motivo legible del fallback a fórmula (para Ajustes y Objetivos). */
export function getAdaptiveFallbackLabel(reason) {
    return ({
        insufficient_weigh_ins: 'faltan pesajes (mínimo 14)',
        insufficient_phase_weigh_ins: 'faltan pesajes en esta fase (mínimo 14)',
        window_too_sparse: 'los pesajes abarcan demasiados días',
        insufficient_valid_days: 'faltan días de comida registrados',
        low_coverage: 'cobertura de comida insuficiente',
        low_confidence: 'confianza baja',
        unstable_trend: 'tendencia de peso inestable',
        transition_unreliable: 'sin base fiable antes del cambio de fase',
        formula: 'modo fórmula',
    })[reason] || 'datos insuficientes';
}

/**
 * Calcula el déficit calórico diario óptimo automáticamente según el peso corporal
 * y el ritmo de pérdida elegido (suave, moderado, intenso o manual).
 */
export function calculateAutoDeficit(weight = null, lossPace = null) {
    const w = parseFloat(weight || AppState.config.currentWeight) || 75;
    const pace = lossPace || AppState.config.lossPace || 'moderado';

    // Techo de seguridad: el déficit no puede dejar las kcal bajo el piso
    // (1500H/1200M, AHA/ACC) ni superar el 30% del TDEE fórmula estimado.
    // Sin esto, 'intenso' o 'manual' podían prometer ritmos físicamente
    // imposibles (el campo deficitTarget mentía respecto al déficit real).
    const gender = AppState.config.gender || 'male';
    const calorieFloor = gender === 'female' ? 1200 : 1500;
    const tdeeEst = _getFormulaTMR(w) * 1.25;
    const maxDeficit = Math.max(0, Math.min(tdeeEst - calorieFloor, tdeeEst * 0.30));
    const clampDeficit = (d) => Math.round(Math.min(Math.max(0, d), maxDeficit));

    if (pace === 'suave') {
        // ~0.5% del peso corporal por semana
        return clampDeficit((w * 0.005 * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'moderado') {
        // ~0.75% del peso corporal por semana (Recomendado)
        return clampDeficit((w * 0.0075 * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'intenso') {
        // ~1.0% del peso corporal por semana
        return clampDeficit((w * 0.010 * KCAL_PER_KG_FAT) / 7);
    } else if (pace === 'manual') {
        return clampDeficit(AppState.config.deficitTarget || 500);
    }

    return clampDeficit((w * 0.0075 * KCAL_PER_KG_FAT) / 7);
}

/**
 * Calcula el superávit calórico diario para volumen limpio según el peso
 * corporal y el ritmo de ganancia (lento, moderado o manual).
 * Evidencia: Helms 2023 (5-20% sobre mantenimiento según experiencia),
 * Trexler 2026 (+0.1-0.25%/sem). Lento +0.25%/sem ≈ +150 kcal a 68.5kg.
 */
export function calculateAutoSurplus(weight = null, gainPace = null) {
    const w = parseFloat(weight || AppState.config.currentWeight) || 75;
    const pace = gainPace || AppState.config.gainPace || 'lento';

    // Clamps de seguridad: mínimo +100 (ruido), máximo +300 kcal/día y ≤15%
    // del TDEE fórmula. Superávits mayores aceleran sobre todo la grasa
    // (Helms 2023: +15% no dio más hipertrofia que +5%, solo más pliegues).
    const tdeeEst = _getFormulaTMR(w) * 1.25;
    const maxSurplus = Math.max(100, Math.min(300, tdeeEst * 0.15));
    const clampSurplus = (s) => Math.round(Math.min(Math.max(100, s), maxSurplus));

    if (pace === 'lento') {
        // ~+0.25% del peso corporal por semana (volumen limpio)
        return clampSurplus((w * 0.0025 * LEAN_GAIN_KCAL_PER_KG) / 7);
    } else if (pace === 'moderado') {
        // ~+0.50% del peso corporal por semana
        return clampSurplus((w * 0.005 * LEAN_GAIN_KCAL_PER_KG) / 7);
    } else if (pace === 'manual') {
        return clampSurplus(AppState.config.surplusTarget || 150);
    }

    return clampSurplus((w * 0.0025 * LEAN_GAIN_KCAL_PER_KG) / 7);
}

// ─── Targets dinámicos diarios ────────────────────────────────────────────────
// Cada día usa SOLO datos disponibles hasta esa fecha.
// TDEE adaptativo congelado por día — no cambia al navegar al pasado.
export function getDynamicDayTargets(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayDate = new Date(year, month - 1, day);
    const dayInfo = getDayType(dayDate);

    // Peso específico del día (si existe) — para TMR y macros
    const historyEntry = AppState.config.weightHistory?.find(w => w.date === dateKey);
    const dayWeight = historyEntry?.weight || AppState.config.currentWeight || 75;

    // TMR con peso del día (no el peso actual)
    const tmr = _getFormulaTMR(dayWeight);
    if (!tmr) return null;

    let workoutKcal = 0;
    let isRealLoggedSession = false;

    try {
        const sessions = getWorkoutSessions();
        const session = sessions[dateKey];

        if (session && session.finalized !== false && Array.isArray(session.exercises) && session.exercises.length > 0) {
            const saved = parseFloat(session.estimatedKcal);
            workoutKcal = Number.isFinite(saved)
                ? Math.min(20000, Math.max(0, saved))
                : Math.max(0, parseFloat(estimateWorkoutKcal(session)) || 0);
            isRealLoggedSession = true;
        } else if (dayInfo.templateId) {
            const templates = getWorkoutTemplates();
            const tmpl = templates[dayInfo.templateId];
            if (tmpl && tmpl.exercises && tmpl.exercises.length > 0) {
                const estDuration = calculateWorkoutDuration({ exercises: tmpl.exercises, restTimeMin: 3 });
                workoutKcal = estimateWorkoutKcal({ date: dateKey, exercises: tmpl.exercises, duration: estDuration, restTimeMin: 3 });
            }
        }
    } catch { workoutKcal = 0; }

    // TDEE Base: adaptativo congelado o fórmula
    const tdeeMode = AppState.config.tdeeMode || 'formula';
    let tdeeBase;
    let adaptiveResult = null;
    const formulaTDEE = Math.round(tmr * 1.25);
    const CAP = 400;
    let useAdaptiveEstimate = false;
    let adaptiveFallbackReason = null;
    if (tdeeMode === 'adaptive') {
        adaptiveResult = calculateAdaptiveTDEEForDate(dateKey);
        // Gate de calidad: una estimación adaptativa con confianza baja o con
        // cobertura <70 % no debe fijar objetivos. El hold de transición sí se
        // usa: precisamente existe para evitar el rebote de agua.
        const adaptiveCoverage = Number.isFinite(adaptiveResult.coverage)
            ? adaptiveResult.coverage
            : 0;
        const usableAdaptive = adaptiveResult.source === 'adaptive'
            && (adaptiveResult.transitionHold === true
                || (adaptiveResult.confidence !== 'low' && adaptiveCoverage >= 0.70));
        if (usableAdaptive) {
            // Usar TDEE adaptativo directamente — ya incluye el efecto de workouts
            useAdaptiveEstimate = true;
            tdeeBase = Math.round(adaptiveResult.tdee);
            // Proteger tdeeBase: no puede bajar de formulaTDEE - CAP ni superar
            // formulaTDEE + CAP (el TDEE adaptativo ya viene capado, pero el
            // peso del día puede cambiar la fórmula de referencia).
            tdeeBase = Math.max(formulaTDEE - CAP, Math.min(formulaTDEE + CAP, tdeeBase));
        } else {
            // Fallback a fórmula: pocos pesajes, ventana dispersa, cobertura
            // insuficiente o confianza baja. NO incluye workouts, así que se
            // suman como en fórmula.
            tdeeBase = formulaTDEE;
            if (adaptiveResult.source !== 'adaptive') {
                adaptiveFallbackReason = adaptiveResult.fallbackReason || 'formula';
            } else if (adaptiveResult.confidence === 'low') {
                adaptiveFallbackReason = 'low_confidence';
            } else {
                adaptiveFallbackReason = 'low_coverage';
            }
        }
    } else {
        tdeeBase = formulaTDEE;
    }
    // Con estimación adaptativa real, las kcal del entreno ya están reflejadas
    // en el TDEE (histórico de peso). Sin ella (fórmula o fallback), se suman.
    const tdee = useAdaptiveEstimate ? tdeeBase : tdeeBase + workoutKcal;

    // Fase del objetivo: definicion (déficit), mantenimiento (=TDEE) o
    // volumen (superávit). Por defecto definicion = comportamiento histórico.
    const goalPhase = AppState.config.goalPhase || 'definicion';
    const lossPace = AppState.config.lossPace || 'moderado';
    const deficitTarget = calculateAutoDeficit(dayWeight, lossPace);
    const gainPace = AppState.config.gainPace || 'lento';
    const surplusTarget = calculateAutoSurplus(dayWeight, gainPace);

    // Calorías objetivo según fase. El suelo (AHA/ACC) se aplica en TODAS las
    // fases: un mantenimiento/volumen calculado por debajo del suelo también es
    // un objetivo inseguro.
    const gender = AppState.config.gender || 'male';
    const calorieFloor = gender === 'female' ? 1200 : 1500;
    let rawCals;
    if (goalPhase === 'volumen') {
        rawCals = tdee + surplusTarget;
    } else if (goalPhase === 'mantenimiento') {
        rawCals = tdee;
    } else {
        rawCals = tdee - deficitTarget;
    }
    const floorApplied = rawCals < calorieFloor;
    const cals = Math.max(calorieFloor, rawCals);

    // Macros: proteína deseada primero, grasas 0.8 g/kg. Si no caben, se
    // recortan grasas hasta 0.5 g/kg; solo después se reduce proteína (hasta
    // 1.2 g/kg). Antes se dejaban carbs a 0 y el objetivo "real" subía en
    // silencio por encima de las kcal pactadas.
    const pFactor = parseFloat(AppState.config.proteinFactor) || 2.0;
    const proteinDesired = Math.round(dayWeight * pFactor);
    const fatsPreferred = Math.max(Math.round(dayWeight * 0.8), 40);
    const fatsMin = Math.max(Math.round(dayWeight * 0.5), 30);
    let protein = proteinDesired;
    let fats = fatsPreferred;

    if (protein * 4 + fats * 9 > cals) {
        fats = Math.max(fatsMin, Math.floor((cals - protein * 4) / 9));
    }
    if (protein * 4 + fats * 9 > cals) {
        const maxProtein = Math.floor((cals - fats * 9) / 4);
        const proteinMinG = Math.round(dayWeight * 1.2);
        protein = Math.max(Math.min(protein, maxProtein), Math.min(proteinDesired, proteinMinG));
    }

    const macroCals = protein * 4 + fats * 9;
    const carbs = Math.max(0, Math.round((cals - macroCals) / 4));
    // El objetivo mostrado es la suma real de macros (puede diferir ±2 kcal por
    // redondeo y subir solo si ni con los mínimos se puede cumplir).
    const actualCals = macroCals + carbs * 4;
    // Déficit REAL respecto al TDEE (puede ser menor que deficitTarget por el
    // piso calórico o por macros mínimas). Usar este en ETAs y comparativas.
    const actualDeficit = tdee - actualCals;
    const macroOverflow = macroCals > cals;
    const proteinCompromised = protein < proteinDesired;
    const fatReduced = fats < fatsPreferred;
    // En definición, si el TDEE estimado está por debajo del suelo, el objetivo
    // puede acabar por encima del TDEE: sería un superávit disfrazado.
    const belowFloor = goalPhase === 'definicion' && actualCals > tdee;

    return {
        cals: actualCals,
        protein,
        carbs,
        fats,
        proteinDesired,
        fatsPreferred,
        fatsMin,
        tmr: Math.round(tmr),
        formulaTDEE,
        tdee,
        tdeeBase,
        tdeeSource: useAdaptiveEstimate ? 'adaptive' : 'formula',
        workoutKcal,
        deficitTarget,
        actualDeficit,
        goalPhase,
        gainPace,
        surplusTarget,
        isRealLoggedSession,
        dayType: dayInfo.type || 'descanso',
        dayLabel: dayInfo.label || '',
        adaptiveTDEE: adaptiveResult,
        adaptiveFallbackReason,
        targetCals: cals,
        rawCals,
        calorieFloor,
        floorApplied,
        macroOverflow,
        proteinCompromised,
        fatReduced,
        belowFloor,
    };
}

export function convertToGrams(quantity, unit, customUnitWeight = null) {
    if (customUnitWeight && UNIT_CONVERSIONS[unit] === undefined) {
        return quantity * customUnitWeight;
    }
    return quantity * (UNIT_CONVERSIONS[unit] || 1);
}

export function convertQuantity(quantity, fromUnit, toUnit, customUnitWeight = null) {
    if (fromUnit === toUnit || !quantity || quantity === '') return quantity;
    const qty = parseFloat(quantity);
    if (isNaN(qty)) return quantity;

    const grams = convertToGrams(qty, fromUnit, customUnitWeight);

    if (toUnit in UNIT_CONVERSIONS) {
        return parseFloat((grams / UNIT_CONVERSIONS[toUnit]).toFixed(2));
    }

    if (customUnitWeight && toUnit !== fromUnit) {
        return parseFloat((grams / customUnitWeight).toFixed(2));
    }

    return quantity;
}
