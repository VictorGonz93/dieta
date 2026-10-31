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
        this.parentElement = null;
        this.classList = {
            _set: new Set(),
            add(...names) { names.forEach(name => this._set.add(name)); },
            remove(...names) { names.forEach(name => this._set.delete(name)); },
            contains(name) { return this._set.has(name); },
            toggle(name) { if (this._set.has(name)) this._set.delete(name); else this._set.add(name); },
        };
    }
    replaceChildren(...nodes) {
        this.children = nodes;
        nodes.forEach(node => { if (node) node.parentElement = this; });
        this.textContent = '';
    }
    append(...nodes) {
        nodes.forEach(node => { if (node) node.parentElement = this; });
        this.children.push(...nodes);
    }
    appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
    remove() {
        if (this.parentElement) {
            const index = this.parentElement.children.indexOf(this);
            if (index >= 0) this.parentElement.children.splice(index, 1);
        }
        this.parentElement = null;
    }
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
ok('contexto: borrador excluido de finalizados', !context.workouts.recent.some(w => w.date === keyOffset(-1)));
ok('contexto: borrador incluido aparte',
    context.workouts.drafts?.length === 1
    && context.workouts.drafts[0].date === keyOffset(-1)
    && context.workouts.drafts[0].status === 'draft');
ok('contexto: borrador no cuenta como realizado', context.workouts.sessionsLogged === 2);
ok('contexto: detalle de ejercicios finalizados',
    context.workouts.recent[0]?.exerciseDetails?.some(ex =>
        ex.name === 'Sentadilla' && ex.sets === 2 && ex.reps === 8 && ex.kg === 100));
ok('contexto: detalle de ejercicios del borrador',
    context.workouts.drafts[0]?.exerciseDetails?.some(ex =>
        ex.name === 'Borrador' && ex.sets === 1 && ex.reps === 5 && ex.kg === 50));
ok('contexto: dataQuality separa borradores', context.dataQuality.draftSessionsInWindow === 1);
ok('contexto: comidas recientes con nombres y macros',
    context.recentFoods?.length === 3
    && context.recentFoods.at(-1).meals.breakfast.some(food =>
        food.name === 'Avena'
        && food.kcal === 500
        && food.proteinG === 35
        && food.carbsG === 55
        && food.fatsG === 12));
ok('contexto: ventana de alimentos', context.foodsWindowDays === 3);
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
ok('prompt: no pide el JSON', /no pidas.*json/i.test(systemPrompt));
ok('prompt: explica los borradores',
    systemPrompt.includes('workouts.drafts') && systemPrompt.includes('Guardar Entreno'));
ok('prompt: usa el detalle de ejercicios', systemPrompt.includes('exerciseDetails'));
ok('prompt: usa comidas recientes', systemPrompt.includes('recentFoods'));

const sessionsWithCardio = JSON.parse(localStorage.getItem('workoutSessions'));
sessionsWithCardio[keyOffset(-3)] = {
    date: keyOffset(-3),
    finalized: true,
    exercises: [
        { exerciseId: 'cardio-1', name: 'Carrera', muscle: 'Cardio', sets: [{ mins: 30, km: 5 }] },
        { exerciseId: 'steps-1', name: 'Paseo', muscle: 'Cardio', sets: [{ steps: 8000 }] },
        { exerciseId: 'time-1', name: 'Plancha', muscle: 'Core', sets: [{ secs: 60, kg: 10 }] },
    ],
};
localStorage.setItem('workoutSessions', JSON.stringify(sessionsWithCardio));
const cardioContext = Context.buildAIContext({ days: 14, workoutDays: 14, today: TODAY });
const cardioWorkout = cardioContext.workouts.recent.find(workout => workout.date === keyOffset(-3));
ok('contexto: detalle cardio', cardioWorkout?.exerciseDetails?.some(exercise =>
    exercise.name === 'Carrera' && exercise.mins === 30 && exercise.km === 5));
ok('contexto: detalle pasos', cardioWorkout?.exerciseDetails?.some(exercise =>
    exercise.name === 'Paseo' && exercise.steps === 8000));
