// Suite de auditoría de la IA BYOK.
// Cubre: contexto compacto y correcto por fase, seguridad de la key, cliente
// OpenAI/SSE, errores, Worker CORS sin estado y exclusiones de backups.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ─── Stubs mínimos de navegador ──────────────────────────────────────────────
globalThis.localStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
    clear() { this._s.clear(); },
    key(i) { return [...this._s.keys()][i] ?? null; },
    get length() { return this._s.size; },
};

class FakeEl {
    constructor(id = '') {
        this.id = id;
        this.textContent = '';
        this.innerHTML = '';
        this.className = '';
        this.value = '';
        this.placeholder = '';
        this.disabled = false;
        this.type = 'text';
        this.checked = false;
        this.style = {};
        this.children = [];
        this.classList = {
            _set: new Set(),
            add(...names) { names.forEach(name => this._set.add(name)); },
            remove(...names) { names.forEach(name => this._set.delete(name)); },
            contains(name) { return this._set.has(name); },
            toggle(name) { if (this._set.has(name)) this._set.delete(name); else this._set.add(name); },
        };
    }
    replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    remove() {}
    setAttribute() {}
    getAttribute() { return null; }
    addEventListener() {}
    focus() {}
    querySelector() { return null; }
}
const elements = new Map();
globalThis.document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new FakeEl(id));
        return elements.get(id);
    },
    createElement() { return new FakeEl(); },
};
globalThis.window = {};

const load = (path) => import(new URL(`../js/modules/${path}`, import.meta.url).href);
const { default: AppState } = await load('state.js');
const Storage = await load('storage.js');
const N = await load('nutrition.js');
const Context = await load('ai-context.js');
const AI = await load('ai.js');

