# Current VeraPachamanca Database

Current database: GoDaddy MySQL / MariaDB database `vera`.

Run these files individually in DBeaver:

1. `01_CREATE_MYSQL_STRUCTURE.sql` — creates the five current tables, indexes, foreign keys, and display-name triggers.
2. `02_LOAD_2026_EVENTS_MYSQL.sql` — loads the current reunion events used by the Volunteers page.

The previous PostgreSQL/Supabase scripts were moved to `docs/old-postgres/` only for reference.
