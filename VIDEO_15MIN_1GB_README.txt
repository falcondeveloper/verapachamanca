VeraPachamanca — 15 minute / 1 GB video limit

Built from the current tested direct-GoDaddy video uploader.

Replace only:
- upload.html
- js/upload.js
- api/upload-photo.js
- lib/video-direct.js

New limits:
- Maximum duration: 15 minutes / 900 seconds
- Maximum size: 1 GiB / 1,073,741,824 bytes

Why lib/video-direct.js changes:
The GoDaddy PHP endpoint itself had the old 500 MB hard limit. Its endpoint version is bumped
from v1 to v2, forcing the existing automatic installer to refresh the GoDaddy PHP endpoint.
The health check now also verifies the deployed endpoint's maxVideoBytes before any video begins.

Photos are unchanged:
- 30 MB photo limit
- 512 KB photo chunks
- same GoDaddy/Vercel photo path
- same server-side resizing
- same database behavior

No SQL changes.
No gallery changes.
