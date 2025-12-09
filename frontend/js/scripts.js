// js/scripts.js - ОНОВЛЕНИЙ плеєр та глобальні утиліти
class MusicPlayer {
    constructor() {
        this.isPlaying = false;
        this.currentTrack = null;
        this.progressInterval = null;
        this.volume = 70;
        this.shuffle = false; // when true, next track is chosen randomly
        // repeatMode: 0 = off, 1 = repeat all, 2 = repeat one
        this.repeatMode = 0;
        this._queue = this._queue || [];
        this._queueIndex = typeof this._queueIndex === 'number' ? this._queueIndex : 0;
        this._history = this._history || [];
        this.init();
    }

    // Expose a safe rebind method for SPA/PJAX swaps
    rebindAfterPjax() {
        try {
            this.playBtn = document.querySelector('.play-btn') || this.playBtn;
            this.progressBar = document.querySelector('.progress') || this.progressBar;
            this.volumeBar = document.querySelector('.volume-level') || this.volumeBar;
            this.currentTimeElement = document.querySelector('.current-time') || this.currentTimeElement;
            this.totalTimeElement = document.querySelector('.total-time') || this.totalTimeElement;
            // Reinstall delegated handlers are global; ensure UI icons reflect state
            this.updatePlayButtonIcon();
            // restore cover if currentTrack exists
            if (this.currentTrack) {
                this.updatePlayerInfo(this.currentTrack.title || '', this.currentTrack.artist || '', this.currentTrack.coverUrl || undefined);
            }
            // Re-attach event listeners to any newly-inserted controls
            try {
                if (typeof this.setupEventListeners === 'function') this.setupEventListeners();
                if (typeof this.setupTrackClicks === 'function') this.setupTrackClicks();
            } catch (e) { console.debug('rebindAfterPjax: re-setup listeners failed', e); }
        } catch (e) { console.debug('rebindAfterPjax failed', e); }
    }

    // Backwards-compatible init wrapper (constructor calls this.init())
    init() {
        try {
            if (typeof this.initializePlayer === 'function') this.initializePlayer();
            if (typeof this.setupTrackClicks === 'function') this.setupTrackClicks();
            if (typeof this.setupEventListeners === 'function') this.setupEventListeners();
        } catch (e) {
            console.debug('MusicPlayer.init failed', e);
        }
    }

    initializePlayer() {
        // Make the entire playlist card clickable and open the manager modal
        this.progressBar = document.querySelector('.progress');
        this.volumeBar = document.querySelector('.volume-level');
        this.currentTimeElement = document.querySelector('.current-time');
        this.totalTimeElement = document.querySelector('.total-time');
        // Reuse a single global audio element to avoid duplicates when scripts re-run (PJAX/navigation)
        this.audio = window._mf_globalAudio || document.querySelector('#audioPlayer') || new Audio();
        // Remember global reference so other re-initializations reuse the same element
        window._mf_globalAudio = this.audio;

        // Встановлюємо початковий стан
        if (this.progressBar) {
            this.progressBar.style.width = '0%';

        
        }
        if (this.volumeBar) {
            this.volumeBar.style.width = `${this.volume}%`;
        }

        // Setup audio event listeners (attach once to the shared audio element)
        if (this.audio) {
            if (!this.audio._mf_listeners_installed) {
                // update total time when metadata is available
                this.audio.addEventListener('loadedmetadata', () => {
                    if (this.totalTimeElement && this.audio.duration) {
                        const minutes = Math.floor(this.audio.duration / 60);
                        const seconds = Math.floor(this.audio.duration % 60);
                        this.totalTimeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    }
                });

                // update UI and periodically save playback state
                let _lastSave = 0;
                this.audio.addEventListener('timeupdate', () => {
                    if (this.progressBar && this.audio.duration) {
                        const percentage = (this.audio.currentTime / this.audio.duration) * 100;
                        this.progressBar.style.width = `${percentage}%`;

                        if (this.currentTimeElement) {
                            const minutes = Math.floor(this.audio.currentTime / 60);
                            const seconds = Math.floor(this.audio.currentTime % 60);
                            this.currentTimeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        }
                    }
                    const now = Date.now();
                    if (now - _lastSave > 3000) {
                        _lastSave = now;
                        try { this.savePlaybackState(); } catch (e) { }
                    }
                });

                // reflect ended state
                this.audio.addEventListener('ended', () => {
                    this.isPlaying = false;
                    try { this.savePlaybackState(); } catch (e) {}
                    try { console.debug('audio ended -> repeatMode=', this.repeatMode, 'shuffle=', this.shuffle, '_queueLen=', Array.isArray(this._queue)?this._queue.length:0, '_queueIndex=', this._queueIndex); } catch(e){}
                    this.nextTrack();
                });

                // save play/pause changes and trigger server-side increments/recents (debounced)
                this.audio.addEventListener('play', () => {
                    this.isPlaying = true; try{ this.savePlaybackState(); }catch(e){}
                    try {
                        const trackId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
                        if (trackId) {
                            // simple per-track debounce: only increment/mark recent once per 5 seconds
                            window._mf_lastIncrement = window._mf_lastIncrement || {};
                            const last = window._mf_lastIncrement[trackId] || 0;
                            const now = Date.now();
                            if (now - last > 5000) {
                                window._mf_lastIncrement[trackId] = now;
                                if (window.API && typeof window.API.incrementPlay === 'function') {
                                    window.API.incrementPlay(trackId).then(res => {
                                        try {
                                            const pop = res && res.track && (typeof res.track.popularity === 'number' ? res.track.popularity : null);
                                            if (pop !== null) window.updatePopularityDisplay(trackId, pop);
                                            else window.updatePopularityDisplay(trackId);
                                        } catch (e) { console.debug('incrementPlay handler failed', e); }
                                    }).catch(err => console.debug('incrementPlay failed', err));
                                }
                                // mark as recently played (if authenticated)
                                try {
                                    if (window.API && typeof window.API.markPlayed === 'function' && window.API.isAuthenticated && window.API.isAuthenticated()) {
                                        window.API.markPlayed(trackId).catch(e => console.debug('markPlayed failed', e));
                                    }
                                } catch (e) { console.debug('markPlayed call failed', e); }
                            }
                        }
                    } catch (e) { console.debug('audio play handler increment failed', e); }
                });
                this.audio.addEventListener('pause', () => { this.isPlaying = false; try{ this.savePlaybackState(); }catch(e){} });

                // mark listeners installed to avoid duplicate handlers
                this.audio._mf_listeners_installed = true;
            }

            // restore playback state from previous page if available
            try { this.loadPlaybackState(); } catch (e) { console.debug('loadPlaybackState failed', e); }
            // ensure volume/mute state is applied and UI shows it
            try {
                this.audio.volume = this.volume / 100;
                const muteIcon = document.querySelector('.player-actions .action-btn i.fa-volume-up, .player-actions .action-btn i.fa-volume-mute, .player-actions .action-btn i.fa-volume-off');
                if (muteIcon) {
                    const parentBtn = muteIcon.closest('button');
                    if (this.audio.muted) {
                        muteIcon.classList.remove('fa-volume-up');
                        muteIcon.classList.add('fa-volume-mute');
                    } else {
                        muteIcon.classList.remove('fa-volume-mute');
                        muteIcon.classList.add('fa-volume-up');
                    }
                }
            } catch (e) {}

            // persist on page unload
            try { window.addEventListener('beforeunload', () => { try { this.savePlaybackState(); } catch(e){} }); } catch(e) {}
        }
    }

