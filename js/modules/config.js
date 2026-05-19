/**
 * Config Module - Gestiona configuración biométrica y settings
 */
const Config = {
    data: {},

    // Cargar configuración
    load() {
        this.data = Storage.loadConfig();
        return this.data;
    },

    // Guardar configuración
    save() {
        Storage.saveConfig(this.data);
    },

    // Actualizar valor
    set(key, value) {
        this.data[key] = value;
        this.save();
    },

    // Obtener valor
    get(key) {
        return this.data[key];
    },

    // Calcular TMR (Mifflin-St Jeor)
    calculateTMR() {
        const { currentWeight, height, age, gender } = this.data;
        if (!currentWeight || !height || !age || !gender) return 0;
        
        let tmr;
        if (gender === 'male') {
            tmr = 10 * currentWeight + 6.25 * height - 5 * age + 5;
        } else {
            tmr = 10 * currentWeight + 6.25 * height - 5 * age - 161;
        }
        return Math.round(tmr);
    },

    // Calcular TDEE
    calculateTDEE(dayType = 'training') {
        const tmr = this.calculateTMR();
        const factors = {
            'training': 1.55,
            'rest': 1.375,
            'social': 1.6
        };
        return Math.round(tmr * (factors[dayType] || 1.55));
    },

    // Obtener tipo de día
    getDayType(dateKey) {
        const GYM_ROUTINE = ['Monday', 'Tuesday', 'Thursday', 'Friday'];
        const date = new Date(dateKey);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        return GYM_ROUTINE.includes(dayName) ? 'training' : 'rest';
    },

    // Obtener meta calórica del día
    getCalorieTarget(dateKey = null) {
        const date = dateKey ? new Date(dateKey) : new Date();
        const dateStr = date.toISOString().split('T')[0];
        const dayType = this.getDayType(dateStr);
        const tdee = this.calculateTDEE(dayType);
        const deficit = Math.round(tdee * 0.1); // 10% déficit
        return dayType === 'training' ? tdee - 100 : tdee - deficit;
    },

    // Cargar y actualizar configuración en UI
    updateUIValues() {
        const inputs = {
            'startWeight': '#input_start_weight',
            'currentWeight': '#current_weight_input',
            'targetWeight': '#target_weight_input',
            'age': '#age_input',
            'height': '#height_input',
            'startDate': '#start_date_input'
        };

        Object.keys(inputs).forEach(key => {
            const input = document.querySelector(inputs[key]);
            if (input) input.value = this.data[key] || '';
        });
    },

    // Actualizar valores calculados
    updateCalculatedValues() {
        const tmr = this.calculateTMR();
        const tdee = this.calculateTDEE('training');
        
        const tmrEl = document.querySelector('#tmr_value');
        const tdeeEl = document.querySelector('#tdee_value');
        
        if (tmrEl) tmrEl.textContent = tmr;
        if (tdeeEl) tdeeEl.textContent = tdee;
    },

    // Dark mode
    loadDarkMode() {
        const enabled = Storage.loadDarkMode();
        if (enabled) {
            document.documentElement.classList.add('dark');
        }
        return enabled;
    },

    toggleDarkMode() {
        const enabled = !Storage.loadDarkMode();
        Storage.saveDarkMode(enabled);
        if (enabled) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        return enabled;
    }
};
