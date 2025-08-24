// This endpoint has been removed because:
// 1. The enrollment notification system works perfectly through lib/notifications/dispatcher.ts
// 2. This webhook was causing errors with undefined values
// 3. Direct notifications via dispatcher.ts are more reliable and immediate

// The notification flow now works as:
// 1. User enrolls → app/courses/enrol/route.ts
// 2. Direct notification → lib/notifications/dispatcher.ts
// 3. Teams message sent → lib/teams/send.ts

export default function handler() {
  return Response.json({
    message: "This endpoint has been removed. Notifications work through the direct dispatcher system."
  }, { status: 410 });
}