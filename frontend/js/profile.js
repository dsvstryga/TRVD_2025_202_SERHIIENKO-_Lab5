// js/profile.js - ОНОВЛЕНИЙ менеджер профілю
class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.isInitialized = false;
    }

    async init(force = false) {
        // Allow forcing re-initialization after SPA content swaps
        if (this.isInitialized && !force) return;

        console.log('👤 ProfileManager initializing' + (force ? ' (forced)' : '') + '...');
        
        // If DOM still loading, wait, otherwise initialize immediately
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeProfile());
        } else {
            await this.initializeProfile();
        }
    }

    async initializeProfile() {
        try {
            // Перевіряємо авторизацію
            if (!API.isAuthenticated()) {
                console.log('❌ User not authenticated, showing not authorized state');
                this.showNotAuthorized();
                return;
            }

            // Immediately populate UI from cached data so SPA swaps are responsive
            try {
                const cached = API.getCurrentUser();
                if (cached) {
                    this.currentUser = cached;
                    try { this.updateProfileUI(); } catch (e) { console.debug('updateProfileUI (cached) failed', e); }
                }
            } catch (e) { /* ignore */ }

            // Then attempt to fetch fresh profile data from the server and update UI again
            try {
                await this.loadProfileData();
                this.updateProfileUI();
            } catch (e) {
                console.debug('Could not refresh profile from API, keeping cached UI', e);
            }
            
            // Налаштовуємо обробники подій
            this.setupEventListeners();
            
            console.log('✅ ProfileManager initialized successfully');
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ ProfileManager initialization failed:', error);
            this.showNotAuthorized();
        }
    }

    async loadProfileData() {
        console.log('📡 Fetching profile data...');
        
        try {
            // Спочатку пробуємо отримати свіжі дані з API
            const profileData = await API.getProfile();
            console.log('✅ Profile data received:', profileData);
            
            this.currentUser = profileData.data || API.getCurrentUser();
            
        } catch (error) {
            console.error('❌ Error loading profile from API:', error);
            // Використовуємо кешовані дані як запасний варіант
            this.currentUser = API.getCurrentUser();
            
            if (!this.currentUser) {
                throw new Error('No user data available');
            }
            
            console.log('🔄 Using cached user data:', this.currentUser);
        }
    }

    updateProfileUI() {
        if (!this.currentUser) {
            console.log('❌ No user data available for UI update');
            return;
        }

        console.log('🎯 Updating UI with user data:', this.currentUser);

        // Оновлюємо всі секції профілю
        this.updateBasicInfo();
        this.updateRoleAndId();
        this.updateBadge();
        this.updateAvatars();
        this.updateProfileStats();
        this.updateAdminElements();
        
        console.log('✅ Profile UI updated successfully');
    }

    updateBasicInfo() {
        const elements = {
            'profileTitle': `Вітаємо, ${this.currentUser.username}!`,
            'profileDescription': 'Ваш профіль MusicFlow',
            'profileUsername': this.currentUser.username,
            'profileEmail': this.currentUser.email || 'Не вказано',
            'profile-display-username': `Ласкаво просимо, ${this.currentUser.username}!`,
            'profile-username': this.currentUser.username,
            'profile-email': this.currentUser.email || 'Не вказано'
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
                console.log(`✅ Updated ${id}: ${text}`);
            }
        });
    }

    updateRoleAndId() {
        const profileRole = document.getElementById('profileRole');
        const profileId = document.getElementById('profileId');
        const profileRoleBadge = document.getElementById('profile-role-badge');
        const profileRoleText = document.getElementById('profile-role');

        const roleDisplayName = this.getRoleDisplayName(this.currentUser.role);
        const isAdminOrModerator = this.currentUser.role === 'admin' || this.currentUser.role === 'moderator';

        // Оновлюємо роль
        if (profileRole) {
            profileRole.textContent = roleDisplayName;
            profileRole.className = `role-badge role-${this.currentUser.role}`;
        }

        if (profileRoleBadge) {
            profileRoleBadge.textContent = roleDisplayName.toUpperCase();
        }

        if (profileRoleText) {
            profileRoleText.textContent = roleDisplayName;
        }

        // Оновлюємо ID
        if (profileId) {
            profileId.textContent = isAdminOrModerator ? (this.currentUser.id || 'Невідомо') : 'Приховано';
        }
    }

    updateBadge() {
        const badge = document.getElementById('profileBadge');
        if (!badge) return;

        let badgeContent = '';
        let badgeColor = '#1db954';
        let badgeClass = 'user-badge';

        switch(this.currentUser.role) {
            case 'admin':
                badgeContent = '<i class="fas fa-shield-alt"></i><span>Адміністратор</span>';
                badgeColor = '#e22134';
                badgeClass = 'admin-badge';
                break;
            case 'moderator':
                badgeContent = '<i class="fas fa-user-shield"></i><span>Модератор</span>';
                badgeColor = '#667eea';
                badgeClass = 'moderator-badge';
                break;
            default:
                badgeContent = `<i class="fas fa-user-check"></i><span>${this.currentUser.username}</span>`;
                badgeClass = 'user-badge';
        }

        badge.innerHTML = badgeContent;
        badge.style.background = badgeColor;
        badge.className = badgeClass;
    }

    updateAvatars() {
        const headerAvatar = document.getElementById('headerAvatar');
        const profileAvatar = document.getElementById('profileAvatar');
        const initial = this.currentUser.username ? this.currentUser.username.charAt(0).toUpperCase() : '?';

        if (headerAvatar) {
            headerAvatar.textContent = initial;
            headerAvatar.style.background = 'linear-gradient(135deg, #1db954, #1ed760)';
        }

        if (profileAvatar) {
            profileAvatar.textContent = initial;
        }
    }

    updateProfileStats() {
        // Тимчасові дані для демонстрації
        const stats = {
            'tracksCount': '156',
            'likedCount': '89',
            'timeCount': '42h',
            'profile-last-login': new Date().toLocaleDateString('uk-UA')
        };

        Object.entries(stats).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    updateAdminElements() {
        this.updateAdminButton();
        this.updateAdminPanel();
    }

    updateAdminButton() {
        const adminBtn = document.getElementById('adminPanelBtn');
        const adminLink = document.querySelector('.admin-link');

        if (adminBtn) {
            if (this.currentUser.role === 'admin') {
                adminBtn.style.display = 'flex';
                console.log('✅ Admin button shown');
            } else {
                adminBtn.style.display = 'none';
                console.log('❌ Admin button hidden - user is not admin');
            }
        }

        // Manage tracks button (admin or moderator)
        const manageTracksBtn = document.getElementById('manageTracksBtn');
        if (manageTracksBtn) {
            if (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator') {
                manageTracksBtn.style.display = 'flex';
                manageTracksBtn.addEventListener('click', () => { window.location.href = 'manage-tracks.html'; });
            } else {
                manageTracksBtn.style.display = 'none';
            }
        }

        if (adminLink) {
            adminLink.style.display = this.currentUser.role === 'admin' ? 'flex' : 'none';
        }
    }

    updateAdminPanel() {
        const container = document.getElementById('adminPanelContainer');
        if (!container) return;

        // Видаляємо старі панелі
        container.innerHTML = '';

        if (this.currentUser.role === 'admin') {
            container.innerHTML = this.getAdminPanelHTML();
            console.log('✅ Admin panel added');
        } else if (this.currentUser.role === 'moderator') {
            container.innerHTML = this.getModeratorPanelHTML();
            console.log('✅ Moderator panel added');
        }
    }

    getAdminPanelHTML() {
        return `
            <div class="admin-panel">
                <div class="panel-header">
                    <h3><i class="fas fa-shield-alt"></i> Адмін-панель</h3>
                    <p>Ви маєте повний доступ до системи</p>
                </div>
                <div class="admin-actions">
                    <button class="admin-btn-panel primary" onclick="window.openAdminPanel()">
                        <i class="fas fa-cog"></i> Панель управління
                    </button>
                    <button class="admin-btn-panel secondary" onclick="window.manageUsers()">
                        <i class="fas fa-users"></i> Керування користувачами
                    </button>
                    <button class="admin-btn-panel secondary" onclick="window.viewSystemStats()">
                        <i class="fas fa-chart-bar"></i> Статистика системи
                    </button>
                </div>
            </div>
        `;
    }

    getModeratorPanelHTML() {
        return `
            <div class="moderator-panel">
                <div class="panel-header">
                    <h3><i class="fas fa-user-shield"></i> Панель модератора</h3>
                    <p>Ви маєте доступ до модерації контенту</p>
                </div>
                <div class="admin-actions">
                    <button class="moderator-btn-panel primary">
                        <i class="fas fa-flag"></i> Модерація контенту
                    </button>
                    <button class="moderator-btn-panel secondary">
                        <i class="fas fa-comments"></i> Керування коментарями
                    </button>
                </div>
            </div>
        `;
    }

    getRoleDisplayName(role) {
        const roles = {
            'user': 'Користувач',
            'admin': 'Адміністратор',
            'moderator': 'Модератор',
            'ADMIN': 'Адміністратор',
            'MODERATOR': 'Модератор',
            'USER': 'Користувач'
        };
        return roles[role] || role;
    }

    setupEventListeners() {
        // Обробники для кнопок профілю
        const editProfileBtn = document.getElementById('editProfileBtn');
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        const manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');

        // Ensure listeners are attached only once
        if (!this._listenersSet) {
            if (editProfileBtn) {
                editProfileBtn.addEventListener('click', () => this.editProfile());
            }

            if (changePasswordBtn) {
                changePasswordBtn.addEventListener('click', () => this.changePassword());
            }

            if (manageSubscriptionBtn) {
                manageSubscriptionBtn.addEventListener('click', () => this.manageSubscription());
            }

            this._listenersSet = true;
        }
    }

    editProfile() {
        // Простий inline-редактор через prompt: ім'я та email
        if (!API.isAuthenticated()) {
            window.showNotification('Потрібно увійти, щоб редагувати профіль', 'error');
            return;
        }

        (async () => {
            try {
                const fields = [
                    { name: 'username', label: "Нове ім'я користувача", type: 'text', value: this.currentUser.username },
                    { name: 'email', label: 'Новий email', type: 'text', value: this.currentUser.email || '' }
                ];

                const modal = await window.showModal({ title: 'Редагувати профіль', icon: 'fas fa-user-edit', fields, submitText: 'Зберегти', cancelText: 'Скасувати' });
                if (!modal.submitted) return;

                const payload = {};
                if (modal.values.username && modal.values.username.trim() !== this.currentUser.username) payload.username = modal.values.username.trim();
                if (modal.values.email && modal.values.email.trim() !== (this.currentUser.email || '')) payload.email = modal.values.email.trim();

                if (Object.keys(payload).length === 0) {
                    window.showNotification('Нічого не змінено', 'info');
                    return;
                }

                console.log('✏️ Calling API.updateProfile with payload:', payload, 'tokenPresent:', !!API.getToken());
                const result = await API.updateProfile(payload);
                console.log('✏️ API.updateProfile returned:', result);
                if (result && result.success) {
                    // Оновити локальний кеш і UI
                    this.currentUser = result.data;
                    try { Storage.set('currentUser', result.data); } catch (e) {}
                    this.updateProfileUI();
                    window.showNotification('Профіль успішно оновлено', 'success');
                }
            } catch (error) {
                console.error('Profile update error:', error);
                window.showNotification(error.message || 'Помилка оновлення профілю', 'error');
            }
        })();
    }

    changePassword() {
        window.showNotification('Функція зміни пароля в розробці', 'info');
    }

    manageSubscription() {
        window.showNotification('Функція керування підпискою в розробці', 'info');
    }

    showNotAuthorized() {
        const profileInfoCard = document.getElementById('profileInfoCard');
        const profileStats = document.getElementById('profileStats');
        const notAuthorized = document.getElementById('notAuthorized');
        
        if (profileInfoCard) profileInfoCard.style.display = 'none';
        if (profileStats) profileStats.style.display = 'none';
        if (notAuthorized) notAuthorized.style.display = 'block';
        
        const title = document.getElementById('profileTitle');
        const desc = document.getElementById('profileDescription');
        if (title) title.textContent = 'Профіль';
        if (desc) desc.textContent = 'Увійдіть в акаунт для перегляду профілю';
    }

    // Статичні методи для глобального доступу
    static async refreshProfile() {
        if (window.profileManager) {
            await window.profileManager.loadProfileData();
            window.profileManager.updateProfileUI();
            window.showNotification('Профіль оновлено', 'success');
        }
    }
}

// Глобальний екземпляр
window.profileManager = new ProfileManager();

// Глобальні функції для HTML
window.manageUsers = () => {
    if (window.userManager && window.userManager.isAdmin()) {
        window.location.href = 'admin.html';
    } else {
        window.showNotification('Доступ заборонено', 'error');
    }
};

window.viewSystemStats = () => {
    window.showNotification('Статистика системи в розробці', 'info');
};

// Ініціалізація при завантаженні
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('profile.html') || 
        window.location.pathname.includes('account.html')) {
        window.profileManager.init();
    }
});

// Функція для backwards compatibility
async function loadProfile() {
    return window.profileManager.init();
}