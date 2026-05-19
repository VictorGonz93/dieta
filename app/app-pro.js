// NUTRITION TRACKER PRO - VERSIÓN MEJORADA
// Sistema profesional con gráficos, estadísticas y funcionalidades avanzadas

// DATOS INICIALES EXPANDIDA
const PRODUCTS_DB = [
    // Bebidas/Lácteos
    { id: 1, name: '🥛 Leche entera + Cacao', portion: 100, unit: 'ml', category: 'bebidas', kcal: 63, protein: 3.2, carbs: 4.6, fats: 2.4 },
    { id: 2, name: '🥛 Leche entera (pura)', portion: 100, unit: 'ml', category: 'bebidas', kcal: 61, protein: 3.2, carbs: 4.7, fats: 3.6 },
    { id: 3, name: '🍯 Yogur Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 52, protein: 10, carbs: 1, fats: 0.1 },
    { id: 4, name: '🍮 Gelatina Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 40, protein: 10, carbs: 1, fats: 0.1 },
    { id: 5, name: '🍫 Cacao Hacendado', portion: 10, unit: 'g', category: 'bebidas', kcal: 30, protein: 1.5, carbs: 4.5, fats: 0.5 },
    // Proteínas
    { id: 6, name: '🥚 Huevo entero', portion: 50, unit: 'g', category: 'proteinas', kcal: 72, protein: 6.3, carbs: 0.6, fats: 5.1 },
    { id: 7, name: '⚪ Clara de huevo', portion: 30, unit: 'g', category: 'proteinas', kcal: 17, protein: 3.6, carbs: 0.4, fats: 0.1 },
    { id: 8, name: '🐟 Atún en lata (escurrido)', portion: 100, unit: 'g', category: 'proteinas', kcal: 98, protein: 21, carbs: 0.9, fats: 1.2 },
    { id: 9, name: '💪 Proteína Whey', portion: 40, unit: 'g', category: 'proteinas', kcal: 155, protein: 34.4, carbs: 1.2, fats: 1.5 },
    { id: 10, name: '💊 Creatina monohidrato', portion: 5, unit: 'g', category: 'suplementos', kcal: 0, protein: 0, carbs: 0, fats: 0 },
    // Carbohidratos
    { id: 11, name: '🥔 Patata cocida', portion: 100, unit: 'g', category: 'carbos', kcal: 77, protein: 2, carbs: 17, fats: 0.1 },
    { id: 12, name: '🍌 Plátano', portion: 100, unit: 'g', category: 'carbos', kcal: 89, protein: 1.1, carbs: 23, fats: 0.3 },
    { id: 13, name: '🍚 Arroz blanco cocido', portion: 100, unit: 'g', category: 'carbos', kcal: 130, protein: 2.7, carbs: 28, fats: 0.3 },
];

// ESTADO GLOBAL
let currentDate = new Date();
let allDays = {};
let config = {
    startWeight: 85.4,
    currentWeight: 73.1,
    targetWeight: 70,
    startDate: new Date('2025-12-30'),
    proteinGoal: 160,
    calsEntrenamiento: 1700,
    calsDescanso: 1550,
    carbsMin: 80,
    carbsMax: 130,
    fatsMin: 45,
    fatsMax: 60,
};

let charts = {};

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadAllDays();
    initializeToday();
    renderProductsList();
    setupTabNavigation();
    setupTabSearch();
    updateHeaderInfo();
    setupConfigTabs();
    
    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
});

// ==================== TAB NAVIGATION ====================
function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            showTab(tabId);
            
            // Inicializar gráficos si es necesario
            if (tabId === 'historial' || tabId === 'estadisticas') {
                setTimeout(() => initializeCharts(), 100);
            }
        });
    });
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active');
    }
}

// ==================== CONFIG TABS ====================
function setupConfigTabs() {
    document.querySelectorAll('.config-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.textContent.toLowerCase();
            switchConfigTab(tabName === 'personal' ? 'personal' : tabName === 'objetivos' ? 'objetivos' : 'datos');
        });
    });
}