    setupEventListeners() {
        // Prevent installing listeners multiple times (called from rebindAfterPjax)
        if (this._mf_eventListenersInstalled) return;
        this._mf_eventListenersInstalled = true;
        // Play/Pause
        if (this.playBtn) {
            // Stop propagation so the global delegated play handler doesn't also run
            this.playBtn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePlay(); });
        }

        // Progress bar
        const progressBarContainer = document.querySelector('.progress-bar');
        if (progressBarContainer) {
            progressBarContainer.addEventListener('click', (e) => this.seek(e));
        }

        // Volume control
        const volumeBarContainer = document.querySelector('.volume-bar');
        if (volumeBarContainer) {
            volumeBarContainer.addEventListener('click', (e) => this.setVolume(e));
        }

        // Mute / unmute button (player-actions volume icon)
        try {
            const actionBtns = Array.from(document.querySelectorAll('.player-actions .action-btn'));
            let found = false;
            for (const btn of actionBtns) {
                const icon = btn.querySelector('i');
                if (!icon) continue;
                if (icon.classList.contains('fa-volume-up') || icon.classList.contains('fa-volume-mute') || icon.classList.contains('fa-volume-off')) {
                    // wire this button as mute toggle
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (!this.audio) return;
                        this.audio.muted = !this.audio.muted;
                        if (this.audio.muted) {
                            icon.classList.remove('fa-volume-up');
                            icon.classList.add('fa-volume-mute');
                        } else {
                            icon.classList.remove('fa-volume-mute');
                            icon.classList.add('fa-volume-up');
                        }
                        try { this.savePlaybackState(); } catch (err) { console.debug('savePlaybackState failed on mute toggle', err); }
                        console.debug('Mute toggled, muted=', this.audio.muted);
                    });
                    found = true;
                    break;
                }
            }
            if (!found) console.debug('Mute button not found in .player-actions');
        } catch (e) { console.debug('mute button wiring failed', e); }

        // Control buttons
        const _prevEl = document.querySelector('.fa-step-backward');
        const prevBtn = _prevEl ? _prevEl.closest('.control-btn') : null;
        const _nextEl = document.querySelector('.fa-step-forward');
        const nextBtn = _nextEl ? _nextEl.closest('.control-btn') : null;
        const likeBtn = document.querySelector('.like-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousTrack());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextTrack());
        }

        if (likeBtn) {
            likeBtn.addEventListener('click', () => this.toggleLike());
        }

        // Shuffle and repeat buttons (if present)
        try {
            const shuffleIcon = document.querySelector('.fa-random');
            const shuffleBtn = document.querySelector('.shuffle-btn') || (shuffleIcon && shuffleIcon.closest('button'));
            if (shuffleBtn) shuffleBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleShuffle(); });

            const repeatIcon = document.querySelector('.fa-redo, .fa-sync');
            const repeatBtn = document.querySelector('.repeat-btn') || (repeatIcon && repeatIcon.closest('button'));
            if (repeatBtn) repeatBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleRepeat(); });
        } catch (e) { console.debug('shuffle/repeat wiring failed', e); }

        // Ensure UI reflects current modes on init
        try {
            const shuffleBtnInit = document.querySelector('.shuffle-btn') || (document.querySelector('.fa-random') && document.querySelector('.fa-random').closest('button'));
            if (shuffleBtnInit) shuffleBtnInit.classList.toggle('active', !!this.shuffle);
            const repeatBtnInit = document.querySelector('.repeat-btn') || (document.querySelector('.fa-redo') && document.querySelector('.fa-redo').closest('button'));
            if (repeatBtnInit) {
                repeatBtnInit.classList.toggle('active', this.repeatMode !== 0);
                repeatBtnInit.classList.toggle('repeat-one', this.repeatMode === 2);
                if (this.repeatMode === 0) repeatBtnInit.title = 'Повтор: вимк.';
                else if (this.repeatMode === 1) repeatBtnInit.title = 'Повтор: весь список';
                else repeatBtnInit.title = 'Повтор: поточний трек';
            }
        } catch (e) { console.debug('init shuffle/repeat UI failed', e); }

        // Search
        const searchInput = document.querySelector('.search-bar input');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce((e) => {
                console.log('🔍 Searching:', e.target.value);
            }, 300));
        }
    }

    setupTrackClicks() {
        // Avoid multiple delegated click handlers when re-binding
        if (this._mf_trackClicksInstalled) return;
        this._mf_trackClicksInstalled = true;
        // Обробники кліків для треків та карток
        document.addEventListener('click', (e) => {
            const trackItem = e.target.closest('.track-item');
            const artistCard = e.target.closest('.artist-card:not(.show-more-card)');
            const playlistCard = e.target.closest('.playlist-card');

            if (trackItem) {
                this.playOrToggleFromItem(trackItem);
                // Sync footer icon
                const footerIcon = document.querySelector('.like-btn i');
                if (footerIcon) {
                    const listIcon = trackItem.querySelector('.fav-btn i');
                    if (listIcon) {
                        if (listIcon.classList.contains('fas')) {
                            footerIcon.classList.remove('far'); footerIcon.classList.add('fas');
                        } else {
                            footerIcon.classList.remove('fas'); footerIcon.classList.add('far');
                        }
                    }
                }
            } else if (artistCard) {
                this.playArtist(artistCard);
            } else if (playlistCard) {
                this.playPlaylist(playlistCard);
            }
        });

        // Show More функціонал для артистів
        const showMoreCard = document.querySelector('.show-more-card');
        if (showMoreCard) {
            showMoreCard.addEventListener('click', () => this.toggleShowMore());
        }
    }

    togglePlay() {
        const _currentTitle = (this.currentTrack && this.currentTrack.title) ? this.currentTrack.title : 'none';
        console.log('🎵 togglePlay:', this.isPlaying ? 'pausing' : 'playing', 'currentTrack:', _currentTitle);

        if (!this.audio) {
            console.warn('togglePlay: audio element not available');
            return;
        }

        if (this.isPlaying) {
            // Currently playing — pause it
            console.log('togglePlay: pausing audio');
            this.isPlaying = false;
            this.audio.pause();
            console.log('✓ Paused');
            this.updatePlayButtonIcon();
        } else {
            // Currently paused — resume or start new track
            console.log('togglePlay: attempting to play, audio.src =', !!this.audio.src);
            if (!this.audio.src) {
                // No source set — try to load current track
                if (!this.currentTrack || !this.currentTrack.audioUrl) {
                    console.warn('togglePlay: no track to play');
                    return;
                }
                console.log('togglePlay: loading audio.src from currentTrack');
                try {
                    this.audio.src = normalizeAudioUrl(this.currentTrack.audioUrl);
                    this.audio.load();
                    console.log('togglePlay: set audio.src from currentTrack');
                } catch (e) {
                    console.error('togglePlay: failed to set audio.src', e);
                    return;
                }
            }

            this.isPlaying = true;
            this.updatePlayButtonIcon();
            const playPromise = this.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✓ togglePlay: playback started');
                }).catch(error => {
                    console.error('✗ togglePlay: play failed:', error.name, error.message);
                    this.isPlaying = false;
                    this.updatePlayButtonIcon();
                });
            }
        }
        try { this.savePlaybackState(); } catch(e) { console.debug('savePlaybackState on togglePlay failed', e); }
    }

    seek(e) {
        if (!this.progressBar || !this.audio || !this.audio.duration) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = (clickX / width) * 100;
        
        this.audio.currentTime = (percentage / 100) * this.audio.duration;
        this.progressBar.style.width = `${percentage}%`;
    }

    setVolume(e) {
        if (!this.volumeBar) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(100, (clickX / width) * 100));
        
        this.volume = percentage;
        this.volumeBar.style.width = `${this.volume}%`;
        
        if (this.audio) {
            this.audio.volume = this.volume / 100;
        }
    }

    updateTimeDisplay(percentage) {
        if (!this.currentTimeElement || !this.totalTimeElement) return;
        
        const totalSeconds = 150; // 2:30 хвилин
        const currentSeconds = Math.floor((percentage / 100) * totalSeconds);
        const minutes = Math.floor(currentSeconds / 60);
        const seconds = currentSeconds % 60;
        
        this.currentTimeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        this.totalTimeElement.textContent = '2:30';
    }

    playTrackFromItem(trackItem) {
        // Prefer explicit data attributes when available (used by generated items),
        // otherwise fall back to DOM text nodes used in list markup.
        const _titleEl = trackItem.querySelector('.track-title');
        const title = trackItem.getAttribute('data-title') || (_titleEl && _titleEl.textContent) || 'Невідомий трек';
        const _artistEl = trackItem.querySelector('.track-artist');
        const artist = trackItem.getAttribute('data-artist') || (_artistEl && _artistEl.textContent) || 'Невідомий виконавець';
        const coverUrl = trackItem.getAttribute('data-cover') || '/covers/default.png';
        const audioUrl = trackItem.getAttribute('data-audio') || '';
        const trackId = trackItem.getAttribute('data-id') || '';
        
        this.currentTrack = {
            title,
            artist,
            coverUrl,
            audioUrl,
            _id: trackId
        };
        
        console.log('playTrackFromItem: selected track', { title, artist, trackId });
        this.updatePlayerInfo(title, artist, coverUrl);
        // Sync footer like icon with the item's favorite state (if present)
        try {
            const footerIcon = document.querySelector('.like-btn i');
            const listIcon = trackItem.querySelector('.fav-btn i');
            if (footerIcon && listIcon) {
                if (listIcon.classList.contains('fas')) {
                    footerIcon.classList.remove('far'); footerIcon.classList.add('fas');
                } else {
                    footerIcon.classList.remove('fas'); footerIcon.classList.add('far');
                }
            }
        } catch (e) { /* ignore */ }
        this.playTrack();
    }

    // Play or toggle play for a clicked track item: if clicked the currently playing track -> toggle play/pause
    playOrToggleFromItem(trackItem) {
        try {
            const trackId = trackItem.getAttribute('data-id');
            const currentId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
            if (currentId && String(currentId) === String(trackId)) {
                // same track clicked -> toggle play/pause
                this.togglePlay();
                return;
            }
            // different track -> play it
            this.playTrackFromItem(trackItem);
        } catch (e) { console.debug('playOrToggleFromItem failed', e); }
    }

    playArtist(artistCard) {
        const _artistH = artistCard.querySelector('h3');
        const artistName = (_artistH && _artistH.textContent) ? _artistH.textContent : 'Невідомий артист';
        const _artistP = artistCard.querySelector('p');
        const artistInfo = (_artistP && _artistP.textContent) ? _artistP.textContent : 'Артист';
        
        const randomTracks = [
            'Найкращий хіт',
            'Популярний трек', 
            'Новий реліз',
            'Класична композиція'
        ];
        
        const randomTrack = randomTracks[Math.floor(Math.random() * randomTracks.length)];
        this.updatePlayerInfo(`${randomTrack} - ${artistName}`, artistName, undefined);
        this.playTrack();
    }

    playPlaylist(playlistCard) {
        const _plH = playlistCard.querySelector('h3');
        const playlistName = (_plH && _plH.textContent) ? _plH.textContent : 'Невідомий плейлист';
        this.updatePlayerInfo(`Плейлист: ${playlistName}`, 'MusicFlow', undefined);
        this.playTrack();
    }

    updatePlayerInfo(trackName, artistName, coverUrl) {
        const trackDetails = document.querySelector('.track-details');
        if (!trackDetails) return;

        const titleElement = trackDetails.querySelector('h4');
        const artistElement = trackDetails.querySelector('p');
        
        if (titleElement) titleElement.textContent = trackName;
        if (artistElement) artistElement.textContent = artistName;

        // Оновлюємо обкладинку в плеєрі (ціль — футерний елемент плеєра)
        const trackCover = document.querySelector('footer.music-player .track-cover-small') || document.querySelector('.track-cover-small');
        if (trackCover) {
            console.log('updatePlayerInfo: updating cover with URL:', coverUrl);
            if (coverUrl && coverUrl !== '/covers/default.png') {
                // Normalize cover URL to absolute path
                let normalizedCoverUrl = coverUrl;
                if (normalizedCoverUrl.startsWith('/')) {
                    const apiBase = APP_CONFIG.API_BASE_URL;
                    const backendBase = apiBase.replace(/\/api\/?$/, '');
                    normalizedCoverUrl = backendBase + normalizedCoverUrl;
                }
                
                // Use the actual cover image - ensure background is cleared
                trackCover.style.background = 'none';
                trackCover.style.backgroundImage = `url('${encodeURI(normalizedCoverUrl)}')`;
                trackCover.style.backgroundSize = 'cover';
                trackCover.style.backgroundPosition = 'center';
                console.log('updatePlayerInfo: set image background');
            } else {
                // Use gradient as fallback
                const colors = [
                    'linear-gradient(135deg, #667eea, #764ba2)',
                    'linear-gradient(135deg, #f093fb, #f5576c)',
                    'linear-gradient(135deg, #4facfe, #00f2fe)',
                    'linear-gradient(135deg, #43e97b, #38f9d7)',
                    'linear-gradient(135deg, #ff6b6b, #ffa726)'
                ];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                trackCover.style.backgroundImage = 'none';
                trackCover.style.background = randomColor;
                console.log('updatePlayerInfo: set gradient background');
            }
        } else {
            console.warn('updatePlayerInfo: .track-cover-small element not found');
        }

        // Скидаємо прогрес
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
        }
        this.updateTimeDisplay(0);
        // Sync footer favorite icon with server-side favorites.
        // If we don't have a cached fav set yet, fetch it asynchronously so the UI updates shortly after play.
        try {
            const likeIcon = document.querySelector('.like-btn i');
            const currentId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
            if (!likeIcon) return;

            const applyIcon = (fav) => {
                try {
                    if (fav) { likeIcon.classList.remove('far'); likeIcon.classList.add('fas'); }
                    else { likeIcon.classList.remove('fas'); likeIcon.classList.add('far'); }
                } catch (e) { /* ignore */ }
            };

            // If we have a cached set, use it immediately
            if (window._mf_favSet && currentId) {
                applyIcon(window._mf_favSet.has(String(currentId)));
                return;
            }

            // Otherwise, if authenticated, fetch favorites in background and update UI
            if (window.API && typeof window.API.isAuthenticated === 'function' && window.API.isAuthenticated()) {
                // Fire-and-forget: populate global cache and update icon when done
                window.API.getFavorites().then(favs => {
                    try {
                        window._mf_favSet = new Set();
                        if (Array.isArray(favs)) favs.forEach(f => window._mf_favSet.add(String(f._id || f.id || f)));
                        const isFavNow = currentId ? window._mf_favSet.has(String(currentId)) : false;
                        applyIcon(isFavNow);
                    } catch (e) {
                        console.debug('updatePlayerInfo: async favs handling failed', e);
                    }
                }).catch(err => {
                    console.debug('updatePlayerInfo: could not fetch favorites', err);
                });
            } else {
                // Not authenticated or no API: ensure icon shows not-favorited
                applyIcon(false);
            }
        } catch (e) { console.debug('updatePlayerInfo: sync favorite icon failed', e); }
    }

    // Save playback state to sessionStorage so it can survive navigation
    savePlaybackState() {
        try {
            const state = {
                currentTrack: this.currentTrack || null,
                isPlaying: !!this.isPlaying,
                currentTime: (this.audio && !isNaN(this.audio.currentTime)) ? Math.floor(this.audio.currentTime) : 0,
                volume: (typeof this.volume === 'number') ? this.volume : (this.audio ? Math.round((this.audio.volume || 0) * 100) : 70),
                muted: !!(this.audio && this.audio.muted)
            };
            sessionStorage.setItem('mf_playback', JSON.stringify(state));
        } catch (e) {
            console.debug('savePlaybackState failed', e);
        }
    }

    // Load playback state (if any) and restore audio src/time/UI
    loadPlaybackState() {
        try {
            const raw = sessionStorage.getItem('mf_playback');
            if (!raw) return;
            const state = JSON.parse(raw);
            if (!state || !state.currentTrack) return;
            this.currentTrack = state.currentTrack;
            // normalize audio and cover urls
            if (this.audio && this.currentTrack.audioUrl) {
                try {
                    this.audio.src = normalizeAudioUrl(this.currentTrack.audioUrl);
                } catch (e) {
                    console.debug('loadPlaybackState - normalizeAudioUrl failed', e);
                }
                if (typeof state.currentTime === 'number' && state.currentTime > 0) {
                    try { this.audio.currentTime = state.currentTime; } catch(e){}
                }
                // restore volume/muted if present
                if (typeof state.volume === 'number') {
                    try { this.volume = Math.max(0, Math.min(100, state.volume)); this.audio.volume = this.volume / 100; } catch(e){}
                }
                if (typeof state.muted === 'boolean') {
                    try { this.audio.muted = state.muted; } catch(e){}
                }
            }
            // update UI
            try { this.updatePlayerInfo(this.currentTrack.title || '', this.currentTrack.artist || '', this.currentTrack.coverUrl || undefined); } catch(e){}
            this.isPlaying = !!state.isPlaying;
            // attempt to resume if was playing (may be blocked, but we'll try)
            if (this.isPlaying && this.audio && this.audio.src) {
                const p = this.audio.play();
                if (p && typeof p.then === 'function') {
                    p.then(() => {
                        console.log('✓ Resumed playback after navigation');
                    }).catch((err) => {
                        console.debug('loadPlaybackState: autoplay blocked, user can click play button to resume:', err.name);
                        this.isPlaying = false;
                        this.updatePlayButtonIcon();
                    });
                }
            }
        } catch (e) {
            console.debug('loadPlaybackState failed', e);
        }
    }

    playTrack() {
        if (!this.currentTrack || !this.currentTrack.audioUrl) {
            console.warn('No track to play');
            return;
        }

        // Load audio URL
        if (!this.audio) {
            console.warn('Audio element not available');
            return;
        }

        let audioUrl = this.currentTrack.audioUrl;
        console.log('🎵 playTrack: raw audioUrl =', audioUrl);
        
        // Normalize URL - convert to absolute URL with backend base (not API base)
        if (audioUrl.startsWith('/')) {
            // If starts with /, use the backend origin (same as API_BASE_URL but without /api)
            const apiBase = APP_CONFIG.API_BASE_URL;
            const backendBase = apiBase.replace(/\/api\/?$/, ''); // Remove /api from the end
            audioUrl = backendBase + audioUrl;
        } else if (!/^https?:\/\//i.test(audioUrl)) {
            // If not already absolute, make it absolute
            const apiBase = APP_CONFIG.API_BASE_URL;
            const backendBase = apiBase.replace(/\/api\/?$/, '');
            audioUrl = backendBase + '/' + audioUrl.replace(/^\/+/, '');
        }

        // Encode URI to handle special characters
        try {
            audioUrl = encodeURI(audioUrl);
        } catch (e) {
            console.warn('Failed to encode audioUrl:', e);
        }
        
        console.log('🎵 playTrack: normalized audioUrl =', audioUrl);
        
        try {
            // First, stop current playback
            this.audio.pause();
            this.audio.currentTime = 0;
            
            // Set the source
            this.audio.src = audioUrl;
            console.log('🎵 playTrack: audio.src set, calling load()');
            
            // Attempt to load
            this.audio.load();
            
            // Try to play immediately - the browser will handle if it's not ready yet
            const playPromise = this.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✓ playTrack: playback started');
                    this.isPlaying = true;
                    this.updatePlayButtonIcon();
                        // record play into history for prev navigation
                        try {
                            if (!Array.isArray(this._history)) this._history = [];
                            const id = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
                            if (id) {
                                this._history.push(String(id));
                                if (this._history.length > 200) this._history.splice(0, this._history.length - 200);
                            }
                        } catch (e) { /* ignore history failures */ }
                    try { this.savePlaybackState(); } catch(e){}
                        // Increment play count on server for this track
                        try {
                            const trackId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
                            if (trackId && window.API && typeof window.API.incrementPlay === 'function') {
                                window.API.incrementPlay(trackId).then(res => {
                                    try {
                                        const pop = res && res.track && (typeof res.track.popularity === 'number' ? res.track.popularity : null);
                                        if (pop !== null) window.updatePopularityDisplay(trackId, pop);
                                        else window.updatePopularityDisplay(trackId);
                                    } catch (e) { console.debug('incrementPlay: updatePopularity failed', e); }
                                }).catch(err => { console.debug('incrementPlay failed', err); });
                            }
                        } catch (e) { console.debug('playTrack: incrementPlay call failed', e); }
                }).catch(error => {
                    console.error('✗ playTrack error:', error.name, error.message);
                    this.isPlaying = false;
                    this.updatePlayButtonIcon();
                });
            }
        } catch (err) {
            console.error('playTrack exception:', err);
            this.isPlaying = false;
            this.updatePlayButtonIcon();
        }
    }

    updatePlayButtonIcon() {
        const icon = this.playBtn ? this.playBtn.querySelector('i') : null;
        if (!icon) return;
        console.log('updatePlayButtonIcon: isPlaying =', this.isPlaying);
        if (this.isPlaying) {
            icon.classList.remove('fa-play');
            icon.classList.add('fa-pause');
        } else {
            icon.classList.remove('fa-pause');
            icon.classList.add('fa-play');
        }
    }

    toggleShuffle() {
        try {
            this.shuffle = !this.shuffle;
            const btn = document.querySelector('.shuffle-btn') || (document.querySelector('.fa-random') && document.querySelector('.fa-random').closest('button'));
            if (btn) btn.classList.toggle('active', this.shuffle);
            if (window.showNotification) window.showNotification(this.shuffle ? 'Рандом увімк.' : 'Рандом вимк.', 'info');
        } catch (e) { console.debug('toggleShuffle failed', e); }
    }

    toggleRepeat() {
        try {
            // cycle repeatMode: 0 -> 1 -> 2 -> 0
            this.repeatMode = (this.repeatMode + 1) % 3;
            const btn = document.querySelector('.repeat-btn') || (document.querySelector('.fa-redo') && document.querySelector('.fa-redo').closest('button'));
            if (btn) {
                btn.classList.toggle('active', this.repeatMode !== 0);
                btn.classList.toggle('repeat-one', this.repeatMode === 2);
                // update title/tooltip
                if (this.repeatMode === 0) btn.title = 'Повтор: вимк.';
                else if (this.repeatMode === 1) btn.title = 'Повтор: весь список';
                else btn.title = 'Повтор: поточний трек';
            }
            console.debug('toggleRepeat -> mode=', this.repeatMode);
            if (window.showNotification) {
                if (this.repeatMode === 0) window.showNotification('Повтор вимк.', 'info');
                else if (this.repeatMode === 1) window.showNotification('Повтор: весь список', 'info');
                else window.showNotification('Повтор: поточний трек', 'info');
            }
        } catch (e) { console.debug('toggleRepeat failed', e); }
    }


    previousTrack() {
        try {
            // If we have a playback queue, go to previous item if possible
            if (Array.isArray(this._queue) && this._queue.length > 0) {
                // If currently more than a few seconds into track, restart it
                try {
                    if (this.audio && this.audio.currentTime > 3) {
                        this.audio.currentTime = 0;
                        this.isPlaying = true;
                        this.updatePlayButtonIcon();
                        return;
                    }
                } catch (e) { /* ignore */ }

                if (this.shuffle) {
                    // pick a random different index
                    const len = this._queue.length;
                    if (len === 1) {
                        this._queueIndex = 0;
                    } else {
                        let idx = Math.floor(Math.random() * len);
                        if (String(this._queueIndex) === String(idx)) idx = (idx + 1) % len;
                        this._queueIndex = idx;
                    }
                    const prev = this._queue[this._queueIndex];
                    if (prev) { this.currentTrack = prev; this.updatePlayerInfo(prev.title||'', prev.artist||'', prev.coverUrl||prev.cover); try { this.playTrack(); } catch(e){} }
                    return;
                }
                if (typeof this._queueIndex === 'number' && this._queueIndex > 0) {
                    this._queueIndex = Math.max(0, this._queueIndex - 1);
                    const prev = this._queue[this._queueIndex];
                    if (prev) { this.currentTrack = prev; this.updatePlayerInfo(prev.title||'', prev.artist||'', prev.coverUrl||prev.cover); try { this.playTrack(); } catch(e){} }
                    return;
                }

                // At start of queue
                if (this.repeatMode === 1 && this._queue.length > 0) {
                    this._queueIndex = this._queue.length - 1;
                    const prev = this._queue[this._queueIndex];
                    if (prev) { this.currentTrack = prev; this.updatePlayerInfo(prev.title||'', prev.artist||'', prev.coverUrl||prev.cover); try { this.playTrack(); } catch(e){} }
                    return;
                }
            }

            // Fallback: restart current track
            // Try to find previous track in the DOM (same list) if available
            try {
                const currentId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
                if (currentId) {
                    const curEl = document.querySelector(`.track-item[data-id="${String(currentId)}"]`);
                    if (curEl && curEl.parentNode) {
                        const items = Array.from(curEl.parentNode.querySelectorAll('.track-item'));
                        const idx = items.indexOf(curEl);
                        if (idx > 0) {
                            const prevEl = items[idx-1];
                            if (prevEl) { this.playTrackFromItem(prevEl); return; }
                        } else if (this.repeatAll && items.length > 0) {
                            const prevEl = items[items.length-1];
                            if (prevEl) { this.playTrackFromItem(prevEl); return; }
                        }
                    }
                }
            } catch (e) { console.debug('previousTrack DOM fallback failed', e); }

            if (this.audio) {
                this.audio.currentTime = 0;
                this.isPlaying = true;
                this.updatePlayButtonIcon();
                try { this.savePlaybackState(); } catch (e) {}
            }
        } catch (e) { console.debug('previousTrack failed', e); }
    }

    nextTrack() {
        try {
            console.debug('nextTrack called -> repeatMode=', this.repeatMode, 'shuffle=', this.shuffle, '_queueLen=', Array.isArray(this._queue)?this._queue.length:0, '_queueIndex=', this._queueIndex);
            // If repeat-one mode is set, restart the current track immediately
            if (this.repeatMode === 2) {
                try {
                    if (this.audio) {
                        this.audio.currentTime = 0;
                        const p = this.audio.play();
                        this.isPlaying = true;
                        this.updatePlayButtonIcon();
                        console.debug('nextTrack: repeat-one restarted current track');
                        if (p && typeof p.then === 'function') p.catch(e => console.debug('repeat-one play failed', e));
                    }
                } catch (e) { console.debug('nextTrack repeat-one failed', e); }
                return;
            }
            if (Array.isArray(this._queue) && this._queue.length > 0) {
                const len = this._queue.length;
                if (this.shuffle) {
                    // pick random index
                    const idx = Math.floor(Math.random() * len);
                    this._queueIndex = idx;
                    const next = this._queue[this._queueIndex];
                    if (next) { this.currentTrack = next; this.updatePlayerInfo(next.title||'', next.artist||'', next.coverUrl||next.cover); try { this.playTrack(); } catch(e){} }
                    return;
                }
                this._queueIndex = (typeof this._queueIndex === 'number' ? this._queueIndex : 0) + 1;
                if (this._queueIndex >= this._queue.length) {
                    if (this.repeatMode === 1) {
                        // repeat all
                        this._queueIndex = 0;
                    } else if (this.repeatMode === 2) {
                        // repeat one: keep index at last and restart same track
                        this._queueIndex = this._queue.length - 1;
                        const same = this._queue[this._queueIndex];
                        if (same) { this.currentTrack = same; this.updatePlayerInfo(same.title||'', same.artist||'', same.coverUrl||same.cover); try { this.playTrack(); } catch(e){} }
                        return;
                    } else {
                        // reached end and not repeating
                        this._queueIndex = this._queue.length - 1;
                        this.isPlaying = false;
                        this.updatePlayButtonIcon();
                        console.debug('nextTrack: reached end of queue, repeat off');
                        return;
                    }
                }
                const next = this._queue[this._queueIndex];
                if (next) { this.currentTrack = next; this.updatePlayerInfo(next.title||'', next.artist||'', next.coverUrl||next.cover); try { this.playTrack(); } catch(e){} }
                return;
            }

            // No queue: just stop/reset progress
            // Try to play next track in the same visible list (DOM fallback)
            try {
                const currentId = this.currentTrack && (this.currentTrack._id || this.currentTrack.id || this.currentTrack.trackId);
                if (currentId) {
                    const curEl = document.querySelector(`.track-item[data-id="${String(currentId)}"]`);
                    if (curEl && curEl.parentNode) {
                        const items = Array.from(curEl.parentNode.querySelectorAll('.track-item'));
                        const idx = items.indexOf(curEl);
                        if (idx >= 0 && idx < items.length - 1) {
                            const nextEl = items[idx+1];
                            if (nextEl) { this.playTrackFromItem(nextEl); return; }
                        } else if (this.repeatAll && items.length > 0) {
                            const nextEl = items[0];
                            if (nextEl) { this.playTrackFromItem(nextEl); return; }
                        }
                    }
                }
            } catch (e) { console.debug('nextTrack DOM fallback failed', e); }

            if (this.progressBar) this.progressBar.style.width = '0%';
            this.updateTimeDisplay(0);
        } catch (e) { console.debug('nextTrack failed', e); }
    }

    // Set a playback queue: array of objects { _id, audioUrl, coverUrl, title, artist }
    setQueue(queue = []) {
        try {
            if (!Array.isArray(queue)) queue = [];
            this._queue = queue.slice();
            this._queueIndex = 0;
            if (this._queue.length > 0) {
                const first = this._queue[0];
                this.currentTrack = first;
                try { this.updatePlayerInfo(first.title || '', first.artist || '', first.coverUrl || undefined); } catch(e){}
                try { this.playTrack(); } catch(e) { console.debug('setQueue playTrack failed', e); }
            }
        } catch (e) { console.debug('setQueue failed', e); }
    }

    toggleLike() {
        const likeBtn = document.querySelector('.like-btn');
        if (!likeBtn) return;

        const icon = likeBtn.querySelector('i');

        // If no current track, inform user
        const current = this.currentTrack;
        if (!current || !(current._id || current.id || current.trackId)) {
            if (window.showNotification) window.showNotification('Виберіть трек, щоб додати улюблене', 'warning');
            return;
        }

        // Require authentication
        if (typeof window.API === 'undefined' || (typeof window.API.isAuthenticated === 'function' && !window.API.isAuthenticated())) {
            if (window.showNotification) window.showNotification('Увійдіть, щоб додати улюблене', 'warning');
            return;
        }

        // Call API to toggle favorite for current track and sync UI
        (async () => {
            try {
                const idStr = String(current._id || current.id || current.trackId || '');
                const res = await window.API.toggleFavorite(idStr);
                if (res && typeof res.favorited !== 'undefined') {
                    if (res.favorited) {
                        icon.classList.remove('far');
                        icon.classList.add('fas');
                        if (window.showNotification) window.showNotification('Додано до улюблених', 'success');
                    } else {
                        icon.classList.remove('fas');
                        icon.classList.add('far');
                        if (window.showNotification) window.showNotification('Видалено з улюблених', 'info');
                    }

                    // Sync any list fav buttons for this track
                    try {
                        // Update all matching fav buttons (be tolerant about id form)
                        const selectors = [
                            `.fav-btn[data-id="${idStr}"]`,
                            `.fav-btn[data-id="${idStr}"] .fa-heart`,
                        ];
                        const btns = document.querySelectorAll(`.fav-btn[data-id="${idStr}"]`);
                        btns.forEach(btn => {
                            const i = btn.querySelector('i');
                            if (!i) return;
                            if (res.favorited) { i.classList.remove('far'); i.classList.add('fas'); }
                            else { i.classList.remove('fas'); i.classList.add('far'); }
                        });
                    } catch (e) { /* ignore */ }
                    // Refresh favorites UI if present
                    try { if (typeof refreshFavorites === 'function') refreshFavorites(); } catch (e) {}
                } else {
                    // Fallback toggle if API returned unexpected shape
                    if (icon.classList.contains('far')) { icon.classList.replace('far', 'fas'); if (window.showNotification) window.showNotification('Додано до улюблених', 'success'); }
                    else { icon.classList.replace('fas', 'far'); if (window.showNotification) window.showNotification('Видалено з улюблених', 'info'); }
                }
                // Update global fav set cache so updatePlayerInfo and other UI reflect change immediately
                try {
                    if (!window._mf_favSet) window._mf_favSet = new Set();
                    if (res && typeof res.favorited !== 'undefined') {
                        if (res.favorited) window._mf_favSet.add(String(current._id));
                        else window._mf_favSet.delete(String(current._id));
                    }
                } catch (e) { console.debug('toggleLike: updating favSet failed', e); }
            } catch (err) {
                console.error('toggleLike API error', err);
                if (window.showNotification) window.showNotification('Помилка при збереженні', 'error');
            }
        })();
    }

    toggleShowMore() {
        const artistsGrid = document.querySelector('.artists-grid');
        const showMoreCard = document.querySelector('.show-more-card');
        
        if (!artistsGrid || !showMoreCard) return;

        artistsGrid.classList.toggle('compact');
        
        const title = showMoreCard.querySelector('h3');
        const subtitle = showMoreCard.querySelector('p');
        
        if (artistsGrid.classList.contains('compact')) {
            title.textContent = 'Менше';
            subtitle.textContent = 'Показати менше';
        } else {
            title.textContent = 'Більше';
            subtitle.textContent = 'Показати більше';
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Глобальний екземпляр плеєра (create only once)
if (!window.musicPlayer) window.musicPlayer = new MusicPlayer();

// Глобальна функція сповіщень (якщо ще не визначена)
if (typeof window.showNotification !== 'function') {
    window.showNotification = function(message, type = 'info') {
        console.log(`[Notification - ${type.toUpperCase()}]: ${message}`);
        
        // Створюємо сповіщення
        const notification = document.createElement('div');
        notification.textContent = message;
        
        let background = '#667eea'; // info
        if (type === 'success') background = '#1db954';
        else if (type === 'error') background = '#e22134';
        else if (type === 'warning') background = '#ffa726';

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            font-family: 'Roboto', sans-serif;
            max-width: 300px;
            background: ${background};
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.5s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        // Анімація входу
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);

        // Анімація виходу
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
        }, 4000);

        // Видалення
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4500);
    };
}

