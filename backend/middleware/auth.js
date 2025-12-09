const User = require('../models/user');

// Middleware для перевірки автентифікації (згідно з лекцією)
const requireAuth = (req, res, next) => {
    if (req.user) return next();

    const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api');
    if (wantsJson) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    return res.status(401).render('error', { message: 'Not authorized' });
};

// Middleware для перевірки ролі (RBAC з лекції)
const requireRole = (role) => {
    // Allow passing an array of roles or a single role string
    const allowedRoles = Array.isArray(role) ? role : [role];
    
    return async (req, res, next) => {
        if (!req.user) {
            const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api');
            if (wantsJson) return res.status(401).json({ success: false, message: 'Not authorized' });
            return res.status(401).render('error', { message: 'Not authorized' });
        }

        try {
            // Перевіряємо роль безпосередньо в БД — це дозволяє змінювати роль без повторного логіну
            const userId = req.user.userId || req.user.id || req.user._id;
            const freshUser = await User.findById(userId).select('role username');
            if (!freshUser) {
                const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api');
                if (wantsJson) return res.status(401).json({ success: false, message: 'Not authorized' });
                return res.status(401).render('error', { message: 'Not authorized' });
            }

            if (!allowedRoles.includes(freshUser.role)) {
                const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api');
                if (wantsJson) return res.status(403).json({ success: false, message: 'Forbidden' });
                return res.status(403).render('error', { message: 'Forbidden' });
            }

            // Підмінюємо req.user на свіжі дані з БД
            req.user = {
                userId: freshUser._id.toString(),
                username: freshUser.username,
                role: freshUser.role
            };

            return next();
        } catch (err) {
            console.error('Role check error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    };
};

module.exports = { 
    requireAuth, 
    requireRole
};