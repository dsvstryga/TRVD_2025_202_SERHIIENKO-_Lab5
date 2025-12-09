const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const router = express.Router();

const serverSalt = process.env.SERVER_SALT || 'musicflow-salt-2025';

function sha512(password, salt) {
    const hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    return hash.digest('hex');
}

// Маршрути реєстрації
router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).render('register', { 
                error: 'Усі поля обов\'язкові' 
            });
        }

        if (password.length < 6) {
            return res.status(400).render('register', { 
                error: 'Пароль має бути не менше 6 символів' 
            });
        }

        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(409).render('register', { 
                error: 'Користувач вже існує' 
            });
        }

        const passwordHash = sha512(password, serverSalt);
        const user = new User({
            username,
            email,
            passwordHash,
            role: 'user'
        });

        await user.save();

        // Створюємо JWT токен
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET || 'musicflow-secret-key',
            { expiresIn: '24h' }
        );

        // Зберігаємо токен в cookie або сесії
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/');

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).render('register', { 
            error: 'Помилка сервера' 
        });
    }
});

// Маршрути входу
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('Login attempt:', { username, password });

        if (!username || !password) {
            return res.status(400).render('login', { 
                error: 'Ім\'я користувача та пароль обов\'язкові' 
            });
        }

        const hashedPass = sha512(password, serverSalt);
        console.log('Hashed password:', hashedPass);

        const user = await User.findOne({ 
            username: username, 
            passwordHash: hashedPass 
        });

        console.log('Found user:', user);

        if (!user) {
            return res.status(401).render('login', { 
                error: 'Невірні облікові дані' 
            });
        }

        if (!user.isActive) {
            return res.status(403).render('login', { 
                error: 'Обліковий запис деактивовано' 
            });
        }

        const token = jwt.sign(
            { 
                userId: user._id.toString(), 
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET || 'musicflow-secret-key',
            { expiresIn: '24h' }
        );

        console.log('JWT token created for user:', user.username);

        // Зберігаємо токен в cookie
        res.cookie('token', token, { httpOnly: true });
        
        // Перенаправляємо на головну сторінку
        res.redirect('/');

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).render('login', { 
            error: 'Помилка сервера' 
        });
    }
});

// Вихід
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

module.exports = router;