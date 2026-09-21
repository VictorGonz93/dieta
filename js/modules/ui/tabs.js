// ==================== PESTAÑAS DE NAVEGACIÓN ====================

import { getDateKey } from '../storage.js';

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
            import('../google-fit.js').then(gf => {
                const dateKey = getDateKey(new Date());
                const sessions = w.getWorkoutSessions();
                const session = sessions[dateKey];
                let steps = null;
                if (session && session.exercises) {
                    for (const ex of session.exercises) {
                        if (ex.trackingType === 'steps' && ex.sets) {
                            for (const set of ex.sets) {
                                steps = (steps || 0) + (parseFloat(set.steps) || 0);
                            }
                        }
                    }
                }
                gf.renderGoogleFitStatusUI(steps);
            });
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
    }
}
