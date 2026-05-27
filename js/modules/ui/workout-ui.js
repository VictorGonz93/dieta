// ==================== UI DE DEPORTE ====================

import {
    EXERCISES_DB, MUSCLES,
    initTodayWorkout, getTodayWorkout,
    addExerciseToWorkout, removeExerciseFromWorkout,
    addSetToExercise, removeSetFromExercise, updateSet,
    setWorkoutDuration, setWorkoutNotes,
    finalizeWorkout, estimateWorkoutKcal,
    getWorkoutSessions, getExercisePRs,
} from '../workout.js?v=491';
import { getDateKey } from '../storage.js';
import AppState from '../state.js';

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
    const workout = getTodayWorkout();

    const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][AppState.currentDate.getDay()];
    const routine = AppState.config.customGymRoutine || {};
    const dayPlan = routine[dayName];
    const planLabel = dayPlan?.label || (dayPlan?.type === 'entreno' ? 'Entrenamiento' : 'Descanso');
    const kcalEst = estimateWorkoutKcal(workout);

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

            <!-- Añadir ejercicio -->
            <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;">
                <div style="font-size:0.85rem;font-weight:600;color:var(--text-2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em;">Añadir ejercicio</div>
                <div style="display:flex;gap:8px;">
                    <select id="workout-ex-select" style="flex:1;padding:8px 12px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;">
                        <option value="">Selecciona ejercicio...</option>
                        ${MUSCLES.filter(m => m !== 'Todos').map(muscle => `
                            <optgroup label="${muscle}">
                                ${EXERCISES_DB.filter(e => e.muscle === muscle).map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                            </optgroup>
                        `).join('')}
                    </select>
                    <button onclick="window._workoutAddEx()" style="padding:8px 16px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;">
                        <span class="material-icons" style="font-size:18px;vertical-align:middle;">add</span>
                    </button>
                </div>
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
        const sel = document.getElementById('workout-ex-select');
        const id = parseInt(sel?.value);
        if (!id) return;
        addExerciseToWorkout(id);
        sel.value = '';
        _renderExerciseList();
        _updateKcalDisplay();
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
}

function _renderExerciseList() {
    const container = document.getElementById('workout-exercises-list');
    if (!container) return;
    const workout = getTodayWorkout();
    if (!workout || workout.exercises.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:20px;font-size:0.9rem;">Sin ejercicios. Añade uno arriba.</div>`;
        return;
    }

    container.innerHTML = workout.exercises.map(ex => `
        <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:16px 20px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div>
                    <span style="font-weight:600;color:var(--text-1);">${ex.name}</span>
                    <span style="font-size:0.75rem;color:var(--text-2);margin-left:8px;background:var(--bg-elevated);padding:2px 8px;border-radius:20px;">${ex.muscle}</span>
                </div>
                <button onclick="window._workoutRemoveEx(${ex.exerciseId})"
                    style="padding:4px 8px;background:rgba(248,113,113,0.1);color:#F87171;border:1px solid rgba(248,113,113,0.3);border-radius:6px;cursor:pointer;font-size:0.8rem;">
                    <span class="material-icons" style="font-size:14px;vertical-align:middle;">close</span>
                </button>
            </div>
            <!-- Cabecera series -->
            <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;margin-bottom:6px;color:var(--text-3);font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em;padding:0 2px;">
                <span>#</span><span>Reps</span><span>Kg</span><span></span>
            </div>
            ${ex.sets.map((set, i) => `
                <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:4px;">
                    <span style="color:var(--text-3);font-size:0.85rem;text-align:center;">${i + 1}</span>
                    <input type="number" value="${set.reps}" min="1" max="100"
                        onchange="window._workoutUpdateSet(${ex.exerciseId},${i},'reps',this.value)"
                        style="padding:5px 8px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:6px;color:var(--text-1);font-size:0.9rem;outline:none;text-align:center;width:100%;">
                    <input type="number" value="${set.kg}" min="0" step="0.5"
                        onchange="window._workoutUpdateSet(${ex.exerciseId},${i},'kg',this.value)"
                        style="padding:5px 8px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:6px;color:var(--text-1);font-size:0.9rem;outline:none;text-align:center;width:100%;">
                    <button onclick="window._workoutRemoveSet(${ex.exerciseId},${i})"
                        style="padding:4px 6px;background:transparent;color:var(--text-3);border:1px solid var(--border-dim);border-radius:6px;cursor:pointer;display:flex;align-items:center;">
                        <span class="material-icons" style="font-size:14px;">remove</span>
                    </button>
                </div>
            `).join('')}
            <button onclick="window._workoutAddSet(${ex.exerciseId})"
                style="margin-top:8px;padding:5px 12px;background:transparent;color:var(--text-2);border:1px dashed var(--border-base);border-radius:6px;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:4px;">
                <span class="material-icons" style="font-size:14px;">add</span> Añadir serie
            </button>
        </div>
    `).join('');

    window._workoutRemoveEx = (id) => { removeExerciseFromWorkout(id); _renderExerciseList(); _updateKcalDisplay(); };
    window._workoutAddSet = (id) => { addSetToExercise(id); _renderExerciseList(); };
    window._workoutRemoveSet = (id, i) => { removeSetFromExercise(id, i); _renderExerciseList(); };
    window._workoutUpdateSet = (id, i, field, val) => { updateSet(id, i, field, val); _updateKcalDisplay(); };
}

