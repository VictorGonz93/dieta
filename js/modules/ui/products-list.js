// ==================== LISTA DE PRODUCTOS ====================

import AppState from '../state.js';
import { PRODUCTS_DB } from '../products.js';

// customProducts se accede desde AppState.customProducts

const PRODUCTS_PER_PAGE = 20;
let _productsPage = 0;

export function renderProductsList(resetPage = false) {
    const container = document.getElementById('productsList');
    if (!container) return;

    if (resetPage) _productsPage = 0;

    const search = (document.getElementById('searchProduct')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || '';

    const allProducts = PRODUCTS_DB;

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesCategory = !category || p.category === category;
        return matchesSearch && matchesCategory;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
    if (_productsPage >= totalPages) _productsPage = totalPages - 1;

    const paged = filtered.slice(_productsPage * PRODUCTS_PER_PAGE, (_productsPage + 1) * PRODUCTS_PER_PAGE);

    const itemsHTML = paged.map(p => {
        const cleanName = p.name.replace(/^[^\w]+\s/, '').trim();
        const isCustom = AppState.customProducts.some(cp => cp.id == p.id);

        const customUnitDisplay = isCustom && p.customUnit && p.customUnitWeight
            ? `<div class="product-custom-unit" style="color: #A78BFA; font-size: 0.85rem; margin-top: 4px;">1 ${p.customUnit} = ${p.customUnitWeight}g</div>`
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
                        <span class="macro-badge kcal">${p.kcal}kcal</span>
                        <span class="macro-badge protein">${p.protein}g P</span>
                        <span class="macro-badge carbs">${p.carbs}g C</span>
                        <span class="macro-badge fats">${p.fats}g F</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px; margin-left: 10px;">
                    <button onclick="editProduct(${p.id})" style="padding:4px;background:rgba(168,85,247,0.15);color:#A855F7;border:1px solid rgba(168,85,247,0.4);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:30px;height:30px;" title="Editar"><span class="material-icons" style="font-size:16px">edit</span></button>
                    <button onclick="deleteProduct(${p.id})" style="padding:4px;background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.4);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:30px;height:30px;" title="Eliminar"><span class="material-icons" style="font-size:16px">delete</span></button>
                </div>
            </div>
        `;
    }).join('');

    const paginationHTML = totalPages > 1 ? `
        <div class="products-pagination" style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0 4px;">
            <button onclick="window._productsGoToPage(${_productsPage - 1})" ${_productsPage === 0 ? 'disabled' : ''} style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${_productsPage === 0 ? '#1E2E48' : '#2D4468'}; background: ${_productsPage === 0 ? 'transparent' : 'rgba(16,185,129,0.1)'}; color: ${_productsPage === 0 ? '#344D6A' : '#34D399'}; cursor: ${_productsPage === 0 ? 'not-allowed' : 'pointer'}; font-size: 0.9rem;">‹ Anterior</button>
            <span style="color: #6B8BAE; font-size: 0.9rem;">Página ${_productsPage + 1} de ${totalPages} <span style="color:#344D6A;">(${filtered.length} productos)</span></span>
            <button onclick="window._productsGoToPage(${_productsPage + 1})" ${_productsPage >= totalPages - 1 ? 'disabled' : ''} style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${_productsPage >= totalPages - 1 ? '#1E2E48' : '#2D4468'}; background: ${_productsPage >= totalPages - 1 ? 'transparent' : 'rgba(16,185,129,0.1)'}; color: ${_productsPage >= totalPages - 1 ? '#344D6A' : '#34D399'}; cursor: ${_productsPage >= totalPages - 1 ? 'not-allowed' : 'pointer'}; font-size: 0.9rem;">Siguiente ›</button>
        </div>
    ` : '';

    container.innerHTML = itemsHTML + paginationHTML;
}

window._productsGoToPage = function(page) {
    _productsPage = page;
    renderProductsList(false);
};
