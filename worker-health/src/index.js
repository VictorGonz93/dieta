// ==================== APEX NUTRITION — WORKER DE GOOGLE HEALTH ====================
// Backend mínimo para una sesión larga con Google Health API.
//
// Qué hace:
//  1. OAuth Authorization Code con access_type=offline y prompt=consent.
//  2. Guarda el refresh token CIFRADO (AES-256-GCM) en Cloudflare KV.
//  3. Devuelve a la PWA un token de sesión opaco; el refresh token nunca
//     llega al navegador.
//  4. Consulta los pasos del día con dailyRollUp y los devuelve a la app.
//
// Qué NO hace:
//  - No guarda historial de pasos ni datos de salud.
//  - No registra tokens, códigos OAuth ni cabeceras.
//  - No acepta orígenes fuera de ALLOWED_ORIGINS.

import {
    buildDailyRollupBody,
    decryptJSON,
    encryptJSON,
    isAllowedOrigin,
    normalizeDateKey,
    parseDailyRollupSteps,
    randomToken,
    sanitizeReturnPath,
    sha256Hex,
    signState,
    verifyState,
} from './security.js';

const HEALTH_SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const HEALTH_ENDPOINT = 'https://health.googleapis.com/v4';

const HANDOFF_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_BODY_BYTES = 8 * 1024;

const DEFAULT_ORIGINS = 'https://victorgonz93.github.io,http://localhost:8765,http://127.0.0.1:8765,http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500';

function _allowedOrigins(env) {
    return String((env && env.ALLOWED_ORIGINS) || DEFAULT_ORIGINS)
        .split(',')
        .map(origin => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function _corsHeaders(origin, env) {
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
        'Cache-Control': 'no-store',
    };
    if (origin && isAllowedOrigin(origin, _allowedOrigins(env))) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}

function _json(status, payload, request, env, extraHeaders = {}) {
    const origin = request.headers.get('Origin') || '';
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ..._corsHeaders(origin, env),
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders,
        },
    });
}

function _error(status, code, message, request, env) {
    return _json(status, { error: code, message }, request, env);
}

function _config(env, request) {
    return {
        clientId: String((env && env.GOOGLE_CLIENT_ID) || ''),
        clientSecret: String((env && env.GOOGLE_CLIENT_SECRET) || ''),
        redirectUri: String((env && env.GOOGLE_REDIRECT_URI) || `${new URL(request.url).origin}/auth/callback`),
        encryptionKey: String((env && env.TOKEN_ENCRYPTION_KEY) || ''),
        stateSecret: String((env && env.STATE_SECRET) || (env && env.TOKEN_ENCRYPTION_KEY) || ''),
        kv: !!(env && env.HEALTH_KV),
    };
}

function _isConfigured(cfg) {
    return !!(cfg.clientId && cfg.clientSecret && cfg.encryptionKey && cfg.stateSecret && cfg.kv);
}

async function _readJson(request) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new Error('payload_too_large');
    if (!text) return {};
    return JSON.parse(text);
}

function _bearer(request) {
    const raw = String(request.headers.get('Authorization') || '').trim();
    const match = /^Bearer\s+(\S+)$/i.exec(raw);
    return match ? match[1] : '';
}

async function _sessionKey(token) {
    return `session:${await sha256Hex(token)}`;
}

async function _authKey(link) {
    return `auth:${await sha256Hex(link)}`;
}

async function _saveSession(sessionKey, record, env) {
    const encrypted = await encryptJSON(record, env.TOKEN_ENCRYPTION_KEY);
    await env.HEALTH_KV.put(sessionKey, encrypted, { expirationTtl: SESSION_TTL_SECONDS });
}

async function _loadSession(env, token) {
    if (!token) return null;
    const sessionKey = await _sessionKey(token);
    const raw = await env.HEALTH_KV.get(sessionKey);
    if (!raw) return null;
    try {
        return { sessionKey, record: await decryptJSON(raw, env.TOKEN_ENCRYPTION_KEY) };
    } catch (err) {
        console.error('[Health] No se pudo descifrar la sesión');
        return null;
    }
}

