// Closed-loop diagnostic: the app's own targets drive intake day by day.
// Prints the trajectory; it is not a pass/fail suite. Run with `npm run diagnose`.
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

function reset(overrides = {}) {
    Object.assign(AppState.config, {
        startWeight: 80, currentWeight: 80, targetWeight: 85, startDate: '2026-01-01', height: 180, age: 30, gender: 'male',
        goalPhase: 'mantenimiento', lossPace: 'moderado', gainPace: 'lento', tdeeMode: 'adaptive', proteinFactor: 2.0,
        deficitTarget: 500, surplusTarget: 150, phaseStartDate: null, phaseStartWeight: null, phaseHistory: [],
        customGymRoutine: Object.fromEntries(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => [d, { type: 'descanso', label: 'Descanso', templateId: '' }])),
        weightHistory: [],
    }, overrides);
    AppState.allDays = {}; localStorage.clear(); N.clearAdaptiveTDEECache();
}
function addDay(i, kcal, w) {
    const k = key(i);
    AppState.allDays[k] = { date: k, meals: { breakfast: [{ name: 'x', kcal }] } };
    const idx = AppState.config.weightHistory.findIndex(e => e.date === k);
    const e = { date: k, weight: Math.round(w * 100) / 100, day: i + 1 };
    if (idx >= 0) AppState.config.weightHistory[idx] = e; else AppState.config.weightHistory.push(e);
    AppState.config.weightHistory.sort((a, b) => a.date < b.date ? -1 : 1);
    AppState.config.currentWeight = AppState.config.weightHistory[AppState.config.weightHistory.length - 1].weight;
    N.clearAdaptiveTDEECache();
}
function targetFor(i) {
    const d = N.getDynamicDayTargets(key(i));
    return { tdee: d.tdee, cals: d.cals, surplus: d.surplusTarget, deficit: d.deficitTarget, src: d.adaptiveTDEE?.source, conf: d.adaptiveTDEE?.confidence };
}

// Closed loop maintenance after deficit
{
    reset({ goalPhase: 'mantenimiento' });
    const rand = rng(11); const trueTdee = 2400; let w = 85;
    for (let i = 0; i < 56; i++) { addDay(i, 1800, w + (rand() - 0.5) * 0.5); w += (1800 - trueTdee) / 7700; }
    const rows = [];
    for (let i = 56; i < 140; i++) {
        if (i === 56) { AppState.config.phaseStartDate = key(i); N.clearAdaptiveTDEECache(); }
        const t = targetFor(i);
        const intake = Math.round(t.cals || 2200);
        const rebound = i < 60 ? 1.5 * (i - 55) / 4 : 1.5;
        addDay(i, intake, w + rebound + (rand() - 0.5) * 0.5);
        w += (intake - trueTdee) / 7700;
        if (i < 75 || i % 10 === 0) rows.push({ day: i + 1, intake, tdee: t.tdee, goal: t.cals, trueW: +(w + rebound).toFixed(2), phase: 'maint' });
    }
    console.log('\nCLOSED-LOOP maintenance after deficit (intake=app target)');
    rows.forEach(r => console.log(r.day, 'intake', r.intake, 'estTDEE', r.tdee, 'goal', r.goal, 'weight', r.trueW));
}

// Closed loop volume after maintenance
{
    reset({ goalPhase: 'volumen', targetWeight: 85 });
    const rand = rng(12); const trueTdee = 2400; let w = 80;
    for (let i = 0; i < 56; i++) { addDay(i, 2400, w + (rand() - 0.5) * 0.4); }
    const rows = [];
    for (let i = 56; i < 140; i++) {
        if (i === 56) { AppState.config.phaseStartDate = key(i); N.clearAdaptiveTDEECache(); }
        const t = targetFor(i);
        const intake = Math.round(t.cals || 2550);
        const rebound = i < 61 ? 1.5 * (i - 55) / 5 : 1.5;
        addDay(i, intake, w + rebound + (rand() - 0.5) * 0.4);
        w += (intake - trueTdee) / 7700;
        if (i < 80 || i % 10 === 0) rows.push({ day: i + 1, intake, tdee: t.tdee, goal: t.cals, trueW: +(w + rebound).toFixed(2) });
    }
    console.log('\nCLOSED-LOOP volume after maintenance (intake=app target)');
    rows.forEach(r => console.log(r.day, 'intake', r.intake, 'estTDEE', r.tdee, 'goal', r.goal, 'weight', r.trueW));
}
