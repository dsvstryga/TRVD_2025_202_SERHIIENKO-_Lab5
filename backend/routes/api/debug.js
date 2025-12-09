const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../../models/user');

// GET /api/debug/whoami - returns decoded token and fresh role from DB (for debugging only)
router.get('/whoami', async (req, res) => {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return res.status(200).json({ success: true, authenticated: false });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        const user = decoded && decoded.userId ? await User.findById(decoded.userId).select('-passwordHash') : null;
        return res.json({ success: true, authenticated: true, tokenPayload: decoded, user: user ? {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        } : null });
    } catch (err) {
        return res.status(400).json({ success: false, message: 'Invalid token', error: err.message });
    }
});

module.exports = router;
