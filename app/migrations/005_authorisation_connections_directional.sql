-- Migration: Make authorisation_connections directional
-- Date: 2026-06-13
-- Description: Connections were previously bidirectional (a single row A↔B was read
--              from either side). They are now directional: a row means
--              authorisation_id_a (the selected authorisation) is connected TO
--              authorisation_id_b. When reviewing authorisation X, only the
--              authorisations chosen FOR X (rows where authorisation_id_a = X) are
--              shown. A and B may each connect to the other independently (two rows),
--              which renders as two arrows on the Connection Map.

-- Drop the old order-independent unique index (treated A↔B and B↔A as duplicates).
DROP INDEX IF EXISTS authorisation_connections_unique_pair;

-- Enforce uniqueness on the directed pair so the same A→B cannot be added twice,
-- while still allowing the reverse B→A as a separate connection.
CREATE UNIQUE INDEX IF NOT EXISTS authorisation_connections_unique_directed_pair
  ON authorisation_connections (authorisation_id_a, authorisation_id_b);
