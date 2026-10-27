// P0 regression suite: adaptive-TDEE quality gates, transition holds, phase
// history, macro fitting and calorie floor. Runs the real modules against
// synthetic data; never touches the user's localStorage.
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
const S = await load('storage.js');
const C = await load('constants.js');

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
function putDay(i, kcal) {
    const k = key(i);
    AppState.allDays[k] = { date: k, meals: { breakfast: [{ name: 'synthetic', kcal }] } };
}
function putWeight(i, w) {
    const k = key(i);
    const idx = AppState.config.weightHistory.findIndex(e => e.date === k);
    const e = { date: k, weight: Math.round(w * 100) / 100, day: i + 1 };
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

// ── 1. 21 pesajes, 18 días de comida: cobertura 86 %, confianza alta ─────────
{
    resetConfig();
    const missingFood = new Set([3, 10, 17]);
    for (let i = 0; i < 21; i++) {
        putWeight(i, 80 + (i % 3) * 0.05);
        if (!missingFood.has(i)) putDay(i, 2300);
    }
    const r = evalKey(key(21));
    ok('cobertura alta: fuente adaptativa', r.a.source === 'adaptive', `source=${r.a.source}`);
    ok('cobertura alta: confianza high', r.a.confidence === 'high', `confidence=${r.a.confidence}`);
    ok('cobertura alta: 18/21 ≈ 0.857', near(r.a.coverage, 18 / 21, 1e-9), `coverage=${r.a.coverage}`);
    ok('cobertura alta: el objetivo usa el adaptativo', r.fallback == null, `fallback=${r.fallback}`);
}

// ── 2. 21 pesajes cada 2 días, 18/41 días de comida: cobertura 44 % ──────────
{
    resetConfig();
    for (let i = 0; i <= 40; i += 2) putWeight(i, 80);
    for (let i = 0; i < 18; i++) putDay(i, 2300);
    const r = evalKey(key(41));
    ok('cobertura baja: cae a fórmula', r.a.source === 'formula', `source=${r.a.source}`);
    ok('cobertura baja: motivo low_coverage', r.a.fallbackReason === 'low_coverage', `reason=${r.a.fallbackReason}`);
    ok('cobertura baja: 18/41 ≈ 0.439', near(r.a.coverage, 18 / 41, 1e-9), `coverage=${r.a.coverage}`);
    ok('cobertura baja: objetivo = fórmula', near(r.goalTdee, r.a.formulaTDEE, 1), `goal=${r.goalTdee} formula=${r.a.formulaTDEE}`);
    ok('cobertura baja: fallback visible en objetivos', r.fallback === 'low_coverage', `fallback=${r.fallback}`);
}

// ── 3. Confianza baja (13/21 días) nunca fija el objetivo ────────────────────
{
    resetConfig();
    for (let i = 0; i < 21; i++) putWeight(i, 80 + (i % 4) * 0.05);
    for (let i = 0; i < 21; i++) if (i >= 8) putDay(i, 2300);
    const r = evalKey(key(21));
    ok('confianza baja: estimación adaptativa low', r.a.source === 'adaptive' && r.a.confidence === 'low',
        `source=${r.a.source} confidence=${r.a.confidence} coverage=${r.a.coverage?.toFixed(3)}`);
    ok('confianza baja: el objetivo NO usa el adaptativo', r.fallback === 'low_confidence', `fallback=${r.fallback}`);
    ok('confianza baja: objetivo = fórmula', near(r.goalTdee, r.a.formulaTDEE, 1), `goal=${r.goalTdee} formula=${r.a.formulaTDEE}`);
}

// ── 4. Menos de 14 pesajes: fórmula y motivo explícito ───────────────────────
{
    resetConfig();
    for (let i = 0; i < 10; i++) { putWeight(i, 80); putDay(i, 2300); }
    const r = evalKey(key(10));
    ok('pocos pesajes: fórmula', r.a.source === 'formula', `source=${r.a.source}`);
    ok('pocos pesajes: motivo insufficient_weigh_ins', r.a.fallbackReason === 'insufficient_weigh_ins', `reason=${r.a.fallbackReason}`);
}

// ── 5. Transición definición → mantenimiento: objetivo congelado 14 días ─────
{
    resetConfig({ goalPhase: 'mantenimiento', phaseStartDate: key(42) });
    const rand = rng(3);
    const trueTdee = 2400;
    let w = 85;
    for (let i = 0; i < 42; i++) {
        const n = (rand() - 0.5) * 0.5;
        putWeight(i, w + n); putDay(i, 1800);
        w += (1800 - trueTdee) / 7700;
    }
    for (let i = 42; i < 84; i++) {
        const rebound = i < 46 ? 1.5 * (i - 41) / 4 : 1.5;
        const n = (rand() - 0.5) * 0.5;
        putWeight(i, w + rebound + n); putDay(i, 2400);
        w += (2400 - trueTdee) / 7700;
    }
    const pre = evalKey(key(41));
    const held = [];
    for (let i = 42; i < 56; i++) held.push(evalKey(key(i)));
    ok('C: pre-transición fiable', pre.a.source === 'adaptive' && pre.a.confidence !== 'low',
        `source=${pre.a.source} confidence=${pre.a.confidence}`);
    ok('C: los 14 días usan hold', held.every(x => x.a.transitionHold === true),
        `holds=${held.filter(x => x.a.transitionHold).length}/14`);
    const cals = held.map(x => x.goalCals);
    const spread = Math.max(...cals) - Math.min(...cals);
    ok('C: objetivo estable ±100 kcal', spread <= 100, `spread=${spread} kcal [${Math.min(...cals)}–${Math.max(...cals)}]`);
    ok('C: objetivo del hold = TDEE previo', held.every(x => near(x.goalCals, pre.a.tdee, 100)),
        `hold=${cals[0]} preTDEE=${pre.a.tdee}`);
    const after = evalKey(key(56));
    ok('C: el hold termina a los 14 días', after.a.transitionHold !== true, `transitionHold=${after.a.transitionHold}`);
}

// ── 6. Transición mantenimiento → volumen: objetivo congelado 14 días ────────
{
    resetConfig({ goalPhase: 'volumen', phaseStartDate: key(28) });
    const rand = rng(4);
    const trueTdee = 2400, intake = 2550;
    let w = 80;
    for (let i = 0; i < 28; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2400); }
    for (let i = 28; i < 70; i++) {
        const rebound = i < 33 ? 1.5 * (i - 27) / 5 : 1.5;
        putWeight(i, w + rebound + (rand() - 0.5) * 0.4); putDay(i, intake);
        w += (intake - trueTdee) / 7700;
    }
    const pre = evalKey(key(27));
    const held = [];
    for (let i = 28; i < 42; i++) held.push(evalKey(key(i)));
    ok('D: pre-transición fiable', pre.a.source === 'adaptive' && pre.a.confidence !== 'low',
        `source=${pre.a.source} confidence=${pre.a.confidence}`);
    ok('D: los 14 días usan hold', held.every(x => x.a.transitionHold === true),
        `holds=${held.filter(x => x.a.transitionHold).length}/14`);
    const cals = held.map(x => x.goalCals);
    const spread = Math.max(...cals) - Math.min(...cals);
    ok('D: objetivo estable ±100 kcal', spread <= 100, `spread=${spread} kcal [${Math.min(...cals)}–${Math.max(...cals)}]`);
    ok('D: objetivo del hold = TDEE previo + superávit', held.every(x => near(x.goalCals, pre.a.tdee + x.d.surplusTarget, 100)),
        `hold=${cals[0]} preTDEE=${pre.a.tdee} surplus=${held[0].d.surplusTarget}`);
    const after = evalKey(key(42));
    ok('D: el hold termina a los 14 días', after.a.transitionHold !== true, `transitionHold=${after.a.transitionHold}`);
}

