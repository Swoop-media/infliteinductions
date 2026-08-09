# Overview

INFLITE Induction & Training is a comprehensive Learning Management System (LMS) designed for company-wide inductions, training programs, and authorizations. It supports various user roles, structured learning workflows, and integrates both digital and onsite training components. The platform aims to streamline corporate training and compliance, ensuring efficient management of training content, user progress, and certification processes.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **State Management**: React hooks, server components
- **Authentication**: Microsoft OAuth (Azure MSAL)

## Backend
- **API Layer**: Next.js API routes (App Router & Pages Router)
- **Authentication**: Supabase Auth with Microsoft OAuth
- **Session Management**: Supabase middleware for cookie-based sessions
- **File Uploads**: Server Actions (64MB limit)
- **Microsoft Teams Integration**: Bot Framework SDK

## Data Storage
- **Primary Database**: Supabase (PostgreSQL) with Row Level Security (RLS). Supabase Admin Client used for admin pages to bypass RLS.
- **File Storage**: Supabase Storage
- **Database Functions**: PostgreSQL triggers and functions
- **Real-time Features**: Supabase Realtime for live notifications

## Authentication and Authorization
- **SSO**: Microsoft Azure AD
- **Role-Based Access Control**: Multi-tier roles (Admin, Trainers, Course Creators, General)
- **Session Security**: Secure cookie-based sessions
- **API Security**: RLS at database level
- **Teams Bot Authentication**: Azure Bot Service credentials
- **Dual Authentication**: Supports Microsoft OAuth for internal users and email/password for external users.

## Core Features & Design Patterns
- **Hybrid Rendering**: Server-side rendering for performance, client-side for interactivity.
- **Authorization Expiry**: Calculates expiry based on the earliest of document, course, or authorization validity.
- **Notification System**: In-app and Microsoft Teams notifications for events like course assignment, rejections, expiry reminders, and pending approvals, managed by scheduled jobs. Authorization approvals and rejections are also posted to two Teams channels via incoming webhooks (`TEAMS_WEBHOOK_CHANNEL_1`, `TEAMS_WEBHOOK_CHANNEL_2`) using Adaptive Cards (`lib/teams/channel-webhook.ts`). Issue reports submitted via the "Report Issue" button are posted as an Adaptive Card to a dedicated Teams channel webhook (`TEAMS_WEBHOOK_REPORT_ISSUE`) — no per-user proactive bot message or per-admin in-app notification is sent.
- **Stranded Upload Sweep**: Shared sweep logic in `lib/document-sweep.ts` (24h+ safety window, `learner_documents` reference check, fail-closed) used by the manual admin page (`/app/admin/tools/document-sweep` → `/api/admin/document-sweep`) and the scheduled cron endpoint `POST /api/cron/document-sweep` (Bearer `CRON_SECRET`, `TRAINING_SYNC_SECRET` accepted as fallback). Scheduled via the daily `/api/notifications/run-all` orchestrator, which forwards to the sweep on Sundays (UTC) only — i.e. weekly — or any day with `{ forceDocumentSweep: true }`. Live cron runs notify Admin/Senior Management via `document_sweep_report` notifications when files are deleted or errors occur; quiet runs are only logged.
- **Admin Diagnostic Tools**: Production-ready and RLS-secured tools for diagnosing authorization and document visibility issues (`/app/admin/diagnose-authorizations`, `/app/admin/diagnose-documents`).
- **UI/UX Decisions**:
    - Learner interface focuses on content delivery with minimal distractions.
    - Compact navigation sidebar (w-56/224px) and reduced padding (p-4) for optimized content space.
    - PowerPoint files are blocked with guidance to convert to PDF.
    - Multi-photo document capture combines images into a single PDF using jsPDF.
    - Tabbed interfaces (e.g., `app/train-assess`) use lazy rendering and batch processing.
    - Expandable course details with PDF export.
    - Paginated admin views (50 items/page) for efficient data display with smart ordering.
    - Site-based assignment UI for user management (profiles linked to sites table via site_id).
    - Collapsible sections in user edit pages for improved organization.
