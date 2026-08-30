USE vera;

ALTER TABLE vera_music_requests
ADD COLUMN youtube_url VARCHAR(1000) NULL AFTER artist_name;
