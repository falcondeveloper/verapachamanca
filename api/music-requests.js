const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');

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

async function getOrderedRequests(db, forUpdate = false) {
  const [rows] = await db.execute(
    `SELECT request_id, song_name, artist_name, youtube_url, display_order, created_at
     FROM vera_music_requests
     ORDER BY CASE WHEN display_order IS NULL OR display_order <= 0 THEN 1 ELSE 0 END,
              display_order ASC,
              request_id ASC${forUpdate ? ' FOR UPDATE' : ''}`
  );
  return rows;
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    if (req.method === 'GET') {
      const rows = await getOrderedRequests(db);
      return res.status(200).json({
        requests: rows.map(row => ({
          ...row,
          youtube_video_id: extractYouTubeVideoId(row.youtube_url)
        }))
      });
    }

    const body = getJsonBody(req);

    if (req.method === 'POST') {
      const songName = nullableText(body.song_name, 255);
      const artistName = nullableText(body.artist_name, 255);
      const youtubeUrl = nullableText(body.youtube_url, 1000);

      if (!songName) {
        return res.status(400).json({ error: 'Song name is required.' });
      }
      if (youtubeUrl && !extractYouTubeVideoId(youtubeUrl)) {
        return res.status(400).json({ error: 'Enter a valid YouTube video link or leave the field blank.' });
      }

      const [orderRows] = await db.execute(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM vera_music_requests'
      );
      const nextOrder = Number(orderRows[0]?.next_order || 1);

      const [result] = await db.execute(
        `INSERT INTO vera_music_requests (song_name, artist_name, youtube_url, display_order)
         VALUES (?, ?, ?, ?)`,
        [songName, artistName, youtubeUrl, nextOrder]
      );

      return res.status(201).json({ ok: true, request_id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const requestId = Number(body.request_id);
      const songName = nullableText(body.song_name, 255);
      const artistName = nullableText(body.artist_name, 255);
      const youtubeUrl = nullableText(body.youtube_url, 1000);

      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ error: 'Music request ID is required.' });
      }
      if (!songName) {
        return res.status(400).json({ error: 'Song name is required.' });
      }
      if (youtubeUrl && !extractYouTubeVideoId(youtubeUrl)) {
        return res.status(400).json({ error: 'Enter a valid YouTube video link or leave the field blank.' });
      }

      const [result] = await db.execute(
        `UPDATE vera_music_requests
         SET song_name = ?, artist_name = ?, youtube_url = ?
         WHERE request_id = ?`,
        [songName, artistName, youtubeUrl, requestId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: 'Music request was not found.' });
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const requestId = Number(body.request_id);
      const direction = String(body.direction || '').toLowerCase();

      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ error: 'Music request ID is required.' });
      }
      if (!['up', 'down'].includes(direction)) {
        return res.status(400).json({ error: 'Move direction must be up or down.' });
      }

      await db.beginTransaction();
      try {
        const rows = await getOrderedRequests(db, true);
        const index = rows.findIndex(row => Number(row.request_id) === requestId);
        if (index < 0) {
          await db.rollback();
          return res.status(404).json({ error: 'Music request was not found.' });
        }

        // Normalize the order to 1..N first. This also repairs any old 0/duplicate values.
        for (let i = 0; i < rows.length; i += 1) {
          const normalized = i + 1;
          if (Number(rows[i].display_order) !== normalized) {
            await db.execute(
              'UPDATE vera_music_requests SET display_order = ? WHERE request_id = ?',
              [normalized, rows[i].request_id]
            );
            rows[i].display_order = normalized;
          }
        }

        const otherIndex = direction === 'up' ? index - 1 : index + 1;
        if (otherIndex < 0 || otherIndex >= rows.length) {
          await db.commit();
          return res.status(200).json({ ok: true, moved: false });
        }

        const current = rows[index];
        const other = rows[otherIndex];
        await db.execute(
          `UPDATE vera_music_requests
           SET display_order = CASE request_id
             WHEN ? THEN ?
             WHEN ? THEN ?
             ELSE display_order
           END
           WHERE request_id IN (?, ?)`,
          [
            current.request_id, other.display_order,
            other.request_id, current.display_order,
            current.request_id, other.request_id
          ]
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
      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ error: 'Music request ID is required.' });
      }

      const [result] = await db.execute(
        'DELETE FROM vera_music_requests WHERE request_id = ?',
        [requestId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: 'Music request was not found.' });
      }

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
