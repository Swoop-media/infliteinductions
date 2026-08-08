-- 020: Drop the specific surviving unique index that migration 018 missed.
--
-- Migration 018 dropped constraints (contype='u') and the index named
-- learner_documents_user_id_block_id_key, but an index named
-- idx_learner_documents_unique_active also enforces uniqueness on
-- (user_id, block_id) and was not covered by 018's DROP INDEX statement.
-- That index was blocking the second INSERT in the replace flow.
--
-- Apply in the Supabase SQL editor (see app/migrations/README convention).

DROP INDEX IF EXISTS public.idx_learner_documents_unique_active;
