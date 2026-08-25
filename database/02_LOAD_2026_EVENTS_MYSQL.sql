-- VeraPachamanca 2026 event seed for MySQL/MariaDB
-- Run once after the 5-table structure exists.
USE vera;

DELETE FROM vera_events
WHERE event_date BETWEEN '2026-09-04' AND '2026-09-07';

INSERT INTO vera_events
(event_date, start_time, end_time, title, location, description, is_optional, display_order, is_active)
VALUES
('2026-09-04', '16:30:00', NULL, 'Informal Welcome Get-Together', 'New Terrain Brewing, Golden', 'Informal family welcome and get-together.', 0, 10, 1),

('2026-09-05', '11:00:00', NULL, 'Potluck Picnic', 'Arapahoe Park, Golden', 'Potluck picnic with extended family and friends.', 0, 10, 1),
('2026-09-05', '12:30:00', NULL, 'Soccer Games / Super Silly Classico', 'Arapahoe Park, Golden', 'Two soccer games, including the Super Silly Classico with costumes and made-up rules.', 0, 20, 1),
('2026-09-05', NULL, NULL, 'Optional Bike Ride Around Golden', 'Golden, Colorado', 'Optional bike ride after the picnic and soccer games.', 1, 30, 1),
('2026-09-05', NULL, NULL, 'Optional Evening at Canyon Tavern', 'Canyon Tavern', 'Optional evening gathering near Pete''s cabin and nearby family rentals.', 1, 40, 1),

('2026-09-06', '14:00:00', NULL, 'Official Reunion at Pete''s Cabin', 'Pete''s Cabin', 'Hangout, onsite grilling, Peruvian dinner, games, slideshow, karaoke, 70s disco theme, and the uncles'' sideburn contest.', 0, 10, 1),

('2026-09-07', NULL, NULL, 'Optional Tubing, Brunch or Leftovers', 'Golden, Colorado', 'Nothing officially planned. Family members may choose tubing, brunch, or leftovers.', 1, 10, 1);

SELECT event_id, event_date, start_time, title, location, is_optional
FROM vera_events
WHERE event_date BETWEEN '2026-09-04' AND '2026-09-07'
ORDER BY event_date, display_order, event_id;
