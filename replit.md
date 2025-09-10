# Overview

INFLITE Induction & Training is a comprehensive Learning Management System (LMS) designed for company-wide inductions, training programs, and authorizations. The platform supports multiple user roles including learners, trainers, course creators, and administrators, enabling structured learning workflows with both digital and onsite training components.

# User Preferences

Preferred communication style: Simple, everyday language.

## UI/UX Preferences
- Learner interface focuses on content delivery with minimal distractions
- Compact navigation sidebar (w-56/224px) to maximize content space
- Reduced padding in content blocks (p-4 instead of p-6) for better space utilization
- PowerPoint files blocked with clear guidance to convert to PDF

# System Architecture

## Frontend Architecture
- **Framework**: Next.js 15 with App Router using TypeScript
- **Styling**: Tailwind CSS for utility-first styling approach
- **UI Components**: Radix UI primitives for accessible component foundation
- **State Management**: React hooks and server components for data fetching
- **Authentication**: Microsoft OAuth integration via Azure MSAL for enterprise SSO

## Backend Architecture
- **API Layer**: Next.js API routes with both App Router and Pages Router patterns
- **Authentication**: Supabase Auth integrated with Microsoft OAuth flow
- **Session Management**: Supabase middleware for cookie-based session handling
- **File Uploads**: Server Actions with 64MB limit for document management
- **Microsoft Teams Integration**: Bot Framework SDK for proactive messaging and notifications

## Data Storage Solutions
- **Primary Database**: Supabase (PostgreSQL) with Row Level Security policies
- **Authentication Provider**: Supabase Auth with Microsoft OAuth provider
- **File Storage**: Supabase Storage for course materials and user documents
- **Database Functions**: PostgreSQL triggers and functions for business logic automation
- **Real-time Features**: Supabase Realtime for live notifications and updates

## Authentication and Authorization
- **Single Sign-On**: Microsoft Azure AD integration for enterprise authentication
- **Role-Based Access Control**: Multi-tier role system (Admin, Trainers, Course Creators, General)
- **Session Security**: Secure cookie-based sessions with automatic refresh
- **API Security**: Row Level Security policies enforced at database level
- **Teams Bot Authentication**: Azure Bot Service credentials for Teams integration

## External Dependencies
- **Microsoft Teams**: Bot notifications and messaging via Bot Framework
- **Azure Active Directory**: Enterprise authentication and user management
- **SharePoint**: Video content embedding with authentication challenges
- **Supabase**: Backend-as-a-Service for database, auth, and storage
- **Microsoft Graph API**: User profile and organizational data access

The architecture follows a hybrid approach with server-side rendering for performance and client-side interactivity where needed. The system handles complex workflows including course creation, assignment management, progress tracking, and multi-modal training delivery (digital + onsite components).