let failures = 0;
function ok(name, condition, detail = '') {
    if (condition) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

function resetState() {
    localStorage.clear();
    elements.clear();
    AI.__resetAIForTests();
    Object.keys(AppState.config).forEach(key => delete AppState.config[key]);
    Object.assign(AppState.config, {
        startWeight: 85.4,
        currentWeight: 67,
        targetWeight: 69,
        startDate: '2025-12-30',
        height: 175,
        age: 33,
        gender: 'male',
        proteinFactor: 2.0,
        goalPhase: 'mantenimiento',
        lossPace: 'moderado',
        gainPace: 'lento',
        tdeeMode: 'formula',
        deficitTarget: 500,
        surplusTarget: 150,
        phaseStartWeight: 66.6,
        phaseStartDate: null,
        phaseHistory: [],
        weightHistory: [],
        customGymRoutine: null,
    });
    AppState.allDays = {};
    AppState.currentDate = new Date(2026, 2, 1, 12);
    N.clearAdaptiveTDEECache();
}

const TODAY = new Date(2026, 2, 1, 12);
function keyOffset(offset) {
    const date = new Date(TODAY);
    date.setDate(date.getDate() + offset);
    return Storage.getDateKey(date);
}

function seed14Days() {
    for (let offset = -13; offset <= 0; offset++) {
        const dateKey = keyOffset(offset);
        AppState.allDays[dateKey] = {
            date: dateKey,
            meals: {
                breakfast: [{ name: 'Avena', kcal: 500, protein: 35, carbs: 55, fats: 12 }],
                lunch: [{ name: 'Pollo', kcal: 700, protein: 55, carbs: 60, fats: 20 }],
                dinner: [{ name: 'Salmón', kcal: 650, protein: 45, carbs: 40, fats: 28 }],
            },
            notes: offset === 0 ? 'Día con hambre por la tarde.' : '',
        };
    }
    const history = [];
    for (let offset = -27; offset <= 0; offset++) {
        history.push({
            date: keyOffset(offset),
            weight: Math.round((66.6 + (offset + 27) * 0.02) * 100) / 100,
            day: offset + 28,
        });
    }
    AppState.config.weightHistory = history;
    AppState.config.currentWeight = history.at(-1).weight;
    AppState.config.phaseStartWeight = 66.6;
    AppState.config.phaseStartDate = keyOffset(-13);
    AppState.config.phaseHistory = [{
        phase: 'mantenimiento',
        startWeight: 66.6,
        date: keyOffset(-13),
    }];
    localStorage.setItem('workoutSessions', JSON.stringify({
        [keyOffset(-2)]: {
            date: keyOffset(-2),
            finalized: true,
            duration: 55,
            estimatedKcal: 320,
            exercises: [
                { exerciseId: 'test-1', name: 'Sentadilla', muscle: 'Piernas', sets: [{ kg: 100, reps: 8 }, { kg: 100, reps: 8 }] },
                { exerciseId: 'test-2', name: 'Press banca', muscle: 'Pecho', sets: [{ kg: 70, reps: 10 }] },
            ],
        },
        [keyOffset(-5)]: {
            date: keyOffset(-5),
            finalized: true,
            duration: 50,
            estimatedKcal: 280,
            exercises: [
                { exerciseId: 'test-3', name: 'Remo', muscle: 'Espalda', sets: [{ kg: 60, reps: 12 }] },
            ],
        },
        [keyOffset(-1)]: {
            date: keyOffset(-1),
            finalized: false,
            exercises: [{ exerciseId: 'test-4', name: 'Borrador', muscle: 'Piernas', sets: [{ kg: 50, reps: 5 }] }],
        },
    }));
}

// ─── 1. Contexto ─────────────────────────────────────────────────────────────
section('Contexto de IA');
resetState();
seed14Days();
const context = Context.buildAIContext({ days: 14, workoutDays: 14, today: TODAY });
const contextJson = JSON.stringify(context);

ok('contexto: schema y fecha', context.schema === 'apex-nutrition-context-v1' && context.today === keyOffset(0), context.today);
ok('contexto: fase mantenimiento', context.profile.phase === 'mantenimiento' && context.profile.isMaintenance === true);
ok('contexto: inicio de fase 66,6 kg', context.profile.phaseStartWeightKg === 66.6, String(context.profile.phaseStartWeightKg));
ok('contexto: no cuela 85,4 kg como inicio de fase', !contextJson.includes('85.4'));
ok('contexto: 14 días de registro', context.days.length === 14, String(context.days.length));
ok('contexto: macros diarios presentes', context.days[13].kcal === 1850 && context.days[13].proteinG === 135);
ok('contexto: nota reciente incluida', context.notes.some(note => note.text.includes('hambre')));
ok('contexto: objetivos calculados', context.goals && context.goals.targetKcal > 0 && context.goals.proteinG > 0);
ok('contexto: adherencia', context.adherence.loggedDays === 14 && context.adherence.onTargetDays >= 0);
ok('contexto: entrenos finalizados', context.workouts.recent.length === 2, String(context.workouts.recent.length));
ok('contexto: borrador excluido', !context.workouts.recent.some(w => w.date === keyOffset(-1)));
ok('contexto: volumen semanal por músculo', context.workouts.weeklyVolume?.setsByMuscle?.Piernas?.sets === 2);
ok('contexto: peso y tendencia', context.weight.latestWeightKg === 67.14 && context.weight.trendKgPerWeek > 0,
    `${context.weight.latestWeightKg} / ${context.weight.trendKgPerWeek}`);
ok('contexto: paquete compacto (< 30 KB)', Buffer.byteLength(contextJson, 'utf8') < 30000, `${Buffer.byteLength(contextJson, 'utf8')} bytes`);
ok('contexto: sin credenciales ni claves', !/oc_sk_|nutrition_ai_key|Authorization/i.test(contextJson));

const systemPrompt = Context.buildAISystemPrompt(context);
ok('prompt: incluye el contexto', systemPrompt.includes('"schema":"apex-nutrition-context-v1"'));
ok('prompt: regla de fase explícita', systemPrompt.includes('phaseStartWeightKg') && systemPrompt.includes('Nunca uses'));
ok('prompt: solo lectura', systemPrompt.includes('NO puedes modificar'));
ok('prompt: sin clave', !/oc_sk_|nutrition_ai_key/i.test(systemPrompt));

// En definición sí debe usar el inicio del déficit (85,4).
resetState();
seed14Days();
AppState.config.goalPhase = 'definicion';
AppState.config.phaseStartWeight = null;
AppState.config.phaseStartDate = null;
AppState.config.phaseHistory = [];
const definitionContext = Context.buildAIContext({ days: 7, today: TODAY });
ok('contexto: definición usa el inicio del déficit', definitionContext.profile.phaseStartWeightKg === 85.4,
    String(definitionContext.profile.phaseStartWeightKg));
AppState.config.goalPhase = 'mantenimiento';

// ─── 2. Markdown seguro ──────────────────────────────────────────────────────
section('Markdown seguro');
const md = AI.renderSafeMarkdown([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '**Negrita** y *cursiva*',
    '- uno',
    '- dos',
    '`a < b`',
    '```js',
    '<b>bloque</b>',
    '```',
    '[mal](javascript:alert(1))',
].join('\n'));
ok('markdown: script escapado', !md.includes('<script>') && md.includes('&lt;script&gt;'));
ok('markdown: imagen/onerror escapados', !md.includes('<img') && md.includes('&lt;img'));
ok('markdown: negrita y cursiva', md.includes('<strong>Negrita</strong>') && md.includes('<em>cursiva</em>'));
ok('markdown: listas', md.includes('<ul>') && md.includes('<li>uno</li>') && md.includes('<li>dos</li>'));
ok('markdown: código inline escapado', md.includes('<code>a &lt; b</code>'));
ok('markdown: bloque de código escapado', md.includes('<pre><code>') && md.includes('&lt;b&gt;bloque&lt;/b&gt;'));
ok('markdown: sin enlaces javascript', !md.includes('<a') && !md.includes('href='));
ok('markdown: vacío devuelve vacío', AI.renderSafeMarkdown('') === '');

// ─── 3. BYOK y almacenamiento separado ───────────────────────────────────────
section('BYOK y almacenamiento');
resetState();
const saveResult = AI.saveAISettings({
    apiKey: 'oc_sk_secret_123',
    proxyUrl: 'https://mi-worker.example.workers.dev/',
    model: 'beam-free',
    saveKey: true,
    consent: true,
});
ok('byok: ajustes guardados', saveResult.ok === true);
ok('byok: key en clave separada', localStorage.getItem(AI.AI_KEY_STORAGE) === 'oc_sk_secret_123');
const settingsRaw = localStorage.getItem(AI.AI_SETTINGS_STORAGE) || '';
ok('byok: la key no está dentro de los ajustes', !settingsRaw.includes('oc_sk_secret_123'));
ok('byok: barra final normalizada', JSON.parse(settingsRaw).proxyUrl === 'https://mi-worker.example.workers.dev');
ok('byok: getAIKey devuelve la key', AI.getAIKey() === 'oc_sk_secret_123');
ok('byok: consentimiento', AI.hasAIConsent() === true);

AI.saveAISettings({ saveKey: false });
ok('byok: al no guardar se borra del disco', localStorage.getItem(AI.AI_KEY_STORAGE) === null);
ok('byok: la key sigue en memoria', AI.getAIKey() === 'oc_sk_secret_123');
AI.clearAIKey();
ok('byok: borrar key', AI.getAIKey() === '');

const invalidProxy = AI.saveAISettings({ proxyUrl: 'http://example.com', model: 'beam-free' });
ok('byok: proxy http remoto rechazado', invalidProxy.ok === false && /no es válida/i.test(invalidProxy.error));
ok('byok: localhost http permitido', AI.isProxyUrlValid('http://localhost:8765') === true);
ok('byok: https permitido', AI.isProxyUrlValid('https://worker.example') === true);

const messages = AI.buildAIChatMessages(
    Array.from({ length: 30 }, (_v, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `mensaje ${i}` })),
    'SISTEMA',
    'pregunta actual'
);
ok('chat: historial limitado a 10 + sistema + pregunta', messages.length === 12, String(messages.length));
ok('chat: primera es sistema', messages[0].role === 'system' && messages[0].content === 'SISTEMA');
ok('chat: última es la pregunta', messages.at(-1).content === 'pregunta actual');

