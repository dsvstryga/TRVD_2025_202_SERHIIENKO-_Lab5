const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const User = require('../models/user');

// Головна адмін-панель (тільки для адмінів)
router.get('/', requireAuth, requireRole('admin'), (req, res) => {
    res.render('admin', { user: req.user });
});

// Список користувачів (тільки для адмінів)
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        
        // Додаємо віртуальні поля для шаблону
        const usersWithVirtuals = users.map(user => ({
            ...user.toObject(),
            isAdmin: user.role === 'admin',
            isModerator: user.role === 'moderator',
            isUser: user.role === 'user',
            isBanned: user.role === 'banned'
        }));
        
        res.render('admin-users', { 
            users: usersWithVirtuals,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading users:', error);
        res.render('error', { 
            message: 'Помилка завантаження користувачів',
            user: req.user
        });
    }
});

// Зміна ролі користувача (тільки для адмінів)
router.post('/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['user', 'moderator', 'admin', 'banned'];
        
        if (!validRoles.includes(role)) {
            return res.status(400).render('error', { 
                message: 'Невірна роль',
                user: req.user
            });
        }
        
        await User.findByIdAndUpdate(req.params.id, { role });
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error updating role:', error);
        res.render('error', { 
            message: 'Помилка оновлення ролі',
            user: req.user
        });
    }
});

// Блокування користувача (тільки для адмінів)
router.post('/users/:id/ban', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: 'banned' });
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error banning user:', error);
        res.render('error', { 
            message: 'Помилка блокування користувача',
            user: req.user
        });
    }
});

// Розблокування користувача (тільки для адмінів)
router.post('/users/:id/unban', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: 'user' });
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error unbanning user:', error);
        res.render('error', { 
            message: 'Помилка розблокування користувача',
            user: req.user
        });
    }
});

// Блокування/розблокування активності (тільки для адмінів)
router.post('/users/:id/toggle-active', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        user.isActive = !user.isActive;
        await user.save();
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error toggling active status:', error);
        res.render('error', { 
            message: 'Помилка оновлення статусу',
            user: req.user
        });
    }
});

module.exports = router;