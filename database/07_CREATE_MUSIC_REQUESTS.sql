USE vera;

CREATE TABLE IF NOT EXISTS vera_music_requests (
  request_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_name VARCHAR(255) NOT NULL,
  artist_name VARCHAR(255) NULL,
  youtube_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  INDEX idx_music_requests_song_name (song_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
