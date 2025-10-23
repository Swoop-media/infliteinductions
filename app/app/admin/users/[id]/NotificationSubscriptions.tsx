// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle, X } from "lucide-react";

interface UserRole {
  role_name: string;
}

interface NotificationSubscriptionsProps {
  userId: string;
}

export default function NotificationSubscriptions({ userId }: NotificationSubscriptionsProps) {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserRoles();
  }, [userId]);

  async function loadUserRoles() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users/${userId}/roles`);
      if (!res.ok) {
        throw new Error("Failed to fetch user roles");
      }
      const data = await res.json();
      setUserRoles(data.roles || []);
    } catch (err: any) {
      console.error("Error loading user roles:", err);
      setUserRoles([]);
    } finally {
      setLoading(false);
    }
  }

  const generalNotifications = [
    { id: "course_assigned", name: "Course Assignment", description: "When a course is assigned to you" },
    { id: "authorization_assigned", name: "Authorization Assignment", description: "When an authorization is assigned to you" },
    { id: "module_rejected", name: "Module Rejected", description: "When a module submission is rejected" },
    { id: "retake_reminder", name: "Retake Reminders", description: "Reminders to retake expiring courses/authorizations" },
    { id: "authorization_expired", name: "Authorization Expired", description: "When an authorization expires" },
    { id: "document_expiry_30", name: "Document Expiry (30 days)", description: "30 days before document expires" },
    { id: "document_expiry_10", name: "Document Expiry (10 days)", description: "10 days before document expires" },
    { id: "document_expiry_daily", name: "Document Expiry (Daily)", description: "Daily reminders for expiring documents" },
    { id: "onsite_assignments", name: "Onsite Assignments", description: "When assigned as onsite trainer or assessor" }
  ];

  const adminNotifications = [
    { id: "daily_auth_expiry", name: "Daily Authorization Expiry Report", description: "Daily list of 50 soonest authorization expiries" },
    { id: "daily_doc_expiry", name: "Daily Document Expiry Report", description: "Daily list of 50 soonest document expiries" }
  ];

  const trainerAssessorNotifications = [
    { id: "module_rejected_trainer", name: "Module Rejected (As Trainer)", description: "When a module you trained/assessed is rejected" },
    { id: "course_ready_assessment", name: "Course Ready for Assessment", description: "When a learner completes digital training and needs assessment" }
  ];

  const authorizationApproverNotifications = [
    { id: "authorization_pending", name: "Authorization Pending Review", description: "When an authorization needs approval" },
    { id: "authorization_published", name: "Authorization Published", description: "When an authorization is published to the system" }
  ];

  const isAdmin = userRoles.includes("Admin");
  const isTrainerAssessor = userRoles.includes("Trainers and Assessors");
  const isAuthorizationApprover = userRoles.includes("Authorization Approver") || userRoles.includes("Senior Management");

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-4">Notification Subscriptions</h2>
        <div className="text-sm text-gray-500">Loading subscriptions...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Notification Subscriptions</h2>
        <Bell className="h-5 w-5 text-gray-600" />
      </div>
      
      <div className="space-y-4">
        {/* General User Notifications */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">General Notifications</h3>
          <div className="space-y-2">
            {generalNotifications.map(notif => (
              <div key={notif.id} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">{notif.name}:</span>
                  <span className="text-gray-600 ml-1">{notif.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Notifications */}
        {isAdmin && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Admin Notifications</h3>
            <div className="space-y-2">
              {adminNotifications.map(notif => (
                <div key={notif.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{notif.name}:</span>
                    <span className="text-gray-600 ml-1">{notif.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trainer/Assessor Notifications */}
        {isTrainerAssessor && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Trainer/Assessor Notifications</h3>
            <div className="space-y-2">
              {trainerAssessorNotifications.map(notif => (
                <div key={notif.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{notif.name}:</span>
                    <span className="text-gray-600 ml-1">{notif.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Authorization Approver Notifications */}
        {isAuthorizationApprover && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Authorization Approver Notifications</h3>
            <div className="space-y-2">
              {authorizationApproverNotifications.map(notif => (
                <div key={notif.id} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{notif.name}:</span>
                    <span className="text-gray-600 ml-1">{notif.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t text-xs text-gray-500">
        <p>User roles: {userRoles.length > 0 ? userRoles.join(", ") : "General User"}</p>
      </div>
    </div>
  );
}