// ==================== ESCÁNER DE CÓDIGO DE BARRAS ====================

import AppState from './state.js';
import { PRODUCTS_DB, saveCustomProducts } from './products.js';
import { showNotification } from './ui/notifications.js';

let html5QrCode = null;
let currentScanContext = 'modal'; // 'modal' o 'database'
let isScanning = false;
let activeCameraId = null;

/**
 * Abre el modal del escáner de código de barras
 * @param {'modal' | 'database'} contextMode - 'modal' para agregar a comida, 'database' para crear producto
 */
export function openBarcodeScanner(contextMode = 'modal') {
    currentScanContext = contextMode;
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
                <div style="padding: 16px 20px; border-b: 1px solid #1E293B; display: flex; align-items: center; justify-content: space-between; background: #0B1220;">
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
                        <button id="barcodeTorchBtn" onclick="window._toggleBarcodeTorch()" style="padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: none; align-items: center; gap: 4px;">
                            <span class="material-icons" style="font-size: 16px;">flashlight_on</span> Flash
                        </button>
                        <button onclick="document.getElementById('barcodeFileInput').click()" style="padding: 8px 12px; background: #1E293B; border: 1px solid #334155; color: #38BDF8; border-radius: 8px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <span class="material-icons" style="font-size: 16px;">image</span> Imagen
                        </button>
                        <input type="file" id="barcodeFileInput" accept="image/*" style="display: none;" onchange="window._onBarcodeFileSelected(event)">
                    </div>

                    <!-- Entrada manual por si falla la cámara o reflejos -->
                    <div style="border-top: 1px solid #1E293B; pt-3; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
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

    if (typeof Html5Qrcode === 'undefined') {
        if (statusMsg) {
            statusMsg.innerHTML = '⚠️ El módulo de lectura de código de barras no se ha cargado. Verifica tu conexión.';
            statusMsg.style.borderLeftColor = '#EF4444';
        }
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('barcode-video-reader');
        }

        // Obtener cámaras disponibles
        const devices = await Html5Qrcode.getCameras();
        const cameraSelect = document.getElementById('barcodeCameraSelect');

        if (devices && devices.length > 0) {
            if (cameraSelect) {
                cameraSelect.innerHTML = devices.map((d, index) => {
                    const label = d.label || `Cámara ${index + 1}`;
                    return `<option value="${d.id}">${label}</option>`;
                }).join('');
            }

            // Priorizar cámara trasera (environment / back)
            let backCamera = devices.find(d => /back|rear|environment|trasera/i.test(d.label));
            activeCameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;

            if (cameraSelect) cameraSelect.value = activeCameraId;

            await startScanningWithCamera(activeCameraId);
        } else {
            // Intentar por restricciones si getCameras no devuelve etiquetas
            await startScanningWithConstraints({ facingMode: 'environment' });
        }
    } catch (err) {
        handleCameraError(err);
    }
}

/**
 * Inicia la captura con una ID de cámara específica
 */
async function startScanningWithCamera(cameraId) {
    if (!html5QrCode) return;
    activeCameraId = cameraId;

    try {
        if (isScanning) {
            await html5QrCode.stop();
            isScanning = false;
        }

        const config = {
            fps: 12,
            qrbox: { width: 260, height: 140 },
            aspectRatio: 1.333333
        };

        await html5QrCode.start(
            cameraId,
            config,
            onBarcodeDetected,
            onBarcodeScanError
        );

        isScanning = true;
        updateStatus('📷 Cámara activa. Enfoca el código de barras.', 'info');
        checkTorchSupport();
    } catch (err) {
        handleCameraError(err);
    }
}

/**
 * Fallback para iniciar con restricciones cuando no hay ID directo
 */
async function startScanningWithConstraints(constraints) {
    if (!html5QrCode) return;

    try {
        if (isScanning) {
            await html5QrCode.stop();
            isScanning = false;
        }

        const config = {
            fps: 12,
            qrbox: { width: 260, height: 140 }
        };

        await html5QrCode.start(
            constraints,
            config,
            onBarcodeDetected,
            onBarcodeScanError
        );

        isScanning = true;
        updateStatus('📷 Cámara activa. Enfoca el código de barras.', 'info');
    } catch (err) {
        handleCameraError(err);
    }
}

/**
 * Cambia la cámara activa desde el selector
 */
async function switchCamera(cameraId) {
    if (cameraId === activeCameraId && isScanning) return;
    await startScanningWithCamera(cameraId);
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
}

/**
 * Callback ejecutado cuando se detecta un código de barras
 */
