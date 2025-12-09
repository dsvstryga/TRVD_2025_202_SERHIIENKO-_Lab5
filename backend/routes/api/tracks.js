const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Track = require('../../models/track');
const { requireRole } = require('../../middleware/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Lightweight authenticate that sets req.user when a valid token present (optional)
const optionalAuthenticate = (req, res, next) => {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        req.user = decoded;
    } catch (e) {
        // ignore invalid token for public routes
    }
    return next();
};

// Configure multer storage for audio and cover uploads
const audioDir = path.join(__dirname, '..', '..', 'public', 'audio');
const coversDir = path.join(__dirname, '..', '..', 'public', 'covers');
try { fs.mkdirSync(audioDir, { recursive: true }); } catch (e) { /* ignore */ }
try { fs.mkdirSync(coversDir, { recursive: true }); } catch (e) { /* ignore */ }

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'cover') cb(null, coversDir);
        else cb(null, audioDir);
    },
    filename: function (req, file, cb) {
        const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-_]/g, '_')}`;
        cb(null, safeName);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'cover') {
        const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedImages.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Unsupported cover image type'), false);
    }
    // audio file
    const allowedAudio = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-wav'];
    if (allowedAudio.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported file type'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 60 * 1024 * 1024 } });


// GET /api/tracks - list tracks
router.get('/', optionalAuthenticate, async (req, res) => {
    try {
        const tracks = await Track.find().sort({ createdAt: -1 }).lean();
        console.log('GET /api/tracks -> found', tracks.length, 'tracks in DB');
        const sanitized = tracks.map(t => ({
            id: String(t._id),
            title: t.title,
            artist: t.artist,
            album: t.album,
            genre: t.genre,
            duration: t.duration,
            audioUrl: t.audioUrl,
            coverUrl: t.coverUrl || '',
            popularity: (typeof t.popularity === 'number') ? t.popularity : (t.popularity || 0),
            likesCount: (t.likesUsers || []).length,
            avgRating: (typeof t.getAverageRating === 'function') ? t.getAverageRating() : (t.ratings && t.ratings.length ? (t.ratings.reduce((s,r)=>s+r.value,0)/t.ratings.length) : 0),
            createdAt: t.createdAt
        }));
        console.log('GET /api/tracks -> returning', sanitized.length, 'sanitized tracks');
                res.json({ success: true, tracks: sanitized });
            } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

        // GET /api/tracks/stats/overview - get library statistics
        router.get('/stats/overview', async (req, res) => {
            try {
                const User = require('../../models/user');
                const Playlist = require('../../models/playlist');
        
                const trackCount = await Track.countDocuments();
                const userCount = await User.countDocuments();
                const playlistCount = await Playlist.countDocuments();
        
                res.json({
                    success: true,
                    stats: {
                        tracks: trackCount,
                        users: userCount,
                        playlists: playlistCount
                    }
                });
            } catch (err) {
                console.error('Stats error:', err);
                res.status(500).json({ success: false, message: 'Server error', stats: { tracks: 0, users: 0, playlists: 0 } });
            }
        });

// GET /api/tracks/:id - track detail
router.get('/:id', async (req, res) => {
    try {
        const t = await Track.findById(req.params.id).lean();
        if (!t) return res.status(404).json({ success: false, message: 'Track not found' });
        res.json({ success: true, track: t });
    } catch (err) {
        console.error('Error fetching track:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/tracks/:id/play - increment play/popularity counter
router.post('/:id/play', optionalAuthenticate, async (req, res) => {
    try {
        const trackId = req.params.id;
        const t = await Track.findById(trackId);
        if (!t) return res.status(404).json({ success: false, message: 'Track not found' });

        // Increment popularity counter
        t.popularity = (t.popularity || 0) + 1;
        await t.save();

        res.json({ success: true, track: { id: String(t._id), popularity: t.popularity } });
    } catch (err) {
        console.error('Increment play error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin: create a new track
router.post('/', optionalAuthenticate, async (req, res, next) => {
    // require a valid admin token
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    // reuse requireRole middleware behaviour by verifying fresh role
    try {
        // requireRole returns middleware that expects req.user to be present and will fetch fresh role from DB
        const roleMiddleware = requireRole('admin');
        return roleMiddleware(req, res, async () => {
            try {
                const { title, artist, album, genre, duration, audioUrl } = req.body;
                if (!title || !artist || !audioUrl) {
                    return res.status(400).json({ success: false, message: 'Missing required fields' });
                }
                const track = new Track({ title, artist, album, genre, duration: duration || 0, audioUrl, createdBy: req.user.userId || req.user.id });
                await track.save();
                res.status(201).json({ success: true, track });
            } catch (err) {
                console.error('Create track error:', err);
                res.status(500).json({ success: false, message: 'Server error' });
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Upload audio file and create track record (auth required, admin/moderator only)
router.post('/upload', optionalAuthenticate, async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    // require admin or moderator role
    const roleMiddleware = requireRole(['admin', 'moderator']);
    return roleMiddleware(req, res, async () => {
        // accept audio file and optional cover image
        upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }])(req, res, async (err) => {
            if (err) {
                console.error('Upload error:', err);
                return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
            }

            const file = req.files && req.files.file && req.files.file[0];
            const cover = req.files && req.files.cover && req.files.cover[0];
            if (!file) return res.status(400).json({ success: false, message: 'No audio file uploaded' });

            const { title, artist, album, genre, duration } = req.body;
            if (!title || !artist) {
                try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
                if (cover) try { fs.unlinkSync(cover.path); } catch (e) { /* ignore */ }
                return res.status(400).json({ success: false, message: 'Missing required metadata (title, artist)' });
            }

            try {
                const audioUrl = `/audio/${file.filename}`;
                const coverUrl = cover ? `/covers/${cover.filename}` : '';
                const track = new Track({ title, artist, album, genre, duration: duration || 0, audioUrl, coverUrl, createdBy: req.user.userId || req.user.id });
                await track.save();
                res.status(201).json({ success: true, track });
            } catch (err2) {
                console.error('Error creating track after upload:', err2);
                try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
                if (cover) try { fs.unlinkSync(cover.path); } catch (e) { /* ignore */ }
                res.status(500).json({ success: false, message: 'Server error' });
            }
        });
    });
});

// Admin: upload new cover for existing track
router.post('/:id/cover', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    // Any authenticated user can update their own track or admin can update any
    upload.single('cover')(req, res, async (err) => {
        if (err) {
            console.error('Cover upload error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        }
        if (!req.file) return res.status(400).json({ success: false, message: 'No cover uploaded' });
        try {
            // Check ownership
            const track = await Track.findById(req.params.id);
            if (!track) return res.status(404).json({ success: false, message: 'Track not found' });
            
            const userId = req.user.userId || req.user.id;
            const isOwner = String(track.createdBy) === String(userId);
            const isAdmin = req.user.role === 'admin';
            
            if (!isOwner && !isAdmin) {
                try { fs.unlinkSync(req.file.path); } catch (e) {}
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            
            const coverUrl = `/covers/${req.file.filename}`;
            const t = await Track.findByIdAndUpdate(req.params.id, { coverUrl }, { new: true });
            res.json({ success: true, track: t });
        } catch (err2) {
            console.error('Error updating track cover:', err2);
            try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });
});

// Update track metadata (owner or admin only)
router.put('/:id', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const track = await Track.findById(req.params.id);
        if (!track) return res.status(404).json({ success: false, message: 'Track not found' });
        
        // Check ownership
        const userId = req.user.userId || req.user.id;
        const isOwner = String(track.createdBy) === String(userId);
        const isAdmin = req.user.role === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        
        const update = req.body;
        const t = await Track.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json({ success: true, track: t });
    } catch (err) {
        console.error('Update track error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});



// Delete track (owner or admin only)
router.delete('/:id', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const track = await Track.findById(req.params.id);
        if (!track) return res.status(404).json({ success: false, message: 'Track not found' });
        
        // Check ownership
        const userId = req.user.userId || req.user.id;
        const isOwner = String(track.createdBy) === String(userId);
        const isAdmin = req.user.role === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        
        await Track.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete track error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
