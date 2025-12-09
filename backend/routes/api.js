const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// JWT middleware
const authenticateJWT = (req, res, next) => {
    // Спочатку перевіряємо Authorization header
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];

    // Потім перевіряємо cookies
    const tokenFromCookie = req.cookies?.token;

    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

// Публічні маршрути
router.use('/auth', require('./api/auth'));
// Tracks (public read, admin write)
router.use('/tracks', require('./api/tracks'));
// Playlists (public read, authenticated write/owner-management)
router.use('/playlists', require('./api/playlists'));
// Debug helpers
router.use('/debug', require('./api/debug'));

// Захищені маршрути
router.use('/users', authenticateJWT, require('./api/users'));
router.use('/profile', authenticateJWT, require('./api/profile'));

module.exports = router;