/*
  VeraPachamanca - DELETE OLD VERA DATABASE OBJECTS

  WARNING:
  This removes ALL tables, views and custom functions in the public schema
  whose names start with vera_ or vera_fn_. All data in those tables is deleted.

  It intentionally does NOT remove PostgreSQL/Supabase extensions such as
  pgcrypto or citext. The new VeraPachamanca database does not use them.
*/

-- Remove any Vera views first.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
          AND table_name LIKE 'vera_%'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.table_name);
    END LOOP;
END $$;

-- Remove any Vera materialized views.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT matviewname
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname LIKE 'vera_%'
    LOOP
        EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.matviewname);
    END LOOP;
END $$;

-- Remove every old Vera table. CASCADE also removes its triggers and indexes.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'vera_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
    END LOOP;
END $$;

-- Remove any old Vera functions/procedures that are still present.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS signature,
               p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname LIKE 'vera_fn_%'
    LOOP
        IF r.prokind = 'p' THEN
            EXECUTE 'DROP PROCEDURE IF EXISTS ' || r.signature || ' CASCADE';
        ELSE
            EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
        END IF;
    END LOOP;
END $$;

-- Show what remains. Both queries should return ZERO rows.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'vera_%'
ORDER BY table_name;

SELECT p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'vera_fn_%'
ORDER BY p.proname;
