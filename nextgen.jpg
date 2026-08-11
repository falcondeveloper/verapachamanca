/*
  VeraPachamanca - KISS DATABASE

  4 tables.
  0 custom functions.
  0 triggers.
  0 extensions required.
  Plain-text passwords.
  Plain-text session tokens.

  The public website does NOT require login.
  Login is only for photo upload/admin functions.
*/

CREATE TABLE vera_users (
    user_id       BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_text TEXT NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vera_sessions (
    session_id    BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES vera_users(user_id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vera_events (
    event_id      BIGSERIAL PRIMARY KEY,
    event_date    DATE NOT NULL,
    event_time    TEXT,
    title         TEXT NOT NULL,
    description   TEXT,
    location      TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_visible    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vera_photos (
    photo_id            BIGSERIAL PRIMARY KEY,
    uploaded_by_user_id BIGINT REFERENCES vera_users(user_id) ON DELETE SET NULL,
    photo_year          TEXT,
    submitted_for       TEXT,
    caption             TEXT,
    image_url           TEXT NOT NULL,
    is_visible          BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Show the four tables that were created.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vera_%'
ORDER BY table_name;
