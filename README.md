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

## User identification

Family members do not type a username or password.

- `login.html` loads all active rows from `vera_users`.
- The visitor selects their name from a dropdown.
- `/api/login` creates a persistent row in `vera_sessions`.
- The session remains active until logout, manual revocation, account disablement, or browser cookie removal.
- Adding/removing/disabling users in MySQL automatically changes the dropdown; no website recoding is required.
- `password_text` is now legacy/optional and is not read by the website.

## Volunteers

`volunteers.html` is available to anyone who has entered the family access code.

Visitors can:

- View volunteers
- Add a volunteer
- Edit a volunteer
- Delete a volunteer

Volunteer records are stored in `vera_event_volunteers`.

Run `database/02_LOAD_2026_EVENTS_MYSQL.sql` once so the volunteer page has the current 2026 events to choose from.

## Server connection settings

This project intentionally stores the GoDaddy MySQL/SFTP settings in `lib/credentials.js` per the project owner's instruction.

## API routes

- `/api/health` — test MySQL connection
- `/api/users` — active family-member dropdown list
- `/api/login` — select a family member and create a persistent session
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
