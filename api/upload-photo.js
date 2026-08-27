const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');
const { getLoggedInUser } = require('../lib/auth');
const { withSftp, remoteFilePath, publicImageUrl } = require('../lib/sftp');

const MAX_VIDEO_SECONDS = 120;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const MAX_CHUNK_BYTES = 2200000;

function parseYear(value) {
  if (String(value) === 'before-1980') return 0;
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1980 || year > currentYear + 1) return null;
  return year;
}

function extensionFor(mediaType, originalName, mimeType) {
  const name = String(originalName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (mediaType === 'photo') {
    const match = name.match(/\.(jpg|jpeg|png|webp)$/);
    if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
    return {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[mime] || null;
  }

  if (mediaType === 'video') {
    const match = name.match(/\.(mp4|mov|webm|m4v)$/);
    if (match) return match[1];
    return {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'video/x-m4v': 'm4v'
    }[mime] || null;
  }

  return null;
}

function validFilename(filename, mediaType) {
  const value = String(filename || '');
  if (mediaType === 'photo') {
    return /^vera-photo-\d+-[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(value);
  }
  if (mediaType === 'video') {
    return /^vera-video-\d+-[0-9a-f-]{36}\.(mp4|mov|webm|m4v)$/i.test(value);
  }
  return false;
}

function decodeChunk(base64) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  if (!buffer.length || buffer.length > MAX_CHUNK_BYTES) return null;
  return buffer;
}

function validVideoDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_VIDEO_SECONDS;
}

function validTotalBytes(value, mediaType) {
  const total = Number(value);
  const max = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  return Number.isInteger(total) && total > 0 && total <= max;
}

async function removeRemoteIfPresent(filename, mediaType) {
  if (!validFilename(filename, mediaType)) return;
  const path = remoteFilePath(filename);
  await withSftp(async client => {
    const exists = await client.exists(path);
    if (exists) await client.delete(path);
  });
}

async function writeChunk(filename, mediaType, offset, chunk) {
  if (!validFilename(filename, mediaType)) throw new Error('Invalid upload filename.');
  const remotePath = remoteFilePath(filename);

  await withSftp(async client => {
    const exists = await client.exists(remotePath);

    if (offset === 0) {
      if (exists) {
        const stat = await client.stat(remotePath);
        if (Number(stat.size) === chunk.length) return;
        await client.delete(remotePath);
      }
      await client.put(chunk, remotePath);
      return;
    }

    if (!exists) throw new Error('Upload was interrupted before the first chunk.');
    const stat = await client.stat(remotePath);
    const currentSize = Number(stat.size);
    const expectedAfter = offset + chunk.length;

    if (currentSize === expectedAfter) return;
    if (currentSize !== offset) throw new Error('Upload chunks are out of order.');

    await client.append(chunk, remotePath, { encoding: null });
    const after = await client.stat(remotePath);
    if (Number(after.size) !== expectedAfter) throw new Error('Chunk size verification failed.');
  });
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();
    const user = await getLoggedInUser(req, db);
    if (!user) return res.status(401).json({ error: 'Please select your name before uploading.' });

    const body = getJsonBody(req);
    const action = String(body.action || '');
    const mediaType = String(body.mediaType || '');

    if (!['photo', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'Invalid media type.' });
    }

    if (action === `${mediaType}-start`) {
      if (!validTotalBytes(body.totalBytes, mediaType)) {
        return res.status(400).json({
          error: mediaType === 'video'
            ? 'Video must be smaller than 150 MB.'
            : 'Photo must be smaller than 30 MB.'
        });
      }
      if (mediaType === 'video' && !validVideoDuration(body.durationSeconds)) {
        return res.status(400).json({ error: `Videos are limited to ${MAX_VIDEO_SECONDS} seconds.` });
      }
      const ext = extensionFor(mediaType, body.originalName, body.mimeType);
      if (!ext) {
        return res.status(400).json({
          error: mediaType === 'video'
            ? 'Use an MP4, MOV, WebM, or M4V video.'
            : 'Use a JPEG, PNG, or WebP photo.'
        });
      }
      const filename = `vera-${mediaType}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      return res.status(200).json({ ok: true, filename });
    }

    if (action === `${mediaType}-chunk`) {
      const filename = String(body.filename || '');
      if (!validFilename(filename, mediaType)) return res.status(400).json({ error: 'Invalid upload.' });
      const offset = Number(body.offset);
      if (!Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'Invalid upload chunk.' });
      const chunk = decodeChunk(body.chunkBase64);
      if (!chunk) return res.status(400).json({ error: 'Invalid upload chunk.' });
      await writeChunk(filename, mediaType, offset, chunk);
      return res.status(200).json({ ok: true, receivedThrough: offset + chunk.length });
    }

    if (action === `${mediaType}-abort`) {
      const filename = String(body.filename || '');
      if (validFilename(filename, mediaType)) await removeRemoteIfPresent(filename, mediaType);
      return res.status(200).json({ ok: true });
    }

    if (action === `${mediaType}-finish`) {
      const filename = String(body.filename || '');
      if (!validFilename(filename, mediaType)) return res.status(400).json({ error: 'Invalid upload.' });
      if (!validTotalBytes(body.totalBytes, mediaType)) return res.status(400).json({ error: 'Invalid file size.' });
      if (mediaType === 'video' && !validVideoDuration(body.durationSeconds)) {
        await removeRemoteIfPresent(filename, mediaType).catch(() => {});
        return res.status(400).json({ error: `Videos are limited to ${MAX_VIDEO_SECONDS} seconds.` });
      }

      const photoYear = parseYear(body.photoYear);
      if (photoYear === null) return res.status(400).json({ error: 'Choose a valid year.' });
      const caption = nullableText(body.caption, 5000);
      const familyMemberName = nullableText(body.familyMemberName, 150);
      const totalBytes = Number(body.totalBytes);
      const remotePath = remoteFilePath(filename);

      await withSftp(async client => {
        const exists = await client.exists(remotePath);
        if (!exists) throw new Error('Uploaded file was not found.');
        const stat = await client.stat(remotePath);
        if (Number(stat.size) !== totalBytes) throw new Error('Uploaded file size does not match the original file.');
      });

      const [existing] = await db.execute(
        'SELECT photo_id FROM vera_photos WHERE filename = ? LIMIT 1',
        [filename]
      );
      if (existing[0]) return res.status(200).json({ ok: true, photo_id: existing[0].photo_id });

      const imageUrl = publicImageUrl(filename);
      const durationSeconds = mediaType === 'video' ? Math.ceil(Number(body.durationSeconds)) : null;
      const [orderRows] = await db.execute(
        'SELECT COALESCE(MAX(order_id), 0) + 1 AS next_order FROM vera_photos WHERE photo_year = ? AND is_active = 1',
        [photoYear]
      );
      const nextOrder = Number(orderRows[0]?.next_order || 1);
      const [result] = await db.execute(
        `INSERT INTO vera_photos
         (uploaded_by_user_id, filename, image_url, photo_year, order_id, caption, family_member_name, media_type, duration_seconds, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [user.user_id, filename, imageUrl, photoYear, nextOrder, caption, familyMemberName, mediaType, durationSeconds]
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
          media_type: mediaType,
          duration_seconds: durationSeconds,
          uploaded_by: user.display_name
        }
      });
    }

    return res.status(400).json({ error: 'Invalid upload action.' });
  } catch (error) {
    console.error('Media upload error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed. Please try again.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
