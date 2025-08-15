# Phase 1 — Course Creation (Unified Modules)

This doc summarizes the schema changes, app changes, and test steps for the Phase 1 course‑creation flow.

---

## What changed (DB)

### Tables & columns
- **public.course_modules**
  - Ensured columns exist:
    - `order_index int not null default 0`
    - `config jsonb not null default '{}'`
    - `stage course_stage not null default 'draft'::course_stage`
  - Notes: `stage` uses the `course_stage` enum.

- **public.module_content_blocks**
  - Still references `module_id uuid` → `public.course_modules(id)` (cascade).
  - RLS policies updated later to reference `course_modules`.

- **public.courses**
  - Previously added (from earlier phases, recap here for context):
    - `created_by uuid`
    - `status course_status` (or text with check) — **published/draft/etc**
    - Optional fields that the page **can** use if present:
      - `valid_until date`
      - `retake_reminder_days int`
      - `notification_lead_days int`

### Enums
- **course_stage** must include `'draft'`.
  - If missing, add with:
    ```sql
    alter type course_stage add value if not exists 'draft';
    ```

### Safe SQL snippets used
- Ensure `config` exists:
  ```sql
  alter table public.course_modules
    add column if not exists config jsonb not null default '{}';
