// ==================== ASISTENTE IA (BYOK) ====================
// Cada usuario usa su propia API key de OpenCode. La key:
//  - vive en una clave de localStorage separada de nutrition_config;
//  - nunca se incluye en backups, exportaciones ni importaciones;
//  - nunca se escribe en el DOM en claro ni se registra en consola;
//  - se envía únicamente al proxy configurado, que la reenvía a OpenCode.
// El proxy (Cloudflare Worker) no guarda nada; solo resuelve CORS.

import { safeGet, safeSet, getDateKey } from './storage.js';
import { escapeHTML } from './utils.js';
import { showNotification } from './ui/notifications.js';
import { buildAIContext, buildAISystemPrompt } from './ai-context.js';

export const AI_KEY_STORAGE = 'nutrition_ai_key';
export const AI_SETTINGS_STORAGE = 'nutrition_ai_settings';
export const AI_CHAT_STORAGE = 'nutrition_ai_chat';
export const AI_REPORTS_STORAGE = 'nutrition_ai_reports';

export const AI_DEFAULT_MODEL = 'beam-free';
export const AI_MAX_HISTORY = 20;
export const AI_MAX_QUESTION_CHARS = 2000;
export const AI_DEFAULT_MAX_TOKENS = 8192;
export const AI_MAX_CONTENT_CHARS = 32000;
// Beam exige reenviar el reasoning_content completo de cada turno anterior.
// Con max_tokens 8192 el razonamiento está acotado; este límite es solo una
// salvaguarda para no llenar localStorage si el proveedor devuelve algo raro.
export const AI_MAX_REASONING_CHARS = 100000;
export const AI_TEST_MAX_TOKENS = 2048;
const AI_MAX_BEAM_TURNS = 5;
// Presupuesto de caracteres del historial Beam para no acercarse al límite de
// 256 KB del Worker. Se descartan los turnos más antiguos si hace falta.
const AI_MAX_BEAM_HISTORY_CHARS = 160000;

const AI_RETRY_ATTEMPTS = 2;
const AI_RETRY_DELAY_MS = 800;
const AI_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const AI_EFFORT_OPTIONS = ['low', 'medium', 'high'];
const AI_REPORTS_LIMIT = 20;
const AI_REPORT_MAX_CHARS = 12000;
const AI_MEAL_LABELS = {
    breakfast: 'Desayuno',
    lunch: 'Comida',
    snack: 'Merienda',
    dinner: 'Cena',
};

const DEFAULT_SETTINGS = {
    proxyUrl: '',
    model: AI_DEFAULT_MODEL,
    reasoningEffort: 'medium',
    saveKey: true,
    consent: false,
    sessionId: '',
    updatedAt: '',
};

let _settingsCache = null;
let _memoryKey = '';
let _chatCache = null;
let _sending = false;
let _uiBound = false;
let _formReady = false;
let _activeAbortController = null;
let _thinkingTimer = null;
let _thinkingStartedAt = 0;
let _lastFailed = null;
let _reporting = false;

export class AIRequestError extends Error {
    constructor(message, { code = 'unknown', status = 0, detail = '' } = {}) {
        super(message);
        this.name = 'AIRequestError';
        this.code = code;
        this.status = status;
        this.detail = detail;
    }
}