AI.saveAIChatHistory(Array.from({ length: 30 }, (_v, i) => ({ role: 'user', content: `historial ${i}` })));
ok('chat: historial persistido limitado a 20', AI.getAIChatHistory().length === 20);
AI.clearAIChatHistory();
ok('chat: historial borrado', AI.getAIChatHistory().length === 0);

// ─── 4. Cliente OpenAI/SSE ───────────────────────────────────────────────────
section('Cliente de IA');
function sseResponse(chunks) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const sse = sseResponse([
    'data: {"choices":[{"delta":{"content":"Hola "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"mundo"}}]}\n\n',
    'data: [DONE]\n\n',
]);
let captured = null;
const deltas = [];
const answer = await AI.requestAIChat({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example/chat',
    sessionId: 'session-123',
    model: 'beam-free',
    messages: [{ role: 'user', content: 'Hola' }],
    fetchImpl: async (url, init) => { captured = { url, init }; return sse; },
    onDelta: delta => deltas.push(delta),
});
ok('cliente: respuesta SSE completa', answer === 'Hola mundo', answer);
ok('cliente: deltas emitidos', deltas.join('') === 'Hola mundo');
ok('cliente: URL del proxy', captured.url === 'https://proxy.example/chat');
ok('cliente: Authorization con la key del usuario', captured.init.headers.Authorization === 'Bearer oc_sk_test_abc');
ok('cliente: cabecera de sesión', captured.init.headers['x-opencode-session'] === 'session-123');
ok('cliente: modelo en el cuerpo', JSON.parse(captured.init.body).model === 'beam-free');
ok('cliente: streaming activado', JSON.parse(captured.init.body).stream === true);
ok('cliente: la key no viaja en el cuerpo', !captured.init.body.includes('oc_sk_test_abc'));

