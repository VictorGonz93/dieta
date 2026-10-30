// ==================== APEX NUTRITION — PROXY CORS (BYOK) ====================
// Puente sin estado entre la app estática y la API de OpenCode.
//
// Qué hace:
//  1. Responde al preflight CORS.
//  2. Valida el origen permitido.
//  3. Reenvía la petición del usuario con SU cabecera Authorization.
//  4. Devuelve la respuesta (incluido streaming SSE) con CORS.
//
// Qué NO hace:
//  - No guarda la API key.
//  - No tiene ninguna key propia ni secretos configurados.
//  - No registra cabeceras, cuerpos ni respuestas.
//  - No usa KV, D1, R2 ni caché.

const DEFAULT_UPSTREAM = 'https://opencode.ai/inference/go/openai/v1/chat/completions';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_MESSAGES = 80;

function _allowedOrigins(env) {
    const raw = String(env && env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS : 'https://victorgonz93.github.io');
    return raw.split(',')
        .map(origin => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function _originAllowed(origin, allowed) {
    if (!origin) return true; // curl / server-to-server; la seguridad real es la key del usuario
    return allowed.includes('*') || allowed.includes(origin.replace(/\/+$/, ''));
}

function _corsHeaders(origin, allowed) {
    const headers = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Opencode-Session',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
        'Cache-Control': 'no-store',
    };
    if (allowed.includes('*')) {
        headers['Access-Control-Allow-Origin'] = '*';
    } else if (origin && allowed.includes(origin.replace(/\/+$/, ''))) {
        headers['Access-Control-Allow-Origin'] = origin;
    } else if (!origin && allowed.length > 0) {
        headers['Access-Control-Allow-Origin'] = allowed[0];
    }
    return headers;
}

function _json(status, payload, origin, allowed, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ..._corsHeaders(origin, allowed),
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders,
        },
    });
}

function _parseJson(raw) {
    try {
        return { ok: true, value: JSON.parse(raw) };
    } catch (_) {
        return { ok: false, value: null };
    }
}

function _cleanMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    const cleaned = [];
    for (const message of messages.slice(-MAX_MESSAGES)) {
        if (!message || typeof message !== 'object') continue;
        const role = message.role;
        if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
        const content = typeof message.content === 'string'
            ? message.content
            : Array.isArray(message.content)
                ? message.content
                    .filter(part => part && typeof part === 'object')
                    .map(part => ({ type: String(part.type || 'text'), text: String(part.text || '') }))
                : '';
        if (typeof content === 'string' && !content.trim()) continue;
        cleaned.push({ role, content });
    }
    return cleaned.length > 0 ? cleaned : null;
}

export default {
    async fetch(request, env = {}) {
        const origin = request.headers.get('Origin') || '';
        const allowed = _allowedOrigins(env);
        const originOk = _originAllowed(origin, allowed);

        if (request.method === 'OPTIONS') {
            if (!originOk) return _json(403, { error: 'Origen no permitido' }, '', allowed);
            return new Response(null, {
                status: 204,
                headers: _corsHeaders(origin, allowed),
            });
        }

        if (request.method !== 'POST') {
            return _json(405, { error: 'Método no permitido. Usa POST.' }, origin, allowed);
        }

        if (!originOk) {
            return _json(403, { error: 'Origen no permitido' }, '', allowed);
        }

        const authorization = request.headers.get('Authorization') || '';
        if (!/^Bearer\s+\S+$/i.test(authorization.trim())) {
            return _json(401, {
                error: { type: 'missing_api_key', message: 'Falta la cabecera Authorization: Bearer <tu key>.' },
            }, origin, allowed);
        }

        const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
            return _json(415, {
                error: { type: 'unsupported_media_type', message: 'Envía el cuerpo como application/json.' },
            }, origin, allowed);
        }

        const declaredLength = parseInt(request.headers.get('Content-Length') || '0', 10);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
            return _json(413, {
                error: { type: 'payload_too_large', message: 'La petición supera el límite de 256 KB.' },
            }, origin, allowed);
        }

        let rawBody;
        try {
            rawBody = await request.text();
        } catch (_) {
            return _json(400, { error: { type: 'invalid_body', message: 'No se pudo leer el cuerpo.' } }, origin, allowed);
        }
        if (rawBody.length > MAX_BODY_BYTES) {
            return _json(413, {
                error: { type: 'payload_too_large', message: 'La petición supera el límite de 256 KB.' },
            }, origin, allowed);
        }

        const parsed = _parseJson(rawBody);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
            return _json(400, { error: { type: 'invalid_json', message: 'El cuerpo no es JSON válido.' } }, origin, allowed);
        }

        const body = parsed.value;
        const messages = _cleanMessages(body.messages);
        if (!messages) {
            return _json(400, {
                error: { type: 'invalid_messages', message: 'Faltan mensajes válidos o están vacíos.' },
            }, origin, allowed);
        }

        const stream = body.stream !== false;
        const forwarded = {
            model: typeof body.model === 'string' && body.model.trim()
                ? body.model.trim().slice(0, 120)
                : 'beam-free',
            messages,
            stream,
        };
        const temperature = Number(body.temperature);
        if (Number.isFinite(temperature)) forwarded.temperature = Math.min(2, Math.max(0, temperature));
        const maxTokens = Number(body.max_tokens);
        if (Number.isFinite(maxTokens)) forwarded.max_tokens = Math.min(4096, Math.max(1, Math.floor(maxTokens)));

        const sessionId = String(request.headers.get('x-opencode-session') || '').replace(/[\r\n]+/g, '').trim().slice(0, 200)
            || (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
                ? globalThis.crypto.randomUUID()
                : `apex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

        const upstreamUrl = String(env.OPENCODE_ENDPOINT || DEFAULT_UPSTREAM);

        try {
            const upstream = await fetch(upstreamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authorization.trim(),
                    'x-opencode-session': sessionId,
                    'User-Agent': 'ApexNutrition/AI-Proxy (BYOK; +https://github.com/victorgonz93/dieta)',
                    'Accept': stream ? 'text/event-stream, application/json' : 'application/json',
                },
                body: JSON.stringify(forwarded),
            });

            const responseHeaders = {
                ..._corsHeaders(origin, allowed),
                'Content-Type': upstream.headers.get('Content-Type')
                    || (stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8'),
                'Cache-Control': 'no-store',
                'X-Accel-Buffering': 'no',
            };

            // Se devuelve el cuerpo tal cual: streaming SSE sin buffering y
            // errores de OpenCode con su status original.
            return new Response(upstream.body, {
                status: upstream.status,
                headers: responseHeaders,
            });
        } catch (_) {
            return _json(502, {
                error: {
                    type: 'proxy_error',
                    message: 'No se pudo contactar con OpenCode. Revisa la configuración del Worker.',
                },
            }, origin, allowed);
        }
    },
};
