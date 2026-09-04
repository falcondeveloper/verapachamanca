VeraPachamanca — 10 minute video upload limit

Replace only:
- upload.html
- js/upload.js
- api/upload-photo.js

Changes:
- Video duration limit: 600 seconds (10 minutes)
- Video file size limit: 500 MB
- Keeps photo limit at 30 MB
- Keeps 512 KB upload chunks and retry logic for Android reliability
- Keeps GoDaddy storage
- Keeps 1950 / 1960 / 1970 / 1980+ year options
- No database change
- No gallery/video playback change

Important:
A 10-minute high-bitrate or 4K phone video can exceed 500 MB.
Those files will still be rejected by design. MP4/H.264 at a normal phone/web bitrate is preferred.
