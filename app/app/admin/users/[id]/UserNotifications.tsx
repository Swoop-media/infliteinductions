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
    switch (type) {
      case "authorisation_pending_approval":
      case "authorization_pending_approval":
        return `🔔 Authorization pending approval${payload?.authorizationTitle ? `: ${payload.authorizationTitle}` : ""}`;
      case "enrolment_request":
        return `📥 Enrollment request${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "enrolment_approved":
        return `✅ Enrollment approved${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "enrolment_revoked":
        return `⚠️ Enrollment revoked${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "authorization_approved":
        return `✅ Authorization approved${payload?.authorizationTitle ? `: ${payload.authorizationTitle}` : ""}`;
      case "authorization_revoked":
        return `⚠️ Authorization revoked${payload?.authorizationTitle ? `: ${payload.authorizationTitle}` : ""}`;
      case "course_assigned":
        return `📚 Course assigned${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "authorization_assigned":
        return `📋 Authorization assigned${payload?.authorizationTitle ? `: ${payload.authorizationTitle}` : ""}`;
      case "quiz_passed":
        return `🎉 Quiz passed${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "role_granted":
        return `👤 Role granted${payload?.roleName ? `: ${payload.roleName}` : ""}`;
      case "role_revoked":
        return `👤 Role revoked${payload?.roleName ? `: ${payload.roleName}` : ""}`;
      case "onsite_training_ready":
        return `🎯 Ready for onsite training${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "onsite_assessment_ready":
        return `📝 Ready for onsite assessment${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "course_expiry_reminder":
        return `⏰ Course expiring soon${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "course_expired":
        return `🚨 Course expired${payload?.courseTitle || payload?.course_title ? `: ${payload.courseTitle || payload.course_title}` : ""}`;
      case "issue_report":
        return `🚨 Issue reported${payload?.message ? `: ${payload.message.substring(0, 50)}...` : ""}`;
      case "status_change":
        return `📊 Status changed${payload?.details ? `: ${payload.details}` : ""}`;
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