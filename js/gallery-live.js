(() => {
  const currentYear = new Date().getFullYear();

  function yearOptions(selected) {
    const selectedValue = Number(selected) === 0 ? 'before-1980' : String(selected || currentYear);
    const items = [`<option value="before-1980"${selectedValue === 'before-1980' ? ' selected' : ''}>Before 1980</option>`];
    for (let year = currentYear; year >= 1980; year -= 1) {
      items.push(`<option value="${year}"${String(year) === selectedValue ? ' selected' : ''}>${year}</option>`);
    }
    return items.join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function mediaCard(photo) {
    const isVideo = String(photo.media_type || 'photo').toLowerCase() === 'video';
    const note = photo.caption || photo.family_member_name || (isVideo ? 'Family video' : 'Family photo');
    const actions = photo.can_edit ? `
      <div class="photo-owner-actions">
        <button class="photo-edit-button live-photo-edit" type="button">Edit year or note</button>
        <button class="photo-delete-button live-photo-delete" type="button">Delete</button>
      </div>
      <form class="photo-edit-form live-photo-form" hidden>
        <label>Year<select class="live-photo-year">${yearOptions(photo.photo_year)}</select></label>
        <label>Note<textarea rows="3">${escapeHtml(photo.caption || '')}</textarea></label>
        <div class="photo-edit-form-actions"><button class="photo-save-button live-photo-save" type="button">Save changes</button><button class="photo-cancel-button live-photo-cancel" type="button">Cancel</button></div>
      </form>` : '';

    const media = isVideo
      ? `<div class="photo-record-image photo-record-video"><video src="${escapeHtml(photo.image_url)}" controls playsinline preload="metadata"></video></div>`
      : `<button class="photo-record-image live-lightbox-image" data-image="${escapeHtml(photo.image_url)}" data-caption="${escapeHtml(note)}"><img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(note)}" loading="lazy"></button>`;

    const duration = isVideo && photo.duration_seconds
      ? `<p class="photo-media-info">Video · ${Number(photo.duration_seconds)} sec</p>`
      : '';

    return `<article class="photo-record-card live-photo-card" data-photo-id="${photo.photo_id}">
      <button class="photo-sort-handle" type="button" aria-label="Move this photo or video">☰ Move</button>
      ${media}
      <div class="photo-record-body">
        ${duration}
        <p class="photo-note">${escapeHtml(note)}</p>
        ${photo.family_member_name ? `<p class="photo-family-member">${escapeHtml(photo.family_member_name)}</p>` : ''}
        <p class="photo-uploader">Uploaded by <strong>${escapeHtml(photo.uploaded_by)}</strong></p>
        ${actions}
      </div>
    </article>`;
  }

  async function api(method, body) {
    const response = await fetch('/api/photos', {
      method,
      credentials: 'same-origin',
      headers: body ? {'Content-Type':'application/json'} : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Media request failed.');
    return data;
  }

  function wireLightbox(container) {
    const lightbox = document.querySelector('.lightbox');
    const imageTarget = document.querySelector('.lightbox-image');
    const captionTarget = document.querySelector('.lightbox-caption');
    container.querySelectorAll('.live-lightbox-image').forEach(button => {
      button.addEventListener('click', () => {
        if (!lightbox || !imageTarget || !captionTarget) return;
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden','false');
        imageTarget.style.background = '#111';
        imageTarget.innerHTML = `<img src="${button.dataset.image}" alt="Expanded family photo">`;
        captionTarget.textContent = button.dataset.caption || 'Family photo';
      });
    });
  }

  function wireActions(container) {
    container.querySelectorAll('.live-photo-card').forEach(card => {
      const edit = card.querySelector('.live-photo-edit');
      const del = card.querySelector('.live-photo-delete');
      const form = card.querySelector('.live-photo-form');
      edit?.addEventListener('click', () => { if (form) form.hidden = false; });
      card.querySelector('.live-photo-cancel')?.addEventListener('click', () => { if (form) form.hidden = true; });
      card.querySelector('.live-photo-save')?.addEventListener('click', async () => {
        try {
          await api('PATCH', {
            photo_id: Number(card.dataset.photoId),
            photoYear: card.querySelector('.live-photo-year').value,
            caption: form.querySelector('textarea').value.trim()
          });
          window.location.reload();
        } catch (error) { alert(error.message); }
      });
      del?.addEventListener('click', async () => {
        if (!confirm('Delete this photo or video?')) return;
        try {
          await api('DELETE', { photo_id: Number(card.dataset.photoId) });
          card.remove();
        } catch (error) { alert(error.message); }
      });
    });
  }

  function wireSorting(container, apiYear, status) {
    let draggedCard = null;
    let activeHandle = null;
    let changed = false;

    async function saveOrder() {
      if (!changed) return;
      const photoIds = Array.from(container.querySelectorAll('.live-photo-card'))
        .map(card => Number(card.dataset.photoId));
      status.textContent = 'Saving order...';
      try {
        await api('PUT', { photoYear: apiYear, photo_ids: photoIds });
        status.textContent = 'Order saved.';
        setTimeout(() => { status.textContent = 'Drag the Move handle to rearrange photos and videos. Changes save automatically.'; }, 1600);
      } catch (error) {
        alert(error.message);
        window.location.reload();
      }
    }

    function findTargetCard(x, y) {
      const cards = Array.from(container.querySelectorAll('.live-photo-card'));
      return cards.find(card => {
        if (card === draggedCard) return false;
        const rect = card.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }) || null;
    }

    container.querySelectorAll('.photo-sort-handle').forEach(handle => {
      handle.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        draggedCard = handle.closest('.live-photo-card');
        activeHandle = handle;
        changed = false;
        draggedCard.classList.add('is-being-sorted');
        document.body.classList.add('media-sort-active');
        handle.setPointerCapture?.(event.pointerId);
      });

      handle.addEventListener('pointermove', event => {
        if (!draggedCard || activeHandle !== handle) return;
        event.preventDefault();
        const target = findTargetCard(event.clientX, event.clientY);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2 ||
          (Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.22 &&
           event.clientX < rect.left + rect.width / 2);
        const reference = before ? target : target.nextElementSibling;
        if (reference !== draggedCard) {
          container.insertBefore(draggedCard, reference);
          changed = true;
        }
      });

      const finish = async event => {
        if (!draggedCard || activeHandle !== handle) return;
        event.preventDefault();
        try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        draggedCard.classList.remove('is-being-sorted');
        document.body.classList.remove('media-sort-active');
        draggedCard = null;
        activeHandle = null;
        await saveOrder();
      };

      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const yearLabel = document.getElementById('gallery-year');
    if (!yearLabel) return;
    const rawYear = new URLSearchParams(window.location.search).get('year') || String(currentYear);
    const normalized = rawYear.toLowerCase().replace(/[_\s]+/g, '-');
    const isBefore = ['before-1980','pre-1980','before1980','pre1980'].includes(normalized);
    const apiYear = isBefore ? 'before-1980' : rawYear;
    const target = isBefore ? document.getElementById('gallery-before-1980') : document.getElementById('gallery-default');
    if (!target) return;

    const sortStatus = document.createElement('p');
    sortStatus.className = 'photo-sort-status';
    sortStatus.textContent = 'Drag the Move handle to rearrange photos and videos. Changes save automatically.';
    target.insertAdjacentElement('afterend', sortStatus);

    const liveSection = document.createElement('div');
    liveSection.className = 'photo-card-grid live-photo-grid';
    sortStatus.insertAdjacentElement('afterend', liveSection);

    try {
      const response = await fetch(`/api/photos?year=${encodeURIComponent(apiYear)}`, { credentials:'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load photos and videos.');
      const is2026 = String(rawYear) === '2026';
      if (!isBefore && !is2026) target.hidden = true;
      if (!data.photos.length) {
        if (isBefore || is2026) {
          liveSection.remove();
          sortStatus.remove();
        } else {
          liveSection.innerHTML = '<p class="archive-note">No uploaded photos or videos for this year yet.</p>';
        }
        return;
      }

      liveSection.innerHTML = data.photos.map(mediaCard).join('');
      wireLightbox(liveSection);
      wireActions(liveSection);
      wireSorting(liveSection, apiYear, sortStatus);
    } catch (error) {
      liveSection.innerHTML = `<p class="archive-note">${escapeHtml(error.message)}</p>`;
    }
  });
})();
