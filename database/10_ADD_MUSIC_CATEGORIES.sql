USE vera;

CREATE TABLE vera_music_categories (
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
  ('Motown / Soul', 90);

ALTER TABLE vera_music_requests
ADD COLUMN category_id INT UNSIGNED NULL AFTER artist_name;

CREATE INDEX idx_music_requests_category_id
ON vera_music_requests (category_id);

ALTER TABLE vera_music_requests
ADD CONSTRAINT fk_music_requests_category
FOREIGN KEY (category_id) REFERENCES vera_music_categories(category_id)
ON UPDATE CASCADE ON DELETE SET NULL;

-- Add another category later with a statement like this:
-- INSERT INTO vera_music_categories (category_name, display_order) VALUES ('Country', 100);
