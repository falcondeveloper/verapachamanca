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

  let requests = [];
  let editingRequestId = null;

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function renderRequests() {
    tbody.innerHTML = '';
    count.textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;

    if (!requests.length) {
      tableWrap.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    tableWrap.hidden = false;

    for (const request of requests) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(request.song_name)}</strong></td>
        <td>
          <div class="music-artist-cell">
            <span>
              ${escapeHtml(request.artist_name || '—')}
              ${request.youtube_url ? `<br><a class="music-youtube-link" href="${escapeHtml(request.youtube_url)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>` : ''}
            </span>
            <span class="music-row-actions">
              <button type="button" class="table-action edit-music-request" data-id="${request.request_id}">Edit</button>
              <button type="button" class="table-action danger delete-music-request" data-id="${request.request_id}">Delete</button>
            </span>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
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

      const successText = isEditing ? 'Changes saved.' : 'Song added.';
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
    const editButton = event.target.closest('.edit-music-request');
    if (editButton) {
      const request = requests.find(item => String(item.request_id) === editButton.dataset.id);
      if (request) beginEdit(request);
      return;
    }

    const deleteButton = event.target.closest('.delete-music-request');
    if (!deleteButton) return;

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


  document.getElementById('music-refresh-button').addEventListener('click', loadRequests);
  loadRequests();
});
