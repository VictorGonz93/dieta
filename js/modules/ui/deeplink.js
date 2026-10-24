// ==================== DEEP LINKS (?tab=, ?action=, ?sport=) ====================

import { showTab } from './tabs.js';

const VALID_TABS = ['hoy', 'objetivos', 'productos', 'planteamiento', 'historial', 'estadisticas', 'config'];
const VALID_ACTIONS = ['add-food', 'weight', 'workout', 'copy-day'];
const VALID_MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

const SPORT_ALIASES = {
    'entreno-hoy': 'entreno-hoy',
    'entreno': 'entreno-hoy',
    'entrenar': 'entreno-hoy',
    'workout': 'entreno-hoy',
    'planificacion': 'planificacion',
    'plan': 'planificacion',
    'ejercicios': 'ejercicios',
    'exercises': 'ejercicios',
    'historial-entrenos': 'historial-entrenos',
    'volumen': 'volumen',
};

function _param(params, key) {
    return String(params.get(key) || '').trim().toLowerCase();
}

function _normalizeSport(raw) {
    const value = String(raw || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return SPORT_ALIASES[value] || null;
}

/** Parsea los parámetros de un deep link sin tocar el DOM. */
export function parseDeepLink(search = '') {
    let params;
    try {
        const clean = String(search || '');
        params = new URLSearchParams(clean.startsWith('?') ? clean : (clean ? `?${clean}` : ''));
    } catch (_) {
        return { tab: null, action: null, sport: null, meal: null };
    }

    const rawTab = _param(params, 'tab');
    const rawAction = _param(params, 'action');
    const rawMeal = _param(params, 'meal');
    return {
        tab: VALID_TABS.includes(rawTab) ? rawTab : null,
        action: VALID_ACTIONS.includes(rawAction) ? rawAction : null,
        sport: _normalizeSport(params.get('sport')),
        meal: VALID_MEALS.includes(rawMeal) ? rawMeal : null,
    };
}

export function hasDeepLink(search = '') {
    const parsed = parseDeepLink(search);
    return !!(parsed.tab || parsed.action || parsed.sport);
}

function _cleanDeepLinkFromURL() {
    if (typeof window === 'undefined' || typeof history === 'undefined' || !history.replaceState) return;
    try {
        const url = new URL(window.location.href);
        ['tab', 'action', 'sport', 'meal'].forEach(key => url.searchParams.delete(key));
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) { /* entorno sin URL/history completo */ }
}

/**
 * Ejecuta el deep link: cambia de pestaña, abre el modal o enfoca el campo.
 * Devuelve true si había algo que ejecutar.
 */
export async function executeDeepLink(search = (typeof window !== 'undefined' ? window.location.search : '')) {
    const parsed = parseDeepLink(search);
    if (!parsed.tab && !parsed.action && !parsed.sport) return false;

    let tab = parsed.tab;
    if (!tab) {
        if (parsed.sport || parsed.action === 'workout') tab = 'planteamiento';
        else if (parsed.action === 'add-food' || parsed.action === 'weight' || parsed.action === 'copy-day') tab = 'hoy';
    }

    if (tab) showTab(tab);
    // showTab renderiza algunas pestañas con imports dinámicos: dar un tick.
    await new Promise(resolve => setTimeout(resolve, 120));

    if (parsed.sport) {
        try {
            const workoutUI = await import('./workout-ui.js');
            workoutUI.showSportTab(parsed.sport);
        } catch (_) { /* pestaña de deporte no disponible */ }
    }

    if (parsed.action === 'add-food') {
        try {
            const [meals, modal] = await Promise.all([import('../meals.js'), import('./modal.js')]);
            modal.openModal(parsed.meal || meals.getSuggestedMealSlot());
        } catch (_) { /* modal no disponible */ }
    } else if (parsed.action === 'weight') {
        const input = document.getElementById('dailyWeightInput');
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus();
            if (typeof input.select === 'function') input.select();
        }
    } else if (parsed.action === 'workout') {
        try {
            const workoutUI = await import('./workout-ui.js');
            workoutUI.showSportTab('entreno-hoy');
            const section = document.getElementById('sport-entreno-hoy');
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) { /* ignore */ }
    } else if (parsed.action === 'copy-day') {
        try {
            const meals = await import('../meals.js');
            meals.openCopyDayModal();
        } catch (_) { /* ignore */ }
    }

    _cleanDeepLinkFromURL();
    return true;
}
