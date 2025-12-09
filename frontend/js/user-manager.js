// js/user-manager.js - ВИПРАВЛЕНИЙ менеджер користувачів
class UserManager {
    constructor() {
        this.currentUser = null;
        this.usersCache = new Map();
        this.init();
    }

    init() {
        this.loadCurrentUser();
        this.updateNavigation();
        this.setupEventListeners();
        console.log('✅ UserManager initialized');
    }

    // Завантажити поточного користувача
    loadCurrentUser() {
        this.currentUser = API.getCurrentUser();
        // Якщо є токен, спробуємо оновити дані профілю з сервера (щоб уникнути застарілої ролі)
        if (API.isAuthenticated()) {
            API.getProfile()
                .then(profileResult => {
                    // API.getProfile() повертає об'єкт з полем data
                    const serverUser = profileResult && profileResult.data ? profileResult.data : null;
                    if (serverUser) {
                        this.currentUser = serverUser;
                        try { Storage.set('currentUser', serverUser); } catch (e) { /* ignore */ }
                        this.updateNavigation();
                    }
                })
                .catch(err => {
                    // Якщо не вдається отримати профіль (наприклад, токен тимчасово не доступний або сервер перезавантажився),
                    // не очищаємо одразу токен — спробуємо повторити запит короткочасно. Якщо повтор також не вдасться,
                    // тоді очистимо дані, інакше залишимо сеанс як є.
                    console.debug('UserManager: profile refresh failed, will retry once before clearing auth:', err);
                    // schedule a single retry
                    setTimeout(async () => {
                        try {
                            const retry = await API.getProfile();
                            const serverUser = retry && retry.data ? retry.data : null;
                            if (serverUser) {
                                this.currentUser = serverUser;
                                try { Storage.set('currentUser', serverUser); } catch (e) {}
                                this.updateNavigation();
                                console.debug('UserManager: profile refresh retry succeeded');
                                return;
                            }
                        } catch (retryErr) {
                            console.debug('UserManager: retry failed, clearing auth:', retryErr);
                        }
                        // If we reach here -> retry failed
                        try { API.clearToken(); } catch (e) {}
                        try { Storage.remove('currentUser'); } catch (e) {}
                        this.currentUser = null;
                        try { this.updateNavigation(); } catch (e) {}
                    }, 1500);
                });
        }
        
        // Перевірка доступу до адмін-панелі
        if (this.isAdminPage() && !this.isAdmin()) {
            window.location.href = 'account.html';
            return null;
        }
        
        return this.currentUser;
    }
    
    // Перевірка ролей
    isAdmin() {
        return this.currentUser?.role === 'admin' || this.currentUser?.role === 'ADMIN';
    }

    isModerator() {
        return this.currentUser?.role === 'moderator' || this.currentUser?.role === 'MODERATOR' || this.isAdmin();
    }
    
    isAdminPage() {
        return window.location.pathname.includes('admin.html');
    }

    isLoggedIn() {
        return API.isAuthenticated() && this.currentUser !== null;
    }

    // Оновлення навігації
    updateNavigation() {
        const accountLinks = document.querySelectorAll('.account-link, .nav-item[href*="account"], .nav-item[href*="profile"]');
        const adminLinks = document.querySelectorAll('.admin-link');
        
        // Видаляємо всі попередні класи
        document.body.classList.remove('user-logged-in', 'user-guest');
        
        if (this.currentUser) {
            document.body.classList.add('user-logged-in');
            
            // Оновлюємо посилання на акаунт
            accountLinks.forEach(link => {
                const textSpan = link.querySelector('.nav-text') || link.querySelector('span');
                if (textSpan && !link.classList.contains('admin-link')) {
                    textSpan.textContent = this.currentUser.username;
                    link.href = 'account.html';
                }
            });
            
            // Показуємо посилання на Адмін-панель (якщо є)
            adminLinks.forEach(link => {
                if (this.isAdmin()) {
                    link.style.display = 'flex';
                    console.log('✅ Admin link shown');
                } else {
                    link.style.display = 'none';
                    console.log('❌ Admin link hidden - user is not admin');
                }
            });
            
        } else {
            // Користувач не авторизований
            document.body.classList.add('user-guest');
            accountLinks.forEach(link => {
                const textSpan = link.querySelector('.nav-text') || link.querySelector('span');
                if (textSpan && !link.classList.contains('admin-link')) {
                    textSpan.textContent = 'Увійти';
                    link.href = 'account.html';
                }
            });
            
            // Приховуємо адмін посилання
            adminLinks.forEach(link => {
                link.style.display = 'none';
            });
        }
        
        // Перевірка на сторінці акаунта
        this.updateAccountPage();
    }

