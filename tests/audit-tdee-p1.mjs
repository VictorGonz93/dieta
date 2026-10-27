// P1 regression suite: robust estimator, phase isolation, macro fit, floor and
// maintenance ETA. Runs the real modules against synthetic data.
globalThis.localStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
    clear() { this._s.clear(); },
    key(i) { return [...this._s.keys()][i] ?? null; },
    get length() { return this._s.size; },
};
globalThis.document = { getElementById() { return null; } };
globalThis.window = {};

const load = (p) => import(new URL(`../js/modules/${p}`, import.meta.url).href);
const { default: AppState } = await load('state.js');
const N = await load('nutrition.js');
const S = await load('stats.js');
const W = await load('weight.js');

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
function near(a, b, tol) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol; }

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
    localStorage.clear();
    N.clearAdaptiveTDEECache();
}
function addDay(i, kcal, weight) {
    const k = key(i);
    AppState.allDays[k] = { date: k, meals: { breakfast: [{ name: 'synthetic', kcal }] } };
    const idx = AppState.config.weightHistory.findIndex(e => e.date === k);
    const e = { date: k, weight: Math.round(weight * 100) / 100, day: i + 1 };
    if (idx >= 0) AppState.config.weightHistory[idx] = e; else AppState.config.weightHistory.push(e);
    AppState.config.weightHistory.sort((a, b) => a.date < b.date ? -1 : 1);
    AppState.config.currentWeight = AppState.config.weightHistory[AppState.config.weightHistory.length - 1].weight;
    N.clearAdaptiveTDEECache();
}
function evalKey(k) {
    const a = N.calculateAdaptiveTDEEForDate(k);
    const d = N.getDynamicDayTargets(k);
    return { a, d, goalTdee: d?.tdee, goalCals: d?.cals, fallback: d?.adaptiveFallbackReason };
}

// ── 1. Un pico aislado de 2 kg no mueve el TDEE ─────────────────────────────
{
    resetConfig();
    const rand = rng(21);
    let w = 80;
    for (let i = 0; i < 28; i++) {
        const noise = (rand() - 0.5) * 0.4;
        const spike = i === 27 ? 2 : 0;
        addDay(i, 2400, w + noise + spike);
    }
    const r = evalKey(key(28));
    ok('outlier: fuente adaptativa', r.a.source === 'adaptive', `source=${r.a.source}`);
    ok('outlier: TDEE cerca de 2400 ±150', Math.abs(r.a.tdee - 2400) <= 150,
        `tdee=${r.a.tdee} raw=${r.a.rawAdaptive}`);
    ok('outlier: el pico no pasa como confianza alta ciega',
        Number.isFinite(r.a.pointsUsed) && r.a.pointsUsed <= r.a.pointsTotal,
        `points=${r.a.pointsUsed}/${r.a.pointsTotal}`);
}

// ── 2. Pérdida lineal: TDEE = ingesta + 7700 × ritmo ───────────────────────
{
    resetConfig();
    const rand = rng(22);
    const intake = 2000, lossPerDay = 0.5 / 7; // 0.5 kg/semana
    let w = 85;
    for (let i = 0; i < 35; i++) {
        addDay(i, intake, w + (rand() - 0.5) * 0.2);
        w -= lossPerDay;
    }
    const r = evalKey(key(35));
    const expected = intake + lossPerDay * 7700; // 2550
    ok('tendencia lineal: raw cerca de 2550 ±150', Math.abs(r.a.rawAdaptive - expected) <= 150,
        `raw=${r.a.rawAdaptive} expected=${Math.round(expected)}`);
    ok('tendencia lineal: TDEE final cerca de 2550 ±180', Math.abs(r.a.tdee - expected) <= 180,
        `tdee=${r.a.tdee}`);
    ok('tendencia lineal: confianza alta/media', r.a.confidence === 'high' || r.a.confidence === 'medium',
        `confidence=${r.a.confidence}`);
}

