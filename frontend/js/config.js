// js/config.js - Конфігурація додатка
const APP_CONFIG = {
    // !!! ПЕРЕКОНАЙТЕСЯ, ЩО ЦЯ АДРЕСА ВКАЗУЄ НА ВАШ БЕКЕНД !!!
    API_BASE_URL: 'http://localhost:3000/api', 
    APP_NAME: 'MusicFlow',
    VERSION: '1.0.0',
    FEATURES: {
        PREMIUM: true,
        OFFLINE_MODE: false,
        SOCIAL_SHARING: true
    },
    DEFAULT_SETTINGS: {
        volume: 70,
        autoplay: false,
        quality: 'high'
    }
};

// Утиліти для роботи з localStorage
const Storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }
};

// Проста функція для сповіщень
if (typeof showNotification !== 'function') {
    function showNotification(message, type = 'info') {
        console.log(`${type.toUpperCase()}: ${message}`);
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            font-family: 'Roboto', sans-serif;
            max-width: 300px;
            transition: all 0.5s ease-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        
        if (type === 'success') {
            notification.style.background = '#1db954'; // Spotify Green
        } else if (type === 'error') {
            notification.style.background = '#e22134'; // Error Red
        } else {
            notification.style.background = '#667eea'; // Info Blue/Purple
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
        }, 3000);
        
        setTimeout(() => {
            notification.remove();
        }, 3500);
    }
}

// Immediately try to sync header/sidebar account text from cached user (fast UX on SPA swaps)
(function immediateUserSync() {
    try {
        const cached = Storage.get('currentUser');

        const runSync = () => {
            try {
                // sidebar account button text
                if (cached) {
                    const sidebarAccountText = document.getElementById('sidebarAccountText');
                    const sidebarAccountIcon = document.getElementById('sidebarAccountIcon');
                    if (sidebarAccountText && cached.username) sidebarAccountText.textContent = cached.username;

                    // If we have a username, render a small initial avatar in the sidebar
                    if (sidebarAccountIcon && cached.username) {
                        const initial = cached.username.charAt(0).toUpperCase();
                        sidebarAccountIcon.innerHTML = `<span class="sidebar-avatar-initial">${initial}</span>`;
                        const span = sidebarAccountIcon.querySelector('.sidebar-avatar-initial');
                        if (span) span.style.cssText = 'display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:6px;background:linear-gradient(135deg,#1db954,#1ed760);color:#fff;font-weight:700;';
                    }

                    // update any account-link nav items' text
                    document.querySelectorAll('.account-link, .nav-item[href*="account"], .nav-item[href*="profile"]').forEach(a => {
                        try {
                            const textSpan = a.querySelector('.nav-text') || a.querySelector('span');
                            if (textSpan && cached.username) textSpan.textContent = cached.username;
                        } catch (e) {}
                    });
                }

                // === Auto-highlight sidebar item based on current URL ===
                try {
                    const path = (window.location.pathname || '').split('/').pop().toLowerCase() || 'index.html';
                    document.querySelectorAll('.sidebar-nav .nav-item').forEach(a => {
                        try {
                            const href = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
                            if (href && path.endsWith(href)) {
                                a.classList.add('active');
                            } else {
                                a.classList.remove('active');
                            }
                        } catch (ee) {}
                    });
                } catch (e) { /* ignore */ }

            } catch (e) { /* ignore */ }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(runSync, 50));
        } else {
            setTimeout(runSync, 50);
        }

    } catch (e) { /* ignore */ }
})();