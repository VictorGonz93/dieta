// ==================== UTILIDADES COMPARTIDAS ====================
// Sin dependencias: importable desde cualquier módulo sin riesgo de ciclos.

const _ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
};

// Escapa texto para interpolación segura en innerHTML y atributos HTML.
// Usar SIEMPRE con datos de usuario, importados o de APIs externas.
export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"'`]/g, (ch) => _ESCAPE_MAP[ch]);
}

// Número finito o fallback. Evita que un dato corrupto (undefined/"x")
// propague NaN por sumas y promedios.
export function num(value, fallback = 0) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}