ok('contexto: detalle tiempo', cardioWorkout?.exerciseDetails?.some(exercise =>
    exercise.name === 'Plancha' && exercise.secs === 60 && exercise.kg === 10));

const sessionsWithOldDraft = JSON.parse(localStorage.getItem('workoutSessions'));
sessionsWithOldDraft[keyOffset(-20)] = {
    date: keyOffset(-20),
    finalized: false,
    exercises: [{ exerciseId: 'old-draft', name: 'Antiguo', muscle: 'Piernas', sets: [{ kg: 40, reps: 10 }] }],
};
localStorage.setItem('workoutSessions', JSON.stringify(sessionsWithOldDraft));
const oldDraftContext = Context.buildAIContext({ days: 14, workoutDays: 14, today: TODAY });
ok('contexto: borrador fuera de la ventana no se envía',
    !oldDraftContext.workouts.drafts.some(workout => workout.date === keyOffset(-20)));

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

const effortSaved = AI.saveAISettings({ reasoningEffort: 'high' });
ok('byok: esfuerzo de razonamiento guardado',
    effortSaved.ok === true && AI.getAISettings().reasoningEffort === 'high');
const effortInvalid = AI.saveAISettings({ reasoningEffort: 'none' });
ok('byok: esfuerzo inválido vuelve a medio',
    effortInvalid.ok === true && AI.getAISettings().reasoningEffort === 'medium');

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

const beamMessages = AI.buildAIChatMessages([
    { role: 'user', content: 'p1' },
    { role: 'assistant', content: 'r1', reasoning_content: 'pienso' },
    { role: 'user', content: 'p2' },
    { role: 'assistant', content: 'r2' },
], 'SISTEMA', 'p3', { echoReasoning: true });
ok('chat: Beam reenvía reasoning_content y descarta turnos sin él',
    beamMessages.length === 4
    && beamMessages[2].reasoning_content === 'pienso'
    && beamMessages[3].content === 'p3');
ok('chat: todos los assistant de Beam llevan razonamiento no vacío',
    beamMessages.filter(message => message.role === 'assistant').every(message =>
        typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0));

const legacyBeamMessages = AI.buildAIChatMessages([
    { role: 'user', content: 'p1' },
    { role: 'assistant', content: 'r1' },
], 'SISTEMA', 'p2', { echoReasoning: true });
ok('chat: Beam empieza de cero si el historial no tiene razonamiento',
    legacyBeamMessages.length === 2 && legacyBeamMessages[1].content === 'p2');

const longReasoning = 'x'.repeat(5000);
const longContent = 'y'.repeat(10000);
const longBeamMessages = AI.buildAIChatMessages([
    { role: 'user', content: 'p1' },
    { role: 'assistant', content: longContent, reasoning_content: longReasoning },
], 'SISTEMA', 'p2', { echoReasoning: true });
ok('chat: Beam conserva el razonamiento completo',
    longBeamMessages[2].reasoning_content.length === longReasoning.length);
ok('chat: Beam conserva el contenido completo',
    longBeamMessages[2].content.length === longContent.length);

AI.saveAIChatHistory([
    { role: 'user', content: 'pregunta' },
    { role: 'assistant', content: longContent, reasoning_content: longReasoning },
]);
ok('chat: el historial guarda contenido y razonamiento largos',
    AI.getAIChatHistory()[1].content.length === longContent.length
    && AI.getAIChatHistory()[1].reasoning_content.length === longReasoning.length);
AI.clearAIChatHistory();

const manyBeamHistory = [];
for (let i = 0; i < 6; i++) {
    manyBeamHistory.push({ role: 'user', content: `u${i}` });
    manyBeamHistory.push({ role: 'assistant', content: `a${i}`, reasoning_content: `r${i}` });
}
const manyBeamMessages = AI.buildAIChatMessages(manyBeamHistory, 'SISTEMA', 'actual', { echoReasoning: true });
ok('chat: Beam limita a los últimos 5 turnos',
    manyBeamMessages.length === 12 && manyBeamMessages[1].content === 'u1');

