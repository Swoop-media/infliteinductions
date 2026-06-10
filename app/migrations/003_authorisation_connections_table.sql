-- Migration: Create authorisation_connections table
-- Date: 2026-06-10
-- Description: Define which authorisations are associated/connected with one another
--              (e.g. "Sigma Tandem Instructor" relates to "High Altitude"). Connections
--              are bidirectional: a single row links two authorisations and is read from
--              either side. Used to highlight related authorisations on the pending
--              authorisation review screen and managed via the Admin "Connected
--              Authorisation Map" page.

-- Create authorisation_connections table
CREATE TABLE IF NOT EXISTS authorisation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorisation_id_a UUID NOT NULL REFERENCES authorisations(id) ON DELETE CASCADE,
  authorisation_id_b UUID NOT NULL REFERENCES authorisations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Guard against linking an authorisation to itself
  CONSTRAINT authorisation_connections_no_self_link CHECK (authorisation_id_a <> authorisation_id_b)
);

-- Guard against duplicate pairs regardless of the order they were inserted in
-- (A↔B and B↔A are treated as the same connection).
CREATE UNIQUE INDEX IF NOT EXISTS authorisation_connections_unique_pair
  ON authorisation_connections (
    LEAST(authorisation_id_a, authorisation_id_b),
    GREATEST(authorisation_id_a, authorisation_id_b)
  );

-- Helpful indexes for reading connections from either side
CREATE INDEX IF NOT EXISTS authorisation_connections_a_idx
  ON authorisation_connections (authorisation_id_a);
CREATE INDEX IF NOT EXISTS authorisation_connections_b_idx
  ON authorisation_connections (authorisation_id_b);

-- Access is performed exclusively through the Supabase admin (service role) client
-- in the Admin pages/routes, so enable RLS with no public policies to deny direct
-- client access by default.
ALTER TABLE authorisation_connections ENABLE ROW LEVEL SECURITY;
