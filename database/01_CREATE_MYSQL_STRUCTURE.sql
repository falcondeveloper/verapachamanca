-- ============================================================
-- VeraPachamanca - KISS MySQL Database Structure
-- Database: vera
-- One-file install for GoDaddy MySQL
-- ============================================================

USE vera;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS vera_users (
    user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    password_text TEXT NOT NULL,
    display_name VARCHAR(150) NULL,
    email VARCHAR(190) NULL,
    birthday DATE NULL,
    marital_status VARCHAR(30) NULL,
    city_born VARCHAR(100) NULL,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),
    UNIQUE KEY uq_vera_users_username (username),
    KEY idx_vera_users_email (email),
    KEY idx_vera_users_active (is_active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. SESSIONS
-- No automatic expiration.
-- ============================================================
CREATE TABLE IF NOT EXISTS vera_sessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    PRIMARY KEY (session_id),
    UNIQUE KEY uq_vera_sessions_token (session_token),
    KEY idx_vera_sessions_user_active (user_id, is_active),

    CONSTRAINT fk_vera_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES vera_users (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS vera_events (
    event_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_date DATE NOT NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    title VARCHAR(200) NOT NULL,
    location VARCHAR(255) NULL,
    description TEXT NULL,
    is_optional TINYINT(1) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (event_id),
    KEY idx_vera_events_date_order (event_date, display_order),
    KEY idx_vera_events_active (is_active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4. PHOTOS
-- Image files live on GoDaddy.
-- MySQL stores only the file information.
-- ============================================================
CREATE TABLE IF NOT EXISTS vera_photos (
    photo_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uploaded_by_user_id INT UNSIGNED NULL,
    filename VARCHAR(255) NOT NULL,
    image_url VARCHAR(1000) NOT NULL,
    photo_year SMALLINT UNSIGNED NULL,
    caption TEXT NULL,
    family_member_name VARCHAR(150) NULL,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    PRIMARY KEY (photo_id),
    KEY idx_vera_photos_user (uploaded_by_user_id),
    KEY idx_vera_photos_year_active (photo_year, is_active),

    CONSTRAINT fk_vera_photos_user
        FOREIGN KEY (uploaded_by_user_id)
        REFERENCES vera_users (user_id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5. EVENT VOLUNTEERS
-- A volunteer does NOT need a login account.
-- ============================================================
CREATE TABLE IF NOT EXISTS vera_event_volunteers (
    volunteer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL,
    volunteer_name VARCHAR(150) NOT NULL,
    email VARCHAR(190) NULL,
    phone VARCHAR(40) NULL,
    volunteer_role VARCHAR(150) NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (volunteer_id),
    KEY idx_vera_volunteers_event (event_id),
    KEY idx_vera_volunteers_user (user_id),

    CONSTRAINT fk_vera_volunteers_event
        FOREIGN KEY (event_id)
        REFERENCES vera_events (event_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_vera_volunteers_user
        FOREIGN KEY (user_id)
        REFERENCES vera_users (user_id)
        ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- DISPLAY NAME DEFAULT
-- If display_name is NULL or blank, use username.
--
-- These are single-statement triggers so DBeaver does NOT need
-- DELIMITER commands or BEGIN/END blocks.
-- ============================================================
DROP TRIGGER IF EXISTS vera_users_before_insert;
DROP TRIGGER IF EXISTS vera_users_before_update;

CREATE TRIGGER vera_users_before_insert
BEFORE INSERT ON vera_users
FOR EACH ROW
SET NEW.display_name =
    IF(NEW.display_name IS NULL OR TRIM(NEW.display_name) = '',
       NEW.username,
       NEW.display_name);

CREATE TRIGGER vera_users_before_update
BEFORE UPDATE ON vera_users
FOR EACH ROW
SET NEW.display_name =
    IF(NEW.display_name IS NULL OR TRIM(NEW.display_name) = '',
       NEW.username,
       NEW.display_name);


-- ============================================================
-- VERIFICATION
-- Expected: 5 rows
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'vera'
  AND table_name IN (
      'vera_users',
      'vera_sessions',
      'vera_events',
      'vera_photos',
      'vera_event_volunteers'
  )
ORDER BY table_name;

-- Expected: 2 rows
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'vera'
  AND trigger_name IN (
      'vera_users_before_insert',
      'vera_users_before_update'
  )
ORDER BY trigger_name;


-- ============================================================
-- SMALL FUNCTIONAL TEST
-- Tests display_name default without leaving test data.
-- Expected display_name: __vera_test_user__
-- ============================================================
START TRANSACTION;

INSERT INTO vera_users (
    username,
    password_text,
    display_name
)
VALUES (
    '__vera_test_user__',
    'test',
    NULL
);

SELECT username, display_name
FROM vera_users
WHERE username = '__vera_test_user__';

ROLLBACK;

-- ============================================================
-- END
-- ============================================================
