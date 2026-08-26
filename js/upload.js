(() => {
  const currentYear = new Date().getFullYear();
  const selectedFiles = [];
  const MAX_VIDEO_SECONDS = 60;
  const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
  const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;

  function yearOptions(selected = String(currentYear)) {
    const items = ['<option value="before-1980">Before 1980</option>'];
    for (let year = currentYear; year >= 1980; year -= 1) {
      items.push(`<option value="${year}"${String(year) === String(selected) ? ' selected' : ''}>${year}</option>`);
    }
    return items.join('');
  }

  function isVideoFile(file) {
    return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
  }

  function isPhotoFile(file) {
    return file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name);
  }

  function updateReadyText() {
    const count = selectedFiles.length;
    const target = document.querySelector('.upload-actions p');
    if (target) {
      target.innerHTML = `<strong>${count} item${count === 1 ? '' : 's'} ready.</strong> Photos are resized automatically. Videos must be 60 seconds or shorter.`;
    }
  }

  function loadWithImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ source: image, objectUrl: url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image-element-failed'));
      };
      image.src = url;
    });
  }

  async function loadImageSource(file) {
    try {
      return await loadWithImageElement(file);
    } catch (_) {
      // Android Chrome sometimes prefers createImageBitmap for certain files.
    }

    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { source: bitmap, objectUrl: null };
      } catch (_) {
        try {
          const bitmap = await createImageBitmap(file);
          return { source: bitmap, objectUrl: null };
        } catch (_) {
          // Continue to friendly error below.
        }
      }
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
      throw new Error('This HEIC/HEIF photo cannot be opened by this browser. Please choose a JPEG, PNG, or WebP photo.');
    }
    throw new Error('This photo could not be opened by the browser. Please try another copy of the photo.');
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to resize image.')), 'image/jpeg', quality);
    });
  }

  async function resizePhoto(file) {
    const loaded = await loadImageSource(file);
    const source = loaded.source;
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if (source.close) source.close();
    if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > 1400000 && quality > 0.52) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > 1900000) throw new Error('This photo is still too large after resizing. Try a smaller image.');
    return blob;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Unable to read the selected file.'));
      reader.readAsDataURL(blob);
    });
  }

  function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        URL.revokeObjectURL(url);
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

  async function uploadPhoto(entry, meta, status) {
    status.textContent = 'Resizing photo...';
    const resized = await resizePhoto(entry.file);
    const imageBase64 = await blobToBase64(resized);
    status.textContent = 'Uploading photo...';
    return postUpload({
      mediaType: 'photo',
      imageBase64,
      mimeType: 'image/jpeg',
      photoYear: meta.year,
      caption: meta.caption,
      familyMemberName: meta.familyMemberName
    });
  }

  async function uploadVideo(entry, meta, status) {
    const file = entry.file;
    const duration = entry.durationSeconds || await getVideoDuration(file);
    if (duration > MAX_VIDEO_SECONDS) {
      throw new Error(`Videos are limited to ${MAX_VIDEO_SECONDS} seconds.`);
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('This video file is too large. Please choose a video under 150 MB.');
    }

    status.textContent = 'Preparing video upload...';
    const start = await postUpload({
      action: 'video-start',
      mediaType: 'video',
      originalName: file.name,
      mimeType: file.type,
      durationSeconds: duration,
      totalBytes: file.size
    });
    const filename = start.filename;

    try {
      for (let offset = 0; offset < file.size; offset += VIDEO_CHUNK_BYTES) {
        const end = Math.min(file.size, offset + VIDEO_CHUNK_BYTES);
        const chunk = file.slice(offset, end);
        const chunkBase64 = await blobToBase64(chunk);
        const percent = Math.round((end / file.size) * 100);
        status.textContent = `Uploading video... ${percent}%`;
        await postUpload({
          action: 'video-chunk',
          mediaType: 'video',
          filename,
          offset,
          chunkBase64
        });
      }

      status.textContent = 'Finishing video upload...';
      return await postUpload({
        action: 'video-finish',
        mediaType: 'video',
        filename,
        photoYear: meta.year,
        caption: meta.caption,
        familyMemberName: meta.familyMemberName,
        durationSeconds: Math.ceil(duration),
        totalBytes: file.size
      });
    } catch (error) {
      await postUpload({ action: 'video-abort', mediaType: 'video', filename }).catch(() => {});
      throw error;
    }
  }

  async function addFile(file) {
    const mediaType = isVideoFile(file) ? 'video' : (isPhotoFile(file) ? 'photo' : null);
    if (!mediaType) return;

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
      : `<img src="${objectUrl}" alt="Preview of selected photo">`;
    const mediaLabel = mediaType === 'video'
      ? `Video · ${Math.ceil(durationSeconds)} sec`
      : 'Photo';

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
      button.textContent = 'Uploading...';
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
          if (entry.mediaType === 'video') {
            await uploadVideo(entry, meta, status);
          } else {
            await uploadPhoto(entry, meta, status);
          }
          uploaded += 1;
          status.textContent = 'Uploaded successfully.';
          status.className = 'upload-item-status success';
          card.classList.add('upload-complete');
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
