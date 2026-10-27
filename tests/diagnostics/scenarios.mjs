// Diagnostic harness A–J: runs the REAL nutrition.js functions against synthetic
// scenarios. It prints the estimated TDEE/targets; it is not a pass/fail suite.
// Run with `npm run diagnose`.
globalThis.localStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
    clear() { this._s.clear(); },
};
globalThis.document = { getElementById() { return null; } };
globalThis.window = {};

const load = (p) => import(new URL(`../../js/modules/${p}`, import.meta.url).href);
const { default: AppState } = await load('state.js');
const N = await load('nutrition.js');

const DAY = 86400000;
const base = Date.UTC(2026, 0, 1);
const key = (i) => {
    const d = new Date(base + i * DAY);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

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

function putDay(i, kcal, macro = {}) {
    const k = key(i);
    AppState.allDays[k] = { date: k, meals: { breakfast: [{ name: 'synthetic', kcal, protein: macro.p || 0, carbs: macro.c || 0, fats: macro.f || 0 }] } };
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
function evalAt(i) {
    const dateKey = key(i + 1); // next day, uses data < dateKey
    const a = N.calculateAdaptiveTDEEForDate(dateKey);
    const d = N.getDynamicDayTargets(dateKey);
    return { ...a, goalCals: d?.cals, goalTdee: d?.tdee, surplus: d?.surplusTarget, deficit: d?.deficitTarget };
}

// ── Scenario A: stable maintenance, true TDEE 2300, intake 2300, daily noise
{
    resetConfig();
    const rand = rng(1);
    const trueTdee = 2300, intake = 2300;
    let w = 80;
    for (let i = 0; i < 60; i++) {
        const n = (rand() - 0.5) * 0.6; // measurement noise, not physiological
        putWeight(i, w + n);
        putDay(i, intake);
        w += (intake - trueTdee) / 7700;
    }
    const out = [13, 20, 27, 34, 41, 55].map(i => ({ day: i + 1, ...evalAt(i) }));
    console.log('\nA stable maintenance trueTDEE=2300 intake=2300');
    out.forEach(o => console.log(o.day, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'raw', o.rawAdaptive, 'formula', o.formulaTDEE, 'goal', o.goalCals));
}

// ── Scenario B: constant deficit, true TDEE 2400, intake 1800
{
    resetConfig();
    const rand = rng(2);
    const trueTdee = 2400, intake = 1800;
    let w = 85;
    for (let i = 0; i < 60; i++) {
        const n = (rand() - 0.5) * 0.6;
        putWeight(i, w + n);
        putDay(i, intake);
        w += (intake - trueTdee) / 7700;
    }
    console.log('\nB deficit trueTDEE=2400 intake=1800');
    [13, 20, 27, 34, 41, 55].forEach(i => { const o = evalAt(i); console.log(i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'raw', o.rawAdaptive, 'goal', o.goalCals); });
    console.log('true weight at eval 28/56', (85 + (1800 - 2400) / 7700 * 28).toFixed(2), (85 + (1800 - 2400) / 7700 * 56).toFixed(2));
}

// ── Scenario C: definition -> maintenance with 1.5kg water/glycogen rebound over first 4 days
// Nota: este escenario no fija phaseStartDate; el rebote se ve a propósito aquí.
// El hold real se valida en audit-tdee-p0.mjs.
{
    resetConfig({ goalPhase: 'mantenimiento' });
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
    console.log('\nC definition -> maintenance, trueTDEE 2400, intake jumps to 2400, +1.5kg water rebound');
    [35, 41, 42, 43, 44, 45, 46, 48, 50, 52, 55, 60, 70, 83].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'goal', o.goalCals); });
}

// ── Scenario D: start bulk, true TDEE 2400, intake 2550, initial 1.5kg water/glycogen gain
{
    resetConfig({ goalPhase: 'volumen' });
    const rand = rng(4);
    const trueTdee = 2400, intake = 2550;
    let w = 80;
    for (let i = 0; i < 28; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2400); }
    for (let i = 28; i < 70; i++) {
        const rebound = i < 33 ? 1.5 * (i - 27) / 5 : 1.5;
        putWeight(i, w + rebound + (rand() - 0.5) * 0.4); putDay(i, intake);
        w += (intake - trueTdee) / 7700;
    }
    console.log('\nD start volume, trueTDEE 2400, intake 2550, +1.5kg water initial');
    [27, 30, 32, 34, 36, 40, 45, 50, 55, 60, 69].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'goal', o.goalCals, 'surplus', o.surplus); });
}