function _updateKcalDisplay() {
    const workout = getTodayWorkout();
    const el = document.querySelector('#sport-entreno-hoy [style*="1.4rem"]');
    if (!el || !workout) return;
    const kcal = estimateWorkoutKcal(workout);
    el.textContent = kcal > 0 ? kcal : '—';
}

// ─── Base de datos de ejercicios ──────────────────────────────────────────────
let _muscleFilter = 'Todos';
let _exSearch = '';
let _exPage = 0;
const _exPageSize = 20;

export function renderExercisesDB() {
    const container = document.getElementById('sport-ejercicios');
    if (!container) return;

    const prs = getExercisePRs();
    const typeColors = { libre: '#60A5FA', maquina: '#A78BFA', cuerpo: '#34D399', cardio: '#FBBF24' };
    const typeLabels = { libre: 'Libre', maquina: 'Máquina', cuerpo: 'Cuerpo', cardio: 'Cardio' };

    const filtered = EXERCISES_DB.filter(e => {
        const matchMuscle = _muscleFilter === 'Todos' || e.muscle === _muscleFilter;
        const matchSearch = !_exSearch || e.name.toLowerCase().includes(_exSearch);
        return matchMuscle && matchSearch;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / _exPageSize));
    if (_exPage >= totalPages) _exPage = totalPages - 1;
    const paginated = filtered.slice(_exPage * _exPageSize, (_exPage + 1) * _exPageSize);
    const start = filtered.length === 0 ? 0 : _exPage * _exPageSize + 1;
    const end = Math.min((_exPage + 1) * _exPageSize, filtered.length);

    container.innerHTML = `
        <div class="max-w-3xl mx-auto">
            <!-- Filtros -->
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
                <div style="position:relative;">
                    <span class="material-icons" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:18px;">search</span>
                    <input type="text" placeholder="Buscar ejercicio..." value="${_exSearch}"
                        oninput="window._exSearch(this.value)"
                        style="width:100%;padding:8px 12px 8px 36px;background:var(--bg-card);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.9rem;outline:none;box-sizing:border-box;">
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${MUSCLES.map(m => `
                        <button onclick="window._exFilter('${m}')"
                            style="padding:5px 12px;border-radius:20px;border:1px solid ${_muscleFilter === m ? 'var(--primary)' : 'var(--border-base)'};background:${_muscleFilter === m ? 'var(--primary-dim)' : 'transparent'};color:${_muscleFilter === m ? 'var(--primary-text)' : 'var(--text-2)'};cursor:pointer;font-size:0.82rem;transition:.15s;">
                            ${m}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Lista -->
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${paginated.map(e => {
                    const pr = prs[e.id];
                    return `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-base);border-left:3px solid ${typeColors[e.type] || '#6B7280'};border-radius:8px;gap:12px;">
                        <div style="flex:1;">
                            <div style="font-weight:600;color:var(--text-1);margin-bottom:3px;">${e.name}</div>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                <span style="font-size:0.75rem;color:${typeColors[e.type]};background:rgba(0,0,0,0.2);padding:1px 7px;border-radius:20px;">${typeLabels[e.type]}</span>
                                <span style="font-size:0.75rem;color:var(--text-3);">${e.muscle}</span>
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
                ${filtered.length === 0 ? '<div style="text-align:center;color:var(--text-3);padding:30px;">Sin resultados</div>' : ''}
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
        </div>
    `;

    window._exFilter = (m) => { _muscleFilter = m; _exPage = 0; renderExercisesDB(); };
    window._exSearch = (v) => { _exSearch = v.toLowerCase(); _exPage = 0; renderExercisesDB(); };
    window._exGoPage = (p) => { _exPage = p; renderExercisesDB(); document.getElementById('sport-ejercicios').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}

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
