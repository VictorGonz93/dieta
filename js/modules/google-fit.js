// ==================== SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE FIT ====================

import AppState from './state.js';
import { getDateKey } from './storage.js';
import { getTodayWorkout, estimateWorkoutKcal, getWorkoutSessions, getExercisesDB } from './workout.js';
import { showNotification } from './ui/notifications.js';

const GOOGLE_FIT_SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
const DEFAULT_CLIENT_ID = '188472915937-i8jb9ericnjehqut53q6j67q6detusk1.apps.googleusercontent.com';

let tokenClient = null;
let syncInterval = null;

/**
 * Obtiene las credenciales guardadas
 */
function getFitCredentials() {
    return {
        accessToken: localStorage.getItem('gfit_access_token'),
        expiresAt: parseInt(localStorage.getItem('gfit_expires_at') || '0', 10),
        clientId: localStorage.getItem('gfit_client_id') || DEFAULT_CLIENT_ID,
        autoSync: localStorage.getItem('gfit_auto_sync') === 'true'
    };
}

/**
 * Guarda las credenciales de Google Fit
 */
function saveFitCredentials(accessToken, expiresInSeconds, clientId = null) {
    const expiresAt = Date.now() + (expiresInSeconds * 1000) - 60000; // 1 min buffer
    localStorage.setItem('gfit_access_token', accessToken);
    localStorage.setItem('gfit_expires_at', expiresAt.toString());
    if (clientId) localStorage.setItem('gfit_client_id', clientId);
    localStorage.setItem('gfit_auto_sync', 'true');
}

/**
 * Elimina la conexión con Google Fit
 */
export function disconnectGoogleFit() {
    localStorage.removeItem('gfit_access_token');
    localStorage.removeItem('gfit_expires_at');
    localStorage.setItem('gfit_auto_sync', 'false');
    if (syncInterval) clearInterval(syncInterval);
    showNotification('Conexión con Google Fit desactivada');
    renderGoogleFitStatusUI();
}

/**
 * Comprueba si hay un token válido
 */
export function isGoogleFitConnected() {
    const creds = getFitCredentials();
    return !!(creds.accessToken && creds.expiresAt > Date.now());
}

/**
 * Renueva el token silenciosamente sin popup (prompt: 'none')
 */
function silentTokenRefresh() {
    return new Promise((resolve, reject) => {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            reject(new Error('Google library not loaded'));
            return;
        }

        const client = google.accounts.oauth2.initTokenClient({
            client_id: DEFAULT_CLIENT_ID,
            scope: GOOGLE_FIT_SCOPE,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    saveFitCredentials(tokenResponse.access_token, tokenResponse.expires_in, DEFAULT_CLIENT_ID);
                    resolve(tokenResponse.access_token);
                } else {
                    reject(new Error('No token in silent refresh response'));
                }
            },
            error_callback: (err) => {
                reject(err);
            }
        });

        client.requestAccessToken({ prompt: 'none' });
    });
}

/**
 * Inicia el proceso de autenticación con Google Identity Services
 * @param {boolean} silent - Si true, intenta renovar sin popup (prompt: 'none')
 */
export function connectGoogleFit(silent = false) {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showNotification('Cargando librería de Google... Reintenta en unos segundos.', 'warning');
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: DEFAULT_CLIENT_ID,
            scope: GOOGLE_FIT_SCOPE,
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    console.log('[GoogleFit] Token obtenido correctamente, guardando...');
                    saveFitCredentials(tokenResponse.access_token, tokenResponse.expires_in, DEFAULT_CLIENT_ID);
                    if (!silent) {
                        showNotification('✅ ¡Conectado con Google Fit! Sincronizando pasos...', 'success');
                    }
                    renderGoogleFitStatusUI();
                    const syncResult = await syncTodayStepsFromGoogleFit(!silent);
                    console.log('[GoogleFit] Sync post-conexión resultado:', syncResult);
                    if (!syncResult && !silent) {
                        showNotification('Conectado, pero no se pudieron obtener los pasos. Haz clic en Sincronizar.', 'warning');
                    }
                } else if (!silent) {
                    showNotification('No se pudo completar la conexión con Google. Revisa tu cuenta.', 'error');
                }
            },
            error_callback: (err) => {
                console.error('Error Google OAuth:', err);
                if (!silent) {
                    showNotification('Error de autorización con Google', 'error');
                }
            }
        });

        tokenClient.requestAccessToken({ prompt: silent ? 'none' : 'consent' });
    } catch (err) {
        console.error('Exception Google Fit:', err);
        if (!silent) {
            showNotification('Error al iniciar Google Fit: ' + (err.message || err), 'error');
        }
    }
}

/**
 * Consulta la API REST de Google Fit para obtener los pasos totales de hoy
 */