// Глобальний екземпляр плеєра (create only once)
if (!window.musicPlayer) window.musicPlayer = new MusicPlayer();

// Utility: update displayed popularity for a track in the DOM
window.updatePopularityDisplay = function(trackId, newCount) {
    try {
        if (!trackId) return;
        const nodes = Array.from(document.querySelectorAll(`.views-count[data-track="${trackId}"]`));
        if (!nodes.length) return;
        nodes.forEach(n => {
            if (typeof newCount === 'number') n.textContent = `${newCount} прослух.`;
            else {
                // if no newCount provided, increment displayed value
                const txt = (n.textContent||'').replace(/[^0-9]/g,'');
                const num = Number(txt) || 0;
                n.textContent = `${num+1} прослух.`;
            }
        });
    } catch (e) { console.debug('updatePopularityDisplay failed', e); }
};

// Глобальна функція сповіщень (якщо ще не визначена)
if (typeof window.showNotification !== 'function') {
    window.showNotification = function(message, type = 'info') {
        console.log(`[Notification - ${type.toUpperCase()}]: ${message}`);
        
        // Створюємо сповіщення
        const notification = document.createElement('div');
        notification.textContent = message;
        
        let background = '#667eea'; // info
        if (type === 'success') background = '#1db954';
        else if (type === 'error') background = '#e22134';
        else if (type === 'warning') background = '#ffa726';

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            font-family: 'Roboto', sans-serif;
            max-width: 300px;
            background: ${background};
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.5s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        // Анімація входу
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);

        // Анімація виходу
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
        }, 4000);

        // Видалення
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4500);
    };
}

