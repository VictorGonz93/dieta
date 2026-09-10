// ==================== UI DE DEPORTE ====================

import {
    EXERCISES_DB, MUSCLES, EQUIPMENT_TYPES, getExercisesDB, saveCustomExercise, calculate1RM,
    initTodayWorkout, getTodayWorkout,
    addExerciseToWorkout, removeExerciseFromWorkout,
    addSetToExercise, removeSetFromExercise, updateSet, toggleSetDone, getFrequentExercises,
    setWorkoutDuration, setWorkoutNotes,
    finalizeWorkout, estimateWorkoutKcal,
    getWorkoutSessions, getExercisePRs,
    getWorkoutTemplates, saveWorkoutTemplate, deleteWorkoutTemplate, loadWorkoutTemplate,
} from '../workout.js?v=501';
import { getDateKey } from '../storage.js';
import AppState from '../state.js';

// ─── Temporizador de Descanso ────────────────────────────────────────────────
let _restTimerInterval = null;
let _restTimeRemaining = 0;
let _restTimeTotal = 90;
let _restTimerActive = false;

function _playRestBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* ignore */ }
}

export function startRestTimer(seconds) {
    if (_restTimerInterval) clearInterval(_restTimerInterval);
    _restTimeTotal = seconds;
    _restTimeRemaining = seconds;
    _restTimerActive = true;
    _updateRestTimerUI();

    _restTimerInterval = setInterval(() => {
        _restTimeRemaining--;
        if (_restTimeRemaining <= 0) {
            clearInterval(_restTimerInterval);
            _restTimerActive = false;
            _playRestBeep();
            if (navigator.vibrate) {
                try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) { }
            }
            import('./notifications.js').then(m => m.showNotification('⏱️ ¡Tiempo de descanso terminado! A por la siguiente serie 💪'));
        }
        _updateRestTimerUI();
    }, 1000);
}

export function stopRestTimer() {
    if (_restTimerInterval) clearInterval(_restTimerInterval);
    _restTimerActive = false;
    _restTimeRemaining = 0;
    _updateRestTimerUI();
}

function _updateRestTimerUI() {
    const display = document.getElementById('workout-rest-timer-display');
    const bar = document.getElementById('workout-rest-timer-bar');
    if (!display) return;

    if (!_restTimerActive && _restTimeRemaining <= 0) {
        display.textContent = '00:00';
        if (bar) bar.style.width = '0%';
        return;
    }

    const mins = Math.floor(_restTimeRemaining / 60);
    const secs = _restTimeRemaining % 60;
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (bar) {
        const pct = Math.max(0, Math.min(100, (_restTimeRemaining / _restTimeTotal) * 100));
        bar.style.width = `${pct}%`;
    }
}

window.startRestTimer = startRestTimer;
window.stopRestTimer = stopRestTimer;

// ─── Sub-tab navigation ───────────────────────────────────────────────────────
export function initSportTabs() {
    showSportTab('planificacion');
}

