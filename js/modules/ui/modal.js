// ==================== MODAL ====================

import AppState from '../state.js';
import { UNIT_CONVERSIONS } from '../constants.js';

export function openModal(mealType) {
    AppState.currentMealForModal = mealType;
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    modal.classList.add('show');
    resetModalForm();
    setupTabSearch();
}

export function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

export function resetModalForm() {
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
    el('foodTime').value = '';
}

export function setupTabSearch() {
    const search = document.getElementById('modalSearch');
    const quantity = document.getElementById('foodQuantity');
    const unit = document.getElementById('foodUnit');

    if (search) {
        const newSearch = search.cloneNode(true);
        search.parentNode.replaceChild(newSearch, search);

        newSearch.addEventListener('input', async (e) => {
            const query = e.target.value.toLowerCase();
            const suggested = document.getElementById('suggestedProducts');

            if (query.length < 2) {
                suggested.innerHTML = '';
                return;
            }

            const { PRODUCTS_DB } = await import('../products.js');
            const matches = PRODUCTS_DB.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
            suggested.innerHTML = matches.map(p => `
                <div class="suggested-product-item" onclick="selectProduct(${p.id})">
                    <div class="suggested-product-info">
                        <div class="suggested-product-name">${getDisplayProductName(p.name)}</div>
                        <div class="suggested-product-macros">
                            <span class="macro-badge">🔥 ${p.kcal}kcal</span>
                            <span class="macro-badge">💪 ${p.protein}g</span>
                            <span class="macro-badge">🥔 ${p.carbs}g</span>
                            <span class="macro-badge">🥑 ${p.fats}g</span>
                        </div>
                    </div>
                </div>
            `).join('');
        });
    }

    if (quantity) {
        quantity.addEventListener('input', calculateMacros);
    }

    if (unit) {
        unit.addEventListener('change', calculateMacros);
    }
}

export function getDisplayProductName(name) {
    return String(name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

export async function selectProduct(productId) {
    const { PRODUCTS_DB } = await import('../products.js');
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    document.getElementById('foodName').value = getDisplayProductName(product.name);
    document.getElementById('foodQuantity').value = product.portion;
    document.getElementById('foodQuantity').dataset.basePortion = product.portion;
    document.getElementById('foodQuantity').dataset.baseUnit = product.unit;
    document.getElementById('foodQuantity').dataset.customUnit = product.customUnit || '';
    document.getElementById('foodQuantity').dataset.customUnitWeight = product.customUnitWeight || '';

    updateFoodUnitSelect(product);
    document.getElementById('foodUnit').value = product.unit;
    document.getElementById('foodUnit').dataset.previousUnit = product.unit;

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

export function calculateMacros() {
    const quantity = parseFloat(document.getElementById('foodQuantity').value) || 0;
    const selectedUnit = document.getElementById('foodUnit').value || 'g';
    const baseKcal = parseFloat(document.getElementById('foodCals').dataset.base) || 0;
    const baseProtein = parseFloat(document.getElementById('foodProtein').dataset.base) || 0;
    const baseCarbs = parseFloat(document.getElementById('foodCarbs').dataset.base) || 0;
    const baseFats = parseFloat(document.getElementById('foodFats').dataset.base) || 0;
    const basePortion = parseFloat(document.getElementById('foodQuantity').dataset.basePortion) || 1;
    const baseUnit = document.getElementById('foodQuantity').dataset.baseUnit || 'g';
    const customUnitWeight = parseFloat(document.getElementById('foodQuantity').dataset.customUnitWeight) || null;

    if (quantity <= 0 || basePortion <= 0) return;

    const quantityInGrams = _convertToGrams(quantity, selectedUnit, customUnitWeight);
    const basePortionInGrams = _convertToGrams(basePortion, baseUnit);

    const multiplier = quantityInGrams / basePortionInGrams;
    document.getElementById('foodCals').value = (baseKcal * multiplier).toFixed(1);
    document.getElementById('foodProtein').value = (baseProtein * multiplier).toFixed(1);
    document.getElementById('foodCarbs').value = (baseCarbs * multiplier).toFixed(1);
    document.getElementById('foodFats').value = (baseFats * multiplier).toFixed(1);
}

export function updateFoodUnitSelect(product) {
    const unitSelect = document.getElementById('foodUnit');
    const baseOptions = [
        '<option value="g">g (gramos)</option>',
        '<option value="ml">ml (mililitros)</option>',
        '<option value="kg">kg (kilogramos)</option>',
        '<option value="l">l (litros)</option>',
        '<option value="oz">oz (onzas)</option>',
        '<option value="tbsp">tbsp (cucharada)</option>',
        '<option value="tsp">tsp (cucharadita)</option>',
        '<option value="cup">cup (taza)</option>',
        '<option value="pz">pz (pieza)</option>',
    ];

    if (product.customUnit && product.customUnitWeight) {
        baseOptions.push(`<option value="${product.customUnit}">${product.customUnit} (${product.customUnitWeight}g)</option>`);
    }

    unitSelect.innerHTML = baseOptions.join('');
    unitSelect.removeEventListener('change', handleUnitChange);
    unitSelect.addEventListener('change', handleUnitChange);
}

export function handleUnitChange() {
    const foodUnit = document.getElementById('foodUnit');
    const foodQuantity = document.getElementById('foodQuantity');

    const currentUnit = foodUnit.value;
    const previousUnit = foodUnit.dataset.previousUnit || foodUnit.dataset.baseUnit || 'g';
    const currentQuantity = foodQuantity.value;

    if (currentUnit === foodQuantity.dataset.customUnit && currentUnit !== '') {
        foodQuantity.value = '1';
        foodUnit.dataset.previousUnit = currentUnit;
        calculateMacros();
        return;
    }

    if (currentQuantity && previousUnit !== currentUnit) {
        const customUnitWeight = parseFloat(foodQuantity.dataset.customUnitWeight) || null;
        const converted = _convertQuantity(currentQuantity, previousUnit, currentUnit, customUnitWeight);
        foodQuantity.value = converted;
    }

    foodUnit.dataset.previousUnit = currentUnit;
    calculateMacros();
}

// Helpers locales (duplicado de nutrition.js para evitar circular)
function _convertToGrams(quantity, unit, customUnitWeight = null) {
    if (customUnitWeight && !(unit in UNIT_CONVERSIONS)) {
        return quantity * customUnitWeight;
    }
    return quantity * (UNIT_CONVERSIONS[unit] || 1);
}

function _convertQuantity(quantity, fromUnit, toUnit, customUnitWeight = null) {
    if (fromUnit === toUnit || !quantity || quantity === '') return quantity;
    const qty = parseFloat(quantity);
    if (isNaN(qty)) return quantity;
    const grams = _convertToGrams(qty, fromUnit, customUnitWeight);
    if (toUnit in UNIT_CONVERSIONS) {
        return parseFloat((grams / UNIT_CONVERSIONS[toUnit]).toFixed(2));
    }
    if (customUnitWeight && toUnit !== fromUnit) {
        return parseFloat((grams / customUnitWeight).toFixed(2));
    }
    return quantity;
}
