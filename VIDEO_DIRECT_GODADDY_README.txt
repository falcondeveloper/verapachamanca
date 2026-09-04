VeraPachamanca — DIRECT GODADDY VIDEO UPLOADER
Built from the CURRENT modified uploader (10-minute / 500 MB limit + detailed errors).

REPLACE / ADD ONLY THESE LIVE FILES IN GITHUB:
1. upload.html
2. js/upload.js
3. api/upload-photo.js
4. lib/video-direct.js   <-- NEW FILE

NO SQL CHANGE.
NO package.json CHANGE.
NO gallery change.
NO js/main.js change.
NO photo-processing change.

WHAT CHANGES
- PHOTOS remain on the existing working 512 KB browser -> Vercel -> SFTP -> GoDaddy path.
- VIDEOS no longer send every chunk through Vercel/SFTP.
- At video-start, Vercel verifies the GoDaddy PHP endpoint. If it is missing or outdated,
  Vercel installs/refreshes it once using the EXISTING GoDaddy SFTP connection.
- Only after the endpoint passes its HTTPS health check does Vercel authorize the browser upload.
- The browser then sends video chunks DIRECTLY to GoDaddy over HTTPS.
- Normal video chunk size is 8 MB. If a server/network limit rejects or times out a chunk,
  the browser automatically falls back to 4 MB, then 2 MB, then 1 MB.
- The existing queue remains sequential: Video 1 finishes, then Video 2, then Video 3.
- At finish, Vercel verifies the completed video size through the GoDaddy HTTP endpoint and
  then inserts the existing vera_photos database row.

RELIABILITY BEHAVIOR
- Retry of an already-completed chunk is idempotent: it is acknowledged without growing the file.
- If a connection dies halfway through a chunk, the GoDaddy endpoint rolls back only that partial
  chunk and accepts the retry at the same offset.
- Out-of-order chunks are rejected with the actual expected offset.
- Invalid/expired upload authorization is rejected.
- Errors identify the direct GoDaddy stage and HTTP status instead of only saying "Failed to fetch."
- A failed upload attempts direct cleanup and retains the existing Vercel/SFTP abort as fallback.

VIDEO LIMITS
- Maximum duration: 600 seconds / 10 minutes.
- Maximum file size: 500 MB.
- MP4 remains recommended.

PHOTO REGRESSION PROTECTION
The photo path is intentionally kept at 512 KB chunks. The new direct endpoint is selected only
when mediaType === "video". Automated tests verified a 1.25 MB JPEG-shaped test payload still used
exactly 512 KB, 512 KB, and 256 KB chunks through /api/upload-photo and never used the direct video endpoint.

FIRST PRODUCTION TEST
After Vercel deploys, select 3 videos and upload them together. The first video-start may take a few
extra seconds because the API may install/verify vera-video-upload.php on GoDaddy. After that, the
status should say "Uploading video directly to GoDaddy..." and the three files should process one at a time.