function _newSessionId() {
    try {
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
    } catch (_) { /* sin crypto */ }
    return `apex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function _readStoredKey() {
    try {
        const value = localStorage.getItem(AI_KEY_STORAGE);
        return typeof value === 'string' ? value.trim() : '';
    } catch (_) {
        return '';
    }
}

function _writeStoredKey(key) {
    try {
        if (key) localStorage.setItem(AI_KEY_STORAGE, key);
        else localStorage.removeItem(AI_KEY_STORAGE);
        return true;
    } catch (_) {
        return false;
    }
}

function _normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const proxyUrl = typeof source.proxyUrl === 'string'
        ? source.proxyUrl.trim().replace(/\/+$/, '')
        : '';
    const model = typeof source.model === 'string' && source.model.trim()
        ? source.model.trim().slice(0, 120)
        : AI_DEFAULT_MODEL;
    const reasoningEffort = AI_EFFORT_OPTIONS.includes(source.reasoningEffort)
        ? source.reasoningEffort
        : 'medium';
    return {
        proxyUrl,
        model,
        reasoningEffort,
        saveKey: source.saveKey !== false,
        consent: source.consent === true,
        sessionId: typeof source.sessionId === 'string' && source.sessionId.length >= 8
            ? source.sessionId
            : _newSessionId(),
        updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
    };
}

export function getAISettings() {
    if (_settingsCache) return { ..._settingsCache };
    const stored = safeGet(AI_SETTINGS_STORAGE, {});
    const normalized = _normalizeSettings(stored);
    _settingsCache = normalized;
    // Persistir el sessionId la primera vez para que OpenCode route las
    // peticiones del mismo usuario de forma estable.
    if (!stored || stored.sessionId !== normalized.sessionId) {
        safeSet(AI_SETTINGS_STORAGE, normalized);
    }
    return { ...normalized };
}

export function getAIKey() {
    if (_memoryKey) return _memoryKey;
    const settings = getAISettings();
    return settings.saveKey ? _readStoredKey() : '';
}

export function hasAIConsent() {
    return getAISettings().consent === true;
}

export function isProxyUrlValid(url) {
    const value = String(url || '').trim();
    if (!value) return false;
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'https:') return true;
        if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)) {
            return true;
        }
        return false;
    } catch (_) {
        return false;
    }
}

function _normalizeModel(model) {
    return String(model || '').trim().slice(0, 120);
}

/**
 * Devuelve un mensaje concreto para los errores de URL más habituales.
 * GitHub Pages responde 405 a POST y OpenCode bloquea el navegador por CORS;
 * en ambos casos la solución es usar la URL del Worker.
 */
function _proxyUrlProblem(url) {
    const value = String(url || '').trim();
    if (!isProxyUrlValid(value)) {
        return 'La URL del proxy no es válida. Debe empezar por https:// (o http://localhost para pruebas).';
    }
    try {
        const parsed = new URL(value);
        if (/\.github\.io$/i.test(parsed.hostname)) {
            return 'La URL del proxy es de GitHub Pages, que no acepta POST (405). Usa la URL del Worker (https://...workers.dev).';
        }
        if (/(^|\.)opencode\.ai$/i.test(parsed.hostname)) {
            return 'Esa es la URL de OpenCode y el navegador la bloqueará por CORS. Usa la URL del Worker.';
        }
    } catch (_) { /* ya validada arriba */ }
    return '';
}

/**
 * Guarda ajustes BYOK. La API key nunca se escribe dentro del JSON de ajustes.
 * Si saveKey es false, la key queda solo en memoria durante esta sesión.
 */
export function saveAISettings(input = {}) {
    const current = getAISettings();
    const proxyUrl = input.proxyUrl === undefined
        ? current.proxyUrl
        : String(input.proxyUrl || '').trim().replace(/\/+$/, '');
    if (proxyUrl && !isProxyUrlValid(proxyUrl)) {
        return { ok: false, error: 'La URL del proxy no es válida. Usa https://... (o http://localhost para pruebas).' };
    }

    const model = input.model === undefined ? current.model : _normalizeModel(input.model);
    if (!model) return { ok: false, error: 'Indica un modelo (por ejemplo beam-free).' };

    const reasoningEffort = input.reasoningEffort === undefined
        ? (current.reasoningEffort || 'medium')
        : (AI_EFFORT_OPTIONS.includes(input.reasoningEffort) ? input.reasoningEffort : 'medium');

    const saveKey = input.saveKey === undefined ? current.saveKey : input.saveKey === true;
    const consent = input.consent === undefined ? current.consent : input.consent === true;
    const typedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';

    if (typedKey) {
        if (saveKey) {
            _writeStoredKey(typedKey);
            _memoryKey = '';
        } else {
            _writeStoredKey('');
            _memoryKey = typedKey;
        }
    } else if (saveKey) {
        // Si la key estaba solo en memoria y el usuario decide guardarla.
        if (_memoryKey && !_readStoredKey()) {
            _writeStoredKey(_memoryKey);
            _memoryKey = '';
        }
    } else {
        // Al desmarcar "guardar", mover la key existente a memoria.
        const stored = _readStoredKey();
        if (stored && !_memoryKey) _memoryKey = stored;
        _writeStoredKey('');
    }

    const next = {
        ...current,
        proxyUrl,
        model,
        reasoningEffort,
        saveKey,
        consent,
        updatedAt: new Date().toISOString(),
    };
    const persisted = safeSet(AI_SETTINGS_STORAGE, next);
    _settingsCache = next;
    return {
        ok: true,
        settings: { ...next },
        persisted,
        warning: persisted ? '' : 'Los ajustes funcionan en esta sesión, pero no se pudieron guardar en el dispositivo.',
    };
}

export function clearAIKey() {
    _memoryKey = '';
    _writeStoredKey('');
}

export function setAIConsent(value) {
    return saveAISettings({ consent: value === true });
}

export function getAIChatHistory() {
    if (_chatCache) return _chatCache.map(message => ({ ...message }));
    const stored = safeGet(AI_CHAT_STORAGE, []);
    const history = Array.isArray(stored)
        ? stored
            .filter(message => message && (message.role === 'user' || message.role === 'assistant')
                && typeof message.content === 'string' && message.content.trim())
            .map(message => {
                const item = { role: message.role, content: message.content.slice(0, AI_MAX_CONTENT_CHARS) };
                if (message.role === 'assistant' && typeof message.reasoning_content === 'string' && message.reasoning_content) {
                    item.reasoning_content = message.reasoning_content.slice(0, AI_MAX_REASONING_CHARS);
                }
                return item;
            })
            .slice(-AI_MAX_HISTORY)
        : [];
    _chatCache = history;
    return history.map(message => ({ ...message }));
}

export function saveAIChatHistory(messages) {
    const history = (Array.isArray(messages) ? messages : [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string' && message.content.trim())
        .map(message => {
            const item = { role: message.role, content: message.content.slice(0, AI_MAX_CONTENT_CHARS) };
            if (message.role === 'assistant' && typeof message.reasoning_content === 'string' && message.reasoning_content) {
                item.reasoning_content = message.reasoning_content.slice(0, AI_MAX_REASONING_CHARS);
            }
            return item;
        })
        .slice(-AI_MAX_HISTORY);
    _chatCache = history;
    return safeSet(AI_CHAT_STORAGE, history);
}

export function clearAIChatHistory() {
    _chatCache = [];
    try {
        localStorage.removeItem(AI_CHAT_STORAGE);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Construye los mensajes OpenAI. El contexto va en el mensaje de sistema y se
 * regenera en cada pregunta. El historial se limita para no crecer sin control.
 *
 * Beam Free exige reenviar el reasoning_content completo y no vacío de sus
 * respuestas anteriores; si no se hace, el segundo turno puede devolver 400.
 * Los turnos antiguos sin razonamiento se descartan. Para otros modelos no se
 * envía ese campo, porque algunos proveedores rechazan campos desconocidos.
 */
export function buildAIChatMessages(history, systemPrompt, userText, { echoReasoning = false } = {}) {
    const source = (Array.isArray(history) ? history : [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string' && message.content.trim());

    let safeHistory;
    if (echoReasoning) {
        // Beam exige un reasoning_content no vacío en cada mensaje assistant.
        // Solo reenviamos pares user/assistant completos y compatibles; los
        // turnos antiguos sin razonamiento se descartan para no provocar un 400.
        const pairs = [];
        for (let i = 0; i < source.length - 1; i++) {
            const user = source[i];
            const assistant = source[i + 1];
            if (user.role !== 'user' || assistant.role !== 'assistant') continue;
            if (typeof assistant.reasoning_content !== 'string' || !assistant.reasoning_content.trim()) continue;
            pairs.push([user, assistant]);
            i++;
        }
        const selectedPairs = [];
        let totalChars = 0;
        for (let i = pairs.length - 1; i >= 0; i--) {
            if (selectedPairs.length >= AI_MAX_BEAM_TURNS) break;
            const pair = pairs[i];
            const cost = pair.reduce((sum, message) => sum
                + message.content.length
                + (message.role === 'assistant' && typeof message.reasoning_content === 'string'
                    ? message.reasoning_content.length
                    : 0), 0);
            if (selectedPairs.length > 0 && totalChars + cost > AI_MAX_BEAM_HISTORY_CHARS) break;
            selectedPairs.unshift(pair);
            totalChars += cost;
        }
        safeHistory = selectedPairs.flat().map(message => {
            const item = { role: message.role, content: message.content.slice(0, AI_MAX_CONTENT_CHARS) };
            if (message.role === 'assistant') {
                item.reasoning_content = message.reasoning_content.slice(0, AI_MAX_REASONING_CHARS);
            }
            return item;
        });
    } else {
        safeHistory = source.slice(-10).map(message => ({
            role: message.role,
            content: message.content.slice(0, 6000),
        }));
    }

    return [
        { role: 'system', content: String(systemPrompt || '') },
        ...safeHistory,
        { role: 'user', content: String(userText || '').slice(0, AI_MAX_QUESTION_CHARS) },
    ];
}

function _contentToText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
        }).join('');
    }
    if (value && typeof value.text === 'string') return value.text;
    return '';
}

function _extractErrorDetail(payload, rawText) {
    const parsed = payload && typeof payload === 'object' ? payload : null;
    const detail = parsed
        ? (typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error?.message || parsed.message || parsed.detail || '')
        : '';
    return String(detail || rawText || '').slice(0, 300);
}

function _httpErrorMessage(status, type, detail) {
    const lower = `${type || ''} ${detail || ''}`.toLowerCase();
    if (status === 401) {
        return 'API key no válida o revocada (401). Revisa tu key de OpenCode.';
    }
    if (status === 402) {
        return 'Tu cuenta de OpenCode no tiene saldo suficiente (402). Recarga créditos o cambia de modelo.';
    }
    if (status === 403) {
        if (lower.includes('free') || lower.includes('usage') || lower.includes('go')) {
            return 'OpenCode rechazó la petición (403). Beam Free solo funciona dentro de OpenCode o con una suscripción Go activa. Revisa tu plan o usa un modelo de pago.';
        }
        return 'OpenCode rechazó la petición (403). Tu key no tiene acceso a ese modelo o el plan no lo permite.';
    }
    if (status === 404) {
        return 'No se encontró el proxy o el endpoint (404). Revisa la URL del Worker.';
    }
    if (status === 405) {
        return 'La URL configurada no acepta POST (405). Debe ser la URL del Worker (https://...workers.dev), no la de GitHub Pages ni la de OpenCode.';
    }
    if (status === 400 && lower.includes('reasoning_content')) {
        return 'OpenCode rechazó el historial de la conversación (400). Borra el historial e inténtalo de nuevo; la app ya reenvía el razonamiento de Beam Free.';
    }
    if (status === 408) {
        return 'La petición tardó demasiado (408). Inténtalo de nuevo.';
    }
    if (status === 413) {
        return 'La petición es demasiado grande (413). Borra parte del historial o prueba con una pregunta más corta.';
    }
    if (status === 429) {
        if (lower.includes('free')) {
            return 'Límite de uso gratuito alcanzado (429). Beam Free requiere una suscripción Go activa o esperar al reinicio.';
        }
        return 'Límite de uso alcanzado (429). Espera un poco o cambia de modelo.';
    }
    if (status >= 500) {
        return `El proxy o OpenCode falló (${status}). Inténtalo de nuevo en unos minutos.`;
    }
    if (lower.includes('missingsession')) {
        return 'OpenCode requiere una sesión válida. Recarga la página e inténtalo de nuevo.';
    }
    return detail
        ? `OpenCode devolvió un error (${status}): ${detail}`
        : `OpenCode devolvió un error (${status}). Revisa tu key, el modelo y la URL del proxy.`;
}

function _parseErrorResponse(status, text) {
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) { /* texto plano */ }
    const type = payload && typeof payload === 'object'
        ? (payload.type || payload.error?.type || '')
        : '';
    const detail = _extractErrorDetail(payload, text);
    return new AIRequestError(_httpErrorMessage(status, type, detail), {
        code: type || 'http_error',
        status,
        detail,
    });
}

function _deltaFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (payload.error) {
        const message = _extractErrorDetail(payload, '');
        throw new AIRequestError(message || 'OpenCode devolvió un error durante la respuesta.', {
            code: payload.error?.type || 'stream_error',
        });
    }
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    if (choice) {
        return _contentToText(choice.delta?.content)
            || _contentToText(choice.message?.content)
            || _contentToText(choice.text);
    }
    return _contentToText(payload.delta?.content) || _contentToText(payload.output_text);
}

function _reasoningFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    if (choice) {
        return _contentToText(choice.delta?.reasoning_content)
            || _contentToText(choice.delta?.reasoning)
            || _contentToText(choice.message?.reasoning_content)
            || _contentToText(choice.message?.reasoning);
    }
    return _contentToText(payload.reasoning_content) || _contentToText(payload.reasoning);
}

function _emptyResponseError(reasoning) {
    if (String(reasoning || '').trim()) {
        return new AIRequestError(
            'La IA razonó pero no llegó a escribir la respuesta (límite de tokens). Vuelve a intentarlo o cambia de modelo.',
            { code: 'reasoning_only' }
        );
    }
    return new AIRequestError('La IA no devolvió contenido. Prueba otro modelo o vuelve a intentarlo.', {
        code: 'empty_response',
    });
}

/**
 * Lee una respuesta SSE de OpenAI. Exportada para poder probarla sin red.
 * El tercer argumento es un colector opcional: { text, reasoning }.
 */
export async function readAIStream(response, onDelta, collector = null) {
    if (!response || !response.body || typeof response.body.getReader !== 'function') {
        throw new AIRequestError('El proxy devolvió una respuesta sin cuerpo. Revisa la URL del Worker.', {
            code: 'empty_body',
        });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let fullReasoning = '';

    const processLine = (line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith(':')) return;
        if (!trimmed.startsWith('data:')) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') return;
        let payload;
        try { payload = JSON.parse(data); } catch (_) { return; }
        const delta = _deltaFromPayload(payload);
        const reasoning = _reasoningFromPayload(payload);
        if (reasoning) {
            fullReasoning += reasoning;
            if (collector && typeof collector === 'object') collector.reasoning = fullReasoning;
        }
        if (delta) {
            fullText += delta;
            if (collector && typeof collector === 'object') collector.text = fullText;
            if (typeof onDelta === 'function') onDelta(delta, fullText);
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(processLine);
    }
    buffer += decoder.decode();
    if (buffer) buffer.split(/\r?\n/).forEach(processLine);

    if (collector && typeof collector === 'object') {
        collector.text = fullText;
        collector.reasoning = fullReasoning;
    }
    if (!fullText.trim()) {
        throw _emptyResponseError(fullReasoning);
    }
    return fullText;
}

function _safeHeaderValue(value) {
    const text = String(value || '').trim();
    if (/[\r\n]/.test(text)) {
        throw new AIRequestError('La configuración contiene caracteres no válidos.', { code: 'invalid_header' });
    }
    return text;
}

/**
 * Llama al proxy BYOK. El proxy reenvía Authorization y x-opencode-session.
 * No escribe la key en el cuerpo ni en logs.
 */
export async function requestAIChat({
    apiKey,
    proxyUrl,
    sessionId,
    model = AI_DEFAULT_MODEL,
    messages,
    fetchImpl = null,
    signal = null,
    onDelta = null,
    reasoningCollector = null,
    reasoningEffort = '',
    maxTokens = AI_DEFAULT_MAX_TOKENS,
    timeoutMs = 120000,
} = {}) {
    const key = _safeHeaderValue(apiKey);
    if (!key) throw new AIRequestError('Falta tu API key de OpenCode.', { code: 'missing_key' });
    const proxyProblem = _proxyUrlProblem(proxyUrl);
    if (proxyProblem) {
        throw new AIRequestError(proxyProblem, { code: 'invalid_proxy' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new AIRequestError('No hay mensajes para enviar.', { code: 'missing_messages' });
    }

    const modelName = _safeHeaderValue(_normalizeModel(model));
    if (!modelName) throw new AIRequestError('Falta el modelo de IA.', { code: 'missing_model' });
    const session = _safeHeaderValue(sessionId || _newSessionId());

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, Math.max(5000, parseInt(timeoutMs, 10) || 120000));

    const externalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', externalAbort, { once: true });
    }

    const body = {
        model: modelName,
        messages: messages.map(message => {
            const item = {
                role: message.role,
                content: typeof message.content === 'string' ? message.content : _contentToText(message.content),
            };
            // Beam Free necesita recibir el razonamiento de sus respuestas
            // anteriores. El cliente solo lo añade a mensajes assistant.
            if (message.role === 'assistant' && typeof message.reasoning_content === 'string') {
                item.reasoning_content = message.reasoning_content.slice(0, AI_MAX_REASONING_CHARS);
            }
            return item;
        }),
        stream: true,
        temperature: 0.3,
        max_tokens: Math.max(1, parseInt(maxTokens, 10) || AI_DEFAULT_MAX_TOKENS),
    };
    const effort = String(reasoningEffort || '').trim().toLowerCase();
    if (AI_REASONING_EFFORTS.has(effort)) body.reasoning_effort = effort;

    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new AIRequestError('Este navegador no permite hacer peticiones de red.', { code: 'no_fetch' });
    }

    try {
        const response = await doFetch(String(proxyUrl).trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'x-opencode-session': session,
                'Accept': 'text/event-stream, application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw _parseErrorResponse(response.status, text);
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            const raw = await response.text();
            let payload;
            try { payload = JSON.parse(raw); } catch (_) {
                throw new AIRequestError('El proxy devolvió una respuesta JSON no válida.', { code: 'invalid_json' });
            }
            const text = _deltaFromPayload(payload);
            const reasoning = _reasoningFromPayload(payload);
            if (reasoningCollector && typeof reasoningCollector === 'object') {
                reasoningCollector.text = text;
                reasoningCollector.reasoning = reasoning;
            }
            if (!text.trim()) {
                throw _emptyResponseError(reasoning);
            }
            if (typeof onDelta === 'function') onDelta(text, text);
            return text;
        }

        return await readAIStream(response, onDelta, reasoningCollector);
    } catch (error) {
        if (error instanceof AIRequestError) throw error;
        if (timedOut) {
            throw new AIRequestError('La IA tardó demasiado en responder. Inténtalo de nuevo o cambia de modelo.', {
                code: 'timeout',
            });
        }
        if (error && error.name === 'AbortError') {
            throw new AIRequestError('La petición se canceló.', { code: 'aborted' });
        }
        throw new AIRequestError(
            'No se pudo conectar con el proxy. Revisa la URL del Worker, su CORS y tu conexión a internet.',
            { code: 'network', detail: String(error && error.message ? error.message : error).slice(0, 200) }
        );
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', externalAbort);
    }
}

const RETRYABLE_AI_CODES = new Set([
    'empty_response',
    'reasoning_only',
    'empty_body',
    'network',
    'stream_error',
    'server_error',
    'rate_limit',
]);

/**
 * Los fallos transitorios (respuesta vacía, red, 5xx, 408/429) merecen un
 * segundo intento. Los errores de configuración o credenciales no se reintentan.
 */
export function isRetryableAIError(error) {
    if (!(error instanceof AIRequestError)) return false;
    if (RETRYABLE_AI_CODES.has(error.code)) return true;
    return error.status === 408 || error.status === 429 || error.status >= 500;
}

/**
 * Envuelve requestAIChat con un reintento único. El colector de razonamiento
 * debe reiniciarse desde onRetry si se reutiliza entre intentos.
 */
export async function requestAIChatWithRetry(options = {}, {
    attempts = AI_RETRY_ATTEMPTS,
    delayMs = AI_RETRY_DELAY_MS,
    onRetry = null,
} = {}) {
    const maxAttempts = Math.max(1, parseInt(attempts, 10) || 1);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await requestAIChat(options);
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !isRetryableAIError(error)) throw error;
            if (typeof onRetry === 'function') onRetry(error, attempt);
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, Math.max(0, parseInt(delayMs, 10) || 0)));
            }
            if (options.signal && options.signal.aborted) throw error;
        }
    }
    throw lastError;
}

// ==================== MARKDOWN SEGURO ====================
// El HTML se construye SIEMPRE a partir de texto escapado. No se permite HTML
// crudo del modelo, ni enlaces javascript:, ni etiquetas peligrosas.

function _escapeMarkdownText(value) {
    // Se escapan &, <, > y comillas, pero NO los backticks: son sintaxis de
    // código inline y no son peligrosos en un nodo de texto HTML.
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _renderInline(text) {
    const codes = [];
    let out = String(text).replace(/`([^`\n]+)`/g, (_match, code) => {
        const index = codes.push(`<code>${code}</code>`) - 1;
        return `\u0001IC${index}\u0001`;
    });
    out = out
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return out.replace(/\u0001IC(\d+)\u0001/g, (_match, index) => codes[Number(index)] || '');
}

export function renderSafeMarkdown(input) {
    let text = String(input ?? '').replace(/\r\n?/g, '\n').trim();
    if (!text) return '';

    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
        const index = codeBlocks.push(`<pre><code>${escapeHTML(String(code).replace(/\n$/, ''))}</code></pre>`) - 1;
        return `\u0000CODE${index}\u0000`;
    });

    text = _escapeMarkdownText(text);

    const lines = text.split('\n');
    const out = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
    };

    for (const line of lines) {
        const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
        const ol = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
        if (ul) {
            if (inOl) { out.push('</ol>'); inOl = false; }
            if (!inUl) { out.push('<ul>'); inUl = true; }
            out.push(`<li>${_renderInline(ul[1])}</li>`);
            continue;
        }
        if (ol) {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (!inOl) { out.push('<ol>'); inOl = true; }
            out.push(`<li>${_renderInline(ol[2])}</li>`);
            continue;
        }
        closeLists();
        const heading = /^\s*#{1,3}\s+(.+)$/.exec(line);
        if (heading) {
            out.push(`<strong class="ai-md-heading">${_renderInline(heading[1])}</strong>`);
        } else if (!line.trim()) {
            out.push('');
        } else {
            out.push(`${_renderInline(line)}<br>`);
        }
    }
    closeLists();

    let html = out.join('\n').replace(/(<br>\s*)+$/g, '');
    html = html.replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => codeBlocks[Number(index)] || '');
    return html;
}