const jsonAnswer = await AI.requestAIChat({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example/chat',
    sessionId: 'session-123',
    messages: [{ role: 'user', content: 'Hola' }],
    fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: [{ type: 'text', text: 'Respuesta JSON' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
});
ok('cliente: respuesta JSON no stream', jsonAnswer === 'Respuesta JSON', jsonAnswer);

const splitStream = sseResponse([
    'data: {"choices":[{"delta":{"content":"Ho',
    'la"}}]}\n\ndata: [DONE]\n\n',
]);
const splitText = await AI.readAIStream(splitStream);
ok('cliente: SSE partido entre chunks', splitText === 'Hola', splitText);

const streamError = sseResponse([
    'data: {"error":{"type":"rate_limit","message":"Demasiadas peticiones"}}\n\n',
]);
await assert.rejects(
    () => AI.readAIStream(streamError),
    error => error instanceof AI.AIRequestError && /Demasiadas peticiones/.test(error.message)
);
ok('cliente: error dentro del stream', true);

const emptyStream = sseResponse(['data: [DONE]\n\n']);
await assert.rejects(
    () => AI.readAIStream(emptyStream),
    error => error instanceof AI.AIRequestError && error.code === 'empty_response'
);
ok('cliente: stream vacío rechazado', true);

let fetchCalled = false;
await assert.rejects(
    () => AI.requestAIChat({
        apiKey: '',
        proxyUrl: 'https://proxy.example',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => { fetchCalled = true; return sseResponse([]); },
    }),
    error => error instanceof AI.AIRequestError && error.code === 'missing_key'
);
ok('cliente: sin key no llama a la red', fetchCalled === false);

const errorCases = [
    { status: 401, body: { error: { type: 'unauthorized', message: 'bad key' } }, expected: '401' },
    { status: 403, body: { error: { type: 'FreeUsageLimitError', message: 'Free usage limit' } }, expected: 'Beam Free' },
    { status: 429, body: { error: { type: 'rate_limit', message: 'slow down' } }, expected: '429' },
    { status: 500, body: { error: { type: 'server', message: 'boom' } }, expected: '500' },
];
for (const testCase of errorCases) {
    await assert.rejects(
        () => AI.requestAIChat({
            apiKey: 'oc_sk_test_abc',
            proxyUrl: 'https://proxy.example',
            sessionId: 's',
            messages: [{ role: 'user', content: 'Hola' }],
            fetchImpl: async () => new Response(JSON.stringify(testCase.body), {
                status: testCase.status,
                headers: { 'content-type': 'application/json' },
            }),
        }),
        error => error instanceof AI.AIRequestError
            && error.status === testCase.status
            && error.message.includes(testCase.expected)
    );
    ok(`cliente: error HTTP ${testCase.status} mapeado`, true);
}

await assert.rejects(
    () => AI.requestAIChat({
        apiKey: 'oc_sk_test_abc',
        proxyUrl: 'https://proxy.example',
        sessionId: 's',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
    }),
    error => error instanceof AI.AIRequestError && /No se pudo conectar/.test(error.message)
);
ok('cliente: fallo de red explicado', true);

// ─── 5. Worker CORS ──────────────────────────────────────────────────────────
section('Worker CORS');
const worker = (await import(new URL('../worker/src/index.js', import.meta.url).href)).default;
const ALLOWED = 'https://app.example,http://localhost:8765';
const originalFetch = globalThis.fetch;
let upstream = null;

function workerRequest({ origin = 'https://app.example', auth = 'Bearer oc_sk_user', body = null, method = 'POST' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (origin) headers.Origin = origin;
    if (auth) headers.Authorization = auth;
    headers['x-opencode-session'] = 'sess-worker-1';
    return new Request('https://worker.example/', {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(body || {
            model: 'beam-free',
            messages: [{ role: 'user', content: 'Hola' }],
            stream: true,
        }),
    });
}

async function withWorker(request, env = { ALLOWED_ORIGINS: ALLOWED }, mockFetch = null) {
    upstream = null;
    globalThis.fetch = mockFetch || (async (url, init) => {
        upstream = { url, init };
        return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
        });
    });
    try {
        return await worker.fetch(request, env);
    } finally {
        globalThis.fetch = originalFetch;
    }
}

const workerOk = await withWorker(workerRequest());
ok('worker: respuesta 200', workerOk.status === 200);
ok('worker: CORS del origen permitido', workerOk.headers.get('access-control-allow-origin') === 'https://app.example');
ok('worker: métodos CORS', workerOk.headers.get('access-control-allow-methods').includes('POST'));
ok('worker: content-type SSE', workerOk.headers.get('content-type').includes('text/event-stream'));
ok('worker: no-store', workerOk.headers.get('cache-control') === 'no-store');
ok('worker: upstream Go por defecto', upstream.url === 'https://opencode.ai/inference/go/openai/v1/chat/completions');
ok('worker: reenvía la key del usuario', upstream.init.headers.Authorization === 'Bearer oc_sk_user');
ok('worker: reenvía la sesión', upstream.init.headers['x-opencode-session'] === 'sess-worker-1');
ok('worker: User-Agent propio', /^ApexNutrition\//.test(upstream.init.headers['User-Agent']));
const forwardedBody = JSON.parse(upstream.init.body);
ok('worker: cuerpo reenviado', forwardedBody.model === 'beam-free' && forwardedBody.messages[0].content === 'Hola');
ok('worker: no añade campos raros', Object.keys(forwardedBody).sort().join(',') === 'messages,model,stream');

const preflight = await withWorker(workerRequest({ method: 'OPTIONS', body: {} }));
ok('worker: preflight 204', preflight.status === 204);
ok('worker: preflight permite sesión', preflight.headers.get('access-control-allow-headers').toLowerCase().includes('x-opencode-session'));
ok('worker: preflight permite authorization', preflight.headers.get('access-control-allow-headers').toLowerCase().includes('authorization'));

const evil = await withWorker(workerRequest({ origin: 'https://evil.example' }));
ok('worker: origen no permitido 403', evil.status === 403);
ok('worker: no refleja origen malicioso', evil.headers.get('access-control-allow-origin') !== 'https://evil.example');

const noAuth = await withWorker(workerRequest({ auth: '' }));
ok('worker: sin Authorization 401', noAuth.status === 401);

const badJson = await withWorker(new Request('https://worker.example/', {
    method: 'POST',
    headers: {
        Origin: 'https://app.example',
        Authorization: 'Bearer oc_sk_user',
        'Content-Type': 'application/json',
    },
    body: '{no json',
}));
ok('worker: JSON inválido 400', badJson.status === 400);

const getMethod = await withWorker(workerRequest({ method: 'GET' }));
ok('worker: GET 405', getMethod.status === 405);

const hugeBody = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(300000) }] });
const huge = await withWorker(new Request('https://worker.example/', {
    method: 'POST',
    headers: {
        Origin: 'https://app.example',
        Authorization: 'Bearer oc_sk_user',
        'Content-Type': 'application/json',
    },
    body: hugeBody,
}));
ok('worker: cuerpo enorme 413', huge.status === 413);

