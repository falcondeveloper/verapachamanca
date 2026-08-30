const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');

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

function parseCategoryId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function categoryExists(db, categoryId) {
  if (categoryId === null) return true;
  const [rows] = await db.execute('SELECT category_id FROM vera_music_categories WHERE category_id = ? LIMIT 1', [categoryId]);
  return Boolean(rows[0]);
}

async function getCategories(db) {
  const [rows] = await db.execute(
    `SELECT category_id, category_name, display_order
     FROM vera_music_categories
     ORDER BY display_order ASC, category_name ASC`
  );
  return rows;
}

async function getOrderedRequests(db, forUpdate = false) {
  if (forUpdate) {
    const [rows] = await db.execute(
      `SELECT request_id, song_name, artist_name, category_id, youtube_url, display_order, created_at
       FROM vera_music_requests
       ORDER BY CASE WHEN display_order IS NULL OR display_order <= 0 THEN 1 ELSE 0 END,
                display_order ASC,
                request_id ASC
       FOR UPDATE`
    );
    return rows;
  }

  const [rows] = await db.execute(
    `SELECT r.request_id, r.song_name, r.artist_name, r.category_id,
            c.category_name, r.youtube_url, r.display_order, r.created_at
     FROM vera_music_requests r
     LEFT JOIN vera_music_categories c ON c.category_id = r.category_id
     ORDER BY CASE WHEN r.display_order IS NULL OR r.display_order <= 0 THEN 1 ELSE 0 END,
              r.display_order ASC,
              r.request_id ASC`
  );
  return rows;
}

async function normalizeOrder(db, rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = i + 1;
    if (Number(rows[i].display_order) !== normalized) {
      await db.execute('UPDATE vera_music_requests SET display_order = ? WHERE request_id = ?', [normalized, rows[i].request_id]);
      rows[i].display_order = normalized;
    }
  }
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    if (req.method === 'GET') {
      const rows = await getOrderedRequests(db);
      const categories = await getCategories(db);
      return res.status(200).json({
        categories,
        requests: rows.map(row => ({ ...row, youtube_video_id: extractYouTubeVideoId(row.youtube_url) }))
      });
    }

    const body = getJsonBody(req);

    if (req.method === 'POST' || req.method === 'PATCH') {
      const isEdit = req.method === 'PATCH';
      const requestId = isEdit ? Number(body.request_id) : null;
      const songName = nullableText(body.song_name, 255);
      const artistName = nullableText(body.artist_name, 255);
      const youtubeUrl = nullableText(body.youtube_url, 1000);
      const categoryId = parseCategoryId(body.category_id);

      if (isEdit && (!Number.isInteger(requestId) || requestId <= 0)) return res.status(400).json({ error: 'Music request ID is required.' });
      if (!songName) return res.status(400).json({ error: 'Song name is required.' });
      if (Number.isNaN(categoryId) || !(await categoryExists(db, categoryId))) return res.status(400).json({ error: 'Choose a valid category.' });
      if (youtubeUrl && !extractYouTubeVideoId(youtubeUrl)) return res.status(400).json({ error: 'Enter a valid YouTube video link or leave the field blank.' });

      if (isEdit) {
        const [result] = await db.execute(
          `UPDATE vera_music_requests
           SET song_name = ?, artist_name = ?, category_id = ?, youtube_url = ?
           WHERE request_id = ?`,
          [songName, artistName, categoryId, youtubeUrl, requestId]
        );
        if (!result.affectedRows) return res.status(404).json({ error: 'Music request was not found.' });
        return res.status(200).json({ ok: true });
      }

      const [orderRows] = await db.execute('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM vera_music_requests');
      const nextOrder = Number(orderRows[0]?.next_order || 1);
      const [result] = await db.execute(
        `INSERT INTO vera_music_requests (song_name, artist_name, category_id, youtube_url, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [songName, artistName, categoryId, youtubeUrl, nextOrder]
      );
      return res.status(201).json({ ok: true, request_id: result.insertId });
    }

    if (req.method === 'PUT') {
      const requestId = Number(body.request_id);
      const swapWithId = Number(body.swap_with_request_id);
      const direction = String(body.direction || '').toLowerCase();
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: 'Music request ID is required.' });

      await db.beginTransaction();
      try {
        const rows = await getOrderedRequests(db, true);
        await normalizeOrder(db, rows);
        const index = rows.findIndex(row => Number(row.request_id) === requestId);
        if (index < 0) { await db.rollback(); return res.status(404).json({ error: 'Music request was not found.' }); }

        let otherIndex = -1;
        if (Number.isInteger(swapWithId) && swapWithId > 0) {
          otherIndex = rows.findIndex(row => Number(row.request_id) === swapWithId);
        } else if (['up', 'down'].includes(direction)) {
          otherIndex = direction === 'up' ? index - 1 : index + 1;
        }
        if (otherIndex < 0 || otherIndex >= rows.length) { await db.commit(); return res.status(200).json({ ok: true, moved: false }); }

        const current = rows[index];
        const other = rows[otherIndex];
        await db.execute(
          `UPDATE vera_music_requests
           SET display_order = CASE request_id
             WHEN ? THEN ? WHEN ? THEN ? ELSE display_order END
           WHERE request_id IN (?, ?)`,
          [current.request_id, other.display_order, other.request_id, current.display_order, current.request_id, other.request_id]
        );
        await db.commit();
        return res.status(200).json({ ok: true, moved: true });
      } catch (error) {
        await db.rollback().catch(() => {});
        throw error;
      }
    }

    if (req.method === 'DELETE') {
      const requestId = Number(body.request_id);
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: 'Music request ID is required.' });
      const [result] = await db.execute('DELETE FROM vera_music_requests WHERE request_id = ?', [requestId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Music request was not found.' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('Music requests error:', error);
    return res.status(500).json({ error: 'Unable to update the music request list.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