// ==================== UI ====================

function _el(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function _setSetupStatus(message, type = 'info') {
    const el = _el('aiSetupStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `ai-status ai-status-${type}`;
}

function _setChatStatus(message, type = 'info') {
    const el = _el('aiChatStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `ai-status ai-status-${type}`;
}

function _setReportStatus(message, type = 'info') {
    const el = _el('aiReportStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `ai-status ai-status-${type}`;
}

function _keyPlaceholder() {
    if (_readStoredKey()) return 'Key guardada en este dispositivo (déjalo vacío para conservarla)';
    if (_memoryKey) return 'Key guardada solo en esta sesión';
    return 'oc_sk_...';
}

function _updateAISetupUI() {
    const settings = getAISettings();
    const key = getAIKey();
    const state = _el('aiSetupState');
    if (state) {
        let label = 'Sin configurar';
        let cls = 'ai-setup-state';
        if (key && settings.proxyUrl && settings.consent) {
            label = `Listo · ${settings.model}`;
            cls += ' ready';
        } else if (key && settings.proxyUrl) {
            label = 'Falta consentimiento';
            cls += ' warn';
        } else if (key) {
            label = 'Falta el proxy';
            cls += ' warn';
        }
        state.textContent = label;
        state.className = cls;
    }

    const keyInput = _el('aiApiKey');
    if (keyInput && !keyInput.value) keyInput.placeholder = _keyPlaceholder();

    const ready = !!(key && settings.proxyUrl && settings.consent && !_sending && !_reporting);
    const sendBtn = _el('aiSendBtn');
    if (sendBtn) {
        sendBtn.disabled = !ready;
        sendBtn.title = ready ? 'Enviar pregunta' : 'Configura tu key, el proxy y acepta el aviso de privacidad';
    }
    const reportBtn = _el('aiGenerateReportBtn');
    if (reportBtn) {
        reportBtn.disabled = !ready;
        reportBtn.title = ready
            ? 'Generar un informe de los últimos 7 días'
            : 'Configura tu key, el proxy y acepta el aviso de privacidad';
    }
}

function _updateComposerState() {
    _updateAISetupUI();
    const stopBtn = _el('aiStopBtn');
    if (stopBtn) stopBtn.hidden = !(_sending || _reporting);
    const stopReportBtn = _el('aiStopReportBtn');
    if (stopReportBtn) stopReportBtn.hidden = !_reporting;
    const retryBtn = _el('aiRetryBtn');
    if (retryBtn) retryBtn.hidden = !_lastFailed || _sending || _reporting;
}

function _startThinkingTimer() {
    _stopThinkingTimer();
    _thinkingStartedAt = Date.now();
    const el = _el('aiThinkingTime');
    if (el) {
        el.hidden = false;
        el.textContent = 'Pensando… 0 s';
    }
    _thinkingTimer = setInterval(() => {
        const seconds = Math.max(0, Math.round((Date.now() - _thinkingStartedAt) / 1000));
        const target = _el('aiThinkingTime');
        if (target) target.textContent = `Pensando… ${seconds} s`;
    }, 1000);
}

function _stopThinkingTimer() {
    if (_thinkingTimer) {
        clearInterval(_thinkingTimer);
        _thinkingTimer = null;
    }
    const el = _el('aiThinkingTime');
    if (el) {
        el.hidden = true;
        el.textContent = '';
    }
}

export function stopAIGeneration() {
    if (!_activeAbortController) return false;
    _activeAbortController.abort();
    if (_reporting) _setReportStatus('Deteniendo el informe…', 'warn');
    else _setChatStatus('Deteniendo la respuesta…', 'warn');
    return true;
}

export function retryLastAIMessage() {
    if (_sending || _reporting) {
        return { ok: false, error: 'Espera a que termine la operación actual.' };
    }
    if (!_lastFailed) {
        return { ok: false, error: 'No hay ningún mensaje para reintentar.' };
    }
    const { question, userWrapper, assistantWrapper } = _lastFailed;
    _lastFailed = null;
    if (userWrapper && typeof userWrapper.remove === 'function') userWrapper.remove();
    if (assistantWrapper && typeof assistantWrapper.remove === 'function') assistantWrapper.remove();
    _updateComposerState();
    return sendAIMessage(question);
}

function _scrollChat() {
    const container = _el('aiChatMessages');
    if (container) container.scrollTop = container.scrollHeight;
}

function _welcomeNode() {
    const div = document.createElement('div');
    div.className = 'ai-welcome';
    div.innerHTML = [
        '<span class="material-icons ai-welcome-icon">auto_awesome</span>',
        '<h3>Tu entrenador de datos</h3>',
        '<p>Puedo analizar tus macros, tu peso, tus entrenamientos y tu adherencia. ',
        'Configura tu API key arriba para empezar.</p>',
        '<p class="ai-welcome-note">Solo doy consejo: nunca modifico comidas, pesos ni objetivos.</p>',
    ].join('');
    return div;
}

function _appendChatMessage(role, text, { pending = false } = {}) {
    const container = _el('aiChatMessages');
    if (!container) return null;
    const welcome = container.querySelector ? container.querySelector('.ai-welcome') : null;
    if (welcome) welcome.remove();

    const wrapper = document.createElement('div');
    wrapper.className = `ai-msg ai-msg-${role}${pending ? ' ai-msg-pending' : ''}`;

    const label = document.createElement('div');
    label.className = 'ai-msg-label';
    label.textContent = role === 'user' ? 'Tú' : 'Apex Coach';
    wrapper.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    if (role === 'assistant') bubble.innerHTML = renderSafeMarkdown(text);
    else bubble.textContent = text;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    _scrollChat();
    return bubble;
}

function _renderChat() {
    const container = _el('aiChatMessages');
    if (!container) return;
    const history = getAIChatHistory();
    if (container.replaceChildren) container.replaceChildren();
    else container.innerHTML = '';
    if (history.length === 0) {
        container.appendChild(_welcomeNode());
        return;
    }
    history.forEach(message => {
        const wrapper = document.createElement('div');
        wrapper.className = `ai-msg ai-msg-${message.role}`;
        const label = document.createElement('div');
        label.className = 'ai-msg-label';
        label.textContent = message.role === 'user' ? 'Tú' : 'Apex Coach';
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        if (message.role === 'assistant') bubble.innerHTML = renderSafeMarkdown(message.content);
        else bubble.textContent = message.content;
        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
    });
    _scrollChat();
}

function _readAIForm() {
    return {
        apiKey: _el('aiApiKey')?.value ?? '',
        model: _el('aiModel')?.value ?? AI_DEFAULT_MODEL,
        reasoningEffort: _el('aiReasoningEffort')?.value ?? 'medium',
        proxyUrl: _el('aiProxyUrl')?.value ?? '',
        saveKey: _el('aiSaveKey') ? _el('aiSaveKey').checked : true,
        consent: _el('aiConsent') ? _el('aiConsent').checked : false,
    };
}

function _bindAIUI() {
    if (_uiBound) return;
    _uiBound = true;
    const textarea = _el('aiChatInput');
    if (textarea && textarea.addEventListener) {
        textarea.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendAIChat();
            }
        });
    }
}

function _validateReady(settings, key, { requireConsent = true } = {}) {
    if (!key) return 'Añade tu API key de OpenCode en la configuración de arriba.';
    if (!settings.proxyUrl) return 'Falta la URL del proxy. Despliega el Worker y pégala en la configuración.';
    const proxyProblem = _proxyUrlProblem(settings.proxyUrl);
    if (proxyProblem) return proxyProblem;
    if (requireConsent && !settings.consent) return 'Marca la casilla de consentimiento para enviar tus datos a OpenCode.';
    return '';
}

function _modelNeedsReasoningEcho(model) {
    const value = String(model || '').trim().toLowerCase();
    if (!value) return false;
    return value === 'beam'
        || value.startsWith('beam-')
        || /(^|[\/:._-])beam([\/:._-]|$)/.test(value);
}

/**
 * El formulario es la fuente de verdad cuando la pestaña IA ya se ha abierto.
 * Así "Probar conexión" y el chat usan exactamente la misma URL, modelo y key;
 * antes, probar usaba el formulario pero el chat usaba ajustes guardados.
 */
function _syncSettingsFromForm() {
    if (!_formReady) return { ok: true, settings: getAISettings() };

    const form = _readAIForm();
    const patch = {
        proxyUrl: String(form.proxyUrl || '').trim().replace(/\/+$/, ''),
        model: _normalizeModel(form.model),
        reasoningEffort: form.reasoningEffort,
        saveKey: form.saveKey === true,
        consent: form.consent === true,
    };

    const typedKey = String(form.apiKey || '').trim();
    if (typedKey) patch.apiKey = typedKey;

    const result = saveAISettings(patch);
    if (!result.ok) return result;

    if (typedKey) {
        const keyEl = _el('aiApiKey');
        if (keyEl) {
            keyEl.value = '';
            keyEl.placeholder = _keyPlaceholder();
        }
    }
    _updateAISetupUI();
    return result;
}

export function initAITab() {
    const settings = getAISettings();
    const proxyEl = _el('aiProxyUrl');
    const modelEl = _el('aiModel');
    const effortEl = _el('aiReasoningEffort');
    const saveEl = _el('aiSaveKey');
    const consentEl = _el('aiConsent');
    if (proxyEl) proxyEl.value = settings.proxyUrl;
    if (modelEl) modelEl.value = settings.model;
    if (effortEl) effortEl.value = settings.reasoningEffort;
    if (saveEl) saveEl.checked = settings.saveKey;
    if (consentEl) consentEl.checked = settings.consent;

    const keyEl = _el('aiApiKey');
    if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = _keyPlaceholder();
    }
    _formReady = !!(proxyEl && modelEl && saveEl && consentEl && keyEl);
    _chatCache = getAIChatHistory();
    // No repintar si hay una respuesta en curso: el DOM conserva el mensaje
    // pendiente y el streaming sigue escribiendo en su burbuja.
    if (!_sending) _renderChat();
    _bindAIUI();
    _updateAISetupUI();

    if (!_el('aiSetupStatus')?.textContent) {
        const key = getAIKey();
        const error = _validateReady(settings, key);
        if (error) {
            const type = key && settings.proxyUrl ? 'warn' : 'info';
            _setSetupStatus(error, type);
        } else {
            _setSetupStatus('Conexión lista. La IA recibirá tus últimos 14 días, incluidos borradores y detalle de ejercicios.', 'success');
        }
    }
    _setChatStatus('');
    _updateComposerState();
    renderAIReports();
    refreshAIContextPreview();
    return settings;
}

