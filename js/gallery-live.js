(() => {
  const currentYear = new Date().getFullYear();
  const videoPoster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23232323'/%3E%3Ccircle cx='320' cy='164' r='54' fill='%23ffffff' fill-opacity='.16'/%3E%3Cpath d='M304 132 L354 164 L304 196 Z' fill='%23ffffff'/%3E%3Ctext x='320' y='258' text-anchor='middle' font-family='Arial,sans-serif' font-size='28' font-weight='700' fill='%23ffffff'%3EFAMILY VIDEO%3C/text%3E%3C/svg%3E";

  function desktopSortingEnabled() {
    return window.matchMedia('(min-width: 901px)').matches;
  }

  function yearOptions(selected) {
    const selectedValue = Number(selected) === 0 ? 'before-1980' : String(selected || currentYear);
    const items = [];

    // Keep the legacy bucket visible only while editing an existing legacy item,
    // so it can be reassigned to a decade without offering it for new uploads.
    if (selectedValue === 'before-1980') {
      items.push('<option value="before-1980" selected>Before 1980 (legacy)</option>');
    }

    for (let year = currentYear; year >= 1980; year -= 1) {
      items.push(`<option value="${year}"${String(year) === selectedValue ? ' selected' : ''}>${year}</option>`);
    }
    [1970, 1960, 1950].forEach(year => {
      items.push(`<option value="${year}"${String(year) === selectedValue ? ' selected' : ''}>${year}</option>`);
    });
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
      ? `<div class="photo-record-image photo-record-video" style="background:#111;cursor:default;">
          <video controls playsinline preload="none" poster="${videoPoster}" style="display:block;width:100%;height:100%;object-fit:contain;background:#111;">
            <source src="${escapeHtml(photo.image_url)}">
            Your browser cannot play this video.
          </video>
        </div>`
      : `<button class="photo-record-image live-lightbox-image" data-image="${escapeHtml(photo.image_url)}" data-caption="${escapeHtml(note)}"><img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(note)}" loading="lazy"></button>`;

    const duration = isVideo && photo.duration_seconds
      ? `<p class="photo-media-info">Video · ${Number(photo.duration_seconds)} sec</p>`
      : '';

    const sortHandle = desktopSortingEnabled()
      ? '<button class="photo-sort-handle" type="button" aria-label="Move this photo or video">☰ Move</button>'
      : '';

    return `<article class="photo-record-card live-photo-card" data-photo-id="${photo.photo_id}">
      ${sortHandle}
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


  const videoObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const video = entry.target;
          // Pause as soon as the video is essentially off screen.
          if (!entry.isIntersecting || entry.intersectionRatio < 0.05) {
            if (!video.paused) video.pause();
          }
        });
      }, { threshold: [0, 0.05] })
    : null;

  const videoThumbnailObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const video = entry.target;
          videoThumbnailObserver.unobserve(video);
          video.preload = 'metadata';
          try { video.load(); } catch (_) {}
        });
      }, { rootMargin: '300px 0px', threshold: 0.01 })
    : null;

  function wireVideoBehavior(container) {
    container.querySelectorAll('video').forEach(video => {
      if (video.dataset.videoBehaviorWired === '1') return;
      video.dataset.videoBehaviorWired = '1';

      // Keep only one family video playing at a time.
      video.addEventListener('play', () => {
        document.querySelectorAll('video').forEach(other => {
          if (other !== video && !other.paused) other.pause();
        });

        // Thumbnail priming may leave the video a fraction of a second in.
        // Return to the true beginning the first time the user presses Play.
        if (video.dataset.realPlayStarted !== '1') {
          video.dataset.realPlayStarted = '1';
          if (video.currentTime > 0 && video.currentTime <= 0.25) {
            try { video.currentTime = 0; } catch (_) {}
          }
        }
      });

      videoObserver?.observe(video);

      // Ask the browser for a frame near the beginning. This gives the card
      // a real thumbnail without creating or storing a separate image file.
      const primeThumbnail = () => {
        if (video.dataset.realPlayStarted === '1' || video.dataset.thumbPrimed === '1') return;
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        video.dataset.thumbPrimed = '1';
        const frameTime = Math.min(0.10, Math.max(0.01, video.duration * 0.002));
        try { video.currentTime = frameTime; } catch (_) {}
      };

      const showRealFrame = () => {
        if (video.dataset.realPlayStarted === '1') return;
        if (video.dataset.thumbPrimed === '1') {
          video.pause();
          video.removeAttribute('poster');
          video.dataset.thumbReady = '1';
        }
      };

      if (video.readyState >= 1) primeThumbnail();
      else video.addEventListener('loadedmetadata', primeThumbnail, { once: true });
      video.addEventListener('seeked', showRealFrame);

      // Only fetch metadata/a first frame for videos that are on screen or
      // about to come on screen. The generic poster remains for the rest.
      if (videoThumbnailObserver) videoThumbnailObserver.observe(video);
      else {
        video.preload = 'metadata';
        try { video.load(); } catch (_) {}
      }
    });
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
    if (!desktopSortingEnabled()) return;

    let draggedCard = null;
    let activePointerId = null;
    let changed = false;
    let saveTimer = null;
    let saveChain = Promise.resolve();
    let lastQueuedSignature = '';

    function currentPhotoIds() {
      return Array.from(container.querySelectorAll('.live-photo-card'))
        .map(card => Number(card.dataset.photoId));
    }

    function showToast(message, isError = false) {
      let toast = document.getElementById('media-sort-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'media-sort-toast';
        toast.style.position = 'fixed';
        toast.style.left = '50%';
        toast.style.bottom = '24px';
        toast.style.transform = 'translateX(-50%)';
        toast.style.zIndex = '9999';
        toast.style.padding = '11px 16px';
        toast.style.borderRadius = '999px';
        toast.style.fontWeight = '700';
        toast.style.fontSize = '14px';
        toast.style.boxShadow = '0 6px 24px rgba(0,0,0,.25)';
        document.body.appendChild(toast);
      }
      toast.style.background = isError ? '#8b1e1e' : '#143325';
      toast.style.color = '#fff';
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => { toast.hidden = true; }, isError ? 5000 : 1800);
    }

    function queueSave(showConfirmation = false) {
      const photoIds = currentPhotoIds();
      const signature = photoIds.join(',');
      if (!photoIds.length) return saveChain;
      if (signature === lastQueuedSignature && !showConfirmation) return saveChain;
      lastQueuedSignature = signature;

      saveChain = saveChain.then(async () => {
        status.textContent = 'Saving order...';
        const result = await api('POST', {
          action: 'reorder',
          photoYear: apiYear,
          photo_ids: photoIds
        });

        const saved = Array.isArray(result.saved_order) ? result.saved_order.map(Number) : [];
        if (saved.length !== photoIds.length || saved.some((id, index) => id !== photoIds[index])) {
          throw new Error('The database did not save the new order.');
        }

        status.textContent = 'Order saved to database.';
        showToast('Order saved');
        setTimeout(() => {
          status.textContent = 'Drag the Move handle to rearrange photos and videos. Changes save automatically.';
        }, 1800);
      }).catch(error => {
        lastQueuedSignature = '';
        status.textContent = 'Order was NOT saved.';
        showToast(error.message || 'Order was not saved', true);
        alert(error.message || 'Order was not saved.');
      });

      return saveChain;
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => queueSave(false), 450);
    }

    function findTargetCard(x, y) {
      const cards = Array.from(container.querySelectorAll('.live-photo-card'));
      return cards.find(card => {
        if (card === draggedCard) return false;
        const rect = card.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }) || null;
    }

    function onPointerMove(event) {
      if (!draggedCard || event.pointerId !== activePointerId) return;
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
        scheduleSave();
      }
    }

    function finishSort(event) {
      if (!draggedCard) return;
      if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
      event?.preventDefault?.();

      clearTimeout(saveTimer);
      draggedCard.classList.remove('is-being-sorted');
      document.body.classList.remove('media-sort-active');
      draggedCard = null;
      activePointerId = null;

      if (changed) {
        changed = false;
        queueSave(true);
      }
    }

    container.querySelectorAll('.photo-sort-handle').forEach(handle => {
      handle.addEventListener('pointerdown', event => {
        if (!desktopSortingEnabled()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        draggedCard = handle.closest('.live-photo-card');
        activePointerId = event.pointerId;
        changed = false;
        draggedCard.classList.add('is-being-sorted');
        document.body.classList.add('media-sort-active');
      });
    });

    // Use document-level listeners so moving the card in the DOM cannot lose
    // the pointer-up event on Android or desktop browsers.
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', finishSort, { passive: false });
    document.addEventListener('pointercancel', finishSort, { passive: false });
    window.addEventListener('blur', () => finishSort());
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        document.querySelectorAll('video').forEach(video => video.pause());
      }
    });

    const yearLabel = document.getElementById('gallery-year');
    if (!yearLabel) return;
    const rawYear = new URLSearchParams(window.location.search).get('year') || String(currentYear);
    const normalized = rawYear.toLowerCase().replace(/[_\s]+/g, '-');
    const isBefore = ['before-1980','pre-1980','before1980','pre1980'].includes(normalized);
    const apiYear = isBefore ? 'before-1980' : rawYear;
    const target = document.getElementById('gallery-default');
    if (!target) return;
    yearLabel.textContent = isBefore ? 'Before 1980' : rawYear;

    const canSort = desktopSortingEnabled();
    const sortStatus = canSort ? document.createElement('p') : null;
    if (sortStatus) {
      sortStatus.className = 'photo-sort-status';
      sortStatus.textContent = 'Drag the Move handle to rearrange photos and videos. Changes save automatically.';
      target.insertAdjacentElement('afterend', sortStatus);
    }

    const liveSection = document.createElement('div');
    liveSection.className = 'photo-card-grid live-photo-grid';
    if (sortStatus) sortStatus.insertAdjacentElement('afterend', liveSection);
    else target.insertAdjacentElement('afterend', liveSection);

    try {
      const response = await fetch(`/api/photos?year=${encodeURIComponent(apiYear)}`, { credentials:'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load photos and videos.');
      target.hidden = true;
      if (!data.photos.length) {
        liveSection.innerHTML = '<p class="archive-note">No uploaded photos or videos for this year yet.</p>';
        return;
      }

      liveSection.innerHTML = data.photos.map(mediaCard).join('');
      wireLightbox(liveSection);
      wireActions(liveSection);
      wireVideoBehavior(liveSection);
      if (canSort && sortStatus) wireSorting(liveSection, apiYear, sortStatus);
    } catch (error) {
      liveSection.innerHTML = `<p class="archive-note">${escapeHtml(error.message)}</p>`;
    }
  });
})();
