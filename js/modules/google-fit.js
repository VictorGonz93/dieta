// ==================== SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE FIT ====================

import AppState from './state.js';
import { getDateKey } from './storage.js';
import { getTodayWorkout, estimateWorkoutKcal, getWorkoutSessions, getExercisesDB } from './workout.js?v=501';
import { showNotification } from './ui/notifications.js';

const GOOGLE_FIT_SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';

let tokenClient = null;
let syncInterval = null;

/**
 * Obtiene las credenciales guardadas
 */
function getFitCredentials() {
    return {
        accessToken: localStorage.getItem('gfit_access_token'),
        expiresAt: parseInt(localStorage.getItem('gfit_expires_at') || '0', 10),
        clientId: localStorage.getItem('gfit_client_id') || '',
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
 * Inicia el proceso de autenticación con Google Identity Services
 */
export function connectGoogleFit(customClientId = null) {
    const savedClientId = localStorage.getItem('gfit_client_id');
    const clientId = customClientId || savedClientId;

    if (!clientId) {
        showGoogleFitSetupModal();
        return;
    }

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showNotification('Cargando librería de Google... Reintenta en unos segundos.', 'warning');
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: GOOGLE_FIT_SCOPE,
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    saveFitCredentials(tokenResponse.access_token, tokenResponse.expires_in, clientId.trim());
                    showNotification('✅ ¡Conectado con Google Fit! Sincronizando pasos...', 'success');
                    closeGoogleFitSetupModal();
                    renderGoogleFitStatusUI();
                    await syncTodayStepsFromGoogleFit(true);
                } else if (tokenResponse && tokenResponse.error) {
                    console.error('OAuth tokenResponse error:', tokenResponse.error);
                    showGoogleFitAuthErrorModal(tokenResponse.error);
                } else {
                    showNotification('No se pudo completar la conexión con Google', 'error');
                }
            },
            error_callback: (err) => {
                console.error('Error Google OAuth:', err);
                showGoogleFitAuthErrorModal(err);
            }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
        console.error('Exception Google Fit:', err);
        showGoogleFitAuthErrorModal(err.message || err);
    }
}

/**
 * Consulta la API REST de Google Fit para obtener los pasos totales de hoy
 */
