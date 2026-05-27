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

    days.forEach(day => {
        const dayName = dayNames[day];
        const dayInfo = routine[dayName] || { type: 'descanso', label: '' };
        const typeSelect = document.getElementById(`${day}-type`);
        const labelInput = document.getElementById(`${day}-label`);
        if (typeSelect) typeSelect.value = dayInfo.type || 'descanso';
        if (labelInput) labelInput.value = dayInfo.label || '';
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
        const type = typeSelect?.value || 'descanso';
        const label = labelInput?.value?.trim() || '';

        if (!label && type === 'entreno') {
            showNotification(`Por favor completa la descripción para ${dayName}`, 'warning');
            hasError = true;
            return;
        }

        customRoutine[dayName] = {
            type: type,
            label: label || (type === 'descanso' ? 'Descanso' : ''),
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

export const EXERCISES_DB = [
    // ── Pecho ─────────────────────────────────────────────────────────────────
    { id: 1,  name: 'Press Banca',                  muscle: 'Pecho',    type: 'libre',   met: 5.0 },
    { id: 2,  name: 'Press Inclinado (Barra)',       muscle: 'Pecho',    type: 'libre',   met: 5.0 },
    { id: 3,  name: 'Press Declinado (Barra)',       muscle: 'Pecho',    type: 'libre',   met: 5.0 },
    { id: 4,  name: 'Press Banca (Mancuernas)',      muscle: 'Pecho',    type: 'libre',   met: 5.0 },
    { id: 5,  name: 'Press Inclinado (Mancuernas)',  muscle: 'Pecho',    type: 'libre',   met: 5.0 },
    { id: 6,  name: 'Press Declinado (Mancuernas)', muscle: 'Pecho',    type: 'libre',   met: 4.5 },
    { id: 7,  name: 'Aperturas Mancuerna (Plano)',   muscle: 'Pecho',    type: 'libre',   met: 4.0 },
    { id: 8,  name: 'Aperturas Inclinadas',          muscle: 'Pecho',    type: 'libre',   met: 4.0 },
    { id: 9,  name: 'Peck Deck',                     muscle: 'Pecho',    type: 'maquina', met: 3.5 },
    { id: 10, name: 'Cruce de Poleas (Alto)',         muscle: 'Pecho',    type: 'maquina', met: 4.0 },
    { id: 11, name: 'Cruce de Poleas (Bajo)',         muscle: 'Pecho',    type: 'maquina', met: 4.0 },
    { id: 12, name: 'Fondos (Pecho)',                 muscle: 'Pecho',    type: 'cuerpo',  met: 6.0 },
    { id: 13, name: 'Flexiones',                      muscle: 'Pecho',    type: 'cuerpo',  met: 5.0 },
    { id: 14, name: 'Pullover (Mancuerna)',            muscle: 'Pecho',    type: 'libre',   met: 4.0 },
    { id: 15, name: 'Press en Máquina (Pecho)',       muscle: 'Pecho',    type: 'maquina', met: 4.5 },
    // ── Espalda ───────────────────────────────────────────────────────────────
    { id: 16, name: 'Peso Muerto',                    muscle: 'Espalda',  type: 'libre',   met: 6.0 },
    { id: 17, name: 'Peso Muerto Rumano',              muscle: 'Espalda',  type: 'libre',   met: 5.5 },
    { id: 18, name: 'Peso Muerto Sumo',                muscle: 'Espalda',  type: 'libre',   met: 6.0 },
    { id: 19, name: 'Dominadas (Agarre Prono)',        muscle: 'Espalda',  type: 'cuerpo',  met: 6.0 },
    { id: 20, name: 'Dominadas (Agarre Supino)',       muscle: 'Espalda',  type: 'cuerpo',  met: 6.0 },
    { id: 21, name: 'Remo con Barra',                  muscle: 'Espalda',  type: 'libre',   met: 5.0 },
    { id: 22, name: 'Remo Mancuerna (Un Brazo)',       muscle: 'Espalda',  type: 'libre',   met: 5.0 },
    { id: 23, name: 'Remo en T',                       muscle: 'Espalda',  type: 'libre',   met: 5.0 },
    { id: 24, name: 'Jalón al Pecho (Agarre Ancho)',   muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    { id: 25, name: 'Jalón Agarre Cerrado',            muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    { id: 26, name: 'Remo en Polea Baja',              muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    { id: 27, name: 'Remo en Máquina',                 muscle: 'Espalda',  type: 'maquina', met: 4.5 },
    { id: 28, name: 'Straight Arm Pulldown',           muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    { id: 29, name: 'Pullover (Polea)',                 muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    { id: 30, name: 'Hiperextensiones',                muscle: 'Espalda',  type: 'cuerpo',  met: 3.5 },
    { id: 31, name: 'Buenos Días',                     muscle: 'Espalda',  type: 'libre',   met: 4.5 },
    { id: 32, name: 'Encogimientos (Trapecios)',        muscle: 'Espalda',  type: 'libre',   met: 3.5 },
    // ── Piernas ───────────────────────────────────────────────────────────────
    { id: 33, name: 'Sentadilla (Barra)',              muscle: 'Piernas',  type: 'libre',   met: 6.0 },
    { id: 34, name: 'Sentadilla Frontal',              muscle: 'Piernas',  type: 'libre',   met: 6.0 },
    { id: 35, name: 'Sentadilla Búlgara',              muscle: 'Piernas',  type: 'libre',   met: 5.5 },
    { id: 36, name: 'Sentadilla (Mancuernas)',         muscle: 'Piernas',  type: 'libre',   met: 5.5 },
    { id: 37, name: 'Hack Squat',                      muscle: 'Piernas',  type: 'maquina', met: 5.5 },
    { id: 38, name: 'Prensa (45°)',                    muscle: 'Piernas',  type: 'maquina', met: 5.0 },
    { id: 39, name: 'Extensiones Cuádriceps',          muscle: 'Piernas',  type: 'maquina', met: 4.0 },
    { id: 40, name: 'Curl Femoral Tumbado',            muscle: 'Piernas',  type: 'maquina', met: 4.0 },
    { id: 41, name: 'Curl Femoral de Pie',             muscle: 'Piernas',  type: 'maquina', met: 4.0 },
    { id: 42, name: 'Curl Femoral Sentado',            muscle: 'Piernas',  type: 'maquina', met: 4.0 },
    { id: 43, name: 'Zancadas',                        muscle: 'Piernas',  type: 'libre',   met: 5.5 },
    { id: 44, name: 'Zancadas Caminando',              muscle: 'Piernas',  type: 'libre',   met: 5.5 },
    { id: 45, name: 'Step Up',                         muscle: 'Piernas',  type: 'libre',   met: 5.0 },
    { id: 46, name: 'Gemelos de Pie',                  muscle: 'Piernas',  type: 'maquina', met: 3.5 },
    { id: 47, name: 'Gemelos Sentado',                 muscle: 'Piernas',  type: 'maquina', met: 3.0 },
    { id: 48, name: 'Abductores (Máquina)',            muscle: 'Piernas',  type: 'maquina', met: 3.5 },
    { id: 49, name: 'Aductores (Máquina)',             muscle: 'Piernas',  type: 'maquina', met: 3.5 },
    { id: 50, name: 'Nordic Curl',                     muscle: 'Piernas',  type: 'cuerpo',  met: 5.0 },
    // ── Glúteos ───────────────────────────────────────────────────────────────
    { id: 51, name: 'Hip Thrust (Barra)',               muscle: 'Glúteos',  type: 'libre',   met: 5.0 },
    { id: 52, name: 'Hip Thrust (Máquina)',             muscle: 'Glúteos',  type: 'maquina', met: 4.5 },
    { id: 53, name: 'Hip Thrust (Mancuernas)',          muscle: 'Glúteos',  type: 'libre',   met: 4.5 },
    { id: 54, name: 'Patada de Glúteo (Polea)',         muscle: 'Glúteos',  type: 'maquina', met: 3.5 },
    { id: 55, name: 'Patada de Glúteo (Cuadrupedia)',   muscle: 'Glúteos',  type: 'cuerpo',  met: 3.5 },
    { id: 56, name: 'Peso Muerto Pierna Recta',         muscle: 'Glúteos',  type: 'libre',   met: 5.0 },
    { id: 57, name: 'Abducción Cadera (Polea)',         muscle: 'Glúteos',  type: 'maquina', met: 3.5 },
    { id: 58, name: 'Glute Bridge',                    muscle: 'Glúteos',  type: 'cuerpo',  met: 4.0 },
    { id: 59, name: 'Peso Muerto (Mancuernas)',        muscle: 'Glúteos',  type: 'libre',   met: 5.0 },
    // ── Hombros ───────────────────────────────────────────────────────────────
    { id: 60, name: 'Press Militar (Barra)',            muscle: 'Hombros',  type: 'libre',   met: 5.0 },
    { id: 61, name: 'Press Militar (Mancuernas)',       muscle: 'Hombros',  type: 'libre',   met: 5.0 },
    { id: 62, name: 'Press Arnold',                    muscle: 'Hombros',  type: 'libre',   met: 5.0 },
    { id: 63, name: 'Press en Máquina (Hombros)',      muscle: 'Hombros',  type: 'maquina', met: 4.5 },
    { id: 64, name: 'Elevaciones Laterales (Mancuer.)',muscle: 'Hombros',  type: 'libre',   met: 4.0 },
    { id: 65, name: 'Elevaciones Laterales (Polea)',   muscle: 'Hombros',  type: 'maquina', met: 4.0 },
    { id: 66, name: 'Elevaciones Frontales (Barra)',   muscle: 'Hombros',  type: 'libre',   met: 4.0 },
    { id: 67, name: 'Elevaciones Frontales (Mancuer.)',muscle: 'Hombros',  type: 'libre',   met: 4.0 },
    { id: 68, name: 'Pájaros (Mancuernas)',            muscle: 'Hombros',  type: 'libre',   met: 4.0 },
    { id: 69, name: 'Pájaros (Polea)',                 muscle: 'Hombros',  type: 'maquina', met: 4.0 },
    { id: 70, name: 'Face Pull',                       muscle: 'Hombros',  type: 'maquina', met: 3.5 },
    { id: 71, name: 'Press Trasnuca',                  muscle: 'Hombros',  type: 'libre',   met: 4.5 },
    // ── Bíceps ────────────────────────────────────────────────────────────────
    { id: 72, name: 'Curl Barra (Recta)',              muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 73, name: 'Curl Barra EZ',                  muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 74, name: 'Curl Mancuerna (Alterno)',        muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 75, name: 'Curl Mancuerna (Simultáneo)',     muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 76, name: 'Curl Martillo',                  muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 77, name: 'Curl en Polea',                  muscle: 'Bíceps',   type: 'maquina', met: 3.5 },
    { id: 78, name: 'Curl Concentrado',               muscle: 'Bíceps',   type: 'libre',   met: 3.5 },
    { id: 79, name: 'Curl Predicador (Scott)',         muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 80, name: 'Curl Inclinado',                 muscle: 'Bíceps',   type: 'libre',   met: 4.0 },
    { id: 81, name: 'Curl en Máquina',                muscle: 'Bíceps',   type: 'maquina', met: 3.5 },
    // ── Tríceps ───────────────────────────────────────────────────────────────
    { id: 82, name: 'Press Francés (Barra)',           muscle: 'Tríceps',  type: 'libre',   met: 4.0 },
    { id: 83, name: 'Press Francés (Mancuernas)',      muscle: 'Tríceps',  type: 'libre',   met: 4.0 },
    { id: 84, name: 'Extensión Polea Alta (Barra)',    muscle: 'Tríceps',  type: 'maquina', met: 3.5 },
    { id: 85, name: 'Extensión Polea Alta (Cuerda)',   muscle: 'Tríceps',  type: 'maquina', met: 3.5 },
    { id: 86, name: 'Extensión sobre la Cabeza',       muscle: 'Tríceps',  type: 'libre',   met: 3.5 },
    { id: 87, name: 'Fondos de Tríceps',               muscle: 'Tríceps',  type: 'cuerpo',  met: 5.0 },
    { id: 88, name: 'Patada de Tríceps',               muscle: 'Tríceps',  type: 'libre',   met: 3.5 },
    { id: 89, name: 'Press Cerrado (Banca)',           muscle: 'Tríceps',  type: 'libre',   met: 4.5 },
    { id: 90, name: 'Diamond Push-ups',                muscle: 'Tríceps',  type: 'cuerpo',  met: 4.5 },
    // ── Core ──────────────────────────────────────────────────────────────────
    { id: 91, name: 'Crunch',                          muscle: 'Core',     type: 'cuerpo',  met: 3.5 },
    { id: 92, name: 'Crunch Inverso',                  muscle: 'Core',     type: 'cuerpo',  met: 3.5 },
    { id: 93, name: 'Crunch en Polea',                 muscle: 'Core',     type: 'maquina', met: 3.5 },
    { id: 94, name: 'Plancha (Frontal)',                muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 95, name: 'Plancha Lateral',                  muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 96, name: 'Rueda Abdominal',                  muscle: 'Core',     type: 'cuerpo',  met: 4.5 },
    { id: 97, name: 'Elevación de Piernas (Tumbado)',  muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 98, name: 'Elevación de Piernas (Colgado)',  muscle: 'Core',     type: 'cuerpo',  met: 5.0 },
    { id: 99, name: 'Russian Twist',                   muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 100,name: 'Dead Bug',                        muscle: 'Core',     type: 'cuerpo',  met: 3.5 },
    { id: 101,name: 'Cable Woodchop',                  muscle: 'Core',     type: 'maquina', met: 4.0 },
    { id: 102,name: 'Hollow Body Hold',                muscle: 'Core',     type: 'cuerpo',  met: 3.5 },
    // ── Cardio ────────────────────────────────────────────────────────────────
    { id: 103,name: 'Cinta (Caminar)',                 muscle: 'Cardio',   type: 'cardio',  met: 3.5 },
    { id: 104,name: 'Cinta (Caminar Inclinado)',       muscle: 'Cardio',   type: 'cardio',  met: 5.0 },
    { id: 105,name: 'Cinta (Correr)',                  muscle: 'Cardio',   type: 'cardio',  met: 9.0 },
    { id: 106,name: 'Cinta (Sprints)',                 muscle: 'Cardio',   type: 'cardio',  met: 12.0 },
    { id: 107,name: 'Elíptica',                        muscle: 'Cardio',   type: 'cardio',  met: 5.0 },
    { id: 108,name: 'Bicicleta Estática (Moderado)',   muscle: 'Cardio',   type: 'cardio',  met: 5.5 },
    { id: 109,name: 'Bicicleta Estática (Intenso)',    muscle: 'Cardio',   type: 'cardio',  met: 10.0 },
    { id: 110,name: 'Remo (Máquina)',                  muscle: 'Cardio',   type: 'cardio',  met: 7.0 },
    { id: 111,name: 'Comba (Saltar)',                  muscle: 'Cardio',   type: 'cardio',  met: 10.0 },
    { id: 112,name: 'Battle Ropes',                    muscle: 'Cardio',   type: 'cardio',  met: 10.0 },
    { id: 113,name: 'HIIT (Alta Intensidad)',          muscle: 'Cardio',   type: 'cardio',  met: 12.0 },
    { id: 114,name: 'Natación',                        muscle: 'Cardio',   type: 'cardio',  met: 6.0 },
    { id: 115,name: 'Escaladora (StairMaster)',        muscle: 'Cardio',   type: 'cardio',  met: 9.0 },
    // ── Pecho – Máquinas BasicFit ─────────────────────────────────────────────
    { id: 116,name: 'Press Banca Guiado (Multipower)', muscle: 'Pecho',    type: 'maquina', met: 4.5 },
    { id: 117,name: 'Press Banca Palanca (Tumbado)',   muscle: 'Pecho',    type: 'maquina', met: 4.5 },
    { id: 118,name: 'Press Inclinado Guiado (Multip.)',muscle: 'Pecho',    type: 'maquina', met: 4.5 },
    { id: 119,name: 'Press Declinado Guiado (Multip.)',muscle: 'Pecho',    type: 'maquina', met: 4.5 },
    // ── Espalda – Máquinas BasicFit ───────────────────────────────────────────
    { id: 120,name: 'Pull-up Asistido (Máquina)',      muscle: 'Espalda',  type: 'maquina', met: 5.0 },
    { id: 121,name: 'Remo con Soporte Pecho',          muscle: 'Espalda',  type: 'maquina', met: 4.5 },
    { id: 122,name: 'Jalón Trasnuca',                  muscle: 'Espalda',  type: 'maquina', met: 4.0 },
    // ── Piernas – Máquinas BasicFit ───────────────────────────────────────────
    { id: 123,name: 'Sentadilla Guiada (Multipower)',  muscle: 'Piernas',  type: 'maquina', met: 5.5 },
    { id: 124,name: 'Prensa Horizontal',               muscle: 'Piernas',  type: 'maquina', met: 5.0 },
    { id: 125,name: 'Fondos Asistidos (Máquina)',      muscle: 'Tríceps',  type: 'maquina', met: 4.5 },
    // ── Hombros – Máquinas BasicFit ───────────────────────────────────────────
    { id: 126,name: 'Press Hombro Guiado (Multip.)',   muscle: 'Hombros',  type: 'maquina', met: 4.5 },
    // ── Core – Variaciones plancha y abdominales ───────────────────────────────
    { id: 127,name: 'Plancha con Peso',                muscle: 'Core',     type: 'cuerpo',  met: 4.5 },
    { id: 128,name: 'Plancha con Elevación de Brazo',  muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 129,name: 'Plancha con Elevación de Pierna', muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 130,name: 'Crunch Bicicleta',               muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 131,name: 'Mountain Climbers',               muscle: 'Core',     type: 'cuerpo',  met: 8.0 },
    { id: 132,name: 'Dragon Flag',                     muscle: 'Core',     type: 'cuerpo',  met: 5.0 },
    { id: 133,name: 'L-Sit',                           muscle: 'Core',     type: 'cuerpo',  met: 4.5 },
    { id: 134,name: 'Tijeras (Scissors)',              muscle: 'Core',     type: 'cuerpo',  met: 4.0 },
    { id: 135,name: 'Pallof Press (Polea)',            muscle: 'Core',     type: 'maquina', met: 3.5 },
    { id: 136,name: 'Ab Rollout (Barra)',              muscle: 'Core',     type: 'libre',   met: 4.5 },
    // ── Antebrazos ────────────────────────────────────────────────────────────
    { id: 137,name: 'Curl de Muñeca (Barra)',          muscle: 'Antebrazos', type: 'libre',   met: 3.0 },
    { id: 138,name: 'Extensión de Muñeca (Barra)',     muscle: 'Antebrazos', type: 'libre',   met: 3.0 },
    { id: 139,name: 'Curl de Muñeca (Mancuernas)',     muscle: 'Antebrazos', type: 'libre',   met: 3.0 },
    { id: 140,name: 'Extensión de Muñeca (Mancuer.)',  muscle: 'Antebrazos', type: 'libre',   met: 3.0 },
    { id: 141,name: 'Farmer\'s Walk',                  muscle: 'Antebrazos', type: 'libre',   met: 5.0 },
    { id: 142,name: 'Dead Hang',                       muscle: 'Antebrazos', type: 'cuerpo',  met: 3.0 },
    { id: 143,name: 'Rosca de Muñeca (Polea)',         muscle: 'Antebrazos', type: 'maquina', met: 3.0 },
    { id: 144,name: 'Agarre de Pinza (Peso)',          muscle: 'Antebrazos', type: 'libre',   met: 3.0 },
    { id: 145,name: 'Pronación / Supinación (Mancuer.)',muscle: 'Antebrazos', type: 'libre',   met: 2.5 },
];

export const MUSCLES = ['Todos', 'Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Core', 'Cardio'];

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
    if (!_todayWorkout) return;
    const ex = EXERCISES_DB.find(e => e.id === exerciseId);
    if (!ex || _todayWorkout.exercises.some(e => e.exerciseId === exerciseId)) return;
    _todayWorkout.exercises.push({ exerciseId, name: ex.name, muscle: ex.muscle, sets: [{ reps: 10, kg: 0 }] });
    _autoSave();
}

export function removeExerciseFromWorkout(exerciseId) {
    if (!_todayWorkout) return;
    _todayWorkout.exercises = _todayWorkout.exercises.filter(e => e.exerciseId !== exerciseId);
    _autoSave();
}

export function addSetToExercise(exerciseId) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId === exerciseId);
    if (!ex) return;
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ reps: last?.reps || 10, kg: last?.kg || 0 });
    _autoSave();
}

export function removeSetFromExercise(exerciseId, setIndex) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId === exerciseId);
    if (!ex || ex.sets.length <= 1) return;
    ex.sets.splice(setIndex, 1);
    _autoSave();
}

export function updateSet(exerciseId, setIndex, field, value) {
    if (!_todayWorkout) return;
    const ex = _todayWorkout.exercises.find(e => e.exerciseId === exerciseId);
    if (!ex || !ex.sets[setIndex]) return;
    ex.sets[setIndex][field] = parseFloat(value) || 0;
    _autoSave();
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

export function estimateWorkoutKcal(workout) {
    if (!workout?.exercises.length) return 0;
    // Usar el peso registrado ese día si existe, si no el peso actual del config
    const dateKey = workout.date;
    const historyEntry = AppState.config.weightHistory?.find(w => w.date === dateKey);
    const bodyWeight = historyEntry?.weight || AppState.config.currentWeight || 75;

    // Constantes fisiológicas
    const REST_MIN = 3;       // minutos de descanso entre series
    // MET entre series: ~6-7 mL O₂/kg/min medido en estudios → MET ≈ 1.6
    const MET_REST = 1.6;
    // Trabajo mecánico → kcal: F × recorrido / eficiencia / (J·kcal⁻¹)
    // ROM medio 0.38 m para ejercicios con carga (máquinas/cables: ROM más corto que peso libre)
    // Eficiencia 0.20: incluye fase excéntrica (concéntrica pura sería 0.25)
    const KCAL_PER_KG_REP = (9.8 * 0.38) / 0.20 / 4186; // ≈ 0.00445 kcal/(kg·rep)
    // Peso corporal libre: ROM medio 0.28 m (sentadillas, fondos, dominadas)
    const KCAL_PER_BW_REP  = (9.8 * 0.28) / 0.20 / 4186; // ≈ 0.00327 kcal/rep

    let strengthKcal = 0;
    let totalStrengthSets = 0;
    const cardioExercises = [];

    for (const ex of workout.exercises) {
        const dbEx = EXERCISES_DB.find(e => e.id === ex.exerciseId);
        if (!dbEx) continue;

        if (dbEx.type === 'cardio') {
            cardioExercises.push(dbEx);
        } else {
            for (const set of ex.sets) {
                const reps = set.reps || 0;
                const kg   = set.kg   || 0;
                if (reps === 0) continue;
                strengthKcal += kg > 0
                    ? reps * kg * KCAL_PER_KG_REP
                    : reps * bodyWeight * KCAL_PER_BW_REP;
                totalStrengthSets++;
            }
        }
    }

    // Calorías de descanso entre series
    const restKcal = totalStrengthSets * REST_MIN * MET_REST * bodyWeight / 60;

    // Tiempo no contabilizado: calentamiento, transiciones entre ejercicios, enfriamiento
    // Se estima como la diferencia entre la duración total y el tiempo de series+descanso
    const countedMins = totalStrengthSets * (1.2 + REST_MIN); // ~1.2 min por serie activa
    const extraMins = Math.max(0, (workout.duration || 0) - countedMins);
    const transitionKcal = extraMins > 0 ? (2.0 * bodyWeight * extraMins / 60) : 0;

    // Cardio: tiempo restante del entreno tras descontar el bloque de fuerza
    let cardioKcal = 0;
    if (cardioExercises.length > 0) {
        const totalDuration   = workout.duration || 60;
        const strengthTimeMins = totalStrengthSets * (1 + REST_MIN); // ~1 min serie + 3 min descanso
        const cardioTimeMins  = Math.max(totalDuration - strengthTimeMins, cardioExercises.length * 10);
        const timePerCardioEx = cardioTimeMins / cardioExercises.length;
        cardioKcal = cardioExercises.reduce((s, e) => s + e.met * bodyWeight * (timePerCardioEx / 60), 0);
    }

    return Math.round(strengthKcal + restKcal + transitionKcal + cardioKcal);
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
