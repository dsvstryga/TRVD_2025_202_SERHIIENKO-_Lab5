
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const User = require('../../models/user');

const validRoles = ['user', 'moderator', 'admin', 'banned'];
// GET /api/users - Отримати всіх користувачів (тільки для адмінів і модераторів)
router.get('/', requireAuth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser || !['admin', 'moderator'].includes(currentUser.role)) {
            return res.status(403).json({ success: false, message: 'Недостатньо прав для перегляду користувачів' });
        }
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        console.error('Помилка завантаження користувачів:', error);
        res.status(500).json({ success: false, message: 'Помилка завантаження користувачів' });
    }
});

// GET /api/users/profile - Отримати профіль поточного користувача
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-passwordHash');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }
        
        res.json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                banReason: user.banReason || null,
                bannedAt: user.bannedAt || null,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка завантаження профілю'
        });
    }
});

// PUT /api/users/profile - Оновити профіль поточного користувача
router.put('/profile', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { username, email } = req.body || {};

        const updates = {};
        if (username && typeof username === 'string') updates.username = username.trim();
        if (email && typeof email === 'string') updates.email = email.trim().toLowerCase();

        // Перевірка унікальності username/email
        if (updates.username) {
            const existing = await User.findOne({ username: updates.username, _id: { $ne: userId } });
            if (existing) {
                return res.status(401).json({ success: false, message: 'Користувач з таким іменем вже існує' });
            }
        }
        if (updates.email) {
            const existing = await User.findOne({ email: updates.email, _id: { $ne: userId } });
            if (existing) {
                return res.status(401).json({ success: false, message: 'Користувач з таким email вже існує' });
            }
        }

        const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
        }

        res.json({ 
            success: true, 
            message: 'Профіль оновлено', 
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                banReason: user.banReason || null,
                bannedAt: user.bannedAt || null,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Помилка оновлення профілю' });
    }
});

