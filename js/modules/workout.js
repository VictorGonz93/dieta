// ==================== PLAN DE ENTRENAMIENTOS ====================

import AppState from './state.js';
import { GYM_ROUTINE } from './constants.js';
import { showNotification } from './ui/notifications.js';

export function initWorkoutPlan() {
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const routine = AppState.config.customGymRoutine || GYM_ROUTINE;
    const dayNames = {
        lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
        jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
    };

    const templates = getWorkoutTemplates();
    const templateOptions = `<option value="">-- Sin plantilla --</option>` +
        Object.values(templates).map(t => `<option value="${t.id}">${t.name} (${t.exercises.length} ej)</option>`).join('');

    days.forEach(day => {
        const dayName = dayNames[day];
        const dayInfo = routine[dayName] || { type: 'descanso', label: '', templateId: '' };
        const typeSelect = document.getElementById(`${day}-type`);
        const labelInput = document.getElementById(`${day}-label`);
        const tmplSelect = document.getElementById(`${day}-template`);

        if (typeSelect) typeSelect.value = dayInfo.type || 'descanso';
        if (labelInput) labelInput.value = dayInfo.label || '';
        if (tmplSelect) {
            tmplSelect.innerHTML = templateOptions;
            tmplSelect.value = dayInfo.templateId || '';
        }
    });
}

export function updateWorkoutPlan() {
    // Placeholder para validación en tiempo real si se necesita
}

export function saveWorkoutPlan() {
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const dayNames = {
        lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
        jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
    };

    const customRoutine = {};
    let hasError = false;

    days.forEach(day => {
        const dayName = dayNames[day];
        const typeSelect = document.getElementById(`${day}-type`);
        const labelInput = document.getElementById(`${day}-label`);
        const tmplSelect = document.getElementById(`${day}-template`);
        const type = typeSelect?.value || 'descanso';
        const label = labelInput?.value?.trim() || '';
        const templateId = tmplSelect?.value || '';

        if (!label && type === 'entreno') {
            showNotification(`Por favor completa la descripción para ${dayName}`, 'warning');
            hasError = true;
            return;
        }

        customRoutine[dayName] = {
            type: type,
            label: label || (type === 'descanso' ? 'Descanso' : ''),
            templateId: templateId
        };
    });

    if (hasError) return;

    AppState.config.customGymRoutine = customRoutine;
    localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
    showNotification('Plan de entrenamientos guardado correctamente', 'success');

    import('./meals.js').then(m => m.renderDay());
    import('./config-settings.js').then(m => m.updateHeaderInfo());
    import('./weight.js').then(m => m.displayNextDayPrediction());
}

export function resetWorkoutPlan() {
    if (confirm('¿Seguro que deseas restaurar el plan por defecto?')) {
        AppState.config.customGymRoutine = null;
        localStorage.setItem('nutrition_config', JSON.stringify(AppState.config));
        initWorkoutPlan();
        showNotification('Plan restaurado al valor por defecto', 'success');

        import('./meals.js').then(m => m.renderDay());
        import('./config-settings.js').then(m => m.updateHeaderInfo());
        import('./weight.js').then(m => m.displayNextDayPrediction());
    }
}

// ==================== BASE DE DATOS DE EJERCICIOS ====================

// Músculos principales
export const MUSCLES = ['Todos', 'Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Core', 'Cardio'];

// Equipamiento disponible
export const EQUIPMENT_TYPES = {
    libre: { label: 'Peso Libre', color: '#60A5FA', factor: 1.15 },
    maquina: { label: 'Máquina', color: '#A78BFA', factor: 1.00 },
    polea: { label: 'Polea / Cable', color: '#38BDF8', factor: 1.00 },
    cuerpo: { label: 'Peso Corporal', color: '#34D399', factor: 1.10 },
    kettlebell: { label: 'Kettlebell', color: '#F43F5E', factor: 1.15 },
    cardio: { label: 'Cardio', color: '#FBBF24', factor: 1.00 }
};

