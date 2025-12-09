// js/api.js - ВИПРАВЛЕНИЙ Клас для взаємодії з бекенд API
// Ensure a minimal `showModal` helper exists early so other modules can call it
if (typeof window !== 'undefined' && typeof window.showModal !== 'function') {
    window.showModal = function(options = {}) {
        return new Promise((resolve) => {
            // If only a message is provided and no fields, use confirm
            if (options.message && (!options.fields || options.fields.length === 0)) {
                const ok = window.confirm(options.message);
                return resolve({ submitted: ok, values: {} });
            }

            const fields = options.fields || [];
            const values = {};
            for (let f of fields) {
                const label = f.label || f.name || '';
                const initial = (typeof f.value !== 'undefined') ? f.value : '';
                const val = window.prompt(label + '\n', initial);
                if (val === null) return resolve({ submitted: false });
                values[f.name] = val;
            }
            return resolve({ submitted: true, values });
        });
    };
}
class API {
    static BASE_URL = APP_CONFIG.API_BASE_URL;
    static TOKEN_KEY = 'authToken';

    // ==================== УПРАВЛІННЯ ТОКЕНОМ ====================
    static setToken(token) {
        Storage.set(this.TOKEN_KEY, token);
    }

    static getToken() {
        return Storage.get(this.TOKEN_KEY);
    }

    static clearToken() {
        Storage.remove(this.TOKEN_KEY);
        Storage.remove('currentUser');
    }
    
    // ==================== СТАН АВТОРИЗАЦІЇ ====================
    static isAuthenticated() {
        return !!this.getToken();
    }
    
    static getCurrentUser() {
        return Storage.get('currentUser');
    }

    // ==================== АВТОРИЗАЦІЯ/РЕЄСТРАЦІЯ ====================
    static async register(userData) {
        const url = `${this.BASE_URL}/auth/register`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Помилка реєстрації на сервері.');
        }

        if (result.token) {
            this.setToken(result.token);
        }
        
        if (result.user) {
            Storage.set('currentUser', result.user);
        }
        
