VERAPACHAMANCA - KISS DATABASE
==============================

THIS IS THE SIMPLE VERSION.

It has only 4 tables:

1. vera_users
   The few people who are allowed to log in.
   Passwords are stored in plain text in password_text.

2. vera_sessions
   Keeps a person logged in.
   The browser gets a session token and the same token is stored here.
   There is no expiration date. Logout simply deletes the session row.

3. vera_events
   Reunion calendar events.

4. vera_photos
   Uploaded photo information and the image URL.

There are:
- NO Vera database functions
- NO Vera triggers
- NO pgcrypto dependency
- NO citext dependency
- NO password hashing
- NO session hashing
- NO audit tables
- NO login-attempt tables
- NO schema-version tables
- NO page-content tables
- NO navigation tables
- NO announcement tables

PUBLIC WEBSITE
--------------
The public site does not need a login. Anyone can view normal pages,
calendar events and visible photos.

Login is only used for upload/admin features.

HOW LOGIN WILL WORK IN NEXT.JS
------------------------------
1. User enters email + password.
2. Next.js runs:

   SELECT user_id, email, display_name, is_admin
   FROM vera_users
   WHERE email = $1
     AND password_text = $2
     AND is_active = TRUE;

3. If a row is returned, Next.js creates a long random session token using
   Node.js's built-in crypto library. No extra authentication package is needed.

4. Next.js stores that token in vera_sessions and in a persistent HttpOnly
   browser cookie.

5. To check whether somebody is logged in, Next.js runs:

   SELECT u.user_id, u.email, u.display_name, u.is_admin
   FROM vera_sessions s
   JOIN vera_users u ON u.user_id = s.user_id
   WHERE s.session_token = $1
     AND u.is_active = TRUE;

6. Logout simply deletes the matching vera_sessions row.

INSTALLATION ORDER
------------------
Run these files in DBeaver in this order:

1. 00_DELETE_OLD_VERA_DATABASE.sql
2. 01_CREATE_SIMPLE_DATABASE.sql
3. 03_TEST_DATABASE.sql
4. Edit and run 02_CREATE_FIRST_ADMIN.sql

04_EASY_ADMIN_COMMANDS.sql is a reference file for common changes.

IMPORTANT
---------
00_DELETE_OLD_VERA_DATABASE.sql permanently deletes all existing vera_ tables
and their data. Use it only when you are intentionally replacing the old design.

The cleanup script leaves Supabase/PostgreSQL extensions alone. This database
DOES NOT USE pgcrypto or citext, but dropping shared extensions could break
something unrelated in the same database.