// ── 7. phaseHistory: saneo e importación ────────────────────────────────────
{
    const today = S.getDateKey(new Date());
    const clean = S.sanitizeConfig({
        phaseHistory: [
            { date: '2026-01-01', phase: 'definicion', startWeight: 80, tdeeMode: 'adaptive' },
            { date: '2026-02-01', phase: 'mantenimiento', startWeight: '79.5', tdeeMode: 'formula' },
            { date: 'bad', phase: 'volumen', startWeight: 80 },
            { date: '2026-03-01', phase: 'otra', startWeight: 80 },
            { date: '2099-01-01', phase: 'volumen', startWeight: 80 },
            { date: '2026-04-01', phase: 'volumen', startWeight: 900 },
            { date: '2026-05-01', phase: 'volumen', startWeight: 10 },
            null,
        ],
    });
    ok('phaseHistory: conserva solo entradas válidas', clean.phaseHistory?.length === 4, `len=${clean.phaseHistory?.length}`);
    ok('phaseHistory: normaliza peso y modo',
        clean.phaseHistory?.[1]?.startWeight === 79.5 && clean.phaseHistory?.[1]?.tdeeMode === 'formula',
        JSON.stringify(clean.phaseHistory?.[1]));
    ok('phaseHistory: rechaza fechas futuras',
        clean.phaseHistory?.every(e => e.date <= today), JSON.stringify(clean.phaseHistory?.map(e => e.date)));
    ok('phaseHistory: peso fuera de rango queda a null',
        clean.phaseHistory?.filter(e => e.startWeight === null).length === 2,
        JSON.stringify(clean.phaseHistory?.map(e => e.startWeight)));
    ok('phaseHistory: ordenado por fecha',
        clean.phaseHistory?.every((e, i, a) => i === 0 || a[i - 1].date <= e.date),
        JSON.stringify(clean.phaseHistory?.map(e => e.date)));

    const imported = S.validateBackupData({
        config: {
            goalPhase: 'definicion',
            phaseHistory: [{ date: '2026-05-01', phase: 'volumen', startWeight: 81, tdeeMode: 'adaptive' }],
        },
    });
    ok('phaseHistory: sobrevive a una importación', imported.ok && imported.cleaned?.config?.phaseHistory?.length === 1,
        `ok=${imported.ok} len=${imported.cleaned?.config?.phaseHistory?.length}`);
}