function switchConfigTab(tabName) {
    document.querySelectorAll('.config-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.config-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    document.querySelector(`[onclick="switchConfigTab('${tabName}')"]`)?.classList.add('active');
}

// ==================== CONFIGURACIÓN ====================
function loadConfig() {
    const saved = localStorage.getItem('nutrition_config');
    if (saved) {
        const parsed = JSON.parse(saved);
        config = { ...config, ...parsed };
        if (parsed.startDate) config.startDate = new Date(parsed.startDate);
    }
    updateConfigUI();
}

function saveConfig() {
    config.startWeight = parseFloat(document.getElementById('startWeight')?.value || config.startWeight);
    config.currentWeight = parseFloat(document.getElementById('currentWeightInput')?.value || config.currentWeight);
    config.targetWeight = parseFloat(document.getElementById('targetWeight')?.value || config.targetWeight);
    config.startDate = new Date(document.getElementById('startDate')?.value || config.startDate.toISOString().split('T')[0]);
    config.proteinGoal = parseInt(document.getElementById('proteinGoalInput')?.value || config.proteinGoal);
    config.calsEntrenamiento = parseInt(document.getElementById('calsEntrenamiento')?.value || config.calsEntrenamiento);
    config.calsDescanso = parseInt(document.getElementById('calsDescanso')?.value || config.calsDescanso);
    config.carbsMin = parseInt(document.getElementById('carbsMin')?.value || config.carbsMin);
    config.carbsMax = parseInt(document.getElementById('carbsMax')?.value || config.carbsMax);
    config.fatsMin = parseInt(document.getElementById('fatsMin')?.value || config.fatsMin);
    config.fatsMax = parseInt(document.getElementById('fatsMax')?.value || config.fatsMax);
    
    localStorage.setItem('nutrition_config', JSON.stringify(config));
    showNotification('✅ Configuración guardada correctamente', 'success');
    updateHeaderInfo();
    renderDay();
}

function updateConfigUI() {
    const el = (id) => document.getElementById(id);
    if (el('startWeight')) el('startWeight').value = config.startWeight;
    if (el('currentWeightInput')) el('currentWeightInput').value = config.currentWeight;
    if (el('targetWeight')) el('targetWeight').value = config.targetWeight;
    if (el('startDate')) el('startDate').value = config.startDate.toISOString().split('T')[0];
    if (el('proteinGoalInput')) el('proteinGoalInput').value = config.proteinGoal;
    if (el('calsEntrenamiento')) el('calsEntrenamiento').value = config.calsEntrenamiento;
    if (el('calsDescanso')) el('calsDescanso').value = config.calsDescanso;
    if (el('carbsMin')) el('carbsMin').value = config.carbsMin;
    if (el('carbsMax')) el('carbsMax').value = config.carbsMax;
    if (el('fatsMin')) el('fatsMin').value = config.fatsMin;
    if (el('fatsMax')) el('fatsMax').value = config.fatsMax;
}

function updateHeaderInfo() {
    const dayNumber = getDayNumber(new Date());
    const startWeight = config.startWeight;
    const currentWeight = config.currentWeight;
    const targetWeight = config.targetWeight;
    
    const totalToLose = startWeight - targetWeight;
    const alreadyLost = startWeight - currentWeight;
    const progressPercent = Math.round((alreadyLost / totalToLose) * 100);
    
    if (document.getElementById('dayCounter')) document.getElementById('dayCounter').textContent = dayNumber;
    if (document.getElementById('currentWeight')) document.getElementById('currentWeight').textContent = `${currentWeight} kg`;
    if (document.getElementById('progressPercent')) document.getElementById('progressPercent').textContent = `${Math.min(progressPercent, 100)}%`;
}

// ==================== GESTIÓN DE DÍAS ====================
function getDayNumber(date) {
    const start = new Date(config.startDate);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function initializeToday() {
    const dateKey = getDateKey(currentDate);
    if (!allDays[dateKey]) {
        allDays[dateKey] = {
            date: dateKey,
            dayNumber: getDayNumber(currentDate),
            meals: { breakfast: [], lunch: [], snack: [], dinner: [] },
            notes: ''
        };
        saveDays();
    }
    renderDay();
}

function renderDay() {
    const dateKey = getDateKey(currentDate);
    const dayData = allDays[dateKey];
    
    if (!dayData) {
        initializeToday();
        return;
    }
    
    const formattedDate = currentDate.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const dayName = ['😴 DESCANSO', '🏋️ ENTRENO', '🦵 PIERNA FUERTE'][Math.floor(Math.random() * 3)];
    
    if (document.getElementById('dayTitle')) {
        document.getElementById('dayTitle').textContent = `📅 Día ${dayData.dayNumber} | ${dayName}`;
    }
    if (document.getElementById('dayDate')) {
        document.getElementById('dayDate').textContent = formattedDate;
    }
    
    // Renderizar comidas
    renderMealSection('breakfast', dayData.meals.breakfast);
    renderMealSection('lunch', dayData.meals.lunch);
    renderMealSection('snack', dayData.meals.snack);
    renderMealSection('dinner', dayData.meals.dinner);
    
    // Actualizar totales
    updateDaySummary(dayData);
}

function renderMealSection(mealName, foods) {
    const container = document.getElementById(mealName + '-items');
    const totalEl = document.getElementById(mealName + '-total');
    
    if (!container || !totalEl) return;
    
    container.innerHTML = '';
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
    
    foods.forEach((food, index) => {
        const foodEl = document.createElement('div');
        foodEl.className = 'food-item';
        foodEl.innerHTML = `
            <span class="food-item-name">${food.name} (${food.quantity}${food.unit})</span>
            <span class="food-item-macros">${food.kcal.toFixed(0)}kcal | ${food.protein.toFixed(1)}g</span>
            <button class="food-item-delete" onclick="deleteFood('${mealName}', ${index})">✕</button>
        `;
        container.appendChild(foodEl);
        
        totalKcal += food.kcal;
        totalProtein += food.protein;
        totalCarbs += food.carbs;
        totalFats += food.fats;
    });
    
    totalEl.textContent = `${totalKcal.toFixed(0)} kcal | ${totalProtein.toFixed(1)}g P`;
}

function updateDaySummary(dayData) {
    const meals = ['breakfast', 'lunch', 'snack', 'dinner'];
    let sumKcal = 0, sumProtein = 0, sumCarbs = 0, sumFats = 0;
    
    meals.forEach(meal => {
        dayData.meals[meal].forEach(food => {
            sumKcal += food.kcal;
            sumProtein += food.protein;
            sumCarbs += food.carbs;
            sumFats += food.fats;
        });
    });
    
    // Determinar objetivos
    const isTraining = getDayNumber(currentDate) % 2 === 0;
    const targetCals = isTraining ? config.calsEntrenamiento : config.calsDescanso;
    const targetProtein = config.proteinGoal;
    
    // Actualizar summary items
    const updateSummaryItem = (icon, label, value, goal, status, id) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<div class="summary-value">${value.toFixed(0)}</div>`;
        }
    };
    
    if (document.getElementById('sumCals')) document.getElementById('sumCals').textContent = sumKcal.toFixed(0);
    if (document.getElementById('calsGoal')) document.getElementById('calsGoal').textContent = `/ ${targetCals}`;
    if (document.getElementById('sumProtein')) document.getElementById('sumProtein').textContent = sumProtein.toFixed(1) + 'g';
    if (document.getElementById('proteinGoal')) document.getElementById('proteinGoal').textContent = `/ ${targetProtein}g`;
    if (document.getElementById('sumCarbs')) document.getElementById('sumCarbs').textContent = sumCarbs.toFixed(1) + 'g';
    if (document.getElementById('carbsGoal')) document.getElementById('carbsGoal').textContent = `/ ${config.carbsMin}-${config.carbsMax}g`;
    if (document.getElementById('sumFats')) document.getElementById('sumFats').textContent = sumFats.toFixed(1) + 'g';
    if (document.getElementById('fatsGoal')) document.getElementById('fatsGoal').textContent = `/ ${config.fatsMin}-${config.fatsMax}g`;
    
    // Status
    if (document.getElementById('statusCals')) document.getElementById('statusCals').textContent = getStatus(sumKcal, targetCals - 100, targetCals + 100);
    if (document.getElementById('statusProtein')) document.getElementById('statusProtein').textContent = getStatus(sumProtein, targetProtein - 10, targetProtein + 10);
    if (document.getElementById('statusCarbs')) document.getElementById('statusCarbs').textContent = getStatus(sumCarbs, config.carbsMin, config.carbsMax);
    if (document.getElementById('statusFats')) document.getElementById('statusFats').textContent = getStatus(sumFats, config.fatsMin, config.fatsMax);
    
    // Quick macros
    updateQuickMacros(sumKcal, sumProtein, sumCarbs, sumFats, targetCals);
}

function updateQuickMacros(kcal, protein, carbs, fats, targetCals) {
    if (document.getElementById('quickCals')) document.getElementById('quickCals').textContent = `${kcal.toFixed(0)} / ${targetCals}`;
    if (document.getElementById('quickProtein')) document.getElementById('quickProtein').textContent = `${protein.toFixed(1)} / ${config.proteinGoal}g`;
    if (document.getElementById('quickCarbs')) document.getElementById('quickCarbs').textContent = `${carbs.toFixed(1)} / ${config.carbsMax}g`;
    if (document.getElementById('quickFats')) document.getElementById('quickFats').textContent = `${fats.toFixed(1)} / ${config.fatsMax}g`;
    
    // Actualizar barra de progreso
    const percent = Math.min((kcal / targetCals) * 100, 100);
    const bar = document.querySelector('.macro-bar::after');
    if (bar) {
        bar.style.width = percent + '%';
    }
}

function getStatus(value, min, max) {
    if (value >= min && value <= max) return '✅';
    if (value > max) return '⚠️ +' + (value - max).toFixed(0);
    return '❌ -' + (min - value).toFixed(0);
}

function previousDay() {
    currentDate.setDate(currentDate.getDate() - 1);
    currentDate = new Date(currentDate);
    initializeToday();
}

function nextDay() {
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate = new Date(currentDate);
    initializeToday();
}

function todayDay() {
    currentDate = new Date();
    initializeToday();
}

// ==================== MODAL ====================
let currentMealForModal = null;

function openModal(mealType) {
    currentMealForModal = mealType;
    document.getElementById('modal').classList.add('show');
    resetModalForm();
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

function resetModalForm() {
    const el = (id) => document.getElementById(id);
    el('foodName').value = '';
    el('foodQuantity').value = '';
    el('foodQuantity').dataset.basePortion = '1';
    el('foodUnit').value = 'g';
    el('foodCals').value = '';
    el('foodCals').dataset.base = '0';
    el('foodProtein').value = '';
    el('foodProtein').dataset.base = '0';
    el('foodCarbs').value = '';
    el('foodCarbs').dataset.base = '0';
    el('foodFats').value = '';
    el('foodFats').dataset.base = '0';
}

function calculateMacros() {
    const quantity = parseFloat(document.getElementById('foodQuantity').value) || 0;
    const baseKcal = parseFloat(document.getElementById('foodCals').dataset.base) || 0;
    const baseProtein = parseFloat(document.getElementById('foodProtein').dataset.base) || 0;
    const baseCarbs = parseFloat(document.getElementById('foodCarbs').dataset.base) || 0;
    const baseFats = parseFloat(document.getElementById('foodFats').dataset.base) || 0;
    const basePortion = parseFloat(document.getElementById('foodQuantity').dataset.basePortion) || 1;
    
    if (quantity <= 0 || basePortion <= 0) return;
    
    const multiplier = quantity / basePortion;
    document.getElementById('foodCals').value = (baseKcal * multiplier).toFixed(1);
    document.getElementById('foodProtein').value = (baseProtein * multiplier).toFixed(1);
    document.getElementById('foodCarbs').value = (baseCarbs * multiplier).toFixed(1);
    document.getElementById('foodFats').value = (baseFats * multiplier).toFixed(1);
}

function setupTabSearch() {
    const search = document.getElementById('modalSearch');
    const quantity = document.getElementById('foodQuantity');
    
    if (search) {
        search.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const suggested = document.getElementById('suggestedProducts');
            
            if (query.length < 2) {
                suggested.innerHTML = '';
                return;
            }
            
            const matches = PRODUCTS_DB.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
            suggested.innerHTML = matches.map(p => `
                <div class="suggested-item" onclick="selectProduct(${p.id})">
                    ${p.name} (${p.portion}${p.unit}) - ${p.kcal}kcal
                </div>
            `).join('');
        });
    }
    
    if (quantity) {
        quantity.addEventListener('input', calculateMacros);
    }
}

function selectProduct(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;
    
    document.getElementById('foodName').value = product.name;
    document.getElementById('foodQuantity').value = product.portion;
    document.getElementById('foodQuantity').dataset.basePortion = product.portion;
    document.getElementById('foodUnit').value = product.unit;
    
    const calsInput = document.getElementById('foodCals');
    const proteinInput = document.getElementById('foodProtein');
    const carbsInput = document.getElementById('foodCarbs');
    const fatsInput = document.getElementById('foodFats');
    
    calsInput.dataset.base = product.kcal;
    proteinInput.dataset.base = product.protein;
    carbsInput.dataset.base = product.carbs;
    fatsInput.dataset.base = product.fats;
    
    calsInput.value = product.kcal;
    proteinInput.value = product.protein;
    carbsInput.value = product.carbs;
    fatsInput.value = product.fats;
    
    document.getElementById('suggestedProducts').innerHTML = '';
}

function addFood() {
    if (!currentMealForModal) return;
    
    const food = {
        name: document.getElementById('foodName').value,
        quantity: parseFloat(document.getElementById('foodQuantity').value),
        unit: document.getElementById('foodUnit').value,
        kcal: parseFloat(document.getElementById('foodCals').value),
        protein: parseFloat(document.getElementById('foodProtein').value),
        carbs: parseFloat(document.getElementById('foodCarbs').value),
        fats: parseFloat(document.getElementById('foodFats').value),
    };
    
    if (!food.name || !food.quantity || !food.kcal) {
        showNotification('❌ Completa todos los campos', 'error');
        return;
    }
    
    const dateKey = getDateKey(currentDate);
    allDays[dateKey].meals[currentMealForModal].push(food);
    saveDays();
    closeModal();
    renderDay();
    showNotification(`✅ ${food.name} agregado correctamente`);
}

function deleteFood(meal, index) {
    const dateKey = getDateKey(currentDate);
    allDays[dateKey].meals[meal].splice(index, 1);
    saveDays();
    renderDay();
}

// ==================== PRODUCTOS ====================
function renderProductsList() {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    const search = (document.getElementById('searchProduct')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || '';
    
    let filtered = PRODUCTS_DB.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesCategory = !category || p.category === category;
        return matchesSearch && matchesCategory;
    });
    
    container.innerHTML = filtered.map(p => `
        <div class="product-item" onclick="openModal('${currentMealForModal || 'breakfast'}'); selectProduct(${p.id})">
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-macros">${p.portion}${p.unit} | ${p.kcal}kcal | P:${p.protein}g C:${p.carbs}g G:${p.fats}g</div>
            </div>
            <button class="product-add-btn">Agregar</button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchProduct');
    const categorySelect = document.getElementById('categoryFilter');
    
    if (searchInput) searchInput.addEventListener('input', renderProductsList);
    if (categorySelect) categorySelect.addEventListener('change', renderProductsList);
});

// ==================== GRÁFICOS ====================
function initializeCharts() {
    if (window.Chart) {
        initWeightChart();
        initCaloriesChart();
        initProteinChart();
        initMacroChart();
        updateStatistics();
    }
}

function initWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx || charts.weight) return;
    
    const dates = Object.keys(allDays).sort();
    const weights = dates.map(date => {
        // Aquí iría la lógica de peso real si lo tienes registrado
        return config.currentWeight;
    }).slice(-30); // Últimos 30 días
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.weight = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Peso (kg)',
                data: weights,
                borderColor: '#4299e1',
                backgroundColor: 'rgba(66, 153, 225, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#4299e1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: config.targetWeight - 5,
                    max: config.startWeight + 2
                }
            }
        }
    });
}

