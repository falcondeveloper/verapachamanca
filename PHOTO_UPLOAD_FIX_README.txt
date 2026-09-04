VeraPachamanca PHOTO UPLOAD FIX

Replace only:
- upload.html
- js/main.js

Cause fixed:
An obsolete design-prototype uploader in js/main.js was intercepting the real uploader.
It created the wrong preview card, left the real uploader at 0 items ready, and showed:
"Design preview only. The API and storage upload will be connected after approval."

The obsolete uploader has been removed. js/upload.js remains the only owner of photo/video selection and upload.

Preserved:
- GoDaddy photo/video upload
- 512 KB chunk/retry logic
- server photo resizing
- 1980-present + 1970/1960/1950 year choices
- gallery/video changes are untouched
- no SQL changes
