// ==================== GOOGLE HEALTH API + WORKER ====================
// Sesión de larga duración: el Worker guarda el refresh token cifrado y la PWA
// solo recibe un token de sesión opaco. La app consulta los pasos cada 2
// minutos mientras está abierta y al volver a la pestaña.
//
// Requisitos del usuario:
//  - App Google Health en el móvil con el teléfono como dispositivo.
//  - Worker de salud desplegado y autorizado en Google Cloud.

import AppState from './state.js';
import { getDateKey } from './storage.js';
import { showNotification } from './ui/notifications.js';
import { escapeHTML } from './utils.js';
import { applyStepsToTodayWorkout } from './steps-sync.js';

const DEFAULT_WORKER_URL = 'https://apex-nutrition-health.victorgonz93.workers.dev';
const WORKER_KEY = 'ghealth_worker_url';
const SESSION_KEY = 'ghealth_session';
const AUTO_KEY = 'ghealth_auto_sync';
const PENDING_LINK_KEY = 'ghealth_pending_link';
const SYNC_INTERVAL_MS = 2 * 60 * 1000;
const NOTICE_INTERVAL_MS = 60 * 60 * 1000;

let _syncTimer = null;
let _visibilityHandler = null;
let _focusHandler = null;
let _onlineHandler = null;
let _connecting = false;
let _reauthRequired = false;
let _lastSteps = null;
let _lastHasData = null;
let _lastUpdatedAt = '';
let _lastError = '';
let _lastNoticeAt = 0;
let _lastAutoSyncAt = 0;

function _normalizeWorkerUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    try {
        const url = new URL(raw);
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return '';
        if (url.search || url.hash) return '';
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    } catch (_) {
        return '';
    }
}

export function getGoogleHealthWorkerUrl() {
    const stored = _normalizeWorkerUrl(localStorage.getItem(WORKER_KEY));
    return stored || DEFAULT_WORKER_URL;
}

export function saveGoogleHealthWorkerUrl(value) {
    const normalized = _normalizeWorkerUrl(value);
    if (!normalized) {
        _lastError = 'La URL del Worker no es válida. Debe empezar por https:// (o http://localhost en desarrollo).';
        showNotification('URL del Worker no válida', 'error');
        renderGoogleHealthStatusUI(_lastSteps);
        return false;
    }
    const previous = getGoogleHealthWorkerUrl();
    if (previous !== normalized) {
        // El token de sesión pertenece al Worker anterior: no se reutiliza.
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(AUTO_KEY);
        _stopAutoSync();
        _reauthRequired = false;
        _lastSteps = null;
        _lastHasData = null;
        _lastUpdatedAt = '';
    }
    localStorage.setItem(WORKER_KEY, normalized);
    _lastError = '';
    showNotification('URL del Worker guardada', 'success');
    renderGoogleHealthStatusUI(_lastSteps);
    return true;
}

function _getSessionToken() {
    return localStorage.getItem(SESSION_KEY) || '';
}

export function isGoogleHealthConnected() {
    return getGoogleHealthState() === 'connected';
}

export function getGoogleHealthState() {
    if (_connecting) return 'connecting';
    if (_reauthRequired) return 'expired';
    return _getSessionToken() ? 'connected' : 'disconnected';
}

