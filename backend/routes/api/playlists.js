const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Playlist = require('../../models/playlist');
const Track = require('../../models/track');
const User = require('../../models/user');
const { requireRole } = require('../../middleware/auth');

const optionalAuthenticate = (req, res, next) => {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'musicflow-secret-key');
        req.user = decoded;
    } catch (e) {
        // ignore
    }
    return next();
};

// Public: list public playlists
router.get('/', optionalAuthenticate, async (req, res) => {
    try {
        // Return public playlists. If the request is authenticated, also include playlists owned by the user.
        let query;
        if (req.user) {
            const userId = req.user.userId || req.user.id || req.user._id;
            query = { $or: [ { isPublic: true }, { owner: userId } ] };
        } else {
            query = { isPublic: true };
        }
        // populate owner and tracks (small projection) so frontend can show covers
        const playlists = await Playlist.find(query)
            .populate('owner', 'username')
            .populate('tracks', 'title coverUrl')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, playlists });
    } catch (err) {
        console.error('Error listing playlists:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET single playlist (if public or owner/admin)
router.get('/:id', optionalAuthenticate, async (req, res) => {
    try {
        const p = await Playlist.findById(req.params.id).populate('tracks').populate('owner', 'username').lean();
        if (!p) return res.status(404).json({ success: false, message: 'Playlist not found' });
        if (!p.isPublic) {
            if (!req.user) return res.status(403).json({ success: false, message: 'Forbidden' });
            const userId = req.user.userId || req.user.id || req.user._id;
            if (p.owner && p.owner._id.toString() !== userId) {
                // allow admin
                const freshUser = await User.findById(userId).select('role');
                if (!freshUser || freshUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
            }
        }
        res.json({ success: true, playlist: p });
    } catch (err) {
        console.error('Error fetching playlist:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create playlist (authenticated users)
router.post('/', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const userId = req.user.userId || req.user.id || req.user._id;
        const { name, description, isPublic } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });
        const pl = new Playlist({ name, description: description || '', owner: userId, isPublic: !!isPublic, tracks: [] });
        await pl.save();
        res.status(201).json({ success: true, playlist: pl });
    } catch (err) {
        console.error('Create playlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update playlist (owner or admin)
router.put('/:id', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const userId = req.user.userId || req.user.id || req.user._id;
        const p = await Playlist.findById(req.params.id);
        if (!p) return res.status(404).json({ success: false, message: 'Playlist not found' });
        if (p.owner.toString() !== userId) {
            // allow admin
            const freshUser = await User.findById(userId).select('role');
            if (!freshUser || freshUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, description, isPublic } = req.body;
        if (name !== undefined) p.name = name;
        if (description !== undefined) p.description = description;
        if (isPublic !== undefined) p.isPublic = !!isPublic;
        // allow updating track order (array of track IDs)
        if (req.body.tracks !== undefined && Array.isArray(req.body.tracks)) {
            p.tracks = req.body.tracks;
        }
        await p.save();
        res.json({ success: true, playlist: p });
    } catch (err) {
        console.error('Update playlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete playlist (owner or admin)
router.delete('/:id', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const userId = req.user.userId || req.user.id || req.user._id;
        const p = await Playlist.findById(req.params.id);
        if (!p) return res.status(404).json({ success: false, message: 'Playlist not found' });
        if (p.owner.toString() !== userId) {
            const freshUser = await User.findById(userId).select('role');
            if (!freshUser || freshUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        await Playlist.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete playlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add a track to playlist
router.post('/:id/tracks', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const userId = req.user.userId || req.user.id || req.user._id;
        const { trackId } = req.body;
        if (!trackId) return res.status(400).json({ success: false, message: 'trackId required' });
        const p = await Playlist.findById(req.params.id);
        if (!p) return res.status(404).json({ success: false, message: 'Playlist not found' });
        if (p.owner.toString() !== userId) {
            const freshUser = await User.findById(userId).select('role');
            if (!freshUser || freshUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        // verify track exists
        const t = await Track.findById(trackId);
        if (!t) return res.status(404).json({ success: false, message: 'Track not found' });
        if (!p.tracks.includes(trackId)) p.tracks.push(trackId);
        await p.save();
        res.json({ success: true, playlist: p });
    } catch (err) {
        console.error('Add track to playlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Remove a track from playlist
router.delete('/:id/tracks/:trackId', optionalAuthenticate, async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    try {
        const userId = req.user.userId || req.user.id || req.user._id;
        const { id, trackId } = req.params;
        const p = await Playlist.findById(id);
        if (!p) return res.status(404).json({ success: false, message: 'Playlist not found' });
        if (p.owner.toString() !== userId) {
            const freshUser = await User.findById(userId).select('role');
            if (!freshUser || freshUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        p.tracks = p.tracks.filter(tid => tid.toString() !== trackId);
        await p.save();
        res.json({ success: true, playlist: p });
    } catch (err) {
        console.error('Remove track error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