export const BASE_EXERCISES_DB = [
    // ── Pecho ─────────────────────────────────────────────────────────────────
    { id: 1,  name: 'Press Banca (Barra)',          muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 6.0 },
    { id: 2,  name: 'Press Inclinado (Barra)',       muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 6.0 },
    { id: 3,  name: 'Press Declinado (Barra)',       muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 4,  name: 'Press Banca (Mancuernas)',      muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 5,  name: 'Press Inclinado (Mancuernas)',  muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 6,  name: 'Press Declinado (Mancuernas)', muscle: 'Pecho',    type: 'libre',   category: 'compuesto', met: 5.0 },
    { id: 7,  name: 'Aperturas Mancuerna (Plano)',   muscle: 'Pecho',    type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 8,  name: 'Aperturas Inclinadas',          muscle: 'Pecho',    type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 9,  name: 'Peck Deck / Contractora',       muscle: 'Pecho',    type: 'maquina', category: 'aislamiento', met: 3.5 },
    { id: 10, name: 'Cruce de Poleas (Alto)',         muscle: 'Pecho',    type: 'polea',   category: 'aislamiento', met: 4.0 },
    { id: 11, name: 'Cruce de Poleas (Bajo)',         muscle: 'Pecho',    type: 'polea',   category: 'aislamiento', met: 4.0 },
    { id: 12, name: 'Fondos en Paralelas (Pecho)',    muscle: 'Pecho',    type: 'cuerpo',  category: 'compuesto', met: 6.5 },
    { id: 13, name: 'Flexiones / Push-ups',           muscle: 'Pecho',    type: 'cuerpo',  category: 'compuesto', met: 5.0 },
    { id: 14, name: 'Pullover con Mancuerna',         muscle: 'Pecho',    type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 15, name: 'Press de Pecho en Máquina',      muscle: 'Pecho',    type: 'maquina', category: 'compuesto', met: 4.5 },
    { id: 116,name: 'Press Banca Multipower',        muscle: 'Pecho',    type: 'maquina', category: 'compuesto', met: 4.5 },
    { id: 117,name: 'Press Inclinado Multipower',    muscle: 'Pecho',    type: 'maquina', category: 'compuesto', met: 4.5 },

    // ── Espalda ───────────────────────────────────────────────────────────────
    { id: 16, name: 'Peso Muerto Convencional',       muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 7.0 },
    { id: 17, name: 'Peso Muerto Rumano',              muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 6.0 },
    { id: 18, name: 'Peso Muerto Sumo',                muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 6.5 },
    { id: 19, name: 'Dominadas Pronas',               muscle: 'Espalda',  type: 'cuerpo',  category: 'compuesto', met: 6.5 },
    { id: 20, name: 'Dominadas Supinas / Chin-ups',    muscle: 'Espalda',  type: 'cuerpo',  category: 'compuesto', met: 6.5 },
    { id: 21, name: 'Remo con Barra (90°)',           muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 22, name: 'Remo con Mancuerna Unilateral',  muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 5.0 },
    { id: 23, name: 'Remo en T (T-Bar Row)',           muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 24, name: 'Jalón al Pecho Agarre Ancho',     muscle: 'Espalda',  type: 'polea',   category: 'compuesto', met: 4.5 },
    { id: 25, name: 'Jalón Agarre Neutro / Cerrado',   muscle: 'Espalda',  type: 'polea',   category: 'compuesto', met: 4.5 },
    { id: 26, name: 'Remo Gironda / Polea Baja',       muscle: 'Espalda',  type: 'polea',   category: 'compuesto', met: 4.5 },
    { id: 27, name: 'Remo en Máquina Asistida',        muscle: 'Espalda',  type: 'maquina', category: 'compuesto', met: 4.5 },
    { id: 28, name: 'Pullover con Brazo Recto (Polea)',muscle: 'Espalda',  type: 'polea',   category: 'aislamiento', met: 4.0 },
    { id: 29, name: 'Hiperextensiones Lumbar',         muscle: 'Espalda',  type: 'cuerpo',  category: 'aislamiento', met: 3.5 },
    { id: 31, name: 'Buenos Días (Good Mornings)',     muscle: 'Espalda',  type: 'libre',   category: 'compuesto', met: 4.5 },
    { id: 32, name: 'Encogimientos con Barra (Trapecio)', muscle: 'Espalda', type: 'libre',  category: 'aislamiento', met: 3.5 },
    { id: 120,name: 'Dominadas Asistidas (Máquina)',   muscle: 'Espalda',  type: 'maquina', category: 'compuesto', met: 5.0 },

    // ── Piernas ───────────────────────────────────────────────────────────────
    { id: 33, name: 'Sentadilla Trasera (Barra)',      muscle: 'Piernas',  type: 'libre',   category: 'compuesto', met: 7.0 },
    { id: 34, name: 'Sentadilla Frontal (Barra)',      muscle: 'Piernas',  type: 'libre',   category: 'compuesto', met: 7.0 },
    { id: 35, name: 'Sentadilla Búlgara',              muscle: 'Piernas',  type: 'libre',   category: 'compuesto', met: 6.0 },
    { id: 36, name: 'Sentadilla Goblet (Kettlebell/Manc)', muscle: 'Piernas', type: 'libre', category: 'compuesto', met: 5.5 },
    { id: 37, name: 'Hack Squat (Máquina)',            muscle: 'Piernas',  type: 'maquina', category: 'compuesto', met: 6.0 },
    { id: 38, name: 'Prensa Inclinada (45°)',           muscle: 'Piernas',  type: 'maquina', category: 'compuesto', met: 5.5 },
    { id: 124,name: 'Prensa Horizontal',               muscle: 'Piernas',  type: 'maquina', category: 'compuesto', met: 5.0 },
    { id: 39, name: 'Extensiones de Cuádriceps',       muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 4.0 },
    { id: 40, name: 'Curl Femoral Tumbado',            muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 4.0 },
    { id: 42, name: 'Curl Femoral Sentado',            muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 4.0 },
    { id: 43, name: 'Zancadas / Lunges',               muscle: 'Piernas',  type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 46, name: 'Gemelos de Pie (Máquina/Barra)',  muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 3.5 },
    { id: 47, name: 'Gemelos Sentado',                 muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 3.0 },
    { id: 48, name: 'Abductores en Máquina',           muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 3.5 },
    { id: 49, name: 'Aductores en Máquina',            muscle: 'Piernas',  type: 'maquina', category: 'aislamiento', met: 3.5 },

    // ── Glúteos ───────────────────────────────────────────────────────────────
    { id: 51, name: 'Hip Thrust con Barra',            muscle: 'Glúteos',  type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 52, name: 'Hip Thrust en Máquina',           muscle: 'Glúteos',  type: 'maquina', category: 'compuesto', met: 5.0 },
    { id: 54, name: 'Patada de Glúteo en Polea',        muscle: 'Glúteos',  type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 57, name: 'Abducción de Cadera en Polea',     muscle: 'Glúteos',  type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 58, name: 'Glute Bridge (Puente)',           muscle: 'Glúteos',  type: 'cuerpo',  category: 'compuesto', met: 4.0 },

    // ── Hombros ───────────────────────────────────────────────────────────────
    { id: 60, name: 'Press Militar de Pie (Barra)',    muscle: 'Hombros',  type: 'libre',   category: 'compuesto', met: 5.5 },
    { id: 61, name: 'Press Sentado con Mancuernas',    muscle: 'Hombros',  type: 'libre',   category: 'compuesto', met: 5.0 },
    { id: 62, name: 'Press Arnold',                    muscle: 'Hombros',  type: 'libre',   category: 'compuesto', met: 5.0 },
    { id: 63, name: 'Press de Hombro en Máquina',      muscle: 'Hombros',  type: 'maquina', category: 'compuesto', met: 4.5 },
    { id: 64, name: 'Elevaciones Laterales Mancuerna', muscle: 'Hombros',  type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 65, name: 'Elevaciones Laterales en Polea',  muscle: 'Hombros',  type: 'polea',   category: 'aislamiento', met: 4.0 },
    { id: 66, name: 'Elevaciones Frontales',           muscle: 'Hombros',  type: 'libre',   category: 'aislamiento', met: 3.5 },
    { id: 68, name: 'Pájaros con Mancuerna (Deltoides Post)', muscle: 'Hombros', type: 'libre', category: 'aislamiento', met: 3.5 },
    { id: 70, name: 'Face Pull en Polea',              muscle: 'Hombros',  type: 'polea',   category: 'aislamiento', met: 3.5 },

    // ── Bíceps ────────────────────────────────────────────────────────────────
    { id: 72, name: 'Curl de Bíceps con Barra Recta',  muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 73, name: 'Curl de Bíceps con Barra EZ',     muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 74, name: 'Curl Alterno con Mancuernas',     muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 76, name: 'Curl Martillo (Hammer Curl)',     muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 77, name: 'Curl de Bíceps en Polea Baja',    muscle: 'Bíceps',   type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 79, name: 'Curl Banco Scott / Predicador',   muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 80, name: 'Curl Inclinado con Mancuernas',   muscle: 'Bíceps',   type: 'libre',   category: 'aislamiento', met: 4.0 },

    // ── Tríceps ───────────────────────────────────────────────────────────────
    { id: 82, name: 'Press Francés con Barra EZ',      muscle: 'Tríceps',  type: 'libre',   category: 'aislamiento', met: 4.0 },
    { id: 84, name: 'Extensión Tríceps Polea (Barra)', muscle: 'Tríceps',  type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 85, name: 'Extensión Tríceps Polea (Cuerda)',muscle: 'Tríceps',  type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 86, name: 'Extensión Trasnuca con Mancuerna',muscle: 'Tríceps',  type: 'libre',   category: 'aislamiento', met: 3.5 },
    { id: 87, name: 'Fondos entre Bancos (Tríceps)',   muscle: 'Tríceps',  type: 'cuerpo',  category: 'compuesto', met: 4.5 },
    { id: 89, name: 'Press Banca Agarre Cerrado',      muscle: 'Tríceps',  type: 'libre',   category: 'compuesto', met: 5.0 },

    // ── Antebrazos ────────────────────────────────────────────────────────────
    { id: 137,name: 'Curl de Muñeca (Barra)',          muscle: 'Antebrazos', type: 'libre', category: 'aislamiento', met: 3.0 },
    { id: 141,name: 'Farmer\'s Walk (Paseo del Granjero)', muscle: 'Antebrazos', type: 'libre', category: 'compuesto', met: 5.5 },
    { id: 142,name: 'Dead Hang (Colgado de Barra)',    muscle: 'Antebrazos', type: 'cuerpo', category: 'aislamiento', met: 3.0 },

    // ── Core ──────────────────────────────────────────────────────────────────
    { id: 91, name: 'Crunch Abdominal',               muscle: 'Core',     type: 'cuerpo',  category: 'aislamiento', met: 3.5 },
    { id: 93, name: 'Crunch en Polea Alta',            muscle: 'Core',     type: 'polea',   category: 'aislamiento', met: 3.5 },
    { id: 94, name: 'Plancha Isométrica Frontal',      muscle: 'Core',     type: 'cuerpo',  category: 'aislamiento', met: 4.0 },
    { id: 96, name: 'Rueda Abdominal (Ab Wheel)',      muscle: 'Core',     type: 'cuerpo',  category: 'compuesto', met: 5.0 },
    { id: 98, name: 'Elevación de Piernas Colgado',    muscle: 'Core',     type: 'cuerpo',  category: 'compuesto', met: 5.0 },

    // ── Cardio & Deportes ──────────────────────────────────────────────────────
    { id: 103,name: 'Cinta (Caminar Acelerado)',       muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 4.0 },
    { id: 104,name: 'Cinta (Caminar con Inclinación)', muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 6.0 },
    { id: 105,name: 'Cinta (Carrera Continua)',        muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 9.0 },
    { id: 107,name: 'Bicicleta Elíptica',              muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 5.5 },
    { id: 108,name: 'Bicicleta Estática / Rodillo',    muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 6.0 },
    { id: 110,name: 'Máquina de Remo (Ergómetro)',     muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 7.5 },
    { id: 111,name: 'Salto a la Comba',                 muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 10.0 },
    { id: 113,name: 'Sesión HIIT',                     muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 11.0 },
    { id: 115,name: 'Escaladora (StairMaster)',        muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 8.5 },
    { id: 150,name: 'Partido de Pádel / Tenis',        muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 7.0 },
    { id: 151,name: 'Fútbol / Deportes de Equipo',     muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 8.0 },
    { id: 152,name: 'Natación (Estilo Libre)',          muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 7.0 },
    { id: 153,name: 'Saco de Boxeo / Artes Marciales', muscle: 'Cardio',   type: 'cardio',  category: 'cardio', met: 8.5 },
];

