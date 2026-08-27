(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('year-grid');
    if (!grid) return;
    try {
      const response = await fetch('/api/photos', { credentials:'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.photos.length) return;

      const groups = new Map([
        ['before-1980', { count: 20, image: 'images/pre1980/01-04aa.jpg' }]
      ]);
      for (const media of data.photos) {
        const key = Number(media.photo_year) === 0 ? 'before-1980' : String(media.photo_year);
        if (!groups.has(key)) groups.set(key, { count: 0, image: null });
        const group = groups.get(key);
        group.count += 1;
        if (!group.image && String(media.media_type || 'photo').toLowerCase() !== 'video') group.image = media.image_url;
      }
      const keys = [...groups.keys()].sort((a,b) => {
        if (a === 'before-1980') return 1;
        if (b === 'before-1980') return -1;
        return Number(b)-Number(a);
      });
      grid.innerHTML = keys.map((key, index) => {
        const group = groups.get(key);
        const label = key === 'before-1980' ? 'Before 1980' : key;
        const image = group.image || '';
        return `<a class="year-card simple-year-card${index===0?' featured-year':''}" href="gallery.html?year=${encodeURIComponent(key)}">
          <div class="year-image"${image ? ` style="background-image:url('${escapeHtml(image)}');background-size:cover;background-position:center"` : ''}></div>
          <div><span>${key === 'before-1980' ? 'Historical media' : 'Family archive'}</span><h2>${escapeHtml(label)}</h2><p>${group.count} item${group.count===1?'':'s'}</p><strong>View photos & videos →</strong></div>
        </a>`;
      }).join('');
    } catch {
      // Keep the existing static year cards if the API is unavailable.
    }
  });
})();