export function toggleAISetup() {
    const body = _el('aiSetupBody');
    const button = _el('aiSetupToggle');
    if (!body) return;
    const collapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed');
    if (button) button.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
}

export function toggleAIKeyVisibility() {
    const input = _el('aiApiKey');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    const btn = _el('aiToggleKeyBtn');
    if (btn) btn.setAttribute('aria-label', input.type === 'password' ? 'Mostrar API key' : 'Ocultar API key');
}

export function saveAISettingsFromForm() {
    const form = _readAIForm();
    const result = saveAISettings(form);
    if (!result.ok) {
        _setSetupStatus(result.error, 'error');
        return result;
    }
    _formReady = true;

    const keyEl = _el('aiApiKey');
    if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = _keyPlaceholder();
    }
    const proxyEl = _el('aiProxyUrl');
    if (proxyEl) proxyEl.value = result.settings.proxyUrl;
    const modelEl = _el('aiModel');
    if (modelEl) modelEl.value = result.settings.model;
    const effortEl = _el('aiReasoningEffort');
    if (effortEl) effortEl.value = result.settings.reasoningEffort;

    const readyError = _validateReady(result.settings, getAIKey());
    if (readyError) _setSetupStatus(readyError, 'warn');
    else _setSetupStatus(`Ajustes guardados. Conexión lista con ${result.settings.model}.`, 'success');
    if (result.warning) _setSetupStatus(result.warning, 'warn');

    _updateAISetupUI();
    showNotification(result.warning || 'Ajustes de IA guardados', result.warning ? 'warning' : 'success');
    return result;
}