export async function fetchTodayStepsFromGoogleFit() {
    const creds = getFitCredentials();
    if (!creds.accessToken) return null;

    if (Date.now() >= creds.expiresAt) {
        console.log('Token de Google Fit expirado. Solicitando renovación silenciosa...');
        // Si venció el token, re-solicitar token
        if (creds.autoSync && window.google?.accounts?.oauth2) {
            connectGoogleFit();
        }
        return null;
    }

    // Timestamps de inicio del día de hoy a las 00:00:00 y ahora
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const startTimeMillis = startOfDay.getTime();
    const endTimeMillis = now.getTime();

    const requestBody = {
        aggregateBy: [{
            dataTypeName: 'com.google.step_count.delta',
            dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
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
            if (response.status === 401) {
                console.warn('Google Fit Token denegado o expirado.');
                localStorage.removeItem('gfit_access_token');
                renderGoogleFitStatusUI();
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

        return Math.round(totalSteps);
    } catch (err) {
        console.warn('Error obteniendo pasos de Google Fit:', err);
        return null;
    }
}

/**
 * Sincroniza los pasos obtenidos de Google Fit en la sesión de entreno de hoy
 */
export async function syncTodayStepsFromGoogleFit(showToast = false) {
    const steps = await fetchTodayStepsFromGoogleFit();
    if (steps === null || steps === undefined) return false;

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

    const approxMins = Math.round(steps / 100);

    if (exInSession) {
        exInSession.sets = [{ steps: steps, mins: approxMins, done: true }];
    } else {
        session.exercises.push({
            exerciseId: stepsExDB.id,
            name: stepsExDB.name,
            muscle: stepsExDB.muscle,
            type: stepsExDB.type,
            category: stepsExDB.category,
            trackingType: 'steps',
            sets: [{ steps: steps, mins: approxMins, done: true }]
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

/**
 * Muestra el modal de configuración de Client ID de Google Fit con guía
 */
export function showGoogleFitSetupModal() {
    const existingModal = document.getElementById('googleFitSetupModalOverlay');
    if (existingModal) existingModal.remove();

    const savedClientId = localStorage.getItem('gfit_client_id') || '';
    const currentOrigin = window.location.origin;

    const modalHTML = `
        <div id="googleFitSetupModalOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(6, 9, 15, 0.88); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; box-sizing: border-box;">
            <div style="background: #0F172A; border: 1px solid #1E293B; border-radius: 16px; width: 100%; max-width: 520px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);">
                
                <!-- Header -->
                <div style="padding: 16px 20px; border-b: 1px solid #1E293B; display: flex; align-items: center; justify-content: space-between; background: #0B1220;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-icons" style="color: #38BDF8; font-size: 22px;">directions_walk</span>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #F8FAFC;">Configurar Google Fit API</h3>
                    </div>
                    <button onclick="document.getElementById('googleFitSetupModalOverlay').remove()" style="background: transparent; border: none; color: #94A3B8; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <span class="material-icons" style="font-size: 22px;">close</span>
                    </button>
                </div>

                <!-- Contenido -->
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box;">
                    
                    <div style="background: rgba(56, 189, 248, 0.1); border-left: 3px solid #38BDF8; padding: 12px 14px; border-radius: 8px; color: #CBD5E1; font-size: 0.85rem; line-height: 1.4;">
                        Para autorizar la sincronización de pasos de Google sin bloquear tu cuenta, debes ingresar tu <strong>Client ID de Google Cloud</strong> para el origen de esta app.
                    </div>

                    <!-- Paso a Paso rápido -->
                    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.82rem; color: #94A3B8;">
                        <div style="font-weight: 700; color: #F8FAFC; font-size: 0.88rem;">Cómo obtener tu Client ID en 1 minuto (Gratis):</div>
                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                            <span style="background: #1E293B; color: #38BDF8; font-weight: 700; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">1</span>
                            <span>Abre <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: #38BDF8; text-decoration: underline;">Google Cloud Console Credentials</a> y crea un proyecto.</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                            <span style="background: #1E293B; color: #38BDF8; font-weight: 700; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">2</span>
                            <span>Pulsa <strong>Crear credenciales &rarr; ID de cliente de OAuth 2.0</strong> (Tipo: <em>Aplicación web</em>).</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                            <span style="background: #1E293B; color: #38BDF8; font-weight: 700; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">3</span>
                            <span>En <strong>Orígenes de JavaScript autorizados</strong> añade esta URL exacta:
                                <br><code style="background: #0B1220; color: #10B981; padding: 3px 6px; border-radius: 4px; font-family: monospace; word-break: break-all; display: inline-block; margin-top: 4px;">${currentOrigin}</code>
                            </span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                            <span style="background: #1E293B; color: #38BDF8; font-weight: 700; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">4</span>
                            <span>Copia el <strong>ID de cliente</strong> generado (termina en <code>.apps.googleusercontent.com</code>) y pégalo abajo.</span>
                        </div>
                    </div>

                    <!-- Input Client ID -->
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #F8FAFC;">Google OAuth Client ID</label>
                        <input type="text" id="inputGoogleClientId" placeholder="Ej: 123456789-abcdefg.apps.googleusercontent.com" value="${savedClientId}" style="width: 100%; padding: 10px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; outline: none; box-sizing: border-box;">
                    </div>

                    <!-- Botones -->
                    <div style="display: flex; gap: 10px; margin-top: 6px;">
                        <button onclick="document.getElementById('googleFitSetupModalOverlay').remove()" style="flex: 1; padding: 11px; background: #334155; color: #F8FAFC; border: none; border-radius: 8px; font-weight: 600; font-size: 0.88rem; cursor: pointer;">Cancelar</button>
                        <button onclick="window._saveAndConnectGoogleFit()" style="flex: 1; padding: 11px; background: linear-gradient(135deg,#38BDF8,#0284C7); color: #FFF; border: none; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; box-shadow: 0 4px 14px rgba(2,132,199,0.3);">Guardar y Conectar</button>
                    </div>

                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Muestra el modal explicativo si Google arroja un error de autorización
 */
export function showGoogleFitAuthErrorModal(error) {
    const existingModal = document.getElementById('googleFitAuthErrorModalOverlay');
    if (existingModal) existingModal.remove();

    const currentOrigin = window.location.origin;

    const modalHTML = `
        <div id="googleFitAuthErrorModalOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(6, 9, 15, 0.88); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; box-sizing: border-box;">
            <div style="background: #0F172A; border: 1px solid #EF4444; border-radius: 16px; width: 100%; max-width: 500px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.2);">
                
                <!-- Header -->
                <div style="padding: 16px 20px; border-b: 1px solid #1E293B; display: flex; align-items: center; justify-content: space-between; background: #0B1220;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-icons" style="color: #EF4444; font-size: 22px;">error_outline</span>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #F8FAFC;">Acceso Bloqueado por Google</h3>
                    </div>
                    <button onclick="document.getElementById('googleFitAuthErrorModalOverlay').remove()" style="background: transparent; border: none; color: #94A3B8; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <span class="material-icons" style="font-size: 22px;">close</span>
                    </button>
                </div>

                <!-- Contenido -->
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; font-size: 0.85rem; color: #CBD5E1; line-height: 1.5;">
                    
                    <div style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid #EF4444; padding: 12px; border-radius: 8px; color: #FEE2E2;">
                        Google bloqueó la solicitud porque tu <strong>Client ID</strong> no tiene autorizada la URL de este dominio o tu correo no está añadido como usuario de prueba.
                    </div>

                    <div style="font-weight: 700; color: #F8FAFC;">Soluciones para desbloquear el acceso:</div>

                    <ol style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; color: #94A3B8;">
                        <li>Abre <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: #38BDF8; text-decoration: underline;">Google Cloud Console Credentials</a>.</li>
                        <li>Edita tu ID de cliente OAuth y en <strong>Orígenes de JavaScript autorizados</strong> agrega:
                            <br><code style="background: #0B1220; color: #10B981; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${currentOrigin}</code>
                        </li>
                        <li>En la pantalla de consentimiento OAuth de Google Cloud, añade tu correo electrónico personal en <strong>"Usuarios de prueba" (Test Users)</strong>.</li>
                    </ol>

                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button onclick="document.getElementById('googleFitAuthErrorModalOverlay').remove()" style="flex: 1; padding: 10px; background: #334155; color: #FFF; border: none; border-radius: 8px; font-weight: 600;">Cerrar</button>
                        <button onclick="document.getElementById('googleFitAuthErrorModalOverlay').remove(); window.showGoogleFitSetupModal();" style="flex: 1; padding: 10px; background: #38BDF8; color: #0F172A; border: none; border-radius: 8px; font-weight: 700;">Cambiar Client ID</button>
                    </div>

                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window._saveAndConnectGoogleFit = function() {
    const input = document.getElementById('inputGoogleClientId');
    if (!input) return;
    const clientId = input.value.trim();
    if (!clientId) {
        showNotification('Ingresa un Client ID válido', 'error');
        return;
    }
    localStorage.setItem('gfit_client_id', clientId);
    const setupModal = document.getElementById('googleFitSetupModalOverlay');
    if (setupModal) setupModal.remove();

    connectGoogleFit(clientId);
};

window.showGoogleFitSetupModal = showGoogleFitSetupModal;
export function renderGoogleFitStatusUI(lastSyncedSteps = null) {
    const container = document.getElementById('googleFitConfigContainer');
    if (!container) return;

    const connected = isGoogleFitConnected();
    const creds = getFitCredentials();

    if (connected) {
        container.innerHTML = `
            <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(16,185,129,0.2); display: flex; align-items: center; justify-content: center; color: #10B981;">
                        <span class="material-icons">directions_walk</span>
                    </div>
                    <div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #F8FAFC;">Google Fit Conectado</div>
                        <div style="font-size: 0.8rem; color: #94A3B8;">
                            ${lastSyncedSteps !== null ? `Pasos de hoy: <strong style="color:#10B981;">${lastSyncedSteps.toLocaleString('es-ES')}</strong> (auto-sincronizados)` : 'Sincronización automática de pasos activa'}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="window._manualSyncGoogleFit()" style="padding: 7px 12px; background: #10B981; color: #FFF; border: none; border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons" style="font-size: 15px;">sync</span> Sincronizar
                    </button>
                    <button onclick="window.showGoogleFitSetupModal()" style="padding: 7px 12px; background: rgba(56,189,248,0.15); color: #38BDF8; border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">
                        ⚙️ Client ID
                    </button>
                    <button onclick="window.disconnectGoogleFit()" style="padding: 7px 12px; background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">
                        Desconectar
                    </button>
                </div>
            </div>
        `;
    } else {
        const hasClientId = !!creds.clientId;
        container.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border-base); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(56,189,248,0.15); display: flex; align-items: center; justify-content: center; color: #38BDF8;">
                        <span class="material-icons" style="font-size: 24px;">directions_walk</span>
                    </div>
                    <div>
                        <div style="font-size: 1rem; font-weight: 700; color: #F8FAFC;">Pasos Automáticos con Google Fit</div>
                        <div style="font-size: 0.82rem; color: #94A3B8;">Sincroniza los pasos contados por tu móvil/reloj para calcular el gasto calórico de forma transparente.</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <button onclick="window.connectGoogleFit()" style="padding: 9px 18px; background: linear-gradient(135deg,#38BDF8,#0284C7); color: #FFF; border: none; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(2,132,199,0.3);">
                        <span class="material-icons" style="font-size: 18px;">cloud_sync</span>
                        ${hasClientId ? 'Conectar con Google Fit' : 'Configurar y Conectar Google Fit'}
                    </button>
                    <button onclick="window.showGoogleFitSetupModal()" style="padding: 9px 14px; background: rgba(255,255,255,0.05); color: #CBD5E1; border: 1px solid var(--border-base); border-radius: 8px; font-weight: 600; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons" style="font-size: 16px;">settings</span>
                        <span>Ingresar Client ID</span>
                    </button>
                </div>
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

        // Re-sincronizar cada 10 minutos
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
            syncTodayStepsFromGoogleFit(false);
        }, 10 * 60 * 1000);

        // Re-sincronizar cuando el usuario vuelve a enfocar la app en el móvil
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isGoogleFitConnected()) {
                syncTodayStepsFromGoogleFit(false);
            }
        });
    }
}

// Window Exposures
window.connectGoogleFit = connectGoogleFit;
window.disconnectGoogleFit = disconnectGoogleFit;
window._manualSyncGoogleFit = () => syncTodayStepsFromGoogleFit(true);
