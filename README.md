# VeraPachamanca

Simple family reunion website.

## Stack

- HTML
- CSS
- Vanilla JavaScript
- GitHub for source control
- Vercel for hosting and small Node.js API functions
- GoDaddy MySQL / MariaDB for users, sessions, events, photos, and volunteers
- GoDaddy SFTP/web storage for uploaded family photos

No React and no frontend framework.

## Family access gate

Every normal page loads `js/site-access.js`.

Family access code: `1517`

After the correct code is entered, the browser keeps a one-year cookie named:

`vera_family_access`

`robots.txt`, page-level `noindex`, and Vercel `X-Robots-Tag` headers are also included to discourage search-engine crawling/indexing.

This family code is a simple privacy gate, not high-security authentication.

## User login

User accounts are stored in `vera_users`.

- Admin creates accounts.
- Passwords are stored in `password_text` as required by this project.
- Users can login and logout.
- Users cannot register.
- Users cannot change/reset their own password.
- Password changes are handled manually by Clark.
- `vera_sessions` keeps users logged in with no normal expiration.

## Volunteers

`volunteers.html` is available to anyone who has entered the family access code.

Visitors can:

- View volunteers
- Add a volunteer
- Edit a volunteer
- Delete a volunteer

Volunteer records are stored in `vera_event_volunteers`.

Run `database/02_LOAD_2026_EVENTS_MYSQL.sql` once so the volunteer page has the current 2026 events to choose from.

## Vercel environment variables

Add these in Vercel Project Settings → Environment Variables:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `SITE_ACCESS_CODE` = `1517`

Do not put the MySQL password in browser JavaScript or GitHub source.

## API routes

- `/api/health` — test MySQL connection
- `/api/login` — login
- `/api/session` — current logged-in user
- `/api/logout` — logout
- `/api/events` — active events
- `/api/volunteers` — list/add/edit/delete volunteers

## Dependency versions

Verified against the npm package listing on 2026-08-25:

- Node.js: 22.x
- mysql2: 3.24.2 (exact version pinned in `package.json`)

## Deployment

Vercel preset: `Other`

Website files remain at the repository root. Vercel automatically recognizes `/api/*.js` as Node.js functions.