// Reusable modal helper: returns Promise that resolves to {submitted: true, values} or {submitted:false}
window.showModal = function(options = {}) {
    return new Promise((resolve) => {
        const title = options.title || '';
        const fields = options.fields || []; // [{name, label, type='text', value}]
        const htmlMessage = options.message || '';
        const submitText = options.submitText || 'OK';
        const cancelText = options.cancelText || 'Відміна';

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'mf-modal-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10050; display:flex; align-items:center; justify-content:center;
        `;

        const dialog = document.createElement('div');
        dialog.className = 'mf-modal-dialog';
        dialog.style.cssText = `
            background: #111; color: #fff; padding: 18px; border-radius: 10px; width: 420px; max-width: 92%; box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            font-family: Roboto, sans-serif;
        `;

        if (title) {
            // header container to allow icon + title and background styling
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.style.margin = '0 0 8px 0';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '10px';

            if (options.icon) {
                // create a consistent icon container (wrapper) and an inner glyph element
                const iconWrap = document.createElement('div');
                iconWrap.className = 'modal-icon';
                iconWrap.setAttribute('aria-hidden', 'true');

                const glyph = document.createElement('i');
                glyph.className = options.icon; // e.g. 'fas fa-user-edit'
                glyph.setAttribute('aria-hidden', 'true');

                iconWrap.appendChild(glyph);
                header.appendChild(iconWrap);
            }

            const h = document.createElement('h3');
            h.textContent = title;
            h.style.margin = '0';
            h.style.fontSize = '1.15rem';
            header.appendChild(h);

            dialog.appendChild(header);
        }

        if (htmlMessage) {
            const p = document.createElement('div');
            p.innerHTML = htmlMessage.replace(/\n/g, '<br>');
            p.style.marginBottom = '8px';
            dialog.appendChild(p);
        }

        const form = document.createElement('form');
        form.style.display = 'flex';
        form.style.flexDirection = 'column';
        form.style.gap = '8px';

        const inputs = {};
        fields.forEach(f => {
            const label = document.createElement('label');
            label.style.fontSize = '13px';
            label.style.opacity = '0.9';
            label.textContent = f.label || f.name;

            const input = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
            input.type = f.type && f.type !== 'textarea' ? f.type : 'text';
            input.value = f.value || '';
            input.name = f.name;
            input.style.padding = '8px 10px';
            input.style.borderRadius = '6px';
            input.style.border = '1px solid rgba(255,255,255,0.08)';
            input.style.background = '#0f0f0f';
            input.style.color = '#fff';
            input.style.width = '100%';
            if (f.placeholder) input.placeholder = f.placeholder;

            label.appendChild(input);
            form.appendChild(label);
            inputs[f.name] = input;
        });

        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.gap = '8px';
        buttons.style.marginTop = '6px';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = cancelText;
        cancelBtn.className = 'mf-modal-cancel';
        cancelBtn.style.cssText = 'padding:8px 12px;border-radius:6px;background:transparent;color:#ddd;border:1px solid rgba(255,255,255,0.06);cursor:pointer;';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.textContent = submitText;
        submitBtn.className = 'mf-modal-submit';
        submitBtn.style.cssText = 'padding:8px 12px;border-radius:6px;background:#1db954;color:#072;cursor:pointer;border:none;font-weight:600;';

        buttons.appendChild(cancelBtn);
        buttons.appendChild(submitBtn);

        // Make sure the submit button triggers the form submit even when it's outside the form
        submitBtn.addEventListener('click', () => {
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                const evt = new Event('submit', { bubbles: true, cancelable: true });
                form.dispatchEvent(evt);
            }
        });

        dialog.appendChild(form);
        dialog.appendChild(buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve({ submitted: false });
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const values = {};
            Object.keys(inputs).forEach(k => values[k] = inputs[k].value);
            overlay.remove();
            resolve({ submitted: true, values });
        });

        // Focus first input
        setTimeout(() => {
            const first = Object.values(inputs)[0];
            if (first) first.focus();
        }, 10);
    });
};

// Smooth page transitions
document.addEventListener('DOMContentLoaded', function() {
    const mainContent = document.querySelector('.main-content');
    // Preserve references to the original footer and audio so we can reattach them if PJAX-loaded pages include their own
    // Store originals on window so they persist across PJAX / full navigations where this script may re-run
    window._mf_originalFooter = window._mf_originalFooter || document.querySelector('footer.music-player');
    window._mf_originalAudio = window._mf_originalAudio || document.querySelector('#audioPlayer');
    let _mf_originalFooter = window._mf_originalFooter;
    let _mf_originalAudio = window._mf_originalAudio;

    // If no footer/audio exists in the DOM (some pages omit it), create a minimal player shell so audio persists
    function createMissingPlayerShell() {
        try {
            if (!_mf_originalFooter) {
                const appContainer = document.querySelector('.app-container') || document.body;
                const footer = document.createElement('footer');
                footer.className = 'music-player';
                footer.innerHTML = `
                    <div class="player-inner">
                        <div class="track-details"><h4></h4><p></p></div>
                        <div class="player-controls"> <button class="play-btn"><i class="fas fa-play"></i></button> <div class="progress-bar"><div class="progress"></div></div></div>
                    </div>
                `;
                appContainer.appendChild(footer);
                _mf_originalFooter = footer;
                window._mf_originalFooter = footer;
            }
            if (!_mf_originalAudio) {
                // If a global audio instance already exists (MusicPlayer created it), reuse it and attach to DOM
                const globalAudio = window._mf_globalAudio;
                if (globalAudio && !(globalAudio instanceof HTMLAudioElement) === false) {
                    // it's already an HTMLAudioElement — ensure it has the correct id and is in DOM
                    try {
                        globalAudio.id = globalAudio.id || 'audioPlayer';
                        if (!globalAudio.isConnected) (document.body || document.documentElement).appendChild(globalAudio);
                        _mf_originalAudio = globalAudio;
                        window._mf_originalAudio = globalAudio;
                    } catch (e) {
                        // fallback: create a DOM audio and keep the globalAudio as the source holder
                        const audio = document.createElement('audio');
                        audio.id = 'audioPlayer';
                        audio.preload = 'metadata';
                        (document.body || document.documentElement).appendChild(audio);
                        _mf_originalAudio = audio;
                        window._mf_originalAudio = audio;
                    }
                } else if (globalAudio && typeof globalAudio === 'object' && globalAudio.src !== undefined && !(globalAudio instanceof HTMLAudioElement)) {
                    // globalAudio is a JS Audio object but not attached to DOM; reuse it by converting to DOM element
                    try {
                        // Create a real audio element and copy properties
                        const audio = document.createElement('audio');
                        audio.id = 'audioPlayer';
                        audio.preload = 'metadata';
                        audio.src = globalAudio.src || '';
                        audio.currentTime = globalAudio.currentTime || 0;
                        audio.volume = globalAudio.volume || 1;
                        audio.muted = !!globalAudio.muted;
                        (document.body || document.documentElement).appendChild(audio);
                        // Replace global reference so MusicPlayer will reuse this DOM element next time
                        window._mf_globalAudio = audio;
                        _mf_originalAudio = audio;
                        window._mf_originalAudio = audio;
                    } catch (e) {
                        const audio = document.createElement('audio');
                        audio.id = 'audioPlayer';
                        audio.preload = 'metadata';
                        (document.body || document.documentElement).appendChild(audio);
                        _mf_originalAudio = audio;
                        window._mf_originalAudio = audio;
                    }
                } else {
                    const audio = document.createElement('audio');
                    audio.id = 'audioPlayer';
                    audio.preload = 'metadata';
                    // append audio to body to keep it outside of page flow
                    (document.body || document.documentElement).appendChild(audio);
                    _mf_originalAudio = audio;
                    window._mf_originalAudio = audio;
                }
            }
        } catch (e) { console.debug('createMissingPlayerShell failed', e); }
    }
    createMissingPlayerShell();
    // Ensure MusicPlayer binds to the created DOM (if it exists) — helpful on pages that lacked footer
    try { if (window.musicPlayer && typeof window.musicPlayer.rebindAfterPjax === 'function') window.musicPlayer.rebindAfterPjax(); } catch(e) { console.debug('post-create rebindAfterPjax failed', e); }
    if (mainContent) {
        mainContent.style.animation = 'fadeInUp 0.5s ease-out';
    }
    
    // PJAX-style navigation: load `.html` pages via fetch and swap `.main-content`
    // This keeps the page shell (and the audio element) intact so playback doesn't stop.
    async function pjaxNavigate(href) {
        try {
            const resp = await fetch(href, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Failed to load ' + href);
            const text = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newMain = doc.querySelector('.main-content');
            const _titleEl = doc.querySelector('title');
            const newTitle = (_titleEl && _titleEl.textContent) ? _titleEl.textContent : document.title;

            if (!newMain) throw new Error('Loaded document has no .main-content');

            // exit animation
            if (mainContent) mainContent.style.animation = 'fadeOut 0.25s ease-in';
            await new Promise(r => setTimeout(r, 260));

            // replace content
            mainContent.innerHTML = newMain.innerHTML;
            document.title = newTitle;

            // Ensure the original footer/audio remain the single source of truth.
            // Some pages include their own footer or audio elements — remove those and restore our originals
            try {
                // Remove any footers introduced by the loaded page
                document.querySelectorAll('footer.music-player').forEach(f => {
                    if (f !== _mf_originalFooter && f.parentNode) {
                        f.parentNode.removeChild(f);
                    }
                });

                // Append original footer if it's not already in the document
                if (_mf_originalFooter && !_mf_originalFooter.isConnected) {
                    const appContainer = document.querySelector('.app-container') || document.body;
                    appContainer.appendChild(_mf_originalFooter);
                }

                // Remove any duplicate audio element created by loaded page
                document.querySelectorAll('#audioPlayer').forEach(a => {
                    if (a !== _mf_originalAudio && a.parentNode) {
                        a.parentNode.removeChild(a);
                    }
                });

                // Ensure our original audio element is present
                if (_mf_originalAudio && !_mf_originalAudio.isConnected) {
                    (document.body || document.documentElement).appendChild(_mf_originalAudio);
                }
            } catch (e) { console.debug('pjax: restore original footer/audio failed', e); }

            // entrance animation
            mainContent.style.animation = 'fadeInUp 0.35s ease-out';

            // Re-run page-level initializers that populate content
            try { if (typeof populateTracksLists === 'function') { console.log('pjax: running populateTracksLists'); populateTracksLists(); } } catch(e) { console.debug('pjax: populateTracksLists failed', e); }
            try { if (window.musicPlayer && typeof window.musicPlayer.setupTrackClicks === 'function') window.musicPlayer.setupTrackClicks(); } catch(e) {}
            try { if (window.musicPlayer && typeof window.musicPlayer.setupEventListeners === 'function') window.musicPlayer.setupEventListeners(); } catch(e) {}
            try { if (window.musicPlayer && typeof window.musicPlayer.rebindAfterPjax === 'function') window.musicPlayer.rebindAfterPjax(); } catch(e) {}

            // Ensure search wiring is re-initialized after PJAX page swap
            try { if (typeof initSearch === 'function') { console.log('pjax: running initSearch'); initSearch(); } } catch(e) { console.debug('pjax: initSearch failed', e); }
            try { if (typeof initSearchDropdown === 'function') { console.log('pjax: running initSearchDropdown'); initSearchDropdown(); } } catch(e) { console.debug('pjax: initSearchDropdown failed', e); }

            // If the newly loaded page has library/recent/favorites sections, initialize them
            try { if (typeof loadRecentlyPlayedInLibrary === 'function') loadRecentlyPlayedInLibrary(); } catch(e) {}
            try { if (typeof loadRandomSuggestions === 'function') loadRandomSuggestions(); } catch(e) { console.debug('pjax: loadRandomSuggestions failed', e); }
            try { if (typeof loadRecommendations === 'function') loadRecommendations(); } catch(e) { console.debug('pjax: loadRecommendations failed', e); }
            try { if (typeof initLibraryControls === 'function') initLibraryControls(); } catch(e) { console.debug('pjax: initLibraryControls failed', e); }
            try { if (typeof refreshFavorites === 'function') {
                // refresh after a tiny delay so populateTracksLists (if present) finishes rendering
                setTimeout(() => {
                    try { refreshFavorites(); } catch (err) { console.debug('pjax: refreshFavorites failed', err); }
                }, 120);
            } } catch(e) {}

            // Ensure auth UI is reconciled after PJAX swap (supports account/profile without full page refresh)
            try {
                if (window.authManager && typeof window.authManager.setupAuthForms === 'function') {
                    window.authManager.setupAuthForms();
                }
                if (window.authManager && typeof window.authManager.checkAuthState === 'function') {
                    // run check to switch to profile view if user is authenticated
                    window.authManager.checkAuthState();
                }
            } catch (e) { console.debug('pjax: auth rebind failed', e); }

            // push state so back/forward work
            history.pushState({ pjax: true, url: href }, newTitle, href);
        } catch (err) {
            console.error('PJAX navigation failed:', err);
            // fallback to full navigation
            window.location.href = href;
        }
    }

    // Delegated interception for internal .html links so newly-inserted anchors are handled too
    document.addEventListener('click', function(e) {
        try {
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href) return;

            // Do not intercept links with explicit target, download attribute, or external hosts
            if (a.target && a.target !== '' && a.target !== '_self') return;
            if (a.hasAttribute('download')) return;

            let abs;
            try { abs = new URL(href, location.href); } catch (err) { return; }
            if (abs.origin !== location.origin) return;

            // Only intercept internal HTML pages (no hash-only navigation)
            if (href.endsWith('.html') && !href.includes('#')) {
                e.preventDefault();
                pjaxNavigate(abs.href);
            }
        } catch (err) {
            // ignore
        }
    });

    // Handle back/forward navigation
    window.addEventListener('popstate', (e) => {
        const url = location.href;
        // load state without pushing
        fetch(url, { cache: 'no-store' }).then(r => r.text()).then(text => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newMain = doc.querySelector('.main-content');
            const _titleEl = doc.querySelector('title');
            const newTitle = (_titleEl && _titleEl.textContent) ? _titleEl.textContent : document.title;
            if (newMain && mainContent) {
                mainContent.innerHTML = newMain.innerHTML;
                document.title = newTitle;
                try { if (typeof populateTracksLists === 'function') populateTracksLists(); } catch(e) {}
                try { if (window.musicPlayer && typeof window.musicPlayer.setupTrackClicks === 'function') window.musicPlayer.setupTrackClicks(); } catch(e) {}
                try { if (typeof loadRandomSuggestions === 'function') loadRandomSuggestions(); } catch(e) { console.debug('popstate: loadRandomSuggestions failed', e); }
            }
        }).catch(err => { console.debug('popstate PJAX failed', err); });
    });
});

// Helper to format duration (seconds)
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const sec = Math.floor(Number(seconds));
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// Helper to normalize audio URLs to absolute paths
function normalizeAudioUrl(url) {
    if (!url) return '';
    let result = String(url || '');
    // Trim and remove control characters that may break URL parsing
    result = result.trim().replace(/[\x00-\x1F\x7F]/g, '');

    // Defensive normalization: fix common malformed cases
    try {
        // Replace backslashes with forward slashes
        result = result.replace(/\\+/g, '/');
        // Remove file:/// or file:\\ prefixes
        result = result.replace(/^file:\/\/(?:\\|\/)?/i, '');
        result = result.replace(/^file:\\+/i, '');

        // If protocol-relative URL (//example.com/path) add current protocol
        if (/^\/\//.test(result)) {
            result = window.location.protocol + result;
        }

        // If already absolute http/https, just encode and return
        if (/^https?:\/\//i.test(result)) {
            const enc = encodeURI(result);
            console.debug('normalizeAudioUrl ->', { original: url, normalized: enc });
            return enc;
        }

        // Build absolute URL reliably using backend base from config
        const apiBase = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.API_BASE_URL) ? APP_CONFIG.API_BASE_URL : '';
        const backendBase = (apiBase && apiBase.replace(/\/api\/?$/, '')) || (location.origin || '');
        const pathPart = result.startsWith('/') ? result : '/' + result.replace(/^\/+/, '');
        const full = new URL(pathPart, backendBase).href;
        const enc = encodeURI(full);
        // Warn for suspicious-looking inputs that required fixes
        if (enc.indexOf('%00') !== -1 || /\\/.test(String(url || ''))) {
            console.warn('normalizeAudioUrl: suspicious original URL fixed', { original: url, normalized: enc });
        }
        console.debug('normalizeAudioUrl ->', { original: url, normalized: enc });
        return enc;
    } catch (e) {
        console.warn('normalizeAudioUrl: failed to normalize', url, e);
        try { const enc = encodeURI(result); return enc; } catch (e2) { return result; }
    }
}

// Populate track lists from API
async function populateTracksLists() {
    try {
        console.log('📻 populateTracksLists: fetching tracks...');
        let tracks = await API.getTracks();
        // If user is authenticated, prefetch favorites to correctly mark fav icons in lists
        let favSet = new Set();
        try {
            if (typeof API !== 'undefined' && typeof API.isAuthenticated === 'function' && API.isAuthenticated()) {
                const favs = await API.getFavorites();
                if (Array.isArray(favs)) {
                    favs.forEach(f => {
                        const id = String(f._id || f.id || f);
                        favSet.add(id);
                    });
                }
            }
        } catch (e) { console.debug('populateTracksLists: could not load favorites', e); }
        // Expose cached favorites globally so player UI can sync immediately
        try {
            window._mf_favSet = new Set(favSet);
        } catch (e) { console.debug('populateTracksLists: failed to set global favSet', e); }
        console.log('📻 populateTracksLists: received', tracks && tracks.length ? tracks.length : 0, 'tracks');
        
        // Ensure we have a valid array
        if (!Array.isArray(tracks)) {
            console.warn('📻 populateTracksLists: API returned invalid data', tracks);
            // Show helpful message in each track list and offer demo fallback
            const trackListsHint = document.querySelectorAll('.tracks-list');
            trackListsHint.forEach(el => {
                try {
                    el.innerHTML = `<div class="loading-text">Не вдалося завантажити треки. Переконайтеся, що бекенд запущено на <code>${APP_CONFIG.API_BASE_URL.replace(/\/api\/?$/, '')}</code>. <button class="mf-load-demo">Завантажити демо</button></div>`;
                    const btn = el.querySelector('.mf-load-demo');
                    if (btn) btn.addEventListener('click', () => {
                        try { loadDemoTracks(); } catch (e) { console.debug('loadDemoTracks failed', e); }
                    });
                } catch (e) { /* ignore */ }
            });

            // If a demo set is already present, use it silently
            if (Array.isArray(window._mf_demo_tracks) && window._mf_demo_tracks.length) {
                tracks = window._mf_demo_tracks;
            } else {
                return;
            }
        }

        // Find all track list containers (include library which uses plain .tracks-list)
        const trackLists = document.querySelectorAll('.tracks-list');
        console.log('📻 populateTracksLists: found', trackLists.length, 'track list containers');
        console.log('📻 DEBUG: trackLists HTML:', Array.from(trackLists).map((el, i) => `[${i}] source=${el.dataset?.source || 'none'} class=${el.className}`).join('; '));

        // If a manage page genre filter exists, re-run populate when it changes
        const manageGenreSelect = document.getElementById('manageGenreFilter');
        if (manageGenreSelect) {
            try { manageGenreSelect.onchange = () => { try { populateTracksLists(); } catch(e) { console.debug('manageGenreFilter onchange failed', e); } }; } catch(e){}
        }

        trackLists.forEach((listEl, listIndex) => {
            // read current genre filter value (if any)
            const activeGenreFilter = (manageGenreSelect && manageGenreSelect.value) ? String(manageGenreSelect.value).trim() : '';
            // Skip lists that are specifically used for favorites — those are rendered by `refreshFavorites()`.
            if (listEl.dataset && String(listEl.dataset.source || '').toLowerCase() === 'favorites') {
                console.log('📻 populateTracksLists: skipping favorites container at index', listIndex);
                return;
            }
            // Build HTML for tracks
            let html = '';
            console.log('📻 DEBUG: processing listEl', listIndex, 'with', tracks.length, 'tracks');
            tracks.forEach((t, idx) => {
                // If a genre filter is active, skip tracks that don't match
                const trackGenre = (t.genre || '').trim() || 'Без жанру';
                if (activeGenreFilter && activeGenreFilter !== '' && activeGenreFilter !== trackGenre) {
                    return; // skip this track
                }
                const cover = t.coverUrl || '/covers/default.png';
                const trackId = String(t._id || t.id || '');
                const audioUrl = t.audioUrl || '';
                const genre = (t.genre || '').replace(/"/g, '');
                const isFav = favSet.has(String(trackId));
                // Render a checkbox for the manage page list (`#tracksList`), otherwise show the track number
                const leadingHtml = (listEl.id === 'tracksList')
                    ? `<input type="checkbox" class="select-track-checkbox" data-id="${trackId}" style="margin-left:8px;" />`
                    : `<div class="track-number">${idx + 1}</div>`;

                html += `
                    <div class="track-item" data-audio="${audioUrl}" data-id="${trackId}" data-cover="${cover}" data-genre="${genre}">
                        ${leadingHtml}
                        <div class="track-cover-small" style="background-image:url('${cover}');background-size:cover;background-position:center;position:relative;">
                            <div class="play-overlay"><i class="fas fa-play"></i></div>
                        </div>
                        <div class="track-info" style="flex:1;min-width:0;">
                            <h3 class="track-title" style="margin:0;font-size:1rem;">${(t.title || '').replace(/</g, '&lt;')}</h3>
                            <p class="track-artist" style="margin:2px 0 0 0;color:var(--text-secondary);font-size:0.9rem;">${(t.artist || '').replace(/</g, '&lt;')}</p>
                        </div>
                        <div class="track-views"><span class="views-count" data-track="${trackId}">${(t.popularity || 0)} прослух.</span></div>
                        <div class="track-duration" data-duration="${t.duration || 0}">${formatDuration(t.duration)}</div>
                        <button class="fav-btn" data-id="${trackId}" title="Улюблене"><i class="${isFav ? 'fas' : 'far'} fa-heart"></i></button>
                    </div>
                `;
            });

            listEl.innerHTML = html;
            console.log('📻 populateTracksLists[' + listIndex + ']: rendered', tracks.length, 'tracks');

            // Attach event handlers to play overlays and favorite buttons
            listEl.querySelectorAll('.track-item').forEach((trackEl, idx) => {
                const trackId = trackEl.getAttribute('data-id');
                
                // Play button (play-overlay or track-cover-small)
                const playOverlay = trackEl.querySelector('.play-overlay');
                const trackCover = trackEl.querySelector('.track-cover-small');
                
                    const playHandler = (e) => {
                        e.stopPropagation();
                        if (window.musicPlayer && typeof window.musicPlayer.playOrToggleFromItem === 'function') {
                            window.musicPlayer.playOrToggleFromItem(trackEl);
                            // Increment popularity when track is played (only when starting a different track)
                            try {
                                const currentId = window.musicPlayer.currentTrack && (window.musicPlayer.currentTrack._id || window.musicPlayer.currentTrack.id || window.musicPlayer.currentTrack.trackId);
                                if (!currentId || String(currentId) !== String(trackId)) {
                                    if (trackId && window.API && typeof window.API.incrementPlay === 'function') {
                                        window.API.incrementPlay(trackId).then(res => {
                                            try {
                                                const pop = res && res.track && (typeof res.track.popularity === 'number' ? res.track.popularity : null);
                                                if (pop !== null) window.updatePopularityDisplay(trackId, pop);
                                                else window.updatePopularityDisplay(trackId);
                                            } catch(e) { /* ignore */ }
                                        }).catch(err => console.warn('Failed to increment play count:', err));
                                    }
                                    if (trackId && window.API && typeof window.API.markPlayed === 'function') {
                                        window.API.markPlayed(trackId).catch(err => console.warn('Failed to mark as played:', err));
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        }
                    };
                
                if (playOverlay) {
                    playOverlay.addEventListener('click', playHandler);
                }
                if (trackCover) {
                    trackCover.addEventListener('click', playHandler);
                }
                
                // Favorite button
                const favBtn = trackEl.querySelector('.fav-btn');
                if (favBtn) {
                    favBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!trackId || !window.API) return;

                        // Prevent duplicate processing for same track (debounce per-track)
                        if (!window._mfFavProcessing) window._mfFavProcessing = new Set();
                        if (window._mfFavProcessing.has(String(trackId))) return;
                        window._mfFavProcessing.add(String(trackId));

                        // Require authentication
                        if (typeof window.API.isAuthenticated === 'function' && !window.API.isAuthenticated()) {
                            if (window.showNotification) window.showNotification('Увійдіть, щоб додати улюблене', 'warning');
                            // Optionally open login/account page
                            // window.location.href = 'account.html';
                            return;
                        }

                        const icon = favBtn.querySelector('i');
                        try {
                            const res = await window.API.toggleFavorite(trackId);
                            if (res && typeof res.favorited !== 'undefined') {
                                if (res.favorited) {
                                    icon.classList.replace('far', 'fas');
                                    if (window.showNotification) window.showNotification('Додано до улюблених', 'success');
                                } else {
                                    icon.classList.replace('fas', 'far');
                                    if (window.showNotification) window.showNotification('Видалено з улюблених', 'info');
                                }
                                // Update global favorites cache and refresh favorites UI
                                try {
                                    if (!window._mf_favSet) window._mf_favSet = new Set();
                                    if (res.favorited) window._mf_favSet.add(String(trackId)); else window._mf_favSet.delete(String(trackId));
                                    try { if (typeof refreshFavorites === 'function') refreshFavorites(); } catch (e) { /* ignore */ }
                                } catch (e) { console.debug('populateTracksLists fav handler: update favSet/refresh failed', e); }
                            } else {
                                // Unexpected response shape - toggle locally
                                const nowFav = icon.classList.contains('far');
                                if (nowFav) icon.classList.replace('far', 'fas'); else icon.classList.replace('fas', 'far');
                                if (window.showNotification) window.showNotification('Оновлено улюблене', 'info');
                            }
                        } catch (err) {
                            console.error('Toggle favorite error:', err);
                            if (window.showNotification) window.showNotification('Помилка при збереженні', 'error');
                        } finally {
                            try { window._mfFavProcessing.delete(String(trackId)); } catch (e) {}
                        }
                    });
                }
                // Attach 'Add to playlist' button for library UI
                try { attachAddToPlaylistButton(trackEl); } catch (e) { /* ignore */ }
            });

            // Load durations for tracks that have 0 duration using audio metadata
            const trackItems = Array.from(listEl.querySelectorAll('.track-item'));
            console.log('📻 populateTracksLists[' + listIndex + ']: loading durations for', trackItems.length, 'tracks...');

            // Create a throttled queue to avoid too many parallel audio loads
            let qIndex = 0;
            const loadNext = async () => {
                if (qIndex >= trackItems.length) {
                    console.log('📻 populateTracksLists[' + listIndex + ']: duration load complete');
                    return;
                }
                
                const trackEl = trackItems[qIndex++];
                const durationEl = trackEl.querySelector('.track-duration');
                const audioUrl = trackEl.getAttribute('data-audio');
                const storedDuration = durationEl.getAttribute('data-duration');
                const numDuration = Number(storedDuration) || 0;

                // If duration is already set and non-zero, skip
                if (numDuration > 0) {
                    return setTimeout(loadNext, 20);
                }

                // Try to load duration from audio metadata
                if (!audioUrl) {
                    durationEl.textContent = formatDuration(0);
                    return setTimeout(loadNext, 20);
                }

                durationEl.textContent = '…';
                const audio = new Audio();
                audio.preload = 'metadata';

                const onMetadata = () => {
                    try {
                        const dur = Math.floor(audio.duration || 0);
                        durationEl.textContent = formatDuration(dur);
                        durationEl.setAttribute('data-duration', dur);
                    } catch (e) {
                        durationEl.textContent = formatDuration(0);
                    }
                    cleanup();
                    setTimeout(loadNext, 50);
                };

                const onError = () => {
                    durationEl.textContent = formatDuration(0);
                    cleanup();
                    setTimeout(loadNext, 50);
                };

                const cleanup = () => {
                    audio.removeEventListener('loadedmetadata', onMetadata);
                    audio.removeEventListener('error', onError);
                    try { audio.src = ''; } catch (e) {}
                };

                audio.addEventListener('loadedmetadata', onMetadata, { once: true });
                audio.addEventListener('error', onError, { once: true });

                try {
                    const normalized = normalizeAudioUrl(audioUrl);
                    // If normalization produced an empty string or clearly invalid value, log and skip
                    if (!normalized || typeof normalized !== 'string' || !/^https?:\/\//i.test(normalized)) {
                        console.warn('📻 populateTracksLists: invalid normalized audio URL, skipping duration load', { audioUrl, normalized });
                        durationEl.textContent = formatDuration(0);
                        return setTimeout(loadNext, 20);
                    }
                    console.debug('📻 Verifying audio URL with HEAD ->', normalized);
                    try {
                        const head = await fetch(normalized, { method: 'HEAD' });
                        if (!head.ok) {
                            console.warn('📻 populateTracksLists: audio HEAD failed', normalized, head.status);
                            durationEl.textContent = formatDuration(0);
                            return setTimeout(loadNext, 20);
                        }
                        console.debug('📻 HEAD OK, assigning audio.src ->', normalized);
                        audio.src = normalized;
                    } catch (fetchErr) {
                        console.warn('📻 populateTracksLists: audio HEAD request failed', normalized, fetchErr);
                        durationEl.textContent = formatDuration(0);
                        return setTimeout(loadNext, 20);
                    }
                } catch (e) {
                    console.warn('📻 Failed to set audio src for', audioUrl, e);
                    durationEl.textContent = formatDuration(0);
                    setTimeout(loadNext, 20);
                }
            };

            loadNext();
        });
        // Update header counts after tracks are loaded
        try { if (typeof updateLibraryCounts === 'function') updateLibraryCounts(); } catch (e) { console.debug('populateTracksLists: updateLibraryCounts failed', e); }
    } catch (err) {
        console.error('❌ populateTracksLists error:', err);
    }
}

