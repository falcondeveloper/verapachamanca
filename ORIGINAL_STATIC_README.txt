/*
  VeraPachamanca - EASY ADMIN COMMANDS
  Copy the command you need, change the example values, and run it.
*/

-- SEE ALL USERS AND THEIR PASSWORDS
SELECT user_id, email, display_name, password_text, is_admin, is_active
FROM vera_users
ORDER BY display_name;

-- CHANGE A PASSWORD
UPDATE vera_users
SET password_text = 'new-password'
WHERE email = 'person@example.com';

-- CHANGE A NAME
UPDATE vera_users
SET display_name = 'New Name'
WHERE email = 'person@example.com';

-- DISABLE AN ACCOUNT
UPDATE vera_users
SET is_active = FALSE
WHERE email = 'person@example.com';

-- RE-ENABLE AN ACCOUNT
UPDATE vera_users
SET is_active = TRUE
WHERE email = 'person@example.com';

-- FORCE A USER TO LOG IN AGAIN
DELETE FROM vera_sessions
WHERE user_id = (
    SELECT user_id FROM vera_users WHERE email = 'person@example.com'
);

-- ADD AN EVENT
INSERT INTO vera_events (event_date, event_time, title, description, location, sort_order)
VALUES ('2027-07-17', '6:00 PM', 'Family Dinner', 'Dinner for the Vera family.', 'Main Pavilion', 1);

-- SEE THE PUBLIC CALENDAR
SELECT event_id, event_date, event_time, title, description, location
FROM vera_events
WHERE is_visible = TRUE
ORDER BY event_date, sort_order, event_id;

-- HIDE AN EVENT WITHOUT DELETING IT
UPDATE vera_events
SET is_visible = FALSE
WHERE event_id = 1;

-- SEE ALL PHOTOS
SELECT photo_id, photo_year, submitted_for, caption, image_url, is_visible, uploaded_at
FROM vera_photos
ORDER BY uploaded_at DESC;

-- HIDE A PHOTO WITHOUT DELETING IT
UPDATE vera_photos
SET is_visible = FALSE
WHERE photo_id = 1;
