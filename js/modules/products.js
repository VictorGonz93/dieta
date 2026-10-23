// ==================== BASE DE PRODUCTOS ====================

import AppState from './state.js';
import { safeGet, safeSet, _sanitizeProduct, _sanitizeProductOverrides } from './storage.js';
import { escapeHTML, num } from './utils.js';
import { showNotification } from './ui/notifications.js';

export const PRODUCTS_DB = [
    // Bebidas/Lácteos
    { id: 1, name: 'Leche entera', portion: 100, unit: 'ml', category: 'bebidas', kcal: 61, protein: 3.2, carbs: 4.7, fats: 3.6, customUnit: '', customUnitWeight: null },
    { id: 3, name: 'Yogur Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 52, protein: 10, carbs: 1, fats: 0.1, customUnit: '', customUnitWeight: null },
    { id: 4, name: 'Gelatina Proteínas+', portion: 100, unit: 'g', category: 'bebidas', kcal: 40, protein: 10, carbs: 1, fats: 0.1, customUnit: '', customUnitWeight: null },
    { id: 5, name: 'Cacao Hacendado', portion: 10, unit: 'g', category: 'bebidas', kcal: 30, protein: 1.5, carbs: 4.5, fats: 0.5, customUnit: '', customUnitWeight: null },
    // Proteínas
    { id: 6, name: 'Huevo entero', portion: 50, unit: 'g', category: 'proteinas', kcal: 72, protein: 6.3, carbs: 0.6, fats: 5.1, customUnit: 'unidad', customUnitWeight: 50 },
    { id: 7, name: 'Clara de huevo', portion: 30, unit: 'g', category: 'proteinas', kcal: 17, protein: 3.6, carbs: 0.4, fats: 0.1, customUnit: '', customUnitWeight: null },
    { id: 8, name: 'Lata de Atún Natural', portion: 80, unit: 'g', category: 'proteinas', kcal: 78, protein: 16.8, carbs: 0.7, fats: 1, customUnit: 'lata', customUnitWeight: 80 },
    { id: 9, name: 'Proteína Whey', portion: 40, unit: 'g', category: 'proteinas', kcal: 155, protein: 34.4, carbs: 1.2, fats: 1.5, customUnit: 'cucharada', customUnitWeight: 30 },
    { id: 10, name: 'Creatina monohidrato', portion: 5, unit: 'g', category: 'suplementos', kcal: 0, protein: 0, carbs: 0, fats: 0, customUnit: '', customUnitWeight: null },
    // Carbohidratos
    { id: 11, name: 'Patata cocida', portion: 100, unit: 'g', category: 'carbos', kcal: 77, protein: 2, carbs: 17, fats: 0.1, customUnit: '', customUnitWeight: null },
    { id: 12, name: 'Plátano', portion: 100, unit: 'g', category: 'carbos', kcal: 89, protein: 1.1, carbs: 23, fats: 0.3, customUnit: '', customUnitWeight: null },
    { id: 13, name: 'Arroz blanco cocido', portion: 100, unit: 'g', category: 'carbos', kcal: 130, protein: 2.7, carbs: 28, fats: 0.3, customUnit: '', customUnitWeight: null },
    // Platos completos
    { id: 14, name: 'Albóndigas cerdo (5) + patatas', portion: 487, unit: 'g', category: 'platos', kcal: 646, protein: 34, carbs: 54, fats: 33, customUnit: '', customUnitWeight: null },
];

// Copia inmutable de la base integrada. PRODUCTS_DB se recompone a partir de
// esta copia + overrides + personalizados: editar un integrado ya no vive solo
// en memoria y sobrevive a recargas.
const BUILTIN_PRODUCTS = PRODUCTS_DB.map(p => ({ ...p }));

function _loadProductOverrides() {
    // Sanea al cargar: un localStorage manipulado no debe colar strings donde
    // el resto del código espera números (ni HTML en los modales).
    const raw = safeGet('product_overrides', {});
    AppState.productOverrides = _sanitizeProductOverrides(raw) || {};
}

function _productOverrideKey(id) {
    return String(id);
}

export function setProductOverride(productId, patch) {
    if (!AppState.productOverrides || typeof AppState.productOverrides !== 'object') {
        AppState.productOverrides = {};
    }
    const key = _productOverrideKey(productId);
    const next = { ...(AppState.productOverrides[key] || {}), ...patch };
    AppState.productOverrides[key] = next;
    return safeSet('product_overrides', AppState.productOverrides);
}

// Recompone la vista PRODUCTS_DB (referencia estable: los demás módulos ya la
// importaron). No muta la base integrada original.
export function syncProductsWithOverrides() {
    if (!AppState.productOverrides || typeof AppState.productOverrides !== 'object') {
        AppState.productOverrides = {};
    }
    PRODUCTS_DB.length = 0;
    BUILTIN_PRODUCTS.forEach(base => {
        const patch = AppState.productOverrides[_productOverrideKey(base.id)];
        PRODUCTS_DB.push({ ...base, ...(patch || {}) });
    });
    const customs = Array.isArray(AppState.customProducts) ? AppState.customProducts : [];
    customs.forEach(p => {
        if (!p || typeof p !== 'object') return;
        if (!PRODUCTS_DB.some(db => db.id === p.id)) PRODUCTS_DB.push({ ...p });
    });
}

export function loadCustomProducts() {
    const parsed = safeGet('custom_products', []);
    const list = Array.isArray(parsed) ? parsed : [];
    AppState.customProducts = list.map(_sanitizeProduct).filter(Boolean);
    _loadProductOverrides();

    const maxId = Math.max(...BUILTIN_PRODUCTS.map(p => Number(p.id) || 0), 100);
    AppState.customProducts.forEach((p, index) => {
        if (typeof p.id === 'number' && Number.isFinite(p.id)) return;
        const numeric = Number(p.id);
        if (Number.isFinite(numeric) && numeric > 0) p.id = numeric;
        else p.id = maxId + index + 1;
    });
    syncProductsWithOverrides();
}

export function saveCustomProducts() {
    if (!Array.isArray(AppState.customProducts)) AppState.customProducts = [];
    return safeSet('custom_products', AppState.customProducts);
}

export function addNewProduct() {
    const name = String(document.getElementById('newProductName').value || '').trim().slice(0, 120);
    const category = document.getElementById('newProductCategory').value;
    const kcal = parseFloat(document.getElementById('newProductKcal').value);
    const protein = parseFloat(document.getElementById('newProductProtein').value);
    const carbs = parseFloat(document.getElementById('newProductCarbs').value);
    const fats = parseFloat(document.getElementById('newProductFats').value);
    const customUnit = String(document.getElementById('newProductCustomUnit').value || '').trim().slice(0, 30);
    const customUnitWeight = parseFloat(document.getElementById('newProductCustomUnitWeight').value);

    const macros = [kcal, protein, carbs, fats];
    if (!name || !macros.every(Number.isFinite) || macros.some(v => v < 0 || v > 100000)) {
        showNotification('Completa todos los campos con valores válidos', 'error');
        return;
    }
    if (!['bebidas', 'proteinas', 'carbos', 'platos', 'suplementos'].includes(category)) {
        showNotification('Categoría no válida', 'error');
        return;
    }
    if (customUnit && (!Number.isFinite(customUnitWeight) || customUnitWeight <= 0)) {
        showNotification('Si pones unidad personalizada, debe tener un peso en gramos válido', 'error');
        return;
    }

    if (!Array.isArray(AppState.customProducts)) AppState.customProducts = [];
    const newProduct = {
        id: Date.now(),
        name,
        portion: 100,
        unit: 'g',
        category,
        kcal,
        protein,
        carbs,
        fats,
        customUnit,
        customUnitWeight: customUnit ? Math.round(customUnitWeight * 100) / 100 : null,
    };

    AppState.customProducts.push(newProduct);
    syncProductsWithOverrides();
    saveCustomProducts();

    document.getElementById('newProductName').value = '';
    document.getElementById('newProductKcal').value = '';
    document.getElementById('newProductProtein').value = '';
    document.getElementById('newProductCarbs').value = '';
    document.getElementById('newProductFats').value = '';
    document.getElementById('newProductCustomUnit').value = '';
    document.getElementById('newProductCustomUnitWeight').value = '';

    // Importación dinámica para evitar circular dependency en carga
    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Producto "${name}" agregado correctamente`);
}

export function deleteProduct(productId) {
    const sameId = (p) => p && String(p.id) === String(productId);
    const product = PRODUCTS_DB.find(sameId);
    if (!product) return;

    // Only allow deleting custom products, not built-in ones
    const isCustom = Array.isArray(AppState.customProducts) && AppState.customProducts.some(sameId);
    if (!isCustom) {
        showNotification('No se pueden eliminar productos integrados', 'warning');
        return;
    }

    const cleanName = typeof product.name === 'string' ? product.name.replace(/^[^\w]+\s/, '').trim() : '';
    if (!confirm(`¿Eliminar "${cleanName}"?`)) return;

    const customIndex = AppState.customProducts.findIndex(sameId);
    if (customIndex > -1) {
        AppState.customProducts.splice(customIndex, 1);
        saveCustomProducts();
    }

    // Recompone PRODUCTS_DB desde la base integrada + overrides + customs
    syncProductsWithOverrides();

    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification('Producto eliminado');
}

// Alias por compatibilidad
export function deleteCustomProduct(productId) {
    deleteProduct(productId);
}

export function editProductCustomUnit(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const cleanName = String(product.name || '').replace(/^[^\w]+\s/, '').trim();
    const currentUnit = product.customUnit || '';
    const currentWeight = Number.isFinite(Number(product.customUnitWeight))
        ? Number(product.customUnitWeight)
        : '';

    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000;
    `;

    modal.innerHTML = `
        <div style="background: #1e293b; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 16px;">Editar Unidad Personalizada</h3>
            <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 12px;">${escapeHTML(cleanName)}</p>
            <div style="margin-bottom: 16px;">
                <label style="color: #cbd5e1; display: block; margin-bottom: 8px; font-size: 0.9rem;">Nombre de la unidad (ej: rebanada, unidad)</label>
                <input type="text" id="editCustomUnitName" placeholder="Ej: rebanada" value="${escapeHTML(currentUnit)}" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 20px;">
                <label style="color: #cbd5e1; display: block; margin-bottom: 8px; font-size: 0.9rem;">Peso en gramos (ej: 11.2)</label>
                <input type="number" id="editCustomUnitWeight" placeholder="Ej: 11.2" value="${currentWeight}" step="0.1" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex: 1; padding: 10px; background: #475569; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Cancelar</button>
                <button data-product-id="${escapeHTML(String(productId))}" onclick="window.saveProductCustomUnit(this.dataset.productId)" style="flex: 1; padding: 10px; background: #3B82F6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Guardar</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('editCustomUnitName').focus();
}

export function saveProductCustomUnit(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const customUnit = document.getElementById('editCustomUnitName').value.trim();
    const customUnitWeight = parseFloat(document.getElementById('editCustomUnitWeight').value) || null;

    if (customUnit && !customUnitWeight) {
        showNotification('Si pones nombre de unidad, debe tener peso en gramos', 'error');
        return;
    }
    if (customUnitWeight !== null && (!Number.isFinite(customUnitWeight) || customUnitWeight <= 0)) {
        showNotification('El peso de la unidad debe ser mayor que 0', 'error');
        return;
    }

    product.customUnit = customUnit;
    product.customUnitWeight = customUnitWeight;

    const customProd = AppState.customProducts.find(p => p.id == productId);
    if (customProd) {
        customProd.customUnit = customUnit;
        customProd.customUnitWeight = customUnitWeight;
        saveCustomProducts();
    } else {
        // Producto integrado: persistir el cambio como override
        setProductOverride(productId, { customUnit, customUnitWeight });
    }

    document.querySelector('div[style*="position: fixed"]').remove();
    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Unidad personalizada actualizada`);
}