async function _tokenRequest(params) {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: new URLSearchParams(params),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

async function _refreshAccessToken(record, cfg) {
    const result = await _tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: record.refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
    });
    if (!result.ok) {
        return {
            ok: false,
            code: String(result.data.error || `http_${result.status}`),
            status: result.status,
        };
    }
    const accessToken = String(result.data.access_token || '');
    if (!accessToken) return { ok: false, code: 'missing_access_token', status: 502 };
    return {
        ok: true,
        accessToken,
        expiresIn: Number(result.data.expires_in) || 3600,
        refreshToken: String(result.data.refresh_token || record.refreshToken),
    };
}

async function _accessTokenFor(session, env, cfg, forceRefresh = false) {
    const record = session.record;
    const stillValid = record.accessToken
        && Number(record.accessExpiresAt || 0) > Date.now() + 60000;

    if (!forceRefresh && stillValid) {
        return { ok: true, accessToken: record.accessToken, record };
    }

    const refreshed = await _refreshAccessToken(record, cfg);
    if (!refreshed.ok) return refreshed;

    record.accessToken = refreshed.accessToken;
    record.accessExpiresAt = Date.now() + refreshed.expiresIn * 1000;
    record.refreshToken = refreshed.refreshToken;
    record.updatedAt = new Date().toISOString();
    await _saveSession(session.sessionKey, record, env);
    return { ok: true, accessToken: record.accessToken, record };
}