- **Form Resubmission & Reassessment**: When a learner resubmits an equipment form on a completed course, the system resets assessment progress, moves the course back to the assessment area, and notifies all onsite assessors via Teams and in-app notifications (`/api/courses/[courseId]/form-resubmission`).
- **Document Replacement & Retention**: Uploading a new document never deletes the old one — `upsert_learner_document` marks the previous row `status='replaced'` (file kept in storage). Replaced documents are excluded (NULL-safe `.or("status.is.null,status.neq.replaced")`) from all active views, expiry notifications/reports, and the authorisation expiry calculation, and are shown with a "Replaced" badge in the Expired Documents section (admin user edit page) and an "Old documents" section (learner My Documents page).
- **Responsible Person Approval Notification**: When a pending authorisation is approved, the Responsible Person listed on the authorisation (`authorisations.responsible_person`) receives an in-app notification and Teams bot DM (`notif_type` value `authorisation_approved_responsible`) including who approved it, authorisation title, expiry date, learner name, and any restrictions/comments. Migration `app/migrations/011_add_responsible_person_approval_notification_type.sql` must be applied manually in Supabase; until then the in-app insert fails silently but the Teams DM still sends. Notification failures never block the approval flow.
- **Operations Notices Feature**: Allows creators to publish assignable notices with optional acknowledgement tracking, integrated with in-app and Teams notifications.
- **Quiz Review by Onsite Trainer/Assessor**: Creators can tick "Reviewable by onsite trainer/assessor" in quiz settings (`quizzes.reviewable_onsite`). When on, the Train/Assess onsite course view shows a Quiz Review card with the learner's latest attempt answers (correct/incorrect highlighted) and a per-reviewer comments box saved to `quiz_onsite_reviews` (unique per quiz/learner/reviewer, deny-all RLS, service-role writes with server-side trainer/assessor checks). Comments also appear read-only on the admin authorisation review page. Archived learners excluded. Migration `app/migrations/009_quiz_onsite_review.sql` applied manually in Supabase; code degrades gracefully until then.
- **Course Peer Review Walkthrough**: Reviewers (Course Creators/Senior management/Admin) open a course via `?review=1` (creator page "Peer review" button), which unlocks all modules like preview but also allows full quiz answering (no progress writes) and shows complete onsite requirement checklists. A floating panel records reviewer name, date, and notes to `course_peer_reviews` (append-only, service-role only access; migration `app/migrations/007_course_peer_reviews.sql` applied manually in Supabase). History is shown under the creator course Details tab. No approval workflow or notifications.
- **In-App Video Hosting**: Creators can upload video files (MP4/WebM/MOV, up to 2GB) directly on a video block in the module editor (`VideoUploadField`), uploaded straight to Supabase Storage (`course-files/module-videos/...`) via signed upload URLs (`uploadType: 'video'`). The block URL is set to `/app/files/<path>`; `UnifiedVideoPlayer` plays such URLs (and direct video-file URLs) in a native `<video>` tag. `/app/files` 302-redirects video extensions to a 1-hour Supabase signed URL for Range/seek streaming. SharePoint "Anyone" share links are streamed through `/api/sharepoint-video` (auth required, host-validated redirects) into a native player, with fallback to the iframe embed flow. Note: the Supabase project's Storage upload size limit must be raised in the Supabase dashboard (default 50MB) to allow large video uploads.
- **SafeFLITE User Sync Webhook**: Integrates with SafeFLITE to sync user data upon creation, update, or archiving.
- **Archived User Visibility**: Users archived via `/app/admin/users/archived` (`profiles.archived_at IS NOT NULL`) are kept in the database for record-keeping but excluded from active admin views and notifications. Filtering is applied in: Due Dates - Courses, Due Dates - Authorisations, Due Dates - Documents, Course Progress, Pending Authorisations (`app/admin/page.tsx`), and the daily admin expiry report Teams bot summaries (`/api/notifications/daily-admin-report`). Restoring a user via the archived page re-includes them automatically.

# External Dependencies

- **Microsoft Teams**: Bot Framework for notifications and messaging.
- **Azure Active Directory**: Enterprise authentication and user management.
- **SharePoint**: Video content embedding.
- **Supabase**: Backend-as-a-Service for database, authentication, and storage.
- **Microsoft Graph API**: User profile and organizational data access.
- **SafeFLITE**: External system for user data synchronization via webhook.