const hugeBeamHistory = [];
for (let i = 0; i < 5; i++) {
    hugeBeamHistory.push({ role: 'user', content: `u${i}` });
    hugeBeamHistory.push({ role: 'assistant', content: `a${i}`, reasoning_content: 'z'.repeat(60000) });
}
const hugeBeamMessages = AI.buildAIChatMessages(hugeBeamHistory, 'SISTEMA', 'actual', { echoReasoning: true });
ok('chat: Beam recorta el historial por tamaño',
    hugeBeamMessages.length === 6 && hugeBeamMessages[1].content === 'u3');

const nonBeamMessages = AI.buildAIChatMessages([
    { role: 'assistant', content: 'r1', reasoning_content: 'pienso' },
], 'SISTEMA', 'p2');
ok('chat: otros modelos no reciben reasoning_content',
    nonBeamMessages.every(message => !('reasoning_content' in message)));

AI.saveAIChatHistory(Array.from({ length: 30 }, (_v, i) => ({ role: 'user', content: `historial ${i}` })));
ok('chat: historial persistido limitado a 20', AI.getAIChatHistory().length === 20);
AI.saveAIChatHistory([
    { role: 'user', content: 'pregunta' },
    { role: 'assistant', content: 'respuesta', reasoning_content: 'razonamiento' },
]);
ok('chat: reasoning persistido en el historial', AI.getAIChatHistory()[1]?.reasoning_content === 'razonamiento');
AI.clearAIChatHistory();
ok('chat: historial borrado', AI.getAIChatHistory().length === 0);

AI.saveAIReports([{
    id: 'rep-test-1',
    createdAt: '2026-03-01T10:00:00.000Z',
    weekStart: '2026-02-23',
    weekEnd: '2026-03-01',
    model: 'beam-free',
    text: 'Informe **semanal** de prueba.',
}]);
ok('informes: guardado y recuperado',
    AI.getAIReports().length === 1
    && AI.getAIReports()[0].id === 'rep-test-1'
    && AI.getAIReports()[0].text.includes('semanal'));
ok('informes: en clave separada',
    (localStorage.getItem(AI.AI_REPORTS_STORAGE) || '').includes('rep-test-1'));
AI.saveAIReports([]);
ok('informes: limpiados', AI.getAIReports().length === 0);

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
ok('cliente: max_tokens amplio por defecto', JSON.parse(captured.init.body).max_tokens === AI.AI_DEFAULT_MAX_TOKENS);
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

let reasoningBody = null;
await AI.requestAIChat({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example/chat',
    sessionId: 'session-123',
    reasoningEffort: 'medium',
    messages: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Respuesta', reasoning_content: 'Pensamiento' },
        { role: 'user', content: 'Otra' },
    ],
    fetchImpl: async (_url, init) => {
        reasoningBody = JSON.parse(init.body);
        return sseResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n']);
    },
});
ok('cliente: reenvía reasoning_content del assistant', reasoningBody.messages[1].reasoning_content === 'Pensamiento');
ok('cliente: no añade reasoning_content al usuario', !('reasoning_content' in reasoningBody.messages[0])
    && !('reasoning_content' in reasoningBody.messages[2]));
ok('cliente: envía esfuerzo de razonamiento', reasoningBody.reasoning_effort === 'medium');

const splitStream = sseResponse([
    'data: {"choices":[{"delta":{"content":"Ho',
    'la"}}]}\n\ndata: [DONE]\n\n',
]);
const splitText = await AI.readAIStream(splitStream);
ok('cliente: SSE partido entre chunks', splitText === 'Hola', splitText);

const reasoningCollector = { text: '', reasoning: '' };
const reasoningStream = sseResponse([
    'data: {"choices":[{"delta":{"reasoning_content":"Pensando "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"más"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
    'data: [DONE]\n\n',
]);
const reasoningAnswer = await AI.readAIStream(reasoningStream, null, reasoningCollector);
ok('cliente: razonamiento separado del contenido',
    reasoningAnswer === 'Hola' && reasoningCollector.reasoning === 'Pensando más');

const onlyReasoning = sseResponse([
    'data: {"choices":[{"delta":{"reasoning_content":"Pensando"}}]}\n\n',
    'data: [DONE]\n\n',
]);
await assert.rejects(
    () => AI.readAIStream(onlyReasoning),
    error => error instanceof AI.AIRequestError && error.code === 'reasoning_only' && /razonó/i.test(error.message)
);
ok('cliente: respuesta solo de razonamiento explicada', true);

