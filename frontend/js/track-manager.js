// js/track-manager.js - Manage tracks UI for admins/moderators
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadTrackForm');
    const list = document.getElementById('tracksList');
    const coverPreviewEl = document.getElementById('coverPreview');
    const coverInputEl = document.getElementById('coverInput');

    // Fallback simple modal shim if `window.showModal` is not defined (prevents TypeError)
    if (typeof window.showModal !== 'function') {
        window.showModal = async function(options = {}) {
            const fields = options.fields || [];
            const values = {};
            for (const f of fields) {
                const promptLabel = (f.label || f.name) + ':';
                const val = window.prompt(promptLabel, f.value || '');
                if (val === null) {
                    return { submitted: false };
                }
                values[f.name] = val;
            }
            return { submitted: true, values };
        };
    }

    async function loadTracks() {
        list.innerHTML = '<div class="loading-text">Завантаження треків...</div>';
        try {
            const data = await API.getTracks();
            // API.getTracks returns array
            renderTracks(data || []);
            populateGenreSelect(data || []);
            // Notify other parts of the app that tracks were (re)loaded/updated
            try { window.dispatchEvent(new Event('tracks:updated')); } catch (e) {}
            // Also set localStorage flag so other pages (or after navigation) can detect updates
            try { localStorage.setItem('tracksUpdatedAt', String(Date.now())); } catch (e) {}
        } catch (err) {
            console.error('Error loading tracks', err);
            list.innerHTML = `<div class="loading-text">Помилка завантаження</div>`;
        }
    }

    function formatDuration(seconds) {
        const s = Number(seconds) || 0;
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${String(mins)}:${String(secs).padStart(2,'0')}`;
    }

    function renderTracks(tracks, genreFilter) {
        if (!tracks || tracks.length === 0) {
            list.innerHTML = '<div class="loading-text">Треків не знайдено</div>';
            return;
        }

        // Group by genre
        const groups = {};
        tracks.forEach(t => {
            const g = (t.genre || 'Без жанру').trim() || 'Без жанру';
            if (!groups[g]) groups[g] = [];
            groups[g].push(t);
        });

        // Sort genres alphabetically
        const genres = Object.keys(groups).sort((a,b) => a.localeCompare(b, 'uk'));

        // Render grouped markup
        let html = '';
        genres.forEach(g => {
            if (genreFilter && genreFilter !== '' && genreFilter !== g) return;
            const items = groups[g];
            html += `<div class="genre-group"><h4 style="margin:8px 0 6px 0;">${escapeHtml(g)} <span style="font-weight:400;color:var(--text-secondary);">(${items.length})</span></h4>`;
            items.forEach(t => {
                const cover = t.coverUrl || '/covers/default.png';
                // Use same `.track-item` structure as library.html so playback and views updates work consistently
                html += `
                    <div class="track-item track-row" data-audio="${t.audioUrl || ''}" data-id="${t.id}" data-cover="${cover}" data-genre="${escapeHtml(t.genre||'')}">
                        <div style="display:flex;align-items:center;gap:12px;width:100%">
                            <input type="checkbox" class="select-track-checkbox" data-id="${t.id}" style="margin-left:8px;" />
                            <div class="track-cover-small" style="background-image:url('${cover}');width:56px;height:56px;border-radius:6px;flex-shrink:0;position:relative;">
                                <div class="play-overlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;background:rgba(0,0,0,0.2);">
                                    <i class="fas fa-play" style="color:#fff;"></i>
                                </div>
                            </div>
                            <div class="track-info" style="flex:1;min-width:0;">
                                <h3 class="track-title" style="margin:0;font-size:1rem;">${escapeHtml(t.title)}</h3>
                                <p class="track-artist" style="margin:2px 0 0 0;color:var(--text-secondary);font-size:0.9rem;">${escapeHtml(t.artist)} • ${escapeHtml(t.album || '')}</p>
                            </div>
                            <div class="track-controls" style="margin-left:8px;">
                                <div class="track-views"><span class="views-count" data-track="${t.id}">${(t.popularity||0)} прослух.</span></div>
                                <div class="track-duration" style="color:var(--text-secondary);margin-left:12px">${t.duration ? formatDuration(t.duration) : ''}</div>
                                <button class="btn-icon danger" title="Видалити трек" data-action="delete"><i class="fas fa-trash"></i></button>
                                <button class="btn-icon" title="Редагувати" data-action="edit"><i class="fas fa-edit"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        });

        list.innerHTML = html;

        // attach handlers to each rendered track item
        list.querySelectorAll('.track-item').forEach(row => {
            const id = row.dataset.id || row.getAttribute('data-id');
            const editBtn = row.querySelector('[data-action="edit"]');
            const delBtn = row.querySelector('[data-action="delete"]');
            if (editBtn) editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); editTrack(id); });
            if (delBtn) delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); deleteTrack(id); });
            // Ensure checkbox clicks don't bubble to the global track click handler (which would play/pause)
            const cb = row.querySelector('.select-track-checkbox');
            if (cb) {
                cb.addEventListener('click', (ev) => {
                    // stop propagation so clicking the checkbox only selects the track and doesn't play it
                    ev.stopPropagation();
                });
            }
        });

        // wire delete selected button
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.onclick = async () => {
                const checked = Array.from(document.querySelectorAll('.select-track-checkbox:checked')).map(c => c.dataset.id).filter(Boolean);
                if (!checked.length) { window.showNotification('Нічого не вибрано', 'warning'); return; }
                if (!confirm(`Видалити ${checked.length} трек(ів)? Це дію неможливо скасувати.`)) return;
                try {
                    const token = API.getToken(); if (!token) { window.showNotification('Потрібна авторизація', 'error'); return; }
                    for (const id of checked) {
                        const resp = await fetch(`${API.BASE_URL}/tracks/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                        const result = await resp.json().catch(()=>null);
                        if (!resp.ok) { console.error('Delete failed for', id, result); }
                    }
                    window.showNotification('Видалення виконано', 'success');
                    loadTracks();
                } catch (err) { console.error('Batch delete error', err); window.showNotification('Помилка видалення', 'error'); }
            };
        }
    }

    function populateGenreSelect(tracks) {
        try {
            const sel = document.getElementById('genreSelect');
            const filter = document.getElementById('manageGenreFilter');
            if (!sel || !filter) return;
            // include common/popular genres first
            const popular = ['Поп', 'Рок', 'Хіп-хоп', 'Електронна', 'Джаз', 'Класична', 'Фолк', 'Метал', 'R&B'];
            const genres = new Set(popular);
            (tracks||[]).forEach(t => { const g = (t.genre||'').trim() || 'Без жанру'; genres.add(g); });
            const sorted = Array.from(genres).sort((a,b)=> a.localeCompare(b,'uk'));
            // clear existing options (keep first placeholder)
            sel.innerHTML = '<option value="">Оберіть жанр...</option>' + sorted.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
            filter.innerHTML = '<option value="">Усі жанри</option>' + sorted.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
            filter.onchange = () => { renderTracks(window._manage_tracks_cache || [], filter.value); };
            window._manage_tracks_cache = tracks || [];
        } catch (e) { console.debug('populateGenreSelect failed', e); }
    }

    function escapeHtml(s) { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    async function editTrack(id) {
        try {
            const track = await API.getTrackById(id);
            if (!track) { window.showNotification('Трек не знайдено', 'error'); return; }
            const t = track;
            const modal = await window.showModal({
                title: 'Редагувати трек',
                fields: [
                    { name: 'title', label: 'Назва', value: t.title },
                    { name: 'artist', label: 'Виконавець', value: t.artist },
                    { name: 'album', label: 'Альбом', value: t.album || '' },
                    { name: 'genre', label: 'Жанр', value: t.genre || '' }
                ],
                submitText: 'Зберегти',
                cancelText: 'Скасувати'
            });

            if (!modal.submitted) return;

            const payload = {
                title: modal.values.title,
                artist: modal.values.artist,
                album: modal.values.album,
                genre: modal.values.genre
            };

            const token = API.getToken();
            if (!token) { window.showNotification('Потрібна авторизація', 'error'); return; }

            const resp = await fetch(`${API.BASE_URL}/tracks/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Update failed');
            window.showNotification('Трек оновлено', 'success');
            // after metadata update, ask if admin wants to upload a new cover
            if (confirm('Бажаєте завантажити нову обкладинку для цього треку?')) {
                await showCoverUploadModal(id);
            }
            loadTracks();
        } catch (err) {
            console.error('Edit error', err);
            window.showNotification('Помилка оновлення: ' + (err.message||err), 'error');
        }
    }

    async function deleteTrack(id) {
        if (!confirm('Видалити цей трек?')) return;
        try {
            const token = API.getToken(); if (!token) { window.showNotification('Потрібна авторизація', 'error'); return; }
            const resp = await fetch(`${API.BASE_URL}/tracks/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Delete failed');
            window.showNotification('Трек видалено', 'success');
            loadTracks();
        } catch (err) {
            console.error('Delete error', err);
            window.showNotification('Помилка видалення: ' + (err.message||err), 'error');
        }
    }

    // Upload form
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const fd = new FormData(form);
                const token = API.getToken(); if (!token) { window.showNotification('Потрібна авторизація', 'error'); return; }
                window.showNotification('Завантаження...', 'info');
                const resp = await fetch(`${API.BASE_URL}/tracks/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.message || 'Upload failed');
                window.showNotification('Трек додано', 'success');
                form.reset();
                if (coverPreviewEl) { coverPreviewEl.classList.add('hidden'); coverPreviewEl.style.backgroundImage = ''; }
                loadTracks();
            } catch (err) {
                console.error('Upload error', err);
                window.showNotification('Помилка: ' + (err.message||err), 'error');
            }
        });
    }

    // Cover preview for upload form
    if (coverInputEl && coverPreviewEl) {
        coverInputEl.addEventListener('change', (ev) => {
            const f = ev.target.files && ev.target.files[0];
            if (!f) { coverPreviewEl.classList.add('hidden'); coverPreviewEl.style.backgroundImage = ''; return; }
            if (!f.type.startsWith('image/')) { window.showNotification('Оберіть зображення для обкладинки', 'warning'); coverInputEl.value = ''; return; }
            const reader = new FileReader();
            reader.onload = function(evt) {
                coverPreviewEl.style.backgroundImage = `url('${evt.target.result}')`;
                coverPreviewEl.classList.remove('hidden');
            };
            reader.readAsDataURL(f);
        });
    }

    // small custom modal to upload/replace cover for a track
    async function showCoverUploadModal(trackId) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'mf-modal-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:11000;';

            const card = document.createElement('div');
            card.style.cssText = 'background:#0c0d0f;padding:16px;border-radius:10px;min-width:320px;max-width:92%;';
            const h = document.createElement('h3'); h.textContent = 'Завантажити обкладинку'; h.style.marginTop = '0';
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.style.display = 'block'; input.style.margin = '12px 0';
            const preview = document.createElement('div'); preview.style.cssText = 'width:160px;height:160px;border-radius:8px;background:#111;background-size:cover;background-position:center;margin-bottom:10px;';
            const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Відміна'; cancelBtn.className='profile-btn';
            const uploadBtn = document.createElement('button'); uploadBtn.textContent = 'Завантажити'; uploadBtn.className='profile-btn primary';

            btnRow.appendChild(cancelBtn); btnRow.appendChild(uploadBtn);
            card.appendChild(h); card.appendChild(preview); card.appendChild(input); card.appendChild(btnRow);
            overlay.appendChild(card); document.body.appendChild(overlay);

            input.addEventListener('change', (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return; const reader = new FileReader(); reader.onload = (ev) => { preview.style.backgroundImage = `url('${ev.target.result}')`; };
                reader.readAsDataURL(f);
            });

            cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(false); });

            uploadBtn.addEventListener('click', async () => {
                const f = input.files && input.files[0];
                if (!f) { window.showNotification('Оберіть файл', 'warning'); return; }
                const token = API.getToken(); if (!token) { window.showNotification('Потрібна авторизація', 'error'); return; }
                const fd = new FormData(); fd.append('cover', f);
                try {
                    window.showNotification('Завантаження обкладинки...', 'info');
                    const resp = await fetch(`${API.BASE_URL}/tracks/${trackId}/cover`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
                    const result = await resp.json();
                    if (!resp.ok) throw new Error(result.message || 'Upload failed');
                    window.showNotification('Обкладинка оновлена', 'success');
                    overlay.remove(); resolve(true);
                } catch (err) {
                    console.error('Cover upload error', err);
                    window.showNotification('Помилка завантаження: ' + (err.message||err), 'error');
                }
            });
        });
    }

    // initial
    loadTracks();
});