export function clearAIKeyFromUI() {
    const hadKey = !!getAIKey();
    if (hadKey && typeof confirm === 'function' && !confirm('¿Borrar la API key de OpenCode de este dispositivo?')) {
        return false;
    }
    clearAIKey();
    const keyEl = _el('aiApiKey');
    if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = _keyPlaceholder();
    }
    _setSetupStatus(hadKey ? 'API key borrada. No se enviará nada sin una key nueva.' : 'No hay ninguna API key guardada.', 'info');
    _updateAISetupUI();
    return true;
}

export async function testAIConnection() {
    const synced = _syncSettingsFromForm();
    if (!synced.ok) {
        _setSetupStatus(synced.error, 'error');
        return synced;
    }
    const settings = synced.settings;
    const key = getAIKey();
    const configError = _validateReady(settings, key, { requireConsent: false });
    if (configError) {
        _setSetupStatus(configError, 'warn');
        return { ok: false, error: configError };
    }

    const button = _el('aiTestBtn');
    if (button) button.disabled = true;
    _setSetupStatus('Probando conexión con el proxy y OpenCode…', 'info');
    try {
        await requestAIChatWithRetry({
            apiKey: key,
            proxyUrl: settings.proxyUrl,
            sessionId: settings.sessionId,
            model: settings.model,
            messages: [{ role: 'user', content: 'Responde únicamente con la palabra OK.' }],
            reasoningEffort: _modelNeedsReasoningEcho(settings.model) ? 'low' : '',
            maxTokens: AI_TEST_MAX_TOKENS,
            timeoutMs: 45000,
        }, {
            attempts: AI_RETRY_ATTEMPTS,
            delayMs: AI_RETRY_DELAY_MS,
            onRetry: () => _setSetupStatus('La primera prueba no llegó completa. Reintentando…', 'info'),
        });
        if (synced.persisted === false) {
            _setSetupStatus(
                `Conexión correcta con ${settings.model}. Los ajustes funcionan en esta sesión, pero no se pudieron guardar en el dispositivo.`,
                'warn'
            );
        } else if (synced.persisted === true) {
            _setSetupStatus(`Conexión correcta con ${settings.model}. Ajustes guardados.`, 'success');
        } else {
            _setSetupStatus(`Conexión correcta con ${settings.model}.`, 'success');
        }
        showNotification('Conexión de IA correcta', 'success');
        return { ok: true };
    } catch (error) {
        const message = error instanceof AIRequestError ? error.message : 'No se pudo conectar con la IA.';
        _setSetupStatus(message, 'error');
        return { ok: false, error: message };
    } finally {
        if (button) button.disabled = false;
    }
}

