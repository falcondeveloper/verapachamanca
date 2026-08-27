(() => {
  const currentYear = new Date().getFullYear();
  const selectedFiles = [];
  const MAX_VIDEO_SECONDS = 120;
  const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
  const CHUNK_BYTES = 2 * 1024 * 1024;

  function yearOptions(selected = String(currentYear)) {
    const items = ['<option value="before-1980">Before 1980</option>'];
    for (let year = currentYear; year >= 1980; year -= 1) {
      items.push(`<option value="${year}"${String(year) === String(selected) ? ' selected' : ''}>${year}</option>`);
    }
    return items.join('');
  }

  function fileExtension(file) {
    return (file.name.split('.').pop() || '').toLowerCase();
  }

  function isVideoFile(file) {
    return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
  }

  function isPhotoFile(file) {
    return /^(image\/jpeg|image\/png|image\/webp)$/i.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
  }

  function updateReadyText() {
    const count = selectedFiles.length;
    const target = document.querySelector('.upload-actions p');
    if (target) {
      target.innerHTML = `<strong>${count} item${count === 1 ? '' : 's'} ready.</strong> Photos upload as selected. Videos must be 60 seconds or shorter.`;
    }
  }


  function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error('The video length could not be read. Please choose another video.'));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This video format could not be opened by the browser. MP4 is recommended.'));
      };
      video.src = url;
    });
  }

  async function postUpload(body) {
    const response = await fetch('/api/upload-photo', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Upload failed.');
    return data;
  }


  async function postBinaryChunk(mediaType, filename, offset, chunk) {
    const params = new URLSearchParams({
      action: `${mediaType}-chunk`,
      mediaType,
      filename,
      offset: String(offset)
    });

    let response;
    try {
      response = await fetch(`/api/upload-photo?${params.toString()}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk
      });
    } catch (error) {
      throw new Error('Upload connection failed. Please retry this item.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Upload chunk failed.');
    return data;
  }

  async function uploadChunked(entry, meta, status) {
    const file = entry.file;
    const isVideo = entry.mediaType === 'video';
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;

    if (file.size > maxBytes) {
      throw new Error(isVideo
        ? 'This video file is too large. Please choose a video under 150 MB.'
        : 'This photo file is too large. Please choose a photo under 30 MB.');
    }

    if (isVideo && entry.durationSeconds > MAX_VIDEO_SECONDS) {
      throw new Error(`Videos are limited to ${MAX_VIDEO_SECONDS} seconds.`);
    }

    status.textContent = isVideo ? 'Preparing video upload...' : 'Preparing photo upload...';
    const start = await postUpload({
      action: `${entry.mediaType}-start`,
      mediaType: entry.mediaType,
      originalName: file.name,
      mimeType: file.type,
      durationSeconds: isVideo ? entry.durationSeconds : null,
      totalBytes: file.size
    });
    const filename = start.filename;

    try {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const end = Math.min(file.size, offset + CHUNK_BYTES);
        const chunk = file.slice(offset, end);
        const percent = Math.round((end / file.size) * 100);
        status.textContent = `Uploading ${entry.mediaType}... ${percent}%`;
        await postBinaryChunk(entry.mediaType, filename, offset, chunk);
      }

      status.textContent = `Finishing ${entry.mediaType} upload...`;
      return await postUpload({
        action: `${entry.mediaType}-finish`,
        mediaType: entry.mediaType,
        filename,
        photoYear: meta.year,
        caption: meta.caption,
        familyMemberName: meta.familyMemberName,
        durationSeconds: isVideo ? Math.ceil(entry.durationSeconds) : null,
        totalBytes: file.size
      });
    } catch (error) {
      await postUpload({
        action: `${entry.mediaType}-abort`,
        mediaType: entry.mediaType,
        filename
      }).catch(() => {});
      throw error;
    }
  }

  async function addFile(file) {
    const mediaType = isVideoFile(file) ? 'video' : (isPhotoFile(file) ? 'photo' : null);
    if (!mediaType) {
      alert(`${file.name}: Please use JPEG, PNG, WebP, MP4, MOV, WebM, or M4V.`);
      return;
    }

    if (mediaType === 'photo' && file.size > MAX_PHOTO_BYTES) {
      alert(`${file.name}: photo files must be under 30 MB.`);
      return;
    }

    let durationSeconds = null;
    if (mediaType === 'video') {
      if (file.size > MAX_VIDEO_BYTES) {
        alert(`${file.name}: video files must be under 150 MB.`);
        return;
      }
      try {
        durationSeconds = await getVideoDuration(file);
      } catch (error) {
        alert(`${file.name}: ${error.message}`);
        return;
      }
      if (durationSeconds > MAX_VIDEO_SECONDS) {
        alert(`${file.name}: Videos are limited to ${MAX_VIDEO_SECONDS} seconds.`);
        return;
      }
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const entry = { id, file, mediaType, durationSeconds };
    selectedFiles.push(entry);

    const card = document.createElement('article');
    card.className = 'upload-preview-card';
    card.dataset.uploadId = id;
    const objectUrl = URL.createObjectURL(file);
    card.dataset.objectUrl = objectUrl;
    const preview = mediaType === 'video'
      ? `<video src="${objectUrl}" controls muted playsinline preload="metadata"></video>`
      : `<img src="${objectUrl}" alt="Preview of selected photo" onerror="this.style.display='none'; this.parentElement.classList.add('preview-unavailable');">`;
    const mediaLabel = mediaType === 'video'
      ? `Video · ${Math.ceil(durationSeconds)} sec`
      : `Photo · ${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`;

    card.innerHTML = `
      <div class="upload-preview-image">${preview}</div>
      <div class="upload-preview-fields">
        <div class="upload-file-heading"><strong></strong><button type="button" class="upload-remove">Remove</button></div>
        <p class="upload-media-type">${mediaLabel}</p>
        <label>Year<select class="photo-year-select">${yearOptions()}</select></label>
        <label>Person / family name <input class="photo-family-name" type="text" maxlength="150" placeholder="Optional"></label>
        <label class="upload-note-label">Optional note<textarea rows="3" placeholder="Add a short note about this ${mediaType}"></textarea></label>
        <div class="upload-item-status" aria-live="polite"></div>
      </div>`;

    card.querySelector('.upload-file-heading strong').textContent = file.name;
    card.querySelector('.upload-remove').addEventListener('click', () => {
      const index = selectedFiles.findIndex(item => item.id === id);
      if (index >= 0) selectedFiles.splice(index, 1);
      URL.revokeObjectURL(objectUrl);
      card.remove();
      updateReadyText();
    });
    document.getElementById('upload-preview-list').appendChild(card);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('photo-files');
    const list = document.getElementById('upload-preview-list');
    const button = document.getElementById('preview-upload-button');
    if (!input || !list || !button) return;

    list.innerHTML = '';
    updateReadyText();

    input.addEventListener('change', async () => {
      for (const file of Array.from(input.files || [])) {
        await addFile(file);
      }
      input.value = '';
      updateReadyText();
    });

    button.addEventListener('click', async () => {
      if (!selectedFiles.length) {
        alert('Select at least one photo or video first.');
        return;
      }

      button.disabled = true;

      const totalPhotos = selectedFiles.filter(item => item.mediaType === 'photo').length;
      const totalVideos = selectedFiles.filter(item => item.mediaType === 'video').length;
      let uploadedPhotos = selectedFiles.filter(item => {
        const card = list.querySelector(`[data-upload-id="${item.id}"]`);
        return item.mediaType === 'photo' && card && card.classList.contains('upload-complete');
      }).length;
      let uploadedVideos = selectedFiles.filter(item => {
        const card = list.querySelector(`[data-upload-id="${item.id}"]`);
        return item.mediaType === 'video' && card && card.classList.contains('upload-complete');
      }).length;

      function updateBatchProgress() {
        const parts = [];
        if (totalPhotos) parts.push(`Images: ${uploadedPhotos} of ${totalPhotos} uploaded`);
        if (totalVideos) parts.push(`Videos: ${uploadedVideos} of ${totalVideos} uploaded`);

        const progressText = parts.join(' · ');
        button.textContent = progressText ? `Uploading... ${progressText}` : 'Uploading...';

        const target = document.querySelector('.upload-actions p');
        if (target) {
          target.innerHTML = `<strong>${progressText}</strong><br>Current file progress is shown above.`;
        }
      }

      updateBatchProgress();

      let uploaded = 0;
      let failed = 0;

      for (const entry of [...selectedFiles]) {
        const card = list.querySelector(`[data-upload-id="${entry.id}"]`);
        if (!card || card.classList.contains('upload-complete')) continue;
        const status = card.querySelector('.upload-item-status');
        const year = card.querySelector('.photo-year-select').value;
        const caption = card.querySelector('textarea').value.trim();
        const familyMemberName = card.querySelector('.photo-family-name').value.trim();
        const meta = { year, caption, familyMemberName };

        try {
          status.className = 'upload-item-status working';
          await uploadChunked(entry, meta, status);
          uploaded += 1;
          if (entry.mediaType === 'photo') uploadedPhotos += 1;
          if (entry.mediaType === 'video') uploadedVideos += 1;
          status.textContent = 'Uploaded successfully.';
          status.className = 'upload-item-status success';
          card.classList.add('upload-complete');
          updateBatchProgress();
          if (card.dataset.objectUrl) {
            URL.revokeObjectURL(card.dataset.objectUrl);
            delete card.dataset.objectUrl;
          }
        } catch (error) {
          failed += 1;
          status.textContent = error.message || 'Upload failed.';
          status.className = 'upload-item-status error';
        }
      }

      button.disabled = false;
      button.textContent = failed ? 'Retry Failed Items' : 'Upload Photos & Videos';
      const target = document.querySelector('.upload-actions p');
      if (target) {
        target.innerHTML = failed
          ? `<strong>${uploaded} uploaded, ${failed} failed.</strong> You can retry the failed items.`
          : `<strong>${uploaded} item${uploaded === 1 ? '' : 's'} uploaded.</strong> They are now in the family archive.`;
      }
      if (uploaded && !failed) {
        setTimeout(() => { window.location.href = 'photos.html'; }, 1200);
      }
    });
  });
})();