export function showSportTab(tabId) {
    document.querySelectorAll('.sport-tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.querySelectorAll('.sport-tab-btn').forEach(el => {
        el.classList.remove('active');
        el.style.color = '';
        el.style.borderBottomColor = 'transparent';
    });

    const content = document.getElementById(`sport-${tabId}`);
    if (content) {
        content.classList.add('active');
        content.style.display = 'block';
    }

    const btn = document.querySelector(`[data-sport-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.style.color = 'var(--primary-text)';
        btn.style.borderBottomColor = 'var(--primary)';
    }

    if (tabId === 'entreno-hoy') renderTodayWorkout();
    if (tabId === 'ejercicios') renderExercisesDB();
    if (tabId === 'historial-entrenos') renderWorkoutHistory();
}
window.showSportTab = showSportTab;

// ─── Entreno de Hoy ───────────────────────────────────────────────────────────
export function renderTodayWorkout() {
    const container = document.getElementById('sport-entreno-hoy');
    if (!container) return;

    const dateKey = getDateKey(AppState.currentDate);
    initTodayWorkout(dateKey);
    let workout = getTodayWorkout();

    const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][AppState.currentDate.getDay()];
    const routine = AppState.config.customGymRoutine || {};
    const dayPlan = routine[dayName];
    const planLabel = dayPlan?.label || (dayPlan?.type === 'entreno' ? 'Entrenamiento' : 'Descanso');

    // Auto-cargar plantilla asignada si la sesión de hoy no tiene ejercicios todavía
    if ((!workout.exercises || workout.exercises.length === 0) && dayPlan?.templateId) {
        if (loadWorkoutTemplate(dayPlan.templateId)) {
            workout = getTodayWorkout();
        }
    }

    const kcalEst = estimateWorkoutKcal(workout);
    const templates = Object.values(getWorkoutTemplates());

    container.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-5">
            <!-- Header día -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;">
                <div>
                    <div style="font-size:0.8rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px;">${dayName} · ${dateKey}</div>
                    <div style="font-size:1.1rem;font-weight:600;color:var(--text-1);">${planLabel}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem;color:var(--text-2);">Kcal estimadas</div>
                    <div style="font-size:1.4rem;font-weight:700;color:var(--primary-text);">${kcalEst > 0 ? kcalEst : '—'}</div>
                </div>
            </div>

            <!-- Plantillas -->
            <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:${templates.length > 0 ? '12px' : '8px'};">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;flex:1;min-width:80px;">Plantillas</div>
                    ${workout.exercises.length > 0 ? `
                    <button onclick="document.getElementById('tmpl-save-form').style.display='flex'"
                        style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;white-space:nowrap;">
                        <span class="material-icons" style="font-size:15px;">bookmark_add</span> Guardar plantilla
                    </button>` : ''}
                </div>
                ${templates.length > 0 ? `
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                    ${templates.map(t => `
                    <div style="display:flex;align-items:stretch;border:1px solid var(--border-base);border-radius:8px;overflow:hidden;background:var(--bg-elevated);">
                        <button onclick="window._workoutLoadTmpl('${t.id}')"
                            style="padding:6px 14px;background:transparent;color:var(--text-1);border:none;cursor:pointer;font-size:0.85rem;text-align:left;display:flex;flex-direction:column;gap:1px;">
                            <span style="font-weight:600;">${t.name}</span>
                            <span style="font-size:0.72rem;color:var(--text-3);">${t.exercises.length} ejercicio${t.exercises.length !== 1 ? 's' : ''} · ${t.createdAt}</span>
                        </button>
                        <button onclick="window._workoutDeleteTmpl('${t.id}')"
                            title="Eliminar plantilla"
                            style="padding:6px 10px;background:transparent;color:var(--text-3);border:none;border-left:1px solid var(--border-dim);cursor:pointer;display:flex;align-items:center;">
                            <span class="material-icons" style="font-size:15px;">close</span>
                        </button>
                    </div>`).join('')}
                </div>` : `<div style="color:var(--text-3);font-size:0.85rem;">Sin plantillas guardadas.</div>`}
                <!-- Formulario inline guardar plantilla -->
                <div id="tmpl-save-form" style="display:none;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
                    <input id="tmpl-name-input" type="text" placeholder="Nombre (ej: Pecho / Tríceps)" maxlength="40"
                        style="flex:1;min-width:160px;padding:7px 12px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.88rem;outline:none;">
                    <button onclick="window._workoutConfirmSaveTmpl()"
                        style="padding:7px 14px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;white-space:nowrap;">
                        <span class="material-icons" style="font-size:14px;vertical-align:middle;">save</span> Guardar
                    </button>
                    <button onclick="document.getElementById('tmpl-save-form').style.display='none'"
                        style="padding:7px 10px;background:transparent;color:var(--text-3);border:1px solid var(--border-dim);border-radius:8px;cursor:pointer;font-size:0.85rem;">
                        Cancelar
                    </button>
                </div>
            </div>

            <!-- Añadir ejercicio -->
            <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;">
                <div style="font-size:0.85rem;font-weight:600;color:var(--text-2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em;">Añadir ejercicio a la sesión</div>
                
                <!-- Buscador en tiempo real -->
                <div style="position:relative;margin-bottom:8px;">
                    <span class="material-icons" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:18px;">search</span>
                    <input type="text" id="workout-add-ex-input" placeholder="Buscar por nombre (ej: Press, Sentadilla, Curl)..."
                        oninput="window._filterTodayAddExercises(this.value)"
                        style="width:100%;padding:10px 12px 10px 38px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;box-sizing:border-box;">
                    <div id="workout-add-ex-suggestions" style="position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--bg-card);border:1px solid var(--border-base);border-radius:8px;max-height:220px;overflow-y:auto;display:none;box-shadow:0 10px 30px rgba(0,0,0,0.5);margin-top:4px;"></div>
                </div>

                ${(() => {
                    const frequentEx = getFrequentExercises();
                    if (!frequentEx || frequentEx.length === 0) return '';
                    return `
                    <div style="margin-top:8px;">
                        <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Acceso rápido (Más realizados):</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${frequentEx.map(fe => `
                                <button onclick="window._workoutSelectEx('${fe.id}')"
                                    style="padding:5px 10px;background:var(--bg-elevated);border:1px solid var(--border-base);color:var(--text-1);border-radius:20px;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;gap:4px;">
                                    <span style="font-weight:600;color:var(--primary-text);">${fe.name}</span>
                                    <span style="font-size:0.7rem;color:var(--text-3);">${fe.muscle}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>`;
                })()}

                <details style="margin-top:10px;">
                    <summary style="font-size:0.78rem;color:var(--text-3);cursor:pointer;user-select:none;">Ver desplegable por grupos musculares</summary>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <select id="workout-ex-select" style="flex:1;padding:8px 12px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;">
                            <option value="">Selecciona ejercicio...</option>
                            ${MUSCLES.filter(m => m !== 'Todos').map(muscle => `
                                <optgroup label="${muscle}">
                                    ${getExercisesDB().filter(e => e.muscle === muscle).map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                                </optgroup>
                            `).join('')}
                        </select>
                        <button onclick="window._workoutAddEx()" style="padding:8px 16px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;">
                            <span class="material-icons" style="font-size:18px;vertical-align:middle;">add</span>
                        </button>
                    </div>
                </details>
            </div>

            <!-- Lista de ejercicios -->
            <div id="workout-exercises-list"></div>

            <!-- Duración + notas + guardar -->
            <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <label style="color:var(--text-2);font-size:0.85rem;white-space:nowrap;">Duración (min)</label>
                    <input type="number" id="workout-duration" value="${workout.duration || 60}" min="1" max="300"
                        onchange="window._workoutSetDuration(this.value)"
                        style="width:80px;padding:6px 10px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;text-align:center;">
                </div>
                <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                    <label style="color:var(--text-2);font-size:0.85rem;white-space:nowrap;margin-top:8px;">Notas</label>
                    <textarea id="workout-notes" rows="2" placeholder="Sensaciones, fatiga, etc."
                        onchange="window._workoutSetNotes(this.value)"
                        style="flex:1;min-width:200px;padding:8px 12px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.85rem;outline:none;resize:vertical;">${workout.notes || ''}</textarea>
                </div>
                <button onclick="window._workoutSave()" style="align-self:flex-end;padding:10px 24px;background:linear-gradient(135deg,#10B981,#059669);color:white;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;display:flex;align-items:center;gap:6px;">
                    <span class="material-icons" style="font-size:18px;">save</span>
                    Guardar Entreno
                </button>
            </div>
        </div>
    `;

    _renderExerciseList();

    // Handlers globales
    window._workoutAddEx = () => {
        const input = document.getElementById('workout-add-ex-input');
        const sel = document.getElementById('workout-ex-select');
        const id = sel?.value;
        if (!id) return;
        if (addExerciseToWorkout(id)) {
            if (sel) sel.value = '';
            if (input) input.value = '';
            _renderExerciseList();
            _updateKcalDisplay();
        }
    };
    window._workoutSetDuration = (v) => {
        setWorkoutDuration(v);
        _updateKcalDisplay();
    };
    window._workoutSetNotes = (v) => setWorkoutNotes(v);
    window._workoutSave = () => {
        const dateKey = getDateKey(AppState.currentDate);
        if (finalizeWorkout(dateKey)) {
            renderTodayWorkout();
        }
    };
    // Handlers plantillas
    window._workoutConfirmSaveTmpl = () => {
        const input = document.getElementById('tmpl-name-input');
        const name = input?.value?.trim();
        if (!name) { input?.focus(); return; }
        saveWorkoutTemplate(name);
        renderTodayWorkout();
    };
    window._workoutLoadTmpl = (id) => {
        const workout = getTodayWorkout();
        if (workout?.exercises.length > 0 && !confirm('¿Reemplazar los ejercicios actuales con esta plantilla?')) return;
        loadWorkoutTemplate(id);
        renderTodayWorkout();
    };
    window._workoutDeleteTmpl = (id) => {
        if (!confirm('¿Eliminar esta plantilla?')) return;
        deleteWorkoutTemplate(id);
        renderTodayWorkout();
    };
}

window._filterTodayAddExercises = (query) => {
    const suggestionsEl = document.getElementById('workout-add-ex-suggestions');
    if (!suggestionsEl) return;
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.display = 'none';
        return;
    }
    const allEx = getExercisesDB();
    const workout = getTodayWorkout();
    const matches = allEx.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);

    if (matches.length === 0) {
        suggestionsEl.innerHTML = '<div style="padding:10px 14px;color:var(--text-3);font-size:0.85rem;">No hay ejercicios con ese nombre</div>';
        suggestionsEl.style.display = 'block';
        return;
    }

    suggestionsEl.style.display = 'block';
    suggestionsEl.innerHTML = matches.map(e => {
        const isAdded = workout?.exercises?.some(ex => ex.exerciseId == e.id);
        return `
            <div onclick="${isAdded ? '' : `window._workoutSelectEx('${e.id}')`}"
                style="padding:10px 14px;border-bottom:1px solid var(--border-dim);display:flex;align-items:center;justify-content:space-between;cursor:${isAdded ? 'default' : 'pointer'};opacity:${isAdded ? 0.5 : 1};background:var(--bg-elevated);">
                <div>
                    <span style="font-weight:600;color:var(--text-1);font-size:0.9rem;">${e.name}</span>
                    <span style="font-size:0.75rem;color:var(--text-3);margin-left:6px;">${e.muscle}</span>
                </div>
                ${isAdded 
                    ? '<span style="font-size:0.75rem;color:var(--text-3);">Añadido</span>'
                    : '<button style="padding:4px 10px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:0.8rem;font-weight:600;">+ Añadir</button>'
                }
            </div>
        `;
    }).join('');
};

window._workoutSelectEx = (exerciseId) => {
    if (addExerciseToWorkout(exerciseId)) {
        const input = document.getElementById('workout-add-ex-input');
        if (input) input.value = '';
        const suggestionsEl = document.getElementById('workout-add-ex-suggestions');
        if (suggestionsEl) { suggestionsEl.innerHTML = ''; suggestionsEl.style.display = 'none'; }
        _renderExerciseList();
        _updateKcalDisplay();
    }
};

function _renderExerciseList() {
    const container = document.getElementById('workout-exercises-list');
    if (!container) return;
    const workout = getTodayWorkout();
    if (!workout || workout.exercises.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:20px;font-size:0.9rem;">Sin ejercicios. Añade uno arriba.</div>`;
        return;
    }

    container.innerHTML = workout.exercises.map(ex => {
        const prevPerf = getPreviousExercisePerformance(ex.exerciseId);
        const bestSet = ex.sets.reduce((b, s) => {
            const val = (parseFloat(s.kg) || 0) * (parseInt(s.reps) || 0);
            const bVal = (parseFloat(b.kg) || 0) * (parseInt(b.reps) || 0);
            return val > bVal ? s : b;
        }, { kg: 0, reps: 0 });
        const est1RM = calculate1RM(bestSet.kg, bestSet.reps);

        return `
        <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;margin-bottom:10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:8px;">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:600;color:var(--text-1);font-size:1rem;">${ex.name}</span>
                        <span style="font-size:0.75rem;color:var(--text-2);background:var(--bg-elevated);padding:2px 8px;border-radius:20px;">${ex.muscle}</span>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-3);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;">
                        <span id="1rm-badge-${ex.exerciseId}">${est1RM > 0 ? `1RM est: <strong style="color:#10B981;">${est1RM} kg</strong>` : ''}</span>
                        ${prevPerf ? `<span>Anterior (${prevPerf.date}): <strong style="color:#60A5FA;">${prevPerf.setsText}</strong></span>` : ''}
                    </div>
                </div>
                <button onclick="window._workoutRemoveEx('${ex.exerciseId}')" title="Eliminar ejercicio"
                    style="padding:4px 8px;background:rgba(248,113,113,0.1);color:#F87171;border:1px solid rgba(248,113,113,0.3);border-radius:6px;cursor:pointer;font-size:0.8rem;">
                    <span class="material-icons" style="font-size:14px;vertical-align:middle;">close</span>
                </button>
            </div>

            <!-- Cabecera series -->
            <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;margin-bottom:6px;color:var(--text-3);font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em;padding:0 2px;">
                <span>#</span><span>Reps</span><span>Kg</span><span></span>
            </div>
            ${ex.sets.map((set, i) => {
                const isDone = !!set.done;
                return `
                <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px;padding:4px 6px;border-radius:8px;background:${isDone ? 'rgba(16,185,129,0.12)' : 'var(--bg-elevated)'};border:1px solid ${isDone ? 'rgba(16,185,129,0.35)' : 'var(--border-base)'};transition:.2s;">
                    <span style="color:${isDone ? 'var(--primary-text)' : 'var(--text-3)'};font-size:0.85rem;font-weight:700;text-align:center;">${i + 1}</span>
                    <input type="number" value="${set.reps}" min="1" max="100"
                        oninput="window._workoutUpdateSet('${ex.exerciseId}',${i},'reps',this.value)"
                        style="padding:5px 6px;background:${isDone ? 'rgba(6,9,15,0.4)' : 'var(--bg-card)'};border:1px solid var(--border-base);border-radius:6px;color:var(--text-1);font-size:0.9rem;outline:none;text-align:center;width:100%;">
                    <input type="number" value="${set.kg}" min="0" step="0.5"
                        oninput="window._workoutUpdateSet('${ex.exerciseId}',${i},'kg',this.value)"
                        style="padding:5px 6px;background:${isDone ? 'rgba(6,9,15,0.4)' : 'var(--bg-card)'};border:1px solid var(--border-base);border-radius:6px;color:var(--text-1);font-size:0.9rem;outline:none;text-align:center;width:100%;">
                    <div style="display:flex;gap:4px;">
                        <button onclick="window._workoutToggleSetDone('${ex.exerciseId}',${i})" title="${isDone ? 'Completado' : 'Marcar completado'}"
                            style="padding:4px 6px;background:${isDone ? 'var(--primary)' : 'var(--bg-card)'};color:${isDone ? '#FFF' : 'var(--text-2)'};border:1px solid ${isDone ? 'var(--primary)' : 'var(--border-base)'};border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                            <span class="material-icons" style="font-size:15px;">${isDone ? 'check_circle' : 'check'}</span>
                        </button>
                        <button onclick="startRestTimer(90)" title="Iniciar descanso 90s"
                            style="padding:4px 6px;background:var(--bg-card);color:var(--primary);border:1px solid var(--border-base);border-radius:6px;cursor:pointer;display:flex;align-items:center;">
                            <span class="material-icons" style="font-size:15px;">timer</span>
                        </button>
                        <button onclick="window._workoutRemoveSet('${ex.exerciseId}',${i})" title="Eliminar serie"
                            style="padding:4px 6px;background:transparent;color:var(--text-3);border:1px solid var(--border-dim);border-radius:6px;cursor:pointer;display:flex;align-items:center;">
                            <span class="material-icons" style="font-size:15px;">remove</span>
                        </button>
                    </div>
                </div>
                `;
            }).join('')}
            <button onclick="window._workoutAddSet('${ex.exerciseId}')"
                style="margin-top:8px;padding:5px 12px;background:transparent;color:var(--text-2);border:1px dashed var(--border-base);border-radius:6px;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:4px;">
                <span class="material-icons" style="font-size:14px;">add</span> Añadir serie
            </button>
        </div>
        `;
    }).join('');

    window._workoutRemoveEx = (id) => { removeExerciseFromWorkout(id); _renderExerciseList(); _updateKcalDisplay(); };
    window._workoutAddSet = (id) => { addSetToExercise(id); _renderExerciseList(); _updateKcalDisplay(); };
    window._workoutRemoveSet = (id, i) => { removeSetFromExercise(id, i); _renderExerciseList(); _updateKcalDisplay(); };
    window._workoutUpdateSet = (id, i, field, val) => {
        updateSet(id, i, field, val);
        _updateKcalDisplay();
        _update1RMDisplay(id);
    };
    window._workoutToggleSetDone = (id, i) => {
        const isDone = toggleSetDone(id, i);
        if (isDone) {
            startRestTimer(90);
        }
        _renderExerciseList();
        _updateKcalDisplay();
    };
}

