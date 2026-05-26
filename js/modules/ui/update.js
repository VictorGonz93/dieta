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
    try {
        const response = await fetch('sw.js?_t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch sw.js');

        const swContent = await response.text();
        const versionMatch = swContent.match(/const\s+CACHE_VERSION\s*=\s*(\d+)/);
        if (!versionMatch) {
            console.warn('⚠️ No se pudo extraer CACHE_VERSION');
            return;
        }

        const remoteVersion = parseInt(versionMatch[1]);
        const installedVersion = parseInt(localStorage.getItem('appInstalledVersion') || CURRENT_APP_VERSION);

        if (remoteVersion > installedVersion) {
            console.log(`📦 Nueva versión detectada: ${remoteVersion} (instalada: ${installedVersion})`);
            AppState.latestRemoteVersion = remoteVersion;
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
                <div style="font-size: 48px; margin-bottom: 12px;">📦</div>
                <h2 style="margin: 0; font-size: 20px; color: #1a202c; font-weight: 600;">
                    Nueva versión disponible ${versionInfo}
                </h2>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button id="updateModalCancel" style="flex: 1; padding: 10px 16px; border: 1px solid #cbd5e0; border-radius: 8px; background: white; color: #4a5568; font-weight: 500; cursor: pointer;">
                    Cerrar
                </button>
                <button id="updateModalConfirm" style="flex: 1; padding: 10px 16px; border: none; border-radius: 8px; background: #48bb78; color: white; font-weight: 600; cursor: pointer;">
                    ✨ Actualizar
                </button>
            </div>
            <div style="font-size: 12px; color: #a0aec0; margin-top: 16px; text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                Tus datos se preservan. Sin perder nada.
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('updateModalCancel').addEventListener('click', () => modal.remove());
    document.getElementById('updateModalConfirm').addEventListener('click', () => performUpdate());
}

export function performUpdate() {
    console.log('🔄 Iniciando actualización...');

    if (AppState.latestRemoteVersion) {
        localStorage.setItem('appInstalledVersion', AppState.latestRemoteVersion);
        console.log(`✅ Guardada versión ${AppState.latestRemoteVersion} en localStorage`);
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
        window.location.reload();
    }, 500);
}