// Update the library header counts: total tracks, favorites, playlists
async function updateLibraryCounts() {
    try {
        const tracksCountEl = document.getElementById('libTracksCount');
        const favsCountEl = document.getElementById('libFavsCount');
        const plsCountEl = document.getElementById('libPlaylistsCount');

        // Default to zeros if elements missing
        if (!tracksCountEl && !favsCountEl && !plsCountEl) return;

        let tracks = [];
        let favs = [];
        let pls = [];

        try { if (window.API && typeof window.API.getTracks === 'function') tracks = await window.API.getTracks(); } catch(e){ console.debug('updateLibraryCounts: getTracks failed', e); }
        try { if (window.API && typeof window.API.getFavorites === 'function') favs = await window.API.getFavorites(); } catch(e){ console.debug('updateLibraryCounts: getFavorites failed', e); }
        try { if (window.API && typeof window.API.getPlaylists === 'function') pls = await window.API.getPlaylists(); } catch(e){ console.debug('updateLibraryCounts: getPlaylists failed', e); }

        const tracksLen = Array.isArray(tracks) ? tracks.length : 0;
        const favsLen = Array.isArray(favs) ? favs.length : 0;
        const plsLen = Array.isArray(pls) ? pls.length : 0;

        if (tracksCountEl) tracksCountEl.textContent = String(tracksLen);
        if (favsCountEl) favsCountEl.textContent = String(favsLen);
        if (plsCountEl) plsCountEl.textContent = String(plsLen);
    } catch (e) { console.debug('updateLibraryCounts failed', e); }
}

// Call on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📻 Running populateTracksLists on DOMContentLoaded');
    // Initialize search wiring on pages where search input exists
    try { if (typeof initSearch === 'function') initSearch(); } catch(e) { console.debug('initSearch failed', e); }
    populateTracksLists();
    try { if (typeof loadRandomSuggestions === 'function') loadRandomSuggestions(); } catch(e) { console.debug('loadRandomSuggestions failed on DOMContentLoaded', e); }
    try { if (typeof loadRecommendations === 'function') loadRecommendations(); } catch(e) { console.debug('loadRecommendations failed on DOMContentLoaded', e); }
    try {
        if (document.querySelector('.tracks-list[data-source="favorites"]')) {
            refreshFavorites();
        }
    } catch (e) { /* ignore */ }
    try { initLibraryControls(); } catch(e) { console.debug('initLibraryControls failed on DOMContentLoaded', e); }
});

// Wire the 'Випадкові' refresh button to reload random suggestions
try {
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('refreshRandom');
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            try {
                btn.disabled = true;
                const prevText = btn.textContent;
                btn.textContent = 'Завантаження...';
                const p = (typeof loadRandomSuggestions === 'function') ? loadRandomSuggestions() : Promise.resolve();
                p.finally(() => {
                    btn.disabled = false;
                    btn.textContent = prevText;
                });
            } catch (err) {
                console.debug('refreshRandom click handler failed', err);
                try { btn.disabled = false; btn.textContent = 'Випадкові ↻'; } catch(e){}
            }
        });
    });
} catch (e) { console.debug('attach refreshRandom failed', e); }

// Also call after a slight delay to catch late-loaded API
setTimeout(() => {
    console.log('📻 Running populateTracksLists on delayed timer');
    populateTracksLists();
}, 800);

// Listen for track updates dispatched by other pages (e.g., upload form)
try {
    window.addEventListener('tracks:updated', () => {
        console.log('event: tracks:updated received — refreshing lists');
        try { if (typeof populateTracksLists === 'function') populateTracksLists(); } catch(e) { console.debug('tracks:updated -> populateTracksLists failed', e); }
        try { if (typeof initSearchDropdown === 'function') initSearchDropdown(); } catch(e) { console.debug('tracks:updated -> initSearchDropdown failed', e); }
    });
} catch(e) { console.debug('attach tracks:updated listener failed', e); }

// Also listen to storage events in case upload occurred in another tab
try {
    window.addEventListener('storage', (e) => {
        if (e.key === 'tracksUpdatedAt') {
            console.log('storage: tracksUpdatedAt changed — refreshing lists');
            try { if (typeof populateTracksLists === 'function') populateTracksLists(); } catch(err) { console.debug('storage handler populate failed', err); }
            try { if (typeof initSearchDropdown === 'function') initSearchDropdown(); } catch(err) { console.debug('storage handler initSearchDropdown failed', err); }
        }
    });
} catch(e) { console.debug('attach storage listener failed', e); }

console.log('✅ Player and utilities script loaded');

// Ensure a delegated play/pause handler exists so footer play button always works
if (!window._mf_play_delegate_installed) {
    document.addEventListener('click', (e) => {
        try {
            const btn = e.target.closest && e.target.closest('.control-btn.play-btn');
            if (btn) {
                e.preventDefault();
                if (window.musicPlayer && typeof window.musicPlayer.togglePlay === 'function') {
                    window.musicPlayer.togglePlay();
                }
            }
        } catch (err) { /* ignore */ }
    });
    window._mf_play_delegate_installed = true;
}

// Delegated handler for favorite buttons and mute toggle so handlers survive PJAX
if (!window._mf_delegate_handlers_installed) {
    document.addEventListener('click', async (e) => {
        try {
            // Favorite toggle (heart)
            const fav = e.target.closest && e.target.closest('.fav-btn');
            if (fav) {
                e.stopPropagation();
                const trackId = fav.getAttribute('data-id');
                const icon = fav.querySelector('i');
                if (!trackId) return;
                if (!window.API) return;

                // Prevent duplicate processing for same track (debounce per-track)
                if (!window._mfFavProcessing) window._mfFavProcessing = new Set();
                if (window._mfFavProcessing.has(String(trackId))) return;
                window._mfFavProcessing.add(String(trackId));

                if (typeof window.API.isAuthenticated === 'function' && !window.API.isAuthenticated()) {
                    if (window.showNotification) window.showNotification('Увійдіть, щоб додати улюблене', 'warning');
                    try { window._mfFavProcessing.delete(String(trackId)); } catch (e) {}
                    return;
                }
                try {
                    const res = await window.API.toggleFavorite(trackId);
                    if (res && typeof res.favorited !== 'undefined') {
                        if (res.favorited) icon.classList.replace('far', 'fas'); else icon.classList.replace('fas', 'far');

                        // Sync footer like button if it refers to the same track
                        try {
                            const footerIcon = document.querySelector('.like-btn i');
                            if (footerIcon) {
                                if (res.favorited) { footerIcon.classList.remove('far'); footerIcon.classList.add('fas'); }
                                else { footerIcon.classList.remove('fas'); footerIcon.classList.add('far'); }
                            }
                        } catch (e) { /* ignore */ }
                        // Update global favorites cache and refresh favorites UI
                        try {
                            if (!window._mf_favSet) window._mf_favSet = new Set();
                            if (res.favorited) window._mf_favSet.add(String(trackId)); else window._mf_favSet.delete(String(trackId));
                            try { if (typeof refreshFavorites === 'function') refreshFavorites(); } catch (e) { /* ignore */ }
                        } catch (e) { console.debug('delegate fav handler: update favSet/refresh failed', e); }
                    } else {
                        // fallback toggle
                        if (icon.classList.contains('far')) icon.classList.replace('far', 'fas'); else icon.classList.replace('fas', 'far');
                    }
                } catch (err) {
                    console.error('fav delegate error', err);
                    if (window.showNotification) window.showNotification('Помилка при збереженні', 'error');
                } finally {
                    try { window._mfFavProcessing.delete(String(trackId)); } catch (e) {}
                }
                return;
            }

            // Mute/unmute toggle in player-actions (volume icon)
            const volBtn = e.target.closest && e.target.closest('.player-actions .action-btn');
            if (volBtn) {
                const icon = volBtn.querySelector('i');
                if (!icon) return;
                // check if this is the volume button by icon class
                if (icon.classList.contains('fa-volume-up') || icon.classList.contains('fa-volume-mute') || icon.classList.contains('fa-volume-off')) {
                    e.preventDefault();
                    if (!window.musicPlayer || !window.musicPlayer.audio) return;
                    const audio = window.musicPlayer.audio;
                    audio.muted = !audio.muted;
                    if (audio.muted) {
                        icon.classList.remove('fa-volume-up');
                        icon.classList.add('fa-volume-mute');
                    } else {
                        icon.classList.remove('fa-volume-mute');
                        icon.classList.add('fa-volume-up');
                    }
                    try { window.musicPlayer.savePlaybackState(); } catch(e){}
                    return;
                }
            }

            // Fallback: handle control buttons for shuffle/repeat if direct wiring missed
            try {
                const controlBtn = e.target.closest && e.target.closest('.control-btn');
                if (controlBtn) {
                    // repeat (redo) icon
                    const redo = controlBtn.querySelector && controlBtn.querySelector('.fa-redo, .fa-sync');
                    if (redo) {
                        e.stopPropagation(); e.preventDefault();
                        if (window.musicPlayer && typeof window.musicPlayer.toggleRepeat === 'function') {
                            window.musicPlayer.toggleRepeat();
                        }
                        return;
                    }
                    // shuffle icon
                    const rand = controlBtn.querySelector && controlBtn.querySelector('.fa-random');
                    if (rand) {
                        e.stopPropagation(); e.preventDefault();
                        if (window.musicPlayer && typeof window.musicPlayer.toggleShuffle === 'function') {
                            window.musicPlayer.toggleShuffle();
                        }
                        return;
                    }
                }
            } catch (e) { /* ignore fallback errors */ }
        } catch (err) {
            console.debug('delegate handler error', err);
        }
    });
    window._mf_delegate_handlers_installed = true;
}

