// ==================== SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE FIT ====================

import AppState from './state.js';
import { getDateKey, safeSet, notifyNutritionChanged } from './storage.js';
import { getTodayWorkout, estimateWorkoutKcal, getWorkoutSessions, getExercisesDB } from './workout.js';
import { showNotification } from './ui/notifications.js';
import { escapeHTML } from './utils.js';

const GOOGLE_FIT_SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
const DEFAULT_CLIENT_ID = '188472915937-i8jb9ericnjehqut53q6j67q6detusk1.apps.googleusercontent.com';

let tokenClient = null;
let syncInterval = null;
let _visibilityHandler = null;
let _focusHandler = null;
let _onlineHandler = null;
let _lastFitError = '';
let _lastFitNoticeAt = 0;
let _gisWatchTimer = null;

/**
 * Obtiene las credenciales guardadas
 */
function getFitCredentials() {
    const expiresAt = parseInt(localStorage.getItem('gfit_expires_at') || '0', 10);
    return {
        accessToken: localStorage.getItem('gfit_access_token'),
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        clientId: localStorage.getItem('gfit_client_id') || DEFAULT_CLIENT_ID,
        autoSync: localStorage.getItem('gfit_auto_sync') === 'true'
    };
}

/**
 * Guarda las credenciales de Google Fit
 */
function saveFitCredentials(accessToken, expiresInSeconds, clientId = null) {
    const expiresAt = Date.now() + ((Number(expiresInSeconds) || 3600) * 1000) - 60000; // 1 min buffer
    localStorage.setItem('gfit_access_token', accessToken);
    localStorage.setItem('gfit_expires_at', expiresAt.toString());
    if (clientId) localStorage.setItem('gfit_client_id', clientId);
    localStorage.setItem('gfit_auto_sync', 'true');
}

function _stopFitAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (_visibilityHandler) {
        document.removeEventListener('visibilitychange', _visibilityHandler);
        _visibilityHandler = null;
    }
    if (_focusHandler) {
        window.removeEventListener('focus', _focusHandler);
        _focusHandler = null;
    }
    if (_onlineHandler) {
        window.removeEventListener('online', _onlineHandler);
        _onlineHandler = null;
    }
}

/**
 * Elimina la conexión con Google Fit
 */
