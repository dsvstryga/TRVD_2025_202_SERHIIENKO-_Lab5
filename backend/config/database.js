const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/mylab3');
        console.log('✅ Підключено до MongoDB бази mylab3');
    } catch (error) {
        console.error('❌ Помилка підключення до MongoDB:', error);
        process.exit(1);
    }
};

module.exports = connectDB;