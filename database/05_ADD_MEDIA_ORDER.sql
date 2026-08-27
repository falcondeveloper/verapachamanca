-- VeraPachamanca: add per-year display order to uploaded media
USE vera;

ALTER TABLE vera_photos
ADD COLUMN order_id INT NOT NULL DEFAULT 0 AFTER photo_year;

-- Preserve the existing order initially.
UPDATE vera_photos
SET order_id = photo_id
WHERE order_id = 0;

CREATE INDEX idx_vera_photos_year_order
ON vera_photos (photo_year, order_id, photo_id);

-- Verification
SELECT photo_id, photo_year, order_id, filename
FROM vera_photos
ORDER BY photo_year DESC, order_id ASC, photo_id ASC;