// ── Scenario E: excessive surplus after maintenance: intake 3000 vs TDEE 2400
{
    resetConfig({ goalPhase: 'volumen' });
    const rand = rng(5);
    const trueTdee = 2400, intake = 3000;
    let w = 80;
    for (let i = 0; i < 28; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2400); }
    for (let i = 28; i < 70; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, intake); w += (intake - trueTdee) / 7700; }
    console.log('\nE excessive surplus trueTDEE 2400 intake 3000');
    [27, 30, 34, 38, 42, 48, 55, 62, 69].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'goal', o.goalCals, 'surplus', o.surplus); });
}

// ── Scenario F: apparent surplus but weight stagnant (intake 2800, true TDEE rises to 2800)
{
    resetConfig({ goalPhase: 'volumen' });
    const rand = rng(6);
    let w = 80;
    for (let i = 0; i < 28; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2400); }
    for (let i = 28; i < 84; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2800); } // no true gain
    console.log('\nF apparent surplus 2800, weight flat (TDEE=2800)');
    [27, 34, 41, 48, 55, 62, 70, 80, 83].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'goal', o.goalCals, 'surplus', o.surplus); });
}

// ── Scenario G: incomplete logging. True TDEE 2500, true intake 2500; user logs 1800 on 60% days.
{
    resetConfig();
    const rand = rng(7);
    const trueTdee = 2500;
    let w = 80;
    for (let i = 0; i < 60; i++) {
        putWeight(i, w + (rand() - 0.5) * 0.5);
        if (i % 5 < 3) putDay(i, 1800);
        w += (2500 - 2500) / 7700; // truly stable
    }
    console.log('\nG incomplete/underlogged: true 2500 intake & TDEE, 60% days logged at 1800');
    [13, 20, 27, 34, 41, 55].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'raw', o.rawAdaptive, 'goal', o.goalCals); });
}

// ── Scenario H: one 2kg water spike at the most recent weigh-in
{
    resetConfig();
    const rand = rng(8);
    const trueTdee = 2400;
    let w = 80;
    for (let i = 0; i < 45; i++) {
        let n = (rand() - 0.5) * 0.4;
        if (i === 44) n += 2.0;
        putWeight(i, w + n); putDay(i, 2400); w += (2400 - trueTdee) / 7700;
    }
    console.log('\nH outlet: 2kg spike on last weigh-in only');
    [40, 42, 43, 44].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'raw', o.rawAdaptive, 'goal', o.goalCals); });
}

// ── Scenario I: step change in true TDEE from 2300 to 2700 at day 42, intake 2300
{
    resetConfig();
    const rand = rng(9);
    let w = 80;
    for (let i = 0; i < 42; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2300); }
    for (let i = 42; i < 90; i++) { putWeight(i, w + (rand() - 0.5) * 0.4); putDay(i, 2300); w += (2300 - 2700) / 7700; }
    console.log('\nI activity increase: trueTDEE 2300->2700 at day 42, intake 2300');
    [41, 45, 48, 52, 56, 60, 65, 70, 80, 89].forEach(i => { const o = evalAt(i); console.log('day', i + 1, 'tdee', o.tdee, 'src', o.source, 'conf', o.confidence, 'valid', o.daysUsed, 'raw', o.rawAdaptive, 'goal', o.goalCals); });
}

// ── Formula initial / double count examples using actual functions
{
    resetConfig({ currentWeight: 67.6, height: 170, age: 33, gender: 'male', tdeeMode: 'formula' });
    const tmr = N.calculateTMR();
    console.log('\nFormula check 67.6kg/170/33/male');
    console.log('TMR', tmr, 'TDEE rest', N.calculateTDEE('descanso'), 'TDEE training', N.calculateTDEE('entreno'));
    const today = key(0);
    localStorage.setItem('workoutSessions', JSON.stringify({ [today]: { date: today, finalized: true, exercises: [{ exerciseId: 1, sets: [{ kg: 50, reps: 10 }] }], estimatedKcal: 400 } }));
    const d = N.getDynamicDayTargets(today);
    console.log('formula mode training-day target', JSON.stringify({ tdee: d.tdee, tdeeBase: d.tdeeBase, workout: d.workoutKcal, cals: d.cals }));
}