function _update1RMDisplay(exerciseId) {
    const workout = getTodayWorkout();
    if (!workout) return;
    const ex = workout.exercises.find(e => e.exerciseId == exerciseId);
    if (!ex) return;
    const bestSet = ex.sets.reduce((b, s) => {
        const val = (parseFloat(s.kg) || 0) * (parseInt(s.reps) || 0);
        const bVal = (parseFloat(b.kg) || 0) * (parseInt(b.reps) || 0);
        return val > bVal ? s : b;
    }, { kg: 0, reps: 0 });
    const est1RM = calculate1RM(bestSet.kg, bestSet.reps);
    const badge = document.getElementById(`1rm-badge-${exerciseId}`);
    if (badge) {
        badge.innerHTML = est1RM > 0 ? `1RM est: <strong style="color:#10B981;">${est1RM} kg</strong>` : '';
    }
}

function _updateKcalDisplay() {
    const workout = getTodayWorkout();
    const el = document.querySelector('#sport-entreno-hoy [style*="1.4rem"]');
    if (!el || !workout) return;
    const kcal = estimateWorkoutKcal(workout);
    el.textContent = kcal > 0 ? kcal : '—';

    // Sincronizar en tiempo real los objetivos de la pantalla principal
    import('../meals.js').then(m => {
        const dateKey = getDateKey(AppState.currentDate);
        if (AppState.allDays[dateKey]) m.updateDaySummary(AppState.allDays[dateKey]);
    });
    import('../config-settings.js').then(m => m.updateHeaderInfo());
}

