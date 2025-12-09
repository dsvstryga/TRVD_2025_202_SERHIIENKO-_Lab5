const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');
const crypto = require('crypto'); // Згідно з лекцією

// Серверна сіль (згідно з лекцією)
const serverSalt = process.env.SERVER_SALT || 'musicflow-salt-2025';

// Функція хешування з лекції
function sha512(password, salt) {
    const hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    const value = hash.digest('hex');
    return value;
}

// Налаштування стратегії (згідно з лекцією - onLogin)
passport.use(new LocalStrategy(
    async (username, password, doneCB) => {
        try {
            const hashedPass = sha512(password, serverSalt);
            const user = await User.findOne({ 
                username: username, 
                passwordHash: hashedPass 
            });
            
            if (!user) {
                return doneCB(null, false, { message: 'Невірне ім\'я користувача або пароль' });
            }
            
            return doneCB(null, user);
        } catch (error) {
            return doneCB(error);
        }
    }
));

// Серіалізація (згідно з лекцією - onSerialize)
passport.serializeUser((user, doneCB) => {
    doneCB(null, user.id);
});

// Десеріалізація (згідно з лекцією - onDeserialize)
passport.deserializeUser(async (id, doneCB) => {
    try {
        const user = await User.findById(id);
        if (!user) doneCB("No user");
        else doneCB(null, user);
    } catch (error) {
        doneCB(error);
    }
});