# Phase 1 – Course Creation: Schema, Policies, and Build

## Overview
Phase 1 delivers the new unified course creation backend for:
- **Digital training**
- **Digital assessment quizzes**
- **Onsite training**
- **Onsite assessment**

It merges old `modules` into a new `course_modules` model, adds quiz/assignment tables, and links to enrolments.

We also:
- Add Row Level Security (RLS) for course creator/owner/Admin/Senior Management
- Add helper function `app_has_role` for role-based logic
- Auto-create pending enrolments when a trainee is assigned

## Changes
- **`courses`**: add `created_by`, `status`
- **`course_modules`**: unified module type, `config`, ordering, `stage`
- **`module_content_blocks`**: richer per-module content (text, files, videos, links)
- **`quiz_*` tables**: questions, options, answers
- **`course_assignments`**: assign trainees, onsite trainers, onsite assessors
- **`enrolments`**: link learners to courses
- **Policies**: CRUD split by select/insert/update/delete, RLS enforced
- **Helper**: `app_has_role` to support different `user_roles` table shapes

## Build Instructions
1. **Run `sql/phase1_build.sql`** in Supabase SQL Editor
2. Confirm schema is updated in Supabase
3. Deploy frontend changes for:
   - New tab layout (Details / Digital Training / Digital Assessment Quiz / Onsite Training / Onsite Assessment)
   - Module creation using `course_modules`
4. Test course creation and module/quiz assignment flows

## Rollback
If needed, run `sql/phase1_rollback.sql` in Supabase SQL Editor.  
⚠️ **This will drop all new tables and columns. Data loss will occur.**

---

## Changelog

### v1.0 – Initial build
- Added all schema changes
- Added all RLS policies
- Added helper functions
- Added backfill scripts for `stage` and `order_index`

### v1.1 – Bugfixes
- Fixed enum cast for `course_stage`
- Added missing `config` column to `course_modules`
- Corrected policies to use `status::text` to avoid enum mismatch

---

## Related Frontend Files
- `app/app/creator/courses/[id]/page.tsx` (tabs + module creation UI)
- `components/ModuleList.tsx` (module ordering)
- `components/QuizEditor.tsx` (quiz creation)

---

**Author:** _<your name>_  
**Date:** _<today’s date>_