export async function sendAIMessage(rawText) {
    if (_sending || _reporting) return { ok: false, error: 'Ya hay una operación en curso.' };
    const question = String(rawText || '').trim().slice(0, AI_MAX_QUESTION_CHARS);
    if (!question) return { ok: false, error: 'Escribe una pregunta.' };

    const synced = _syncSettingsFromForm();
    if (!synced.ok) {
        _setSetupStatus(synced.error, 'error');
        _setChatStatus(synced.error, 'error');
        return synced;
    }
    const settings = synced.settings;
    const key = getAIKey();
    const configError = _validateReady(settings, key);
    if (configError) {
        _setSetupStatus(configError, 'warn');
        _setChatStatus(configError, 'warn');
        return { ok: false, error: configError };
    }

    _lastFailed = null;
    const controller = new AbortController();
    _activeAbortController = controller;
    _sending = true;
    _updateComposerState();
    _setChatStatus('Pensando… La IA está leyendo tu contexto.', 'info');
    const userBubble = _appendChatMessage('user', question);
    const userWrapper = userBubble?.parentElement || userBubble;
    const bubble = _appendChatMessage('assistant', '', { pending: true });
    const assistantWrapper = bubble?.parentElement || bubble;
    if (bubble) bubble.textContent = '…';
    _startThinkingTimer();

    let lastPaint = 0;
    try {
        const context = buildAIContext({ days: 14, workoutDays: 14, foodDays: 3 });
        const systemPrompt = buildAISystemPrompt(context);
        const history = getAIChatHistory();
        const messages = buildAIChatMessages(history, systemPrompt, question, {
            echoReasoning: _modelNeedsReasoningEcho(settings.model),
        });

        const reasoningMeta = { text: '', reasoning: '' };
        const requestOptions = {
            apiKey: key,
            proxyUrl: settings.proxyUrl,
            sessionId: settings.sessionId,
            model: settings.model,
            messages,
            reasoningEffort: _modelNeedsReasoningEcho(settings.model) ? settings.reasoningEffort : '',
            maxTokens: AI_DEFAULT_MAX_TOKENS,
            reasoningCollector: reasoningMeta,
            signal: controller.signal,
            onDelta: (_delta, full) => {
                const now = Date.now();
                if (bubble && now - lastPaint > 60) {
                    lastPaint = now;
                    bubble.textContent = full;
                    _scrollChat();
                }
            },
        };
        const answer = await requestAIChatWithRetry(requestOptions, {
            attempts: AI_RETRY_ATTEMPTS,
            delayMs: AI_RETRY_DELAY_MS,
            onRetry: () => {
                // Si el primer intento se quedó sin margen razonando, el
                // reintento baja un escalón el esfuerzo.
                if (requestOptions.reasoningEffort === 'high') requestOptions.reasoningEffort = 'medium';
                else if (requestOptions.reasoningEffort === 'medium') requestOptions.reasoningEffort = 'low';
                reasoningMeta.text = '';
                reasoningMeta.reasoning = '';
                lastPaint = 0;
                if (bubble) bubble.textContent = '…';
                _setChatStatus('La primera respuesta no llegó completa. Reintentando…', 'warn');
            },
        });

        const clean = String(answer || reasoningMeta.text || '').trim();
        if (!clean) throw _emptyResponseError(reasoningMeta.reasoning);
        if (bubble) {
            bubble.innerHTML = renderSafeMarkdown(clean);
            const wrapper = bubble.parentElement;
            if (wrapper) wrapper.classList.remove('ai-msg-pending');
        }

        const assistantMessage = { role: 'assistant', content: clean };
        const reasoning = String(reasoningMeta.reasoning || '').trim();
        if (reasoning) assistantMessage.reasoning_content = reasoning.slice(0, AI_MAX_REASONING_CHARS);
        const nextHistory = [
            ...history,
            { role: 'user', content: question },
            assistantMessage,
        ];
        const historySaved = saveAIChatHistory(nextHistory);
        if (synced.persisted === false) {
            _setChatStatus('Respuesta recibida. Los ajustes no se pudieron guardar en el dispositivo; siguen activos en esta sesión.', 'warn');
        } else if (!historySaved) {
            _setChatStatus('Respuesta recibida, pero el historial no se pudo guardar en el dispositivo.', 'warn');
        } else {
            _setChatStatus('');
        }
        return { ok: true, text: clean };
    } catch (error) {
        const aborted = controller.signal.aborted
            || (error instanceof AIRequestError && error.code === 'aborted');
        if (aborted) {
            if (bubble) {
                bubble.textContent = 'Respuesta detenida.';
                const wrapper = bubble.parentElement;
                if (wrapper) wrapper.classList.remove('ai-msg-pending');
            }
            _setChatStatus('Respuesta detenida. Puedes reintentarla o preguntar otra cosa.', 'warn');
            _lastFailed = { question, userWrapper, assistantWrapper };
            return { ok: false, error: 'Respuesta detenida.', aborted: true };
        }

        const message = error instanceof AIRequestError
            ? error.message
            : 'No se pudo obtener respuesta de la IA.';
        if (bubble) {
            bubble.textContent = message;
            bubble.classList.add('ai-bubble-error');
            const wrapper = bubble.parentElement;
            if (wrapper) {
                wrapper.classList.remove('ai-msg-pending');
                wrapper.classList.add('ai-msg-error');
            }
        }
        _setChatStatus(message, 'error');
        _lastFailed = { question, userWrapper, assistantWrapper };
        return { ok: false, error: message };
    } finally {
        if (_activeAbortController === controller) _activeAbortController = null;
        _sending = false;
        _stopThinkingTimer();
        _updateComposerState();
        _scrollChat();
        refreshAIContextPreview();
    }
}

export function sendAIChat(textOverride) {
    if (_sending || _reporting) {
        _setChatStatus('Espera a que termine la operación actual.', 'warn');
        return { ok: false, error: 'Ya hay una operación en curso.' };
    }
    const input = _el('aiChatInput');
    const text = typeof textOverride === 'string' ? textOverride : (input ? input.value : '');
    if (input && typeof textOverride !== 'string') input.value = '';
    return sendAIMessage(text);
}

export function askAIQuick(question) {
    return sendAIMessage(question);
}

// ==================== CONTEXTO QUE VE LA IA ====================

