README
INFLITE LMS (Next.js + Supabase)

Internal training & assessments platform for INFLITE.
Built with Next.js App Router + Supabase (Postgres, Auth, RLS).

Quick Start

Requirements

Node 18+

pnpm / npm / yarn

Supabase project (cloud or local)

Clone & install

git clone <your-repo-url>
cd <repo>
pnpm install    # or npm i / yarn


Environment
Create .env.local with:

NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL=https://training.inflite.nz

# Microsoft Authentication (required)
MICROSOFT_APP_ID=your-app-id
MICROSOFT_APP_PASSWORD=your-app-password
MICROSOFT_APP_TYPE=SingleTenant
MICROSOFT_APP_TENANT_ID=your-tenant-id

# Optional (emails via Resend)
RESEND_API_KEY=YOUR_RESEND_API_KEY

# Teams Bot Integration (optional)
SUPABASE_DB_WEBHOOK_SECRET=your-webhook-secret
SUPABASE_DB_WEBHOOK=your-webhook-hash


SUPABASE_SERVICE_ROLE_KEY is only used server-side; do not expose it on the client.

Run dev

pnpm dev    # or npm run dev / yarn dev


Open: http://localhost:3000

Authentication

The app uses **Microsoft Single Sign-On (SSO)** for authentication:

- **Login Flow**: Users click "Login with Microsoft" → Microsoft OAuth → automatic user/profile creation
- **No Email Confirmation**: Designed for corporate tenants where users may not have external email access
- **Automatic Profile Creation**: Both Supabase auth user and profile are created automatically
- **Session Management**: Uses temporary passwords for reliable session establishment
- **Tenant Restricted**: Only users from your Microsoft tenant can authenticate

Key Auth Files:
- `app/auth/signin/page.tsx` - Login page with Microsoft button
- `app/auth/callback/route.ts` - Handles Microsoft OAuth callback
- `app/auth/confirm/page.tsx` - Establishes authenticated session
- `lib/auth/microsoft.ts` - MSAL configuration

App Structure (high level)
app/
  app/
    layout.tsx                 # Header (Home, Creator, Courses, Admin + Notifications bell)
    home/page.tsx              # Dashboard
    courses/page.tsx           # Catalogue (published only)
    myprofile/page.tsx         # My learning (approved/in_progress) + Completed
    notifications/
      page.tsx                 # List notifications, mark read
      read/route.ts            # POST: mark one read
      mark-all-read/route.ts   # POST: mark all read
    creator/
      page.tsx                 # Tabbed: Courses / Authorisations
      courses/
        new/page.tsx           # Create course (draft)
        [id]/page.tsx          # Course editor tabs
        [id]/delete/page.tsx   # Delete confirm + POST
      authorisations/
        new/page.tsx           # Create authorisation (draft)
        [id]/page.tsx          # Authorisation editor tabs
        [id]/delete/page.tsx   # Delete confirm + POST
    admin/
      page.tsx                 # Tabs: Enrolments / Users & Roles
      enrolments/
        approve/route.ts       # POST: approve enrolment
        revoke/route.ts        # POST: revoke enrolment
      users/
        [id]/page.tsx          # Edit user
        update/route.ts        # POST: save profile
        roles/
          grant/route.ts       # POST: grant role by name
          revoke/route.ts      # POST: revoke role by name
  components/
    CourseEnrolButton.tsx
  lib/
    supabase/
      server.ts                # createSupabaseServer helper
    roles.ts                   # hasRole(name)
    notify.ts                  # (optional) extra notifications/email hook
docs/
  Handover.md                  # Deep handover for new devs/chats

Microsoft Teams Integration

The app includes Microsoft Teams bot integration for proactive notifications:

- **Teams Bot**: Sends course notifications directly to Teams
- **Link Account Flow**: Users can link their Teams account via `/link` command in bot
- **Proactive Messages**: Notifications for enrolment requests, approvals, etc.
- **User Mapping**: Links Microsoft Teams users to app users via `teams_links` table

Teams Tables:
```sql
teams_links(teams_user_id, aad_object_id, user_id, conversation_ref, last_activity, created_at, updated_at)
teams_link_codes(user_id, code, expires_at, created_at)
```

Teams Files:
- `pages/api/teams/bot/messages.ts` - Bot message handler
- `pages/api/teams/link/generate.ts` - Link code generation
- `lib/teams/` - Bot utilities and proactive messaging

