# Overview

INFLITE Induction & Training is a comprehensive Learning Management System (LMS) designed for company-wide inductions, training programs, and authorizations. It supports various user roles, structured learning workflows, and integrates both digital and onsite training components. The platform aims to streamline corporate training and compliance.

# User Preferences

Preferred communication style: Simple, everyday language.

## UI/UX Preferences
- Learner interface focuses on content delivery with minimal distractions
- Compact navigation sidebar (w-56/224px) to maximize content space
- Reduced padding in content blocks (p-4 instead of p-6) for better space utilization
- PowerPoint files blocked with clear guidance to convert to PDF

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

## Core Features & Design Patterns
- **Hybrid Rendering**: Server-side rendering for performance, client-side for interactivity.
- **Authorization Expiry**: Smart system calculating expiry based on the earliest of document, course, or authorization validity.
- **Notification System**: In-app and Teams notifications for various events across user roles (e.g., course assignment, rejections, expiry reminders, pending approvals). Scheduled jobs handle notification triggers.
- **Admin Diagnostic Tools**:
    - **Authorization Diagnostic Tool**: `/app/admin/diagnose-authorizations` for identifying and fixing authorization assignment status issues.
    - **Document Diagnostic Tool**: `/app/admin/diagnose-documents` for comprehensive document visibility and relationship analysis.
    Both tools are production-ready and RLS-secured.
- **UI Enhancements**:
    - **Train/Assess Page**: Search and filter by trainee, course, and department with client-side filtering.
    - **Multi-Photo Document Capture**: Allows capturing multiple photos, combining into a single PDF using jsPDF.
    - **Tabbed Interface**: `app/train-assess` uses tabs for Training and Assessment, improving performance with lazy rendering and batch processing.
    - **Expandable Course Details**: Detailed, expandable views of course and authorization progress across admin pages, supporting PDF export.
    - **Paginated Admin Views**: Efficient loading and display for large datasets (Due Dates - Courses, Authorisations, Documents) with 50 items/page, smart ordering, and navigation.

# External Dependencies

- **Microsoft Teams**: Bot Framework for notifications and messaging.
- **Azure Active Directory**: Enterprise authentication and user management.
- **SharePoint**: Video content embedding.
- **Supabase**: Backend-as-a-Service for database, authentication, and storage.
- **Microsoft Graph API**: User profile and organizational data access.

# Recent Changes (November-December 2024)

## Operations Notices Feature (Latest)
- **Feature Added**: New "Operations Notices" learning type in Creator section
- **Purpose**: Allow creators to publish notices that can be assigned to users with optional acknowledgement requirements
- **Components Created**:
  - `FilteredOperationsNoticeList.tsx` - Listing component with search/filter
  - `DeleteOperationsNoticeButton.tsx` - Client-side delete button
  - `operations-notices/new/page.tsx` - Create new notice with title
  - `operations-notices/[id]/page.tsx` - Notice editor with Details and Assignments tabs
  - `operations-notices/[id]/delete/page.tsx` - Delete confirmation page
  - `app/app/operations-notices/page.tsx` - User-facing page showing all published notices
- **Database Tables Required** (SQL migration file provided: `supabase_operations_notices_migration.sql`):
  - `operations_notices` - Main table with title, description, status, require_acknowledgement flag, responsible_person, valid_for_days
  - `operations_notice_assignments` - User assignments to notices
  - `operations_notice_acknowledgements` - Tracking user acknowledgements
- **Features**:
  - Create/Edit/Delete operations notices
  - "Require Acknowledgement" checkbox - when enabled, tracks if assigned users have acknowledged
  - Assignments tab with batch user assignment grouped by department
  - Department and tags support for filtering
  - Responsible Person dropdown (Senior Management/Admin users)
  - Valid for (days) field for notice expiry tracking
  - Orange "Operations Notices" button in navigation bar (next to green Authorisations button)
  - User-facing page at `/app/operations-notices` showing all valid published notices with acknowledgement buttons
  - Collapsible "Operations Notices" section in My Profile page showing assigned notices with status
  - **Notifications**: When users are assigned an operations notice, they receive:
    - In-app notification (visible in bell dropdown with orange FileText icon)
    - Teams bot message with direct link to published app (`https://training.inflite.nz/app/operations-notices`)
    - Message shows notice title, whether acknowledgement is required, and who assigned it
- **Environment Variables**:
  - `NEXT_PUBLIC_SITE_URL` set to `https://training.inflite.nz` for production URL in notifications
- **Files Updated**: 
  - `app/app/creator/page.tsx` to add "Operations Notices" tab
  - `app/app/layout.tsx` to add orange navigation button
  - `app/app/myprofile/page.tsx` to add Operations Notices collapsible section
  - `lib/notifications/dispatcher.ts` to add `operations_notice_assigned` notification type
  - `app/app/_components/NotificationsBell.tsx` to display operations notice notifications

## Internal User Creation Fix
- **Issue Fixed**: Creating internal users (Microsoft Account) from the Add New User page was silently failing
- **Root Cause**: The form was calling `form.submit()` without any API endpoint, so nothing was being created
- **Solution**: Created new `/api/admin/create-internal-user` endpoint that:
  - Pre-creates Supabase auth user for Microsoft SSO login
  - Creates profile with department and job description
  - Assigns default "User" role
  - Assigns courses and authorizations with duplicate checking
