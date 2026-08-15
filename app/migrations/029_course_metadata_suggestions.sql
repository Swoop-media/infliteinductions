-- Migration 029: course_metadata_suggestions
-- Stores the last AI/extractive title+description+tags suggestion generated
-- for a course, together with a hash of the course content corpus at the
-- time of generation. The Details tab compares the stored hash against the
-- current corpus hash to flag "content changed since description written".
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.course_metadata_suggestions (
    course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
    content_hash text NOT NULL,
    suggested_title text NOT NULL,
    suggested_description text NOT NULL,
    suggested_tags text[] NOT NULL DEFAULT '{}',
    source text NOT NULL DEFAULT 'extractive'
        CHECK (source IN ('ai', 'extractive')),
    model text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role only access: enable RLS with no policies so browser clients
-- cannot read or write suggestions directly (same pattern as other
-- admin-only tables).
ALTER TABLE public.course_metadata_suggestions ENABLE ROW LEVEL SECURITY;
