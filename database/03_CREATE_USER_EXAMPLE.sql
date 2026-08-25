-- Example: create a VeraPachamanca user in MySQL.
-- Replace the sample values before running.
USE vera;

INSERT INTO vera_users
(username, password_text, display_name, email, birthday, marital_status, city_born, is_admin, is_active)
VALUES
('sampleuser', 'sample-password', NULL, NULL, NULL, NULL, NULL, 0, 1);

-- Because display_name is NULL, the trigger should set it to username.
SELECT user_id, username, display_name, email, is_admin, is_active
FROM vera_users
WHERE username = 'sampleuser';
