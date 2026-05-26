// ==================== BASE DE PRODUCTOS ====================

import AppState from './state.js';
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

export function loadCustomProducts() {
    const saved = localStorage.getItem('custom_products');
    if (saved) {
        AppState.customProducts = JSON.parse(saved);
        const maxId = Math.max(...PRODUCTS_DB.map(p => p.id), 100);
        AppState.customProducts.forEach((p, index) => {
            if (!p.id) p.id = maxId + index + 1;
            if (!PRODUCTS_DB.find(db => db.id === p.id)) {
                PRODUCTS_DB.push(p);
            }
        });
    }
}

export function saveCustomProducts() {
    localStorage.setItem('custom_products', JSON.stringify(AppState.customProducts));
}

export function addNewProduct() {
    const name = document.getElementById('newProductName').value.trim();
    const category = document.getElementById('newProductCategory').value;
    const kcal = parseFloat(document.getElementById('newProductKcal').value);
    const protein = parseFloat(document.getElementById('newProductProtein').value);
    const carbs = parseFloat(document.getElementById('newProductCarbs').value);
    const fats = parseFloat(document.getElementById('newProductFats').value);
    const customUnit = document.getElementById('newProductCustomUnit').value.trim();
    const customUnitWeight = parseFloat(document.getElementById('newProductCustomUnitWeight').value) || null;

    if (!name || isNaN(kcal) || isNaN(protein) || isNaN(carbs) || isNaN(fats)) {
        showNotification('Completa todos los campos', 'error');
        return;
    }

    const newProduct = {
        id: Date.now(),
        name: name,
        portion: 100,
        unit: 'g',
        category: category,
        kcal: kcal,
        protein: protein,
        carbs: carbs,
        fats: fats,
        customUnit: customUnit,
        customUnitWeight: customUnitWeight,
    };

    AppState.customProducts.push(newProduct);
    PRODUCTS_DB.push(newProduct);
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
    const product = PRODUCTS_DB.find(p => p.id === productId);
    if (!product) return;

    if (!confirm(`¿Eliminar "${product.name.replace(/^[^\w]+\s/, '').trim()}"?`)) return;

    const customIndex = AppState.customProducts.findIndex(p => p.id === productId);
    if (customIndex > -1) {
        AppState.customProducts.splice(customIndex, 1);
        saveCustomProducts();
    }

    const dbIndex = PRODUCTS_DB.findIndex(p => p.id === productId);
    if (dbIndex > -1) PRODUCTS_DB.splice(dbIndex, 1);

    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Producto eliminado`);
}

// Alias por compatibilidad
export function deleteCustomProduct(productId) {
    deleteProduct(productId);
}

export function editProductCustomUnit(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const cleanName = product.name.replace(/^[^\w]+\s/, '').trim();
    const currentUnit = product.customUnit || '';
    const currentWeight = product.customUnitWeight || '';

    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000;
    `;

    modal.innerHTML = `
        <div style="background: #1e293b; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 16px;">Editar Unidad Personalizada</h3>
            <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 12px;">${cleanName}</p>
            <div style="margin-bottom: 16px;">
                <label style="color: #cbd5e1; display: block; margin-bottom: 8px; font-size: 0.9rem;">Nombre de la unidad (ej: rebanada, unidad)</label>
                <input type="text" id="editCustomUnitName" placeholder="Ej: rebanada" value="${currentUnit}" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 20px;">
                <label style="color: #cbd5e1; display: block; margin-bottom: 8px; font-size: 0.9rem;">Peso en gramos (ej: 11.2)</label>
                <input type="number" id="editCustomUnitWeight" placeholder="Ej: 11.2" value="${currentWeight}" step="0.1" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex: 1; padding: 10px; background: #475569; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Cancelar</button>
                <button onclick="window.saveProductCustomUnit(${productId})" style="flex: 1; padding: 10px; background: #3B82F6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Guardar</button>
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

    product.customUnit = customUnit;
    product.customUnitWeight = customUnitWeight;

    const customProd = AppState.customProducts.find(p => p.id === productId);
    if (customProd) {
        customProd.customUnit = customUnit;
        customProd.customUnitWeight = customUnitWeight;
    }

    saveCustomProducts();
    document.querySelector('div[style*="position: fixed"]').remove();
    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Unidad personalizada actualizada`);
}

export function editProduct(productId) {
    const product = PRODUCTS_DB.find(p => p.id == productId);
    if (!product) return;

    const cleanName = product.name.replace(/^[^\w]+\s/, '').trim();

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
                <input type="text" id="editProdName" placeholder="Ej: Pollo pechuga" value="${cleanName}" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; font-size: 1rem;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div>
                    <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600;">Porción estándar</label>
                    <input type="number" id="editProdPortion" placeholder="Ej: 100" value="${product.portion}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; font-size: 1rem;">
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
                        <input type="number" id="editProdKcal" placeholder="Ej: 100" value="${product.kcal}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Proteína (g)</label>
                        <input type="number" id="editProdProtein" placeholder="Ej: 10" value="${product.protein}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Carbos (g)</label>
                        <input type="number" id="editProdCarbs" placeholder="Ej: 20" value="${product.carbs}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="color: #cbd5e1; display: block; margin-bottom: 6px; font-size: 0.85rem;">Grasas (g)</label>
                        <input type="number" id="editProdFats" placeholder="Ej: 5" value="${product.fats}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
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
                        <input type="number" id="editProdCustomUnitWeight" placeholder="Ej: 30" value="${product.customUnitWeight || ''}" step="0.1" style="width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box;">
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="flex: 1; padding: 12px; background: #475569; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancelar</button>
                <button onclick="window.saveProductEdit(${productId})" style="flex: 1; padding: 12px; background: #3B82F6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Guardar Cambios</button>
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

    if (!name || !portion || !unit || !kcal || protein === undefined || carbs === undefined || fats === undefined) {
        showNotification('Por favor completa todos los campos requeridos', 'error');
        return;
    }

    if (customUnit && !customUnitWeight) {
        showNotification('Si pones unidad personalizada, debe tener peso', 'error');
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

    const customProd = AppState.customProducts.find(p => p.id === productId);
    if (customProd) {
        customProd.name = name;
        customProd.portion = portion;
        customProd.unit = unit;
        customProd.kcal = kcal;
        customProd.protein = protein;
        customProd.carbs = carbs;
        customProd.fats = fats;
        customProd.customUnit = customUnit;
        customProd.customUnitWeight = customUnitWeight;
    }

    saveCustomProducts();
    document.querySelector('div[style*="position: fixed"]').remove();
    import('./ui/products-list.js').then(m => m.renderProductsList());
    showNotification(`Producto actualizado: ${name}`);
}
