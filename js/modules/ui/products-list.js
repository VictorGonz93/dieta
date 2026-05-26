// ==================== LISTA DE PRODUCTOS ====================

import AppState from '../state.js';
import { PRODUCTS_DB } from '../products.js';

// customProducts se accede desde AppState.customProducts

export function renderProductsList() {
    const container = document.getElementById('productsList');
    if (!container) return;

    const search = (document.getElementById('searchProduct')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || '';

    const allProducts = PRODUCTS_DB;

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesCategory = !category || p.category === category;
        return matchesSearch && matchesCategory;
    });

    container.innerHTML = filtered.map(p => {
        const cleanName = p.name.replace(/^[^\w]+\s/, '').trim();
        const isCustom = AppState.customProducts.some(cp => cp.id == p.id);

        const customUnitDisplay = isCustom && p.customUnit && p.customUnitWeight
            ? `<div class="product-custom-unit" style="color: #A78BFA; font-size: 0.85rem; margin-top: 4px;">📦 1 ${p.customUnit} = ${p.customUnitWeight}g</div>`
            : '';

        const bgColor = isCustom ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)';
        const borderColor = isCustom ? '#3B82F6' : '#6B7280';

        return `
            <div class="product-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 6px;">
                <div class="product-info" style="flex: 1;">
                    <div class="product-name">${cleanName}</div>
                    <div class="product-portion">${p.portion}${p.unit}</div>
                    ${customUnitDisplay}
                    <div class="product-macros">
                        <span class="macro-badge">🔥 ${p.kcal}kcal</span>
                        <span class="macro-badge">💪 ${p.protein}g</span>
                        <span class="macro-badge">🥔 ${p.carbs}g</span>
                        <span class="macro-badge">🥑 ${p.fats}g</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px; margin-left: 10px;">
                    <button onclick="editProduct(${p.id})" style="padding: 4px 8px; background: rgba(168,85,247,0.2); color: #A855F7; border: 1px solid #A855F7; border-radius: 4px; cursor: pointer; font-size: 1rem; line-height: 1; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;" title="Editar">✏️</button>
                    <button onclick="deleteProduct(${p.id})" style="padding: 4px 8px; background: rgba(239,68,68,0.2); color: #EF4444; border: 1px solid #EF4444; border-radius: 4px; cursor: pointer; font-size: 1rem; line-height: 1; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}
