// ==================== NOTIFICACIONES ====================

let _notificationTimeout = null;

export function showNotification(message, type = 'success', onUndo = null, undoDelay = 4000) {
    const notification = document.getElementById('notification');
    if (!notification) return;

    if (_notificationTimeout) {
        clearTimeout(_notificationTimeout);
        _notificationTimeout = null;
    }

    if (onUndo) {
        notification.innerHTML = `<span>${message}</span>`;
        const btn = document.createElement('button');
        btn.textContent = 'Deshacer';
        btn.style.cssText = 'margin-left:12px;padding:4px 10px;background:rgba(255,255,255,0.15);color:#FFF;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-weight:600;font-size:0.82rem;';
        btn.onclick = () => {
            onUndo();
            clearTimeout(_notificationTimeout);
            notification.classList.remove('show');
            _notificationTimeout = null;
        };
        notification.appendChild(btn);
    } else {
        notification.textContent = message;
    }

    notification.className = `notification show ${type}`;

    _notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
        _notificationTimeout = null;
    }, onUndo ? undoDelay : 3000);
}