// Refresh favorites section(s) by fetching user favorites and re-rendering
async function refreshFavorites() {
    try {
        console.debug('refreshFavorites: called');
        const favContainers = document.querySelectorAll('.tracks-list[data-source="favorites"]');
        if (!favContainers || favContainers.length === 0) return;
        if (!window.API || typeof window.API.getFavorites !== 'function') {
            favContainers.forEach(c => c.innerHTML = '<div class="loading-text">Улюблені недоступні</div>');
            return;
        }

        const favs = await window.API.getFavorites();
        console.debug('refreshFavorites: favorites payload length=', Array.isArray(favs) ? favs.length : 'not-array');
        if (Array.isArray(favs) && favs.length > 0) {
            try { console.debug('refreshFavorites: first favorite sample=', Object.assign({}, favs[0])); } catch(e) { console.debug('refreshFavorites: could not stringify sample fav', e); }
        }
        if (!Array.isArray(favs) || favs.length === 0) {
            favContainers.forEach(c => c.innerHTML = '<div class="loading-text">Немає улюблених треків</div>');
            return;
        }

        // Render favorites into each favorites container
        favContainers.forEach((container) => {
            let html = '';
            favs.forEach((t, idx) => {
                const cover = t.coverUrl || '/covers/default.png';
                const trackId = String(t._id || t.id || '');
                const audioUrl = t.audioUrl || '';
                console.debug('refreshFavorites: favorite track', trackId, 'raw audioUrl=', audioUrl);
                const genre = (t.genre || '').replace(/"/g, '');
                const isFav = true; // these are favorites
                html += `
                    <div class="track-item" data-audio="${audioUrl}" data-id="${trackId}" data-cover="${cover}" data-genre="${genre}">
                        <div class="track-number">${idx+1}</div>
                        <div class="track-cover-small" style="background-image:url('${cover}');background-size:cover;background-position:center;position:relative;">
                            <div class="play-overlay"><i class="fas fa-play"></i></div>
                        </div>
                        <div class="track-info" style="flex:1;min-width:0;">
                            <h3 class="track-title" style="margin:0;font-size:1rem;">${(t.title || '').replace(/</g,'&lt;')}</h3>
                            <p class="track-artist" style="margin:2px 0 0 0;color:var(--text-secondary);font-size:0.9rem;">${(t.artist || '').replace(/</g,'&lt;')}</p>
                        </div>
                        <div class="track-views"><span class="views-count" data-track="${trackId}">${(t.popularity || 0)} прослух.</span></div>
                        <div class="track-duration" data-duration="${t.duration || 0}">${formatDuration(t.duration)}</div>
                        <button class="fav-btn" data-id="${trackId}" title="Улюблене"><i class="fas fa-heart"></i></button>
                    </div>
                `;
            });
            container.innerHTML = html;

            // Attach handlers similar to populateTracksLists for play overlay and duration loading
            container.querySelectorAll('.track-item').forEach((trackEl) => {
                const trackId = trackEl.getAttribute('data-id');
                const playOverlay = trackEl.querySelector('.play-overlay');
                const trackCover = trackEl.querySelector('.track-cover-small');
                const playHandler = (e) => {
                    e.stopPropagation();
                    if (window.musicPlayer && typeof window.musicPlayer.playOrToggleFromItem === 'function') {
                        window.musicPlayer.playOrToggleFromItem(trackEl);
                    }
                };
                if (playOverlay) playOverlay.addEventListener('click', playHandler);
                if (trackCover) trackCover.addEventListener('click', playHandler);
            });

            // Kick off duration loading for favorites container
            const trackItems = Array.from(container.querySelectorAll('.track-item'));
            let qIndex = 0;
                const loadNext = async () => {
                if (qIndex >= trackItems.length) return;
                const trackEl = trackItems[qIndex++];
                const durationEl = trackEl.querySelector('.track-duration');
                const audioUrl = trackEl.getAttribute('data-audio');
                const storedDuration = durationEl.getAttribute('data-duration');
                const numDuration = Number(storedDuration) || 0;
                if (numDuration > 0) return setTimeout(loadNext, 20);
                if (!audioUrl) { durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
                durationEl.textContent = '…';
                const audio = new Audio(); audio.preload = 'metadata';
                const onMetadata = () => { try { const dur = Math.floor(audio.duration || 0); durationEl.textContent = formatDuration(dur); durationEl.setAttribute('data-duration', dur); } catch(e) { durationEl.textContent = formatDuration(0); } cleanup(); setTimeout(loadNext, 50); };
                const onError = () => { durationEl.textContent = formatDuration(0); cleanup(); setTimeout(loadNext, 50); };
                const cleanup = () => { audio.removeEventListener('loadedmetadata', onMetadata); audio.removeEventListener('error', onError); try { audio.src = ''; } catch(e){} };
                audio.addEventListener('loadedmetadata', onMetadata, { once: true });
                audio.addEventListener('error', onError, { once: true });
                try {
                    const normalized = normalizeAudioUrl(audioUrl);
                    if (!normalized || typeof normalized !== 'string' || !/^https?:\/\//i.test(normalized)) { durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
                    // verify resource exists before assigning to avoid browser "Invalid URI" media errors
                    try {
                        const head = await fetch(normalized, { method: 'HEAD' });
                        if (!head.ok) { console.warn('populateTracksLists: audio HEAD failed', normalized, head.status); durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
                        audio.src = normalized;
                    } catch (fetchErr) {
                        console.warn('populateTracksLists: audio HEAD request failed', normalized, fetchErr);
                        durationEl.textContent = formatDuration(0);
                        return setTimeout(loadNext, 20);
                    }
                } catch (e) { durationEl.textContent = formatDuration(0); setTimeout(loadNext, 20); }
            };
            loadNext();
        });
    } catch (err) {
        console.error('refreshFavorites failed:', err);
        try {
            const favContainers = document.querySelectorAll('.tracks-list[data-source="favorites"]');
            favContainers.forEach(c => { if (c) c.innerHTML = `<div class="loading-text">Помилка при завантаженні улюблених: ${String(err && err.message ? err.message : err)}</div>`; });
        } catch (e) { /* ignore UI fallback errors */ }
    }
    // Update header counts when favorites change
    try { if (typeof updateLibraryCounts === 'function') updateLibraryCounts(); } catch (e) { console.debug('refreshFavorites: updateLibraryCounts failed', e); }
}

// ---------- Library controls: Play All, Sort, Filter, Playlists ----------
function initLibraryControls() {
    try {
        // Play All
        const playAllBtn = document.getElementById('playAllBtn');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                try {
                    // collect visible track items within .tracks-list on this page
                    const trackEls = Array.from(document.querySelectorAll('.tracks-list .track-item'));
                    const queue = trackEls.map(el => ({
                        _id: el.getAttribute('data-id'),
                        audioUrl: el.getAttribute('data-audio'),
                        coverUrl: el.getAttribute('data-cover'),
                        title: (el.querySelector('.track-title') && el.querySelector('.track-title').textContent) || '',
                        artist: (el.querySelector('.track-artist') && el.querySelector('.track-artist').textContent) || ''
                    })).filter(t => t && t.audioUrl);

                    if (!queue.length) {
                        window.showNotification && window.showNotification('Немає треків для відтворення', 'warning');
                        return;
                    }

                    if (window.musicPlayer && typeof window.musicPlayer.setQueue === 'function') {
                        window.musicPlayer.setQueue(queue);
                        window.showNotification && window.showNotification('Відтворення списку', 'success');
                    }
                } catch (e) { console.debug('playAll click failed', e); }
            });
        }

        // Sort button toggles alphabetical sort by title for all visible .tracks-list
        const sortBtn = document.getElementById('sortBtn');
        if (sortBtn) {
            sortBtn._asc = true;
            sortBtn.addEventListener('click', () => {
                try {
                    const lists = Array.from(document.querySelectorAll('.tracks-list'));
                    lists.forEach(list => {
                        const items = Array.from(list.querySelectorAll('.track-item'));
                        items.sort((a,b) => {
                            const ta = (a.querySelector('.track-title') && a.querySelector('.track-title').textContent || '').toLowerCase();
                            const tb = (b.querySelector('.track-title') && b.querySelector('.track-title').textContent || '').toLowerCase();
                            return sortBtn._asc ? ta.localeCompare(tb) : tb.localeCompare(ta);
                        });
                        items.forEach(i => list.appendChild(i));
                    });
                    sortBtn._asc = !sortBtn._asc;
                    sortBtn.querySelector('span').textContent = sortBtn._asc ? 'Сортувати (назва)' : 'Сортувати (назва ↓)';
                } catch (e) { console.debug('sortBtn click failed', e); }
            });
        }

        // Filter button toggles genre filter dropdown visibility (we reuse .search-genre-filter)
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                try {
                    // open a small popup next to the button with the genre select and Apply/Clear
                    showGenreFilterPopup(filterBtn);
                } catch (e) { console.debug('filterBtn click failed', e); }
            });
        }

        // Create playlist button
        const createPlaylistBtn = document.getElementById('createPlaylistBtn');
        if (createPlaylistBtn) {
            createPlaylistBtn.addEventListener('click', async () => {
                try {
                    const resp = await window.showModal({ title: 'Створити плейлист', fields: [{ name: 'name', label: 'Назва плейлиста', value: '' }] });
                    if (!resp || !resp.submitted) return;
                    const name = (resp.values && resp.values.name) ? resp.values.name.trim() : '';
                    if (!name) { window.showNotification && window.showNotification('Назва плейлиста порожня', 'warning'); return; }
                    if (!window.API) { window.showNotification && window.showNotification('API недоступне', 'error'); return; }
                    const created = await window.API.createPlaylist({ name });
                    window.showNotification && window.showNotification('Плейлист створено', 'success');
                    try { refreshPlaylists(); } catch (e) {}
                } catch (e) { console.error('createPlaylist failed', e); window.showNotification && window.showNotification('Не вдалося створити плейлист', 'error'); }
            });
        }

        // Add 'Add to playlist' controls on each track item dynamically
        try {
            document.querySelectorAll('.tracks-list .track-item').forEach(el => attachAddToPlaylistButton(el));
        } catch (e) { /* ignore */ }

        // Load playlists initially
        try { refreshPlaylists(); } catch (e) { console.debug('refreshPlaylists initial failed', e); }
    } catch (e) { console.debug('initLibraryControls failed', e); }
}

function applyGenreFilter(genre) {
    try {
        const lists = Array.from(document.querySelectorAll('.tracks-list'));
        lists.forEach(list => {
            const items = Array.from(list.querySelectorAll('.track-item'));
            items.forEach(it => {
                const g = (it.getAttribute('data-genre') || '').trim();
                if (!genre || genre === '') { it.style.display = ''; }
                else { it.style.display = (g === genre) ? '' : 'none'; }
            });
        });
    } catch (e) { console.debug('applyGenreFilter failed', e); }
}

function attachAddToPlaylistButton(trackEl) {
    try {
        if (!trackEl) return;
        if (trackEl.querySelector('.add-to-playlist-btn')) return; // already attached
        const btn = document.createElement('button');
        btn.className = 'add-to-playlist-btn';
        btn.style.marginLeft = '8px';
        btn.title = 'Додати до плейлиста';
        btn.innerHTML = '<i class="fas fa-plus"></i>';
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                // Open modal chooser instead of prompt
                const trackId = trackEl.getAttribute('data-id');
                if (!trackId) { window.showNotification && window.showNotification('Невідомий трек', 'error'); return; }
                ensurePlaylistChooserExists();
                showPlaylistChooser(trackId, trackEl);
            } catch (err) { console.error('add to playlist failed', err); window.showNotification && window.showNotification('Не вдалося додати трек', 'error'); }
        });
        // append to controls area if exists, otherwise to trackEl
        const ctrlArea = trackEl.querySelector('.track-info');
        if (ctrlArea) ctrlArea.appendChild(btn); else trackEl.appendChild(btn);
    } catch (e) { console.debug('attachAddToPlaylistButton failed', e); }
}

// --- Playlist chooser modal helpers ---
function ensurePlaylistChooserExists() {
    if (document.getElementById('playlistChooserModal')) return;
    try {
        const tpl = document.createElement('div');
        tpl.innerHTML = `
        <div id="playlistChooserModal" class="mf-modal" aria-hidden="true">
          <div class="mf-modal-backdrop"></div>
          <div class="mf-modal-dialog">
            <header class="mf-modal-header"><h3>Додати трек до плейлиста</h3><button class="mf-modal-close" id="playlistChooserClose">×</button></header>
            <div class="mf-modal-body"><div id="playlistChooserList" class="playlist-chooser-list">Завантаження...</div></div>
            <footer class="mf-modal-footer"><button id="playlistChooserCancel" class="library-action-btn">Скасувати</button></footer>
          </div>
        </div>`;
        document.body.appendChild(tpl.firstElementChild);
        // wire close
        document.getElementById('playlistChooserClose').addEventListener('click', hidePlaylistChooser);
        document.getElementById('playlistChooserCancel').addEventListener('click', hidePlaylistChooser);
    } catch (e) { console.debug('ensurePlaylistChooserExists failed', e); }
}

function showPlaylistChooser(trackId, trackEl) {
    const modal = document.getElementById('playlistChooserModal');
    const list = document.getElementById('playlistChooserList');
    if (!modal || !list) return;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open');
    list.innerHTML = 'Завантаження плейлистів...';
    if (!window.API || typeof window.API.getPlaylists !== 'function') {
        list.innerHTML = '<div class="loading-text">Плейлисти недоступні</div>';
        return;
    }
    window.API.getPlaylists().then(pls => {
        if (!Array.isArray(pls) || pls.length === 0) {
            list.innerHTML = '<div class="loading-text">Ще немає плейлистів</div>';
            return;
        }
        list.innerHTML = '';
        pls.forEach(p => {
            const id = p._id || p.id || '';
            const name = p.name || 'Плейлист';
            const count = Array.isArray(p.tracks) ? p.tracks.length : (p.count || 0);
            const row = document.createElement('div');
            row.className = 'playlist-chooser-row';
            row.innerHTML = `<div class="playlist-chooser-meta"><strong>${escapeHtml(name)}</strong><div class="small muted">${count} треків</div></div>`;
            const addBtn = document.createElement('button');
            addBtn.className = 'library-action-btn';
            addBtn.textContent = 'Додати';
            addBtn.addEventListener('click', async (e) => {
                addBtn.disabled = true;
                try {
                    await window.API.addTrackToPlaylist(id, trackId);
                    window.showNotification && window.showNotification('Трек додано до плейлиста', 'success');
                    hidePlaylistChooser();
                    try { refreshPlaylists(); } catch (er) {}
                } catch (err) {
                    console.error('addTrackToPlaylist failed', err);
                    window.showNotification && window.showNotification('Не вдалося додати трек', 'error');
                    addBtn.disabled = false;
                }
            });
            row.appendChild(addBtn);
            list.appendChild(row);
        });
    }).catch(err => {
        console.error('Failed to load playlists', err);
        list.innerHTML = '<div class="loading-text">Помилка при завантаженні плейлистів</div>';
    });
}

