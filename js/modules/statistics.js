/**
 * Statistics Module - Análisis, estadísticas y gráficos
 */
const Statistics = {
    // Calcular estadísticas semanales
    calculateWeeklyStats() {
        const today = new Date();
        const weekStats = {
            avgCalories: 0,
            avgProtein: 0,
            daysLogged: 0
        };

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const day = Meals.days[dateKey];

            if (day) {
                weekStats.avgCalories += day.totalCalories;
                weekStats.avgProtein += day.totalProtein;
                weekStats.daysLogged++;
            }
        }

        if (weekStats.daysLogged > 0) {
            weekStats.avgCalories = Math.round(weekStats.avgCalories / weekStats.daysLogged);
            weekStats.avgProtein = Math.round(weekStats.avgProtein / weekStats.daysLogged);
        }

        return weekStats;
    },

    // Calcular promedio general
    calculateAverageStats() {
        const days = Object.values(Meals.days);
        if (days.length === 0) return { avgCalories: 0, avgProtein: 0 };

        const avgCalories = Math.round(days.reduce((sum, d) => sum + (d.totalCalories || 0), 0) / days.length);
        const avgProtein = Math.round(days.reduce((sum, d) => sum + (d.totalProtein || 0), 0) / days.length);

        return { avgCalories, avgProtein };
    },

    // Mejor día (más proteína)
    calculateBestDay() {
        const days = Object.entries(Meals.days);
        if (days.length === 0) return { date: 'N/A', protein: 0 };

        const bestDay = days.reduce((best, [date, day]) => {
            return (day.totalProtein || 0) > (best.protein || 0) ? { date, protein: day.totalProtein } : best;
        }, {});

        return bestDay;
    },

    // Renderizar historial de últimos días
    renderHistory() {
        const container = document.querySelector('#historyList');
        if (!container) return;

        const dates = Object.keys(Meals.days).sort().reverse();
        container.innerHTML = dates.slice(0, 10).map(dateKey => {
            const day = Meals.days[dateKey];
            return `
                <div class="p-3 bg-gray-800 rounded">
                    <div><strong>${dateKey}</strong></div>
                    <div>${day.totalCalories} kcal | ${day.totalProtein}g proteína</div>
                </div>
            `;
        }).join('');
    },

    // Actualizar todos los gráficos
    initializeCharts() {
        // Aquí van Chart.js initialization
        // Se pasará a ui.js después
    }
};
