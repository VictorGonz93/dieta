// ==================== ASISTENTE IA (BYOK) ====================
// Cada usuario usa su propia API key de OpenCode. La key:
//  - vive en una clave de localStorage separada de nutrition_config;
//  - nunca se incluye en backups, exportaciones ni importaciones;
//  - nunca se escribe en el DOM en claro ni se registra en consola;
//  - se envía únicamente al proxy configurado, que la reenvía a OpenCode.
// El proxy (Cloudflare Worker) no guarda nada; solo resuelve CORS.

import { safeGet, safeSet } from './storage.js';
import { escapeHTML } from './utils.js';
import { showNotification } from './ui/notifications.js';
import { buildAIContext, buildAISystemPrompt } from './ai-context.js';

export const AI_KEY_STORAGE = 'nutrition_ai_key';
export const AI_SETTINGS_STORAGE = 'nutrition_ai_settings';
export const AI_CHAT_STORAGE = 'nutrition_ai_chat';

export const AI_DEFAULT_MODEL = 'beam-free';
export const AI_MAX_HISTORY = 20;
export const AI_MAX_QUESTION_CHARS = 2000;

const DEFAULT_SETTINGS = {
    proxyUrl: '',
    model: AI_DEFAULT_MODEL,
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
    return {
        proxyUrl,
        model,
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
            .map(message => ({ role: message.role, content: message.content.slice(0, 6000) }))
            .slice(-AI_MAX_HISTORY)
        : [];
    _chatCache = history;
    return history.map(message => ({ ...message }));
}

export function saveAIChatHistory(messages) {
    const history = (Array.isArray(messages) ? messages : [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string' && message.content.trim())
        .map(message => ({ role: message.role, content: message.content.slice(0, 6000) }))
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
 */
export function buildAIChatMessages(history, systemPrompt, userText) {
    const safeHistory = (Array.isArray(history) ? history : [])
        .filter(message => message && (message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string' && message.content.trim())
        .slice(-10)
        .map(message => ({ role: message.role, content: message.content.slice(0, 6000) }));

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
    if (status === 408) {
        return 'La petición tardó demasiado (408). Inténtalo de nuevo.';
    }
    if (status === 413) {
        return 'La petición es demasiado grande (413). Prueba con una pregunta más corta.';
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

/**
 * Lee una respuesta SSE de OpenAI. Exportada para poder probarla sin red.
 */
export async function readAIStream(response, onDelta) {
    if (!response || !response.body || typeof response.body.getReader !== 'function') {
        throw new AIRequestError('El proxy devolvió una respuesta sin cuerpo. Revisa la URL del Worker.', {
            code: 'empty_body',
        });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    const processLine = (line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith(':')) return;
        if (!trimmed.startsWith('data:')) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') return;
        let payload;
        try { payload = JSON.parse(data); } catch (_) { return; }
        const delta = _deltaFromPayload(payload);
        if (delta) {
            fullText += delta;
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

    if (!fullText.trim()) {
        throw new AIRequestError('La IA no devolvió contenido. Prueba otro modelo o vuelve a intentarlo.', {
            code: 'empty_response',
        });
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
    maxTokens = 1200,
    timeoutMs = 120000,
} = {}) {
    const key = _safeHeaderValue(apiKey);
    if (!key) throw new AIRequestError('Falta tu API key de OpenCode.', { code: 'missing_key' });
    if (!isProxyUrlValid(proxyUrl)) {
        throw new AIRequestError('La URL del proxy no es válida o está vacía.', { code: 'invalid_proxy' });
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
        messages: messages.map(message => ({
            role: message.role,
            content: typeof message.content === 'string' ? message.content : _contentToText(message.content),
        })),
        stream: true,
        temperature: 0.3,
        max_tokens: Math.max(1, parseInt(maxTokens, 10) || 1200),
    };

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
            if (!text.trim()) {
                throw new AIRequestError('La IA no devolvió contenido. Prueba otro modelo o vuelve a intentarlo.', {
                    code: 'empty_response',
                });
            }
            if (typeof onDelta === 'function') onDelta(text, text);
            return text;
        }

        return await readAIStream(response, onDelta);
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

    const sendBtn = _el('aiSendBtn');
    if (sendBtn) {
        const ready = !!(key && settings.proxyUrl && settings.consent && !_sending);
        sendBtn.disabled = !ready;
        sendBtn.title = ready ? 'Enviar pregunta' : 'Configura tu key, el proxy y acepta el aviso de privacidad';
    }
}

function _updateComposerState() {
    _updateAISetupUI();
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
    if (!isProxyUrlValid(settings.proxyUrl)) return 'La URL del proxy no es válida. Debe empezar por https://.';
    if (requireConsent && !settings.consent) return 'Marca la casilla de consentimiento para enviar tus datos a OpenCode.';
    return '';
}

export function initAITab() {
    const settings = getAISettings();
    const proxyEl = _el('aiProxyUrl');
    const modelEl = _el('aiModel');
    const saveEl = _el('aiSaveKey');
    const consentEl = _el('aiConsent');
    if (proxyEl) proxyEl.value = settings.proxyUrl;
    if (modelEl) modelEl.value = settings.model;
    if (saveEl) saveEl.checked = settings.saveKey;
    if (consentEl) consentEl.checked = settings.consent;

    const keyEl = _el('aiApiKey');
    if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = _keyPlaceholder();
    }
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
            _setSetupStatus('Conexión lista. La IA recibirá un resumen de tus últimos 14 días.', 'success');
        }
    }
    _setChatStatus('');
    _updateComposerState();
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

    const keyEl = _el('aiApiKey');
    if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = _keyPlaceholder();
    }
    const proxyEl = _el('aiProxyUrl');
    if (proxyEl) proxyEl.value = result.settings.proxyUrl;
    const modelEl = _el('aiModel');
    if (modelEl) modelEl.value = result.settings.model;

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
    const form = _readAIForm();
    const settings = {
        proxyUrl: String(form.proxyUrl || '').trim().replace(/\/+$/, ''),
        model: _normalizeModel(form.model) || AI_DEFAULT_MODEL,
    };
    const key = String(form.apiKey || '').trim() || getAIKey();
    const configError = _validateReady(settings, key, { requireConsent: false });
    if (configError) {
        _setSetupStatus(configError, 'warn');
        return { ok: false, error: configError };
    }

    const button = _el('aiTestBtn');
    if (button) button.disabled = true;
    _setSetupStatus('Probando conexión con el proxy y OpenCode…', 'info');
    try {
        await requestAIChat({
            apiKey: key,
            proxyUrl: settings.proxyUrl,
            sessionId: getAISettings().sessionId,
            model: settings.model,
            messages: [{ role: 'user', content: 'Responde únicamente con la palabra OK.' }],
            maxTokens: 16,
            timeoutMs: 45000,
        });
        _setSetupStatus(`Conexión correcta con ${settings.model}.`, 'success');
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
    if (_sending) return { ok: false, error: 'Ya hay una respuesta en curso.' };
    const question = String(rawText || '').trim().slice(0, AI_MAX_QUESTION_CHARS);
    if (!question) return { ok: false, error: 'Escribe una pregunta.' };

    const settings = getAISettings();
    const key = getAIKey();
    const configError = _validateReady(settings, key);
    if (configError) {
        _setSetupStatus(configError, 'warn');
        _setChatStatus(configError, 'warn');
        return { ok: false, error: configError };
    }

    _sending = true;
    _updateComposerState();
    _setChatStatus('Pensando… La IA está leyendo tu contexto.', 'info');
    _appendChatMessage('user', question);
    const bubble = _appendChatMessage('assistant', '', { pending: true });
    if (bubble) bubble.textContent = '…';

    let lastPaint = 0;
    try {
        const context = buildAIContext({ days: 14, workoutDays: 14 });
        const systemPrompt = buildAISystemPrompt(context);
        const history = getAIChatHistory();
        const messages = buildAIChatMessages(history, systemPrompt, question);

        const answer = await requestAIChat({
            apiKey: key,
            proxyUrl: settings.proxyUrl,
            sessionId: settings.sessionId,
            model: settings.model,
            messages,
            maxTokens: 1200,
            onDelta: (_delta, full) => {
                const now = Date.now();
                if (bubble && now - lastPaint > 60) {
                    lastPaint = now;
                    bubble.textContent = full;
                    _scrollChat();
                }
            },
        });

        const clean = String(answer || '').trim();
        if (!clean) throw new AIRequestError('La IA no devolvió contenido.', { code: 'empty_response' });
        if (bubble) {
            bubble.innerHTML = renderSafeMarkdown(clean);
            const wrapper = bubble.parentElement;
            if (wrapper) wrapper.classList.remove('ai-msg-pending');
        }

        const nextHistory = [
            ...history,
            { role: 'user', content: question },
            { role: 'assistant', content: clean },
        ];
        saveAIChatHistory(nextHistory);
        _setChatStatus('');
        return { ok: true, text: clean };
    } catch (error) {
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
        return { ok: false, error: message };
    } finally {
        _sending = false;
        _updateComposerState();
        _scrollChat();
    }
}

export function sendAIChat(textOverride) {
    const input = _el('aiChatInput');
    const text = typeof textOverride === 'string' ? textOverride : (input ? input.value : '');
    if (input && typeof textOverride !== 'string') input.value = '';
    return sendAIMessage(text);
}

export function askAIQuick(question) {
    return sendAIMessage(question);
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
    _renderChat();
    _setChatStatus('Historial borrado.', 'info');
    return true;
}

// Solo para tests: limpia cachés en memoria sin tocar localStorage.
export function __resetAIForTests() {
    _settingsCache = null;
    _memoryKey = '';
    _chatCache = null;
    _sending = false;
    _uiBound = false;
}