function _formatShortDate(dateKey) {
    if (!dateKey) return '';
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(dateKey);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function _renderAIContextPreview(context) {
    const summaryEl = _el('aiContextSummary');
    const detailsEl = _el('aiContextDetails');
    const timeEl = _el('aiContextTime');
    const updatedEl = _el('aiContextUpdated');
    if (!summaryEl || !detailsEl) return;

    const settings = getAISettings();
    const history = getAIChatHistory();
    const loggedDays = context.adherence?.loggedDays || 0;
    const windowDays = context.windowDays || 14;
    const workouts = context.workouts?.recent || [];
    const drafts = context.workouts?.drafts || [];
    const weight = context.weight || {};
    const foodsDays = context.recentFoods?.length || 0;
    const trend = Number.isFinite(weight.trendKgPerWeek)
        ? `${weight.trendKgPerWeek > 0 ? '+' : ''}${weight.trendKgPerWeek.toFixed(2)} kg/sem`
        : 'sin tendencia';
    const effortLabel = { low: 'Bajo', medium: 'Medio', high: 'Alto' }[settings.reasoningEffort] || 'Medio';
    const needsReasoning = _modelNeedsReasoningEcho(settings.model);
    let beamTurns = 0;
    if (needsReasoning) {
        for (let i = 0; i < history.length - 1; i++) {
            const user = history[i];
            const assistant = history[i + 1];
            if (user.role === 'user' && assistant.role === 'assistant'
                && typeof assistant.reasoning_content === 'string'
                && assistant.reasoning_content.trim()) {
                beamTurns++;
                i++;
            }
        }
    }
    const historyLabel = needsReasoning
        ? `${Math.min(5, beamTurns)} turnos`
        : `${Math.min(10, history.length)} mensajes`;
    const draftLabel = drafts.length === 0
        ? 'sin borradores'
        : `${drafts.length} borrador${drafts.length === 1 ? '' : 'es'}`;
    const shortSummary = `${loggedDays}/${windowDays} días · ${workouts.length} entrenos · ${draftLabel}`;

    if (timeEl) timeEl.textContent = shortSummary;
    if (updatedEl) {
        const updated = new Date(context.generatedAt || Date.now());
        updatedEl.textContent = `Actualizado ${updated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · modelo ${settings.model} · esfuerzo ${effortLabel}`;
    }

    summaryEl.innerHTML = [
        `<div class="ai-context-stat"><span>Comidas</span><strong>${loggedDays}/${windowDays} días</strong><small>${foodsDays} días con alimentos</small></div>`,
        `<div class="ai-context-stat"><span>Entrenos</span><strong>${workouts.length} realizados</strong><small>${draftLabel}</small></div>`,
        `<div class="ai-context-stat"><span>Peso</span><strong>${weight.latestWeightKg ?? '-'} kg</strong><small>${trend}</small></div>`,
        `<div class="ai-context-stat"><span>Chat</span><strong>${historyLabel}</strong><small>${escapeHTML(settings.model)}</small></div>`,
    ].join('');

    const workoutItems = [
        ...drafts.map(workout => ({ ...workout, _draft: true })),
        ...workouts.map(workout => ({ ...workout, _draft: false })),
    ]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 6);

    const workoutHtml = workoutItems.length
        ? workoutItems.map(workout => {
            const names = Array.isArray(workout.exerciseDetails) && workout.exerciseDetails.length
                ? workout.exerciseDetails.map(exercise => exercise.name).slice(0, 5).join(' · ')
                : `${workout.exercises || 0} ejercicios`;
            return `<div class="ai-context-item">
                <span class="ai-context-date">${escapeHTML(_formatShortDate(workout.date))}</span>
                <strong>${escapeHTML(names)}</strong>
                <span class="ai-context-badge${workout._draft ? ' draft' : ''}">${workout._draft ? 'Borrador' : 'Realizado'}</span>
            </div>`;
        }).join('')
        : '<p class="ai-hint">No hay entrenos en la ventana de 14 días.</p>';

    const foodItems = (context.recentFoods || [])
        .slice()
        .reverse()
        .map(day => {
            const meals = Object.keys(day.meals || {}).map(slot => {
                const items = (day.meals[slot] || []).map(food => {
                    const quantity = food.quantity
                        ? ` (${food.quantity}${food.unit ? ` ${food.unit}` : ''})`
                        : '';
                    return `${food.name}${quantity}`;
                }).join(', ');
                return `<div><strong>${escapeHTML(AI_MEAL_LABELS[slot] || slot)}</strong>: ${escapeHTML(items)}</div>`;
            }).join('');
            return `<div class="ai-context-item ai-context-food-day">
                <span class="ai-context-date">${escapeHTML(_formatShortDate(day.date))}</span>
                <div>${meals}</div>
            </div>`;
        }).join('');

    detailsEl.innerHTML = [
        `<div class="ai-context-section"><h4>Entrenos</h4><div class="ai-context-list">${workoutHtml}</div></div>`,
        foodItems
            ? `<div class="ai-context-section"><h4>Comidas recientes</h4><div class="ai-context-list">${foodItems}</div></div>`
            : '',
    ].join('');
}

function _dynamicPromptButton(label, question) {
    const safeQuestion = String(question || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
    return `<button type="button" onclick="askAIQuick('${escapeHTML(safeQuestion)}')">${escapeHTML(label)}</button>`;
}

function _renderAIDynamicPrompts(context) {
    const container = _el('aiDynamicPrompts');
    if (!container) return;

    const goals = context && context.goals;
    const today = context && Array.isArray(context.days)
        ? (context.days.find(day => day.date === context.today) || context.days[context.days.length - 1])
        : null;
    if (!goals || !today) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }

    const consumed = {
        kcal: Number(today.kcal) || 0,
        protein: Number(today.proteinG) || 0,
        carbs: Number(today.carbsG) || 0,
        fats: Number(today.fatsG) || 0,
    };
    const targets = {
        kcal: Number(goals.targetKcal) || 0,
        protein: Number(goals.proteinG) || 0,
        carbs: Number(goals.carbsG) || 0,
        fats: Number(goals.fatsG) || 0,
    };
    const remaining = {
        kcal: Math.round(targets.kcal - consumed.kcal),
        protein: Math.round(targets.protein - consumed.protein),
        carbs: Math.round(targets.carbs - consumed.carbs),
        fats: Math.round(targets.fats - consumed.fats),
    };

    const chips = [];
    const add = (label, question) => chips.push(_dynamicPromptButton(label, question));

    if (!today.logged) {
        add(
            'Planificar el día',
            'Aún no he registrado nada hoy. ¿Cómo reparto mis objetivos de calorías y macros entre las comidas del día?'
        );
    } else {
        if (remaining.protein > 5) {
            add(
                `Cubrir ${remaining.protein} g de proteína`,
                `Me quedan ${remaining.protein} g de proteína hoy. ¿Cómo puedo cubrirlos en las comidas que me quedan sin pasarme de calorías?`
            );
        } else if (remaining.protein < -5) {
            add(
                `Proteína +${Math.abs(remaining.protein)} g`,
                `Hoy he superado mi objetivo de proteína en ${Math.abs(remaining.protein)} g. ¿Es un problema o puedo mantenerlo así?`
            );
        }

        if (remaining.carbs > 10) {
            add(
                `Cubrir ${remaining.carbs} g de carbohidratos`,
                `Me quedan ${remaining.carbs} g de carbohidratos hoy. ¿Cómo los reparto en las comidas que me quedan sin pasarme de calorías ni de grasas?`
            );
        } else if (remaining.carbs < -10) {
            add(
                `Me pasé ${Math.abs(remaining.carbs)} g de carbohidratos`,
                `Me he pasado ${Math.abs(remaining.carbs)} g de carbohidratos hoy. ¿Cómo ajusto el resto del día?`
            );
        }

        if (remaining.fats > 5) {
            add(
                `Cubrir ${remaining.fats} g de grasas`,
                `Me quedan ${remaining.fats} g de grasas hoy. ¿Cómo las reparto en las comidas que me quedan sin pasarme de calorías?`
            );
        } else if (remaining.fats < -5) {
            add(
                `Me pasé ${Math.abs(remaining.fats)} g de grasas`,
                `Me he pasado ${Math.abs(remaining.fats)} g de grasas hoy. ¿Cómo ajusto el resto del día?`
            );
        }

        if (remaining.kcal > 100) {
            add(
                `Cerrar ${remaining.kcal} kcal`,
                `Me quedan ${remaining.kcal} kcal hoy. ¿Qué comidas me recomiendas para cerrar el día?`
            );
        } else if (remaining.kcal < -100) {
            add(
                `Me pasé ${Math.abs(remaining.kcal)} kcal`,
                `Me he pasado ${Math.abs(remaining.kcal)} kcal hoy. ¿Cómo ajusto el resto del día?`
            );
        }

        if (chips.length === 0) {
            add(
                'Cerrar el día',
                'Estoy cerca de mis objetivos de hoy. ¿Qué cena ligera me recomiendas para cerrar el día?'
            );
        }
    }

    container.innerHTML = `
        <div class="ai-dynamic-label">Según lo que te queda hoy</div>
        <div class="ai-quick-prompts">${chips.join('')}</div>
    `;
    container.hidden = false;
}

export function refreshAIContextPreview() {
    if (!_el('aiContextSummary')) return null;
    try {
        const context = buildAIContext({ days: 14, workoutDays: 14, foodDays: 3 });
        _renderAIContextPreview(context);
        _renderAIDynamicPrompts(context);
        return context;
    } catch (_) {
        const summary = _el('aiContextSummary');
        if (summary) summary.innerHTML = '<p class="ai-hint">No se pudo construir el contexto.</p>';
        const time = _el('aiContextTime');
        if (time) time.textContent = 'Error al actualizar';
        const dynamic = _el('aiDynamicPrompts');
        if (dynamic) {
            dynamic.innerHTML = '';
            dynamic.hidden = true;
        }
        return null;
    }
}

export function toggleAIContextPreview() {
    const body = _el('aiContextBody');
    const button = _el('aiContextToggle');
    if (!body) return;
    const collapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed');
    if (button) button.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
}

