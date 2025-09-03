
# TODO: Admin and Learner Due Date Notifications

## Feature Description
Implement a notification system that alerts users when their course certifications are approaching expiration based on the notification lead days configured in each course.

## Key Components

### From Course Creator Configuration
- **Retake reminder (days)**: 30 days (configurable per course)
- **Notification lead (days)**: 30 days (configurable per course)

### Current Data Structure
- `courses` table has `valid_for_years` field
- `course_assignments` table has `completed_at` timestamp
- Due dates are calculated dynamically: `completed_at + valid_for_years`

### Implementation Plan

#### 1. Database Changes Needed
- Add `retake_reminder_days` field to `courses` table
- Add `notification_lead_days` field to `courses` table
- Consider adding a materialized view or scheduled job for performance

#### 2. Notification Types to Add
- `course_expiry_reminder` - For learners approaching due date
- `course_expired` - For learners whose certification has expired
- `admin_course_expiry_report` - Daily/weekly summary for admins

#### 3. Scheduled Job System
- Create cron job or Supabase edge function
- Run daily to check for upcoming due dates
- Calculate: `due_date - notification_lead_days = notification_date`

#### 4. Frontend Updates
- Update course creator form to include reminder settings
- Add due date notifications to notification bell
- Admin dashboard for managing expiry notifications

## Technical Notes
- Use existing `notifyUser()` function in `lib/notifications/dispatcher.ts`
- Leverage existing Teams integration for external notifications
- Follow same pattern as enrollment and onsite training notifications

## Priority: HIGH
This feature is critical for compliance and certification management.

---
**Status**: TODO - Paused to return to later
**Created**: January 2025