function initCaloriesChart() {
    const ctx = document.getElementById('caloriesChart');
    if (!ctx || charts.calories) return;
    
    const dates = Object.keys(allDays).sort();
    const caloriesData = dates.map(date => {
        const day = allDays[date];
        let totalKcal = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
            });
        });
        return totalKcal;
    }).slice(-30);
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.calories = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Calorías',
                data: caloriesData,
                backgroundColor: caloriesData.map(val => val > config.calsEntrenamiento ? '#f56565' : '#48bb78'),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function initProteinChart() {
    const ctx = document.getElementById('proteinChart');
    if (!ctx || charts.protein) return;
    
    const dates = Object.keys(allDays).sort();
    const proteinData = dates.map(date => {
        const day = allDays[date];
        let totalProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalProtein += food.protein;
            });
        });
        return totalProtein;
    }).slice(-30);
    
    const labelsText = dates.slice(-30).map(d => new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    
    charts.protein = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsText,
            datasets: [{
                label: 'Proteína (g)',
                data: proteinData,
                borderColor: '#48bb78',
                backgroundColor: 'rgba(72, 187, 120, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function initMacroChart() {
    const ctx = document.getElementById('macroChart');
    if (!ctx || charts.macro) return;
    
    const dates = Object.keys(allDays).sort();
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0, count = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                totalKcal += food.kcal;
                totalProtein += food.protein;
                totalCarbs += food.carbs;
                totalFats += food.fats;
            });
        });
        if (Object.values(day.meals).some(m => m.length > 0)) count++;
    });
    
    const avgProteinCals = totalProtein * 4 / count;
    const avgCarbsCals = totalCarbs * 4 / count;
    const avgFatsCals = totalFats * 9 / count;
    
    charts.macro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Proteína (4 kcal/g)', 'Carbos (4 kcal/g)', 'Grasas (9 kcal/g)'],
            datasets: [{
                data: [avgProteinCals, avgCarbsCals, avgFatsCals],
                backgroundColor: ['#4299e1', '#48bb78', '#ed8936'],
                borderRadius: 8,
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15, font: { size: 12 } }
                }
            }
        }
    });
}