// ─── Base de datos de ejercicios ──────────────────────────────────────────────
let _muscleFilter = 'Todos';
let _exSearch = '';
let _exPage = 0;
const _exPageSize = 20;

export function renderExercisesDB(fullReset = false) {
    const container = document.getElementById('sport-ejercicios');
    if (!container) return;

    const cardsContainer = document.getElementById('ex-list-cards-container');

    if (!cardsContainer || fullReset) {
        const allEx = getExercisesDB();
        container.innerHTML = `
            <div class="max-w-3xl mx-auto">
                <!-- Barra Superior y Crear Ejercicio -->
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
                    <div style="font-size:1rem;font-weight:700;color:var(--text-1);" id="ex-db-total-count">Base de Ejercicios (${allEx.length})</div>
                    <button onclick="window._promptCreateCustomExercise()"
                        style="padding:7px 14px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:4px;">
                        <span class="material-icons" style="font-size:16px;">add</span> Crear Ejercicio
                    </button>
                </div>

                <!-- Filtros y Búsqueda Nube -->
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
                    <div style="display:flex;gap:8px;">
                        <div style="position:relative;flex:1;">
                            <span class="material-icons" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:18px;">search</span>
                            <input id="ex-local-search-input" type="text" placeholder="Buscar ejercicio local..." value="${_exSearch}"
                                oninput="window._exSearch(this.value)"
                                style="width:100%;padding:8px 12px 8px 36px;background:var(--bg-card);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;box-sizing:border-box;">
                        </div>
                        <button onclick="window._searchCloudExercises()"
                            style="padding:8px 14px;background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;white-space:nowrap;display:flex;align-items:center;gap:4px;">
                            <span class="material-icons" style="font-size:16px;">cloud_search</span>
                            <span>Buscar Nube (Wger)</span>
                        </button>
                    </div>
                    <div id="wger-cloud-results"></div>
                    <div id="ex-muscle-pills-container" style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${_renderMusclePillsHTML()}
                    </div>
                </div>

                <!-- Lista de Tarjetas de Ejercicios y Paginación -->
                <div id="ex-list-cards-container"></div>
            </div>
        `;
    }

    _updateExercisesCardsHTML();
}

