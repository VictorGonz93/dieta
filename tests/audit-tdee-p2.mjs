// P2 regression suite: robust weight prediction (Theil-Sen/MAD) and charts with
// a real date axis. Runs the real modules against synthetic data.
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
        this.style = {};
        this.dataset = {};
        this.classList = {
            _s: new Set(),
            add(c) { this._s.add(c); },
            remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); },
            toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
        };
    }
    replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
    append(...nodes) { (this.children ||= []).push(...nodes); }
    appendChild(node) { (this.children ||= []).push(node); return node; }
    setAttribute() {}
    getContext() { return null; }
}
const elements = new Map();
const fakeDocument = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new FakeEl(id));
        return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return new FakeEl(); },
};
globalThis.document = fakeDocument;
globalThis.window = {};

// Chart.js stub: captures every config so the suite can inspect axes/datasets.
globalThis.Chart = class {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        canvas.chart = this;
    }
    destroy() {
        this.destroyed = true;
        if (this.canvas && this.canvas.chart === this) this.canvas.chart = null;
    }
};

const load = (p) => import(new URL(`../js/modules/${p}`, import.meta.url).href);
const { default: AppState } = await load('state.js');
const N = await load('nutrition.js');
const W = await load('weight.js');
const Charts = await load('charts.js');
const { getDateKey } = await load('storage.js');

const DAY = 86400000;
const dayKeyAgo = (days) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return getDateKey(d);
};
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

let failures = 0;
function ok(name, cond, detail = '') {
    if (cond) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function near(a, b, tol) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol; }