const jsonReasoningCollector = { text: '', reasoning: '' };
const jsonReasoningAnswer = await AI.requestAIChat({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example/chat',
    sessionId: 'session-123',
    messages: [{ role: 'user', content: 'Hola' }],
    reasoningCollector: jsonReasoningCollector,
    fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'Respuesta', reasoning_content: 'Pensamiento' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
});
ok('cliente: razonamiento en respuesta JSON',
    jsonReasoningAnswer === 'Respuesta' && jsonReasoningCollector.reasoning === 'Pensamiento');

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

await assert.rejects(
    () => AI.requestAIChat({
        apiKey: 'oc_sk_test_abc',
        proxyUrl: 'https://proxy.example',
        sessionId: 's',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => new Response('<html>405 Not Allowed</html>', {
            status: 405,
            headers: { 'content-type': 'text/html' },
        }),
    }),
    error => error instanceof AI.AIRequestError
        && error.status === 405
        && /Worker/.test(error.message)
        && /GitHub Pages/.test(error.message)
);
ok('cliente: 405 explica que debe usarse la URL del Worker', true);

let githubFetchCalled = false;
await assert.rejects(
    () => AI.requestAIChat({
        apiKey: 'oc_sk_test_abc',
        proxyUrl: 'https://victorgonz93.github.io/dieta/',
        sessionId: 's',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => { githubFetchCalled = true; return sseResponse([]); },
    }),
    error => error instanceof AI.AIRequestError && /GitHub Pages/.test(error.message)
);
ok('cliente: detecta GitHub Pages sin hacer la petición', githubFetchCalled === false);

let opencodeFetchCalled = false;
await assert.rejects(
    () => AI.requestAIChat({
        apiKey: 'oc_sk_test_abc',
        proxyUrl: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
        sessionId: 's',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => { opencodeFetchCalled = true; return sseResponse([]); },
    }),
    error => error instanceof AI.AIRequestError && /CORS/.test(error.message)
);
ok('cliente: detecta la URL de OpenCode sin hacer la petición', opencodeFetchCalled === false);

let retryCalls = 0;
const retryAnswer = await AI.requestAIChatWithRetry({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example',
    sessionId: 's',
    messages: [{ role: 'user', content: 'Hola' }],
    fetchImpl: async () => {
        retryCalls++;
        if (retryCalls === 1) {
            return new Response(JSON.stringify({ error: { type: 'server', message: 'boom' } }), {
                status: 500,
                headers: { 'content-type': 'application/json' },
            });
        }
        return sseResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n']);
    },
}, { attempts: 2, delayMs: 0 });
ok('cliente: reintenta un 500 transitorio', retryAnswer === 'OK' && retryCalls === 2);

let emptyRetryCalls = 0;
const emptyRetryAnswer = await AI.requestAIChatWithRetry({
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example',
    sessionId: 's',
    messages: [{ role: 'user', content: 'Hola' }],
    fetchImpl: async () => {
        emptyRetryCalls++;
        return emptyRetryCalls === 1
            ? sseResponse(['data: [DONE]\n\n'])
            : sseResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n']);
    },
}, { attempts: 2, delayMs: 0 });
ok('cliente: reintenta una respuesta vacía', emptyRetryAnswer === 'OK' && emptyRetryCalls === 2);

let effortRetryCalls = 0;
let effortRetryBody = null;
const effortOptions = {
    apiKey: 'oc_sk_test_abc',
    proxyUrl: 'https://proxy.example',
    sessionId: 's',
    messages: [{ role: 'user', content: 'Hola' }],
    reasoningEffort: 'medium',
    fetchImpl: async (_url, init) => {
        effortRetryCalls++;
        if (effortRetryCalls === 1) {
            return new Response(JSON.stringify({ error: { type: 'server', message: 'boom' } }), {
                status: 500,
                headers: { 'content-type': 'application/json' },
            });
        }
        effortRetryBody = JSON.parse(init.body);
        return sseResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n']);
    },
};
await AI.requestAIChatWithRetry(effortOptions, {
    attempts: 2,
    delayMs: 0,
    onRetry: () => { effortOptions.reasoningEffort = 'low'; },
});
ok('cliente: el reintento puede bajar el esfuerzo', effortRetryBody.reasoning_effort === 'low');

