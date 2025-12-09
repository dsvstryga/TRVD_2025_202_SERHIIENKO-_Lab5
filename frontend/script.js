// Basic player + SPA-like navigation to keep audio playing across pages
document.addEventListener('DOMContentLoaded', function() {
    let isPlaying = false;
    const playBtn = document.querySelector('.play-btn');
    const progressBar = document.querySelector('.progress');
    const volumeBar = document.querySelector('.volume-level');

    // Simple play/pause simulation (replace with real audio element when available)
    if (playBtn) {
        playBtn.addEventListener('click', function() {
            isPlaying = !isPlaying;
            const icon = playBtn.querySelector('i');
            if (isPlaying) {
                icon.classList.replace('fa-play', 'fa-pause');
                simulateProgress();
            } else {
                icon.classList.replace('fa-pause', 'fa-play');
            }
        });
    }

    function simulateProgress() {
        if (!isPlaying) return;
        let progress = parseFloat(progressBar?.style.width) || 0;
        const interval = setInterval(() => {
            if (!isPlaying) { clearInterval(interval); return; }
            progress += 0.5;
            if (progress <= 100) {
                if (progressBar) progressBar.style.width = progress + '%';
                updateTimeDisplay(progress);
            } else {
                clearInterval(interval);
                isPlaying = false;
                if (playBtn) playBtn.querySelector('i').classList.replace('fa-pause', 'fa-play');
                if (progressBar) progressBar.style.width = '0%';
                updateTimeDisplay(0);
            }
        }, 1000);
    }

    // Update time display
    function updateTimeDisplay(percentage) {
        const totalSeconds = 225; // fallback total duration
        const currentSeconds = Math.floor((percentage / 100) * totalSeconds);
        const minutes = Math.floor(currentSeconds / 60);
        const seconds = currentSeconds % 60;
        const el = document.querySelector('.current-time');
        if (el) el.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Update player track info
    function updatePlayerInfo(trackName, artistName) {
        const trackDetails = document.querySelector('.track-details');
        if (!trackDetails) return;
        trackDetails.querySelector('h4').textContent = trackName || '';
        trackDetails.querySelector('p').textContent = artistName || '';
        if (progressBar) progressBar.style.width = '0%';
        updateTimeDisplay(0);
        if (playBtn && !isPlaying) playBtn.click();
    }

    // Bind interactive elements that exist inside .main-content and elsewhere
    function bindInteractions(root = document) {
        // Track cards and video cards
        root.querySelectorAll('.track-card, .video-card').forEach(card => {
            card.removeEventListener('click', card._mf_click);
            const handler = function() {
                const titleEl = this.querySelector('h3');
                const artistEl = this.querySelector('p');
                const title = titleEl ? titleEl.textContent : '';
                const artist = artistEl ? artistEl.textContent : '';
                updatePlayerInfo(title, artist);
                const cover = this.querySelector('.track-cover, .video-thumbnail');
                if (cover) {
                    const coverStyle = window.getComputedStyle(cover).backgroundImage;
                    const smallCover = document.querySelector('.track-cover-small');
                    if (smallCover) smallCover.style.background = coverStyle.includes('gradient') ? coverStyle : 'linear-gradient(135deg, #667eea, #764ba2)';
                }
            };
            card._mf_click = handler;
            card.addEventListener('click', handler);
        });

        // Like buttons (track-level)
        root.querySelectorAll('.like-btn').forEach(btn => {
            btn.removeEventListener('click', btn._mf_like);
            const handler = function(e) {
                e.stopPropagation();
                const icon = this.querySelector('i');
                if (!icon) return;
                if (icon.classList.contains('far')) {
                    icon.classList.replace('far', 'fas');
                    this.classList.add('favorited');
                } else {
                    icon.classList.replace('fas', 'far');
                    this.classList.remove('favorited');
                }
            };
            btn._mf_like = handler;
            btn.addEventListener('click', handler);
        });

        // Artist cards (show more handled elsewhere)
        root.querySelectorAll('.artist-card:not(.show-more-card)').forEach(card => {
            card.removeEventListener('click', card._mf_artist);
            const handler = function() {
                const artistName = this.querySelector('h3')?.textContent || '';
                const randomTracks = ['Найкращий хіт','Популярний трек','Новий реліз','Класична композиція'];
                const randomTrack = randomTracks[Math.floor(Math.random()*randomTracks.length)];
                updatePlayerInfo(`${randomTrack} - ${artistName}`, artistName);
            };
            card._mf_artist = handler;
            card.addEventListener('click', handler);
        });

        // Progress bar click
        const pbar = root.querySelector('.progress-bar');
        if (pbar) {
            pbar.removeEventListener('click', pbar._mf_progress);
            const handler = function(e) {
                const rect = this.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const width = rect.width;
                const percentage = (clickX / width) * 100;
                if (progressBar) progressBar.style.width = percentage + '%';
                updateTimeDisplay(percentage);
            };
            pbar._mf_progress = handler;
            pbar.addEventListener('click', handler);
        }

        // Volume bar click
        const vbar = root.querySelector('.volume-bar');
        if (vbar) {
            vbar.removeEventListener('click', vbar._mf_volume);
            const handler = function(e) {
                const rect = this.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const width = rect.width;
                const percentage = (clickX / width) * 100;
                const volLevel = document.querySelector('.volume-level');
                if (volLevel) volLevel.style.width = percentage + '%';
            };
            vbar._mf_volume = handler;
            vbar.addEventListener('click', handler);
        }

        // Intercept internal links inside this root so navigation keeps the player alive
        root.querySelectorAll('a[href]').forEach(link => {
            try {
                link.removeEventListener('click', link._mf_nav);
            } catch (e) {}
                const navHandler = async function(e) {
                    const href = this.getAttribute('href');
                    if (!href) return;
                    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
                    e.preventDefault();
                    // For account/profile pages, verify session with server first
                    try {
                        if ((href.includes('account.html') || href.includes('profile.html')) && window.UserManager) {
                            const ok = await window.UserManager.ensureAuthenticated();
                            // If not authenticated, still navigate so account page shows login view
                            loadPage(href, true);
                            return;
                        }
                    } catch (err) {
                        console.debug('link click auth check failed', err);
                    }
                    loadPage(href, true);
                };
            link._mf_nav = navHandler;
            link.addEventListener('click', navHandler);
        });
    }

    // Initial bind
    bindInteractions(document);

    // SPA-like navigation: fetch and swap .main-content to keep footer/player alive
    async function loadPage(href, push = true) {
        try {
            const main = document.querySelector('.main-content');
            if (!main) { window.location.href = href; return; }
            // fade out
            main.style.animation = 'fadeOut 0.25s ease-in';
            await new Promise(r => setTimeout(r, 250));
            const res = await fetch(href, { method: 'GET', credentials: 'same-origin' });
            if (!res.ok) { window.location.href = href; return; }
            const text = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newMain = doc.querySelector('.main-content');
            if (newMain) {
                main.innerHTML = newMain.innerHTML;
                document.title = doc.title || document.title;
                if (push) history.pushState({ url: href }, '', href);
                // re-bind dynamic interactions
                bindInteractions(main);
                
                // Run page-specific initializers to support SPA swaps
                try {
                    // Ensure user/navigation state is refreshed
                    try { if (window.userManager && typeof window.userManager.loadCurrentUser === 'function') window.userManager.loadCurrentUser(); } catch (e) {}
                    try { if (window.userManager && typeof window.userManager.updateNavigation === 'function') window.userManager.updateNavigation(); } catch (e) {}

                    // Re-setup auth forms if account page content was injected
                    try { if (window.authManager && typeof window.authManager.setupAuthForms === 'function') window.authManager.setupAuthForms(); } catch (e) {}
                    try { if (window.authManager && typeof window.authManager.checkAuthState === 'function') window.authManager.checkAuthState(); } catch (e) {}

                    // Force profile manager init for profile/account pages
                    try { if (window.profileManager && typeof window.profileManager.init === 'function') window.profileManager.init(true); } catch (e) {}
                } catch (e) {
                    console.debug('Post-navigation initializers failed', e);
                }
						// If available, refresh any tracks lists that were swapped into the page
                    try { if (typeof populateTracksLists === 'function') populateTracksLists(); } catch (e) { console.warn('populateTracksLists after navigation failed', e); }
                    // Sync footer UI with player state (in case ensureFooterExists injected it)
                    try { if (window.musicPlayer && typeof window.musicPlayer.syncFooterWithPlayer === 'function') window.musicPlayer.syncFooterWithPlayer(); } catch (e) { console.debug('syncFooterWithPlayer failed', e); }
                // fade in
                main.style.animation = 'fadeInUp 0.35s ease-out';
            } else {
                window.location.href = href; // fallback
            }
        } catch (err) {
            console.error('Navigation failed', err);
            window.location.href = href;
        }
    }

    // Intercept links
    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href) return;
            // Only handle internal html pages and same-origin
            if (href.endsWith('.html') && (href.indexOf('http') !== 0)) {
                e.preventDefault();
                loadPage(href, true);
            }
        });
    });

    // Handle back/forward
    window.addEventListener('popstate', (e) => {
        const url = location.pathname.split('/').pop() || 'index.html';
        loadPage(url, false);
    });

    // Ensure .main-content has initial fade-in
    const mainInit = document.querySelector('.main-content');
    if (mainInit) mainInit.style.animation = 'fadeInUp 0.45s ease-out';
});