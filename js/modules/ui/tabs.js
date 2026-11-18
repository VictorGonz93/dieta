// ==================== PESTAÑAS DE NAVEGACIÓN ====================

export function setupTabNavigation() {
    const btns = Array.from(document.querySelectorAll('.tab-btn'));
    btns.forEach((btn, idx) => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            showTab(tabId);

            if (tabId === 'historial' || tabId === 'estadisticas') {
                setTimeout(() => {
                    import('../charts.js').then(m => m.initializeCharts());
                }, 100);
            }
        });
        // Navegación por teclado (patrón tabs WAI-ARIA): ←/→ cambian de pestaña
        btn.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const next = (idx + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
            btns[next].focus();
            btns[next].click();
        });
    });
}

export function showTab(tabId) {
    import('./onboarding.js').then(m => m.closeOnboarding());

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });

    const tabElement = document.getElementById(tabId);
    if (tabElement) tabElement.classList.add('active');

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
    }

    if (tabId === 'hoy') {
        import('../meals.js').then(m => m.renderDay());
        import('../stats.js').then(m => m.displayWeeklyProgress());
        import('../config-settings.js').then(m => m.updateHeaderInfo());
    } else if (tabId === 'objetivos') {
        import('../stats.js').then(m => m.displayGoalsTracking());
    } else if (tabId === 'planteamiento') {
        import('../workout.js').then(w => {
            w.initWorkoutPlan();
            // La tarjeta de Health muestra el último valor de la API, no la
            // suma de series manuales de pasos de la sesión.
            import('../google-health.js').then(gh => gh.renderGoogleHealthStatusUI());
        });
    } else if (tabId === 'historial') {
        setTimeout(() => {
            import('../charts.js').then(m => {
                m.initializeCharts();
                m.renderWeightPredictionChart();
            });
        }, 80);
    } else if (tabId === 'estadisticas') {
        import('../stats.js').then(m => {
            m.displayWeeklyStats();
            m.displayPredictionAccuracy();
            m.updateStatistics();
        });
    } else if (tabId === 'ia') {
        import('../ai.js').then(m => m.initAITab());
    }
}
