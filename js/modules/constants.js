// ==================== CONSTANTES GLOBALES ====================

export const CURRENT_APP_VERSION = 44;

export const UNIT_CONVERSIONS = {
    'g': 1,
    'ml': 1,
    'kg': 1000,
    'l': 1000,
    'oz': 28.3495,
    'tbsp': 15,
    'tsp': 5,
    'cup': 237,
    'pz': 100,
};

export const GYM_ROUTINE = {
    'Lunes': { type: 'descanso', label: 'Descanso' },
    'Martes': { type: 'entreno', label: 'Pierna (fuerte)' },
    'Miércoles': { type: 'entreno', label: 'Espalda + Pecho (ligero)' },
    'Jueves': { type: 'descanso', label: 'Descanso' },
    'Viernes': { type: 'entreno', label: 'Hombro + Brazos' },
    'Sábado': { type: 'entreno', label: 'Pecho + Espalda (fuerte)' },
    'Domingo': { type: 'entreno', label: 'Core + Antebrazo' },
};

export const REQUIRED_FIELDS = [
    { key: 'startWeight', label: 'Peso Inicial', icon: 'monitor_weight' },
    { key: 'currentWeight', label: 'Peso Actual', icon: 'scale' },
    { key: 'targetWeight', label: 'Peso Objetivo', icon: 'flag' },
    { key: 'startDate', label: 'Fecha Inicio', icon: 'calendar_today' },
    { key: 'height', label: 'Altura', icon: 'straighten' },
    { key: 'age', label: 'Edad', icon: 'person' },
    { key: 'gender', label: 'Género', icon: 'wc' },
];
