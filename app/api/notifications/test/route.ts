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

export async function GET(request: NextRequest) {
  // GET handler for easy testing via browser
  return NextResponse.json({ 
    message: "This endpoint accepts POST requests to test notifications",
    usage: "Send a POST request with JSON body containing userId and notificationType",
    example: {
      userId: "c1e9d86d-2dcc-4c31-a0d9-b3c54f59f936",
      notificationType: "course_assigned"
    },
    availableTypes: [
      "course_assigned",
      "authorization_assigned",
      "module_rejected",
      "authorization_expired",
      "retake_reminder",
      "document_expiry_30",
      "document_expiry_10",
      "document_expiry_daily",
      "daily_auth_expiry_report",
      "daily_doc_expiry_report",
      "authorization_published",
      "onsite_training_ready",
      "onsite_assessment_ready"
    ]
  });
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
    const today = new Date();
    
    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    const userName = profile?.full_name || profile?.email || "User";
    const userEmail = profile?.email || "";
    const timestamp = new Date().toISOString();

    // Build payload with actual data based on notification type
    let payload = {};
    
    // For certain notification types, fetch real data from database
    switch(notificationType) {
      case "course_assigned": {
        // Get a real course assignment for this user
        const { data: assignment } = await supabase
          .from("course_assignments")
          .select(`
            courses!inner(title)
          `)
          .eq("user_id", userId)
          .eq("role", "trainee")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        payload = {
          courseTitle: assignment?.courses?.title || "Sample Course",
          assignedBy: "Admin",
          learnerName: userName,
          learner_email: userEmail,
          url: "/app/my-training"
        };
        break;
      }
      
      case "authorization_assigned": {
        // Get a real authorization assignment for this user
        const { data: assignment } = await supabase
          .from("authorisation_assignments")
          .select(`
            authorisations!inner(title)
          `)
          .eq("user_id", userId)
          .eq("role", "trainee")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        payload = {
          authorizationTitle: assignment?.authorisations?.title || "Sample Authorization",
          assignedBy: "Admin",
          learnerName: userName,
          learner_email: userEmail,
          url: "/app/my-training"
        };
        break;
      }
      
      case "module_rejected": {
        // Get real course data for this user
        const { data: course } = await supabase
          .from("course_assignments")
          .select(`
            courses!inner(title, modules(title))
          `)
          .eq("user_id", userId)
          .eq("role", "trainee")
          .limit(1)
          .single();
        
        const moduleTitle = course?.courses?.modules?.[0]?.title || "Sample Module";
        const courseTitle = course?.courses?.title || "Sample Course";
        
        payload = {
          moduleTitle,
          courseTitle,
          rejectedBy: "Trainer",
          rejectionReason: "Test rejection - needs improvement",
          learnerName: userName,
          learner_email: userEmail,
          url: "/app/my-training"
        };
        break;
      }
      
      case "document_expiry_30":
      case "document_expiry_10":
      case "document_expiry_daily": {
        // Get a real document for this user
        const { data: doc } = await supabase
          .from("documents")
          .select("name, expires_on")
          .eq("user_id", userId)
          .not("expires_on", "is", null)
          .order("expires_on", { ascending: true })
          .limit(1)
          .single();
        
        const daysUntil = notificationType === "document_expiry_30" ? 30 : 
                          notificationType === "document_expiry_10" ? 10 : 3;
        const expiryDate = doc?.expires_on ? 
          new Date(doc.expires_on).toLocaleDateString('en-GB') :
          new Date(Date.now() + daysUntil * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
        
        payload = {
          documentName: doc?.name || "Sample Document",
          expiryDate,
          daysUntilExpiry: daysUntil,
          learnerName: userName,
          learner_email: userEmail,
          url: "/app/profile"
        };
        break;
      }
      
      case "daily_auth_expiry_report": {
        // Get real authorization expiry data
        const { data: expiries } = await supabase
          .from("authorisation_assignments")
          .select(`
            expires_at,
            authorisations!inner(title),
            profiles!inner(full_name)
          `)
          .eq("assignment_status", "approved")
          .not("expires_at", "is", null)
          .order("expires_at", { ascending: true })
          .limit(5);
        
        let summary = "";
        if (expiries && expiries.length > 0) {
          summary = "Top expiring authorizations:\n";
          expiries.forEach(exp => {
            const daysUntil = Math.ceil((new Date(exp.expires_at).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            summary += `  • ${exp.authorisations.title} - ${exp.profiles.full_name} (${daysUntil} days)\n`;
          });
        }
        
        payload = {
          count: expiries?.length || 0,
          summary: summary || "No authorizations expiring soon",
          adminName: userName,
          url: "/app/admin?tab=due-dates-authorisations"
        };
        break;
      }
      
      case "daily_doc_expiry_report": {
        // Get real document expiry data
        const { data: expiries } = await supabase
          .from("documents")
          .select(`
            name,
            expires_on,
            profiles!inner(full_name)
          `)
          .not("expires_on", "is", null)
          .order("expires_on", { ascending: true })
          .limit(5);
        
        let summary = "";
        if (expiries && expiries.length > 0) {
          summary = "Top expiring documents:\n";
          expiries.forEach(doc => {
            const daysUntil = Math.ceil((new Date(doc.expires_on).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            summary += `  • ${doc.name} - ${doc.profiles.full_name} (${daysUntil} days)\n`;
          });
        }
        
        payload = {
          count: expiries?.length || 0,
          summary: summary || "No documents expiring soon",
          adminName: userName,
          url: "/app/admin?tab=due-dates-documents"
        };
        break;
      }
      
      default: {
        // Fallback to sample data for other types
        payload = {
          title: `Test ${notificationType} notification`,
          message: "This is a test notification with sample data",
          learnerName: userName,
          learner_email: userEmail,
          url: "/app/home"
        };
      }
    }

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