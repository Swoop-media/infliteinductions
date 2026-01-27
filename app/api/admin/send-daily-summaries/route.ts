// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

// Type definitions
type AuthorisationWithDueDate = {
  user_id: string;
  user_name: string;
  user_email: string;
  authorisation_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: Date;
  days_until_expiry: number;
  status: string;
};

type DocumentWithDueDate = {
  user_id: string;
  user_name: string;
  user_email: string;
  document_title: string;
  expires_on: string;
  days_until_expiry: number;
  status: string;
};

// Helper function to calculate days until expiry
function calculateDaysUntilExpiry(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper function to determine status
function getStatus(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) return "⚠️ Overdue";
  if (daysUntilExpiry === 0) return "🔴 Expires Today";
  if (daysUntilExpiry <= 7) return "🟡 Expires This Week";
  if (daysUntilExpiry <= 30) return "🟠 Expires This Month";
  return "✅ Current";
}

// Fetch authorisation due dates - uses expires_at field directly
async function fetchAuthorisationDueDates(supabase: any): Promise<AuthorisationWithDueDate[]> {
  const { data, error } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      expires_at,
      approved_at,
      profiles!authorisation_assignments_user_id_fkey (
        id,
        full_name,
        email
      ),
      authorisations (
        id,
        title,
        valid_for_days
      )
    `)
    .eq("assignment_status", "approved")
    .not("expires_at", "is", null);

  console.log("Authorisation query result:", { dataCount: data?.length, error });
  if (error || !data) return [];

  const authorisationsWithDates: AuthorisationWithDueDate[] = [];
  
  for (const assignment of data) {
    if (!assignment.expires_at) continue;
    
    const expiryDate = new Date(assignment.expires_at);
    const daysUntilExpiry = calculateDaysUntilExpiry(expiryDate);
    
    authorisationsWithDates.push({
      user_id: assignment.user_id,
      user_name: assignment.profiles?.full_name || assignment.profiles?.email || "Unknown",
      user_email: assignment.profiles?.email || "",
      authorisation_title: assignment.authorisations?.title || "Unknown Authorisation",
      completed_at: assignment.approved_at || "",
      valid_for_days: assignment.authorisations?.valid_for_days || 0,
      due_date: expiryDate,
      days_until_expiry: daysUntilExpiry,
      status: getStatus(daysUntilExpiry)
    });
  }

  // Sort by days until expiry (ascending - most urgent first)
  return authorisationsWithDates.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

// Fetch document due dates
async function fetchDocumentDueDates(supabase: any): Promise<DocumentWithDueDate[]> {
  const { data, error } = await supabase
    .from("learner_documents")
    .select(`
      id,
      user_id,
      title,
      expires_on,
      profiles!learner_documents_user_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .not("expires_on", "is", null);

  console.log("Document query result:", { dataCount: data?.length, error });
  if (error || !data) return [];

  const documentsWithDates: DocumentWithDueDate[] = [];
  
  for (const doc of data) {
    if (!doc.expires_on) continue;
    
    const expiryDate = new Date(doc.expires_on);
    const daysUntilExpiry = calculateDaysUntilExpiry(expiryDate);
    
    documentsWithDates.push({
      user_id: doc.user_id,
      user_name: doc.profiles?.full_name || doc.profiles?.email || "Unknown",
      user_email: doc.profiles?.email || "",
      document_title: doc.title || "Unknown Document",
      expires_on: doc.expires_on,
      days_until_expiry: daysUntilExpiry,
      status: getStatus(daysUntilExpiry)
    });
  }

  // Sort by days until expiry (ascending - most urgent first)
  return documentsWithDates.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

export async function POST(req: NextRequest) {
  try {
    // Check authorization - only allow if caller is admin or it's a scheduled task
    const authHeader = req.headers.get("authorization");
    const isScheduledTask = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isScheduledTask) {
      const isAdmin = await hasRole("Admin");
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = supabaseAdmin();

    // Get Admin and Senior Management role IDs
    const { data: roles, error: roleError } = await supabase
      .from("roles")
      .select("id, name")
      .in("name", ["Admin", "Senior Management"]);

    if (roleError || !roles || roles.length === 0) {
      return NextResponse.json({ 
        error: "Required roles not found (Admin or Senior Management)", 
        details: roleError?.message 
      }, { status: 404 });
    }

    const roleIds = roles.map(r => r.id);

    // Get all user IDs who have either Admin or Senior Management role
    const { data: userRoles, error: userRoleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role_id", roleIds);

    if (userRoleError || !userRoles || userRoles.length === 0) {
      return NextResponse.json({ 
        error: "No users found with Admin or Senior Management roles", 
        details: userRoleError?.message 
      }, { status: 404 });
    }

    // Deduplicate user IDs (in case someone has both roles)
    const uniqueUserIds = [...new Set(userRoles.map(ur => ur.user_id))];
    
    // Get profile information for all recipient users
    const { data: recipientUsers, error: recipientError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", uniqueUserIds);

    if (recipientError || !recipientUsers || recipientUsers.length === 0) {
      return NextResponse.json({ 
        error: "No users found with Admin or Senior Management roles", 
        details: recipientError?.message 
      }, { status: 404 });
    }

    // Fetch authorisations and documents only (no courses)
    const [allAuthorisations, allDocuments] = await Promise.all([
      fetchAuthorisationDueDates(supabase),
      fetchDocumentDueDates(supabase)
    ]);

    console.log("Fetched data:", { 
      allAuthorisations: allAuthorisations.length, 
      allDocuments: allDocuments.length 
    });

    // Filter to only items due within 30 days or overdue, then limit to top 25
    const upcomingAuthorisations = allAuthorisations.filter(a => a.days_until_expiry <= 30);
    const upcomingDocuments = allDocuments.filter(d => d.days_until_expiry <= 30);
    const topAuthorisations = upcomingAuthorisations.slice(0, 25);
    const topDocuments = upcomingDocuments.slice(0, 25);
    
    console.log("Filtered data:", { 
      upcomingAuthorisations: upcomingAuthorisations.length, 
      upcomingDocuments: upcomingDocuments.length 
    });

    // Send notifications to each Admin and Senior Management user
    const results = [];
    for (const recipient of recipientUsers) {
      try {
        // Build combined daily summary message
        const today = new Date().toLocaleDateString('en-NZ', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        
        let message = `📋 **Daily Expiry Summary**\n`;
        message += `📅 ${today}\n\n`;

        // Authorisations section
        if (topAuthorisations.length > 0) {
          message += `📜 **Authorisations** (${upcomingAuthorisations.length} expiring soon)\n`;
          for (const auth of topAuthorisations) {
            const daysText = auth.days_until_expiry < 0 
              ? `overdue by ${Math.abs(auth.days_until_expiry)} days`
              : `${auth.days_until_expiry} days`;
            message += `• ${auth.authorisation_title} - ${auth.user_name} (${daysText})\n`;
          }
          message += `\n`;
        } else {
          message += `📜 **Authorisations**: No items due within 30 days.\n\n`;
        }

        // Documents section
        if (topDocuments.length > 0) {
          message += `📄 **Documents** (${upcomingDocuments.length} expiring soon)\n`;
          for (const doc of topDocuments) {
            const daysText = doc.days_until_expiry < 0 
              ? `overdue by ${Math.abs(doc.days_until_expiry)} days`
              : `${doc.days_until_expiry} days`;
            message += `• ${doc.document_title} - ${doc.user_name} (${daysText})\n`;
          }
          message += `\n`;
        } else {
          message += `📄 **Documents**: No items due within 30 days.\n\n`;
        }

        message += `View full reports: https://training.inflite.nz/app/admin`;
        
        await sendTeamsDMToAppUser(recipient.id, message);
        
        results.push({
          userId: recipient.id,
          userName: recipient.full_name || recipient.email,
          status: "success",
          messageSent: true,
          itemsFound: upcomingAuthorisations.length + upcomingDocuments.length
        });
      } catch (error) {
        console.error(`Failed to send notifications to user ${recipient.id}:`, error);
        results.push({
          userId: recipient.id,
          userName: recipient.full_name || recipient.email,
          status: "failed",
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        recipientsNotified: recipientUsers.length,
        authorisationsFound: upcomingAuthorisations.length,
        documentsFound: upcomingDocuments.length,
        authorisationsShown: topAuthorisations.length,
        documentsShown: topDocuments.length
      },
      debug: {
        totalAuthorisationsFromDB: allAuthorisations.length,
        totalDocumentsFromDB: allDocuments.length,
        afterFilter30Days: {
          authorisations: upcomingAuthorisations.length,
          documents: upcomingDocuments.length
        }
      },
      results
    });

  } catch (error) {
    console.error("Error sending daily admin summaries:", error);
    return NextResponse.json({ 
      error: "Failed to send daily summaries", 
      details: error.message 
    }, { status: 500 });
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({ 
    status: "healthy",
    endpoint: "/api/admin/send-daily-summaries",
    description: "Daily admin notification summaries endpoint"
  });
}