let authRetryCalls = 0;
await assert.rejects(
    () => AI.requestAIChatWithRetry({
        apiKey: 'oc_sk_test_abc',
        proxyUrl: 'https://proxy.example',
        sessionId: 's',
        messages: [{ role: 'user', content: 'Hola' }],
        fetchImpl: async () => {
            authRetryCalls++;
            return new Response(JSON.stringify({ error: { type: 'unauthorized', message: 'bad key' } }), {
                status: 401,
                headers: { 'content-type': 'application/json' },
            });
        },
    }, { attempts: 3, delayMs: 0 }),
    error => error instanceof AI.AIRequestError && error.status === 401
);
ok('cliente: no reintenta un 401', authRetryCalls === 1);
ok('cliente: 401 no es reintentable', AI.isRetryableAIError(new AI.AIRequestError('x', { status: 401 })) === false);
ok('cliente: 503 es reintentable', AI.isRetryableAIError(new AI.AIRequestError('x', { status: 503 })) === true);
ok('cliente: rate_limit del stream es reintentable',
    AI.isRetryableAIError(new AI.AIRequestError('x', { code: 'rate_limit' })) === true);
ok('cliente: server_error del stream es reintentable',
    AI.isRetryableAIError(new AI.AIRequestError('x', { code: 'server_error' })) === true);

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
ok('worker: max_tokens limitado', clampedBody.max_tokens === 16384);
ok('worker: respuesta limitada 200', clamped.status === 200);

const workerReasoningText = 'z'.repeat(5000);
const workerReasoning = await withWorker(new Request('https://worker.example/', {
    method: 'POST',
    headers: {
        Origin: 'https://app.example',
        Authorization: 'Bearer oc_sk_user',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        model: 'beam-free',
        reasoning_effort: 'medium',
        messages: [
            { role: 'user', content: 'Hola' },
            { role: 'assistant', content: 'Respuesta', reasoning_content: workerReasoningText },
            { role: 'user', content: 'Otra' },
        ],
    }),
}));
const forwardedReasoning = JSON.parse(upstream.init.body);
ok('worker: conserva reasoning_content completo del assistant',
    forwardedReasoning.messages[1].reasoning_content === workerReasoningText);
ok('worker: no copia reasoning_content al usuario',
    !('reasoning_content' in forwardedReasoning.messages[0])
    && !('reasoning_content' in forwardedReasoning.messages[2]));
ok('worker: reenvía esfuerzo de razonamiento válido', forwardedReasoning.reasoning_effort === 'medium');
ok('worker: respuesta con razonamiento 200', workerReasoning.status === 200);

const invalidEffort = await withWorker(new Request('https://worker.example/', {
    method: 'POST',
    headers: {
        Origin: 'https://app.example',
        Authorization: 'Bearer oc_sk_user',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hola' }],
        reasoning_effort: 'none',
    }),
}));
const invalidEffortBody = JSON.parse(upstream.init.body);
ok('worker: descarta esfuerzo de razonamiento no válido', !('reasoning_effort' in invalidEffortBody));
ok('worker: esfuerzo no válido no rompe la petición', invalidEffort.status === 200);

// ─── 6. Sincronización de ajustes y multirrondo ─────────────────────────────
section('Sincronización de ajustes y multirrondo');
resetState();
seed14Days();
AI.saveAISettings({
    apiKey: 'oc_sk_old_key',
    proxyUrl: 'https://viejo-worker.example',
    model: 'beam-free',
    saveKey: true,
    consent: true,
});
AI.initAITab();

const initialDynamic = elements.get('aiDynamicPrompts');
ok('sugerencias: planificar el día al empezar',
    initialDynamic.hidden === false && /Planificar el día/.test(initialDynamic.innerHTML));

