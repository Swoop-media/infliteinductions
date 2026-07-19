// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Bell, AlertCircle, CheckCircle, Clock, User, FileText, BookOpen } from "lucide-react";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, any> | null;
  read: boolean;
  created_at: string;
  read_at?: string | null;
};

export default function UserNotifications({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNotifications();
  }, [userId]);

  async function loadNotifications() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users/${userId}/notifications`);
      if (!res.ok) {
        throw new Error("Failed to fetch notifications");
      }
      const data = await res.json();
      setNotifications(data.notifications || []);
      setError(null);
    } catch (err: any) {
      console.error("Error loading notifications:", err);
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case "authorisation_pending_approval":
      case "authorization_pending_approval":
      case "enrolment_request":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "authorization_approved":
      case "authorisation_approved_responsible":
      case "enrolment_approved":
      case "quiz_passed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "authorization_revoked":
      case "enrolment_revoked":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "course_assigned":
      case "authorization_assigned":
        return <BookOpen className="h-4 w-4 text-blue-600" />;
      case "role_granted":
      case "role_revoked":
        return <User className="h-4 w-4 text-purple-600" />;
      case "issue_report":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  }

  function formatNotificationTitle(type: string, payload: any) {
    // Helper functions to extract data
    const getLearnerInfo = () => {
      const name = payload?.learnerName || payload?.learner_name || "";
      const email = payload?.learner_email || "";
      if (name && email) return `${name} (${email})`;
      if (name) return name;
      if (email) return email;
      return "";
    };

    const getAuthTitle = () => payload?.authorizationTitle || payload?.authorization_title || "";
    const getCourseTitle = () => payload?.courseTitle || payload?.course_title || payload?.course_name || "";

    switch (type) {
      case "authorisation_pending_approval":
      case "authorization_pending_approval": {
        const authTitle = getAuthTitle();
        const learner = getLearnerInfo();
        let message = `🔔 Authorization pending approval`;
        if (authTitle) message += `: ${authTitle}`;
        if (learner) message += ` - Learner: ${learner}`;
        return message;
      }
      case "enrolment_request": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `📥 Enrollment request`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - From: ${learner}`;
        return message;
      }
      case "enrolment_approved": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `✅ Enrollment approved`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "enrolment_revoked": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `⚠️ Enrollment revoked`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "authorization_approved": {
        const authTitle = getAuthTitle();
        const learner = getLearnerInfo();
        let message = `✅ Authorization approved`;
        if (authTitle) message += `: ${authTitle}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "authorisation_approved_responsible": {
        const authTitle = getAuthTitle();
        const learner = getLearnerInfo();
        let message = `✅ Authorisation approved (responsible person)`;
        if (authTitle) message += `: ${authTitle}`;
        if (learner) message += ` - Learner: ${learner}`;
        if (payload?.approvedBy) message += ` - Approved by: ${payload.approvedBy}`;
        if (payload?.expiryDate) message += ` - Expires: ${payload.expiryDate}`;
        if (payload?.restrictions) message += ` - Restrictions: ${payload.restrictions}`;
        return message;
      }
      case "authorization_revoked": {
        const authTitle = getAuthTitle();
        const learner = getLearnerInfo();
        let message = `⚠️ Authorization revoked`;
        if (authTitle) message += `: ${authTitle}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "course_assigned": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `📚 Course assigned`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - To: ${learner}`;
        return message;
      }
      case "authorization_assigned": {
        const authTitle = getAuthTitle();
        const learner = getLearnerInfo();
        let message = `📋 Authorization assigned`;
        if (authTitle) message += `: ${authTitle}`;
        if (learner) message += ` - To: ${learner}`;
        return message;
      }
      case "quiz_passed": {
        const course = getCourseTitle();
        const score = payload?.score;
        const learner = getLearnerInfo();
        let message = `🎉 Quiz passed`;
        if (course) message += `: ${course}`;
        if (score) message += ` (Score: ${score}%)`;
        if (learner) message += ` - By: ${learner}`;
        return message;
      }
      case "role_granted": {
        const role = payload?.roleName || payload?.role_name || "";
        const targetUser = payload?.targetUserName || payload?.target_user_name || "";
        let message = `👤 Role granted`;
        if (role) message += `: ${role}`;
        if (targetUser) message += ` - To: ${targetUser}`;
        return message;
      }
      case "role_revoked": {
        const role = payload?.roleName || payload?.role_name || "";
        const targetUser = payload?.targetUserName || payload?.target_user_name || "";
        let message = `👤 Role revoked`;
        if (role) message += `: ${role}`;
        if (targetUser) message += ` - From: ${targetUser}`;
        return message;
      }
      case "onsite_training_ready": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `🎯 Ready for onsite training`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - Learner: ${learner}`;
        return message;
      }
      case "onsite_assessment_ready": {
        const course = getCourseTitle();
        const learner = getLearnerInfo();
        let message = `📝 Ready for onsite assessment`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - Learner: ${learner}`;
        return message;
      }
      case "course_expiry_reminder": {
        const course = getCourseTitle();
        const daysLeft = payload?.daysUntilExpiry;
        const learner = getLearnerInfo();
        let message = `⏰ Course expiring soon`;
        if (daysLeft !== undefined) message = `⏰ Course expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "course_expired": {
        const course = getCourseTitle();
        const daysOverdue = payload?.daysOverdue;
        const learner = getLearnerInfo();
        let message = `🚨 Course expired`;
        if (daysOverdue) message += ` ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago`;
        if (course) message += `: ${course}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      case "issue_report": {
        const reporter = payload?.reporter_name || payload?.reporterName || "";
        const reporterEmail = payload?.reporter_email || "";
        const message_text = payload?.message || "";
        let message = `🚨 Issue reported`;
        if (reporter && reporterEmail) {
          message += ` by ${reporter} (${reporterEmail})`;
        } else if (reporter) {
          message += ` by ${reporter}`;
        } else if (reporterEmail) {
          message += ` by ${reporterEmail}`;
        }
        if (message_text) {
          message += `: "${message_text.substring(0, 100)}${message_text.length > 100 ? '...' : ''}"`;
        }
        return message;
      }
      case "status_change": {
        const details = payload?.details || payload?.status || "";
        const learner = getLearnerInfo();
        let message = `📊 Status changed`;
        if (details) message += `: ${details}`;
        if (learner) message += ` - For: ${learner}`;
        return message;
      }
      default:
        return payload?.title || `📬 ${type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`;
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-4">Notifications</h2>
        <div className="text-sm text-gray-500">Loading notifications...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-4">Notifications</h2>
        <div className="text-sm text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Notifications</h2>
        <span className="text-sm text-gray-500">
          {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
        </span>
      </div>
      
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500">No notifications found for this user.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 p-3 rounded-md border ${
                notification.read ? "bg-gray-50 border-gray-200" : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="mt-0.5">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 break-words">
                  {formatNotificationTitle(notification.type, notification.payload)}
                </p>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-xs text-gray-500">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                  {!notification.read && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      Unread
                    </span>
                  )}
                  {notification.read_at && (
                    <p className="text-xs text-gray-400">
                      Read: {new Date(notification.read_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}