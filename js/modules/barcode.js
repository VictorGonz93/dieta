// ==================== ESCÁNER DE CÓDIGO DE BARRAS ====================

import AppState from './state.js';
import { escapeHTML } from './utils.js';
import { PRODUCTS_DB, saveCustomProducts } from './products.js';
import { showNotification } from './ui/notifications.js';

let html5QrCode = null;
let currentScanContext = 'modal'; // 'modal' o 'database'
let isScanning = false;
let activeCameraId = null;
let scanSession = 0;
let isProcessingBarcode = false;

/**
 * Abre el modal del escáner de código de barras
 * @param {'modal' | 'database'} contextMode - 'modal' para agregar a comida, 'database' para crear producto
 */
export function openBarcodeScanner(contextMode = 'modal') {
    currentScanContext = contextMode;
    scanSession += 1;
    ensureScannerModalDOM();

    const overlay = document.getElementById('barcodeScannerOverlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Iniciar escáner tras animación/render
    setTimeout(() => {
        initCameraStream();
    }, 100);
}

/**
 * Cierra el modal y detiene la cámara limpiando todos los recursos
 */
export async function closeBarcodeScanner() {
    scanSession += 1;
    const overlay = document.getElementById('barcodeScannerOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    document.body.style.overflow = '';

    await stopCameraStream();
}

/**
 * Garantiza que el modal del escáner exista en el DOM con estilos responsive
 */
function ensureScannerModalDOM() {
    if (document.getElementById('barcodeScannerOverlay')) return;

    const modalHTML = `
        <div id="barcodeScannerOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(6, 9, 15, 0.88); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 10000; padding: 12px; box-sizing: border-box;">
            <div style="background: #0F172A; border: 1px solid #1E293B; border-radius: 16px; width: 100%; max-width: 480px; max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);">
                
                <!-- Header -->
                <div style="padding: 16px 20px; border-bottom: 1px solid #1E293B; display: flex; align-items: center; justify-content: space-between; background: #0B1220;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-icons" style="color: #10B981; font-size: 22px;">qr_code_scanner</span>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: #F8FAFC;">Escanear Código</h3>
                    </div>
                    <button onclick="closeBarcodeScanner()" style="background: transparent; border: none; color: #94A3B8; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center;" title="Cerrar">
                        <span class="material-icons" style="font-size: 22px;">close</span>
                    </button>
                </div>

                <!-- Contenido Principal -->
                <div style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;">
                    
                    <!-- Contenedor de Video de Cámara -->
                    <div style="position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000; min-height: 250px; border: 1px solid #334155; display: flex; align-items: center; justify-content: center;">
                        <div id="barcode-video-reader" style="width: 100%;"></div>
                        <div id="barcodeScanFrame" style="position: absolute; pointer-events: none; border: 2px solid rgba(16, 185, 129, 0.7); border-radius: 8px; width: 80%; height: 160px; box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center;">
                            <div style="width: 100%; height: 2px; background: #10B981; animation: scanLine 2s infinite ease-in-out;"></div>
                        </div>
                    </div>

                    <!-- Mensaje de estado / feedback -->
                    <div id="barcodeStatusMsg" style="padding: 10px 14px; background: #1E293B; border-radius: 8px; color: #CBD5E1; font-size: 0.85rem; text-align: center; border-left: 3px solid #3B82F6; line-height: 1.4;">
                        Apunta con la cámara al código de barras del producto
                    </div>

                    <!-- Controles de Cámara (Selector + Linterna + Archivo) -->
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                        <select id="barcodeCameraSelect" style="flex: 1; min-width: 140px; padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; outline: none;">
                            <option value="">Cargando cámaras...</option>
                        </select>
                        <button onclick="window._retryBarcodeCamera()" style="padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Reiniciar la cámara">
                            <span class="material-icons" style="font-size: 16px;">videocam</span> Reintentar
                        </button>
                        <button id="barcodeTorchBtn" onclick="window._toggleBarcodeTorch()" style="padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: none; align-items: center; gap: 4px;">
                            <span class="material-icons" style="font-size: 16px;">flashlight_on</span> Flash
                        </button>
                        <button onclick="document.getElementById('barcodeFileInput').click()" style="padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #38BDF8; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <span class="material-icons" style="font-size: 16px;">image</span> Imagen
                        </button>
                        <input type="file" id="barcodeFileInput" accept="image/*" style="display: none;" onchange="window._onBarcodeFileSelected(event)">
                    </div>

                    <!-- Entrada manual por si falla la cámara o reflejos -->
                    <div style="border-top: 1px solid #1E293B; padding-top: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                        <span style="font-size: 0.75rem; color: #94A3B8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">¿Problemas con la cámara? Entrada manual</span>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="manualBarcodeNumber" placeholder="Escribe el código (ej: 8480000123456)" style="flex: 1; padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; outline: none;">
                            <button onclick="window._searchManualBarcode()" style="padding: 8px 16px; background: #10B981; color: #FFF; border: none; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer;">Buscar</button>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <style>
            @keyframes scanLine {
                0% { transform: translateY(-70px); opacity: 0.3; }
                50% { transform: translateY(70px); opacity: 1; }
                100% { transform: translateY(-70px); opacity: 0.3; }
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Listener para cambiar de cámara cuando el usuario selecciona otra
    const cameraSelect = document.getElementById('barcodeCameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                switchCamera(e.target.value);
            }
        });
    }
}

/**
 * Inicializa el flujo de la cámara con Html5Qrcode
 */
async function initCameraStream() {
    const statusMsg = document.getElementById('barcodeStatusMsg');
    if (statusMsg) statusMsg.innerHTML = '⌛ Solicitando permiso de cámara...';

    if (!window.isSecureContext) {
        updateStatus('🔒 La cámara requiere HTTPS. Abre la app desde https:// o localhost.', 'error');
        return;
    }

    if (typeof Html5Qrcode === 'undefined') {
        updateStatus('⚠️ No se pudo cargar el lector local de códigos. Recarga la página.', 'error');
        return;
    }

    const session = scanSession;
    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('barcode-video-reader');
        }

        // Obtener cámaras disponibles
        const devices = await Html5Qrcode.getCameras();
        if (session !== scanSession) return;
        const cameraSelect = document.getElementById('barcodeCameraSelect');

        if (devices && devices.length > 0) {
            if (cameraSelect) {
                cameraSelect.innerHTML = devices.map((d, index) => {
                    const label = d.label || `Cámara ${index + 1}`;
                    return `<option value="${escapeHTML(d.id)}">${escapeHTML(label)}</option>`;
                }).join('');
            }

            // Priorizar la cámara trasera, pero probar el resto si la primera
            // falla (cámara ocupada, permiso o dispositivo virtual).
            const backCamera = devices.find(d => /back|rear|environment|trasera/i.test(d.label));
            const ordered = [];
            if (backCamera) ordered.push(backCamera);
            devices.forEach(device => {
                if (!ordered.some(item => item.id === device.id)) ordered.push(device);
            });

            if (cameraSelect && ordered[0]) cameraSelect.value = ordered[0].id;

            for (const device of ordered) {
                if (session !== scanSession) return;
                await startScanningWithCamera(device.id);
                if (session !== scanSession) {
                    await stopCameraStream();
                    return;
                }
                if (isScanning) {
                    if (cameraSelect) cameraSelect.value = device.id;
                    return;
                }
            }

            // Último recurso: restricción environment sin ID concreto.
            await startScanningWithConstraints({ facingMode: 'environment' });
            if (session !== scanSession) {
                await stopCameraStream();
            }
        } else {
            // Intentar por restricciones si getCameras no devuelve etiquetas
            await startScanningWithConstraints({ facingMode: 'environment' });
            if (session !== scanSession) {
                await stopCameraStream();
            }
        }
    } catch (err) {
        if (session === scanSession) handleCameraError(err);
    }
}

/**
 * Inicia la captura con una ID de cámara específica
 */
async function startScanningWithCamera(cameraId) {
    const scanner = html5QrCode;
    if (!scanner) return;
    const session = scanSession;
    activeCameraId = cameraId;

    try {
        if (isScanning) {
            await scanner.stop();
            isScanning = false;
        }
        if (session !== scanSession) return;

        const config = {
            fps: 12,
            qrbox: { width: 260, height: 140 },
            aspectRatio: 1.333333
        };

        await scanner.start(
            cameraId,
            config,
            onBarcodeDetected,
            onBarcodeScanError
        );

        if (session !== scanSession) {
            try { await scanner.stop(); } catch (_) { /* ignore */ }
            isScanning = false;
            return;
        }

        isScanning = true;
        updateStatus('📷 Cámara activa. Enfoca el código de barras.', 'info');
        checkTorchSupport();
    } catch (err) {
        if (session === scanSession) handleCameraError(err);
    }
}

/**
 * Fallback para iniciar con restricciones cuando no hay ID directo
 */
async function startScanningWithConstraints(constraints) {
    const scanner = html5QrCode;
    if (!scanner) return;
    const session = scanSession;

    try {
        if (isScanning) {
            await scanner.stop();
            isScanning = false;
        }
        if (session !== scanSession) return;

        const config = {
            fps: 12,
            qrbox: { width: 260, height: 140 }
        };

        await scanner.start(
            constraints,
            config,
            onBarcodeDetected,
            onBarcodeScanError
        );

        if (session !== scanSession) {
            try { await scanner.stop(); } catch (_) { /* ignore */ }
            isScanning = false;
            return;
        }

        isScanning = true;
        updateStatus('📷 Cámara activa. Enfoca el código de barras.', 'info');
        checkTorchSupport();
    } catch (err) {
        if (session === scanSession) handleCameraError(err);
    }
}

/**
 * Cambia la cámara activa desde el selector
 */
async function switchCamera(cameraId) {
    if (cameraId === activeCameraId && isScanning) return;
    await startScanningWithCamera(cameraId);
    if (!isScanning) {
        await startScanningWithConstraints({ facingMode: 'environment' });
    }
}

/**
 * Detiene la cámara de forma segura
 */
async function stopCameraStream() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
        } catch (e) {
            console.debug('Error deteniendo escáner:', e);
        }
    }
    isScanning = false;
    html5QrCode = null;
}

/**
 * Callback ejecutado cuando se detecta un código de barras
 */
async function onBarcodeDetected(decodedText) {
    if (!decodedText) return;
    const overlay = document.getElementById('barcodeScannerOverlay');
    if (!overlay || overlay.style.display === 'none') return;
    const session = scanSession;

    // Pausar o detener para no disparar múltiples llamadas
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.pause(true);
        } catch (e) { /* ignore */ }
    }

    // Vibración suave de confirmación
    if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch (e) { /* ignore */ }
    }

    updateStatus(`🔍 Código detectado: <strong>${escapeHTML(decodedText)}</strong>. Buscando en Open Food Facts...`, 'loading');

    await processBarcode(decodedText.trim(), session);
}

/**
 * Callback de error continuo por cada frame donde no se detecta código (silencioso)
 */
function onBarcodeScanError() {
    // No hacer nada para evitar llenar el log
}

async function fetchOpenFoodFactsProduct(barcode) {
    const fields = 'product_name,product_name_es,nutriments,brands,quantity,code';
    const endpoints = [
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    ];
    let lastError = null;
    let notFound = false;

    for (const url of endpoints) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (response.status === 429) {
                lastError = new Error('rate_limit');
                continue;
            }
            if (!response.ok) {
                lastError = new Error(`http_${response.status}`);
                continue;
            }
            const data = await response.json();
            if (data && data.status === 1 && data.product) return data.product;
            if (data && data.status === 0) {
                notFound = true;
                continue;
            }
            lastError = new Error('invalid_response');
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    if (notFound) return null;
    throw lastError || new Error('openfoodfacts_unavailable');
}

async function processBarcode(barcode, session = scanSession) {
    if (!barcode || isProcessingBarcode) return;
    isProcessingBarcode = true;
    try {
        await _processBarcode(barcode, session);
    } finally {
        isProcessingBarcode = false;
    }
}

/**
 * Procesa el código de barras buscándolo primero localmente y luego en Open Food Facts
 */
async function _processBarcode(barcode, session = scanSession) {
    if (!barcode) return;

    // 1. Verificar si el código ya existe en la base de datos local (PRODUCTS_DB o AppState.customProducts)
    const existingProduct = PRODUCTS_DB.find(p => p.barcode === barcode || p.id == barcode);

    if (existingProduct) {
        updateStatus(`✅ Producto encontrado en tu base de datos: <strong>${escapeHTML(existingProduct.name)}</strong>`, 'success');
        showNotification(`Producto "${existingProduct.name}" encontrado localmente`);

        setTimeout(async () => {
            if (session !== scanSession) return;
            await closeBarcodeScanner();
            applyProductToContext(existingProduct);
        }, 600);
        return;
    }

    // 2. Si no existe localmente, consultar Open Food Facts (v2 y fallback v0)
    let prod;
    try {
        prod = await fetchOpenFoodFactsProduct(barcode);
    } catch (err) {
        if (session !== scanSession) return;
        console.error('Error al consultar Open Food Facts:', err);
        const message = err && err.message === 'rate_limit'
            ? '⏳ Open Food Facts está limitando las consultas. Espera un momento o introduce el producto manualmente.'
            : err && err.name === 'AbortError'
                ? '⏱️ La consulta a Open Food Facts ha tardado demasiado. Introduce el producto manualmente.'
                : err && /^http_5/.test(err.message)
                    ? '⚠️ Open Food Facts no está disponible ahora mismo. Inténtalo más tarde o introduce el producto manualmente.'
                    : '❌ No se pudo conectar con Open Food Facts. Revisa tu conexión o introduce el producto manualmente.';
        updateStatus(message, 'error');
        if (html5QrCode) {
            try { await html5QrCode.resume(); } catch (e) { /* ignore */ }
        }
        return;
    }

    if (session !== scanSession) return;

    if (!prod) {
        updateStatus(`⚠️ Producto no encontrado en Open Food Facts (Código: ${escapeHTML(barcode)}). Puedes crearlo manualmente abajo.`, 'warning');
        if (html5QrCode) {
            try { await html5QrCode.resume(); } catch (e) { /* ignore */ }
        }
        prefillNewProductForm(barcode);
        return;
    }

    const nut = prod.nutriments || {};

    // Extraer nombre con fallback inteligente
    const rawName = prod.product_name_es || prod.product_name || 'Producto sin nombre';
    const brand = prod.brands ? ` (${prod.brands.split(',')[0].trim()})` : '';
    const cleanName = (rawName + brand).trim();

    // Extraer macros por 100g / 100ml
    let kcal = parseFloat(nut['energy-kcal_100g'] ?? nut['energy-kcal_value'] ?? 0);
    if (!kcal && nut['energy_100g']) {
        kcal = Math.round(parseFloat(nut['energy_100g']) / 4.184);
    }
    const protein = parseFloat(nut['proteins_100g'] ?? nut['proteins_value'] ?? 0);
    const carbs = parseFloat(nut['carbohydrates_100g'] ?? nut['carbohydrates_value'] ?? 0);
    const fats = parseFloat(nut['fat_100g'] ?? nut['fat_value'] ?? 0);

    // Inferir categoría
    const category = inferCategory(cleanName, protein, carbs, fats);

    // Crear objeto de producto compatible
    const newProduct = {
        id: Date.now(),
        barcode: barcode,
        name: cleanName,
        portion: 100,
        unit: 'g',
        category: category,
        kcal: Math.round(kcal * 10) / 10,
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fats: Math.round(fats * 10) / 10,
        customUnit: '',
        customUnitWeight: null,
    };

    // Guardar en productos personalizados y en base de datos global
    AppState.customProducts.push(newProduct);
    PRODUCTS_DB.push(newProduct);
    saveCustomProducts();

    // Actualizar lista de productos en la UI si está presente
    import('./ui/products-list.js').then(m => m.renderProductsList());

    updateStatus(`🎉 ¡Producto encontrado!: <strong>${escapeHTML(cleanName)}</strong> (${newProduct.kcal} kcal/100g)`, 'success');
    showNotification(`Producto "${cleanName}" añadido a tu base de datos`);

    setTimeout(async () => {
        if (session !== scanSession) return;
        await closeBarcodeScanner();
        applyProductToContext(newProduct);
    }, 800);
}

/**
 * Aplica el producto obtenido al contexto actual (Modal de comida o Pestaña de productos)
 */
async function applyProductToContext(product) {
    if (currentScanContext === 'modal') {
        const { selectProduct } = await import('./ui/modal.js');
        selectProduct(product.id);
    } else if (currentScanContext === 'database') {
        // En pestaña de productos, abrir modal de edición o destacar en la lista
        const { editProduct } = await import('./products.js');
        editProduct(product.id);
    }
}

/**
 * Infiere la categoría según el nombre y composición de macros
 */
function inferCategory(name, protein, carbs, fats) {
    const lowerName = name.toLowerCase();
    if (/leche|zumo|jugo|agua|refresco|bebida|café|té|yogur bebible|smoothie|kombucha/i.test(lowerName)) {
        return 'bebidas';
    }
    if (/proteina|whey|creatina|suplement|multivitam|omega/i.test(lowerName)) {
        return 'suplementos';
    }
    if (protein >= 12 || /pollo|pavo|atún|huevo|carne|lomo|jamón|salmón|pescado|queso|requesón|tofu/i.test(lowerName)) {
        return 'proteinas';
    }
    if (carbs >= 15 || /arroz|pan|patata|pasta|avena|galleta|cereal|harina|fruta|plátano|manzana/i.test(lowerName)) {
        return 'carbos';
    }
    return 'carbos';
}

/**
 * Rellena parcialmente el formulario de nuevo producto si no se encontró en Open Food Facts
 */
function prefillNewProductForm(barcode) {
    const nameInput = document.getElementById('newProductName');
    if (nameInput && !nameInput.value) {
        nameInput.value = `Producto ${barcode}`;
        nameInput.focus();
    }
}

/**
 * Maneja los errores de permiso/dispositivo de la cámara
 */
function handleCameraError(err) {
    console.warn('Error de cámara en escáner:', err);
    let errorMsg = '⚠️ Ocurrió un error al iniciar la cámara.';

    const errStr = `${(err && err.name) || ''} ${String(err || '')}`.toLowerCase();
    if (errStr.includes('notallowederror') || errStr.includes('permission denied')) {
        errorMsg = '🔒 Permiso de cámara denegado. Permite el acceso a la cámara en tu navegador o usa la entrada manual.';
    } else if (errStr.includes('notfounderror') || errStr.includes('devicesnotfound')) {
        errorMsg = '📷 No se encontró ninguna cámara en este dispositivo. Usa la entrada manual o sube una foto.';
    } else if (errStr.includes('notreadableerror') || errStr.includes('trackstart')) {
        errorMsg = '📹 La cámara está en uso por otra aplicación.';
    } else if (errStr.includes('securityerror') || errStr.includes('secure context')) {
        errorMsg = '🔒 La cámara requiere HTTPS. Abre la app desde https:// o localhost.';
    } else if (errStr.includes('notsupportederror') || errStr.includes('not supported')) {
        errorMsg = '📷 Este navegador no soporta el acceso a la cámara. Usa la entrada manual o sube una foto.';
    } else if (errStr.includes('overconstrainederror') || errStr.includes('constraint')) {
        errorMsg = '📷 No se encontró una cámara compatible. Prueba otra cámara o usa la entrada manual.';
    }

    updateStatus(errorMsg, 'error');
}

/**
 * Actualiza el texto y color del mensaje de estado del modal
 */
function updateStatus(htmlMessage, type = 'info') {
    const statusMsg = document.getElementById('barcodeStatusMsg');
    if (!statusMsg) return;

    statusMsg.innerHTML = htmlMessage;

    const colors = {
        info: { bg: '#1E293B', border: '#3B82F6', text: '#CBD5E1' },
        loading: { bg: '#1E293B', border: '#F59E0B', text: '#FDE68A' },
        success: { bg: '#064E3B', border: '#10B981', text: '#D1FAE5' },
        warning: { bg: '#451A03', border: '#F59E0B', text: '#FEF3C7' },
        error: { bg: '#451212', border: '#EF4444', text: '#FEE2E2' },
    };

    const style = colors[type] || colors.info;
    statusMsg.style.background = style.bg;
    statusMsg.style.borderLeftColor = style.border;
    statusMsg.style.color = style.text;
}

/**
 * Comprueba si la linterna es soportada por la cámara activa
 */
async function checkTorchSupport() {
    const torchBtn = document.getElementById('barcodeTorchBtn');
    if (!torchBtn || !html5QrCode) return;

    try {
        // html5QrCode no expone directamente torch en todas las versiones, revisamos si la pista de video soporta torch
        const capabilities = html5QrCode.getRunningTrackCapabilities?.();
        if (capabilities && capabilities.torch) {
            torchBtn.style.display = 'inline-flex';
        } else {
            torchBtn.style.display = 'none';
        }
    } catch (e) {
        torchBtn.style.display = 'none';
    }
}

// ==================== FUNCIONES EXPUESTAS A WINDOW PARA ONCLICK ====================

window.openBarcodeScanner = openBarcodeScanner;
window.closeBarcodeScanner = closeBarcodeScanner;

window._retryBarcodeCamera = async function () {
    scanSession += 1;
    updateStatus('🔄 Reiniciando cámara…', 'loading');
    await stopCameraStream();
    await initCameraStream();
};

window._searchManualBarcode = function () {
    const input = document.getElementById('manualBarcodeNumber');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) {
        showNotification('Introduce un código de barras numérico', 'error');
        return;
    }
    processBarcode(barcode, scanSession);
};

window._onBarcodeFileSelected = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    updateStatus('📷 Procesando foto del código de barras...', 'loading');

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('barcode-video-reader');
        }
        const decodedText = await html5QrCode.scanFile(file, true);
        if (decodedText) {
            onBarcodeDetected(decodedText.trim());
        } else {
            updateStatus('⚠️ No se detectó código de barras claro en la imagen. Intenta con otra foto.', 'warning');
        }
    } catch (err) {
        updateStatus('⚠️ No se pudo leer código de barras en la imagen seleccionada.', 'warning');
    }
};

window._toggleBarcodeTorch = async function () {
    // Si la linterna está soportada
    try {
        const capabilities = html5QrCode?.getRunningTrackCapabilities?.();
        if (capabilities?.torch) {
            const currentSetting = html5QrCode.getRunningTrackSettings?.()?.torch;
            await html5QrCode.applyVideoConstraints({
                advanced: [{ torch: !currentSetting }]
            });
        }
    } catch (e) {
        console.warn('Error alternando linterna:', e);
    }
};
