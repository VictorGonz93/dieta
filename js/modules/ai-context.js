// ==================== CONTEXTO PARA LA IA ====================
// Construye un paquete compacto con los datos que la app ya tiene calculados.
// Reglas de diseño:
//  - Solo datos derivados/necesarios, nunca la base de datos completa.
//  - El inicio de la fase actual manda: en mantenimiento/volumen no se debe
//    colar el peso inicial del déficit (85,4 kg) como punto de partida.
//  - Nada de API keys, tokens ni datos de identificación personal.
//  - Funciones puras sobre el estado: no escriben en localStorage ni en el DOM.

import AppState from './state.js';
import { getDateKey } from './storage.js';
import {
    getPhaseProgress,
    getDynamicDayTargets,
    calculateRobustWeightTrend,
} from './nutrition.js';
import {
    getFinalizedWorkoutSessions,
    getWorkoutSessions,
    getWeeklyMuscleVolume,
    calculateWorkoutDuration,
    getExercisePRs,
    getExercisesDB,
} from './workout.js';

const CONTEXT_SCHEMA = 'apex-nutrition-context-v1';

const PHASE_LABELS = {
    definicion: 'Definición (déficit)',
    mantenimiento: 'Mantenimiento',
    volumen: 'Volumen (superávit)',
};

function _round(value, decimals = 1) {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return null;
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
}

function _clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function _parseToday(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        const dt = new Date(y, m - 1, d, 12);
        if (!Number.isNaN(dt.getTime())) return dt;
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function _addDays(date, delta) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + delta);
    return copy;
}

function _sumDay(day) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
    if (!day || !day.meals || typeof day.meals !== 'object') return totals;
    Object.values(day.meals).forEach(meal => {
        if (!Array.isArray(meal)) return;
        meal.forEach(food => {
            if (!food || typeof food !== 'object') return;
            totals.kcal += parseFloat(food.kcal) || 0;
            totals.protein += parseFloat(food.protein) || 0;
            totals.carbs += parseFloat(food.carbs) || 0;
            totals.fats += parseFloat(food.fats) || 0;
        });
    });
    return totals;
}

function _hasFood(day) {
    if (!day || !day.meals || typeof day.meals !== 'object') return false;
    return Object.values(day.meals).some(meal => Array.isArray(meal) && meal.some(food => food && (parseFloat(food.kcal) || 0) > 0));
}

function _loggingStreak(today) {
    let cursor = new Date(today);
    let includesToday = false;
    if (_hasFood(AppState.allDays[getDateKey(cursor)])) {
        includesToday = true;
    } else {
        cursor = _addDays(cursor, -1);
    }
    let days = 0;
    for (let i = 0; i < 3660; i++) {
        if (!_hasFood(AppState.allDays[getDateKey(cursor)])) break;
        days++;
        cursor = _addDays(cursor, -1);
    }
    return { days, includesToday };
}