async function onBarcodeDetected(decodedText) {
    if (!decodedText) return;

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

    updateStatus(`🔍 Código detectado: <strong>${decodedText}</strong>. Buscando en Open Food Facts...`, 'loading');

    await processBarcode(decodedText.trim());
}

/**
 * Callback de error continuo por cada frame donde no se detecta código (silencioso)
 */
function onBarcodeScanError() {
    // No hacer nada para evitar llenar el log
}

/**
 * Procesa el código de barras buscándolo primero localmente y luego en Open Food Facts
 */
async function processBarcode(barcode) {
    if (!barcode) return;

    // 1. Verificar si el código ya existe en la base de datos local (PRODUCTS_DB o AppState.customProducts)
    const existingProduct = PRODUCTS_DB.find(p => p.barcode === barcode || p.id == barcode);

    if (existingProduct) {
        updateStatus(`✅ Producto encontrado en tu base de datos: <strong>${existingProduct.name}</strong>`, 'success');
        showNotification(`Producto "${existingProduct.name}" encontrado localmente`);

        setTimeout(async () => {
            await closeBarcodeScanner();
            applyProductToContext(existingProduct);
        }, 600);
        return;
    }

    // 2. Si no existe localmente, consultar Open Food Facts API
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout

        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_es,nutriments,brands,quantity,code`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }

        const data = await response.json();

        if (data && data.status === 1 && data.product) {
            const prod = data.product;
            const nut = prod.nutriments || {};

            // Extraer nombre con fallback inteligente
            let rawName = prod.product_name_es || prod.product_name || 'Producto sin nombre';
            let brand = prod.brands ? ` (${prod.brands.split(',')[0].trim()})` : '';
            let cleanName = (rawName + brand).trim();

            // Extraer macros por 100g / 100ml
            let kcal = parseFloat(nut['energy-kcal_100g'] ?? nut['energy-kcal_value'] ?? 0);
            if (!kcal && nut['energy_100g']) {
                kcal = Math.round(parseFloat(nut['energy_100g']) / 4.184);
            }
            let protein = parseFloat(nut['proteins_100g'] ?? nut['proteins_value'] ?? 0);
            let carbs = parseFloat(nut['carbohydrates_100g'] ?? nut['carbohydrates_value'] ?? 0);
            let fats = parseFloat(nut['fat_100g'] ?? nut['fat_value'] ?? 0);

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

            updateStatus(`🎉 ¡Producto encontrado!: <strong>${cleanName}</strong> (${newProduct.kcal} kcal/100g)`, 'success');
            showNotification(`Producto "${cleanName}" añadido a tu base de datos`);

            setTimeout(async () => {
                await closeBarcodeScanner();
                applyProductToContext(newProduct);
            }, 800);

        } else {
            // Producto no encontrado en Open Food Facts
            updateStatus(`⚠️ Producto no encontrado en Open Food Facts (Código: ${barcode}). Puedes crearlo manualmente abajo.`, 'warning');
            
            // Re-activar escáner por si quiere volver a intentar
            if (html5QrCode) {
                try { await html5QrCode.resume(); } catch (e) { /* ignore */ }
            }

            // Pre-rellenar formulario de nuevo producto si está en pestaña de productos
            prefillNewProductForm(barcode);
        }
    } catch (err) {
        console.error('Error al consultar Open Food Facts:', err);

        let msg = '❌ Error de conexión al consultar Open Food Facts.';
        if (err.name === 'AbortError') {
            msg = '⏱️ La consulta a Open Food Facts ha tardado demasiado (timeout).';
        }
        updateStatus(`${msg} Puedes ingresar los datos del producto manualmente.`, 'error');

        // Re-activar escáner
        if (html5QrCode) {
            try { await html5QrCode.resume(); } catch (e) { /* ignore */ }
        }
    }
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

    const errStr = String(err).toLowerCase();
    if (errStr.includes('notallowederror') || errStr.includes('permission denied')) {
        errorMsg = '🔒 Permiso de cámara denegado. Permite el acceso a la cámara en tu navegador o usa la entrada manual.';
    } else if (errStr.includes('notfounderror') || errStr.includes('devicesnotfound')) {
        errorMsg = '📷 No se encontró ninguna cámara en este dispositivo. Usa la entrada manual o sube una foto.';
    } else if (errStr.includes('notreadableerror') || errStr.includes('trackstart')) {
        errorMsg = '📹 La cámara está en uso por otra aplicación.';
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

window._searchManualBarcode = function () {
    const input = document.getElementById('manualBarcodeNumber');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) {
        showNotification('Introduce un código de barras numérico', 'error');
        return;
    }
    processBarcode(barcode);
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
