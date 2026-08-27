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


async function saveMediaOrder(db, photoYear, photoIds) {
  if (photoYear === null || !photoIds.length || photoIds.length !== new Set(photoIds).size) {
    const error = new Error('Invalid media order.');
    error.statusCode = 400;
    throw error;
  }

  const [rows] = await db.execute(
    `SELECT photo_id
     FROM vera_photos
     WHERE photo_year = ? AND is_active = 1
     ORDER BY photo_id`,
    [photoYear]
  );

  const expected = rows.map(row => Number(row.photo_id)).sort((a, b) => a - b);
  const received = [...photoIds].sort((a, b) => a - b);

  if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
    const error = new Error('The gallery changed. Refresh the page and try sorting again.');
    error.statusCode = 409;
    throw error;
  }

  await db.beginTransaction();
  try {
    for (let index = 0; index < photoIds.length; index += 1) {
      await db.execute(
        `UPDATE vera_photos
         SET order_id = ?
         WHERE photo_id = ? AND photo_year = ? AND is_active = 1`,
        [index + 1, photoIds[index], photoYear]
      );
    }
    await db.commit();
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  }

  const [savedRows] = await db.execute(
    `SELECT photo_id, order_id
     FROM vera_photos
     WHERE photo_year = ? AND is_active = 1
     ORDER BY order_id ASC, photo_id ASC`,
    [photoYear]
  );

  return savedRows.map(row => Number(row.photo_id));
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

      const orderBy = year !== null
        ? 'ORDER BY p.order_id ASC, p.photo_id ASC'
        : 'ORDER BY p.photo_year DESC, p.order_id ASC, p.photo_id ASC';

      const [rows] = await db.execute(
        `SELECT p.photo_id, p.filename, p.image_url, p.photo_year, p.caption,
                p.family_member_name, p.media_type, p.duration_seconds, p.order_id, p.uploaded_at, p.uploaded_by_user_id,
                COALESCE(u.display_name, u.username, 'Family member') AS uploaded_by
         FROM vera_photos p
         LEFT JOIN vera_users u ON u.user_id = p.uploaded_by_user_id
         ${where}
         ${orderBy}`,
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


    if (req.method === 'POST') {
      const body = getJsonBody(req);
      if (String(body.action || '') !== 'reorder') {
        return res.status(400).json({ error: 'Invalid photo action.' });
      }

      const photoYear = parseYear(body.photoYear);
      const photoIds = Array.isArray(body.photo_ids)
        ? body.photo_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];

      try {
        const savedOrder = await saveMediaOrder(db, photoYear, photoIds);
        return res.status(200).json({ ok: true, saved_order: savedOrder });
      } catch (error) {
        return res.status(error.statusCode || 500).json({
          error: error.message || 'Unable to save media order.'
        });
      }
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
        `SELECT photo_id, uploaded_by_user_id, photo_year FROM vera_photos WHERE photo_id = ? AND is_active = 1 LIMIT 1`,
        [photoId]
      );
      const photo = rows[0];
      if (!photo) return res.status(404).json({ error: 'Photo not found.' });
      if (!user.is_admin && Number(photo.uploaded_by_user_id) !== Number(user.user_id)) {
        return res.status(403).json({ error: 'You may edit only photos you uploaded.' });
      }

      if (Number(photo.photo_year) !== Number(photoYear)) {
        const [orderRows] = await db.execute(
          'SELECT COALESCE(MAX(order_id), 0) + 1 AS next_order FROM vera_photos WHERE photo_year = ? AND is_active = 1',
          [photoYear]
        );
        const nextOrder = Number(orderRows[0]?.next_order || 1);
        await db.execute(
          `UPDATE vera_photos SET photo_year = ?, order_id = ?, caption = ? WHERE photo_id = ?`,
          [photoYear, nextOrder, caption, photoId]
        );
      } else {
        await db.execute(`UPDATE vera_photos SET caption = ? WHERE photo_id = ?`, [caption, photoId]);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const body = getJsonBody(req);
      const photoYear = parseYear(body.photoYear);
      const photoIds = Array.isArray(body.photo_ids)
        ? body.photo_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];

      try {
        const savedOrder = await saveMediaOrder(db, photoYear, photoIds);
        return res.status(200).json({ ok: true, saved_order: savedOrder });
      } catch (error) {
        return res.status(error.statusCode || 500).json({
          error: error.message || 'Unable to save media order.'
        });
      }
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

    res.setHeader('Allow', 'GET, POST, PATCH, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('Photos API error:', error);
    return res.status(500).json({ error: 'Photo service is unavailable right now.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