- **Form Update**: `NewUserForm.tsx` now calls the new API endpoint for internal users (same pattern as external users)
- **User Handling**: Existing users (by email) are updated with new assignments rather than duplicated
- **Files Created**: `app/api/admin/create-internal-user/route.ts`
- **Files Updated**: `app/app/admin/users/new/NewUserForm.tsx`

## Dual Authentication System
- **Feature Added**: Support for external users (contractors/operators) who don't have Microsoft accounts
- **Database**: Added `user_type` column to profiles table (internal_employee, external_contractor, external_operator)
- **Authentication Options**:
  - Microsoft OAuth for internal employees (existing)
  - Email/password authentication for external users (new)
- **Registration**: New registration page (`/app/auth/register`) for external users
- **Login Pages Updated**: Both root (`/`) and `/auth/signin` now show dual authentication options
- **Roles**: External contractors assigned "Trainers and Assessors" role, operators assigned "User" role
- **Features**: External users have full system access - can be assigned courses, complete training, receive authorizations

## Authorization Revocation Fix 
- **Issue Fixed**: Authorization revocation was failing due to database check constraints
- **Solution**: Changed revocation to use 'expired' status (allowed by constraint)
- **Functionality**: Revoked authorizations marked as expired, related courses cancelled, notifications sent

# Recent Changes (November-December 2024)

## Department-Based Assignment UI (Refactored)
- **Feature Added**: Redesigned course and authorization assignment UI with department organization for both Edit User and Add New User pages
- **Component Architecture**: 
  - Created `DepartmentAssignmentBase.tsx` - Shared form-agnostic component for grouping logic
  - Updated `DepartmentAssignmentGroup.tsx` - Adapter for Edit User page with form submission
  - Created `AssignmentSections.tsx` - Implementation for Add New User page using the shared base
- **Functionality**: Supports "select all" per department, individual selection, and proper form submission
- **Data Loading**: Updated queries to include department field for courses and authorizations
- **Implementation**: Replaced flat checkbox lists with organized department sections for better usability
- **Bug Fix**: Fixed infinite render loop by using useState initializers instead of useEffect
- **Placement**: Authorizations appear at the top, courses appear below in assignment interfaces
- **Files Created/Updated**: `app/app/admin/users/DepartmentAssignmentBase.tsx`, `app/app/admin/users/[id]/DepartmentAssignmentGroup.tsx`, `app/app/admin/users/new/AssignmentSections.tsx`

## Collapsible Sections in Edit User Page
- **Feature Added**: Made four sections collapsible with default collapsed state for better UI organization
- **Sections Updated**: Completed Authorizations, Current Authorization Assignments, Completed Courses, Current Course Assignments
- **Implementation**: Created CollapsibleSection client component with chevron icons for expand/collapse
- **Files Updated**: Created `app/app/admin/users/[id]/CollapsibleSection.tsx`, updated `app/app/admin/users/[id]/page.tsx`

## Course Progress Search Fix
- **Issue Fixed**: Search in Course Progress tab was missing many course enrollments
- **Solution**: Removed premature limit(100) that was applied before search filtering
- **Impact**: Search now works across all course assignments, then limits results after filtering
- **Files Updated**: `app/app/admin/page.tsx` - loadInProgressCourses function

## Dynamic Department Loading Fix
- **Issue Fixed**: Edit User page was using hardcoded department list instead of database values
- **Solution**: Refactored to dynamically load departments from Supabase `departments` table
- **Impact**: Department changes in database now immediately reflect in the UI
- **Files Updated**: `app/app/admin/users/[id]/page.tsx` - removed hardcoded DEPARTMENTS array, added database query

## Authorization Diagnostic Tool Optimization (Latest)
- **Performance improvements**: Reduced database queries from 400+ to 3-4 using batched queries, eliminating N+1 problem
- **Enhanced filtering**: Added comprehensive filters including search, status filters, date range, and quick filters to exclude completed/approved items  
- **Pagination**: Implemented 50 items per page for efficient handling of large datasets
- **API authentication fix**: Corrected all diagnostic endpoints to use `has_role` RPC function instead of direct `user_roles` table queries (critical fix for admin access)
- **Optimized API endpoint**: Server-side filtering and batching for better performance

## Notification System Enhancements
- **Enhanced notification system** with detailed notification displays on admin user pages
- **Improved in-app notifications dropdown** with comprehensive information and emoji icons
- **Implemented all notification types**: course/authorization assignments, module rejections, document/authorization expiries, retake reminders, daily admin reports
- **Automated scheduled notification jobs** listing top 25 upcoming items for daily reports
- **Teams message formatting** as clean, readable lists with double line breaks for proper display
- **Daily cron job** configured via external service (cron-job.org) with CRON_SECRET authentication

## Data Display Improvements
- **Authorization page pagination**: Shows 50 records per page with smart pagination controls
- **Enhanced search functionality**: Combined search across user names, emails, and authorization titles  
- **Fixed department filtering**: Properly filters authorizations by department using user ID lookup
- **Quiz review display fix**: Correctly fetches quiz questions using 'stem'/'prompt' fields instead of 'question'
- **Teams connection status column**: Added "Teams" column to admin users table showing green tick (✓) or red cross (✗) for Teams bot connection status

## Database Query Optimizations
- **Authorization expiry calculations**: Uses completed_at + valid_for_days from authorisations table
- **Document queries**: Uses learner_documents table with separate profile fetches to avoid conflicts
- **Quiz data structure**: Updated to handle quiz_questions linked by quiz_id or module_id (no course_id)