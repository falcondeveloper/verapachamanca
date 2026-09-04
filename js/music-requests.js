document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('music-request-form');
  const songInput = document.getElementById('song-name');
  const artistInput = document.getElementById('artist-name');
  const categoryInput = document.getElementById('music-category');
  const youtubeInput = document.getElementById('youtube-url');
  const saveButton = document.getElementById('music-save-button');
  const cancelButton = document.getElementById('music-cancel-button');
  const message = document.getElementById('music-form-message');
  const tbody = document.getElementById('music-table-body');
  const tableWrap = document.getElementById('music-table-wrap');
  const empty = document.getElementById('music-empty');
  const loading = document.getElementById('music-loading');
  const count = document.getElementById('music-count');
  const linkCount = document.getElementById('music-link-count');
  const filterSelect = document.getElementById('music-filter-category');
  const selectionCount = document.getElementById('music-selection-count');
  const clearChecksButton = document.getElementById('music-clear-checks');
  const playAllButton = document.getElementById('music-play-all-button');
  const playFilteredButton = document.getElementById('music-play-filtered-button');
  const playCheckedButton = document.getElementById('music-play-checked-button');
  const playerCard = document.getElementById('music-player-card');
  const playerMessage = document.getElementById('music-player-message');
  const hidePlayerButton = document.getElementById('music-hide-player');
  const youtubeSearchButton = document.getElementById('music-youtube-search-button');
  const youtubeSearchModal = document.getElementById('youtube-search-modal');
  const youtubeSearchQuery = document.getElementById('youtube-search-query');
  const youtubeSearchSubmit = document.getElementById('youtube-search-submit');
  const youtubeSearchStatus = document.getElementById('youtube-search-status');
  const youtubeSearchResults = document.getElementById('youtube-search-results');
  const selectedYouTube = document.getElementById('music-selected-youtube');
  const selectedYouTubeThumb = document.getElementById('music-selected-youtube-thumb');
  const selectedYouTubeTitle = document.getElementById('music-selected-youtube-title');
  const songPreviewModal = document.getElementById('song-preview-modal');
  const songPreviewTitle = document.getElementById('song-preview-title');
  const songPreviewArtist = document.getElementById('song-preview-artist');
  const songPreviewFrame = document.getElementById('song-preview-frame');

  let requests = [];
  let categories = [];
  let editingRequestId = null;
  let youtubePlayer = null;
  let youtubeApiPromise = null;
  const checkedIds = new Set();

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function extractYouTubeVideoId(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    let parsed;
    try { parsed = new URL(text); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] || null;
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
      else if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }


  function closeSongPreview() {
    if (!songPreviewModal) return;
    songPreviewModal.hidden = true;
    songPreviewFrame.removeAttribute('src');
    document.body.style.overflow = '';
  }

  function openSongPreview(request) {
    if (!request) return;
    const videoId = request.youtube_video_id || extractYouTubeVideoId(request.youtube_url);
    if (!videoId) {
      alert('Missing YouTube link.');
      return;
    }

    songPreviewTitle.textContent = request.song_name || 'Song Preview';
    songPreviewArtist.textContent = request.artist_name || '';
    songPreviewFrame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
    songPreviewModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }


  function showSelectedYouTube(videoId, title = '') {
    if (!videoId) {
      selectedYouTube.hidden = true;
      selectedYouTubeThumb.removeAttribute('src');
      selectedYouTubeTitle.textContent = 'YouTube video selected';
      return;
    }
    selectedYouTubeThumb.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    selectedYouTubeTitle.textContent = title || 'YouTube video selected';
    selectedYouTube.hidden = false;
  }

  function syncSelectedYouTubeFromInput() {
    const videoId = extractYouTubeVideoId(youtubeInput.value);
    showSelectedYouTube(videoId);
  }

  function stopInlineYouTubePreviews() {
    youtubeSearchResults.querySelectorAll('.youtube-result').forEach(card => {
      card.classList.remove('is-previewing');
      const frame = card.querySelector('.youtube-result-preview-frame iframe');
      if (frame) frame.removeAttribute('src');
      const previewButton = card.querySelector('.youtube-preview-result');
      if (previewButton) {
        previewButton.textContent = 'Preview';
        previewButton.disabled = false;
      }
    });
  }

  function closeYouTubeSearch() {
    stopInlineYouTubePreviews();
    youtubeSearchModal.hidden = true;
    document.body.style.overflow = '';
  }

  function previewYouTubeResult(videoId, trigger) {
    if (!videoId || !trigger) return;

    const card = trigger.closest('.youtube-result');
    if (!card) return;

    const wasPreviewing = card.classList.contains('is-previewing');
    stopInlineYouTubePreviews();

    if (wasPreviewing) return;

    const frame = card.querySelector('.youtube-result-preview-frame iframe');
    if (!frame) return;

    card.classList.add('is-previewing');
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;

    const previewButton = card.querySelector('.youtube-result-actions .youtube-preview-result');
    if (previewButton) {
      previewButton.textContent = 'Playing';
      previewButton.disabled = true;
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderYouTubeSearchResults(results) {
    youtubeSearchResults.innerHTML = '';
    if (!results.length) {
      youtubeSearchResults.innerHTML = '<p class="volunteer-empty">No YouTube videos matched that search. Try changing the song or artist.</p>';
      return;
    }

    for (const result of results) {
      const card = document.createElement('article');
      card.className = 'youtube-result';
      card.innerHTML = `
        <button class="youtube-result-thumb youtube-preview-result" type="button" data-video-id="${escapeHtml(result.video_id)}" aria-label="Preview ${escapeHtml(result.title)}">
          <img src="${escapeHtml(result.thumbnail_url)}" alt="" loading="lazy">
        </button>
        <div class="youtube-result-copy">
          <strong>${escapeHtml(result.title)}</strong>
          <small>${escapeHtml(result.channel_title || 'YouTube')}</small>
        </div>
        <div class="youtube-result-actions">
          <button class="table-action youtube-preview-result" type="button" data-video-id="${escapeHtml(result.video_id)}">Preview</button>
          <button class="table-action youtube-use-result" type="button"
            data-video-id="${escapeHtml(result.video_id)}"
            data-youtube-url="${escapeHtml(result.youtube_url)}"
            data-title="${escapeHtml(result.title)}">Use This</button>
        </div>
        <div class="youtube-result-preview">
          <div class="youtube-result-preview-label">
            <span>▶ Previewing this result</span>
            <span>Use This ↑</span>
          </div>
          <div class="youtube-result-preview-frame">
            <iframe title="YouTube preview: ${escapeHtml(result.title)}"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen></iframe>
          </div>
        </div>`;
      youtubeSearchResults.appendChild(card);
    }
  }

  async function searchYouTube() {
    const query = youtubeSearchQuery.value.trim();
    if (!query) {
      youtubeSearchStatus.textContent = 'Enter a song name or artist.';
      youtubeSearchQuery.focus();
      return;
    }

    youtubeSearchSubmit.disabled = true;
    youtubeSearchSubmit.textContent = 'Searching...';
    youtubeSearchStatus.textContent = 'Searching YouTube...';
    stopInlineYouTubePreviews();
    youtubeSearchResults.innerHTML = '';

    try {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`, {
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'YouTube search failed.');
      const results = Array.isArray(data.results) ? data.results : [];
      youtubeSearchStatus.textContent = results.length ? `${results.length} matches found.` : 'No matches found.';
      renderYouTubeSearchResults(results);
    } catch (error) {
      youtubeSearchStatus.textContent = error.message;
      youtubeSearchResults.innerHTML = '';
    } finally {
      youtubeSearchSubmit.disabled = false;
      youtubeSearchSubmit.textContent = 'Search';
    }
  }

  function openYouTubeSearch() {
    const song = songInput.value.trim();
    const artist = artistInput.value.trim();
    const query = [song, artist].filter(Boolean).join(' ');
    if (!query) {
      message.textContent = 'Enter a song name first, then tap Search YouTube.';
      songInput.focus();
      return;
    }

    youtubeSearchQuery.value = query;
    youtubeSearchStatus.textContent = '';
    stopInlineYouTubePreviews();
    youtubeSearchResults.innerHTML = '';
    youtubeSearchModal.hidden = false;
    document.body.style.overflow = 'hidden';
    youtubeSearchQuery.focus();
    searchYouTube();
  }

  function fillCategoryLists() {
    const selectedForm = categoryInput.value;
    const selectedFilter = filterSelect.value || 'all';

    categoryInput.innerHTML = '<option value="">Uncategorized</option>' + categories.map(category =>
      `<option value="${category.category_id}">${escapeHtml(category.category_name)}</option>`
    ).join('');

    filterSelect.innerHTML = '<option value="all">All Categories</option><option value="uncategorized">Uncategorized</option>' + categories.map(category =>
      `<option value="${category.category_id}">${escapeHtml(category.category_name)}</option>`
    ).join('');

    if ([...categoryInput.options].some(option => option.value === selectedForm)) categoryInput.value = selectedForm;
    if ([...filterSelect.options].some(option => option.value === selectedFilter)) filterSelect.value = selectedFilter;
  }

  function filteredRequests() {
    const value = filterSelect.value || 'all';
    if (value === 'all') return requests;
    if (value === 'uncategorized') return requests.filter(request => !request.category_id);
    return requests.filter(request => String(request.category_id || '') === value);
  }

  function linked(list) {
    return list.filter(request => request.youtube_video_id);
  }

  function updateStatus() {
    const visible = filteredRequests();
    const allLinked = linked(requests).length;
    const filteredLinked = linked(visible).length;
    const checked = requests.filter(request => checkedIds.has(Number(request.request_id)));
    const checkedPlayable = linked(checked).length;

    linkCount.textContent = `${allLinked} of ${requests.length} request${requests.length === 1 ? '' : 's'} ${allLinked === 1 ? 'has' : 'have'} a YouTube link`;
    selectionCount.textContent = `${checked.length} checked · ${checkedPlayable} playable`;

    playAllButton.disabled = allLinked === 0;
    playFilteredButton.disabled = filteredLinked === 0;
    playCheckedButton.disabled = checkedPlayable === 0;
    clearChecksButton.disabled = checked.length === 0;

    playAllButton.textContent = allLinked ? `Queue All ${allLinked}` : 'Queue All';
    playFilteredButton.textContent = filteredLinked ? `Queue Filtered ${filteredLinked}` : 'Queue Filtered';
    playCheckedButton.textContent = checkedPlayable ? `Queue Checked ${checkedPlayable}` : 'Queue Checked';
  }

  function renderRequests() {
    const visible = filteredRequests();
    tbody.innerHTML = '';
    count.textContent = `${visible.length} shown · ${requests.length} total · use ↑ ↓ to set order`;
    updateStatus();

    if (!visible.length) {
      tableWrap.hidden = true;
      empty.hidden = false;
      empty.textContent = requests.length ? 'No songs match this category.' : 'No songs have been requested yet. Add the first one.';
      return;
    }

    empty.hidden = true;
    tableWrap.hidden = false;

    visible.forEach((request, index) => {
      const hasValidYouTube = Boolean(request.youtube_video_id);
      const previous = index > 0 ? visible[index - 1] : null;
      const next = index < visible.length - 1 ? visible[index + 1] : null;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="music-song-cell">
            <span class="music-song-main">
              <input class="music-select-checkbox" type="checkbox" aria-label="Select ${escapeHtml(request.song_name)}" data-id="${request.request_id}" ${checkedIds.has(Number(request.request_id)) ? 'checked' : ''}>
              <span class="music-song-text">
                <strong
                  class="${hasValidYouTube ? 'music-song-preview-trigger' : ''}"
                  data-id="${request.request_id}"
                  ${hasValidYouTube ? 'role="button" tabindex="0" title="Tap to preview"' : ''}
                >${escapeHtml(request.song_name)}</strong>
                <span class="music-category-tag">${escapeHtml(request.category_name || 'Uncategorized')}</span>
              </span>
            </span>
            <span class="music-order-actions">
              <button type="button" class="table-action move-music-request" aria-label="Move up" title="Move up" data-id="${request.request_id}" data-swap-id="${previous ? previous.request_id : ''}" ${previous ? '' : 'disabled'}>↑<span class="move-label"> Up</span></button>
              <button type="button" class="table-action move-music-request" aria-label="Move down" title="Move down" data-id="${request.request_id}" data-swap-id="${next ? next.request_id : ''}" ${next ? '' : 'disabled'}>↓<span class="move-label"> Down</span></button>
            </span>
            <details class="music-more-menu music-mobile-more-menu">
              <summary aria-label="More options" title="More options">⋮</summary>
              <div class="music-more-popover">
                <div class="music-mobile-menu-artist">${escapeHtml(request.artist_name || 'Not listed')}</div>
                <button type="button" class="preview-music-request" data-id="${request.request_id}" ${hasValidYouTube ? '' : 'disabled title="Missing YouTube link"'}>Preview</button>
                <button type="button" class="edit-music-request" data-id="${request.request_id}">Edit</button>
                <button type="button" class="delete-music-request danger" data-id="${request.request_id}">Delete</button>
              </div>
            </details>
          </div>
        </td>
        <td>
          <div class="music-artist-cell">
            <span class="music-artist-meta">
              <span>${escapeHtml(request.artist_name || '—')}</span>
              ${hasValidYouTube
                ? `<a class="music-youtube-link" href="${escapeHtml(request.youtube_url)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>`
                : '<span class="music-missing-link">Missing Link</span>'}
            </span>
            <span class="music-row-actions">
              <button type="button" class="table-action edit-music-request" data-id="${request.request_id}">Edit</button>
              <button type="button" class="table-action danger delete-music-request" data-id="${request.request_id}">Delete</button>
            </span>
            <details class="music-more-menu">
              <summary aria-label="More options" title="More options">⋮</summary>
              <div class="music-more-popover">
                <button type="button" class="preview-music-request" data-id="${request.request_id}" ${hasValidYouTube ? '' : 'disabled title="Missing YouTube link"'}>Preview</button>
                <button type="button" class="edit-music-request" data-id="${request.request_id}">Edit</button>
                <button type="button" class="delete-music-request danger" data-id="${request.request_id}">Delete</button>
              </div>
            </details>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadRequests() {
    loading.hidden = false;
    tableWrap.hidden = true;
    empty.hidden = true;
    try {
      const response = await fetch('/api/music-requests', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load music requests.');
      requests = data.requests || [];
      categories = data.categories || [];
      const validIds = new Set(requests.map(request => Number(request.request_id)));
      [...checkedIds].forEach(id => { if (!validIds.has(id)) checkedIds.delete(id); });
      fillCategoryLists();
      renderRequests();
    } catch (error) {
      empty.hidden = false;
      empty.textContent = error.message;
      count.textContent = '';
      linkCount.textContent = '';
      playAllButton.disabled = true;
      playFilteredButton.disabled = true;
      playCheckedButton.disabled = true;
    } finally {
      loading.hidden = true;
    }
  }

  function resetEditMode() {
    editingRequestId = null;
    form.reset();
    categoryInput.value = '';
    showSelectedYouTube(null);
    saveButton.textContent = 'Add Song';
    cancelButton.hidden = true;
    message.textContent = '';
  }

  function beginEdit(request) {
    editingRequestId = Number(request.request_id);
    songInput.value = request.song_name || '';
    artistInput.value = request.artist_name || '';
    categoryInput.value = request.category_id ? String(request.category_id) : '';
    youtubeInput.value = request.youtube_url || '';
    showSelectedYouTube(request.youtube_video_id || extractYouTubeVideoId(request.youtube_url));
    saveButton.textContent = 'Save Changes';
    cancelButton.hidden = false;
    message.textContent = `Editing: ${request.song_name}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    songInput.focus();
  }

  function ensureYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (youtubeApiPromise) return youtubeApiPromise;
    youtubeApiPromise = new Promise((resolve, reject) => {
      const priorReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { if (typeof priorReady === 'function') priorReady(); } finally { resolve(); }
      };
      let script = document.querySelector('script[data-vera-youtube-api]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.veraYoutubeApi = '1';
        script.onerror = () => reject(new Error('Unable to load the YouTube player.'));
        document.head.appendChild(script);
      }
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 12000) {
          window.clearInterval(timer);
          reject(new Error('The YouTube player took too long to load.'));
        }
      }, 150);
    });
    return youtubeApiPromise;
  }

  async function queueRequests(list, label) {
    const playable = linked(list);
    const ids = playable.map(request => request.youtube_video_id);
    if (!ids.length) return;

    const firstSong = playable[0];
    playerCard.hidden = false;
    playerMessage.textContent = 'Loading first song...';
    playerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await ensureYouTubeApi();

      // cuePlaylist deliberately does NOT start playback. It displays/cues the
      // first song and waits for a person to tap the native YouTube Play button.
      // Because the full list is cued as a playlist, YouTube advances through
      // the remaining songs after playback has been started by the user.
      if (youtubePlayer && typeof youtubePlayer.cuePlaylist === 'function') {
        youtubePlayer.cuePlaylist(ids, 0, 0);
      } else {
        youtubePlayer = new window.YT.Player('music-player', {
          width: '640',
          height: '360',
          playerVars: { playsinline: 1, rel: 0, autoplay: 0 },
          events: {
            onReady(event) { event.target.cuePlaylist(ids, 0, 0); },
            onError() { playerMessage.textContent = 'One YouTube video could not be played. Use Next in the player to continue.'; }
          }
        });
      }

      const firstLabel = firstSong.artist_name
        ? `${firstSong.song_name} — ${firstSong.artist_name}`
        : firstSong.song_name;
      playerMessage.textContent = `${ids.length} ${label} song${ids.length === 1 ? '' : 's'} queued. First: ${firstLabel}. Tap Play when ready; the remaining songs will continue in saved order.`;
    } catch (error) {
      playerMessage.textContent = error.message;
    }
  }

  cancelButton.addEventListener('click', () => { resetEditMode(); songInput.focus(); });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const songName = songInput.value.trim();
    const artistName = artistInput.value.trim();
    const categoryId = categoryInput.value ? Number(categoryInput.value) : null;
    const youtubeUrl = youtubeInput.value.trim();
    if (!songName) { message.textContent = 'Please enter a song name.'; songInput.focus(); return; }
    if (youtubeUrl && !extractYouTubeVideoId(youtubeUrl)) {
      message.textContent = 'Enter a valid YouTube video link or leave the YouTube field blank.';
      youtubeInput.focus(); return;
    }
    const isEditing = Number.isInteger(editingRequestId) && editingRequestId > 0;
    saveButton.disabled = true;
    saveButton.textContent = isEditing ? 'Saving...' : 'Adding...';
    try {
      const response = await fetch('/api/music-requests', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ request_id: isEditing ? editingRequestId : undefined, song_name: songName, artist_name: artistName || null, category_id: categoryId, youtube_url: youtubeUrl || null })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (isEditing ? 'Unable to save changes.' : 'Unable to add music request.'));
      const successText = isEditing ? 'Changes saved.' : 'Song added at the end of the list.';
      editingRequestId = null;
      form.reset(); categoryInput.value = ''; showSelectedYouTube(null); cancelButton.hidden = true; saveButton.textContent = 'Add Song'; message.textContent = successText;
      await loadRequests(); songInput.focus();
    } catch (error) { message.textContent = error.message; }
    finally { saveButton.disabled = false; saveButton.textContent = editingRequestId ? 'Save Changes' : 'Add Song'; }
  });

  filterSelect.addEventListener('change', renderRequests);

  tbody.addEventListener('change', event => {
    const checkbox = event.target.closest('.music-select-checkbox');
    if (!checkbox) return;
    const id = Number(checkbox.dataset.id);
    if (checkbox.checked) checkedIds.add(id); else checkedIds.delete(id);
    updateStatus();
  });

  tbody.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('music-more-menu')) return;

    if (!details.open) {
      details.classList.remove('open-up');
      return;
    }

    tbody.querySelectorAll('.music-more-menu[open]').forEach(other => {
      if (other !== details) other.removeAttribute('open');
    });

    requestAnimationFrame(() => {
      const popover = details.querySelector('.music-more-popover');
      if (!popover) return;
      const rect = popover.getBoundingClientRect();
      const needsUp = rect.bottom > window.innerHeight - 10;
      details.classList.toggle('open-up', needsUp);
    });
  }, true);


  tbody.addEventListener('keydown', event => {
    const songPreviewTrigger = event.target.closest('.music-song-preview-trigger');
    if (!songPreviewTrigger || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const request = requests.find(item => String(item.request_id) === songPreviewTrigger.dataset.id);
    if (request) openSongPreview(request);
  });

  tbody.addEventListener('click', async event => {
    const songPreviewTrigger = event.target.closest('.music-song-preview-trigger');
    if (songPreviewTrigger) {
      const request = requests.find(item => String(item.request_id) === songPreviewTrigger.dataset.id);
      if (request) openSongPreview(request);
      return;
    }

    const moveButton = event.target.closest('.move-music-request');
    if (moveButton) {
      const requestId = Number(moveButton.dataset.id);
      const swapId = Number(moveButton.dataset.swapId);
      if (!requestId || !swapId) return;

      const firstIndex = requests.findIndex(item => Number(item.request_id) === requestId);
      const secondIndex = requests.findIndex(item => Number(item.request_id) === swapId);
      if (firstIndex < 0 || secondIndex < 0) return;

      // Update only the list in place. No loading screen and no page-level refresh effect.
      [requests[firstIndex], requests[secondIndex]] = [requests[secondIndex], requests[firstIndex]];
      renderRequests();

      try {
        const response = await fetch('/api/music-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ request_id: requestId, swap_with_request_id: swapId })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to move song.');
      } catch (error) {
        // Put the two songs back if the database update fails.
        const currentFirst = requests.findIndex(item => Number(item.request_id) === requestId);
        const currentSecond = requests.findIndex(item => Number(item.request_id) === swapId);
        if (currentFirst >= 0 && currentSecond >= 0) {
          [requests[currentFirst], requests[currentSecond]] = [requests[currentSecond], requests[currentFirst]];
          renderRequests();
        }
        alert(error.message);
      }
      return;
    }

    const previewButton = event.target.closest('.preview-music-request');
    if (previewButton) {
      previewButton.closest('details')?.removeAttribute('open');
      const request = requests.find(item => String(item.request_id) === previewButton.dataset.id);
      if (request) openSongPreview(request);
      return;
    }

    const editButton = event.target.closest('.edit-music-request');
    if (editButton) {
      editButton.closest('details')?.removeAttribute('open');
      const request = requests.find(item => String(item.request_id) === editButton.dataset.id);
      if (request) beginEdit(request);
      return;
    }

    const deleteButton = event.target.closest('.delete-music-request');
    if (!deleteButton) return;
    deleteButton.closest('details')?.removeAttribute('open');
    const request = requests.find(item => String(item.request_id) === deleteButton.dataset.id);
    if (!request || !confirm(`Delete "${request.song_name}" from the music request list?`)) return;
    deleteButton.disabled = true;
    try {
      const response = await fetch('/api/music-requests', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ request_id: request.request_id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete music request.');
      checkedIds.delete(Number(request.request_id));
      if (editingRequestId === Number(request.request_id)) resetEditMode();
      await loadRequests();
    } catch (error) { alert(error.message); deleteButton.disabled = false; }
  });

  youtubeSearchButton.addEventListener('click', openYouTubeSearch);
  youtubeSearchSubmit.addEventListener('click', searchYouTube);
  youtubeSearchQuery.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchYouTube();
    }
  });
  youtubeInput.addEventListener('input', syncSelectedYouTubeFromInput);

  youtubeSearchModal.addEventListener('click', event => {
    if (event.target.closest('[data-youtube-close]')) {
      closeYouTubeSearch();
      return;
    }

    const previewButton = event.target.closest('.youtube-preview-result');
    if (previewButton) {
      previewYouTubeResult(previewButton.dataset.videoId, previewButton);
      return;
    }

    const useButton = event.target.closest('.youtube-use-result');
    if (useButton) {
      youtubeInput.value = useButton.dataset.youtubeUrl || '';
      showSelectedYouTube(useButton.dataset.videoId, useButton.dataset.title || 'YouTube video selected');
      closeYouTubeSearch();
      message.textContent = 'YouTube video selected. Choose a category if needed, then tap Add Song or Save Changes.';
      youtubeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !youtubeSearchModal.hidden) closeYouTubeSearch();
  });

  clearChecksButton.addEventListener('click', () => { checkedIds.clear(); renderRequests(); });
  playAllButton.addEventListener('click', () => {
    if (filterSelect.value !== 'all') {
      filterSelect.value = 'all';
      renderRequests();
    }
    queueRequests(requests, 'all');
  });
  playFilteredButton.addEventListener('click', () => queueRequests(filteredRequests(), 'filtered'));
  playCheckedButton.addEventListener('click', () => queueRequests(requests.filter(request => checkedIds.has(Number(request.request_id))), 'checked'));
  hidePlayerButton.addEventListener('click', () => {
    playerCard.hidden = true;
    if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
  });
  window.addEventListener('scroll', () => {
    tbody.querySelectorAll('.music-more-menu[open]').forEach(details => details.removeAttribute('open'));
  }, { passive: true });

  document.getElementById('music-refresh-button').addEventListener('click', loadRequests);
  document.querySelectorAll('[data-song-preview-close]').forEach(element => {
    element.addEventListener('click', closeSongPreview);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && songPreviewModal && !songPreviewModal.hidden) {
      closeSongPreview();
    }
  });

  loadRequests();
});
