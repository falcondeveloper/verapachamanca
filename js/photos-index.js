(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('year-grid');
    if (!grid) return;
    try {
      const response = await fetch('/api/photos', { credentials:'same-origin' });
      const data = await response.json();
      if (!response.ok) return;
      if (!data.photos.length) return;

      const groups = new Map([
        ['2026', { count: 2, image: 'images/nextgen.jpg' }],
        ['before-1980', { count: 20, image: 'images/pre1980/01-04aa.jpg' }]
      ]);
      for (const photo of data.photos) {
        const key = Number(photo.photo_year) === 0 ? 'before-1980' : String(photo.photo_year);
        if (!groups.has(key)) groups.set(key, { count:0, image:photo.image_url });
        groups.get(key).count += 1;
        if (!groups.get(key).image) groups.get(key).image = photo.image_url;
      }
      const keys = [...groups.keys()].sort((a,b) => {
        if (a === 'before-1980') return 1;
        if (b === 'before-1980') return -1;
        return Number(b)-Number(a);
      });
      grid.innerHTML = keys.map((key, index) => {
        const group = groups.get(key);
        const label = key === 'before-1980' ? 'Before 1980' : key;
        return `<a class="year-card simple-year-card${index===0?' featured-year':''}" href="gallery.html?year=${encodeURIComponent(key)}">
          <div class="year-image" style="background-image:url('${escapeHtml(group.image)}');background-size:cover;background-position:center"></div>
          <div><span>${key === 'before-1980' ? 'Historical photos' : 'Photo archive'}</span><h2>${escapeHtml(label)}</h2><p>${group.count} photo${group.count===1?'':'s'}</p><strong>View photos →</strong></div>
        </a>`;
      }).join('');
    } catch {
      // Keep the existing static year cards if the API is unavailable.
    }
  });
})();
