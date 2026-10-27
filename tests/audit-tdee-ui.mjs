// UI regression suite: renders the real "Tus Objetivos" breakdown against a
// fake DOM. Verifies texts, badges, the phase hold and warnings without a
// browser, so it can run in CI and locally with `npm test`.
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
        this.style = {};
        this.children = [];
    }
    replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    setAttribute() {}
}

const elements = new Map();
const fakeDocument = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new FakeEl(id));
        return elements.get(id);
    },
    createElement() { return new FakeEl(); },
};
globalThis.document = fakeDocument;
globalThis.window = {};

const load = (p) => import(new URL(`../js/modules/${p}`, import.meta.url).href);
const { default: AppState } = await load('state.js');
const N = await load('nutrition.js');
const S = await load('stats.js');

const DAY = 86400000;
const base = Date.UTC(2026, 0, 1);
const key = (i) => {
    const d = new Date(base + i * DAY);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

let failures = 0;
function ok(name, cond, detail = '') {
    if (cond) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function text(id) { return fakeDocument.getElementById(id).textContent; }
function warningsText() {
    return fakeDocument.getElementById('goalWarnings').children
        .map(c => c.children.map(x => x.textContent).join(' ')).join(' | ');
}

function resetConfig(overrides = {}) {
    Object.assign(AppState.config, {
        startWeight: 80, currentWeight: 80, targetWeight: 75, startDate: '2026-01-01',
        height: 180, age: 30, gender: 'male',
        goalPhase: 'mantenimiento', lossPace: 'moderado', gainPace: 'lento',
        tdeeMode: 'adaptive', proteinFactor: 2.0,
        deficitTarget: 500, surplusTarget: 150,
        phaseStartDate: null, phaseStartWeight: null, phaseHistory: [],
        customGymRoutine: Object.fromEntries(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => [d, { type: 'descanso', label: 'Descanso', templateId: '' }])),
        weightHistory: [],
    }, overrides);
    AppState.allDays = {};
    AppState.currentDate = new Date(2026, 0, 29, 12, 0, 0); // día 28 local
    elements.clear();
    localStorage.clear();
    N.clearAdaptiveTDEECache();
}
function addDay(i, kcal, weight) {
    const k = key(i);
    AppState.allDays[k] = { date: k, meals: { breakfast: [{ name: 'synthetic', kcal }] } };
    const idx = AppState.config.weightHistory.findIndex(e => e.date === k);
    const entry = { date: k, weight: Math.round(weight * 100) / 100, day: i + 1 };
    if (idx >= 0) AppState.config.weightHistory[idx] = entry;
    else AppState.config.weightHistory.push(entry);
    AppState.config.weightHistory.sort((a, b) => a.date < b.date ? -1 : 1);
    AppState.config.currentWeight = AppState.config.weightHistory.at(-1).weight;
    N.clearAdaptiveTDEECache();
}

// ── 1. Adaptativo con confianza alta ────────────────────────────────────────
{
    resetConfig();
    const rand = rng(11);
    for (let i = 0; i < 28; i++) addDay(i, 2400, 80 + (rand() - 0.5) * 0.2);
    const a = N.calculateAdaptiveTDEEForDate(key(28));
    S.updateGoalsDisplay();
    ok('UI adaptativo: badge de confianza alta', text('goalQualityBadge').includes('Adaptativo'), text('goalQualityBadge'));
    ok('UI adaptativo: TMB visible', text('goalTmr').includes('kcal'), text('goalTmr'));
    ok('UI adaptativo: mantenimiento visible', text('goalMaintenance').includes('kcal'), text('goalMaintenance'));
    ok('UI adaptativo: objetivo visible', text('goalFinalCals').includes('kcal'), text('goalFinalCals'));
    ok('UI adaptativo: fuente y cobertura', text('goalSourceDetail').includes('cobertura'), text('goalSourceDetail'));
    ok('UI adaptativo: sin aviso de fallback', !warningsText().includes('adaptativo no fija el objetivo'), warningsText());
    ok('UI adaptativo: TDEE del badge coincide', Math.abs(parseInt(text('goalMaintenance'), 10) - a.tdee) <= 1,
        `ui=${text('goalMaintenance')} calc=${a.tdee}`);
}

// ── 2. Fallback por pocos pesajes ───────────────────────────────────────────
{
    resetConfig();
    for (let i = 0; i < 10; i++) addDay(i, 2300, 80);
    S.updateGoalsDisplay();
    ok('UI fallback: badge de descarte', text('goalQualityBadge').includes('descartado'), text('goalQualityBadge'));
    ok('UI fallback: motivo legible', text('goalSourceDetail').includes('faltan pesajes'), text('goalSourceDetail'));
    ok('UI fallback: aviso visible', warningsText().includes('adaptativo no fija el objetivo'), warningsText());
}

// ── 3. Hold de transición ───────────────────────────────────────────────────
{
    resetConfig({ phaseStartDate: key(28) });
    const rand = rng(12);
    for (let i = 0; i < 28; i++) addDay(i, 2400, 80 + (rand() - 0.5) * 0.2);
    S.updateGoalsDisplay();
    ok('UI hold: mantenimiento congelado', text('goalMaintenanceHint').includes('Congelado'), text('goalMaintenanceHint'));
    ok('UI hold: fuente indica días restantes', text('goalSourceDetail').toLowerCase().includes('congelado'), text('goalSourceDetail'));
    ok('UI hold: aviso azul de fase', warningsText().includes('Cambio de fase'), warningsText());
}

// ── 4. Mantenimiento sin ETA ────────────────────────────────────────────────
{
    resetConfig();
    for (let i = 0; i < 28; i++) addDay(i, 2300, 80);
    S.updateGoalsDisplay();
    ok('UI mantenimiento: ETA Mantener', text('goalTimeEstimate') === 'Mantener', text('goalTimeEstimate'));
    ok('UI mantenimiento: explicación sin fecha', text('goalTimeExplain').includes('no hay fecha'), text('goalTimeExplain'));
}

// ── 5. Suelo calórico en mantenimiento ──────────────────────────────────────
{
    resetConfig({ currentWeight: 40, startWeight: 40, targetWeight: 42, height: 140, age: 60, gender: 'female', goalPhase: 'mantenimiento' });
    addDay(0, 1200, 40);
    S.updateGoalsDisplay();
    ok('UI suelo: objetivo ≥ 1200', parseInt(text('goalFinalCals'), 10) >= 1200, text('goalFinalCals'));
    ok('UI suelo: aviso visible', warningsText().includes('suelo calórico'), warningsText());
}

console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
