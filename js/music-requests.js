document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('music-request-form');
  const songInput = document.getElementById('song-name');
  const artistInput = document.getElementById('artist-name');
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
  const playAllButton = document.getElementById('music-play-all-button');
  const playerCard = document.getElementById('music-player-card');
  const playerMessage = document.getElementById('music-player-message');
  const hidePlayerButton = document.getElementById('music-hide-player');

  let requests = [];
  let editingRequestId = null;
  let youtubePlayer = null;
  let youtubeApiPromise = null;

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
    try {
      parsed = new URL(text);
    } catch (_) {
      return null;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let id = null;

    if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] || null;
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parsed.pathname === '/watch') {
        id = parsed.searchParams.get('v');
      } else if (['shorts', 'embed', 'live'].includes(parts[0])) {
        id = parts[1] || null;
      }
    }

    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  function linkedRequests() {
    return requests.filter(request => request.youtube_video_id);
  }

  function updatePlaySummary() {
    const linked = linkedRequests().length;
    const total = requests.length;
    linkCount.textContent = `${linked} of ${total} request${total === 1 ? '' : 's'} ${linked === 1 ? 'has' : 'have'} a YouTube link`;
    playAllButton.disabled = linked === 0;
    playAllButton.textContent = linked ? `▶ Play All ${linked}` : '▶ Play All';
  }

  function renderRequests() {
    tbody.innerHTML = '';
    count.textContent = `${requests.length} request${requests.length === 1 ? '' : 's'} · use Up / Down to set the order`;
    updatePlaySummary();

    if (!requests.length) {
      tableWrap.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    tableWrap.hidden = false;

    requests.forEach((request, index) => {
      const hasValidYouTube = Boolean(request.youtube_video_id);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="music-song-cell">
            <strong>${escapeHtml(request.song_name)}</strong>
            <span class="music-order-actions">
              <button type="button" class="table-action move-music-request" aria-label="Move up" title="Move up" data-id="${request.request_id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑<span class="move-label"> Up</span></button>
              <button type="button" class="table-action move-music-request" aria-label="Move down" title="Move down" data-id="${request.request_id}" data-direction="down" ${index === requests.length - 1 ? 'disabled' : ''}>↓<span class="move-label"> Down</span></button>
            </span>
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
      renderRequests();
    } catch (error) {
      empty.hidden = false;
      empty.textContent = error.message;
      count.textContent = '';
      linkCount.textContent = '';
      playAllButton.disabled = true;
    } finally {
      loading.hidden = true;
    }
  }

  function resetEditMode() {
    editingRequestId = null;
    form.reset();
    saveButton.textContent = 'Add Song';
    cancelButton.hidden = true;
    message.textContent = '';
  }

  function beginEdit(request) {
    editingRequestId = Number(request.request_id);
    songInput.value = request.song_name || '';
    artistInput.value = request.artist_name || '';
    youtubeInput.value = request.youtube_url || '';
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
        try {
          if (typeof priorReady === 'function') priorReady();
        } finally {
          resolve();
        }
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

  async function playAllLinkedSongs() {
    const ids = linkedRequests().map(request => request.youtube_video_id);
    if (!ids.length) return;

    playAllButton.disabled = true;
    playAllButton.textContent = 'Loading YouTube...';
    playerMessage.textContent = '';
    playerCard.hidden = false;
    playerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await ensureYouTubeApi();

      if (youtubePlayer && typeof youtubePlayer.loadPlaylist === 'function') {
        youtubePlayer.loadPlaylist({ playlist: ids, index: 0, startSeconds: 0 });
      } else {
        youtubePlayer = new window.YT.Player('music-player', {
          width: '640',
          height: '360',
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady(event) {
              event.target.loadPlaylist({ playlist: ids, index: 0, startSeconds: 0 });
            },
            onError() {
              playerMessage.textContent = 'One YouTube video could not be played. Use Next in the player to continue.';
            }
          }
        });
      }

      playerMessage.textContent = `${ids.length} linked song${ids.length === 1 ? '' : 's'} loaded in the saved order.`;
    } catch (error) {
      playerMessage.textContent = error.message;
    } finally {
      updatePlaySummary();
    }
  }

  cancelButton.addEventListener('click', () => {
    resetEditMode();
    songInput.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';

    const songName = songInput.value.trim();
    const artistName = artistInput.value.trim();
    const youtubeUrl = youtubeInput.value.trim();

    if (!songName) {
      message.textContent = 'Please enter a song name.';
      songInput.focus();
      return;
    }

    if (youtubeUrl && !extractYouTubeVideoId(youtubeUrl)) {
      message.textContent = 'Enter a valid YouTube video link or leave the YouTube field blank.';
      youtubeInput.focus();
      return;
    }

    const isEditing = Number.isInteger(editingRequestId) && editingRequestId > 0;
    saveButton.disabled = true;
    saveButton.textContent = isEditing ? 'Saving...' : 'Adding...';

    try {
      const response = await fetch('/api/music-requests', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          request_id: isEditing ? editingRequestId : undefined,
          song_name: songName,
          artist_name: artistName || null,
          youtube_url: youtubeUrl || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (isEditing ? 'Unable to save changes.' : 'Unable to add music request.'));

      const successText = isEditing ? 'Changes saved.' : 'Song added at the end of the list.';
      editingRequestId = null;
      form.reset();
      cancelButton.hidden = true;
      saveButton.textContent = 'Add Song';
      message.textContent = successText;
      await loadRequests();
      songInput.focus();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = editingRequestId ? 'Save Changes' : 'Add Song';
    }
  });

  tbody.addEventListener('click', async event => {
    const moveButton = event.target.closest('.move-music-request');
    if (moveButton) {
      moveButton.disabled = true;
      try {
        const response = await fetch('/api/music-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            request_id: Number(moveButton.dataset.id),
            direction: moveButton.dataset.direction
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to move song.');
        await loadRequests();
      } catch (error) {
        alert(error.message);
        moveButton.disabled = false;
      }
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
    if (!request) return;
    if (!confirm(`Delete "${request.song_name}" from the music request list?`)) return;

    deleteButton.disabled = true;
    try {
      const response = await fetch('/api/music-requests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ request_id: request.request_id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete music request.');
      if (editingRequestId === Number(request.request_id)) resetEditMode();
      await loadRequests();
    } catch (error) {
      alert(error.message);
      deleteButton.disabled = false;
    }
  });

  playAllButton.addEventListener('click', playAllLinkedSongs);
  hidePlayerButton.addEventListener('click', () => {
    playerCard.hidden = true;
    if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
  });
  document.getElementById('music-refresh-button').addEventListener('click', loadRequests);
  loadRequests();
});