export function editProduct(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const cleanName = String(product.name || '').replace(/^[^\w]+\s/, '').trim();

    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000; padding: 16px;
    `;

    modal.innerHTML = `
        <div style="background: #1e293b; border-radius: 12px; padding: 24px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <h3 style="color: #fff; font-size: 1.3rem; margin-bottom: 20px;">Editar Producto</h3>
            <div style="margin-bottom: 16px;">
                <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600;">Nombre del producto</label>
                <input type="text" id="editProdName" placeholder="Ej: Pollo pechuga" value="${escapeHTML(cleanName)}" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; font-size: 1rem;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div>
                    <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600;">Porción estándar</label>
                    <input type="number" id="editProdPortion" placeholder="Ej: 100" value="${num(product.portion)}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; font-size: 1rem;">
                </div>
                <div>
                    <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600;">Unidad</label>
                    <select id="editProdUnit" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; font-size: 1rem;">
                        <option value="g" ${product.unit === 'g' ? 'selected' : ''}>g (gramos)</option>
                        <option value="ml" ${product.unit === 'ml' ? 'selected' : ''}>ml (mililitros)</option>
                        <option value="oz" ${product.unit === 'oz' ? 'selected' : ''}>oz (onzas)</option>
                        <option value="kg" ${product.unit === 'kg' ? 'selected' : ''}>kg (kilogramos)</option>
                        <option value="l" ${product.unit === 'l' ? 'selected' : ''}>l (litros)</option>
                        <option value="tbsp" ${product.unit === 'tbsp' ? 'selected' : ''}>tbsp (cucharada)</option>
                        <option value="tsp" ${product.unit === 'tsp' ? 'selected' : ''}>tsp (cucharadita)</option>
                        <option value="cup" ${product.unit === 'cup' ? 'selected' : ''}>cup (taza)</option>
                        <option value="pz" ${product.unit === 'pz' ? 'selected' : ''}>pz (pieza/unidad)</option>
                    </select>
                </div>
            </div>
            <div style="border-top: 1px solid #475569; padding-top: 16px; margin-bottom: 16px;">
                <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px; font-weight: 600;">Macronutrientes por porción</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Kcal</label>
                        <input type="number" id="editProdKcal" placeholder="Ej: 100" value="${num(product.kcal)}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Proteína (g)</label>
                        <input type="number" id="editProdProtein" placeholder="Ej: 10" value="${num(product.protein)}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Carbos (g)</label>
                        <input type="number" id="editProdCarbs" placeholder="Ej: 20" value="${num(product.carbs)}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Grasas (g)</label>
                        <input type="number" id="editProdFats" placeholder="Ej: 5" value="${num(product.fats)}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                </div>
            </div>
            <div style="border-top: 1px solid #475569; padding-top: 16px; margin-bottom: 20px;">
                <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px; font-weight: 600;">Unidad personalizada (opcional)</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Tipo de unidad</label>
                        <select id="editProdCustomUnit" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                            <option value="">-- Sin unidad personalizada --</option>
                            <option value="unidad" ${product.customUnit === 'unidad' ? 'selected' : ''}>unidad</option>
                            <option value="1/2 unidad" ${product.customUnit === '1/2 unidad' ? 'selected' : ''}>1/2 unidad</option>
                            <option value="1/3 unidad" ${product.customUnit === '1/3 unidad' ? 'selected' : ''}>1/3 unidad</option>
                            <option value="1/4 unidad" ${product.customUnit === '1/4 unidad' ? 'selected' : ''}>1/4 unidad</option>
                            <option value="rebanada" ${product.customUnit === 'rebanada' ? 'selected' : ''}>rebanada</option>
                            <option value="lata" ${product.customUnit === 'lata' ? 'selected' : ''}>lata</option>
                            <option value="bote" ${product.customUnit === 'bote' ? 'selected' : ''}>bote</option>
                            <option value="cucharada" ${product.customUnit === 'cucharada' ? 'selected' : ''}>cucharada</option>
                            <option value="cucharadita" ${product.customUnit === 'cucharadita' ? 'selected' : ''}>cucharadita</option>
                            <option value="taza" ${product.customUnit === 'taza' ? 'selected' : ''}>taza</option>
                            <option value="puñado" ${product.customUnit === 'puñado' ? 'selected' : ''}>puñado</option>
                            <option value="rodaja" ${product.customUnit === 'rodaja' ? 'selected' : ''}>rodaja</option>
                            <option value="filete" ${product.customUnit === 'filete' ? 'selected' : ''}>filete</option>
                            <option value="trozo" ${product.customUnit === 'trozo' ? 'selected' : ''}>trozo</option>
                        </select>
                    </div>
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Peso (g)</label>
                        <input type="number" id="editProdCustomUnitWeight" placeholder="Ej: 30" value="${Number.isFinite(Number(product.customUnitWeight)) ? Number(product.customUnitWeight) : ''}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="flex: 1; padding: 12px; background: #475569; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancelar</button>
                <button data-product-id="${escapeHTML(String(productId))}" onclick="window.saveProductEdit(this.dataset.productId)" style="flex: 1; padding: 12px; background: #3B82F6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Guardar Cambios</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('editProdName').focus();

    const customUnitSelect = document.getElementById('editProdCustomUnit');
    if (customUnitSelect) {
        customUnitSelect.addEventListener('change', function () {
            const customUnitWeightInput = document.getElementById('editProdCustomUnitWeight');
            if (this.value && this.value !== '') {
                customUnitWeightInput.value = '1';
            } else {
                customUnitWeightInput.value = '';
            }
        });
    }
}