async function _googleHealthSteps(accessToken, dateKey) {
    const response = await fetch(`${HEALTH_ENDPOINT}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(buildDailyRollupBody(dateKey)),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

function _reauthResponse(session, request, env) {
    return _json(401, {
        error: 'reauth_required',
        message: 'La autorización de Google Health ha caducado. Pulsa Reconectar.',
    }, request, env);
}

async function _handleStepsToday(request, env, cfg) {
    const token = _bearer(request);
    const session = await _loadSession(env, token);
    if (!session) return _reauthResponse(session, request, env);

    const url = new URL(request.url);
    const dateKey = normalizeDateKey(url.searchParams.get('date'));
    if (!dateKey) {
        return _error(400, 'invalid_date', 'La fecha debe tener formato YYYY-MM-DD.', request, env);
    }

    let access = await _accessTokenFor(session, env, cfg);
    if (!access.ok) {
        if (access.code === 'invalid_grant') {
            await env.HEALTH_KV.delete(session.sessionKey);
            return _reauthResponse(session, request, env);
        }
        console.error('[Health] refresh falló:', access.code, access.status);
        return _error(503, 'refresh_failed', 'No se pudo renovar la sesión con Google. Inténtalo más tarde.', request, env);
    }

    let call = await _googleHealthSteps(access.accessToken, dateKey);

    if (call.response.status === 401) {
        access = await _accessTokenFor(session, env, cfg, true);
        if (!access.ok) {
            if (access.code === 'invalid_grant') {
                await env.HEALTH_KV.delete(session.sessionKey);
                return _reauthResponse(session, request, env);
            }
            return _error(503, 'refresh_failed', 'No se pudo renovar la sesión con Google.', request, env);
        }
        call = await _googleHealthSteps(access.accessToken, dateKey);
    }

    if (!call.response.ok) {
        const message = String((call.data && call.data.error && call.data.error.message) || '');
        // Algunos errores de Google llegan anidados en details; se busca en todo
        // el cuerpo para no depender del formato exacto.
        const rawError = JSON.stringify(call.data || {});
        if (/ACCOUNT_NOT_LINKED/i.test(rawError)) {
            return _error(409, 'account_not_linked',
                'Tu cuenta no está vinculada a Google Health. Instala la app Google Health y activa el seguimiento de pasos del teléfono.',
                request, env);
        }
        if (/SERVICE_DISABLED|has not been used|is disabled|not enabled/i.test(rawError)) {
            return _error(503, 'api_disabled',
                'La Google Health API no está habilitada en el proyecto de Google Cloud del Worker.',
                request, env);
        }
        if (/PERMISSION_DENIED|insufficient|scope/i.test(rawError)) {
            console.error('[Health] Permiso rechazado:', call.response.status, rawError.slice(0, 300));
            const detail = message ? ` Detalle de Google: ${message.slice(0, 220)}` : '';
            return _error(403, 'permission_denied',
                `Google Health rechazó el permiso. Revisa el scope activity_and_fitness.readonly y vuelve a conectar.${detail}`,
                request, env);
        }
        if (call.response.status === 429) {
            return _error(429, 'rate_limited',
                'Google Health está limitando las consultas. La app reintentará en unos minutos.',
                request, env);
        }
        console.error('[Health] Google Health error', call.response.status, message.slice(0, 200));
        return _error(502, 'upstream_error',
            'Google Health no devolvió los pasos. Inténtalo de nuevo en unos minutos.',
            request, env);
    }

    const parsed = parseDailyRollupSteps(call.data);
    return _json(200, {
        steps: parsed.steps,
        hasData: parsed.hasData,
        date: dateKey,
        updatedAt: new Date().toISOString(),
    }, request, env);
}

async function _handleAuthStart(request, env, cfg) {
    const url = new URL(request.url);
    const origin = String(url.searchParams.get('origin') || '').replace(/\/+$/, '');
    if (!origin || !isAllowedOrigin(origin, _allowedOrigins(env))) {
        return _error(403, 'origin_not_allowed', 'Origen no permitido.', request, env);
    }
    if (!_isConfigured(cfg)) {
        return _error(503, 'not_configured',
            'El Worker no tiene GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o TOKEN_ENCRYPTION_KEY configurados.',
            request, env);
    }

    const link = String(url.searchParams.get('link') || '');
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(link)) {
        return _error(400, 'invalid_link', 'El código de enlace no es válido.', request, env);
    }
    const returnPath = sanitizeReturnPath(url.searchParams.get('return'));
    // 'redirect' devuelve al usuario a la app con #health=...; 'popup' usa la
    // página HTML con postMessage (se conserva por compatibilidad).
    const mode = url.searchParams.get('mode') === 'redirect' ? 'redirect' : 'popup';
    const state = await signState({
        link,
        origin,
        returnPath,
        mode,
        iat: Date.now(),
    }, cfg.stateSecret);

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', cfg.clientId);
    authUrl.searchParams.set('redirect_uri', cfg.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', HEALTH_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    // La Google Health API rechaza tokens que también incluyan el scope de
    // Fitness (DISALLOWED_OAUTH_SCOPES). No se heredan scopes previos.
    authUrl.searchParams.set('include_granted_scopes', 'false');
    authUrl.searchParams.set('state', state);

    return Response.redirect(authUrl.toString(), 302);
}

function _jsString(value) {
    return JSON.stringify(String(value == null ? '' : value))
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e');
}

function _escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _authPage({ ok, link = '', origin = '', returnPath = '/', error = '', message = '' }) {
    const safeOrigin = origin || 'https://victorgonz93.github.io';
    const safePath = sanitizeReturnPath(returnPath);
    const backUrl = `${safeOrigin}${safePath}`;
    const title = ok ? 'Google Health conectado' : 'No se pudo conectar';
    const detail = ok
        ? 'Autorización completada. Esta ventana se cerrará sola.'
        : (message || 'Google no completó la autorización. Vuelve a intentarlo desde Apex Nutrition.');
    const fallbackHref = ok
        ? `${backUrl}${backUrl.includes('?') ? '&' : '?'}health=connected&link=${encodeURIComponent(link)}`
        : backUrl;
    const payload = JSON.stringify({ type: 'apex-health-auth', ok: !!ok, link, error, message })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e');

    return new Response(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#06090F; color:#F8FAFC; font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:24px; }
  .card { width:100%; max-width:420px; background:#0F172A; border:1px solid #1E293B; border-radius:16px;
          padding:28px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,.45); }
  .icon { width:52px; height:52px; margin:0 auto 16px; border-radius:14px; display:flex; align-items:center;
          justify-content:center; font-size:26px; background:${ok ? 'rgba(16,185,129,.16)' : 'rgba(239,68,68,.16)'};
          color:${ok ? '#10B981' : '#EF4444'}; }
  h1 { font-size:1.15rem; margin:0 0 8px; }
  p { color:#94A3B8; font-size:.9rem; margin:0 0 18px; }
  a { color:#34D399; font-weight:600; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '&#10003;' : '!'}</div>
    <h1>${_escapeHtml(title)}</h1>
    <p>${_escapeHtml(detail)}</p>
    <a href="${_escapeHtml(fallbackHref)}">Volver a Apex Nutrition</a>
  </div>
<script>
(function () {
  var payload = ${payload};
  var target = ${_jsString(safeOrigin)};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, target);
    }
  } catch (e) { /* el fallback de abajo sigue funcionando */ }
  if (payload.ok) {
    setTimeout(function () { try { window.close(); } catch (e) {} }, 600);
  }
})();
</script>
</body>
</html>`, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        },
    });
}

