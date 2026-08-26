(() => {
  const currentYear = new Date().getFullYear();
  const selectedFiles = [];

  function yearOptions(selected = String(currentYear)) {
    const items = ['<option value="before-1980">Before 1980</option>'];
    for (let year = currentYear; year >= 1980; year -= 1) {
      items.push(`<option value="${year}"${String(year) === String(selected) ? ' selected' : ''}>${year}</option>`);
    }
    return items.join('');
  }

  function updateReadyText() {
    const count = selectedFiles.length;
    const target = document.querySelector('.upload-actions p');
    if (target) target.innerHTML = `<strong>${count} photo${count === 1 ? '' : 's'} ready.</strong> Images will be resized before upload.`;
  }

  function loadBitmap(file) {
    if ('createImageBitmap' in window) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This image format could not be opened by your browser.'));
      };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to resize image.')), 'image/jpeg', quality);
    });
  }

  async function resizePhoto(file) {
    const source = await loadBitmap(file);
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
      reader.onerror = () => reject(new Error('Unable to read resized image.'));
      reader.readAsDataURL(blob);
    });
  }

  function addFile(file) {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const entry = { id, file };
    selectedFiles.push(entry);

    const card = document.createElement('article');
    card.className = 'upload-preview-card';
    card.dataset.uploadId = id;
    const objectUrl = URL.createObjectURL(file);
    card.dataset.objectUrl = objectUrl;
    card.innerHTML = `
      <div class="upload-preview-image"><img src="${objectUrl}" alt="Preview of selected photo"></div>
      <div class="upload-preview-fields">
        <div class="upload-file-heading"><strong></strong><button type="button" class="upload-remove">Remove</button></div>
        <label>Year<select class="photo-year-select">${yearOptions()}</select></label>
        <label>Person / family name <input class="photo-family-name" type="text" maxlength="150" placeholder="Optional"></label>
        <label class="upload-note-label">Optional note<textarea rows="3" placeholder="Add a short note about this photo"></textarea></label>
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

    input.addEventListener('change', () => {
      for (const file of Array.from(input.files || [])) {
        if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) continue;
        addFile(file);
      }
      input.value = '';
      updateReadyText();
    });

    button.addEventListener('click', async () => {
      if (!selectedFiles.length) {
        alert('Select at least one photo first.');
        return;
      }

      button.disabled = true;
      button.textContent = 'Uploading...';
      let uploaded = 0;
      let failed = 0;

      for (const entry of [...selectedFiles]) {
        const card = list.querySelector(`[data-upload-id="${entry.id}"]`);
        if (!card) continue;
        const status = card.querySelector('.upload-item-status');
        const year = card.querySelector('.photo-year-select').value;
        const caption = card.querySelector('textarea').value.trim();
        const familyMemberName = card.querySelector('.photo-family-name').value.trim();

        try {
          status.textContent = 'Resizing...';
          status.className = 'upload-item-status working';
          const resized = await resizePhoto(entry.file);
          const imageBase64 = await blobToBase64(resized);

          status.textContent = 'Uploading to family photo storage...';
          const response = await fetch('/api/upload-photo', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64,
              mimeType: 'image/jpeg',
              photoYear: year,
              caption,
              familyMemberName
            })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Upload failed.');

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
      button.textContent = failed ? 'Retry Failed Photos' : 'Upload Photos';
      const target = document.querySelector('.upload-actions p');
      if (target) {
        target.innerHTML = failed
          ? `<strong>${uploaded} uploaded, ${failed} failed.</strong> You can retry the failed photos.`
          : `<strong>${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded.</strong> They are now in the family gallery.`;
      }
      if (uploaded && !failed) {
        setTimeout(() => { window.location.href = 'photos.html'; }, 1200);
      }
    });
  });
})();
