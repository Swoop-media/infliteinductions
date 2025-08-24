# PROJECT_NOTES

Training Platform – Engineering Notes / Quick Reference

---

## Overview

A Next.js + Supabase training platform with:
- Creator tools for building courses & modules
- Learner-facing course player
- Admin panel for enrolment approvals and role management
- Onsite training/assessment workflows

This document is the single source of truth for stack, schema, routes, and conventions.

---

## Stack

- **Next.js** 15.4.6 (App Router, TypeScript)
- **Supabase** (Postgres, RLS, Storage, Realtime)
- **Tailwind-like utility classes**
- **Auth** via Supabase
  - Server helper: `@/lib/supabase/server`
  - Browser helper: `@/lib/supabase/client`
- Role helper: `@/lib/roles` with `hasRole()`

---

## Key Tables & Enums

### courses
id uuid PK
title text
description text
status enum('draft'|'published'|'archived')
valid_for_months int null
retake_reminder_days int null
notification_lead_days int null
department text null
tags text[] default '{}'
created_at timestamptz
updated_at timestamptz
created_by uuid null

shell
Copy
Edit

### course_modules
id uuid PK
course_id uuid FK courses.id
type enum('digital_training'|'digital_assessment_quiz'|'onsite_training'|'onsite_assessment')
title text
order_index int
created_at timestamptz

markdown
Copy
Edit
> Ordering: `order_index` is per-type inside a course. In the learner player we **globally** sort by TYPE_ORDER:
`digital_training → digital_assessment_quiz → onsite_training → onsite_assessment`, then `order_index`, then `id`.

### module_content_blocks
id uuid PK
module_id uuid FK course_modules.id
kind enum('rich_text'|'link'|'video_embed'|'file'|'request_document')
data jsonb
order_index int
created_at timestamptz

shell
Copy
Edit

### course_assignments
id uuid PK
course_id uuid
user_id uuid
role text -- 'trainee' | 'onsite_trainer' | 'onsite_assessor'
created_at timestamptz
created_by uuid null
UNIQUE (course_id, user_id, role)

shell
Copy
Edit

### onsite_requirements
id uuid PK
module_id uuid
role text -- 'onsite_trainer' | 'onsite_assessor' (legacy 'trainer'|'assessor' accepted)
label text
field_type text -- 'checkbox'|'select'|'text'|'date'|'rating'
options jsonb not null default '[]' -- always send [] if empty
required boolean
order_index int
help_text text
created_at timestamptz

shell
Copy
Edit

### onsite_requirement_responses
id uuid PK
module_id uuid
learner_id uuid
requirement_id uuid
value jsonb
author_id uuid
created_at timestamptz

shell
Copy
Edit

### course_enrolments
id uuid PK
course_id uuid
user_id uuid
status enum('pending'|'approved'|'in_progress'|'completed'|'rejected'|'cancelled')
approved_by uuid null
created_at timestamptz
updated_at timestamptz

shell
Copy
Edit

### roles / user_roles
roles: id uuid, name text, description text
user_roles: user_id uuid, role_id uuid, granted_at timestamptz default now(), granted_by uuid null
UNIQUE (user_id, role_id)

markdown
Copy
Edit

---

## RPC / Triggers (Canonical)

- `assign_course_user(p_course_id, p_user_id, p_role, p_created_by)`  
  Upserts into `course_assignments` on `(course_id, user_id, role)`.

- **Seed default modules** (DB trigger on `courses`): inserts 3 modules  
  `digital_training`, `onsite_training`, `onsite_assessment` with sequential `order_index`.  
  *(UI does not seed; DB is source of truth.)*

- **Enrolment lifecycle**
  - AFTER INSERT on `course_enrolments`: notify Admin/Trainers of `enrolment_request`.
  - AFTER UPDATE on `course_enrolments`: if `status` becomes `approved`, notify learner; also upsert `course_assignments` (role `trainee`) via `trg_enrolment_approved_assign`.
  - If `status` in (`cancelled`,`rejected`), remove `course_assignments` for that learner/course/role=trainee.

