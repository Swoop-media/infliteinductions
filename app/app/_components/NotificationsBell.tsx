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
      case "operations_notice_assigned":
        return <FileText className="h-4 w-4 text-orange-600" />;
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
  // Helper functions to extract data
  const getCourseTitle = () => p?.courseTitle || p?.course_title || p?.course_name || "";
  const getAuthTitle = () => p?.authorizationTitle || p?.authorization_title || "";
  const getLearnerInfo = () => {
    const name = p?.learnerName || p?.learner_name || "";
    const email = p?.learner_email || "";
    if (name && email) return `${name} (${email})`;
    if (name) return name;
    if (email) return email;
    return "";
  };
  
  switch (type) {
    case "authorisation_pending_approval":
    case "authorization_pending_approval": {
      const authTitle = getAuthTitle();
      const learner = getLearnerInfo();
      let message = "🔔 Authorization pending approval";
      if (authTitle) message += `: ${authTitle}`;
      if (learner) message += ` - Learner: ${learner}`;
      return message;
    }
    
    case "enrolment_request": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "📥 Enrollment request";
      if (course) message += `: ${course}`;
      if (learner) message += ` - From: ${learner}`;
      return message;
    }
    
    case "enrolment_approved": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "✅ Enrollment approved";
      if (course) message += `: ${course}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "enrolment_revoked": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "⚠️ Enrollment revoked";
      if (course) message += `: ${course}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "authorization_approved": {
      const authTitle = getAuthTitle();
      const learner = getLearnerInfo();
      let message = "✅ Authorization approved";
      if (authTitle) message += `: ${authTitle}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "authorization_revoked": {
      const authTitle = getAuthTitle();
      const learner = getLearnerInfo();
      let message = "⚠️ Authorization revoked";
      if (authTitle) message += `: ${authTitle}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "course_assigned": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "📚 Course assigned";
      if (course) message += `: ${course}`;
      if (learner) message += ` - To: ${learner}`;
      return message;
    }
    
    case "authorization_assigned": {
      const authTitle = getAuthTitle();
      const learner = getLearnerInfo();
      let message = "📋 Authorization assigned";
      if (authTitle) message += `: ${authTitle}`;
      if (learner) message += ` - To: ${learner}`;
      return message;
    }
    
    case "quiz_passed": {
      const course = getCourseTitle();
      const score = p?.score;
      const learner = getLearnerInfo();
      let message = "🎉 Quiz passed";
      if (course) message += `: ${course}`;
      if (score) message += ` (Score: ${score}%)`;
      if (learner) message += ` - By: ${learner}`;
      return message;
    }
    
    case "role_granted": {
      const role = p?.role_name || p?.roleName || "";
      const targetUser = p?.targetUserName || p?.target_user_name || "";
      let message = "👤 Role granted";
      if (role) message += `: ${role}`;
      if (targetUser) message += ` - To: ${targetUser}`;
      return message;
    }
    
    case "role_revoked": {
      const role = p?.role_name || p?.roleName || "";
      const targetUser = p?.targetUserName || p?.target_user_name || "";
      let message = "👤 Role revoked";
      if (role) message += `: ${role}`;
      if (targetUser) message += ` - From: ${targetUser}`;
      return message;
    }
    
    case "onsite_training_ready": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "🎯 Ready for onsite training";
      if (course) message += `: ${course}`;
      if (learner) message += ` - Learner: ${learner}`;
      return message;
    }
    
    case "onsite_assessment_ready": {
      const course = getCourseTitle();
      const learner = getLearnerInfo();
      let message = "📝 Ready for onsite assessment";
      if (course) message += `: ${course}`;
      if (learner) message += ` - Learner: ${learner}`;
      return message;
    }
    
    case "course_expiry_reminder": {
      const course = getCourseTitle();
      const daysLeft = p?.daysUntilExpiry;
      const learner = getLearnerInfo();
      let message = "⏰ Course expiring soon";
      if (daysLeft !== undefined) message = `⏰ Course expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
      if (course) message += `: ${course}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "course_expired": {
      const course = getCourseTitle();
      const daysOverdue = p?.daysOverdue;
      const learner = getLearnerInfo();
      let message = "🚨 Course expired";
      if (daysOverdue) message += ` ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago`;
      if (course) message += `: ${course}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "issue_report": {
      const reporter = p?.reporter_name || p?.reporterName || "";
      const reporterEmail = p?.reporter_email || "";
      const message_text = p?.message || "";
      let message = "🚨 Issue reported";
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
      const details = p?.details || p?.status || "";
      const learner = getLearnerInfo();
      let message = "📊 Status changed";
      if (details) message += `: ${details}`;
      if (learner) message += ` - For: ${learner}`;
      return message;
    }
    
    case "course_published": {
      const title = p?.title || p?.course_title || "";
      return title ? `📖 Course published: ${title}` : "📖 Course published";
    }
    
    case "course_updated": {
      const course = getCourseTitle();
      return course ? `📝 Course updated: ${course}` : "📝 Course updated";
    }
    
    case "operations_notice_assigned": {
      const noticeTitle = p?.noticeTitle || p?.notice_title || "";
      const requiresAck = p?.requireAcknowledgement;
      let message = "📋 Operations Notice assigned";
      if (noticeTitle) message += `: ${noticeTitle}`;
      if (requiresAck) message += " (acknowledgement required)";
      return message;
    }
    
    default: {
      // Fallback to use title from payload or format the type
      if (p?.title) return p.title;
      return `📬 ${type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`;
    }
  }
}