        return result;
    }

    static async login(username, password) {
        const url = `${this.BASE_URL}/auth/login`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (!response.ok) {
            const err = new Error(result.message || 'Неправильний логін або пароль.');
            if (result.banReason) err.banReason = result.banReason;
            if (result.bannedAt) err.bannedAt = result.bannedAt;
            throw err;
        }

        if (result.token) {
            this.setToken(result.token);
        }
        
        if (result.user) {
            Storage.set('currentUser', result.user);
        }
        
        return result;
    }

    static logout() {
        this.clearToken();
        if (typeof window.showNotification === 'function') {
            window.showNotification('Ви вийшли з акаунту', 'info');
        }
    }
    
    // ==================== ПРОФІЛЬ ====================
    static async getProfile() {
        const token = this.getToken();
        if (!token) {
            throw new Error('Користувач не авторизований.');
        }
        
        const url = `${this.BASE_URL}/users/profile`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Помилка завантаження профілю.');
        }

        const result = await response.json();
        return result;
    }

    static async updateProfile(data = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');

        const response = await fetch(`${this.BASE_URL}/users/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Помилка оновлення профілю');

        // Update stored currentUser
        if (result.data) {
            try { Storage.set('currentUser', result.data); } catch (e) { /* ignore */ }
        }

        return result;
    }
    
               // ==================== АДМІН МЕТОДИ ====================
    static async getAllUsers() {
    const token = this.getToken();
    if (!token) throw new Error('Необхідна авторизація');

    try {
        const response = await fetch(`${this.BASE_URL}/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json().catch(() => null);
        if (!response.ok) {
            const msg = (result && result.message) ? result.message : `HTTP ${response.status}`;
            console.error('❌ Error fetching users:', msg, result);
            throw new Error(msg);
        }

        console.log('✅ Users data received:', result);
        return result;
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        throw new Error('Не вдалося завантажити користувачів: ' + error.message);
    }
}

    static async updateUserRole(userId, newRole) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/users/${userId}/role`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: newRole })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error updating user role:', error);
            throw new Error('Помилка оновлення ролі: ' + error.message);
        }
    }

    static async banUser(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            // Allow passing ban reason in body
            const body = typeof arguments[1] === 'string' ? { reason: arguments[1] } : {};
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}/ban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error banning user:', error);
            throw new Error('Помилка блокування користувача: ' + error.message);
        }
    }

    static async unbanUser(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}/unban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error unbanning user:', error);
            throw new Error('Помилка розблокування користувача: ' + error.message);
        }
    }

    static async toggleUserActive(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}/toggle-active`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error toggling user active status:', error);
            throw new Error('Помилка зміни статусу активності: ' + error.message);
        }
    }

    static async unbanUser(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}/unban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error unbanning user:', error);
            throw new Error('Помилка розблокування користувача: ' + error.message);
        }
    }

    static async toggleUserActive(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}/toggle-active`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error toggling user active status:', error);
            throw new Error('Помилка зміни статусу активності: ' + error.message);
        }
    }

    static async deleteUser(userId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ Error deleting user:', error);
            throw new Error('Помилка видалення користувача: ' + error.message);
        }
    }

    // ==================== УНІВЕРСАЛЬНИЙ FETCH ====================
    static async fetchWithAuth(endpoint, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error('Користувач не авторизований.');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        if (options.body && typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${this.BASE_URL}${endpoint}`, {
            ...options,
            headers: headers
        });

        if (response.status === 401) {
            this.logout();
            if (typeof window.showNotification === 'function') {
                window.showNotification('Сесія закінчилася. Увійдіть знову.', 'error');
            }
            throw new Error('Unauthenticated');
        }

        return response;
    }

    // ==================== HEALTH CHECK ====================
    static async healthCheck() {
        try {
            const response = await fetch(`${this.BASE_URL}/health`);
            return response.ok;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    // ==================== TRACKS ====================
    static async getTracks() {
        try {
            // add cache-busting timestamp to avoid cached responses
            const url = `${this.BASE_URL}/tracks?_=${Date.now()}`;
            console.debug('API.getTracks -> fetching', url);
            let response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                try {
                    const result = await response.json();
                    const tracks = result && result.tracks && Array.isArray(result.tracks) ? result.tracks : [];
                    const count = tracks.length;
                    console.debug('API.getTracks -> received', count, 'tracks from primary endpoint');
                    return tracks;
                } catch (e) { console.debug('API.getTracks -> primary parse failed', e); }
            } else {
                console.warn('API.getTracks -> primary endpoint failed, status', response.status);
            }

            // Fallback: try relative endpoint (same-origin) in case BASE_URL is misconfigured or proxying is used
            try {
                const relUrl = `/api/tracks?_=${Date.now()}`;
                console.debug('API.getTracks -> trying fallback relative URL', relUrl);
                response = await fetch(relUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error('Fallback tracks fetch failed: ' + response.status);
                const fallback = await response.json();
                const tracks = fallback && fallback.tracks && Array.isArray(fallback.tracks) ? fallback.tracks : [];
                console.debug('API.getTracks -> received', tracks.length, 'tracks from fallback');
                return tracks;
            } catch (fallbackErr) {
                console.error('API.getTracks fallback failed', fallbackErr);
                return [];
            }
        } catch (err) {
            console.error('Error getting tracks:', err);
            return [];
        }
    }

    // Mark a track as played (adds to user's recent list)
    static async markPlayed(trackId) {
        try {
            const token = this.getToken();
            if (!token) throw new Error('Not authenticated');
            const resp = await fetch(`${this.BASE_URL}/users/recent`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackId })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Failed to mark played');
            return result;
        } catch (err) {
            console.error('API.markPlayed error', err);
            return null;
        }
    }

    static async getRecent() {
        try {
            const token = this.getToken();
            if (!token) return [];
            const resp = await fetch(`${this.BASE_URL}/users/recent`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) throw new Error('Failed to load recent');
            const result = await resp.json();
            return result.recent || [];
        } catch (err) {
            console.error('API.getRecent error', err);
            return [];
        }
    }

    static async toggleFavorite(trackId) {
        try {
            const token = this.getToken();
            if (!token) throw new Error('Not authenticated');
            const resp = await fetch(`${this.BASE_URL}/users/favorite/${trackId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Failed to toggle favorite');
            return result;
        } catch (err) {
            console.error('API.toggleFavorite error', err);
            return null;
        }
    }

    static async getFavorites() {
        try {
            const token = this.getToken();
            if (!token) return [];
            const resp = await fetch(`${this.BASE_URL}/users/favorites`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) throw new Error('Failed to load favorites');
            const result = await resp.json();
            return result.favorites || [];
        } catch (err) {
            console.error('API.getFavorites error', err);
            return [];
        }
    }

    static async getTrackById(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/tracks/${id}`);
            if (!response.ok) throw new Error('Failed to load track');
            const result = await response.json();
            return result.track;
        } catch (err) {
            console.error('Error getting track:', err);
            return null;
        }
    }

    // Increment track play/popularity counter
    static async incrementPlay(trackId) {
        try {
            console.debug('API.incrementPlay -> sending POST for', trackId);
            const resp = await fetch(`${this.BASE_URL}/tracks/${trackId}/play`, { method: 'POST' });
            let result = null;
            try { result = await resp.json(); } catch (e) { console.debug('API.incrementPlay -> no JSON body', e); }
            console.debug('API.incrementPlay -> response', resp.status, result);
            if (!resp.ok) throw new Error('Failed to increment play');
            return result;
        } catch (err) {
            console.error('API.incrementPlay error', err);
            return null;
        }
    }

    // ==================== PLAYLISTS ====================
    static async getPlaylists() {
        try {
            const token = this.getToken();
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const response = await fetch(`${this.BASE_URL}/playlists`, { headers, cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load playlists');
            const result = await response.json();
            // backend returns { success: true, playlists: [...] }
            return result.playlists || [];
        } catch (err) {
            console.error('Error getting playlists:', err);
            return [];
        }
    }

    static async getPlaylistById(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/playlists/${id}`);
            if (!response.ok) throw new Error('Failed to load playlist');
            const result = await response.json();
            return result.playlist;
        } catch (err) {
            console.error('Error getting playlist:', err);
            return null;
        }
    }

    static async createPlaylist(data = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        const response = await fetch(`${this.BASE_URL}/playlists`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Failed to create playlist');
        return await response.json();
    }

    static async addTrackToPlaylist(playlistId, trackId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        const response = await fetch(`${this.BASE_URL}/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId })
        });
        if (!response.ok) throw new Error('Failed to add track to playlist');
        return await response.json();
    }

    static async removeTrackFromPlaylist(playlistId, trackId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        const response = await fetch(`${this.BASE_URL}/playlists/${playlistId}/tracks/${trackId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to remove track from playlist');
        return await response.json();
    }

    static async deletePlaylist(playlistId) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        const response = await fetch(`${this.BASE_URL}/playlists/${playlistId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete playlist');
        return await response.json();
    }

    static async updatePlaylist(playlistId, data = {}) {
        const token = this.getToken();
        if (!token) throw new Error('Необхідна авторизація');
        const response = await fetch(`${this.BASE_URL}/playlists/${playlistId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Failed to update playlist');
        return await response.json();
    }

    // ==================== STATISTICS ====================
    static async getStats() {
        try {
            const response = await fetch(`${this.BASE_URL}/tracks/stats/overview`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load stats');
            const result = await response.json();
            return result.stats || { tracks: 0, users: 0, playlists: 0 };
        } catch (err) {
            console.error('Error getting stats:', err);
            return { tracks: 0, users: 0, playlists: 0 };
        }
    }

    // ==================== DEBUG METHODS ====================
    static async testConnection() {
        try {
            const response = await fetch(`${this.BASE_URL}/health`);
            return {
                success: response.ok,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async testAdminEndpoint() {
        try {
            const response = await fetch(`${this.BASE_URL}/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`
                }
            });
            return {
                success: response.ok,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Додаємо API в глобальну область видимості
window.API = API;