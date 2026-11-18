// ==================== PASOS → SESIÓN DE ENTRENO ====================
// Escribe el total de pasos del día en la sesión de hoy sin pisar las series
// manuales del usuario. Lo usa la sincronización con Google Health.

import AppState from './state.js';
import { getDateKey, safeSet, notifyNutritionChanged } from './storage.js';
import { estimateWorkoutKcal, getWorkoutSessions, getExercisesDB } from './workout.js';

/**
 * Aplica los pasos del día a la sesión de entrenamiento de HOY.
 * Nunca escribe en la fecha que el usuario esté viendo si es otra.
 *
 * @param {number} steps
 * @returns {{ok: boolean, reason?: string, dateKey?: string, steps?: number}}
 */
export function applyStepsToTodayWorkout(steps) {
    const total = Math.round(Number(steps));
    if (!Number.isFinite(total) || total <= 0) return { ok: false, reason: 'no_steps' };

    const dateKey = getDateKey(new Date());
    const sessions = getWorkoutSessions();
    let session = sessions[dateKey];

    if (!session || typeof session !== 'object') {
        session = { date: dateKey, exercises: [], duration: 0, restTimeMin: 3, notes: '', finalized: true };
        sessions[dateKey] = session;
    }
    if (!Array.isArray(session.exercises)) session.exercises = [];

    // Buscar o añadir ejercicio de 'Caminar / Pasos Diarios' (ID 160)
    const allEx = getExercisesDB();
    const stepsExDB = allEx.find(e => e.id == 160 || (e.name && e.name.toLowerCase().includes('pasos'))) || {
        id: 160,
        name: 'Caminar / Pasos Diarios',
        muscle: 'Cardio',
        type: 'cardio',
        category: 'cardio',
        trackingType: 'steps'
    };

    // Match estricto: mismo exerciseId, o (nombre con 'pasos' SOLO en ejercicios
    // de tipo steps). Un custom con "pasos" en el nombre no se secuestra.
    const exInSession = session.exercises.find(e => e && (
        e.exerciseId == stepsExDB.id ||
        ((e.trackingType || '') === 'steps' && e.name && e.name.toLowerCase().includes('pasos'))
    ));

    if (exInSession) {
        if (!Array.isArray(exInSession.sets)) exInSession.sets = [];
        // Solo se actualiza el bloque sincronizado. Los sets manuales no se
        // pisan. Los backups antiguos no tienen 'synced': se migra el set 0
        // si parece el generado por una sincronización anterior.
        let syncedSet = exInSession.sets.find(s => s && s.synced === true);
        if (!syncedSet) {
            const legacy = exInSession.sets[0];
            const looksLegacySynced = legacy && legacy.synced === undefined
                && parseFloat(legacy.steps) > 0
                && (parseFloat(legacy.mins) || 0) === 0
                && legacy.done === true;
            if (looksLegacySynced) {
                syncedSet = legacy;
                syncedSet.synced = true;
            }
        }
        if (syncedSet) {
            syncedSet.steps = total;
            syncedSet.done = true;
            syncedSet.synced = true;
        } else {
            exInSession.sets.push({ steps: total, mins: 0, done: true, synced: true });
        }
        exInSession.trackingType = exInSession.trackingType || 'steps';
    } else {
        session.exercises.push({
            exerciseId: stepsExDB.id,
            name: stepsExDB.name,
            muscle: stepsExDB.muscle,
            type: stepsExDB.type,
            category: stepsExDB.category,
            trackingType: 'steps',
            sets: [{ steps: total, mins: 0, done: true, synced: true }]
        });
    }

    // Una sesión creada solo por pasos es actividad real, no un borrador.
    const onlySteps = session.exercises.every(ex => (ex.trackingType || '') === 'steps');
    if (onlySteps) {
        session.finalized = true;
        session.onlySteps = true;
    }

    session.estimatedKcal = estimateWorkoutKcal(session);
    sessions[dateKey] = session;
    if (!safeSet('workoutSessions', sessions)) {
        return { ok: false, reason: 'storage' };
    }
    notifyNutritionChanged();

    import('./meals.js').then(m => {
        if (AppState.allDays[dateKey]) m.updateDaySummary(AppState.allDays[dateKey]);
    }).catch(() => { /* sin DOM o sin día cargado */ });
    import('./config-settings.js').then(m => m.updateHeaderInfo()).catch(() => { /* sin DOM */ });
    import('./ui/workout-ui.js').then(m => {
        if (document.getElementById('sport-entreno-hoy')?.style.display !== 'none') {
            m.renderTodayWorkout();
        }
    }).catch(() => { /* sin DOM */ });

    return { ok: true, dateKey, steps: total };
}