const upstreamError = await withWorker(workerRequest(), { ALLOWED_ORIGINS: ALLOWED }, async () => new Response(
    JSON.stringify({ error: { type: 'unauthorized', message: 'bad key' } }),
    { status: 401, headers: { 'content-type': 'application/json' } }
));
ok('worker: error upstream pasa status', upstreamError.status === 401);
ok('worker: error upstream conserva CORS', upstreamError.headers.get('access-control-allow-origin') === 'https://app.example');

const networkFailure = await withWorker(workerRequest(), { ALLOWED_ORIGINS: ALLOWED }, async () => {
    throw new TypeError('network down');
});
ok('worker: fallo upstream 502', networkFailure.status === 502);
ok('worker: fallo upstream con CORS', networkFailure.headers.get('access-control-allow-origin') === 'https://app.example');

const customEndpoint = await withWorker(workerRequest(), {
    ALLOWED_ORIGINS: ALLOWED,
    OPENCODE_ENDPOINT: 'https://opencode.ai/inference/openai/v1/chat/completions',
});
ok('worker: endpoint configurable', customEndpoint.status === 200
    && upstream.url === 'https://opencode.ai/inference/openai/v1/chat/completions');

const wildcard = await withWorker(workerRequest({ origin: 'https://otra.example' }), { ALLOWED_ORIGINS: '*' });
ok('worker: wildcard opcional', wildcard.headers.get('access-control-allow-origin') === '*');

