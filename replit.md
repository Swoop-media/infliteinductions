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
- **Operations Notices Feature**: Allows creators to publish assignable notices with optional acknowledgement tracking, integrated with in-app and Teams notifications.
- **Course Peer Review Walkthrough**: Reviewers (Course Creators/Senior management/Admin) open a course via `?review=1` (creator page "Peer review" button), which unlocks all modules like preview but also allows full quiz answering (no progress writes) and shows complete onsite requirement checklists. A floating panel records reviewer name, date, and notes to `course_peer_reviews` (append-only, service-role only access; migration `app/migrations/007_course_peer_reviews.sql` applied manually in Supabase). History is shown under the creator course Details tab. No approval workflow or notifications.
- **SafeFLITE User Sync Webhook**: Integrates with SafeFLITE to sync user data upon creation, update, or archiving.
- **Archived User Visibility**: Users archived via `/app/admin/users/archived` (`profiles.archived_at IS NOT NULL`) are kept in the database for record-keeping but excluded from active admin views and notifications. Filtering is applied in: Due Dates - Courses, Due Dates - Authorisations, Due Dates - Documents, Course Progress, Pending Authorisations (`app/admin/page.tsx`), and the daily admin expiry report Teams bot summaries (`/api/notifications/daily-admin-report`). Restoring a user via the archived page re-includes them automatically.

# External Dependencies

- **Microsoft Teams**: Bot Framework for notifications and messaging.
- **Azure Active Directory**: Enterprise authentication and user management.
- **SharePoint**: Video content embedding.
- **Supabase**: Backend-as-a-Service for database, authentication, and storage.
- **Microsoft Graph API**: User profile and organizational data access.
- **SafeFLITE**: External system for user data synchronization via webhook.