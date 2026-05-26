// ==================== ACCORDION ====================

export function toggleAccordion(headerElement) {
    // Cerrar todos los demás acordeones
    document.querySelectorAll('.accordion-header').forEach(header => {
        if (header !== headerElement) {
            header.classList.remove('active');
            const content = header.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                content.classList.remove('active');
            }
        }
    });

    // Toggle del acordeón actual
    headerElement.classList.toggle('active');
    const contentElement = headerElement.nextElementSibling;
    if (contentElement && contentElement.classList.contains('accordion-content')) {
        contentElement.classList.toggle('active');

        // Renderizar historial de peso si es esa sección
        if (contentElement.id === 'tab-pesos') {
            import('../weight.js').then(m => m.renderWeightHistory());
        }
    }
}