const curl = await withWorker(workerRequest({ origin: '' }));
ok('worker: sin Origin (curl) permitido', curl.status === 200);

const clamped = await withWorker(new Request('https://worker.example/', {
    method: 'POST',
    headers: {
        Origin: 'https://app.example',
        Authorization: 'Bearer oc_sk_user',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        messages: Array.from({ length: 100 }, (_v, i) => ({ role: 'user', content: `m${i}` })),
        temperature: 99,
        max_tokens: 99999,
    }),
}));
const clampedBody = JSON.parse(upstream.init.body);
ok('worker: mensajes limitados a 80', clampedBody.messages.length === 80);
ok('worker: modelo por defecto', clampedBody.model === 'beam-free');
ok('worker: temperatura limitada', clampedBody.temperature === 2);
ok('worker: max_tokens limitado', clampedBody.max_tokens === 4096);
ok('worker: respuesta limitada 200', clamped.status === 200);

// ─── 6. Auditoría estática de integración/backups ───────────────────────────
section('Integración y backups');
const storageSource = readFileSync(join(root, 'js/modules/storage.js'), 'utf8');
const collectIndex = storageSource.indexOf('function _collectDatabase()');
const collectFn = collectIndex >= 0 ? storageSource.slice(collectIndex, collectIndex + 3000) : '';
ok('backup: _collectDatabase no incluye la key', collectFn.length > 0
    && !collectFn.includes('nutrition_ai_key') && !collectFn.includes('AI_KEY_STORAGE'));
const buildBackupIndex = storageSource.indexOf('function _buildBackup()');
const buildBackupSection = buildBackupIndex >= 0 ? storageSource.slice(buildBackupIndex, buildBackupIndex + 2500) : '';
ok('backup: _buildBackup no incluye la key', buildBackupSection.length > 0
    && !buildBackupSection.includes('nutrition_ai_key') && !buildBackupSection.includes('AI_KEY_STORAGE'));
ok('limpieza: clearAllData borra la key', storageSource.includes("'nutrition_ai_key', 'nutrition_ai_settings', 'nutrition_ai_chat'"));

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
ok('html: pestaña IA', indexHtml.includes('data-tab="ia"') && indexHtml.includes('id="ia"'));
ok('html: panel BYOK', indexHtml.includes('id="aiApiKey"') && indexHtml.includes('id="aiProxyUrl"'));
ok('html: versión 130', indexHtml.includes('js/app.js?v=130'));
ok('html: CSS con cache-busting 130', indexHtml.includes('css/styles.css?v=20261030-130'));

const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
ok('sw: versión 130', /CACHE_VERSION\s*=\s*130/.test(swSource));
ok('sw: módulos IA cacheados', swSource.includes('/dieta/js/modules/ai.js') && swSource.includes('/dieta/js/modules/ai-context.js'));
ok('sw: solo cachea GET', swSource.includes("event.request.method !== 'GET'"));

const privacySource = readFileSync(join(root, 'privacy.html'), 'utf8');
ok('privacidad: sección de IA', privacySource.includes('Asistente de IA opcional') && privacySource.includes('BYOK'));
ok('privacidad: retención explicada', privacySource.includes('30 días'));

const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
ok('app: importa e inicializa la IA', appSource.includes("from './modules/ai.js'") && appSource.includes('window.initAITab'));

const workerSource = readFileSync(join(root, 'worker/src/index.js'), 'utf8');
ok('worker: no tiene key propia', !/env\.OPENCODE_API_KEY/.test(workerSource));
ok('worker: no registra datos', !/console\.(log|error|warn|info)/.test(workerSource));
ok('worker: no almacena estado', !/\benv\.(KV|DB|R2)\b|caches\.(open|match|put)/i.test(workerSource));

const runAll = readFileSync(join(root, 'tests/run-all.mjs'), 'utf8');
ok('tests: suite registrada', runAll.includes('audit-ai.mjs'));

console.log(failures === 0
    ? '\nAI AUDIT PASSED'
    : `\nAI AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
