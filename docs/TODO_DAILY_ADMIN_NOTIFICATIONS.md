
# Daily Admin Due Dates Notifications

## Feature Overview
Daily Teams notifications for users with Admin or Senior Management roles containing summaries of:
1. **Course Due Dates** - from `/app/admin` due dates-courses tab
2. **Authorisation Due Dates** - from `/app/admin` due dates-authorisations tab
3. **Document Due Dates** - expiring learner documents

## Specifications

### Timing & Delivery
- **Schedule**: Daily at 8:00 AM New Zealand time (triggered via cron-job.org)
- **Recipients**: All users with Admin OR Senior Management role (deduplicated)
- **Format**: Single combined Teams message with all summaries
- **Channel**: Teams only (no in-app notifications)

### Content Requirements
- **Ordering**: By status column (least days to expiry first)
- **Limit**: Maximum 25 rows per notification
- **Filtering**: Include all statuses (this is a summary, not replacement for existing reminders)

### Data Sources
- **Course Due Dates**: Use existing `loadCompletedCoursesWithDueDates` function
- **Authorisation Due Dates**: Use existing `loadCompletedAuthorisationsWithDueDates` function
- **Recipients**: Query profiles table for users with 'Admin' or 'Senior Management' roles

## Implementation Plan

### 1. Create Scheduled Function
**File**: `supabase/sql/daily_admin_notifications.sql`
```sql
-- Create function to send daily admin summaries
CREATE OR REPLACE FUNCTION send_daily_admin_summaries()
RETURNS void AS $$
-- Implementation will:
-- 1. Get all admin users
-- 2. Load course due dates (limit 25, ordered by days_until_expiry)
-- 3. Load authorisation due dates (limit 25, ordered by days_until_expiry)
-- 4. Format and send Teams messages
$$ LANGUAGE plpgsql;
```

### 2. Set Up Cron Job
**Requirement**: Use Supabase Edge Functions with cron trigger
- **Cron Expression**: `0 20 * * *` (8 AM NZ = 8 PM UTC, assuming no DST)
- **Note**: May need adjustment for NZ daylight saving time

### 3. Create API Endpoint
**File**: `app/api/admin/daily-summaries/route.ts`
- Call the database function
- Handle errors and logging
- Can be triggered manually for testing

### 4. Teams Message Format

#### Course Due Dates Message
```
🎓 **Daily Course Due Dates Summary**
📅 Date: [Current Date]

📋 **Upcoming Course Expiries** (Top 25)
👤 **User** | 📚 **Course** | ⏰ **Status** | 📆 **Days Until Expiry**
[Formatted table with user names, course titles, status, days remaining]

📊 Total records: X (showing top 25)
```

#### Authorisation Due Dates Message
```
📜 **Daily Authorisation Due Dates Summary**
📅 Date: [Current Date]

📋 **Upcoming Authorisation Expiries** (Top 25)
👤 **User** | 🛡️ **Authorisation** | ⏰ **Status** | 📆 **Days Until Expiry**
[Formatted table with user names, authorisation titles, status, days remaining]

📊 Total records: X (showing top 25)
```

### 5. Integration Points
- **Existing Functions**: Leverage `loadCompletedCoursesWithDueDates` and `loadCompletedAuthorisationsWithDueDates`
- **Teams Integration**: Use existing `notifyUser()` function in `lib/notifications/dispatcher.ts`
- **Admin Role Check**: Use existing role management system

## Database Changes Needed

### New Notification Types
Add to notification types enum:
- `admin_daily_course_summary`
- `admin_daily_authorisation_summary`

### Scheduling Table (Optional)
Consider adding a `scheduled_notifications` table to track:
- Last run timestamp
- Success/failure status
- Error logs

## Testing Strategy

### Manual Testing
1. Create test endpoint: `/app/api/debug/test-daily-summaries`
2. Test with different admin users
3. Verify message formatting
4. Test with empty results
5. Test with exactly 25+ records

### Automated Testing
1. Unit tests for formatting functions
2. Integration tests for data retrieval
3. Mock Teams API responses

## Deployment Considerations

### Environment Variables
- Confirm `MICROSOFT_APP_*` variables are set in production
- Verify Teams bot permissions in production tenant

### Timezone Handling
- **Critical**: Properly handle New Zealand timezone
- Consider daylight saving time transitions (NZDT vs NZST)
- May need to adjust cron schedule twice yearly

### Error Handling
- Graceful degradation if Teams API fails
- Retry logic for failed notifications
- Admin notification if daily summary fails

### Performance
- Consider caching results if data is expensive to compute
- Monitor execution time for large datasets
- Optimize queries if needed

## Security Considerations
- Ensure only admins can trigger manual runs
- Validate all user inputs
- Sanitize data before sending to Teams
- Rate limiting on manual trigger endpoint

## Monitoring & Maintenance
- Log successful runs
- Alert on failures
- Monitor message delivery success
- Track admin engagement with summaries

---

**Status**: IMPLEMENTED
**Priority**: Medium
**Dependencies**: Replit deployment, production Teams bot setup, cron-job.org trigger

**Created**: January 2025
**Last Updated**: January 2026 - Expanded recipients to include Senior Management role