export function disconnectGoogleFit() {
    _stopFitAutoSync();
    localStorage.removeItem('gfit_access_token');
    localStorage.removeItem('gfit_expires_at');
    localStorage.setItem('gfit_auto_sync', 'false');
    _clearFitError();
    _lastFitNoticeAt = 0;
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
 * 'connected' | 'expired' | 'disconnected'
 * AutoSync puede seguir activo aunque el access token haya caducado; en ese
 * caso la app intenta renovarlo y muestra "Reconectar" si Google lo impide.
 */
export function getGoogleFitState() {
    const creds = getFitCredentials();
    if (!creds.autoSync) return 'disconnected';
    if (creds.accessToken && creds.expiresAt > Date.now()) return 'connected';
    if (creds.accessToken) return 'expired';
    return 'disconnected';
}

function _fitErrorInfo(error) {
    const rawType = String(error && (error.type || error.error || error.code) || '').trim();
    const rawMessage = String(error && (error.message || error.details) || error || '').trim();
    const text = `${rawType} ${rawMessage}`.toLowerCase();
    let friendly;

    if (text.includes('origin_mismatch') || text.includes('origin is not allowed') || text.includes('given origin is not allowed')) {
        friendly = `El origen ${window.location.origin} no está autorizado en el Client ID de Google. Añádelo en Google Cloud Console → Credenciales → Orígenes de JavaScript autorizados.`;
    } else if (text.includes('invalid_client')) {
        friendly = 'El Client ID de Google no es válido o fue eliminado. Revisa la configuración avanzada.';
    } else if (text.includes('redirect_uri_mismatch')) {
        friendly = 'La configuración OAuth no coincide. Revisa el Client ID y los orígenes autorizados en Google Cloud.';
    } else if (text.includes('unverified') || text.includes('not verified') || text.includes('verification')) {
        friendly = 'Google no ha verificado esta app. Si el proyecto está en Testing, añade tu cuenta como test user; si no, revisa la verificación en Google Cloud.';
    } else if (text.includes('invalid_scope')) {
        friendly = 'El permiso fitness.activity.read no está configurado en la pantalla de consentimiento de Google Cloud.';
    } else if (text.includes('unauthorized_client')) {
        friendly = 'El Client ID no está autorizado para este flujo OAuth. Revisa el tipo de cliente y el origen.';
    } else if (text.includes('invalid_grant')) {
        friendly = 'La autorización de Google ya no es válida. Pulsa Reconectar.';
    } else if (text.includes('popup_closed') || text.includes('popup closed')) {
        friendly = 'Se cerró la ventana de Google antes de completar la autorización. Si la ventana mostraba un error de Google, revisa el Client ID y el origen autorizado en la configuración avanzada.';
    } else if (text.includes('access_denied') || text.includes('permission denied')) {
        friendly = 'No se concedió permiso a Google Fit. Revisa el consentimiento o los permisos de tu cuenta de Google.';
    } else if (text.includes('interaction_required') || text.includes('login_required') || text.includes('consent_required')) {
        friendly = 'La sesión de Google ha caducado. Pulsa Reconectar para autorizar de nuevo.';
    } else if (text.includes('accessnotconfigured') || text.includes('access not configured') || text.includes('fitness api')) {
        friendly = 'La Fitness API no está habilitada en el proyecto de Google Cloud.';
    } else if (text.includes('429') || text.includes('quota') || text.includes('rate limit')) {
        friendly = 'Google Fit está limitando las consultas. Espera un poco; la app reintentará.';
    } else if (text.includes('403')) {
        friendly = 'Google Fit rechazó el acceso. Revisa los permisos y que la Fitness API esté habilitada.';
    } else if (text.includes('401')) {
        friendly = 'El token de Google Fit ha caducado o fue revocado. Pulsa Reconectar.';
    } else if (rawMessage) {
        friendly = `No se pudo conectar con Google Fit: ${rawMessage.slice(0, 180)}`;
    } else {
        friendly = 'No se pudo conectar con Google Fit. Revisa la configuración avanzada.';
    }

    if (rawType && !friendly.toLowerCase().includes(rawType.toLowerCase())) {
        friendly += ` (${rawType})`;
    }
    return friendly;
}

function _setFitError(error) {
    _lastFitError = _fitErrorInfo(error);
}

function _clearFitError() {
    _lastFitError = '';
}

function _notifyFit(message, type = 'warning') {
    const now = Date.now();
    if (now - _lastFitNoticeAt < 60 * 60 * 1000) return;
    _lastFitNoticeAt = now;
    showNotification(message, type);
}

/**
 * Guarda un Client ID OAuth de Google (público). Al cambiarlo se invalida el
 * token anterior y se pide reconectar.
 */
export function saveGoogleFitClientId(clientId) {
    const value = String(clientId || '').trim();
    if (!value) {
        _stopFitAutoSync();
        localStorage.removeItem('gfit_client_id');
        localStorage.removeItem('gfit_access_token');
        localStorage.removeItem('gfit_expires_at');
        localStorage.setItem('gfit_auto_sync', 'false');
        _clearFitError();
        showNotification('Client ID restaurado al valor predeterminado. Reconecta con Google Fit.', 'success');
        renderGoogleFitStatusUI();
        return true;
    }
    if (!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value)) {
        _setFitError({ message: 'El Client ID no tiene el formato correcto. Debe terminar en .apps.googleusercontent.com.' });
        showNotification('Client ID de Google no válido', 'error');
        renderGoogleFitStatusUI();
        return false;
    }
    _stopFitAutoSync();
    localStorage.setItem('gfit_client_id', value);
    localStorage.removeItem('gfit_access_token');
    localStorage.removeItem('gfit_expires_at');
    localStorage.setItem('gfit_auto_sync', 'false');
    _clearFitError();
    showNotification('Client ID guardado. Pulsa Conectar con Google Fit.', 'success');
    renderGoogleFitStatusUI();
    return true;
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

        const storedClientId = getFitCredentials().clientId;
        const client = google.accounts.oauth2.initTokenClient({
            client_id: storedClientId,
            scope: GOOGLE_FIT_SCOPE,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    _clearFitError();
                    saveFitCredentials(tokenResponse.access_token, tokenResponse.expires_in, storedClientId);
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
    _clearFitError();
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        _setFitError({ message: 'La librería de Google no está cargada. Recarga la página o desactiva el bloqueador de scripts para accounts.google.com.' });
        showNotification('Cargando librería de Google... Reintenta en unos segundos.', 'warning');
        renderGoogleFitStatusUI();
        return;
    }

    // Si el usuario editó el Client ID y pulsa Conectar sin Guardar, se guarda
    // automáticamente para no iniciar el flujo con el Client ID anterior.
    const clientInput = document.getElementById('gfitClientIdInput');
    if (clientInput) {
        const typedClientId = clientInput.value.trim();
        if (typedClientId && typedClientId !== getFitCredentials().clientId && !saveGoogleFitClientId(typedClientId)) {
            return;
        }
    }

    try {
        const storedClientId = getFitCredentials().clientId;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: storedClientId,
            scope: GOOGLE_FIT_SCOPE,
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    _clearFitError();
                    saveFitCredentials(tokenResponse.access_token, tokenResponse.expires_in, storedClientId);
                    if (!silent) {
                        showNotification('✅ ¡Conectado con Google Fit! Sincronizando pasos...', 'success');
                    }
                    renderGoogleFitStatusUI();
                    // Arrancar sync periódica tras conectar; la primera sincronización
                    // la hace este callback para poder mostrar el resultado.
                    try { initGoogleFitAutoSync({ immediate: false }); } catch (_) { /* sin DOM en tests */ }
                    const syncResult = await syncTodayStepsFromGoogleFit(!silent);
                    console.log('[GoogleFit] Sync post-conexión resultado:', syncResult);
                    if (!syncResult && !silent) {
                        showNotification('Conectado, pero no se pudieron obtener los pasos. Revisa el detalle o pulsa Sincronizar.', 'warning');
                    }
                } else {
                    _setFitError({ message: 'Google no devolvió un token de acceso.' });
                    if (!silent) {
                        showNotification('No se pudo completar la conexión con Google. Revisa tu cuenta.', 'error');
                    }
                    renderGoogleFitStatusUI();
                }
            },
            error_callback: (err) => {
                console.error('Error Google OAuth:', err);
                _setFitError(err);
                if (!silent) {
                    showNotification(`Error de autorización con Google. ${_lastFitError}`, 'error');
                }
                renderGoogleFitStatusUI();
            }
        });

        tokenClient.requestAccessToken({ prompt: silent ? 'none' : '' });
    } catch (err) {
        console.error('Exception Google Fit:', err);
        _setFitError(err);
        if (!silent) {
            showNotification('Error al iniciar Google Fit: ' + (err.message || err), 'error');
        }
        renderGoogleFitStatusUI();
    }
}

