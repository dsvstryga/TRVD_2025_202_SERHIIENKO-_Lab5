const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const jwt = require('jsonwebtoken');

// GET /api/profile - Отримати поточний профіль
router.get('/', async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-passwordHash');
        
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }

        res.json({
            data: user,
            links: [
                { href: '/api/profile', rel: 'self', type: 'GET' },
                { href: '/api/profile', rel: 'update', type: 'PUT' }
            ]
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

// PUT /api/profile - Оновити поточний профіль
router.put('/', async (req, res) => {
    try {
        const { username, email } = req.body;

        if (!username) {
            return res.status(401).json({ message: 'Username is required' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { username, email },
            { new: true, runValidators: true }
        ).select('-passwordHash');

        res.json({
            message: 'Profile updated successfully',
            data: updatedUser
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(401).json({ 
                message: 'Validation error', 
                errors: error.errors 
            });
        }
        if (error.code === 11000) {
            return res.status(409).json({ 
                message: 'Username or email already exists' 
            });
        }
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

module.exports = router;