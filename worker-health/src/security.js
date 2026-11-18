// ==================== APEX HEALTH — CRIPTOGRAFÍA Y UTILIDADES ====================
// Módulo sin dependencias de Cloudflare para poder probarlo en Node.
//
// - Firma el `state` de OAuth con HMAC-SHA256.
// - Cifra el refresh token con AES-256-GCM antes de guardarlo en KV.
// - Normaliza fechas y parsea la respuesta de dailyRollUp.

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('base64_invalid');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function randomToken(byteLength = 32) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
}

export async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', _encoder.encode(String(value)));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function _timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function _hmac(secret, value) {
    const key = await crypto.subtle.importKey(
        'raw',
        _encoder.encode(String(secret)),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, _encoder.encode(String(value)));
    return bytesToBase64Url(new Uint8Array(signature));
}

export async function signState(payload, secret) {
    if (!secret) throw new Error('missing_state_secret');
    const body = bytesToBase64Url(_encoder.encode(JSON.stringify(payload)));
    const signature = await _hmac(secret, body);
    return `${body}.${signature}`;
}

export async function verifyState(state, secret, maxAgeMs = STATE_MAX_AGE_MS) {
    if (!secret) return { ok: false, error: 'missing_state_secret' };
    const parts = String(state || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'invalid_state' };

    const expected = await _hmac(secret, parts[0]);
    if (!_timingSafeEqual(parts[1], expected)) return { ok: false, error: 'invalid_signature' };

    let payload;
    try {
        payload = JSON.parse(_decoder.decode(base64UrlToBytes(parts[0])));
    } catch (_) {
        return { ok: false, error: 'invalid_payload' };
    }
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_payload' };

    const issuedAt = Number(payload.iat);
    if (!Number.isFinite(issuedAt)) return { ok: false, error: 'invalid_iat' };
    const age = Date.now() - issuedAt;
    if (age < 0 || age > maxAgeMs) return { ok: false, error: 'expired_state' };

    return { ok: true, payload };
}

async function _importAesKey(secret) {
    const raw = base64UrlToBytes(String(secret || '').trim());
    if (raw.length !== 32) throw new Error('invalid_encryption_key');
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(value, secret) {
    const key = await _importAesKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        _encoder.encode(JSON.stringify(value))
    );
    return JSON.stringify({
        v: 1,
        iv: bytesToBase64Url(iv),
        ct: bytesToBase64Url(new Uint8Array(ciphertext)),
    });
}

export async function decryptJSON(payload, secret) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.ct) throw new Error('invalid_ciphertext');
    const key = await _importAesKey(secret);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64UrlToBytes(parsed.iv) },
        key,
        base64UrlToBytes(parsed.ct)
    );
    return JSON.parse(_decoder.decode(plaintext));
}

export function isAllowedOrigin(origin, allowedOrigins) {
    if (!origin) return true; // peticiones sin navegador; el bearer sigue siendo obligatorio
    const normalized = String(origin).replace(/\/+$/, '');
    return allowedOrigins.some(allowed => allowed === '*' || allowed.replace(/\/+$/, '') === normalized);
}

export function sanitizeReturnPath(value) {
    const raw = String(value || '/').trim();
    // Solo rutas relativas simples del mismo origen. Evita //host, query
    // strings, comillas y cualquier carácter que pueda inyectarse en HTML.
    if (raw.length > 300 || raw.startsWith('//')) return '/';
    if (!/^\/[A-Za-z0-9/._~-]*$/.test(raw)) return '/';
    return raw;
}

export function normalizeDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
}

export function buildDailyRollupBody(dateKey) {
    const normalized = normalizeDateKey(dateKey);
    if (!normalized) throw new Error('invalid_date');
    const [year, month, day] = normalized.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return {
        range: {
            start: {
                date: { year, month, day },
                time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
            },
            end: {
                date: {
                    year: next.getUTCFullYear(),
                    month: next.getUTCMonth() + 1,
                    day: next.getUTCDate(),
                },
                time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
            },
        },
        windowSizeDays: 1,
    };
}

export function parseDailyRollupSteps(data) {
    const points = Array.isArray(data && data.rollupDataPoints) ? data.rollupDataPoints : [];
    let steps = 0;
    let hasData = false;
    for (const point of points) {
        const raw = point && point.steps ? point.steps.countSum : undefined;
        if (raw === undefined || raw === null) continue;
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        steps += value;
        hasData = true;
    }
    return {
        steps: Math.max(0, Math.round(steps)),
        hasData,
        points: points.length,
    };
}

// Se exporta para las pruebas; el Worker no usa estas funciones directamente.
export const __test = {
    STATE_MAX_AGE_MS,
    _hmac,
    _timingSafeEqual,
};
