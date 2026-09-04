const crypto = require('crypto');
const credentials = require('./credentials');
const { withSftp } = require('./sftp');

const ENDPOINT_VERSION = 'vera-video-direct-v1';
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const RECOMMENDED_CHUNK_BYTES = 8 * 1024 * 1024;
const MIN_CHUNK_BYTES = 1 * 1024 * 1024;
const GRANT_TTL_SECONDS = 12 * 60 * 60;

// Server-only shared secret. It is never returned to the browser.
const VIDEO_UPLOAD_SECRET = '2e0978c8d9c1c5f1e99a36fd6b9f3fe90d68ed4552697b1d66bae61ccbe8e027';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getEndpointLocation() {
  const mediaPath = trimTrailingSlash(credentials.sftp.remotePath);
  const publicBaseUrl = trimTrailingSlash(credentials.sftp.publicBaseUrl);
  const remoteSuffix = '/images/veras';
  const urlSuffix = '/images/veras';

  if (!mediaPath.endsWith(remoteSuffix) || !publicBaseUrl.endsWith(urlSuffix)) {
    throw new Error('GoDaddy media path does not match the expected /images/veras layout.');
  }

  return {
    remotePath: `${mediaPath.slice(0, -remoteSuffix.length)}/vera-video-upload.php`,
    publicUrl: `${publicBaseUrl.slice(0, -urlSuffix.length)}/vera-video-upload.php`
  };
}

function createToken(filename, totalBytes, expires) {
  return crypto
    .createHmac('sha256', VIDEO_UPLOAD_SECRET)
    .update(`${filename}|${totalBytes}|${expires}`)
    .digest('hex');
}

function createVideoUploadGrant(filename, totalBytes) {
  const total = Number(totalBytes);
  if (!Number.isInteger(total) || total <= 0 || total > MAX_VIDEO_BYTES) {
    throw new Error('Invalid video size for direct upload.');
  }
  const expires = Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS;
  const { publicUrl } = getEndpointLocation();
  return {
    url: publicUrl,
    token: createToken(filename, total, expires),
    expires,
    chunkBytes: RECOMMENDED_CHUNK_BYTES,
    minChunkBytes: MIN_CHUNK_BYTES
  };
}

