const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const { getDb } = require('../lib/db');
const { requireSiteAccess, getJsonBody, setNoStore } = require('../lib/http');
const { getLoggedInUser } = require('../lib/auth');
const { withSftp, remoteFilePath } = require('../lib/sftp');

const ONE_MB = 1024 * 1024;
const TARGET_BYTES = 950 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);

sharp.cache(false);
sharp.concurrency(1);

function safePhotoFilename(filename) {
  const value = String(filename || '');
  if (!value || path.basename(value) !== value) return null;

  const extension = (value.split('.').pop() || '').toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return null;
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) return null;

  return { filename: value, extension };
}

async function renderCandidate(original, extension, maxDimension, quality) {
  let pipeline = sharp(original, { failOn: 'none' })
    .autoOrient()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true
    });

  if (extension === 'jpg' || extension === 'jpeg') {
    pipeline = pipeline.jpeg({
      quality,
      progressive: true,
      mozjpeg: true
    });
  } else if (extension === 'webp') {
    pipeline = pipeline.webp({
      quality,
      effort: 4
    });
  } else if (extension === 'png') {
    pipeline = pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality
    });
  }

  return pipeline.toBuffer();
}

async function optimizeImageBuffer(original, extension) {
  const metadata = await sharp(original, { failOn: 'none' }).metadata();
  const actualFormat = String(metadata.format || '').toLowerCase();

  if (!['jpeg', 'png', 'webp'].includes(actualFormat)) {
    throw new Error(`File contents are not a supported photo format (${actualFormat || 'unknown'}).`);
  }

  const plans = extension === 'png'
    ? [
        [1600, 90],
        [1400, 88],
        [1200, 86],
        [1000, 84],
        [850, 82],
        [700, 80]
      ]
    : [
        [1600, 82],
        [1600, 76],
        [1400, 78],
        [1400, 72],
        [1200, 76],
        [1200, 68],
        [1000, 72],
        [900, 68],
        [800, 64],
        [700, 60]
      ];

  let best = null;

  for (const [dimension, quality] of plans) {
    const candidate = await renderCandidate(original, extension, dimension, quality);
    if (!candidate?.length) continue;

    // Verify Sharp can decode what we are about to write.
    await sharp(candidate, { failOn: 'error' }).metadata();

    if (!best || candidate.length < best.buffer.length) {
      best = { buffer: candidate, dimension, quality };
    }

    if (candidate.length <= TARGET_BYTES) {
      return {
        ...best,
        reachedTarget: true
      };
    }
  }

  return best
    ? { ...best, reachedTarget: best.buffer.length <= ONE_MB }
    : null;
}

