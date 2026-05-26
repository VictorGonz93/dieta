// ==================== MODO OSCURO ====================

export function loadDarkMode() {
    const darkModeEnabled = localStorage.getItem('darkModeEnabled');

    if (darkModeEnabled === null || darkModeEnabled === 'true') {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkModeEnabled', 'true');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'dark_mode';
        }
    } else {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'light_mode';
        }
    }
}

export function toggleDarkMode() {
    const isDarkMode = document.documentElement.classList.contains('dark-mode');

    if (isDarkMode) {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkModeEnabled', 'false');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'light_mode';
        }
    } else {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkModeEnabled', 'true');
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'dark_mode';
        }
    }
}
