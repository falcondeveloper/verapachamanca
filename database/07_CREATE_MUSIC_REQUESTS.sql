USE vera;

CREATE TABLE IF NOT EXISTS vera_music_categories (
  category_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 999,
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_music_category_name (category_name),
  KEY idx_music_category_order (display_order, category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO vera_music_categories (category_name, display_order) VALUES
  ('Latin Dance', 10),
  ('Peruvian', 20),
  ('Classic Rock', 30),
  ('Karaoke', 40),
  ('Dance/Disco', 50),
  ('Rock', 60),
  ('Easy Listening', 70),
  ('Oldies / 50s & 60s', 80),
  ('Motown / Soul', 90)
ON DUPLICATE KEY UPDATE display_order = VALUES(display_order);

CREATE TABLE IF NOT EXISTS vera_music_requests (
  request_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_name VARCHAR(255) NOT NULL,
  artist_name VARCHAR(255) NULL,
  category_id INT UNSIGNED NULL,
  youtube_url VARCHAR(1000) NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  KEY idx_music_requests_song_name (song_name),
  KEY idx_music_requests_display_order (display_order, request_id),
  KEY idx_music_requests_category_id (category_id),
  CONSTRAINT fk_music_requests_category FOREIGN KEY (category_id)
    REFERENCES vera_music_categories(category_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