function hidePlaylistChooser() {
    const modal = document.getElementById('playlistChooserModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('open');
}

function escapeHtml(s) { return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"})[c]); }

async function refreshPlaylists() {
    try {
        console.debug('refreshPlaylists: called');
        const container = document.getElementById('playlistsGrid');
        if (!container) return;
        container.innerHTML = '<div class="loading-text">Завантаження плейлистів...</div>';
        if (!window.API || typeof window.API.getPlaylists !== 'function') { container.innerHTML = '<div class="loading-text">Плейлисти недоступні</div>'; return; }
        const pls = await window.API.getPlaylists();
        if (!Array.isArray(pls) || pls.length === 0) { container.innerHTML = '<div class="loading-text">Ще немає плейлистів</div>'; return; }
        let html = '';
                pls.forEach(p => {
                        const id = p._id || p.id || '';
                        const name = p.name || 'Плейлист';
                        const count = Array.isArray(p.tracks) ? p.tracks.length : (p.count || 0);
                        // build cover collage: up to 4 covers from tracks
                        let coverHtml = '';
                        const tracksArr = Array.isArray(p.tracks) ? p.tracks : [];
                        if (tracksArr.length === 0) {
                                coverHtml = `<div class="playlist-cover-empty"><i class="fas fa-list"></i></div>`;
                        } else {
                                const thumbs = tracksArr.slice(0,4).map(t => (t && (t.coverUrl || t.cover)) ? (t.coverUrl || t.cover) : '/covers/default.png');
                                coverHtml = `<div class="playlist-cover-grid">` + thumbs.map((src, i) => `<div class="pc-thumb pc-thumb-${i+1}" style="background-image:url('${src}');background-size:cover;background-position:center"></div>`).join('') + `</div>`;
                        }
                        html += `
                        <div class="playlist-card" data-id="${id}">
                            <div class="playlist-cover">${coverHtml}</div>
                            <div class="playlist-info"><h3>${escapeHtml(name)}</h3><p>${count} треків</p></div>
                            <div class="playlist-actions">
                                <button class="playlist-icon-btn playlist-open" data-id="${id}" title="Відкрити"><i class="fas fa-eye"></i></button>
                                <button class="playlist-icon-btn playlist-rename" data-id="${id}" title="Змінити назву"><i class="fas fa-edit"></i></button>
                                <button class="playlist-icon-btn playlist-delete" data-id="${id}" title="Видалити"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
                });
        container.innerHTML = html;
        // Wire up icon button handlers (stop propagation so card click doesn't fire)
        Array.from(container.querySelectorAll('.playlist-actions .playlist-open')).forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); const id = btn.getAttribute('data-id'); if (id) openPlaylistManager(id); });
        });
        Array.from(container.querySelectorAll('.playlist-actions .playlist-rename')).forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (!id) return;
                try {
                    // Fetch current playlist name for default
                    let cur = null;
                    try { cur = (await window.API.getPlaylistById(id)) || null; } catch(e) {}
                    const resp = await window.showModal({ title: 'Змінити назву плейлиста', fields: [{ name: 'name', label: 'Нова назва', value: (cur && cur.name) ? cur.name : '' }] });
                    if (!resp || !resp.submitted) return;
                    const newName = (resp.values && resp.values.name) ? String(resp.values.name).trim() : '';
                    if (!newName) return;
                    await window.API.updatePlaylist(id, { name: newName });
                    window.showNotification && window.showNotification('Назву змінено', 'success');
                    try { refreshPlaylists(); } catch(e){}
                } catch (err) { console.error('rename playlist failed', err); window.showNotification && window.showNotification('Не вдалося змінити назву', 'error'); }
            });
        });
        Array.from(container.querySelectorAll('.playlist-actions .playlist-delete')).forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (!id) return;
                try {
                    const ok = window.confirm('Видалити плейлист? Ця дія незворотна.');
                    if (!ok) return;
                    await window.API.deletePlaylist(id);
                    window.showNotification && window.showNotification('Плейлист видалено', 'success');
                    try { refreshPlaylists(); } catch(e){}
                } catch (err) { console.error('delete playlist failed', err); window.showNotification && window.showNotification('Не вдалося видалити плейлист', 'error'); }
            });
        });
        // Make the entire playlist card clickable and open the manager modal
        Array.from(container.querySelectorAll('.playlist-card')).forEach(card => {
            try {
                card.style.cursor = 'pointer';
                card.addEventListener('click', (e) => {
                    try {
                        const id = card.getAttribute('data-id');
                        if (!id) return;
                        openPlaylistManager(id);
                    } catch (err) { console.debug('playlist-card click failed', err); }
                });
            } catch (e) { /* ignore */ }
        });
        // update count
        try { document.getElementById('libPlaylistsCount').textContent = String(pls.length); } catch(e){}
    } catch (e) { console.error('refreshPlaylists failed', e); }
}
    catchErr:
    {
        // no-op — keep for structural clarity
    }

async function openPlaylistManager(playlistId) {
    try {
        if (!playlistId) return;
        if (!window.API || typeof window.API.getPlaylistById !== 'function') {
            // fallback: try getPlaylists and find by id
            const pls = await window.API.getPlaylists();
            const p = (pls || []).find(x => String(x._id || x.id) === String(playlistId));
            if (!p) return;
            // show a richer modal with cover + track list (reusing renderTracksInto)
            const tracks = p.tracks || [];
            const cover = (p.coverUrl || '/covers/default.png');
                        let html = `
                                <div style="display:flex;gap:16px;align-items:flex-start;max-height:60vh;">
                                    <div style="flex:0 0 220px;">
                                        <div id="pmCoverPreview" style="width:220px;height:220px;border-radius:8px;background-image:url('${cover}');background-size:cover;background-position:center;margin-bottom:12px;"></div>
                                        <div style="margin-bottom:8px;"><input id="pmPlaylistName" type="text" value="${escapeHtml(p.name || '')}" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:var(--text-primary);font-weight:700;font-size:1rem;" /></div>
                                        <div style="color:var(--text-secondary);font-size:0.9rem;">${(Array.isArray(tracks) ? tracks.length : 0)} треків</div>
                                    </div>
                                    <div style="flex:1;min-width:0;">
                                        <div id="pmTracksList" style="max-height:60vh;overflow:auto;padding-right:8px;"></div>
                                        <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                                            <button id="pmSaveChanges" class="library-action-btn" data-id="${p._id||p.id||''}">Зберегти зміни</button>
                                            <button id="pmDeletePlaylist" class="library-action-btn" data-id="${p._id||p.id||''}" style="background:linear-gradient(135deg,#b00020,#d32f2f);color:#fff;">Видалити плейлист</button>
                                        </div>
                                    </div>
                                </div>`;
            const res = await window.showModal({ title: `Плейлист: ${p.name || ''}`, htmlMessage: html, fields: [] });
            // After modal opens, render tracks into pmTracksList and wire remove buttons
            setTimeout(() => {
                try {
                    const listEl = document.getElementById('pmTracksList');
                    if (listEl) {
                        renderTracksInto(listEl, tracks);
                                // make items draggable and append remove + drag handle
                                listEl.querySelectorAll('.track-item').forEach((item, idx) => {
                                    try {
                                        const tid = item.getAttribute('data-id');
                                        item.setAttribute('draggable', 'true');
                                        item.classList.add('pm-draggable');
                                        // add drag handle
                                        let handle = item.querySelector('.pm-drag-handle');
                                        if (!handle) {
                                            handle = document.createElement('span');
                                            handle.className = 'pm-drag-handle';
                                            handle.title = 'Перетягніть, щоб змінити порядок';
                                            handle.innerHTML = '<i class="fas fa-grip-lines"></i>';
                                            const left = item.querySelector('.track-number');
                                            if (left && left.parentNode) left.parentNode.insertBefore(handle, left.nextSibling);
                                        }

                                        const btn = document.createElement('button');
                                        btn.className = 'pm-remove-track';
                                        btn.textContent = 'Видалити';
                                        btn.style.marginLeft = '8px';
                                        btn.addEventListener('click', async (e) => {
                                            e.stopPropagation();
                                            if (!tid) return;
                                            try { await window.API.removeTrackFromPlaylist(playlistId, tid); window.showNotification && window.showNotification('Трек видалено', 'success'); try { refreshPlaylists(); } catch(e){}; // re-render modal
                                            } catch (err) { console.error('remove track failed', err); window.showNotification && window.showNotification('Не вдалося видалити', 'error'); }
                                        });
                                        const durationEl = item.querySelector('.track-duration');
                                        if (durationEl && durationEl.parentNode) durationEl.parentNode.appendChild(btn); else item.appendChild(btn);
                                    } catch (e) { /* ignore per-item errors */ }
                                });

                                // enable drag-and-drop reordering
                                let dragSrcEl = null;
                                listEl.querySelectorAll('.pm-draggable').forEach(el => {
                                    el.addEventListener('dragstart', (ev) => { dragSrcEl = ev.currentTarget; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', 'drag'); } catch(e){}; ev.currentTarget.classList.add('dragging'); });
                                    el.addEventListener('dragend', (ev) => { ev.currentTarget.classList.remove('dragging'); dragSrcEl = null; });
                                    el.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; const over = ev.currentTarget; over.classList.add('drag-over'); });
                                    el.addEventListener('dragleave', (ev) => { ev.currentTarget.classList.remove('drag-over'); });
                                    el.addEventListener('drop', (ev) => {
                                        ev.preventDefault(); ev.currentTarget.classList.remove('drag-over');
                                        const dst = ev.currentTarget;
                                        if (!dragSrcEl || dragSrcEl === dst) return;
                                        // move dragged element before destination
                                        try {
                                            const parent = dst.parentNode;
                                            parent.insertBefore(dragSrcEl, dst.nextSibling);
                                        } catch (e) { console.debug('drop move failed', e); }
                                    });
                                });

                                // add controls: add-track input and save-order button
                                const controlsWrap = document.createElement('div');
                                controlsWrap.style.display = 'flex'; controlsWrap.style.gap = '8px'; controlsWrap.style.marginTop = '10px'; controlsWrap.style.alignItems = 'center';
                                const addInput = document.createElement('input'); addInput.type = 'text'; addInput.placeholder = 'Додати трек за назвою або виконавцем'; addInput.className = 'pm-add-input'; addInput.style.flex = '1'; addInput.style.padding = '8px'; addInput.style.borderRadius = '6px'; addInput.style.border = '1px solid rgba(255,255,255,0.06)';
                                const addBtn = document.createElement('button'); addBtn.className = 'library-action-btn'; addBtn.textContent = 'Додати';
                                const saveBtn = document.createElement('button'); saveBtn.className = 'library-action-btn'; saveBtn.textContent = 'Зберегти порядок';
                                controlsWrap.appendChild(addInput); controlsWrap.appendChild(addBtn); controlsWrap.appendChild(saveBtn);
                                listEl.parentNode.appendChild(controlsWrap);

                                // Add track search + add
                                let searchTimer = null;
                                addInput.addEventListener('input', (ev) => {
                                    clearTimeout(searchTimer);
                                    searchTimer = setTimeout(async () => {
                                        const q = (addInput.value || '').trim().toLowerCase();
                                        if (!q) return;
                                        try {
                                            const all = await window.API.getTracks();
                                            const matches = (all || []).filter(t => ((t.title||'') + ' ' + (t.artist||'')).toLowerCase().includes(q)).slice(0,6);
                                            // show simple suggestion popup under input
                                            let popup = listEl.querySelector('.pm-suggestions');
                                            if (!popup) { popup = document.createElement('div'); popup.className = 'pm-suggestions'; popup.style.position = 'absolute'; popup.style.background = 'var(--secondary-bg)'; popup.style.border = '1px solid rgba(255,255,255,0.04)'; popup.style.zIndex = '1500'; popup.style.padding = '6px'; popup.style.borderRadius = '6px'; popup.style.maxHeight = '180px'; popup.style.overflow = 'auto'; listEl.parentNode.appendChild(popup); }
                                            popup.innerHTML = '';
                                            matches.forEach(m => {
                                                const row = document.createElement('div'); row.className = 'pm-suggestion-row'; row.style.padding = '6px'; row.style.cursor = 'pointer'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
                                                const th = document.createElement('div'); th.style.width='36px'; th.style.height='36px'; th.style.backgroundImage = `url('${(m.coverUrl||'/covers/default.png')}')`; th.style.backgroundSize='cover'; th.style.borderRadius='4px';
                                                const text = document.createElement('div'); text.innerHTML = `<div style="font-weight:600">${(m.title||'').replace(/</g,'&lt;')}</div><div style="font-size:0.85rem;color:var(--text-secondary)">${(m.artist||'').replace(/</g,'&lt;')}</div>`;
                                                row.appendChild(th); row.appendChild(text);
                                                row.addEventListener('click', async () => {
                                                    try {
                                                        await window.API.addTrackToPlaylist(playlistId, m._id || m.id);
                                                        window.showNotification && window.showNotification('Трек додано', 'success');
                                                        try { refreshPlaylists(); } catch(e){}
                                                        // re-open modal to reflect changes
                                                        try { hidePlaylistChooser(); } catch(e){}
                                                        try { openPlaylistManager(playlistId); } catch(e){}
                                                    } catch (err) { console.error('add track to playlist failed', err); window.showNotification && window.showNotification('Не вдалося додати трек', 'error'); }
                                                });
                                                popup.appendChild(row);
                                            });
                                        } catch (e) { console.debug('playlist add search failed', e); }
                                    }, 220);
                                });

                                addBtn.addEventListener('click', () => {
                                    const ev = new Event('input'); addInput.dispatchEvent(ev);
                                });

                                // Save order: collect current order of track ids and call updatePlaylist
                                saveBtn.addEventListener('click', async () => {
                                    try {
                                        const ids = Array.from(listEl.querySelectorAll('.track-item')).map(it => it.getAttribute('data-id')).filter(Boolean);
                                        await window.API.updatePlaylist(playlistId, { tracks: ids });
                                        window.showNotification && window.showNotification('Порядок збережено', 'success');
                                        try { refreshPlaylists(); } catch(e){}
                                        try { hidePlaylistChooser(); } catch(e){}
                                        try { openPlaylistManager(playlistId); } catch(e){}
                                    } catch (err) { console.error('save playlist order failed', err); window.showNotification && window.showNotification('Не вдалося зберегти порядок', 'error'); }
                                });
                            }
                } catch (e) { console.debug('post-render playlist modal wiring failed', e); }
            }, 60);
            return;
        }
        // If API supports getPlaylistById, use it
        const pl = await window.API.getPlaylistById(playlistId);
        if (!pl) return;
        const tracks = pl.tracks || [];
        const cover = (pl.coverUrl || '/covers/default.png');
        let html = `
            <div style="display:flex;gap:16px;align-items:flex-start;max-height:60vh;">
              <div style="flex:0 0 220px;">
                <div style="width:220px;height:220px;border-radius:8px;background-image:url('${cover}');background-size:cover;background-position:center;margin-bottom:12px;"></div>
                <div style="font-weight:700;font-size:1.05rem;margin-bottom:6px;">${escapeHtml(pl.name || '')}</div>
                <div style="color:var(--text-secondary);font-size:0.9rem;">${(Array.isArray(tracks) ? tracks.length : 0)} треків</div>
              </div>
              <div style="flex:1;min-width:0;">
                <div id="pmTracksList" style="max-height:60vh;overflow:auto;padding-right:8px;"></div>
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                  <button class="library-action-btn mf-rename-playlist" data-id="${pl._id||pl.id||''}">Змінити назву</button>
                  <button class="library-action-btn mf-delete-playlist" data-id="${pl._id||pl.id||''}" style="background:linear-gradient(135deg,#b00020,#d32f2f);color:#fff;">Видалити плейлист</button>
                </div>
              </div>
            </div>`;
        const res = await window.showModal({ title: `Плейлист: ${pl.name || ''}`, htmlMessage: html, fields: [] });
        setTimeout(() => {
            try {
                const listEl = document.getElementById('pmTracksList');
                if (listEl) {
                    renderTracksInto(listEl, tracks);
                    // append remove buttons to each track-item
                    listEl.querySelectorAll('.track-item').forEach(item => {
                        try {
                            const tid = item.getAttribute('data-id');
                            const btn = document.createElement('button');
                            btn.className = 'pm-remove-track library-action-btn';
                            btn.textContent = 'Видалити';
                            btn.style.marginLeft = '8px';
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                if (!tid) return;
                                try { await window.API.removeTrackFromPlaylist(playlistId, tid); window.showNotification && window.showNotification('Трек видалено', 'success'); try { refreshPlaylists(); } catch(e){}; // re-render lists
                                } catch (err) { console.error('remove track failed', err); window.showNotification && window.showNotification('Не вдалося видалити', 'error'); }
                            });
                            // place the remove button into the right area (after duration)
                            const durationEl = item.querySelector('.track-duration');
                            if (durationEl && durationEl.parentNode) {
                                durationEl.parentNode.appendChild(btn);
                            } else {
                                item.appendChild(btn);
                            }
                        } catch (e) { /* ignore per-item errors */ }
                    });
                }
            } catch (e) { console.debug('post-render playlist modal wiring failed', e); }
        }, 60);
    } catch (e) { console.error('openPlaylistManager failed', e); }
}

function renderTracksInto(listEl, tracks) {
    try {
        if (!listEl) return;
        // Build HTML for tracks (reuse same markup as populateTracksLists)
        let html = '';
        tracks.forEach((t, idx) => {
            const cover = t.coverUrl || '/covers/default.png';
            const trackId = String(t._id || t.id || '');
            const audioUrl = t.audioUrl || '';
            const genre = (t.genre || '').replace(/"/g, '');
            html += `
                <div class="track-item" data-audio="${audioUrl}" data-id="${trackId}" data-cover="${cover}" data-genre="${genre}">
                    <div class="track-number">${idx + 1}</div>
                    <div class="track-cover-small" style="background-image:url('${cover}');background-size:cover;background-position:center;position:relative;">
                        <div class="play-overlay"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="track-info" style="flex:1;min-width:0;">
                        <h3 class="track-title" style="margin:0;font-size:1rem;">${(t.title || '').replace(/</g, '&lt;')}</h3>
                        <p class="track-artist" style="margin:2px 0 0 0;color:var(--text-secondary);font-size:0.9rem;">${(t.artist || '').replace(/</g, '&lt;')}</p>
                    </div>
                    <div class="track-views"><span class="views-count" data-track="${trackId}">${(t.popularity || 0)} прослух.</span></div>
                    <div class="track-duration" data-duration="${t.duration || 0}">${formatDuration(t.duration)}</div>
                    <button class="fav-btn" data-id="${trackId}" title="Улюблене"><i class="far fa-heart"></i></button>
                </div>
            `;
        });

        listEl.innerHTML = html;

        // Attach play handlers and fav buttons similar to populateTracksLists
        listEl.querySelectorAll('.track-item').forEach((trackEl, idx) => {
            const trackId = trackEl.getAttribute('data-id');
            const playOverlay = trackEl.querySelector('.play-overlay');
            const trackCover = trackEl.querySelector('.track-cover-small');
            const playHandler = (e) => {
                e.stopPropagation();
                if (window.musicPlayer && typeof window.musicPlayer.playOrToggleFromItem === 'function') {
                    window.musicPlayer.playOrToggleFromItem(trackEl);
                    try {
                        if (trackId && window.API && typeof window.API.incrementPlay === 'function') {
                            window.API.incrementPlay(trackId).then(res => {
                                try { const pop = res && res.track && (typeof res.track.popularity === 'number' ? res.track.popularity : null); if (pop !== null) window.updatePopularityDisplay(trackId, pop); else window.updatePopularityDisplay(trackId); } catch(e){}
                            }).catch(()=>{});
                        }
                    } catch(e){}
                    try { if (trackId && window.API && typeof window.API.markPlayed === 'function') window.API.markPlayed(trackId).catch(()=>{}); } catch(e){}
                }
            };
            if (playOverlay) playOverlay.addEventListener('click', playHandler);
            if (trackCover) trackCover.addEventListener('click', playHandler);

            const favBtn = trackEl.querySelector('.fav-btn');
            if (favBtn) {
                favBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!trackId || !window.API) return;
                    if (typeof window.API.isAuthenticated === 'function' && !window.API.isAuthenticated()) { if (window.showNotification) window.showNotification('Увійдіть, щоб додати улюблене', 'warning'); return; }
                    const icon = favBtn.querySelector('i');
                    try {
                        const res = await window.API.toggleFavorite(trackId);
                        if (res && typeof res.favorited !== 'undefined') {
                            if (res.favorited) { icon.classList.replace('far','fas'); if (window.showNotification) window.showNotification('Додано до улюблених','success'); }
                            else { icon.classList.replace('fas','far'); if (window.showNotification) window.showNotification('Видалено з улюблених','info'); }
                        }
                    } catch (err) { console.error('Toggle favorite error:', err); if (window.showNotification) window.showNotification('Помилка при збереженні','error'); }
                });
            }
            try { attachAddToPlaylistButton(trackEl); } catch (e) { /* ignore */ }
        });

        // Load durations for tracks without duration (same logic as populateTracksLists)
        const trackItems = Array.from(listEl.querySelectorAll('.track-item'));
        let qIndex = 0;
        const loadNext = async () => {
            if (qIndex >= trackItems.length) return;
            const trackEl = trackItems[qIndex++];
            const durationEl = trackEl.querySelector('.track-duration');
            const audioUrl = trackEl.getAttribute('data-audio');
            const storedDuration = durationEl.getAttribute('data-duration');
            const numDuration = Number(storedDuration) || 0;
            if (numDuration > 0) return setTimeout(loadNext, 20);
            if (!audioUrl) { durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
            durationEl.textContent = '…';
            const audio = new Audio();
            audio.preload = 'metadata';
            const onMetadata = () => { try { const dur = Math.floor(audio.duration || 0); durationEl.textContent = formatDuration(dur); durationEl.setAttribute('data-duration', dur); } catch(e){ durationEl.textContent = formatDuration(0); } cleanup(); setTimeout(loadNext, 50); };
            const onError = () => { durationEl.textContent = formatDuration(0); cleanup(); setTimeout(loadNext, 50); };
            const cleanup = () => { audio.removeEventListener('loadedmetadata', onMetadata); audio.removeEventListener('error', onError); try { audio.src = ''; } catch(e){} };
            audio.addEventListener('loadedmetadata', onMetadata, { once: true });
            audio.addEventListener('error', onError, { once: true });
            try {
                const normalized = normalizeAudioUrl(audioUrl);
                if (!normalized || typeof normalized !== 'string' || !/^https?:\/\//i.test(normalized)) { durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
                try {
                    const head = await fetch(normalized, { method: 'HEAD' });
                    if (!head.ok) { console.warn('renderTracksInto: audio HEAD failed', normalized, head.status); durationEl.textContent = formatDuration(0); return setTimeout(loadNext, 20); }
                    audio.src = normalized;
                } catch (fetchErr) {
                    console.warn('renderTracksInto: audio HEAD request failed', normalized, fetchErr);
                    durationEl.textContent = formatDuration(0);
                    return setTimeout(loadNext, 20);
                }
            } catch (e) { console.warn('renderTracksInto: failed to set audio src for', audioUrl, e); durationEl.textContent = formatDuration(0); setTimeout(loadNext, 20); }
        };
        loadNext();
    } catch (e) { console.error('renderTracksInto failed', e); }
}

// Load a set of random suggestions into `#random-suggestions` using tracks from the API
async function loadRandomSuggestions(count = 8) {
    try {
        const container = document.getElementById('random-suggestions');
        if (!container) return;
        container.innerHTML = '<div class="loading-text">Завантаження рекомендацій...</div>';

        let tracks = [];
        try { tracks = await API.getTracks(); } catch (e) { tracks = window._mf_demo_tracks || []; }
        if (!Array.isArray(tracks) || tracks.length === 0) {
            container.innerHTML = '<div class="loading-text">Немає доступних треків</div>';
            return;
        }

        // Shuffle copy and pick `count` items
        const pool = tracks.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const selected = pool.slice(0, Math.min(count, pool.length));

        // Render using artist-card styles so UI looks consistent
        let html = '';
        selected.forEach(t => {
            const cover = (t.coverUrl || '/covers/default.png').replace(/"/g, '&quot;');
            const title = (t.title || 'Невідомий трек').replace(/</g, '&lt;');
            const artist = (t.artist || 'Невідомий виконавець').replace(/</g, '&lt;');
            const audioUrl = t.audioUrl || '';
            const trackId = t._id || t.id || '';

            html += `
                <div class="artist-card random-track" data-id="${trackId}" data-audio="${audioUrl}" data-cover="${cover}">
                    <div class="artist-cover" style="background-image:url('${cover}');background-size:cover;background-position:center;">
                    </div>
                    <div class="artist-info">
                        <h3>${title}</h3>
                        <p>${artist}</p>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Wire click handlers to play selected track
        Array.from(container.querySelectorAll('.random-track')).forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    const id = card.getAttribute('data-id');
                    const audio = card.getAttribute('data-audio');
                    const cover = card.getAttribute('data-cover');
                    const title = (card.querySelector('h3') && card.querySelector('h3').textContent) || '';
                    const artist = (card.querySelector('p') && card.querySelector('p').textContent) || '';
                    if (!window.musicPlayer) return;
                    window.musicPlayer.currentTrack = { _id: id, audioUrl: audio, coverUrl: cover, title: title, artist: artist };
                    try { window.musicPlayer.updatePlayerInfo(title, artist, cover); } catch (e) {}
                    try { window.musicPlayer.playTrack(); } catch (e) { console.debug('playTrack from random suggestions failed', e); }
                } catch (e) { console.debug('random-track click handler failed', e); }
            });
        });
    } catch (e) {
        console.error('loadRandomSuggestions failed', e);
    }
}

// Load personalized recommendations: tracks the user hasn't played yet
async function loadRecommendations(count = 8) {
    try {
        const container = document.getElementById('recommendations');
        if (!container) return;
        container.innerHTML = '<div class="loading-text">Завантаження рекомендацій...</div>';

        // Fetch all tracks and user's recent plays (if authenticated)
        const [tracks, recent] = await Promise.all([
            (typeof API !== 'undefined' ? API.getTracks() : Promise.resolve([])),
            (typeof API !== 'undefined' ? API.getRecent() : Promise.resolve([]))
        ]);

        const recentIds = new Set();
        try {
            (recent || []).forEach(r => {
                const id = String(r._id || r.id || r.trackId || r);
                if (id) recentIds.add(id);
            });
        } catch (e) { /* ignore */ }

        // If not authenticated (no recent), and recentIds empty, we still want to show suggestions; fallback to random subset
        let pool = Array.isArray(tracks) ? tracks.slice() : [];

        // Filter out recently-played tracks
        pool = pool.filter(t => {
            const tid = String(t._id || t.id || '');
            if (!tid) return false;
            return !recentIds.has(tid);
        });

        // If we filtered out everything (e.g., user has heard all), fall back to full set
        if (pool.length === 0) pool = Array.isArray(tracks) ? tracks.slice() : [];

        // Shuffle and select `count`
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const selected = pool.slice(0, Math.min(count, pool.length));

        // Render using artist-card like layout for consistency
        let html = '';
        selected.forEach(t => {
            const cover = (t.coverUrl || '/covers/default.png').replace(/"/g, '&quot;');
            const title = (t.title || 'Невідомий трек').replace(/</g, '&lt;');
            const artist = (t.artist || 'Невідомий виконавець').replace(/</g, '&lt;');
            const audioUrl = t.audioUrl || '';
            const trackId = t._id || t.id || '';

            html += `
                <div class="artist-card recommendation-track" data-id="${trackId}" data-audio="${audioUrl}" data-cover="${cover}">
                    <div class="artist-cover" style="background-image:url('${cover}');background-size:cover;background-position:center;">
                    </div>
                    <div class="artist-info">
                        <h3>${title}</h3>
                        <p>${artist}</p>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="loading-text">Немає рекомендацій</div>';

        // Wire click handlers to play selected recommendation
        Array.from(container.querySelectorAll('.recommendation-track')).forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    const id = card.getAttribute('data-id');
                    const audio = card.getAttribute('data-audio');
                    const cover = card.getAttribute('data-cover');
                    const title = (card.querySelector('h3') && card.querySelector('h3').textContent) || '';
                    const artist = (card.querySelector('p') && card.querySelector('p').textContent) || '';
                    if (!window.musicPlayer) return;
                    window.musicPlayer.currentTrack = { _id: id, audioUrl: audio, coverUrl: cover, title: title, artist: artist };
                    try { window.musicPlayer.updatePlayerInfo(title, artist, cover); } catch (e) {}
                    try { window.musicPlayer.playTrack(); } catch (e) { console.debug('playTrack from recommendations failed', e); }
                } catch (e) { console.debug('recommendation-track click handler failed', e); }
            });
        });
    } catch (e) {
        console.error('loadRecommendations failed', e);
    }
}

// Load a small demo set into the UI when backend is unavailable
function loadDemoTracks() {
    try {
        // simple demo set matching the shape expected by renderers
        window._mf_demo_tracks = [
            { id: 'demo1', title: 'Спи собі сама', artist: 'Скрябін', album: 'Demo Album', genre: 'Поп', duration: 210, audioUrl: '/audio/demo1.mp3', coverUrl: '/covers/demo1.jpg', popularity: 12 },
            { id: 'demo2', title: 'Нічні дзвони', artist: 'Demo Artist', album: 'Demo Album 2', genre: 'Інді', duration: 185, audioUrl: '/audio/demo2.mp3', coverUrl: '/covers/demo2.jpg', popularity: 7 }
        ];

        // Re-run populate to render demo tracks into any lists
        try { if (typeof populateTracksLists === 'function') populateTracksLists(); }
        catch (e) { console.debug('loadDemoTracks: populateTracksLists failed', e); }
    } catch (e) {
        console.error('loadDemoTracks failed', e);
    }
}

// Perform client-side search using title/artist and genre filter
async function performSearch() {
    try {
        const input = document.querySelector('.search-input');
        const genreSel = document.querySelector('.search-genre-filter');
        if (!input) return;
        const q = (input.value || '').trim().toLowerCase();
        const genre = (genreSel && genreSel.value) ? String(genreSel.value).trim() : '';

        // If empty query and no genre, remove search results
        if (!q && !genre) {
            const existing = document.querySelector('.search-results-section');
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            return;
        }

        const container = createOrGetSearchResultsContainer();
        if (!container) return;
        const listEl = container.querySelector('#searchResults');
        if (!listEl) return;
        listEl.innerHTML = '<div class="loading-text">Пошук...</div>';

        const tracks = await API.getTracks();
        const filtered = (tracks || []).filter(t => {
            let okQ = true;
            if (q) {
                const title = (t.title || '').toLowerCase();
                const artist = (t.artist || '').toLowerCase();
                okQ = title.includes(q) || artist.includes(q);
            }
            let okGenre = true;
            if (genre) {
                okGenre = String((t.genre || '')).toLowerCase() === genre.toLowerCase();
            }
            return okQ && okGenre;
        });

        if (!filtered || filtered.length === 0) {
            listEl.innerHTML = '<div class="loading-text">За запитом нічого не знайдено.</div>';
            return;
        }

        renderTracksInto(listEl, filtered);
    } catch (e) { console.error('performSearch failed', e); }
}

// Initialize search input and genre selector listeners
function initSearch() {
    try {
        const input = document.querySelector('.search-input');
        const genreSel = document.querySelector('.search-genre-filter');
        if (!input && !genreSel) return;

        const debounced = (fn, wait=300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), wait); }; };

        // Only perform the full search when the user explicitly confirms (Enter key).
        // Keep the dropdown/autocomplete behavior active (handled by initSearchDropdown).
        if (input) {
            // When user presses Enter, run full search
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const qv = (input.value || '').trim();
                    // navigate to search page with query
                    window.location.href = `search.html?q=${encodeURIComponent(qv)}`;
                }
            });

            // If user types or clears the input without pressing Enter, remove any existing
            // search results to avoid showing stale results. Debounced to avoid flicker.
            input.addEventListener('input', debounced(() => {
                try {
                    const q = (input.value || '').trim();
                    // If query is empty or user is editing (no Enter), remove results container
                    if (!q) {
                        const existing = document.querySelector('.search-results-section');
                        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                    } else {
                        // If there's a results section present, remove it while user is editing
                        const existing = document.querySelector('.search-results-section');
                        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                    }
                    // wire save/delete buttons inside modal
                    try {
                        const saveBtn = document.getElementById('pmSaveChanges');
                        const delBtn = document.getElementById('pmDeletePlaylist');
                        const nameInput = document.getElementById('pmPlaylistName');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', async (ev) => {
                                ev.stopPropagation();
                                try {
                                    const nameVal = nameInput ? String(nameInput.value || '').trim() : (p.name || '');
                                    const ids = Array.from(document.getElementById('pmTracksList').querySelectorAll('.track-item')).map(it => it.getAttribute('data-id')).filter(Boolean);
                                    await window.API.updatePlaylist(playlistId, { name: nameVal, tracks: ids });
                                    window.showNotification && window.showNotification('Збережено', 'success');
                                    try { refreshPlaylists(); } catch(e){}
                                } catch (err) { console.error('pm save failed', err); window.showNotification && window.showNotification('Не вдалося зберегти', 'error'); }
                            });
                        }
                        if (delBtn) {
                            delBtn.addEventListener('click', async (ev) => {
                                ev.stopPropagation();
                                try {
                                    if (!confirm('Видалити плейлист? Ця дія незворотна.')) return;
                                    await window.API.deletePlaylist(playlistId);
                                    window.showNotification && window.showNotification('Плейлист видалено', 'success');
                                    try { refreshPlaylists(); } catch(e){}
                                } catch (err) { console.error('pm delete failed', err); window.showNotification && window.showNotification('Не вдалося видалити', 'error'); }
                            });
                        }
                    } catch (e) { console.debug('pm control wiring failed', e); }
                } catch (e) { console.debug('clear-on-edit failed', e); }
            }, 150));
        }

        if (genreSel) genreSel.addEventListener('change', () => performSearch());
    } catch (e) { console.debug('initSearch failed', e); }
}

