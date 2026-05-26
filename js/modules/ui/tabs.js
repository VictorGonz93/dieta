// ==================== PESTAÑAS DE NAVEGACIÓN ====================

export function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            showTab(tabId);

            if (tabId === 'historial' || tabId === 'estadisticas') {
                setTimeout(() => {
                    import('../charts.js').then(m => m.initializeCharts());
                }, 100);
            }
        });
    });
}

export function showTab(tabId) {
    import('./onboarding.js').then(m => m.closeOnboarding());

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const tabElement = document.getElementById(tabId);
    if (tabElement) tabElement.classList.add('active');

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    if (tabId === 'hoy') {
        import('../stats.js').then(m => m.displayWeeklyProgress());
    } else if (tabId === 'objetivos') {
        import('../stats.js').then(m => m.displayGoalsTracking());
    } else if (tabId === 'planteamiento') {
        import('../workout.js').then(m => m.initWorkoutPlan());
    } else if (tabId === 'historial' || tabId === 'graficos') {
        import('../charts.js').then(m => m.renderWeightPredictionChart());
    } else if (tabId === 'estadisticas') {
        import('../stats.js').then(m => {
            m.displayWeeklyStats();
            m.displayPredictionAccuracy();
            m.updateStatistics();
        });
    }
}
