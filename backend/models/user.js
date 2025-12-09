const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        lowercase: true
    },
    passwordHash: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['user', 'moderator', 'admin', 'banned'], 
        default: 'user' 
    },
    isActive: {
        type: Boolean,
        default: true
    }
    ,
    banReason: {
        type: String,
        default: null
    },
    bannedAt: {
        type: Date,
        default: null
    }
    ,
    // Array of favorite track IDs (stored as references)
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    // Recently played: array of objects { track: ObjectId, playedAt: Date }
    recentlyPlayed: [{
        track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track' },
        playedAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

userSchema.virtual('isAdmin').get(function() {
    return this.role === 'admin';
});

userSchema.virtual('isModerator').get(function() {
    return this.role === 'moderator';
});

userSchema.virtual('isUser').get(function() {
    return this.role === 'user';
});

userSchema.virtual('isBanned').get(function() {
    return this.role === 'banned';
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);