// ── 3. Cambio de fase: no mezclar peso previo con el rebote de agua ─────────
{
    resetConfig({ goalPhase: 'mantenimiento' });
    const rand = rng(23);
    let w = 85;
    for (let i = 0; i < 42; i++) {
        addDay(i, 1800, w + (rand() - 0.5) * 0.4);
        w += (1800 - 2400) / 7700;
    }
    for (let i = 42; i < 72; i++) {
        const rebound = i < 46 ? 1.5 * (i - 41) / 4 : 1.5;
        addDay(i, 2400, w + rebound + (rand() - 0.5) * 0.4);
        // mantenimiento real: el peso fisiológico no cambia
    }
    AppState.config.phaseStartDate = key(42);
    N.clearAdaptiveTDEECache();

    const afterHold = evalKey(key(72));
    ok('fase: hold ya terminado', afterHold.a.transitionHold !== true,
        `hold=${afterHold.a.transitionHold}`);
    ok('fase: fuente adaptativa con datos limpios', afterHold.a.source === 'adaptive',
        `source=${afterHold.a.source} fallback=${afterHold.a.fallbackReason}`);
    ok('fase: TDEE cerca de 2400 ±180 tras el rebote', Math.abs(afterHold.a.tdee - 2400) <= 180,
        `tdee=${afterHold.a.tdee} raw=${afterHold.a.rawAdaptive} weighIns=${afterHold.a.weighIns}`);
    ok('fase: la ventana empieza después del warmup', afterHold.a.weighIns <= 25,
        `weighIns=${afterHold.a.weighIns}`);
}

// ── 4. Macros: caben y respetan prioridades ─────────────────────────────────
{
    resetConfig({ currentWeight: 120, startWeight: 120, height: 150, age: 60, gender: 'female', goalPhase: 'definicion' });
    addDay(0, 1500, 120);
    const r = evalKey(key(1));
    ok('macros: no desbordan el objetivo', r.d.macroOverflow === false,
        `macroCals=${r.d.protein * 4 + r.d.fats * 9} target=${r.d.targetCals}`);
    ok('macros: grasa reducida antes que proteína',
        r.d.fatReduced === true && r.d.fats <= r.d.fatsPreferred,
        `fats=${r.d.fats}/${r.d.fatsPreferred} protein=${r.d.protein}/${r.d.proteinDesired}`);
    ok('macros: proteína ≥ 1.2 g/kg', r.d.protein >= Math.round(120 * 1.2),
        `protein=${r.d.protein}`);
    ok('macros: objetivo = suma de macros', r.d.cals === r.d.protein * 4 + r.d.fats * 9 + r.d.carbs * 4,
        `cals=${r.d.cals}`);
}

// ── 5. Suelo en todas las fases ─────────────────────────────────────────────
{
    resetConfig({ currentWeight: 40, startWeight: 40, height: 140, age: 60, gender: 'female', goalPhase: 'mantenimiento' });
    addDay(0, 1200, 40);
    const maint = evalKey(key(1));
    ok('suelo mantenimiento: objetivo ≥ 1200', maint.d.cals >= 1200,
        `cals=${maint.d.cals} raw=${maint.d.rawCals}`);
    ok('suelo mantenimiento: marca floorApplied', maint.d.floorApplied === true,
        `floorApplied=${maint.d.floorApplied}`);

    resetConfig({ currentWeight: 40, startWeight: 40, height: 140, age: 60, gender: 'female', goalPhase: 'volumen' });
    addDay(0, 1200, 40);
    const bulk = evalKey(key(1));
    ok('suelo volumen: objetivo ≥ 1200', bulk.d.cals >= 1200,
        `cals=${bulk.d.cals} raw=${bulk.d.rawCals}`);
    ok('suelo volumen: marca floorApplied', bulk.d.floorApplied === true,
        `floorApplied=${bulk.d.floorApplied}`);
}

// ── 6. Mantenimiento sin ETA ni "días hasta meta" falsos ────────────────────
{
    resetConfig({ goalPhase: 'mantenimiento', currentWeight: 80, targetWeight: 75 });
    AppState.config.weightHistory = [
        { date: key(0), weight: 80 },
        { date: key(7), weight: 79.8 },
    ];
    N.clearAdaptiveTDEECache();
    const progress = S.getWeeklyProgress();
    ok('mantenimiento: sin días hasta meta', progress.daysToGoal === null,
        `daysToGoal=${progress.daysToGoal}`);
    ok('mantenimiento: sin fecha estimada', progress.estimatedDate === null,
        `estimatedDate=${progress.estimatedDate}`);

    const pred = W.calculateWeightPrediction();
    ok('mantenimiento: predicción sin ETA', pred.estimatedDays === null,
        `estimatedDays=${pred.estimatedDays}`);
}

console.log(`\n${failures === 0 ? 'ALL P1 CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