> **Disable** legacy triggers that duplicate the above to avoid constraint conflicts.

---

## Routes & Pages (Key)

### Creator
- `app/app/creator/page.tsx` – list of Courses & Authorisations; delete flows with confirmation pages and `?ok` banners.
- `app/app/creator/courses/[id]/page.tsx` – editor with tabs
  - **Tabs**: Details, Digital Training, Digital Assessment (Quiz), Onsite Training, Onsite Assessment, Assignments
  - Details: department, tags, valid_for_months, notifications.
  - Assignments: uses RPC `assign_course_user`.
- `app/app/creator/modules/[id]/page.tsx` – digital training content editor (rich text, links, video, files).
- `app/app/creator/modules/[id]/onsite/page.tsx` – onsite trainer/assessor requirements CRUD.

### Admin
- `app/app/admin/page.tsx` – tabs: Enrolments, Users & Roles
  - Approve enrolments → POST `/app/app/admin/enrolments/approve`
  - Roles grant/revoke → POST `/app/app/admin/users/roles/grant|revoke`
  - Self-lockout guard: cannot remove your own Admin role.

### Learner
- **Catalogue**: `app/app/courses/page.tsx`
  - shows only `courses.status = 'published'`
  - enrol button reflects `approved|in_progress` as “Enrolled”; `pending` shows “Requested”
  - POST `/app/courses/enrol` inserts `course_enrolments(status='pending')`
- **Player (single-step)**: `app/app/learn/courses/[id]/page.tsx`
  - `?preview=1` unlocks everything, no progress writes
  - **Global sort** by TYPE_ORDER then `order_index`
  - One module per page (`?step=N`), with **Previous** and **Next**
  - Hitting **Next** writes progress to `module_progress` (idempotent) then advances
  - Digital training blocks support:
    - Rich text (sanitized)
    - Link (opens new tab)
    - **Video embed (YouTube/Vimeo/OneDrive/SharePoint)** – see “Video Embeds” below
    - File (inline image preview; otherwise download link)
  - Request document blocks: upload to private bucket, insert `learner_documents`, then auto-advance
- **Quiz**: `app/app/learn/quiz/[moduleId]/page.tsx`
  - Starts or reuses attempt via `start_quiz_attempt_for_current_user`
  - Saves answers, submits, grades via `submit_and_grade_attempt`

---

## Course Player Behavior (Learner)

- **Sorting / Order**
  1. `digital_training` (in creator-defined order)
  2. `digital_assessment_quiz`
  3. `onsite_training`
  4. `onsite_assessment`

- **Navigation**
  - One step per page (`?step=N`)
  - **Next** button:
    - Writes progress (unless preview)
    - Redirects to the next step
  - **Previous** never writes; just navigates back

- **Locking**
  - Non-preview mode: a step unlocks only if all previous steps are complete
  - Preview mode unlocks everything

---

## Video Embeds (YouTube, Vimeo, OneDrive/SharePoint)

- **Creator UX**: creators can paste either a **plain URL** *or* a full `<iframe ...>` embed code into a “Video embed” block.
- The renderer extracts the `src` if an iframe is pasted and normalizes to an embeddable URL.

### Supported
- **YouTube**: `watch?v=…`, `youtu.be/...`, `shorts/...` → `https://www.youtube.com/embed/<id>`
- **Vimeo**: `https://vimeo.com/<id>` → `https://player.vimeo.com/video/<id>`
- **OneDrive / SharePoint**
  - Either paste SharePoint’s **Embed** URL (starts with `/sites/.../_layouts/15/embed.aspx?...`)
  - Or paste the full iframe code and we’ll extract the `src`
  - Make sure the file/stream is set to **“Anyone with the link can view”** (or the exact audience you need)