/**
 * Retorna la base de datos combinada de ejercicios predefinidos + personalizados del usuario
 */
export function getExercisesDB() {
    const custom = JSON.parse(localStorage.getItem('custom_exercises') || '[]');
    return [...BASE_EXERCISES_DB, ...custom];
}

export const EXERCISES_DB = getExercisesDB();

/**
 * Permite guardar un ejercicio personalizado creado por el usuario
 */
export function saveCustomExercise(exData) {
    if (!exData.name || !exData.muscle) return false;
    const custom = JSON.parse(localStorage.getItem('custom_exercises') || '[]');
    const newEx = {
        id: `custom-ex-${Date.now()}`,
        name: exData.name.trim(),
        muscle: exData.muscle,
        type: exData.type || 'libre',
        category: exData.category || 'aislamiento',
        met: parseFloat(exData.met) || 4.5,
        isCustom: true
    };
    custom.push(newEx);
    localStorage.setItem('custom_exercises', JSON.stringify(custom));
    
    // Actualizar array reactivo en memoria
    EXERCISES_DB.push(newEx);
    showNotification(`Ejercicio "${newEx.name}" creado correctamente`);
    return newEx;
}

/**
 * Consulta la API internacional Wger en tiempo real para buscar ejercicios de su catálogo global
 */
