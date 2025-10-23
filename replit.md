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