require('dotenv').config();

const express = require('express');
const mustacheExpress = require('mustache-express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = 3000;

// ==================== ПІДКЛЮЧЕННЯ МОДЕЛІ ====================
const User = require('./models/user');
const Track = require('./models/track');

// Простий хеш-пароль з `sha512` + сіль
const serverSalt = process.env.SERVER_SALT || 'musicflow-salt-2025';
function hashPassword(password) {
    const h = crypto.createHmac('sha512', serverSalt);
    h.update(password);
    return h.digest('hex');
}

// ==================== ПІДКЛЮЧЕННЯ ДО БАЗИ ДАНИХ ====================
const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mylab3';
    try {
        console.log('🔌 Connecting to MongoDB:', mongoUri);
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ Помилка підключення до MongoDB:', error);
    }
};

// Connect to DB and then optionally seed demo tracks if collection is empty
connectDB().then(() => {
    // attempt to seed demo tracks (non-blocking)
    seedDemoTracks().catch(err => console.error('Seed demo tracks failed:', err));
});

// Seed some demo tracks if the Track collection is empty. This helps development/demo environments show items.
async function seedDemoTracks() {
    try {
        const count = await Track.countDocuments();
        if (count && count > 0) {
            console.log('✅ Tracks collection already has', count, 'documents — skipping demo seed');
            return;
        }

        console.log('🔁 Tracks collection empty — seeding demo tracks');
        const demo = [
            {
                title: 'Спи собі сама',
                artist: 'Скрябін',
                album: 'Demo Album',
                genre: 'Поп',
                duration: 210,
                audioUrl: '/audio/demo1.mp3',
                coverUrl: '/covers/demo1.jpg',
                popularity: 0,
                createdAt: new Date()
            },
            {
                title: 'Нічні дзвони',
                artist: 'Demo Artist',
                album: 'Demo Album 2',
                genre: 'Інді',
                duration: 185,
                audioUrl: '/audio/demo2.mp3',
                coverUrl: '/covers/demo2.jpg',
                popularity: 0,
                createdAt: new Date()
            }
        ];

        await Track.insertMany(demo);
        console.log('✅ Demo tracks seeded:', demo.map(d => d.title).join(', '));
    } catch (err) {
        console.error('Error seeding demo tracks:', err);
    }
}

// ==================== MIDDLEWARE ====================
// Allow requests from the frontend during development. Use FRONTEND_ORIGIN env var
// to restrict in production. Setting `origin: true` reflects request origin
// and works for same-origin and cross-origin dev setups.
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',') : true,
    credentials: true
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded or demo audio files from backend `public/audio` at `/audio/*`
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio')));
// Serve cover images
app.use('/covers', express.static(path.join(__dirname, 'public', 'covers')));

// ==================== КОНФІГУРАЦІЯ ШАБЛОНІЗАТОРА ====================
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', path.join(__dirname, 'views'));

// ==================== СЕСІЇ ====================
app.use(session({
    secret: process.env.SESSION_SECRET || 'SEGReT$25_2025',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false
    }
}));

// ==================== МІДЛВЕР ДЛЯ ПЕРЕВІРКИ JWT ====================
const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.query.token || 
                  req.cookies.token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Токен не надано' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Невалідний токен' 
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Доступ заборонено. Потрібні права адміністратора' 
        });
    }
    next();
};

// ==================== ПІДКЛЮЧЕННЯ ЗОВНІШНІХ РОУТІВ ====================
const adminRoutes = require('./routes/admin');
const apiUserRoutes = require('./routes/api/users');

app.use('/admin', adminRoutes);
// ...existing code...

// ==================== МАРШРУТИ ФРОНТЕНДУ ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/account', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/account.html'));
});

app.get('/library', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/library.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/about.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Mount centralized API router (routes/api.js) to keep all API routes consistent
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// ==================== ТЕСТОВІ МАРШРУТИ ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'REST API працює! 🎉',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        service: 'MusicFlow API',
        timestamp: new Date().toISOString()
    });
});

// Global error handler to return consistent JSON responses for API routes
app.use((err, req, res, next) => {
    console.error('Global error handler caught:', err);
    const wantsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api');
    if (wantsJson) {
        return res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
    }
    return res.status(err.status || 500).render('error', { message: err.message || 'Server error' });
});

// Дебаг маршрут для перевірки користувачів
app.get('/api/debug/users', async (req, res) => {
    try {
        const users = await User.find({});
        console.log('📊 ALL USERS IN DATABASE:');
        users.forEach(user => {
            console.log(`👤 ${user.username} (${user.email}):`, {
                id: user._id,
                password: user.password,
                role: user.role,
                isActive: user.isActive
            });
        });
        
        res.json({
            message: 'Users in database',
            count: users.length,
            users: users.map(u => ({
                id: u._id,
                username: u.username,
                email: u.email,
                password: u.password,
                role: u.role,
                isActive: u.isActive,
                createdAt: u.createdAt
            }))
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Скидання бази даних (для тестування)
app.post('/api/debug/reset-demo', async (req, res) => {
    try {
        // Видаляємо всіх користувачів
        await User.deleteMany({});
        console.log('🗑️ All users deleted');
        
        // Створюємо нових демо користувачів
        await createDemoUsers();
        
        res.json({
            success: true,
            message: 'Demo users reset successfully'
        });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== ЗАПУСК СЕРВЕРА ====================
app.listen(port, () => {
    console.log(`🚀 Сервер запущено на http://localhost:${port}`);
    console.log(`\n📁 Фронтенд доступний за шляхами:`);
    console.log(`   • http://localhost:${port}/ - Головна`);
    console.log(`   • http://localhost:${port}/account - Акаунт`);
    console.log(`   • http://localhost:${port}/profile - Профіль`);
    console.log(`   • http://localhost:${port}/admin - Адмінка`);
    console.log(`\n🔗 API доступний:`);
    console.log(`   • http://localhost:${port}/api/auth/login - Логін`);
    console.log(`   • http://localhost:${port}/api/auth/register - Реєстрація`);
    console.log(`   • http://localhost:${port}/api/admin/users - API користувачів`);
    console.log(`   • http://localhost:${port}/admin/users - HTML адмінка`);
    console.log(`   • http://localhost:${port}/api/debug/users - Дебаг користувачів`);
    // Demo account listing removed per configuration - no demo credentials printed
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Необроблена помилка:', err);
});