export async function searchWgerExercises(query) {
    if (!query || query.trim().length < 2) return [];
    try {
        const url = `https://wger.de/api/v2/exerciseinfo/?term=${encodeURIComponent(query.trim())}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (data && data.results && data.results.length > 0) {
            return data.results.map(item => {
                let name = 'Ejercicio Wger';
                if (item.translations && item.translations.length > 0) {
                    const esTrans = item.translations.find(t => t.language === 4);
                    const enTrans = item.translations.find(t => t.language === 2);
                    name = (esTrans && esTrans.name) ? esTrans.name : ((enTrans && enTrans.name) ? enTrans.name : item.translations[0].name || 'Ejercicio Wger');
                }

                const categoryName = item.category?.name || '';
                let muscle = 'Pecho';
                if (/chest|pecho/i.test(categoryName)) muscle = 'Pecho';
                else if (/back|espalda|lats/i.test(categoryName)) muscle = 'Espalda';
                else if (/legs|pierna|thighs|calves|quad/i.test(categoryName)) muscle = 'Piernas';
                else if (/glute|glúteo/i.test(categoryName)) muscle = 'Glúteos';
                else if (/shoulder|hombro|deltoid/i.test(categoryName)) muscle = 'Hombros';
                else if (/biceps|bíceps/i.test(categoryName)) muscle = 'Bíceps';
                else if (/triceps|tríceps/i.test(categoryName)) muscle = 'Tríceps';
                else if (/abs|core|abdominal/i.test(categoryName)) muscle = 'Core';
                else if (/cardio/i.test(categoryName)) muscle = 'Cardio';
                else if (/arms|brazos/i.test(categoryName)) muscle = 'Bíceps';

                const equipName = item.equipment && item.equipment.length > 0 ? item.equipment[0].name : '';
                let type = 'libre';
                if (/machine|máquina/i.test(equipName)) type = 'maquina';
                else if (/cable|polea/i.test(equipName)) type = 'polea';
                else if (/bodyweight|cuerpo/i.test(equipName)) type = 'cuerpo';
                else if (/kettlebell/i.test(equipName)) type = 'kettlebell';

                return {
                    id: `wger-${item.id}`,
                    wgerId: item.id,
                    name: name,
                    muscle: muscle,
                    type: type,
                    category: 'compuesto',
                    met: 5.0,
                    isWger: true,
                    equipmentName: equipName
                };
            });
        }
    } catch (e) {
        console.warn('Wger API search failed:', e);
    }
    return [];
}

// ==================== REGISTRO DE ENTRENOS ====================

let _todayWorkout = null;

export function initTodayWorkout(dateKey) {
    const saved = getTodaySession(dateKey);
    _todayWorkout = saved
        ? { ...saved }
        : { date: dateKey, exercises: [], duration: 60, notes: '', finalized: false };
}

export function getTodayWorkout() { return _todayWorkout; }

export function addExerciseToWorkout(exerciseId) {
    if (!_todayWorkout) return false;
    const allEx = getExercisesDB();
    const ex = allEx.find(e => e.id == exerciseId);
    if (!ex) return false;
    if (_todayWorkout.exercises.some(e => e.exerciseId == exerciseId)) {
        showNotification(`"${ex.name}" ya está en el entreno de hoy`, 'warning');
        return false;
    }
    _todayWorkout.exercises.push({
        exerciseId: ex.id,
        name: ex.name,
        muscle: ex.muscle,
        sets: [{ reps: 10, kg: 0, done: false }]
    });
    _autoSave();
    showNotification(`"${ex.name}" añadido al entreno de hoy`, 'success');
    return true;
}

export function removeExerciseFromWorkout(exerciseId) {
    if (!_todayWorkout) return;
    _todayWorkout.exercises = _todayWorkout.exercises.filter(e => e.exerciseId != exerciseId);
    _autoSave();
}

export function addSetToExercise(exerciseId) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId == exerciseId);
    if (!ex) return;
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ reps: last?.reps || 10, kg: last?.kg || 0, done: false });
    _autoSave();
}

export function removeSetFromExercise(exerciseId, setIndex) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId == exerciseId);
    if (!ex || ex.sets.length <= 1) return;
    ex.sets.splice(setIndex, 1);
    _autoSave();
}

export function updateSet(exerciseId, setIndex, field, value) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId == exerciseId);
    if (!ex || !ex.sets[setIndex]) return;
    if (field === 'done') {
        ex.sets[setIndex].done = !!value;
    } else {
        ex.sets[setIndex][field] = parseFloat(value) || 0;
    }
    _autoSave();
}

export function toggleSetDone(exerciseId, setIndex) {
    if (!_todayWorkout) return false;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId == exerciseId);
    if (!ex || !ex.sets[setIndex]) return false;
    ex.sets[setIndex].done = !ex.sets[setIndex].done;
    _autoSave();
    return ex.sets[setIndex].done;
}

export function getFrequentExercises() {
    const sessions = getWorkoutSessions();
    const frequencyMap = {};
    Object.values(sessions).forEach(sess => {
        if (sess && sess.exercises) {
            sess.exercises.forEach(ex => {
                frequencyMap[ex.exerciseId] = (frequencyMap[ex.exerciseId] || 0) + 1;
            });
        }
    });
    const allEx = getExercisesDB();
    return Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id]) => allEx.find(e => e.id == id))
        .filter(Boolean);
}

export function setWorkoutDuration(minutes) {
    if (!_todayWorkout) return;
    _todayWorkout.duration = parseInt(minutes) || 0;
    _autoSave();
}

export function setWorkoutNotes(notes) {
    if (!_todayWorkout) return;
    _todayWorkout.notes = notes;
    _autoSave();
}

export function finalizeWorkout(dateKey) {
    if (!_todayWorkout || !_todayWorkout.exercises.length) return false;
    _todayWorkout.estimatedKcal = estimateWorkoutKcal(_todayWorkout);
    _todayWorkout.finalized = true;
    const sessions = getWorkoutSessions();
    sessions[dateKey] = { ..._todayWorkout };
    localStorage.setItem('workoutSessions', JSON.stringify(sessions));
    // Actualizar PRs
    _todayWorkout.exercises.forEach(ex => {
        const best = ex.sets.reduce((b, s) => s.kg > b.kg ? s : b, { kg: 0, reps: 0 });
        if (best.kg > 0) updateExercisePR(ex.exerciseId, best.kg, best.reps, dateKey);
    });
    showNotification('Entreno guardado correctamente', 'success');
    return true;
}

export function calculate1RM(weight, reps) {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    // Fórmula Brzycki (para r <= 12) o Epley (para r > 12)
    if (r <= 12) {
        return Math.round(w * (36 / (37 - r)));
    }
    return Math.round(w * (1 + r / 30));
}

export function estimateWorkoutKcal(workout) {
    if (!workout?.exercises.length) return 0;
    // Usar el peso registrado ese día si existe, si no el peso actual del config
    const dateKey = workout.date;
    const historyEntry = AppState.config.weightHistory?.find(w => w.date === dateKey);
    const bodyWeight = historyEntry?.weight || AppState.config.currentWeight || 75;

    // Constantes fisiológicas
    const REST_MIN = 3;       // minutos de descanso medio entre series
    const MET_REST = 1.6;     // MET durante descansos activos entre series
    const KCAL_PER_KG_REP = (9.8 * 0.38) / 0.20 / 4186; // ≈ 0.00445 kcal/(kg·rep)
    const KCAL_PER_BW_REP  = (9.8 * 0.28) / 0.20 / 4186; // ≈ 0.00327 kcal/rep

    let strengthKcal = 0;
    let totalStrengthSets = 0;
    const cardioExercises = [];

    const allExercisesDB = getExercisesDB();

    for (const ex of workout.exercises) {
        const dbEx = allExercisesDB.find(e => e.id == ex.exerciseId) || ex;
        if (!dbEx) continue;

        if (dbEx.type === 'cardio') {
            cardioExercises.push(dbEx);
        } else {
            // Factores fisiológicos de ajuste por categoría y equipamiento
            const categoryFactor = dbEx.category === 'compuesto' ? 1.25 : 1.00;
            const equipFactor = EQUIPMENT_TYPES[dbEx.type]?.factor || 1.00;

            for (const set of ex.sets) {
                const reps = set.reps || 0;
                const kg   = set.kg   || 0;
                if (reps === 0) continue;

                const baseSetKcal = kg > 0
                    ? reps * kg * KCAL_PER_KG_REP
                    : reps * bodyWeight * KCAL_PER_BW_REP;

                strengthKcal += baseSetKcal * categoryFactor * equipFactor;
                totalStrengthSets++;
            }
        }
    }

    // Calorías de descanso activo entre series
    const restKcal = totalStrengthSets * REST_MIN * MET_REST * bodyWeight / 60;

    // Tiempo no contabilizado (calentamiento, aprontes, transiciones, estiramientos)
    const countedMins = totalStrengthSets * (1.2 + REST_MIN);
    const extraMins = Math.max(0, (workout.duration || 60) - countedMins);
    const transitionKcal = extraMins > 0 ? (2.0 * bodyWeight * extraMins / 60) : 0;

    // Cardio
    let cardioKcal = 0;
    if (cardioExercises.length > 0) {
        const totalDuration   = workout.duration || 60;
        const strengthTimeMins = totalStrengthSets * (1 + REST_MIN);
        const cardioTimeMins  = Math.max(totalDuration - strengthTimeMins, cardioExercises.length * 10);
        const timePerCardioEx = cardioTimeMins / cardioExercises.length;
        cardioKcal = cardioExercises.reduce((s, e) => s + (e.met || 5.0) * bodyWeight * (timePerCardioEx / 60), 0);
    }

    const subtotal = strengthKcal + restKcal + transitionKcal + cardioKcal;

    // Efecto EPOC (Excess Post-exercise Oxygen Consumption)
    // Se añade un 8% si la sesión fue intensa (>12 series o >45 min), o un 5% si fue más corta
    const epocFactor = (totalStrengthSets > 12 || (workout.duration || 60) > 45) ? 1.08 : 1.05;

    return Math.round(subtotal * epocFactor);
}

// ─── Persistencia ─────────────────────────────────────────────────────────────
export function getWorkoutSessions() {
    return JSON.parse(localStorage.getItem('workoutSessions') || '{}');
}

export function getTodaySession(dateKey) {
    return getWorkoutSessions()[dateKey] || null;
}

function _autoSave() {
    if (!_todayWorkout) return;
    _todayWorkout.estimatedKcal = estimateWorkoutKcal(_todayWorkout);
    const sessions = getWorkoutSessions();
    sessions[_todayWorkout.date] = { ..._todayWorkout };
    localStorage.setItem('workoutSessions', JSON.stringify(sessions));
}

// ─── Plantillas ───────────────────────────────────────────────────────────────
export function getWorkoutTemplates() {
    return JSON.parse(localStorage.getItem('workoutTemplates') || '{}');
}

export function saveWorkoutTemplate(name) {
    const workout = getTodayWorkout();
    if (!workout?.exercises.length || !name.trim()) return null;
    const templates = getWorkoutTemplates();
    const id = `tmpl-${Date.now()}`;
    templates[id] = {
        id,
        name: name.trim(),
        createdAt: workout.date,
        exercises: workout.exercises.map(ex => ({
            exerciseId: ex.exerciseId,
            name: ex.name,
            muscle: ex.muscle,
            sets: ex.sets.map(s => ({ reps: s.reps, kg: s.kg })),
        })),
    };
    localStorage.setItem('workoutTemplates', JSON.stringify(templates));
    return id;
}

export function deleteWorkoutTemplate(id) {
    const templates = getWorkoutTemplates();
    delete templates[id];
    localStorage.setItem('workoutTemplates', JSON.stringify(templates));
}

export function loadWorkoutTemplate(id) {
    const templates = getWorkoutTemplates();
    const tmpl = templates[id];
    if (!tmpl || !_todayWorkout) return false;
    _todayWorkout.exercises = tmpl.exercises.map(ex => ({
        exerciseId: ex.exerciseId,
        name: ex.name,
        muscle: ex.muscle,
        sets: ex.sets.map(s => ({ reps: s.reps, kg: s.kg })),
    }));
    _autoSave();
    return true;
}

// ─── PRs ─────────────────────────────────────────────────────────────────────
export function getExercisePRs() {
    return JSON.parse(localStorage.getItem('exercisePRs') || '{}');
}

export function updateExercisePR(exerciseId, weight, reps, date) {
    const prs = getExercisePRs();
    if (!prs[exerciseId] || weight > prs[exerciseId].maxWeight) {
        prs[exerciseId] = { maxWeight: weight, reps, date };
        localStorage.setItem('exercisePRs', JSON.stringify(prs));
    }
}
