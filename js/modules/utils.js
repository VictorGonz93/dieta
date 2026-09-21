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
