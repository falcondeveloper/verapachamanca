const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');
const { getLoggedInUser } = require('../lib/auth');
const { withSftp, remoteFilePath, publicImageUrl } = require('../lib/sftp');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function parseYear(value) {
  if (String(value) === 'before-1980') return 0;
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1980 || year > currentYear + 1) return null;
  return year;
}

function decodeImage(body) {
  const base64 = String(body.imageBase64 || '');
  const mime = String(body.mimeType || '').toLowerCase();
  const allowed = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const ext = allowed[mime];
  if (!ext || !base64) return null;

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { buffer, ext, mime };
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireSiteAccess(req, res)) return;

  let db;
  let uploadedRemotePath = null;
  try {
    db = await getDb();
    const user = await getLoggedInUser(req, db);
    if (!user) return res.status(401).json({ error: 'Please log in before uploading photos.' });

    const body = getJsonBody(req);
    const image = decodeImage(body);
    if (!image) {
      return res.status(400).json({ error: 'Image must be JPEG, PNG, or WebP and 2 MB or smaller after resizing.' });
    }

    const photoYear = parseYear(body.photoYear);
    if (photoYear === null) return res.status(400).json({ error: 'Choose a valid photo year.' });

    const caption = nullableText(body.caption, 5000);
    const familyMemberName = nullableText(body.familyMemberName, 150);
    const filename = `vera-${Date.now()}-${crypto.randomUUID()}.${image.ext}`;
    uploadedRemotePath = remoteFilePath(filename);

    await withSftp(client => client.put(image.buffer, uploadedRemotePath));

    const imageUrl = publicImageUrl(filename);
    const [result] = await db.execute(
      `INSERT INTO vera_photos
       (uploaded_by_user_id, filename, image_url, photo_year, caption, family_member_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [user.user_id, filename, imageUrl, photoYear, caption, familyMemberName]
    );

    return res.status(201).json({
      ok: true,
      photo: {
        photo_id: result.insertId,
        filename,
        image_url: imageUrl,
        photo_year: photoYear,
        caption,
        family_member_name: familyMemberName,
        uploaded_by: user.display_name
      }
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    if (uploadedRemotePath) {
      try {
        await withSftp(async client => {
          const exists = await client.exists(uploadedRemotePath);
          if (exists) await client.delete(uploadedRemotePath);
        });
      } catch (cleanupError) {
        console.error('Photo cleanup error:', cleanupError);
      }
    }
    return res.status(500).json({ error: 'Photo upload failed. Please try again.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
