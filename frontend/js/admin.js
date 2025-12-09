// js/admin.js - ВИПРАВЛЕНИЙ менеджер адмін-панелі
class AdminManager {
    constructor() {
        this.users = [];
        this.filteredUsers = [];
        this.isInitialized = false;
        this.isInitializing = false;
        console.log('🛡️ AdminManager: Готовий до ініціалізації.');
    }

    async init() {
        if (this.isInitialized || this.isInitializing) return;

        this.isInitializing = true;
        console.log('🛡️ AdminManager initializing...');
        
        // Перевіряємо права доступу
        if (!window.userManager || !window.userManager.isAdmin()) {
            window.showNotification('Доступ заборонено. Тільки для адміністраторів.', 'error');
            window.location.href = 'account.html';
            return;
        }

        try {
            await this.setupEventListeners();
            await this.loadAllUsers();

            console.log('✅ AdminManager initialized successfully');
            this.isInitialized = true;
            this.isInitializing = false;
            
        } catch (error) {
            console.error('❌ AdminManager initialization failed:', error);
            window.showNotification('Помилка ініціалізації адмін-панелі: ' + error.message, 'error');
            this.isInitializing = false;
        }
    }



    async setupEventListeners() {
        // Пошук користувачів
        const searchInput = document.getElementById('adminSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterUsers(e.target.value);
            });
        }

        // Кнопка оновлення статусів
        const refreshBtn = document.getElementById('refresh-statuses');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadAllUsers();
            });
        }

        // Кнопка завантаження користувачів
        const loadUsersBtn = document.getElementById('loadUsersBtn');
        if (loadUsersBtn) {
            loadUsersBtn.addEventListener('click', () => {
                this.loadAllUsers();
            });
        }

        // Глобальні обробники кліків для таблиці
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            const userId = target.dataset.userId || target.closest('tr')?.dataset.userId;
            if (!userId) return;

            if (target.classList.contains('edit-btn')) {
                this.editUsername(userId);
            } else if (target.classList.contains('role-btn')) {
                this.changeRole(userId);
            } else if (target.classList.contains('ban-btn')) {
                this.toggleBanUser(userId);
            } else if (target.classList.contains('delete-btn')) {
                this.deleteUser(userId);
            }
        });

        // Track upload form
        const trackUploadForm = document.getElementById('trackUploadForm');
        if (trackUploadForm) {
            trackUploadForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const fd = new FormData(trackUploadForm);
                    const token = API.getToken();
                    if (!token) {
                        window.showNotification('Потрібна авторизація адміністратора', 'error');
                        return;
                    }

                    window.showNotification('Завантаження треку...', 'info');

                    const resp = await fetch(`${API.BASE_URL}/tracks/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: fd
                    });

                    const result = await resp.json();
                    if (!resp.ok) {
                        throw new Error(result.message || 'Upload failed');
                    }

                    window.showNotification('Трек успішно додано', 'success');
                    // clear form
                    trackUploadForm.reset();
                    try { localStorage.setItem('tracksUpdatedAt', String(Date.now())); } catch (e) {}
                    try { window.dispatchEvent(new Event('tracks:updated')); } catch (e) {}
                    // Redirect to library so admin can see the new track in the list
                    setTimeout(() => { window.location.href = 'library.html'; }, 600);
                } catch (err) {
                    console.error('Upload error:', err);
                    window.showNotification('Помилка завантаження треку: ' + err.message, 'error');
                }
            });
        }

        // Track create (existing file) form - create a DB record for a file already in /public/audio
        const trackCreateForm = document.getElementById('trackCreateForm');
        if (trackCreateForm) {
            trackCreateForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const formData = new FormData(trackCreateForm);
                    const title = formData.get('title')?.toString().trim();
                    const artist = formData.get('artist')?.toString().trim();
                    const audioUrl = formData.get('audioUrl')?.toString().trim();

                    if (!title || !artist || !audioUrl) {
                        window.showNotification('Заповніть всі обов\'язкові поля', 'error');
                        return;
                    }

                    const token = API.getToken();
                    if (!token) {
                        window.showNotification('Потрібна авторизація адміністратора', 'error');
                        return;
                    }

                    window.showNotification('Створення запису для існуючого файлу...', 'info');

                    const resp = await fetch(`${API.BASE_URL}/tracks`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ title, artist, audioUrl })
                    });

                    const result = await resp.json().catch(() => null);
                    if (!resp.ok || (result && result.success === false)) {
                        const msg = (result && result.message) ? result.message : `HTTP ${resp.status}`;
                        throw new Error(msg);
                    }

                    window.showNotification('Трек успішно додано', 'success');
                    trackCreateForm.reset();
                    try { localStorage.setItem('tracksUpdatedAt', String(Date.now())); } catch (e) {}
                    try { window.dispatchEvent(new Event('tracks:updated')); } catch (e) {}
                    setTimeout(() => { window.location.href = 'library.html'; }, 600);
                } catch (err) {
                    console.error('Create existing file error:', err);
                    window.showNotification('Не вдалося додати трек: ' + (err.message || err), 'error');
                }
            });
        }
    }

    async loadAllUsers() {
        try {
            this.showLoading();
            window.showNotification('Завантаження користувачів...', 'info');
            
            console.log('🔄 Fetching users from API...');
            const response = await API.getAllUsers();

            // response should be the parsed JSON object { success, users }
            if (!response || response.success === false) {
                const msg = (response && response.message) ? response.message : 'Не вдалося отримати користувачів';
                throw new Error(msg);
            }

            this.users = response.users || [];
            
            // Переконуємося, що це масив
            if (!Array.isArray(this.users)) {
                console.warn('⚠️ Response is not an array:', this.users);
                this.users = [];
            }
            
            this.filteredUsers = [...this.users];
            
            this.renderUsers();
            this.updateStats();
            if (this.users.length > 0) {
                console.log(`✅ Loaded ${this.users.length} users:`, this.users);
            } else {
                window.showNotification('Користувачі не знайдені', 'info');
                console.log('ℹ️ No users found in response');
            }
            
        } catch (error) {
            console.error('❌ Помилка завантаження користувачів:', error);
            window.showNotification('Помилка завантаження даних: ' + (error.message || 'невідома помилка'), 'error');
            this.users = [];
            this.filteredUsers = [];
            this.renderUsers();
            this.updateStats();
        }
    }

    renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) {
            console.error('❌ usersTableBody not found');
            return;
        }

        if (this.filteredUsers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-text">
                        <i class="fas fa-search"></i> Користувачі не знайдені
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.filteredUsers.map(user => {
            // Безпечний доступ до властивостей
            const userId = user.id || user._id || 'N/A';
            const username = user.username || 'Невідомо';
            const email = user.email || 'Невідомо';
            const role = user.role || 'user';
            const status = user.status || 'active';
            const registrationDate = user.registrationDate || user.createdAt || 'Невідомо';

            return `
                <tr data-user-id="${userId}">
                    <td>${userId}</td>
                    <td class="username-cell">
                        <span class="username">${username}</span>
                        <button class="action-btn edit-btn" data-user-id="${userId}" title="Змінити ім'я">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                    <td>${email}</td>
                    <td class="user-role">
                        <span class="role-badge role-${role}">${this.getRoleDisplayName(role)}</span>
                        <button class="action-btn role-btn" data-user-id="${userId}" title="Змінити роль">
                            <i class="fas fa-user-cog"></i>
                        </button>
                    </td>
                    <td class="user-status">
                        <span class="status-badge status-${status}">
                            ${status === 'banned' ? 'Заблокований' : 'Активний'}
                        </span>
                    </td>
                    <td class="registration-date">${this.formatDate(registrationDate)}</td>
                    <td class="user-actions">
                        <button class="action-btn ban-btn" data-user-id="${userId}" title="${status === 'banned' ? 'Розблокувати' : 'Заблокувати'}">
                            <i class="fas ${status === 'banned' ? 'fa-unlock' : 'fa-ban'}"></i>
                        </button>
                        <button class="action-btn delete-btn" data-user-id="${userId}" title="Видалити">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        console.log(`✅ Rendered ${this.filteredUsers.length} users`);
    }

    showLoading() {
        const tbody = document.getElementById('usersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-text">
                        <i class="fas fa-spinner fa-spin"></i> Завантаження користувачів...
                    </td>
                </tr>
            `;
        }
    }

    filterUsers(searchTerm) {
        if (!searchTerm) {
            this.filteredUsers = [...this.users];
        } else {
            const query = searchTerm.toLowerCase();
            this.filteredUsers = this.users.filter(user => {
                const username = (user.username || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                const id = (user.id || user._id || '').toString();
                const role = (user.role || '').toLowerCase();

                return username.includes(query) ||
                       email.includes(query) ||
                       id.includes(query) ||
                       role.includes(query);
            });
        }
        
        this.renderUsers();
    }

    updateStats() {
        const totalUsers = this.users.length;
        const activeUsers = this.users.filter(u => ((u.status || 'active') === 'active')).length;
        const bannedUsers = this.users.filter(u => ((u.status || 'active') === 'banned')).length;

        // Normalize role checks to be case-insensitive and robust
        const adminUsers = this.users.filter(u => {
            const role = (u.role || 'user').toString().toLowerCase();
            return role === 'admin';
        }).length;
        const moderatorUsers = this.users.filter(u => {
            const role = (u.role || 'user').toString().toLowerCase();
            return role === 'moderator';
        }).length;

        this.updateStatElement('totalUsers', totalUsers);
        this.updateStatElement('activeUsers', activeUsers);
        this.updateStatElement('bannedUsers', bannedUsers);
        this.updateStatElement('adminUsers', adminUsers);
        this.updateStatElement('moderatorUsers', moderatorUsers);

        console.log(`📊 Stats updated - Total: ${totalUsers}, Active: ${activeUsers}, Banned: ${bannedUsers}, Admins: ${adminUsers}, Moderators: ${moderatorUsers}`);
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    // Методи керування користувачами
    async editUsername(userId) {
        const user = this.users.find(u => (u.id || u._id) === userId);
        if (!user) {
            window.showNotification('Користувача не знайдено', 'error');
            return;
        }

        try {
            const modal = await window.showModal({
                title: `Змінити ім'я для ${user.username}`,
                icon: 'fas fa-edit',
                fields: [ { name: 'username', label: `Введіть нове ім'я користувача:`, type: 'text', value: user.username } ],
                submitText: 'Зберегти',
                cancelText: 'Скасувати'
            });
            if (!modal.submitted) return;
            const newUsername = modal.values.username && modal.values.username.trim();
            if (newUsername && newUsername !== user.username) {
                try {
                    await window.userManager.updateUsername(userId, newUsername);
                    await this.loadAllUsers();
                } catch (error) {
                    window.showNotification('Помилка оновлення імені: ' + error.message, 'error');
                }
            }
        } catch (err) {
            console.error('editUsername modal error', err);
        }
    }

    async changeRole(userId) {
        const user = this.users.find(u => (u.id || u._id) === userId);
        if (!user) {
            window.showNotification('Користувача не знайдено', 'error');
            return;
        }

        try {
            const currentRole = this.getRoleDisplayName(user.role);
            const modal = await window.showModal({
                title: `Змінити роль для ${user.username}`,
                icon: 'fas fa-user-cog',
                message: `Поточна роль: ${currentRole}\nДоступні ролі: user, moderator, admin`,
                fields: [ { name: 'role', label: 'Нова роль', type: 'text', value: user.role } ],
                submitText: 'Зберегти',
                cancelText: 'Скасувати'
            });
            if (!modal.submitted) return;
            const newRole = modal.values.role && modal.values.role.trim().toLowerCase();
            if (newRole && newRole !== user.role) {
                try {
                    await window.userManager.updateUserRole(userId, newRole);
                    await this.loadAllUsers();
                } catch (error) {
                    window.showNotification('Помилка оновлення ролі: ' + error.message, 'error');
                }
            }
        } catch (err) {
            console.error('changeRole modal error', err);
        }
    }

    async toggleBanUser(userId) {
        const user = this.users.find(u => (u.id || u._id) === userId);
        if (!user) {
            window.showNotification('Користувача не знайдено', 'error');
            return;
        }

        const isBanned = (user.status || user.role || 'active') === 'banned' || user.role === 'banned';
        const action = isBanned ? 'розблокувати' : 'заблокувати';
        try {
            if (isBanned) {
                // For unbanning show a single confirmation modal
                const confirmModal = await window.showModal({
                    title: 'Розблокувати користувача',
                    icon: 'fas fa-unlock',
                    message: `Ви впевнені, що хочете розблокувати користувача ${user.username}?`,
                    fields: [],
                    submitText: 'Розблокувати',
                    cancelText: 'Скасувати'
                });
                if (!confirmModal.submitted) return;
                await window.userManager.unbanUser(userId);
            } else {
                // For banning directly invoke UserManager.banUser which shows the reason-modal
                await window.userManager.banUser(userId);
            }
            await this.loadAllUsers();
        } catch (error) {
            window.showNotification('Помилка зміни статусу: ' + error.message, 'error');
        }
    }

    async deleteUser(userId) {
        const user = this.users.find(u => (u.id || u._id) === userId);
        if (!user) {
            window.showNotification('Користувача не знайдено', 'error');
            return;
        }

        try {
            const delModal = await window.showModal({
                title: 'Видалити користувача',
                icon: 'fas fa-trash',
                message: `Видалити користувача ${user.username} (${user.email})? Цю дію не можна скасувати.`,
                fields: [],
                submitText: 'Видалити',
                cancelText: 'Скасувати'
            });
            if (!delModal.submitted) return;
            try {
                await window.userManager.deleteUser(userId);
                await this.loadAllUsers();
            } catch (error) {
                window.showNotification('Помилка видалення: ' + error.message, 'error');
            }
        } catch (err) {
            console.error('deleteUser modal error', err);
        }
    }

    // Допоміжні методи
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

    formatDate(dateString) {
        try {
            if (!dateString || dateString === 'Невідомо') return 'Невідомо';
            
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Невідомо';
            
            return date.toLocaleDateString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Date formatting error:', error);
            return 'Невідомо';
        }
    }

    // Діагностичний метод
    async debugConnection() {
        console.log('🔧 Running connection debug...');
        
        try {
            const connectionTest = await API.testConnection();
            console.log('Connection test:', connectionTest);
            
            const adminTest = await API.testAdminEndpoint();
            console.log('Admin endpoint test:', adminTest);
            
            return { connectionTest, adminTest };
        } catch (error) {
            console.error('Debug failed:', error);
            return { error: error.message };
        }
    }
}

// Глобальний екземпляр
window.adminManager = new AdminManager();

// Додаємо глобальну функцію для дебагу
window.debugAdmin = () => {
    if (window.adminManager) {
        window.adminManager.debugConnection();
    }
};

// Ініціалізація при завантаженні
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('admin.html')) {
        window.adminManager.init();
    }
});