function buildPhpSource() {
  const secret = VIDEO_UPLOAD_SECRET;
  const version = ENDPOINT_VERSION;
  const maxVideoBytes = MAX_VIDEO_BYTES;
  const maxChunkBytes = RECOMMENDED_CHUNK_BYTES;

  return `<?php
// ${version} -- installed automatically by VeraPachamanca's Vercel API.
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
@set_time_limit(180);

$allowedOrigins = [
    'https://verapachamanca.com',
    'https://www.verapachamanca.com',
    'https://verapachamanca.vercel.app'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$originAllowed = $origin === '' || in_array($origin, $allowedOrigins, true);
if ($origin !== '' && $originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}

function vera_json(int $status, array $payload): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if (!$originAllowed) vera_json(403, ['ok' => false, 'error' => 'Origin not allowed.']);
    http_response_code(204);
    exit;
}

$mediaDir = __DIR__ . '/images/veras';
$secret = '${secret}';
$version = '${version}';
$maxVideoBytes = ${maxVideoBytes};
$maxChunkBytes = ${maxChunkBytes};
$action = (string)($_GET['action'] ?? '');

if ($action === 'health') {
    vera_json(200, [
        'ok' => true,
        'version' => $version,
        'writable' => is_dir($mediaDir) && is_writable($mediaDir),
        'maxChunkBytes' => $maxChunkBytes
    ]);
}

if (!$originAllowed) vera_json(403, ['ok' => false, 'error' => 'Origin not allowed.']);

$filename = basename((string)($_GET['filename'] ?? ''));
$totalBytes = (int)($_GET['totalBytes'] ?? 0);
$expires = (int)($_GET['expires'] ?? 0);
$token = strtolower((string)($_GET['token'] ?? ''));

if (!preg_match('/^vera-video-\\d+-[0-9a-f-]{36}\\.(mp4|mov|webm|m4v)$/i', $filename)) {
    vera_json(400, ['ok' => false, 'error' => 'Invalid video filename.']);
}
if ($totalBytes <= 0 || $totalBytes > $maxVideoBytes) {
    vera_json(400, ['ok' => false, 'error' => 'Invalid total video size.']);
}
if ($expires < time()) {
    vera_json(403, ['ok' => false, 'error' => 'Upload authorization expired.']);
}
if ($expires > time() + (24 * 60 * 60)) {
    vera_json(403, ['ok' => false, 'error' => 'Invalid upload authorization expiration.']);
}
$expectedToken = hash_hmac('sha256', $filename . '|' . $totalBytes . '|' . $expires, $secret);
if (strlen($token) !== 64 || !hash_equals($expectedToken, $token)) {
    vera_json(403, ['ok' => false, 'error' => 'Invalid upload authorization.']);
}

$targetPath = $mediaDir . '/' . $filename;

if ($action === 'status') {
    clearstatcache(true, $targetPath);
    $exists = is_file($targetPath);
    vera_json(200, [
        'ok' => true,
        'exists' => $exists,
        'size' => $exists ? (int)filesize($targetPath) : 0
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    vera_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

if ($action === 'abort') {
    if (is_file($targetPath) && !@unlink($targetPath)) {
        vera_json(500, ['ok' => false, 'error' => 'Could not remove the partial video.']);
    }
    vera_json(200, ['ok' => true]);
}

if ($action !== 'chunk') {
    vera_json(400, ['ok' => false, 'error' => 'Invalid video upload action.']);
}

$offset = (int)($_GET['offset'] ?? -1);
$declaredChunkBytes = (int)($_GET['chunkBytes'] ?? 0);
$reportedContentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
$contentLength = $reportedContentLength > 0 ? $reportedContentLength : $declaredChunkBytes;
if ($offset < 0) vera_json(400, ['ok' => false, 'error' => 'Invalid chunk offset.']);
if ($declaredChunkBytes <= 0) vera_json(400, ['ok' => false, 'error' => 'Missing video chunk size.']);
if ($reportedContentLength > 0 && $reportedContentLength !== $declaredChunkBytes) {
    vera_json(400, ['ok' => false, 'error' => 'Video chunk length header does not match the declared chunk size.']);
}
if ($contentLength <= 0) vera_json(400, ['ok' => false, 'error' => 'Empty video chunk.']);
if ($contentLength > $maxChunkBytes) {
    vera_json(413, ['ok' => false, 'error' => 'Video chunk is too large.', 'maxChunkBytes' => $maxChunkBytes]);
}
if ($offset + $contentLength > $totalBytes) {
    vera_json(400, ['ok' => false, 'error' => 'Video chunk exceeds declared file size.']);
}
if (!is_dir($mediaDir) || !is_writable($mediaDir)) {
    vera_json(500, ['ok' => false, 'error' => 'GoDaddy video folder is not writable.']);
}

$input = @fopen('php://input', 'rb');
if (!$input) vera_json(500, ['ok' => false, 'error' => 'Could not read the incoming video chunk.']);
$fp = @fopen($targetPath, 'c+b');
if (!$fp) {
    fclose($input);
    vera_json(500, ['ok' => false, 'error' => 'Could not open the GoDaddy video file for writing.']);
}

if (!flock($fp, LOCK_EX)) {
    fclose($input);
    fclose($fp);
    vera_json(503, ['ok' => false, 'error' => 'Could not lock the video file. Please retry.']);
}

fseek($fp, 0, SEEK_END);
$currentSize = (int)ftell($fp);
$expectedAfter = $offset + $contentLength;

// Safe retry: if this exact chunk already completed, acknowledge it again.
if ($currentSize === $expectedAfter) {
    flock($fp, LOCK_UN);
    fclose($input);
    fclose($fp);
    vera_json(200, ['ok' => true, 'receivedThrough' => $expectedAfter, 'duplicate' => true]);
}

// If a prior connection died midway through this chunk, roll back only that partial chunk.
if ($currentSize > $offset && $currentSize < $expectedAfter) {
    if (!ftruncate($fp, $offset)) {
        flock($fp, LOCK_UN);
        fclose($input);
        fclose($fp);
        vera_json(500, ['ok' => false, 'error' => 'Could not recover a partial video chunk.']);
    }
    $currentSize = $offset;
}

if ($currentSize !== $offset) {
    flock($fp, LOCK_UN);
    fclose($input);
    fclose($fp);
    vera_json(409, [
        'ok' => false,
        'error' => 'Video chunks are out of order.',
        'expectedOffset' => $currentSize,
        'receivedOffset' => $offset
    ]);
}

if (fseek($fp, $offset, SEEK_SET) !== 0) {
    flock($fp, LOCK_UN);
    fclose($input);
    fclose($fp);
    vera_json(500, ['ok' => false, 'error' => 'Could not seek to the video chunk offset.']);
}

$written = 0;
$failed = false;
while (!feof($input) && $written < $contentLength) {
    $remaining = $contentLength - $written;
    $buffer = fread($input, min(1048576, $remaining));
    if ($buffer === false) { $failed = true; break; }
    if ($buffer === '') {
        if (feof($input)) break;
        usleep(1000);
        continue;
    }
    $length = strlen($buffer);
    $position = 0;
    while ($position < $length) {
        $result = fwrite($fp, substr($buffer, $position));
        if ($result === false || $result === 0) { $failed = true; break 2; }
        $position += $result;
        $written += $result;
    }
}

// If the request body contains more bytes than declared, reject and roll back this chunk.
if (!$failed && $written === $contentLength && !feof($input)) {
    $extra = fread($input, 1);
    if ($extra !== false && $extra !== '') $failed = true;
}

fflush($fp);

if ($failed || $written !== $contentLength) {
    ftruncate($fp, $offset);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($input);
    fclose($fp);
    vera_json(500, [
        'ok' => false,
        'error' => 'Video chunk write was incomplete; the partial chunk was rolled back.',
        'written' => $written,
        'expected' => $contentLength
    ]);
}

flock($fp, LOCK_UN);
fclose($input);
fclose($fp);
clearstatcache(true, $targetPath);
$finalSize = is_file($targetPath) ? (int)filesize($targetPath) : -1;
if ($finalSize !== $expectedAfter) {
    vera_json(500, [
        'ok' => false,
        'error' => 'Video chunk size verification failed.',
        'expectedSize' => $expectedAfter,
        'actualSize' => $finalSize
    ]);
}

vera_json(200, [
    'ok' => true,
    'receivedThrough' => $expectedAfter,
    'complete' => $expectedAfter === $totalBytes
]);
`;
}