const realTodayKey = Storage.getDateKey(new Date());
AppState.allDays[realTodayKey] = {
    date: realTodayKey,
    meals: {
        breakfast: [{ name: 'Avena', kcal: 500, protein: 35, carbs: 55, fats: 12 }],
    },
};
AI.refreshAIContextPreview();
const dynamicHtml = elements.get('aiDynamicPrompts').innerHTML;
ok('sugerencias: proteína, carbohidratos, grasas y kcal',
    /Cubrir \d+ g de proteína/.test(dynamicHtml)
    && /Cubrir \d+ g de carbohidratos/.test(dynamicHtml)
    && /Cubrir \d+ g de grasas/.test(dynamicHtml)
    && /Cerrar \d+ kcal/.test(dynamicHtml));
ok('sugerencias: botones conectados', /askAIQuick/.test(dynamicHtml));

const formProxy = elements.get('aiProxyUrl');
const formModel = elements.get('aiModel');
const formKey = elements.get('aiApiKey');
const formSaveKey = elements.get('aiSaveKey');
const formConsent = elements.get('aiConsent');
formProxy.value = 'https://nuevo-worker.example';
formModel.value = 'beam-free';
formKey.value = 'oc_sk_form_key';
formSaveKey.checked = true;
formConsent.checked = true;

const chatRequests = [];
const originalChatFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    chatRequests.push({ url, init });
    return sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"Pensando "}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"en la respuesta"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Respuesta "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"correcta"}}]}\n\n',
        'data: [DONE]\n\n',
    ]);
};
try {
    const firstSend = await AI.sendAIMessage('Primera pregunta');
    ok('ajustes: el chat adopta la URL del formulario',
        AI.getAISettings().proxyUrl === 'https://nuevo-worker.example');
    ok('ajustes: el chat adopta la key del formulario', AI.getAIKey() === 'oc_sk_form_key');
    ok('ajustes: la petición usa la URL del formulario', chatRequests[0]?.url === 'https://nuevo-worker.example');
    ok('ajustes: la key se limpia del formulario', formKey.value === '');
    ok('chat: primera respuesta correcta', firstSend.ok === true && firstSend.text === 'Respuesta correcta');
    ok('chat: razonamiento guardado con la respuesta',
        AI.getAIChatHistory().at(-1)?.reasoning_content === 'Pensando en la respuesta');
    ok('chat: max_tokens amplio en la petición real',
        JSON.parse(chatRequests[0].init.body).max_tokens === AI.AI_DEFAULT_MAX_TOKENS);
    ok('chat: esfuerzo de razonamiento medio para Beam',
        JSON.parse(chatRequests[0].init.body).reasoning_effort === 'medium');

    const secondSend = await AI.sendAIMessage('Segunda pregunta');
    const secondBody = JSON.parse(chatRequests[1].init.body);
    const echoedAssistant = secondBody.messages.find(message =>
        message.role === 'assistant' && message.content === 'Respuesta correcta');
    ok('chat: segundo turno responde', secondSend.ok === true);
    ok('chat: segundo turno reenvía reasoning_content',
        echoedAssistant?.reasoning_content === 'Pensando en la respuesta');

    elements.get('aiReasoningEffort').value = 'high';
    const thirdSend = await AI.sendAIMessage('Tercera pregunta');
    const thirdBody = JSON.parse(chatRequests[2].init.body);
    ok('chat: esfuerzo alto se envía', thirdSend.ok === true && thirdBody.reasoning_effort === 'high');
    ok('ajustes: esfuerzo guardado', AI.getAISettings().reasoningEffort === 'high');
} finally {
    globalThis.fetch = originalChatFetch;
}

// ─── 7. Detener, reintentar e informe semanal ───────────────────────────────
section('Detener, reintentar e informe semanal');
resetState();
seed14Days();
AI.saveAISettings({
    apiKey: 'oc_sk_stop_key',
    proxyUrl: 'https://worker.example',
    model: 'beam-free',
    reasoningEffort: 'medium',
    saveKey: true,
    consent: true,
});
AI.initAITab();

