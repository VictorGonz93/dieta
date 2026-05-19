/**
 * Utils Module - Funciones auxiliares, notificaciones, helpers
 */
const Utils = {
    // Mostrar notificación
    showNotification(message, type = 'success', duration = 3000) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = `fixed bottom-4 right-4 p-4 rounded ${
            type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        } text-white`;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), duration);
    },

    // Convertir fecha a formato clave
    getDateKey(date = new Date()) {
        if (typeof date === 'string') date = new Date(date);
        return date.toISOString().split('T')[0];
    },

    // Número de día desde startDate
    getDayNumber(date = new Date()) {
        const startDate = new Date(Config.get('startDate'));
        const timeDiff = new Date(date) - startDate;
        return Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;
    },

    // Calcular macros desde cantidad y producto
    calculateMacros(product, quantity) {
        const multiplier = quantity / (product.servingSize || 100);
        return {
            calories: Math.round(product.calories * multiplier),
            protein: Math.round(product.protein * multiplier),
            carbs: Math.round(product.carbs * multiplier),
            fats: Math.round(product.fats * multiplier)
        };
    },

    // Formatear número
    formatNumber(num) {
        return Math.round(num).toLocaleString();
    },

    // Validar email (si lo necesitas)
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Debounce function
    debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    },

    // Exportar archivo
    downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
};
