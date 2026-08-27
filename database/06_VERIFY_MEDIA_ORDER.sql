USE vera;

SELECT
    photo_year,
    photo_id,
    order_id,
    filename,
    media_type
FROM vera_photos
WHERE is_active = 1
ORDER BY photo_year DESC, order_id ASC, photo_id ASC;
