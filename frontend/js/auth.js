// js/auth.js - Перевірка роботи на account.html
class AuthManager {
    constructor() {
        this.isInitialized = false;
        this.init();
    }

    init() {
        if (this.isInitialized) return;
        
        console.log('🔐 AuthManager initializing...');
        document.addEventListener('DOMContentLoaded', () => {
            this.setupAuthForms();
            // Delay auth state check to allow UserManager to initialize first
            setTimeout(() => {
                this.checkAuthState();
            }, 100);
        });
        
        this.isInitialized = true;
    }

    setupAuthForms() {
        // Завжди налаштовуємо форми на account.html, навіть якщо користувач авторизований
        if (!window.location.pathname.includes('account.html')) return;

        console.log('📝 Setting up auth forms on account page');
        this.setupLoginForm();
        this.setupRegisterForm();
        this.setupFormToggle();
        console.log('✅ Auth forms setup complete');
    }

    setupLoginForm() {
        const loginForm = document.getElementById('loginForm');
        if (!loginForm) {
            console.log('❌ Login form not found');
            return;
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            if (!username || !password) {
                window.showNotification('Будь ласка, заповніть всі поля', 'error');
                return;
            }

            await this.handleLogin(username, password);
        });
    }

    setupRegisterForm() {
        const registerForm = document.getElementById('registerForm');
        if (!registerForm) {
            console.log('❌ Register form not found');
            return;
        }

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('registerUsername').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;
            
            if (password !== confirmPassword) {
                window.showNotification('Паролі не співпадають', 'error');
                return;
            }

            if (password.length < 6) {
                window.showNotification('Пароль повинен містити мінімум 6 символів', 'error');
                return;
            }

            await this.handleRegister(username, email, password);
        });
    }

    setupFormToggle() {
        const loginSection = document.getElementById('login-section');
        const registerSection = document.getElementById('register-section');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        
        if (!loginSection || !registerSection) {
            console.log('❌ Auth sections not found');
            return;
        }

        // Встановлюємо початковий стан
        loginSection.classList.add('active');
        registerSection.classList.remove('active');
        tabLogin?.classList.add('active');
        tabRegister?.classList.remove('active');

        // Обробники кліків
        document.addEventListener('click', (e) => {
            const target = e.target.closest('.auth-tab') || e.target.closest('.auth-switch a');
            if (!target) return;

            let action = target.dataset.target || 
                        (target.id === 'tab-login' ? 'login' : 
                         target.id === 'tab-register' ? 'register' : null);
            if (!action) return;

            this.switchAuthForm(action);
        });
    }

    switchAuthForm(action) {
        const loginSection = document.getElementById('login-section');
        const registerSection = document.getElementById('register-section');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');

        if (action === 'login' && loginSection && registerSection) {
            loginSection.classList.add('active');
            registerSection.classList.remove('active');
            tabLogin?.classList.add('active');
            tabRegister?.classList.remove('active');
        } else if (action === 'register' && loginSection && registerSection) {
            registerSection.classList.add('active');
            loginSection.classList.remove('active');
            tabRegister?.classList.add('active');
            tabLogin?.classList.remove('active');
        }
    }

    async handleLogin(username, password) {
        try {
            const loginBtn = document.querySelector('#loginForm .auth-btn');
            const originalText = loginBtn.innerHTML;
            
            // Показуємо стан завантаження
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вхід...';
            loginBtn.disabled = true;

            await API.login(username, password);
            
            window.showNotification('Вхід успішний! Ласкаво просимо.', 'success');
            
            // Оновлюємо кеш користувача та навігацію
            window.userManager.loadCurrentUser();
            window.userManager.updateNavigation();
            
            // На account.html показуємо профіль замість форм
            if (window.location.pathname.includes('account.html')) {
                this.showUserInfo();
            } else {
                window.location.href = 'index.html';
            }
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            // If server returned ban reason, show detailed message
            if (error.banReason) {
                window.showNotification(error.message || 'Ваш акаунт заблоковано.', 'error');
                // Show a styled modal with ban reason and date
                const when = error.bannedAt ? ('\n' + new Date(error.bannedAt).toLocaleString()) : '';
                await window.showModal({
                    title: 'Акаунт заблоковано',
                    message: `${error.message || 'Ваш акаунт заблоковано.'}\n\nПричина: ${error.banReason || 'не вказана'}${when}`,
                    fields: [],
                    submitText: 'OK',
                    cancelText: 'OK'
                });
            } else {
                window.showNotification(error.message || 'Помилка входу. Перевірте дані.', 'error');
            }
        } finally {
            // Відновлюємо кнопку
            const loginBtn = document.querySelector('#loginForm .auth-btn');
            if (loginBtn) {
                loginBtn.innerHTML = 'Увійти';
                loginBtn.disabled = false;
            }
        }
    }

    async handleRegister(username, email, password) {
        try {
            const registerBtn = document.querySelector('#registerForm .auth-btn');
            const originalText = registerBtn.innerHTML;
            
            // Показуємо стан завантаження
            registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Реєстрація...';
            registerBtn.disabled = true;

            await API.register({ username, email, password });
            
            window.showNotification('Реєстрація успішна! Ви увійшли.', 'success');
            
            // Оновлюємо кеш користувача та навігацію
            window.userManager.loadCurrentUser();
            window.userManager.updateNavigation();
            
            // На account.html показуємо профіль замість форм
            if (window.location.pathname.includes('account.html')) {
                document.getElementById('registerForm')?.reset();
                this.showUserInfo();
            } else {
                window.location.href = 'index.html';
            }
            
        } catch (error) {
            console.error('❌ Registration failed:', error.message);
            window.showNotification(error.message || 'Помилка реєстрації. Можливо, користувач вже існує.', 'error');
        } finally {
            // Відновлюємо кнопку
            const registerBtn = document.querySelector('#registerForm .auth-btn');
            if (registerBtn) {
                registerBtn.innerHTML = 'Зареєструватись';
                registerBtn.disabled = false;
            }
        }
    }

    checkAuthState() {
        console.log('🔐 Checking auth state on account page');
        console.log('API.isAuthenticated():', API.isAuthenticated());
        console.log('Window location:', window.location.pathname);
        console.log('Token:', API.getToken() ? '✅ present' : '❌ missing');
        // If token is present or we have a cached currentUser, treat as authenticated for UI purposes.
        const cachedUser = Storage.get('currentUser');
        const isAuth = API.isAuthenticated() || cachedUser;

        if (isAuth) {
            console.log('✅ Detected authenticated state (token or cached user)');

            // Ensure userManager has the latest currentUser and nav updated
            try { window.userManager?.loadCurrentUser(); } catch (e) { /* ignore */ }
            try { window.userManager?.updateNavigation(); } catch (e) { /* ignore */ }

            // If we're on account page or the account DOM exists (SPA case), show profile
            const hasAccountPath = window.location.pathname.includes('account.html');
            const hasGuestView = !!document.getElementById('guest-view');
            if (hasAccountPath || hasGuestView) {
                console.log('➡️ Showing user info (account page or guest view present)');
                this.showUserInfo();
            } else {
                console.log('ℹ️ Authenticated but not on account page — navigation updated');
            }
        } else {
            console.log('❌ User is not authenticated, showing login form');
        }
    }

    showUserInfo() {
        console.log('🔄 Switching to user info view on account page...');
        const guestView = document.getElementById('guest-view');
        const userView = document.getElementById('user-view');
        console.log('guestView element:', guestView ? '✅ found' : '❌ not found');
        console.log('userView element:', userView ? '✅ found' : '❌ not found');
        
        if (guestView && userView) {
            guestView.style.display = 'none';
            userView.style.display = 'block';
            
            console.log('✅ Switched to user view');
            
            // Викликаємо функцію завантаження профілю (force init to handle SPA swaps)
            try {
                if (window.profileManager && typeof window.profileManager.init === 'function') {
                    window.profileManager.init(true);
                } else if (typeof loadProfile === 'function') {
                    loadProfile();
                }
            } catch (e) { console.debug('profile init in showUserInfo failed', e); }
        } else {
            console.error('❌ Guest or User view elements not found');
        }
    }
}

// Глобальний екземпляр
window.authManager = new AuthManager();

// Функція для backwards compatibility
function initializeAuth() {
    return window.authManager.init();
}