function _friendlyError(error) {
    const code = String((error && error.code) || '');
    const status = Number((error && error.status) || 0);
    const raw = String((error && error.message) || error || '').trim();
    if (code === 'reauth_required' || status === 401) {
        return 'La sesión de Google Health ha caducado. Pulsa Reconectar.';
    }
    if (code === 'account_not_linked') {
        return 'Tu cuenta no está vinculada a Google Health. Instala la app Google Health, activa el teléfono como dispositivo y vuelve a intentarlo.';
    }
    if (code === 'api_disabled') {
        return 'La Google Health API no está habilitada en el proyecto de Google Cloud del Worker.';
    }
    if (code === 'not_configured') {
        return 'El Worker de salud no tiene configurados GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o TOKEN_ENCRYPTION_KEY.';
    }
    if (code === 'link_expired') {
        return 'El enlace de conexión caducó. Vuelve a pulsar Conectar con Google Health.';
    }
    if (code === 'origin_not_allowed') {
        return `El origen ${window.location.origin} no está autorizado en el Worker de salud.`;
    }
    if (code === 'permission_denied') {
        return raw || 'Google Health rechazó el permiso. Revisa el scope activity_and_fitness.readonly y vuelve a conectar.';
    }
    if (code === 'refresh_failed') {
        return 'El Worker no pudo renovar la sesión con Google. Inténtalo de nuevo en unos minutos.';
    }
    if (code === 'rate_limited' || status === 429) {
        return 'Google Health está limitando las consultas. La app reintentará en unos minutos.';
    }
    if (code === 'kv_missing') {
        return 'Al Worker le falta el binding HEALTH_KV. Revisa wrangler.toml y vuelve a desplegar.';
    }
    if (error && error.name === 'AbortError') {
        return 'El Worker de salud tardó demasiado en responder. Revisa la URL o inténtalo más tarde.';
    }
    if (raw === 'Failed to fetch' || /networkerror|load failed/i.test(raw)) {
        return 'No se pudo contactar con el Worker de salud. Revisa la URL y que esté desplegado.';
    }
    return raw || 'No se pudo conectar con Google Health.';
}

