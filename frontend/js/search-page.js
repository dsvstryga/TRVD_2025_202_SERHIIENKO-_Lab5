// js/search-page.js
// Reads ?trackId=... or ?q=... and renders selected track and similar-by-genre

(async function(){
    function qs(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    function escapeHtml(s){ return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    const selectedEl = document.getElementById('selectedTrack');
    const similarEl = document.getElementById('similarTracks');
    const selectedExtra = document.getElementById('selectedExtra');

    const trackId = qs('trackId');
    const q = qs('q');

    try {
        // Prefill header search input with query if present
        const headerInput = document.querySelector('.search-input');
        if (headerInput && (q || '')) headerInput.value = q || '';
        const tracks = await API.getTracks();
        if (!tracks || !tracks.length) {
            selectedEl.innerHTML = '<div>Треки не завантажені.</div>';
            return;
        }

        let selected = null;
        if (trackId) {
            selected = tracks.find(t => String(t._id||t.id||'') === String(trackId));
        }
        if (!selected && q) {
            const lower = (q||'').toLowerCase();
            selected = tracks.find(t => ((t.title||'').toLowerCase().includes(lower) || (t.artist||'').toLowerCase().includes(lower)));
        }

        if (!selected) {
            selectedEl.innerHTML = `<div>Нічого не знайдено за запитом.</div>`;
            // still show a few popular tracks
            const fallback = tracks.slice(0,8);
            renderList(similarEl, fallback);
            return;
        }

        // Render selected track in YouTube-like style
        const cover = selected.coverUrl || '/covers/default.png';
        const title = escapeHtml(selected.title || '');
        const artist = escapeHtml(selected.artist || '');
        const genre = escapeHtml(selected.genre || '');
        const mainHtml = `
            <div class="result-card">
                <img class="result-cover" src="${cover}" alt="cover">
                <div class="result-info">
                    <h1>${title}</h1>
                    <div class="meta">${artist}</div>
                    <div class="meta">Жанр: ${genre}</div>
                    <div class="result-actions">
                        <button id="playSelected" class="btn btn-primary">▶ Відтворити</button>
                        <button id="saveSelected" class="btn btn-secondary">Зберегти</button>
                    </div>
                </div>
            </div>
        `;
        selectedEl.innerHTML = mainHtml;

        // small extra description area (below card) could contain album/related info
        selectedExtra.innerHTML = `<div style="margin-top:12px;color:var(--muted)">Показано результат за запитом: <strong>${escapeHtml(q || title)}</strong></div>`;

        // Play button behavior using global musicPlayer if available
        const playBtn = document.getElementById('playSelected');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                try {
                    // create a temporary track-item element and ask player to play
                    const trackEl = document.createElement('div');
                    trackEl.className = 'track-item';
                    trackEl.setAttribute('data-id', selected._id || selected.id || '');
                    trackEl.setAttribute('data-audio', selected.audioUrl || '');
                    trackEl.setAttribute('data-cover', cover);
                    trackEl.setAttribute('data-title', selected.title || '');
                    trackEl.setAttribute('data-artist', selected.artist || '');
                    window.musicPlayer && window.musicPlayer.playTrackFromItem(trackEl);
                } catch(e) { console.debug('playSelected failed', e); }
            });
        }

        // Find similar by same genre (exclude selected)
        const genreLower = (selected.genre || '').toLowerCase();
        const similar = tracks.filter(t => (t._id||t.id) !== (selected._id||selected.id) && (t.genre||'').toLowerCase() === genreLower).slice(0,24);
        if (!similar.length) {
            similarEl.innerHTML = '<div class="loading-text">Схожих треків не знайдено.</div>';
        } else {
            renderCompactList(similarEl, similar);
        }

    } catch (e) {
        console.error('search-page failed', e);
        selectedEl.innerHTML = '<div>Сталася помилка під час завантаження.</div>';
    }

    // Render compact list for right column (YouTube-like)
    function renderCompactList(container, list) {
        container.innerHTML = '';
        list.forEach(t => {
            const item = document.createElement('div');
            item.className = 'similar-item';
            const cover = t.coverUrl || '/covers/default.png';
            const dur = formatDurationFor(t.duration);
            item.innerHTML = `
                <img class="similar-thumb" src="${cover}" alt="thumb">
                <div class="similar-meta">
                    <div class="similar-title">${escapeHtml(t.title||'')}</div>
                    <div class="similar-sub">${escapeHtml(t.artist||'')}</div>
                </div>
                <div class="similar-duration">${dur}</div>
            `;
            item.addEventListener('click', () => {
                try {
                    const tu = document.createElement('div');
                    tu.className = 'track-item';
                    tu.setAttribute('data-id', t._id||t.id||'');
                    tu.setAttribute('data-audio', t.audioUrl||'');
                    tu.setAttribute('data-cover', cover);
                    tu.setAttribute('data-title', t.title || '');
                    tu.setAttribute('data-artist', t.artist || '');
                    window.musicPlayer && window.musicPlayer.playTrackFromItem(tu);
                } catch(e) { console.debug('play similar failed', e); }
            });
            container.appendChild(item);
        });
    }

    function formatDurationFor(d) {
        try {
            const sec = Number(d) || 0;
            const m = Math.floor(sec/60);
            const s = Math.floor(sec%60).toString().padStart(2,'0');
            return `${m}:${s}`;
        } catch(e) { return '--:--'; }
    }

})();