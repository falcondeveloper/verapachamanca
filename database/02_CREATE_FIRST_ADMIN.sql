/*
  Change the three values below, then run this once.
  Keep the email lowercase.
*/

INSERT INTO vera_users (
    email,
    display_name,
    password_text,
    is_admin
)
VALUES (
    'your-email@example.com',
    'Clark',
    'your-password-here',
    TRUE
);

-- Confirm the account and see the stored password.
SELECT user_id, email, display_name, password_text, is_admin, is_active
FROM vera_users
ORDER BY user_id;