const originalStopFetch = globalThis.fetch;
let abortObserved = false;
let fetchStarted = false;
globalThis.fetch = (_url, init) => {
    fetchStarted = true;
    return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            abortObserved = true;
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
    });
};
try {
    const stopSend = AI.sendAIMessage('Pregunta que voy a detener');
    for (let i = 0; i < 100 && !fetchStarted; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    ok('chat: la petición llega a la red', fetchStarted === true);
    ok('chat: muestra tiempo de espera',
        elements.get('aiThinkingTime').hidden === false
        && /Pensando/.test(elements.get('aiThinkingTime').textContent));
    const stopped = AI.stopAIGeneration();
    const stopResult = await stopSend;
    ok('chat: detener aborta la petición', stopped === true && abortObserved === true);
    ok('chat: detener no guarda la respuesta', stopResult.ok === false && stopResult.aborted === true);
    ok('chat: detener muestra reintentar', elements.get('aiRetryBtn').hidden === false);
    ok('chat: el tiempo se oculta al terminar', elements.get('aiThinkingTime').hidden === true);
} finally {
    globalThis.fetch = originalStopFetch;
}

let retryRequest = null;
const originalRetryFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
    retryRequest = init;
    return sseResponse([
        'data: {"choices":[{"delta":{"content":"Respuesta tras reintento"}}]}\n\n',
        'data: [DONE]\n\n',
    ]);
};
try {
    const retryResult = await AI.retryLastAIMessage();
    ok('chat: reintentar funciona',
        retryResult.ok === true && retryResult.text.includes('Respuesta tras reintento'));
    ok('chat: reintentar limpia el botón', elements.get('aiRetryBtn').hidden === true);
    ok('chat: reintentar reutiliza la pregunta',
        /Pregunta que voy a detener/.test(retryRequest?.body || ''));
} finally {
    globalThis.fetch = originalRetryFetch;
}

let reportRequest = null;
const originalReportFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
    reportRequest = init;
    return sseResponse([
        'data: {"choices":[{"delta":{"content":"Informe semanal de prueba"}}]}\n\n',
        'data: [DONE]\n\n',
    ]);
};
try {
    const historyBeforeReport = AI.getAIChatHistory().length;
    const reportResult = await AI.generateWeeklyReport();
    ok('informe: generado y guardado', reportResult.ok === true && AI.getAIReports().length === 1);
    ok('informe: texto guardado', AI.getAIReports()[0].text.includes('Informe semanal'));
    ok('informe: no contamina el chat', AI.getAIChatHistory().length === historyBeforeReport);
    ok('informe: petición con instrucciones',
        /TAREA: Genera un informe semanal/.test(reportRequest?.body || ''));
} finally {
    globalThis.fetch = originalReportFetch;
}

// ─── 8. Auditoría estática de integración/backups ───────────────────────────
section('Integración y backups');
const storageSource = readFileSync(join(root, 'js/modules/storage.js'), 'utf8');
const collectIndex = storageSource.indexOf('function _collectDatabase()');
const collectFn = collectIndex >= 0 ? storageSource.slice(collectIndex, collectIndex + 3000) : '';
ok('backup: _collectDatabase no incluye la key', collectFn.length > 0
    && !collectFn.includes('nutrition_ai_key') && !collectFn.includes('AI_KEY_STORAGE'));
ok('backup: _collectDatabase no incluye informes', collectFn.length > 0
    && !collectFn.includes('nutrition_ai_reports'));
const buildBackupIndex = storageSource.indexOf('function _buildBackup()');
const buildBackupSection = buildBackupIndex >= 0 ? storageSource.slice(buildBackupIndex, buildBackupIndex + 2500) : '';
ok('backup: _buildBackup no incluye la key', buildBackupSection.length > 0
    && !buildBackupSection.includes('nutrition_ai_key') && !buildBackupSection.includes('AI_KEY_STORAGE'));
ok('backup: _buildBackup no incluye informes', buildBackupSection.length > 0
    && !buildBackupSection.includes('nutrition_ai_reports'));
