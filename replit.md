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
- **Notification System**: In-app and Microsoft Teams notifications for events like course assignment, rejections, expiry reminders, and pending approvals, managed by scheduled jobs.
- **Admin Diagnostic Tools**: Production-ready and RLS-secured tools for diagnosing authorization and document visibility issues (`/app/admin/diagnose-authorizations`, `/app/admin/diagnose-documents`).
- **UI/UX Decisions**:
    - Learner interface focuses on content delivery with minimal distractions.
    - Compact navigation sidebar (w-56/224px) and reduced padding (p-4) for optimized content space.
    - PowerPoint files are blocked with guidance to convert to PDF.
    - Multi-photo document capture combines images into a single PDF using jsPDF.
    - Tabbed interfaces (e.g., `app/train-assess`) use lazy rendering and batch processing.
    - Expandable course details with PDF export.
    - Paginated admin views (50 items/page) for efficient data display with smart ordering.
    - Department-based assignment UI for user management.
    - Collapsible sections in user edit pages for improved organization.
- **Operations Notices Feature**: Allows creators to publish assignable notices with optional acknowledgement tracking, integrated with in-app and Teams notifications.
- **SafeFLITE User Sync Webhook**: Integrates with SafeFLITE to sync user data upon creation, update, or archiving.

# External Dependencies

- **Microsoft Teams**: Bot Framework for notifications and messaging.
- **Azure Active Directory**: Enterprise authentication and user management.
- **SharePoint**: Video content embedding.
- **Supabase**: Backend-as-a-Service for database, authentication, and storage.
- **Microsoft Graph API**: User profile and organizational data access.
- **SafeFLITE**: External system for user data synchronization via webhook.