// ==================== ESTADÍSTICAS ====================
function updateStatistics() {
    updateWeekStats();
    updateAverageStats();
    updateBestDayStats();
    updateHistoryList();
}

function updateWeekStats() {
    const container = document.getElementById('weekStats');
    if (!container) return;
    
    const today = new Date();
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        weekDays.push(getDateKey(d));
    }
    
    let weekCals = 0, weekProtein = 0, weekDaysLogged = 0;
    
    weekDays.forEach(day => {
        const dayData = allDays[day];
        if (dayData) {
            let dayKcal = 0, dayProtein = 0;
            Object.values(dayData.meals).forEach(meal => {
                meal.forEach(food => {
                    dayKcal += food.kcal;
                    dayProtein += food.protein;
                });
            });
            if (dayKcal > 0) {
                weekCals += dayKcal;
                weekProtein += dayProtein;
                weekDaysLogged++;
            }
        }
    });
    
    const avgCals = weekDaysLogged > 0 ? (weekCals / weekDaysLogged).toFixed(0) : 0;
    const avgProtein = weekDaysLogged > 0 ? (weekProtein / weekDaysLogged).toFixed(1) : 0;
    
    container.innerHTML = `
        <p><strong>Promedio semanal:</strong> ${avgCals} kcal</p>
        <p><strong>Promedio proteína:</strong> ${avgProtein}g</p>
        <p><strong>Días registrados:</strong> ${weekDaysLogged} / 7</p>
    `;
}