    updateAccountPage() {
        if (!window.location.pathname.includes('account.html')) return;
        
        const guestBadge = document.querySelector('.guest-badge');
        
        if (this.currentUser && guestBadge) {
            guestBadge.innerHTML = `
                <i class="fas fa-user-check"></i>
                <span>${this.currentUser.username}</span>
            `;
            guestBadge.style.background = '#1db954';
        } else if (guestBadge) {
            guestBadge.innerHTML = `
                <i class="fas fa-user-times"></i>
                <span>Гостьовий режим</span>
            `;
            guestBadge.style.background = '#404040';
        }

        // Show admin controls on the account page for admins/moderators
        try {
            const goToAdmin = document.getElementById('goToAdminPanelBtn');
            const manageTracks = document.getElementById('manageTracksBtn');
            if (this.isAdmin() || this.isModerator()) {
                if (goToAdmin) {
                    goToAdmin.style.display = 'inline-block';
                    // Use onclick assignment to avoid duplicate listeners from repeated init
                    goToAdmin.onclick = (e) => { e.preventDefault(); window.location.href = 'admin.html'; };
                }
                if (manageTracks) {
                    manageTracks.style.display = 'inline-block';
                    manageTracks.onclick = (e) => { e.preventDefault(); window.location.href = 'manage-tracks.html'; };
                }
            } else {
                if (goToAdmin) { goToAdmin.style.display = 'none'; goToAdmin.onclick = null; }
                if (manageTracks) { manageTracks.style.display = 'none'; manageTracks.onclick = null; }
            }
        } catch (e) { /* ignore */ }
    }

    setupEventListeners() {
        this.setupLogoutHandler();
        this.setupAuthStateListener();
    }

