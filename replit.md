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

# Recent Changes (December 2024)

## Department-Based Assignment UI
- **Feature Added**: Redesigned course and authorization assignment UI with department organization
- **New Component**: Created DepartmentAssignmentGroup that groups items by department with collapsible sections
- **Functionality**: Supports "select all" per department, individual selection, and proper form submission
- **Data Loading**: Updated queries to include department field for courses and authorizations
- **Implementation**: Replaced flat checkbox lists with organized department sections for better usability
- **Files Created/Updated**: Created `app/app/admin/users/[id]/DepartmentAssignmentGroup.tsx`, updated `app/app/admin/users/[id]/page.tsx`

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