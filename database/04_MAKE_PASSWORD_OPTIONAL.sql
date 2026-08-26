-- VeraPachamanca login simplification
-- Run once on an existing database if password_text is currently NOT NULL.
-- Existing password values are left untouched, but the site no longer reads them.
USE vera;

ALTER TABLE vera_users
    MODIFY password_text TEXT NULL;
