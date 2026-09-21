// ==================== MÓDULO DE ACTUALIZACIÓN ====================

import AppState from '../state.js';
import { CURRENT_APP_VERSION } from '../constants.js';

let updateCheckInterval = null;

export function startUpdateChecker() {
    checkForUpdates();
    updateCheckInterval = setInterval(checkForUpdates, 5 * 60 * 1000);
    console.log('🔄 Update checker iniciado (cada 5 minutos)');
}

export function stopUpdateChecker() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
    }
}

export async function checkForUpdates() {
    // Si acabamos de actualizar (flag en sessionStorage), sincronizar versión y no mostrar modal
    if (sessionStorage.getItem('justUpdated')) {
        sessionStorage.removeItem('justUpdated');
        try {
            const r = await fetch('sw.js?_t=' + Date.now(), { cache: 'no-store' });
            const txt = await r.text();
            const m = txt.match(/const\s+CACHE_VERSION\s*=\s*(\d+)/);
            if (m) localStorage.setItem('appInstalledVersion', m[1]);
        } catch (e) { /* sin conexión, no importa */ }
        return;
    }

    try {
        const response = await fetch('sw.js?_t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch sw.js');

        const swContent = await response.text();
        const versionMatch = swContent.match(/const\s+CACHE_VERSION\s*=\s*(\d+)/);
        if (!versionMatch) {
            console.warn('No se pudo extraer CACHE_VERSION');
            return;
        }

        const remoteVersion = parseInt(versionMatch[1]);
        const storedInstalled = parseInt(localStorage.getItem('appInstalledVersion'));
        // Valor corrupto (NaN) = caer a la versión compilada, nunca bloquear updates
        const installedVersion = Number.isFinite(storedInstalled) ? storedInstalled : CURRENT_APP_VERSION;
        if (!Number.isFinite(remoteVersion)) {
            console.warn('CACHE_VERSION remoto no numérico');
            return;
        }

        if (remoteVersion > installedVersion) {
            console.log(`📦 Nueva versión detectada: ${remoteVersion} (instalada: ${installedVersion})`);
            AppState.latestRemoteVersion = remoteVersion;
            // Snooze por versión: si el usuario cerró el aviso para ESTA versión, no insistir
            const dismissed = parseInt(localStorage.getItem('updateDismissedVersion'));
            if (dismissed === remoteVersion) return;
            if (!document.getElementById('updateModal')) {
                showUpdateAvailableModal(remoteVersion);
            }
        }
    } catch (error) {
        console.debug('Update check falló (probablemente sin conexión):', error.message);
    }
}

export function showUpdateAvailableModal(remoteVersion = null) {
    if (document.getElementById('updateModal')) return;

    const modal = document.createElement('div');
    modal.id = 'updateModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex;
        align-items: center; justify-content: center; z-index: 9999;
    `;

    const versionInfo = remoteVersion ? `(v${remoteVersion})` : '';

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); animation: slideUp 0.3s ease-out;">
            <div style="text-align: center; margin-bottom: 16px;">
                <div style="font-size: 14px; color: var(--primary); font-weight:600; letter-spacing:.05em; text-transform:uppercase; margin-bottom: 8px;">Actualización disponible</div>
                <h2 style="margin: 0; font-size: 20px; color: #1a202c; font-weight: 600;">
                    Nueva versión disponible ${versionInfo}
                </h2>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button id="updateModalCancel" style="flex: 1; padding: 10px 16px; border: 1px solid #cbd5e0; border-radius: 8px; background: white; color: #4a5568; font-weight: 500; cursor: pointer;">
                    Cerrar
                </button>
                <button id="updateModalConfirm" style="flex: 1; padding: 10px 16px; border: none; border-radius: 8px; background: var(--primary); color: white; font-weight: 600; cursor: pointer;">
                    Actualizar
                </button>
            </div>
            <div style="font-size: 12px; color: #a0aec0; margin-top: 16px; text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                Tus datos se preservan. Sin perder nada.
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('updateModalCancel').addEventListener('click', () => {
        // Recordar el descarte para no re-preguntar cada 5 min (una versión nueva sí avisará)
        try {
            const v = remoteVersion || AppState.latestRemoteVersion;
            if (v) localStorage.setItem('updateDismissedVersion', String(v));
        } catch (_) { /* ignore */ }
        modal.remove();
    });
    document.getElementById('updateModalConfirm').addEventListener('click', () => performUpdate(remoteVersion));
}

export function performUpdate(version) {
    console.log('🔄 Iniciando actualización...');

    // Sin red, borrar cachés + desregistrar SW dejaría la app colgada: abortar
    if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
        import('./notifications.js').then(m =>
            m.showNotification('Sin conexión: reconecta para actualizar', 'warning')).catch(() => {});
        return;
    }

    // Marcar en sessionStorage para que el próximo checkForUpdates no muestre modal
    sessionStorage.setItem('justUpdated', '1');

    // Cerrar el modal antes de recargar
    const modal = document.getElementById('updateModal');
    if (modal) modal.remove();

    // Guardar la versión usando el argumento, con AppState como fallback
    const versionToSave = version || AppState.latestRemoteVersion;
    if (versionToSave) {
        localStorage.setItem('appInstalledVersion', String(versionToSave));
        console.log(`Guardada versión ${versionToSave} en localStorage`);
    }

    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => caches.delete(cacheName));
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(r => r.unregister());
        });
    }

    setTimeout(() => {
        // Usar una URL con cache-buster para forzar al navegador a NO usar su caché HTTP.
        // window.location.reload() puede servir recursos cacheados aunque el SW esté desregistrado.
        const base = window.location.pathname;
        window.location.replace(base + '?_r=' + Date.now());
    }, 800);
}