Database (must-have tables)

Courses

courses(id, title, description, status['draft'|'published'|'archived'], department, tags[], valid_for_months, retake_reminder_days, notification_lead_days, created_at, updated_at)

course_modules(id, course_id, type text, title, order_index int, created_at)
Unique: (course_id, order_index) uq_course_modules_order

Enrolments & Assignments

course_enrolments(id, user_id, course_id, status enum, approved_by, created_at, updated_at)
Statuses in use: pending, approved, in_progress, completed, rejected, cancelled

course_assignments(course_id, user_id, role['trainee'|'onsite_trainer'|'onsite_assessor'], created_by, assigned_by, assigned_at)
Unique: (course_id, user_id, role)

Authorisations

authorisations(id, title, description, status['draft'|'active'|'archived'], department, tags[], valid_for_months, created_at, updated_at)

authorisation_courses(id, authorisation_id, course_id, order_index)
Unique: (authorisation_id, order_index) and (authorisation_id, course_id)

authorisation_assignments(authorisation_id, user_id, role?, created_by?)

Users & Roles

profiles(id, full_name, email, department?, job_description?)

roles(id, name unique, description?)

user_roles(user_id, role_id, granted_at, granted_by)
PK: (user_id, role_id)

Notifications

notifications(id, recipient_id, type text, payload jsonb, read boolean default false, created_at)

Roles seed (idempotent)
insert into public.roles (name) values
  ('Admin'),
  ('Trainers and Assessors'),
  ('Course Creators'),
  ('Senior Management')
on conflict (name) do nothing;

Triggers & Functions (canonical set)

Keep enabled

trg_seed_course_modules on courses → seeds 3 baseline modules:

digital_training

onsite_training

onsite_assessment

On course_enrolments:

on_enrolment_insert_notify() → notifies Admin + Trainers (enrolment_request)

on_enrolment_update_notify() → when approved → notifies learner (enrolment_approved)

trg_enrolment_approved_assign() → upsert trainee in course_assignments (sets created_by)

remove_assignment_on_cancel() → removes trainee assignment on cancelled|rejected

Disable/remove legacy (avoid duplicates/conflicts)

sync_assignment_on_approval

auto_assign_trainee_on_enrol_approval

trg_course_assignment_enrol

If you hit duplicate key value violates unique constraint "uq_course_modules_order", you’re likely inserting the seeded 3 modules in the UI and the trigger. UI should only insert Quiz (digital_assessment_quiz) if selected.

Notifications UX

Bell in header (server component) shows a red dot when there are unread notifications.

/app/notifications lists items with “Mark read” and “Mark all read”.

Produced by DB triggers for enrolments and server routes for roles (grant/revoke).

Development Tips

Auth/roles: hasRole("Admin"), hasRole("Trainers and Assessors"), hasRole("Course Creators"), hasRole("Senior Management").

Nested forms: don’t nest <form>; split (e.g., Details vs Status).

Revalidate: don’t call revalidatePath during render; only inside server actions.

My Learning filters:

“Enrolled”: status IN ('approved','in_progress')

“Completed”: status = 'completed'

Catalogue: only status='published'.

Common Troubleshooting

Approve enrolment does nothing

Ensure the approve route points to /app/admin/enrolments/approve (POST).

Check trigger trg_enrolment_approved_assign exists and uses created_by := coalesce(NEW.approved_by, auth.uid()).

Learner still “enrolled” after revoke

Revoke route should set status='cancelled' or rejected'.

Trigger remove_assignment_on_cancel must exist/enabled.

Notifications don’t show

Confirm rows appear in notifications for the recipient.

Bell uses unread count; ensure read=false initially and mark read route works.

Duplicate modules on course create

UI must not insert digital_training / onsite_training / onsite_assessment (DB seeds them).

UI may insert digital_assessment_quiz (optional).

Scripts

Add or use these (if you prefer npm/yarn adjust accordingly):

{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}

Deploy

Set env vars on your host (Vercel, Netlify, etc.).

Use Next.js build (next build) then start.

If using Resend, verify from domain and set RESEND_API_KEY.

Git

Conventional commits:

feat: ..., fix: ..., chore: ..., docs: ..., refactor: ..., perf: ..., test: ...

Example:

git add app/app/creator/courses/new/page.tsx
git commit -m "fix(creator): prevent double-seeding modules on course create"
git push

License

Internal use. © INFLITE.