/**
 * Consulta la API REST de Google Fit para obtener los pasos totales de hoy
 */
export async function fetchTodayStepsFromGoogleFit() {
    let creds = getFitCredentials();
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
                creds = getFitCredentials();
                if (!creds.accessToken || Date.now() >= creds.expiresAt) {
                    console.warn('[GoogleFit] Refresh falló, token sigue expirado');
                    _setFitError({ message: 'No se pudo renovar la sesión de Google Fit. Pulsa Reconectar.' });
                    renderGoogleFitStatusUI();
                    return null;
                }
                console.log('[GoogleFit] Refresh silencioso exitoso');
            } catch (e) {
                console.warn('[GoogleFit] Refresh silencioso falló:', e);
                _setFitError(e);
                _notifyFit('La conexión con Google Fit ha expirado. Pulsa Reconectar desde la pestaña de entrenamiento.', 'warning');
                renderGoogleFitStatusUI();
                return null;
            }
        } else {
            console.warn('[GoogleFit] Token expirado y no se puede refrescar (autoSync:', creds.autoSync, ')');
            _setFitError({ message: 'La sesión de Google Fit ha caducado y no se puede renovar automáticamente.' });
            renderGoogleFitStatusUI();
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
            const apiError = new Error(errorBody || `Google Fit API error ${response.status}`);
            apiError.status = response.status;
            apiError.code = `http_${response.status}`;
            _setFitError(apiError);
            if (response.status === 401) {
                console.warn('[GoogleFit] Token denegado o expirado (401)');
                // Conserva el token (ya inválido) para que la UI muestre
                // "Sesión caducada" y ofrezca Reconectar en vez de "Sin conectar".
                localStorage.setItem('gfit_expires_at', '0');
                localStorage.setItem('gfit_auto_sync', 'true');
                _notifyFit('La conexión con Google Fit ha caducado. Pulsa Reconectar.', 'warning');
            } else if (response.status === 403) {
                _notifyFit('Google Fit: permisos insuficientes o Fitness API no habilitada.', 'warning');
            } else if (response.status === 429) {
                _notifyFit('Google Fit está limitando las consultas. Se reintentará.', 'info');
            }
            renderGoogleFitStatusUI();
            return null;
        }

        const data = await response.json();
        let totalSteps = 0;
        let hasData = false;

        if (data && data.bucket) {
            data.bucket.forEach(bucket => {
                if (bucket.dataset) {
                    bucket.dataset.forEach(dataset => {
                        if (dataset.point) {
                            dataset.point.forEach(point => {
                                if (point.value) {
                                    point.value.forEach(val => {
                                        const raw = val.intVal !== undefined ? val.intVal : val.fpVal;
                                        const n = Number(raw);
                                        if (raw !== undefined && raw !== null && Number.isFinite(n)) {
                                            totalSteps += n;
                                            hasData = true;
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        console.log('[GoogleFit] API response OK. Total pasos:', totalSteps, 'hay datos:', hasData);
        if (!hasData) {
            console.log('[GoogleFit] Sin datos de pasos en Google Fit para hoy. Asegúrate de que Google Fit esté instalado y sincronizando en tu móvil.');
            _clearFitError();
            return null;
        }
        _clearFitError();
        return Math.round(totalSteps);
    } catch (err) {
        console.error('[GoogleFit] Error obteniendo pasos:', err.message || err);
        _setFitError(err);
        renderGoogleFitStatusUI();
        return null;
    }
}

/**
 * Sincroniza los pasos obtenidos de Google Fit en la sesión de entreno de HOY.
 * La API consulta el día real, así que nunca se escribe en la fecha que el
 * usuario esté viendo si es otra (antes podía contaminar días pasados).
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
    if (steps <= 0) {
        // Sin pasos no se crea una sesión vacía ni se borra lo ya registrado.
        if (showToast) showNotification('Google Fit no tiene pasos registrados todavía hoy', 'info');
        return false;
    }

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
    // de tipo steps) — antes cualquier custom con "pasos" en el nombre era secuestrado.
    let exInSession = session.exercises.find(e => e && (
        e.exerciseId == stepsExDB.id ||
        ((e.trackingType || '') === 'steps' && e.name && e.name.toLowerCase().includes('pasos'))
    ));

    if (exInSession) {
        if (!Array.isArray(exInSession.sets)) exInSession.sets = [];
        // Solo se actualiza el bloque sincronizado. Los sets manuales del
        // usuario no se pisan. Los backups antiguos no tienen 'synced': se
        // migra el set 0 si parece el generado por Fit.
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
            syncedSet.steps = steps;
            syncedSet.done = true;
            syncedSet.synced = true;
        } else {
            exInSession.sets.push({ steps, mins: 0, done: true, synced: true });
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
            sets: [{ steps, mins: 0, done: true, synced: true }]
        });
    }

    // Una sesión creada solo por pasos es actividad real, no un borrador.
    const onlySteps = session.exercises.every(ex => (ex.trackingType || '') === 'steps');
    if (onlySteps) {
        session.finalized = true;
        session.onlySteps = true;
    }

    // Recalcular gasto calórico de la sesión
    session.estimatedKcal = estimateWorkoutKcal(session);
    sessions[dateKey] = session;
    const saved = safeSet('workoutSessions', sessions);
    if (!saved) return false;
    notifyNutritionChanged();

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

function _fitConfigHtml() {
    const creds = getFitCredentials();
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://victorgonz93.github.io';
    return `
        <details style="margin-top:12px; background:var(--bg-card); border:1px solid var(--border-base); border-radius:10px; padding:10px 12px;">
            <summary style="cursor:pointer; color:var(--text-2); font-size:0.82rem; font-weight:600;">Configuración avanzada de Google Fit</summary>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                <label style="font-size:0.76rem; color:var(--text-2); font-weight:600;">Client ID OAuth</label>
                <input id="gfitClientIdInput" type="text" value="${escapeHTML(creds.clientId)}" spellcheck="false" autocomplete="off" style="width:100%; padding:8px 10px; background:var(--bg-elevated); border:1px solid var(--border-base); border-radius:8px; color:var(--text-1); font-size:0.78rem; outline:none;">
                <button onclick="window._saveGoogleFitClientId()" style="align-self:flex-start; padding:7px 12px; background:var(--primary-dim); color:var(--primary-text); border:1px solid rgba(16,185,129,0.3); border-radius:8px; font-size:0.78rem; font-weight:700; cursor:pointer;">Guardar Client ID</button>
                <p style="margin:2px 0 0; color:var(--text-3); font-size:0.72rem; line-height:1.45;">Origen que debes autorizar en Google Cloud: <code style="color:var(--primary-text);">${escapeHTML(origin)}</code></p>
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="align-self:flex-start; color:var(--primary-text); font-size:0.76rem; font-weight:700; text-decoration:none;">Abrir Google Cloud Console →</a>
                <p style="margin:0; color:var(--text-3); font-size:0.72rem; line-height:1.45;">El Client ID debe ser de tipo <strong>Web application</strong>. Habilita la Fitness API y el scope <code>fitness.activity.read</code>. Si el proyecto está en Testing, añade tu cuenta como test user.</p>
                <p style="margin:0; color:var(--color-amber); font-size:0.72rem; line-height:1.45;">Google Fit API se retira a finales de 2026. La alternativa es Google Health API o Health Connect.</p>
            </div>
        </details>
    `;
}

function _fitErrorHtml() {
    if (!_lastFitError) return '';
    return `<div style="margin-top:10px; padding:10px 12px; border:1px solid rgba(239,68,68,0.35); border-radius:8px; background:rgba(239,68,68,0.1); color:#FCA5A5; font-size:0.78rem; line-height:1.45;">${escapeHTML(_lastFitError)}</div>`;
}

function _watchGoogleLibrary() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) return;
    if (_gisWatchTimer) return;
    let attempts = 0;
    _gisWatchTimer = setInterval(() => {
        attempts += 1;
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            clearInterval(_gisWatchTimer);
            _gisWatchTimer = null;
            if (getGoogleFitState() === 'expired') {
                syncTodayStepsFromGoogleFit(false);
            }
            renderGoogleFitStatusUI();
        } else if (attempts >= 15) {
            clearInterval(_gisWatchTimer);
            _gisWatchTimer = null;
            renderGoogleFitStatusUI();
        }
    }, 1000);
}

export function renderGoogleFitStatusUI(lastSyncedSteps = null) {
    const container = document.getElementById('googleFitConfigContainer');
    if (!container) return;

    // No destruir el input mientras el usuario está escribiendo el Client ID.
    const active = document.activeElement;
    if (active && active.id === 'gfitClientIdInput') return;

    const creds = getFitCredentials();
    const state = getGoogleFitState();
    const connected = state === 'connected';
    const expired = state === 'expired';
    const gisReady = typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
    const expiresText = creds.expiresAt > 0
        ? new Date(creds.expiresAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : '—';
    const w = AppState.config.currentWeight || 75;
    const hasLastSteps = lastSyncedSteps !== null && lastSyncedSteps !== undefined;
    const stepsNumber = Number(lastSyncedSteps) || 0;
    const estKcal = stepsNumber > 0 ? Math.round(3.8 * w * (stepsNumber / 100 / 60)) : 0;
    const gisWarning = !gisReady
        ? `<div style="padding:9px 12px; border:1px solid rgba(245,158,11,0.35); border-radius:8px; background:rgba(245,158,11,0.1); color:var(--color-amber); font-size:0.78rem; line-height:1.45;">La librería de Google no se ha cargado. Recarga la página o desbloquea accounts.google.com.</div>`
        : '';

    if (connected || expired) {
        const statusBg = connected ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)';
        const statusBorder = connected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)';
        const statusIconBg = connected ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)';
        const statusColor = connected ? '#10B981' : '#F59E0B';
        const statusLabel = connected ? 'Google Fit Conectado' : 'Sesión de Google Fit caducada';
        const statusDetail = connected
            ? `Token válido hasta ~${expiresText} · sincronización cada 2 min mientras la app está abierta`
            : 'Pulsa Reconectar para renovar la autorización.';
        const stepsText = hasLastSteps
            ? `Pasos de hoy: <strong style="color:${statusColor};">${stepsNumber.toLocaleString('es-ES')}</strong>`
            : (connected ? 'Sincronización automática activa' : 'Sin pasos sincronizados todavía');
        const metLine = hasLastSteps
            ? `<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px;">MET 3.8 × ${w}kg × (${stepsNumber.toLocaleString('es-ES')}/100/60) = ${estKcal} kcal</div>`
            : '';

        container.innerHTML = `
            <div style="background:${statusBg}; border:1px solid ${statusBorder}; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                        <div style="width:40px;height:40px;border-radius:10px;background:${statusIconBg};display:flex;align-items:center;justify-content:center;color:${statusColor};flex-shrink:0;">
                            <span class="material-icons">directions_walk</span>
                        </div>
                        <div>
                            <div style="font-size:0.95rem;font-weight:700;color:var(--text-1);">${statusLabel}</div>
                            <div style="font-size:0.78rem;color:var(--text-2);line-height:1.4;">${statusDetail}</div>
                            <div style="font-size:0.8rem;color:var(--text-2);margin-top:2px;">${stepsText}${estKcal > 0 ? ` · <span style="color:var(--color-amber);">≈${estKcal} kcal</span>` : ''}</div>
                            ${metLine}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button onclick="window._manualSyncGoogleFit()" style="padding:7px 14px;background:#10B981;color:#FFF;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;gap:4px;">
                            <span class="material-icons" style="font-size:15px;">sync</span> Sincronizar
                        </button>
                        <button onclick="window.connectGoogleFit()" ${!gisReady ? 'disabled' : ''} style="padding:7px 12px;background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);border-radius:8px;font-weight:600;font-size:0.82rem;cursor:${gisReady ? 'pointer' : 'not-allowed'};opacity:${gisReady ? '1' : '0.5'};">
                            <span class="material-icons" style="font-size:15px;vertical-align:middle;">refresh</span> Reconectar
                        </button>
                        <button onclick="window.disconnectGoogleFit()" style="padding:7px 12px;background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;">
                            Desconectar
                        </button>
                    </div>
                </div>
                ${gisWarning}
            </div>
            ${_fitErrorHtml()}
            ${_fitConfigHtml()}
        `;
    } else {
        container.innerHTML = `
            <div style="background:var(--bg-card); border:1px solid var(--border-base); border-radius:12px; padding:18px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:42px;height:42px;border-radius:10px;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;color:#38BDF8;">
                        <span class="material-icons" style="font-size:24px;">directions_walk</span>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:var(--text-1);">Pasos Automáticos con Google Fit</div>
                        <div style="font-size:0.82rem;color:var(--text-2);">Sincroniza automáticamente los pasos contados por tu móvil/reloj para calcular el gasto calórico de forma transparente.</div>
                    </div>
                </div>
                ${gisWarning}
                <button onclick="window.connectGoogleFit()" ${!gisReady ? 'disabled' : ''} style="align-self:flex-start;padding:9px 20px;background:linear-gradient(135deg,#38BDF8,#0284C7);color:#FFF;border:none;border-radius:8px;font-weight:700;font-size:0.88rem;cursor:${gisReady ? 'pointer' : 'not-allowed'};display:flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(2,132,199,0.3);opacity:${gisReady ? '1' : '0.5'};">
                    <span class="material-icons" style="font-size:18px;">cloud_sync</span>
                    Conectar con Google Fit
                </button>
                ${_fitErrorHtml()}
                ${_fitConfigHtml()}
            </div>
        `;
    }

    if (!gisReady) _watchGoogleLibrary();
}

/**
 * Inicia sincronización periódica en segundo plano cuando la app está activa
 */
export function initGoogleFitAutoSync({ immediate = true } = {}) {
    const creds = getFitCredentials();
    if (!creds.autoSync) return;

    // Aunque el token esté caducado, fetch intenta renovarlo. Antes la sync
    // ni siquiera arrancaba si el token ya había expirado. Si hace falta
    // renovar y la librería de Google aún no ha cargado, se pospone.
    if (immediate && (isGoogleFitConnected() || (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2))) {
        syncTodayStepsFromGoogleFit(false);
    }

    // Mientras la app esté abierta y visible, actualización cada 2 minutos.
    // Los navegadores limitan los timers en segundo plano; al volver a la
    // pestaña se sincroniza de inmediato.
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            syncTodayStepsFromGoogleFit(false);
        }
    }, 2 * 60 * 1000);

    if (_visibilityHandler) {
        document.removeEventListener('visibilitychange', _visibilityHandler);
    }
    _visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
            syncTodayStepsFromGoogleFit(false);
        }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);

    if (_focusHandler) window.removeEventListener('focus', _focusHandler);
    _focusHandler = () => {
        if (document.visibilityState === 'visible') {
            syncTodayStepsFromGoogleFit(false);
        }
    };
    window.addEventListener('focus', _focusHandler);

    if (_onlineHandler) window.removeEventListener('online', _onlineHandler);
    _onlineHandler = () => syncTodayStepsFromGoogleFit(false);
    window.addEventListener('online', _onlineHandler);
}

// Window Exposures
window.connectGoogleFit = connectGoogleFit;
window.disconnectGoogleFit = disconnectGoogleFit;
window._saveGoogleFitClientId = () => {
    const input = document.getElementById('gfitClientIdInput');
    saveGoogleFitClientId(input ? input.value : '');
};
window._manualSyncGoogleFit = async () => {
    _clearFitError();
    const creds = getFitCredentials();
    if (creds.accessToken && Date.now() >= creds.expiresAt) {
        showNotification('Refrescando conexión con Google Fit...', 'info');
        try {
            await silentTokenRefresh();
        } catch (e) {
            _setFitError(e);
            showNotification(`No se pudo renovar Google Fit. ${_lastFitError}`, 'warning');
            renderGoogleFitStatusUI();
            return;
        }
    }
    await syncTodayStepsFromGoogleFit(true);
};
