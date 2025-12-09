const User = require('../models/User');
const crypto = require('crypto'); // Згідно з лекцією

// Функція хешування з лекції
const serverSalt = process.env.SERVER_SALT || 'musicflow-salt-2025';
function sha512(password, salt) {
    const hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    const value = hash.digest('hex');
    return value;
}

exports.showRegister = (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('register');
};

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.render('register', { 
                error: 'Користувач з таким email або іменем вже існує' 
            });
        }
        
        // Використовуємо хешування з лекції SHA512
        const passwordHash = sha512(password, serverSalt);
        
        const user = new User({
            username,
            email,
            passwordHash,
            role: 'user'
        });
        
        await user.save();
        
        // Автоматичний вхід після реєстрації
        req.login(user, (err) => {
            if (err) {
                return res.redirect('/login');
            }
            return res.redirect('/');
        });
        
    } catch (error) {
        res.render('register', { error: 'Помилка реєстрації' });
    }
};

exports.showLogin = (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('login');
};

exports.logout = (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy((err) => {
            res.redirect('/');
        });
    });
};