function _redirectToApp(origin, returnPath, params) {
    const target = new URL(`${origin}${sanitizeReturnPath(returnPath)}`);
    target.hash = new URLSearchParams(params).toString();
    return new Response(null, {
        status: 302,
        headers: {
            'Location': target.toString(),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
        },
    });
}

async function _handleAuthCallback(request, env, cfg) {
    const url = new URL(request.url);
    const state = await verifyState(url.searchParams.get('state'), cfg.stateSecret);
    if (!state.ok) {
        return _authPage({ ok: false, message: 'La autorización ha caducado o no es válida. Vuelve a intentarlo desde la app.' });
    }

    const { link, origin, returnPath, mode } = state.payload;
    const redirectMode = mode === 'redirect';
    if (!origin || !isAllowedOrigin(origin, _allowedOrigins(env))) {
        return _authPage({ ok: false, message: 'El origen de la app no está permitido.' });
    }

    const oauthError = url.searchParams.get('error');
    if (oauthError) {
        const messages = {
            access_denied: 'No se concedió permiso a Google Health. Puedes volver a intentarlo cuando quieras.',
            invalid_scope: 'El permiso de Google Health no está configurado en la pantalla de consentimiento de Google Cloud.',
            redirect_uri_mismatch: 'La redirect URI del Worker no coincide exactamente con la autorizada en Google Cloud.',
            invalid_client: 'El Client ID o el Client Secret del Worker no son válidos.',
            unauthorized_client: 'El Client ID no está autorizado para este flujo OAuth.',
        };
        const message = messages[oauthError] || `Google devolvió un error: ${oauthError}`;
        if (redirectMode) {
            return _redirectToApp(origin, returnPath, { health: 'error', error: oauthError, message });
        }
        return _authPage({ ok: false, link, origin, returnPath, error: oauthError, message });
    }

    const code = url.searchParams.get('code');
    if (!code) {
        const message = 'Google no devolvió el código de autorización.';
        if (redirectMode) {
            return _redirectToApp(origin, returnPath, { health: 'error', error: 'missing_code', message });
        }
        return _authPage({ ok: false, link, origin, returnPath, message });
    }
    if (!_isConfigured(cfg)) {
        const message = 'El Worker no está configurado correctamente.';
        if (redirectMode) {
            return _redirectToApp(origin, returnPath, { health: 'error', error: 'not_configured', message });
        }
        return _authPage({ ok: false, link, origin, returnPath, message });
    }

    const token = await _tokenRequest({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
    });

    if (!token.ok || !token.data || !token.data.refresh_token) {
        const googleError = String((token.data && token.data.error) || 'token_exchange');
        console.error('[Health] Intercambio OAuth falló:', token.status, googleError);
        const message = googleError === 'invalid_grant'
            ? 'El código de autorización ya se usó o caducó. Vuelve a conectar.'
            : `Google no devolvió un refresh token (${googleError}). Revisa el Client Secret y que el cliente OAuth sea de tipo Web.`;
        if (redirectMode) {
            return _redirectToApp(origin, returnPath, { health: 'error', error: googleError, message });
        }
        return _authPage({ ok: false, link, origin, returnPath, message });
    }

    const record = {
        refreshToken: String(token.data.refresh_token),
        accessToken: String(token.data.access_token || ''),
        accessExpiresAt: Date.now() + (Number(token.data.expires_in) || 3600) * 1000,
        scope: String(token.data.scope || ''),
        createdAt: new Date().toISOString(),
    };

    const key = await _authKey(link);
    const encrypted = await encryptJSON(record, cfg.encryptionKey);
    await env.HEALTH_KV.put(key, encrypted, { expirationTtl: HANDOFF_TTL_SECONDS });

    if (redirectMode) {
        return _redirectToApp(origin, returnPath, { health: 'connected', link });
    }
    return _authPage({ ok: true, link, origin, returnPath });
}