function _renderMusclePillsHTML() {
    return MUSCLES.map(m => `
        <button onclick="window._exFilter('${m}')"
            style="padding:5px 12px;border-radius:20px;border:1px solid ${_muscleFilter === m ? 'var(--primary)' : 'var(--border-base)'};background:${_muscleFilter === m ? 'var(--primary-dim)' : 'transparent'};color:${_muscleFilter === m ? 'var(--primary-text)' : 'var(--text-2)'};cursor:pointer;font-size:0.82rem;transition:.15s;">
            ${m}
        </button>
    `).join('');
}

function _updateExercisesCardsHTML() {
    const cardsContainer = document.getElementById('ex-list-cards-container');
    if (!cardsContainer) return;

    const prs = getExercisePRs();
    const allEx = getExercisesDB();

    const totalCountEl = document.getElementById('ex-db-total-count');
    if (totalCountEl) totalCountEl.textContent = `Base de Ejercicios (${allEx.length})`;

    const filtered = allEx.filter(e => {
        const matchMuscle = _muscleFilter === 'Todos' || e.muscle === _muscleFilter;
        const matchSearch = !_exSearch || e.name.toLowerCase().includes(_exSearch);
        return matchMuscle && matchSearch;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / _exPageSize));
    if (_exPage >= totalPages) _exPage = totalPages - 1;
    const paginated = filtered.slice(_exPage * _exPageSize, (_exPage + 1) * _exPageSize);
    const start = filtered.length === 0 ? 0 : _exPage * _exPageSize + 1;
    const end = Math.min((_exPage + 1) * _exPageSize, filtered.length);

    cardsContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${paginated.map(e => {
                const pr = prs[e.id];
                const equipInfo = EQUIPMENT_TYPES[e.type] || { label: e.type, color: '#6B7280' };
                return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-base);border-left:3px solid ${equipInfo.color};border-radius:8px;gap:12px;">
                    <div style="flex:1;">
                        <div style="font-weight:600;color:var(--text-1);margin-bottom:3px;">
                            ${e.name} ${e.isCustom ? '<span style="font-size:0.68rem;color:#FBBF24;background:rgba(251,191,36,0.15);padding:1px 6px;border-radius:4px;margin-left:4px;">Personalizado</span>' : ''}
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <span style="font-size:0.75rem;color:${equipInfo.color};background:rgba(0,0,0,0.2);padding:1px 7px;border-radius:20px;">${equipInfo.label}</span>
                            <span style="font-size:0.75rem;color:var(--text-3);">${e.muscle} · ${e.category || 'aislamiento'}</span>
                        </div>
                    </div>
                    ${pr ? `
                    <div style="text-align:right;min-width:80px;">
                        <div style="font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;">PR</div>
                        <div style="font-size:1rem;font-weight:700;color:#FBBF24;">${pr.maxWeight} kg</div>
                        <div style="font-size:0.72rem;color:var(--text-3);">${pr.reps} reps · ${pr.date}</div>
                    </div>` : `<div style="min-width:80px;text-align:right;color:var(--text-3);font-size:0.8rem;">Sin PR</div>`}
                </div>`;
            }).join('')}
            ${filtered.length === 0 ? '<div style="text-align:center;color:var(--text-3);padding:30px;">Sin resultados locales para "' + _exSearch + '"</div>' : ''}
        </div>

        <!-- Paginación -->
        ${totalPages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:10px 0;">
            <button onclick="window._exGoPage(${_exPage - 1})" ${_exPage === 0 ? 'disabled' : ''}
                style="display:flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:1px solid var(--border-base);background:${_exPage === 0 ? 'transparent' : 'var(--bg-card)'};color:${_exPage === 0 ? 'var(--text-3)' : 'var(--text-2)'};cursor:${_exPage === 0 ? 'default' : 'pointer'};font-size:0.85rem;">
                <span class="material-icons" style="font-size:16px;">chevron_left</span> Anterior
            </button>
            <span style="font-size:0.82rem;color:var(--text-2);">
                ${start}–${end} <span style="color:var(--text-3);">de ${filtered.length}</span>
                &nbsp;·&nbsp; Pág. ${_exPage + 1}/${totalPages}
            </span>
            <button onclick="window._exGoPage(${_exPage + 1})" ${_exPage >= totalPages - 1 ? 'disabled' : ''}
                style="display:flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:1px solid var(--border-base);background:${_exPage >= totalPages - 1 ? 'transparent' : 'var(--bg-card)'};color:${_exPage >= totalPages - 1 ? 'var(--text-3)' : 'var(--text-2)'};cursor:${_exPage >= totalPages - 1 ? 'default' : 'pointer'};font-size:0.85rem;">
                Siguiente <span class="material-icons" style="font-size:16px;">chevron_right</span>
            </button>
        </div>` : `
        <div style="text-align:center;margin-top:12px;font-size:0.8rem;color:var(--text-3);">${filtered.length} ejercicio${filtered.length !== 1 ? 's' : ''}</div>`}
    `;

    const pillsContainer = document.getElementById('ex-muscle-pills-container');
    if (pillsContainer) pillsContainer.innerHTML = _renderMusclePillsHTML();
}

window._exFilter = (m) => { _muscleFilter = m; _exPage = 0; _updateExercisesCardsHTML(); };
window._exSearch = (v) => { _exSearch = v.toLowerCase(); _exPage = 0; _updateExercisesCardsHTML(); };
window._exGoPage = (p) => { _exPage = p; _updateExercisesCardsHTML(); document.getElementById('sport-ejercicios').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

window._promptCreateCustomExercise = function () {
    const name = prompt('Nombre del nuevo ejercicio (ej: Press Inclinado con Cadenas):');
    if (!name || !name.trim()) return;

    const musclePrompt = prompt(`Grupo muscular (${MUSCLES.filter(m => m !== 'Todos').join(', ')}):`, 'Pecho');
    const muscle = MUSCLES.includes(musclePrompt) ? musclePrompt : 'Pecho';

    const typePrompt = prompt('Tipo/Equipamiento (libre, maquina, polea, cuerpo, kettlebell, cardio):', 'libre');
    const type = EQUIPMENT_TYPES[typePrompt] ? typePrompt : 'libre';

    const categoryPrompt = prompt('Categoría (compuesto o aislamiento):', 'compuesto');
    const category = categoryPrompt === 'compuesto' ? 'compuesto' : 'aislamiento';

    saveCustomExercise({ name, muscle, type, category, met: category === 'compuesto' ? 6.0 : 4.0 });
    renderExercisesDB(true);
};

window._searchCloudExercises = async function () {
    const input = document.getElementById('ex-local-search-input');
    const query = input?.value?.trim() || _exSearch;
    if (!query || query.length < 2) {
        import('./notifications.js').then(m => m.showNotification('Escribe al menos 2 letras en el buscador', 'warning'));
        return;
    }

    const container = document.getElementById('wger-cloud-results');
    if (container) container.innerHTML = '<div style="color:var(--text-2);padding:10px;font-size:0.85rem;display:flex;align-items:center;gap:6px;"><span class="material-icons" style="font-size:16px;">cloud_sync</span> Consultando Wger API en la nube...</div>';

    const { searchWgerExercises } = await import('../workout.js?v=501');
    const results = await searchWgerExercises(query);

    if (!container) return;

    if (!results || results.length === 0) {
        container.innerHTML = `<div style="color:var(--text-3);padding:10px;font-size:0.85rem;">No se encontraron resultados en Wger para "${query}". Intenta con un término general (ej: press, squat, curl, bench).</div>`;
        return;
    }

    container.innerHTML = `
        <div style="font-size:0.82rem;font-weight:700;color:#38BDF8;margin-bottom:8px;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;">
            <span>Resultados Wger API Nube (${results.length})</span>
            <button onclick="document.getElementById('wger-cloud-results').innerHTML=''" style="background:transparent;border:none;color:var(--text-3);cursor:pointer;font-size:1.1rem;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;padding-right:4px;">
            ${results.map(r => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:8px;gap:10px;">
                    <div style="flex:1;">
                        <div style="font-weight:600;color:var(--text-1);font-size:0.9rem;">${r.name}</div>
                        <div style="font-size:0.75rem;color:var(--text-3);">${r.muscle} ${r.equipmentName ? '· ' + r.equipmentName : ''}</div>
                    </div>
                    <button onclick="window._importWgerExercise('${r.name.replace(/'/g, "\\'")}', '${r.muscle}', '${r.type}')"
                        style="padding:5px 10px;background:#38BDF8;color:#0F172A;border:none;border-radius:6px;font-weight:700;font-size:0.78rem;cursor:pointer;white-space:nowrap;">
                        + Añadir
                    </button>
                </div>
            `).join('')}
        </div>
    `;
};

window._importWgerExercise = function (name, muscle, type = 'libre') {
    saveCustomExercise({ name, muscle, type, category: 'compuesto', met: 5.0 });
    renderExercisesDB(true);
};

// ─── Historial de entrenos ────────────────────────────────────────────────────
export function renderWorkoutHistory() {
    const container = document.getElementById('sport-historial-entrenos');
    if (!container) return;

    const sessions = getWorkoutSessions();
    const dates = Object.keys(sessions).sort().reverse();

    if (dates.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:40px;font-size:0.9rem;">Sin entrenos registrados todavía.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-4">
            ${dates.map(date => {
                const s = sessions[date];
                const exCount = s.exercises?.length || 0;
                const totalSets = s.exercises?.reduce((t, e) => t + e.sets.length, 0) || 0;
                const kcal = s.estimatedKcal || 0;

                return `
                <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;overflow:hidden;">
                    <div style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;user-select:none;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                        <div>
                            <div style="font-weight:600;color:var(--text-1);">${date}</div>
                            <div style="font-size:0.8rem;color:var(--text-2);">${exCount} ejercicios · ${totalSets} series · ${s.duration || 0} min</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.75rem;color:var(--text-3);">Kcal</div>
                            <div style="font-size:1.1rem;font-weight:700;color:var(--primary-text);">${kcal || '—'}</div>
                        </div>
                    </div>
                    <div style="display:none;padding:0 18px 14px;border-top:1px solid var(--border-dim);">
                        ${s.exercises?.map(ex => `
                            <div style="padding:8px 0;border-bottom:1px solid var(--border-dim);">
                                <div style="font-size:0.85rem;font-weight:600;color:var(--text-1);margin-bottom:4px;">${ex.name}</div>
                                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                    ${ex.sets.map((set, i) => `
                                        <span style="font-size:0.78rem;color:var(--text-2);background:var(--bg-elevated);padding:2px 8px;border-radius:6px;">
                                            ${i + 1}: ${set.reps}×${set.kg}kg
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('') || ''}
                        ${s.notes ? `<div style="margin-top:8px;font-size:0.82rem;color:var(--text-2);font-style:italic;">"${s.notes}"</div>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}
