# Retake Functionality Testing Guide

## Overview
The retake functionality has been successfully implemented for both completed courses and authorizations in the myprofile page.

## Components Created

### 1. API Endpoint
- **Location**: `/app/api/retake-assignment/route.ts`
- **Method**: POST
- **Purpose**: Creates new assignments for retaking courses or authorizations

### 2. Retake Button Component
- **Location**: `/app/app/myprofile/_components/RetakeButton.tsx`
- **Features**:
  - Confirmation dialog before creating retake
  - Loading state during creation
  - Error handling
  - Automatic navigation to learning page after successful retake

### 3. Integration in MyProfile Page
- **Location**: `/app/app/myprofile/page.tsx`
- **Placement**: 
  - Next to "Completed" pill in completed authorizations section
  - Next to "View" button in completed courses section

## How It Works

### For Courses:
1. User clicks "Retake" button on a completed course
2. Confirmation dialog asks if they want to start fresh
3. API creates a new `course_assignment` with status 'assigned'
4. User is redirected to the course learning page
5. Old completion record remains intact

### For Authorizations:
1. User clicks "Retake" button on a completed authorization
2. Confirmation dialog explains all included courses will be retaken
3. API creates:
   - New `authorisation_assignment` with status 'assigned'
   - New `course_assignments` for all courses in the authorization
4. User is redirected to the authorization learning page
5. Old completion records remain intact

## Testing Steps

### Test Course Retake:
1. Navigate to `/app/myprofile`
2. Find a completed course in "Completed Courses" section
3. Click "Retake" button
4. Confirm the dialog
5. Verify redirect to `/app/learn/courses/[courseId]`
6. Check that a new assignment has been created

### Test Authorization Retake:
1. Navigate to `/app/myprofile`
2. Find a completed authorization in "Completed Authorizations" section
3. Click "Retake" button
4. Confirm the dialog
5. Verify redirect to `/app/learn/authorisations/[authId]`
6. Check that new assignments have been created for the authorization and its courses

## Database Constraints
The system prevents duplicate active assignments through unique constraints on:
- `(course_id, user_id, role)` in `course_assignments`
- `(authorisation_id, user_id, role)` in `authorisation_assignments`

If a user attempts to retake while an active assignment exists, they'll receive an error message.

## User Experience
- Clear confirmation dialogs explain what will happen
- Previous completion records are preserved
- Users start fresh with new progress tracking
- Seamless navigation to learning pages after retake creation