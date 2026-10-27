// P3 regression suite: phase-aware weight progress (definition, maintenance
// and volume). Covers labels, ETAs, weekly cards, predictions and warnings so a
// volume phase can never be presented with deficit wording or an inverted ETA.
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
globalThis.document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new FakeEl(id));
        return elements.get(id);
    },
    createElement() { return new FakeEl(); },
};
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

let failures = 0;
function ok(name, cond, detail = '') {
    if (cond) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
const text = (id) => elements.get(id)?.textContent ?? '';
const html = (id) => elements.get(id)?.innerHTML ?? '';
const warningsText = () => elements.get('goalWarnings')?.children
    .map(c => c.children.map(x => x.textContent).join(' ')).join(' | ') ?? '';

function resetConfig(overrides = {}) {
    Object.assign(AppState.config, {
        startWeight: 75, currentWeight: 75, targetWeight: 80, startDate: '2026-01-01',
        height: 180, age: 30, gender: 'male', goalPhase: 'volumen',
        lossPace: 'moderado', gainPace: 'lento', tdeeMode: 'formula',
        proteinFactor: 2.0, deficitTarget: 500, surplusTarget: 150,
        phaseStartDate: null, phaseStartWeight: null, phaseHistory: [],
        customGymRoutine: Object.fromEntries(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
            .map(d => [d, { type: 'descanso', label: 'Descanso', templateId: '' }])),
        weightHistory: [],
    }, overrides);
    AppState.allDays = {};
    AppState.currentDate = new Date(2026, 0, 28, 12, 0, 0);
    elements.clear();
    localStorage.clear();
    N.clearAdaptiveTDEECache();
}

function seedDays({ startW, deltaPerDay, kcal, phaseStartWeight, targetWeight, phase = 'volumen', days = 28 }) {
    for (let i = 0; i < days; i++) {
        const k = key(i);
        AppState.config.weightHistory.push({
            date: k,
            weight: Math.round((startW + deltaPerDay * i) * 100) / 100,
            day: i + 1,
        });
        AppState.allDays[k] = {
            date: k,
            meals: { breakfast: [{ name: 'synthetic', kcal, protein: 160, carbs: 300, fats: 64 }] },
        };
    }
    AppState.config.currentWeight = AppState.config.weightHistory.at(-1).weight;
    AppState.config.phaseStartWeight = phaseStartWeight ?? startW;
    AppState.config.phaseStartDate = key(0);
    AppState.config.goalPhase = phase;
    if (targetWeight !== undefined) AppState.config.targetWeight = targetWeight;
    N.clearAdaptiveTDEECache();
}

function renderAll() {
    S.updateGoalsDisplay();
    S.displayWeeklyProgress();
    W.updateWeightPrediction();
}

// ── 1. Volumen normal: etiquetas de ganancia y ETA hacia arriba ─────────────
{
    resetConfig();
    seedDays({ startW: 75, deltaPerDay: 0.25 / 7, kcal: 2600, targetWeight: 80 });
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('volumen: fase reconocida como volumen', p.isBulk === true && p.isMaintenance === false,
        `isBulk=${p.isBulk}`);
    ok('volumen: progreso 19 %', p.progressPercent === 19, `%=${p.progressPercent}`);
    ok('volumen: etiqueta Ganados', text('goalWeightLostLabel') === 'Ganados', text('goalWeightLostLabel'));
    ok('volumen: cambio positivo visible', text('goalWeightLost') === '+1.0 kg', text('goalWeightLost'));
    ok('volumen: ETA no dice Objetivo alcanzado', text('goalTimeEstimate') !== 'Objetivo alcanzado', text('goalTimeEstimate'));
    ok('volumen: progreso semanal con ganancia', html('weeklyProgress').includes('Ganancia actual')
        && html('weeklyProgress').includes('Ganancia esperada'),
        html('weeklyProgress').replace(/\s+/g, ' ').slice(0, 160));
    ok('volumen: no usa lenguaje de déficit en el semanal', !html('weeklyProgress').includes('Pérdida actual'),
        html('weeklyProgress').replace(/\s+/g, ' ').slice(0, 160));
    ok('volumen: tarjeta semanal en camino', html('weeklyProgress').includes('En camino'));
    ok('volumen: predicción con ETA', pred.reason === 'ok' && pred.estimatedDays > 0,
        `reason=${pred.reason} days=${pred.estimatedDays}`);
    ok('volumen: proyección usa Ganancia semanal', html('weightPrediction').includes('Ganancia semanal'));
    ok('volumen: sin aviso de meta inválida', !warningsText().includes('En volumen la meta'),
        warningsText());
}

// ── 2. Volumen con meta heredada por debajo del peso actual ─────────────────
{
    resetConfig();
    seedDays({ startW: 75, deltaPerDay: 0.25 / 7, kcal: 2600, targetWeight: 75 });
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('volumen meta inválida: sin progreso engañoso', p.progressPercent === null, `%=${p.progressPercent}`);
    ok('volumen meta inválida: ETA pide ajustar', text('goalTimeEstimate') === 'Ajusta tu meta', text('goalTimeEstimate'));
    ok('volumen meta inválida: explica la dirección',
        text('goalTimeExplain').includes('por encima'), text('goalTimeExplain'));
    ok('volumen meta inválida: aviso visible', warningsText().includes('En volumen la meta'), warningsText());
    ok('volumen meta inválida: predicción no dice falta de datos', pred.reason === 'target_invalid',
        `reason=${pred.reason}`);
    ok('volumen meta inválida: confianza no se castiga', pred.confidence === 'high', `confidence=${pred.confidence}`);
    ok('volumen meta inválida: tarjeta pide ajustar', html('weightPrediction').includes('Ajusta tu meta'));
    ok('volumen meta inválida: tarjeta semanal pide ajustar', html('weeklyProgress').includes('Ajusta tu meta'));
}

// ── 3. Volumen sin tendencia de ganancia (no es "faltan datos") ─────────────
{
    resetConfig();
    seedDays({ startW: 76, deltaPerDay: -0.01, kcal: 2300, targetWeight: 80 });
    renderAll();
    const pred = W.calculateWeightPrediction();

    ok('volumen sin ganancia: razón específica', pred.reason === 'no_gain_trend', `reason=${pred.reason}`);
    ok('volumen sin ganancia: confianza conservada', pred.confidence === 'high', `confidence=${pred.confidence}`);
    ok('volumen sin ganancia: no pide registrar peso', !html('weightPrediction').includes('Registra tu peso'),
        html('weightPrediction').replace(/\s+/g, ' ').slice(0, 160));
    ok('volumen sin ganancia: muestra tendencia real', html('weightPrediction').includes('Sin tendencia de ganancia')
        && html('weightPrediction').includes('Cambio semanal'),
        html('weightPrediction').replace(/\s+/g, ' ').slice(0, 160));
    ok('volumen sin ganancia: estado semanal coherente', html('weeklyProgress').includes('Perdiendo peso')
        || html('weeklyProgress').includes('Estancado'),
        html('weeklyProgress').replace(/\s+/g, ' ').slice(0, 160));
}

// ── 4. Volumen con la meta superada ─────────────────────────────────────────
{
    resetConfig();
    seedDays({ startW: 75, deltaPerDay: 0.05, kcal: 2800, targetWeight: 76 });
    renderAll();
    const pred = W.calculateWeightPrediction();

    ok('volumen meta superada: progreso 100 %', text('goalProgressPercent') === '100%', text('goalProgressPercent'));
    ok('volumen meta superada: ETA Objetivo alcanzado', text('goalTimeEstimate') === 'Objetivo alcanzado',
        text('goalTimeEstimate'));
    ok('volumen meta superada: predicción sin ETA', pred.reason === 'target_reached', `reason=${pred.reason}`);
    ok('volumen meta superada: tarjeta sugiere nueva meta', html('weightPrediction').includes('Define una nueva meta'));
}

// ── 5. Mantenimiento: sin barra de meta y con cambio neutro ─────────────────
{
    resetConfig({ goalPhase: 'mantenimiento', targetWeight: 75, startWeight: 79 });
    seedDays({ startW: 80, deltaPerDay: 0, kcal: 2400, phase: 'mantenimiento', targetWeight: 75 });
    renderAll();
    const p = N.getPhaseProgress();

    ok('mantenimiento: sin porcentaje de meta', p.progressPercent === null, `%=${p.progressPercent}`);
    ok('mantenimiento: barra oculta', elements.get('goalProgressBlock').style.display === 'none',
        elements.get('goalProgressBlock').style.display);
    ok('mantenimiento: etiqueta Cambio en fase', text('goalWeightLostLabel') === 'Cambio en fase',
        text('goalWeightLostLabel'));
    ok('mantenimiento: ETA Mantener', text('goalTimeEstimate') === 'Mantener', text('goalTimeEstimate'));
    ok('mantenimiento: semanal con cambio neutro', html('weeklyProgress').includes('Cambio actual')
        && !html('weeklyProgress').includes('Pérdida actual'), html('weeklyProgress').replace(/\s+/g, ' ').slice(0, 160));
    ok('mantenimiento: ETA semanal Mantenimiento', html('weeklyProgress').includes('Mantenimiento'));
}

// ── 6. Mantenimiento con meta por encima no se convierte en volumen ─────────
{
    resetConfig({ goalPhase: 'mantenimiento', targetWeight: 85, startWeight: 80 });
    seedDays({ startW: 80, deltaPerDay: 0, kcal: 2400, phase: 'mantenimiento', targetWeight: 85 });
    const p = N.getPhaseProgress();
    ok('mantenimiento meta arriba: no se marca como volumen', p.isBulk === false, `isBulk=${p.isBulk}`);
    ok('mantenimiento meta arriba: sin progreso de meta', p.progressPercent === null, `%=${p.progressPercent}`);
}

// ── 7. Definición normal: progresa hacia abajo ──────────────────────────────
{
    resetConfig({ goalPhase: 'definicion', targetWeight: 75, startWeight: 80 });
    seedDays({ startW: 80, deltaPerDay: -0.5 / 7, kcal: 1800, phase: 'definicion', targetWeight: 75 });
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('definición: progreso 39 %', p.progressPercent === 39, `%=${p.progressPercent}`);
    ok('definición: etiqueta Perdidos', text('goalWeightLostLabel') === 'Perdidos', text('goalWeightLostLabel'));
    ok('definición: pérdida visible', text('goalWeightLost') === '1.9 kg', text('goalWeightLost'));
    ok('definición: predicción con ETA de pérdida',
        pred.reason === 'ok' && pred.estimatedDays > 0, `reason=${pred.reason}`);
    ok('definición: semanal con pérdida', html('weeklyProgress').includes('Pérdida actual'),
        html('weeklyProgress').replace(/\s+/g, ' ').slice(0, 160));
}

// ── 8. Definición con meta por encima: error de configuración visible ──────
{
    resetConfig({ goalPhase: 'definicion', targetWeight: 85, startWeight: 80 });
    seedDays({ startW: 80, deltaPerDay: 0, kcal: 1800, phase: 'definicion', targetWeight: 85 });
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('definición meta arriba: sin barra engañosa', p.progressPercent === null, `%=${p.progressPercent}`);
    ok('definición meta arriba: ETA pide ajustar', text('goalTimeEstimate') === 'Ajusta tu meta',
        text('goalTimeEstimate'));
    ok('definición meta arriba: aviso visible', warningsText().includes('En definición la meta'), warningsText());
    ok('definición meta arriba: predicción target_invalid', pred.reason === 'target_invalid',
        `reason=${pred.reason}`);
}

// ── 9. phaseHistory recupera el inicio si falta phaseStartWeight ────────────
{
    resetConfig({
        goalPhase: 'volumen', startWeight: 70, currentWeight: 76, targetWeight: 80,
        phaseStartWeight: null,
        phaseHistory: [{ date: key(0), phase: 'volumen', startWeight: 75, tdeeMode: 'formula' }],
    });
    const p = N.getPhaseProgress();
    ok('phaseHistory: recupera peso de inicio', p.startWeight === 75, `start=${p.startWeight}`);
    ok('phaseHistory: recupera fecha de inicio', p.startDateKey === key(0), `date=${p.startDateKey}`);
    ok('phaseHistory: progreso 20 %', p.progressPercent === 20, `%=${p.progressPercent}`);
}

// ── 10. Predicción de mañana con lenguaje de superávit en volumen ──────────
{
    resetConfig();
    seedDays({ startW: 75, deltaPerDay: 0.25 / 7, kcal: 2800, targetWeight: 80 });
    AppState.allDays[key(27)].meals.breakfast[0].kcal = 2800;
    W.displayNextDayPrediction();
    ok('mañana volumen: etiqueta Superávit real', html('nextDayPrediction').includes('Superávit real vs TDEE'),
        html('nextDayPrediction').replace(/\s+/g, ' ').slice(0, 200));
    ok('mañana volumen: etiqueta Superávit vs meta', html('nextDayPrediction').includes('Superávit vs meta'),
        html('nextDayPrediction').replace(/\s+/g, ' ').slice(0, 200));
    ok('mañana volumen: no usa Déficit real', !html('nextDayPrediction').includes('Déficit real vs TDEE'));
}

// ── 11. Predicción de mañana con lenguaje de déficit en definición ─────────
{
    resetConfig({ goalPhase: 'definicion', targetWeight: 75, startWeight: 80 });
    seedDays({ startW: 80, deltaPerDay: -0.5 / 7, kcal: 1500, phase: 'definicion', targetWeight: 75 });
    AppState.allDays[key(27)].meals.breakfast[0].kcal = 1500;
    W.displayNextDayPrediction();
    ok('mañana definición: etiqueta Déficit real', html('nextDayPrediction').includes('Déficit real vs TDEE'),
        html('nextDayPrediction').replace(/\s+/g, ' ').slice(0, 200));
    ok('mañana definición: etiqueta Déficit vs meta', html('nextDayPrediction').includes('Déficit vs meta'));
}

// ── 12. Volumen empezado en 66,6 tras un déficit desde 85,4 ────────────────
{
    resetConfig({
        goalPhase: 'volumen', startWeight: 85.4, currentWeight: 66.6, targetWeight: 70,
        phaseStartWeight: 66.6, phaseStartDate: key(0), phaseHistory: [],
    });
    seedDays({ startW: 66.6, deltaPerDay: 0.25 / 7, kcal: 2600, targetWeight: 70 });
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('inicio de fase explícito: usa 66,6 y no 85,4', p.startWeight === 66.6, `start=${p.startWeight}`);
    ok('inicio de fase explícito: tarjeta muestra 66.6 kg', text('goalStartWeight') === '66.6 kg',
        text('goalStartWeight'));
    ok('inicio de fase explícito: progreso desde la fase, no desde el déficit',
        p.progressPercent >= 25 && p.progressPercent <= 30, `%=${p.progressPercent}`);
    ok('inicio de fase explícito: etiqueta Ganados', text('goalWeightLostLabel') === 'Ganados',
        text('goalWeightLostLabel'));
    ok('inicio de fase explícito: ETA de volumen válido',
        pred.reason === 'ok' && pred.estimatedDays > 0, `reason=${pred.reason} days=${pred.estimatedDays}`);
}

// ── 13. Sin peso de inicio de fase no se usa el peso del déficit ────────────
{
    resetConfig({
        goalPhase: 'volumen', startWeight: 85.4, currentWeight: 66.6, targetWeight: 70,
        phaseStartWeight: null, phaseStartDate: null, phaseHistory: [],
    });
    seedDays({ startW: 66.6, deltaPerDay: 0.25 / 7, kcal: 2600, targetWeight: 70 });
    AppState.config.phaseStartWeight = null;
    AppState.config.phaseStartDate = null;
    AppState.config.phaseHistory = [];
    renderAll();
    const p = N.getPhaseProgress();
    const pred = W.calculateWeightPrediction();

    ok('sin inicio de fase: no cae en 85,4', p.startWeight === null, `start=${p.startWeight}`);
    ok('sin inicio de fase: tarjeta sin peso inicial', text('goalStartWeight') === '-', text('goalStartWeight'));
    ok('sin inicio de fase: cambio en fase sin inventar', text('goalWeightLost') === '—', text('goalWeightLost'));
    ok('sin inicio de fase: ETA pide definirla', text('goalTimeEstimate') === 'Define inicio de fase',
        text('goalTimeEstimate'));
    ok('sin inicio de fase: aviso visible', warningsText().includes('Falta el peso al inicio'), warningsText());
    ok('sin inicio de fase: predicción no inventa ETA', pred.reason === 'no_phase_start', `reason=${pred.reason}`);
    ok('sin inicio de fase: tarjeta explica dónde ponerlo',
        html('weightPrediction').includes('Define el inicio de fase'), html('weightPrediction').replace(/\s+/g, ' ').slice(0, 180));
}

// ── 14. Fecha de fase + histórico permiten recuperar el peso de inicio ──────
{
    resetConfig({
        goalPhase: 'volumen', startWeight: 85.4, currentWeight: 66.6, targetWeight: 75,
        phaseStartWeight: null, phaseStartDate: null, phaseHistory: [],
    });
    seedDays({ startW: 66.6, deltaPerDay: 0.1, kcal: 2600, targetWeight: 75 });
    AppState.config.phaseStartWeight = null;
    AppState.config.phaseStartDate = key(14);
    AppState.config.phaseHistory = [];
    const p = N.getPhaseProgress();

    ok('fecha de fase: recupera el peso cercano del histórico',
        Math.abs(p.startWeight - 68.0) < 0.01, `start=${p.startWeight}`);
    ok('fecha de fase: usa la fecha indicada', p.startDateKey === key(14), `date=${p.startDateKey}`);
    ok('fecha de fase: progreso coherente', p.progressPercent >= 18 && p.progressPercent <= 20,
        `%=${p.progressPercent}`);
}

// ── 15. Mantenimiento sin inicio de fase: sin barra y sin dato falso ────────
{
    resetConfig({
        goalPhase: 'mantenimiento', startWeight: 85.4, currentWeight: 66.6, targetWeight: 66.6,
        phaseStartWeight: null, phaseStartDate: null, phaseHistory: [],
    });
    seedDays({ startW: 66.6, deltaPerDay: 0, kcal: 2400, phase: 'mantenimiento', targetWeight: 66.6 });
    AppState.config.phaseStartWeight = null;
    AppState.config.phaseStartDate = null;
    AppState.config.phaseHistory = [];
    renderAll();
    const p = N.getPhaseProgress();

    ok('mantenimiento sin inicio: no usa 85,4', p.startWeight === null, `start=${p.startWeight}`);
    ok('mantenimiento sin inicio: barra oculta', elements.get('goalProgressBlock').style.display === 'none');
    ok('mantenimiento sin inicio: cambio en fase —', text('goalWeightLost') === '—', text('goalWeightLost'));
    ok('mantenimiento sin inicio: ETA Mantener', text('goalTimeEstimate') === 'Mantener', text('goalTimeEstimate'));
    ok('mantenimiento sin inicio: aviso visible', warningsText().includes('Falta el peso al inicio'), warningsText());
}

console.log(`\n${failures === 0 ? 'ALL P3 CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