// --- Autocomplete dropdown (YouTube-like) --------------------------------
function initSearchDropdown() {
    try {
        const input = document.querySelector('.search-input');
        if (!input) return;

        // Create dropdown wrapper inside .search-bar
        let wrapper = input.closest('.search-bar');
        if (!wrapper) wrapper = document.body;

        let dd = wrapper.querySelector('.mf-search-dropdown');
        if (!dd) {
            dd = document.createElement('div');
            dd.className = 'mf-search-dropdown';
            dd.style.cssText = `position:absolute; left:8px; right:8px; top:48px; background:#0f0f0f; border:1px solid rgba(255,255,255,0.06); box-shadow:0 6px 18px rgba(0,0,0,0.6); z-index:10020; max-height:360px; overflow:auto; border-radius:6px; padding:6px 6px; font-family: Roboto, sans-serif;`;
            wrapper.style.position = wrapper.style.position || 'relative';
            wrapper.appendChild(dd);
        }

        let activeIndex = -1;
        const recentKey = 'mf_search_history';

        function loadRecent() {
            try { return JSON.parse(localStorage.getItem(recentKey) || '[]'); } catch(e){ return []; }
        }

        function saveRecent(q) {
            try {
                if (!q) return;
                const arr = loadRecent().filter(x => x !== q);
                arr.unshift(q);
                arr.splice(10);
                localStorage.setItem(recentKey, JSON.stringify(arr));
            } catch(e){}
        }

        async function getSuggestions(q) {
            // If query empty => return recent history entries (as {type:'history',query})
            if (!q) {
                return loadRecent().map(x => ({ type: 'history', query: x }));
            }

            // Try to get tracks (cached if possible)
            let tracks = [];
            try { tracks = await API.getTracks(); } catch(e) { tracks = []; }

            const lower = q.toLowerCase();
            const matches = (tracks || []).filter(t => {
                const title = (t.title||'').toLowerCase();
                const artist = (t.artist||'').toLowerCase();
                return title.includes(lower) || artist.includes(lower);
            }).slice(0, 8);

            // Build suggestion list: first matching tracks, then a 'search for "q"' item
            const out = matches.map(t => ({ type: 'track', track: t }));
            out.push({ type: 'action', text: `Пошук: "${q}"`, query: q });
            return out;
        }

        function renderSuggestions(items) {
            dd.innerHTML = '';
            if (!items || items.length === 0) {
                dd.innerHTML = `<div style="padding:12px;color:#aaa">Немає пропозицій</div>`;
                return;
            }

            items.forEach((it, idx) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'mf-suggestion';
                row.style.cssText = 'display:flex;gap:10px;align-items:center;width:100%;padding:8px;border-radius:6px;background:transparent;border:none;color:#fff;text-align:left;cursor:pointer;';
                row.dataset.index = idx;

                if (it.type === 'history') {
                    row.innerHTML = `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(255,255,255,0.02);color:#9aa0a6;font-size:14px;">⟲</div><div style="flex:1;">${it.query}</div><div style="color:#9aa0a6;font-size:12px">Історія</div>`;
                    row.addEventListener('click', () => {
                        const q = it.query || '';
                        saveRecent(q);
                        // navigate to search result page
                        window.location.href = `search.html?q=${encodeURIComponent(q)}`;
                        hide();
                    });
                } else if (it.type === 'track') {
                    const t = it.track;
                    const cover = t.coverUrl || '/covers/default.png';
                    const title = (t.title||'').replace(/</g,'&lt;');
                    const artist = (t.artist||'').replace(/</g,'&lt;');
                    row.innerHTML = `<img src="${cover}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex:0 0 48px;" alt="cover"><div style="flex:1;min-width:0"><div style="font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div><div style="font-size:12px;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${artist}</div></div>`;
                    row.addEventListener('click', () => {
                        const id = t._id || t.id || '';
                        saveRecent(`${t.title || ''}`.trim());
                        // navigate to dedicated search page for this track
                        if (id) {
                            window.location.href = `search.html?trackId=${encodeURIComponent(id)}`;
                        } else {
                            // fallback: search by title
                            window.location.href = `search.html?q=${encodeURIComponent(t.title || '')}`;
                        }
                        hide();
                    });
                } else if (it.type === 'action') {
                    row.innerHTML = `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(255,255,255,0.02);color:#9aa0a6;font-size:14px;">🔎</div><div style="flex:1;">${it.text}</div>`;
                    row.addEventListener('click', () => {
                        const q = it.query || '';
                        input.value = q;
                        saveRecent(q);
                        window.location.href = `search.html?q=${encodeURIComponent(q)}`;
                        hide();
                    });
                }

                row.addEventListener('mouseenter', () => { setActive(parseInt(row.dataset.index,10)); });
                dd.appendChild(row);
            });
        }

        function setActive(i) {
            const nodes = Array.from(dd.querySelectorAll('.mf-suggestion'));
            nodes.forEach(n => n.style.background = 'transparent');
            if (i >=0 && nodes[i]) nodes[i].style.background = 'rgba(255,255,255,0.03)';
            activeIndex = i;
        }

        function hide() { dd.style.display = 'none'; activeIndex = -1; }
        function show() { dd.style.display = 'block'; }

        // Hide when clicking outside
        document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) hide(); });

        // Keyboard navigation
        input.addEventListener('keydown', (e) => {
            const nodes = Array.from(dd.querySelectorAll('.mf-suggestion'));
            if (!nodes.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); const next = Math.min(nodes.length-1, activeIndex+1); setActive(next); nodes[next].scrollIntoView({block:'nearest'}); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = Math.max(0, activeIndex-1); setActive(prev); nodes[prev].scrollIntoView({block:'nearest'}); }
            else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >=0 && nodes[activeIndex]) nodes[activeIndex].click(); else { const qval = (input.value||'').trim(); saveRecent(qval); window.location.href = `search.html?q=${encodeURIComponent(qval)}`; hide(); } }
            else if (e.key === 'Escape') { hide(); }
        });

        // On input, fetch suggestions
        const fetchAndShow = (async (val) => {
            try {
                const items = await getSuggestions(val);
                renderSuggestions(items);
                if (items && items.length) show(); else hide();
            } catch (e) { console.debug('dropdown suggestions failed', e); }
        });

        input.addEventListener('input', (e) => { const v = (e.target.value||'').trim(); if (!v) {
            // show recent
            renderSuggestions(loadRecent().map(x=>({type:'history',query:x}))); show(); return;
        } fetchAndShow(v); });

        // show recent when focused if empty
        input.addEventListener('focus', (e) => { const v = (e.target.value||'').trim(); if (!v) { renderSuggestions(loadRecent().map(x=>({type:'history',query:x}))); show(); } });

    } catch (e) { console.debug('initSearchDropdown failed', e); }
}

// ensure dropdown initialized when search is initialized
try { if (typeof window !== 'undefined') { document.addEventListener('DOMContentLoaded', () => { initSearchDropdown(); }); } } catch(e) {}

// Delegated handler for playlist 'open' (eye) buttons — ensures dynamic content opens modal
if (!window._mf_playlist_open_delegated) {
    document.addEventListener('click', (e) => {
        try {
            const btn = e.target.closest && e.target.closest('.playlist-open');
            if (!btn) return;
            e.stopPropagation();
            const id = btn.getAttribute('data-id') || (btn.dataset && btn.dataset.id);
            if (!id) return;
            if (typeof openPlaylistManager === 'function') {
                openPlaylistManager(id);
            }
        } catch (err) {
            console.debug('playlist-open delegated handler failed', err);
        }
    });
    window._mf_playlist_open_delegated = true;
}