export async function fetchTodayStepsFromGoogleFit() {
    const creds = getFitCredentials();
    console.log('[GoogleFit] fetchSteps: token exists?', !!creds.accessToken, 'expiresAt:', new Date(creds.expiresAt).toISOString(), 'now:', new Date().toISOString());
    if (!creds.accessToken) {
        console.warn('[GoogleFit] No hay token de acceso guardado');
        return null;
    }

    if (Date.now() >= creds.expiresAt) {
        console.log('[GoogleFit] Token expirado. Intentando refresh silencioso...');
        if (creds.autoSync && window.google?.accounts?.oauth2) {
            try {
                await silentTokenRefresh();
                const freshCreds = getFitCredentials();
                if (!freshCreds.accessToken || Date.now() >= freshCreds.expiresAt) {
                    console.warn('[GoogleFit] Refresh falló, token sigue expirado');
                    return null;
                }
                console.log('[GoogleFit] Refresh silencioso exitoso');
            } catch (e) {
                console.warn('[GoogleFit] Refresh silencioso falló:', e);
                showNotification('La conexión con Google Fit ha expirado. Reconecta desde la pestaña de entrenamiento.', 'warning');
                return null;
            }
        } else {
            console.warn('[GoogleFit] Token expirado y no se puede refrescar (autoSync:', creds.autoSync, ')');
            return null;
        }
    }

    // Timestamps de inicio del día de hoy a las 00:00:00 y ahora
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const startTimeMillis = startOfDay.getTime();
    const endTimeMillis = now.getTime();

    const requestBody = {
        aggregateBy: [{
            dataTypeName: 'com.google.step_count.delta'
        }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: startTimeMillis,
        endTimeMillis: endTimeMillis
    };

    try {
        const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${creds.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'no body');
            console.error(`[GoogleFit] API error ${response.status}:`, errorBody);
            if (response.status === 401) {
                console.warn('[GoogleFit] Token denegado o expirado (401)');
                localStorage.removeItem('gfit_access_token');
                localStorage.removeItem('gfit_expires_at');
                showNotification('La conexión con Google Fit ha expirado. Reconecta desde la pestaña de entrenamiento.', 'warning');
                renderGoogleFitStatusUI();
            } else if (response.status === 403) {
                showNotification('Google Fit: permisos insuficientes. Revisa los permisos en tu cuenta de Google.', 'warning');
            }
            throw new Error(`Google Fit API error ${response.status}`);
        }

        const data = await response.json();
        let totalSteps = 0;

        if (data && data.bucket) {
            data.bucket.forEach(bucket => {
                if (bucket.dataset) {
                    bucket.dataset.forEach(dataset => {
                        if (dataset.point) {
                            dataset.point.forEach(point => {
                                if (point.value) {
                                    point.value.forEach(val => {
                                        totalSteps += (val.intVal || val.fpVal || 0);
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        console.log('[GoogleFit] API response OK. Total pasos:', totalSteps);
        if (totalSteps === 0) {
            console.log('[GoogleFit] Sin datos de pasos en Google Fit para hoy. Asegúrate de que Google Fit esté instalado y sincronizando en tu móvil.');
        }
        return totalSteps > 0 ? Math.round(totalSteps) : null;
    } catch (err) {
        console.error('[GoogleFit] Error obteniendo pasos:', err.message || err);
        return null;
    }
}

/**
 * Sincroniza los pasos obtenidos de Google Fit en la sesión de entreno de hoy
 */
export async function syncTodayStepsFromGoogleFit(showToast = false) {
    console.log('[GoogleFit] syncTodaySteps called, showToast:', showToast);
    const steps = await fetchTodayStepsFromGoogleFit();
    console.log('[GoogleFit] steps result:', steps);
    if (steps === null || steps === undefined) {
        if (showToast) {
            showNotification('No se pudieron obtener los pasos de Google Fit. Revisa la consola para más detalles.', 'warning');
        }
        return false;
    }

    const dateKey = getDateKey(AppState.currentDate);
    const sessions = getWorkoutSessions();
    let session = sessions[dateKey];

    if (!session) {
        session = { date: dateKey, exercises: [], duration: 60, notes: '', finalized: false };
        sessions[dateKey] = session;
    }

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

    let exInSession = session.exercises.find(e => e.exerciseId == stepsExDB.id || (e.name && e.name.toLowerCase().includes('pasos')));

    if (exInSession) {
        exInSession.sets = [{ steps: steps, done: true }];
    } else {
        session.exercises.push({
            exerciseId: stepsExDB.id,
            name: stepsExDB.name,
            muscle: stepsExDB.muscle,
            type: stepsExDB.type,
            category: stepsExDB.category,
            trackingType: 'steps',
            sets: [{ steps: steps, done: true }]
        });
    }

    // Recalcular gasto calórico de la sesión
    session.estimatedKcal = estimateWorkoutKcal(session);
    sessions[dateKey] = session;
    localStorage.setItem('workoutSessions', JSON.stringify(sessions));

    // Actualizar UI
    import('./meals.js').then(m => {
        if (AppState.allDays[dateKey]) m.updateDaySummary(AppState.allDays[dateKey]);
    });
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    import('./ui/workout-ui.js').then(m => {
        if (document.getElementById('sport-entreno-hoy')?.style.display !== 'none') {
            m.renderTodayWorkout();
        }
    });

    if (showToast) {
        showNotification(`👣 ${steps.toLocaleString('es-ES')} pasos sincronizados automáticamente de Google Fit`, 'success');
    }

    renderGoogleFitStatusUI(steps);
    return true;
}

export function renderGoogleFitStatusUI(lastSyncedSteps = null) {
    const container = document.getElementById('googleFitConfigContainer');
    if (!container) return;

    const connected = isGoogleFitConnected();

    if (connected) {
        const w = AppState.config.currentWeight || 75;
        const stepsForCalc = lastSyncedSteps || 0;
        const estKcal = stepsForCalc > 0 ? Math.round(3.8 * w * (stepsForCalc / 100 / 60)) : 0;

        container.innerHTML = `
            <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(16,185,129,0.2); display: flex; align-items: center; justify-content: center; color: #10B981;">
                        <span class="material-icons">directions_walk</span>
                    </div>
                    <div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #F8FAFC;">Google Fit Conectado</div>
                        <div style="font-size: 0.8rem; color: #94A3B8;">
                            ${lastSyncedSteps !== null ? `Pasos: <strong style="color:#10B981;">${lastSyncedSteps.toLocaleString('es-ES')}</strong>` : 'Sincronización automática activa'}
                            ${estKcal > 0 ? ` · <span style="color:#FBBF24;">≈${estKcal} kcal</span>` : ''}
                        </div>
                        ${lastSyncedSteps !== null ? `<div style="font-size:0.72rem;color:#64748B;margin-top:2px;">MET 3.8 × ${w}kg × (${lastSyncedSteps.toLocaleString('es-ES')}/100/60) = ${estKcal} kcal</div>` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window._manualSyncGoogleFit()" style="padding: 7px 14px; background: #10B981; color: #FFF; border: none; border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons" style="font-size: 15px;">sync</span> Sincronizar
                    </button>
                    <button onclick="window.disconnectGoogleFit()" style="padding: 7px 12px; background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">
                        Desconectar
                    </button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border-base); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(56,189,248,0.15); display: flex; align-items: center; justify-content: center; color: #38BDF8;">
                        <span class="material-icons" style="font-size: 24px;">directions_walk</span>
                    </div>
                    <div>
                        <div style="font-size: 1rem; font-weight: 700; color: #F8FAFC;">Pasos Automáticos con Google Fit</div>
                        <div style="font-size: 0.82rem; color: #94A3B8;">Sincroniza automáticamente los pasos contados por tu móvil/reloj para calcular el gasto calórico de forma transparente.</div>
                    </div>
                </div>
                
                <button onclick="window.connectGoogleFit()" style="align-self: flex-start; padding: 9px 20px; background: linear-gradient(135deg,#38BDF8,#0284C7); color: #FFF; border: none; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(2,132,199,0.3);">
                    <span class="material-icons" style="font-size: 18px;">cloud_sync</span>
                    Conectar con Google Fit
                </button>
            </div>
        `;
    }
}

/**
 * Inicia sincronización periódica en segundo plano cuando la app está activa
 */
export function initGoogleFitAutoSync() {
    const creds = getFitCredentials();
    if (creds.autoSync && isGoogleFitConnected()) {
        syncTodayStepsFromGoogleFit(false);

        // Re-sincronizar cada 10 minutos solo si token sigue válido
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
            if (isGoogleFitConnected()) {
                syncTodayStepsFromGoogleFit(false);
            }
        }, 10 * 60 * 1000);

        // Refrescar token silencioso cuando el usuario vuelve a la pestaña (funciona porque es interacción del usuario)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isGoogleFitConnected()) {
                const currentCreds = getFitCredentials();
                if (currentCreds.accessToken && Date.now() >= currentCreds.expiresAt) {
                    console.log('[GoogleFit] Token expirado al volver a la pestaña, intentando refresh...');
                    silentTokenRefresh().catch(() => {
                        console.warn('[GoogleFit] Refresh silencioso en visibility change falló');
                    });
                }
                syncTodayStepsFromGoogleFit(false);
            }
        });
    }
}

// Window Exposures
window.connectGoogleFit = connectGoogleFit;
window.disconnectGoogleFit = disconnectGoogleFit;
window._manualSyncGoogleFit = async () => {
    const creds = getFitCredentials();
    if (creds.accessToken && Date.now() >= creds.expiresAt) {
        showNotification('Refrescando conexión con Google Fit...', 'info');
        try {
            await silentTokenRefresh();
        } catch (e) {
            showNotification('Token expirado. Reconecta desde la pestaña de entrenamiento.', 'warning');
            return;
        }
    }
    syncTodayStepsFromGoogleFit(true);
};