function updateAverageStats() {
    const container = document.getElementById('avgStats');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort();
    let totalKcal = 0, totalProtein = 0, count = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
            });
        });
        if (dayKcal > 0) {
            totalKcal += dayKcal;
            totalProtein += dayProtein;
            count++;
        }
    });
    
    const avgCals = count > 0 ? (totalKcal / count).toFixed(0) : 0;
    const avgProtein = count > 0 ? (totalProtein / count).toFixed(1) : 0;
    
    container.innerHTML = `
        <p><strong>Total de días:</strong> ${count}</p>
        <p><strong>Promedio calórico:</strong> ${avgCals} kcal</p>
        <p><strong>Promedio proteína:</strong> ${avgProtein}g</p>
    `;
}

function updateBestDayStats() {
    const container = document.getElementById('bestDayStats');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort();
    let bestDay = null;
    let maxProtein = 0;
    
    dates.forEach(date => {
        const day = allDays[date];
        let dayProtein = 0;
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayProtein += food.protein;
            });
        });
        if (dayProtein > maxProtein) {
            maxProtein = dayProtein;
            bestDay = { date, protein: dayProtein, dayNumber: day.dayNumber };
        }
    });
    
    if (bestDay) {
        container.innerHTML = `
            <p><strong>Día ${bestDay.dayNumber}</strong></p>
            <p><strong>Proteína:</strong> ${bestDay.protein.toFixed(1)}g</p>
            <p><strong>Fecha:</strong> ${bestDay.date}</p>
        `;
    } else {
        container.innerHTML = '<p>Sin datos registrados</p>';
    }
}

function updateHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    const dates = Object.keys(allDays).sort().reverse();
    
    container.innerHTML = dates.slice(0, 10).map(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
                dayCarbs += food.carbs;
                dayFats += food.fats;
            });
        });
        
        return `
            <div class="history-item">
                <div class="history-item-header">
                    <span class="history-item-date">Día ${day.dayNumber} - ${date}</span>
                </div>
                <div class="history-item-macros">
                    <div class="history-macro">
                        <span class="history-macro-label">Kcal</span>
                        <span class="history-macro-value">${dayKcal.toFixed(0)}</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Proteína</span>
                        <span class="history-macro-value">${dayProtein.toFixed(1)}g</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Carbos</span>
                        <span class="history-macro-value">${dayCarbs.toFixed(1)}g</span>
                    </div>
                    <div class="history-macro">
                        <span class="history-macro-label">Grasas</span>
                        <span class="history-macro-value">${dayFats.toFixed(1)}g</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== DATOS & EXPORT ====================
function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function saveDays() {
    localStorage.setItem('nutrition_days', JSON.stringify(allDays));
}

function loadAllDays() {
    const saved = localStorage.getItem('nutrition_days');
    if (saved) {
        try {
            allDays = JSON.parse(saved);
        } catch (e) {
            allDays = {};
        }
    }
}

function exportData() {
    const data = {
        config,
        days: allDays,
        exportDate: new Date().toISOString()
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_backup_${getDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ Datos exportados correctamente');
}

function exportCSV() {
    let csv = 'Fecha,Día,Calorías,Proteína (g),Carbos (g),Grasas (g)\n';
    
    Object.keys(allDays).sort().forEach(date => {
        const day = allDays[date];
        let dayKcal = 0, dayProtein = 0, dayCarbs = 0, dayFats = 0;
        
        Object.values(day.meals).forEach(meal => {
            meal.forEach(food => {
                dayKcal += food.kcal;
                dayProtein += food.protein;
                dayCarbs += food.carbs;
                dayFats += food.fats;
            });
        });
        
        csv += `${date},${day.dayNumber},${dayKcal.toFixed(0)},${dayProtein.toFixed(1)},${dayCarbs.toFixed(1)},${dayFats.toFixed(1)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition_data_${getDateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ CSV exportado correctamente');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.config) config = { ...config, ...data.config };
            if (data.days) allDays = data.days;
            saveDays();
            loadConfig();
            initializeToday();
            showNotification('✅ Datos importados correctamente');
        } catch (err) {
            showNotification('❌ Error al importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (!confirm('⚠️ ¿Estás seguro? Esto eliminará TODOS los datos.')) return;
    localStorage.clear();
    allDays = {};
    showNotification('✅ Todos los datos fueron eliminados');
    location.reload();
}

// ==================== NOTIFICACIONES ====================
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ==================== UTILITIES ====================
document.addEventListener('DOMContentLoaded', () => {
    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});