async function replaceRemoteFileSafely(client, remotePath, replacement) {
  const token = crypto.randomUUID();
  const tempPath = `${remotePath}.opt-${token}.tmp`;
  const backupPath = `${remotePath}.opt-${token}.bak`;
  let originalMoved = false;
  let replacementInstalled = false;

  try {
    await client.put(replacement, tempPath);
    const tempStat = await client.stat(tempPath);
    if (Number(tempStat.size) !== replacement.length) {
      throw new Error('Temporary optimized file failed size verification.');
    }

    await client.rename(remotePath, backupPath);
    originalMoved = true;

    await client.rename(tempPath, remotePath);
    replacementInstalled = true;

    const finalStat = await client.stat(remotePath);
    if (Number(finalStat.size) !== replacement.length) {
      throw new Error('Optimized file failed final size verification.');
    }

    await client.delete(backupPath).catch(() => {});
  } catch (error) {
    // If the new file was installed but verification failed, remove it before restoring.
    if (replacementInstalled) {
      await client.delete(remotePath).catch(() => {});
    }

    if (originalMoved) {
      const backupExists = await client.exists(backupPath).catch(() => false);
      if (backupExists) {
        await client.rename(backupPath, remotePath).catch(() => {});
      }
    }

    await client.delete(tempPath).catch(() => {});
    throw error;
  }
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  let db;
  try {
    db = await getDb();
    const user = await getLoggedInUser(req, db);
    if (!user) {
      return res.status(401).json({ error: 'Please select your name before running photo maintenance.' });
    }

    if (req.method === 'GET') {
      // FIRST SAFEGUARD: database query contains only media_type='photo'.
      const [rows] = await db.execute(
        `SELECT photo_id, filename, photo_year, media_type
         FROM vera_photos
         WHERE is_active = 1
           AND media_type = 'photo'
         ORDER BY photo_year DESC, order_id ASC, photo_id ASC`
      );

      const photos = rows
        .filter(row => safePhotoFilename(row.filename))
        .map(row => ({
          photo_id: Number(row.photo_id),
          filename: row.filename,
          photo_year: Number(row.photo_year)
        }));

      return res.status(200).json({
        ok: true,
        photos,
        total: photos.length,
        message: 'Only database rows marked as photos are included. Videos are excluded.'
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const body = getJsonBody(req);
    const photoId = Number(body.photo_id);

    if (!Number.isInteger(photoId) || photoId <= 0) {
      return res.status(400).json({ error: 'Valid photo_id required.' });
    }

    // SECOND SAFEGUARD: re-check the row immediately before touching storage.
    const [rows] = await db.execute(
      `SELECT photo_id, filename, photo_year, media_type
       FROM vera_photos
       WHERE photo_id = ?
         AND is_active = 1
         AND media_type = 'photo'
       LIMIT 1`,
      [photoId]
    );

    const row = rows[0];
    if (!row) {
      return res.status(404).json({
        status: 'skipped',
        reason: 'Not an active photo record. Nothing was changed.'
      });
    }

    const safe = safePhotoFilename(row.filename);
    if (!safe) {
      return res.status(200).json({
        status: 'skipped',
        photo_id: photoId,
        filename: row.filename,
        reason: 'File extension is not an allowed photo type. Nothing was changed.'
      });
    }

    const remotePath = remoteFilePath(safe.filename);

    const result = await withSftp(async client => {
      const exists = await client.exists(remotePath);
      if (!exists) {
        return {
          status: 'skipped',
          reason: 'Photo file was not found on GoDaddy storage.'
        };
      }

      const stat = await client.stat(remotePath);
      const originalBytes = Number(stat.size || 0);

      if (!originalBytes) {
        return {
          status: 'skipped',
          reason: 'Photo file is empty.'
        };
      }

      if (originalBytes <= ONE_MB) {
        return {
          status: 'already-small',
          originalBytes,
          storedBytes: originalBytes,
          savedBytes: 0
        };
      }

      const original = await client.get(remotePath);
      if (!Buffer.isBuffer(original) || original.length !== originalBytes) {
        throw new Error('Could not safely read the complete original photo.');
      }

      const optimized = await optimizeImageBuffer(original, safe.extension);
      if (!optimized?.buffer?.length) {
        throw new Error('Could not create an optimized photo.');
      }

      if (optimized.buffer.length >= original.length) {
        return {
          status: 'unchanged',
          originalBytes,
          storedBytes: originalBytes,
          savedBytes: 0,
          reason: 'Optimization would not make this photo smaller.'
        };
      }

      await replaceRemoteFileSafely(client, remotePath, optimized.buffer);

      return {
        status: 'optimized',
        originalBytes,
        storedBytes: optimized.buffer.length,
        savedBytes: originalBytes - optimized.buffer.length,
        reachedUnderOneMb: optimized.buffer.length <= ONE_MB,
        maxDimension: optimized.dimension,
        quality: optimized.quality
      };
    });

    return res.status(200).json({
      ok: true,
      photo_id: photoId,
      filename: row.filename,
      ...result
    });
  } catch (error) {
    console.error('Existing photo optimization error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to optimize this photo. The original was left in place whenever possible.'
    });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
