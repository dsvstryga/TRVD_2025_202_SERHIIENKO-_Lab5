const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// Тут будуть маршрути для користувачів
// Наприклад:
router.get('/', requireAuth, (req, res) => {
    res.send('Сторінка користувачів - тільки для авторизованих');
});

router.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
    res.send('Адмін панель - тільки для адміністраторів');
});

module.exports = router;