ok('limpieza: clearAllData borra la key y los datos de IA',
    ['nutrition_ai_key', 'nutrition_ai_settings', 'nutrition_ai_chat', 'nutrition_ai_reports']
        .every(key => storageSource.includes(`'${key}'`)));

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
ok('html: pestaña IA', indexHtml.includes('data-tab="ia"') && indexHtml.includes('id="ia"'));
ok('html: panel BYOK', indexHtml.includes('id="aiApiKey"') && indexHtml.includes('id="aiProxyUrl"'));
ok('html: versión 134', indexHtml.includes('js/app.js?v=134'));
ok('html: CSS con cache-busting 134', indexHtml.includes('css/styles.css?v=20261031-134'));
ok('html: selector de esfuerzo', indexHtml.includes('id="aiReasoningEffort"'));
ok('html: panel de contexto', indexHtml.includes('id="aiContextSummary"') && indexHtml.includes('id="aiContextCard"'));
ok('html: detener y reintentar', indexHtml.includes('id="aiStopBtn"') && indexHtml.includes('id="aiRetryBtn"'));
ok('html: informe semanal', indexHtml.includes('id="aiGenerateReportBtn"') && indexHtml.includes('id="aiReportsList"'));
ok('html: sugerencias dinámicas', indexHtml.includes('id="aiDynamicPrompts"'));

const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
ok('sw: versión 134', /CACHE_VERSION\s*=\s*134/.test(swSource));
ok('sw: módulos IA cacheados', swSource.includes('/dieta/js/modules/ai.js') && swSource.includes('/dieta/js/modules/ai-context.js'));
ok('sw: solo cachea GET', swSource.includes("event.request.method !== 'GET'"));

const privacySource = readFileSync(join(root, 'privacy.html'), 'utf8');
ok('privacidad: sección de IA', privacySource.includes('Asistente de IA opcional') && privacySource.includes('BYOK'));
ok('privacidad: retención explicada', privacySource.includes('30 días'));
ok('privacidad: comidas recientes explicadas', privacySource.includes('últimos 3 días de alimentos'));
ok('privacidad: informes locales', privacySource.includes('informes semanales') && privacySource.includes('fuera de las copias de seguridad'));
ok('privacidad: informe anterior explicado', privacySource.includes('informe anterior guardado'));

const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
ok('app: importa e inicializa la IA', appSource.includes("from './modules/ai.js'") && appSource.includes('window.initAITab'));
ok('app: expone controles de IA',
    appSource.includes('window.stopAIGeneration')
    && appSource.includes('window.generateWeeklyReport')
    && appSource.includes('window.refreshAIContextPreview'));

const workerSource = readFileSync(join(root, 'worker/src/index.js'), 'utf8');
ok('worker: no tiene key propia', !/env\.OPENCODE_API_KEY/.test(workerSource));
ok('worker: no registra datos', !/console\.(log|error|warn|info)/.test(workerSource));
ok('worker: no almacena estado', !/\benv\.(KV|DB|R2)\b|caches\.(open|match|put)/i.test(workerSource));
ok('worker: conserva reasoning_content', workerSource.includes('reasoning_content'));

const aiSource = readFileSync(join(root, 'js/modules/ai.js'), 'utf8');
ok('ia: reenvía reasoning_content', aiSource.includes('reasoning_content'));
ok('ia: reintenta fallos transitorios', aiSource.includes('requestAIChatWithRetry'));
ok('ia: la prueba ya no usa 16 tokens', !/maxTokens:\s*16\b/.test(aiSource));
ok('ia: panel de contexto', aiSource.includes('refreshAIContextPreview'));
ok('ia: detener y reintentar',
    aiSource.includes('stopAIGeneration') && aiSource.includes('retryLastAIMessage'));
ok('ia: informes semanales',
    aiSource.includes('generateWeeklyReport') && aiSource.includes('AI_REPORTS_STORAGE'));
ok('ia: sugerencias dinámicas', aiSource.includes('_renderAIDynamicPrompts'));
ok('ia: selector de esfuerzo', aiSource.includes('reasoningEffort'));

const contextSource = readFileSync(join(root, 'js/modules/ai-context.js'), 'utf8');
ok('ia-contexto: incluye borradores y detalle de ejercicios',
    contextSource.includes('getWorkoutSessions')
    && contextSource.includes('exerciseDetails')
    && contextSource.includes('drafts'));
ok('ia-contexto: incluye comidas recientes', contextSource.includes('recentFoods'));

const runAll = readFileSync(join(root, 'tests/run-all.mjs'), 'utf8');
ok('tests: suite registrada', runAll.includes('audit-ai.mjs'));

console.log(failures === 0
    ? '\nAI AUDIT PASSED'
    : `\nAI AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