// ── 8. Señales de macros y suelo ─────────────────────────────────────────────
{
    resetConfig({ currentWeight: 120, startWeight: 120, height: 150, age: 60, gender: 'female', goalPhase: 'definicion' });
    putWeight(0, 120);
    putDay(0, 1500);
    const r = evalKey(key(1));
    ok('macros: caben en el objetivo', r.d.macroOverflow === false,
        `macroCals=${r.d.protein * 4 + r.d.fats * 9} target=${r.d.targetCals}`);
    ok('macros: recorta grasa antes que proteína', r.d.fatReduced === true && r.d.fats <= r.d.fatsPreferred,
        `fats=${r.d.fats}/${r.d.fatsPreferred} protein=${r.d.protein}/${r.d.proteinDesired}`);
    ok('macros: respeta el mínimo de proteína 1.2 g/kg', r.d.protein >= Math.round(120 * 1.2),
        `protein=${r.d.protein}`);
    ok('macros: el objetivo refleja las kcal reales', r.d.cals === r.d.protein * 4 + r.d.fats * 9 + r.d.carbs * 4,
        `cals=${r.d.cals}`);

    resetConfig({ currentWeight: 40, startWeight: 40, height: 140, age: 60, gender: 'female', goalPhase: 'definicion' });
    putWeight(0, 40);
    putDay(0, 1200);
    const floor = evalKey(key(1));
    ok('suelo: detecta objetivo por encima del TDEE', floor.d.belowFloor === true,
        `tdee=${floor.d.tdee} cals=${floor.d.cals}`);
}

// ── 9. Constante de tejido magro ────────────────────────────────────────────
ok('constante LEAN_GAIN_KCAL_PER_KG = 6000', C.LEAN_GAIN_KCAL_PER_KG === 6000,
    `value=${C.LEAN_GAIN_KCAL_PER_KG}`);

console.log(`\n${failures === 0 ? 'ALL P0 CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
