const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, nullableText, setNoStore } = require('../lib/http');
const { getLoggedInUser } = require('../lib/auth');
const { withSftp, remoteFilePath, publicImageUrl } = require('../lib/sftp');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const MAX_VIDEO_CHUNK_BYTES = 2200000;

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

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { buffer, ext, mime };
}

function videoExtension(originalName, mimeType) {
  const nameMatch = String(originalName || '').toLowerCase().match(/\.(mp4|mov|webm|m4v)$/);
  if (nameMatch) return nameMatch[1];
  const map = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v'
  };
  return map[String(mimeType || '').toLowerCase()] || null;
}

function validVideoFilename(filename) {
  return /^vera-video-\d+-[0-9a-f-]{36}\.(mp4|mov|webm|m4v)$/i.test(String(filename || ''));
}

function decodeChunk(base64) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  if (!buffer.length || buffer.length > MAX_VIDEO_CHUNK_BYTES) return null;
  return buffer;
}

function validVideoDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_VIDEO_SECONDS;
}

function validTotalBytes(value) {
  const total = Number(value);
  return Number.isInteger(total) && total > 0 && total <= MAX_VIDEO_BYTES;
}

async function removeRemoteIfPresent(filename) {
  if (!validVideoFilename(filename)) return;
  const path = remoteFilePath(filename);
  await withSftp(async client => {
    const exists = await client.exists(path);
    if (exists) await client.delete(path);
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
  let uploadedRemotePath = null;
  try {
    db = await getDb();
    const user = await getLoggedInUser(req, db);
    if (!user) return res.status(401).json({ error: 'Please select your name before uploading.' });

    const body = getJsonBody(req);
    const action = String(body.action || 'photo-upload');

    if (action === 'video-start') {
      if (!validVideoDuration(body.durationSeconds)) {
        return res.status(400).json({ error: `Videos are limited to ${MAX_VIDEO_SECONDS} seconds.` });
      }
      if (!validTotalBytes(body.totalBytes)) {
        return res.status(400).json({ error: 'Video must be smaller than 150 MB.' });
      }
      const ext = videoExtension(body.originalName, body.mimeType);
      if (!ext) return res.status(400).json({ error: 'Use an MP4, MOV, WebM, or M4V video.' });
      const filename = `vera-video-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      return res.status(200).json({ ok: true, filename });
    }

    if (action === 'video-chunk') {
      const filename = String(body.filename || '');
      if (!validVideoFilename(filename)) return res.status(400).json({ error: 'Invalid video upload.' });
      const offset = Number(body.offset);
      if (!Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'Invalid video chunk.' });
      const chunk = decodeChunk(body.chunkBase64);
      if (!chunk) return res.status(400).json({ error: 'Invalid video chunk.' });
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

        if (!exists) throw new Error('Video upload was interrupted before the first chunk.');
        const stat = await client.stat(remotePath);
        const currentSize = Number(stat.size);
        const expectedAfter = offset + chunk.length;
        if (currentSize === expectedAfter) return; // Safe retry of a chunk already received.
        if (currentSize !== offset) throw new Error('Video upload chunks are out of order.');
        await client.append(chunk, remotePath, { encoding: null });
        const after = await client.stat(remotePath);
        if (Number(after.size) !== expectedAfter) throw new Error('Video chunk size verification failed.');
      });

      return res.status(200).json({ ok: true, receivedThrough: offset + chunk.length });
    }

    if (action === 'video-abort') {
      const filename = String(body.filename || '');
      if (validVideoFilename(filename)) await removeRemoteIfPresent(filename);
      return res.status(200).json({ ok: true });
    }

    if (action === 'video-finish') {
      const filename = String(body.filename || '');
      if (!validVideoFilename(filename)) return res.status(400).json({ error: 'Invalid video upload.' });
      if (!validVideoDuration(body.durationSeconds)) {
        await removeRemoteIfPresent(filename).catch(() => {});
        return res.status(400).json({ error: `Videos are limited to ${MAX_VIDEO_SECONDS} seconds.` });
      }
      if (!validTotalBytes(body.totalBytes)) return res.status(400).json({ error: 'Invalid video size.' });

      const photoYear = parseYear(body.photoYear);
      if (photoYear === null) return res.status(400).json({ error: 'Choose a valid year.' });
      const caption = nullableText(body.caption, 5000);
      const familyMemberName = nullableText(body.familyMemberName, 150);
      const totalBytes = Number(body.totalBytes);
      const remotePath = remoteFilePath(filename);

      await withSftp(async client => {
        const exists = await client.exists(remotePath);
        if (!exists) throw new Error('Uploaded video file was not found.');
        const stat = await client.stat(remotePath);
        if (Number(stat.size) !== totalBytes) throw new Error('Uploaded video size does not match the original file.');
      });

      const [existing] = await db.execute(
        `SELECT photo_id FROM vera_photos WHERE filename = ? LIMIT 1`,
        [filename]
      );
      if (existing[0]) return res.status(200).json({ ok: true, photo_id: existing[0].photo_id });

      const imageUrl = publicImageUrl(filename);
      const durationSeconds = Math.ceil(Number(body.durationSeconds));
      uploadedRemotePath = remotePath;
      const [result] = await db.execute(
        `INSERT INTO vera_photos
         (uploaded_by_user_id, filename, image_url, photo_year, caption, family_member_name, media_type, duration_seconds, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 'video', ?, 1)`,
        [user.user_id, filename, imageUrl, photoYear, caption, familyMemberName, durationSeconds]
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
          media_type: 'video',
          duration_seconds: durationSeconds,
          uploaded_by: user.display_name
        }
      });
    }

    // Normal photo upload.
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
       (uploaded_by_user_id, filename, image_url, photo_year, caption, family_member_name, media_type, duration_seconds, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'photo', NULL, 1)`,
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
        media_type: 'photo',
        duration_seconds: null,
        uploaded_by: user.display_name
      }
    });
  } catch (error) {
    console.error('Media upload error:', error);
    if (uploadedRemotePath) {
      try {
        await withSftp(async client => {
          const exists = await client.exists(uploadedRemotePath);
          if (exists) await client.delete(uploadedRemotePath);
        });
      } catch (cleanupError) {
        console.error('Media cleanup error:', cleanupError);
      }
    }
    return res.status(500).json({ error: error.message || 'Upload failed. Please try again.' });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