// POST /api/users/recent - mark a track as recently played
router.post('/recent', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { trackId } = req.body || {};
        if (!trackId) return res.status(400).json({ success: false, message: 'Missing trackId' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Remove existing entry for same track if present
        user.recentlyPlayed = (user.recentlyPlayed || []).filter(r => String(r.track) !== String(trackId));
        // Push to front
        user.recentlyPlayed.unshift({ track: trackId, playedAt: new Date() });
        // Keep only latest 100 entries
        if (user.recentlyPlayed.length > 100) user.recentlyPlayed = user.recentlyPlayed.slice(0, 100);
        await user.save();
        res.json({ success: true, recentlyPlayed: user.recentlyPlayed });
    } catch (err) {
        console.error('Mark recent error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/users/recent - get recent tracks for current user
router.get('/recent', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate('recentlyPlayed.track');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Filter out any recentlyPlayed entries whose referenced track was removed
        const originalLen = (user.recentlyPlayed || []).length;
        const cleaned = (user.recentlyPlayed || []).filter(r => !!r.track);
        if (cleaned.length !== originalLen) {
            // Persist cleaned list so deleted references don't reappear
            user.recentlyPlayed = cleaned;
            try { await user.save(); } catch (e) { console.warn('Could not persist cleaned recentlyPlayed', e); }
        }

        // Return the track objects directly, not wrapped in { track, playedAt }
        const recent = cleaned.map(r => r.track);
        res.json({ success: true, recent });
    } catch (err) {
        console.error('Get recent error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/users/favorite/:trackId - toggle favorite for current user
router.post('/favorite/:trackId', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { trackId } = req.params;
        const Track = require('../../models/track');
        const track = await Track.findById(trackId);
        if (!track) return res.status(404).json({ success: false, message: 'Track not found' });

        // Check current favorite status atomically
        const isFav = await User.exists({ _id: userId, favorites: trackId });

        let updatedUser;
        let updatedTrack;

        if (isFav) {
            // Remove favorite from user and user from track.likesUsers
            updatedUser = await User.findByIdAndUpdate(userId, { $pull: { favorites: trackId } }, { new: true });
            updatedTrack = await Track.findByIdAndUpdate(trackId, { $pull: { likesUsers: userId } }, { new: true });
        } else {
            // Add favorite (use $addToSet to avoid duplicates)
            updatedUser = await User.findByIdAndUpdate(userId, { $addToSet: { favorites: trackId } }, { new: true });
            updatedTrack = await Track.findByIdAndUpdate(trackId, { $addToSet: { likesUsers: userId } }, { new: true });
        }

        // If somehow updates failed
        if (!updatedUser || !updatedTrack) return res.status(500).json({ success: false, message: 'Failed to update favorite status' });

        res.json({ success: true, favorited: !isFav, likesCount: (updatedTrack.likesUsers || []).length });
    } catch (err) {
        console.error('Toggle favorite error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/users/favorites - get favorite tracks for current user
router.get('/favorites', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate('favorites');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, favorites: user.favorites || [] });
    } catch (err) {
        console.error('Get favorites error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Отримати всіх користувачів (JSON для фронтенду)
router.put('/:userId/role', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        // ...existing code...
        if (!role || typeof role !== 'string' || !validRoles.includes(role)) {
            return res.status(401).json({ success: false, message: 'Невірна або відсутня роль' });
        }

        // Не можна змінити власну роль
        if (req.user.userId === userId) {
            return res.status(401).json({
                success: false,
                message: 'Не можна змінити власну роль'
            });
        }

        // Отримати поточного користувача та цільового
        const currentUser = await User.findById(req.user.userId);
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
        }

        // Логіка для адмінів
        if (currentUser.role === 'admin') {
            // Адмін може змінювати роль будь-якого користувача
            // Але не може підвищити іншого адміна до вищої ролі (немає)
            // Може понизити іншого адміна
            // Просто дозволяємо змінювати на будь-яку роль
        } else if (currentUser.role === 'moderator') {
            // Модератор може змінювати роль лише на 'moderator', 'user', 'banned'
            if (!['moderator', 'user', 'banned'].includes(role)) {
                return res.status(403).json({ success: false, message: 'Модератор може призначати лише ролі: moderator, user, banned' });
            }
            // Модератор може понизити іншого модератора
            // Не може змінювати роль адміна
            if (targetUser.role === 'admin') {
                return res.status(403).json({ success: false, message: 'Модератор не може змінювати роль адміна' });
            }
        } else {
            // Інші ролі не можуть змінювати ролі
            return res.status(403).json({ success: false, message: 'Недостатньо прав для зміни ролі' });
        }

        // Оновлюємо роль користувача
        targetUser.role = role;
        await targetUser.save();

        res.json({
            success: true,
            message: `Роль користувача оновлено на: ${role}`,
            user: targetUser
        });
        
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

// Блокування користувача (API)
router.post('/:userId/ban', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body || {};

        // Перевіряємо чи не намагаємося заблокувати себе
        if (req.user.userId === userId) {
            return res.status(401).json({
                success: false,
                message: 'Не можна заблокувати власний акаунт'
            });
        }

        // Блокуємо користувача (змінюємо роль на banned) і зберігаємо причину
        const user = await User.findByIdAndUpdate(
            userId,
            { role: 'banned', banReason: reason || null, bannedAt: reason ? new Date() : new Date() },
            { new: true }
        ).select('-passwordHash');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }

        res.json({
            success: true,
            message: 'Користувача заблоковано',
            user: user
        });

    } catch (error) {
        console.error('Ban user error:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

// Розблокування користувача (API)
router.post('/:userId/unban', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        // Розблоковуємо користувача (повертаємо роль user) і очищаємо причину бана
        const user = await User.findByIdAndUpdate(
            userId,
            { role: 'user', banReason: null, bannedAt: null },
            { new: true }
        ).select('-passwordHash');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }

        res.json({
            success: true,
            message: 'Користувача розблоковано',
            user: user
        });

    } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

// Видалити користувача (адмін) - DELETE /api/users/:userId
router.delete('/:userId', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        // Не дозволяємо видаляти власний акаунт через цей ендпоінт
        if (req.user.userId === userId) {
            return res.status(401).json({ success: false, message: 'Не можна видалити власний акаунт' });
        }

        const user = await User.findByIdAndDelete(userId).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
        }

        res.json({ success: true, message: 'Користувача видалено', user });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Помилка сервера' });
    }
});

module.exports = router;