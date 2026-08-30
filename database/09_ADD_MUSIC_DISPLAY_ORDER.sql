USE vera;

ALTER TABLE vera_music_requests
ADD COLUMN display_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER youtube_url;

SET @music_order := 0;
UPDATE vera_music_requests
SET display_order = (@music_order := @music_order + 1)
ORDER BY song_name ASC, artist_name ASC, request_id ASC;

CREATE INDEX idx_music_requests_display_order
ON vera_music_requests (display_order, request_id);