---

## Realtime & Enrol Button

- `CourseEnrolButton` (client) subscribes to changes on `course_enrolments` for the current user:
  - Shows **Requested** when `pending`
  - Shows **Enrolled** for `approved`/`in_progress`
  - Otherwise shows **Enrol** (POSTs to `/app/courses/enrol`)

---

## Conventions

- Server actions / route handlers:
  - Do auth/role checks server-side
  - Redirect with `?ok=` or `?error=` banners (no revalidate during SSR render)
- `searchParams` in server components:
  - Type as `Promise<Record<string,string|string[]|undefined>>` and `await` it
- No nested `<form>` elements
- Role names (case-insensitive) expected in `roles.name`:
  - `Admin`, `Trainers and Assessors`, `Course Creators`, `Senior Management`, `General`

---

## Known Gotchas

- 405 on `/delete` → ensure you have a GET confirmation page (`/delete/page.tsx`) and the POST performer at `/delete/perform/route.ts` (don’t put `route.ts` directly in `/delete/`).
- Enum mismatches:
  - `course_enrolments.status` must use `'pending'|'approved'|'in_progress'|'completed'|'rejected'|'cancelled'`.
- Onsite requirements: `options` is **NOT NULL**; always send `[]` if blank.
- Duplicate triggers can double-insert → keep only the canonical ones above.

---

## RLS Notes (high-level)

- Learners: read their own enrolments/progress, submit documents, view published courses
- Creators: CRUD courses/modules/blocks for org
- Trainers/Assessors: onsite requirement responses, notes
- Admin: enrolment approvals, role management

*(Exact policies depend on your org rules; keep this section aligned with your Supabase policies.)*

---

## Environment

- Optional emails: `RESEND_API_KEY`
- Supabase keys/env expected by your `@/lib/supabase/*` helpers
- Next.js App Router with server actions enabled

---

## Paths Touched Recently

app/app/creator/page.tsx
app/app/creator/courses/[id]/page.tsx
app/app/creator/courses/[id]/delete/page.tsx
app/app/creator/courses/[id]/delete/perform/route.ts
app/app/admin/page.tsx
app/app/admin/enrolments/approve/route.ts
app/app/admin/users/roles/grant/route.ts
app/app/admin/users/roles/revoke/route.ts
app/app/creator/modules/[id]/onsite/page.tsx
app/app/learn/courses/[id]/page.tsx
app/app/learn/quiz/[moduleId]/page.tsx
app/app/courses/page.tsx
app/app/courses/enrol/route.ts

yaml
Copy
Edit

---

## How to Start a New Chat Smoothly

1. Paste this entire **PROJECT_NOTES** as your first message.
2. Then describe what you want next (e.g. “add file preview to training block”).
3. If your DB schema differs, paste your actual table DDL so we can align the code.

---

## Testing Checklist (Smoke)

1. Learner requests enrolment → Admin sees **pending**, button shows **Requested**.
2. Admin approves → learner sees **Enrolled**, can open player.
3. Player ordering is: digital training → quiz → onsite training → onsite assessment.
4. Next button writes progress (non-preview) and advances to next step.
5. Digital training blocks:
   - Rich text renders
   - Links open in new tab
   - Video embed works (YouTube/Vimeo/OneDrive); iframe paste is accepted
   - File blocks:
     - Images render inline (png/jpg/jpeg/gif/webp/svg/avif)
     - Other files show a download link (signed URL)
6. Request Document:
   - Upload stores to private bucket
   - learner_documents row inserted
   - Auto-advances to next step
7. Quiz starts & submits; grading RPC returns score without errors.

---

## Open TODOs / Next Features

- Drag-and-drop module ordering & module delete (creator UX)
- Onsite notes: file uploads for attachments
- Archive flow for courses (when FK delete blocks)
- Notification emails on key events
- RLS review/expansion for new tables