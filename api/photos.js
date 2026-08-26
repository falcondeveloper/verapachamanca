const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');
const { getLoggedInUser } = require('../lib/auth');
const { withSftp, remoteFilePath } = require('../lib/sftp');

function parseYear(value) {
  if (String(value) === 'before-1980') return 0;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  return year;
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();

    if (req.method === 'GET') {
      const yearRaw = req.query?.year;
      const year = yearRaw === undefined ? null : parseYear(yearRaw);
      if (yearRaw !== undefined && year === null) return res.status(400).json({ error: 'Invalid year.' });

      const params = [];
      let where = 'WHERE p.is_active = 1';
      if (year !== null) {
        where += ' AND p.photo_year = ?';
        params.push(year);
      }

      const [rows] = await db.execute(
        `SELECT p.photo_id, p.filename, p.image_url, p.photo_year, p.caption,
                p.family_member_name, p.uploaded_at, p.uploaded_by_user_id,
                COALESCE(u.display_name, u.username, 'Family member') AS uploaded_by
         FROM vera_photos p
         LEFT JOIN vera_users u ON u.user_id = p.uploaded_by_user_id
         ${where}
         ORDER BY p.uploaded_at DESC, p.photo_id DESC`,
        params
      );

      const user = await getLoggedInUser(req, db);
      return res.status(200).json({
        photos: rows.map(row => ({
          ...row,
          can_edit: Boolean(user && (user.is_admin || Number(user.user_id) === Number(row.uploaded_by_user_id)))
        }))
      });
    }

    if (req.method === 'PATCH') {
      const user = await getLoggedInUser(req, db);
      if (!user) return res.status(401).json({ error: 'Please log in.' });
      const body = getJsonBody(req);
      const photoId = Number(body.photo_id);
      const photoYear = parseYear(body.photoYear);
      if (!Number.isInteger(photoId) || photoId <= 0 || photoYear === null) {
        return res.status(400).json({ error: 'Invalid photo or year.' });
      }
      const caption = nullableText(body.caption, 5000);

      const [rows] = await db.execute(
        `SELECT photo_id, uploaded_by_user_id FROM vera_photos WHERE photo_id = ? AND is_active = 1 LIMIT 1`,
        [photoId]
      );
      const photo = rows[0];
      if (!photo) return res.status(404).json({ error: 'Photo not found.' });
      if (!user.is_admin && Number(photo.uploaded_by_user_id) !== Number(user.user_id)) {
        return res.status(403).json({ error: 'You may edit only photos you uploaded.' });
      }

      await db.execute(`UPDATE vera_photos SET photo_year = ?, caption = ? WHERE photo_id = ?`, [photoYear, caption, photoId]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const user = await getLoggedInUser(req, db);
      if (!user) return res.status(401).json({ error: 'Please log in.' });
      const body = getJsonBody(req);
      const photoId = Number(body.photo_id);
      if (!Number.isInteger(photoId) || photoId <= 0) return res.status(400).json({ error: 'Invalid photo.' });

      const [rows] = await db.execute(
        `SELECT photo_id, filename, uploaded_by_user_id FROM vera_photos WHERE photo_id = ? AND is_active = 1 LIMIT 1`,
        [photoId]
      );
      const photo = rows[0];
      if (!photo) return res.status(404).json({ error: 'Photo not found.' });
      if (!user.is_admin && Number(photo.uploaded_by_user_id) !== Number(user.user_id)) {
        return res.status(403).json({ error: 'You may delete only photos you uploaded.' });
      }

      const remotePath = remoteFilePath(photo.filename);
      await withSftp(async client => {
        const exists = await client.exists(remotePath);
        if (exists) await client.delete(remotePath);
      });
      await db.execute(`DELETE FROM vera_photos WHERE photo_id = ?`, [photoId]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('Photos API error:', error);
    return res.status(500).json({ error: 'Photo service is unavailable right now.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