async function _workerRequest(path, { method = 'GET', body = null, auth = true, timeout = 15000 } = {}) {
    const base = getGoogleHealthWorkerUrl();
    if (!base) throw new Error('Configura la URL del Worker de salud.');

    const token = _getSessionToken();
    if (auth && !token) {
        const error = new Error('No hay una sesión de Google Health guardada.');
        error.code = 'missing_session';
        error.status = 401;
        throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                ...(auth ? { Authorization: `Bearer ${token}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                Accept: 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || `Error ${response.status}`);
            error.status = response.status;
            error.code = data.error || `http_${response.status}`;
            throw error;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function _randomLink() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function _notifyThrottled(message, type = 'warning') {
    const now = Date.now();
    if (now - _lastNoticeAt < NOTICE_INTERVAL_MS) return;
    _lastNoticeAt = now;
    showNotification(message, type);
}

export function connectGoogleHealth() {
    _lastError = '';
    const base = getGoogleHealthWorkerUrl();
    if (!base) {
        _lastError = 'Configura primero la URL del Worker de salud.';
        renderGoogleHealthStatusUI(_lastSteps);
        return;
    }

    const link = _randomLink();
    try {
        localStorage.setItem(PENDING_LINK_KEY, link);
    } catch (_) { /* localStorage puede estar bloqueado */ }

    const params = new URLSearchParams({
        origin: window.location.origin,
        link,
        return: window.location.pathname,
        // Redirección de página completa: evita que el COOP de Google corte
        // el postMessage del popup y que la app crea que se cerró antes.
        mode: 'redirect',
    });
    _connecting = true;
    renderGoogleHealthStatusUI(_lastSteps);
    window.location.assign(`${base}/auth/start?${params.toString()}`);
}

async function _exchangeLink(link) {
    _connecting = true;
    _lastError = '';
    renderGoogleHealthStatusUI(_lastSteps);
    try {
        const data = await _workerRequest('/auth/session', {
            method: 'POST',
            body: { link },
            auth: false,
        });
        if (!data || !data.sessionToken) throw new Error('El Worker no devolvió una sesión.');
        localStorage.setItem(SESSION_KEY, data.sessionToken);
        localStorage.setItem(AUTO_KEY, 'true');
        _reauthRequired = false;
        _connecting = false;
        _lastError = '';
        showNotification('✅ Google Health conectado. Sincronizando pasos...', 'success');
        _startAutoSync();
        await syncTodayStepsFromGoogleHealth(true);
    } catch (error) {
        _connecting = false;
        _lastError = _friendlyError(error);
        showNotification(_lastError, 'error');
        renderGoogleHealthStatusUI(_lastSteps);
    }
}

async function _completeRedirectIfPresent() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const health = url.searchParams.get('health') || hashParams.get('health');
    if (health !== 'connected' && health !== 'error') return false;

    const link = url.searchParams.get('link') || hashParams.get('link') || '';
    const error = url.searchParams.get('error') || hashParams.get('error') || '';
    const message = url.searchParams.get('message') || hashParams.get('message') || '';

    // Limpiar la URL antes de canjear el enlace de un solo uso.
    url.searchParams.delete('health');
    url.searchParams.delete('link');
    url.searchParams.delete('error');
    url.searchParams.delete('message');
    url.hash = '';
    history.replaceState(null, '', `${url.pathname}${url.search}`);

    if (health === 'error') {
        _connecting = false;
        try { localStorage.removeItem(PENDING_LINK_KEY); } catch (_) { /* bloqueado */ }
        _lastError = message || (error === 'access_denied'
            ? 'No se concedió permiso a Google Health. Puedes volver a intentarlo cuando quieras.'
            : `Google no completó la autorización${error ? `: ${error}` : ''}.`);
        renderGoogleHealthStatusUI(_lastSteps);
        return true;
    }

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(link)) return true;

    // Solo se canjea el enlace que esta pestaña generó. Evita que una URL
    // manipulada conecte la app a una cuenta de Google ajena.
    let pending = '';
    try { pending = localStorage.getItem(PENDING_LINK_KEY) || ''; } catch (_) { /* bloqueado */ }
    if (!pending || link !== pending) {
        _lastError = 'La respuesta de Google no coincide con la conexión iniciada. Vuelve a intentarlo.';
        renderGoogleHealthStatusUI(_lastSteps);
        return true;
    }
    localStorage.removeItem(PENDING_LINK_KEY);

    await _exchangeLink(link);
    return true;
}

function _stopAutoSync() {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
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

function _maybeAutoSync() {
    const now = Date.now();
    if (now - _lastAutoSyncAt < 30 * 1000) return;
    _lastAutoSyncAt = now;
    syncTodayStepsFromGoogleHealth(false);
}

function _startAutoSync() {
    _stopAutoSync();
    if (!_getSessionToken()) return;
    localStorage.setItem(AUTO_KEY, 'true');

    _syncTimer = setInterval(() => {
        if (document.visibilityState === 'visible') _maybeAutoSync();
    }, SYNC_INTERVAL_MS);

    _visibilityHandler = () => {
        if (document.visibilityState === 'visible') _maybeAutoSync();
    };
    document.addEventListener('visibilitychange', _visibilityHandler);

    _focusHandler = () => {
        if (document.visibilityState === 'visible') _maybeAutoSync();
    };
    window.addEventListener('focus', _focusHandler);

    _onlineHandler = () => _maybeAutoSync();
    window.addEventListener('online', _onlineHandler);
}

export async function syncTodayStepsFromGoogleHealth(showToast = false) {
    if (!_getSessionToken()) {
        if (showToast) showNotification('Conecta primero con Google Health.', 'warning');
        return false;
    }

    const dateKey = getDateKey(new Date());
    try {
        const data = await _workerRequest(`/steps/today?date=${encodeURIComponent(dateKey)}`);
        const steps = Math.max(0, Math.round(Number(data && data.steps) || 0));
        _reauthRequired = false;
        _lastError = '';
        _lastSteps = steps;
        _lastHasData = data.hasData === true;
        _lastUpdatedAt = data.updatedAt || new Date().toISOString();

        if (steps > 0) {
            const applied = applyStepsToTodayWorkout(steps);
            if (!applied.ok) {
                _lastError = 'Se obtuvieron los pasos, pero no se pudieron guardar en la sesión de entrenamiento.';
            }
        }

        if (showToast) {
            if (steps > 0) {
                showNotification(`👣 ${steps.toLocaleString('es-ES')} pasos sincronizados de Google Health`, 'success');
            } else if (data && data.hasData === false) {
                showNotification('Google Health aún no tiene pasos de hoy. Abre la app Google Health en el móvil para que sincronice y vuelve a intentarlo.', 'info');
            } else {
                showNotification('Google Health devolvió 0 pasos para hoy.', 'info');
            }
        }
        renderGoogleHealthStatusUI(steps);
        return steps > 0;
    } catch (error) {
        if (error.status === 401 || error.code === 'reauth_required') {
            _reauthRequired = true;
            _lastError = 'La sesión de Google Health ha caducado. Pulsa Reconectar.';
        } else {
            _lastError = _friendlyError(error);
        }
        if (showToast) showNotification(_lastError, 'warning');
        else _notifyThrottled(_lastError, 'warning');
        renderGoogleHealthStatusUI(_lastSteps);
        return false;
    }
}

/**
 * Revoca la sesión en el Worker. Acepta token/URL explícitos para poder
 * usarse desde "Limpiar Todo" después de borrar localStorage.
 */
export async function revokeGoogleHealthSession({ token = '', workerUrl = '' } = {}) {
    const sessionToken = token || _getSessionToken();
    const base = workerUrl ? _normalizeWorkerUrl(workerUrl) : getGoogleHealthWorkerUrl();
    if (!sessionToken || !base) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch(`${base}/auth/disconnect`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionToken}` },
            keepalive: true,
            signal: controller.signal,
        });
        return response.ok;
    } catch (_) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export async function disconnectGoogleHealth() {
    const token = _getSessionToken();
    const base = getGoogleHealthWorkerUrl();

    _stopAutoSync();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(AUTO_KEY);
    localStorage.removeItem(PENDING_LINK_KEY);
    _connecting = false;
    _reauthRequired = false;
    _lastSteps = null;
    _lastHasData = null;
    _lastUpdatedAt = '';
    _lastError = '';
    _lastNoticeAt = 0;
    _lastAutoSyncAt = 0;
    showNotification('Conexión con Google Health desactivada');
    renderGoogleHealthStatusUI();

    // La UI ya está desconectada; se intenta revocar el token en Google sin
    // bloquear al usuario. Si falla, la sesión caduca igualmente a los 90 días.
    if (token && base) {
        await revokeGoogleHealthSession({ token, workerUrl: base });
    }
}

