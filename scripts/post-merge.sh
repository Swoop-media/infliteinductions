#!/usr/bin/env bash
set -euo pipefail

# Post-merge setup: sync dependencies after a task merge.
# Note: database schema changes are applied manually in the Supabase SQL
# editor (see app/migrations/), so no migration step runs here.

pnpm install --prefer-offline
