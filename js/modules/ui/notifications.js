// ==================== NOTIFICACIONES ====================

let _notificationTimeout = null;

export function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;

    if (_notificationTimeout) {
        clearTimeout(_notificationTimeout);
        _notificationTimeout = null;
    }

    notification.textContent = message;
    notification.className = `notification show ${type}`;

    _notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
        _notificationTimeout = null;
    }, 3000);
}
