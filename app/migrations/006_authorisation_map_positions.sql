-- Migration: Create authorisation_map_positions table
-- Date: 2026-06-13
-- Description: Stores manually-arranged (dragged) positions for authorisations on the
--              Connected Authorisation Map ("Map" tab). When a saved position exists
--              for an authorisation it overrides the automatic tree layout. Positions
--              are global x/y coordinates in the diagram's coordinate space.

CREATE TABLE IF NOT EXISTS authorisation_map_positions (
  authorisation_id UUID PRIMARY KEY REFERENCES authorisations(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Access is performed exclusively through the Supabase admin (service role) client
-- in the Admin pages/routes, so enable RLS with no public policies to deny direct
-- client access by default.
ALTER TABLE authorisation_map_positions ENABLE ROW LEVEL SECURITY;
