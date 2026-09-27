// ==================== CONSTANTES GLOBALES ====================

export const CURRENT_APP_VERSION = 117;

// Energía por kg de tejido adiposo (~87% lípidos a ~9400 kcal/kg).
// Usar este valor COMPLETO: ya incluye la composición del tejido.
// No aplicar factores adicionales (el antiguo *0.75 era un doble descuento).
export const KCAL_PER_KG_FAT = 7700;

// Coste energético por kg de tejido magro ganado en superávit (~6000 kcal/kg).
// El músculo es ~75% agua + coste de síntesis proteica. Rango literatura
// 5000-7700 según proporción agua/grasa del tejido ganado; 6000 es el punto
// medio conservador (Garthe, Slater 2019). La titulación por báscula corrige.
export const LEAN_GAIN_KCAL_PER_KG = 6000;

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
    'Domingo': { type: 'descanso', label: 'Descanso' },
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