function resetConfig(overrides = {}) {
    Object.assign(AppState.config, {
        startWeight: 85, currentWeight: 85, targetWeight: 80, startDate: dayKeyAgo(90),
        height: 180, age: 30, gender: 'male',
        goalPhase: 'definicion', lossPace: 'moderado', gainPace: 'lento',
        tdeeMode: 'adaptive', proteinFactor: 2.0,
        deficitTarget: 500, surplusTarget: 150,
        phaseStartDate: null, phaseStartWeight: null, phaseHistory: [],
        customGymRoutine: Object.fromEntries(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => [d, { type: 'descanso', label: 'Descanso', templateId: '' }])),
        weightHistory: [],
    }, overrides);
    AppState.allDays = {};
    AppState.currentDate = new Date();
    elements.clear();
    localStorage.clear();
    N.clearAdaptiveTDEECache();
}
function addWeightAgo(days, weight) {
    AppState.config.weightHistory.push({
        date: dayKeyAgo(days),
        weight: Math.round(weight * 100) / 100,
        day: 90 - days,
    });
}
function sortWeights() {
    AppState.config.weightHistory.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// ── 1. Un pico de 2 kg en el último pesaje no dispara el ETA ────────────────
{
    resetConfig();
    for (let i = 27; i >= 0; i--) {
        // 0.5 kg/semana de pérdida + pico de agua el día más reciente.
        const trendWeight = 85 - (27 - i) * (0.5 / 7);
        const spike = i === 0 ? 2 : 0;
        addWeightAgo(i, trendWeight + spike);
    }
    sortWeights();
    AppState.config.currentWeight = AppState.config.weightHistory.at(-1).weight;
    const pred = W.calculateWeightPrediction();
    ok('predicción robusta: mantiene ~0.5 kg/sem pese al pico',
        near(parseFloat(pred.weeklyLoss), 0.5, 0.08),
        `weeklyLoss=${pred.weeklyLoss}`);
    ok('predicción robusta: base suavizada, no el pico',
        pred.baselineWeight < 83.6,
        `baseline=${pred.baselineWeight} actual=${AppState.config.currentWeight}`);
    ok('predicción robusta: ETA sin el pico',
        pred.estimatedDays >= 38 && pred.estimatedDays <= 50,
        `days=${pred.estimatedDays} date=${pred.estimatedDate}`);
    ok('predicción robusta: confianza alta con 28 pesajes y 27 días',
        pred.confidence === 'high' && pred.pointsTotal === 28 && pred.spanDays === 27,
        `confidence=${pred.confidence} points=${pred.pointsUsed}/${pred.pointsTotal} span=${pred.spanDays}`);
}

// ── 2. Dos pesajes siguen produciendo una estimación ────────────────────────
{
    resetConfig({ targetWeight: 75 });
    addWeightAgo(7, 80);
    addWeightAgo(0, 79.8);
    sortWeights();
    AppState.config.currentWeight = 79.8;
    const pred = W.calculateWeightPrediction();
    ok('predicción con 2 pesajes: tasa simple conservada',
        near(parseFloat(pred.weeklyLoss), 0.2, 0.01), `weeklyLoss=${pred.weeklyLoss}`);
    ok('predicción con 2 pesajes: ETA calculado',
        pred.estimatedDays === 168, `days=${pred.estimatedDays}`);
    ok('predicción con 2 pesajes: confianza baja',
        pred.confidence === 'low', `confidence=${pred.confidence}`);
}

// ── 3. Mantenimiento: tendencia observada, sin ETA ──────────────────────────
{
    resetConfig({ goalPhase: 'mantenimiento', startWeight: 80, currentWeight: 80, targetWeight: 80 });
    const rand = rng(31);
    for (let i = 27; i >= 0; i--) addWeightAgo(i, 80 + (rand() - 0.5) * 0.5);
    sortWeights();
    AppState.config.currentWeight = 80;
    const pred = W.calculateWeightPrediction();
    ok('predicción mantenimiento: sin días hasta meta', pred.estimatedDays === null,
        `days=${pred.estimatedDays}`);
    ok('predicción mantenimiento: tendencia semanal disponible',
        Number.isFinite(parseFloat(pred.weeklyGain)), `weeklyGain=${pred.weeklyGain}`);
    ok('predicción mantenimiento: confianza por calidad',
        pred.confidence === 'high', `confidence=${pred.confidence}`);
}

// ── 4. Volumen: ETA por tendencia robusta ───────────────────────────────────
{
    resetConfig({
        goalPhase: 'volumen', startWeight: 75, currentWeight: 75.95, targetWeight: 77,
        phaseStartWeight: 75, phaseStartDate: dayKeyAgo(27),
    });
    for (let i = 27; i >= 0; i--) addWeightAgo(i, 75 + (27 - i) * (0.25 / 7));
    sortWeights();
    AppState.config.currentWeight = AppState.config.weightHistory.at(-1).weight;
    const pred = W.calculateWeightPrediction();
    ok('predicción volumen: ganancia ~0.25 kg/sem',
        near(parseFloat(pred.weeklyGain), 0.25, 0.05), `weeklyGain=${pred.weeklyGain}`);
    ok('predicción volumen: ETA hacia la meta',
        pred.estimatedDays >= 28 && pred.estimatedDays <= 34,
        `days=${pred.estimatedDays} date=${pred.estimatedDate}`);
}

// ── 5. Historial desordenado (import) da el mismo resultado ─────────────────
{
    resetConfig();
    for (let i = 27; i >= 0; i--) addWeightAgo(i, 85 - (27 - i) * (0.5 / 7));
    // Orden inverso: la predicción debe ordenar defensivamente.
    AppState.config.weightHistory.reverse();
    AppState.config.currentWeight = 83.07;
    const pred = W.calculateWeightPrediction();
    ok('predicción: historial desordenado se ordena',
        pred.estimatedDays >= 40 && pred.estimatedDays <= 48,
        `days=${pred.estimatedDays} weeklyLoss=${pred.weeklyLoss}`);
}

// ── 6. Gráficos: eje temporal continuo (peso y predicción) ──────────────────
{
    resetConfig();
    const d0 = dayKeyAgo(10), d1 = dayKeyAgo(9), d2 = dayKeyAgo(0);
    AppState.config.weightHistory = [
        { date: d0, weight: 80.0, day: 80 },
        { date: d1, weight: 80.1, day: 81 },
        { date: d2, weight: 79.5, day: 90 },
    ];
    AppState.currentDate = new Date();
    AppState.allDays = {};
    Charts.renderWeightPredictionChart();
    const canvas = fakeDocument.getElementById('weightPredictionChart');
    const cfg = canvas.chart && canvas.chart.config;
    ok('gráfico predicción: existe configuración', !!cfg);
    if (cfg) {
        ok('gráfico predicción: 11 días continuos', cfg.data.labels.length === 11,
            `labels=${cfg.data.labels.length}`);
        ok('gráfico predicción: huecos como null',
            cfg.data.datasets[0].data[2] === null && cfg.data.datasets[0].data[9] === null,
            JSON.stringify(cfg.data.datasets[0].data));
        ok('gráfico predicción: datos reales en su fecha',
            cfg.data.datasets[0].data[0] === 80 && cfg.data.datasets[0].data[10] === 79.5,
            JSON.stringify(cfg.data.datasets[0].data));
    }

    Charts.initWeightChart();
    const weightCfg = fakeDocument.getElementById('weightChart').chart?.config;
    ok('gráfico peso: existe configuración', !!weightCfg);
    if (weightCfg) {
        ok('gráfico peso: 11 días continuos', weightCfg.data.labels.length === 11,
            `labels=${weightCfg.data.labels.length}`);
        ok('gráfico peso: huecos como null',
            weightCfg.data.datasets[0].data[2] === null && weightCfg.data.datasets[0].data[9] === null,
            JSON.stringify(weightCfg.data.datasets[0].data));
        ok('gráfico peso: la tendencia cubre todo el eje',
            weightCfg.data.datasets[1].data.every(v => Number.isFinite(v)),
            JSON.stringify(weightCfg.data.datasets[1].data));
    }
}

// ── 7. Gráficos: calorías/proteína con días sin registro como huecos ────────
{
    resetConfig();
    const d0 = dayKeyAgo(10), d1 = dayKeyAgo(7), d2 = dayKeyAgo(0);
    AppState.allDays = {
        [d0]: { date: d0, meals: { breakfast: [{ name: 'x', kcal: 2000, protein: 150 }] } },
        [d1]: { date: d1, meals: { breakfast: [{ name: 'x', kcal: 2100, protein: 160 }] } },
        [d2]: { date: d2, meals: { breakfast: [{ name: 'x', kcal: 2200, protein: 170 }] } },
    };
    Charts.initCaloriesChart();
    const kcalCfg = fakeDocument.getElementById('caloriesChart').chart?.config;
    ok('gráfico calorías: 11 días continuos', kcalCfg?.data?.labels?.length === 11,
        `labels=${kcalCfg?.data?.labels?.length}`);
    ok('gráfico calorías: días sin comida a null',
        kcalCfg?.data?.datasets?.[0]?.data?.[1] === null && kcalCfg?.data?.datasets?.[0]?.data?.[3] === 2100,
        JSON.stringify(kcalCfg?.data?.datasets?.[0]?.data));

    Charts.initProteinChart();
    const protCfg = fakeDocument.getElementById('proteinChart').chart?.config;
    ok('gráfico proteína: 11 días continuos', protCfg?.data?.labels?.length === 11,
        `labels=${protCfg?.data?.labels?.length}`);
    ok('gráfico proteína: días sin comida a null',
        protCfg?.data?.datasets?.[0]?.data?.[1] === null && protCfg?.data?.datasets?.[0]?.data?.[10] === 170,
        JSON.stringify(protCfg?.data?.datasets?.[0]?.data));
}

console.log(`\n${failures === 0 ? 'ALL P2 CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