    setupLogoutHandler() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#logoutBtn') || e.target.closest('.logout-btn')) { 
                this.logout();
            }
        });
    }

    setupAuthStateListener() {
        // Слухаємо зміни в localStorage для синхронізації між вкладками
        window.addEventListener('storage', (e) => {
            if (e.key === 'authToken' || e.key === 'currentUser') {
                this.loadCurrentUser();
                this.updateNavigation();
            }
        });
    }

    logout() {
        (async () => {
            try {
                const modal = await window.showModal({
                    title: 'Вихід',
                    icon: 'fas fa-sign-out-alt',
                    message: 'Ви впевнені, що хочете вийти?',
                    fields: [],
                    submitText: 'Вийти',
                    cancelText: 'Скасувати'
                });
                if (!modal.submitted) return;

                API.logout();
                this.currentUser = null;
                this.usersCache.clear();
                this.updateNavigation();

                if (window.location.pathname.includes('account.html') || window.location.pathname.includes('admin.html')) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                }
            } catch (err) {
                console.error('logout modal error', err);
            }
        })();
    }

       // Адмін методи
    async updateUsername(userId, newUsername) {
        try {
            // Тимчасово використовуємо метод оновлення ролі для зміни імені
            // У реальному додатку має бути окремий метод для оновлення імені
            const result = await API.updateUserRole(userId, newUsername);
            window.showNotification(`Ім'я користувача оновлено`, 'success');
            return result;
        } catch (error) {
            window.showNotification(error.message, 'error');
            return false;
        }
    }

    async updateUserRole(userId, newRole) {
        try {
            const result = await API.updateUserRole(userId, newRole);
            window.showNotification(`Роль користувача оновлено`, 'success');
            return result;
        } catch (error) {
            window.showNotification(error.message, 'error');
            return false;
        }
    }

    async banUser(userId) {
        try {
            // Ask admin for a reason for the ban (optional) using modal
            const modal = await window.showModal({
                title: 'Блокування користувача',
                icon: 'fas fa-ban',
                message: 'Ця дія тимчасово позбавить користувача доступу до облікового запису. Ви можете вказати причину блоку (необов\'язково), щоб пояснити адміністративне рішення.',
                fields: [ { name: 'reason', label: 'Причина бана (необов\'язково)', type: 'textarea', value: '' } ],
                submitText: 'Заблокувати',
                cancelText: 'Скасувати'
            });
            if (!modal.submitted) return false;
            const reason = modal.values.reason || '';

            const result = await API.banUser(userId, reason);
            window.showNotification(`Користувача заблоковано`, 'success');
            return result;
        } catch (error) {
            window.showNotification(error.message, 'error');
            return false;
        }
    }

    async unbanUser(userId) {
        try {
            const result = await API.unbanUser(userId);
            window.showNotification(`Користувача розблоковано`, 'success');
            return result;
        } catch (error) {
            window.showNotification(error.message, 'error');
            return false;
        }
    }

    async toggleUserActive(userId) {
        try {
            const result = await API.toggleUserActive(userId);
            window.showNotification(`Статус активності змінено`, 'success');
            return result;
        } catch (error) {
            window.showNotification(error.message, 'error');
            return false;
        }
    }

    async deleteUser(userId) {
        try {
            const modal = await window.showModal({
                title: 'Видалити користувача',
                icon: 'fas fa-trash',
                message: 'Ви впевнені, що хочете видалити цього користувача? Цю дію не можна скасувати.',
                fields: [],
                submitText: 'Видалити',
                cancelText: 'Скасувати'
            });
            if (!modal.submitted) return false;

            try {
                const result = await API.deleteUser(userId);
                window.showNotification(`Користувача видалено`, 'success');
                return result;
            } catch (error) {
                window.showNotification(error.message, 'error');
                return false;
            }
        } catch (err) {
            console.error('deleteUser modal error', err);
            return false;
        }
    }

    async loadUserStatuses() {
        try {
            const users = await API.getAllUsers();
            this.updateUserStatusesUI(users);
            return users;
        } catch (error) {
            console.error('Помилка завантаження статусів:', error);
            return [];
        }
    }

    updateUserStatusesUI(users) {
        if (!Array.isArray(users)) return;
        
        users.forEach(user => {
            const userId = user.id || user._id;
            const statusElement = document.querySelector(`[data-user-id="${userId}"] .user-status`);
            if (statusElement) {
                const status = user.status || 'active';
                statusElement.textContent = status === 'banned' ? 'Заблокований' : 'Активний';
                statusElement.className = `user-status status-${status}`;
            }
        });
    }

    // Метод для перевірки доступу до сторінок
    checkPageAccess() {
        const currentPath = window.location.pathname;
        
        // Якщо не авторизований і намагається перейти на захищені сторінки
        if (!this.isLoggedIn() && 
            (currentPath.includes('profile.html') || currentPath.includes('admin.html'))) {
            window.location.href = 'account.html';
            return false;
        }
        
        // Якщо не адмін і намагається перейти в адмінку
        if (!this.isAdmin() && currentPath.includes('admin.html')) {
            window.showNotification('Доступ заборонено. Тільки для адміністраторів.', 'error');
            window.location.href = 'index.html';
            return false;
        }
        
        return true;
    }

    // Ensure authentication by verifying token with server; returns true if authenticated
    async ensureAuthenticated() {
        try {
            if (!API.isAuthenticated()) return false;
            try {
                const resp = await API.getProfile();
                const serverUser = resp && resp.data ? resp.data : null;
                if (serverUser) {
                    this.currentUser = serverUser;
                    try { Storage.set('currentUser', serverUser); } catch (e) {}
                    this.updateNavigation();
                    return true;
                }
            } catch (e) {
                console.debug('ensureAuthenticated: profile fetch failed', e);
                return false;
            }
        } catch (e) {
            console.warn('ensureAuthenticated error', e);
            return false;
        }
        return false;
    }
}

// Глобальний екземпляр
window.userManager = new UserManager();

// Додаємо перевірку доступу при завантаженні кожної сторінки
document.addEventListener('DOMContentLoaded', () => {
    window.userManager.checkPageAccess();
});