async function fetchEndpointHealth() {
  const { publicUrl } = getEndpointLocation();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${publicUrl}?action=health&v=${encodeURIComponent(ENDPOINT_VERSION)}&t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) {
      throw new Error(`GoDaddy video endpoint returned HTTP ${response.status}: ${data.error || raw.slice(0, 200) || 'no details'}`);
    }
    if (data.version !== ENDPOINT_VERSION) throw new Error('GoDaddy video endpoint version is outdated.');
    if (!data.writable) throw new Error('GoDaddy video folder is not writable.');
    if (Number(data.maxChunkBytes) < RECOMMENDED_CHUNK_BYTES) throw new Error('GoDaddy video endpoint reports an invalid chunk limit.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

let endpointVerifiedAt = 0;

async function ensureVideoUploadEndpoint() {
  if (Date.now() - endpointVerifiedAt < 5 * 60 * 1000) {
    return { ...getEndpointLocation(), maxChunkBytes: RECOMMENDED_CHUNK_BYTES };
  }

  try {
    await fetchEndpointHealth();
    endpointVerifiedAt = Date.now();
    return { ...getEndpointLocation(), maxChunkBytes: RECOMMENDED_CHUNK_BYTES };
  } catch (_) {
    // Install/refresh below, then verify over HTTPS.
  }

  const { remotePath } = getEndpointLocation();
  const source = Buffer.from(buildPhpSource(), 'utf8');
  await withSftp(async client => {
    const tempPath = `${remotePath}.tmp-${crypto.randomUUID()}`;
    try {
      await client.put(source, tempPath);
      const existing = await client.exists(remotePath);
      if (existing) await client.delete(remotePath);
      await client.rename(tempPath, remotePath);
    } catch (error) {
      await client.delete(tempPath).catch(() => {});
      throw error;
    }
  });

  await fetchEndpointHealth();
  endpointVerifiedAt = Date.now();
  return { ...getEndpointLocation(), maxChunkBytes: RECOMMENDED_CHUNK_BYTES };
}

async function getDirectVideoStatus(filename, totalBytes) {
  await ensureVideoUploadEndpoint();
  const grant = createVideoUploadGrant(filename, totalBytes);
  const params = new URLSearchParams({
    action: 'status',
    filename,
    totalBytes: String(totalBytes),
    expires: String(grant.expires),
    token: grant.token
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${grant.url}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) {
      throw new Error(`GoDaddy video verification returned HTTP ${response.status}: ${data.error || raw.slice(0, 200) || 'no details'}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ENDPOINT_VERSION,
  MAX_VIDEO_BYTES,
  RECOMMENDED_CHUNK_BYTES,
  MIN_CHUNK_BYTES,
  buildPhpSource,
  createVideoUploadGrant,
  ensureVideoUploadEndpoint,
  getDirectVideoStatus,
  // Exported only for automated validation; not used by browser code.
  _test: { createToken, getEndpointLocation }
};
