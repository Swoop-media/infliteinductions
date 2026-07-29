-- 012: Content audit log for courses & authorisations + disable "published" notification triggers
-- Run this in the Supabase SQL editor.

-- 1) Audit table for course/authorisation changes.
CREATE TABLE IF NOT EXISTS public.content_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,              -- 'course' | 'authorisation'
  entity_id uuid,
  entity_name text,
  action text NOT NULL,                   -- 'created' | 'duplicated' | 'updated' | 'status_changed'
  actor_id uuid,
  actor_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { changes: { field: { from, to } }, ... }
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_audit_log_created_at
  ON public.content_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_audit_log_entity
  ON public.content_audit_log (entity_type, entity_id);

-- Deny-all RLS: reads/writes only via the service-role client.
ALTER TABLE public.content_audit_log ENABLE ROW LEVEL SECURITY;

-- 2) Drop the DB triggers that fan out course_published / authorisation_published
--    notifications to every user. (These triggers live only in the DB, not the repo,
--    so we discover them by inspecting trigger function bodies.)
DO $$
DECLARE
  trg record;
BEGIN
  FOR trg IN
    SELECT t.tgname, c.relname, p.oid AS fnoid, p.proname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname IN ('courses', 'authorisations')
      AND NOT t.tgisinternal
      AND (
        pg_get_functiondef(p.oid) ILIKE '%course_published%'
        OR pg_get_functiondef(p.oid) ILIKE '%authorisation_published%'
        OR pg_get_functiondef(p.oid) ILIKE '%authorization_published%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trg.tgname, trg.relname);
    RAISE NOTICE 'Dropped trigger % on %', trg.tgname, trg.relname;
    -- Drop the trigger function too if nothing else uses it.
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid = trg.fnoid AND NOT tgisinternal)
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.refobjid = trg.fnoid AND d.deptype = 'n') THEN
      -- No remaining triggers and no other normal dependencies: safe plain drop (no CASCADE).
      EXECUTE format('DROP FUNCTION IF EXISTS public.%I()', trg.proname);
      RAISE NOTICE 'Dropped function %', trg.proname;
    END IF;
  END LOOP;
END $$;

-- 3) Clean up the existing publish-notification spam.
DELETE FROM public.notifications
WHERE type::text IN ('course_published', 'authorisation_published', 'authorization_published');
