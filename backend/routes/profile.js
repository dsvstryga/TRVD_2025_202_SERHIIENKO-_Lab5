const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const jwt = require('jsonwebtoken');

// Middleware для перевірки JWT
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔐 Profile route - Auth header:', !!authHeader);
    console.log('🔐 Profile route - Token:', !!token);

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        console.log('✅ JWT verified, user:', user);
        req.user = user; // Додаємо user до req
        next();
    } catch (error) {
        console.log('❌ JWT verification failed:', error.message);
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

// GET /api/profile - Отримати поточний профіль
router.get('/', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Profile route - user from JWT:', req.user);
        
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ 
                message: 'User not authenticated' 
            });
        }

        const user = await User.findById(req.user.userId).select('-passwordHash');
        
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }

        console.log('✅ User from database:', {
            id: user._id,
            username: user.username,
            role: user.role,
            isActive: user.isActive
        });

        // Формуємо відповідь
        let userData;
        if (req.user.role === 'admin' || req.user.role === 'moderator') {
            userData = user;
        } else {
            userData = {
                username: user.username,
                email: user.email,
                isActive: user.isActive,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };
        }

        res.json({
            data: userData,
            links: [
                { href: '/api/profile', rel: 'self', type: 'GET' },
                { href: '/api/profile', rel: 'update', type: 'PUT' }
            ]
        });
    } catch (error) {
        console.error('❌ Profile route error:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

module.exports = router;