export async function initGoogleHealthAutoSync({ immediate = true } = {}) {
    const handledRedirect = await _completeRedirectIfPresent()
        .catch(() => false);
    if (handledRedirect) {
        renderGoogleHealthStatusUI(_lastSteps);
        return;
    }

    if (_getSessionToken()) {
        localStorage.setItem(AUTO_KEY, 'true');
        _startAutoSync();
        if (immediate) {
            _lastAutoSyncAt = Date.now();
            syncTodayStepsFromGoogleHealth(false);
        }
    } else {
        try { localStorage.removeItem(PENDING_LINK_KEY); } catch (_) { /* bloqueado */ }
    }
    renderGoogleHealthStatusUI(_lastSteps);
}

export async function testGoogleHealthWorker() {
    const base = getGoogleHealthWorkerUrl();
    if (!base) {
        showNotification('Configura primero la URL del Worker', 'warning');
        return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(`${base}/health`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(`El Worker respondió ${response.status}`);
        if (data.configured) {
            showNotification('Worker de salud OK y configurado', 'success');
            _lastError = '';
            renderGoogleHealthStatusUI(_lastSteps);
            return true;
        }
        _lastError = 'El Worker responde, pero faltan secretos o el binding HEALTH_KV: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o TOKEN_ENCRYPTION_KEY.';
        showNotification('Worker accesible, pero sin configurar', 'warning');
        renderGoogleHealthStatusUI(_lastSteps);
        return false;
    } catch (error) {
        _lastError = `No se pudo contactar con el Worker: ${error.message || error}`;
        showNotification(_lastError, 'error');
        renderGoogleHealthStatusUI(_lastSteps);
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function _timeAgo(iso) {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} días`;
}

function _errorHtml() {
    if (!_lastError) return '';
    return `<div style="padding:10px 12px;border:1px solid rgba(239,68,68,0.35);border-radius:8px;background:rgba(239,68,68,0.1);color:#FCA5A5;font-size:0.78rem;line-height:1.45;">${escapeHTML(_lastError)}</div>`;
}

function _advancedHtml() {
    const base = getGoogleHealthWorkerUrl();
    return `
        <details style="margin-top:12px;background:var(--bg-card);border:1px solid var(--border-base);border-radius:10px;padding:10px 12px;">
            <summary style="cursor:pointer;color:var(--text-2);font-size:0.82rem;font-weight:600;">Configuración avanzada de Google Health</summary>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
                <label for="ghealthWorkerUrlInput" style="font-size:0.76rem;color:var(--text-2);font-weight:600;">URL del Worker de salud</label>
                <input id="ghealthWorkerUrlInput" type="url" value="${escapeHTML(base)}" spellcheck="false" autocomplete="off" style="width:100%;padding:8px 10px;background:var(--bg-elevated);border:1px solid var(--border-base);border-radius:8px;color:var(--text-1);font-size:0.78rem;outline:none;">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="window._saveGoogleHealthWorkerUrl()" style="padding:7px 12px;background:var(--primary-dim);color:var(--primary-text);border:1px solid rgba(16,185,129,0.3);border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Guardar URL</button>
                    <button onclick="window._testGoogleHealthWorker()" style="padding:7px 12px;background:rgba(56,189,248,0.12);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Probar Worker</button>
                </div>
                <p style="margin:2px 0 0;color:var(--text-3);font-size:0.72rem;line-height:1.5;">Redirect URI que debes autorizar en el cliente OAuth de Google Cloud: <code style="color:var(--primary-text);word-break:break-all;">${escapeHTML(base)}/auth/callback</code></p>
                <p style="margin:0;color:var(--text-3);font-size:0.72rem;line-height:1.5;">El Worker necesita <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y <code>TOKEN_ENCRYPTION_KEY</code>. El refresh token se guarda cifrado y la app solo recibe un token de sesión.</p>
                <p style="margin:0;color:var(--text-3);font-size:0.72rem;line-height:1.5;">Los pasos deben venir de la app <strong>Google Health</strong> del móvil: Connections → Devices → Phone → Agree. Los pasos de Google Fit no se migran automáticamente.</p>
                <p style="margin:0;color:var(--text-3);font-size:0.72rem;line-height:1.5;">Si el proyecto de Google Cloud está en <strong>Testing</strong>, Google caduca el refresh token a los 7 días y tendrás que pulsar Reconectar. Para una sesión indefinida hay que publicar y verificar la app (scopes restringidos).</p>
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px;">
                    <a href="https://github.com/VictorGonz93/dieta/blob/master/worker-health/README.md" target="_blank" rel="noopener" style="color:var(--primary-text);font-size:0.76rem;font-weight:700;text-decoration:none;">Guía del Worker →</a>
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="color:var(--text-2);font-size:0.76rem;font-weight:700;text-decoration:none;">Google Cloud Console →</a>
                    <a href="privacy.html" style="color:var(--text-2);font-size:0.76rem;font-weight:700;text-decoration:none;">Privacidad</a>
                </div>
            </div>
        </details>
    `;
}

function _stepsLine(steps, color) {
    if (steps === null || steps === undefined) return 'Sin pasos sincronizados todavía';
    const value = Math.max(0, Number(steps) || 0);
    const weight = AppState.config.currentWeight || 75;
    const kcal = Math.round(3.8 * weight * (value / 100 / 60));
    return `Pasos de hoy: <strong style="color:${color};">${value.toLocaleString('es-ES')}</strong>${kcal > 0 ? ` · <span style="color:var(--color-amber);">≈${kcal} kcal</span>` : ''}`;
}

export function renderGoogleHealthStatusUI(lastSyncedSteps = null) {
    const container = document.getElementById('googleHealthConfigContainer');
    if (!container) return;

    // No destruir el input mientras el usuario escribe la URL.
    const active = document.activeElement;
    if (active && active.id === 'ghealthWorkerUrlInput') return;

    const steps = lastSyncedSteps === null || lastSyncedSteps === undefined
        ? _lastSteps
        : lastSyncedSteps;
    const state = getGoogleHealthState();
    const updated = _timeAgo(_lastUpdatedAt);

    if (state === 'connecting') {
        container.innerHTML = `
            <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:42px;height:42px;border-radius:10px;background:rgba(56,189,248,0.18);display:flex;align-items:center;justify-content:center;color:#38BDF8;flex-shrink:0;">
                        <span class="material-icons">hourglass_top</span>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:var(--text-1);">Esperando autorización de Google Health</div>
                        <div style="font-size:0.82rem;color:var(--text-2);line-height:1.45;">Completa el consentimiento en la ventana de Google. Esta tarjeta se actualizará sola al terminar.</div>
                    </div>
                </div>
                ${_errorHtml()}
            </div>
        `;
        return;
    }

    if (state === 'connected' || state === 'expired') {
        const connected = state === 'connected';
        const statusColor = connected ? '#10B981' : '#F59E0B';
        const statusBg = connected ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)';
        const statusBorder = connected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)';
        const statusIconBg = connected ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)';
        const title = connected ? 'Google Health conectado' : 'Sesión de Google Health caducada';
        const detail = connected
            ? `Sesión de larga duración con refresh token cifrado. Sincronización cada 2 min mientras la app está abierta.${updated ? ` Actualizado ${updated}.` : ''}`
            : 'Pulsa Reconectar para renovar la autorización. El refresh token de Google puede caducar a los 7 días si el proyecto está en Testing.';
        const zeroHint = steps === 0 && _lastHasData === false
            ? `<div style="padding:9px 12px;border:1px solid rgba(245,158,11,0.3);border-radius:8px;background:rgba(245,158,11,0.08);color:var(--color-amber);font-size:0.78rem;line-height:1.5;">Google Health no tiene pasos de hoy. Abre la app <strong>Google Health</strong> en el móvil, entra en <strong>Connections → Devices → Phone → Agree</strong>, camina unos minutos y abre la app para sincronizar.</div>`
            : '';

        container.innerHTML = `
            <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                        <div style="width:40px;height:40px;border-radius:10px;background:${statusIconBg};display:flex;align-items:center;justify-content:center;color:${statusColor};flex-shrink:0;">
                            <span class="material-icons">monitor_heart</span>
                        </div>
                        <div>
                            <div style="font-size:0.95rem;font-weight:700;color:var(--text-1);">${title}</div>
                            <div style="font-size:0.78rem;color:var(--text-2);line-height:1.4;">${detail}</div>
                            <div style="font-size:0.8rem;color:var(--text-2);margin-top:2px;">${_stepsLine(steps, statusColor)}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button onclick="window._manualSyncGoogleHealth()" style="padding:7px 14px;background:#10B981;color:#FFF;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;gap:4px;">
                            <span class="material-icons" style="font-size:15px;">sync</span> Sincronizar
                        </button>
                        <button onclick="window.connectGoogleHealth()" style="padding:7px 12px;background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;">
                            <span class="material-icons" style="font-size:15px;vertical-align:middle;">refresh</span> Reconectar
                        </button>
                        <button onclick="window.disconnectGoogleHealth()" style="padding:7px 12px;background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;">
                            Desconectar
                        </button>
                    </div>
                </div>
                ${zeroHint}
                ${_errorHtml()}
                ${_advancedHtml()}
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-base);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:42px;height:42px;border-radius:10px;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;color:#38BDF8;flex-shrink:0;">
                    <span class="material-icons" style="font-size:24px;">monitor_heart</span>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:700;color:var(--text-1);">Pasos con Google Health</div>
                    <div style="font-size:0.82rem;color:var(--text-2);line-height:1.45;">Conecta una vez y el Worker mantiene la sesión con refresh token. La app sincroniza los pasos cada 2 minutos mientras está abierta, sin volver a pedir login cada hora.</div>
                </div>
            </div>
            <div style="padding:10px 12px;border:1px solid rgba(245,158,11,0.3);border-radius:8px;background:rgba(245,158,11,0.08);color:var(--color-amber);font-size:0.78rem;line-height:1.5;">
                Los pasos deben venir de la app <strong>Google Health</strong> en el móvil: Connections → Devices → Phone → Agree. Los datos de Google Fit no se migran automáticamente.
            </div>
            <button onclick="window.connectGoogleHealth()" style="align-self:flex-start;padding:9px 20px;background:linear-gradient(135deg,#38BDF8,#0284C7);color:#FFF;border:none;border-radius:8px;font-weight:700;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(2,132,199,0.3);">
                <span class="material-icons" style="font-size:18px;">cloud_sync</span>
                Conectar con Google Health
            </button>
            ${_errorHtml()}
            ${_advancedHtml()}
        </div>
    `;
}

// Window Exposures
window.connectGoogleHealth = connectGoogleHealth;
window.disconnectGoogleHealth = disconnectGoogleHealth;
window._manualSyncGoogleHealth = () => syncTodayStepsFromGoogleHealth(true);
window._saveGoogleHealthWorkerUrl = () => {
    const input = document.getElementById('ghealthWorkerUrlInput');
    saveGoogleHealthWorkerUrl(input ? input.value : '');
};
window._testGoogleHealthWorker = () => testGoogleHealthWorker();
