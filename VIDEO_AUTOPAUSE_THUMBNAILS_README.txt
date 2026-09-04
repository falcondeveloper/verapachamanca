VeraPachamanca video gallery update

Replace only:
- gallery.html
- js/gallery-live.js

Changes:
1. Keeps the current working GoDaddy video playback fix.
2. Pauses a playing video when it is essentially scrolled off screen.
3. Pauses other videos when a new video starts playing.
4. Pauses videos when the browser tab/app goes into the background.
5. Shows an immediate FAMILY VIDEO poster instead of a blank black box.
6. When a video is on screen or close to the screen, the browser loads only enough
   metadata/data to seek to a frame near the beginning and uses that real frame as
   the thumbnail when possible.
7. Videos far down the page remain preload=none to avoid loading every video at once.
8. No database, upload, storage, or API changes.

The gallery.html script version was changed so browsers do not keep the previous cached JS.