// ==================== INFORMES SEMANALES ====================

function _normalizeReport(report) {
    if (!report || typeof report !== 'object' || typeof report.text !== 'string' || !report.text.trim()) return null;
    const fallbackId = `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const id = String(report.id || fallbackId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || fallbackId;
    return {
        id,
        createdAt: typeof report.createdAt === 'string' ? report.createdAt : '',
        weekStart: typeof report.weekStart === 'string' ? report.weekStart : '',
        weekEnd: typeof report.weekEnd === 'string' ? report.weekEnd : '',
        model: String(report.model || '').slice(0, 120),
        text: report.text.slice(0, AI_REPORT_MAX_CHARS),
    };
}

export function getAIReports() {
    const stored = safeGet(AI_REPORTS_STORAGE, []);
    return (Array.isArray(stored) ? stored : [])
        .map(_normalizeReport)
        .filter(Boolean)
        .slice(0, AI_REPORTS_LIMIT);
}

export function saveAIReports(reports) {
    const clean = (Array.isArray(reports) ? reports : [])
        .map(_normalizeReport)
        .filter(Boolean)
        .slice(0, AI_REPORTS_LIMIT);
    return safeSet(AI_REPORTS_STORAGE, clean);
}

function _formatReportRange(report) {
    const start = _formatShortDate(report.weekStart);
    const end = _formatShortDate(report.weekEnd);
    return start && end ? `Semana del ${start} al ${end}` : 'Informe semanal';
}

export function renderAIReports() {
    const container = _el('aiReportsList');
    if (!container) return;
    const reports = getAIReports();
    if (reports.length === 0) {
        container.innerHTML = '<p class="ai-hint">Aún no hay informes guardados. Genera el primero con el botón de arriba.</p>';
        return;
    }
    container.innerHTML = reports.map(report => `
        <details class="ai-report">
            <summary>
                <span class="ai-report-range">${escapeHTML(_formatReportRange(report))}</span>
                <span class="ai-report-meta">${escapeHTML(report.model || '')}</span>
            </summary>
            <div class="ai-report-body">${renderSafeMarkdown(report.text)}</div>
            <button type="button" class="ai-link-btn" onclick="deleteAIReport('${report.id}')">
                <span class="material-icons">delete</span>
                Borrar informe
            </button>
        </details>
    `).join('');
}

export function deleteAIReport(id) {
    const target = String(id || '');
    const reports = getAIReports();
    const next = reports.filter(report => report.id !== target);
    if (next.length === reports.length) return false;
    if (typeof confirm === 'function' && !confirm('¿Borrar este informe semanal?')) return false;
    const saved = safeSet(AI_REPORTS_STORAGE, next);
    if (saved) {
        renderAIReports();
        showNotification('Informe semanal borrado', 'success');
    }
    return saved;
}

export async function generateWeeklyReport() {
    if (_sending || _reporting) {
        return { ok: false, error: 'Espera a que termine la operación actual.' };
    }
    const synced = _syncSettingsFromForm();
    if (!synced.ok) {
        _setReportStatus(synced.error, 'error');
        return synced;
    }
    const settings = synced.settings;
    const key = getAIKey();
    const configError = _validateReady(settings, key);
    if (configError) {
        _setReportStatus(configError, 'warn');
        return { ok: false, error: configError };
    }

    const button = _el('aiGenerateReportBtn');
    if (button) button.disabled = true;
    _reporting = true;
    const controller = new AbortController();
    _activeAbortController = controller;
    _updateComposerState();
    _setReportStatus('Generando informe semanal…', 'info');

    try {
        const context = buildAIContext({ days: 14, workoutDays: 14, foodDays: 3 });
        const reports = getAIReports();
        const previous = reports[0];
        const now = new Date();
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        const weekStartKey = getDateKey(weekStart);
        const weekEndKey = getDateKey(now);
        const instruction = [
            'TAREA: Genera un informe semanal de nutrición y entrenamiento en español.',
            `Céntrate en el periodo ${weekStartKey}..${weekEndKey}. Usa los 14 días del contexto solo como referencia.`,
            'Estructura: 1) Resumen ejecutivo (2-3 frases), 2) Adherencia y macros, 3) Peso y tendencia, 4) Entrenamiento y volumen, 5) 3 recomendaciones concretas para la próxima semana.',
            'Usa solo los datos del JSON. Distingue datos observados de estimaciones. Sé específico con fechas y números. No inventes. Máximo 500 palabras.',
            previous ? `Informe anterior para comparar (no lo repitas literalmente): ${previous.text.slice(0, 2000)}` : '',
        ].filter(Boolean).join('\n');
        const messages = [
            { role: 'system', content: `${buildAISystemPrompt(context)}\n\n${instruction}` },
            { role: 'user', content: 'Genera mi informe semanal con los datos anteriores.' },
        ];
        const reasoningMeta = { text: '', reasoning: '' };
        const requestOptions = {
            apiKey: key,
            proxyUrl: settings.proxyUrl,
            sessionId: settings.sessionId,
            model: settings.model,
            messages,
            reasoningEffort: _modelNeedsReasoningEcho(settings.model) ? settings.reasoningEffort : '',
            maxTokens: AI_DEFAULT_MAX_TOKENS,
            reasoningCollector: reasoningMeta,
            signal: controller.signal,
        };
        const answer = await requestAIChatWithRetry(requestOptions, {
            attempts: AI_RETRY_ATTEMPTS,
            delayMs: AI_RETRY_DELAY_MS,
            onRetry: () => {
                if (requestOptions.reasoningEffort === 'high') requestOptions.reasoningEffort = 'medium';
                else if (requestOptions.reasoningEffort === 'medium') requestOptions.reasoningEffort = 'low';
                reasoningMeta.text = '';
                reasoningMeta.reasoning = '';
                _setReportStatus('La primera respuesta no llegó completa. Reintentando…', 'warn');
            },
        });

        const clean = String(answer || reasoningMeta.text || '').trim();
        if (!clean) throw _emptyResponseError(reasoningMeta.reasoning);

        const report = {
            id: `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: now.toISOString(),
            weekStart: weekStartKey,
            weekEnd: weekEndKey,
            model: settings.model,
            text: clean.slice(0, AI_REPORT_MAX_CHARS),
        };
        const saved = saveAIReports([report, ...reports]);
        renderAIReports();
        _setReportStatus(
            saved ? 'Informe semanal guardado.' : 'Informe generado, pero no se pudo guardar en el dispositivo.',
            saved ? 'success' : 'warn'
        );
        showNotification(saved ? 'Informe semanal guardado' : 'Informe generado sin guardar', saved ? 'success' : 'warning');
        refreshAIContextPreview();
        return { ok: true, report };
    } catch (error) {
        const aborted = controller.signal.aborted
            || (error instanceof AIRequestError && error.code === 'aborted');
        const message = aborted
            ? 'Informe detenido.'
            : (error instanceof AIRequestError ? error.message : 'No se pudo generar el informe semanal.');
        _setReportStatus(message, aborted ? 'warn' : 'error');
        return { ok: false, error: message, aborted };
    } finally {
        if (_activeAbortController === controller) _activeAbortController = null;
        _reporting = false;
        _updateComposerState();
    }
}

export function clearAIChat() {
    if (_sending) {
        _setChatStatus('Espera a que termine la respuesta antes de borrar el historial.', 'warn');
        return false;
    }
    const history = getAIChatHistory();
    if (history.length > 0 && typeof confirm === 'function'
        && !confirm('¿Borrar el historial de conversación de este dispositivo?')) {
        return false;
    }
    clearAIChatHistory();
    _chatCache = [];
    _lastFailed = null;
    _renderChat();
    _setChatStatus('Historial borrado.', 'info');
    _updateComposerState();
    refreshAIContextPreview();
    return true;
}

// Solo para tests: limpia cachés en memoria sin tocar localStorage.
export function __resetAIForTests() {
    _settingsCache = null;
    _memoryKey = '';
    _chatCache = null;
    _sending = false;
    _uiBound = false;
    _formReady = false;
    _activeAbortController = null;
    if (_thinkingTimer) {
        clearInterval(_thinkingTimer);
        _thinkingTimer = null;
    }
    _thinkingStartedAt = 0;
    _lastFailed = null;
    _reporting = false;
}