export function saveProductEdit(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const name = document.getElementById('editProdName').value.trim();
    const portion = parseFloat(document.getElementById('editProdPortion').value);
    const unit = document.getElementById('editProdUnit').value.trim();
    const kcal = parseFloat(document.getElementById('editProdKcal').value);
    const protein = parseFloat(document.getElementById('editProdProtein').value);
    const carbs = parseFloat(document.getElementById('editProdCarbs').value);
    const fats = parseFloat(document.getElementById('editProdFats').value);
    const customUnit = document.getElementById('editProdCustomUnit').value.trim();
    const customUnitWeight = parseFloat(document.getElementById('editProdCustomUnitWeight').value) || null;

    if (!name || !portion || !unit || ![kcal, protein, carbs, fats].every(Number.isFinite)
        || [portion, kcal, protein, carbs, fats].some(v => v < 0)) {
        showNotification('Por favor completa todos los campos requeridos con valores válidos', 'error');
        return;
    }

    if (customUnit && !customUnitWeight) {
        showNotification('Si pones unidad personalizada, debe tener peso', 'error');
        return;
    }
    if (customUnitWeight !== null && (!Number.isFinite(customUnitWeight) || customUnitWeight <= 0)) {
        showNotification('El peso de la unidad debe ser mayor que 0', 'error');
        return;
    }

    product.name = name;
    product.portion = portion;
    product.unit = unit;
    product.kcal = kcal;
    product.protein = protein;
    product.carbs = carbs;
    product.fats = fats;
    product.customUnit = customUnit;
    product.customUnitWeight = customUnitWeight;

    const customProd = AppState.customProducts.find(p => p.id == productId);
    if (customProd) {
        Object.assign(customProd, {
            name, portion, unit, kcal, protein, carbs, fats, customUnit, customUnitWeight,
        });
        saveCustomProducts();
    } else {
        // Producto integrado: guardar override en localStorage
        setProductOverride(productId, {
            name, portion, unit, kcal, protein, carbs, fats, customUnit, customUnitWeight,
        });
    }

    document.querySelector('div[style*="position: fixed"]').remove();
    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Producto actualizado: ${name}`);
}
