/**
 * Weight Module - Gestiona predicción y historial de pesos
 */
const Weight = {
    history: {},

    // Cargar historial
    loadHistory() {
        this.history = Storage.loadWeightHistory();
        return this.history;
    },

    // Guardar historial
    saveHistory() {
        Storage.saveWeightHistory(this.history);
    },

    // Registrar peso
    recordWeight(dateKey, weight) {
        this.history[dateKey] = {
            weight,
            recorded: new Date().toISOString()
        };
        this.saveHistory();
    },

    // Obtener peso
    getWeight(dateKey) {
        return this.history[dateKey]?.weight || null;
    },

    // Calcular predicción
    calculateWeightPrediction() {
        const dates = Object.keys(this.history).sort();
        if (dates.length < 3) return null;

        const recentDates = dates.slice(-7);
        const weights = recentDates.map(d => this.history[d].weight);
        const avgWeight = weights.reduce((a, b) => a + b) / weights.length;
        
        return {
            current: weights[weights.length - 1],
            average: avgWeight,
            trend: weights[weights.length - 1] - weights[0]
        };
    },

    // Renderizar historial
    renderHistory() {
        const container = document.querySelector('#weight-history-list');
        if (!container) return;

        const dates = Object.keys(this.history).sort().reverse();
        container.innerHTML = dates.slice(0, 10).map(dateKey => `
            <div class="flex justify-between items-center p-2 bg-gray-800 rounded">
                <span>${dateKey}</span>
                <input type="number" step="0.1" value="${this.history[dateKey].weight}" 
                    onchange="Weight.updateEntry('${dateKey}', this.value)">
            </div>
        `).join('');
    },

    // Actualizar entrada
    updateEntry(dateKey, newWeight) {
        this.recordWeight(dateKey, parseFloat(newWeight));
    },

    // Eliminar entrada
    deleteEntry(dateKey) {
        delete this.history[dateKey];
        this.saveHistory();
        this.renderHistory();
    }
};