async function _handleAuthSession(request, env, cfg) {
    if (!_isConfigured(cfg)) {
        return _error(503, 'not_configured', 'El Worker no está configurado.', request, env);
    }
    let body;
    try {
        body = await _readJson(request);
    } catch (_) {
        return _error(400, 'invalid_body', 'El cuerpo no es JSON válido.', request, env);
    }
    const link = String(body.link || '');
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(link)) {
        return _error(400, 'invalid_link', 'El código de enlace no es válido.', request, env);
    }

    const key = await _authKey(link);
    const raw = await env.HEALTH_KV.get(key);
    if (!raw) {
        return _error(400, 'link_expired', 'El enlace de conexión ha caducado. Vuelve a conectar con Google Health.', request, env);
    }

    let record;
    try {
        record = await decryptJSON(raw, cfg.encryptionKey);
    } catch (_) {
        await env.HEALTH_KV.delete(key);
        return _error(500, 'decrypt_failed', 'No se pudo leer la autorización. Vuelve a conectar.', request, env);
    }
    await env.HEALTH_KV.delete(key);

    const sessionToken = randomToken(32);
    const sessionKey = await _sessionKey(sessionToken);
    await _saveSession(sessionKey, record, env);

    return _json(200, {
        sessionToken,
        createdAt: record.createdAt || new Date().toISOString(),
    }, request, env);
}

async function _handleAuthStatus(request, env) {
    const token = _bearer(request);
    if (!token) return _error(401, 'missing_session', 'Falta el token de sesión.', request, env);
    const session = await _loadSession(env, token);
    if (!session) {
        return _json(401, { error: 'reauth_required', message: 'La sesión ha caducado. Pulsa Reconectar.' }, request, env);
    }
    return _json(200, {
        connected: true,
        createdAt: session.record.createdAt || null,
        updatedAt: session.record.updatedAt || null,
        scope: session.record.scope || '',
    }, request, env);
}

async function _handleAuthDisconnect(request, env) {
    const token = _bearer(request);
    if (!token) return _error(401, 'missing_session', 'Falta el token de sesión.', request, env);
    const session = await _loadSession(env, token);
    if (session) {
        const refreshToken = session.record && session.record.refreshToken;
        if (refreshToken) {
            try {
                await fetch(REVOKE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token: refreshToken }),
                });
            } catch (_) { /* la revocación es best-effort */ }
        }
        await env.HEALTH_KV.delete(session.sessionKey);
    }
    return _json(200, { ok: true }, request, env);
}

export default {
    async fetch(request, env = {}) {
        const origin = request.headers.get('Origin') || '';
        if (!isAllowedOrigin(origin, _allowedOrigins(env))) {
            return _json(403, { error: 'origin_not_allowed', message: 'Origen no permitido.' }, request, env);
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: _corsHeaders(origin, env) });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '') || '/';
        const cfg = _config(env, request);

        try {
            if (path === '/' && request.method === 'GET') {
                return _json(200, {
                    ok: true,
                    service: 'apex-nutrition-health',
                    configured: _isConfigured(cfg),
                    kv: !!env.HEALTH_KV,
                    scope: HEALTH_SCOPE,
                }, request, env);
            }
            if (path === '/health' && request.method === 'GET') {
                return _json(200, {
                    ok: true,
                    service: 'apex-nutrition-health',
                    configured: _isConfigured(cfg),
                    kv: !!env.HEALTH_KV,
                }, request, env);
            }
            const kvRoutes = new Set(['/auth/callback', '/auth/session', '/auth/status', '/auth/disconnect', '/steps/today']);
            if (kvRoutes.has(path) && !env.HEALTH_KV) {
                return _error(503, 'kv_missing', 'Falta el binding HEALTH_KV en el Worker.', request, env);
            }
            if (path === '/auth/start' && request.method === 'GET') {
                return await _handleAuthStart(request, env, cfg);
            }
            if (path === '/auth/callback' && request.method === 'GET') {
                return await _handleAuthCallback(request, env, cfg);
            }
            if (path === '/auth/session' && request.method === 'POST') {
                return await _handleAuthSession(request, env, cfg);
            }
            if (path === '/auth/status' && request.method === 'GET') {
                return await _handleAuthStatus(request, env);
            }
            if (path === '/auth/disconnect' && request.method === 'POST') {
                return await _handleAuthDisconnect(request, env);
            }
            if (path === '/steps/today' && request.method === 'GET') {
                return await _handleStepsToday(request, env, cfg);
            }
            return _error(404, 'not_found', 'Ruta no encontrada.', request, env);
        } catch (err) {
            console.error('[Health] Error no controlado:', err && err.message);
            return _error(500, 'internal_error', 'Error interno del Worker de salud.', request, env);
        }
    },
};

export const __test = {
    _allowedOrigins,
    _isConfigured,
    _config,
    _authPage,
    _redirectToApp,
};
