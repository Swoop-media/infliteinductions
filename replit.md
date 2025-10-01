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

## Data Storage Solutions (IMPORTANT: SUPABASE)
- **Primary Database**: Supabase (PostgreSQL) with Row Level Security policies - ALWAYS USE SUPABASE ADMIN CLIENT FOR ADMIN PAGES
- **Authentication Provider**: Supabase Auth with Microsoft OAuth provider
- **File Storage**: Supabase Storage for course materials and user documents
- **Database Functions**: PostgreSQL triggers and functions for business logic automation
- **Real-time Features**: Supabase Realtime for live notifications and updates
- **CRITICAL NOTE**: This is a SUPABASE database. When debugging:
  - Always consider Row Level Security (RLS) policies
  - Use supabaseAdmin() client for admin pages to bypass RLS
  - Check actual Supabase table structure before making assumptions
  - Ask user to run SQL queries in Supabase dashboard when needed for verification

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

# Admin Diagnostic Tools

## Authorization Diagnostic Tool
- **Location**: `/app/admin/diagnose-authorizations`
- **Access**: Admin or Trainers and Assessors roles required
- **Purpose**: Identifies and fixes authorization assignment status issues
- **Features**:
  - Lists all authorization assignments with status mismatches
  - Shows completed course requirements vs pending authorization status
  - One-click fix for status synchronization issues
  - Detects orphaned or incomplete assignments
- **Production Ready**: Yes - fully secured with role-based access control

## Document Diagnostic Tool
- **Location**: `/app/admin/diagnose-documents`
- **Access**: Admin or Trainers and Assessors roles required
- **Purpose**: Comprehensive document visibility and relationship analysis
- **Features**:
  - Shows all documents system-wide (uses admin client to bypass user filtering)
  - Identifies missing relationships (user, course, module, assignment links)
  - Detects expired documents
  - Shows where each document should appear in the system
  - Lists orphaned documents without proper relationships
  - Document count validation and integrity checks
- **Production Ready**: Yes - fully secured with role-based access control

## Important Notes for Production
- Both diagnostic tools are **safe for production** deployment
- They include proper authentication checks (hasRole validation)
- They use the admin Supabase client only for data viewing, not for authentication
- The tools provide read-only diagnostics with optional fix capabilities
- No need to remove these tools when publishing - they provide valuable debugging capabilities for admins

# Enhanced UI Features

## Expandable Course Details Component
- **Locations**: 
  - `/app/admin/review/[assignmentId]` - Admin review page
  - `/app/admin/users/[id]` - Admin user details page
  - `/app/admin/users/[id]/pdf` - Training Record export page (PDF export)
- **Purpose**: Provides detailed, expandable views of course and authorization progress
- **Features**:
  - Click-to-expand interface for courses and authorizations
  - Module-level progress tracking with completion status
  - Digital quiz results with scores and pass/fail status
  - Onsite training/assessment requirements with trainer responses
  - Trainer/assessor name tracking for accountability
  - Document uploads associated with each module
  - Safe date formatting to prevent React hydration issues
  - Color-coded status badges for visual clarity
  - **PDF Export Support**: Expanded course details are included when printing/exporting to PDF
- **API Endpoints**:
  - `/api/user-course-details` - Fetches detailed course module information
  - `/api/user-authorization-details` - Fetches authorization course relationships
- **Benefits**:
  - Reduces page clutter while providing access to detailed information
  - Consistent UI across admin pages for better user experience
  - Improved visibility into learner progress and completion status
  - Comprehensive training records with full module details in PDF exports