function _weightHistorySorted() {
    return (Array.isArray(AppState.config.weightHistory) ? AppState.config.weightHistory : [])
        .map(entry => ({
            date: entry && entry.date,
            weight: parseFloat(entry && entry.weight),
        }))
        .filter(entry => typeof entry.date === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
            && Number.isFinite(entry.weight)
            && entry.weight >= 25 && entry.weight <= 350)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function _weightSummary(today, windowDays) {
    const history = _weightHistorySorted();
    const startKey = getDateKey(_addDays(today, -(windowDays - 1)));
    const windowEntries = history.filter(entry => entry.date >= startKey && entry.date <= getDateKey(today));
    const latest = history.length > 0 ? history[history.length - 1] : null;

    const avgRange = (fromDelta, toDelta) => {
        const from = getDateKey(_addDays(today, fromDelta));
        const to = getDateKey(_addDays(today, toDelta));
        const entries = history.filter(entry => entry.date >= from && entry.date <= to);
        if (entries.length === 0) return null;
        return _round(entries.reduce((sum, entry) => sum + entry.weight, 0) / entries.length, 2);
    };

    const trend = calculateRobustWeightTrend(windowEntries);
    const avg7 = avgRange(-6, 0);
    const avgPrev7 = avgRange(-13, -7);
    const weeklyDelta = avg7 !== null && avgPrev7 !== null ? _round(avg7 - avgPrev7, 2) : null;

    return {
        latestWeightKg: latest ? _round(latest.weight, 2) : _round(AppState.config.currentWeight, 2),
        latestDate: latest ? latest.date : null,
        entriesInWindow: windowEntries.length,
        avgLast7Kg: avg7,
        avgPrevious7Kg: avgPrev7,
        weeklyDeltaKg: weeklyDelta,
        trendKgPerWeek: trend ? _round(trend.slope * 7, 2) : null,
        trendSpanDays: trend ? trend.spanDays : null,
        trendPointsUsed: trend ? trend.pointsUsed : null,
        trendPointsTotal: trend ? trend.pointsTotal : null,
        recentWeighIns: windowEntries.slice(-10).map(entry => ({ date: entry.date, kg: _round(entry.weight, 2) })),
    };
}

function _exerciseDetails(session, exercisesDB = null, limit = 8) {
    const db = Array.isArray(exercisesDB) ? exercisesDB : getExercisesDB();
    const exercises = Array.isArray(session && session.exercises) ? session.exercises : [];

    return exercises.slice(0, limit).map(ex => {
        if (!ex || typeof ex !== 'object') return null;
        const dbEx = db.find(item => String(item.id) === String(ex.exerciseId)) || ex;
        const name = String(ex.name || dbEx.name || `Ejercicio ${ex.exerciseId || ''}`).trim().slice(0, 80) || 'Ejercicio';
        const muscle = ex.muscle || dbEx.muscle || null;
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        let workedSets = 0;
        let topKg = 0;
        let topReps = 0;
        let bestScore = -1;
        let totalSecs = 0;
        let totalMins = 0;
        let totalKm = 0;
        let totalSteps = 0;

        sets.forEach(set => {
            if (!set || typeof set !== 'object') return;
            const reps = parseFloat(set.reps) || 0;
            const secs = parseFloat(set.secs) || 0;
            const mins = parseFloat(set.mins) || 0;
            const steps = parseFloat(set.steps) || 0;
            const km = parseFloat(set.km) || 0;
            const kg = parseFloat(set.kg) || 0;
            if (reps > 0 || secs > 0 || mins > 0 || steps > 0 || km > 0) {
                workedSets++;
                // La mejor serie: prioriza kg y, a igualdad, más repeticiones.
                const score = kg * 1000 + reps;
                if (score > bestScore) {
                    bestScore = score;
                    topKg = kg;
                    topReps = reps;
                }
            }
            totalSecs += secs;
            totalMins += mins;
            totalKm += km;
            totalSteps += steps;
        });

        const detail = { name, sets: workedSets };
        if (muscle) detail.muscle = muscle;
        if (workedSets > 0) {
            if (totalSteps > 0) {
                detail.steps = Math.round(totalSteps);
            } else if (totalMins > 0 || totalKm > 0) {
                if (totalMins > 0) detail.mins = Math.round(totalMins);
                if (totalKm > 0) detail.km = _round(totalKm, 2);
            } else if (totalSecs > 0 && topReps === 0) {
                detail.secs = Math.round(totalSecs);
                if (topKg > 0) detail.kg = _round(topKg, 1);
            } else {
                if (topReps > 0) detail.reps = Math.round(topReps);
                if (topKg > 0) detail.kg = _round(topKg, 1);
            }
        }
        return detail;
    }).filter(Boolean);
}

function _workoutSummary(session, { details = false } = {}) {
    if (!session || !Array.isArray(session.exercises) || session.exercises.length === 0) return null;
    const exercisesDB = getExercisesDB();
    const muscles = [];
    let totalSets = 0;

    session.exercises.forEach(ex => {
        if (!ex || typeof ex !== 'object') return;
        const dbEx = exercisesDB.find(item => String(item.id) === String(ex.exerciseId)) || ex;
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        const worked = sets.filter(set => set && (
            (parseFloat(set.reps) || 0) > 0
            || (parseFloat(set.secs) || 0) > 0
            || (parseFloat(set.steps) || 0) > 0
            || (parseFloat(set.mins) || 0) > 0
            || (parseFloat(set.km) || 0) > 0
        )).length;
        totalSets += worked;
        const muscle = ex.muscle || dbEx.muscle;
        if (muscle && muscle !== 'Cardio' && muscle !== 'Todos' && !muscles.includes(muscle)) {
            muscles.push(muscle);
        }
    });

    const duration = parseInt(session.duration, 10);
    const minutes = duration > 0 ? duration : calculateWorkoutDuration(session);
    const kcal = parseFloat(session.estimatedKcal);

    const summary = {
        minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
        kcal: Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : null,
        exercises: session.exercises.length,
        sets: totalSets,
        muscles: muscles.slice(0, 6),
    };

    if (details) {
        const exerciseDetails = _exerciseDetails(session, exercisesDB);
        if (exerciseDetails.length > 0) {
            summary.exerciseDetails = exerciseDetails;
            if (session.exercises.length > exerciseDetails.length) {
                summary.exerciseDetailsOmitted = session.exercises.length - exerciseDetails.length;
            }
        }
        if (typeof session.notes === 'string' && session.notes.trim()) {
            summary.notes = session.notes.trim().slice(0, 200);
        }
    }

    return summary;
}

function _draftWorkouts(today, days) {
    const sessions = getWorkoutSessions();
    const startKey = getDateKey(_addDays(today, -(days - 1)));
    const todayKey = getDateKey(today);

    return Object.keys(sessions)
        .filter(dateKey => dateKey >= startKey && dateKey <= todayKey)
        .filter(dateKey => sessions[dateKey] && sessions[dateKey].finalized === false)
        .sort()
        .reverse()
        .map(dateKey => {
            const summary = _workoutSummary(sessions[dateKey], { details: true });
            return summary ? { date: dateKey, status: 'draft', ...summary } : null;
        })
        .filter(Boolean)
        .slice(0, 5);
}

function _weeklyVolume(endKey, weeksBack) {
    try {
        const volume = getWeeklyMuscleVolume(endKey, weeksBack);
        const setsByMuscle = {};
        Object.keys(volume.muscles || {}).sort().forEach(muscle => {
            const info = volume.muscles[muscle];
            if (!info || !Number.isFinite(info.sets) || info.sets <= 0) return;
            setsByMuscle[muscle] = {
                sets: Math.round(info.sets * 10) / 10,
                days: info.days || 0,
            };
        });
        return {
            range: `${volume.startKey}..${volume.endKey}`,
            setsByMuscle,
        };
    } catch (_) {
        return null;
    }
}

function _prSummary(limit = 8) {
    try {
        const prs = getExercisePRs();
        const exercisesDB = getExercisesDB();
        const names = new Map(exercisesDB.map(ex => [String(ex.id), ex.name]));
        return Object.keys(prs)
            .map(id => {
                const pr = prs[id] || {};
                return {
                    exercise: names.get(String(id)) || `Ejercicio ${id}`,
                    kg: _round(pr.maxWeight, 2),
                    reps: parseInt(pr.reps, 10) || null,
                    date: typeof pr.date === 'string' ? pr.date : null,
                };
            })
            .filter(pr => Number.isFinite(pr.kg) && pr.kg > 0)
            .sort((a, b) => b.kg - a.kg)
            .slice(0, limit);
    } catch (_) {
        return [];
    }
}

function _dailyLogs(today, days) {
    const sessions = getFinalizedWorkoutSessions();
    const logs = [];
    let loggedDays = 0;
    let targetDays = 0;
    let proteinHitDays = 0;
    let kcalSum = 0;
    let proteinSum = 0;

    for (let offset = days - 1; offset >= 0; offset--) {
        const date = _addDays(today, -offset);
        const dateKey = getDateKey(date);
        const day = AppState.allDays[dateKey];
        const totals = _sumDay(day);
        const logged = totals.kcal > 0;
        const targets = getDynamicDayTargets(dateKey);
        const weightEntry = _weightHistorySorted().find(entry => entry.date === dateKey);
        const workout = sessions[dateKey] ? _workoutSummary(sessions[dateKey]) : null;

        if (logged) {
            loggedDays++;
            kcalSum += totals.kcal;
            proteinSum += totals.protein;
            if (targets && targets.cals > 0 && Math.abs(totals.kcal - targets.cals) <= targets.cals * 0.10) targetDays++;
            if (targets && targets.protein > 0 && totals.protein >= targets.protein * 0.90) proteinHitDays++;
        }

        const entry = { date: dateKey, logged };
        if (logged) {
            entry.kcal = Math.round(totals.kcal);
            entry.proteinG = _round(totals.protein, 1);
            entry.carbsG = _round(totals.carbs, 1);
            entry.fatsG = _round(totals.fats, 1);
        }
        if (targets) {
            entry.targetKcal = Math.round(targets.cals);
            entry.targetProteinG = Math.round(targets.protein);
            entry.dayType = targets.dayType;
        }
        if (weightEntry) entry.weightKg = _round(weightEntry.weight, 2);
        if (workout) entry.workout = workout;
        if (day && typeof day.notes === 'string' && day.notes.trim()) {
            entry.notes = day.notes.trim().slice(0, 160);
        }
        logs.push(entry);
    }

    return {
        logs,
        adherence: {
            loggedDays,
            onTargetDays: targetDays,
            proteinGoalDays: proteinHitDays,
            avgKcal: loggedDays > 0 ? Math.round(kcalSum / loggedDays) : null,
            avgProteinG: loggedDays > 0 ? _round(proteinSum / loggedDays, 1) : null,
        },
    };
}

function _recentNotes(limit = 4) {
    return Object.keys(AppState.allDays)
        .sort()
        .reverse()
        .map(dateKey => {
            const notes = AppState.allDays[dateKey] && AppState.allDays[dateKey].notes;
            return typeof notes === 'string' && notes.trim()
                ? { date: dateKey, text: notes.trim().slice(0, 200) }
                : null;
        })
        .filter(Boolean)
        .slice(0, limit);
}

/**
 * Construye el contexto que se envía a la IA.
 * @param {{ days?: number, workoutDays?: number, today?: Date|string }} options
 * @returns {object} contexto compacto y serializable
 */
export function buildAIContext(options = {}) {
    const days = _clampInt(options.days, 1, 30, 14);
    const workoutDays = _clampInt(options.workoutDays, 1, 30, 14);
    const today = _parseToday(options.today);
    const todayKey = getDateKey(today);
    const phase = getPhaseProgress();
    const targets = getDynamicDayTargets(todayKey);
    const { logs, adherence } = _dailyLogs(today, days);
    const weight = _weightSummary(today, Math.max(28, days));
    const sessions = getFinalizedWorkoutSessions();
    const workoutStartKey = getDateKey(_addDays(today, -(workoutDays - 1)));

    const recentWorkouts = Object.keys(sessions)
        .filter(dateKey => dateKey >= workoutStartKey && dateKey <= todayKey)
        .sort()
        .reverse()
        .map(dateKey => {
            const summary = _workoutSummary(sessions[dateKey], { details: true });
            return summary ? { date: dateKey, ...summary } : null;
        })
        .filter(Boolean)
        .slice(0, 12);
    const draftWorkouts = _draftWorkouts(today, workoutDays);

    const phaseStartWeight = phase && Number.isFinite(phase.startWeight)
        ? _round(phase.startWeight, 2)
        : (Number.isFinite(parseFloat(AppState.config.phaseStartWeight))
            ? _round(AppState.config.phaseStartWeight, 2)
            : null);

    const profile = {
        age: parseInt(AppState.config.age, 10) || null,
        gender: AppState.config.gender === 'female' ? 'female' : (AppState.config.gender === 'male' ? 'male' : null),
        heightCm: _round(AppState.config.height, 1),
        currentWeightKg: weight.latestWeightKg,
        phase: phase ? phase.phase : (AppState.config.goalPhase || 'definicion'),
        phaseLabel: PHASE_LABELS[phase ? phase.phase : AppState.config.goalPhase] || null,
        phaseStartWeightKg: phaseStartWeight,
        phaseStartDate: phase ? phase.startDateKey : null,
        phaseTargetWeightKg: phase && Number.isFinite(phase.targetWeight) ? _round(phase.targetWeight, 2) : null,
        phaseMovedKg: phase && Number.isFinite(phase.moved) ? _round(phase.moved, 2) : null,
        phaseRemainingKg: phase && Number.isFinite(phase.remaining) ? _round(phase.remaining, 2) : null,
        phaseProgressPercent: phase && Number.isFinite(phase.progressPercent) ? phase.progressPercent : null,
        isMaintenance: !!(phase && phase.isMaintenance),
        isBulk: !!(phase && phase.isBulk),
    };

    const goals = targets ? {
        dayType: targets.dayType,
        dayLabel: targets.dayLabel || null,
        targetKcal: Math.round(targets.cals),
        proteinG: Math.round(targets.protein),
        carbsG: Math.round(targets.carbs),
        fatsG: Math.round(targets.fats),
        tdee: Math.round(targets.tdee),
        tdeeSource: targets.tdeeSource,
        formulaTDEE: Number.isFinite(targets.formulaTDEE) ? Math.round(targets.formulaTDEE) : null,
        deficitTarget: Number.isFinite(targets.deficitTarget) ? Math.round(targets.deficitTarget) : null,
        actualDeficit: Number.isFinite(targets.actualDeficit) ? Math.round(targets.actualDeficit) : null,
        surplusTarget: Number.isFinite(targets.surplusTarget) ? Math.round(targets.surplusTarget) : null,
        calorieFloor: Number.isFinite(targets.calorieFloor) ? targets.calorieFloor : null,
        floorApplied: !!targets.floorApplied,
        proteinCompromised: !!targets.proteinCompromised,
        fatReduced: !!targets.fatReduced,
        belowFloor: !!targets.belowFloor,
    } : null;

    const streak = _loggingStreak(today);
    const workoutsWithData = recentWorkouts.length;
    const weightEntriesInWindow = weight.entriesInWindow;

    return {
        schema: CONTEXT_SCHEMA,
        generatedAt: new Date().toISOString(),
        today: todayKey,
        windowDays: days,
        profile,
        goals,
        weight,
        adherence: {
            ...adherence,
            loggingStreakDays: streak.days,
            includesToday: streak.includesToday,
        },
        days: logs,
        workouts: {
            windowDays: workoutDays,
            sessionsLogged: workoutsWithData,
            recent: recentWorkouts,
            drafts: draftWorkouts,
            weeklyVolume: _weeklyVolume(todayKey, 0),
            previousWeekVolume: _weeklyVolume(todayKey, 1),
            prs: _prSummary(),
        },
        notes: _recentNotes(),
        dataQuality: {
            loggedDays: adherence.loggedDays,
            weightEntriesInWindow,
            workoutSessionsInWindow: workoutsWithData,
            draftSessionsInWindow: draftWorkouts.length,
            hasEnoughFoodData: adherence.loggedDays >= 3,
            hasEnoughWeightData: weightEntriesInWindow >= 2,
            hasWorkoutData: workoutsWithData > 0,
        },
    };
}

/**
 * Prompt de sistema en español. Incluye el contexto serializado y las reglas
 * de seguridad/alcance. No contiene credenciales ni datos identificativos.
 */
export function buildAISystemPrompt(context) {
    const contextJson = JSON.stringify(context);
    return [
        'Eres "Apex Coach", el asistente de nutrición y entrenamiento integrado en Apex Nutrition.',
        'Tu función es analizar los datos que el usuario registra en la app y darle recomendaciones prácticas.',
        'No puedes consultar la app por tu cuenta y NO puedes modificar comidas, pesos, objetivos ni ajustes. Solo aconsejas.',
        'Para responder, usa el JSON adjunto. Se genera justo antes de esta pregunta con los datos guardados en ese momento.',
        '',
        'DATOS ACTUALES DEL USUARIO (JSON generado por la app; los cálculos ya están hechos):',
        contextJson,
        '',
        'REGLAS OBLIGATORIAS:',
        '1. Responde siempre en español, con un tono cercano, claro y directo.',
        '2. Usa exclusivamente los datos del JSON. No inventes comidas, pesos, entrenamientos, macros, ejercicios ni fechas. Si falta un dato, dilo y explica qué registrar para poder responder mejor. No pidas al usuario que pegue el JSON ni digas que no tienes acceso a sus datos: el contexto adjunto ya se actualiza en cada pregunta.',
        '3. Para valorar la fase actual usa profile.phase, profile.phaseStartWeightKg y profile.phaseStartDate. Nunca uses el peso inicial de una fase anterior ni el peso inicial del déficit para valorar mantenimiento o volumen.',
        '4. Distingue entre datos observados (comidas, pesajes, entrenos) y estimaciones de la app (TDEE, tendencia, predicciones). No presentes una estimación como una medición exacta.',
        '5. No prometas resultados, no des diagnósticos médicos y no recomiendes fármacos ni suplementos con dosis. Ante dolor, lesión, enfermedad o posibles señales de trastorno alimentario, recomienda consultar a un profesional sanitario.',
        '6. No fomentes restricciones extremas, ayunos agresivos ni pérdida de peso rápida. Si el objetivo choca con la salud, prioriza la salud y dilo.',
        '7. Sé conciso: normalmente 250-400 palabras. Empieza por lo más importante, usa titulares cortos y listas cuando ayuden. Termina con 1-3 acciones concretas y medibles.',
        '8. Si el usuario pregunta algo ajeno a nutrición, entrenamiento o progreso, responde brevemente que ese tema queda fuera de tu alcance.',
        '9. No repitas el JSON ni muestres tablas enormes. Cita solo los números necesarios.',
        '10. Si detectas que los datos son insuficientes o contradictorios, dilo antes de recomendar cambios.',
        '11. workouts.recent contiene los entrenamientos finalizados. Los entrenamientos en workouts.drafts son borradores: el usuario los ha rellenado pero no ha pulsado Guardar Entreno. No cuentes los borradores como realizados ni los uses para volumen o PRs. Si la pregunta se refiere a ellos, dile que los ves como borrador y que pulse Guardar Entreno para que cuenten.',
        '12. Para responder sobre un entreno concreto, usa workouts.recent[].exerciseDetails y workouts.drafts[].exerciseDetails: incluyen nombre, series, repeticiones, kg, minutos, km o pasos. En los ejercicios de fuerza, kg y reps corresponden a la mejor serie. No inventes ejercicios que no aparezcan.',
        '13. Si el usuario dice que acaba de guardar algo y no aparece en el JSON, explícale que el contexto se genera al enviar cada pregunta y cubre los últimos 14 días de comidas y entrenos; si es un entreno, que compruebe que el estado sea Realizado y no Borrador.',
    ].join('\n');
}
