// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Bell, AlertCircle, CheckCircle, Clock, User, FileText, BookOpen, AlertTriangle, Info, Award, Calendar } from "lucide-react";

type Noti = {
  id: string;
  type: string;
  payload: Record<string, any> | null;
  read: boolean;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Noti[]>([]);
  const unread = items.filter((n) => !n.read).length;

  async function load() {
    try {
      const res = await fetch("/app/notifications/list", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data?.notifications ?? []);
    } catch {}
  }

  async function markAllRead() {
    try {
      await fetch("/app/notifications/mark-read", { method: "POST" });
      await load();
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(id);
  }, []);

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
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case "onsite_training_ready":
      case "onsite_assessment_ready":
        return <Award className="h-4 w-4 text-indigo-600" />;
      case "course_expiry_reminder":
      case "course_expired":
        return <Calendar className="h-4 w-4 text-amber-600" />;
      case "status_change":
        return <Info className="h-4 w-4 text-gray-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border px-3 py-1 text-sm"
        title="Notifications"
      >
        Notifications
        {unread > 0 && (
          <span className="ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[28rem] rounded-md border bg-white p-3 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Notifications</div>
            <button onClick={markAllRead} className="text-xs underline">
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No notifications.</div>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-200 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className={`py-3 px-2 ${!n.read ? "bg-blue-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getNotificationIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 break-words">
                        {labelFor(n.type, n.payload)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!n.read && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        New
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function labelFor(type: string, p: any) {
  // Helper to get course title
  const getCourseTitle = () => p?.courseTitle || p?.course_title || p?.course_name || "";
  const getAuthTitle = () => p?.authorizationTitle || p?.authorization_title || "";
  const getLearnerName = () => p?.learnerName || p?.learner_name || p?.learner_email || "";
  
  switch (type) {
    case "authorisation_pending_approval":
    case "authorization_pending_approval": {
      const authTitle = getAuthTitle();
      const learner = getLearnerName();
      const parts = ["🔔 Authorization pending approval"];
      if (authTitle) parts.push(`: ${authTitle}`);
      if (learner) parts.push(` (Learner: ${learner})`);
      return parts.join("");
    }
    
    case "enrolment_request": {
      const course = getCourseTitle();
      const learner = getLearnerName();
      const parts = ["📥 Enrollment request"];
      if (course) parts.push(`: ${course}`);
      if (learner) parts.push(` (from ${learner})`);
      return parts.join("");
    }
    
    case "enrolment_approved": {
      const course = getCourseTitle();
      return course ? `✅ Enrollment approved: ${course}` : "✅ Enrollment approved";
    }
    
    case "enrolment_revoked": {
      const course = getCourseTitle();
      return course ? `⚠️ Enrollment revoked: ${course}` : "⚠️ Enrollment revoked";
    }
    
    case "authorization_approved": {
      const authTitle = getAuthTitle();
      return authTitle ? `✅ Authorization approved: ${authTitle}` : "✅ Authorization approved";
    }
    
    case "authorization_revoked": {
      const authTitle = getAuthTitle();
      return authTitle ? `⚠️ Authorization revoked: ${authTitle}` : "⚠️ Authorization revoked";
    }
    
    case "course_assigned": {
      const course = getCourseTitle();
      return course ? `📚 Course assigned: ${course}` : "📚 Course assigned";
    }
    
    case "authorization_assigned": {
      const authTitle = getAuthTitle();
      return authTitle ? `📋 Authorization assigned: ${authTitle}` : "📋 Authorization assigned";
    }
    
    case "quiz_passed": {
      const course = getCourseTitle();
      const score = p?.score;
      const parts = ["🎉 Quiz passed"];
      if (course) parts.push(`: ${course}`);
      if (score) parts.push(` (Score: ${score}%)`);
      return parts.join("");
    }
    
    case "role_granted": {
      const role = p?.role_name || p?.roleName || "";
      return role ? `👤 Role granted: ${role}` : "👤 Role granted";
    }
    
    case "role_revoked": {
      const role = p?.role_name || p?.roleName || "";
      return role ? `👤 Role revoked: ${role}` : "👤 Role revoked";
    }
    
    case "onsite_training_ready": {
      const course = getCourseTitle();
      const learner = getLearnerName();
      const parts = ["🎯 Ready for onsite training"];
      if (course) parts.push(`: ${course}`);
      if (learner) parts.push(` (${learner})`);
      return parts.join("");
    }
    
    case "onsite_assessment_ready": {
      const course = getCourseTitle();
      const learner = getLearnerName();
      const parts = ["📝 Ready for onsite assessment"];
      if (course) parts.push(`: ${course}`);
      if (learner) parts.push(` (${learner})`);
      return parts.join("");
    }
    
    case "course_expiry_reminder": {
      const course = getCourseTitle();
      const days = p?.daysUntilExpiry || 0;
      const parts = [`⏰ Course expiring in ${days} day${days !== 1 ? 's' : ''}`];
      if (course) parts.push(`: ${course}`);
      return parts.join("");
    }
    
    case "course_expired": {
      const course = getCourseTitle();
      const days = p?.daysOverdue || 0;
      const parts = [`🚨 Course expired${days > 0 ? ` ${days} day${days !== 1 ? 's' : ''} ago` : ""}`];
      if (course) parts.push(`: ${course}`);
      return parts.join("");
    }
    
    case "issue_report": {
      const reporter = p?.reporter_name || p?.reporterName || "";
      const message = p?.message || "";
      const parts = ["🚨 Issue reported"];
      if (reporter) parts.push(` by ${reporter}`);
      if (message) parts.push(`: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`);
      return parts.join("");
    }
    
    case "status_change": {
      const details = p?.details || p?.status || "";
      return details ? `📊 Status changed: ${details}` : "📊 Status changed";
    }
    
    case "course_published": {
      const title = p?.title || p?.course_title || "";
      return title ? `📖 Course published: ${title}` : "📖 Course published";
    }
    
    case "course_updated": {
      const course = getCourseTitle();
      return course ? `📝 Course updated: ${course}` : "📝 Course updated";
    }
    
    default: {
      // Fallback to use title from payload or format the type
      if (p?.title) return p.title;
      return `📬 ${type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`;
    }
  }
}