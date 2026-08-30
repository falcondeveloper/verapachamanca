const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT request_id, song_name, artist_name, youtube_url, created_at
         FROM vera_music_requests
         ORDER BY song_name ASC, artist_name ASC, request_id ASC`
      );
      return res.status(200).json({ requests: rows });
    }

    const body = getJsonBody(req);

    if (req.method === 'POST') {
      const songName = nullableText(body.song_name, 255);
      const artistName = nullableText(body.artist_name, 255);
      const youtubeUrl = nullableText(body.youtube_url, 1000);

      if (!songName) {
        return res.status(400).json({ error: 'Song name is required.' });
      }


      if (youtubeUrl) {
        let parsed;
        try {
          parsed = new URL(youtubeUrl);
        } catch (_) {
          return res.status(400).json({ error: 'Enter a valid YouTube link.' });
        }

        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
        if (!['http:', 'https:'].includes(parsed.protocol) || !isYouTube) {
          return res.status(400).json({ error: 'Enter a valid YouTube link.' });
        }
      }

      const [result] = await db.execute(
        `INSERT INTO vera_music_requests (song_name, artist_name, youtube_url)
         VALUES (?, ?, ?)`,
        [songName, artistName, youtubeUrl]
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

      if (youtubeUrl) {
        let parsed;
        try {
          parsed = new URL(youtubeUrl);
        } catch (_) {
          return res.status(400).json({ error: 'Enter a valid YouTube link.' });
        }

        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
        if (!['http:', 'https:'].includes(parsed.protocol) || !isYouTube) {
          return res.status(400).json({ error: 'Enter a valid YouTube link.' });
        }
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

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('Music requests error:', error);
    return res.status(500).json({ error: 'Unable to update the music request list.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
