VeraPachamanca — real upload error reporting

Replace only:
- upload.html
- js/upload.js

NO backend, storage, database, photo-processing, or video-limit changes.

What is improved:
- "Failed to fetch" is no longer shown by itself.
- Errors identify the exact stage: START, CHUNK, or FINALIZE.
- Chunk failures report chunk number/total and MB transferred/total.
- HTTP errors report the actual HTTP status and server response text.
- If Vercel returns an x-vercel-id, it is shown in the error.
- Browser/network failures explicitly say that NO HTTP RESPONSE was received.
- Normal 4xx rejections are not uselessly retried four times.
- Existing 512 KB chunk size, GoDaddy SFTP flow, photo resizing, 10-minute/500 MB
  video limits, and all photo upload behavior are unchanged.

Example:
FAILED — reunion.mp4: video chunk 37/184 (18.5 MB of 91.8 MB):
server returned HTTP 500. SFTP connection timed out | Vercel request ...

or:
FAILED — reunion.mp4: Starting video "reunion.mp4":
no HTTP response was received from /api/upload-photo. Failed to fetch.
