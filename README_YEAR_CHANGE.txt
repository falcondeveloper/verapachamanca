VeraPachamanca year option update

Based on the latest GitHub ZIP supplied on 2026-09-03.

Changes:
- New uploads no longer offer "Before 1980".
- Upload year choices are every year from the current year down through 1980,
  followed by 1970, 1960, and 1950.
- The upload API accepts 1970, 1960, and 1950 as the older decade buckets.
- Existing legacy database items with photo_year=0 are NOT changed automatically.
- When editing a legacy photo, "Before 1980 (legacy)" appears only for that
  existing item so it can be reassigned to 1980/1970/1960/1950.
- Gallery editing supports the new older decade choices.
- No SQL change is required.

Replace these files in GitHub:
upload.html
gallery.html
js/upload.js
js/gallery-live.js
js/main.js
api/upload-photo.js
