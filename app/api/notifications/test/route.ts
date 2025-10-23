// @ts-nocheck
// Test endpoint for manually triggering notifications
// For development/testing only

import { NextRequest, NextResponse } from "next/server";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!url || !key) {
    throw new Error("Supabase admin environment variables not set");
  }
  
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, notificationType } = await request.json();

    if (!userId || !notificationType) {
      return NextResponse.json({ 
        error: "Missing userId or notificationType" 
      }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    
    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    const userName = profile?.full_name || profile?.email || "User";
    const timestamp = new Date().toISOString();

    // Sample payloads for different notification types
    const payloads = {
      course_assigned: {
        courseTitle: "Test Course",
        assignedBy: "Admin",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/my-training"
      },
      authorization_assigned: {
        authorizationTitle: "Test Authorization",
        assignedBy: "Admin",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/my-training"
      },
      module_rejected: {
        moduleTitle: "Test Module",
        courseTitle: "Test Course",
        rejectedBy: "Trainer",
        rejectionReason: "Test rejection reason",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/my-training"
      },
      authorization_expired: {
        authorizationTitle: "Test Authorization",
        expiredDate: "01/01/2024",
        daysOverdue: 5,
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/my-training"
      },
      retake_reminder: {
        type: "Course",
        itemTitle: "Test Course",
        daysUntilExpiry: 14,
        expiryDate: "15/11/2024",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/my-training"
      },
      document_expiry_30: {
        documentName: "Test Document",
        expiryDate: "30/11/2024",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/profile"
      },
      document_expiry_10: {
        documentName: "Test Document",
        expiryDate: "10/11/2024",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/profile"
      },
      document_expiry_daily: {
        documentName: "Test Document",
        daysUntilExpiry: 3,
        expiryDate: "03/11/2024",
        learnerName: userName,
        learner_email: profile?.email,
        url: "/app/profile"
      },
      daily_auth_expiry_report: {
        count: 15,
        summary: "Top 5 expiring authorizations:\n  • Tandem Master - John Doe (5 days)\n  • AFF Instructor - Jane Smith (7 days)\n  • Packer B - Bob Johnson (10 days)",
        adminName: userName,
        url: "/app/admin?tab=due-dates-authorisations"
      },
      daily_doc_expiry_report: {
        count: 8,
        summary: "Top 5 expiring documents:\n  • Medical Certificate - John Doe (3 days)\n  • Pilot License - Jane Smith (5 days)\n  • Insurance - Bob Johnson (12 days)",
        adminName: userName,
        url: "/app/admin?tab=due-dates-documents"
      },
      authorization_published: {
        authorizationTitle: "New Test Authorization",
        publishedBy: "Course Creator",
        url: "/app/my-training"
      },
      onsite_training_ready: {
        learnerName: "Test Learner",
        learner_email: "learner@test.com",
        courseTitle: "Test Course",
        url: "/app/train-assess"
      },
      onsite_assessment_ready: {
        learnerName: "Test Learner",
        learner_email: "learner@test.com",
        courseTitle: "Test Course",
        url: "/app/train-assess"
      }
    };

    const payload = payloads[notificationType] || {
      title: `Test ${notificationType} notification`,
      message: "This is a test notification",
      url: "/app/home"
    };

    // Send the test notification
    await notifyUser(
      userId,
      notificationType,
      payload,
      { 
        eventId: `test_${notificationType}_${timestamp}`,
        skipTeams: false 
      }
    );

    return NextResponse.json({ 
      success: true,
      message: `Test notification sent to ${userName}`,
      type: notificationType,
      payload
    });
    
  } catch (error: any) {
    console.error("Test notification error:", error);
    return NextResponse.json({ 
      error: "Failed to send test notification",
      details: error.message 
    }, { status: 500 });
  }
}