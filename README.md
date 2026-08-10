# VeraPachamanca

Simple family reunion website.

## Stack

- HTML
- CSS
- Vanilla JavaScript
- GitHub for source control
- Vercel for hosting and small API functions
- PostgreSQL on Supabase for data
- Supabase Storage bucket `vera-photos` for new user-uploaded photos

No React and no frontend framework are required.

## Repository layout

- `index.html`, other `.html` files — website pages
- `css/` — existing site styles
- `js/` — existing browser JavaScript
- `images/` — existing site and historical images
- `database/` — current KISS PostgreSQL scripts; excluded from Vercel deployment
- `docs/` — original prototype notes; excluded from Vercel deployment
- `api/` — will be added when login, calendar, and photo upload APIs are connected

## Images

Existing site images stay in `images/` and deploy with the website.

New photos uploaded by family members will go to the public Supabase Storage bucket:

`vera-photos`

The `vera_photos` PostgreSQL table will store the image URL plus simple metadata such as year, caption, and uploader.

## Vercel deployment

Import this GitHub repository into Vercel.

Use:

- Framework Preset: `Other`
- Build Command: leave blank
- Output Directory: `.`

The website files are already at the repository root, so no Root Directory change is needed.

## Database

The current database is intentionally simple:

- `vera_users`
- `vera_sessions`
- `vera_events`
- `vera_photos`

There are no Vera custom database functions, triggers, or required extensions.

## Secrets

Do not put database passwords, Supabase service keys, or other secrets in HTML or browser JavaScript. When the API is connected, secrets will be stored as Vercel Environment Variables.
