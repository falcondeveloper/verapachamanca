/*
  VeraPachamanca - SIMPLE TEST

  There are no stored procedures to test.
  This uses normal INSERT / SELECT / DELETE commands only.
*/

-- 1. Expected: exactly 4 Vera tables.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vera_%'
ORDER BY table_name;

-- 2. Expected: ZERO custom Vera functions.
SELECT p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'vera_fn_%'
ORDER BY p.proname;

-- 3. Clean up a previous test if one exists.
DELETE FROM vera_users
WHERE email = 'vera-test@example.invalid';

-- 4. Create a temporary user with a readable password.
INSERT INTO vera_users (email, display_name, password_text, is_admin)
VALUES ('vera-test@example.invalid', 'Test User', 'test123', FALSE);

-- Expected: one row showing password_text = test123.
SELECT user_id, email, display_name, password_text, is_admin, is_active
FROM vera_users
WHERE email = 'vera-test@example.invalid';

-- 5. Simulate login using the same simple query Next.js will use.
-- Expected: one row.
SELECT user_id, email, display_name, is_admin
FROM vera_users
WHERE email = 'vera-test@example.invalid'
  AND password_text = 'test123'
  AND is_active = TRUE;

-- 6. Create a simple persistent session.
INSERT INTO vera_sessions (user_id, session_token)
SELECT user_id, 'test-session-token-12345'
FROM vera_users
WHERE email = 'vera-test@example.invalid';

-- 7. Simulate checking the session cookie.
-- Expected: one row.
SELECT u.user_id, u.email, u.display_name, u.is_admin
FROM vera_sessions s
JOIN vera_users u ON u.user_id = s.user_id
WHERE s.session_token = 'test-session-token-12345'
  AND u.is_active = TRUE;

-- 8. Logout = delete the session.
DELETE FROM vera_sessions
WHERE session_token = 'test-session-token-12345';

-- Expected: ZERO rows.
SELECT *
FROM vera_sessions
WHERE session_token = 'test-session-token-12345';

-- 9. Remove the temporary test account.
DELETE FROM vera_users
WHERE email = 'vera-test@example.invalid';

-- Expected: ZERO rows.
SELECT *
FROM vera_users
WHERE email = 'vera-test@example.invalid';
