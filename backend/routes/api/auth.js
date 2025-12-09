// БЕКЕНД: Виправлений routes/api/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../../models/user');
const crypto = require('crypto');

const serverSalt = process.env.SERVER_SALT || 'musicflow-salt-2025';

function sha512(password, salt) {
    const hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    return hash.digest('hex');
}

// POST /api/auth/register - Маршрут реєстрації
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(401).json({ 
                success: false,
                message: 'Username, email and password are required' 
            });
        }

        // Перевірка чи користувач вже існує
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(409).json({ 
                success: false,
                message: 'User with this email or username already exists' 
            });
        }

        // Створення нового користувача
        const hashedPassword = sha512(password, serverSalt);
        
        const newUser = new User({
            username,
            email,
            passwordHash: hashedPassword,
            role: 'user',
            isActive: true
        });

        await newUser.save();

        // Генерація токена
        const token = jwt.sign(
            { 
                userId: newUser._id.toString(),
                username: newUser.username,
                role: newUser.role
            },
            process.env.JWT_SECRET || 'musicflow-secret-key',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token: token,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            message: 'Server error during registration', 
            error: error.message 
        });
    }
});

// POST /api/auth/login - Маршрут входу
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(401).json({ 
                success: false,
                message: 'Username and password are required' 
            });
        }

        // Шукаємо користувача
        const hashedPass = sha512(password, serverSalt);
        const user = await User.findOne({ 
            username: username
        });

        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid credentials' 
            });
        }

        if (hashedPass !== user.passwordHash) {
            return res.status(401).json({ 
                message: 'Invalid credentials' 
            });
        }

        if (!user.isActive) {
            return res.status(403).json({ 
                message: 'Account is deactivated' 
            });
        }

        // Генерація токена
        const token = jwt.sign(
            { 
                userId: user._id.toString(), 
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET || 'musicflow-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

module.exports = router;